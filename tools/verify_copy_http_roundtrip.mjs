// T1–T8 copy 全链路 HTTP 回放：真 EditorService + 隔离落盘 SQLite。
// --browser additionally uses a fresh Playwright context and actual HTTPS (no API mocks).
// 新建→ensure(幂等)→读→模块存→检验→填说明提交→复投拒收→越权/参数拒收。
// 用法：node tools/verify_copy_http_roundtrip.mjs [--browser]（cwd=web-port）
// Browser mode requires explicit installed PLAYWRIGHT_MODULE/PLAYWRIGHT_CHROMIUM_EXECUTABLE.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compileGameSource, TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { ASSET_TYPES } from '../web/src/player/runtimecontract.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
import { request as httpsRequest } from 'node:https';

const port = Number(process.env.EDITOR_TEST_PORT ?? 18787);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const own = mkdtempSync(join(tmpdir(), 'dragon-copy-http-'));
const origin = 'https://127.0.0.1:' + port;
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const password = randomBytes(24).toString('hex') + 'Aa1!';
const secret = randomBytes(32).toString('hex');

const json = bytes => { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid JSON: ' + String(bytes).slice(0, 200), { cause }); } };
const config = json(readFileSync('server/wrangler.jsonc'));
config.main = resolve('server/worker.js');
config.dev.port = port;
config.vars.EDITOR_ORIGIN = origin;
writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config));
writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });

async function call(path, body, session, extra = {}) {
  const headers = { Origin: origin, ...extra };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const response = await new Promise((done, reject) => {
    const req = httpsRequest(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => {
      const parts = [];
      res.on('data', b => parts.push(b));
      res.on('error', reject);
      res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], data: json(Buffer.concat(parts).toString()) }));
    });
    req.setTimeout(240000, () => req.destroy(new Error('timeout: ' + path)));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return response;
}

const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');
const { createEditorHTTPS } = await import('./editor_local_https.mjs');
const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');

const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'private-objects') });
const source = await stageInstalledEditorSource({
  get: key => bucket.get(key),
  put: (key, bytes, _options) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }),
});
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
const close = async () => { try { await transport.close(); } finally { storage.close(); } };

