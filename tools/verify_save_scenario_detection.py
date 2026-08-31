"""内存fixture验证SAVE章节号、章节静态start与全20章映射；不写真实SAVE。"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

spec = importlib.util.spec_from_file_location(
    "parse_save_scenario_fixture", ROOT / "tools" / "parse_save.py"
)
if not spec or not spec.loader:
    raise RuntimeError("cannot import parse_save.py fixture")
parse_save = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parse_save)

library = parse_save.load_scenario_library(ROOT.parent)
if len(library) != 20:
    raise RuntimeError(f"expected 20 scenarios, got {len(library)}")

# 第五章(全局索引4)与其它相邻章节共享大量武将，但SAVE头部0x11必须保留全局章号。
slot = bytearray(library[4])
slot[0x11] = 4
slot[0x00:0x08] = bytes([22, 31, 0, 0, 5, 0, 201, 0])
slot[0x11] = 4
if parse_save.detect_scenario(bytes(slot), library) != 4:
    raise RuntimeError("valid global scenario header was not preserved")

# 头部损坏时回退姓名/字号最小diff。
slot[0x11] = 0xFF
if parse_save.detect_scenario(bytes(slot), library) != 4:
    raise RuntimeError("name-diff scenario fallback failed")

# parse_scenario直接吃SAVE槽会把运行时日历误当章节start；加载链必须改用模板start。
parsed_slot = parse_save.parse_scenario(bytes(slot))
parsed_template = parse_save.parse_scenario(library[4])
if parsed_slot["start"] == parsed_template["start"]:
    raise RuntimeError("fixture did not distinguish runtime date from static start")
if parsed_template["start"] != {"year": 196, "month": 4, "day": 1}:
    raise RuntimeError(f"unexpected chapter start: {parsed_template['start']}")

print(
    "save scenario detection OK: global chapter index + static start use 20-chapter library"
)
