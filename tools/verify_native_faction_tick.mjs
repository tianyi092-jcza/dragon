import assert from "node:assert/strict";
import test from "node:test";
import data from "../web/data.json" with { type: "json" };
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { tickFactionStrategicState } from "../web/src/game/ai.js";
import {
  assertNativeFactionSlots,
  initializeNativeFactionSlots,
  nativeFactionAt,
  rebindNativeFactionViews,
} from "../web/src/game/nativefactions.js";
import {
  initializeNativeDiplomacyMatrix,
  nativeDiplomacyAt,
} from "../web/src/game/nativediplomacy.js";
import {
  originalAddReserveExpense5673,
  originalReserveExpenseIncrement3E65,
} from "../web/src/game/navigation/originalfactiontick.js";
import { performScenarioFactionTick } from "../web/src/game/navigation/scenariofactiontick.js";

const json = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error("synthetic fixture JSON round-trip failed", {
      cause: error,
    });
  }
};
const faction = (changes = {}) => ({
  idx: 0,
  attr: 0x80,
  active: true,
  reserve_cav: 0,
  reserve_arc: 0,
  reserve_inf: 0,
  money: 1000,
  n_cities: 0,
  target_faction: null,
  diplomat_idx: null,
  monthly_reserve_upkeep: 0,
  ...changes,
});
const scenario = (changes = {}) => {
  const sc = { factions: [faction()], ...changes };
  attachSyntheticNativeFactionSource(sc);
  initializeNativeFactionSlots(sc);
  initializeNativeDiplomacyMatrix(sc);
  sc._factionTickCursor = 0;
  return sc;
};

test("all 20 compiled chapters retain 22 raw slots and declared records match their source", () => {
  assert.equal(data.scenarios.length, 20);
  let undeclaredNonzero = 0;
  for (const sc of data.scenarios) {
    assert.equal(sc.nativeFactionSlotRaw.length, 22);
    for (let slot = 0; slot < 22; slot++) {
      const encoded = sc.nativeFactionSlotRaw[slot];
      assert.match(encoded, /^[0-9a-f]{128}$/);
      if (slot < sc.factions.length)
        assert.equal(sc.factions[slot].raw, encoded);
      else {
        const bytes = Uint8Array.from({ length: 64 }, (_, index) =>
          Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16),
        );
        if (bytes.slice(4, 10).some((value) => value !== 0))
          undeclaredNonzero++;
      }
    }
  }
  assert.equal(undeclaredNonzero, 30);
});

test("fresh table aliases declared views, preserves undeclared slots, and JSON rebind rejects divergence", () => {
  const raw = new Uint8Array(64);
  raw[0] = 0x80;
  raw[4] = 0x34;
  raw[5] = 0x12;
  raw[0x14] = 7;
  raw[0x16] = 9;
  raw[0x17] = 0xff;
  raw[0x18] = 11;
  raw[0x19] = 0xff;
  raw[0x2a] = 0xff;
  const sc = { factions: [faction()] };
  attachSyntheticNativeFactionSource(sc, { 21: raw });
  initializeNativeFactionSlots(sc);
  assert.equal(sc.nativeFactionSlots.records.length, 22);
  assert.equal(nativeFactionAt(sc, 0, "test"), sc.factions[0]);
  assert.equal(nativeFactionAt(sc, 21, "test").reserve_cav, 0x1234);
  assert.deepEqual(
    [
      nativeFactionAt(sc, 21, "test").n_legions,
      nativeFactionAt(sc, 21, "test").strategic_city_primary,
      nativeFactionAt(sc, 21, "test").strategic_city_secondary,
      nativeFactionAt(sc, 21, "test").nativeGeneralCount,
    ],
    [7, 9, null, 11],
  );
  const cold = json(sc);
  assert.notEqual(cold.nativeFactionSlots.records[0], cold.factions[0]);
  rebindNativeFactionViews(cold);
  assert.equal(cold.nativeFactionSlots.records[0], cold.factions[0]);
  const bad = json(sc);
  bad.nativeFactionSlots.records[0].money++;
  assert.throws(() => rebindNativeFactionViews(bad), /Divergent/);
  const optionalDivergence = json(sc);
  optionalDivergence.nativeFactionSlots.records[0].n_legions++;
  assert.throws(
    () => rebindNativeFactionViews(optionalDivergence),
    /Divergent.*n_legions/,
  );
  const hole = json(sc);
  delete hole.nativeFactionSlots.records[21];
  assert.throws(() => assertNativeFactionSlots(hole), /slot 21/);
  assertNativeFactionSlots(sc);
});

test("3E65 carry sum and 5673 signed-high cap/wrap are exact 24-bit operations", () => {
  assert.equal(
    originalReserveExpenseIncrement3E65(0xffff, 0xffff, 0xffff),
    6143,
  );
  assert.equal(originalReserveExpenseIncrement3E65(31, 0, 0), 0);
  assert.equal(originalReserveExpenseIncrement3E65(32, 0, 0), 1);
  assert.equal(originalAddReserveExpense5673(0x09fe97, 1), 0x09fe98);
  assert.equal(originalAddReserveExpense5673(0x09fe97, 2), 0x09fe98);
  assert.equal(originalAddReserveExpense5673(0xfffff0, 3), 0xfffff3);
  assert.equal(originalAddReserveExpense5673(0xffffff, 1), 0);
});

