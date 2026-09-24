// P87: KI 1B17-equivalent player-faction pointer binding (CFD = slot*0x40).
// Root cause of the live-game rAF death reported as:
//   RangeError: Web engineering Uncovered native type1
//   nativePlayerFactionPointer at 3549/358C
// thrown from own() via readPlayerFactionPointer on a live scenario that
// never had the field bound (createNewGameScenario deletes it; nothing
// bound it afterwards). Fresh scenarios and pre-fix snapshots heal through
// bindNativePlayerFactionPointer at loadState after initPlayer resolves CFF.
// Style: plain asserts + node:test, exit code only.
import assert from "node:assert/strict";
import test from "node:test";
import { bindNativePlayerFactionPointer } from "../web/src/game/nativefactions.js";
import { beginScenarioWarEvent } from "../web/src/game/navigation/scenariowarconsumer.js";

function records(count) {
  return Array.from({ length: count }, (_, idx) => ({
    idx,
    attr: 0x80,
    monarch_idx: idx,
    advisor_idx: null,
    target_faction: null,
  }));
}

function tableScenario({ player = 0, declared = 3, pointer = "absent" } = {}) {
  const table = records(22);
  const factions = table.slice(0, declared);
  const sc = {
    player_faction: player,
    nativeFactionSlots: { version: 1, records: table },
    factions,
  };
  if (pointer !== "absent") sc.nativePlayerFactionPointer = pointer;
  return sc;
}

function warScenario({ actor = 0, defender = 1 } = {}) {
  // Minimal live shape for 320C/3526 gates: no pointer bound (pre-fix save).
  const table = records(22);
  const rows = Array.from({ length: 24 }, () => Array(24).fill(0xff));
  rows[actor][defender] = 0x94; // peaceful both ways
  rows[defender][actor] = 0x94;
  const generals = Array.from({ length: 0x80 }, (_, idx) => ({
    idx,
    name: `將${idx}`,
    talk_idx: idx % 8,
  }));
  return {
    player_faction: 0,
    nativeFactionSlots: { version: 1, records: table },
    nativeDiplomacyMatrix: { version: 1, rows },
    factions: table.slice(0, 3),
    generals,
  };
}

test("binder unit: slot pointer, unselected passthrough, mismatch fail-closed", () => {
  const zero = tableScenario({ player: 0 });
  assert.equal(bindNativePlayerFactionPointer(zero, "t"), true);
  assert.equal(zero.nativePlayerFactionPointer, 0);

  const second = tableScenario({ player: 2 });
  assert.equal(bindNativePlayerFactionPointer(second, "t"), true);
  assert.equal(second.nativePlayerFactionPointer, 0x80);

  const unselected = tableScenario({ player: null });
  assert.equal(bindNativePlayerFactionPointer(unselected, "t"), false);
  assert.ok(!Object.hasOwn(unselected, "nativePlayerFactionPointer"));

  const corrupt = tableScenario({ player: 99 });
  assert.throws(
    () => bindNativePlayerFactionPointer(corrupt, "t"),
    /native player faction slot/,
  );

  const plain = { player_faction: 0, factions: [{ idx: 0 }] };
  assert.equal(bindNativePlayerFactionPointer(plain, "t"), false);
});

test("user crash repro: 3549 read throws before bind, routes after bind", () => {
  const sc = warScenario({ actor: 0, defender: 1 });
  const event = { type: 1, arg0: 0, arg1: 1 };
  // Exact live failure: player aggressor, peaceful, pointer never bound.
  assert.throws(
    () => beginScenarioWarEvent(sc, event),
    /nativePlayerFactionPointer at 3549\/358C/,
  );
  // loadState-equivalent heal: bind, then the same event routes normally.
  assert.equal(bindNativePlayerFactionPointer(sc, "loadState/initPlayer"), true);
  const routed = beginScenarioWarEvent(sc, event);
  assert.equal(routed.phase, "aggressor-message");
  assert.equal(routed.selector, 0x1a0);
});

test("defender path: NPC aggressor vs player defender reports", () => {
  const sc = warScenario({ actor: 1, defender: 0 });
  assert.equal(bindNativePlayerFactionPointer(sc, "loadState/initPlayer"), true);
  const routed = beginScenarioWarEvent(sc, { type: 1, arg0: 1, arg1: 0 });
  assert.equal(routed.phase, "defender-report");
  assert.equal(routed.talkIndex, 63);
});

test("pre-fix snapshot shape heals through the same binder", () => {
  const live = warScenario({ actor: 0, defender: 1 });
  bindNativePlayerFactionPointer(live, "loadState/initPlayer");
  // structuredClone round-trip like save/restore carries the bound value.
  const restored = structuredClone(live);
  delete restored.nativePlayerFactionPointer;
  assert.equal(bindNativePlayerFactionPointer(restored, "restore"), true);
  assert.equal(restored.nativePlayerFactionPointer, 0);
  const routed = beginScenarioWarEvent(restored, { type: 1, arg0: 0, arg1: 1 });
  assert.equal(routed.phase, "aggressor-message");
});

console.log("player faction pointer binding: binder + 3549/358C routing green");
