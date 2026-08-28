"""SAVE.DAT 存档解析器 (2026-08-23 逆向定论, 详见 docs/re-notes-kernel.md)

槽位布局 (槽基址 = i * 0x56C0, 与剧本文件同构!):
  +0x000  0x80B 系统头 (CS:0xCF0 镜像; [0x11]=剧本号0基, [0x3A]=势力数(剧本静态副本,自动槽可能为0))
  +0x040  32B 存档名 (Big5; 全"─"(A1D0×16)=未玩)
  +0x080  0x5240B 主状态块 —— 偏移=剧本文件偏移(DS=文件-0x80), parse_scenario 可直接吃整个槽
  +0x52C0 0x400B 杂项 (语义未逆向)

军团记录 64B @槽+0x2240 ×32 (状态段 DS:0x21C0):
  +0x00 状态位图(≥0x80存活; bit2有命令; bit5战斗中)
  +0x01 势力号
  +0x02 军团长武将序号 (u16le; 实测个别记录为 0xEC 等越界值→web端需容错)
  +0x10/+0x12 当前 x/y (word le)
  +0x20 编制/兵力 (u16le, 实测 69..217 合理)
  +0x08..+0x0F 目标坐标/方向步进包; +0x14..+0x1F 移动残差

注意: 槽头部 [0x11]/[0x3A] 不可靠(实测自动槽值异常)——剧本号用武将名区
(+2..+14, 运行时不变)与四个剧本逐一 diff 取最优(阈值 500)判定;
parse_scenario 依赖的 [0x3A]=势力数 始终用剧本静态值回填。
日期字段未定位(需多存档差分), web 端读档后时钟从剧本起始日重新起算。

输出: web/save.json  {slots:[{slot,label,played,scenario_idx,state}]}
"""

import json
import os
import sys

from parse_sinario import N_SCENARIO, parse_scenario
from parse_sinario import SRC as SINARIO_SRC

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAVE_SRC = os.path.join(BASE, "Dragon", "SAVE.DAT")
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "save.json")

N_SLOT = 4
SLOT_SIZE = 0x56C0
LEGION_BASE = 0x2240  # 槽内偏移 (DS 0x21C0 + 0x80)
N_LEGION = 32
LEGION_SIZE = 64


def big16(b: bytes) -> int:
    return int.from_bytes(b, "little")


def parse_legions(slot: bytes) -> list:
    """32 条军团记录, 只输出存活条目(含 raw 备查)"""
    out = []
    for j in range(N_LEGION):
        r = slot[LEGION_BASE + j * LEGION_SIZE : LEGION_BASE + (j + 1) * LEGION_SIZE]
        if r[0] < 0x80:
            continue
        lead = big16(r[2:4])
        out.append(
            {
                "idx": j,
                "status": r[0],
                "faction": r[1],
                # 越界序号(如 0xEC)原样保留, web 端回退君主
                "leader": None if lead >= 128 else lead,
                "leader_raw": lead,
                "x": big16(r[0x10:0x12]),
                "y": big16(r[0x12:0x14]),
                "troops": big16(r[0x20:0x22]),
                "raw": r.hex(),
            }
        )
    return out


def detect_scenario(slot: bytes, sin: bytes) -> int:
    """武将名区(+2..+14 ×128人) 与各剧本 diff, 返回 0基剧本号"""
    gen = slot[0x42C0 : 0x42C0 + 128 * 32]
    best_i, best_d = -1, 10**9
    for sc_i in range(N_SCENARIO):
        sg = sin[sc_i * SLOT_SIZE + 0x42C0 : sc_i * SLOT_SIZE + 0x42C0 + 128 * 32]
        d = sum(1 for a, b in zip(gen, sg, strict=True) if a != b)
        if d < best_d:
            best_i, best_d = sc_i, d
    assert best_d < 500, f"剧本判定失败: 最小 diff={best_d}"
    return best_i


def main(argv: list[str] | None = None) -> None:
    src = (argv or sys.argv)[1] if len(argv or sys.argv) > 1 else SAVE_SRC
    try:
        with open(src, "rb") as fh:
            d = fh.read()
        with open(SINARIO_SRC, "rb") as fh:
            sin = fh.read()
    except OSError as e:
        raise SystemExit(f"无法读取源文件: {e}") from e
    assert len(d) == N_SLOT * SLOT_SIZE, f"SAVE.DAT 意外大小 {len(d)}"

    slots = []
    for i in range(N_SLOT):
        slot = bytearray(d[i * SLOT_SIZE : (i + 1) * SLOT_SIZE])
        scen = detect_scenario(bytes(slot), sin)
        # 槽头势力数不可靠 → 始终用剧本静态值回填 (parse_scenario 依赖它)
        slot[0x3A] = sin[scen * SLOT_SIZE + 0x3A]
        label_raw = bytes(slot[0x40:0x60])
        label = label_raw.decode("big5", errors="replace").rstrip("\x00")
        played = label.strip("─") != ""
        state = parse_scenario(bytes(slot))
        state["legions"] = parse_legions(bytes(slot))
        # ★可选#3 (2026-08-24): 槽头前 0x3B 字节 = CS:[0xCF0] 全局块原样镜像
        #   (KI.EXE 存盘例程 0x8CFF: 写 CS:[0xCF0] 0x3B 字节到槽+0；读档 0x8CAE 对称读回)
        #   日期字段: +0 word=[本月天数<<8|当日] / +2 [CF2]子刻度 / +3 [CF3]时刻
        #   / +4 月(1..12) / +5 [CF5]未知 / +6 word=年(AD)
        day_word = big16(bytes(slot[0x00:0x02]))
        date = {
            "day": day_word & 0xFF,
            "month": slot[0x04],
            "year": big16(bytes(slot[0x06:0x08])),
        }
        if played and 1 <= date["month"] <= 12 and 190 <= date["year"] <= 999:
            state["save_date"] = date
        # 存档槽头部≠剧本头部布局, tax/trust 语义不可信:
        # 超出原版范围(税率 0..40)或 FF 时置 None → initPlayer 兜底默认值
        if state["tax"] is None or not (0 <= state["tax"] <= 40):
            state["tax"] = None
        slots.append(
            {
                "slot": i,
                "label": label,
                "played": played,
                "scenario_idx": scen,
                "state": state,
            }
        )
        print(
            f"槽{i}: 剧本{scen + 1} played={played} "
            f"军团={len(state['legions'])} 武将={len(state['generals'])}"
        )

    try:
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"slots": slots}, fh, ensure_ascii=False)
    except OSError as e:
        raise SystemExit(f"无法写入 {OUT}: {e}") from e
    print(f"OK -> {os.path.abspath(OUT)} ({os.path.getsize(OUT)} B)")


if __name__ == "__main__":
    main(sys.argv)
