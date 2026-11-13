// UI protocol checks only; owned DTO/API ports, not server authorization or rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const G = '11111111-1111-4111-8111-111111111111', H = '22222222-2222-4222-8222-222222222222';
const ID = `${G}#general-${'a'.repeat(64)}`, SHA = 'b'.repeat(64);
const metadata = { name: '作者草稿', introduction: '已保存' };
const row = () => ({ generalId: ID, name: '原名', zi: '', hao: '', portraitRef: null });
const dto = (revision = '1', definitions = []) => ({ gameId: G, draftRevision: revision, profileRevision: 'fixed-template-authoring-1', metadata, generalDefinitions: definitions, generalReferences: definitions.map(person => ({ generalId: person.generalId, chapters: [] })), chapters: [{ chapterId: 'first', name: '第一章', factions: [], gaps: { saveGaps: 0, activeGaps: 3 } }] });
const receipt = revision => ({ gameId: G, draftRevision: revision, metadata });
const cityRow = (over = {}) => ({ cityId: 'city-0', name: null, runtimeSlot: 0, x: 1, y: 2, max_prod: null, prod: null, growth: null, defence: null, troops: null, type: null, view: null, ...over });
const cityDto = (revision = '1', rows = [cityRow()], ids = []) => ({ ...dto(revision), cityDefinitions: rows, chapterCities: [{ chapterId: 'first', cities: ids.map(cityId => ({ cityId, factionId: null, values: { name: rows.find(row => row.cityId === cityId).name }, overrides: {}, inheritedFields: ['name'], overriddenFields: [] })) }] });
function harness({ records = new Map(), definitions = [], failSet = false, minimapCanvas = null, digestPixels } = {}) {
  let identity = { user: { id: 'author', mustChangePassword: false } }, busy = false, model, handler;
  const calls = [], errors = [], h = { calls, errors, records, currentIdentity: () => identity, confirm: true, response(fn) { handler = fn; }, model: () => model };
  const c = installDraftEditor({
    api: async (path, body, options) => { calls.push({ path, body, options }); if (handler) return handler(path, body, options); if (path === '/api/games') return { games: [{ ...receipt('1') }, { ...receipt('1'), gameId: H }] }; return dto('1', definitions); },
    authority: () => identity, isBusy: () => busy, publish: next => { model = next; },
    getMinimapCanvas: () => minimapCanvas, digestPixels,
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; c.render(); } },
    storage: { getItem: key => records.get(key), setItem: (key, value) => { if (failSet) throw new Error('owned quota failure'); records.set(key, value); }, removeItem: key => records.delete(key) },
    confirm: text => typeof h.confirm === 'function' ? h.confirm(text) : h.confirm,
    prompt: (text, value) => typeof h.prompt === 'function' ? h.prompt(text, value) : h.prompt ?? null,
  });
  c.setIdentity(identity); Object.assign(h, { c, a: c.actions, load: async () => { await c.actions.refresh(); await c.actions.load(); }, identity(next) { identity = next; c.setIdentity(next); } }); return h;
}
const baseDto = (revision = '1') => ({ ...dto(revision), baseTerrain: { width: 384, height: 256, tiles: Array.from({ length: 98304 }, (_, i) => i === 0 && revision === '1' ? null : 20), geography: Array(98304).fill(0), unknownCells: revision === '1' ? [0] : [] } });
test('base projection stays private and paginated; load and identity reset the local lock', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().base.supported, false);
  const d = baseDto(); h.response(() => d); await h.a.load();
  assert.equal(h.model().base.unlocked, false); assert.equal(h.model().base.locked, true); assert.equal(h.model().base.readLocked, false);
  assert.equal(h.model().base.rows.length, 24); assert.equal(h.model().base.rows[0].tile, null); assert.equal(h.model().base.unknownCount, 1);
  assert.equal(Object.hasOwn(h.model().base, 'tiles'), false);
  d.baseTerrain.tiles[0] = 255; h.model().base.rows[0].tile = 255; h.c.render(); assert.equal(h.model().base.rows[0].tile, null);
  const n = h.calls.length; h.a.basePage(4095); assert.equal(h.model().base.rows.at(-1).cell, 98303);
  for (const page of [-1, 4096, 1.5, '0']) h.a.basePage(page);
  assert.equal(h.model().base.page, 4095); assert.equal(h.calls.length, n);
  assert.equal(h.model().workspace.layer, 'decor'); h.a.mapLayer('base');
  h.a.baseUnlock('true'); assert.equal(h.model().base.unlocked, false); h.a.baseUnlock(true); assert.equal(h.model().base.locked, false);
  h.response(() => baseDto()); await h.a.load(); assert.equal(h.model().base.unlocked, false); assert.equal(h.model().base.page, 0);
  h.a.baseUnlock(true); h.identity({ user: { id: 'author', mustChangePassword: false }, version: 2 }); assert.equal(h.model().base.unlocked, false);
  h.identity(null); assert.deepEqual(h.model().base.rows, []); assert.equal(h.model().base.supported, false);
});
test('base fill freezes explicit input and original journal; receipt requires exact read', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => { const d = { ...baseDto(revision), profileRevision: profile }; if (profile === 'fixed-copy-resources-1') { d.generalDefinitions = null; d.generalReferences = null; } return d; };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    let n = h.calls.length; await h.a.baseFill([0], 20, 0); assert.equal(h.calls.length, n);
    h.a.mapLayer('base'); h.a.baseUnlock(true); h.a.setField('name', '補底外未存'); h.a.setField('revision', '999'); const cells = [0];
    h.confirm = text => { assert.match(text, /圖塊 20／地理 0/); cells.push(1); return true; };
    h.response(() => { throw new Error('owned lost base fill response'); }); await h.a.baseFill(cells, 20, 0);
    const sent = structuredClone(h.calls.at(-1)); assert.equal(sent.options.revision, '1');
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'base-fill', cells: [0], tile: 20, geography: 0 }] });
    assert.equal(h.model().base.rows[0].tile, null); assert.equal(h.model().base.unlocked, false);
    n = h.calls.length; h.a.baseUnlock(true); await h.a.baseFill([0], 20, 0); assert.equal(h.calls.length, n);
    const restored = harness({ records: new Map(h.records) }); await restored.a.retry(); assert.equal(restored.calls.length, 0);
    restored.response(() => ({ state: 'committed', result: receipt('2') })); await restored.a.query(); assert.equal(restored.calls[0].body, undefined);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent); assert.equal(h.model().fields.name, '補底外未存');
    assert.equal(h.model().context.verified, false); assert.equal(h.model().base.rows[0].tile, null);
    h.confirm = true; h.response(() => data('2')); await h.a.load(); assert.equal(h.model().base.rows[0].tile, 20); assert.equal(h.model().base.unknownCount, 0); assert.equal(h.model().base.locked, true);
  }
});
test('base projection rejects corrupt arrays atomically; absence remains unknown', async () => {
  const h = harness(); await h.load(); h.response(() => baseDto()); await h.a.load(); const prior = structuredClone(h.model().base);
  for (const change of [d => { d.width = 1; }, d => { d.tiles = Array(98304); }, d => { d.tiles.pop(); }, d => { d.tiles[0] = 256; }, d => { d.geography[0] = null; }, d => { d.geography[0] = -0; }, d => { d.unknownCells = [0, 0]; }, d => { d.unknownCells = [98304]; }, d => { d.unknownCells = Array(1); }, d => { d.extra = true; }]) {
    const bad = baseDto(); change(bad.baseTerrain); h.response(() => bad); await h.a.load(); assert.deepEqual(h.model().base, prior);
  }
  h.response(() => dto()); await h.a.load(); assert.equal(h.model().base.supported, false); assert.deepEqual(h.model().base.rows, []);
  h.a.baseUnlock(true); assert.equal(h.model().base.unlocked, false);
});
test('base fill rejects stale/relocked confirmation, invalid values, quota and budget', async () => {
  const h = harness(); await h.load(); h.response(() => baseDto()); await h.a.load(); h.a.mapLayer('base'); h.a.baseUnlock(true); let n = h.calls.length;
  for (const args of [[[], 0, 0], [Array(1), 0, 0], [[0, 0], 0, 0], [[98304], 0, 0], [[-0], 0, 0], [[0], 256, 0], [[0], '0', 0], [[0], 0, 4], [[0], 0, null], [[0], -0, 0], [Array.from({ length: 6000 }, (_, i) => i), 20, 0]]) await h.a.baseFill(...args);
  h.confirm = false; await h.a.baseFill([0], 0, 0); assert.equal(h.calls.length, n); assert.equal(h.records.size, 0);
  for (const mutate of [s => s.identity({ user: { id: 'other' } }), s => { s.currentIdentity().version = 2; }, s => { s.currentIdentity().user.id = 'other'; }, s => { s.currentIdentity().user.mustChangePassword = true; }, s => { s.a.baseUnlock(false); s.a.baseUnlock(true); }]) {
    const s = harness(); await s.load(); s.response(() => baseDto()); await s.a.load(); s.a.mapLayer('base'); s.a.baseUnlock(true); const count = s.calls.length;
    s.confirm = () => { mutate(s); return true; }; await s.a.baseFill([0], 0, 0); assert.equal(s.calls.length, count); assert.equal(s.records.size, 0);
  }
  const q = harness({ failSet: true }); await q.load(); q.response(() => baseDto()); await q.a.load(); q.a.mapLayer('base'); q.a.baseUnlock(true); n = q.calls.length;
  await q.a.baseFill([0], 0, 0); assert.equal(q.calls.length, n); assert.equal(q.model().base.unlocked, false);
});
const MATERIAL = `${G}#material-${'c'.repeat(64)}`;
const materialDto = (revision = '1') => ({ ...dto(revision), materialDefinitions: [
  { materialId: 'raw-tile', name: null, cellCount: 1, authorEditable: false, references: ['裝飾:piece'] },
  { materialId: MATERIAL, name: '作者素材', cellCount: 1, authorEditable: true, references: [] },
], decorationInstances: [{ instanceId: 'piece', materialId: 'raw-tile', x: 3, y: 4 }] });
const placementDto = (revision = '1') => {
  const data = materialDto(revision);
  data.materialPlacement = { materials: data.materialDefinitions.map(row => ({ materialId: row.materialId, variantRefs: ['original', '明確變體'] })), waterClasses: [null, 'sea', 'river', 'lake'] };
  return data;
};
test('instance current variant is explicit, private and never inferred for legacy summaries', async () => {
  const h = harness(); await h.load();
  const data = placementDto(); data.decorationInstances[0].variantRef = '明確變體';
  h.response(() => data); await h.a.load();
  assert.equal(h.model().materials.instances[0].variantRef, '明確變體');
  data.decorationInstances[0].variantRef = 'original';
  h.model().materials.instances[0].variantRef = 'original'; h.c.render();
  assert.equal(h.model().materials.instances[0].variantRef, '明確變體');
  h.response(() => materialDto()); await h.a.load();
  assert.equal(Object.hasOwn(h.model().materials.instances[0], 'variantRef'), false);
  assert.equal(h.records.size, 0); assert.equal(h.calls.some(call => call.body !== undefined), false);
});
test('invalid or unbound instance variants reject the entire read without replacing prior material state', async () => {
  const h = harness(); await h.load();
  const data = placementDto(); data.decorationInstances[0].variantRef = '明確變體';
  h.response(() => data); await h.a.load();
  for (const value of [null, undefined, '', 0, 'missing', 'other-material-only']) {
    const bad = placementDto(); bad.decorationInstances[0].variantRef = value;
    bad.materialPlacement.materials[1].variantRefs.push('other-material-only');
    h.response(() => bad); const errors = h.errors.length; await h.a.load();
    assert.equal(h.errors.length, errors + 1); assert.match(h.errors.at(-1).message, /實例目前變體/);
    assert.equal(h.model().materials.instances[0].variantRef, '明確變體');
  }
  const missing = materialDto(); missing.decorationInstances[0].variantRef = 'original';
  h.response(() => missing); const errors = h.errors.length; await h.a.load();
  assert.equal(h.errors.length, errors + 1); assert.match(h.errors.at(-1).message, /實例目前變體/);
  assert.equal(h.model().materials.instances[0].variantRef, '明確變體');
  assert.equal(h.records.size, 0); assert.equal(h.calls.some(call => call.body !== undefined), false);
});
const decorationSplitDto = (revision = '1') => {
  const d = materialDto(revision);
  d.materialDefinitions[0].references = [];
  d.materialDefinitions[1].cellCount = 2; d.materialDefinitions[1].references = ['裝飾:piece'];
  d.decorationInstances[0].materialId = MATERIAL;
  d.decorationSplitCandidates = [{ instanceId: 'piece', childCount: 2 }];
  if (revision === '2') {
    d.materialDefinitions[1].references = [];
    d.materialDefinitions[0].references = ['裝飾:child-a', '裝飾:child-b'];
    d.decorationInstances = ['child-a', 'child-b'].map((instanceId, i) => ({ instanceId, materialId: 'raw-tile', x: 3 + i, y: 4 }));
    d.decorationSplitCandidates = d.decorationInstances.map(row => ({ instanceId: row.instanceId, childCount: null }));
  }
  return d;
};
test('current map layer gates map writers and original-key retries without changing locks or form inputs', async () => {
  for (const profileRevision of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const h = harness(); await h.load();
    const data = { ...placementDto(), profileRevision, baseTerrain: baseDto().baseTerrain };
    if (profileRevision === 'fixed-copy-resources-1') { data.generalDefinitions = null; data.generalReferences = null; }
    h.response(() => data); await h.a.load(); h.a.baseUnlock(true); h.a.setField('name', '換層外未存');
    const n = h.calls.length; h.confirm = () => assert.fail('inactive layer must not prompt');
    await h.a.baseFill([0], 20, 0); assert.equal(h.model().base.locked, true);
    for (const layer of ['base', 'roads', 'cities']) {
      h.a.mapLayer(layer); h.model().workspace.layer = 'decor'; h.c.render(); assert.equal(h.model().workspace.layer, layer);
      for (const invoke of [a => a.translate(['piece'], 1, 0), a => a.reorder(['piece'], 1), a => a.removeInstances(['piece']), a => a.split('piece'), a => a.place(MATERIAL, 'original', 0, 0, null)]) await invoke(h.a);
    }
    for (const layer of [null, 'unknown', 0]) h.a.mapLayer(layer);
    assert.equal(h.model().workspace.layer, 'cities'); assert.equal(h.calls.length, n); assert.equal(h.records.size, 0);
    h.a.decorLock(true); h.a.mapLayer('base'); assert.equal(h.model().base.locked, false);
    h.a.mapLayer('decor'); assert.equal(h.model().materials.decorationLocked, true); assert.equal(h.model().base.unlocked, true);
    assert.equal(h.model().fields.name, '換層外未存'); h.a.decorLock(false); h.confirm = true;
    h.response(() => { throw new Error('owned lost response'); }); await h.a.place(MATERIAL, 'original', 0, 0, null);
    const sent = structuredClone(h.calls.at(-1));
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.a.mapLayer('roads'); const count = h.calls.length; await h.a.retry(); assert.equal(h.calls.length, count);
    h.a.mapLayer('decor'); h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '換層外未存'); assert.equal(h.model().context.verified, false);
    h.identity(null); assert.equal(h.model().workspace.layer, 'decor'); assert.equal(h.model().workspace.locked, true);
  }
});
test('decoration lock gates all five instance writers before dialogs and after confirmation', async () => {
  const commands = [a => a.translate(['piece'], 1, 0), a => a.reorder(['piece'], 1), a => a.removeInstances(['piece']), a => a.split('piece'), a => a.place(MATERIAL, 'original', 0, 0, null)];
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) for (const command of commands) {
    const h = harness(); await h.load();
    const d = { ...decorationSplitDto(), profileRevision: profile, materialPlacement: placementDto().materialPlacement };
    if (profile === 'fixed-copy-resources-1') { d.generalDefinitions = null; d.generalReferences = null; }
    h.response(() => d); await h.a.load(); const count = h.calls.length, before = structuredClone(d);
    assert.equal(h.model().materials.decorationLocked, false);
    h.a.decorLock(true); h.model().materials.decorationLocked = false; h.c.render();
    assert.equal(h.model().materials.decorationLocked, true);
    h.confirm = () => assert.fail('locked instance must not reach confirmation'); await command(h.a);
    assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
    h.a.decorLock(false);
    h.confirm = () => { h.a.decorLock(true); h.a.decorLock(false); return true; };
    await command(h.a); assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
    assert.equal(h.model().materials.decorationLocked, true); assert.deepEqual(d, before);
  }
});
test('decoration lock preserves pending journal and permits query, but gates original-key POST retry', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load();
  h.response(() => { throw new Error('owned lost response'); }); await h.a.removeInstances(['piece']);
  const sent = structuredClone(h.calls.at(-1)), journal = [...h.records];
  h.a.decorLock(true); const count = h.calls.length; await h.a.retry();
  assert.equal(h.calls.length, count); assert.deepEqual([...h.records], journal);
  h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
  assert.equal(h.calls.at(-1).body, undefined); assert.equal(h.model().materials.decorationLocked, true);
  h.a.decorLock(false); h.response(() => receipt('2')); await h.a.retry();
  assert.deepEqual(h.calls.at(-1), sent); assert.equal(h.model().context.verified, false);
});
test('locking after dispatch cannot pretend an in-flight write was cancelled', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load();
  let release; h.response(() => new Promise(resolve => { release = resolve; }));
  const pending = h.a.removeInstances(['piece']); const count = h.calls.length;
  h.a.decorLock(true); h.a.decorLock(false); assert.equal(h.model().materials.decorationLocked, true);
  release(receipt('2')); await pending;
  assert.equal(h.calls.length, count); assert.equal(h.model().context.draftRevision, '2');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().materials.decorationLocked, true);
  h.response(() => materialDto('2')); await h.a.load(); assert.equal(h.model().materials.decorationLocked, true);
});
test('decoration lock is local, persists on same-game read and does not block library-only editing', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); h.a.decorLock(true);
  h.response(() => materialDto()); await h.a.load(); assert.equal(h.model().materials.decorationLocked, true);
  for (const value of ['true', 0, null]) h.a.decorLock(value);
  assert.equal(h.model().materials.decorationLocked, true);
  h.prompt = '另一素材名'; h.response(() => receipt('2')); await h.a.material('material-rename', MATERIAL);
  assert.equal(h.calls.at(-1).body.mapEdits[0].op, 'material-rename');
  assert.equal(Object.hasOwn(h.calls.at(-1).body, 'decorLocked'), false);
  h.identity({ user: { id: 'other' } }); assert.equal(h.model().materials.decorationLocked, false);
});
test('removal freezes complete selection and original revision; retry and reload keep the sole journal', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => { const d = { ...materialDto(revision), profileRevision: profile }; if (profile === 'fixed-copy-resources-1') { d.generalDefinitions = null; d.generalReferences = null; } if (revision === '2') { d.decorationInstances = []; d.materialDefinitions[0].references = []; } return d; };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    h.a.setField('name', '不隨移除保存'); h.a.setField('revision', '999');
    const selection = ['piece'];
    h.prompt = () => { throw new Error('removal must not prompt for a name'); };
    h.confirm = text => { assert.match(text, /未知底層/); selection.push('injected-after-confirm'); return true; };
    h.response(() => { throw new Error('owned lost removal response'); }); await h.a.removeInstances(selection);
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-remove', memberIds: ['piece'] }] });
    assert.equal(sent.options.revision, '1'); assert.deepEqual(h.model().materials.instances, data('1').decorationInstances);
    const count = h.calls.length; await h.a.removeInstances(['piece']); assert.equal(h.calls.length, count);
    const restored = harness({ records: new Map(h.records) }); await restored.a.retry(); assert.equal(restored.calls.length, 0);
    restored.response(() => ({ state: 'committed', result: receipt('2') })); await restored.a.query(); assert.equal(restored.calls[0].body, undefined);
    assert.equal(restored.model().context.verified, false);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '不隨移除保存'); assert.equal(h.model().context.verified, false);
    assert.equal(h.model().materials.instances.length, 1);
    h.confirm = true; h.response(() => data('2')); await h.a.load(); assert.deepEqual(h.model().materials.instances, []);
    assert.deepEqual(h.model().materials.rows[0].references, []);
  }
});
test('removal refuses invalid selection, cancellation, confirmation context changes and storage failure', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); const count = h.calls.length;
  for (const ids of [undefined, null, [], 'piece', Array(1), ['piece', 'piece'], ['piece', 'missing'], [MATERIAL], ['road']]) await h.a.removeInstances(ids);
  h.confirm = false; await h.a.removeInstances(['piece']); assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  for (const mutate of [s => s.identity({ user: { id: 'other' } }), s => { s.currentIdentity().version = 2; }, s => { s.currentIdentity().user.id = 'other'; }, s => { s.currentIdentity().user.mustChangePassword = true; }]) {
    const s = harness(); await s.load(); s.response(() => materialDto()); await s.a.load(); const n = s.calls.length;
    s.confirm = () => { mutate(s); return true; }; await s.a.removeInstances(['piece']); assert.equal(s.calls.length, n); assert.equal(s.records.size, 0);
  }
  const q = harness({ failSet: true }); await q.load(); q.response(() => materialDto()); await q.a.load(); const n = q.calls.length;
  await q.a.removeInstances(['piece']); assert.equal(q.calls.length, n);
});
test('removal requires known instances and enforces the complete request byte budget', async () => {
  const h = harness(); await h.load(); const n = h.calls.length;
  await h.a.removeInstances(['piece']); assert.equal(h.calls.length, n);
  const d = materialDto();
  d.decorationInstances = Array.from({ length: 100 }, (_, i) => ({ instanceId: `${i}-${'x'.repeat(200)}`, materialId: 'raw-tile', x: i, y: 4 }));
  d.materialDefinitions[0].references = d.decorationInstances.map(row => `裝飾:${row.instanceId}`);
  h.response(() => d); await h.a.load(); assert.equal(h.model().materials.locked, false);
  const count = h.calls.length; await h.a.removeInstances(d.decorationInstances.map(row => row.instanceId));
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0); assert.match(h.errors.at(-1).message, /16KiB/);
});
test('split uses saved count and single journal; loss/retry/reload never allocates children or saves unrelated input', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => { const d = { ...decorationSplitDto(revision), profileRevision: profile }; if (profile === 'fixed-copy-resources-1') { d.generalDefinitions = null; d.generalReferences = null; } return d; };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    h.model().materials.splitCandidates[0].childCount = 99; h.c.render(); assert.equal(h.model().materials.splitCandidates[0].childCount, 2);
    h.a.setField('name', '不隨拆分保存'); h.a.setField('revision', '99');
    h.prompt = () => { throw new Error('split must not ask for names or IDs'); };
    h.confirm = text => { assert.match(text, /2.*全部圖格/); return true; };
    h.response(() => { throw new Error('lost'); }); await h.a.split('piece');
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-split', instanceId: 'piece', childCount: 2 }] });
    assert.equal(sent.options.revision, '1'); assert.deepEqual(h.model().materials.instances.map(row => row.instanceId), ['piece']);
    const n = h.calls.length; await h.a.split('piece'); assert.equal(h.calls.length, n);
    const restored = harness({ records: new Map(h.records) }); await restored.a.retry(); assert.equal(restored.calls.length, 0);
    restored.response(() => ({ state: 'committed', result: receipt('2') })); await restored.a.query(); assert.equal(restored.calls[0].body, undefined);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '不隨拆分保存'); assert.equal(h.model().context.verified, false);
    h.confirm = true; h.response(() => data('2')); await h.a.load(); assert.deepEqual(h.model().materials.instances.map(row => row.instanceId), ['child-a', 'child-b']);
    const count = h.calls.length; await h.a.split('child-a'); assert.equal(h.calls.length, count);
  }
});
test('split refuses unknown candidates, stale confirmation, cancellation and journal failure', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); let n = h.calls.length;
  await h.a.split('piece'); assert.equal(h.calls.length, n);
  h.response(() => decorationSplitDto()); await h.a.load(); n = h.calls.length;
  for (const id of [undefined, null, '', 'missing', ['piece']]) await h.a.split(id);
  h.confirm = false; await h.a.split('piece'); assert.equal(h.calls.length, n); assert.equal(h.records.size, 0);
  for (const mutate of [s => s.identity({ user: { id: 'other' } }), s => { s.currentIdentity().version = 2; }, s => { s.currentIdentity().user.id = 'other'; }, s => { s.currentIdentity().user.mustChangePassword = true; }]) {
    const s = harness(); await s.load(); s.response(() => decorationSplitDto()); await s.a.load(); const count = s.calls.length;
    s.confirm = () => { mutate(s); return true; }; await s.a.split('piece'); assert.equal(s.calls.length, count); assert.equal(s.records.size, 0);
  }
  const q = harness({ failSet: true }); await q.load(); q.response(() => decorationSplitDto()); await q.a.load(); n = q.calls.length;
  await q.a.split('piece'); assert.equal(q.calls.length, n);
});
test('split candidate projection is complete and atomic; absence only disables splitting', async () => {
  const h = harness(); await h.load(); h.response(() => decorationSplitDto()); await h.a.load(); const previous = structuredClone(h.model().materials);
  for (const values of [[], {}, Array(1), [{ instanceId: 'missing', childCount: 2 }], [{ instanceId: 'piece', childCount: 1 }], [{ instanceId: 'piece', childCount: 257 }], [{ instanceId: 'piece', childCount: '2' }], [{ instanceId: 'piece', childCount: 2.5 }], [{ instanceId: 'piece', childCount: 2, childIds: [] }], [{ instanceId: 'piece', childCount: 2 }, { instanceId: 'piece', childCount: 2 }]]) {
    const d = decorationSplitDto(); d.decorationSplitCandidates = values; h.response(() => d); await h.a.load(); assert.deepEqual(h.model().materials, previous);
  }
  h.response(() => materialDto()); await h.a.load(); assert.equal(h.model().materials.splitCandidates, null); assert.equal(h.model().materials.locked, false);
  h.prompt = '仍可擷取'; h.response(() => receipt('2')); await h.a.material('material-capture', ['piece']); assert.equal(h.calls.at(-1).body.mapEdits[0].op, 'material-capture');
});
test('placement uses explicit saved options and original journal without optimistic instances or generated IDs', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => { const d = { ...placementDto(revision), profileRevision: profile }; if (profile === 'fixed-copy-resources-1') { d.generalDefinitions = null; d.generalReferences = null; } return d; };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    h.model().materials.placement.materials[0].variantRefs.push('tampered'); h.c.render();
    assert.equal(h.model().materials.placement.materials[0].variantRefs.includes('tampered'), false);
    h.a.setField('name', '不捎帶放置'); h.a.setField('revision', '999');
    h.prompt = () => { throw new Error('placement must not invent a name'); };
    h.confirm = text => { assert.match(text, /不自動判定地形/); return true; };
    h.response(() => { throw new Error('lost'); }); await h.a.place('raw-tile', '明確變體', 0, 255, null);
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-place', materialId: 'raw-tile', variantRef: '明確變體', x: 0, y: 255, waterClass: null }] });
    assert.equal(sent.options.revision, '1'); assert.equal(h.model().materials.instances.length, 1);
    const n = h.calls.length; await h.a.place(MATERIAL, 'original', 3, 4, 'river'); assert.equal(h.calls.length, n);
    const restored = harness({ records: new Map(h.records) }); await restored.a.retry(); assert.equal(restored.calls.length, 0);
    restored.response(() => ({ state: 'committed', result: receipt('2') })); await restored.a.query(); assert.equal(restored.calls[0].body, undefined);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '不捎帶放置'); assert.equal(h.model().context.verified, false);
    h.confirm = true; h.response(() => data('2')); await h.a.load();
    h.response(() => receipt('3')); await h.a.place(MATERIAL, 'original', 3, 4, 'river');
    assert.equal(h.calls.at(-1).body.mapEdits[0].waterClass, 'river'); assert.equal(h.calls.at(-1).options.revision, '2');
  }
});
test('placement rejects missing or invalid choices, cancellation, changed identity and journal failure', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); let n = h.calls.length;
  await h.a.place('raw-tile', 'original', 0, 0, null); assert.equal(h.calls.length, n);
  h.response(() => placementDto()); await h.a.load(); n = h.calls.length;
  for (const args of [['missing', 'original', 0, 0, null], ['raw-tile', undefined, 0, 0, null], ['raw-tile', 'missing', 0, 0, null], ['raw-tile', 'original', 0, 0, undefined], ['raw-tile', 'original', 0, 0, ''], ['raw-tile', 'original', 0, 0, 'unknown'], ...['', null, -0, -1, 384, 0.5, NaN].map(x => ['raw-tile', 'original', x, 0, null]), ['raw-tile', 'original', 0, 256, null]]) await h.a.place(...args);
  h.confirm = false; await h.a.place('raw-tile', 'original', 0, 0, null);
  assert.equal(h.calls.length, n); assert.equal(h.records.size, 0);
  for (const mutate of [s => s.identity({ user: { id: 'other' } }), s => { s.currentIdentity().version = 2; }, s => { s.currentIdentity().user.mustChangePassword = true; }]) {
    const s = harness(); await s.load(); s.response(() => placementDto()); await s.a.load(); const count = s.calls.length;
    s.confirm = () => { mutate(s); return true; }; await s.a.place('raw-tile', 'original', 0, 0, null);
    assert.equal(s.calls.length, count); assert.equal(s.records.size, 0);
  }
  const q = harness({ failSet: true }); await q.load(); q.response(() => placementDto()); await q.a.load(); n = q.calls.length;
  await q.a.place('raw-tile', 'original', 0, 0, null); assert.equal(q.calls.length, n);
});
test('placement DTO is atomic, complete, detached and missing options do not disable unrelated material operations', async () => {
  const h = harness(); await h.load();
  const dto = placementDto();
  for (const row of dto.materialPlacement.materials) {
    row.offsets = Array.from({ length: dto.materialDefinitions.find(def => def.materialId === row.materialId).cellCount }, (_, x) => [x, 0]);
    row.visualVariants = row.variantRefs.map(variantRef => ({ variantRef, tiles: row.offsets.map(([x, y]) => [x, y, 7]) }));
  }
  h.response(() => dto); await h.a.load();
  dto.materialPlacement.materials[0].offsets[0][0] = 999;
  h.model().materials.placement.materials[0].offsets[0][0] = 888; h.c.render();
  assert.equal(h.model().materials.placement.materials[0].offsets[0][0], 0);
  dto.materialPlacement.materials[0].visualVariants[0].tiles[0][2] = 255;
  h.model().materials.placement.materials[0].visualVariants[0].tiles[0][2] = 254; h.c.render();
  assert.equal(h.model().materials.placement.materials[0].visualVariants[0].tiles[0][2], 7);
  const previous = structuredClone(h.model().materials);
  for (const mutate of [v => { v.pop(); }, v => { v[0].variantRef = 'missing'; }, v => { v[0].tiles[0][2] = 256; }, v => { v[0].tiles[0][0] = 1; }, v => { v[0].tiles = Array(1); }]) {
    const bad = placementDto('2'); bad.materialPlacement = structuredClone(previous.placement); mutate(bad.materialPlacement.materials[0].visualVariants);
    h.response(() => bad); await h.a.load(); assert.deepEqual(h.model().materials, previous);
  }
  for (const offsets of [null, [], Array(1), [[0]], [[0, -0]], [[0, NaN]], [[0, 0], [0, 0]]]) {
    const bad = placementDto('2'); bad.materialPlacement.materials[0].offsets = offsets;
    h.response(() => bad); await h.a.load(); assert.deepEqual(h.model().materials, previous);
  }
  for (const mutate of [d => { d.materialPlacement.materials.pop(); }, d => { d.materialPlacement.materials[1].materialId = 'raw-tile'; }, d => { d.materialPlacement.materials[0].variantRefs = []; }, d => { d.materialPlacement.materials[0].variantRefs = ['a', 'a']; }, d => { d.materialPlacement.materials[0].variantRefs = Array(1); }, d => { d.materialPlacement.waterClasses = [null, null]; }, d => { d.materialPlacement.waterClasses = ['sea']; }, d => { d.materialPlacement.extra = true; }]) {
    const bad = placementDto('2'); mutate(bad); h.response(() => bad); await h.a.load(); assert.deepEqual(h.model().materials, previous);
  }
  h.response(() => materialDto()); await h.a.load(); assert.equal(h.model().materials.placement, null); assert.equal(h.model().materials.locked, false);
  h.prompt = '仍可擷取'; h.response(() => receipt('2')); await h.a.material('material-capture', ['piece']);
  assert.equal(h.calls.at(-1).body.mapEdits[0].op, 'material-capture');
});
test('layer order binds both profiles to original journal, detached IDs and explicit read, never optimistic sorting', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => {
      const value = { ...materialDto(revision), profileRevision: profile };
      if (profile === 'fixed-copy-resources-1') { value.generalDefinitions = null; value.generalReferences = null; }
      value.materialDefinitions[0].references.push('裝飾:next');
      value.decorationInstances.push({ instanceId: 'next', materialId: 'raw-tile', x: 4, y: 4 });
      if (revision === '2') value.decorationInstances = value.decorationInstances.toReversed();
      return value;
    };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    h.a.setField('name', '不隨調序存'); h.a.setField('revision', '99');
    const selected = ['piece']; h.confirm = text => { assert.match(text, /整個裝飾層/); selected.push('late'); return true; };
    h.prompt = () => { throw new Error('order must not prompt for material name'); };
    h.response(() => { throw new Error('lost'); }); await h.a.reorder(selected, 1);
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-reorder', memberIds: ['piece'], direction: 1 }] });
    assert.equal(sent.options.revision, '1'); assert.equal(h.model().materials.locked, true);
    assert.deepEqual(h.model().materials.instances.map(row => row.instanceId), ['piece', 'next']);
    const count = h.calls.length; await h.a.reorder(['piece'], -1); assert.equal(h.calls.length, count);
    const recovered = harness({ records: new Map(h.records) }); await recovered.a.retry(); assert.equal(recovered.calls.length, 0);
    recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query(); assert.equal(recovered.calls[0].body, undefined);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '不隨調序存'); assert.equal(h.model().context.verified, false);
    h.confirm = true; // Explicit read may confirm discarding the other dirty form.
    h.response(() => data('2')); await h.a.load(); assert.deepEqual(h.model().materials.instances.map(row => row.instanceId), ['next', 'piece']);
    h.response(() => receipt('3')); await h.a.reorder(['piece'], -1);
    assert.deepEqual(h.calls.at(-1).body.mapEdits, [{ op: 'decoration-reorder', memberIds: ['piece'], direction: -1 }]); assert.equal(h.calls.at(-1).options.revision, '2');
  }
});
test('layer order refuses unknown data, invalid direction/selection, stale confirmation and failed journal', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.a.reorder(['piece'], 1); assert.equal(h.calls.length, count);
  h.response(() => materialDto()); await h.a.load(); count = h.calls.length;
  for (const direction of [0, 2, '1', null, undefined, NaN, true]) await h.a.reorder(['piece'], direction);
  for (const selection of [[], ['missing'], ['piece', 'piece'], Array(1), null]) await h.a.reorder(selection, 1);
  h.prompt = '稀疏選取'; await h.a.material('material-capture', Array(1)); await h.a.translate(Array(1), 1, 0);
  h.confirm = false; await h.a.reorder(['piece'], 1); assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  for (const mutate of [x => x.identity({ user: { id: 'other' } }), x => { x.currentIdentity().version = 2; }, x => { x.currentIdentity().user.mustChangePassword = true; }]) {
    const s = harness(); await s.load(); s.response(() => materialDto()); await s.a.load();
    s.confirm = () => { mutate(s); return true; }; const n = s.calls.length;
    await s.a.reorder(['piece'], -1); assert.equal(s.calls.length, n); assert.equal(s.records.size, 0);
  }
  const q = harness({ failSet: true }); await q.load(); q.response(() => materialDto()); await q.a.load();
  const n = q.calls.length; await q.a.reorder(['piece'], 1); assert.equal(q.calls.length, n);
  const large = materialDto(); large.decorationInstances = Array.from({ length: 90 }, (_, i) => ({ instanceId: 'x'.repeat(200) + i, materialId: 'raw-tile', x: i, y: 0 }));
  large.materialDefinitions[0].references = large.decorationInstances.map(row => `裝飾:${row.instanceId}`);
  q.response(() => large); await q.a.load(); const before = q.calls.length;
  await q.a.reorder(large.decorationInstances.map(row => row.instanceId), 1); assert.equal(q.calls.length, before); assert.match(q.errors.at(-1).message, /16KiB/);
});
test('decoration translation binds loaded revision and detached selection to the sole journal', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = revision => {
      const value = { ...materialDto(revision), profileRevision: profile };
      if (profile === 'fixed-copy-resources-1') { value.generalDefinitions = null; value.generalReferences = null; }
      return value;
    };
    const h = harness(); await h.load(); h.response(() => data('1')); await h.a.load();
    assert.equal(h.model().materials.locked, false);
    h.a.setField('name', '未存資料'); h.a.setDefinitionField('name', '未存人物'); h.a.setField('revision', '99');
    const definitionName = h.model().definitions.form.name;
    const selected = ['piece']; let message = '';
    h.confirm = text => { message = text; selected.push('late'); return true; };
    h.prompt = () => { throw new Error('translation must not prompt for material name'); };
    h.response(() => { throw new Error('lost'); }); await h.a.translate(selected, -1, 2);
    assert.match(message, /未知底層/); assert.match(message, /-1/);
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-translate', memberIds: ['piece'], dx: -1, dy: 2 }] });
    assert.equal(sent.options.revision, '1'); assert.equal(h.model().materials.locked, true);
    const count = h.calls.length; await h.a.translate(['piece'], 1, 0); assert.equal(h.calls.length, count);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent);
    assert.equal(h.model().fields.name, '未存資料'); assert.equal(h.model().definitions.form.name, definitionName);
    assert.equal(h.model().context.verified, false); assert.equal(h.model().materials.locked, true);
    h.response(() => ({ ...data('2'), decorationInstances: [{ instanceId: 'piece', materialId: 'raw-tile', x: 2, y: 6 }] }));
    await h.a.load(); assert.equal(h.model().materials.locked, false); assert.equal(h.model().materials.instances[0].x, 2);
  }
});
test('translation refuses unknown DTO, bad displacements, selections and stale confirmation before POST', async () => {
  const h = harness(); await h.load(); let count = h.calls.length;
  await h.a.translate(['piece'], 1, 0); assert.equal(h.calls.length, count);
  h.response(() => materialDto()); await h.a.load(); count = h.calls.length;
  for (const [dx, dy] of [[0, 0], [0.1, 1], [-0, 1], [1, -0], ['1', 0], [NaN, 0], [Infinity, 0], [Number.MAX_SAFE_INTEGER + 1, 0], [undefined, 0]]) await h.a.translate(['piece'], dx, dy);
  for (const ids of [[], ['missing'], ['piece', 'piece'], null]) await h.a.translate(ids, 1, 0);
  h.confirm = false; await h.a.translate(['piece'], 1, 0); assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  for (const change of [x => x.identity({ user: { id: 'other', mustChangePassword: false } }), x => { x.currentIdentity().user.id = 'other'; }, x => { x.currentIdentity().version = 2; }, x => { x.currentIdentity().user.mustChangePassword = true; }]) {
    const s = harness(); await s.load(); s.response(() => materialDto()); await s.a.load();
    s.confirm = () => { change(s); return true; }; const n = s.calls.length;
    await s.a.translate(['piece'], 1, 0); assert.equal(s.calls.length, n); assert.equal(s.records.size, 0);
  }
});
test('translation recovery never reconstructs a body; quota and whole-body budget stop POST', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load();
  h.response(() => { throw new Error('lost'); }); await h.a.translate(['piece'], 1, 0);
  const recovered = harness({ records: h.records }); await recovered.a.retry(); assert.equal(recovered.calls.length, 0);
  recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query();
  assert.equal(recovered.calls.length, 1); assert.equal(recovered.calls[0].body, undefined); assert.equal(recovered.model().materials.locked, true);
  const q = harness({ failSet: true }); await q.load(); q.response(() => materialDto()); await q.a.load();
  const n = q.calls.length; await q.a.translate(['piece'], 1, 0); assert.equal(q.calls.length, n); assert.equal(q.records.size, 0);
  const large = materialDto(); large.decorationInstances = Array.from({ length: 90 }, (_, i) => ({ instanceId: 'x'.repeat(200) + i, materialId: 'raw-tile', x: i, y: 0 }));
  large.materialDefinitions[0].references = large.decorationInstances.map(row => `裝飾:${row.instanceId}`);
  q.response(() => large); await q.a.load(); const before = q.calls.length;
  await q.a.translate(large.decorationInstances.map(row => row.instanceId), 1, 0); assert.equal(q.calls.length, before);
  assert.match(q.errors.at(-1).message, /16KiB/);
});
test('material capture uses sole exact revision journal, detached selection and original retry; preserves dirty forms', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load();
  h.model().materials.rows[0].references.length = 0; h.c.render(); assert.equal(h.model().materials.rows[0].references.length, 1);
  h.a.setField('name', '未保存'); h.a.setDefinitionField('name', '未存人物'); h.a.setField('revision', '99');
  const selected = ['piece']; h.prompt = () => { selected.push('late-member'); return ' e\u0301𠀀 '; };
  h.response(() => { throw new Error('lost response'); }); await h.a.material('material-capture', selected);
  const original = structuredClone(h.calls.at(-1));
  assert.deepEqual(original.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'material-capture', memberIds: ['piece'], name: 'e\u0301𠀀' }] });
  assert.equal(original.options.revision, '1'); assert.equal(h.model().materials.locked, true);
  const count = h.calls.length; await h.a.material('material-remove', MATERIAL); assert.equal(h.calls.length, count);
  h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().definitions.form.name, '未存人物');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().materials.locked, true);
  h.response(() => materialDto('2')); await h.a.load(); assert.equal(h.model().materials.locked, false);
  assert.ok(h.calls.at(-1).path.endsWith('?revision=2'));
});
test('material rename/removal guard original recipes and references; confirmation cannot cross identity', async () => {
  const h = harness(); await h.load(); const good = materialDto();
  h.response(() => good); await h.a.load(); const count = h.calls.length;
  for (const op of ['material-rename', 'material-remove']) await h.a.material(op, 'raw-tile');
  for (const selection of [[], ['missing'], ['piece', 'piece']]) await h.a.material('material-capture', selection);
  for (const text of [null, '', '\u0000bad', 'x'.repeat(65)]) { h.prompt = text; await h.a.material('material-rename', MATERIAL); }
  h.prompt = '新名'; h.confirm = false; await h.a.material('material-rename', MATERIAL);
  assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  h.confirm = true; h.response(() => receipt('2')); await h.a.material('material-rename', MATERIAL);
  assert.deepEqual(h.calls.at(-1).body.mapEdits, [{ op: 'material-rename', materialId: MATERIAL, name: '新名' }]);
  h.response(() => ({ ...materialDto('2'), materialDefinitions: good.materialDefinitions.map(row => row.authorEditable ? { ...row, references: ['道路:r/part'] } : row) })); await h.a.load();
  const usedCount = h.calls.length; await h.a.material('material-remove', MATERIAL); assert.equal(h.calls.length, usedCount);
  h.response(() => materialDto('2')); await h.a.load();
  h.confirm = () => { h.identity({ user: { id: 'author', mustChangePassword: false } }); return true; };
  const staleCount = h.calls.length; await h.a.material('material-remove', MATERIAL); assert.equal(h.calls.length, staleCount); assert.equal(h.records.size, 0);
  const removal = harness(); await removal.load(); removal.response(() => materialDto()); await removal.a.load();
  removal.response(() => receipt('2')); await removal.a.material('material-remove', MATERIAL);
  assert.deepEqual(removal.calls.at(-1).body, { metadata, resourceEdits: [], mapEdits: [{ op: 'material-remove', materialId: MATERIAL }] });
  assert.equal(removal.model().context.verified, false); assert.equal(removal.model().materials.locked, true);
});
test('material confirmations reject in-place actor/version changes without creating an operation', async () => {
  for (const op of ['material-capture', 'material-rename', 'material-remove']) for (const field of ['id', 'version', 'mustChangePassword']) {
    const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); h.prompt = '新素材';
    h.confirm = () => {
      const identity = h.currentIdentity();
      if (field === 'version') identity.version = 2;
      else if (field === 'id') identity.user.id = 'another';
      else identity.user.mustChangePassword = true;
      return true;
    };
    const count = h.calls.length; await h.a.material(op, op === 'material-capture' ? ['piece'] : MATERIAL);
    assert.equal(h.calls.length, count); assert.equal(h.records.size, 0);
  }
});
test('material DTO is complete, identity-bound and atomic; missing DTO is unknown, not an empty library', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().materials.supported, false);
  const good = materialDto(); h.response(() => good); await h.a.load();
  for (const mutate of [x => { x.materialDefinitions.push(x.materialDefinitions[0]); }, x => { x.decorationInstances.push(x.decorationInstances[0]); }, x => { x.materialDefinitions[1].materialId = `${H}#material-${'c'.repeat(64)}`; }, x => { x.materialDefinitions[0].references = []; }, x => { x.decorationInstances = []; }, x => { x.decorationInstances[0].x = 384; }, x => { x.materialDefinitions[1].references = ['unknown']; }, x => { x.materialDefinitions[1].extra = 1; }]) {
    const bad = structuredClone(good); mutate(bad); h.response(() => bad); const errors = h.errors.length; await h.a.load();
    assert.equal(h.errors.length, errors + 1); assert.deepEqual(h.model().materials.rows, good.materialDefinitions);
  }
  h.response(() => ({ ...good, profileRevision: 'fixed-copy-resources-1', generalDefinitions: null, generalReferences: null })); await h.a.load();
  assert.equal(h.model().materials.supported, true); assert.equal(h.model().materials.locked, false);
  h.response(() => dto()); await h.a.load(); assert.equal(h.model().materials.supported, false); assert.equal(h.model().materials.locked, true);
  const count = h.calls.length; await h.a.material('material-remove', MATERIAL); assert.equal(h.calls.length, count);
});
test('material refresh restores only key; storage failure and oversized request never POST', async () => {
  const h = harness(); await h.load(); h.response(() => materialDto()); await h.a.load(); h.prompt = '素材';
  h.response(() => { throw new Error('unknown'); }); await h.a.material('material-capture', ['piece']);
  const recovered = harness({ records: h.records }); assert.equal(recovered.model().retryLocked, true);
  recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query();
  assert.equal(recovered.calls.length, 1); assert.equal(recovered.calls[0].body, undefined); assert.equal(recovered.model().materials.locked, true);
  const q = harness({ failSet: true }); await q.load(); q.response(() => materialDto()); await q.a.load(); q.prompt = '素材';
  const count = q.calls.length; await q.a.material('material-capture', ['piece']); assert.equal(q.calls.length, count); assert.equal(q.records.size, 0);
  const large = materialDto(); large.decorationInstances = Array.from({ length: 90 }, (_, n) => ({ instanceId: 'x'.repeat(200) + n, materialId: 'raw-tile', x: n, y: 0 }));
  large.materialDefinitions[0].references = large.decorationInstances.map(row => `裝飾:${row.instanceId}`);
  q.response(() => large); await q.a.load(); const budgetCount = q.calls.length;
  await q.a.material('material-capture', large.decorationInstances.map(row => row.instanceId)); assert.equal(q.calls.length, budgetCount);
  assert.match(q.errors.at(-1).message, /16KiB/);
});
test('city rename shares exact revision journal, preserves other inputs and requires reread', async () => {
  const h = harness(); await h.load();
  const rows = [cityRow(), cityRow({ cityId: 'city-1', name: '同名', runtimeSlot: 1, x: 3, y: 4 })];
  h.response(() => cityDto('1', rows)); await h.a.load();
  h.model().cities.rows[0].name = 'forged'; h.c.render(); assert.equal(h.model().cities.rows[0].name, null);
  h.a.setField('name', '未保存'); h.a.setDefinitionField('name', '未存人物'); h.a.setField('revision', '99');
  h.prompt = ' e\u0301𠀀 '; h.response(() => { throw new Error('lost response'); }); await h.a.cityRename('city-0');
  const original = structuredClone(h.calls.at(-1));
  assert.deepEqual(original.body, { metadata, resourceEdits: [], cityEdits: [{ op: 'rename', cityId: 'city-0', name: 'é𠀀' }] });
  assert.equal(original.options.revision, '1'); assert.equal(h.model().cities.locked, true);
  const count = h.calls.length; await h.a.cityRename('city-1'); assert.equal(h.calls.length, count);
  h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().definitions.form.name, '未存人物');
  assert.equal(h.model().context.verified, false); assert.equal(h.model().fields.revision, '2');
  h.response(() => cityDto('2', [{ ...rows[0], name: 'é𠀀' }, rows[1]])); await h.a.load();
  assert.ok(h.calls.at(-1).path.endsWith('?revision=2')); assert.equal(h.model().cities.locked, false);
});
test('city DTO unknown and invalid rows fail closed; cancellation, identity changes and invalid text never save', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().cities.supported, false);
  const good = cityDto();
  h.response(() => good); await h.a.load();
  for (const cityDefinitions of [[cityRow({ cityId: '' })], [cityRow({ name: ' bad ' })], [cityRow({ slot: 0 })], [good.cityDefinitions[0], good.cityDefinitions[0]]]) {
    h.response(() => ({ ...good, cityDefinitions })); await h.a.load(); assert.deepEqual(h.model().cities.rows, good.cityDefinitions);
  }
  const before = h.calls.length;
  for (const text of [null, '', '\u0000bad', '\ud800', '大'.repeat(6000)]) { h.prompt = text; await h.a.cityRename('city-0'); }
  h.prompt = '新名'; h.confirm = false; await h.a.cityRename('city-0');
  h.confirm = () => { h.identity({ user: { id: 'author', mustChangePassword: false } }); return true; }; await h.a.cityRename('city-0');
  assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
});
test('city reload restores only key association and cannot reconstruct original body', async () => {
  const h = harness(); await h.load(); h.response(() => cityDto()); await h.a.load();
  h.prompt = '新名'; h.response(() => { throw new Error('unknown'); }); await h.a.cityRename('city-0');
  const recovered = harness({ records: h.records }); assert.equal(recovered.model().retryLocked, true);
  recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query();
  assert.equal(recovered.model().context.verified, false); assert.equal(recovered.model().fields.gameId, G); assert.equal(recovered.model().fields.revision, '2');
  assert.equal(recovered.calls.length, 1); assert.equal(recovered.calls[0].body, undefined);
});
test('chapter city configure/remove keeps single journal, saved metadata and dirty forms; original retry and reread', async () => {
  for (const op of ['set', 'remove']) {
    const h = harness(); await h.load();
    h.response(() => cityDto('1', undefined, op === 'remove' ? ['city-0'] : [])); await h.a.load();
    h.a.setField('name', '未保存'); h.a.setDefinitionField('name', '人物未存'); h.a.setField('revision', '99');
    h.response(() => { throw new Error('lost'); }); await h.a.chapterCity(op, 'first', 'city-0');
    const original = structuredClone(h.calls.at(-1)), edit = { op, chapterId: 'first', cityId: 'city-0' };
    if (op === 'set') edit.values = { factionId: null, overrides: {} };
    assert.deepEqual(original.body, { metadata, resourceEdits: [], chapterCityEdits: [edit] });
    assert.equal(original.options.revision, '1'); assert.equal(h.model().cities.locked, true);
    const count = h.calls.length; await h.a.chapterCity(op, 'first', 'city-0'); assert.equal(h.calls.length, count);
    const recovered = harness({ records: new Map(h.records) }); assert.equal(recovered.model().retryLocked, true);
    recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query();
    assert.equal(recovered.calls.length, 1); assert.equal(recovered.calls[0].body, undefined); assert.equal(recovered.model().context.verified, false);
    h.response(() => { throw Object.assign(new Error('absent'), { status: 404 }); }); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
    assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().definitions.form.name, '人物未存'); assert.equal(h.model().context.verified, false);
    h.response(() => cityDto('2', undefined, op === 'set' ? ['city-0'] : [])); await h.a.load();
    assert.equal(h.model().cities.locked, false); assert.ok(h.calls.at(-1).path.endsWith('?revision=2'));
  }
});
test('chapter city DTO validation is atomic, unknown locks writes; confirmation context and quota refuse', async () => {
  const h = harness(); await h.load(); const good = cityDto('1', undefined, ['city-0']);
  h.response(() => good); await h.a.load();
  h.model().cities.chapters[0].cities[0].values.name = 'forged'; h.c.render(); assert.equal(h.model().cities.chapters[0].cities[0].values.name, null);
  for (const patch of [[], [good.chapterCities[0], good.chapterCities[0]], [{ ...good.chapterCities[0], chapterId: 'other' }], [{ chapterId: 'first', cities: [{ ...good.chapterCities[0].cities[0], factionId: 'other' }] }], [{ chapterId: 'first', cities: [{ ...good.chapterCities[0].cities[0], values: { name: 'mismatch' } }] }], [{ chapterId: 'first', cities: [good.chapterCities[0].cities[0], good.chapterCities[0].cities[0]] }], [{ chapterId: 'first', cities: [{ ...good.chapterCities[0].cities[0], overrides: 1 }] }], [{ chapterId: 'first', cities: [{ ...good.chapterCities[0].cities[0], values: [] }] }]]) {
    h.response(() => ({ ...good, draftRevision: '1', chapterCities: patch })); await h.a.load(); assert.deepEqual(h.model().cities.chapters, good.chapterCities);
  }
  h.response(() => ({ ...good, chapterCities: undefined })); await h.a.load(); assert.equal(h.model().cities.referencesKnown, false);
  const count = h.calls.length; h.prompt = '新名'; await h.a.cityRename('city-0'); await h.a.chapterCity('set', 'first', 'city-0'); assert.equal(h.calls.length, count);
  for (const mode of ['cancel', 'identity', 'game', 'quota', 'unknown', 'duplicate']) {
    const c = harness({ failSet: mode === 'quota' }); await c.load(); c.response(() => cityDto('1', undefined, mode === 'duplicate' ? ['city-0'] : [])); await c.a.load();
    const before = c.calls.length;
    c.confirm = () => { if (mode === 'identity') c.identity(null); if (mode === 'game') c.c.adoptGame(H); return mode !== 'cancel'; };
    await c.a.chapterCity('set', mode === 'unknown' ? 'unknown' : 'first', 'city-0'); assert.equal(c.calls.length, before);
  }
});
test('city impact confirmation captures exact chapter fields and reload only recovers original association', async () => {
  const h = harness(); await h.load(); h.response(() => cityDto('1', undefined, ['city-0'])); await h.a.load();
  h.prompt = ' 新名 '; h.confirm = text => { assert.match(text, /\[first\] name/); return false; };
  const before = h.calls.length; await h.a.cityRename('city-0'); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
  h.confirm = true; h.response(() => { throw new Error('lost'); }); await h.a.cityRename('city-0');
  const original = structuredClone(h.calls.at(-1)); assert.deepEqual(original.body.cityEdits[0].confirmedImpacts, [{ chapterId: 'first', fields: ['name'] }]);
  const recovered = harness({ records: h.records }); assert.equal(recovered.model().retryLocked, true);
  recovered.response(() => ({ state: 'committed', result: receipt('2') })); await recovered.a.query(); assert.equal(recovered.calls.length, 1); assert.equal(recovered.calls[0].body, undefined); assert.equal(recovered.model().context.verified, false);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query(); h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
});
const previewBytes = new Uint8Array(250 * 167 * 3).fill(7);
const previewHash = createHash('sha256').update(previewBytes).digest('hex');
const previewDto = () => ({ format: 'dragon-draft-minimap-1', gameId: G, draftRevision: '1', sourceDigest: SHA, styleRevision: 'minimap-style-2-bands-dither', textureSeed: 1, width: 250, height: 167, pixelFormat: 'rgb8', pixelsSha256: previewHash, pixelsHex: Buffer.from(previewBytes).toString('hex') });
function previewCanvas() {
  const canvas = { width: 1, height: 1, pixels: null };
  canvas.getContext = () => ({ clearRect() { canvas.pixels = null; }, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }, putImageData(image) { canvas.pixels = image.data.slice(); } });
  return canvas;
}
async function readyPreview(options = {}) {
  const canvas = previewCanvas(), h = harness({ ...options, minimapCanvas: canvas }); await h.load();
  h.response(() => ({ ...dto(), sourceDigest: SHA })); await h.a.load(); return { h, canvas };
}
test('minimap uses the loaded revision and real SHA, private RGB never enters the projection or journal', async () => {
  const { h, canvas } = await readyPreview(); const before = h.calls.length;
  h.a.setField('revision', '9'); h.a.setField('name', '未保存');
  h.response(() => previewDto()); await h.a.minimap();
  assert.equal(h.calls.length, before + 1); assert.equal(h.calls.at(-1).path, `/api/games/${G}/draft/minimap?revision=1`);
  assert.equal(h.calls.at(-1).body, undefined); assert.equal(h.records.size, 0); assert.deepEqual(h.errors, []);
  assert.equal(h.model().minimap.ready, true); assert.deepEqual(Object.keys(h.model().minimap).sort(), ['info','locked','ready']);
  assert.equal(canvas.width, 250); assert.equal(canvas.height, 167); assert.deepEqual(canvas.pixels.slice(0, 4), Uint8ClampedArray.of(7,7,7,255));
  assert.deepEqual(canvas.pixels.slice(-4), Uint8ClampedArray.of(7,7,7,255));
  h.model().minimap.info.sourceDigest = 'forged'; h.c.render(); assert.equal(h.model().minimap.info.sourceDigest, SHA);
  h.identity(null); assert.equal(canvas.pixels, null); assert.equal(h.model().minimap.ready, false);
});
test('minimap refuses malformed identity, format and digest, leaving no stale pixels', async () => {
  const { h, canvas } = await readyPreview();
  const invalid = [{ gameId: H }, { draftRevision: '2' }, { sourceDigest: 'c'.repeat(64) }, { width: 251 }, { height: 168 }, { textureSeed: 2 }, { pixelFormat: 'rgba8' }, { pixelsHex: '00' }, { pixelsHex: 'x'.repeat(250 * 167 * 6) }, { pixelsSha256: 'c'.repeat(64) }, { styleRevision: '<img>' }, { extra: true }];
  for (const changes of invalid) {
    h.response(() => previewDto()); await h.a.minimap(); assert.ok(canvas.pixels);
    h.response(() => ({ ...previewDto(), ...changes })); await h.a.minimap();
    assert.equal(canvas.pixels, null); assert.equal(h.model().minimap.ready, false);
  }
  assert.equal(h.errors.length, invalid.length); assert.equal(h.records.size, 0);
  h.response(() => previewDto()); await h.a.minimap();
  h.response(() => ({ ...dto(), sourceDigest: 'bad' })); await h.a.load();
  assert.equal(h.model().minimap.ready, true, 'invalid draft read preserves the old validated projection');
});
test('late minimap API and hashing responses cannot repaint changed identity or game', async () => {
  for (const phase of ['api', 'hash']) for (const change of ['identity', 'game']) {
    let release, entered; const started = new Promise(resolve => { entered = resolve; });
    const options = phase === 'hash' ? { digestPixels: () => new Promise(resolve => { release = resolve; entered(); }) } : {};
    const { h, canvas } = await readyPreview(options);
    h.response(() => phase === 'api' ? new Promise(resolve => { release = resolve; entered(); }) : previewDto());
    const pending = h.a.minimap(); await started;
    if (change === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } }); else h.c.adoptGame(H);
    release(phase === 'api' ? previewDto() : previewHash); await pending;
    assert.equal(canvas.pixels, null); assert.equal(h.model().minimap.ready, false); assert.deepEqual(h.errors, []);
  }
});
test('legacy missing source digest disables preview, and saving invalidates pixels until an exact reread', async () => {
  const legacy = harness(); await legacy.load(); const count = legacy.calls.length;
  await legacy.a.minimap(); assert.equal(legacy.calls.length, count); assert.equal(legacy.model().minimap.locked, true);
  const { h, canvas } = await readyPreview(); h.response(() => previewDto()); await h.a.minimap();
  h.response(() => { assert.equal(canvas.pixels, null, 'clear before save POST'); return receipt('2'); }); await h.a.save();
  assert.equal(h.model().minimap.locked, true); assert.equal(canvas.pixels, null);
  const after = h.calls.length; await h.a.minimap(); assert.equal(h.calls.length, after);
  h.response(() => ({ ...dto('2'), sourceDigest: SHA })); await h.a.load(); assert.equal(h.model().minimap.locked, false);
});
const waterRow = () => ({ groupId: 'river-1', name: '<img>', showOnMinimap: true, memberCount: 2, baseCellCount: 0 });
const waterDto = revision => ({ ...dto(revision), waterGroups: [waterRow()] });
const splitDto = revision => ({ ...waterDto(revision), waterGroups: [{ ...waterRow(), baseCellCount: 2 }], waterGroupMembers: [{ groupId: 'river-1', memberIds: ['a','b'], baseCells: [0, 98303] }] });
const waterCreateDto = revision => ({ ...splitDto(revision), waterCreateCandidates: { memberIds: ['a', 'b', 'ungrouped'], baseCells: [0, 98303, 24] } });
test('water creation candidates are isolated and atomic; absent candidates or members lock only creation', async () => {
  const h = harness(); await h.load(); h.response(() => splitDto('1')); await h.a.load();
  assert.equal(h.model().water.createLocked, true); assert.equal(h.model().water.splitLocked, false);
  const d = waterCreateDto('1'); h.response(() => d); await h.a.load();
  assert.equal(h.model().water.createLocked, false);
  d.waterCreateCandidates.memberIds[0] = 'forged'; h.model().water.createCandidates.baseCells[0] = 25; h.c.render();
  assert.deepEqual(h.model().water.createCandidates, waterCreateDto('1').waterCreateCandidates);
  for (const candidates of [[], {}, { memberIds: ['a', 'a'], baseCells: [] }, { memberIds: Array(1), baseCells: [] }, { memberIds: [''], baseCells: [] }, { memberIds: [], baseCells: [0, 0] }, { memberIds: [], baseCells: [-0] }, { memberIds: [], baseCells: [98304] }, { memberIds: [], baseCells: [], extra: true }]) {
    h.response(() => ({ ...waterCreateDto('2'), waterCreateCandidates: candidates })); await h.a.load();
    assert.equal(h.model().context.draftRevision, '1'); assert.deepEqual(h.model().water.createCandidates, waterCreateDto('1').waterCreateCandidates);
  }
  h.response(() => ({ ...waterCreateDto('1'), waterGroupMembers: undefined })); await h.a.load(); assert.equal(h.model().water.createLocked, true);
  h.identity(null); assert.equal(h.model().water.createCandidates, null);
});
test('water create freezes selection, shows affected groups and reuses one journal without optimistic changes', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const data = () => ({ ...waterCreateDto('1'), profileRevision: profile, generalDefinitions: profile === 'fixed-copy-resources-1' ? null : [], generalReferences: profile === 'fixed-copy-resources-1' ? null : [] });
    const h = harness(); await h.load(); h.response(data); await h.a.load();
    h.a.setField('name', '未存'); h.a.setField('revision', '99'); const members = ['a', 'ungrouped'], cells = [24]; let prompts = 0;
    h.prompt = () => { prompts++; members.push('b'); cells.push(98303); return '  新e\u0301𠀀  '; };
    h.confirm = text => { assert.match(text, /river-1/); assert.match(text, /原組保留/); assert.match(text, /不在小地圖顯示/); return true; };
    h.response(() => { throw new Error('owned create response loss'); }); await h.a.waterCreate(members, cells, false);
    const sent = structuredClone(h.calls.at(-1));
    assert.deepEqual(sent.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'water-create', memberIds: ['a', 'ungrouped'], baseCells: [24], name: '新e\u0301𠀀', showOnMinimap: false }] });
    assert.equal(sent.options.revision, '1'); assert.deepEqual(h.model().water.rows, data().waterGroups);
    const n = h.calls.length; await h.a.waterCreate(['a'], [], true); await h.a.retry(); assert.equal(h.calls.length, n);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), sent); assert.equal(prompts, 1);
    assert.equal(h.model().fields.name, '未存'); assert.equal(h.model().water.createLocked, true);
  }
});
test('water creation rejects bad selection, dialog invalidation and failed journal; refresh only recovers a key', async () => {
  for (const mode of ['empty', 'duplicate', 'sparse', 'unknown', 'bad-cell', 'bad-visible', 'cancel', 'prompt-identity', 'confirm-version', 'quota', 'budget']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load(); const d = waterCreateDto('1');
    if (mode === 'budget') d.waterCreateCandidates.memberIds = Array.from({ length: 300 }, (_, i) => `${i}-${'x'.repeat(100)}`);
    h.response(() => d); await h.a.load(); const n = h.calls.length;
    h.prompt = () => { if (mode === 'prompt-identity') h.identity({ user: { id: 'other', mustChangePassword: false } }); return '新組'; };
    h.confirm = () => { if (mode === 'confirm-version') h.currentIdentity().version = 2; return mode !== 'cancel'; };
    let members = ['a'], cells = [], visible = true;
    if (mode === 'empty') members = [];
    if (mode === 'duplicate') members = ['a', 'a'];
    if (mode === 'sparse') members = Array(1);
    if (mode === 'unknown') members = ['missing'];
    if (mode === 'bad-cell') cells = [-0];
    if (mode === 'bad-visible') visible = undefined;
    if (mode === 'budget') members = d.waterCreateCandidates.memberIds;
    await h.a.waterCreate(members, cells, visible); assert.equal(h.calls.length, n, mode); assert.equal(h.records.size, 0, mode);
  }
  const first = harness(); await first.load(); first.response(() => waterCreateDto('1')); await first.a.load(); first.prompt = '新組';
  first.response(() => { throw new Error('owned response loss'); }); await first.a.waterCreate([], [24], true);
  const sent = first.calls.at(-1), next = harness({ records: first.records });
  const n = next.calls.length; await next.a.retry(); assert.equal(next.calls.length, n); assert.equal(next.model().retryLocked, true);
  next.response(() => ({ state: 'committed', result: receipt('2') })); await next.a.query();
  assert.ok(next.calls.at(-1).path.endsWith(sent.options.key)); assert.equal(next.calls.at(-1).body, undefined);
});
test('water membership is complete, isolated and atomic; missing means unknown, not empty', async () => {
  const h = harness(); await h.load(); h.response(() => splitDto('1')); await h.a.load();
  assert.equal(h.model().water.splitLocked, false);
  h.model().water.members[0].memberIds[0] = 'forged'; h.model().water.members[0].baseCells[0] = 100; h.c.render();
  assert.deepEqual(h.model().water.members, splitDto('1').waterGroupMembers);
  const valid = splitDto('1').waterGroupMembers[0];
  for (const rows of [[], [valid, valid], [{ ...valid, groupId: 'missing' }], [{ ...valid, memberIds: ['a'] }], [{ ...valid, memberIds: ['a','a'] }], [{ ...valid, baseCells: [0,0] }], [{ ...valid, baseCells: [0,98304] }], [{ ...valid, baseCells: [0,0.5] }], [{ ...valid, extra: true }]]) {
    h.response(() => ({ ...splitDto('2'), waterGroupMembers: rows })); await h.a.load();
    assert.equal(h.model().context.draftRevision, '1'); assert.deepEqual(h.model().water.members, [valid]);
  }
  h.response(() => ({ ...splitDto('1'), waterGroups: [...splitDto('1').waterGroups, { ...waterRow(), groupId: 'other' }], waterGroupMembers: [valid, { groupId: 'other', memberIds: ['a','c'], baseCells: [] }] })); await h.a.load();
  assert.deepEqual(h.model().water.members, [valid], 'cross-group duplicate member is invalid');
  h.response(() => waterDto('1')); await h.a.load(); assert.equal(h.model().water.locked, false); assert.equal(h.model().water.splitLocked, true);
  const count = h.calls.length; await h.a.waterSplit('river-1', ['a'], []); assert.equal(h.calls.length, count);
  h.identity(null); assert.equal(h.model().water.members, null);
});
test('water split captures member/base selections before dialogs and recovers exact original body for both profiles', async () => {
  for (const profile of ['fixed-template-authoring-1','fixed-copy-resources-1']) for (const kind of ['members','base','mixed']) {
    const h = harness(); await h.load();
    h.response(() => ({ ...splitDto('1'), profileRevision: profile, generalDefinitions: profile === 'fixed-copy-resources-1' ? null : [], generalReferences: profile === 'fixed-copy-resources-1' ? null : [] })); await h.a.load();
    h.a.setField('name', '未保存'); h.a.setField('revision', '9');
    const members = kind === 'base' ? [] : ['a'], cells = kind === 'members' ? [] : [0];
    const capturedMembers = [...members], capturedCells = [...cells]; let prompts = 0;
    h.prompt = () => { prompts++; members.push('b'); cells.push(98303); return '  拆e\u0301𠀀  '; };
    h.confirm = text => { assert.match(text, /繼承原小地圖顯示/); assert.match(text, /原組保留/); return true; };
    h.response(() => { throw new Error('owned split reply loss'); }); await h.a.waterSplit('river-1', members, cells);
    const original = structuredClone(h.calls.at(-1));
    assert.deepEqual(original.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'water-split', sourceGroupId: 'river-1', memberIds: capturedMembers, baseCells: capturedCells, name: '拆e\u0301𠀀' }] });
    assert.equal(original.options.revision, '1'); assert.deepEqual(h.model().water.members, splitDto('1').waterGroupMembers);
    const count = h.calls.length; await h.a.retry(); assert.equal(h.calls.length, count);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
    assert.equal(prompts, 1); assert.equal(h.model().water.splitLocked, true); assert.equal(h.model().fields.name, '未保存');
  }
});
test('water split invalid subsets, cancellation, quota and dialog context changes cannot write', async () => {
  for (const mode of ['prompt-cancel','confirm-cancel','empty','all','duplicate','unknown','bad-cell','bad-type','bad-name','quota','prompt-identity','prompt-context','confirm-identity','confirm-context']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load(); h.response(() => splitDto('1')); await h.a.load();
    const before = h.calls.length; let confirmations = 0;
    h.prompt = () => { if (mode === 'prompt-cancel') return null; if (mode === 'prompt-identity') h.identity({ user: { id: 'author', mustChangePassword: false } }); if (mode === 'prompt-context') h.c.adoptGame(H); return mode === 'bad-name' ? 'bad\ud800' : '拆出'; };
    h.confirm = () => { confirmations++; if (mode === 'confirm-identity') h.identity({ user: { id: 'author', mustChangePassword: false } }); if (mode === 'confirm-context') h.c.adoptGame(H); return mode !== 'confirm-cancel'; };
    let members = ['a'], cells = [];
    if (mode === 'empty') members = [];
    if (mode === 'all') { members = ['a','b']; cells = [0,98303]; }
    if (mode === 'duplicate') members = ['a','a'];
    if (mode === 'unknown') members = ['missing'];
    if (mode === 'bad-cell') cells = [0.5];
    if (mode === 'bad-type') members = 'a';
    await h.a.waterSplit('river-1', members, cells); assert.equal(h.calls.length, before, mode); assert.equal(h.records.size, 0, mode);
    if (mode.startsWith('prompt-') || ['empty','all','duplicate','unknown','bad-cell','bad-type','bad-name'].includes(mode)) assert.equal(confirmations, 0, mode);
  }
});
test('water split reload only queries the original key and explicitly reads the exact server ID', async () => {
  const first = harness(); await first.load(); first.response(() => splitDto('1')); await first.a.load(); first.prompt = '拆出';
  first.response(() => { throw new Error('owned split reply loss'); }); await first.a.waterSplit('river-1', ['a'], [0]);
  const h = harness({ records: first.records }); await h.a.retry(); assert.equal(h.calls.length, 0);
  h.response(() => ({ state: 'committed', result: receipt('2') })); await h.a.query(); assert.equal(h.model().water.splitLocked, true);
  const id = `${G}#water-${'d'.repeat(64)}`, data = splitDto('2');
  data.waterGroups = [{ ...waterRow(), memberCount: 1, baseCellCount: 1 }, { ...waterRow(), groupId: id, name: '拆出', memberCount: 1, baseCellCount: 1 }];
  data.waterGroupMembers = [{ groupId: 'river-1', memberIds: ['b'], baseCells: [98303] }, { groupId: id, memberIds: ['a'], baseCells: [0] }];
  h.response(() => data); await h.a.load(); assert.equal(h.calls.length, 2); assert.match(h.calls.at(-1).path, /revision=2$/);
  assert.equal(h.model().water.splitLocked, false); assert.deepEqual(h.model().water.members, data.waterGroupMembers);
});
test('water merge captures ordered IDs and explicit visibility, recovers original body for both profiles', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const h = harness(); await h.load();
    const rows = [waterRow(), { ...waterRow(), groupId: 'lake-2', name: '湖', showOnMinimap: false }];
    h.response(() => ({ ...waterDto('1'), profileRevision: profile, generalDefinitions: profile === 'fixed-copy-resources-1' ? null : [], generalReferences: profile === 'fixed-copy-resources-1' ? null : [], waterGroups: rows }));
    await h.a.load(); h.a.setField('name', '未保存');
    const ids = ['lake-2', 'river-1']; let prompts = 0;
    h.prompt = () => { prompts++; ids[0] = 'river-1'; ids[1] = 'lake-2'; return '  合併e\u0301𠀀  '; };
    h.confirm = text => { assert.ok(text.indexOf('[lake-2]') < text.indexOf('[river-1]')); assert.match(text, /不在小地圖顯示/); return true; };
    h.response(() => { throw new Error('owned merge response loss'); }); await h.a.waterMerge(ids, false);
    const original = structuredClone(h.calls.at(-1));
    assert.deepEqual(original.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'water-merge', groupIds: ['lake-2','river-1'], name: '合併e\u0301𠀀', showOnMinimap: false }] });
    assert.deepEqual(h.model().water.rows, rows); assert.equal(original.options.revision, '1');
    const count = h.calls.length; await h.a.retry(); assert.equal(h.calls.length, count);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original); assert.equal(prompts, 1);
    assert.equal(h.model().water.locked, true); assert.equal(h.model().fields.name, '未保存');
  }
});
test('water merge invalid input, cancellation, quota and dialog context changes make no writes', async () => {
  for (const mode of ['prompt-cancel','confirm-cancel','empty','one','duplicate','unknown','type','quota','prompt-identity','prompt-context','confirm-identity','confirm-context']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load();
    h.response(() => ({ ...waterDto('1'), waterGroups: [waterRow(), { ...waterRow(), groupId: 'lake-2' }] })); await h.a.load();
    const before = h.calls.length; let confirmations = 0;
    h.prompt = () => {
      if (mode === 'prompt-cancel') return null;
      if (mode === 'prompt-identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      if (mode === 'prompt-context') h.c.adoptGame(H);
      return '新組合';
    };
    h.confirm = () => { confirmations++; if (mode === 'confirm-identity') h.identity({ user: { id: 'author', mustChangePassword: false } }); if (mode === 'confirm-context') h.c.adoptGame(H); return mode !== 'confirm-cancel'; };
    const ids = ({ empty: [], one: ['river-1'], duplicate: ['river-1','river-1'], unknown: ['river-1','missing'] })[mode] ?? ['river-1','lake-2'];
    await h.a.waterMerge(ids, mode === 'type' ? 'false' : true);
    assert.equal(h.calls.length, before, mode); assert.equal(h.records.size, 0, mode);
    if (mode.startsWith('prompt-') || ['empty','one','duplicate','unknown','type'].includes(mode)) assert.equal(confirmations, 0, mode);
  }
});
test('water merge reload queries original receipt and reads the server identity at the exact revision', async () => {
  const first = harness(); await first.load(); first.response(() => ({ ...waterDto('1'), waterGroups: [waterRow(), { ...waterRow(), groupId: 'lake-2' }] })); await first.a.load();
  first.prompt = '新組合'; first.response(() => { throw new Error('owned merge reply loss'); }); await first.a.waterMerge(['river-1','lake-2'], true);
  const h = harness({ records: first.records }); await h.a.retry(); assert.equal(h.calls.length, 0);
  h.response(() => ({ state: 'committed', result: receipt('2') })); await h.a.query(); assert.equal(h.model().water.locked, true);
  const serverId = `${G}#water-${'c'.repeat(64)}`;
  h.response(() => ({ ...waterDto('2'), waterGroups: [{ ...waterRow(), groupId: serverId, name: '新組合', memberCount: 4 }] })); await h.a.load();
  assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.calls.length, 2); assert.equal(h.model().water.rows[0].groupId, serverId);
});
test('water naming keeps original operation recovery and unrelated forms for both profiles', async () => {
  for (const profile of ['fixed-template-authoring-1', 'fixed-copy-resources-1']) {
    const h = harness(); await h.load();
    const data = revision => ({ ...waterDto(revision), profileRevision: profile, generalDefinitions: profile === 'fixed-copy-resources-1' ? null : [], generalReferences: profile === 'fixed-copy-resources-1' ? null : [] });
    h.response(() => data('1')); await h.a.load(); h.a.setField('name', '未保存');
    let prompts = 0; h.prompt = () => { prompts++; return '  e\u0301河𠀀  '; };
    h.response(() => { throw new Error('owned name reply loss'); }); await h.a.waterRename('river-1');
    const original = structuredClone(h.calls.at(-1));
    assert.deepEqual(original.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'water-rename', groupId: 'river-1', name: 'e\u0301河𠀀' }] });
    assert.equal(original.options.revision, '1'); assert.equal(h.model().water.rows[0].name, '<img>');
    const before = h.calls.length; await h.a.retry(); assert.equal(h.calls.length, before);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
    h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
    assert.equal(prompts, 1); assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().water.locked, true);
    h.response(() => ({ ...data('2'), waterGroups: [{ ...waterRow(), name: 'e\u0301河𠀀' }] })); await h.a.load();
    assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.model().water.rows[0].name, 'e\u0301河𠀀');
  }
});
test('water naming cancellation, invalid input, quota and both dialog context boundaries refuse writes', async () => {
  for (const mode of ['prompt-cancel', 'confirm-cancel', 'noop', 'empty', 'control', 'surrogate', 'long', 'bad-id', 'quota', 'prompt-identity', 'prompt-context', 'confirm-identity', 'confirm-context']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load(); h.response(() => waterDto('1')); await h.a.load();
    const before = h.calls.length; let confirmations = 0;
    h.prompt = () => {
      if (mode === 'prompt-cancel') return null;
      if (mode === 'prompt-identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      if (mode === 'prompt-context') h.c.adoptGame(H);
      return ({ noop: '  <img>  ', empty: ' ', control: 'bad\u0085', surrogate: 'bad\ud800', long: '𠀀'.repeat(65) })[mode] ?? '新名稱';
    };
    h.confirm = () => {
      confirmations++;
      if (mode === 'confirm-identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      if (mode === 'confirm-context') h.c.adoptGame(H);
      return mode !== 'confirm-cancel';
    };
    await h.a.waterRename(mode === 'bad-id' ? 'missing' : 'river-1');
    assert.equal(h.calls.length, before, mode); assert.equal(h.records.size, 0, mode);
    if (mode.startsWith('prompt-') || ['noop','empty','control','surrogate','long','bad-id'].includes(mode)) assert.equal(confirmations, 0, mode);
  }
});
test('water name reload only queries original operation and then reads its exact revision', async () => {
  const first = harness(); await first.load(); first.response(() => waterDto('1')); await first.a.load();
  first.prompt = '新名稱'; first.response(() => { throw new Error('owned lost name response'); }); await first.a.waterRename('river-1');
  const h = harness({ records: first.records }); const before = h.calls.length;
  await h.a.retry(); assert.equal(h.calls.length, before);
  h.response(() => ({ state: 'committed', result: receipt('2') })); await h.a.query();
  assert.equal(h.calls.length, 1); assert.equal(h.model().water.locked, true);
  h.response(() => ({ ...waterDto('2'), waterGroups: [{ ...waterRow(), name: '新名稱' }] })); await h.a.load();
  assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.model().water.rows[0].name, '新名稱');
});
test('water summaries are isolated, missing is unknown, malformed read is atomic', async () => {
  const h = harness(); await h.load(); assert.equal(h.model().water.locked, true);
  h.response(() => waterDto('1')); await h.a.load(); assert.equal(h.model().water.locked, false);
  h.model().water.rows[0].showOnMinimap = false; h.c.render(); assert.equal(h.model().water.rows[0].showOnMinimap, true);
  for (const rows of [[waterRow(), waterRow()], [{ ...waterRow(), showOnMinimap: 0 }], [{ ...waterRow(), memberCount: -1 }], [{ ...waterRow(), baseCellCount: 0.5 }], [{ ...waterRow(), memberCount: 0 }], [{ ...waterRow(), extra: true }]]) {
    h.response(() => ({ ...waterDto('1'), waterGroups: rows })); await h.a.load(); assert.deepEqual(h.model().water.rows, [waterRow()]);
  }
  h.response(() => ({ ...waterDto('1'), profileRevision: 'fixed-copy-resources-1', generalDefinitions: null, generalReferences: null })); await h.a.load(); assert.deepEqual(h.model().water.rows, [waterRow()]);
  h.identity(null); assert.deepEqual(h.model().water.rows, []);
});
test('full-copy water commands retain original-key recovery without opening neutral entity editing', async () => {
  const h = harness(); await h.load();
  const full = revision => ({ ...waterDto(revision), profileRevision: 'fixed-copy-resources-1', generalDefinitions: null, generalReferences: null, chapterPeople: null });
  h.response(() => full('1')); await h.a.load();
  assert.equal(h.model().water.locked, false); assert.equal(h.model().definitions.locked, true);
  h.response(() => { throw new Error('owned full-copy response loss'); }); await h.a.waterVisibility('river-1', false);
  const original = structuredClone(h.calls.at(-1)); assert.deepEqual(original.body.mapEdits, [{ op: 'water-visibility', groupId: 'river-1', showOnMinimap: false }]);
  const pending = h.calls.length; await h.a.retry(); assert.equal(h.calls.length, pending);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
  assert.equal(h.model().water.locked, true);
  h.response(() => ({ ...full('2'), waterGroups: [{ ...waterRow(), showOnMinimap: false }] })); await h.a.load();
  assert.equal(h.model().water.locked, false); assert.equal(h.model().water.rows[0].showOnMinimap, false);
  assert.equal(h.model().definitions.locked, true);
});
test('water command uses saved metadata, original key and exact reread without clearing other forms', async () => {
  const h = harness(); await h.load(); h.response(() => waterDto('1')); await h.a.load();
  h.a.setField('name', '未保存'); h.a.setDefinitionField('name', '未存武將');
  h.response(() => { throw new Error('owned lost response'); }); await h.a.waterVisibility('river-1', false);
  const original = structuredClone(h.calls.at(-1));
  assert.deepEqual(original.body, { metadata, resourceEdits: [], mapEdits: [{ op: 'water-visibility', groupId: 'river-1', showOnMinimap: false }] }); assert.equal(original.options.revision, '1');
  const count = h.calls.length; await h.a.waterVisibility('river-1', false); await h.a.retry(); assert.equal(h.calls.length, count);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
  assert.equal(h.model().water.locked, true); assert.equal(h.model().context.verified, false);
  assert.equal(h.model().fields.name, '未保存'); assert.equal(h.model().definitions.form.name, '未存武將');
  h.confirm = false; const before = h.calls.length; await h.a.load(); assert.equal(h.calls.length, before);
  h.confirm = true; h.response(() => ({ ...waterDto('2'), waterGroups: [{ ...waterRow(), showOnMinimap: false }] })); await h.a.load();
  assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.model().water.rows[0].showOnMinimap, false);
});
test('water cancel, no-op, invalid input, quota and changed context issue no write', async () => {
  for (const mode of ['cancel', 'noop', 'bad-id', 'bad-type', 'quota', 'identity', 'context']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load(); h.response(() => waterDto('1')); await h.a.load(); const before = h.calls.length;
    if (mode === 'cancel') h.confirm = false;
    if (mode === 'identity') h.confirm = () => { h.identity({ user: { id: 'author', mustChangePassword: false } }); return true; };
    if (mode === 'context') h.confirm = () => { h.c.adoptGame(H); return true; };
    let groupId = 'river-1', visible = false;
    if (mode === 'noop') visible = true;
    if (mode === 'bad-id') groupId = 'missing';
    if (mode === 'bad-type') visible = 'false';
    await h.a.waterVisibility(groupId, visible); assert.equal(h.calls.length, before, mode); assert.equal(h.records.size, 0, mode);
  }
});
test('water reload queries the original operation and cannot reconstruct a request', async () => {
  const first = harness(); await first.load(); first.response(() => waterDto('1')); await first.a.load(); first.response(() => { throw new Error('lost'); }); await first.a.waterVisibility('river-1', false);
  const h = harness({ records: first.records }); assert.equal(h.model().retryLocked, true);
  h.response(() => ({ state: 'committed', result: receipt('2') })); await h.a.query();
  assert.equal(h.calls.length, 1); assert.equal(h.model().water.locked, true);
  h.response(() => ({ ...waterDto('2'), waterGroups: [{ ...waterRow(), showOnMinimap: false }] })); await h.a.load();
  assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.model().water.rows[0].showOnMinimap, false);
});
test('template definition DTO is cloned, missing/full-copy is unavailable, malformed read is atomic', async () => {
  const h = harness({ definitions: [row()] }); await h.load(); assert.equal(h.model().definitions.supported, true);
  h.model().definitions.rows[0].name = 'mutated projection'; h.c.render(); assert.equal(h.model().definitions.rows[0].name, '原名');
  for (const bad of [[row(), row()], [{ ...row(), generalId: `${H}#general-${'a'.repeat(64)}` }], [{ ...row(), portraitRef: { assetId: '1', sha256: 'bad' } }], [{ ...row(), force: 1 }]]) {
    h.response(() => dto('1', bad)); await h.a.load(); assert.equal(h.model().definitions.rows[0].name, '原名');
  }
  h.response(() => { const data = dto(); delete data.generalDefinitions; delete data.generalReferences; return data; }); await h.a.load(); assert.equal(h.model().definitions.supported, false);
  h.response(() => ({ ...dto(), profileRevision: 'fixed-copy-resources-1', generalDefinitions: null, generalReferences: null })); await h.a.load(); assert.equal(h.model().definitions.locked, true);
});
test('create binds the original saved revision and metadata; lost response keeps one key and no duplicate creation', async () => {
  const h = harness(); await h.load(); h.a.setField('name', '另一表未保存');
  h.a.setDefinitionField('name', ' e\u0301 '); h.a.setDefinitionField('hao', '字');
  h.response(() => { throw new Error('response lost'); }); await h.a.saveDefinition();
  const first = structuredClone(h.calls.at(-1)); assert.deepEqual(first.body, { metadata, resourceEdits: [], generalEdits: [{ op: 'create', values: { name: 'é', zi: '', hao: '字', portraitRef: null } }] }); assert.equal(first.options.revision, '1');
  const before = h.calls.length; await h.a.saveDefinition(); await h.a.retry(); assert.equal(h.calls.length, before);
  let association; try { association = JSON.parse([...h.records.values()][0]); } catch (cause) { throw new Error('bad fixture association', { cause }); }
  assert.deepEqual(Object.keys(association).sort(), ['gameId', 'key', 'revision']);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1', error: 'OWNED_FAILURE' })); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), first);
  assert.equal(h.model().fields.name, '另一表未保存'); assert.equal(h.model().context.dirty, true); assert.equal(h.model().context.verified, false); assert.equal(h.model().definitions.locked, true); assert.equal(h.records.size, 0);
  h.confirm = false; const beforeRead = h.calls.length; await h.a.load(); assert.equal(h.calls.length, beforeRead);
  h.confirm = true; h.response(() => dto('2', [{ ...row(), name: 'é', zi: '', hao: '字' }])); await h.a.load(); assert.equal(h.model().definitions.rows.length, 1); assert.equal(h.model().context.verified, true);
});
test('reload retains only original operation association; query acknowledgement requires exact reread', async () => {
  const first = harness(); await first.load(); first.a.setDefinitionField('name', '新將'); first.response(() => { throw new Error('lost'); }); await first.a.saveDefinition();
  const h = harness({ records: first.records }); assert.equal(h.model().retryLocked, true); assert.equal(h.model().loadLocked, true);
  h.response(() => ({ state: 'committed', result: receipt('2') })); await h.a.query();
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].path, /\/draft\/operations\//); assert.equal(h.model().context.verified, false); assert.equal(h.model().definitions.locked, true);
  h.response(() => dto('2', [row()])); await h.a.load(); assert.match(h.calls.at(-1).path, /revision=2$/); assert.equal(h.model().definitions.rows[0].generalId, ID);
});
test('update and delete retain stable IDs; cancellation and changed identity cannot issue writes', async () => {
  const h = harness({ definitions: [row()] }); await h.load(); h.a.selectDefinition(ID); h.a.setDefinitionField('name', '改名');
  h.response(() => receipt('2')); await h.a.saveDefinition(); assert.deepEqual(h.calls.at(-1).body.generalEdits, [{ op: 'update', generalId: ID, values: { name: '改名', zi: '', hao: '', portraitRef: null } }]);
  h.response(() => dto('2', [{ ...row(), name: '改名' }])); await h.a.load(); h.a.selectDefinition(ID);
  const before = h.calls.length; h.confirm = false; await h.a.deleteDefinition(); assert.equal(h.calls.length, before);
  h.confirm = () => { h.identity(null); return true; }; await h.a.deleteDefinition(); assert.equal(h.calls.length, before); assert.deepEqual(h.model().definitions.rows, []);
  const good = harness({ definitions: [row()] }); await good.load(); good.a.selectDefinition(ID); good.response(() => receipt('2')); await good.a.deleteDefinition();
  assert.deepEqual(good.calls.at(-1).body.generalEdits, [{ op: 'delete', generalId: ID }]); assert.equal(good.model().definitions.locked, true);
});
test('portrait choices capture library ID and SHA without exposing editable SHA or trusting projected rows', async () => {
  const h = harness(); await h.load(); h.a.setDefinitionField('name', '新將');
  h.response(() => ({ gameId: G, portraits: [{ assetId: 'p0001', sha256: SHA, mime: 'image/png' }] })); await h.a.definitionPortraits();
  h.model().definitions.library[0].sha256 = 'c'.repeat(64); h.a.chooseDefinitionPortrait('p0001');
  h.a.chooseDefinitionPortrait('999999'); assert.equal(h.model().definitions.form.portraitRef.sha256, SHA);
  h.response(() => receipt('2')); await h.a.saveDefinition(); assert.deepEqual(h.calls.at(-1).body.generalEdits[0].values.portraitRef, { assetId: 'p0001', sha256: SHA });
});
test('invalid text and unsupported source never create journals; dirty definition participates in leave/Trial guards', async () => {
  const h = harness(); await h.load(); const before = h.calls.length;
  for (const name of ['', ' ', '\ud800', 'bad\n']) { h.a.setDefinitionField('name', name); await h.a.saveDefinition(); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0); }
  h.a.setDefinitionField('name', '未保存'); assert.equal(h.model().context.dirty, true); h.confirm = false; h.a.chooseGame(H); assert.equal(h.model().fields.gameId, G); assert.equal(h.c.canLeave(true), false);
  await h.a.trial(); assert.equal(h.calls.length, before);
  h.response(() => ({ ...dto(), profileRevision: 'fixed-copy-resources-1', generalDefinitions: null, generalReferences: null })); h.confirm = true; await h.a.load(); const afterRead = h.calls.length; await h.a.saveDefinition(); assert.equal(h.calls.length, afterRead);
});
test('corrupt saved association fails closed until acknowledged session revocation; no silent overwrite', async () => {
  for (const text of ['{', 'x'.repeat(513), JSON.stringify({ gameId: G, revision: '1', key: 'owned_key_123456789', extra: true })]) {
    const records = new Map([['editor-draft-operation:author', text]]), h = harness({ records });
    assert.equal(h.model().loadLocked, true); assert.equal(h.model().definitions.locked, true); assert.equal(h.c.canAdoptGame(H), false);
    await h.a.load(); await h.a.saveDefinition(); assert.equal(h.calls.length, 0); assert.equal(records.get('editor-draft-operation:author'), text);
    const next = { user: { id: 'author', mustChangePassword: false } }; h.identity(next); assert.equal(h.model().loadLocked, true);
    // Explicit trusted callback fixture, not a password/HTTP authorization proof.
    h.c.passwordChanged(next); assert.equal(records.size, 0); assert.equal(h.model().loadLocked, false);
    await h.load(); assert.equal(h.model().definitions.locked, false);
  }
});
test('storage failure and oversized body refuse definition POST before any server allocation', async () => {
  const h = harness({ failSet: true }); await h.load(); h.a.setDefinitionField('name', '新將'); const before = h.calls.length;
  await h.a.saveDefinition(); assert.equal(h.calls.length, before); assert.equal(h.model().context.pending, false); assert.equal(h.model().definitions.form.name, '新將'); assert.match(h.errors.at(-1).message, /未發送/);
  const large = harness(); await large.load(); large.a.setDefinitionField('name', '名'.repeat(6000)); const initial = large.calls.length;
  await large.a.saveDefinition(); assert.equal(large.calls.length, initial); assert.equal(large.records.size, 0); assert.equal(large.model().definitions.form.name.length, 6000); assert.match(large.errors.at(-1).message, /16KiB/);
});
const referencedDTO = () => {
  const data = dto('1', [row()]);
  data.chapters.push({ ...data.chapters[0], chapterId: 'second', name: '<img>第二章' });
  data.generalReferences[0].chapters = [
    { chapterId: 'first', included: true, inheritedFields: ['name', 'zi', 'hao', 'portraitRef', 'ability', 'suicideOnCapture'], overriddenFields: [] },
    { chapterId: 'second', included: false, inheritedFields: ['zi', 'hao', 'portraitRef', 'ability', 'suicideOnCapture'], overriddenFields: ['name'] },
  ];
  data.chapterPeople = data.generalReferences[0].chapters.map(reference => ({ chapterId: reference.chapterId, people: [{ generalId: ID, included: reference.included, factionId: null, overrides: reference.chapterId === 'second' ? { name: '章名' } : {}, values: { name: reference.chapterId === 'second' ? '章名' : '原名', zi: '', hao: '', portraitRef: null, suicideOnCapture: false }, inheritedFields: reference.inheritedFields, overriddenFields: reference.overriddenFields }] }));
  return data;
};
test('inherited changes show exact chapter fields; cancel has no journal, lost response retries the original acknowledgment', async () => {
  const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.selectDefinition(ID);
  h.a.setDefinitionField('name', '改名'); h.a.setDefinitionField('hao', '新字');
  let shown; h.confirm = text => { shown = text; return false; };
  const before = h.calls.length; await h.a.saveDefinition(); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
  assert.match(shown, /第一章 \[first\]：姓名、字/); assert.match(shown, /<img>第二章 \[second\]：字/); assert.match(shown, /含未加入配置/);
  h.confirm = true; h.response(() => { throw new Error('owned lost response'); }); await h.a.saveDefinition();
  const original = structuredClone(h.calls.at(-1));
  assert.deepEqual(original.body.generalEdits[0].confirmedImpacts, [{ chapterId: 'first', fields: ['name', 'hao'] }, { chapterId: 'second', fields: ['hao'] }]);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1', error: 'OWNED_FAILURE' })); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
});
test('unknown or referenced definitions cannot delete; malformed reports cannot replace the previous validated reference set', async () => {
  const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load();
  for (const mutate of [data => { data.generalReferences = []; }, data => { data.generalReferences[0].chapters[0].inheritedFields = ['name']; }, data => { data.generalReferences[0].chapters = data.generalReferences[0].chapters.toReversed(); }, data => { data.generalReferences[0].chapters[0].included = 1; }]) {
    const bad = referencedDTO(); mutate(bad); h.response(() => bad); await h.a.load();
    h.a.selectDefinition(ID); const before = h.calls.length; await h.a.deleteDefinition(); assert.equal(h.calls.length, before); assert.match(h.errors.at(-1).message, /仍有章節配置/);
  }
  h.response(() => { const data = dto('1', [row()]); delete data.generalReferences; return data; }); await h.a.load(); h.a.selectDefinition(ID);
  const before = h.calls.length; h.a.setDefinitionField('name', '改名'); await h.a.saveDefinition(); await h.a.deleteDefinition();
  assert.equal(h.calls.length, before); assert.equal(h.records.size, 0); assert.match(h.errors.at(-1).message, /未提供完整人物引用/);
});
test('impact confirmation cannot continue after identity or game context changes', async () => {
  for (const mode of ['identity', 'game']) {
    const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.selectDefinition(ID); h.a.setDefinitionField('hao', '新字');
    const before = h.calls.length;
    h.confirm = () => { if (mode === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } }); else h.c.adoptGame(H); return true; };
    await h.a.saveDefinition(); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
  }
});
test('chapter inclusion keeps overrides and unrelated dirty forms; lost response uses original people body and key', async () => {
  const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second');
  h.a.setField('name', '未保存遊戲'); h.a.selectDefinition(ID); h.a.setDefinitionField('hao', '未保存字');
  h.model().people.chapters[1].people[0].overrides.name = '投影污染';
  h.response(() => { throw new Error('owned lost response'); }); await h.a.person('set', 'second', ID, true);
  const original = structuredClone(h.calls.at(-1));
  assert.deepEqual(original.body, { metadata, resourceEdits: [], peopleEdits: [{ op: 'set', chapterId: 'second', generalId: ID, values: { included: true, factionId: null, overrides: { name: '章名' } } }] });
  const count = h.calls.length; await h.a.person('remove', 'second', ID); assert.equal(h.calls.length, count);
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1', error: 'OWNED_FAILURE' })); await h.a.query(); h.response(() => receipt('2')); await h.a.retry();
  assert.deepEqual(h.calls.at(-1), original); assert.equal(h.model().fields.name, '未保存遊戲'); assert.equal(h.model().definitions.form.hao, '未保存字'); assert.equal(h.model().context.verified, false); assert.equal(h.model().people.locked, true);
});
test('chapter configuration cancel, missing projection, storage failure and changed authority cannot write', async () => {
  for (const mode of ['cancel', 'identity', 'game', 'quota', 'missing']) {
    const h = harness({ failSet: mode === 'quota' }); await h.load();
    h.response(() => { const data = referencedDTO(); if (mode === 'missing') delete data.chapterPeople; return data; }); await h.a.load();
    const before = h.calls.length;
    h.confirm = () => { if (mode === 'identity') h.identity(null); if (mode === 'game') h.c.adoptGame(H); return mode !== 'cancel'; };
    await h.a.person('remove', 'first', ID); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
  }
});
test('new chapter configurations inherit without native fields; malformed effective projections are atomic', async () => {
  const h = harness(); await h.load(); h.response(() => ({ ...dto('1', [row()]), chapterPeople: [{ chapterId: 'first', people: [] }] })); await h.a.load();
  h.response(() => receipt('2')); await h.a.person('set', 'first', ID, false);
  assert.deepEqual(h.calls.at(-1).body.peopleEdits, [{ op: 'set', chapterId: 'first', generalId: ID, values: { included: false, factionId: null, overrides: {} } }]);
  const check = harness(); await check.load(); check.response(referencedDTO); await check.a.load(); const before = structuredClone(check.model().people.chapters);
  for (const mutate of [data => { data.chapterPeople = []; }, data => { data.chapterPeople[0].people[0].values.name = '錯'; }, data => { data.chapterPeople[1].people = []; }, data => { data.chapterPeople[0].people[0].factionId = '猜測'; }, data => { data.chapterPeople[0].people[0].overrides.force = 50; }]) {
    const data = referencedDTO(); mutate(data); check.response(() => data); await check.a.load(); assert.deepEqual(check.model().people.chapters, before);
  }
  check.response(() => receipt('2')); await check.a.person('remove', 'first', ID); assert.deepEqual(check.calls.at(-1).body.peopleEdits, [{ op: 'remove', chapterId: 'first', generalId: ID }]);
});
test('restore inheritance deletes only the selected override, retaining inactive status and exact retry body', async () => {
  for (const field of ['name', 'hao', 'portraitRef']) {
    const data = referencedDTO(), person = data.chapterPeople[1].people[0], reference = data.generalReferences[0].chapters[1];
    person.overrides = { name: '章名', hao: '章字', portraitRef: null }; person.values = { ...person.overrides, zi: '', suicideOnCapture: false };
    person.inheritedFields = ['zi', 'ability', 'suicideOnCapture']; person.overriddenFields = ['name', 'hao', 'portraitRef']; reference.inheritedFields = [...person.inheritedFields]; reference.overriddenFields = [...person.overriddenFields];
    const h = harness(); await h.load(); h.response(() => data); await h.a.load(); h.a.setField('chapterId', 'second');
    h.confirm = false; const before = h.calls.length; await h.a.person('inherit', 'second', ID, undefined, field); assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
    h.confirm = true; h.response(() => { throw new Error('owned loss'); }); await h.a.person('inherit', 'second', ID, undefined, field);
    const original = structuredClone(h.calls.at(-1)), overrides = { ...person.overrides }; delete overrides[field];
    assert.deepEqual(original.body.peopleEdits, [{ op: 'set', chapterId: 'second', generalId: ID, values: { included: false, factionId: null, overrides } }]);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1', error: 'OWNED_FAILURE' })); await h.a.query(); h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), original);
    assert.equal(h.model().context.verified, false);
  }
});
test('inheritance refuses absent/unknown override and cannot survive confirmation identity change', async () => {
  const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second'); const before = h.calls.length;
  for (const field of ['hao', 'force', undefined]) { await h.a.person('inherit', 'second', ID, undefined, field); assert.equal(h.calls.length, before); }
  h.confirm = () => { h.identity({ user: { id: 'author', mustChangePassword: false } }); return true; }; await h.a.person('inherit', 'second', ID, undefined, 'name');
  assert.equal(h.calls.length, before); assert.equal(h.records.size, 0);
});
test('text overrides normalize only the selected field, preserve inactive configuration, and retry original input', async () => {
  for (const field of ['name', 'hao']) {
    const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second');
    const before = structuredClone(h.model().people.chapters); let confirmations = 0;
    h.prompt = (_message, initial) => { assert.equal(initial, field === 'name' ? '章名' : ''); return field === 'name' ? ' e\u0301 ' : ''; };
    h.confirm = text => { confirmations++; assert.match(text, /只覆蓋本章/); return true; };
    h.response(() => { throw new Error('lost override response'); }); await h.a.person('override', 'second', ID, undefined, field);
    const first = structuredClone(h.calls.at(-1));
    assert.deepEqual(first.body, { metadata, resourceEdits: [], peopleEdits: [{ op: 'set', chapterId: 'second', generalId: ID, values: { included: false, factionId: null, overrides: { name: '章名', [field]: field === 'name' ? 'é' : '' } } }] });
    assert.equal(confirmations, 1); assert.deepEqual(h.model().people.chapters, before);
    h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
    h.prompt = () => { throw new Error('retry must not ask again'); }; h.response(() => receipt('2')); await h.a.retry();
    assert.deepEqual(h.calls.at(-1), first); assert.equal(h.model().context.verified, false);
  }
});
test('text override cancellation, invalid values and prompt context changes never create a journal', async () => {
  for (const mode of ['cancel', 'confirm-cancel', 'empty', 'control', 'surrogate', 'identity', 'context', 'field']) {
    const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second');
    const before = h.calls.length; let confirmations = 0;
    h.confirm = () => { confirmations++; return false; };
    h.prompt = () => {
      if (mode === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      if (mode === 'context') h.c.adoptGame(H);
      return { cancel: null, empty: '  ', control: 'bad\u0001', surrogate: '\ud800' }[mode] ?? (mode === 'cancel' ? null : '新名');
    };
    await h.a.person('override', 'second', ID, undefined, mode === 'field' ? 'force' : 'name');
    assert.equal(h.calls.length, before); assert.equal(h.records.size, 0); assert.equal(confirmations, mode === 'confirm-cancel' ? 1 : 0);
  }
});
test('chapter portrait selection captures trusted library metadata, preserves other overrides and retries the original body', async () => {
  const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second');
  h.response(() => ({ gameId: G, portraits: [{ assetId: '1', sha256: SHA, mime: 'image/png' }] })); await h.a.definitionPortraits();
  h.model().definitions.library[0].sha256 = 'c'.repeat(64);
  h.confirm = message => { assert.match(message, /只覆蓋本章頭像/); assert.ok(message.includes(SHA)); return true; };
  h.response(() => { throw new Error('lost portrait response'); }); await h.a.person('portrait', 'second', ID, undefined, '1');
  const first = structuredClone(h.calls.at(-1));
  assert.deepEqual(first.body.peopleEdits[0].values, { included: false, factionId: null, overrides: { name: '章名', portraitRef: { assetId: '1', sha256: SHA } } });
  h.response(() => ({ state: 'failed', gameId: G, expectedRevision: '1' })); await h.a.query();
  h.response(() => receipt('2')); await h.a.retry(); assert.deepEqual(h.calls.at(-1), first);
});
test('chapter portrait clear is explicit null; unknown choices, cancellation and changed confirmation context never write', async () => {
  for (const mode of ['clear', 'unknown', 'missing', 'object', 'cancel', 'identity', 'context']) {
    const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load(); h.a.setField('chapterId', 'second');
    if (mode !== 'missing') { h.response(() => ({ gameId: G, portraits: [{ assetId: '1', sha256: SHA, mime: 'image/png' }] })); await h.a.definitionPortraits(); }
    const before = h.calls.length;
    h.confirm = message => {
      if (mode === 'clear') assert.match(message, /明確清空本章頭像.*不是恢復繼承/);
      if (mode === 'identity') h.identity({ user: { id: 'author', mustChangePassword: false } });
      if (mode === 'context') h.c.adoptGame(H);
      return mode !== 'cancel';
    };
    h.response(() => receipt('2'));
    let choice = '1';
    if (mode === 'clear') choice = null;
    else if (mode === 'unknown') choice = '2';
    else if (mode === 'object') choice = { assetId: '1', sha256: SHA };
    await h.a.person('portrait', 'second', ID, undefined, choice);
    assert.equal(h.calls.length, before + Number(mode === 'clear')); assert.equal(h.records.size, 0);
    if (mode === 'clear') assert.deepEqual(h.calls.at(-1).body.peopleEdits[0].values.overrides, { name: '章名', portraitRef: null });
  }
});
test('duplicate chapter identities reject the whole read, including empty people lists and legacy missing projections', async () => {
  for (const projection of [true, false]) {
    const h = harness(); await h.load(); h.response(referencedDTO); await h.a.load();
    const previous = structuredClone({ chapters: h.model().chapters, people: h.model().people, definitions: h.model().definitions, context: h.model().context });
    const bad = dto('1', [row()]); bad.chapters.push({ ...bad.chapters[0], name: '同ID另一章' });
    if (projection) bad.chapterPeople = bad.chapters.map(chapter => ({ chapterId: chapter.chapterId, people: [] }));
    h.response(() => bad); await h.a.load();
    assert.match(h.errors.at(-1)?.message ?? '', /章節身份重複/);
    assert.deepEqual({ chapters: h.model().chapters, people: h.model().people, definitions: h.model().definitions, context: h.model().context }, previous);
    assert.equal(h.records.size, 0);
  }
});
test('late library and save results cannot populate a changed identity or clear its association', async () => {
  const h = harness(); await h.load(); let release;
  h.response(() => new Promise(resolve => { release = resolve; })); const library = h.a.definitionPortraits();
  h.identity(null); release({ gameId: G, portraits: [{ assetId: '1', sha256: SHA, mime: 'image/png' }] }); await library; assert.deepEqual(h.model().definitions.library, []);
  const save = harness(); await save.load(); save.a.setDefinitionField('name', '新將'); save.response(() => new Promise(resolve => { release = resolve; })); const pending = save.a.saveDefinition();
  save.identity({ user: { id: 'other', mustChangePassword: false } }); release(receipt('2')); await pending;
  assert.equal(save.model().context, null); assert.ok(save.records.has('editor-draft-operation:author')); assert.equal(save.records.has('editor-draft-operation:other'), false);
});
