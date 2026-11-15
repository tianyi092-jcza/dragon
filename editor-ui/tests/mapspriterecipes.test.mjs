import test from 'node:test';
import assert from 'node:assert/strict';
import { planSpriteMaterialization } from '../src/mapspriterecipes.js';

const recipe = () => ({ itemId: 'isolated-slope-4', name: '隔離小配方', support: 'existing-decoration',
  geographyEffect: 'preserve-underlay', ruleRecipeRef: 'ki-byte-stamp-1', anchor: [0, 0],
  footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], tiles: [[0, 0, 166], [1, 0, 160], [0, 1, 161], [1, 1, 174]] });
const definitions = () => Object.fromEntries([166, 160, 161, 174].map(tile => [`tile-${tile}`, {
  id: `tile-${tile}`, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]],
  visualRef: `MMAP.MDL:tile-${tile}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } },
  evidenceRef: { resource: 'MMAP.MDL', offset: tile * 128, byteLength: 128 }, semanticGrouping: 'UNKNOWN',
}]));

test('private planning is pure; identities and seven existing commands are created only on placement', () => {
  const source = definitions(), item = recipe(), before = JSON.stringify(source), original = JSON.stringify(item);
  const plan = planSpriteMaterialization(source, item);
  assert.equal(plan.canPlace, true); assert.equal(plan.definitionCost, 1); assert.equal(plan.commandCount, 7);
  assert.equal(plan.materialId, null);
  assert.equal(JSON.stringify(source), before); assert.equal(JSON.stringify(item), original);
  item.tiles[0][2] = 0; plan.definition.variants.original.tiles[0][2] = 0;
  let allocated = 0;
  const edits = plan.place(7, 12, kind => `${kind}-${++allocated}`);
  assert.equal(allocated, 6);
  assert.deepEqual(edits.map(edit => edit.op), ['decoration-place', 'decoration-place', 'decoration-place', 'decoration-place', 'material-capture', 'decoration-remove', 'decoration-place']);
  assert.deepEqual(edits.slice(0, 4).map(edit => [edit.materialId, edit.x, edit.y, edit.waterClass]),
    [['tile-166', 7, 12, null], ['tile-160', 8, 12, null], ['tile-161', 7, 13, null], ['tile-174', 8, 13, null]]);
  assert.deepEqual(edits[4].memberIds, edits.slice(0, 4).map(edit => edit.instanceId));
  assert.deepEqual(edits[5].memberIds, edits[4].memberIds);
  assert.equal(edits[4].materialId, edits[6].materialId); assert.equal(edits[4].name, '隔離小配方');
  assert.equal(JSON.stringify(source), before);
});

test('complete author recipe reuse ignores cell order and birth metadata, not constraints or identity', () => {
  const source = definitions(), item = recipe();
  const captured = planSpriteMaterialization(source, item).definition;
  captured.id = 'other-origin#material-existing'; captured.name = '作者改名';
  captured.captureProvenance = { memberIds: ['historical-member'], sourceRevision: 'unsaved' };
  captured.footprint.reverse(); captured.variants.original.tiles.reverse();
  source[captured.id] = captured;
  const before = JSON.stringify(source), plan = planSpriteMaterialization(source, item);
  assert.equal(plan.materialId, captured.id); assert.equal(plan.definitionCost, 0); assert.equal(plan.commandCount, 1);
  let allocated = 0;
  assert.deepEqual(plan.place(10, 20, kind => `${kind}-${++allocated}`), [{ op: 'decoration-place', instanceId: 'decoration-1',
    materialId: captured.id, variantRef: 'original', x: 10, y: 20, waterClass: null }]);
  assert.equal(allocated, 1); assert.equal(JSON.stringify(source), before);
  const patches = [
    { id: 'wrong-key' }, { revision: 'other' }, { category: 'mountain-pattern' }, { visualRef: 'other' }, { ruleRecipeRef: 'other' },
    { anchor: [1, 0] }, { footprint: [[0, 0], [1, 0], [0, 1]] }, { authorWaterClass: 'river' },
    { geographyMask: [[0, 0]] }, { constraints: { locked: true } },
    { variants: { original: { tiles: item.tiles }, alternate: { tiles: item.tiles } } },
    { variants: { original: { tiles: item.tiles, constraints: { locked: true } } } },
    { variants: { original: { tiles: item.tiles.map(([x, y, tile]) => [x, y, tile === 174 ? 166 : tile]) } } },
  ];
  for (const patch of patches) {
    const changed = structuredClone(source); Object.assign(changed[captured.id], patch);
    assert.equal(planSpriteMaterialization(changed, item).materialId, null, JSON.stringify(patch));
  }
});

test('missing or altered original atoms cannot create a private preview or a materialization plan', () => {
  const item = recipe(), patches = [
    { id: 'tile-0' }, { revision: 'author-byte-stamp-1' }, { category: 'author-multicell' },
    { anchor: [1, 0] }, { footprint: [[0, 0], [1, 0]] }, { visualRef: 'other' }, { ruleRecipeRef: 'other' },
    { authorWaterClass: 'sea' }, { geographyMask: [[0, 0]] }, { constraints: {} },
    { variants: { original: { tiles: [[0, 0, 160]] } } },
    { variants: { original: { tiles: [[0, 0, 166]], hiddenRule: true } } },
    { variants: { original: { tiles: [[0, 0, 166]] }, extra: { tiles: [[0, 0, 166]] } } },
  ];
  for (const patch of patches) {
    const source = definitions(); Object.assign(source['tile-166'], patch);
    assert.equal(planSpriteMaterialization(source, item), null, JSON.stringify(patch));
  }
  const source = definitions(); delete source['tile-166'];
  assert.equal(planSpriteMaterialization(source, item), null);
  assert.equal(planSpriteMaterialization(undefined, item), null);
});

test('read-only or unresolved recipes cannot allocate IDs or acquire placement through a matching material', () => {
  const source = definitions();
  const existing = planSpriteMaterialization(source, recipe()).definition;
  existing.id = 'captured'; source[existing.id] = existing;
  for (const patch of [{ support: 'reference-only' }, { geographyEffect: 'unresolved' }]) {
    const plan = planSpriteMaterialization(source, { ...recipe(), ...patch });
    assert.equal(plan.canPlace, false); assert.equal(plan.materialId, existing.id);
    assert.throws(() => plan.place(0, 0, () => assert.fail('reference allocated an identity')), /不開放放置/);
  }
});

test('canonical capture geometry preserves holes and refuses unsupported normalization or more than 256 cells', () => {
  const source = definitions(), hole = { ...recipe(), footprint: [[0, 0], [2, 1]], tiles: [[0, 0, 166], [2, 1, 174]] };
  const plan = planSpriteMaterialization(source, hole); let sequence = 0;
  assert.equal(plan.commandCount, 5);
  assert.deepEqual(plan.place(10, 20, kind => `${kind}-${++sequence}`).slice(0, 2).map(edit => [edit.x, edit.y]), [[10, 20], [12, 21]]);
  assert.deepEqual(plan.definition.footprint, hole.footprint);
  const emptyAnchor = { ...recipe(), footprint: [[1, 0], [0, 1]], tiles: [[1, 0, 166], [0, 1, 174]] };
  assert.deepEqual(planSpriteMaterialization(source, emptyAnchor).place(10, 20, kind => `${kind}-${++sequence}`)
    .slice(0, 2).map(edit => [edit.x, edit.y]), [[11, 20], [10, 21]], 'a missing anchor cell is never filled');
  for (const patch of [
    { anchor: [1, 0] }, { ruleRecipeRef: 'other' }, { tiles: [], footprint: [] },
    { footprint: [...hole.footprint, [1, 0]] }, { tiles: [...hole.tiles, hole.tiles[0]] },
    { tiles: [[0, 0, 256], [2, 1, 174]] }, { tiles: [[0, 0, 166], [2.5, 1, 174]] },
    { tiles: [[1, 0, 166], [2, 1, 174]], footprint: [[1, 0], [2, 1]] },
    { tiles: Array.from({ length: 257 }, (_, x) => [x, 0, 166]), footprint: Array.from({ length: 257 }, (_, x) => [x, 0]) },
  ]) assert.equal(planSpriteMaterialization(source, { ...hole, ...patch }), null, JSON.stringify(patch));
});
