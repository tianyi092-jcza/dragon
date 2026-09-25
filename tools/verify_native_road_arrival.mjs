// I/O: all fixtures synthetic; four explicitly mocked asset URLs, no forwarding.
// KI static goldens 2662/28F4/4300/4325..4574/3F06..3F50; march §3.13.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
  readSavedAssembly,
  assertPlayableScenario,
} from "../web/src/game/scenarioassembly.js";
import {
  snapshotState,
  restoreSnapshotState,
  canSnapshotState,
} from "../web/src/game/savegame.js";
import {
  stepTo,
  aiTick,
  tickStrategicCity,
  continueLegionAfterBattle,
  buildArmies,
  settleLegionDaily,
} from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { arriveOriginalRoad } from "../web/src/game/navigation/originalroadarrival.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
const json = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error("synthetic fixture JSON round-trip failed", {
      cause: error,
    });
  }
};
async function fixture({
  node = 66,
  command = 5,
  player = 0,
  owner = 0,
  cache = [],
  movement = true,
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
  graph.nodes[0].edgeSlots[0] = 0x4800;
  graph.nodes[1].edgeSlots[0] = 0x8800;
  graph.edges.push({
    id: 0,
    source: 0,
    target: 1,
    weight: 1,
    bounds: { minX: 1, maxX: 2, minY: 11, maxY: 11 },
    points: [
      { x: 1, y: 11, flags: 0x44 },
      { x: 2, y: 11, flags: 4 },
    ],
  });
  const template = {
    player_faction: player,
    generals: [],
    legions: [],
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: node,
      n_legions: 0,
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
      id: "arrival-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  for (const c of raw.cities) c._strategicLastFaction = owner;
  // Explicit synthetic inactive 2459 slots, not inferred original initialization.
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      status: 0xc0,
      faction: owner,
      x: node + 1,
      y: 10,
      roadEdgeOrNode: node * 8,
      targetNode: node,
      targetCity: node,
      commandState: command,
      moveDelay: 1,
      movePeriod: 3,
      troops: 600,
      morale: 100,
      _markerFrame: 1,
      occupancyOffset: node + 1,
      occupancyRowParagraph: 240,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    },
  ];
  raw.factions[owner].n_legions = 1;
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
    // Explicit synthetic rules terrain, independent from the fetched resource.
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
    },
    ...(cache === null ? {} : { cityCache: { version: 1, spans: cache } }),
    ...(movement
      ? {
          movementMemory: {
            version: 1,
            spans: [{ address: 3840, hex: "00".repeat(768) }],
          },
        }
      : {}),
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
    A = sc.legions[0],
    context = scenarioNativeRoadContext(sc);
  const rng = new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 });
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: rng,
    clock: { year: 190, month: 1, day: 1 },
  };
  return { args, sc, A, context, app };
}
const slot = (f, daily = false) =>
  aiTick(f.app, {
    legionBatchStart: 0,
    runCityDaily: false,
    settleDaily: daily,
  });
const go = (f) => stepTo(f.sc, f.A);
// P40：fresh v2 恒合成占格平面/C18 缓存；“旧档无能力”用删除 webMeta 键的
// restore 模拟（restored() 每次重新 snapshot，故需在 snapshot 后删键）。
async function restoredWithout(f, key) {
  const saved = json(snapshotState(f.app, 0, "arrival"));
  delete saved.webMeta[key];
  const result = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  return {
    ...f,
    sc: result.scenario,
    A: result.scenario.legions[0],
    context: scenarioNativeRoadContext(result.scenario),
    app: { ...f.app, scenario: result.scenario },
    saved,
  };
}

async function restored(f) {
  const saved = json(snapshotState(f.app, 0, "arrival"));
  const result = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  return {
    ...f,
    sc: result.scenario,
    A: result.scenario.legions[0],
    context: scenarioNativeRoadContext(result.scenario),
    app: { ...f.app, scenario: result.scenario },
    saved,
  };
}

test("2662 actual due-slot arrival ignores projections; one handler then daily/03/remaining slot, no occupancy", async () => {
  for (const projection of [false, true]) {
    const f = await fixture({
      command: 8,
      cache: null,
      change: (sc) => {
        sc.legions.push({ ...sc.legions[0], slot: 1, moveDelay: 8 });
        sc.legionSlotCounters[0] = 7;
      },
    });
    if (projection) {
      f.A._march = { currentNode: 0, targetNode: 191, points: [] };
      f.A.target = { x: 999, y: 999 };
    }
    f.A.status |= 0x20;
    f.A.moveDelay = 2;
    const plane = f.context.movement.snapshot();
    slot(f);
    assert.equal(f.A._markerFrame, 1);
    assert.equal(f.A.commandState, 8);
    assert.equal(f.A.moveDelay, 1);
    f.A.morale = 195;
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(f.A.commandState, 8);
    assert.equal(f.A.morale, 200);
    assert.equal(f.A._markerFrame, 4);
    assert.equal(f.A.moveDelay, 3);
    assert.equal(f.A.status & 0x20, 0);
    assert.equal(f.sc.legionSlotCounters[0], 0);
    assert.equal(f.sc.legions[1].moveDelay, 6);
    assert.equal(f.sc.factions[0].money, 962);
    assert.deepEqual(f.context.movement.snapshot(), plane);
    slot(f);
    slot(f);
    assert.equal(f.A.commandState, 8);
    slot(f);
    assert.equal(f.A.commandState, 1);
  }
});

