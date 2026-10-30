// Real Root, own persisted SQLite/R2, fresh Chromium; response loss only at browser network boundary.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { startEditorBackend } from './start_editor_backend.mjs';
const options = process.argv.slice(3), trialClose = options.includes('--trial-close-only'), cityOnly = options.includes('--city-native-only'), focused = cityOnly || options.includes('--copied-entity-only'), nodeService = options.includes('--node-service');
assert.ok(options.every(option => ['--copied-entity-only', '--city-native-only', '--node-service', '--trial-close-only'].includes(option)) && new Set(options).size === options.length, 'unknown or repeated test scope');
assert.ok(!trialClose || nodeService && !focused, 'trial close scope requires Node and excludes entity scopes');
const port = Number(process.env.EDITOR_TEST_PORT ?? 8787);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const own = mkdtempSync(join(tmpdir(), 'dragon-draft-ui-')), origin = 'https://127.0.0.1:' + port, initial = (randomBytes(24).toString('hex') + 'Aa1!'), password = (randomBytes(24).toString('hex') + 'Aa1!'), secret = randomBytes(32).toString('hex'), sha = b => createHash('sha256').update(b).digest('hex');
function json(bytes) { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid owned UI evidence JSON', { cause }); } }
const config = json(readFileSync('server/wrangler.jsonc')); config.main = resolve('server/worker.js'); config.dev.port = port; config.vars.EDITOR_ORIGIN = origin; writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config)); writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });
const paths = [...(trialClose ? ['tools/editor_stage_library.mjs', 'server/public/trialapp.txt', 'server/public/trialweb.txt', 'server/trials.js', 'web/src/editor/trialconnection.js', 'web/src/editor/servertrialapp.js'] : []), 'server/editorapp.js', 'server/chaptergapreport.js', 'web/src/content/authoring/gamesource.js', 'server/public/stronghold.txt', 'server/public/general.txt', 'editor-ui/src/StrongholdPanel.vue', 'editor-ui/src/GeneralsPanel.vue', 'server/copyprofile.js', 'server/drafts.js', 'web/src/editor/chapterresources.js', 'server/worker.js', 'server/public/client.txt', 'server/public/index.html', 'server/public/draft.txt', 'server/public/shell-ui.txt', 'editor-ui/src/DraftPanel.vue', 'tools/verify_editor_backend_draft_ui.mjs', 'vps/sqlite-port.mjs', 'vps/file-bucket.mjs', 'vps/editor-server.mjs', 'tools/editor_local_https.mjs', 'tools/editor_stage_source.mjs', 'web/src/content/authoring/cityrecords.js', 'web/src/content/authoring/factionconsistency.js', 'server/public/shell-ui.css'], sourceHashes = Object.fromEntries(paths.map(p => [p, sha(readFileSync(p))])), calls = [], checks = [], rejectedSaves = []; let server, browser, failurePage, apiRequests = 0;
async function call(path, body, session, extra = {}) { const headers = { Origin: origin, ...extra }; if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; } if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); } const response = await new Promise((done, reject) => { const req = httpsRequest(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => { const parts = []; res.on('data', b => parts.push(b)); res.on('error', reject); res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], data: json(Buffer.concat(parts).toString()) })); }); req.setTimeout(240000, () => req.destroy(new Error('Owned backend request timeout: ' + path))); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body)); }); calls.push({ path, status: response.status }); return response; }
const wait = page => page.waitForFunction(() => !document.querySelector('#draft-games-refresh').disabled, undefined, { timeout: 240000 });
async function load(page, revision) { await page.locator('#draft-revision').fill(revision); await page.locator('#draft-load').click(); await page.waitForFunction(rev => document.querySelector('#draft-context').textContent.includes('已保存修訂 ' + rev) && !document.querySelector('#draft-name').disabled, revision, { timeout: 240000 }); }
try {
  process.stderr.write('draft-ui: setup\n');
  if (nodeService) {
    const { openStorage } = await import('../vps/sqlite-port.mjs');
    const { FileBucket } = await import('../vps/file-bucket.mjs');
    const { createEditorService } = await import('../vps/editor-server.mjs');
    const { createEditorHTTPS } = await import('./editor_local_https.mjs');
    const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');
    const storage = openStorage(join(own, 'authority.sqlite')), bucket = new FileBucket({ root: join(own, 'private-objects') });
    try {
      const source = await stageInstalledEditorSource({ get: key => bucket.get(key), put(key, bytes, options) {
        assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
        return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
      } });
      let library;
      if (trialClose) {
        const { stageInstalledAvailableLibrary } = await import('./editor_stage_library.mjs');
        library = await stageInstalledAvailableLibrary({ get: key => bucket.get(key), put(key, bytes, options) {
          assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
          return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
        } });
      }
      const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source), ...(trialClose ? { EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library) } : {}) } });
      const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
      server = { async close() { try { await transport.close(); } finally { storage.close(); } } };
    } catch (error) { storage.close(); throw error; }
  } else server = await startEditorBackend(join(own, 'wrangler.jsonc'), { stageSource: true });
  const login = await call('/api/auth/login', { account: 'tianyi', password: initial }); assert.equal(login.status, 200); const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf }); assert.equal(changed.status, 200); const admin = { cookie: changed.cookie, csrf: changed.data.csrf };
  const source = await call('/api/admin/source', undefined, admin); assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200); const copyKey = randomUUID(), copy = await call('/api/admin/copies', { registryId: source.data.definition.registryId, name: '<img>', introduction: '私有原稿' }, admin, { 'Idempotency-Key': copyKey }); assert.equal(copy.status, 202); assert.equal((await call('/api/admin/copies/' + copyKey + '/run', {}, admin, { 'If-Match': '"1"' })).status, 200); const gameId = copy.data.gameId;
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href); browser = await chromium.launch({ headless: true, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key))) }); const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } }), errors = [], outside = [], expected = [], requests = [];
  await context.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess = (globalThis.__idbAccess ?? 0) + 1; throw new Error('IDB forbidden'); } })); await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push('outside'); return route.abort(); } return route.continue(); });
  let page = await context.newPage(); failurePage = page;
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/api/games/' + gameId + '/draft/save' || response.status() < 400) return;
    let code = 'UNREADABLE_ERROR'; try { const body = await response.json(); if (typeof body.error === 'string') code = body.error; } catch { /* Preserve the HTTP status without dumping bodies or credentials. */ }
    rejectedSaves.push({ status: response.status(), code });
  });
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() !== 'error') return; const path = new URL(message.location().url || origin).pathname, text = message.text(); if (path === '/api/session' && text.includes('401') || path === '/favicon.ico' && text.includes('404') || path === '/api/games/' + gameId + '/draft/save' && (text.includes('net::ERR_FAILED') || text.includes('412')) || path.startsWith('/api/games/' + gameId + '/draft/operations/') && text.includes('404')) expected.push({ path, text }); else errors.push(text); }); page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) apiRequests++; if (path.endsWith('/draft/save')) requests.push({ method: request.method(), path, key: request.headers()['idempotency-key'], revision: request.headers()['if-match'] }); });
  await page.goto(origin); await page.locator('#login [name=account]').fill('tianyi'); await page.locator('#login [name=password]').fill(password); await page.locator('#login button').click(); await page.locator('#draft-editor').waitFor({ state: 'visible' }); await wait(page); await page.locator('#draft-games-refresh').click(); await page.waitForFunction(() => document.querySelector('#draft-game').options.length === 1 && !document.querySelector('#draft-games-refresh').disabled); assert.equal(await page.locator('#draft-game').inputValue(), gameId); assert.equal(await page.locator('#draft-game option').textContent(), '<img>／清單修訂 1'); assert.equal(await page.locator('#draft-game img').count(), 0);
  let dropped = 0, copiedChapterRecovery = null, trialDraftObservation = null;
  if (trialClose) {
    assert.equal((await call('/api/admin/library/install', {}, admin)).status, 200);
    await load(page, '1');
    const original = await call('/api/games/' + gameId + '/draft?revision=1', undefined, admin);
    assert.equal(original.status, 200);
    const editorPage = page, statuses = [], trialWrites = [];
    context.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && /\/trials(?:\/|$)/.test(path)) trialWrites.push(path);
    });
    context.on('page', child => child.on('pageerror', error => errors.push(error.message)));
    const childOpened = context.waitForEvent('page');
    await page.locator('#draft-trial-start').click();
    page = await childOpened; failurePage = page;
    page.on('response', response => {
      if (/\/api\/trials\/[^/]+\/status$/.test(new URL(response.url()).pathname)) statuses.push(response.status());
    });
    await page.waitForSelector('#trial-faction', { timeout: 240000 });
    const trialId = new URL(page.url()).searchParams.get('trial');
    assert.match(trialId, /^[a-f0-9-]{36}$/);
    await page.locator('#trial-faction').selectOption({ index: 0 });
    await page.locator('#start-trial').click();
    await page.waitForFunction(() => window.__app?.runtimeEnabled && window.__app.gameStarted && !window.__app._scenarioAssemblyPending && !window.__app._scenarioAssemblyIncomplete && window.__app.scenario?.cities?.length === 192, null, { timeout: 240000 });
    assert.equal(await editorPage.evaluate(() => globalThis.__idbAccess ?? 0), 0);
    await page.evaluate(() => { window.__ownedScenarioBeforeClose = window.__app.scenario; });
    checks.push('real logged-in workbench opens saved revision1 Trial; actual App assembles 192 cities in its child window');
    const trialBefore = await page.evaluate(async id => {
      const response = await fetch('/api/trials/' + id + '/status');
      if (!response.ok) throw new Error('active Trial status unavailable');
      return response.json();
    }, trialId);
    assert.equal(trialBefore.draftRevision, '1');
    const beforeClose = statuses.length, writesBeforeClose = [...trialWrites];
    await editorPage.close();
    assert.equal(editorPage.isClosed(), true);
    const deadline = Date.now() + 30000;
    while (statuses.length < beforeClose + 2 && Date.now() < deadline) await page.waitForTimeout(250);
    assert.ok(statuses.length >= beforeClose + 2, 'independent monitor continues after editor close');
    assert.ok(statuses.slice(beforeClose).every(status => status === 200));
    assert.deepEqual(trialWrites, writesBeforeClose, 'closing editor sends no Trial end or replacement request');
    assert.equal(await page.evaluate(() => window.__app.runtimeEnabled && !window.__app.trialEnded && window.__app.scenario === window.__ownedScenarioBeforeClose && window.__app.trialGate.state === 'running'), true);
    assert.deepEqual((await call('/api/games/' + gameId + '/draft?revision=1', undefined, admin)).data, original.data);
    assert.equal(requests.length, 0);
    checks.push('closing actual editor preserves the same running scenario, two authenticated monitor responses and unchanged saved draft; no save/end request');
    const newer = await call('/api/games/' + gameId + '/draft/save', { metadata: { ...original.data.metadata, name: '新草稿' }, resourceEdits: [], chapterEdits: [] }, admin, { 'If-Match': '"1"' });
    assert.equal(newer.status, 200); assert.equal(newer.data.draftRevision, '2');
    const currentDraft = await call('/api/games/' + gameId + '/draft?revision=2', undefined, admin);
    assert.equal(currentDraft.status, 200); assert.equal(currentDraft.data.metadata.name, '新草稿');
    assert.deepEqual(currentDraft.data.chapters, original.data.chapters);
    assert.deepEqual((await call('/api/games/' + gameId + '/draft?revision=1', undefined, admin)).data, original.data);
    const trialAfter = await page.evaluate(async id => {
      const response = await fetch('/api/trials/' + id + '/status');
      if (!response.ok) throw new Error('fixed Trial status unavailable after draft save');
      return response.json();
    }, trialId);
    assert.deepEqual(trialAfter, trialBefore, 'new draft must not replace the original Trial identity or snapshot');
    trialDraftObservation = await page.evaluate(() => ({ sameScenario: window.__app.scenario === window.__ownedScenarioBeforeClose, ended: window.__app.trialEnded === true, gate: window.__app.trialGate.state, runtimeEnabled: window.__app.runtimeEnabled }));
    process.stderr.write('trial-after-new-draft: ' + JSON.stringify(trialDraftObservation) + '\n');
    assert.equal(trialDraftObservation.sameScenario, true); assert.equal(trialDraftObservation.ended, false);
    // A long synchronous source verification may delay the monitor; only its
    // own next valid response may resume it. Never force the gate or App state.
    await page.waitForFunction(() => window.__app.runtimeEnabled && window.__app.scenario === window.__ownedScenarioBeforeClose && window.__app.trialGate.state === 'running', null, { timeout: 30000 });
    assert.deepEqual(trialWrites, writesBeforeClose);
    assert.equal(requests.length, 0);
    checks.push('actual concurrent metadata save commits revision2 while Trial retains its entire revision1 status/snapshot and same running scenario; old draft remains readable');
    const endedStatus = await page.evaluate(async id => {
      const sessionResponse = await fetch('/api/session');
      if (!sessionResponse.ok) throw new Error('creating browser session unavailable');
      const session = await sessionResponse.json();
      const response = await fetch('/api/trials/' + id + '/end', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, 'Idempotency-Key': crypto.randomUUID() }, body: '{}' });
      return response.status;
    }, trialId);
    assert.equal(endedStatus, 200);
    await page.waitForFunction(() => window.__app?.trialEnded === true && window.__app.runtimeEnabled === false && window.__app.scenario === null && document.querySelector('#trial-status')?.textContent.includes('已結束'), null, { timeout: 30000 });
    checks.push('independent Trial still observes explicit server end after its editor has closed');
  } else {
  if (!focused) {
  process.stderr.write('draft-ui: explicit read\n'); await load(page, '1'); assert.equal(await page.locator('#draft-name').inputValue(), '<img>'); assert.equal(await page.locator('#draft-resources details').count(), 20); const resourceChapter = page.locator('#draft-resources details').first(); await resourceChapter.locator('summary').click();
  const resourceId = await resourceChapter.getAttribute('data-resource-chapter'), moneyInput = resourceChapter.locator('[data-resource-slot="0"] input[name="money"]');
  const originalMoney = Number(await moneyInput.inputValue()), editedMoney = originalMoney === 8388607 ? originalMoney - 1 : originalMoney + 1;
  const reserveInput = resourceChapter.locator('[data-resource-slot="0"] input[name="reserve_inf"]'), originalReserve = await reserveInput.inputValue();
  const beforeInvalid = requests.length; await reserveInput.fill('65536'); await page.locator('#draft-save-button').click(); await wait(page); assert.equal(requests.length, beforeInvalid); await reserveInput.fill(originalReserve);
  await moneyInput.fill(String(editedMoney)); assert.ok((await page.locator('#draft-context').textContent()).includes('有未保存修改'));
  checks.push('actual own draft1 and20chapters; resource controls preserve chapter/slot, out-of-range reserve rejected before POST, editing does not grant runtime');
  await page.locator('#draft-name').fill('未保存'); page.once('dialog', dialog => dialog.dismiss()); await page.locator('#draft-load').click(); await wait(page); assert.equal(await page.locator('#draft-name').inputValue(), '未保存'); assert.ok((await page.locator('#draft-context').textContent()).includes('有未保存修改')); const unloadDialog = new Promise((done, reject) => page.once('dialog', async dialog => { try { assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss(); done(); } catch (error) { reject(error); } })); await page.evaluate(() => location.reload()); await unloadDialog; assert.equal(await page.locator('#draft-name').inputValue(), '未保存'); const savesBefore = requests.length; await page.locator('#draft-name').fill('九個字ABCDEFGHI'); await page.locator('#draft-save-button').click(); await wait(page); assert.equal(requests.length, savesBefore); assert.equal(await page.locator('#draft-name').inputValue(), '九個字ABCDEFGHI'); checks.push('dirty reload cancel retains input/context; codepoint validation rejects before request, no implicit save');
  const saveURL = origin + '/api/games/' + gameId + '/draft/save'; await page.route(saveURL, async route => { const response = await route.fetch({ timeout: 240000 }); assert.equal(response.status(), 200); dropped++; await route.abort(); });
  await page.locator('#draft-name').fill('資料二'); await page.locator('#draft-introduction').fill('e\u0301 😀 <x>'); process.stderr.write('draft-ui: lost committed response\n'); await page.locator('#draft-save-button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 }); assert.equal(dropped, 1); assert.equal(await page.locator('#draft-introduction').inputValue(), 'e\u0301 😀 <x>'); assert.equal(await page.locator('#draft-save-button').isDisabled(), true); await page.unroute(saveURL);
  await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('已確認保存修訂 2') && !document.querySelector('#draft-name').disabled); assert.equal(await page.locator('#draft-introduction').inputValue(), 'é 😀 <x>'); assert.equal(requests.length, savesBefore + 1);
  assert.equal(await moneyInput.inputValue(), String(editedMoney));
  const savedResources = await call('/api/games/' + gameId + '/draft?revision=2', undefined, admin); assert.equal(savedResources.status, 200);
  assert.equal(savedResources.data.chapters.find(chapter => chapter.chapterId === resourceId).factions[0].money, editedMoney);
  checks.push('actual Root commits draft2 but browser response deliberately dropped: original fields/key kept, no newkey/autoretry; explicit query confirms same operation, NFC and resource value; independent exact draft2 GET verifies persisted money');
  const external = await call('/api/games/' + gameId + '/draft/save', { metadata: { name: '他頁修改', introduction: '另一明確請求' }, resourceEdits: [] }, admin, { 'If-Match': '"2"' }); assert.equal(external.status, 200); await page.locator('#draft-name').fill('本頁保留'); process.stderr.write('draft-ui: conditional conflict\n'); await page.locator('#draft-save-button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 }); assert.equal(await page.locator('#draft-name').inputValue(), '本頁保留'); await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('服務已記錄失敗') && !document.querySelector('#draft-operation-retry').disabled); const staleKey = requests.at(-1).key;
  await page.locator('#draft-operation-retry').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 }); assert.equal(requests.at(-1).key, staleKey); assert.equal(requests.at(-1).revision, '"2"'); assert.equal(await page.locator('#draft-name').inputValue(), '本頁保留'); await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('服務已記錄失敗')); page.once('dialog', dialog => dialog.accept()); await load(page, '3'); assert.equal(await page.locator('#draft-name').inputValue(), '他頁修改'); checks.push('actual concurrent writer moves saved3; stale2 HTTP412 retains field, explicit query/identical key retry notlatest; confirmed discard+explicit read3 only');
  await page.route(saveURL, async route => { const response = await route.fetch({ timeout: 240000 }); assert.equal(response.status(), 200); dropped++; await route.abort(); }); await page.locator('#draft-name').fill('重新載入'); process.stderr.write('draft-ui: unresolved reload\n'); await page.locator('#draft-save-button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 });
  const association = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('editor-draft-operation:')).map(([,value]) => Object.keys(JSON.parse(value)).sort())); assert.deepEqual(association, [['gameId','key','revision']]); await page.unroute(saveURL); page.once('dialog', dialog => dialog.accept()); await page.reload(); await page.locator('#draft-editor').waitFor({ state: 'visible' }); await wait(page); assert.equal(await page.locator('#draft-operation-retry').isDisabled(), true); await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('已確認保存修訂 4')); assert.equal(await page.locator('#draft-save-button').isDisabled(), true); assert.equal(requests.length, savesBefore + 4); checks.push('unresolved page reload retains only actor-associated game/revision/key, no author input/credential; actual permanent operation confirms4 without reconstructed payload or autosave, editing requires exact read');
  process.stderr.write('draft-ui: no-op and author isolation\n'); await page.locator('#draft-games-refresh').click(); await page.waitForFunction(() => document.querySelector('#draft-game').options.length === 1 && !document.querySelector('#draft-games-refresh').disabled); await load(page, '4'); await page.locator('#draft-save-button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('已確認保存修訂 4') && !document.querySelector('#draft-name').disabled, undefined, { timeout: 240000 }); assert.equal(requests.length, savesBefore + 5); assert.equal(await page.locator('#draft-name').inputValue(), '重新載入'); checks.push('recovered receipt alone does not enable edits; actual explicit read4 then clean metadata no-op keeps saved4');
  process.stderr.write('draft-ui: create isolated author\n'); assert.equal((await call('/api/admin/accounts', { account: 'ui_author' }, admin)).status, 200); const authorLogin = await call('/api/auth/login', { account: 'ui_author', password: initial }); assert.equal(authorLogin.status, 200); const authorChanged = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: authorLogin.cookie, csrf: authorLogin.data.csrf }); assert.equal(authorChanged.status, 200);
  process.stderr.write('draft-ui: isolated author browser\n'); const foreignContext = await browser.newContext({ ignoreHTTPSErrors: true }); await foreignContext.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess = (globalThis.__idbAccess ?? 0) + 1; throw new Error('IDB forbidden'); } })); await foreignContext.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push('outside'); return route.abort(); } return route.continue(); }); const foreignPage = await foreignContext.newPage(); foreignPage.on('pageerror', error => errors.push(error.message)); foreignPage.on('console', message => { if (message.type() !== 'error') return; const path = new URL(message.location().url || origin).pathname, text = message.text(); if (path === '/api/session' && text.includes('401') || path === '/favicon.ico' && text.includes('404')) expected.push({ path, text }); else errors.push(text); }); await foreignPage.goto(origin); await foreignPage.locator('#login [name=account]').fill('ui_author'); await foreignPage.locator('#login [name=password]').fill(password); await foreignPage.locator('#login button').click(); await foreignPage.locator('#draft-editor').waitFor({ state: 'visible' }); await wait(foreignPage); assert.equal(await foreignPage.locator('#admin').isVisible(), false); await foreignPage.locator('#draft-games-refresh').click(); await foreignPage.waitForFunction(() => !document.querySelector('#draft-games-refresh').disabled); assert.equal(await foreignPage.locator('#draft-game option').count(), 0); assert.equal(await foreignPage.locator('#draft-name').isDisabled(), true); assert.equal(await foreignPage.locator('#draft-resources details').count(), 0); assert.equal(await foreignPage.evaluate(() => globalThis.__idbAccess ?? 0), 0); await foreignContext.close(); checks.push('separate actual author login sees no administrator copy/game/inputs; no client owner or storage association grants access');
  process.stderr.write('draft-ui: missing original body recovery\n'); let unsent = 0; await page.route(saveURL, async route => { unsent++; await route.abort(); }); await page.locator('#draft-name').fill('未送達'); await page.locator('#draft-save-button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled); assert.equal(unsent, 1); await page.unroute(saveURL); page.once('dialog', dialog => dialog.accept()); await page.reload(); await page.locator('#draft-editor').waitFor({ state: 'visible' }); await wait(page); await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('目前查無原操作')); assert.equal(await page.locator('#draft-load').isDisabled(), true); assert.equal(await page.locator('#draft-operation-retry').isDisabled(), true);
  const recoveryPassword = (randomBytes(24).toString('hex') + 'Aa1!'); await page.locator('.user-menu summary').click(); page.once('dialog', dialog => dialog.accept()); await page.locator('.user-menu-items').getByRole('button', { name: '變更密碼' }).click(); await page.locator('#password [name=oldPassword]').fill(password); await page.locator('#password [name=newPassword]').fill(recoveryPassword); await page.locator('#password [name=confirmPassword]').fill(recoveryPassword); page.once('dialog', dialog => dialog.accept()); await page.locator('#password button').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('服務已確認改密') && !document.querySelector('#draft-load').disabled); page.once('dialog', dialog => dialog.accept()); await page.locator('#menu [data-view="draft-editor"]').click(); await page.locator('#draft-operation-query').click(); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('舊會話已由實際改密撤銷') && !document.querySelector('#draft-load').disabled); await page.locator('#draft-games-refresh').click(); await page.waitForFunction(() => document.querySelector('#draft-game').options.length === 1 && !document.querySelector('#draft-games-refresh').disabled); page.once('dialog', dialog => dialog.accept()); await load(page, '4'); assert.equal(await page.locator('#draft-name').inputValue(), '重新載入'); assert.equal(requests.length, savesBefore + 6); checks.push('browser aborts BEFORE sending Root POST; reload loses body, real404 forbids reconstruction/newkey; actual user-confirmed password change revokes old epoch, still404 is not saved/failed, explicit discard+read4 recovers without new save');
  process.stderr.write('draft-ui: lost chapter receipt requires exact reread\n');
  await page.route(saveURL, async route => { const response = await route.fetch({ timeout: 240000 }); const payload = await response.json(); if (response.status() !== 200) { process.stderr.write(JSON.stringify({ chapterSaveFailure: payload }) + '\n'); await route.fulfill({ response }); return; } dropped++; await route.abort(); });
  page.once('dialog', dialog => dialog.accept('收據章'));
  await page.locator('#draft-chapters .chapter-row').first().getByRole('button', { name: '改名', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 });
  await page.unroute(saveURL); await page.locator('#draft-operation-query').click();
  await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('已確認保存修訂 5'));
  assert.equal(await page.locator('#draft-save-button').isDisabled(), true); assert.equal(await page.locator('#draft-trial-start').isDisabled(), true);
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), 20);
  assert.doesNotMatch(await page.locator('#draft-chapters .chapter-row').first().textContent(), /收據章/);
  await load(page, '5'); assert.match(await page.locator('#draft-chapters .chapter-row').first().textContent(), /收據章/);
  assert.equal(await page.locator('#draft-save-button').isDisabled(), false);
  checks.push('actual chapter rename commits5 with dropped response; queried receipt cannot authorize stale chapter rows or Trial; only exact read5 installs renamed chapter and unlocks edits');
  process.stderr.write('draft-ui: resource-edited chapter copy\n');
  const copyResponsePromise = page.waitForResponse(response => response.url() === saveURL && response.request().method() === 'POST', { timeout: 240000 });
  await page.locator('#draft-chapters .chapter-row').first().getByRole('button', { name: '複製本章', exact: true }).click();
  const copyResponse = await copyResponsePromise, copyResult = await copyResponse.json();
  assert.equal(copyResponse.status(), 200, JSON.stringify(copyResult));
  const copiedRead = await page.request.get(origin + `/api/games/${gameId}/draft?revision=6`, { ignoreHTTPSErrors: true, timeout: 240000 });
  const copiedDraft = { status: copiedRead.status(), data: await copiedRead.json() }; assert.equal(copiedDraft.status, 200, JSON.stringify(copiedDraft.data));
  await page.waitForFunction(() => document.querySelectorAll('#draft-chapters .chapter-row').length === 21 && document.querySelector('#draft-revision').value === '6' && !document.querySelector('#draft-save-button').disabled && !document.querySelector('#logout').disabled, undefined, { timeout: 240000 });
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), 21);
  const firstResources = copiedDraft.data.chapters[0].factions, copiedResources = copiedDraft.data.chapters[20].factions;
  assert.deepEqual(copiedResources, firstResources); assert.notEqual(copiedDraft.data.chapters[20].chapterId, copiedDraft.data.chapters[0].chapterId);
  checks.push('actual copy of resource-edited and renamed chapter commits6, exact read exposes21chapters with independent ID and preserved faction resources; protected raw-field negatives remain separate profile tests');
  process.stderr.write('draft-ui: exact empty authoring chapter\n');
  await page.locator('#draft-chapters').getByRole('button', { name: '新增空白章節', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#draft-chapters .chapter-row').length === 22 && document.querySelector('#draft-revision').value === '7' && !document.querySelector('#logout').disabled, undefined, { timeout: 240000 });
  const blankRead = await page.request.get(origin + `/api/games/${gameId}/draft?revision=7`, { ignoreHTTPSErrors: true, timeout: 240000 });
  const blankDTO = await blankRead.json(); assert.equal(blankRead.status(), 200, JSON.stringify(blankDTO));
  const blankChapter = blankDTO.chapters[21]; assert.equal(blankChapter.name, '新章节');
  assert.deepEqual(blankChapter.factions, []); assert.deepEqual(blankChapter.generals, []);
  assert.ok(blankChapter.gaps.activeGaps > 0);
  checks.push('exact empty authoring chapter commits7 and reads22chapters; no factions/generals and active gaps remain, not a playable initializer; malformed blank profile negatives separately rejected');
  for (const [index, revision, name] of [[21, '8', '新空白章'], [20, '9', '副本改名']]) {
    page.once('dialog', dialog => dialog.accept(name));
    await page.locator('#draft-chapters .chapter-row').nth(index).getByRole('button', { name: '改名', exact: true }).click();
    await page.waitForFunction(rev => document.querySelector('#draft-revision').value === rev && !document.querySelector('#draft-save-button').disabled && !document.querySelector('#logout').disabled, revision, { timeout: 240000 });
    const response = await page.request.get(origin + `/api/games/${gameId}/draft?revision=${revision}`, { ignoreHTTPSErrors: true, timeout: 240000 });
    const dto = await response.json(); assert.equal(response.status(), 200, JSON.stringify(dto));
    assert.equal(dto.chapters[index].name, name); assert.equal(dto.chapters[index].chapterId, blankDTO.chapters[index].chapterId);
    assert.deepEqual(dto.chapters[index].factions, blankDTO.chapters[index].factions);
    assert.match(await page.locator('#draft-chapters .chapter-row').nth(index).textContent(), new RegExp(name));
    checks.push(`actual newly-created chapter rename commits${revision}, exact read retains generated ID and resources; no playable initialization claim`);
  }
  for (const [index, revision, remaining] of [[21, '10', 21], [20, '11', 20]]) {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#draft-chapters .chapter-row').nth(index).getByRole('button', { name: '刪除本章', exact: true }).click();
    await page.waitForFunction(rev => document.querySelector('#draft-revision').value === rev && !document.querySelector('#draft-save-button').disabled && !document.querySelector('#logout').disabled, revision, { timeout: 240000 });
    const response = await page.request.get(origin + `/api/games/${gameId}/draft?revision=${revision}`, { ignoreHTTPSErrors: true, timeout: 240000 });
    const dto = await response.json(); assert.equal(response.status(), 200, JSON.stringify(dto));
    assert.equal(dto.chapters.length, remaining); assert.equal(dto.chapters.some(chapter => chapter.chapterId === blankDTO.chapters[index].chapterId), false);
    assert.equal(dto.chapters[0].name, '收據章'); assert.deepEqual(dto.chapters[0].factions, firstResources);
    assert.equal(await page.locator('#draft-chapters .chapter-row').count(), remaining);
    checks.push(`actual renamed temporary chapter deletion commits${revision}; exact read removes only that chapter and preserves original resources, not physical game-content deletion`);
  }
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#draft-chapters .chapter-row').first().getByRole('button', { name: '刪除本章', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#draft-revision').value === '12' && !document.querySelector('#draft-save-button').disabled && !document.querySelector('#logout').disabled, undefined, { timeout: 240000 });
  const removedRead = await page.request.get(origin + `/api/games/${gameId}/draft?revision=12`, { ignoreHTTPSErrors: true, timeout: 240000 });
  const removedDTO = await removedRead.json(); assert.equal(removedRead.status(), 200, JSON.stringify(removedDTO));
  assert.equal(removedDTO.chapters.length, 19);
  assert.deepEqual(removedDTO.chapters.map(chapter => chapter.chapterId), blankDTO.chapters.slice(1, 20).map(chapter => chapter.chapterId));
  assert.deepEqual(removedDTO.chapters[0].factions, blankDTO.chapters[1].factions);
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), 19);
  checks.push('actual previously renamed/resource-edited original chapter deletion commits12; exact remaining nineteen chapter IDs/order and next chapter resources preserved');
  } else { await load(page, '1'); }
  const copyRevision = focused ? 2 : 13, cityRevision = String(copyRevision + 1), generalRevision = String(copyRevision + 2), descendantRevision = String(copyRevision + 3), detachedRevision = String(copyRevision + 4), deleteRevision = String(copyRevision + 5), survivingChapters = focused ? 20 : 19;
  process.stderr.write('draft-ui: copied chapter entity panels\n');
  await page.locator('#draft-chapters .chapter-row').first().getByRole('button', { name: '複製本章', exact: true }).click();
  await page.waitForFunction(rev => document.querySelector('#draft-revision').value === rev && !document.querySelector('#logout').disabled, String(copyRevision), { timeout: 240000 });
  async function exactDraft(revision) {
    const response = await page.request.get(origin + `/api/games/${gameId}/draft?revision=${revision}`, { ignoreHTTPSErrors: true, timeout: 240000 });
    const dto = await response.json(); assert.equal(response.status(), 200, JSON.stringify(dto)); return dto;
  }
  async function verifyChapterDates(snapshot) {
    const before = apiRequests;
    const rows = await page.locator('#draft-chapters .chapter-row').evaluateAll(nodes => nodes.map(node => ({
      chapterId: node.dataset.chapterId,
      text: node.querySelector('.chapter-start-date').textContent,
      controls: node.querySelector('.chapter-start-date').querySelectorAll('input,select,textarea,button').length,
    })));
    assert.deepEqual(rows.map(row => row.chapterId), snapshot.chapters.map(chapter => chapter.chapterId));
    rows.forEach((row, index) => {
      const date = snapshot.chapters[index].startDate;
      assert.ok(date, 'fixed complete chapters retain their source dates');
      assert.ok(row.text.includes(`${date.year}年 ${date.month}月 ${date.day}日`));
      assert.match(row.text, /唯讀/); assert.equal(row.controls, 0);
    });
    assert.equal(apiRequests, before, 'reading displayed dates must not fetch or save');
  }
  const entityBefore = await exactDraft(String(copyRevision)), entityCopy = entityBefore.chapters.at(-1), entitySource = entityBefore.chapters[0];
  await verifyChapterDates(entityBefore);
  assert.deepEqual(entityCopy.startDate, entitySource.startDate);
  checks.push('all copied-revision chapter dates match authenticated exact DTO in Vue, copied chapter retains source date, read-only inspection sends no request');
  assert.equal(entityBefore.chapters.length, survivingChapters + 1); assert.notEqual(entityCopy.chapterId, entitySource.chapterId);
  for (const chapter of entityBefore.chapters) {
    const { saveGaps, activeGaps, details } = chapter.gaps;
    assert.equal(details.save.length + details.omittedSave, saveGaps);
    assert.equal(details.active.length + details.omittedActive, activeGaps);
    assert.ok([...details.save, ...details.active].every(row => row.recognized && typeof row.code === 'string' && typeof row.subject === 'string' && typeof row.description === 'string'));
  }
  const firstGapDetails = page.locator('#draft-chapters .chapter-row').first().locator('.chapter-gap-details'), requestsBeforeGap = apiRequests;
  await firstGapDetails.locator('summary').click();
  const gapText = await firstGapDetails.textContent();
  assert.match(gapText, /零缺口不代表可試運行或發布/);
  for (const row of [...entitySource.gaps.details.save, ...entitySource.gaps.details.active]) {
    assert.ok(gapText.includes(row.subject)); assert.ok(gapText.includes(row.description));
  }
  assert.equal(await firstGapDetails.locator('img').count(), 0); assert.equal(apiRequests, requestsBeforeGap);
  checks.push('actual exact-revision chapter gap DTO counts/details agree for every chapter; native Vue expansion matches authenticated read, sends no request and does not grant admission');
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await page.locator('#stronghold-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('#stronghold-cities tbody tr').length === 192 && !document.querySelector('#logout').disabled, undefined, { timeout: 240000 });
  assert.equal(await page.locator('#stronghold-cities input').count(), 0);
  const verifyCityTypes = async chapter => {
    const before = apiRequests;
    await page.locator('#native-city-chapter').selectOption(chapter.chapterId);
    const actual = await page.locator('#native-city-table tr[data-native-city]').evaluateAll(rows => rows.map(row => ({ idx: Number(row.dataset.nativeCity), text: row.querySelector('[data-native-type]').textContent, controls: row.querySelector('[data-native-type]').querySelectorAll('input,select,button,textarea').length })));
    assert.deepEqual(actual, chapter.cities.map(city => ({ idx: city.idx, text: String(city.typeCode ?? '未知'), controls: 0 })));
    const ownership = await page.locator('#native-city-table tr[data-native-city]').evaluateAll(rows => rows.map(row => ({ idx: Number(row.dataset.nativeCity), faction: row.querySelector('[data-native-faction]').textContent, governor: row.querySelector('[data-native-governor]').textContent, controls: row.querySelector('[data-native-governor]').parentElement.querySelectorAll('input,select,button,textarea').length })));
    assert.deepEqual(ownership, chapter.cities.map(city => ({ idx: city.idx, faction: '歸屬欄位：' + (city.faction === null ? '未提供／無' : '#' + city.faction), governor: '太守欄位：' + (city.governor === null ? '未提供／無' : '#' + city.governor), controls: 0 })));
    assert.equal(apiRequests, before);
  };
  await verifyCityTypes(entitySource);
  await verifyCityTypes(entityCopy);
  assert.deepEqual(entityCopy.cities.map(city => city.typeCode), entitySource.cities.map(city => city.typeCode));
  checks.push('original and copied chapter type codes match authenticated exact saved DTO for all 192 rows each; read-only chapter switching sends no request');
  assert.deepEqual(entityCopy.cities.map(city => [city.faction, city.governor]), entitySource.cities.map(city => [city.faction, city.governor]));
  checks.push('original and copied chapter faction/governor values match exact authenticated source DTO in all 192 read-only rows, without extra browser requests');
  const copiedCity = entityCopy.cities.find(city => city.troops > 0), newTroops = copiedCity.troops - 1;
  const copiedCityRow = page.locator(`#native-city-table tr[data-native-city="${copiedCity.idx}"]`);
  const cityInput = copiedCityRow.locator('[data-native-field="troops"]'), cityButton = copiedCityRow.locator('[data-native-save]');
  const beforeCity = apiRequests, beforeCitySaves = requests.length;
  await cityInput.fill(String(newTroops)); await page.locator('#native-city-revision').fill('999');
  page.once('dialog', dialog => dialog.dismiss()); await cityButton.click(); await wait(page);
  assert.equal(apiRequests, beforeCity); assert.equal(await cityInput.inputValue(), String(newTroops));
  const cityReply = page.waitForResponse(response => response.url() === origin + '/api/games/' + gameId + '/draft/save' && response.request().method() === 'POST', { timeout: 240000 });
  page.once('dialog', dialog => dialog.accept()); await cityButton.click();
  const response = await cityReply; assert.equal(response.status(), 200);
  assert.equal(response.request().headers()['if-match'], '"' + copyRevision + '"');
  assert.deepEqual(response.request().postDataJSON(), { metadata: entityBefore.metadata, resourceEdits: [], chapterEdits: [{ op: 'city-native', chapterId: entityCopy.chapterId, cityIdx: copiedCity.idx, values: { troops: newTroops } }] });
  await page.waitForFunction(rev => document.querySelector('#native-city-message').textContent.includes('已確認保存修訂 ' + rev) && !document.querySelector('#logout').disabled, cityRevision, { timeout: 240000 });
  assert.equal(apiRequests, beforeCity + 1); assert.equal(requests.length, beforeCitySaves + 1);
  assert.equal(await cityInput.isDisabled(), true); assert.equal(await cityInput.inputValue(), String(copiedCity.troops));
  await page.locator('#native-city-load').click(); await wait(page);
  assert.equal(await cityInput.isEnabled(), true); assert.equal(await cityInput.inputValue(), String(newTroops));
  const entity14 = await exactDraft(cityRevision);
  assert.equal(entity14.chapters.at(-1).cities.find(city => city.idx === copiedCity.idx).troops, newTroops);
  assert.deepEqual(entity14.chapters.slice(0, -1), entityBefore.chapters.slice(0, -1));
  assert.equal(await page.locator('#native-city-chapter').inputValue(), entityCopy.chapterId);
  assert.deepEqual(await exactDraft(String(copyRevision)), entityBefore);
  assert.deepEqual(entity14.chapters.map(chapter => chapter.cities.map(city => city.typeCode)), entityBefore.chapters.map(chapter => chapter.cities.map(city => city.typeCode)));
  assert.deepEqual(entity14.chapters.map(chapter => chapter.cities.map(city => [city.faction, city.governor])), entityBefore.chapters.map(chapter => chapter.cities.map(city => [city.faction, city.governor])));
  await verifyCityTypes(entity14.chapters.at(-1));
  checks.push('troops-only city save preserves faction/governor fields in every chapter, explicit reread matches the new revision and previous snapshot remains intact');  checks.push('city-native troop save does not carry or change type codes; explicit reread displays saved types while prior snapshot remains intact');
  assert.deepEqual(entity14.chapters.map(chapter => chapter.startDate), entityBefore.chapters.map(chapter => chapter.startDate));
  await page.locator('#menu [data-view="draft-editor"]').click();
  await verifyChapterDates(entity14);
  checks.push('after explicit city-save reread every date remains unchanged; chapter page matches that exact revision and old copied-revision DTO remains intact');
  checks.push(`actual copied chapter${copyRevision} uses shared native city journal: cancel sends nothing, city-native save${cityRevision} uses read revision not999, no automatic GET, stale rows locked until explicit read; only copied troops change and old snapshot/original chapter persist`);
  if (!cityOnly) {
  await page.locator('#menu [data-view="generals-editor"]').click(); await page.locator('#generals-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('#generals-chapters tr[data-general-idx]').length === 128 && !document.querySelector('#logout').disabled, undefined, { timeout: 240000 });
  await page.locator('#generals-chapter').selectOption(entityCopy.chapterId);
  const renameButton = page.locator('#generals-chapters tr[data-general-idx="0"]').getByRole('button', { name: '改名／字', exact: true });
  await page.locator('#native-general-revision').fill('999');
  process.stderr.write('draft-ui: copied general shared journal\n');
  for (const decision of ['cancel', 'save']) {
    const beforeRequests = apiRequests, beforeSaves = requests.length, answers = ['副本武將', '副本字']; let confirmations = 0;
    const answer = async dialog => {
      if (dialog.type() === 'prompt') { assert.ok(answers.length); await dialog.accept(answers.shift()); }
      else { assert.equal(dialog.type(), 'confirm'); confirmations++; if (decision === 'save') await dialog.accept(); else await dialog.dismiss(); }
    };
    const reply = decision === 'save' ? page.waitForResponse(response => response.url() === origin + '/api/games/' + gameId + '/draft/save' && response.request().method() === 'POST', { timeout: 240000 }) : null;
    page.on('dialog', answer);
    try { await renameButton.click(); await wait(page); } finally { page.off('dialog', answer); }
    assert.equal(answers.length, 0); assert.equal(confirmations, 1);
    if (decision === 'cancel') { assert.equal(apiRequests, beforeRequests); assert.equal(requests.length, beforeSaves); continue; }
    const response = await reply; assert.equal(response.status(), 200);
    assert.equal(response.request().headers()['if-match'], '"' + cityRevision + '"');
    assert.deepEqual(response.request().postDataJSON(), { metadata: entity14.metadata, resourceEdits: [], chapterEdits: [{ op: 'rename-general', chapterId: entityCopy.chapterId, generalIdx: 0, values: { name: '副本武將', hao: '副本字' } }] });
    await page.waitForFunction(rev => document.querySelector('#native-general-message').textContent.includes('已確認保存修訂 ' + rev) && !document.querySelector('#logout').disabled, generalRevision, { timeout: 240000 });
    assert.equal(apiRequests, beforeRequests + 1); assert.equal(requests.length, beforeSaves + 1);
    assert.equal(await renameButton.isDisabled(), true);
    assert.match(await page.locator('#generals-context').textContent(), new RegExp('修訂 ' + cityRevision));
  }
  await page.locator('#native-general-load').click(); await wait(page);
  assert.equal(await renameButton.isDisabled(), true);
  await page.locator('#generals-refresh').click(); await wait(page);
  assert.equal(await renameButton.isEnabled(), true);
  assert.match(await page.locator('#generals-context').textContent(), new RegExp('修訂 ' + generalRevision));
  process.stderr.write('draft-ui: copied general explicitly reread\n');
  const entity15 = await exactDraft(generalRevision), finalCopy = entity15.chapters.at(-1);
  assert.equal(finalCopy.generals[0].name, '副本武將'); assert.equal(finalCopy.generals[0].hao, '副本字');
  assert.equal(finalCopy.cities.find(city => city.idx === copiedCity.idx).troops, newTroops);
  assert.deepEqual(entity15.chapters.slice(0, -1), entity14.chapters.slice(0, -1));
  assert.deepEqual(await exactDraft(cityRevision), entity14);
  assert.equal(await page.locator('#generals-chapter').inputValue(), entityCopy.chapterId);
  checks.push(`actual copied chapter shared rename journal: two prompts plus explicit confirmation, cancellation zero requests, saved${cityRevision} not typed999, single isolated command commits${generalRevision} with no automatic GET; shared exact read then independent table refresh unlocks, old snapshot and all original chapters persist`);
  process.stderr.write('draft-ui: copy edited chapter with lost response\n');
  await page.locator('#menu [data-view="draft-editor"]').click();
  await page.locator('#draft-games-refresh').click(); await wait(page); await load(page, generalRevision);
  const draftPath = `/api/games/${gameId}/draft`, copySaveURL = origin + draftPath + '/save';
  const recoveryTraffic = [], savesBeforeCopy = requests.length, dropsBeforeCopy = dropped;
  const observeRecovery = request => {
    const url = new URL(request.url());
    if (url.pathname === draftPath || url.pathname.startsWith(draftPath + '/')) recoveryTraffic.push({ method: request.method(), path: url.pathname, query: url.search });
  };
  page.on('request', observeRecovery);
  let committedCopy, copyBody;
  await page.route(copySaveURL, async route => {
    copyBody = route.request().postDataJSON();
    const response = await route.fetch({ timeout: 240000 }); assert.equal(response.status(), 200);
    committedCopy = await response.json(); dropped++; await route.abort();
  });
  await page.locator('#draft-revision').fill('999');
  await page.locator('#draft-chapters .chapter-row').last().getByRole('button', { name: '複製本章', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('保存未確認') && !document.querySelector('#draft-operation-query').disabled, undefined, { timeout: 240000 });
  await page.unroute(copySaveURL);
  assert.equal(dropped, dropsBeforeCopy + 1); assert.equal(committedCopy.draftRevision, descendantRevision);
  assert.equal(requests.length, savesBeforeCopy + 1);
  const copyKey = requests.at(-1).key;
  assert.equal(requests.at(-1).revision, `"${generalRevision}"`);
  assert.deepEqual(copyBody, { metadata: entity15.metadata, resourceEdits: [], chapterEdits: [{ op: 'copy', chapterId: finalCopy.chapterId }] });
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), survivingChapters + 1);
  assert.equal(await page.locator('#draft-save-button').isDisabled(), true);
  const associations = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('editor-draft-operation:')).map(([, value]) => JSON.parse(value)));
  assert.deepEqual(associations, [{ gameId, key: copyKey, revision: generalRevision }]);
  const allowReload = async dialog => { assert.equal(dialog.type(), 'beforeunload'); await dialog.accept(); };
  page.on('dialog', allowReload);
  try { await page.reload(); } finally { page.off('dialog', allowReload); }
  await page.locator('#draft-editor').waitFor({ state: 'visible' }); await wait(page);
  assert.equal(await page.locator('#draft-operation-retry').isDisabled(), true);
  assert.equal(requests.length, savesBeforeCopy + 1);
  await page.locator('#draft-operation-query').click();
  await page.waitForFunction(rev => document.querySelector('#draft-status').textContent.includes('已確認保存修訂 ' + rev), descendantRevision, { timeout: 240000 });
  assert.equal(await page.locator('#draft-save-button').isDisabled(), true);
  assert.equal(await page.locator('#draft-trial-start').isDisabled(), true);
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), 0);
  assert.deepEqual(recoveryTraffic, [{ method: 'POST', path: draftPath + '/save', query: '' }, { method: 'GET', path: draftPath + '/operations/' + copyKey, query: '' }]);
  process.stderr.write('draft-ui: copied chapter original key recovered; explicit read\n');
  await load(page, descendantRevision);
  page.off('request', observeRecovery);
  assert.equal(requests.length, savesBeforeCopy + 1);
  assert.deepEqual(recoveryTraffic.at(-1), { method: 'GET', path: draftPath, query: '?revision=' + descendantRevision });
  assert.equal(recoveryTraffic.length, 3);
  copiedChapterRecovery = { key: copyKey, fromRevision: generalRevision, toRevision: descendantRevision, body: copyBody, traffic: recoveryTraffic, saveRequests: requests.length - savesBeforeCopy, associationKeys: Object.keys(associations[0]).sort() };
  checks.push(`actual chapter copy commits${descendantRevision} but response is lost: typed999 ignored, reload keeps only original key association, query sends no duplicate POST or source read; receipt cannot enable edits/Trial, exact read installs the single descendant`);
  const copiedDescendant = await exactDraft(descendantRevision), descendant = copiedDescendant.chapters.at(-1);
  assert.equal(copiedDescendant.chapters.length, survivingChapters + 2);
  assert.notEqual(descendant.chapterId, finalCopy.chapterId);
  assert.deepEqual(copiedDescendant.chapters.slice(0, -1), entity15.chapters);
  assert.equal(descendant.generals[0].name, finalCopy.generals[0].name);
  assert.equal(descendant.generals[0].hao, finalCopy.generals[0].hao);
  assert.deepEqual(descendant.cities, finalCopy.cities);
  assert.deepEqual(descendant.factions, finalCopy.factions);
  checks.push(`actual copy of edited chapter commits${descendantRevision}; independent read preserves prior chapters and captures edited city/general values`);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#draft-chapters .chapter-row').nth(survivingChapters).getByRole('button', { name: '刪除本章', exact: true }).click();
  await page.waitForFunction(rev => document.querySelector('#draft-revision').value === rev && !document.querySelector('#logout').disabled, detachedRevision, { timeout: 240000 });
  const detached = await exactDraft(detachedRevision);
  assert.deepEqual(detached.chapters, copiedDescendant.chapters.filter(chapter => chapter.chapterId !== finalCopy.chapterId));
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), survivingChapters + 1);
  checks.push(`actual source deletion commits${detachedRevision}; retained descendant and every other chapter DTO unchanged`);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#draft-chapters .chapter-row').last().getByRole('button', { name: '刪除本章', exact: true }).click();
  await page.waitForFunction(rev => document.querySelector('#draft-revision').value === rev && !document.querySelector('#logout').disabled, deleteRevision, { timeout: 240000 });
  const entity16 = await exactDraft(deleteRevision);
  assert.deepEqual(entity16.chapters, entityBefore.chapters.slice(0, -1));
  assert.equal(await page.locator('#draft-chapters .chapter-row').count(), survivingChapters);
  checks.push(`actual deletion of detached descendant commits${deleteRevision}; all ${survivingChapters} original surviving chapter DTOs preserved`);
  }
  }
  assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []); const shot = process.argv[2]; assert.ok(typeof shot === 'string' && /^\.dragon-analysis\/editor-phase\/backend-draft-ui-session-r1\/ui-r[1-9][0-9]*\.png$/.test(shot)); const pixels = await page.screenshot({ fullPage: true }); writeFileSync(shot, pixels, { flag: 'wx' }); for (const [p,h] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(p)), h);
  let scope = 'combined';
  if (focused) scope = 'copied-entity-only';
  if (cityOnly) scope = 'city-native-only';
  if (trialClose) scope = 'trial-close-only';
  process.stdout.write(JSON.stringify({ result: 'PASS-REAL-PRIVATE-METADATA-UI', scope, backend: nodeService ? 'owned-node-file-sqlite-file-bucket-https' : 'owned-workerd-sqlite-r2-https', checks, calls, sourceHashes, browserSaveRequests: requests.length, droppedResponses: dropped, copiedChapterRecovery, trialDraftObservation, errors, outside, expected, screenshot: shot, screenshotSha: sha(pixels), limits: trialClose ? 'Actual Node HTTPS workbench login, child Trial App, editor close and independent monitor/end; fixed full copy only, no offline/relogin/all-window/production certificate.' : 'Actual local Root/SQL/object bucket and fresh browser metadata/resource/chapter/copied-city/general-text UI; no arbitrary source/map/role UI, playable range/runtime/compiler/Q69/Trial/release/cloudSLA or goalcompletion. Response loss at browser network only, no fake successful backend.' }, null, 2) + '\n');
} catch (error) {
  let display = null;
  try { display = await failurePage?.evaluate(() => Object.fromEntries(['draft-status', 'native-city-message', 'stronghold-message', 'generals-message', 'generals-context'].map(id => [id, document.getElementById(id)?.textContent ?? null]))); } catch { /* Closed browser still retains recorded HTTP errors. */ }
  process.stderr.write(JSON.stringify({ failureEvidence: true, completedGroups: checks.length, display, rejectedSaves }) + '\n');
  throw error;
} finally { await browser?.close(); await server?.close(); }
