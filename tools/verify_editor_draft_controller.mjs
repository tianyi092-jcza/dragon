// UI-controller checks only. Transport/backend authorization are tested separately.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createFixedTileWindowRows } from '../web/src/content/authoring/tilepixels.js';
const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const game = (id = gameId) => ({ gameId: id, draftRevision: '1', metadata: { name: '<img>', introduction: '原稿' } });
const receipt = (revision = '1') => ({ ...game(), draftRevision: revision, profileRevision: 'fixed-copy-resources-1', chapters: [{ chapterId: 'chapter#1', name: '<章>', gaps: { saveGaps: 0, activeGaps: 2 }, factions: [{ slot: 0, money: 100, reserve_cav: 2, reserve_arc: 3, reserve_inf: 4 }] }] });
function harness({ stored, openTrial, gameContext, digestPixels, getMapWindowCanvas, hasLocalMapInputs } = {}) {
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'never-project' }, busy = false, model, response = null;
  const calls = [], errors = [], records = stored ?? new Map();
  const h = { calls, errors, records, confirmations: [], confirmValue: true, promptValue: null, response: handler => { response = handler; }, model: () => model };
  const controller = installDraftEditor({
    api: async (path, body, options) => { calls.push({ path, body, options }); if (response) return response(path, body, options); if (path === '/api/games') return { games: [game(), game(otherId)] }; return receipt(); },
    authority: () => identity, isBusy: () => busy, publish: value => { model = value; }, gameContext, digestPixels, getMapWindowCanvas, hasLocalMapInputs,
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) },
    confirm: message => { h.confirmations.push(message); return typeof h.confirmValue === 'function' ? h.confirmValue() : h.confirmValue; }, prompt: () => typeof h.promptValue === 'function' ? h.promptValue() : h.promptValue, openTrial,
  });
  controller.setIdentity(identity);
  Object.assign(h, { controller, actions: controller.actions, identity: next => { identity = next; controller.setIdentity(next); }, current: () => identity, busy: value => { busy = value; } });
  h.load = async () => { await h.actions.refresh(); await h.actions.load(); };
  return h;
}
test('chapter start dates are read-only detached values; unknown stays unknown and malformed DTOs are atomic', async () => {
  const h = harness(); await h.load();
  assert.equal(h.model().chapters[0].startDate, null);
  const data = receipt(); data.chapters[0].startDate = { year: 264, month: 2, day: 3 };
  h.response(() => data); await h.actions.load();
  assert.deepEqual(h.model().chapters[0].startDate, { year: 264, month: 2, day: 3 });
  // §7 era label: unlabelled chapters read as null, an explicit label travels
  // with the pinned year, and any other value refuses the whole read.
  for (const era of [null, 'ad', 'bc']) {
    const labelled = receipt('2'); labelled.chapters[0].startDate = { era, year: 264, month: 2, day: 3 };
    h.actions.setField('revision', '2'); h.response(() => labelled); await h.actions.load();
    assert.deepEqual(h.model().chapters[0].startDate, { era, year: 264, month: 2, day: 3 });
    h.actions.setField('revision', '1'); h.response(() => receipt()); await h.actions.load();
    h.response(() => data); await h.actions.load();
  }
  data.chapters[0].startDate.year = 999;
  h.model().chapters[0].startDate.month = 99; h.controller.render();
  assert.deepEqual(h.model().chapters[0].startDate, { year: 264, month: 2, day: 3 });
  for (const startDate of [[], '264', {}, { year: 264, month: 2 }, { year: 264, month: 2, day: '3' }, { year: -0, month: 2, day: 3 }, { year: 264.5, month: 2, day: 3 }, { year: 264, month: 2, day: 3, extra: 1 }, { era: 'xx', year: 264, month: 2, day: 3 }]) {
    const invalid = receipt('2'); invalid.chapters[0].startDate = startDate;
    h.actions.setField('revision', '2'); h.response(() => invalid); await h.actions.load();
    assert.match(h.errors.at(-1).message, /開局日期/);
    assert.equal(h.model().context.draftRevision, '1');
    assert.deepEqual(h.model().chapters[0].startDate, { year: 264, month: 2, day: 3 });
  }
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.save();
  assert.deepEqual(h.calls.at(-1).body, { metadata: game().metadata, resourceEdits: [] });
  h.identity(null); assert.deepEqual(h.model().chapters, []);
});
test('native general portrait binds or clears only its saved-revision field and preserves other dirty inputs', async () => {
  for (const portraitKey of ['p3', null]) {
    const h = harness(); await h.load();
    h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
    h.actions.setResource('chapter#1', 0, 'money', '101');
    const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 0, portraitKey };
    const count = h.calls.length; h.confirmValue = false; await h.actions.portraitNativeGeneral(request);
    assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
    h.confirmValue = true; h.response(() => ({ ...game(), draftRevision: '2' }));
    await h.actions.portraitNativeGeneral(request);
    assert.deepEqual(h.calls.at(-1).body, { metadata: game().metadata, resourceEdits: [], chapterEdits: [{ op: 'portrait', chapterId: 'chapter#1', generalIdx: 0, portraitKey }] });
    assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.calls.length, count + 1);
    assert.equal(h.model().context.verified, false); assert.equal(h.records.size, 0);
    assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '101');
    await h.actions.portraitNativeGeneral({ ...request, draftRevision: '2' }); assert.equal(h.calls.length, count + 1);
  }
});
test('native general portrait unknown response shares the sole journal and retains the original key and binding', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 3, portraitKey: 'p3' };
  h.response(() => { throw new Error('owned lost response'); }); await h.actions.portraitNativeGeneral(request);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  assert.equal(h.records.size, 1);
  await h.actions.portraitNativeGeneral(request); await h.actions.save(); await h.actions.retry();
  await h.actions.renameNativeGeneral({ gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 3, values: { name: '其它' } });
  assert.equal(h.calls.length, count);
  const reloaded = harness({ stored: new Map(h.records) });
  await reloaded.actions.retry(); assert.equal(reloaded.calls.length, 0);
  reloaded.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } }));
  await reloaded.actions.query(); assert.equal(reloaded.calls.length, 1);
  assert.ok(reloaded.calls[0].path.endsWith('/' + sent.options.key));
  assert.equal(reloaded.records.size, 0); assert.equal(reloaded.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_FAILURE' }));
  await h.actions.query(); request.portraitKey = null; h.actions.setField('revision', '999');
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1), sent); assert.equal(h.records.size, 0);
});
test('native general portrait rejects absent or malformed IDs and rechecks confirmation and durable key', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 0, portraitKey: 'p3' };
  const count = h.calls.length;
  for (const portraitKey of [undefined, '', 'p3\n', 'p3\r\n', '../p3', 'https://example.test/p3', 'a'.repeat(33), 3, {}, []]) await h.actions.portraitNativeGeneral({ ...request, portraitKey });
  for (const change of [{ gameId: otherId }, { draftRevision: '2' }, { chapterId: 'missing' }, { generalIdx: 128 }, { generalIdx: -0 }]) await h.actions.portraitNativeGeneral({ ...request, ...change });
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0); assert.equal(h.confirmations.length, 0);
  h.confirmValue = () => { request.portraitKey = null; return true; }; await h.actions.portraitNativeGeneral(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = () => { h.current().version = 'changed'; return true; }; await h.actions.portraitNativeGeneral(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  const blocked = harness(); await blocked.load(); const before = blocked.calls.length;
  blocked.records.set = () => { throw new Error('owned storage denied'); };
  await blocked.actions.portraitNativeGeneral(request);
  assert.equal(blocked.calls.length, before); assert.equal(blocked.records.size, 0);
  assert.match(blocked.errors.at(-1).message, /無法保留原操作鍵/);
});
test('native general rename saves only explicit text at the read revision and preserves other dirty inputs', async () => {
  const h = harness(); await h.load();
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  h.actions.setResource('chapter#1', 0, 'money', '101');
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 0, values: { name: '新名', hao: '' } };
  const count = h.calls.length; h.confirmValue = false; await h.actions.renameNativeGeneral(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => ({ ...game(), draftRevision: '2' }));
  await h.actions.renameNativeGeneral(request);
  assert.deepEqual(h.calls.at(-1).body, { metadata: game().metadata, resourceEdits: [], chapterEdits: [{ op: 'rename-general', chapterId: 'chapter#1', generalIdx: 0, values: { name: '新名', hao: '' } }] });
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.calls.length, count + 1);
  assert.equal(h.model().context.verified, false); assert.equal(h.records.size, 0);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '101');
  await h.actions.renameNativeGeneral({ ...request, draftRevision: '2' }); assert.equal(h.calls.length, count + 1);
});
test('native general rename shares the sole unknown journal and retries only its original text and key', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 3, values: { hao: '新字' } };
  h.response(() => { throw new Error('owned lost response'); }); await h.actions.renameNativeGeneral(request);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  assert.equal(h.records.size, 1);
  await h.actions.renameNativeGeneral(request); await h.actions.save(); await h.actions.retry();
  await h.actions.cityNative({ gameId, draftRevision: '1', chapterId: 'chapter#1', cityIdx: 0, values: { troops: 3 } });
  assert.equal(h.calls.length, count);
  const reloaded = harness({ stored: new Map(h.records) });
  await reloaded.actions.retry(); assert.equal(reloaded.calls.length, 0);
  reloaded.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } }));
  await reloaded.actions.query(); assert.equal(reloaded.calls.length, 1);
  assert.ok(reloaded.calls[0].path.endsWith('/' + sent.options.key));
  assert.equal(reloaded.records.size, 0); assert.equal(reloaded.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_FAILURE' }));
  await h.actions.query(); request.values.hao = '後改'; h.actions.setField('revision', '999');
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1), sent); assert.equal(h.records.size, 0);
});
test('native general rename validates its boundary and rechecks confirmation and key persistence', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', generalIdx: 0, values: { name: '新名' } };
  const count = h.calls.length;
  for (const change of [{ gameId: otherId }, { draftRevision: '2' }, { chapterId: 'missing' }, { generalIdx: 128 }, { generalIdx: -0 }, { generalIdx: 0.5 }, { values: {} }, { values: [] }, { values: { portraitKey: null } }, { values: { name: null } }]) await h.actions.renameNativeGeneral({ ...request, ...change });
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0); assert.equal(h.confirmations.length, 0);
  h.confirmValue = () => { request.values.name = '確認後更動'; return true; }; await h.actions.renameNativeGeneral(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = () => { h.current().version = 'changed'; return true; }; await h.actions.renameNativeGeneral(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  const blocked = harness(); await blocked.load(); const before = blocked.calls.length;
  blocked.records.set = () => { throw new Error('owned storage denied'); };
  await blocked.actions.renameNativeGeneral(request);
  assert.equal(blocked.calls.length, before); assert.equal(blocked.records.size, 0);
  assert.match(blocked.errors.at(-1).message, /無法保留原操作鍵/);
});
test('native city inputs belong to exact reads and save only the chosen row through the shared journal', async () => {
  const h = harness(); await h.load();
  assert.equal(h.model().nativeCities.known, false);
  const dto = receipt();
  dto.chapters[0].cities = [{ idx: 0, name: '甲', troops: 1, prod: 10, troopsCap: 3, maxProd: 20 }, { idx: 1, name: '乙', troops: 2, prod: 5, troopsCap: 4, maxProd: null }];
  h.response(() => dto); await h.actions.load();
  const beforeEquivalent = h.calls.length;
  h.actions.setNativeCityInput('chapter#1', 0, 'prod', '10.0'); await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, beforeEquivalent); assert.equal(h.model().context.dirty, false);
  assert.equal(h.model().nativeCities.chapters[0].cities[0].inputs.prod, '10');
  h.actions.setNativeCityInput('chapter#1', 0, 'prod', '12');
  h.actions.setNativeCityInput('chapter#1', 1, 'troops', '3');
  assert.equal(h.model().context.dirty, true);
  h.confirmValue = false; assert.equal(h.controller.canLeave(), false);
  const before = h.calls.length; await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, before);
  h.actions.cancelNativeCityInputs('chapter#1', 0);
  assert.equal(h.model().nativeCities.chapters[0].cities[0].inputs.prod, '10');
  assert.equal(h.model().nativeCities.chapters[0].cities[1].inputs.troops, '3');
  h.actions.setNativeCityInput('chapter#1', 0, 'prod', '21');
  h.confirmValue = true; await h.actions.saveNativeCityInputs('chapter#1', 0); assert.equal(h.calls.length, before);
  h.actions.setNativeCityInput('chapter#1', 0, 'prod', '12');
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.calls.at(-1).options.revision, '1');
  assert.deepEqual(h.calls.at(-1).body, { metadata: game().metadata, resourceEdits: [], chapterEdits: [{ op: 'city-native', chapterId: 'chapter#1', cityIdx: 0, values: { prod: 12 } }] });
  assert.equal(h.model().nativeCities.locked, true); assert.equal(h.model().nativeCities.draftRevision, '1');
  assert.equal(h.model().nativeCities.chapters[0].cities[0].dirty, false);
  assert.equal(h.model().nativeCities.chapters[0].cities[1].inputs.troops, '3');
  assert.equal(h.model().fields.name, '未保存');
});
test('city ownership and governor projections preserve zero, reserved bytes and unknowns without granting edits', async () => {
  const h = harness(); await h.load(); const dto = receipt();
  dto.chapters[0].cities = [0, 24, 127, 255, null, undefined].map((value, idx) => ({ idx, name: String(idx), troops: 1, prod: 2, troopsCap: 3, maxProd: 4, ...(value === undefined ? {} : { faction: value, governor: value }) }));
  h.response(() => dto); await h.actions.load();
  assert.deepEqual(h.model().nativeCities.chapters[0].cities.map(row => [row.faction, row.governor]), [[0,0],[24,24],[127,127],[255,255],[null,null],[null,null]]);
  const count = h.calls.length;
  for (const key of ['faction', 'governor']) h.actions.setNativeCityInput('chapter#1', 0, key, '1');
  await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, count); assert.equal(h.model().context.dirty, false);
  h.model().nativeCities.chapters[0].cities[0].governor = 2;
  h.actions.setField('revision', '999'); assert.equal(h.model().nativeCities.chapters[0].cities[0].governor, 0);
  const generation = h.model().context.readGeneration;
  for (const key of ['faction', 'governor']) for (const value of [-1, -0, 256, 1.5, '0', NaN, Infinity, {}]) {
    const bad = structuredClone(dto); bad.chapters[0].cities[0][key] = value;
    h.response(() => bad); await h.actions.load();
    assert.equal(h.model().context.readGeneration, generation);
    assert.deepEqual([h.model().nativeCities.chapters[0].cities[0].faction, h.model().nativeCities.chapters[0].cities[0].governor], [0, 0]);
  }
});
test('city type codes are read-only, preserve unknowns and reject malformed projections atomically', async () => {
  const h = harness(); await h.load(); const dto = receipt();
  dto.chapters[0].cities = [0, 4, 15, null, undefined].map((value, idx) => ({ idx, name: String(idx), troops: 1, prod: 2, troopsCap: 3, maxProd: 4, ...(value === undefined ? {} : { typeCode: value }) }));
  h.response(() => dto); await h.actions.load();
  assert.deepEqual(h.model().nativeCities.chapters[0].cities.map(row => row.typeCode), [0, 4, 15, null, null]);
  const before = h.calls.length;
  h.actions.setNativeCityInput('chapter#1', 0, 'typeCode', '4'); await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, before); assert.equal(h.model().context.dirty, false);
  h.model().nativeCities.chapters[0].cities[0].typeCode = 4;
  h.actions.setField('revision', '999'); assert.equal(h.model().nativeCities.chapters[0].cities[0].typeCode, 0);
  const generation = h.model().context.readGeneration;
  for (const value of [-1, -0, 16, 1.5, '4', NaN, Infinity, {}]) {
    const bad = structuredClone(dto); bad.chapters[0].cities[0].typeCode = value;
    h.response(() => bad); await h.actions.load();
    assert.equal(h.model().context.readGeneration, generation);
    assert.equal(h.model().nativeCities.chapters[0].cities[0].typeCode, 0);
  }
});
test('city condition projection preserves byte values and unknowns without opening inputs', async () => {
  const h = harness(); await h.load(); const dto = receipt();
  dto.chapters[0].cities = [0, 100, 255, null, undefined].map((value, idx) => ({ idx, name: String(idx), troops: 1, prod: 2, troopsCap: 3, maxProd: 4, ...(value === undefined ? {} : { growth: value, defence: value }) }));
  h.response(() => dto); await h.actions.load();
  assert.deepEqual(h.model().nativeCities.chapters[0].cities.map(row => [row.growth, row.defence]), [[0,0],[100,100],[255,255],[null,null],[null,null]]);
  const count = h.calls.length;
  for (const key of ['growth', 'defence']) h.actions.setNativeCityInput('chapter#1', 0, key, '150');
  await h.actions.saveNativeCityInputs('chapter#1', 0);
  assert.equal(h.calls.length, count); assert.equal(h.model().context.dirty, false); assert.equal(h.records.size, 0);
  h.model().nativeCities.chapters[0].cities[0].growth = 200;
  h.actions.setField('revision', '999'); assert.equal(h.model().nativeCities.chapters[0].cities[0].growth, 0);
});
test('bad condition DTO preserves the exact prior read and unsaved city inputs', async () => {
  const h = harness(); await h.load(); const dto = receipt();
  dto.chapters[0].cities = [{ idx: 0, name: '甲', troops: 1, prod: 2, troopsCap: 3, maxProd: 4, growth: 100, defence: 0 }];
  h.response(() => dto); await h.actions.load(); h.actions.setNativeCityInput('chapter#1', 0, 'prod', '3');
  const generation = h.model().context.readGeneration;
  for (const key of ['growth', 'defence']) for (const value of [-1, -0, 256, 1.5, '100', NaN, Infinity, {}]) {
    const bad = structuredClone(dto); bad.chapters[0].cities[0][key] = value;
    h.response(() => bad); await h.actions.load();
    assert.equal(h.model().context.readGeneration, generation);
    const city = h.model().nativeCities.chapters[0].cities[0];
    assert.equal(city.growth, 100); assert.equal(city.defence, 0); assert.equal(city.inputs.prod, '3');
  }
});
test('native city projection rejects malformed rows atomically and clears inputs only after a successful exact read', async () => {
  const h = harness(); await h.load(); const dto = receipt();
  dto.chapters[0].cities = [{ idx: 0, name: '<甲>', troops: 1, prod: 2, troopsCap: 3, maxProd: 4 }];
  h.response(() => dto); await h.actions.load(); h.actions.setNativeCityInput('chapter#1', 0, 'prod', '3');
  const generation = h.model().context.readGeneration;
  for (const cities of [null, [{ ...dto.chapters[0].cities[0], idx: 192 }], [dto.chapters[0].cities[0], dto.chapters[0].cities[0]], [{ ...dto.chapters[0].cities[0], prod: '2' }]]) {
    h.response(() => ({ ...dto, chapters: [{ ...dto.chapters[0], cities }] })); await h.actions.load();
    assert.equal(h.model().context.readGeneration, generation);
    assert.equal(h.model().nativeCities.chapters[0].cities[0].inputs.prod, '3');
  }
  h.response(() => dto); await h.actions.load();
  assert.equal(h.model().context.readGeneration, generation + 1);
  assert.equal(h.model().nativeCities.chapters[0].cities[0].inputs.prod, '2');
  h.identity(null); assert.equal(h.model().nativeCities.known, false); assert.deepEqual(h.model().nativeCities.chapters, []);
});
test('native city command uses saved metadata and exact shared revision without clearing other dirty forms', async () => {
  const h = harness(); await h.load();
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  h.actions.setResource('chapter#1', 0, 'money', '101');
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', cityIdx: 0, values: { prod: 12 } };
  const count = h.calls.length; h.confirmValue = false; await h.actions.cityNative(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => ({ ...game(), draftRevision: '2' }));
  await h.actions.cityNative(request);
  assert.deepEqual(h.calls.at(-1).body, { metadata: game().metadata, resourceEdits: [], chapterEdits: [{ op: 'city-native', chapterId: 'chapter#1', cityIdx: 0, values: { prod: 12 } }] });
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.calls.length, count + 1);
  assert.equal(h.records.size, 0); assert.equal(h.model().context.verified, false);
  assert.equal(h.model().fields.revision, '2'); assert.equal(h.model().fields.name, '未保存');
  assert.equal(h.model().resources[0].factions[0].inputs.money, '101');
  await h.actions.cityNative({ ...request, draftRevision: '2' });
  assert.equal(h.calls.length, count + 1); // Receipt alone is not a verified read.
});
test('native city unknown response owns the sole journal and retains exact body for retry, never reconstructs after reload', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', cityIdx: 0, values: { troops: 3 } };
  h.response(() => { throw new Error('owned lost response'); }); await h.actions.cityNative(request);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  assert.equal(h.records.size, 1);
  await h.actions.cityNative(request); await h.actions.save(); await h.actions.retry();
  assert.equal(h.calls.length, count);
  const reloaded = harness({ stored: new Map(h.records) });
  await reloaded.actions.retry(); assert.equal(reloaded.calls.length, 0);
  reloaded.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } }));
  await reloaded.actions.query(); assert.equal(reloaded.calls.length, 1);
  assert.ok(reloaded.calls[0].path.endsWith('/' + sent.options.key));
  assert.equal(reloaded.records.size, 0); assert.equal(reloaded.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_FAILURE' }));
  await h.actions.query(); request.values.troops = 99; h.actions.setField('revision', '999');
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1), sent); assert.equal(h.records.size, 0);
});
test('native city rejects mismatched identity and invalid fields before reserving or sending, and rechecks confirmation', async () => {
  const h = harness(); await h.load();
  const request = { gameId, draftRevision: '1', chapterId: 'chapter#1', cityIdx: 0, values: { prod: 12 } };
  const count = h.calls.length;
  for (const change of [{ gameId: otherId }, { draftRevision: '2' }, { chapterId: 'missing' }, { cityIdx: 192 }, { cityIdx: -0 }, { values: {} }, { values: { defence: 1 } }, { values: { prod: -0 } }, { values: { prod: 1.5 } }]) await h.actions.cityNative({ ...request, ...change });
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0); assert.equal(h.confirmations.length, 0);
  h.confirmValue = () => { request.values.prod = 13; return true; }; await h.actions.cityNative(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = () => { h.current().version = 'changed'; return true; }; await h.actions.cityNative(request);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  const blocked = harness(); await blocked.load(); const before = blocked.calls.length;
  blocked.records.set = () => { throw new Error('owned storage denied'); };
  await blocked.actions.cityNative(request);
  assert.equal(blocked.calls.length, before); assert.equal(blocked.records.size, 0);
  assert.match(blocked.errors.at(-1).message, /無法保留原操作鍵/);
});
test('cancel metadata and all resource inputs locally without reading, saving or forgetting operations', async () => {
  let mapPending = false;
  const h = harness({ hasLocalMapInputs: () => mapPending }); await h.load(); mapPending = true;
  assert.equal(h.model().cancelLocked, true); assert.equal(h.actions.cancelEdits(), false);
  assert.equal(h.confirmations.length, 0);
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存'); h.actions.setField('introduction', '修改');
  h.actions.setResource('chapter#1', 0, 'money', ''); h.actions.setResource('chapter#1', 0, 'reserve_inf', '99');
  const before = structuredClone(h.model()), count = h.calls.length;
  h.confirmValue = false; assert.equal(h.actions.cancelEdits(), false); assert.deepEqual(h.model(), before);
  h.confirmValue = true; assert.equal(h.actions.cancelEdits(), true);
  assert.equal(h.model().fields.name, '<img>'); assert.equal(h.model().fields.introduction, '原稿');
  assert.equal(h.model().fields.revision, '999'); assert.equal(h.model().fields.chapterId, 'chapter#1');
  assert.deepEqual(h.model().resources[0].factions[0].inputs, { money: '100', reserve_cav: '2', reserve_arc: '3', reserve_inf: '4' });
  assert.equal(h.model().context.readGeneration, before.context.readGeneration); assert.equal(h.model().context.dirty, false);
  assert.equal(h.controller.canLeave(true), false); // The separate map preparation remains pending.
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0); assert.equal(h.model().cancelLocked, true);
  h.actions.setField('name', '保留'); h.confirmValue = () => { h.current().version = 'changed'; return true; };
  assert.equal(h.actions.cancelEdits(), false); assert.equal(h.model().fields.name, '保留');
  h.confirmValue = true; h.busy(true); assert.equal(h.actions.cancelEdits(), false); h.busy(false);
  h.response(() => { throw new Error('owned unknown save response'); }); await h.actions.save();
  const pending = [...h.records]; assert.equal(pending.length, 1); const afterSave = h.calls.length;
  assert.equal(h.actions.cancelEdits(), false); assert.equal(h.model().cancelLocked, true);
  assert.deepEqual([...h.records], pending); assert.equal(h.calls.length, afterSave); assert.equal(h.model().fields.name, '保留');
});
test('local map inputs join leave, reread and Trial consent without joining saved metadata', async () => {
  let pending = false, opens = 0;
  const h = harness({ hasLocalMapInputs: () => pending, openTrial: () => { opens++; return null; } }); await h.load();
  assert.equal(h.controller.canLeave(true), true); assert.equal(h.model().context.readGeneration, 1);
  pending = true; h.confirmValue = false; const count = h.calls.length, prompts = h.confirmations.length;
  assert.equal(h.controller.canLeave(true), false); assert.equal(h.confirmations.length, prompts);
  await h.actions.load(); assert.equal(await h.controller.gotoGame(otherId), false); await h.actions.trial();
  assert.equal(h.calls.length, count); assert.equal(opens, 0); assert.equal(h.model().context.dirty, false);
  assert.equal(h.model().fields.gameId, gameId); assert.equal(h.records.size, 0);
  assert.equal(h.model().context.readGeneration, 1);
  h.confirmValue = true; await h.actions.load(); assert.equal(h.calls.length, count + 1);
  assert.equal(h.model().context.readGeneration, 2);
  h.response(() => { throw new Error('owned read failure'); }); await h.actions.load();
  assert.equal(h.model().context.readGeneration, 2);
  h.response(() => ({ ...receipt(), sourceDigest: 'invalid' })); await h.actions.load();
  assert.equal(h.model().context.readGeneration, 2); assert.equal(h.errors.length, 2);
  assert.ok(h.calls.every(call => call.body === undefined));
  pending = false; assert.equal(h.controller.canLeave(true), true);
});
const roleDTO = (revision = '1') => {
  const value = receipt(revision), chapter = value.chapters[0];
  Object.assign(chapter.factions[0], { monarch_idx: 0, advisor_idx: 126, diplomat_idx: null, capital: 0 });
  chapter.generals = [0, 126, 127].map(idx => ({ idx, name: `<將${idx}>`, hao: '', faction: idx === 127 ? null : 0 }));
  return value;
};
test('role display uses exact chapter slots, marks reserved G127 and owns its projection', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().roles.known, false);
  const dto = roleDTO(); h.response(() => dto); await h.actions.load();
  assert.equal(h.model().roles.known, true); assert.equal(h.model().roles.locked, false);
  assert.deepEqual(h.model().roles.chapters[0].factions, [{ slot: 0, monarchSlot: 0, advisorSlot: 126, diplomatSlot: null, capital: 0 }]);
  assert.deepEqual(h.model().roles.chapters[0].generals.map(g => [g.slot,g.reserved]), [[0,false],[126,false],[127,true]]);
  dto.chapters[0].generals[0].name = 'external mutation'; h.model().roles.chapters[0].generals.length = 0;
  h.controller.render(); assert.equal(h.model().roles.chapters[0].generals[0].name, '<將0>');
  const count = h.calls.length; h.actions.setField('revision', '999'); h.actions.setField('name', '未保存'); h.controller.render();
  assert.equal(h.calls.length, count); assert.equal(h.model().context.draftRevision, '1');
  assert.equal(h.model().roles.chapters[0].factions[0].advisorSlot, 126); assert.equal(h.records.size, 0);
});
test('missing role data stays unknown while malformed known data refuses atomic installation', async () => {
  const h = harness(); await h.load(); h.response(() => roleDTO()); await h.actions.load();
  for (const change of [d => { d.chapters[0].generals = null; }, d => { d.chapters[0].generals = {}; }, d => { d.chapters[0].generals = Array(1); }, d => { d.chapters[0].generals[1].idx = 0; }, d => { d.chapters[0].generals[0].idx = -0; }, d => { d.chapters[0].generals[0].faction = undefined; }, d => { d.chapters[0].generals[0].name = null; }, d => { d.chapters[0].factions[0].advisor_idx = '126'; }, d => { d.chapters[0].factions[0].monarch_idx = 128; }]) {
    const bad = roleDTO('2'); change(bad); h.actions.setField('revision', '2'); h.response(() => bad);
    const errors = h.errors.length; await h.actions.load(); assert.equal(h.errors.length, errors + 1);
    assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().roles.known, true);
  }
  for (const change of [d => { delete d.chapters[0].generals; }, d => { delete d.chapters[0].factions[0].advisor_idx; }, d => { delete d.chapters[0].factions[0].diplomat_idx; }, d => { d.chapters[0].factions[0].capital = 192; }, d => { d.profileRevision = 'fixed-template-authoring-1'; }]) {
    const unknown = roleDTO('2'); change(unknown); h.response(() => unknown); await h.actions.load();
    assert.equal(h.model().roles.known, false); assert.equal(h.model().roles.locked, true); assert.deepEqual(h.model().roles.chapters, []);
  }
  assert.equal(h.calls.some(call => call.body !== undefined), false); assert.equal(h.records.size, 0);
});
test('role display retires on identity or pending write and cannot revive after observed ABA', async () => {
  for (const field of ['version', 'id']) {
    const h = harness(); await h.load(); h.response(() => roleDTO()); await h.actions.load();
    const object = field === 'id' ? h.current().user : h.current(), prior = object[field];
    object[field] = 'retired'; h.controller.render(); assert.equal(h.model().roles.known, false);
    if (prior === undefined) delete object[field]; else object[field] = prior;
    h.controller.render(); assert.equal(h.model().roles.known, false);
  }
  const h = harness(); await h.load(); h.response(() => roleDTO()); await h.actions.load();
  h.actions.setField('name', '變更'); h.response(() => { assert.equal(h.model().roles.known, false); throw new Error('owned response loss'); });
  await h.actions.save(); assert.equal(h.model().roles.known, false); assert.equal(h.model().context.pending, true);
});
test('clearing an advisor saves only the approved reference with original-key retry and explicit reread', async () => {
  const h = harness(); await h.load(); h.response(() => roleDTO()); await h.actions.load();
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999'); h.actions.setResource('chapter#1', 0, 'money', '777');
  h.response(() => { throw new Error('owned lost role response'); }); await h.actions.clearStrategist('chapter#1', 0);
  const sent = h.calls.at(-1);
  assert.deepEqual(sent.body, { metadata: receipt().metadata, resourceEdits: [], chapterEdits: [{ op: 'set-strategist', chapterId: 'chapter#1', factionIdx: 0, generalIdx: null }] });
  assert.equal(sent.options.revision, '1'); assert.match(h.confirmations.at(-1), /原槽 126/);
  assert.equal(h.model().roles.known, false); assert.equal(h.model().context.pending, true);
  const reload = harness({ stored: new Map(h.records) }); await reload.actions.retry(); assert.equal(reload.calls.length, 0);
  reload.response(() => ({ state: 'committed', result: receipt('2') })); await reload.actions.query();
  assert.equal(reload.calls.at(-1).body, undefined); assert.equal(reload.model().roles.known, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_TEST', status: 422 })); await h.actions.query();
  const beforeRetry = h.calls.length;
  h.response(() => receipt('2')); await h.actions.retry(); assert.equal(h.calls.length, beforeRetry + 1);
  assert.deepEqual(h.calls.at(-1).body, sent.body); assert.equal(h.calls.at(-1).options.key, sent.options.key);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '777');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().roles.known, false);
  const next = roleDTO('2'); next.chapters[0].factions[0].advisor_idx = null; h.response(() => next); await h.actions.load();
  assert.equal(h.model().roles.chapters[0].factions[0].advisorSlot, null);
});
test('advisor clearing refuses unknown, empty, reserved or malformed targets before confirmation', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.actions.clearStrategist('chapter#1', 0); assert.equal(h.calls.length, count);
  h.response(() => roleDTO()); await h.actions.load(); count = h.calls.length;
  for (const args of [['missing',0], ['chapter#1',99], ['chapter#1',-0], ['chapter#1','0']]) await h.actions.clearStrategist(...args);
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, 0);
  for (const advisor of [null, 127, 42]) {
    const dto = roleDTO(); dto.chapters[0].factions[0].advisor_idx = advisor; h.response(() => dto); await h.actions.load(); count = h.calls.length;
    await h.actions.clearStrategist('chapter#1', 0); assert.equal(h.calls.length, count);
  }
  const oversized = roleDTO(); oversized.chapters[0].chapterId = 'x'.repeat(17000);
  h.response(() => oversized); await h.actions.load(); count = h.calls.length;
  await h.actions.clearStrategist(oversized.chapters[0].chapterId, 0); assert.equal(h.calls.length, count);
  assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
});
test('advisor clearing rechecks confirmation ownership and refuses unjournalled writes', async () => {
  for (const change of ['cancel','logout','version','id','password','game','quota']) {
    const h = harness(); await h.load(); h.response(() => roleDTO()); await h.actions.load();
    const count = h.calls.length;
    h.confirmValue = () => {
      if (change === 'cancel') return false;
      if (change === 'logout') h.identity(null);
      if (change === 'version') h.current().version = 'retired';
      if (change === 'id') h.current().user.id = 'other';
      if (change === 'password') h.current().user.mustChangePassword = true;
      if (change === 'game') h.controller.adoptGame(otherId);
      return true;
    };
    if (change === 'quota') h.records.set = () => { throw new Error('owned quota'); };
    await h.actions.clearStrategist('chapter#1', 0); assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  }
});
const advisorAssignmentDTO = (revision = '1') => {
  const dto = roleDTO(revision);
  dto.chapters[0].generals.push({ idx: 7, name: '候選七', hao: '', faction: 0 });
  return dto;
};
test('advisor assignment uses the shared exact-revision journal and preserves unrelated dirty fields', async () => {
  const h = harness(); await h.load(); h.response(() => advisorAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999'); h.actions.setResource('chapter#1', 0, 'money', '777');
  const count = h.calls.length; h.confirmValue = false; await h.actions.assignStrategist('chapter#1', 0, 7);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => receipt('2')); await h.actions.assignStrategist('chapter#1', 0, 7);
  assert.equal(h.calls.length, count + 1);
  assert.deepEqual(h.calls.at(-1).body, { metadata: receipt().metadata, resourceEdits: [], chapterEdits: [{ op: 'set-strategist', chapterId: 'chapter#1', factionIdx: 0, generalIdx: 7 }] });
  assert.equal(h.calls.at(-1).options.revision, '1');
  assert.match(h.confirmations.at(-1), /原槽 7.*原軍師槽 126.*服務校驗/);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '777');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().roles.known, false);
  await h.actions.assignStrategist('chapter#1', 0, 7); assert.equal(h.calls.length, count + 1);
});
test('unknown advisor assignment keeps original body and key and blocks competing writes', async () => {
  const h = harness(); await h.load(); h.response(() => advisorAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '原有未保存');
  h.response(() => { throw new Error('owned lost assignment'); }); await h.actions.assignStrategist('chapter#1', 0, 7);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  await h.actions.assignStrategist('chapter#1', 0, 126); await h.actions.clearStrategist('chapter#1', 0); await h.actions.save(); await h.actions.retry();
  assert.equal(h.calls.length, count);
  const reload = harness({ stored: new Map(h.records) }); await reload.actions.retry(); assert.equal(reload.calls.length, 0);
  reload.response(() => ({ state: 'committed', result: receipt('2') })); await reload.actions.query();
  assert.equal(reload.calls.length, 1); assert.equal(reload.calls[0].body, undefined); assert.equal(reload.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_TEST', status: 422 })); await h.actions.query();
  h.actions.setField('revision', '999'); h.actions.setField('name', '仍未保存');
  h.response(() => receipt('2')); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1).body, sent.body); assert.equal(h.calls.at(-1).options.key, sent.options.key);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().fields.name, '原有未保存');
  const dto = advisorAssignmentDTO('2'); dto.chapters[0].factions[0].advisor_idx = 7; h.response(() => dto); await h.actions.load();
  assert.equal(h.model().roles.chapters[0].factions[0].advisorSlot, 7);
});
test('advisor assignment rejects absent or reserved targets and rechecks confirmation and journal storage', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.actions.assignStrategist('chapter#1', 0, 7); assert.equal(h.calls.length, count);
  h.response(() => advisorAssignmentDTO()); await h.actions.load(); count = h.calls.length;
  for (const slot of [null, undefined, -0, -1, '7', 7.5, NaN, 127, 128, 6]) await h.actions.assignStrategist('chapter#1', 0, slot);
  for (const args of [['missing', 0], ['chapter#1', 99], ['chapter#1', -0], ['chapter#1', '0']]) await h.actions.assignStrategist(...args, 7);
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
  for (const change of ['cancel', 'logout', 'version', 'game', 'quota']) {
    const s = harness(); await s.load(); s.response(() => advisorAssignmentDTO()); await s.actions.load(); const before = s.calls.length;
    s.confirmValue = () => {
      if (change === 'cancel') return false;
      if (change === 'logout') s.identity(null);
      if (change === 'version') s.current().version = 'retired';
      if (change === 'game') s.controller.adoptGame(otherId);
      return true;
    };
    if (change === 'quota') s.records.set = () => { throw new Error('owned quota'); };
    await s.actions.assignStrategist('chapter#1', 0, 7); assert.equal(s.calls.length, before); assert.equal(s.records.size, 0);
  }
});
const monarchAssignmentDTO = (revision = '1') => {
  const dto = advisorAssignmentDTO(revision);
  dto.chapters[0].generals.find(row => row.idx === 7).faction = null;
  return dto;
};
test('monarch assignment uses saved revision and metadata while preserving other dirty inputs', async () => {
  const h = harness(); await h.load(); h.response(() => monarchAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '君主外未存'); h.actions.setField('revision', '999'); h.actions.setResource('chapter#1', 0, 'money', '777');
  const count = h.calls.length; h.confirmValue = false; await h.actions.assignMonarch('chapter#1', 0, 7);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => receipt('2')); await h.actions.assignMonarch('chapter#1', 0, 7);
  assert.equal(h.calls.length, count + 1);
  assert.deepEqual(h.calls.at(-1).body, { metadata: receipt().metadata, resourceEdits: [], chapterEdits: [{ op: 'set-monarch', chapterId: 'chapter#1', factionIdx: 0, generalIdx: 7 }] });
  assert.equal(h.calls.at(-1).options.revision, '1');
  assert.match(h.confirmations.at(-1), /原槽 7.*原君主槽 0.*自由武將.*服務校驗/);
  assert.equal(h.model().fields.name, '君主外未存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '777');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().roles.known, false);
  await h.actions.assignMonarch('chapter#1', 0, 7); assert.equal(h.calls.length, count + 1);
});
test('unknown monarch assignment restores only its original journal key and body', async () => {
  const h = harness(); await h.load(); h.response(() => monarchAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '原有未保存');
  h.response(() => { throw new Error('owned lost monarch'); }); await h.actions.assignMonarch('chapter#1', 0, 7);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  await h.actions.assignMonarch('chapter#1', 0, 126); await h.actions.assignStrategist('chapter#1', 0, 7); await h.actions.clearStrategist('chapter#1', 0); await h.actions.save(); await h.actions.retry();
  assert.equal(h.calls.length, count);
  const reload = harness({ stored: new Map(h.records) }); await reload.actions.retry(); assert.equal(reload.calls.length, 0);
  reload.response(() => ({ state: 'committed', result: receipt('2') })); await reload.actions.query();
  assert.equal(reload.calls.length, 1); assert.equal(reload.calls[0].body, undefined); assert.equal(reload.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_TEST', status: 422 })); await h.actions.query();
  h.actions.setField('revision', '999'); h.response(() => receipt('2')); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1).body, sent.body); assert.equal(h.calls.at(-1).options.key, sent.options.key);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().fields.name, '原有未保存');
  const dto = monarchAssignmentDTO('2'); dto.chapters[0].factions[0].monarch_idx = 7; dto.chapters[0].generals.find(row => row.idx === 7).faction = 0;
  h.response(() => dto); await h.actions.load(); assert.equal(h.model().roles.chapters[0].factions[0].monarchSlot, 7);
});
test('monarch assignment validates ordinary target and rechecks consent identity and durable journal', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.actions.assignMonarch('chapter#1', 0, 7); assert.equal(h.calls.length, count);
  h.response(() => monarchAssignmentDTO()); await h.actions.load(); count = h.calls.length;
  for (const slot of [null, undefined, -0, -1, '7', 7.5, NaN, 127, 128, 6]) await h.actions.assignMonarch('chapter#1', 0, slot);
  for (const args of [['missing', 0], ['chapter#1', 99], ['chapter#1', -0], ['chapter#1', '0']]) await h.actions.assignMonarch(...args, 7);
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
  for (const change of ['cancel', 'logout', 'version', 'game', 'quota']) {
    const s = harness(); await s.load(); s.response(() => monarchAssignmentDTO()); await s.actions.load(); const before = s.calls.length;
    s.confirmValue = () => {
      if (change === 'cancel') return false;
      if (change === 'logout') s.identity(null);
      if (change === 'version') s.current().version = 'retired';
      if (change === 'game') s.controller.adoptGame(otherId);
      return true;
    };
    if (change === 'quota') s.records.set = () => { throw new Error('owned quota'); };
    await s.actions.assignMonarch('chapter#1', 0, 7); assert.equal(s.calls.length, before); assert.equal(s.records.size, 0);
  }
});
test('explicit monarch succession uses its own command and preserves unrelated dirty inputs', async () => {
  const h = harness(); await h.load(); h.response(() => monarchAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '繼任外未存'); h.actions.setField('revision', '999'); h.actions.setResource('chapter#1', 0, 'money', '777');
  const count = h.calls.length; h.confirmValue = false; await h.actions.succeedMonarch('chapter#1', 0, 7);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => receipt('2')); await h.actions.succeedMonarch('chapter#1', 0, 7);
  assert.equal(h.calls.length, count + 1);
  assert.deepEqual(h.calls.at(-1).body, { metadata: receipt().metadata, resourceEdits: [], chapterEdits: [{ op: 'remove-monarch', chapterId: 'chapter#1', factionIdx: 0, resolution: { successor: 7 } }] });
  assert.equal(h.calls.at(-1).options.revision, '1');
  assert.match(h.confirmations.at(-1), /原君主槽 0.*原槽 7.*接任.*不解散勢力.*自由武將.*服務校驗/);
  assert.equal(h.model().fields.name, '繼任外未存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '777');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().roles.known, false);
  await h.actions.succeedMonarch('chapter#1', 0, 7); assert.equal(h.calls.length, count + 1);
});
test('unknown succession keeps original key and resolution across query and retry', async () => {
  const h = harness(); await h.load(); h.response(() => monarchAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '原有未保存');
  h.response(() => { throw new Error('owned lost succession'); }); await h.actions.succeedMonarch('chapter#1', 0, 7);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  await h.actions.succeedMonarch('chapter#1', 0, 126); await h.actions.assignMonarch('chapter#1', 0, 7); await h.actions.assignStrategist('chapter#1', 0, 7); await h.actions.clearStrategist('chapter#1', 0); await h.actions.save(); await h.actions.retry();
  assert.equal(h.calls.length, count);
  const reload = harness({ stored: new Map(h.records) }); await reload.actions.retry(); assert.equal(reload.calls.length, 0);
  reload.response(() => ({ state: 'committed', result: receipt('2') })); await reload.actions.query();
  assert.equal(reload.calls.length, 1); assert.ok(reload.calls[0].path.endsWith('/draft/operations/' + sent.options.key));
  assert.equal(reload.calls[0].body, undefined); assert.equal(reload.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_TEST', status: 422 })); await h.actions.query();
  h.actions.setField('revision', '999'); h.response(() => receipt('2')); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1).body, sent.body); assert.equal(h.calls.at(-1).options.key, sent.options.key);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().fields.name, '原有未保存');
  const dto = monarchAssignmentDTO('2'); dto.chapters[0].factions[0].monarch_idx = 7; dto.chapters[0].generals.find(row => row.idx === 7).faction = 0;
  h.response(() => dto); await h.actions.load(); assert.equal(h.model().roles.chapters[0].factions[0].monarchSlot, 7);
});
test('succession refuses absent or reserved successors and rechecks consent and durable key', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.actions.succeedMonarch('chapter#1', 0, 7); assert.equal(h.calls.length, count);
  h.response(() => monarchAssignmentDTO()); await h.actions.load(); count = h.calls.length;
  for (const slot of [null, undefined, -0, -1, '7', 'q', { disband: true }, 7.5, NaN, 127, 128, 6]) await h.actions.succeedMonarch('chapter#1', 0, slot);
  for (const args of [['missing', 0], ['chapter#1', 99], ['chapter#1', -0], ['chapter#1', '0']]) await h.actions.succeedMonarch(...args, 7);
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
  for (const change of ['cancel', 'logout', 'version', 'game', 'quota']) {
    const s = harness(); await s.load(); s.response(() => monarchAssignmentDTO()); await s.actions.load(); const before = s.calls.length;
    s.confirmValue = () => {
      if (change === 'cancel') return false;
      if (change === 'logout') s.identity(null);
      if (change === 'version') s.current().version = 'retired';
      if (change === 'game') s.controller.adoptGame(otherId);
      return true;
    };
    if (change === 'quota') s.records.set = () => { throw new Error('owned quota'); };
    await s.actions.succeedMonarch('chapter#1', 0, 7); assert.equal(s.calls.length, before); assert.equal(s.records.size, 0);
  }
});
test('explicit disband uses shared journal without requiring an advisor and preserves dirty inputs', async () => {
  const h = harness(); await h.load(); const dto = monarchAssignmentDTO(); dto.chapters[0].factions[0].advisor_idx = null;
  h.response(() => dto); await h.actions.load();
  h.actions.setField('name', '解散外未存'); h.actions.setField('revision', '999'); h.actions.setResource('chapter#1', 0, 'money', '777');
  const count = h.calls.length; h.confirmValue = false; await h.actions.disbandFaction('chapter#1', 0);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirmValue = true; h.response(() => receipt('2')); await h.actions.disbandFaction('chapter#1', 0);
  assert.equal(h.calls.length, count + 1);
  assert.deepEqual(h.calls.at(-1).body, { metadata: receipt().metadata, resourceEdits: [], chapterEdits: [{ op: 'disband-faction', chapterId: 'chapter#1', factionIdx: 0, confirm: true }] });
  assert.equal(h.calls.at(-1).options.revision, '1');
  assert.match(h.confirmations.at(-1), /解散.*勢力槽 0.*成員轉自由.*據點轉中立.*只作用於本章.*服務校驗/);
  assert.equal(h.model().fields.name, '解散外未存'); assert.equal(h.model().resources[0].factions[0].inputs.money, '777');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().roles.known, false);
  await h.actions.disbandFaction('chapter#1', 0); assert.equal(h.calls.length, count + 1);
});
test('unknown disband preserves original command and key through query and retry', async () => {
  const h = harness(); await h.load(); h.response(() => monarchAssignmentDTO()); await h.actions.load();
  h.actions.setField('name', '原有未保存');
  h.response(() => { throw new Error('owned lost disband'); }); await h.actions.disbandFaction('chapter#1', 0);
  const sent = structuredClone(h.calls.at(-1)), count = h.calls.length;
  await h.actions.disbandFaction('chapter#1', 0); await h.actions.succeedMonarch('chapter#1', 0, 7); await h.actions.assignMonarch('chapter#1', 0, 7); await h.actions.assignStrategist('chapter#1', 0, 7); await h.actions.clearStrategist('chapter#1', 0); await h.actions.save(); await h.actions.retry();
  assert.equal(h.calls.length, count);
  const reload = harness({ stored: new Map(h.records) }); await reload.actions.retry(); assert.equal(reload.calls.length, 0);
  reload.response(() => ({ state: 'committed', result: receipt('2') })); await reload.actions.query();
  assert.equal(reload.calls.length, 1); assert.ok(reload.calls[0].path.endsWith('/draft/operations/' + sent.options.key));
  assert.equal(reload.calls[0].body, undefined); assert.equal(reload.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'OWNED_TEST', status: 422 })); await h.actions.query();
  h.actions.setField('revision', '999'); h.response(() => receipt('2')); await h.actions.retry();
  assert.deepEqual(h.calls.at(-1).body, sent.body); assert.equal(h.calls.at(-1).options.key, sent.options.key);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().fields.name, '原有未保存');
});
test('disband requires a known saved faction and rechecks consent identity and durable key', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.actions.disbandFaction('chapter#1', 0); assert.equal(h.calls.length, count);
  h.response(() => monarchAssignmentDTO()); await h.actions.load(); count = h.calls.length;
  for (const args of [['missing', 0], ['chapter#1', 99], ['chapter#1', -0], ['chapter#1', '0'], ['chapter#1', null], ['chapter#1', NaN]]) await h.actions.disbandFaction(...args);
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
  for (const change of ['cancel', 'logout', 'version', 'game', 'quota']) {
    const s = harness(); await s.load(); s.response(() => monarchAssignmentDTO()); await s.actions.load(); const before = s.calls.length;
    s.confirmValue = () => {
      if (change === 'cancel') return false;
      if (change === 'logout') s.identity(null);
      if (change === 'version') s.current().version = 'retired';
      if (change === 'game') s.controller.adoptGame(otherId);
      return true;
    };
    if (change === 'quota') s.records.set = () => { throw new Error('owned quota'); };
    await s.actions.disbandFaction('chapter#1', 0); assert.equal(s.calls.length, before); assert.equal(s.records.size, 0);
  }
});
test('list refresh cannot resume after its selection callback replaces identity or context', async () => {
  for (const change of ['identity', 'context']) {
    let h;
    h = harness({ gameContext: { current: () => null, select() {
      if (change === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      else h.controller.adoptGame(otherId);
      return true;
    } } });
    await h.actions.refresh();
    assert.equal(h.model().fields.gameId, change === 'identity' ? '' : otherId);
    assert.equal(h.model().fields.revision, change === 'identity' ? '' : '1');
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/games');
    assert.equal(h.records.size, 0); assert.deepEqual(h.errors, []);
  }
});
test('metadata and chapter writes stop before POST if the original-key journal cannot be stored', async () => {
  for (const operation of ['save', 'copy']) {
    const h = harness(); await h.load(); h.actions.setField('name', '未保存');
    const before = h.calls.length;
    h.records.set = () => { throw new Error('owned storage quota'); };
    if (operation === 'save') await h.actions.save(); else await h.actions.chapter('copy', 'chapter#1');
    assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
    assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().context.draftRevision, '1');
    assert.equal(h.model().context.pending, false); assert.equal(h.errors.length, 1);
  }
});
test('metadata and chapter retries must retain the original journal, body and key', async () => {
  for (const operation of ['save', 'copy']) {
    const h = harness(); await h.load(); h.actions.setField('name', '未保存');
    h.response(() => { throw new Error('owned response lost'); });
    if (operation === 'save') await h.actions.save(); else await h.actions.chapter('copy', 'chapter#1');
    const original = structuredClone(h.calls.at(-1));
    h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'owned failure' })); await h.actions.query();
    h.records.clear(); h.records.set = () => { throw new Error('owned storage quota'); };
    const before = h.calls.length; await h.actions.retry();
    assert.equal(h.calls.length, before); assert.equal(h.model().context.pending, true);
    assert.equal(h.model().fields.name, '未保存'); assert.equal(h.records.size, 0);
    h.records.set = Map.prototype.set;
    h.response(() => ({ ...game(), draftRevision: '2', metadata: { name: '未保存', introduction: '原稿' } }));
    await h.actions.retry(); assert.deepEqual(h.calls.at(-1), original);
    assert.equal(h.model().context.draftRevision, '2'); assert.equal(h.model().context.pending, false);
  }
});
test('neutral template is an explicit readable profile; unknown profiles never replace it', async () => {
  const h = harness(); await h.actions.refresh();
  const neutral = { ...receipt(), profileRevision: 'fixed-template-authoring-1', chapters: [{ chapterId: 'first', name: '第一章', factions: [], gaps: { saveGaps: 0, activeGaps: 3 } }] };
  h.response(() => neutral); await h.actions.load();
  assert.equal(h.model().context.verified, true); assert.equal(h.model().chapters[0].name, '第一章');
  assert.equal(h.model().chapters[0].gaps.activeGaps, 3); assert.deepEqual(h.model().resources[0].factions, []);
  h.response(() => ({ ...neutral, profileRevision: 'unapproved-profile' })); await h.actions.load();
  assert.equal(h.errors.length, 1); assert.equal(h.model().chapters[0].name, '第一章');
  h.actions.setField('name', '中立修改'); h.response((_path, body) => ({ ...game(), metadata: body.metadata, draftRevision: '2' }));
  await h.actions.save(); assert.deepEqual(h.calls.at(-1).body.resourceEdits, []);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().context.draftRevision, '2');
});
test('load and game selection consent cannot act on a replacement identity or context', async () => {
  for (const operation of ['load', 'select']) for (const change of ['identity', 'context']) {
    const h = harness(); await h.load(); h.actions.setField('name', '未保存'); const before = h.calls.length;
    h.confirmValue = () => {
      if (change === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      else h.controller.adoptGame(otherId);
      return true;
    };
    if (operation === 'load') await h.actions.load(); else h.actions.chooseGame(change === 'identity' ? otherId : gameId);
    assert.equal(h.calls.length, before); assert.equal(h.records.size, 0); assert.equal(h.errors.length, 0);
    assert.equal(h.model().fields.gameId, change === 'identity' ? gameId : otherId);
    assert.equal(h.model().fields.name, change === 'identity' ? '未保存' : '');
  }
});
test('chapter dialogs cannot create an operation after same-author session replacement', async () => {
  for (const op of ['rename', 'delete']) {
    const h = harness(); await h.load(); const before = h.calls.length;
    const replace = () => { h.identity({ user: { id: 'author', mustChangePassword: false }, csrf: 'replacement' }); return op === 'rename' ? '舊確認' : true; };
    if (op === 'rename') h.promptValue = replace; else h.confirmValue = replace;
    await h.actions.chapter(op, 'chapter#1');
    assert.equal(h.calls.length, before); assert.equal(h.records.size, 0); assert.equal(h.errors.length, 0);
    assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().context.pending, false);
  }
});
test('dirty Trial confirmation cannot open a window after context or identity changes', async () => {
  for (const change of ['identity', 'game', 'chapter']) {
    let opens = 0; const h = harness({ openTrial: () => { opens++; return null; } }); await h.load();
    if (change === 'chapter') {
      h.response(() => { const value = receipt(); value.chapters.push({ ...value.chapters[0], chapterId: 'chapter#2' }); return value; });
      await h.actions.load();
    }
    h.actions.setField('name', '未保存'); const before = h.calls.length;
    h.confirmValue = () => {
      if (change === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      else if (change === 'game') h.controller.adoptGame(otherId);
      else h.actions.setField('chapterId', 'chapter#2');
      return true;
    };
    await h.actions.trial(); assert.equal(opens, 0); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
  }
});
test('Trial window port returning after session change closes its child without starting a Trial', async () => {
  const child = { closed: false, close() { this.closed = true; } };
  const h = harness({ openTrial: () => { h.identity({ user: { id: 'author', mustChangePassword: false } }); return child; } });
  await h.load(); const before = h.calls.length;
  await h.actions.trial(); assert.equal(child.closed, true); assert.equal(h.calls.length, before); assert.equal(h.errors.length, 0);
});
test('chapter gap details stay readonly and absence remains unknown', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().chapters[0].gaps.details, null);
  const response = receipt(); response.chapters[0].gaps.details = { save: [], active: [{ code: 'entity-count', subject: '<img>', description: '未符合槽數', recognized: true }], omittedSave: 0, omittedActive: 1 };
  h.response(() => response); await h.actions.load();
  assert.equal(h.model().chapters[0].gaps.details.omittedActive, 1);
  h.model().chapters[0].gaps.details.active[0].description = '改寫投影';
  response.chapters[0].gaps.details.active[0].description = '改寫回應'; h.controller.render();
  assert.equal(h.model().chapters[0].gaps.details.active[0].description, '未符合槽數');
  h.identity(null); assert.deepEqual(h.model().chapters, []);
});
test('Trial asset report is readonly, bounded and optional without inferring empty', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().chapters[0].gaps.assets, null);
  const assets = { total: 2, items: [{ kind: 'kao', slot: 4, value: 255, logicalURL: 'kao/255.png' }], omitted: 1 };
  const response = receipt(); response.chapters[0].gaps.assets = structuredClone(assets);
  h.response(() => response); await h.actions.load();
  assert.deepEqual(h.model().chapters[0].gaps.assets, assets);
  response.chapters[0].gaps.assets.items[0].logicalURL = 'response mutation';
  h.model().chapters[0].gaps.assets.items[0].logicalURL = 'projection mutation'; h.controller.render();
  assert.deepEqual(h.model().chapters[0].gaps.assets, assets);
  for (const bad of [{ ...assets, total: 3 }, { ...assets, omitted: -1 }, { ...assets, total: 102, items: Array(101).fill(assets.items[0]) }, { ...assets, items: [null] }, { ...assets, items: [{ ...assets.items[0], kind: 'unknown' }] }, { ...assets, items: [{ ...assets.items[0], slot: '4' }] }, { ...assets, items: [{ ...assets.items[0], value: 1.5 }] }, { ...assets, items: [{ ...assets.items[0], logicalURL: false }] }]) {
    h.response(() => { const next = receipt('2'); next.chapters[0].gaps.assets = bad; return next; });
    h.actions.setField('revision', '2'); await h.actions.load();
    assert.equal(h.model().context.draftRevision, '1'); assert.deepEqual(h.model().chapters[0].gaps.assets, assets);
  }
  assert.equal(h.errors.length, 8); assert.equal(h.calls.some(call => call.body), false);
  h.identity(null); assert.deepEqual(h.model().chapters, []);
});
test('malformed or inconsistent chapter gap details reject the entire read atomically', async () => {
  const h = harness(); await h.load();
  for (const details of [null, [], { save: [], active: [], omittedSave: 0, omittedActive: 0 }, { save: [], active: [], omittedSave: 0, omittedActive: -1 }, { save: [], active: [{ code: 'x', subject: 'x', description: 5, recognized: true }], omittedSave: 0, omittedActive: 1 }]) {
    h.response(() => { const value = receipt('2'); value.chapters[0].gaps.details = details; return value; });
    h.actions.setField('revision', '2'); await h.actions.load();
    assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().chapters[0].gaps.details, null);
  }
  assert.equal(h.errors.length, 5); assert.equal(h.calls.some(call => call.body), false);
});
test('list timestamps come only from canonical server values and never change loaded or dirty state', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().games[0].createdAt, null);
  h.actions.setField('name', '未保存');
  const createdAt = '2026-01-02T03:04:05.006Z', modifiedAt = '2026-02-03T04:05:06.007Z';
  h.response(() => ({ games: [{ ...game(), draftRevision: '99', createdAt, modifiedAt }, game(otherId)] }));
  await h.actions.refresh();
  assert.equal(h.model().games[0].createdAt, createdAt); assert.equal(h.model().games[0].modifiedAt, modifiedAt);
  assert.equal(h.model().games[1].modifiedAt, null); assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().fields.name, '未保存');
  h.model().games[0].modifiedAt = 'forged'; h.controller.render(); assert.equal(h.model().games[0].modifiedAt, modifiedAt);
  assert.equal(h.calls.some(call => call.body), false); h.identity(null); assert.deepEqual(h.model().games, []);
});
test('own-list creator uses verified owner and current account, with independent text projections', async () => {
  const h = harness(); h.current().user.account = 'Author<Account>'; await h.load();
  h.response(() => ({ games: [{ ...game(), ownerId: 'author', metadata: { name: '名稱', introduction: '<img src=x>' } }, game(otherId)] }));
  await h.actions.refresh();
  assert.equal(h.model().games[0].creator, 'Author<Account>'); assert.equal(h.model().games[0].introduction, '<img src=x>');
  assert.equal(h.model().games[1].creator, null);
  h.model().games[0].introduction = 'forged'; h.controller.render(); assert.equal(h.model().games[0].introduction, '<img src=x>');
  h.identity({ user: { id: 'other', account: 'Other', mustChangePassword: false } }); assert.deepEqual(h.model().games, []);
});
test('foreign owner in own-list response cannot replace existing private projection', async () => {
  const h = harness(); await h.load(); const before = structuredClone(h.model().games);
  h.response(() => ({ games: [{ ...game(), ownerId: 'other' }] })); await h.actions.refresh();
  assert.deepEqual(h.model().games, before); assert.equal(h.errors.length, 1); assert.equal(h.model().context.draftRevision, '1');
});
test('invalid list timestamp rejects the entire response without replacing prior display', async () => {
  const h = harness(); await h.load(); const before = structuredClone(h.model().games);
  for (const invalid of [0, 'tomorrow', '2026-02-30T00:00:00.000Z', '2026-01-01T00:00:00+00:00', {}]) {
    h.response(() => ({ games: [{ ...game(), draftRevision: '99' }, { ...game(otherId), modifiedAt: invalid }] }));
    await h.actions.refresh(); assert.deepEqual(h.model().games, before);
  }
  assert.equal(h.errors.length, 5); assert.match(h.errors[0].message, /時間回應無效/);
});
test('explicit read projects display copies, dirty fields do not alter saved revision, refresh is not load', async () => {
  const h = harness(); await h.load(); const model = h.model();
  assert.equal(model.context.draftRevision, '1'); assert.equal(model.fields.chapterId, 'chapter#1');
  assert.equal(JSON.stringify(model).includes('never-project'), false);
  model.resources[0].factions[0].money = 999; model.chapters[0].gaps.saveGaps = 999; h.controller.render();
  assert.equal(h.model().resources[0].factions[0].money, 100); assert.equal(h.model().chapters[0].gaps.saveGaps, 0);
  h.actions.setField('name', '未保存'); assert.equal(h.model().context.dirty, true);
  h.response(() => ({ games: [{ ...game(), draftRevision: '99' }] })); await h.actions.refresh();
  assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().fields.revision, '1'); assert.equal(h.model().fields.name, '未保存');
});
test('list omission cannot retarget a loaded dirty draft or restored operation', async () => {
  const h = harness(); await h.load(); h.actions.setField('name', '保留輸入');
  for (const games of [[game(otherId)], []]) {
    h.response(() => ({ games })); await h.actions.refresh();
    assert.equal(h.model().fields.gameId, gameId); assert.equal(h.model().fields.revision, '1');
    assert.equal(h.model().fields.name, '保留輸入'); assert.equal(h.model().context.gameId, gameId);
    assert.equal(h.model().selectionMissing, true); assert.equal(h.calls.some(call => call.body), false);
  }
  const restored = harness({ stored: new Map([['editor-draft-operation:author', JSON.stringify({ gameId, revision: '1', key: 'original_operation_key' })]]) });
  restored.response(() => ({ games: [game(otherId)] })); await restored.actions.refresh();
  assert.equal(restored.model().fields.gameId, gameId); assert.equal(restored.model().gameLocked, true);
  assert.equal(restored.model().selectionMissing, true); assert.equal(restored.model().context, null);
});
test('confirmed physical deletion drops the retained context; a list omission still does not', async () => {
  const h = harness(); await h.load();
  assert.equal(h.model().context.gameId, gameId);
  assert.equal(h.controller.forgetGame('not-a-uuid'), false);
  assert.equal(h.controller.forgetGame(otherId), false);
  assert.equal(h.controller.forgetGame(gameId), true);
  const model = h.model();
  assert.equal(model.fields.gameId, ''); assert.equal(model.context, null); assert.equal(model.chapters.length, 0);
  assert.equal(model.games.some(game => game.gameId === gameId), false);
  assert.equal(model.selectionMissing, false); assert.match(model.message, /物理刪除/);
  // 未確認的原操作不能被一次刪除通知抹掉：保留它才能查詢／重試。
  const restored = harness({ stored: new Map([['editor-draft-operation:author', JSON.stringify({ gameId, revision: '1', key: 'original_operation_key' })]]) });
  restored.response(() => ({ games: [game(gameId)] })); await restored.actions.refresh();
  assert.equal(restored.controller.forgetGame(gameId), false);
  assert.equal(restored.model().fields.gameId, gameId); assert.equal(restored.model().gameLocked, true);
});
test('duplicate list identities reject atomically rather than selecting an ambiguous revision', async () => {
  const h = harness(); await h.load(); const before = structuredClone(h.model());
  h.response(() => ({ games: [game(), { ...game(), draftRevision: '99' }] })); await h.actions.refresh();
  assert.equal(h.errors.length, 1); assert.deepEqual(h.model().games, before.games);
  assert.deepEqual(h.model().context, before.context); assert.deepEqual(h.model().fields, before.fields);
});
test('dirty switch cancel preserves all fields and context; identity change clears projection', async () => {
  const h = harness(); await h.load(); h.actions.setField('name', '未保存'); h.confirmValue = false; h.actions.chooseGame(otherId);
  assert.equal(h.model().fields.gameId, gameId); assert.equal(h.model().fields.name, '未保存'); assert.equal(h.controller.canLeave(true), false);
  h.confirmValue = true; h.actions.chooseGame(otherId); assert.equal(h.model().context, null); assert.equal(h.model().fields.gameId, otherId);
  h.identity(null); assert.deepEqual(h.model().games, []); assert.deepEqual(h.model().resources, []); assert.equal(h.model().fields.gameId, '');
  h.identity({ user: { id: 'other', mustChangePassword: false } }); assert.equal(h.model().fields.name, '');
});
test('lost save response keeps fields and original key; explicit query acknowledges only that revision', async () => {
  const h = harness(); await h.load(); h.actions.setField('name', '資料二'); h.actions.setField('introduction', 'e\u0301');
  h.response(() => { throw new Error('response lost'); }); await h.actions.save();
  const save = h.calls.at(-1); assert.equal(save.options.revision, '1'); assert.equal(save.body.metadata.introduction, 'é');
  assert.equal(h.model().fields.introduction, 'e\u0301'); assert.equal(h.model().editLocked, true); assert.equal(h.model().retryLocked, true);
  let association;
  try { association = JSON.parse([...h.records.values()][0]); } catch (cause) { throw new Error('Invalid stored UI association', { cause }); }
  assert.deepEqual(Object.keys(association).sort(), ['gameId', 'key', 'revision']);
  h.response(path => { assert.ok(path.endsWith(`/${save.options.key}`)); return { state: 'committed', result: { ...game(), draftRevision: '2', metadata: save.body.metadata } }; });
  await h.actions.query(); assert.equal(h.model().fields.introduction, 'é'); assert.equal(h.model().context.draftRevision, '2'); assert.equal(h.records.size, 0);
});
test('recorded failure retries exact key/body/revision, not refreshed latest', async () => {
  const h = harness(); await h.load(); h.actions.setField('name', '本頁'); h.response(() => { throw new Error('conflict'); }); await h.actions.save();
  const original = structuredClone(h.calls.at(-1));
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'CONFLICT' })); await h.actions.query(); assert.equal(h.model().retryLocked, false);
  h.response(() => { throw new Error('same conflict'); }); await h.actions.retry(); assert.deepEqual(h.calls.at(-1), original); assert.equal(h.model().fields.name, '本頁');
});
test('restored association has no reconstructed body; receipt alone does not allow editing', async () => {
  const stored = new Map([['editor-draft-operation:author', JSON.stringify({ gameId, revision: '1', key: 'original_operation_key' })]]);
  const h = harness({ stored }); assert.equal(h.model().retryLocked, true); assert.equal(h.model().loadLocked, true); assert.equal(h.calls.length, 0);
  h.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } })); await h.actions.query();
  assert.equal(h.model().context.verified, false); assert.equal(h.model().editLocked, true); assert.equal(h.model().loadLocked, false);
});
test('404 after reload cannot retry; actual password-change acknowledgement unlocks explicit recovery', async () => {
  const h = harness({ stored: new Map([['editor-draft-operation:author', JSON.stringify({ gameId, revision: '1', key: 'original_operation_key' })]]) });
  h.response(() => { throw Object.assign(new Error('not found'), { status: 404 }); }); await h.actions.query();
  assert.equal(h.model().loadLocked, true); assert.equal(h.model().retryLocked, true);
  h.controller.passwordChanged(h.current()); assert.equal(h.model().loadLocked, false);
  await h.actions.query(); assert.match(h.model().message, /舊會話已由實際改密撤銷/); assert.equal(h.model().editLocked, true);
});
test('malformed draft does not partly replace previously loaded context or fields', async () => {
  const h = harness(); await h.load(); h.actions.setField('revision', '2');
  h.response(() => ({ ...receipt('2'), metadata: { name: '無效回應', introduction: '' }, chapters: [{ chapterId: 'x', gaps: {} }] })); await h.actions.load();
  assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().fields.name, '<img>'); assert.equal(h.model().chapters.length, 1); assert.equal(h.errors.length, 1);
});
test('late read on identity change cannot publish old private data', async () => {
  const h = harness(); await h.actions.refresh(); let release;
  h.response(() => new Promise(resolve => { release = resolve; })); const pending = h.actions.load();
  h.identity({ user: { id: 'second', mustChangePassword: false } }); release(receipt()); await pending;
  assert.equal(h.model().context, null); assert.equal(h.model().fields.name, ''); assert.deepEqual(h.model().resources, []);
});
test('chapter cancel sends nothing; confirmed edits retain stable ID and exact saved revision', async () => {
  const h = harness(); await h.load(); const before = h.calls.length;
  h.confirmValue = false; await h.actions.chapter('delete', 'chapter#1'); h.promptValue = null; await h.actions.chapter('rename', 'chapter#1'); assert.equal(h.calls.length, before);
  h.confirmValue = true; h.response((path, body) => {
    if (body) return { ...game(), draftRevision: '2' };
    if (path === '/api/games') return { games: [game()] };
    return receipt('2');
  });
  await h.actions.chapter('copy', 'chapter#1');
  const save = h.calls.find(call => call.body?.chapterEdits); assert.deepEqual(save.body.chapterEdits, [{ op: 'copy', chapterId: 'chapter#1' }]); assert.equal(save.options.revision, '1'); assert.equal(h.model().context.draftRevision, '2');
});
test('Trial opens synchronously then uses selected chapter/saved revision; late response closes child', async () => {
  const child = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace() { throw new Error('should not navigate'); } } };
  let opens = 0; const h = harness({ openTrial: () => { opens++; return child; } }); await h.load(); let release;
  h.response(() => new Promise(resolve => { release = resolve; })); const pending = h.actions.trial(); assert.equal(opens, 1); assert.equal(child.opener, null);
  assert.deepEqual(h.calls.at(-1).body, { expectedRevision: '1', chapterId: 'chapter#1' }); h.identity(null); release({}); await pending; assert.equal(child.closed, true);
});
test('copy-list jump works inside existing serial work, but direct busy selection stays locked', async () => {
  const h = harness(); await h.load(); h.actions.setField('introduction', '未保存'); h.busy(true);
  h.actions.chooseGame(otherId); assert.equal(h.model().fields.gameId, gameId);
  h.confirmValue = false; const before = h.calls.length;
  assert.equal(await h.controller.gotoGame(otherId), false); assert.equal(h.model().fields.gameId, gameId);
  assert.equal(h.model().fields.introduction, '未保存'); assert.equal(h.calls.length, before);
  h.confirmValue = true;
  assert.equal(await h.controller.gotoGame(otherId), true); assert.equal(h.model().fields.gameId, otherId); assert.equal(h.model().context, null); h.busy(false);
  const stale = harness(); stale.response(() => { stale.identity(null); return { games: [game()] }; });
  assert.equal(await stale.controller.gotoGame(gameId), false); assert.equal(stale.model().fields.gameId, '');
});
test('dirty Trial cancellation opens no window and makes no request; blocked retry confirms again', async () => {
  let opens = 0; const h = harness({ openTrial: () => { opens++; return null; } }); await h.load();
  h.actions.setField('introduction', '未保存簡介'); const before = h.calls.length;
  h.confirmValue = false; await h.actions.trial();
  assert.equal(opens, 0); assert.equal(h.calls.length, before); assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0], /已保存修訂/); assert.equal(h.model().fields.introduction, '未保存簡介');
  h.confirmValue = true; await h.actions.trial();
  assert.equal(opens, 1); assert.equal(h.calls.length, before); assert.match(h.model().message, /攔截/);
  h.confirmValue = false; await h.actions.trial();
  assert.equal(opens, 1); assert.equal(h.calls.length, before); assert.equal(h.confirmations.length, 3);
  assert.equal(h.model().context.dirty, true); assert.equal(h.records.size, 0);
});
test('chapter-row Trial selects only a known loaded chapter and reuses the saved-snapshot workflow', async () => {
  let opens = 0, target;
  const child = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace(url) { target = url; } } };
  const h = harness({ openTrial: () => { opens++; return child; } }); await h.load();
  const data = receipt(); data.chapters.push({ ...structuredClone(data.chapters[0]), chapterId: 'chapter#other', name: '另一章' });
  h.response(() => data); await h.actions.load();
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  h.actions.setResource('chapter#1', 0, 'money', '55');
  const before = h.calls.length;
  await h.actions.trial('unknown'); assert.equal(opens, 0); assert.equal(h.calls.length, before);
  assert.equal(h.model().fields.chapterId, 'chapter#1');
  h.confirmValue = false; await h.actions.trial('chapter#other');
  assert.equal(h.model().fields.chapterId, 'chapter#other'); assert.equal(opens, 0); assert.equal(h.calls.length, before);
  assert.match(h.confirmations.at(-1), /已保存修訂 1/); assert.match(h.confirmations.at(-1), /chapter#other/);
  h.confirmValue = true;
  h.response(() => ({ state: 'active', trialId: otherId, gameId, draftRevision: '1', chapterId: 'chapter#other', ownerId: 'author', manifestDigest: 'a'.repeat(64) }));
  await h.actions.trial('chapter#other');
  assert.equal(opens, 1); assert.equal(h.calls.length, before + 1);
  assert.deepEqual(h.calls.at(-1).body, { expectedRevision: '1', chapterId: 'chapter#other' });
  assert.equal(target, `/api/trial/web/?trial=${otherId}`);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().fields.revision, '999');
  assert.equal(h.model().resources[0].factions[0].inputs.money, '55'); assert.equal(h.records.size, 0);
  assert.match(h.model().message, /chapter#other/); assert.equal(h.errors.length, 0);
});
test('Trial failures stay on the captured chapter and saved revision without saving or retrying', async () => {
  for (const code of ['TRIAL_CHAPTER_ASSET_MISSING', 'PLAY_PORTRAIT_CORRUPT', 'TRIAL_CHAPTER_NOT_ACTIVE', 'TRIAL_CHAPTER_UNSUPPORTED', 'offline']) {
    const child = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace() { assert.fail('failed Trial must not navigate'); } } };
    const h = harness({ openTrial: () => child }); await h.load();
    h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
    const before = h.calls.length, error = Object.assign(new Error(code), { code });
    h.response(() => { throw error; }); await h.actions.trial();
    assert.equal(h.calls.length, before + 1);
    assert.deepEqual(h.calls.at(-1).body, { expectedRevision: '1', chapterId: 'chapter#1' });
    assert.match(h.model().message, /試運行未確認：已保存修訂 1／章節 \[chapter#1\]/);
    assert.ok(h.model().message.includes(code));
    assert.match(h.model().message, /不自動保存、重讀或重試/);
    assert.match(h.model().message, /不能推定服務端未建立試運行/);
    if (code === 'TRIAL_CHAPTER_ASSET_MISSING') assert.match(h.model().message, /Trial肖像／據點圖檢查/);
    if (code === 'PLAY_PORTRAIT_CORRUPT') assert.match(h.model().message, /原始肖像欄位及共享肖像覆蓋.*零缺口.*不能自動補圖/);
    if (code === 'TRIAL_CHAPTER_NOT_ACTIVE') assert.match(h.model().message, /章節校驗定位/);
    if (code === 'TRIAL_CHAPTER_UNSUPPORTED') assert.match(h.model().message, /共同編譯支持域/);
    assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().fields.revision, '999');
    assert.equal(h.model().context.dirty, true); assert.equal(child.closed, true);
    assert.deepEqual(h.errors, [error]); assert.equal(h.records.size, 0);
  }
  const child = { closed: false, close() { this.closed = true; } }, h = harness({ openTrial: () => child });
  await h.load(); let reject;
  h.response(() => new Promise((_resolve, fail) => { reject = fail; }));
  const pending = h.actions.trial(); h.identity(null); const message = h.model().message;
  reject(new Error('late Trial failure')); await pending;
  assert.equal(h.model().message, message); assert.equal(child.closed, true);
});
test('successful Trial uses validated receipt and preserves dirty unsaved metadata', async () => {
  let target; const child = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace(path) { target = path; } } };
  const h = harness({ openTrial: () => child }); await h.load(); h.actions.setField('name', '未保存');
  h.response(() => ({ state: 'active', trialId: otherId, gameId, draftRevision: '1', chapterId: 'chapter#1', ownerId: 'author', manifestDigest: 'a'.repeat(64) }));
  const pending = h.actions.trial(); assert.equal(h.confirmations.length, 1);
  await pending; assert.equal(target, `/api/trial/web/?trial=${otherId}`); assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().context.dirty, true); assert.equal(h.calls.some(call => call.path.endsWith('/draft/save')), false);
});
test('resource patches stay dirty and isolated until an exact saved receipt', async () => {
  const h = harness(); await h.load(); h.actions.setResource('chapter#1', 0, 'money', '-8388608'); h.actions.setResource('chapter#1', 0, 'reserve_inf', '65535');
  h.model().resources[0].factions[0].inputs.money = '999'; h.controller.render();
  assert.equal(h.model().resources[0].factions[0].inputs.money, '-8388608'); assert.equal(h.model().context.dirty, true);
  h.confirmValue = false; assert.equal(h.controller.canLeave(), false);
  h.response((_path, body) => ({ ...game(), draftRevision: '2', metadata: body.metadata })); await h.actions.save();
  assert.deepEqual(h.calls.at(-1).body.resourceEdits, [{ chapterId: 'chapter#1', slot: 0, values: { money: -8388608, reserve_inf: 65535 } }]);
  assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().context.dirty, false); assert.equal(h.model().resources[0].factions[0].money, -8388608);
});
test('compacted resource rows keep their native slot rather than their display position', async () => {
  const h = harness(); await h.load();
  const compact = receipt(); compact.chapters[0].factions[0].slot = 1;
  h.response(() => compact); await h.actions.load();
  h.actions.setResource('chapter#1', 0, 'money', '999'); assert.equal(h.model().context.dirty, false);
  h.actions.setResource('chapter#1', 1, 'money', '101');
  h.response((_path, body) => ({ ...game(), draftRevision: '2', metadata: body.metadata })); await h.actions.save();
  assert.deepEqual(h.calls.at(-1).body.resourceEdits, [{ chapterId: 'chapter#1', slot: 1, values: { money: 101 } }]);
  assert.equal(h.model().resources[0].factions[0].slot, 1); assert.equal(h.model().resources[0].factions[0].money, 101);
  assert.equal(h.model().context.dirty, false);
});
test('invalid resource text sends nothing; reverting input clears dirty state', async () => {
  const h = harness(); await h.load(); const before = h.calls.length;
  for (const text of ['', ' ', '-0', '1e2', '1.5', '65536', '-1', '01']) {
    h.actions.setResource('chapter#1', 0, 'reserve_inf', text); await h.actions.save();
    assert.equal(h.calls.length, before); assert.equal(h.model().editLocked, false); assert.equal(h.model().resources[0].factions[0].inputs.reserve_inf, text);
  }
  h.actions.setResource('chapter#1', 0, 'reserve_inf', '4'); h.actions.setResource('missing', 0, 'money', '5'); h.actions.setResource('chapter#1', 99, 'money', '5'); h.actions.setResource('chapter#1', 0, 'raw', '5');
  assert.equal(h.model().context.dirty, false);
});
test('lost resource save retains original inputs/key/body; query applies acknowledged patch', async () => {
  const h = harness(); await h.load(); h.actions.setResource('chapter#1', 0, 'money', '101');
  h.response(() => { throw new Error('lost'); }); await h.actions.save(); const original = structuredClone(h.calls.at(-1));
  h.actions.setResource('chapter#1', 0, 'money', '999'); assert.equal(h.model().resources[0].factions[0].inputs.money, '101');
  h.response(() => ({ state: 'failed', gameId, expectedRevision: '1', error: 'CONFLICT' })); await h.actions.query();
  h.response(() => { throw new Error('lost again'); }); await h.actions.retry(); assert.deepEqual(h.calls.at(-1), original);
  h.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } })); await h.actions.query();
  assert.equal(h.model().resources[0].factions[0].money, 101); assert.equal(h.model().context.dirty, false);
});
test('invalid resource response preserves snapshot and inputs; identity change hides them', async () => {
  const h = harness(); await h.load(); h.actions.setResource('chapter#1', 0, 'money', '101');
  const bad = receipt('2'); bad.chapters[0].factions[0].reserve_inf = null;
  h.actions.setField('revision', '2'); h.response(() => bad); await h.actions.load();
  assert.equal(h.model().context.draftRevision, '1'); assert.equal(h.model().resources[0].factions[0].inputs.money, '101');
  h.identity(null); assert.deepEqual(h.model().resources, []);
  h.identity({ user: { id: 'second', mustChangePassword: false } }); assert.deepEqual(h.model().resources, []);
});
test('chapter save includes resource inputs rather than discarding them on reload', async () => {
  const h = harness(); await h.load(); h.actions.setResource('chapter#1', 0, 'money', '101');
  h.response(() => { throw new Error('lost'); }); await h.actions.chapter('copy', 'chapter#1');
  assert.deepEqual(h.calls.at(-1).body.resourceEdits, [{ chapterId: 'chapter#1', slot: 0, values: { money: 101 } }]); assert.equal(h.calls.at(-1).options.revision, '1'); assert.equal(h.model().context.dirty, true);
});
test('chapter receipt cannot authorize stale chapter rows before exact reread', async () => {
  const h = harness(); await h.load(); h.response(() => { throw new Error('lost chapter response'); });
  await h.actions.chapter('delete', 'chapter#1');
  h.response(() => ({ state: 'committed', result: { ...game(), draftRevision: '2' } })); await h.actions.query();
  assert.equal(h.model().context.draftRevision, '2'); assert.equal(h.model().context.verified, false);
  assert.equal(h.model().editLocked, true); assert.equal(h.model().trialLocked, true); assert.equal(h.controller.savedContext(), null);
  const before = h.calls.length; await h.actions.save(); assert.equal(h.calls.length, before);
  const fresh = receipt('2'); fresh.chapters = []; h.response(() => fresh); await h.actions.load();
  assert.equal(h.model().context.verified, true); assert.deepEqual(h.model().chapters, []);
});
test('committed chapter save followed by failed reread keeps editing locked', async () => {
  const h = harness(); await h.load();
  h.response((_path, body) => { if (body) return { ...game(), draftRevision: '2' }; throw new Error('read failed'); });
  await h.actions.chapter('copy', 'chapter#1');
  assert.equal(h.model().context.draftRevision, '2'); assert.equal(h.model().editLocked, true); assert.equal(h.model().trialLocked, true);
});
test('late chapter reread after identity change must not trigger a new-session refresh', async () => {
  const h = harness(); await h.load(); let release;
  h.response((_path, body) => body ? { ...game(), draftRevision: '2' } : new Promise(resolve => { release = resolve; }));
  const pending = h.actions.chapter('copy', 'chapter#1');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const before = h.calls.length; h.identity({ user: { id: 'second', mustChangePassword: false } });
  release(receipt('2'));
  // Any unexpected refresh is made observable without leaving the test pending.
  h.response(() => ({ games: [] })); await pending;
  assert.equal(h.calls.length, before); assert.equal(h.model().context, null);
});
test('resource batch limit and resource-only Trial cancellation cannot send requests', async () => {
  let opens = 0; const h = harness({ openTrial: () => { opens++; return null; } }); await h.load();
  const many = receipt(); many.chapters = Array.from({ length: 33 }, (_, i) => ({ ...structuredClone(many.chapters[0]), chapterId: `chapter#${i}` }));
  h.response(() => many); await h.actions.load(); const before = h.calls.length;
  for (let i = 0; i < 33; i++) h.actions.setResource(`chapter#${i}`,  0, 'money', '101');
  await h.actions.save(); assert.equal(h.calls.length, before); assert.equal(h.model().editLocked, false);
  h.confirmValue = false; await h.actions.trial(); assert.equal(opens, 0); assert.equal(h.calls.length, before);
  h.actions.setResource('chapter#32', 0, 'money', '100');
  h.response(() => ({ ...game(), draftRevision: '2' })); await h.actions.save();
  assert.equal(h.calls.at(-1).body.resourceEdits.length, 32); assert.equal(h.model().context.dirty, false);
});
const windowDTO = () => ({ format: 'dragon-draft-map-window-1', gameId, draftRevision: '1', sourceDigest: 'a'.repeat(64), worldWidth: 384, worldHeight: 256, tileSize: 16, x: 382, y: 255, width: 2, height: 1, tiles: [null, 255], admission: 'display-only' });
async function windowHarness(options) {
  const h = harness(options); await h.load(); h.response(() => ({ ...receipt(), sourceDigest: 'a'.repeat(64) })); await h.actions.load(); return h;
}
const layerWindowDTO = mask => ({ ...windowDTO(), format: 'dragon-draft-map-layer-window-1', visibleLayers: Object.fromEntries(['base','decor','roads','cities'].map((name, index) => [name, mask[index] === '1'])) });
const sceneDTO = (mask = '1111') => ({ ...layerWindowDTO(mask), format: 'dragon-draft-map-scene-1', x: 0, y: 0, width: 384, height: 256, tiles: Array.from({ length: 384 * 256 }, (_, i) => i === 0 ? null : i % 256) });
test('whole display scene keeps pixels private and navigates locally at the exact loaded revision', async () => {
  const h = await windowHarness(), dto = sceneDTO(); h.response(() => dto);
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  await h.actions.mapScene(382, 255, 2, 1);
  assert.ok(h.calls.at(-1).path.endsWith('map-scene?revision=1&layers=1111'));
  assert.equal(h.model().mapWindow.localNavigation, true);
  assert.deepEqual(h.model().mapWindow.value.tiles, [254,255]);
  dto.tiles.fill(99); h.model().mapWindow.value.tiles.fill(88);
  const before = h.calls.length;
  await h.actions.mapWindowPan(-2,-1);
  assert.deepEqual(h.model().mapWindow.value.tiles, [124,125]);
  await h.actions.mapWindowPan(-999,-999);
  assert.deepEqual(h.model().mapWindow.value.tiles, [null,1]); assert.equal(h.calls.length,before);
  h.response(() => sceneDTO('1000')); await h.actions.mapWindowLayers('1000');
  assert.ok(h.calls.at(-1).path.endsWith('map-scene?revision=1&layers=1000'));
  assert.equal(h.model().mapWindow.localNavigation,true);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  assert.equal(h.model().mapWindow.localNavigation,false);
  h.response(() => sceneDTO()); await h.actions.mapScene(0,0,2,1);
  h.controller.setIdentity(null); assert.equal(h.model().mapWindow.ready,false); assert.equal(h.model().mapWindow.localNavigation,false);
  assert.equal(h.records.size,0); assert.equal(h.calls.some(call => call.body !== undefined),false); assert.deepEqual(h.errors,[]);
});
test('whole scene rejects incomplete or mismatched projections without installing a partial cache', async () => {
  const h = await windowHarness();
  for (const bad of [g => { g.tiles.pop(); }, g => { g.tiles[10] = 256; }, g => { g.sourceDigest = 'b'.repeat(64); }, g => { g.visibleLayers.base = false; }]) {
    const dto = sceneDTO(); bad(dto); h.response(() => dto); await h.actions.mapScene(0,0,2,1);
    assert.equal(h.model().mapWindow.ready,false); assert.equal(h.model().mapWindow.localNavigation,false);
  }
  const before = h.calls.length; await h.actions.mapWindowPan(1,0); assert.equal(h.calls.length,before);
});
test('layer window validates all masks and keeps private visibility through navigation without writes', async () => {
  const h = await windowHarness(); h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  h.response(() => atlasDTO()); await h.actions.mapAtlas('spring');
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  for (let bits = 0; bits < 16; bits++) {
    const mask = bits.toString(2).padStart(4,'0'); h.response(() => layerWindowDTO(mask));
    await h.actions.mapWindowLayers(mask);
    assert.deepEqual(h.model().mapWindow.value, layerWindowDTO(mask));
    assert.ok(h.calls.at(-1).path.endsWith(`map-layer-window?revision=1&x=382&y=255&width=2&height=1&layers=${mask}`));
  }
  const dto = layerWindowDTO('1000'); h.response(() => dto); await h.actions.mapWindowLayers('1000');
  dto.visibleLayers.base = false; h.model().mapWindow.value.visibleLayers.decor = true; h.controller.render();
  assert.deepEqual(h.model().mapWindow.value.visibleLayers, layerWindowDTO('1000').visibleLayers);
  h.response(() => ({ ...layerWindowDTO('1000'), x: 380 })); await h.actions.mapWindowStep(-1,0);
  assert.ok(h.calls.at(-1).path.endsWith('x=380&y=255&width=2&height=1&layers=1000'));
  h.response(() => ({ ...layerWindowDTO('1000'), x: 381 })); await h.actions.mapWindowPan(1,0);
  assert.ok(h.calls.at(-1).path.endsWith('x=381&y=255&width=2&height=1&layers=1000'));
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  assert.deepEqual(h.model().mapWindow.value, windowDTO());
  assert.equal(h.model().fields.revision,'999'); assert.equal(h.model().fields.name,'未保存');
  assert.equal(h.model().mapAtlas.ready,true); assert.equal(h.calls.filter(call => call.path.includes('/map-atlas?')).length,1);
  assert.equal(h.calls.some(call => call.body !== undefined),false); assert.equal(h.records.size,0); assert.deepEqual(h.errors,[]);
});
test('layer window rejects missing masks, mixed formats, invalid flags and late authority without old preview', async () => {
  const h = await windowHarness(), before = h.calls.length;
  await h.actions.mapWindowLayers('0000'); assert.equal(h.calls.length,before);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  const count = h.calls.length;
  for (const mask of [undefined,null,true,1111,'','111','11111','base','0002']) await h.actions.mapWindowLayers(mask);
  assert.equal(h.calls.length,count);
  for (const change of [d => { delete d.visibleLayers; }, d => { d.visibleLayers = []; }, d => { d.visibleLayers.base = 0; }, d => { d.visibleLayers.decor = true; }, d => { d.visibleLayers.extra = true; }, d => { d.format = windowDTO().format; }, d => { d.sourceDigest = 'b'.repeat(64); }]) {
    h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
    const bad = layerWindowDTO('0000'); change(bad); h.response(() => bad);
    const errors = h.errors.length; await h.actions.mapWindowLayers('0000');
    assert.equal(h.errors.length,errors+1); assert.equal(h.model().mapWindow.ready,false);
  }
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  let release; h.response(() => new Promise(resolve => { release = resolve; })); const pending = h.actions.mapWindowLayers('0000');
  assert.equal(h.model().mapWindow.ready,false); const calls = h.calls.length;
  await h.actions.mapWindowLayers('1111'); assert.equal(h.calls.length,calls);
  h.current().version = 'retired'; release(layerWindowDTO('0000')); await pending;
  assert.equal(h.model().mapWindow.ready,false); assert.equal(h.records.size,0);
});
test('map window uses exact loaded identity, preserves unknowns and owns its display projection', async () => {
  const h = await windowHarness(), dto = windowDTO(); h.response(() => dto);
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '99');
  await h.actions.mapWindow(382, 255, 2, 1);
  assert.match(h.calls.at(-1).path, /revision=1&x=382&y=255&width=2&height=1$/);
  assert.equal(h.calls.at(-1).body, undefined); assert.equal(h.records.size, 0);
  assert.deepEqual(h.model().mapWindow.value, dto); assert.equal(h.model().fields.name, '未保存');
  dto.tiles[0] = 0; h.model().mapWindow.value.tiles[1] = 0; h.controller.render();
  assert.deepEqual(h.model().mapWindow.value.tiles, [null, 255]); assert.deepEqual(h.errors, []);
  h.response(() => ({ games: [game(), game(otherId)] })); await h.actions.refresh();
  assert.equal(h.model().mapWindow.ready, true); // Unrelated list reads do not retire an installed same-revision window.
  h.current().version = 'changed'; h.controller.render(); assert.equal(h.model().mapWindow.value, null);
});
test('map window rejects malformed rectangles and responses without retaining an earlier preview', async () => {
  const h = await windowHarness(); h.response(windowDTO); await h.actions.mapWindow(382, 255, 2, 1);
  const count = h.calls.length;
  for (const rect of [[0,0,0,1],[0,0,33,1],[383,255,2,1],[-0,0,1,1],[0,0,1.5,1],['0',0,1,1]]) await h.actions.mapWindow(...rect);
  assert.equal(h.calls.length, count);
  for (const change of [d => { d.gameId = otherId; }, d => { d.draftRevision = '2'; }, d => { d.sourceDigest = 'b'.repeat(64); }, d => { d.x = 381; }, d => { d.admission = 'ready'; }, d => { d.extra = 1; }, d => { d.tiles = Array(2); }, d => { d.tiles = [-0,255]; }, d => { d.tiles = [256,255]; }, d => { d.tiles.pop(); }]) {
    const bad = windowDTO(); change(bad); h.response(() => bad); await h.actions.mapWindow(382,255,2,1);
    assert.equal(h.model().mapWindow.ready, false); assert.equal(h.model().mapWindow.value, null);
  }
  assert.equal(h.errors.length, 16); assert.equal(h.records.size, 0);
});
test('late map windows cannot cross identity/version boundaries and pending saves disable reads', async () => {
  for (const mode of ['logout','version','user']) {
    const h = await windowHarness(); let release;
    h.response(() => new Promise(resolve => { release = resolve; }));
    const pending = h.actions.mapWindow(382,255,2,1);
    if (mode === 'logout') h.identity(null);
    else if (mode === 'version') h.current().version = 'changed';
    else h.current().user.id = 'other';
    release(windowDTO()); await pending; assert.equal(h.model().mapWindow.ready, false); assert.equal(h.model().mapWindow.value, null);
  }
  const h = await windowHarness(); h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  h.actions.setField('name','修改'); h.response(() => { throw new Error('owned lost response'); }); await h.actions.save();
  const count = h.calls.length; await h.actions.mapWindow(382,255,2,1);
  assert.equal(h.calls.length,count); assert.equal(h.model().mapWindow.value,null); assert.equal(h.model().context.pending,true);
  const missing = harness(); await missing.load(); const before = missing.calls.length; await missing.actions.mapWindow(0,0,1,1); assert.equal(missing.calls.length,before);
});
test('window navigation uses private read rectangle, clamps whole windows and never writes or rereads the atlas', async () => {
  const h = await windowHarness(); h.response(() => atlasDTO()); await h.actions.mapAtlas('spring');
  h.response(path => {
    const query = new URL(path, 'https://owned.invalid').searchParams;
    const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(key => Number(query.get(key)));
    return { ...windowDTO(), x, y, width, height, tiles: Array(width * height).fill(7) };
  });
  await h.actions.mapWindow(350, 230, 32, 20);
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存導航');
  h.model().mapWindow.value.x = 0; // Published projection is not navigation authority.
  const initial = h.calls.length;
  for (const [dx, dy, x, y] of [[1,0,352,230],[0,1,352,236],[-1,0,320,236],[0,-1,320,216]]) {
    await h.actions.mapWindowStep(dx, dy);
    assert.match(h.calls.at(-1).path, new RegExp(`revision=1&x=${x}&y=${y}&width=32&height=20$`));
    assert.equal(h.model().mapAtlas.ready, true); assert.equal(h.model().mapWindow.value.x, x);
  }
  assert.equal(h.calls.length, initial + 4);
  await h.actions.mapWindow(352, 236, 32, 20); const edge = h.calls.length;
  await h.actions.mapWindowStep(1, 0); await h.actions.mapWindowStep(0, 1);
  assert.equal(h.calls.length, edge); assert.equal(h.model().mapWindow.ready, true);
  await h.actions.mapWindow(0, 0, 32, 20); const origin = h.calls.length;
  await h.actions.mapWindowStep(-1, 0); await h.actions.mapWindowStep(0, -1);
  assert.equal(h.calls.length, origin);
  assert.equal(h.model().fields.revision, '999'); assert.equal(h.model().fields.name, '未保存導航');
  assert.equal(h.records.size, 0); assert.ok(h.calls.every(call => call.body === undefined)); assert.deepEqual(h.errors, []);
});
test('window navigation rejects invalid directions, unready context and late results', async () => {
  const absent = await windowHarness(), absentCount = absent.calls.length;
  await absent.actions.mapWindowStep(1, 0); assert.equal(absent.calls.length, absentCount);
  const h = await windowHarness(); h.response(windowDTO); await h.actions.mapWindow(382, 255, 2, 1);
  const count = h.calls.length;
  for (const direction of [[0,0],[1,1],[2,0],[-0,1],[0.5,0],['1',0],[NaN,0],[undefined,1]]) await h.actions.mapWindowStep(...direction);
  assert.equal(h.calls.length, count); assert.equal(h.model().mapWindow.ready, true);
  for (const mode of ['logout', 'version', 'user', 'context']) {
    const delayed = await windowHarness(); delayed.response(windowDTO); await delayed.actions.mapWindow(382,255,2,1);
    let release; delayed.response(() => new Promise(resolve => { release = resolve; }));
    const pending = delayed.actions.mapWindowStep(-1,0); assert.equal(delayed.model().mapWindow.ready, false);
    const calls = delayed.calls.length; await delayed.actions.mapWindowStep(0,-1); assert.equal(delayed.calls.length,calls);
    if (mode === 'logout') delayed.identity(null);
    else if (mode === 'version') delayed.current().version = 'changed';
    else if (mode === 'user') delayed.current().user.id = 'other';
    else delayed.controller.adoptGame(otherId);
    release({ ...windowDTO(), x: 380 }); await pending;
    assert.equal(delayed.model().mapWindow.value, null); assert.equal(delayed.records.size, 0);
  }
  h.response(() => ({ ...windowDTO(), x: 381 })); await h.actions.mapWindowStep(-1,0);
  assert.equal(h.model().mapWindow.ready, false);
});
test('window pan uses integer grid deltas, private rectangle and saved revision without writes', async () => {
  const h = await selectionHarness(); h.response(() => atlasDTO()); await h.actions.mapAtlas('spring');
  h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  h.response(path => {
    const query = new URL(path,'https://owned.invalid').searchParams;
    const [x,y,width,height] = ['x','y','width','height'].map(key => Number(query.get(key)));
    return { ...windowDTO(), x,y,width,height,tiles:Array(width*height).fill(7) };
  });
  await h.actions.mapWindow(350,230,32,20);
  h.actions.setField('revision','999'); h.actions.setField('name','未保存平移');
  h.model().mapWindow.value.x = 0; h.model().mapWindow.value.width = 1;
  const count = h.calls.length;
  for (const [dx,dy,x,y] of [[-2,-3,348,227],[7,9,352,236],[-500,-500,0,0],[3,4,3,4]]) {
    await h.actions.mapWindowPan(dx,dy);
    assert.ok(h.calls.at(-1).path.endsWith(`revision=1&x=${x}&y=${y}&width=32&height=20`));
    assert.equal(h.model().mapAtlas.ready,true); assert.equal(h.model().mapWindow.value.x,x);
    assert.deepEqual(h.model().decorationSelection.selectedIds,['a','c']);
  }
  assert.equal(h.calls.length,count+4);
  const still = h.calls.length; await h.actions.mapWindowPan(0,0); assert.equal(h.calls.length,still);
  await h.actions.mapWindowPan(-500,-500); const edge = h.calls.length;
  await h.actions.mapWindowPan(-1,-2); assert.equal(h.calls.length,edge);
  assert.equal(h.model().fields.revision,'999'); assert.equal(h.model().fields.name,'未保存平移');
  assert.equal(h.records.size,0); assert.ok(h.calls.every(call=>call.body===undefined)); assert.deepEqual(h.errors,[]);
});
test('window pan rejects invalid or unready inputs and retires delayed responses', async () => {
  const absent = await windowHarness(), before = absent.calls.length;
  await absent.actions.mapWindowPan(1,1); assert.equal(absent.calls.length,before);
  const h = await windowHarness(); h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  const count = h.calls.length;
  for (const delta of [[-0,1],[0.5,0],['1',0],[NaN,0],[Infinity,1],[Number.MAX_SAFE_INTEGER+1,0],[undefined,1]]) await h.actions.mapWindowPan(...delta);
  assert.equal(h.calls.length,count); assert.equal(h.model().mapWindow.ready,true);
  for (const mode of ['logout','version','user','context']) {
    const d = await windowHarness(); d.response(windowDTO); await d.actions.mapWindow(382,255,2,1);
    let release; d.response(()=>new Promise(resolve=>{release=resolve;}));
    const pending = d.actions.mapWindowPan(-1,-1); assert.equal(d.model().mapWindow.ready,false);
    const calls = d.calls.length; await d.actions.mapWindowPan(-1,0); assert.equal(d.calls.length,calls);
    if(mode==='logout') d.identity(null);
    else if(mode==='version') d.current().version='retired';
    else if(mode==='user') d.current().user.id='other';
    else d.controller.adoptGame(otherId);
    release({...windowDTO(),x:381,y:254}); await pending;
    assert.equal(d.model().mapWindow.value,null); assert.equal(d.records.size,0);
  }
  h.response(()=>({...windowDTO(),x:381})); await h.actions.mapWindowPan(-1,-1);
  assert.equal(h.model().mapWindow.ready,false);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  h.actions.setField('name','未確認寫入'); h.response(()=>{throw new Error('owned save response lost');}); await h.actions.save();
  const blocked = h.calls.length, journal = [...h.records];
  await h.actions.mapWindowPan(-1,0);
  assert.equal(h.calls.length,blocked); assert.deepEqual([...h.records],journal);
});
function atlasDTO(season = 'spring') {
  const pixels = new Uint8Array(256 * 256 * 4).fill(255);
  pixels[0] = 17;
  return { format: 'dragon-draft-map-atlas-1', gameId, draftRevision: '1', sourceDigest: 'a'.repeat(64), season,
    width: 256, height: 256, tileSize: 16, pixelFormat: 'rgba8', assetSha256: 'b'.repeat(64), pixelsSha256: createHash('sha256').update(pixels).digest('hex'), pixelsHex: Buffer.from(pixels).toString('hex'), admission: 'display-only' };
}
test('atlas explicitly binds season and loaded revision; pixels never enter the display projection', async () => {
  const h = await windowHarness(); h.actions.setField('revision','99'); h.actions.setField('name','未保存');
  for (const season of ['spring','summer','autumn','winter']) {
    const dto = atlasDTO(season); h.response(() => dto); await h.actions.mapAtlas(season);
    assert.match(h.calls.at(-1).path, new RegExp(`revision=1&season=${season}$`));
    assert.equal(h.calls.at(-1).body, undefined); assert.equal(h.model().mapAtlas.ready, true);
    assert.deepEqual(h.model().mapAtlas.info, { gameId, draftRevision: '1', sourceDigest: dto.sourceDigest, season, assetSha256: dto.assetSha256, pixelsSha256: dto.pixelsSha256 });
    dto.pixelsHex = ''; h.model().mapAtlas.info.season = 'forged'; h.controller.render(); assert.equal(h.model().mapAtlas.info.season,season);
    assert.equal(JSON.stringify(h.model()).includes('pixelsHex'),false);
  }
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  assert.equal(h.model().mapAtlas.ready,true); assert.equal(h.model().mapWindow.ready,true);
  h.response(() => ({ games: [game()] })); await h.actions.refresh(); assert.equal(h.model().mapAtlas.ready,true);
  assert.equal(h.model().fields.name,'未保存'); assert.equal(h.records.size,0); assert.deepEqual(h.errors,[]);
  h.current().version = 'changed'; h.controller.render(); assert.equal(h.model().mapAtlas.info,null);
});
test('atlas rejects malformed identities, payloads, transparency and wrong SHA without retaining old pixels', async () => {
  const h = await windowHarness(); h.response(() => atlasDTO()); await h.actions.mapAtlas('spring');
  const count = h.calls.length;
  for (const season of [undefined,null,'','Spring','../spring']) await h.actions.mapAtlas(season);
  assert.equal(h.calls.length,count);
  for (const change of [d => { d.gameId = otherId; }, d => { d.draftRevision = '2'; }, d => { d.sourceDigest = 'c'.repeat(64); }, d => { d.season = 'summer'; }, d => { d.admission = 'ready'; }, d => { d.width = 512; }, d => { d.pixelFormat = 'rgb8'; }, d => { d.assetSha256 = 'bad'; }, d => { d.pixelsHex = d.pixelsHex.slice(2); }, d => { d.pixelsHex = `GG${d.pixelsHex.slice(2)}`; }, d => { d.pixelsHex = `${d.pixelsHex.slice(0,6)}00${d.pixelsHex.slice(8)}`; }, d => { d.pixelsSha256 = 'f'.repeat(64); }, d => { d.extra = true; }]) {
    const dto = atlasDTO(); change(dto); h.response(() => dto); await h.actions.mapAtlas('spring');
    assert.equal(h.model().mapAtlas.ready,false); assert.equal(h.model().mapAtlas.info,null);
  }
  assert.equal(h.errors.length,18); assert.equal(h.records.size,0);
});
test('atlas discards late HTTP and digest responses; unresolved saves and missing source prohibit reads', async () => {
  const late = await windowHarness(); let release;
  late.response(() => new Promise(resolve => { release = resolve; })); const reading = late.actions.mapAtlas('spring');
  late.identity(null); release(atlasDTO()); await reading; assert.equal(late.model().mapAtlas.info,null);
  let finishDigest;
  const h = await windowHarness({ digestPixels: () => new Promise(resolve => { finishDigest = resolve; }) });
  const dto = atlasDTO(); h.response(() => dto); const hashing = h.actions.mapAtlas('spring');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof finishDigest,'function');
  h.current().version = 'changed'; finishDigest(dto.pixelsSha256); await hashing; assert.equal(h.model().mapAtlas.info,null);
  const save = await windowHarness(); save.response(() => atlasDTO()); await save.actions.mapAtlas('spring');
  save.actions.setField('name','修改'); save.response(() => { throw new Error('owned response lost'); }); await save.actions.save();
  const count = save.calls.length; await save.actions.mapAtlas('spring'); assert.equal(save.calls.length,count); assert.equal(save.model().mapAtlas.info,null);
  const missing = harness(); await missing.load(); const before = missing.calls.length; await missing.actions.mapAtlas('spring'); assert.equal(missing.calls.length,before);
});
function canvasFixture() {
  const state = { frame: null, draws: 0, clears: 0 };
  const context = { clearRect() { state.frame = null; state.clears++; },
    createImageData(width,height) { return { width,height,data:new Uint8ClampedArray(width*height*4) }; },
    putImageData(image,x,y) { assert.equal(x,0); assert.equal(y,0); state.frame = { ...image, data: image.data.slice() }; state.draws++; } };
  return { state, canvas: { width: 1, height: 1, getContext: type => { assert.equal(type,'2d'); return context; } } };
}
test('local pan previews pixels without changing the confirmed window or publishing form models', async () => {
  const f=canvasFixture(), h=await windowHarness({ getMapWindowCanvas:()=>f.canvas });
  assert.equal(h.actions.previewMapWindowPan(1,0),null);
  h.response(()=>sceneDTO()); await h.actions.mapScene(382,255,2,1);
  h.response(()=>atlasDTO()); await h.actions.mapAtlas('spring');
  h.actions.setField('revision','999'); h.actions.setField('name','未保存');
  const model=h.model(), before=structuredClone(model), pixels=f.state.frame.data.slice(), calls=h.calls.length;
  assert.deepEqual(h.actions.previewMapWindowPan(-382,-255),{x:0,y:0});
  assert.deepEqual([...f.state.frame.data.slice(0,4)],[96,96,96,255]);
  assert.equal(h.model(),model); assert.deepEqual(h.model(),before);
  assert.deepEqual(h.actions.previewMapWindowPan(999,999),{x:382,y:255});
  assert.deepEqual(f.state.frame.data,pixels);
  assert.throws(()=>h.actions.previewMapWindowPan(0.5,0),/安全整數/);
  h.actions.previewMapWindowPan(-382,-255); h.actions.redrawMapWindow();
  assert.deepEqual(f.state.frame.data,pixels); assert.equal(h.calls.length,calls); assert.equal(h.records.size,0);
  await h.actions.mapWindowPan(-382,-255);
  assert.equal(h.model().mapWindow.value.x,0); assert.equal(h.model().mapWindow.value.y,0);
  assert.equal(h.model().fields.name,'未保存'); assert.equal(h.model().fields.revision,'999'); assert.equal(h.calls.length,calls);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  assert.equal(h.actions.previewMapWindowPan(-2,0),null);
  h.identity(null); assert.equal(h.actions.previewMapWindowPan(1,0),null); assert.equal(f.state.frame,null);
  assert.deepEqual(h.errors,[]);
});
test('canvas known tiles equal the shared pixel window row stream for every atlas tile', async () => {
  const f = canvasFixture(), h = await windowHarness({ getMapWindowCanvas: () => f.canvas });
  const tiles = Array.from({ length: 256 }, (_,index) => index), dto = { ...windowDTO(),x:100,y:200,width:16,height:16,tiles };
  h.response(() => dto); await h.actions.mapWindow(100,200,16,16); assert.equal(f.state.frame,null);
  const pixels = Uint8Array.from({ length:256*256*4 }, (_,index) => {
    const x = Math.floor(index/4)%256, y = Math.floor(index/1024);
    if (index%4 === 3) return 255; if (index%4 === 0) return x; if (index%4 === 1) return y; return x^y;
  });
  const atlas = { ...atlasDTO(),pixelsHex:Buffer.from(pixels).toString('hex'),pixelsSha256:createHash('sha256').update(pixels).digest('hex') };
  h.response(() => atlas); await h.actions.mapAtlas('spring');
  const plane = new Uint8Array(384*256);
  for (let row=0;row<16;row++) plane.set(tiles.slice(row*16,row*16+16),(200+row)*384+100);
  const expected = Buffer.concat([...createFixedTileWindowRows(plane,pixels,{x:1600,y:3200,width:256,height:256})]);
  assert.deepEqual(Buffer.from(f.state.frame.data),expected); assert.equal(f.canvas.width,256); assert.equal(f.canvas.height,256);
  const count=h.calls.length; f.state.frame.data.fill(0); h.actions.redrawMapWindow();
  assert.deepEqual(Buffer.from(f.state.frame.data),expected); assert.equal(h.calls.length,count); assert.deepEqual(h.errors,[]); assert.equal(h.records.size,0);
});
test('canvas unknown checkerboard is only a display placeholder; delayed mount and identity retirement are read-only', async () => {
  const f=canvasFixture(); let mounted=false;
  const h=await windowHarness({ getMapWindowCanvas:()=>mounted?f.canvas:null });
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1); h.response(()=>atlasDTO()); await h.actions.mapAtlas('spring');
  assert.equal(f.state.draws,0); const count=h.calls.length; mounted=true; h.actions.redrawMapWindow();
  assert.equal(f.canvas.width,32); assert.equal(f.canvas.height,16);
  assert.deepEqual([...f.state.frame.data.slice(0,4)],[96,96,96,255]);
  assert.deepEqual([...f.state.frame.data.slice(32,36)],[160,160,160,255]);
  assert.deepEqual([...f.state.frame.data.slice(64,68)],[255,255,255,255]);
  assert.deepEqual(h.model().mapWindow.value.tiles,[null,255]); h.model().mapWindow.value.tiles[0]=0;
  h.actions.redrawMapWindow(); assert.deepEqual([...f.state.frame.data.slice(0,4)],[96,96,96,255]); assert.equal(h.calls.length,count);
  const actor=h.current(); h.identity(null); assert.equal(f.state.frame,null); h.identity(actor); h.actions.redrawMapWindow(); assert.equal(f.state.frame,null);
  assert.equal(h.records.size,0); assert.deepEqual(h.errors,[]);
});
test('canvas clears immediately during reads, on corrupt atlas, and on an unresolved save', async () => {
  const f=canvasFixture(), h=await windowHarness({ getMapWindowCanvas:()=>f.canvas });
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1); h.response(()=>atlasDTO()); await h.actions.mapAtlas('spring'); assert.ok(f.state.frame);
  let release; h.response(()=>new Promise(resolve=>{release=resolve;})); const pending=h.actions.mapWindow(382,255,2,1);
  assert.equal(f.state.frame,null); release(windowDTO()); await pending; assert.ok(f.state.frame);
  h.response(()=>({...atlasDTO(),pixelsSha256:'f'.repeat(64)})); await h.actions.mapAtlas('spring'); assert.equal(f.state.frame,null);
  h.response(()=>atlasDTO()); await h.actions.mapAtlas('spring'); assert.ok(f.state.frame);
  h.actions.setField('name','修改'); h.response(()=>{assert.equal(f.state.frame,null);throw new Error('owned lost response');}); await h.actions.save();
  assert.equal(f.state.frame,null); h.actions.redrawMapWindow(); assert.equal(f.state.frame,null); assert.equal(h.model().context.pending,true);
});
const selectionDraft = () => ({ ...receipt(), sourceDigest: 'a'.repeat(64),
  materialDefinitions: [{ materialId: 'raw', name: null, cellCount: 1, authorEditable: false, references: ['裝飾:a', '裝飾:b', '裝飾:c'] }],
  decorationInstances: ['a', 'b', 'c'].map(instanceId => ({ instanceId, materialId: 'raw', x: 0, y: 0 })) });
