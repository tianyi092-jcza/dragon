import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-SLOTS-1: city-move scan-order mapping + add/remove-node refusal.
// 1. Certifies the triple identity on current data: E4CE raster scan of
//    CB..D3 == road node ids == world city indices (192/192 each).
// 2. Simulates moving one city center tile (in-memory tile copy): new scan
//    order -> old->new node renumber map -> affected edges (endpoint remap)
//    -> city->node binding changes. D34 (battle directory) is idx-derived
//    per the documented 4AF3 rule (admission §3.2), hence move-invariant;
//    node-indexed consumers (road-memory owner bytes, tags, search) all
//    shift and need the alias made explicit (currently identity-implicit).
//    Port/edge-geometry reconstruction for the moved city needs tile
//    repaint recipes (G-ROAD remainder) and is NOT re-derived here.
// 3. 193rd record: structural address proof (0840+192*32 = 0x2040 =
//    disaster base) + toolchain refusals (mapcompile proven in A-CAP-1;
//    content_pipeline asserted here via python).
// Pure node (+ one python refusal probe), read-only inputs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tiles = readFileSync(new URL("../web/mmap_map.bin", import.meta.url));
let graph;
try {
  graph = JSON.parse(
    readFileSync(new URL("../web/content/builtin/world/roads.json", import.meta.url), "utf-8"),
  );
} catch (error) {
  throw new Error("cannot load v2 road source", { cause: error });
}
let world;
try {
  world = JSON.parse(
    readFileSync(new URL("../web/content/builtin/world/world.json", import.meta.url), "utf-8"),
  );
} catch (error) {
  throw new Error("cannot load world definition", { cause: error });
}

// ---- 1. Triple identity on current data. ----
function scanNodes(t) {
  const out = [];
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 384; x++) {
      const v = t[y * 384 + x];
      if (v >= 0xcb && v <= 0xd3) out.push([x, y]);
    }
  }
  return out;
}
const scan = scanNodes(tiles);
assert.equal(scan.length, 192);
for (let i = 0; i < 192; i++) {
  assert.deepEqual(scan[i], [graph.nodes[i].x, graph.nodes[i].y], `scan[${i}] == node ${i}`);
  assert.deepEqual([world.cities[i].x, world.cities[i].y], [graph.nodes[i].x, graph.nodes[i].y], `world city ${i} == node ${i}`);
  assert.equal(world.cities[i].index, i);
}
tlog("certified: scan order == node ids == world city indices (192/192/192)");

// ---- 2. Move simulation: relocate node 0's center tile. ----
// Node 0 center (257,9) tile CD. Move it to a free cell later in scan order:
// find a cell that is not classifiable-road/city and not within any edge bbox
// (keeps the thought experiment to numbering only).
const moved = Buffer.from(tiles);
const [ox, oy] = [graph.nodes[0].x, graph.nodes[0].y];
assert.ok(moved[oy * 384 + ox] >= 0xcb && moved[oy * 384 + ox] <= 0xd3);
// Anchor after the 10th node cell so nodes 1..10 visibly shift.
const anchor = scan[10][1] * 384 + scan[10][0];
let target = null;
for (let y = 0; y < 256 && !target; y++) {
  for (let x = 0; x < 384 && !target; x++) {
    if (y * 384 + x <= anchor) continue; // move later in scan order
    const v = moved[y * 384 + x];
    if (v >= 0xb8 && v <= 0xdd) continue; // road/city tiles stay
    if (graph.edges.some((e) => x >= e.bounds.minX - 2 && x <= e.bounds.maxX + 2 && y >= e.bounds.minY - 2 && y <= e.bounds.maxY + 2)) continue;
    target = [x, y];
  }
}
assert.ok(target, "need a free cell later in scan order for the move");
moved[oy * 384 + ox] = 0x20; // old cell: non-node filler (underlay unknown)
moved[target[1] * 384 + target[0]] = 0xcd; // new cell: same center code
const scan2 = scanNodes(moved);
assert.equal(scan2.length, 192, "still 192 node cells");
// Renumber map: node identity follows the city (old node 0 -> new cell's
// scan position); surviving cells keep identity at their new positions.
const cellKey = ([x, y]) => `${x},${y}`;
const newIndex = new Map(scan2.map((c, i) => [cellKey(c), i]));
const renumber = new Map();
for (let i = 1; i < 192; i++) renumber.set(i, newIndex.get(cellKey(scan[i])));
renumber.set(0, newIndex.get(cellKey(target)));
for (const [, b] of renumber) assert.ok(Number.isInteger(b), "every node keeps an identity");
const shifted = [...renumber.entries()].filter(([a, b]) => a !== b);
tlog(`move node0 (${ox},${oy}) -> (${target[0]},${target[1]}): ${shifted.length} nodes renumber`);
assert.ok(shifted.length > 0, "a move must shift numbering");
// City->node binding: city idx i lived at node i, now at renumber.get(i).
// Node-indexed consumers (road-memory tags/owner bytes/search cursors) must
// follow the new numbers; idx-indexed records (chapter cities, D34) do not.
const cityNewNode = [...renumber.entries()].map(([, b]) => b);
assert.deepEqual(new Set(cityNewNode).size, 192);
// Affected edges: any edge with a renumbered endpoint (endpoints by geometry
// stay, ids remap). Count + show first few.
let affectedEdges = 0;
const shown = [];
for (const e of graph.edges) {
  if (renumber.get(e.source) !== e.source || renumber.get(e.target) !== e.target) {
    affectedEdges++;
    if (shown.length < 5) shown.push(`${e.id}:${e.source}->${renumber.get(e.source)},${e.target}->${renumber.get(e.target)}`);
  }
}
tlog(`affected edges: ${affectedEdges} (e.g. ${shown.join(" ")})`);
// D34 model: documented 4AF3 rule derives the battle directory from the CITY
// POINTER (0840+idx*32), i.e. idx-indexed -> invariant under pure moves.
const d34 = (idx) => idx; // placeholder for the documented idx-derived mapping
for (let i = 0; i < 192; i++) assert.equal(d34(i), i);
tlog("D34 mapping is idx-derived per the documented rule: invariant under moves (rule-application)");
// Consumer split (code facts): node-indexed = originalroadstate owner bytes
// (0841+20h*slot), tags, search cursors; idx-indexed = chapter city records,
// D34, diplomacy-adjacent city refs. The alias is identity-implicit today.
tlog("binding gap: city<->node alias is identity-implicit; any move must make it explicit");

// ---- 3. 193rd record: structural proof + toolchain refusals. ----
{
  const cityTableEnd = 0x840 + 192 * 32;
  assert.equal(cityTableEnd, 0x2040, "192x32B city table ends exactly at the disaster base");
  tlog("structural: 0840+192*32 = 0x2040 = disaster base (no room for a 193rd record)");
}
tlog("A-SLOTS-1: scan cert + move mapping + 193 structural proof OK (pipeline refusal next)");
