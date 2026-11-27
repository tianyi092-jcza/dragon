// Dropped-tile roads (user-authorized Web product decision): road-category and
// gate tiles placed as decorations ARE road data. A connected tile chain whose
// two ends satisfy the port rule at two distinct bound cities materializes a
// road edge; anything else stays decoration with a red warning (never a save
// block, never silent auto-fix). No catalog import: tile bytes alone classify
// (catalog audit 2026-11: 37 tiles in B8..DD, zero shared across categories;
// road 18 + gate D4..DD 10 + water/bridge 9, all road-semantic).
import { cellKind } from '../content/authoring/cellplane.js';
import { buildRoad } from '../content/authoring/roadedit.js';

export const ROAD_TILE_MIN = 0xb8;
export const ROAD_TILE_MAX = 0xdd;
export const GATE_TILE_MIN = 0xd4;
export const AUTO_ROAD_PREFIX = 'road-auto-';

/**
 * Road/gate cells currently on the map, keyed by cell. A cell qualifies when
 * (a) a user-placed decoration covers it, and (b) the composed terrain tile
 * at that cell falls in the constructible corridor range B8..DD (gate tiles
 * D4..DD included). Reading the composed plane keeps this identical to what
 * the certified buildRoad sees; no catalog import, no per-material claim.
 */
export function collectRoadCells(source, terrain) {
  const bounds = source.map?.bounds ?? { minX: 0, minY: 0, width: 384, height: 256 };
  const tileAt = (x, y) => terrain[(y - bounds.minY) * bounds.width + x - bounds.minX];
  if (source.map.format === 'cell-map-1') {
    const cells = new Map();
    terrain.forEach((tile, i) => {
      if (cellKind(tile) !== 'road') return;
      const x = bounds.minX + i % bounds.width, y = bounds.minY + Math.floor(i / bounds.width);
      cells.set(`${x},${y}`, { x, y, tile });
    });
    // Existing paths keep their identities/slots. Clearing a path cell already drops its edge.
    for (const road of source.map.roads) for (const p of road.geometry) cells.delete(`${p.x},${p.y}`);
    return cells;
  }
  const definitions = source.componentDefinitions ?? {};
  const covered = new Map();
  for (const item of source.map?.decorations ?? []) {
    if (!item || typeof item.id !== 'string' || !Number.isInteger(item.x) || !Number.isInteger(item.y)) continue;
    const def = definitions?.[item.definitionRef];
    const recipe = def?.variants?.[item.variantRef] ?? def?.variants?.original;
    const steps = Array.isArray(recipe?.tiles) && recipe.tiles.length ? recipe.tiles : null;
    const footprint = steps
      ? steps.filter(step => Array.isArray(step) && Number.isInteger(step[0]) && Number.isInteger(step[1])).map(step => [step[0], step[1]])
      : Array.isArray(def?.footprint) && def.footprint.length ? def.footprint : [[0, 0]];
    for (const [dx, dy] of footprint) {
      if (!Number.isInteger(dx) || !Number.isInteger(dy)) continue;
      const key = `${item.x + dx},${item.y + dy}`;
      if (!covered.has(key)) covered.set(key, { x: item.x + dx, y: item.y + dy, id: item.id });
    }
  }
  const cells = new Map();
  for (const [key, cell] of covered) {
    if (cell.x < bounds.minX || cell.y < bounds.minY || cell.x >= bounds.minX + bounds.width || cell.y >= bounds.minY + bounds.height) continue;
    const tile = tileAt(cell.x, cell.y);
    if (!Number.isInteger(tile) || tile < ROAD_TILE_MIN || tile > ROAD_TILE_MAX) continue;
    cells.set(key, { ...cell, tile });
  }
  return cells;
}

