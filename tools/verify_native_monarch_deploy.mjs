// P43: KI 6A03 出陣提交体 — 6E8F 君主编成 + CF 门 + [DI]&=0xFB + 5E80 显示分界。
// I/O: assembled scenario only (prepareScenario + scenarioNativeRoadContext);
// pure memory, no saves touched. Static KI goldens: re-war-proposal SKILL §6
// (699E/6A03 窗，capstone 现刷） + 行军 §3.15（6E8F 体）。
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
import {
  initializeNativeLegionSlotsFromZeroChapter,
  nativeLegionAt,
} from "../web/src/game/nativelegions.js";
import { isLegionDelegated } from "../web/src/game/legionmode.js";
import { commitOriginalMonarchDeploy } from "../web/src/game/navigation/originalformation.js";
import { performScenarioMonarchDeployCommit } from "../web/src/game/navigation/scenariomonarchdeploy.js";

const MONARCH = 5;
const FACTION = 0;
const CAPITAL = 0;

async function fixture({ pools = [600, 600, 600] } = {}) {
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
    player_faction: 0,
    legions: [],
    generals: Array.from({ length: 128 }, (_, idx) => ({
      idx,
      name: `G${idx}`,
      faction: idx === MONARCH ? FACTION : 1,
      status: 0,
      ability: { force: 50 },
    })),
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: CAPITAL,
      n_legions: 0,
      target_faction: 2,
      active: true,
      attr: 0x80,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 51,
      reserve_cav: idx === FACTION ? pools[0] : 100,
      reserve_arc: idx === FACTION ? pools[1] : 100,
      reserve_inf: idx === FACTION ? pools[2] : 100,
      strategic_city_primary: null,
      strategic_city_secondary: null,
    })),
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: FACTION,
      attr: 0x80,
      governor: null,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
      strategicThreat: 0,
      growth: 50,
      defence: 50,
      troops_cap: 80,
      troops: 80,
      prod: 10000,
      disaster_event: 0,
      _aiCooldown: 0,
      _strategicLastFaction: FACTION,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    // P58 fresh v2 fixed 2459 inputs (explicit inactive synthetic slots).
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "monarch-deploy-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  attachSyntheticNativeFactionSource(raw);
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: null,
    movementMemory: {
      version: 1,
      spans: [{ address: 3840, hex: "00".repeat(768) }],
    },
    cityCache: { version: 1, spans: [{ address: 0, hex: "00".repeat(192) }] },
  };
  const urls = world.definition.assets;
  const allowed = new Set([
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
  let sc;
  try {
    sc = (await prepareScenario(args)).scenario;
  } finally {
    globalThis.fetch = old;
  }
  return { sc, context: scenarioNativeRoadContext(sc) };
}

const record = (f, slot = MONARCH) => nativeLegionAt(f.sc, slot, "test");
const poolsOf = (f) => [
  f.sc.factions[FACTION].reserve_cav,
  f.sc.factions[FACTION].reserve_arc,
  f.sc.factions[FACTION].reserve_inf,
];
// Capital city 0 is at (1, 10): plane row = 10 * 24, offset x = 1.
const planeByte = (f) => f.context.movement.readByte(240, 1);

test("6A03 success writes the commit set and clears bit2 (C4->C0)", async () => {
  const f = await fixture();
  assert.equal(record(f).status ?? 0, 0);
  const beforePools = poolsOf(f);
  assert.deepEqual(beforePools, [600, 600, 600]);
  const beforePlane = planeByte(f);
  const result = commitOriginalMonarchDeploy(f.sc, f.context, MONARCH);
  assert.equal(result.cf, false);
  assert.equal(result.slot, MONARCH);
  const legion = record(f);
  assert.equal(legion.generalIdx, MONARCH);
  // 6A08 [DI]&=0xFB: the 6E8F C4 has bit2 cleared, monarch leads personally.
  assert.equal(legion.status, 0xc0);
  assert.equal(isLegionDelegated(legion), false);
  // 6E8F write set: F14 INC (fresh slot), capital target, L23=1, morale cap.
  assert.equal(f.sc.factions[FACTION].n_legions, 1);
  assert.equal(legion.targetCity, CAPITAL);
  assert.equal(legion.commandState, 1);
  assert.equal(legion.morale, 200);
  assert.equal(f.sc.generals[MONARCH].status, 1);
  // 6F86 occupancy INC on the capital cell.
  assert.equal(planeByte(f), (beforePlane + 1) & 255);
  // 461D/4698 redistribution: six teams of 100 (tens), pools drained to 400.
  assert.equal(legion.troops, 600);
  assert.deepEqual(poolsOf(f), [400, 400, 400]);
});

test("6A03 success via the scenario wrapper binds the same slot", async () => {
  const f = await fixture();
  const result = performScenarioMonarchDeployCommit(f.sc, MONARCH);
  assert.equal(result.cf, false);
  assert.equal(result.slot, MONARCH);
  assert.equal(record(f).status, 0xc0);
});

test("6E8F refuse (CF) keeps partial writes, no clear, no counters", async () => {
  const f = await fixture({ pools: [0, 0, 0] });
  const result = commitOriginalMonarchDeploy(f.sc, f.context, MONARCH);
  // 6A06 jb 6A10: refuse. Pools untouched (6EC9 only probes stack copies),
  // F14 untouched (6F26 never ran), general untouched.
  assert.equal(result.cf, true);
  assert.deepEqual(poolsOf(f), [0, 0, 0]);
  assert.equal(f.sc.factions[FACTION].n_legions, 0);
  assert.equal(f.sc.generals[MONARCH].status, 0);
  const legion = record(f);
  assert.equal(legion.generalIdx, MONARCH);
  assert.notEqual(legion.status, 0xc0);
});

test("same-slot reuse skips the F14 INC", async () => {
  const f = await fixture();
  record(f).status = 0xc0;
  const result = commitOriginalMonarchDeploy(f.sc, f.context, MONARCH);
  assert.equal(result.cf, false);
  assert.equal(f.sc.factions[FACTION].n_legions, 0);
  assert.equal(record(f).status, 0xc0);
});

test("monarch index gate fail-closed", async () => {
  const f = await fixture();
  for (const bad of [127, 128, 200, -1]) {
    assert.throws(
      () => commitOriginalMonarchDeploy(f.sc, f.context, bad),
      /Uncovered/,
      `index ${bad}`,
    );
  }
  f.sc.generals[6] = undefined;
  assert.throws(
    () => commitOriginalMonarchDeploy(f.sc, f.context, 6),
    /Uncovered/,
  );
});

test("scenario wrapper fail-closed without road context or bad index", async () => {
  assert.throws(
    () => performScenarioMonarchDeployCommit({}, MONARCH),
    /Uncovered/,
  );
  const f = await fixture();
  assert.throws(
    () => performScenarioMonarchDeployCommit(f.sc, 200),
    /Uncovered/,
  );
});
