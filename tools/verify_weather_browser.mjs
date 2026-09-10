import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);
const repo = fileURLToPath(new URL("../", import.meta.url));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

const port = await getFreePort();
const server = spawn(
  "python",
  [path.join(repo, "tools", "webserver.py"), String(port)],
  { stdio: "ignore" },
);
await new Promise((resolve) => setTimeout(resolve, 600));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
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
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish?.();
  });

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

    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = "grf/weather/cloud_frame_0.png";
    await loaded;
    await image.decode();
    const scratch = document.createElement("canvas");
    scratch.width = image.width;
    scratch.height = image.height;
    const scratchContext = scratch.getContext("2d");
    scratchContext.drawImage(image, 0, 0);
    const source = scratchContext.getImageData(0, 0, image.width, image.height);
    let opaque = -1;
    for (let offset = 3; offset < source.data.length; offset += 4) {
      if (source.data[offset] === 255) {
        opaque = (offset - 3) / 4;
        break;
      }
    }
    if (opaque < 0) throw new Error("weather cloud PNG has no opaque pixel");
    const sourceX = opaque % image.width;
    const sourceY = Math.floor(opaque / image.width);
    const sourcePixel = Array.from(
      source.data.slice(opaque * 4, opaque * 4 + 4),
    );
    const destinationX = 320 - 8 * 16 + sourceX;
    const destinationY = 200 - 4 * 16 + sourceY;
    const destinationPixel = Array.from(
      app.view.ctx.getImageData(destinationX, destinationY, 1, 1).data,
    );

    // 同一正式MapView路径再验证初始frame=1的大火对象及(x-2,y-2)锚点。
    app.scenario.weatherClouds = [];
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
      imageSize: [image.width, image.height],
      sourcePixel,
      destinationPixel,
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

  assert.deepEqual(evidence.imageSize, [256, 144]);
  assert.deepEqual(evidence.destinationPixel, evidence.sourcePixel);
  assert.equal(evidence.loadedWeatherFrames, 8);
  assert.deepEqual(evidence.fireImageSize, [80, 80]);
  assert.deepEqual(evidence.fireDestinationPixel, evidence.fireSourcePixel);
  assert.deepEqual(evidence.riotImageSize, [80, 80]);
  assert.deepEqual(evidence.riotDestinationPixel, evidence.riotSourcePixel);
  assert.equal(evidence.loadedDisasterFrames, 16);

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
      cityPointer: 0x840,
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
      cityPointer: 0x840,
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
    "weather browser OK: fresh profile rendered exact cloud/fire/riot pixels and TALK71/72\n",
  );
} finally {
  await browser?.close();
  server.kill();
}
