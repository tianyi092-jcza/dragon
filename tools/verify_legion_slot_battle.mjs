// P06: real aiTick + strategic battle + current tail + remaining slots.
// Expected bytes/RNG come from the independently replayed bounded KI fixture,
// not current Web output. Fixed daily-on is a stress input, not a world day.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { aiTick, buildArmies } from "../web/src/game/ai.js";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { loadTerrain } from "../web/src/game/pathfind.js";
import { serializeRoadMarchContext } from "../web/src/game/roadgraph.js";

async function json(url) {
  try {
    return JSON.parse(await fs.readFile(url, "utf8"));
  } catch (cause) {
    throw new Error(`Invalid explicit fixture ${url}`, { cause });
  }
}
const data = await json(new URL("../web/data.json", import.meta.url));
const certificate = await json(
  new URL("fixtures/legion-slot-p06.json", import.meta.url),
);
const oldFetch = globalThis.fetch;
const allowedAssets = new Set([
  "mmap_map.bin",
  "road_cost.bin",
  "road_offset.json",
  "road_graph.json",
]);
globalThis.fetch = async (name) => {
  assert.equal(typeof name, "string");
  assert.ok(allowedAssets.has(name), `Unexpected asset ${name}`);
  const bytes = await fs.readFile(new URL(`../web/${name}`, import.meta.url));
  return new Response(bytes);
};
try {
  await loadTerrain();
} finally {
  globalThis.fetch = oldFetch;
}

const word = (raw, offset) => raw[offset] | (raw[offset + 1] << 8);
function fields(raw) {
  const road = {};
  if (word(raw, 14) >= 0x800) {
    road.stride = raw[10];
    if (road.stride >= 128) road.stride -= 256;
    road.pointAddress = word(raw, 12);
  }
  return {
    ...road,
    status: raw[0],
    faction: raw[1],
    counter: raw[3],
    troops: word(raw, 4),
    morale: raw[6],
    delay: raw[11],
    period: raw[30],
    command: raw[35],
    x: word(raw, 16),
    y: word(raw, 18),
    targetCity: raw[32],
    targetNode: word(raw, 20) / 8,
    edgeOrNode: word(raw, 14),
    units: Array.from({ length: 6 }, (_, i) => raw[0x29 + i * 4]),
    types: Array.from({ length: 6 }, (_, i) => raw[0x2a + i * 4]),
  };
}
function fixture(name) {
  const sc = structuredClone(data.scenarios[16]);
  initializeLegionSlotState(sc);
  sc.player_faction = 17;
  sc.weatherClouds = [];
  sc.disasterMapObjects = [];
  sc.delayedLegionReturns = [];
  sc.citiesOf = (id) => sc.cities.filter((city) => city.faction === id);
  const group = name === "defender-group" || name === "defender-unfit";
  const records = new Map();
  function legion(
    slot,
    owner,
    unitCount,
    cityIndex,
    x,
    y,
    command = 8,
    morale = 200,
  ) {
    assert.equal(sc.generals[slot].faction, owner);
    sc.generals[slot].status = 1;
    const city = sc.cities[cityIndex];
    const record = {
      slot,
      status: 0xc5,
      faction: owner,
      generalIdx: slot,
      troops: unitCount * 6,
      morale,
      commandState: command,
      x,
      y,
      target: city,
      targetCity: cityIndex,
      targetNode: cityIndex,
      targetX: city.x,
      targetY: city.y,
      roadStride: 4,
      roadPointAddress: 0,
      roadEdgeOrNode: cityIndex * 8,
      moveDelay: 1,
      movePeriod: 3,
      units: Array.from({ length: 6 }, () => ({
        type: 3,
        troops: unitCount * 10,
      })),
    };
    records.set(slot, record);
    return record;
  }
  const A = legion(
    81,
    13,
    ["attacker-loss", "attacker-unfit"].includes(name) ? 12 : 100,
    88,
    243,
    118,
    0,
    name === "attacker-unfit" ? 99 : 200,
  );
  A.roadPointAddress = 0x40c8;
  A.roadEdgeOrNode = 0x0ec0;
  sc.legionSlotCounters[81] = 1;
  legion(82, 13, 100, 60, 297, 101, 1, 150);
  if (group) {
    legion(85, 0, 10, 88, 243, 120);
    legion(88, 0, 50, 88, 243, 120, 8, name === "defender-unfit" ? 99 : 200);
  }
  sc.legions = [...records.values()];
  for (const [owner, count] of [
    [13, 2],
    [0, group ? 2 : 0],
  ]) {
    sc.factions.find((f) => f.idx === owner).n_legions = count;
  }
  sc.diplomacy[13][0] = sc.diplomacy[0][13] = 0;
  // The original input also sets city+18 occupancy (2/0 and 1). Web contact
  // reads the same explicit live records above; city/governance is not run.
  buildArmies(sc);
  const rng = new OriginalBattleRng({ ch: 0, cl: 0, dh: 0 });
  const draws = [];
  const next = rng.nextByte.bind(rng);
  rng.nextByte = () => {
    const value = next();
    draws.push(value);
    return value;
  };
  const app = {
    scenario: sc,
    originalRng: rng,
    hud: { buildLegend() {} },
    view: { draw() {} },
  };
  return { sc, app, records, draws };
}

for (const expected of certificate.cases) {
  test(`P06 first batch: ${expected.name}`, () => {
    const f = fixture(expected.name);
    aiTick(f.app, {
      legionBatchStart: 80,
      runCityDaily: false,
      settleDaily: true,
    });
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(f.app._legionSlotBatch, null);
    assert.deepEqual(
      f.draws,
      expected.firstBatchRNG,
      "continuous RNG, including next slot",
    );
    for (const [slotText, raw] of Object.entries(expected.slots)) {
      const slot = Number(slotText),
        record = f.records.get(slot);
      if (!record) {
        assert.equal(raw[0], 0);
        continue;
      }
      const road = serializeRoadMarchContext(record._march);
      // Edge +0A/+0C are consumed by later motion. Node scratch bytes are
      // deliberately outside this projection; this is not a 64-byte equality.
      const edgeFields =
        word(raw, 14) >= 0x800
          ? {
              stride: road?.stride ?? record.roadStride,
              pointAddress: road?.pointAddress ?? record.roadPointAddress,
            }
          : {};
      const actual = {
        ...edgeFields,
        status: record.status,
        faction: record.faction,
        counter: f.sc.legionSlotCounters[slot],
        troops: record.troops,
        morale: record.morale,
        delay: record.moveDelay,
        period: record.movePeriod,
        command: record.commandState,
        x: record.x,
        y: record.y,
        targetCity: record.targetCity,
        targetNode: record.targetNode,
        edgeOrNode: road?.edgeOrNode ?? record.roadEdgeOrNode,
        units: record.units.map((unit) => unit.troops / 10),
        types: record.units.map((unit) => unit.type),
      };
      assert.deepEqual(
        actual,
        fields(raw),
        `slot ${slot} named rule fields (not all 64 bytes)`,
      );
    }
    assert.equal(f.sc.cities[88].faction, expected.city88[1]);
    for (const [owner, raw] of Object.entries(expected.factions)) {
      const faction = f.sc.factions.find((f) => f.idx === Number(owner));
      const unsigned = raw[32] | (raw[33] << 8) | (raw[34] << 16);
      const funds = unsigned & 0x800000 ? unsigned - 0x1000000 : unsigned;
      assert.equal(
        faction.gold ?? faction.money,
        funds,
        `faction ${owner} post-slot funds`,
      );
      assert.equal(faction.n_legions, raw[20], `faction ${owner} legion count`);
    }
  });
}
