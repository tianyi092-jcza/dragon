// Q69 batch 8g trial-tactical evidence (item 2, actual verification, short-offensive design):
// real browser through the real trial stack (workbench -> trial shell -> trialGate -> battleView
// with the 7d _trialFrames boundary). later-4, player picks faction 0, declares war by the 0x3644
// setup formula and issues one march order through the production cmd.dispatch entry against
// 南昌(175) from the nearest owned city (same setup approximation the native tactical harness
// uses, declared here). 4F36 guarantees the tactical suspend for a player-led attack
// (attacker==player, non-delegated, real defender — originalsiege.js). Opening TALK auto-closes
// (3s product rule, never clicked); tactical frames are pumped through the REAL trial boundary
// object (battleView._trialFrames.update — the same function the rAF loop calls), never by
// bypassing it. PASS: tactical-suspended -> battleView active -> frames advance -> finish writes
// back -> queue drained -> strategic clock resumes, zero unexpected errors.
// Mechanism dividend (originalsiege.js dispatchOriginalSiegeBattle,实锤): city==player with only
// the 0x4200 temporary defender goes QUICK battle (4F06->TALK26 warning on attacker win, no
// tactical) — this explains why 8e and 8g-dry7 passive runs reached extinction with zero tactical
// episodes. Design history: v1 long march (虎牢關->南昌 dist 163) hit a genuine engine coverage
// gap (originalroadmovement unsigned fail-closed, trial-stack-independent, NOT fixed here,
// residual for the march-engagement thread, attempt5現場 preserved); v2 passive defense confirmed
// the quick-path mechanism (dry7 honest no-tactical); v3 short-offensive forces 4F36 deterministically.
// No backend shortcuts, no rule/fee/morale invention, no engine change, zero production files touched.
// Bounds are honest FAILs (attempts preserved), never fabricated passes.
// Trial content premise (user-approved): only 据点/道路/武将 data differ in trial chapters;
// engine/rules/AI are untouched and unaffected, so builtin-derived later-4 proves the engine path.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { request as httpsRequest } from "node:https";
import { format } from "node:util";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
assert.ok(existsSync(join(out, "fixture.js")), "round fixture.js must be pre-staged");
mkdirSync(out, { recursive: true });
/** Harness progress goes through tlog (repo convention), not console.log. */
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
const checks = [], calls = [], consoleErrors = [], pageErrors = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned tactical frames JSON", { cause }); } }

