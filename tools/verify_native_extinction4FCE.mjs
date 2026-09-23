// I/O: all fixtures synthetic; four explicitly mocked asset URLs, no forwarding.
// KI static goldens: 4FCE..5120, 4236..4268, 3669..36C0, 7028..703B,
// 29C3..2A7E, 4689..4697, 2AD2..2AF3, 89F0..8A1E windows re-read P45;
// P46 window: P54 re-brushed 503D..5073 identical + callers(4FCE)={4D1E}.
// True Scenario/caller integration, not CPU execution.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { performScenarioLegionFate } from "../web/src/game/navigation/scenariolegionfate.js";
import {
  performScenarioExtinction4FCE,
  performScenarioExtinctionAfterTalk36,
  performScenarioExtinctionPlayerGate,
  createScenarioLegionFateIO,
} from "../web/src/game/navigation/scenariolegionfate.js";
import {
  OriginalFateBoundaryError,
  originalRelationMerge3669,
  originalExtinctionTargetSweep,
  originalExtinctionAfterTalk36,
  originalExtinctionCitySweep4236,
} from "../web/src/game/navigation/originallegionfate.js";
import { nativeDiplomacyAt, writeNativeDiplomacyAt } from "../web/src/game/nativediplomacy.js";
import { captureOriginalCity } from "../web/src/game/navigation/originalcitycapture.js";
import { createDetachedExtinctionScan } from "../web/src/game/navigation/originalsiege.js";
import {
  applyBattleResult,
  resumeNativeExtinction,
  resumeNativeDiplomatReport,
  resumeNativeGovernorReport,
} from "../web/src/game/ai.js";
import { canSnapshotState } from "../web/src/game/savegame.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";

const DEAD = 1;
const CAPTOR = 0;
const PLAYER = 2;
const CFD_PLAYER = PLAYER * 64;

async function fixture({
  node = 0,
  player = PLAYER,
  owner = DEAD,
  change = () => {},
} = {}) {
  const graph = {
    version: 2,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id + 1,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  const template = {
    player_faction: player,
    generals: Array.from({ length: 128 }, (_, idx) => ({
      idx,
      name: `G${idx}`,
      attr: 0x80,
      active: true,
      faction: owner,
      origFaction: null,
      status: 1,
      battle_rating: 0,
      talk_idx: 0,
    })),
    legions: [],
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: node,
      n_legions: 0,
      n_generals: 99,
      monarch_idx: 127,
      reserve_cav: 0,
      reserve_arc: 0,
      reserve_inf: 0,
      active: true,
      attr: 0x80,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 0,
      strategic_city_primary: null,
      strategic_city_secondary: null,
    })),
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: owner,
      attr: 0x80,
      type: 1,
      prod: 100,
      governor: null,
      _aiCooldown: 0,
      _strategicLastFaction: owner,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "extinction-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  for (const c of raw.cities) c._strategicLastFaction = owner;
  raw.nativeFateDisplayFlags = 0;
  for (const f of raw.factions) f.nativeGeneralCount = 10;
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.legions = [];
  change(raw, graph);
  if (raw.nativeLegionSlots) {
    for (const legion of raw.legions)
      raw.nativeLegionSlots.records[legion.slot] = legion;
    rebindNativeLegionViews(raw);
  }
  attachSyntheticNativeFactionSource(raw);
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
    },
    movementMemory: {
      version: 1,
      spans: [{ address: 3840, hex: "00".repeat(768) }],
    },
  };
  const urls = world.definition.assets,
    allowed = new Set([
      urls.terrain,
      urls.roadCost,
      urls.roadOffset,
      urls.roadGraph,
    ]);
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (url === urls.roadGraph ? graph : {}),
      arrayBuffer: async () => new Uint8Array(384 * 256).fill(0xba).buffer,
    };
  };
  let result;
  try {
    result = await prepareScenario(args);
  } finally {
    globalThis.fetch = old;
  }
  const sc = result.scenario,
    context = scenarioNativeRoadContext(sc);
  const rng = new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 });
  return { args, sc, context, rng };
}

function quietGenerals(sc, faction = PLAYER) {
  for (const general of sc.generals) {
    general.faction = faction;
    general.origFaction = null;
    general.status = 1;
  }
}

function liveCount(sc) {
  return sc.factions.filter((f) => f.idx < 22 && f.attr >= 0x80).length;
}

function extinctionError(promise) {
  return promise.then(
    () => assert.fail("extinction scan must stop"),
    (error) => {
      assert(error instanceof OriginalFateBoundaryError);
      return error;
    },
  );
}

// Dead faction 0..2 stay the only actives; the 22-slot tail is synthetic raw.
function baseExtinction(f) {
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
}

