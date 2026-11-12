// F3e 地图命令控制器：copyMapId 身份格式＋submitCopyMapEdits/copyMapEdit 精确单体＋重读。
// UI-controller checks only；传输/后端鉴权另测；面板改绑待后续。
// 用法：node --test tools/verify_copy_controller_map.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const copyData = (over = {}) => ({
  metadata: { name: '測圖', introduction: '' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: {
    name: '第一章', start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3 }],
    generals: [], cities: [],
  } } },
  cities: {},
  map: { base: { terrainRef: [0], geography: [0], unknownUnderlays: {} }, decorations: [], roads: [], placements: [], waterGroups: [] },
  ...over,
});

function harness() {
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [];
  let response = null;
  const h = { calls, errors, response: handler => { response = handler; }, model: () => model };
  const controller = installDraftEditor({
    api: async (path, body) => { calls.push({ path, body }); if (response) return response(path, body); if (path === '/api/games') return { games: [{ gameId, draftRevision: '1', metadata: { name: '舊', introduction: '稿' } }] }; throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    publish: value => { model = value; },
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: () => undefined, setItem: () => {}, removeItem: () => {} },
    confirm: () => true, prompt: () => null,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };
const loadOk = h => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() }; throw new Error('unexpected api: ' + path); }); };
const posts = h => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).map(c => c.body);

test('copyMapId mints gameId#kind-64hex identities, rejects bad kind and unloaded copy', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  for (const kind of ['decoration', 'material', 'water']) {
    const id = h.actions.copyMapId(kind);
    assert.match(id, new RegExp(`^${gameId}#${kind}-[0-9a-f]{64}$`));
  }
  assert.throws(() => h.actions.copyMapId('city'), /種類無效/);
  const h2 = harness(); await selectGame(h2);
  assert.throws(() => h2.actions.copyMapId('decoration'), /載入/);
  assert.equal(h.errors.length, 0);
});

test('submitCopyMapEdits posts exact module body and re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const edits = [{ op: 'base-fill', cells: [0], tile: 5, geography: 1 }];
  assert.equal(await h.actions.submitCopyMapEdits(edits), true);
  assert.deepEqual(posts(h), [{ module: 'map', patch: { edits } }]);
  assert.equal(h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length, 2);
  assert.equal(h.errors.length, 0);
});

test('copyMapEdit wraps a single op and malformed edits send nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  const edit = { op: 'decoration-remove', memberIds: ['x'] };
  assert.equal(await h.actions.copyMapEdit(edit), true);
  assert.deepEqual(posts(h), [{ module: 'map', patch: { edits: [edit] } }]);
  await assert.rejects(h.actions.submitCopyMapEdits([]), /不能為空/);
  await assert.rejects(h.actions.submitCopyMapEdits([{ op: 1 }]), /格式無效/);
  await assert.rejects(h.actions.submitCopyMapEdits('nope'), /不能為空/);
  assert.equal(h.calls.length, base + 2);
});

test('server rejection surfaces without claiming success', async () => {
  const h = harness(); await selectGame(h);
  h.response(path => {
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.loadCopy();
  const failure = new Error('坏命令'); failure.status = 422; failure.code = 'COPY_MAP';
  h.response(path => {
    if (path === `/api/games/${gameId}/copy` && h.calls.at(-1)?.body !== undefined) throw failure;
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.copyMapEdit({ op: 'bogus' });
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /坏命令/);
});
