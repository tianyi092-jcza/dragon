import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Round-3 item 2: hostile-proposal declaration chain live in the browser.
// Phase A (production clicks only): advisor 進言 -> 敵對提案 -> 呂布 row ->
// audience fast-forward -> al=1 auto-accept (a type1 曹操->呂布 plot event
// is in flight at slot 19, so 6475 reports 敵已在攻我) -> done (Talk 93..95,
// trust +20 saturating at 255) -> TALK486+ war-declaration card -> commit ->
// matrix bit7 cleared both ways. The al=2 reasons path is unit-locked by
// verify_native_war_proposal 8/8; live it is shadowed scenario-wide while
// the slot-19 event is pending, so it is out of scope here.
// Phase B (production clicks + live clock): delegated order on 呂布's capital
// (city 79) -> march (4300 hop re-orders as needed) -> 呂布 fields a blocker
// legion at ~(243,108) -> delegated field battle (600->~475 troops) ->
// post-battle 4AC1 fate dice (captor=defender faction) -> 2977 TALK31 live
// card (player==L01) -> auto-close -> status 8 in the 2A7E queue.
// 実锤修正: TALK31 is the 291A->2977 player-side message wherever fate fires
// (march/field/siege/arrival), not arrival-only; production 呂布 actively
// defends 徐州, so the chain honestly ends at the field roadblock.
// Exit 0: TALK31 displayed live and closed, legion holds the 2977 queue.
// Exit 2: retryable dice loss (29C3/TALK33 branch or captureno-card).
// Labeled fixture: production 6E8F formation (createOriginalLegion) invoked
// directly for 曹仁 (highest battle_rating, best 2977 odds); list scroll and
// camera moves are test setup; everything else is production code.
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
      if (message?.kind === "postbattle-fate") {
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
      await page.screenshot({ path: "war_audience_accept.png" });
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
  await page.screenshot({ path: "war_declared.png" });

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
    await page.screenshot({ path: "war_fate_card.png" });
    await page.waitForFunction(() => !window.__app.gamebar.generalCard, null, {
      timeout: 20000,
    });
    await page.screenshot({ path: "war_fate_closed.png" });
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
