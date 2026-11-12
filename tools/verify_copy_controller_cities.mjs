// F3a 据点页：loadCopy 建 cities 行投影 + cityCopySave 走 cities 模块。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_copy_controller_cities.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const cities = () => ({
  c1: { name: '洛陽', max_prod: 100, prod: 50, growth: 1, defence: 2, troops: 3, type: 0, view: 1 },
  c2: { name: '長安', max_prod: null, prod: null, growth: null, defence: null, troops: null, type: null, view: null },
});
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: {
    name: '第一章', start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
    generals: [{ idx: 0, name: '丁', hao: '字', faction: 0 }, { idx: 1, name: '丙', hao: '', faction: 0 }, { idx: 127, name: '留', hao: '', faction: null }],
    cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }],
  } } },
  cities: cities(),
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

test('loadCopy builds cities rows in the page projection', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const rows = h.model().copy.page.cities;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { cityId: 'c1', name: '洛陽', max_prod: 100, prod: 50, growth: 1, defence: 2, troops: 3, type: 0, view: 1 });
  assert.deepEqual(rows[1], { cityId: 'c2', name: '長安', max_prod: null, prod: null, growth: null, defence: null, troops: null, type: null, view: null });
  assert.equal(h.errors.length, 0);
});

test('loadCopy rejects malformed cities without claiming success', async () => {
  for (const bad of [{ cities: null }, { cities: { c1: { name: '', max_prod: 0 } } }, { cities: { c1: { name: '洛陽', prod: 70000 } } }, { cities: [] }]) {
    const h = harness(); await selectGame(h);
    h.response(() => ({ gameId, copyDigest: DIGEST_A, data: copyData(bad) }));
    await h.actions.loadCopy();
    assert.equal(h.model().copy.page, null, JSON.stringify(bad));
    assert.equal(h.errors.length, 1, JSON.stringify(bad));
  }
});

test('cityCopySave posts rename+numbers in one module body, then re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const reply = await h.actions.cityCopySave('c1', { name: '雒陽', prod: '51', type: '1' });
  assert.equal(reply, '已保存據點並重讀副本。');
  assert.deepEqual(posts(h), [{ module: 'cities', patch: { rename: { c1: '雒陽' }, numbers: { c1: { prod: 51, type: 1 } } } }]);
  assert.equal(h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length, 2);
  assert.equal(h.model().copy.page.cities[0].name, '洛陽');
  assert.equal(h.errors.length, 0);
});

test('cityCopySave reports no change and sends nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  assert.equal(await h.actions.cityCopySave('c1', { name: '洛陽', prod: '50' }), '據點沒有變更。');
  assert.equal(h.calls.length, base);
  assert.equal(h.errors.length, 0);
});

test('cityCopySave refuses bad input locally and sends nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  const cases = [
    ['c9', { name: '新名' }],
    ['c1', { name: '長安' }],
    ['c1', { name: '名'.repeat(13) }],
    ['c1', { prod: '70000' }],
    ['c1', { prod: 'x' }],
    ['c1', { prod: '' }],
    ['c1', { view: '70000' }],
  ];
  for (const [id, patch] of cases) {
    try { await h.actions.cityCopySave(id, patch); } catch { h.errors.push(new Error('local-refusal')); }
    assert.equal(h.errors.length, 1, JSON.stringify([id, patch]));
    h.errors.length = 0;
  }
  assert.equal(h.calls.length, base);
  // 空字串落在 null 欄位上不算變更。
  assert.equal(await h.actions.cityCopySave('c2', { prod: '' }), '據點沒有變更。');
  assert.equal(h.calls.length, base);
});

test('cityCopySave clears the validation ticket and surfaces server rejection', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.response(path => {
    if (path === `/api/games/${gameId}/copy/validate`) return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', problems: [], checkedAt: 't' };
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.validateCopy();
  assert.equal(h.model().copy.ticketReady, true);
  h.response(path => {
    if (path === `/api/games/${gameId}/copy` && h.calls.at(-1)?.body !== undefined) {
      const failure = new Error('名稱已被使用'); failure.status = 409; failure.code = 'COPY_CITY_NAME_TAKEN'; throw failure;
    }
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.cityCopySave('c1', { name: '長安2' });
  assert.equal(h.errors.length, 1);
  assert.equal(h.model().copy.ticketReady, true);
  assert.deepEqual(posts(h), [{ module: 'cities', patch: { rename: { c1: '長安2' } } }]);
});
