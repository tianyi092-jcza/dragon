"""SAVE.DAT 存档解析器 (2026-08-23 逆向定论, 详见 docs/re-notes-kernel.md)

槽位布局 (槽基址 = i * 0x56C0, 与剧本文件同构!):
  +0x000  0x80B 系统头 (CS:0xCF0 镜像; [0x11]=剧本号0基, [0x3A]=势力数(剧本静态副本,自动槽可能为0))
  +0x040  32B 存档名 (Big5; 全"─"(A1D0×16)=未玩)
  +0x080  0x5240B 主状态块 —— 偏移=剧本文件偏移(DS=文件-0x80), parse_scenario 可直接吃整个槽
  +0x52C0 0x400B 杂项 (语义未逆向)

军团记录 64B @槽+0x22C0 ×128 (内存状态段 DS:0x2240；槽文件前置0x80B头):
  +0x00 状态位图(≥0x80存活; bit2有命令; bit5战斗中)
  +0x01 势力号；+0x02 军团长武将序号 u16le（军团槽与武将槽一一对应）
  +0x04 总兵力；+0x06 士气
  +0x10/+0x12 当前 x/y (word le)
  +0x28+i*4 六单位记录：+1兵力、+2兵种(1..3，4为空)
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
from pathlib import Path

from parse_sinario import N_SCENARIO, parse_scenario
from parse_sinario import SRC as SINARIO_SRC

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAVE_SRC = os.path.join(BASE, "Dragon", "SAVE.DAT")
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "save.json")

N_SLOT = 4
SLOT_SIZE = 0x56C0
LEGION_BASE = 0x22C0  # 槽文件偏移；运行时状态段内偏移为0x2240
N_LEGION = 128
LEGION_SIZE = 64


def big16(b: bytes) -> int:
    return int.from_bytes(b, "little")


def parse_legions(slot: bytes) -> tuple[list, list]:
    """128 条军团槽：返回活动军团与0x2977延迟回归队列。"""
    out = []
    delayed_returns = []
    for j in range(N_LEGION):
        r = slot[LEGION_BASE + j * LEGION_SIZE : LEGION_BASE + (j + 1) * LEGION_SIZE]
        delayed_return = r[0] == 0x08 and r[0x03] > 0
        if delayed_return:
            lead = big16(r[2:4])
            delayed_returns.append(
                {
                    "leader": lead if lead < 128 else None,
                    "generalIdx": lead if lead < 128 else None,
                    "faction": r[1],
                    "countdown": r[0x03],
                }
            )
            continue
        # 0x474A：即使存活位已置，士气(+6)或首单位兵力(+0x29)为0时
        # 也不能作为可继续行动的军团；status=8 则是0x2977延迟回归槽。
        if not delayed_return and (r[0] < 0x80 or r[0x06] == 0 or r[0x29] == 0):
            continue
        lead = big16(r[2:4])
        units = [
            {
                # Web 编成/战术层统一以“人”为单位；军团记录以十人为单位。
                "troops": r[0x29 + unit_idx * 4] * 10,
                "type": r[0x2A + unit_idx * 4],
            }
            for unit_idx in range(6)
        ]
        out.append(
            {
                "idx": j,
                "slot": j,
                "status": r[0],
                "faction": r[1],
                "leader": lead if lead < 128 else None,
                "leader_raw": lead,
                "x": big16(r[0x10:0x12]),
                "y": big16(r[0x12:0x14]),
                "troops": big16(r[0x04:0x06]),
                "morale": r[0x06],
                "units": units,
                "returnCountdown": r[0x03] if delayed_return else None,
                "_active": not delayed_return,
                # 正常战略标识：+9=势力 march_marker_style*5，+8=西/东/北/南/驻止帧。
                "marker_base": r[0x09],
                "marker_frame": r[0x08],
                "raw": r.hex(),
            }
        )
    return out, delayed_returns


def detect_scenario(slot: bytes, sin: bytes) -> int:
    """只比较128名武将的姓名/字号静态字节，返回0基剧本号。"""
    best_i, best_d = -1, 10**9
    for sc_i in range(N_SCENARIO):
        scenario = sin[sc_i * SLOT_SIZE : (sc_i + 1) * SLOT_SIZE]
        d = 0
        for general_idx in range(128):
            start = 0x42C0 + general_idx * 32 + 2
            d += sum(
                a != b
                for a, b in zip(
                    slot[start : start + 12], scenario[start : start + 12], strict=True
                )
            )
        if d < best_d:
            best_i, best_d = sc_i, d
    if best_d >= 500:
        raise ValueError(f"剧本判定失败: 最小姓名diff={best_d}")
    return best_i


def main(argv: list[str] | None = None) -> None:
    src = (argv or sys.argv)[1] if len(argv or sys.argv) > 1 else SAVE_SRC
    allowed_root = Path(BASE).resolve()
    try:
        source_path = allowed_root / Path(src).resolve().relative_to(allowed_root)
        scenario_path = allowed_root / Path(SINARIO_SRC).resolve().relative_to(
            allowed_root
        )
    except ValueError as error:
        raise SystemExit(f"输入路径必须位于项目目录内: {src}") from error
    try:
        d = source_path.read_bytes()
        sin = scenario_path.read_bytes()
    except OSError as e:
        raise SystemExit(f"无法读取源文件: {e}") from e
    if len(d) != N_SLOT * SLOT_SIZE:
        raise SystemExit(f"SAVE.DAT 意外大小 {len(d)}")

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
        state["legions"], state["delayedLegionReturns"] = parse_legions(bytes(slot))
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

    output_path = allowed_root / Path(OUT).resolve().relative_to(allowed_root)
    try:
        output_path.write_text(
            json.dumps({"slots": slots}, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as e:
        raise SystemExit(f"无法写入 {output_path}: {e}") from e
    print(f"OK -> {output_path} ({output_path.stat().st_size} B)")


if __name__ == "__main__":
    main(sys.argv)
