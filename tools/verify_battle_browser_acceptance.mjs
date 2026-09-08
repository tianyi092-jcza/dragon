// Fresh real-Chromium acceptance for the production tactical page, BattleView,
// RAF, drawing, dialogue, and DOM pointer-routing integration.
// Uses only an isolated browser profile and localhost static assets; never
// installs dependencies and never reads or writes the DOS SAVE.DAT.
// Example:
// PLAYWRIGHT_MODULE="$(npm root -g)/@playwright/cli/node_modules/playwright" \
//   node tools/verify_battle_browser_acceptance.mjs [artifact-directory]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"));
} catch (error) {
  throw new Error(
    "Existing Playwright unavailable; set PLAYWRIGHT_MODULE to its installed module path. No installation attempted.",
    { cause: error },
  );
}

const repo = fileURLToPath(new URL("../", import.meta.url));
const dialogueFrameSources = Object.freeze({
  "frame_sq.png":
    "e78536c9461f630d7973839c895af7696c61c661c18f53f7358284e097b6b0e6",
  "frame_col.png":
    "9b54bc969594de8c70dc59f2922081ebe14ceff6dbc93368691e0d63fff63c51",
  "frame_cap.png":
    "844cea9cade39f0bb0a21638c0e797afe5f6ea7f1ddf3687a2c8f0754eaac48f",
});
const dialogueFramePixelHash =
  "e43c157a4ffc29d9a6601db4c265ccd766f8865587326a2b41b4d7fd4d9eefdc";
for (const [name, expected] of Object.entries(dialogueFrameSources)) {
  const bytes = await readFile(path.join(repo, "web", "grf", "ui", name));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expected,
    `${name}: source asset SHA-256`,
  );
}
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : await mkdtemp(path.join(tmpdir(), "battle-browser-acceptance-"));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "dragon-fresh-chromium-"));
const initialProfileEntries = await readdir(profile);
assert.deepEqual(
  initialProfileEntries,
  [],
  "fresh Chromium profile must begin empty",
);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn("python", ["-u", "tools/webserver.py", String(port)], {
  cwd: repo,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk;
});

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.exitCode != null)
      throw new Error(`static server exited ${server.exitCode}: ${serverLog}`);
    try {
      const response = await fetch(origin, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The child may not have bound its socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`static server did not become ready: ${serverLog}`);
}
await waitForServer();

