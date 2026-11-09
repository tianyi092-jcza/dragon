// Ambient-transaction producer. Root owns authorization, permanent request
// replay and verified staging; this module never reads R2 or reconstructs a
// queued operation from mutable SQL. No physical-delete completion capability.
import { randomUUID } from 'node:crypto';
import { FrozenDistributionLedger } from './distributionledger.js';
import { buildRuntimeIndex } from '../vps/runtime-index.mjs';
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
  #catalog(state, kind, gameId) {
    if (state.tailGeneration === 0) return { version: 1, games: [] };
    const tail = this.#ledger.entry(state.tailGeneration);
    const previous = tail.retired === true ? this.#anchor(tail.checkpointDigest) : tail, envelope = parseJSON(previous.payload);
    check(envelope.version === 1 && envelope.catalog);
    const frozen = validatePublicationCatalog(envelope.catalog, previous);
    check(JSON.stringify(projectPublicationCatalog(frozen, previous)) === JSON.stringify(envelope.projection));
    // 退役世代的 payload 已被清理：錨點快照只是「最後一個未退役世代」的目錄，不能當
    // 今日的目錄內容（退役世代裡才上架／公告的遊戲在裡面根本沒有條目）。目錄成員一律
    // 按資料庫權威事實重建；錨點只留公告歷史與 digest 鏈起點。
    const catalog = tail.retired === true ? this.#rebuild(frozen, previous, kind, gameId) : this.#retained(frozen);
    // Promote a previous self-reference using its exact frozen descriptor.
    // Its receipt must exist before the publisher advances beyond that root.
    for (const game of catalog.games) for (const row of game.announcements) {
      if (row.firstOnline.generation === previous.generation) row.firstOnline = { generation: previous.generation, operationId: previous.operationId, operationDigest: previous.operationDigest, payloadDigest: previous.payloadDigest };
    }
    return catalog;
  }
  // 未退役的尾巴：目錄就是那份 payload，只移除已物理刪除（purge）的遊戲。purge 之後
  // 資料庫裡沒有任何列，留著會讓下一次發布被 #assertCatalogAuthority 判成 CORRUPT；
  // 這不改變玩家可見事實（墓碑與缺席對讀者都是 410 GAME_DELETED）。
  #retained(frozen) {
    const games = frozen.games.filter(game => !!this.#one('SELECT game_id FROM content_games WHERE game_id=?', game.gameId));
    return games.length === frozen.games.length ? frozen : { version: frozen.version, games };
  }
  // 集合與旗標取 #assertCatalogAuthority 要求的同一組權威事實（在架、當前 pin、墓碑），
  // 錨點快照只提供既有公告列：那是已被清理的舊版本唯一還留著名稱與時間的紀錄。
  // 本次操作已經寫進資料庫（listed／當前 pin／墓碑），而目錄基線必須是「上一代次」的狀態，
  // 所以變更中的那款顯式回到操作前：上架尚未記錄、刪除栅欄尚未記錄、發布只看前一版序號。
  #rebuild(frozen, previous, kind, gameId) {
    const baseline = new Map(frozen.games.map(game => [game.gameId, game]));
    const ids = this.#sql.exec('SELECT game_id FROM published_games UNION SELECT game_id FROM content_deletion_fences UNION SELECT game_id FROM content_games WHERE listed<>0 OR current_release_id IS NOT NULL').toArray();
    const games = ids.map(row => {
      const { game_id: id } = row, pending = id === gameId ? kind : null;
      const game = this.#one('SELECT g.listed,g.current_release_id,u.account FROM content_games g LEFT JOIN users u ON u.id=g.owner_id WHERE g.game_id=?', id);
      const prior = baseline.get(id);
      if (this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', id) && pending !== 'delete-fence') {
        check(game && game.listed === 0);
        return { gameId: id, listed: false, deleted: true, current: null, announcements: [] };
      }
      check(game && [0, 1].includes(game.listed));
      const listed = pending === 'listing' ? false : game.listed === 1;
      let current = null;
      if (pending === 'publish') current = this.#previous(id);
      else if (pending !== 'delete-fence' && game.current_release_id !== null) current = this.#pinned(id, game.current_release_id, prior?.current ?? null);
      const announcements = current === null ? [] : [...(prior?.announcements ?? [])];
      // 在架遊戲必須有一列當前版本的公告（validatePublicationCatalog 要求），名稱／時間
      // 與 recordInTxn 的 listing 分支逐位相同；本次操作自己的那一列由 recordInTxn 建。
      if (current !== null && current.releaseId !== undefined && pending === null && listed && !announcements.some(item => item.releaseId === current.releaseId)) {
        check(typeof game.account === 'string');
        announcements.push({ releaseId: current.releaseId, ordinal: current.ordinal, name: current.name, creatorAccount: game.account, publishedAt: current.createdAt, firstOnline: this.#firstOnline(id, current.releaseId, previous) });
      }
      return { gameId: id, listed, deleted: false, current, announcements };
    });
    return { version: frozen.version, games };
  }
  // 發布路徑只需要前一版的序號（其餘欄位在 recordInTxn 內整個換成新版本）。序號只遞增
  // 最後一段（bumpOrdinal），1.0 是首版，所以前一版就是 1.<n-1>。
  #previous(gameId) {
    const pinRow = this.#one('SELECT pin_json FROM published_games WHERE game_id=?', gameId);
    check(pinRow !== undefined);
    const ordinal = /^1\.(0|[1-9][0-9]*)$/.exec(parseJSON(new TextEncoder().encode(pinRow.pin_json)).ordinal ?? '');
    check(ordinal !== null);
    return ordinal[1] === '0' ? null : { ordinal: `1.${BigInt(ordinal[1]) - 1n}` };
  }
  // 當前發布身分：pin 給名稱／章節／修訂／來源 digest／發布時間，版本列給 createdAt。
  // runtime 參考只存在於已清理的 payload 與桶位元組裡：錨點有同一版本就沿用它的冷凍
  // 描述；否則用同一份 SQLite pack 重算（key 內嵌 digest，不能臆造佔位值）。
  #pinned(gameId, releaseId, frozen) {
    const pinRow = this.#one('SELECT pin_json FROM published_games WHERE game_id=?', gameId);
    check(pinRow !== undefined);
    const pin = parseJSON(new TextEncoder().encode(pinRow.pin_json));
    const release = this.#one('SELECT * FROM content_releases WHERE release_id=? AND game_id=?', releaseId, gameId);
    check(release !== undefined && pin.gameId === gameId && pin.ordinal === release.ordinal && pin.revision === release.draft_revision && pin.sourceDigest === release.source_digest && Array.isArray(pin.chapters) && pin.chapters.length > 0);
    const runtime = frozen !== null && frozen.releaseId === release.release_id ? { ...frozen.runtime } : this.#runtime(gameId, pin, release);
    return { gameId, releaseId: release.release_id, ordinal: pin.ordinal, revision: pin.revision, sourceDigest: pin.sourceDigest, chapters: [...pin.chapters], runtime, name: pin.name, publishedAt: pin.publishedAt, createdAt: release.created_at };
  }
  // 同一份 pack 必須能重算出 pin 的 runtime 索引位元組；算不出來就是資料庫權威對不上這本帳。
  #runtime(gameId, pin, release) {
    const pack = this.#one('SELECT * FROM published_packs WHERE game_id=?', gameId);
    const chapters = this.#sql.exec('SELECT chapter_id,state_json FROM published_pack_chapters WHERE game_id=?', gameId).toArray();
    const assets = this.#sql.exec('SELECT asset_id,sha256,byte_length,bytes FROM published_pack_assets WHERE game_id=?', gameId).toArray();
    check(pack !== undefined && chapters.length === pin.chapters.length && assets.length > 0);
    try { return buildRuntimeIndex({ gameId, releaseId: release.release_id, ordinal: pin.ordinal, revision: pin.revision, sourceDigest: pin.sourceDigest, chapters: [...pin.chapters] }, release, pack, chapters, assets).reference; }
    catch { return fail(503, 'DISTRIBUTION_AUTHORITY_CORRUPT'); }
  }
  // 首次上架代次由帳本事件重建（listing 使遊戲在架、restriction／delete-fence 下架）：
  // 發布那次若已在架，公告就落在發布代次；否則落在其後第一次上架。發布代次的
  // operationId 就是 releaseId，所以不必掃 ordinal。沒有任何紀錄時降級為錨點自引用。
  #firstOnline(gameId, releaseId, previous) {
    const published = this.#one("SELECT generation,operation_id,operation_digest,payload_digest FROM content_distribution_events WHERE kind='publish' AND game_id=? AND operation_id=?", gameId, releaseId);
    if (published === undefined) return { generation: previous.generation };
    let listed = false;
    for (const event of this.#sql.exec('SELECT kind FROM content_distribution_events WHERE game_id=? AND generation<? ORDER BY generation', gameId, published.generation).toArray()) {
      if (event.kind === 'listing') listed = true;
      else if (event.kind !== 'publish') listed = false;
    }
    const first = listed ? published : this.#one("SELECT generation,operation_id,operation_digest,payload_digest FROM content_distribution_events WHERE kind='listing' AND game_id=? AND generation>? ORDER BY generation LIMIT 1", gameId, published.generation);
    check(first !== undefined);
    return first.generation === previous.generation ? { generation: first.generation } : { generation: first.generation, operationId: first.operation_id, operationDigest: first.operation_digest, payloadDigest: first.payload_digest };
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
    const catalog = this.#catalog(state, kind, gameId), context = { authorityId: state.authorityId, generation: state.tailGeneration + 1 };
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
