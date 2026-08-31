"""导出存盘功能所需素材 (2026-08-24)

1. web/scen_raw.json — 与 data.json 同顺序的 20 章 0x56C0 槽模板(base64)
   + 当前 SAVE.DAT 全文件 base64。新游戏序列化以当前章节模板为底版；
   从存档继续则以所读槽为底版；SAVE.DAT 底版用于保留未覆盖的其它槽位。
2. web/big5_map.json — 游戏文本中出现的全部字符 → Big5 双字节映射(存档名编码用)。

输出均为紧凑 JSON; 字符表来源于 data.json / talk.json / save.json 的全部字符串。
"""

import base64
import json
import os
from pathlib import Path

from parse_sinario import N_SCENARIO, SOURCES

HERE = os.path.dirname(__file__)
WEB = os.path.join(HERE, "..", "web")
BASE = os.path.normpath(os.path.join(HERE, "..", ".."))

SAVE_SRC = os.path.join(BASE, "Dragon", "SAVE.DAT")

SC_SIZE = 0x56C0
N_SAVE_SLOT = 4

# 收集字符的数据源
TEXT_SOURCES = ["data.json", "talk.json", "save.json", "battle_maps.json"]


def load_json(path: str):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        print(f"跳过 {path}: {e}")
        return None


def dump_json(path: str, obj) -> None:
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, separators=(",", ":"), ensure_ascii=False)
    except OSError as e:
        raise SystemExit(f"无法写入 {path}: {e}") from e


def read_bin(path: str) -> bytes:
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError as e:
        raise SystemExit(f"无法读取 {path}: {e}") from e


def collect_chars() -> set:
    chars = set()
    for name in TEXT_SOURCES:
        obj = load_json(os.path.join(WEB, name))
        if obj is None:
            continue

        def walk(v):
            if isinstance(v, str):
                chars.update(v)
            elif isinstance(v, list):
                for x in v:
                    walk(x)
            elif isinstance(v, dict):
                for k, x in v.items():
                    chars.add(k)  # big5_map 自身键也是字符
                    walk(x)

        walk(obj)
    # 数字/字母/常用符号兜底
    chars.update("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ./:-_")
    return chars


def build_big5_map(chars: set) -> dict:
    m = {}
    for ch in sorted(chars):
        try:
            b = ch.encode("big5")
        except UnicodeEncodeError:
            continue
        if len(b) == 1:
            m[ch] = [b[0]]  # ASCII 单字节
        elif len(b) == 2:
            m[ch] = list(b)
    return m


def main() -> None:
    slots = []
    for source_name in SOURCES:
        path = Path(BASE, source_name, "SINARIO.DAT")
        sin = read_bin(str(path))
        expected = N_SCENARIO * SC_SIZE
        if len(sin) > expected:
            raise SystemExit(f"SINARIO.DAT 意外大小 {len(sin)}: {path}")
        # 与 parse_sinario/parse_save 一致：已知「下」尾部缺2字节时补零。
        if len(sin) < expected:
            sin += b"\x00" * (expected - len(sin))
        slots.extend(
            base64.b64encode(sin[i * SC_SIZE : (i + 1) * SC_SIZE]).decode()
            for i in range(N_SCENARIO)
        )

    save_b64 = ""
    if os.path.exists(SAVE_SRC):
        d = read_bin(SAVE_SRC)
        if len(d) == N_SAVE_SLOT * SC_SIZE:
            save_b64 = base64.b64encode(d).decode()
        else:
            print(f"SAVE.DAT 大小异常 {len(d)}, 跳过底版")

    bm = build_big5_map(collect_chars())
    out_scen = {"scenario_size": SC_SIZE, "slots": slots, "save_b64": save_b64}
    dump_json(os.path.join(WEB, "scen_raw.json"), out_scen)
    dump_json(os.path.join(WEB, "big5_map.json"), bm)

    print(
        f"OK scen_raw.json={os.path.getsize(os.path.join(WEB, 'scen_raw.json'))}B "
        f"big5_map={len(bm)}chars"
    )


if __name__ == "__main__":
    main()
