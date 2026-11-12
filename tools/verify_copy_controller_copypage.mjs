// F2 副本页：loadCopy 读投影 + 按模块存 + 章节结构 op（加法，不碰 draft 旧路）。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_copy_controller_copypage.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64), DIGEST_B = 'b'.repeat(64);
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', sourceChapterId: 's1', state: {
    name: '第一章', start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }, { idx: 1, money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0, monarch_idx: null, advisor_idx: null, diplomat_idx: null, capital: null }],
    generals: [{ idx: 0, name: '丁', hao: '字', faction: 0 }, { idx: 1, name: '丙', hao: '', faction: 0 }, { idx: 127, name: '留', hao: '', faction: null }],
    cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }],
  } } },
  cities: { c1: { name: '洛陽', max_prod: 100, prod: 50, growth: 1, defence: 2, troops: 3, type: 0, view: 1 } },
  ...over,
});

function harness({ promptReply = null, confirmReply = true } = {}) {
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
    confirm: () => confirmReply, prompt: () => promptReply,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };
const loadOk = h => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: '2026-01-02T03:04:05.000Z', data: copyData() }; throw new Error('unexpected api: ' + path); }); };

test('loadCopy builds the copy page projection and stores the digest', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const page = h.model().copy.page;
  assert.ok(page);
  assert.equal(h.model().fields.name, '測名');
  assert.equal(page.chapters.length, 1);
  assert.equal(page.chapters[0].name, '第一章');
  assert.deepEqual(page.chapters[0].startDate, { year: 184, month: 1, day: 1, era: null });
  assert.equal(page.chapters[0].gaps, null);
  assert.deepEqual(page.resources[0].factions[0].inputs, { money: '100', reserve_cav: '1', reserve_arc: '2', reserve_inf: '3' });
  assert.equal(h.model().copy.digest, DIGEST_A);
  assert.equal(h.errors.length, 0);
});

test('loadCopy rejects malformed reads without claiming success', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: 'not-hex', data: copyData() }));
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page, null);
  assert.match(h.errors[0].message, /副本讀取回應無效/);
  assert.equal(h.errors.length, 1);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data: { metadata: { name: 'x' }, chapterOrder: [], chapters: {} } }));
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page, null);
  assert.equal(h.errors.length, 2);
});

test('saveCopyPage posts only changed modules in order, then re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const gets = () => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length;
  const posts = () => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).map(c => c.body);
  const base = h.calls.length;
  await h.actions.saveCopyPage();
  assert.equal(h.calls.length, base);
  assert.match(h.model().message, /沒有保存/);
  h.actions.setCopyField('name', '新名');
  h.actions.setCopyResource('ch1', 0, 'money', '101');
  await h.actions.saveCopyPage();
  assert.deepEqual(posts(), [{ module: 'metadata', patch: { name: '新名' } }, { module: 'chapters', patch: { resources: { ch1: { 0: { money: 101 } } } } }]);
  assert.equal(gets(), 2);
  const page = h.model().copy.page;
  assert.equal(page.dirty, false);
  assert.equal(page.resources[0].factions[0].inputs.money, '100');
  assert.equal(h.errors.length, 0);
});

test('copyChapter posts copy/delete/rename shapes and re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  await h.actions.copyChapter('copy', 'ch1');
  await h.actions.copyChapter('delete', 'ch1');
  const posts = () => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).map(c => c.body);
  assert.deepEqual(posts(), [{ module: 'chapters', patch: { copy: { chapterId: 'ch1' } } }, { module: 'chapters', patch: { delete: { chapterId: 'ch1' } } }]);
  const h2 = harness({ promptReply: '新章' }); await selectGame(h2); loadOk(h2);
  await h2.actions.loadCopy();
  await h2.actions.copyChapter('rename', 'ch1');
  const last = h2.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).at(-1).body;
  assert.deepEqual(last, { module: 'chapters', patch: { rename: { ch1: '新章' } } });
  assert.equal(h.errors.length + h2.errors.length, 0);
});

test('createCopyChapter posts name+start and clears the form', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setChapterCreateField('name', '新章');
  h.actions.setChapterCreateField('year', '185');
  h.actions.setChapterCreateField('month', '2');
  h.actions.setChapterCreateField('day', '3');
  await h.actions.createCopyChapter();
  const last = h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).at(-1).body;
  assert.deepEqual(last, { module: 'chapters', patch: { create: { name: '新章', start: { era: 'ad', year: 185, month: 2, day: 3 } } } });
  assert.equal(h.model().copy.page.create.name, '');
  assert.equal(h.errors.length, 0);
});

test('ticket survives same-digest reload, dies on save', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.response(path => {
    if (path === `/api/games/${gameId}/copy/validate`) return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', problems: [], checkedAt: '2026-01-02T03:04:05.000Z' };
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.validateCopy();
  assert.equal(h.model().copy.ticketReady, true);
  await h.actions.loadCopy();
  assert.equal(h.model().copy.ticketReady, true);
  h.actions.setCopyField('name', '改名');
  h.response(path => {
    if (path === `/api/games/${gameId}/copy` && h.calls.at(-1)?.body === undefined) return { gameId, copyDigest: DIGEST_B, updatedAt: null, data: copyData({ metadata: { name: '改名', introduction: '介' } }) };
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_B, updatedAt: null };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.saveCopyPage();
  assert.equal(h.model().copy.ticketReady, false);
  assert.equal(h.model().copy.validation, null);
  assert.equal(h.errors.length, 0);
});

test('cancelCopyEdits restores fields and clears staged inputs', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setCopyField('name', '暫改');
  h.actions.setCopyResource('ch1', 1, 'money', '5');
  assert.equal(h.controller.actions.cancelCopyEdits(), true);
  assert.equal(h.model().fields.name, '測名');
  assert.equal(h.model().copy.page.dirty, false);
  assert.equal(h.model().copy.page.resources[0].factions[1].inputs.money, '0');
  assert.equal(h.errors.length, 0);
});

test('loadCopy ensures a missing copy once, then reads', async () => {
  const h = harness(); await selectGame(h);
  let reads = 0;
  const missing = Object.assign(new Error('无副本'), { status: 404, code: 'COPY_NOT_FOUND' });
  h.response(path => {
    if (path === `/api/games/${gameId}/copy`) {
      reads++;
      if (reads === 1) throw missing;
      return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    }
    if (path === `/api/games/${gameId}/copy/ensure`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.chapters.length, 1);
  const ensureCalls = h.calls.filter(c => c.path === `/api/games/${gameId}/copy/ensure`);
  assert.equal(ensureCalls.length, 1);
  assert.deepEqual(ensureCalls[0].body, {});
  assert.equal(h.errors.length, 0);
});
