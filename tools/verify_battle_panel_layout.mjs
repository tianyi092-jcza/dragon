// Real Chromium layout of the production HTML/CSS, not a synthetic DOM/source guard.
// No app boot, battle scheduling or save access: only production viewport/frame methods.
// Requires EXISTING Playwright tooling; never installs packages or browser binaries.
// Example (global playwright-cli installation):
// PLAYWRIGHT_MODULE="$(npm root -g)/@playwright/cli/node_modules/playwright" \
//   node tools/verify_battle_panel_layout.mjs [external-artifact-directory]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
const root = fileURLToPath(new URL("../web/", import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : await mkdtemp(path.join(tmpdir(), "battle-panel-layout-"));
await mkdir(output, { recursive: true });
const origin = "http://battle-layout.test";
const mime = {
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};
const results = {
  scope: "isolated production HTML/CSS + viewport/frame methods, not gameplay",
  htmlSha256: createHash("sha256").update(html).digest("hex"),
  viewports: [],
};
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
results.browser = browser.version();
try {
  for (const viewport of [
    { width: 640, height: 400 },
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    // New nonpersistent context per size: no cookies, saved profile or cached ESM.
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    try {
      const errors = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          errors.push(`Unexpected external request: ${url.href}`);
          return route.abort();
        }
        if (url.pathname === "/") {
          // Keep every style and DOM control; omit only application boot scripts.
          return route.fulfill({
            contentType: "text/html",
            body: html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
          });
        }
        if (url.pathname === "/favicon.ico")
          return route.fulfill({ status: 204 });
        const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
        const relative = path.relative(root, file);
        const contentType = mime[path.extname(file)];
        if (
          relative.startsWith("..") ||
          path.isAbsolute(relative) ||
          !contentType
        ) {
          errors.push(`Disallowed fixture request: ${url.href}`);
          return route.abort();
        }
        try {
          await route.fulfill({ contentType, body: await readFile(file) });
        } catch (error) {
          errors.push(`${url.pathname}: ${error.message}`);
          await route.abort();
        }
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`${origin}/`);
      const measured = await page.evaluate(async () => {
        const { BattleView } = await import("/src/render/battleview.js");
        const { GameBar } = await import("/src/ui/gamebar.js");
        const { loadImage } = await import("/src/core/assets.js");
        const gamebar = Object.create(GameBar.prototype);
        const [cloud, sq, col, cap] = await Promise.all(
          ["cloud", "frame_sq", "frame_col", "frame_cap"].map((name) =>
            loadImage(`grf/ui/${name}.png`),
          ),
        );
        gamebar._gf = { cloud, sq, col, cap };
        const view = Object.create(BattleView.prototype);
        view.app = { gamebar };
        document.body.classList.add("game-active");
        document.querySelector("#bctl").style.display = "block";
        document.querySelector("#battle-bottom-bar").style.display = "block";
        // Presentation-only sample title: no scenario or rule state is created.
        document.querySelector("#btitle").textContent = "陸上　作戰";
        document.querySelector("#bbelligerents").textContent = "攻方　對　守方";
        const battlefield = view.battlefieldViewport();
        for (const [side, id] of [
          [0, "atk"],
          [1, "def"],
        ]) {
          const dialogue = document.querySelector(`#bdialogue-${id}`);
          dialogue.dataset.kind = "decoded";
          dialogue.dataset.originalSide = String(side);
          const image = dialogue.querySelector("img");
          image.src = "/kao/0.png";
          await image.decode();
        }
        document.querySelector("#bdialogue-def-text").textContent =
          "長篇中文會自動換行，標點，仍須限制在固定高度。第二行。第三行。第四行。";
        document.querySelector("#bdialogue-atk-text").textContent =
          "UNBROKEN_LATIN_TOKEN_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789\n明示換行";
        const selectedFormation = document.querySelector(
          '.battle-symbol-btn[data-formation="13"]',
        );
        selectedFormation.classList.add("active");
        view.drawBattleWindowFrames();
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        function measure(element) {
          const { x, y, width, height } = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          return {
            x,
            y,
            width,
            height,
            cssWidth: css.width,
            cssHeight: css.height,
            display: css.display,
            visibility: css.visibility,
            opacity: css.opacity,
          };
        }
        const windows = [
          ".battle-operation-header",
          ".battle-enemy-window",
          ".battle-player-window",
        ].map((selector) => {
          const element = document.querySelector(selector);
          const frame = element.querySelector(".battle-window-frame");
          return {
            selector,
            box: measure(element),
            frame: measure(frame),
            backing: [frame.width, frame.height],
            tiles: [
              Number(frame.dataset.windowCols),
              Number(frame.dataset.windowRows),
            ],
          };
        });
        const controls = [
          ...document.querySelectorAll(
            ".battle-cmd-img-btn, .battle-symbol-btn, .battle-deployment-btn, .battle-unit-card",
          ),
        ].map((element) => {
          const box = measure(element);
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return {
            id: element.id,
            formation: element.dataset.formation,
            deployment: element.dataset.baseX,
            box,
            hit: hit === element || element.contains(hit),
          };
        });
        const dialogues = ["#bdialogue-def", "#bdialogue-atk"].map(
          (selector) => {
            const element = document.querySelector(selector);
            const frame = element.querySelector(".battle-window-frame");
            const image = element.querySelector("img");
            const copy = element.querySelector(".battle-dialogue-copy");
            const css = getComputedStyle(element);
            const copyCss = getComputedStyle(copy);
            const text = element.querySelector(".battle-dialogue-text");
            const textCss = getComputedStyle(text);
            return {
              selector,
              box: measure(element),
              frame: measure(frame),
              image: measure(image),
              copy: {
                ...measure(copy),
                flexDirection: copyCss.flexDirection,
                justifyContent: copyCss.justifyContent,
              },
              backing: [frame.width, frame.height],
              natural: [image.naturalWidth, image.naturalHeight],
              tiles: [
                Number(frame.dataset.windowCols),
                Number(frame.dataset.windowRows),
              ],
              fontSize: css.fontSize,
              pointerEvents: css.pointerEvents,
              text: {
                clientWidth: text.clientWidth,
                clientHeight: text.clientHeight,
                scrollWidth: text.scrollWidth,
                scrollHeight: text.scrollHeight,
                whiteSpace: textCss.whiteSpace,
                overflowWrap: textCss.overflowWrap,
                wordBreak: textCss.wordBreak,
                overflow: textCss.overflow,
              },
            };
          },
        );
        const formationGridElement = document.querySelector(
          ".battle-symbols-grid",
        );
        const formationGridCss = getComputedStyle(formationGridElement);
        return {
          battlefield,
          windows,
          dialogues,
          controls,
          formationGrid: {
            ...measure(formationGridElement),
            borderWidth: formationGridCss.borderWidth,
            backgroundColor: formationGridCss.backgroundColor,
            gap: formationGridCss.gap,
            selectedBorder: getComputedStyle(selectedFormation, "::after")
              .borderTopColor,
          },
          cards: measure(document.querySelector("#battle-bottom-bar")),
        };
      });
      const name = `${viewport.width}x${viewport.height}`;
      const screenshot = path.join(output, `battle-panel-${name}.png`);
      await page.screenshot({ path: screenshot });
      const evidence = {
        viewport,
        screenshot,
        ...measured,
        errors,
        status: "measured",
      };
      results.viewports.push(evidence);
      // Persist measured evidence before assertions, including a failing baseline.
      await writeFile(
        path.join(output, "layout-results.json"),
        JSON.stringify(results, null, 2) + "\n",
      );
      assert.deepEqual(errors, [], `${name}: browser/resource errors`);
      assert.deepEqual(measured.battlefield, {
        ...viewport,
        sidebarWidth: 144,
        uiScale: 1,
      });
      const expected = [
        [16, 16, 192, 80],
        [viewport.width - 208, 16, 192, 112],
        [viewport.width - 208, viewport.height - 304, 192, 288],
      ];
      const rect = (box) => [box.x, box.y, box.width, box.height];
      function inside(box, parent, label) {
        assert.ok(
          box.width > 0 && box.height > 0,
          `${name}: ${label} has area`,
        );
        assert.ok(
          box.x >= parent.x &&
            box.y >= parent.y &&
            box.x + box.width <= parent.x + parent.width &&
            box.y + box.height <= parent.y + parent.height,
          `${name}: ${label} outside bounds: ${JSON.stringify(box)}`,
        );
        assert.notEqual(box.display, "none", label);
        assert.equal(box.visibility, "visible", label);
        assert.equal(box.opacity, "1", label);
      }
      measured.windows.forEach((window, index) => {
        assert.deepEqual(
          rect(window.box),
          expected[index],
          `${name}: ${window.selector} effective geometry`,
        );
        assert.deepEqual(
          rect(window.frame),
          expected[index],
          `${name}: ${window.selector} frame CSS geometry`,
        );
        assert.deepEqual(
          window.backing,
          expected[index].slice(2),
          "canvas backing must match CSS 1:1",
        );
        assert.deepEqual(
          window.tiles.map((n) => n * 16),
          window.backing,
          "frame tile dimensions",
        );
      });
      const [enemyDialogue, playerDialogue] = measured.dialogues;
      assert.deepEqual(rect(enemyDialogue.box), [
        (viewport.width - 480) / 2,
        16,
        480,
        80,
      ]);
      assert.deepEqual(rect(playerDialogue.box), [
        (viewport.width - 480) / 2,
        viewport.height - 96,
        480,
        80,
      ]);
      for (const dialogue of measured.dialogues) {
        assert.deepEqual(
          rect(dialogue.frame),
          rect(dialogue.box),
          `${name}: textured frame is 1:1`,
        );
        assert.deepEqual(dialogue.backing, [480, 80]);
        assert.deepEqual(
          dialogue.tiles,
          [30, 5],
          "dialogue frame uses centralized tile properties",
        );
        assert.deepEqual(
          dialogue.natural,
          [128, 128],
          "original portrait asset dimensions",
        );
        assert.deepEqual(
          [dialogue.image.width, dialogue.image.height],
          [64, 64],
          "portrait scales to the 64px framed interior",
        );
        assert.equal(
          dialogue.copy.height,
          64,
          "dialogue copy uses the same exact inner height",
        );
        assert.equal(dialogue.copy.flexDirection, "column");
        assert.equal(
          dialogue.copy.justifyContent,
          "center",
          "name and speech are vertically centered as one bounded block",
        );
        assert.equal(dialogue.fontSize, "16px", "global popup font size");
        assert.equal(
          dialogue.pointerEvents,
          "none",
          "dialogue must not block command clicks",
        );
        assert.equal(dialogue.text.whiteSpace, "pre-wrap");
        assert.equal(dialogue.text.overflowWrap, "anywhere");
        assert.equal(dialogue.text.wordBreak, "normal");
        assert.equal(dialogue.text.overflow, "hidden");
        assert.ok(
          dialogue.text.scrollHeight > 20,
          "dialogue text wraps onto multiple lines",
        );
        assert.ok(
          dialogue.text.scrollWidth <= dialogue.text.clientWidth,
          "long tokens remain horizontally bounded",
        );
        assert.ok(
          dialogue.text.clientHeight <= 40,
          "fixed-height dialogue clips after two bounded text lines",
        );
      }
      assert.equal(enemyDialogue.box.x, playerDialogue.box.x);
      assert.equal(
        enemyDialogue.box.y,
        expected[0][1],
        "enemy dialogue top aligns with title top",
      );
      assert.equal(
        playerDialogue.box.y + playerDialogue.box.height,
        measured.cards.y + measured.cards.height,
        "player dialogue bottom aligns with card bottom",
      );
      assert.deepEqual(rect(measured.cards), [
        16,
        viewport.height - 52,
        624,
        36,
      ]);
      assert.deepEqual(rect(measured.formationGrid), [
        viewport.width - 176,
        viewport.height - 196,
        128,
        32,
      ]);
      assert.equal(
        measured.formationGrid.borderWidth,
        "0px",
        "the two formation rows have no enclosing frame",
      );
      assert.equal(measured.formationGrid.backgroundColor, "rgba(0, 0, 0, 0)");
      assert.equal(measured.formationGrid.gap, "0px");
      assert.equal(
        measured.formationGrid.selectedBorder,
        "rgb(240, 224, 0)",
        "only the live selected button receives the original yellow frame",
      );
      const formationControls = measured.controls.filter(
        (control) => control.formation !== undefined,
      );
      assert.deepEqual(
        formationControls.map((control) => Number(control.formation)),
        Array.from({ length: 16 }, (_, i) => i),
      );
      assert.ok(
        formationControls.every(
          (control) => control.box.width === 16 && control.box.height === 16,
        ),
        "each original formation cell is an independent 16x16 button",
      );
      assert.deepEqual(
        measured.controls
          .filter((c) => c.deployment !== undefined)
          .map((c) => Number(c.deployment)),
        [48, 28, 5],
      );
      assert.deepEqual(
        measured.controls
          .filter((c) => c.id && !c.id.startsWith("bunit"))
          .map((c) => c.id),
        ["bassault", "battack", "bformation", "bwall", "bdefend", "bretreat"],
      );
      assert.deepEqual(
        measured.controls
          .filter((c) => c.id.startsWith("bunit"))
          .map((c) => c.id),
        Array.from({ length: 6 }, (_, i) => `bunit${i}`),
      );
      assert.equal(measured.controls.length, 31);
      for (const control of measured.controls) {
        const label =
          control.id ||
          `formation:${control.formation}/deployment:${control.deployment}`;
        inside(control.box, { x: 0, y: 0, ...viewport }, label);
        inside(
          control.box,
          control.id.startsWith("bunit")
            ? measured.cards
            : measured.windows[2].box,
          label,
        );
        assert.equal(
          control.hit,
          true,
          `${name}: ${label} must receive pointer hit`,
        );
      }
      for (const control of await page
        .locator(
          ".battle-cmd-img-btn, .battle-symbol-btn, .battle-deployment-btn, .battle-unit-card",
        )
        .all()) {
        // Actionability only: no rule commands/click handlers are invoked.
        await control.click({ trial: true, timeout: 2000 });
      }
      evidence.status = "passed";
      evidence.trialClicks = 31;
      await writeFile(
        path.join(output, "layout-results.json"),
        JSON.stringify(results, null, 2) + "\n",
      );
      console.log(
        `PASS ${name}: dialogue 480x80/64px portrait/bounded wrap; aligned title/cards; 31 actionable controls. ${screenshot}`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  `Battle panel effective layout OK (Chrome ${results.browser}); evidence: ${output}`,
);
