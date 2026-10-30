// Fixed Web inputs, detached objects only. No DOS saves, DB or browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { factionNativeConsistencyGaps } from '../web/src/content/authoring/factionconsistency.js';
import { chapterSaveGaps, chapterActiveGaps, validateGameSource, setStrategist, disbandFaction } from '../web/src/content/authoring/gamesource.js';
import { chapterGapReport } from '../server/chaptergapreport.js';
import { projectTrialChapter } from '../web/src/editor/trialscope.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
const { game } = await createPinnedCopyLoader()({ gameId: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', ownerId: 'owned-faction-consistency' });
const fields = { attr: 0, monarch_idx: 1, advisor_idx: 2, capital: 3, strategic_city_primary: 0x16, strategic_city_secondary: 0x17,
  target_faction: 0x19, legion_morale_cap: 0x1d, talk_style: 0x1e, n_cities: 0x23, bellicosity: 0x28, diplomat_idx: 0x2a, march_marker_style: 0x3e, money: 0x20, reserve_cav: 4, reserve_arc: 6, reserve_inf: 8 };
function flip(raw, offset) {
  const byte = Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16) ^ 1;
  return raw.slice(0, offset * 2) + byte.toString(16).padStart(2, '0') + raw.slice(offset * 2 + 2);
}
test('all 20 pinned chapters preserve direct-field consistency without modifying sources', () => {
  const before = structuredClone(game);
  for (const id of game.chapterOrder) assert.deepEqual(factionNativeConsistencyGaps(game.chapters[id].state, id), [], id);
  assert.deepEqual(game, before);
});
test('first and last declared slots, 17 direct fields, both mismatch directions refuse without repair', () => {
  let refusals = 0;
  for (const id of game.chapterOrder) {
    const source = game.chapters[id].state;
    for (const index of [0, source.factions.length - 1]) for (const [field, offset] of Object.entries(fields)) for (const direction of ['view', 'raw']) {
      const state = structuredClone(source), slot = state.factions[index].idx;
      if (direction === 'view') state.factions[index][field] = state.factions[index][field] === null ? 0 : (state.factions[index][field] + 1) & 255;
      else state.nativeFactionSlotRaw[slot] = flip(state.nativeFactionSlotRaw[slot], offset);
      const before = structuredClone(state), found = factionNativeConsistencyGaps(state, id);
      assert.equal(found.length, 1, `${id} ${slot} ${field} ${direction}`);
      assert.equal(found[0].code, 'entity-native-mismatch'); assert.ok(found[0].message.includes(`slot ${slot} ${field} differs`));
      assert.deepEqual(state, before); refusals++;
    }
  }
  assert.equal(refusals, 1360);
});
test('existing resource writer keeps signed money and all u16 pools consistent across 20 chapters', () => {
  const before = structuredClone(game);
  const values = [
    { money: -0x800000, reserve_cav: 0, reserve_arc: 65535, reserve_inf: 256 },
    { money: 0x7fffff, reserve_cav: 65535, reserve_arc: 0, reserve_inf: 1 },
    { money: -1, reserve_cav: 256, reserve_arc: 32768, reserve_inf: 65535 },
    { money: 0, reserve_cav: 1, reserve_arc: 256, reserve_inf: 0 },
  ];
  for (const id of game.chapterOrder) for (const patch of values) {
    const source = { gameId: game.gameId, sourceRef: game.sourceRef, chapterOrder: [id], chapters: { [id]: game.chapters[id] } };
    const next = editChapterResources(source, id, source.chapters[id].state.factions[0].idx, patch);
    assert.deepEqual(factionNativeConsistencyGaps(next.chapters[id].state, id), []);
    for (const [field, value] of Object.entries(patch)) assert.equal(next.chapters[id].state.factions[0][field], value);
  }
  assert.deepEqual(game, before); // Storage representation, not arbitrary-value gameplay certification.
});
test('unknown bytes and omitted raw are not inferred; malformed present tables refuse', () => {
  const id = game.chapterOrder[0], source = game.chapters[id].state;
  for (const offset of [0x0b, 0x2b, 0x30]) {
    const state = structuredClone(source); state.nativeFactionSlotRaw[0] = flip(state.nativeFactionSlotRaw[0], offset);
    assert.deepEqual(factionNativeConsistencyGaps(state, id), []);
  }
  const omitted = structuredClone(source); delete omitted.nativeFactionSlotRaw;
  assert.deepEqual(factionNativeConsistencyGaps(omitted, id), []); // Not a playable certificate.
  for (const raw of [null, [], source.nativeFactionSlotRaw.slice(0, 21), [...source.nativeFactionSlotRaw, source.nativeFactionSlotRaw[0]], source.nativeFactionSlotRaw.map((row, i) => i === 0 ? 'zz'.repeat(64) : row)]) {
    assert.equal(factionNativeConsistencyGaps({ ...source, nativeFactionSlotRaw: raw }, id)[0].code, 'entity-native-source');
  }
});
test('fixed native views require declared prefix order, not just unique slot IDs', () => {
  const id = game.chapterOrder[0], state = structuredClone(game.chapters[id].state);
  assert.ok(state.factions.length > 1);
  [state.factions[0], state.factions[1]] = [state.factions[1], state.factions[0]];
  const before = structuredClone(state), found = factionNativeConsistencyGaps(state, id);
  assert.equal(found.length, 2); assert.ok(found.every(gap => gap.code === 'entity-native-view'));
  assert.ok(chapterGapReport(state, id).details.active.filter(row => row.code === 'entity-native-view').every(row => row.recognized));
  assert.deepEqual(state, before);
  state.factions = [state.factions[0]];
  assert.equal(factionNativeConsistencyGaps(state, id)[0].code, 'entity-native-view');
});
test('tail disband retains native source and must reject inconsistent declared count in all 20 chapters', () => {
  for (const id of game.chapterOrder) {
    const chapter = structuredClone(game.chapters[id]), state = chapter.state;
    const before = structuredClone(state), slot = state.factions.at(-1).idx;
    disbandFaction({ chapterOrder: [id], chapters: { [id]: chapter } }, id, slot);
    assert.equal(state.n_factions, before.n_factions);
    assert.equal(state.factions.length, before.factions.length - 1);
    assert.deepEqual(state.nativeFactionSlotRaw, before.nativeFactionSlotRaw);
    const after = structuredClone(state), gaps = factionNativeConsistencyGaps(state, id);
    assert.equal(gaps.length, 1, id); assert.equal(gaps[0].code, 'entity-native-view');
    assert.match(gaps[0].message, /declared faction count/);
    assert.ok(chapterActiveGaps(state, id).some(gap => gap.code === 'entity-native-view'));
    assert.deepEqual(chapterSaveGaps(state, id), chapterSaveGaps(before, id));
    assert.deepEqual(state, after);
  }
  const edited = structuredClone(game), [bad, healthy] = edited.chapterOrder;
  disbandFaction(edited, bad, edited.chapters[bad].state.factions.at(-1).idx);
  const sha = text => createHash('sha256').update(text).digest('hex');
  assert.throws(() => validateGameSource(edited), /declared faction count/);
  assert.throws(() => projectTrialChapter(edited, bad, sha), /declared faction count/);
  assert.deepEqual(projectTrialChapter(edited, healthy, sha).selected.chapters[healthy], game.chapters[healthy]);
  assert.ok(chapterGapReport(edited.chapters[bad].state, bad).details.active.some(row => row.code === 'entity-native-view' && row.recognized));
});
test('present declared count is compared without deriving or filling absent counts', () => {
  const id = game.chapterOrder[0], source = game.chapters[id].state;
  for (const count of [null, undefined, -1, 0, 23, 1.5, String(source.factions.length), NaN]) {
    const state = { ...source, n_factions: count };
    assert.equal(factionNativeConsistencyGaps(state, id)[0].code, 'entity-native-view');
    assert.ok(Object.is(state.n_factions, count));
  }
  const absent = { ...source }; delete absent.n_factions;
  assert.deepEqual(factionNativeConsistencyGaps(absent, id), []);
  assert.equal(Object.hasOwn(absent, 'n_factions'), false); // Comparison-only, not missing-dependency admission.
});
test('existing draft role writer cannot compile a view that fresh would overwrite; other complete chapter remains independent', () => {
  const edited = structuredClone(game), [bad, healthy] = edited.chapterOrder, state = edited.chapters[bad].state;
  const faction = state.factions.find(row => row.advisor_idx !== null); assert.ok(faction);
  const save = chapterSaveGaps(state, bad), raw = [...state.nativeFactionSlotRaw];
  setStrategist(edited, bad, faction.idx, null);
  const before = structuredClone(edited);
  assert.ok(chapterActiveGaps(state, bad).some(gap => gap.code === 'entity-native-mismatch'));
  assert.deepEqual(chapterSaveGaps(state, bad), save);
  assert.ok(validateGameSource(edited, { draft: true }).some(gap => gap.code === 'entity-native-mismatch'));
  assert.throws(() => validateGameSource(edited), /advisor_idx differs from native source/);
  const sha = text => createHash('sha256').update(text).digest('hex');
  assert.throws(() => projectTrialChapter(edited, bad, sha), /advisor_idx differs from native source/);
  const selected = projectTrialChapter(edited, healthy, sha);
  assert.deepEqual(selected.selected.chapters[healthy], edited.chapters[healthy]);
  const report = chapterGapReport(state, bad);
  assert.ok(report.details.active.some(row => row.code === 'entity-native-mismatch' && row.recognized && row.description.includes('advisor_idx')));
  assert.deepEqual(state.nativeFactionSlotRaw, raw); assert.deepEqual(edited, before);
});