test("4FCE full scan with no diplomat stops at TALK36 with exact prefix", async () => {
  const f = await fixture({});
  baseExtinction(f);
  const before = liveCount(f.sc);
  f.sc.cities[5].faction = CAPTOR;
  f.sc.cities[5]._strategicLastFaction = DEAD;
  f.sc.cities[6].faction = DEAD;
  f.sc.cities[6]._strategicLastFaction = CAPTOR;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "5042");
  // 4FD9 prefix: dead F00 bit7 cleared, nothing else on the faction.
  assert.equal(f.sc.factions[DEAD].attr, 0);
  // 4FE8 D2A equivalence: live count drops by exactly one, no stored byte.
  assert.equal(liveCount(f.sc), before - 1);
  assert.equal(Object.hasOwn(f.sc, "d2a"), false);
  // 4236 ran before the TALK36 stop: paired owner/last entries normalize.
  assert.equal(f.sc.cities[5]._strategicLastFaction, CAPTOR);
  assert.equal(f.sc.cities[6]._strategicLastFaction, DEAD);
  assert.equal(f.sc.cities[7]._strategicLastFaction, PLAYER);
});

test("4FCE player-dead gate stops at 1CB1 after the F00 prefix", async () => {
  const f = await fixture({});
  f.sc.nativePlayerFactionPointer = DEAD * 64;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "4FE5");
  assert.equal(f.sc.factions[DEAD].attr, 0);
});

test("4FCE diplomat prefix exchanges F2A and clears G17 before TALK69", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].diplomat_idx = 9;
  f.sc.generals[9].status = 3;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "509E");
  assert.equal(f.sc.factions[DEAD].diplomat_idx, null);
  assert.equal(f.sc.generals[9].status, 0);
  // Scan never reached the city sweep past the diplomat message.
  assert.equal(f.sc.cities[5]._strategicLastFaction, PLAYER);
});

test("4FCE 50D7 branch returns an origin general without messages", async () => {
  const f = await fixture({});
  baseExtinction(f);
  const before = f.sc.factions[CAPTOR].nativeGeneralCount;
  f.sc.generals[4].faction = DEAD;
  f.sc.generals[4].origFaction = CAPTOR;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "5042");
  assert.equal(f.sc.generals[4].status, 0);
  assert.equal(f.sc.generals[4].origFaction, null);
  assert.equal(f.sc.generals[4].faction, CAPTOR);
  assert.equal(f.sc.factions[CAPTOR].nativeGeneralCount, before + 1);
});

function activeLegion(slot, generalIdx) {
  return {
    slot,
    generalIdx,
    status: 0xc0,
    faction: DEAD,
    x: 2,
    y: 10,
    roadEdgeOrNode: 0,
    targetNode: 0,
    targetCity: 0,
    commandState: 10,
    moveDelay: 1,
    movePeriod: 3,
    troops: 600,
    morale: 100,
    occupancyOffset: 1,
    occupancyRowParagraph: 240,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
  };
}

test("4FCE 50B4 branch scatters without any TALK path", async () => {
  const f = await fixture({
    change(raw) {
      raw.legions.push(activeLegion(11, 11));
    },
  });
  baseExtinction(f);
  f.sc.factions[DEAD].monarch_idx = 120;
  const beforeLegions = f.sc.factions[DEAD].n_legions;
  f.sc.generals[11].faction = DEAD;
  f.sc.generals[11].status = 1;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "5042");
  assert.equal(f.sc.generals[11].status, 0);
  assert.equal(f.sc.generals[11].faction, null);
  const record = f.sc.nativeLegionSlots.records.find((r) => r.slot === 11);
  assert.equal(record.status, 0);
  // 50B4 calls only 2BA8/7028: no 4689 F14 decrement (original behavior).
  assert.equal(f.sc.factions[DEAD].n_legions, beforeLegions);
});

test("4FCE monarch without origin chain is captured by 29C3", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].monarch_idx = 13;
  const before = f.sc.factions[DEAD].nativeGeneralCount;
  f.sc.generals[13].faction = DEAD;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "5042");
  assert.equal(f.sc.generals[13].status, 4);
  assert.equal(f.sc.generals[13].faction, CAPTOR);
  assert.equal(f.sc.generals[13].origFaction, DEAD);
  assert.equal(f.sc.factions[DEAD].nativeGeneralCount, before - 1);
});

test("4FCE 29C3 retirement path eliminates on dead old faction plus bit4", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].monarch_idx = 14;
  f.sc.generals[14].faction = DEAD;
  f.sc.generals[14].attr = 0x90;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "5042");
  assert.equal(f.sc.generals[14].attr, 0);
  assert.equal(f.sc.generals[14].faction, null);
  assert.equal(f.sc.generals[14].origFaction, null);
  assert.equal(f.sc.generals[14].status, 4);
});

