// Unit boundaries for authoritative routing. No browser-supplied lane or stored state.
import assert from 'node:assert/strict';
import { baseMapSaveLane } from '../server/basemapsavelane.js';
const def = (tile, dx = 0) => ({ anchor: [dx,0], variants: { original: { tiles: [[0,0,tile]] } } });
const defs = { water: def(12), gate: def(212), offset: def(184,1) };
const item = (id, definitionRef, x, y = 3) => ({ id, definitionRef, x, y });
const water = item('w','water',8), gate = item('g','gate',8), offset = item('a','offset',9);
const scene = (decorations, roads = [], placements = []) => ({ componentDefinitions: defs, map: { base: { policy: 'sea-ground-1' }, roads, placements, decorations } });
const placed = [{ op: 'decoration-place', instanceId: 'w' }];
assert.equal(baseMapSaveLane(scene([]),scene([water]),placed),'direct');
for (const road of [gate, offset]) {
  assert.equal(baseMapSaveLane(scene([road]),scene([road,water]),placed),'roads-cities');
  assert.equal(baseMapSaveLane(scene([road,water]),scene([road]),[{op:'decoration-remove',memberIds:['w']}]),'roads-cities');
}
assert.equal(baseMapSaveLane(scene([]),scene([gate]),[{op:'decoration-place',instanceId:'g'}]),'roads-cities');
const road = { geometry:[{x:8,y:3}] }, city = { x:8,y:3 };
assert.equal(baseMapSaveLane(scene([], [road]),scene([water], [road]),placed),'roads-cities');
assert.equal(baseMapSaveLane(scene([], [], [city]),scene([water], [], [city]),placed),'roads-cities');
assert.equal(baseMapSaveLane(scene([]),scene([water]),[...placed,{op:'road-add'}]),'roads-cities');
assert.equal(baseMapSaveLane(scene([]),scene([]),[{op:'water-visibility'}]),'direct');
assert.equal(baseMapSaveLane(scene([]),scene([]),[{op:'map-extent'}]),'full');
console.log('PASS base-map lane selection: ordinary water, buried/offset gate, road stamps, city/road cells, removal, mixed and structural batches');
