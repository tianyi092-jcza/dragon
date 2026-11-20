// CHAPTER-WB presentation lane: real built shell, fresh browser, memory-only API.
// Not an authenticated SQLite/publication or original-mechanism certificate.
import assert from 'node:assert/strict';
import { encodePlayerOpening } from '../web/src/editor/chapteropening.js';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';
import { CHAPTER_DIPLOMACY_RELATIONS } from '../web/src/editor/chapterdiplomacy.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'mapview.js': 'mapview.txt', 'stage-assets.js': 'stageassets.txt' };
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'favicon.ico') return res.writeHead(204).end();
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});
const gameId = '11111111-1111-4111-8111-111111111111';
const otherGameId = '22222222-2222-4222-8222-222222222222';
const otherData = { gameId: otherGameId, metadata: { name: '另一遊戲', introduction: 'memory only' }, chapterOrder: [], chapters: {}, cities: {}, generals: {} };
const user = { id: 'chapter-fixture', version: 1, account: 'fixture', role: 'admin', mustChangePassword: false };
const data = { gameId, metadata: { name: '章節測試', introduction: 'memory only' }, chapterOrder: [], chapters: {}, cities: {}, generals: {} };
const replies = new Map([
  ['/api/session', { user, csrf: 'fixture' }], ['/api/admin/accounts', { accounts: [] }],
  ['/api/admin/base-map', { snapshot: null }], ['/api/admin/copy/submissions', { queue: [] }],
  ['/api/resources', { mode: 'BUILTIN_READONLY', resources: [] }],
  ['/api/admin/source', { definition: { registryId: 'isolated-copy-fixture' } }],
  ['/api/games', { games: [{ gameId, ownerId: user.id, draftRevision: '1', metadata: data.metadata }, { gameId: otherGameId, ownerId: user.id, draftRevision: '1', metadata: otherData.metadata }] }],
  [`/api/games/${otherGameId}/copy`, { gameId: otherGameId, copyDigest: 'b'.repeat(64), data: otherData }],
  [`/api/games/${otherGameId}/copy/submission`, { gameId: otherGameId, state: 'draft', validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false }],
  [`/api/games/${gameId}/copy/submission`, { gameId, state: 'draft', validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false }],
]);
const reviewRow = { gameId, name: '審核測試', author: 'fixture', description: '隔離確認測試', state: 'submitted', listed: false,
  version: null, nextVersion: '1.0', rowRevision: '1', createdAt: '2026-11-19T00:00:00.000Z', submittedAt: '2026-11-19T00:01:00.000Z', validatedAt: null, validation: null };
