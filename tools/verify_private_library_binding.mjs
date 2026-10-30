// Explicit library binding models. Fake HTTP is not backend authority or runtime admission.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { AVAILABLE_LIBRARY_REGISTRY_ID } from '../server/sourcecatalogpolicy.js';
import { createPrivateByteContext } from '../web/src/content/privatebytes.js';
import { createPrivateResourceContext } from '../web/src/content/privateresources.js';
import { createPrivateAudioContext } from '../web/src/content/privateaudio.js';
const reference = { gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', draftRevision: '1', sourceDigest: 'a'.repeat(64), dependencyDigest: 'b'.repeat(64) };
const libraryIdentity = { registryId: AVAILABLE_LIBRARY_REGISTRY_ID, catalogRoot: 'c'.repeat(64) };
const raw = new TextEncoder().encode('{"owned":true}');
function setup(options = {}, body = raw) {
  const sha = createHash('sha256').update(body).digest('hex');
  let requests = 0;
  const locator = { kind: 'private-library', gameId: reference.gameId, draftRevision: '1', sourceDigest: reference.sourceDigest, ...libraryIdentity, assetId: 'library-001', logicalURL: 'owned.json', mime: 'application/json', byteLength: body.length, sha256: sha };
  const ports = { subtle: webcrypto.subtle, assertCurrent() {}, libraryIdentity: { ...libraryIdentity }, async fetcher() {
    requests++;
    return new Response(body.slice(), { headers: { 'x-game-id': reference.gameId, 'x-draft-revision': '1', 'x-source-sha256': reference.sourceDigest, 'x-dependency-sha256': reference.dependencyDigest, 'x-content-sha256': sha, 'cache-control': 'no-store', 'content-type': 'application/octet-stream', 'x-content-admission': 'private-available-bytes-only', 'x-library-root': libraryIdentity.catalogRoot } });
  }, ...options };
  return { ports, locator, requests: () => requests };
}
test('current registry is explicitly bound and JSON decoder forwards the same binding', async () => {
  const fixture = setup(), context = createPrivateByteContext(reference, fixture.ports);
  assert.deepEqual(await context.read(fixture.locator), raw);
  const json = createPrivateResourceContext(reference, fixture.ports);
  assert.deepEqual(await json.readJSON(fixture.locator), { owned: true });
  assert.equal(fixture.requests(), 2);
  assert.deepEqual(['runtimeAllowed', 'trialAllowed', 'releaseAllowed', 'deleteAllowed'].map(key => context[key]), [false, false, false, false]);
  json.close(); context.close();
});
test('audio decoder forwards current library binding without playback or admission', async () => {
  const body = new Uint8Array(52), view = new DataView(body.buffer);
  for (const [at, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) body.set(new TextEncoder().encode(text), at);
  for (const [at, value] of [[4, 44], [16, 16], [24, 8000], [28, 16000], [40, 8]]) view.setUint32(at, value, true);
  for (const [at, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) view.setUint16(at, value, true);
  let decoded = 0;
  const audioContext = { sampleRate: 8000, state: 'suspended', async decodeAudioData() { decoded++; return { sampleRate: 8000, numberOfChannels: 1, length: 4, duration: 4 / 8000, getChannelData: () => new Float32Array(4) }; } };
  const fixture = setup({ audioContext }, body), context = createPrivateAudioContext(reference, fixture.ports);
  const handle = await context.readAudio({ ...fixture.locator, mime: 'audio/wav', logicalURL: 'owned.wav' });
  assert.equal(handle.length, 4); assert.equal(decoded, 1); assert.equal(fixture.requests(), 1);
  handle.dispose(); context.close(); assert.equal(audioContext.state, 'suspended');
});
test('missing identity and mismatched registry/root refuse before fetch, without automatic legacy/latest fallback', async () => {
  for (const options of [{ libraryIdentity: undefined }, { libraryIdentity: { ...libraryIdentity, registryId: 'approved-available-library-76cdf28-1' } }, { libraryIdentity: { ...libraryIdentity, catalogRoot: 'd'.repeat(64) } }]) {
    const fixture = setup(options), context = createPrivateByteContext(reference, fixture.ports);
    await assert.rejects(() => context.read(fixture.locator), /PRIVATE_BYTES_LIBRARY_CONTEXT/);
    assert.equal(fixture.requests(), 0); context.close();
  }
});
test('binding is captured by value and malformed identities/accessors do not execute', async () => {
  const fixture = setup(), context = createPrivateByteContext(reference, fixture.ports);
  fixture.ports.libraryIdentity.registryId = 'changed'; fixture.ports.libraryIdentity.catalogRoot = 'd'.repeat(64);
  assert.deepEqual(await context.read(fixture.locator), raw);
  await assert.rejects(() => context.read({ ...fixture.locator, registryId: 'changed' }), /PRIVATE_BYTES_LIBRARY_CONTEXT/);
  assert.equal(fixture.requests(), 1); context.close();
  for (const identity of [null, {}, { ...libraryIdentity, extra: true }, { ...libraryIdentity, catalogRoot: 'bad' }, { ...libraryIdentity, registryId: '' }]) {
    assert.throws(() => createPrivateByteContext(reference, setup({ libraryIdentity: identity }).ports));
  }
  let calls = 0; const identity = { ...libraryIdentity };
  Object.defineProperty(identity, 'registryId', { enumerable: true, get() { calls++; return libraryIdentity.registryId; } });
  assert.throws(() => createPrivateByteContext(reference, setup({ libraryIdentity: identity }).ports)); assert.equal(calls, 0);
});
test('bound root still requires matching response headers and local lifetime', async () => {
  const fixture = setup(), original = fixture.ports.fetcher;
  fixture.ports.fetcher = async (...args) => { const response = await original(...args); response.headers.set('x-library-root', 'd'.repeat(64)); return response; };
  const context = createPrivateByteContext(reference, fixture.ports);
  await assert.rejects(() => context.read(fixture.locator), /PRIVATE_BYTES_HEADER/);
  context.close(); await assert.rejects(() => context.read(fixture.locator), /PRIVATE_BYTES_CLOSED/);
  assert.equal(fixture.requests(), 1);
});
