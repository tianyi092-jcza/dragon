// Approved Web product contract, not a claim about DOS terrain categories.
// Pure memory; no user data, SAVE.DAT, network or persistent storage.
import assert from 'node:assert/strict';
import { catalogLayer } from '../editor-ui/src/mapcataloglayers.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../web/src/editor/mapdisplay.js';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { captureComponent, placeComponent, splitDecoration, removeDecorations, translateDecorations, fillBase } from '../web/src/editor/componenttools.js';

const cells = 384 * 256;
const componentDefinitions = Object.fromEntries(Array.from({ length: 256 }, (_, tile) => [`tile-${tile}`, {
  id: `tile-${tile}`, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]],
  visualRef: `MMAP.MDL:tile-${tile}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } },
}]));
const legacy = { gameId: 'test', componentDefinitions, map: { bounds: { width: 384, height: 256 },
  base: { terrainRef: Array(cells).fill(95), geography: Array(cells).fill(1), unknownUnderlays: {} },
  decorations: [], roads: [], placements: [], waterGroups: [] }, selectionGroups: [] };
legacy.map.base.terrainRef[0] = 16; // Preserve existing authored non-sea base as decoration.
const before = JSON.stringify(legacy);
const edits = [{ op: 'sea-ground-enable' }];
const source = previewMapEdits(legacy, edits);
assert.equal(source.map.base.policy, 'sea-ground-1');
assert.ok(source.map.base.terrainRef.every(tile => tile === 95));
assert.deepEqual(composeMapLayers(source).terrain, composeMapLayers(legacy).terrain);
assert.deepEqual(source, applyMapWorkspaceEdits(legacy, edits), 'preview/server must share the same transition');
assert.equal(JSON.stringify(legacy), before);
assert.deepEqual(previewMapEdits(source, edits), source, 'transition is idempotent');
assert.throws(() => applyMapWorkspaceEdits(legacy, [{ op: 'sea-ground-enable', tile: 16 }]), /COPY_MAP/);
assert.throws(() => fillBase(source, [0], 16, 0), /海域基底/);
const bare = composeMapDisplayLayers(source, { base: true, decor: false, roads: false, cities: false });
assert.ok(bare.tiles.every(tile => tile === 95));
assert.ok(composeMapDisplayLayers(source, { base: false, decor: false, roads: false, cities: false }).tiles.every(tile => tile === null));

let edited = placeComponent(source, 'tile-16', 10, 10, 'ground', null);
edited = placeComponent(edited, 'tile-112', 10, 10, 'mountain', null);
edited = placeComponent(edited, 'tile-180', 11, 10, 'field', null);
edited = placeComponent(edited, 'tile-96', 12, 10, 'river', 'river');
edited = placeComponent(edited, 'tile-248', 13, 10, 'wall', null);
edited = placeComponent(edited, 'tile-61', 14, 10, 'water-shore', 'lake');
let composed = composeMapLayers(edited);
assert.equal(composed.minimapGeography[10 * 384 + 10], 0, 'mountain cannot erase underlying ground outline');
for (const x of [11, 12, 13, 14]) assert.equal(composed.minimapGeography[10 * 384 + x], 1, 'non-ground decoration cannot make land');
assert.equal(composed.terrain[10 * 384 + 12], 96, 'water byte still reaches native rule terrain');
assert.equal(composeMapLayers(removeDecorations(edited, ['mountain'])).minimapGeography[10 * 384 + 10], 0);
assert.equal(composeMapLayers(removeDecorations(edited, ['ground'])).minimapGeography[10 * 384 + 10], 1);
assert.equal(composeMapLayers(translateDecorations(edited, ['ground'], 1, 0)).minimapGeography[10 * 384 + 11], 0);
const renamed = structuredClone(edited);
renamed.componentDefinitions['tile-16'].category = 'renamed-secondary-category';
assert.deepEqual(composeMapLayers(renamed).minimapGeography, composed.minimapGeography, 'category labels do not own surface semantics');

const captured = captureComponent(edited, ['ground', 'mountain', 'field'], 'composite', '混合素材');
const placed = placeComponent(captured, 'composite', 20, 20, 'composite-instance', null);
assert.equal(composeMapLayers(placed).minimapGeography[20 * 384 + 20], 0, 'capture retains hidden ground contribution');
assert.equal(composeMapLayers(placed).minimapGeography[20 * 384 + 21], 1);
const split = splitDecoration(placed, 'composite-instance', ['child-a', 'child-b']);
assert.deepEqual(composeMapLayers(split), composeMapLayers(placed), 'split preserves both native bytes and outline masks');
assert.deepEqual(composeMapLayers(JSON.parse(JSON.stringify(split))), composeMapLayers(split), 'real JSON roundtrip');
const mixed = placeComponent(placeComponent(source, 'tile-0', 30, 30, 'mixed-ground', null), 'tile-95', 31, 30, 'mixed-water', 'sea');
const mixedCapture = captureComponent(mixed, ['mixed-ground', 'mixed-water'], 'mixed-material', '地面與水系');
const mixedPlaced = placeComponent(mixedCapture, 'mixed-material', 40, 40, 'mixed-instance', 'sea');
assert.deepEqual([...composeMapLayers(mixedPlaced).minimapGeography.slice(40 * 384 + 40, 40 * 384 + 42)], [0, 1], 'water metadata must not suppress ground retained by a mixed capture');
assert.deepEqual(composeMapLayers(splitDecoration(mixedPlaced, 'mixed-instance', ['mixed-a', 'mixed-b'])), composeMapLayers(mixedPlaced));
assert.equal(catalogLayer('sea-base-95-v1'), 'base');
assert.equal(catalogLayer('bridge-vertical-184-v1'), 'roads');
assert.equal(catalogLayer('roof-red-203-v1'), 'cities');
assert.equal(catalogLayer('ground-texture-0-v1'), 'decor');
assert.equal(catalogLayer('water-pool-outline-13-v1'), 'decor');
const invalidMask = structuredClone(placed);
invalidMask.componentDefinitions.composite.minimapLandMask = [[999, 0]];
assert.throws(() => composeMapLayers(invalidMask), /LAND_MASK/);
const invalid = structuredClone(source); invalid.map.base.policy = 'unknown-policy';
assert.throws(() => composeMapLayers(invalid), /BASE_POLICY/);
const invalidBase = structuredClone(source); invalidBase.map.base.terrainRef[0] = 16;
assert.throws(() => composeMapLayers(invalidBase), /SEA_GROUND_BASE/);
console.log('PASS sea-ground: sea base, layer hiding, ground-only outline, edit/capture/split, server parity, JSON, legacy isolation');
