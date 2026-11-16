// In-memory old chapter projection tests, not native/runtime admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertLegacyChapterCities } from '../web/src/content/authoring/chaptercityconversion.js';

function fixture() {
  const bindings = Array.from({ length: 192 }, (_, runtimeSlot) => ({
    runtimeSlot, cityId: runtimeSlot === 0 ? 'city-255' : `stable-${runtimeSlot}`,
  }));
  const chapterOrder = ['a', 'b'];
  const chapters = Object.fromEntries(chapterOrder.map((id, chapterIndex) => {
    const nativeFactionSlotRaw = Array.from({ length: 22 }, (_, slot) => {
      const bytes = new Uint8Array(64);
      bytes[3] = slot === 0 || slot === 21 ? 0 : slot === 1 ? 1 : 255;
      bytes[0x16] = slot === 0 ? 191 : 255;
      bytes[0x17] = slot === 1 ? 0 : 255;
      bytes[0x23] = slot === 0 ? 99 : slot === 21 ? 4 : 0;
      return Buffer.from(bytes).toString('hex');
    });
    return [id, { state: {
      cities: bindings.map(({ runtimeSlot: idx }) => ({ idx,
        faction: idx === 0 ? 21 : idx % 2, governor: null, prod: 123,
        growth: 100, defence: 100, troops: 10, troops_cap: chapterIndex ? 170 : 20,
        raw: '11'.repeat(32),
      })).reverse(),
      factions: [
        { idx: 0, capital: 0, strategic_city_primary: 191, strategic_city_secondary: null, n_cities: 99 },
        { idx: 1, capital: 1, strategic_city_primary: 255, strategic_city_secondary: 0, n_cities: 0 },
      ], nativeFactionSlotRaw,
    } }];
  }));
  return { game: { schemaVersion: 1, chapterOrder, chapters }, bindings };
}

function rawByte(game, chapter, slot, offset, value) {
  const records = game.chapters[chapter].state.nativeFactionSlotRaw;
  const bytes = Buffer.from(records[slot], 'hex');
  bytes[offset] = value;
  records[slot] = bytes.toString('hex');
}

test('chapter values retain own caps and references use stable IDs, not positions', () => {
  const { game, bindings } = fixture(), before = structuredClone(game);
  const result = convertLegacyChapterCities(game, [...bindings].reverse());
  assert.equal(result.chapters.a.cities['city-255'].troops_cap, 20);
  assert.equal(result.chapters.b.cities['city-255'].troops_cap, 170);
  assert.equal(result.chapters.a.factions[0].capitalCityId, 'city-255');
  assert.equal(result.chapters.a.factions[0].strategicCityPrimaryId, 'stable-191');
  assert.equal(result.chapters.a.factions[0].strategicCitySecondaryId, null);
  assert.equal(result.chapters.a.factions[1].strategicCityPrimaryId, null);
  assert.equal(result.chapters.a.factions[1].strategicCitySecondaryId, 'city-255');
  assert.equal(Object.hasOwn(result.chapters.a.cities['city-255'], 'raw'), false);
  assert.deepEqual(game, before);
  assert.deepEqual(convertLegacyChapterCities(JSON.parse(JSON.stringify(game)), bindings), result);
  result.chapters.a.cities['city-255'].troops_cap = 1;
  assert.deepEqual(game, before);
});

test('all 22 physical slots survive without becoming declared factions; counts report changes', () => {
  const { game, bindings } = fixture();
  game.chapters.a.state.factions[0].n_cities = 100;
  const result = convertLegacyChapterCities(game, bindings);
  assert.equal(result.chapters.a.factions.length, 22);
  assert.equal(result.chapters.a.factions.filter(f => f.declared).length, 2);
  assert.equal(result.chapters.a.factions[21].declared, false);
  assert.equal(result.chapters.a.factions[21].nCities, 1);
  assert.equal(result.chapters.a.factions[0].nCities, 95);
  assert.equal(result.chapters.a.factions[1].nCities, 96);
  assert.equal(result.countChanges.length, 6);
  assert.deepEqual(result.countChanges[0], { chapterId: 'a', factionIndex: 0, before: 99, declaredBefore: 100, after: 95 });
  assert.equal(game.chapters.a.state.factions[0].n_cities, 100);
  assert.equal(game.chapters.a.state.nativeFactionSlotRaw[0].slice(0x23 * 2, 0x24 * 2), '63');
});

