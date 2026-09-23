import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { processMonthlyBudgetProducers } from "../web/src/game/ai.js";
import { initializeNativeFactionSlots } from "../web/src/game/nativefactions.js";
import {
  initializeNativeDiplomacyMatrix,
  writeNativeDiplomacyAt,
} from "../web/src/game/nativediplomacy.js";
import { initializeNativeStrategicEventWheel } from "../web/src/game/nativeevents.js";
import {
  performScenarioDeficitTrustEvent,
  performScenarioMonthlyBudgetProducers,
} from "../web/src/game/navigation/scenariomonthlybudgets.js";

let data;
try {
  data = JSON.parse(
    fs.readFileSync(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("cannot load native monthly budget fixture", { cause });
}
const fixture = () => {
  const sc = structuredClone(data.scenarios[16]);
  sc.player_faction = 0;
  sc.nativePlayerFactionPointer = 1; // Independent, legal non-aligned CFD.
  initializeNativeFactionSlots(sc);
  initializeNativeDiplomacyMatrix(sc);
  initializeNativeStrategicEventWheel(sc);
  sc._strategicEventCursor = 0;
  sc._strategicEventDivider = 7;
  for (const city of sc.cities) {
    city.faction = null;
    city.governor = null;
  }
  for (const faction of sc.nativeFactionSlots.records)
    faction.diplomat_idx = null;
  return sc;
};
const sequence = (...values) => ({
  calls: 0,
  nextByte() {
    assert.ok(this.calls < values.length, "unexpected RNG call");
    return values[this.calls++];
  },
});

test("5715 then 578F encode city/faction and little-endian amount in shared 4-byte slots", () => {
  const sc = fixture();
  const city = sc.cities[69];
  Object.assign(city, {
    faction: 0,
    governor: 5,
    growth: 100,
    defence: 120,
    troops_cap: 50,
    troops: 20,
  });
  sc.generals[5].assignment_budget = 0;
  sc.nativeFactionSlots.records[13].diplomat_idx = 6;
  sc.generals[6].assignment_budget = 0;
  writeNativeDiplomacyAt(sc, 0, 13, 0xb4, "test");
  writeNativeDiplomacyAt(sc, 13, 0, 0xb5, "test");
  const rng = sequence(0, 0);
  const result = performScenarioMonthlyBudgetProducers(sc, rng);
  assert.equal(rng.calls, 2);
  assert.deepEqual(
    result.domestic.map(({ amount }) => amount),
    [4250],
  );
  assert.deepEqual(
    result.envoy.map(({ amount }) => amount),
    [9600],
  );
  assert.deepEqual(sc.strategicEventSlots[0], {
    type: 4,
    arg0: 69,
    arg1: 0x9a,
    arg2: 0x10,
  });
  assert.deepEqual(sc.strategicEventSlots[1], {
    type: 5,
    arg0: 13,
    arg1: 0x80,
    arg2: 0x25,
  });
});

test("5715 queues amount zero; maintained governors and diplomats consume no RNG", () => {
  const sc = fixture();
  Object.assign(sc.cities[1], {
    faction: 0,
    governor: 1,
    growth: 180,
    defence: 180,
    troops_cap: 40,
    troops: 40,
  });
  sc.generals[1].assignment_budget = 0;
  Object.assign(sc.cities[2], { faction: 0, governor: 2 });
  sc.generals[2].assignment_budget = 1;
  sc.nativeFactionSlots.records[3].diplomat_idx = 3;
  sc.generals[3].assignment_budget = 1;
  const rng = sequence(0);
  const result = performScenarioMonthlyBudgetProducers(sc, rng);
  assert.equal(rng.calls, 1);
  assert.equal(result.domestic[0].amount, 0);
  assert.equal(result.envoy.length, 0);
  assert.deepEqual(sc.strategicEventSlots[0], {
    type: 4,
    arg0: 1,
    arg1: 0,
    arg2: 0,
  });
});

test("578F byte subtraction retains 51000 underflow values", () => {
  for (const [raw, expected] of [
    [126, 51000],
    [229, 51000],
    [255, 45800],
  ]) {
    const sc = fixture();
    sc.nativeFactionSlots.records[13].diplomat_idx = 6;
    sc.generals[6].assignment_budget = 0;
    writeNativeDiplomacyAt(sc, 0, 13, raw, "test");
    writeNativeDiplomacyAt(sc, 13, 0, raw, "test");
    const rng = sequence(0);
    const result = performScenarioMonthlyBudgetProducers(sc, rng);
    assert.equal(result.envoy[0].amount, expected, `raw ${raw}`);
    assert.equal(rng.calls, 1);
  }
});

test("full current page consumes one RNG per eligible producer and preserves slots", () => {
  const sc = fixture();
  Object.assign(sc.cities[1], {
    faction: 0,
    governor: 1,
    growth: 0,
    defence: 0,
    troops_cap: 1,
    troops: 0,
  });
  sc.generals[1].assignment_budget = 0;
  sc.nativeFactionSlots.records[13].diplomat_idx = 6;
  sc.generals[6].assignment_budget = 0;
  const occupied = { type: 10, arg0: 1, arg1: 2, arg2: 3 };
  for (let slot = 0; slot < 64; slot++)
    sc.strategicEventSlots[slot] = { ...occupied };
  const before = structuredClone(sc.strategicEventSlots);
  const rng = sequence(0, 0);
  const result = performScenarioMonthlyBudgetProducers(sc, rng);
  assert.equal(rng.calls, 2);
  assert.deepEqual(result, { domestic: [], envoy: [] });
  assert.deepEqual(sc.strategicEventSlots, before);
});

test("578F scans hidden fixed faction slots, not the declared faction list", () => {
  const sc = fixture();
  sc.factions = sc.factions.slice(0, 1);
  sc.diplomacy = sc.diplomacy.slice(0, 1);
  sc.nativeFactionSlots.records[21].diplomat_idx = 6;
  sc.generals[6].assignment_budget = 0;
  writeNativeDiplomacyAt(sc, 0, 21, 0x80, "test");
  writeNativeDiplomacyAt(sc, 21, 0, 0x80, "test");
  const rng = sequence(0);
  const result = performScenarioMonthlyBudgetProducers(sc, rng);
  assert.deepEqual(
    result.envoy.map(({ arg0 }) => arg0),
    [21],
  );
  assert.equal(sc.factions.length, 1);
});

test("57FE uses signed high-word magnitude and stores TALK406 as type13 payload", () => {
  const sc = fixture();
  sc.nativePlayerFactionPointer = 0;
  const player = sc.nativeFactionSlots.records[0];
  player.money = -9984; // high word FFD9; NEG gives the exact threshold 39.
  player.bellicosity = 1;
  const rng = sequence(0, 0);
  const result = performScenarioDeficitTrustEvent(sc, rng);
  assert.equal(result.queued, true);
  assert.equal(rng.calls, 2);
  assert.deepEqual(sc.strategicEventSlots[0], {
    type: 13,
    arg0: 0,
    arg1: 0x96,
    arg2: 0x01,
  });

  const below = fixture();
  below.nativePlayerFactionPointer = 0;
  below.nativeFactionSlots.records[0].money = -9728; // high word FFDA, magnitude 38.
  below.nativeFactionSlots.records[0].bellicosity = 0xff;
  const unused = sequence();
  assert.equal(
    performScenarioDeficitTrustEvent(below, unused).gated,
    "magnitude",
  );
  assert.equal(unused.calls, 0);
});

test("578F failure retains an already queued 5715 prefix and enters strategic hold", () => {
  const sc = fixture();
  Object.assign(sc.cities[1], {
    faction: 0,
    governor: 1,
    growth: 180,
    defence: 180,
    troops_cap: 0,
    troops: 0,
  });
  sc.generals[1].assignment_budget = 0;
  sc.nativeFactionSlots.records[13].diplomat_idx = 6;
  delete sc.generals[6].assignment_budget;
  const rng = sequence(0);
  const app = { scenario: sc, originalRng: rng, clock: { hold: false } };
  assert.throws(() => processMonthlyBudgetProducers(app), /assignment_budget/);
  assert.deepEqual(sc.strategicEventSlots[0], {
    type: 4,
    arg0: 1,
    arg1: 0,
    arg2: 0,
  });
  assert.equal(rng.calls, 1);
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
});
