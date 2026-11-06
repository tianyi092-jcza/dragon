// 同一份內容換一把鍵重送時不新增版本：ReleaseLedger.pendingIdentical 的判定，
// 加上 PublishOperations.bindIdentical 把既有回執綁到新鍵（回執必須逐位元相同）。
// 真實 SQLite＋真實 metadata/release/pin store；principal 是明確的測試端口。
// 這不是 HTTP、編譯、R2 或完整上架證明：本檔只鎖「不重複佔用序號」與「回執可复現」。
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { PublishOperations } from '../server/publishoperations.js';
import { GameMetadataStore } from '../server/metadata.js';
import { ReleaseLedger } from '../server/releases.js';
import { PublishedGames } from '../server/published.js';
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const DIGEST = 'a'.repeat(64), OTHER_DIGEST = 'b'.repeat(64), FRESH = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let groups = 0;
function fixture() {
  const storage = openStorage(':memory:'), sql = storage.sql;
  const actor = { id: 'owner', role: 'author', epoch: 1, must_change: 0 };
  const principal = token => { assert.equal(token, 'owned-token'); return actor; };
  sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY)'); sql.exec("INSERT INTO users VALUES('owner')");
  const games = new GameMetadataStore({ storage, principal });
  sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', G, 'owner', 'Owned', '', null, null, '1', '1', null, '0', 0, 0, 't', 't');
  sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', OTHER, 'owner', 'Second', '', null, null, '1', '1', null, '0', 0, 0, 't', 't');
  // 公告與審核表由別的模組擁有：這裡照真實 DDL 建，讓「曾公告／已駁回」可被判定。
  sql.exec('CREATE TABLE IF NOT EXISTS content_announcements (announcement_id INTEGER PRIMARY KEY, game_id TEXT NOT NULL, release_id TEXT NOT NULL, ordinal TEXT NOT NULL, name TEXT NOT NULL, creator_account TEXT NOT NULL, published_at TEXT NOT NULL, first_online_at TEXT NOT NULL, UNIQUE(game_id,release_id))');
  sql.exec('CREATE TABLE IF NOT EXISTS content_audits (event_id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT NOT NULL, before_revision TEXT, after_revision TEXT NOT NULL, created_at TEXT NOT NULL)');
  const releases = new ReleaseLedger({ storage, principal, games }), pins = new PublishedGames({ storage, principal });
  const ops = new PublishOperations({ storage, principal, games, operationGuard: () => {} });
  const snapshot = () => ['content_games', 'content_operations', 'content_reservations', 'content_releases', 'published_games', 'content_audits', 'content_announcements'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
  // 完整的「一次上架」：配置序號＋寫 pin＋只保留在架版本。
  const produce = (key, { gameId = G, digest = DIGEST, name = 'Owned', revision = '1' } = {}) => {
    const ticket = ops.capture('owned-token', { key, gameId, name }).ticket;
    return ops.commit('owned-token', ticket, () => {
      const issued = releases.issueInTxn('owned-token', gameId, revision, digest);
      const pin = pins.publishInTxn('owned-token', { gameId, name, revision, sourceDigest: digest, chapters: [`${gameId}#c1`], ordinal: issued.ordinal });
      releases.pruneExceptInTxn('owned-token', gameId, issued.releaseId);
      return { version: 1, gameId, releaseId: issued.releaseId, pin };
    });
  };
  // 編輯器的復用路徑：同內容換新鍵，把既有回執綁到新鍵。
  const rebind = (key, releaseId, { gameId = G, name = 'Owned' } = {}) => {
    const ticket = ops.capture('owned-token', { key, gameId, name }).ticket;
    return ops.bindIdentical('owned-token', ticket, releaseId);
  };
  const setGame = (column, value, gameId = G) => sql.exec(`UPDATE content_games SET ${column}=? WHERE game_id=?`, value, gameId);
  const pending = (digest = DIGEST, gameId = G) => releases.pendingIdentical('owned-token', gameId, '1', digest);
  return { storage, sql, actor, releases, pins, ops, snapshot, produce, rebind, setGame, pending };
}
function check(fn) { const f = fixture(); try { fn(f); groups++; } finally { f.storage.close(); } }
const code = expected => error => error.code === expected;

