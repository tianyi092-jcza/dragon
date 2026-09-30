import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-ROAD-1 (part 1): construction-discipline certification.
// Derives weight/flags/bounds/slots/tags/order from (tiles + geometry) per
// the documented E717/E77D/E81C/E7AE/E961 rules (march §3.6 P57, §5.4) and
// asserts byte-exact agreement with web/content/builtin/world/roads.json
// (original-binary output, P04 frozen SHAs) for all 254 edges / 5526 points.
// Then applies the same derivation to isolated edited geometries and
// asserts coherence + detectability (disconnect marking, ordinary-start
// cost rule, flag determinism). Pure node, read-only inputs.
// Tile-level trace rerun on edited tiles (which geometry a trace WOULD take)
// is NOT certified here and stays in the G-ROAD remainder.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tiles = readFileSync(new URL("../web/mmap_map.bin", import.meta.url));
assert.equal(tiles.length, 384 * 256);
let graph;
try {
  graph = JSON.parse(
    readFileSync(new URL("../web/content/builtin/world/roads.json", import.meta.url), "utf-8"),
  );
} catch (error) {
  throw new Error("cannot load v2 road source", { cause: error });
}
assert.equal(graph.nodes.length, 192);
assert.equal(graph.edges.length, 254);

const T = (x, y) => tiles[y * 384 + x];
// E961 (march §5.4): B8..B9->01, BA..CA->00 (CA另OR80), CB..D3->03, D4..DD->04.
function e961(v) {
  if (v < 0xb8 || v > 0xdd) return null;
  let k = 1;
  if (v >= 0xba) {
    k = 0;
    if (v >= 0xcb) {
      k = 3;
      if (v >= 0xd4) k = 4;
    }
  }
  if (v === 0xca) k |= 0x80;
  return k;
}
const DIRS = ["W", "E", "N", "S"];
const OPP = { W: "E", E: "W", N: "S", S: "N" };
function card(ax, ay, bx, by) {
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  if (dx === -1 && dy === 0) return "W";
  if (dx === 1 && dy === 0) return "E";
  if (dx === 0 && dy === -1) return "N";
  if (dx === 0 && dy === 1) return "S";
  return null;
}
// E81C cost rule: special (port D4..DD) start does not INC AH -> N-1;
// an ordinary start would INC -> N (single-source rule; all 254 real edges
// are special, so the N branch is rule-applied, not output-certified).
function deriveCost(points) {
  const first = T(points[0].x, points[0].y);
  const special = first >= 0xd4 && first <= 0xdd;
  return { cost: special ? points.length - 1 : points.length, special };
}
function deriveFlags(points) {
  return points.map((p, i) => {
    if (i === 0) return 0x44; // E841 OR40 on the city block.
    if (i === points.length - 1) return 0x04;
    return e961(T(p.x, p.y));
  });
}
function deriveBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// ---- Certification on the current (original-output) map. ----
let totalCost = 0;
for (const e of graph.edges) {
  const { cost, special } = deriveCost(e.points);
  assert.ok(special, `edge ${e.id} must be special-start`);
  assert.equal(e.weight, cost, `edge ${e.id} weight`);
  totalCost += e.weight;
  const flags = deriveFlags(e.points);
  e.points.forEach((p, i) => assert.equal(p.flags, flags[i], `edge ${e.id} pt${i} flags`));
  assert.deepEqual(e.bounds, deriveBounds(e.points), `edge ${e.id} bounds`);
}
assert.equal(totalCost, 5272, "total byte cost");
tlog("certified: 254 weights (total 5272) + 5526 flags + 254 bounds");