// Unit domain: tactical entry + trial boundary wired in the untouched engine + battle assets.
const unit = async () => {
	const boundary = readFileSync("web/src/editor/trialruleboundaries.js", "utf8");
	assert.ok(boundary.includes("export function createTrialBattleFrames("), "trial tactical frames factory present");
	assert.ok(boundary.includes("reentrant trial tactical frame"), "reentrancy guard present");
	assert.ok(boundary.includes("hold must be boolean"), "hold boolean check present");
	const battleview = readFileSync("web/src/render/battleview.js", "utf8");
	assert.ok(battleview.includes("createTrialBattleFrames(this.app.trialGate"), "battleview opt-in install present");
	assert.ok(battleview.includes("this._trialFrames ? this._trialFrames.update(dt) : this.updateBattleFrames(dt)"), "loop drives the trial boundary in trial");
	evidence("unit-tactical-boundary-static", true, true);
	const ai = readFileSync("web/src/game/ai.js", "utf8");
	assert.ok(ai.includes("export function suspendNativeTacticalBattle(app, sc, request)"), "tactical suspend entry present");
	assert.ok(ai.includes("onTacticalBattle: (request) =>"), "tactical channel present");
	const siege = readFileSync("web/src/game/navigation/originalsiege.js", "utf8");
	assert.ok(siege.includes('suspended: "tactical-suspended"'), "siege 4F36 player-attack branch present");
	assert.ok(siege.includes('kind: "siege-attack"'), "siege-attack kind present");
	assert.ok(siege.includes("suspended: \"siege-warning-26\""), "siege 4F06 quick-warning branch present");
	const legacy = readFileSync("web/src/game/nativelegions.js", "utf8");
	assert.ok(legacy.includes("if (value === null || value === undefined) continue;"), "publish drops null fields");
	const commands = readFileSync("web/src/game/commands.js", "utf8");
	assert.ok(commands.includes("roadEdgeOrNode: dispatchSourceRoadNode(sc, fromCity),"), "dispatch resolves via dispatchSourceRoadNode");
	assert.ok(commands.includes("function dispatchSourceRoadNode(sc, city)"), "dispatchSourceRoadNode helper present");
	assert.ok(commands.includes("context.roads.roadNodeAt(city.x, city.y)"), "helper prefers the scenario's own world graph");
	assert.ok(!commands.includes("roadNodeRawAddress(roadNodeAt(fromCity.x, fromCity.y)?.id) ?? null"), "legacy facade-only dispatch removed");
	evidence("unit-dispatch-node-source-static", true, true);
	const talk = parsed(readFileSync("web/talk.json"));
	const isEmpty = (s) => !Array.isArray(s) || s.length === 0 || !s.some((x) => x);
	assert.deepEqual([27, 28, 29].filter((i) => isEmpty(talk.strings[i])), [], "tactical opening TALK 27/28/29 non-empty");
	evidence("unit-opening-talk-27-29", true, true);
	const { FIXED_TRIAL_ASSET_PATHS } = await import("../web/src/editor/trialassetpaths.js");
	for (const p of ["battle_talk.json", "battle_display.bin", "grf/battle_terrain_0.png", "grf/battle_terrain_1.png", "grf/battle_terrain_2.png", "grf/battle_units.png"]) assert.ok(FIXED_TRIAL_ASSET_PATHS.includes(p), `trial asset path ${p}`);
	for (const p of ["web/battle_talk.json", "web/battle_display.bin"]) assert.ok(existsSync(p), `disk asset ${p}`);
	evidence("unit-battle-assets-static", true, true);
	const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => readFileSync(join("web", url)));
	const later4 = source.chapters.find((c) => c.id === "later-4");
	const alive = (later4.state.factions || []).filter((f) => !f.dead && f.active !== false);
	evidence("unit-later-4-two-factions", alive.length, 2);
	const fac0Cities = (later4.state.cities || []).filter((c) => (c.owner ?? c.faction) === 0);
	assert.ok(fac0Cities.length >= 1, "faction 0 holds cities to attack from");
	const nanchang = (later4.state.cities || []).find((c) => c.idx === 175);
	assert.ok(nanchang && (nanchang.owner ?? nanchang.faction) === 1, "Nanchang 175 held by faction 1");
	evidence("unit-later-4-premise", true, true);
	const trialapp = readFileSync("web/src/editor/servertrialapp.js", "utf8");
	assert.ok(trialapp.includes('select.id = "trial-faction"'), "faction select present");
	assert.ok(trialapp.includes("playerFaction: chosen"), "explicit faction choice wired");
	evidence("unit-faction-choice", true, true);
	const gamebar = readFileSync("web/src/ui/gamebar.js", "utf8");
	assert.ok(gamebar.includes("c.strategicSpeed = ((c.strategicSpeed ?? 2) + 1) % 5;"), "strategic speed cycle present");
	evidence("unit-speed-control", true, true);
	const trialruntime = readFileSync("web/src/content/authoring/trialruntime.js", "utf8");
	assert.ok(trialruntime.includes('prepareScenario({ raw, idx: 0, mode: "fresh"'), "trial boots fresh native scenario");
	evidence("unit-trial-premise", true, true);
};
await unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-tactical-")), config = parsed(readFileSync("server/wrangler.jsonc"));
config.main = resolve(join(out, "fixture.js"));
writeFileSync(join(own, "config.json"), JSON.stringify(config), { flag: "wx" });
writeFileSync(join(own, ".dev.vars"), `EDITOR_DEFAULT_PASSWORD=${JSON.stringify(initial)}\nEDITOR_REQUEST_KEY=${JSON.stringify(randomBytes(32).toString("hex"))}\n`, { flag: "wx" });

