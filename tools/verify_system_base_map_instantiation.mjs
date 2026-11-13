// Memory-only creation contract. HTTP/SQLite wiring is verified separately.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { copyBuiltinGame, canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { initializeCopyGenerals } from '../server/copygenerals.js';
import { instantiateSystemBaseMap, validateSystemBaseMap } from '../server/systembasemap.js';
import { fillBase, removeDecorations } from '../web/src/editor/componenttools.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readInstalledEditorSource();
const { template, receipt } = convertInstalledSystemBaseMap(source, BUILTIN_RESOURCES.sourceDigest);
const snapshot = JSON.parse(JSON.stringify({ version: 1, digest: receipt.digest, template }));
const minimal = initializeCopyGenerals(copyBuiltinGame({ gameId: '11111111-1111-4111-8111-111111111111', ownerId: 'test', kind: 'minimal', source }, sha));
const full = initializeCopyGenerals(copyBuiltinGame({ gameId: '22222222-2222-4222-8222-222222222222', ownerId: 'test', kind: 'full', source }, sha));
const sourceBefore = [canonicalDigest(minimal, sha), canonicalDigest(full, sha)];
const a = instantiateSystemBaseMap(minimal, snapshot, sha);
const b = instantiateSystemBaseMap(full, snapshot, sha);
for (const field of ['map', 'componentDefinitions', 'cities', 'selectionGroups', 'compatibilityAssets', 'mapEditorAssets', 'mapOrigin']) assert.deepEqual(a[field], b[field], field);
assert.equal(a.chapterOrder.length, 0);
assert.equal(b.chapterOrder.length, 20);
assert.deepEqual(b.generals, full.generals);
assert.deepEqual(b.chapters, full.chapters);
assert.deepEqual(b.sourceRef, full.sourceRef);
assert.deepEqual(a.sourceRef, minimal.sourceRef);
assert.deepEqual([canonicalDigest(minimal, sha), canonicalDigest(full, sha)], sourceBefore);
assert.notEqual(a.map, b.map);
assert.notEqual(a.map.decorations[0], snapshot.template.content.map.decorations[0]);
const oldDigests = [canonicalDigest(a, sha), canonicalDigest(b, sha)];
const t2 = structuredClone(template);
const instance = t2.content.map.decorations.find(item => t2.content.componentDefinitions[item.definitionRef].category === 'mountain-pattern');
const footprint = t2.content.componentDefinitions[instance.definitionRef].footprint;
t2.content = fillBase(t2.content, footprint.map(([dx, dy]) => (instance.y + dy) * 384 + instance.x + dx), 16, 0);
t2.content = removeDecorations(t2.content, [instance.id]);
t2.content.selectionGroups = t2.content.selectionGroups.map(group => ({ ...group, members: group.members.filter(member => member.id !== instance.id) })).filter(group => group.members.length);
Object.values(t2.content.cities)[0].name = '獨立城';
const checked = validateSystemBaseMap(t2, sha);
const c = instantiateSystemBaseMap(full, { version: 2, digest: checked.digest, template: t2 }, sha);
assert.equal(c.mapOrigin.version, 2);
assert.deepEqual(c.map, t2.content.map);
assert.notDeepEqual(c.map, b.map);
assert.deepEqual([canonicalDigest(a, sha), canonicalDigest(b, sha)], oldDigests);
assert.equal(c.chapters[c.chapterOrder[0]].state.cities[0].name, '獨立城');
assert.deepEqual(c.chapters[c.chapterOrder[0]].state.factions, b.chapters[b.chapterOrder[0]].state.factions);
a.componentDefinitions[Object.keys(a.componentDefinitions)[0]].name = 'A-only';
a.map.decorations[0].x += 1;
a.selectionGroups[0].members.pop();
assert.equal(canonicalDigest(b, sha), oldDigests[1]);
assert.equal(validateSystemBaseMap(snapshot.template, sha).digest, receipt.digest);
assert.throws(() => instantiateSystemBaseMap(minimal, undefined, sha), /snapshot version/);
assert.throws(() => instantiateSystemBaseMap(minimal, { ...snapshot, digest: '0'.repeat(64) }, sha), /digest mismatch/);
// IDs are local to each independent map; native runtime slots are retained.
// A template may use another city ID without retaining a stale baseline binding.
const renamed = structuredClone(template);
const oldId = Object.keys(renamed.content.cities)[0], newId = 'template-city-north';
renamed.content.cities[newId] = { ...renamed.content.cities[oldId], cityId: newId };
delete renamed.content.cities[oldId];
renamed.content.map.placements.find(place => place.cityId === oldId).cityId = newId;
renamed.content.map.roads.forEach(road => {
  if (road.fromCityId === oldId) road.fromCityId = newId;
  if (road.toCityId === oldId) road.toCityId = newId;
  road.nativeBinding.slots.forEach(binding => { if (binding.node === oldId) binding.node = newId; });
});
const renamedDigest = validateSystemBaseMap(renamed, sha).digest;
const remapped = instantiateSystemBaseMap(full, { version: 3, digest: renamedDigest, template: renamed }, sha);
assert.equal(remapped.compatibility.slotBindings.cities[newId], 0);
assert.equal(Object.hasOwn(remapped.compatibility.slotBindings.cities, oldId), false);
assert.deepEqual(remapped.chapters, full.chapters);
const incompatible = structuredClone(full);
incompatible.chapters[incompatible.chapterOrder[0]].state.cities[0].raw = '00'.repeat(32);
assert.throws(() => instantiateSystemBaseMap(incompatible, snapshot, sha), /native city coordinate mismatch/);
console.log(JSON.stringify({ passed: true, templateDigest: receipt.digest, nextDigest: checked.digest,
  checks: ['minimal-full-map-equivalence', 'full-20-chapter-person-retention', 'separate-map-entity-provenance',
    'T1-A-B-T2-C-isolation', 'city-master-name-projection', 'faction-capital-retention', 'nested-mutable-isolation',
    'template-local-city-id-slot-rebinding', 'missing-snapshot-refusal', 'digest-mismatch-refusal', 'incompatible-chapter-refusal'] }, null, 2));
