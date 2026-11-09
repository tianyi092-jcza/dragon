// 退役世代裡含已上架遊戲時，退役後仍能發布／上架：
// 目錄成員、在架旗標、當前 pin、墓碑一律按資料庫權威事實重建，錨點只留公告歷史與
// digest 鏈起點（舊版 #catalog 直接拿錨點快照當目錄，退役後第一次發布必 503）。
// 自有記憶體 SQLite + 自有 fixture pack；無 R2、無 HTTP、無 DELETE 證明。
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { buildRuntimeIndex } = await import('../vps/runtime-index.mjs');
const { GameMetadataStore } = await import('../server/metadata.js');
const { PublishedGames } = await import('../server/published.js');
const { ReleaseLedger } = await import('../server/releases.js');
const { AnnouncementStore } = await import('../server/announcements.js');
const { DistributionOutbox } = await import('../server/distribution.js');
const { PublishedPacks } = await import('../server/playpacks.js');
const { FrozenPublicationProducer } = await import('../server/publicationproducer.js');
const { FrozenDistributionLedger } = await import('../server/distributionledger.js');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', H = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', J = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const time = '2026-10-15T00:00:00.000Z';
let groups = 0;

// 一個版本的完整自有夾具：pin／版本列／pack／章節／資產，以及由同一份 pack 算出的
// runtime 索引參考。發布後 producer 從 SQLite 重算時必須逐位相同。
function fixture(gameId, version) {
  const revision = String(version + 1), ordinal = `1.${version}`, sourceDigest = sha(`after-retire-${gameId}-${version}`), releaseId = randomUUID();
  const chapters = [`${gameId}#chapter`], publishedAt = `2026-11-10T0${version}:00:00.000Z`;
  const bytes = Buffer.from(`owned-terrain-${gameId}-${version}`), asset = { asset_id: 'terrain', sha256: sha(bytes), byte_length: bytes.length, bytes };
  const manifest = {
    schemaVersion: 1, buildFormat: 'studio-app-2', identity: { gameId, draftRevision: revision, sourceDigest }, chapters,
    assets: [{ assetId: 'terrain', sha256: asset.sha256, byteLength: bytes.length, url: `/api/trial-asset?game=${gameId}&revision=${revision}&digest=${sourceDigest}&asset=terrain` }],
    minimapAssets: [], portraits: [],
  };
  const pin = { gameId, ordinal, revision, sourceDigest, chapters, name: `自有測試${version}`, publishedAt };
  const release = { game_id: gameId, release_id: releaseId, ordinal, draft_revision: revision, source_digest: sourceDigest, created_at: publishedAt };
  const pack = { revision, source_digest: sourceDigest, manifest_json: JSON.stringify(manifest) };
  const chapterRows = chapters.map(chapter_id => ({ chapter_id, state_json: JSON.stringify({ fixture: `${version}:${chapter_id}` }) }));
  const reference = buildRuntimeIndex({ gameId, releaseId, ordinal, revision, sourceDigest, chapters }, release, pack, chapterRows, [asset]).reference;
  return { pin, release, pack, chapters: chapterRows, assets: [asset], reference, runtime: { gameId, releaseId, ordinal, revision, sourceDigest, chapters, runtime: reference } };
}

