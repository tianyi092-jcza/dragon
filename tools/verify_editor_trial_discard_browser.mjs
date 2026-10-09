// Actual local App exit; tactical fixture is not a full battle/auth certificate.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const round = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round);
mkdirSync(out);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function parse(bytes) {
	try {
		return JSON.parse(bytes.toString());
	} catch (cause) {
		throw new TypeError("invalid fixed fixture manifest", { cause });
	}
}
const prefix = `web/content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`,
	manifest = parse(readFileSync(`${prefix}manifest.json`));
const resources = Object.fromEntries(
	["manifest.json", ...manifest.assets.map((a) => a.path)].map((p) => [
		p,
		sha(readFileSync(prefix + p)),
	]),
);
const server = await startEditorServer(
		0,
		mkdtempSync(join(tmpdir(), "trial-discard-")),
	),
	origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE ||
		"C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
let browser, releaseRoute;
const errors = [],
	forbidden = [],
	requests = [],
	evidence = [];
async function call(path, body) {
	const r = await fetch(origin + path, {
		method: body ? "POST" : "GET",
		headers: { "content-type": "application/json", connection: "close" },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	assert.equal(r.status, 200, path);
	return r.json();
}
try {
	await call("/api/copy", {
		gameId: "trial-discard",
		ownerId: "local",
		kind: "full",
	});
	const draft = await call("/api/draft?game=trial-discard");
	await call("/api/compile", { gameId: draft.gameId, expectedRevision: "1" });
	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1000, height: 700 },
	});
	await context.addInitScript(() => {
		window.__idb = 0;
		Object.defineProperty(window, "indexedDB", {
			get() {
				window.__idb++;
				throw new Error("forbidden storage");
			},
		});
	});
	await context.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		requests.push(url.pathname);
		if (url.origin !== origin || /save\.dat/i.test(url.pathname)) {
			forbidden.push(url.href);
			await route.abort();
			return;
		}
		await route.continue();
	});
	for (const mode of ["pending", "active"]) {
		const page = await context.newPage();
		page.on("pageerror", (e) => errors.push(e.message));
		page.on("console", (m) => {
			if (m.type() === "error") {
				errors.push(m.text());
			}
		});
		await page.goto(
			`${origin}/trial-app?${new URLSearchParams({ game: draft.gameId, revision: "1", chapter: draft.chapterOrder[0] })}`,
		);
		await page.waitForSelector("#start-trial");
		await page.click("#start-trial");
		await page.waitForFunction(
			() => window.__app?.gameStarted && window.__app.runtimeEnabled,
		);
		await page.evaluate(() => {
			const a = window.__app;
			a.gamebar.settingsOpen = true;
			a.gamebar.syncClock();
		});
		if (mode === "pending") {
			const held = new Promise((resolve) => {
				releaseRoute = resolve;
			});
			await page.route("**/grf/battle_terrain_2.png*", async (route) => {
				await held;
				await route.fulfill({
					status: 200,
					contentType: "image/png",
					body: readFileSync("web/grf/battle_terrain_2.png"),
				});
			});
		}
		await page.evaluate(async (mode) => {
			const { OriginalBattleSession } = await import(
					"/src/game/battle/originalsession.js"
				),
				a = window.__app,
				v = a.battleView;
			const s = new OriginalBattleSession({
				rngClock: { ch: 0x12, cl: 0x34, dh: 0x56 },
				registers: { side0Active: 1, side1Active: 1 },
			});
			s.enqueue({
				type: "tactical-command",
				frame: 0,
				side: 0,
				groups: [0],
				commandNumber: 1,
			});
			window.__settled = 0;
			window.__tails = 0;
			window.__commits = 0;
			s.settleExit = () => {
				window.__settled++;
				throw new Error("unexpected settle");
			};
			s.consumeInitialNativeCommit = () => {
				window.__commits++;
				throw new Error("late commit");
			};
			const h = {
				session: s,
				layout: 2,
				title: "內存退出測試",
				kind: "field",
				sideMap: { atk: 0, def: 1 },
			};
			window.__retained = {
				session: s,
				before: JSON.stringify(s.snapshot()),
				rng: a.originalRng,
				rngBefore: JSON.stringify(a.originalRng.snapshot()),
			};
			a._nativeTacticalQueue = [
				{
					scenario: a.scenario,
					request: {
						resumeTail() {
							window.__tails++;
						},
					},
				},
			];
			if (mode === "pending") {
				// Stub only pre-asset presentation; open, generation, catch and discard real.
				v.focusCameraOnPlayer = () => {};
				v.updateCursor = () => {};
				v.syncBattlePanel = () => {};
				window.__opening = v.open(h, () => window.__tails++);
			} else {
				v.battle = h;
				v.active = true;
				v.onFinish = () => window.__tails++;
				v.battleScriptVm = {};
				v.battleStartup = {};
				v.originalDisplayProcess = {
					endBattle() {
						throw new Error("scratch commit forbidden");
					},
				};
			}
		}, mode);
		if (mode === "pending") {
			await page.waitForFunction(() => window.__app.battleView.battle !== null);
		}
		await page.evaluate(() => window.__app.returnToTitle());
		releaseRoute?.();
		releaseRoute = null;
		const result = await page.evaluate(async () => {
			await window.__opening;
			const a = window.__app,
				v = a.battleView,
				r = window.__retained;
			v.finish();
			const frames = v.updateBattleFrames(100000);
			v.queuePanelInput({ type: "formation-select", index: 1 });
			let reopen = false,
				restart = false;
			try {
				await v.open({});
			} catch {
				reopen = true;
			}
			try {
				await a.beginNewGame({});
			} catch {
				restart = true;
			}
			return {
				ended: a.trialEnded,
				runtime: a.runtimeEnabled,
				scenario: a.scenario,
				clock: a.clock,
				rng: a.originalRng,
				activeRng: a.activeBattleRng,
				queue: a._nativeTacticalQueue.length,
				view: [
					v.active,
					v.runtimeEnabled,
					v.battle,
					v.onFinish,
					v.prevClockState,
					v.battleScriptVm,
					v.battleStartup,
					v.originalDisplayProcess,
					v.sceneCanvas,
					v.mapImg,
					v.unitImg,
					v.dialoguePresentation,
				],
				budget: [v.scriptAccumulator, v.firstTacticalFramePending, v._raf],
				hidden: ["#bcv", "#bctl", "#battle-bottom-bar"].map(
					(id) => document.querySelector(id).style.display,
				),
				sessionSame: JSON.stringify(r.session.snapshot()) === r.before,
				rngSame: JSON.stringify(r.rng.snapshot()) === r.rngBefore,
				settled: window.__settled,
				tails: window.__tails,
				commits: window.__commits,
				frames,
				reopen,
				restart,
				idb: window.__idb,
			};
		});
		assert.equal(result.ended, true);
		assert.equal(result.runtime, false);
		for (const key of ["scenario", "clock", "rng", "activeRng"]) {
			assert.equal(result[key], null);
		}
		assert.equal(result.queue, 0);
		assert.deepEqual(result.view, [false, false, ...Array(10).fill(null)]);
		assert.deepEqual(result.budget, [0, false, 0]);
		assert.deepEqual(result.hidden, ["none", "none", "none"]);
		for (const key of ["sessionSame", "rngSame", "reopen", "restart"]) {
			assert.equal(result[key], true, key);
		}
		for (const key of ["settled", "tails", "commits", "idb"]) {
			assert.equal(result[key], 0);
		}
		assert.equal(result.frames, false);
		evidence.push({ mode, result });
		await page.screenshot({ path: join(out, `${mode}.png`) });
		await page.close();
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(forbidden, []);
	for (const [p, h] of Object.entries(resources)) {
		assert.equal(sha(readFileSync(prefix + p)), h);
	}
	const paths = [
		"tools/verify_editor_trial_discard_browser.mjs",
		"tools/editor_server.mjs",
		"web/src/main.js",
		"web/src/render/battleview.js",
		"web/src/editor/trialpolicy.js",
		"web/src/editor/trialapp.js",
		"web/src/game/battle/originalsession.js",
	];
	const receipt = {
		result: "PASS-ACTUAL-LOCAL-APP-TRIAL-DISCARD-NOT-AUTH-COMBAT",
		sourceHashes: Object.fromEntries(
			paths.map((p) => [p, sha(readFileSync(p))]),
		),
		resources,
		evidence,
		errors,
		forbidden,
		requests,
		limits:
			"Two fresh App pages, pending and transient real Session fixture; presentation stubs only. No full combat/normal finish/real auth/network lifecycle/GC or external reference erase proof.",
	};
	writeFileSync(
		join(out, "receipt.json"),
		`${JSON.stringify(receipt, null, 2)}\n`,
		{ flag: "wx" },
	);
	process.stdout.write(
		`${JSON.stringify({ result: receipt.result, modes: evidence.map((e) => e.mode), errors, forbidden, idb: 0 })}\n`,
	);
} catch (error) {
	writeFileSync(
		join(out, "failure.json"),
		JSON.stringify(
			{ error: error.stack, errors, forbidden, requests },
			null,
			2,
		),
	);
	throw error;
} finally {
	releaseRoute?.();
	await browser?.close();
	server.closeAllConnections?.();
	await new Promise((resolve) => server.close(resolve));
}
