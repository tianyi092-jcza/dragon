const verifySingleInstanceUi = async (page) => {
  await page.waitForFunction(() => Boolean(window.__dragonApp));
  const second = await page.context().newPage();
  await second.goto(page.url());
  await second.waitForFunction(
    () => document.querySelector("#instance-lock")?.style.display !== "none",
  );
  const blocked = await second.locator("#instance-lock").textContent();
  const secondStarted = await second.evaluate(() =>
    Boolean(window.__dragonApp),
  );
  if (!/另一個分頁/.test(blocked) || secondStarted)
    throw new Error(`second instance was not blocked: ${blocked}`);

  // 关闭持锁页面后，Web Lock 自动释放；被阻塞页不会自动初始化，必须显式重载。
  await page.close();
  await second.reload();
  await second.waitForFunction(() => Boolean(window.__dragonApp), null, {
    timeout: 10000,
  });
  const active = await second.evaluate(() => ({
    app: Boolean(window.__dragonApp),
    state: window.__dragonInstance?.state,
    lockKind: window.__dragonInstance?.kind,
  }));
  await second.close();
  if (
    !active.app ||
    active.state !== "active" ||
    active.lockKind !== "web-lock"
  )
    throw new Error(JSON.stringify(active));
  return { blocked: true, takeoverAfterReload: active };
};
export { verifySingleInstanceUi };
