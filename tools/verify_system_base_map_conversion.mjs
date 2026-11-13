// Real registered source, memory-only template validation/edit checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';
import { splitDecoration, removeDecorations, fillBase, translateDecorations, reorderDecorations,
  createDecorationPicker, setWaterGroupMinimapVisibility, captureComponent, placeComponent } from '../web/src/editor/componenttools.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const input = readInstalledEditorSource();
const { template, receipt } = convertInstalledSystemBaseMap(input, BUILTIN_RESOURCES.sourceDigest);
const validate = value => validateSystemBaseMap(value, sha);
const original = validate(template);
assert.equal(original.digest, receipt.digest);
assert.equal(validate(JSON.parse(JSON.stringify(template))).digest, original.digest, 'real JSON roundtrip');
const piece = template.content.map.decorations.find(item => {
  const definition = template.content.componentDefinitions[item.definitionRef];
  return definition.category === 'mountain-pattern' && definition.footprint.length > 1 && definition.footprint.length <= 8;
});
const footprint = template.content.componentDefinitions[piece.definitionRef].footprint;
const workspace = { ...template.content, gameId: 'system-base-map' };
const captureEdit = { op: 'material-capture', memberIds: [piece.id], materialId: 'system-base-map#material-' + 'f'.repeat(64), name: '工作區擷取' };
assert.throws(() => applyCopyMapEdits(workspace, [captureEdit]), /素材庫結構／數量/, 'legacy fixed gate remains 1024');
const capturedWorkspace = applyMapWorkspaceEdits(workspace, [captureEdit]);
assert.equal(capturedWorkspace.componentDefinitions[captureEdit.materialId].name, '工作區擷取');
const budgetFull = { ...workspace, componentDefinitions: { ...workspace.componentDefinitions } };
Array.from({ length: 768 }, (_, index) => {
  const id = 'system-base-map#material-' + (index + 1).toString(16).padStart(64, '0');
  budgetFull.componentDefinitions[id] = { ...capturedWorkspace.componentDefinitions[captureEdit.materialId], id };
});
assert.throws(() => applyMapWorkspaceEdits(budgetFull, [captureEdit]), /素材庫結構／數量/, 'converted definitions do not increase the 768 author-material budget');
const picker = createDecorationPicker(template.content);
footprint.forEach(([dx, dy]) => assert.equal(template.content.map.decorations[picker.pick(piece.x + dx, piece.y + dy)].id, piece.id));
const childIds = footprint.map((_, i) => `test-child-${i}`);
const split = structuredClone(template);
split.content = splitDecoration(split.content, piece.id, childIds);
split.content.selectionGroups.forEach(group => {
  group.members = group.members.flatMap(member => member.layer === 'decorations' && member.id === piece.id
    ? childIds.map(id => ({ layer: 'decorations', id })) : [member]);
});
assert.deepEqual(validate(split).compiled.terrainBytes, original.compiled.terrainBytes, 'split uses shared editor core');
const removed = structuredClone(template);
removed.content = removeDecorations(removed.content, [piece.id]);
removed.content.selectionGroups = removed.content.selectionGroups.map(group => ({ ...group,
  members: group.members.filter(member => member.id !== piece.id) })).filter(group => group.members.length);
