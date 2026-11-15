"""Read-only S0 atom evidence; writes only a new isolated report directory.

Uses the existing Pillow/Capstone offline-tool dependencies. Never imports resource writers,
reads saves, changes registered assets, or assigns visual categories as rules.
"""
import hashlib
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from html import escape

from PIL import Image
from decode_mmap import rle_decode
from audit_map_city_sprite_sources import inspect_city_sources

ROOT = Path(__file__).resolve().parents[1]
SEASONS = ("spring", "summer", "autumn", "winter")


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isascii() or not all(
        char.isalnum() or char == "-" for char in sys.argv[1]
    ) or not 1 <= len(sys.argv[1]) <= 48:
        raise SystemExit("usage: python -B tools/audit_map_sprite_atoms.py <new-round>")
    output = ROOT / ".dragon-analysis" / ("sprite-atoms-" + sys.argv[1])
    if output.exists():
        raise SystemExit("refusing to overwrite existing audit directory")
    inputs = {
        name: (ROOT.parent / "Dragon" / name).read_bytes()
        for name in ("MMAP.MDL", "MMAP.MAP", "GAMEPAL.BRG", "KI.EXE")
    }
    inputs["SINARIO.DAT"] = (ROOT.parent / "原版/SINARIO.DAT").read_bytes()
    native_city = inspect_city_sources(inputs)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    mdl = inputs["MMAP.MDL"]
    assert len(mdl) == 32768
    assert sha(mdl) == "2fa1dd1b1ec7c426cf22583334a62dc61bdb1f1cefc59cbe8e9827480d118d1d"
    layout = rle_decode(inputs["MMAP.MAP"])
    assert len(layout) == 384 * 256
    assert layout == (ROOT / "web/mmap_map.bin").read_bytes()
    assert sha(layout) == "740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861"
    # Reuse the authoritative read-only validator rather than duplicating the
    # installed manifest/compiler contract in Python. No template store is read.
    registration = json.loads(subprocess.run(
        ["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readInstalledEditorSource } from './tools/editor_builtin_source.mjs';
const source = readInstalledEditorSource();
const paths = ['tools/editor_builtin_source.mjs',
  'web/src/content/builtinresources.generated.js',
  `web/content/builtin/compiled/${source.revision}/manifest.json`];
const provenance = Object.fromEntries(paths.map(path => {
  const bytes = readFileSync(path);
  return [path, { size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') }];
}));
process.stdout.write(JSON.stringify({ revision: source.revision,
  seasonAtlases: source.editorAssets.seasonAtlases, provenance }));
"""], cwd=ROOT, check=True, stdout=subprocess.PIPE, text=True,
    ).stdout)
    counts = Counter(layout)
    # Human review of decoded MDL pixels plus original MAP context. These are
    # four candidate labels, not a range classifier or a placement certificate.
    samples = [
        {"id": "mountain", "label": "山地候選", "seedByte": 112},
        {"id": "river", "label": "河道候選", "seedByte": 6},
        {"id": "wall", "label": "牆段候選", "seedByte": 248},
        {"id": "field", "label": "農田候選", "seedByte": 180},
    ]
    candidates = {sample["seedByte"]: sample["id"] for sample in samples}
    atoms = []
    visual_groups = defaultdict(list)
    atlas_images = {}
    palette = inputs["GAMEPAL.BRG"]
    assert len(palette) >= 4 * 48
    for season_index, season in enumerate(SEASONS):
        path = ROOT / "web" / f"map_atlas_{season}.png"
        inputs[f"web/{path.name}"] = path.read_bytes()
        registered = registration["seasonAtlases"][season]
        assert registered["path"] == path.name, (season, "registered atlas path")
        assert registered["byteLength"] == len(inputs[f"web/{path.name}"]), season
        assert registered["sha256"] == sha(inputs[f"web/{path.name}"]), (
            season, "loose atlas differs from validated registered atlas")
        with Image.open(path) as image:
            assert image.size == (256, 256) and image.mode == "P"
            atlas_images[season] = (image.copy(), image.convert("RGB"))
        # Existing offline palette mapping (render_map.py), checked against bytes.
        chan = lambda value: (((((value & 15) << 4) * 16 + 128) >> 8) << 2) * 255 // 60
        colors = [tuple(chan(palette[season_index * 48 + i * 3 + channel])
                        for channel in (1, 2, 0)) for i in range(16)]
        actual = atlas_images[season][0].getpalette()
        assert actual[:48] == [channel for color in colors for channel in color], season
    for tile in range(256):
        raw = mdl[tile * 128:(tile + 1) * 128]
        indices = bytes(sum(((raw[plane * 32 + y * 2 + x // 8] >> (7 - x % 8)) & 1) << plane
                            for plane in range(4))
                        for y in range(16) for x in range(16))
        box = (tile % 16 * 16, tile // 16 * 16, tile % 16 * 16 + 16, tile // 16 * 16 + 16)
        seasonal = {}
        for season in SEASONS:
            indexed, rgb = atlas_images[season]
            assert indexed.crop(box).tobytes() == indices, (season, tile)
            seasonal[season] = sha(rgb.crop(box).tobytes())
        visual_groups[tuple(seasonal.values())].append(tile)
        atoms.append({
            "byte": tile, "resource": "MMAP.MDL", "offset": tile * 128,
            "length": 128, "rawSha256": sha(raw), "indicesSha256": sha(indices),
            "seasonRgbSha256": seasonal, "mapOccurrences": counts[tile],
            "sourceConfidence": "verified-resource-bytes",
            "candidateCategory": candidates.get(tile),
            "categoryConfidence": "visual-candidate" if tile in candidates else "unknown",
            "disposition": "pending-identification", "placementSupport": "not-certified-by-this-audit",
        })
    # Resolve present Web destinations separately from original-byte confidence.
    # Unknown categories remain unknown even when the advanced viewer retains them.
    catalog_paths = ("editor-ui/src/mapspritecatalog.json", "editor-ui/src/mapbasepresets.json")
    catalogs = []
    for path in catalog_paths:
        inputs[path] = (ROOT / path).read_bytes()
        catalogs.append(json.loads(inputs[path]))
    catalog, base_catalog = catalogs
    assert catalog["schema"] == "map-sprite-catalog-1"
    assert base_catalog["schema"] == "map-base-presets-1"
    assert catalog["sourceRevision"] == registration["revision"]
    destinations = {}
    for item in catalog["items"]:
        tile = item["tile"]
        assert type(tile) is int and 0 <= tile < 256 and tile not in destinations
        atom, source = atoms[tile], item["source"]
        assert source["resource"] == "MMAP.MDL" and source["offset"] == atom["offset"]
        assert source["byteLength"] == atom["length"] and source["sha256"] == atom["rawSha256"]
        assert source["seasonRgbSha256"] == atom["seasonRgbSha256"]
        assert item["support"] in ("existing-decoration", "reference-only")
        destinations[tile] = {
            "disposition": "catalog-reference" if item["support"] == "existing-decoration" else "read-only-reference",
            "catalogItemId": item["itemId"], "catalogRevision": catalog["catalogRevision"],
            "webCategory": item["category"], "webSupport": item["support"],
        }
    for item in catalog["components"] + catalog["recipes"]:
        tiles, source = item["tiles"], item["source"]
        assert (item["support"], item["geographyEffect"]) in (("existing-decoration", "preserve-underlay"), ("reference-only", "unresolved"))
        assert item["anchor"] == [0, 0] and item["footprint"] == [[x, y] for x, y, _ in tiles]
        width, height = max(x for x, _, _ in tiles) + 1, max(y for _, y, _ in tiles) + 1
        assert 1 < len(tiles) <= 256 and 1 <= width <= 16 and 1 <= height <= 16
        assert all(type(x) is int and type(y) is int and type(tile) is int
                   and 0 <= x < 16 and 0 <= y < 16 and 0 <= tile <= 255 for x, y, tile in tiles)
        assert item["footprint"] == [list(cell) for cell in sorted({(x, y) for x, y, _ in tiles}, key=lambda cell: (cell[1], cell[0]))]
        # Missing cells are transparent in the product. Zero RGB is only the
        # deterministic hash carrier; the exact footprint remains authoritative.
        assert source.get("rgbHoleCarrier") == ([0, 0, 0] if len(tiles) < width * height else None)
        assert source["layoutSha256"] == sha(layout)
        witnesses = [[x, y] for y in range(257 - height) for x in range(385 - width)
                     if all(layout[(y + dy) * 384 + x + dx] == tile for dx, dy, tile in tiles)]
        assert witnesses and source["firstWitness"] == witnesses[0] and source["occurrences"] == len(witnesses)
        for season in SEASONS:
            image = Image.new("RGB", (width * 16, height * 16))
            for x, y, tile in tiles:
                left, top = tile % 16 * 16, tile // 16 * 16
                image.paste(atlas_images[season][1].crop((left, top, left + 16, top + 16)), (x * 16, y * 16))
            assert source["seasonRgbSha256"][season] == sha(image.tobytes())
        for tile in dict.fromkeys(tile for _, _, tile in tiles):
            # Match the product's per-byte summary: any existing-decoration
            # reference takes precedence, without promoting the read-only recipe.
            if tile not in destinations or (destinations[tile]["webSupport"] == "reference-only"
                                            and item["support"] == "existing-decoration"):
                destinations.setdefault(tile, {}).update({
                    "disposition": "catalog-reference" if item["support"] == "existing-decoration" else "read-only-reference", "catalogItemId": item["itemId"],
                    "catalogRevision": catalog["catalogRevision"],
                    "webCategory": item["category"], "webSupport": item["support"],
                })
            destinations[tile].setdefault("componentItemIds", []).append(item["itemId"])
    for item_id, item in base_catalog["items"].items():
        tile = item["fill"]["tile"]
        assert type(tile) is int and 0 <= tile < 256
        assert destinations.get(tile, {}).get("disposition") != "base-preset"
        atom, source = atoms[tile], item["source"]
        assert source["revision"] == registration["revision"]
        assert source["resource"] == "MMAP.MDL" and source["byteOffset"] == atom["offset"]
        assert source["byteLength"] == atom["length"] and source["sha256"] == atom["rawSha256"]
        assert source["seasonRgbSha256"] == atom["seasonRgbSha256"]
        # Match the product: base use has summary priority, while all recipe
        # references remain recorded; a reference does not change base geography.
        destinations.setdefault(tile, {}).update({
            "disposition": "base-preset", "catalogItemId": item_id,
            "catalogRevision": base_catalog["catalogRevision"],
            "webCategory": "explicit-base", "webSupport": item["support"],
        })
    # An explicit display-only retention decision, not a category or rule grant.
    # Retention cannot hide a registered/default item. Native color parts need
    # the fixed KI/official-data certificate, not pixel similarity or map absence.
    for group in catalog["advancedRetention"]:
        tiles, source = group["tiles"], group["source"]
        assert len(tiles) >= 2 and len(set(tiles)) == len(tiles)
        assert all(type(tile) is int and 0 <= tile < 256 and tile not in destinations for tile in tiles)
        assert source["resource"] == "MMAP.MDL" and source["layoutSha256"] == sha(layout)
        if group["reason"] == "unused-visual-duplicate":
            assert source["offsets"] == [atoms[tile]["offset"] for tile in tiles]
            assert source["mapOccurrences"] == 0
            for tile in tiles:
                atom = atoms[tile]
                assert atom["mapOccurrences"] == 0 and source["byteLength"] == atom["length"]
                assert source["sha256"] == atom["rawSha256"] and source["seasonRgbSha256"] == atom["seasonRgbSha256"]
        else:
            assert group["reason"] == "native-city-color-parts"
            assert source["resourceSha256"] == sha(mdl)
            assert source["nativeInputSha256"] == {name: native_city["inputs"][name]["sha256"]
                for name in ("KI.EXE", "SINARIO.DAT")}
            assert source["nativeWindow"] == {key: native_city["windows"][0][key]
                for key in ("start", "endExclusive", "sha256")}
            pairs = [[row["c01DiffersFromCff"], row["c01EqualsCff"]] for row in native_city["cornerPairs"]]
            assert source["pairs"] == pairs
            assert tiles == sorted(tile for pair in pairs for tile in pair if tile not in destinations)
        for tile in tiles:
            destinations[tile] = {
                "disposition": "advanced-retained", "catalogItemId": None,
                "catalogRevision": catalog["catalogRevision"], "webCategory": None, "webSupport": "advanced-read-only",
                "retentionGroupId": group["groupId"], "retentionReason": group["reason"], "retentionNote": group["note"],
            }
    for atom in atoms:
        atom.update(destinations.get(atom["byte"], {
            "disposition": "pending-identification", "catalogItemId": None,
            "catalogRevision": None, "webCategory": None, "webSupport": "advanced-read-only",
        }))
        atom["advancedReference"] = True
    disposition_counts = dict(sorted(Counter(atom["disposition"] for atom in atoms).items()))
    catalog_items = catalog["items"] + catalog["components"] + catalog["recipes"]
    assert len({item["itemId"] for item in catalog_items}) == len(catalog_items)
    existing_items = catalog["items"] + catalog["components"]
    assert len({item["definitionRef"] for item in existing_items}) == len(existing_items)
    assert all("definitionRef" not in item and "definitionRevision" not in item
               and item["ruleRecipeRef"] == "ki-byte-stamp-1" for item in catalog["recipes"])
    # These are observed arrangements of existing items, not generated recipes.
    by_id = {item["itemId"]: item for item in catalog_items}
    examples = []
    assert len({example["exampleId"] for example in catalog["examples"]}) == len(catalog["examples"])
    for example in catalog["examples"]:
        cells = {}
        for placement in example["placements"]:
            item = by_id[placement["itemId"]]
            assert item["category"] == example["category"]
            assert all(type(placement[key]) is int and 0 <= placement[key] < 16 for key in ("x", "y"))
            for dx, dy, tile in item.get("tiles", [[0, 0, item.get("tile")]]):
                key = (placement["x"] + dx, placement["y"] + dy)
                assert max(key) < 16 and (key not in cells or cells[key] == tile)
                cells[key] = tile  # Identical overlaps are explicit, not double cells.
        width, height = max(x for x, _ in cells) + 1, max(y for _, y in cells) + 1
        witnesses = [[x, y] for y in range(257 - height) for x in range(385 - width)
                     if all(layout[(y + dy) * 384 + x + dx] == tile for (dx, dy), tile in cells.items())]
        assert witnesses and example["source"] == {"firstWitness": witnesses[0], "occurrences": len(witnesses)}
        examples.append({**example, "size": [width, height],
                         "referenceOnly": any(by_id[p["itemId"]]["support"] == "reference-only" for p in example["placements"]),
                         "cells": [[x, y, cells[x, y]] for x, y in sorted(cells, key=lambda cell: (cell[1], cell[0]))]})
    report = {
        "schema": "map-sprite-atom-audit-1",
        "boundary": "Resource equivalence and fixed native city color-family provenance only; no new author rule, geography, natural-object grouping or placement certification. All 256 original byte identities retained. Four-season equal RGB is visual similarity, not strict component identity.",
        "scriptSha256": sha(Path(__file__).read_bytes()),
        "inputs": {name: {"size": len(data), "sha256": sha(data)} for name, data in inputs.items()},
        "registration": registration,
        "registrationBoundary": "Installed descriptor, 38 manifest asset identities and existing common-compiler parity validated by readInstalledEditorSource; all four loose atlases match registered bytes. Not a live template/copy audit or a transitive code inventory.",
        "layoutSha256": sha(layout), "atoms": atoms,
        "catalog": {"revision": catalog["catalogRevision"], "items": len(catalog_items),
                    "multiCellItems": len(catalog["components"]) + len(catalog["recipes"]),
                    "materializedRecipes": sum(item["support"] == "existing-decoration" for item in catalog["recipes"]),
                    "referenceRecipes": sum(item["support"] == "reference-only" for item in catalog["recipes"]),
                    "support": dict(sorted(Counter(item["support"] for item in catalog_items).items())),
                    "boundary": "Existing-definition reuse and explicit Web recipes are separate. Strict reuse: verify_map_sprite_catalog.mjs; atomic materialization: verify_map_sprite_materialization.mjs. No DOS object identity grant."},
        "summary": {"atoms": len(atoms), "used": len(counts), "pendingIdentification": disposition_counts.get("pending-identification", 0),
                    "dispositions": disposition_counts,
                    "strictAtomicIdentities": len(atoms), "strictDuplicateGroups": 0,
                    "visualGroups": len(visual_groups), "visuallyReviewedCandidates": len(candidates)},
        "strictIdentityBoundary": "Only atomic identity (original byte included); no multi-cell recipes have been normalized or deduplicated.",
        "fourSeasonVisualDuplicates": [tiles for tiles in visual_groups.values() if len(tiles) > 1],
    }
    # Enumerate actual MAP neighbours, never wrap a row or infer connectivity.
    # The witness is the first source coordinate in row-major order.
    adjacency = {}
    for y in range(256):
        for x in range(384):
            cell = y * 384 + x
            for axis, dx, dy in (("east", 1, 0), ("south", 0, 1)):
                if x + dx >= 384 or y + dy >= 256:
                    continue
                first, second = layout[cell], layout[(y + dy) * 384 + x + dx]
                key = (axis, first, second)
                if key not in adjacency:
                    adjacency[key] = {"axis": axis, "bytes": [first, second],
                                      "occurrences": 0, "firstWitness": [x, y]}
                adjacency[key]["occurrences"] += 1
    adjacency_rows = [adjacency[key] for key in sorted(adjacency)]
    output.mkdir(parents=True, exist_ok=False)  # ignored parent may be absent; existing runs still refuse overwrite
    (output / "adjacency.json").write_text(json.dumps({
        "schema": "map-sprite-observed-adjacency-1",
        "sourceRevision": registration["revision"],
        "layoutSha256": sha(layout), "scriptSha256": report["scriptSha256"],
        "boundary": "Ordered original MAP neighbours only. East is left-to-right; south is top-to-bottom. No row wrapping, rotation, inferred connectivity, seamlessness or placement certification. Absence is not proof of an invalid combination.",
        "totals": {axis: sum(row["occurrences"] for row in adjacency_rows if row["axis"] == axis)
                   for axis in ("east", "south")},
        "pairs": adjacency_rows,
    }, indent=2) + "\n", encoding="utf-8")
    (output / "inventory.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    example_cards = []
    for example in examples:
        images, figures = {}, []
        width, height = example["size"]
        for season in SEASONS:
            image = Image.new("RGBA", (width * 16, height * 16), (0, 0, 0, 0))
            for x, y, tile in example["cells"]:
                left, top = tile % 16 * 16, tile // 16 * 16
                image.paste(atlas_images[season][1].crop((left, top, left + 16, top + 16)).convert("RGBA"), (x * 16, y * 16))
            name = f'example-{example["exampleId"]}-{season}.png'
            image.save(output / name)
            images[season] = {"path": name, "rgbaSha256": sha(image.tobytes())}
            figures.append(f'<figure><figcaption>{season}</figcaption><img src="{name}" width="{width * 16}" height="{height * 16}" alt="{escape(example["name"])}"></figure>')
        example["seasonImages"] = images
        example_cards.append(f'<section><h2>{escape(example["name"])}</h2><p>原圖首見 {example["source"]["firstWitness"]}；{example["source"]["occurrences"]}處；純參考={example["referenceOnly"]}。不補缺格、不認證自動連通。</p><div>{"".join(figures)}</div></section>')
    (output / "examples.json").write_text(json.dumps({
        "schema": "map-sprite-composition-examples-1", "catalogRevision": catalog["catalogRevision"],
        "sourceRevision": registration["revision"], "layoutSha256": sha(layout), "scriptSha256": report["scriptSha256"],
        "boundary": "Observed explicit item arrangements only; no new definitions, inferred geography, seamlessness or topology. Holes are transparent; river stays reference-only.",
        "examples": examples,
    }, indent=2) + "\n", encoding="utf-8")
    (output / "examples.html").write_text('<!doctype html><meta charset="utf-8"><title>四類原圖拼接參考</title><style>section div{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0}img{image-rendering:pixelated}</style><h1>原圖已見相對擺放；非自動連通規則</h1><p><a href="review.html">原子清單</a> / <a href="examples.json">完整配方與來源索引</a>；不補缺格、不新增定義。河岸只讀，不推水域mask。</p>' + ''.join(example_cards), encoding="utf-8")
    # Review-only contact sheets: native pixels, deterministic first occurrence.
    # A 5x5 window is context, never a component footprint or ownership claim.
    for season in SEASONS:
        atlas_images[season][1].save(output / f"atlas-{season}.png")
    # Repetition review is explicitly distinct from observed adjacency. A 3x3
    # preview invents no pixels, but is not evidence of seamlessness or terrain.
    repeats = [{"byte": tile, "occurrences": 0, "firstWitness": None,
                "rect": [tile % 16 * 48, tile // 16 * 48, 48, 48]}
               for tile in range(256)]
    for y in range(254):
        for x in range(382):
            tile = layout[y * 384 + x]
            if all(layout[(y + dy) * 384 + x:(y + dy) * 384 + x + 3] == bytes([tile]) * 3
                   for dy in range(3)):
                row = repeats[tile]
                row["occurrences"] += 1
                if row["firstWitness"] is None:
                    row["firstWitness"] = [x, y]
    repeat_sheets = {}
    for season in SEASONS:
        sheet = Image.new("RGB", (768, 768))
        for row in repeats:
            tile = row["byte"]
            tx, ty = tile % 16 * 16, tile // 16 * 16
            image = atlas_images[season][1].crop((tx, ty, tx + 16, ty + 16))
            left, top, _, _ = row["rect"]
            for dy in range(3):
                for dx in range(3):
                    sheet.paste(image, (left + dx * 16, top + dy * 16))
        filename = f"repeat-{season}.png"
        sheet.save(output / filename)
        repeat_sheets[season] = {"path": filename, "size": list(sheet.size),
                                 "rgbSha256": sha(sheet.tobytes())}
    (output / "repetition.json").write_text(json.dumps({
        "schema": "map-sprite-repetition-review-1",
        "sourceRevision": registration["revision"], "layoutSha256": sha(layout),
        "scriptSha256": report["scriptSha256"],
        "boundary": "All 256 atoms repeated 3x3 without rotation or scaling. Counts enumerate overlapping uniform 3x3 MAP windows; witness is their top-left. No witness means unobserved, not invalid. Neither repetition nor edge appearance certifies seamlessness, water class, geography or placement.",
        "sheets": repeat_sheets, "atoms": repeats,
    }, indent=2) + "\n", encoding="utf-8")
    repeat_cards = []
    for row in repeats:
        tile = row["byte"]
        left, top, _, _ = row["rect"]
        witness = row["firstWitness"]
        evidence = (f'原圖首見左上角 ({witness[0]},{witness[1]})；解壓MAP offset {witness[1] * 384 + witness[0]}'
                    if witness is not None else '原圖未觀測到此3×3重複；不代表禁止組合')
        previews = ''.join(
            f'<figure><figcaption>{season}</figcaption><div role="img" '
            f'aria-label="槽{tile} {season} 3×3重複預覽" '
            f'style="width:48px;height:48px;background-image:url(repeat-{season}.png);'
            f'background-position:-{left}px -{top}px"></div></figure>'
            for season in SEASONS)
        repeat_cards.append(f'<article id="repeat-{tile}"><h2><a href="review.html#atom-{tile}">槽{tile}</a></h2>'
                            f'<p>原圖重疊窗口數 {row["occurrences"]}；{evidence}</p>'
                            f'<div class="seasons">{previews}</div></article>')
    (output / "repetition.html").write_text(
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>原像素重複鋪貼審閱</title>'
        '<style>body{font-family:sans-serif}.seasons{display:flex;gap:16px;flex-wrap:wrap}'
        'figure{margin:0}article{margin-block:24px}</style><body><h1>256槽四季3×3重複鋪貼</h1>'
        '<p>人工檢視用途，不是海域分類、無縫、地理或放置認證；每格16 CSS像素，未縮放、旋轉或補像素。'
        '原圖窗口計數包含重疊窗口；沒有證據不等於非法。</p>'
        '<p><a href="repetition.json">完整來源與窗口索引</a> · <a href="review.html">槽位索引</a></p>'
        + ''.join(repeat_cards) + '</body></html>\n', encoding="utf-8")
    # Pack observed pairs into bounded sheets, rather than thousands of files.
    # Every cell is an unmodified atlas crop; direction is original MAP order.
    preview_pairs = []
    preview_sheets = {}
    adjacency_links = defaultdict(list)
    adjacency_sections = []
    for axis, pair_width, pair_height in (("east", 32, 16), ("south", 16, 32)):
        rows = [row for row in adjacency_rows if row["axis"] == axis]
        columns = 1024 // pair_width
        sheet_size = (1024, ((len(rows) + columns - 1) // columns) * pair_height)
        sheets = {season: Image.new("RGB", sheet_size) for season in SEASONS}
        grouped_html = defaultdict(list)
        for index, row in enumerate(rows):
            left, top = index % columns * pair_width, index // columns * pair_height
            preview_pairs.append({"axis": axis, "bytes": row["bytes"],
                                  "rect": [left, top, pair_width, pair_height]})
            for season in SEASONS:
                for side, tile in enumerate(row["bytes"]):
                    tx, ty = tile % 16 * 16, tile // 16 * 16
                    sheets[season].paste(
                        atlas_images[season][1].crop((tx, ty, tx + 16, ty + 16)),
                        (left + (side * 16 if axis == "east" else 0),
                         top + (side * 16 if axis == "south" else 0)))
            first, second = row["bytes"]
            x, y = row["firstWitness"]
            offset = y * 384 + x
            second_offset = offset + (1 if axis == "east" else 384)
            previews = ''.join(
                f'<td><span role="img" aria-label="{season} {axis} {first}→{second}" '
                f'style="display:block;width:{pair_width}px;height:{pair_height}px;'
                f'background-image:url(adjacency-{axis}-{season}.png);'
                f'background-position:-{left}px -{top}px"></span></td>'
                for season in SEASONS)
            grouped_html[first].append(
                f'<tr id="pair-{axis}-{first}-{second}"><td>'
                f'<a href="review.html#atom-{first}">{first:02X}</a> → '
                f'<a href="review.html#atom-{second}">{second:02X}</a></td>'
                f'<td>{row["occurrences"]}</td><td>({x},{y})</td>'
                f'<td>{offset}, {second_offset}</td>{previews}</tr>')
        preview_sheets[axis] = {}
        for season, image in sheets.items():
            filename = f"adjacency-{axis}-{season}.png"
            image.save(output / filename)
            preview_sheets[axis][season] = {"path": filename, "size": list(image.size),
                                           "rgbSha256": sha(image.tobytes())}
        adjacency_sections.append(f'<h2>{axis}：' + ('左→右' if axis == 'east' else '上→下') + '</h2>')
        for first, pair_rows in grouped_html.items():
            label = '向東相鄰對' if axis == 'east' else '向南相鄰對'
            adjacency_links[first].append(f'<a href="adjacency.html#{axis}-{first}">{label}</a>')
            adjacency_sections.append(
                f'<details id="{axis}-{first}"><summary>起點槽 {first} / {first:02X}h · '
                f'{len(pair_rows)} 種實際相鄰對</summary><table><thead><tr>'
                '<th>原byte</th><th>次數</th><th>首見座標</th><th>解壓MAP偏移</th>'
                '<th>spring</th><th>summer</th><th>autumn</th><th>winter</th>'
                '</tr></thead><tbody>' + ''.join(pair_rows) + '</tbody></table></details>')
    (output / "adjacency-preview.json").write_text(json.dumps({
        "schema": "map-sprite-adjacency-preview-1",
        "sourceRevision": registration["revision"], "layoutSha256": sha(layout),
        "scriptSha256": report["scriptSha256"],
        "boundary": "Original ordered two-cell observations, not reusable recipes or seamlessness/connectivity certification. Rectangles address native RGB pixels in local sheets; witnesses and counts are in adjacency.json.",
        "sheets": preview_sheets, "pairs": preview_pairs,
    }, indent=2) + "\n", encoding="utf-8")
    (output / "adjacency.html").write_text(
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width"><title>全量四季相鄰對審閱</title>'
        '<style>body{font-family:system-ui;margin:24px}td,th{padding:8px;text-align:left}'
        '[role=img]{image-rendering:pixelated}details{overflow:auto;margin:8px 0}</style>'
        '<h1>原圖全量相鄰對：四季原像素</h1><p>按起點槽與方向展開。'
        '僅原圖觀察；不是無縫、連通或可放置證書，未出現也不表示禁止。'
        'south 保持上→下，不旋轉圖像。偏移指解壓後MAP，不是RLE檔案偏移。</p>'
        '<p><a href="review.html">256槽</a> · <a href="adjacency.json">計數與座標</a> · '
        '<a href="adjacency-preview.json">圖冊位置與來源摘要</a></p>'
        + ''.join(adjacency_sections) + '</html>\n', encoding="utf-8")
    cards = []
    contexts = []
    for atom in atoms:
        tile = atom["byte"]
        strip = Image.new("RGB", (64, 16))
        box = (tile % 16 * 16, tile // 16 * 16, tile % 16 * 16 + 16, tile // 16 * 16 + 16)
        for index, season in enumerate(SEASONS):
            strip.paste(atlas_images[season][1].crop(box), (index * 16, 0))
        strip.save(output / f"atom-{tile}.png")
        position = layout.find(bytes([tile]))
        context_html = "<p>原圖未使用；無上下文。</p>"
        context_record = {"byte": tile, "firstWitness": None, "sourceOrigin": None,
                          "inspectionSize": None, "seedOffset": None,
                          "cells": [], "seasonImages": {}}
        if position >= 0:
            cx, cy = position % 384, position // 384
            left, top = max(0, cx - 2), max(0, cy - 2)
            right, bottom = min(384, cx + 3), min(256, cy + 3)
            width, height = right - left, bottom - top
            cells = [[x - left, y - top, layout[y * 384 + x]]
                     for y in range(top, bottom) for x in range(left, right)]
            context_record.update({"firstWitness": [cx, cy], "sourceOrigin": [left, top],
                                   "inspectionSize": [width, height],
                                   "seedOffset": [cx - left, cy - top], "cells": cells})
            images_html = []
            for season in SEASONS:
                context = Image.new("RGB", (width * 16, height * 16))
                for x, y, neighbor in cells:
                    nx, ny = neighbor % 16 * 16, neighbor // 16 * 16
                    context.paste(atlas_images[season][1].crop((nx, ny, nx + 16, ny + 16)),
                                  (x * 16, y * 16))
                # Preserve existing spring review links; the other seasons are new.
                filename = f"context-{tile}.png" if season == "spring" else f"context-{tile}-{season}.png"
                context.save(output / filename)
                context_record["seasonImages"][season] = {"path": filename, "rgbSha256": sha(context.tobytes())}
                images_html.append(
                    f'<figure><figcaption>{season}</figcaption>'
                    f'<img src="{filename}" width="{context.width}" height="{context.height}" '
                    f'alt="槽{tile} {season} 原圖上下文；不是物件邊界"></figure>')
            context_html = (
                f'<p>首見格 ({cx},{cy})；窗內偏移 ({cx-left},{cy-top})；四季同一窗口</p>'
                + '<div class="contexts">' + ''.join(images_html) + '</div>'
            )
        contexts.append(context_record)
        cards.append(
            f'<article id="atom-{tile}"><h2>{tile} / {tile:02X}h</h2>'
            f'<p>MDL +{atom["offset"]}，128B；全圖 {atom["mapOccurrences"]} 格</p>'
            f'<img src="atom-{tile}.png" width="64" height="16" alt="槽{tile}春夏秋冬原像素">'
            f'{context_html}<p>{" · ".join(adjacency_links[tile]) or "無原圖相鄰對"} · '
            f'<a href="repetition.html#repeat-{tile}">3×3重複鋪貼審閱</a></p>'
            f'<p>分類候選：{atom["candidateCategory"] or "未知"}；'
            f'待辨識／未認證放置</p></article>'
        )
    (output / "contexts.json").write_text(json.dumps({
        "schema": "map-sprite-atom-contexts-1",
        "sourceRevision": registration["revision"], "layoutSha256": sha(layout),
        "scriptSha256": report["scriptSha256"],
        "boundary": "All 256 byte identities; first row-major MAP witness and bounded 5x5 inspection window only. Missing witnesses remain null. Seasonal pixels share exact cells. No footprint, geography, category or placement certification.",
        "summary": {"atoms": len(contexts), "withWitness": len(counts), "withoutWitness": 256 - len(counts)},
        "atoms": contexts,
    }, indent=2) + "\n", encoding="utf-8")
    # Explicit observed windows, not reusable recipes: the full ordered bytes
    # and source coordinates let another reviewer reproduce every connection.
    sample_cards = []
    for sample in samples:
        position = layout.index(bytes([sample["seedByte"]]))
        cx, cy = position % 384, position // 384
        left, top = max(0, cx - 2), max(0, cy - 2)
        right, bottom = min(384, cx + 3), min(256, cy + 3)
        width, height = right - left, bottom - top
        cells = [[x - left, y - top, layout[y * 384 + x]]
                 for y in range(top, bottom) for x in range(left, right)]
        season_images = {}
        for season in SEASONS:
            image = Image.new("RGB", (width * 16, height * 16))
            for x, y, tile in cells:
                tx, ty = tile % 16 * 16, tile // 16 * 16
                image.paste(atlas_images[season][1].crop((tx, ty, tx + 16, ty + 16)),
                            (x * 16, y * 16))
            filename = f'sample-{sample["id"]}-{season}.png'
            image.save(output / filename)
            season_images[season] = {"path": filename, "rgbSha256": sha(image.tobytes())}
        observed_neighbours = [row for row in adjacency_rows if sample["seedByte"] in row["bytes"]]
        sample.update({
            "observedAdjacency": observed_neighbours,
            "status": "observed-window-not-placement-recipe",
            "categoryConfidence": "visual-candidate",
            "sourceOrigin": [left, top], "sourceSeed": [cx, cy],
            "inspectionSize": [width, height], "seedOffset": [cx - left, cy - top],
            "cells": cells, "seasonImages": season_images,
            "anchor": None, "footprint": None, "geographyMask": None,
            "trustedRecipe": None, "placementSupport": "not-certified-by-this-audit",
        })
        byte_rows = "\n".join(" ".join(f"{layout[y * 384 + x]:02X}" for x in range(left, right))
                              for y in range(top, bottom))
        images = "".join(
            f'<figure><figcaption>{season}</figcaption><img src="{season_images[season]["path"]}" '
            f'width="{width * 16}" height="{height * 16}" alt="{sample["label"]}原圖觀察窗"></figure>'
            for season in SEASONS)
        neighbour_rows = "".join(
            f'<tr><td>{row["axis"]}</td><td>{row["bytes"][0]:02X} → {row["bytes"][1]:02X}</td>'
            f'<td>{row["occurrences"]}</td><td>{row["firstWitness"]}</td></tr>'
            for row in observed_neighbours)
        sample_cards.append(
            f'<section><h2>{sample["label"]} · 原槽 {sample["seedByte"]:02X}h</h2>'
            f'<p>原圖起點 ({left},{top})；種子偏移 ({cx-left},{cy-top})；'
            '僅原圖相鄰示例，不是可放置組件或任意拼接證書。</p>'
            f'<div class="seasons">{images}</div><pre>{byte_rows}</pre>'
            '<details><summary>全圖實際相鄰記錄（不是可拼接配方）</summary>'
            '<p>east 左→右，south 上→下；座標為箭頭起點。只列含本候選槽的原圖相鄰對；'
            '未出現不表示禁止，出現不證明任意位置可連接或視覺無縫。</p>'
            '<table><thead><tr><th>方向</th><th>原byte</th><th>次數</th><th>首見座標</th>'
            f'</tr></thead><tbody>{neighbour_rows}</tbody></table></details></section>')
    (output / "samples.json").write_text(json.dumps({
        "schema": "map-sprite-observed-samples-1", "scriptSha256": report["scriptSha256"],
        "sourceRevision": registration["revision"], "layoutSha256": sha(layout),
        "boundary": "Four manually nominated visual candidates. Windows retain original adjacency only; no inferred natural-object ownership, footprint, anchor, geography or placement recipe. No rotation, mirroring or invented pixels.",
        "samples": samples,
    }, indent=2) + "\n", encoding="utf-8")
    (output / "samples.html").write_text(
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>四類候選觀察樣板</title>'
        '<style>body{font-family:system-ui;margin:24px}.seasons{display:flex;flex-wrap:wrap}'
        'figure{margin:12px}img{image-rendering:pixelated}</style>'
        '<h1>山地／河道／牆段／農田：四季原圖觀察樣板</h1>'
        '<p>Web分類候選（推斷），非原版規則；四季共用同一逐格byte排列。'
        '全部仍待辨識，不可放置。錨點、footprint、地理與受信配方尚未認證。'
        '逐格來源及圖像摘要見 samples.json；全部原圖相鄰對見 adjacency.json；'
        '<a href="review.html">完整256槽</a>。</p>'
        + "\n".join(sample_cards) + '</html>\n', encoding="utf-8")
    duplicate_links = "; ".join(
        " / ".join(f'<a href="#atom-{tile}">{tile} ({tile:02X}h)</a>' for tile in group)
        for group in report["fourSeasonVisualDuplicates"]
    )
    (output / "review.html").write_text(
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width"><title>S0 原始槽審閱</title>'
        '<style>body{font-family:system-ui;margin:24px}.atoms{display:grid;'
        'grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}'
        'article{border:1px solid #aaa;padding:12px}img{image-rendering:pixelated}'
        '.contexts{display:flex;flex-wrap:wrap;gap:8px}.contexts figure{margin:0}</style>'
        '<h1>256 原始槽／四季／原圖上下文</h1>'
        '<p>僅離線資源審閱，無腳本或網路請求。四季順序：春、夏、秋、冬，各16×16原像素。'
        '上下文取原圖首次使用處，最多5×5格；不是自然物件邊界、配方或隸屬證據。'
        '全槽去向見 inventory.json；已登記Web用途不等於原版分類，未辨識項保持未知。圖像相同不合併原byte身份；'
        '各槽首見座標、窗口逐格byte、四季圖像摘要見 <a href="contexts.json">contexts.json</a>。</p>'
        f'<p>已核登記版本：{registration["revision"]}；四季圖集逐byte摘要一致，'
        '不代表生效模板／copy已遷移或分類已完成。</p>'
        '<p><a href="samples.html">四類候選／四季原圖相鄰樣板</a>（不是可放置配方）；'
        '<a href="examples.html">已登記樣板的四類相對擺放示例</a>（不推自動連通）</p>'
        f'<p>四季視覺重複：{duplicate_links}</p><div class="atoms">'
        + "\n".join(cards) + '</div></html>\n', encoding="utf-8"
    )
    print(json.dumps({"output": str(output), **report["summary"],
                      "visualDuplicates": report["fourSeasonVisualDuplicates"]}, indent=2))


if __name__ == "__main__":
    main()