test("28F4 current node/20 independent; CF clear still dispatches; 2912 and invalid table preserve marker", async () => {
  const f = await fixture({ node: 66, command: 8, cache: null });
  f.A.targetCity = 255;
  go(f);
  assert.equal(f.A.commandState, 8);
  f.sc.cities[66].faction = 1;
  f.A.morale = 200;
  go(f);
  assert.equal(f.A.commandState, 1); // AX!=BX CLC, still dispatch.
  const fail = await fixture({
    command: 8,
    change: (sc) => {
      sc.cities[66].faction = 1;
    },
  });
  // Fresh assembly now owns flags=0 (4D33 static); delete BEFORE the
  // fate tail runs to keep pinning the genuine absent-contract.
  delete fail.sc.nativeFateDisplayFlags;
  slot(fail, true);
  // Fresh assembly now owns flags=0 (4D33 static); delete BEFORE the
  // fate tail runs to keep pinning the genuine absent-contract.
  assert.match(
    fail.app._strategicBattleFailure.error.message,
    /nativeFateDisplayFlags/,
  );
  assert.equal(fail.A.status & 0x10, 0);
  assert.equal(fail.sc.factions[0].n_legions, 1);
  assert.equal(fail.A._markerFrame, 4);
  assert.equal(fail.sc.factions[0].money, 1000);
  assert.equal(canSnapshotState(fail.app), false);
  const invalid = await fixture({ command: 12 });
  assert.throws(() => go(invalid), /434F/);
  assert.equal(invalid.A._markerFrame, 4);
});

test("4325 player/NPC table all 12 states, targetFF unused by handlers7/8, exact callee boundaries", async () => {
  for (const npc of [false, true])
    for (let command = 0; command < 12; command++) {
      const handler = npc && command < 8 ? command + 4 : command;
      const f = await fixture({
        command,
        player: npc ? 1 : 0,
        cache: [
          { address: 0, hex: "00" },
          { address: 66, hex: "02" },
        ],
      });
      if (handler === 7 || handler === 8) f.A.targetCity = 255;
      if (handler === 9 || handler === 11) {
        delete f.sc.factions[0].reserve_inf;
        assert.throws(() => go(f), /pool 3 at 4735/);
      }
      if (handler === 11) {
        assert.equal(f.sc.factions[0].n_legions, 0); //4658 before4717.
        assert.equal(f.A.units[0].troops, 0); //4732 before unknown pool.
        assert.equal(f.A.status, 0xc0); //466F not reached.
      }
      if (handler !== 9 && handler !== 11) {
        go(f);
        assert.equal(
          f.A.commandState,
          handler <= 3
            ? 0
            : handler === 4
              ? 1
              : handler === 5
                ? command
                : handler === 6
                  ? command
                  : handler === 7
                    ? 8
                    : handler === 8
                      ? command
                      : 9,
          `${npc}/${command}`,
        );
      }
    }
});

test("4548 full word X/Y and 0E compare; always16,18,14 writes, capital uses player pointer", async () => {
  for (const mismatch of ["x", "y", "node", null]) {
    const f = await fixture({ command: 0 });
    f.A.troops = 599;
    if (mismatch === "x") f.A.x++;
    if (mismatch === "y") f.A.y += 256;
    if (mismatch === "node") {
      f.A.roadEdgeOrNode = 65 * 8;
      f.A.targetNode = 65;
    }
    const writes = [];
    for (const key of ["targetX", "targetY", "targetNode"]) {
      let v = f.A[key];
      Object.defineProperty(f.A, key, {
        get: () => v,
        set: (x) => {
          writes.push(key);
          v = x;
        },
        configurable: true,
      });
    }
    go(f);
    assert.deepEqual(writes, ["targetX", "targetY", "targetNode"]);
    assert.equal(f.A.targetX, 67);
    assert.equal(f.A.targetY, 10);
    assert.equal(f.A.targetNode, 66);
    assert.equal(f.A.commandState, mismatch ? 0 : 9);
  }
  const f = await fixture({ command: 0 });
  f.A.troops = 599;
  f.sc.factions[0].capital = 1;
  go(f);
  assert.equal(f.A.commandState, 0);
  const partial = await fixture({ command: 0 });
  Object.defineProperty(partial.A, "targetY", {
    set: () => {
      throw new Error("18-write");
    },
  });
  assert.throws(() => go(partial), /18-write/);
  assert.equal(partial.A.targetX, 67);
  assert.equal(partial.A.commandState, 0);
  const lazy = await fixture({ command: 4 });
  lazy.A.x++;
  delete lazy.sc.cities[66].attr;
  go(lazy);
  assert.equal(lazy.A.commandState, 4);
});

test("43AF gates, actual DI diplomacy/cache aliases, stale raw ignored, exactly canonical RNG", async () => {
  for (const total of [300, 301, 599, 600])
    for (const attr of [0, 0x40, 0x80, 0xc0]) {
      const f = await fixture({
        command: 5,
        cache: [{ address: 0, hex: "00" }],
      });
      f.A.troops = total;
      f.sc.cities[66].attr = attr;
      f.sc.cities[66].raw = Array(32).fill(255);
      const expected = new OriginalBattleRng().restore(
        f.app.originalRng.snapshot(),
      );
      const random = total > 300 && !(attr & 0x40) && attr < 0x80;
      const delay = random ? (expected.nextByte() & 7) + 1 : 3;
      slot(f);
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(
        f.A.commandState,
        total <= 300 ? 10 : attr & 0x40 ? 0 : random ? 2 : total < 600 ? 9 : 5,
      );
      assert.equal(f.A.moveDelay, delay);
      assert.deepEqual(f.app.originalRng.snapshot(), expected.snapshot());
    }
  const edge = await fixture({ command: 5 });
  edge.A.roadEdgeOrNode = 0x800;
  edge.A.targetNode = 256; // Existing target bridge is intentionally bounded.
  assert.throws(() => go(edge), /target node id/);
  for (const node of [3, 48, 66]) {
    const f = await fixture({
      node,
      command: 5,
      cache: node === 66 ? [{ address: 0, hex: "03" }] : null,
    });
    // node 3 → 势力[1]+0x38 奇数线性别名（43D3 k=0..47 全域已接）。
    if (node === 3) {
      const raw = f.sc.factions[1].raw;
      f.sc.factions[1].raw =
        raw.slice(0, 0x38 * 2) + "03" + raw.slice(0x38 * 2 + 2);
    }
    if (node === 48) f.sc.diplomacy[1][0] = 3;
    assert.throws(() => go(f), /canonical RNG at 43D9/);
    slot(f);
    assert.equal(f.A.commandState, 2);
  }
  // 偶数节点走势力 F18（live nativeGeneralCount）：node 2 → 势力[1]+0x18。
  const even = await fixture({ node: 2, command: 5 });
  even.sc.factions[1].nativeGeneralCount = 3;
  assert.throws(() => go(even), /canonical RNG at 43D9/);
  slot(even);
  assert.equal(even.A.commandState, 2);
  // F18 ≤ 2 时不耗 RNG，继续低兵首都重编检查（城66 attr=0 → 非首都 → 5）。
  const low = await fixture({ node: 2, command: 5 });
  low.sc.factions[1].nativeGeneralCount = 2;
  slot(low);
  assert.equal(low.A.commandState, 5);
  assert.equal(low.A.moveDelay, 3);
});

