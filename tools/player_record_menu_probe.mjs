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
    return !a.gamebar.systemSaveDialog && a.loadedSaveSlot !== before;
  },before);
  return page.evaluate(() => window.__dragonApp.loadedSaveSlot);
}

export async function pickMenuRecord(page, record, chapterId, ids) {
  await clickSystemRow(page,1);
  await page.waitForFunction(() => window.__dragonApp.gamebar.systemLoadConfirmDialog);
  const [x,y] = await page.evaluate(() => {
    const rect = window.__dragonApp.gamebar._systemLoadConfirmDialogRect();
    return [rect.x+rect.w/2-54,rect.y+92];
  });
  await page.mouse.click(x,y);
  const buttons = page.locator('.player-restore button[data-save-slot]');
  await buttons.first().waitFor();
  assert.deepEqual(await buttons.evaluateAll(rows => rows.map(row => Number(row.dataset.saveSlot)).sort((a,b)=>a-b)), [...ids].sort((a,b)=>a-b));
  assert.ok((await buttons.allTextContents()).every(text => text.trim() && !/槽\d|未使用/.test(text)));
  if (record === null) {
    await page.locator('.player-restore h2').click({button:'right'});
  } else await buttons.filter({ visible:true }).and(page.locator(`[data-save-slot="${record}"]`)).click();
  await page.waitForFunction(({record,chapterId}) => {
    const a = window.__dragonApp;
    return !document.querySelector('.player-restore') && a.gameStarted && a.runtimeEnabled &&
      a.content.chapter(0).reference.chapterId === chapterId && (record === null || a.loadedSaveSlot === record);
  },{record,chapterId});
}
