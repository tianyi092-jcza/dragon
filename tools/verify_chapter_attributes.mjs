// §7 chapter attributes (docs/editor-workbench-structure.md, batch B4).
// Fixed Web inputs and shared writers only: no DOS saves, DB, browser profile,
// auth or runtime admission. Every claim is re-derived from the pinned copy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { factionNativeConsistencyGaps } from '../web/src/content/authoring/factionconsistency.js';
import {
  validateGameSource, setChapterStart, setChapterCityFaction, setFactionCapital, setChapterGeneralFaction, setFactionDiplomat,
} from '../web/src/content/authoring/gamesource.js';
const byte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const slotTable = state => Array.isArray(state.nativeCityRecordRaw) ? state.nativeCityRecordRaw : [];
const holdersOf = (state, idx) => {
  const posts = [];
  for (const f of state.factions) {
    if (f.monarch_idx === idx) posts.push({ slot: f.idx, post: 'monarch' });
    if (f.advisor_idx === idx) posts.push({ slot: f.idx, post: 'strategist' });
    if (f.diplomat_idx === idx) posts.push({ slot: f.idx, post: 'diplomat' });
  }
  return posts;
};
let record = 0;
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'chapter-attributes-' + ++record });
const profile = new FixedCopyProfile({ loadCopy: loader });
const captured = await profile.capture({ gameId: 'chapter-attributes-engineering-1', ownerId: 'chapter-attributes-owner' });
const game = captured.game, capability = captured.capability;
assert.equal(game.chapterOrder.length, 20);

test('pinned chapters keep named posts, capitals and the city owner byte aligned with fixed source', () => {
  let factions = 0, cities = 0;
  for (const id of game.chapterOrder) {
    const state = game.chapters[id].state, table = slotTable(state);
    for (const faction of state.factions) {
      factions++;
      assert.equal(faction.raw, state.nativeFactionSlotRaw[faction.idx], `${id}/${faction.idx} slot`);
      assert.equal(byte(faction.raw, 1), faction.monarch_idx === null ? 0xff : faction.monarch_idx, `${id}/${faction.idx} monarch`);
      assert.equal(byte(faction.raw, 2), faction.advisor_idx === null ? 0x7f : faction.advisor_idx, `${id}/${faction.idx} advisor`);
      assert.equal(byte(faction.raw, 3), faction.capital === null ? 0xff : faction.capital, `${id}/${faction.idx} capital`);
      assert.equal(byte(faction.raw, 0x2a), faction.diplomat_idx === null ? 0xff : faction.diplomat_idx, `${id}/${faction.idx} diplomat`);
    }
    for (const city of state.cities) {
      cities++;
      // +01 is the current owner (neutral 0x18); +1A is original content and
      // must keep whatever the pinned source holds.
      const expected = city.faction === null ? 0x18 : city.faction;
      assert.equal(byte(city.raw, 1), expected, `${id}/${city.idx} owner`);
      if (typeof table[city.idx] === 'string') {
        assert.equal(byte(table[city.idx], 1), expected, `${id}/${city.idx} fixed owner`);
        assert.equal(table[city.idx].slice(0x1a * 2, 0x1a * 2 + 2), city.raw.slice(0x1a * 2, 0x1a * 2 + 2), `${id}/${city.idx} old owner`);
      }
    }
    assert.deepEqual(factionNativeConsistencyGaps(state, id), [], id);
  }
  assert.ok(factions > 0 && cities > 0);
});

