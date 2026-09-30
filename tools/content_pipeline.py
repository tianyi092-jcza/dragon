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
    compatibility = {
        "cities": [],
        "factions": [],
        "nativeFactionSlotRaw": state.pop("nativeFactionSlotRaw"),
        "nativeDiplomacyRaw": state.pop("nativeDiplomacyRaw"),
        "nativeStrategicEventRaw": state.pop("nativeStrategicEventRaw"),
        "nativeMonthlyPolicyRaw": state.pop("nativeMonthlyPolicyRaw"),
    }
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
    native_factions = compatibility.get("nativeFactionSlotRaw")
    if not isinstance(native_factions, list) or len(native_factions) != 22:
        raise ValueError("native faction table must contain 22 slots")
    for index, encoded in enumerate(native_factions):
        try:
            raw = bytes.fromhex(encoded)
        except (TypeError, ValueError) as error:
            raise ValueError(f"native faction slot {index}: invalid hex") from error
        if len(raw) != 64:
            raise ValueError(f"native faction slot {index}: invalid record size")
    state["nativeFactionSlotRaw"] = list(native_factions)
    native_diplomacy = compatibility.get("nativeDiplomacyRaw")
    if not isinstance(native_diplomacy, str):
        raise ValueError("native diplomacy matrix must be hex")
    try:
        native_diplomacy_bytes = bytes.fromhex(native_diplomacy)
    except ValueError as error:
        raise ValueError("native diplomacy matrix: invalid hex") from error
    if len(native_diplomacy_bytes) != 24 * 24:
        raise ValueError("native diplomacy matrix must contain 24x24 bytes")
    state["nativeDiplomacyRaw"] = native_diplomacy.lower()
    native_events = compatibility.get("nativeStrategicEventRaw")
    if not isinstance(native_events, str):
        raise ValueError("native strategic event wheel must be hex")
    try:
        native_event_bytes = bytes.fromhex(native_events)
    except ValueError as error:
        raise ValueError("native strategic event wheel: invalid hex") from error
    if len(native_event_bytes) != 0x400:
        raise ValueError("native strategic event wheel must contain 0x400 bytes")
    state["nativeStrategicEventRaw"] = native_events.lower()
    native_policy = compatibility.get("nativeMonthlyPolicyRaw")
    if not isinstance(native_policy, str):
        raise ValueError("native monthly policy block must be hex")
    try:
        native_policy_bytes = bytes.fromhex(native_policy)
    except ValueError as error:
        raise ValueError("native monthly policy block: invalid hex") from error
    if len(native_policy_bytes) != 0x10:
        raise ValueError("native monthly policy block must contain 0x10 bytes")
    state["nativeMonthlyPolicyRaw"] = native_policy.lower()
    expected_policy = bytes([state["tax"], 0]) + b"".join(
        (value // 10).to_bytes(2, "little") for value in state["conscription"]
    )
    expected_next_policy = bytes([state["next_tax"], 0]) + b"".join(
        (value // 10).to_bytes(2, "little") for value in state["next_conscription"]
    )
    # D09/D11 are unknown compatibility bytes: compare only named positions and
    # require displayed troop values to be exact multiples of the original unit.
    if any(value % 10 for value in state["conscription"] + state["next_conscription"]):
        raise ValueError("native monthly conscription view must use units of ten")
    if (
        native_policy_bytes[0] != expected_policy[0]
        or native_policy_bytes[2:8] != expected_policy[2:8]
        or native_policy_bytes[8] != expected_next_policy[0]
        or native_policy_bytes[10:16] != expected_next_policy[2:8]
    ):
        raise ValueError("native monthly policy named fields diverge from raw bytes")
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
    # P30/P34 native别名读者消费静态章节城记录字节（原 D52:0840..203F=192×32B）。
    # 从已命名编辑字段回写后的raw派生；源文档若手写陈旧副本必须拒绝，防分叉。
    derived_city_raw = [record["raw"] for record in state["cities"]]
    existing_city_raw = state.get("nativeCityRecordRaw")
    if existing_city_raw is not None and existing_city_raw != derived_city_raw:
        raise ValueError("native city record raw diverges from named city fields")
    if len(derived_city_raw) != 192:
        raise ValueError("native city record table must contain 192 records")
    state["nativeCityRecordRaw"] = derived_city_raw
    if state.get("legions") != []:
        raise ValueError("chapter templates cannot contain runtime legions")
    return state


def e961_class(tile):
    """KI.EXE 0xE961 connectable-tile classifier (march §5.4).

    B8..B9 -> 01, BA..CA -> 00 (CA additionally OR 0x80), CB..D3 -> 03,
    D4..DD -> 04; anything else is not a construction step. Same windows as
    tools/probe_march_topology.classify_connectable, restated here so the
    content pipeline gains no new module dependency."""
    if not 0xB8 <= tile <= 0xDD:
        return None
    kind = 1
    if tile >= 0xBA:
        kind = 0
        if tile >= 0xCB:
            kind = 3
            if tile >= 0xD4:
                kind = 4
    if tile == 0xCA:
        kind |= 0x80
    return kind


def validate_original_road_content(roads):
    """Staged v2 Web asset profile, not KI's handling of malformed live RAM.

    E717..E81B record widths and 4A21..4A4E reciprocal tags; march notes §3.9.
    Keep ordered explicit fields; never derive byte cost/flags/tags from v1.
    """
    if (roads.get("width"), roads.get("height")) != (384, 256):
        raise ValueError("invalid original road content dimensions")
    nodes, edges = roads["nodes"], roads["edges"]
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("original road nodes/edges must be arrays")
    if len(nodes) != 192 or 0x800 + len(edges) * 16 > 0x2000:
        raise ValueError("original road records exceed address regions")
    coordinates = set()
    seen = set()
    for index, node in enumerate(nodes):
        if integer(node["id"], 0, 191, "road node id") != index:
            raise ValueError("road node order must match node IDs")
        coordinates.add(
            (integer(node["x"], 0, 383, "node x"), integer(node["y"], 0, 255, "node y"))
        )
        if not isinstance(node.get("edgeSlots"), list) or len(node["edgeSlots"]) != 4:
            raise ValueError("original road node requires four ordered tags")
        for tag in node["edgeSlots"]:
            integer(tag, 0, 65535, "road tag")
            if tag == 0:
                continue
            selector, pointer = tag & 0xC000, tag & 0x3FFF
            if (
                selector not in (0x4000, 0x8000)
                or pointer < 0x800
                or pointer >= 0x800 + len(edges) * 16
                or (pointer - 0x800) % 16
            ):
                raise ValueError("invalid original road tag selector/pointer")
            edge_id = (pointer - 0x800) // 16
            endpoint = "source" if selector == 0x4000 else "target"
            if edges[edge_id][endpoint] != index or (edge_id, selector) in seen:
                raise ValueError("original road duplicate or mismatched endpoint tag")
            seen.add((edge_id, selector))
    if len(coordinates) != 192 or len(seen) != 2 * len(edges):
        raise ValueError("original road duplicate coordinates or missing endpoint tag")
    point_address = 0x2000
    for index, edge in enumerate(edges):
        if integer(edge["id"], 0, len(edges) - 1, "edge id") != index:
            raise ValueError("road edge order must match edge IDs")
        source = integer(edge["source"], 0, 191, "edge source")
        target = integer(edge["target"], 0, 191, "edge target")
        if source == target:
            raise ValueError("original road self-loop")
        integer(edge["weight"], 0, 255, "original road byte cost")
        points = edge["points"]
        if not isinstance(points, list) or not points:
            raise ValueError("original road edge requires points")
        point_address += len(points) * 4
        if point_address > 0x8000:
            raise ValueError("original road points overlap search workspace")
        for point in points:
            integer(point["x"], 0, 383, "road point x")
            integer(point["y"], 0, 255, "road point y")
            integer(point["flags"], 0, 255, "road point flags")
        for field, axis, limit, extreme in (
            ("minX", "x", 65535, min),
            ("maxX", "x", 65535, max),
            ("minY", "y", 255, min),
            ("maxY", "y", 255, max),
        ):
            value = integer(edge["bounds"][field], 0, limit, "road bounds")
            if value != extreme(point[axis] for point in points):
                raise ValueError("original road bounds disagree with points")


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
    if roads.get("version") not in (1, 2) or len(roads["nodes"]) != 192:
        raise ValueError("current engine requires version 1/2 and 192 road nodes")
    if roads["version"] == 2:
        validate_original_road_content(roads)
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
            or (roads["version"] == 1 and edge["weight"] <= 0)
            # v2 cost is the native E717 point-count-minus-one (P57): a count
            # cannot be negative, but zero is not forbidden by any closed rule.
            or (roads["version"] == 2 and edge["weight"] < 0)
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
        if roads["version"] == 2:
            # A-ROAD-1 construction-discipline gate (certified in
            # tools/verify_road_construction_cert.mjs against original-binary
            # output: 5526 flags). E841/E961 flags: first 0x44, last 0x04,
            # interior E961(tile). A flag disagreeing with its own tile is
            # internally inconsistent, so the pipeline rejects it here.
            # Byte COSTS stay curated-trust (the pinned test requires the
            # full 0..255 domain to load): cost==len-1 fidelity is certified
            # at the derivation level, not re-derived by this gate.
            # Tile-level trace rerun on edited tiles stays G-ROAD remainder.
            for index, point in enumerate(edge["points"]):
                tile = layout[point["y"]][point["x"]]
                if index == 0:
                    expected_flag = 0x44
                elif index == len(edge["points"]) - 1:
                    expected_flag = 0x04
                else:
                    expected_flag = e961_class(tile)
                if point.get("flags") != expected_flag:
                    raise ValueError(
                        "v2 road point flag disagrees with E841/E961 classes"
                    )
            # A-ROAD-1 disconnect refusal: each endpoint must be a D4..DD
            # port tile, cardinally aligned with its endpoint city center at
            # distance 1..2 (certified 508/508 in
            # tools/verify_road_construction_cert.mjs). A geometrically
            # disconnected edge (truncated mid-field, wrong-city port) is
            # accurately rejected here instead of silently loaded.
            for point, node in (
                (edge["points"][0], roads["nodes"][edge["source"]]),
                (edge["points"][-1], roads["nodes"][edge["target"]]),
            ):
                tile = layout[point["y"]][point["x"]]
                dx, dy = point["x"] - node["x"], point["y"] - node["y"]
                cardinal = (dx == 0 or dy == 0) and (dx, dy) != (0, 0)
                if not (
                    0xD4 <= tile <= 0xDD
                    and cardinal
                    and 1 <= max(abs(dx), abs(dy)) <= 2
                ):
                    raise ValueError(
                        "v2 road endpoint is not a port of its city"
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


def render_atlases(root, tileset):
    """Canonical index-ordered seasonal atlases for Web chunk rendering."""
    with Image.open(source_path(root, tileset["indexedAtlas"])) as source:
        if source.mode != "P" or source.size != (256, 256):
            raise ValueError("expected 256x256 indexed tile atlas")
        atlas = Image.new("P", (256, 256))
        for tile in tileset["tiles"]:
            x, y, width, height = tile["rect"]
            if width != 16 or height != 16 or not (0 <= x <= 240 and 0 <= y <= 240):
                raise ValueError("invalid atlas crop")
            index = tile["index"]
            atlas.paste(source.crop((x, y, x + 16, y + 16)), ((index % 16) * 16, (index // 16) * 16))
        for season in SEASONS:
            palette = tileset["palettes"][season]
            if len(palette) != 48:
                raise ValueError("expected 16 RGB colors")
            for channel in palette:
                integer(channel, 0, 255, "palette channel")
            image = atlas.copy()
            image.putpalette(palette + [0] * (768 - len(palette)))
            yield season, image


def compile_content(root, output, *, maps=True):
    catalog, data, world, tileset, layout, roads = load_content(root)
    output = Path(output)
    # v2 is the default road content since the P58 gate flip (native E717
    # weights/costs/flags replace the v1 approximation). The compiler still
    # stages everything in a temp dir and only publishes validated output.
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
            for season, image in render_atlases(root, tileset):
                image.save(stage / f"map_atlas_{season}.png", optimize=True)
            for season, image in render_world(root, world, tileset, layout):
                image.save(stage / f"map_tiles_{season}.png", optimize=True)
        for file in stage.rglob("*"):
            if file.is_file():
                target = output / file.relative_to(stage)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, target)
    return catalog