let server, browser, origin, context;
function req(path, value, session, extra = {}) {
	const h = { Origin: origin, ...extra };
	if (session) { h.Cookie = session.cookie; h["X-CSRF-Token"] = session.csrf; }
	if (value !== undefined) { h["Content-Type"] = "application/json"; h["Idempotency-Key"] ??= randomUUID(); }
	return new Promise((done, reject) => {
		const q = httpsRequest(origin + path, { method: value === undefined ? "GET" : "POST", headers: h, rejectUnauthorized: false }, (s) => {
			const chunks = [];
			s.on("data", (b) => chunks.push(b));
			s.on("error", reject);
			s.on("end", () => {
				const r = { status: s.statusCode, bytes: Buffer.concat(chunks), cookie: s.headers["set-cookie"]?.[0]?.split(";")[0] };
				let data = null;
				try { data = JSON.parse(r.bytes); } catch {}
				calls.push({ realm: "backend", path, status: r.status });
				done({ ...r, data });
			});
		});
		q.on("error", reject);
		q.end(value === undefined ? undefined : JSON.stringify(value));
	});
}
const login = async (account, pw) => { const r = await req("/api/auth/login", { account, password: pw }, null); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; };
const changePw = async (session, oldPw, newPw) => { const r = await req("/api/auth/password", { oldPassword: oldPw, newPassword: newPw }, session); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; };

const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE ||
		"C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