replies.set('/api/admin/copy/submissions', { queue: [reviewRow] });
let approvals = 0;
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = [], unexpected = [], posts = [], expectedRejections = [], expectedRejectionLogs = [];
  let rejectNextCityOwner = false, rejectNextDiplomacy = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.location().url.endsWith(`/api/games/${gameId}/copy`) && /status of 422\b/.test(message.text())) expectedRejectionLogs.push(message.text());
    else errors.push(message.text());
  });
  page.on('response', response => { if (response.url().endsWith(`/api/games/${gameId}/copy`) && response.status() === 422) expectedRejections.push(response.status()); });
  page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
  let dismissDialog = false, dialogCount = 0, lastDialog = '';
  page.on('dialog', dialog => { dialogCount++; lastDialog = dialog.message(); return dismissDialog ? dialog.dismiss() : dialog.accept(); });
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === `/api/games/${gameId}/copy/approve` && request.method() === 'POST') {
      approvals++;
      Object.assign(reviewRow, { state: 'approved', listed: true, version: '1.0', rowRevision: '2' });
      return route.fulfill({ json: { gameId, state: 'approved', ordinal: '1.0' } });
    }
    if (path === '/api/admin/copies') return route.fulfill({ json: { gameId, state: 'pending', rowRevision: '1' }, status: 202 });
    if (path.startsWith('/api/admin/copies/')) return route.fulfill({ json: { gameId, draftRevision: '1', chapterConversion: { version: 1,
      labels: [{ chapterId: 'private-receipt-id', sourceNumber: null, sourceName: '<img src=x>很長的章節名稱', number: '1', name: '章1' }],
      capitals: [{ chapterId: 'private-receipt-id', cityIdx: 7, cityName: '首都校正城', before: 1, after: 0 }],
      duplicates: [{ chapterId: 'private-receipt-id', keptFactionIdx: 2, discardedFactionIdx: 11, monarchName: '藏岷', monarchIdx: 107 },
        { chapterId: 'private-receipt-id', keptFactionIdx: 1, discardedFactionIdx: 10, monarchName: '劉寧', monarchIdx: 34, reason: 'shared-capital', cityIdx: 116, cityName: '建業' }],
    } } });
    if (path === `/api/games/${gameId}/copy`) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); posts.push(body);
        if (body.patch.create) {
          const id = 'chapter-' + (data.chapterOrder.length + 1), values = body.patch.create;
          data.chapterOrder.push(id);
          data.chapters[id] = { chapterId: id, ...values, state: { name: 'raw name', start: values.start, trust: 73, nativeDiplomacyRaw: CHAPTER_BASE.nativeDiplomacyRaw, diplomacy: [[255]], nativeMonthlyPolicyRaw: '12000000000000001700000000000000',
            factions: [{ idx: 0, monarch_idx: 0, advisor_idx: null, diplomat_idx: null, capital: 0, money: 0, reserve_cav: 0, reserve_arc: 65535, reserve_inf: 0 }],
            nativeFactionSlotRaw: CHAPTER_BASE.factionSlots.map((raw, slot) => slot === 17 ? '8000' + raw.slice(4) : raw),
            generals: Array.from({ length: 52 }, (_, idx) => ({ idx, name: '將' + idx, hao: '', attr: 0x90, active: true, appear_months: idx === 2 ? 0 : 9, status: 0, captive_flag: 255, join_faction: null, faction: idx === 0 || idx === 2 ? 0 : idx === 6 ? 17 : null })),
            cities: Array.from({ length: 193 }, (_, idx) => ({ idx, name: '城' + idx, faction: idx === 0 ? 0 : null, governor: null, troops: idx === 0 ? 118 : 0, prod: 0, max_prod: 100, troops_cap: idx === 0 ? 255 : 100, growth: 0, defence: 0 })) } };
          data.cities['extended-city'] = { name: '主表193', runtimeSlot: 192, x: 383, y: 255, type: 3, view: 217, max_prod: 321 };
        } else if (body.patch.delete) {
          const { chapterId } = body.patch.delete;
          assert.ok(data.chapters[chapterId]);
          delete data.chapters[chapterId];
          data.chapterOrder = data.chapterOrder.filter(id => id !== chapterId);
        } else if (body.patch.edits?.[0]?.op === 'chapter-labels') {
          const edit = body.patch.edits[0]; Object.assign(data.chapters[edit.chapterId], { number: edit.number, name: edit.name });
        } else if (body.patch.edits?.[0]?.op === 'player-opening') {
          const edit = body.patch.edits[0], state = data.chapters[edit.chapterId].state;
          const faction = state.factions.find(row => row.idx === edit.factionIdx);
          faction.playerOpening = encodePlayerOpening(faction.playerOpening ?? { trust: state.trust, policyRaw: state.nativeMonthlyPolicyRaw }, edit.values);
        } else if (body.patch.edits?.[0]?.op === 'diplomacy') {
          if (rejectNextDiplomacy) {
            rejectNextDiplomacy = false;
            return route.fulfill({ status: 422, json: { error: 'CHAPTER_WB_DIPLOMACY_REJECTED', detail: 'fixture diplomacy refusal' } });
          }
          const edit = body.patch.edits[0], state = data.chapters[edit.chapterId].state;
          const value = CHAPTER_DIPLOMACY_RELATIONS.find(option => option.id === edit.relation).value;
          const offset = (edit.actorIdx * 24 + edit.targetIdx) * 2;
          state.nativeDiplomacyRaw = state.nativeDiplomacyRaw.slice(0, offset) + value.toString(16) + state.nativeDiplomacyRaw.slice(offset + 2);
          state.diplomacy[edit.actorIdx][edit.targetIdx] = value;
        } else if (body.patch.edits?.[0]?.op === 'set-capital') {
          const edit = body.patch.edits[0], state = data.chapters[edit.chapterId].state;
          state.factions.find(row => row.idx === edit.factionIdx).capital = edit.cityIdx;
          state.cities.find(row => row.idx === edit.cityIdx).faction = edit.factionIdx;
        } else if (body.patch.edits?.[0]?.op === 'city-native') {
          const edit = body.patch.edits[0];
          Object.assign(data.chapters[edit.chapterId].state.cities.find(row => row.idx === edit.cityIdx), edit.values);
        } else if (body.patch.edits?.[0]?.op === 'city-faction') {
          if (rejectNextCityOwner) {
            rejectNextCityOwner = false;
            return route.fulfill({ status: 422, json: { error: 'CHAPTER_WB_OWNER_REJECTED', detail: 'fixture ownership refusal' } });
          }
          const edit = body.patch.edits[0];
          data.chapters[edit.chapterId].state.cities.find(row => row.idx === edit.cityIdx).faction = edit.factionId;
        } else if (body.patch.edits?.[0]?.op === 'set-monarch') {
          const edit = body.patch.edits[0], state = data.chapters[edit.chapterId].state;
          const faction = state.factions.find(row => row.idx === edit.factionIdx);
          state.generals[faction.monarch_idx].attr &= 191;
          faction.monarch_idx = edit.generalIdx;
          state.generals[edit.generalIdx].attr |= 64;
          state.generals[edit.generalIdx].faction = edit.factionIdx;
        } else if (body.patch.edits?.[0]?.op === 'disband-faction') {
          // DTO/interaction fixture only; real raw mirrors and preflight live in the SQLite lane.
          const edit = body.patch.edits[0], state = data.chapters[edit.chapterId].state;
          Object.assign(state.factions[edit.factionIdx], { retired: true, attr: 0, active: false,
            monarch_idx: 255, monarch: '', advisor_idx: null, diplomat_idx: null, capital: null,
            money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0 });
          delete state.factions[edit.factionIdx].playerOpening;
          state.generals.forEach(general => {
            if (general.faction === edit.factionIdx) { general.faction = null; general.attr &= 191; }
            if (general.join_faction === edit.factionIdx) general.join_faction = null;
          });
          state.cities.forEach(city => { if (city.faction === edit.factionIdx) city.faction = null; });
        } else if (body.patch.edits?.[0]?.op === 'set-strategist') {
          const edit = body.patch.edits[0];
          data.chapters[edit.chapterId].state.factions.find(row => row.idx === edit.factionIdx).advisor_idx = edit.generalIdx;
        } else if (body.patch.edits?.[0]?.op === 'create-faction') {
          const edit = body.patch.edits[0], chapter = data.chapters[edit.chapterId], state = chapter.state;
          const idx = state.factions.length, number = chapter.nextFactionNumber++;
          state.factions.push({ ...structuredClone(state.factions[0]), idx, number, factionId: `${edit.chapterId}#faction-${number}`,
            monarch_idx: edit.monarchIdx, advisor_idx: null, diplomat_idx: null, capital: edit.cityIdx,
            money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0,
            playerOpening: encodePlayerOpening({ trust: 255, policyRaw: state.nativeMonthlyPolicyRaw }, { trust: 255, tax: 18, conscription: [0, 0, 0], nextConscription: [0, 0, 0] }) });
          state.generals[edit.monarchIdx].faction = idx; state.generals[edit.monarchIdx].attr |= 64;
          state.cities[edit.cityIdx].faction = idx;
          state.diplomacy = state.factions.map(actor => state.factions.map(target => Number.parseInt(state.nativeDiplomacyRaw.slice((actor.idx * 24 + target.idx) * 2, (actor.idx * 24 + target.idx) * 2 + 2), 16)));
        } else if (body.patch.edits?.[0]?.op === 'general-settings') {
          // UI transport fixture only; real allocation/rollback is covered by SQLite.
          const edit = body.patch.edits[0], definition = data.generals[edit.generalId];
          data.chapters[edit.chapterId].state.generals.push({ idx: 52, generalId: edit.generalId, name: definition.name, hao: definition.hao,
            attr: edit.values.active ? 128 : 0, active: edit.values.active, appear_months: edit.values.appearMonths, join_faction: edit.values.joinFaction, faction: edit.values.factionId });
        } else if (body.patch.edits?.[0]?.op === 'general-arrival') {
          const edit = body.patch.edits[0], general = data.chapters[edit.chapterId].state.generals.find(row => row.idx === edit.generalIdx);
          Object.assign(general, { appear_months: edit.values.appearMonths, join_faction: edit.values.joinFaction });
          if (Object.hasOwn(edit.values, 'active')) { general.active = edit.values.active; general.attr = general.active ? general.attr | 0x80 : general.attr & 0x7f; }
          const owner = body.patch.edits[1];
          if (owner) { assert.equal(owner.op, 'general-faction'); assert.equal(owner.generalIdx, edit.generalIdx); general.faction = owner.factionId; }
        } else if (body.patch.edits?.[0]?.op === 'resources-people') {
          // Mock transport persistence only; native raw mirroring is covered by the SQLite lane.
          const edit = body.patch.edits[0], faction = data.chapters[edit.chapterId].state.factions.find(row => row.idx === edit.factionIdx);
          Object.entries(edit.values).forEach(([key, value]) => { faction[key] = key === 'money' ? value : Math.floor(value / 10); });
        } else { unexpected.push(JSON.stringify(body)); return route.fulfill({ status: 422, json: { error: 'UNEXPECTED_EDIT' } }); }
      }
      return route.fulfill({ json: { gameId, copyDigest: 'a'.repeat(64), data } });
    }
    if (request.method() === 'GET' && replies.has(path)) return route.fulfill({ json: replies.get(path) });
    unexpected.push(request.method() + ' ' + path);
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_REQUEST' } });
  });
  const idle = () => page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
  await page.goto('http://127.0.0.1:' + server.address().port);
  await idle();
  await page.locator('#menu [data-view="management-editor"]').click();
  const approveButton = page.locator('#review-editor [data-action="approve"]');
  await approveButton.click();
  await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.el-message-box').waitFor({ state: 'hidden' });
  assert.equal(approvals, 0, 'cancel approval writes nothing');
  await approveButton.click();
  await page.locator('.el-message-box').getByRole('button', { name: '同意上架', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#review-editor')?.textContent.includes('已同意上架版本 1.0'), null, { timeout: 10000 });
  await idle();
  assert.equal(approvals, 1, 'confirmation sends exactly one approval');
  assert.equal(await approveButton.isDisabled(), true, 'approved row is reread and no longer actionable');
  await page.locator('#menu [data-view="draft-editor"]').click();
  await page.locator('#identity').filter({ hasText: 'fixture' }).waitFor(); await idle();
  await page.getByRole('button', { name: '重新整理', exact: true }).first().click(); await idle();
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: data.metadata.name, exact: true }).click(); await idle();
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  assert.equal(await page.locator('#stronghold-editor').getByText('城兵*10', { exact: true }).count(), 1);
  const panel = page.locator('#chapters-editor');
  await panel.locator('[data-chapter-create]').click();
  const dialog = page.locator('.el-dialog');
  await dialog.waitFor();
  assert.ok((await dialog.locator('.el-dialog__title').textContent()).includes('新增章節'), 'create dialog shows the approved title');
  assert.equal(await dialog.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-overlay ")]').count(), 1, 'create dialog renders inside a modal overlay');
  assert.equal(await dialog.locator('.chapter-create-result').count(), 1, 'result row reserves space before saving');
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.locator('[data-new-chapter-number]').fill('甲');
  await dialog.locator('[data-new-chapter-name]').fill('第一章');
  // Element Plus select owns an additional search input; identify the three numeric controls.
  const dates = dialog.locator('input[inputmode="numeric"]');
  await dates.nth(0).fill('1'); await dates.nth(1).fill('12'); await dates.nth(2).fill('31');
  await dialog.locator('[data-new-chapter-save]').click();
  await dialog.getByText(/保存成功/).waitFor();
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  await panel.locator('[data-chapter-form-save]').waitFor();
  assert.equal(await panel.locator('[data-chapter-form-save]').isDisabled(), true, 'merged form starts clean');
  assert.equal(posts.length, 1); assert.equal(posts[0].patch.create.number, '甲');
  assert.deepEqual(await panel.getByRole('tab').allTextContents(), ['章節管理', '勢力設置', '勢力武將', '外交關係', '勢力據點']);
  await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
  assert.equal(await panel.locator('[data-diplomacy-diagonal]').count(), 1);
  assert.equal(await panel.locator('[data-diplomacy-cell]').count(), 0);
  await panel.getByRole('tab', { name: '章節管理', exact: true }).click();
  await panel.locator('[data-chapter-name]').fill('改名');
  dismissDialog = true;
  const priorDialogs = dialogCount;
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  assert.equal(dialogCount, priorDialogs + 1, 'module leave consults the chapter input guard');
  assert.equal(await panel.isVisible(), true);
  assert.equal(await panel.locator('[data-chapter-name]').inputValue(), '改名');
  dismissDialog = false;
  await panel.getByRole('tab', { name: '勢力武將', exact: true }).click();
  assert.equal(await panel.getByRole('tab', { name: '章節管理', exact: true }).getAttribute('aria-selected'), 'true');
  await panel.locator('[data-chapter-form-save]').click(); await idle();
  assert.equal(await panel.locator('[data-chapter-form-save]').isDisabled(), true, 'merged save clears the form dirty state');
  assert.equal(data.chapters['chapter-1'].name, '改名'); assert.equal(posts.length, 2);
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  const factions = panel.locator('#pane-factions');
  assert.equal(await panel.locator('#chapters-status, .module-notice:not(.chapter-create-result)').count(), 0, 'only the shared status line remains');
  assert.ok((await factions.locator('.el-table__row').first().boundingBox()).height <= 46, 'default controls fit a compact faction row');
  async function assertFluidTable(table) {
    for (const width of [1920, 1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const sizes = await table.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate(el => ({ content: el.scrollWidth, viewport: el.clientWidth }));
      assert.ok(sizes.content <= sizes.viewport + 1, `table must fit at ${width}px: ${JSON.stringify(sizes)}`);
      const clipped = await table.locator('.el-table__body td').evaluateAll(cells => cells.flatMap(cell => {
        const box = cell.getBoundingClientRect();
        return Array.from(cell.querySelectorAll('.el-select, .el-input-number, .el-button, img')).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1);
        }).map(el => el.className);
      }));
      assert.deepEqual(clipped, [], `controls must remain within cells at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await factions.locator('[data-opening-edit]').click();
  await factions.locator('[data-opening-input="conscription0"]').fill('127');
  await factions.locator('small').filter({ hasText: '保存人數 120' }).waitFor();
  await factions.locator('[data-opening-save]').click(); await idle();
  await factions.locator('[data-opening-edit]').waitFor();
  assert.equal(posts.length, 3);
  assert.equal(posts.at(-1).patch.edits[0].values.conscription[0], 127, 'UI sends actual people unchanged');
  assert.equal(data.chapters['chapter-1'].state.factions[0].playerOpening.policyRaw.slice(4, 8), '0c00');
  await factions.locator('[data-opening-edit]').click();
  assert.equal(await factions.locator('[data-opening-input="conscription0"]').inputValue(), '120', 'reread multiplies the stored word once');
  await factions.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(posts.length, 3);
  await factions.locator('[data-resource-edit]').click();
  assert.equal(await factions.locator('[data-resource-input="reserve_arc"]').inputValue(), '655350');
  await factions.locator('[data-resource-input="reserve_cav"]').fill('127');
  await factions.locator('[data-resource-input="money"]').fill('650001');
  await factions.locator('[data-resource-save]').click();
  assert.equal(posts.length, 3, 'over-limit input never sends a command');
  assert.match(await page.locator('#status').textContent(), /金錢須為/, 'local validation uses the shared status line');
  await factions.locator('[data-resource-input="money"]').fill('650000');
  await factions.locator('[data-resource-save]').click(); await idle();
  await factions.locator('[data-resource-edit]').waitFor();
  assert.deepEqual(posts.at(-1).patch.edits[0].values, { money: 650000, reserve_cav: 127 });
  assert.equal(data.chapters['chapter-1'].state.factions[0].reserve_arc, 65535, 'untouched historical value preserved');
  await factions.locator('[data-resource-edit]').click();
  assert.equal(await factions.locator('[data-resource-input="reserve_cav"]').inputValue(), '120');
  assert.equal(await factions.locator('[data-resource-input="money"]').inputValue(), '650000');
  await factions.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(posts.length, 4);
  await panel.getByRole('tab', { name: '勢力武將', exact: true }).click();
  const generals = panel.locator('#pane-generals');
  assert.equal(await generals.getByRole('columnheader', { name: '身份與職務', exact: true }).count(), 0);
  await assertFluidTable(page.locator('#chapters-generals-table'));
  assert.equal(await generals.locator('.el-table__row').count(), 25);
  const captureHeading = generals.getByRole('columnheader', { name: '勢力被滅被俘', exact: true });
  assert.ok((await captureHeading.locator('.cell').boundingBox()).height < 30, 'capture heading stays on one line');
  const unmatchedRow = generals.locator('.el-table__row').filter({ has: page.getByText('將6', { exact: true }) });
  const unmatchedOwner = unmatchedRow.locator('[data-general-faction]');
  assert.equal((await unmatchedOwner.textContent()).trim(), '將0', 'known lord name has no internal slot suffix');
  assert.equal(await generals.locator('[data-general-faction] .el-select, [data-arrival-faction]').count(), 0, 'membership is plain text outside editing');
  const beforeUnmatched = posts.length;
  await unmatchedRow.locator('[data-arrival-edit]').click();
  await unmatchedRow.locator('[data-arrival-faction]').click();
  assert.equal(await page.getByRole('option', { name: '無', exact: true }).count(), 1);
  const unlistedOption = page.getByRole('option', { name: '將0', exact: true, disabled: true });
  await unlistedOption.waitFor({ state: 'visible' });
  assert.equal(await unlistedOption.count(), 1);
  assert.equal(await page.getByRole('option', { name: /原槽17/ }).count(), 0);
  await page.getByRole('option', { name: '無', exact: true }).click();
  assert.equal(posts.length, beforeUnmatched, 'changing selection is local only');
  await unmatchedRow.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await unmatchedOwner.textContent()).trim(), '將0');
  assert.equal(posts.length, beforeUnmatched); assert.equal(data.chapters['chapter-1'].state.generals[6].faction, 17);
  assert.equal(await generals.locator('[data-general-slot="0"]').count(), 0, 'monarch excluded');
  const firstGeneral = generals.locator('.el-table__row').first();
  await firstGeneral.locator('[data-arrival-edit]').click();
  await assertFluidTable(page.locator('#chapters-generals-table'));
  const beforeGeneralSave = posts.length;
  await firstGeneral.locator('[data-arrival-faction]').click();
  await page.getByRole('option', { name: '將0', exact: true }).click();
  assert.equal(posts.length, beforeGeneralSave, 'membership dropdown does not save independently');
  await firstGeneral.locator('[data-arrival-months] input').fill('3');
  assert.equal(await firstGeneral.getByRole('checkbox', { name: '已登場', exact: true }).isChecked(), true);
  await firstGeneral.locator('[data-arrival-active]').click();
  await firstGeneral.locator('[data-arrival-join]').click();
  const joinList = await firstGeneral.locator('[data-arrival-join] [role="combobox"]').getAttribute('aria-controls');
  await page.locator(`#${joinList}`).getByRole('option', { name: '將0', exact: true }).click();
  await firstGeneral.locator('[data-arrival-save]').click(); await idle();
  await firstGeneral.locator('[data-arrival-edit]').waitFor();
  assert.deepEqual(posts.at(-1).patch.edits[0].values, { appearMonths: 3, joinFaction: 0, active: false });
  assert.equal(posts.length, beforeGeneralSave + 1, 'all general fields share one save request');
  assert.deepEqual(posts.at(-1).patch.edits[1], { op: 'general-faction', chapterId: 'chapter-1', generalIdx: 1, factionId: 0 });
  assert.equal((await firstGeneral.locator('[data-general-faction]').textContent()).trim(), '將0');
  assert.equal(data.chapters['chapter-1'].state.generals[1].attr & 0x80, 0);
  assert.equal(data.chapters['chapter-1'].state.generals[1].faction, 0, 'explicit edited membership persists together with arrival fields');
  await firstGeneral.locator('[data-arrival-edit]').click();
  assert.equal(await firstGeneral.locator('[data-arrival-months] input').inputValue(), '3');
  assert.equal(await firstGeneral.getByRole('checkbox', { name: '已登場', exact: true }).isChecked(), false);
  await firstGeneral.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(posts.length, 5);
  const jump = generals.locator('.el-pagination__jump input'); await jump.fill('3'); await jump.press('Enter'); await jump.press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('#pane-generals .el-table__row').length === 1);
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  const cities = panel.locator('#pane-cities');
  assert.equal(await cities.locator('.el-table__row').count(), 25);
  assert.equal(await cities.locator('[data-city-faction]').count(), 0, 'faction changes are edit-gated in read mode');
  assert.ok((await cities.locator('[data-city-faction-readonly]').first().textContent()).includes('將0'), 'read mode shows the owning lord as text');
  const capitalRowProbe = cities.locator('.el-table__row').first();
  await capitalRowProbe.locator('[data-number-edit]').click();
  assert.equal(await capitalRowProbe.locator('[data-city-faction]').getByRole('combobox').isDisabled(), true, 'capital cannot change owner inline');
  await capitalRowProbe.locator('[data-number-cancel]').click();
  const cityJump = cities.locator('.el-pagination__jump input');
  await cityJump.fill('8'); await cityJump.press('Enter'); await cityJump.press('Tab');
  const extendedCity = cities.locator('.el-table__row').filter({ has: page.locator('[data-city-idx="192"]') });
  await extendedCity.waitFor();
  assert.ok((await extendedCity.textContent()).includes('主表193'));
  assert.equal(await extendedCity.locator('[data-city-position]').textContent(), '383, 255');
  assert.equal(await extendedCity.locator('[data-city-type]').textContent(), '關卡');
  assert.equal(await extendedCity.locator('[data-city-view]').count(), 0, 'appearance column is hidden by product decision');
  assert.equal(await extendedCity.locator('[data-city-max-prod]').textContent(), '321');
  assert.equal(await extendedCity.locator('[data-city-position] input, [data-city-type] input, [data-city-max-prod] input').count(), 0);
  assert.equal(data.chapters['chapter-1'].state.cities[192].name, '城192', 'master display projection does not rewrite chapter source');
  await cityJump.fill('1'); await cityJump.press('Enter'); await cityJump.press('Tab');
  await cities.locator('[data-city-idx="0"]').waitFor();
  const numbersRow = cities.locator('.el-table__row').first();
  assert.equal(await numbersRow.locator('[data-city-capital-readonly]').textContent(), '✓');
  assert.equal(await cities.locator('[data-city-capital-readonly]').nth(1).textContent(), '');
  assert.equal(await cities.locator('[data-city-capital], [data-city-capital-readonly] button, [data-city-capital-readonly] input').count(), 0);
  assert.equal(await numbersRow.locator('[data-city-number="troops"]').textContent(), '1180');
  assert.match(await numbersRow.locator('[data-city-number="troops"]').getAttribute('title'), /2550/);
  const beforeNumberCancel = posts.length;
  await numbersRow.locator('[data-number-edit]').click();
  assert.equal(await numbersRow.locator('[data-number-input="troops"]').inputValue(), '1180');
  await assertFluidTable(page.locator('#chapters-cities-table'));
  await numbersRow.locator('[data-number-cancel]').click();
  assert.equal(posts.length, beforeNumberCancel, 'responsive numeric editing and cancel do not write data');
  await numbersRow.locator('[data-number-edit]').click();
  await numbersRow.locator('[data-number-input="troops"]').fill('1181');
  await numbersRow.locator('[data-number-save]').click(); await idle();
  assert.match(await page.locator('#status').textContent(), /10 的倍數/);
  assert.equal(posts.length, beforeNumberCancel, 'no silent rounding or invalid troop write');
  for (const people of [1190, 1180]) {
    await numbersRow.locator('[data-number-input="troops"]').fill(String(people));
    await numbersRow.locator('[data-number-save]').click(); await idle();
    assert.deepEqual(posts.at(-1).patch.edits[0].values, { troops: people / 10 });
    assert.equal(data.chapters['chapter-1'].state.cities[0].troops, people / 10);
    assert.equal(await numbersRow.locator('[data-city-number="troops"]').textContent(), String(people));
    if (people === 1190) await numbersRow.locator('[data-number-edit]').click();
  }
  const ordinaryRow = cities.locator('.el-table__row').nth(1), beforeCityOwner = posts.length;
  await ordinaryRow.locator('[data-number-edit]').click();
  const ordinaryCityOwner = ordinaryRow.locator('[data-city-faction]');
  assert.equal(await ordinaryCityOwner.getByRole('combobox').isEnabled(), true, 'neutral city allows owner editing');
  await ordinaryCityOwner.click(); await page.getByRole('option', { name: '將0', exact: true }).click();
  dismissDialog = true;
  await ordinaryRow.locator('[data-number-save]').click(); await idle();
  assert.equal(posts.length, beforeCityOwner, 'cancelled ownership confirmation writes nothing');
  assert.ok((await ordinaryCityOwner.textContent()).includes('將0'), 'cancel keeps the staged choice in edit mode');
  await ordinaryRow.locator('[data-number-cancel]').click();
  assert.ok((await ordinaryRow.locator('[data-city-faction-readonly]').textContent()).includes('空城'), 'cancel restores the persisted neutral owner');
  dismissDialog = false;
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    assert.ok(await cities.locator('.el-pagination').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
  }
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  await factions.locator('[data-resource-edit]').click();
  await factions.locator('[data-resource-input="money"]').fill('12345');
  const originalData = JSON.stringify(data), otherBefore = JSON.stringify(otherData);
  dismissDialog = true;
  const beforeSwitchDialogs = dialogCount, beforeGameSwitchPosts = posts.length;
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: otherData.metadata.name, exact: true }).click(); await idle();
  assert.equal(dialogCount, beforeSwitchDialogs + 1);
  assert.equal(await factions.locator('[data-resource-input="money"]').inputValue(), '12345');
  assert.equal(posts.length, beforeGameSwitchPosts);
  dismissDialog = false;
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: otherData.metadata.name, exact: true }).click(); await idle();
  assert.equal(await panel.locator('[data-resource-input]').count(), 0, 'accepted game switch removes old local editing state');
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.locator('[data-chapter-create]').waitFor();
  assert.equal(await panel.locator('.el-table__row').count(), 0, 'other game has no inherited chapter rows');
  assert.equal(JSON.stringify(data), originalData);
  assert.equal(JSON.stringify(otherData), otherBefore);
  assert.equal(posts.length, beforeGameSwitchPosts, 'switch does not implicitly save either game');
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: data.metadata.name, exact: true }).click(); await idle();
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  const strategist = factions.locator('[data-strategist-select]');
  await strategist.click();
  await page.getByRole('option', { name: '將2', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['無', '將2']);
  await page.getByRole('option', { name: '將2', exact: true }).click(); await idle();
  assert.equal(data.chapters['chapter-1'].state.factions[0].advisor_idx, 2);
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'set-strategist', chapterId: 'chapter-1', factionIdx: 0, generalIdx: 2 });
  const beforeCancel = posts.length;
  dismissDialog = true;
  await strategist.click(); await page.getByRole('option', { name: '無', exact: true }).click(); await idle();
  assert.equal(posts.length, beforeCancel);
  assert.match(await strategist.textContent(), /將2/);
  dismissDialog = false;
  await strategist.click(); await page.getByRole('option', { name: '無', exact: true }).click(); await idle();
  assert.equal(data.chapters['chapter-1'].state.factions[0].advisor_idx, null);
  assert.match(await strategist.textContent(), /無/);
  const capital = factions.locator('[data-faction-capital]');
  await capital.click(); await page.getByRole('option', { name: '城0', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['城0'], 'neutral cities are not capital candidates');
  await page.keyboard.press('Escape');
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  const cityOneRow = cities.locator('.el-table__row').filter({ has: page.getByText('城1', { exact: true }) });
  await cityOneRow.locator('[data-number-edit]').click();
  await cityOneRow.locator('[data-city-faction]').click();
  await page.getByRole('option', { name: '將0', exact: true }).click();
  await cityOneRow.locator('[data-number-save]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  await capital.click(); await page.getByRole('option', { name: '城1', exact: true }).click(); await idle();
  assert.equal(data.chapters['chapter-1'].state.factions[0].capital, 1);
  assert.equal(data.chapters['chapter-1'].state.cities[1].faction, 0, 'new capital was explicitly assigned in the cities tab first');
  assert.equal(data.chapters['chapter-1'].state.cities[0].faction, 0, 'old capital remains owned');
  assert.match(await capital.textContent(), /城1/);
  const beforeCapitalCancel = posts.length;
  dismissDialog = true;
  await capital.click(); await page.getByRole('option', { name: '城0', exact: true }).click(); await idle();
  assert.equal(posts.length, beforeCapitalCancel); assert.match(await capital.textContent(), /城1/);
  dismissDialog = false;
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  const newCapitalRow = cities.locator('.el-table__row').filter({ has: page.getByText('城1', { exact: true }) });
  assert.ok((await newCapitalRow.locator('[data-city-faction-readonly]').textContent()).includes('將0'), 'capital row shows its owner as text');
  await newCapitalRow.locator('[data-number-edit]').click();
  assert.equal(await newCapitalRow.locator('[data-city-faction]').getByRole('combobox').isDisabled(), true, 'capital cannot change owner inline');
  await newCapitalRow.locator('[data-number-cancel]').click();
  const cityFourRow = cities.locator('.el-table__row').filter({ has: page.locator('[data-city-idx="4"]') });
  const beforeOwnerRejection = JSON.stringify(data), beforeOwnerRejectionPosts = posts.length;
  rejectNextCityOwner = true;
  await cityFourRow.locator('[data-number-edit]').click();
  const cityFourOwner = cityFourRow.locator('[data-city-faction]');
  await cityFourOwner.click(); await page.getByRole('option', { name: '將0', exact: true }).click();
  await cityFourRow.locator('[data-number-save]').click(); await idle();
  assert.equal(posts.length, beforeOwnerRejectionPosts + 1, 'explicit rejection is not silently retried');
  assert.equal(JSON.stringify(data), beforeOwnerRejection, 'rejected command changes no chapter or master data');
  assert.ok((await cityFourOwner.textContent()).includes('將0'), 'staged choice remains visible while the rejection is shown');
  assert.match(await page.locator('#status').textContent(), /CHAPTER_WB_OWNER_REJECTED/);
  assert.deepEqual(expectedRejections, [422]);
  await cityFourRow.locator('[data-number-cancel]').click();
  assert.ok((await cityFourRow.locator('[data-city-faction-readonly]').textContent()).includes('空城'), 'cancel after rejection restores the persisted neutral owner');
  await cityFourRow.locator('[data-number-edit]').click();
  await cityFourRow.locator('[data-city-faction]').click(); await page.getByRole('option', { name: '將0', exact: true }).click();
  await cityFourRow.locator('[data-number-save]').click(); await idle();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'city-faction', chapterId: 'chapter-1', cityIdx: 4, factionId: 0 });
  assert.equal(data.chapters['chapter-1'].state.cities[4].faction, 0);
  assert.ok((await cityFourRow.locator('[data-city-faction-readonly]').textContent()).includes('將0'), 'successful ownership save is re-read');
  assert.match(await page.locator('#status').textContent(), /操作完成/, 'a later successful operation replaces the rejection notice');
  assert.equal(await cities.getByRole('columnheader', { name: '內政官', exact: true }).count(), 0);
  assert.equal(await cities.locator('[data-city-governor]').count(), 0);
  await assertFluidTable(page.locator('#chapters-cities-table'));
  await cityFourRow.locator('[data-number-edit]').click();
  await cityFourRow.locator('[data-city-faction]').click(); await page.getByRole('option', { name: '空城', exact: true }).click();
  await cityFourRow.locator('[data-number-save]').click(); await idle();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'city-faction', chapterId: 'chapter-1', cityIdx: 4, factionId: null });
  assert.equal(data.chapters['chapter-1'].state.cities[4].faction, null);
  assert.ok((await cityFourRow.locator('[data-city-faction-readonly]').textContent()).includes('空城'), 'neutral is a persisted choice, not a placeholder');
  const unassignedId = gameId + '#general-' + 'd'.repeat(64);
  data.generals[unassignedId] = { name: '未配置人物', zi: '待選字', hao: '', ability: null, portraitRef: null, suicideOnCapture: false };
  const beforeAllocation = JSON.stringify(data), beforeAllocationPosts = posts.length;
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力武將', exact: true }).click();
  await jump.fill('3'); await jump.press('Enter'); await jump.press('Tab');
  const unassignedRow = generals.locator('.el-table__row').filter({ has: page.getByText('未配置人物', { exact: true }) });
  await unassignedRow.waitFor();
  assert.match(await unassignedRow.textContent(), /未配置/);
  await unassignedRow.locator('[data-arrival-edit]').click();
  assert.equal(await unassignedRow.getByRole('checkbox', { name: '已登場', exact: true }).isChecked(), false);
  await unassignedRow.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(posts.length, beforeAllocationPosts); assert.equal(JSON.stringify(data), beforeAllocation);
  await unassignedRow.locator('[data-arrival-edit]').click();
  await unassignedRow.locator('[data-arrival-months] input').fill('8');
  await unassignedRow.locator('[data-arrival-faction]').click();
  await page.getByRole('option', { name: '將0', exact: true }).click();
  await unassignedRow.locator('[data-arrival-save]').click(); await idle();
  await unassignedRow.locator('[data-arrival-edit]').waitFor();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'general-settings', chapterId: 'chapter-1', generalId: unassignedId, values: { active: false, appearMonths: 8, joinFaction: null, factionId: 0 } });
  assert.equal(data.chapters['chapter-1'].state.generals.filter(row => row.generalId === unassignedId).length, 1);
  assert.equal(await unassignedRow.locator('[data-general-slot="52"]').count(), 1, 'saved member reappears once as assigned');
  Object.assign(data.chapters['chapter-1'].state.factions[0], { number: 8, factionId: 'chapter-1#faction-8' });
  data.chapters['chapter-1'].nextFactionNumber = 9;
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  assert.equal(await factions.locator('[data-faction-slot="0"]').textContent(), '8', 'visible number is not native slot plus one for converted chapters');
  const memberId = gameId + '#general-' + 'd'.repeat(64);
  data.generals[memberId] = { name: '將2', portraitRef: null, ability: null };
  data.chapters['chapter-1'].state.generals[2].generalId = memberId;
  const lordId = gameId + '#general-' + 'e'.repeat(64);
  data.generals[lordId] = { name: '新君', zi: '', hao: '', portraitRef: null, ability: null, suicideOnCapture: false };
  Object.assign(data.chapters['chapter-1'].state.generals[3], { generalId: lordId, appear_months: 0, attr: 128, faction: null });
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  const beforeCreate = posts.length;
  await factions.locator('[data-faction-create]').click();
  assert.equal(await factions.locator('[data-faction-create-save]').isDisabled(), true);
  await panel.getByRole('tab', { name: '勢力武將', exact: true }).click();
  assert.equal(await panel.getByRole('tab', { name: '勢力設置', exact: true }).getAttribute('aria-selected'), 'true');
  await factions.locator('[data-faction-create-cancel]').click();
  assert.equal(posts.length, beforeCreate);
  await factions.locator('[data-faction-create]').click();
  await factions.locator('[data-faction-new-lord]').click();
  await page.getByRole('option', { name: '新君', exact: true }).click();
  await factions.locator('[data-faction-new-capital]').click();
  await page.getByRole('option', { name: '城2', exact: true }).click();
  dismissDialog = true;
  await factions.locator('[data-faction-create-save]').click(); await idle();
  assert.equal(posts.length, beforeCreate);
  assert.equal(await factions.locator('[data-faction-create-save]').count(), 1, 'cancelled confirmation keeps inputs');
  dismissDialog = false;
  await factions.locator('[data-faction-create-save]').click(); await idle();
  await factions.locator('[data-faction-create]').waitFor();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'create-faction', chapterId: 'chapter-1', monarchIdx: 3, cityIdx: 2 });
  assert.equal(await factions.locator('[data-faction-slot="1"]').textContent(), '9');
  assert.equal(data.chapters['chapter-1'].state.cities[2].faction, 1);
  await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
  const matrix = panel.locator('#chapters-diplomacy-table');
  assert.equal(await matrix.locator('[data-diplomacy-diagonal]').count(), 2, 'new force adds both row and column');
  assert.equal(await matrix.locator('[data-diplomacy-cell]').count(), 2);
  const cell = matrix.locator('[data-diplomacy-cell="0-1"]'), reverse = matrix.locator('[data-diplomacy-cell="1-0"]');
  assert.ok((await cell.textContent()).includes('普通')); assert.ok((await reverse.textContent()).includes('普通'));
  // Presentation-only maximum-capacity fixture, restored before write tests.
  const smallMatrix = structuredClone(data.chapters['chapter-1']), beforeMatrixPosts = posts.length;
  const wide = data.chapters['chapter-1'].state;
  Array.from({ length: 20 }, (_, offset) => offset + 2).forEach(idx => {
    wide.factions.push({ ...structuredClone(wide.factions[1]), idx, number: idx + 8,
      factionId: `chapter-1#faction-${idx + 8}`, monarch_idx: idx + 2, capital: idx + 1 });
    wide.generals[idx + 2].faction = idx; wide.generals[idx + 2].attr |= 64;
    wide.cities[idx + 1].faction = idx;
  });
  data.chapters['chapter-1'].nextFactionNumber = 30;
  wide.diplomacy = wide.factions.map(actor => wide.factions.map(target => Number.parseInt(wide.nativeDiplomacyRaw.slice((actor.idx * 24 + target.idx) * 2, (actor.idx * 24 + target.idx) * 2 + 2), 16)));
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
  assert.equal(await matrix.locator('[data-diplomacy-diagonal]').count(), 22);
  assert.equal(await matrix.locator('[data-diplomacy-cell]').count(), 22 * 21);
  const diplomacyWidths = await matrix.locator('.el-table__header th:not(.gutter)').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  assert.equal(diplomacyWidths[0], 60);
  assert.ok(diplomacyWidths.slice(1).every(width => width === 70), 'diplomacy columns are half their former width');
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await matrix.locator('.el-scrollbar__wrap').evaluate(el => el.scrollWidth > el.clientWidth), 'wide matrix scrolls inside the Element Plus table');
  }
  data.chapters['chapter-1'] = smallMatrix;
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
  assert.equal(posts.length, beforeMatrixPosts, 'matrix layout and navigation never write source');
  const dialogsBeforeDiplomacy = dialogCount;
  await cell.click(); await page.getByRole('option', { name: '良好', exact: true }).click(); await idle();
  assert.equal(dialogCount, dialogsBeforeDiplomacy, 'select commits without another confirmation dialog');
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'diplomacy', chapterId: 'chapter-1', actorIdx: 0, targetIdx: 1, relation: 'good' });
  assert.ok((await cell.textContent()).includes('良好')); assert.ok((await reverse.textContent()).includes('普通'));
  const beforeDiplomacyRefusal = JSON.stringify(data), countBeforeDiplomacyRefusal = posts.length;
  rejectNextDiplomacy = true;
  await cell.click(); await page.getByRole('option', { name: '親密', exact: true }).click(); await idle();
  assert.equal(posts.length, countBeforeDiplomacyRefusal + 1);
  assert.equal(JSON.stringify(data), beforeDiplomacyRefusal);
  assert.ok((await cell.textContent()).includes('良好'));
  assert.match(await page.locator('#status').textContent(), /CHAPTER_WB_DIPLOMACY_REJECTED/);
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  const monarchSelect = factions.locator('[data-monarch-select]').nth(0);
  const beforeMonarch = posts.length;
  await monarchSelect.click(); await page.getByRole('option', { name: '將2', exact: true }).waitFor();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['將0', '將2'], 'other faction lord and unavailable people excluded');
  dismissDialog = true;
  await page.getByRole('option', { name: '將2', exact: true }).click(); await idle();
  assert.equal(posts.length, beforeMonarch); assert.ok((await monarchSelect.textContent()).includes('將0'));
  dismissDialog = false;
  await monarchSelect.click(); await page.getByRole('option', { name: '將2', exact: true }).click(); await idle();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'set-monarch', chapterId: 'chapter-1', factionIdx: 0, generalIdx: 2 });
  assert.ok((await monarchSelect.textContent()).includes('將2'));
  assert.equal(data.chapters['chapter-1'].state.generals[0].faction, 0, 'old lord remains a member');
  assert.equal(data.chapters['chapter-1'].state.factions[0].number, 8);
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  await cityJump.fill('8'); await cityJump.press('Enter'); await cityJump.press('Tab');
  await extendedCity.locator('[data-number-edit]').click();
  await extendedCity.locator('[data-city-faction]').click();
  await page.getByRole('option', { name: '將2', exact: true }).click();
  await extendedCity.locator('[data-number-save]').click(); await idle();
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  await factions.locator('[data-faction-capital]').first().click();
  await page.getByRole('option', { name: '主表193', exact: true }).click(); await idle();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'set-capital', chapterId: 'chapter-1', factionIdx: 0, cityIdx: 192 });
  assert.ok((await factions.locator('[data-faction-capital]').first().textContent()).includes('主表193'), 'capital 192 survives the post-save read boundary');
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  await cityJump.fill('8'); await cityJump.press('Enter'); await cityJump.press('Tab');
  await extendedCity.waitFor();
  assert.ok((await extendedCity.locator('[data-city-faction-readonly]').textContent()).includes('將2'), 'capital owner stays readable as text');
  await extendedCity.locator('[data-number-edit]').click();
  assert.equal(await extendedCity.locator('[data-city-faction]').getByRole('combobox').isDisabled(), true);
  assert.ok((await extendedCity.locator('[data-city-faction]').textContent()).includes('將2'));
  await extendedCity.locator('[data-number-cancel]').click();
  assert.equal(data.chapters['chapter-1'].state.cities[1].faction, 0, 'old capital remains owned after moving beyond the native baseline');
  await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
  const beforeRetirement = JSON.stringify(data), beforeRetirementPosts = posts.length;
  const retiring = data.chapters['chapter-1'].state;
  const retirementMaster = JSON.stringify({ generals: data.generals, cities: data.cities }), retirementOther = JSON.stringify(otherData);
  const survivor = structuredClone(retiring.factions[1]);
  dismissDialog = true;
  await factions.locator('[data-faction-disband="0"]').click(); await idle();
  assert.ok(lastDialog.includes('勢力8（君主：將2）'));
  assert.ok(lastDialog.includes(`成員${retiring.generals.filter(g => g.faction === 0).length}人`));
  assert.ok(lastDialog.includes(`據點${retiring.cities.filter(city => city.faction === 0).length}座`));
  assert.ok(lastDialog.includes(`預定投奔${retiring.generals.filter(g => g.join_faction === 0).length}人`));
  assert.ok(lastDialog.includes('退役槽不復用'));
  assert.equal(posts.length, beforeRetirementPosts); assert.equal(JSON.stringify(data), beforeRetirement);
  dismissDialog = false;
  await factions.locator('[data-faction-disband="0"]').click(); await idle();
  assert.deepEqual(posts.at(-1).patch.edits[0], { op: 'disband-faction', chapterId: 'chapter-1', factionIdx: 0, confirm: true });
  assert.equal(await factions.locator('[data-faction-slot="0"]').count(), 0);
  assert.equal(await factions.locator('[data-faction-slot="1"]').textContent(), '9');
  assert.equal(retiring.factions.length, 2); assert.deepEqual(retiring.factions[1], survivor);
  assert.equal(JSON.stringify({ generals: data.generals, cities: data.cities }), retirementMaster);
  assert.equal(JSON.stringify(otherData), retirementOther);
  await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
  assert.equal(await matrix.locator('[data-diplomacy-diagonal]').count(), 1, 'retired force row and column disappear without renumbering the remaining slot');
  assert.equal(await matrix.locator('[data-diplomacy-cell]').count(), 0);
  assert.ok(retiring.generals.every(g => g.faction !== 0 && g.join_faction !== 0));
  await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
  await extendedCity.waitFor();
  assert.ok((await extendedCity.locator('[data-city-faction-readonly]').textContent()).includes('空城'), 'retired capital unlocks after re-read');
  await extendedCity.locator('[data-number-edit]').click();
  assert.equal(await extendedCity.locator('[data-city-faction]').getByRole('combobox').isDisabled(), false, 'retired capital unlocks after re-read');
  await extendedCity.locator('[data-number-cancel]').click();
  await page.locator('#menu [data-view="draft-editor"]').click(); await idle();
  assert.equal(await page.locator('#draft-role-editor, #draft-role-unknown, #faction-create-monarch, #draft-chapters, #draft-chapter-create, #draft-resources').count(), 0, 'game management has no duplicate legacy chapter, appointment or raw-unit resource forms');
  const oldIntroduction = await page.locator('#draft-introduction').inputValue(), beforeMetadata = posts.length;
  await page.locator('#draft-introduction').fill('保留未保存簡介');
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await page.locator('#menu [data-view="draft-editor"]').click(); await idle();
  assert.equal(await page.locator('#draft-introduction').inputValue(), '保留未保存簡介', 'metadata survives hidden-panel remount');
  await page.locator('#draft-cancel-edits').click(); await idle();
  assert.equal(await page.locator('#draft-introduction').inputValue(), oldIntroduction);
  assert.equal(posts.length, beforeMetadata, 'metadata navigation and cancellation write nothing');
  await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
  await panel.getByRole('tab', { name: '章節管理', exact: true }).click();
  const beforeDelete = JSON.stringify(data), beforeDeletePosts = posts.length;
  const masterBeforeDelete = JSON.stringify({ generals: data.generals, cities: data.cities }), otherBeforeDelete = JSON.stringify(otherData);
  const deleting = data.chapters['chapter-1'].state;
  dismissDialog = true;
  await panel.locator('[data-chapter-delete]').click(); await idle();
  assert.ok(lastDialog.includes(deleting.factions.filter(faction => !faction.retired).length + ' 個勢力'));
  assert.ok(lastDialog.includes(deleting.generals.length + ' 筆武將槽設定'));
  assert.ok(lastDialog.includes(deleting.cities.length + ' 筆據點設定'));
  assert.ok(lastDialog.includes('不刪遊戲主表或其它章節，不改已發布版本'));
  assert.equal(posts.length, beforeDeletePosts);
  assert.equal(JSON.stringify(data), beforeDelete, 'cancelled chapter deletion preserves all input data');
  dismissDialog = false;
  await panel.locator('[data-chapter-delete]').click(); await idle();
  assert.deepEqual(posts.at(-1), { module: 'chapters', patch: { delete: { chapterId: 'chapter-1' } } });
  assert.deepEqual(data.chapterOrder, []); assert.deepEqual(data.chapters, {});
  assert.equal(JSON.stringify({ generals: data.generals, cities: data.cities }), masterBeforeDelete);
  assert.equal(JSON.stringify(otherData), otherBeforeDelete);
  assert.equal(await panel.locator('[data-chapter-delete]').count(), 0, 'last chapter deletion re-reads the empty state');
  assert.equal(await panel.locator('[data-chapter-create]').isEnabled(), true, 'empty state still allows chapter creation');
  await page.locator('#menu [data-view="copy-game-editor"]').click(); await idle();
  await page.locator('#full-copy-name').fill('轉換提示');
  await page.locator('#full-copy-create').click(); await idle();
  assert.match(await page.locator('#full-copy-message').textContent(), /轉換明細/);
  await page.locator('#full-copy-conversion').click();
  const conversionReport = page.locator('#full-copy-conversion-details');
  await conversionReport.waitFor({ state: 'visible' });
  assert.match(await conversionReport.inputValue(), /未編號「<img src=x>很長的章節名稱」 → 1「章1」/);
  assert.match(await conversionReport.inputValue(), /首都校正城.*原始所屬值 1 → 0/);
  assert.match(await conversionReport.inputValue(), /勢力丟棄：2 項/);
  assert.match(await conversionReport.inputValue(), /保留原序號 2，丟棄 11（共用首都「建業」）/);
  assert.match(await conversionReport.inputValue(), /藏岷.*保留原序號 3，丟棄 12/);
  assert.doesNotMatch(await conversionReport.inputValue(), /private-receipt-id/);
  assert.equal(await page.locator('.el-dialog:visible img').count(), 0, 'receipt names remain escaped text');
  assert.equal(await conversionReport.getAttribute('readonly'), '', 'conversion report is read-only');
  assert.deepEqual(expectedRejections, [422, 422]);
  assert.ok(expectedRejectionLogs.length <= 2, 'only the two injected HTTP rejections may produce network console errors');
  assert.equal(await page.locator('#menu [data-view="deletion-editor"], #deletion-editor').count(), 0, 'standalone deletion module is removed');
  assert.equal(await page.locator('#menu [data-view="management-editor"]').count(), 1, 'publication review remains available');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('PASS CHAPTER-WB browser fixture (two expected HTTP 422): zero-chapter create/re-read, five tabs and directional diplomacy, label edit/dirty guard, paginated generals/cities, capital lock, viewport containment; no unexpected console/page/request errors.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