test("3E14 active crisis writes precede maintenance; inactive slots still accrue and advance", () => {
  for (const [money, expectedAttr, target] of [
    [33 * 256, 0x80, 7],
    [32 * 256, 0x80, null],
    [16 * 256, 0xc0, null],
    [-1, 0xc0, null],
  ]) {
    const sc = scenario({
      factions: [
        faction({
          attr: 0xc0,
          money,
          n_cities: 1,
          target_faction: 7,
          reserve_cav: 32,
        }),
      ],
    });
    const result = performScenarioFactionTick(sc);
    assert.equal(sc.factions[0].attr, expectedAttr);
    assert.equal(sc.factions[0].target_faction, target);
    assert.equal(sc.factions[0].monthly_reserve_upkeep, 1);
    assert.deepEqual(result, { slot: 0, next: 1, increment: 1 });
  }
  const inactive = scenario({
    factions: [faction({ attr: 0, active: false, reserve_inf: 64 })],
  });
  performScenarioFactionTick(inactive);
  assert.equal(inactive.factions[0].attr, 0);
  assert.equal(inactive.factions[0].monthly_reserve_upkeep, 2);
  assert.equal(inactive._factionTickCursor, 1);
});

test("3E8E diplomat gates, budget subtraction and directional diplomacy preserve exact prefixes", () => {
  const sequence = (...values) => {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      nextByte() {
        assert(calls < values.length, "unexpected faction-maintenance RNG");
        return values[calls++];
      },
    };
  };
  const general = (budget, politics) => ({
    idx: 5,
    assignment_budget: budget,
    ability: { politics },
  });
  const gated = scenario({
    factions: [faction({ diplomat_idx: 5 })],
    generals: [null, null, null, null, null, general(9, 10)],
  });
  const high = sequence(32);
  performScenarioFactionTick(gated, high);
  assert.equal(high.calls, 1);
  assert.equal(gated.generals[5].assignment_budget, 9);
  assert.equal(gated._factionTickCursor, 1);

  const diplomacy = Array.from({ length: 24 }, () => Array(24).fill(0));
  diplomacy[0][2] = 0xe3;
  diplomacy[2][0] = 0xe3;
  const improved = scenario({
    factions: [faction({ diplomat_idx: 5 })],
    generals: [null, null, null, null, null, general(25, 255)],
    diplomacy,
    nativePlayerFactionPointer: 2 * 0x40,
  });
  const two = sequence(0, 15);
  performScenarioFactionTick(improved, two);
  assert.equal(two.calls, 2);
  assert.equal(improved.generals[5].assignment_budget, 1);
  assert.equal(nativeDiplomacyAt(improved, 0, 2, "test"), 0xe4);
  assert.equal(nativeDiplomacyAt(improved, 2, 0, "test"), 0xe4);
  assert.equal(improved._factionTickCursor, 1);

  const integrated = scenario({
    factions: [faction({ diplomat_idx: 5 })],
    generals: [null, null, null, null, null, general(25, 255)],
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    nativePlayerFactionPointer: 2 * 0x40,
  });
  const integratedRng = sequence(0, 15);
  assert.equal(
    tickFactionStrategicState({
      scenario: integrated,
      originalRng: integratedRng,
    }),
    true,
  );
  assert.equal(integratedRng.calls, 2);
  assert.equal(integrated._factionTickCursor, 1);

  const stopped = scenario({
    factions: [
      faction({
        attr: 0xc0,
        money: 0,
        n_cities: 1,
        target_faction: 4,
        reserve_arc: 32,
        diplomat_idx: 5,
      }),
    ],
    generals: [null, null, null, null, null, general(9, 10)],
  });
  const beforePointer = sequence(0, 0);
  assert.throws(
    () => performScenarioFactionTick(stopped, beforePointer),
    /nativePlayerFactionPointer/,
  );
  assert.equal(beforePointer.calls, 2);
  assert.equal(stopped.factions[0].attr, 0xc0);
  assert.equal(stopped.factions[0].target_faction, null);
  assert.equal(stopped.factions[0].monthly_reserve_upkeep, 1);
  assert.equal(stopped.generals[5].assignment_budget, 0);
  assert.equal(stopped._factionTickCursor, 0);

  const partialDiplomacy = Array.from({ length: 24 }, () => Array(24).fill(0));
  const partial = scenario({
    factions: [faction({ diplomat_idx: 5 })],
    generals: [null, null, null, null, null, general(25, 255)],
    diplomacy: partialDiplomacy,
    nativePlayerFactionPointer: 2 * 0x40,
  });
  Object.defineProperty(partial.nativeDiplomacyMatrix.rows[2], 0, {
    get: () => 0,
    set: () => {
      throw new Error("second diplomacy write");
    },
  });
  assert.throws(
    () => performScenarioFactionTick(partial, sequence(0, 15)),
    /second diplomacy write/,
  );
  assert.equal(partial.generals[5].assignment_budget, 1);
  assert.equal(nativeDiplomacyAt(partial, 0, 2, "test"), 1);
  assert.equal(nativeDiplomacyAt(partial, 2, 0, "test"), 0);
  assert.equal(partial._factionTickCursor, 0);
});

test("strict adapter rejects missing cursor/table fields without synthesizing defaults", () => {
  const sc = scenario();
  delete sc._factionTickCursor;
  assert.throws(() => performScenarioFactionTick(sc), /_factionTickCursor/);
  const second = scenario();
  delete second.nativeFactionSlots.records[0].reserve_arc;
  assert.throws(() => performScenarioFactionTick(second), /reserve_arc/);
});
