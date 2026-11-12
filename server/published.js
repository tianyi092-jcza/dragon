// Published-game registry: workerd Durable Object counterpart of the node
// `gameDir/publish.json` record (tools/editor_server.mjs POST /api/publish).
// One row per game; the pin shape mirrors node exactly
// ({gameId,name,revision,sourceDigest,chapters,publishedAt}), owner tracked in
// its own column for unpublish auth. Corrupt rows fail closed (503/500-class),
// never silently skipped — same fail-closed semantic as node.
// Routes (publish/unpublish/published-games auth + compiled-revision proof)
// arrive with task 3; deletion-fence cascade is wired in deletionfence.js.
import { checkGameName } from '../web/src/content/authoring/gamesource.js';
import { fail, fields } from './security.js';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const revision = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
// copy-era 修订号＝批准 ordinal（方案 B，用户裁决）：与旧数字修订并存，读 path 按形状区分版本。
const ordinalRev = value => typeof value === 'string' && /^1\.(0|[1-9][0-9]{0,30})$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export class PublishedGames {
  #storage; #sql; #principal;
  constructor({ storage, principal }) {
    if (!storage?.sql || typeof principal !== 'function') { throw new TypeError('actual SQLite and trusted principal required'); }
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal;
    storage.transactionSync(() => this.#sql.exec('CREATE TABLE IF NOT EXISTS published_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pin_json TEXT NOT NULL, updated_at TEXT NOT NULL)'));
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #actor(tokenHash) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
    return actor;
  }
  #gameId(gameId) {
    if (gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!uuid(gameId)) { fail(422, 'PUBLISH_GAME_ID'); }
    return gameId;
  }
  #displayName(name) {
    if (typeof name !== 'string' || !name.trim()) { fail(422, 'PUBLISH_NAME'); }
    try { return checkGameName(name.normalize('NFC'), 8); }
    catch { fail(422, 'PUBLISH_NAME'); }
  }
  // Read-path shape check mirrors the node published-games handler; any
  // mismatch is a corrupt registry row → fail closed, never skip.
  #readPin(gameId, raw) {
    let pin;
    try { pin = JSON.parse(raw); }
    catch { fail(500, 'PUBLISH_CORRUPT'); }
    if (!pin || pin.gameId !== gameId || typeof pin.name !== 'string' || !(revision(pin.revision ?? null) || ordinalRev(pin.revision)) || !digest(pin.sourceDigest) || !Array.isArray(pin.chapters) || !pin.chapters.every(entry => typeof entry === 'string' && entry.length > 0) || typeof pin.publishedAt !== 'string' || typeof pin.ordinal !== 'string' || !/^[0-9]+(\.[0-9]+)+$/.test(pin.ordinal)) { fail(500, 'PUBLISH_CORRUPT'); }
    // copy-era pin（ordinal 修订）必须带发布说明原文；旧数字修订 pin 无该字段，保持可读（删前兼容，正式数据清理后全为新形）。
    if (!revision(pin.revision) && typeof pin.description !== 'string') { fail(500, 'PUBLISH_CORRUPT'); }
    return Object.freeze({ gameId: pin.gameId, name: pin.name, revision: pin.revision, sourceDigest: pin.sourceDigest, chapters: Object.freeze([...pin.chapters]), publishedAt: pin.publishedAt, ordinal: pin.ordinal, description: typeof pin.description === 'string' ? pin.description : null });
  }
  // Registry write: node stamps publishedAt server-side; owner is stamped here
  // for unpublish auth. Game existence/ownership/compiled-revision proof stays
  // with the route layer (games.snapshotReference + drafts read), same split
  // as node (loadDraft + readBuild before the write).
  publish(tokenHash, input) {
    return this.#storage.transactionSync(() => this.publishInTxn(tokenHash, input));
  }
  // Ambient-transaction form for the C-2 publish commit (pin + ordinal +
  // pointer land or roll back together). Pin shape unchanged.
  publishInTxn(tokenHash, input) {
    const actor = this.#actor(tokenHash);
    fields(input, ['gameId', 'name', 'revision', 'sourceDigest', 'chapters', 'ordinal']);
    const gameId = this.#gameId(input.gameId), name = this.#displayName(input.name);
    if (!revision(input.revision)) { fail(422, 'PUBLISH_REVISION'); }
    if (typeof input.ordinal !== 'string' || !/^[0-9]+(\.[0-9]+)+$/.test(input.ordinal)) { fail(422, 'PUBLISH_ORDINAL'); }
    if (!digest(input.sourceDigest)) { fail(422, 'PUBLISH_DIGEST'); }
    if (!Array.isArray(input.chapters) || !input.chapters.every(entry => typeof entry === 'string' && entry.length > 0)) { fail(422, 'PUBLISH_CHAPTERS'); }
    const now = new Date().toISOString();
    const pin = Object.freeze({ gameId, name, revision: input.revision, sourceDigest: input.sourceDigest, chapters: Object.freeze([...input.chapters]), publishedAt: now, ordinal: input.ordinal });
    this.#sql.exec('INSERT OR REPLACE INTO published_games VALUES(?,?,?,?)', gameId, actor.id, JSON.stringify(pin), now);
    return pin;
  }
  // Trusted route only, AFTER current administrator/fence/CAS checks, in the
  // SAME transaction as the listing flag. A draft cannot be pre-listed. This
  // verifies committed SQL identity, not R2 visibility or resource closure.
  assertListableInTxn(gameId) {
    this.#gameId(gameId);
    const row = this.#one(`SELECT g.owner_id,g.current_release_id,
      r.game_id AS release_game_id,r.ordinal,r.draft_revision,r.source_digest,
      p.owner_id AS pin_owner_id,p.pin_json,
      k.revision AS pack_revision,k.source_digest AS pack_digest
      FROM content_games g
      LEFT JOIN content_releases r ON r.release_id=g.current_release_id
      LEFT JOIN published_games p ON p.game_id=g.game_id
      LEFT JOIN published_packs k ON k.game_id=g.game_id
      WHERE g.game_id=?`, gameId);
    if (!row) { fail(404, 'GAME_NOT_FOUND'); }
    if (row.current_release_id === null) { fail(409, 'GAME_NOT_PUBLISHED'); }
    if (!uuid(row.current_release_id) || row.release_game_id !== gameId || row.pin_owner_id !== row.owner_id || typeof row.pin_json !== 'string' || !/^1\.(0|[1-9][0-9]{0,30})$/.test(row.ordinal ?? '') || !(revision(row.draft_revision) || ordinalRev(row.draft_revision)) || !digest(row.source_digest) || row.pack_revision !== row.draft_revision || row.pack_digest !== row.source_digest) { fail(503, 'PUBLISH_REFERENCE_CORRUPT'); }
    const pin = this.#readPin(gameId, row.pin_json);
    if (pin.ordinal !== row.ordinal || pin.revision !== row.draft_revision || pin.sourceDigest !== row.source_digest || !pin.chapters.length || new Set(pin.chapters).size !== pin.chapters.length) { fail(503, 'PUBLISH_REFERENCE_CORRUPT'); }
  }
  // Node unpublish is idempotent (missing file → still success); missing rows
  // and the builtin no-op the same way. Only the recorded owner (or an admin)
  // may remove another owner's pin.
  unpublish(tokenHash, gameId) {
    const actor = this.#actor(tokenHash);
    if (gameId === 'wolong-builtin') { return Object.freeze({ gameId, unpublished: true }); }
    if (!uuid(gameId)) { fail(422, 'PUBLISH_GAME_ID'); }
    const row = this.#one('SELECT * FROM published_games WHERE game_id=?', gameId);
    if (!row) { return Object.freeze({ gameId, unpublished: true }); }
    if (row.owner_id !== actor.id && actor.role !== 'admin') { fail(403, 'PUBLISH_OWNER'); }
    this.#sql.exec('DELETE FROM published_games WHERE game_id=?', gameId);
    return Object.freeze({ gameId, unpublished: true });
  }
  // No auth here: the route layer decides anonymity (玩侧匿名可达 per task 1).
  // The builtin head entry is prepended by the route, as in node.
  // Only admin-listed games surface (Q25: publish is author finalization,
  // listing is the admin go-live gate); unlisted or vanished rows drop out.
  list() {
    return Object.freeze(this.#sql.exec('SELECT p.*, u.account AS creator_account FROM published_games p JOIN content_games g ON g.game_id=p.game_id JOIN users u ON u.id=g.owner_id WHERE g.listed=1 ORDER BY p.game_id').toArray().map(row => Object.freeze({ ...this.#readPin(row.game_id, row.pin_json), creatorAccount: row.creator_account })));
  }
}