test("4FCE 29C3 player-captor message stops with prefix kept", async () => {
  const f = await fixture({ player: CAPTOR });
  f.sc.nativePlayerFactionPointer = CAPTOR * 64;
  f.sc.factions[DEAD].diplomat_idx = null;
  f.sc.factions[DEAD].monarch_idx = 15;
  quietGenerals(f.sc, CAPTOR);
  f.sc.generals[15].faction = DEAD;
  f.sc.generals[15].origFaction = null;
  const error = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(error.instruction, "2A31");
  // 29C3 prefix ran: slot cleared, captive mark, captor/old exchange.
  assert.equal(f.sc.generals[15].status, 4);
  assert.equal(f.sc.generals[15].faction, CAPTOR);
  assert.equal(f.sc.generals[15].origFaction, DEAD);
});

test("4236 missing city +1A stays a fail-closed stop, never a zero fill", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.cities[0].faction = CAPTOR;
  delete f.sc.cities[0]._strategicLastFaction;
  const error = await extinctionError(
    (async () =>
      originalExtinctionCitySweep4236(
        createScenarioLegionFateIO(f.sc, f.context),
        DEAD,
        CAPTOR,
      ))(),
  );
  // The stop carries the exact failing instruction (424E, the +1A compare),
  // not a coarser leaf label.
  assert.equal(error.instruction, "424E");
  assert.match(error.message, /readCityLastByte/);
});

test("3669 merges the symmetric pair to min bit80 and honors neutral", () => {
  const cells = Array.from({ length: 24 }, () => Array(24).fill(0));
  const io = {
    readDiplomacyByte: (from, to) => cells[from][to],
    writeDiplomacyByte: (from, to, value) => {
      cells[from][to] = value;
    },
  };
  cells[5][0] = 0x05;
  cells[0][5] = 0x83;
  assert.equal(originalRelationMerge3669(io, 5, 0), "merged");
  assert.equal(cells[5][0], 0x85);
  assert.equal(cells[0][5], 0x85);
  assert.equal(originalRelationMerge3669(io, 0x18, 0), "neutral");
  assert.equal(originalRelationMerge3669(io, 4, 0x18), "neutral");
  assert.equal(cells[4][0], 0);
});

test("F19 sweep clears only the dead target on active factions", () => {
  const factions = Array.from({ length: 22 }, () => ({
    attr: 0x80,
    target: 255,
  }));
  factions[3].target = DEAD;
  factions[4].attr = 0; // Inactive: skipped even with a dead target.
  factions[4].target = DEAD;
  factions[5].target = CAPTOR;
  const merged = [];
  const io = {
    readFactionByte: (owner, offset) =>
      offset === 0 ? factions[owner].attr : factions[owner].target,
    writeFactionByte: (owner, offset, value) => {
      assert.equal(offset, 0x19);
      factions[owner].target = value;
    },
    readDiplomacyByte: () => 0,
    writeDiplomacyByte: (from, to, value) => merged.push([from, to, value]),
  };
  assert.equal(originalExtinctionTargetSweep(io, DEAD), "swept");
  assert.equal(factions[3].target, 255);
  assert.equal(factions[4].target, DEAD);
  assert.equal(factions[5].target, CAPTOR);
  assert.deepEqual(merged, [
    [3, 0, 0x80],
    [0, 3, 0x80],
  ]);
});

test("captureOriginalCity wires the extinction scan past 4D1E", async () => {
  const f = await fixture({});
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  f.sc.factions[DEAD].capital = 7;
  const oldCities = f.sc.factions[DEAD].n_cities;
  const error = await extinctionError(
    (async () =>
      captureOriginalCity(f.sc, city, CAPTOR, () => {}, (deadOwner, captor) =>
        performScenarioExtinction4FCE(f.sc, deadOwner, captor, f.context),
      ))(),
  );
  assert.equal(error.instruction, "5042");
  // 4CF3..4D1E prefix kept: owner exchanged, old F23 decremented.
  assert.equal(city.faction, CAPTOR);
  // 4CF8 wrote DEAD, then the scan-internal 4236 normalized last to the owner.
  assert.equal(city._strategicLastFaction, CAPTOR);
  assert.equal(f.sc.factions[DEAD].n_cities, (oldCities - 1) & 255);
  assert.equal(f.sc.factions[DEAD].attr & 0x80, 0);
  // The scan stopped before 4D2A: no new-owner F23 increment yet.
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
});

