// Only call with a disposable Playwright profile. Interact through actual menu hit tests.
import assert from 'node:assert/strict';

export async function clickSystemRow(page, row) {
  if (!await page.evaluate(() => window.__dragonApp.gamebar.settingsOpen)) {
    const bookX = await page.evaluate(() => window.__dragonApp.gamebar.bx + 447);
    await page.mouse.click(bookX,15);
    await page.waitForFunction(() => window.__dragonApp.gamebar.settingsOpen);
  }
  const [x,y] = await page.evaluate(row => {
    const rect = window.__dragonApp.gamebar._settingsRect();
    return [rect.x + rect.w/2, rect.y + 48 + row*26];
  },row);
  await page.mouse.click(x,y);
}

export async function appendMenuRecord(page) {
  const before = await page.evaluate(() => window.__dragonApp.loadedSaveSlot);
  await clickSystemRow(page,0);
  await page.waitForFunction(before => {
    const a = window.__dragonApp;
    return a.loadedSaveSlot !== before && a.gamebar.systemSaveDialog?.rows.some(row=>row.slot===a.loadedSaveSlot);
  },before);
  const slot = await page.evaluate(() => window.__dragonApp.loadedSaveSlot);
  await page.mouse.click(200,200,{button:'right'});
  await page.waitForFunction(() => !window.__dragonApp.gamebar.systemSaveDialog && window.__dragonApp.gamebar.settingsOpen);
  return slot;
}

export async function pickMenuRecord(page, record, chapterId, ids) {
  await clickSystemRow(page,1);
  await page.waitForFunction(() => window.__dragonApp.gamebar.systemLoadConfirmDialog && !window.__dragonApp.gamebar.systemLoadDialog);
  const [cx,cy] = await page.evaluate(() => {
    const r = window.__dragonApp.gamebar._systemLoadConfirmDialogRect();
    return [r.x+r.w/2,r.y+92];
  });
  if (record === null) {
    const before = await page.evaluateHandle(() => window.__dragonApp.scenario);
    await page.mouse.click(cx+54,cy);
    await page.waitForFunction(() => window.__dragonApp.gamebar.settingsOpen && !window.__dragonApp.gamebar.systemLoadConfirmDialog);
    assert.ok(await page.evaluate(sc => window.__dragonApp.scenario===sc && !window.__dragonApp.gamebar.systemLoadDialog, before));
    await before.dispose();
    await clickSystemRow(page,1);
  }
  await page.mouse.click(cx-54,cy);
  await page.waitForFunction(() => window.__dragonApp.gamebar.systemLoadDialog?.rows.length > 0);
  const rows = await page.evaluate(() => window.__dragonApp.gamebar.systemLoadDialog.rows);
  assert.deepEqual(rows.map(r=>r.slot),ids);
  assert.ok(rows.every(r=>r.infoText && r.dateStr && !/槽\d|未使用/.test(r.infoText)));
  const url = page.url();
  if (record === null) await page.mouse.click(200,200,{button:'right'});
  else {
    const [x,y] = await page.evaluate(id => {
      const bar=window.__dragonApp.gamebar, d=bar.systemLoadDialog, rect=bar._systemSaveDialogRect();
      return [rect.x+30,rect.y+45+50*(d.rows.findIndex(row=>row.slot===id)-d.scroll)];
    },record);
    await page.mouse.click(x,y);
    const loading = page.getByRole('dialog',{name:'正在讀取存檔…'});
    await loading.waitFor(); assert.ok(await loading.evaluate(node=>node.matches(':modal')));
    await loading.waitFor({state:'detached'});
  }
  assert.equal(page.url(),url);
  await page.waitForFunction(({record,chapterId}) => {
    const a = window.__dragonApp;
    return !a.gamebar.systemLoadDialog && !document.querySelector('.player-restore') && a.gameStarted && a.runtimeEnabled &&
      a.content.chapter(0).reference.chapterId === chapterId && (record === null || a.loadedSaveSlot === record);
  },{record,chapterId});
}
