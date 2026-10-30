// Draft topology intents (B-1, Q14): city-move wishes stored OUTSIDE the
// canonical game object (the FixedCopyProfile compares the whole graph, so
// intent state must never ride inside it). Any pending intent blocks draft
// save and publish until reverted; geometry rebuild arrives in B-2.
import { fail } from './security.js';
import { moveCityIntent } from '../web/src/content/authoring/roadedit.js';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

export function hasPendingMoves(storage, gameId) {
  // Databases predating the topology table (including sealed-lane DBs) have
  // no intents by construction; only that absence is tolerated here.
  let rows;
  try {
    rows = storage.sql.exec('SELECT game_id FROM draft_topology_moves WHERE game_id=? LIMIT 1', gameId).toArray();
  } catch (error) {
    if (error?.errcode === 1 && /no such table/i.test(error?.message ?? '')) { return false; }
    throw error;
  }
  return rows.length > 0;
}

export class DraftTopology {
  #sql; #principal; #games;
  constructor({ storage, principal, games }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.listOwn !== 'function' || typeof games?.assertNotDeleting !== 'function') {
      throw new TypeError('actual SQL, principal and game directory required');
    }
    this.#sql = storage.sql; this.#principal = principal; this.#games = games;
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_topology_moves (game_id TEXT NOT NULL, city_id TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(game_id,city_id))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_topology_rebuilds (game_id TEXT NOT NULL, road_id TEXT NOT NULL, geometry_json TEXT NOT NULL, travel_kind TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(game_id,road_id))');
    });
  }
  #owned(tokenHash, gameId) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'TOPOLOGY_GAME_ID');
    const entry = this.#games.listOwn(tokenHash).find(g => g.gameId === gameId);
    if (!entry) fail(404, 'GAME_NOT_FOUND');
    this.#games.assertNotDeleting(gameId);
    return actor;
  }
  record(tokenHash, game, { cityId, x, y }) {
    const gameId = game?.gameId;
    this.#owned(tokenHash, gameId);
    let intent;
    try { intent = moveCityIntent(game, cityId, x, y); }
    catch (error) { fail(422, 'TOPOLOGY_MOVE_' + (error.code ?? 'INVALID').toUpperCase().replace(/[^A-Z0-9]+/g, '_')); }
    const time = new Date().toISOString();
    this.#sql.exec('INSERT OR REPLACE INTO draft_topology_moves VALUES(?,?,?,?,?)', gameId, intent.cityId, intent.x, intent.y, time);
    return intent;
  }
  clear(tokenHash, gameId, cityId) {
    this.#owned(tokenHash, gameId);
    if (cityId === undefined) { this.#sql.exec('DELETE FROM draft_topology_moves WHERE game_id=?', gameId); return 0; }
    if (typeof cityId !== 'string' || !cityId) fail(422, 'TOPOLOGY_CITY_ID');
    const row = this.#sql.exec('DELETE FROM draft_topology_moves WHERE game_id=? AND city_id=? RETURNING *', gameId, cityId).toArray()[0];
    return row ? 1 : 0;
  }
  list(tokenHash, gameId) {
    this.#owned(tokenHash, gameId);
    return Object.freeze(this.#sql.exec('SELECT city_id, x, y, updated_at FROM draft_topology_moves WHERE game_id=? ORDER BY city_id', gameId).toArray()
      .map(row => Object.freeze({ cityId: row.city_id, x: row.x, y: row.y, updatedAt: row.updated_at })));
  }
  // Reconnect geometry recording (B-2): shape checks only (bounds, integer
  // steps, Chebyshev-1 continuity, endpoint identity). Flags/cost/slots need
  // tile evidence and stay B-3; a recorded rebuild does NOT clear the gate.
  rebuild(tokenHash, game, { roadId, geometry, travelKind }) {
    const gameId = game?.gameId;
    this.#owned(tokenHash, gameId);
    const road = (game?.map?.roads ?? []).find(r => r?.id === roadId);
    if (!road) fail(404, 'TOPOLOGY_ROAD_NOT_FOUND');
    if (travelKind !== 'land' && travelKind !== 'water') fail(422, 'TOPOLOGY_TRAVEL_KIND');
    if (!Array.isArray(geometry) || geometry.length < 2 || geometry.length > 6144) fail(422, 'TOPOLOGY_GEOMETRY');
    for (const [i, pt] of geometry.entries()) {
      if (!pt || !Number.isInteger(pt.x) || !Number.isInteger(pt.y) || pt.x < 0 || pt.x > 383 || pt.y < 0 || pt.y > 255) {
        fail(422, 'TOPOLOGY_GEOMETRY');
      }
      if (i > 0) {
        const prev = geometry[i - 1];
        if (Math.max(Math.abs(pt.x - prev.x), Math.abs(pt.y - prev.y)) !== 1) fail(422, 'TOPOLOGY_GEOMETRY');
      }
    }
    const time = new Date().toISOString();
    const stored = JSON.stringify(geometry.map(p => ({ x: p.x, y: p.y })));
    if (Buffer.byteLength(stored) > 262144) fail(422, 'TOPOLOGY_GEOMETRY');
    this.#sql.exec('INSERT OR REPLACE INTO draft_topology_rebuilds VALUES(?,?,?,?,?)', gameId, roadId, stored, travelKind, time);
    return Object.freeze({ roadId, travelKind, points: geometry.length, fromCityId: road.fromCityId, toCityId: road.toCityId });
  }
  listRebuilds(tokenHash, gameId) {
    this.#owned(tokenHash, gameId);
    return Object.freeze(this.#sql.exec('SELECT road_id, travel_kind FROM draft_topology_rebuilds WHERE game_id=? ORDER BY road_id', gameId).toArray()
      .map(row => Object.freeze({ roadId: row.road_id, travelKind: row.travel_kind })));
  }
  clearRebuild(tokenHash, gameId, roadId) {
    this.#owned(tokenHash, gameId);
    if (typeof roadId !== 'string' || !roadId) fail(422, 'TOPOLOGY_ROAD_ID');
    const row = this.#sql.exec('DELETE FROM draft_topology_rebuilds WHERE game_id=? AND road_id=? RETURNING *', gameId, roadId).toArray()[0];
    return row ? 1 : 0;
  }
  // Display data for B-2 UI: every broken road with its recorded geometry
  // (if any) and the still-uncovered set the gate enforces.
  status(tokenHash, game, gameId) {
    this.#owned(tokenHash, gameId ?? game?.gameId);
    const id = gameId ?? game?.gameId;
    const moves = this.#sql.exec('SELECT city_id, x, y FROM draft_topology_moves WHERE game_id=? ORDER BY city_id', id).toArray()
      .map(row => Object.freeze({ cityId: row.city_id, x: row.x, y: row.y }));
    const moved = new Set(moves.map(m => m.cityId));
    const rebuilds = this.#sql.exec('SELECT road_id, travel_kind FROM draft_topology_rebuilds WHERE game_id=?', id).toArray();
    const rebuilt = new Set(rebuilds.map(r => r.road_id));
    const broken = (game?.map?.roads ?? []).filter(r => moved.has(r?.fromCityId) || moved.has(r?.toCityId)).map(r => r.id);
    const uncovered = broken.filter(roadId => !rebuilt.has(roadId));
    return Object.freeze({ gameId: id, moves, broken: Object.freeze([...broken]), rebuilt: Object.freeze([...rebuilt]), uncovered: Object.freeze([...uncovered]), blocked: moves.length > 0 });
  }
}
