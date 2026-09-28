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
import {
  bindNativePlayerFactionPointer,
  initializeFreshPlayerAdvisor,
} from "../web/src/game/nativefactions.js";
import { performScenarioGeneralRatingRefresh } from "../web/src/game/navigation/scenariogeneralrating.js";
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

function advisorScenario(count = 3, attr = 0x81) {
  const sc = tableScenario({ player: 2 });
  sc.factions.forEach((f) => { f.nativeGeneralCount = 9; });
  sc.factions[2].advisor_idx = 4;
  sc.factions[2].nativeGeneralCount = count;
  sc.player_advisor = { custom: false, general_idx: 4, name: "軍師" };
  sc.generals = Array.from({ length: 128 }, (_, idx) => ({
    idx, attr: idx === 4 ? attr : 0x80, active: true,
    ability: { siege: 1, field: 2, naval: 3, force: 4, lead: 5 },
    battle_rating: 231, faction: 2, status: 3, budget: 7,
    is_player: idx === 4,
  }));
  return sc;
}

test("1B05/1B12 fresh NPC selection: byte DEC, exact writes, no inactive shortcut", () => {
  for (let count = 0; count < 256; count++) {
    for (const attr of [0, 0x7f, 0x80, 0xff]) {
      const sc = advisorScenario(count, attr);
      const expected = structuredClone(sc);
      expected.factions[2].nativeGeneralCount = (count + 255) & 255;
      expected.generals[4].attr = 0;
      expected.generals[4].active = false;
      assert.equal(initializeFreshPlayerAdvisor(sc), true);
      assert.deepEqual(sc, expected);
      assert.equal(sc.factions[2], sc.nativeFactionSlots.records[2]);
    }
  }
});

test("fresh removal precedes 55A6; Web custom/no-NPC avatars preserve F18 and G127", () => {
  const sc = advisorScenario();
  initializeFreshPlayerAdvisor(sc);
  performScenarioGeneralRatingRefresh(sc);
  assert.equal(sc.generals[4].battle_rating, 231, "inactive advisor not refreshed");
  assert.equal(sc.generals[5].battle_rating, 24, "other active NPCs still refresh");
  assert.equal(sc.generals[127].battle_rating, 231);
  for (const avatar of [null, { custom: true, general_idx: null, name: "自定" }]) {
    const state = advisorScenario();
    state.player_advisor = avatar;
    const before = structuredClone(state);
    assert.equal(initializeFreshPlayerAdvisor(state), false);
    assert.deepEqual(state, before);
  }
});

test("fresh advisor rejects absent/invalid count and identity; late write failure keeps DEC", () => {
  for (const value of [undefined, null, -1, 256, 1.5, NaN]) {
    const sc = advisorScenario();
    sc.factions[2].nativeGeneralCount = value;
    const before = structuredClone(sc);
    assert.throws(() => initializeFreshPlayerAdvisor(sc), /F18/);
    assert.deepEqual(sc, before);
  }
  const mismatch = advisorScenario();
  mismatch.player_advisor.general_idx = 5;
  assert.throws(() => initializeFreshPlayerAdvisor(mismatch), /F02/);
  assert.equal(mismatch.factions[2].nativeGeneralCount, 3);
  const late = advisorScenario();
  delete late.generals[4];
  assert.throws(() => initializeFreshPlayerAdvisor(late), /1B12/);
  assert.equal(late.factions[2].nativeGeneralCount, 2);
});

console.log("player faction pointer + fresh advisor selection: bounded contracts green");
