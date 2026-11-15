// Web authoring contract: design §8.3, not native sea/land tile classification.
// Entirely synthetic memory input; no files, registered recipes, SAVE or database.
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeMapLayers, BYTE_STAMP_RECIPE } from '../web/src/content/authoring/maplayers.js';
import { fillBase, removeDecorations } from '../web/src/editor/componenttools.js';

function fixture() {
  return {
    componentDefinitions: {
      cover: { id: 'cover', revision: 'test-1', category: 'test-only', anchor: [0, 0],
        footprint: [[0, 0], [2, 0]], ruleRecipeRef: BYTE_STAMP_RECIPE,
        visualRef: 'MMAP.MDL:indexed-footprint', variants: { original: { tiles: [[0, 0, 16], [2, 0, 20]] } } },
    },
    map: {
      bounds: { width: 384, height: 256 },
      base: { terrainRef: Array(384 * 256).fill(0), geography: Array(384 * 256).fill(0), unknownUnderlays: {} },
      decorations: [{ id: 'cover-instance', definitionRef: 'cover', x: 10, y: 10 }],
      roads: [], placements: [], waterGroups: [],
    },
  };
}
const cells = [3850, 3851, 3852];

for (const geography of [1, 2, 3]) {
  test(`opaque non-water overlay preserves explicit geography ${geography}; only base edits clear it`, () => {
    const original = fixture(), originalJSON = JSON.stringify(original);
    // Arbitrary byte 95 is an explicit fixture input, NOT a certified sea recipe.
    const wet = fillBase(original, cells, 95, geography), wetJSON = JSON.stringify(wet);
    const composed = composeMapLayers(wet);
    assert.deepEqual(cells.map(cell => composed.terrain[cell]), [16, 95, 20]);
    assert.deepEqual(cells.map(cell => composed.geography[cell]), [geography, geography, geography]);
    assert.deepEqual(cells.map(cell => composed.minimapGeography[cell]), [geography, geography, geography]);
    const dry = fillBase(wet, [cells[0]], 16, 0), dryResult = composeMapLayers(dry);
    assert.deepEqual(cells.map(cell => dryResult.geography[cell]), [0, geography, geography]);
    assert.deepEqual(cells.map(cell => dryResult.minimapGeography[cell]), [0, geography, geography]);
    assert.deepEqual(dryResult.terrain, composed.terrain, 'geography edit can leave visible bytes identical');
    const removed = removeDecorations(dry, ['cover-instance']);
    assert.deepEqual(removed.map.base, dry.map.base, 'delete is not undo: retain the explicit edited base');
    assert.deepEqual(cells.map(cell => composeMapLayers(removed).terrain[cell]), [16, 95, 95]);
    assert.deepEqual(composeMapLayers(JSON.parse(JSON.stringify(dry))), dryResult, 'real JSON roundtrip');
    assert.equal(JSON.stringify(wet), wetJSON, 'prior edit state remains available for undo');
    assert.equal(JSON.stringify(original), originalJSON, 'source snapshot is isolated');
  });
}

test('unknown underlays remain unknown after deletion; fill clears only selected provenance', () => {
  const source = fixture();
  for (const cell of [cells[0], cells[2]]) {
    source.map.base.terrainRef[cell] = null;
    source.map.base.unknownUnderlays[cell] = { sourceRef: 'test-only', coveringInstanceId: 'cover-instance' };
  }
  const before = JSON.stringify(source);
  assert.equal(composeMapLayers(source).diagnostics.length, 0, 'explicit overlay covers unknown');
  const deleted = removeDecorations(source, ['cover-instance']);
  assert.deepEqual(deleted.map.base, source.map.base);
  assert.throws(() => composeMapLayers(deleted), /UNKNOWN_UNDERLAY/);
  assert.deepEqual(composeMapLayers(deleted, { draft: true }).diagnostics.map(row => row.cell), [cells[0], cells[2]]);
  const partial = fillBase(deleted, [cells[0]], 95, 1);
  assert.equal(Object.hasOwn(partial.map.base.unknownUnderlays, cells[0]), false);
  assert.deepEqual(partial.map.base.unknownUnderlays[cells[2]], source.map.base.unknownUnderlays[cells[2]]);
  assert.equal(partial.map.base.terrainRef[cells[2]], null);
  assert.equal(partial.map.base.geography[cells[2]], 0, 'unknown neighbour must not silently become sea');
  assert.throws(() => composeMapLayers(partial), /UNKNOWN_UNDERLAY/);
  assert.equal(JSON.stringify(source), before);
});

test('explicit base edits retain overlay water masks and unrelated hidden groups', () => {
  const source = fixture();
  source.componentDefinitions.cover.geographyMask = [[2, 0]];
  source.map.decorations[0].waterClass = 'river';
  source.map.base.geography[cells[0]] = 1;
  source.map.base.geography[cells[1]] = 3;
  source.map.waterGroups = [{ id: 'hidden-base', memberIds: [], baseCells: [cells[0], cells[1]], showOnMinimap: false }];
  const before = JSON.stringify(source);
  const edited = fillBase(source, [cells[0], cells[2]], 16, 0);
  assert.deepEqual(edited.map.waterGroups, [{ ...source.map.waterGroups[0], baseCells: [cells[1]] }]);
  const result = composeMapLayers(edited);
  assert.deepEqual(cells.map(cell => result.geography[cell]), [0, 3, 2], 'base edit does not erase explicit overlay water');
  assert.deepEqual(cells.map(cell => result.minimapGeography[cell]), [0, 0, 2], 'unselected hidden group stays hidden');
  const deleted = removeDecorations(edited, ['cover-instance']);
  assert.deepEqual(cells.map(cell => composeMapLayers(deleted).geography[cell]), [0, 3, 0]);
  assert.deepEqual(deleted.map.base, edited.map.base);
  assert.equal(JSON.stringify(source), before);
});

test('invalid mixed selection and post-edit composition failures leave the whole input unchanged', () => {
  const source = fixture(), before = JSON.stringify(source);
  for (const selection of [[cells[0], 98304], [cells[0], -1], [cells[0], cells[0]], [cells[0], 1.5]]) {
    assert.throws(() => fillBase(source, selection, 95, 1));
    assert.equal(JSON.stringify(source), before);
  }
  // Failure inside transaction after attempted writes: caller still owns its old state.
  const broken = fixture();
  broken.map.decorations[0].definitionRef = 'missing';
  const brokenBefore = JSON.stringify(broken);
  assert.throws(() => fillBase(broken, cells, 95, 1), /UNKNOWN_COMPONENT_DEFINITION/);
  assert.equal(JSON.stringify(broken), brokenBefore);
});
