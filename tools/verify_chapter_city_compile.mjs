// Pure memory compiler-slice tests; no files, SAVE, IDB, fetch or live Scenario.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { compileChapterCityState as compileCitySlice } from '../web/src/content/authoring/chaptercitycompile.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';

function compileChapterCityState(source, chapter, roads = []) {
  return compileCitySlice(source, chapter, projectStructuredRoadGraph(roads, source));
}

// Synthetic transport only: reverse navigation slot order deliberately differs
// from the strategic list. These point/flag fixtures are not playable map assets.
function connectChapter(chapter, pairs) {
  return pairs.map(([from, to], index) => {
    const endpoints = [`city-${from}`, `city-${to}`];
    const slots = endpoints.map((node, end) => {
      const neighbours = chapter.cities[node].initializer.neighbourCityIds;
      const slot = neighbours.indexOf(null);
      neighbours[slot] = endpoints[1 - end];
      return { node, slot: 3 - slot, side: end === 0 ? 'source' : 'target' };
    });
    return { id: `road-${index}`, fromCityId: endpoints[0], toCityId: endpoints[1],
      geometry: [{ x: 0, y: 1 }], nativeBinding: { weight: 1, flags: [0], slots,
        bounds: { minX: 0, maxX: 0, minY: 1, maxY: 1 } } };
  });
}

function fixture(count) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  const source = {
    cities: Object.fromEntries(cityOrder.map(cityId => [cityId, { cityId, name: cityId,
      max_prod: 1000, prod: 300, growth: 100, defence: 100, troops: 10,
      troops_cap: 20, type: 0, view: 0, battleMapId: 'ki-1995:siege:0' }])),
    cityOrder, placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })),
  };
  const chapter = {
    cities: Object.fromEntries([...cityOrder].reverse().map(cityId => [cityId, {
      faction: 0, governor: null, prod: 600, growth: 120, defence: 130, troops: 30, troops_cap: 170,
      initializer: { attr: 0x64, _aiCooldown: 7, _strategicLastFaction: 0x18,
        strategicBorderCount: 2, disaster_event: 3, cityCacheByte: 9,
        neighbourCityIds: [null, null, null, null] },
    }])),
    factions: Array.from({ length: 22 }, (_, factionIndex) => ({ factionIndex,
      declared: factionIndex < 2, capitalCityId: factionIndex === 0 && count ? cityOrder.at(-1) : null,
      strategicCityPrimaryId: null, strategicCitySecondaryId: null, nCities: factionIndex === 0 ? count : 0 })),
  };
  return { source, chapter };
}

for (const count of [0, 1, 191, 192, 193, 257]) {
  test(`compile ${count} city references and counts with no raw/byte identity encoding`, () => {
    const { source, chapter } = fixture(count);
    const input = captureCitySource(source, { draft: false });
    const before = JSON.stringify({ input, chapter });
    const result = compileChapterCityState(input, chapter);
    assert.equal(result.cities.length, count);
    assert.equal(result.cityCache.length, count);
    assert.equal(result.factionCities.length, 22);
    assert.equal(result.factionCities[0].nCities, count);
    assert.equal(result.factionCities[0].capitalCityIndex, count ? count - 1 : null);
    assert.deepEqual(result.cities.map(city => city.idx), Array.from({ length: count }, (_, i) => i));
    assert.ok(result.cities.every(city => city.troops_cap === 170 && city.troops === 30));
    assert.ok(result.cities.every(city => !Object.hasOwn(city, 'raw') && city.attr === 0x64 && city._strategicLastFaction === 24));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert.equal(JSON.stringify({ input, chapter }), before);
  });
}

test('reordered IDs remap neighbours/capitals/orders and keep each initializer with its city', () => {
  const { source, chapter } = fixture(3);
  const roads = connectChapter(chapter, [[0, 1], [0, 2]]);
  chapter.cities['city-0'].initializer.neighbourCityIds = ['city-1', null, 'city-2', null];
  chapter.factions[0].capitalCityId = 'city-0';
  chapter.factions[0].strategicCityPrimaryId = 'city-2';
  chapter.factions[0].strategicCitySecondaryId = 'city-1';
  ['city-0', 'city-1', 'city-2'].forEach((id, i) => { chapter.cities[id].initializer.cityCacheByte = i + 7; });
  source.cityOrder = ['city-2', 'city-0', 'city-1'];
  const result = compileChapterCityState(captureCitySource(source, { draft: false }), chapter, roads);
  assert.deepEqual(result.cityCache, [9, 7, 8]);
  assert.deepEqual(result.cities[1].strategicNeighbours, [2, null, 0, null]);
  assert.equal(result.cities[1].x, 0);
  assert.deepEqual(result.factionCities[0], { factionIndex: 0, declared: true,
    capitalCityIndex: 1, strategicCityPrimaryIndex: 0, strategicCitySecondaryIndex: 2, nCities: 3 });
});

test('indices 192/254/255/256 are ordinary neighbours and faction city references', () => {
  const { source, chapter } = fixture(257);
  const roads = connectChapter(chapter, [[0, 192], [0, 254], [0, 255], [0, 256]]);
  chapter.cities['city-0'].initializer.neighbourCityIds = [192, 254, 255, 256].map(i => `city-${i}`);
  chapter.factions[0].strategicCityPrimaryId = 'city-255';
  chapter.factions[0].strategicCitySecondaryId = 'city-254';
  const result = compileChapterCityState(captureCitySource(source, { draft: false }), chapter, roads);
  assert.deepEqual(result.cities[0].strategicNeighbours, [192, 254, 255, 256]);
  assert.equal(result.factionCities[0].strategicCityPrimaryIndex, 255);
  assert.equal(result.factionCities[0].strategicCitySecondaryIndex, 254);
  assert.equal(result.factionCities[0].capitalCityIndex, 256);
});

