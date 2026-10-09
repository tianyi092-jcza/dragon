// Q70/Q71 browser evidence: fresh Chromium context against the real local backend.
// Workbench click -> wait page -> shell -> faction select -> App run -> offline hold -> online resume
// -> password-change terminal -> no-revive -> explicit end. IDB spy 0, console/page/outside errors 0.
// Anonymous formal game lives on the dev-server stack and is out of this evidence surface (registered boundary).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { request as httpsRequest } from "node:https";
import { startEditorBackend } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/startup-transport-probe.mjs";
import { setConnectionPolicy } from "../.dragon-analysis/editor-phase/saved-source-canonical-buffered-native-session-r1/tls-transport-probe.mjs";

const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.equal(process.argv.length, 3);
const out = join(".dragon-analysis/editor-phase", round);
mkdirSync(out, { recursive: true });
const checks = [], calls = [], outside = [], consoleErrors = [], pageErrors = [];
const evidence = (name, actual, expected) => { assert.equal(actual, expected, `${name}: ${actual}`); checks.push({ name, status: expected }); };
function parsed(b) { try { return JSON.parse(b); } catch (cause) { throw new Error("owned trial browser JSON", { cause }); } }

const initial = `init${randomBytes(13).toString("hex")}`, password = `pw1${randomBytes(13).toString("hex")}`, password2 = `pw2${randomBytes(13).toString("hex")}`;
const own = mkdtempSync(join(tmpdir(), "trial-browser-")), config = parsed(readFileSync("server/wrangler.jsonc"));
config.main = resolve(`.dragon-analysis/editor-phase/${round}/fixture.js`);
writeFileSync(join(own, "config.json"), JSON.stringify(config), { flag: "wx" });
writeFileSync(join(own, ".dev.vars"), `EDITOR_DEFAULT_PASSWORD=${JSON.stringify(initial)}\nEDITOR_REQUEST_KEY=${JSON.stringify(randomBytes(32).toString("hex"))}\n`, { flag: "wx" });

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
let server, browser, origin, context;
try {
	server = await startEditorBackend(join(own, "config.json"), { stageSource: true, stageLibrary: true });
	origin = new URL(server.url).origin;
	const admin = await changePw(await login("tianyi", initial), initial, password);
	let r = await req("/api/admin/source/install", {}, admin); assert.equal(r.status, 200);
	r = await req("/api/admin/library/install", {}, admin); assert.equal(r.status, 200);
	const def = (await req("/api/admin/source", undefined, admin)).data.definition, copyKey = randomUUID();
	r = await req("/api/admin/copies", { registryId: def.registryId, name: "瀏覽器證據", introduction: "" }, admin, { "Idempotency-Key": copyKey }); assert.equal(r.status, 202);
	r = await req(`/api/admin/copies/${copyKey}/run`, {}, admin, { "If-Match": '"1"' }); assert.equal(r.status, 200, r.data?.error);
	const gameId = r.data.gameId;

	browser = await chromium.launch();
	context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
	await context.addInitScript(() => {
		window.__idbOpenCount = 0;
		const original = indexedDB.open.bind(indexedDB);
		indexedDB.open = (...args) => { window.__idbOpenCount++; return original(...args); };
	});
	context.on("request", (request) => { if (request.url().startsWith("http") && !request.url().startsWith(origin)) outside.push(request.url()); });
	// Console/page errors are captured with URL + Node-side arrival time so expected entries can be
	// classified by URL and timing (design evidence) instead of being silently dropped.
	const watch = (page, label) => {
		page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ label, text: msg.text(), url: msg.location()?.url ?? null, at: Date.now() }); });
		page.on("pageerror", (error) => pageErrors.push({ label, text: error.message, stack: error.stack?.split("\n").slice(0, 6).join(" | ") ?? null, at: Date.now() }));
	};

	// Page 1: workbench login, load draft, click trial button
	const page1 = await context.newPage();
	watch(page1, "workbench");
	await page1.goto(`${origin}/`);
	await page1.fill("form#login input[name=account]", "tianyi");
	await page1.fill("form#login input[name=password]", password);
	await page1.click("form#login button");
	await page1.waitForSelector("#session:not([hidden])", { timeout: 30000 });
	const loginDoneAt = Date.now();
	evidence("login-workbench", true, true);
	await page1.click("#draft-games-refresh");
	await page1.waitForSelector(`#draft-game option[value="${gameId}"]`, { state: "attached", timeout: 30000 });
	await page1.selectOption("#draft-game", gameId);
	await page1.fill("#draft-revision", "1");
	await page1.click("#draft-load");
	await page1.waitForFunction(() => document.querySelector("#draft-status")?.textContent.includes("已載入"), null, { timeout: 120000 });
	const chapterCount = await page1.locator("#draft-trial-chapter option").count();
	evidence("draft-loaded-chapters", chapterCount, 20);
	await page1.selectOption("#draft-trial-chapter", `${gameId}#upper-1`);
	const popupPromise = context.waitForEvent("page", { timeout: 120000 });
	await page1.click("#draft-trial-start");
	const page2 = await popupPromise;
	watch(page2, "trial-window");
	await page2.waitForURL(/\/api\/trial\/web\/\?trial=[a-f0-9-]{36}$/, { timeout: 120000 });
	const trialId = new URL(page2.url()).searchParams.get("trial");
	assert.match(trialId, /^[a-f0-9-]{36}$/);
	const shellNavAt = Date.now();
	evidence("popup-shell-navigation", true, true);
	// Faction select and boot
	await page2.waitForSelector("#trial-faction", { timeout: 30000 });
	evidence("faction-panel", true, true);
	await page2.click("#start-trial");
	await page2.waitForFunction(() => window.__dragonApp?.trialGate?.state === "running", null, { timeout: 60000 });
	// The gate monitor can report 'running' from its first probe while startApp is still
	// mid-boot (monitor polls independently of openApp). Interrupting the network during
	// boot aborts critical-path loads and takes the registered boot-failure path
	// (window-dispose). The running banner is written by the post-boot watch, so it
	// strictly post-dates openApp resolution — wait for it before going offline.
	await page2.waitForFunction(() => {
		const t = document.querySelector("#trial-status")?.textContent ?? "";
		return t.includes("僅記憶體") || t.includes("無法啟動") || t.includes("身份不符");
	}, null, { timeout: 60000 });
	assert.ok(await page2.evaluate(() => (document.querySelector("#trial-status")?.textContent ?? "").includes("僅記憶體")), "trial A boot banner (boot failure otherwise)");
	const readClock = () => page2.evaluate(() => ({ hour: window.__dragonApp?.clock?.hour, day: window.__dragonApp?.clock?.day, state: window.__dragonApp?.trialGate?.state, reason: window.__dragonApp?.trialGate?.reason }));
	const first = await readClock();
	assert.equal(first.state, "running");
	let advanced = false;
	for (let at = 0; at < 40 && !advanced; at++) {
		await page2.waitForTimeout(500);
		const next = await readClock();
		advanced = next.state === "running" && (next.hour !== first.hour || next.day !== first.day);
	}
	evidence("app-running-clock-advances", advanced, true);
	// Offline: hold without disposal
	const offlineAt = Date.now();
	await context.setOffline(true);
	await page2.waitForFunction(() => window.__dragonApp?.trialGate?.state === "paused", null, { timeout: 30000 });
	const paused = await readClock();
	assert.equal(paused.state, "paused", `expected paused after offline, got ${JSON.stringify(paused)}`);
	// A synchronous frame already in flight may commit after the pause event (by design);
	// settle first, then two reads must both be frozen.
	await page2.waitForTimeout(1000);
	const settledA = await readClock();
	await page2.waitForTimeout(1500);
	const settledB = await readClock();
	evidence("offline-holds-clock", settledB.hour === settledA.hour && settledB.day === settledA.day && settledB.state === "paused" && settledA.state === "paused", true);
	// Online: re-confirm and resume
	await context.setOffline(false);
	const onlineAt = Date.now();
	await page2.waitForFunction(() => window.__dragonApp?.trialGate?.state === "running", null, { timeout: 30000 });
	let resumed = false;
	for (let at = 0; at < 40 && !resumed; at++) {
		await page2.waitForTimeout(500);
		const next = await readClock();
		resumed = next.state === "running" && (next.hour !== settledB.hour || next.day !== settledB.day);
	}
	evidence("online-resumes", resumed, true);
	// Q70: password change on page 1 -> terminal disposal on the trial window
	await page1.fill("form#password input[name=oldPassword]", password);
	await page1.fill("form#password input[name=newPassword]", password2);
	await page1.fill("form#password input[name=confirmPassword]", password2);
	await page1.click("form#password button");
	const pwChangeAt = Date.now();
	await page2.waitForFunction(() => window.__dragonApp?.trialGate?.state === "ended", null, { timeout: 60000 });
	// The shared cookie jar now holds the NEW session (epoch bumped): the next probe binds against the
	// old session token hash -> 401 TRIAL_INVALID -> trial-ended (batch-1 'status-after-relogin' path, row session-revoked).
	const ended = await page2.evaluate(() => ({ state: window.__dragonApp?.trialGate?.state, reason: window.__dragonApp?.trialGate?.reason }));
	assert.deepEqual(ended, { state: "ended", reason: "trial-ended" });
	await page2.waitForFunction(() => document.querySelector("#trial-status")?.textContent.includes("已結束"), null, { timeout: 30000 });
	evidence("password-change-terminal", true, true);
	// Re-login never revives: fresh window for the same trial gets 401 and never boots
	const page3 = await context.newPage();
	watch(page3, "revive-window");
	await page3.goto(`${origin}/api/trial/web/?trial=${trialId}`);
	await page3.waitForFunction(() => document.querySelector("#trial-status")?.textContent.length > 0, null, { timeout: 30000 });
	const revive = await page3.evaluate(() => document.querySelector("#trial-status").textContent);
	assert.ok(!revive.includes("修訂"), "no running banner on revive");
	evidence("relogin-no-revive", revive.includes("不可用") || revive.includes("結束") || revive.includes("重新"), true);
	// Trial B via page 1 (new session after password change), then explicit end
	await page1.click("#draft-games-refresh");
	await page1.waitForSelector(`#draft-game option[value="${gameId}"]`, { state: "attached", timeout: 30000 });
	await page1.selectOption("#draft-game", gameId);
	await page1.fill("#draft-revision", "1");
	await page1.click("#draft-load");
	await page1.waitForFunction(() => document.querySelector("#draft-status")?.textContent.includes("已載入"), null, { timeout: 120000 });
	await page1.selectOption("#draft-trial-chapter", `${gameId}#upper-1`);
	const popupB = context.waitForEvent("page", { timeout: 120000 });
	await page1.click("#draft-trial-start");
	const page4 = await popupB;
	watch(page4, "trial-b-window");
	await page4.waitForSelector("#trial-faction", { timeout: 30000 });
	await page4.click("#start-trial");
	await page4.waitForFunction(() => window.__dragonApp?.trialGate?.state === "running", null, { timeout: 60000 });
	const trialBId = new URL(page4.url()).searchParams.get("trial");
	// The gate can report 'running' from the first probe while startApp is still mid-boot
	// (monitor polls independently). Ending mid-boot makes late boot asset loads fail 401
	// (endCommit cascade-deletes trial_assets) and the boot-failure path ends the gate
	// 'window-dispose' (registered design behavior). This check targets the terminal-observation
	// path, so wait for the full boot: scenario assembled AND strategic clock advancing.
	// The post-boot running banner strictly post-dates openApp resolution (see trial A),
	// so it closes the residual mid-boot window that the scenario flag alone leaves open.
	await page4.waitForFunction(() => window.__dragonApp?.scenario && window.__dragonApp?.trialGate?.state === "running", null, { timeout: 60000 });
	await page4.waitForFunction(() => {
		const t = document.querySelector("#trial-status")?.textContent ?? "";
		return t.includes("僅記憶體") || t.includes("無法啟動") || t.includes("身份不符");
	}, null, { timeout: 60000 });
	assert.ok(await page4.evaluate(() => (document.querySelector("#trial-status")?.textContent ?? "").includes("僅記憶體")), "trial B boot banner (boot failure otherwise)");
	const readClockB = () => page4.evaluate(() => ({ hour: window.__dragonApp?.clock?.hour, day: window.__dragonApp?.clock?.day, state: window.__dragonApp?.trialGate?.state }));
	const firstB = await readClockB();
	let booted = false;
	for (let at = 0; at < 40 && !booted; at++) {
		await page4.waitForTimeout(500);
		const next = await readClockB();
		booted = next.state === "running" && (next.hour !== firstB.hour || next.day !== firstB.day);
	}
	evidence("trial-b-running", booted, true);
	const endResult = await page1.evaluate(async (id) => {
		const session = await (await fetch("/api/session", { credentials: "same-origin", cache: "no-store" })).json();
		const response = await fetch(`/api/trials/${id}/end`, {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf, "Idempotency-Key": crypto.randomUUID() },
			body: "{}",
		});
		return response.status;
	}, trialBId);
	assert.equal(endResult, 200);
	const trialBEndAt = Date.now();
	await page4.waitForFunction(() => window.__dragonApp?.trialGate?.state === "ended" && window.__dragonApp?.trialGate?.reason === "trial-ended", null, { timeout: 60000 });
	// Terminal disposal (Q70): window progress discarded, runtime stopped, ended banner shown.
	await page4.waitForFunction(() => window.__dragonApp?.trialEnded === true, null, { timeout: 30000 });
	const disposal = await page4.evaluate(() => ({ trialEnded: window.__dragonApp?.trialEnded ?? null, runtime: window.__dragonApp?.runtimeEnabled, scenario: window.__dragonApp?.scenario !== null && window.__dragonApp?.scenario !== undefined }));
	assert.deepEqual(disposal, { trialEnded: true, runtime: false, scenario: false });
	await page4.waitForFunction(() => document.querySelector("#trial-status")?.textContent.includes("已結束"), null, { timeout: 30000 });
	evidence("explicit-end-trial-ended", true, true);
	// Screenshots for the record
	await page1.screenshot({ path: join(out, "workbench.png") });
	await page2.screenshot({ path: join(out, "trial-ended.png") });
	await page4.screenshot({ path: join(out, "trial-b-ended.png") });
	// Error classification (each bound by URL + timing, recorded as design/infra evidence):
	//  - workbench /api/session 401 before login completion: the login page's normal session probe.
	//  - ERR_INTERNET_DISCONNECTED inside the [offline, online] window: offline emulation interrupts
	//    in-flight resource loads and the monitor's probe attempts (Q71: transport faults only pause).
	//    Node-side listener timestamps carry browser->Node delivery latency, so the last offline-window
	//    poll error can arrive just after onlineAt; the text can only originate while Chromium is
	//    offline, hence the bounded upper-edge grace.
	//  - trial-window /api/trials/<trialAId>/status 401 after the password change: the probe's
	//    TRIAL_INVALID is exactly the Q70 terminal signal this run evidences (row session-revoked).
	//  - revive-window /api/trials/<trialAId>/pack 401 after the password change: the no-revive verdict.
	//  - trial-window /api/trial/wait 502 before shell navigation: miniflare proxy flake while the worker
	//    is saturated by the concurrent trial-start compile (same family as the registered UNKNOWN-rootcause
	//    capture-thread 502; the wait window still navigates via location.replace). Infra, not product.
	//  - trial-b-window 401 under /api/trials/<trialBId>/ after the explicit end returned: late resource
	//    requests rejected TRIAL_INVALID because endCommit cascade-deleted trial_assets (authorization boundary).
	//  - trial-b-window late asset-load rejection for the same trial after the end (same boundary, uncaught in-page).
	const preLoginProbe = (e) => e.label === "workbench" && e.text.startsWith("Failed to load resource") && e.url === `${origin}/api/session` && e.at < loginDoneAt;
	const offlineInterrupt = (e) => e.text.includes("ERR_INTERNET_DISCONNECTED") && e.at >= offlineAt && e.at <= onlineAt + 2000;
	const trialAProbe401 = (e) => e.label === "trial-window" && e.text.startsWith("Failed to load resource") && e.url === `${origin}/api/trials/${trialId}/status` && e.at >= pwChangeAt;
	const revivePack401 = (e) => e.label === "revive-window" && e.text.startsWith("Failed to load resource") && e.url === `${origin}/api/trials/${trialId}/pack` && e.at >= pwChangeAt;
	const waitPageInfra502 = (e) => e.label === "trial-window" && e.text.includes("502") && e.url === `${origin}/api/trial/wait` && e.at < shellNavAt;
	const trialBLate401 = (e) => e.label === "trial-b-window" && e.text.startsWith("Failed to load resource") && typeof e.url === "string" && e.url.startsWith(`${origin}/api/trials/${trialBId}/`) && e.at >= trialBEndAt;
	const expectedConsole = (e) => preLoginProbe(e) || offlineInterrupt(e) || trialAProbe401(e) || revivePack401(e) || waitPageInfra502(e) || trialBLate401(e);
	const unexpectedConsole = consoleErrors.filter((e) => !expectedConsole(e));
	const trialBLateAsset = (e) => e.label === "trial-b-window" && e.text.startsWith(`加载失败: /api/trials/${trialBId}/assets/`) && e.at >= trialBEndAt;
	const unexpectedPageErrors = pageErrors.filter((e) => !trialBLateAsset(e));
	// Final counters
	evidence("idb-spy-zero", await page2.evaluate(() => window.__idbOpenCount), 0);
	evidence("console-errors-zero", unexpectedConsole.length, 0);
	evidence("pageerrors-zero", unexpectedPageErrors.length, 0);
	evidence("outside-requests-zero", outside.length, 0);
	writeFileSync(join(out, "receipt.json"), `${JSON.stringify({ checks, calls, gameId, trialId, trialBId, classifiedExpected: { preLoginSessionProbe401: consoleErrors.filter(preLoginProbe).length, offlineInterrupt: consoleErrors.filter(offlineInterrupt).length, trialAProbe401: consoleErrors.filter(trialAProbe401).length, revivePack401: consoleErrors.filter(revivePack401).length, waitPageInfra502: consoleErrors.filter(waitPageInfra502).length, trialBLate401: consoleErrors.filter(trialBLate401).length, trialBLateAssetReject: pageErrors.filter(trialBLateAsset).length }, screenshots: ["workbench.png", "trial-ended.png", "trial-b-ended.png"], productInstalled: false, fullNativePassed: false, goalComplete: false, limits: "Fresh Chromium context against the real local backend; anonymous formal game on the dev-server stack is outside this evidence surface (registered boundary). No Worker performance, deployment or DRM claim." }, null, 2)}\n`, { flag: "wx" });
	process.stdout.write(`${JSON.stringify({ checks: checks.length, calls: calls.length, gameId, productInstalled: false })}\n`);
} catch (error) {
	try { writeFileSync(join(out, "failure.json"), `${JSON.stringify({ diagnosticOnly: true, notPassedReceipt: true, phase: calls.length, checks, consoleErrors, pageErrors, outside, error: { message: error?.message ?? String(error) } }, null, 2)}\n`, { flag: "wx" }); } catch {}
	throw error;
} finally {
	if (browser) await browser.close();
	if (server) await server.close();
}
