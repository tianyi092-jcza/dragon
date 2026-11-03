// 已退役（2026-11 標註）：本 lane 是手動 rN harness（需 round＋EDITOR_TEST_PORT＋PLAYWRIGHT_MODULE），
// 且全篇斷言舊殼 id：#copy h3（現為 h4「我的遊戲」）、#copy-run/#copy-state、#source-install/#source-refresh、
// #water-*（WaterCreatePanel.vue／WaterGroupsPanel.vue 未掛載）。實跑會先死於 #copy h3，r7 亦已刪除。
// 現行覆蓋：HTTP 層的完整副本＋上架＝tools/verify_copy_publish_parity.mjs；上架／審核／刪除＝
// tools/verify_publication_chain_browser.mjs；工作台殼＝tools/verify_editor_workbench_browser.mjs。
// 保留檔案是為了歷史證據可追溯，不得當現行門，也不得為了變綠就地補 id。
// Owned HTTPS/real authentication/SQLite/FileBucket/fresh Chromium. No success fixtures.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startEditorBackend } from './start_editor_backend.mjs';
const round = process.argv[2]; assert.ok(/^r[1-9][0-9]{0,3}$/.test(round ?? '') && process.argv.length === 3);
const output = '.dragon-analysis/editor-phase/fullcopy-water-browser-' + round; mkdirSync(output);
const own = mkdtempSync(join(tmpdir(), 'dragon-fullcopy-water-ui-'));
const port = Number(process.env.EDITOR_TEST_PORT), origin = 'https://127.0.0.1:' + port;
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const initial = randomBytes(24).toString('hex') + 'Aa1!', password = randomBytes(24).toString('hex') + 'Aa1!';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let config; try { config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8')); } catch (cause) { throw new Error('invalid local configuration', { cause }); }
config.main = resolve('server/worker.js'); config.dev.port = port; config.vars.EDITOR_ORIGIN = origin;
writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config));
writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(randomBytes(32).toString('hex')) + '\n', { flag: 'wx', mode: 0o600 });
const paths = ['server/drafts.js', 'server/copyprofile.js', 'server/editorapp.js', 'server/admincopy.js', 'server/public/draft.txt', 'server/public/client.txt', 'server/public/shell-ui.txt', 'editor-ui/src/WaterGroupsPanel.vue', 'editor-ui/src/MapPanel.vue', 'editor-ui/src/CopyPanel.vue', 'editor-ui/src/copy.js', 'tools/editor_trusted_copy.mjs', 'tools/verify_editor_fullcopy_water_browser.mjs'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
const checks = [], errors = [], outside = [], expected = [], writes = [];
let browser, server, page;
try {
  server = await startEditorBackend(join(own, 'wrangler.jsonc'), { stageSource: true });
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ headless: true, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key))) });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess = (globalThis.__idbAccess ?? 0) + 1; throw new Error('formal storage forbidden'); } }));
  await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push('outside'); return route.abort(); } return route.continue(); });
  page = await context.newPage(); page.setDefaultTimeout(240000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const path = new URL(message.location().url || origin).pathname, text = message.text();
    if (path === '/api/session' && text.includes('401') || path === '/favicon.ico' && text.includes('404') || /^\/api\/games\/[^/]+\/draft\/save$/.test(path) && text.includes('net::ERR_FAILED')) expected.push({ path, text });
    else errors.push(text);
  });
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/draft/save')) writes.push({ key: request.headers()['idempotency-key'], revision: request.headers()['if-match'], body: request.postDataJSON() }); });
  const idle = () => page.waitForFunction(() => !document.querySelector('#logout').disabled);
  const navigate = async view => {
    let failure;
    const acceptLeave = async dialog => { try { assert.match(dialog.message(), /未保存|尚未提交|副本輸入或原操作尚未完成/); await dialog.accept(); } catch (error) { failure = error; await dialog.dismiss(); } };
    page.on('dialog', acceptLeave);
    try { await page.locator('#menu [data-view="' + view + '"]').click(); await idle(); } finally { page.off('dialog', acceptLeave); }
    if (failure) throw failure;
  };
  await page.goto(origin);
  await page.locator('#login [name=account]').fill('tianyi'); await page.locator('#login [name=password]').fill(initial); await page.locator('#login button').click();
  await page.locator('#password').waitFor({ state: 'visible' });
  await page.locator('#password [name=oldPassword]').fill(initial); await page.locator('#password [name=newPassword]').fill(password); await page.locator('#password [name=confirmPassword]').fill(password); await page.locator('#password button').click();
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle(); await navigate('copy');
  assert.equal(await page.locator('#copy h3').textContent(), '完整複製內置遊戲');
  await page.locator('#source-refresh').click(); await idle(); await page.locator('#source-install').click(); await idle();
  await page.locator('#copy-create [name=name]').fill('水域副本');
  const reservation = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/admin/copies');
  await page.locator('#copy-create button').click(); const reserved = await reservation; assert.equal(reserved.status(), 202);
  const { gameId } = await reserved.json(); await idle(); await page.locator('#copy-run').click(); await idle();
  assert.match(await page.locator('#copy-state').textContent(), /已保存修訂 1/);
  await page.locator('#own-games [data-game-id="' + gameId + '"]').getByRole('button', { name: '測試運行', exact: true }).click(); await idle();
  await page.locator('#draft-load').click(); await idle();
  const exact = async revision => { const result = await page.request.get(origin + '/api/games/' + gameId + '/draft?revision=' + revision, { timeout: 240000 }); assert.equal(result.status(), 200); return result.json(); };
  const first = await exact('1'); assert.equal(first.profileRevision, 'fixed-copy-resources-1'); assert.equal(first.chapters.length, 20); assert.equal(first.strongholds.length, 192);
  assert.equal(first.generalDefinitions, null); assert.equal(first.chapterPeople, null); assert.ok(first.waterGroups.length);
  checks.push('real administrator login/password change/source installation/full-copy UI yields exact 20-chapter own revision1 with water summaries and no neutral definition grant');
  await navigate('mapview-editor'); assert.equal(await page.locator('#water-table tbody tr').count(), first.waterGroups.length);
  const toggle = () => page.locator('#water-table tbody tr').first().locator('[data-water-toggle]');
  const blank = () => page.locator('#water-preview-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0));
  const preview = async revision => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/draft/minimap'));
    await page.locator('#water-preview').click(); const reply = await pending; assert.equal(reply.status(), 200); const data = await reply.json(); await idle();
    assert.equal(data.gameId, gameId); assert.equal(data.draftRevision, revision);
    const actual = await page.locator('#water-preview-canvas').evaluate(async canvas => {
      const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, rgb = new Uint8Array(canvas.width * canvas.height * 3);
      let opaque = true;
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb.set(rgba.subarray(i, i + 3), j); if (rgba[i + 3] !== 255) opaque = false; }
      return { opaque, width: canvas.width, height: canvas.height, sha: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgb)), byte => byte.toString(16).padStart(2, '0')).join('') };
    });
    assert.deepEqual(actual, { opaque: true, width: 250, height: 167, sha: data.pixelsSha256 }); return data;
  };
  assert.equal(await blank(), true); const original = await preview('1'); assert.equal(original.sourceDigest, first.sourceDigest);
  page.once('dialog', dialog => dialog.dismiss()); await toggle().click(); await idle(); assert.equal(writes.length, 0);
  const saveURL = origin + '/api/games/' + gameId + '/draft/save'; let committed, fault;
  await page.route(saveURL, async route => { try { const reply = await route.fetch({ timeout: 240000 }); assert.equal(reply.status(), 200); committed = await reply.json(); } catch (error) { fault = error; } finally { await route.abort(); } });
  page.once('dialog', dialog => dialog.accept()); await toggle().click(); await idle(); if (fault) throw fault;
  assert.equal(committed.draftRevision, '2'); assert.equal(writes.length, 1); assert.equal(await toggle().isDisabled(), true); assert.equal(await blank(), true);
  assert.deepEqual(writes[0].body.mapEdits, [{ op: 'water-visibility', groupId: first.waterGroups[0].groupId, showOnMinimap: !first.waterGroups[0].showOnMinimap }]);
  await page.unroute(saveURL);
  const unload = dialog => dialog.accept(); page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#mapview-editor').waitFor({ state: 'visible' }); await idle(); assert.equal(await page.locator('#water-retry').isDisabled(), true);
  await page.locator('#water-query').click(); await idle(); await page.locator('#water-load').click(); await idle();
  const second = await exact('2'); assert.equal(writes.length, 1); assert.equal(await blank(), true);
  const hidden = await preview('2'); assert.equal(hidden.sourceDigest, second.sourceDigest); assert.notEqual(hidden.pixelsSha256, original.pixelsSha256);
  for (const key of ['chapters', 'strongholds', 'map', 'generalDefinitions', 'chapterPeople']) assert.deepEqual(second[key], first[key]);
  checks.push('full-copy cancel makes no write; committed response2 loss clears pixels and reload/query/exact read recovers one original POST; actual Canvas SHA changes while all chapter/entity projections remain identical');
  page.once('dialog', dialog => dialog.accept()); await toggle().click(); await idle(); assert.equal(await blank(), true);
  await page.locator('#water-load').click(); await idle(); const third = await exact('3');
  assert.equal(writes.length, 2); assert.equal(third.sourceDigest, first.sourceDigest); assert.deepEqual(third.waterGroups, first.waterGroups);
  const restored = await preview('3'); assert.equal(restored.pixelsSha256, original.pixelsSha256);
  assert.deepEqual(await exact('1'), first); assert.deepEqual(await exact('2'), second);
  for (const key of ['chapters', 'strongholds', 'map']) assert.deepEqual(third[key], first[key]);
  checks.push('restore3 returns original full-source digest and Canvas RGB, preserves immutable1/2 and all20 chapters/192 cities, with exactly two water writes');
  const rename = () => page.locator('#water-table tbody tr').first().locator('[data-water-rename]');
  page.once('dialog', dialog => dialog.dismiss()); await rename().click(); await idle(); assert.equal(writes.length, 2);
  const renameWith = async accept => {
    let dialogFailure, count = 0;
    const handle = async dialog => { try {
      count++;
      if (count === 1) { assert.equal(dialog.type(), 'prompt'); await dialog.accept('  <img>e\u0301河𠀀  '); }
      else { assert.equal(dialog.type(), 'confirm'); if (accept) await dialog.accept(); else await dialog.dismiss(); }
    } catch (error) { dialogFailure = error; await dialog.dismiss(); } };
    page.on('dialog', handle);
    try { await rename().click(); await idle(); } finally { page.off('dialog', handle); }
    if (dialogFailure) throw dialogFailure; assert.equal(count, 2);
  };
  await renameWith(false); assert.equal(writes.length, 2);
  committed = null; fault = null;
  await page.route(saveURL, async route => { try { const reply = await route.fetch({ timeout: 240000 }); assert.equal(reply.status(), 200); committed = await reply.json(); } catch (error) { fault = error; } finally { await route.abort(); } });
  await renameWith(true); if (fault) throw fault;
  assert.equal(committed.draftRevision, '4'); assert.equal(writes.length, 3);
  assert.deepEqual(writes[2].body.mapEdits, [{ op: 'water-rename', groupId: first.waterGroups[0].groupId, name: '<img>e\u0301河𠀀' }]);
  assert.equal(await rename().isDisabled(), true); assert.equal(await blank(), true);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#mapview-editor').waitFor({ state: 'visible' }); await idle();
  assert.equal(await page.locator('#water-retry').isDisabled(), true);
  await page.locator('#water-query').click(); await idle(); await page.locator('#water-load').click(); await idle();
  const fourth = await exact('4'), expectedGroups = structuredClone(third.waterGroups); expectedGroups[0].name = '<img>e\u0301河𠀀';
  assert.equal(writes.length, 3); assert.deepEqual(fourth.waterGroups, expectedGroups);
  assert.match(await page.locator('#water-table tbody tr').first().textContent(), /<img>e\u0301河𠀀/);
  assert.equal(await page.locator('#water-table img').count(), 0);
  for (const key of ['chapters', 'strongholds', 'map']) assert.deepEqual(fourth[key], third[key]);
  const renamed = await preview('4'); assert.equal(renamed.pixelsSha256, original.pixelsSha256);
  assert.notEqual(fourth.sourceDigest, third.sourceDigest); assert.deepEqual(await exact('3'), third);
  checks.push('native rename prompt/confirm cancellation writes nothing; committed4 response loss recovers by original key after reload, escaped decomposed name only, old3 unchanged and Canvas pixels identical');
  // These two fixed-source groups have explicit water members; the first
  // imported display group is deliberately not assumed mergeable.
  const selected = fourth.waterGroups.slice(1, 3), selectedIds = selected.map(group => group.groupId);
  assert.deepEqual(selectedIds, ['water-S-east-19921', 'water-S-east-21069']);
  const mergeButton = page.locator('#water-merge'); assert.equal(await mergeButton.isDisabled(), true);
  for (const id of selectedIds) await page.locator('[data-water-id="' + id + '"] [data-water-select]').check();
  assert.equal(await mergeButton.isDisabled(), true, 'no default merged visibility');
  await page.locator('#water-merge-visibility').selectOption('no');
  page.once('dialog', dialog => dialog.dismiss()); await mergeButton.click(); await idle(); assert.equal(writes.length, 3);
  assert.equal(await page.locator('[data-water-select]:checked').count(), 2);
  const mergeWith = async accept => {
    let failure, count = 0;
    const handle = async dialog => { try {
      count++;
      if (count === 1) { assert.equal(dialog.type(), 'prompt'); await dialog.accept('合併e\u0301𠀀'); }
      else { assert.equal(dialog.type(), 'confirm'); for (const id of selectedIds) assert.ok(dialog.message().includes(id)); if (accept) await dialog.accept(); else await dialog.dismiss(); }
    } catch (error) { failure = error; await dialog.dismiss(); } };
    page.on('dialog', handle); try { await mergeButton.click(); await idle(); } finally { page.off('dialog', handle); }
    if (failure) throw failure; assert.equal(count, 2);
  };
  await mergeWith(false); assert.equal(writes.length, 3);
  committed = null; fault = null;
  await page.route(saveURL, async route => { try { const reply = await route.fetch({ timeout: 240000 }); assert.equal(reply.status(), 200); committed = await reply.json(); } catch (error) { fault = error; } finally { await route.abort(); } });
  await mergeWith(true); if (fault) throw fault;
  assert.equal(committed.draftRevision, '5'); assert.equal(writes.length, 4); assert.equal(await blank(), true);
  assert.deepEqual(writes[3].body.mapEdits, [{ op: 'water-merge', groupIds: selectedIds, name: '合併e\u0301𠀀', showOnMinimap: false }]);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#mapview-editor').waitFor({ state: 'visible' }); await idle();
  assert.equal(await page.locator('#water-retry').isDisabled(), true);
  await page.locator('#water-query').click(); await idle(); await page.locator('#water-load').click(); await idle();
  const fifth = await exact('5'), oldIds = new Set(fourth.waterGroups.map(group => group.groupId));
  const added = fifth.waterGroups.filter(group => !oldIds.has(group.groupId)); assert.equal(added.length, 1);
  assert.ok(added[0].groupId.startsWith(gameId + '#water-')); assert.equal(added[0].name, '合併e\u0301𠀀'); assert.equal(added[0].showOnMinimap, false);
  assert.equal(added[0].memberCount, selected.reduce((sum, group) => sum + group.memberCount, 0));
  assert.equal(added[0].baseCellCount, selected.reduce((sum, group) => sum + group.baseCellCount, 0));
  assert.equal(fifth.waterGroups.length, fourth.waterGroups.length - 1);
  assert.ok(selectedIds.every(id => !fifth.waterGroups.some(group => group.groupId === id)));
  assert.equal(writes.length, 4); assert.equal(await page.locator('[data-water-select]:checked').count(), 0);
  assert.equal(await page.locator('#water-merge-visibility').inputValue(), ''); assert.equal(await mergeButton.isDisabled(), true);
  for (const key of ['chapters', 'strongholds', 'map']) assert.deepEqual(fifth[key], fourth[key]);
  assert.deepEqual(await exact('4'), fourth); const mergedPreview = await preview('5');
  checks.push('explicit two-group selection and visibility; native cancel makes no write, merge5 lost response/reload/original query yields one server ID and preserves member totals, old4 and all entity projections');
  const splitSourceId = added[0].groupId, membership = fifth.waterGroupMembers.find(row => row.groupId === splitSourceId);
  assert.ok(membership.memberIds.length >= 2); const member = membership.memberIds[0];
  const splitButton = page.locator('#water-split'); assert.equal(await splitButton.isDisabled(), true);
  await page.locator('#water-split-group').selectOption(splitSourceId);
  assert.equal(await splitButton.isDisabled(), true); assert.equal(await page.locator('[data-water-member]').count(), membership.memberIds.length);
  assert.equal(await page.locator('[data-water-cell]').count(), membership.baseCells.length);
  await page.locator('[data-water-member]').first().check(); assert.equal(await splitButton.isDisabled(), false);
  page.once('dialog', dialog => dialog.dismiss()); await splitButton.click(); await idle(); assert.equal(writes.length, 4);
  const splitWith = async accept => {
    let failure, count = 0;
    const handle = async dialog => { try {
      count++;
      if (count === 1) { assert.equal(dialog.type(), 'prompt'); await dialog.accept('拆出e\u0301𠀀'); }
      else { assert.equal(dialog.type(), 'confirm'); assert.ok(dialog.message().includes(splitSourceId)); assert.ok(dialog.message().includes(member)); assert.match(dialog.message(), /繼承原小地圖顯示/); if (accept) await dialog.accept(); else await dialog.dismiss(); }
    } catch (error) { failure = error; await dialog.dismiss(); } };
    page.on('dialog', handle); try { await splitButton.click(); await idle(); } finally { page.off('dialog', handle); }
    if (failure) throw failure; assert.equal(count, 2);
  };
  await splitWith(false); assert.equal(writes.length, 4); assert.equal(await page.locator('[data-water-member]:checked').count(), 1);
  committed = null; fault = null;
  await page.route(saveURL, async route => { try { const reply = await route.fetch({ timeout: 240000 }); assert.equal(reply.status(), 200); committed = await reply.json(); } catch (error) { fault = error; } finally { await route.abort(); } });
  await splitWith(true); if (fault) throw fault;
  assert.equal(committed.draftRevision, '6'); assert.equal(writes.length, 5); assert.equal(await blank(), true);
  assert.deepEqual(writes[4].body.mapEdits, [{ op: 'water-split', sourceGroupId: splitSourceId, memberIds: [member], baseCells: [], name: '拆出e\u0301𠀀' }]);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#mapview-editor').waitFor({ state: 'visible' }); await idle();
  assert.equal(await page.locator('#water-retry').isDisabled(), true);
  await page.locator('#water-query').click(); await idle(); await page.locator('#water-load').click(); await idle();
  const sixth = await exact('6'), beforeSplitIds = new Set(fifth.waterGroups.map(row => row.groupId));
  const splitAdded = sixth.waterGroups.filter(row => !beforeSplitIds.has(row.groupId)); assert.equal(splitAdded.length, 1);
  const splitId = splitAdded[0].groupId; assert.ok(splitId.startsWith(gameId + '#water-')); assert.notEqual(splitId, splitSourceId);
  assert.deepEqual(splitAdded[0], { groupId: splitId, name: '拆出e\u0301𠀀', showOnMinimap: false, memberCount: 1, baseCellCount: 0 });
  assert.deepEqual(sixth.waterGroupMembers.find(row => row.groupId === splitId), { groupId: splitId, memberIds: [member], baseCells: [] });
  assert.deepEqual(sixth.waterGroupMembers.find(row => row.groupId === splitSourceId), { ...membership, memberIds: membership.memberIds.slice(1) });
  assert.deepEqual(sixth.waterGroupMembers.filter(row => row.groupId !== splitId && row.groupId !== splitSourceId), fifth.waterGroupMembers.filter(row => row.groupId !== splitSourceId));
  for (const key of ['chapters','strongholds','map','metadata']) assert.deepEqual(sixth[key], fifth[key]);
  assert.equal(sixth.waterGroups.length, fifth.waterGroups.length + 1); assert.equal(writes.length, 5);
  assert.equal(await page.locator('#water-split-group').inputValue(), ''); assert.equal(await page.locator('[data-water-member]:checked').count(), 0); assert.equal(await splitButton.isDisabled(), true);
  assert.deepEqual(await exact('5'), fifth); const splitPreview = await preview('6'); assert.equal(splitPreview.pixelsSha256, mergedPreview.pixelsSha256);
  checks.push('explicit complete-member split, native prompt/confirm cancellation, committed6 lost response recovered once by original query and exact reread; inherited hidden flag, unchanged old5/entities/pixels and cleared workspace selection');
  const baseSource = sixth.waterGroupMembers.filter(row => row.baseCells.length > 1).sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
  assert.ok(baseSource, 'fixed source must supply an actual multi-base-cell group');
  const baseGroup = sixth.waterGroups.find(row => row.groupId === baseSource.groupId), cell = baseSource.baseCells[0];
  assert.ok(Number.isInteger(cell));
  await page.locator('#water-split-group').selectOption(baseSource.groupId);
  assert.equal(await page.locator('[data-water-cell]').count(), baseSource.baseCells.length);
  assert.equal(await splitButton.isDisabled(), true);
  await page.locator('[data-water-cell]').first().check();
  assert.equal(await page.locator('[data-water-member]:checked').count(), 0);
  assert.equal(await splitButton.isDisabled(), false);
  const splitBaseWith = async accept => {
    let failure, count = 0;
    const handle = async dialog => { try {
      count++;
      if (count === 1) { assert.equal(dialog.type(), 'prompt'); await dialog.accept('基礎格拆分'); }
      else { assert.equal(dialog.type(), 'confirm'); assert.ok(dialog.message().includes(baseSource.groupId)); assert.ok(dialog.message().includes(String(cell))); if (accept) await dialog.accept(); else await dialog.dismiss(); }
    } catch (error) { failure = error; await dialog.dismiss(); } };
    page.on('dialog', handle); try { await splitButton.click(); await idle(); } finally { page.off('dialog', handle); }
    if (failure) throw failure; assert.equal(count, 2);
  };
  await splitBaseWith(false); assert.equal(writes.length, 5); assert.equal(await page.locator('[data-water-cell]:checked').count(), 1);
  const baseResponse = page.waitForResponse(response => response.url() === saveURL && response.request().method() === 'POST');
  await splitBaseWith(true); const baseReply = await baseResponse;
  assert.equal(baseReply.status(), 200); assert.equal((await baseReply.json()).draftRevision, '7');
  assert.equal(writes.length, 6);
  assert.deepEqual(writes[5].body.mapEdits, [{ op: 'water-split', sourceGroupId: baseSource.groupId, memberIds: [], baseCells: [cell], name: '基礎格拆分' }]);
  assert.equal(await blank(), true); await page.locator('#water-load').click(); await idle();
  const seventh = await exact('7'), priorIds = new Set(sixth.waterGroups.map(row => row.groupId));
  const baseAdded = seventh.waterGroups.filter(row => !priorIds.has(row.groupId)); assert.equal(baseAdded.length, 1);
  const baseId = baseAdded[0].groupId; assert.ok(baseId.startsWith(gameId + '#water-'));
  assert.deepEqual(baseAdded[0], { groupId: baseId, name: '基礎格拆分', showOnMinimap: baseGroup.showOnMinimap, memberCount: 0, baseCellCount: 1 });
  assert.deepEqual(seventh.waterGroupMembers.find(row => row.groupId === baseId), { groupId: baseId, memberIds: [], baseCells: [cell] });
  assert.deepEqual(seventh.waterGroupMembers.find(row => row.groupId === baseSource.groupId), { ...baseSource, baseCells: baseSource.baseCells.slice(1) });
  assert.deepEqual(seventh.waterGroupMembers.filter(row => row.groupId !== baseId && row.groupId !== baseSource.groupId), sixth.waterGroupMembers.filter(row => row.groupId !== baseSource.groupId));
  for (const key of ['chapters','strongholds','map','metadata']) assert.deepEqual(seventh[key], sixth[key]);
  assert.equal(seventh.waterGroups.length, sixth.waterGroups.length + 1);
  assert.equal(await page.locator('#water-split-group').inputValue(), ''); assert.equal(await splitButton.isDisabled(), true);
  assert.deepEqual(await exact('6'), sixth); assert.equal((await preview('7')).pixelsSha256, splitPreview.pixelsSha256);
  checks.push('real base-cell-only checkbox submits integer cell and no component IDs; native cancellation has no write, exact7 inherits visibility and preserves remaining order, old6, entities and preview pixels');
  // Assemble an actual mixed group through the UI, never inject success data.
  const mixedInputs = [splitId, splitSourceId, baseId];
  const mixedParts = mixedInputs.map(id => seventh.waterGroupMembers.find(row => row.groupId === id));
  const mixedMembers = mixedParts.flatMap(row => row.memberIds), mixedCells = mixedParts.flatMap(row => row.baseCells);
  assert.ok(mixedMembers.length >= 2 && mixedCells.includes(cell));
  for (const id of mixedInputs) await page.locator('[data-water-id="' + id + '"] [data-water-select]').check();
  await page.locator('#water-merge-visibility').selectOption('no');
  const mixedDialogs = async (button, name, accept, needles) => {
    let failure, count = 0;
    const handle = async dialog => { try {
      count++;
      if (count === 1) { assert.equal(dialog.type(), 'prompt'); await dialog.accept(name); }
      else { assert.equal(dialog.type(), 'confirm'); for (const needle of needles) assert.ok(dialog.message().includes(needle)); if (accept) await dialog.accept(); else await dialog.dismiss(); }
    } catch (error) { failure = error; await dialog.dismiss(); } };
    page.on('dialog', handle); try { await button.click(); await idle(); } finally { page.off('dialog', handle); }
    if (failure) throw failure; assert.equal(count, 2);
  };
  const mixedMergeResponse = page.waitForResponse(response => response.url() === saveURL && response.request().method() === 'POST');
  await mixedDialogs(page.locator('#water-merge'), '混合來源', true, mixedInputs);
  const mixedMergeReply = await mixedMergeResponse; assert.equal(mixedMergeReply.status(), 200); assert.equal((await mixedMergeReply.json()).draftRevision, '8');
  assert.equal(writes.length, 7);
  assert.deepEqual(writes[6].body.mapEdits, [{ op: 'water-merge', groupIds: mixedInputs, name: '混合來源', showOnMinimap: false }]);
  await page.locator('#water-load').click(); await idle();
  const eighth = await exact('8'), seventhIds = new Set(seventh.waterGroups.map(row => row.groupId));
  const mixedAdded = eighth.waterGroups.filter(row => !seventhIds.has(row.groupId)); assert.equal(mixedAdded.length, 1);
  const mixedId = mixedAdded[0].groupId;
  assert.deepEqual(eighth.waterGroupMembers.find(row => row.groupId === mixedId), { groupId: mixedId, memberIds: mixedMembers, baseCells: mixedCells });
  assert.equal(eighth.waterGroups.length, seventh.waterGroups.length - 2);
  for (const key of ['chapters','strongholds','map','metadata']) assert.deepEqual(eighth[key], seventh[key]);
  assert.deepEqual(await exact('7'), seventh); const mixedPreview = await preview('8');
  checks.push('real UI merges three existing groups into a mixed component/base-cell group with explicit hidden setting, exact member order and immutable old7');
  await page.locator('#water-split-group').selectOption(mixedId);
  await page.locator('[data-water-member]').first().check();
  await page.locator('[data-water-cell][value="' + cell + '"]').check();
  assert.equal(await page.locator('[data-water-member]:checked').count(), 1); assert.equal(await page.locator('[data-water-cell]:checked').count(), 1);
  const mixedNeedles = [mixedId, mixedMembers[0], String(cell)];
  await mixedDialogs(splitButton, '混合拆分', false, mixedNeedles); assert.equal(writes.length, 7);
  const mixedSplitResponse = page.waitForResponse(response => response.url() === saveURL && response.request().method() === 'POST');
  await mixedDialogs(splitButton, '混合拆分', true, mixedNeedles);
  const mixedSplitReply = await mixedSplitResponse; assert.equal(mixedSplitReply.status(), 200); assert.equal((await mixedSplitReply.json()).draftRevision, '9');
  assert.equal(writes.length, 8);
  assert.deepEqual(writes[7].body.mapEdits, [{ op: 'water-split', sourceGroupId: mixedId, memberIds: [mixedMembers[0]], baseCells: [cell], name: '混合拆分' }]);
  assert.equal(await blank(), true); await page.locator('#water-load').click(); await idle();
  const ninth = await exact('9'), eighthIds = new Set(eighth.waterGroups.map(row => row.groupId));
  const mixedSplitAdded = ninth.waterGroups.filter(row => !eighthIds.has(row.groupId)); assert.equal(mixedSplitAdded.length, 1);
  const mixedSplitId = mixedSplitAdded[0].groupId; assert.ok(mixedSplitId.startsWith(gameId + '#water-'));
  assert.deepEqual(mixedSplitAdded[0], { groupId: mixedSplitId, name: '混合拆分', showOnMinimap: false, memberCount: 1, baseCellCount: 1 });
  assert.deepEqual(ninth.waterGroupMembers.find(row => row.groupId === mixedSplitId), { groupId: mixedSplitId, memberIds: [mixedMembers[0]], baseCells: [cell] });
  assert.deepEqual(ninth.waterGroupMembers.find(row => row.groupId === mixedId), { groupId: mixedId, memberIds: mixedMembers.slice(1), baseCells: mixedCells.filter(value => value !== cell) });
  assert.deepEqual(ninth.waterGroupMembers.filter(row => row.groupId !== mixedId && row.groupId !== mixedSplitId), eighth.waterGroupMembers.filter(row => row.groupId !== mixedId));
  for (const key of ['chapters','strongholds','map','metadata']) assert.deepEqual(ninth[key], eighth[key]);
  assert.equal(ninth.waterGroups.length, eighth.waterGroups.length + 1);
  assert.deepEqual(await exact('8'), eighth); assert.equal((await preview('9')).pixelsSha256, mixedPreview.pixelsSha256);
  assert.equal(await page.locator('#water-split-group').inputValue(), ''); assert.equal(await splitButton.isDisabled(), true);
  checks.push('real mixed checkbox split submits one whole component and one integer base cell together; cancel writes nothing, exact9 preserves old8, remainder order, entities, inherited visibility and preview pixels');
  assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  const screenshot = await page.screenshot({ fullPage: true }); writeFileSync(join(output, 'water.png'), screenshot, { flag: 'wx' });
  for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)), digest, path);
  writeFileSync(join(output, 'receipt.json'), JSON.stringify({ checks, writes, expected, errors, outside, sourceHashes, screenshotSha: sha(screenshot), pixelHashes: [original.pixelsSha256, hidden.pixelsSha256, restored.pixelsSha256], scope: 'Own administrator full copy and exact water visibility/name/merge/component-only, base-cell-only and mixed split UI only; not arbitrary map editing, Trial/publication or production' }, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ checks: checks.length, output }) + '\n');
} catch (error) {
  let display; try { display = await page?.evaluate(() => Object.fromEntries(['status','copy-message','copy-state','water-status'].map(id => [id, document.getElementById(id)?.textContent ?? null]))); } catch { /* Owned page may have closed. */ }
  process.stderr.write(JSON.stringify({ completedGroups: checks.length, display, errors, outside }) + '\n'); throw error;
} finally { await browser?.close(); await server?.close(); }
