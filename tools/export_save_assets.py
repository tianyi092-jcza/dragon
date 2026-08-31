"""导出仅供离线逆向分析使用的原版剧本模板与 Big5 字表。

输出位置由 ``DRAGON_ANALYSIS_OUT`` 指定（默认 ``.dragon-analysis/``），绝不写入
Web 发布目录。正式 Web 游戏不读取、打包或依赖 DOS SAVE.DAT/SINARIO 模板；它只保存
玩家浏览器 IndexedDB 中的 Web 状态快照。
"""

import base64
import json
import os
from pathlib import Path

from parse_sinario import N_SCENARIO, SOURCES

HERE = os.path.dirname(__file__)
WEB = os.path.join(HERE, "..", "web")
BASE = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.normpath(
    os.environ.get("DRAGON_ANALYSIS_OUT", os.path.join(HERE, "..", ".dragon-analysis"))
)

SC_SIZE = 0x56C0

# 收集已发布静态资源文本；不包含运行时存档。
TEXT_SOURCES = ["data.json", "talk.json", "battle_maps.json"]


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

    bm = build_big5_map(collect_chars())
    os.makedirs(OUT, exist_ok=True)
    scen_out = os.path.join(OUT, "scen_raw.json")
    big5_out = os.path.join(OUT, "big5_map.json")
    out_scen = {"scenario_size": SC_SIZE, "slots": slots}
    dump_json(scen_out, out_scen)
    dump_json(big5_out, bm)

    print(f"OK {scen_out}={os.path.getsize(scen_out)}B big5_map={len(bm)}chars")


if __name__ == "__main__":
    main()
