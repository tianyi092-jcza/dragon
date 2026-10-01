// P06: real aiTick + strategic battle + current tail + remaining slots.
// Expected bytes/RNG come from the independently replayed bounded KI fixture,
// not current Web output. Fixed daily-on is a stress input, not a world day.
// P75 G8-nP06 (entire-v2-replacement gate): the five cases run on a NATIVE v2
// assembly now. The old !native fixture died with the v1 retreat/movement
// arms (P62/P63): without them Web no longer replicates the KI bounded path
// and its batch RNG/bytes diverge. The transplant below replays the SAME
// battle inputs (chapter-16 records, planted slots 81/82/85/88, forced
// 13<->0 war cells, ch0/cl0/dh0 RNG) through prepareScenario fresh v2 +
// the native pump, against the UNTOUCHED certificate
// (fixtures/legion-slot-p06.json, KI-derived). Transplant decisions, each
// mirroring the old fixture's logical input, not Web output:
// - chapter-16 template carries the real native raw blocks (faction slots,
//   24x24 diplomacy, event wheel, policy, city records); the two forced war
//   cells are patched in BOTH the 22x22 view and the raw hex matrix (native
//   init cross-checks them byte-equal).
// - n_legions counts go into nativeFactionSlotRaw byte +0x14 (prepare
//   re-initializes faction views from raw; direct view writes would be lost).
// - weather/disaster tables stay present (P58 fresh requirement) but all
//   quiet (status 0): the KI certificate scope excludes weather, and the
//   harness batch-end 25FF tick must consume 0 RNG, exactly like the old
//   fixture's emptied tables. Detached {status:0} inputs are explicitly
//   allowed by initializeScenarioWeatherInputs.
// - nativeFateDisplayFlags = 0: explicit runtime input for the capture path
//   (P73 precedent); createNewGameScenario never inherits it.
// - terrainMemory carries the full real mmap_map.bin (274C tile gate needs
//   real 0xCE..0xDD boundary tiles at the attack edge).
// Post-prepare records are re-read from sc.legions (prepare clones raw).
// No SAVE.DAT, no profile.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { aiTick, buildArmies } from "../web/src/game/ai.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
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
const mmapMap = await fs.readFile(
  new URL("../web/mmap_map.bin", import.meta.url),
);
const oldFetch = globalThis.fetch;
// Same four original bytes, now addressed by the installed manifest revision.
// This changes only fixture transport, never the KI certificate or scenario.
const preloadAssets = createWorldResources().definition.assets;
const allowedAssets = new Set([
  preloadAssets.terrain,
  preloadAssets.roadCost,
  preloadAssets.roadOffset,
  preloadAssets.roadGraph,
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
// The world-asset fetch below serves exactly the current four trusted URLs.
const world = createWorldResources();
{
  const urls = world.definition.assets;
  const allowed = new Set([
    urls.terrain,
    urls.roadCost,
    urls.roadOffset,
    urls.roadGraph,
  ]);
  globalThis.fetch = async (name) => {
    assert.equal(typeof name, "string");
    assert.ok(allowed.has(String(name)), `Unexpected asset ${name}`);
    const bytes = await fs.readFile(
      new URL(`../web/${name}`, import.meta.url),
    );
    return new Response(bytes);
  };
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

function patchHexByte(hex, byteOffset, value) {
  const chars = hex.split("");
  const text = value.toString(16).padStart(2, "0");
  chars[byteOffset * 2] = text[0];
  chars[byteOffset * 2 + 1] = text[1];
  return chars.join("");
}

async function fixture(name) {
  const group = name === "defender-group" || name === "defender-unfit";
  const raw = createNewGameScenario(structuredClone(data.scenarios[16]), 17);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  raw.player_faction = 17;
  // Same forced war cells as the old fixture, in view and raw matrix alike.
  raw.diplomacy[13][0] = 0;
  raw.diplomacy[0][13] = 0;
  raw.nativeDiplomacyRaw = patchHexByte(raw.nativeDiplomacyRaw, 13 * 24 + 0, 0);
  raw.nativeDiplomacyRaw = patchHexByte(raw.nativeDiplomacyRaw, 0 * 24 + 13, 0);
  // F14 counts are raw inputs (prepare re-initializes faction views).
  raw.nativeFactionSlotRaw[13] = patchHexByte(
    raw.nativeFactionSlotRaw[13],
    0x14,
    2,
  );
  raw.nativeFactionSlotRaw[0] = patchHexByte(
    raw.nativeFactionSlotRaw[0],
    0x14,
    group ? 2 : 0,
  );
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.nativeFateDisplayFlags = 0;
  raw.delayedLegionReturns = [];
  const planted = [];
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
    assert.equal(raw.generals[slot].faction, owner);
    raw.generals[slot].status = 1;
    const city = raw.cities[cityIndex];
    const record = {
      slot,
      status: 0xc5,
      faction: owner,
      generalIdx: slot,
      troops: unitCount * 6,
      morale,
      commandState: command,
      // DOS +08 always exists (direction frame; 4 =驻止/at rest). The
      // native core maps it to _markerFrame and 4300 reads it before any
      // direction write on node departure; engine convention rests at 4
      // (retreat_restore locks build preserving explicit values). Edge
      // records get it overwritten by movement anyway.
      _markerFrame: 4,
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
    planted.push(record);
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
  raw.legionSlotCounters[81] = 1;
  legion(82, 13, 100, 60, 297, 101, 1, 150);
  if (group) {
    legion(85, 0, 10, 88, 243, 120);
    legion(88, 0, 50, 88, 243, 120, 8, name === "defender-unfit" ? 99 : 200);
  }
  raw.legions = planted;
  if (raw.nativeLegionSlots) {
    for (const record of raw.legions)
      raw.nativeLegionSlots.records[record.slot] = record;
    rebindNativeLegionViews(raw);
  }
  // The original input also sets city+18 occupancy (2/0 and 1). Web contact
  // reads the same explicit live records above; city/governance is not run.
  buildArmies(raw);
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "p06-native",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [structuredClone(data.scenarios[16])] },
  );
  const result = await prepareScenario({
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: Buffer.from(mmapMap).toString("hex") }],
    },
  });
  const sc = result.scenario;
  assert.ok(scenarioNativeRoadContext(sc), "P06 scenario must bind v2");
  sc.citiesOf = (id) => sc.cities.filter((city) => city.faction === id);
  const records = new Map(sc.legions.map((record) => [record.slot, record]));
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
  test(`P06 first batch: ${expected.name}`, async () => {
    const f = await fixture(expected.name);
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
      const road = record._march
        ? serializeRoadMarchContext(record._march)
        : null;
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
