async function verifyClockPause(
  page,
  baseUrl = process.env.DRAGON_TEST_URL ?? "http://127.0.0.1:8321/",
) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.goto(baseUrl);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => !!window.__app?.startMenu);
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish();
  });
  await page.waitForFunction(() => {
    const startMenu = window.__app?.startMenu;
    return (
      document.querySelector("#startv")?.style.display !== "none" &&
      !!startMenu?._onClick
    );
  });
  const clickGame = async (x, y) => {
    const box = await page.locator("#startv").boundingBox();
    check(box, "start menu canvas has no bounding box");
    await page.mouse.click(
      box.x + (x * box.width) / 640,
      box.y + (y * box.height) / 400,
    );
  };
  const clickAndRebind = async (x, y) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => {
        window.__verifyMenuHandler = window.__app?.startMenu?._onClick ?? null;
      });
      await clickGame(x, y);
      const rebound = await page
        .waitForFunction(
          () =>
            window.__app?.startMenu?._onClick &&
            window.__app.startMenu._onClick !== window.__verifyMenuHandler,
          null,
          { timeout: 3000 },
        )
        .then(
          () => true,
          () => false,
        );
      if (rebound) return;
    }
    throw new Error(`start menu click at ${x},${y} did not rebind`);
  };
  await clickAndRebind(276, 176);
  await clickAndRebind(320, 50);
  await clickAndRebind(320, 50);
  await clickGame(392, 271);
  await page.waitForFunction(
    () => document.querySelector("#startv")?.style.display === "none",
  );

  const renderState = await page.evaluate(async () => {
    const app = window.__app;
    let draws = 0;
    const originalDraw = app.view.draw.bind(app.view);
    app.view.draw = () => {
      draws++;
      return originalDraw();
    };
    await new Promise((resolve) => setTimeout(resolve, 200));
    app.view.draw = originalDraw;
    return {
      dialogCount: app.hud.dialogCount,
      hold: app.clock.hold,
      draws,
    };
  });
  check(renderState.dialogCount === 0, "HUD无模态时dialogCount必须初始化为0");
  check(renderState.hold === false, "正常战略地图不应被误判为暂停");
  check(
    renderState.draws >= 3,
    "正常战略地图必须逐RAF重绘，不能只在日期变化时刷新",
  );

  const result = await page.evaluate(async () => {
    const clock = window.__app.clock;
    clock.strategicSpeed = 0;
    const snapshot = () => ({
      day: clock.day,
      hour: clock.hour,
      sub: clock.sub,
      serial: clock.strategicTickSerial,
    });
    const before = snapshot();
    clock.speed = 0;
    clock.advance(5000);
    const paused = snapshot();
    clock.speed = 1;
    clock.advance(clock.currentStep + 1);
    const resumed = {
      ...snapshot(),
      strategicSpeed: clock.strategicSpeed,
    };
    return { before, paused, resumed };
  });
  check(
    result.paused.day === result.before.day &&
      result.paused.hour === result.before.hour &&
      result.paused.sub === result.before.sub &&
      result.paused.serial === result.before.serial,
    "Legacy modal pause allowed the strategic clock to advance",
  );
  check(
    result.resumed.serial === result.paused.serial + 1,
    "Restoring the strategic speed did not execute one strategic tick",
  );
  check(
    result.resumed.strategicSpeed === 0,
    "Lowest strategic speed was not preserved across pause/resume",
  );
  return { ...result, renderState };
}

module.exports = { verifyClockPause };
