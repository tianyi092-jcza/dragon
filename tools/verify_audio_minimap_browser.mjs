// Fresh Chromium, isolated profile, localhost-style intercepted static assets only.
// No game save imports, no file writes; browser decoding is not a listening/hardware test.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route("http://dragon-audio.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: "<button id='enable'>Enable audio</button>",
      });
    assert.ok(!pathname.includes(".."));
    let contentType = "application/octet-stream";
    if (pathname.endsWith(".js")) contentType = "text/javascript";
    else if (pathname.endsWith(".wav")) contentType = "audio/wav";
    await route.fulfill({
      contentType,
      body: await fs.readFile(new URL(`../web${pathname}`, import.meta.url)),
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://dragon-audio.test/");
  await page.evaluate(() => {
    document.querySelector("button").onclick = () => {
      const host = /** @type {any} */ (window);
      host.audioTestContext = new AudioContext();
      void host.audioTestContext.resume();
    };
  });
  await page.click("button");
  const evidence = await page.evaluate(async () => {
    const decoded = [];
    const audio = /** @type {any} */ (window).audioTestContext;
    for (const name of [
      "music/BGM_02",
      "music/BGM_03",
      "music/BGM_04",
      "music/BGM_05",
      "sfx/ynsound-id3",
    ]) {
      const response = await fetch(`/grf/${name}.wav`);
      if (!response.ok) throw new Error(`audio HTTP ${response.status}`);
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      const pcm = buffer.getChannelData(0);
      let peak = 0;
      for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
      decoded.push({
        name,
        seconds: buffer.duration,
        channels: buffer.numberOfChannels,
        peak,
      });
    }
    const speaker = await import("/src/core/speaker.js");
    speaker.unlockSfx();
    await speaker.prepareEngageSfx();
    const played = speaker.engageSfx();
    const retriggered = speaker.engageSfx();
    speaker.toggleMute();
    await audio.close();

    const { drawMinimapMarker, MINI_MARKER_STYLES, minimapBattleMarkers } =
      await import("/src/render/minimapmarkers.js");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 20;
    const ctx = canvas.getContext("2d");
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const rendered = [];
    for (const style of [
      MINI_MARKER_STYLES.selected,
      MINI_MARKER_STYLES.other,
    ]) {
      ctx.clearRect(0, 0, 20, 20);
      drawMinimapMarker(ctx, 10, 10, style);
      rendered.push({
        border: pixel(8, 8),
        fill: pixel(10, 10),
        outside: pixel(10, 6),
      });
    }
    const scenario = {
      cities: [{ idx: 0, x: 15, y: 25 }],
      legions: [
        {
          slot: 0,
          _engagement: {
            kind: "siege",
            target: { cityIdx: 0 },
            countdown: 11,
          },
        },
      ],
    };
    const { EngagementPresentation } = await import(
      "/src/render/engagementpresentation.js"
    );
    const fx = new EngagementPresentation();
    const markers = () => minimapBattleMarkers(scenario, fx);
    fx.update(scenario, 0);
    const first = Array.from(markers().values());
    fx.update(scenario, 5000, { paused: true });
    const paused = Array.from(markers().values());
    fx.update(scenario, 5000);
    fx.update(scenario, 5100);
    const next = Array.from(markers().values());
    scenario.legions[0]._engagement = null;
    return {
      decoded,
      played,
      retriggered,
      rendered,
      first,
      paused,
      next,
      cleared: markers().size,
    };
  });
  assert.equal(evidence.played, true);
  assert.equal(evidence.retriggered, true);
  for (const track of evidence.decoded) {
    assert.equal(track.channels, 2);
    assert.ok(track.peak > 0 && track.peak < 1);
  }
  assert.deepEqual(evidence.rendered, [
    {
      border: [255, 255, 255, 255],
      fill: [48, 64, 208, 255],
      outside: [0, 0, 0, 0],
    },
    {
      border: [0, 32, 96, 255],
      fill: [48, 64, 208, 255],
      outside: [0, 0, 0, 0],
    },
  ]);
  assert.deepEqual(evidence.first, evidence.paused);
  assert.notDeepEqual(evidence.first, evidence.next);
  assert.equal(evidence.cleared, 0);
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify(evidence) + "\n");
  process.stdout.write(
    "audio/minimap fresh Chromium OK: WAV decode/non-silence, actual WebAudio retrigger, square pixels and shared presentation phase; no listening claim\n",
  );
} finally {
  await browser.close();
}