function world() {
  const storage = openStorage(':memory:'), sql = storage.sql;
  sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT, role TEXT, epoch INTEGER, must_change INTEGER)');
  sql.exec("INSERT INTO users VALUES('owner','owned','author',1,0)");
  const principal = () => ({ id: 'owner', account: 'owned', role: 'author', epoch: 1, must_change: 0 });
  const games = new GameMetadataStore({ storage, principal });
  new PublishedGames({ storage, principal }); new ReleaseLedger({ storage, principal, games }); new AnnouncementStore({ storage }); new DistributionOutbox({ storage }); new PublishedPacks({ storage, principal });
  for (const id of [G, H, J]) sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, 'owner', 'draft', '', null, null, '1', '1', null, '0', 0, 0, time, time);
  const producer = new FrozenPublicationProducer({ storage });
  // 確認用：只有測試自己的收據校驗器能簽回執，producer 內部那份一律拒絕。
  const ledger = new FrozenDistributionLedger({ storage, verifyReceipt: (_receipt, identity) => ({ ...identity, rootDigest: '4'.repeat(64), rootETag: '"after-retire"', visibleAt: '2026-11-10T09:00:00.000Z' }) });
  const tx = run => storage.transactionSync(run);
  const payload = n => {
    const bytes = ledger.entry(n).payload;
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('冷凍 payload 不是 JSON'); }
  };
  // 發布事務的等價物：pin／版本列／pack 三者同源，舊版本列照 pruneExceptInTxn 刪掉。
  function write(f) {
    tx(() => {
      sql.exec('UPDATE content_games SET current_release_id=?,next_ordinal=? WHERE game_id=?', f.release.release_id, f.pin.ordinal, f.pin.gameId);
      sql.exec('INSERT INTO content_releases VALUES(?,?,?,?,?,?)', f.release.game_id, f.release.release_id, f.release.ordinal, f.release.draft_revision, f.release.source_digest, f.release.created_at);
      sql.exec('INSERT OR REPLACE INTO published_games VALUES(?,?,?,?)', f.pin.gameId, 'owner', JSON.stringify(f.pin), f.release.created_at);
      sql.exec('INSERT OR REPLACE INTO published_packs VALUES(?,?,?,?,?)', f.pin.gameId, f.pack.revision, f.pack.source_digest, f.pack.manifest_json, f.release.created_at);
      sql.exec('DELETE FROM published_pack_chapters WHERE game_id=?', f.pin.gameId);
      for (const row of f.chapters) sql.exec('INSERT INTO published_pack_chapters VALUES(?,?,?)', f.pin.gameId, row.chapter_id, row.state_json);
      sql.exec('DELETE FROM published_pack_assets WHERE game_id=?', f.pin.gameId);
      for (const row of f.assets) sql.exec('INSERT INTO published_pack_assets VALUES(?,?,?,?,?)', f.pin.gameId, row.asset_id, row.sha256, row.byte_length, row.bytes);
      sql.exec('DELETE FROM content_releases WHERE game_id=? AND release_id<>?', f.pin.gameId, f.release.release_id);
    });
  }
  // True publish-transaction shape: pin／版本列先落地，再在同一事務裡入列帳本。
  function publish(f) { write(f); return tx(() => producer.recordInTxn('publish', f.pin.gameId, f.runtime)); }
  function confirm(generation) {
    const row = sql.exec('SELECT operation_id FROM content_distribution_events WHERE generation=?', generation).toArray()[0];
    tx(() => ledger.confirmInTxn(row.operation_id, null));
  }
  function retire(generations, anchorGeneration) {
    const pin = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: generations, anchorDigest: ledger.entry(anchorGeneration).operationDigest }));
    sql.exec('DELETE FROM content_distribution_chunks WHERE generation>=? AND generation<=?', generations[0], generations.at(-1));
    return pin;
  }
  return { storage, sql, producer, ledger, tx, payload, fixture, write, publish, confirm, retire };
}

