// 工作台量产：管理員在「遊戲管理」用「複製遊戲」真實產出整套副本（地圖＋章節＋武將），
// 再走「上架 → 管理員同意 → 刪除上一份工作台產物」。
// 真實 editor gateway／auth／SQLite／私有檔案桶＋實際共享靜態檔；瀏覽器請求由 in-process
// bridge 轉發，不是 API 樁。玩家端播放與 R2 發行由 verify_publication_chain_browser 覆蓋，
// 本 lane 只證明「工作台量產 → 上架 → 同意 → 刪舊產物」這一段。
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
register('../vps/text-loader.mjs', import.meta.url);
const { default: gateway } = await import('../server/editorapp.js');
const { createPublicationBrowserAuthority } = await import('./fixtures/publication-browser-authority.mjs');
const { createRuntimeStager } = await import('../vps/runtime-stage.mjs');
const { makePublishRuntimeStage } = await import('./fixtures/publish-runtime-stage.mjs');
const { createDistributionPublisher } = await import('../vps/distribution-publisher.mjs');
const { rootVisibleAt } = await import('../reader/firstonline.js');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
let modulePath;
try { modulePath = createRequire(import.meta.url).resolve('miniflare'); }
catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
const { Miniflare } = await import(pathToFileURL(modulePath).href);

const origin = 'https://owned-workbench.invalid', playerOrigin = 'https://reader.test';
const own = mkdtempSync(join(tmpdir(), 'dragon-workbench-produce-'));
mkdirSync('.dragon-analysis/release-readiness', { recursive: true });
const artifact = mkdtempSync('.dragon-analysis/release-readiness/workbench-produce-');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(k)));
const files = ['index.html', 'style.css', 'shell-ui.txt', 'shell-ui.css', 'client.txt', 'draft.txt', 'stage.txt', 'library.txt', 'catalog.txt', 'management.txt', 'publish.txt', 'review.txt', 'stronghold.txt', 'general.txt', 'mapview.txt', 'stageassets.txt'];
const payloads = new Map(Object.entries(Object.fromEntries(files.map(name => ['/' + name.replace(/\.txt$/, '.js'), name]))).map(([url, file]) => [url, readFileSync('server/public/' + file)]));
const sources = Object.fromEntries(files.map(name => ['server/public/' + name, sha(readFileSync('server/public/' + name))]));
const checks = [], calls = [], errors = [], consoleErrors = [], outside = [], failed = [], expectedErrors = [];
let browser, mf, authority, bucket, stage = 'bootstrap', produced = null, producedName = '量產驗證';