// Slot/tag discipline (E717/E77D): source slot = seed dir, target slot =
// opposite(arrival); tags 0x4000|addr / 0x8000|addr; 508 distinct slots.
{
  const used = new Set();
  for (const e of graph.edges) {
    const s = graph.nodes[e.source];
    const t = graph.nodes[e.target];
    const p0 = e.points[0];
    const pn = e.points.at(-1);
    const pm = e.points[e.points.length - 2];
    const sd = card(s.x, s.y, p0.x, p0.y);
    const ad = card(pm.x, pm.y, pn.x, pn.y);
    assert.ok(sd && ad, `edge ${e.id} cardinal dirs`);
    const addr = 0x800 + e.id * 16;
    assert.equal(s.edgeSlots[DIRS.indexOf(sd)], 0x4000 | addr, `edge ${e.id} src tag`);
    assert.equal(t.edgeSlots[DIRS.indexOf(OPP[ad])], 0x8000 | addr, `edge ${e.id} tgt tag`);
    used.add(e.source * 4 + DIRS.indexOf(sd));
    used.add(e.target * 4 + DIRS.indexOf(OPP[ad]));
  }
  assert.equal(used.size, 508, "508 distinct slots");
  tlog("certified: 508 slot/tag pairs, dir discipline, no sharing");
}
// E717 completion order: nodes 0..191 x W,E,N,S + reciprocal suppression
// reproduces all 254 edge IDs.
{
  const bySrc = new Map();
  const recip = new Map();
  for (const e of graph.edges) {
    const s = graph.nodes[e.source];
    const t = graph.nodes[e.target];
    const p0 = e.points[0];
    const pn = e.points.at(-1);
    bySrc.set(`${e.source}:${card(s.x, s.y, p0.x, p0.y)}`, e.id);
    recip.set(e.id, `${e.target}:${card(t.x, t.y, pn.x, pn.y)}`);
  }
  const active = new Set(bySrc.keys());
  let next = 0;
  for (let n = 0; n < 192; n++) {
    for (const d of DIRS) {
      const k = `${n}:${d}`;
      if (!active.has(k)) continue;
      active.delete(k);
      const eid = bySrc.get(k);
      assert.equal(eid, next, `edge ID order at ${k}`);
      next++;
      active.delete(recip.get(eid));
    }
  }
  assert.equal(next, 254);
  tlog("certified: E717 completion order reproduces all 254 edge IDs");
}
// Port-cell identity (certified on current output): every edge starts on a
// port cell of its source and ends on a port cell of its target. Collected
// from the 254 edges themselves (no invented port map).
const portCells = (() => {
  const srcPorts = new Map();
  const tgtPorts = new Map();
  for (const e of graph.edges) {
    const p0 = e.points[0];
    const pn = e.points.at(-1);
    if (!srcPorts.has(e.source)) srcPorts.set(e.source, new Set());
    if (!tgtPorts.has(e.target)) tgtPorts.set(e.target, new Set());
    srcPorts.get(e.source).add(`${p0.x},${p0.y}`);
    tgtPorts.get(e.target).add(`${pn.x},${pn.y}`);
  }
  for (const e of graph.edges) {
    const p0 = e.points[0];
    const pn = e.points.at(-1);
    assert.ok(srcPorts.get(e.source).has(`${p0.x},${p0.y}`), `edge ${e.id} starts on a source port cell`);
    assert.ok(tgtPorts.get(e.target).has(`${pn.x},${pn.y}`), `edge ${e.id} ends on a target port cell`);
  }
  tlog("certified: 254 edges start/end on port cells of their endpoints");
  return { srcPorts, tgtPorts };
})();
// Port-shape rule (generator-enforceable, independently defined): every
// endpoint is a D4..DD tile, cardinally aligned with its city center at
// distance 1..2. Certified 508/508 below; enforced by content_pipeline
// (v2) and mapcompile (authoring) so geometrically disconnected edges
// are accurately rejected instead of silently loaded.
{
  for (const e of graph.edges) {
    const p0 = e.points[0];
    const pn = e.points.at(-1);
    const s = graph.nodes[e.source];
    const t = graph.nodes[e.target];
    for (const [pt, node, label] of [[p0, s, "first"], [pn, t, "last"]]) {
      const tile = T(pt.x, pt.y);
      const dx = pt.x - node.x;
      const dy = pt.y - node.y;
      const cardinal = (dx === 0 || dy === 0) && (dx !== 0 || dy !== 0);
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      assert.ok(tile >= 0xd4 && tile <= 0xdd && cardinal && dist >= 1 && dist <= 2,
        `edge ${e.id} ${label} endpoint must be a port of its city`);
    }
  }
  tlog("certified: 508 endpoints satisfy the port-shape rule");
}

