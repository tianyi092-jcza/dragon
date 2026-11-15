// Registered-source catalog samples -> existing server command -> independent JSON.
// Read-only fixed assets; no database, template migration, SAVE.DAT or browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mapSpriteIdentity } from './map_sprite_identity.mjs';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { componentCells } from '../web/src/editor/componenttools.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { projectSpriteCatalog } from '../editor-ui/src/mapspritecatalog.js';
import catalog from '../editor-ui/src/mapspritecatalog.json' with { type: 'json' };

const started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const { template } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const original = JSON.stringify(template), source = { gameId: 'system-base-map', ...template.content };
const before = composeMapLayers(source), rows = projectSpriteCatalog(source.componentDefinitions).catalogItems;
assert.ok(rows.every(row => row.available));
assert.equal(new Set(rows.map(row => mapSpriteIdentity(source.componentDefinitions[row.id]))).size, rows.length,
  'selected catalog definitions have distinct full semantic identities; vertical is not a rotated alias');
assert.deepEqual(rows.filter(row => row.canPlace).map(row => row.id), ['tile-112', 'tile-180', 'tile-248', 'tile-16', ...[0, 1, 2, 17, 18, 20, 181, 182, 183].map(tile => `tile-${tile}`), ...catalog.components.filter(item => item.support === 'existing-decoration').map(item => item.definitionRef)]);
assert.deepEqual(rows.filter(row => ['road', 'city'].includes(row.category)).map(row => [row.id, row.canPlace]),
  [...[184, 185, 203, 204, 205, 196, 197, 198, 199, 200, 201, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 251, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221].map(tile => [`tile-${tile}`, false]),
    ...catalog.components.filter(item => item.category === 'city').map(item => [item.definitionRef, false])], 'reference images grant no road/city placement');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('coast-')).map(row => [row.id, row.available, row.canPlace]),
  [32, 33, 36, 37, 48, 49, 52, 53, 3, 13, 19, 28, 41, 42, 74, 75, 79].map(tile => [`tile-${tile}`, true, false]), 'coast direction images never grant geography painting');
assert.deepEqual(rows.filter(row => ['tile-29', 'tile-251'].includes(row.id)).map(row => [row.id, row.available, row.canPlace]),
  [['tile-29', true, false], ['tile-251', true, false]], 'observed texture and gate association do not grant new placement');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('ground-crown-')).map(row => [row.id, row.available, row.canPlace]),
  [168, 176, 177, 178, 179].map(tile => [`tile-${tile}`, true, false]), 'crown appearance is not a geographic or placement grant');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('city-edge-')).map(row => [row.itemId, row.available, row.canPlace, row.cells]),
  ['north', 'south', 'west', 'east'].map(side => [`city-edge-${side}-3-v1`, true, false, 3]), 'trusted multi-cell identity does not grant city placement');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('city-corner-')).map(row => [row.itemId, row.available, row.canPlace, row.cells]),
  ['east-top', 'east-bottom', 'south-left', 'south-right'].map(side => [`city-corner-${side}-2-v1`, true, false, 2]));
assert.deepEqual(rows.filter(row => ['tile-252', 'tile-253'].includes(row.id)).map(row => [row.id, row.available, row.canPlace]),
  [['tile-252', true, false], ['tile-253', true, false]], 'wall references cannot inherit the other wall samples placement support');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('shore-')).map(row => [row.itemId, row.available, row.canPlace, row.cells]),
  [['shore-fine-corner-21-v1', true, false, 1], ...['shallow-arc', 'left-line', 'upper-line', 'lower-bend', 'right-line', 'lower-line']
    .map(name => [`shore-${name}-2-v1`, true, false, 2])], 'non-water legacy slicing is not a geography or placement certificate');
assert.deepEqual(rows.filter(row => row.itemId.startsWith('river-stroke-')).map(row => [row.id, row.available, row.canPlace]),
  [88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111].map(tile => [`tile-${tile}`, true, false]),
  'native river pixels remain exact existing identities without placement or topology grants');
