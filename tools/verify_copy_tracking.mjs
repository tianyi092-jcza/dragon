// 複製遊戲的追蹤契約（用戶 m947 要求）：按一次就跑到完成，不需要再按「續」，
// 也不重新核對；進度只報實際寫入的檔案數，不臆造百分比。
// 這裡只測編輯器側控制器，服務端的租約/冪等仍由既有 backend lane 負責。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCopyController } from '../editor-ui/src/copy.js';

const ACTOR = { user: { id: 'admin-1', role: 'admin', version: 1, mustChangePassword: false } };
const pending = (over = {}) => ({ gameId: 'game-a', state: 'pending', rowRevision: '1', leaseUntil: 0, objects: 0, ...over });
const running = (over = {}) => pending({ state: 'running', leaseUntil: Date.now() + 60000, ...over });
const committed = (over = {}) => ({ gameId: 'game-a', draftRevision: '1', objects: 44, leaseUntil: 0, ...over });
const failure = (status, code) => Object.assign(new Error(code), { status, code });

function setup({ identity = ACTOR, journal = new Map(), reply } = {}) {
  let current = identity, busy = false, model = null;
  const calls = [];
  let respond = reply ?? (async () => pending());
  const storage = {
    getItem: key => journal.get(key) ?? null,
    setItem: (key, value) => journal.set(key, value),
    removeItem: key => journal.delete(key),
  };
  const ui = createCopyController({
    api: async (...args) => { calls.push(args); return respond(...args); },
    authority: () => current, isBusy: () => busy,
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } finally { busy = false; ui.render(); } },
    publish: value => { model = value; }, storage, confirm: () => true,
    gotoGame: async () => {}, mode: 'full',
  });
  ui.setIdentity(current);
  return { ui, calls, journal, get model() { return model; }, reply(fn) { respond = fn; } };
}
const paths = (h, suffix) => h.calls.filter(call => typeof call[0] === 'string' && call[0].endsWith(suffix));
const waitFor = async (check, ms = 12000) => {
  const started = Date.now();
  for (;;) {
    if (check()) return true;
    if (Date.now() - started > ms) return false;
    await new Promise(done => setTimeout(done, 25));
  }
};
// 標準腳本：保留 → 第一次 /run 停在 running（代理層切斷的回應形態）→ 查詢一次回 committed。
const script = () => {
  let runs = 0;
  return async path => {
    if (path === '/api/admin/source') return { definition: { registryId: 'fixed-source' } };
    if (path === '/api/games') return { games: [] };
    if (path === '/api/admin/copies') return pending();
    if (path.endsWith('/run')) { runs++; return runs === 1 ? running() : committed(); }
    return committed();
  };
};

test('一次點擊就跑到完成：自動查詢原鍵，不要求再按任何按鈕', async () => {
  const h = setup({ reply: script() });
  h.ui.actions.setField('name', '副本');
  await h.ui.actions.create();
  assert.equal(h.model.message, '完整副本已建立；遊戲清單已自動更新，可在「遊戲管理」直接載入。');
  assert.equal(h.model.tracking, false);
  // 只發一次保留請求，且再也沒有出現「（續）」這種要人補按的文案。
  assert.equal(paths(h, '/api/admin/copies').length, 1);
  assert.doesNotMatch(h.model.message, /續|60 秒/);
  assert.equal(h.journal.size, 0);
});

test('進度只用實際檔案數表示，不出現百分比', async () => {
  const h = setup({ reply: async path => {
    if (path === '/api/admin/source') return { definition: { registryId: 'fixed-source' } };
    if (path === '/api/games') return { games: [] };
    if (path === '/api/admin/copies') return pending();
    if (path.endsWith('/run')) return running({ objects: 137 });
    return committed();
  } });
  h.ui.actions.setField('name', '副本');
  const done = h.ui.actions.create();
  assert.equal(await waitFor(() => /已寫入 137 個檔案/.test(h.model.message)), true, '追蹤訊息要報實際檔案數');
  assert.doesNotMatch(h.model.message, /%/);
  assert.equal(h.model.tracking, true, '追蹤期間面板要顯示自動核對中');
  await done;
  assert.equal(h.model.tracking, false);
});

