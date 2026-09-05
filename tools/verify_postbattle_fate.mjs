import assert from "node:assert/strict";
import fs from "node:fs/promises";

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
    { idx: 0, capital: 0, monarch_idx: 0 },
    { idx: 1, capital: 1, monarch_idx: 1 },
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
  x,
  y,
  prevX: x,
  prevY: y,
  troops: 100,
  morale: 200,
  status: 0x80,
  _active: true,
  units: [{ type: 1, troops: 1000 }],
});

{
  const sc = makeScenario();
  const loser = legion("乙", 1, 255, 9);
  loser.troops = 400;
  loser.units[0].troops = 4000;
  sc.legions = [loser];
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.commandState, 8);
  assert.equal(loser.target.idx, 2);
  assert.equal(loser._retreat.cityIdx, 2);
  assert.ok(loser._path.length > 0);
}

// 0x487B边内撤退的结构端点顺序固定为edge+8后edge+6，不能按原行军
// 有向点列首尾猜端点。双向遍历全部254边：攻城端为敌、另一端为己时，
// 败退第一段必须逐原始道路点返回己方端，任何相邻步不得超过资产上限2格。
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
      loser.troops = 400;
      loser.units[0].troops = 4000;
      loser._battleRoadContext = {
        edgeId,
        stride,
        pointIndex: directedPoints.length,
        points: directedPoints.map((point) => ({ ...point })),
      };
      sc.legions = [loser];
      assert.equal(continueLegionAfterBattle(sc, loser, false), true);
      assert.equal(loser.target.idx, ownNode.id);
      assert.ok(loser._march);
      let previous = { x: loser.x, y: loser.y };
      for (const point of [...loser._march.points, ownNode]) {
        assert.ok(
          Math.max(
            Math.abs(point.x - previous.x),
            Math.abs(point.y - previous.y),
          ) <= 2,
          `edge ${edgeId} stride ${stride}撤退不得跨整边瞬移`,
        );
        previous = point;
      }
    }
  }
}

// 0x474A硬失败门槛：战后士气0或首队0才不能继续；士气仍为1且有兵时
// 即使很低也必须按首都方向撤退，不能额外臆造“士气<100歼灭”。
{
  const sc = makeScenario();
  const lowMorale = legion("乙", 1, 255, 9);
  lowMorale.morale = 1;
  lowMorale.troops = 100;
  lowMorale.units[0].troops = 1000;
  sc.legions = [lowMorale];
  assert.equal(continueLegionAfterBattle(sc, lowMorale, false), true);
  assert.ok(lowMorale._retreat);
}
{
  const sc = makeScenario();
  const broken = legion("乙", 1, 255, 9);
  broken.morale = 0;
  sc.legions = [broken];
  assert.equal(continueLegionAfterBattle(sc, broken, false), false);
}

// 0x474A：总兵<=300时即使即时退路不是首都，也必须写状态10继续返首都。
{
  const sc = makeScenario();
  const loser = legion("乙", 1, 255, 9);
  loser.troops = 300;
  loser.units[0].troops = 3000;
  sc.legions = [loser];
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.target.idx, 2);
  assert.equal(loser.commandState, 10);
}

// Web撤退调度抵达即时据点时不得清掉0x474A写入的目标/状态；状态10
// 下一轮0x4325会改锁首都，否则就会在道路端点变成无目标圆点。
{
  const sc = makeScenario();
  const loser = legion("乙", 1, 246, 15);
  loser.troops = 300;
  loser.units[0].troops = 3000;
  loser.target = sc.cities[2];
  loser.targetNode = 2;
  loser.roadEdgeOrNode = 2;
  loser.commandState = 10;
  loser.cooldown = 0;
  loser._retreat = { cityIdx: 2, nodeId: 2, captorFaction: 0 };
  sc.legions = [loser];
  aiTick(
    { scenario: sc, originalRng: { nextByte: () => 0 } },
    { runCityDaily: false, settleDaily: false },
  );
  assert.equal(loser.target.idx, 1);
  assert.equal(loser.commandState, 10);
  assert.equal(loser._retreat, null);
}

// 0x491B：非己城市加入约0x80A6代价但仍展开；存在己城绕路时不得阻断失败。
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
  const loser = legion("乙", 1, 255, 9);
  loser.troops = 400;
  loser.units[0].troops = 4000;
  sc.legions = [loser];
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
  attacker.troops = 500;
  attacker.units[0].troops = 5000;
  const defender = legion("甲", 0, chenliu.x, chenliu.y);
  defender.slot = 0;
  defender.troops = 400;
  defender.units[0].troops = 4000;
  sc.legions = [attacker, defender];
  applyBattleResult(
    { scenario: sc },
    attacker,
    chenliu,
    "atk",
    450,
    [450, 0, 0, 0, 0, 0],
    null,
    null,
    null,
    null,
    null,
    { strategicRng: { nextByte: () => 0xff }, oldFaction: 0 },
  );
  assert.equal(chenliu.faction, 1);
  assert.equal(defender.dead, undefined);
  assert.equal(defender.target.idx, 82);
  assert.equal(defender.targetNode, 82);
  assert.equal(defender._retreat, null);
  assert.equal(defender.cooldown, 1);
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
  sc.legions = [loser];
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
  sc.legions = [monarch];
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
  const targetBatch = 32;
  for (let visit = 0; visit < 47; visit++) {
    for (const batchStart of [0, 16, 48, 64, 80, 96, 112]) {
      aiTick(app, { legionBatchStart: batchStart, runFactionTick: false });
    }
    assert.equal(
      sc.delayedLegionReturns[0].countdown,
      48 - visit,
      "非目标七个批次不得递减48次回归计数",
    );
    aiTick(app, { legionBatchStart: targetBatch, runFactionTick: false });
  }
  assert.equal(sc.delayedLegionReturns[0].countdown, 1);
  assert.equal(sc.generals[0].status, 1);
  aiTick(app, { legionBatchStart: targetBatch, runFactionTick: false });
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
  sc.legions = [ordinary];
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
  sc.legions = [escaped, captured];
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
  sc.legions = [ordinary];
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
  sc.cities = [city(0, 0, 218, 11)];
  sc.factions[0].capital = 0;
  sc.factions[0].active = true;
  sc.factions[0].dead = false;
  sc.legions = [attacker, defender];
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
  sc.legions = [attacker, defender];
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
