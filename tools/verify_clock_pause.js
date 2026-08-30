globalThis.__verifyClockPause = async (page) => {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const baseUrl = globalThis.DRAGON_TEST_URL ?? "http://127.0.0.1:8321/";
  await page.goto(baseUrl);
  await page.waitForFunction(() => !!window.__app?.startMenu);
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish();
  });
  await page.mouse.click(468, 360);
  await page.waitForTimeout(250);
  await page.mouse.click(512, 234);
  await page.waitForTimeout(250);
  await page.mouse.click(512, 234);
  await page.waitForTimeout(250);
  await page.mouse.click(633, 474);
  await page.waitForFunction(
    () => document.querySelector("#startv")?.style.display === "none",
  );

  const result = await page.evaluate(async () => {
    const clock = window.__app.clock;
    clock.strategicSpeed = 0;
    const before = { day: clock.day, hour: clock.hour };
    clock.speed = 0;
    clock.advance(5000);
    const paused = { day: clock.day, hour: clock.hour };
    clock.speed = 1;
    clock.advance(clock.currentStep + 1);
    const resumed = {
      day: clock.day,
      hour: clock.hour,
      strategicSpeed: clock.strategicSpeed,
    };
    return { before, paused, resumed };
  });
  check(
    result.paused.day === result.before.day &&
      result.paused.hour === result.before.hour,
    "Legacy modal pause allowed the strategic clock to advance",
  );
  check(
    result.resumed.day !== result.paused.day ||
      result.resumed.hour !== result.paused.hour,
    "Restoring the strategic speed did not resume the clock",
  );
  check(
    result.resumed.strategicSpeed === 0,
    "Lowest strategic speed was not preserved across pause/resume",
  );
  return result;
};
