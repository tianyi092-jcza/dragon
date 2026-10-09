// Opt-in Q71 wall-clock boundaries. No App install, transport, auth or storage.
import { Clock } from "../game/clock.js";
const clocks = new WeakMap();
function checkGate(gate) {
	if (
		!gate ||
		typeof gate.canAdvanceRules !== "boolean" ||
		!(gate.rulePermit === null || typeof gate.rulePermit === "object") ||
		gate.canAdvanceRules !== (gate.rulePermit !== null)
	) {
		throw new TypeError(
			"trial rule boundary requires an injected connection gate",
		);
	}
}
export class TrialStrategicClock extends Clock {
	constructor({ gate, ...options }) {
		checkGate(gate);
		super(options); // Base constructor invokes the hold setter before gate setup.
		const state = clocks.get(this);
		state.gate = gate;
		state.permit = gate.rulePermit;
	}
	set hold(value) {
		const state = clocks.get(this);
		if (state) {
			state.hold = value;
		} else {
			clocks.set(this, { hold: value, gate: null, permit: null });
		}
	}
	get hold() {
		const state = clocks.get(this);
		return (
			state.hold ||
			Boolean(
				state.gate &&
					(!state.gate.canAdvanceRules ||
						state.gate.rulePermit !== state.permit),
			)
		);
	}
	// Owners must capture this, not the effective network/menu union, for restore.
	get nonTrialHold() {
		return clocks.get(this).hold;
	}
	_acceptElapsed() {
		const state = clocks.get(this),
			permit = state.gate.rulePermit;
		if (!state.gate.canAdvanceRules || permit !== state.permit) {
			state.permit = permit;
			this._acc = 0;
			return false;
		}
		return true;
	}
	advanceFrame(dt) {
		return this._acceptElapsed() ? super.advanceFrame(dt) : false;
	}
	advance(dt) {
		return this._acceptElapsed() ? super.advance(dt) : false;
	}
	_tick() {
		// Direct debug entry is also denied; internal calendar pieces are not APIs.
		if (this.hold || this._legacyPaused) {
			this._acc = 0;
			return false;
		}
		return super._tick();
	}
}
export function createTrialBattleFrames(
	gate,
	view,
	{ isHeld = () => false } = {},
) {
	checkGate(gate);
	if (
		!view ||
		typeof view.updateBattleFrames !== "function" ||
		typeof isHeld !== "function"
	) {
		throw new TypeError("trial tactical boundary requires a frame driver");
	}
	let permit = gate.rulePermit,
		blocked = !gate.canAdvanceRules,
		busy = false;
	return Object.freeze({
		update(dt) {
			if (busy) {
				throw new Error("reentrant trial tactical frame");
			}
			busy = true;
			try {
				const held = isHeld();
				if (typeof held !== "boolean") {
					throw new TypeError("hold must be boolean");
				}
				// The owner's hold callback may detect failure/change generation.
				const current = gate.rulePermit;
				if (!gate.canAdvanceRules || held || current !== permit || blocked) {
					permit = current;
					blocked = !gate.canAdvanceRules || held;
					view.scriptAccumulator = 0; // Budget only; retain rule prefix.
					return false;
				}
				return view.updateBattleFrames(dt);
			} finally {
				busy = false;
			}
		},
	});
}
