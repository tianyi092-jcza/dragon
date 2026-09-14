import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";

globalThis.window = {};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};

const { loadTerrain } = await import("../web/src/game/pathfind.js");
const { findRoadRoute, roadApproachesAt, roadEdgeById, roadNodeById } =
  await import("../web/src/game/roadgraph.js");
const {
  aiTick,
  applyBattleResult,
  applyFieldBattleResult,
  continueLegionAfterBattle,
  dispatchLegionFate,
} = await import("../web/src/game/ai.js");
await loadTerrain();
assert.ok(roadApproachesAt(255, 9).length >= 2);

const city = (idx, faction, x, y) => ({ idx, faction, x, y, sim: {} });
const general = (idx, name, faction, extra = {}) => ({
  idx,
  name,
  faction,
  status: 1,
  active: true,
  attr: 0x80,
  battle_rating: 0,
  ...extra,
});
const makeScenario = () => {
  const cities = [city(0, 0, 257, 9), city(1, 1, 218, 11), city(2, 1, 246, 15)];
  const factions = [
    { idx: 0, capital: 0, monarch_idx: 0, active: true },
    { idx: 1, capital: 1, monarch_idx: 1, active: true },
  ];
  const generals = [general(0, "甲", 0), general(1, "乙", 1)];
  return {
    cities,
    factions,
    generals,
    legions: [],
    player_faction: 0,
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
};
const legion = (leader, faction, x, y) => ({
  leader,
  faction,
  slot: faction,
  generalIdx: faction,
  moveDelay: 1,
  movePeriod: 3,
  x,
  y,
  prevX: x,
  prevY: y,
  troops: 100,
  morale: 200,
  status: 0x80,
  _active: true,
  _march: null,
  _path: null,
  _retreat: null,
  units: [1, 1, 2, 2, 3, 3].map((type, index) => ({
    type,
    troops: index === 0 ? 1000 : 0,
  })),
});
function setTroops(record, total) {
  record.troops = total;
  record.units.forEach((unit, index) => {
    unit.troops = Math.max(0, Math.min(100, total - index * 100)) * 10;
  });
}
function putLegions(sc, records, counts) {
  // Fixture construction only, never derive or repair a running F14 value.
  assert.equal(sc.legions.length, 0);
  assert.equal(sc.legionPhaseVersion, undefined);
  assert.equal(counts.length, sc.factions.length);
  initializeLegionSlotState(sc);
  sc.factions.forEach((faction, index) => {
    faction.n_legions = counts[index];
  });
  sc.legions.push(...records);
}
function approachLegion(total) {
  const record = legion("乙", 1, 255, 9);
  setTroops(record, total);
  const edge = findRoadRoute(257, 9, 246, 15).legs[0];
  assert.deepEqual(edge.points[0], { x: 255, y: 9 });
  record._march = {
    edgeId: edge.edgeId,
    stride: edge.stride,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    currentNode: edge.fromNode,
    targetNode: edge.toNode,
    targetX: 246,
    targetY: 15,
    points: structuredClone(edge.points),
    pointIndex: 1,
  };
  record._path = record._march.points.slice(1);
  return record;
}

{
  const sc = makeScenario();
  const loser = approachLegion(400);
  putLegions(sc, [loser], [0, 1]);
  const originalMarch = structuredClone(loser._march);
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.commandState, 8);
  assert.equal(loser.target.idx, 2);
  assert.equal(loser._retreat.cityIdx, 2);
  assert.ok(loser._path.length > 0);
  assert.deepEqual(
    loser._march,
    originalMarch,
    "474A preserves the current road context",
  );
}

