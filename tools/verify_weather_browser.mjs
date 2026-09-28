import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);
const server = await startBrowserTestServer();
const { port } = server;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  // Weather-only fixture: an already-seen opening in this new isolated context.
  // Do not start/cancel an unrelated MP3 download or suppress request failures.
  await context.addInitScript((origin) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem("wolong.intro.seen.v1", "1");
    // 全部军团帧预载后资源数超过浏览器默认250条；保留本测试的完整证据。
    performance.setResourceTimingBufferSize(2048);
  }, `http://127.0.0.1:${port}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function clickAndRebind(x, y) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => {
        window.__verifyMenuHandler = window.__app?.startMenu?._onClick ?? null;
      });
      await page.mouse.click(x, y);
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
  }

  await clickAndRebind(468, 360);
  await clickAndRebind(512, 234);
  await clickAndRebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      window.__app?.gameStarted === true &&
      window.__app?.scenario?.weatherClouds?.length === 16,
  );

  // 原始完整Scenario下验证计时运行；注入可见慢帧，覆盖>100ms停动画回归。
  await page.evaluate(() => {
    const app = window.__app;
    const advance = app.clock.advanceFrame.bind(app.clock);
    window.__weatherSlowRestore = () => { app.clock.advanceFrame = advance; };
    window.__weatherRunning = { serial: app.clock.strategicTickSerial, times: [], frames: [] };
    app.clock.speed = 1;
    app.clock.advanceFrame = dt => {
      advance(dt);
      const probe = window.__weatherRunning;
      probe.times.push(app.weatherFx.clock.time);
      probe.frames.push(app.weatherFx.clouds[0]?.frame);
      const start = performance.now();
      while (performance.now() - start < 120) { /* controlled visible main-thread load */ }
    };
  });
  await page.waitForFunction(() => {
    const app = window.__app, probe = window.__weatherRunning;
    return app.clock.strategicTickSerial > probe.serial &&
      Math.max(...probe.times) - Math.min(...probe.times) >= 400 &&
      new Set(probe.frames.filter(Number.isInteger)).size >= 3;
  }, null, { timeout: 15000 });
  await page.evaluate(() => window.__weatherSlowRestore());

  const evidence = await page.evaluate(async () => {
    const app = window.__app;
    app.setRuntimeEnabled(false);
    const cloud = {
      active: true,
      x: 100,
      y: 100,
      phaseX: 0,
      velocityX: 0,
      phaseY: 0,
      velocityY: 0,
      timer: 16,
      interval: 16,
      group: 0,
      frame: 0,
    };
    app.scenario.weatherClouds = [cloud];
    app.view.cam.scale = 1;
    app.view.cam.x = 320 - cloud.x * 16;
    app.view.cam.y = 200 - cloud.y * 16;
    app.view.draw();

    const scratch = document.createElement("canvas");
    const capture = () => Array.from(app.view.ctx.getImageData(192, 136, 256, 144).data);
    app.weatherFx.reset();
    app.view.draw();
    const bare = capture();
    const stateBefore = JSON.stringify(app.scenario);
    const rngBefore = JSON.stringify(app.originalRng.snapshot());
    app.weatherFx.update(app.scenario, 0);
    for (let time = 10; time <= 300; time += 10) app.weatherFx.update(app.scenario, time);
    app.view.draw();
    const weather = capture();
    const visualBeforeDraw = JSON.stringify(app.weatherFx.clouds);
    app.view.draw();
    const repeated = capture();
    const drawIsReadOnly = visualBeforeDraw === JSON.stringify(app.weatherFx.clouds);
    // 原完整PNG逐像素比对（含透明区），不再用“足够白”替代原外观。
    scratch.width = 256;
    scratch.height = 144;
    const cloudContext = scratch.getContext("2d");
    const reference = document.createElement("canvas");
    reference.width = 256; reference.height = 144;
    const referenceContext = reference.getContext("2d");
    const originals = await Promise.all(Array.from({ length: 8 }, (_, frame) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image); image.onerror = reject;
        image.src = `grf/weather/cloud_frame_${frame}.png`;
      })));
    app.weatherFx.pause();
    app.weatherFx.update(app.scenario, 350); // 恢复帧不补债，表现时间仍为300ms。
    let exactFrames = 0;
    for (let step = 0; step < 8; step++) {
      const image = originals[(3 + step) & 7];
      app.weatherFx.update(app.scenario, 350 + step * 100);
      cloudContext.clearRect(0, 0, 256, 144);
      app.weatherFx.draw(cloudContext, { x: 128 - cloud.x * 16,
        y: 64 - cloud.y * 16, scale: 1 }, 16, { width: 256, height: 144 });
      referenceContext.clearRect(0, 0, 256, 144);
      referenceContext.drawImage(image, 0, 0);
      const actual = cloudContext.getImageData(0, 0, 256, 144).data;
      const expected = referenceContext.getImageData(0, 0, 256, 144).data;
      if (actual.every((value, index) => value === expected[index])) exactFrames++;
    }
    const modern = {
      exactFrames,
      visible: weather.some((value, index) => value !== bare[index]),
      repeatable: repeated.every((value, index) => value === weather[index]),
      drawIsReadOnly,
      stateUnchanged: stateBefore === JSON.stringify(app.scenario),
      rngUnchanged: rngBefore === JSON.stringify(app.originalRng.snapshot()),
    };

    // 同一正式MapView路径再验证初始frame=1的大火对象及(x-2,y-2)锚点。
    app.scenario.weatherClouds = [];
    app.weatherFx.reset();
    app.scenario.disasterMapObjects = Array(16).fill(null);
    app.scenario.disasterMapObjects[0] = {
      active: true,
      kind: 1,
      group: 1,
      x: 100,
      y: 100,
      raw6: 1,
      raw7: 1,
      timer: 1,
      interval: 16,
      frame: 1,
    };
    app.view.draw();
    const fireImage = new Image();
    const fireLoaded = new Promise((resolve, reject) => {
      fireImage.onload = resolve;
      fireImage.onerror = reject;
    });
    fireImage.src = "grf/disaster/fire_frame_1.png";
    await fireLoaded;
    await fireImage.decode();
    scratch.width = fireImage.width;
    scratch.height = fireImage.height;
    const fireScratchContext = scratch.getContext("2d");
    fireScratchContext.drawImage(fireImage, 0, 0);
    const fireSource = fireScratchContext.getImageData(
      0,
      0,
      fireImage.width,
      fireImage.height,
    );
    let fireOpaque = -1;
    for (let offset = 3; offset < fireSource.data.length; offset += 4) {
      if (fireSource.data[offset] === 255) {
        fireOpaque = (offset - 3) / 4;
        break;
      }
    }
    if (fireOpaque < 0) throw new Error("fire PNG has no opaque pixel");
    const fireSourceX = fireOpaque % fireImage.width;
    const fireSourceY = Math.floor(fireOpaque / fireImage.width);
    const fireSourcePixel = Array.from(
      fireSource.data.slice(fireOpaque * 4, fireOpaque * 4 + 4),
    );
    const fireDestinationPixel = Array.from(
      app.view.ctx.getImageData(
        320 - 2 * 16 + fireSourceX,
        200 - 2 * 16 + fireSourceY,
        1,
        1,
      ).data,
    );

    // group2暴动共用80×80中心锚点，但必须选用独立的0x28..0x2B图组。
    app.scenario.disasterMapObjects[0] = {
      ...app.scenario.disasterMapObjects[0],
      kind: 2,
      group: 2,
    };
    app.view.draw();
    const riotImage = new Image();
    const riotLoaded = new Promise((resolve, reject) => {
      riotImage.onload = resolve;
      riotImage.onerror = reject;
    });
    riotImage.src = "grf/disaster/riot_frame_1.png";
    await riotLoaded;
    await riotImage.decode();
    scratch.width = riotImage.width;
    scratch.height = riotImage.height;
    const riotScratchContext = scratch.getContext("2d");
    riotScratchContext.drawImage(riotImage, 0, 0);
    const riotSource = riotScratchContext.getImageData(
      0,
      0,
      riotImage.width,
      riotImage.height,
    );
    let riotOpaque = -1;
    for (let offset = 3; offset < riotSource.data.length; offset += 4) {
      if (riotSource.data[offset] === 255) {
        riotOpaque = (offset - 3) / 4;
        break;
      }
    }
    if (riotOpaque < 0) throw new Error("riot PNG has no opaque pixel");
    const riotSourceX = riotOpaque % riotImage.width;
    const riotSourceY = Math.floor(riotOpaque / riotImage.width);
    const riotSourcePixel = Array.from(
      riotSource.data.slice(riotOpaque * 4, riotOpaque * 4 + 4),
    );
    const riotDestinationPixel = Array.from(
      app.view.ctx.getImageData(
        320 - 2 * 16 + riotSourceX,
        200 - 2 * 16 + riotSourceY,
        1,
        1,
      ).data,
    );
    const weatherRequests = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/grf/weather/cloud_frame_"));
    const disasterRequests = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/grf/disaster/"));
    return {
      modern,
      loadedWeatherFrames: new Set(weatherRequests).size,
      fireImageSize: [fireImage.width, fireImage.height],
      fireSourcePixel,
      fireDestinationPixel,
      riotImageSize: [riotImage.width, riotImage.height],
      riotSourcePixel,
      riotDestinationPixel,
      loadedDisasterFrames: new Set(disasterRequests).size,
    };
  });

  assert.deepEqual(evidence.modern, {
    exactFrames: 8,
    visible: true, repeatable: true, drawIsReadOnly: true,
    stateUnchanged: true, rngUnchanged: true,
  });
  assert.equal(evidence.loadedWeatherFrames, 8);
  assert.deepEqual(evidence.fireImageSize, [80, 80]);
  assert.deepEqual(evidence.fireDestinationPixel, evidence.fireSourcePixel);
  assert.deepEqual(evidence.riotImageSize, [80, 80]);
  assert.deepEqual(evidence.riotDestinationPixel, evidence.riotSourcePixel);
  assert.equal(evidence.loadedDisasterFrames, 16);

  // 正式RAF接线：暂停战略时位置、透明度、雨丝帧也完全冻结。
  await page.evaluate(() => {
    const app = window.__app;
    app.clock.speed = 0;
    app.scenario.weatherClouds = [{ x: 100, y: 100, active: true, group: 0 }];
    app.weatherFx.reset();
    window.__weatherRuleBefore = JSON.stringify(app.scenario);
    window.__weatherRngBefore = JSON.stringify(app.originalRng.snapshot());
    window.__weatherSerialBefore = app.clock.strategicTickSerial;
    window.__weatherVisualBefore = JSON.stringify(app.weatherFx.clouds);
    window.__weatherTimeBefore = app.weatherFx.clock.time;
    app.setRuntimeEnabled(true);
  });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)));
  const pausedWeather = await page.evaluate(() => {
    const app = window.__app;
    app.setRuntimeEnabled(false);
    return {
      frozen: window.__weatherVisualBefore === JSON.stringify(app.weatherFx.clouds) &&
        window.__weatherTimeBefore === app.weatherFx.clock.time,
      state: window.__weatherRuleBefore === JSON.stringify(app.scenario),
      rng: window.__weatherRngBefore === JSON.stringify(app.originalRng.snapshot()),
      serial: window.__weatherSerialBefore === app.clock.strategicTickSerial,
    };
  });
  assert.deepEqual(pausedWeather, { frozen: true, state: true, rng: true, serial: true });

  const fireStart = await page.evaluate(async () => {
    const app = window.__app;
    const city = app.scenario.cities[0];
    city.faction = app.scenario.player_faction;
    city.disaster_event = undefined;
    app.scenario.disasterMapObjects = Array(16).fill(null);
    app.scenario.strategicEventSlots = Array(256).fill(null);
    app.scenario.strategicEventSlots[0] = {
      type: 12,
      arg0: 1,
      // Native 4-byte wheel stores the city pointer word in arg1/arg2.
      arg1: 0x40,
      arg2: 0x08,
    };
    app.scenario._strategicEventCursor = 0;
    app.scenario._strategicEventDivider = 1;
    window.__fireTestRng = {
      bytes: [3, 2],
      calls: 0,
      nextByte() {
        this.calls++;
        return this.bytes.shift() ?? 0xff;
      },
    };
    app.originalRng = window.__fireTestRng;
    const { tickStrategicWarEvents } = await import("./src/game/ai.js");
    const changed = tickStrategicWarEvents(app);
    return {
      changed,
      calls: window.__fireTestRng.calls,
      damage: city.disaster_event,
      objectGroup: app.scenario.disasterMapObjects[0]?.group,
    };
  });
  assert.deepEqual(fireStart, {
    changed: true,
    calls: 0,
    damage: undefined,
    objectGroup: 1,
  });
  await page.waitForFunction(() => window.__app?.gamebar?.generalCard != null);
  const fireCard = await page.evaluate(() => {
    const card = window.__app.gamebar.generalCard;
    const text = card.lines
      .flat(Infinity)
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
    return { text, px: card.px, py: card.py, w: card.w, h: card.h };
  });
  assert.match(fireCard.text, /大火/);
  assert.equal(fireCard.w, 480);
  assert.equal(fireCard.h, 80);
  assert.ok(
    fireCard.py >= 600,
    "TALK71 must use the bottom generic message card",
  );
  await page.evaluate(() => window.__app.gamebar.closeGeneralCard());
  await page.waitForFunction(
    () =>
      window.__app.scenario.cities[0].disaster_event === 7 &&
      window.__fireTestRng.calls === 2,
  );

  const riotStart = await page.evaluate(async () => {
    const app = window.__app;
    const city = app.scenario.cities[0];
    city.disaster_event = undefined;
    app.scenario.disasterMapObjects = Array(16).fill(null);
    app.scenario.strategicEventSlots = Array(256).fill(null);
    app.scenario.strategicEventSlots[0] = {
      type: 12,
      arg0: 2,
      // Native 4-byte wheel stores the city pointer word in arg1/arg2.
      arg1: 0x40,
      arg2: 0x08,
    };
    app.scenario._strategicEventCursor = 0;
    app.scenario._strategicEventDivider = 1;
    window.__riotTestRng = {
      bytes: [4, 1],
      calls: 0,
      nextByte() {
        this.calls++;
        return this.bytes.shift() ?? 0xff;
      },
    };
    app.originalRng = window.__riotTestRng;
    const { tickStrategicWarEvents } = await import("./src/game/ai.js");
    const changed = tickStrategicWarEvents(app);
    return {
      changed,
      calls: window.__riotTestRng.calls,
      damage: city.disaster_event,
      objectGroup: app.scenario.disasterMapObjects[0]?.group,
    };
  });
  assert.deepEqual(riotStart, {
    changed: true,
    calls: 0,
    damage: undefined,
    objectGroup: 2,
  });
  await page.waitForFunction(() => window.__app?.gamebar?.generalCard != null);
  const riotCard = await page.evaluate(() => {
    const card = window.__app.gamebar.generalCard;
    const text = card.lines
      .flat(Infinity)
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
    return { text, py: card.py, w: card.w, h: card.h };
  });
  assert.match(riotCard.text, /暴動/);
  assert.equal(riotCard.w, 480);
  assert.equal(riotCard.h, 80);
  assert.ok(
    riotCard.py >= 600,
    "TALK72 must use the bottom generic message card",
  );
  await page.evaluate(() => window.__app.gamebar.closeGeneralCard());
  await page.waitForFunction(
    () =>
      window.__app.scenario.cities[0].disaster_event === 8 &&
      window.__riotTestRng.calls === 2,
  );
  assert.deepEqual(errors, []);
  await context.close();
  process.stdout.write(
    "weather browser OK: eight original cloud frames, running/paused playback, read-only rendering; exact fire/riot pixels and TALK71/72\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
