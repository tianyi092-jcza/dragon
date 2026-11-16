// Pure in-memory source boundary tests; no SAVE, filesystem, IDB or network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';

function source(count = 1) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  return {
    cities: Object.fromEntries(cityOrder.map(cityId => [cityId, {
      cityId, name: cityId, max_prod: 1000, prod: 300, growth: 100,
      defence: 100, troops: 10, troops_cap: 20, type: 0, view: 0,
      battleMapId: 'siege-template-test',
    }])),
    cityOrder,
    placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })),
  };
}

for (const count of [0, 1, 191, 192, 193, 257]) {
  test(`strict source captures ${count} definitions without byte indices`, () => {
    const input = source(count);
    const result = captureCitySource(input, { draft: false });
    assert.equal(result.identity.cityIds.length, count);
    assert.deepEqual(result.cities, input.cities);
    if (count > 256) assert.equal(result.identity.indexByCityId['city-256'], 256);
    assert.deepEqual(captureCitySource(JSON.parse(JSON.stringify(input)), { draft: false }), result);
  });
}

test('draft missing defaults remain missing; strict placed city must be complete', () => {
  const input = source();
  input.cities['city-0'] = { cityId: 'city-0' };
  assert.deepEqual(captureCitySource(input).cities['city-0'], { cityId: 'city-0' });
  assert.throws(() => captureCitySource(input, { draft: false }), /incomplete placed/);
  input.placements = [];
  assert.deepEqual(captureCitySource(input, { draft: false }).identity.cityIds, []);
});

test('each required field, including cap and battle identity, is checked', () => {
  for (const key of Object.keys(source().cities['city-0']).filter(key => key !== 'cityId')) {
    const input = source();
    delete input.cities['city-0'][key];
    assert.throws(() => captureCitySource(input, { draft: false }), /incomplete placed/, key);
  }
});

test('no silent loss of legacy fields or placement metadata', () => {
  for (const key of ['raw', 'runtimeSlot', 'x', 'y', 'unknown']) {
    const input = source();
    input.cities['city-0'][key] = 0;
    assert.throws(() => captureCitySource(input), /unknown city definition field/);
  }
  const input = source();
  input.placements[0].unknown = true;
  assert.throws(() => captureCitySource(input), /unknown placement field/);
});

test('placement recipe identity and import provenance survive capture without aliasing', () => {
  const input = source(2);
  Object.assign(input.placements[0], { id: 'placement-0', componentRef: 'tile-205', variantRef: 'original', importRef: 'origin:cell-0' });
  Object.assign(input.placements[1], { id: 'placement-1', componentRef: null });
  const result = captureCitySource(input);
  assert.deepEqual(result.placements, input.placements);
  input.placements[0].componentRef = 'other';
  assert.equal(result.placements[0].componentRef, 'tile-205');
  input.placements[1].id = 'placement-0';
  assert.throws(() => captureCitySource(input), /duplicate placement id/);
  for (const key of ['id', 'componentRef', 'variantRef', 'importRef']) {
    for (const value of ['', 12, {}]) {
      const invalid = source(); invalid.placements[0][key] = value;
      assert.throws(() => captureCitySource(invalid), /invalid placement/);
    }
  }
});

test('numeric boundary keeps rule fields byte/word, not city indices', () => {
  for (const [field, max] of Object.entries({ max_prod: 65535, prod: 65535,
    growth: 255, defence: 255, troops: 255, troops_cap: 255, type: 15, view: 15 })) {
    for (const value of [-1, max + 1, NaN, Infinity, null, '0', 0.5]) {
      const input = source();
      input.cities['city-0'][field] = value;
      assert.throws(() => captureCitySource(input), new RegExp(`invalid city ${field}`));
    }
  }
  const input = source();
  Object.assign(input.cities['city-0'], { max_prod: 65535, prod: 65535, troops: 255, troops_cap: 255, type: 15, view: 15 });
  assert.equal(captureCitySource(input).cities['city-0'].troops_cap, 255);
});

test('no deriving cap from type and no default clamping', () => {
  for (const [field, value] of [['troops', 21], ['prod', 1001]]) {
    const input = source();
    input.cities['city-0'][field] = value;
    assert.throws(() => captureCitySource(input), /exceeds its cap/);
    assert.equal(input.cities['city-0'][field], value);
  }
  const input = source(2);
  input.cities['city-1'].troops_cap = 170;
  const result = captureCitySource(input, { draft: false });
  assert.equal(result.cities['city-0'].troops_cap, 20);
  assert.equal(result.cities['city-1'].troops_cap, 170);
});

test('names and binding syntax are explicit; resource compatibility is separate', () => {
  for (const name of ['', ' city ', 'a\u0000b']) {
    const input = source(); input.cities['city-0'].name = name;
    assert.throws(() => captureCitySource(input));
  }
  for (const battleMapId of ['', null, 12]) {
    const input = source(); input.cities['city-0'].battleMapId = battleMapId;
    assert.throws(() => captureCitySource(input), /battleMapId/);
  }
});

test('captured source is detached; no state/chapter mutation or provenance mixing', () => {
  const input = source();
  const result = captureCitySource(input, { draft: false });
  input.cities['city-0'].troops_cap = 99;
  input.placements[0].x = 300;
  input.cityOrder.length = 0;
  assert.equal(result.cities['city-0'].troops_cap, 20);
  assert.equal(result.placements[0].x, 0);
  assert.deepEqual(result.cityOrder, ['city-0']);
  assert.equal(Object.hasOwn(result.cities['city-0'], 'runtimeSlot'), false);
});
