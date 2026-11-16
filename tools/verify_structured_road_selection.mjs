// Detached selection oracle, not movement, occupancy, fate or runtime admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { captureCitySource } from '../web/src/content/authoring/citysource.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { encodeRoadGraphV2 } from '../web/src/content/authoring/roadedit.js';
import { createOriginalRoadMemory } from '../web/src/game/navigation/originalroadmemory.js';
import { selectOriginalRoad47BB } from '../web/src/game/navigation/originalroadmovement.js';
import { selectStructuredRoad } from '../web/src/game/navigation/structuredroadselection.js';

function fixture(count = 192, links = [[0, 1], [1, 2], [2, 3]]) {
  const cityOrder = Array.from({ length: count }, (_, i) => `city-${i}`);
  const source = captureCitySource({
    cities: Object.fromEntries(cityOrder.map(cityId => [cityId, { cityId }])), cityOrder,
    placements: cityOrder.map((cityId, i) => ({ cityId, x: i % 384, y: Math.floor(i / 384) })),
  });
  const used = Array(count).fill(0);
  const roads = links.map(([from, to], i) => ({ id: `road-${i}`,
    fromCityId: cityOrder[from], toCityId: cityOrder[to],
    geometry: [0, 1, 2].map(x => ({ x, y: i })),
    nativeBinding: { weight: 2, flags: [0, 0, 0], bounds: { minX: 0, maxX: 2, minY: i, maxY: i },
      slots: [{ node: cityOrder[from], slot: used[from]++, side: 'source' },
        { node: cityOrder[to], slot: used[to]++, side: 'target' }] },
  }));
  const graph = projectStructuredRoadGraph(roads, source);
  function compare(position, targetCityIndex, command = 1, foreign = false) {
    const memory = createOriginalRoadMemory(encodeRoadGraphV2(roads, new Map(source.placements.map(p => [p.cityId, p]))));
    const graphWord = at => memory.readByte(at) | memory.readByte(at + 1) << 8;
    const onRoad = position.kind === 'road';
    const current = onRoad ? 0x800 + position.roadIndex * 16 : position.cityIndex * 8;
    const point = onRoad ? graphWord(current) + position.pointIndex * 4 : 0x7777;
    const bytes = { 0: 0xa2, 1: 0, 0x0a: onRoad ? (position.direction === 1 ? 4 : 252) : 128, 0x23: command };
    const words = { 0x0e: current, 0x0c: point, 0x14: targetCityIndex * 8 };
    const oldReads = [], reads = [], fate = [], writes = [];
    const old = selectOriginalRoad47BB({
      readByte: at => bytes[at], readWord: at => words[at],
      writeByte: (at, value) => { writes.push(at); bytes[at] = value; },
      writeWord: (at, value) => { writes.push(at); words[at] = value; },
      graphWord, readGraphByte: memory.readByte, writeGraphByte: memory.writeByte,
      readCityOwnerByte: at => { oldReads.push((at - 0x841) / 32); return foreign ? 1 : 0; },
      fate: owner => fate.push(owner),
    });
    const before = JSON.stringify({ position, graph });
    const result = selectStructuredRoad(graph, { position, targetCityIndex, owner: 0, command,
      readCityOwner: index => { reads.push(index); return foreign ? 1 : 0; } });
    assert.equal(JSON.stringify({ position, graph }), before);
    assert.deepEqual(reads, oldReads);
    if (old.cf) {
      assert.equal(result.status, 'fate-required');
      assert.deepEqual(fate, [result.owner]);
      assert.deepEqual(writes, []);
    } else if (!onRoad && targetCityIndex === position.cityIndex) {
      assert.deepEqual(result, { status: 'already-there' });
      assert.deepEqual(writes, []);
      assert.equal(words[0x0c], 0x7777, 'old residual point not cleared');
      assert.equal(bytes[0x0a], 128, 'old residual stride not interpreted');
    } else {
      assert.equal(result.status, 'selected');
      const roadIndex = (words[0x0e] - 0x800) / 16;
      const pointIndex = (words[0x0c] - graphWord(words[0x0e])) / 4;
      assert.deepEqual(result.position, { kind: 'road', roadIndex, pointIndex, direction: bytes[0x0a] === 4 ? 1 : -1 });
      assert.equal(result.hasEnteredRoad, Boolean(bytes[0] & 1));
      assert.deepEqual(writes, onRoad ? [0, 0x0a] : [0x0c, 0x0e, 0, 0x0a]);
    }
    return result;
  }
  return { graph, compare };
}

test('KI 47BB selection window is pinned; not a CPU execution test', () => {
  const exe = readFileSync(new URL('../../Dragon/KI.EXE', import.meta.url));
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(exe), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
  assert.equal(hash(exe.subarray(0x47bb + 0x200, 0x487b + 0x200)), 'ea4bc330ab019a92b359b78c79b8bf346c9fac4cc095d45a1c32ec2f6035ead0');
});

test('city selection first/last point and already-there match old writes', () => {
  const f = fixture();
  for (let from = 0; from < 4; from++) for (let to = 0; to < 4; to++)
    f.compare({ kind: 'city', cityIndex: from }, to);
});

test('edge selection retains its point, changes only direction/progress, including shortcuts', () => {
  const f = fixture();
  for (let roadIndex = 0; roadIndex < 3; roadIndex++) for (let pointIndex = 0; pointIndex < 3; pointIndex++)
    for (const direction of [-1, 1]) for (let to = 0; to < 4; to++)
      f.compare({ kind: 'road', roadIndex, pointIndex, direction }, to);
});

test('high cost has distinct fate handoff, not execution or unreachable', () => {
  const f = fixture();
  for (const position of [{ kind: 'city', cityIndex: 0 }, { kind: 'road', roadIndex: 0, pointIndex: 1, direction: 1 }]) {
    assert.equal(f.compare(position, 3, 9, true).status, 'selected');
    assert.equal(f.compare(position, 3, 10, true).status, 'fate-required');
  }
  assert.equal(f.compare({ kind: 'road', roadIndex: 0, pointIndex: 1, direction: -1 }, 1, 10, true).status, 'selected');
});

test('D5 exhaustion never returns a fabricated road or automatically requests fate', () => {
  const { graph } = fixture();
  for (const command of [1, 10]) for (const position of [{ kind: 'city', cityIndex: 0 }, { kind: 'road', roadIndex: 0, pointIndex: 1, direction: 1 }]) {
    const before = JSON.stringify(position);
    assert.deepEqual(selectStructuredRoad(graph, { position, targetCityIndex: 4, owner: 0, command, readCityOwner: () => 0 }), { status: 'unreachable' });
    assert.equal(JSON.stringify(position), before);
  }
});

test('indices 192/254/255/256 are ordinary selection endpoints', () => {
  const { graph } = fixture(257, [[192, 254], [254, 255], [255, 256]]);
  const result = selectStructuredRoad(graph, { position: { kind: 'city', cityIndex: 192 }, targetCityIndex: 256, owner: 0, command: 1, readCityOwner: () => 0 });
  assert.deepEqual(result.position, { kind: 'road', roadIndex: 0, pointIndex: 0, direction: 1 });
  assert.equal(result.hasEnteredRoad, false);
  const back = selectStructuredRoad(graph, { position: { kind: 'road', roadIndex: 2, pointIndex: 1, direction: 1 }, targetCityIndex: 192, owner: 0, command: 1, readCityOwner: () => 0 });
  assert.deepEqual(back.position, { kind: 'road', roadIndex: 2, pointIndex: 1, direction: -1 });
});
