import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapCanvas } from '../src/mapcanvas.js';
import { previewMapEdits } from '../../web/src/editor/mapcommands.js';

const fixture = () => ({ cities: {}, componentDefinitions: { piece: { id: 'piece', revision: 'test-1', category: 'test-fixture', name: '測試片段', anchor: [0, 0], footprint: [[0, 0], [1, 0], [0, 1]], visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, 16], [1, 0, 17], [0, 1, 18]] } } } }, map: {
  bounds: { minX: 0, minY: 0, width: 2, height: 2, tileSize: 16 }, base: { terrainRef: [16, 16, 16, 16], geography: [0, 0, 0, 0], unknownUnderlays: {} },
  decorations: [{ id: 'piece-1', definitionRef: 'piece', variantRef: 'original', x: 0, y: 0 }], roads: [], placements: [], waterGroups: [],
} });
function canvas() {
  const draws = [], context = { clearRect() {}, fillRect(...args) { draws.push(['fill', ...args]); }, drawImage(...args) { draws.push(['image', ...args]); }, strokeRect() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
  return { width: 32, height: 32, clientWidth: 32, clientHeight: 32, getContext: () => context, draws };
}
test('Web group selection uses member footprints and never authorizes group topology edits', () => {
  const source = fixture(), main = canvas(); let model;
  source.selectionGroups = [{ id: 'group-1', label: 'mountain-pattern', members: [{ layer: 'decorations', id: 'piece-1' }] }];
  const before = JSON.stringify(source), view = createMapCanvas({ publish: value => { model = value; }, stage: () => assert.fail('selection must not write') });
  view.attach(main, null); view.setSource(source); view.selectGroup('group-1');
  assert.equal(model.groups[0].name, '山紋片段'); assert.equal(model.selected.cells, 3);
  assert.equal(model.selected.members, 1); assert.equal(model.selected.layer, 'group');
  assert.throws(() => view.command('decoration-translate', { dx: 1, dy: 0 }), /裝飾片段/);
  view.layer('decor', 'locked', true); view.selectGroup('group-1');
  assert.equal(model.layers.find(row => row.id === 'decor').locked, true);
  assert.equal(JSON.stringify(source), before);
  view.setSource(previewMapEdits(source, [{ op: 'decoration-remove', memberIds: ['piece-1'] }]));
  assert.equal(model.selected, null); assert.deepEqual(model.groups, []);
});

test('capture selected decoration as a reusable material, rename and remove without changing map cells', () => {
  const source = fixture(), commands = [], main = canvas(); let model;
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.attach(main, null); view.setSource(source); view.pick(8, 8);
  view.command('material-capture', { name: '新素材' });
  const capture = commands.pop(); assert.match(capture.materialId, /^system-base-map#material-[a-f0-9]{64}$/);
  assert.deepEqual(capture.memberIds, ['piece-1']);
  let candidate = previewMapEdits(source, [capture]); view.setSource(candidate);
  const row = model.materials.find(row => row.id === capture.materialId);
  assert.equal(row.editable, true); assert.equal(row.inUse, false); assert.equal(row.cells, 3);
  view.command('material-rename', { materialId: row.id, name: '改名素材' });
  candidate = previewMapEdits(candidate, commands.splice(0)); view.setSource(candidate);
  assert.equal(model.materials.find(item => item.id === row.id).name, '改名素材');
  view.command('material-remove', { materialId: row.id });
  candidate = previewMapEdits(candidate, commands); view.setSource(candidate);
  assert.equal(model.materials.some(item => item.id === row.id), false);
  assert.deepEqual(candidate.map, source.map);
});

test('unknown underlay diagnostics locate the exact base cell without guessing a replacement', () => {
  let model; const commands = [], source = fixture();
  source.map.base.terrainRef = [null, null, null, 16];
  const view = createMapCanvas({ publish: value => { model = value; }, stage: edit => commands.push(edit) });
  view.setSource(source); assert.equal(model.diagnostics.length, 0);
  const removed = previewMapEdits(source, [{ op: 'decoration-remove', memberIds: ['piece-1'] }]);
  view.setSource(removed); assert.equal(model.diagnostics.length, 3);
  view.focusDiagnostic(2); assert.equal(model.selected.x, 0); assert.equal(model.selected.y, 1);
  view.command('base-fill', { tile: 20, geography: 0 });
  assert.deepEqual(commands[0].cells, [2]);
  view.setSource(previewMapEdits(removed, commands)); assert.equal(model.diagnostics.length, 2);
  assert.equal(removed.map.base.terrainRef[2], null);
  view.setSource(null); assert.deepEqual(model.diagnostics, []);
});

test('native canvas uses tile atlas, footprint hit testing, display-only layer locks and explicit commands', () => {
  let model;
  const source = fixture();
  [16, 17, 18].forEach(tile => {
    const id = 'tile-' + tile;
    source.componentDefinitions[id] = { id, revision: 'test-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]], visualRef: 'MMAP.MDL:tile-' + tile, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } } };
  });
  const original = JSON.stringify(source), commands = [], main = canvas(), mini = canvas();
  const view = createMapCanvas({ publish: value => { model = value; }, stage: command => commands.push(command) });
  view.attach(main, mini); view.setSource(source); view.setAtlas({});
  assert.equal(main.draws.filter(row => row[0] === 'image').length, 4);
  view.pick(24, 24); assert.equal(model.selected.layer, 'base', 'footprint hole is not selectable decoration');
  view.command('base-fill', { tile: 20, geography: 0 }); assert.deepEqual(commands.at(-1).cells, [3]);
  view.pick(8, 24); assert.equal(model.selected.id, 'piece-1');
  assert.throws(() => view.command('base-fill', { tile: 20, geography: 0 }), /基底格/);
  view.command('decoration-split');
  const split = commands.at(-1); assert.equal(split.childIds.length, 3);
  assert.ok(split.childIds.every(id => /^system-base-map#decoration-[a-f0-9]{64}$/.test(id)));
  assert.equal(new Set(split.childIds).size, 3);
  view.setSource(previewMapEdits(source, [split])); assert.equal(model.selected, null);
  view.layer('decor', 'locked', true); view.pick(8, 8); assert.equal(model.selected.layer, 'base');
  assert.throws(() => view.command('decoration-remove'), /裝飾/);
  view.layer('decor', 'visible', false); view.layer('base', 'visible', false);
  assert.ok(main.draws.some(row => row[0] === 'fill'), 'hidden underlying unknown is drawn explicitly');
  view.pan(10, 10); view.zoom(2); view.fit(); view.locate(0.5, 0.5);
  assert.equal(JSON.stringify(source), original, 'drawing and navigation never modify the source');
  assert.equal(mini.width, 250); assert.equal(mini.height, 167);
  view.setSource(null); assert.equal(model.loaded, false); assert.equal(model.selected, null);
});