test("performScenarioLegionFate entries still dispatch beside the scan", async () => {
  const f = await fixture({
    change(raw) {
      raw.legions.push(activeLegion(21, 21));
    },
  });
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  const record = f.sc.nativeLegionSlots.records.find((r) => r.slot === 21);
  assert.equal(
    performScenarioLegionFate(f.sc, record, f.context, "2BA8"),
    undefined,
  );
  assert.equal(record.status & 0x10, 0);
});

test("AfterTalk36 resume entry rejects a bad dead owner before any IO", () => {
  let touched = 0;
  const io = {
    readFactionByte: () => {
      touched++;
      return 0;
    },
    writeFactionByte: () => {
      touched++;
    },
    readDiplomacyByte: () => {
      touched++;
      return 0;
    },
    writeDiplomacyByte: () => {
      touched++;
    },
  };
  // 5051 mov ch,al takes an already-validated dead index; the Web guards the
  // entry the same way the sweep does, before the first 5055 faction read.
  assert.throws(
    () => originalExtinctionAfterTalk36(io, 99),
    (error) =>
      error instanceof OriginalFateBoundaryError &&
      error.instruction === "504D",
  );
  assert.equal(touched, 0);
});

test("AfterTalk36 resume runs the F19 sweep and returns to 4D1E", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[CAPTOR].attr = 0x80;
  f.sc.factions[CAPTOR].target_faction = DEAD;
  f.sc.factions[PLAYER].attr = 0x80;
  f.sc.factions[PLAYER].target_faction = DEAD;
  writeNativeDiplomacyAt(f.sc, PLAYER, 0, 0x05, "test");
  writeNativeDiplomacyAt(f.sc, 0, PLAYER, 0x83, "test");
  const stopped = await extinctionError(
    (async () => performScenarioExtinction4FCE(f.sc, DEAD, CAPTOR, f.context))(),
  );
  assert.equal(stopped.instruction, "5042");
  const liveAfterScan = liveCount(f.sc);
  // Production fires the resume on the TALK36 FIFO close (P54-C09-1); here
  // the test drives the wired resume entry directly after the pinned stop.
  const resumed = performScenarioExtinctionAfterTalk36(
    f.sc,
    DEAD,
    f.context,
  );
  // 506F..5073 epilogue + ret: normal return to the unique caller 4D1E+3.
  assert.equal(resumed, "returned-to-4D1E");
  // 504E..506D inline loop: dead targets cleared (FF writes back to null),
  // rows/columns merged to min bit80, exactly like the standalone sweep.
  assert.equal(f.sc.factions[CAPTOR].target_faction, null);
  assert.equal(f.sc.factions[PLAYER].target_faction, null);
  assert.equal(nativeDiplomacyAt(f.sc, PLAYER, 0, "test"), 0x85);
  assert.equal(nativeDiplomacyAt(f.sc, 0, PLAYER, "test"), 0x85);
  // The resume settles no counts: F00/D2A effects belong to the scan prefix.
  assert.equal(liveCount(f.sc), liveAfterScan);
  assert.equal(Object.hasOwn(f.sc, "d2a"), false);
});

test("captureOriginalCity continues past 4D1E once the scan returns", async () => {
  const f = await fixture({});
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.factions[DEAD].capital = 7;
  const oldCities = f.sc.factions[DEAD].n_cities;
  // The stub drives the resume entry manually inside the scan callback and
  // returns, which is exactly the 4FCE ret-to-4D1E+3 boundary the caller
  // falls through (production instead suspends at 5042 and resumes on the
  // TALK36 FIFO close; see the suspension tests below).
  const result = captureOriginalCity(f.sc, city, CAPTOR, () => {}, (deadOwner, captor) => {
    try {
      performScenarioExtinction4FCE(f.sc, deadOwner, captor, f.context);
    } catch (error) {
      assert(error instanceof OriginalFateBoundaryError);
      assert.equal(error.instruction, "5042");
      return performScenarioExtinctionAfterTalk36(f.sc, deadOwner, f.context);
    }
    assert.fail("extinction scan must stop at 5042");
  });
  assert.equal(result, "captured-4D62"); // 4D62 RET after 4D2A/8A1E/88CC/4D33.
  assert.equal(city.faction, CAPTOR);
  assert.equal(f.sc.factions[DEAD].n_cities, (oldCities - 1) & 255);
  // 4D2A runs now that 4FCE returned: the captor F23 increments.
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
});