test("4300 ordered short circuits and interception BX/DI aliases never balance occupancy", async () => {
  for (const gate of ["cache", "marker", "attr"]) {
    const f = await fixture({
      node: 0,
      command: 0,
      player: 1,
      cache: [{ address: 0, hex: gate === "cache" ? "02" : "01" }],
    });
    f.A.targetNode = 1;
    f.A.targetCity = 1;
    if (gate === "cache") {
      delete f.A._markerFrame;
      delete f.sc.cities[0].attr;
    }
    if (gate === "marker") {
      f.A._markerFrame = 4;
      delete f.sc.cities[0].attr;
    }
    if (gate === "attr") f.sc.cities[0].attr = 0x7f;
    assert.equal(go(f), "moved");
    assert.equal(f.context.movement.readByte(240, 1), 255);
  }
  for (const node of [0, 3, 4, 5, 6, 64]) {
    const f = await fixture({
      node,
      command: 1,
      player: 1,
      cache: [{ address: node, hex: "01" }],
      change: (sc) => {
        sc.legions[0].targetNode = 191;
        sc.legions[0].targetCity = 191;
      },
    });
    const before = f.context.movement.snapshot();
    if (node === 0) {
      f.sc.cities[0].faction = 1;
      // Fresh assembly now owns flags=0; delete to pin the absent-contract.
      delete f.sc.nativeFateDisplayFlags;
      assert.throws(() => go(f), /nativeFateDisplayFlags/);
      assert.equal(f.sc.factions[0].n_legions, 1);
    } else if (node === 6)
      assert.throws(() => go(f), /original road state byte/);
    else {
      if (node === 64) {
        // 4300 拦截 STC 后以 bx=node*0x100 重入，DI=u16(bx*4)=0 回绕（notes：
        // city64 DI回绕0）→ 43D3 地址 0x18 = 势力[0] F18 线性别名。
        // F18=0 ≤2：不耗 RNG、不写 0x23（handler5 直返，命令字节保持 1）。
        slot(f);
        assert.equal(f.A.commandState, 1);
        assert.equal(f.app._strategicBattleFailure, undefined);
        // F18=3 >2：走 43D9 RNG → 状态 2。
        const forced = await fixture({
          node,
          command: 1,
          player: 1,
          cache: [{ address: node, hex: "01" }],
          change: (sc) => {
            sc.legions[0].targetNode = 191;
            sc.legions[0].targetCity = 191;
          },
        });
        forced.sc.factions[0].nativeGeneralCount = 3;
        const before64 = forced.context.movement.snapshot();
        slot(forced);
        assert.equal(forced.A.commandState, 2);
        assert.equal(forced.A.targetCity, node);
        assert.deepEqual(forced.context.movement.snapshot(), before64);
      } else {
        const alias = (node - 3) * 32 + 30;
        f.context.cityCache.writeByte(alias, 3);
        slot(f);
        assert.equal(f.A.commandState, 2);
        assert.equal(f.app._strategicBattleFailure, undefined);
      }
    }
    assert.equal(f.A.targetCity, node);
    assert.equal(f.A._markerFrame, 4);
    assert.deepEqual(f.context.movement.snapshot(), before);
  }
});

test("440F F17/F16 XCHG, fiscal skip, unchanged14, wrapDEC including equal order and missing final cache prefix", async () => {
  for (const cache of [0, 255, null])
    for (const same of [false, true]) {
      const f = await fixture({
        command: 6,
        cache:
          cache === null
            ? []
            : [{ address: 66, hex: cache.toString(16).padStart(2, "0") }],
      });
      f.sc.cities[66].attr = 0;
      f.sc.factions[0].strategic_city_secondary = same ? 66 : 67;
      if (cache === null) assert.throws(() => go(f), /city cache byte/);
      else go(f);
      assert.equal(f.sc.factions[0].strategic_city_secondary, 255);
      assert.equal(f.A.commandState, 0);
      assert.equal(f.A.targetCity, same ? 66 : 67);
      assert.equal(f.A.targetNode, 66);
      assert.equal(f.A.status & 2, same ? 0 : 2);
      if (cache !== null)
        assert.equal(f.context.cityCache.readByte(66), (cache - 1) & 255);
    }
  const f = await fixture({ command: 6, cache: [{ address: 66, hex: "00" }] });
  f.sc.cities[66].attr = 0;
  f.sc.factions[0].attr |= 0x40;
  delete f.sc.factions[0].strategic_city_secondary;
  f.sc.factions[0].strategic_city_primary = 0;
  go(f);
  assert.equal(f.A.targetCity, 0);
  assert.equal(f.A.targetNode, 66);
  const empty = await fixture({
    command: 6,
    cache: [{ address: 66, hex: "00" }],
  });
  empty.sc.cities[66].attr = 0;
  go(empty);
  assert.equal(empty.A.commandState, 11);
  assert.equal(empty.context.cityCache.readByte(66), 255);
  const lazy = await fixture({ command: 6, cache: null });
  lazy.sc.cities[66].attr = 0x40;
  delete lazy.sc.factions[0].attr;
  go(lazy);
  assert.equal(lazy.A.commandState, 1);
});