// Single-friendly-endpoint inputs on all 254 edges, both stored directions.
// 474A/487B select that endpoint but do not turn/rebuild the current road now.
// This does not certify the separate next-action movement or a two-friendly tie.
{
  for (let edgeId = 0; edgeId < 254; edgeId++) {
    const edge = roadEdgeById(edgeId);
    assert.ok(edge);
    for (const stride of [4, -4]) {
      const sourceNode = roadNodeById(edge.source);
      const targetNode = roadNodeById(edge.target);
      const ownNode = stride === 4 ? sourceNode : targetNode;
      const enemyNode = stride === 4 ? targetNode : sourceNode;
      const directedPoints =
        stride === 4 ? edge.points : edge.points.toReversed();
      const current = directedPoints.at(-1);
      assert.ok(current);
      const cities = Array.from({ length: 192 }, (_, idx) => {
        const node = roadNodeById(idx);
        return city(idx, 0x18, node.x, node.y);
      });
      cities[ownNode.id].faction = 1;
      cities[enemyNode.id].faction = 0;
      const sc = {
        cities,
        factions: [
          { idx: 0, capital: enemyNode.id },
          { idx: 1, capital: ownNode.id },
        ],
        generals: [],
        legions: [],
        player_faction: 0,
        citiesOf(faction) {
          return this.cities.filter(
            (candidate) => candidate.faction === faction,
          );
        },
      };
      const loser = legion("乙", 1, current.x, current.y);
      setTroops(loser, 400);
      loser.status = 0xc1;
      loser.moveDelay = 13;
      loser._march = {
        currentNode: ownNode.id,
        fromNode: ownNode.id,
        toNode: enemyNode.id,
        targetNode: enemyNode.id,
        targetX: enemyNode.x,
        targetY: enemyNode.y,
        edgeId,
        stride,
        pointIndex: directedPoints.length,
        points: directedPoints.map((point) => ({ ...point })),
      };
      loser._battleRoadContext = structuredClone(loser._march);
      putLegions(sc, [loser], [0, 1]);
      const originalMarch = structuredClone(loser._march);
      const position = { x: loser.x, y: loser.y };
      assert.equal(continueLegionAfterBattle(sc, loser, false), true);
      assert.equal(loser.target.idx, ownNode.id);
      assert.deepEqual(
        loser._march,
        originalMarch,
        `edge ${edgeId} stride ${stride}: no road rewrite in 474A`,
      );
      assert.deepEqual({ x: loser.x, y: loser.y }, position);
      assert.equal(loser.moveDelay, 1);
      assert.equal(loser.movePeriod, 3);
    }
  }
}

// 0x474A硬失败门槛：战后士气0或首队0才不能继续；士气仍为1且有兵时
// 即使很低也必须按首都方向撤退，不能额外臆造“士气<100歼灭”。
{
  const sc = makeScenario();
  const lowMorale = approachLegion(100);
  lowMorale.morale = 1;
  putLegions(sc, [lowMorale], [0, 1]);
  assert.equal(continueLegionAfterBattle(sc, lowMorale, false), true);
  assert.ok(lowMorale._retreat);
}
{
  const sc = makeScenario();
  const broken = legion("乙", 1, 255, 9);
  broken.morale = 0;
  putLegions(sc, [broken], [0, 1]);
  assert.equal(continueLegionAfterBattle(sc, broken, false), false);
}

// 0x474A：总兵<=300时即使即时退路不是首都，也必须写状态10继续返首都。
{
  const sc = makeScenario();
  const loser = approachLegion(300);
  putLegions(sc, [loser], [0, 1]);
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.target.idx, 2);
  assert.equal(loser.commandState, 10);
}

// Web撤退调度抵达即时据点时不得清掉0x474A写入的目标/状态；状态10
// 下一轮0x4325会改锁首都，否则就会在道路端点变成无目标圆点。
{
  const sc = makeScenario();
  const loser = legion("乙", 1, 246, 15);
  setTroops(loser, 300);
  loser.target = sc.cities[2];
  loser.targetNode = 2;
  loser.roadEdgeOrNode = 2 * 8;
  loser.commandState = 10;
  loser._retreat = { cityIdx: 2, nodeId: 2, captorFaction: 0 };
  putLegions(sc, [loser], [0, 1]);
  const app = { scenario: sc, originalRng: { nextByte: () => 0 } };
  aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
  assert.equal(app._strategicBattleFailure, undefined);
  assert.equal(loser.target.idx, 1);
  assert.equal(loser.commandState, 10);
  assert.equal(loser._retreat, null);
}

// Controlled routing input: non-own nodes remain expandable with ADD A6/OR 8000.
// The constant-penalty route below is only a Web search control, not the full word formula.
{
  const sc = makeScenario();
  sc.cities[0].faction = 1;
  sc.cities[1].faction = 1;
  sc.cities[2].faction = 0;
  sc.factions[1].capital = 1;
  for (const nodeId of [3, 8, 14, 16, 15, 7, 6, 4]) {
    const node = roadNodeById(nodeId);
    sc.cities.push(city(sc.cities.length, 1, node.x, node.y));
  }
  const direct = findRoadRoute(257, 9, 218, 11);
  assert.deepEqual(direct.nodes, [0, 2, 1]);
  const weighted = findRoadRoute(218, 11, 257, 9, null, (node) =>
    node.id === 2 ? 0x80a6 : 0,
  );
  assert.ok(weighted);
  assert.ok(!weighted.nodes.includes(2));
  const loser = approachLegion(400);
  putLegions(sc, [loser], [0, 1]);
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.target.idx, 0);
  assert.ok(
    loser._retreat,
    "enemy-node penalty must preserve a capital-directed friendly first hop",
  );
}

