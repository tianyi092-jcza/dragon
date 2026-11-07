// Actual stager -> registration -> read-only HTTP; owned memory or workerd/R2.
// Small software fixtures, not a game/old-program entry or compatibility proof.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import program from '../reader/programassets.js';
import { buildStaticRelease, parseStaticRelease } from '../vps/static-release.mjs';
import { createStaticArchiver } from '../vps/static-archive.mjs';
import { registerStaticProgram } from '../vps/program-registration.mjs';
import { programRegistrationKey, programRegistrationBytes } from '../reader/programregistration.js';
assert.ok(process.argv.slice(2).every(arg => arg === '--workerd'));
const workerd = process.argv.includes('--workerd'), sha = b => createHash('sha256').update(b).digest('hex');
let mf, own, bucket, outbound = 0, checks = 0;
const memory = new Map(), allowed = new Set(), reads = [], writes = [];
const check = () => { checks++; };
const tacticalPaths = ['grf/battle_terrain_0.png', 'grf/battle_terrain_1.png', 'grf/battle_terrain_2.png', 'grf/battle_units.png'];
const spriteQuery = '?v=original-sprites-1';
// Opaque transport bytes, not a PNG decode or battle presentation certificate.
const tacticalBytes = (path, version) => Buffer.from('owned-sprite-' + path + '-' + version);
const raw = {
  async get(key) {
    assert.ok(allowed.has(key), 'exact owned key');
    if (bucket) { const object = await bucket.get(key); return object ? { bytes: Buffer.from(await object.arrayBuffer()), mime: object.httpMetadata.contentType } : null; }
    const row = memory.get(key); return row ? { bytes: Buffer.from(row.bytes), mime: row.mime } : null;
  },
  async seed(key, bytes, mime = 'application/json') {
    assert.ok(allowed.has(key));
    if (bucket) await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    else memory.set(key, { bytes: Buffer.from(bytes), mime });
  },
  async remove(key) { assert.ok(allowed.has(key)); if (bucket) await bucket.delete(key); else memory.delete(key); },
};
const r2 = {
  async get(key, { maxBytes } = {}) {
    const row = await raw.get(key); if (!row) return null;
    if (maxBytes !== undefined) assert.ok(row.bytes.length <= maxBytes);
    return { bytes: row.bytes, headers: { 'content-type': row.mime } };
  },
  async putImmutable(key, bytes, mime) {
    assert.ok(allowed.has(key)); writes.push(key);
    if (bucket) return bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: mime } });
    if (!memory.has(key)) await raw.seed(key, bytes, mime);
  },
};
const port = { async get(key) {
  reads.push(key); const row = await raw.get(key); if (!row) return null;
  return { size: row.bytes.length, httpMetadata: { contentType: row.mime }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(row.bytes)); controller.close(); } }) };
} };
async function stage(version) {
  const files = new Map(Object.entries({ 'src/late.js': `export const version = ${version};`, 'grf/late.bin': 'bytes-' + version, 'empty.txt': '', 'data.json': '{"owned":true}', 'index.html': '<script>not an entry</script>', 'image.svg': '<svg/>', '_headers': 'configuration-not-public' }).map(([path, text]) => [path, Buffer.from(text)]));
  for (const path of tacticalPaths) files.set(path, tacticalBytes(path, version));
  files.set('intro/scene.html', Buffer.from('<main>owned fragment ' + version + '</main>'));
  const built = buildStaticRelease([...files].map(([path, bytes]) => ({ path, byteLength: bytes.length, sha256: sha(bytes) })));
  const base = `artifacts/programs/${built.sha256}/`, key = programRegistrationKey(built.sha256);
  allowed.add(key); allowed.add(base + 'static-release.json');
  for (const file of built.manifest.files.filter(f => f.kind === 'asset')) allowed.add(base + 'files/' + file.path);
  const source = async path => path === 'static-release.json' ? built.bytes : files.get(path);
  await createStaticArchiver({ r2, readStatic: source, expectedDigest: built.sha256, sourceTreeDigest: built.manifest.sourceTreeDigest, maxTotalBytes: 1024 * 1024 }).stage(() => {});
  await registerStaticProgram({ r2, releaseDigest: built.sha256, sourceTreeDigest: built.manifest.sourceTreeDigest, assertCurrent() {} });
  return { ...built, base, key, files };
}
try {
  if (workerd) {
    let modulePath;
    try { modulePath = createRequire(import.meta.url).resolve('miniflare'); }
    catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
    assert.ok(existsSync(modulePath)); const { Miniflare } = await import(pathToFileURL(modulePath).href);
    own = mkdtempSync(join(tmpdir(), 'dragon-program-http-'));
    mf = new Miniflare({ modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/programassets.js'), compatibilityDate: '2025-04-01', r2Buckets: ['PUBLISH_BUCKET'], r2Persist: join(own, 'r2'), host: '127.0.0.1', port: 0, outboundService() { outbound++; return new Response('denied', { status: 403 }); } });
    bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  }
  const first = await stage(1), prefix = '/program-assets/' + first.sha256 + '/';
  const send = (path, options = {}) => workerd ? mf.dispatchFetch('https://program.test' + path, options) : program.fetch(new Request('https://program.test' + path, options), { PUBLISH_BUCKET: port });
  const failure = async (path, status = 503, options) => {
    const response = await send(path, options); assert.equal(response.status, status);
    if (options?.method !== 'HEAD') assert.deepEqual(await response.json(), { error: status === 404 ? 'PROGRAM_ASSET_NOT_FOUND' : 'PROGRAM_ASSET_UNAVAILABLE' });
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  };
  const originalSource = new Map(first.files); first.files.clear(); // Cold read; source is gone.
  const puts = writes.length;
  for (const [path, mime] of [['src/late.js', 'text/javascript; charset=utf-8'], ['grf/late.bin', 'application/octet-stream'], ['empty.txt', 'text/plain; charset=utf-8'], ['data.json', 'application/json; charset=utf-8']]) {
    const result = await send(prefix + path); assert.equal(result.status, 200); assert.equal(result.headers.get('content-type'), mime);
    assert.equal(result.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), originalSource.get(path)); check();
  }
  // 2026-11-07：任何已註冊檔案都可帶單一 `v` 快取破除參數（開場音樂就靠它），位元組不變。
  for (const [path, query] of [[tacticalPaths[0], '?v=other'], ['intro/assets/opening.mp3', '?v=2f00b4805ba824ab']]) {
    if (!originalSource.has(path)) continue;
    const plain = await send(prefix + path), alias = await send(prefix + path + query);
    assert.equal(plain.status, 200); assert.equal(alias.status, 200);
    assert.deepEqual([...alias.headers], [...plain.headers]);
    assert.deepEqual(Buffer.from(await alias.arrayBuffer()), originalSource.get(path));
    check();
  }
  for (const path of tacticalPaths) {
    const plain = await send(prefix + path), alias = await send(prefix + path + spriteQuery);
    assert.equal(plain.status, 200); assert.equal(alias.status, 200);
    assert.deepEqual([...alias.headers], [...plain.headers]); assert.equal(alias.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await plain.arrayBuffer()), originalSource.get(path));
    assert.deepEqual(Buffer.from(await alias.arrayBuffer()), originalSource.get(path));
    const head = await send(prefix + path + spriteQuery, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.deepEqual([...head.headers], [...alias.headers]); check();
  }
  // 查詢形狀被拒時必須在碰桶之前就結束（reads 必須是 0）。
  for (const query of ['?', '?v=', '?v=original-sprites-1&v=original-sprites-1', '?v=original-sprites-1&x=1', '?x=1&v=original-sprites-1', '?v=original-sprites-1&', '?%76=original-sprites-1', '?v=original%2Dsprites-1', '?v=original-sprites-1%20', '?V=original-sprites-1']) {
    const path = tacticalPaths[0] + query;
    reads.length = 0; await failure(prefix + path, 404); if (!workerd) assert.equal(reads.length, 0);
    const direct = await program.fetch(new Request('https://program.test' + prefix + path), { get PUBLISH_BUCKET() { assert.fail('invalid query touched bucket'); } });
    assert.equal(direct.status, 404); check();
  }
  // 路徑形狀的拒絕與查詢無關（查詢只驗形狀），所以這些不附 spriteQuery。
  for (const path of ['index.html', 'image.svg', 'battle_units.png', 'grf/other/battle_units.png', 'grf/battle_terrain_3.png', 'grf/battle_terrain_00.png', 'grf/BATTLE_UNITS.png', 'grf/%62attle_units.png', 'grf/battle_units.PNG', 'grf/battle_units.png/extra']) {
    await failure(prefix + path, 404); check();
  }
  {
    const fragment = await send(prefix + 'intro/scene.html'); assert.equal(fragment.status, 200);
    assert.equal(fragment.headers.get('content-type'), 'text/plain; charset=utf-8'); assert.equal(fragment.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(fragment.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await fragment.arrayBuffer()), originalSource.get('intro/scene.html'));
    const head = await send(prefix + 'intro/scene.html', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    for (const name of ['content-type', 'cache-control', 'x-content-type-options', 'cross-origin-resource-policy', 'referrer-policy'])
      assert.equal(head.headers.get(name), fragment.headers.get(name));
    assert.equal(Number(head.headers.get('content-length')), originalSource.get('intro/scene.html').length);
    // Miniflare may gzip/chunk the text GET while HEAD keeps the logical size.
    if (fragment.headers.has('content-length')) assert.equal(Number(fragment.headers.get('content-length')), originalSource.get('intro/scene.html').length);
    else { assert.equal(workerd, true); assert.equal(fragment.headers.get('mf-content-encoding'), 'gzip'); assert.equal(fragment.headers.get('transfer-encoding'), 'chunked'); }
    check();
  }
  // 帶單一 `v` 的 fragment 現在被允許（見上），型別仍是 text/plain，故不在此列。
  for (const path of ['intro/scene.html?', 'intro/Scene.html', 'intro/%73cene.html', 'scene.html', 'intro/other.html', 'intro/scene.htm', 'intro/scene.html/extra']) {
    await failure(prefix + path, 404);
    const direct = await program.fetch(new Request('https://program.test' + prefix + path), { get PUBLISH_BUCKET() { assert.fail('invalid fragment path touched bucket'); } });
    assert.equal(direct.status, 404); check();
  }
  for (const key of [first.key, first.base + 'static-release.json', first.base + 'files/intro/scene.html']) {
    const saved = await raw.get(key); await raw.remove(key); await failure(prefix + 'intro/scene.html'); await raw.seed(key, saved.bytes, saved.mime); check();
  }
  const head = await send(prefix + 'src/late.js', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(Number(head.headers.get('content-length')), originalSource.get('src/late.js').length); check();
  for (const path of ['/program-assets', '/program-assets/', '/program-assets/no/src/main.js', prefix + 'index.html', prefix + 'image.svg', prefix + '_headers', prefix + 'static-release.json', prefix + 'src/%6cate.js', prefix + 'src/late.js?x=1', prefix + 'src//late.js', prefix + 'src/.secret.js', prefix + 'src/file.exe']) {
    reads.length = 0; await failure(path, 404); if (!workerd) assert.equal(reads.length, 0); check();
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) { reads.length = 0; await failure(prefix + 'src/late.js', 404, { method }); if (!workerd) assert.equal(reads.length, 0); check(); }
  await failure(prefix + 'src/missing.js', 404); check();
  const manifestKey = first.base + 'static-release.json', fileKey = first.base + 'files/src/late.js';
  for (const [key, faults] of [[first.key, ['missing', 'mime', 'bad', 'oversize', 'source']], [manifestKey, ['missing', 'mime', 'bad', 'oversize']], [fileKey, ['missing', 'mime', 'bad', 'short', 'long']]]) {
    const saved = await raw.get(key);
    for (const fault of faults) {
      if (fault === 'missing') await raw.remove(key);
      else {
        let bytes = saved.bytes, mime = saved.mime;
        if (fault === 'mime') mime = 'text/plain';
        if (fault === 'bad') bytes = Buffer.from('corrupt');
        if (fault === 'oversize') bytes = Buffer.alloc(key === first.key ? 513 : 2 * 1024 * 1024 + 1);
        if (fault === 'source') bytes = programRegistrationBytes(first.sha256, 'f'.repeat(64));
        if (fault === 'short') bytes = bytes.subarray(1);
        if (fault === 'long') bytes = Buffer.concat([bytes, Buffer.from('extra')]);
        await raw.seed(key, bytes, mime);
      }
      await failure(prefix + 'src/late.js'); await raw.seed(key, saved.bytes, saved.mime); check();
    }
  }
  // Aliases retain registration, manifest and file gates on every request.
  for (const key of [first.key, manifestKey, first.base + 'files/' + tacticalPaths[0]]) {
    const saved = await raw.get(key);
    for (const fault of ['missing', 'mime', 'bytes']) {
      if (fault === 'missing') await raw.remove(key);
      else await raw.seed(key, fault === 'bytes' ? Buffer.from('bad') : saved.bytes, fault === 'mime' ? 'text/plain' : saved.mime);
      await failure(prefix + tacticalPaths[0] + spriteQuery);
      await raw.seed(key, saved.bytes, saved.mime); check();
    }
  }
  // Valid full-byte digest and matching registration cannot bless a false source-tree digest.
  const forged = { ...first.manifest, sourceTreeDigest: 'f'.repeat(64) }, forgedBytes = Buffer.from(JSON.stringify(forged)), forgedDigest = sha(forgedBytes);
  const forgedKey = programRegistrationKey(forgedDigest), forgedManifest = `artifacts/programs/${forgedDigest}/static-release.json`;
  allowed.add(forgedKey); allowed.add(forgedManifest);
  await raw.seed(forgedKey, programRegistrationBytes(forgedDigest, forged.sourceTreeDigest)); await raw.seed(forgedManifest, forgedBytes);
  assert.throws(() => parseStaticRelease(forgedBytes, forgedDigest)); await failure('/program-assets/' + forgedDigest + '/src/late.js'); check();
  // These race/malformed-port checks run the Node module over the SAME backing
  // bucket even in workerd mode; they are not claims about worker scheduling.
  for (const changedKey of [manifestKey, first.key]) {
    const saved = await raw.get(changedKey); let count = 0;
    const response = await program.fetch(new Request('https://program.test' + prefix + 'src/late.js'), { PUBLISH_BUCKET: { async get(key) {
      if (key === changedKey && ++count === 2) await raw.seed(key, Buffer.from('changed'));
      return port.get(key);
    } } });
    assert.equal(response.status, 503); assert.equal(count, 2); await raw.seed(changedKey, saved.bytes, saved.mime); check();
  }
  for (const fault of ['size', 'overflow', 'truncated', 'chunk', 'read-error', 'get-error']) {
    let cancelled = 0;
    const response = await program.fetch(new Request('https://program.test' + prefix + 'src/late.js'), { PUBLISH_BUCKET: { async get(key) {
      if (key !== fileKey) return port.get(key);
      if (fault === 'get-error') throw new Error('owned transport failure');
      const row = await port.get(key);
      if (fault === 'size') { row.size = 26 * 1024 * 1024; return row; }
      row.body = new ReadableStream({ start(controller) {
        if (fault === 'read-error') { controller.error(new Error('owned stream failure')); return; }
        if (fault === 'truncated') { controller.close(); return; }
        controller.enqueue(fault === 'chunk' ? 'not bytes' : new Uint8Array(row.size + 1));
      }, cancel() { cancelled++; } });
      return row;
    } } });
    assert.equal(response.status, 503); if (fault === 'overflow' || fault === 'chunk') assert.equal(cancelled, 1); check();
  }
  for (const abortAt of [1, 2, 3, 4, 5]) {
    const owner = new AbortController(); let calls = 0;
    const response = await program.fetch(new Request('https://program.test' + prefix + 'src/late.js', { signal: owner.signal }), { PUBLISH_BUCKET: { async get(key) { const value = await port.get(key); if (++calls === abortAt) owner.abort(); return value; } } });
    assert.equal(response.status, 503); assert.equal(calls, abortAt); check();
  }
  const second = await stage(2); first.files.clear(); second.files.clear();
  assert.equal(await (await send(prefix + 'src/late.js')).text(), 'export const version = 1;');
  assert.equal(await (await send('/program-assets/' + second.sha256 + '/src/late.js')).text(), 'export const version = 2;'); check();
  for (const path of tacticalPaths) {
    for (const [f, version] of [[first, 1], [second, 2]]) {
      const response = await send('/program-assets/' + f.sha256 + '/' + path + spriteQuery);
      assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), tacticalBytes(path, version));
    }
    check();
  }
  for (const [f, version] of [[first, 1], [second, 2]]) {
    const result = await send('/program-assets/' + f.sha256 + '/intro/scene.html'); assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), 'text/plain; charset=utf-8'); assert.equal(await result.text(), '<main>owned fragment ' + version + '</main>');
  } check();
  const registration = await raw.get(first.key); await raw.remove(first.key);
  await failure(prefix + 'src/late.js'); assert.ok(await raw.get(fileKey)); await raw.seed(first.key, registration.bytes); check();
  assert.equal(writes.length, puts * 2, 'HTTP reads must never write or repair objects');
  assert.equal(outbound, 0);
  process.stdout.write(JSON.stringify({ checks, workerd, outbound, scope: 'Small real-staged/registered software fixtures read cold through owned HTTP worker/R2 or Node memory. Race/stream/abort checks use Node over the same backing bucket. No HTML entry, game admission, current software selection, browser App, TLS/cloud, full package or compatibility proof.' }) + '\n');
} finally { await mf?.dispose(); if (own) rmSync(own, { recursive: true, force: true }); }