test("4470 sequential team byte not total/default;448C full byte;44A9/44D6 retain prefixes", async () => {
  const low = await fixture({ command: 7, cache: null });
  low.A.units = [{ troops: 290 }];
  low.A.targetCity = 255;
  go(low);
  assert.equal(low.A.commandState, 11);
  const missing = await fixture({ command: 7 });
  missing.A.units = [{ troops: 300 }];
  assert.throws(() => go(missing), /team 1/);
  assert.equal(missing.A.commandState, 7);
  for (const cap of [0, 255]) {
    const f = await fixture({ command: 8, cache: null });
    f.A.targetCity = 255;
    f.sc.factions[0].legion_morale_cap = cap;
    f.A.morale = 254;
    go(f);
    assert.equal(f.A.commandState, cap === 0 ? 1 : 8);
  }
  const ff = await fixture({ command: 10 });
  ff.sc.factions[0].capital = null;
  assert.throws(() => go(ff), /4549/);
  assert.equal(ff.A.targetCity, 255);
  assert.equal(ff.A.status & 2, 2);
  assert.equal(ff.A.targetNode, 66);
  const eleven = await fixture({ command: 11 });
  eleven.sc.factions[0].capital = 67;
  go(eleven);
  assert.equal(eleven.A.commandState, 11);
  assert.equal(eleven.A.targetNode, 67);
  assert.equal(eleven.A.x, 67);
  const done = await fixture({ command: 11 });
  delete done.sc.factions[0].reserve_inf;
  const before = done.context.movement.snapshot();
  assert.throws(() => go(done), /pool 3 at 4735/);
  assert.equal(done.A.targetX, 67);
  assert.equal(done.sc.factions[0].n_legions, 0);
  assert.equal(done.A.units[0].troops, 0);
  assert.equal(done.A.status, 0xc0);
  assert.deepEqual(done.context.movement.snapshot(), before);
});

test("3F06 prefix DEC before old owner, no city1A rewrite, neutral refresh and stale neighboring cache", async () => {
  for (const old of [undefined, -1]) {
    const f = await fixture({ cache: [] });
    f.sc.cities[66]._aiCooldown = 2;
    f.sc.cities[66]._strategicLastFaction = old;
    assert.throws(() => tickStrategicCity(f.app, 66), /3F11/);
    assert.equal(f.sc.cities[66]._aiCooldown, 1);
    assert.throws(() => f.context.cityCache.readByte(66), /Uncovered/);
  }
  // KI 3F11..3F29 has no range check (window 3EFD..3F2C re-verified):
  // old=0x18 stores cityIdx at DS:0617 = diplomacy row 0 col 23, no throw,
  // no city+0x1A rewrite. Official +0x1A domain {0x00..0x15,0x18} closed.
  {
    const f = await fixture({ cache: [{ address: 65, hex: "00fffe" }] });
    f.sc.cities[66]._aiCooldown = 2;
    f.sc.cities[66]._strategicLastFaction = 24;
    f.context.movement.writeByte(240, 67, 0x82);
    assert.equal(tickStrategicCity(f.app, 66), "returned");
    // 3F06 DEC 2→1, then the owned-city military scan finds no threat
    // (work[0]===255) and zeroes cooldown on its return path — pre-existing
    // 3F92-path semantics, unaffected by the 3F29 alias fix.
    assert.equal(f.sc.cities[66]._aiCooldown, 0);
    assert.equal(f.sc.cities[66]._strategicLastFaction, 24);
    assert.equal(f.sc.nativeDiplomacyMatrix.rows[0][23], 66);
    assert.equal(f.sc.diplomacy[0][23], 66);
    assert.equal(f.sc.factions[0].strategic_city_secondary, null);
    assert.equal(f.context.cityCache.readByte(66), 2);
  }
  const missing = await fixture();
  delete missing.sc.cities[66]._aiCooldown;
  assert.throws(() => tickStrategicCity(missing.app, 66), /3F06/);
  const f = await fixture({ cache: [{ address: 65, hex: "00fffe" }] });
  f.sc.cities[66].faction = null;
  f.sc.cities[66]._strategicLastFaction = 0;
  f.sc.cities[66]._aiCooldown = 3;
  f.context.movement.writeByte(240, 67, 0x82);
  assert.equal(tickStrategicCity(f.app, 66), "returned");
  assert.equal(f.sc.cities[66]._aiCooldown, 2);
  assert.equal(f.sc.cities[66]._strategicLastFaction, 0);
  assert.equal(f.sc.factions[0].strategic_city_secondary, 66);
  assert.equal(f.context.cityCache.readByte(66), 2);
  assert.equal(f.context.cityCache.readByte(65), 0);
  assert.equal(f.context.cityCache.readByte(67), 254);
  const noCache = await restoredWithout(
    await fixture({ cache: null }),
    "cityCache",
  );
  noCache.sc.cities[66]._aiCooldown = 2;
  assert.throws(() => tickStrategicCity(noCache.app, 66), /3F4C/);
  assert.equal(noCache.sc.cities[66]._aiCooldown, 1);
  const noPlane = await restoredWithout(
    await fixture({ movement: false }),
    "movementMemory",
  );
  assert.throws(() => tickStrategicCity(noPlane.app, 66), /3F47/);
});

