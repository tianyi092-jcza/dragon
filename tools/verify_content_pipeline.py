"""内容源无损编译与编辑权威回归；禁止访问任何原版目录或SAVE文件。"""

import json
import math
import os
import shutil
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from content_pipeline import (
    SEASONS,
    SOURCE_ROOT,
    compile_chapter,
    compile_content,
    load_content,
    read_json,
    source_path,
    write_json,
)
from PIL import Image, ImageChops

WEB = Path(__file__).resolve().parent.parent / "web"
DOS_BASE = WEB.parent.parent
FORBIDDEN = [
    (DOS_BASE / name).resolve() for name in ("Dragon", "原版", "上", "中", "下", "后")
]


def forbid_dos_access(event, args):
    if event != "open" or not isinstance(args[0], (str, bytes, os.PathLike)):
        return
    path = Path(os.fsdecode(args[0])).resolve()
    if path.name.upper() == "SAVE.DAT" or any(
        path.is_relative_to(root) for root in FORBIDDEN
    ):
        raise PermissionError(f"test attempted original-data access: {path}")


sys.addaudithook(forbid_dos_access)

catalog, data, world, tileset, layout, roads = load_content()
assert data == read_json(WEB / "data.json")
assert roads == read_json(WEB / "road_graph.json")
assert len(catalog["chapters"]) == 20
assert len(tileset["tiles"]) == 256
assert (
    bytes(tile for row in layout for tile in row) == (WEB / "mmap_map.bin").read_bytes()
)

# 编辑已命名字段，不手改compatibility；编译结果的所有现有raw消费者必须看到新值。
document = read_json(SOURCE_ROOT / catalog["chapters"][0]["file"])
original = deepcopy(document)
document["state"]["cities"][0]["prod"] = 1234
document["state"]["cities"][0]["type"] = 2
document["state"]["factions"][0]["money"] = 0x012345
monarch = document["state"]["factions"][0]["monarch_idx"]
document["state"]["generals"][monarch]["name"] = "编译测试"
changed_world = deepcopy(world["cities"])
changed_world[0]["x"] += 1
compiled = compile_chapter(document, changed_world)
raw = bytes.fromhex(compiled["cities"][0]["raw"])
assert int.from_bytes(raw[8:10], "little") == changed_world[0]["x"]
assert int.from_bytes(raw[14:16], "little") == 1234
assert raw[0x16] & 15 == 2
assert (
    int.from_bytes(bytes.fromhex(compiled["factions"][0]["raw"])[0x20:0x23], "little")
    == 0x012345
)
assert compiled["factions"][0]["monarch"] == "编译测试"
assert document["compatibility"] == original["compatibility"], (
    "compiler must not mutate unknown byte provenance"
)
assert "raw" not in document["state"]["cities"][0]
assert "x" not in document["state"]["cities"][0], (
    "world coordinates have one editable source"
)

for invalid in ("../escape.json", str(WEB / "data.json")):
    try:
        source_path(SOURCE_ROOT, invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("source path escaped content root")

with TemporaryDirectory(prefix="wolong-native-content-test-") as temporary:
    root = Path(temporary)
    isolated_source = root / "source"
    shutil.copytree(SOURCE_ROOT, isolated_source)
    output = root / "compiled"
    compile_content(isolated_source, output)
    assert read_json(output / "data.json") == data
    assert read_json(output / "content/builtin/catalog.json") == catalog
    for name in ("mmap_map.bin", "road_cost.bin", "road_offset.json"):
        assert (output / name).read_bytes() == (WEB / name).read_bytes(), name
    for season in SEASONS:
        filename = f"map_tiles_{season}.png"
        with (
            Image.open(output / filename) as actual,
            Image.open(WEB / filename) as expected,
        ):
            assert actual.size == expected.size
            assert (
                ImageChops.difference(
                    actual.convert("RGB"), expected.convert("RGB")
                ).getbbox()
                is None
            ), filename
    # 非标准JSON常量不能发布成浏览器无法解析的产物。
    with unittest.TestCase().assertRaises(ValueError):
        write_json(output / "invalid.json", {"value": math.nan})
    assert not (output / "invalid.json").exists()
    # 坏图集导致编译失败时，不得先覆盖已发布的数据。
    (output / "data.json").write_text("existing output", encoding="utf-8")
    broken = deepcopy(tileset)
    broken["palettes"]["winter"] = [999] * 48
    write_json(isolated_source / world["tileset"], broken)
    try:
        compile_content(isolated_source, output)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid palette was accepted")
    assert (output / "data.json").read_text(encoding="utf-8") == "existing output"
    write_json(isolated_source / world["tileset"], tileset)
    # 编译器与运行图安装器都要求有限正数权重；坏源不能覆盖已发布文件。
    road_source = isolated_source / world["roads"]
    for weight in (0, -1, True, "1", None, math.nan, math.inf, -math.inf):
        broken_roads = deepcopy(roads)
        broken_roads["edges"][0]["weight"] = weight
        # 非有限值是刻意构造的非法JSON输入，不能用拒绝它们的write_json生成。
        road_source.write_text(json.dumps(broken_roads), encoding="utf-8")
        with unittest.TestCase().assertRaises(ValueError):
            compile_content(isolated_source, output, maps=False)
        assert (output / "data.json").read_text(encoding="utf-8") == "existing output"
    write_json(road_source, roads)
    broken_world = deepcopy(world)
    broken_world["cities"][0]["x"] += 1
    write_json(isolated_source / catalog["world"], broken_world)
    try:
        load_content(isolated_source)
    except ValueError:
        pass
    else:
        raise AssertionError("inconsistent world/road coordinates were accepted")

print(
    "native content OK: 20 exact chapters, named-field edits, 256 atlas tiles, four pixel-identical maps; no DOS access"
)