test('chapter attribute writers keep named views, fixed slots and strict validation aligned', () => {
  const edited = structuredClone(game), id = edited.chapterOrder[0], state = edited.chapters[id].state;
  const faction = state.factions[0], city = state.cities[0], other = state.cities[1];
  // The era is an authoring label beside the year: switching it cannot renumber
  // the chapter, and a later year write keeps the label.
  const { year, month, day } = state.start;
  setChapterStart(edited, id, { era: 'bc' });
  assert.equal(state.start.era, 'bc'); assert.deepEqual({ year: state.start.year, month: state.start.month, day: state.start.day }, { year, month, day });
  setChapterStart(edited, id, { year: year + 1, month: 2, day: 3 });
  assert.deepEqual({ era: state.start.era, year: state.start.year, month: state.start.month, day: state.start.day }, { era: 'bc', year: year + 1, month: 2, day: 3 });
  // City affiliation writes +01 in the record and the fixed table, and never
  // moves the original +1A old-owner byte.
  const table = slotTable(state), oldOwner = byte(city.raw, 0x1a);
  setChapterCityFaction(edited, id, city.idx, null);
  assert.equal(city.faction, null); assert.equal(byte(city.raw, 1), 0x18);
  if (typeof table[city.idx] === 'string') assert.equal(byte(table[city.idx], 1), 0x18);
  assert.equal(byte(city.raw, 0x1a), oldOwner);
  setChapterCityFaction(edited, id, city.idx, faction.idx);
  assert.equal(city.faction, faction.idx); assert.equal(byte(city.raw, 1), faction.idx);
  if (typeof table[city.idx] === 'string') assert.equal(byte(table[city.idx], 1), faction.idx);
  assert.equal(byte(city.raw, 0x1a), oldOwner);
  // Capital is one city per faction and does not require ownership.
  setFactionCapital(edited, id, faction.idx, other.idx);
  assert.equal(faction.capital, other.idx);
  assert.equal(byte(faction.raw, 3), other.idx);
  assert.equal(byte(state.nativeFactionSlotRaw[faction.idx], 3), other.idx);
  // General affiliation is a named-only record; posting generals must be freed.
  const member = state.generals.find(g => g.idx !== 127 && g.faction === faction.idx && !holdersOf(state, g.idx).length);
  const outsider = state.generals.find(g => g.idx !== 127 && g.faction !== faction.idx && !holdersOf(state, g.idx).length);
  assert.ok(member && outsider, 'pinned chapter needs an ordinary member and an outsider');
  setChapterGeneralFaction(edited, id, outsider.idx, faction.idx);
  assert.equal(outsider.faction, faction.idx);
  setChapterGeneralFaction(edited, id, outsider.idx, null);
  assert.equal(outsider.faction, null);
  // Diplomat writes +2A (0xFF sentinel when cleared) and refuses cross-faction.
  assert.deepEqual(setFactionDiplomat(edited, id, faction.idx, member.idx), { replaced: null });
  assert.equal(faction.diplomat_idx, member.idx);
  assert.equal(byte(faction.raw, 0x2a), member.idx);
  assert.equal(byte(state.nativeFactionSlotRaw[faction.idx], 0x2a), member.idx);
  setFactionDiplomat(edited, id, faction.idx, null);
  assert.equal(faction.diplomat_idx, null);
  assert.equal(byte(faction.raw, 0x2a), 0xff);
  assert.equal(byte(state.nativeFactionSlotRaw[faction.idx], 0x2a), 0xff);
  assert.deepEqual(factionNativeConsistencyGaps(state, id), []);
  assert.deepEqual(validateGameSource(edited, { draft: true }), []);
  assert.deepEqual(validateGameSource(edited), []);
});

