// 原生战术端到端：真实开局→真实行军命令→4F36/4E82挂起→TALK开场→真实
// battleView会话跑完→写回原生记录→时钟恢复。全程localhost+隔离profile，
// 不读写DOS SAVE.DAT。失败只认loud信号：pageerror/console error/失败旗/
// 看门狗超时（含堆栈/日期快照）。
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startBrowserTestServer } from "./browser_test_server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const output = await mkdtemp(path.join(tmpdir(), "native-tactical-"));
const server = await startBrowserTestServer();
const { port } = server;
const errors = [];
let browser;
const fail = (message, extra = null) => {
  const dump = extra == null ? "" : ` :: ${JSON.stringify(extra).slice(0, 2000)}`;
  throw new Error(`NATIVE-TACTICAL-FAIL: ${message}${dump}\nerrors=[${errors.join("\n")}]`);
};
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
  page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error?.stack || error}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`CONSOLE: ${message.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick, null, { timeout: 30000 });
  // 开局抄longrun harness：按officials表取legacyScenarioIndex，硬编码0会进错剧本。
  const boot = await page.evaluate(() => {
    const app = window.__app;
    const officials = (app.content?.chapters ?? [])
      .filter((c) => c.official)
      .map((c) => ({ name: c.name, legacyScenarioIndex: c.legacyScenarioIndex }));
    const scenIdx = officials[0]?.legacyScenarioIndex ?? 0;
    const sm = app.startMenu;
    sm._yesNo = async () => 0;
    sm._chooseChapter = async () => scenIdx;
    sm._factionDialog = async () => 0;
    sm._advisorDialog = async () => null;
    return { officials: officials.length, scenIdx };
  });
  console.log("BOOT", JSON.stringify(boot));
  const box = await page.evaluate(() => {
    const cv = document.querySelector("#startv");
    const r = cv.getBoundingClientRect();
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

  // Setup（仅布阵）：等AI组建军团→选玩家城＋有真实守军的敌城，declareWar
  // (0x3644同算式)后经cmd.dispatch出征内核（生产UI同一入口）建军；之后 march
  // →挂起→开场→战斗→写回全是真实链路。创建数字沿用生产近似，不冒称4155。
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });
  const waitForLegions = Date.now() + 8 * 60 * 1000;
  let census = null;
  for (;;) {
    census = await page.evaluate(() => {
      const sc = window.__app.scenario;
      const pf = sc.player_faction;
      const enemy = (sc.legions ?? []).filter(
        (l) => l && l.faction !== pf && (l.status & 0x80) && l.slot < 127,
      ).length;
      const mine = (sc.cities ?? []).filter((c) => c?.faction === pf).length;
      return {
        enemy, mine,
        date: [window.__app.clock.year, window.__app.clock.month, window.__app.clock.day],
      };
    });
    if (census.enemy > 0 && census.mine > 0) break;
    if (Date.now() > waitForLegions) fail("AI legion formation watchdog", census);
    await sleep(2000);
  }
  console.log("CENSUS", JSON.stringify(census));
  const setup = await page.evaluate(async () => {
    const app = window.__app;
    const sc = app.scenario;
    const pf = sc.player_faction;
    const cityTroops = (c) => c.sim?.troops ?? c.troops ?? 0;
    const fromCity = (sc.cities ?? [])
      .filter((c) => c?.faction === pf)
      .sort((a, b) => cityTroops(b) - cityTroops(a))[0];
    const garrisoned = (sc.cities ?? []).filter(
      (c) =>
        c && c.faction !== pf && c.faction !== 0x18 && c.faction != null &&
        (sc.legions ?? []).some(
          (l) => l && l.faction === c.faction && (l.status & 0x80) && l.x === c.x && l.y === c.y && l.slot < 127,
        ),
    );
    if (!fromCity || !garrisoned.length)
      return { from: fromCity?.idx ?? null, garrisoned: garrisoned.length };
    let best = null;
    for (const c of garrisoned) {
      const d = Math.abs(fromCity.x - c.x) + Math.abs(fromCity.y - c.y);
      if (!best || d < best.d) best = { d, c: c.idx };
    }
    const city = sc.cities[best.c];
    // declareWar(0x3644)：取双方较小raw，清bit7后减半。
    const a = pf, b = city.faction;
    const curA = ((sc.diplomacy?.[a]?.[b] ?? 0x80) & 0x7f) | 0;
    const curB = ((sc.diplomacy?.[b]?.[a] ?? 0x80) & 0x7f) | 0;
    const warVal = Math.min(curA, curB) >> 1;
    sc.diplomacy[a][b] = warVal;
    sc.diplomacy[b][a] = warVal;
    const cmd = await import("./src/game/commands.js");
    const result = cmd.dispatch(sc, fromCity, city);
    return {
      from: fromCity.idx, city: best.c, cityFaction: b, dist: best.d,
      dispatch: result,
      fromTroops: cityTroops(fromCity), cityTroops: cityTroops(city),
    };
  });
  console.log("SETUP", JSON.stringify(setup));
  if (!setup.dispatch?.ok) fail("dispatch rejected", setup);

  const probe = () =>
    page.evaluate(() => {
      const app = window.__app;
      const q = app._nativeTacticalQueue ?? [];
      return {
        date: [app.clock.year, app.clock.month, app.clock.day],
        tick: app.clock.strategicTickSerial,
        queue: q.length,
        kind: q[0]?.request?.kind ?? null,
        talk: q[0]?.request?.talk ?? null,
        battle: !!app.battleView?.active,
        failure: app._strategicBattleFailure
          ? String(app._strategicBattleFailure.error?.stack || app._strategicBattleFailure.error).slice(0, 3000)
          : null,
        rngCalls: app.originalRng?.snapshot?.().calls ?? null,
      };
    });

  // 行军阶段：等原生战术挂起（queue出现）。
  let state = await probe();
  const marchDeadline = Date.now() + 12 * 60 * 1000;
  while (state.queue === 0 && state.failure == null) {
    if (Date.now() > marchDeadline) fail("march phase watchdog", state);
    await sleep(1000);
    state = await probe();
  }
  if (state.failure != null) fail("failure before tactical suspend", state);
  console.log("SUSPENDED", JSON.stringify(state));
  const before = await page.evaluate(() => {
    const app = window.__app;
    const sides = app._nativeTacticalQueue[0].request.sides;
    return {
      kind: app._nativeTacticalQueue[0].request.kind,
      atkSlot: sides.attacker.slot, atkTroops: sides.attacker.troops, atkMorale: sides.attacker.morale,
      defSlot: sides.defender.slot, defTroops: sides.defender.troops, defMorale: sides.defender.morale,
      city: sides.city?.idx ?? null, cityTroops: sides.city?.troops ?? null,
      rngCalls: app.originalRng.snapshot().calls,
    };
  });
  console.log("SIDES", JSON.stringify(before));

  // 开场TALK自动关闭后战斗必须打开（60s看门狗；右键为产品级真实关闭回退）。
  const battleDeadline = Date.now() + 60 * 1000;
  while (!state.battle && state.failure == null) {
    if (Date.now() > battleDeadline) fail("battle open watchdog", state);
    await sleep(500);
    state = await probe();
  }
  if (state.failure != null) fail("failure before battle open", state);
  await page.screenshot({ path: path.join(output, "tactical-open.png") });
  console.log("OPEN", JSON.stringify(state));

  // 战斗阶段：每次evaluate推进≤500逻辑帧（每调用至多1帧），直到真实finish。
  const finishDeadline = Date.now() + 20 * 60 * 1000;
  let frames = 0;
  for (;;) {
    const advanced = await page.evaluate(() => {
      const bv = window.__app.battleView;
      if (!bv?.active) return { active: false, n: 0 };
      let n = 0;
      while (bv.active && n < 500) {
        const over = bv.updateBattleFrames(1);
        n++;
        if (over) break;
      }
      if (bv.active && bv.battle?.over) {
        bv.draw();
        bv.finish();
      }
      return { active: bv.active, n };
    });
    frames += advanced.n;
    state = await probe();
    if (state.failure != null) fail("failure during battle", { ...state, frames });
    if (!advanced.active && !state.battle) break;
    if (Date.now() > finishDeadline) fail("battle finish watchdog", { ...state, frames });
    await sleep(300);
  }
  console.log("FINISHED", JSON.stringify({ ...state, frames }));
  await page.screenshot({ path: path.join(output, "tactical-after.png") });

  // 写回断言：参战记录/城池/RNG必有一处变化（零写回=静默丢战果）。
  const after = await page.evaluate(() => {
    const app = window.__app;
    const find = (slot) => app.scenario.legions.find((l) => l.slot === slot);
    return {
      atkTroops: find(arguments[0])?.troops ?? null,
    };
  }).catch(() => null);
  const afterState = await page.evaluate((b) => {
    const app = window.__app;
    const find = (slot) => app.scenario.legions.find((l) => l?.slot === slot);
    const atk = find(b.atkSlot);
    const def = find(b.defSlot);
    const city = b.city == null ? null : app.scenario.cities[b.city];
    return {
      atkTroops: atk?.troops ?? null, atkMorale: atk?.morale ?? null,
      defTroops: def?.troops ?? null, defMorale: def?.morale ?? null,
      cityTroops: city?.troops ?? null, cityFaction: city?.faction ?? null,
      rngCalls: app.originalRng.snapshot().calls,
      queue: (app._nativeTacticalQueue ?? []).length,
      date: [app.clock.year, app.clock.month, app.clock.day],
      tick: app.clock.strategicTickSerial,
    };
  }, before);
  console.log("AFTER", JSON.stringify(afterState));
  void after;
  const changed =
    afterState.atkTroops !== before.atkTroops ||
    afterState.atkMorale !== before.atkMorale ||
    afterState.defTroops !== before.defTroops ||
    afterState.defMorale !== before.defMorale ||
    afterState.cityTroops !== before.cityTroops ||
    afterState.rngCalls !== before.rngCalls;
  if (!changed) fail("tactical writeback empty", { before, after: afterState });
  if (afterState.queue !== 0) fail("tactical queue not drained", afterState);

  // 恢复阶段：时钟继续走3天且零失败。
  const resumeDeadline = Date.now() + 8 * 60 * 1000;
  const targetTick = afterState.tick + 1500;
  for (;;) {
    state = await probe();
    if (state.failure != null) fail("failure after resume", state);
    if ((state.tick ?? 0) >= targetTick) break;
    if (Date.now() > resumeDeadline) fail("resume watchdog", state);
    await sleep(1000);
  }
  console.log("RESUMED", JSON.stringify(state));
  if (errors.length) fail("page/console errors during run", { count: errors.length });
  console.log(`NATIVE-TACTICAL-PASS kind=${before.kind} frames=${frames} artifacts=${output}`);
} finally {
  await browser?.close();
  await server.close?.();
}
