// Isolated Web editing regressions: no persistent store, profile or native save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapCanvas } from '../editor-ui/src/mapcanvas.js';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
const identity = (kind, n) => `test-game#${kind}-${n.toString(16).padStart(64, '0')}`;
const atom = tile => ({ id: `tile-${tile}`, revision: 'test', category: 'test', anchor: [0, 0], footprint: [[0, 0]],
  visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } });
const fixture = () => ({ gameId: 'test-game', cities: {}, componentDefinitions: { 'tile-16': atom(16), 'tile-17': atom(17) }, selectionGroups: [],
  map: { bounds: { minX: 0, minY: 0, width: 20, height: 20, tileSize: 16 },
    base: { terrainRef: Array(400).fill(95), geography: Array(400).fill(1), unknownUnderlays: {} },
    decorations: [{ id: 'lower', definitionRef: 'tile-16', x: 1, y: 1 }, { id: 'upper', definitionRef: 'tile-17', x: 1, y: 1 }, { id: 'other', definitionRef: 'tile-16', x: 3, y: 1 }],
    roads: [], placements: [], waterGroups: [] } });

test('drag removes original pixels, follows the grip at half opacity, cancels without writes and picks only the top object', () => {
  const frames = [], commands = []; let model;
  const context = { globalAlpha: 1, setTransform() {}, clearRect() { frames.length = 0; }, fillRect() {}, strokeRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage(image, sx, sy, sw, sh, x, y) { frames.push({ tile: sy / 16 * 16 + sx / 16, x, y, alpha: this.globalAlpha }); } };
  const canvas = { width: 320, height: 320, clientWidth: 320, clientHeight: 320, style: {}, getContext: () => context };
  const source = fixture();
  source.componentDefinitions.fragment = { ...atom(17), id: 'fragment', footprint: [[0, 0], [1, 0]], variants: { original: { tiles: [[0, 0, 17], [1, 0, 17]] } } };
  source.map.decorations[1].definitionRef = 'fragment';
  const before = JSON.stringify(source);
  const view = createMapCanvas({ gameId: 'test-game', publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.attach(canvas, null); view.setSource(source); view.setAtlas({});
  view.pick(24, 24); assert.equal(model.selected.id, 'upper');
  assert.equal(view.beginObjectMove(40, 24), true); view.previewObjectMove(56, 40);
  assert.deepEqual([model.objectMove.dx, model.objectMove.dy], [1, 1], 'non-anchor grab preserves its offset');
  assert.ok(frames.some(row => row.x === 16 && row.y === 16 && row.tile === 16 && row.alpha === 1), 'lower object revealed at the origin');
  assert.ok(!frames.some(row => row.x === 16 && row.y === 16 && row.tile === 17), 'upper stamp no longer drawn at the origin');
  assert.ok(frames.some(row => row.x === 32 && row.y === 32 && row.tile === 17 && row.alpha === 0.5));
  assert.equal(context.globalAlpha, 1);
  assert.equal(JSON.stringify(source), before); assert.equal(commands.length, 0);
  view.cancelObjectMove(); assert.ok(frames.some(row => row.x === 16 && row.y === 16 && row.tile === 17 && row.alpha === 1));
  view.toggleMulti(56, 24); assert.deepEqual(model.multi.map(row => row.id), ['upper', 'other']);
  assert.equal(view.beginMultiMove(56, 24), true); view.previewObjectMove(72, 40);
  assert.deepEqual([model.objectMove.dx, model.objectMove.dy], [1, 1], 'grabbed member never jumps to group anchor');
  assert.ok(frames.some(row => row.x === 64 && row.y === 32 && row.alpha === 0.5));
  view.commitObjectMove(); assert.equal(commands.length, 1);
  assert.deepEqual(commands[0][0], { op: 'decoration-translate', memberIds: ['upper', 'other'], dx: 1, dy: 1 });
  view.command('decoration-remove'); assert.deepEqual(commands[1], { op: 'decoration-remove', memberIds: ['upper', 'other'] });
  const removed = applyCopyMapEdits(source, [commands[1]]);
  assert.deepEqual(removed.map.decorations.map(row => row.id), ['lower'], 'batch delete does not delete the covered lower object');
});

test('cell clipboard keeps sparse offsets from first click and stages only complete pastes', () => {
  const batches = [], view = createMapCanvas({ publish() {}, stage: batch => batches.push(batch) });
  const source = fixture();
  source.componentDefinitions['tile-95'] = atom(95);
  view.resize(320,320); view.setSource(source);
  view.pick(56,24); // anchor (3,1), not the top-left of the selection
  view.toggleMulti(24,24); view.toggleMulti(24,24); // toggle off
  view.toggleMulti(24,24); // re-add; the gap stays empty
  view.command('cell-copy');
  view.pick(8,8); assert.throws(() => view.command('cell-paste'), /超出地圖/);
  assert.equal(batches.length,0);
  view.pick(104,88); view.command('cell-paste');
  assert.deepEqual(batches.map(batch => batch.map(({x,y,materialId}) => [x,y,materialId])), [[[6,5,'tile-16'],[4,5,'tile-17']]]);
});

test('new combine is one object with its own ID; JSON server replay, large split and deletion agree with preview', () => {
  const source = fixture();
  source.map.base.policy = 'sea-ground-1';
  source.map.decorations = Array.from({ length: 300 }, (_, n) => ({ id: `d${n}`, definitionRef: 'tile-16', x: n % 20, y: Math.floor(n / 20) }));
  source.selectionGroups = [{ id: 'web-piece-group-1', members: source.map.decorations.slice(0, 2).map(item => ({ layer: 'decorations', id: item.id })) }];
  const before = JSON.stringify(source);
  const command = { op: 'decoration-combine', memberIds: source.map.decorations.map(item => item.id), materialId: identity('material', 1), instanceId: identity('decoration', 1) };
  const combined = JSON.parse(JSON.stringify(applyCopyMapEdits(source, [command])));
  assert.deepEqual(combined, JSON.parse(JSON.stringify(previewMapEdits(source, [command]))));
  assert.equal(combined.map.decorations.length, 1); assert.deepEqual(combined.selectionGroups, []);
  assert.equal(combined.map.decorations[0].id, command.instanceId);
  assert.equal(combined.componentDefinitions[command.materialId].footprint.length, 300);
  assert.equal(combined.componentDefinitions[command.materialId].captureProvenance, undefined);
  const originalLayers = composeMapLayers(source, { draft: true }), combinedLayers = composeMapLayers(combined, { draft: true });
  for (const key of ['terrain', 'geography', 'minimapGeography']) assert.deepEqual(combinedLayers[key], originalLayers[key], key);
  const split = { op: 'decoration-split', instanceId: command.instanceId, childIds: Array.from({ length: 300 }, (_, n) => identity('decoration', n + 2)) };
  const singles = applyCopyMapEdits(combined, [split]);
  assert.equal(singles.map.decorations.length, 300);
  assert.ok(singles.map.decorations.every(item => singles.componentDefinitions[item.definitionRef].footprint.length === 1));
  assert.deepEqual(singles, previewMapEdits(combined, [split]));
  const erased = applyCopyMapEdits(singles, [{ op: 'decoration-remove', memberIds: split.childIds }]);
  assert.equal(erased.map.decorations.length, 0);
  assert.equal(JSON.stringify(source), before);
  for (const bad of [{ ...command, extra: true }, { ...command, instanceId: 'foreign' }, { ...command, memberIds: ['d0', 'missing'] }]) assert.throws(() => applyCopyMapEdits(source, [bad]));
  assert.throws(() => applyCopyMapEdits(combined, [command]), 'used IDs cannot be reused');
  const protectedSource = structuredClone(source);
  protectedSource.selectionGroups[0].id = 'city-group-protected';
  assert.throws(() => applyCopyMapEdits(protectedSource, [command]), /專用據點/);
});