check(f => {
  const receipt = f.produce('owned-publish-key-01');
  const before = f.snapshot();
  // 同內容、不同鍵：指出同一版，綁回來的回執必須逐位元等於原本那份。
  const identical = f.pending();
  assert.equal(identical.releaseId, receipt.releaseId);
  assert.equal(identical.ordinal, '1.0');
  assert.equal(identical.draftRevision, '1');
  assert.equal(identical.sourceDigest, DIGEST);
  const rebound = f.rebind('owned-publish-key-02', receipt.releaseId);
  assert.equal(JSON.stringify(rebound), JSON.stringify(receipt), '復用的回執必須與原本寫入的字節相同');
  // 沒有新版本、沒有新序號；只是新鍵在既有命名空間裡多一條永久結果。
  assert.equal(f.sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 1);
  assert.equal(JSON.stringify(f.releases.history('owned-token', G).map(row => row.ordinal)), '["1.0"]');
  assert.equal(f.sql.exec('SELECT COUNT(*) AS n FROM content_operations').toArray()[0].n, 2);
  assert.equal(f.sql.exec('SELECT COUNT(*) AS n FROM content_reservations').toArray()[0].n, 2);
  const after = f.snapshot();
  assert.deepEqual(after.slice(0, 1), before.slice(0, 1), '內容列不得變動');
  // 新鍵本身可按既有查詢端點取回同一份回執，且再取用同鍵會走一般重放。
  assert.equal(JSON.stringify(f.ops.query('owned-token', { key: 'owned-publish-key-02', gameId: G })), JSON.stringify(receipt));
  assert.equal(JSON.stringify(f.ops.capture('owned-token', { key: 'owned-publish-key-02', gameId: G, name: 'Owned' }).replay), JSON.stringify(receipt));
  // 內容不同（修訂或摘要任一不同）就不是「同一份」。
  assert.equal(f.releases.pendingIdentical('owned-token', G, '2', DIGEST), null);
  assert.equal(f.pending(OTHER_DIGEST), null);
  // 別的遊戲不共用版本。
  assert.equal(f.pending(DIGEST, OTHER), null);
  assert.throws(() => f.rebind('owned-publish-key-03', receipt.releaseId, { gameId: OTHER }), code('PUBLISH_STALE'), '別的遊戲不得借用這個版本');
  assert.throws(() => f.rebind('owned-publish-key-04', FRESH), code('PUBLISH_STALE'), '不得綁定非當前版本的任何回執');
  // 改名不是同一份請求：名稱決定 pin 與公告，必須照舊配新序號。
  assert.equal(f.rebind('owned-publish-key-05', receipt.releaseId, { name: 'Renamed' }), null);
  assert.equal(f.sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 1, '被拒的復用不得新增版本');
});

check(f => {
  const receipt = f.produce('owned-publish-key-01');
  // 已在架：不是「等待審核中的同一份」，必須照舊配置新序號。
  f.setGame('listed', 1);
  assert.equal(f.pending(), null);
  // 上架又下架（公告已存在）：同樣不復用。
  f.setGame('listed', 0);
  f.sql.exec('INSERT INTO content_announcements(game_id,release_id,ordinal,name,creator_account,published_at,first_online_at) VALUES(?,?,?,?,?,?,?)', G, receipt.releaseId, '1.0', 'Owned', 'owner', 't', 't');
  assert.equal(f.pending(), null);
  f.sql.exec('DELETE FROM content_announcements');
  // 被審核駁回的那一版：重送要新序號，不能復用被拒的版本。
  f.sql.exec("INSERT INTO content_audits VALUES('e1','admin','admin-reject',?,?,'1','t')", G, '1.0');
  assert.equal(f.pending(), null);
  // 駁回的是別的序號（1.1）時不影響等待中的 1.0。
  f.sql.exec("UPDATE content_audits SET before_revision='1.1' WHERE event_id='e1'");
  assert.equal(f.pending().releaseId, receipt.releaseId);
});