// 0x48E5→0x48F1：失陷据点本身是拓扑节点时，0x491B返回朝首都的
// 第一条边；0x487B沿该边取败方下一跳，不会把已易主的当前节点判成无路。
{
  const chenliu = city(74, 0, 225, 107);
  const xuchang = city(82, 0, 206, 114);
  const cities = Array.from({ length: 83 }, (_, index) =>
    city(index, 0x18, -index - 1, -1),
  );
  cities[74] = chenliu;
  cities[82] = xuchang;
  const sc = {
    cities,
    factions: [
      { idx: 0, capital: 82, monarch_idx: 0, active: true },
      { idx: 1, capital: 74, monarch_idx: 1, active: true },
    ],
    generals: [general(0, "甲", 0), general(1, "乙", 1)],
    legions: [],
    player_faction: 0,
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
  const attacker = legion("乙", 1, chenliu.x, chenliu.y);
  attacker.slot = 1;
  setTroops(attacker, 500);
  const defender = legion("甲", 0, chenliu.x, chenliu.y);
  defender.slot = 0;
  setTroops(defender, 400);
  putLegions(sc, [attacker, defender], [1, 1]);
  applyBattleResult(
    { scenario: sc },
    attacker,
    chenliu,
    "atk",
    450,
    [90, 90, 90, 90, 90, 0],
    null,
    null,
    null,
    null,
    null,
    {
      strategicRng: { nextByte: () => 0xff },
      oldFaction: 0,
      defenders: [defender],
    },
  );
  assert.equal(chenliu.faction, 1);
  assert.equal(defender.dead, undefined);
  assert.equal(defender.target.idx, 82);
  assert.equal(defender.targetNode, 82);
  assert.equal(defender._retreat, null);
  assert.equal(defender.moveDelay, 1);
  assert.equal(defender._path, null);
}

// generalIdx是权威主将关联；slot冲突和显示名空白不能导致静默删除/错抓武将。
{
  const sc = makeScenario();
  sc.factions[1].monarch_idx = 7;
  sc.generals.push(general(2, "丙　", 1));
  const loser = legion("错误显示名", 1, 218, 11);
  loser.generalIdx = 2;
  loser.slot = 1;
  putLegions(sc, [loser], [0, 1]);
  const messages = [];
  assert.equal(
    dispatchLegionFate(
      sc,
      loser,
      0,
      { nextByte: () => 0xff },
      {
        scenario: sc,
        gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
      },
    ),
    "captured",
  );
  assert.equal(sc.generals[2].status, 4);
  assert.equal(sc.generals[1].status, 1);
  assert.equal(messages[0].talkIndex, 34);
}

{
  const sc = makeScenario();
  const monarch = legion("甲", 0, 257, 9);
  monarch.slot = 37;
  putLegions(sc, [monarch], [1, 0]);
  assert.equal(
    dispatchLegionFate(sc, monarch, 1, {
      nextByte: () => assert.fail("monarch path must not consume RNG"),
    }),
    "return",
  );
  assert.equal(monarch.dead, true);
  assert.equal(sc.delayedLegionReturns[0].countdown, 48);
  const messages = [];
  const app = {
    scenario: sc,
    originalRng: { nextByte: () => 0xff },
    gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
  };
  const visitBatch = (legionBatchStart) => {
    aiTick(app, { legionBatchStart, runCityDaily: false, settleDaily: false });
    assert.equal(app._strategicBattleFailure, undefined);
  };
  const targetBatch = 32;
  for (let visit = 0; visit < 47; visit++) {
    for (const batchStart of [0, 16, 48, 64, 80, 96, 112]) {
      visitBatch(batchStart);
    }
    assert.equal(
      sc.delayedLegionReturns[0].countdown,
      48 - visit,
      "非目标七个批次不得递减48次回归计数",
    );
    visitBatch(targetBatch);
  }
  assert.equal(sc.delayedLegionReturns[0].countdown, 1);
  assert.equal(sc.generals[0].status, 1);
  visitBatch(targetBatch);
  assert.equal(sc.generals[0].status, 0);
  assert.equal(sc.delayedLegionReturns.length, 0);
  assert.ok(!sc.legions.includes(monarch));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 35);
  assert.equal(messages[0].personalitySelector, 0x198);
  assert.equal(messages[0].kind, "postbattle-general-return");
}

