"""一次性离线导入器：原版非存档素材 + 已认证道路资产 → 可编辑Web内容源。

必须指定一个不存在的输出目录，不覆盖已编辑内容或运行产物。绝不读取SAVE。
"""

import argparse
import hashlib
import shutil
from pathlib import Path

from content_pipeline import (
    SEASONS,
    compile_chapter,
    read_json,
    source_chapter,
    write_json,
)
from parse_sinario import BASE, SOURCES, read_scenarios
from PIL import Image
from render_map import load_palette, load_tiles

WEB = Path(__file__).resolve().parent.parent / "web"
GROUP_IDS = dict(
    zip(SOURCES, ("upper", "middle", "lower", "later", "original"), strict=True)
)


def import_content(output):
    output = Path(output)
    if output.exists():
        raise ValueError("refusing to overwrite an existing content directory")
    data = read_scenarios()
    # 本次导入必须无损复现已发行20章；不以生成物证明原版机制。
    if data != read_json(WEB / "data.json"):
        raise ValueError(
            "DOS import differs from current data.json; audit before importing"
        )
    cities = [
        {"id": f"city-{c['idx']:03d}", "index": c["idx"], "x": c["x"], "y": c["y"]}
        for c in data["scenarios"][0]["cities"]
    ]
    for chapter in data["scenarios"]:
        if [(c["idx"], c["x"], c["y"]) for c in chapter["cities"]] != [
            (c["index"], c["x"], c["y"]) for c in cities
        ]:
            raise ValueError(
                "chapter world positions differ; cannot merge world definitions"
            )
    output.mkdir(parents=True)
    catalog = {
        "schemaVersion": 1,
        "id": "wolong-builtin",
        "revision": "1",
        "rules": "ki-1995",
        "world": "world/world.json",
        "chapters": [],
    }
    counters = {}
    for index, template in enumerate(data["scenarios"]):
        group = GROUP_IDS[template["_src"]]
        counters[group] = counters.get(group, 0) + 1
        chapter_id = f"{group}-{counters[group]}"
        document = source_chapter(template, chapter_id)
        if compile_chapter(document, cities) != template:
            raise ValueError(f"chapter round trip changed fields: {chapter_id}")
        entry = {
            "id": chapter_id,
            "file": f"chapters/{chapter_id}.json",
            "legacyScenarioIndex": index,
            "official": group == "original",
        }
        catalog["chapters"].append(entry)
        write_json(output / entry["file"], document)
    world = {
        "schemaVersion": 1,
        "id": "mmap-original",
        "width": 384,
        "height": 256,
        "tileSize": 16,
        "tileset": "world/tileset.json",
        "layout": "world/layout.json",
        "roads": "world/roads.json",
        "roadCost": "world/road-cost.bin",
        "roadOffset": "world/road-offset.json",
        "cities": cities,
    }
    write_json(output / "world/world.json", world)
    tileset = {
        "schemaVersion": 1,
        "id": "mmap-original-tiles",
        "indexedAtlas": "world/atlas.png",
        "palettes": {season: load_palette(i) for i, season in enumerate(SEASONS)},
        "tiles": [
            {
                "id": f"mmap-{i:03d}",
                "index": i,
                "rect": [(i % 16) * 16, (i // 16) * 16, 16, 16],
                "anchor": [0, 0],
                "opaque": True,
            }
            for i in range(256)
        ],
    }
    write_json(output / "world/tileset.json", tileset)
    atlas = Image.new("P", (256, 256))
    atlas.putpalette(tileset["palettes"]["summer"] + [0] * (768 - 48))
    for index, tile in enumerate(load_tiles()):
        for y, row in enumerate(tile):
            for x, color in enumerate(row):
                atlas.putpixel(((index % 16) * 16 + x, (index // 16) * 16 + y), color)
    atlas.save(output / "world/atlas.png")
    layout = (WEB / "mmap_map.bin").read_bytes()
    if len(layout) != 384 * 256:
        raise ValueError("invalid imported map layout")
    write_json(
        output / "world/layout.json",
        [list(layout[y * 384 : (y + 1) * 384]) for y in range(256)],
    )
    for old, new in (
        ("road_graph.json", "roads.json"),
        ("road_cost.bin", "road-cost.bin"),
        ("road_offset.json", "road-offset.json"),
    ):
        shutil.copyfile(WEB / old, output / "world" / new)
    sources = [Path(BASE) / directory / "SINARIO.DAT" for directory in SOURCES]
    sources += [Path(BASE) / "Dragon" / name for name in ("MMAP.MDL", "GAMEPAL.BRG")]
    sources += [
        WEB / name
        for name in (
            "data.json",
            "mmap_map.bin",
            "road_graph.json",
            "road_cost.bin",
            "road_offset.json",
        )
    ]
    write_json(
        output / "provenance.json",
        {
            "note": "Import provenance only; not a runtime dependency or a rules proof.",
            "sha256": {
                str(path.relative_to(Path(BASE))): hashlib.sha256(
                    path.read_bytes()
                ).hexdigest()
                for path in sources
            },
        },
    )
    write_json(output / "catalog.json", catalog)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="new content source directory (must not exist)",
    )
    args = parser.parse_args()
    try:
        import_content(args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Import failed: {error}\n")
    print(f"Imported editable Web content to {args.output}")
