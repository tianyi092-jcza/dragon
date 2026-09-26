// 长日期计时测试：新开局后全速推进 N 个游戏月，断言计时永不静默冻结。
// 用法：node tools/verify_clock_longrun_browser.mjs [chapter=1] [months=12] [faction=0]
// 失败只认三种 loud 信号：0 日、tick 停滞(带 failure 堆栈或卡住的 UI 身份)、
// console/page 错误。过了换月、AI 攻城、灾害等事件才算覆盖。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);

const chapterArg = Number(process.argv[2] ?? 1);
const monthsArg = Number(process.argv[3] ?? 12);
const factionArg = Number(process.argv[4] ?? 0);

const server = await startBrowserTestServer();
const { port } = server;
let browser;
const errors = [];
let failed = null;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const seedTime = new Date(2000, 0, 1, 13, 45, 9).getTime();
  await context.addInitScript(
    ({ timestamp, origin }) => {
      if (location.origin !== origin) return;
      sessionStorage.setItem("wolong.intro.seen.v1", "1");
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [timestamp]));
        }
        static now() {
          return timestamp;
        }
      }
      globalThis.Date = FixedDate;
    },
    { timestamp: seedTime, origin: `http://127.0.0.1:${port}` },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    errors.push(`PAGEERROR: ${error?.stack || error}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`CONSOLE: ${message.text()}`);
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick, null, {
    timeout: 30000,
  });

  // 绕开 canvas 像素点选：直接给开场流程喂选择，beginNewGame 走真实装配。
  const setup = await page.evaluate(
    ({ chapterArg, factionArg }) => {
      const app = window.__app;
      const officials = (app.content?.chapters ?? [])
        .filter((c) => c.official)
        .map((c) => ({ name: c.name, legacyScenarioIndex: c.legacyScenarioIndex }));
      const scenIdx =
        officials[chapterArg - 1]?.legacyScenarioIndex ?? chapterArg - 1;
      const scen = app.data.scenarios[scenIdx];
      const sm = app.startMenu;
      sm._yesNo = async () => 0;
      sm._chooseChapter = async () => scenIdx;
      sm._factionDialog = async () => factionArg;
      sm._advisorDialog = async () => null;
      return {
        officials,
        scenIdx,
        scenName: scen?.name,
        start: scen?.start,
      };
    },
    { chapterArg, factionArg },
  );
  console.log("SETUP", JSON.stringify(setup));

  // 点"是"进新游戏分支（其余选择已被上面的桩接管）
  const box = await page.evaluate(() => {
    const cv = document.querySelector("#startv");
    const r = cv.getBoundingClientRect();
    // _yesNo: ox=216,oy=136(640x400 逻辑)；“是”区 (246..377, 166..185)
    return {
      x: r.left + ((246 + 377) / 2) * (r.width / 640),
      y: r.top + ((166 + 185) / 2) * (r.height / 400),
    };
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      window.__app?.gameStarted === true &&
      window.__app?.runtimeEnabled === true,
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });
  const start = await page.evaluate(() => ({
    date: [
      window.__app.clock.year,
      window.__app.clock.month,
      window.__app.clock.day,
    ],
    player: window.__app.scenario?.player_faction,
  }));
  console.log("START", JSON.stringify(start));
  const startCount = start.date[0] * 12 + start.date[1];

  const dumpState = () =>
    page.evaluate(() => {
      const app = window.__app;
      const c = app.clock;
      const gb = app.gamebar;
      const gbKeys = gb
        ? Object.fromEntries(
            [
              "selectedSubmenu",
              "listDialog",
              "choiceDialog",
              "baseMenu",
              "personnelMenu",
              "adviceMenu",
              "proposalAudience",
              "formationDialog",
              "formationQuote",
              "financeDialog",
              "keypadDialog",
              "legionMenu",
              "marchingOrder",
              "viewingLegion",
              "orderChoiceMenu",
              "cityCard",
              "generalCard",
              "_strategicMessageActive",
              "_clockHoldRequested",
              "settingsOpen",
              "systemSaveDialog",
              "systemLoadConfirmDialog",
              "exitConfirmDialog",
            ].map((k) => [k, gb[k] == null ? gb[k] : !!gb[k]]),
          )
        : null;
      if (gbKeys) gbKeys.stratQueue = gb._strategicMessageQueue?.length ?? null;
      return {
        date: [c.year, c.month, c.day],
        tick: c.strategicTickSerial,
        hold: c.hold,
        legacyPaused: c._legacyPaused,
        runtimeEnabled: app.runtimeEnabled,
        failure: app._strategicBattleFailure
          ? String(
              app._strategicBattleFailure.error?.stack ||
                app._strategicBattleFailure.error,
            ).slice(0, 3000)
          : null,
        dialogCount: app.hud?.dialogCount ?? null,
        gb: gbKeys,
        battle: !!app.battleView?.active,
        engage: !!app.engageTransition?.active,
        endView: !!app.endView?.active,
        assemblyPending: !!app._scenarioAssemblyPending,
        assemblyIncomplete: !!app._scenarioAssemblyIncomplete,
        cityReq: !!app._strategicCityRequest,
        slotBatch: !!app._legionSlotBatch,
        mapPointerHold: !!app.mapPointerHold,
        banner: !!document.querySelector("#failurebanner"),
      };
    });

  const t0 = Date.now();
  const BUDGET_MS = 25 * 60 * 1000;
  let lastKey = "";
  let lastTick = -1;
  let lastTickChange = Date.now();
  let nudges = 0;
  let monthsSeen = 0;
  while (Date.now() - t0 < BUDGET_MS) {
    await page.waitForTimeout(2000);
    const s = await dumpState();
    const key = s.date.join("/");
    if (key !== lastKey) {
      const count = s.date[0] * 12 + s.date[1] - startCount;
      if (count > monthsSeen) {
        monthsSeen = count;
        console.log(
          `T+${Math.round((Date.now() - t0) / 1000)}s MONTH+${monthsSeen}: date=${key} tick=${s.tick} errors=${errors.length}`,
        );
      }
      lastKey = key;
    }
    if (monthsSeen >= monthsArg) break;
    if (s.tick !== lastTick) {
      lastTick = s.tick;
      lastTickChange = Date.now();
      nudges = 0;
    }
    if (s.date[2] === 0) {
      failed = `ZERO_DAY at ${key}:\n${JSON.stringify(s, null, 1).slice(0, 4000)}`;
      break;
    }
    if (Date.now() - lastTickChange > 30000) {
      if (s.failure) {
        failed = `TICK_STALL_WITH_FAILURE at ${key}:\n${s.failure}`;
        break;
      }
      // 无 failure 的停滞：先右键 nudge（ benign 弹窗需要玩家解散），
      // nudge 无效才认定为卡住的 UI。
      if (nudges < 3) {
        nudges++;
        await page.mouse.click(512, 384, { button: "right" });
        await page.waitForTimeout(3000);
        lastTickChange = Date.now();
        console.log(
          `T+${Math.round((Date.now() - t0) / 1000)}s stall nudge ${nudges} at ${key}`,
        );
        continue;
      }
      failed = `TICK_STALL_NO_FAILURE at ${key} (stuck UI identity):\n${JSON.stringify(s, null, 1).slice(0, 4000)}`;
      break;
    }
  }

  if (!failed && monthsSeen < monthsArg)
    failed = `TIMEOUT: only +${monthsSeen} months in ${Math.round((Date.now() - t0) / 1000)}s`;
  if (!failed && errors.length)
    failed = `CONSOLE/PAGE ERRORS (${errors.length}):\n${errors.slice(0, 3).join("\n----\n").slice(0, 4000)}`;

  console.log(
    `RESULT chapter=${chapterArg} months=+${monthsSeen}/${monthsArg} errors=${errors.length} ${failed ? "FAIL" : "PASS"}`,
  );
  if (failed) {
    console.log(failed.slice(0, 6000));
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server?.close?.();
}
assert.equal(failed, null, failed ?? "longrun failed");
