// B2 上架管理 controller contract (display/controller only, not authority).
// One row per game, three derived states, 上架=whole-game compile+ordinal bump,
// 刪除=irreversible fence. Journal/idempotency recovery is asserted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { installPublish } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../server/public/publish.txt', import.meta.url))).toString('base64'));
function parse(value) { try { return JSON.parse(value); } catch (cause) { throw new Error('invalid test journal', { cause }); } }
const GAME = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', RELEASE = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-11-01T00:00:00.000Z';
const author = (version = 1) => ({ user: { id: ACTOR, role: 'author', version, mustChangePassword: false } });
const row = (over = {}) => ({ gameId: GAME, name: '臥龍傳', introduction: '原文', version: null, state: 'draft', stateTime: null, restricted: false, rejected: false, rowRevision: '4', createdAt: TIME, ...over });
const pin = () => ({ gameId: GAME, name: '臥龍傳', revision: '4', sourceDigest: 'd'.repeat(64), chapters: [GAME + '#chapter-1'], publishedAt: TIME, ordinal: '1.0' });
const receipt = state => ({ version: 1, gameId: GAME, releaseId: RELEASE, pin: pin(), distribution: { gameId: GAME, operationId: RELEASE, generation: 1, kind: 'publish', state, visibleAt: state === 'pending' ? null : TIME, recoveryRequired: false, releaseDigest: 'e'.repeat(64) } });
const fence = (expected = '4') => ({ createdAt: TIME, gameId: GAME, rowRevision: String(BigInt(expected) + 1n), state: 'fenced' });
const failure = (status, code) => Object.assign(new Error(code), { status, code });
function setup(customStorage) {
 let identity = author(), busy = false, model, allow = true, games = [row(), row({ gameId: OTHER })];
 const calls = [], journal = new Map();
 const storage = customStorage ?? { getItem: key => journal.get(key) ?? null, setItem: (key, value) => journal.set(key, value), removeItem: key => journal.delete(key) };
 let response = async path => {
  if (path === '/api/games/submissions') return { games: structuredClone(games) };
  // 上架前的整遊戲校驗（ae8416f）：全部章引用完整時 chapters 為空。
  if (path.includes('/draft/chapter-references')) return { version: 1, gameId: GAME, draftRevision: '4', sourceDigest: 'd'.repeat(64), chapterCount: 1, chapters: [] };
  if (path === '/api/publish') return pin();
  if (path.includes('/publish-operations/')) return receipt('pending');
  if (path.endsWith('/deletion')) { games = games.filter(entry => entry.gameId !== GAME); return fence(); }
  if (path.includes('/deletion-operations/')) return fence();
  if (path.endsWith('/purge')) return { version: 1, gameId: GAME, state: 'purged', tables: 33, removed: { content_games: 1 }, purgedAt: '2026-10-15T00:00:00.000Z', reclamation: { state: 'completed', pointer: 'rewritten', objects: 3 } };
  throw new Error(path);
 };
 const ui = installPublish({ api: async (...args) => { calls.push(args); return response(...args); }, authority: () => identity, isBusy: () => busy, work: async fn => { if (busy) return; busy = true; try { return await fn(); } finally { busy = false; ui.render(); } }, publish: value => { model = value; }, storage, confirm: () => typeof allow === 'function' ? allow() : allow });
 ui.setIdentity(identity);
 return { ui, calls, journal, get model() { return model; }, reply: fn => { response = fn; }, confirm: value => { allow = value; }, identity(value) { identity = value; ui.setIdentity(value); }, setGames(value) { games = value; }, posts: () => calls.filter(call => call[1]), journalValue: () => parse([...journal.values()][0]) };
}
test('list projection: one row per game, three derived states, no sensitive fields, no automatic read', async () => {
 const h = setup(); assert.equal(h.calls.length, 0);
 h.setGames([row(), row({ gameId: OTHER, state: 'pending', version: '1.0', stateTime: TIME }), row({ gameId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', state: 'listed', version: '1.1' })]);
 await h.ui.actions.refresh();
 assert.equal(h.calls[0][0], '/api/games/submissions'); assert.equal(h.model.rows.length, 3);
 assert.equal(h.model.rows[0].state, '草稿'); assert.equal(h.model.rows[0].version, '—'); assert.equal(h.model.rows[0].nextVersion, '1.0');
 assert.equal(h.model.rows[1].state, '待上架'); assert.equal(h.model.rows[1].nextVersion, '1.1'); assert.equal(h.model.rows[1].rejected, false);
 assert.equal(h.model.rows[2].state, '已上架'); assert.equal(h.model.rows[2].nextVersion, '1.2');
 assert.doesNotMatch(JSON.stringify(h.model), /sourceDigest|"chapters"|csrf|source:/i); assert.match(h.model.rows[0].rowRevision, /^[0-9]+$/);
 h.model.rows[0].gameId = RELEASE; h.ui.render(); assert.equal(h.model.rows[0].gameId, GAME, 'projection is a fresh copy');
});
test('list rejects rows whose state contradicts the version or is malformed', async () => {
 for (const broken of [row({ state: 'draft', version: '1.0' }), row({ state: 'pending', version: null }), row({ state: 'published' }), row({ version: '2.0' }), row({ name: '一二三四五六七八九' }), row({ createdAt: 'yesterday' }), row({ rejected: 'yes' }), row({ state: 'listed', version: '1.0', rejected: true }), row({ rowRevision: '0' })]) {
  const h = setup(); h.setGames([broken]); await assert.rejects(h.ui.actions.refresh(), /上架清單/); assert.deepEqual(h.model.rows, []);
 }
});
test('上架 posts the exact game name under a journaled key and reports version without claiming review or visibility', async () => {
 const h = setup(); await h.ui.actions.refresh();
 await h.ui.actions.publish(GAME);
 const post = h.calls.find(call => call[0] === '/api/publish');
 assert.deepEqual(post[1], { gameId: GAME, name: '臥龍傳' }); assert.equal(h.calls.filter(call => call[0] === '/api/publish').length, 1);
 assert.match(h.model.result, /本地已提交上架：版本 1\.0.*分發待確認.*尚未經管理員同意/);
 // 回執已證明結果：追蹤鍵結案，才能接著上架下一版。
 assert.equal(h.journal.size, 0); assert.match(h.model.operation, /沒有追蹤中的上架或刪除操作/);
 assert.equal(h.model.retryDisabled, true); assert.equal(h.ui.canLeave(true), true);
});
test('上架 4xx 拒絕＝本次未提交：解除追蹤鍵、清單可重試並說明依賴', async () => {
 for (const [code, pattern] of [['DRAFT_TOPOLOGY_BROKEN', /據點移動意向/], ['PLAY_CITY_VIEW_MISSING', /據點圖片/], ['PUBLISH_STALE', /草稿已變/]]) {
  const h = setup(); await h.ui.actions.refresh(); const before = h.calls.length;
  h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(422, code); });
  await assert.rejects(h.ui.actions.publish(GAME), error => error.code === code);
  // 4xx 明確拒絕＝本次未提交：清單與鍵都回自由狀態，作者修正後可直接重上架。
  assert.match(h.model.message, pattern); assert.match(h.model.message, /本次未提交/);
  assert.equal(h.calls.length, before + 1); assert.equal(h.model.result, ''); assert.equal(h.journal.size, 0);
  assert.equal(h.model.rows[0].publishDisabled, false); assert.match(h.model.operation, /沒有追蹤中的上架或刪除操作/);
 }
});
test('lost 上架 POST preserves the key; only an explicit GET404 permits same-key retry', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(503, 'OWNED_LOST'); });
 await assert.rejects(h.ui.actions.publish(GAME)); const first = h.calls.find(call => call[0] === '/api/publish');
 assert.equal(h.model.retryDisabled, true);
 h.reply(async () => { throw failure(404, 'PUBLISH_OPERATION_NOT_FOUND'); });
 await assert.rejects(h.ui.actions.query()); assert.equal(h.model.retryDisabled, false);
 h.confirm(false); await h.ui.actions.retry(); assert.equal(h.calls.filter(call => call[0] === '/api/publish').length, 1);
 h.confirm(true); h.reply(async path => path === '/api/publish' ? pin() : path.includes('/publish-operations/') ? receipt('pending') : { games: [row()] });
 await h.ui.actions.retry(); const replay = h.calls.filter(call => call[0] === '/api/publish').at(-1);
 assert.deepEqual(replay.slice(1), first.slice(1)); assert.equal(h.model.retryDisabled, true);
});
test('刪除 posts the fresh revision and name; the row disappears only after the server list stops returning it', async () => {
 const h = setup(); await h.ui.actions.refresh();
 await h.ui.actions.remove(GAME, '4');
 const post = h.calls.find(call => call[0] === '/api/games/' + GAME + '/deletion');
 assert.deepEqual(post[1], { gameId: GAME, expectedRowRevision: '4', confirmationName: '臥龍傳' });
 assert.match(post[2].key, /^[A-Za-z0-9_-]{16,128}$/); assert.equal(h.journal.size, 0);
 assert.match(h.model.result, /已徹底刪除（不可恢復）/); assert.match(h.model.result, /不刪玩家本地存檔/);
 assert.ok(h.calls.some(call => call[0] === '/api/admin/games/' + GAME + '/purge'), '柵欄成立後必須真的發物理刪除請求');
 assert.deepEqual(h.model.rows.map(entry => entry.gameId), [OTHER]);
});
test('C 批：刪除回執的 R2 回收結果會被驗證並如實回報（未設定／失敗不得寫成已回收）', async () => {
 // 生產的 purge 回執多一個 reclamation；工作台必須接受它，且不得因此判定格式無效
 // （C 批新增此欄位時，review/publish 兩個驗證器都把它當成非法欄位）。
 const cases = [
  [{ state: 'completed', pointer: 'rewritten', objects: 12 }, /在架指標與 R2 位元組已回收/],
  [{ state: 'completed', pointer: 'already-absent', objects: 0 }, /在架指標與 R2 位元組已回收/],
  [{ state: 'pending', code: 'RECLAIMER_UNCONFIGURED', objects: 0 }, /R2 回收未設定/],
  [{ state: 'pending', code: 'RECLAIM_FAILED', objects: 0 }, /R2 回收未完成（RECLAIM_FAILED）/],
 ];
 for (const [reclamation, pattern] of cases) {
  const h = setup(); await h.ui.actions.refresh();
  h.reply(async path => {
   if (path === '/api/games/submissions') return { games: [row(), row({ gameId: OTHER })] };
   if (path.endsWith('/deletion')) return fence();
   if (path.endsWith('/purge')) return { version: 1, gameId: GAME, state: 'purged', tables: 33, removed: { content_games: 1 }, purgedAt: TIME, reclamation };
   throw new Error(path);
  });
  await h.ui.actions.remove(GAME, '4');
  assert.match(h.model.result, /已徹底刪除（不可恢復）/);
  assert.match(h.model.result, pattern);
 }
 // 形狀不合的回收結果一律當成回執無效，不得靜默接受。
 for (const broken of [{ state: 'done', objects: 0 }, { state: 'completed', objects: 1 }, { state: 'pending', code: '', objects: 0 }, { state: 'pending', code: 'X', pointer: 'rewritten', objects: 0 }, { state: 'completed', pointer: 'rewritten', objects: 0, extra: 1 }]) {
  const h = setup(); await h.ui.actions.refresh();
  h.reply(async path => {
   if (path === '/api/games/submissions') return { games: [row(), row({ gameId: OTHER })] };
   if (path.endsWith('/deletion')) return fence();
   if (path.endsWith('/purge')) return { version: 1, gameId: GAME, state: 'purged', tables: 33, removed: { content_games: 1 }, purgedAt: TIME, reclamation: broken };
   throw new Error(path);
  });
  await h.ui.actions.remove(GAME, '4');
  assert.doesNotMatch(h.model.result, /已徹底刪除（不可恢復）/, '格式無效的回收結果不得被當成已刪除：' + JSON.stringify(broken));
  assert.match(h.model.result, /柵欄|格式/);
 }
});
test('B3 §6 任何狀態都可刪：已上架也直接送出，過期修訂仍不送', async () => {
 const h = setup(); h.setGames([row({ state: 'listed', version: '1.0', stateTime: TIME })]); await h.ui.actions.refresh();
 assert.equal(h.model.rows[0].deleteDisabled, false); assert.match(h.model.rows[0].deleteHint, /刪除整個遊戲.*不是刪除單個版本.*不可恢復/);
 await h.ui.actions.remove(GAME, '4');
 const post = h.calls.find(call => call[0] === '/api/games/' + GAME + '/deletion');
 assert.deepEqual(post[1], { gameId: GAME, expectedRowRevision: '4', confirmationName: '臥龍傳' });
 await assert.rejects(h.ui.actions.remove(GAME, '9'), /重新整理/); assert.equal(h.posts().length, 1);
});
test('deletion receipts must advance the revision by exactly one', async () => {
 for (const broken of [{ ...fence(), rowRevision: '4' }, { ...fence(), state: 'deleted' }, { ...fence(), gameId: RELEASE }, { ...fence(), extra: true }]) {
  const h = setup(); await h.ui.actions.refresh();
  h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : broken);
  await assert.rejects(h.ui.actions.remove(GAME, '4'), /刪除回執/); assert.match(h.model.message, /(保留原鍵|保留同一個請求)/);
 }
});
test('a corrupt or unavailable journal blocks new operations without sending', async () => {
 const h = setup(); h.journal.set('editor-submission-operation:' + ACTOR, '{'); h.ui.setIdentity(null); h.ui.setIdentity(author()); await h.ui.actions.refresh();
 assert.equal(h.model.rows[0].publishDisabled, true); assert.equal(h.model.rows[0].deleteDisabled, true);
 await assert.rejects(h.ui.actions.publish(GAME), /不另起鍵/); await assert.rejects(h.ui.actions.remove(GAME, '4'), /不另起鍵/);
 assert.equal(h.posts().length, 0);
 const quota = setup({ getItem: () => null, setItem() { throw new Error('owned quota'); }, removeItem() {} });
 await quota.ui.actions.refresh(); await assert.rejects(quota.ui.actions.publish(GAME), /無法保留/); assert.equal(quota.posts().length, 0);
});
test('account version and identity changes forbid resending or showing another actor journal', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(503, 'OWNED_LOST'); });
 await assert.rejects(h.ui.actions.publish(GAME));
 h.reply(async () => { throw failure(404, 'PUBLISH_OPERATION_NOT_FOUND'); }); await assert.rejects(h.ui.actions.query());
 h.identity(author(2)); assert.equal(h.model.retryDisabled, true); assert.deepEqual(h.model.rows, []);
 await assert.rejects(h.ui.actions.retry(), /須先查詢/);
 const key = h.journalValue().key;
 h.identity({ user: { ...author().user, id: RELEASE } }); assert.doesNotMatch(h.model.operation, new RegExp(key)); assert.deepEqual(h.model.rows, []);
 assert.ok(h.journal.has('editor-submission-operation:' + ACTOR));
});
test('a successful 上架 whose later observation is missing keeps the local receipt and closes the journal', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path.includes('/publish-operations/')) throw failure(404, 'PUBLISH_OPERATION_NOT_FOUND'); if (path.includes('/api/games/')) return { games: [row()] }; return pin(); });
 await h.ui.actions.publish(GAME);
 assert.match(h.model.result, /本地已提交上架：版本 1\.0/);
 assert.equal(h.journal.size, 0); assert.equal(h.model.queryDisabled, true);
});
test('確認狀態回執缺少分發關聯時不推定公開', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(503, 'OWNED_LOST'); });
 await assert.rejects(h.ui.actions.publish(GAME));
 h.reply(async () => ({ ...receipt('confirmed'), distribution: { ...receipt('confirmed').distribution, kind: 'listing' } }));
 await assert.rejects(h.ui.actions.query(), /分發狀態/); assert.doesNotMatch(h.model.result, /曾於/);
});

