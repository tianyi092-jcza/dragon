// Actual fixed-copy image planning only. Neither durable Job proof nor runtime admission.
import { createHash } from 'node:crypto';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { renderMinimapPixels, MINIMAP_SIZES, MINIMAP_STYLE_REVISION } from '../web/src/content/authoring/minimap.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { isInstalledSourcePolicy } from './sourcecatalogpolicy.js';
import { decodePNG, encodePNG, PNG_IO_REVISION } from './pngio.js';
import { fail } from './security.js';
import { createFixedTileRows, TILE_PIXEL_REVISION } from '../web/src/content/authoring/tilepixels.js';
import { encodeRowPNG, ROW_PNG_REVISION } from './rowpng.js';
export const FALLBACK_IMAGE_REVISION = 'fixed-copy-fallback-1-rows';
export const COPY_IMAGE_REVISION = 'fixed-copy-images-2-indexed124';
const sha = value => createHash('sha256').update(value).digest('hex'), canonical = value => Buffer.concat(encodeSourceChunks(value)).toString('utf8');
export class FixedCopyImages {
  #sql; #principal; #games; #drafts; #catalog; #policy; #definitionDigest; #plans = new WeakMap();
  constructor({ storage, principal, games, drafts, catalog, policy }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.snapshotReference !== 'function' || typeof drafts?.captureForCompile !== 'function' || typeof catalog?.definition !== 'function' || typeof catalog?.loadFull !== 'function' || typeof catalog?.assertCapture !== 'function' || !isInstalledSourcePolicy(policy)) throw new TypeError('actual stores, source catalog and branded fixed policy required');
    this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#drafts = drafts; this.#catalog = catalog; this.#policy = policy; this.#definitionDigest = sha(Buffer.from(canonical(policy)));
  }
  #authority(tokenHash, gameId, prior) {
    const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (prior && (actor.id !== prior.id || actor.epoch !== prior.epoch)) fail(401, 'SESSION_INVALID');
    // The current complete-copy source catalog remains administrator-only.
    if (actor.role !== 'admin') fail(403, 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (typeof gameId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(gameId)) fail(422, 'DRAFT_GAME_ID');
    const row = this.#sql.exec('SELECT owner_id FROM content_games WHERE game_id=?', gameId).toArray()[0]; if (!row || row.owner_id !== actor.id) fail(404, 'GAME_NOT_FOUND');
    this.#games.assertNotDeleting(gameId);
    const origin = this.#sql.exec('SELECT * FROM copy_origins WHERE game_id=?', gameId).toArray()[0], definition = this.#catalog.definition();
    if (!origin || origin.registry_id !== this.#policy.registryId || origin.profile_revision !== this.#policy.profileRevision || definition.definitionDigest !== this.#definitionDigest || origin.definition_digest !== this.#definitionDigest) fail(409, 'IMAGE_SOURCE_CHANGED');
    return { actor, origin };
  }
  #check(tokenHash, context) {
    const { origin } = this.#authority(tokenHash, context.gameId, context.actor);
    if (canonical(origin) !== canonical(context.origin) || canonical(this.#games.snapshotReference(tokenHash, context.gameId, context.reference.draftRevision)) !== canonical(context.reference)) fail(409, 'IMAGE_SOURCE_CHANGED');
    if (context.source) this.#catalog.assertCapture(tokenHash, context.source);
  }
  async #prepare(tokenHash, gameId, requested) {
    const { actor, origin } = this.#authority(tokenHash, gameId), snapshot = await this.#drafts.captureForCompile(tokenHash, gameId, requested);
    if (snapshot.ownerId !== actor.id || snapshot.authEpoch !== actor.epoch || snapshot.profileRevision !== this.#policy.profileRevision || snapshot.reference.gameId !== gameId || snapshot.reference.draftRevision !== requested) fail(409, 'IMAGE_SNAPSHOT_CHANGED');
    const context = { actor, origin, gameId, reference: snapshot.reference }; this.#check(tokenHash, context);
    const source = await this.#catalog.loadFull(tokenHash, origin.registry_id); context.source = source; this.#check(tokenHash, context);
    if (source.registryId !== origin.registry_id || source.definitionDigest !== origin.definition_digest || source.rootDigest !== origin.catalog_root) fail(409, 'IMAGE_SOURCE_CHANGED');
    let compiled; try { compiled = compileGameSource(snapshot.game, sha); } catch { fail(422, 'IMAGE_COMPILE_UNSUPPORTED'); }
    if (compiled.sourceDigest !== context.reference.sourceDigest) fail(422, 'IMAGE_SOURCE_BINDING');
    return { context, compiled, source };
  }
  async capture(tokenHash, gameId, requested) {
    const { context, compiled, source } = await this.#prepare(tokenHash, gameId, requested);
    const outputs = [], prefix = 'content/builtin/compiled/' + this.#policy.revision + '/';
    const append = (assetId, png, image) => outputs.push(Object.freeze({ assetId, bytes: Uint8Array.from(png), byteLength: png.length, sha256: sha(png), width: image.width, height: image.height, pixelSha256: sha(image.pixels) }));
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      this.#check(tokenHash, context); const path = prefix + 'map_atlas_' + season + '.png', role = this.#policy.roles.find(item => item.path === path); if (!role) fail(503, 'IMAGE_ROLE_REQUIRED');
      const raw = source.readWeb(path); if (raw.length !== role.byteLength || sha(raw) !== role.sha256) fail(503, 'IMAGE_ROLE_CORRUPT');
      const image = decodePNG(raw); if (image.width !== 256 || image.height !== 256) fail(422, 'IMAGE_ATLAS_DIMENSIONS'); append('atlas_' + season, encodePNG(image.pixels, image.width, image.height), image);
    }
    for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
      const image = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, compiled.width, compiled.height, size.w, size.h, 1), png = encodePNG(image.pixels, size.w, size.h, 3), rgba = new Uint8Array(size.w * size.h * 4);
      for (let at = 0; at < size.w * size.h; at++) { rgba.set(image.pixels.subarray(at * 3, at * 3 + 3), at * 4); rgba[at * 4 + 3] = 255; }
      append('minimap_' + name, png, { width: size.w, height: size.h, pixels: rgba });
    }
    this.#check(tokenHash, context);
    const report = Object.freeze({ schema: 'dragon-fixed-copy-images-1', gameId, draftRevision: requested, sourceDigest: context.reference.sourceDigest, dependencyDigest: context.reference.dependencyDigest, registryId: source.registryId, definitionDigest: source.definitionDigest, catalogRoot: source.rootDigest, compilerRevision: COPY_IMAGE_REVISION, pngRevision: PNG_IO_REVISION, minimapStyleRevision: MINIMAP_STYLE_REVISION, seed: 1, admission: 'bounded-images-only', missing: Object.freeze(['full-map-fallback', 'complete-runtime-dependencies', 'runtime-admission', 'persistent-image-job']), outputs: Object.freeze(outputs.map(({ bytes: _bytes, ...descriptor }) => Object.freeze(descriptor))) });
    const plan = Object.freeze({ report, outputs: Object.freeze(outputs) }); this.#plans.set(plan, { tokenHash, context }); return plan;
  }
  // Internal trusted executor guard, never an author callback or a new source capability.
  async captureFallback(tokenHash, gameId, requested, season, guard = () => {}) {
    if (!['spring', 'summer', 'autumn', 'winter'].includes(season) || typeof guard !== 'function') fail(422, 'FALLBACK_SEASON');
    await guard();
    const { context, compiled, source } = await this.#prepare(tokenHash, gameId, requested);
    await guard(); this.#check(tokenHash, context);
    const path = 'content/builtin/compiled/' + this.#policy.revision + '/map_atlas_' + season + '.png', role = this.#policy.roles.find(item => item.path === path);
    if (!role) fail(503, 'IMAGE_ROLE_REQUIRED');
    const raw = source.readWeb(path); if (raw.length !== role.byteLength || sha(raw) !== role.sha256) fail(503, 'IMAGE_ROLE_CORRUPT');
    const atlas = decodePNG(raw); if (atlas.width !== 256 || atlas.height !== 256) fail(422, 'IMAGE_ATLAS_DIMENSIONS');
    const rows = createFixedTileRows(compiled.terrainBytes, atlas.pixels), pixels = createHash('sha256'), self = this;
    const png = await encodeRowPNG((async function* () {
      for (const row of rows) { await guard(); self.#check(tokenHash, context); pixels.update(row); yield row; }
    })(), rows.width, rows.height);
    await guard(); this.#check(tokenHash, context);
    // Existing immutable blob/checkpoint protocol, not the row encoder's larger budget.
    if (png.length > 4 * 1024 * 1024) fail(422, 'FALLBACK_OUTPUT_BUDGET');
    const output = Object.freeze({ assetId: 'fallback_' + season, bytes: Uint8Array.from(png), sha256: sha(png), byteLength: png.length, width: rows.width, height: rows.height, pixelSha256: pixels.digest('hex') });
    const { bytes: _bytes, ...descriptor } = output;
    const report = Object.freeze({ schema: 'dragon-fixed-copy-fallback-1', gameId, draftRevision: requested, sourceDigest: context.reference.sourceDigest, dependencyDigest: context.reference.dependencyDigest, registryId: source.registryId, definitionDigest: source.definitionDigest, catalogRoot: source.rootDigest, compilerRevision: FALLBACK_IMAGE_REVISION, pngRevision: PNG_IO_REVISION, rowPNGRevision: ROW_PNG_REVISION, tilePixelRevision: TILE_PIXEL_REVISION, season, admission: 'single-season-fallback-only', missing: Object.freeze(['other-season-fallbacks', 'complete-runtime-dependencies', 'runtime-admission', 'persistent-fallback-job']), outputs: Object.freeze([Object.freeze(descriptor)]) });
    const plan = Object.freeze({ report, outputs: Object.freeze([output]) }); this.#plans.set(plan, { tokenHash, context }); return plan;
  }
  assert(tokenHash, plan) {
    const known = this.#plans.get(plan); if (!known || known.tokenHash !== tokenHash) fail(403, 'IMAGE_PLAN_REQUIRED'); this.#check(tokenHash, known.context);
    for (const output of plan.outputs) if (output.bytes.length !== output.byteLength || sha(output.bytes) !== output.sha256) fail(503, 'IMAGE_PLAN_CORRUPT');
    return plan.report;
  }
}