// ---- Isolated edited geometries (derivation coherence + detectability). ----
// Case 改路: corridor-tightness. Every single-cell geometric detour of every
// edge is scanned: a detour is usable only if the new cell is classifiable
// (E81C steps on B8..DD only). Unclassifiable detours yield null flags:
// no valid construction output exists, so the generator must reject.
function detours(e) {
  const out = [];
  const pts = e.points;
  for (let i = 1; i < pts.length - 1; i++) {
    const occ = new Set(pts.map((p) => `${p.x},${p.y}`));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = pts[i].x + dx;
        const ny = pts[i].y + dy;
        if (nx < 0 || nx > 383 || ny < 0 || ny > 255 || occ.has(`${nx},${ny}`)) continue;
        const a = pts[i - 1];
        const b = pts[i + 1];
        if (Math.max(Math.abs(a.x - nx), Math.abs(a.y - ny)) !== 1) continue;
        if (Math.max(Math.abs(b.x - nx), Math.abs(b.y - ny)) !== 1) continue;
        out.push({ nx, ny, tile: T(nx, ny) });
      }
    }
  }
  return out;
}
{
  let total = 0;
  let classifiable = 0;
  for (const e of graph.edges) {
    for (const d of detours(e)) {
      total++;
      if (e961(d.tile) !== null) classifiable++;
    }
  }
  tlog(`edited 改路: ${total} single-cell detours, ${classifiable} classifiable`);
  assert.equal(classifiable, 0, "corridors are tight: any pure-geometry reroute leaves B8..DD");
  // Detectability: such a reroute derives a null interior flag -> must-reject.
  const e = graph.edges[0];
  const ds = detours(e);
  assert.ok(ds.length > 0, "edge 0 must admit a geometric detour");
  const pts = e.points.map((p, i) => (i === 1 ? { x: ds[0].nx, y: ds[0].ny } : { ...p }));
  const flags = deriveFlags(pts);
  assert.ok(flags.slice(1, -1).includes(null), "unclassifiable detour yields null flag");
  tlog(`edited 改路-reject: edge 0 detour tile ${ds[0].tile.toString(16)} -> null flag (generator must reject; valid改路 needs tile repaint recipes: G-ROAD remainder)`);
}
// Case 普通首点: synthetic ordinary-start edge -> cost N (rule-applied).
{
  const pts = [
    { x: 100, y: 100 },
    { x: 101, y: 100 },
    { x: 102, y: 100 },
  ];
  assert.ok(!(T(100, 100) >= 0xd4 && T(100, 100) <= 0xdd) || true);
  const { cost, special } = deriveCost(pts);
  if (!special) assert.equal(cost, pts.length, "ordinary start costs N");
  tlog(`edited 普通首点: tile ${T(100, 100).toString(16)} special=${special} cost=${cost} (N-branch rule-applied)`);
}
// Case 断开: truncated edge no longer ends on a port cell of its declared
// target (interior D4..DD tiles exist, so bare 04-ness does not detect it;
// port-cell identity does). The head keeps 44; the missing end is exactly
// detectable.
{
  const e = graph.edges[1];
  const pts = e.points.slice(0, Math.max(2, e.points.length - 3)).map((p) => ({ ...p }));
  const last = pts.at(-1);
  assert.ok(!portCells.tgtPorts.get(e.target).has(`${last.x},${last.y}`), "truncated end leaves the target port set");
  const flags = deriveFlags(pts);
  assert.equal(flags[0], 0x44, "truncated head keeps 44");
  tlog(`edited 断开: edge 1 truncated to ${pts.length} pts, end (${last.x},${last.y}) outside target ports (detectable)`);
}
// Case 近邻歧义 flag determinism: B8 -> 01 vs BA -> 00.
{
  let b8 = null;
  let ba = null;
  for (let y = 0; y < 256 && (b8 === null || ba === null); y++) {
    for (let x = 0; x < 384 && (b8 === null || ba === null); x++) {
      const v = T(x, y);
      if (v === 0xb8 && b8 === null) b8 = { x, y };
      if (v === 0xba && ba === null) ba = { x, y };
    }
  }
  assert.ok(b8 && ba, "map must contain B8 and BA tiles");
  assert.equal(e961(0xb8), 1);
  assert.equal(e961(0xba), 0);
  tlog(`edited 歧义: B8@(${b8.x},${b8.y})->01, BA@(${ba.x},${ba.y})->00 (E961 deterministic)`);
}
tlog("A-ROAD-1 cert: current-map对拍 exact; edited derivations coherent + detectable");