test('instance anchor navigation uses the private saved list without edits and drops late identity results', async () => {
  let scrolls = 0;
  const h = await windowHarness({ getMapWindowCanvas: () => ({ getContext: () => null, scrollIntoView: () => { scrolls++; } }) });
  const dto = selectionDraft(); dto.decorationInstances[0].x = 383; dto.decorationInstances[0].y = 255;
  h.response(() => dto); await h.actions.load();
  const beforeWindow = h.calls.length; await h.actions.locateInstance('a');
  assert.equal(h.calls.length, beforeWindow); assert.equal(scrolls, 0); assert.equal(h.errors.length, 1);
  dto.decorationInstances[0].x = 12; h.model().materials.instances[0].y = 10;
  h.response(() => sceneDTO()); await h.actions.mapScene(100, 100, 4, 3);
  h.actions.decorLock(true); h.actions.mapLayer('cities'); h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  const calls = h.calls.length, prompts = h.confirmations.length;
  await h.actions.locateInstance('a');
  assert.deepEqual([h.model().mapWindow.value.x, h.model().mapWindow.value.y], [380, 253]);
  assert.equal(h.model().mapWindow.value.draftRevision, '1'); assert.equal(h.model().workspace.layer, 'cities');
  assert.equal(h.model().materials.decorationLocked, true); assert.equal(h.model().fields.name, '未保存');
  await h.actions.locateInstance('b');
  assert.deepEqual([h.model().mapWindow.value.x, h.model().mapWindow.value.y], [0, 0]);
  await h.actions.locateInstance('missing');
  assert.equal(h.errors.length, 2); assert.equal(scrolls, 2); assert.equal(h.calls.length, calls);
  assert.equal(h.confirmations.length, prompts); assert.equal(h.records.size, 0);
  h.response(() => ({ ...windowDTO(), x: 0, y: 0, width: 4, height: 3, tiles: Array(12).fill(20) }));
  await h.actions.mapWindow(0, 0, 4, 3);
  h.response(() => ({ ...windowDTO(), x: 380, y: 253, width: 4, height: 3, tiles: Array(12).fill(20) }));
  await h.actions.locateInstance('a'); assert.equal(scrolls, 3);
  assert.ok(h.calls.at(-1).path.endsWith('map-window?revision=1&x=380&y=253&width=4&height=3'));
  let release;
  h.response(() => new Promise(resolve => { release = resolve; }));
  const pending = h.actions.locateInstance('b');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  h.identity({ user: { id: 'second', mustChangePassword: false } });
  release({ ...windowDTO(), x: 0, y: 0, width: 4, height: 3, tiles: Array(12).fill(20) }); await pending;
  assert.equal(scrolls, 3); assert.equal(h.model().mapWindow.ready, false); assert.equal(h.records.size, 0);
});
test('minimap navigation needs the same saved preview, preserves edits and supports local or HTTP windows', async () => {
  let scrolls = 0;
  const h = await windowHarness({ getMapWindowCanvas: () => ({ getContext: () => null, scrollIntoView: () => { scrolls++; } }) });
  const before = h.calls.length; await h.actions.locateMinimapCell(0, 0);
  assert.equal(h.calls.length, before); assert.equal(scrolls, 0);
  h.response(() => sceneDTO()); await h.actions.mapScene(100, 100, 4, 3);
  await h.actions.locateMinimapCell(0, 0); assert.equal(h.errors.length, 2);
  const pixels = Buffer.alloc(250 * 167 * 3);
  h.response(() => ({ format: 'dragon-draft-minimap-1', gameId, draftRevision: '1', sourceDigest: 'a'.repeat(64), styleRevision: 'minimap-style-2-bands-dither', textureSeed: 1, width: 250, height: 167, pixelFormat: 'rgb8', pixelsSha256: createHash('sha256').update(pixels).digest('hex'), pixelsHex: pixels.toString('hex') }));
  await h.actions.minimap(); assert.equal(h.model().minimap.ready, true);
  h.actions.mapLayer('cities'); h.actions.decorLock(true); h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  const calls = h.calls.length;
  await h.actions.locateMinimapCell(383, 255);
  assert.deepEqual([h.model().mapWindow.value.x, h.model().mapWindow.value.y], [380, 253]);
  await h.actions.locateMinimapCell(0, 0);
  assert.deepEqual([h.model().mapWindow.value.x, h.model().mapWindow.value.y], [0, 0]);
  for (const [x, y] of [[384,0],[0,256],[NaN,0],[0.5,0],[-0,0]]) await h.actions.locateMinimapCell(x, y);
  assert.equal(h.errors.length, 7); assert.equal(scrolls, 2); assert.equal(h.calls.length, calls);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().fields.revision, '999'); assert.equal(h.model().workspace.layer, 'cities'); assert.equal(h.model().materials.decorationLocked, true);
  assert.equal(h.confirmations.length, 0); assert.equal(h.records.size, 0);
  h.response(() => ({ ...windowDTO(), x: 0, y: 0, width: 4, height: 3, tiles: Array(12).fill(20) })); await h.actions.mapWindow(0, 0, 4, 3);
  h.response(() => ({ ...windowDTO(), x: 380, y: 253, width: 4, height: 3, tiles: Array(12).fill(20) })); await h.actions.locateMinimapCell(383, 255);
  assert.ok(h.calls.at(-1).path.endsWith('map-window?revision=1&x=380&y=253&width=4&height=3')); assert.equal(scrolls, 3);
  let release; h.response(() => new Promise(resolve => { release = resolve; })); const pending = h.actions.locateMinimapCell(0, 0);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  h.identity(null); release({ ...windowDTO(), x: 0, y: 0, width: 4, height: 3, tiles: Array(12).fill(20) }); await pending;
  assert.equal(scrolls, 3); assert.equal(h.model().minimap.ready, false); assert.equal(h.model().mapWindow.ready, false); assert.equal(h.records.size, 0);
});
const selectionDTO = () => ({ format: 'dragon-draft-decoration-selection-1', gameId, draftRevision: '1', sourceDigest: 'a'.repeat(64), worldWidth: 384, worldHeight: 256, tileSize: 16,
  x: 0, y: 0, width: 384, height: 256, instanceIds: ['a', 'c'], admission: 'display-only' });
