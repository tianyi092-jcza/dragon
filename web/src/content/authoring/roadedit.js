// Road authoring operations (E-03 slice 3 + G-ROAD generator core).
// buildRoad derives a construction-certified record from author geometry:
// port-shape endpoints, Chebyshev-1 continuity, classifiable corridor
// (B8..DD only), E961 flags (44/04/interior), E81C cost (N-1 special /
// N ordinary), bounds extrema, E717 slot discipline (source slot = seed
// dir, target slot = opposite arrival; both must be free), no self-loop,
// no shared cells/segments or X-crossings with existing edges, capacity
// bounds. Anything else is refused with an exact diagnosis (code + entities),
// never silently degraded. deleteRoad removes the record; tag/slot details
// belong to the v2 encode step (dropEdge-style renumber, verified in the
// A-ROAD-1 engine tool), not to the authoring record.
// Pure functions over GameSource-shaped { roads, placements } + tile lookup.
// No DOS, no saves, no network.
// Certified slot derivation for records predating slot storage (M2):
// source slot = seed dir from the city center, target slot = opposite of
// the arrival step (508/508 on original output). Verified by the caller
// against v2 tags where available; here it is the occupancy source.
export function deriveSlots(geometry, fromCity) {
  const srcDir = card(fromCity.x, fromCity.y, geometry[0].x, geometry[0].y);
  const last = geometry.at(-1);
  const prev = geometry.at(-2);
  const arrDir = card(prev.x, prev.y, last.x, last.y);
  if (srcDir == null || arrDir == null)
    fail("non-cardinal-endpoint", "endpoint steps must be cardinal", {});
  return [
    { slot: DIRS.indexOf(srcDir), side: "source" },
    { slot: DIRS.indexOf(OPP[arrDir]), side: "target" },
  ];
}