// B8 全章匯總校驗：上架前的只讀清單。控制器只顯示服務端判定，自己不做規則。
test('B8 校驗整遊戲：只讀 GET，逐章列出受影響的章；通過時明確說通過', async () => {
 const h = setup(); await h.ui.actions.refresh();
 const base = { version: 1, gameId: GAME, draftRevision: '4', sourceDigest: 'e'.repeat(64), chapterCount: 20, chapters: [] };
 h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : base);
 await h.ui.actions.check(GAME);
 const call = h.calls.find(entry => entry[0] === '/api/games/' + GAME + '/draft/chapter-references');
 assert.ok(call); assert.equal(call[1], undefined, '校驗不得帶 body 或 Idempotency-Key');
 assert.equal(h.posts().length, 0, '校驗不發任何寫入'); assert.equal(h.journal.size, 0);
 assert.deepEqual(h.model.references, []); assert.match(h.model.referencesText, /全部章節引用完整/);
 h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : { ...base, chapters: [
  { chapterId: GAME + '#chapter-1', chapterName: '第一章', problems: [{ code: 'CHAPTER_CITY_SLOT_MISSING', detail: '底層據點已無固定槽 3' }] },
  { chapterId: GAME + '#chapter-2', chapterName: '第二章', problems: [{ code: 'CHAPTER_GENERAL_MISSING', detail: '武將庫已無本章引用的武將：x' }, { code: 'CHAPTER_CITY_MISSING', detail: '據點定義已無本章引用的據點：y' }] },
 ] });
 await h.ui.actions.check(GAME);
 assert.deepEqual(h.model.references.map(entry => entry.name), ['第一章', '第二章']);
 assert.equal(h.model.references[1].problems.length, 2);
 assert.match(h.model.referencesText, /第一章（底層據點已無固定槽 3）／第二章/);
 assert.match(h.model.message, /校驗未通過/); assert.equal(h.journal.size, 0);
 // 未知形狀的回執不得被當成清單。
 const broken = setup(); await broken.ui.actions.refresh();
 broken.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : { ...base, chapters: [{ chapterId: GAME + '#chapter-1' }] });
 await assert.rejects(broken.ui.actions.check(GAME), /全章校驗/); assert.deepEqual(broken.model.references, []);
});
test('B8 上架被全章校驗拒絕時直接顯示被拒清單，且不建立追蹤鍵', async () => {
 const chapters = [{ chapterId: GAME + '#chapter-1', chapterName: '第一章', problems: [{ code: 'CHAPTER_CITY_SLOT_MISSING', detail: '底層據點已無固定槽 3' }] }];
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw Object.assign(failure(422, 'PUBLISH_CHAPTER_REFERENCES'), { detail: { chapters } }); });
 await assert.rejects(h.ui.actions.publish(GAME), error => error.code === 'PUBLISH_CHAPTER_REFERENCES');
 assert.match(h.model.message, /整遊戲校驗未通過/);
 assert.deepEqual(h.model.references.map(entry => entry.name), ['第一章']);
 assert.match(h.model.referencesText, /本次上架被拒絕（整遊戲校驗未通過）/);
 assert.equal(h.journal.size, 0); assert.equal(h.model.rows[0].publishDisabled, false);
 const h2 = setup(); await h2.ui.actions.refresh();
 h2.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw Object.assign(failure(422, 'PUBLISH_CHAPTER_REFERENCES'), { detail: { chapters: [{ chapterId: 'x' }] } }); });
 await assert.rejects(h2.ui.actions.publish(GAME));
 assert.deepEqual(h2.model.references, []);
});
test('A 路線：上架回執自帶已確認分發時不再補查狀態，且如實顯示已確認', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => {
  if (path === '/api/games/submissions') return { games: [row()] };
  if (path.includes('/draft/chapter-references')) return { version: 1, gameId: GAME, draftRevision: '4', sourceDigest: 'd'.repeat(64), chapterCount: 1, chapters: [] };
  if (path === '/api/publish') return { ...pin(), distribution: receipt('confirmed').distribution };
  throw new Error(path);
 });
 await h.ui.actions.publish(GAME);
 assert.equal(h.calls.filter(call => call[0].includes('/publish-operations/')).length, 0, '已確認時不再補查分發狀態');
 assert.match(h.model.result, /此次分發曾於 .* 確認/);
 assert.equal(h.journal.size, 0);
 // 回執帶 pending 時仍照舊補查一次，且不得宣稱可見。
 const h2 = setup(); await h2.ui.actions.refresh();
 h2.reply(async path => {
  if (path === '/api/games/submissions') return { games: [row()] };
  if (path.includes('/draft/chapter-references')) return { version: 1, gameId: GAME, draftRevision: '4', sourceDigest: 'd'.repeat(64), chapterCount: 1, chapters: [] };
  if (path === '/api/publish') return { ...pin(), distribution: receipt('pending').distribution };
  if (path.includes('/publish-operations/')) return receipt('confirmed');
  throw new Error(path);
 });
 await h2.ui.actions.publish(GAME);
 assert.equal(h2.calls.filter(call => call[0].includes('/publish-operations/')).length, 1, '待確認時仍補查狀態');
 assert.match(h2.model.result, /此次分發曾於 .* 確認/);
 // 缺鍵＝舊協議：照舊補查，不把回應當成已確認。
 const h3 = setup(); await h3.ui.actions.refresh();
 await h3.ui.actions.publish(GAME);
 assert.equal(h3.calls.filter(call => call[0].includes('/publish-operations/')).length, 1);
 assert.match(h3.model.result, /分發待確認/);
});
