// F3c 武将任职（改名/头像/君主/军师/继任/解散）：逐命令走 chapters.edits，成功后重读。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_copy_controller_posts.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const money = { money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3 };
const state = () => ({
  name: '第一章', start: { year: 184, month: 1, day: 1 },
  factions: [
    { idx: 0, ...money, monarch_idx: 0, advisor_idx: 1, diplomat_idx: null, capital: 0 },
    { idx: 1, ...money, monarch_idx: 3, advisor_idx: null, diplomat_idx: null, capital: 1 },
  ],
  generals: [
    { idx: 0, name: '君', hao: '', faction: 0 },
    { idx: 1, name: '師', hao: '', faction: 0 },
    { idx: 2, name: '丁', hao: '', faction: 1 },
    { idx: 3, name: '主', hao: '', faction: 1 },
    { idx: 4, name: '野', hao: '', faction: null, portraitKey: 'p1' },
    { idx: 5, name: '孤', hao: '', faction: null },
    { idx: 6, name: '替', hao: '', faction: null },
    { idx: 127, name: '留', hao: '', faction: null },
  ],
  cities: [{ idx: 0, name: '城甲', faction: 0, governor: null, troops: 1, prod: 1, troops_cap: 1, max_prod: 1, growth: 1, defence: 1 }],
});
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: state() } },
  cities: { c1: { name: '洛陽', max_prod: 1, prod: 1, growth: 1, defence: 1, troops: 1, type: 0, view: 0 } },
  ...over,
});

function harness({ confirmReply = true } = {}) {
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
    confirm: () => confirmReply, prompt: () => null,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };
const loadOk = h => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() }; throw new Error('unexpected api: ' + path); }); };
const posts = h => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).map(c => c.body);

test('projection carries portraitKey for the toggle', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const generals = h.model().copy.page.attributes.chapters[0].generals;
  assert.equal(generals.find(g => g.slot === 4).portraitKey, 'p1');
  assert.equal(generals.find(g => g.slot === 5).portraitKey, null);
  assert.equal(h.errors.length, 0);
});

test('rename-general posts exact body and re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyRenameGeneral('ch1', 2, { name: '改丁', hao: '字丁' }), true);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { edits: [{ op: 'rename-general', chapterId: 'ch1', generalIdx: 2, values: { name: '改丁', hao: '字丁' } }] } }]);
  assert.equal(h.errors.length, 0);
});

test('portrait set/clear post exact bodies; same value sends nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyGeneralPortrait('ch1', 5, 'p2'), true);
  assert.equal(await h.actions.copyGeneralPortrait('ch1', 4, null), true);
  assert.deepEqual(posts(h), [
    { module: 'chapters', patch: { edits: [{ op: 'portrait', chapterId: 'ch1', generalIdx: 5, portraitKey: 'p2' }] } },
    { module: 'chapters', patch: { edits: [{ op: 'portrait', chapterId: 'ch1', generalIdx: 4, portraitKey: null }] } },
  ]);
  const base = h.calls.length;
  assert.equal(await h.actions.copyGeneralPortrait('ch1', 4, 'p1'), false);
  assert.equal(await h.actions.copyGeneralPortrait('ch1', 5, null), false);
  assert.equal(h.calls.length, base);
  assert.equal(h.errors.length, 0);
});

test('strategist assign/clear post exact bodies; reserved slot rejected', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyStrategist('ch1', 1, 2), true);
  assert.equal(await h.actions.copyClearStrategist('ch1', 0), true);
  assert.deepEqual(posts(h), [
    { module: 'chapters', patch: { edits: [{ op: 'set-strategist', chapterId: 'ch1', factionIdx: 1, generalIdx: 2 }] } },
    { module: 'chapters', patch: { edits: [{ op: 'set-strategist', chapterId: 'ch1', factionIdx: 0, generalIdx: null }] } },
  ]);
  const base = h.calls.length;
  await assert.rejects(h.actions.copyStrategist('ch1', 1, 127), /0至126/);
  await assert.rejects(h.actions.copyStrategist('ch1', 9, 2), /已宣告的勢力槽/);
  assert.equal(h.calls.length, base);
  assert.equal(h.errors.length, 0);
});

test('monarch assign and succession post exact bodies', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyMonarch('ch1', 1, 5), true);
  assert.equal(await h.actions.copySucceedMonarch('ch1', 0, 6), true);
  assert.deepEqual(posts(h), [
    { module: 'chapters', patch: { edits: [{ op: 'set-monarch', chapterId: 'ch1', factionIdx: 1, generalIdx: 5 }] } },
    { module: 'chapters', patch: { edits: [{ op: 'remove-monarch', chapterId: 'ch1', factionIdx: 0, resolution: { successor: 6 } }] } },
  ]);
  assert.equal(h.errors.length, 0);
});

test('disband posts confirm:true; declined confirm sends nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyDisbandFaction('ch1', 1), true);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { edits: [{ op: 'disband-faction', chapterId: 'ch1', factionIdx: 1, confirm: true }] } }]);
  const h2 = harness({ confirmReply: false }); await selectGame(h2); loadOk(h2);
  await h2.actions.loadCopy();
  assert.equal(await h2.actions.copyDisbandFaction('ch1', 1), false);
  assert.deepEqual(h2.calls.filter(c => c.body !== undefined), []);
  assert.equal(h.errors.length + h2.errors.length, 0);
});

test('local guards reject without sending', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  for (const call of [
    () => h.actions.copyRenameGeneral('ch1', 2, { name: 'x', bogus: 1 }),
    () => h.actions.copyRenameGeneral('ch1', 99, { name: 'x' }),
    () => h.actions.copyGeneralPortrait('ch1', 2, 123),
    () => h.actions.copyDisbandFaction('ch1', 9),
  ]) await assert.rejects(call(), /.*/);
  assert.equal(await h.actions.copyClearStrategist('ch1', 1), false);
  assert.equal(h.calls.length, base);
});
