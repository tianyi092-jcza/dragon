import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { initializeNativeFactionSlots } from "../web/src/game/nativefactions.js";
import { initializeNativeLegionSlotsFromZeroChapter, publishLegacyLegionRecord } from "../web/src/game/nativelegions.js";
import {
  initializeNativeMonthlyPolicy,
  refreshNativeMonthlyPolicyViews,
} from "../web/src/game/nativemonthlypolicy.js";
import {
  originalAddFunds5609,
  originalReserveAdd55EC,
  originalSubtractFunds563B,
} from "../web/src/game/navigation/originalmonthlyfiscal.js";
import { processMonthlyFiscalSettlement } from "../web/src/game/ai.js";
import { GameBar } from "../web/src/ui/gamebar.js";
import { assertNativeMonthlyPolicy } from "../web/src/game/nativemonthlypolicy.js";
import { performScenarioMonthlyPolicyActivation } from "../web/src/game/navigation/scenariomonthlypolicy.js";
import { distLevel, getFinancePanelData, monthlySettlement } from "../web/src/game/economy.js";

let data;
try {
  data = JSON.parse(
    fs.readFileSync(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("cannot load fixed native monthly fixture", { cause });
}
const sequence = (...values) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    nextByte() {
      return values.length
        ? values[calls++ % values.length]
        : (calls++ * 73 + 19) & 0xff;
    },
  };
};
function fixture() {
  // Builtin index16 is chapter0 from the fixed official 原版/SINARIO.DAT used by P08.
  const sc = structuredClone(data.scenarios[16]);
  sc.player_faction = 17;
  initializeNativeFactionSlots(sc);
  initializeNativeMonthlyPolicy(sc);
  sc.legions = [];
  initializeLegionSlotState(sc);
  initializeNativeLegionSlotsFromZeroChapter(sc);
  sc.nativePlayerFactionPointer = 17 * 0x40;
  for (const faction of sc.nativeFactionSlots.records)
    if (faction.idx !== 13) {
      faction.attr &= 0x7f;
      faction.active = false;
    }
  const faction = sc.nativeFactionSlots.records[13];
  faction.attr |= 0x80;
  faction.active = true;
  return { sc, faction };
}

test("keypad confirmation survives JSON and 53A6; next settlement credits all three player pools", () => {
  const { sc, faction } = fixture();
  sc.player_faction = 13;
  sc.nativePlayerFactionPointer = 13 * 0x40;
  sc.nativeMonthlyPolicy.bytes[9] = 0xab;
  for (const [type,val] of [["tax",25],["cav",109],["arc",209],["inf",309]])
    GameBar.prototype._clickKeypadDialog.call({ app: { scenario: sc, view: { draw() {} } }, keypadDialog: { type,val,ox:0,oy:0 }, closeKeypadDialog() {} },110,84);
  assertNativeMonthlyPolicy(JSON.parse(JSON.stringify(sc)));
  assert.equal(sc.nativeMonthlyPolicy.bytes[9], 0xab);
  assert.equal(sc.next_tax, 25);
  assert.deepEqual(sc.next_conscription, [100,200,300]);
  assert.deepEqual(sc.conscription, [0,0,0]);
  const [prior] = monthlySettlement(sc, null, sequence(0));
  assert.deepEqual([prior.cav,prior.arc,prior.inf], [0,0,0]);
  performScenarioMonthlyPolicyActivation(sc);
  const [next] = monthlySettlement(sc, null, sequence(0));
  assert.deepEqual([next.cav,next.arc,next.inf], [10,20,30]);
  assert.deepEqual([faction.reserve_cav,faction.reserve_arc,faction.reserve_inf], [410,520,630]);
});

test("686C shows settled 18% report, not next 100% or live expense", () => {
  const { sc, faction } = fixture();
  sc.player_faction = 13;
  sc.nativePlayerFactionPointer = 13 * 0x40;
  sc.nativeMonthlyPolicy.bytes[0] = 18;
  sc.nativeMonthlyPolicy.bytes[8] = 100;
  refreshNativeMonthlyPolicyViews(sc);
  faction.monthly_reserve_upkeep = 1008;
  const [report] = monthlySettlement(sc, null, sequence(0));
  const income = Math.floor(17556 * 18 / 100);
  assert.equal(report.gold, 32000 + income - 1008);
  faction.monthly_reserve_upkeep = 42;
  const panel = getFinancePanelData(JSON.parse(JSON.stringify(sc)));
  assert.deepEqual([panel.income, panel.expense, panel.nextTax], [income, 1008, 100]);
  assert.deepEqual([80,81,200,201,255,256].map(x => distLevel({x,y:0},{x:0,y:0})), [2,3,3,4,4,4]);
});

