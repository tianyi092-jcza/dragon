// B3 上架審核：actual shared editor static routing/headers/HTML/modules in a fresh
// browser with controlled API responses. 這裡不聲稱 authority/編譯/R2/玩家可見性；
// 只鎖住「審核頁顯示與三個請求」以及開頁不自動發請求。
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
register('../vps/text-loader.mjs', import.meta.url);
const { default: gateway } = await import('../server/editorapp.js');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const root = '.dragon-analysis/release-readiness'; mkdirSync(root, { recursive: true }); const out = mkdtempSync(join(root, 'review-ui-browser-'));
const origin = 'https://owned-editor.invalid';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const DG = '11111111-1111-4111-8111-111111111112', PG = '22222222-2222-4222-8222-222222222222', RG = '33333333-3333-4333-8333-333333333333', LG = '44444444-4444-4444-8444-444444444444';
const TIME = '2026-11-01T00:00:00.000Z', EARLIER = '2026-10-01T00:00:00.000Z';
const files = { '/shell-ui.js': 'shell-ui.txt', '/shell-ui.css': 'shell-ui.css', '/': 'index.html', '/style.css': 'style.css', '/client.js': 'client.txt', '/draft.js': 'draft.txt', '/stage.js': 'stage.txt', '/library.js': 'library.txt', '/catalog.js': 'catalog.txt', '/management.js': 'management.txt', '/publish.js': 'publish.txt', '/review.js': 'review.txt', '/stronghold.js': 'stronghold.txt', '/general.js': 'general.txt', '/mapview.js': 'mapview.txt', '/stage-assets.js': 'stageassets.txt' };
const payloads = new Map(Object.entries(files).map(([url, file]) => [url, readFileSync('server/public/' + file)]));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(k)));
const errors = [], outside = [], failed = [], posts = [], deletes = [], purges = [], calls = [], expectedErrors = [], checks = [], consoleErrors = [];
let browser, stage = 'launch', rejectMode = 'success', sessionRole = 'admin', rowRevisionSerial = 1;
const row = (gameId, name, state, version, stateTime, rejected = false) => ({ gameId, author: 'creator_a', name, introduction: name + ' 的說明', version, state, stateTime, rejected, rowRevision: '4', createdAt: EARLIER });
let rows = [row(DG, '草稿遊戲', 'draft', null, null), row(PG, '待審核遊戲', 'pending', '1.0', EARLIER), row(RG, '被拒遊戲', 'pending', '1.0', EARLIER, true), row(LG, '已上架遊戲', 'listed', '1.0', TIME)];
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
 browser = await chromium.launch({ headless: true, env }); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
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
  if (url.pathname === '/api/session') return json({ user: { id: ADMIN, account: 'owned_admin', role: sessionRole, version: 1, mustChangePassword: false }, csrf: 'owned-csrf-only' });
  if (url.pathname === '/api/resources') return json({ resources: [] });
  if (url.pathname === '/api/games') return json({ games: [] });
  if (url.pathname === '/api/admin/accounts') return json({ accounts: [] });
  if (url.pathname === '/api/admin/reviews') { assert.equal(request.method(), 'GET'); return json({ games: rows }); }
  if (/^\/api\/admin\/games\/[a-f0-9-]+\/review$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); assert.equal(request.headers()['x-csrf-token'], 'owned-csrf-only');
   const body = parsed(request.postData()), gameId = url.pathname.split('/')[4], target = rows.find(entry => entry.gameId === gameId);
   posts.push({ path: url.pathname, key: request.headers()['idempotency-key'], body });
   assert.match(request.headers()['idempotency-key'], /^[a-f0-9-]{36}$/);
   assert.deepEqual(body, { action: 'reject', expectedRowRevision: target.rowRevision });
   if (rejectMode === 'changed') { expectedErrors.push(409); return json({ error: 'GAME_CHANGED' }, 409); }
   if (rejectMode === 'not-submitted') { expectedErrors.push(409); return json({ error: 'REVIEW_NOT_SUBMITTED' }, 409); }
   rowRevisionSerial++;
   rows = rows.map(entry => entry.gameId === gameId ? { ...entry, rejected: true, rowRevision: String(10 + rowRevisionSerial) } : entry);
   return json({ gameId, action: 'reject', ordinal: target.version, rowRevision: String(10 + rowRevisionSerial), rejectedAt: TIME });
  }
  if (/^\/api\/admin\/games\/[a-f0-9-]+\/releases$/.test(url.pathname)) {
   assert.equal(request.method(), 'GET'); const gameId = url.pathname.split('/')[4];
   // 發布歷史只用來鎖「按了才讀」與行內展開；不冒充真實日誌或可見性。
   return json({ gameId, releases: gameId === PG ? [{ gameId, version: '1.0', digest: 'a'.repeat(64), state: 'confirmed', publishedAt: TIME }] : [] });
  }
  if (/^\/api\/games\/[a-f0-9-]+\/listing$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); const body = parsed(request.postData()), gameId = url.pathname.split('/')[3], target = rows.find(entry => entry.gameId === gameId);
   posts.push({ path: url.pathname, key: request.headers()['idempotency-key'], body, match: request.headers()['if-match'] });
   assert.deepEqual(body, { action: 'list', expectedRowRevision: target.rowRevision });
   assert.equal(request.headers()['if-match'], '"' + target.rowRevision + '"');
   rows = rows.map(entry => entry.gameId === gameId ? { ...entry, state: 'listed', stateTime: TIME, rejected: false, rowRevision: '5' } : entry);
   return json({ gameId, listed: true, rowRevision: '5' });
  }
  if (/^\/api\/admin\/games\/[a-f0-9-]+\/purge$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); const gameId = url.pathname.split('/')[4], body = parsed(request.postData());
   purges.push({ gameId, body });
   rows = rows.filter(entry => entry.gameId !== gameId);
   return json({ version: 1, gameId, state: 'purged', tables: 31, removed: { content_games: 1 }, purgedAt: TIME, reclamation: { state: 'completed', pointer: 'rewritten', objects: 3 } });
  }
  if (/^\/api\/games\/[a-f0-9-]+\/deletion$/.test(url.pathname)) {
   assert.equal(request.method(), 'POST'); const body = parsed(request.postData()), gameId = url.pathname.split('/')[3], target = rows.find(entry => entry.gameId === gameId);
   deletes.push({ key: request.headers()['idempotency-key'], body });
   assert.deepEqual(body, { gameId, expectedRowRevision: target.rowRevision, confirmationName: target.name });
   rows = rows.filter(entry => entry.gameId !== gameId);
   return json({ gameId, state: 'fenced', createdAt: TIME, rowRevision: '5' });
  }
  if (url.pathname.startsWith('/api/')) return json({});
  outside.push(url.href); return route.abort();
 });
 const page = await context.newPage(); page.setDefaultTimeout(20000);
 page.on('pageerror', e => errors.push(String(e))); page.on('requestfailed', r => failed.push(r.url()));
 page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
 page.on('dialog', d => d.accept());
 const cell = (gameId, field) => page.locator(`#review-table tr[data-game-id="${gameId}"] [data-field="${field}"]`).textContent();
 const act = (gameId, name) => page.locator(`#review-table tr[data-game-id="${gameId}"] [data-action="${name}"]`);
 const box = () => page.locator('.el-message-box');
 const idle = () => page.waitForFunction(() => !document.querySelector('#review-refresh').disabled);
 const open = async () => { await page.waitForSelector('#menu button[data-view="management-editor"]'); await page.click('#menu button[data-view="management-editor"]'); await page.waitForSelector('#review-editor'); };
 stage = '開頁自動載入一次清單、不發 POST；清單只有管理員可見，四個狀態與按鈕可用性正確';
 await page.goto(origin); const mark = calls.length;
 assert.equal(await page.locator('#menu button[data-view="management-editor"]').count(), 1, '管理員選單要有上架審核');
 await open();
 // ui4 產品決定（使用者要求「點擊進去就要自動載入」）：進入即自動讀一次，且不得 POST。
 assert.equal(calls.slice(mark).filter(call => call.method === 'POST').length, 0, '開頁不得提交');
 assert.equal(calls.slice(mark).filter(call => call.path === '/api/admin/reviews').length, 1, '開頁自動載入一次待審清單');
 await page.click('#review-refresh'); await idle();
 assert.equal(await cell(DG, 'version'), '—');
 assert.equal((await cell(DG, 'state')).trim(), '草稿');
 assert.equal(await cell(DG, 'state-time'), '—');
 assert.equal((await cell(PG, 'state')).trim(), '待上架');
 assert.equal(await page.locator(`#review-table tr[data-game-id="${PG}"] [data-field="rejected"]`).count(), 0);
 assert.match((await cell(RG, 'state')).trim(), /^待上架已駁回$/);
 assert.equal((await page.locator(`#review-table tr[data-game-id="${RG}"] [data-field="rejected"]`).textContent()).trim(), '已駁回');
 assert.equal(await act(RG, 'reject').isDisabled(), true);
 assert.equal(await act(RG, 'approve').isDisabled(), false);
 assert.equal((await cell(LG, 'state')).trim(), '已上架');
 assert.match((await cell(LG, 'state-time')).trim(), /^\d{4}\/\d{1,2}\/\d{1,2} \d\d:\d\d:\d\d$/);
 assert.equal(await act(DG, 'approve').isDisabled(), true);
 assert.equal(await act(DG, 'reject').isDisabled(), true);
 assert.equal(await act(DG, 'delete').isDisabled(), false);
 for (const gameId of [DG, PG, RG, LG]) assert.equal((await cell(gameId, 'author')).trim(), 'creator_a');
 assert.equal(posts.length + deletes.length, 0);
 await page.locator('#review-editor').screenshot({ path: join(out, 'review-list.png') });
 checks.push(stage);
 stage = '發布歷史：進頁不自動讀，按了才發一次 GET；行內展開兩個狀態，再按收起不再發請求';
 const historyReads = () => calls.filter(call => /\/api\/admin\/games\/[a-f0-9-]+\/releases$/.test(call.path));
 assert.equal(historyReads().length, 0, '進審核頁不得自動讀發布歷史');
 await act(PG, 'history').click(); await idle();
 assert.equal(historyReads().length, 1); assert.equal(historyReads()[0].method, 'GET');
 const expanded = page.locator(`#review-table tr[data-history-for="${PG}"]`);
 await expanded.waitFor();
 assert.equal(await expanded.locator('tr[data-state="confirmed"]').count(), 1);
 assert.equal((await expanded.locator('[data-field="digest"]').textContent()).trim(), 'aaaaaaaa');
 assert.match(await page.locator('#review-result').textContent(), /1 筆發布記錄/);
 await act(DG, 'history').click(); await idle();
 assert.equal(historyReads().length, 2);
 assert.match(await page.locator(`#review-table tr[data-history-for="${DG}"]`).textContent(), /還沒有發布記錄/);
 // 同時只能展開一列：打開 DG 就把 PG 收起（資料列本身仍在，且歷史列不冒充它）。
 assert.equal(await page.locator(`#review-table tr[data-history-for="${PG}"]`).count(), 0);
 await act(DG, 'history').click(); await idle();
 assert.equal(await page.locator(`#review-table tr[data-history-for="${DG}"]`).count(), 0);
 assert.equal(historyReads().length, 2, '收起不得再發請求');
 assert.equal(await page.locator('#review-table tr[data-game-id="' + PG + '"]').count(), 1, '同一遊戲的歷史列不得冒充資料列');
 await page.locator('#review-editor').screenshot({ path: join(out, 'publish-history.png') });
 checks.push(stage);
 stage = '同意上架：對話框、既有 listing 請求（原 rowRevision + If-Match）、成功後狀態變已上架';
 await act(PG, 'approve').click(); await box().waitFor();
 const approving = await box().textContent(); for (const phrase of ['同意上架版本 1.0', '公開版本']) assert.ok(approving.includes(phrase), approving);
 await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(posts.filter(post => post.path.endsWith('/listing')).length, 1);
 assert.equal((await cell(PG, 'state')).trim(), '已上架');
 assert.match(await page.locator('#review-result').textContent(), /已同意上架版本 1\.0/);
 checks.push(stage);
 stage = '拒絕：對話框說明回待上架並標記已駁回；成功後顯示已駁回且拒絕鍵禁用';
 await act(DG, 'reject').isDisabled(); rows = rows.map(entry => entry.gameId === DG ? { ...entry, state: 'pending', version: '1.0', stateTime: EARLIER, rowRevision: '4' } : entry);
 await page.click('#review-refresh'); await idle();
 await act(DG, 'reject').click(); await box().waitFor();
 const rejecting = await box().textContent(); for (const phrase of ['回到待上架', '已駁回']) assert.ok(rejecting.includes(phrase), rejecting);
 await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(posts.filter(post => post.path.includes('/review')).length, 1);
 assert.equal((await page.locator(`#review-table tr[data-game-id="${DG}"] [data-field="rejected"]`).textContent()).trim(), '已駁回');
 assert.equal(await act(DG, 'reject').isDisabled(), true);
 assert.match(await page.locator('#review-result').textContent(), /已拒絕版本 1\.0/);
 await page.locator('#review-editor').screenshot({ path: join(out, 'rejected.png') });
 checks.push(stage);
 stage = '拒絕失敗：409 GAME_CHANGED 顯示原因、不清空清單、不自行改狀態';
 rows = rows.map(entry => entry.gameId === RG ? { ...entry, rejected: false } : entry);
 await page.click('#review-refresh'); await idle();
 rejectMode = 'changed';
 await act(RG, 'reject').click(); await box().waitFor(); await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.match(await page.locator('#review-message').textContent(), /清單已被其他人變更/);
 assert.equal((await cell(RG, 'state')).trim(), '待上架');
 assert.equal(await page.locator(`#review-table tr[data-game-id="${RG}"] [data-field="rejected"]`).count(), 0);
 rejectMode = 'success';
 checks.push(stage);
 stage = '刪除（已上架也可以）：強提醒三短語、取消不動、確認後行消失';
 await act(LG, 'delete').click(); await box().waitFor();
 const deleting = await box().textContent(); for (const phrase of ['刪除整個遊戲', '不是刪除單個版本', '不可恢復']) assert.ok(deleting.includes(phrase), deleting);
 await box().locator('.el-message-box__btns .el-button').first().click(); await page.waitForTimeout(200);
 assert.equal(await page.locator(`#review-table tr[data-game-id="${LG}"]`).count(), 1); assert.equal(deletes.length, 0);
 await page.screenshot({ path: join(out, 'delete-warning.png') });
 await act(LG, 'delete').click(); await box().waitFor(); await box().locator('.el-message-box__btns .el-button--primary').click(); await idle();
 assert.equal(deletes.length, 1);
 assert.deepEqual(deletes[0].body, { gameId: LG, expectedRowRevision: '4', confirmationName: '已上架遊戲' });
 assert.equal(await page.locator(`#review-table tr[data-game-id="${LG}"]`).count(), 0);
 assert.match(await page.locator('#review-result').textContent(), /已徹底刪除（不可恢復）/);
 checks.push(stage);
 stage = '創作者身份看不到審核頁';
 sessionRole = 'author';
 await page.reload(); await page.waitForSelector('#menu button[data-view="publish-editor"]');
 assert.equal(await page.locator('#menu button[data-view="management-editor"]').count(), 0);
 assert.equal(await page.locator('#review-editor').isVisible(), false);
 checks.push(stage);
 assert.equal(await page.evaluate(() => window.__ownedIDB), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(failed, []);
 assert.equal(consoleErrors.length, expectedErrors.length); for (const text of consoleErrors) assert.match(text, /Failed to load resource: the server responded with a status of (409|503)/);
 await page.screenshot({ path: join(out, 'review-final.png') });
 const result = { checks, posts: posts.length, deletes: deletes.length, expectedHTTPFailures: expectedErrors.length, unexpectedErrors: errors, outside, failed, browser: browser.version(), sources: Object.fromEntries(Object.entries(files).map(([url, name]) => ['server/public/' + name, sha(payloads.get(url))])), screenshotSHA: sha(readFileSync(join(out, 'review-final.png'))), stateScreenshots: Object.fromEntries(['review-list.png', 'publish-history.png', 'rejected.png', 'delete-warning.png'].map(name => [name, sha(readFileSync(join(out, name)))])), staticRoutes: payloads.size, scope: 'actual common static routing/headers/HTML/client in fresh browser; API responses controlled, no authority/compiler/R2/player-visibility claim' };
 writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' }); process.stdout.write(JSON.stringify({ ...result, sources: 'in owned artifact', artifact: out }) + '\n');
} catch (error) { writeFileSync(join(out, 'failure.json'), JSON.stringify({ stage, error: String(error), stack: error.stack, errors, consoleErrors, outside, failed, posts: posts.length, deletes: deletes.length, calls }, null, 2), { flag: 'wx' }); throw error; }
finally { await browser?.close(); }
