// Validator presentation plus the approved Q40 empty-faction product gate.
// No original-game formula, initialization, resource admission or writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { chapterGapReport } from '../server/chaptergapreport.js';
import { chapterGapCounts, chapterSaveGaps, chapterActiveGaps, validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { trialChapterActiveGaps, trialChapterAssetGaps } from '../server/trials.js';
import { projectTrialChapter } from '../web/src/editor/trialscope.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
test('empty chapter reports locked entity counts without pretending it is playable', () => {
  const state = { factions: [], generals: [], cities: [] }, before = structuredClone(state);
  const report = chapterGapReport(state, 'empty');
  assert.deepEqual({ saveGaps: report.saveGaps, activeGaps: report.activeGaps }, chapterGapCounts(state, 'empty'));
  assert.equal(report.details.save.length, 0); assert.equal(report.details.active.length, 3);
  assert.equal(report.details.active.filter(row => row.code === 'entity-count').length, 2);
  assert.equal(report.details.active.filter(row => row.code === 'chapter-factions').length, 1);
  assert.ok(report.details.active.every(row => row.recognized));
  assert.match(report.details.active[0].description, /128/); assert.match(report.details.active[1].description, /192/);
  assert.deepEqual(state, before);
});
test('未登场槽是空位：保存门只管已登场槽（2026-11 用户裁决）', () => {
  const empty = { generals: Array.from({ length: 128 }, (_, idx) => ({ idx })), cities: [], factions: [] };
  const report = chapterGapReport(empty, 'blank');
  assert.equal(report.saveGaps, 0);
  const active = structuredClone(empty);
  active.generals[7] = { idx: 7, attr: 0x80 };
  const named = chapterGapReport(active, 'one');
  assert.equal(named.saveGaps, 2); // 已登场但缺姓名与头像
  assert.ok(named.details.save.every(row => row.subject.includes('general[7]')));
});
test('asset report reuses the existing Trial gate, preserves unknowns and bounds display only', () => {
  const state = { generals: [{ idx: 0, portrait: 255 }, { idx: 127, portrait: 255 }, { portrait: '1' }], cities: [{ idx: 2, view: 999 }], factions: [] };
  const before = structuredClone(state), expected = trialChapterAssetGaps(state);
  assert.equal(expected.length, 2); // 255 exists in the numeric shared catalog at every slot.
  assert.deepEqual(chapterGapReport(state, 'assets').assets, { total: 2, items: expected, omitted: 0 });
  assert.deepEqual(expected[0], { kind: 'kao', slot: null, value: null, logicalURL: null });
  assert.deepEqual(state, before);
  const many = { generals: Array.from({ length: 128 }, (_, idx) => ({ idx })), cities: [], factions: [] };
  const report = chapterGapReport(many, 'many').assets;
  assert.deepEqual(report, { total: 128, items: trialChapterAssetGaps(many).slice(0, 100), omitted: 28 });
  assert.equal(chapterGapReport({ factions: [] }, 'unknown').assets, null);
  assert.deepEqual(chapterGapReport({ generals: [], cities: [], factions: [] }, 'empty').assets, { total: 0, items: [], omitted: 0 });
});
test('missing fields and cross-references retain exact validator locations, not source mutation', () => {
  const state = { generals: [{ idx: 0, attr: 0x80 }], cities: [{ idx: 0, governor: 9 }], factions: [{ idx: 0, monarch_idx: 9, advisor_idx: 8, capital: 7 }] };
  const before = structuredClone(state), report = chapterGapReport(state, '<img src=x>');
  assert.ok(report.details.save.some(row => /name：必填/.test(row.description)));
  assert.ok(report.details.active.some(row => /太守引用 9/.test(row.description)));
  assert.ok(report.details.active.some(row => /軍師引用 8/.test(row.description)));
  assert.ok([...report.details.save, ...report.details.active].every(row => row.recognized));
  assert.ok(report.details.save.every(row => row.subject.includes('<img src=x>')));
  assert.deepEqual(state, before);
});
test('bounded presentation preserves full counts and does not claim omitted diagnostics are absent', () => {
  const state = { generals: Array.from({ length: 128 }, (_, idx) => ({ idx, attr: 0x80 })), cities: [], factions: [] };
  const report = chapterGapReport(state, 'many');
  assert.equal(report.details.save.length, 100); assert.ok(report.details.omittedSave > 0);
  assert.equal(report.details.active.length, 100); assert.ok(report.details.omittedActive > 0);
  assert.equal(report.details.save.length + report.details.omittedSave, report.saveGaps);
  assert.equal(report.details.active.length + report.details.omittedActive, report.activeGaps);
});
test('no faction is a Web product active gap, not a draft-save requirement or an initialization rule', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', ownerId: 'owned-gap-test' });
  const id = game.chapterOrder[0], state = game.chapters[id].state;
  const before = structuredClone(state), saveBefore = chapterSaveGaps(state, id);
  state.factions = [];
  assert.deepEqual(chapterSaveGaps(state, id), saveBefore);
  assert.ok(chapterActiveGaps(state, id).some(gap => gap.code === 'chapter-factions'));
  assert.ok(trialChapterActiveGaps(state).some(gap => gap.kind === 'chapter-factions'));
  assert.ok(validateGameSource(game, { draft: true }).some(gap => gap.code === 'chapter-factions'));
  assert.throws(() => validateGameSource(game), /factions must include at least one entry/);
  const report = chapterGapReport(state, id);
  assert.ok(report.details.active.some(gap => gap.code === 'chapter-factions' && gap.recognized && /至少一個勢力/.test(gap.description)));
  assert.deepEqual(state.generals, before.generals); assert.deepEqual(state.cities, before.cities);
  const healthy = game.chapters[game.chapterOrder[1]].state;
  assert.equal(trialChapterActiveGaps(healthy).some(gap => gap.kind === 'chapter-factions'), false);
  const healthyId = game.chapterOrder[1], sha = text => createHash('sha256').update(text).digest('hex');
  const saved = structuredClone(game), projected = projectTrialChapter(game, healthyId, sha);
  assert.deepEqual(projected.selected.chapterOrder, [healthyId]);
  assert.deepEqual(projected.selected.chapters[healthyId].state, healthy);
  assert.deepEqual(projected.selected.map, game.map); assert.deepEqual(game, saved);
  assert.throws(() => projectTrialChapter(game, id, sha), /factions must include at least one entry/);
  const unsafe = structuredClone(game); unsafe.chapters[id].state.generals[0].name = '';
  assert.throws(() => projectTrialChapter(unsafe, healthyId, sha), /name is required/);
  const badShared = structuredClone(game); badShared.map.bounds.width = 385;
  assert.throws(() => projectTrialChapter(badShared, healthyId, sha));
});
test('public faction slots are unique integers in 0..21; hidden physical records are not public slots', () => {
  const message = 'faction idx must be unique 0..21';
  for (const idx of [undefined, null, -1, 0.5, 22, 23, 24, 128, NaN, Infinity, '0']) {
    const state = { generals: [], cities: [], factions: [{ idx }] }, before = structuredClone(state);
    const save = chapterSaveGaps(state, 'slots');
    assert.equal(chapterActiveGaps(state, 'slots').filter(gap => gap.message === message).length, 1, String(idx));
    assert.ok(chapterGapReport(state, 'slots').details.active.some(gap => gap.recognized && /勢力編號須唯一且在0～21/.test(gap.description)));
    assert.deepEqual(chapterSaveGaps(state, 'slots'), save); assert.deepEqual(state, before);
  }
  for (const factions of [[{ idx: 0 }], [{ idx: 21 }], [{ idx: 21 }, { idx: 0 }]]) {
    assert.equal(chapterActiveGaps({ factions }).some(gap => gap.message === message), false);
  }
  assert.equal(chapterActiveGaps({ factions: [{ idx: 0 }, { idx: 0 }] }).filter(gap => gap.message === message).length, 1);
});
test('duplicate public faction identity blocks selected Trial and whole-source active validation, not another complete chapter', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'dddddddd-dddd-4ddd-addd-dddddddddddd', ownerId: 'owned-faction-slot-test' });
  const message = 'faction idx must be unique 0..21', [bad, healthy] = game.chapterOrder;
  for (const id of game.chapterOrder) assert.equal(chapterActiveGaps(game.chapters[id].state, id).some(gap => gap.message === message), false);
  const state = game.chapters[bad].state, save = chapterSaveGaps(state, bad), raw = structuredClone(state.nativeFactionSlotRaw);
  assert.ok(state.factions.length > 1); state.factions[1].idx = state.factions[0].idx;
  const before = structuredClone(game), sha = text => createHash('sha256').update(text).digest('hex');
  assert.deepEqual(chapterSaveGaps(state, bad), save);
  assert.ok(validateGameSource(game, { draft: true }).some(gap => gap.message === message));
  assert.throws(() => validateGameSource(game), /faction idx must be unique/);
  assert.ok(trialChapterActiveGaps(state).some(gap => gap.message === message));
  assert.throws(() => projectTrialChapter(game, bad, sha), /faction idx must be unique/);
  const projected = projectTrialChapter(game, healthy, sha);
  assert.deepEqual(projected.selected.chapterOrder, [healthy]);
  assert.deepEqual(projected.selected.chapters[healthy].state, game.chapters[healthy].state);
  assert.deepEqual(state.nativeFactionSlotRaw, raw); assert.deepEqual(game, before);
});
test('ability active gaps reject non-integers and impossible nibble/byte representations without changing save gaps', () => {
  const limits = { siege: 15, field: 15, naval: 15, force: 255, lead: 255, politics: 255 };
  const ability = { siege: 0, field: 0, naval: 0, force: 0, lead: 0, politics: 0 };
  for (const [field, max] of Object.entries(limits)) {
    for (const value of [-1, 0.5, max + 1, NaN, Infinity, '1', null, undefined]) {
      const state = { generals: [{ idx: 0, name: '甲', hao: '', ability: { ...ability, [field]: value } }], cities: [], factions: [] };
      const before = structuredClone(state), save = chapterSaveGaps(state, 'ability');
      const found = chapterActiveGaps(state, 'ability').filter(gap => gap.subject.endsWith('.ability'));
      assert.equal(found.length, 1, `${field}=${String(value)}`);
      assert.equal(found[0].message, `chapter ability general[0].ability.${field} must be an integer in 0..${max}`);
      const report = chapterGapReport(state, 'ability');
      assert.ok(report.details.active.some(gap => gap.subject.endsWith('.ability') && gap.recognized && gap.description.includes(`0～${max}`)));
      assert.deepEqual(chapterSaveGaps(state, 'ability'), save); assert.deepEqual(state, before);
    }
    for (const value of [0, max]) {
      const state = { generals: [{ ability: { ...ability, [field]: value } }], cities: [], factions: [] };
      assert.equal(chapterActiveGaps(state).some(gap => gap.subject.endsWith('.ability')), false);
    }
  }
});
test('ability representation gaps block the selected chapter and whole-source validation, not an unrelated complete chapter', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'cccccccc-cccc-4ccc-accc-cccccccccccc', ownerId: 'owned-ability-gap-test' });
  const [bad, healthy] = game.chapterOrder, general = game.chapters[bad].state.generals[0];
  const sha = text => createHash('sha256').update(text).digest('hex');
  general.ability.force = 256;
  const before = structuredClone(game);
  assert.ok(validateGameSource(game, { draft: true }).some(gap => /force must be an integer in 0\.\.255$/.test(gap.message)));
  assert.throws(() => validateGameSource(game), /force must be an integer in 0\.\.255/);
  assert.ok(trialChapterActiveGaps(game.chapters[bad].state).some(gap => /force/.test(gap.message)));
  assert.throws(() => projectTrialChapter(game, bad, sha), /force must be an integer in 0\.\.255/);
  assert.deepEqual(projectTrialChapter(game, healthy, sha).selected.chapters[healthy], game.chapters[healthy]);
  assert.deepEqual(game, before);
  // Byte width is only representation validation, NOT permission to edit or play high values.
  general.ability.force = 255;
  assert.equal(chapterActiveGaps(game.chapters[bad].state, bad).some(gap => gap.subject.endsWith('.ability')), false);
});
test('all twenty pinned chapter count reports remain equal to the existing validators', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'owned-gap-test' });
  assert.equal(game.chapterOrder.length, 20);
  for (const chapterId of game.chapterOrder) {
    const state = game.chapters[chapterId].state, report = chapterGapReport(state, chapterId);
    assert.deepEqual({ saveGaps: report.saveGaps, activeGaps: report.activeGaps }, chapterGapCounts(state, chapterId));
    const assets = trialChapterAssetGaps(state);
    assert.deepEqual(report.assets, { total: assets.length, items: assets.slice(0, 100), omitted: Math.max(0, assets.length - 100) });
    assert.ok([...report.details.save, ...report.details.active].every(row => row.recognized));
  }
});