try {
  mf = new Miniflare({ modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/site.js'), compatibilityDate: '2024-01-01', host: '127.0.0.1', port: 0, r2Buckets: ['PUBLISH_BUCKET'], bindings: { PLAYER_ORIGIN: playerOrigin, PLAYER_ADMISSION_ACTIVE_KEY: 'owned', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned: '11'.repeat(32) }) } });
  await mf.ready; bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  const raised = [];
  let directoryPointer = null;
  const r2 = {
    async get(key, { maxBytes }) {
      assert.match(key, /^(artifacts|kao|projections|control)\//);
      const row = await bucket.get(key); if (!row) return null;
      assert.ok(row.size <= maxBytes);
      return { bytes: new Uint8Array(await row.arrayBuffer()), headers: { 'content-type': row.httpMetadata.contentType, etag: row.httpEtag, 'last-modified': row.uploaded.toUTCString() } };
    },
    async putImmutable(key, bytes, contentType) {
      assert.match(key, /^(artifacts\/|projections\/|control\/(receipts|roots)\/)/); raised.push(key);
      return await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType } }) !== null;
    },
    async putControl(key, bytes, etag) {
      // 游戏级目录指针（A 批）是独立 key，与根共用条件写端口。
      if (key === 'control/directory.json') { directoryPointer = JSON.parse(await new Response(bytes).text()); return await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } }) !== null; }
      assert.equal(key, 'control/current.json');
      return await bucket.put(key, bytes, { onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag.slice(1, -1) }, httpMetadata: { contentType: 'application/json' } }) !== null;
    },
  };
  // 上架會把執行期包裝到 R2 並核對靜態發布清單；用手寫的真實共享套件，不用固定回應。
  const packaged = makePublishRuntimeStage({ root: join(own, 'static-package'), includePlayerModules: false });
  for (const [key, row] of packaged.objects) {
    const path = key.slice(packaged.prefix.length);
    await bucket.put(path, row.bytes, { httpMetadata: { contentType: 'image/png' } });
  }
  const verifyStaticResources = packaged.verifyStaticResources;
  const runtimeStager = createRuntimeStager({ r2, verifyStaticResources });
  authority = await createPublicationBrowserAuthority({ root: own, origin, runtimeStager });
  const { storage, gameId: previousProductId } = authority, sql = storage.sql;
  const previousName = sql.exec('SELECT draft_name FROM content_games WHERE game_id=?', previousProductId).toArray()[0].draft_name;

  browser = await chromium.launch({ headless: true, env });
  const browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, serviceWorkers: 'block' });
  await context.addInitScript(() => { window.__ownedIDB = 0; indexedDB.open = () => { window.__ownedIDB++; throw new Error('IDB forbidden in workbench test'); }; });
  page_on(context);
  const bridge = async route => {
    const request = route.request(); let url; try { url = new URL(request.url()); } catch { outside.push(request.url()); return route.abort(); }
    if (url.origin !== origin) { outside.push(url.href); return route.abort(); }
    calls.push({ path: url.pathname, method: request.method() });
    if (payloads.has(url.pathname)) {
      const response = await gateway.fetch(new Request(request.url(), { method: request.method() }), {});
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    const headers = await request.allHeaders(), init = { method: request.method(), headers };
    if (request.method() !== 'GET') init.body = request.postDataBuffer();
    const response = await authority.fetch(new Request(request.url(), init));
    const body = Buffer.from(await response.arrayBuffer());
    calls.at(-1).status = response.status;
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  };
  await context.route('**/*', bridge);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const login = async (account, password) => {
    await page.goto(origin); await page.waitForSelector('#login');
    await page.fill('#login [name="account"]', account); await page.fill('#login [name="password"]', password);
    await page.locator('#login').getByRole('button', { name: '登入', exact: true }).click();
    await page.waitForSelector('#menu button[data-view]');
  };
  const box = () => page.locator('.el-message-box');
  const confirmBox = async label => { await box().waitFor(); await box().locator('.el-message-box__btns button').filter({ hasText: label }).first().click(); };

  stage = '作者看不到「複製遊戲」：整套複製是管理員能力';
  await login(authority.account, authority.password);
  assert.equal(await page.locator('#menu button[data-view="copy-game-editor"]').count(), 0, '作者不得有整套複製入口');
  checks.push(stage);

  stage = '管理員「複製遊戲」真實產出：20 章，不使用預先寫入的 SQL bootstrap';
  await page.context().clearCookies();
  await login('tianyi', authority.password);
  await page.click('#menu button[data-view="copy-game-editor"]'); await page.waitForSelector('#copy-game-editor');
  await page.fill('#full-copy-name', producedName);
  await page.fill('#full-copy-introduction', '工作台量產驗證');
  const copyPosts = calls.length;
  await page.click('#full-copy-create');
  await page.waitForFunction(() => /已建立|複製遊戲（續）|未確認|不能/.test(document.querySelector('#full-copy-message')?.textContent ?? ''), null, { timeout: 300000 });
  const copyMessage = (await page.locator('#full-copy-message').textContent()).trim();
  assert.match(copyMessage, /完整副本已建立/, copyMessage);
  // 帳本：只發一次 /api/admin/copies（202），之後只有同鍵查詢。
  const copyCall = calls.slice(copyPosts).filter(call => call.path === '/api/admin/copies');
  assert.equal(copyCall.length, 1, '一次建立只有一個預留 POST');
  assert.equal(copyCall[0].status, 202);
  produced = sql.exec('SELECT game_id, draft_name, row_revision FROM content_games WHERE draft_name=? ORDER BY created_at DESC LIMIT 1', producedName).toArray()[0];
  assert.ok(produced?.game_id, '真實 DB 必須出現新遊戲');
  assert.notEqual(produced.game_id, previousProductId, '必須是新的 gameId，不是就地改寫');
  await page.click('#menu button[data-view="draft-editor"]'); await page.waitForSelector('#draft-editor');
  await page.click('#draft-games-refresh');
  await page.waitForSelector(`#draft-list-times tr[data-game-id="${produced.game_id}"]`);
  await page.selectOption('#draft-game', produced.game_id);
  await page.fill('#draft-revision', '1');
  await page.click('#draft-load');
  await page.waitForFunction(() => document.querySelectorAll('#draft-chapters [data-chapter-id]').length > 0, null, { timeout: 180000 });
  const chapterCount = await page.locator('#draft-chapters [data-chapter-id]').count();
  assert.equal(chapterCount, 20, '整套複製必須是 20 章');
  const chapterIds = await page.locator('#draft-chapters [data-chapter-id]').evaluateAll(nodes => nodes.map(node => node.dataset.chapterId));
  const suffix = id => id.slice(id.indexOf('#'));
  assert.deepEqual(chapterIds.map(suffix), authority.chapters.map(suffix), '複製章的章序與來源章一致（章節 id 以自身 gameId 命名空間）');
  // 資料等價（與內置遊戲同一份來源）由 verify_copy_publish_parity 斷言；本 lane 只證明
  // 工作台 UI 產出 20 章且章序沿用來源。
  checks.push(stage + '（' + chapterCount + ' 章，章序與來源一致）');

  stage = '上架：版本號 +1、狀態待上架';
  await page.click('#menu button[data-view="publish-editor"]'); await page.waitForSelector('#publish-editor');
  await page.click('#publish-refresh');
  await page.waitForFunction(() => !document.querySelector('#publish-refresh').disabled, null, { timeout: 120000 });
  const publishRow = page.locator(`#publish-table tr[data-game-id="${produced.game_id}"]`);
  await publishRow.waitFor();
  assert.equal((await publishRow.locator('[data-field="state"]').textContent()).trim(), '草稿');
  await publishRow.locator('[data-action="publish"]').click();
  await confirmBox('上架');
  await page.waitForFunction(() => (document.querySelector('#publish-message')?.textContent ?? '').trim().length > 0, null, { timeout: 300000 });
  const publishMessage = (await page.locator('#publish-message').textContent()).trim();
  assert.doesNotMatch(publishMessage, /本次未提交|校驗未通過|未通過/, '上架被服務端拒絕：' + publishMessage);
  // 上架提交後面板會自行重讀清單；以有界輪詢讀結果，避免與重讀競爭。
  let stateText = '';
  for (let attempt = 0; attempt < 60 && !stateText.includes('待上架'); attempt++) {
    await page.click('#publish-refresh').catch(() => {});
    await page.waitForTimeout(500);
    stateText = (await page.locator(`#publish-table tr[data-game-id="${produced.game_id}"] [data-field="state"]`).textContent().catch(() => '')).trim();
  }
  assert.match(stateText, /待上架/, '上架後狀態必須是待上架，訊息：' + publishMessage + '／目前：' + stateText);
  assert.equal((await page.locator(`#publish-table tr[data-game-id="${produced.game_id}"] [data-field="version"]`).textContent()).trim(), '1.0');
  checks.push(stage);

  stage = '管理員同意：待上架 → 已上架';
  await page.click('#menu button[data-view="management-editor"]'); await page.waitForSelector('#review-editor');
  await page.click('#review-refresh');
  await page.waitForFunction(() => !document.querySelector('#review-refresh').disabled, null, { timeout: 120000 });
  const reviewRow = page.locator(`#review-table tr[data-game-id="${produced.game_id}"]`);
  await reviewRow.waitFor();
  await reviewRow.locator('[data-action="approve"]').click();
  await confirmBox('同意上架');
  await page.waitForFunction(() => /已同意上架版本/.test(document.querySelector('#review-result')?.textContent ?? ''), null, { timeout: 180000 });
  await page.click('#review-refresh');
  await page.waitForFunction(() => !document.querySelector('#review-refresh').disabled, null, { timeout: 120000 });
  assert.equal((await page.locator(`#review-table tr[data-game-id="${produced.game_id}"] [data-field="state"]`).textContent()).trim(), '已上架');
  checks.push(stage);

  // 玩家端：上架不等於公開，必須由真實 distribution publisher 推進到 VISIBLE_CONFIRMED，
  // 再由真實 reader（Miniflare workerd + 真 R2）出目錄、准入票與章節位元組。
  stage = '玩家端：reader 目錄可見量產遊戲，准入與章節位元組都能取到';
  const publisher = createDistributionPublisher({ storage, r2, verifyStaticResources });
  // 上架與同意各自排入一筆分發修訂；要排到帳本為空，投影才是「已同意且已上架」的快照。
  const drained = [];
  // 診断：一次 20 章上架的分發排空耗時。發布協議改版（同步發布 vs 新隊列）的決策取決於
  // 這段是否穩定低於代理層約 100 秒的上限，所以每次跑這條 lane 都把它量下來。
  const drainStartedAt = performance.now();
  for (let i = 0; i < 20; i++) { const step = await publisher.drainOne(); if (step.state === 'IDLE') break; drained.push(step.state); }
  const drainMs = Math.round(performance.now() - drainStartedAt);
  assert.ok(drained.includes('VISIBLE_CONFIRMED'), '分發必須推進到可見確認：' + JSON.stringify(drained));
  // A 批：同一代次還寫了一份遊戲級目錄指標，內容與舊投影指向同一份章節。
  assert.ok(directoryPointer, '上架必須寫出遊戲級目錄指標');
  const pointerGames = directoryPointer.games.filter(entry => entry.listed);
  assert.deepEqual(pointerGames.map(entry => entry.gameId), [produced.game_id]);
  assert.equal(pointerGames[0].directory.chapters.length, 20);
  assert.equal(pointerGames[0].release.ordinal, '1.0');
  const readerGet = async (path, headers = {}) => {
    const response = await mf.dispatchFetch(playerOrigin + path, { headers });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, bytes, text: new TextDecoder().decode(bytes) };
  };
  const registryResult = await readerGet('/play-api/v1/registry');
  assert.equal(registryResult.status, 200, registryResult.text);
  const directory = JSON.parse(registryResult.text).directory;
  assert.equal(directory.length, 1, '目錄只應有這份量產遊戲：' + JSON.stringify(directory));
  const entry = directory[0];
  assert.equal(entry.gameId, produced.game_id); assert.equal(entry.ordinal, '1.0'); assert.equal(entry.name, producedName);
  assert.equal(entry.chapters.length, 20, '目錄章節數必須與量產副本一致');
  assert.ok(rootVisibleAt((await bucket.get('control/current.json')).uploaded), 'reader 根必須有可核對的上線時間');
  const firstChapter = entry.chapters[0];
  const admission = await readerGet('/play-api/v1/admissions?' + new URLSearchParams({ game: entry.gameId, ordinal: '1.0', chapter: firstChapter }));
  assert.equal(admission.status, 200, admission.text);
  const { ticket } = JSON.parse(admission.text); assert.equal(typeof ticket, 'string');
  const chapterFile = await readerGet('/play-api/v1/file?' + new URLSearchParams({ role: 'chapter:' + firstChapter }), { Authorization: 'Bearer ' + ticket });
  assert.equal(chapterFile.status, 200);
  assert.equal(sha(chapterFile.bytes), sha(sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', entry.gameId, firstChapter).toArray()[0].state_json), '玩家取到的章節位元組必須等於已上架章節');
  checks.push(stage);

  stage = '刪除上一份工作台產物：新遊戲已上架，舊產物走同一 fence';
  const previousRow = page.locator(`#review-table tr[data-game-id="${previousProductId}"]`);
  await previousRow.waitFor();
  assert.equal((await previousRow.locator('[data-field="name"]').textContent()).trim(), previousName);
  await previousRow.locator('[data-action="delete"]').click();
  await confirmBox('刪除');
  await page.waitForFunction(() => /已徹底刪除（不可恢復）/.test(document.querySelector('#review-result')?.textContent ?? ''), null, { timeout: 180000 });
  // 用戶決定（2026-11）：刪除＝徹底清除。柵欄成立後立刻物理刪除，因此這裡看到的是
  // 「柵欄與資料庫列都已經不在」，而不是留著一行 fence 當紀念。
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_deletion_fences WHERE game_id=?', previousProductId).toArray()[0].n, 0, '物理刪除後不得留下 fence 行');
  const previousLeft = ['content_games', 'content_snapshots', 'copy_objects', 'copy_origins', 'content_names'].filter(table => sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE game_id=?`, previousProductId).toArray()[0].n !== 0);
  assert.deepEqual(previousLeft, [], '舊產物必須徹底清除：' + previousLeft.join(','));
  const survivor = sql.exec('SELECT game_id, listed FROM content_games WHERE game_id=?', produced.game_id).toArray()[0];
  assert.equal(survivor?.listed, 1, '刪舊產物不得影響新產品的上架狀態');
  const afterDelete = JSON.parse((await readerGet('/play-api/v1/registry')).text).directory;
  assert.equal(afterDelete.length, 1); assert.equal(afterDelete[0].gameId, produced.game_id, '刪舊產物後玩家端仍只看到量產遊戲');
  checks.push(stage);

  stage = '收銀：零意外請求與零 console 錯誤';
  assert.equal(await page.evaluate(() => window.__ownedIDB), 0);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(failed, []);
  assert.deepEqual(expectedErrors, [], '本 lane 沒有預期的 4xx 業務拒絕');
  // 每個全新未登入載入都會先打一次 /api/session 得到 401（登入頁的存在前提），
  // 本 lane 有兩次登入（作者、管理員）。只允許這兩個 401，其它狀態一律失敗。
  const unauthorized = consoleErrors.filter(text => text.includes('401'));
  assert.equal(consoleErrors.length, unauthorized.length, '只允许未登入导引的 401：' + JSON.stringify(consoleErrors));
  assert.equal(unauthorized.length, 2, '两次全新登入各一次 401：' + JSON.stringify(consoleErrors));
  await page.screenshot({ path: join(artifact, 'produced.png') });
  checks.push(stage);

  const result = { checks, producedGameId: produced.game_id, producedName, previousProductId, previousName, chapters: chapterCount, drainStates: drained, drainMs, posts: calls.filter(call => call.method === 'POST').map(call => ({ path: call.path, status: call.status })), r2Objects: raised.length, browser: browserVersion, sources, screenshotSHA: sha(readFileSync(join(artifact, 'produced.png'))), scope: 'Actual editor gateway/auth/SQLite/private object bucket and shared static modules in a fresh Chromium profile; browser requests bridged in-process. Copy→publish→approve→delete-of-previous-product only. Includes the real distribution publisher drain and the real reader (owned workerd R2) serving the produced-game directory, admission ticket and chapter bytes to the player API; not a player browser boot (see verify_publication_chain_browser --public-player), not cloud/TLS, not blank author creation.' };
  writeFileSync(join(artifact, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ ...result, sources: 'in owned artifact', artifact }) + '\n');
} catch (error) {
  writeFileSync(join(artifact, 'failure.json'), JSON.stringify({ stage, error: String(error), stack: error.stack, errors, consoleErrors, outside, failed, calls: calls.slice(-25) }, null, 2), { flag: 'wx' });
  throw error;
} finally { await browser?.close(); await mf?.dispose(); }

function page_on(context) {
  context.on('page', page => {
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => { try { failed.push(new URL(request.url()).pathname); } catch { failed.push('unparsable-url'); } });
    page.on('dialog', dialog => dialog.accept());
  });
}
