// Server-side draft Trial session records: Q68 exact committed-snapshot binding and Q70 session-epoch revocation.
// Chapter projection compile (support domain), private derived-object resource serving and registry visuals wired; deletion cascade and runtime admission stay closed.
import { createHash } from 'node:crypto';
import { HttpError, fail } from './security.js';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { encodePNG } from './pngio.js';
import { isInstalledSourcePolicy } from './sourcecatalogpolicy.js';
import { projectTrialChapter } from '../web/src/editor/trialscope.js';
import { FIXED_TRIAL_ASSET_PATHS } from '../web/src/editor/trialassetpaths.js';
import { compileGameSource, TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { renderMinimapPixels, MINIMAP_SIZES } from '../web/src/content/authoring/minimap.js';
const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,63}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
function chapter(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_#-]{1,64}$/.test(value)) fail(422, 'TRIAL_CHAPTER'); return value; }
const LIMITS = 'Trial session with support-domain chapter projection compile, private derived-object resource serving and registry visuals wired; deletion cascade and Q69 full dependency closure not wired. Never runtime/Release admission or DRM.';
const shaBytes = value => createHash('sha256').update(value).digest('hex');
const shaText = value => createHash('sha256').update(value, 'utf8').digest('hex');
const DERIVED_ASSETS = Object.freeze(['manifest', 'chapter', 'terrain', 'roadGraph', 'roadCost', 'roadOffset', 'minimapBase', 'minimapLarge']);
const SERVED_ASSETS = Object.freeze(DERIVED_ASSETS.slice(2));
// Q69 batch 8b start gate capture sets, derived from the single fixed-library source of truth (no hardcoded ranges).
const TRIAL_PORTRAIT_CAPTURE = new Set(), TRIAL_CITY_VIEW_CAPTURE = new Set();
for (const path of FIXED_TRIAL_ASSET_PATHS) {
  let match = /^kao\/(\d+)\.png$/.exec(path); if (match) { TRIAL_PORTRAIT_CAPTURE.add(Number(match[1])); continue; }
  match = /^grf\/kyo_(\d+)\.png$/.exec(path); if (match) TRIAL_CITY_VIEW_CAPTURE.add(Number(match[1]));
}
// Q69 batch 8c: Web 产品决定（非原版机制，用户裁决 2026-10-08 选项 B 哨兵排除）：
// 章 state 中 slot 127 且 portrait byte 255 的记录按 staged manifest 已登记形态
// （slot 127 / portrait 255 / kao/255.png，全 20 章逐字节一致）从启动门缺口中排除，
// 不再 422；其它缺失（含其它槽位 255）仍拒。原版 FF/255 语义未知（14 caller 域未闭合），
// 此排除不是原版规则断言；staged manifest 仍登记 20 条未闭合引用，库仍为
// STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE。
const TRIAL_SENTINEL_SLOT = 127, TRIAL_SENTINEL_PORTRAIT = 255;
export function trialChapterAssetGaps(state) {
  const gaps = [];
  for (const general of state.generals) {
    const portrait = general?.portrait;
    if (general?.idx === TRIAL_SENTINEL_SLOT && portrait === TRIAL_SENTINEL_PORTRAIT) continue;
    if (!Number.isInteger(portrait) || !TRIAL_PORTRAIT_CAPTURE.has(portrait)) gaps.push(Object.freeze({ kind: 'kao', slot: Number.isInteger(general?.idx) ? general.idx : null, value: Number.isInteger(portrait) ? portrait : null, logicalURL: Number.isInteger(portrait) ? `kao/${portrait}.png` : null }));
  }
  for (const city of state.cities) {
    const view = city?.view;
    if (!Number.isInteger(view) || !TRIAL_CITY_VIEW_CAPTURE.has(view)) gaps.push(Object.freeze({ kind: 'kyo', slot: Number.isInteger(city?.idx) ? city.idx : null, value: Number.isInteger(view) ? view : null, logicalURL: Number.isInteger(view) ? `grf/kyo_${String(view).padStart(2, '0')}.png` : null }));
  }
  return Object.freeze(gaps);
}
export class TrialSessions {
  #sql; #principal; #games; #drafts; #catalog; #policy;
  constructor({ storage, principal, games, drafts, catalog, policy }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.snapshotReference !== 'function' || typeof games?.assertNotDeleting !== 'function' || typeof drafts?.captureForCompile !== 'function' || typeof catalog?.loadFull !== 'function' || typeof catalog?.definition !== 'function' || !isInstalledSourcePolicy(policy)) throw new TypeError('actual trial session ports required');
    this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#drafts = drafts; this.#catalog = catalog; this.#policy = policy;
    storage.transactionSync(() => this.#sql.exec("CREATE TABLE IF NOT EXISTS trial_sessions (trial_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_token_hash TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, draft_revision TEXT NOT NULL, chapter_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, snapshot_digest TEXT NOT NULL, manifest_digest TEXT, state TEXT NOT NULL CHECK(state IN ('active','ended')), end_reason TEXT, created_at TEXT NOT NULL, absolute_until INTEGER NOT NULL)"));
    storage.transactionSync(() => this.#sql.exec('CREATE TABLE IF NOT EXISTS trial_assets (trial_id TEXT NOT NULL, asset_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(trial_id,asset_id))'));
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #actor(tokenHash) { const actor = this.#principal(tokenHash); return Object.freeze({ id: actor.id, epoch: actor.epoch, absoluteUntil: actor.absolute_until }); }
  #close(trialId, reason) { this.#sql.exec("UPDATE trial_sessions SET state='ended', end_reason=? WHERE trial_id=? AND state='active'", reason, trialId); this.#sql.exec('DELETE FROM trial_assets WHERE trial_id=?', trialId); }
  #assetRow(trialId, assetId) { return this.#one('SELECT * FROM trial_assets WHERE trial_id=? AND asset_id=?', trialId, assetId); }
  #serveAsset(trialId, assetId) {
    const row = this.#assetRow(trialId, assetId);
    if (!row) return null;
    const bytes = Buffer.from(row.bytes);
    if (bytes.length !== row.byte_length || shaBytes(bytes) !== row.sha256) fail(503, 'TRIAL_ASSET_CORRUPT');
    return Object.freeze({ bytes, sha256: row.sha256, byteLength: row.byte_length });
  }
  // Registry visual descriptors from the game's copy_origins registry; the descriptors are the same public
  // compiled-atlas references the App loads anyway — owner-bound trial, no new source capability.
  async #visuals(tokenHash, gameId) {
    const origin = this.#one('SELECT * FROM copy_origins WHERE game_id=?', gameId);
    if (!origin || origin.registry_id !== this.#policy.registryId || origin.profile_revision !== this.#policy.profileRevision || origin.definition_digest !== this.#catalog.definition().definitionDigest) fail(409, 'TRIAL_SOURCE_CHANGED');
    const source = await this.#catalog.loadFull(tokenHash, origin.registry_id);
    const manifestPath = `content/builtin/compiled/${this.#policy.revision}/manifest.json`, manifestRole = this.#policy.roles.find(item => item.path === manifestPath);
    if (!manifestRole) fail(503, 'TRIAL_VISUALS_BINDING');
    const manifestBytes = source.readWeb(manifestPath);
    if (manifestBytes.length !== manifestRole.byteLength || shaBytes(manifestBytes) !== manifestRole.sha256) fail(503, 'TRIAL_VISUALS_BINDING');
    let worldManifest; try { worldManifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')); } catch { fail(503, 'TRIAL_VISUALS_BINDING'); }
    if (worldManifest?.worldRevision !== this.#policy.revision || !Array.isArray(worldManifest.assets)) fail(503, 'TRIAL_VISUALS_BINDING');
    const visuals = { seasonAtlases: {}, seasons: {} };
    for (const [kind, stem] of [['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']]) {
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const entry = worldManifest.assets.find(item => item.path === `${stem}${season}.png`), role = this.#policy.roles.find(item => item.path === `content/builtin/compiled/${this.#policy.revision}/${stem}${season}.png`);
        if (!entry || !role || entry.url !== role.path || entry.sha256 !== role.sha256 || entry.byteLength !== role.byteLength) fail(503, 'TRIAL_VISUALS_BINDING');
        visuals[kind][season] = Object.freeze({ path: entry.path, url: entry.url, sha256: entry.sha256, byteLength: entry.byteLength });
      }
    }
    return Object.freeze({ springAtlas: Object.freeze({ url: visuals.seasonAtlases.spring.url, sha256: visuals.seasonAtlases.spring.sha256, byteLength: visuals.seasonAtlases.spring.byteLength }),
      seasonAtlases: Object.freeze(visuals.seasonAtlases), seasons: Object.freeze(visuals.seasons) });
  }
  // Absolute session deadline is enforced lazily at the next observation; no keepalive is promised (§7).
  #settle(row, now) {
    if (!row || row.state !== 'active' || now < row.absolute_until) return row;
    this.#close(row.trial_id, 'session-absolute-expiry');
    return { ...row, state: 'ended', end_reason: 'session-absolute-expiry' };
  }
  #dto(row) {
    return Object.freeze({ trialId: row.trial_id, ownerId: row.owner_id, gameId: row.game_id, draftRevision: row.draft_revision, chapterId: row.chapter_id,
      snapshotId: row.snapshot_id, snapshotDigest: row.snapshot_digest, manifestDigest: row.manifest_digest, authEpoch: row.auth_epoch,
      state: row.state, endReason: row.end_reason, createdAt: row.created_at, absoluteUntil: row.absolute_until, limits: LIMITS });
  }
  #bound(tokenHash, trialId) {
    if (!uuid(trialId)) fail(422, 'TRIAL_ID');
    const actor = this.#actor(tokenHash), row = this.#settle(this.#one('SELECT * FROM trial_sessions WHERE trial_id=?', trialId), Date.now());
    if (!row || row.owner_id !== actor.id) fail(401, 'TRIAL_INVALID');
    // Re-login never resurrects or drives an old trial; the creating session and epoch must still hold (Q70).
    if (row.session_token_hash !== tokenHash || row.auth_epoch !== actor.epoch) { this.#close(row.trial_id, 'session-revoked'); fail(401, 'TRIAL_INVALID'); }
    try { this.#games.assertNotDeleting(row.game_id); } catch (error) {
      if (error instanceof HttpError && error.code === 'GAME_DELETING') { this.#close(row.trial_id, 'game-deleting'); fail(401, 'TRIAL_INVALID'); }
      throw error;
    }
    return { actor, row };
  }
  // Pre-commit DTO with current authority reads; commit() re-verifies the same authority inside the mutation transaction.
  // The exact-revision capture is async and stays outside the transaction; content_snapshots rows are immutable per (game,revision).
  async issue(tokenHash, gameId, expectedRevision, chapterId) {
    const actor = this.#actor(tokenHash);
    this.#games.assertNotDeleting(gameId);
    if (!revision(expectedRevision)) fail(422, 'DRAFT_REVISION');
    chapter(chapterId);
    const reference = this.#games.snapshotReference(tokenHash, gameId, expectedRevision);
    const snapshot = await this.#drafts.captureForCompile(tokenHash, gameId, expectedRevision);
    if (snapshot.ownerId !== actor.id || snapshot.authEpoch !== actor.epoch || snapshot.profileRevision !== FIXED_COPY_PROFILE || snapshot.reference.gameId !== gameId || snapshot.reference.draftRevision !== reference.draftRevision || snapshot.reference.sourceDigest !== reference.sourceDigest || snapshot.reference.dependencyDigest !== reference.dependencyDigest) fail(409, 'TRIAL_SNAPSHOT_CHANGED');
    let projection; try { projection = projectTrialChapter(snapshot.game, chapterId, shaText); } catch { fail(422, 'TRIAL_CHAPTER'); }
    if (projection.savedSourceDigest !== reference.sourceDigest) fail(503, 'TRIAL_SOURCE_BINDING');
    let compiled; try { compiled = compileGameSource(projection.selected, shaBytes); } catch { fail(422, 'TRIAL_CHAPTER_UNSUPPORTED'); }
    // Derived objects are computed once at issue (async compile), carried by the route and stored in commit; replays return the sealed small DTO only.
    const trialId = crypto.randomUUID(), payloads = {
      terrain: Uint8Array.from(compiled.terrainBytes),
      roadGraph: Buffer.from(JSON.stringify(compiled.roadGraph)),
      roadCost: Uint8Array.from(compiled.roadCost),
      roadOffset: Uint8Array.from(compiled.roadOffsetBytes),
    }, minimap = {};
    for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
      const { pixels } = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, compiled.width, compiled.height, size.w, size.h, 1);
      minimap[`${size.w}x${size.h}`] = shaBytes(pixels);
      payloads[name === 'base' ? 'minimapBase' : 'minimapLarge'] = encodePNG(pixels, size.w, size.h, 3);
    }
    const roles = { terrain: 'rules-initial-terrain', roadGraph: 'native-road-v2', roadCost: 'legacy-grid-visual', roadOffset: 'legacy-grid-visual', minimapBase: 'automatic-minimap', minimapLarge: 'automatic-minimap' };
    const entries = Object.entries(payloads).map(([assetId, data]) => ({ assetId, sha256: shaBytes(data), byteLength: data.length, role: roles[assetId], url: `/api/trials/${trialId}/assets/${assetId}` }));
    const visualAssets = await this.#visuals(tokenHash, gameId);
    const manifest = { schemaVersion: 1, compilerRevision: TRIAL_COMPILER_REVISION, buildFormat: 'studio-chapter-1',
      scope: { kind: 'chapter', chapterId, savedSourceDigest: projection.savedSourceDigest, selectedSourceDigest: projection.selectedSourceDigest },
      compatibilityAssetMode: compiled.compatibilityAssetMode, ruleProfile: projection.selected.ruleProfile,
      identity: { gameId, draftRevision: reference.draftRevision, sourceDigest: projection.selectedSourceDigest, savedSourceDigest: projection.savedSourceDigest,
        trialSnapshotId: `${gameId}@${reference.draftRevision}:${projection.selectedSourceDigest}:chapter:${shaText(chapterId)}` },
      world: { id: `${gameId}-world`, revision: projection.selectedSourceDigest, width: compiled.width, height: compiled.height, tileSize: 16 },
      chapters: [chapterId], visualAssets, minimap,
      minimapAssets: entries.filter(entry => entry.assetId.startsWith('minimap')), assets: entries.filter(entry => !entry.assetId.startsWith('minimap')) };
    const chapterState = projection.selected.chapters[chapterId]?.state;
    if (!chapterState || typeof chapterState !== 'object' || !Array.isArray(chapterState.generals) || !Array.isArray(chapterState.cities)) fail(422, 'TRIAL_CHAPTER');
    // Q69 batch 8b start gate: reject the start when any chapter asset reference misses the staged library (422, before insert).
    if (trialChapterAssetGaps(chapterState).length > 0) fail(422, 'TRIAL_CHAPTER_ASSET_MISSING');
    const derived = Object.freeze([['manifest', Buffer.from(JSON.stringify(manifest))], ['chapter', Buffer.from(JSON.stringify(chapterState))], ...Object.entries(payloads).map(([assetId, data]) => [assetId, Buffer.from(data)])]
      .map(([assetId, bytes]) => Object.freeze({ assetId, sha256: shaBytes(bytes), byteLength: bytes.length, bytes })));
    return { trial: Object.freeze({ trialId, ownerId: actor.id, gameId, draftRevision: reference.draftRevision, chapterId,
      snapshotId: reference.rootKey, snapshotDigest: reference.sourceDigest, manifestDigest: projection.selectedSourceDigest, authEpoch: actor.epoch,
      state: 'active', endReason: null, createdAt: new Date().toISOString(), absoluteUntil: actor.absoluteUntil, limits: LIMITS }),
      derived };
  }
  commit(tokenHash, dto, derived) {
    const actor = this.#actor(tokenHash);
    if (!dto || typeof dto !== 'object' || !uuid(dto.trialId) || dto.ownerId !== actor.id || dto.authEpoch !== actor.epoch || dto.state !== 'active' || dto.endReason !== null || !/^[a-f0-9]{64}$/.test(dto.manifestDigest ?? '') || dto.absoluteUntil !== actor.absoluteUntil) fail(422, 'TRIAL_RECEIPT');
    if (!Array.isArray(derived) || derived.length !== DERIVED_ASSETS.length || derived.some((item, index) => !item || item.assetId !== DERIVED_ASSETS[index] || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || !Number.isSafeInteger(item.byteLength) || !(item.bytes instanceof Uint8Array) || item.bytes.length !== item.byteLength || item.byteLength === 0 || shaBytes(item.bytes) !== item.sha256)) fail(422, 'TRIAL_DERIVED');
    this.#games.assertNotDeleting(dto.gameId);
    const reference = this.#games.snapshotReference(tokenHash, dto.gameId, dto.draftRevision);
    if (reference.rootKey !== dto.snapshotId || reference.sourceDigest !== dto.snapshotDigest) fail(409, 'TRIAL_SNAPSHOT_CHANGED');
    this.#sql.exec('INSERT INTO trial_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', dto.trialId, dto.ownerId, tokenHash, dto.authEpoch, dto.gameId, dto.draftRevision, dto.chapterId, dto.snapshotId, dto.snapshotDigest, dto.manifestDigest, 'active', null, dto.createdAt, dto.absoluteUntil);
    for (const item of derived) this.#sql.exec('INSERT INTO trial_assets VALUES(?,?,?,?,?)', dto.trialId, item.assetId, item.sha256, item.byteLength, item.bytes);
  }
  status(tokenHash, trialId) { return this.#dto(this.#bound(tokenHash, trialId).row); }
  // Active-only binding for private resource routes; ended or stale bindings are 401, never inferred.
  authorize(tokenHash, trialId) {
    const { row } = this.#bound(tokenHash, trialId);
    if (row.state !== 'active') fail(401, 'TRIAL_INVALID');
    return Object.freeze({ trialId: row.trial_id, ownerId: row.owner_id, gameId: row.game_id, draftRevision: row.draft_revision, chapterId: row.chapter_id, snapshotId: row.snapshot_id, snapshotDigest: row.snapshot_digest, manifestDigest: row.manifest_digest, authEpoch: row.auth_epoch });
  }
  pack(tokenHash, trialId) {
    const bound = this.authorize(tokenHash, trialId);
    const manifestRow = this.#serveAsset(trialId, 'manifest'), chapterRow = this.#serveAsset(trialId, 'chapter');
    if (!manifestRow || !chapterRow) fail(503, 'TRIAL_DERIVED_MISSING');
    let manifest, chapter;
    try { manifest = JSON.parse(manifestRow.bytes); chapter = JSON.parse(chapterRow.bytes); } catch { fail(503, 'TRIAL_DERIVED_MISSING'); }
    return Object.freeze({ manifest, chapterId: bound.chapterId, chapter,
      binding: Object.freeze({ trialId: bound.trialId, ownerId: bound.ownerId, gameId: bound.gameId, draftRevision: bound.draftRevision, chapterId: bound.chapterId, snapshotId: bound.snapshotId, snapshotDigest: bound.snapshotDigest, manifestDigest: bound.manifestDigest, authEpoch: bound.authEpoch }) });
  }
  asset(tokenHash, trialId, assetId) {
    if (typeof assetId !== 'string' || !/^[A-Za-z]{1,32}$/.test(assetId)) fail(422, 'TRIAL_ASSET_ID');
    this.authorize(tokenHash, trialId);
    if (!SERVED_ASSETS.includes(assetId)) fail(404, 'TRIAL_ASSET_NOT_FOUND');
    const served = this.#serveAsset(trialId, assetId);
    if (!served) fail(404, 'TRIAL_ASSET_NOT_FOUND');
    return served;
  }
  endPreview(tokenHash, trialId) {
    const { row } = this.#bound(tokenHash, trialId);
    return this.#dto(row.state === 'active' ? { ...row, state: 'ended', end_reason: 'explicit' } : row);
  }
  endCommit(tokenHash, trialId, expected) {
    const { row } = this.#bound(tokenHash, trialId);
    if (row.state === 'active') this.#close(row.trial_id, 'explicit');
    const final = this.#dto(this.#one('SELECT * FROM trial_sessions WHERE trial_id=?', trialId));
    if (!expected || final.state !== expected.state || final.endReason !== expected.endReason || final.trialId !== expected.trialId) fail(409, 'TRIAL_CHANGED');
    return final;
  }
}
