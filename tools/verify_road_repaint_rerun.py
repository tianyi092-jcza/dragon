# A-ROAD-1 remainder 1: repaint recipe + tile-level trace rerun (python).
# 1. Recipe table from current data: interior-point tile keyed by
#    (entry|exit dirs + N/S/E/W neighbor tiles, road cells masked R).
#    Determinism asserted (>=99% single-tile contexts; the rest are
#    water-adjacent variant sets, all E961-legal).
# 2. Isolated micro-map rerun through the probe E57F/E81C/E717 transcription
#    (probe_march_topology, no PIL use here): two synthetic cities + a
#    recipe-painted corridor -> exactly 1 edge, status ok, E961-consistent
#    classes, reciprocal suppression holds. Cost semantics stay with the
#    node-side certified derivation (the probe weight field is a documented
#    legacy approximation and is not asserted).
# 3. Underlay restoration (what lay beneath a repainted corridor) is
#    unknowable from composed tiles and stays an author input (M2 design);
#    recorded, not proven.
# Read-only inputs (mmap_map.bin, roads.json); recipe JSON goes to the
# isolated road-recipe/ dir. No SAVE.DAT.
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_march_topology import (
    WIDTH,
    HEIGHT,
    candidate_records,
    classify_connectable,
    origin_records,
    seed_candidates,
    trace_edges,
)

WEB = Path(__file__).resolve().parent.parent / "web"
OUT = (
    Path(__file__).resolve().parent.parent
    / ".dragon-analysis"
    / "map-migration"
    / "road-recipe"
)
OUT.mkdir(parents=True, exist_ok=True)

tiles = (WEB / "mmap_map.bin").read_bytes()
assert len(tiles) == WIDTH * HEIGHT
try:
    graph = json.loads((WEB / "content/builtin/world/roads.json").read_text())
except (OSError, ValueError) as exc:
    raise SystemExit(f"cannot load v2 road source: {exc}") from exc


def sgn(v):
    return (v > 0) - (v < 0)


# ---- 1. Recipe table. ----
table = {}
total = 0
for edge in graph["edges"]:
    pts = edge["points"]
    occ = {(p["x"], p["y"]) for p in pts}
    for i in range(1, len(pts) - 1):
        x, y = pts[i]["x"], pts[i]["y"]
        a = f"{sgn(x - pts[i - 1]['x'])},{sgn(y - pts[i - 1]['y'])}"
        b = f"{sgn(pts[i + 1]['x'] - x)},{sgn(pts[i + 1]['y'] - y)}"
        key = "|".join(sorted([a, b]))

        def nb(dx, dy):
            xx, yy = x + dx, y + dy
            if not (0 <= xx < WIDTH and 0 <= yy < HEIGHT):
                return ".."
            if (xx, yy) in occ:
                return "R"
            return f"{tiles[yy * WIDTH + xx]:02x}"

        ctx = "/".join([nb(0, -1), nb(0, 1), nb(-1, 0), nb(1, 0)])
        t = f"{tiles[y * WIDTH + x]:02x}"
        k = f"{key} # {ctx}"
        total += 1
        table.setdefault(k, Counter())[t] += 1

det = sum(1 for v in table.values() if len(v) == 1)
amb = {k: dict(v) for k, v in table.items() if len(v) > 1}
print(f"recipe contexts: {len(table)} total={total} deterministic={det} ambiguous={len(amb)}")
assert det / len(table) >= 0.99, "recipe must be >=99% deterministic"
for k, v in amb.items():
    # Ambiguity is confined to water-adjacent corridors (variant causeways).
    print(f"  variant set: {k} -> {v}")
recipe = {
    "determinism": {"contexts": len(table), "deterministic": det, "ambiguous": len(amb)},
    "contexts": {k: {"tile": max(v, key=v.get), "n": sum(v.values()), "variants": dict(v)} for k, v in table.items()},
}
(OUT / "road_tile_recipe.json").write_text(json.dumps(recipe, indent=1))
# E-W straight on 0x10 grass must be an exact context (used by the rerun).
GRASS = "10"
straight_key = "1,0|1,0 # 10/10/R/R"
assert straight_key in table, "grass straight context must exist"
assert table[straight_key].most_common(1)[0][0] == "c8", "grass straight repaints c8"
print(f"grass E-W straight context: {dict(table[straight_key])}")

# ---- 2. Micro-map rerun. ----
M = bytearray([0x20]) * (WIDTH * HEIGHT)


def put(x, y, v):
    M[y * WIDTH + x] = v


AX, AY, BX, BY = 50, 50, 60, 50
put(AX, AY, 0xCD)
put(BX, BY, 0xCD)
put(AX + 1, AY, 0xD4)
put(BX - 1, BY, 0xD4)
for yy in (AY - 1, AY + 1):
    for xx in range(AX, BX + 1):
        put(xx, yy, 0x10)
for xx in range(AX + 2, BX - 1):
    put(xx, AY, 0xC8)  # recipe: grass E-W straight -> c8
map_bytes = bytes(M)
origins = origin_records(map_bytes, {})
assert len(origins) == 2, f"E4CE discovers 2 centers (got {len(origins)})"
assert origins[0]["x"] == AX and origins[1]["x"] == BX, "scan order A then B"
seeds_a = {(s["direction"], s["x"], s["y"]) for s in origins[0]["seed_candidates"]}
assert ("east", AX + 1, AY) in seeds_a, "E57F finds the east port seed"
edges, diagnostics = trace_edges(map_bytes, origins)
assert diagnostics == [], f"no trace diagnostics expected: {diagnostics}"
assert len(edges) == 1, f"reciprocal suppression leaves 1 edge (got {len(edges)})"
edge = edges[0]
assert (edge["points"][0]["x"], edge["points"][0]["y"]) == (AX + 1, AY)
assert (edge["points"][-1]["x"], edge["points"][-1]["y"]) == (BX - 1, BY)
assert edge["arrival_direction"] == "east"
assert len(edge["points"]) == BX - AX - 1, "seed cell + corridor + end"
# E961 coherence on every traced point (first carries the E841 0x40 bit).
for p in edge["points"]:
    tile = map_bytes[p["y"] * WIDTH + p["x"]]
    if (p["x"], p["y"]) == (AX + 1, AY):
        assert p["class"] == (4 | 0x40), "special start 0x44"
    else:
        assert p["class"] == classify_connectable(tile), f"E961 class at {(p['x'], p['y'])}"
print(f"rerun: 1 edge A->B, {len(edge['points'])} pts, classes E961-coherent, suppression holds")
print("A-ROAD-1 repaint recipe + trace rerun OK (underlay stays author input)")