function e961(tile) {
  if (tile < 0xb8 || tile > 0xdd) return null;
  let kind = 1;
  if (tile >= 0xba) {
    kind = 0;
    if (tile >= 0xcb) {
      kind = 3;
      if (tile >= 0xd4) kind = 4;
    }
  }
  if (tile === 0xca) kind |= 0x80;
  return kind;
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

function fail(code, message, entities = {}) {
  const error = new RangeError(message);
  error.code = code;
  error.entities = entities;
  throw error;
}

// tiles: (x, y) -> byte. cities: Map cityId -> { x, y }.
export function buildRoad({ fromCityId, toCityId, geometry, travelKind, cities, roads, tiles }) {
  if (!fromCityId || !toCityId) fail("bad-endpoints", "road needs both endpoint cities");
  if (fromCityId === toCityId) fail("self-loop", "road endpoints must differ", { city: fromCityId });
  const from = cities.get(fromCityId);
  const to = cities.get(toCityId);
  if (!from || !to) fail("unknown-endpoint", "endpoint city unknown", { fromCityId, toCityId });
  if (travelKind !== "land" && travelKind !== "water")
    fail("bad-travel-kind", "travelKind must be land|water (author choice, Q59)");
  if (!Array.isArray(geometry) || geometry.length < 2)
    fail("empty-geometry", "road geometry needs at least 2 points");
  for (const [i, pt] of geometry.entries()) {
    if (!Number.isInteger(pt.x) || !Number.isInteger(pt.y) || pt.x < 0 || pt.x > 383 || pt.y < 0 || pt.y > 255)
      fail("out-of-bounds", `road point ${i} out of bounds`, { index: i });
    if (i > 0) {
      const prev = geometry[i - 1];
      if (Math.max(Math.abs(pt.x - prev.x), Math.abs(pt.y - prev.y)) !== 1)
        fail("discontinuous", `road points ${i - 1}-${i} must be Chebyshev-adjacent`, { index: i });
    }
  }
  // Port-shape endpoints (certified 508/508).
  const head = geometry[0];
  const tail = geometry.at(-1);
  for (const [pt, city, label] of [[head, from, "from"], [tail, to, "to"]]) {
    const tile = tiles(pt.x, pt.y);
    const dx = pt.x - city.x;
    const dy = pt.y - city.y;
    const cardinal = (dx === 0 || dy === 0) && (dx !== 0 || dy !== 0);
    if (!(tile >= 0xd4 && tile <= 0xdd && cardinal && Math.max(Math.abs(dx), Math.abs(dy)) <= 2))
      fail("non-port-endpoint", `${label} end must be a port of its city`, { tile, dx, dy });
  }
  // Classifiable corridor (E81C steps on B8..DD only).
  for (const [i, pt] of geometry.entries()) {
    if (i === 0 || i === geometry.length - 1) continue;
    if (e961(tiles(pt.x, pt.y)) == null)
      fail("unclassifiable-cell", `road point ${i} is not a constructible tile`, {
        index: i,
        x: pt.x,
        y: pt.y,
        tile: tiles(pt.x, pt.y),
      });
  }
  // No shared cells/segments or X-crossings with existing edges
  // (design: 无据点交叉/重叠拒绝; crossings need a city, out of slice).
  const cells = new Set(geometry.map((p) => `${p.x},${p.y}`));
  const segs = new Set();
  for (let i = 1; i < geometry.length; i++) {
    const a = `${geometry[i - 1].x},${geometry[i - 1].y}`;
    const b = `${geometry[i].x},${geometry[i].y}`;
    segs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  for (const e of roads ?? []) {
    const pts = e.geometry ?? e.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      if (cells.has(`${pts[i].x},${pts[i].y}`))
        fail("shared-cell", `road shares cell (${pts[i].x},${pts[i].y}) with ${e.id}`, { with: e.id });
      if (i > 0) {
        const a = `${pts[i - 1].x},${pts[i - 1].y}`;
        const b = `${pts[i].x},${pts[i].y}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (segs.has(key)) fail("shared-segment", `road shares a segment with ${e.id}`, { with: e.id });
        // Diagonal X-crossing against an orthogonal step and vice versa.
        const [ax, ay] = a.split(",").map(Number);
        const [bx, by] = b.split(",").map(Number);
        if (Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1) {
          const cross1 = `${ax},${by}|${bx},${ay}`;
          const cs = cross1.split("|").sort();
          if (segs.has(`${cs[0]}|${cs[1]}`))
            fail("x-crossing", `road X-crosses ${e.id} without a city`, { with: e.id });
        }
      }
    }
  }
  // E717 slot discipline: source slot = seed dir, target slot = opposite
  // arrival; both must be free (occupied = precise refusal, not overwrite).
  const srcDir = card(from.x, from.y, geometry[0].x, geometry[0].y);
  const last = tail;
  const prev = geometry.at(-2);
  const arrDir = card(prev.x, prev.y, last.x, last.y);
  const [src, tgt] = deriveSlots(geometry, from);
  const usedSlots = new Map();
  for (const e of roads ?? []) {
    for (const s of e.slots ?? e.nativeBinding?.slots ?? []) {
      const node = s.node ?? (s.side === "source" ? e.fromCityId : e.toCityId);
      usedSlots.set(`${node}:${s.slot}`, e.id);
    }
  }
  const srcSlot = src.slot;
  const tgtSlot = tgt.slot;
  if (usedSlots.has(`${fromCityId}:${srcSlot}`))
    fail("slot-occupied", `source slot ${srcDir} of ${fromCityId} is taken`, { by: usedSlots.get(`${fromCityId}:${srcSlot}`) });
  if (usedSlots.has(`${toCityId}:${tgtSlot}`))
    fail("slot-occupied", `target slot ${OPP[arrDir]} of ${toCityId} is taken`, { by: usedSlots.get(`${toCityId}:${tgtSlot}`) });
  // Derivation (certified rules): flags, cost, bounds.
  const firstTile = tiles(head.x, head.y);
  const special = firstTile >= 0xd4 && firstTile <= 0xdd;
  const flags = geometry.map((p, i) => {
    if (i === 0) return 0x44;
    if (i === geometry.length - 1) return 0x04;
    return e961(tiles(p.x, p.y));
  });
  const xs = geometry.map((p) => p.x);
  const ys = geometry.map((p) => p.y);
  return {
    fromCityId,
    toCityId,
    travelKind,
    geometry: geometry.map((p) => ({ x: p.x, y: p.y })),
    nativeBinding: {
      weight: special ? geometry.length - 1 : geometry.length,
      flags,
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      },
      slots: [
        { node: fromCityId, slot: srcSlot, side: "source" },
        { node: toCityId, slot: tgtSlot, side: "target" },
      ],
    },
  };
}

export function deleteRoad(roads, roadId) {
  const index = (roads ?? []).findIndex((r) => r.id === roadId);
  if (index < 0) fail("unknown-road", `no such road: ${roadId}`, { roadId });
  const next = roads.slice();
  next.splice(index, 1);
  return next;
}

// v2 re-encode (E-03 slice 3b): GameSource road list -> v2 nodes/edges
// with E717-ordered ids, addresses, reciprocal tags, certified costs/
// flags/bounds from nativeBinding. Input order is preserved (existing
// edges keep relative order; appends go last); ids/addresses are fully
// reassigned. Slot occupancy comes from nativeBinding.slots (backfilled
// for M2 records). Throws on slot collision or capacity overflow.
export function encodeRoadGraphV2(roads, citiesById) {
  const list = roads ?? [];
  if (list.length > 384) fail("too-many-edges", `roads exceed native encoding space: ${list.length}`);
  let totalPoints = 0;
  for (const r of list) totalPoints += (r.geometry ?? []).length;
  if (totalPoints > 6144) fail("too-many-points", `road points exceed native encoding space: ${totalPoints}`);
  const nodes = [];
  const nodeIndex = new Map();
  for (const [cityId, city] of citiesById) {
    nodeIndex.set(cityId, nodes.length);
    nodes.push({ id: nodes.length, x: city.x, y: city.y, edgeSlots: [0, 0, 0, 0], _city: cityId });
  }
  const edges = list.map((r, id) => {
    const src = nodeIndex.get(r.fromCityId);
    const tgt = nodeIndex.get(r.toCityId);
    if (src == null || tgt == null) fail("unknown-endpoint", `edge references unknown city`, { road: r.id });
    if (src === tgt) fail("self-loop", `edge endpoints identical`, { road: r.id });
    const nb = r.nativeBinding ?? {};
    const points = (r.geometry ?? []).map((p, i) => ({
      x: p.x,
      y: p.y,
      flags: nb.flags?.[i] ?? fail("missing-flags", `edge lacks derived flags`, { road: r.id }),
    }));
    const weight = nb.weight;
    if (!Number.isInteger(weight) || weight < 0 || weight > 255)
      fail("missing-cost", `edge lacks a derived byte cost`, { road: r.id });
    const bounds = nb.bounds ?? fail("missing-bounds", `edge lacks derived bounds`, { road: r.id });
    return { id, source: src, target: tgt, weight, points, bounds, _slots: nb.slots ?? [], _road: r.id };
  });
  for (const e of edges) {
    for (const s of e._slots) {
      const node = nodes[nodeIndex.get(s.node)];
      if (!node) fail("unknown-endpoint", `slot references unknown city`, { road: e._road });
      if (node.edgeSlots[s.slot] !== 0)
        fail("slot-collision", `slot ${s.slot} of ${s.node} doubly assigned`, { roads: [node._city, e._road] });
      const addr = 0x800 + e.id * 16;
      node.edgeSlots[s.slot] = (s.side === "source" ? 0x4000 : 0x8000) | addr;
    }
    delete e._slots;
    delete e._road;
  }
  for (const n of nodes) delete n._city;
  return { version: 2, width: 384, height: 256, nodes, edges };
}
