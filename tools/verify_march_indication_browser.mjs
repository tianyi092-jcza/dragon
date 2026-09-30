import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// March target-indication minimap nav + delegated live campaign (round 2 #2/#3).
// Fresh Chromium, isolated profile, self-owned static server. One fixture step
// is labeled: a production 6E8F formation entry (createOriginalLegion) is
// invoked directly instead of clicking through the 編成 dialog. Everything
// after that — advisor 軍團 menu, 行軍指示 list, pick_target drag + minimap
// nav, city pick, 委任 order, march pump, battle, fate messages, capture —
// is production code driven by real clicks and the live clock (max speed).
// No SAVE.DAT, no user profile; screenshots to round2 (moved by runner).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const server = await startBrowserTestServer();
let browser;
const errors = [];
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url?.endsWith("/favicon.ico")
    )
      errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__marchMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__marchMenuHandler,
    );
  }
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });
  const bx = await page.evaluate(() => window.__app.gamebar.bx);

  // ---- Fixture (labeled): production 6E8F formation, invoked directly. ----
  const formed = await page.evaluate(async () => {
    const app = window.__app;
    const sc = app.scenario;
    const assembly = await import("/src/game/scenarioassembly.js");
    const formation = await import(
      "/src/game/navigation/originalformation.js"
    );
    const me = sc.player_faction;
    const monarch = sc.factions.find((f) => f.idx === me)?.monarch_idx;
    const general = sc.generals.find(
      (g) => g.faction === me && g.status === 0 && g.idx !== monarch && g.idx < 127,
    );
    if (!general) throw new Error("no idle player general to form");
    const ctx = assembly.scenarioNativeRoadContext(sc);
    const result = formation.createOriginalLegion(sc, ctx, general.idx);
    const legion = sc.legions.find((l) => l.slot === general.idx);
    return {
      generalIdx: general.idx,
      name: general.name,
      cf: result.cf,
      status: legion?.status,
      troops: legion?.troops,
      at: legion ? [legion.x, legion.y] : null,
    };
  });
  tlog(`formed: ${JSON.stringify(formed)}`);
  assert.equal(formed.cf, false, "production formation must succeed");
  assert.ok((formed.status & 0xc0) === 0xc0, "legion must be active");
  await page.screenshot({ path: "march_formed.png" });

  // ---- Production clicks: fan bar -> 軍團 cell -> 行軍指示 -> legion row. ----
  await page.mouse.click(bx + 359, 56); // cell 4 軍團
  const marchItem = await page.evaluate(() => {
    const m = window.__app.gamebar.legionMenu;
    if (!m) throw new Error("legion menu did not open");
    const x = m.ox + 8;
    const y = m.oy + 8;
    const w = (m.wTiles - 1) * 16;
    const h = (m.hTiles - 1) * 16;
    return { x: x + w / 2, y: y + (h / m.items.length) * 1.5, items: m.items };
  });
  assert.deepEqual(marchItem.items, ["位置確認", "行軍指示"]);
  await page.mouse.click(marchItem.x, marchItem.y);
  const legionRow = await page.evaluate(() => {
    const bar = window.__app.gamebar;
    const d = bar.listDialog;
    if (!d) throw new Error("legion list did not open");
    bar._recalcListDialog();
    return {
      x: d.px + d.w / 2,
      y: d.py + d.top + d.rowH * 0.5,
      rows: d.rows.length,
      cam: { ...window.__app.view.cam },
    };
  });
  assert.ok(legionRow.rows >= 1, "legion list must hold the formed legion");
  await page.mouse.click(legionRow.x, legionRow.y);
  const indication = await page.evaluate(() => ({
    step: window.__app.gamebar.marchingOrder?.step ?? null,
    hasLegion: !!window.__app.gamebar.marchingOrder?.legion,
  }));
  assert.equal(indication.step, "pick_target", "must enter target indication");
  assert.equal(indication.hasLegion, true);
  await page.screenshot({ path: "march_indication.png" });

  // Indication-phase drag still pans (addressing exception).
  await page.mouse.move(512, 400);
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => ({ ...window.__app.view.cam }));
  assert.ok(
    afterDrag.x !== legionRow.cam.x || afterDrag.y !== legionRow.cam.y,
    "indication-phase drag must pan",
  );

  // THE missing coverage: minimap click navigates during target indication.
  const nav = await page.evaluate(() => {
    const bar = window.__app.gamebar;
    const rect = bar.panelRect("mini");
    return {
      x: rect.x + rect.w * 0.6,
      y: rect.y + rect.h * 0.6,
      cam: { ...window.__app.view.cam },
    };
  });
  await page.mouse.click(nav.x, nav.y);
  const afterNav = await page.evaluate(() => ({
    cam: { ...window.__app.view.cam },
    step: window.__app.gamebar.marchingOrder?.step ?? null,
    target: window.__app.gamebar.marchingOrder?.targetCity ?? null,
  }));
  assert.ok(
    afterNav.cam.x !== nav.cam.x || afterNav.cam.y !== nav.cam.y,
    "minimap must navigate during target indication",
  );
  assert.equal(afterNav.step, "pick_target", "nav must not pick a target");
  assert.equal(afterNav.target, null);
  tlog(
    `indication minimap nav: cam (${nav.cam.x},${nav.cam.y}) -> (${afterNav.cam.x},${afterNav.cam.y})`,
  );

  // Pick a neutral target city (center camera on it first as test setup).
  const target = await page.evaluate(async (slot) => {
    const app = window.__app;
    const sc = app.scenario;
    const legion = sc.legions.find((l) => l.slot === slot);
    const candidates = sc.cities
      .filter((c) => c.faction == null)
      .map((c) => ({
        idx: c.idx,
        dist: Math.abs(c.x - legion.x) + Math.abs(c.y - legion.y),
      }))
      .sort((a, b) => a.dist - b.dist);
    const pick = candidates[1] ?? candidates[0];
    const city = sc.cities[pick.idx];
    const view = app.view;
    const [wxp, wyp] = view.cityPixel(city);
    view.cam.x = 512 - wxp;
    view.cam.y = 384 - wyp;
    view.clampCam();
    view.draw();
    return {
      idx: city.idx,
      x: view.sx(wxp),
      y: view.sy(wyp),
      troops: city.troops,
    };
  }, formed.generalIdx);
  tlog(`target neutral city: ${JSON.stringify(target)}`);
  await page.mouse.click(target.x, target.y);
  const ordered = await page.evaluate(() => ({
    step: window.__app.gamebar.marchingOrder?.step ?? null,
    target: window.__app.gamebar.marchingOrder?.targetCity?.idx ?? null,
    menu: !!window.__app.gamebar.orderChoiceMenu,
  }));
  assert.equal(ordered.step, "choose_order");
  assert.equal(ordered.target, target.idx);
  assert.equal(ordered.menu, true);
  await page.screenshot({ path: "march_choose_order.png" });

  // 委任 (row 1 of the 2-row non-capital menu): delegated 速算 path.
  const delegate = await page.evaluate(() => {
    const m = window.__app.gamebar.orderChoiceMenu;
    const x = m.ox + 8;
    const y = m.oy + 8;
    const w = (m.wTiles - 1) * 16;
    const h = (m.hTiles - 1) * 16;
    return { x: x + w / 2, y: y + (h / m.items.length) * 1.5, items: m.items };
  });
  assert.deepEqual(delegate.items, ["戰鬥指揮", "委　　任"]);
  await page.mouse.click(delegate.x, delegate.y);
  const assigned = await page.evaluate(async (slot) => {
    const sc = window.__app.scenario;
    const legion = sc.legions.find((l) => l.slot === slot);
    return {
      orderClosed: !window.__app.gamebar.marchingOrder,
      targetCity: legion?.targetCity,
      delegated: (legion?.status & 4) === 4,
      clock: { ...window.__app.clock },
    };
  }, formed.generalIdx);
  assert.equal(assigned.orderClosed, true);
  assert.equal(assigned.targetCity, target.idx);
  assert.equal(assigned.delegated, true, "order must be delegated");
  tlog(`delegated order assigned to city ${target.idx}`);
  await page.screenshot({ path: "march_ordered.png" });

  // Product rule: 軍團 stays selected after ordering (issue more orders);
  // the clock holds until the workflow is exited via right-click rollback.
  for (let i = 0; i < 3; i++) {
    const done = await page.evaluate(
      () => window.__app.gamebar.selectedSubmenu == null,
    );
    if (done) break;
    await page.mouse.click(512, 400, { button: "right" });
  }
  const resumed = await page.evaluate(() => {
    const bar = window.__app.gamebar;
    return {
      selected: bar.selectedSubmenu,
      hold: !!window.__app.clock.hold,
      flags: {
        listDialog: !!bar.listDialog,
        legionMenu: !!bar.legionMenu,
        baseMenu: !!bar.baseMenu,
        cityCard: !!bar.cityCard,
        generalCard: !!bar.generalCard,
        marchingOrder: !!bar.marchingOrder,
        orderChoiceMenu: !!bar.orderChoiceMenu,
        viewingLegion: !!bar.viewingLegion,
        dialogCount: window.__app.hud?.dialogCount ?? 0,
        strategicMessage: !!bar._strategicMessageActive,
        assemblyPending: !!window.__app._scenarioAssemblyPending,
        clockHoldRequested: !!bar._clockHoldRequested,
        mapPointerHold: window.__app.mapPointerHold,
        runtimeEnabled: window.__app.runtimeEnabled,
        cityRequest: !!window.__app._strategicCityRequest,
        slotBatch: !!window.__app._legionSlotBatch,
        battleFailure: !!window.__app._strategicBattleFailure,
        battleActive: !!(
          window.__app.battleView?.active ||
          window.__app.engageTransition?.active
        ),
        endView: !!window.__app.endView?.active,
      },
    };
  });
  tlog(`post-rollback: ${JSON.stringify(resumed)}`);
  assert.equal(resumed.selected, null, "workflow must exit on rollback");
  // The 1s pointer-idle hold is transient: park the mouse and let it lapse.
  await page.mouse.move(512, 10);
  await page.waitForTimeout(1600);
  const idleHold = await page.evaluate(() => ({
    hold: !!window.__app.clock.hold,
    mapPointerHold: window.__app.mapPointerHold,
  }));
  assert.equal(idleHold.mapPointerHold, false, "pointer hold must lapse");
  assert.equal(idleHold.hold, false, "clock must resume after rollback");

  // ---- Phase B: live campaign to arrival/battle/fate/capture (day-capped). ----
  const dayCap = 25;
  const campaign = await page.evaluate(
    async ({ slot, cityIdx, cap }) => {
      const app = window.__app;
      const sc = app.scenario;
      const log = [];
      const seen = new Set();
      const startDay = sc.start_day ?? app.clock.day;
      let days = 0;
      const key = () => `${app.clock.month}/${app.clock.day}`;
      const legion = () => sc.legions.find((l) => l.slot === slot);
      const city = () => sc.cities[cityIdx];
      const dayNo = () => app.clock.month * 31 + app.clock.day;
      const startNo = dayNo();
      for (let iter = 0; iter < 360; iter++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const L = legion();
        const C = city();
        const state = `d${key()} L(${L?.x},${L?.y}) st${L?.status} cmd${L?.commandState} tgt${L?.targetCity} cityF${C?.faction} ct${C?.troops} card${!!app.gamebar.generalCard} audience${!!app.gamebar.proposalAudience} hold${!!app.clock.hold} fail${!!app._strategicBattleFailure}`;
        if (!seen.has(state)) {
          seen.add(state);
          log.push(state);
        }
        if (app._strategicBattleFailure)
          return { end: "STRATEGIC-FAILURE", log };
        if (app.gamebar.proposalAudience)
          return { end: "MODAL-GATE", log };
        if (C?.faction === 0) {
          // Captured; give the settler a few more seconds, then report.
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const L2 = legion();
          log.push(
            `settled L(${L2?.x},${L2?.y}) st${L2?.status} cmd${L2?.commandState} troops${L2?.troops} morale${L2?.morale}`,
          );
          return { end: "CAPTURED", log };
        }
        if (dayNo() - startNo >= cap) return { end: "DAY-CAP", log };
      }
      return { end: "ITER-CAP", log };
    },
    { slot: formed.generalIdx, cityIdx: target.idx, cap: dayCap },
  );
  tlog(`campaign end: ${campaign.end}`);
  for (const line of campaign.log.slice(0, 25)) tlog(`  ${line}`);
  if (campaign.log.length > 25)
    tlog(`  ... (${campaign.log.length - 25} more states)`);
  await page.screenshot({ path: "march_campaign_end.png" });

  const finale = await page.evaluate(async (slot) => {
    const sc = window.__app.scenario;
    const L = sc.legions.find((l) => l.slot === slot);
    const bar = window.__app.gamebar;
    return {
      failure: !!window.__app._strategicBattleFailure,
      hold: !!window.__app.clock.hold,
      status: L?.status,
      command: L?.commandState,
      at: L ? [L.x, L.y] : null,
      troops: L?.troops,
      morale: L?.morale,
      rngCalls: window.__app.originalRng?.calls ?? null,
      flags: {
        dialogCount: window.__app.hud?.dialogCount ?? 0,
        strategicMessage: !!bar._strategicMessageActive,
        generalCard: !!bar.generalCard,
        mapPointerHold: window.__app.mapPointerHold,
        cityRequest: !!window.__app._strategicCityRequest,
        slotBatch: !!window.__app._legionSlotBatch,
      },
    };
  }, formed.generalIdx);
  tlog(`finale: ${JSON.stringify(finale)}`);
  assert.equal(finale.failure, false, "no strategic failure may be held");
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
tlog("march indication + live campaign browser run complete");