test("5609/563B/55EC exact signed24 and carry saturation boundaries", () => {
  assert.equal(originalSubtractFunds563B(0x7618, 0), 0x7618);
  assert.equal(originalSubtractFunds563B(0xf61f90, 10000), 0xf60168);
  assert.equal(originalSubtractFunds563B(0xf614f0, 5000), 0xf60168);
  assert.equal(originalAddFunds5609(650000, 8778), 655000);
  assert.equal(originalAddFunds5609(646222, 8778), 655000);
  assert.equal(originalAddFunds5609(600000, 8778), 608778);
  assert.equal(originalReserveAdd55EC(65499, 65), 65500);
  assert.equal(originalReserveAdd55EC(65450, 65), 65500);
  assert.equal(originalReserveAdd55EC(100, 65), 165);
});

test("official faction13 native 5358 finance precedes 192 growth RNG and updates stored F23", () => {
  const { sc, faction } = fixture();
  const rng = sequence(0);
  const report = monthlySettlement(sc, null, rng);
  assert.deepEqual(
    report.map(({ faction: idx, income, expense, cav, arc, inf, gold }) => ({
      idx,
      income,
      expense,
      cav,
      arc,
      inf,
      gold,
    })),
    [
      {
        idx: 13,
        income: 8778,
        expense: 0,
        cav: 65,
        arc: 65,
        inf: 415,
        gold: 40778,
      },
    ],
  );
  assert.equal(faction.reserve_cav, 465);
  assert.equal(faction.reserve_arc, 565);
  assert.equal(faction.reserve_inf, 1015);
  assert.equal(faction.n_cities, 7);
  assert.equal(faction.monthly_reserve_upkeep, 0);
  assert.equal(rng.calls, 192);
});

test("M257(e): live city count scans, recounts and grows 200 cities", () => {
  const extra = () => {
    const { sc, faction } = fixture();
    for (let slot = 192; slot < 200; slot++) {
      sc.cities.push({
        idx: slot,
        x: 100,
        y: 100,
        faction: 13,
        prod: 600,
        growth: 100,
        max_prod: 200,
      });
    }
    return { sc, faction };
  };
  const control = fixture();
  const controlReport = monthlySettlement(control.sc, null, sequence(0));
  const live = extra();
  const liveReport = monthlySettlement(live.sc, null, sequence(0));
  const incomeOf = (report) => report.find(({ faction: idx }) => idx === 13).income;
  // Recount covers the appended slots; income covers their production.
  assert.equal(live.faction.n_cities, control.faction.n_cities + 8);
  assert.equal(live.faction.n_cities, 15);
  assert.ok(incomeOf(liveReport) > incomeOf(controlReport));
  // Growth RNG is consumed once per live city, not per 192 slots.
  const rng = sequence(0);
  monthlySettlement(extra().sc, null, rng);
  assert.equal(rng.calls, 200);
});

test("M257(g): live city count scans, recounts and grows 257 cities", () => {
  const extra = () => {
    const { sc, faction } = fixture();
    for (let slot = 192; slot < 257; slot++) {
      sc.cities.push({
        idx: slot,
        x: 100,
        y: 100,
        faction: 13,
        prod: 600,
        growth: 100,
        max_prod: 200,
      });
    }
    return { sc, faction };
  };
  const control = fixture();
  const controlReport = monthlySettlement(control.sc, null, sequence(0));
  const live = extra();
  const liveReport = monthlySettlement(live.sc, null, sequence(0));
  const incomeOf = (report) => report.find(({ faction: idx }) => idx === 13).income;
  assert.equal(live.faction.n_cities, control.faction.n_cities + 65);
  assert.equal(live.faction.n_cities, 72);
  assert.ok(incomeOf(liveReport) > incomeOf(controlReport));
  const rng = sequence(0);
  monthlySettlement(extra().sc, null, rng);
  assert.equal(rng.calls, 257);
});

test("5456 uses uncleared expense and strict burden equality to reject all three pools", () => {
  const { sc, faction } = fixture();
  faction.monthly_reserve_upkeep = 4352;
  const rng = sequence(0);
  const [report] = monthlySettlement(sc, null, rng);
  assert.equal(report.income, 8778);
  assert.equal(report.expense, 4352);
  assert.equal(report.cav, 0);
  assert.equal(faction.money, 36426);
  assert.deepEqual(
    [faction.reserve_cav, faction.reserve_arc, faction.reserve_inf],
    [400, 500, 600],
  );
  assert.equal(faction.monthly_reserve_upkeep, 0);
  assert.equal(rng.calls, 192);
});

test("5828 tax-after-income negative one consumes three RNG before city growth", () => {
  const { sc, faction } = fixture();
  faction.money = -8779;
  const rng = sequence(0);
  monthlySettlement(sc, null, rng);
  assert.equal(faction.money, -1);
  assert.deepEqual(
    [faction.reserve_cav, faction.reserve_arc, faction.reserve_inf],
    [449, 549, 999],
  );
  assert.equal(rng.calls, 195);
});