test("captureOriginalCity suspends at 5042 and defers the 4D2A tail", async () => {
  const f = await fixture({});
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[CAPTOR].target_faction = DEAD;
  const oldCities = f.sc.factions[DEAD].n_cities;
  let blocked = null;
  const result = captureOriginalCity(
    f.sc,
    city,
    CAPTOR,
    () => {},
    (deadOwner, captor) =>
      performScenarioExtinction4FCE(f.sc, deadOwner, captor, f.context),
    (deadOwner, captor, captureTail) => {
      blocked = { deadOwner, captor, captureTail };
    },
  );
  assert.equal(result, "extinction-suspended");
  assert.deepEqual(
    { deadOwner: blocked.deadOwner, captor: blocked.captor },
    { deadOwner: DEAD, captor: CAPTOR },
  );
  // 4CF3..4D1E prefix kept, but the 4D2A tail has not run yet.
  assert.equal(city.faction, CAPTOR);
  assert.equal(f.sc.factions[DEAD].n_cities, (oldCities - 1) & 255);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  assert.equal(f.sc.factions[CAPTOR].target_faction, DEAD);
  // TALK36 close: the 504D..5073 resume runs first, then the deferred tail
  // (5073 ret to 4D1E+3).
  assert.equal(
    performScenarioExtinctionAfterTalk36(f.sc, DEAD, f.context),
    "returned-to-4D1E",
  );
  assert.equal(blocked.captureTail(), "captured-4D62");
  assert.equal(f.sc.factions[CAPTOR].target_faction, null);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
});

test("captureOriginalCity without a block handler keeps the 5042 hold", async () => {
  const f = await fixture({});
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  f.sc.factions[DEAD].capital = 7;
  const error = await extinctionError(
    (async () =>
      captureOriginalCity(f.sc, city, CAPTOR, () => {}, (deadOwner, captor) =>
        performScenarioExtinction4FCE(f.sc, deadOwner, captor, f.context),
      ))(),
  );
  assert.equal(error.instruction, "5042");
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
});

test("captureOriginalCity propagates non-5042 stops past a block handler", async () => {
  const f = await fixture({});
  // The dead faction still holds other cities here, so the 4DF0 capital
  // relocation hits its 4E3A message stop before 4D1E: a non-5042 boundary
  // must propagate even with a block handler installed (only the TALK36
  // gate itself is suspendable).
  f.sc.nativePlayerFactionPointer = DEAD * 64;
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[DEAD].diplomat_idx = null;
  let blocked = false;
  const error = await extinctionError(
    (async () =>
      captureOriginalCity(
        f.sc,
        city,
        CAPTOR,
        () => {},
        (deadOwner, captor) =>
          performScenarioExtinction4FCE(f.sc, deadOwner, captor, f.context),
        () => {
          blocked = true;
        },
      ))(),
  );
  assert.equal(error.instruction, "4E3A");
  assert.equal(blocked, false);
});

test("production applyBattleResult suspends TALK36 and resumes on close", async () => {
  const f = await fixture({
    change(raw) {
      const attacker = activeLegion(31, 31);
      attacker.faction = CAPTOR;
      raw.legions.push(attacker);
    },
  });
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[CAPTOR].attr = 0x80;
  f.sc.factions[CAPTOR].target_faction = DEAD;
  const messages = [];
  const app = {
    scenario: f.sc,
    originalRng: f.rng,
    gamebar: { enqueueTalkMessage: (m) => messages.push(m) },
  };
  const attacker =
    f.sc.nativeLegionSlots.records.find((r) => r.slot === 31);
  const result = applyBattleResult(
    app,
    attacker,
    city,
    "atk",
    600,
    [100, 100, 100, 100, 100, 100],
    null,
    null,
    null,
    0,
    [],
    { defenders: [] },
  );
  assert.equal(result, "extinction-suspended");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 36);
  assert.equal(messages[0].kind, "faction-extinction");
  assert.deepEqual(
    (({ scenario: _s, captureTail: _t, context: _c, ...rest }) => rest)(
      app._nativeExtinctionContinuation,
    ),
    { deadOwner: DEAD, captor: CAPTOR },
  );
  // Suspended mid-extinction: the save gate holds with prefix kept.
  assert.equal(canSnapshotState(app), false);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  // TALK36 FIFO close: resume sweep first, then the deferred 4D2A tail.
  messages[0].onClose();
  assert.equal(app._nativeExtinctionContinuation, null);
  assert.equal(f.sc.factions[CAPTOR].target_faction, null);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
  assert.equal(canSnapshotState(app), true);
  // A second close is a no-op: the tail must not run twice.
  messages[0].onClose();
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
});

test("resumeNativeExtinction rejects a foreign scenario", async () => {
  const f = await fixture({});
  const app = {
    scenario: { factions: [] },
    _nativeExtinctionContinuation: {
      scenario: f.sc,
      deadOwner: DEAD,
      captor: CAPTOR,
      context: f.context,
      captureTail: null,
    },
  };
  assert.equal(resumeNativeExtinction({}), false);
  assert.throws(() => resumeNativeExtinction(app), /scenario mismatch/);
  assert.notEqual(app._nativeExtinctionContinuation, null);
});

