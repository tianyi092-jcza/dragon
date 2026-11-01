// Owned in-process HTTPS fixture. Real installed JS/CSS, not the complete game
// asset package. No sockets; exact static paths and immutable archive keys only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildStaticRelease } from '../../vps/static-release.mjs';
import { programRegistrationKey, programRegistrationBytes } from '../../reader/programregistration.js';
export function installedStaticHTTPS(prefix) {
  assert.match(prefix, /^test\/owned-(cli|linux)\/$/);
  let bundle;
  try { bundle = JSON.parse(readFileSync(new URL('../../server/public/trialweb.txt', import.meta.url), 'utf8')); }
  catch (cause) { throw new Error('owned installed bundle required', { cause }); }
  const files = new Map(bundle.files.map(file => [file.path, Buffer.from(file.text)]));
  files.set('owned/probe.bin', Buffer.from('owned startup asset'));
  const release = buildStaticRelease([...files].map(([path, bytes]) => ({ path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })));
  files.set('static-release.json', release.bytes);
  const base = `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/dragon/${prefix}artifacts/programs/${release.sha256}/`;
  const keys = new Map([...files].map(([path, bytes]) => [base + (path === 'static-release.json' ? path : 'files/' + path), bytes]));
  const objects = new Map(), events = [], registrations = new Map(), registrationEvents = [];
  const registrationURL = `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/dragon/${prefix}${programRegistrationKey(release.sha256)}`;
  const registrationBytes = Buffer.from(programRegistrationBytes(release.sha256, release.manifest.sourceTreeDigest));
  // `unreachable` 模拟传输层不可达（连不上／被重置），不是权威事实不符。
  const state = { missingSource: false, missingReadback: false, losePut: false, missingRegistration: false, loseRegistrationPut: false, unreachable: false };
  function reply(status, bytes = Buffer.alloc(0), mime = 'application/octet-stream') {
    return { status, bytes: Buffer.from(bytes), headers: { 'content-length': String(bytes.length), 'content-type': mime } };
  }
  function handle(url, options, body) {
    if (state.unreachable) throw Object.assign(new Error('owned fixture transport unreachable'), { code: 'ECONNRESET' });
    if (url.startsWith('https://owned-static.invalid/release/')) {
      const path = url.slice('https://owned-static.invalid/release/'.length);
      assert.ok(files.has(path), 'unexpected static path'); assert.equal(options.method, 'GET');
      events.push({ type: 'source', path });
      const types = { js: 'text/javascript', css: 'text/css', json: 'application/json', bin: 'application/octet-stream' };
      const mime = types[path.split('.').at(-1)]; assert.ok(mime, 'explicit fixture MIME');
      return state.missingSource ? reply(404) : reply(200, files.get(path), mime);
    }
    if (url === registrationURL) {
      assert.ok(options.headers.Authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${'b'.repeat(32)}/`));
      assert.ok(['GET', 'PUT'].includes(options.method)); registrationEvents.push(options.method);
      if (options.method === 'PUT') {
        assert.equal(options.headers['If-None-Match'], '*'); assert.equal(options.headers['Content-Type'], 'application/json');
        assert.equal(options.headers['Cache-Control'], 'no-store'); assert.ok(body.equals(registrationBytes));
        if (registrations.has(url)) return reply(412);
        registrations.set(url, Buffer.from(body));
        if (state.loseRegistrationPut) throw new Error('owned registration PUT response lost');
        return reply(200);
      }
      return state.missingRegistration || !registrations.has(url) ? reply(404) : reply(200, registrations.get(url), 'application/json');
    }
    if (!url.startsWith(base)) return null;
    assert.ok(keys.has(url), 'unexpected archive key');
    assert.ok(options.headers.Authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${'b'.repeat(32)}/`));
    assert.ok(['GET', 'PUT'].includes(options.method));
    events.push({ type: options.method, url });
    if (options.method === 'PUT') {
      assert.equal(options.headers['If-None-Match'], '*');
      assert.equal(options.headers['Cache-Control'], 'no-store');
      assert.ok(body.equals(keys.get(url)), 'archive uses the exact source bytes');
      if (objects.has(url)) return reply(412);
      const mime = url.endsWith('/static-release.json') ? 'application/json' : 'application/octet-stream';
      assert.equal(options.headers['Content-Type'], mime);
      objects.set(url, { bytes: Buffer.from(body), mime });
      if (state.losePut) throw new Error('owned lost PUT response');
      return reply(200);
    }
    const stored = objects.get(url);
    return !stored || state.missingReadback ? reply(404) : reply(200, stored.bytes, stored.mime);
  }
  return { release, files, objects, events, state, handle, base, manifestURL: base + 'static-release.json',
    registrationURL, registrationBytes, registrations, registrationEvents };
}