test("5456 scans odd +20/+21/+24 aliases but excludes full slots64..127", () => {
  const aliased = fixture();
  aliased.faction.monthly_reserve_upkeep = 2304;
  for (let slot = 0; slot < 4; slot++)
    Object.assign(aliased.sc.nativeLegionSlots.records[slot], {
      targetCity: 0x80,
      contactAnimationByte21: 13,
      monthlyAliasWord24: 512,
    });
  // Formations targeting an extended city must retain the real alias bytes,
  // including nonzero values from a previously used slot, through month-end.
  for (let slot = 0; slot < 4; slot++) {
    publishLegacyLegionRecord(aliased.sc, { slot, x: 1, y: 1, status: 128, faction: 13, troops: 0, targetCity: 194 }, 'monthly fixture');
  }
  monthlySettlement(aliased.sc, null, sequence(0));
  assert.deepEqual(
    [
      aliased.faction.reserve_cav,
      aliased.faction.reserve_arc,
      aliased.faction.reserve_inf,
    ],
    [400, 500, 600],
  );

  const excluded = fixture();
  excluded.faction.monthly_reserve_upkeep = 2304;
  for (let slot = 64; slot < 68; slot++)
    Object.assign(excluded.sc.nativeLegionSlots.records[slot], {
      status: 0x80,
      faction: 13,
      troops: 512,
    });
  monthlySettlement(excluded.sc, null, sequence(0));
  assert.deepEqual(
    [
      excluded.faction.reserve_cav,
      excluded.faction.reserve_arc,
      excluded.faction.reserve_inf,
    ],
    [465, 565, 1015],
  );
});

test("5456 second-half alias is lazy and failure retains deducted money/old expense", () => {
  const { sc, faction } = fixture();
  faction.monthly_reserve_upkeep = 256;
  const slot = sc.nativeLegionSlots.records[0];
  slot.targetCity = 0x80;
  slot.contactAnimationByte21 = 13;
  delete slot.monthlyAliasWord24;
  const app = {
    scenario: sc,
    originalRng: sequence(0),
    clock: { hold: false },
  };
  assert.throws(
    () => processMonthlyFiscalSettlement(app),
    /monthlyAliasWord24/,
  );
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
  assert.equal(faction.money, 31744);
  assert.equal(faction.monthly_reserve_upkeep, 256);
  assert.deepEqual(
    [faction.reserve_cav, faction.reserve_arc, faction.reserve_inf],
    [400, 500, 600],
  );
});

test("missing CFD and CFF stop at their own read with committed fiscal prefixes", () => {
  const missingPointer = fixture();
  missingPointer.faction.monthly_reserve_upkeep = 256;
  delete missingPointer.sc.nativePlayerFactionPointer;
  const pointerApp = {
    scenario: missingPointer.sc,
    originalRng: sequence(0),
    clock: { hold: false },
  };
  assert.throws(
    () => processMonthlyFiscalSettlement(pointerApp),
    /nativePlayerFactionPointer/,
  );
  assert.equal(missingPointer.faction.money, 31744);
  assert.equal(missingPointer.faction.monthly_reserve_upkeep, 256);
  assert.deepEqual(
    [
      missingPointer.faction.reserve_cav,
      missingPointer.faction.reserve_arc,
      missingPointer.faction.reserve_inf,
    ],
    [400, 500, 600],
  );
  assert.equal(pointerApp.clock.hold, true);

  const missingCff = fixture();
  delete missingCff.sc.player_faction;
  const cffApp = {
    scenario: missingCff.sc,
    originalRng: sequence(0),
    clock: { hold: false },
  };
  assert.throws(() => processMonthlyFiscalSettlement(cffApp), /player_faction/);
  assert.equal(missingCff.faction.money, 40778);
  assert.equal(missingCff.faction.monthly_reserve_upkeep, 0);
  assert.deepEqual(
    [
      missingCff.faction.reserve_cav,
      missingCff.faction.reserve_arc,
      missingCff.faction.reserve_inf,
    ],
    [465, 565, 1015],
  );
  assert.equal(cffApp.originalRng.calls, 0);
  assert.equal(cffApp.clock.hold, true);
});

test("5695 reads current tax only for a city whose owner matches CFF", () => {
  const { sc, faction } = fixture();
  sc.player_faction = 23;
  sc.nativePlayerFactionPointer = 21 * 0x40;
  delete sc.tax;
  monthlySettlement(sc, null, sequence(0));
  assert.equal(faction.money, 40778);
});

test("548F player taxation/policy use explicit CFD while 5695 uses CFF", () => {
  const { sc, faction } = fixture();
  sc.player_faction = 13;
  sc.nativePlayerFactionPointer = 13 * 0x40;
  sc.nativeMonthlyPolicy.bytes[0] = 100;
  for (const offset of [2, 4, 6]) {
    sc.nativeMonthlyPolicy.bytes[offset] = 0xff;
    sc.nativeMonthlyPolicy.bytes[offset + 1] = 0xff;
  }
  refreshNativeMonthlyPolicyViews(sc);
  const [report] = monthlySettlement(sc, null, sequence(0));
  assert.equal(report.income, 17556);
  assert.deepEqual(report.playerReport, { income: 17556, expense: 0 });
  assert.deepEqual(
    [faction.reserve_cav, faction.reserve_arc, faction.reserve_inf],
    [465, 565, 1015],
  );
  assert.equal(faction.money, 49556);
});
