"""Web内容源的校验/编译；只读显式内容目录，不导入DOS解析器。

已命名字段是编辑权威；compatibility记录保留尚未建模的字节，不猜语义。
输出仍是现有运行时格式，规则/数组顺序/原版地址布局均不在此重解释。
"""

import json
import math
import shutil
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

SEASONS = ("spring", "summer", "autumn", "winter")
SOURCE_ROOT = Path(__file__).resolve().parent.parent / "web/content/builtin"


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"cannot read content JSON: {path}") from error


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def source_path(root, relative):
    root = Path(root).resolve()
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root) or candidate == root:
        raise ValueError(f"content path must stay inside source directory: {relative}")
    return candidate


def integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label}: expected integer {low}..{high}, got {value!r}")
    return value


def put(record, offset, value, size=1):
    record[offset : offset + size] = integer(
        value, 0, (1 << (8 * size)) - 1, f"record +{offset:02x}"
    ).to_bytes(size, "little")


def source_chapter(template, chapter_id):
    """导入适配：提取已知编辑字段；原记录只进入独立兼容区。"""
    state = deepcopy(template)
    compatibility = {"cities": [], "factions": []}
    for city in state["cities"]:
        raw = bytes.fromhex(city.pop("raw"))
        compatibility["cities"].append(raw.hex())
        city.pop("x")
        city.pop("y")
        city["initial_flags"] = raw[0] & 0xF0
        # 槽序对应原始四邻顺序；null是无连接，不把邻接当作无序集合。
        city["connections"] = [
            raw[0x1C + i] if raw[0] & (1 << i) else None for i in range(4)
        ]
    for faction in state["factions"]:
        compatibility["factions"].append(faction.pop("raw"))
        for field in ("active", "monarch", "money_hi"):
            faction.pop(field)
    for general in state["generals"]:
        general.pop("active")
        general.pop("is_monarch")
    state.pop("n_factions")
    return {
        "schemaVersion": 1,
        "id": chapter_id,
        "state": state,
        "compatibility": compatibility,
    }