function neighboursOf(key, cells, gateOwners) {
  const [x, y] = key.split(',').map(Number);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      // A right-angle bend already joins these cells via the corner tile;
      // counting the diagonal shortcut again turns the bend into a junction.
      if (dx && dy && (cells.has(`${x + dx},${y}`) || cells.has(`${x},${y + dy}`))) continue;
      const found = `${x + dx},${y + dy}`;
      // Two different ports of one city end independent corridors. In a
      // small city its east and south gates touch diagonally across the centre.
      if (dx && dy && gateOwners?.has(key) && gateOwners.get(key) === gateOwners.get(found)) continue;
      if (cells.has(found)) out.push(found);
    }
  return out.sort();
}

/** Chebyshev-connected components, each traced end to end when possible. */
export function traceRoadChains(cells, gateOwners) {
  const seen = new Set(), chains = [];
  const ordered = [...cells.keys()].sort();
  for (const start of ordered) {
    if (seen.has(start)) continue;
    const members = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const key = queue.pop();
      members.push(key);
      for (const next of neighboursOf(key, cells, gateOwners))
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    members.sort();
    const degree = new Map(members.map(key => [key, neighboursOf(key, cells, gateOwners).length]));
    const ends = members.filter(key => degree.get(key) === 1);
    if (members.length < 2) {
      chains.push({ cells: members.map(key => cells.get(key)), status: 'single' });
      continue;
    }
    if (ends.length !== 2 || [...degree.values()].some(d => d > 2)) {
      chains.push({ cells: members.map(key => cells.get(key)), status: 'junction', junction: cells.get(members.find(key => degree.get(key) > 2) ?? start) });
      continue;
    }
    const [head, tail] = ends[0] < ends[1] ? [ends[0], ends[1]] : [ends[1], ends[0]];
    const points = [head];
    let prev = null, at = head;
    while (at !== tail) {
      const next = neighboursOf(at, cells, gateOwners).find(n => n !== prev);
      if (next === undefined) break;
      prev = at;
      at = next;
      points.push(at);
      if (points.length > members.length + 1) break;
    }
    if (at !== tail || points.length !== members.length) chains.push({ cells: members.map(key => cells.get(key)), status: 'junction' });
    else chains.push({ cells: points.map(key => cells.get(key)), status: 'ok' });
  }
  chains.sort((a, b) => (a.cells[0].y - b.cells[0].y || a.cells[0].x - b.cells[0].x));
  return chains;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function autoRoadId(gameId, fromCityId, toCityId, geometry) {
  const digest = fnv1a(JSON.stringify([fromCityId, toCityId, geometry.map(p => [p.x, p.y])])) + fnv1a(JSON.stringify(geometry.map(p => [p.y, p.x])));
  return `${gameId}#${AUTO_ROAD_PREFIX}${digest.slice(0, 24)}`;
}

export function isAutoRoadId(gameId, id) {
  return typeof id === 'string' && id.startsWith(`${gameId}#${AUTO_ROAD_PREFIX}`);
}

/**
 * Propose road edges for tile chains. Pure: validates through the certified
 * buildRoad (port rule, continuity, classifiable cells, shared cells/segments,
 * crossings, slots) against explicitly bound cities and the given roads.
 * Returns materialized road records plus per-chain refusal descriptors.
 */
export function analyzeRoadChains(source, terrain, { maxEdges = Infinity } = {}) {
  const bounds = source.map?.bounds ?? { minX: 0, minY: 0, width: 384, height: 256 };
  const extent = { ...bounds, tileSize: 16 };
  const tiles = (x, y) => terrain[(y - bounds.minY) * bounds.width + x - bounds.minX];
  const cityAt = new Map((source.map?.placements ?? []).filter(p => typeof p?.cityId === 'string').map(p => [p.cityId, p]));
  const citiesById = new Map();
  for (const [cityId, place] of cityAt) if (source.cities?.[cityId]) citiesById.set(cityId, place);
  // 城中心格不属于路网：链条在此断开（过境本就以城为端点，见 E8 接触规则）。
  const centerKeys = new Set([...cityAt.values()].map(p => `${p.x},${p.y}`));
  const raw = collectRoadCells(source, terrain);
  for (const key of centerKeys) raw.delete(key);
  const derived = [], problems = [];
  // Re-derive every automatic edge from the current tiles. An old projection
  // must not collide with itself or disappear on the next save.
  const existing = (source.map?.roads ?? []).filter(r => source.map.format === 'cell-map-1' || !isAutoRoadId(source.gameId, r.id));
  const matchEnd = point => {
    if (point.tile < GATE_TILE_MIN || point.tile > ROAD_TILE_MAX) return { error: 'end-not-port', point };
    const hits = [];
    for (const [cityId, place] of cityAt) {
      const dx = point.x - place.x, dy = point.y - place.y;
      if ((dx === 0 || dy === 0) && (dx !== 0 || dy !== 0) && Math.max(Math.abs(dx), Math.abs(dy)) <= 2) hits.push(cityId);
    }
    hits.sort();
    if (!hits.length) return { error: 'end-unlinked', point };
    if (hits.length > 1) return { error: 'end-ambiguous', point, cities: hits };
    return { cityId: hits[0] };
  };
  const manualEdges = existing.length;
  const gateOwners = new Map();
  for (const [cityId, place] of cityAt) for (const d of [-2,-1,1,2]) {
    for (const key of [`${place.x+d},${place.y}`, `${place.x},${place.y+d}`]) {
      if (raw.get(key)?.tile >= GATE_TILE_MIN) gateOwners.set(key, gateOwners.has(key) ? null : cityId);
    }
  }
  for (const [key, owner] of gateOwners) if (owner === null) gateOwners.delete(key);
  for (const chain of traceRoadChains(raw, gateOwners)) {
    const cells = chain.cells.map(c => [c.x, c.y]);
    if (chain.status !== 'ok') {
      problems.push({ code: chain.status === 'single' ? 'ROAD_UNLINKED' : 'ROAD_JUNCTION', cells, chain });
      continue;
    }
    const head = matchEnd(chain.cells[0]);
    const tail = matchEnd(chain.cells[chain.cells.length - 1]);
    if (head.error || tail.error) {
      const bad = head.error ? head : tail;
      problems.push({ code: bad.error === 'end-ambiguous' ? 'ROAD_AMBIGUOUS' : bad.error === 'end-not-port' ? 'ROAD_UNLINKED' : 'ROAD_UNLINKED', cells, chain, endpoint: bad.point, reason: bad.error, cities: bad.cities ?? [] });
      continue;
    }
    if (head.cityId === tail.cityId) {
      problems.push({ code: 'ROAD_SELF_LOOP', cells, chain });
      continue;
    }
    // Orientation follows the traced geometry (deterministic: trace always
    // starts at the lexicographically smaller end), not city identity.
    const fromCityId = head.cityId, toCityId = tail.cityId;
    const geometry = chain.cells.map(c => ({ x: c.x, y: c.y }));
    const id = autoRoadId(source.gameId ?? 'game', fromCityId, toCityId, geometry);
    if (existing.some(r => r.id === id) || derived.some(r => r.id === id)) continue;
    if (manualEdges + derived.length >= maxEdges) {
      problems.push({ code: 'ROAD_SPACE', cells, chain });
      continue;
    }
    try {
      const built = buildRoad({ fromCityId, toCityId, travelKind: 'land',
        geometry, cities: citiesById, roads: existing, tiles }, extent);
      const road = { id, fromCityId, toCityId, travelKind: 'land', geometry, nativeBinding: built.nativeBinding };
      derived.push(road);
      existing.push(road);
    } catch (error) {
      problems.push({ code: error?.code ?? 'ROAD_POSITION', cells, chain, detail: String(error?.message ?? error).slice(0, 300) });
    }
  }
  return { derived, problems };
}
