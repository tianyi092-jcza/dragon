import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMapAtlasLoader } from '../src/mapatlas.js';
const bytes = new Uint8Array([1, 2, 3]), sha256 = createHash('sha256').update(bytes).digest('hex');
const source = { editorAssets: { seasonAtlases: Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => [season, { sha256, byteLength: bytes.length }])) } };

test('atlas is local feedback, validated, cached across edits, and disposed on source reset', async () => {
  let current, closed = 0, state = {}; const calls = [];
  const loader = createMapAtlasLoader({ api: async (...args) => { calls.push(args); return { bytes, sha256 }; },
    install: value => { current = value; }, publish: value => { state = { ...state, ...value }; },
    decode: async () => ({ width: 256, height: 256, close() { closed++; } }) });
  await loader.setSource(source); assert.ok(current); assert.equal(state.atlasLoading, false);
  assert.equal(calls[0][2].feedback, 'local');
  await loader.setSource(structuredClone(source)); assert.equal(calls.length, 1);
  await loader.setSeason('winter'); assert.equal(calls.length, 2); assert.equal(closed, 1);
  assert.match(calls[1][0], /season=winter/);
  loader.setSource(null); assert.equal(current, null); assert.equal(closed, 2);
  assert.throws(() => loader.setSeason('invalid'), /季節/);
});

test('bad bytes never decode; delayed response after identity reset never installs', async () => {
  let decoded = 0, state = {}, installed = null, resolve;
  const bad = createMapAtlasLoader({ api: async () => ({ bytes: new Uint8Array([4, 5, 6]), sha256 }),
    decode: async () => { decoded++; }, install: value => { installed = value; }, publish: value => { state = { ...state, ...value }; } });
  await bad.setSource(source); assert.equal(decoded, 0); assert.match(state.atlasError, /校驗失敗/);
  const late = createMapAtlasLoader({ api: () => new Promise(done => { resolve = done; }), decode: async () => { decoded++; },
    install: value => { installed = value; }, publish() {} });
  const pending = late.setSource(source); late.setSource(null); resolve({ bytes, sha256 }); await pending;
  assert.equal(decoded, 0); assert.equal(installed, null);
});