def compile_chapter(document, world_cities):
    if document.get("schemaVersion") != 1 or not document.get("id"):
        raise ValueError("unsupported chapter document")
    state = deepcopy(document["state"])
    compatibility = document["compatibility"]
    if len(state["cities"]) != len(world_cities):
        raise ValueError("chapter/world city count mismatch")
    for city, position in zip(state["cities"], world_cities, strict=True):
        if city["idx"] != position["index"]:
            raise ValueError("chapter/world city slot mismatch")
        city["x"], city["y"] = position["x"], position["y"]
    state["n_factions"] = len(state["factions"])
    for general in state["generals"]:
        general["active"] = bool(general["attr"] & 0x80)
        general["is_monarch"] = bool(general["attr"] & 0x40)
    for faction in state["factions"]:
        faction["active"] = faction["attr"] >= 0x80
        monarch = state["generals"][faction["monarch_idx"]]
        faction["monarch"] = monarch["name"]
    # 当前规则引擎固定槽约束；这是校验而非容量扩展。
    for kind, maximum in (("cities", 192), ("factions", 24), ("generals", 128)):
        records = state[kind]
        if not 0 < len(records) <= maximum:
            raise ValueError(f"{kind}: current engine limit is {maximum}")
        if any(record.get("idx") != i for i, record in enumerate(records)):
            raise ValueError(f"{kind}: runtime slot order must be preserved")
    for kind, size in (("cities", 32), ("factions", 64)):
        if len(compatibility[kind]) != len(state[kind]):
            raise ValueError(f"{kind}: compatibility record count mismatch")
        for record, encoded in zip(state[kind], compatibility[kind], strict=True):
            raw = bytearray.fromhex(encoded)
            if len(raw) != size:
                raise ValueError(f"{kind}: invalid compatibility record size")
            if kind == "cities":
                initial = integer(
                    record.pop("initial_flags"), 0, 255, "city initial_flags"
                )
                if initial & 0xF:
                    raise ValueError(
                        "city initial_flags: low four bits come from connections"
                    )
                connections = record.pop("connections")
                if len(connections) != 4:
                    raise ValueError("city connections must have four ordered slots")
                raw[0] = initial & 0xF0
                for direction, neighbour in enumerate(connections):
                    if neighbour is not None:
                        integer(
                            neighbour, 0, len(state["cities"]) - 1, "city connection"
                        )
                        raw[0] |= 1 << direction
                        raw[0x1C + direction] = neighbour
                for field, offset, width in (
                    ("x", 8, 2),
                    ("y", 10, 2),
                    ("max_prod", 12, 2),
                    ("prod", 14, 2),
                    ("growth", 16, 1),
                    ("defence", 17, 1),
                    ("troops_cap", 18, 1),
                    ("troops", 19, 1),
                ):
                    put(raw, offset, record[field], width)
                put(raw, 1, 0x18 if record["faction"] is None else record["faction"])
                put(
                    raw,
                    0x16,
                    integer(record["view"], 0, 15, "city view") * 16
                    + integer(record["type"], 0, 5, "city type"),
                )
                put(
                    raw,
                    0x19,
                    0xFF if record["governor"] is None else record["governor"],
                )
            else:
                for field, offset, width in (
                    ("attr", 0, 1),
                    ("monarch_idx", 1, 1),
                    ("reserve_cav", 4, 2),
                    ("reserve_arc", 6, 2),
                    ("reserve_inf", 8, 2),
                    ("legion_morale_cap", 0x1D, 1),
                    ("talk_style", 0x1E, 1),
                    ("money", 0x20, 3),
                    ("n_cities", 0x23, 1),
                    ("bellicosity", 0x28, 1),
                    ("march_marker_style", 0x3E, 1),
                ):
                    put(raw, offset, record[field], width)
                for field, offset, sentinel in (
                    ("advisor_idx", 2, 0x7F),
                    ("capital", 3, 0xFF),
                    ("strategic_city_primary", 0x16, 0xFF),
                    ("strategic_city_secondary", 0x17, 0xFF),
                    ("target_faction", 0x19, 0xFF),
                    ("diplomat_idx", 0x2A, 0xFF),
                ):
                    put(
                        raw,
                        offset,
                        sentinel if record[field] is None else record[field],
                    )
                # n_generals的原始计数还包含本势力NPC军师；原版别名读取在运行层。
                advisor_idx = record["advisor_idx"]
                advisor = (
                    state["generals"][advisor_idx] if advisor_idx is not None else None
                )
                advisor_count = (
                    1
                    if advisor is not None and advisor["faction"] == record["idx"]
                    else 0
                )
                put(raw, 0x18, record["n_generals"] + advisor_count)
                record["money_hi"] = raw[0x22]
            record["raw"] = raw.hex()
    if state.get("legions") != []:
        raise ValueError("chapter templates cannot contain runtime legions")
    return state