async function selectionHarness() {
  const h = harness(); await h.load(); h.response(selectionDraft); await h.actions.load(); return h;
}
test('decoration selection uses saved identity, owns ordered IDs and never writes or changes inputs', async () => {
  const h = await selectionHarness(), dto = selectionDTO();
  h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  h.response(windowDTO); await h.actions.mapWindow(382, 255, 2, 1);
  h.response(() => dto); await h.actions.decorationSelection(0, 0, 384, 256);
  assert.deepEqual(h.model().mapWindow.value, windowDTO());
  assert.equal(h.model().decorationSelection.ready, true);
  assert.deepEqual(h.model().decorationSelection.value, dto);
  assert.ok(h.calls.at(-1).path.endsWith('/decoration-selection?revision=1&x=0&y=0&width=384&height=256'));
  dto.instanceIds.push('b'); h.model().decorationSelection.value.instanceIds.length = 0; h.controller.render();
  assert.deepEqual(h.model().decorationSelection.value.instanceIds, ['a', 'c']);
  const count = h.calls.length; h.controller.render(); assert.equal(h.calls.length, count);
  assert.equal(h.model().fields.revision, '999'); assert.equal(h.model().fields.name, '未保存');
  h.response(() => ({ ...selectionDTO(), instanceIds: [] })); await h.actions.decorationSelection(0, 0, 384, 256);
  assert.deepEqual(h.model().decorationSelection.value.instanceIds, []);
  assert.equal(h.calls.some(call => call.body !== undefined), false); assert.equal(h.records.size, 0); assert.deepEqual(h.errors, []);
});
test('single-cell decoration pick retains complete overlap response but selects only its last ordered instance', async () => {
  const h = await selectionHarness(); h.actions.setField('revision', '999'); h.actions.setField('name', '未保存');
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  const dto = { ...selectionDTO(), x:382,y:255,width:1,height:1 };
  h.response(() => dto); await h.actions.decorationPick(382,255);
  assert.ok(h.calls.at(-1).path.endsWith('decoration-selection?revision=1&x=382&y=255&width=1&height=1'));
  assert.deepEqual(h.model().decorationSelection.value.instanceIds,['a','c']);
  assert.deepEqual(h.model().decorationSelection.selectedIds,['c']);
  h.confirmValue = false; assert.equal(h.actions.takeDecorationSelection(),null);
  h.confirmValue = true; assert.deepEqual(h.actions.takeDecorationSelection(),['c']);
  h.response(() => ({...dto,instanceIds:[]})); await h.actions.decorationPick(382,255);
  assert.deepEqual(h.model().decorationSelection.selectedIds,[]); assert.equal(h.actions.takeDecorationSelection(),null);
  assert.equal(h.model().fields.revision,'999'); assert.equal(h.model().fields.name,'未保存');
  assert.equal(h.records.size,0); assert.equal(h.calls.some(call=>call.body!==undefined),false);
});
test('single-cell pick rejects locked/outside/malformed requests and lock changes during its read', async () => {
  const h = await selectionHarness(); let count = h.calls.length;
  await h.actions.decorationPick(0,0); assert.equal(h.calls.length,count);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1); count=h.calls.length;
  await h.actions.decorationPick(381,255); await h.actions.decorationSelection(382,255,2,1,'top');
  h.actions.decorLock(true); await h.actions.decorationPick(382,255); assert.equal(h.calls.length,count);
  h.actions.decorLock(false);
  const dto = {...selectionDTO(),x:382,y:255,width:1,height:1};
  h.response(()=>({...dto,instanceIds:['c','a']})); await h.actions.decorationPick(382,255);
  assert.equal(h.model().decorationSelection.ready,false);
  let release; h.response(()=>new Promise(resolve=>{release=resolve;})); const pending=h.actions.decorationPick(382,255);
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  h.actions.decorLock(true); release(dto); await pending;
  assert.equal(h.model().decorationSelection.ready,false); assert.equal(h.records.size,0);
});
test('clearing the completed window selection is local, preserves other state and resets append history', async () => {
  const h = await selectionHarness();
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  const before = structuredClone(h.model()), count = h.calls.length, confirmations = h.confirmations.length;
  h.busy(true); h.actions.clearDecorationSelection(); h.controller.render();
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['a','c']);
  h.busy(false); h.actions.decorLock(true); h.actions.clearDecorationSelection();
  assert.equal(h.model().decorationSelection.ready, false);
  assert.equal(h.model().decorationSelection.value, null);
  assert.equal(h.model().decorationSelection.selectedIds, null);
  assert.equal(h.actions.takeDecorationSelection(), null);
  h.actions.clearDecorationSelection();
  assert.equal(h.calls.length, count); assert.equal(h.confirmations.length, confirmations); assert.equal(h.records.size, 0);
  assert.deepEqual(h.model().fields, before.fields); assert.deepEqual(h.model().mapWindow, before.mapWindow);
  assert.deepEqual(h.model().context, before.context); assert.equal(h.model().materials.decorationLocked, true);
  h.actions.decorLock(false);
  h.response(() => ({...selectionDTO(), instanceIds:['b']})); await h.actions.decorationSelection(0,0,384,256,'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['b']);
  h.response(() => ({...selectionDTO(), instanceIds:[]})); await h.actions.decorationSelection(0,0,384,256);
  h.actions.clearDecorationSelection(); assert.equal(h.model().decorationSelection.ready, false);
  assert.equal(h.calls.some(call => call.body !== undefined), false); assert.equal(h.records.size, 0); assert.deepEqual(h.errors, []);
});
test('explicit selection transfer returns an isolated saved-revision set without requests or commands', async () => {
  const h = await selectionHarness();
  assert.equal(h.actions.takeDecorationSelection(), null);
  h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  h.actions.setField('name', '未保存'); h.actions.setField('revision', '999');
  const count = h.calls.length;
  h.confirmValue = false; assert.equal(h.actions.takeDecorationSelection(), null);
  h.confirmValue = true; const ids = h.actions.takeDecorationSelection();
  assert.deepEqual(ids, ['a','c']); assert.match(h.confirmations.at(-1), /修訂 1/);
  assert.match(h.confirmations.at(-1), /包含頁外勾選/);
  ids.push('forged'); h.model().decorationSelection.selectedIds.length = 0;
  assert.deepEqual(h.actions.takeDecorationSelection(), ['a','c']);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().fields.revision, '999');
  h.response(() => ({ ...selectionDTO(), instanceIds: [] })); await h.actions.decorationSelection(0,0,384,256);
  const dialogs = h.confirmations.length; assert.equal(h.actions.takeDecorationSelection(), null); assert.equal(h.confirmations.length, dialogs);
});
test('selection transfer confirmation cannot survive changed authority, source, busy state or selection', async () => {
  for (const change of ['logout','version','id','password','game','aba','busy','selection']) {
    const h = await selectionHarness(); h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
    let pending, release;
    h.confirmValue = () => {
      if (change === 'logout') h.identity(null);
      else if (change === 'version') h.current().version = 'changed';
      else if (change === 'id') h.current().user.id = 'changed';
      else if (change === 'password') h.current().user.mustChangePassword = true;
      else if (change === 'game') h.controller.adoptGame(otherId);
      else if (change === 'aba') { const actor = h.current(); h.identity(null); h.identity(actor); }
      else if (change === 'busy') h.busy(true);
      else { h.response(() => new Promise(resolve => { release = resolve; })); pending = h.actions.decorationSelection(0,0,384,256); }
      return true;
    };
    assert.equal(h.actions.takeDecorationSelection(), null, change);
    if (pending) { release(selectionDTO()); await pending; }
    assert.equal(h.calls.some(call => call.body !== undefined), false); assert.equal(h.records.size, 0);
  }
});
test('append selection keeps a separate ordered union, not a forged last rectangle result', async () => {
  const h = await selectionHarness();
  const read = async (ids, x, mode) => { h.response(() => ({ ...selectionDTO(), x, width: 1, height: 1, instanceIds: ids })); await h.actions.decorationSelection(x,0,1,1,mode); };
  await read(['c'], 1, 'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['c']);
  h.response(windowDTO); await h.actions.mapWindow(382,255,2,1);
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['c']);
  await read(['a','b'], 2, 'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['a','b','c']);
  assert.deepEqual(h.model().decorationSelection.value.instanceIds, ['a','b']);
  assert.equal(h.model().decorationSelection.value.x, 2);
  h.model().decorationSelection.selectedIds.length = 0; h.controller.render();
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['a','b','c']);
  await read(['b'], 3, 'append'); await read([], 4, 'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['a','b','c']);
  await read(['b'], 5, 'replace');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['b']);
  await read([], 6); assert.deepEqual(h.model().decorationSelection.selectedIds, []);
  const count = h.calls.length;
  for (const mode of [null, true, '', 'union']) await h.actions.decorationSelection(0,0,1,1,mode);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  assert.equal(h.calls.some(call => call.body !== undefined), false);
});
test('failed or retired append cannot revive old selection or carry it into a reread', async () => {
  const h = await selectionHarness(); h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  h.response(() => ({ ...selectionDTO(), instanceIds: ['foreign'] }));
  await h.actions.decorationSelection(0,0,384,256,'append');
  assert.equal(h.model().decorationSelection.ready, false); assert.equal(h.model().decorationSelection.selectedIds, null);
  h.response(() => ({ ...selectionDTO(), instanceIds: ['b'] })); await h.actions.decorationSelection(0,0,384,256,'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['b']);
  h.response(() => { throw new Error('owned append network failure'); });
  await h.actions.decorationSelection(0,0,384,256,'append'); assert.equal(h.model().decorationSelection.selectedIds, null);
  h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  let release; h.response(() => new Promise(resolve => { release = resolve; }));
  const pending = h.actions.decorationSelection(0,0,384,256,'append');
  assert.equal(h.model().decorationSelection.selectedIds, null);
  h.current().version = 'retired'; release(selectionDTO()); await pending;
  assert.equal(h.model().decorationSelection.selectedIds, null);
  delete h.current().version; h.response(selectionDraft); await h.actions.load();
  h.response(() => ({ ...selectionDTO(), instanceIds: ['c'] })); await h.actions.decorationSelection(0,0,384,256,'append');
  assert.deepEqual(h.model().decorationSelection.selectedIds, ['c']); assert.equal(h.records.size, 0);
});
test('decoration selection rejects missing catalogue, malformed rectangles and wrong or unordered result IDs', async () => {
  const missing = await windowHarness(), before = missing.calls.length;
  await missing.actions.decorationSelection(0, 0, 1, 1); assert.equal(missing.calls.length, before);
  const h = await selectionHarness(), count = h.calls.length;
  for (const rect of [[-0,0,1,1], [0,0,385,1], [383,255,2,1], [0,0,1,0], [0,0,1,1.5], ['0',0,1,1]]) await h.actions.decorationSelection(...rect);
  assert.equal(h.calls.length, count);
  for (const change of [d => { d.gameId = otherId; }, d => { d.draftRevision = '2'; }, d => { d.sourceDigest = 'b'.repeat(64); }, d => { d.width = 1; }, d => { d.worldHeight = 257; }, d => { d.tileSize = 8; }, d => { d.admission = 'ready'; }, d => { d.extra = true; }, d => { d.instanceIds = ['a','a']; }, d => { d.instanceIds = ['c','a']; }, d => { d.instanceIds = ['foreign']; }, d => { d.instanceIds = Array(1); }, d => { d.instanceIds = null; }]) {
    h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256); assert.equal(h.model().decorationSelection.ready, true);
    const bad = selectionDTO(); change(bad); h.response(() => bad); const errors = h.errors.length;
    await h.actions.decorationSelection(0,0,384,256); assert.equal(h.errors.length, errors + 1);
    assert.equal(h.model().decorationSelection.ready, false); assert.equal(h.model().decorationSelection.value, null);
  }
  assert.equal(h.records.size, 0);
});
test('late selections and retired identity state cannot cross save or authority boundaries', async () => {
  for (const change of ['logout', 'version', 'id', 'game']) {
    const h = await selectionHarness(); let release;
    h.response(() => new Promise(resolve => { release = resolve; })); const pending = h.actions.decorationSelection(0,0,384,256);
    const count = h.calls.length; await h.actions.decorationSelection(0,0,1,1); assert.equal(h.calls.length, count);
    if (change === 'logout') h.identity(null);
    else if (change === 'version') h.current().version = 'changed';
    else if (change === 'id') h.current().user.id = 'other';
    else h.controller.adoptGame(otherId);
    release(selectionDTO()); await pending; assert.equal(h.model().decorationSelection.ready, false); assert.equal(h.records.size, 0);
  }
  const h = await selectionHarness(); h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  const actor = h.current(); h.identity(null); h.identity(actor); assert.equal(h.model().decorationSelection.ready, false);
  h.response(selectionDraft); await h.actions.load(); h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  h.current().version = 'changed'; h.controller.render(); delete h.current().version; h.controller.render(); assert.equal(h.model().decorationSelection.ready, false);
  h.response(selectionDraft); await h.actions.load(); h.response(selectionDTO); await h.actions.decorationSelection(0,0,384,256);
  h.actions.setField('name', '修改'); h.response(() => { assert.equal(h.model().decorationSelection.ready, false); throw new Error('owned lost response'); });
  await h.actions.save(); assert.equal(h.model().decorationSelection.ready, false);
  const count = h.calls.length; await h.actions.decorationSelection(0,0,1,1); assert.equal(h.calls.length, count);
});
test('unauthenticated/forced UI actions and invalid metadata cannot issue writes', async () => {
  const h = harness(); await h.load(); h.actions.setField('name', '九個字ABCDEFGHI'); const before = h.calls.length; await h.actions.save(); assert.equal(h.calls.length, before);
  h.identity({ user: { id: 'author', mustChangePassword: true } }); await h.actions.refresh(); await h.actions.chapter('add-blank'); assert.equal(h.calls.length, before); assert.equal(h.model().allowed, false);
});
