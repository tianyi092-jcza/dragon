// F4 上架面 UI 模型契约（新列）：行＝游戏名称｜说明｜版本号｜状态｜检验｜创建时间｜状态时间｜操作；
// 检验列 passed/failed/未检验/已过期＋时间；上架提示取 blockedReason 人话；模型不泄露 ticket/摘要。
// 流程覆盖见 verify_publish_controller_slot；此处只断列形状与文案，不重验流程。
// 用法：node --test tools/verify_publish_ui_model.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { installPublish } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/publish.txt', import.meta.url))).toString('base64')}`);
const GAME = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const TIME = '2026-11-01T00:00:00.000Z';
const author = () => ({ user: { id: '11111111-1111-4111-8111-111111111111', role: 'author', version: 1, mustChangePassword: false } });
const games = () => ({ games: [
  { gameId: GAME, draftRevision: '1', metadata: { name: '甲', introduction: '介' }, createdAt: TIME },
  { gameId: OTHER, draftRevision: '1', metadata: { name: '乙', introduction: '' }, createdAt: TIME },
] });
const submission = (over = {}) => ({
  gameId: GAME, state: 'draft', version: null, nextVersion: '1.0', copyDigest: 'a'.repeat(64), copyUpdatedAt: TIME,
  validation: { state: 'passed', checkedAt: TIME, problems: [] },
  slot: { state: 'ready', description: null, submittedAt: null, validatedAt: TIME },
  publishEnabled: true, blockedReason: null,
  ...over,
});
function setup() {
  let identity = author(), busy = false, model;
  const calls = [];
  let response = null;
  const h = { calls, response: handler => { response = handler; }, get model() { return model; } };
  const ui = installPublish({
    api: async (path, body) => { calls.push([path, body]); if (response) return response(path, body); throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (e) { h.error = e; } finally { busy = false; ui.render(); } },
    publish: value => { model = value; },
    gameContext: { current: () => null, select: () => false, reset: () => {} },
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => true,
  });
  ui.setIdentity(identity);
  h.ui = ui;
  return h;
}
const ROW_KEYS = ['gameId', 'name', 'introduction', 'version', 'nextVersion', 'state', 'stateKey', 'rejected', 'createdAt', 'stateTime', 'validation', 'validationTime', 'validationKey', 'validationState', 'publishDisabled', 'publishHint', 'publishTitle'];

test('columns: one row per game, exact keys, no ticket or digest leakage, no automatic read', async () => {
  const h = setup(); assert.equal(h.calls.length, 0);
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${GAME}/copy/submission`) return submission();
    if (path === `/api/games/${OTHER}/copy/submission`) return submission({ gameId: OTHER });
    throw new Error('unexpected api: ' + path);
  });
  await h.ui.actions.refresh();
  assert.equal(h.model.rows.length, 2);
  assert.deepEqual(Object.keys(h.model.rows[0]).sort(), [...ROW_KEYS].sort());
  assert.equal(h.model.rows[0].name, '甲');
  assert.equal(h.model.rows[0].nextVersion, '1.0');
  assert.doesNotMatch(JSON.stringify(h.model), /ticket|copyDigest|csrf/i);
});

test('validation column: unvalidated/failed/passed/stale labels plus time', async () => {
  const h = setup();
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${GAME}/copy/submission`) return submission({ validation: null, publishEnabled: false, blockedReason: '副本已变更，请重新检验。' });
    if (path === `/api/games/${OTHER}/copy/submission`) return submission({ gameId: OTHER, validation: { state: 'failed', checkedAt: TIME, problems: [] }, publishEnabled: false, blockedReason: '检验未通过，请依红字修正后重新检验。' });
    throw new Error('unexpected api: ' + path);
  });
  await h.ui.actions.refresh();
  const [a, b] = h.model.rows;
  assert.equal(a.validation, '未检验');
  assert.equal(b.validation, '检验失败');
  assert.equal(b.validationTime, new Date(TIME).toLocaleString());
  const h2 = setup();
  h2.response(path => {
    if (path === '/api/games') return games();
    if (path.includes('/copy/submission')) return submission({ validation: { state: 'passed', checkedAt: TIME, problems: [] }, publishEnabled: false, blockedReason: '副本已变更，请重新检验。' });
    throw new Error('unexpected api: ' + path);
  });
  await h2.ui.actions.refresh();
  assert.equal(h2.model.rows[0].validation, '检验已过期');
  const h3 = setup();
  h3.response(path => {
    if (path === '/api/games') return games();
    if (path.includes('/copy/submission')) return submission();
    throw new Error('unexpected api: ' + path);
  });
  await h3.ui.actions.refresh();
  assert.equal(h3.model.rows[0].validation, '检验成功');
  assert.equal(h3.model.rows[0].validationTime, new Date(TIME).toLocaleString());
});

test('publish hint: blockedReason passthrough, description-empty hint, ready hint carries nextVersion', async () => {
  const h = setup();
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${GAME}/copy/submission`) return submission({ publishEnabled: false, blockedReason: '提交太频繁，请 3 分钟后再试。' });
    if (path === `/api/games/${OTHER}/copy/submission`) return submission({ gameId: OTHER });
    throw new Error('unexpected api: ' + path);
  });
  await h.ui.actions.refresh();
  const [a, b] = h.model.rows;
  assert.equal(a.publishDisabled, true);
  assert.match(a.publishHint, /3 分钟/);
  assert.equal(b.publishDisabled, true);
  assert.match(b.publishHint, /发布说明/);
  h.ui.actions.setDescription('第一版');
  assert.equal(h.model.descriptionCount, 3);
  assert.equal(h.model.rows[1].publishDisabled, false);
  assert.match(h.model.rows[1].publishHint, /1\.0/);
});

test('malformed games or submission reject the refresh without rows', async () => {
  for (const bad of [
    async () => ({ games: [{ gameId: GAME }] }),
    async () => { throw Object.assign(new Error('gone'), { status: 404, code: 'GAME_NOT_FOUND' }); },
  ]) {
    const h = setup();
    h.response(path => {
      if (path === '/api/games') return bad();
      if (path.includes('/copy/submission')) return { gameId: GAME };
      throw new Error('unexpected api: ' + path);
    });
    await h.ui.actions.refresh();
    assert.deepEqual(h.model.rows, []);
    assert.ok(h.error);
  }
  const h = setup();
  h.response(path => {
    if (path === '/api/games') return games();
    if (path.includes('/copy/submission')) return submission({ nextVersion: 'x' });
    throw new Error('unexpected api: ' + path);
  });
  await h.ui.actions.refresh();
  assert.ok(h.error);
  // 行已赋值后读槽失败：行降级为未读取（无版本、无操作），不崩溃不谎报。
  assert.equal(h.model.rows.length, 2);
  assert.equal(h.model.rows[0].validation, '未读取');
  assert.equal(h.model.rows[0].nextVersion, '—');
  assert.equal(h.model.rows[0].publishDisabled, true);
});