setConnectionPolicy(true);
const SETUP_BUDGET_MS = 10 * 60 * 1000, MARCH_BUDGET_MS = 30 * 60 * 1000, FINISH_BUDGET_MS = 25 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
	server = await startEditorBackend(join(own, "config.json"), { stageSource: true, stageLibrary: true });
	origin = new URL(server.url).origin;
	const admin = await changePw(await login("tianyi", initial), initial, password);
	let r = await req("/api/admin/source/install", {}, admin); assert.equal(r.status, 200);
	r = await req("/api/admin/library/install", {}, admin); assert.equal(r.status, 200);
	const sourceEntry = await req("/api/admin/source", undefined, admin);
	const def = sourceEntry.data.definition, copyKey = randomUUID();	r = await req("/api/admin/copies", { registryId: def.registryId, name: "戰術幀", introduction: "" }, admin, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, admin, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("setup-copy-run", typeof gameId === "string", true);

	browser = await chromium.launch();
	context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
	const watch = (page, label) => {
		page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ label, text: msg.text(), url: msg.location()?.url ?? null, at: Date.now() }); });
		page.on("pageerror", (error) => pageErrors.push({ label, text: error.message, at: Date.now() }));
	};

	// Page 1: workbench login, load draft, open later-4 trial popup (same front as 8e).
	const page1 = await context.newPage();
	watch(page1, "workbench");
	await page1.goto(`${origin}/`);
	await page1.fill("form#login input[name=account]", "tianyi");
	await page1.fill("form#login input[name=password]", password);
	await page1.click("form#login button");
	await page1.waitForSelector("#session:not([hidden])", { timeout: 30000 });
	const workbenchLoginAt = Date.now();
	await page1.click("#draft-games-refresh");
	await page1.waitForSelector(`#draft-game option[value="${gameId}"]`, { state: "attached", timeout: 30000 });
	await page1.selectOption("#draft-game", gameId);
	await page1.fill("#draft-revision", "1");
	await page1.click("#draft-load");
	await page1.waitForFunction(() => document.querySelector("#draft-status")?.textContent.includes("已載入"), null, { timeout: 120000 });
	evidence("browser-workbench-loaded", await page1.locator("#draft-trial-chapter option").count(), 20);
	await page1.selectOption("#draft-trial-chapter", `${gameId}#later-4`);
	const popupPromise = context.waitForEvent("page", { timeout: 120000 });
	await page1.click("#draft-trial-start");
	const page2 = await popupPromise;
	watch(page2, "trial-window");
	await page2.waitForURL(/\/api\/trial\/web\/\?trial=[a-f0-9-]{36}$/, { timeout: 120000 });
	const dispatchNodeSource = await page2.evaluate(async () => {
		const mod = await import("/api/trial/web/src/game/commands.js");
		return typeof mod.dispatch === "function";
	});
	evidence("browser-dispatch-entry-importable", dispatchNodeSource, true);

	// Faction select: attacking side (0). Real DOM select = real player choice.
	await page2.waitForSelector("#trial-faction", { timeout: 30000 });
	await page2.selectOption("#trial-faction", "0");
	evidence("browser-faction-panel", await page2.locator("#trial-faction option[value=\"0\"]").count(), 1);
	await page2.click("#start-trial");
	await page2.waitForFunction(() => window.__dragonApp?.trialGate?.state === "running", null, { timeout: 60000 });
	await page2.waitForFunction(() => {
		const t = document.querySelector("#trial-status")?.textContent ?? "";
		return t.includes("僅記憶體") || t.includes("無法啟動") || t.includes("身份不符");
	}, null, { timeout: 90000 });
	assert.ok(await page2.evaluate(() => (document.querySelector("#trial-status")?.textContent ?? "").includes("僅記憶體")), "trial boot banner (boot failure otherwise)");
	const readClock = () => page2.evaluate(() => ({ y: window.__dragonApp?.clock?.year, m: window.__dragonApp?.clock?.month, d: window.__dragonApp?.clock?.day, state: window.__dragonApp?.trialGate?.state }));
	const first = await readClock();
	assert.equal(first.state, "running");
	let advanced = false;
	for (let at = 0; at < 40 && !advanced; at++) {
		await page2.waitForTimeout(500);
		const next = await readClock();
		advanced = next.state === "running" && (next.d !== first.d || next.m !== first.m || next.y !== first.y);
	}
	evidence("browser-boot-running", advanced, true);

	// Max speeds via the real system-menu UI (mapping probe + early-audience retry).
	let mapping = null;
	for (let t = 0; t < 40 && !mapping; t++) {
		const probe = await page2.evaluate(() => {
			const app = window.__dragonApp;
			const c = app?.view?.cv ?? document.querySelector("#cv") ?? document.querySelector("canvas");
			if (!c) return null;
			const r = c.getBoundingClientRect();
			return { left: r.left, top: r.top, sx: r.width / c.width, sy: r.height / c.height, cw: c.width, ch: c.height, id: c.id ?? null };
		});
		if (probe && probe.cw >= 1000 && probe.sx > 0) mapping = probe;
		else await page2.waitForTimeout(500);
	}
	assert.ok(mapping, "map canvas never reached its playable size");
	tlog("MAPPING", JSON.stringify(mapping));
	const clickGame = async (gx, gy) => page2.mouse.click(mapping.left + gx * mapping.sx, mapping.top + gy * mapping.sy);
	const bx = await page2.evaluate(() => window.__dragonApp?.gamebar?.bx ?? Math.round((innerWidth - 640) / 2));
	const readSettings = () => page2.evaluate(() => window.__dragonApp?.gamebar?.settingsOpen === true);
	const answerAudienceShape = async (pa, vw, vh) => {
		if (!pa) return;
		if (pa.reasons && pa.reasons.n > 0) { const rh = pa.reasons.h / pa.reasons.n; await clickGame(pa.reasons.x + pa.reasons.w / 2, pa.reasons.y + rh * (pa.reasons.n - 1) + rh / 2); }
		else if (pa.keypad) await clickGame(pa.keypad.ox + 8 + 120, pa.keypad.oy + 8 + 24 + 48 + 12);
		else if (pa.budget) await clickGame((vw - 288) / 2 + 144, (vh - 176) / 2 + 20 + 88);
		else await clickGame(vw / 2, vh / 2);
		await page2.waitForTimeout(1500);
	};
	let pumpClicks = 0;
	// Settings phase: NEVER answer audiences here — their answer clicks (keypad/reasons
	// rects) can land in the toolbar band and toggle unrelated icons. Audiences are
	// handled later by the pump; the book toggle works while they are open.
	let settingsOpened = false;
	for (let t = 0; t < 30 && !settingsOpened; t++) {
		await clickGame(bx + 447, 15);
		await page2.waitForTimeout(700);
		if (await readSettings()) settingsOpened = true;
	}
	tlog("SETTINGS", JSON.stringify({ opened: settingsOpened }));
	if (!settingsOpened) {
		await page2.screenshot({ path: join(out, "settings-blocked.png") });
		const dump = await page2.evaluate(() => {
			const app = window.__dragonApp, gb = app?.gamebar;
			return { date: [app?.clock?.year, app?.clock?.month, app?.clock?.day].join("-"), settingsOpen: gb?.settingsOpen ?? null, submenuOpen: gb?.submenuOpen ?? null, resOpen: gb?.resOpen ?? null, miniOpen: gb?.miniOpen ?? null, proposal: gb?.proposalAudience ? { type: gb.proposalAudience.type, step: gb.proposalAudience.step } : null, endView: app?.endView?.active ?? null, battle: app?.battleView?.active ?? null, trial: app?.trialGate?.state ?? null };
		});
		throw new Error(`settings never opened: ${JSON.stringify(dump)}`);
	}
	const settingsRect = await page2.evaluate(() => window.__dragonApp?.gamebar?._settingsRect?.() ?? null);
	assert.ok(settingsRect && settingsRect.rows >= 5, "settings rect readable");
	const rowY = (i) => settingsRect.y + 8 + 30 + i * 26 + 13;
	const rowX = settingsRect.x + 8 + 40;
	await clickGame(rowX, rowY(3)); await page2.waitForTimeout(400);
	await clickGame(rowX, rowY(3)); await page2.waitForTimeout(400);
	await clickGame(rowX, rowY(4)); await page2.waitForTimeout(400);
	await clickGame(rowX, rowY(4)); await page2.waitForTimeout(400);
	const speeds = await page2.evaluate(() => ({ s: window.__dragonApp?.clock?.strategicSpeed, t: window.__dragonApp?.tacticalSpeed }));
	assert.deepEqual(speeds, { s: 4, t: 4 });
	evidence("browser-max-speed", true, true);
	await clickGame(bx + 447, 15);
	let settingsClosed = false;
	for (let t = 0; t < 20 && !settingsClosed; t++) {
		await page2.waitForTimeout(800);
		if (!(await readSettings())) { settingsClosed = true; break; }
		await clickGame(bx + 447, 15);
	}
	assert.ok(settingsClosed, "settings closed");

	// Setup (declared approximation, native-harness precedent): declareWar 0x3644 formula + one
	// march order through the production cmd.dispatch entry against 南昌(175) from the nearest
	// owned city. Retried: dispatch needs troops/generals/funds ready in live time.
	let setup = null;
	const setupDeadline = Date.now() + SETUP_BUDGET_MS;
	const panToCity = async (cityIdx) => {
		// Real map input only: drag the canvas until the target city is inside the viewport.
		for (let step = 0; step < 60; step++) {
			const p = await page2.evaluate((idx) => {
				const app = window.__dragonApp, c = app.scenario.cities[idx];
				const cit = app?.view?.cv ?? document.querySelector("#cv") ?? document.querySelector("canvas"), r = cit.getBoundingClientRect();
				const [wxp, wyp] = app.view.cityPixel(c);
				return { x: r.left + app.view.sx(wxp), y: r.top + app.view.sy(wyp), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
			}, cityIdx);
			if (p.x >= p.cx - 40 && p.y >= p.cy - 40 && p.x <= p.cx + 40 && p.y <= p.cy + 40) return p;
			const dx = Math.max(-120, Math.min(120, p.cx - p.x)), dy = Math.max(-120, Math.min(120, p.cy - p.y));
			await page2.mouse.move(p.cx, p.cy);
			await page2.mouse.down();
			await page2.mouse.move(p.cx + dx, p.cy + dy, { steps: 4 });
			await page2.mouse.up();
			await page2.waitForTimeout(150);
		}
		return null;
	};
	for (;;) {
		setup = await page2.evaluate(() => {
			const app = window.__dragonApp, sc = app.scenario, pf = sc.player_faction;
			const target = sc.cities[175];
			if (!target || (target.owner ?? target.faction) !== 1) return { retry: "nanchang-fallen" };
			const cityTroops = (c) => c.sim?.troops ?? c.troops ?? 0;
			let graphReady = false;
			const nodeAt = (c) => { try { graphReady = app.world?.roads?.roadGraphReady() === true; return app.world?.roads?.roadNodeAt(c.x, c.y) ?? null; } catch { return null; } };
			const mine = (sc.cities ?? []).filter((c) => (c.owner ?? c.faction) === pf && cityTroops(c) > 0);
			const onRoad = mine.filter((c) => nodeAt(c) != null);
			if (!graphReady) return { fatal: "road graph not loaded in trial (graphReady false)" };
			if (!onRoad.length) return { fatal: `no-onroad-city (mine ${mine.length}, onroad 0)` };
			onRoad.sort((a, b) => (Math.abs(a.x - target.x) + Math.abs(a.y - target.y) - (Math.abs(b.x - target.x) + Math.abs(b.y - target.y))) || (cityTroops(b) - cityTroops(a)));
			const fromCity = onRoad[0];
			const a = pf, b = target.owner ?? target.faction;
			const curA = ((sc.diplomacy?.[a]?.[b] ?? 0x80) & 0x7f) | 0, curB = ((sc.diplomacy?.[b]?.[a] ?? 0x80) & 0x7f) | 0;
			const warVal = Math.min(curA, curB) >> 1;
			sc.diplomacy[a][b] = warVal; sc.diplomacy[b][a] = warVal;
			// Production march entry: the city panel's 出征 tab arms app.dispatching; the
			// target-city click runs through the real canvas input path (onSelect -> app cmd.dispatch).
			app.dispatching = fromCity;
			return { from: fromCity.idx, city: 175, dist: Math.abs(fromCity.x - target.x) + Math.abs(fromCity.y - target.y), mine: mine.length, onRoad: onRoad.length, graphReady };
		});
		if (setup?.fatal) throw new Error(`setup structurally blocked: ${setup.fatal}`);
		if (setup && !setup.retry) break;
		if (Date.now() > setupDeadline) throw new Error(`dispatch setup never ready in bound: ${JSON.stringify(setup)}`);
		await page2.waitForTimeout(30000);
	}
	const targetPos = await panToCity(setup.city);
	if (!targetPos) throw new Error("target city never became visible on the real map");
	await clickGame(targetPos.x, targetPos.y);
	for (let t = 0; t < 20; t++) {
		const armed = await page2.evaluate((idx) => {
			const app = window.__dragonApp, sc = app.scenario, pf = sc.player_faction;
			const ours = (sc.legions ?? []).filter((l) => (l.faction ?? l.owner) === pf && l.slot < 127);
			const newest = ours.reduce((best, l) => (best == null || (l.slot ?? -1) > (best.slot ?? -1) ? l : best), null);
			return { count: ours.length, newest: newest ? { slot: newest.slot, edge: newest.roadEdgeOrNode ?? null, flagged: (newest.targetCity ?? newest.target?.idx ?? null) === idx } : null, dispatching: app.dispatching?.idx ?? null };
		}, setup.city);
		if (armed.dispatching == null && armed.newest?.flagged) {
			tlog("SETUP", JSON.stringify(setup), "ARMED", JSON.stringify(armed));
			if (!Number.isInteger(armed.newest.edge)) throw new Error(`offroad freeze certain: legion slot ${armed.newest.slot} roadEdgeOrNode ${String(armed.newest.edge)}`);
			evidence("browser-dispatch-ok", true, true);
			break;
		}
		if (t === 19) throw new Error(`dispatch click did not create a marching legion: ${JSON.stringify(armed)}`);
		await page2.waitForTimeout(1000);
	}

	// March phase: 8e-style pump answers strategic audiences via real clicks; no clicks during battle.
	const snapshot = () => page2.evaluate(() => {
		const app = window.__dragonApp, sc = app?.scenario, gb = app?.gamebar;
		const p = gb?.proposalAudience ?? null, q = app?._nativeTacticalQueue ?? [];
		const me = sc?.factions?.find((f) => f?.idx === sc?.player_faction);
		const reasons = p?.reasonsRect ? { x: p.reasonsRect.x, y: p.reasonsRect.y, w: p.reasonsRect.w, h: p.reasonsRect.h, n: p.reasonsRect.items?.length ?? 0 } : null;
		const keypad = gb?.keypadDialog ? { ox: gb.keypadDialog.ox, oy: gb.keypadDialog.oy } : null;
		return {
			date: [app?.clock?.year, app?.clock?.month, app?.clock?.day].join("-"),
			tick: app?.clock?.strategicTickSerial ?? null,
			playerDead: me?.dead === true || (sc?.cities ?? []).filter((c) => (c.owner ?? c.faction) === sc?.player_faction).length === 0,
			endView: app?.endView?.active === true,
			queue: q.length, kind: q[0]?.request?.kind ?? null, talk: q[0]?.request?.talk ?? null,
			audience: p ? { type: p.type ?? null, step: p.step ?? null, reasons, keypad, budget: (p.type === "domestic-budget" || p.type === "envoy-budget") } : null,
			battle: app?.battleView?.active === true,
			hasTrialFrames: app?.battleView?._trialFrames != null,
			failure: app?._strategicBattleFailure ? String(app._strategicBattleFailure.error?.stack || app._strategicBattleFailure.error).slice(0, 2000) : null,
			trial: app?.trialGate?.state ?? null,
			vw: innerWidth, vh: innerHeight,
		};
	});
	const answerAudience = async (s) => {
		const a = s.audience;
		if (!a || s.battle) return false;
		await answerAudienceShape(a, s.vw, s.vh);
		pumpClicks++;
		return true;
	};
	let state = await snapshot();
	const marchDeadline = Date.now() + MARCH_BUDGET_MS;
	let lastLog = Date.now();
	for (;;) {
		if (state.queue > 0 || state.battle) break;
		if (state.failure != null) throw new Error(`strategic failure held the pump: ${state.failure}`);
		if (state.endView || state.playerDead) throw new Error(`player died before tactical (date ${state.date})`);
		if (Date.now() > marchDeadline) throw new Error(`tactical suspend not reached in bound (date ${state.date})`);
		if (!(await answerAudience(state))) await page2.waitForTimeout(2000);
		state = await snapshot();
		if (Date.now() - lastLog > 60000) {
			lastLog = Date.now();
			const tele = await page2.evaluate(() => {
				const sc = window.__dragonApp.scenario, pf = sc.player_faction;
				return (sc.legions ?? []).filter((l) => l && (l.faction ?? l.owner) === pf && l.slot < 127).slice(0, 4).map((l) => ({ slot: l.slot, x: l.x, y: l.y, status: l.status, troops: l.troops ?? null }));
			});
			tlog(`8g march alive date=${state.date} queue=${state.queue} battle=${state.battle} trial=${state.trial} clicks=${pumpClicks} legions=${JSON.stringify(tele)}`);
		}
	}
	evidence("browser-tactical-suspended", typeof state.kind === "string" && state.kind.length > 0, true);
	const suspendedKind = state.kind, suspendedTalk = state.talk;
	const before = await page2.evaluate(() => {
		const app = window.__dragonApp, sides = app._nativeTacticalQueue[0].request.sides;
		return { kind: app._nativeTacticalQueue[0].request.kind, atkSlot: sides.attacker.slot, atkTroops: sides.attacker.troops, atkMorale: sides.attacker.morale, defSlot: sides.defender.slot, defTroops: sides.defender.troops, defMorale: sides.defender.morale, city: sides.city?.idx ?? null, cityTroops: sides.city?.troops ?? null, rngCalls: app.originalRng.snapshot().calls };
	});
	tlog("SUSPENDED", JSON.stringify({ kind: suspendedKind, talk: suspendedTalk, before }));

	// Battle open: the opening TALK auto-closes (product 3s rule, never clicked here).
	const openDeadline = Date.now() + 120 * 1000;
	for (;;) {
		state = await snapshot();
		if (state.failure != null) throw new Error(`strategic failure before battle open: ${state.failure}`);
		if (state.battle) break;
		if (Date.now() > openDeadline) throw new Error(`battle never opened after suspend (date ${state.date})`);
		await page2.waitForTimeout(500);
	}
	evidence("browser-battle-open", state.hasTrialFrames, true);
	await page2.screenshot({ path: join(out, "tactical-open.png") });

	// Battle phase: pump the REAL trial boundary object; no clicks anywhere in this phase.
	let frames = 0;
	const finishDeadline = Date.now() + FINISH_BUDGET_MS;
	for (;;) {
		const advanced = await page2.evaluate(() => {
			const bv = window.__dragonApp?.battleView;
			if (!bv?.active || bv._trialFrames == null) return { active: bv?.active === true, n: 0, noBoundary: bv?.active === true };
			let n = 0, over = false;
			while (bv.active && n < 500) { over = bv._trialFrames.update(1); n++; if (over) break; }
			if (bv.active && bv.battle?.over) { bv.draw(); bv.finish(); }
			return { active: bv.active, n };
		});
		if (advanced.noBoundary) throw new Error("battle active without the trial boundary (trialGate lost?)");
		frames += advanced.n;
		state = await snapshot();
		if (state.failure != null) throw new Error(`strategic failure during battle: ${state.failure}`);
		if (!advanced.active && !state.battle) break;
		if (Date.now() > finishDeadline) throw new Error(`battle not finished in bound (date ${state.date}, frames ${frames})`);
		await sleep(300);
	}
	evidence("browser-battle-frames", frames > 0, true);
	await page2.screenshot({ path: join(out, "tactical-after.png") });

	// Write-back: battle records / city / RNG must show the fight (zero writeback = silent loss).
	const afterState = await page2.evaluate((b) => {
		const app = window.__dragonApp;
		const find = (slot) => (app.scenario.legions ?? []).find((l) => l?.slot === slot);
		const atk = find(b.atkSlot), def = find(b.defSlot);
		const city = b.city == null ? null : app.scenario.cities[b.city];
		return { atkTroops: atk?.troops ?? null, atkMorale: atk?.morale ?? null, defTroops: def?.troops ?? null, defMorale: def?.morale ?? null, cityTroops: city?.troops ?? null, cityFaction: city?.owner ?? city?.faction ?? null, rngCalls: app.originalRng.snapshot().calls, queue: (app._nativeTacticalQueue ?? []).length, tick: app.clock.strategicTickSerial ?? null };
	}, before);
	tlog("AFTER", JSON.stringify(afterState));
	const changed = afterState.atkTroops !== before.atkTroops || afterState.atkMorale !== before.atkMorale || afterState.defTroops !== before.defTroops || afterState.defMorale !== before.defMorale || afterState.cityTroops !== before.cityTroops || afterState.rngCalls !== before.rngCalls;
	evidence("browser-battle-writeback", changed, true);
	evidence("browser-queue-drained", afterState.queue, 0);

	// Resume: strategic clock advances 1500 ticks with zero failure flags.
	const resumeDeadline = Date.now() + 8 * 60 * 1000, targetTick = (afterState.tick ?? 0) + 1500;
	for (;;) {
		state = await snapshot();
		if (state.failure != null) throw new Error(`strategic failure after battle: ${state.failure}`);
		if ((state.tick ?? 0) >= targetTick) break;
		if (Date.now() > resumeDeadline) throw new Error(`clock did not resume (tick ${state.tick}, target ${targetTick})`);
		if (!(await answerAudience(state))) await page2.waitForTimeout(1000);
	}
	evidence("browser-clock-resumed", true, true);

	const expectedConsole = consoleErrors.filter((e) => e.label === "workbench" && (e.url ?? "").endsWith("/api/session") && e.text.includes("401") && e.at <= workbenchLoginAt);
	const unexpected = consoleErrors.filter((e) => !expectedConsole.includes(e));
	writeFileSync(join(out, "observations.json"), `${JSON.stringify({ kind: suspendedKind, talk: suspendedTalk, before, after: afterState, frames, pumpClicks, endTick: state.tick, trial: state.trial, classifiedExpected: expectedConsole, unexpectedConsole: unexpected, pageErrors }, null, 2)}\n`, { flag: "wx" });
	evidence("browser-no-unexpected-errors", unexpected.length + pageErrors.length, 0);

	const receipt = {
		result: "PASS-TRIAL-TACTICAL-Frames-8G-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: null, chapter: "later-4", playerFaction: 0, kind: suspendedKind, frames, writeback: true, queueDrained: true, clockResumed: true },
		observations: { pumpClicks, setup, before, after: afterState, consoleErrors, pageErrors },
		limits: "Item 2 actual verification (short-offensive design): later-4 faction-0 attack on Nanchang from the nearest owned city under original mechanisms (0x3644 setup formula + one production cmd.dispatch march order, opening auto-close, frames pumped through the real _trialFrames boundary, zero production change). Design history: v1 long march exposed a genuine engine movement-coverage gap (attempt5 residual, not fixed); v2 passive defense confirmed the 0x4200 quick-path mechanism (dry7 honest no-tactical). Victory/unification browser proof stays out of scope (item 1 shelved). This is not a Q69 closure certificate. No runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	tlog(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (context) await context.close().catch(() => {});
	if (browser) await browser.close().catch(() => {});
	if (server) await server.close();
}
