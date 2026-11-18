// Generic decoration grouping ops: in-memory roundtrip without a backend.
// Covers writer + preview + server allowlist/validation in one fast lane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDecorations, ungroupDecorations } from '../web/src/editor/componenttools.js';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { applyCopyMapEdits, COPY_MAP_OPS } from '../server/copyprofile.js';

const HEX64 = 'a'.repeat(64);
const def = id => ({ id, revision: 'test-1', category: 'test', anchor: [0, 0], footprint: [[0, 0]], visualRef: 'MMAP.MDL:indexed-footprint', ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, 16]] } } });
const deco = (id, x) => ({ id, definitionRef: 'piece', variantRef: 'original', x, y: 0 });
const game = () => ({
  gameId: 'test-game', cities: {}, componentDefinitions: { piece: def('piece') }, selectionGroups: [],
  map: {
    bounds: { minX: 0, minY: 0, width: 4, height: 4, tileSize: 16 },
    base: { terrainRef: Array(16).fill(16), geography: Array(16).fill(0), unknownUnderlays: {} },
    decorations: [deco('a', 0), deco('b', 1), deco('c', 2)],
    roads: [], placements: [], waterGroups: [],
  },
});
const gid = 'test-game#group-' + HEX64;
const gid2 = 'test-game#group-' + 'b'.repeat(64);

test('group ops are allowlisted and roundtrip in memory', () => {
  assert.ok(COPY_MAP_OPS.includes('decoration-group') && COPY_MAP_OPS.includes('decoration-ungroup'));
  const g1 = groupDecorations(game(), ['a', 'b'], gid);
  assert.deepEqual(g1.selectionGroups, [{ id: gid, members: [{ layer: 'decorations', id: 'a' }, { layer: 'decorations', id: 'b' }] }]);
  assert.deepEqual(previewMapEdits(game(), [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: gid }]).selectionGroups, g1.selectionGroups);
  assert.deepEqual(ungroupDecorations(g1, gid).selectionGroups, []);
  assert.deepEqual(previewMapEdits(g1, [{ op: 'decoration-ungroup', groupId: gid }]).selectionGroups, []);
  const re = groupDecorations(ungroupDecorations(g1, gid), ['b', 'c'], gid2);
  assert.deepEqual(re.selectionGroups, [{ id: gid2, members: [{ layer: 'decorations', id: 'b' }, { layer: 'decorations', id: 'c' }] }]);
  assert.deepEqual(previewMapEdits(g1, [{ op: 'decoration-ungroup', groupId: gid }, { op: 'decoration-group', memberIds: ['b', 'c'], groupId: gid2 }]).selectionGroups, re.selectionGroups);
});

test('copy saves group removal plus fragment splitting as independent single cells', () => {
  const source = game();
  source.componentDefinitions.fragment = { ...def('fragment'), footprint: [[0, 0], [1, 0]], variants: { original: { tiles: [[0, 0, 16], [1, 0, 16]] } } };
  source.map.decorations = [{ ...deco('a', 0), definitionRef: 'fragment' }, deco('c', 2)];
  source.selectionGroups = [{ id: 'web-piece-group-7', members: [{ layer: 'decorations', id: 'a' }, { layer: 'decorations', id: 'c' }] }];
  const childIds = ['c', 'd'].map(char => 'test-game#decoration-' + char.repeat(64));
  const edits = [{ op: 'decoration-ungroup', groupId: 'web-piece-group-7' }, { op: 'decoration-split', instanceId: 'a', childIds }];
  const saved = JSON.parse(JSON.stringify(applyCopyMapEdits(source, edits)));
  assert.deepEqual(saved.selectionGroups, []);
  assert.deepEqual(saved.map.decorations.map(item => [item.id, item.x]), [[childIds[0], 0], [childIds[1], 1], ['c', 2]]);
  assert.ok(saved.map.decorations.every(item => saved.componentDefinitions[item.definitionRef].footprint.length === 1));
  assert.deepEqual(saved, JSON.parse(JSON.stringify(previewMapEdits(source, edits))));
  const before = JSON.stringify(source);
  assert.throws(() => applyCopyMapEdits(source, [...edits.slice(0, 1), { ...edits[1], childIds: childIds.slice(0, 1) }]));
  assert.equal(JSON.stringify(source), before, 'failed split cannot leave a committed ungroup prefix');
});

test('group ops validate shape, identity and membership server-side', () => {
  const applied = applyCopyMapEdits(game(), [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: gid }]);
  assert.deepEqual(applied.selectionGroups.map(g => g.id), [gid]);
  const batch = applyCopyMapEdits(applied, [{ op: 'decoration-ungroup', groupId: gid }, { op: 'decoration-group', memberIds: ['b', 'c'], groupId: gid2 }]);
  assert.deepEqual(batch.selectionGroups.map(g => g.id), [gid2]);
  const legacy = JSON.parse(JSON.stringify(game()));
  legacy.selectionGroups = [{ id: 'web-piece-group-7', members: [{ layer: 'decorations', id: 'a' }, { layer: 'decorations', id: 'b' }] }];
  const freed = applyCopyMapEdits(legacy, [{ op: 'decoration-ungroup', groupId: 'web-piece-group-7' }]);
  assert.deepEqual(freed.selectionGroups, []);
  const relinked = applyCopyMapEdits(freed, [{ op: 'decoration-group', memberIds: ['a', 'c'], groupId: gid2 }]);
  assert.deepEqual(relinked.selectionGroups.map(g => g.id), [gid2]);
  // Shape/prefix/allowlist rejections carry COPY_MAP_DELTA; writer semantic
  // rejections throw bare RangeError (existing convention: the HTTP layer
  // maps both to 422, same as decoration-translate/remove).
  for (const [label, edits, shape] of [
    ['short-id', [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: 'g#1' }], true],
    ['single', [{ op: 'decoration-group', memberIds: ['a'], groupId: gid }], false],
    ['ghost', [{ op: 'decoration-group', memberIds: ['a', 'zz'], groupId: gid }], false],
    ['city-group-ungroup', [{ op: 'decoration-ungroup', groupId: 'city-group-x' }], true],
    ['missing', [{ op: 'decoration-ungroup', groupId: gid }], false],
    ['extra-key', [{ op: 'decoration-group', memberIds: ['a', 'b'], groupId: gid, foo: 1 }], true],
    ['dual-member', [{ op: 'decoration-group', memberIds: ['b', 'c'], groupId: gid2 }], false],
  ]) {
    const run = () => applyCopyMapEdits(label === 'dual-member' ? applied : game(), edits);
    if (shape) assert.throws(run, /COPY_MAP_DELTA/, label);
    else assert.throws(run, label);
  }
});
