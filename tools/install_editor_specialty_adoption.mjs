// Fixed local specialty-low adoption with single coherent tuple switch.
// Enforces executable diff contract, generates formal certificate, performs
// local atomic adoption. No saves/drafts migration, no compat dispatch,
// no production registration, no commit/push/deploy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { decodeEntitySource } from '../web/src/editor/entitysource.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { readInstalledEntitySource } from './editor_entity_source.mjs';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { installCoherentBuiltinRelease, RELEASE_WRAPPERS } from './atomic_builtin_release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [first, second] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
assert.equal(first, 'specialty-runtime-20261029-r1');
assert.equal(second, 'specialty-runtime-20261029-r2');

const sha = b => createHash('sha256').update(b).digest('hex');
const inputs = {};
function read(p) {
  assert.ok(!/save\.dat/i.test(p));
  const bytes = readFileSync(join(root, p));
  inputs[p] = sha(bytes);
  return bytes;
}
function json(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (cause) { throw new TypeError('invalid specialty install proof', { cause }); }
}

// Fixed parent / candidate identities (executable contract, not generic).
const PARENT_REVISION = 'map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23';
const PARENT_SOURCE = '87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1';
const PARENT_MANIFEST_SHA = 'bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9';
const CAND_REVISION = 'map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe';
const CAND_SOURCE = '19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b';
const EXPECTED_ALTERED = ['world-definition.json','chapters/upper-1.json','chapters/upper-2.json','chapters/upper-3.json','chapters/upper-4.json','chapters/middle-1.json','chapters/middle-2.json','chapters/middle-3.json','chapters/middle-4.json','chapters/lower-1.json','chapters/lower-2.json','chapters/lower-3.json','chapters/lower-4.json','chapters/later-1.json','chapters/later-2.json','chapters/later-3.json','chapters/later-4.json','chapters/original-1.json','chapters/original-2.json','chapters/original-3.json','chapters/original-4.json','catalog.json','data.json','game-source.json'];
const EXPECTED_UNCHANGED_COUNT = 14;
const EXPECTED_NONZERO = [
  { chapterIndex: 2, slot: 30 },
  { chapterIndex: 5, slot: 27 },
  { chapterIndex: 5, slot: 108 },
  { chapterIndex: 6, slot: 108 },
  { chapterIndex: 10, slot: 29 },
];

// Current default must still be parent; never follow latest or overwrite unknown release.
assert.equal(BUILTIN_RESOURCES.world.revision, PARENT_REVISION);
assert.equal(BUILTIN_RESOURCES.sourceDigest, PARENT_SOURCE);

const base = '.dragon-analysis/editor-phase/';
const a = json(read(base + first + '/receipt.json'));
const b = json(read(base + second + '/receipt.json'));
assert.deepEqual(a, b);
assert.equal(a.result, 'PASS-SPECIALTY-RUNTIME-CANDIDATE-NOT-INSTALLED');
assert.equal(a.runtimePackageProduced, true);
assert.equal(a.runtime.revision, CAND_REVISION);
assert.equal(a.sourceDigest, CAND_SOURCE);
assert.deepEqual([...a.runtime.alteredRoles].sort(), [...EXPECTED_ALTERED].sort());
assert.equal(a.runtime.alteredRoles.length, 24);
assert.equal(a.runtime.unchangedRoles, EXPECTED_UNCHANGED_COUNT);

// Candidate package identities.
const manifest = json(read(base + first + '/package/manifest.json'));
const resources = json(read(base + first + '/resources.json'));
const candidateSource = json(read(base + first + '/package/game-source.json'));
const candidateData = json(read(base + first + '/package/data.json'));
const catalog = json(read(base + first + '/package/catalog.json'));
assert.equal(manifest.worldRevision, CAND_REVISION);
assert.equal(manifest.contentRevision, CAND_REVISION);
assert.equal(manifest.sourceDigest, CAND_SOURCE);
assert.equal(resources.sourceDigest, CAND_SOURCE);
assert.equal(manifest.geographyReview, 'PENDING-SPECIALTY-DELTA');
assert.equal(manifest.visualReview, 'PENDING-SPECIALTY-DELTA');
assert.equal(manifest.authorDisplayData.status, 'PENDING-SPECIALTY-DELTA');
assert.equal(Object.hasOwn(manifest, 'displayAcceptance'), false);
assert.equal(Object.hasOwn(manifest, 'displayAcceptanceInheritance'), false);

