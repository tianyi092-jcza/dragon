// F3d 武将表读投影：ability/专长/原图/来源绑定 + copyBlockers 删除检查。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_copy_controller_generals.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const general = (over = {}) => ({ idx: 0, name: '丁', hao: '字', faction: 0, portrait: 3, portraitKey: 'p7', ability: { force: 90, lead: 80, politics: 70, siege: 15, field: 14, naval: 13 }, specialty_low_bits: '1a2', ...over });
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: {
    name: '第一章', start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
    generals: [general(), { idx: 127, name: '留', hao: '', faction: null }],
    cities: [{ idx: 0, name: '城甲', faction: 0, governor: null, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }],
  } } },
  cities: { c1: { name: '洛陽', max_prod: 1, prod: 1, growth: 1, defence: 1, troops: 1, type: 0, view: 0 } },
  sourceRecords: { bindings: { ch1: { slotMap: { 0: 'rec-1' } } } },
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
const loadOk = (h, data = copyData()) => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data }; throw new Error('unexpected api: ' + path); }); };

test('loadCopy projects general display fields and source binding', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const g = h.model().copy.page.attributes.chapters[0].generals[0];
  assert.deepEqual(g, { slot: 0, name: '丁', hao: '字', factionSlot: 0, reserved: false, portraitKey: 'p7', originalPortraitId: '3',
    ability: { force: 90, lead: 80, politics: 70, siege: 15, field: 14, naval: 13 }, specialtyLowBits: '1a2', suicideOnCapture: false, sourceRecordId: 'rec-1', posts: ['君主'] });
  const keep = h.model().copy.page.attributes.chapters[0].generals[1];
  assert.deepEqual([keep.originalPortraitId, keep.ability, keep.specialtyLowBits, keep.sourceRecordId], [null, null, null, null]);
  assert.equal(h.errors.length, 0);
});

test('loadCopy rejects malformed display fields without claiming success', async () => {
  const bads = [
    () => ({ generals: [{ ...general(), portrait: 256 }] }),
    () => ({ generals: [{ ...general(), ability: { force: 90, lead: 80, politics: 70, siege: 16, field: 0, naval: 0 } }] }),
    () => ({ generals: [{ ...general(), specialty_low_bits: 'xyz' }] }),
    () => ({ generals: [{ ...general(), idx: 127, name: '留', hao: '', faction: null }], bindings: { ch1: { slotMap: { 127: 'rec-x' } } } }),
    () => ({ generals: [general()], bindings: 'nope' }),
  ];
  for (const make of bads) {
    const h = harness(); await selectGame(h);
    const { generals, bindings } = make();
    const data = copyData({ sourceRecords: bindings === undefined ? { bindings: { ch1: { slotMap: { 0: 'rec-1' } } } } : { bindings } });
    data.chapters.ch1.state.generals = generals;
    loadOk(h, data);
    await h.actions.loadCopy();
    assert.equal(h.model().copy.page, null);
    assert.equal(h.errors.length, 1);
  }
});

test('copyBlockers lists same-slot rows without inventing references', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(await h.actions.copyBlockers('ch1', 0), true);
  const lines = h.model().message.split('\n');
  assert.ok(lines[0].startsWith('#0 不可刪除'));
  assert.ok(lines.includes('【第一章／ch1】丁：'));
  assert.ok(lines.includes('引用資料未提供，不能視為無引用。'));
  assert.equal(h.errors.length, 0);
});

test('copyBlockers guards: unloaded copy, unknown chapter or slot send nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  await assert.rejects(h.actions.copyBlockers('nope', 0), /已讀取的章節/);
  await assert.rejects(h.actions.copyBlockers('ch1', 5), /已讀取的武將槽/);
  assert.equal(h.calls.length, base);
  const h2 = harness(); await selectGame(h2);
  await assert.rejects(h2.actions.copyBlockers('ch1', 0), /副本/);
});
