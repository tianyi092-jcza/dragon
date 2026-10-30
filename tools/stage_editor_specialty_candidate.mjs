// Pending candidates only. Optional bound runtime package; never approval or installation.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { BUILTIN_ENTITY_SOURCE } from '../web/src/editor/builtinentitysource.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { readInstalledEntitySource } from './editor_entity_source.mjs';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';

const round = process.argv[2];
const runtimePackage = process.argv[3] === '--runtime-package';
assert.equal(process.argv.length, runtimePackage ? 4 : 3);
assert.match(round ?? '', /^[A-Za-z0-9-]{1,64}$/);
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {}, bytesByURL = new Map();
const prefix = `content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
function readBoundURL(url) {
  assert.ok(url.startsWith(prefix) || [BUILTIN_ENTITY_SOURCE.manifestURL, BUILTIN_ENTITY_SOURCE.resourceURL].includes(url));
  const bytes = readFileSync(join(root, 'web', url));
  inputs['web/' + url] = sha(bytes);
  bytesByURL.set(url, bytes);
  return bytes;
}
readInstalledEditorSource(BUILTIN_RESOURCES, readBoundURL);
const rawSource = await readInstalledEntitySource(readBoundURL);
// Preserve parse failures with the bound asset URL; never substitute a default.
function parseBoundJSON(url) {
  try { return JSON.parse(bytesByURL.get(url).toString('utf8')); }
  catch (cause) { throw new TypeError(`Invalid bound candidate JSON: ${url}`, { cause }); }
}
const original = parseBoundJSON(BUILTIN_RESOURCES.sourceURL);
const candidate = structuredClone(original), changes = [];
assert.deepEqual(candidate.chapterOrder, rawSource.sourceChapterOrder);
assert.equal(candidate.chapterOrder.length, 20);
for (const [chapterIndex, id] of candidate.chapterOrder.entries()) {
  const sourceChapter = rawSource.chapters[chapterIndex];
  assert.equal(sourceChapter.chapterId, id);
  const generals = candidate.chapters[id].state.generals;
  assert.equal(generals.length, 128);
  for (const [slot, general] of generals.entries()) {
    assert.equal(general.idx, slot);
    assert.equal(Object.hasOwn(general, 'specialty_low_bits'), false, 'refuse to overwrite an already migrated source');
    const raw = Buffer.from(sourceChapter.general32[slot], 'hex');
    assert.equal(raw.length, 32);
    const lowBits = [0x0e, 0x0f, 0x10].map(offset => (raw[offset] & 15).toString(16)).join('');
    for (const [offset, field] of [[0x0e, 'siege'], [0x0f, 'field'], [0x10, 'naval']]) {
      assert.equal(general.ability[field], raw[offset] >>> 4, 'not an overlay for modified or differently bound abilities');
      assert.equal((general.ability[field] << 4) | Number.parseInt(lowBits[offset - 0x0e], 16), raw[offset]);
    }
    general.specialty_low_bits = lowBits;
    changes.push({ chapterId: id, slot, lowBits, originalTriplet: raw.subarray(0x0e, 0x11).toString('hex'), originalRecordSha256: sha(raw) });
  }
}
const restored = structuredClone(candidate);
for (const id of restored.chapterOrder) for (const general of restored.chapters[id].state.generals) delete general.specialty_low_bits;
assert.deepEqual(restored, original, 'only the missing low-bit field may change');
assert.equal(changes.length, 2560);
assert.equal(changes.filter(change => change.lowBits !== '000').length, 5);
const compiled = compileGameSource(candidate, sha);
assert.notEqual(compiled.sourceDigest, BUILTIN_RESOURCES.sourceDigest);
assert.equal(compiled.sourceDigest, canonicalDigest(candidate, sha));
assert.deepEqual(Buffer.from(compiled.terrainBytes), bytesByURL.get(prefix + 'terrain.bin'));
assert.deepEqual(Buffer.from(compiled.roadCost), bytesByURL.get(prefix + 'road_cost.bin'));
assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), bytesByURL.get(prefix + 'road_offset.json'));
assert.deepEqual(compiled.roadGraph, parseBoundJSON(prefix + 'roads.json'));
const tools = {};
for (const path of ['tools/stage_editor_specialty_candidate.mjs', 'tools/editor_builtin_source.mjs', 'tools/editor_entity_source.mjs', 'web/src/content/builtinresources.generated.js', 'web/src/editor/builtinentitysource.generated.js', 'web/src/content/builtinrelease.generated.js', 'web/src/editor/entitysource.js', 'web/src/content/authoring/gamesource.js', 'web/src/content/authoring/trialcompile.js']) {
  tools[path] = sha(readFileSync(join(root, path)));
}
for (const [path, hash] of Object.entries({ ...inputs, ...tools })) assert.equal(sha(readFileSync(join(root, path))), hash, 'input drift');
const envelope = {
  format: 'specialty-source-candidate-1', status: 'PENDING-NOT-INSTALLED',
  baseRevision: BUILTIN_RESOURCES.world.revision, baseSourceDigest: BUILTIN_RESOURCES.sourceDigest,
  originalRecords: BUILTIN_ENTITY_SOURCE, sourceDigest: compiled.sourceDigest, changes, source: candidate,
  limits: 'Source-only overlay, not a RuntimeManifest or approved release. Inherited event tail unchanged, not original-byte certification. No default switch, old-draft migration, editable abilities or runtime consumer claim.',
};
const bytes = Buffer.from(JSON.stringify(envelope) + '\n');
const outputs = new Map([['candidate.json', bytes]]);
const encoded = value => Buffer.from(JSON.stringify(value) + '\n');
let runtime = null;
if (runtimePackage) {
  const oldManifest = parseBoundJSON(prefix + 'manifest.json');
  const revision = 'map-2-' + canonicalDigest({ contract: 'specialty-runtime-candidate-1', candidateSha256: sha(bytes), inputs, tools }, sha);
  const nextPrefix = `content/builtin/compiled/${revision}/`;
  const assets = new Map(oldManifest.assets.map(entry => [entry.path, bytesByURL.get(entry.url)]));
  const data = parseBoundJSON(BUILTIN_RESOURCES.dataURL), oldData = structuredClone(data);
  const catalog = parseBoundJSON(BUILTIN_RESOURCES.catalogURL);
  for (const [index, id] of candidate.chapterOrder.entries()) {
    assert.equal(catalog.chapters[index].id, id);
    assert.deepEqual(data.scenarios[index], original.chapters[id].state);
    data.scenarios[index] = structuredClone(candidate.chapters[id].state);
    assets.set(catalog.chapters[index].file, encoded(data.scenarios[index]));
  }
  const dataProbe = structuredClone(data);
  for (const chapter of dataProbe.scenarios) for (const general of chapter.generals) delete general.specialty_low_bits;
  assert.deepEqual(dataProbe, oldData);
  assets.set('data.json', encoded(data));
  assets.set('game-source.json', encoded(candidate));
  const world = structuredClone(BUILTIN_RESOURCES.world);
  world.revision = revision;
  function rebase(url) {
    assert.ok(url.startsWith(prefix));
    return nextPrefix + url.slice(prefix.length);
  }
  for (const field of ['terrain', 'roadGraph', 'roadCost', 'roadOffset']) world.assets[field] = rebase(world.assets[field]);
  for (const field of ['seasonAtlases', 'seasons', 'minimap']) for (const name of Object.keys(world.assets[field])) world.assets[field][name] = rebase(world.assets[field][name]);
  catalog.revision = revision;
  assets.set('world-definition.json', encoded(world));
  assets.set('catalog.json', encoded(catalog));
  const alteredRoles = oldManifest.assets.filter(entry => sha(assets.get(entry.path)) !== entry.sha256).map(entry => entry.path);
  assert.deepEqual(alteredRoles.toSorted(), ['game-source.json', 'data.json', 'world-definition.json', 'catalog.json', ...catalog.chapters.map(chapter => chapter.file)].toSorted());
  const entries = oldManifest.assets.map(entry => ({ ...entry, url: nextPrefix + entry.path, byteLength: assets.get(entry.path).length, sha256: sha(assets.get(entry.path)) }));
  // Explicit fields: neither old display acceptance nor date-only inheritance grants this source approval.
  const pending = 'PENDING-SPECIALTY-DELTA';
  const manifest = {
    schemaVersion: oldManifest.schemaVersion, gameId: oldManifest.gameId, contentRevision: revision, worldRevision: revision,
    sourceDigest: compiled.sourceDigest, compilerProfile: oldManifest.compilerProfile, compatibilityAssetMode: oldManifest.compatibilityAssetMode,
    geographyReview: pending, visualReview: pending, minimapStyleRevision: oldManifest.minimapStyleRevision,
    authorDisplayData: { ...oldManifest.authorDisplayData, status: pending }, assets: entries,
    specialtyCandidate: { status: 'PENDING-NOT-INSTALLED', baseRevision: BUILTIN_RESOURCES.world.revision, baseManifestSha256: inputs['web/' + prefix + 'manifest.json'], candidateSha256: sha(bytes) },
  };
  const resources = { ...BUILTIN_RESOURCES, world, catalogURL: nextPrefix + 'catalog.json', dataURL: nextPrefix + 'data.json', sourceURL: nextPrefix + 'game-source.json', sourceDigest: compiled.sourceDigest, geographyReview: pending };
  const author = structuredClone(rawSource);
  author.runtimeDataSha256 = sha(assets.get('data.json'));
  const authorBytes = encoded(author), authorManifest = parseBoundJSON(BUILTIN_ENTITY_SOURCE.manifestURL);
  authorManifest.runtimeDataSha256 = author.runtimeDataSha256;
  authorManifest.resource = { path: 'entity-source.json', sha256: sha(authorBytes), byteLength: authorBytes.length };
  const authorManifestBytes = encoded(authorManifest), authorPrefix = `content/builtin/authoring/entities-${sha(authorBytes)}/`;
  const authorDescriptor = { ...BUILTIN_ENTITY_SOURCE, resource: authorManifest.resource, runtimeDataSha256: author.runtimeDataSha256, manifestURL: authorPrefix + 'manifest.json', manifestSha256: sha(authorManifestBytes), manifestByteLength: authorManifestBytes.length, resourceURL: authorPrefix + 'entity-source.json' };
  const authorProbe = structuredClone(author);
  authorProbe.runtimeDataSha256 = rawSource.runtimeDataSha256;
  assert.deepEqual(authorProbe, rawSource, 'all original records and provenance remain unchanged');
  for (const [path, value] of assets) outputs.set('package/' + path, value);
  outputs.set('package/manifest.json', encoded(manifest));
  outputs.set('resources.json', encoded(resources));
  outputs.set('author-descriptor.json', encoded(authorDescriptor));
  outputs.set('author-input/entity-source.json', authorBytes);
  outputs.set('author-input/manifest.json', authorManifestBytes);
  runtime = { revision, alteredRoles, unchangedRoles: entries.length - alteredRoles.length, runtimeDataSha256: author.runtimeDataSha256, authorResourceSha256: sha(authorBytes) };
}
for (const [path, hash] of Object.entries({ ...inputs, ...tools })) assert.equal(sha(readFileSync(join(root, path))), hash, 'input drift before output');
const output = join(root, '.dragon-analysis/editor-phase', round);
mkdirSync(output); // Exclusive directory: do not overwrite or resume unknown artifacts.
if (runtimePackage) for (const path of ['package', 'package/chapters', 'author-input']) mkdirSync(join(output, path));
for (const [path, value] of outputs) writeFileSync(join(output, path), value, { flag: 'wx' });
const result = runtimePackage ? 'PASS-SPECIALTY-RUNTIME-CANDIDATE-NOT-INSTALLED' : 'PASS-SPECIALTY-SOURCE-CANDIDATE-NOT-INSTALLED';
const receipt = { result, inputs, tools, candidateSha256: sha(bytes), sourceDigest: compiled.sourceDigest, records: changes.length, nonzeroRecords: 5, unchangedOutsideLowBits: true, runtimePackageProduced: runtimePackage, runtime, artifacts: Object.fromEntries([...outputs].map(([path, value]) => [path, sha(value)])) };
writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(receipt) + '\n');