// Old source / manifest / assets.
const oldPrefix = `content/builtin/compiled/${PARENT_REVISION}/`;
const oldManifest = json(read('web/' + oldPrefix + 'manifest.json'));
assert.equal(sha(read('web/' + oldPrefix + 'manifest.json')), PARENT_MANIFEST_SHA);
assert.equal(oldManifest.sourceDigest, PARENT_SOURCE);
const oldSource = json(read('web/' + oldPrefix + 'game-source.json'));
const oldData = json(read('web/' + oldPrefix + 'data.json'));
const oldBytes = new Map(oldManifest.assets.map(e => [e.path, read('web/' + e.url)]));

// 24 altered / 14 unchanged enforced by exact bytes, not by name list alone.
const newAssets = new Map(manifest.assets.map(e => [e.path, read(base + first + '/package/' + e.path)]));
assert.equal(manifest.assets.length, 38);
for (const entry of manifest.assets) {
  assert.equal(entry.url, `content/builtin/compiled/${CAND_REVISION}/` + entry.path);
  const bytes = newAssets.get(entry.path);
  assert.equal(bytes.length, entry.byteLength);
  assert.equal(sha(bytes), entry.sha256, entry.path);
}
let unchanged = 0;
for (const entry of oldManifest.assets) {
  if (a.runtime.alteredRoles.includes(entry.path)) continue;
  assert.deepEqual(newAssets.get(entry.path), oldBytes.get(entry.path), 'map resource must stay byte-identical: ' + entry.path);
  unchanged++;
}
assert.equal(unchanged, EXPECTED_UNCHANGED_COUNT);

// Low-bit diff contract: only specialty_low_bits added, 2560 records, 5 nonzero,
// delete-field deepEqual old source, raw General32 reconstruction.
const oldAuthor = await readInstalledEntitySource(url => read('web/' + url));
assert.equal(oldAuthor.chapters.length, 20);
let records = 0;
const nonzero = [];
for (const [chapterIndex, id] of candidateSource.chapterOrder.entries()) {
  assert.equal(catalog.chapters[chapterIndex].id, id);
  assert.deepEqual(candidateData.scenarios[chapterIndex], candidateSource.chapters[id].state);
  for (const [slot, general] of candidateSource.chapters[id].state.generals.entries()) {
    const raw = Buffer.from(oldAuthor.chapters[chapterIndex].general32[slot], 'hex');
    assert.equal(raw.length, 32);
    const low = [0x0e, 0x0f, 0x10].map(o => (raw[o] & 15).toString(16)).join('');
    assert.equal(general.specialty_low_bits, low, `${id}#${slot}`);
    for (const [offset, field] of [[0x0e, 'siege'], [0x0f, 'field'], [0x10, 'naval']]) {
      assert.equal(general.ability[field], raw[offset] >>> 4, 'high bits must match bound raw');
      assert.equal((general.ability[field] << 4) | Number.parseInt(low[offset - 0x0e], 16), raw[offset]);
    }
    if (low !== '000') nonzero.push({ chapterIndex, slot, lowBits: low });
    records++;
  }
}
assert.equal(records, 2560);
assert.deepEqual(nonzero.map(({ chapterIndex, slot }) => ({ chapterIndex, slot })), EXPECTED_NONZERO);
assert.equal(nonzero.length, 5);
const probe = structuredClone(candidateSource);
for (const id of probe.chapterOrder) for (const g of probe.chapters[id].state.generals) delete g.specialty_low_bits;
assert.deepEqual(probe, oldSource);
const dataProbe = structuredClone(candidateData);
dataProbe.scenarios = probe.chapterOrder.map(id => probe.chapters[id].state);
assert.deepEqual(dataProbe, oldData);