test('重跑被拒（已在執行）不是失敗：改為只讀核對直到完成', async () => {
  let first = true;
  const h = setup({ reply: async path => {
    if (path === '/api/admin/source') return { definition: { registryId: 'fixed-source' } };
    if (path === '/api/games') return { games: [] };
    if (path === '/api/admin/copies') return pending();
    if (path.endsWith('/run')) { if (first) { first = false; throw failure(409, 'COPY_NOT_CLAIMABLE'); } return committed(); }
    return committed();
  } });
  h.ui.actions.setField('name', '副本');
  const done = h.ui.actions.create();
  assert.equal(await waitFor(() => /回應中斷|已寫入/.test(h.model.message)), true);
  await done;
  assert.equal(h.model.message, '完整副本已建立；遊戲清單已自動更新，可在「遊戲管理」直接載入。');
});

test('租約過期才用同一個原鍵再跑一次，永不另建第二份', async () => {
  let runs = 0;
  const h = setup({ reply: async path => {
    if (path === '/api/admin/source') return { definition: { registryId: 'fixed-source' } };
    if (path === '/api/games') return { games: [] };
    if (path === '/api/admin/copies') return pending();
    if (path.endsWith('/run')) { runs++; return runs === 1 ? pending({ state: 'pending', leaseUntil: 0 }) : committed(); }
    // 租約已過但狀態仍是 running：允許同一原鍵自動重跑。
    return running({ state: 'running', leaseUntil: Date.now() - 1000 });
  } });
  h.ui.actions.setField('name', '副本');
  await h.ui.actions.create();
  assert.equal(paths(h, '/api/admin/copies').length, 1, '不得出現第二個保留請求');
  const keys = new Set(paths(h, '/run').map(call => call[0]));
  assert.equal(keys.size, 1, '所有重跑都用同一個原鍵');
  assert.equal(h.model.message, '完整副本已建立；遊戲清單已自動更新，可在「遊戲管理」直接載入。');
});

test('重新載入後自動接著核對，不必按任何按鈕', async () => {
  const journal = new Map([['editor-fullcopy-operation:admin-1', 'existing-key-1234567890']]);
  const h = setup({ journal, reply: async path => {
    if (path === '/api/games') return { games: [] };
    return committed();
  } });
  assert.equal(await waitFor(() => /已建立/.test(h.model.message)), true, '載入即自動核對到完成');
  assert.equal(h.journal.size, 0, '完成後釋放本機原鍵');
  assert.equal(paths(h, '/api/admin/copies').length, 0, '自動接著核對不得開新操作');
});

test('已取消的原操作只回報結果，不建立副本也不重跑', async () => {
  const journal = new Map([['editor-fullcopy-operation:admin-1', 'existing-key-1234567890']]);
  const h = setup({ journal, reply: async path => {
    if (path === '/api/games') return { games: [] };
    return pending({ state: 'canceled', rowRevision: '2' });
  } });
  assert.equal(await waitFor(() => /已取消/.test(h.model.message)), true);
  assert.equal(paths(h, '/run').length, 0);
});

test('服務端判定失敗時直接結束：訊息說明已丟棄、本機原鍵釋放、同名可直接重試', async () => {
  const journal = new Map([['editor-fullcopy-operation:admin-1', 'existing-key-1234567890']]);
  let replied = false;
  const h = setup({ journal, reply: async path => {
    if (path === '/api/games') return { games: [] };
    if (!replied) { replied = true; return pending({ state: 'running', leaseUntil: Date.now() + 60000, objects: 12 }); }
    return pending({ state: 'failed', rowRevision: '2' });
  } });
  assert.equal(await waitFor(() => /未完成，服務端已丟棄/.test(h.model.message)), true, '失敗要明確說已丟棄');
  assert.doesNotMatch(h.model.message, /續|仍在處理/);
  assert.equal(h.model.tracking, false, '失敗是終點，不再追蹤');
  assert.equal(h.journal.size, 0, '失敗後釋放本機原鍵，名稱可直接重用');
  assert.equal(paths(h, '/run').length, 0, '載入後只讀核對，不自動重跑');
});
