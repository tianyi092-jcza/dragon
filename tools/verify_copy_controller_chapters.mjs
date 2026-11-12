// F3b 章節屬性頁：loadCopy 建 attributes 投影 + 七 op/setStart 走 chapters 模組。
// UI-controller checks only；傳輸/後端鑑權另測。
// 用法：node --test tools/verify_copy_controller_chapters.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const state = () => ({
  name: '第一章', start: { year: 184, month: 1, day: 1 },
  factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
  generals: [{ idx: 0, name: '丁', hao: '字', faction: 0 }, { idx: 1, name: '丙', hao: '', faction: 0 }, { idx: 2, name: '戊', hao: '', faction: 0 }, { idx: 127, name: '留', hao: '', faction: null }],
  cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }, { idx: 1, name: '城乙', faction: 0, governor: null, troops: 5, prod: 6, troops_cap: 60, max_prod: 30, growth: 1, defence: 2 }],
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

test('loadCopy builds the chapter attributes projection with posts', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const attrs = h.model().copy.page.attributes;
  assert.ok(attrs);
  assert.equal(attrs.known, true);
  assert.equal(attrs.chapters.length, 1);
  const ch = attrs.chapters[0];
  assert.equal(ch.startMissing, false);
  assert.equal(ch.startDirty, false);
  assert.deepEqual(ch.start, { era: 'ad', year: '184', month: '1', day: '1' });
  assert.deepEqual(ch.factions, [{ slot: 0, monarchSlot: 0, advisorSlot: null, diplomatSlot: 1, capital: 0 }]);
  assert.deepEqual(ch.generals.map(g => [g.slot, g.name, g.factionSlot, g.reserved, g.posts]), [[0, '丁', 0, false, ['君主']], [1, '丙', 0, false, ['外交官']], [2, '戊', 0, false, []], [127, '留', null, true, []]]);
  assert.deepEqual(ch.cities[0], { idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troopsCap: 100, maxProd: 50, growth: 3, defence: 4 });
  assert.equal(h.errors.length, 0);
});

test('loadCopy rejects malformed chapter attributes without claiming success', async () => {
  const bads = [
    () => { const s = state(); delete s.generals; return s; },
    () => { const s = state(); s.generals = [{ idx: 128, name: 'x', hao: '', faction: null }]; return s; },
    () => { const s = state(); s.cities = [{ idx: 0, name: 'x', faction: 256 }]; return s; },
    () => { const s = state(); s.factions = [{ idx: 0, money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0, monarch_idx: 128 }]; return s; },
  ];
  for (const make of bads) {
    const h = harness(); await selectGame(h);
    h.response(() => ({ gameId, copyDigest: DIGEST_A, data: copyData({ chapters: { ch1: { chapterId: 'ch1', state: make() } } }) }));
    await h.actions.loadCopy();
    assert.equal(h.model().copy.page, null);
    assert.equal(h.errors.length, 1);
  }
});

test('staged start input posts setStart, clears, and re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setCopyStartInput('ch1', 'year', '185');
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, true);
  assert.equal(h.model().copy.page.attributes.chapters[0].start.year, '185');
  assert.equal(h.model().copy.page.dirty, true);
  const sent = await h.actions.saveCopyChapterStart('ch1');
  assert.equal(sent, true);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { setStart: { ch1: { year: 185 } } } }]);
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  assert.equal(h.errors.length, 0);
});

test('cancelCopyStartInput and cancelCopyEdits drop staged start text', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setCopyStartInput('ch1', 'year', 'nope');
  h.actions.cancelCopyStartInput('ch1');
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  h.actions.setCopyStartInput('ch1', 'year', '186');
  assert.equal(h.controller.actions.cancelCopyEdits(), true);
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  assert.equal(h.errors.length, 0);
});

test('chapter edits post exact single-op bodies and re-read', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  await h.actions.copyCityFaction('ch1', 0, null);
  await h.actions.copyCapital('ch1', 0, 1);
  await h.actions.copyDiplomat('ch1', 0, null);
  await h.actions.copyGeneralFaction('ch1', 2, null);
  await h.actions.copyGovernor('ch1', 0, null);
  await h.actions.copyCityNumbers('ch1', 0, { troops: 11, prod: 21 });
  assert.deepEqual(posts(h), [
    { module: 'chapters', patch: { edits: [{ op: 'city-faction', chapterId: 'ch1', cityIdx: 0, factionId: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'set-capital', chapterId: 'ch1', factionIdx: 0, cityIdx: 1 }] } },
    { module: 'chapters', patch: { edits: [{ op: 'set-diplomat', chapterId: 'ch1', factionIdx: 0, generalIdx: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'general-faction', chapterId: 'ch1', generalIdx: 2, factionId: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'city-governor', chapterId: 'ch1', cityIdx: 0, generalIdx: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'city-native', chapterId: 'ch1', cityIdx: 0, values: { troops: 11, prod: 21 } }] } },
  ]);
  assert.equal(h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length, 7);
  assert.equal(h.errors.length, 0);
});

test('local guards reject without sending: posts, membership, caps of prompt', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  for (const call of [
    () => h.actions.copyGeneralFaction('ch1', 0, 1), // 君主未清空职务
    () => h.actions.copyGovernor('ch1', 0, 127), // 保留槽不能任太守
    () => h.actions.copyDiplomat('ch1', 0, 0), // 君主兼任外交官被拦
    () => h.actions.copyCityFaction('ch1', 0, 9), // 未宣告势力槽
    () => h.actions.copyCityNumbers('ch1', 0, { troops: -1 }),
    () => h.actions.copyCityNumbers('ch1', 0, { bogus: 1 }),
  ]) await assert.rejects(call(), /.*/);
  assert.equal(h.calls.length, base);
  assert.equal(h.model().copy.page.attributes.chapters[0].cities[0].faction, 0);
  // 无变更短路：同值不送。
  assert.equal(await h.actions.copyCityFaction('ch1', 0, 0), false);
  assert.equal(await h.actions.copyGovernor('ch1', 0, 1), false);
  assert.equal(h.calls.length, base);
});