// P55-C09-2b: diplomat suspend unit. The 5074 prefix (F2A xchg + G17 clear)
// commits, the scan stops before the 4236 sweep, and the recorded tail runs
// the rest on demand, ending at the 5042 gate.
test("4FCE diplomat suspend defers the 4236/127 rest to the tail", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].diplomat_idx = 9;
  f.sc.generals[9].status = 3;
  f.sc.cities[5].faction = CAPTOR;
  f.sc.cities[5]._strategicLastFaction = DEAD;
  let suspended = null;
  const result = performScenarioExtinction4FCE(
    f.sc,
    DEAD,
    CAPTOR,
    f.context,
    (deadOwner, diplomat, diplomatTail) => {
      suspended = { deadOwner, diplomat, diplomatTail };
    },
  );
  assert.equal(result, "diplomat-suspended");
  assert.deepEqual(
    { deadOwner: suspended.deadOwner, diplomat: suspended.diplomat },
    { deadOwner: DEAD, diplomat: 9 },
  );
  assert.equal(typeof suspended.diplomatTail, "function");
  // 5082/5091 prefix kept; the 4236 sweep has not run yet.
  assert.equal(f.sc.factions[DEAD].diplomat_idx, null);
  assert.equal(f.sc.generals[9].status, 0);
  assert.equal(f.sc.cities[5]._strategicLastFaction, DEAD);
  const tailError = await extinctionError(
    (async () => suspended.diplomatTail())(),
  );
  assert.equal(tailError.instruction, "5042");
  // The tail ran 4236 before reaching the TALK36 gate.
  assert.equal(f.sc.cities[5]._strategicLastFaction, CAPTOR);
});

// P55-C09-2a: governor suspend unit (non-extinction completion). The 4D6F
// XCHG + 4D7E G17 clear commit, the 4D0A DEC waits for the tail, and the
// tail runs the 4D2A inline path when 4DF0 finds a new capital.
test("captureOriginalCity suspends the governor report before the 4D0A DEC", async () => {
  const f = await fixture({});
  baseExtinction(f);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = 9;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.generals[9].status = 3;
  // A second DEAD city lets 4DF0 relocate the capital: no extinction.
  f.sc.cities[8].faction = DEAD;
  f.sc.cities[8]._strategicLastFaction = DEAD;
  f.sc.factions[DEAD].capital = 7;
  const oldCities = f.sc.factions[DEAD].n_cities;
  let suspended = null;
  const result = captureOriginalCity(
    f.sc,
    city,
    CAPTOR,
    () => {},
    undefined,
    undefined,
    {
      onGovernorBlock: (governorCtx, governorTail) => {
        suspended = { governorCtx, governorTail };
      },
    },
  );
  assert.equal(result, "governor-suspended");
  assert.deepEqual(suspended.governorCtx, { governor: 9, cityIdx: 7 });
  assert.equal(typeof suspended.governorTail, "function");
  // 4D6F/4D7E prefix kept; the 4D0A DEC has not run yet.
  assert.equal(city.governor, null);
  assert.equal(f.sc.generals[9].status, 0);
  assert.equal(f.sc.factions[DEAD].n_cities, oldCities);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  assert.equal(suspended.governorTail(), "captured-4D62");
  assert.equal(f.sc.factions[DEAD].n_cities, (oldCities - 1) & 255);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
});

test("captureOriginalCity without a governor handler keeps the 4D86 hold", async () => {
  const f = await fixture({});
  baseExtinction(f);
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = 9;
  f.sc.generals[9].status = 3;
  const error = await extinctionError(
    (async () => captureOriginalCity(f.sc, city, CAPTOR, () => {}))(),
  );
  assert.equal(error.instruction, "4D86");
  // Prefix kept, DEC not run.
  assert.equal(city.governor, null);
  assert.equal(f.sc.generals[9].status, 0);
});

// P55-C09-2c: the 4FD9..4FDC gate commits F00 on both paths and reports
// the player-dead branch without running any scan.
test("extinction player gate commits F00 and reports the 4FE5 branch", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].attr = 0x80;
  f.sc.nativePlayerFactionPointer = DEAD * 64;
  assert.equal(performScenarioExtinctionPlayerGate(f.sc, DEAD, f.context), true);
  assert.equal(f.sc.factions[DEAD].attr, 0);
  const g = await fixture({});
  baseExtinction(g);
  g.sc.factions[DEAD].attr = 0x80;
  assert.equal(
    performScenarioExtinctionPlayerGate(g.sc, DEAD, g.context),
    false,
  );
  assert.equal(g.sc.factions[DEAD].attr, 0);
});