console.log(`Registered ${rows.length} identities: ${Date.now() - started}ms`);
for (const row of rows.filter(row => row.canPlace)) {
  const item = [...catalog.items, ...catalog.components].find(item => item.itemId === row.itemId);
  const cell = item.source.firstWitness ?? source.map.decorations.flatMap(instance => componentCells(source, instance))
    .find(([x, y]) => before.terrain[y * 384 + x] === item.tile);
  assert.ok(cell, `${row.id} has an existing visible decoration witness`);
  const [x, y] = cell;
  const edit = { op: 'decoration-place', instanceId: `system-base-map#decoration-${sha(`${row.itemId}:first`)}`,
    materialId: row.id, variantRef: 'original', x, y, waterClass: null };
  const next = applyMapWorkspaceEdits(source, [edit]);
  assert.deepEqual(next.componentDefinitions, source.componentDefinitions, 'reuse existing exact definition, no new catalog runtime dependency');
  assert.deepEqual(next.map.base, source.map.base, 'ordinary sample never turns sea into land implicitly');
  assert.deepEqual(next.map.waterGroups, source.map.waterGroups);
  assert.deepEqual(next.map.decorations.slice(0, -1), source.map.decorations);
  assert.equal(next.map.decorations.at(-1).definitionRef, row.id);
  const { gameId, ...content } = JSON.parse(JSON.stringify(next));
  validateSystemBaseMap({ ...template, content }, sha);
  const after = composeMapLayers(content);
  assert.deepEqual(after.terrain, before.terrain, 'same-byte placement at native witness preserves the compiled plane');
  assert.deepEqual(after.geography, before.geography);
  if (item.category === 'ground' || item.tile === 181) {
    const seaCell = before.terrain.findIndex((tile, index) => tile === 95 && before.geography[index] === 1);
    assert.ok(seaCell >= 0, 'registered source supplies an explicit sea witness');
    const overSea = applyMapWorkspaceEdits(source, [{ ...edit, x: seaCell % 384, y: Math.floor(seaCell / 384) }]);
    const seaResult = composeMapLayers(overSea);
    assert.equal(seaResult.terrain[seaCell], item.tile, 'every ground/G07 texture, including byte zero, is applied explicitly');
    assert.equal(seaResult.geography[seaCell], 1, 'ground appearance is NOT implicit sea-to-land conversion');
    assert.deepEqual(overSea.map.base, source.map.base);
    assert.deepEqual(overSea.map.waterGroups, source.map.waterGroups);
    const { gameId, ...content } = JSON.parse(JSON.stringify(overSea));
    validateSystemBaseMap({ ...template, content }, sha);
  }
  if (item.itemId.startsWith('field-corner-') || item.itemId.startsWith('mountain-step-') || item.itemId.startsWith('mountain-slope-')) {
    const width = Math.max(...item.footprint.map(([x]) => x)) + 1;
    const height = Math.max(...item.footprint.map(([, y]) => y)) + 1;
    const offsets = Array.from({ length: width * height }, (_, cell) => [cell % width, Math.floor(cell / width)]);
    const seaCell = before.terrain.findIndex((_, index) => index % 384 <= 384 - width && Math.floor(index / 384) <= 256 - height
      && offsets.every(([dx, dy]) => before.terrain[index + dy * 384 + dx] === 95 && before.geography[index + dy * 384 + dx] === 1));
    assert.ok(seaCell >= 0);
    const overSea = applyMapWorkspaceEdits(source, [{ ...edit, x: seaCell % 384, y: Math.floor(seaCell / 384) }]);
    const seaResult = composeMapLayers(overSea);
    offsets.forEach(([dx, dy]) => {
      const tile = item.tiles.find(([x, y]) => x === dx && y === dy)?.[2];
      assert.equal(seaResult.terrain[seaCell + dy * 384 + dx], tile ?? 95,
        `${item.itemId}: only occupied cells paint; the anchor may be a hole`);
    });
    assert.deepEqual(seaResult.geography, before.geography);
    assert.deepEqual(overSea.map.base, source.map.base);
    assert.deepEqual(overSea.map.waterGroups, source.map.waterGroups);
    const { gameId, ...content } = JSON.parse(JSON.stringify(overSea));
    validateSystemBaseMap({ ...template, content }, sha);
  }
  if (item.itemId === 'wall-corner-3-v1') {
    assert.deepEqual(componentCells(next, next.map.decorations.at(-1)), [[x, y], [x + 1, y], [x + 1, y + 1]]);
    assert.equal(after.terrain[(y + 1) * 384 + x], before.terrain[(y + 1) * 384 + x], 'missing lower-left cell keeps the existing terrain');
  }
  assert.equal(JSON.stringify(template), original);
  // Repeat placement reuses the same definition; no library entries are added.
  const second = { ...edit, instanceId: `system-base-map#decoration-${sha(`${row.itemId}:second`)}` };
  const repeated = applyMapWorkspaceEdits(next, [second]);
  assert.deepEqual(applyCopyMapEdits(next, [second], Object.keys(source.componentDefinitions).length).componentDefinitions,
    source.componentDefinitions, 'full existing library budget does not require extra slots for exact reuse');
  assert.deepEqual(repeated.componentDefinitions, source.componentDefinitions);
  assert.equal(repeated.map.decorations.length, source.map.decorations.length + 2);
  assert.throws(() => applyMapWorkspaceEdits(source, [{ ...edit, x: 384 }]), /超出/);
  if (item.tiles) {
    const overflow = item.tiles.some(([x]) => x > 0) ? { x: 383 } : { y: 255 };
    assert.throws(() => applyMapWorkspaceEdits(source, [{ ...edit, ...overflow }]), /超出/, 'full strip, never clipped');
  }
  assert.throws(() => applyMapWorkspaceEdits(next, [edit]), 'same identity cannot be replayed');
  assert.equal(JSON.stringify(template), original, 'failed placement leaves caller unchanged');
  console.log(`PASS ${row.itemId}: ${Date.now() - started}ms elapsed`);
}
// Exact reuse above is not a budget exemption for adding other definitions.
// The same valid capture succeeds with one spare slot and fails at the full cap.
const captureMember = source.map.decorations.find(instance => !instance.waterClass
  && source.componentDefinitions[instance.definitionRef].footprint.length === 1);