assert.throws(() => validate(removed), /unknown|underlay|未|底/i, 'delete without explicit base must fail');
// Explicit author choice of byte 16 in this isolated test, NOT inferred hidden ground.
const filled = structuredClone(removed);
const baseCells = footprint.map(([dx, dy]) => (piece.y + dy) * 384 + piece.x + dx);
filled.content = fillBase(filled.content, baseCells, 16, 0);
const edited = validate(filled);
assert.notDeepEqual(edited.compiled.terrainBytes, original.compiled.terrainBytes, 'real supported rule-plane edit');
assert.deepEqual(edited.compiled.roadGraph, original.compiled.roadGraph);
assert.equal(validate(template).digest, original.digest, 'edits never alter the source template');
const reordered = structuredClone(template);
reordered.content = reorderDecorations(reordered.content, [piece.id], 1);
assert.notEqual(reordered.content.map.decorations.findIndex(item => item.id === piece.id), template.content.map.decorations.findIndex(item => item.id === piece.id));
assert.deepEqual(validate(reordered).compiled.terrainBytes, original.compiled.terrainBytes);
const offsets = Array.from({ length: 33 }, (_, i) => i - 16);
const destination = offsets.flatMap(dy => offsets.map(dx => [dx, dy])).find(([dx, dy]) => (dx || dy) && footprint.every(([x, y]) => {
  x += piece.x + dx; y += piece.y + dy;
  const tile = original.compiled.terrainBytes[y * 384 + x];
  return x >= 0 && x < 384 && y >= 0 && y < 256 && tile >= 112 && tile < 180;
}));
assert(destination, 'fixture needs a mountain-only translation destination');
const moved = structuredClone(template);
moved.content = translateDecorations(fillBase(moved.content, baseCells, 16, 0), [piece.id], ...destination);
const movedResult = validate(moved);
assert.notDeepEqual(movedResult.compiled.terrainBytes, original.compiled.terrainBytes);
assert.deepEqual(movedResult.compiled.roadGraph, original.compiled.roadGraph);
assert.equal(moved.content.map.decorations.find(item => item.id === piece.id).x, piece.x + destination[0]);
assert.throws(() => translateDecorations(template.content, [piece.id], 384, 0), /超界/);
const water = template.content.map.waterGroups.find(group => group.showOnMinimap);
const hidden = structuredClone(template);
hidden.content = setWaterGroupMinimapVisibility(hidden.content, water.id, false);
const hiddenResult = validate(hidden);
assert.notDeepEqual(hiddenResult.compiled.minimapGeography, original.compiled.minimapGeography);
assert.deepEqual(hiddenResult.compiled.terrainBytes, original.compiled.terrainBytes);
assert.deepEqual(hiddenResult.compiled.geography, original.compiled.geography);
assert.deepEqual(hiddenResult.compiled.roadMask, original.compiled.roadMask);
hidden.content = setWaterGroupMinimapVisibility(hidden.content, water.id, true);
assert.deepEqual(validate(hidden).compiled.minimapGeography, original.compiled.minimapGeography);
const reused = structuredClone(filled);
reused.content.componentDefinitions = captureComponent(split.content, childIds, 'test-material', '隔離素材').componentDefinitions;
reused.content = placeComponent(reused.content, 'test-material', piece.x, piece.y, 'test-material-instance');
reused.content.selectionGroups.push({ id: 'test-selection', members: [{ layer: 'decorations', id: 'test-material-instance' }] });
assert.deepEqual(validate(reused).compiled.terrainBytes, original.compiled.terrainBytes, 'captured reusable definition restores original footprint');
[split, filled, reordered, moved, hidden, reused].forEach(value => assert.deepEqual(validate(JSON.parse(JSON.stringify(value))), validate(value), 'edited template JSON save/recompile'));
const cases = [
  ['forbidden root state', value => { value.chapters = {}; }, /root/],
  ['missing member', value => { value.content.selectionGroups[0].members[0].id = 'missing'; }, /missing/],
  ['duplicate group', value => { value.content.selectionGroups.push(value.content.selectionGroups[0]); }, /duplicate/],
  ['missing city initial value', value => { delete Object.values(value.content.cities)[0].max_prod; }, /max_prod/],
  ['missing compatibility', value => { delete value.content.compatibilityAssets; }, /compatibility/],
  ['forbidden chapters', value => { value.content.chapters = {}; }, /chapter/],
  ['missing resource', value => { delete value.content.editorAssets.seasonAtlases.winter; }, /resource/],
  ['out of bounds instance', value => { value.content.map.decorations.find(item => item.id === piece.id).x = 384; }, /bounds/],
  ['unsupported bounds', value => { value.content.map.bounds.width = 385; }, /bounds/],
  ['unknown recipe', value => { value.content.componentDefinitions[piece.definitionRef].ruleRecipeRef = 'guessed'; }, /UNSUPPORTED_RULE_BINDING/],
];
cases.forEach(([name, mutate, pattern]) => {
  const bad = structuredClone(template); mutate(bad); assert.throws(() => validate(bad), pattern, name);
});
console.log(JSON.stringify({ passed: true, receipt, checks: ['JSON-roundtrip', 'shared-editor-split', 'unknown-delete-refusal',
  'explicit-base-edit-recompile', 'source-isolation', 'footprint-picker', 'shared-reorder', 'shared-translate',
  'translate-out-of-bounds-refusal', 'water-visibility-and-road-invariance', 'capture-and-place-material', 'edited-JSON-save-recompile', ...cases.map(([name]) => name)] }, null, 2));
