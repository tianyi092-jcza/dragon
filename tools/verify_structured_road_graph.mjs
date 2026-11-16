// Pure transport tests. Synthetic geometry is NOT an admitted map/port recipe.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { encodeRoadGraphV2 } from '../web/src/content/authoring/roadedit.js';

function source(count) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  return captureCitySource({ cityOrder, cities: Object.fromEntries(cityOrder.map(cityId => [cityId, { cityId }])),
    placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })) });
}
function road(id, from, to, fromSlot = 0, toSlot = 2) {
  return { id, fromCityId: `city-${from}`, toCityId: `city-${to}`, travelKind: 'land',
    geometry: [{ x: 10, y: 10 }, { x: 11, y: 10 }],
    nativeBinding: { weight: 255, flags: [68, 4], bounds: { minX: 10, maxX: 11, minY: 10, maxY: 10 },
      slots: [{ node: `city-${from}`, slot: fromSlot, side: 'source' }, { node: `city-${to}`, slot: toSlot, side: 'target' }] } };
}

test('empty and isolated nodes have four explicit null ports', () => {
  assert.equal(projectStructuredRoadGraph([], source(0)).nodes.length, 0);
  assert.deepEqual(projectStructuredRoadGraph([], source(1)).nodes[0].ports, [null, null, null, null]);
});

test('v2 normal-domain point/cost/bounds and ordered endpoint tags project exactly', () => {
  const cities = source(3), roads = [road('r0', 0, 1, 3, 1), road('r1', 1, 2, 0, 2)];
  const old = encodeRoadGraphV2(roads, new Map(cities.placements.map(p => [p.cityId, p])));
  const graph = projectStructuredRoadGraph(roads, cities);
  for (const [i, node] of old.nodes.entries()) {
    assert.deepEqual(graph.nodes[i].ports, node.edgeSlots.map(tag => tag === 0 ? null : {
      roadIndex: ((tag & 0x3fff) - 0x800) / 16, end: tag & 0x4000 ? 'from' : 'to',
    }));
  }
  for (const [i, edge] of old.edges.entries()) {
    assert.deepEqual(graph.edges[i], { roadId: roads[i].id, fromCityIndex: edge.source,
      toCityIndex: edge.target, cost: edge.weight, points: edge.points, bounds: edge.bounds });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(graph)), graph);
  assert.equal(graph.version, 3);
});

for (const count of [193, 257]) test(`${count} nodes / ${count * 2} edges have no city-byte or edge-address ceiling`, () => {
  const cities = source(count);
  const roads = cities.cityOrder.flatMap((_, i) => [
    road(`r${i}-1`, i, (i + 1) % count, 0, 2), road(`r${i}-2`, i, (i + 2) % count, 1, 3),
  ]);
  const graph = projectStructuredRoadGraph(roads, cities);
  assert.equal(graph.edges.length, count * 2);
  for (const index of [192, 254, 255, 256].filter(index => index < count)) {
    assert.equal(graph.nodes[index].cityIndex, index);
    assert.equal(graph.edges[index * 2].fromCityIndex, index);
  }
  assert.equal(graph.nodes[127].ports[1].roadIndex, 255);
  assert.equal(graph.nodes[128].ports[0].roadIndex, 256);
  assert.throws(() => encodeRoadGraphV2(roads, new Map(cities.placements.map(p => [p.cityId, p]))), /encoding space/);
});

test('cityOrder recompiles endpoints without changing stable road identity or port order', () => {
  const cities = captureCitySource({ ...source(3), cityOrder: ['city-2', 'city-0', 'city-1'] });
  const graph = projectStructuredRoadGraph([road('stable-road', 0, 1, 3, 1)], cities);
  assert.equal(graph.edges[0].roadId, 'stable-road');
  assert.equal(graph.edges[0].fromCityIndex, 1);
  assert.equal(graph.edges[0].toCityIndex, 2);
  assert.deepEqual(graph.nodes[1].ports[3], { roadIndex: 0, end: 'from' });
  assert.deepEqual(graph.nodes[2].ports[1], { roadIndex: 0, end: 'to' });
});

test('point indices are not limited by the old 6144-entry address plane', () => {
  const r = road('long', 0, 1);
  r.geometry = Array.from({ length: 6145 }, (_, i) => ({ x: i % 384, y: Math.floor(i / 384) }));
  r.nativeBinding.flags = Array(6145).fill(255);
  r.nativeBinding.bounds = { minX: 0, maxX: 383, minY: 0, maxY: 16 };
  const graph = projectStructuredRoadGraph([r], source(2));
  assert.equal(graph.edges[0].points.length, 6145);
  assert.equal(graph.edges[0].points[6144].flags, 255);
});

test('invalid references, widths, holes and nonreciprocal ports reject without input changes', () => {
  const mutations = [
    r => { r.id = ''; }, r => { r.toCityId = 'missing'; }, r => { r.toCityId = r.fromCityId; },
    r => { r.nativeBinding.weight = 256; }, r => { r.nativeBinding.flags.pop(); },
    r => { r.nativeBinding.flags[0] = -1; }, r => { delete r.geometry[0]; },
    r => { r.geometry[0].x = 384; }, r => { r.nativeBinding.bounds.minX = 9; },
    r => { r.nativeBinding.slots.pop(); }, r => { r.nativeBinding.slots[1].side = 'source'; },
    r => { r.nativeBinding.slots[1].node = r.fromCityId; }, r => { r.nativeBinding.slots[0].slot = 4; },
    r => { delete r.nativeBinding.slots[1]; },
  ];
  for (const mutate of mutations) {
    const r = road('r', 0, 1); mutate(r);
    const before = structuredClone(r);
    assert.throws(() => projectStructuredRoadGraph([r], source(2)));
    assert.deepEqual(r, before);
  }
  assert.throws(() => projectStructuredRoadGraph(Array(1), source(2)), /road identity/);
  assert.throws(() => projectStructuredRoadGraph([road('r', 0, 1), road('r', 1, 2)], source(3)), /duplicate road/);
  assert.throws(() => projectStructuredRoadGraph([road('r', 0, 1), road('s', 0, 2)], source(3)), /collision/);
});

test('visual travel kind does not synthesize cost; output is detached', () => {
  const r = road('r', 0, 1), cities = source(2);
  const before = structuredClone(r), graph = projectStructuredRoadGraph([r], cities);
  r.travelKind = 'water';
  assert.deepEqual(projectStructuredRoadGraph([r], cities), graph);
  r.geometry[0].x = 12; r.nativeBinding.flags[0] = 0; cities.placements[0].x = 300;
  assert.equal(graph.edges[0].points[0].x, before.geometry[0].x);
  assert.equal(graph.edges[0].points[0].flags, 68);
  assert.equal(graph.nodes[0].x, 0);
});
