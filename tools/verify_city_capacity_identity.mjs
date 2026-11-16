// Pure C1 identity contract. No files, IDB, browser, network or native SAVE I/O.
// Passing this does NOT admit expanded content to the game/compiler.
import assert from 'node:assert/strict';
import { compileCityIdentity } from '../web/src/content/authoring/cityidentity.js';

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const source = count => {
  const cityOrder = Array.from({ length: count }, (_, index) => `city-${index}`);
  return {
    cities: Object.fromEntries([...cityOrder].reverse().map(cityId => [cityId, { cityId, name: 'same-name' }])),
    cityOrder,
    placements: cityOrder.map((cityId, index) => ({ cityId, x: index % 384, y: Math.floor(index / 384) })).reverse(),
  };
};

for (const count of [0, 1, 191, 192, 193, 257]) {
  check(`${count} identities follow cityOrder, not object/placement order`, () => {
    const input = source(count), before = JSON.stringify(input);
    const result = compileCityIdentity(input);
    assert.deepEqual(result.cityIds, input.cityOrder);
    assert.deepEqual(Object.values(result.indexByCityId), Array.from({ length: count }, (_, index) => index));
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
}
check('254/255/256 are ordinary indices, with no sentinel conversion', () => {
  const result = compileCityIdentity(source(257));
  for (const index of [192, 254, 255, 256]) assert.equal(result.indexByCityId[`city-${index}`], index);
});
check('unplaced records survive in source but have no runtime index', () => {
  const input = source(3);
  input.placements = input.placements.filter(row => row.cityId !== 'city-1');
  const result = compileCityIdentity(input);
  assert.deepEqual(result.cityIds, ['city-0', 'city-2']);
  assert.equal(result.indexByCityId['city-2'], 1);
  assert.equal(Object.hasOwn(result.indexByCityId, 'city-1'), false);
  assert.equal(input.cities['city-1'].cityId, 'city-1');
});
check('explicit reorder/deletion recompiles indices without renaming identity', () => {
  const input = source(3);
  input.cityOrder = ['city-2', 'city-0', 'city-1'];
  assert.deepEqual(compileCityIdentity(input).cityIds, input.cityOrder);
  delete input.cities['city-0'];
  input.cityOrder = input.cityOrder.filter(id => id !== 'city-0');
  input.placements = input.placements.filter(row => row.cityId !== 'city-0');
  assert.deepEqual(compileCityIdentity(input).indexByCityId, { 'city-2': 0, 'city-1': 1 });
});
check('renaming and old provenance slots cannot change index', () => {
  const input = source(2), before = compileCityIdentity(input);
  input.cities['city-0'].name = 'renamed';
  input.cities['city-0'].runtimeSlot = 255;
  assert.deepEqual(compileCityIdentity(input), before);
});
check('detached frozen JSON output does not follow later caller edits', () => {
  const input = source(2), result = compileCityIdentity(input);
  input.cityOrder.reverse();
  input.placements.length = 0;
  assert.deepEqual(result.cityIds, ['city-0', 'city-1']);
  assert.throws(() => result.cityIds.push('bad'), TypeError);
  assert.throws(() => { result.indexByCityId['city-0'] = 9; }, TypeError);
});
const invalid = [
  input => { input.cityOrder.pop(); },
  input => { input.cityOrder.push('absent'); },
  input => { input.cityOrder[1] = input.cityOrder[0]; },
  input => { input.cityOrder[1] = 'absent'; },
  input => { input.cityOrder[1] = null; },
  input => { delete input.cityOrder[1]; },
  input => { input.cities['city-1'].cityId = 'different'; },
  input => { input.placements.push({ cityId: 'absent' }); },
  input => { input.placements.push({ cityId: 'city-0' }); },
  input => { input.placements.push(null); },
];
invalid.forEach((mutate, index) => check(`invalid identity input ${index + 1} rejected`, () => {
  const input = source(2); mutate(input);
  assert.throws(() => compileCityIdentity(input), RangeError);
}));
check('wrong containers rejected', () => {
  for (const input of [
    { cities: [], cityOrder: [], placements: [] },
    { cities: null, cityOrder: [], placements: [] },
    { cities: {}, cityOrder: {}, placements: [] },
    { cities: {}, cityOrder: [], placements: null },
  ]) assert.throws(() => compileCityIdentity(input), TypeError);
});
check('all four map corners are legal centers without changing cityOrder', () => {
  const input = source(4);
  input.placements = [[0, 0], [383, 0], [0, 255], [383, 255]].map(([x, y], index) => ({ cityId: `city-${index}`, x, y }));
  assert.deepEqual(compileCityIdentity(input).cityIds, input.cityOrder);
});
check('moving a center never renumbers its identity', () => {
  const input = source(2), before = compileCityIdentity(input);
  input.placements[0].x = 383;
  input.placements[0].y = 255;
  assert.deepEqual(compileCityIdentity(input), before);
});
check('centers must be unique, including signed-zero aliases', () => {
  const input = source(2);
  input.placements = [{ cityId: 'city-0', x: 0, y: 0 }, { cityId: 'city-1', x: -0, y: 0 }];
  assert.throws(() => compileCityIdentity(input), /duplicate city center/);
});
for (const [x, y] of [[-1, 0], [384, 0], [0, -1], [0, 256], [0.5, 0], [0, 0.5], [NaN, 0], [0, Infinity], ['0', 0], [0, null], [undefined, 0]]) {
  check(`bad center ${String(x)},${String(y)} rejected`, () => {
    const input = source(1);
    input.placements[0] = { cityId: 'city-0', x, y };
    assert.throws(() => compileCityIdentity(input), /outside 384x256/);
  });
}
check('full plane of distinct centers has no hidden 192/byte ceiling', () => {
  const input = source(384 * 256);
  const result = compileCityIdentity(input);
  assert.equal(result.cityIds.length, 98304);
  assert.equal(result.indexByCityId['city-98303'], 98303);
});
console.log(`${checks}/${checks} identity contract checks passed (not runtime admission)`);
