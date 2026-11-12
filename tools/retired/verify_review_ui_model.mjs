// B3 上架審核 controller contract (display/controller only, not authority).
// 跨創作者清單、「已駁回」顯示、同意/拒絕/刪除三個實際請求與失敗後必重讀，
// 都在這裡鎖住；服務端行為由 tools/verify_review_backend.mjs 用真實程式碼驗證。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { installReview } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../server/public/review.txt', import.meta.url))).toString('base64'));
const GAME = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', THIRD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-11-01T00:00:00.000Z', EARLIER = '2026-10-01T00:00:00.000Z';
const root = user => ({ user });
const admin = (version = 1) => root({ id: ADMIN, role: 'admin', version, mustChangePassword: false });
const row = (over = {}) => ({ gameId: GAME, author: 'creator_a', name: '臥龍傳', introduction: '原文', version: '1.0', state: 'pending', stateTime: TIME, rejected: false, rowRevision: '4', createdAt: EARLIER, ...over });
const listing = over => ({ gameId: GAME, ownerId: ADMIN, metadata: { name: '臥龍傳', introduction: '原文' }, draftRevision: '4', rowRevision: '5', currentReleaseId: 'dddddddd-dddd-4ddd-addd-dddddddddddd', nextOrdinal: '1.1', listed: true, restricted: false, createdAt: EARLIER, modifiedAt: TIME, ...over });
const rejectReceipt = over => ({ gameId: GAME, action: 'reject', ordinal: '1.0', rowRevision: '5', rejectedAt: TIME, ...over });
const fence = over => ({ gameId: GAME, state: 'fenced', rowRevision: '5', createdAt: TIME, ...over });
const failure = (status, code) => Object.assign(new Error(code), { status, code });
function setup(over = {}) {
  let identity = admin(), busy = false, model, rows = [row()], reply = over.reply;
  const calls = [];
  const ui = installReview({ api: async (...args) => { calls.push(args); if (reply) return reply(...args); throw new Error('unexpected ' + args[0]); }, authority: () => identity, isBusy: () => busy, work: async fn => { if (busy) return undefined; busy = true; try { return await fn(); } finally { busy = false; ui.render(); } }, publish: value => { model = value; } });
  ui.setIdentity(identity);
  return { ui, calls, get model() { return model; }, setReply(fn) { reply = fn; }, setRows(value) { rows = value; }, listReply: () => ({ games: structuredClone(rows) }), identity(value) { identity = value; ui.setIdentity(value); }, posts: () => calls.filter(call => call[1] !== undefined), lists: () => calls.filter(call => call[0] === '/api/admin/reviews' && call[1] === undefined) };
}
test('開頁不自動讀取；清單投影含作者與已駁回，且不外洩草稿內容', async () => {
  const h = setup();
  assert.equal(h.calls.length, 0, '安裝與切換身份都不得發請求');
  assert.equal(h.model.rows.length, 0);
  h.setReply(async path => { assert.equal(path, '/api/admin/reviews'); return h.listReply(); });
  h.setRows([row(), row({ gameId: OTHER, state: 'listed', version: '1.1', stateTime: TIME }), row({ gameId: THIRD, state: 'pending', rejected: true })]);
  await h.ui.actions.refresh();
  assert.equal(h.calls[0][0], '/api/admin/reviews');
  assert.equal(h.calls[0][1], undefined, '清單必須是 GET');
  assert.deepEqual(h.model.rows.map(entry => entry.state), ['待上架', '已上架', '待上架']);
  assert.equal(h.model.rows[0].author, 'creator_a');
  assert.equal(h.model.rows[0].rejected, false);
  assert.equal(h.model.rows[2].rejected, true);
  assert.doesNotMatch(JSON.stringify(h.model), /sourceDigest|csrf|snapshot|draftRevision/i);
  assert.equal(h.model.rows[0].introduction, '原文');
  assert.match(h.model.rows[0].createdAt, /^\d{4}-\d\d-\d\dT/);
});
test('清單欄位無效時整批拒絕，且不保留半份資料', async () => {
  const broken = [
    row({ gameId: 'not-a-uuid' }),
    row({ state: 'published' }),
    row({ state: 'draft', version: '1.0' }),
    row({ state: 'pending', version: null }),
    row({ version: '2.0' }),
    row({ name: '一二三四五六七八九' }),
    row({ author: '' }),
    row({ createdAt: 'yesterday' }),
    row({ stateTime: 'yesterday' }),
    row({ rejected: 'yes' }),
    row({ state: 'listed', rejected: true }),
    row({ rowRevision: '0' }),
  ];
  for (const entry of broken) {
    const h = setup();
    h.setReply(async () => ({ games: [entry] }));
    await assert.rejects(h.ui.actions.refresh(), /審核清單/);
    assert.deepEqual(h.model.rows, [], JSON.stringify(entry));
  }
  const h = setup();
  h.setReply(async () => ({ games: [row(), row()] }));
  await assert.rejects(h.ui.actions.refresh(), /審核清單欄位無效/);
});
test('只有管理員可用：非管理員鎖定且動作直接拒絕', async () => {
  const h = setup();
  h.setReply(async () => h.listReply());
  h.identity(root({ id: '22222222-2222-4222-8222-222222222222', role: 'author', version: 1, mustChangePassword: false }));
  assert.equal(h.model.locked, true);
  assert.equal(h.model.refreshDisabled, true);
  await assert.rejects(() => h.ui.actions.refresh(), /重新核對登入/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.ui.canLeave(), true);
});
test('同意上架：POST 既有 admin listing，帶原 rowRevision 與新鍵，成功後重讀清單', async () => {
  const h = setup();
  h.setReply(async (path, value, options) => {
    if (path === '/api/admin/reviews') return h.listReply();
    assert.equal(path, '/api/games/' + GAME + '/listing');
    assert.deepEqual(value, { action: 'list', expectedRowRevision: '4' });
    assert.match(options.key, /^[a-f0-9-]{36}$/);
    assert.equal(options.revision, '4');
    return listing();
  });
  await h.ui.actions.refresh();
  await h.ui.actions.approve(GAME, '4');
  const posts = h.posts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0][0], '/api/games/' + GAME + '/listing');
  assert.equal(h.lists().length, 2, '操作後必須重讀清單');
  assert.match(h.model.result, /已同意上架版本 1\.0/);
  assert.equal(h.model.message, '');
});
test('拒絕：POST 審核決定，回執不符或失敗都不改狀態，且一律重讀清單', async () => {
  const h = setup();
  let mode = 'ok';
  h.setReply(async (path, value, options) => {
    if (path === '/api/admin/reviews') return h.listReply();
    assert.equal(path, '/api/admin/games/' + GAME + '/review');
    assert.deepEqual(value, { action: 'reject', expectedRowRevision: '4' });
    assert.match(options.key, /^[a-f0-9-]{36}$/);
    if (mode === 'bad') return rejectReceipt({ ordinal: '1.1' });
    if (mode === 'error') throw failure(409, 'GAME_CHANGED');
    return rejectReceipt();
  });
  await h.ui.actions.refresh();
  await h.ui.actions.reject(GAME, '4');
  assert.match(h.model.result, /已拒絕版本 1\.0/);
  mode = 'bad';
  await assert.rejects(() => h.ui.actions.reject(GAME, '4'), /拒絕回執格式無效/);
  mode = 'error';
  await assert.rejects(() => h.ui.actions.reject(GAME, '4'), /GAME_CHANGED/);
  assert.match(h.model.message, /清單已被其他人變更/);
  assert.equal(h.lists().length, 4, '每次操作（含失敗）都要重讀清單');
  assert.equal(h.model.rows[0].state, '待上架', '控制器不得自行改狀態');
  assert.equal(h.model.rows[0].rejected, false);
});
test('刪除：任何狀態都用同一個 fence 請求（含已上架），確認名＝目前名稱', async () => {
  for (const state of ['listed', 'pending', 'draft']) {
    const h = setup();
    h.setReply(async path => {
      if (path === '/api/admin/reviews') return h.listReply();
      h.setRows([]);
      return fence();
    });
    h.setRows([row({ state, version: state === 'draft' ? null : '1.0' })]);
    await h.ui.actions.refresh();
    await h.ui.actions.remove(GAME, '4');
    const post = h.posts()[0];
    assert.equal(post[0], '/api/games/' + GAME + '/deletion');
    assert.deepEqual(post[1], { gameId: GAME, expectedRowRevision: '4', confirmationName: '臥龍傳' }, state);
    assert.match(h.model.result, /已徹底刪除（不可恢復）|物理刪除尚未完成/);
    assert.deepEqual(h.model.rows, [], state);
  }
});
test('操作前後核對身份與 rowRevision：過期目標或帳戶版本變更都不得送出', async () => {
  const h = setup();
  h.setReply(async () => h.listReply());
  await h.ui.actions.refresh();
  await assert.rejects(() => h.ui.actions.approve(GAME, '9'), /審核目標已變/);
  await assert.rejects(() => h.ui.actions.reject(OTHER, '4'), /審核目標已變/);
  assert.equal(h.posts().length, 0);
  h.setReply(async path => { if (path === '/api/admin/reviews') return h.listReply(); h.identity(admin(2)); return listing(); });
  await h.ui.actions.refresh();
  await h.ui.actions.approve(GAME, '4');
  assert.deepEqual(h.model.rows, [], '身份版本改變後不得沿用舊快照');
});
test('按鈕可用性與提示：草稿不可審核、已駁回不可再拒、刪除恆可用', async () => {
  const h = setup();
  h.setReply(async () => h.listReply());
  h.setRows([
    row({ gameId: GAME, state: 'pending' }),
    row({ gameId: OTHER, state: 'pending', rejected: true }),
    row({ gameId: THIRD, state: 'draft', version: null, stateTime: null }),
  ]);
  await h.ui.actions.refresh();
  const [approve, reject] = h.model.rows;
  assert.equal(approve.approveDisabled, false);
  assert.equal(approve.rejectDisabled, false);
  assert.match(approve.rejectHint, /已駁回/);
  assert.match(approve.deleteHint, /刪除整個遊戲.*不是刪除單個版本.*不可恢復/);
  assert.equal(reject.approveDisabled, false, '已駁回仍可同意');
  assert.equal(reject.rejectDisabled, true);
  assert.equal(h.model.rows[2].approveDisabled, true);
  assert.equal(h.model.rows[2].rejectDisabled, true);
  assert.equal(h.model.rows[2].deleteDisabled, false);
  assert.equal(h.model.rows[0].deleteDisabled, false);
});
test('錯誤碼映射：管理限制、未提交、刪除中、確認名稱、分發皆給繁中說明', async () => {
  const cases = [
    [403, 'ADMIN_REQUIRED', /只有管理員/],
    [409, 'REVIEW_LISTED', /已上架/],
    [409, 'REVIEW_NOT_SUBMITTED', /還沒有可審核/],
    [409, 'GAME_DELETING', /刪除流程/],
    [409, 'DELETE_CONFIRMATION', /確認名稱/],
    [409, 'LISTING_RESTRICTED', /管理限制/],
    [503, 'DISTRIBUTION_NOT_CONFIGURED', /尚未配置分發/],
  ];
  for (const [status, code, pattern] of cases) {
    const h = setup();
    h.setReply(async path => { if (path === '/api/admin/reviews') return h.listReply(); throw failure(status, code); });
    await h.ui.actions.refresh();
    await assert.rejects(() => h.ui.actions.reject(GAME, '4'));
    assert.match(h.model.message, pattern, code);
    assert.equal(h.model.rows.length, 1);
  }
});
const release = (over = {}) => ({ gameId: GAME, version: '1.0', digest: 'a'.repeat(64), state: 'confirmed', publishedAt: TIME, ...over });
test('發布歷史：按了才讀、一次 GET、再按收起，摘要只露前 8 位', async () => {
  const h = setup();
  h.setReply(async path => {
    if (path === '/api/admin/reviews') return h.listReply();
    if (path === '/api/admin/games/' + GAME + '/releases') return { gameId: GAME, releases: [release(), release({ version: '1.1', state: 'pending', publishedAt: null })] };
    throw new Error('unexpected ' + path);
  });
  await h.ui.actions.refresh();
  assert.equal(h.model.history.gameId, null, '重新整理清單不得順便讀發布歷史');
  assert.equal(h.model.history.rows.length, 0);
  assert.equal(h.calls.filter(entry => /\/releases$/.test(entry[0])).length, 0);
  await h.ui.actions.history(GAME);
  const reads = h.calls.filter(entry => /\/releases$/.test(entry[0]));
  assert.equal(reads.length, 1);
  assert.equal(reads[0][1], undefined, '發布歷史必須是 GET');
  assert.equal(h.model.history.gameId, GAME);
  assert.deepEqual(h.model.history.rows.map(entry => [entry.version, entry.state, entry.stateText]), [['1.0', 'confirmed', '已公開'], ['1.1', 'pending', '待確認']]);
  assert.equal(h.model.history.rows[0].shortDigest, 'aaaaaaaa');
  assert.equal(h.model.history.rows[0].digest, 'a'.repeat(64), '整串只留在 title，不在句子裡');
  assert.equal(h.model.history.rows[1].publishedAt, '—');
  assert.equal(h.model.rows.find(entry => entry.gameId === GAME).historyOpen, true);
  await h.ui.actions.history(GAME);
  assert.equal(h.model.history.gameId, null, '再按一次收起');
  assert.equal(h.model.rows.find(entry => entry.gameId === GAME).historyOpen, false);
  assert.equal(h.calls.filter(entry => /\/releases$/.test(entry[0])).length, 1, '收起不得再發請求');
});
test('發布歷史：空清單不是錯誤，且格式無效整批拒絕、失敗留在展開裡可重試', async () => {
  const empty = setup();
  empty.setReply(async path => {
    if (path === '/api/admin/reviews') return empty.listReply();
    if (path === '/api/admin/games/' + GAME + '/releases') return { gameId: GAME, releases: [] };
    throw new Error('unexpected ' + path);
  });
  await empty.ui.actions.refresh();
  await empty.ui.actions.history(GAME);
  assert.deepEqual(empty.model.history.rows, []);
  assert.equal(empty.model.history.message, '');
  assert.equal(empty.model.history.gameId, GAME);

  const broken = [
    { gameId: GAME, releases: 'nope' },
    { gameId: OTHER, releases: [] },
    { gameId: GAME, releases: [release({ version: '2.0' })] },
    { gameId: GAME, releases: [release({ digest: 'abc' })] },
    { gameId: GAME, releases: [release({ state: 'listed' })] },
    { gameId: GAME, releases: [release({ state: 'pending' })] },
    { gameId: GAME, releases: [release({ publishedAt: null })] },
    { gameId: GAME, releases: [release({ gameId: OTHER })] },
    { gameId: GAME, releases: [release(), release()] },
    { gameId: GAME, releases: [{ ...release(), extra: 1 }] },
  ];
  for (const value of broken) {
    const h = setup();
    h.setReply(async path => {
      if (path === '/api/admin/reviews') return h.listReply();
      if (path === '/api/admin/games/' + GAME + '/releases') return value;
      throw new Error('unexpected ' + path);
    });
    await h.ui.actions.refresh();
    await assert.rejects(() => h.ui.actions.history(GAME), /發布歷史格式無效/, JSON.stringify(value));
    assert.deepEqual(h.model.history.rows, [], JSON.stringify(value));
  }

  const failing = setup();
  failing.setReply(async path => {
    if (path === '/api/admin/reviews') return failing.listReply();
    throw failure(422, 'RELEASE_HISTORY_QUERY');
  });
  await failing.ui.actions.refresh();
  await assert.rejects(() => failing.ui.actions.history(GAME));
  assert.equal(failing.model.history.gameId, GAME, '失敗仍保持展開，方便再按一次');
  assert.match(failing.model.history.message, /發布歷史查詢格式無效.*再按一次/);
  assert.equal(failing.model.history.loading, false);
});
