// Q69 batch 8e endview-defeat evidence (ruling A): real browser, real original mechanisms only.
// later-4 single-city faction (faction 1 嚴國棟 at 南昌, bordered on three sides by faction 0, no orders
// play), max strategic/tactical speeds via the real system-menu UI, all audiences answered only
// through real canvas left-clicks (last-item passive choice / keypad 決定 / dialog advance — every
// option clicked is an original-mechanism choice), battles left to resolve with no orders. No
// backend shortcuts, no rule/fee/morale invention, no engine change (zero production files touched).
// PASS: endView shows grf/gameover.png with an extinction caption and score.scene === 'gameover'.
// Bound: 22-minute pump; timeout is an honest FAIL (attempt preserved), never a fabricated pass.
// attempt-1 (dry, later-3): a full passive year produced no war and no extinction — honest fail
// preserved as attempt1-q69-8e-dry-endview; target reselected to the later-4 single city.
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
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned endview defeat JSON", { cause }); } }

// Unit domain: defeat path wired in the untouched engine + later-4 premise + real-UI controls.
const unit = () => {
	const commands = readFileSync("web/src/game/commands.js", "utf8");
	assert.ok(commands.includes("export function checkTrustGameOver(app)"), "trust gameover present");
	assert.ok(commands.includes('img: "grf/gameover.png"'), "trust gameover image present");
	const ai = readFileSync("web/src/game/ai.js", "utf8");
	assert.ok(ai.includes("export function triggerNativePlayerDefeat(app, sc, deadOwner)"), "native player defeat present");
	assert.ok(ai.includes('img: "grf/gameover.png"'), "extinction gameover image present");
	const endview = readFileSync("web/src/render/endview.js", "utf8");
	assert.ok(endview.includes('if (o.img === "grf/gameover.png") this.app.score?.gameOver();'), "endview gameover branch present");
	const score = readFileSync("web/src/core/score.js", "utf8");
	assert.ok(score.includes("gameOver() {"), "score gameOver present");
	evidence("unit-defeat-callsites", true, true);
	const source = readInstalledEditorSource(BUILTIN_RESOURCES, (url) => readFileSync(join("web", url)));
	const later4 = source.chapters.find((c) => c.id === "later-4");
	const alive = (later4.state.factions || []).filter((f) => !f.dead && f.active !== false);
	evidence("unit-later-4-two-factions", alive.length, 2);
	const fac1Cities = (later4.state.cities || []).filter((c) => (c.owner ?? c.faction) === 1);
	evidence("unit-later-4-single-city", fac1Cities.length, 1);
	const trialapp = readFileSync("web/src/editor/servertrialapp.js", "utf8");
	assert.ok(trialapp.includes('select.id = "trial-faction"'), "faction select present");
	assert.ok(trialapp.includes("playerFaction: chosen"), "explicit faction choice wired");
	evidence("unit-faction-choice", true, true);
	const gamebar = readFileSync("web/src/ui/gamebar.js", "utf8");
	assert.ok(gamebar.includes("c.strategicSpeed = ((c.strategicSpeed ?? 2) + 1) % 5;"), "strategic speed cycle present");
	assert.ok(gamebar.includes('["book", 432]'), "system menu toolbar icon present");
	evidence("unit-speed-control", true, true);
	const copyprofile = readFileSync("server/copyprofile.js", "utf8");
	assert.ok(copyprofile.includes("nativeFactionSlotRaw"), "trial chapter keeps native faction source");
	const trialruntime = readFileSync("web/src/content/authoring/trialruntime.js", "utf8");
	assert.ok(trialruntime.includes('prepareScenario({ raw, idx: 0, mode: "fresh"'), "trial boots fresh native scenario");
	evidence("unit-trial-premise", true, true);
};
unit();

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-endview-")), config = parsed(readFileSync("server/wrangler.jsonc"));
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
const PUMP_BUDGET_MS = 22 * 60 * 1000;
try {
	server = await startEditorBackend(join(own, "config.json"), { stageSource: true, stageLibrary: true });
	origin = new URL(server.url).origin;
	const admin = await changePw(await login("tianyi", initial), initial, password);
	let r = await req("/api/admin/source/install", {}, admin); assert.equal(r.status, 200);
	r = await req("/api/admin/library/install", {}, admin); assert.equal(r.status, 200);
	const sourceEntry = await req("/api/admin/source", undefined, admin);
	const def = sourceEntry.data.definition, copyKey = randomUUID();
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "終局敗北", introduction: "" }, admin, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, admin, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;
	evidence("setup-copy-run", typeof gameId === "string", true);

	browser = await chromium.launch();
	context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
	const watch = (page, label) => {
		page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ label, text: msg.text(), url: msg.location()?.url ?? null, at: Date.now() }); });
		page.on("pageerror", (error) => pageErrors.push({ label, text: error.message, at: Date.now() }));
	};

	// Page 1: workbench login, load draft, open later-4 trial popup.
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

	// Faction select: passive single-city side (1 嚴國棟). Real DOM select = real player choice.
	await page2.waitForSelector("#trial-faction", { timeout: 30000 });
	await page2.selectOption("#trial-faction", "1");
	evidence("browser-faction-panel", await page2.locator("#trial-faction option[value=\"1\"]").count(), 1);
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

	// Canvas mapping probe (input mapping only, not a mechanism): game coords -> CSS px.
	const mapping = await page2.evaluate(() => {
		const c = document.querySelector("canvas");
		const r = c.getBoundingClientRect();
		return { left: r.left, top: r.top, sx: r.width / c.width, sy: r.height / c.height, cw: c.width, ch: c.height };
	});
	const clickGame = async (gx, gy) => page2.mouse.click(mapping.left + gx * mapping.sx, mapping.top + gy * mapping.sy);
	// Max speeds via the real system-menu UI (toolbar book icon, then 戰略速度 x2 + 戰術速度 x2).
	const bx = await page2.evaluate(() => window.__dragonApp?.gamebar?.bx ?? Math.round((innerWidth - 640) / 2));
	await clickGame(bx + 447, 15);
	await page2.waitForFunction(() => window.__dragonApp?.gamebar?.settingsOpen === true, null, { timeout: 15000 });
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
	// Close the system menu with the same real toggle before the pump starts.
	await clickGame(bx + 447, 15);
	await page2.waitForFunction(() => window.__dragonApp?.gamebar?.settingsOpen === false, null, { timeout: 15000 });

	// Passive pump: only original-mechanism left-clicks. Never clicks during tactical play
	// (no orders issued — idling units is legitimate original play) or on endview.
	const snapshot = () => page2.evaluate(() => {
		const app = window.__dragonApp, sc = app?.scenario, gb = app?.gamebar;
		const p = gb?.proposalAudience ?? null;
		const me = sc?.factions?.find((f) => f?.idx === sc?.player_faction);
		const reasons = p?.reasonsRect ? { x: p.reasonsRect.x, y: p.reasonsRect.y, w: p.reasonsRect.w, h: p.reasonsRect.h, n: p.reasonsRect.items?.length ?? 0 } : null;
		const keypad = gb?.keypadDialog ? { ox: gb.keypadDialog.ox, oy: gb.keypadDialog.oy } : null;
		return {
			date: [app?.clock?.year, app?.clock?.month, app?.clock?.day].join("-"),
			playerDead: me?.dead === true || (sc?.cities ?? []).filter((c) => (c.owner ?? c.faction) === sc?.player_faction).length === 0,
			endView: { active: app?.endView?.active === true, img: app?.endView?.img?.currentSrc ?? app?.endView?.img?.src ?? null, caption: document.querySelector("#edcap")?.textContent ?? null },
			capDebug: { hasEndView: app?.endView != null, capIsNull: app?.endView?.cap == null, edcapText: document.querySelector("#edcap")?.textContent ?? null, endvDisplay: document.querySelector("#endv")?.style?.display ?? null },
			audience: p ? { type: p.type ?? null, step: p.step ?? null, reasons, keypad, budget: (p.type === "domestic-budget" || p.type === "envoy-budget") } : null,
			battle: app?.battleView?.active === true,
			trial: app?.trialGate?.state ?? null,
			vw: innerWidth, vh: innerHeight,
		};
	});
	const startSnap = await snapshot();
	const startDate = startSnap.date, deadline = Date.now() + PUMP_BUDGET_MS;
	let pumpClicks = 0, audiences = {}, lastLog = Date.now(), finalSnap = null;
	for (;;) {
		const s = await snapshot();
		if (s.endView.active) { finalSnap = s; break; }
		if (Date.now() > deadline) throw new Error(`8e defeat not reached in bound (date ${s.date}, playerDead ${s.playerDead}, trial ${s.trial})`);
		const a = s.audience;
		if (a && !s.battle) {
			audiences[a.type] = (audiences[a.type] ?? 0) + 1;
			if (a.reasons && a.reasons.n > 0) {
				// Choice: passive original option = last item (撤回進言 / 拒絕 class).
				const rh = a.reasons.h / a.reasons.n;
				await clickGame(a.reasons.x + a.reasons.w / 2, a.reasons.y + rh * (a.reasons.n - 1) + rh / 2);
				pumpClicks++;
			} else if (a.keypad) {
				// Keypad 決定 key (c===4, r===2) with the opened default value kept.
				await clickGame(a.keypad.ox + 8 + 120, a.keypad.oy + 8 + 24 + 48 + 12);
				pumpClicks++;
			} else if (a.budget) {
				// Centered 288x176 budget dialog: any left-click advances the original sequence.
				await clickGame((s.vw - 288) / 2 + 144, (s.vh - 176) / 2 + 20 + 88);
				pumpClicks++;
			} else {
				// Message step: center click advances or no-ops (map left purity holds).
				await clickGame(s.vw / 2, s.vh / 2);
				pumpClicks++;
			}
			await page2.waitForTimeout(1500);
		} else {
			await page2.waitForTimeout(2000);
		}
		if (Date.now() - lastLog > 60000) { lastLog = Date.now(); tlog(`8e pump alive date=${s.date} battle=${s.battle} trial=${s.trial} clicks=${pumpClicks}`); }
	}
	evidence("browser-defeat-gameover", String(finalSnap.endView.img ?? "").endsWith("grf/gameover.png"), true);
	const defeatScene = await page2.evaluate(() => window.__dragonApp?.score?.scene);
	const capSnap = await snapshot();
	const capDebug = capSnap.capDebug;
	const loginDoneAt = workbenchLoginAt;
	const expectedConsole = consoleErrors.filter((e) => e.label === "workbench" && (e.url ?? "").endsWith("/api/session") && e.text.includes("401") && e.at <= loginDoneAt);
	const unexpected = consoleErrors.filter((e) => !expectedConsole.includes(e));
	writeFileSync(join(out, "observations.json"), `${JSON.stringify({ img: finalSnap.endView.img, caption: finalSnap.endView.caption, capDebug, scene: defeatScene, date: finalSnap.date, pumpClicks, audiences, trial: finalSnap.trial, classifiedExpected: expectedConsole, unexpectedConsole: unexpected, pageErrors }, null, 2)}\n`, { flag: "wx" });
	evidence("browser-gameover-caption", /覆滅|信賴度|軍覆滅/.test(finalSnap.endView.caption ?? ""), true);
	evidence("browser-score-gameover", await page2.evaluate(() => window.__dragonApp?.score?.scene), "gameover");
	evidence("browser-no-unexpected-errors", unexpected.length + pageErrors.length, 0);

	const receipt = {
		result: "PASS-TRIAL-ENDVIEW-DEFEAT-8E-NOT-Q69-CLOSURE",
		round, checks, calls,
		gate: { error: null, chapter: "later-4", playerFaction: 1, endView: "grf/gameover.png", scoreScene: "gameover" },
		observations: { startDate, endDate: finalSnap.date, pumpClicks, audiences, trialAtEnd: finalSnap.trial, consoleErrors, pageErrors },
		limits: "Ruling A defeat half: later-4 passive single-city play under original mechanisms only (no invented rules/fees/orders/APIs, zero production change); unification browser proof stays residual. Trial content premise (user-approved): only 据点/道路/武将 data differ, engine/rules/AI untouched. Click-to-title reload left unasserted (trial-reload reboot ambiguity, static code reviewed). This is not a Q69 closure certificate. No runtime/Release admission.",
	};
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
	tlog(`PASS ${checks.length} checks, ${calls.length} calls`);
} finally {
	if (context) await context.close().catch(() => {});
	if (browser) await browser.close().catch(() => {});
	if (server) await server.close();
}
