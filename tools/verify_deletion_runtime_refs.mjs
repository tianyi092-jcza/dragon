// Synthetic transport indexes, owned memory read port. No game-rule, R2/cloud,
// physical cleanup or full reference-closure certificate.
import assert from 'node:assert/strict';
import { inspectRuntimeObjectReferences, inspectCatalogObjectReferences } from '../vps/deletion-runtime-refs.mjs';
import { publication, GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT, sha } from './fixtures/publication.mjs';
const first = publication(), second = publication(1), prefix = 'test/deletion-refs/';
const refs = [first, second].map(p => p.releases[0].runtime);
const stored = new Map([first, second].flatMap(p => p.files.map(f => [prefix + f.key, { bytes: Buffer.from(f.bytes), headers: { 'content-type': f.contentType } }])));
const reads = [];
const r2 = { async get(key, options) { reads.push([key, options]); const row = stored.get(key); return row && { ...row, bytes: Buffer.from(row.bytes) }; } };
const inspect = (runtimeReferences = refs, extra = {}) => inspectRuntimeObjectReferences({ r2, gameId: GAME, runtimeReferences, prefix, ...extra });
let checks = 0;
const before = JSON.stringify(refs), report = await inspect([...refs, refs[0]]);
assert.equal(report.scannedRuntimes, 2); assert.equal(reads.length, 2);
assert.equal(JSON.stringify(refs), before);
assert.equal(report.objects.filter(row => row.sharedLibrary).length, 2);
for (const row of report.objects.filter(row => row.sharedLibrary)) assert.equal(row.references.length, 2);
for (const key of ['resourceBodiesVerified', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(report[key], false);
assert.deepEqual(reads, refs.map(ref => [prefix + ref.key, { maxBytes: ref.byteLength }])); checks++;
for (const invalid of [{ ...refs[0], key: '../private' }, { ...refs[0], key: refs[0].key.replace(GAME, OTHER_GAME) }, { ...refs[0], byteLength: 0 }, { ...refs[0], extra: 'reference' }, { ...refs[0], sha256: '0'.repeat(64) }]) {
  reads.length = 0;
  await assert.rejects(inspect([refs[0], invalid]), /DELETE_RUNTIME_REFERENCE_INVALID/);
  assert.equal(reads.length, 0); checks++;
}
reads.length = 0;
const sparse = []; sparse.length = 1;
await assert.rejects(inspect(sparse), /DELETE_RUNTIME_REFERENCE_INVALID/);
assert.equal(reads.length, 0); checks++;
for (const extra of [{ maxRuntimes: 1 }, { prefix: 'private/' }, { maxReferences: 0 }]) {
  reads.length = 0; await assert.rejects(inspect(refs, extra), /DELETE_RUNTIME_REFERENCE_INVALID/);
  assert.equal(reads.length, 0); checks++;
}
await assert.rejects(inspect(refs, { maxReferences: 1 }), /DELETE_RUNTIME_REFERENCE_BUDGET/); checks++;
const key = prefix + refs[0].key, original = stored.get(key);
for (const changed of [undefined, { ...original, bytes: Buffer.from('bad') }, { ...original, headers: { 'content-type': 'text/html' } }, { ...original, headers: { 'content-type': 'application/json', 'Content-Type': 'application/json' } }]) {
  stored.set(key, changed); await assert.rejects(inspect([refs[0]]), /DELETE_RUNTIME_REFERENCE_INVALID/); checks++;
}
stored.set(key, original);
async function changedIndex(mutate, transform = text => text) {
  let index;
  try { index = JSON.parse(original.bytes); }
  catch (cause) { throw new Error('Invalid owned index fixture', { cause }); }
  mutate(index);
  const bytes = Buffer.from(transform(JSON.stringify(index))), digest = sha(bytes);
  const ref = { key: refs[0].key.replace(refs[0].sha256, digest), sha256: digest, byteLength: bytes.length };
  stored.set(prefix + ref.key, { bytes, headers: original.headers }); return ref;
}
for (const ref of [
  await changedIndex(index => { index.extra = { key: 'hidden-reference' }; }),
  await changedIndex(index => { index.resources.manifest.extra = 'hidden-reference'; }),
  await changedIndex(index => { index.resources.manifest.key = 'private/secret'; }),
  await changedIndex(() => {}, text => ' ' + text),
  await changedIndex(() => {}, text => text.replace('{', '{"version":1,')),
]) { await assert.rejects(inspect([ref]), /DELETE_RUNTIME_REFERENCE_INVALID|RUNTIME_CORRUPT/); checks++; }
const conflicting = await changedIndex(index => { index.resources['asset:0'].sha256 = '0'.repeat(64); });
await assert.rejects(inspect([refs[0], conflicting]), /DELETE_RUNTIME_REFERENCE_INVALID/); checks++;
// Inputs cannot be retargeted while the owned provider await is in progress.
const mutable = structuredClone(refs); let count = 0;
const captured = await inspect(mutable, { r2: { async get(address, options) {
  if (++count === 1) mutable[1].key = 'private/secret';
  return r2.get(address, options);
} } });
assert.equal(captured.scannedRuntimes, 2); checks++;
// Opt-in body verification never changes ownership or cleanup admission.
// Release files deliberately omit shared dependencies; stage those explicitly.
for (const [id, bytes] of [['0', PORTRAIT], ['p0001', TEMPLATE_PORTRAIT]]) stored.set(prefix + `kao/${id}.png`, { bytes: Buffer.from(bytes), headers: { 'content-type': 'image/png' } });
const totalBytes = report.objects.reduce((sum, row) => sum + row.byteLength, 0);
reads.length = 0;
const bodies = await inspect([...refs, refs[0]], { verifyBodies: true, maxBodyBytes: totalBytes });
assert.equal(bodies.resourceBodiesVerified, true); assert.equal(bodies.verifiedBodyBytes, totalBytes);
assert.equal(reads.length, report.objects.length);
assert.equal(new Set(reads.map(([address]) => address)).size, reads.length);
for (const field of ['exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(bodies[field], false);
assert.deepEqual(bodies.objects, report.objects); checks++;
for (const extra of [{ verifyBodies: 1 }, { maxBodyBytes: 0 }, { maxBodyBytes: 1073741825 }]) {
  reads.length = 0; await assert.rejects(inspect(refs, extra), /DELETE_RUNTIME_REFERENCE_INVALID/);
  assert.equal(reads.length, 0); checks++;
}
reads.length = 0;
await assert.rejects(inspect(refs, { verifyBodies: true, maxBodyBytes: 1 }), /DELETE_RUNTIME_BODY_BUDGET/);
assert.equal(reads.length, 0); checks++;
reads.length = 0;
await assert.rejects(inspect(refs, { verifyBodies: true, maxBodyBytes: totalBytes - 1 }), /DELETE_RUNTIME_BODY_BUDGET/);
assert.equal(reads.length, 2, 'body budget is checked before any non-index fetch'); checks++;
const shared = report.objects.find(row => row.sharedLibrary), sharedKey = prefix + shared.key, goodBody = stored.get(sharedKey);
for (const bad of [undefined, { ...goodBody, bytes: Buffer.alloc(shared.byteLength) }, { ...goodBody, bytes: Buffer.from('short') }, { ...goodBody, headers: { 'content-type': 'text/html' } }, { ...goodBody, headers: { 'content-type': shared.contentType, 'Content-Type': shared.contentType } }]) {
  stored.set(sharedKey, bad);
  await assert.rejects(inspect(refs, { verifyBodies: true }), /DELETE_RUNTIME_REFERENCE_INVALID/); checks++;
}
stored.set(sharedKey, goodBody);
assert.equal((await inspect(refs, { verifyBodies: true })).resourceBodiesVerified, true); checks++;
// Cross-game expansion consumes only captured index descriptors, not names or
// author-provided ownership claims. These are transport fixtures, not a ledger.
const other = publication(0, OTHER_GAME);
for (const file of other.files) stored.set(prefix + file.key, { bytes: Buffer.from(file.bytes), headers: { 'content-type': file.contentType } });
const catalog = [...refs.map(ref => ({ gameId: GAME, ...ref })), { gameId: OTHER_GAME, ...other.releases[0].runtime }];
const catalogBefore = JSON.stringify(catalog);
const inspectCatalog = (references = catalog, extra = {}) => inspectCatalogObjectReferences({ r2, catalogRuntimeReferences: references, prefix, ...extra });
reads.length = 0;
const cross = await inspectCatalog([...catalog, catalog[0]]);
assert.equal(cross.scannedGames, 2); assert.equal(cross.scannedRuntimes, 3); assert.equal(reads.length, 3);
assert.equal(JSON.stringify(catalog), catalogBefore);
const sharedRows = cross.objects.filter(row => row.sharedAcrossGames);
assert.equal(sharedRows.length, 2);
for (const row of sharedRows) {
  assert.equal(row.sharedLibrary, true); assert.deepEqual(row.gameIds, [GAME, OTHER_GAME]);
  assert.equal(row.references.length, 3); assert.deepEqual(new Set(row.references.map(ref => ref.gameId)), new Set([GAME, OTHER_GAME]));
}
for (const row of cross.objects.filter(row => !row.sharedAcrossGames)) assert.equal(row.gameIds.length, 1);
for (const field of ['resourceBodiesVerified', 'catalogCoverageProven', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(cross[field], false);
checks++;
for (const bad of [{ ...catalog[2], gameId: GAME }, { ...catalog[2], key: 'private/secret' }, { ...catalog[2], extra: 'unknown' }, null]) {
  reads.length = 0; await assert.rejects(inspectCatalog([catalog[0], bad]), /DELETE_RUNTIME_REFERENCE_INVALID/); assert.equal(reads.length, 0); checks++;
}
reads.length = 0;
await assert.rejects(inspectCatalog([catalog[0], { ...catalog[0], byteLength: catalog[0].byteLength + 1 }]), /DELETE_RUNTIME_REFERENCE_INVALID/);
assert.equal(reads.length, 0); checks++;
for (const extra of [{ maxRuntimes: 2 }, { maxReferences: 0 }, { prefix: 'private/' }]) {
  reads.length = 0; await assert.rejects(inspectCatalog(catalog, extra), /DELETE_RUNTIME_REFERENCE_INVALID/); assert.equal(reads.length, 0); checks++;
}
const edgeCount = cross.objects.reduce((sum, row) => sum + row.references.length, 0);
await assert.rejects(inspectCatalog(catalog, { maxReferences: edgeCount - 1 }), /DELETE_RUNTIME_REFERENCE_BUDGET/); checks++;
const late = structuredClone(catalog); let fetched = 0;
const lateReport = await inspectCatalog(late, { r2: { get(address, options) { if (++fetched === 1) late[2].key = 'private/secret'; return r2.get(address, options); } } });
assert.deepEqual(lateReport, cross); checks++;
let otherIndex;
try { otherIndex = JSON.parse(stored.get(prefix + catalog[2].key).bytes); } catch (cause) { throw new Error('invalid owned index', { cause }); }
Object.values(otherIndex.resources).find(asset => asset.key.startsWith('kao/')).sha256 = '0'.repeat(64);
const changedBytes = Buffer.from(JSON.stringify(otherIndex)), changedDigest = sha(changedBytes);
const changedRef = { ...catalog[2], key: catalog[2].key.replace(catalog[2].sha256, changedDigest), sha256: changedDigest, byteLength: changedBytes.length };
stored.set(prefix + changedRef.key, { bytes: changedBytes, headers: { 'content-type': 'application/json' } });
assert.equal((await inspectCatalog([changedRef])).scannedRuntimes, 1, 'changed index alone is structurally valid; conflict exists only across games');
await assert.rejects(inspectCatalog([catalog[0], changedRef]), /DELETE_RUNTIME_REFERENCE_INVALID/); checks++;
const otherKey = prefix + catalog[2].key, originalOther = stored.get(otherKey);
stored.delete(otherKey);
try { await assert.rejects(inspectCatalog(), /DELETE_RUNTIME_REFERENCE_INVALID/); } finally { stored.set(otherKey, originalOther); }
assert.deepEqual(await inspectCatalog(), cross); checks++;
reads.length = 0;
await assert.rejects(inspectCatalog(sparse), /DELETE_RUNTIME_REFERENCE_INVALID/); assert.equal(reads.length, 0); checks++;
reads.length = 0; const empty = await inspectCatalog([]);
assert.equal(empty.scannedGames, 0); assert.deepEqual(empty.objects, []); assert.equal(empty.catalogCoverageProven, false); assert.equal(empty.deleteAllowed, false); assert.equal(reads.length, 0); checks++;
// Opt-in cross-game body reads share a GLOBAL byte budget and fetch shared
// objects once, not once per referencing game or historical index.
const crossBytes = cross.objects.reduce((sum, row) => sum + row.byteLength, 0);
reads.length = 0;
const crossBodies = await inspectCatalog([...catalog, catalog[0]], { verifyBodies: true, maxBodyBytes: crossBytes });
assert.equal(crossBodies.resourceBodiesVerified, true); assert.equal(crossBodies.verifiedBodyBytes, crossBytes);
assert.deepEqual(crossBodies.objects, cross.objects);
assert.equal(reads.length, cross.objects.length); assert.equal(new Set(reads.map(([address]) => address)).size, reads.length);
for (const field of ['catalogCoverageProven', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(crossBodies[field], false);
checks++;
for (const extra of [{ verifyBodies: 1 }, { maxBodyBytes: 0 }, { maxBodyBytes: 1073741825 }]) {
  reads.length = 0; await assert.rejects(inspectCatalog(catalog, extra), /DELETE_RUNTIME_REFERENCE_INVALID/); assert.equal(reads.length, 0); checks++;
}
reads.length = 0;
await assert.rejects(inspectCatalog(catalog, { verifyBodies: true, maxBodyBytes: 1 }), /DELETE_RUNTIME_BODY_BUDGET/);
assert.equal(reads.length, 0); checks++;
reads.length = 0;
await assert.rejects(inspectCatalog(catalog, { verifyBodies: true, maxBodyBytes: crossBytes - 1 }), /DELETE_RUNTIME_BODY_BUDGET/);
assert.equal(reads.length, 3, 'global body budget rejects before fetching any non-index resource'); checks++;
for (const bad of [undefined, { ...goodBody, bytes: Buffer.alloc(shared.byteLength) }, { ...goodBody, bytes: Buffer.from('short') }, { ...goodBody, headers: { 'content-type': 'text/html' } }, { ...goodBody, headers: { 'content-type': shared.contentType, 'Content-Type': shared.contentType } }]) {
  stored.set(sharedKey, bad);
  try { await assert.rejects(inspectCatalog(catalog, { verifyBodies: true }), /DELETE_RUNTIME_REFERENCE_INVALID/); }
  finally { stored.set(sharedKey, goodBody); }
  checks++;
}
assert.equal((await inspectCatalog(catalog, { verifyBodies: true })).resourceBodiesVerified, true);
reads.length = 0; const emptyBodies = await inspectCatalog([], { verifyBodies: true });
assert.equal(emptyBodies.verifiedBodyBytes, 0); assert.equal(emptyBodies.catalogCoverageProven, false); assert.equal(emptyBodies.deleteAllowed, false); assert.equal(reads.length, 0); checks++;
// Recomputed hashes isolate manifest/index binding failures from transport
// corruption. These fixtures have no compiler or static-resource certificate.
async function mismatchedManifest(mutate, version = 3, gameId = OTHER_GAME) {
  const fixture = publication(version, gameId), reference = fixture.releases[0].runtime;
  for (const file of fixture.files) stored.set(prefix + file.key, { bytes: Buffer.from(file.bytes), headers: { 'content-type': file.contentType } });
  let index, manifest;
  try {
    index = JSON.parse(stored.get(prefix + reference.key).bytes);
    manifest = JSON.parse(stored.get(prefix + index.resources.manifest.key).bytes);
  } catch (cause) { throw new Error('invalid owned manifest fixture', { cause }); }
  mutate(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  stored.set(prefix + index.resources.manifest.key, { bytes, headers: { 'content-type': 'application/json' } });
  index.resources.manifest.sha256 = sha(bytes); index.resources.manifest.byteLength = bytes.length;
  const indexBytes = Buffer.from(JSON.stringify(index)), indexDigest = sha(indexBytes);
  const ref = { ...reference, key: reference.key.replace(reference.sha256, indexDigest), sha256: indexDigest, byteLength: indexBytes.length };
  stored.set(prefix + ref.key, { bytes: indexBytes, headers: { 'content-type': 'application/json' } });
  return ref;
}
for (const mutate of [
  manifest => { manifest.identity.gameId = GAME; },
  manifest => { manifest.identity.draftRevision = '999'; },
  manifest => { manifest.identity.sourceDigest = '0'.repeat(64); },
  manifest => { manifest.chapters = ['unrelated']; },
  manifest => { manifest.assets = []; },
  manifest => { manifest.portraits[0].sha256 = '0'.repeat(64); },
  manifest => { manifest.portraits[0].url = 'private/secret'; },
  manifest => { manifest.assets[0].url = '/unrelated'; },
]) {
  const ref = await mismatchedManifest(mutate), rows = [...catalog, { gameId: OTHER_GAME, ...ref }];
  assert.equal((await inspectCatalog(rows)).scannedRuntimes, 4);
  await assert.rejects(inspectCatalog(rows, { verifyBodies: true }), /DISTRIBUTION_RESOURCES/);
  await assert.rejects(inspectRuntimeObjectReferences({ r2, gameId: OTHER_GAME, runtimeReferences: [ref], prefix, verifyBodies: true }), /DISTRIBUTION_RESOURCES/);
  checks++;
}
assert.equal((await inspectCatalog(catalog, { verifyBodies: true })).manifestBindingsVerified, true);
assert.equal((await inspect()).manifestBindingsVerified, false);
checks++;
function visualDeclarations() {
  return Object.fromEntries([['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']].map(([group, stem]) => [group, Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => {
    const path = `content/builtin/compiled/owned-static/${stem}${season}.png`;
    return [season, { path, url: path, sha256: 'a'.repeat(64), byteLength: 17 }];
  }))]));
}
const visualG = await mismatchedManifest(manifest => { manifest.visualAssets = visualDeclarations(); }, 4, GAME);
const visualH = await mismatchedManifest(manifest => { manifest.visualAssets = visualDeclarations(); }, 4, OTHER_GAME);
const visualRows = [{ gameId: GAME, ...visualG }, { gameId: OTHER_GAME, ...visualH }];
reads.length = 0;
const visuals = await inspectCatalog(visualRows, { verifyBodies: true });
assert.equal(visuals.staticVisualReferences.length, 8);
for (const row of visuals.staticVisualReferences) {
  assert.equal(row.sha256, 'a'.repeat(64)); assert.equal(row.byteLength, 17);
  assert.deepEqual(row.references.map(ref => ref.gameId), [GAME, OTHER_GAME]);
  assert.equal(new Set(row.references.map(ref => ref.role)).size, 1);
  assert.equal(Object.hasOwn(row, 'key'), false, 'a static path is not an archive object key');
}
assert.equal(visuals.staticProgramBindingProven, false); assert.equal(visuals.staticResourceBodiesVerified, false); assert.equal(visuals.deleteAllowed, false);
assert.equal(reads.length, visuals.objects.length); assert.ok(reads.every(([key]) => !key.includes('/content/builtin/'))); checks++;
const indexOnly = await inspectCatalog(visualRows);
assert.equal(indexOnly.staticVisualReferences, null);
assert.deepEqual((await inspectCatalog(catalog, { verifyBodies: true })).staticVisualReferences, []); checks++;
const declaredEdges = visuals.objects.reduce((sum, row) => sum + row.references.length, 0) + 16;
await inspectCatalog(visualRows, { verifyBodies: true, maxReferences: declaredEdges });
await assert.rejects(inspectCatalog(visualRows, { verifyBodies: true, maxReferences: declaredEdges - 1 }), /DELETE_RUNTIME_REFERENCE_BUDGET/); checks++;
visuals.staticVisualReferences[0].path = 'mutated'; visuals.staticVisualReferences[0].references[0].gameId = 'mutated';
const freshVisuals = await inspectCatalog(visualRows, { verifyBodies: true });
assert.notEqual(freshVisuals.staticVisualReferences[0].path, 'mutated'); assert.equal(freshVisuals.staticVisualReferences[0].references[0].gameId, GAME); checks++;
const variant = await mismatchedManifest(manifest => { manifest.visualAssets = visualDeclarations(); manifest.visualAssets.seasons.spring.sha256 = 'b'.repeat(64); }, 5);
const variants = await inspectCatalog([...visualRows, { gameId: OTHER_GAME, ...variant }], { verifyBodies: true });
assert.equal(variants.staticVisualReferences.length, 9, 'same path/different program bytes are separate declarations, not an assumed global conflict');
assert.equal(variants.staticVisualReferences.filter(row => row.path.endsWith('/map_tiles_spring.png')).length, 2); checks++;
for (const mutate of [
  manifest => { delete manifest.visualAssets.seasons.spring; },
  manifest => { manifest.visualAssets.seasons.spring.url = 'https://outside.invalid/image.png'; },
  manifest => { manifest.visualAssets.seasons.spring.byteLength = 0; },
  manifest => { manifest.visualAssets.seasons.spring.sha256 = 'invalid'; },
  manifest => { manifest.visualAssets.seasons.extra = {}; },
]) {
  const ref = await mismatchedManifest(manifest => { manifest.visualAssets = visualDeclarations(); mutate(manifest); }, 6);
  await assert.rejects(inspectCatalog([{ gameId: OTHER_GAME, ...ref }], { verifyBodies: true }), /STATIC_VISUAL_BINDING/); checks++;
}
process.stdout.write(`deletion runtime references: ${checks} checks; optional bounded body checks and observed cross-game references, cleanup disabled\n`);