test('neutral ownership stays null and does not create faction 24', () => {
  const { game, bindings } = fixture();
  game.chapters.a.state.cities.find(c => c.idx === 0).faction = null;
  const result = convertLegacyChapterCities(game, bindings);
  assert.equal(result.chapters.a.cities['city-255'].faction, null);
  assert.equal(result.chapters.a.factions[21].nCities, 0);
  assert.equal(result.chapters.a.factions.length, 22);
});

test('missing or contradictory source is not reconstructed from guesses', () => {
  const mutations = [
    f => { f.game.schemaVersion = 2; },
    f => { f.game.chapterOrder = ['a', 'a']; },
    f => { f.bindings.pop(); },
    f => { f.bindings[1].runtimeSlot = 0; },
    f => { f.bindings[1].cityId = 'city-255'; },
    f => { f.game.chapters.a.state.cities[1].idx = 191; },
    f => { delete f.game.chapters.a.state.cities[0].troops_cap; },
    f => { f.game.chapters.a.state.cities[0].governor = 128; },
    f => { f.game.chapters.a.state.cities[0].faction = 24; },
    f => { f.game.chapters.a.state.nativeFactionSlotRaw.pop(); },
    f => { f.game.chapters.a.state.nativeFactionSlotRaw[21] = '00'; },
    f => { f.game.chapters.a.state.factions[0].capital = 1; },
    f => { rawByte(f.game, 'a', 21, 3, 192); },
    f => { rawByte(f.game, 'a', 21, 0x16, 254); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    const before = structuredClone(f);
    assert.throws(() => convertLegacyChapterCities(f.game, f.bindings));
    assert.deepEqual(f, before);
  }
});

test('imported initializer preserves cache, old owner, border quirks and all four neighbour slots', () => {
  const { game, bindings } = fixture();
  const city = game.chapters.a.state.cities.find(c => c.idx === 0);
  const bytes = Buffer.from(city.raw, 'hex');
  bytes[0] = 0x64; bytes[0x17] = 7; bytes[0x1a] = 0x18;
  bytes[0x1b] = 1; bytes[0x15] = 9; bytes[0x18] = 255;
  bytes.set([0, 255, 191, 255], 0x1c);
  city.raw = bytes.toString('hex');
  city.strategicNeighbours = [0, 255, 191, 255];
  game.chapters.a.state.nativeCityRecordRaw = [...game.chapters.a.state.cities]
    .sort((a, b) => a.idx - b.idx).map(c => c.raw.toUpperCase());
  const before = structuredClone(game);
  const result = convertLegacyChapterCities(game, bindings);
  const init = result.chapters.a.cities['city-255'].initializer;
  assert.deepEqual(init, { attr: 0x64, _aiCooldown: 7, _strategicLastFaction: 0x18,
    strategicBorderCount: 1, disaster_event: 9, cityCacheByte: 255,
    neighbourCityIds: ['city-255', null, 'stable-191', null] });
  init.neighbourCityIds[0] = 'changed';
  assert.deepEqual(game, before);
});

test('initializer input gaps, duplicate drift and unresolved neighbours fail without mutation', () => {
  const mutations = [
    city => { delete city.raw; },
    city => { city.raw = '00'; },
    city => { city.raw = 'gg'.repeat(32); },
    city => { city.raw = city.raw.slice(0, 62) + 'fe'; },
    city => { city._aiCooldown = 99; },
    city => { city.strategicNeighbours = [17, 17, 17, 255]; },
  ];
  for (const change of mutations) {
    const { game, bindings } = fixture();
    change(game.chapters.a.state.cities[0]);
    const before = structuredClone(game);
    assert.throws(() => convertLegacyChapterCities(game, bindings));
    assert.deepEqual(game, before);
  }
  const { game, bindings } = fixture();
  game.chapters.a.state.nativeCityRecordRaw = Array(192).fill('00'.repeat(32));
  assert.throws(() => convertLegacyChapterCities(game, bindings), /raw sources disagree/);
  game.chapters.a.state.nativeCityRecordRaw.pop();
  assert.throws(() => convertLegacyChapterCities(game, bindings), /duplicate city raw table/);
});

test('named reference omission uses existing complete raw, never an invented fallback', () => {
  const { game, bindings } = fixture();
  delete game.chapters.a.state.factions[0].strategic_city_primary;
  assert.equal(convertLegacyChapterCities(game, bindings).chapters.a.factions[0].strategicCityPrimaryId, 'stable-191');
  delete game.chapters.a.state.nativeFactionSlotRaw;
  assert.throws(() => convertLegacyChapterCities(game, bindings), /physical faction source/);
});
