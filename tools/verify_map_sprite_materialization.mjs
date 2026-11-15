// Isolated expression test: existing placement/capture/remove commands only.
// Registered Web recipe, no new rule, HTTP operation, database, SAVE.DAT or profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { createMapController } from '../editor-ui/src/basemap.js';
import { createMapCanvas } from '../editor-ui/src/mapcanvas.js';
import { planSpriteMaterialization } from '../editor-ui/src/mapspriterecipes.js';
import catalog from '../editor-ui/src/mapspritecatalog.json' with { type: 'json' };

const started = Date.now(), sha = value => createHash('sha256').update(value).digest('hex');
const { template } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const source = { gameId: 'system-base-map', ...template.content }, original = JSON.stringify(source);
const before = composeMapLayers(source), definitionCount = Object.keys(source.componentDefinitions).length;
// Original MAP: twelve 2x2 windows, first [209,7]; this is a Web composition,
// not a recovered DOS object. No crop/relabel of the 28/50-cell legacy pieces.
const tiles = [[0, 0, 166], [1, 0, 160], [0, 1, 161], [1, 1, 174]];
assert.equal(sha(Buffer.from(before.terrain)), '740708c27a89db0a7f82865be623b5732099ec97aabf399e7dbde1450c87c861',
  'registered composition equals the fixed original decompressed MAP bytes');
const witnesses = Array.from(before.terrain.keys()).filter(index => index % 384 < 383 && index < 384 * 255
  && tiles.every(([dx, dy, tile]) => before.terrain[index + dy * 384 + dx] === tile));
assert.equal(witnesses.length, 12); assert.equal(witnesses[0], 7 * 384 + 209);
const recipe = catalog.recipes.find(item => item.itemId === 'mountain-slope-compact-4-v1');
assert.deepEqual(recipe.tiles, tiles);
assert.deepEqual(recipe.source.firstWitness, [209, 7]);
assert.equal(recipe.source.occurrences, witnesses.length);
function commands(x, y, tag) {
  const plan = planSpriteMaterialization(source.componentDefinitions, recipe);
  assert.ok(plan?.canPlace); assert.equal(plan.definitionCost, 1); assert.equal(plan.commandCount, 7);
  let sequence = 0;
  return plan.place(x, y, kind => `system-base-map#${kind}-${sha(`${tag}:${kind}:${++sequence}`)}`);
}
const edits = commands(209, 7, 'native-witness');
const next = applyMapWorkspaceEdits(source, edits), materialId = edits.at(-1).materialId;
assert.deepEqual(next, previewMapEdits(source, edits));
assert.equal(Object.keys(next.componentDefinitions).length, definitionCount + 1);
assert.deepEqual(next.componentDefinitions[materialId].variants.original.tiles, tiles);
assert.deepEqual(next.map.decorations.slice(0, -1), source.map.decorations);
assert.equal(next.map.decorations.at(-1).id, edits.at(-1).instanceId);
assert.deepEqual(next.map.base, source.map.base); assert.deepEqual(next.map.waterGroups, source.map.waterGroups);
assert.deepEqual(composeMapLayers(next), before);
const { gameId, ...content } = JSON.parse(JSON.stringify(next));
validateSystemBaseMap({ ...template, content }, sha);
// Captured provenance deliberately retains the removed members' identities;
// only their map instances disappear. No dangling selection-group member is added.
assert.deepEqual(next.componentDefinitions[materialId].captureProvenance.memberIds, edits[4].memberIds);
assert.ok(edits[4].memberIds.every(id => !next.map.decorations.some(instance => instance.id === id)));
const reuse = planSpriteMaterialization(next.componentDefinitions, recipe);
assert.equal(reuse.materialId, materialId); assert.equal(reuse.definitionCost, 0); assert.equal(reuse.commandCount, 1);
const repeated = applyMapWorkspaceEdits(next, reuse.place(209, 7, kind => `system-base-map#${kind}-${sha('second-placement')}`));
assert.deepEqual(repeated.componentDefinitions, next.componentDefinitions);
assert.equal(repeated.map.decorations.length, source.map.decorations.length + 2);
assert.equal(Object.keys(applyCopyMapEdits(source, edits, definitionCount + 1).componentDefinitions).length, definitionCount + 1);
assert.throws(() => applyCopyMapEdits(source, edits, definitionCount), /素材庫結構／數量不合法/);
assert.throws(() => applyMapWorkspaceEdits(source, [...edits.slice(0, -1), { ...edits.at(-1), x: 383 }]), /超出/);
const seaCell = before.terrain.findIndex((_, index) => index % 384 < 383 && index < 384 * 255
  && [0, 1, 384, 385].every(offset => before.terrain[index + offset] === 95 && before.geography[index + offset] === 1));
