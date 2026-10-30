// Owned HTTPS + actual service/login/SQLite/FileBucket + fresh Chromium.
// Only the small harness page and unchanged private resource modules are test delivery routes.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
import { decodePNG } from '../server/pngio.js';
const round = process.argv[2]; assert.ok(/^r[1-9][0-9]{0,3}$/.test(round ?? '') && process.argv.length === 3);
const output = `.dragon-analysis/editor-phase/private-library-browser-${round}`; mkdirSync(output);
const own = mkdtempSync(join(tmpdir(), 'dragon-private-library-browser-'));
const port = Number(process.env.EDITOR_TEST_PORT); assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `https://127.0.0.1:${port}`, initial = randomBytes(24).toString('hex') + 'Aa1!', password = randomBytes(24).toString('hex') + 'Aa1!';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['tools/verify_private_library_browser.mjs','tools/editor_local_https.mjs','tools/editor_stage_source.mjs','tools/editor_stage_library.mjs','vps/editor-server.mjs','vps/sqlite-port.mjs','vps/file-bucket.mjs','server/editorapp.js','server/libraryassets.js','server/sourcecatalog.js','server/sourcecatalogpolicy.js','server/drafts.js','server/copyprofile.js','server/metadata.js','server/security.js','server/available-library.txt','web/src/content/privatebytes.js','web/src/content/privateresources.js','web/src/content/privatepng.js','web/src/content/privateaudio.js','server/pngio.js'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
const modules = new Map(['privatebytes.js', 'privateresources.js', 'privatepng.js', 'privateaudio.js'].map(name => ['/owned-modules/' + name, readFileSync('web/src/content/' + name)]));
const storage = openStorage(join(own, 'authority.sqlite')), bucket = new FileBucket({ root: join(own, 'objects') });
let transport, browser, revoked = false;
const checks = [], errors = [], outside = [], assetResponses = [];
try {
  const operator = { get: key => bucket.get(key), put(key, bytes, options) {
    assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
    return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
  } };
  const source = await stageInstalledEditorSource(operator), library = await stageInstalledAvailableLibrary(operator);
  const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
  const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source), EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library) } });
  transport = await createEditorHTTPS({ dispatchFetch(url, init) {
    const path = new URL(url).pathname;
    if (init.method === 'GET' && path === '/owned-byte-test') return new Response('<!doctype html><meta charset="utf-8"><title>Owned private bytes test</title><p>Isolated byte protocol harness, not editor UI.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'" } });
    if (init.method === 'GET' && modules.has(path)) return new Response(modules.get(path), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (init.method === 'GET' && path === '/favicon.ico') return new Response(null, { status: 204 });
    return service.fetch(new Request(url, init));
  } }, { port });
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ headless: true, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key))) });
  async function openPage() {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
    await context.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess = (globalThis.__idbAccess ?? 0) + 1; throw new Error('formal storage forbidden'); } }));
    await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push('outside'); return route.abort(); } return route.continue(); });
    const page = await context.newPage(); page.setDefaultTimeout(240000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !(revoked && message.text().includes('401') && /\/draft\/library-assets\/library-[0-9]{3}$/.test(new URL(message.location().url || origin).pathname))) errors.push(message.text()); });
    page.on('response', response => { const url = new URL(response.url()); if (/\/draft\/library-assets\/library-[0-9]{3}$/.test(url.pathname)) assetResponses.push({ path: url.pathname, query: url.search, status: response.status() }); });
    await page.goto(origin + '/owned-byte-test');
    await page.evaluate(() => { globalThis.sendJSON = async (path, body, extra = {}) => {
      const headers = { ...extra };
      if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= crypto.randomUUID(); if (globalThis.csrf) headers['X-CSRF-Token'] = globalThis.csrf; }
      const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json(); if (data.csrf) globalThis.csrf = data.csrf;
      return { status: response.status, data };
    }; });
    return page;
  }
  const page = await openPage();
  const api = async (p, path, body, headers, status = 200) => { const response = await p.evaluate(([path, body, headers]) => globalThis.sendJSON(path, body, headers), [path, body, headers]); assert.equal(response.status, status, JSON.stringify(response.data)); return response.data; };
  await api(page, '/api/auth/login', { account: 'tianyi', password: initial });
  await api(page, '/api/auth/password', { oldPassword: initial, newPassword: password });
  await api(page, '/api/admin/source/install', {}); await api(page, '/api/admin/library/install', {});
  const copyKey = randomBytes(16).toString('hex');
  const copy = await api(page, '/api/admin/copies', { registryId: source.registryId, name: '庫位元組測試', introduction: '' }, { 'Idempotency-Key': copyKey }, 202);
  await api(page, `/api/admin/copies/${copyKey}/run`, {}, { 'If-Match': '"1"' });
  const path = `/api/games/${copy.gameId}/draft`, first = await api(page, path + '?revision=1');
  const listing = await api(page, path + '/library-assets?revision=1'); assert.equal(listing.assets.length, 398);
  assert.equal(listing.registryId, library.registryId); assert.equal(listing.catalogRoot, library.root.sha256);
  // White-box observer of an actual committed snapshot; never an auth replacement.
  const row = storage.sql.exec('SELECT source_digest,dependency_digest FROM content_snapshots WHERE game_id=? AND revision=?', copy.gameId, '1').toArray()[0];
  const reference = { gameId: copy.gameId, draftRevision: '1', sourceDigest: row.source_digest, dependencyDigest: row.dependency_digest };
  assert.equal(listing.sourceDigest, reference.sourceDigest);
  const saved = await api(page, path + '/save', { metadata: { ...first.metadata, introduction: '目前第二版' }, resourceEdits: [] }, { 'If-Match': '"1"' }); assert.equal(saved.draftRevision, '2');
  const ledger = storage.sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray(), objectCount = storage.sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
  checks.push('real HTTPS browser login/password, source/library registration and full copy; exact saved1 despite current2, committed SQLite reference observed');
  const descriptors = ['application/json', 'image/png', 'audio/flac'].map(mime => { const asset = listing.assets.filter(row => row.mime === mime).sort((a, b) => a.byteLength - b.byteLength)[0]; assert.ok(asset); return asset; });
  const result = await page.evaluate(async ({ reference, listing, descriptors }) => {
    const { createPrivateByteContext } = await import('/owned-modules/privatebytes.js');
    const identity = { registryId: listing.registryId, catalogRoot: listing.catalogRoot };
    const options = { libraryIdentity: identity, assertCurrent() {} };
    const context = createPrivateByteContext(reference, options);
    const locators = descriptors.map(asset => ({ kind: 'private-library', ...reference, ...identity, ...asset }));
    // dependencyDigest belongs to the context, not the exact locator schema.
    locators.forEach(locator => { delete locator.dependencyDigest; });
    const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const read = async locator => { const bytes = await context.read(locator); return { sha256: await digest(bytes), byteLength: bytes.length }; };
    const values = []; for (const locator of locators) values.push(await read(locator));
    const changed = await context.read(locators[0]); changed[0] ^= 255;
    const again = await read(locators[0]);
    const absent = createPrivateByteContext(reference, { assertCurrent() {} }); let missing;
    try { await absent.read(locators[0]); } catch (error) { missing = error.message; } finally { absent.close(); }
    globalThis.byteTest = { context, selected: locators[0] };
    return { values, again, missing, admission: ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed'].map(key => context[key]) };
  }, { reference, listing, descriptors });
  assert.deepEqual(result.values, descriptors.map(({ sha256, byteLength }) => ({ sha256, byteLength })));
  assert.deepEqual(result.again, result.values[0]); assert.match(result.missing, /PRIVATE_BYTES_LIBRARY_CONTEXT/);
  assert.deepEqual(result.admission, [false, false, false, false]); assert.equal(assetResponses.length, 5);
  assert.ok(assetResponses.every(row => row.status === 200 && row.query === '?revision=1'));
  checks.push('native Chromium fetch/stream/WebCrypto for actual JSON/PNG/FLAC bytes; fresh GETs and returned-array isolation; missing binding no GET; all admission false');
  const pngDescriptors = ['grf/ui/battle_status_0.png', 'kao/149.png'].map(url => {
    const descriptor = listing.assets.find(asset => asset.logicalURL === url); assert.ok(descriptor); return descriptor;
  });
  const pngExpected = pngDescriptors.map(descriptor => {
    const bytes = readFileSync('web/' + descriptor.logicalURL); assert.equal(sha(bytes), descriptor.sha256);
    const decoded = decodePNG(bytes); assert.ok(decoded.pixels.every((value, index) => index % 4 !== 3 || value === 255), 'opaque samples avoid Canvas premultiplication ambiguity');
    return { logicalURL: descriptor.logicalURL, depth: bytes[24], type: bytes[25], width: decoded.width, height: decoded.height, pixelSHA: sha(decoded.pixels) };
  });
  assert.deepEqual(pngExpected.map(row => [row.depth, row.type]), [[8, 2], [4, 3]]);
  const jsonBytes = readFileSync('web/' + descriptors[0].logicalURL); assert.equal(sha(jsonBytes), descriptors[0].sha256);
  const decoded = await page.evaluate(async ({ reference, listing, jsonDescriptor, pngDescriptors }) => {
    const { createPrivateResourceContext } = await import('/owned-modules/privateresources.js');
    const options = { libraryIdentity: { registryId: listing.registryId, catalogRoot: listing.catalogRoot }, assertCurrent() {} };
    const locator = descriptor => ({ kind: 'private-library', gameId: reference.gameId, draftRevision: reference.draftRevision, sourceDigest: reference.sourceDigest, ...options.libraryIdentity, ...descriptor });
    const context = createPrivateResourceContext(reference, options);
    const json = await context.readJSON(locator(jsonDescriptor)), again = await context.readJSON(locator(jsonDescriptor));
    const frozen = value => value === null || typeof value !== 'object' || Object.isFrozen(value) && Object.values(value).every(frozen);
    const pixels = [], handles = [];
    for (const descriptor of pngDescriptors) {
      const handle = await context.readPNG(locator(descriptor)); handles.push(handle);
      const canvas = new OffscreenCanvas(handle.width, handle.height), ctx = canvas.getContext('2d'); ctx.drawImage(handle.image, 0, 0);
      const rgba = ctx.getImageData(0, 0, handle.width, handle.height).data;
      const pixelSHA = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)), byte => byte.toString(16).padStart(2, '0')).join('');
      pixels.push({ width: handle.width, height: handle.height, pixelSHA });
    }
    handles[0].dispose(); handles[0].dispose(); context.close(); context.close();
    let closed; try { await context.readPNG(locator(pngDescriptors[0])); } catch (error) { closed = error.message; }
    let ready, release, bitmap;
    const arrived = new Promise(resolve => { ready = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const late = createPrivateResourceContext(reference, { ...options, async decodeBitmap(...args) { bitmap = await createImageBitmap(...args); ready(); await gate; return bitmap; } });
    const outcome = late.readPNG(locator(pngDescriptors[0])).then(() => 'unexpected success', error => error.message);
    await Promise.race([arrived, outcome.then(message => { throw new Error(message); })]);
    late.close(); release(); const lateError = await outcome;
    return { json, again, frozen: frozen(json) && frozen(again), separate: json !== again, pixels, widthsAfterClose: handles.map(handle => handle.image.width), closed, lateError, lateWidth: bitmap.width, admission: ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed'].map(key => context[key]) };
  }, { reference, listing, jsonDescriptor: descriptors[0], pngDescriptors });
  assert.deepEqual(decoded.json, JSON.parse(jsonBytes)); assert.deepEqual(decoded.again, decoded.json); assert.equal(decoded.frozen, true); assert.equal(decoded.separate, true);
  assert.deepEqual(decoded.pixels, pngExpected.map(({ width, height, pixelSHA }) => ({ width, height, pixelSHA })));
  assert.deepEqual(decoded.widthsAfterClose, [0, 0]); assert.match(decoded.closed, /PRIVATE_RESOURCE_CLOSED/); assert.deepEqual(decoded.admission, [false, false, false, false]);
  checks.push('actual JSON deep-frozen fresh results; native RGB8 and indexed4 opaque PNG pixels equal independent Node codec, dispose/close release real bitmaps');
  assert.match(decoded.lateError, /PRIVATE_RESOURCE_CLOSED/); assert.equal(decoded.lateWidth, 0);
  assert.equal(assetResponses.length, 10); assert.ok(assetResponses.every(row => row.status === 200 && row.query === '?revision=1'));
  checks.push('controlled native bitmap decoder return after context close rejects and closes the real late bitmap; closed read makes no GET');
  const flacBytes = readFileSync('web/' + descriptors[2].logicalURL);
  assert.equal(sha(flacBytes), descriptors[2].sha256); assert.equal(flacBytes.toString('ascii', 0, 4), 'fLaC');
  assert.equal(flacBytes[4] & 127, 0); assert.equal(flacBytes.readUIntBE(5, 3), 34);
  const streamInfo = flacBytes.readBigUInt64BE(18);
  const audioExpected = { logicalURL: descriptors[2].logicalURL, sha256: descriptors[2].sha256, rate: Number(streamInfo >> 44n), channels: Number((streamInfo >> 41n) & 7n) + 1, samples: Number(streamInfo & 0xfffffffffn) };
  const audio = await page.evaluate(async ({ reference, listing, descriptor }) => {
    const { createPrivateAudioContext } = await import('/owned-modules/privateaudio.js');
    // Offline context: no output device, source node or startRendering call.
    const native = new OfflineAudioContext(2, 1, 48000);
    const identity = { registryId: listing.registryId, catalogRoot: listing.catalogRoot };
    const context = createPrivateAudioContext(reference, { libraryIdentity: identity, audioContext: native, assertCurrent() {} });
    const locator = { kind: 'private-library', gameId: reference.gameId, draftRevision: reference.draftRevision, sourceDigest: reference.sourceDigest, ...identity, ...descriptor };
    const hashes = async buffer => {
      const result = [];
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const pcm = buffer.getChannelData(channel);
        if (!pcm.every(Number.isFinite) || !pcm.some(value => value !== 0)) throw new Error('nonfinite or silent fixed FLAC sample');
        const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        result.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''));
      }
      return result;
    };
    const first = await context.readAudio(locator), firstHashes = await hashes(first.buffer);
    let ownedError; try { await context.readAudio(locator); } catch (error) { ownedError = error.message; }
    first.dispose(); first.dispose(); first.buffer.getChannelData(0)[0] = 12345;
    const second = await context.readAudio(locator), secondHashes = await hashes(second.buffer);
    context.close(); context.close(); const afterCloseHashes = await hashes(second.buffer);
    let closedError; try { await context.readAudio(locator); } catch (error) { closedError = error.message; }
    return { rate: second.sampleRate, channels: second.numberOfChannels, length: second.length, duration: second.duration, separate: first.buffer !== second.buffer, firstHashes, secondHashes, afterCloseHashes, ownedError, closedError, nativeState: native.state, admission: ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed'].map(key => context[key]) };
  }, { reference, listing, descriptor: descriptors[2] });
  assert.equal(audio.rate, 48000); assert.equal(audio.channels, audioExpected.channels);
  assert.ok(Math.abs(audio.length - audioExpected.samples * audio.rate / audioExpected.rate) <= 1);
  assert.equal(audio.duration, audio.length / audio.rate); assert.equal(audio.separate, true);
  assert.deepEqual(audio.firstHashes, audio.secondHashes); assert.deepEqual(audio.afterCloseHashes, audio.secondHashes);
  assert.match(audio.ownedError, /PRIVATE_AUDIO_OWNED_BUDGET/); assert.match(audio.closedError, /PRIVATE_AUDIO_CLOSED/);
  assert.equal(audio.nativeState, 'suspended'); assert.deepEqual(audio.admission, [false, false, false, false]);
  assert.equal(assetResponses.length, 12); assert.ok(assetResponses.every(row => row.status === 200 && row.query === '?revision=1'));
  checks.push('native OfflineAudioContext FLAC resampling matches STREAMINFO frame/channel bounds; fresh decode after dispose, no alias/cache, close does not erase exposed PCM or start audio');
  const wavDescriptor = listing.assets.find(asset => asset.logicalURL === 'grf/sfx/ynsound-record13.wav'); assert.ok(wavDescriptor);
  const wavBytes = readFileSync('web/' + wavDescriptor.logicalURL); assert.equal(sha(wavBytes), wavDescriptor.sha256);
  // Fixed sample, not another general-purpose WAV parser. Refuse any different envelope.
  assert.equal(wavBytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(wavBytes.readUInt32LE(4), wavBytes.length - 8);
  assert.equal(wavBytes.toString('ascii', 8, 16), 'WAVEfmt '); assert.equal(wavBytes.readUInt32LE(16), 16);
  assert.equal(wavBytes.readUInt16LE(20), 1); assert.equal(wavBytes.readUInt16LE(22), 2); assert.equal(wavBytes.readUInt16LE(34), 16);
  assert.equal(wavBytes.toString('ascii', 36, 40), 'data'); assert.equal(wavBytes.readUInt32LE(40), wavBytes.length - 44);
  const wavExpected = { logicalURL: wavDescriptor.logicalURL, sha256: wavDescriptor.sha256, rate: wavBytes.readUInt32LE(24), channels: 2, length: (wavBytes.length - 44) / 4 };
  assert.ok(Number.isInteger(wavExpected.length));
  // Previously isolated Chromium conversion control, rechecked exactly here;
  // not an OPL formula, a browser-wide promise or a tolerance-based comparison.
  const wavHashes = Array.from({ length: 2 }, (_, channel) => {
    const pcm = Float32Array.from({ length: wavExpected.length }, (_, frame) => {
      const value = wavBytes.readInt16LE(44 + (frame * 2 + channel) * 2);
      return Math.fround(value * Math.fround(value < 0 ? 1 / 32768 : 1 / 32767));
    });
    return sha(new Uint8Array(pcm.buffer));
  });
  const wav = await page.evaluate(async ({ reference, listing, descriptor, rate }) => {
    const { createPrivateAudioContext } = await import('/owned-modules/privateaudio.js');
    const native = new OfflineAudioContext(2, 1, rate);
    const identity = { registryId: listing.registryId, catalogRoot: listing.catalogRoot };
    const options = { libraryIdentity: identity, audioContext: native, assertCurrent() {} };
    const locator = { kind: 'private-library', gameId: reference.gameId, draftRevision: reference.draftRevision, sourceDigest: reference.sourceDigest, ...identity, ...descriptor };
    const hashes = async buffer => Promise.all(Array.from({ length: buffer.numberOfChannels }, async (_, channel) => {
      const pcm = buffer.getChannelData(channel), bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    }));
    const context = createPrivateAudioContext(reference, options), handle = await context.readAudio(locator);
    const decoded = { rate: handle.sampleRate, channels: handle.numberOfChannels, length: handle.length, duration: handle.duration, hashes: await hashes(handle.buffer) };
    context.close();
    let ready, release, buffer, decoderCalls = 0;
    const arrived = new Promise(resolve => { ready = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const late = createPrivateAudioContext(reference, { ...options, audioContext: {
      sampleRate: native.sampleRate, get state() { return native.state; },
      async decodeAudioData(bytes) { decoderCalls++; buffer = await native.decodeAudioData(bytes); ready(); await gate; return buffer; },
    } });
    const outcome = late.readAudio(locator).then(() => 'unexpected handle', error => error.message);
    await Promise.race([arrived, outcome.then(message => { throw new Error(message); })]);
    let pendingError; try { await late.readAudio(locator); } catch (error) { pendingError = error.message; }
    late.close(); late.close(); release(); const lateError = await outcome;
    let closedError; try { await late.readAudio(locator); } catch (error) { closedError = error.message; }
    return { decoded, pendingError, lateError, closedError, decoderCalls, lateHashes: await hashes(buffer), nativeState: native.state, admission: ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed'].map(key => late[key]) };
  }, { reference, listing, descriptor: wavDescriptor, rate: wavExpected.rate });
  assert.deepEqual(wav.decoded, { rate: wavExpected.rate, channels: 2, length: wavExpected.length, duration: wavExpected.length / wavExpected.rate, hashes: wavHashes });
  checks.push('actual fixed signed16 stereo WAV at source rate matches the explicitly scoped Chromium conversion control for every Float32 PCM sample/hash');
  assert.match(wav.pendingError, /PRIVATE_AUDIO_OWNED_BUDGET/); assert.match(wav.lateError, /PRIVATE_AUDIO_CLOSED/); assert.match(wav.closedError, /PRIVATE_AUDIO_CLOSED/);
  assert.equal(wav.decoderCalls, 1); assert.deepEqual(wav.lateHashes, wavHashes); assert.equal(wav.nativeState, 'suspended'); assert.deepEqual(wav.admission, [false, false, false, false]);
  assert.equal(assetResponses.length, 14); assert.ok(assetResponses.every(row => row.status === 200 && row.query === '?revision=1'));
  checks.push('pending native audio decoder blocks another GET; close before controlled decoder return rejects late handle without erasing provider-owned PCM or closing caller context');
  const generation = await page.evaluate(async ({ reference, listing, png, wav, rate }) => {
    const { createPrivateResourceContext } = await import('/owned-modules/privateresources.js');
    const { createPrivateAudioContext } = await import('/owned-modules/privateaudio.js');
    const identity = { registryId: listing.registryId, catalogRoot: listing.catalogRoot };
    // Explicit caller lifecycle fixture, NOT service authentication or shipped host wiring.
    let currentGeneration = 1;
    const capturedGeneration = currentGeneration;
    const assertCurrent = () => { if (currentGeneration !== capturedGeneration) throw new Error('OWNED_EDITOR_GENERATION_CHANGED'); };
    const locator = descriptor => ({ kind: 'private-library', gameId: reference.gameId, draftRevision: reference.draftRevision, sourceDigest: reference.sourceDigest, ...identity, ...descriptor });
    const native = new OfflineAudioContext(2, 1, rate);
    let pngReady, audioReady, releasePNG, releaseAudio, bitmap, buffer, pngCalls = 0, audioCalls = 0;
    const pngArrived = new Promise(resolve => { pngReady = resolve; }), audioArrived = new Promise(resolve => { audioReady = resolve; });
    const pngGate = new Promise(resolve => { releasePNG = resolve; }), audioGate = new Promise(resolve => { releaseAudio = resolve; });
    const images = createPrivateResourceContext(reference, { libraryIdentity: identity, assertCurrent,
      async decodeBitmap(...args) { pngCalls++; bitmap = await createImageBitmap(...args); pngReady(); await pngGate; return bitmap; },
    });
    const audio = createPrivateAudioContext(reference, { libraryIdentity: identity, assertCurrent, audioContext: {
      sampleRate: native.sampleRate, get state() { return native.state; },
      async decodeAudioData(bytes) { audioCalls++; buffer = await native.decodeAudioData(bytes); audioReady(); await audioGate; return buffer; },
    } });
    const pngOutcome = images.readPNG(locator(png)).then(() => 'unexpected PNG handle', error => error.message);
    const audioOutcome = audio.readAudio(locator(wav)).then(() => 'unexpected audio handle', error => error.message);
    await Promise.race([Promise.all([pngArrived, audioArrived]), pngOutcome.then(message => { throw new Error(message); }), audioOutcome.then(message => { throw new Error(message); })]);
    const widthBefore = bitmap.width;
    currentGeneration++; // Do not call close: the post-decode caller check must reject.
    releasePNG(); releaseAudio();
    const errors = await Promise.all([pngOutcome, audioOutcome]);
    const widthAfter = bitmap.width;
    const subsequent = [];
    for (const read of [() => images.readPNG(locator(png)), () => audio.readAudio(locator(wav))]) {
      try { await read(); subsequent.push('unexpected later handle'); } catch (error) { subsequent.push(error.message); }
    }
    const pcmHashes = await Promise.all(Array.from({ length: buffer.numberOfChannels }, async (_, channel) => {
      const pcm = buffer.getChannelData(channel);
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))), byte => byte.toString(16).padStart(2, '0')).join('');
    }));
    images.close(); images.close(); audio.close(); audio.close();
    return { errors, subsequent, widthBefore, widthAfter, pcmHashes, pngCalls, audioCalls, nativeState: native.state,
      admission: [images, audio].map(context => ['runtimeAllowed','trialAllowed','releaseAllowed','deleteAllowed'].map(key => context[key])) };
  }, { reference, listing, png: pngDescriptors[0], wav: wavDescriptor, rate: wavExpected.rate });
  assert.deepEqual(generation.errors, ['OWNED_EDITOR_GENERATION_CHANGED', 'OWNED_EDITOR_GENERATION_CHANGED']);
  assert.deepEqual(generation.subsequent, generation.errors);
  assert.equal(generation.widthBefore, pngExpected[0].width); assert.equal(generation.widthAfter, 0);
  assert.equal(generation.pngCalls, 1); assert.equal(generation.audioCalls, 1);
  assert.deepEqual(generation.pcmHashes, wavHashes); assert.equal(generation.nativeState, 'suspended');
  assert.deepEqual(generation.admission, [[false, false, false, false], [false, false, false, false]]);
  assert.equal(assetResponses.length, 16); assert.ok(assetResponses.every(row => row.status === 200 && row.query === '?revision=1'));
  checks.push('explicit caller generation changes after real PNG decode but before delivery: no handle, real bitmap closed before context close, next read no GET');
  checks.push('same caller generation boundary for native WAV decode: no handle or next GET, provider-owned PCM intact and offline context suspended; not service revocation');
  const other = await openPage(); await api(other, '/api/auth/login', { account: 'tianyi', password });
  await api(other, '/api/auth/password', { oldPassword: password, newPassword: randomBytes(24).toString('hex') + 'Aa1!' });
  revoked = true;
  const denied = await page.evaluate(async () => { try { await globalThis.byteTest.context.read(globalThis.byteTest.selected); return 'unexpected success'; } catch (error) { return error.message; } finally { globalThis.byteTest.context.close(); } });
  assert.match(denied, /PRIVATE_BYTES_HTTP_401/); assert.equal(assetResponses.length, 17); assert.equal(assetResponses.at(-1).status, 401);
  assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.equal(await other.evaluate(() => globalThis.__idbAccess ?? 0), 0);
  assert.deepEqual(storage.sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray(), ledger);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0); assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0);
  checks.push('second isolated browser session changes password; old cookie/context next actual GET401; no draft/object writes, formal IDB or Trial/release');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)), expected, path);
  writeFileSync(join(output, 'receipt.json'), JSON.stringify({ checks, sourceHashes, pngExpected, audioExpected, audio, wavExpected, wavHashes, wav, generation, jsonSample: { logicalURL: descriptors[0].logicalURL, sha256: descriptors[0].sha256 }, assetResponses, errors, outside, scope: 'actual browser bytes, JSON and two opaque PNG decodes with native bitmap lifecycle; owned delivery harness, with native FLAC/WAV offline decoding, controlled late return and explicit caller-generation invalidation; not shipped host lifecycle wiring or UI, playback, independent FLAC PCM oracle, complete closure or runtime admission' }, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ groups: checks.length, sourceHashes: paths.length, assetGETs: assetResponses.length, output }) + '\n');
} catch (error) { writeFileSync(join(output, 'failure.json'), JSON.stringify({ error: error.stack, checks, errors, outside, assetResponses }, null, 2), { flag: 'wx' }); throw error; }
finally { await browser?.close(); await transport?.close(); storage.close(); rmSync(own, { recursive: true, force: true }); }