def load_content(root=SOURCE_ROOT):
    root = Path(root)
    catalog = read_json(root / "catalog.json")
    if (
        catalog.get("schemaVersion") != 1
        or catalog.get("rules") != "ki-1995"
        or not isinstance(catalog.get("id"), str)
        or not catalog["id"]
        or not isinstance(catalog.get("revision"), str)
        or not catalog["revision"]
        or not catalog.get("chapters")
    ):
        raise ValueError("unsupported content catalog")
    world = read_json(source_path(root, catalog["world"]))
    chapters = []
    ids = set()
    for index, entry in enumerate(catalog["chapters"]):
        if (
            entry["legacyScenarioIndex"] != index
            or not isinstance(entry["id"], str)
            or not entry["id"]
            or entry["id"] in ids
            or type(entry.get("official")) is not bool
        ):
            raise ValueError(
                "duplicate chapter identity or changed legacy scenario order"
            )
        ids.add(entry["id"])
        document = read_json(source_path(root, entry["file"]))
        if document["id"] != entry["id"]:
            raise ValueError("chapter identity mismatch")
        chapters.append(compile_chapter(document, world["cities"]))
    if (
        world.get("schemaVersion"),
        world.get("width"),
        world.get("height"),
        world.get("tileSize"),
    ) != (1, 384, 256, 16):
        raise ValueError("current engine requires a 384x256 world of 16px tiles")
    tileset = read_json(source_path(root, world["tileset"]))
    layout = read_json(source_path(root, world["layout"]))
    if len(layout) != world["height"] or any(
        len(row) != world["width"] for row in layout
    ):
        raise ValueError("world layout dimensions mismatch")
    if [tile["index"] for tile in tileset["tiles"]] != list(range(256)):
        raise ValueError("tile index order is part of the current rule profile")
    for row in layout:
        for tile in row:
            integer(tile, 0, 255, "layout tile")
    roads = read_json(source_path(root, world["roads"]))
    if roads.get("version") != 1 or len(roads["nodes"]) != 192:
        raise ValueError("current engine requires 192 road nodes")
    if (
        len(world["cities"]) != 192
        or len({city["id"] for city in world["cities"]}) != 192
    ):
        raise ValueError("current world requires 192 unique city identities")
    for index, node in enumerate(roads["nodes"]):
        if node["id"] != index:
            raise ValueError("road node order must match node IDs")
        position = world["cities"][index]
        integer(position["x"], 0, world["width"] - 1, "city x")
        integer(position["y"], 0, world["height"] - 1, "city y")
        if (node["x"], node["y"]) != (position["x"], position["y"]):
            raise ValueError("world city positions and road nodes disagree")
    for index, edge in enumerate(roads["edges"]):
        if edge["id"] != index:
            raise ValueError("road edge order must match edge IDs")
        integer(edge["source"], 0, 191, "edge source")
        integer(edge["target"], 0, 191, "edge target")
        if (
            not edge["points"]
            or type(edge["weight"]) not in (int, float)
            or not math.isfinite(edge["weight"])
            or edge["weight"] <= 0
        ):
            raise ValueError("invalid road edge geometry/weight")
        for index, point in enumerate(edge["points"]):
            integer(point["x"], 0, world["width"] - 1, "road point x")
            integer(point["y"], 0, world["height"] - 1, "road point y")
            boundary = 0xCE <= layout[point["y"]][point["x"]] <= 0xDD
            if boundary != (index == 0 or index == len(edge["points"]) - 1):
                raise ValueError(
                    "road endpoint/interior disagrees with city-boundary tile semantics"
                )
    if (
        len(source_path(root, world["roadCost"]).read_bytes())
        != world["width"] * world["height"]
    ):
        raise ValueError("road-cost dimensions mismatch")
    read_json(source_path(root, world["roadOffset"]))
    xs = [c["x"] for s in chapters for c in s["cities"]]
    ys = [c["y"] for s in chapters for c in s["cities"]]
    data = {
        "meta": {"x_range": [min(xs), max(xs)], "y_range": [min(ys), max(ys)]},
        "scenarios": chapters,
    }
    return catalog, data, world, tileset, layout, roads


def render_world(root, world, tileset, layout):
    """源图集+布局→四季整图；不读MMAP.MDL/GAMEPAL.BRG。"""
    with Image.open(source_path(root, tileset["indexedAtlas"])) as source:
        if source.mode != "P" or source.size != (256, 256):
            raise ValueError("expected 256x256 indexed tile atlas")
        atlas = source.copy()
    tiles = []
    for tile in tileset["tiles"]:
        x, y, width, height = tile["rect"]
        if width != 16 or height != 16 or not (0 <= x <= 240 and 0 <= y <= 240):
            raise ValueError("invalid atlas crop")
        tiles.append(atlas.crop((x, y, x + width, y + height)))
    image = Image.new("P", (world["width"] * 16, world["height"] * 16))
    for y, row in enumerate(layout):
        for x, tile in enumerate(row):
            image.paste(tiles[tile], (x * 16, y * 16))
    for season in SEASONS:
        palette = tileset["palettes"][season]
        if len(palette) != 48:
            raise ValueError("expected 16 RGB colors")
        for channel in palette:
            integer(channel, 0, 255, "palette channel")
        seasonal = image.copy()
        seasonal.putpalette(palette + [0] * (768 - len(palette)))
        yield season, seasonal


def compile_content(root, output, *, maps=True):
    catalog, data, world, tileset, layout, roads = load_content(root)
    output = Path(output)
    # 完成校验/渲染后才发布；坏源不能先覆盖data.json，再在地图阶段报错。
    with TemporaryDirectory(prefix="wolong-content-compile-") as temporary:
        stage = Path(temporary)
        write_json(stage / "data.json", data)
        write_json(stage / "content/builtin/catalog.json", catalog)
        (stage / "mmap_map.bin").write_bytes(
            bytes(tile for row in layout for tile in row)
        )
        write_json(stage / "road_graph.json", roads)
        for field, filename in (
            ("roadCost", "road_cost.bin"),
            ("roadOffset", "road_offset.json"),
        ):
            (stage / filename).write_bytes(source_path(root, world[field]).read_bytes())
        if maps:
            for season, image in render_world(root, world, tileset, layout):
                image.save(stage / f"map_tiles_{season}.png", optimize=True)
        for file in stage.rglob("*"):
            if file.is_file():
                target = output / file.relative_to(stage)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, target)
    return catalog
