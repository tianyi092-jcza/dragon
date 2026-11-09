// B2 上架管理 controller contract (display/controller only, not authority).
// One row per game, three derived states, 上架=whole-game compile+ordinal bump,
// 刪除=irreversible fence. Journal/idempotency recovery is asserted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { installPublish } = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL('../server/public/publish.txt', import.meta.url))).toString('base64')}`);
function parse(value) { try { return JSON.parse(value); } catch (cause) { throw new Error('invalid test journal', { cause }); } }
const GAME = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', RELEASE = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-11-01T00:00:00.000Z';
const author = (version = 1) => ({ user: { id: ACTOR, role: 'author', version, mustChangePassword: false } });
const passed = (over = {}) => ({ state: 'passed', checkedAt: TIME, draftRevision: '4', chapterCount: 1, failedChapters: 0, ...over });
const row = (over = {}) => ({ gameId: GAME, name: '臥龍傳', introduction: '原文', version: null, state: 'draft', stateTime: null, restricted: false, rejected: false, draftChanged: true, rowRevision: '4', draftRevision: '4', validation: passed(), createdAt: TIME, ...over });
const pin = () => ({ gameId: GAME, name: '臥龍傳', revision: '4', sourceDigest: 'd'.repeat(64), chapters: [`${GAME}#chapter-1`], publishedAt: TIME, ordinal: '1.0' });
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
 assert.match(h.model.result, /本地已提交上架申請：版本 1\.0.*分發待確認.*尚未經管理員同意/);
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
  // 只多一次 POST（進度讀取不算提交嘗試），4xx 後不再補發任何請求。
  assert.equal(h.calls.filter(call => call[0] === '/api/publish').length, 1); assert.ok(h.calls.length <= before + 2); assert.equal(h.model.result, ''); assert.equal(h.journal.size, 0);
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
 h.confirm(true); h.reply(async path => {
  if (path === '/api/publish') return pin();
  if (path.includes('/publish-operations/')) return receipt('pending');
  return { games: [row()] };
 });
 await h.ui.actions.retry(); const replay = h.calls.filter(call => call[0] === '/api/publish').at(-1);
 assert.deepEqual(replay.slice(1), first.slice(1)); assert.equal(h.model.retryDisabled, true);
});
test('刪除 posts the fresh revision and name; the row disappears only after the server list stops returning it', async () => {
 const h = setup(); await h.ui.actions.refresh();
 await h.ui.actions.remove(GAME, '4');
 const post = h.calls.find(call => call[0] === `/api/games/${GAME}/deletion`);
 assert.deepEqual(post[1], { gameId: GAME, expectedRowRevision: '4', confirmationName: '臥龍傳' });
 assert.match(post[2].key, /^[A-Za-z0-9_-]{16,128}$/); assert.equal(h.journal.size, 0);
 assert.match(h.model.result, /已徹底刪除（不可恢復）/); assert.match(h.model.result, /不刪玩家本地存檔/);
 assert.ok(h.calls.some(call => call[0] === `/api/admin/games/${GAME}/purge`), '柵欄成立後必須真的發物理刪除請求');
 assert.deepEqual(h.model.rows.map(entry => entry.gameId), [OTHER]);
});
test('C 批：刪除回執的 R2 回收結果會被驗證並如實回報（未設定／失敗不得寫成已回收）', async () => {
 // 生產的 purge 回執多一個 reclamation；工作台必須接受它，且不得因此判定格式無效
 // （C 批新增此欄位時，review/publish 兩個驗證器都把它當成非法欄位）。
 const cases = [
  [{ state: 'completed', pointer: 'rewritten', objects: 12 }, /在架指標與 R2 位元組已回收/],
  [{ state: 'completed', pointer: 'already-absent', objects: 0 }, /在架指標與 R2 位元組已回收/],
  // 刪除＝徹底清除：私有位元組（草稿與資源原件）也一起回收，並如實報出檔數。
  [{ state: 'completed', pointer: 'rewritten', objects: 3, privateObjects: 49 }, /在架指標與 R2 位元組已回收，遊戲私有位元組回收 49 檔/],
  [{ state: 'completed', pointer: 'already-absent', objects: 0, privateObjects: 0 }, /私有位元組回收 0 檔/],
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
 for (const broken of [{ state: 'done', objects: 0 }, { state: 'completed', objects: 1 }, { state: 'pending', code: '', objects: 0 }, { state: 'pending', code: 'X', pointer: 'rewritten', objects: 0 }, { state: 'completed', pointer: 'rewritten', objects: 0, extra: 1 }, { state: 'completed', pointer: 'rewritten', objects: 0, privateObjects: '49' }, { state: 'completed', pointer: 'rewritten', objects: 0, privateObjects: -1 }]) {
  const h = setup(); await h.ui.actions.refresh();
  h.reply(async path => {
   if (path === '/api/games/submissions') return { games: [row(), row({ gameId: OTHER })] };
   if (path.endsWith('/deletion')) return fence();
   if (path.endsWith('/purge')) return { version: 1, gameId: GAME, state: 'purged', tables: 33, removed: { content_games: 1 }, purgedAt: TIME, reclamation: broken };
   throw new Error(path);
  });
  await h.ui.actions.remove(GAME, '4');
  assert.doesNotMatch(h.model.result, /已徹底刪除（不可恢復）/, `格式無效的回收結果不得被當成已刪除：${JSON.stringify(broken)}`);
  assert.match(h.model.result, /柵欄|格式/);
 }
});
test('B3 §6 任何狀態都可刪：已上架也直接送出，過期修訂仍不送', async () => {
 const h = setup(); h.setGames([row({ state: 'listed', version: '1.0', stateTime: TIME })]); await h.ui.actions.refresh();
 assert.equal(h.model.rows[0].deleteDisabled, false); assert.match(h.model.rows[0].deleteHint, /刪除整個遊戲.*不是刪除單個版本.*不可恢復/);
 await h.ui.actions.remove(GAME, '4');
 const post = h.calls.find(call => call[0] === `/api/games/${GAME}/deletion`);
 assert.deepEqual(post[1], { gameId: GAME, expectedRowRevision: '4', confirmationName: '臥龍傳' });
 await assert.rejects(h.ui.actions.remove(GAME, '9'), /重新整理/); assert.equal(h.calls.filter(call => call[0] === `/api/games/${GAME}/deletion`).length, 1);
});
test('deletion receipts must advance the revision by exactly one', async () => {
 for (const broken of [{ ...fence(), rowRevision: '4' }, { ...fence(), state: 'deleted' }, { ...fence(), gameId: RELEASE }, { ...fence(), extra: true }]) {
  const h = setup(); await h.ui.actions.refresh();
  h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : broken);
  await assert.rejects(h.ui.actions.remove(GAME, '4'), /刪除回執/); assert.match(h.model.message, /(保留原鍵|保留同一個請求)/);
 }
});
test('a corrupt or unavailable journal blocks new operations without sending', async () => {
 const h = setup(); h.journal.set(`editor-submission-operation:${ACTOR}`, '{'); h.ui.setIdentity(null); h.ui.setIdentity(author()); await h.ui.actions.refresh();
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
 assert.ok(h.journal.has(`editor-submission-operation:${ACTOR}`));
});
test('a successful 上架 whose later observation is missing keeps the local receipt and closes the journal', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path.includes('/publish-operations/')) throw failure(404, 'PUBLISH_OPERATION_NOT_FOUND'); if (path.includes('/api/games/')) return { games: [row()] }; return pin(); });
 await h.ui.actions.publish(GAME);
 assert.match(h.model.result, /本地已提交上架申請：版本 1\.0/);
 assert.equal(h.journal.size, 0); assert.equal(h.model.queryDisabled, true);
});
test('確認狀態回執缺少分發關聯時不推定公開', async () => {
 const h = setup(); await h.ui.actions.refresh();
 h.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(503, 'OWNED_LOST'); });
 await assert.rejects(h.ui.actions.publish(GAME));
 h.reply(async () => ({ ...receipt('confirmed'), distribution: { ...receipt('confirmed').distribution, kind: 'listing' } }));
 await assert.rejects(h.ui.actions.query(), /分發狀態/); assert.doesNotMatch(h.model.result, /曾於/);
});

