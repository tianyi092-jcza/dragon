// Fixed byte provenance only. No authentication/runtime admission is simulated here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installedSourcePolicy, installedAvailableLibraryPolicy, isInstalledSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = readFileSync('server/available-library.txt'), policy = installedAvailableLibraryPolicy(manifest);
assert.equal(policy.registryId, 'approved-available-library-76cdf28-1');
assert.equal(policy.mode, 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE');
assert.equal(policy.roles.length, 400); assert.equal(policy.unresolvedReferences.length, 20);
assert.ok(isInstalledSourcePolicy(policy)); assert.ok(Object.isFrozen(policy)); assert.ok(Object.isFrozen(policy.roles)); assert.ok(Object.isFrozen(policy.programHashes));
let jsonClone;
try { jsonClone = JSON.parse(JSON.stringify(policy)); } catch (cause) { throw new Error('owned policy JSON roundtrip failed', { cause }); }
assert.ok(!isInstalledSourcePolicy(jsonClone)); assert.ok(!isInstalledSourcePolicy(structuredClone(policy)));
for (const row of policy.roles) {
  const bytes = row.path === 'available-library-manifest.json' ? manifest : readFileSync('web/' + row.path);
  assert.equal(bytes.length, row.byteLength); assert.equal(sha(bytes), row.sha256); assert.ok(Object.isFrozen(row));
}
for (const [path, digest] of Object.entries(policy.programHashes)) assert.equal(sha(readFileSync(path)), digest, path);
assert.ok(!policy.roles.some(row => row.path === 'kao/255.png')); assert.ok(policy.unresolvedReferences.every(row => row.slot === 127 && row.portrait === 255 && Object.isFrozen(row)));
let rejected = 0;
function bad(value) { assert.throws(() => installedAvailableLibraryPolicy(value), error => error.status === 503); rejected++; }
const corrupted = new Uint8Array(manifest); corrupted[0] ^= 1; bad(corrupted); bad(manifest.subarray(1)); bad(new Uint16Array(manifest.length)); bad(new DataView(new ArrayBuffer(manifest.length))); bad(undefined); bad({ valid: true, sha256: policy.manifestDigest });
let getters = 0; const proxy = new Proxy(manifest, { get() { getters++; throw new Error('must not execute caller getter'); } }); bad(proxy); assert.equal(getters, 0);
const shared = new Uint8Array(new SharedArrayBuffer(manifest.length)); shared.set(manifest); bad(shared);
const resizable = new ArrayBuffer(manifest.length, { maxByteLength: manifest.length + 1 }), view = new Uint8Array(resizable); view.set(manifest); bad(view);
const own = new Uint8Array(manifest); for (const key of ['length', 'byteLength', 'buffer', 'byteOffset', Symbol.toStringTag, Symbol.iterator]) Object.defineProperty(own, key, { get() { getters++; throw new Error('own getter must not execute'); } }); assert.equal(installedAvailableLibraryPolicy(own).manifestDigest, policy.manifestDigest); assert.equal(getters, 0);
bad(readFileSync('.dragon-analysis/editor-phase/trial-assets-stage-r4/package/manifest.json'));
const revision = policy.revision, entities = '086ca8a87e2dafb2b7c9d657a74b70c81b5da3e98776e5d7d8c21dcfc5a982a5';
const original = installedSourcePolicy(readFileSync('web/content/builtin/compiled/' + revision + '/manifest.json'), readFileSync('web/content/builtin/authoring/entities-' + entities + '/manifest.json'));
assert.equal(original.roles.length, 41); assert.equal(original.registryId, 'approved-builtin-47e358-entities086-1'); assert.equal(original.profileRevision, 'fixed-copy-resources-1');
assert.notEqual(policy.registryId, original.registryId); const definition = sha(Buffer.from([...canonicalSourceTokens(original)].join('')));
process.stdout.write(JSON.stringify({ result: 'PASS-FIXED-AVAILABLE-LIBRARY-POLICY-NOT-RUNTIME', roles: 400, negativeChecks: rejected, getters, oldRoles: 41, oldDefinitionDigest: definition, currentManifestDigest: policy.manifestDigest, programFingerprints: 19, unresolved: 20, sourceHashes: Object.fromEntries(['server/sourcecatalogpolicy.js', 'server/available-library.txt', 'server/sourcecatalog.js', 'web/src/editor/trialassetpaths.js', 'tools/verify_editor_backend_library_policy.mjs'].map(path => [path, sha(readFileSync(path))])), limits: 'Byte policy only. Actual SQL/R2 registration, Root bootstrap and all-runtime-consumer gates not yet exercised.' }, null, 2) + '\n');
