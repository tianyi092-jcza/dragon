import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Round-3 item 2A7E: delayed-return queue live regression in the browser.
// Reuses the proven hostile-proposal chain (Phase A/B identical to
// verify_war_proposal_browser.mjs) to obtain a production 2977 status-8
// record, then Phase C drives the LIVE clock until the 2A7E counter hits 0:
// cadence (decrements per game day), TALK35 return card, standby recovery,
// queue removal, and re-formation. This answers the §13 countdown question
// (264F-clear + 1 decrement per own-slot visit) quantitatively.
// Exit 0: full 2A7E cycle observed live (counter -> 0, TALK35 shown+closed,
// general standby, re-formable).
// Exit 2: retryable dice loss (29C3/TALK33 branch or captureno-card).
// Exit 1: regression failure or unresolvable live interference (dumped).
// Labeled fixture: production 6E8F formation (createOriginalLegion) invoked
// directly for 曹仁; list scroll and camera moves are test setup; everything
// else is production code. The extinct-owner "unaffiliated" branch is
// node-covered (verify_original_legion_fate 2A7E cases) through the identical
// performScenarioLegionFate entry and composed here, not re-driven live
// (killing the player faction live would end the scenario).
// No SAVE.DAT, no user profile.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const TARGET_FACTION = 13; // 呂布
const TARGET_CITY = 79; // 呂布 capital
const FORM_GENERAL = 70; // 曹仁 (battle_rating 52, max idle)