// A：生產故障原樣——上架過的遊戲在退役世代裡，退役後第一個動作就是重新發布。
// 舊版目錄基線沒有這款遊戲，於是「期望 1.0、實際 1.1」被 #check 判成 CORRUPT。
try {
  const w = world();
  try {
    const h0 = fixture(H, 0), g0 = fixture(G, 0);
    w.publish(h0); w.confirm(1);
    w.publish(g0); w.confirm(2);
    w.tx(() => { w.sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?', G); w.producer.recordInTxn('listing', G); });
    w.confirm(3);
    w.retire([2, 3], 1);
    assert.equal(w.ledger.entry(3).retired, true, '退役代次只剩身分憑證');
    const g1 = fixture(G, 1);
    const issued = w.publish(g1);
    assert.equal(issued.deduped, false);
    const entry = w.payload(4).catalog.games.find(game => game.gameId === G);
    assert.equal(entry.listed, true);
    assert.equal(entry.deleted, false);
    assert.equal(entry.current.ordinal, '1.1');
    assert.equal(entry.current.releaseId, g1.release.release_id);
    assert.deepEqual(entry.current.runtime, g1.reference, '當前版本的 runtime 必須是本次發布的那一份');
    // 被替換的 1.0 公告只存在於已清理的退役 payload：名稱與時間都不在資料庫裡，
    // 所以重建不臆造它；新版本自己那一列由 recordInTxn 在本次代次建立。
    assert.deepEqual(entry.announcements.map(row => row.ordinal), ['1.1']);
    assert.deepEqual(entry.announcements[0].firstOnline, { generation: 4 });
    // 錨點裡已有的遊戲沿用它的冷凍描述（不重算、不改變公開事實）。
    const other = w.payload(4).catalog.games.find(game => game.gameId === H);
    assert.equal(other.listed, false);
    assert.deepEqual(other.current.runtime, h0.reference);
    assert.ok(!w.payload(4).projection.directory.some(row => row.gameId === H));
    assert.equal(w.ledger.status().tailGeneration, 4);
    groups += 1;
  } finally { w.storage.close(); }
} catch (error) { process.stderr.write(String(error?.stack ?? error) + String.fromCharCode(10)); throw error; }

// B：退役後第一個動作是「上架同意」——當前版本不在錨點裡，runtime 索引只能由同一份
// SQLite pack 重算；上架時間軸也只有帳本事件能重建（發布當下已在架 ⇒ 首次上架就是發布代次）。
try {
  const w = world();
  try {
    const h0 = fixture(H, 0), j0 = fixture(J, 0), j1 = fixture(J, 1);
    w.publish(h0); w.confirm(1);
    w.publish(j0); w.confirm(2);
    w.tx(() => { w.sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?', J); w.producer.recordInTxn('listing', J); });
    w.confirm(3);
    w.publish(j1); w.confirm(4);
    const listed = w.ledger.entry(4);
    w.retire([2, 3, 4], 1);
    assert.equal(w.ledger.status().tailGeneration, 4);
    // 上架的是另一款遊戲；J 只作為目錄成員被重建。
    w.tx(() => { w.sql.exec('UPDATE content_games SET restricted=1 WHERE game_id=?', H); w.producer.recordInTxn('restriction', H); });
    const rebuilt = w.payload(5).catalog.games.find(game => game.gameId === J);
    assert.equal(rebuilt.listed, true);
    assert.equal(rebuilt.current.ordinal, '1.1');
    assert.deepEqual(rebuilt.current.runtime, j1.reference, 'runtime 索引必須能由同一份 pack 逐位重算');
    assert.deepEqual(rebuilt.announcements.map(row => row.ordinal), ['1.1']);
    assert.deepEqual(rebuilt.announcements[0].firstOnline, { generation: listed.generation, operationId: listed.operationId, operationDigest: listed.operationDigest, payloadDigest: listed.payloadDigest });
    assert.deepEqual(rebuilt.announcements[0].publishedAt, j1.release.created_at);
    assert.equal(rebuilt.announcements[0].creatorAccount, 'owned');
    // 重建出來的序號是可信的：下一次發布照樣 1.2，不必再回到錨點。
    const j2 = fixture(J, 2);
    w.publish(j2);
    const next = w.payload(6).catalog.games.find(game => game.gameId === J);
    assert.equal(next.current.ordinal, '1.2');
    assert.deepEqual(next.announcements.map(row => row.ordinal), ['1.1', '1.2']);
    assert.deepEqual(next.announcements[1].firstOnline, { generation: 6 });
    // 現行「上架同意」路徑：退役後把沒上架過的版本推上架，公告首次上架代次就是本次代次。
    assert.equal(next.listed, true);
    groups += 1;
  } finally { w.storage.close(); }
} catch (error) { process.stderr.write(String(error?.stack ?? error) + String.fromCharCode(10)); throw error; }

// C：退役後第一個動作是「上架同意」（當前版本不在錨點、DB 已先把 listed 改成 1）。
// 目錄基線必須是上一代次：listed 回到操作前，公告才由 recordInTxn 以本次代次建立。
try {
  const w = world();
  try {
    const h0 = fixture(H, 0), j0 = fixture(J, 0);
    w.publish(h0); w.confirm(1);
    w.publish(j0); w.confirm(2);
    w.retire([2], 1);
    w.tx(() => { w.sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?', J); w.producer.recordInTxn('listing', J); });
    const entry = w.payload(3).catalog.games.find(game => game.gameId === J);
    assert.equal(entry.listed, true);
    assert.deepEqual(entry.current.runtime, j0.reference);
    assert.deepEqual(entry.announcements.map(row => row.ordinal), ['1.0']);
    assert.deepEqual(entry.announcements[0].firstOnline, { generation: 3 }, '首次上架就是本次代次，不得回填錨點快照');
    assert.deepEqual(w.payload(3).projection.directory.map(row => row.gameId), [J]);
    // 刪除墓碑同理：資料庫裡的 fence 行是本次操作寫的，基線必須還沒刪除。
    w.tx(() => { w.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', H, 'owner', 'owner', '1', '2', time); w.sql.exec('DELETE FROM published_games WHERE game_id=?', H); w.producer.recordInTxn('delete-fence', H); });
    const fenced = w.payload(4).catalog.games.find(game => game.gameId === H);
    assert.deepEqual([fenced.listed, fenced.deleted, fenced.current, fenced.announcements.length], [false, true, null, 0]);
    assert.deepEqual(w.payload(4).projection.directory.map(row => row.gameId), [J]);
    groups += 1;
  } finally { w.storage.close(); }
} catch (error) { process.stderr.write(String(error?.stack ?? error) + String.fromCharCode(10)); throw error; }

process.stdout.write(`publish after retirement: ${groups} groups passed (owned SQLite seams, no R2)\n`);
