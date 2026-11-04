// B2 上架管理：actual shared editor static routing/headers/HTML/modules in a fresh browser
// with controlled API responses. Nowhere does this claim authority/compiler/R2/player-visibility
// behaviour: the receipt, the release pin and the administrator listing stay separate facts.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
register('../vps/text-loader.mjs', import.meta.url);
const { default: gateway } = await import('../server/editorapp.js');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const root = '.dragon-analysis/release-readiness'; mkdirSync(root, { recursive: true }); const out = mkdtempSync(join(root, 'submission-ui-browser-'));
const origin = 'https://owned-editor.invalid';
const A = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', DG = '11111111-1111-4111-8111-111111111111', DP = '22222222-2222-4222-8222-222222222222', PG = '33333333-3333-4333-8333-333333333333', LG = '44444444-4444-4444-8444-444444444444', R = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const time = '2026-10-15T00:00:00.000Z', earlier = '2026-10-01T00:00:00.000Z', journalKey = 'editor-submission-operation:' + A;
const files = { '/shell-ui.js':'shell-ui.txt', '/shell-ui.css':'shell-ui.css', '/': 'index.html', '/style.css': 'style.css', '/client.js':'client.txt', '/draft.js':'draft.txt', '/stage.js':'stage.txt', '/library.js':'library.txt', '/catalog.js':'catalog.txt', '/management.js':'management.txt', '/publish.js':'publish.txt', '/review.js':'review.txt', '/stronghold.js':'stronghold.txt', '/general.js':'general.txt', '/mapview.js':'mapview.txt', '/stage-assets.js':'stageassets.txt' };
const payloads = new Map(Object.entries(files).map(([url, file]) => [url, readFileSync('server/public/' + file)]));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(k)));
const errors = [], outside = [], failed = [], posts = [], deletes = [], purges = [], calls = [], expectedErrors = [], checks = [], consoleErrors = [];
let browser, stage = 'launch', publishMode = 'success', statusMode = 'pending', sessionId = A, sessionVersion = 1, queryCount = 0;
const records = new Map(), row = (gameId, name, state, version, stateTime, rejected = false) => ({ gameId, name, introduction: name + ' 的說明', version, state, stateTime, restricted: false, rejected, rowRevision: '1', createdAt: earlier });
const RG = '55555555-5555-4555-8555-555555555555';
let rows = [row(DG, '草稿遊戲', 'draft', null, null), row(DP, '待上架遊戲', 'draft', null, null), row(PG, '待上架遊戲', 'pending', '1.0', earlier), row(LG, '已上架遊戲', 'listed', '1.0', time), row(RG, '被拒遊戲', 'pending', '1.0', earlier, true)];
function parsed(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('bad owned request', { cause }); } }
try {
 for (const [path, expected] of payloads) {
  const response = await gateway.fetch(new Request(origin + path), {});
  assert.equal(response.status, 200, path);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, path);
  let mime = /^text\/javascript/;
  if (path === '/') mime = /^text\/html/;
  else if (path.endsWith('.css')) mime = /^text\/css/;
  assert.match(response.headers.get('Content-Type'), mime);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
 }
 browser = await chromium.launch({ headless: true, env }); const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
 await context.addInitScript(() => { window.__ownedIDB = 0; indexedDB.open = () => { window.__ownedIDB++; throw new Error('IDB forbidden'); }; });
 await context.route('**/*', async route => {
  const request = route.request(); let url; try { url = new URL(request.url()); } catch { outside.push(request.url()); return route.abort(); }
  calls.push({ path: url.pathname, method: request.method() });
  if (url.origin !== origin) { outside.push(url.href); return route.abort(); }
  const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
  if (payloads.has(url.pathname)) {
   const response = await gateway.fetch(new Request(request.url(), { method: request.method() }), {});
   return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  }
  if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
  if (url.pathname === '/api/session') return json({ user: { id: sessionId, account: 'owned_author', role: 'author', version: sessionVersion, mustChangePassword: false }, csrf: 'owned-csrf-only' });
  if (url.pathname === '/api/resources') return json({ resources: [] });
  if (url.pathname === '/api/games/submissions') return json({ games: rows });
  if (url.pathname === '/api/publish') {
   assert.equal(request.method(), 'POST'); assert.equal(request.headers()['x-csrf-token'], 'owned-csrf-only');
   const key = request.headers()['idempotency-key'], body = parsed(request.postData()); posts.push({ key, body }); assert.match(key, /^[a-f0-9-]{36}$/);
   const name = rows.find(entry => entry.gameId === body.gameId).name; assert.equal(body.name, name);
   if (publishMode === 'rejected') { expectedErrors.push(422); return json({ error: 'DRAFT_TOPOLOGY_BROKEN' }, 422); }
   if (!records.has(key)) records.set(key, { gameId: body.gameId, name, revision: '1', sourceDigest: 'd'.repeat(64), chapters: [body.gameId + '#upper-1'], publishedAt: time, ordinal: '1.0' });
   if (publishMode === 'lost') { expectedErrors.push(503); return json({ error: 'OWNED_LOST_RESPONSE' }, 503); }
   rows = rows.map(entry => entry.gameId === body.gameId ? { ...entry, state: 'pending', version: records.get(key).ordinal } : entry);
   return json(records.get(key));
  }
  if (/^\/api\/games\/[a-f0-9-]+\/publish-operations\//.test(url.pathname)) {
   queryCount++; const key = url.pathname.split('/').at(-1), gameId = url.pathname.split('/')[3];
   if (statusMode === 'unavailable') { expectedErrors.push(503); return json({ error: 'DISTRIBUTION_NOT_CONFIGURED' }, 503); }
   if (!records.has(key) || statusMode === 'absent') { expectedErrors.push(404); return json({ error: 'PUBLISH_OPERATION_NOT_FOUND' }, 404); }
   return json({ version: 1, gameId, releaseId: R, pin: records.get(key), distribution: { gameId, operationId: R, generation: 1, kind: 'publish', state: statusMode, visibleAt: statusMode === 'confirmed' ? time : null, recoveryRequired: false } });
  }
  if (/^\/api\/games\/[a-f0-9-]+\/draft\/chapter-references$/.test(url.pathname)) {
   const gameId = url.pathname.split('/')[3];
   // 上架前必先校驗（產品決定 2026-11）：這裡回報「全部章引用完整」。
   return json({ version: 1, gameId, draftRevision: '1', sourceDigest: 'd'.repeat(64), chapterCount: 1, chapters: [] });
  }
  if (/^\/api\/admin\/games\/[a-f0-9-]+\/purge$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); const gameId = url.pathname.split('/')[4], body = parsed(request.postData());
   purges.push({ gameId, body });
   rows = rows.filter(entry => entry.gameId !== gameId);
   return json({ version: 1, gameId, state: 'purged', tables: 31, removed: { content_games: 1 }, purgedAt: time });
  }
  if (/^\/api\/games\/[a-f0-9-]+\/deletion$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); const body = parsed(request.postData()), gameId = url.pathname.split('/')[3], target = rows.find(entry => entry.gameId === gameId);
   deletes.push({ key: request.headers()['idempotency-key'], body });
   assert.deepEqual(body, { gameId, expectedRowRevision: target.rowRevision, confirmationName: target.name });
   rows = rows.filter(entry => entry.gameId !== gameId);
   return json({ gameId, state: 'fenced', createdAt: time, rowRevision: '2' });
  }
  outside.push(url.href); return route.abort();
 });
 const page = await context.newPage(); page.setDefaultTimeout(20000);
 page.on('pageerror', e => errors.push(String(e))); page.on('requestfailed', r => failed.push(r.url()));
 page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
 page.on('dialog', d => d.accept());
 const show = async () => { await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor'); await page.click('#publish-refresh'); await idle(); };
 const idle = () => page.waitForFunction(() => !document.querySelector('#publish-refresh').disabled);
 const cell = (gameId, field) => page.locator(`#publish-table tr[data-game-id="${gameId}"] [data-field="${field}"]`).textContent();
 const act = (gameId, name) => page.locator(`#publish-table tr[data-game-id="${gameId}"] [data-action="${name}"]`);
 const box = () => page.locator('.el-message-box');
 const journal = () => page.evaluate(k => sessionStorage.getItem(k), journalKey);
 stage = '清單投影：三態、版本、狀態時間與操作可用性；開頁不自動發請求';
 await page.goto(origin); const mark = calls.length; await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor');
 assert.equal(calls.slice(mark).filter(call => call.path === '/api/games/submissions' || call.method === 'POST').length, 0, 'opening 上架管理 must not read the list or post by itself');
 await page.click('#publish-refresh'); await idle();
 assert.equal(await cell(DG, 'version'), '—'); assert.equal((await cell(DG, 'state')).trim(), '草稿'); assert.equal(await cell(DG, 'state-time'), '—');
 assert.equal(await cell(PG, 'version'), '1.0'); assert.equal((await cell(PG, 'state')).trim(), '待上架');
 assert.equal((await cell(LG, 'state')).trim(), '已上架'); assert.match((await cell(LG, 'state-time')).trim(), /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/);
 assert.equal(await act(LG, 'delete').isDisabled(), false); assert.match(await act(LG, 'delete').getAttribute('title'), /刪除整個遊戲.*不是刪除單個版本.*不可恢復/);
 assert.equal((await page.locator(`#publish-table tr[data-game-id="${RG}"] [data-field="rejected"]`).textContent()).trim(), '已駁回'); assert.equal(await act(RG, 'delete').isDisabled(), false);
 assert.match(await act(DG, 'publish').getAttribute('title'), /1\.0/); assert.equal(posts.length, 0); checks.push(stage);
 stage = '上架前強提醒版本號 +1 並提交管理員審核；4xx 明確拒絕不改狀態且解除追蹤';
 publishMode = 'rejected'; await act(DG, 'publish').click(); await box().waitFor();
 const warn = await box().textContent(); for (const phrase of ['版本號自動 +1', '本次 1.0', '提交管理員審核']) assert.ok(warn.includes(phrase), warn);
 await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(posts.length, 1); assert.deepEqual(posts[0].body, { gameId: DG, name: '草稿遊戲' });
 assert.match(await page.locator('#publish-message').textContent(), /據點移動意向/); assert.match(await page.locator('#publish-message').textContent(), /本次未提交/);
 assert.equal(await journal(), null); assert.equal(await cell(DG, 'version'), '—'); assert.equal((await cell(DG, 'state')).trim(), '草稿');
 assert.equal(await act(DG, 'publish').isDisabled(), false); await page.locator('#publish-editor').screenshot({ path: join(out, 'rejected.png') }); checks.push(stage);
 stage = '失去回應保留原鍵、reload 只恢復關聯、僅 GET404 允許同鍵重送';
 publishMode = 'lost'; await act(DP, 'publish').click(); await box().waitFor(); await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(posts.length, 2); const lost = posts.at(-1); assert.equal(parsed(await journal()).key, lost.key); assert.match(await page.locator('#publish-message').textContent(), /原鍵保留/);
 assert.equal(await page.isDisabled('#publish-retry'), true); assert.equal(await act(DG, 'publish').isDisabled(), true);
 const before = calls.length; await page.reload(); await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor');
 assert.equal(calls.slice(before).some(call => call.path === '/api/publish'), false); assert.match(await page.locator('#publish-operation').textContent(), new RegExp(lost.key)); checks.push(stage);
 stage = '只讀查詢：404 才允許重送，distribution kind 錯不推定公開';
 statusMode = 'absent'; await page.click('#publish-query'); await idle(); assert.equal(await page.isDisabled('#publish-retry'), false);
 statusMode = 'pending'; publishMode = 'success'; await page.click('#publish-retry'); await idle(); assert.equal(posts.length, 3); assert.deepEqual(posts[2], lost);
 assert.match(await page.locator('#publish-result').textContent(), /本地已提交上架：版本 1\.0.*分發待確認/); assert.equal(await journal(), null);
 assert.equal((await cell(DP, 'state')).trim(), '待上架'); assert.equal(await cell(DP, 'version'), '1.0'); checks.push(stage);
 stage = '刪除：強提醒、取消不動、確認後行消失';
 await act(PG, 'delete').click(); await box().waitFor();
 const deleting = await box().textContent(); for (const phrase of ['刪除整個遊戲', '不是刪除單個版本', '不可恢復']) assert.ok(deleting.includes(phrase), deleting);
 await box().locator('.el-message-box__btns .el-button').first().click(); await page.waitForTimeout(200);
 assert.equal(await page.locator(`#publish-table tr[data-game-id="${PG}"]`).count(), 1); assert.equal(deletes.length, 0);
 await page.screenshot({ path: join(out, 'delete-warning.png') });
 await act(PG, 'delete').click(); await box().waitFor(); await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(deletes.length, 1); assert.deepEqual(deletes[0].body, { gameId: PG, expectedRowRevision: '1', confirmationName: '待上架遊戲' });
 assert.equal(await page.locator(`#publish-table tr[data-game-id="${PG}"]`).count(), 0);
 assert.match(await page.locator('#publish-result').textContent(), /已徹底刪除（不可恢復）/); assert.equal(purges.length, 1); assert.deepEqual(purges[0].body, { confirmationName: '待上架遊戲', expectedRowRevision: '2' }); assert.match(await page.locator('#publish-result').textContent(), /不刪玩家本地存檔/);
 await page.locator('#publish-editor').screenshot({ path: join(out, 'deleted.png') }); checks.push(stage);
 stage = '帳戶版本改變後不得以原鍵重送';
 publishMode = 'lost'; await page.reload(); await show();
 await act(DG, 'publish').click(); await box().waitFor(); await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 const kept = posts.length; statusMode = 'absent'; await page.click('#publish-query'); await idle();
 sessionVersion = 2; await page.reload(); await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor');
 await page.click('#publish-query'); await idle(); assert.equal(await page.isDisabled('#publish-retry'), true); assert.equal(posts.length, kept); checks.push(stage);
 stage = '其他帳戶看不到也不消耗前一位的操作關聯';
 sessionId = R; sessionVersion = 1; await page.reload(); await page.waitForSelector('#menu button[data-view="publish-editor"]'); await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor');
 assert.equal((await page.locator('#publish-operation').textContent()).includes(lost.key), false); assert.ok(await journal()); checks.push(stage);
 assert.equal(await page.evaluate(() => window.__ownedIDB), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(failed, []);
 assert.equal(consoleErrors.length, expectedErrors.length); for (const text of consoleErrors) assert.match(text, /Failed to load resource: the server responded with a status of (404|409|422|503)/);
 await page.screenshot({ path: join(out, 'submissions.png') });
 const result = { checks, posts: posts.length, deletes: deletes.length, queryCount, expectedHTTPFailures: expectedErrors.length, unexpectedErrors: errors, outside, failed, browser: browser.version(), sources: Object.fromEntries(Object.entries(files).map(([url, name]) => ['server/public/' + name, sha(payloads.get(url))])), screenshotSHA: sha(readFileSync(join(out, 'submissions.png'))), stateScreenshots: Object.fromEntries(['rejected.png','delete-warning.png','deleted.png'].map(name => [name, sha(readFileSync(join(out, name)))])), staticRoutes: payloads.size, scope: 'actual common static routing/headers/HTML/client in fresh browser; API responses controlled, no authority/compiler/R2/player-visibility claim' };
 writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); process.stdout.write(JSON.stringify({ ...result, sources: 'in owned artifact', artifact: out }) + '\n');
} catch (error) { writeFileSync(join(out, 'failure.json'), JSON.stringify({ stage, error: String(error), stack: error.stack, errors, consoleErrors, outside, failed, posts: posts.length, deletes: deletes.length }, null, 2), { flag: 'wx' }); throw error; }
finally { await browser?.close(); }
