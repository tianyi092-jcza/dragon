// Trial-owned reference disposal: actual view methods and Session, no real I/O.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
let idb = 0,
	callbacks = 0,
	commits = 0,
	cleanup = 0;
Object.defineProperty(globalThis, "indexedDB", {
	get() {
		idb++;
		throw new Error("forbidden storage");
	},
});
const elements = new Map();
globalThis.document = {
	querySelector(id) {
		if (!elements.has(id)) {
			elements.set(id, {
				style: { display: "block" },
				dataset: { kind: "decoded" },
				src: "old-portrait",
				removeAttribute() {
					this.src = "";
				},
			});
		}
		return elements.get(id);
	},
};
const images = [];
globalThis.Image = class {
	set src(url) {
		this.url = url;
		images.push(this);
	}
};
const requests = [];
globalThis.fetch = (url) =>
	new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
const rafs = [];
globalThis.cancelAnimationFrame = (id) => rafs.push(id);
globalThis.removeEventListener = () => cleanup++;
const { BattleView } = await import("../web/src/render/battleview.js");
let checks = 0,
	negativeControls = 0;
function eq(a, b) {
	assert.deepEqual(a, b);
	checks++;
}
function make(layout = 0) {
	const session = new OriginalBattleSession({
		rngClock: { ch: 0x12, cl: 0x34, dh: 0x56 },
		registers: { side0Active: 1, side1Active: 1 },
	});
	session.enqueue({
		type: "tactical-command",
		frame: 0,
		side: 0,
		groups: [0],
		commandNumber: 1,
	});
	const handle = {
		session,
		layout,
		title: "fixture",
		sideMap: { atk: 0, def: 1 },
	};
	session.consumeInitialNativeCommit = () => {
		commits++;
		throw new Error("late commit");
	};
	const view = Object.assign(Object.create(BattleView.prototype), {
		app: {
			canPersist: false,
			trialIdentity: { snapshotId: "fixture" },
			clock: { hold: false, _legacyPaused: false, strategicSpeed: 2 },
			score: { beginBattle() {} },
		},
		cv: { style: { display: "none" } },
		_openGeneration: 0,
		_raf: 12,
		active: false,
		scriptAccumulator: 5,
		originalDisplayProcess: {
			endBattle() {
				throw new Error("must not commit scratch");
			},
		},
		sceneCanvas: {},
		terrainLayers: [{}],
		dialoguePresentation: {
			dispose() {
				cleanup++;
			},
		},
		focusCameraOnPlayer() {},
		updateCursor() {},
		syncBattlePanel() {},
	});
	return { view, handle, session };
}
async function release() {
	for (const image of images.splice(0)) {
		image.onload();
	}
	for (const r of requests.splice(0)) {
		r.resolve({
			ok: true,
			json: async () => ({}),
			arrayBuffer: async () => new ArrayBuffer(299520),
		});
	}
	await Promise.resolve();
}
{
	const { view, handle, session } = make(),
		before = JSON.stringify(session.snapshot());
	const pending = view.open(handle, () => callbacks++);
	eq(view.battle, handle);
	eq(view.app.clock.hold, true);
	eq(view.discardTrial(), true);
	const generation = view._openGeneration;
	eq(view.discardTrial(), false);
	eq(view._openGeneration, generation);
	for (const key of [
		"battle",
		"onFinish",
		"prevClockState",
		"battleScriptVm",
		"battleStartup",
		"originalDisplayProcess",
		"sceneCanvas",
		"mapImg",
		"unitImg",
		"dialoguePresentation",
	]) {
		eq(view[key], null);
	}
	eq(
		[
			view.active,
			view.runtimeEnabled,
			view.sceneReady,
			view.firstTacticalFramePending,
		],
		[false, false, false, false],
	);
	eq([view.scriptAccumulator, view._raf], [0, 0]);
	eq(view.terrainLayers, []);
	await release();
	await pending;
	eq(commits, 0);
	eq(callbacks, 0);
	eq(view.active, false);
	eq(view.mapImg, null);
	eq(JSON.stringify(session.snapshot()), before);
	eq(view.app.clock.hold, true);
	eq(view.updateBattleFrames(100000), false);
	view.finish();
	view.queuePanelInput({ type: "formation-select", index: 1 });
	eq(JSON.stringify(session.snapshot()), before);
	await assert.rejects(
		() => view.open(handle, () => callbacks++),
		/ended Trial/,
	);
	negativeControls++;
	for (const name of ["atk", "def"]) {
		eq(document.querySelector(`#bdialogue-${name}-face`).src, "");
	}
}
{
	const { view, handle, session } = make(1),
		before = JSON.stringify(session.snapshot());
	const pending = view.open(handle, () => callbacks++);
	view.discardTrial();
	for (const image of images.splice(0)) {
		image.onerror();
	}
	await pending;
	eq(JSON.stringify(session.snapshot()), before);
	eq(view.active, false);
	eq(commits, 0);
	eq(callbacks, 0);
}
{
	const { view, handle, session } = make(),
		before = JSON.stringify(session.snapshot());
	view.battle = handle;
	view.active = true;
	view.battleScriptVm = {};
	view.battleStartup = {};
	view.onFinish = () => callbacks++;
	eq(view.discardTrial(), true);
	view.finish();
	eq(callbacks, 0);
	eq(JSON.stringify(session.snapshot()), before);
	eq(view.battle, null);
}
for (const app of [
	{ canPersist: true, trialIdentity: {} },
	{ canPersist: false },
	{ canPersist: undefined, trialIdentity: {} },
]) {
	const { view, handle } = make();
	view.app = app;
	view.battle = handle;
	view.active = true;
	assert.throws(() => view.discardTrial(), /isolated Trial/);
	negativeControls++;
	eq(view.active, true);
	eq(view.battle, handle);
	eq(view._openGeneration, 0);
}
eq(idb, 0);
assert.ok(cleanup > 0);
checks++;
assert.ok(rafs.includes(12));
checks++;
const paths = [
	"tools/verify_editor_trial_discard.mjs",
	"web/src/render/battleview.js",
	"web/src/core/assets.js",
	"web/src/ui/battledialogue.js",
	"web/src/game/battle/originalsession.js",
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
process.stdout.write(
	`${JSON.stringify({ result: "PASS-TRIAL-BATTLE-DISCARD-NOT-AUTH", checks, negativeControls, idb, callbacks, commits, sourceHashes: Object.fromEntries(paths.map((p) => [p, sha(readFileSync(p))])), limits: "Transient real Session and actual view open/discard/finish guards; presentation-only stubs. No full combat/normal settlement/DOM browser/App/auth/GC proof; no external reference erase." })}\n`,
);
