"""Fixed-source city sprite evidence, not a renderer or a placement permit.

Reads only KI.EXE, MMAP.MDL/MAP and official SINARIO.DAT. Disassembles bounded
windows without executing DOS code. Writes only a new isolated audit directory.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import struct

from capstone import Cs, CS_ARCH_X86, CS_MODE_16
from decode_mmap import rle_decode

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = {
    "KI.EXE": "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
    "MMAP.MDL": "2fa1dd1b1ec7c426cf22583334a62dc61bdb1f1cefc59cbe8e9827480d118d1d",
    "MMAP.MAP": "51b6fcaa390c80bd8a358dcacbf7d8dbb6dfeb0e048d8c3bdd86329df3401bcf",
    "SINARIO.DAT": "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87",
}
LAYOUT_SHA = "740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861"


def inspect_city_sources(inputs):
    """Validate fixed raw inputs once, then project reproducible observations."""
    for name, expected in SOURCE_SHA.items():
        if hashlib.sha256(inputs[name]).hexdigest() != expected:
            raise ValueError("fixed source SHA mismatch: " + name)
    layout = rle_decode(inputs["MMAP.MAP"])
    if len(layout) != 384 * 256 or hashlib.sha256(layout).hexdigest() != LAYOUT_SHA:
        raise ValueError("fixed decoded MMAP.MAP mismatch")
    exe, mdl, scenario = (inputs[name] for name in ("KI.EXE", "MMAP.MDL", "SINARIO.DAT"))
    header = struct.unpack_from("<H", exe, 8)[0] * 16
    assert header == 0x200
    windows = []
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    for start, end in ((0x89F0, 0x8AEA), (0xE4CE, 0xE50C)):
        raw = exe[header + start:header + end]
        instructions = list(decoder.disasm(raw, start))
        assert sum(item.size for item in instructions) == len(raw)
        windows.append({"start": start, "endExclusive": end, "fileOffset": header + start,
            "sha256": hashlib.sha256(raw).hexdigest(), "bytesHex": raw.hex(),
            "instructions": [f"{item.address:04X} {item.bytes.hex():<16} {item.mnemonic} {item.op_str}" for item in instructions]})
    chapters = []
    for chapter in range(4):
        cities = []
        for slot in range(192):
            offset = chapter * 22208 + 0x8C0 + slot * 32
            record = scenario[offset:offset + 32]
            x, y = struct.unpack_from("<HH", record, 8)
            kind = record[22] & 15
            assert 2 <= x < 382 and 2 <= y < 254, "this report covers canonical official coordinates only"
            # These READ offsets are the 8A74..8ACC branches, not an object boundary.
            if kind == 0:
                offsets = [(-2, -2), (2, -2), (2, 2), (-2, 2)]
            elif kind == 3:
                offsets = [(0, -1), (-1, 0), (1, 0), (0, 1)]
            else:
                offsets = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
            cities.append({"slot": slot, "recordOffset": offset, "ownerByte": record[1],
                "typeNibble": kind, "x": x, "y": y, "centerByte": layout[y * 384 + x],
                "cornerReads": [{"dx": dx, "dy": dy, "byte": layout[(y + dy) * 384 + x + dx]}
                    for dx, dy in offsets]})
        counts = Counter((row["typeNibble"], row["centerByte"]) for row in cities)
        chapters.append({"chapter": chapter, "cities": cities,
            "typeCenterCounts": [{"typeNibble": kind, "centerByte": tile, "count": count}
                for (kind, tile), count in sorted(counts.items())]})
    cities = chapters[0]["cities"]
    for chapter in chapters[1:]:
        assert [(r["x"], r["y"], r["typeNibble"]) for r in chapter["cities"]] == [
            (r["x"], r["y"], r["typeNibble"]) for r in cities]
    counts = Counter(layout)
    corner_counts = Counter(point["byte"] for row in cities for point in row["cornerReads"])
    # A static opcode interpretation, cross-linked to the full original window;
    # this table does NOT claim that every outcome occurs in a particular game.
    center_families = [{"neutralMapByte": tile, "mapCount": counts[tile],
        "c01EqualsCff": tile - 2, "otherNonNeutralOwner": tile - 1, "c01Equals18h": tile}
        for tile in (205, 208, 211)]
    corner_pairs = [{"c01DiffersFromCff": tile, "c01EqualsCff": tile + 10,
        "mapCount": counts[tile], "readCountAtOfficialCorners": corner_counts[tile],
        "sameMdlBytes": mdl[tile * 128:(tile + 1) * 128] == mdl[(tile + 10) * 128:(tile + 11) * 128]}
        for tile in range(222, 232)]
    interior = []
    for tile, offsets in ((254, [(0, -1), (-1, 0), (1, 0), (0, 1)]),
                          (255, [(-1, -1), (1, -1), (-1, 1), (1, 1)])):
        expected = sorted((row["y"] + dy) * 384 + row["x"] + dx
            for row in cities if row["typeNibble"] == 0 for dx, dy in offsets)
        actual = [cell for cell, value in enumerate(layout) if value == tile]
        assert actual == expected, "all occurrences, not just a nearest-city association"
        interior.append({"byte": tile, "mapCount": len(actual), "typeNibble": 0,
            "offsets": offsets, "allMapOccurrencesEqualThesePositions": True})
    # Observe every 251 cap and its literal vertical 230 run to a 211 center.
    # This is an exhaustive fixed-MAP relation, NOT a fixed offset/object rule.
    gate_caps = []
    for cell, tile in enumerate(layout):
        if tile != 251:
            continue
        x, y = cell % 384, cell // 384
        matches = [row for row in cities if row["typeNibble"] == 3 and row["centerByte"] == 211
            and row["x"] == x and row["y"] > y
            and all(layout[sy * 384 + x] == 230 for sy in range(y + 1, row["y"]))]
        assert len(matches) == 1, "each original 251 has exactly one matching vertical gate segment"
        row = matches[0]
        gate_caps.append({"byte": 251, "x": x, "y": y, "slot": row["slot"],
            "typeNibble": row["typeNibble"], "centerByte": row["centerByte"],
            "centerX": row["x"], "centerY": row["y"], "dy": y - row["y"],
            "columnBytes": [layout[sy * 384 + x] for sy in range(y, row["y"] + 1)]})
    assert {row["slot"] for row in gate_caps} == {
        row["slot"] for row in cities if row["typeNibble"] == 3 and row["centerByte"] == 211}
    adjacent_observations = []
    for tile in range(212, 222):
        matches = Counter((row["typeNibble"], dx, dy)
            for row in cities for dy in range(-2, 3) for dx in range(-2, 3)
            if layout[(row["y"] + dy) * 384 + row["x"] + dx] == tile)
        adjacent_observations.append({"byte": tile, "mapCount": counts[tile],
            "nodeNeighborhoodMatchCount": sum(matches.values()),
            "relativeCounts": [{"typeNibble": kind, "dx": dx, "dy": dy, "count": count}
                for (kind, dx, dy), count in sorted(matches.items())]})
    # Literal three-cell perimeter windows, observed exhaustively from each
    # middle byte. These are not a whole-city footprint or a placement recipe.
    frame_edges = []
    for direction, tiles, center_offset in (
        ("north", [[0, 0, 226], [1, 0, 244], [2, 0, 227]], (1, 1)),
        ("south", [[0, 0, 228], [1, 0, 245], [2, 0, 229]], (1, -1)),
        ("west", [[0, 0, 226], [0, 1, 242], [0, 2, 228]], (1, 1)),
        ("east", [[0, 0, 227], [0, 1, 243], [0, 2, 229]], (-1, 1)),
    ):
        dx, dy, middle = tiles[1]
        occurrences = []
        for cell, tile in enumerate(layout):
            if tile != middle:
                continue
            x, y = cell % 384 - dx, cell // 384 - dy
            assert all(0 <= x + tx < 384 and 0 <= y + ty < 256
                and layout[(y + ty) * 384 + x + tx] == byte for tx, ty, byte in tiles)
            matches = [row for row in cities if (row["x"], row["y"]) == (x + center_offset[0], y + center_offset[1])]
            assert len(matches) == 1, "exact coordinate association, not a nearest-node guess"
            row = matches[0]
            occurrences.append({"x": x, "y": y, "slot": row["slot"],
                "centerByte": row["centerByte"], "typeNibble": row["typeNibble"]})
        frame_edges.append({"direction": direction, "tiles": tiles, "centerOffset": center_offset,
            "middleByte": middle, "mapCount": counts[middle], "occurrences": occurrences})
    # Enumerate exact node-relative positions, not just equal neighborhood counts.
    # Allowed positions describe this fixed MAP; they do not generate new nodes.
    boundary_parts = []
    for tile, kinds, offsets in (
        (212, (3,), ((0, -1),)), (213, (3,), ((0, 1),)),
        (214, (3,), ((-1, 0),)), (215, (3,), ((1, 0),)),
        (216, (1, 2, 4), ((0, -1),)), (217, (1, 2, 4), ((0, 1),)),
        (218, (1, 2, 4), ((-1, 0),)), (219, (1, 2, 4), ((1, 0),)),
        (220, (0,), ((0, -2), (0, 2))), (221, (0,), ((-2, 0), (2, 0))),
        (246, (0,), ((2, -1), (2, 0), (2, 1))),
        (247, (0,), ((-1, 2), (0, 2), (1, 2))),
    ):
        occurrences = []
        for cell, value in enumerate(layout):
            if value != tile:
                continue
            x, y = cell % 384, cell // 384
            matches = [row for row in cities if row["typeNibble"] in kinds
                and (x - row["x"], y - row["y"]) in offsets]
            assert len(matches) == 1, "every boundary part maps to exactly one original node"
            row = matches[0]
            occurrences.append({"x": x, "y": y, "slot": row["slot"],
                "dx": x - row["x"], "dy": y - row["y"],
                "centerByte": row["centerByte"], "typeNibble": row["typeNibble"]})
        boundary_parts.append({"byte": tile, "mapCount": counts[tile], "occurrences": occurrences})
    wall_end_observations = []
    for cell, tile in enumerate(layout):
        if tile not in (252, 253):
            continue
        x, y = cell % 384, cell // 384
        wall_end_observations.append({"byte": tile, "x": x, "y": y,
            "neighbors": {"west": layout[cell - 1] if x else None,
                "east": layout[cell + 1] if x < 383 else None,
                "north": layout[cell - 384] if y else None,
                "south": layout[cell + 384] if y < 255 else None}})
    color_outputs = {row[key] for row in center_families
        for key in ("c01EqualsCff", "otherNonNeutralOwner", "c01Equals18h")}
    color_outputs.update(row[key] for row in corner_pairs for key in ("c01DiffersFromCff", "c01EqualsCff"))
    selected = sorted(set(range(203, 248)) | {251, 252, 253, 254, 255})
    return {"schema": "map-city-sprite-source-audit-1",
        "scope": "Static KI windows and official four-chapter/raw-MAP observations; no CPU execution, inferred natural-object boundary, new topology, placement grant or live-data write.",
        "inputs": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in inputs.items()}, "decodedLayoutSha256": LAYOUT_SHA,
        "windows": windows, "chapters": chapters, "centerFamilies": center_families,
        "cornerPairs": corner_pairs, "cornerReadCounts": dict(sorted(corner_counts.items())),
        "interiorObservations": interior, "adjacentObservations": adjacent_observations,
        "gateCapObservations": gate_caps, "frameEdgeObservations": frame_edges,
        "boundaryPartObservations": boundary_parts, "wallEndObservations": wall_end_observations,
        "mapAbsentButAddressedByColorBranches": sorted(tile for tile in color_outputs if not counts[tile]),
        "atoms": [{"byte": tile, "mdlOffset": tile * 128, "byteLength": 128,
            "rawSha256": hashlib.sha256(mdl[tile * 128:(tile + 1) * 128]).hexdigest(),
            "mapCount": counts[tile]} for tile in selected]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("round")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9-]{1,48}", args.round):
        parser.error("round must be 1..48 ASCII letters, digits or hyphens")
    output = ROOT / ".dragon-analysis" / ("sprite-city-sources-" + args.round)
    if output.exists():
        raise FileExistsError("refusing to overwrite existing audit directory")
    inputs = {name: (ROOT.parent / "Dragon" / name).read_bytes()
        for name in ("KI.EXE", "MMAP.MDL", "MMAP.MAP")}
    inputs["SINARIO.DAT"] = (ROOT.parent / "原版/SINARIO.DAT").read_bytes()
    report = inspect_city_sources(inputs)
    report["toolSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    output.mkdir(parents=True, exist_ok=False)
    (output / "inventory.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for window in report["windows"]:
        stem = f"KI-{window['start']:04X}-{window['endExclusive']:04X}"
        (output / (stem + ".bin")).write_bytes(bytes.fromhex(window["bytesHex"]))
        (output / (stem + ".txt")).write_text("\n".join(window["instructions"]) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "chapters": len(report["chapters"]),
        "nodesPerChapter": len(report["chapters"][0]["cities"]),
        "mapAbsentColorOutputs": report["mapAbsentButAddressedByColorBranches"],
        "interior": report["interiorObservations"], "gateCaps": report["gateCapObservations"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