test('unplaced chapter configuration or references are rejected, not silently omitted', () => {
  const { source, chapter } = fixture(2);
  source.placements.pop();
  const captured = captureCitySource(source, { draft: false });
  assert.throws(() => compileChapterCityState(captured, chapter), /exactly cover placed/);
  delete chapter.cities['city-1'];
  chapter.factions[0].nCities = 1;
  assert.throws(() => compileChapterCityState(captured, chapter), /unplaced capitalCityId/);
  chapter.factions[0].capitalCityId = null;
  chapter.cities['city-0'].initializer.neighbourCityIds[2] = 'city-1';
  assert.throws(() => compileChapterCityState(captured, chapter), /unplaced neighbourCityId/);
});

test('neutral ownership does not invent faction24; physical hidden slots stay hidden', () => {
  const { source, chapter } = fixture(2);
  chapter.cities['city-0'].faction = null;
  chapter.cities['city-1'].faction = 21;
  chapter.factions[0].nCities = 0;
  chapter.factions[21].nCities = 1;
  const result = compileChapterCityState(captureCitySource(source, { draft: false }), chapter);
  assert.equal(result.cities[0].faction, null);
  assert.equal(result.factionCities[21].nCities, 1);
  assert.equal(result.factionCities[21].declared, false);
  assert.equal(result.factionCities.length, 22);
});

test('malformed/missing values, stale counts and numeric sentinel references fail without writes', () => {
  for (const mutate of [
    c => { delete c.cities['city-0']; },
    c => { c.cities.extra = c.cities['city-0']; },
    c => { c.cities['city-0'].raw = '00'.repeat(32); },
    c => { c.cities['city-0'].faction = 24; },
    c => { c.cities['city-0'].governor = 128; },
    c => { c.cities['city-0'].prod = 65536; },
    c => { delete c.cities['city-0'].troops_cap; },
    c => { delete c.cities['city-0'].initializer; },
    c => { c.cities['city-0'].initializer.cityCacheByte = 256; },
    c => { delete c.cities['city-0'].initializer._aiCooldown; },
    c => { c.cities['city-0'].initializer.neighbourCityIds = [null]; },
    c => { c.cities['city-0'].initializer.neighbourCityIds = Array(4); },
    c => { c.cities['city-0'].initializer.neighbourCityIds[0] = 255; },
    c => { c.factions.pop(); },
    c => { delete c.factions[5]; },
    c => { c.factions[0].factionIndex = 1; },
    c => { c.factions[0].declared = 1; },
    c => { c.factions[0].nCities = 0; },
    c => { c.factions[0].capitalCityId = 255; },
    c => { c.factions[0].strategicCitySecondaryId = undefined; },
  ]) {
    const { source, chapter } = fixture(1);
    const captured = captureCitySource(source, { draft: false });
    mutate(chapter);
    const before = structuredClone(chapter);
    assert.throws(() => compileChapterCityState(captured, chapter));
    assert.deepEqual(chapter, before);
  }
});

test('known-but-disconnected, missing or duplicate neighbours cannot pass topology checking', () => {
  for (const neighbours of [[null, null, null, null], ['city-2', null, null, null], ['city-1', 'city-1', null, null]]) {
    const { source, chapter } = fixture(3);
    const roads = connectChapter(chapter, [[0, 1]]);
    chapter.cities['city-0'].initializer.neighbourCityIds = neighbours;
    assert.throws(() => compileChapterCityState(captureCitySource(source, { draft: false }), chapter, roads), /disagree with roads/);
  }
});

test('a valid graph for a different city ordering or placement is rejected', () => {
  const { source, chapter } = fixture(2);
  const captured = captureCitySource(source, { draft: false });
  const graph = projectStructuredRoadGraph([], captured);
  source.placements[0].x = 3;
  assert.throws(() => compileCitySlice(captureCitySource(source, { draft: false }), chapter, graph), /identities\/positions disagree/);
  source.placements[0].x = 0;
  source.cityOrder.reverse();
  assert.throws(() => compileCitySlice(captureCitySource(source, { draft: false }), chapter, graph), /identities\/positions disagree/);
  assert.throws(() => compileCitySlice(captured, chapter)); // no topology bypass
});

test('output state and cache are detached from both source slices', () => {
  const { source, chapter } = fixture(1);
  const captured = captureCitySource(source, { draft: false });
  const a = compileChapterCityState(captured, chapter);
  const b = compileChapterCityState(captured, chapter);
  a.cities[0].strategicNeighbours[0] = 0;
  a.cityCache[0] = 0;
  a.factionCities[0].capitalCityIndex = null;
  assert.deepEqual(b.cities[0].strategicNeighbours, [null, null, null, null]);
  assert.equal(b.cityCache[0], 9);
  assert.equal(b.factionCities[0].capitalCityIndex, 0);
  assert.deepEqual(chapter.cities['city-0'].initializer.neighbourCityIds, [null, null, null, null]);
});