test("formal JSON cache/RAM isolation, known0/FF/holes, explicit city inputs and F16/F17 absence", async () => {
  const f = await fixture({
    command: 6,
    cache: [
      { address: 0, hex: "00ff" },
      { address: 66, hex: "00" },
    ],
  });
  f.context.memory.writeByte(0x9001, 17);
  f.sc.cities[66].attr = 0;
  delete f.sc.factions[0].strategic_city_primary;
  f.sc.factions[0].strategic_city_secondary = null;
  delete f.sc.cities[1]._aiCooldown;
  delete f.sc.cities[2]._strategicLastFaction;
  const g = await restored(f);
  assert.equal(g.context.memory.readByte(0x9001), 17);
  assert.throws(() => g.context.memory.readByte(0x9000), /Unprovided/);
  assert.equal(g.context.cityCache.readByte(0), 0);
  assert.equal(g.context.cityCache.readByte(1), 255);
  assert.throws(() => g.context.cityCache.readByte(2), /Uncovered/);
  assert.equal(Object.hasOwn(g.sc.cities[1], "_aiCooldown"), false);
  assert.equal(Object.hasOwn(g.sc.cities[2], "_strategicLastFaction"), false);
  assert.equal(g.sc.cities[0]._aiCooldown, 0);
  assert.throws(() => go(g), /443F/);
  assert.equal(g.sc.factions[0].strategic_city_secondary, 255);
  assert.equal(f.sc.factions[0].strategic_city_secondary, null);
  g.context.cityCache.writeByte(0, 4);
  assert.equal(f.context.cityCache.readByte(0), 0);
  for (const value of [undefined, null, 255, 0, "bad"]) {
    f.sc.factions[0].strategic_city_secondary = value;
    f.sc.factions[0].strategic_city_primary = 255;
    if (value === undefined || value === "bad") {
      await assert.rejects(restored(f), /Invalid native faction/);
    } else {
      const h = await restored(f);
      go(h);
      assert.equal(h.A.commandState, value === 0 ? 0 : 11);
    }
  }
  for (const field of ["identity", "initialGraph", "span"]) {
    const meta = readSavedAssembly(g.saved);
    if (field === "identity") meta.cityCache.identity.world.id = "foreign";
    if (field === "initialGraph") meta.cityCache.initialGraph = "00";
    if (field === "span") meta.cityCache.spans = [{ address: 192, hex: "00" }];
    await assert.rejects(
      () =>
        prepareScenario({
          ...f.args,
          mode: "restore",
          raw: restoreSnapshotState(g.saved),
          ...meta,
        }),
      /city cache/,
    );
  }
  assertPlayableScenario(readSavedAssembly(g.saved)); // P58 flip: v2 enters play
  const absent = await fixture({ command: 8, cache: null });
  const h = await restoredWithout(absent, "cityCache");
  assert.equal(h.context.cityCache, null);
  go(h);
  assert.equal(h.A.commandState, 8);
});

test("real earlier slot prefix survives later cache failure; no failed-slot daily/03, remaining slots or weather", async () => {
  const f = await fixture({
    command: 8,
    cache: [],
    change: (sc) => {
      sc.legions.push(
        { ...sc.legions[0], slot: 1, commandState: 6 },
        { ...sc.legions[0], slot: 2, moveDelay: 9 },
      );
      sc.legionSlotCounters[1] = 7;
    },
  });
  f.sc.cities[66].attr = 0;
  f.sc.factions[0].strategic_city_secondary = 67;
  const rng = f.app.originalRng.snapshot(),
    plane = f.context.movement.snapshot();
  slot(f, true);
  assert.match(
    f.app._strategicBattleFailure.error.message,
    /city cache byte: 66/,
  );
  assert.equal(f.A.morale, 110);
  assert.equal(f.sc.factions[0].money, 981);
  const failed = f.sc.legions[1];
  assert.equal(failed.commandState, 0);
  assert.equal(failed.targetCity, 67);
  assert.equal(failed.targetNode, 66);
  assert.equal(failed.moveDelay, 3);
  assert.equal(failed.morale, 100);
  assert.equal(f.sc.legionSlotCounters[1], 7);
  assert.equal(f.sc.legions[2].moveDelay, 9);
  assert.equal(f.sc.factions[0].strategic_city_secondary, 255);
  assert.equal(canSnapshotState(f.app), false);
  assert.deepEqual(f.context.movement.snapshot(), plane);
  assert.deepEqual(f.app.originalRng.snapshot(), rng);
  slot(f, true);
  assert.equal(f.sc.factions[0].money, 981);
  assert.equal(f.sc.legions[2].moveDelay, 9);
});