test("production applyBattleResult routes player extinction to defeat", async () => {
  const f = await fixture({
    player: DEAD,
    change(raw) {
      const attacker = activeLegion(31, 31);
      attacker.faction = CAPTOR;
      raw.legions.push(attacker);
    },
  });
  f.sc.nativePlayerFactionPointer = DEAD * 64;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc, CAPTOR);
  for (const city of f.sc.cities) {
    city.faction = CAPTOR;
    city._strategicLastFaction = CAPTOR;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[DEAD].attr = 0x80;
  const shows = [];
  const app = {
    scenario: f.sc,
    originalRng: f.rng,
    gamebar: { enqueueTalkMessage: () => assert.fail("no messages on exit") },
    endView: { show: (m) => shows.push(m) },
  };
  const attacker = f.sc.nativeLegionSlots.records.find((r) => r.slot === 31);
  const result = applyBattleResult(
    app,
    attacker,
    city,
    "atk",
    600,
    [100, 100, 100, 100, 100, 100],
    null,
    null,
    null,
    0,
    [],
    { defenders: [] },
  );
  assert.equal(result, "player-defeated");
  // 1CB1: no scan, no 4D2A tail, no TALK — F00 kept, captor count untouched.
  assert.equal(f.sc.factions[DEAD].attr, 0);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  assert.equal(shows.length, 1);
  assert.equal(shows[0].img, "grf/gameover.png");
});

// P55-C09-2b end to end: TALK69+1A7 suspend, then the tail chains the
// TALK36 suspend, then the close runs the sweep + deferred 4D2A tail.
test("production applyBattleResult chains diplomat into TALK36", async () => {
  const f = await fixture({
    change(raw) {
      const attacker = activeLegion(31, 31);
      attacker.faction = CAPTOR;
      raw.legions.push(attacker);
    },
  });
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = 9;
  f.sc.generals[9].status = 3;
  quietGenerals(f.sc);
  f.sc.generals[9].status = 3;
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = null;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[CAPTOR].attr = 0x80;
  f.sc.factions[CAPTOR].target_faction = DEAD;
  const messages = [];
  const app = {
    scenario: f.sc,
    originalRng: f.rng,
    gamebar: { enqueueTalkMessage: (m) => messages.push(m) },
  };
  const attacker = f.sc.nativeLegionSlots.records.find((r) => r.slot === 31);
  const result = applyBattleResult(
    app,
    attacker,
    city,
    "atk",
    600,
    [100, 100, 100, 100, 100, 100],
    null,
    null,
    null,
    0,
    [],
    { defenders: [] },
  );
  assert.equal(result, "diplomat-suspended");
  assert.equal(messages.length, 1);
  // One gamebar call pumps TALK69 + the 1A7 personality as a sequence;
  // the mock records the pre-split call carrying onComplete.
  assert.equal(messages[0].talkIndex, 69);
  assert.equal(messages[0].personalitySelector, 0x1a7);
  assert.equal(messages[0].kind, "extinction-diplomat-report");
  assert.equal(typeof messages[0].onComplete, "function");
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  assert.equal(canSnapshotState(app), false);
  // Sequence close: the diplomat tail ends at 5042 and chains TALK36.
  assert.equal(messages[0].onComplete(), true);
  assert.equal(app._nativeDiplomatContinuation, null);
  assert.notEqual(app._nativeExtinctionContinuation, null);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].talkIndex, 36);
  assert.equal(canSnapshotState(app), false);
  // TALK36 close: sweep first, then the deferred 4D2A tail.
  messages[1].onClose();
  assert.equal(app._nativeExtinctionContinuation, null);
  assert.equal(f.sc.factions[CAPTOR].target_faction, null);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
  assert.equal(canSnapshotState(app), true);
});