assert.ok(seaCell >= 0);
const sea = applyMapWorkspaceEdits(source, commands(seaCell % 384, Math.floor(seaCell / 384), 'sea-control'));
const seaMap = composeMapLayers(sea);
assert.deepEqual(tiles.map(([dx, dy]) => seaMap.terrain[seaCell + dy * 384 + dx]), tiles.map(([, , tile]) => tile));
assert.deepEqual(seaMap.geography, before.geography);
assert.deepEqual(sea.map.base, source.map.base); assert.deepEqual(sea.map.waterGroups, source.map.waterGroups);
assert.equal(JSON.stringify(source), original, 'success, full-cap rejection and late failure never mutate caller state');

// Every placeable compact recipe is independently materialized at its original witness.
// Read-only recipes are preview descriptions only: no identities or commands.
// The common budget/rollback negatives above remain shared; no nine-recipe batch is implied.
for (const item of catalog.recipes.filter(item => item.itemId !== recipe.itemId)) {
  const plan = planSpriteMaterialization(source.componentDefinitions, item);
  if (item.support === 'reference-only') {
    assert.ok(plan); assert.equal(plan.canPlace, false);
    assert.deepEqual(plan.definition.variants.original.tiles, item.tiles);
    assert.throws(() => plan.place(...item.source.firstWitness, () => assert.fail('read-only recipes allocate no identities')), /僅供參考/);
    let facts;
    const readonlyCanvas = createMapCanvas({ publish: value => { facts = value; }, stage: () => assert.fail('read-only recipes cannot stage') });
    readonlyCanvas.setSource(source); readonlyCanvas.resize(6144, 4096); readonlyCanvas.setAtlas({});
    const row = facts.catalogItems.find(row => row.itemId === item.itemId);
    assert.equal(row.available, true); assert.equal(row.canPlace, false); assert.equal(row.cells, item.tiles.length);
    assert.equal(readonlyCanvas.previewPlacement(row.id, item.source.firstWitness[0] * 16, item.source.firstWitness[1] * 16), null);
    assert.equal(readonlyCanvas.commitPlacement(), undefined);
    assert.equal(source.componentDefinitions[row.id], undefined);
    readonlyCanvas.setSource(null); readonlyCanvas.setAtlas(null);
    assert.equal(JSON.stringify(source), original);
    continue;
  }
  assert.ok(plan?.canPlace, item.itemId); assert.equal(plan.definitionCost, 1); assert.equal(plan.commandCount, 7);
  const [x, y] = item.source.firstWitness;
  assert.deepEqual(item.tiles.map(([dx, dy]) => before.terrain[(y + dy) * 384 + x + dx]), item.tiles.map(([, , tile]) => tile));
  let sequence = 0;
  const batch = plan.place(x, y, kind => `system-base-map#${kind}-${sha(`${item.itemId}:${++sequence}`)}`);
  const created = applyMapWorkspaceEdits(source, batch), id = batch.at(-1).materialId;
  assert.deepEqual(created, previewMapEdits(source, batch));
  assert.equal(Object.keys(created.componentDefinitions).length, definitionCount + 1);
  assert.deepEqual(created.componentDefinitions[id].variants.original.tiles, item.tiles);
  assert.deepEqual(created.map.decorations.slice(0, -1), source.map.decorations);
  assert.deepEqual(created.map.base, source.map.base); assert.deepEqual(created.map.waterGroups, source.map.waterGroups);
  assert.deepEqual(composeMapLayers(created), before);
  const { gameId: owner, ...persisted } = JSON.parse(JSON.stringify(created));
  assert.equal(owner, 'system-base-map'); validateSystemBaseMap({ ...template, content: persisted }, sha);
  const reusable = planSpriteMaterialization(persisted.componentDefinitions, item);
  assert.equal(reusable.materialId, id); assert.equal(reusable.commandCount, 1); assert.equal(reusable.definitionCost, 0);
  const again = applyMapWorkspaceEdits(created, reusable.place(x, y, kind => `system-base-map#${kind}-${sha(`${item.itemId}:reuse`)}`));
  assert.deepEqual(again.componentDefinitions, created.componentDefinitions);
  assert.equal(again.map.decorations.length, source.map.decorations.length + 2);
  assert.equal(JSON.stringify(source), original);
}

