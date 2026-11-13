// Real authoring/publication presentation controllers, explicit API fixtures. No backend authority proof.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const load = async name => import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../server/public/' + name + '.txt', import.meta.url))).toString('base64'));
const { installDraftEditor, createAuthoringContext } = await load('draft');
const { installStronghold } = await load('stronghold');
const { installGenerals } = await load('general');
const { installMapViewer } = await load('mapview');
const { installPublish } = await load('publish');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const game = id => ({ gameId: id, draftRevision: id === A ? '1' : '2', listed: false, metadata: { name: id === A ? '甲' : '乙', introduction: '' } });
// Current copy-slot projection; publication lists all owned games independently.
const submission = id => ({ gameId: id, state: 'draft', version: null, nextVersion: '1.0',
  copyDigest: 'a'.repeat(64), validation: null, slot: null, publishEnabled: false, blockedReason: '尚未检验' });
const detail = id => ({ ...game(id), profileRevision: 'fixed-copy-resources-1', strongholds: [], map: { roads: [], placements: 0 }, chapters: [{
  chapterId: id + '#one', name: '章', gaps: { saveGaps: 0, activeGaps: 1 },
  factions: [{ slot: 0, idx: 0, monarch_idx: 0, advisor_idx: null, capital: 0, money: 1, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0 }],
  generals: [{ idx: 0, name: '將', hao: '', faction: 0 }], cities: [{ idx: 0, name: '城', troops: 1, prod: 2, troopsCap: 10, maxProd: 10 }],
}] });
function harness() {
  let identity = { user: { id: '33333333-3333-4333-8333-333333333333', role: 'author', version: 1, mustChangePassword: false } }, ids = [A, B], handler, onConfirm;
  const members = {}, models = {}, calls = [], errors = [], storage = new Map(), confirmations = [];
  const consent = { draft: true, stronghold: true, publication: true, external: true, mapInputs: false };
  const context = createAuthoringContext({ participants: () => members, initialGame: () => members.draft?.selectedGame() ?? null, beforeChange: () => consent.external });
  const api = async (path, body, options) => {
    calls.push({ path, body, options });
    if (handler) { const value = handler(path, body, options); if (value !== undefined) return value; }
    if (path === '/api/games') return { games: ids.map(game) };
    const id = path.split('/')[3];
    if (path.endsWith('/copy/submission')) return submission(id);
    if (path.endsWith('/topology')) return { gameId: id, moves: [], rebuilds: [], blocked: false };
    if (body) throw new Error('owned lost response');
    return detail(id);
  };
  const options = key => ({ api, authority: () => identity, isBusy: () => false,
    work: async fn => { try { return await fn(); } catch (error) { errors.push(error); } finally { members[key].render(); } },
    publish: model => { models[key] = model; }, gameContext: { current: context.current, select: id => context.select(id, key) },
    confirm: text => { confirmations.push([key, text]); onConfirm?.(); return consent[key]; },
  });
  const journal = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  members.draft = installDraftEditor({ ...options('draft'), storage: journal, hasLocalMapInputs: () => consent.mapInputs });
  members.stronghold = installStronghold(options('stronghold'));
  members.generals = installGenerals(options('generals'));
  members.map = installMapViewer(options('map'));
  members.publication = installPublish({ ...options('publication'), storage: journal });
  for (const member of Object.values(members)) member.setIdentity(identity);
  return { members, models, context, calls, errors, consent, storage, confirmations,
    list: value => { ids = value; }, response: value => { handler = value; }, onConfirm: value => { onConfirm = value; },
    identity: value => { context.reset(); identity = value; for (const member of Object.values(members)) member.setIdentity(value); },
    all: id => { for (const [key, member] of Object.entries(members)) assert.equal(member.selectedGame(), key === 'publication' ? null : id, key); },
  };
}
test('one explicit selection reaches all four panels without reads; each panel reads its own exact revision', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); h.all(A); assert.equal(h.calls.length, 1);
  await m.draft.actions.load(); m.draft.actions.chooseGame(B); h.all(B);
  assert.equal(h.calls.length, 2); assert.equal(h.models.draft.context, null);
  for (const key of ['stronghold', 'generals', 'map']) { await m[key].actions.refresh(); h.all(B); assert.match(h.models[key].context, /2/); }
  assert.equal(h.calls.filter(c => c.path.includes('/' + A + '/draft')).length, 1);
  const before = h.calls.length; m.map.actions.select(A); h.all(A);
  assert.equal(h.calls.length, before); assert.deepEqual(h.models.stronghold.cities, []); assert.deepEqual(h.models.generals.generals, []); assert.deepEqual(h.models.map.lines, []);
  assert.equal(h.models.draft.fields.revision, '1'); assert.equal(h.models.draft.trialLocked, true); assert.deepEqual(h.errors, []);
});
test('all consent checks precede clearing any dirty input, including an external workflow veto', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); await m.draft.actions.load(); await m.stronghold.actions.refresh(); await m.generals.actions.refresh();
  m.draft.actions.setField('name', '未保存'); m.draft.actions.setNativeCityInput(A+'#one', 0, 'troops', '3');
  const before = h.calls.length; h.consent.draft = false; m.generals.actions.selectGame(B);
  h.all(A); assert.equal(h.models.draft.fields.name, '未保存'); assert.equal(h.models.draft.nativeCities.chapters[0].cities[0].inputs.troops, '3'); assert.equal(h.confirmations.length, 1);
  assert.equal(h.models.stronghold.cities[0].troops, '1'); assert.equal(m.stronghold.canLeave(), true);
  h.consent.draft = true; h.consent.external = false; m.generals.actions.selectGame(B); h.all(A);
  assert.equal(h.models.draft.fields.name, '未保存'); assert.equal(h.models.draft.nativeCities.chapters[0].cities[0].inputs.troops, '3');
  h.consent.external = true; m.generals.actions.selectGame(B); h.all(B);
  assert.equal(h.calls.length, before); assert.equal(h.models.draft.context, null); assert.deepEqual(h.models.stronghold.cities, []);
});
test('map-only preparation participates in every shared game selector and unload veto without requests', async () => {
  for (const source of ['draft', 'stronghold', 'generals', 'map']) {
    const h = harness(), m = h.members;
    await m.draft.actions.refresh(); await m.draft.actions.load();
    for (const key of ['stronghold', 'generals', 'map', 'publication']) await m[key].actions.refresh();
    const choose = { draft: m.draft.actions.chooseGame, stronghold: m.stronghold.actions.selectGame, generals: m.generals.actions.selectGame, map: m.map.actions.select }[source];
    const before = h.calls.length, context = structuredClone(h.models.draft.context);
    assert.equal(context.dirty, false);
    h.consent.mapInputs = true; h.consent.draft = false;
    assert.equal(m.draft.canLeave(true), false); assert.equal(h.confirmations.length, 0);
    choose(B); h.all(A);
    assert.deepEqual(h.models.draft.context, context); assert.equal(h.consent.mapInputs, true);
    assert.equal(h.confirmations.length, 1); assert.equal(h.confirmations[0][0], 'draft');
    assert.equal(h.calls.length, before); assert.equal(h.storage.size, 0);
    h.consent.draft = true; choose(B); h.all(B);
    assert.equal(h.models.draft.context, null); assert.equal(h.calls.length, before);
    assert.equal(h.confirmations.length, 2); assert.equal(h.storage.size, 0);
  }
  // 上架面（B2）不是选择源：清单是整份游戏，当前游戏由共享选择决定。
  const h = harness(), m = h.members;
  assert.equal(Object.hasOwn(m.publication.actions, 'select'), false);
  assert.equal(typeof m.publication.selectedGame, 'function');
  await m.draft.actions.refresh(); h.all(A);
  m.draft.actions.chooseGame(B); h.all(B);
  assert.equal(h.calls.length, 1);
});
test('an unresolved draft operation cannot be retargeted even after leave confirmation', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); await m.draft.actions.load(); await m.generals.actions.refresh();
  m.draft.actions.setField('name', '未確認'); await m.draft.actions.save();
  const before = h.calls.length, association = [...h.storage.entries()];
  m.generals.actions.selectGame(B); h.all(A); assert.equal(h.calls.length, before);
  assert.deepEqual([...h.storage.entries()], association); assert.equal(h.models.draft.context.pending, true); assert.equal(h.models.draft.fields.name, '未確認');
});
test('missing list entry never falls back to a different global game or triggers its draft read', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); m.draft.actions.chooseGame(B); await m.draft.actions.load(); h.list([A]);
  const before = h.calls.length;
  for (const key of ['draft', 'stronghold', 'generals', 'map']) await m[key].actions.refresh();
  h.all(B); assert.equal(h.calls.length - before, 4); assert.ok(h.calls.slice(before).every(c => c.path === '/api/games'));
  assert.equal(h.models.draft.context.draftRevision, '2'); assert.deepEqual(h.models.generals.generals, []);
});
test('a late old-game reply cannot repopulate a switched panel; identity change hides every selection', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); await m.generals.actions.refresh();
  let resolve, started;
  const atRead = new Promise(done => { started = done; });
  h.response(path => { if (path.includes('/' + A + '/draft')) { started(); return new Promise(done => { resolve = done; }); } });
  const pending = m.generals.actions.inspect(); await atRead;
  m.draft.actions.chooseGame(B); h.all(B); resolve(detail(A)); await pending;
  assert.deepEqual(h.models.generals.generals, []); assert.equal(h.models.generals.context, '');
  h.identity(null); h.all(null); assert.equal(h.context.current(), null); assert.deepEqual(h.models.draft.games, []);
});
test('late read failures do not attach an old-game error to any switched entity panel', async () => {
  for (const key of ['stronghold', 'generals', 'map']) {
    const h = harness(), m = h.members;
    await m.draft.actions.refresh(); await m[key].actions.refresh();
    let reject, started;
    const atRead = new Promise(done => { started = done; });
    h.response(path => { if (path.includes('/' + A + '/draft')) { started(); return new Promise((_resolve, fail) => { reject = fail; }); } });
    const pending = m[key].actions.inspect(); await atRead;
    m.draft.actions.chooseGame(B); reject(new Error('舊遊戲讀取失敗')); await pending;
    h.all(B); assert.equal(h.models[key].message, '', key);
  }
});
test('publication remains a global copy-slot list and does not own or veto the shared selection', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh();
  assert.deepEqual(Object.keys(m.publication.actions).sort(), ['check', 'publish', 'refresh', 'setDescription']);
  await m.publication.actions.refresh(); h.all(A);
  assert.deepEqual(h.models.publication.rows.map(row => row.name), ['甲', '乙']);
  m.draft.actions.chooseGame(B); h.all(B);
  assert.deepEqual(h.models.publication.rows.map(row => row.name), ['甲', '乙'], '整份清單不隨當前遊戲縮小');
  assert.equal(m.publication.canLeave(true), true);
});
test('the publication list never replaces the shared selection', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); m.draft.actions.chooseGame(B); h.all(B);
  assert.deepEqual(h.models.publication.rows, [], '未整理前不顯示任何清單項');
  await m.publication.actions.refresh(); h.all(B);
  assert.deepEqual(h.models.publication.rows.map(row => row.name), ['甲', '乙']);
  h.list([A]); const n = h.calls.length; await m.publication.actions.refresh();
  h.all(B); assert.equal(h.calls.length, n + 2);
  assert.deepEqual(h.calls.slice(n).map(call => call.path), ['/api/games', `/api/games/${A}/copy/submission`]);
  assert.deepEqual(h.models.publication.rows.map(row => row.name), ['甲']);
  assert.equal(h.models.publication.locked, false);
});
test('coordinator stops both readiness passes immediately when a readiness callback resets', () => {
  for (const resetAt of [1, 2]) {
    const events = []; let context; const counts = {};
    const member = name => ({ canAdoptGame() { counts[name] = (counts[name] ?? 0) + 1; events.push(name + ':' + counts[name]); if (name === 'source' && counts[name] === resetAt) context.reset(); return true; }, canLeave: () => true, adoptGame() { assert.fail('stale adoption'); } });
    const members = { source: member('source'), first: member('first'), later: member('later') };
    context = createAuthoringContext({ participants: () => members });
    assert.equal(context.select(B, 'source'), false); assert.equal(context.current(), null);
    assert.deepEqual(events, resetAt === 1 ? ['source:1'] : ['source:1', 'first:1', 'later:1', 'source:2']);
  }
});
test('coordinator stops remaining callbacks immediately after a consent reset', () => {
  const events = []; let context;
  const member = name => ({ canAdoptGame: () => true, canLeave() { events.push(name); if (name === 'first') context.reset(); return true; }, adoptGame() { events.push('adopt:' + name); } });
  const members = { source: member('source'), first: member('first'), later: member('later') };
  context = createAuthoringContext({ participants: () => members, beforeChange() { events.push('external'); return true; } });
  assert.equal(context.select(B, 'source'), false);
  assert.deepEqual(events, ['first']); assert.equal(context.current(), null);
});
test('coordinator stops old propagation when an adoption callback resets identity', () => {
  const events = []; let context;
  const member = name => ({ canAdoptGame: () => true, canLeave: () => true, adoptGame(id) { events.push([name, id]); if (name === 'first') context.reset(); } });
  const members = { source: member('source'), first: member('first'), later: member('later') };
  context = createAuthoringContext({ participants: () => members });
  assert.equal(context.select(B, 'source'), false);
  assert.deepEqual(events, [['first', B]]); assert.equal(context.current(), null);
});
test('nested newer selection wins over remaining old propagation', () => {
  const events = []; let context;
  const member = name => ({ canAdoptGame: () => true, canLeave: () => true, adoptGame(id) { events.push([name, id]); if (name === 'first' && id === B) assert.equal(context.select(A, 'source'), true); } });
  const members = { source: member('source'), first: member('first'), later: member('later') };
  context = createAuthoringContext({ participants: () => members });
  assert.equal(context.select(B, 'source'), false);
  assert.equal(context.current(), A); assert.deepEqual(events, [['first', B], ['first', A], ['later', A]]);
});
test('identity reset during consent cannot install the old request as the next context', async () => {
  const h = harness(), m = h.members;
  await m.draft.actions.refresh(); await m.draft.actions.load(); await m.generals.actions.refresh();
  m.draft.actions.setField('name', '未保存');
  h.onConfirm(() => h.identity(null));
  m.generals.actions.selectGame(B);
  h.all(null); assert.equal(h.context.current(), null); assert.deepEqual(h.models.draft.games, []);
});