// B8 全章匯總檢驗：上架前的服務端檢查。控制器只顯示服務端判定，自己不做規則。
test('B8 檢驗整遊戲：POST 落庫，逐章列出受影響的章；通過時明確說通過', async () => {
 const h = setup(); await h.ui.actions.refresh();
 const base = { version: 1, gameId: GAME, draftRevision: '4', sourceDigest: 'e'.repeat(64), chapterCount: 20, chapters: [] };
 h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : base);
 await h.ui.actions.check(GAME);
 const call = h.calls.find(entry => entry[0] === `/api/games/${GAME}/draft/chapter-references`);
 assert.ok(call); assert.deepEqual(call[1], {}, '檢驗送出空 body（結果由服務端保存）；不帶 Idempotency-Key');
 assert.equal(call[2], undefined);
 assert.equal(h.calls.filter(entry => entry[0] === '/api/publish').length, 0, '檢驗不會發上架請求'); assert.equal(h.journal.size, 0);
 assert.deepEqual(h.model.references, []); assert.match(h.model.referencesText, /全部章節引用完整/);
 // 四層逐項：沒有對應 code 的層就是 ✓，整份沒有任何章節問題時四層全過。
 assert.equal(h.model.validationChecked, true); assert.equal(h.model.validationPassed, true);
 assert.deepEqual(h.model.validationLayers.map(layer => layer.code), ['CHAPTER_MISSING', 'CHAPTER_GENERAL_MISSING', 'CHAPTER_CITY_MISSING', 'CHAPTER_CITY_SLOT_MISSING']);
 assert.deepEqual(h.model.validationLayers.map(layer => layer.ok), [true, true, true, true]);
 h.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : { ...base, chapters: [
  { chapterId: `${GAME}#chapter-1`, chapterName: '第一章', problems: [{ code: 'CHAPTER_CITY_SLOT_MISSING', detail: '底層據點已無固定槽 3' }] },
  { chapterId: `${GAME}#chapter-2`, chapterName: '第二章', problems: [{ code: 'CHAPTER_GENERAL_MISSING', detail: '武將庫已無本章引用的武將：x' }, { code: 'CHAPTER_CITY_MISSING', detail: '據點定義已無本章引用的據點：y' }] },
 ] });
 await h.ui.actions.check(GAME);
 assert.deepEqual(h.model.references.map(entry => entry.name), ['第一章', '第二章']);
 assert.equal(h.model.references[1].problems.length, 2);
 assert.match(h.model.referencesText, /第一章（底層據點已無固定槽 3）／第二章/);
 assert.match(h.model.message, /檢驗失敗/); assert.equal(h.journal.size, 0);
 // 失敗層只列自己對應的 chapter/detail，通過層不受其他層連坐；章節索引層沒有 code 即維持 ✓。
 assert.equal(h.model.validationPassed, false);
 assert.deepEqual(h.model.validationLayers.map(layer => layer.ok), [true, false, false, false]);
 assert.deepEqual(h.model.validationLayers[3].failures.map(entry => entry.name), ['第一章']);
 assert.deepEqual(h.model.validationLayers[1].failures.map(entry => entry.detail), ['武將庫已無本章引用的武將：x']);
 assert.deepEqual(h.model.validationLayers[2].failures.map(entry => entry.name), ['第二章']);
 // 未知形狀的回執不得被當成清單。
 const broken = setup(); await broken.ui.actions.refresh();
 broken.reply(async path => path === '/api/games/submissions' ? { games: [row()] } : { ...base, chapters: [{ chapterId: `${GAME}#chapter-1` }] });
 await assert.rejects(broken.ui.actions.check(GAME), /全章校驗/); assert.deepEqual(broken.model.references, []);
});
test('B8 上架被全章校驗拒絕時直接顯示被拒清單，且不建立追蹤鍵', async () => {
 const chapters = [{ chapterId: `${GAME}#chapter-1`, chapterName: '第一章', problems: [{ code: 'CHAPTER_CITY_SLOT_MISSING', detail: '底層據點已無固定槽 3' }] }];
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
test('上架彈窗 ①–⑥：只顯示服務端回報的步驟，不在客戶端補步', async () => {
 const titles = ['讀取草稿修訂與快照', '全章引用校驗', '檢驗記錄核對', '結構驗證與即時編譯', '凍結封包與分配版本序號', '寫入分發帳本並排隊'];
 const progress = (step, state = 'running', failedStep = null, code = null) => ({ version: 1, gameId: GAME, key: 'k'.repeat(16), total: 6, steps: titles, progress: { step, total: 6, state, failedStep, code, updatedAt: TIME } });
 const h = setup(); await h.ui.actions.refresh();
 let release;
 const held = new Promise(resolve => { release = resolve; });
 h.reply(async path => {
  if (path === '/api/games/submissions') return { games: [row()] };
  if (path.endsWith('/progress')) return progress(2);
  if (path === '/api/publish') return held;
  throw new Error(path);
 });
 const running = h.ui.actions.publish(GAME);
 await new Promise(resolve => setTimeout(resolve, 30));
 assert.ok(h.calls.some(entry => entry[0].endsWith('/progress')), '進度走同一把鍵的 /progress');
 assert.deepEqual(h.model.steps.map(step => step.title), titles);
 assert.deepEqual(h.model.steps.map(step => step.state), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
 assert.equal(h.model.stepsFailed, false);
 release(pin());
 await running;
 assert.match(h.model.result, /本地已提交上架申請/);
 // 失敗步：只有服務端說失敗的那一步變 ✗，之前已完成的不倒退。
 const f = setup(); await f.ui.actions.refresh();
 let reject;
 const pendingPost = new Promise((_, fail) => { reject = fail; });
 f.reply(async path => {
  if (path === '/api/games/submissions') return { games: [row()] };
  if (path.endsWith('/progress')) return progress(3, 'failed', 3, 'PUBLISH_NOT_COMPILED');
  if (path === '/api/publish') return pendingPost;
  throw new Error(path);
 });
 const failing = f.ui.actions.publish(GAME);
 await new Promise(resolve => setTimeout(resolve, 30));
 assert.deepEqual(f.model.steps.map(step => step.state), ['done', 'done', 'done', 'failed', 'todo', 'todo']);
 assert.equal(f.model.stepsFailed, true);
 reject(failure(422, 'PUBLISH_NOT_COMPILED'));
 await assert.rejects(failing, error => error.code === 'PUBLISH_NOT_COMPILED');
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
 assert.equal(h.calls.filter(call => call[0].includes('/publish-operations/') && !call[0].endsWith('/progress')).length, 0, '已確認時不再補查分發狀態');
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
 assert.equal(h2.calls.filter(call => call[0].includes('/publish-operations/') && !call[0].endsWith('/progress')).length, 1, '待確認時仍補查狀態');
 assert.match(h2.model.result, /此次分發曾於 .* 確認/);
 // 缺鍵＝舊協議：照舊補查，不把回應當成已確認。
 const h3 = setup(); await h3.ui.actions.refresh();
 await h3.ui.actions.publish(GAME);
 assert.equal(h3.calls.filter(call => call[0].includes('/publish-operations/') && !call[0].endsWith('/progress')).length, 1);
 assert.match(h3.model.result, /分發待確認/);
});
// 用戶要求（2026-11）：在上架審核裡刪掉那個遊戲，就等於那筆追蹤失去對象，
// 不該再擋住後來新複製／新生成的遊戲上架，也不該讓人去猜「舊遊戲的編號」是什麼。
test('上架追蹤的目標遊戲已被刪除時，本機記錄自動作廢，不再擋住新遊戲上架', async () => {
 const stale = { actorId: ACTOR, gameId: GAME, key: 'k'.repeat(32), kind: 'publish', name: '臥龍傳', version: 1 };
 const seed = h => { h.journal.set(`editor-submission-operation:${ACTOR}`, JSON.stringify(stale)); h.ui.setIdentity(null); h.ui.setIdentity(author()); };
 // ① 清單已不含該 gameId（別的分頁或管理員面板刪掉的）→ 刷新即作廢，且說出原因。
 const h = setup(); seed(h);
 assert.match(h.model.blockedReason, /上架申請暫停/); assert.doesNotMatch(h.model.blockedReason, /編號/, '目標已不存在時不再顯示無用的短碼');
 h.setGames([row({ gameId: OTHER })]);
 await h.ui.actions.refresh();
 assert.equal(h.journal.size, 0); assert.match(h.model.operation, /沒有追蹤中的上架或刪除操作/);
 assert.equal(h.model.blockedReason, ''); assert.equal(h.model.rows[0].publishDisabled, false);
 assert.match(h.model.message, /目標已刪除.*自動作廢/);
 // ② 清單讀取失敗不得誤清：沒有權威答案就保留原鍵。
 const h2 = setup(); seed(h2); h2.reply(async () => { throw new Error('network'); });
 await assert.rejects(h2.ui.actions.refresh()); assert.equal(h2.journal.size, 1); assert.match(h2.model.blockedReason, /上架申請暫停/);
 // ③ 伺服器答 GAME_NOT_FOUND 也是權威答案：查詢即作廢，不必等清單。
 const h3 = setup(); seed(h3);
 h3.reply(async path => { if (path === '/api/games/submissions') return { games: [row()] }; throw failure(404, 'GAME_NOT_FOUND'); });
 await h3.ui.actions.query();
 assert.equal(h3.journal.size, 0); assert.match(h3.model.message, /目標已刪除.*自動作廢/);
});
// 用戶要求（2026-11）：上架申請＝送出一次審核申請（管理員同意後玩家端才可見可玩）。
// 所以按鈕只在「有東西可送」時開放：待審核中不重複送、被駁回可重送、已上架需有新修訂。
test('上架申請只在有東西可送時開放：待審核中禁用、被駁回可重送、已上架需有新修訂', async () => {
 const view = async over => { const h = setup(); h.setGames([row(over)]); await h.ui.actions.refresh(); return h; };
 const pending = await view({ state: 'pending', version: '1.0', stateTime: TIME });
 assert.equal(pending.model.rows[0].publishDisabled, true);
 assert.match(pending.model.rows[0].publishHint, /等管理員在「審核」按「同意」.*不能重複提交/);
 await assert.rejects(pending.ui.actions.publish(GAME), /不能重複提交/); assert.equal(pending.posts().length, 0);
 const rejected = await view({ state: 'pending', version: '1.0', stateTime: TIME, rejected: true });
 assert.equal(rejected.model.rows[0].publishDisabled, false); assert.match(rejected.model.rows[0].publishHint, /已被駁回.*1\.1/);
 const unchanged = await view({ state: 'listed', version: '1.0', stateTime: TIME, draftChanged: false });
 assert.equal(unchanged.model.rows[0].publishDisabled, true); assert.match(unchanged.model.rows[0].publishHint, /沒有新修訂/);
 await assert.rejects(unchanged.ui.actions.publish(GAME), /沒有新修訂/); assert.equal(unchanged.posts().length, 0);
 const changed = await view({ state: 'listed', version: '1.0', stateTime: TIME, draftChanged: true });
 assert.equal(changed.model.rows[0].publishDisabled, false); assert.match(changed.model.rows[0].publishHint, /版本號自動為 1\.1/);
});
