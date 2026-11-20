// Real editor shell + owned HTTPS/auth/SQLite. No API mocks or user browser profile.
import assert from 'node:assert/strict';

export async function verifyChapterEditorHTTPBrowser({ origin, cookie, gameId, source, read }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const errors = [], outside = [], writes = [];
  const equals = cookie.indexOf('=');
  assert.ok(equals > 0);
  await context.addCookies([{ name: cookie.slice(0, equals), value: cookie.slice(equals + 1), url: origin, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { outside.push(url.href); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const copyPath = `/api/games/${gameId}/copy`;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === copyPath) writes.push(request.postDataJSON());
  });
  page.on('dialog', dialog => dialog.accept());
  const idle = () => page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
  const saved = async action => {
    await Promise.all([
      ...['POST', 'GET'].map(method => page.waitForResponse(response => new URL(response.url()).pathname === copyPath && response.request().method() === method)
        .then(response => assert.equal(response.status(), 200, `${method} copy must succeed`))),
      action(),
    ]);
    await idle();
  };
  try {
    await page.goto(origin);
    await page.locator('#identity').filter({ hasText: 'tianyi' }).waitFor(); await idle();
    await page.getByRole('button', { name: '重新整理', exact: true }).first().click(); await idle();
    await page.locator('.current-game .el-select').click();
    await page.getByRole('option', { name: source.metadata.name, exact: true }).click(); await idle();
    await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
    await page.locator('#stronghold-load').click(); await idle();
    await page.locator('#menu [data-view="chapters-editor"]').click(); await idle();
    const panel = page.locator('#chapters-editor');
    const [firstId, secondId] = source.chapterOrder;
    const first = source.chapters[firstId], second = source.chapters[secondId];
    const chooseChapter = async name => {
      await panel.locator('.el-select').filter({ has: page.locator('#chapters-select') }).click();
      // Option text is the three-part number/name/date label; match the chapter name part.
      await page.getByRole('option', { name }).click(); await idle();
    };
    await chooseChapter(first.name);
    assert.deepEqual(await panel.getByRole('tab').allTextContents(), ['章節管理', '勢力設置', '勢力武將', '外交關係', '勢力據點']);
    for (const name of ['實測甲', first.name]) {
      await panel.locator('[data-chapter-name]').fill(name);
      await saved(() => panel.locator('[data-chapter-form-save]').click());
      assert.equal(await panel.locator('[data-chapter-form-save]').isDisabled(), true, 'merged save clears the form dirty state');
      assert.equal((await read()).data.chapters[firstId].name, name);
    }
    await panel.getByRole('tab', { name: '勢力設置', exact: true }).click();
    const factions = panel.locator('#pane-factions');
    for (const trust of [17, first.state.factions[0].playerOpening.trust]) {
      await factions.locator('[data-opening-edit]').first().click();
      await factions.locator('[data-opening-input="trust"]').fill(String(trust));
      await saved(() => factions.locator('[data-opening-save]').click());
      await factions.locator('[data-opening-edit]').first().waitFor();
      assert.equal((await read()).data.chapters[firstId].state.factions[0].playerOpening.trust, trust);
    }
    await chooseChapter(second.name);
    await panel.getByRole('tab', { name: '勢力武將', exact: true }).click();
    const general = panel.locator('#pane-generals .el-table__row').filter({ has: page.locator('[data-general-slot="0"]') });
    for (const months of [3, second.state.generals[0].appear_months]) {
      await general.locator('[data-arrival-edit]').click();
      await general.locator('[data-arrival-months] input').fill(String(months));
      await saved(() => general.locator('[data-arrival-save]').click());
      await general.locator('[data-arrival-edit]').waitFor();
      assert.equal((await read()).data.chapters[secondId].state.generals[0].appear_months, months);
    }
    await chooseChapter(first.name);
    await panel.getByRole('tab', { name: '勢力據點', exact: true }).click();
    const city = panel.locator('#pane-cities .el-table__row').filter({ has: page.locator('[data-city-idx="2"]') });
    const lord = source.generals[first.state.generals[first.state.factions[0].monarch_idx].generalId].name;
    for (const [label, owner] of [[lord, 0], ['空城', null]]) {
      await saved(async () => {
        await city.locator('[data-number-edit]').click();
        await city.locator('[data-city-faction]').click();
        await page.getByRole('option', { name: label, exact: true }).click();
        await city.locator('[data-number-save]').click();
      });
      assert.equal((await read()).data.chapters[firstId].state.cities[2].faction, owner);
    }
    await panel.getByRole('tab', { name: '外交關係', exact: true }).click();
    for (const [label, raw] of [['良好', 204], ['普通', 183]]) {
      await saved(async () => {
        await panel.locator('[data-diplomacy-cell="0-1"]').click();
        await page.getByRole('option', { name: label, exact: true }).click();
      });
      assert.equal((await read()).data.chapters[firstId].state.diplomacy[0][1], raw);
    }
    assert.equal(writes.length, 10, 'five tabs each save a change and restore through the real API');
    assert.deepEqual((await read()).data, source, 'all authored data, other chapter and master tables restored exactly');
    assert.deepEqual(outside, []); assert.deepEqual(errors, []);
    console.log('PASS CHAPTER-WB real editor HTTPS: five tabs, ten authenticated saves/re-reads, chapter switch, exact source restoration; no unexpected browser errors or outside requests.');
  } finally { await context.close(); await browser.close(); }
}