test('copy 全链路：建游戏→ensure幂等→模块存→检验→提交→状态机', async () => {
  try {
  const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
  assert.equal(login.status, 200);
  const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
  assert.equal(changed.status, 200);
  const admin = { cookie: changed.cookie, csrf: changed.data.csrf };

  assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200);
  const installed = await call('/api/admin/source', undefined, admin);
  assert.equal(installed.status, 200);
  // Missing template cannot create either kind or fall back to the pinned map.
  for (const full of [false, true]) {
    const key = randomUUID();
    const reserved = await call(full ? '/api/admin/copies' : '/api/games', {
      ...(full ? { registryId: installed.data.definition.registryId } : {}), name: full ? '缺模板甲' : '缺模板乙', introduction: '隔離拒絕驗證',
    }, admin, { 'Idempotency-Key': key });
    assert.equal(reserved.status, 202, JSON.stringify(reserved.data));
    const refused = await call((full ? '/api/admin/copies/' : '/api/games/create/') + key + '/run', {}, admin, { 'If-Match': '"1"' });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error, 'BASE_MAP_NOT_INITIALIZED');
  }
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM content_games').toArray()[0].n, 0);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM game_copies').toArray()[0].n, 0);
  const established = await call('/api/admin/base-map/initialize', {}, admin);
  assert.equal(established.status, 200, JSON.stringify(established.data).slice(0, 300));
  const templateT1 = established.data.snapshot;
  const mapData = game => Object.fromEntries(['map', 'cities', 'componentDefinitions', 'compatibilityAssets', 'selectionGroups', 'mapEditorAssets', 'mapOrigin'].map(key => [key, game[key]]));
  const copyKey = randomUUID();
  const copy = await call('/api/admin/copies', { registryId: installed.data.definition.registryId, name: '链路', introduction: 'HTTP回放' }, admin, { 'Idempotency-Key': copyKey });
  assert.equal(copy.status, 202);
  const run = await call('/api/admin/copies/' + copyKey + '/run', {}, admin, { 'If-Match': '"1"' });
  assert.equal(run.status, 200);
  const gameId = run.data.gameId;
  assert.match(gameId, /^[a-f0-9-]{36}$/);

  // 完整复制成功即有 copy 主表，不依赖首次页面 ensure。
  const initialized = await call(`/api/games/${gameId}/copy`, undefined, admin);
  assert.equal(initialized.status, 200);
  assert.equal(initialized.data.data.mapOrigin.digest, templateT1.digest);
  assert.equal(initialized.data.data.mapOrigin.version, 1);
  assert.deepEqual(initialized.data.data.map, templateT1.template.content.map);
  assert.equal(Object.keys(initialized.data.data.generals).length, 466);
  assert.equal(Object.keys(initialized.data.data.cities).length, 192);
  assert.equal(Object.values(initialized.data.data.chapters).flatMap(ch => ch.state.generals).filter(g => g.generalId).length, 2540);

  // ensure 幂等：两次同摘要。
  const e1 = await call(`/api/games/${gameId}/copy/ensure`, {}, admin);
  assert.equal(e1.status, 200, JSON.stringify(e1.data).slice(0, 300));
  const e2 = await call(`/api/games/${gameId}/copy/ensure`, {}, admin);
  assert.equal(e2.status, 200);
  assert.equal(e2.data.copyDigest, e1.data.copyDigest);
  assert.match(e1.data.copyDigest, /^[a-f0-9]{64}$/);

  const got = await call(`/api/games/${gameId}/copy`, undefined, admin);
  assert.equal(got.status, 200);
  assert.equal(got.data.copyDigest, e1.data.copyDigest);

  const generalId = Object.keys(got.data.data.generals)[0];
  const original = got.data.data.generals[generalId];
  assert.equal((await call(`/api/games/${gameId}/copy`, { module: 'generals', patch: { upsert: { [generalId]: { name: '測試改名' } } } }, admin)).status, 200);
  const imported = await call(`/api/games/${gameId}/copy/import-generals`, {}, admin);
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  const reread = await call(`/api/games/${gameId}/copy`, undefined, admin);
  assert.deepEqual(reread.data.data.generals[generalId], original);
  assert.equal((await call(`/api/games/${gameId}/copy/import-generals`, { generals: {} }, admin)).status, 422);

  // 模块存：只改 metadata，摘要必变。
  const w = await call(`/api/games/${gameId}/copy`, { module: 'metadata', patch: { name: '链路改名', introduction: 'HTTP回放改后' } }, admin);
  assert.equal(w.status, 200, JSON.stringify(w.data).slice(0, 300));
  assert.notEqual(w.data.copyDigest, e1.data.copyDigest);

  // 未验禁用，人话阻断。
  const s0 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s0.status, 200);
  assert.equal(s0.data.publishEnabled, false);
  assert.ok(s0.data.blockedReason?.includes('重新检验'));

  // A real map write invalidates the existing pass ticket before publication.
  const oldPass = await call(`/api/games/${gameId}/copy/validate`, {}, admin);
  assert.equal(oldPass.data.state, 'passed');
  const content = templateT1.template.content;
  const piece = content.map.decorations.find(item => {
    const def = content.componentDefinitions[item.definitionRef];
    return def.category === 'mountain-pattern' && def.footprint.length > 1 && def.footprint.length <= 8;
  });
  const cells = content.componentDefinitions[piece.definitionRef].footprint.map(([dx, dy]) => (piece.y + dy) * 384 + piece.x + dx);
  const mapEdits = [{ op: 'decoration-remove', memberIds: [piece.id] }, { op: 'base-fill', cells, tile: 16, geography: 0 }];
  const mapSaved = await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: mapEdits } }, admin);
  assert.equal(mapSaved.status, 200, JSON.stringify(mapSaved.data));
  assert.equal((await call(`/api/games/${gameId}/copy/submission`, undefined, admin)).data.publishEnabled, false);
  assert.equal((await call(`/api/games/${gameId}/copy/submission`, { ticket: oldPass.data.ticket, description: '失效票' }, admin)).status, 409);
  const publishedGame = (await call(`/api/games/${gameId}/copy`, undefined, admin)).data.data;
  const expected = compileGameSource(publishedGame, sha);
  const beforeMap = compileGameSource(initialized.data.data, sha);
  assert.notEqual(sha(expected.terrainBytes), sha(beforeMap.terrainBytes));
  cells.forEach(cell => assert.equal(expected.terrainBytes[cell], 16));
  assert.deepEqual(expected.roadGraph, beforeMap.roadGraph);

  // 整包检验：编辑后的当前副本须通过。
  const v = await call(`/api/games/${gameId}/copy/validate`, {}, admin);
  assert.equal(v.status, 200, JSON.stringify(v.data).slice(0, 500));
  assert.equal(v.data.state, 'passed');
  assert.ok(typeof v.data.ticket === 'string' && v.data.ticket.length >= 32);

  const s1 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s1.status, 200);
  assert.equal(s1.data.publishEnabled, true);
  assert.equal(s1.data.blockedReason, null);
  assert.equal(s1.data.nextVersion, '1.0');

  // 提交：说明必填，票一次性。
  const sub = await call(`/api/games/${gameId}/copy/submission`, { ticket: v.data.ticket, description: '首版说明\n第二行' }, admin);
  assert.equal(sub.status, 200, JSON.stringify(sub.data).slice(0, 300));
  assert.equal(sub.data.state, 'submitted');

  const s2 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s2.data.publishEnabled, false);
  assert.ok(s2.data.blockedReason?.includes('待审核'));

  const replay = await call(`/api/games/${gameId}/copy/submission`, { ticket: v.data.ticket, description: '复投' }, admin);
  assert.equal(replay.status, 409);
  assert.equal(replay.data.error, 'VALIDATION_STALE');

  // 越权与参数门。
  const anon = await call(`/api/games/${gameId}/copy`, undefined, undefined);
  assert.equal(anon.status, 401);
  const missing = await call('/api/games/00000000-0000-4000-8000-000000000000/copy', undefined, admin);
  assert.equal(missing.status, 404);
  const badModule = await call(`/api/games/${gameId}/copy`, { module: 'nope', patch: {} }, admin);
  assert.equal(badModule.status, 422);
  assert.equal(badModule.data.error, 'COPY_MODULE');
  const badTicket = await call(`/api/games/${gameId}/copy/submission`, { ticket: 'x', description: '说明' }, admin);
  assert.equal(badTicket.status, 422);

  // 同意：走真实 prepare（compile＋季节图＋画像＋manifest），此前该路径从未被覆盖
  // （approve-slot 单测用注入桩代替了包安装），copy 引用无 rootKey 曾在此 422。
  const ok = await call(`/api/games/${gameId}/copy/approve`, {}, admin);
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 500));
  assert.equal(ok.data.state, 'approved');
  assert.equal(ok.data.ordinal, '1.0');
  const s3 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s3.status, 200);
  assert.equal(s3.data.slot.state, 'approved');
  assert.equal(s3.data.version, '1.0');
  assert.equal(s3.data.nextVersion, '1.1');
  const managed = await call('/api/admin/copy/submissions', undefined, admin);
  assert.equal(managed.data.queue.find(row => row.gameId === gameId).state, 'approved');
  assert.equal(managed.data.queue.find(row => row.gameId === gameId).listed, true);
  assert.equal((await call(`/api/games/${gameId}/copy/approve`, {}, admin)).status, 409);

  // The production pack/environment/world loaders consume the ACTUAL approved
  // SQLite bytes. The session/static transport below is an isolated test port,
  // not proof of public distribution, reader admission, or a browser campaign.
  const packRow = storage.sql.exec('SELECT * FROM published_packs WHERE game_id=?', gameId).toArray()[0];
  const manifest = JSON.parse(packRow.manifest_json), chapterId = manifest.chapters[0];
  const identity = { gameId, releaseId: ok.data.releaseId, ordinal: ok.data.ordinal, revision: packRow.revision,
    sourceDigest: packRow.source_digest, chapterId, chapters: manifest.chapters, manifestDigest: sha(packRow.manifest_json) };
  const declarations = new Map([...manifest.assets, ...manifest.minimapAssets, ...manifest.portraits].map(entry => [entry.assetId, entry]));
  const result = (bytes, contentType) => ({ bytes: new Uint8Array(bytes), contentType, sha256: sha(bytes) });
  const pack = await loadPlayerPack({ compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024,
    session: { identity, state: () => 'active', read: async role => {
      if (role === 'manifest') return result(Buffer.from(packRow.manifest_json), 'application/json');
      if (role === 'chapter:' + chapterId) return result(Buffer.from(storage.sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', gameId, chapterId).toArray()[0].state_json), 'application/json');
      assert.ok(role.startsWith('asset:')); const id = role.slice(6), declaration = declarations.get(id); assert.ok(declaration);
      if (declaration.role === 'game-portrait') return result(readFileSync('web/' + declaration.url), 'image/png');
      const row = storage.sql.exec('SELECT bytes FROM published_pack_assets WHERE game_id=? AND asset_id=?', gameId, id).toArray()[0];
      assert.ok(row); return result(Buffer.from(row.bytes), ASSET_TYPES[id]);
    } }, readStatic: async path => {
      assert.ok([...Object.values(manifest.visualAssets.seasons), ...Object.values(manifest.visualAssets.seasonAtlases)].some(entry => entry.path === path));
      return result(readFileSync('web/' + path), 'image/png');
    } });
  try {
    const environment = createPlayerEnvironment(pack, { playerFaction: pack.chapter.factions[0].idx });
    const terrain = await environment.world.terrain.loadTerrain();
    assert.deepEqual(Buffer.from(terrain), Buffer.from(expected.terrainBytes));
    assert.notEqual(sha(terrain), sha(beforeMap.terrainBytes));
    const roads = await environment.world.roads.loadRoadGraph(); assert.equal(roads.version, 2); assert.equal(roads.nodes.length, 192);
    const prepared = await prepareScenario({ raw: environment.raw, idx: 0, mode: 'fresh', content: environment.content, world: environment.world });
    assert.equal(prepared.scenario.cities.length, 192);
    assert.deepEqual(prepared.metadata.content.publication, { releaseId: ok.data.releaseId, ordinal: '1.0' });
  } finally { pack.close(); }

  // 普通新建也直接拥有据点主表，武将允许为空；来源相同不等于共用可变数据。
  const newKey = randomUUID();
  assert.equal((await call('/api/games', { name: '空白新建', introduction: '隔離初始化驗證' }, admin, { 'Idempotency-Key': newKey })).status, 202);
  const created = await call('/api/games/create/' + newKey + '/run', {}, admin, { 'If-Match': '"1"' });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const newId = created.data.gameId;
  const blank = await call(`/api/games/${newId}/copy`, undefined, admin);
  assert.equal(blank.status, 200);
  assert.deepEqual(blank.data.data.generals, {});
  assert.deepEqual(mapData(blank.data.data), mapData(initialized.data.data), 'both creation kinds instantiate the same T1 map');
  assert.equal(Object.keys(blank.data.data.cities).length, 192);
  const cityId = Object.keys(blank.data.data.cities)[0];
  assert.ok(Number.isInteger(blank.data.data.cities[cityId].max_prod));
  assert.ok(Number.isInteger(blank.data.data.cities[cityId].growth));
  const importedBlank = await call(`/api/games/${newId}/copy/import-generals`, {}, admin);
  assert.equal(importedBlank.status, 200, JSON.stringify(importedBlank.data));
  const blankRead = await call(`/api/games/${newId}/copy`, undefined, admin);
  assert.equal(Object.keys(blankRead.data.data.generals).length, 466);
  assert.deepEqual(blankRead.data.data.cities, blank.data.data.cities);
  assert.deepEqual((await call(`/api/games/${gameId}/copy`, undefined, admin)).data.data.generals, got.data.data.generals);
  // Save actual T2 map edit, then C uses T2 while A/B keep independent T1 copies.
  const changedMap = await call('/api/admin/base-map/save', { edits: mapEdits }, admin);
  assert.equal(changedMap.status, 200, JSON.stringify(changedMap.data).slice(0, 300));
  const templateT2 = changedMap.data.snapshot;
  assert.notEqual(templateT2.digest, templateT1.digest);
  const thirdKey = randomUUID();
  assert.equal((await call('/api/games', { name: '模板T2新建', introduction: '' }, admin, { 'Idempotency-Key': thirdKey })).status, 202);
  const third = await call('/api/games/create/' + thirdKey + '/run', {}, admin, { 'If-Match': '"1"' });
  assert.equal(third.status, 200, JSON.stringify(third.data).slice(0, 300));
  const c = await call(`/api/games/${third.data.gameId}/copy`, undefined, admin);
  assert.equal(c.data.data.mapOrigin.digest, templateT2.digest);
  assert.deepEqual(c.data.data.map, templateT2.template.content.map);
  // Committed retries after T2 return the original receipt, without reseeding.
  assert.deepEqual((await call('/api/admin/copies/' + copyKey + '/run', {}, admin, { 'If-Match': '"1"' })).data, run.data);
  assert.deepEqual((await call('/api/games/create/' + newKey + '/run', {}, admin, { 'If-Match': '"1"' })).data, created.data);
  assert.deepEqual(mapData((await call(`/api/games/${gameId}/copy`, undefined, admin)).data.data), mapData(publishedGame));
  assert.deepEqual(mapData((await call(`/api/games/${newId}/copy`, undefined, admin)).data.data), mapData(blank.data.data));
  const ownEdit = await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: [{ op: 'decoration-reorder', memberIds: [publishedGame.map.decorations[0].id], direction: 1 }] } }, admin);
  assert.equal(ownEdit.status, 200);
  assert.notDeepEqual((await call(`/api/games/${gameId}/copy`, undefined, admin)).data.data.map.decorations, publishedGame.map.decorations);
  assert.deepEqual(mapData((await call(`/api/games/${newId}/copy`, undefined, admin)).data.data), mapData(blank.data.data));
  assert.equal((await call('/api/admin/base-map', undefined, admin)).data.snapshot.digest, templateT2.digest);
  if (process.argv.includes('--browser')) {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });
      const separator = admin.cookie.indexOf('=');
      await context.addCookies([{ name: admin.cookie.slice(0, separator), value: admin.cookie.slice(separator + 1), url: origin, httpOnly: true, secure: true, sameSite: 'Strict' }]);
      const page = await context.newPage(), errors = [], failures = [];
      page.on('dialog', dialog => dialog.accept());
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && !(message.location().url === origin + '/favicon.ico' && /404/.test(message.text()))) errors.push({ text: message.text(), location: message.location().url });
      });
      page.on('requestfailed', request => failures.push(request.url()));
      page.setDefaultTimeout(60000);
      // No routes/mocks: all requests reach the owned HTTPS service and SQLite.
      await page.goto(origin + '/#base-map-editor');
      const panel = page.locator('#base-map-editor');
      await panel.getByText('已重新讀取基礎地圖。', { exact: true }).waitFor().catch(async cause => {
        throw new Error(JSON.stringify({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 2000), errors, failures }), { cause });
      });
      await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
      const gameBefore = storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', gameId).toArray()[0].data_json;
      await panel.locator('.base-map-library > .el-select').click();
      await page.getByRole('option', { name: '水域與小地圖', exact: true }).click();
      await panel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
      await panel.getByRole('button', { name: '保存', exact: true }).click();
      await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
      const templateAfter = (await call('/api/admin/base-map', undefined, admin)).data.snapshot;
      assert.notEqual(templateAfter.digest, templateT2.digest);
      assert.equal(storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', gameId).toArray()[0].data_json, gameBefore);
      await page.locator('.current-game').getByRole('button', { name: '重新整理', exact: true }).click();
      await page.locator('.current-game .el-select').click();
      const ownListing = (await call('/api/games', undefined, admin)).data.games.find(game => game.gameId === gameId);
      await page.getByRole('option', { name: ownListing.metadata.name, exact: true }).click();
      await page.locator('[data-view="mapview-editor"]').click();
      const gamePanel = page.locator('#game-map-editor');
      await gamePanel.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('#game-map-editor').textContent.includes('圖集載入中'));
      await gamePanel.locator('.base-map-library > .el-select').click();
      await page.getByRole('option', { name: '水域與小地圖', exact: true }).click();
      await gamePanel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
      await gamePanel.getByRole('button', { name: '保存', exact: true }).click();
      await gamePanel.getByText('已保存並重新讀取遊戲地圖。', { exact: true }).waitFor();
      assert.notEqual(storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', gameId).toArray()[0].data_json, gameBefore);
      assert.equal((await call('/api/admin/base-map', undefined, admin)).data.snapshot.digest, templateAfter.digest);
      assert.deepEqual(mapData((await call(`/api/games/${newId}/copy`, undefined, admin)).data.data), mapData(blank.data.data));
      const browserCreated = [];
      for (const full of [true, false]) {
        await page.locator(`[data-view="${full ? 'copy-game-editor' : 'copy'}"]`).click();
        await page.locator(full ? '#full-copy-name' : '#copy input[name="name"]').fill(full ? '瀏覽完整' : '瀏覽空白');
        const completed = page.waitForResponse(response => {
          const path = new URL(response.url()).pathname;
          return response.request().method() === 'POST' && (full ? /^\/api\/admin\/copies\/[^/]+\/run$/ : /^\/api\/games\/create\/[^/]+\/run$/).test(path);
        }, { timeout: 240000 });
        await page.locator(full ? '#full-copy-create' : '#copy-create button[type="submit"]').click();
        const response = await completed;
        assert.equal(response.status(), 200, await response.text());
        const createdGame = (await response.json()).gameId;
        const record = await call(`/api/games/${createdGame}/copy`, undefined, admin);
        assert.equal(record.status, 200);
        assert.equal(record.data.data.mapOrigin.digest, templateAfter.digest);
        assert.deepEqual(record.data.data.map, templateAfter.template.content.map);
        assert.equal(Object.keys(record.data.data.generals).length, full ? 466 : 0);
        browserCreated.push(record.data.data);
      }
      assert.deepEqual(mapData(browserCreated[0]), mapData(browserCreated[1]), 'both actual browser creation entries use the same current template');
      assert.equal((await call('/api/admin/base-map', undefined, admin)).data.snapshot.digest, templateAfter.digest);
      await page.locator('[data-view="mapview-editor"]').click();
      await page.setViewportSize({ width: 900, height: 700 });
      await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
      assert.deepEqual(errors, []); assert.deepEqual(failures, []);
      console.log('PASS fresh browser -> actual HTTPS -> SQLite template/game-map save and reread, cross-game isolation, both creation entries using current template, narrow layout; no API mocks.');
    } finally { await browser.close(); }
  }
  } finally { await close(); }
});
