"""
卧龙传 SINARIO.DAT 解析器
格式来源: jiangsheng 的逆向文档 (https://jiangsheng.readthedocs.io/en/latest/games/dragon/index.html)
输出: web/data.json
"""

import json
import os
from pathlib import Path

# 20 章战役合集: 上(1-4章) + 中(5-8章) + 下(9-12章) + 后(13-16章) + 原版(厂商原版 4 章)
# 各目录 SINARIO.DAT = 4×22208B 剧本块, 拼接合并; 游戏运行数据为 Dragon/Dragon/SINARIO.DAT(=中)
# 原版章节名与合集重叠(第一章~第四章), 加 [原版] 前缀区分
BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCES = ["上", "中", "下", "后", "原版"]
PREFIX = {"原版": "[原版]"}
SRC = os.path.join(BASE, "Dragon", "SINARIO.DAT")  # 兼容保留(单文件模式)
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "data.json")

SC_SIZE = 22208
N_SCENARIO = 4
OFF_FACTION = 0x80  # 势力区 24×64B
OFF_CITY = 0x8C0  # 城池区 200×32B
OFF_LEGION = 0x22C0  # 军团区 64B×128 (jiangsheng 完整文档+逆向 state 0x2240 双重实证)
OFF_GENERAL = 0x42C0  # 武将区 128×32B


def big5(b: bytes) -> str:
      """Big5 解码并去掉 A140 填充空格"""
      return b.decode("big5", "replace").replace("\ua140", "").strip("\u3000\x00 ")


def u16(b):
      return int.from_bytes(b, "little")


def parse_scenario(sc: bytes):
      out = {}

      # ---- 头部 ----
      out["name"] = big5(sc[0x40:0x60])
      out["start"] = {"year": sc[6], "month": sc[4], "day": sc[3]}
      out["n_factions"] = sc[0x3A]
      # 玩家头部字段 (→ CS:0xCFF玩家势力/0xD00信赖度/0xD08税率, 见 game-mechanics.md)
      out["player_faction"] = sc[0xF]
      out["trust"] = sc[0x10]
      out["tax"] = sc[0x18]
      out["conscription"] = [
            u16(sc[0x1A:0x1C]) * 10,
            u16(sc[0x1C:0x1E]) * 10,
            u16(sc[0x1E:0x20]) * 10,
      ]
      out["next_tax"] = sc[0x20]
      out["next_conscription"] = [
            u16(sc[0x22:0x24]) * 10,
            u16(sc[0x24:0x26]) * 10,
            u16(sc[0x26:0x28]) * 10,
      ]

      # ---- 武将 (128 × 32B) ----
      generals = []
      for i in range(128):
            g = sc[OFF_GENERAL + i * 32 : OFF_GENERAL + (i + 1) * 32]
            name = big5(g[2:8])
            if not name:
                  break
            generals.append(
                  {
                        "idx": i,
                        "attr": g[0],
                        "active": bool(g[0] & 0x80),
                        "is_monarch": bool(g[0] & 0x40),
                        "portrait": g[1],
                        "name": name,
                        "hao": big5(g[8:14]),
                        "ability": {  # 高四位有效
                              "siege": g[0x0E] >> 4,
                              "field": g[0x0F] >> 4,
                              "naval": g[0x10] >> 4,
                              # 武力/统率/政治取低4位 (jiangsheng文档: 高四位为0, max 0x0F)
                              "force": g[0x11] & 0xF,
                              "lead": g[0x12] & 0xF,
                              "politics": g[0x13] & 0xF,
                        },
                        # 0x4C72/0x291A 使用的原始武将战斗/去向修正字节；
                        # 精确产品名尚未闭合，保留原值供指令级算法使用。
                        "battle_rating": g[0x1F],
                        # 外交/内政执行进度预算。0x3E8E 读 +0x1A；
                        # 外交官任命时原版以0起步，批准预算后按金额换算回该字节。
                        "assignment_budget": g[0x1A],
                        "status": g[0x17],
                        "talk_idx": g[0x1E],
                        "captive_flag": g[0x1D],
                        "appear_months": g[0x18],
                        "join_faction": g[0x19] if g[0x19] != 0xFF else None,
                        "faction": g[0x1C] if g[0x1C] != 0xFF else None,
                  }
            )
      out["generals"] = generals

      # ---- 势力 (24 × 64B) ----
      factions = []
      for i in range(24):
            f = sc[OFF_FACTION + i * 64 : OFF_FACTION + (i + 1) * 64]
            if i >= out["n_factions"]:
                  break
            m_idx = f[1]
            factions.append(
                  {
                        "idx": i,
                        "attr": f[0],
                        "active": f[0] >= 0x80,
                        "monarch": generals[m_idx]["name"]
                        if m_idx < len(generals)
                        else "?",
                        # 君主武将索引(权威，来自势力记录 byte[1])；portrait 取该武将的画像
                        "monarch_idx": m_idx,
                        # 军师索引(势力记录 byte[2], 0x7F=无军师→开局列表显示---)
                        # 实证: 孫策→周瑜/劉備→孫乾/馬騰→韓遂/呂布→陳宮/張繡→賈詡 与原版开局列表一致
                        "advisor_idx": f[2] if f[2] != 0x7F else None,
                        "capital": f[3] if f[3] != 0xFF else None,
                        # 武将数需扣除势力军师(NPC 军师不占武将名额)
                        "n_generals": max(
                              0,
                              f[0x18]
                              - (
                                    1
                                    if f[2] != 0x7F
                                    and f[2] < len(generals)
                                    and generals[f[2]]["faction"] == i
                                    else 0
                              ),
                        ),
                        # 24bit 资金 (word + 高位字节; 实证: 何進 8464+1×65536=74000)
                        "money": u16(f[0x20:0x22]) + (f[0x22] << 16),
                        "money_hi": f[0x22],
                        # 预备兵三兵种池 (原版资源面板 騎/弓/步; 势力记录 bytes 4/6/8)
                        "reserve_cav": u16(f[4:6]),
                        "reserve_arc": u16(f[6:8]),
                        "reserve_inf": u16(f[8:10]),
                        "n_cities": f[0x23],
                        "bellicosity": f[0x28],
                        "target_faction": f[0x19] if f[0x19] != 0xFF else None,
                        "talk_style": f[0x1E],
                        # 战略地图军团标识样式槽。KI.EXE 0x6FD2: legion[+9]=f[+0x3E]*5；
                        # 0x2B2A 再加四方向/驻止帧 0..4。槽 0..23 图案与颜色均来自 MMAP.MCH。
                        "march_marker_style": f[0x3E],
                  }
            )
      out["factions"] = factions

      # ---- 城池 (200 × 32B) ----
      cities = []
      for i in range(200):
            c = sc[OFF_CITY + i * 32 : OFF_CITY + (i + 1) * 32]
            name = big5(c[2:8])
            if not name:
                  break
            fac = c[1]
            t = c[0x16] & 0x0F
            cities.append(
                  {
                        "idx": i,
                        "name": name,
                        # 0x18(24) 表示空城
                        "faction": None if fac == 0x18 else fac,
                        "x": u16(c[8:10]),
                        "y": u16(c[10:12]),
                        "max_prod": u16(c[0x0C:0x0E]),
                        "prod": u16(c[0x0E:0x10]),
                        "growth": c[0x10],
                        "defence": c[0x11],
                        "troops": c[0x13],
                        "troops_cap": c[0x12],
                        "type": t,
                        # 城市视图图号: raw[0x16]>>4 → web/grf/kyo_XX.png (KI.EXE 0x7F21 加载器)
                        "view": c[0x16] >> 4,
                        # 原始32字节(hex)——字段语义持续修订中,web端按需解码(见docs/re-notes-kernel.md)
                        "raw": c.hex(),
                        "governor": c[0x19] if c[0x19] != 0xFF else None,
                  }
            )
      out["cities"] = cities

      # ---- ★0x21C0 区已破解(2026-08-23 二次逆向, 详见 re-notes-kernel.md) ----
      # KI.EXE 存档流(0x8CAE)证明：剧本文件=4×0x56C0 静态场景镜像+0x80B 头，不含军团；
      # 运行时军团在状态段 DS:0x2240；SAVE 槽文件因前置0x80B头而位于0x22C0。
      # 军团记录64B：+1势力、+2军团长字节（+3为接敌倒计时）、+4总兵力、+6士气、+10/+12当前坐标，
      # +28+i*4为六单位（+1兵力、+2兵种）。
      # 剧本文件同偏移的 32B 条目是「初始行军路线点表」(+4/+6=地图坐标 word)，非军团。
      out["legions"] = []
      # ---- ★外交友好度矩阵 @0x680 (game-mechanics.md: 每势力24B) ----
      # 对角线FF；未登场势力0x80；活跃对默认0xB7(中立)，实测范围 0x94(恶劣)..0xE4(友好)
      n = out["n_factions"]
      out["diplomacy"] = [
            list(sc[0x680 + i * 24 : 0x680 + i * 24 + n]) for i in range(n)
      ]
      return out


