async (page) => {
  const browser = page.context().browser();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto(page.url());
  await second.waitForTimeout(700);
  const blocked = await second.locator("#instance-lock").textContent();
  const secondStarted = await second.evaluate(() => Boolean(window.__dragonApp));
  if (!/另一個視窗/.test(blocked) || secondStarted)
    throw new Error(`second instance was not blocked: ${blocked}`);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
  });
  await page.close();
  await second.waitForFunction(() => Boolean(window.__dragonApp), null, {
    timeout: 10000,
  });
  const active = await second.evaluate(() => ({
    ai: Boolean(window.__dragonApp),
    state: window.__dragonInstance?.state,
  }));
  await secondContext.close();
  if (!active.ai || active.state !== "active") throw new Error(JSON.stringify(active));
  return { blocked: true, takeover: active };
}
