// Stored F14 arithmetic/entry gates from KI 6F57, 6F5C, 291A and 4689.
// Pure memory plus public Web templates; no original save or browser storage.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  countLegionActivation,
  countLegionRemoval,
  factionLegionCount,
  initializeFactionLegionCounts,
} from "../web/src/game/legioncounts.js";
import {
  applyBattleResult,
  continueLegionAfterBattle,
  dispatchLegionFate,
} from "../web/src/game/ai.js";
import { Scenario, createNewGameScenario } from "../web/src/game/world.js";

let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("Cannot load explicit Web templates", { cause });
}

test("fresh worlds initialize F14 from their content, without mutating templates", () => {
  const before = JSON.stringify(data);
  for (const template of data.scenarios) {
    const sc = createNewGameScenario(template);
    for (const faction of sc.factions) {
      const source = template.factions.find((f) => f.idx === faction.idx);
      assert.equal(
        faction.n_legions,
        Number.parseInt(source.raw.slice(40, 42), 16),
      );
    }
  }
  assert.equal(JSON.stringify(data), before);
});

test("6F5C/4693 wrap the stored byte, not live-list length or a saturated count", () => {
  const record = { slot: 9, faction: 0, status: 0x80 };
  for (let value = 0; value < 256; value++) {
    const faction = { idx: 0, n_legions: value };
    const sc = { factions: [faction], legions: [] };
    countLegionRemoval(sc, record);
    assert.equal(faction.n_legions, (value + 255) % 256);
    faction.n_legions = value;
    countLegionActivation(sc, record);
    assert.equal(faction.n_legions, (value + 1) % 256);
  }
});

test("6F57 activation distinguishes every old status byte before insertion", () => {
  const replacement = { slot: 9, faction: 0, status: 0xc0 };
  for (let status = 0; status < 256; status++) {
    const faction = { idx: 0, n_legions: 6 };
    const sc = { factions: [faction], legions: [{ slot: 9, status }] };
    countLegionActivation(sc, replacement);
    assert.equal(faction.n_legions, status >= 0x80 ? 6 : 7);
  }
});

test("291A rejects inactive records before any other read or RNG", () => {
  for (let status = 0; status < 128; status++) {
    assert.equal(
      dispatchLegionFate({}, { status }, 0, {
        nextByte() {
          throw new Error("inactive record consumed RNG");
        },
      }),
      null,
    );
  }
});

test("474E resets the phase before both failure gates, without reactivating a record", () => {
  for (const failure of ["morale", "first-team"]) {
    const record = {
      status: 8,
      faction: 0,
      morale: failure === "morale" ? 0 : 200,
      troops: failure === "morale" ? 600 : 500,
      moveDelay: 99,
      movePeriod: 99,
      units: Array.from({ length: 6 }, (_, i) => ({
        type: 1,
        troops: failure === "first-team" && i === 0 ? 0 : 1000,
      })),
    };
    assert.equal(continueLegionAfterBattle({}, record, false), false);
    assert.equal(record.moveDelay, 1);
    assert.equal(record.movePeriod, 2);
    assert.equal(
      record.status,
      8,
      "6FD2 and the failure exit do not set active",
    );
  }
});

test("5030 direct capture clears the monarch slot and decrements F14 only if active", () => {
  // Explicit wrapper inputs, not a claim about a complete campaign/history.
  for (const mode of [
    "active-outside",
    "inactive-outside",
    "already-retired-BP",
  ]) {
    const sc = new Scenario(createNewGameScenario(data.scenarios[16], 17));
    const faction = sc.factions.find((f) => f.idx === 0);
    const city = sc.cities.find((c) => c.faction === 0);
    for (const other of sc.cities)
      if (other !== city && other.faction === 0) other.faction = null;
    for (const general of sc.generals)
      if (general.faction === 0) general.active = false;
    const general = sc.generals[faction.monarch_idx];
    Object.assign(general, {
      active: true,
      attr: 0xc0,
      status: 1,
      faction: 0,
      origFaction: null,
      captive_flag: 0xff,
    });
    faction.n_legions = mode === "active-outside" ? 1 : 0;
    const units = () =>
      Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 }));
    const at = mode === "already-retired-BP" ? city : sc.cities[60];
    const monarch = {
      slot: general.idx,
      generalIdx: general.idx,
      faction: 0,
      status: mode === "active-outside" ? 0xc4 : 8,
      units: units(),
      troops: 600,
      morale: 200,
      x: at.x,
      y: at.y,
      roadEdgeOrNode: at.idx * 8,
      moveDelay: 1,
      movePeriod: 3,
    };
    const A = {
      slot: 81,
      generalIdx: 81,
      faction: 13,
      status: 0xc4,
      units: units(),
      troops: 600,
      morale: 200,
      x: city.x,
      y: city.y,
      roadEdgeOrNode: city.idx * 8,
      moveDelay: 1,
      movePeriod: 3,
    };
    sc.legions = [A, monarch];
    sc.delayedLegionReturns = mode === "active-outside" ? [] : [monarch];
    const counter = mode === "already-retired-BP" ? 48 : 23;
    sc.legionSlotCounters[monarch.slot] = counter;
    const app = {
      scenario: sc,
      originalRng: {
        nextByte() {
          throw new Error("direct 29C3 consumed RNG");
        },
      },
    };
    applyBattleResult(
      app,
      A,
      city,
      "atk",
      600,
      null,
      null,
      null,
      null,
      null,
      null,
      {
        oldFaction: 0,
        defenders: mode === "already-retired-BP" ? [monarch] : [],
        sides: [{ troops: 600, morale: 200, units: Array(6).fill(100) }],
      },
    );
    assert.equal(faction.n_legions, 0, mode);
    assert.equal(monarch.status, 0, mode);
    assert.equal(monarch.dead, true, mode);
    assert.equal(
      sc.legionSlotCounters[monarch.slot],
      counter,
      "29C3 does not clear +03",
    );
    assert.equal(sc.delayedLegionReturns.includes(monarch), false);
    assert.equal(general.status, 4);
    assert.equal(general.faction, 13);
  }
});

test("runtime F14 cannot be silently reconstructed from old raw or guessed zero", () => {
  const faction = { idx: 0, raw: "00".repeat(64) };
  assert.throws(() => factionLegionCount(faction), /faction \+14/);
  initializeFactionLegionCounts({ factions: [faction] });
  faction.n_legions = 7;
  assert.equal(factionLegionCount(faction), 7);
  for (const value of [undefined, null, -1, 256, 1.5]) {
    faction.n_legions = value;
    assert.throws(() => factionLegionCount(faction), /faction \+14/);
  }
  assert.throws(
    () => initializeFactionLegionCounts({ factions: [{}] }),
    /missing/,
  );
});