def main():
      data = []
      base_dir = Path(BASE).resolve()
      for src_dir in SOURCES:
            path = (base_dir / src_dir / "SINARIO.DAT").resolve()
            if not path.is_relative_to(base_dir):
                  continue
            try:
                  with open(str(path), "rb") as fh:  # nosec
                        d = fh.read()
            except OSError as e:
                  raise SystemExit(f"无法读取源文件 {path}: {e}") from e
            if len(d) != N_SCENARIO * SC_SIZE:
                  # 容错: 尾部截断(如「下」少2字节)补零, 超长则报错
                  if len(d) > N_SCENARIO * SC_SIZE:
                        raise SystemExit(f"意外的大小 {len(d)}: {path}")
                  d = d + b"\x00" * (N_SCENARIO * SC_SIZE - len(d))
            for i in range(N_SCENARIO):
                  sc = parse_scenario(d[i * SC_SIZE : (i + 1) * SC_SIZE])
                  sc["_src"] = src_dir
                  data.append(sc)
      # 原版章节加前缀
      for s in data:
            pre = PREFIX.get(s.get("_src", ""))
            if pre:
                  s["name"] = pre + s["name"]

      # 坐标范围（全剧本一致）
      xs = [c["x"] for s in data for c in s["cities"]]
      ys = [c["y"] for s in data for c in s["cities"]]
      meta = {"x_range": [min(xs), max(xs)], "y_range": [min(ys), max(ys)]}

      out_file = Path(__file__).resolve().parent.parent / "web" / "data.json"
      try:
            out_file.write_text(
                  json.dumps({"meta": meta, "scenarios": data}, ensure_ascii=False),
                  encoding="utf-8",
            )
      except OSError as e:
            raise SystemExit(f"无法写入输出文件 {OUT}: {e}") from e
      print(f"OK -> {os.path.abspath(OUT)}")
      print("坐标范围:", meta)


if __name__ == "__main__":
      main()
