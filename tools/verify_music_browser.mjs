// Fresh non-persistent Chromium, read-only static assets; no original SAVE/API.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
const root = fileURLToPath(new URL("../web/", import.meta.url));
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const file = path.resolve(
      root,
      `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
    );
    assert.ok(file.startsWith(root));
    const types = {
      ".js": "text/javascript",
      ".html": "text/html",
      ".json": "application/json",
      ".css": "text/css",
      ".png": "image/png",
      ".flac": "audio/flac",
      ".wav": "audio/wav",
    };
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    response.end(await fs.readFile(file));
  } catch {
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  assert.equal(await page.evaluate(() => window.__app.music.track), null);
  async function rebind(x, y) {
    await page.evaluate(() => {
      /** @type {any} */ (window).__musicHandler =
        window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !==
          /** @type {any} */ (window).__musicHandler,
    );
  }
  await rebind(468, 360);
  await page.waitForFunction(() => window.WolongIntro.music.playing);
  assert.equal(
    await page.evaluate(() => window.__app.music.source),
    null,
    "opening MP3 owns title audio; no parallel BGM0",
  );
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      window.__app.gameStarted &&
      window.__app.runtimeEnabled &&
      window.__app.music.source != null,
    null,
    { timeout: 30000 },
  );
  const bx = await page.evaluate(() => window.__app.gamebar.bx);
  await page.mouse.click(bx + 447, 15);
  await page.waitForFunction(() => window.__app.gamebar.settingsOpen);
  const menu = await page.evaluate(() => window.__app.gamebar._settingsRect());
  assert.equal(menu.rows, 6);
  const x = menu.x + menu.w / 2;
  const y = (row) => menu.y + 8 + 30 + row * 26 + 13;
  const snapshot = await page.evaluate(() => {
    const app = window.__app;
    /** @type {any} */ (window).__musicSource = app.music.source;
    const audio = app.speaker.getAudioContext();
    const clicks = [];
    /** @type {any} */ (window).__audioClicks = clicks;
    const createOscillator = audio.createOscillator.bind(audio);
    audio.createOscillator = () => {
      const oscillator = createOscillator();
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...args) => {
        clicks.push({
          frequency: oscillator.frequency.value,
          wave: oscillator.type,
        });
        start(...args);
      };
      return oscillator;
    };
    const ctx = document.createElement("canvas").getContext("2d");
    const labels = [];
    ctx.fillText = (text) => labels.push(text);
    app.gamebar._drawSettings(ctx);
    return {
      labels,
      extraAudioState: "soundType" in app || "soundType" in app.gamebar,
      time: app.speaker.getAudioContext().currentTime,
      ruleTick: app.clock.strategicTickSerial,
      track: app.music.track,
      rng: app.originalRng.snapshot(),
    };
  });
  assert.ok(snapshot.labels.includes("音　　效"));
  assert.ok(!snapshot.labels.includes("音　　樂"), "no extra music row");
  assert.equal(
    snapshot.extraAudioState,
    false,
    "one CF9 state, no parallel SFX profile",
  );
  assert.equal(
    await page.evaluate(({ x, y }) => window.__app.gamebar._hitSettings(x, y), {
      x,
      y: y(6),
    }),
    -1,
    "no seventh-row hit target",
  );
  const levels = [];
  for (const type of [2, 3, 4, 0, 1]) {
    const beforeClicks = await page.evaluate(
      () => /** @type {any} */ (window).__audioClicks.length,
    );
    await page.mouse.click(x, y(2));
    assert.equal(await page.evaluate(() => window.__app.music.type), type);
    assert.equal(
      await page.evaluate(() => window.__app.music.track),
      snapshot.track,
      "TYPE never selects a different song",
    );
    assert.ok(
      (await page.evaluate(
        () => /** @type {any} */ (window).__audioClicks.length,
      )) > beforeClicks,
      "original PC confirmation is not muted by CF9, including OFF",
    );
    if (type >= 2)
      assert.equal(
        await page.evaluate(
          () =>
            window.__app.music.source ===
            /** @type {any} */ (window).__musicSource,
        ),
        true,
      );
    if (type === 0) {
      assert.equal(await page.evaluate(() => window.__app.music.source), null);
    } else {
      await page.waitForFunction(() => window.__app.music.source != null);
      const gain = await page.evaluate(
        () => window.__app.music.gain.gain.value,
      );
      assert.ok(Math.abs(gain - 10 ** ((-3 * (type - 1)) / 20)) < 1e-6);
      levels.push({ type, gain });
    }
  }
  const clicks = await page.evaluate(
    () => /** @type {any} */ (window).__audioClicks,
  );
  assert.ok(
    clicks.every((click) => click.frequency === 950 && click.wave === "square"),
    "TYPE does not select beep timbre",
  );
  await page.waitForFunction(() => window.__app.music.source != null);
  const after = await page.evaluate(() => ({
    time: window.__app.speaker.getAudioContext().currentTime,
    ruleTick: window.__app.clock.strategicTickSerial,
    hold: window.__app.clock.hold,
    rng: window.__app.originalRng.snapshot(),
  }));
  assert.equal(after.hold, true);
  assert.equal(after.ruleTick, snapshot.ruleTick);
  assert.deepEqual(after.rng, snapshot.rng);
  assert.ok(
    after.time > snapshot.time,
    "menu holds strategy but not music hardware clock",
  );
  const screenshot = path.join(
    os.tmpdir(),
    "dragon-single-audio-system-menu.png",
  );
  await page.screenshot({ path: screenshot });
  await page.mouse.click(x, y(3), { button: "right" });
  assert.equal(
    await page.evaluate(() => window.__app.gamebar.settingsOpen),
    false,
  );

  const audience = await page.evaluate(async () => {
    const app = window.__app;
    const other = app.scenario.factions.find(
      (f) => f?.active && f.idx !== app.scenario.player_faction,
    );
    await app.gamebar.showHostileProposalAudience(other);
    const entered = app.music.track;
    app.gamebar.closeProposalAudience();
    app.gamebar.selectedSubmenu = null;
    app.gamebar.syncClock();
    return { entered, exited: app.music.track };
  });
  assert.equal(audience.entered, 6);
  assert.equal(audience.exited, snapshot.track);

  // Decode one at a time: FLAC reduces network bytes, not decoded-buffer RAM.
  const decoded = await page.evaluate(async () => {
    const app = window.__app;
    app.gamebar.settingsOpen = true;
    app.gamebar.syncClock();
    const audio = app.speaker.getAudioContext();
    const manifest = await (await fetch("grf/music/playback.json")).json();
    const results = [];
    for (const track of manifest.tracks) {
      const buffer = await audio.decodeAudioData(
        await (await fetch(`grf/music/${track.file}`)).arrayBuffer(),
      );
      let peak = 0;
      const pcm = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 997)
        peak = Math.max(peak, Math.abs(pcm[i]));
      results.push({
        index: track.index,
        duration: buffer.duration,
        loopEnd: track.loopEnd,
        rate: buffer.sampleRate,
        peak,
        channels: buffer.numberOfChannels,
      });
    }
    return results;
  });
  assert.equal(decoded.length, 11);
  for (const track of decoded) {
    assert.equal(track.channels, 2);
    assert.ok(track.peak > 0 && track.peak < 1);
    assert.ok(Math.abs(track.duration - track.loopEnd) < 2 / track.rate);
  }
  await page.evaluate(() => {
    void window.__app.returnToTitle();
  });
  await page.waitForFunction(
    () =>
      window.__app.score.scene === "title" &&
      window.__app.music.track === null &&
      window.__app.music.source === null &&
      window.WolongIntro.phase === "idle" &&
      !window.WolongIntro.music.playing,
    null,
    { timeout: 30000 },
  );
  assert.deepEqual(errors, []);
  await context.close();
  const isolated = await browser.newContext();
  const legacyPage = await isolated.newPage();
  legacyPage.on("pageerror", (error) => errors.push(String(error)));
  globalThis.DRAGON_TEST_URL = `http://127.0.0.1:${server.address().port}/`;
  await import("./verify_system_menu.js");
  const systemMenu = await globalThis.__verifySystemMenu(legacyPage);
  assert.deepEqual(errors, []);
  await isolated.close();
  process.stdout.write(
    JSON.stringify({ screenshot, levels, audience, decoded, systemMenu }) +
      "\n",
  );
  process.stdout.write(
    "music browser OK: single original audio row, real TYPE volume/OFF with unchanged song/beep timbre, six-row input, clock/RNG preserved, 11 FLAC decodes, audience6, return title\n",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