// P55-C09-2a end to end: TALK68+1A6 suspend, then the governor tail runs
// the extinction scan, which chains TALK36 on its 5042 gate.
test("production applyBattleResult chains governor into TALK36", async () => {
  const f = await fixture({
    change(raw) {
      const attacker = activeLegion(31, 31);
      attacker.faction = CAPTOR;
      raw.legions.push(attacker);
    },
  });
  f.sc.nativePlayerFactionPointer = CFD_PLAYER;
  f.sc.factions[DEAD].diplomat_idx = null;
  quietGenerals(f.sc);
  for (const city of f.sc.cities) {
    city.faction = PLAYER;
    city._strategicLastFaction = PLAYER;
  }
  const city = f.sc.cities[7];
  city.faction = DEAD;
  city.governor = 9;
  city.strategicNeighbours = [255, 255, 255, 255];
  f.sc.generals[9].status = 3;
  f.sc.factions[DEAD].capital = 7;
  f.sc.factions[CAPTOR].attr = 0x80;
  f.sc.factions[CAPTOR].target_faction = DEAD;
  const messages = [];
  const app = {
    scenario: f.sc,
    originalRng: f.rng,
    gamebar: { enqueueTalkMessage: (m) => messages.push(m) },
  };
  const attacker = f.sc.nativeLegionSlots.records.find((r) => r.slot === 31);
  const result = applyBattleResult(
    app,
    attacker,
    city,
    "atk",
    600,
    [100, 100, 100, 100, 100, 100],
    null,
    null,
    null,
    0,
    [],
    { defenders: [] },
  );
  assert.equal(result, "governor-suspended");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 68);
  assert.equal(messages[0].personalitySelector, 0x1a6);
  assert.equal(messages[0].kind, "extinction-governor-report");
  assert.equal(typeof messages[0].onComplete, "function");
  // 4D0A DEC waits for the tail.
  assert.equal(f.sc.factions[CAPTOR].n_cities, 0);
  assert.equal(canSnapshotState(app), false);
  // Sequence close: the governor tail runs into the scan's 5042 gate and
  // chains the TALK36 suspend through its own continuation.
  assert.equal(messages[0].onComplete(), "extinction-suspended");
  assert.equal(app._nativeGovernorContinuation, null);
  assert.notEqual(app._nativeExtinctionContinuation, null);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].talkIndex, 36);
  messages[1].onClose();
  assert.equal(app._nativeExtinctionContinuation, null);
  assert.equal(f.sc.factions[CAPTOR].n_cities, 1);
  assert.equal(canSnapshotState(app), true);
});

test("diplomat and governor resumes guard foreign scenarios", async () => {
  const f = await fixture({});
  assert.equal(resumeNativeDiplomatReport({}), false);
  assert.equal(resumeNativeGovernorReport({}), false);
  const app = {
    scenario: { factions: [] },
    _nativeDiplomatContinuation: { scenario: f.sc },
    _nativeGovernorContinuation: { scenario: f.sc },
  };
  assert.throws(() => resumeNativeDiplomatReport(app), /scenario mismatch/);
  assert.throws(() => resumeNativeGovernorReport(app), /scenario mismatch/);
  assert.notEqual(app._nativeDiplomatContinuation, null);
  assert.notEqual(app._nativeGovernorContinuation, null);
});

// P55-C09-2d: the detached factory routes gates through caller blocks;
// without blocks every gate keeps its historic hold.
test("detached extinction scan threads blocks with hooks captureTail", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.factions[DEAD].diplomat_idx = 9;
  f.sc.generals[9].status = 3;
  const captureTail = () => "captured-4D62";
  let routed = null;
  const blocks = {
    onDiplomatBlock: (deadOwner, diplomat, diplomatTail, tail) => {
      routed = { deadOwner, diplomat, diplomatTail, tail };
    },
    onPlayerDead: () => assert.fail("no player defeat on this path"),
  };
  const scan = createDetachedExtinctionScan(f.sc, f.context, blocks);
  assert.equal(scan(DEAD, CAPTOR, { captureTail }), "diplomat-suspended");
  assert.deepEqual(
    { deadOwner: routed.deadOwner, diplomat: routed.diplomat },
    { deadOwner: DEAD, diplomat: 9 },
  );
  assert.equal(typeof routed.diplomatTail, "function");
  assert.equal(routed.tail, captureTail);
  // Without blocks the same scan keeps the historic 509E hold (fresh sc:
  // the first scan already committed the F2A clear on f).
  const g = await fixture({});
  baseExtinction(g);
  g.sc.factions[DEAD].diplomat_idx = 9;
  g.sc.generals[9].status = 3;
  const bare = createDetachedExtinctionScan(g.sc, g.context, undefined);
  const error = await extinctionError(
    (async () => bare(DEAD, CAPTOR, { captureTail }))(),
  );
  assert.equal(error.instruction, "509E");
});

test("detached extinction scan routes player defeat only with blocks", async () => {
  const f = await fixture({});
  baseExtinction(f);
  f.sc.nativePlayerFactionPointer = DEAD * 64;
  let defeated = null;
  const scan = createDetachedExtinctionScan(f.sc, f.context, {
    onPlayerDead: (deadOwner) => {
      defeated = deadOwner;
    },
  });
  assert.equal(scan(DEAD, CAPTOR, {}), "player-defeated");
  assert.equal(defeated, DEAD);
  assert.equal(f.sc.factions[DEAD].attr, 0);
  const bare = createDetachedExtinctionScan(f.sc, f.context, undefined);
  const g = await fixture({});
  baseExtinction(g);
  g.sc.nativePlayerFactionPointer = DEAD * 64;
  const error = await extinctionError((async () => bare(DEAD, CAPTOR, {}))());
  assert.equal(error.instruction, "4FE5");
});
