// Fresh browser -> actual editor gateway/auth/SQL/compiler -> actual owned
// workerd R2 -> default publisher -> actual workerd reader. Browser requests are
// bridged in-process, NOT API fixtures or a production TCP/TLS/S3 deployment.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createPublicationBrowserAuthority } from './fixtures/publication-browser-authority.mjs';
import { makePublishRuntimeStage } from './fixtures/publish-runtime-stage.mjs';
import { createRuntimeStager } from '../vps/runtime-stage.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { rootVisibleAt } from '../reader/firstonline.js';
import { createPlayerClientBrowserProbe, assertCompletedStreamObservation } from './fixtures/player-client-browser.mjs';
import { createPublishedAppBrowserProbe } from './fixtures/published-app-browser.mjs';
import { createPublicPlayerBrowserProbe } from './fixtures/public-player-browser.mjs';
const nodeService = process.argv.includes('--node-service');
const reviewUI = process.argv.includes('--review-ui');
const deleteUI = process.argv.includes('--delete-ui');
const adminDeleteUI = process.argv.includes('--admin-delete-ui');
const playerClient = process.argv.includes('--player-client');
const playerApp = process.argv.includes('--player-app');
const publicPlayer = process.argv.includes('--public-player');
const programPaths = process.argv.includes('--program-paths');
assert.ok(!programPaths || publicPlayer, 'program paths require public entry mode');
assert.ok(!publicPlayer || playerApp, 'public production entry requires App mode');
assert.ok(!playerApp || playerClient, 'App stream observations require the player-client mode');
assert.ok(!adminDeleteUI || deleteUI, 'admin deletion requires the deletion UI mode');
assert.ok(!adminDeleteUI || reviewUI, 'admin deletion drives the review panel');
assert.ok(process.argv.slice(2).every(arg => ['--node-service','--review-ui','--delete-ui','--admin-delete-ui','--player-client','--player-app','--public-player','--program-paths'].includes(arg)), 'unknown test option');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
let modulePath;
try { modulePath = require.resolve('miniflare'); }
catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
if (!existsSync(modulePath)) throw new Error('installed Miniflare required; no installation');
const { Miniflare } = await import(pathToFileURL(modulePath).href);
const own = mkdtempSync(join(tmpdir(), 'dragon-publication-browser-'));
mkdirSync('.dragon-analysis/release-readiness', { recursive: true });
const artifact = mkdtempSync('.dragon-analysis/release-readiness/publication-chain-browser-');
const origin = 'https://owned-editor.invalid', playerOrigin = 'https://reader.test';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(k)));
const files = ['index.html','style.css','shell-ui.txt','shell-ui.css','client.txt','draft.txt','stage.txt','library.txt','catalog.txt','management.txt','publish.txt','stronghold.txt','general.txt','mapview.txt','stageassets.txt'];
const sources = Object.fromEntries(files.map(name => ['server/public/' + name, sha(readFileSync('server/public/' + name))]));
for (const path of ['reader/site.js', 'reader/worker.js']) sources[path] = sha(readFileSync(path));
const checks = [], calls = [], errors = [], consoleErrors = [], failed = [], failedDetails = [], completedStreamFailures = [], outside = [], posts = [];
let browser, mf, authority, reopened, bucket, stage = 'bootstrap', outbound = 0, roots = 0, gets = 0, puts = 0, staticChecks = 0, lost = false, failReceipt = true;
try {
  // API requests exercise the deployed site entry; static files below still
  // use the owned byte bridge, not this test's Assets routing configuration.
  mf = new Miniflare({ modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/site.js'), compatibilityDate: '2024-01-01', host: '127.0.0.1', port: 0, r2Buckets: ['PUBLISH_BUCKET'], r2Persist: join(own, 'r2'), bindings: { PLAYER_ORIGIN: playerOrigin, PLAYER_ADMISSION_ACTIVE_KEY: 'owned', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned: '11'.repeat(32) }) }, outboundService: () => { outbound++; return new Response('forbidden', { status: 403 }); } });
  await mf.ready; bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  const packaged = makePublishRuntimeStage({ root: join(own, 'static-package'), includePlayerModules: playerApp });
  // Seed only the fixed shared image library, never a runtime/projection fixture.
  for (const [key, row] of packaged.objects) {
    const path = key.slice(packaged.prefix.length); assert.match(path, /^kao\/p?[0-9]{1,6}\.png$/);
    await bucket.put(path, row.bytes, { httpMetadata: { contentType: 'image/png' } });
  }
  assert.equal(packaged.objects.size, 621);
  let directories = 0;
  const r2 = {
    async get(key, { maxBytes }) {
      assert.match(key, /^(artifacts|kao|projections|control)\//); gets++;
      const row = await bucket.get(key); if (!row) return null;
      assert.ok(row.size <= maxBytes);
      return { bytes: new Uint8Array(await row.arrayBuffer()), headers: { 'content-type': row.httpMetadata.contentType, etag: row.httpEtag, 'last-modified': row.uploaded.toUTCString() } };
    },
    async putImmutable(key, bytes, contentType) {
      assert.equal(arguments.length, 3); assert.match(key, /^(artifacts\/|projections\/|control\/(receipts|roots)\/)/);
      if (failReceipt && key.startsWith('control/receipts/')) throw new Error('owned receipt outage');
      puts++; return await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType } }) !== null;
    },
    async putControl(key, bytes, etag) {
      // 游戏级目录指针（A 批）与根共用一个条件写端口，它是独立的 key，不计入根代次。
      assert.equal(arguments.length, 3);
      if (key === 'control/directory.json') { directories++; return await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } }) !== null; }
      assert.equal(key, 'control/current.json');
      const value = await bucket.put(key, bytes, { onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag.slice(1, -1) }, httpMetadata: { contentType: 'application/json' } });
      if (value !== null) roots++; return value !== null;
    },
  };
  const verifyStaticResources = async value => { staticChecks++; return packaged.verifyStaticResources(value); };
  const runtimeStager = createRuntimeStager({ r2, verifyStaticResources });
  authority = await createPublicationBrowserAuthority({ root: own, origin, runtimeStager, nodeService });
  const { storage, app, gameId, ownerId } = authority, sql = storage.sql;
  const publisher = createDistributionPublisher({ storage, r2, verifyStaticResources });
  const tail = () => app.frozenDistribution.status().tailGeneration;
  const confirmed = () => app.frozenDistribution.status().confirmedGeneration;
  const drain = async () => { assert.equal((await publisher.drainOne()).state, 'VISIBLE_CONFIRMED'); };
  assert.equal(tail(), 0); assert.equal(await bucket.get('control/current.json'), null);
  assert.equal(packaged.stats().puts, 0, 'the in-memory staging fixture was never used');
  browser = await chromium.launch({ headless: true, env });
  const browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => { window.__ownedIDB = 0; indexedDB.open = () => { window.__ownedIDB++; throw new Error('IDB forbidden in publication test'); }; });
  const observeContext = ctx => ctx.on('page', page => {
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => { const path = new URL(request.url()).pathname; failed.push(path); failedDetails.push({ path, error: request.failure()?.errorText, sequence: request.headers()['x-owned-client-request'] ?? null }); });
    page.on('dialog', dialog => dialog.accept());
  });
  observeContext(context);
  const reviewPosts = [], deletionPosts = []; let lostDeletion = false, playerProbe, appProbe;
  const bridge = async route => {
    const request = route.request(), url = new URL(request.url());
    if (![origin, playerOrigin].includes(url.origin)) { outside.push(url.href); return route.abort(); }
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    if (url.origin === playerOrigin && playerProbe && await playerProbe.serve(route, url)) return;
    if (url.origin === playerOrigin && appProbe && await appProbe.serve(route, url)) return;
    const headers = await request.allHeaders();
    if (url.origin === playerOrigin) assert.equal(headers.cookie, undefined, 'editor cookie cannot reach player origin');
    const init = { method: request.method(), headers };
    if (request.method() === 'POST') init.body = request.postDataBuffer();
    let response;
    if (url.origin === origin) response = await authority.fetch(new Request(request.url(), init));
    else response = await mf.dispatchFetch(request.url(), init);
    const call = { origin: url.origin, path: url.pathname, method: request.method(), status: response.status, sequence: headers['x-owned-client-request'] ?? null };
    calls.push(call);
    if (url.pathname === '/api/publish') {
      let body; try { body = JSON.parse(request.postData()); } catch (cause) { throw new Error('invalid browser JSON', { cause }); }
      posts.push({ key: headers['idempotency-key'], body });
      assert.equal(response.status, 200, await response.clone().text());
      if (!lost) { lost = true; return route.abort('failed'); } // Only drop transport AFTER real commit.
    }
    if (reviewUI && request.method() === 'POST' && /\/api\/(games\/[^/]+\/listing|admin\/games\/[^/]+\/review)$/.test(url.pathname)) {
      reviewPosts.push({ key: headers['idempotency-key'], revision: headers['if-match'], body: request.postData() });
      assert.equal(response.status, 200, await response.clone().text());
    }
    if (deleteUI && request.method() === 'POST' && url.pathname === '/api/games/' + gameId + '/deletion') {
      deletionPosts.push({ key: headers['idempotency-key'], body: request.postData() });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(deletionPosts.length, 1, 'no repeated deletion POST');
      // Author panel: drop the transport only AFTER the real commit; the admin panel keeps its receipt.
      if (!adminDeleteUI && !lostDeletion) { lostDeletion = true; return route.abort('failed'); }
    }
    const body = Buffer.from(await response.arrayBuffer()); call.bytes = body.length;
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  };
  await context.route('**/*', bridge);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const show = async () => { await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); };
  const idle = () => page.waitForFunction(() => !document.querySelector('#publish-refresh').disabled, null, { timeout: 180000 });
  const confirm = async (scope, label) => { await scope.locator('.el-message-box__btns button').filter({ hasText: label }).first().click(); };
  const journal = () => page.evaluate(key => sessionStorage.getItem(key), 'editor-submission-operation:' + ownerId);
  const draftName = sql.exec('SELECT draft_name FROM content_games WHERE game_id=?', gameId).toArray()[0].draft_name;
  const row = page.locator(`#publish-table tr[data-game-id="${gameId}"]`);
  stage = 'real browser password login and real game list';
  await page.goto(origin); await page.waitForSelector('#login');
  await page.fill('#login [name="account"]', authority.account); await page.fill('#login [name="password"]', authority.password); await page.locator('#login').getByRole('button', { name: '登入', exact: true }).click();
  await show(); await page.click('#publish-refresh'); await idle();
  // The list arrives after the refresh settles; the panel keeps no busy flag for it.
  await row.waitFor({ state: 'attached', timeout: 180000 });
  assert.equal(await row.count(), 1, 'the author list holds exactly this game');
  assert.equal(await row.getAttribute('data-state'), 'draft');
  assert.equal((await row.locator('[data-field="version"]').textContent()).trim(), '—');
  assert.equal((await row.locator('[data-field="name"]').textContent()).trim(), draftName);
  checks.push(stage);
  stage = 'lost browser response after actual compile, R2 stage and SQL commit';
  await row.locator('[data-action="publish"]').click(); await confirm(page, '上架'); await idle();
  assert.equal(posts.length, 1); assert.equal(tail(), 1); assert.equal(confirmed(), 0); assert.equal(roots, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM published_pack_chapters').toArray()[0].n, 20);
  let saved; try { saved = JSON.parse(await journal()); } catch (cause) { throw new Error('bad browser journal', { cause }); }
  assert.equal(saved.key, posts[0].key); assert.equal(saved.name, posts[0].body.name);
  assert.equal(saved.name, draftName, 'the panel publishes the stored draft name, not a typed one');
  assert.equal(await page.isDisabled('#publish-retry'), true); checks.push(stage);
  stage = 'reload queries the actual permanent request without reposting';
  const beforeReload = calls.length; await page.reload(); await show();
  assert.equal(posts.length, 1); assert.equal(calls.slice(beforeReload).some(row => row.path.includes('/publish-operations/')), false);
  await page.click('#publish-query'); await idle(); assert.match(await page.locator('#publish-result').textContent(), /本地已提交.*分發待確認/);
  assert.equal(await page.isDisabled('#publish-retry'), true); await page.locator('#publish-editor').screenshot({ path: join(artifact, 'pending.png') }); checks.push(stage);
  stage = 'actual R2 root without durable receipt remains pending in browser';
  assert.equal((await publisher.drainOne()).state, 'COMMITTED_SYNC_PENDING'); assert.equal(roots, 1); assert.equal(confirmed(), 0);
  await page.click('#publish-query'); await idle(); assert.match(await page.locator('#publish-result').textContent(), /分發待確認/);
  const firstRoot = await bucket.get('control/current.json'), firstTime = rootVisibleAt(firstRoot.uploaded);
  failReceipt = false; await drain(); assert.equal(roots, 1); assert.equal(confirmed(), 1);
  await page.click('#publish-query'); await idle(); assert.ok((await page.locator('#publish-result').textContent()).includes(firstTime));
  assert.match(await page.locator('#publish-result').textContent(), /上架與否仍以管理員同意為準/); await page.locator('#publish-editor').screenshot({ path: join(artifact, 'confirmed.png') }); checks.push(stage);
  const player = await context.newPage(); player.setDefaultTimeout(30000);
  if (playerClient) playerProbe = createPlayerClientBrowserProbe({ page: player, context, origin: playerOrigin, gameId, chapters: authority.chapters });
  await player.goto(playerOrigin + '/play-api/v1/registry');
  const playerJSON = path => player.evaluate(async path => { const response = await fetch(path); return { status: response.status, body: await response.json() }; }, path);
  const registry = async () => { const result = await playerJSON('/play-api/v1/registry'); assert.equal(result.status, 200); return result.body; };
  stage = 'hidden publish confirmed, actual reader directory still empty';
  assert.deepEqual((await registry()).directory, []); checks.push(stage);
  stage = 'actual administrator review panel approves the submitted version';
  let adminPage;
  const adminIdle = () => adminPage.waitForFunction(() => !document.querySelector('#review-refresh').disabled, null, { timeout: 180000 });
  const adminShow = async () => { await adminPage.waitForSelector('#menu button[data-view="management-editor"]'); await adminPage.click('#menu button[data-view="management-editor"]'); };
  const adminRow = () => adminPage.locator(`#review-table tr[data-game-id="${gameId}"]`);
  if (reviewUI) {
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
    await adminContext.addInitScript(() => { window.__ownedIDB = 0; indexedDB.open = () => { window.__ownedIDB++; throw new Error('IDB forbidden'); }; });
    observeContext(adminContext); await adminContext.route('**/*', bridge); adminPage = await adminContext.newPage(); adminPage.setDefaultTimeout(30000);
    await adminPage.goto(origin); await adminPage.fill('#login [name="account"]', 'tianyi'); await adminPage.fill('#login [name="password"]', authority.password);
    await adminPage.locator('#login').getByRole('button', { name: '登入', exact: true }).click(); await adminShow();
    await adminPage.click('#review-refresh'); await adminIdle();
    assert.equal(await adminRow().count(), 1, 'the admin list holds the submitted game');
    assert.equal(await adminRow().getAttribute('data-state'), 'pending');
    assert.equal((await adminRow().locator('[data-field="version"]').textContent()).trim(), '1.0');
    const submitted = sql.exec('SELECT row_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].row_revision;
    await adminRow().locator('[data-action="approve"]').click(); await confirm(adminPage, '同意上架'); await adminIdle();
    assert.equal(reviewPosts.length, 1, 'one approve POST from the panel');
    assert.equal(JSON.parse(reviewPosts[0].body).action, 'list');
    assert.equal(JSON.parse(reviewPosts[0].revision), submitted, 'the panel pins the row revision it confirmed');
    assert.match(await adminPage.locator('#review-result').textContent(), /已同意上架版本 1\.0/);
    assert.equal(await adminPage.evaluate(() => window.__ownedIDB), 0);
    assert.equal(await adminRow().getAttribute('data-state'), 'listed', 'the reload shows the approved state');
  } else await authority.manage('list');
  assert.equal(tail(), 2); assert.deepEqual((await registry()).directory, []); await drain();
  // The approved version is public only after the drain: the reader directory is
  // the authority, not the review panel receipt.
  // A 批：同一份冻结投影并行写出的游戏级目录指针，与根同代次、且每个 gameId 一条。
  {
    const pointerBytes = new Uint8Array(await (await bucket.get('control/directory.json')).arrayBuffer());
    const pointer = JSON.parse(new TextDecoder().decode(pointerBytes));
    const root = JSON.parse(new TextDecoder().decode(new Uint8Array(await (await bucket.get('control/current.json')).arrayBuffer())));
    assert.equal(directories, root.generation, 'one directory pointer per advanced generation');
    assert.equal(pointer.version, 1); assert.equal(pointer.authorityId, root.authorityId);
    assert.equal(pointer.generation, root.generation);
    const listed = pointer.games.filter(entry => entry.listed);
    assert.deepEqual(listed.map(entry => entry.gameId), [gameId]);
    assert.equal(listed[0].directory.chapters.length, 20);
    // 新老两处投影一致：指针条目与旧 projections/<gen>/<digest>/projection.json
    // 的同一 gameId 逐字段相同（老逻辑仍然写，A 批完全可回滚）。
    const legacy = JSON.parse(new TextDecoder().decode(new Uint8Array(await (await bucket.get(`projections/${root.generation}/${root.digest}/projection.json`)).arrayBuffer())));
    const legacyDirectory = legacy.directory.find(row => row.gameId === gameId);
    const legacyRelease = legacy.releases.find(row => row.game_id === gameId);
    assert.deepEqual(listed[0].directory, { name: legacyDirectory.name, publishedAt: legacyDirectory.publishedAt, chapters: legacyDirectory.chapters });
    assert.deepEqual(listed[0].release, { releaseId: legacyRelease.release_id, ordinal: legacyRelease.ordinal, revision: legacyRelease.draft_revision, sourceDigest: legacyRelease.source_digest, runtime: legacyRelease.runtime });
    assert.deepEqual(listed[0].announcements.map(row => row.ordinal), legacy.announcements.filter(row => row.gameId === gameId).map(row => row.ordinal));
  }
  let publicState = await registry(); assert.equal(publicState.directory.length, 1); assert.equal(publicState.directory[0].ordinal, '1.0'); assert.equal(publicState.directory[0].chapters.length, 20);
  assert.equal(publicState.announcements[0].firstOnlineAt, rootVisibleAt((await bucket.get('control/current.json')).uploaded));
  const chapterId = authority.chapters[0], admissionPath = ordinal => `/play-api/v1/admissions?game=${gameId}&ordinal=${ordinal}&chapter=${encodeURIComponent(chapterId)}`;
  const admission = await player.evaluate(async path => { const response = await fetch(path); const body = await response.json(); window.ownedTicket = body.ticket; return { status: response.status, ordinal: body.ordinal, chapterId: body.chapterId }; }, admissionPath('1.0'));
  assert.deepEqual(admission, { status: 200, ordinal: '1.0', chapterId });
  const readRole = (role, retired = false) => player.evaluate(async ({ role, retired }) => { const response = await fetch('/play-api/v1/file?role=' + encodeURIComponent(role), { headers: { Authorization: 'Bearer ' + (retired ? window.ownedRetiredTicket : window.ownedTicket) } }); const bytes = await response.arrayBuffer(); const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); return { status: response.status, digest }; }, { role, retired });
  const oldChapter = await readRole('chapter:' + chapterId); assert.equal(oldChapter.status, 200);
  assert.equal(oldChapter.digest, sha(sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', gameId, chapterId).toArray()[0].state_json));
  const chapterDigests = await player.evaluate(async ({ gameId, chapters }) => {
    const rows = [];
    for (const chapterId of chapters) {
      const admission = await fetch('/play-api/v1/admissions?' + new URLSearchParams({ game: gameId, ordinal: '1.0', chapter: chapterId }));
      if (!admission.ok) throw new Error('chapter admission rejected: ' + admission.status);
      const { ticket } = await admission.json();
      const response = await fetch('/play-api/v1/file?' + new URLSearchParams({ role: 'chapter:' + chapterId }), { headers: { Authorization: 'Bearer ' + ticket } });
      if (!response.ok) throw new Error('chapter file rejected: ' + response.status);
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      rows.push({ chapterId, digest });
    }
    return rows;
  }, { gameId, chapters: authority.chapters });
  assert.equal(chapterDigests.length, 20);
  for (const row of chapterDigests) assert.equal(row.digest, sha(sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', gameId, row.chapterId).toArray()[0].state_json));
  const firstRuntime = app.frozenDistribution.entry(1); let payload; try { payload = JSON.parse(new TextDecoder().decode(firstRuntime.payload)); } catch (cause) { throw new Error('bad frozen fixture read', { cause }); }
  const oldRuntimeKey = payload.runtime.runtime.key; assert.ok(await bucket.get(oldRuntimeKey)); checks.push(stage);
  if (playerProbe) {
    let index; try { index = JSON.parse(await (await bucket.get(oldRuntimeKey)).text()); } catch (cause) { throw new Error('owned runtime index', { cause }); }
    await playerProbe.start(index, chapterDigests);
    if (playerApp) {
      appProbe = (publicPlayer ? createPublicPlayerBrowserProbe : createPublishedAppBrowserProbe)({ browser, origin: playerOrigin, gameId, chapterId, root: join(own, 'static-package'), bridge, observeContext, programPaths });
      await appProbe.start(index, chapterDigests[0]);
    }
    const key = index.resources['chapter:' + chapterId].key, stored = await bucket.get(key);
    const bytes = await stored.arrayBuffer(), httpMetadata = stored.httpMetadata;
    await bucket.delete(key); // Owned fault injection only; never a deletion conclusion.
    try { await playerProbe.unavailable(); if (appProbe) await appProbe.unavailable(); }
    finally { await bucket.put(key, bytes, { httpMetadata }); }
    await playerProbe.recovered();
  }
  stage = 'second browser publish invalidates the old release; only explicit new admission can continue';
  await page.click('#publish-forget'); await idle(); await page.click('#publish-refresh'); await idle();
  await row.waitFor({ state: 'attached', timeout: 180000 });
  await row.locator('[data-action="publish"]').click(); await confirm(page, '上架'); await idle();
  assert.equal(posts.length, 2); assert.notEqual(posts[1].key, posts[0].key); assert.equal(tail(), 3); assert.equal(confirmed(), 2);
  assert.equal((await registry()).directory[0].ordinal, '1.0'); assert.equal((await playerJSON(admissionPath('1.1'))).status, 409);
  await drain();
  // A committed publish releases its tracking key, so the receipt stays on screen
  // without a query round trip; the drain above is what makes it confirmed.
  assert.match(await page.locator('#publish-result').textContent(), /版本 1\.1／修訂 1/);
  publicState = await registry(); assert.equal(publicState.directory[0].ordinal, '1.1'); assert.equal(publicState.announcements.length, 2);
  assert.equal((await playerJSON(admissionPath('1.0'))).status, 409);
  assert.equal((await readRole('chapter:' + chapterId)).status, 409, 'old admitted ticket cannot read after a newer release becomes current');
  const currentAdmission = await player.evaluate(async path => {
    const response = await fetch(path), body = await response.json();
    window.ownedRetiredTicket = window.ownedTicket; window.ownedTicket = body.ticket;
    return { status: response.status, ordinal: body.ordinal };
  }, admissionPath('1.1'));
  assert.deepEqual(currentAdmission, { status: 200, ordinal: '1.1' });
  const currentChapter = await readRole('chapter:' + chapterId); assert.equal(currentChapter.status, 200);
  assert.equal(currentChapter.digest, sha(sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', gameId, chapterId).toArray()[0].state_json));
  const currentPayload = JSON.parse(new TextDecoder().decode(app.frozenDistribution.entry(3).payload));
  const currentIndex = JSON.parse(await (await bucket.get(currentPayload.runtime.runtime.key)).text());
  checks.push(stage);
  if (playerProbe) await playerProbe.observe(true, currentIndex, currentChapter);
  if (appProbe) await appProbe.observe(true, currentIndex, currentChapter);
  stage = 'unlist denies new admissions; current 1.1 ticket continues, retired 1.0 remains invalid';
  await authority.manage('unlist');
  await drain(); assert.equal(confirmed(), 4); assert.deepEqual((await registry()).directory, []);
  assert.equal((await playerJSON(admissionPath('1.1'))).status, 403); assert.deepEqual(await readRole('chapter:' + chapterId), currentChapter);
  assert.equal((await readRole('chapter:' + chapterId, true)).status, 409, 'unlisting cannot revive a retired release'); checks.push(stage);
  if (playerProbe) await playerProbe.observe(false);
  if (appProbe) await appProbe.observe(false);
  const generations = 5;
  const deletionPage = adminDeleteUI ? adminPage : page;
  const deletionActor = adminDeleteUI ? sql.exec("SELECT id FROM users WHERE account='tianyi'").toArray()[0].id : ownerId;
  stage = 'explicit deletion fence returns 410, not physical purge';
  if (deleteUI) {
    const before = sql.exec('SELECT row_revision,draft_name FROM content_games WHERE game_id=?', gameId).toArray()[0];
    if (adminDeleteUI) {
      await adminPage.click('#menu button[data-view="management-editor"]'); await adminPage.click('#review-refresh'); await adminIdle();
      await adminRow().locator('[data-action="delete"]').click(); await confirm(adminPage, '刪除整個遊戲'); await adminIdle();
      assert.match(await adminPage.locator('#review-result').textContent(), /已徹底刪除（不可恢復）/);
    } else {
      await page.click('#publish-refresh'); await idle();
      await row.locator('[data-action="delete"]').click(); await confirm(page, '刪除整個遊戲'); await idle();
      let savedDeletion; try { savedDeletion = JSON.parse(await journal()); } catch (cause) { throw new Error('owned deletion journal', { cause }); }
      assert.equal(savedDeletion.kind, 'delete'); assert.equal(savedDeletion.key, deletionPosts[0].key);
      assert.equal(savedDeletion.expectedRowRevision, before.row_revision);
      assert.equal(savedDeletion.confirmationName, before.draft_name);
      assert.equal(savedDeletion.actorId, deletionActor);
      assert.match(await page.locator('#publish-message').textContent(), /原鍵保留|重新整理/, 'lost response keeps the confirmed key, never a silent retry');
    }
    assert.equal(deletionPosts.length, 1);
    assert.equal(tail(), generations);
    assert.equal(deletionPosts[0].body, JSON.stringify({ gameId, expectedRowRevision: before.row_revision, confirmationName: before.draft_name }));
    if (adminDeleteUI) {
      assert.notEqual(deletionActor, ownerId);
      assert.equal(sql.exec('SELECT actor_id FROM content_deletion_fences WHERE game_id=?', gameId).toArray()[0].actor_id, deletionActor);
      assert.equal(calls.filter(entry => entry.path.endsWith('/deletion-preview')).length, 0, 'the review panel posts the fence directly, no preview round trip');
    }
    const reloadMark = calls.length; await deletionPage.reload();
    if (adminDeleteUI) await adminShow(); else await show();
    assert.equal(deletionPosts.length, 1, 'a reload never reposts the deletion');
    assert.equal(calls.slice(reloadMark).some(entry => entry.path.includes('/deletion-operations/') || entry.path.endsWith('/deletion-preview')), false);
    await deletionPage.locator(adminDeleteUI ? '#review-editor' : '#publish-editor').screenshot({ path: join(artifact, 'deletion-pending.png') });
  } else await authority.manage('delete');
  await drain(); assert.equal(confirmed(), generations); assert.equal((await readRole('chapter:' + chapterId)).status, 410);
  if (playerProbe) {
    const before = calls.length; await playerProbe.deleted();
    assert.equal(calls.length - before, 1, 'deleted client does not fetch or re-admit again');
    assert.equal(calls.at(-1).status, 410);
  }
  if (appProbe) {
    const before = calls.length; await appProbe.deleted();
    if (publicPlayer) {
      const after = calls.slice(before);
      assert.equal(after.filter(row => row.status === 410).length, 1);
      assert.ok(after.every(row => row.status === 410 || row.path === '/play-api/v1/registry' && row.status === 200));
    } else {
      assert.equal(calls.length - before, 1, 'retired App does not re-admit or fetch');
      assert.equal(calls.at(-1).status, 410);
    }
    await appProbe.screenshot(join(artifact, 'published-app-retired.png'));
  }
  if (deleteUI && !adminDeleteUI) {
    // 物理刪除後刪除紀錄本身也被清除：查詢必須說清楚，不得推成取消或回滾。
    await page.click('#publish-query'); await idle();
    // 查詢可能命中既有冪等回執（柵欄收據），也可能因物理刪除而 404；兩者都不能被推成取消或回滾。
    assert.match(await page.locator('#publish-message').textContent(), /已隨物理刪除清除|已核對原刪除柵欄/);
    // 面板文字允許「已徹底刪除」或「柵欄成立但物理刪除未完成」；真正的判據在資料庫。
    assert.match(await page.locator('#publish-result').textContent(), /已徹底刪除（不可恢復）|物理刪除尚未完成/);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_deletion_fences WHERE game_id=?', gameId).toArray()[0].n, 0, '刪除後不得留下柵欄列');
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_games WHERE game_id=?', gameId).toArray()[0].n, 0, '刪除後不得留下遊戲列');
    // ③ 帳本退役：檢查點 + chunks 清理 + 收尾都必須真的完成，不能只是寫了一張 pending 表。
    const cleanup = sql.exec('SELECT state FROM content_distribution_cleanup ORDER BY started_at DESC LIMIT 1').toArray()[0];
    assert.equal(cleanup?.state, 'completed', '本遊戲的 distribution generations 必須完成退役：' + JSON.stringify(cleanup));
    assert.ok(sql.exec('SELECT COUNT(*) AS n FROM content_distribution_checkpoints').toArray()[0].n >= 1, '退役必須留下檢查點');
    const retiredChunks = sql.exec('SELECT COUNT(*) AS n FROM content_distribution_chunks WHERE generation IN (SELECT generation FROM content_distribution_events WHERE game_id=?)', gameId).toArray()[0].n;
    assert.equal(retiredChunks, 0, '退役世代不得留下 chunks');
    assert.equal(deletionPosts.length, 1);
    await page.locator('#publish-editor').screenshot({ path: join(artifact, 'deletion-confirmed.png') });
  }
  assert.ok(await bucket.get(oldRuntimeKey), 'retained bytes make this explicitly NOT physical deletion');
  assert.equal(sql.exec("SELECT COUNT(*) AS n FROM content_operations WHERE method='publish'").toArray()[0].n, 2);
  checks.push(stage);
  assert.equal(await page.evaluate(() => window.__ownedIDB), 0); assert.equal(await player.evaluate(() => window.__ownedIDB), 0);
  const traces = [...(playerProbe ? await playerProbe.traces() : []), ...(appProbe ? await appProbe.traces() : [])];
  const unexpectedFailures = [];
  for (const event of failedDetails) {
    if (event.sequence === null) { unexpectedFailures.push(event.path); continue; }
    assert.equal(playerClient, true);
    assert.ok(!completedStreamFailures.some(row => row.sequence === event.sequence), 'duplicate stream event');
    if (programPaths && event.path.startsWith('/program-assets/')) completedStreamFailures.push(appProbe.completedProgramStream(event));
    else completedStreamFailures.push(assertCompletedStreamObservation(event, traces, calls, playerOrigin));
  }
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  assert.deepEqual(unexpectedFailures, ['/api/publish', ...(deleteUI && !adminDeleteUI ? ['/api/games/' + gameId + '/deletion'] : [])]);
  const expectedHTTP = calls.filter(row => row.status >= 400);
  const appStatuses = publicPlayer ? [410] : [503,410];
  // A separate admin browser context probes /api/session before it logs in: one more 401.
  const expectedStatuses = [...[401, ...(reviewUI ? [401] : []), 403,409,409,409,409,410], ...(playerClient ? [503,409,409,403,410] : []), ...(playerApp ? appStatuses : [])];
  assert.deepEqual(expectedHTTP.map(row => row.status).sort((a,b) => a-b), expectedStatuses.sort((a,b) => a-b));
  assert.equal(consoleErrors.length, expectedHTTP.length + 1 + (deleteUI && !adminDeleteUI ? 1 : 0));
  for (const message of consoleErrors) assert.match(message, playerClient ? /Failed to load resource: (net::ERR_FAILED|the server responded with a status of (401|403|409|410|503))/ : /Failed to load resource: (net::ERR_FAILED|the server responded with a status of (401|403|409|410|503))/);
  assert.equal(calls.filter(row => row.path === '/api/auth/login').length, reviewUI ? 2 : 1);
  for (const path of ['/client.js','/publish.js','/draft.js','/management.js']) assert.ok(calls.some(row => row.path === path && row.status === 200));
  const authorityId = app.frozenDistribution.status().authorityId;
  for (let generation = 1; generation <= generations; generation++) {
    const record = app.frozenDistribution.entry(generation);
    assert.ok(await bucket.get(`control/receipts/${authorityId}/${generation}/${record.operationDigest}.json`));
  }
  stage = 'reopen actual file SQLite and resume publisher without another root write';
  await browser.close(); browser = null; storage.close(); authority.storage = null;
  reopened = openStorage(authority.dbPath); const afterRestart = createDistributionPublisher({ storage: reopened, r2, verifyStaticResources });
  assert.equal((await afterRestart.drainOne()).state, 'IDLE'); assert.equal(roots, generations); assert.equal(afterRestart.ledger.status().confirmedGeneration, generations); checks.push(stage);
  const deletionShots = !deleteUI ? [] : adminDeleteUI
    ? ['deletion-pending.png']
    : ['deletion-pending.png', 'deletion-confirmed.png'];
  const result = {
 checks, publicPlayer, playerApp: appProbe ? appProbe.report() : null, playerClient: playerProbe ? { ...playerProbe.report(), traces, completedStreamFailures } : null, nodeService, reviewUI, reviewPosts: reviewPosts.length, deleteUI, adminDeleteUI, deletionPosts: deletionPosts.length, browser: browserVersion, posts: posts.length, roots, confirmed: generations, chapters: authority.chapters.length, r2: { gets, puts, outbound }, static: { ...packaged.stats(), checks: staticChecks }, expectedHTTP: expectedHTTP.map(row => ({ path: row.path, status: row.status })), expectedLostResponses: 1 + (deleteUI && !adminDeleteUI ? 1 : 0), sources, screenshots: Object.fromEntries(['pending.png','confirmed.png', ...deletionShots, ...(playerApp ? ['published-app-retired.png'] : [])].map(name => [name, sha(readFileSync(join(artifact,name)))])), scope: 'Actual browser UI/password login/gateway/SQLite/20-chapter compile/guarded immutable stage/default publisher/owned workerd R2 and reader, via in-process browser transport bridge. Full-copy bootstrap; optional reviewUI mode drives the live review panel with an independent admin browser login (optional deleteUI exercises the live publish-panel deletion journal, or adminDeletionUI the cross-author confirmation preview and journal, with real post-fence status; otherwise deletion is a direct authenticated Request). Otherwise admin actions are direct authenticated Requests. Optional playerApp joins real admission to the same App, owned native IDB and real lifecycle host (update/deletion retirement and explicit confirmation), with test startup and a recording navigation port; without it the engine is not executed. The additional publicPlayer mode uses unmodified production HTML/boot and real title/chooser/page navigation instead of that test startup/recording port. Not author blank creation, Node TCP/TLS/cloud S3, full campaign, static-retention or physical-delete proof.' };
  writeFileSync(join(artifact, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ ...result, sources: 'in artifact', artifact }) + '\n');
} catch (error) {
  writeFileSync(join(artifact, 'failure.json'), JSON.stringify({ stage, error: String(error), stack: error.stack, errors, consoleErrors, failed, failedDetails, outside, calls, posts: posts.length }, null, 2), { flag: 'wx' }); throw error;
} finally {
  await browser?.close(); reopened?.close(); authority?.storage?.close(); await mf?.dispose(); rmSync(own, { recursive: true, force: true });
}
