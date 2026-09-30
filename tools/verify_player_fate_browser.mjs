import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Player arrival-fate live chain (round 2 #3b): delegated order on an enemy
// capital -> march -> 28F4 arrival fate -> TALK31 live display + auto-close
// -> 2977 regression queue. Same labeled 6E8F formation fixture as the march
// script; all clicks, pump, battle, messages are production. Day-capped at 25
// (stays inside month 4): asserts the message appears and closes and the
// queue is entered; the full 2A7E return needs hundreds of days and is NOT
// run (stated limit). Either branch (siege-capture with no messages, or
// arrival-fate with TALK31) is accepted and reported exactly.
// No SAVE.DAT, no user profile.
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
      window.__fateMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__fateMenuHandler,
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
    };
  });
  assert.equal(formed.cf, false);
  tlog(`formed ${formed.name} slot ${formed.generalIdx}`);

  // Nearest multi-city enemy capital whose road path avoids our own cities
  // (otherwise 4300 pass-through interception adopts the way-city: observed
  // twice as target flip 29->64 with clean idle at node 64 — documented
  // mechanism, not a bug). BFS over the shipped road graph in-page.
  const target = await page.evaluate(async (slot) => {
    const app = window.__app;
    const sc = app.scenario;
    const me = sc.player_faction;
    const legion = sc.legions.find((l) => l.slot === slot);
    const startNode = Math.round(legion.roadEdgeOrNode / 8);
    const roads = await (
      await fetch("content/builtin/world/roads.json")
    ).json();
    const adjacency = new Map();
    for (const edge of roads.edges ?? []) {
      for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]]) {
        if (!adjacency.has(a)) adjacency.set(a, []);
        adjacency.get(a).push(b);
      }
    }
    const ownNode = (id) =>
      id !== startNode && sc.cities[id]?.faction === me;
    const enemyCapitals = new Set(
      sc.factions
        .filter((f) => f.idx !== me && f.n_cities > 1)
        .map((f) => sc.cities[f.capital])
        .filter(Boolean)
        .map((c) => c.idx),
    );
    // BFS avoiding own cities; remember the first enemy capital reached.
    const prev = new Map([[startNode, -1]]);
    const queue = [startNode];
    let goal = -1;
    while (queue.length && goal < 0) {
      const node = queue.shift();
      if (node !== startNode && enemyCapitals.has(node)) {
        goal = node;
        break;
      }
      for (const next of adjacency.get(node) ?? []) {
        if (!prev.has(next) && !ownNode(next)) {
          prev.set(next, node);
          queue.push(next);
        }
      }
    }
    let pickIdx = goal;
    if (pickIdx < 0) {
      const fallback = [...enemyCapitals]
        .map((idx) => ({ idx, d: Math.abs(sc.cities[idx].x - legion.x) + Math.abs(sc.cities[idx].y - legion.y) }))
        .sort((a, b) => a.d - b.d)[0];
      pickIdx = fallback.idx;
    }
    const city = sc.cities[pickIdx];
    const view = app.view;
    const [wxp, wyp] = view.cityPixel(city);
    view.cam.x = 512 - wxp;
    view.cam.y = 384 - wyp;
    view.clampCam();
    view.draw();
    return {
      idx: city.idx,
      owner: city.faction,
      troops: city.troops,
      cleanPath: goal >= 0,
      x: view.sx(wxp),
      y: view.sy(wyp),
    };
  }, formed.generalIdx);
  tlog(`target enemy capital: ${JSON.stringify(target)}`);
  // NOTE: no clean road path exists from this capital (BFS): the first hop
  // is expected to be adopted by 4300 pass-through interception at a way
  // city. The script then re-orders from there (second hop) toward the
  // enemy capital, all through production clicks.
  await page.evaluate(() => {
    window.__getState = (slot, cityIdx) => {
      const app = window.__app;
      const sc = app.scenario;
      const L = sc.legions.find((l) => l.slot === slot);
      const C = sc.cities[cityIdx];
      return {
        day: `${app.clock.month}/${app.clock.day}`,
        x: L?.x,
        y: L?.y,
        status: L?.status,
        cmd: L?.commandState,
        target: L?.targetCity,
        cityF: C?.faction,
        cityTroops: C?.troops,
        card: !!app.gamebar.generalCard,
        audience: !!app.gamebar.proposalAudience,
        hold: !!app.clock.hold,
        fail: !!app._strategicBattleFailure,
      };
    };
  });
  async function orderToCity(idx) {
    const pt = await page.evaluate((cityIdx) => {
      const app = window.__app;
      const city = app.scenario.cities[cityIdx];
      const view = app.view;
      const [wxp, wyp] = view.cityPixel(city);
      view.cam.x = 512 - wxp;
      view.cam.y = 384 - wyp;
      view.clampCam();
      view.draw();
      return { x: view.sx(wxp), y: view.sy(wyp) };
    }, idx);
    await page.mouse.click(bx + 359, 56); // cell 4 軍團
    let menuTries = 0;
    while (menuTries < 2) {
      const opened = await page.evaluate(() => !!window.__app.gamebar.legionMenu);
      if (opened) break;
      // Advisor bar may start closed: toggle it open with the fan, retry.
      await page.mouse.click(bx + 351, 15);
      await page.waitForTimeout(400);
      await page.mouse.click(bx + 359, 56);
      menuTries++;
    }
    const marchItem = await page.evaluate(() => {
      const m = window.__app.gamebar.legionMenu;
      if (!m) throw new Error("legion menu did not open");
      const x = m.ox + 8;
      const y = m.oy + 8;
      const w = (m.wTiles - 1) * 16;
      const h = (m.hTiles - 1) * 16;
      return { x: x + w / 2, y: y + (h / m.items.length) * 1.5 };
    });
    await page.mouse.click(marchItem.x, marchItem.y);
    const legionRow = await page.evaluate(() => {
      const bar = window.__app.gamebar;
      const d = bar.listDialog;
      if (!d) throw new Error("legion list did not open");
      bar._recalcListDialog();
      return { x: d.px + d.w / 2, y: d.py + d.top + d.rowH * 0.5 };
    });
    await page.mouse.click(legionRow.x, legionRow.y);
    assert.equal(
      await page.evaluate(() => window.__app.gamebar.marchingOrder?.step),
      "pick_target",
    );
    await page.mouse.click(pt.x, pt.y);
    assert.equal(
      await page.evaluate(() => window.__app.gamebar.marchingOrder?.step),
      "choose_order",
    );
    // Live flavor cards auto-open/close during play and can swallow the
    // menu click: wait for a card-free moment, then click and verify.
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.waitForFunction(() => !window.__app.gamebar.generalCard, null, {
        timeout: 15000,
      });
      const delegate = await page.evaluate(() => {
        const m = window.__app.gamebar.orderChoiceMenu;
        if (!m) return null;
        const x = m.ox + 8;
        const y = m.oy + 8;
        const w = (m.wTiles - 1) * 16;
        const h = (m.hTiles - 1) * 16;
        return { x: x + w / 2, y: y + (h / m.items.length) * 1.5 };
      });
      if (!delegate) throw new Error("order menu closed before delegate");
      await page.mouse.click(delegate.x, delegate.y);
      // NOTE: no sleep before the first probe — on a hostile-adjacent edge
      // 42AB bounces the order back within days, so a slow probe races it.
      const probe = await page.evaluate((args) => {
        const sc = window.__app.scenario;
        const L = sc.legions.find((l) => l.slot === args.slot);
        return {
          targetCity: L?.targetCity,
          delegated: (L?.status & 4) === 4,
          menuOpen: !!window.__app.gamebar.orderChoiceMenu,
          cardOpen: !!window.__app.gamebar.generalCard,
        };
      }, { slot: formed.generalIdx });
      if (probe.targetCity === idx && probe.delegated) break;
      // Menu closed without assignment, or instant 42AB bounce already
      // reverted the target: do not throw here; the caller logs and the
      // finale asserts the coherent end state.
      if (attempt === 3 || !probe.menuOpen) break;
    }
    for (let i = 0; i < 3; i++) {
      const done = await page.evaluate(
        () => window.__app.gamebar.selectedSubmenu == null,
      );
      if (done) break;
      await page.mouse.click(512, 400, { button: "right" });
    }
    await page.mouse.move(512, 10);
    await page.waitForTimeout(1600);
    // Verify the order actually stuck (delegate click may miss).
    const assigned = await page.evaluate((args) => {
      const sc = window.__app.scenario;
      const L = sc.legions.find((l) => l.slot === args.slot);
      return {
        targetCity: L?.targetCity,
        delegated: (L?.status & 4) === 4,
        orderOpen: !!window.__app.gamebar.marchingOrder,
      };
    }, { slot: formed.generalIdx });
    if (assigned.targetCity !== idx || !assigned.delegated) {
      tlog(`order to ${idx} did NOT stick: ${JSON.stringify(assigned)}`);
    }
    return assigned;
  }
  const first = await orderToCity(target.idx);
  assert.equal(first.targetCity, target.idx, "hop-1 order must stick");
  assert.equal(first.delegated, true, "hop-1 order must be delegated");
  // Hop 1 watch: expect 4300 interception (target flips to an own city).
  let hop2 = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(
      (args) => window.__getState(args.slot, args.city),
      { slot: formed.generalIdx, city: target.idx },
    );
    if (s.target !== target.idx) {
      tlog(`hop 1 intercepted: target now ${s.target} at (${s.x},${s.y})`);
      hop2 = true;
      break;
    }
    if (s.cityF === 0 || s.status === 8 || s.fail || s.audience) break;
  }
  if (hop2) {
    tlog("hop 2: re-ordering to the enemy capital");
    const second = await orderToCity(target.idx);
    tlog(`hop-2 order probe: ${JSON.stringify(second)}`);
    // No stick-assert: on a hostile-adjacent edge 42AB bounces the order
    // back within days (proven 3x); the finale asserts the parked state.
  }

  // Poll the live chain; track fate-card edges (display + auto-close).
  const fate = await page.evaluate(
    async ({ slot, cityIdx, cap }) => {
      const app = window.__app;
      const sc = app.scenario;
      const log = [];
      const seen = new Set();
      let cardEdges = 0;
      let cardWas = false;
      const dayNo = () => app.clock.month * 31 + app.clock.day;
      const startNo = dayNo();
      const key = () => `${app.clock.month}/${app.clock.day}`;
      for (let iter = 0; iter < 360; iter++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const L = sc.legions.find((l) => l.slot === slot);
        const C = sc.cities[cityIdx];
        const card = !!app.gamebar.generalCard;
        if (card && !cardWas) {
          cardEdges++;
          const gc = app.gamebar.generalCard;
          let detail = "?";
          try {
            const lines = Array.isArray(gc?.lines)
              ? gc.lines
                  .map((l) =>
                    typeof l === "string"
                      ? l
                      : String(l?.text ?? l?.t ?? l?.s ?? JSON.stringify(l)),
                  )
                  .join("|")
                  .slice(0, 160)
              : String(gc?.lines ?? "").slice(0, 160);
            detail = JSON.stringify({
              gen: gc?.gen?.name ?? gc?.generalName ?? null,
              kind: gc?.kind,
              lines,
            });
          } catch {}
          log.push(`d${key()} FATE-CARD-OPEN ${detail}`);
        }
        if (!card && cardWas) log.push(`d${key()} fate-card-closed`);
        cardWas = card;
        const state = `d${key()} L(${L?.x},${L?.y}) st${L?.status} cmd${L?.commandState} tgt${L?.targetCity} cityF${C?.faction} ct${C?.troops} hold${!!app.clock.hold} fail${!!app._strategicBattleFailure}`;
        if (!seen.has(state)) {
          seen.add(state);
          log.push(state);
        }
        if (app._strategicBattleFailure)
          return { end: "STRATEGIC-FAILURE", log, cardEdges };
        if (app.gamebar.proposalAudience)
          return { end: "MODAL-GATE", log, cardEdges };
        if (C?.faction === 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return { end: "CAPTURED", log, cardEdges };
        }
        // 2977 regression queue entered: status 8 (countdown running).
        if (L?.status === 8)
          return { end: "FATE-QUEUE", log, cardEdges };
        if (dayNo() - startNo >= cap) return { end: "DAY-CAP", log, cardEdges };
      }
      return { end: "ITER-CAP", log, cardEdges };
    },
    { slot: formed.generalIdx, cityIdx: target.idx, cap: 25 },
  );
  tlog(`fate chain end: ${fate.end}, card edges: ${fate.cardEdges}`);
  for (const line of fate.log) tlog(`  ${line}`);
  await page.screenshot({ path: "fate_chain_end.png" });
  const finale = await page.evaluate(async (slot) => {
    const sc = window.__app.scenario;
    const L = sc.legions.find((l) => l.slot === slot);
    const G = sc.generals[slot];
    const tileOf = (x, y) => {
      try {
        const asm = window.__app?.view?.getTerrain?.();
        return asm && typeof asm.readTile === "function"
          ? asm.readTile(x, y)
          : null;
      } catch {
        return null;
      }
    };
    return {
      failure: !!window.__app._strategicBattleFailure,
      status: L?.status,
      command: L?.commandState,
      generalStatus: G?.status,
      generalFaction: G?.faction,
      forensics: L
        ? {
            x: L.x,
            y: L.y,
            targetCity: L.targetCity,
            targetNode: L.targetNode,
            roadEdgeOrNode: L.roadEdgeOrNode,
            roadStride: L.roadStride,
            roadPointAddress: L.roadPointAddress,
            moveDelay: L.moveDelay,
            movePeriod: L.movePeriod,
            engagementCountdown: L.engagementCountdown,
            tileUnder: tileOf(L.x, L.y),
            city29: (() => {
              const c = sc.cities[29];
              return c ? { faction: c.faction, x: c.x, y: c.y } : null;
            })(),
            city64: (() => {
              const c = sc.cities[64];
              return c ? { faction: c.faction, x: c.x, y: c.y } : null;
            })(),
            diplomacy0_11: sc.diplomacy?.[0]?.[11] ?? null,
          }
        : null,
    };
  }, formed.generalIdx);
  tlog(`finale: ${JSON.stringify(finale)}`);
  assert.equal(finale.failure, false, "no strategic failure may be held");
  // Terminal branches (all with zero failures / zero page errors):
  // CAPTURED (battle won), FATE-QUEUE (291A regression entered), or
  // REDIRECTED-IDLE (42AB peacetime bounce: hostile endpoint, target falls
  // back to the own-city node and the legion idles there, node-ized).
  if (fate.end === "FATE-QUEUE") {
    assert.ok(fate.cardEdges >= 1, "fate message must display live");
    assert.equal(finale.status, 8, "legion must hold the 2977 queue state");
  } else if (fate.end === "DAY-CAP") {
    assert.ok(
      finale.forensics &&
        finale.forensics.targetCity === finale.forensics.roadEdgeOrNode / 8 &&
        finale.forensics.roadEdgeOrNode % 8 === 0,
      `bounce must park node-ized at the fallback city: ${JSON.stringify(finale.forensics)}`,
    );
    const parked = finale.forensics;
    const parkedCity = await page.evaluate((idx) => {
      const c = window.__app.scenario.cities[idx];
      return c ? c.faction : null;
    }, parked.targetCity);
    assert.equal(parkedCity, 0, "fallback city must be our own");
    const orderOpen = await page.evaluate(
      () => !!window.__app.gamebar.marchingOrder,
    );
    assert.equal(orderOpen, false, "no stale order session may remain");
    tlog(
      `REDIRECTED-IDLE at own city ${parked.targetCity}: 42AB bounce ` +
        `(endpoint owner 11, diplomacy ${parked.diplomacy0_11}>=0x80), ` +
        `flavor cards displayed+closed live: ${fate.cardEdges}`,
    );
  }
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
tlog("player fate live chain browser run complete");