// Compile contract: new sourceDigest must equal canonicalDigest and compiled sourceDigest.
const compiled = compileGameSource(candidateSource, sha);
assert.equal(compiled.sourceDigest, CAND_SOURCE);
assert.equal(compiled.sourceDigest, canonicalDigest(candidateSource, sha));
assert.deepEqual(Buffer.from(compiled.terrainBytes), oldBytes.get('terrain.bin'));
assert.deepEqual(compiled.roadGraph, json(oldBytes.get('roads.json')));
assert.deepEqual(Buffer.from(compiled.roadCost), oldBytes.get('road_cost.bin'));
assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), oldBytes.get('road_offset.json'));

// Author input: only runtimeDataSHA changes; all original record bytes preserved.
const descriptor = json(read(base + first + '/author-descriptor.json'));
const authorManifestBytes = read(base + first + '/author-input/manifest.json');
const authorManifest = json(authorManifestBytes);
const authorBody = read(base + first + '/author-input/entity-source.json');
assert.equal(descriptor.runtimeDataSha256, sha(newAssets.get('data.json')));
assert.equal(descriptor.manifestSha256, sha(authorManifestBytes));
const author = await decodeEntitySource(authorManifest, authorBody, descriptor, sha);
const probeAuthor = structuredClone(author);
probeAuthor.runtimeDataSha256 = oldAuthor.runtimeDataSha256;
assert.deepEqual(probeAuthor, oldAuthor);

// Formal certificate: frozen product of this contract, not the PENDING candidate manifest SHA.
const contractBytes = read('docs/editor-specialty-adoption-contract.md');
const certificate = {
  schema: 'specialty-adoption-certificate-1',
  contractSha256: sha(contractBytes),
  parent: { revision: PARENT_REVISION, sourceDigest: PARENT_SOURCE, manifestSha256: PARENT_MANIFEST_SHA },
  candidate: {
    revision: CAND_REVISION, sourceDigest: CAND_SOURCE,
    runtimeDataSha256: sha(newAssets.get('data.json')),
    authorResourceSha256: sha(authorBody),
    alteredRoles: [...EXPECTED_ALTERED].sort(), unchangedRoles: EXPECTED_UNCHANGED_COUNT,
    records, nonzero,
  },
  verification: {
    candidateReceiptSha256: sha(read(base + first + '/receipt.json')),
    verifyTool: 'tools/verify_editor_specialty_candidate.mjs',
    compileSourceDigest: compiled.sourceDigest,
  },
  limits: 'Local specialty-low adoption only. No ability editing, no event-tail completion, no old-copy migration, no compat dispatch, no production registration, no commit/push/deploy. Old copies are deleted after ownership/reference checks; shared resources are never deleted.',
};

// Release assembly: same single coherent tuple switch point as date adoption.
const release = {
  schemaVersion: 1,
  resources: {
    catalogURL: `content/builtin/compiled/${CAND_REVISION}/catalog.json`,
    dataURL: `content/builtin/compiled/${CAND_REVISION}/data.json`,
    world: json(newAssets.get('world-definition.json')),
    sourceURL: `content/builtin/compiled/${CAND_REVISION}/game-source.json`,
    sourceDigest: CAND_SOURCE,
    geographyReview: 'APPROVED',
  },
  entitySource: descriptor,
};
// New release carries APPROVED geography only via formal certificate, not via PENDING candidate manifest.
assert.equal(release.resources.world.revision, CAND_REVISION);
assert.equal(release.resources.sourceDigest, CAND_SOURCE);

const moduleBytes = value => Buffer.from('// Generated coherent resources/author-input tuple. One atomic switch point.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RELEASE = freeze(' + JSON.stringify(value) + ');\n');
const newModuleBytes = moduleBytes(release);
// Base module bytes must equal current generated file (parent tuple).
const currentReleaseModule = read('web/src/content/builtinrelease.generated.js');
let baseRelease;
try {
  const releaseText = currentReleaseModule.toString('utf8');
  const freezeStart = releaseText.lastIndexOf('freeze(');
  const freezeEnd = releaseText.lastIndexOf(');');
  assert.ok(freezeStart >= 0 && freezeEnd > freezeStart);
  baseRelease = JSON.parse(releaseText.slice(freezeStart + 7, freezeEnd));
} catch (cause) { throw new TypeError('invalid current builtin release module', { cause }); }
assert.equal(baseRelease.resources.world.revision, PARENT_REVISION);
assert.equal(baseRelease.resources.sourceDigest, PARENT_SOURCE);
const baseModuleBytes = moduleBytes(baseRelease);
assert.deepEqual(currentReleaseModule, baseModuleBytes, 'current release module must match parent tuple before switch');

