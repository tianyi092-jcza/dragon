// System-owned singleton; never keyed by a game ID or stored in private/<gameId>.
import { createHash } from 'node:crypto';
import { fail, HttpError } from './security.js';
import { reconcileAutoRoads, reconcileCellRoads } from './copyprofile.js';
import { baseMapSaveLane } from './basemapsavelane.js';
import { applyMapWorkspaceEdits } from './mapworkspace.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { createStrongholdDefinition } from './gamecopy.js';
import { bindCityPictureStorage, hasCityPictureView } from './citypicturestore.js';
import { siegeMatchesType } from './siegeorigin.js';
import { CITY_NUMBER_LIMITS, cityName, cityRegion } from '../web/src/content/authoring/cityrecords.js';
import { validateSystemBaseMap } from './systembasemap.js';
import { enableSeaGroundBase } from '../web/src/editor/componenttools.js';
import { MAP_EDIT_MAX_COMMANDS } from '../web/src/editor/mapeditlimits.js';
import { assertMapPositions } from '../web/src/editor/mappositionvalidation.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_TEMPLATE_BYTES = 64 * 1024 * 1024;

export class SystemBaseMapStore {
  #storage; #sql; #principal; #loadInitial;
  #verified; // Last verified bytes and their canonical JSON, never a mutable template.
  constructor({ storage, principal, loadInitialTemplate }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function' || typeof principal !== 'function' || typeof loadInitialTemplate !== 'function')
      throw new TypeError('SQLite, principal and trusted initial-template loader required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#loadInitial = loadInitialTemplate;
    bindCityPictureStorage(storage);
    this.#sql.exec('CREATE TABLE IF NOT EXISTS system_base_map (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version>0), digest TEXT NOT NULL, template_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
  }
  #admin(tokenHash) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    return actor;
  }
  #current() {
    const row = this.#sql.exec('SELECT * FROM system_base_map WHERE singleton=1').toArray()[0];
    if (!row) return null;
    if (!Number.isSafeInteger(row.version) || row.version < 1 || typeof row.template_json !== 'string' || Buffer.byteLength(row.template_json) > MAX_TEMPLATE_BYTES)
      fail(503, 'BASE_MAP_CORRUPT');
    let template;
    try { template = JSON.parse(row.template_json); } catch { fail(503, 'BASE_MAP_CORRUPT'); }
    const rawHash = sha(row.template_json);
    if (this.#verified?.rawHash !== rawHash || this.#verified.digest !== row.digest) {
      const text = canonicalDigest(template, canonical => canonical);
      if (sha(text) !== row.digest) fail(503, 'BASE_MAP_CORRUPT');
      this.#verified = { rawHash, digest: row.digest, text };
    }
    return { version: row.version, digest: row.digest, template, updatedAt: row.updated_at };
  }
  read(tokenHash) { this.#admin(tokenHash); return this.#current(); }
  // 基础据点编辑：与游戏级城池据点同字段口径（改名＋州郡＋数值），坐标与槽位归地图侧。
  saveCities(tokenHash, patch) {
    this.#admin(tokenHash);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail(422, 'BASE_CITIES_PATCH');
    const current = this.capture();
    const cities = structuredClone(current.template.content.cities);
    for (const field of ['rename', 'region', 'numbers', 'battlefield', 'troopcap']) {
      if (Object.keys(patch[field] ?? {}).some(id => !Object.hasOwn(cities, id))) fail(422, 'BASE_CITY');
    }
    let changed = false;
    if (patch.create !== undefined) {
      if (Object.keys(patch).length !== 1) fail(422, 'BASE_CITIES_PATCH');
      const city = createStrongholdDefinition(cities, patch.create);
      cities[city.cityId] = city;
      changed = true;
    }
    if (patch.rename !== undefined) {
      if (!patch.rename || typeof patch.rename !== 'object' || Array.isArray(patch.rename)) fail(422, 'BASE_CITY');
      const seen = new Set(Object.values(cities).map(city => city.name));
      for (const [cityId, name] of Object.entries(patch.rename)) {
        const row = cities[cityId];
        if (!row) fail(422, 'BASE_CITY');
        let cleaned; try { cleaned = cityName(name); } catch { fail(422, 'BASE_CITY'); }
        if ([...cleaned].length < 1 || [...cleaned].length > 12) fail(422, 'BASE_CITY');
        if (cleaned === row.name) continue;
        seen.delete(row.name);
        if (seen.has(cleaned)) fail(409, 'BASE_CITY_NAME_TAKEN');
        seen.add(cleaned);
        row.name = cleaned; changed = true;
      }
    }
    if (patch.region !== undefined) {
      if (!patch.region || typeof patch.region !== 'object' || Array.isArray(patch.region)) fail(422, 'BASE_CITY');
      for (const [cityId, region] of Object.entries(patch.region)) {
        const row = cities[cityId];
        if (!row) fail(422, 'BASE_CITY');
        let cleaned; try { cleaned = cityRegion(region); } catch { fail(422, 'BASE_CITY'); }
        if (row.region !== cleaned) { row.region = cleaned; changed = true; }
      }
    }
    if (patch.numbers !== undefined) {
      if (!patch.numbers || typeof patch.numbers !== 'object' || Array.isArray(patch.numbers)) fail(422, 'BASE_CITY');
      for (const [cityId, values] of Object.entries(patch.numbers)) {
        const row = cities[cityId];
        if (!row) fail(422, 'BASE_CITY');
        if (!values || typeof values !== 'object' || Array.isArray(values)) fail(422, 'BASE_CITY');
        for (const [key, n] of Object.entries(values)) {
          if (!['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view'].includes(key)) fail(422, 'BASE_CITY');
          if (key === 'view' && n === null) { delete row.view; changed = true; continue; }
          if (!Number.isSafeInteger(n) || n < 0 || n > CITY_NUMBER_LIMITS[key] || (key === 'view' && !hasCityPictureView(n))) fail(422, 'BASE_CITY');
          if (row[key] !== n) { row[key] = n; changed = true; }
        }
      }
    }
    if (patch.battlefield !== undefined) {
      if (!patch.battlefield || typeof patch.battlefield !== 'object' || Array.isArray(patch.battlefield)) fail(422, 'BASE_CITY');
      for (const [cityId, battleMapId] of Object.entries(patch.battlefield)) {
        const row = cities[cityId];
        if (!row) fail(422, 'BASE_CITY');
        if (typeof battleMapId !== 'string' || !/^ki-1995:siege:(\d{1,3})$/.test(battleMapId) || Number(/^ki-1995:siege:(\d{1,3})$/.exec(battleMapId)[1]) > 191) fail(422, 'BASE_CITY');
        if (row.battleMapId !== battleMapId) { row.battleMapId = battleMapId; changed = true; }
      }
    }
    for (const id of new Set([...Object.keys(patch.battlefield ?? {}), ...Object.keys(patch.numbers ?? {}).filter(id => cities[id].type !== current.template.content.cities[id].type)])) {
      if (!siegeMatchesType(cities[id].battleMapId, cities[id].type)) fail(422, 'BASE_CITY');
    }
    if (patch.troopcap !== undefined) {
      if (!patch.troopcap || typeof patch.troopcap !== 'object' || Array.isArray(patch.troopcap)) fail(422, 'BASE_CITY');
      for (const [cityId, troopsCap] of Object.entries(patch.troopcap)) {
        const row = cities[cityId];
        if (!row) fail(422, 'BASE_CITY');
        if (!Number.isInteger(troopsCap) || troopsCap < 0 || troopsCap > 255) fail(422, 'BASE_CITY');
        if (row.troops_cap !== troopsCap) { row.troops_cap = troopsCap; changed = true; }
      }
    }
    if (!changed) fail(422, 'BASE_CITIES_PATCH');
    // The verified template's map, protected assets and provenance are unchanged.
    const template = { ...current.template, content: { ...current.template.content, cities } };
    // Replacing an existing value with canonical city JSON preserves the canonical
    // key order of the verified document without walking its map arrays again.
    const cityText = canonicalDigest(cities, canonical => canonical);
    const [{ text }] = this.#sql.exec("SELECT json_set(?, '$.content.cities', json(?)) AS text", this.#verified.text, cityText).toArray();
    const version = current.version + 1;
    if (!Number.isSafeInteger(version)) fail(409, 'BASE_MAP_VERSION_EXHAUSTED');
    if (Buffer.byteLength(text) > MAX_TEMPLATE_BYTES) fail(413, 'BASE_MAP_TOO_LARGE');
    const digest = sha(text), updatedAt = new Date().toISOString();
    this.#storage.transactionSync(() => this.#sql.exec('UPDATE system_base_map SET version=?,digest=?,template_json=?,updated_at=? WHERE singleton=1', version, digest, text, updatedAt));
    this.#verified = { rawHash: digest, digest, text };
    return { version, digest, template, updatedAt };
  }
  // 整份替换：复制成功／从游戏直推时用游戏级据点定义整体覆盖系统基。
  // 仅做形状校验（与模板校验一致），不要求 x/y（未落子储备允许缺坐标）。
  replaceCities(tokenHash, cities) {
    this.#admin(tokenHash);
    if (!cities || typeof cities !== 'object' || Array.isArray(cities) || !Object.keys(cities).length) fail(422, 'BASE_CITIES');
    const current = this.capture();
    try {
      return this.save(tokenHash, { ...current.template, content: { ...current.template.content, cities: structuredClone(cities) } });
    } catch (error) {
      if (error instanceof RangeError) throw new HttpError(422, 'BASE_CITIES_INVALID', { problems: [{ message: error.message.slice(0, 512) }] });
      throw error;
    }
  }
  // Internal port for already-authorized creation. No public template read grant.
  capture() {
    const snapshot = this.#current();
    if (!snapshot) fail(409, 'BASE_MAP_NOT_INITIALIZED');
    return snapshot;
  }
  async initialize(tokenHash) {
    this.#admin(tokenHash);
    const current = this.#current();
    if (current) return current;
    // Loader owns source/SHA admission. HTTP supplies no template or source URL.
    const initial = await this.#loadInitial(tokenHash);
    this.#admin(tokenHash);
    // Only first creation defaults to the new Web model. Existing persisted
    // templates/copies are untouched until an explicit workspace save.
    const template = { ...initial, content: enableSeaGroundBase(initial.content) };
    const { digest } = validateSystemBaseMap(template, sha);
    const text = JSON.stringify(template);
    if (Buffer.byteLength(text) > MAX_TEMPLATE_BYTES) fail(413, 'BASE_MAP_TOO_LARGE');
    return this.#storage.transactionSync(() => {
      this.#admin(tokenHash);
      // A second initialize awaiting the same source must not overwrite edits.
      const installed = this.#current();
      if (installed) return installed;
      this.#sql.exec('INSERT INTO system_base_map VALUES(1,1,?,?,?)', digest, text, new Date().toISOString());
      return this.#current();
    });
  }
  edit(tokenHash, edits, metrics) {
    this.#admin(tokenHash);
    let stamp = performance.now();
    const phase = name => { if (metrics) { const now = performance.now(); metrics[name] = Math.round(now - stamp); stamp = now; } };
    if (!Array.isArray(edits) || !edits.length || edits.length > MAP_EDIT_MAX_COMMANDS) fail(422, 'BASE_MAP_EDITS');
    const current = this.capture();
    phase('readMs');
    try {
      const candidate = applyMapWorkspaceEdits({ gameId: 'system-base-map', ...current.template.content }, edits);
      phase('applyMs');
      const lane = baseMapSaveLane(current.template.content, candidate, edits);
      phase('classifyMs');
      if (metrics) metrics.lane = lane;
      if (candidate.map.format === 'cell-map-1' && lane !== 'direct' && !edits.every(e => e.op === 'cell-convert')) reconcileCellRoads(candidate);
      if (lane !== 'direct' && candidate.map.format !== 'cell-map-1') {
        reconcileAutoRoads(candidate);
        assertMapPositions(candidate);
        phase('roadsPositionsMs');
      }
      const { gameId, ...content } = candidate;
      return this.#save(tokenHash, { ...current.template, content }, current, metrics, phase, lane);
    } catch (error) {
      // Expected authoring/compiler rejections are actionable, not HTTP 500.
      // No SQL/native exception or stack trace is converted to a success DTO.
      if (error instanceof RangeError || error instanceof TypeError)
        throw new HttpError(422, 'BASE_MAP_INVALID', error.detail ?? { problems: [{ message: error.message.slice(0, 512) }] });
      throw error;
    }
  }
  save(tokenHash, template) {
    this.#admin(tokenHash);
    return this.#save(tokenHash, template, this.capture());
  }
  #save(tokenHash, template, current, metrics, phase, lane = 'full') {
    const text = JSON.stringify(template), bytes = Buffer.byteLength(text);
    phase?.('serializeMs');
    if (metrics) Object.assign(metrics, { templateBytes: bytes, limitBytes: MAX_TEMPLATE_BYTES, ...(template.content.map.format === 'cell-map-1' ? { cellCount: template.content.map.bounds.width * template.content.map.bounds.height } : { decorations: template.content.map.decorations.length }), roads: template.content.map.roads.length });
    if (bytes > MAX_TEMPLATE_BYTES) {
      // Only rejected saves pay for the extra per-section measurements.
      if (metrics) {
        const { map, ...sections } = template.content;
        metrics.sectionBytes = Object.fromEntries([...Object.entries(sections), ...Object.entries(map).map(([k,v]) => [`map.${k}`, v])].map(([k,v]) => [k, Buffer.byteLength(JSON.stringify(v))]));
        phase?.('sizeBreakdownMs');
      }
      fail(413, 'BASE_MAP_TOO_LARGE', { bytes, limitBytes: MAX_TEMPLATE_BYTES, excessBytes: bytes - MAX_TEMPLATE_BYTES });
    }
    // The existing topology compiler owns the composed CB..D3 node scan and road encoding gates.
    const digest = lane === 'direct' ? canonicalDigest(template, sha) : validateSystemBaseMap(template, sha).digest;
    phase?.(lane === 'direct' ? 'digestMs' : 'validateCompileMs');
    // This release edits map content, not the approved immutable asset catalog.
    if (canonicalDigest(template.content.editorAssets, sha) !== canonicalDigest(current.template.content.editorAssets, sha))
      fail(422, 'BASE_MAP_ASSETS_PROTECTED');
    if (canonicalDigest(template.provenance, sha) !== canonicalDigest(current.template.provenance, sha))
      fail(422, 'BASE_MAP_PROVENANCE_PROTECTED');
    if (!Number.isSafeInteger(current.version + 1)) fail(409, 'BASE_MAP_VERSION_EXHAUSTED');
    phase?.('protectedFieldsMs');
    const version = current.version + 1, updatedAt = new Date().toISOString();
    this.#storage.transactionSync(() => {
      this.#admin(tokenHash);
      this.#sql.exec('UPDATE system_base_map SET version=?,digest=?,template_json=?,updated_at=? WHERE singleton=1', version, digest, text, updatedAt);
    });
    phase?.('commitMs');
    // The controller always reloads authoritative bytes after the receipt. Legacy callers still get a snapshot.
    return metrics ? { version, digest, updatedAt } : this.#current();
  }
}