const server = await startBrowserTestServer();
let browser;
const errors = [];
let diceOutcome = "unknown";
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
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__warMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__warMenuHandler,
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

  // Talk recorder: wraps the production queue, records only (+stack for fate).
  await page.evaluate(() => {
    window.__talkLog = [];
    const bar = window.__app.gamebar;
    const orig = bar.enqueueTalkMessage.bind(bar);
    bar.enqueueTalkMessage = (message) => {
      const entry = { talkIndex: message?.talkIndex, kind: message?.kind };
      if (message?.kind === "postbattle-fate" || message?.kind === "postbattle-general-return") {
        entry.stack = String(new Error("fate-trace").stack ?? "")
          .split("\n")
          .slice(1, 14)
          .join(" <- ");
      }
      window.__talkLog.push(entry);
      return orig(message);
    };
  });

  // ---- Fixture (labeled): production 6E8F formation of 曹仁. ----
  const formed = await page.evaluate(async (generalIdx) => {
    const app = window.__app;
    const sc = app.scenario;
    const assembly = await import("/src/game/scenarioassembly.js");
    const formation = await import(
      "/src/game/navigation/originalformation.js"
    );
    const general = sc.generals[generalIdx];
    if (!general || general.faction !== sc.player_faction || general.status !== 0)
      throw new Error("fixture general not idle");
    const ctx = assembly.scenarioNativeRoadContext(sc);
    const result = formation.createOriginalLegion(sc, ctx, general.idx);
    const legion = sc.legions.find((l) => l.slot === general.idx);
    return {
      generalIdx: general.idx,
      name: (general.name ?? "").trim(),
      br: general.battle_rating ?? general.raw_battle_rating ?? null,
      cf: result.cf,
      status: legion?.status,
      troops: legion?.troops,
    };
  }, FORM_GENERAL);
  tlog(`formed: ${JSON.stringify(formed)}`);
  assert.equal(formed.cf, false, "production formation must succeed");
  assert.ok((formed.status & 0xc0) === 0xc0, "legion must be active");

  // ---- Phase A pre-check: 呂布 verdict al=1 (slot-19 type1 in flight). ----
  const pre = await page.evaluate(async (target) => {
    const app = window.__app;
    const sc = app.scenario;
    const me = sc.factions.find((f) => f.idx === sc.player_faction);
    const fac = sc.factions.find((f) => f.idx === target);
    const wp = await import("/src/game/navigation/originalwarproposal.js");
    const nd = await import("/src/game/nativediplomacy.js");
    const ai = await import("/src/game/ai.js");
    const bellicosity = me.bellicosity ?? 10;
    const pending = ai.hasPendingStrategicEvent(sc, 1, { arg0: me.idx });
    const verdict = wp.originalHostileProposalVerdict6475({
      relationByte: nd.nativeDiplomacyAt(sc, me.idx, fac.idx, "precheck"),
      bellicosity,
      pendingType1OnTarget: pending,
      targetAttackingFaction: fac.target_faction ?? 0xff,
      playerIndex: me.idx,
      targetMoneyWord: fac.money ?? 0,
      weStronger:
        (me.n_cities ?? 1) * (bellicosity + 20) > (fac.n_cities ?? 1) * 25,
    });
    return {
      monarch: (fac.monarch ?? "").trim(),
      al: verdict.al,
      pending,
      trust: sc.trust,
      row: sc.factions.filter((f) => f && f.idx !== me.idx).findIndex((f) => f.idx === target),
    };
  }, TARGET_FACTION);
  tlog(`precheck: ${JSON.stringify(pre)}`);
  assert.equal(pre.pending, true, "slot-19 type1 曹操->呂布 must be in flight");
  assert.equal(pre.al, 1, "target must auto-accept (敵已在攻我)");
  assert.ok(pre.row >= 0, "target row must exist");

  // ---- Phase A clicks: 進言 -> 敵對提案 -> 呂布 row. ----
  const barOpen = await page.evaluate(() => Boolean(window.__app.gamebar.submenuOpen));
  if (!barOpen) {
    await page.mouse.click(bx + 351, 15); // fan toggle
    await page.waitForFunction(() => Boolean(window.__app.gamebar.submenuOpen));
  }
  await page.mouse.click(bx + 47, 56); // cell 0 進言
  await page.waitForFunction(() => Boolean(window.__app.gamebar.adviceMenu));
  const adviceRow = await page.evaluate(() => {
    const m = window.__app.gamebar.adviceMenu;
    const x = m.ox + 8;
    const y = m.oy + 8;
    const w = (m.wTiles - 1) * 16;
    const h = (m.hTiles - 1) * 16;
    return { x: x + w / 2, y: y + (h / m.items.length) * 0.5, items: m.items };
  });
  assert.deepEqual(adviceRow.items, ["敵對提案", "停戰提案", "請求協助", "遷都", "請求君主出陣"]);
  await page.mouse.click(adviceRow.x, adviceRow.y);
  await page.waitForFunction(() => Boolean(window.__app.gamebar.listDialog));
  const factionRow = await page.evaluate((row) => {
    const bar = window.__app.gamebar;
    const d = bar.listDialog;
    bar._recalcListDialog();
    return {
      x: d.px + d.w / 2,
      y: d.py + d.top + row * d.rowH + d.rowH / 2,
      cap: d.cap,
      scroll: d.scroll,
      factionIdx: d.rows[row]?._faction?.idx ?? null,
      monarch: (d.rows[row]?._faction?.monarch ?? "").trim(),
    };
  }, pre.row);
  tlog(`faction row: ${JSON.stringify(factionRow)}`);
  assert.ok(pre.row < factionRow.cap, "target row must be visible without scroll");
  assert.equal(factionRow.factionIdx, TARGET_FACTION, "row must be 呂布");
  await page.mouse.click(factionRow.x, factionRow.y);
  // State-driven audience pump: timer phases auto-advance in ~3s, so never
  // assert a transient step; click to fast-forward timer phases and pick
  // the true reason once choose_reason is drawn.
  await page.waitForFunction(
    () => Boolean(window.__app.gamebar.proposalAudience),
    null,
    { timeout: 15000 },
  );
  let sawDone = false;
  for (let i = 0; i < 120; i++) {
    const step = await page.evaluate(
      () => window.__app.gamebar.proposalAudience?.step ?? null,
    );
    if (step === null) break;
    // al=1 path never enters choose_reason; any such step would be a
    // verdict mismatch, so fail loudly instead of clicking a reason.
    assert.notEqual(step, "choose_reason", "al=1 must skip the reason menu");
    if (step === "done" && !sawDone) {
      sawDone = true;
      await page.screenshot({ path: "dr_audience_accept.png" });
    }
    await page.mouse.click(512, 400);
    await page.waitForTimeout(400);
  }
  assert.ok(sawDone, "acceptance must have been shown");
  assert.equal(
    await page.evaluate(() => Boolean(window.__app.gamebar.proposalAudience)),
    false,
    "audience must close",
  );
  const declared = await page.evaluate(async (target) => {
    const app = window.__app;
    for (let i = 0; i < 60; i++) {
      const dip = await import("/src/game/diplomacy.js");
      if (dip.isAtWar(app.scenario, app.scenario.player_faction, target)) {
        const nd = await import("/src/game/nativediplomacy.js");
        return {
          atWar: true,
          ab: nd.nativeDiplomacyAt(app.scenario, app.scenario.player_faction, target, "dec"),
          ba: nd.nativeDiplomacyAt(app.scenario, target, app.scenario.player_faction, "dec"),
          trust: app.scenario.trust,
          log: window.__talkLog.slice(),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { atWar: false, trust: app.scenario.trust, log: window.__talkLog.slice() };
  }, TARGET_FACTION);
  tlog(`declared: ${JSON.stringify(declared)}`);
  assert.equal(declared.atWar, true, "3526 commit must clear bit7 both ways");
  assert.equal(declared.ab & 0x80, 0, "forward byte must drop bit7");
  assert.equal(declared.ba & 0x80, 0, "reverse byte must drop bit7");
  assert.equal(declared.trust, 255, "trust saturates at 255 (+10)");
  const warCard = declared.log.find((m) => m.kind === "war-declaration");
  assert.ok(warCard, "war-declaration TALK card must be queued");
  tlog(`war-declaration talk: ${warCard.talkIndex}`);
  assert.ok(
    warCard.talkIndex >= 486 && warCard.talkIndex <= 493,
    "war-declaration talk must be TALK486..493",
  );
  await page.screenshot({ path: "dr_declared.png" });

  // ---- Phase B: delegated order on city 79, march, arrival fate. ----
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
      const opened = await page.evaluate(() => Boolean(window.__app.gamebar.legionMenu));
      if (opened) break;
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
      const probe = await page.evaluate((args) => {
        const sc = window.__app.scenario;
        const L = sc.legions.find((l) => l.slot === args.slot);
        return {
          targetCity: L?.targetCity,
          delegated: (L?.status & 4) === 4,
          menuOpen: Boolean(window.__app.gamebar.orderChoiceMenu),
        };
      }, { slot: formed.generalIdx });
      if (probe.targetCity === idx && probe.delegated) break;
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
    return page.evaluate((args) => {
      const sc = window.__app.scenario;
      const L = sc.legions.find((l) => l.slot === args.slot);
      return {
        targetCity: L?.targetCity,
        delegated: (L?.status & 4) === 4,
        orderOpen: Boolean(window.__app.gamebar.marchingOrder),
      };
    }, { slot: formed.generalIdx });
  }
  const first = await orderToCity(TARGET_CITY);
  tlog(`hop-1 order: ${JSON.stringify(first)}`);
  assert.equal(first.targetCity, TARGET_CITY, "hop-1 order must stick");
  assert.equal(first.delegated, true, "hop-1 order must be delegated");

  // March watch: 4300 way-city adoption -> re-order; arrival -> fate watch.
  const march = await page.evaluate(
    async ({ slot, cityIdx }) => {
      const app = window.__app;
      const sc = app.scenario;
      const log = [];
      const seen = new Set();
      const dayNo = () => app.clock.month * 31 + app.clock.day;
      const startNo = dayNo();
      const key = () => `${app.clock.month}/${app.clock.day}`;
      let lastPos = "";
      let still = 0;
      for (let iter = 0; iter < 480; iter++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const L = sc.legions.find((l) => l.slot === slot);
        const C = sc.cities[cityIdx];
        const pos = `${L?.x},${L?.y}`;
          const ctr = sc.legionSlotCounters?.[slot];
        still = pos === lastPos ? still + 1 : 0;
        lastPos = pos;
        const talks = window.__talkLog
          .filter((m) => m.kind === "postbattle-fate")
          .map((m) => m.talkIndex)
          .join(",");
        const foes = (sc.nativeLegionSlots?.records ?? [])
          .filter((r) => r && (r.status & 0x80) && r.faction !== sc.player_faction)
          .map((r) => `${r.faction}@(${r.x},${r.y})st${r.status}`)
          .join(";");
        const state = `d${key()} L(${pos}) st${L?.status} tr${L?.troops} ctr${ctr} tgt${L?.targetCity} cityF${C?.faction} fate[${talks}] foes[${foes}] card${Boolean(app.gamebar.generalCard)} fail${Boolean(app._strategicBattleFailure)}`;
        if (!seen.has(state)) {
          seen.add(state);
          log.push(state);
        }
        if (app._strategicBattleFailure)
          return { end: "STRATEGIC-FAILURE", log };
        if (window.__talkLog.some((m) => m.kind === "postbattle-fate"))
          return { end: "FATE-CARD", log };
        if (C?.faction === sc.player_faction) return { end: "CAPTURED", log };
        if (L?.targetCity !== cityIdx && still >= 6)
          return { end: "REORDER", log };
        if (dayNo() - startNo >= 45) return { end: "DAY-CAP", log };
      }
      return { end: "ITER-CAP", log };
    },
    { slot: formed.generalIdx, cityIdx: TARGET_CITY },
  );
  tlog(`march end: ${march.end}`);
  for (const line of march.log.slice(0, 30)) tlog(`  ${line}`);
  if (march.log.length > 30) tlog(`  ... (${march.log.length - 30} more)`);

  let reorders = 0;
  let end = march.end;
  while (end === "REORDER" && reorders < 6) {
    reorders++;
    tlog(`re-order #${reorders} to city ${TARGET_CITY}`);
    const again = await orderToCity(TARGET_CITY);
    tlog(`hop-${reorders + 1} order: ${JSON.stringify(again)}`);
    if (again.targetCity !== TARGET_CITY || !again.delegated) {
      end = "ORDER-LOST";
      break;
    }
    const cont = await page.evaluate(
      async ({ slot, cityIdx }) => {
        const app = window.__app;
        const sc = app.scenario;
        const log = [];
        const seen = new Set();
        const dayNo = () => app.clock.month * 31 + app.clock.day;
        const startNo = dayNo();
        const key = () => `${app.clock.month}/${app.clock.day}`;
        let lastPos = "";
        let still = 0;
        for (let iter = 0; iter < 480; iter++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const L = sc.legions.find((l) => l.slot === slot);
          const C = sc.cities[cityIdx];
          const pos = `${L?.x},${L?.y}`;
          const ctr = sc.legionSlotCounters?.[slot];
          still = pos === lastPos ? still + 1 : 0;
          lastPos = pos;
          const talks = window.__talkLog
            .filter((m) => m.kind === "postbattle-fate")
            .map((m) => m.talkIndex)
            .join(",");
          const foes2 = (sc.nativeLegionSlots?.records ?? [])
            .filter((r) => r && (r.status & 0x80) && r.faction !== sc.player_faction)
            .map((r) => `${r.faction}@(${r.x},${r.y})st${r.status}`)
            .join(";");
          const state = `d${key()} L(${pos}) st${L?.status} tr${L?.troops} ctr${ctr} tgt${L?.targetCity} cityF${C?.faction} fate[${talks}] foes[${foes2}] card${Boolean(app.gamebar.generalCard)} fail${Boolean(app._strategicBattleFailure)}`;
          if (!seen.has(state)) {
            seen.add(state);
            log.push(state);
          }
          if (app._strategicBattleFailure)
            return { end: "STRATEGIC-FAILURE", log };
          if (window.__talkLog.some((m) => m.kind === "postbattle-fate"))
            return { end: "FATE-CARD", log };
          if (C?.faction === sc.player_faction) return { end: "CAPTURED", log };
          if (L?.targetCity !== cityIdx && still >= 6)
            return { end: "REORDER", log };
          if (dayNo() - startNo >= 45) return { end: "DAY-CAP", log };
        }
        return { end: "ITER-CAP", log };
      },
      { slot: formed.generalIdx, cityIdx: TARGET_CITY },
    );
    tlog(`march cont end: ${cont.end}`);
    for (const line of cont.log.slice(0, 30)) tlog(`  ${line}`);
    if (cont.log.length > 30) tlog(`  ... (${cont.log.length - 30} more)`);
    end = cont.end;
  }

  if (end === "FATE-CARD") {
    const fateTalks = await page.evaluate(() =>
      window.__talkLog.filter((m) => m.kind === "postbattle-fate"),
    );
    tlog(`fate talks: ${JSON.stringify(fateTalks)}`);
    diceOutcome = fateTalks.map((m) => m.talkIndex).join(",");
    // Capture the live fate page while displayed, then wait for auto-close.
    await page.screenshot({ path: "dr_fate_card.png" });
    await page.waitForFunction(() => !window.__app.gamebar.generalCard, null, {
      timeout: 20000,
    });
    await page.screenshot({ path: "dr_fate_closed.png" });
    if (diceOutcome.includes("31")) {
      // 2977 writes status 8: rebindNativeLegionViews moves the record
      // from sc.legions to sc.delayedLegionReturns (the 2A7E queue).
      // Field-fate parks at the battlefield, NOT the ordered city.
      const finale = await page.evaluate((args) => {
        const sc = window.__app.scenario;
        const native = sc.nativeLegionSlots?.records?.[args.slot] ?? null;
        const delayed = (sc.delayedLegionReturns ?? []).find(
          (l) => l.slot === args.slot,
        ) ?? null;
        const live = sc.legions.find((l) => l.slot === args.slot) ?? null;
        const general = sc.generals[args.slot];
        return {
          failure: Boolean(window.__app._strategicBattleFailure),
          nativeStatus: native?.status,
          nativeTroops: native?.troops,
          countdown: native?.engagementCountdown,
          delayedStatus: delayed?.status,
          delayedAt: delayed ? [delayed.x, delayed.y] : null,
          livePresent: Boolean(live),
          generalStatus: general?.status,
          generalFaction: general?.faction,
        };
      }, { slot: formed.generalIdx, city: TARGET_CITY });
      tlog(`finale: ${JSON.stringify(finale)}`);
      assert.equal(finale.failure, false, "no strategic failure may be held");
      assert.equal(finale.nativeStatus, 8, "native slot must hold 2977 state");
      assert.equal(finale.delayedStatus, 8, "record must enter the 2A7E queue");
      assert.ok(
        Array.isArray(finale.delayedAt) &&
          Math.abs(finale.delayedAt[0] - 241) <= 3 &&
          Math.abs(finale.delayedAt[1] - 108) <= 3,
        `queue must park at the battlefield: ${JSON.stringify(finale.delayedAt)}`,
      );
      assert.equal(finale.livePresent, false, "status-8 record leaves the live view");
      assert.equal(finale.generalFaction, 0, "general must stay ours (not captured)");
      assert.equal(finale.generalStatus, 1, "2977 keeps G17 fielded (no 29C3 write)");
      assert.ok(
        Number.isFinite(finale.nativeTroops) && finale.nativeTroops < 600,
        `a field battle must have cost troops: ${finale.nativeTroops}`,
      );
      assert.deepEqual(errors, [], "no page/console errors");
      tlog("TALK31 field-fate live chain complete");

      // ---- Phase C: 2A7E live regression on the production clock. ----
      const slot = formed.generalIdx;
      const snap = () => page.evaluate((s) => {
        const app = window.__app;
        const sc = app.scenario;
        const native = sc.nativeLegionSlots?.records?.[s] ?? null;
        const delayed = (sc.delayedLegionReturns ?? []).find(
          (l) => l.slot === s,
        ) ?? null;
        const general = sc.generals[s];
        const card = app.gamebar?.generalCard ?? null;
        return {
          day: `${app.clock.month}/${app.clock.day}`,
          dayNo: app.clock.month * 31 + app.clock.day,
          counter: sc.legionSlotCounters?.[s],
          nativeStatus: native?.status ?? null,
          pos: delayed ? [delayed.x, delayed.y] : null,
          delayedPresent: Boolean(delayed),
          generalStatus: general?.status,
          generalFaction: general?.faction,
          hold: Boolean(app.clock.hold),
          battle: Boolean(app.battleView?.active || app.engageTransition?.active),
          card: card
            ? { kind: card.kind ?? null, talkIndex: card.talkIndex ?? null }
            : null,
          fail: Boolean(app._strategicBattleFailure),
          talks35: window.__talkLog.filter((m) => m.talkIndex === 35).length,
        };
      }, slot);
      let c0 = await snap();
      tlog(`phaseC start: ${JSON.stringify(c0)}`);
      const day0 = c0.dayNo;
      const counter0 = c0.counter;
      assert.ok(
        Number.isInteger(counter0) && counter0 >= 0 && counter0 <= 255,
        `entry counter must be a byte: ${counter0}`,
      );
      // Live wait: ~3 own-slot visits per game day (16-slot batch interval
      // per hourly tick, full 128 sweep every 8 ticks). 256-visit path caps
      // near 90 days; poll every 5s with a 20-minute ceiling.
      let cur = c0;
      let lastLogged = JSON.stringify([c0.day, c0.counter]);
      let stallTicks = 0;
      let recovered = false;
      for (let i = 0; i < 240; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        cur = await snap();
        const key = JSON.stringify([cur.day, cur.counter]);
        if (key !== lastLogged) {
          tlog(`phaseC day ${cur.day}: ${JSON.stringify(cur)}`);
          lastLogged = key;
        }
        assert.equal(cur.fail, false, "no strategic failure during the wait");
        assert.deepEqual(errors, [], "no page/console errors during the wait");
        if (cur.counter === 0) {
          recovered = true;
          break;
        }
        // Counter must never grow: exactly 1 decrement per own-slot visit.
        if (cur.counter > c0.counter && c0.counter !== 0) {
          throw new Error(
            `counter grew ${c0.counter} -> ${cur.counter}: not a 2A7E decay`,
          );
        }
        c0 = cur.counter === c0.counter ? c0 : cur;
        if (cur.hold && cur.battle) {
          stallTicks++;
          if (stallTicks >= 12) {
            throw new Error(
              `live battle interference stalls the clock: ${JSON.stringify(cur)}`,
            );
          }
        } else {
          stallTicks = 0;
        }
      }
      assert.ok(recovered, `counter must reach 0 within the ceiling (last=${JSON.stringify(cur)})`);
      tlog(`recovered at day ${cur.day} after ${cur.dayNo - day0} game days from counter ${counter0}`);
      // TALK35 return card (kind postbattle-general-return) must queue.
      let talk35 = null;
      for (let i = 0; i < 24; i++) {
        const log = await page.evaluate(() => window.__talkLog.slice());
        talk35 = log.find((m) => m.talkIndex === 35);
        if (talk35) break;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      assert.ok(talk35, "TALK35 return card must queue at recovery");
      assert.equal(talk35.kind, "postbattle-general-return", "TALK35 kind");
      tlog(`talk35: ${JSON.stringify(talk35)}`);
      await page.screenshot({ path: "dr_return_card.png" });
      await page.waitForFunction(() => !window.__app.gamebar.generalCard, null, {
        timeout: 60000,
      });
      await page.screenshot({ path: "dr_returned.png" });
      const end = await snap();
      tlog(`phaseC end: ${JSON.stringify(end)}`);
      assert.equal(end.nativeStatus, 0, "2A85 must clear the slot status");
      assert.equal(end.delayedPresent, false, "record must leave the 2A7E queue");
      assert.equal(end.generalStatus, 0, "2A8E must return the general to standby");
      assert.equal(end.generalFaction, 0, "general must stay ours");
      assert.deepEqual(errors, [], "no page/console errors at recovery");
      // Re-formation proof: the returned general is fieldable again
      // through the production 6E8F entry (labeled fixture call).
      const reformed = await page.evaluate(async (generalIdx) => {
        const app = window.__app;
        const sc = app.scenario;
        const assembly = await import("/src/game/scenarioassembly.js");
        const formation = await import(
          "/src/game/navigation/originalformation.js"
        );
        const ctx = assembly.scenarioNativeRoadContext(sc);
        const result = formation.createOriginalLegion(sc, ctx, generalIdx);
        const legion = sc.legions.find((l) => l.slot === generalIdx);
        return { cf: result.cf, status: legion?.status, troops: legion?.troops };
      }, slot);
      tlog(`reformed: ${JSON.stringify(reformed)}`);
      assert.equal(reformed.cf, false, "returned general must re-form");
      assert.ok((reformed.status & 0xc0) === 0xc0, "re-formed legion active");
      tlog("2A7E live cycle complete: counter->0, TALK35, standby, re-formed");
    } else {
      tlog(`dice loss: fate branch ${diceOutcome}, retryable`);
      process.exitCode = 2;
    }
  } else {
    tlog(`no fate card (end=${end}), retryable`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`HARD-FAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  tlog(`page errors: ${JSON.stringify(errors.slice(0, 5))}`);
  await browser?.close();
  server.close();
}
