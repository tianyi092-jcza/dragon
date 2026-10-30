// Read-only adapter evidence; saves/recovery belong to verify_editor_draft_controller.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const { installGenerals } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/general.txt')).toString('base64'));
function setup(gameContext) {
  let actor = { user: { id: 'author', role: 'author' } }, model, busy = false, hook;
  const data = { gameId: 'game', draftRevision: '1', metadata: { name: 'G', introduction: 'private' }, chapters: [{ chapterId: 'ch#1', name: '', generals: [{ idx: 5, name: '<img>', hao: '字', portraitKey: null }], factions: [{ idx: 2, monarch_idx: 5, advisor_idx: 6, capital: 8 }] }] };
  const calls = [], portraits = [{ assetId: 'kao000', mime: 'image/png', byteLength: 100, inUse: false }, { assetId: 'kao001', mime: 'image/png', byteLength: 101, inUse: true }];
  const ui = installGenerals({ authority: () => actor, isBusy: () => busy, publish: value => { model = value; }, gameContext,
    confirm: () => { throw new Error('readonly adapter must not confirm'); }, prompt: () => { throw new Error('readonly adapter must not prompt'); },
    api: async (path, body, options) => {
      assert.equal(body, undefined); assert.equal(options, undefined);
      calls.push(path);
      if (hook) { const result = await hook(path); if (result !== undefined) return result; }
      if (path === '/api/games') return { games: [{ gameId: data.gameId, draftRevision: data.draftRevision, metadata: data.metadata }] };
      if (path.includes('/draft?')) return structuredClone(data);
      if (path.endsWith('/portraits')) return { portraits: structuredClone(portraits) };
      throw new Error('unexpected ' + path);
    }, work: async fn => { if (busy) return; busy = true; try { return await fn(); } finally { busy = false; ui.render(); } } });
  ui.setIdentity(actor);
  return { ui, a: ui.actions, data, portraits, calls, get model() { return model; }, set hook(value) { hook = value; }, set identity(value) { actor = value; ui.setIdentity(value); } };
}
test('adapter exposes only explicit reads and selections; no parallel writes or confirmations', async () => {
  const s = setup(); assert.equal(s.calls.length, 0); assert.equal(s.model.draftRevision, null);
  assert.deepEqual(Object.keys(s.a).sort(), ['refresh','inspect','listPortraits','blockers','selectGame','selectChapter','selectPortrait'].sort());
  await s.a.refresh(); assert.deepEqual(s.calls, ['/api/games','/api/games/game/draft?revision=1']);
  assert.equal(s.model.draftRevision, '1'); assert.equal(s.model.saveDisabled, false); assert.equal(s.ui.canLeave(), true);
  s.model.draftRevision = '999'; s.model.generals[0].name = 'changed'; s.model.factions[0].monarch = 99; s.ui.render();
  assert.equal(s.model.draftRevision, '1'); assert.equal(s.model.generals[0].name, '<img>'); assert.equal(s.model.factions[0].monarch, 5);
  assert.equal(s.model.chapters[0].name, 'ch#1'); assert.ok(!JSON.stringify(s.model).includes('private'));
});
test('blocker report groups chapter slots without implying cross-chapter person identity', async () => {
  const s = setup(); s.data.chapters[0].generals[0].references = [{ code: 'GENERAL_MONARCH_REF', detail: '勢力 #2 的君主' }];
  s.data.chapters.push({ chapterId: 'ch#2', name: '另一章', generals: [{ idx: 5, name: '不同人物', references: [{ code: 'GENERAL_GOVERNOR_REF', detail: '據點 #8 的太守' }] }], factions: [] });
  await s.a.refresh(); const count = s.calls.length; await s.a.blockers('ch#1', 5);
  for (const text of ['ch#1','ch#2','不同人物','勢力 #2 的君主','據點 #8 的太守','不代表各章為同一人物','128']) assert.ok(s.model.message.includes(text));
  assert.equal(s.calls.length, count); s.identity = null; assert.equal(s.model.message, '');
});
test('missing references stay unknown and malformed reports preserve the loaded snapshot', async () => {
  const s = setup(); await s.a.refresh(); await s.a.blockers('ch#1', 5); assert.match(s.model.message, /不能視為無引用/);
  s.data.chapters[0].generals[0].references = [{ code: 'GENERAL_MONARCH_REF', detail: 5 }];
  await assert.rejects(s.a.inspect(), /引用報告無效/); await s.a.blockers('ch#1', 5); assert.match(s.model.message, /不能視為無引用/);
});
test('source identities remain scoped and projected; reserved and malformed IDs reject atomically', async () => {
  const s = setup(); s.data.chapters[0].generals[0].sourceRecordId = 'source-one';
  s.data.chapters.push({ chapterId: 'ch#2', name: '第二章', generals: [{ idx: 5, name: '同槽', sourceRecordId: 'source-two' }, { idx: 127, name: '保留', sourceRecordId: null }], factions: [] });
  await s.a.refresh(); assert.equal(s.model.generals[0].sourceRecordId, 'source-one'); const count = s.calls.length;
  s.a.selectChapter('ch#2'); assert.equal(s.model.generals[0].sourceRecordId, 'source-two'); assert.equal(s.model.generals[1].sourceRecordId, null);
  s.model.generals[0].sourceRecordId = 'changed'; s.ui.render(); assert.equal(s.model.generals[0].sourceRecordId, 'source-two'); assert.equal(s.calls.length, count);
  for (const bad of [5, '']) { s.data.chapters[0].generals[0].sourceRecordId = bad; await assert.rejects(s.a.inspect(), /顯示資料無效/); }
  delete s.data.chapters[0].generals[0].sourceRecordId; s.data.chapters[1].generals[1].sourceRecordId = 'reserved';
  await assert.rejects(s.a.inspect(), /顯示資料無效/); assert.equal(s.model.generals[1].sourceRecordId, null);
  s.identity = null; assert.deepEqual(s.model.generals, []); assert.equal(s.model.draftRevision, null);
});
test('original portrait bytes project as readonly IDs without guessing missing or sentinel images', async () => {
  const s = setup(); await s.a.refresh(); assert.equal(s.model.generals[0].originalPortraitId, null);
  for (const value of [0, 149, 255, null]) {
    s.data.chapters[0].generals[0].portrait = value;
    s.data.chapters[0].generals[0].portraitKey = 'p0001';
    await s.a.inspect();
    assert.equal(s.model.generals[0].originalPortraitId, value === null ? null : String(value));
    assert.equal(s.model.generals[0].portraitKey, 'p0001');
  }
  s.data.chapters[0].generals[0].portrait = 0; await s.a.inspect();
  s.model.generals[0].originalPortraitId = '149'; s.ui.render(); assert.equal(s.model.generals[0].originalPortraitId, '0');
  for (const value of [-0, -1, 256, 1.5, '0', false, NaN, Infinity, {}]) {
    s.data.chapters[0].generals[0].portrait = value;
    await assert.rejects(s.a.inspect(), /顯示資料無效/);
    assert.equal(s.model.generals[0].originalPortraitId, '0');
  }
  delete s.data.chapters[0].generals[0].portrait; await s.a.inspect();
  assert.equal(s.model.generals[0].originalPortraitId, null);
});
test('ability values and specialty low bits are readonly, missing remains unknown and invalid replacements are atomic', async () => {
  const s = setup(); await s.a.refresh();
  assert.equal(s.model.generals[0].ability, null); assert.equal(s.model.generals[0].specialtyLowBits, null);
  const row = s.data.chapters[0].generals[0];
  row.ability = { force: 0, lead: 255, politics: 128, siege: 0, field: 15, naval: 8 }; row.specialtyLowBits = '216';
  await s.a.inspect(); const count = s.calls.length;
  assert.deepEqual(s.model.generals[0].ability, row.ability); assert.equal(s.model.generals[0].specialtyLowBits, '216');
  s.model.generals[0].ability.lead = 1; s.ui.render(); assert.equal(s.model.generals[0].ability.lead, 255); assert.equal(s.calls.length, count);
  const original = structuredClone(row.ability);
  for (const bad of [[], false, { ...original, force: 256 }, { ...original, lead: -0 }, { ...original, politics: '1' }, { ...original, siege: 16 }, { ...original, field: NaN }, { ...original, naval: 1.5 }]) {
    row.ability = bad; await assert.rejects(s.a.inspect(), /能力顯示資料無效/); assert.deepEqual(s.model.generals[0].ability, original);
  }
  row.ability = original;
  for (const bad of ['000\n', 'FFF', '00', 0, false]) {
    row.specialtyLowBits = bad; await assert.rejects(s.a.inspect(), /專長低位顯示資料無效/); assert.equal(s.model.generals[0].specialtyLowBits, '216');
  }
  delete row.ability; delete row.specialtyLowBits; await s.a.inspect();
  assert.equal(s.model.generals[0].ability, null); assert.equal(s.model.generals[0].specialtyLowBits, null);
  s.identity = null; assert.deepEqual(s.model.generals, []);
});
test('portrait catalogue selection is stable and readonly, malformed replacement is rejected', async () => {
  const s = setup(); await s.a.refresh(); await s.a.listPortraits(); const count = s.calls.length;
  s.a.selectPortrait('not-listed'); assert.equal(s.model.portraitId, 'kao000'); s.a.selectPortrait('kao001'); assert.equal(s.model.portraitId, 'kao001');
  s.model.library[0].assetId = 'changed'; s.ui.render(); assert.equal(s.model.library[0].assetId, 'kao000'); assert.equal(s.calls.length, count);
  s.portraits.push({ ...s.portraits[0] }); await assert.rejects(s.a.listPortraits(), /頭像清單/); assert.equal(s.model.library.length, 2);
});
test('optional portrait SHA is preserved for previews; malformed SHA cannot replace the catalogue', async () => {
  const s = setup(); await s.a.refresh(); s.portraits[0].sha256 = 'a'.repeat(64);
  await s.a.listPortraits(); assert.equal(s.model.library[0].sha256, 'a'.repeat(64));
  assert.equal(Object.hasOwn(s.model.library[1], 'sha256'), false);
  s.model.library[0].sha256 = 'b'.repeat(64); s.ui.render(); assert.equal(s.model.library[0].sha256, 'a'.repeat(64));
  for (const sha of [null, 1, '', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(64) + '\n']) {
    s.portraits[0].sha256 = sha; await assert.rejects(s.a.listPortraits(), /頭像清單/);
    assert.equal(s.model.library[0].sha256, 'a'.repeat(64)); assert.equal(s.model.portraitId, 'kao000');
  }
});
test('unauthenticated and forced identities cannot read; late replies cannot restore private rows', async () => {
  for (const identity of [null, { user: { id: 'forced', mustChangePassword: true } }]) {
    const s = setup(); s.identity = identity; await assert.rejects(s.a.refresh()); await assert.rejects(s.a.listPortraits()); assert.equal(s.calls.length, 0);
  }
  for (const action of ['inspect','listPortraits']) {
    const s = setup(); await s.a.refresh(); let resolve; s.hook = () => new Promise(done => { resolve = done; }); const pending = s.a[action]();
    s.identity = { user: { id: 'other' } }; resolve(action === 'listPortraits' ? { portraits: s.portraits } : structuredClone(s.data)); await pending;
    assert.deepEqual(s.model.generals, []); assert.deepEqual(s.model.library, []); assert.equal(s.model.message, '');
  }
});
test('bad binding and duplicate slots preserve prior read; stale chapter query is local rejection', async () => {
  const s = setup(); await s.a.refresh(); s.hook = path => path.includes('/draft?') ? { ...s.data, gameId: 'foreign' } : undefined;
  await assert.rejects(s.a.inspect()); assert.equal(s.model.generals[0].name, '<img>');
  s.hook = null; s.data.chapters[0].generals.push({ ...s.data.chapters[0].generals[0] }); await assert.rejects(s.a.inspect()); assert.equal(s.model.generals.length, 1);
  const count = s.calls.length; await assert.rejects(s.a.blockers('old-chapter', 5)); assert.equal(s.calls.length, count);
});
test('selection callback invalidation prevents late list installation and reads', async () => {
  let s; s = setup({ current: () => null, select() { s.identity = { user: { id: 'other' } }; return false; } });
  await s.a.refresh(); assert.deepEqual(s.calls, ['/api/games']); assert.equal(s.model.selected, null); assert.deepEqual(s.model.generals, []);
});
