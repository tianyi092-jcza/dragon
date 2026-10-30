// No I/O beyond module loading; owned DTOs, no credentials or game rules.
import assert from 'node:assert/strict';
import { MAX_METADATA_BYTES, MAX_RESOURCE_BYTES, isChapterId, isId, parseJSON, validateIndex } from '../reader/runtimecontract.js';
import { buildRuntimeIndex } from '../vps/runtime-index.mjs';
import { signR2 } from '../vps/r2sign.mjs';
import { issueAdmission, verifyAdmission } from '../reader/admission.js';
import { buildPayload, uploadRelease } from '../vps/publish_to_r2.mjs';
import { publication, OTHER_GAME, sha } from './fixtures/publication.mjs';
import { GamePortraits, collectPortraitIds } from '../server/portraits.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
let n = 0;
const payload = publication(), reference = payload.releases[0].runtime;
const indexBytes = payload.files.find(file => file.key === reference.key).bytes;
const fresh = () => parseJSON(indexBytes);
const reject = (label, mutate) => {
  const index = fresh(); mutate(index);
  assert.throws(() => validateIndex(index), /RUNTIME_CORRUPT/, label); n++;
};
assert.equal(validateIndex(fresh()).ordinal, '1.0'); n++;
reject('another game namespace', index => { index.resources['asset:terrain'].key = index.resources['asset:terrain'].key.replace(index.gameId, OTHER_GAME); });
reject('another ordinal namespace', index => { index.resources.manifest.key = index.resources.manifest.key.replace('/1.0/', '/1.1/'); });
reject('private path', index => { index.resources.manifest.key = 'private/source.json'; });
reject('absolute remote URL', index => { index.resources['asset:0'].key = 'https://owned.invalid/private'; });
reject('path traversal', index => { index.resources['asset:0'].key = 'kao/../private'; });
reject('executable MIME', index => { index.resources.manifest.contentType = 'text/html'; });
reject('wrong shared library MIME', index => { index.resources['asset:0'].contentType = 'image/svg+xml'; });
reject('template role cannot alias a numeric portrait', index => { index.resources['asset:p0001'].key = 'kao/0.png'; });
for (const id of ['p', 'P0001', 'pp0001', 'p0000000', 'p0001.png', 'p/0001', '../p0001', 'p0001?x', 'p0001#x', 'p%30', 'p0001\\x']) {
  reject(`unsafe template identifier ${id}`, index => {
    index.resources[`asset:${id}`] = { ...index.resources['asset:p0001'], key: `kao/${id}.png` };
  });
}
reject('oversized metadata', index => { index.resources.manifest.byteLength = MAX_METADATA_BYTES + 1; });
reject('oversized bytes', index => { index.resources['asset:terrain'].byteLength = MAX_RESOURCE_BYTES + 1; });
reject('fractional length', index => { index.resources.manifest.byteLength = 1.5; });
reject('digest array coercion', index => { index.resources.manifest.sha256 = [index.resources.manifest.sha256]; });
reject('missing chapter', index => { delete index.resources['chapter:c1']; });
reject('duplicate chapter', index => { index.chapters.push('c1'); });
reject('unlisted role', index => { index.resources.source = index.resources.manifest; });
reject('unsafe chapter identifier', index => { index.chapters[0] = '../source'; });
reject('unsafe release identifier', index => { index.releaseId = '../source'; });
reject('invalid formal ordinal', index => { index.ordinal = '1.01'; });
for (const bytes of [Buffer.from('{'), Uint8Array.from([34, 255, 34])]) { assert.throws(() => parseJSON(bytes), /RUNTIME_CORRUPT/); n++; }
for (const prefix of ['private/', 'test/x/../', 'test/', ['test/x/'], null]) {
  assert.throws(() => buildPayload(null, { prefix }), /publication prefix invalid/);
  await assert.rejects(() => uploadRelease(null, prefix, null, null), /publication prefix invalid/); n++;
}
const pin = payload.directory[0], release = payload.releases[0];
const manifestFile = payload.files.find(file => file.key.endsWith('/manifest.json'));
const pack = { revision: pin.revision, source_digest: pin.sourceDigest, manifest_json: manifestFile.bytes.toString('utf8') };
const chapters = pin.chapters.map(chapter_id => ({ chapter_id, state_json: payload.files.find(file => file.key.endsWith(`/chapters/${chapter_id}.json`)).bytes.toString('utf8') }));
const assetFile = payload.files.find(file => file.contentType === 'application/octet-stream');
const ref = fresh().resources['asset:terrain'];
const assets = [{ asset_id: 'terrain', sha256: ref.sha256, byte_length: ref.byteLength, bytes: assetFile.bytes }];
const build = (p = pack, c = chapters, a = assets, r = release) => buildRuntimeIndex(pin, r, p, c, a);
assert.deepEqual(build().reference, reference); n++;
// SQL cursors and prepared arrays may enumerate the same rows differently.
// Their ordering must not select different immutable runtime descriptors.
const orderedManifest = parseJSON(manifestFile.bytes), graphBytes = Buffer.from('{}');
const graphAsset = { asset_id: 'roadGraph', sha256: sha(graphBytes), byte_length: graphBytes.length, bytes: graphBytes };
orderedManifest.assets.push({ assetId: graphAsset.asset_id, sha256: graphAsset.sha256, byteLength: graphAsset.byte_length, url: `/api/trial-asset?game=${pin.gameId}&revision=${pin.revision}&digest=${pin.sourceDigest}&asset=roadGraph` });
const orderedPack = { ...pack, manifest_json: JSON.stringify(orderedManifest) }, orderedAssets = [...assets, graphAsset];
const ordered = build(orderedPack, chapters, orderedAssets);
const orderedFiles = value => value.files.map(file => [file.key, Buffer.from(file.bytes).toString('hex'), file.contentType]).sort(([a], [b]) => { if (a < b) return -1; if (a > b) return 1; return 0; });
for (const cs of [chapters, chapters.toReversed()]) for (const as of [orderedAssets, orderedAssets.toReversed()]) {
  const reordered = build(orderedPack, cs, as);
  assert.deepEqual(reordered.reference, ordered.reference, 'identical rows must retain the descriptor SHA/key');
  assert.deepEqual(orderedFiles(reordered), orderedFiles(ordered), 'raw manifest/chapter/asset bytes must not be rewritten');
  assert.deepEqual(reordered.dependencies, ordered.dependencies);
}
const orderedIndex = parseJSON(ordered.files.find(file => file.key === ordered.reference.key).bytes);
assert.deepEqual(Object.keys(orderedIndex.resources), Object.keys(orderedIndex.resources).sort());
assert.deepEqual(orderedIndex.chapters, pin.chapters, 'semantic chapter order is not canonicalized away'); n++;
const portraitLibrary = new GamePortraits();
const generalReferences = [{ portrait: 1, portraitKey: '2' }, { portrait: 0, portraitKey: null }, {}];
assert.deepEqual(collectPortraitIds(generalReferences), [1, '2', 0]);
assert.deepEqual(generalReferences, [{ portrait: 1, portraitKey: '2' }, { portrait: 0, portraitKey: null }, {}]); n++;
for (const invalid of [null, undefined, false, {}, [null], [[]], [{ portrait: null }], [{ portrait: '1' }], [{ portrait: -0 }], [{ portrait: 1.5 }], [{ portrait: NaN }], [{ portraitKey: false }], [{ portraitKey: undefined }], [{ portraitKey: ['1'] }]]) {
  assert.throws(() => collectPortraitIds(invalid), error => error.code === 'PLAY_PORTRAIT_CORRUPT'); n++;
}
assert.deepEqual(portraitLibrary.forPublish(collectPortraitIds(generalReferences)), [portraitLibrary.get('1'), portraitLibrary.get('2'), portraitLibrary.get('0')]); n++;
for (const invalid of [null, undefined, false, true, {}, [], ['1'], NaN, Infinity, -1, -0, 1.5, 1n]) {
  assert.throws(() => portraitLibrary.forPublish(['1', invalid]), error => error.code === 'PLAY_PORTRAIT_CORRUPT', 'invalid references must not disappear from the dependency list'); n++;
}
for (const general of [{ idx: 0, portrait: 255 }, { idx: 126, portrait: 255 }, { portrait: 255 }, { idx: '127', portrait: 255 }, { idx: 0, portrait: 255, portraitKey: '1' }, { idx: 127, portrait: 255, portraitKey: '255' }]) {
  assert.throws(() => collectPortraitIds([general]), error => error.code === 'PLAY_PORTRAIT_CORRUPT'); n++;
}
const sentinelReferences = [{ idx: 127, portrait: 255, portraitKey: '1' }];
assert.deepEqual(collectPortraitIds(sentinelReferences), [255, '1']);
assert.deepEqual(portraitLibrary.forPublish(collectPortraitIds(sentinelReferences)), [portraitLibrary.get('1')]);
assert.deepEqual(sentinelReferences, [{ idx: 127, portrait: 255, portraitKey: '1' }]); n++;
const portraitIds = [1, '1', '2', 2];
assert.deepEqual(portraitLibrary.forPublish(portraitIds), [portraitLibrary.get('1'), portraitLibrary.get('2')]);
assert.deepEqual(portraitIds, [1, '1', '2', 2]); n++;
assert.throws(() => portraitLibrary.forPublish(['missing']), error => error.code === 'PORTRAIT_NOT_FOUND'); n++;
const allPortraits = portraitLibrary.forPublish(KAO_MANIFEST.map(entry => entry.id));
const allManifest = parseJSON(manifestFile.bytes);
allManifest.portraits = allPortraits.map(entry => ({ ...entry, role: 'game-portrait', url: `kao/${entry.assetId}.png` }));
const allBuilt = build({ ...pack, manifest_json: JSON.stringify(allManifest) });
const allIndex = validateIndex(parseJSON(allBuilt.files.find(file => file.key === allBuilt.reference.key).bytes));
assert.equal(allBuilt.dependencies.length, KAO_MANIFEST.length);
for (const entry of KAO_MANIFEST) {
  assert.deepEqual(allIndex.resources[`asset:${entry.id}`], { key: `kao/${entry.id}.png`, sha256: entry.sha256, byteLength: entry.bytes, contentType: 'image/png' });
}
n++; // Actual current catalog metadata, not just a permissive regex fixture.
for (const id of ['../private', 'P0001', 'p0001.png']) {
  const manifest = parseJSON(manifestFile.bytes);
  manifest.portraits[1].assetId = id; manifest.portraits[1].url = `kao/${id}.png`;
  assert.throws(() => build({ ...pack, manifest_json: JSON.stringify(manifest) }), /RUNTIME_CORRUPT/); n++;
}
assert.throws(() => build({ ...pack, revision: '2' }), /RUNTIME_CORRUPT/); n++;
assert.throws(() => build(pack, chapters.slice(1)), /RUNTIME_CORRUPT/); n++;
assert.throws(() => build(pack, [chapters[0], chapters[0]]), /RUNTIME_CORRUPT/); n++;
assert.throws(() => build(pack, chapters, [{ ...assets[0], bytes: Buffer.from('corrupt') }]), /asset corrupt/); n++;
assert.throws(() => build(pack, chapters, assets, { ...release, draft_revision: '2' }), /RUNTIME_CORRUPT/); n++;
const badManifest = parseJSON(manifestFile.bytes);
badManifest.assets[0].url = 'https://owned.invalid/source';
assert.throws(() => build({ ...pack, manifest_json: JSON.stringify(badManifest) }), /RUNTIME_CORRUPT/); n++;
const scopedId = `${pin.gameId}#upper-1`, scoped = publication(0, pin.gameId, [scopedId, `${pin.gameId}#copy-21`]);
const scopedRef = scoped.releases[0].runtime, scopedIndex = validateIndex(parseJSON(scoped.files.find(file => file.key === scopedRef.key).bytes));
assert.equal(isChapterId(scopedId, pin.gameId), true);
assert.equal(isId(scopedId), false, 'release/key IDs are not broadened');
assert.equal(isChapterId(scopedId, OTHER_GAME), false);
const scopedKey = scopedIndex.resources[`chapter:${scopedId}`].key;
assert.ok(scopedKey.endsWith(`/chapters/${scopedId}.json`)); n++;
for (const bad of [`${OTHER_GAME}#upper-1`, `${pin.gameId}#`, `${pin.gameId}#a#b`, `${pin.gameId}#/a`, `${pin.gameId}#../a`, `${pin.gameId}#a\\b`, `${pin.gameId}#a?b`, `${pin.gameId}%23upper-1`, `${pin.gameId}#%2f`, `${pin.gameId}#a\n`, `${pin.gameId}#${'a'.repeat(101)}`]) {
  assert.equal(isChapterId(bad, pin.gameId), false);
  assert.throws(() => publication(0, pin.gameId, [bad]), /RUNTIME_CORRUPT/); n++;
}
for (const alias of [scopedKey.replace('#', '%23'), scopedKey.replace('#', '%2523'), scopedKey.replace(pin.gameId + '#', OTHER_GAME + '#')]) {
  const changed = structuredClone(scopedIndex); changed.resources[`chapter:${scopedId}`].key = alias;
  assert.throws(() => validateIndex(changed), /RUNTIME_CORRUPT/); n++;
}
const wire = signR2({ accountId: '0'.repeat(32), accessKeyId: 'owned', secretAccessKey: 'owned-secret', method: 'GET', key: `owned-bucket/${scopedKey}`, now: new Date('2030-01-01T00:00:00.000Z') });
assert.equal(wire.path, `/owned-bucket/${scopedKey.replace('#', '%23')}`);
let wireURL;
try { wireURL = new URL(`https://${wire.host}${wire.path}`); }
catch (cause) { throw new Error('invalid signed fixture URL', { cause }); }
assert.equal(wireURL.hash, '');
assert.equal(decodeURIComponent(wire.path), `/owned-bucket/${scopedKey}`); n++;
const env = { PLAYER_ORIGIN: 'https://owned.invalid', PLAYER_ADMISSION_ACTIVE_KEY: 'owned', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned: '11'.repeat(32) }) };
const signed = await issueAdmission(env, env.PLAYER_ORIGIN, scopedIndex, scopedId, scopedRef);
assert.equal((await verifyAdmission(env, env.PLAYER_ORIGIN, signed)).chapterId, scopedId);
await assert.rejects(issueAdmission(env, env.PLAYER_ORIGIN, scopedIndex, `${OTHER_GAME}#upper-1`, scopedRef), /ADMISSION_INVALID/);
await assert.rejects(issueAdmission({ ...env, PLAYER_ADMISSION_ACTIVE_KEY: scopedId, PLAYER_ADMISSION_KEYS: JSON.stringify({ [scopedId]: '11'.repeat(32) }) }, env.PLAYER_ORIGIN, scopedIndex, scopedId, scopedRef), /ADMISSION_NOT_CONFIGURED/); n++;
process.stdout.write(`runtime contract: ${n} checks green\n`);
