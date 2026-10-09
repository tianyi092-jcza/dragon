// Exact saved fixed-copy private available bytes; NEVER runtime/Trial/Release admission.
import { createHash } from 'node:crypto';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { FIXED_TRIAL_ASSET_PATHS, TRIAL_ASSET_PROFILE } from '../web/src/editor/trialassetpaths.js';
import { isInstalledSourcePolicy } from './sourcecatalogpolicy.js';
import { fail } from './security.js';
const text = value => Buffer.concat(encodeSourceChunks(value)).toString('utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const route = new RegExp('^/api/games/(' + uid + '|wolong-builtin)/draft/library-assets(?:/(library-[0-9]{3}))?$');
const admission = 'private-available-bytes-only';
export class PrivateLibraryAssets {
  #sql; #principal; #games; #drafts; #catalog; #policy;
  constructor({ storage, principal, games, drafts, catalog, policy }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.snapshotReference !== 'function' || typeof drafts?.captureForCompile !== 'function' || typeof catalog?.loadFull !== 'function' || typeof catalog?.assertCapture !== 'function' || !isInstalledSourcePolicy(policy) || policy.profileRevision !== TRIAL_ASSET_PROFILE || policy.mode !== 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE' || policy.roles.length !== 400) throw new TypeError('actual private fixed-library service ports required');
    this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#drafts = drafts; this.#catalog = catalog; this.#policy = policy;
  }
  match(path) { const m = route.exec(path); return m ? Object.freeze({ gameId: m[1], assetId: m[2] }) : null; }
  #actor(tokenHash, prior) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (prior && (actor.id !== prior.id || actor.epoch !== prior.epoch)) fail(401, 'SESSION_INVALID');
    if (actor.role !== 'admin') fail(403, 'FIXED_LIBRARY_ADMIN_REQUIRED');
    return actor;
  }
  #origin(gameId) {
    const origin = this.#sql.exec('SELECT * FROM copy_origins WHERE game_id=?', gameId).toArray()[0];
    if (!origin) fail(503, 'DRAFT_PROFILE_NOT_READY');
    const registered = this.#sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', origin.registry_id).toArray()[0];
    if (!registered) fail(409, 'DRAFT_SOURCE_CHANGED');
    return text({ origin, registered });
  }
  #assert(tokenHash, context) {
    this.#actor(tokenHash, context.actor);
    if (text(this.#games.snapshotReference(tokenHash, context.gameId, context.revision)) !== context.reference) fail(409, 'LIBRARY_SNAPSHOT_CHANGED');
    if (this.#origin(context.gameId) !== context.origin) fail(409, 'DRAFT_SOURCE_CHANGED');
    if (context.capture) this.#catalog.assertCapture(tokenHash, context.capture);
  }
  async read(tokenHash, path, revision) {
    path = Object.freeze({ gameId: path.gameId, assetId: path.assetId });
    const actor = this.#actor(tokenHash);
    if (typeof revision !== 'string' || !/^[1-9][0-9]{0,63}$/.test(revision)) fail(422, 'DRAFT_REVISION');
    // This actual store enforces ownership and built-in protection; no association is a grant.
    const reference = this.#games.snapshotReference(tokenHash, path.gameId, revision);
    const definition = this.#catalog.definition();
    if (definition.registryId !== this.#policy.registryId || definition.profileRevision !== this.#policy.profileRevision) fail(409, 'SOURCE_PROFILE_CHANGED');
    this.#catalog.status(tokenHash, definition.registryId);
    const assetIndex = path.assetId === undefined ? undefined : Number(path.assetId.slice('library-'.length));
    if (assetIndex !== undefined && (!Number.isInteger(assetIndex) || path.assetId !== 'library-' + String(assetIndex).padStart(3, '0') || assetIndex < 0 || assetIndex >= FIXED_TRIAL_ASSET_PATHS.length)) fail(404, 'LIBRARY_ASSET_NOT_FOUND');
    const context = { actor, gameId: path.gameId, revision, reference: text(reference), origin: this.#origin(path.gameId) };
    const source = await this.#drafts.captureForCompile(tokenHash, path.gameId, revision); this.#assert(tokenHash, context);
    if (source.ownerId !== actor.id || source.authEpoch !== actor.epoch || text(source.reference) !== context.reference) fail(409, 'LIBRARY_SNAPSHOT_CHANGED');
    // Deliberately full-source and all-role verification, not a cached DTO/manifest fast path.
    context.capture = await this.#catalog.loadFull(tokenHash, definition.registryId); this.#assert(tokenHash, context);
    const raw = context.capture.readWeb('available-library-manifest.json');
    if (raw.length !== 93530 || sha(raw) !== this.#policy.manifestDigest) fail(503, 'LIBRARY_MANIFEST_CORRUPT');
    let manifest; try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { fail(503, 'LIBRARY_MANIFEST_CORRUPT'); }
    const binding = { gameId: path.gameId, draftRevision: revision, sourceDigest: reference.sourceDigest, registryId: definition.registryId, catalogRoot: context.capture.rootDigest, admission, mode: this.#policy.mode };
    if (assetIndex === undefined) {
      const assets = FIXED_TRIAL_ASSET_PATHS.map((logicalURL, index) => ({ assetId: 'library-' + String(index).padStart(3, '0'), logicalURL, sha256: manifest.resources[logicalURL].sha256, byteLength: manifest.resources[logicalURL].byteLength, mime: manifest.resources[logicalURL].mime }));
      this.#assert(tokenHash, context);
      return { assertCurrent: () => this.#assert(tokenHash, context), body: { ...binding, assets, unresolvedReferences: this.#policy.unresolvedReferences, limits: 'Fixed available bytes only; no all-consumer/Q69/runtime/Trial/Release or cloud budget guarantee.' } };
    }
    const logicalURL = FIXED_TRIAL_ASSET_PATHS[assetIndex], descriptor = manifest.resources[logicalURL];
    const bytes = context.capture.readWeb(logicalURL);
    if (bytes.length !== descriptor.byteLength || sha(bytes) !== descriptor.sha256) fail(503, 'LIBRARY_ASSET_CORRUPT');
    this.#assert(tokenHash, context);
    return { assertCurrent: () => this.#assert(tokenHash, context), artifact: { ...binding, assetId: path.assetId, bytes, sha256: descriptor.sha256 } };
  }
}