test("two real departures decrement stored00 toFF toFE; refresh overwrites from82, not live-count recomputation", async () => {
  const f = await fixture({
    command: 6,
    cache: [{ address: 66, hex: "00" }],
    change: (sc) => {
      sc.legions.push({ ...sc.legions[0], slot: 1 });
    },
  });
  f.sc.cities[66].attr = 0;
  f.context.movement.writeByte(240, 67, 0x82);
  slot(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(f.context.cityCache.readByte(66), 254);
  assert.equal(f.context.movement.readByte(240, 67), 0x82);
  assert.equal(f.sc.legions[0].commandState, 11);
  assert.equal(f.sc.legions[1].commandState, 11);
  f.sc.cities[66].faction = null;
  assert.equal(tickStrategicCity(f.app, 66), "returned");
  assert.equal(f.context.cityCache.readByte(66), 2);
});

test("aiTick actual city prefix failure owns hold/forbids save; neutral stops missing governance input, owner stops missing border input; no slot continuation", async () => {
  for (const neutral of [true, false]) {
    const f = await fixture({ cache: [] });
    const c = f.sc.cities[66];
    c._aiCooldown = 2;
    // P58 flip fills border inputs from explicit zero raw at fresh prepare;
    // restore the missing-border scenario this test pins.
    delete c.strategicBorderCount;
    if (neutral) c.faction = null;
    f.context.movement.writeByte(240, 67, 0x82);
    aiTick(f.app, { cityIndex: 66, legionBatchStart: 0, settleDaily: true });
    assert.match(
      f.app._strategicBattleFailure.error.message,
      neutral ? /C12 at 420B/ : /C1B at 3FAB/,
    );
    assert.equal(c._aiCooldown, 1);
    assert.equal(c._strategicLastFaction, 0);
    assert.equal(c.attr, 0x80);
    assert.equal(f.context.cityCache.readByte(66), 2);
    assert.equal(f.A.moveDelay, 1);
    assert.equal(f.sc.factions[0].money, 1000);
    assert.equal(canSnapshotState(f.app), false);
    aiTick(f.app, { cityIndex: 66, legionBatchStart: 0 });
    assert.equal(c._aiCooldown, 1);
  }
});

test("next due handler0 resolves new20 without same-action redispatch or movement", async () => {
  const f = await fixture({ command: 6, cache: [{ address: 66, hex: "00" }] });
  f.sc.cities[66].attr = 0;
  f.sc.factions[0].strategic_city_secondary = 67;
  const plane = f.context.movement.snapshot();
  slot(f);
  assert.equal(f.A.commandState, 0);
  assert.equal(f.A.targetNode, 66);
  assert.equal(f.A.targetCity, 67);
  slot(f);
  slot(f);
  assert.equal(f.A.targetNode, 66);
  slot(f);
  assert.equal(f.A.targetNode, 67);
  assert.equal(f.A.targetX, 68);
  assert.equal(f.A.x, 67);
  assert.equal(f.A.commandState, 0);
  assert.deepEqual(f.context.movement.snapshot(), plane);
});

test("handler6 high attr short circuits cache0/1, and no-request>=80 is unchanged", async () => {
  for (const cache of [0, 1, 2]) {
    const f = await fixture({
      command: 6,
      cache: [{ address: 66, hex: cache.toString(16).padStart(2, "0") }],
    });
    if (cache < 2) delete f.sc.factions[0].attr;
    go(f);
    assert.equal(f.A.commandState, cache < 2 ? 1 : 6);
    assert.equal(f.context.cityCache.readByte(66), cache);
  }
});

test("43AF primitive edge gate needs no total/target attr/DI byte; real adapter retains bounded14 admission", async () => {
  const f = await fixture({ cache: null });
  const bytes = { 1: 0, 32: 255, 35: 5 };
  const io = {
    readByte: (at) => {
      assert(Object.hasOwn(bytes, at));
      return bytes[at];
    },
    writeByte: (at, value) => {
      bytes[at] = value;
    },
    readWord: (at) => {
      assert.equal(at, 14);
      return 0x4000;
    },
    writeWord: () => assert.fail("unexpected write"),
  };
  assert.equal(
    arriveOriginalRoad(f.sc, f.context, io, 0x4000, null),
    "arrived",
  );
  assert.equal(bytes[35], 0);
  assert.equal(bytes[8], 4);
});

test("native cache schema and retired v1 metadata gate; absent C1A survives JSON, illegal own bytes reject snapshot", async () => {
  const f = await fixture({ command: 8 });
  const saved = json(snapshotState(f.app, 0, "gates"));
  const v1 = json(saved);
  v1.webMeta.scenarioAssembly.roadVersion = 1;
  delete v1.webMeta.roadMemory;
  delete v1.webMeta.movementMemory;
  delete v1.webMeta.terrainMemory; // Memory stripping now hits the P65 retired-v1 gate first.
  assert.throws(() => readSavedAssembly(v1), /retired/);
  assert.throws(
    () =>
      readSavedAssembly({ webMeta: { cityCache: { version: 1, spans: [] } } }),
    /requires assembly/,
  );
  f.sc.cities[66]._aiCooldown = 2;
  delete f.sc.cities[66]._strategicLastFaction;
  const absent = await restored(f); // Actual snapshot -> JSON -> restore -> prepare.
  assert.equal(
    Object.hasOwn(absent.sc.cities[66], "_strategicLastFaction"),
    false,
  );
  assert.throws(() => tickStrategicCity(absent.app, 66), /3F11/);
  assert.equal(absent.sc.cities[66]._aiCooldown, 1); //3F0D precedes3F11.
  assert.equal(f.sc.cities[66]._aiCooldown, 2);
  for (const value of [undefined, -1, "bad"]) {
    f.sc.cities[66]._strategicLastFaction = value;
    const scenario = f.sc,
      prototype = Object.getPrototypeOf(f.sc);
    const city = f.sc.cities[66],
      legion = f.A,
      faction = f.sc.factions[0];
    const descriptor = Object.getOwnPropertyDescriptor(
      city,
      "_strategicLastFaction",
    );
    const before = structuredClone(f.sc); // Mutation observation, not save transport.
    const rng = f.app.originalRng.snapshot();
    const memory = f.context.memory.snapshot();
    const movement = f.context.movement.snapshot();
    const cache = f.context.cityCache.snapshot();
    assert.throws(() => snapshotState(f.app, 0, "illegal C1A"), {
      name: "TypeError",
      message: "Invalid native city/weather byte: _strategicLastFaction",
    });
    assert.deepEqual(structuredClone(f.sc), before);
    assert.equal(f.sc, scenario);
    assert.equal(f.app.scenario, scenario);
    assert.equal(Object.getPrototypeOf(f.sc), prototype);
    assert.equal(f.sc.cities[66], city);
    assert.equal(f.sc.legions[0], legion);
    assert.equal(f.sc.factions[0], faction);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(city, "_strategicLastFaction"),
      descriptor,
    );
    assert.equal(Object.hasOwn(f.sc.cities[66], "_strategicLastFaction"), true);
    assert(Object.is(f.sc.cities[66]._strategicLastFaction, value));
    assert.deepEqual(f.app.originalRng.snapshot(), rng);
    assert.deepEqual(f.context.memory.snapshot(), memory);
    assert.deepEqual(f.context.movement.snapshot(), movement);
    assert.deepEqual(f.context.cityCache.snapshot(), cache);
    assert.equal(canSnapshotState(f.app), true);
  }
  for (const value of [0, 255]) {
    f.sc.cities[66]._strategicLastFaction = value;
    const g = await restored(f);
    assert.equal(Object.hasOwn(g.sc.cities[66], "_strategicLastFaction"), true);
    assert.equal(g.sc.cities[66]._strategicLastFaction, value);
    // P58 flip fills border inputs at fresh prepare; the value-0 half pins
    // the missing-border stop, so restore that scenario explicitly. The
    // value-255 half keeps the filled count to reach the 3F29 write.
    if (value === 0) delete g.sc.cities[66].strategicBorderCount;
    assert.throws(
      () => tickStrategicCity(g.app, 66),
      value === 0 ? /3FAB/ : /3F29/,
    );
    assert.equal(g.sc.cities[66]._aiCooldown, 1);
    assert.equal(f.sc.cities[66]._aiCooldown, 2);
  }
  for (const spans of [
    [
      { address: 0, hex: "00" },
      { address: 0, hex: "ff" },
    ],
    [{ address: -1, hex: "00" }],
    [{ address: 0, hex: "0" }],
    [{ address: 191, hex: "0000" }],
  ])
    await assert.rejects(
      () => prepareScenario({ ...f.args, cityCache: { version: 1, spans } }),
      /city cache/,
    );
  const noCache = await fixture({ cache: null, movement: false });
  assert.equal(continueLegionAfterBattle(noCache.sc, noCache.A, true), true);
});

