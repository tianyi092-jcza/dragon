// B6（工作台結構合同 §2）：工作台級「新建遊戲」與管理員「複製遊戲」共用同一份
// 前端協議實現，但必須走兩條不同的既有服務端管線，且互不共用輸入或追蹤鍵。
// 模型層驗證：路徑／body／角色門／原鍵命名空間。不是服務端授權或瀏覽器證據。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCopyController } from '../editor-ui/src/copy.js';

const admin = () => ({ user: { id: 'admin', role: 'admin', mustChangePassword: false } });
const author = () => ({ user: { id: 'author', role: 'author', mustChangePassword: false } });
const pending = gameId => ({ gameId, state: 'pending', rowRevision: '1', registryId: 'fixed-source', leaseUntil: 0 });
const receipt = gameId => ({ gameId, draftRevision: '1', sourceDigest: 'hidden', baselineDigest: 'hidden' });

function setup({ mode, identity, reply }) {
  let actor = identity, model = null, busy = false;
  const entries = new Map(), calls = [], errors = [];
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  let answer = reply;
  const ui = createCopyController({
    api: async (...args) => { calls.push(args); return answer(...args); },
    authority: () => actor, isBusy: () => busy, mode, gotoGame: async () => {}, confirm: () => true, storage,
    work: async action => { if (busy) return; busy = true; try { return await action(); } catch (error) { errors.push(error); } finally { busy = false; ui.render(); } },
    publish: value => { model = value; },
  });
  ui.setIdentity(identity);
  return { ui, calls, entries, errors, get model() { return model; }, reply: next => { answer = next; }, identity: next => { actor = next; ui.setIdentity(next); } };
}

test('minimal create stays on /api/games: no registry field, no admin API, own key namespace', async () => {
  const h = setup({ mode: 'minimal', identity: author(), reply: async (path, body) => {
    if (path === '/api/games' && body === undefined) return { games: [] };
    if (path === '/api/games') return pending('game-minimal');
    if (String(path).endsWith('/run')) return receipt('game-minimal');
    return pending('game-minimal');
  } });
  h.ui.actions.setField('name', '新遊戲');
  h.ui.actions.setField('introduction', '只複製地圖');
  assert.equal(h.model.visible, true);
  await h.ui.actions.create();
  const reserve = h.calls.find(([path, body]) => path === '/api/games' && body !== undefined);
  assert.deepEqual(reserve[1], { name: '新遊戲', introduction: '只複製地圖' });
  const key = reserve[2].key;
  // 追蹤跑完就釋放本機原鍵（不再留下需要人再按「續」核對的殘骸）；命名空間由 run 路徑證明。
  assert.equal(h.entries.size, 0);
  assert.equal(h.entries.has('editor-fullcopy-operation:author'), false);
  const run = h.calls.find(([path]) => String(path).endsWith('/run'));
  assert.equal(run[0], '/api/games/create/' + encodeURIComponent(key) + '/run');
  assert.deepEqual(run[2], { revision: '1' });
  assert.ok(h.calls.every(call => !String(call[0]).startsWith('/api/admin/')));
  assert.doesNotMatch(JSON.stringify(h.model), /hidden/);
  assert.equal(h.model.createDisabled, false);
});

test('full copy stays on /api/admin/copies: server-chosen registry, separate key namespace', async () => {
  const h = setup({ mode: 'full', identity: admin(), reply: async path => {
    if (path === '/api/admin/source') return { definition: { registryId: 'fixed-source' }, registered: { root: 'private' } };
    if (String(path).endsWith('/run')) return receipt('game-full');
    return pending('game-full');
  } });
  h.ui.actions.setField('name', '複製遊戲');
  h.ui.actions.setField('introduction', '');
  assert.equal(h.model.visible, true);
  await h.ui.actions.create();
  // 完整副本的來源登記只能來自 /api/admin/source（名稱先驗的唯讀清單查詢在前，不算來源）。
  assert.ok(h.calls.some(([path]) => path === '/api/admin/source'));
  const reserve = h.calls.find(([path]) => path === '/api/admin/copies');
  assert.deepEqual(reserve[1], { registryId: 'fixed-source', name: '複製遊戲', introduction: '' });
  const key = reserve[2].key;
  // 追蹤跑完就釋放本機原鍵；兩種模式的鍵命名空間不共用。
  assert.equal(h.entries.size, 0);
  assert.equal(h.entries.has('editor-copy-operation:admin'), false);
  const run = h.calls.find(([path]) => String(path).endsWith('/run'));
  assert.equal(run[0], '/api/admin/copies/' + encodeURIComponent(key) + '/run');
  assert.deepEqual(run[2], { revision: '1' });
  // 對 /api/games 的呼叫只能是名稱先驗的唯讀查詢（不得帶 body 提交建立請求）。
  assert.ok(h.calls.filter(([path]) => path === '/api/games').every(([, body]) => body === undefined));
  assert.doesNotMatch(JSON.stringify(h.model), /private|hidden/);
});

test('full copy is administrator-only in the client as well as the service', async () => {
  const h = setup({ mode: 'full', identity: author(), reply: async () => pending('never') });
  h.ui.actions.setField('name', '越權');
  assert.equal(h.model.visible, false);
  assert.equal(h.model.createDisabled, true);
  await h.ui.actions.create();
  await h.ui.actions.refresh();
  assert.deepEqual(h.calls, []);
  assert.equal(h.entries.size, 0);
});

test('a registry response without an identity key never becomes a POST or a stored key', async () => {
  for (const registry of [{}, { definition: {} }, { definition: { registryId: 7 } }, { definition: { registryId: 'x'.repeat(129) } }]) {
    const h = setup({ mode: 'full', identity: admin(), reply: async path => path === '/api/admin/source' ? registry : pending('never') });
    h.ui.actions.setField('name', '來源不明');
    await h.ui.actions.create();
    assert.equal(h.calls.filter(([, body]) => body !== undefined).length, 0);
    assert.equal(h.entries.size, 0);
    assert.match(h.model.message, /底層資源登記回應無效/);
  }
});

test('author minimal create never reads the administrator source registry', async () => {
  const h = setup({ mode: 'minimal', identity: author(), reply: async (path, body) => path === '/api/games' && body === undefined ? { games: [] } : pending('game-author') });
  h.ui.actions.setField('name', '作者新建');
  await h.ui.actions.create();
  assert.equal(h.calls.filter(([path]) => path === '/api/admin/source').length, 0);
  // 未完成的操作保留本機原鍵（可自動接著核對），不是自動建立第二份。
  assert.equal(h.entries.get('editor-copy-operation:author') !== undefined, true);
  assert.equal(h.ui.canLeave(true), false);
  assert.equal(h.model.createDisabled, true);
});
