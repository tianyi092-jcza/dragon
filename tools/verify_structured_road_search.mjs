// Detached kernel checks: synthetic topology/fees, NOT playable map admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { encodeRoadGraphV2 } from '../web/src/content/authoring/roadedit.js';
import { searchOriginalRoadMemory } from '../web/src/game/navigation/originalroadsearch.js';
import { searchStructuredRoadGraph } from '../web/src/game/navigation/structuredroadsearch.js';

function fixture(count, links) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  const citySource = captureCitySource({
    cities: Object.fromEntries(cityOrder.map(cityId => [cityId, { cityId }])), cityOrder,
    placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })),
  });
  const used = Array(count).fill(0);
  const roads = links.map(([from, to, weight], i) => ({
    id: `road-${i}`, fromCityId: cityOrder[from], toCityId: cityOrder[to],
    geometry: [{ x: i % 384, y: Math.floor(i / 384) }],
    nativeBinding: { weight, flags: [0], bounds: { minX: i % 384, maxX: i % 384,
      minY: Math.floor(i / 384), maxY: Math.floor(i / 384) }, slots: [
      { node: cityOrder[from], slot: used[from]++, side: 'source' },
      { node: cityOrder[to], slot: used[to]++, side: 'target' },
    ] },
  }));
  const graph = projectStructuredRoadGraph(roads, citySource);
  function compare(startCityIndex, stopCityIndices, owners = Array(count).fill(0)) {
    const v2 = encodeRoadGraphV2(roads, new Map(citySource.placements.map(p => [p.cityId, p])));
    // Explicit private memory for the exact fields this primitive consumes.
    // No runtime/default-memory claim; graph and reciprocal ports are valid.
    const memory = new Uint8Array(65536), words = new DataView(memory.buffer);
    v2.nodes.forEach(node => node.edgeSlots.forEach((tag, slot) => words.setUint16(node.id * 8 + slot * 2, tag, true)));
    v2.edges.forEach(edge => {
      const address = 0x800 + edge.id * 16;
      memory[address + 4] = edge.weight;
      words.setUint16(address + 6, edge.source * 8, true);
      words.setUint16(address + 8, edge.target * 8, true);
    });
    const originalReads = [], structuredReads = [];
    const old = searchOriginalRoadMemory({ start: startCityIndex * 8,
      stopB: stopCityIndices[0] * 8, stopC: (stopCityIndices[1] ?? stopCityIndices[0]) * 8, owner: 0,
      readGraphByte: address => memory[address], writeGraphByte: (address, value) => { memory[address] = value; },
      readStateByte: address => { const index = (address - 0x841) / 32; originalReads.push(index); return owners[index]; },
    });
    const before = JSON.stringify(graph);
    const result = searchStructuredRoadGraph(graph, { startCityIndex, stopCityIndices, owner: 0,
      readCityOwner: index => { structuredReads.push(index); return owners[index]; } });
    assert.equal(JSON.stringify(graph), before);
    assert.deepEqual(structuredReads, originalReads, 'lazy owner read order');
    if (old.reason === 'shortcut') assert.deepEqual(result, { status: 'already-there', cityIndex: startCityIndex });
    else if (old.reason === 'exhausted') assert.deepEqual(result, { status: 'unreachable' });
    else {
      assert.ok(old.ax === 4 || old.ax === 0xfffc);
      const roadIndex = (old.bx - 0x800) / 16;
      const direction = old.ax === 4 ? 1 : -1;
      assert.deepEqual(result, { status: 'found', roadIndex, direction, costWord: old.cx,
        cityIndex: direction === 1 ? v2.edges[roadIndex].source : v2.edges[roadIndex].target });
    }
    return result;
  }
  return { graph, compare };
}

test('KI source window identity (static bytes, not CPU execution)', () => {
  const exe = readFileSync(new URL('../../Dragon/KI.EXE', import.meta.url));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(exe), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
  assert.equal(sha(exe.subarray(0x491b + 0x200, 0x4a7b + 0x200)), '5726902195fc4ed43b079e026a2721ddceb9530981743d3b8afab1d40c3812e0');
});