// In-memory transport backed by the real shared server function. Not HTTPS/SQL.
let stored = JSON.parse(JSON.stringify(template.content)), version = 1, model, painted, canvasModel, controller;
const paints = [], writes = [];
const workspace = createMapCanvas({ publish: value => { canvasModel = value; }, stage: batch => controller.actions.stage(batch) });
workspace.resize(6144, 4096);
controller = createMapController({ work: action => action(), confirm: () => true,
  publish: value => { model = value; }, paint: value => { painted = value; paints.push(value); workspace.setSource(value); },
  api: async (path, body) => {
    if (body !== undefined) {
      assert.equal(path, '/api/admin/base-map/save'); writes.push(JSON.parse(JSON.stringify(body)));
      const { gameId: owner, ...content } = applyMapWorkspaceEdits({ gameId: 'system-base-map', ...stored }, body.edits);
      assert.equal(owner, 'system-base-map'); validateSystemBaseMap({ ...template, content }, sha);
      stored = JSON.parse(JSON.stringify(content)); version++;
      return {};
    }
    assert.equal(path, '/api/admin/base-map');
    return { snapshot: { version, digest: sha(JSON.stringify(stored)), template: { ...template, content: JSON.parse(JSON.stringify(stored)) } } };
  } });
controller.setIdentity({ user: { id: 'isolated-admin', role: 'admin', mustChangePassword: false }, version: 1 });
await controller.actions.enter();
workspace.setAtlas({});
const initial = JSON.stringify(painted), paintCount = paints.length, catalogId = `catalog:${recipe.itemId}`;
assert.ok(canvasModel.catalogItems.find(item => item.id === catalogId).canPlace);
assert.deepEqual(workspace.previewPlacement(catalogId, 209 * 16 + 1, 7 * 16 + 1), { materialId: catalogId, x: 209, y: 7, inBounds: true });
assert.equal(workspace.commitPlacement(), true); assert.equal(workspace.commitPlacement(), undefined);
assert.equal(paints.length, paintCount + 1); assert.equal(model.editCount, 7);
assert.equal(painted.map.decorations.length, source.map.decorations.length + 1);
controller.actions.undo(); assert.equal(JSON.stringify(painted), initial); assert.equal(model.dirty, false);
workspace.previewPlacement(catalogId, 209 * 16 + 1, 7 * 16 + 1); workspace.commitPlacement(); await controller.actions.save();
assert.equal(writes.length, 1); assert.deepEqual(Object.keys(writes[0]), ['edits']);
assert.equal(writes[0].edits.length, 7);
assert.deepEqual(writes[0].edits.map(edit => edit.op), edits.map(edit => edit.op));
assert.deepEqual(painted.componentDefinitions[writes[0].edits.at(-1).materialId].variants.original.tiles, tiles);
assert.equal(model.uncertain, false); assert.equal(model.dirty, false); assert.equal(model.version, 2);
assert.deepEqual(painted, stored);
assert.match(canvasModel.catalogItems.find(item => item.id === catalogId).note, /復用本圖完整配方；1條命令/);
workspace.previewPlacement(catalogId, 209 * 16 + 1, 7 * 16 + 1); workspace.commitPlacement();
assert.equal(model.editCount, 1); assert.deepEqual(painted.componentDefinitions, stored.componentDefinitions);
controller.actions.undo(); assert.deepEqual(painted, stored);
workspace.previewPlacement(catalogId, 209 * 16 + 1, 7 * 16 + 1); controller.dispose();
assert.equal(canvasModel.loaded, false); assert.equal(workspace.commitPlacement(), undefined); assert.equal(writes.length, 1);
console.log(`PASS private recipe planner/canvas and existing seven-command materialization: preview/server equality, one definition/instance, no temporary map instances, JSON/full template, reuse/full budget/late failure, sea geography, real canvas commit/grouped controller undo/save/reread/reuse/reset through in-memory transport. ${Date.now() - started}ms. ${catalog.recipes.filter(item => item.support === 'existing-decoration').length} registered recipes materialized/JSON/reused; ${catalog.recipes.filter(item => item.support === 'reference-only').length} private references refused placement without mutation; no HTTPS claim.`);