assert.ok(captureMember);
const capture = { op: 'material-capture', materialId: `system-base-map#material-${sha('catalog-budget-capture')}`,
  memberIds: [captureMember.id], name: '隔離預算負控' };
const definitionCount = Object.keys(source.componentDefinitions).length;
assert.equal(Object.keys(applyCopyMapEdits(source, [capture], definitionCount + 1).componentDefinitions).length, definitionCount + 1);
assert.throws(() => applyCopyMapEdits(source, [capture], definitionCount), /素材庫結構／數量不合法/);
assert.equal(JSON.stringify(template), original, 'full-budget rejection must not leave a partial definition');
console.log(`PASS full-budget capture controls: ${Date.now() - started}ms elapsed`);
for (const example of catalog.examples) {
  const items = example.placements.map(placement => catalog.components.find(item => item.itemId === placement.itemId));
  if (items.some(item => item.support === 'reference-only')) {
    assert.equal(example.category, 'water');
    assert.ok(items.every(item => !rows.find(row => row.itemId === item.itemId).canPlace));
    continue; // A picture is not admission to place river geography.
  }
  const edits = example.placements.map((placement, index) => ({
    op: 'decoration-place', instanceId: `system-base-map#decoration-${sha(`${example.exampleId}:${index}`)}`,
    materialId: items[index].definitionRef, variantRef: 'original',
    x: example.source.firstWitness[0] + placement.x, y: example.source.firstWitness[1] + placement.y, waterClass: null,
  }));
  const next = applyMapWorkspaceEdits(source, edits);
  assert.deepEqual(next.componentDefinitions, source.componentDefinitions);
  assert.deepEqual(next.map.base, source.map.base);
  assert.deepEqual(next.map.waterGroups, source.map.waterGroups);
  assert.equal(next.map.decorations.length, source.map.decorations.length + edits.length);
  assert.deepEqual(composeMapLayers(next), before, `${example.exampleId} reproduces native visible cells without filling holes or altering geography`);
  if (example.exampleId === 'wall-start-end-overlap-v1') {
    const seaCell = before.terrain.findIndex((_, index) => index % 384 < 382 && [0, 1, 2].every(dx =>
      before.terrain[index + dx] === 95 && before.geography[index + dx] === 1));
    assert.ok(seaCell >= 0);
    const x = seaCell % 384, y = Math.floor(seaCell / 384);
    const overlap = applyMapWorkspaceEdits(source, edits.map((edit, index) => ({ ...edit,
      x: x + example.placements[index].x, y: y + example.placements[index].y })));
    const short = catalog.components.find(item => item.itemId === 'wall-short-3-v1');
    const single = applyMapWorkspaceEdits(source, [{ ...edits[0], materialId: short.definitionRef, x, y }]);
    const result = composeMapLayers(overlap);
    assert.deepEqual(result, composeMapLayers(single), 'two overlapping end pieces reproduce the single short-wall recipe');
    assert.deepEqual(Array.from(result.terrain.slice(seaCell, seaCell + 3)), [248, 231, 249]);
    assert.deepEqual(result.geography, before.geography, 'wall appearance is not a geography annotation');
    assert.deepEqual(overlap.map.base, source.map.base);
    assert.deepEqual(overlap.map.waterGroups, source.map.waterGroups);
    assert.deepEqual(overlap.componentDefinitions, source.componentDefinitions);
  }
  const { gameId, ...content } = JSON.parse(JSON.stringify(next));
  validateSystemBaseMap({ ...template, content }, sha);
  assert.equal(JSON.stringify(template), original);
  console.log(`PASS ${example.exampleId}: ${Date.now() - started}ms elapsed`);
}
console.log(`PASS ${rows.length} exact registered sample definitions; ${rows.filter(row => row.canPlace).length} ordinary single/multi-cell placements and 4 native composition examples, unchanged definition budget with full-cap negative control, server command, full template validation and JSON independence; reference-only samples grant no placement. No new rule or arbitrary-topology admission.`);
