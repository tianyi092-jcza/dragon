// Ambient-transaction producer. Root owns authorization, permanent request
// replay and verified staging; this module never reads R2 or reconstructs a
// queued operation from mutable SQL. No physical-delete completion capability.
import { randomUUID } from 'node:crypto';
import { FrozenDistributionLedger } from './distributionledger.js';
import { projectPublicationCatalog, validatePublicationCatalog } from './publicationcatalog.js';
import { isGameId, sameIdentity, validateRuntimeReference, parseJSON } from '../reader/runtimecontract.js';
import { fail } from './security.js';
const check = value => { if (!value) fail(503, 'DISTRIBUTION_AUTHORITY_CORRUPT'); };
export class FrozenPublicationProducer {
  #sql; #ledger;
  constructor({ storage }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function') throw new TypeError('same authority SQLite required');
    this.#sql = storage.sql;
    // Deliberately no receipt trust. A separately assembled publisher verifies
    // service observations against the same durable ledger, never client JSON.
    this.#ledger = new FrozenDistributionLedger({ storage, verifyReceipt: () => fail(503, 'DISTRIBUTION_NOT_CONFIGURED') });
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #legacy() {
    if (this.#one('SELECT op_id FROM content_distribution_outbox LIMIT 1') || this.#one('SELECT announcement_id FROM content_announcements LIMIT 1')) fail(503, 'DISTRIBUTION_BOOTSTRAP_REQUIRED');
  }
  assertPublishable(gameId) {
    if (!isGameId(gameId)) fail(422, 'DISTRIBUTION_GAME');
    this.#legacy();
    const state = this.#ledger.status();
    if (state.blockedReason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
    if (this.#ledger.pendingForGame(gameId)) fail(409, 'DISTRIBUTION_GAME_PENDING');
    if (state.tailGeneration === 0 && this.#one('SELECT game_id FROM published_games LIMIT 1')) fail(503, 'DISTRIBUTION_BOOTSTRAP_REQUIRED');
  }
  // 帳本尾巴可能已被退役檢查點取代：退役條目只留身分憑證、沒有 payload（chunks 不再保證存在）。
  // 基線改用檢查點的錨點世代（最後一個未退役的世代），語義等同「從這一代起算」。
  #anchor(checkpointDigest) {
    const pin = this.#one('SELECT anchor_digest FROM content_distribution_checkpoints WHERE checkpoint_digest=?', checkpointDigest);
    check(pin !== undefined);
    const row = this.#one('SELECT generation FROM content_distribution_events WHERE operation_digest=?', pin.anchor_digest);
    check(row !== undefined);
    const entry = this.#ledger.entry(row.generation);
    check(entry.retired !== true);
    return entry;
  }
  #catalog(state) {
    if (state.tailGeneration === 0) return { version: 1, games: [] };
    const tail = this.#ledger.entry(state.tailGeneration);
    const previous = tail.retired === true ? this.#anchor(tail.checkpointDigest) : tail, envelope = parseJSON(previous.payload);
    check(envelope.version === 1 && envelope.catalog);
    const catalog = validatePublicationCatalog(envelope.catalog, previous);
    check(JSON.stringify(projectPublicationCatalog(catalog, previous)) === JSON.stringify(envelope.projection));
    // Promote a previous self-reference using its exact frozen descriptor.
    // Its receipt must exist before the publisher advances beyond that root.
    for (const game of catalog.games) for (const row of game.announcements) {
      if (row.firstOnline.generation === previous.generation) row.firstOnline = { generation: previous.generation, operationId: previous.operationId, operationDigest: previous.operationDigest, payloadDigest: previous.payloadDigest };
    }
    // 已物理刪除（purge）的遊戲在資料庫裡沒有任何列，所以它不能再留在在架集合裡：
    // 墓碑是給「fence 了但還沒 purge」的遊戲用的，purge 之後連墓碑都要消失，否則
    // 下一次發布會被 #assertCatalogAuthority 判成 DISTRIBUTION_AUTHORITY_CORRUPT。
    // 這不改變任何玩家可見事實：墓碑與缺席對讀者都是 410 GAME_DELETED。
    const games = catalog.games.filter(game => !!this.#one('SELECT game_id FROM content_games WHERE game_id=?', game.gameId));
    return games.length === catalog.games.length ? catalog : { version: catalog.version, games };
  }
  #assertCatalogAuthority(catalog) {
    const known = new Map(catalog.games.map(game => [game.gameId, game]));
    // Never bootstrap by silently omitting another game's old release/fence.
    const required = this.#sql.exec('SELECT game_id FROM published_games UNION SELECT game_id FROM content_deletion_fences UNION SELECT game_id FROM content_games WHERE listed<>0 OR current_release_id IS NOT NULL').toArray();
    for (const row of required) if (!known.has(row.game_id)) fail(503, 'DISTRIBUTION_BOOTSTRAP_REQUIRED');
    for (const game of catalog.games) {
      const row = this.#one('SELECT listed,current_release_id FROM content_games WHERE game_id=?', game.gameId);
      const fenced = !!this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', game.gameId);
      const pinned = !!this.#one('SELECT game_id FROM published_games WHERE game_id=?', game.gameId);
      check(row && row.listed === Number(game.listed) && fenced === game.deleted);
      if (game.deleted) check(!pinned);
      else check(row.current_release_id === (game.current?.releaseId ?? null) && pinned === (game.current !== null));
    }
  }
  #current(game, runtime) {
    validateRuntimeReference(runtime, runtime?.runtime);
    check(runtime.gameId === game.game_id && runtime.releaseId === game.current_release_id);
    const release = this.#one('SELECT * FROM content_releases WHERE release_id=? AND game_id=?', runtime.releaseId, runtime.gameId);
    const published = this.#one('SELECT * FROM published_games WHERE game_id=?', runtime.gameId);
    check(release && published && published.owner_id === game.owner_id);
    const pin = parseJSON(new TextEncoder().encode(published.pin_json));
    check(sameIdentity(runtime, { gameId: release.game_id, releaseId: release.release_id, ordinal: release.ordinal, revision: release.draft_revision, sourceDigest: release.source_digest }));
    check(pin.gameId === runtime.gameId && pin.ordinal === runtime.ordinal && pin.revision === runtime.revision && pin.sourceDigest === runtime.sourceDigest && JSON.stringify(pin.chapters) === JSON.stringify(runtime.chapters));
    return { gameId: runtime.gameId, releaseId: runtime.releaseId, ordinal: runtime.ordinal, revision: runtime.revision, sourceDigest: runtime.sourceDigest, chapters: [...runtime.chapters], runtime: { ...runtime.runtime }, name: pin.name, publishedAt: pin.publishedAt, createdAt: release.created_at };
  }
  recordInTxn(kind, gameId, runtime) {
    if (!['publish', 'listing', 'restriction', 'delete-fence'].includes(kind) || !isGameId(gameId)) fail(422, 'DISTRIBUTION_OPERATION');
    this.#legacy();
    const state = this.#ledger.status();
    if (state.blockedReason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
    if (kind === 'publish' && this.#ledger.pendingForGame(gameId)) fail(409, 'DISTRIBUTION_GAME_PENDING');
    const catalog = this.#catalog(state), context = { authorityId: state.authorityId, generation: state.tailGeneration + 1 };
    const row = this.#one('SELECT g.*,u.account FROM content_games g JOIN users u ON u.id=g.owner_id WHERE g.game_id=?', gameId);
    check(row && [0, 1].includes(row.listed) && [0, 1].includes(row.restricted) && !(row.listed && row.restricted));
    const fenced = !!this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', gameId);
    check(fenced === (kind === 'delete-fence'));
    let game = catalog.games.find(item => item.gameId === gameId);
    if (!game) { game = { gameId, listed: false, deleted: false, current: null, announcements: [] }; catalog.games.push(game); }
    check(!game.deleted);
    if (state.tailGeneration === 0) {
      const published = this.#sql.exec('SELECT game_id FROM published_games').toArray();
      check(kind === 'publish' ? published.length === 1 && published[0].game_id === gameId : published.length === 0);
    }
    if (kind === 'publish') {
      const current = this.#current(row, runtime);
      check(current.ordinal === (game.current ? `1.${BigInt(game.current.ordinal.slice(2)) + 1n}` : '1.0'));
      game.current = current;
    } else check(runtime === undefined);
    game.listed = row.listed === 1;
    if (kind === 'delete-fence') {
      check(!game.listed); game.deleted = true; game.current = null; game.announcements = [];
    } else {
      check(game.current ? row.current_release_id === game.current.releaseId : row.current_release_id === null);
      if (game.listed) {
        check(game.current && typeof row.account === 'string');
        if (!game.announcements.some(item => item.releaseId === game.current.releaseId)) game.announcements.push({ releaseId: game.current.releaseId, ordinal: game.current.ordinal, name: game.current.name, creatorAccount: row.account, publishedAt: game.current.createdAt, firstOnline: { generation: context.generation } });
      }
    }
    this.#assertCatalogAuthority(catalog);
    const projection = projectPublicationCatalog(catalog, context);
    const envelope = { version: 1, projection, catalog };
    if (kind === 'publish') envelope.runtime = structuredClone(runtime);
    const payload = new TextEncoder().encode(JSON.stringify(envelope));
    // The permanent publish receipt already retains this UUID after pruning.
    // Use it as the publish operation identity, not an ordinal/payload scan.
    const operationId = kind === 'publish' ? runtime.releaseId : randomUUID();
    return this.#ledger.enqueueInTxn({ operationId, kind, gameId, payload });
  }
}
