globalThis.__verifySystemMenu = async (page) => {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  await page.setViewportSize({ width: 1024, height: 768 });
  const saveRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/save")) saveRequests.push(request);
  });
  await page.route("**/api/save", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true,"test":true}',
    });
  });
  const baseUrl = globalThis.DRAGON_TEST_URL ?? "http://127.0.0.1:8321/";
  await page.goto(baseUrl);
  await page.waitForFunction(() => !!window.__app?.startMenu);
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish();
  });

  // YES → 第一章 → 第一势力 → 确定军师。
  await page.mouse.click(468, 360);
  await page.waitForTimeout(250);
  await page.mouse.click(512, 234);
  await page.waitForTimeout(250);
  await page.mouse.click(512, 234);
  await page.waitForTimeout(250);
  await page.mouse.click(633, 474);
  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      !!window.__app?.scenario,
  );

  const bx = await page.evaluate(() => window.__app.gamebar.bx);
  await page.mouse.click(bx + 432 + 15, 15);
  await page.waitForFunction(() => window.__app.gamebar.settingsOpen === true);
  check(
    await page.evaluate(() => window.__app.clock.hold === true),
    "System menu must hold the strategic clock",
  );

  const menu = await page.evaluate(() => window.__app.gamebar._settingsRect());
  const clickX = menu.x + menu.w / 2;
  const rowY = (index) => menu.y + 8 + 30 + index * 26 + 13;

  const initial = await page.evaluate(() => ({
    sound: window.__app.soundType,
    strategic: window.__app.clock.strategicSpeed,
    tactical: window.__app.tacticalSpeed,
  }));
  await page.mouse.click(clickX, rowY(2));
  await page.mouse.click(clickX, rowY(3));
  await page.mouse.click(clickX, rowY(4));
  const cycled = await page.evaluate(() => ({
    sound: window.__app.soundType,
    strategic: window.__app.clock.strategicSpeed,
    tactical: window.__app.tacticalSpeed,
    tacticalFactor: window.__app.tacticalSpeedFactor,
  }));
  check(cycled.sound === (initial.sound % 4) + 1, "Sound type did not cycle");
  check(
    await page.evaluate(() => window.__app.soundType === 2),
    "Sound profile state was not applied to the app",
  );
  check(
    cycled.strategic === (initial.strategic + 1) % 5,
    "Strategic speed did not cycle",
  );
  check(
    cycled.tactical === (initial.tactical + 1) % 5,
    "Tactical speed did not cycle",
  );
  check(cycled.tacticalFactor === 1.5, "Unexpected tactical speed factor");

  await page.mouse.click(clickX, rowY(0));
  await page.waitForFunction(() => !!window.__app.gamebar.systemSaveDialog);
  const saveRect = await page.evaluate(() =>
    window.__app.gamebar._systemSaveDialogRect(),
  );
  await page.mouse.click(
    saveRect.x + saveRect.w - 50,
    saveRect.y + 8 + 28 + 20,
  );
  await page.waitForFunction(
    () =>
      window.__app.gamebar.settingsOpen === true &&
      !window.__app.gamebar.systemSaveDialog,
  );

  await page.mouse.click(clickX, rowY(1));
  await page.waitForFunction(
    () => !!window.__app.gamebar.systemLoadConfirmDialog,
  );
  const buttons = await page.evaluate(() => {
    const r = window.__app.gamebar._systemLoadConfirmDialogRect();
    const innerX = r.x + 8;
    const innerY = r.y + 8;
    const innerW = (r.wTiles - 1) * 16;
    const btnW = 76;
    const btnY = innerY + 74;
    return {
      okX: innerX + Math.floor(innerW / 2) - btnW - 16 + btnW / 2,
      cancelX: innerX + Math.floor(innerW / 2) + 16 + btnW / 2,
      y: btnY + 11,
    };
  });

  await page.mouse.click(buttons.cancelX, buttons.y);
  await page.waitForFunction(
    () =>
      window.__app.gamebar.settingsOpen === true &&
      !window.__app.gamebar.systemLoadConfirmDialog,
  );

  await page.mouse.click(clickX, rowY(1));
  await page.waitForFunction(
    () => !!window.__app.gamebar.systemLoadConfirmDialog,
  );
  await page.mouse.click(buttons.okX, buttons.y);
  await page.waitForFunction(
    () => document.querySelector("#startv")?.style.display !== "none",
  );
  check(
    await page.evaluate(() => window.__app.clock.hold === true),
    "Title load dialog must keep the abandoned scenario paused",
  );

  await page.mouse.click(320, 200, { button: "right" });
  await page.waitForTimeout(150);
  check(
    await page.evaluate(
      () => document.querySelector("#startv")?.style.display !== "none",
    ),
    "Right click should return from title load dialog to YES/NO",
  );

  check(saveRequests.length >= 1, "Expected a mocked save request");
  check(
    saveRequests.at(-1).postDataBuffer()?.byteLength === 4 * 0x56c0,
    "SAVE.DAT request payload has an unexpected size",
  );
  return { initial, cycled, mockedSave: true };
};
