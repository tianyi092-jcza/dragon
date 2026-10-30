// TRIAL-APP-BOOT-1 (H slice): Trial browser App boot against the real backend.
// Node does the proven bootstrap (loopback HTTPS workerd + R2 install + real
// login/rotate + full copy + draft read + trial issue). A same-origin proxy
// serves web/ for real and forwards /api/* byte-identical with the proven admin
// session injected (zero prod change). Real Chromium + fresh profile loads the
// true trial shell page (?trial=<uuid>, auto-boot on #trial-status), picks the
// first faction, starts the run, and boots the real engine via openApp.
// Asserts: faction panel, running status line, live rAF loop, zero page errors;
// then the trial is ended via API: the monitor must retire the actual App,
// discard its scenario and show the terminal message without page errors.
// NOT covered: login/session UI in the browser, save/load (disabled by design),
// game-side App, publish UI, concurrency.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
const round = process.argv[2], nodePortrait = process.argv[3] === '--node-portrait';
assert.match(round ?? '', /^[1-9][0-9]{0,2}$/); assert.ok(process.argv.length === 3 || process.argv.length === 4 && nodePortrait);
const base = '.dragon-analysis/editor-phase/trial-app-boot-r1'; mkdirSync(base, { recursive: true });
const out = `${base}/attempt${round}`; mkdirSync(out);
const sha = b => createHash('sha256').update(b).digest('hex');
const parse = text => { try { return JSON.parse(text); } catch (cause) { throw new Error('owned boot JSON', { cause }); } };
const inputs = ['server/worker.js', 'server/trials.js', 'server/public/trialapp.txt', 'server/public/trialweb.txt', 'web/src/editor/servertrialapp.js', 'web/src/editor/trialconnection.js', 'web/src/editor/trialconnectionmonitor.js', 'web/src/editor/trialstatusadapter.js', 'tools/verify_trial_app_boot.mjs', 'tools/editor_stage_source.mjs', 'tools/editor_stage_library.mjs'];
if (nodePortrait) inputs.push('server/editorapp.js', 'server/portraits.js', 'server/drafts.js', 'server/public/draft.txt', 'vps/editor-server.mjs', 'vps/sqlite-port.mjs', 'vps/file-bucket.mjs', 'tools/editor_local_https.mjs', 'web/src/content/authoring/trialruntime.js', 'web/src/core/assets.js', 'web/src/ui/gamebar.js', 'web/kao/manifest.js', 'web/kao/p0001.png');
const pins = {};
for (const [i, name] of inputs.entries()) { const bytes = readFileSync(name); pins[name] = sha(bytes); writeFileSync(`${out}/input-${i}.txt`, bytes, { flag: 'wx' }); }
writeFileSync(`${out}/inputs.json`, JSON.stringify(pins, null, 2), { flag: 'wx' });
const checks = [];
const check = name => { checks.push(name); writeFileSync(`${out}/partial.json`, JSON.stringify({ checks }, null, 2)); };
const port = 18981, origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'trial-boot-'));
const initial = (randomBytes(16).toString('hex') + 'Aa1!'), password = (randomBytes(16).toString('hex') + 'Aa1!');
let mf = null, server = null, nodeStorage = null, nodeTransport = null;
const portraitResponses = [];
function req(path, value, session, extra = {}, timeoutMs = 120000) {
  return new Promise((done, reject) => {
    const started = Date.now();
    const headers = { Origin: origin, ...extra };
    if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
    if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
    const q = httpsRequest(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false, agent: false }, response => {
      const chunks = []; response.on('data', b => chunks.push(b)); response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, bytes: Buffer.concat(chunks), cookie: response.headers['set-cookie']?.[0]?.split(';')[0], shaHeader: response.headers['x-content-sha256'], mime: response.headers['content-type'], ms: Date.now() - started }));
    });
    q.on('error', reject); q.setTimeout(timeoutMs, () => q.destroy(new Error('owned HTTPS timeout')));
    q.end(value === undefined ? undefined : JSON.stringify(value));
  });
}
try {
  if (nodePortrait) {
    const { openStorage } = await import('../vps/sqlite-port.mjs');
    const { FileBucket } = await import('../vps/file-bucket.mjs');
    const { createEditorService } = await import('../vps/editor-server.mjs');
    const { createEditorHTTPS } = await import('./editor_local_https.mjs');
    nodeStorage = openStorage(join(own, 'authority.sqlite'));
    const bucket = new FileBucket({ root: join(own, 'bucket') });
    const operatorBucket = { get: key => bucket.get(key), put(key, bytes, options) {
      assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    } };
    const source = await stageInstalledEditorSource(operatorBucket), library = await stageInstalledAvailableLibrary(operatorBucket);
    writeFileSync(`${out}/staged.json`, JSON.stringify({ source, library }, null, 2), { flag: 'wx' });
    check('fresh-approved-source-and-library-staged');
    const service = createEditorService({ storage: nodeStorage, bucket, env: { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_DEFAULT_PASSWORD: initial, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source), EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library) } });
    nodeTransport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
  } else {
  const location = process.env.MINIFLARE_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js';
  const { Miniflare } = await import(pathToFileURL(location).href);
  let stage = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("stage")}}', compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], r2Buckets: ['EDITOR_BLOBS'], r2Persist: own });
  const bucket = await stage.getR2Bucket('EDITOR_BLOBS');
  const source = await stageInstalledEditorSource(bucket), library = await stageInstalledAvailableLibrary(bucket);
  writeFileSync(`${out}/staged.json`, JSON.stringify({ source, library }, null, 2), { flag: 'wx' });
  await stage.dispose(); stage = null;
  check('fresh-approved-source-and-library-staged');
  mf = new Miniflare({ modules: true, scriptPath: resolve('server/worker.js'), rootPath: resolve('server'), modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }, { type: 'Text', include: ['**/*.txt', '**/*.html', '**/*.css'] }], compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], durableObjects: { EDITOR_METADATA: { className: 'EditorMetadata', useSQLite: true } }, r2Buckets: ['EDITOR_BLOBS'], r2Persist: own, durableObjectsPersist: own, bindings: { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_DEFAULT_PASSWORD: initial, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source), EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library) }, https: true, port, host: '127.0.0.1' });
  await mf.ready;
  }
  const ok = async (name, path, value, session, status = 200, extra, timeoutMs) => {
    const r = await req(path, value, session, extra, timeoutMs);
    writeFileSync(`${out}/http-${checks.length}.json`, JSON.stringify({ path, status: r.status, ms: r.ms, shaHeader: r.shaHeader ?? null, body: (r.mime ?? '').includes('json') ? r.bytes.toString('utf8').slice(0, 400) : `<${r.bytes.length} bytes>` }, null, 2), { flag: 'wx' });
    assert.equal(r.status, status, `${name}: ${r.bytes.toString('utf8').slice(0, 200)}`);
    check(name); return r;
  };
  const login = await ok('real-login', '/api/auth/login', { account: 'tianyi', password: initial }, null);
  const first = { cookie: login.cookie, csrf: parse(login.bytes.toString('utf8')).csrf };
  const rotated = await ok('real-rotate', '/api/auth/password', { oldPassword: initial, newPassword: password }, first);
  const admin = { cookie: rotated.cookie, csrf: parse(rotated.bytes.toString('utf8')).csrf };
  await ok('real-install-source', '/api/admin/source/install', {}, admin);
  await ok('real-install-library', '/api/admin/library/install', {}, admin);
  const def = parse((await ok('real-source-def', '/api/admin/source', undefined, admin)).bytes.toString('utf8')).definition;
  const key = randomUUID();
  await ok('real-copy-reserve', '/api/admin/copies', { registryId: def.registryId, name: '启动验证', introduction: '' }, admin, 202, { 'Idempotency-Key': key });
  const copied = parse((await ok('real-copy-run', `/api/admin/copies/${key}/run`, {}, admin, 200, { 'If-Match': '"1"' }, 600000)).bytes.toString('utf8'));
  const draft = parse((await ok('real-draft-read', `/api/games/${copied.gameId}/draft?revision=1`, undefined, admin, 200, {}, 600000)).bytes.toString('utf8'));
  let trialRevision = draft.draftRevision, portraitDeclaration = null;
  if (nodePortrait) {
    const { KAO_MANIFEST } = await import('../web/kao/manifest.js');
    portraitDeclaration = KAO_MANIFEST.find(row => row.id === 'p0001');
    const portraitBytes = readFileSync('web/kao/p0001.png');
    assert.equal(sha(portraitBytes), portraitDeclaration.sha256); assert.equal(portraitBytes.length, portraitDeclaration.bytes);
    const saved = parse((await ok('real-shared-portrait-save', `/api/games/${copied.gameId}/draft/save`, { metadata: draft.metadata, resourceEdits: [], chapterEdits: [{ op: 'portrait', chapterId: draft.chapters[0].chapterId, generalIdx: 0, portraitKey: 'p0001' }] }, admin, 200, { 'If-Match': `"${draft.draftRevision}"` }, 600000)).bytes.toString('utf8'));
    trialRevision = saved.draftRevision; assert.equal(trialRevision, '2');
    const current = parse((await ok('real-shared-portrait-read2', `/api/games/${copied.gameId}/draft?revision=2`, undefined, admin, 200, {}, 600000)).bytes.toString('utf8'));
    const expected = structuredClone(draft.chapters); expected[0].generals.find(row => row.idx === 0).portraitKey = 'p0001';
    assert.deepEqual(current.chapters, expected);
    const old = parse((await ok('real-original-read1', `/api/games/${copied.gameId}/draft?revision=1`, undefined, admin, 200, {}, 600000)).bytes.toString('utf8'));
    assert.deepEqual(old, draft);
  }
  const trial = parse((await ok('real-trial-start', `/api/games/${copied.gameId}/trials`, { expectedRevision: trialRevision, chapterId: draft.chapters[0].chapterId }, admin, 200, {}, 600000)).bytes.toString('utf8'));
  assert.match(trial.trialId, /^[a-f0-9-]{36}$/);
  check('bootstrap-trial-issued');
  const jar = { cookie: admin.cookie, csrf: admin.csrf };
  const traffic = [];
  const logTraffic = (method, path, status) => { traffic.push(`${method} ${path} -> ${status}`); writeFileSync(`${out}/traffic.log`, traffic.join('\n') + '\n'); };
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const pieces = [];
      request.on('data', b => pieces.push(b));
      request.on('end', () => {
        const body = Buffer.concat(pieces);
        const headers = { Origin: origin, Cookie: jar.cookie, 'X-CSRF-Token': jar.csrf };
        if (body.length > 0) { headers['Content-Type'] = request.headers['content-type'] ?? 'application/json'; headers['Content-Length'] = body.length; }
        if (request.headers['idempotency-key']) { headers['Idempotency-Key'] = request.headers['idempotency-key']; }
        else if (request.method !== 'GET') { headers['Idempotency-Key'] = randomUUID(); }
        const q = httpsRequest(origin + url.pathname + url.search, { method: request.method, headers, rejectUnauthorized: false, agent: false }, upstream => {
          if (upstream.headers['set-cookie']?.[0]) { const next = upstream.headers['set-cookie'][0].split(';')[0]; if (next !== jar.cookie) { traffic.push(`jar-rotated ${jar.cookie.slice(0, 18)} -> ${next.slice(0, 18)} on ${request.method} ${url.pathname}`); jar.cookie = next; } }
          const chunks = [];
          upstream.on('data', b => chunks.push(b));
          upstream.on('end', () => {
            logTraffic(request.method, url.pathname + url.search, upstream.statusCode);
            if (upstream.statusCode !== 200 && upstream.statusCode !== 201 && upstream.statusCode !== 202) { writeFileSync(`${out}/fail-${traffic.length}.json`, JSON.stringify({ method: request.method, path: url.pathname + url.search, status: upstream.statusCode, body: Buffer.concat(chunks).toString('utf8').slice(0, 500) }, null, 2)); }
            const bytes = Buffer.concat(chunks);
            if (nodePortrait && url.pathname === '/api/trial/web/kao/p0001.png') portraitResponses.push({ path: url.pathname, status: upstream.statusCode, byteLength: bytes.length, sha256: sha(bytes), declaredSha256: upstream.headers['x-content-sha256'], mime: upstream.headers['content-type'], cache: upstream.headers['cache-control'] });
            response.writeHead(upstream.statusCode, { 'Content-Type': upstream.headers['content-type'] ?? 'application/octet-stream', ...Object.fromEntries(['cache-control', 'x-content-type-options', 'x-content-sha256'].filter(name => upstream.headers[name]).map(name => [name, upstream.headers[name]])) });
            response.end(bytes);
          });
          upstream.on('error', () => { response.writeHead(502); response.end(); });
        });
        q.on('error', () => { response.writeHead(502); response.end(); });
        q.end(body.length > 0 ? body : undefined);
      });
      return;
    }
    const path = resolve('web', url.pathname.slice(1));
    if (!path.startsWith(resolve('web'))) { response.writeHead(403); response.end(); return; }
    try {
      const bytes = readFileSync(path);
      response.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' }); response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const pageOrigin = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  const browser = await chromium.launch({ env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key))) }), page = await browser.newPage({ serviceWorkers: 'block' });
  const errors = [], failedRequests = [], forbidden = [];
  await page.addInitScript(() => {
    window.__ownedIdbReads = 0;
    Object.defineProperty(window, 'indexedDB', { get() { window.__ownedIdbReads++; throw new Error('Trial cannot access saves'); } });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if ((url.protocol === 'blob:' && url.origin === pageOrigin) || (url.origin === pageOrigin && !/save\.dat/i.test(url.pathname))) return route.continue();
    forbidden.push(url.href); return route.abort();
  });
  page.on('pageerror', error => errors.push(String(error).slice(0, 300)));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.slice(0, 200)));
  try {
    // The real shipped shell page (trialapp.txt via workerd) with its real bundle
    // modules; same-origin /api/* keeps hitting this proxy and its session jar.
    await page.goto(`${pageOrigin}/api/trial/web/?trial=${trial.trialId}`);
    await page.waitForSelector('#trial-faction', { timeout: 120000 });
    check('browser-faction-panel');
    const options = await page.locator('#trial-faction option').count();
    assert.ok(options > 0, 'faction options');
    check('browser-faction-options');
    assert.equal(await page.locator('input[type=file]').count(), 0);
    const startBox = await page.locator('#start-trial').boundingBox(), viewport = page.viewportSize();
    assert.ok(startBox && startBox.x >= 0 && startBox.y >= 0 && startBox.x + startBox.width <= viewport.width && startBox.y + startBox.height <= viewport.height);
    await page.screenshot({ path: `${out}/choice.png` });
    check('shared-portrait-only chooser has a reachable ordinary start button');
    await page.locator('#trial-faction').selectOption({ index: 0 });
    await page.getByRole('button', { name: '開始試運行' }).click();
    await page.waitForFunction(() => document.getElementById('trial-status').textContent.includes('僅記憶體'), null, { timeout: 180000 });
    check('browser-booted-running');
    const frames = await page.evaluate(() => new Promise(done => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) { requestAnimationFrame(tick); } else { done(n); } };
      requestAnimationFrame(tick);
    }));
    assert.ok(frames > 10, `rAF frames in 2s: ${frames}`);
    check('browser-engine-loop-live');
    const canvasCount = await page.locator('canvas').count();
    assert.ok(canvasCount > 0, 'engine canvas present');
    check('browser-engine-canvas');
    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    check('no-page-errors-before-end');
    await page.screenshot({ path: `${out}/running.png` });
    // The engine streams derived assets lazily after reporting running; ending
    // before they land races its loads (attempt6 self-inflicted 401s). Quiesce:
    // wait until all six derived-asset paths have each returned 200.
    const derived = ['terrain', 'roadCost', 'roadOffset', 'roadGraph', 'minimapBase', 'minimapLarge'];
    const landed = () => derived.filter(name => traffic.some(t => t.includes(`/assets/${name} -> 200`)));
    const t0 = Date.now();
    while (landed().length < derived.length && Date.now() - t0 < 180000) { await page.waitForTimeout(2000); }
    assert.deepEqual(landed().sort(), derived.sort(), 'derived assets landed');
    check('browser-derived-assets-landed');
    await page.waitForFunction(() => window.__app?.runtimeEnabled === true && window.__app?.gameStarted === true && !window.__app?._scenarioAssemblyPending && !window.__app?._scenarioAssemblyIncomplete && window.__app?.scenario?.cities?.length === 192, null, { timeout: 120000 });
    assert.equal(await page.evaluate(() => window.__ownedIdbReads), 0); assert.deepEqual(forbidden, []);
    assert.ok(!traffic.some(line => /^POST .*\/portraits/.test(line)));
    check('actual App active with 192 cities; no save access, outside traffic or portrait upload');
    if (nodePortrait) {
      // Invoke the existing presentation consumer, not a synthetic Image or a
      // rule command. This is not a certificate for menu navigation to the card.
      const card = await page.evaluate(async () => {
        const app = window.__app, general = app.scenario.generals.find(row => row.idx === 0);
        await app.gamebar.showGeneralCard(general);
        const image = app.gamebar.generalCard.img;
        return { portrait: general.portrait, portraitKey: general.portraitKey, src: image?.currentSrc, width: image?.naturalWidth, height: image?.naturalHeight };
      });
      assert.equal(card.portrait, draft.chapters[0].generals.find(row => row.idx === 0).portrait);
      assert.equal(card.portraitKey, 'p0001'); assert.equal(card.src, pageOrigin + '/api/trial/web/kao/p0001.png');
      assert.equal(card.width, 120); assert.equal(card.height, 120);
      assert.ok(portraitResponses.length > 0);
      for (const response of portraitResponses) { assert.equal(response.status, 200); assert.equal(response.sha256, portraitDeclaration.sha256); assert.equal(response.declaredSha256, portraitDeclaration.sha256); assert.equal(response.byteLength, portraitDeclaration.bytes); assert.equal(response.mime, 'image/png'); assert.equal(response.cache, 'no-store'); }
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
      check('saved p0001 loads through real Trial App general-card consumer with exact bytes, hash and decoded dimensions');
    }
    await page.screenshot({ path: `${out}/loaded.png` });
    await ok('real-trial-end', `/api/trials/${trial.trialId}/end`, {}, admin);
    await page.waitForFunction(() => window.__app?.trialEnded === true && window.__app?.runtimeEnabled === false && window.__app?.scenario === null && document.querySelector('#trial-status')?.textContent.includes('已結束'), null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.__app.trialGate.state), 'ended');
    check('explicit end retires the actual App, clears its scenario and displays the terminal message');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.__ownedIdbReads), 0); assert.deepEqual(forbidden, []);
    check('page-tolerates-end-without-errors');
    await page.screenshot({ path: `${out}/after-end.png` });
  } catch (cause) {
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    let rowState = null;
    try { rowState = parse((await req(`/api/trials/${trial.trialId}/status`, undefined, admin)).bytes.toString('utf8')); }
    catch (error) { rowState = { probeError: String(error).slice(0, 200) }; }
    writeFileSync(`${out}/browser-failure.json`, JSON.stringify({ status: await page.locator('#trial-status').textContent().catch(() => null), errors, failedRequests, rowState, jarPrefix: jar.cookie.slice(0, 18) }, null, 2), { flag: 'wx' });
    throw cause;
  } finally { await browser.close(); }
  for (const name of inputs) { assert.equal(sha(readFileSync(name)), pins[name], name); }
  writeFileSync(`${out}/receipt.json`, JSON.stringify({ checks, pins, gameId: copied.gameId, trialId: trial.trialId, trialRevision, portraitResponses, platform: nodePortrait ? 'Node SQLite/FileBucket + owned HTTPS' : 'workerd SQLite/R2', limits: 'Real Chromium boots the true trial shell + engine against the selected owned backend with proven admin session proxied server-side. No in-browser login/session UI, no save/load (disabled by trial design), no game-side App/publish/concurrency; terminal App disposal and ended message checked.' }, null, 2), { flag: 'wx' });
  process.stdout.write(`Trial app boot H PASS ${checks.length} checks\n`);
} finally { writeFileSync(`${out}/partial.json`, JSON.stringify({ checks }, null, 2)); server?.close(); await mf?.dispose(); await nodeTransport?.close(); nodeStorage?.close(); }
