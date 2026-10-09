// Opt-in real engines, all state in memory; no App or genuine auth installation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createTrialConnectionGate } from "../web/src/editor/trialconnection.js";
import {
	TrialStrategicClock,
	createTrialBattleFrames,
} from "../web/src/editor/trialruleboundaries.js";
import { Clock } from "../web/src/game/clock.js";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { BattleScript } from "../web/src/game/battlescript.js";
import { createOriginalBattleStartupStepper } from "../web/src/game/battle/originalstartup.js";
let idbAccess = 0;
Object.defineProperty(globalThis, "indexedDB", {
	configurable: true,
	get() {
		idbAccess++;
		throw new Error("forbidden formal storage");
	},
});
globalThis.Image = class {
	set src(_value) {
		throw new Error("no image load permitted");
	}
};
const { BattleView } = await import("../web/src/render/battleview.js");
const binding = Object.freeze({
	trialId: "trial",
	snapshotId: "snapshot",
	ownerId: "owner",
	sessionId: "session",
	authEpoch: "epoch",
	gameId: "game",
	draftRevision: "999999999999999999999999",
	snapshotDigest: "a".repeat(64),
	chapterId: "chapter",
	manifestDigest: "b".repeat(64),
});
let checks = 0,
	negativeControls = 0;