// Review P1/P2: these controls must first fail against the reviewed implementation.
for (const [field, at, funds] of [
  ["troops", "2609", 1000],
  ["legion_morale_cap", "263A", 981],
  ["morale", "263D", 981],
])
  test(`review P1 handler4 missing ${field} stops at ${at} with exact daily prefix`, async () => {
    const f = await fixture({
      command: 4,
      change: (sc) => {
        sc.legions.push({ ...sc.legions[0], slot: 1, moveDelay: 8 });
        sc.legionSlotCounters[0] = 7;
      },
    });
    f.A.contactAnimationByte21 = 93;
    delete (field === "legion_morale_cap" ? f.sc.factions[0] : f.A)[field];
    const rng = f.app.originalRng.snapshot(),
      plane = f.context.movement.snapshot();
    slot(f, true);
    assert.equal(f.A.commandState, 1);
    assert.equal(f.A.targetX, 67);
    assert.match(
      f.app._strategicBattleFailure?.error.message ?? "no failure",
      new RegExp(at),
    );
    assert.equal(f.sc.factions[0].money, funds);
    assert.equal(f.A.morale, field === "morale" ? undefined : 100);
    assert.equal(f.sc.legionSlotCounters[0], 7);
    assert.equal(f.A.contactAnimationByte21, 93);
    assert.equal(f.sc.legions[1].moveDelay, 8);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.equal(f.app._legionSlotBatch, null);
    assert.deepEqual(f.app.originalRng.snapshot(), rng);
    assert.deepEqual(f.context.movement.snapshot(), plane);
  });

for (const field of ["strategic_city_primary", "strategic_city_secondary"])
  for (const value of [NaN, Infinity, -Infinity])
    test(`review P2 ${field} ${value} rejects direct consumption and native snapshot`, async () => {
      const f = await fixture({
        command: 6,
        cache: [{ address: 66, hex: "00" }],
      });
      f.sc.cities[66].attr = 0;
      f.sc.factions[0].strategic_city_secondary = null;
      f.sc.factions[0][field] = value;
      assert.throws(
        () => go(f),
        field === "strategic_city_primary" ? /443F/ : /4436/,
      );
      assert.equal(f.A.commandState, 6);
      assert.equal(f.context.cityCache.readByte(66), 0);
      assert(Object.is(f.sc.factions[0][field], value));
      if (field === "strategic_city_primary")
        assert.equal(f.sc.factions[0].strategic_city_secondary, 255);
      assert.throws(
        () => snapshotState(f.app, 0, "nonfinite"),
        /Non-finite native faction order/,
      );
      assert(Object.is(f.sc.factions[0][field], value));
    });

test("review tail2653 writes03 then21 only on bit5-clear; failed21 write preserves03 and blocks next slot", async () => {
  const f = await fixture({
    command: 4,
    change: (sc) => {
      sc.legions.push({ ...sc.legions[0], slot: 1, moveDelay: 8 });
      sc.legionSlotCounters[0] = 7;
    },
  });
  const old = 92;
  Object.defineProperty(f.A, "contactAnimationByte21", {
    enumerable: true,
    configurable: true,
    get: () => old,
    set: () => {
      assert.equal(f.sc.legionSlotCounters[0], 0);
      throw new Error("2653-write");
    },
  });
  slot(f, true);
  assert.match(
    f.app._strategicBattleFailure?.error.message ?? "no failure",
    /2653-write/,
  );
  assert.equal(f.sc.factions[0].money, 981);
  assert.equal(f.A.morale, 110);
  assert.equal(f.A.contactAnimationByte21, 92);
  assert.equal(f.sc.legions[1].moveDelay, 8);
  assert.equal(f.app.clock.hold, true);
});

