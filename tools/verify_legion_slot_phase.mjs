import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { aiTick } from "../web/src/game/ai.js";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";

// P16: docs/re-notes-ai-chain.md §20. KI 25C1..25D5 gates 2662/4325
// before 2600, even at the destination. These are explicit local inputs,
// not a reconstruction of a player's campaign or a whole world tick.
// I/O: read only the Web template; no SAVE, browser or IndexedDB access.
let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("Cannot load the local Web scenario fixture", { cause });
}

function fixture(delay, period, { morale = 200, backline = false } = {}) {
  const sc = structuredClone(data.scenarios[16]);
  initializeLegionSlotState(sc); // P16's declared zero table before slot81 input.
  sc.player_faction = 17;
  sc.citiesOf = (idx) => sc.cities.filter((city) => city.faction === idx);
  sc.weatherClouds = [];
  sc.disasterMapObjects = [];
  sc.delayedLegionReturns = [];
  const city = sc.cities[60];
  assert.equal(city.faction, 13);
  assert.equal(sc.factions[13].legion_morale_cap, 200);
  if (backline) {
    city.attr = 0;
    sc.factions[13].strategic_city_primary = null;
    sc.factions[13].strategic_city_secondary = null;
  }
  const legion = {
    slot: 81,
    _runtimeId: 81,
    _active: true,
    status: 0xc5,
    faction: 13,
    generalIdx: 81,
    x: city.x,
    y: city.y,
    prevX: city.x,
    prevY: city.y,
    troops: 600,
    morale,
    target: city,
    targetCity: 60,
    targetNode: 60,
    roadEdgeOrNode: 60 * 8,
    commandState: 8,
    moveDelay: delay,
    movePeriod: period,
    // Deliberately stale legacy data: it must not be another action gate.
    cooldown: 77,
    units: Array.from({ length: 6 }, () => ({
      type: period === 2 ? 1 : 3,
      troops: 1000,
    })),
  };
  sc.legions = [legion];
  const draws = [];
  const app = {
    scenario: sc,
    originalRng: {
      nextByte() {
        assert.ok(backline, "resting command must not consume RNG");
        assert.equal(draws.length, 0, "only the 43D9 draw is expected");
        draws.push(233);
        return 233;
      },
    },
  };
  return { app, legion, draws };
}

function visit(app, settleDaily = false) {
  aiTick(app, {
    legionBatchStart: 80,
    runCityDaily: false,
    settleDaily,
  });
}

test("25C1: all 512 byte-delay / period-2-or-3 resting inputs", () => {
  const mismatches = [];
  for (const period of [2, 3]) {
    for (let delay = 0; delay <= 255; delay++) {
      const { app, legion, draws } = fixture(delay, period);
      visit(app);
      const actual = [legion.commandState, legion.moveDelay, draws.length];
      const expected = [
        delay === 1 ? 1 : 8,
        delay === 1 ? period : (delay - 1) & 0xff,
        0,
      ];
      if (actual.some((value, index) => value !== expected[index])) {
        mismatches.push({ delay, period, expected, actual });
      }
    }
  }
  assert.equal(
    mismatches.length,
    0,
    `${mismatches.length}/512 mismatches; first: ${JSON.stringify(mismatches.slice(0, 4))}`,
  );
});

test("2600: reaching the morale cap does not redispatch command 8", () => {
  const { app, legion, draws } = fixture(1, 3, { morale: 190 });
  visit(app, true);
  assert.equal(legion.commandState, 8);
  assert.equal(legion.morale, 200);
  assert.equal(legion.moveDelay, 3);
  assert.deepEqual(draws, []);
});

test("P16 backline: eight own-slot visits, not three command passes", () => {
  const { app, legion, draws } = fixture(3, 3, { backline: true });
  const states = [];
  const delays = [];
  const rngCursors = [];
  for (let i = 0; i < 8; i++) {
    visit(app);
    states.push(legion.commandState);
    delays.push(legion.moveDelay);
    rngCursors.push(draws.length);
  }
  assert.deepEqual(states, [8, 8, 1, 1, 1, 2, 2, 11]);
  assert.deepEqual(delays, [2, 1, 3, 2, 1, 2, 1, 3]);
  assert.deepEqual(rngCursors, [0, 0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(draws, [233]);
  assert.equal(legion.targetCity, 60);
});
