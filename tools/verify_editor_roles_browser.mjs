// Actual owned Node/SQLite/FileBucket/HTTPS/login/fresh Chromium. No success API fixture.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
const round = process.argv[2], chapterActions = process.argv[3] === '--chapter-actions';
assert.ok(/^r[1-9][0-9]{0,3}$/.test(round ?? '') && (process.argv.length === 3 || chapterActions && process.argv.length === 4));
const output = `.dragon-analysis/editor-phase/roles-browser-${round}`; mkdirSync(output);
const own = mkdtempSync(join(tmpdir(), 'dragon-role-ui-'));
const port = Number(process.env.EDITOR_TEST_PORT); assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `https://127.0.0.1:${port}`, initial = `${randomBytes(24).toString('hex')}Aa1!`, password = `${randomBytes(24).toString('hex')}Aa1!`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['server/drafts.js','server/copyprofile.js','server/editorapp.js','server/admincopy.js','server/sourcecatalog.js','server/sourcecatalogpolicy.js','server/chaptergapreport.js','server/public/draft.txt','server/public/general.txt','editor-ui/src/GeneralsPanel.vue','server/public/client.txt','server/public/shell-ui.txt','server/public/shell-ui.css','editor-ui/src/ChapterRolesPanel.vue','editor-ui/src/DraftPanel.vue','editor-ui/src/CopyPanel.vue','editor-ui/src/copy.js','web/src/content/authoring/gamesource.js','web/src/content/authoring/factionconsistency.js','tools/editor_trusted_copy.mjs','tools/editor_stage_source.mjs','tools/editor_local_https.mjs','vps/editor-server.mjs','vps/sqlite-port.mjs','vps/file-bucket.mjs','tools/verify_editor_roles_browser.mjs'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
const storage = openStorage(join(own, 'authority.sqlite')), bucket = new FileBucket({ root: join(own, 'objects') });
let transport, browser, page;
const checks = [], errors = [], outside = [], expected = [], writes = [], draftReads = [], recoveries = [];
try {
  process.stderr.write('roles: staging fixed inputs\n');
  const source = await stageInstalledEditorSource({ get: key => bucket.get(key), put(key, bytes, options) {
    assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
    return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
  } });
  process.stderr.write('roles: inputs staged; starting owned HTTPS\n');
  const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
  const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
  transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ headless: true, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key))) });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
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
  page.on('request', request => { const url = new URL(request.url()); if (request.method() === 'GET' && url.pathname.endsWith('/draft')) draftReads.push(url.search); if (request.method() === 'POST' && url.pathname.endsWith('/draft/save')) writes.push({ key: request.headers()['idempotency-key'], revision: request.headers()['if-match'], body: request.postDataJSON() }); });
  const idle = () => page.waitForFunction(() => !document.querySelector('#logout').disabled);
  await page.goto(origin);
  await page.locator('#login [name=account]').fill('tianyi'); await page.locator('#login [name=password]').fill(initial); await page.locator('#login button').click();
  await page.locator('#password').waitFor({ state: 'visible' });
  await page.locator('#password [name=oldPassword]').fill(initial); await page.locator('#password [name=newPassword]').fill(password); await page.locator('#password [name=confirmPassword]').fill(password); await page.locator('#password button').click();
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle();
  await page.locator('#menu [data-view="copy"]').click(); await idle();
  await page.locator('#source-refresh').click(); await idle(); await page.locator('#source-install').click(); await idle();
  await page.locator('#copy-create [name=name]').fill('任官副本');
  const pendingCopy = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/admin/copies');
  await page.locator('#copy-create button').click(); const copy = await pendingCopy; assert.equal(copy.status(), 202);
  const { gameId } = await copy.json(); await idle(); await page.locator('#copy-run').click(); await idle();
  assert.match(await page.locator('#copy-state').textContent(), /已保存修訂 1/);
  await page.locator(`#own-games [data-game-id="${gameId}"]`).getByRole('button', { name: '測試運行', exact: true }).click(); await idle();
  await page.locator('#draft-load').click(); await idle();
  const exact = async revision => { const reply = await page.request.get(`${origin}/api/games/${gameId}/draft?revision=${revision}`, { timeout: 240000 }); assert.equal(reply.status(), 200); return reply.json(); };
  const first = await exact('1'); assert.equal(first.profileRevision, 'fixed-copy-resources-1'); assert.equal(first.chapters.length, 20);
  assert.equal(await page.locator('[data-role-chapter]').count(), 20);
  const restorableAdvisor = (row, faction) => Number.isInteger(faction.advisor_idx) && faction.advisor_idx >= 0 && faction.advisor_idx < 127 && row.generals.some(general => general.idx === faction.advisor_idx && general.faction === faction.slot) && row.factions.every(other => other.monarch_idx !== faction.advisor_idx && (other.slot === faction.slot || other.advisor_idx !== faction.advisor_idx));
  const freeCandidate = row => row.generals.find(general => Number.isInteger(general.idx) && general.idx >= 0 && general.idx < 127 && general.faction === null && row.factions.every(faction => faction.monarch_idx !== general.idx && faction.advisor_idx !== general.idx));
  process.stderr.write('roles: full copy and exact read1 ready\n');
  const chapter = first.chapters.find(row => freeCandidate(row) && row.factions.some(faction => restorableAdvisor(row, faction)));
  assert.ok(chapter);
  const faction = chapter.factions.find(faction => restorableAdvisor(chapter, faction));
  const group = () => page.locator(`[data-role-chapter="${chapter.chapterId}"]`);
  const row = () => group().locator(`[data-role-slot="${faction.slot}"]`);
  await group().locator('summary').click();
  assert.match(await row().locator('[data-role-advisor]').textContent(), new RegExp(`槽 ${faction.advisor_idx}`));
  checks.push('actual administrator login/password/source installation/full-copy UI; twenty chapter role projections, known ordinary advisor selected from actual saved data');
  await page.locator('#draft-name').fill('另表未存'); await page.locator('#draft-revision').fill('999');
  const resources = page.locator(`[data-resource-chapter="${chapter.chapterId}"]`);
  await resources.locator('summary').click(); await resources.locator(`[data-resource-slot="${faction.slot}"] input[name="money"]`).fill('777');
  if (chapterActions) {
    let snapshot = first;
    const saveURL = `${origin}/api/games/${gameId}/draft/save`;
    for (const action of ['clear', 'assignStrategist', 'assignMonarch', 'succeedMonarch', 'disband']) {
      const before = snapshot, current = before.chapters.find(item => item.chapterId === chapter.chapterId);
      const target = ['assignMonarch', 'succeedMonarch'].includes(action) ? freeCandidate(current)?.idx : faction.advisor_idx;
      assert.ok(Number.isInteger(target) && target < 127);
      const command = {
        clear: { op: 'set-strategist', generalIdx: null },
        assignStrategist: { op: 'set-strategist', generalIdx: target },
        assignMonarch: { op: 'set-monarch', generalIdx: target },
        succeedMonarch: { op: 'remove-monarch', resolution: { successor: target } },
        disband: { op: 'disband-faction', confirm: true },
      }[action];
      const edit = { ...command, chapterId: chapter.chapterId, factionIdx: faction.slot };
      let selector = `[data-role-action="${action}"]`;
      if (action === 'clear') selector = '[data-role-clear]';
      if (action === 'disband') selector = '[data-role-disband]';
      if (!await group().evaluate(element => element.open)) await group().locator('summary').click();
      const button = row().locator(selector), beforePosts = writes.length, beforeReads = draftReads.length;
      assert.equal(await button.isEnabled(), true);
      await page.locator('#draft-name').fill('章角色外未存'); await page.locator('#draft-revision').fill('999');
      if (!await resources.evaluate(element => element.open)) await resources.locator('summary').click();
      await resources.locator(`[data-resource-slot="${faction.slot}"] input[name="money"]`).fill('777');
      const prompts = !['clear', 'disband'].includes(action);
      page.once('dialog', dialog => dialog.dismiss()); await button.click(); await idle();
      if (prompts) {
        const cancel = dialog => dialog.type() === 'prompt' ? dialog.accept(String(target)) : dialog.dismiss();
        page.on('dialog', cancel); await button.click(); await idle(); page.off('dialog', cancel);
      }
      assert.equal(writes.length, beforePosts); assert.equal(draftReads.length, beforeReads);
      let committed, fault;
      await page.route(saveURL, async route => {
        try { const response = await route.fetch({ timeout: 240000 }); assert.equal(response.status(), 200); committed = await response.json(); }
        catch (error) { fault = error; }
        finally { await route.abort(); }
      });
      const accept = async dialog => {
        if (dialog.type() === 'prompt') { assert.match(dialog.message(), /0..126/); await dialog.accept(String(target)); }
        else { assert.match(dialog.message(), /不保存其它表單輸入/); await dialog.accept(); }
      };
      page.on('dialog', accept); await button.click(); await idle(); page.off('dialog', accept); if (fault) throw fault;
      const nextRevision = String(BigInt(before.draftRevision) + 1n), sent = writes.at(-1);
      assert.equal(committed.gameId, gameId); assert.equal(committed.draftRevision, nextRevision);
      assert.equal(writes.length, beforePosts + 1); assert.equal(sent.revision, `"${before.draftRevision}"`);
      assert.deepEqual(sent.body, { metadata: before.metadata, resourceEdits: [], chapterEdits: [edit] });
      assert.equal(draftReads.length, beforeReads); assert.equal(await button.count(), 0);
      assert.equal(await page.locator('#draft-role-unknown').count(), 1);
      assert.equal(await page.locator('#draft-name').inputValue(), '章角色外未存');
      assert.equal(await resources.locator(`[data-resource-slot="${faction.slot}"] input[name="money"]`).inputValue(), '777');
      await page.unroute(saveURL);
      process.stderr.write(`chapter roles: ${action} committed${nextRevision}; recovering original key\n`);
      const leave = dialog => dialog.accept(); page.on('dialog', leave);
      try { await page.reload(); } finally { page.off('dialog', leave); }
      await page.locator('#menu').waitFor({ state: 'visible' }); await idle();
      const resume = async dialog => { assert.equal(dialog.type(), 'confirm'); assert.match(dialog.message(), /未確認.*原鍵|副本輸入或原操作尚未完成/); await dialog.accept(); };
      page.on('dialog', resume);
      try { await page.locator('#menu [data-view="draft-editor"]').click(); await idle(); } finally { page.off('dialog', resume); }
      assert.equal(new URL(page.url()).hash, '#draft-editor');
      assert.equal(await page.locator('#draft-operation-retry').isDisabled(), true);
      const query = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + sent.key));
      await page.locator('#draft-operation-query').click(); await idle();
      const reply = await query; assert.equal(reply.status(), 200);
      const result = await reply.json(); assert.equal(result.state, 'committed'); assert.equal(result.result.draftRevision, nextRevision);
      assert.equal(writes.length, beforePosts + 1); assert.equal(draftReads.length, beforeReads);
      assert.equal(await page.locator('[data-role-action]').count(), 0);
      recoveries.push({ key: sent.key, operation: edit, committedRevision: nextRevision, queriedRevision: result.result.draftRevision, sourceReadsBeforeExplicitLoad: draftReads.length - beforeReads, browserPostsAfterRecovery: writes.length });
      await page.locator('#draft-load').click(); await idle(); snapshot = await exact(nextRevision);
      const actual = snapshot.chapters.find(item => item.chapterId === chapter.chapterId), wanted = structuredClone(current);
      const wantedFaction = wanted.factions.find(item => item.slot === faction.slot);
      if (command.op === 'set-strategist') wantedFaction.advisor_idx = command.generalIdx;
      else if (command.op === 'disband-faction') {
        wanted.factions = wanted.factions.filter(item => item.slot !== faction.slot);
        for (const general of wanted.generals) if (general.faction === faction.slot) general.faction = null;
        for (const city of wanted.cities) if (city.faction === faction.slot) city.faction = null;
      } else {
        wantedFaction.monarch_idx = target;
        wanted.generals.find(item => item.idx === target).faction = faction.slot;
      }
      const remainingFaction = wanted.factions.find(item => item.slot === faction.slot);
      const targetRefs = new Map([['GENERAL_FACTION_REF', `所屬勢力 #${faction.slot}`], ['GENERAL_MONARCH_REF', `勢力 #${faction.slot} 的君主`], ['GENERAL_ADVISOR_REF', `勢力 #${faction.slot} 的軍師`]]);
      for (const general of wanted.generals) {
        const refs = general.references.filter(reference => targetRefs.get(reference.code) !== reference.detail);
        if (general.faction === faction.slot) refs.push({ code: 'GENERAL_FACTION_REF', detail: targetRefs.get('GENERAL_FACTION_REF') });
        if (remainingFaction?.monarch_idx === general.idx) refs.push({ code: 'GENERAL_MONARCH_REF', detail: targetRefs.get('GENERAL_MONARCH_REF') });
        if (remainingFaction?.advisor_idx === general.idx) refs.push({ code: 'GENERAL_ADVISOR_REF', detail: targetRefs.get('GENERAL_ADVISOR_REF') });
        const after = actual.generals.find(item => item.idx === general.idx);
        assert.deepEqual(after.references.map(reference => JSON.stringify(reference)).sort(), refs.map(reference => JSON.stringify(reference)).sort());
        general.references = after.references;
      }
      assert.deepEqual({ ...actual, gaps: null }, { ...wanted, gaps: null });
      assert.equal(actual.gaps.saveGaps, current.gaps.saveGaps);
      const expectedStrongholds = structuredClone(before.strongholds);
      if (action === 'disband') {
        assert.ok(actual.gaps.activeGaps > 0);
        for (const city of expectedStrongholds) city.references = city.references.filter(reference => !(reference.chapterId === chapter.chapterId && (reference.code === 'CITY_FACTION_REF' && reference.detail === `所屬勢力：#${faction.slot}` || reference.code === 'CITY_CAPITAL_REF' && reference.detail === `勢力 #${faction.slot} 首都`)));
        assert.equal(await row().count(), 0);
      } else {
        assert.equal(await row().count(), 1);
        assert.equal(await row().locator(selector).isEnabled(), action !== 'clear');
      }
      assert.deepEqual(snapshot.strongholds, expectedStrongholds);
      assert.deepEqual(snapshot.chapters.filter(item => item.chapterId !== chapter.chapterId), before.chapters.filter(item => item.chapterId !== chapter.chapterId));
      for (const key of Object.keys(before).filter(key => !['chapters','strongholds','draftRevision','sourceDigest'].includes(key))) assert.deepEqual(snapshot[key], before[key], key);
      assert.deepEqual(await exact(before.draftRevision), before);
      if (action === 'assignStrategist') assert.deepEqual({ ...snapshot, draftRevision: first.draftRevision }, first);
      checks.push(`chapter-page ${action}: cancelled without write, exact saved CAS/body excludes dirty inputs; real committed response dropped`);
      checks.push(`chapter-page ${action}: original-key query with no repeated POST or automatic source read; explicit read${nextRevision}, full projected change set and immutable predecessor verified`);
      process.stderr.write(`chapter roles: ${action} read${nextRevision} and predecessor verified\n`);
    }
    assert.equal(writes.length, 5); assert.equal(new Set(writes.map(write => write.key)).size, 5);
    assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)), digest, path);
    const screenshot = await page.locator('#draft-role-editor').screenshot(); writeFileSync(join(output, 'roles.png'), screenshot, { flag: 'wx' });
    writeFileSync(join(output, 'receipt.json'), JSON.stringify({ checks, writes, recoveries, draftReads, disbandGaps: snapshot.chapters.find(item => item.chapterId === chapter.chapterId).gaps, expected, errors, outside, sourceHashes, screenshotSha: sha(screenshot), scope: 'Chapter-management page, five shared role actions and original-key recovery; owned Node HTTPS/full-copy administrator, real authentication and fresh Chromium. Named projected fields, not raw/native initialization, Trial, publication or production.' }, null, 2), { flag: 'wx' });
    process.stdout.write(JSON.stringify({ checks: checks.length, output }) + '\n');
  } else {
  const enterGenerals = async () => {
    const accept = dialog => dialog.accept();
    page.on('dialog', accept);
    try { await page.locator('#menu [data-view="generals-editor"]').click(); await idle(); } finally { page.off('dialog', accept); }
  };
  await enterGenerals(); await page.locator('#generals-refresh').click(); await idle();
  await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  const clear = () => page.locator(`[data-faction-idx="${faction.slot}"] [data-native-advisor-clear]`);
  assert.equal(await clear().isEnabled(), true);
  page.once('dialog', dialog => dialog.dismiss()); await clear().click(); await idle(); assert.equal(writes.length, 0);
  const saveURL = `${origin}/api/games/${gameId}/draft/save`; let committed, fault;
  const dropCommittedResponse = async route => { try { const reply = await route.fetch({ timeout: 240000 }); assert.equal(reply.status(), 200); committed = await reply.json(); } catch (error) { fault = error; } finally { await route.abort(); } };
  await page.route(saveURL, dropCommittedResponse);
  page.once('dialog', dialog => dialog.accept()); await clear().click(); await idle(); if (fault) throw fault;
  assert.equal(committed.draftRevision, '2'); assert.equal(writes.length, 1); assert.equal(writes[0].revision, '"1"');
  assert.deepEqual(writes[0].body, { metadata: first.metadata, resourceEdits: [], chapterEdits: [{ op: 'set-strategist', chapterId: chapter.chapterId, factionIdx: faction.slot, generalIdx: null }] });
  assert.equal(await clear().isDisabled(), true);
  assert.equal(await page.locator('[data-native-general-rename]').first().isDisabled(), true);
  assert.match(await page.locator('#generals-context').textContent(), /已讀取修訂 1/);
  assert.equal(await page.locator('#draft-name').inputValue(), '另表未存');
  assert.equal(await resources.locator(`[data-resource-slot="${faction.slot}"] input[name="money"]`).inputValue(), '777');
  checks.push('cancel no write; one exact revision1 POST excludes dirty metadata/resources; real commit2 response dropped only at browser, no optimistic role result');
  await page.unroute(saveURL);
  const unload = dialog => dialog.accept(); page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  // Explicit generals navigation may already be restored from the URL.
  // Visiting the same view does not require the old shortcut's two leave dialogs.
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle();
  const leaveMessages = []; let leaveError;
  const acceptLeave = async dialog => { try { assert.match(dialog.message(), /未確認.*原鍵|副本輸入或原操作尚未完成/); leaveMessages.push(dialog.message()); await dialog.accept(); } catch (error) { leaveError = error; await dialog.dismiss(); } };
  page.on('dialog', acceptLeave);
  try { await page.locator('#menu [data-view="generals-editor"]').click(); await idle(); } finally { page.off('dialog', acceptLeave); }
  if (leaveError) throw leaveError;
  assert.equal(new URL(page.url()).hash, '#generals-editor');
  await page.locator('#generals-editor').waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  const queryResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + writes[0].key));
  await page.locator('#native-general-query').click(); await idle();
  const recovered = await queryResponse; assert.equal(recovered.status(), 200);
  const recovery = await recovered.json(); assert.equal(recovery.state, 'committed'); assert.equal(recovery.result.draftRevision, '2');
  assert.equal(await page.locator('[data-native-advisor-clear]').count(), 0);
  await page.locator('#native-general-load').click(); await idle(); const second = await exact('2');
  assert.equal(await page.locator('[data-native-advisor-clear]').count(), 0);
  await page.locator('#generals-refresh').click(); await idle(); await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  assert.equal(writes.length, 1);
  const factionRow = page.locator(`[data-faction-idx="${faction.slot}"]`);
  assert.equal((await factionRow.locator('td').nth(2).textContent()).trim(), '無');
  assert.equal(await clear().isDisabled(), true);
  assert.equal(await page.locator('[data-native-general-rename]').first().isEnabled(), true);
  const changed = second.chapters.find(item => item.chapterId === chapter.chapterId), expectedChapter = structuredClone(chapter);
  expectedChapter.factions.find(item => item.slot === faction.slot).advisor_idx = null;
  const formerAdvisor = expectedChapter.generals.find(item => item.idx === faction.advisor_idx);
  const affectedReference = reference => reference.code === 'GENERAL_ADVISOR_REF' && reference.detail === `勢力 #${faction.slot} 的軍師`;
  assert.equal(formerAdvisor.references.filter(affectedReference).length, 1);
  formerAdvisor.references = formerAdvisor.references.filter(reference => !affectedReference(reference));
  assert.deepEqual({ ...changed, gaps: null }, { ...expectedChapter, gaps: null });
  assert.equal(changed.gaps.saveGaps, chapter.gaps.saveGaps);
  assert.ok(changed.gaps.details.active.some(gap => gap.code === 'entity-native-mismatch'));
  assert.deepEqual(second.chapters.filter(item => item.chapterId !== chapter.chapterId), first.chapters.filter(item => item.chapterId !== chapter.chapterId));
  for (const key of Object.keys(first).filter(key => !['chapters','draftRevision','sourceDigest'].includes(key))) assert.deepEqual(second[key], first[key], key);
  assert.deepEqual(await exact('1'), first);
  checks.push('generals-page shared clear: refresh restores original key only; query then exact shared read2 plus independent table read renders null; other projections and old1 unchanged, native mismatch explicit, not playable initialization');
  // Reappoint the original ordinary advisor: actual saved affiliation and
  // absence of another monarch/advisor post were checked above, not invented.
  const assign = () => page.locator(`[data-faction-idx="${faction.slot}"] [data-native-advisor-assign]`);
  assert.equal(await assign().isEnabled(), true);
  page.on('dialog', unload);
  try { await page.locator('#menu [data-view="draft-editor"]').click(); await idle(); } finally { page.off('dialog', unload); }
  assert.equal(new URL(page.url()).hash, '#draft-editor');
  await page.locator('#draft-name').fill('任命外未存'); await enterGenerals();
  await page.locator('#native-general-revision').fill('999');
  const readsBeforeAssignment = draftReads.length;
  page.once('dialog', dialog => dialog.dismiss()); await assign().click(); await idle();
  const cancelAssignment = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(faction.advisor_idx)); else await dialog.dismiss(); };
  page.on('dialog', cancelAssignment); await assign().click(); await idle(); page.off('dialog', cancelAssignment);
  assert.equal(writes.length, 1); assert.equal(draftReads.length, readsBeforeAssignment);
  committed = undefined; fault = undefined; await page.route(saveURL, dropCommittedResponse);
  const confirmAssignment = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(faction.advisor_idx)); else { assert.match(dialog.message(), /服務校驗/); await dialog.accept(); } };
  page.on('dialog', confirmAssignment); await assign().click(); await idle(); page.off('dialog', confirmAssignment); if (fault) throw fault;
  assert.equal(committed.gameId, gameId); assert.equal(committed.draftRevision, '3');
  assert.equal(writes.length, 2); assert.notEqual(writes[1].key, writes[0].key); assert.equal(writes[1].revision, '"2"');
  assert.deepEqual(writes[1].body, { metadata: second.metadata, resourceEdits: [], chapterEdits: [{ op: 'set-strategist', chapterId: chapter.chapterId, factionIdx: faction.slot, generalIdx: faction.advisor_idx }] });
  assert.equal(draftReads.length, readsBeforeAssignment); assert.equal(await assign().isDisabled(), true);
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  assert.equal(await page.locator('#draft-name').inputValue(), '任命外未存');
  assert.equal((await factionRow.locator('td').nth(2).textContent()).trim(), '無');
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle(); await enterGenerals();
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  const assignmentQuery = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + writes[1].key));
  await page.locator('#native-general-query').click(); await idle();
  const assignmentReply = await assignmentQuery; assert.equal(assignmentReply.status(), 200);
  const assignmentRecovery = await assignmentReply.json(); assert.equal(assignmentRecovery.state, 'committed'); assert.equal(assignmentRecovery.result.draftRevision, '3');
  assert.equal(writes.length, 2); assert.equal(draftReads.length, readsBeforeAssignment);
  assert.equal(await page.locator('[data-native-advisor-assign]').count(), 0);
  recoveries.push({ key: writes[1].key, operation: writes[1].body.chapterEdits[0], committedRevision: '3', queriedRevision: assignmentRecovery.result.draftRevision, sourceReadsBeforeExplicitLoad: draftReads.length - readsBeforeAssignment, browserPostsAfterRecovery: writes.length });
  await page.locator('#native-general-load').click(); await idle();
  assert.equal(await page.locator('[data-native-advisor-assign]').count(), 0);
  await page.locator('#generals-refresh').click(); await idle(); await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  assert.equal((await factionRow.locator('td').nth(2).textContent()).trim(), String(faction.advisor_idx));
  assert.equal(await assign().isEnabled(), true); assert.equal(await clear().isEnabled(), true);
  const third = await exact('3');
  assert.deepEqual({ ...third, draftRevision: first.draftRevision }, first);
  assert.deepEqual(await exact('2'), second); assert.deepEqual(await exact('1'), first);
  assert.equal(writes.length, 2);
  checks.push('actual shared assignment2 to3 restores original same-faction ordinary advisor; prompt/confirm cancellations write nothing, typed999 and dirty metadata excluded, committed response dropped without optimistic display');
  checks.push('assignment reload queries distinct original key only with zero source GET/extra POST; explicit shared read3 and independent table read restore buttons; complete original DTO/source digest and immutable1/2 preserved, not native initialization');
  process.stderr.write('roles: advisor recovery read3 verified\n');
  const candidate = freeCandidate(chapter); assert.ok(candidate);
  const monarchButton = () => page.locator(`[data-faction-idx="${faction.slot}"] [data-native-monarch-assign]`);
  assert.equal(await monarchButton().isEnabled(), true);
  page.on('dialog', unload);
  try { await page.locator('#menu [data-view="draft-editor"]').click(); await idle(); } finally { page.off('dialog', unload); }
  await page.locator('#draft-name').fill('君主外未存'); await enterGenerals(); await page.locator('#native-general-revision').fill('999');
  const beforeMonarchReads = draftReads.length;
  page.once('dialog', dialog => dialog.dismiss()); await monarchButton().click(); await idle();
  const cancelMonarch = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(candidate.idx)); else await dialog.dismiss(); };
  page.on('dialog', cancelMonarch); await monarchButton().click(); await idle(); page.off('dialog', cancelMonarch);
  assert.equal(writes.length, 2); assert.equal(draftReads.length, beforeMonarchReads);
  committed = undefined; fault = undefined; await page.route(saveURL, dropCommittedResponse);
  const confirmMonarch = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(candidate.idx)); else { assert.match(dialog.message(), /自由武將.*服務校驗/); await dialog.accept(); } };
  page.on('dialog', confirmMonarch); await monarchButton().click(); await idle(); page.off('dialog', confirmMonarch); if (fault) throw fault;
  assert.equal(committed.gameId, gameId); assert.equal(committed.draftRevision, '4');
  assert.equal(writes.length, 3); assert.equal(new Set(writes.map(write => write.key)).size, 3); assert.equal(writes[2].revision, '"3"');
  assert.deepEqual(writes[2].body, { metadata: third.metadata, resourceEdits: [], chapterEdits: [{ op: 'set-monarch', chapterId: chapter.chapterId, factionIdx: faction.slot, generalIdx: candidate.idx }] });
  assert.equal(draftReads.length, beforeMonarchReads); assert.equal(await monarchButton().isDisabled(), true);
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true); assert.equal(await page.locator('#draft-name').inputValue(), '君主外未存');
  assert.equal((await factionRow.locator('td').nth(1).textContent()).trim(), '#' + faction.monarch_idx);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle(); await enterGenerals();
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  const monarchQuery = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + writes[2].key));
  await page.locator('#native-general-query').click(); await idle();
  const monarchReply = await monarchQuery; assert.equal(monarchReply.status(), 200);
  const monarchRecovery = await monarchReply.json(); assert.equal(monarchRecovery.state, 'committed'); assert.equal(monarchRecovery.result.draftRevision, '4');
  assert.equal(writes.length, 3); assert.equal(draftReads.length, beforeMonarchReads);
  assert.equal(await page.locator('[data-native-monarch-assign]').count(), 0);
  recoveries.push({ key: writes[2].key, operation: writes[2].body.chapterEdits[0], committedRevision: '4', queriedRevision: monarchRecovery.result.draftRevision, sourceReadsBeforeExplicitLoad: draftReads.length - beforeMonarchReads, browserPostsAfterRecovery: writes.length });
  await page.locator('#native-general-load').click(); await idle(); assert.equal(await page.locator('[data-native-monarch-assign]').count(), 0);
  await page.locator('#generals-refresh').click(); await idle(); await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  assert.equal((await factionRow.locator('td').nth(1).textContent()).trim(), '#' + candidate.idx);
  assert.equal(await monarchButton().isEnabled(), true); assert.equal(await assign().isEnabled(), true);
  const fourth = await exact('4'), fourthChapter = fourth.chapters.find(row => row.chapterId === chapter.chapterId);
  const expectedMonarchChapter = structuredClone(chapter);
  expectedMonarchChapter.factions.find(row => row.slot === faction.slot).monarch_idx = candidate.idx;
  expectedMonarchChapter.generals.find(row => row.idx === candidate.idx).faction = faction.slot;
  const monarchReference = { code: 'GENERAL_MONARCH_REF', detail: `勢力 #${faction.slot} 的君主` };
  for (const idx of [faction.monarch_idx, candidate.idx]) {
    const before = expectedMonarchChapter.generals.find(row => row.idx === idx), after = fourthChapter.generals.find(row => row.idx === idx);
    const refs = before.references.filter(reference => reference.code !== monarchReference.code || reference.detail !== monarchReference.detail);
    if (idx === candidate.idx) refs.push(monarchReference, { code: 'GENERAL_FACTION_REF', detail: `所屬勢力 #${faction.slot}` });
    assert.deepEqual(after.references.map(reference => JSON.stringify(reference)).sort(), refs.map(reference => JSON.stringify(reference)).sort());
    // Only the separately checked references are substituted for the whole DTO comparison.
    before.references = after.references;
  }
  assert.deepEqual({ ...fourthChapter, gaps: null }, { ...expectedMonarchChapter, gaps: null });
  assert.equal(fourthChapter.gaps.saveGaps, chapter.gaps.saveGaps);
  assert.ok(fourthChapter.gaps.details.active.some(gap => gap.code === 'entity-native-mismatch'));
  assert.deepEqual(fourth.chapters.filter(row => row.chapterId !== chapter.chapterId), third.chapters.filter(row => row.chapterId !== chapter.chapterId));
  for (const key of Object.keys(third).filter(key => !['chapters','draftRevision','sourceDigest'].includes(key))) assert.deepEqual(fourth[key], third[key], key);
  assert.deepEqual(await exact('3'), third); assert.deepEqual(await exact('2'), second); assert.deepEqual(await exact('1'), first);
  assert.equal(writes.length, 3);
  checks.push('actual free ordinary candidate monarch3 to4: prompt/confirm cancellation writes nothing, exact CAS and saved metadata, committed response dropped without optimistic table or automatic read');
  checks.push('monarch reload queries original third key with zero extra save/source GET; explicit shared/table reads update named membership/monarch and references only, old1/2/3 and other chapters preserved; native mismatch remains explicit');
  process.stderr.write('roles: monarch recovery read4 verified; starting succession\n');
  const successor = freeCandidate(fourthChapter); assert.ok(successor); assert.notEqual(successor.idx, candidate.idx);
  const successionButton = () => page.locator(`[data-faction-idx="${faction.slot}"] [data-native-monarch-succeed]`);
  assert.equal(await successionButton().isEnabled(), true);
  page.on('dialog', unload);
  try { await page.locator('#menu [data-view="draft-editor"]').click(); await idle(); } finally { page.off('dialog', unload); }
  await page.locator('#draft-name').fill('繼任外未存'); await enterGenerals(); await page.locator('#native-general-revision').fill('999');
  const beforeSuccessionReads = draftReads.length;
  page.once('dialog', dialog => dialog.dismiss()); await successionButton().click(); await idle();
  const cancelSuccession = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(successor.idx)); else await dialog.dismiss(); };
  page.on('dialog', cancelSuccession); await successionButton().click(); await idle(); page.off('dialog', cancelSuccession);
  assert.equal(writes.length, 3); assert.equal(draftReads.length, beforeSuccessionReads);
  committed = undefined; fault = undefined; await page.route(saveURL, dropCommittedResponse);
  const confirmSuccession = async dialog => { if (dialog.type() === 'prompt') await dialog.accept(String(successor.idx)); else { assert.match(dialog.message(), /接任.*不解散勢力.*服務校驗/); await dialog.accept(); } };
  page.on('dialog', confirmSuccession); await successionButton().click(); await idle(); page.off('dialog', confirmSuccession); if (fault) throw fault;
  assert.equal(committed.gameId, gameId); assert.equal(committed.draftRevision, '5');
  process.stderr.write('roles: succession committed5; recovering original key\n');
  assert.equal(writes.length, 4); assert.equal(new Set(writes.map(write => write.key)).size, 4); assert.equal(writes[3].revision, '"4"');
  assert.deepEqual(writes[3].body, { metadata: fourth.metadata, resourceEdits: [], chapterEdits: [{ op: 'remove-monarch', chapterId: chapter.chapterId, factionIdx: faction.slot, resolution: { successor: successor.idx } }] });
  assert.equal(draftReads.length, beforeSuccessionReads); assert.equal(await successionButton().isDisabled(), true);
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true); assert.equal(await page.locator('#draft-name').inputValue(), '繼任外未存');
  assert.equal((await factionRow.locator('td').nth(1).textContent()).trim(), '#' + candidate.idx);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle(); await enterGenerals();
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  const successionQuery = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + writes[3].key));
  await page.locator('#native-general-query').click(); await idle();
  const successionReply = await successionQuery; assert.equal(successionReply.status(), 200);
  const successionRecovery = await successionReply.json(); assert.equal(successionRecovery.state, 'committed'); assert.equal(successionRecovery.result.draftRevision, '5');
  assert.equal(writes.length, 4); assert.equal(draftReads.length, beforeSuccessionReads);
  assert.equal(await page.locator('[data-native-monarch-succeed]').count(), 0);
  recoveries.push({ key: writes[3].key, operation: writes[3].body.chapterEdits[0], committedRevision: '5', queriedRevision: successionRecovery.result.draftRevision, sourceReadsBeforeExplicitLoad: draftReads.length - beforeSuccessionReads, browserPostsAfterRecovery: writes.length });
  await page.locator('#native-general-load').click(); await idle(); assert.equal(await page.locator('[data-native-monarch-succeed]').count(), 0);
  await page.locator('#generals-refresh').click(); await idle(); await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  assert.equal((await factionRow.locator('td').nth(1).textContent()).trim(), '#' + successor.idx);
  assert.equal(await successionButton().isEnabled(), true); assert.equal(await monarchButton().isEnabled(), true);
  const fifth = await exact('5'), fifthChapter = fifth.chapters.find(row => row.chapterId === chapter.chapterId);
  const expectedSuccession = structuredClone(fourthChapter);
  expectedSuccession.factions.find(row => row.slot === faction.slot).monarch_idx = successor.idx;
  expectedSuccession.generals.find(row => row.idx === successor.idx).faction = faction.slot;
  for (const idx of [candidate.idx, successor.idx]) {
    const before = expectedSuccession.generals.find(row => row.idx === idx), after = fifthChapter.generals.find(row => row.idx === idx);
    const refs = before.references.filter(reference => reference.code !== monarchReference.code || reference.detail !== monarchReference.detail);
    if (idx === successor.idx) refs.push(monarchReference, { code: 'GENERAL_FACTION_REF', detail: `所屬勢力 #${faction.slot}` });
    assert.deepEqual(after.references.map(reference => JSON.stringify(reference)).sort(), refs.map(reference => JSON.stringify(reference)).sort());
    before.references = after.references;
  }
  assert.deepEqual({ ...fifthChapter, gaps: null }, { ...expectedSuccession, gaps: null });
  assert.equal(fifthChapter.generals.find(row => row.idx === candidate.idx).faction, faction.slot);
  assert.equal(fifthChapter.gaps.saveGaps, fourthChapter.gaps.saveGaps);
  assert.ok(fifthChapter.gaps.details.active.some(gap => gap.code === 'entity-native-mismatch'));
  assert.deepEqual(fifth.chapters.filter(row => row.chapterId !== chapter.chapterId), fourth.chapters.filter(row => row.chapterId !== chapter.chapterId));
  for (const key of Object.keys(fourth).filter(key => !['chapters','draftRevision','sourceDigest'].includes(key))) assert.deepEqual(fifth[key], fourth[key], key);
  assert.deepEqual(await exact('4'), fourth); assert.deepEqual(await exact('3'), third); assert.deepEqual(await exact('2'), second); assert.deepEqual(await exact('1'), first);
  assert.equal(writes.length, 4);
  checks.push('actual explicit successor4 to5: prompt/confirm cancellations write nothing; remove-monarch resolution only, saved metadata/CAS4 excludes typed999 and dirty input; committed response dropped without optimistic table');
  checks.push('succession reload queries original fourth key with zero extra save/source GET; explicit shared/table reads change named monarch/new membership/references, retain former monarch affiliation and faction, old1/2/3/4 and other chapters; native mismatch explicit');
  process.stderr.write('roles: succession read5 verified; starting disband\n');
  const disbandButton = () => page.locator(`[data-faction-idx="${faction.slot}"] [data-native-faction-disband]`);
  assert.equal(await disbandButton().isEnabled(), true);
  page.on('dialog', unload);
  try { await page.locator('#menu [data-view="draft-editor"]').click(); await idle(); } finally { page.off('dialog', unload); }
  await page.locator('#draft-name').fill('解散外未存'); await enterGenerals(); await page.locator('#native-general-revision').fill('999');
  const beforeDisbandReads = draftReads.length;
  page.once('dialog', dialog => dialog.dismiss()); await disbandButton().click(); await idle();
  assert.equal(writes.length, 4); assert.equal(draftReads.length, beforeDisbandReads);
  committed = undefined; fault = undefined; await page.route(saveURL, dropCommittedResponse);
  page.once('dialog', async dialog => { assert.match(dialog.message(), /解散.*成員轉自由.*據點轉中立.*只作用於本章/); await dialog.accept(); });
  await disbandButton().click(); await idle(); if (fault) throw fault;
  assert.equal(committed.gameId, gameId); assert.equal(committed.draftRevision, '6');
  process.stderr.write('roles: disband committed6; recovering original key\n');
  assert.equal(writes.length, 5); assert.equal(new Set(writes.map(write => write.key)).size, 5); assert.equal(writes[4].revision, '"5"');
  assert.deepEqual(writes[4].body, { metadata: fifth.metadata, resourceEdits: [], chapterEdits: [{ op: 'disband-faction', chapterId: chapter.chapterId, factionIdx: faction.slot, confirm: true }] });
  assert.equal(draftReads.length, beforeDisbandReads); assert.equal(await disbandButton().isDisabled(), true);
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true); assert.equal(await page.locator('#draft-name').inputValue(), '解散外未存');
  assert.equal((await factionRow.locator('td').nth(1).textContent()).trim(), '#' + successor.idx);
  await page.unroute(saveURL);
  page.on('dialog', unload); try { await page.reload(); } finally { page.off('dialog', unload); }
  await page.locator('#menu').waitFor({ state: 'visible' }); await idle(); await enterGenerals();
  assert.equal(await page.locator('#native-general-retry').isDisabled(), true);
  const disbandQuery = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/draft/operations/' + writes[4].key));
  await page.locator('#native-general-query').click(); await idle();
  const disbandReply = await disbandQuery; assert.equal(disbandReply.status(), 200);
  const disbandRecovery = await disbandReply.json(); assert.equal(disbandRecovery.state, 'committed'); assert.equal(disbandRecovery.result.draftRevision, '6');
  process.stderr.write('roles: disband original key recovered; loading exact6\n');
  assert.equal(writes.length, 5); assert.equal(draftReads.length, beforeDisbandReads);
  assert.equal(await page.locator('[data-native-faction-disband]').count(), 0);
  recoveries.push({ key: writes[4].key, operation: writes[4].body.chapterEdits[0], committedRevision: '6', queriedRevision: disbandRecovery.result.draftRevision, sourceReadsBeforeExplicitLoad: draftReads.length - beforeDisbandReads, browserPostsAfterRecovery: writes.length });
  await page.locator('#native-general-load').click(); await idle(); assert.equal(await page.locator('[data-native-faction-disband]').count(), 0);
  await page.locator('#generals-refresh').click(); await idle(); await page.locator('#generals-chapter').selectOption(chapter.chapterId);
  assert.equal(await factionRow.count(), 0);
  process.stderr.write('roles: disband shared/table reads complete; checking exact DTO6\n');
  const sixth = await exact('6'), sixthChapter = sixth.chapters.find(row => row.chapterId === chapter.chapterId);
  const expectedDisband = structuredClone(fifthChapter);
  assert.ok(expectedDisband.generals.some(row => row.faction === faction.slot));
  assert.ok(expectedDisband.cities.some(row => row.faction === faction.slot));
  expectedDisband.factions = expectedDisband.factions.filter(row => row.slot !== faction.slot);
  const removedGeneralRefs = new Map([['GENERAL_FACTION_REF', `所屬勢力 #${faction.slot}`], ['GENERAL_MONARCH_REF', `勢力 #${faction.slot} 的君主`], ['GENERAL_ADVISOR_REF', `勢力 #${faction.slot} 的軍師`]]);
  for (const general of expectedDisband.generals) {
    if (general.faction === faction.slot) general.faction = null;
    general.references = general.references.filter(reference => removedGeneralRefs.get(reference.code) !== reference.detail);
  }
  for (const city of expectedDisband.cities) if (city.faction === faction.slot) city.faction = null;
  assert.deepEqual({ ...sixthChapter, gaps: null }, { ...expectedDisband, gaps: null });
  assert.equal(sixthChapter.gaps.saveGaps, fifthChapter.gaps.saveGaps);
  // Disband removes a faction; do not require the surviving-post diagnostic
  // from earlier assignment steps in this bounded report. Preserve the report.
  assert.ok(sixthChapter.gaps.activeGaps > 0);
  assert.deepEqual(sixth.chapters.filter(row => row.chapterId !== chapter.chapterId), fifth.chapters.filter(row => row.chapterId !== chapter.chapterId));
  const strongholds = fifth.strongholds.map(row => ({ ...row, references: row.references.filter(reference => !(reference.chapterId === chapter.chapterId && (reference.code === 'CITY_FACTION_REF' && reference.detail === `所屬勢力：#${faction.slot}` || reference.code === 'CITY_CAPITAL_REF' && reference.detail === `勢力 #${faction.slot} 首都`))) }));
  assert.deepEqual(sixth.strongholds, strongholds);
  for (const key of Object.keys(fifth).filter(key => !['chapters','strongholds','draftRevision','sourceDigest'].includes(key))) assert.deepEqual(sixth[key], fifth[key], key);
  process.stderr.write('roles: disband DTO6 verified; checking immutable previous5\n');
  // Earlier steps already checked 1..4 at their boundaries; this final step
  // checks its immediate immutable predecessor rather than re-running all reads.
  assert.deepEqual(await exact('5'), fifth);
  assert.equal(writes.length, 5);
  checks.push('actual shared disband5 to6: cancellation zero writes, saved metadata/CAS5 excludes typed999 and dirty input; real commit response dropped, old faction remains until explicit read');
  checks.push('disband original fifth key recovery adds no POST/source GET; explicit shared and table read removes faction, only its named memberships/city owners and derived references change; other chapters and previous5 preserved (1-4 checked before disband), active admission gaps remain (full projected report retained)');
  assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)), digest, path);
  const screenshot = await page.locator('#generals-chapters').screenshot(); writeFileSync(join(output, 'roles.png'), screenshot, { flag: 'wx' });
  writeFileSync(join(output, 'receipt.json'), JSON.stringify({ checks, writes, recoveries, draftReads, disbandGaps: sixthChapter.gaps, expected, errors, outside, sourceHashes, screenshotSha: sha(screenshot), scope: 'Generals-page shared advisor clear/reappointment, free-candidate monarch appointment, explicit succession and disband with original-key recovery; owned Node HTTPS/full-copy administrator; named roles only, no native initialization, Trial/publication or production' }, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ checks: checks.length, output }) + '\n');
  }
} catch (error) {
  let display;
  try { display = await page?.evaluate(() => ({ hash: location.hash, status: document.querySelector('#status')?.textContent, draft: document.querySelector('#draft-status')?.textContent, hidden: document.querySelector('#draft-editor')?.hidden })); } catch { /* Owned page may have closed. */ }
  process.stderr.write(JSON.stringify({ checks: checks.length, display, errors, outside }) + '\n'); throw error;
} finally { await browser?.close(); try { await transport?.close(); } finally { storage.close(); } }