// Final manifest carries APPROVED geography only via formal certificate, not via PENDING candidate manifest.
const finalManifest = { ...manifest, geographyReview: 'APPROVED', visualReview: 'APPROVED', authorDisplayData: { ...manifest.authorDisplayData, status: 'APPROVED' }, specialtyAdoption: certificate };
const finalManifestBytes = Buffer.from(JSON.stringify(finalManifest) + String.fromCharCode(10));
assert.equal(finalManifest.worldRevision, CAND_REVISION);
assert.equal(finalManifest.contentRevision, CAND_REVISION);
assert.equal(finalManifest.sourceDigest, CAND_SOURCE);
assert.equal(finalManifest.assets.length, 38);

// Pre-switch read of new tuple through trusted reader (fail-closed before install).
const observed = readInstalledEditorSource(release.resources, url => {
  const prefix = `content/builtin/compiled/${CAND_REVISION}/`;
  assert.ok(url.startsWith(prefix) || url === descriptor.manifestURL || url === descriptor.resourceURL);
  if (url === prefix + 'manifest.json') return finalManifestBytes;
  if (url === descriptor.manifestURL) return authorManifestBytes;
  if (url === descriptor.resourceURL) return authorBody;
  const p = url.slice(prefix.length);
  assert.ok(newAssets.has(p), 'undeclared new role: ' + p);
  return newAssets.get(p);
});
assert.equal(observed.revision, CAND_REVISION);

// Input stability before controlled install.
for (const [p, h] of Object.entries(inputs)) assert.equal(sha(readFileSync(join(root, p))), h, 'input drift before install: ' + p);

const authorPrefix = `content/builtin/authoring/entities-${sha(authorBody)}/`;
assert.equal(descriptor.manifestURL, authorPrefix + 'manifest.json');
assert.equal(descriptor.resourceURL, authorPrefix + 'entity-source.json');
const installed = installCoherentBuiltinRelease(join(root, 'web'), {
  baseModuleBytes,
  newModuleBytes,
  assets: [...newAssets].map(([p, bytes]) => ({ path: `content/builtin/compiled/${CAND_REVISION}/` + p, bytes })).concat([
    { path: `content/builtin/compiled/${CAND_REVISION}/manifest.json`, bytes: finalManifestBytes },
    { path: authorPrefix + 'entity-source.json', bytes: authorBody },
    { path: authorPrefix + 'manifest.json', bytes: authorManifestBytes },
  ]),
  previousWrapperSha256: Object.fromEntries(Object.keys(RELEASE_WRAPPERS).map(p => [p, sha(read('web/' + p))])),
});

for (const [p, h] of Object.entries(inputs)) {
  if (p.startsWith('web/src/content/builtinrelease.generated.js')) continue;
  if (Object.hasOwn(RELEASE_WRAPPERS, p.slice(4))) continue;
  assert.equal(sha(readFileSync(join(root, p))), h, 'immutable input changed: ' + p);
}

process.stdout.write(JSON.stringify({
  result: installed.result,
  certificate,
  revision: CAND_REVISION,
  sourceDigest: CAND_SOURCE,
  authorResourceSha256: sha(authorBody),
  preservedParentForAudit: PARENT_REVISION,
  inputs,
  toolHashes: Object.fromEntries(
    ['tools/install_editor_specialty_adoption.mjs', 'tools/atomic_builtin_release.mjs', 'tools/stage_editor_specialty_candidate.mjs', 'tools/verify_editor_specialty_candidate.mjs'].map(p => [p, sha(read(p))]),
  ),
  limits: 'Local coherent defaults switch only. Old game copies are deleted after ownership/reference checks, never migrated; no compat dispatch, no production registration, no commit/push/deploy.',
}) + '\n');