const errors = [];
const requests = new Set();
const results = {
  scope:
    "fresh production page + real BattleView/open + Chromium pointer/RAF/draw acceptance",
  origin,
  profile: {
    path: profile,
    initialEntries: initialProfileEntries,
    isolated: true,
    removedAfterRun: false,
  },
  server: { command: `python -u tools/webserver.py ${port}`, log: serverLog },
  titleBoundary: {},
  startup: {},
  controls: {},
  commands: [],
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  results.browser =
    context.browser()?.version() ?? "persistent Chromium context";
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      errors.push(`unexpected external request: ${url.href}`);
      return route.abort();
    }
    requests.add(url.pathname);
    return route.continue();
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (error) =>
    errors.push(`pageerror: ${error.stack ?? error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "request failed";
    if (!failure.includes("ERR_ABORTED"))
      errors.push(`${request.url()}: ${failure}`);
  });

  assert.deepEqual(
    await context.cookies(),
    [],
    "fresh profile has no cookies before navigation",
  );
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__dragonApp != null, null, {
    timeout: 15000,
  });

  // Complete the production title promise through the same pointerdown path a
  // player uses. window.__aiTick is installed only after StartMenu.show()
  // resolves, so it is also an observable post-title await boundary.
  const startCanvas = page.locator("#startv");
  await startCanvas.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => typeof globalThis.__dragonApp?.startMenu?._onClick === "function",
    null,
    { timeout: 15000 },
  );
  const titleCanvasHash = () =>
    startCanvas.evaluate(async (canvas) => {
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const hash = await crypto.subtle.digest("SHA-256", pixels);
      return [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    });
  const titlePhases = [];
  async function titleClick(name, position) {
    const before = await titleCanvasHash();
    await startCanvas.click({ position, timeout: 5000 });
    await page.waitForFunction(
      async (beforeHash) => {
        const canvas = document.querySelector("#startv");
        if (getComputedStyle(canvas).display === "none") return true;
        const pixels = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest("SHA-256", pixels);
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        return hash !== beforeHash;
      },
      before,
      { timeout: 15000 },
    );
    const after =
      (await startCanvas.evaluate(
        (canvas) => getComputedStyle(canvas).display,
      )) === "none"
        ? null
        : await titleCanvasHash();
    if (after != null)
      assert.notEqual(after, before, `${name}: title canvas changed`);
    titlePhases.push({ name, position, before, after });
  }
  await titleClick("new-game-yes", { x: 300, y: 175 });
  await titleClick("chapter-0", { x: 120, y: 55 });
  await titleClick("faction-0", { x: 120, y: 52 });
  await titleClick("advisor-confirm", { x: 440, y: 294 });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#startv")).display === "none" &&
      globalThis.__dragonApp?.gameStarted === true &&
      globalThis.__dragonApp?.runtimeEnabled === true &&
      typeof globalThis.__aiTick === "function",
    null,
    { timeout: 30000 },
  );
  results.titleBoundary = await page.evaluate((phases) => {
    const start = document.querySelector("#startv");
    return {
      input: "four genuine Playwright pointer clicks",
      phases,
      inlineDisplay: start.style.display,
      computedDisplay: getComputedStyle(start).display,
      gameStarted: globalThis.__dragonApp.gameStarted,
      runtimeEnabled: globalThis.__dragonApp.runtimeEnabled,
      postAwaitHandle: typeof globalThis.__aiTick,
    };
  }, titlePhases);
  assert.equal(results.titleBoundary.inlineDisplay, "none");
  assert.equal(results.titleBoundary.computedDisplay, "none");
  assert.equal(results.titleBoundary.postAwaitHandle, "function");

  await page.evaluate(async () => {
    const [clockModule, hudModule, battleModule, stateModule] =
      await Promise.all([
        import("/src/game/clock.js"),
        import("/src/ui/hud.js"),
        import("/src/game/tacticalbattle.js"),
        import("/src/game/battle/originalstate.js"),
      ]);
    const app = globalThis.__dragonApp;
    const generals = [
      {
        idx: 0,
        name: "甲",
        portrait: 0,
        talk_idx: 0,
        battle_formation: 0,
        ability: { force: 100, lead: 10, field: 15, siege: 15, naval: 15 },
      },
      {
        idx: 1,
        name: "乙",
        portrait: 1,
        talk_idx: 0,
        battle_formation: 0,
        ability: { force: 100, lead: 10, field: 15, siege: 15, naval: 15 },
      },
    ];
    const scenario = {
      name: "Browser acceptance",
      player_faction: 0,
      tax: 25,
      trust: 100,
      cities: [],
      legions: [],
      generals,
      factions: [
        { idx: 0, monarch: "甲", n_cities: 1, n_generals: 1 },
        { idx: 1, monarch: "乙", n_cities: 1, n_generals: 1 },
      ],
    };
    const legion = (faction, generalIdx) => ({
      faction,
      slot: generalIdx,
      generalIdx,
      leader: generals[generalIdx].name,
      morale: 200,
      troops: 6000,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    });

    app.scenario = scenario;
    app.clock = new clockModule.Clock({ startYear: 200, startMonth: 1 });
    app.tacticalSpeed = 4;
    app.runtimeEnabled = true;
    app.gameStarted = true;
    await app.ensureGameAssets();
    app.ensureGameShell(); // Production integration constructs the real BattleView.
    app.hud ??= new hudModule.HUD(app);
    await app.gamebar._assets;
    document.body.classList.add("game-active");

    const battle = battleModule.createFieldBattle(
      scenario,
      legion(0, 0),
      legion(1, 1),
      app.battleMaps,
      { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
    );
    // Controlled legal A1C5 refusal branch: side0 speaks, side1 answers, and
    // startup returns promptly. Rule execution and RNG remain production code.
    const first = stateModule.originalObjectAddress(0, 0, 0);
    const second = stateModule.originalObjectAddress(1, 0, 0);
    battle.session.pool.write8(first, stateModule.ORIGINAL_OBJECT.POWER, 100);
    battle.session.pool.write8(second, stateModule.ORIGINAL_OBJECT.POWER, 30);
    battle.session.registers.themeFlag = 1;

    const acceptance = {
      app,
      battle,
      scenario,
      legion,
      createFieldBattle: battleModule.createFieldBattle,
      O: stateModule.ORIGINAL_OBJECT,
      originalObjectAddress: stateModule.originalObjectAddress,
      paints: [],
      paintedKeys: new Set(),
      holdToken: null,
      finished: false,
    };
    globalThis.__battleAcceptance = acceptance;
    const paintSample = () => {
      if (acceptance.finished) return;
      for (const side of [0, 1]) {
        const name = battle.sideMap[side];
        const box = document.querySelector(`#bdialogue-${name}`);
        const capture = battle.session.messages.slots[side];
        const key = `${side}:${capture?.source}:${capture?.selector}`;
        if (
          capture?.status === "decoded" &&
          box?.dataset.kind === "decoded" &&
          getComputedStyle(box).display !== "none" &&
          !acceptance.paintedKeys.has(key)
        ) {
          const rect = box.getBoundingClientRect();
          acceptance.paintedKeys.add(key);
          acceptance.paints.push({
            side,
            source: capture.source,
            selector: capture.selector,
            frame: battle.session.frame,
            rect: [rect.x, rect.y, rect.width, rect.height],
          });
        }
      }
      requestAnimationFrame(paintSample);
    };
    requestAnimationFrame(paintSample);
    await app.battleView.open(battle, () => {
      acceptance.finished = true;
    });
    acceptance.holdToken = app.battleView.prevClockState;
  });

  await page.waitForFunction(
    () =>
      globalThis.__battleAcceptance.paints.some(
        (paint) => paint.source === "A1C5",
      ),
    null,
    { timeout: 8000 },
  );
  const firstVisible = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    const firstPaint = a.paints.find((paint) => paint.source === "A1C5");
    const name = a.battle.sideMap[firstPaint.side];
    return {
      side: firstPaint.side,
      frame: a.battle.session.frame,
      visible: document.querySelector(`#bdialogue-${name}`).dataset.kind,
      hold: a.app.clock.hold,
      token: a.app.battleView.prevClockState === a.holdToken,
    };
  });
  try {
    await page.waitForFunction(
      ({ frame, side }) => {
        const a = globalThis.__battleAcceptance;
        const name = a.battle.sideMap[side];
        return (
          a.battle.session.frame >= frame + 8 &&
          document.querySelector(`#bdialogue-${name}`).dataset.kind ===
            "decoded"
        );
      },
      { frame: firstVisible.frame, side: firstVisible.side },
      { timeout: 4000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const a = globalThis.__battleAcceptance;
      return {
        active: a.app.battleView.active,
        runtimeEnabled: a.app.battleView.runtimeEnabled,
        appRuntimeEnabled: a.app.runtimeEnabled,
        frame: a.battle.session.frame,
        finished: a.battle.session.finished,
        startupDone: a.app.battleView.battleStartup?.done,
        paints: a.paints,
      };
    });
    throw new Error(
      `startup RAF continuity failed: ${JSON.stringify({ state, errors })}`,
      { cause: error },
    );
  }
  await page.waitForFunction(
    () =>
      [0, 1].every((side) =>
        globalThis.__battleAcceptance.paints.some(
          (paint) => paint.side === side && paint.source === "A1C5",
        ),
      ),
    null,
    { timeout: 8000 },
  );
  const startupPaints = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    return a.paints.filter((paint) => paint.source === "A1C5");
  });
  assert.deepEqual(startupPaints.map((paint) => paint.side).sort(), [0, 1]);
  assert.equal(firstVisible.visible, "decoded");
  assert.equal(firstVisible.hold, true, "battle owns the strategic hold");
  assert.equal(
    firstVisible.token,
    true,
    "startup presentation does not replace the hold token",
  );

  const dialogueOcclusion = await page.evaluate(() => {
    const boxes = ["#bdialogue-def", "#bdialogue-atk"].map((selector) => {
      const box = document.querySelector(selector);
      const rect = box.getBoundingClientRect();
      const ownZ = Number.parseInt(getComputedStyle(box).zIndex, 10);
      const hitSamples = [];
      for (const xf of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        for (const yf of [0.02, 0.25, 0.5, 0.75, 0.98]) {
          const x = rect.x + rect.width * xf;
          const y = rect.y + rect.height * yf;
          const hit = document.elementFromPoint(x, y);
          let hitZ = 0;
          for (let element = hit; element; element = element.parentElement) {
            const z = Number.parseInt(getComputedStyle(element).zIndex, 10);
            if (Number.isFinite(z)) hitZ = Math.max(hitZ, z);
          }
          hitSamples.push({
            point: [x, y],
            hit: hit?.id || hit?.className || hit?.tagName || null,
            hitZ,
            owned: hit === box || box.contains(hit),
            notHigher: hitZ <= ownZ,
          });
        }
      }
      const higherZIntersections = [...document.body.querySelectorAll("*")]
        .filter((element) => element !== box && !box.contains(element))
        .flatMap((element) => {
          const css = getComputedStyle(element);
          if (
            css.display === "none" ||
            css.visibility === "hidden" ||
            css.pointerEvents === "none" ||
            Number(css.opacity) === 0
          )
            return [];
          const z = Number.parseInt(css.zIndex, 10);
          if (!Number.isFinite(z) || z <= ownZ) return [];
          const other = element.getBoundingClientRect();
          const intersects =
            other.right > rect.left &&
            other.left < rect.right &&
            other.bottom > rect.top &&
            other.top < rect.bottom;
          return intersects
            ? [{ id: element.id || element.className || element.tagName, z }]
            : [];
        });
      return {
        selector,
        zIndex: ownZ,
        display: getComputedStyle(box).display,
        hitSamples,
        higherZIntersections,
      };
    });
    const start = document.querySelector("#startv");
    return {
      startInlineDisplay: start.style.display,
      startComputedDisplay: getComputedStyle(start).display,
      boxes,
    };
  });
  assert.equal(dialogueOcclusion.startInlineDisplay, "none");
  assert.equal(dialogueOcclusion.startComputedDisplay, "none");
  for (const box of dialogueOcclusion.boxes) {
    assert.equal(
      box.display,
      "grid",
      `${box.selector}: visible for paint proof`,
    );
    assert.ok(
      box.hitSamples.every((sample) => sample.notHigher),
      `${box.selector}: no higher-z hit target overlays the dialogue: ${JSON.stringify(
        box.hitSamples.filter((sample) => !sample.notHigher),
      )}`,
    );
    assert.deepEqual(
      box.higherZIntersections,
      [],
      `${box.selector}: no visible higher-z hit target intersects`,
    );
  }

  await page.waitForFunction(
    () => globalThis.__battleAcceptance.app.battleView.battleStartup == null,
    null,
    { timeout: 8000 },
  );

  // Run a real active RAF update+draw/sync interval while dialogue is visible,
  // then restore its exact rule/VM boundary and replay the same number of rule
  // frames without drawing. Equality isolates legitimate rule RNG/state changes
  // from the presentation path instead of bypassing draw with runtime=false.
  const presentationControl = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    const view = a.app.battleView;
    view.setRuntimeEnabled(false);
    // Explicit provenance fixture: storage byte 9 is not evidence when known=0.
    // This untouched corner must survive checkpoint restore as unknown, not be
    // normalized into a claimed known-zero pixel.
    view.originalDisplayProcess.battle.framebuffer[0] = 9;
    view.originalDisplayProcess.battle.framebufferKnown[0] = 0;
    a.presentationCheckpoint = view.captureActiveCheckpoint();
    return {
      startFrame: a.battle.session.frame,
      nativeBoundary: a.presentationCheckpoint.native.boundary,
      unknownPixels:
        a.presentationCheckpoint.native.compositor.framebufferKnown.filter(
          (value) => value === 0,
        ).length,
      hold: a.app.clock.hold,
      token: view.prevClockState === a.holdToken,
      visible: ["#bdialogue-def", "#bdialogue-atk"].map(
        (selector) => document.querySelector(selector).dataset.kind,
      ),
    };
  });
  assert.ok(
    presentationControl.visible.includes("decoded"),
    "active RAF comparison begins with real dialogue visible",
  );
  assert.ok(
    presentationControl.unknownPixels > 0,
    "checkpoint preserves explicitly unknown pre-DDB4 framebuffer provenance",
  );
  await page.evaluate(() =>
    globalThis.__battleAcceptance.app.battleView.setRuntimeEnabled(true),
  );
  await page.waitForFunction(
    (frame) => globalThis.__battleAcceptance.battle.session.frame >= frame + 8,
    presentationControl.startFrame,
    { timeout: 4000 },
  );
  const activePresentationRun = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    const view = a.app.battleView;
    view.setRuntimeEnabled(false);
    const checkpoint = view.captureActiveCheckpoint();
    a.activePresentationCheckpoint = checkpoint;
    return {
      endFrame: a.battle.session.frame,
      rng: a.battle.session.rng.snapshot(),
      snapshotText: JSON.stringify(checkpoint.session, (_key, value) =>
        ArrayBuffer.isView(value) ? [...value] : value,
      ),
      nativeText: JSON.stringify(checkpoint.native),
      nativeBoundary: checkpoint.native.boundary,
      hold: a.app.clock.hold,
      token: view.prevClockState === a.holdToken,
    };
  });
  const replayedPresentationControl = await page.evaluate(
    (control) => {
      const a = globalThis.__battleAcceptance;
      const view = a.app.battleView;
      view.restoreActiveCheckpoint(a.presentationCheckpoint);
      const restoredNative = view.originalDisplayProcess.snapshotBattle();
      const frames = control.endFrame - control.startFrame;
      for (let frame = 0; frame < frames; frame++)
        view.updateBattleFrames(0.05);
      const checkpoint = view.captureActiveCheckpoint();
      return {
        endFrame: a.battle.session.frame,
        rng: a.battle.session.rng.snapshot(),
        snapshotText: JSON.stringify(checkpoint.session, (_key, value) =>
          ArrayBuffer.isView(value) ? [...value] : value,
        ),
        nativeText: JSON.stringify(checkpoint.native),
        restoredNativeMatches:
          JSON.stringify(restoredNative) ===
          JSON.stringify(a.presentationCheckpoint.native),
        nativeBoundary: checkpoint.native.boundary,
        hold: a.app.clock.hold,
        token: view.prevClockState === a.holdToken,
      };
    },
    {
      ...presentationControl,
      endFrame: activePresentationRun.endFrame,
    },
  );
  assert.ok(
    activePresentationRun.endFrame >= presentationControl.startFrame + 8,
    "active RAF advanced at least eight complete rule+draw frames",
  );
  assert.deepEqual(
    replayedPresentationControl.rng,
    activePresentationRun.rng,
    "active RAF draw/sync adds no RNG beyond deterministic rule replay",
  );
  assert.equal(
    replayedPresentationControl.snapshotText,
    activePresentationRun.snapshotText,
    "active RAF draw/sync leaves the exact rule snapshot equal to rule-only replay",
  );
  assert.equal(
    replayedPresentationControl.nativeText,
    activePresentationRun.nativeText,
    "replay restores exact scratch/framebuffer/known-mask/native boundary history",
  );
  assert.equal(
    replayedPresentationControl.restoredNativeMatches,
    true,
    "restore reinstates scratch/framebuffer/known-mask/native boundary byte-for-byte",
  );
  assert.equal(
    replayedPresentationControl.nativeBoundary,
    activePresentationRun.nativeBoundary,
    "session/process replay ends on the same display boundary",
  );
  assert.equal(activePresentationRun.hold, presentationControl.hold);
  assert.equal(activePresentationRun.token, presentationControl.token);
  assert.equal(replayedPresentationControl.hold, presentationControl.hold);
  assert.equal(replayedPresentationControl.token, presentationControl.token);

  // Establish a stable legal command baseline after genuine A1C5 completion.
  await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    a.app.battleView.setRuntimeEnabled(false);
    a.battle.session.registers.themeFlag = 1;
    a.battle.session.registers.winnerState = 0;
    a.battle.session.registers.selectedGroupMask = 0;
    a.battle.session.playerGroupStatusIcons.fill(4);
    for (let group = 0; group < 6; group++) {
      const address = a.originalObjectAddress(0, group, 0);
      a.battle.session.pool.write8(address, a.O.CURRENT_COMMAND, 8);
      a.battle.session.pool.write8(address, a.O.PENDING_COMMAND, 8);
    }
  });

  const controlSelector =
    ".battle-cmd-img-btn, .battle-symbol-btn, .battle-deployment-btn, .battle-unit-card";
  const geometry = await page.locator(controlSelector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return {
        id: node.id,
        formation: node.dataset.formation ?? null,
        deployment: node.dataset.baseX ?? null,
        rect: [rect.x, rect.y, rect.width, rect.height],
        hit: hit === node || node.contains(hit),
        disabled: node.disabled,
      };
    }),
  );
  assert.equal(
    geometry.length,
    31,
    "all retained tactical controls are present",
  );
  for (const control of geometry) {
    assert.ok(
      control.rect[2] > 0 && control.rect[3] > 0,
      `${control.id || control.formation}: visible area`,
    );
    assert.equal(
      control.hit,
      true,
      `${control.id || control.formation}: browser hit-test`,
    );
    assert.equal(
      control.disabled,
      false,
      `${control.id || control.formation}: enabled`,
    );
  }
  assert.equal(
    await page
      .locator(
        "#battle-minimap, #battle-double-arrow, [data-battlefield-display-toggle]",
      )
      .count(),
    0,
  );

  let actualClicks = 0;
  async function pausedState() {
    return page.evaluate(() => {
      const a = globalThis.__battleAcceptance;
      return {
        frame: a.battle.session.frame,
        rng: a.battle.session.rng.snapshot(),
        hold: a.app.clock.hold,
        token: a.app.battleView.prevClockState === a.holdToken,
      };
    });
  }
  async function actualPausedClick(selector, options = {}) {
    const before = await pausedState();
    await page.locator(selector).click({ timeout: 3000, ...options });
    const after = await pausedState();
    assert.deepEqual(
      after,
      before,
      `${selector}: DOM click routing itself mutates no frame/RNG/hold token`,
    );
    actualClicks++;
  }
  async function resumeUntil(predicate, argument, message) {
    await page.evaluate(() =>
      globalThis.__battleAcceptance.app.battleView.setRuntimeEnabled(true),
    );
    await page.waitForFunction(predicate, argument, { timeout: 4000 });
    await page.evaluate(() =>
      globalThis.__battleAcceptance.app.battleView.setRuntimeEnabled(false),
    );
    assert.equal(
      (await pausedState()).hold,
      true,
      `${message}: strategic hold remains owned by battle`,
    );
  }

  // Six cards are real hit targets; toggle each through DOM and observe live D310.
  for (let card = 0; card < 6; card++) {
    const rawGroup = [2, 4, 0, 1, 5, 3][card];
    await actualPausedClick(`#bunit${card}`);
    await resumeUntil(
      ({ rawGroup }) =>
        (globalThis.__battleAcceptance.battle.session.registers
          .selectedGroupMask &
          (1 << rawGroup)) !==
        0,
      { rawGroup },
      `card ${card} select`,
    );
    await actualPausedClick(`#bunit${card}`);
    await resumeUntil(
      ({ rawGroup }) =>
        (globalThis.__battleAcceptance.battle.session.registers
          .selectedGroupMask &
          (1 << rawGroup)) ===
        0,
      { rawGroup },
      `card ${card} clear`,
    );
  }

  // All sixteen actual formation clicks must reach live D346/D342.
  for (let formation = 0; formation < 16; formation++) {
    await actualPausedClick(
      `.battle-symbol-btn[data-formation="${formation}"]`,
    );
    await resumeUntil(
      (formation) => {
        const r = globalThis.__battleAcceptance.battle.session.registers;
        return (
          r.selectedFormation === formation &&
          r.side0FormationOffset === formation * 0x60
        );
      },
      formation,
      `formation ${formation}`,
    );
  }

  // All three deployment controls are dispatched too; low byte is the C165/C181/C19D X base.
  for (const baseX of [48, 28, 5]) {
    await actualPausedClick(`.battle-deployment-btn[data-base-x="${baseX}"]`);
    await resumeUntil(
      (baseX) =>
        (globalThis.__battleAcceptance.battle.session.registers
          .side0FormationBase &
          0xff) ===
        baseX,
      baseX,
      `deployment ${baseX}`,
    );
  }

  const commandCases = [
    ["#bformation", 0, 0x1b1],
    ["#battack", 1, 0x1b2],
    ["#bassault", 2, 0x1b3],
    ["#bwall", 3, 0x1b4],
    ["#bdefend", 4, 0x1b5],
  ];
  let commandPanelFrameProof = null;
  for (const [selector, command, expectedSelector] of commandCases) {
    await actualPausedClick("#bunit0");
    await resumeUntil(
      () =>
        (globalThis.__battleAcceptance.battle.session.registers
          .selectedGroupMask &
          (1 << 2)) !==
        0,
      null,
      `${selector} group selection`,
    );
    const boundary = await page.evaluate(() => {
      const a = globalThis.__battleAcceptance;
      return {
        talks: a.battle.session.events.filter(
          (event) =>
            event.type === "tactical-talk-show" &&
            event.message.source === "C1B9/C21A",
        ).length,
        status: document.querySelector("#bunit0 .battle-card-status").dataset
          .command,
        frame: a.battle.session.frame,
        anchor: [
          a.battle.session.pool.read8(
            a.originalObjectAddress(0, 2, 0),
            a.O.ANCHOR_X,
          ),
          a.battle.session.pool.read8(
            a.originalObjectAddress(0, 2, 0),
            a.O.ANCHOR_Y,
          ),
        ],
      };
    });
    if (command === 1) {
      const visible = await page
        .locator("#bdialogue-atk")
        .getAttribute("data-kind");
      assert.equal(
        visible,
        "decoded",
        "a second command remains clickable while the first command dialogue is visible",
      );
    }
    await actualPausedClick(selector);
    const queuedBoundary = await page.evaluate(() => {
      const a = globalThis.__battleAcceptance;
      return {
        talks: a.battle.session.events.filter(
          (event) =>
            event.type === "tactical-talk-show" &&
            event.message.source === "C1B9/C21A",
        ).length,
        status: document.querySelector("#bunit0 .battle-card-status").dataset
          .command,
        queueType: a.battle.session.queue.commands.at(-1)?.type,
      };
    });
    assert.equal(
      queuedBoundary.talks,
      boundary.talks,
      `${selector}: no C315 before queued input is consumed`,
    );
    assert.equal(
      queuedBoundary.status,
      boundary.status,
      `${selector}: status image does not change at pointer time`,
    );
    assert.equal(
      queuedBoundary.queueType,
      "tactical-command",
      `${selector}: actual click queued production input`,
    );
    await resumeUntil(
      ({ talks, command }) => {
        const a = globalThis.__battleAcceptance;
        const count = a.battle.session.events.filter(
          (event) =>
            event.type === "tactical-talk-show" &&
            event.message.source === "C1B9/C21A",
        ).length;
        return (
          count === talks + 1 &&
          document.querySelector("#bunit0 .battle-card-status").dataset
            .command === String(command)
        );
      },
      { talks: boundary.talks, command },
      `${selector} acceptance`,
    );
    const accepted = await page.evaluate(() => {
      const a = globalThis.__battleAcceptance;
      const talks = a.battle.session.events.filter(
        (event) =>
          event.type === "tactical-talk-show" &&
          event.message.source === "C1B9/C21A",
      );
      const status = document.querySelector("#bunit0 .battle-card-status");
      const address = a.originalObjectAddress(0, 2, 0);
      return {
        frame: a.battle.session.frame,
        selector: talks.at(-1).message.selector,
        talkCount: talks.length,
        current: a.battle.session.pool.read8(address, a.O.CURRENT_COMMAND),
        pending: a.battle.session.pool.read8(address, a.O.PENDING_COMMAND),
        status: status.dataset.command,
        background: status.style.backgroundImage,
        target: [
          a.battle.session.pool.read8(address, a.O.TARGET_X),
          a.battle.session.pool.read8(address, a.O.TARGET_Y),
        ],
      };
    });
    assert.equal(
      accepted.selector,
      expectedSelector,
      `${selector}: exact C315 selector`,
    );
    assert.equal(
      accepted.talkCount,
      boundary.talks + 1,
      `${selector}: one-shot C315`,
    );
    assert.equal(
      accepted.status,
      String(command),
      `${selector}: A8CC status boundary`,
    );
    assert.match(
      accepted.background,
      new RegExp(`battle_status_${command}\\.png`),
    );

    if (command === 0) {
      assert.notDeepEqual(
        accepted.target,
        boundary.anchor,
        "AA2C writes a live formation target",
      );
      await resumeUntil(
        ({ anchor, frame }) => {
          const a = globalThis.__battleAcceptance;
          const address = a.originalObjectAddress(0, 2, 0);
          const moved =
            a.battle.session.pool.read8(address, a.O.ANCHOR_X) !== anchor[0] ||
            a.battle.session.pool.read8(address, a.O.ANCHOR_Y) !== anchor[1];
          return moved && a.battle.session.frame >= frame + 2;
        },
        { anchor: boundary.anchor, frame: accepted.frame },
        "AA2C movement",
      );
      const panelProofStart = await page.evaluate(() => ({
        frame: globalThis.__battleAcceptance.battle.session.frame,
        visible: document.querySelector("#bdialogue-atk").dataset.kind,
      }));
      assert.equal(panelProofStart.visible, "decoded");
      await resumeUntil(
        (frame) =>
          globalThis.__battleAcceptance.battle.session.frame >= frame + 5 &&
          document.querySelector("#bdialogue-atk").dataset.kind === "decoded",
        panelProofStart.frame,
        "command panel frame continuity",
      );
      commandPanelFrameProof = {
        from: panelProofStart.frame,
        to: (await pausedState()).frame,
      };
    }
    results.commands.push({
      selector,
      command,
      expectedSelector,
      boundary,
      accepted,
    });
  }

  // Retreat is last. Dismiss once while it is still queued, then accept it and
  // dismiss its fresh presentation again; neither contextmenu may alter RNG,
  // hold ownership, queue/accepted command, or tactical frame.
  await actualPausedClick("#bunit0");
  await resumeUntil(
    () =>
      (globalThis.__battleAcceptance.battle.session.registers
        .selectedGroupMask &
        (1 << 2)) !==
      0,
    null,
    "retreat group selection",
  );
  const retreatBefore = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    return {
      talks: a.battle.session.events.filter(
        (event) =>
          event.type === "tactical-talk-show" &&
          event.message.source === "C1B9/C21A",
      ).length,
      status: document.querySelector("#bunit0 .battle-card-status").dataset
        .command,
    };
  });
  await actualPausedClick("#bretreat");
  const queuedRetreat = await page.evaluate(() =>
    structuredClone(
      globalThis.__battleAcceptance.battle.session.queue.commands,
    ),
  );
  assert.equal(queuedRetreat.at(-1)?.commandNumber, 5);
  assert.equal(
    await page.locator("#bdialogue-atk").getAttribute("data-kind"),
    "decoded",
  );
  await actualPausedClick("#bformation", { button: "right" });
  assert.equal(
    await page.locator("#bdialogue-atk").getAttribute("data-kind"),
    "",
    "real contextmenu dismisses presentation",
  );
  assert.deepEqual(
    await page.evaluate(() =>
      structuredClone(
        globalThis.__battleAcceptance.battle.session.queue.commands,
      ),
    ),
    queuedRetreat,
    "right-click does not cancel a queued command",
  );
  await resumeUntil(
    ({ talks }) => {
      const a = globalThis.__battleAcceptance;
      const count = a.battle.session.events.filter(
        (event) =>
          event.type === "tactical-talk-show" &&
          event.message.source === "C1B9/C21A",
      ).length;
      return (
        count === talks + 1 &&
        document.querySelector("#bunit0 .battle-card-status").dataset
          .command === "5"
      );
    },
    { talks: retreatBefore.talks },
    "retreat acceptance",
  );
  const acceptedRetreat = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    const talks = a.battle.session.events.filter(
      (event) =>
        event.type === "tactical-talk-show" &&
        event.message.source === "C1B9/C21A",
    );
    return {
      selector: talks.at(-1).message.selector,
      talkCount: talks.length,
      winnerState: a.battle.session.registers.winnerState,
      statuses: Array.from(a.battle.session.playerGroupStatusIcons),
      pending: Array.from({ length: 6 }, (_, group) =>
        a.battle.session.pool.read8(
          a.originalObjectAddress(0, group, 0),
          a.O.PENDING_COMMAND,
        ),
      ),
    };
  });
  assert.equal(acceptedRetreat.selector, 0x1af);
  assert.equal(acceptedRetreat.talkCount, retreatBefore.talks + 1);
  assert.equal(acceptedRetreat.winnerState, 1);
  assert.deepEqual(acceptedRetreat.statuses, [5, 5, 5, 5, 5, 5]);
  assert.equal(
    await page.locator("#bdialogue-atk").getAttribute("data-kind"),
    "decoded",
  );
  await actualPausedClick("#bformation", { button: "right" });
  assert.equal(
    await page.locator("#bdialogue-atk").getAttribute("data-kind"),
    "",
  );
  const afterAcceptedDismiss = await page.evaluate(() => {
    const a = globalThis.__battleAcceptance;
    return {
      winnerState: a.battle.session.registers.winnerState,
      statuses: Array.from(a.battle.session.playerGroupStatusIcons),
      pending: Array.from({ length: 6 }, (_, group) =>
        a.battle.session.pool.read8(
          a.originalObjectAddress(0, group, 0),
          a.O.PENDING_COMMAND,
        ),
      ),
    };
  });
  assert.deepEqual(
    afterAcceptedDismiss,
    {
      winnerState: acceptedRetreat.winnerState,
      statuses: acceptedRetreat.statuses,
      pending: acceptedRetreat.pending,
    },
    "right-click does not undo an accepted command",
  );

  const layout = await page.evaluate(async () => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return {
        rect: [rect.x, rect.y, rect.width, rect.height],
        size: [Number.parseFloat(css.width), Number.parseFloat(css.height)],
        fontSize: css.fontSize,
      };
    };
    const pixelHash = async (pixels) => {
      const digest = await crypto.subtle.digest("SHA-256", pixels);
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const load = (src) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    const sources = await Promise.all(
      ["frame_sq.png", "frame_col.png", "frame_cap.png"].map(async (name) => {
        const src = `/grf/ui/${name}`;
        const image = await load(src);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        return {
          name,
          src,
          image,
          size: [canvas.width, canvas.height],
          decodedPixelHash: await pixelHash(pixels),
        };
      }),
    );
    const source = Object.fromEntries(
      sources.map((entry) => [entry.name, entry]),
    );
    const expected = document.createElement("canvas");
    expected.width = 480;
    expected.height = 80;
    const expectedContext = expected.getContext("2d");
    expectedContext.imageSmoothingEnabled = false;
    for (const y of [0, expected.height - 8]) {
      for (let x = 8; x < expected.width - 8; x += 8)
        expectedContext.drawImage(source["frame_sq.png"].image, x, y);
    }
    for (const x of [0, expected.width - 8]) {
      expectedContext.drawImage(source["frame_cap.png"].image, x, 0);
      for (let y = 8; y < expected.height - 8; y += 8)
        expectedContext.drawImage(source["frame_col.png"].image, x, y);
      expectedContext.drawImage(
        source["frame_cap.png"].image,
        x,
        expected.height - 8,
      );
    }
    expectedContext.fillStyle = "#000000";
    expectedContext.fillRect(8, 8, expected.width - 16, expected.height - 16);
    const expectedPixels = expectedContext.getImageData(
      0,
      0,
      expected.width,
      expected.height,
    ).data;
    const expectedHash = await pixelHash(expectedPixels);
    const cornerPoints = [
      [0, 0],
      [7, 0],
      [8, 0],
      [471, 0],
      [479, 0],
      [0, 8],
      [8, 8],
      [240, 40],
      [0, 71],
      [0, 79],
      [479, 79],
    ];
    const samples = (pixels, width) =>
      cornerPoints.map(([x, y]) => {
        const offset = (y * width + x) * 4;
        return { point: [x, y], rgba: [...pixels.slice(offset, offset + 4)] };
      });
    const expectedCorners = samples(expectedPixels, expected.width);
    const dialogues = await Promise.all(
      ["#bdialogue-def", "#bdialogue-atk"].map(async (selector) => {
        const element = document.querySelector(selector);
        const frame = element.querySelector(".battle-window-frame");
        const pixels = frame
          .getContext("2d")
          .getImageData(0, 0, frame.width, frame.height).data;
        return {
          selector,
          box: measure(selector),
          frame: [frame.width, frame.height],
          image: measure(`${selector} img`).size,
          copy: measure(`${selector} .battle-dialogue-copy`).size,
          pixelHash: await pixelHash(pixels),
          corners: samples(pixels, frame.width),
        };
      }),
    );
    return {
      dialogues,
      frameOracle: {
        expectedHash,
        expectedCorners,
        sources: sources.map(({ name, src, size, decodedPixelHash }) => ({
          name,
          src,
          size,
          decodedPixelHash,
        })),
      },
      controls: document.querySelectorAll(
        ".battle-cmd-img-btn, .battle-symbol-btn, .battle-deployment-btn, .battle-unit-card",
      ).length,
      tacticalButtons: [
        ...document.querySelectorAll("#bctl button, #battle-bottom-bar button"),
      ].map(
        (button) =>
          button.id || button.dataset.formation || button.dataset.baseX,
      ),
    };
  });
  const topPaint = startupPaints.find((paint) => paint.side === 1);
  const bottomPaint = startupPaints.find((paint) => paint.side === 0);
  assert.deepEqual(topPaint.rect, [272, 16, 480, 80]);
  assert.deepEqual(bottomPaint.rect, [272, 672, 480, 80]);
  assert.equal(
    topPaint.rect[0],
    bottomPaint.rect[0],
    "top/bottom dialogues share centered left edge",
  );
  assert.equal(
    layout.frameOracle.expectedHash,
    dialogueFramePixelHash,
    "independent source composition has the pinned 480x80 RGBA SHA-256",
  );
  for (const dialogue of layout.dialogues) {
    assert.deepEqual(dialogue.box.size, [480, 80]);
    assert.deepEqual(
      dialogue.frame,
      [480, 80],
      "texture canvas backing is exact",
    );
    assert.deepEqual(dialogue.image, [64, 64]);
    assert.equal(dialogue.copy[1], 64);
    assert.equal(dialogue.box.fontSize, "16px");
    assert.equal(
      dialogue.pixelHash,
      layout.frameOracle.expectedHash,
      `${dialogue.selector}: exact RGBA SHA-256 matches independent source-asset composition`,
    );
    assert.deepEqual(
      dialogue.corners,
      layout.frameOracle.expectedCorners,
      `${dialogue.selector}: caps, rails, and black interior corner composition`,
    );
  }
  assert.deepEqual(
    layout.frameOracle.sources.map((source) => source.src),
    ["/grf/ui/frame_sq.png", "/grf/ui/frame_col.png", "/grf/ui/frame_cap.png"],
  );
  assert.equal(layout.controls, 31);
  assert.equal(
    layout.tacticalButtons.length,
    31,
    "no tactical minimap/double-arrow control remains",
  );

  // Real production RAF matrix for all five tactical settings. Each row opens
  // a fresh deterministic battle with a cold process compositor, so the first
  // enabled RAF exercises the actual first A1C5 A065 rather than a synthetic
  // dt call. Equal rule-frame endpoints must remain identical.
  const tacticalRafMatrix = await page.evaluate(async () => {
    const a = globalThis.__battleAcceptance;
    const view = a.app.battleView;
    const { OriginalBattleDisplayProcess } = await import(
      "/src/render/originalcompositor.js"
    );
    const priorTacticalSpeed = a.app.tacticalSpeed;
    const rows = [];
    let expectedSession = null;
    let expectedNative = null;
    let expectedVm = null;
    for (let speed = 0; speed < 5; speed++) {
      view.active = false;
      cancelAnimationFrame(view._raf);
      view.clearBattleDialogue();
      view.originalDisplayProcess.endBattle();
      view.originalDisplayProcess = new OriginalBattleDisplayProcess();
      const coldScratch = view.originalDisplayProcess.scratch.every(
        (value) => value === 0,
      );
      view.setRuntimeEnabled(false);
      a.app.tacticalSpeed = speed;
      const battle = a.createFieldBattle(
        a.scenario,
        a.legion(0, 0),
        a.legion(1, 1),
        a.app.battleMaps,
        { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
      );
      const first = a.originalObjectAddress(0, 0, 0);
      const second = a.originalObjectAddress(1, 0, 0);
      battle.session.pool.write8(first, a.O.POWER, 100);
      battle.session.pool.write8(second, a.O.POWER, 30);
      battle.session.registers.mode = 0;
      battle.session.registers.siegeLeaderTick = 10;
      battle.session.registers.themeFlag = 1;
      battle.session.registers.battleSideFlag &= 0x7f;
      const callbacks = [];
      const hpByFrame = [];
      const originalUpdate = view.updateBattleFrames;
      let blockedAt = null;
      let finishCallbacks = 0;
      view.updateBattleFrames = function (dt) {
        const before = battle.session.frame;
        const result = originalUpdate.call(this, dt);
        const after = battle.session.frame;
        callbacks.push({
          at: performance.now(),
          dt,
          before,
          after,
          advanced: after - before,
          remainderMs: this.scriptAccumulator,
        });
        if (after !== before)
          hpByFrame.push({
            frame: after,
            hp: battle.session.pool.read8(0, a.O.HP),
          });
        if (speed === 2 && after === 20 && blockedAt == null) {
          blockedAt = callbacks.length - 1;
          this.scriptAccumulator = 0;
          const until = performance.now() + 250;
          while (performance.now() < until) {}
        }
        if (after >= 52) this.setRuntimeEnabled(false);
        return result;
      };
      await view.open(battle, () => finishCallbacks++);
      view.setRuntimeEnabled(true);
      const deadline = performance.now() + 20000;
      while (battle.session.frame < 52) {
        if (performance.now() > deadline)
          throw new Error(`tactical speed ${speed} RAF timeout`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      view.setRuntimeEnabled(false);
      view.updateBattleFrames = originalUpdate;
      const sessionText = JSON.stringify(
        battle.session.snapshot(),
        (_key, value) => (ArrayBuffer.isView(value) ? [...value] : value),
      );
      const native = view.originalDisplayProcess.snapshotBattle();
      const nativeText = JSON.stringify(native);
      const vm = view.battleScriptVm;
      const vmText = JSON.stringify({
        pc: vm.pc,
        wait: vm.wait,
        R: vm.R,
        cmd: vm.cmd,
        mode: vm.mode,
        done: vm.done,
      });
      expectedSession ??= sessionText;
      expectedNative ??= nativeText;
      expectedVm ??= vmText;
      const advancing = callbacks.filter((entry) => entry.advanced);
      const spacings = advancing
        .slice(1)
        .map((entry, index) => entry.at - advancing[index].at)
        .filter((value) => speed === 4 || value < 300);
      spacings.sort((x, y) => x - y);
      const delayed = blockedAt == null ? null : callbacks[blockedAt + 1];
      const postBlock =
        blockedAt == null ? [] : callbacks.slice(blockedAt + 1, blockedAt + 3);
      const row = {
        speed,
        coldScratch,
        firstCallbackAdvance: callbacks[0]?.advanced ?? 0,
        maxFramesPerCallback: Math.max(
          ...callbacks.map((entry) => entry.advanced),
        ),
        medianSpacingMs: spacings[Math.floor(spacings.length / 2)] ?? 0,
        hpChanges: hpByFrame.filter(
          (entry, index) => index === 0 || entry.hp !== hpByFrame[index - 1].hp,
        ),
        equalSession: sessionText === expectedSession,
        equalNative: nativeText === expectedNative,
        equalVm: vmText === expectedVm,
        boundary: native.boundary,
        delayedDtMs: delayed == null ? null : delayed.dt * 1000,
        delayedAdvance: delayed?.advanced ?? null,
        delayedRemainderMs: delayed?.remainderMs ?? null,
        delayedNextTwoFrames: postBlock.reduce(
          (sum, entry) => sum + entry.advanced,
          0,
        ),
      };
      // End through one final real RAF so finish() performs the production
      // teardown rather than leaving an active battle/process owner behind.
      battle.session.registers.winnerState = 1;
      battle.session.registers.endCountdown = 1;
      a.app.tacticalSpeed = 4;
      view.setRuntimeEnabled(true);
      const closeDeadline = performance.now() + 2000;
      while (view.active) {
        if (performance.now() > closeDeadline)
          throw new Error(`tactical speed ${speed} close timeout`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      row.closed =
        finishCallbacks === 1 &&
        !view.active &&
        view.originalDisplayProcess.snapshotBattle() == null;
      rows.push(row);
    }
    a.app.tacticalSpeed = priorTacticalSpeed;
    return rows;
  });
  const expectedIntervals = [219.7016, 164.7762, 109.8508, 54.9254];
  for (const row of tacticalRafMatrix) {
    assert.equal(
      row.coldScratch,
      true,
      `tactical speed ${row.speed}: process compositor starts cold`,
    );
    assert.equal(
      row.closed,
      true,
      `tactical speed ${row.speed}: battle and process close through production finish`,
    );
    assert.equal(
      row.firstCallbackAdvance,
      1,
      `tactical speed ${row.speed}: first enabled RAF immediately executes first A065`,
    );
    assert.ok(
      row.maxFramesPerCallback <= 1,
      `tactical speed ${row.speed}: at most one complete frame per RAF`,
    );
    assert.equal(
      row.equalSession,
      true,
      `tactical speed ${row.speed}: equal-frame complete Session endpoint`,
    );
    assert.equal(
      row.equalNative,
      true,
      `tactical speed ${row.speed}: equal-frame native compositor endpoint`,
    );
    assert.equal(
      row.equalVm,
      true,
      `tactical speed ${row.speed}: equal-frame VM endpoint`,
    );
    assert.deepEqual(
      row.hpChanges.map((entry) => entry.frame),
      [1, 10, 20, 30, 40, 50],
      `tactical speed ${row.speed}: leader HP changes once per ten rule frames`,
    );
    if (row.speed < 4)
      assert.ok(
        Math.abs(row.medianSpacingMs - expectedIntervals[row.speed]) < 25,
        `tactical speed ${row.speed}: cadence follows authenticated relative wait`,
      );
  }
  assert.deepEqual(
    tacticalRafMatrix.slice(0, 4).map((row) => row.medianSpacingMs),
    [...tacticalRafMatrix.slice(0, 4)]
      .map((row) => row.medianSpacingMs)
      .sort((a, b) => b - a),
    "nonzero tactical settings retain slow-to-fast relative cadence",
  );
  assert.ok(
    tacticalRafMatrix[4].medianSpacingMs < tacticalRafMatrix[3].medianSpacingMs,
    "highest has no original added wait; no fixed original FPS is asserted",
  );
  const delayedNormalRaf = tacticalRafMatrix[2];
  assert.ok(
    delayedNormalRaf.delayedDtMs >= 240,
    "actual delayed RAF passes its full elapsed delta instead of a 50ms clamp",
  );
  assert.equal(
    delayedNormalRaf.delayedAdvance,
    1,
    "delayed normal-speed RAF advances exactly one complete frame",
  );
  assert.ok(
    Math.abs(
      delayedNormalRaf.delayedRemainderMs -
        (delayedNormalRaf.delayedDtMs % expectedIntervals[2]),
    ) < 0.01,
    "delayed normal-speed RAF retains the true modulo fractional phase",
  );
  assert.ok(
    delayedNormalRaf.delayedNextTwoFrames <= 1,
    "blocked RAF produces no catch-up burst or draining frame debt",
  );

  // Five independent production RAF battles at one fixed tactical speed.
  // Only strategic speed varies; each row owns a fresh BattleView and cold
  // display process, and reaches the same frame through captured real RAF
  // callbacks rather than direct updateBattleFrames calls.
  const speedMatrix = await page.evaluate(async () => {
    const a = globalThis.__battleAcceptance;
    const { BattleView } = await import("/src/render/battleview.js");
    const priorStrategicSpeed = a.app.clock.strategicSpeed;
    const priorTacticalSpeed = a.app.tacticalSpeed;
    const fixedTacticalSpeed = 3;
    const rows = [];
    for (let strategicSpeed = 0; strategicSpeed < 5; strategicSpeed++) {
      a.app.clock.strategicSpeed = strategicSpeed;
      a.app.tacticalSpeed = fixedTacticalSpeed;
      const view = new BattleView(a.app.battleView.cv, a.app);
      const coldScratch = view.originalDisplayProcess.scratch.every(
        (value) => value === 0,
      );
      view.setRuntimeEnabled(false);
      const battle = a.createFieldBattle(
        a.scenario,
        a.legion(0, 0),
        a.legion(1, 1),
        a.app.battleMaps,
        { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
      );
      const first = a.originalObjectAddress(0, 0, 0);
      const second = a.originalObjectAddress(1, 0, 0);
      battle.session.pool.write8(first, a.O.POWER, 100);
      battle.session.pool.write8(second, a.O.POWER, 30);
      battle.session.registers.mode = 0;
      battle.session.registers.siegeLeaderTick = 10;
      battle.session.registers.themeFlag = 1;
      battle.session.registers.battleSideFlag &= 0x7f;
      const callbacks = [];
      const hpByFrame = [];
      const originalUpdate = view.updateBattleFrames;
      let finishCallbacks = 0;
      view.updateBattleFrames = function (dt) {
        const before = battle.session.frame;
        const result = originalUpdate.call(this, dt);
        const after = battle.session.frame;
        callbacks.push({
          at: performance.now(),
          dt,
          before,
          after,
          advanced: after - before,
        });
        if (after !== before)
          hpByFrame.push({
            frame: after,
            hp: battle.session.pool.read8(0, a.O.HP),
          });
        if (after >= 52) this.setRuntimeEnabled(false);
        return result;
      };
      await view.open(battle, () => finishCallbacks++);
      view.setRuntimeEnabled(true);
      const deadline = performance.now() + 8000;
      while (battle.session.frame < 52) {
        if (performance.now() > deadline)
          throw new Error(`strategic speed ${strategicSpeed} RAF timeout`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      view.setRuntimeEnabled(false);
      view.updateBattleFrames = originalUpdate;
      const native = view.originalDisplayProcess.snapshotBattle();
      const vm = view.battleScriptVm;
      const advancing = callbacks.filter((entry) => entry.advanced);
      const spacings = advancing
        .slice(1)
        .map((entry, index) => entry.at - advancing[index].at)
        .sort((left, right) => left - right);
      const row = {
        strategicSpeed,
        strategicStepMs: a.app.clock.currentStep,
        tacticalSpeed: fixedTacticalSpeed,
        coldScratch,
        firstCallbackAdvance: callbacks[0]?.advanced ?? 0,
        callbackCount: callbacks.length,
        maxFramesPerCallback: Math.max(
          ...callbacks.map((entry) => entry.advanced),
        ),
        medianSpacingMs: spacings[Math.floor(spacings.length / 2)] ?? 0,
        hpChanges: hpByFrame.filter(
          (entry, index) => index === 0 || entry.hp !== hpByFrame[index - 1].hp,
        ),
        rng: battle.session.rng.snapshot(),
        snapshotText: JSON.stringify(
          battle.session.snapshot(),
          (_key, value) => (ArrayBuffer.isView(value) ? [...value] : value),
        ),
        nativeText: JSON.stringify(native),
        vmText: JSON.stringify({
          pc: vm.pc,
          wait: vm.wait,
          R: vm.R,
          cmd: vm.cmd,
          mode: vm.mode,
          done: vm.done,
        }),
      };
      // Trigger terminal A6FA on a final real RAF and require finish() to
      // release the battle-scoped compositor before constructing the next row.
      battle.session.registers.winnerState = 1;
      battle.session.registers.endCountdown = 1;
      a.app.tacticalSpeed = 4;
      view.setRuntimeEnabled(true);
      const closeDeadline = performance.now() + 2000;
      while (view.active) {
        if (performance.now() > closeDeadline)
          throw new Error(`strategic speed ${strategicSpeed} close timeout`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      row.closed =
        finishCallbacks === 1 &&
        !view.active &&
        view.originalDisplayProcess.snapshotBattle() == null;
      rows.push(row);
    }
    a.app.clock.strategicSpeed = priorStrategicSpeed;
    a.app.tacticalSpeed = priorTacticalSpeed;
    return rows;
  });
  assert.deepEqual(
    speedMatrix.map((row) => row.strategicStepMs),
    [240, 140, 80, 40, 12.5],
    "strategic speed retains its independent Web clock behavior",
  );
  for (const row of speedMatrix) {
    assert.equal(row.tacticalSpeed, 3, "strategic matrix fixes tactical speed");
    assert.equal(
      row.coldScratch,
      true,
      `strategic speed ${row.strategicSpeed}: fresh process starts cold`,
    );
    assert.equal(
      row.closed,
      true,
      `strategic speed ${row.strategicSpeed}: battle/process closes cleanly`,
    );
    assert.equal(
      row.firstCallbackAdvance,
      1,
      `strategic speed ${row.strategicSpeed}: first RAF runs immediate startup frame`,
    );
    assert.ok(
      row.callbackCount >= 52,
      `strategic speed ${row.strategicSpeed}: frames came from distinct actual callbacks`,
    );
    assert.ok(
      row.maxFramesPerCallback <= 1,
      `strategic speed ${row.strategicSpeed}: at most one frame per actual RAF`,
    );
    assert.ok(
      Math.abs(row.medianSpacingMs - expectedIntervals[3]) < 25,
      `strategic speed ${row.strategicSpeed}: fixed tactical RAF cadence`,
    );
    assert.deepEqual(
      row.hpChanges.map((entry) => entry.frame),
      [1, 10, 20, 30, 40, 50],
      `strategic speed ${row.strategicSpeed}: ten-frame HP cadence`,
    );
    assert.deepEqual(
      row.hpChanges,
      speedMatrix[0].hpChanges,
      `strategic speed ${row.strategicSpeed}: equal-frame HP endpoint`,
    );
    assert.deepEqual(
      row.rng,
      speedMatrix[0].rng,
      `strategic speed ${row.strategicSpeed}: RNG endpoint`,
    );
    assert.equal(
      row.snapshotText,
      speedMatrix[0].snapshotText,
      `strategic speed ${row.strategicSpeed}: full Session endpoint`,
    );
    assert.equal(
      row.vmText,
      speedMatrix[0].vmText,
      `strategic speed ${row.strategicSpeed}: VM endpoint`,
    );
    assert.equal(
      row.nativeText,
      speedMatrix[0].nativeText,
      `strategic speed ${row.strategicSpeed}: native endpoint`,
    );
  }
  assert.ok(
    Math.max(...speedMatrix.map((row) => row.medianSpacingMs)) -
      Math.min(...speedMatrix.map((row) => row.medianSpacingMs)) <
      25,
    "strategic setting does not alter fixed-tactical actual RAF cadence",
  );

  // Fresh production BattleView early-exit path: countdown terminates the
  // first yielded A065. It must settle once without A426/VM/start flash.
  await page.evaluate(async () => {
    const a = globalThis.__battleAcceptance;
    const view = a.app.battleView;
    view.active = false;
    cancelAnimationFrame(view._raf);
    view.clearBattleDialogue();
    view.originalDisplayProcess.endBattle();
    const early = a.createFieldBattle(
      a.scenario,
      a.legion(0, 0),
      a.legion(1, 1),
      a.app.battleMaps,
      { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
    );
    early.session.registers.winnerState = 1;
    early.session.registers.endCountdown = 1;
    let callbacks = 0;
    const priorFlash = a.app.hud.flashEvent;
    let flashes = 0;
    a.app.hud.flashEvent = () => flashes++;
    a.earlyStartupExit = { early, callbacks: 0, flashes: 0, done: false };
    await view.open(early, () => {
      callbacks++;
      a.earlyStartupExit.callbacks = callbacks;
      a.earlyStartupExit.flashes = flashes;
      a.earlyStartupExit.done = true;
      a.app.hud.flashEvent = priorFlash;
    });
    // Drive the same production RAF body deterministically; the existing
    // acceptance above separately verifies real requestAnimationFrame pacing.
    const over = view.updateBattleFrames(1);
    if (over) {
      view.draw();
      view.finish();
    }
  });
  await page.waitForFunction(
    () => globalThis.__battleAcceptance.earlyStartupExit?.done,
    null,
    { timeout: 8000 },
  );
  const earlyStartupExit = await page.evaluate(() => {
    const { app, earlyStartupExit: e } = globalThis.__battleAcceptance;
    return {
      callbacks: e.callbacks,
      flashes: e.flashes,
      frame: e.early.session.frame,
      startupComplete: e.early.session.registers.startupComplete,
      battleEndEvents: e.early.session.events.filter(
        (event) => event.type === "battle-end",
      ).length,
      active: app.battleView.active,
      hasVm: app.battleView.battleScriptVm != null,
      hasStartup: app.battleView.battleStartup != null,
    };
  });
  assert.deepEqual(earlyStartupExit, {
    callbacks: 1,
    flashes: 0,
    frame: 1,
    startupComplete: false,
    battleEndEvents: 1,
    active: false,
    hasVm: false,
    hasStartup: false,
  });

  assert.ok(requests.has("/src/boot.js"), "production boot script loaded");
  assert.ok(requests.has("/src/main.js"), "production main module loaded");
  assert.ok(
    requests.has("/src/render/battleview.js"),
    "production BattleView module loaded",
  );
  assert.ok(
    requests.has("/battle_scripts.json"),
    "production battle scripts loaded",
  );
  assert.deepEqual(errors, [], "browser/resource errors");

  results.earlyStartupExit = earlyStartupExit;
  results.tacticalRafMatrix = tacticalRafMatrix;
  results.startup = {
    paints: startupPaints,
    frameContinuity: {
      from: firstVisible.frame,
      minimumTo: firstVisible.frame + 8,
    },
    dialogueOcclusion,
    strategicSpeedIsolation: speedMatrix.map(
      ({ snapshotText: _snapshotText, ...row }) => row,
    ),
    presentationInvariant: {
      controlStartFrame: presentationControl.startFrame,
      activePresentationRun: {
        endFrame: activePresentationRun.endFrame,
        rng: activePresentationRun.rng,
        hold: activePresentationRun.hold,
        token: activePresentationRun.token,
      },
      ruleOnlyReplay: {
        endFrame: replayedPresentationControl.endFrame,
        rng: replayedPresentationControl.rng,
        hold: replayedPresentationControl.hold,
        token: replayedPresentationControl.token,
      },
      exactRuleSnapshotMatch:
        replayedPresentationControl.snapshotText ===
        activePresentationRun.snapshotText,
    },
  };
  assert.equal(
    actualClicks,
    45,
    "all retained controls and both queued/accepted contextmenu paths used real clicks",
  );
  results.controls = {
    count: geometry.length,
    actualClicks,
    geometry,
    commandPanelFrameProof,
  };
  results.retreat = { queuedRetreat, acceptedRetreat, afterAcceptedDismiss };
  results.layout = layout;
  results.requests = [...requests].sort();
  results.errors = errors;
  results.screenshot = path.join(output, "battle-browser-acceptance.png");
  await page.screenshot({ path: results.screenshot });
  await writeFile(
    path.join(output, "battle-browser-results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(
    `PASS fresh ${results.browser}: real production BattleView/open, two-side A1C5 paints, 31 hit-tested controls, six commands, contextmenu invariants.`,
  );
  console.log(`Fresh profile began empty: ${profile}`);
  console.log(`Evidence: ${output}`);
} finally {
  if (context) await context.close();
  server.kill();
  await new Promise((resolve) => {
    if (server.exitCode == null) server.once("exit", resolve);
    else resolve();
  });
  results.profile.removedAfterRun = true;
  results.server.log = serverLog;
  await rm(profile, { recursive: true, force: true });
  if (results.screenshot)
    await writeFile(
      path.join(output, "battle-browser-results.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
}