test("native daily strict words/owner/funds, gold authority and single lower cap with signed24 wrap", async () => {
  for (const [funds, expected] of [
    [1000, 981],
    [0, -19],
    [-654981, -655000],
    [-655000, -655000],
    [-8388608, 8388589],
    [900000, 899981],
    [8388607, 8388588],
  ]) {
    const f = await fixture({ command: 4 });
    f.sc.factions[0].money = funds;
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(f.sc.factions[0].money, expected);
    assert.equal(f.sc.factions[0].gold, expected);
  }
  const gold = await fixture({ command: 4 });
  gold.sc.factions[0].gold = 0;
  slot(gold, true);
  assert.equal(gold.sc.factions[0].money, -19);
  for (const [field, bad, at] of [
    ["troops", -1, "2609"],
    ["troops", 65536, "2609"],
    ["troops", "600", "2609"],
    ["roadEdgeOrNode", undefined, "260C"],
    ["roadEdgeOrNode", 65536, "260C"],
    ["faction", undefined, "262B"],
    ["faction", 24, "262B"],
    ["gold", NaN, "563D"],
    ["gold", null, "563D"],
    ["gold", undefined, "563D"],
    ["money", Infinity, "563D"],
    ["money", -8388609, "563D"],
  ]) {
    const f = await fixture({ command: 4 });
    f.A.moveDelay = 2; // 2600 remains due even when no2662 action runs.
    const target =
      field === "gold" || field === "money" ? f.sc.factions[0] : f.A;
    target[field] = bad;
    f.A._march = { edgeId: 0 }; // Never substitute projection for missing0E.
    slot(f, true);
    assert.match(
      f.app._strategicBattleFailure?.error.message ?? "no failure",
      new RegExp(at),
    );
    assert.equal(f.A.morale, 100);
    assert.equal(f.A.commandState, 4);
    assert.equal(f.A.contactAnimationByte21, undefined);
    assert(Object.is(target[field], bad));
    if (field !== "money") assert.equal(f.sc.factions[0].money, 1000);
  }
});

test("native edge daily skips cap/morale; node byte-add write precedes clamp and later fault", async () => {
  const edge = await fixture({ command: 4 });
  edge.A.moveDelay = 2;
  edge.A.roadEdgeOrNode = 0x800;
  edge.A.troops = 65535;
  delete edge.A.morale;
  delete edge.sc.factions[0].legion_morale_cap;
  slot(edge, true);
  assert.equal(edge.app._strategicBattleFailure, undefined);
  assert.equal(edge.sc.factions[0].money, 1000 - 49150);
  assert.equal(edge.A.morale, undefined);
  assert.equal(edge.A.contactAnimationByte21, 0);
  for (const [old, cap, expected] of [
    [250, 200, 4],
    [195, 200, 200],
    [100, 0, 0],
    [245, 255, 255],
  ]) {
    const f = await fixture({ command: 4 });
    f.A.morale = old;
    f.sc.factions[0].legion_morale_cap = cap;
    const writes = [];
    let value = old;
    Object.defineProperty(f.A, "morale", {
      get: () => value,
      set: (next) => {
        writes.push(next);
        value = next;
      },
    });
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(f.A.morale, expected);
    const incremented = (old + 10) & 255;
    assert.deepEqual(
      writes,
      incremented >= cap ? [incremented, cap] : [incremented],
    );
  }
  const fail = await fixture({
    command: 4,
    change: (sc) => {
      sc.legionSlotCounters[0] = 7;
    },
  });
  let value = 195,
    count = 0;
  Object.defineProperty(fail.A, "morale", {
    get: () => value,
    set: (next) => {
      if (++count === 2) throw new Error("2646-clamp-write");
      value = next;
    },
  });
  slot(fail, true);
  assert.match(
    fail.app._strategicBattleFailure.error.message,
    /2646-clamp-write/,
  );
  assert.equal(fail.sc.factions[0].money, 981);
  assert.equal(fail.A.morale, 205);
  assert.equal(fail.sc.legionSlotCounters[0], 7);
});

test("native byte21 normal tail and bit5 preservation survive snapshot JSON/sidecar and army rebuild", async () => {
  for (const value of [undefined, 0, 255]) {
    const f = await fixture({
      command: 4,
      change: (sc) => {
        sc.legionSlotCounters[0] = 1;
      },
    });
    f.A.status |= 0x20;
    f.A.moveDelay = 2;
    if (value !== undefined) f.A.contactAnimationByte21 = value;
    f.A.raw = Array(64).fill(177);
    f.A._engagement = { kind: "field", target: { slot: 2 } };
    slot(f); // Not due: bit5 retained;03 DEC1->0->1,21 not read or written.
    assert.equal(f.sc.legionSlotCounters[0], 1);
    assert.equal(f.A.contactAnimationByte21, value);
    const g = await restored(f);
    assert.equal(g.A.contactAnimationByte21, value);
    assert.equal(
      Object.hasOwn(g.A, "contactAnimationByte21"),
      value !== undefined,
    );
    buildArmies(g.sc); // Preservation control only, not certification of legacy rebuild.
    assert.equal(g.A.contactAnimationByte21, value);
    slot(g); // Due handler4 returns;25CC clears bit5 then264F/2653 write03/21.
    assert.equal(g.app._strategicBattleFailure, undefined);
    assert.equal(g.sc.legionSlotCounters[0], 0);
    assert.equal(g.A.contactAnimationByte21, 0);
    assert.equal(g.A.raw[0x21], 177);
    assert.equal(g.A.raw[0x22], 177);
    const h = await restored(g);
    assert.equal(h.A.contactAnimationByte21, 0);
  }
});

test("v1 daily defaults, byte21 and nonfinite snapshot behavior remain outside native changes", async () => {
  const f = await fixture({ command: 4 });
  const sc = structuredClone({ ...f.sc }); // Deliberately unbound legacy state.
  delete sc.nativeLegionSlots; // This control is v1, not a native format downgrade.
  delete sc.nativeFactionSlots;
  delete sc.nativeFactionSlotRaw;
  delete sc.legions[0].troops;
  delete sc.factions[0].legion_morale_cap;
  sc.legions[0].contactAnimationByte21 = 71;
  settleLegionDaily(sc);
  assert.equal(sc.factions[0].money, 999);
  assert.equal(sc.legions[0].morale, 110);
  sc.factions[0].strategic_city_primary = Infinity;
  const saved = snapshotState(
    { ...f.app, scenario: sc, world: undefined, content: undefined },
    0,
    "legacy",
  );
  assert.equal(saved.state.factions[0].strategic_city_primary, Infinity);
  assert.equal(sc.legions[0].contactAnimationByte21, 71);
});