test('S2 interleaving is not a stable priority queue: new C precedes carried B', () => {
  const f = fixture(4, [[0, 1, 1], [0, 2, 6], [1, 3, 1]]);
  assert.equal(f.compare(0, [2, 3]).cityIndex, 3);
  assert.equal(f.compare(0, [3, 2]).cityIndex, 3);
});

test('S3 reciprocal port visits retain multiple entries for a node', () => {
  const f = fixture(5, [[0, 1, 1], [0, 2, 1], [1, 3, 1], [2, 3, 2], [3, 4, 3]]);
  for (let start = 0; start < 5; start++) for (let stop = 0; stop < 5; stop++) f.compare(start, [stop]);
});

test('shortcut and exhausted are distinct; no fallback road zero', () => {
  const f = fixture(3, [[0, 1, 1]]);
  assert.equal(f.compare(2, [2]).status, 'already-there');
  assert.equal(f.compare(0, [2]).status, 'unreachable');
  assert.equal(f.compare(2, [0]).status, 'unreachable');
  assert.deepEqual(searchStructuredRoadGraph(f.graph, { startCityIndex: 1, stopCityIndices: [2, 1], owner: 0 }),
    { status: 'already-there', cityIndex: 1 });
});

test('two foreign cities and legacy word carry preserve 491B cost encoding', () => {
  const f = fixture(3, [[0, 1, 1], [1, 2, 1]]);
  assert.equal(f.compare(0, [2], [1, 1, 0]).costWord, 0x8156);
  const chain = fixture(79, Array.from({ length: 78 }, (_, i) => [i, i + 1, 255]));
  assert.equal(chain.compare(0, [78], Array(79).fill(1)).costWord, 0x817e);
});

test('all city indices including 192/254/255/256 use ordinary city fees', () => {
  const f = fixture(257, Array.from({ length: 256 }, (_, i) => [i, i + 1, 1]));
  for (const index of [192, 254, 255, 256]) {
    const reads = [];
    const result = searchStructuredRoadGraph(f.graph, { startCityIndex: index, stopCityIndices: [0], owner: 0,
      readCityOwner: cityIndex => { reads.push(cityIndex); return 0; } });
    assert.deepEqual(result, { status: 'found', cityIndex: 0, costWord: index * 5, roadIndex: 0, direction: 1 });
    assert.equal(reads[0], index);
    assert.equal(reads.includes(0), false, 'stop is checked before owner/fees');
  }
});

test('256 simultaneous frontier entries are not a 128-record ring or byte count', () => {
  const links = Array.from({ length: 255 }, (_, i) => [[i, i * 2 + 1, 1], [i, i * 2 + 2, 1]]).flat();
  const f = fixture(511, links);
  let reads = 0;
  assert.deepEqual(searchStructuredRoadGraph(f.graph, { startCityIndex: 0, stopCityIndices: [510], owner: 0,
    readCityOwner: () => { reads++; return 0; } }),
  { status: 'found', cityIndex: 510, costWord: 40, roadIndex: 509, direction: -1 });
  assert.equal(reads, 510);
});

test('bad query/unknown owner fails instead of reporting unreachable', () => {
  const f = fixture(2, [[0, 1, 1]]);
  const query = { startCityIndex: 0, stopCityIndices: [1], owner: 0, readCityOwner: () => 0 };
  for (const patch of [{ startCityIndex: 2 }, { startCityIndex: null }, { stopCityIndices: [] },
    { stopCityIndices: [undefined] }, { stopCityIndices: [0, 1, 0] }, { owner: 256 },
    { readCityOwner: () => undefined }, { readCityOwner: () => null }]) {
    assert.throws(() => searchStructuredRoadGraph(f.graph, { ...query, ...patch }));
  }
});
