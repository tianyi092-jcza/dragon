// Detached decision tests: fixed KI only plus private in-memory graph/state.
// No SAVE, profile, disk output, network or original CPU execution.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { encodeRoadGraphV2 } from '../web/src/content/authoring/roadedit.js';
import { createOriginalRoadMemory } from '../web/src/game/navigation/originalroadmemory.js';
import { retreatOriginalRoadMemory } from '../web/src/game/navigation/originalroadretreat.js';
import { findStructuredRetreatCity } from '../web/src/game/navigation/structuredroadretreat.js';

function fixture(count = 192, links = [[0, 1], [1, 2], [2, 3]]) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  const source = captureCitySource({
    cities: Object.fromEntries(cityOrder.map(cityId => [cityId, { cityId }])), cityOrder,
    placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })),
  });
  const used = Array(count).fill(0);
  const roads = links.map(([from, to], i) => ({ id: `road-${i}`,
    fromCityId: cityOrder[from], toCityId: cityOrder[to], geometry: [{ x: i, y: 0 }],
    nativeBinding: { weight: 2, flags: [0], bounds: { minX: i, maxX: i, minY: 0, maxY: 0 },
      slots: [{ node: cityOrder[from], slot: used[from]++, side: 'source' },
        { node: cityOrder[to], slot: used[to]++, side: 'target' }] },
  }));
  const graph = projectStructuredRoadGraph(roads, source);
  const oldGraph = count === 192
    ? encodeRoadGraphV2(roads, new Map(source.placements.map(p => [p.cityId, p]))) : null;
  return { graph, oldGraph };
}

function compare(f, position, capitalCityIndex, owners) {
  const memory = createOriginalRoadMemory(f.oldGraph);
  const oldReads = [], reads = [];
  const old = retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => capitalCityIndex === null ? 255 : capitalCityIndex,
    readCurrentWord: () => position.kind === 'city' ? position.cityIndex * 8 : 0x800 + position.roadIndex * 16,
    readGraphByte: memory.readByte, writeGraphByte: memory.writeByte,
    readStateByte: at => { const index = (at - 0x841) / 32; oldReads.push(index); return owners[index]; },
  });
  assert.notEqual(old.reason, 'exhausted', 'old exhausted false success is not the new oracle');
  const before = JSON.stringify({ graph: f.graph, position, owners });
  const result = findStructuredRetreatCity(f.graph, { position, capitalCityIndex, owner: 0,
    readCityOwner: index => { reads.push(index); return owners[index]; } });
  assert.equal(JSON.stringify({ graph: f.graph, position, owners }), before);
  assert.deepEqual(reads, oldReads);
  if (old.cf) assert.deepEqual(result, { status: 'unreachable', reason: old.reason });
  else assert.deepEqual(result, { status: old.reason === 'shortcut' ? 'already-there' : 'found', cityIndex: old.bx / 32 });
  return result;
}

test('KI 487B..491B retreat window pinned; no CPU execution claim', () => {
  const exe = readFileSync(new URL('../../Dragon/KI.EXE', import.meta.url));
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(exe), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
  assert.equal(hash(exe.subarray(0x487b + 0x200, 0x491b + 0x200)), '69d36b1879958c62f100428e8e2748b9e3557ff3562961b8e048f4884c75a0dd');
});

test('640 connected decisions match old endpoint choice and exact lazy owner reads', () => {
  const f = fixture();
  const positions = [0, 1, 2, 3].map(cityIndex => ({ kind: 'city', cityIndex }));
  for (let roadIndex = 0; roadIndex < 3; roadIndex++) for (const direction of [-1, 1])
    positions.push({ kind: 'road', roadIndex, pointIndex: 0, direction });
  let count = 0;
  for (let mask = 0; mask < 16; mask++) {
    const owners = Array.from({ length: 192 }, (_, i) => i < 4 ? ((mask >> i) & 1) : 0);
    for (let capital = 0; capital < 4; capital++) for (const position of positions) {
      compare(f, position, capital, owners);
      count++;
    }
  }
  assert.equal(count, 640);
});

test('equal-cost retreat retains root port order instead of sorting candidate city ids', () => {
  for (const [links, expected] of [
    [[[0, 1], [1, 2], [2, 0]], 1],
    [[[0, 1], [2, 0], [1, 2]], 0],
  ]) {
    const f = fixture(192, links);
    assert.deepEqual(compare(f, { kind: 'road', roadIndex: 0, pointIndex: 0, direction: 1 }, 2, Array(192).fill(0)),
      { status: 'found', cityIndex: expected });
  }
});

test('no-capital and same-city return before irrelevant fields/owner reads', () => {
  const fail = () => assert.fail('unexpected owner read');
  assert.deepEqual(findStructuredRetreatCity(null, { capitalCityIndex: null, owner: 0, readCityOwner: fail }),
    { status: 'unreachable', reason: 'no-capital' });
  const f = fixture();
  assert.deepEqual(findStructuredRetreatCity(f.graph, { position: { kind: 'city', cityIndex: 0 },
    capitalCityIndex: 0, owner: 0, readCityOwner: fail }), { status: 'already-there', cityIndex: 0 });
  compare(f, { kind: 'city', cityIndex: 0 }, null, Array(192).fill(0));
});

test('D5 isolated target yields no-route, never a fabricated city or fate execution', () => {
  const { graph } = fixture();
  for (const position of [{ kind: 'city', cityIndex: 0 }, { kind: 'road', roadIndex: 0, pointIndex: 0, direction: 1 }]) {
    assert.deepEqual(findStructuredRetreatCity(graph, { position, capitalCityIndex: 4, owner: 0,
      readCityOwner: () => 0 }), { status: 'unreachable', reason: 'no-route' });
  }
});

test('foreign endpoints and next city have separate reasons; unknown ownership is not no-route', () => {
  const { graph } = fixture();
  const road = { kind: 'road', roadIndex: 0, pointIndex: 0, direction: 1 };
  assert.deepEqual(findStructuredRetreatCity(graph, { position: road, capitalCityIndex: 3, owner: 0,
    readCityOwner: () => 24 }), { status: 'unreachable', reason: 'foreign-endpoints' });
  assert.deepEqual(findStructuredRetreatCity(graph, { position: { kind: 'city', cityIndex: 0 }, capitalCityIndex: 3,
    owner: 0, readCityOwner: i => i === 1 ? 1 : 0 }), { status: 'unreachable', reason: 'foreign-next-city' });
  assert.throws(() => findStructuredRetreatCity(graph, { position: road, capitalCityIndex: 3, owner: 0,
    readCityOwner: () => undefined }), /owner byte/);
});

test('indices 192/254/255/256 are ordinary retreat cities, null alone means no capital', () => {
  const { graph } = fixture(257, [[192, 254], [254, 255], [255, 256]]);
  assert.deepEqual(findStructuredRetreatCity(graph, { position: { kind: 'city', cityIndex: 192 },
    capitalCityIndex: 256, owner: 0, readCityOwner: () => 0 }), { status: 'found', cityIndex: 254 });
  assert.deepEqual(findStructuredRetreatCity(graph, { position: { kind: 'road', roadIndex: 2, pointIndex: 0, direction: 1 },
    capitalCityIndex: 192, owner: 0, readCityOwner: () => 0 }), { status: 'found', cityIndex: 255 });
  assert.deepEqual(findStructuredRetreatCity(graph, { position: { kind: 'city', cityIndex: 255 },
    capitalCityIndex: 255, owner: 0, readCityOwner: () => 0 }), { status: 'already-there', cityIndex: 255 });
});