test('copy profile reverts every chapter attribute command and still refuses outside deltas', () => {
  const id = game.chapterOrder[0], state = game.chapters[id].state;
  const faction = state.factions[0], city = state.cities[0];
  const member = state.generals.find(g => g.idx !== 127 && g.faction === faction.idx && !holdersOf(state, g.idx).length);
  const outsider = state.generals.find(g => g.idx !== 127 && g.faction !== faction.idx && !holdersOf(state, g.idx).length);
  assert.ok(member && outsider);
  const edits = [
    { op: 'start-date', chapterId: id, values: { era: 'bc', day: 2 } },
    { op: 'city-faction', chapterId: id, cityIdx: city.idx, factionId: null },
    { op: 'set-capital', chapterId: id, factionIdx: faction.idx, cityIdx: city.idx },
    { op: 'general-faction', chapterId: id, generalIdx: outsider.idx, factionId: faction.idx },
    { op: 'set-diplomat', chapterId: id, factionIdx: faction.idx, generalIdx: outsider.idx },
  ];
  const candidate = structuredClone(game);
  for (const edit of edits) {
    if (edit.op === 'start-date') setChapterStart(candidate, id, edit.values);
    else if (edit.op === 'city-faction') setChapterCityFaction(candidate, id, edit.cityIdx, edit.factionId);
    else if (edit.op === 'set-capital') setFactionCapital(candidate, id, edit.factionIdx, edit.cityIdx);
    else if (edit.op === 'general-faction') setChapterGeneralFaction(candidate, id, edit.generalIdx, edit.factionId);
    else setFactionDiplomat(candidate, id, edit.factionIdx, edit.generalIdx);
  }
  // The reversal reconstructs the pinned baseline, era included: the baseline
  // has no era key, so the revert deletes it instead of writing a default.
  assert.equal(typeof profile.verify(capability, candidate, edits).sourceDigest, 'string');
  assert.equal(Object.hasOwn(game.chapters[id].state.start, 'era'), false);
  // The same content without its command history is a protected delta.
  assert.throws(() => profile.verify(capability, candidate), error => error.code === 'COPY_PROTECTED_DELTA');
  // A field outside the commands, and a fixed byte the commands never wrote,
  // stay protected.
  const extraStart = structuredClone(candidate);
  extraStart.chapters[id].state.start.hour = 4;
  assert.throws(() => profile.verify(capability, extraStart, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  const extraRaw = structuredClone(candidate), raw = extraRaw.chapters[id].state.nativeCityRecordRaw;
  if (typeof raw[city.idx] === 'string') {
    const flipped = 0x1a, at = flipped * 2, value = (byte(raw[city.idx], flipped) ^ 1).toString(16).padStart(2, '0');
    raw[city.idx] = raw[city.idx].slice(0, at) + value + raw[city.idx].slice(at + 2);
    assert.throws(() => profile.verify(capability, extraRaw, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  }
});

test('chapter attribute writers refuse unknown targets and out-of-range input without repair', () => {
  const edited = structuredClone(game), id = edited.chapterOrder[0], state = edited.chapters[id].state;
  const faction = state.factions[0], city = state.cities[0];
  const missingFaction = Array.from({ length: 22 }, (_, idx) => idx).find(idx => !state.factions.some(row => row.idx === idx)) ?? 21;
  const posted = state.generals.find(g => g.idx !== 127 && holdersOf(state, g.idx).length);
  const outsider = state.generals.find(g => g.idx !== 127 && g.faction !== faction.idx && !holdersOf(state, g.idx).length);
  assert.ok(posted && outsider);
  // The pinned chapter declares every city slot, so an unknown city is proven
  // on a copy whose one record was removed rather than on an invented index.
  const sparse = structuredClone(edited);
  sparse.chapters[id].state.cities = state.cities.filter(row => row.idx !== city.idx);
  const before = structuredClone(edited), sparseBefore = structuredClone(sparse);
  const rejects = [
    ['unknown chapter', () => setChapterStart(edited, 'missing-chapter', { year: 1 })],
    ['unknown start key', () => setChapterStart(edited, id, { hour: 1 })],
    ['empty start', () => setChapterStart(edited, id, {})],
    ['year zero', () => setChapterStart(edited, id, { year: 0 })],
    ['year overflow', () => setChapterStart(edited, id, { year: 65536 })],
    ['fractional year', () => setChapterStart(edited, id, { year: 1.5 })],
    ['month overflow', () => setChapterStart(edited, id, { month: 13 })],
    ['day overflow', () => setChapterStart(edited, id, { day: 32 })],
    ['unknown era', () => setChapterStart(edited, id, { era: 'xx' })],
    ['unknown city', () => setChapterCityFaction(sparse, id, city.idx, null)],
    ['unknown city faction', () => setChapterCityFaction(edited, id, city.idx, missingFaction)],
    ['negative city faction', () => setChapterCityFaction(edited, id, city.idx, -1)],
    ['unknown capital city', () => setFactionCapital(sparse, id, faction.idx, city.idx)],
    ['unknown capital faction', () => setFactionCapital(edited, id, missingFaction, city.idx)],
    ['reserved general slot', () => setChapterGeneralFaction(edited, id, 127, null)],
    ['posted general', () => setChapterGeneralFaction(edited, id, posted.idx, null)],
    ['unknown general faction', () => setChapterGeneralFaction(edited, id, outsider.idx, missingFaction)],
    ['cross-faction diplomat', () => setFactionDiplomat(edited, id, faction.idx, outsider.idx)],
    ['posted diplomat', () => setFactionDiplomat(edited, id, faction.idx, posted.idx)],
    ['unknown diplomat faction', () => setFactionDiplomat(edited, id, missingFaction, outsider.idx)],
  ];
  for (const [label, run] of rejects) assert.throws(run, `${label} must refuse`);
  assert.deepEqual(edited, before);
  assert.deepEqual(sparse, sparseBefore);
});