check(f => {
  const receipt = f.produce('owned-publish-key-01');
  // 修訂前進後：舊版本不再「與當前修訂相同」，新內容照舊走完整流程。
  f.setGame('draft_revision', '2');
  assert.equal(f.releases.pendingIdentical('owned-token', G, '2', DIGEST), null);
  const next = f.produce('owned-publish-key-02', { revision: '2' });
  assert.notEqual(next.releaseId, receipt.releaseId);
  assert.equal(next.pin.ordinal, '1.1', '只有內容真的變了才吃掉下一個序號');
  // 舊回執仍可按版本查回（不因剪枝而消失），但不再被當成「等待中的同一份」。
  assert.equal(JSON.stringify(f.ops.query('owned-token', { key: 'owned-publish-key-01', gameId: G })), JSON.stringify(receipt));
  assert.equal(f.releases.pendingIdentical('owned-token', G, '2', DIGEST).releaseId, next.releaseId);
});

check(f => {
  const receipt = f.produce('owned-publish-key-01');
  // 換代（改密碼等）後，舊回執不再屬於這個工作階段：不冒充可復用。
  f.sql.exec("UPDATE content_operations SET auth_epoch=7 WHERE op_key='owned-publish-key-01'");
  assert.equal(f.rebind('owned-publish-key-02', receipt.releaseId), null);
  // 找不到原回執（被物理清除）時也一樣：不冒充，交給完整流程。
  f.sql.exec('DELETE FROM content_operations'); f.sql.exec('DELETE FROM content_reservations');
  assert.equal(f.rebind('owned-publish-key-03', receipt.releaseId), null);
  assert.equal(f.sql.exec('SELECT COUNT(*) AS n FROM content_operations').toArray()[0].n, 0, '找不到回執時不得留下半條結果');
});

check(f => {
  f.produce('owned-publish-key-01');
  // 權屬柵欄：非擁有者看不到、也不取得任何判定。
  f.sql.exec("INSERT INTO users VALUES('someone-else')");
  f.sql.exec("UPDATE content_games SET owner_id='someone-else' WHERE game_id=?", G);
  assert.throws(() => f.pending(), code('GAME_NOT_FOUND'));
  assert.throws(() => f.ops.capture('owned-token', { key: 'owned-publish-key-09', gameId: G, name: 'Owned' }), code('GAME_NOT_FOUND'));
  f.sql.exec("UPDATE content_games SET owner_id='owner' WHERE game_id=?", G);
  f.sql.exec("INSERT INTO content_deletion_fences VALUES(?,'owner','owner','1','2','t')", G);
  assert.throws(() => f.pending(), code('GAME_DELETING'));
  assert.throws(() => f.rebind('owned-publish-key-09', FRESH), code('GAME_DELETING'));
});

check(f => {
  // 從未上架過的遊戲：沒有版本可復用，也沒有回執可查。
  assert.equal(f.pending(), null);
  assert.throws(() => f.releases.pendingIdentical('owned-token', G, '01', DIGEST), code('RELEASE_REVISION'));
  assert.throws(() => f.releases.pendingIdentical('owned-token', G, '1', 'A'.repeat(64)), code('RELEASE_DIGEST'));
  assert.throws(() => f.releases.pendingIdentical('owned-token', 'wolong-builtin', '1', DIGEST), code('BUILTIN_PROTECTED'));
  // 沒有公告／審核表（全新庫）時照樣可判定：未建表＝從未上架過任何版本。
  f.sql.exec('DROP TABLE content_announcements'); f.sql.exec('DROP TABLE content_audits');
  const receipt = f.produce('owned-publish-key-01');
  assert.equal(f.releases.pendingIdentical('owned-token', G, '1', DIGEST).releaseId, receipt.releaseId);
});

console.log(JSON.stringify({ groups, scope: 'identical-pending release reuse + receipt binding over real SQLite; no HTTP, compiler, R2 or visibility claim' }));