function equal(a, b, label) {
	assert.deepEqual(a, b, label);
	checks++;
}
function confirm(gate) {
	gate.receive(gate.beginProbe(), { kind: "valid", binding });
}
function gateRunning() {
	const gate = createTrialConnectionGate(binding);
	confirm(gate);
	return gate;
}
function clockState(c) {
	return [
		c.serialize(),
		c.sub,
		c.hour,
		c.strategicTickSerial,
		c._pendingDayAdvance,
		c._pendingStrategicAdvance,
	];
}
{
	const g = createTrialConnectionGate(binding),
		c = new TrialStrategicClock({
			gate: g,
			startYear: 264,
			startMonth: 12,
			startDay: 31,
		});
	equal(g.rulePermit, null);
	c._acc = 17;
	equal(c.advanceFrame(100000), false);
	equal(c._acc, 0);
	equal(c.strategicTickSerial, 0);
	confirm(g);
	const permit = g.rulePermit;
	assert.ok(permit);
	checks++;
	equal(
		c.advanceFrame(100000),
		false,
		"first confirmed frame discards unknown elapsed",
	);
	const base = new Clock({ startYear: 264, startMonth: 12, startDay: 31 });
	c.advanceFrame(20);
	base.advanceFrame(20);
	equal(clockState(c), clockState(base));
	confirm(g);
	equal(
		g.rulePermit,
		permit,
		"periodic matching confirmation preserves permission generation",
	);
	c.hold = true;
	g.pause("offline");
	confirm(g);
	equal(c.hold, true);
	equal(c.nonTrialHold, true);
	c.advanceFrame(100000);
	equal(c.hold, true);
	c.hold = false;
	equal(c.hold, false);
	c.advanceFrame(20);
	base.advanceFrame(20);
	equal(clockState(c), clockState(base));
	g.pause("offline");
	c.hold = false;
	equal(c.hold, true, "foreign release cannot clear network hold");
	const before = clockState(c);
	c._tick();
	equal(clockState(c), before);
	confirm(g);
	equal(
		c.hold,
		true,
		"new generation remains blocked until elapsed is acknowledged",
	);
	equal(c.advance(100000), false);
	equal(c.hold, false);
	c.advance(20);
	base.advance(20);
	equal(clockState(c), clockState(base));
	g.end("auth-revoked");
	c.advanceFrame(100000);
	c._tick();
	equal(clockState(c), clockState(base));
	equal(g.rulePermit, null);
}
{
	const g = gateRunning();
	let count = 0;
	const c = new TrialStrategicClock({
		gate: g,
		startYear: 264,
		startMonth: 1,
		onStrategicTick() {
			count++;
			g.pause("offline");
		},
		onSyncHold() {
			c.hold = false;
		},
	});
	c.strategicSpeed = 4;
	c.advanceFrame(100000);
	equal(
		count,
		1,
		"gate failure stops inherited catch-up after committed prefix",
	);
	equal(c.strategicTickSerial, 1);
	equal(c._pendingStrategicAdvance, true);
	equal(c._acc, 0);
	confirm(g);
	c.advanceFrame(100000);
	equal(count, 1);
	c.advanceFrame(c.currentStep);
	equal(
		count,
		1,
		"pending calendar advances without replaying committed native pump",
	);
	equal(c.sub, 1);
	equal(c._pendingStrategicAdvance, false);
	c.onStrategicTick = () => {
		count++;
	};
	c.advanceFrame(c.currentStep);
	equal(count, 2);
}
{
	const g = gateRunning();
	let ticks = 0;
	const c = new TrialStrategicClock({
		gate: g,
		startYear: 190,
		startMonth: 1,
		onStrategicTick() {
			ticks++;
			if (ticks === 1) {
				g.pause("offline");
				confirm(g);
			}
		},
	});
	c.strategicSpeed = 4;
	c.advance(100000);
	equal(
		ticks,
		1,
		"pause/reconfirm inside one callback still changes permit and stops catch-up",
	);
	equal(c._acc, 0);
	equal(c._pendingStrategicAdvance, true);
	c.advance(100000);
	equal(ticks, 1);
	c.advance(c.currentStep);
	equal(ticks, 1);
	equal(c.sub, 1);
}
{
	const g = gateRunning();
	let month = 0;
	const c = new TrialStrategicClock({
		gate: g,
		startYear: 264,
		startMonth: 12,
		startDay: 31,
		onDay() {
			g.pause("offline");
		},
		onMonthEnd() {
			month++;
		},
	});
	c.sub = 8;
	c.hour = 23;
	c.advanceFrame(20);
	equal(month, 0);
	equal(c._pendingDayAdvance, true);
	equal([c.day, c.month, c.year, c.hour], [31, 12, 264, 0]);
	confirm(g);
	c.advanceFrame(100000);
	equal(month, 0);
	c.advanceFrame(20);
	equal(month, 1);
	equal([c.day, c.month, c.year, c.hour], [1, 1, 265, 1]);
}
function battle() {
	const session = new OriginalBattleSession({
		rngClock: { ch: 0x12, cl: 0x34, dh: 0x56 },
		registers: { side0Active: 1, side1Active: 1 },
	});
	const handle = {
		over: null,
		logicAccumulator: 0,
		session,
		sideMap: { 0: "atk", 1: "def" },
		playerSide: "atk",
		originalFormation: null,
		originalPathBuilder: null,
		originalLastEvents: [],
		units: [],
		dialogues: [],
		nextDialogueSequence: 0,
		kind: "field",
	};
	const vm = new BattleScript([(5 << 8) | 9, (0 << 8) | 10, 0], {
		nextRandomByte: () => session.rng.nextByte(),
	});
	const view = {
		battle: handle,
		battleScriptVm: vm,
		battleStartup: null,
		firstTacticalFramePending: true,
		scriptAccumulator: 0,
		app: { tacticalSpeed: 4 },
		composeBattlefield() {},
		commitNativeDisplay() {},
		updateBattleFrames: BattleView.prototype.updateBattleFrames,
	};
	session.enqueue({
		type: "tactical-command",
		frame: 0,
		side: 0,
		groups: [0],
		commandNumber: 1,
	});
	return { session, handle, vm, view };
}
function battleState(b) {
	return [
		b.session.snapshot(),
		b.vm.pc,
		b.vm.R,
		b.vm.wait,
		b.handle.logicAccumulator,
		b.handle.over,
	];
}
{
	const g = createTrialConnectionGate(binding),
		a = battle(),
		twin = battle();
	let held = false;
	const boundary = createTrialBattleFrames(g, a.view, { isHeld: () => held });
	const initial = battleState(a);
	boundary.update(1000);
	equal(battleState(a), initial);
	equal(
		a.session.queue.snapshot().length,
		1,
		"paused real frame does not consume queued input",
	);
	equal(a.session.rng.calls, 0);
	confirm(g);
	boundary.update(1000);
	equal(battleState(a), initial);
	boundary.update(0);
	twin.view.updateBattleFrames(0);
	equal(battleState(a), battleState(twin));
	equal(a.session.frame, 1);
	equal(
		a.session.rng.calls,
		1,
		"actual op9 consumes canonical RNG only on allowed frame",
	);
	equal(a.session.queue.snapshot().length, 0);
	const running = battleState(a);
	a.view.scriptAccumulator = 32;
	g.pause("offline");
	confirm(g);
	boundary.update(1000);
	equal(a.view.scriptAccumulator, 0);
	equal(
		battleState(a),
		running,
		"unobserved offline interval still discards elapsed via permit identity",
	);
	boundary.update(1 / 30);
	twin.view.updateBattleFrames(1 / 30);
	equal(battleState(a), battleState(twin));
	held = true;
	boundary.update(1000);
	equal(battleState(a), battleState(twin));
	held = false;
	boundary.update(1000);
	equal(battleState(a), battleState(twin));
	boundary.update(1 / 30);
	twin.view.updateBattleFrames(1 / 30);
	equal(battleState(a), battleState(twin));
	g.end("auth-invalid");
	boundary.update(1000);
	equal(battleState(a), battleState(twin));
	equal(a.view.scriptAccumulator, 0);
}
{
	const g = gateRunning(),
		a = battle();
	const original = a.vm.step.bind(a.vm);
	a.vm.step = () => {
		const result = original();
		g.pause("offline");
		return result;
	};
	const boundary = createTrialBattleFrames(g, a.view);
	boundary.update(0);
	equal(
		a.session.frame,
		1,
		"synchronous complete input/A426/A065 preserves committed frame despite nested fixture pause",
	);
	equal(a.session.rng.calls, 1);
	const before = battleState(a);
	boundary.update(1000);
	equal(battleState(a), before);
}
{
	const g = gateRunning(),
		a = battle();
	let change = true;
	const boundary = createTrialBattleFrames(g, a.view, {
		isHeld() {
			if (change) {
				change = false;
				g.pause("offline");
				confirm(g);
			}
			return false;
		},
	});
	boundary.update(1000);
	equal(
		a.session.frame,
		0,
		"read permit AFTER owner callback changes generation",
	);
	boundary.update(0);
	equal(a.session.frame, 1);
}
{
	const g = gateRunning(),
		a = battle(),
		twin = battle();
	function startup(b) {
		b.session.registers.mode = 0;
		b.view.battleStartup = createOriginalBattleStartupStepper(b.handle, {
			tickFrame: () => b.session.tick(),
		});
		b.view.focusCameraOnPlayer = () => {};
		b.view.startBattleScript = () => {};
	}
	startup(a);
	startup(twin);
	const boundary = createTrialBattleFrames(g, a.view);
	boundary.update(0);
	twin.view.updateBattleFrames(0);
	for (let n = 1; n < 10; n++) {
		boundary.update(1 / 30);
		twin.view.updateBattleFrames(1 / 30);
	}
	equal(a.session.frame, 10);
	equal(a.session.rng.calls, 0);
	equal(battleState(a), battleState(twin));
	const before = battleState(a);
	g.pause("offline");
	boundary.update(1000);
	equal(battleState(a), before);
	confirm(g);
	boundary.update(1000);
	equal(battleState(a), before);
	for (let n = 10; n < 50; n++) {
		boundary.update(1 / 30);
		twin.view.updateBattleFrames(1 / 30);
	}
	equal(a.session.frame, 50);
	equal(battleState(a), battleState(twin));
	boundary.update(1 / 30);
	twin.view.updateBattleFrames(1 / 30);
	equal(a.session.registers.startupComplete, true);
	equal(a.session.frame, 51);
	equal(a.session.rng.calls, 1);
	equal(battleState(a), battleState(twin));
}
{
	const g = gateRunning(),
		a = battle();
	const boundary = createTrialBattleFrames(g, a.view, {
		isHeld: () => "false",
	});
	assert.throws(() => boundary.update(0), /hold must be boolean/);
	negativeControls++;
	equal(a.session.frame, 0);
	const failure = new Error("frame failure"),
		b = createTrialBattleFrames(g, {
			scriptAccumulator: 0,
			updateBattleFrames() {
				throw failure;
			},
		});
	assert.throws(
		() => b.update(0),
		(e) => e === failure,
	);
	negativeControls++;
	let reentrant;
	reentrant = createTrialBattleFrames(g, {
		scriptAccumulator: 0,
		updateBattleFrames() {
			reentrant.update(0);
		},
	});
	assert.throws(() => reentrant.update(0), /reentrant/);
	negativeControls++;
	assert.throws(
		() =>
			new TrialStrategicClock({ gate: null, startYear: 190, startMonth: 1 }),
		TypeError,
	);
	negativeControls++;
	const prefixBattle = battle(),
		prefixError = new Error("after actual VM prefix");
	const vmStep = prefixBattle.vm.step.bind(prefixBattle.vm);
	prefixBattle.vm.step = () => {
		vmStep();
		throw prefixError;
	};
	const prefixBoundary = createTrialBattleFrames(g, prefixBattle.view);
	assert.throws(
		() => prefixBoundary.update(0),
		(error) => error === prefixError,
	);
	negativeControls++;
	equal(prefixBattle.session.rng.calls, 1);
	equal(prefixBattle.session.queue.snapshot().length, 0);
	equal(prefixBattle.session.frame, 0);
	equal(g.state, "running", "rule error is not fabricated auth invalidity");
	g.pause("offline");
	const committed = battleState(prefixBattle);
	prefixBoundary.update(1000);
	equal(battleState(prefixBattle), committed);
	confirm(g);
	assert.throws(() => createTrialBattleFrames(g, {}), TypeError);
	negativeControls++;
	assert.throws(
		() =>
			new TrialStrategicClock({
				gate: { canAdvanceRules: true, rulePermit: null },
				startYear: 190,
				startMonth: 1,
			}),
		TypeError,
	);
	negativeControls++;
	let holdReentrant;
	holdReentrant = createTrialBattleFrames(g, a.view, {
		isHeld() {
			holdReentrant.update(0);
			return false;
		},
	});
	assert.throws(() => holdReentrant.update(0), /reentrant/);
	negativeControls++;
	equal(a.session.frame, 0);
}
equal(idbAccess, 0);
delete globalThis.indexedDB;
delete globalThis.Image;
const sourcePaths = [
	"tools/verify_editor_trial_rule_boundaries.mjs",
	"web/src/editor/trialruleboundaries.js",
	"web/src/editor/trialconnection.js",
	"web/src/game/clock.js",
	"web/src/game/tacticalclock.js",
	"web/src/render/battleview.js",
	"web/src/game/tacticalbattle.js",
	"web/src/game/battlescript.js",
	"web/src/game/battle/originalsession.js",
	"web/src/game/battle/originalrng.js",
	"web/src/game/battle/originalstartup.js",
];
const hashes = Object.fromEntries(
	sourcePaths.map((p) => [
		p,
		createHash("sha256").update(readFileSync(p)).digest("hex"),
	]),
);
process.stdout.write(
	`${JSON.stringify({ result: "PASS-OPT-IN-REAL-RULE-BOUNDARIES-NOT-APP-AUTH", checks, negativeControls, idbAccess, hashes, limits: "Real inherited Clock and actual BattleView budget/input/A426/A065/Session/VM/RNG over isolated transient memory fixture, NOT initialized full battle/App/browser or original CPU certification. No default installer/transport/private auth/command input barrier/App discard. Frame failure preserves prefix; no rollback. nonTrialHold must be captured by future App owners." })}\n`,
);