{
  const sc = makeScenario();
  sc.factions[0].monarch_idx = 7;
  const ordinary = legion("甲", 0, 257, 9);
  putLegions(sc, [ordinary], [1, 0]);
  const messages = [];
  const app = {
    scenario: sc,
    gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
  };
  let rngCalls = 0;
  assert.equal(
    dispatchLegionFate(
      sc,
      ordinary,
      1,
      {
        nextByte() {
          rngCalls++;
          return 0xfd;
        },
      },
      app,
    ),
    "captured",
  );
  assert.equal(rngCalls, 1);
  assert.equal(ordinary.dead, true);
  assert.equal(sc.delayedLegionReturns?.length ?? 0, 0);
  assert.equal(sc.generals[0].status, 4);
  assert.equal(sc.generals[0].origFaction, 0);
  assert.equal(sc.generals[0].faction, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 33);
  assert.equal(messages[0].personalitySelector, 0x19a);
}

// 对手军团溃散时，玩家分别收到TALK32（未擒获）或TALK34（擒获）。
{
  const sc = makeScenario();
  sc.factions[1].monarch_idx = 7;
  sc.generals.push(general(2, "丙", 1));
  const escaped = legion("乙", 1, 218, 11);
  const captured = legion("丙", 1, 218, 11);
  captured.slot = 2;
  captured.generalIdx = 2;
  putLegions(sc, [escaped, captured], [0, 2]);
  const messages = [];
  const app = {
    scenario: sc,
    gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
  };
  assert.equal(
    dispatchLegionFate(sc, escaped, 0, { nextByte: () => 0 }, app),
    "return",
  );
  assert.equal(
    dispatchLegionFate(sc, captured, 0, { nextByte: () => 0xff }, app),
    "captured",
  );
  assert.deepEqual(
    messages.map((message) => [message.talkIndex, message.personalitySelector]),
    [
      [32, undefined],
      [34, 0x19a],
    ],
  );
}

{
  const sc = makeScenario();
  sc.factions[0].monarch_idx = 7;
  sc.generals[0].battle_rating = 0xff;
  const ordinary = legion("甲", 0, 257, 9);
  putLegions(sc, [ordinary], [1, 0]);
  let rngCalls = 0;
  assert.equal(
    dispatchLegionFate(sc, ordinary, 1, {
      nextByte() {
        rngCalls++;
        return 0xff;
      },
    }),
    "return",
  );
  assert.equal(rngCalls, 1, "threshold>=127 still consumes the original byte");
}

{
  const sc = makeScenario();
  sc.factions[1].monarch_idx = 7;
  const attacker = legion("乙", 1, 257, 9);
  const defender = legion("甲", 0, 246, 15);
  defender.units[0].troops = 0;
  defender.morale = 0;
  sc.generals[0].status = 1;
  sc.factions[0].monarch_idx = 7;
  // Keep a valid winning-attacker capital: only the defender's 474A fails
  // (AH=2). A missing attacker capital would instead exercise AH=3.
  sc.cities = [city(0, 0, 218, 11), city(1, 1, 257, 9)];
  sc.factions[0].capital = 0;
  sc.factions[0].active = true;
  sc.factions[0].dead = false;
  putLegions(sc, [attacker, defender], [1, 1]);
  let rngCalls = 0;
  applyFieldBattleResult(
    {
      scenario: sc,
      originalRng: {
        nextByte() {
          rngCalls++;
          return 0xff;
        },
      },
      hud: { flashEvent() {} },
    },
    attacker,
    defender,
    "atk",
    90,
    0,
    [90, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(
    rngCalls,
    1,
    "strategic autoresolve must carry app original RNG",
  );
  assert.equal(sc.generals[0].status, 4);
}

{
  const sc = makeScenario();
  const attacker = legion("甲", 0, 257, 9);
  const defender = legion("乙", 1, 246, 15);
  defender.units[0].troops = 0;
  putLegions(sc, [attacker, defender], [1, 1]);
  applyFieldBattleResult(
    {
      scenario: sc,
      hud: {
        flashEvent() {
          assert.fail("strategic field results must use the TALK FIFO");
        },
      },
    },
    attacker,
    defender,
    "atk",
    90,
    0,
    [90, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(attacker.commandState, 8);
  assert.equal(defender.dead, true);
  assert.equal(sc.delayedLegionReturns[0].leader, "乙");
}

process.stdout.write("postbattle fate OK: retreat, 48-tick return, capture\n");
