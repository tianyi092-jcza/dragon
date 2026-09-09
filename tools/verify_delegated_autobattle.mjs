import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.window = {};
globalThis.fetch = async (url) => {
  let data;
  try {
    data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  } catch (error) {
    throw new Error(`cannot read delegated fixture ${url}: ${error.message}`, {
      cause: error,
    });
  }
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid delegated fixture ${url}: ${error.message}`, {
          cause: error,
        });
      }
    },
  };
};

const { aiTick, applyBattleResult, resolveBattle, resolveFieldBattle } =
  await import("../web/src/game/ai.js");
const { setLegionDelegated } = await import("../web/src/game/legionmode.js");
const { resolveStrategicBattle } = await import(
  "../web/src/game/autobattle.js"
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
const { loadTerrain } = await import("../web/src/game/pathfind.js");
await loadTerrain();

const units = () => [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 }));
const general = (idx, name, faction, ability = null) => ({
  idx,
  name,
  faction,
  status: 1,
  active: true,
  attr: 0x80,
  battle_rating: 0,
  ability: ability ?? { force: 15, lead: 11, field: 4, siege: 4, naval: 0 },
});
const legion = (leader, faction, x, y) => ({
  leader,
  faction,
  x,
  y,
  prevX: x,
  prevY: y,
  troops: 600,
  morale: 200,
  units: units(),
  status: 0x80,
  _active: true,
});
const makeScenario = (cityFaction = 1) => {
  const cities = [
    {
      idx: 0,
      name: "甲城",
      faction: 0,
      x: 257,
      y: 9,
      troops: 120,
      growth: 150,
      defence: 140,
    },
    {
      idx: 1,
      name: "乙城",
      faction: cityFaction,
      x: 255,
      y: 9,
      troops: 120,
      growth: 150,
      defence: 140,
    },
    {
      idx: 2,
      name: "退路",
      faction: 1,
      x: 246,
      y: 15,
      troops: 120,
      growth: 150,
      defence: 140,
    },
  ];
  return {
    player_faction: 0,
    cities,
    factions: [
      { idx: 0, capital: 0, monarch_idx: 0, active: true },
      { idx: 1, capital: 2, monarch_idx: 1, active: true },
    ],
    generals: [general(0, "甲", 0), general(1, "乙", 1)],
    legions: [],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    citiesOf(faction) {
      return this.cities.filter((city) => city.faction === faction);
    },
  };
};
const makeApp = (
  scenario,
  rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 }),
) => {
  let tactical = null;
  return {
    scenario,
    originalRng: rng,
    battleView: { active: false },
    hud: { flashEvent() {} },
    startBattle(A, city, D) {
      tactical = { kind: "siege", A, city, D };
    },
    startFieldBattle(A, D) {
      tactical = { kind: "field", A, D };
    },
    tactical: () => tactical,
  };
};

const pureResult = (sc, A, D, mode, rng, cityDefence = 0) =>
  resolveStrategicBattle(sc, structuredClone(A), structuredClone(D), {
    mode,
    cityDefence,
    rng: new OriginalBattleRng().restore(rng.snapshot()),
  });
const assertSide = (actual, expected, label) => {
  assert.equal(actual.troops, expected.troops, `${label} total`);
  assert.equal(actual.morale, expected.morale, `${label} morale`);
  assert.equal(actual.units.length, 6, `${label} unit count`);
  assert.deepEqual(
    actual.units.map((unit) => unit.troops / 10),
    expected.units.map((unit) => unit.troops),
    `${label} six units`,
  );
  assert.ok(
    actual.units.every((unit) => Number.isFinite(unit.troops)),
    `${label} units finite`,
  );
};

// 第一章用户实测型攻城：吕布六满队攻击程昱六满队、城兵89；按
// 0x5285/0x52D7所有RNG分支均应守方胜，锁住委任胜负算法而非概率近似。
{
  const sc = makeScenario(0);
  sc.generals = [
    general(0, "呂布", 1, {
      force: 15,
      lead: 11,
      field: 10,
      siege: 4,
      naval: 0,
    }),
    general(1, "程昱", 0, {
      force: 3,
      lead: 12,
      field: 4,
      siege: 10,
      naval: 0,
    }),
  ];
  const city = sc.cities[1];
  city.faction = 0;
  city.troops = 89;
  const A = legion("呂布", 1, 255, 9);
  A.generalIdx = 0;
  A.slot = 0;
  A.status = 0xc4;
  const D = legion("程昱", 0, city.x, city.y);
  D.generalIdx = 1;
  D.slot = 1;
  D.status = 0xc4;
  sc.legions = [A, D];
  for (let branch = 0; branch < 4; branch++) {
    const bytes = [branch, ...Array(12).fill(0)];
    let cursor = 0;
    const result = resolveStrategicBattle(
      sc,
      structuredClone(A),
      structuredClone(D),
      {
        mode: 0,
        cityDefence: city.troops,
        rng: { nextByte: () => bytes[cursor++] ?? 0 },
      },
    );
    assert.equal(result.winner, "def");
    assert.ok(result.defScore > result.atkScore);
  }
  // 也必须经过真实resolveBattle入口：选中程昱为主守军、调用0x5130速算，
  // 而不是仅孤立验证公式或退化为0x4F8A临时城防。
  let battleCursor = 0;
  const app = makeApp(sc, {
    nextByte: () => [0, ...Array(12).fill(0)][battleCursor++] ?? 0,
  });
  assert.equal(resolveBattle(app, A, city), false);
  assert.equal(app.tactical(), null);
  assert.equal(city.faction, 0, "程昱守城胜后据点不得易主");
  assert.ok(D.troops < 600, "真实主守军必须收到0x5130六队战果回写");
  assert.notEqual(A.commandState, 8, "败退攻方不得被误写成守城胜军");
  assert.ok(
    A._retreat || A._active === false || A.dead,
    "攻城失败方必须撤向首都方向或经0x291A离场",
  );
  assert.ok(
    A._active === false || A.target,
    "仍存活的攻城失败方必须保留撤退目标，不能变成无目标圆点",
  );
}

// 人工构造道路点野战：仅用于验证0x4A7B胜方保留进攻目标并在后续
// 独立0x4ADE中占城。真实驻城军团位于节点中心，不走此入口。
{
  const sc = makeScenario(0);
  sc.generals = [
    general(0, "强攻", 1, {
      force: 15,
      lead: 15,
      field: 15,
      siege: 1,
      naval: 0,
    }),
    general(1, "弱守", 0, {
      force: 1,
      lead: 1,
      field: 1,
      siege: 15,
      naval: 0,
    }),
  ];
  const city = sc.cities[0];
  city.faction = 0;
  const A = legion("强攻", 1, city.x - 2, city.y);
  A.generalIdx = 0;
  A.slot = 0;
  A.target = city;
  A.targetCity = city.idx;
  A.targetNode = 0;
  A._march = {
    targetX: city.x,
    targetY: city.y,
    targetNode: 0,
    currentNode: 2,
    edgeId: 0,
    stride: -4,
    toNode: 0,
    points: [{ x: city.x - 1, y: city.y }],
    pointIndex: 0,
  };
  A._path = [{ x: city.x - 1, y: city.y }];
  A._engagement = {
    kind: "field",
    countdown: 1,
    target: { x: city.x - 1, y: city.y, faction: 0 },
  };
  const D = legion("弱守", 0, city.x - 1, city.y);
  D.generalIdx = 1;
  D.slot = 1;
  D.units = D.units.map((unit) => ({ ...unit, troops: 1000 }));
  D.troops = 600;
  D.morale = 200;
  setLegionDelegated(D, true);
  sc.legions = [A, D];
  const app = makeApp(sc, { nextByte: () => 0xff });
  aiTick(app, { runCityDaily: false, settleDaily: false });
  assert.equal(city.faction, 0, "野战本身不得交换据点归属");
  assert.equal(A.target, city, "野战胜方必须保留原攻城目标");
  assert.equal(A.x, city.x - 1, "另一军团槽可推进胜方一步，但不得直接换城");
  assert.equal(A._engagement, null, "野战结束后旧道路接战必须清除");
  assert.equal(city.faction, 0, "道路野战后据点仍不得提前易主");
  for (let step = 0; step < 16 && city.faction === 0; step++) {
    A.cooldown = 0;
    if (A._engagement) A._engagement.countdown = 1;
    aiTick(app, { runCityDaily: false, settleDaily: false });
  }
  assert.equal(city.faction, 1, "后续独立攻城胜利才允许据点易主");
  assert.equal(A.x, city.x);
  assert.equal(A.y, city.y);
  assert.equal(A.target, city, "破城胜军必须绑定新占据的据点中心");
  assert.equal(A.targetCity, city.idx);
}

// 真实aiTick接敌链必须在战果结算前保留_march，且同步速算返回后不能
// 再用旧攻击目标覆盖0x474A写入的撤退目标。该组合是现场“总是歼灭/
// 战后小圆点”的直接回归路径，孤立调用resolveBattle覆盖不到。
{
  const sc = makeScenario(0);
  sc.generals = [
    general(0, "呂布", 1, {
      force: 3,
      lead: 3,
      field: 1,
      siege: 1,
      naval: 0,
    }),
    general(1, "程昱", 0, {
      force: 15,
      lead: 15,
      field: 10,
      siege: 15,
      naval: 0,
    }),
  ];
  const city = sc.cities[0];
  city.faction = 0;
  city.troops = 89;
  const A = legion("呂布", 1, 255, 9);
  A.generalIdx = 0;
  A.slot = 0;
  A.status = 0xc4;
  A.target = city;
  A.targetNode = 0;
  A.cooldown = 0;
  A._march = {
    targetX: city.x,
    targetY: city.y,
    targetNode: 0,
    currentNode: 2,
    edgeId: 0,
    stride: -4,
    toNode: 0,
    points: [{ x: city.x, y: city.y }],
    pointIndex: 0,
  };
  A._path = [{ x: city.x, y: city.y }];
  A._engagement = {
    kind: "siege",
    countdown: 1,
    target: { cityIdx: city.idx },
  };
  const D = legion("程昱", 0, city.x, city.y);
  D.generalIdx = 1;
  D.slot = 1;
  D.status = 0xc4;
  sc.legions = [A, D];
  let cursor = 0;
  const app = makeApp(sc, {
    nextByte: () => [0, ...Array(12).fill(0)][cursor++] ?? 0,
  });
  aiTick(app, { runCityDaily: false, settleDaily: false });
  assert.equal(A.dead, undefined, "有原版有效退路的败军不得错误进入0x291A");
  assert.ok(A._retreat, "边内接敌上下文必须传递给0x487B");
  assert.notEqual(A.target, city, "败军不得继续保留旧攻击城目标");
  assert.ok(A.target, "同步战果返回后不得清空新撤退目标");
  assert.equal(A.targetCity, A.target.idx, "撤退目标必须同步原版+0x20城索引");
  assert.equal(A._engagement, null, "战果结算必须清除旧接敌状态");
  assert.ok(D.morale > 0, "守方胜军士气必须保留0x51B3权威回写值");
  const defenderMorale = D.morale;
  aiTick(app, { runCityDaily: false, settleDaily: true });
  assert.ok(
    D.morale > defenderMorale,
    "守方胜军留在节点时必须继续由0x2600恢复士气",
  );
}

// 接战发生在保存边点列的当前/下一点时，0x487B必须按战果坐标定位，
// 不能固定使用pointIndex-1退回前一格后误判无路、直接0x291A。
{
  const sc = makeScenario(0);
  sc.generals = [
    general(0, "弱攻", 1, { force: 1, lead: 1, siege: 1 }),
    general(1, "强守", 0, { force: 15, lead: 15, siege: 15 }),
  ];
  const city = sc.cities[0];
  sc.cities[2].faction = 1;
  const A = legion("弱攻", 1, 255, 9);
  A.generalIdx = 0;
  A.slot = 0;
  A.status = 0xc4;
  A.target = city;
  A.targetNode = 0;
  A._march = {
    targetX: city.x,
    targetY: city.y,
    targetNode: 0,
    currentNode: 2,
    edgeId: 0,
    stride: -4,
    toNode: 0,
    points: [
      { x: 255, y: 9 },
      { x: 254, y: 9 },
      { x: 253, y: 9 },
      { x: 252, y: 9 },
      { x: 251, y: 9 },
      { x: 250, y: 9 },
      { x: 250, y: 10 },
      { x: 250, y: 11 },
      { x: 250, y: 12 },
      { x: 250, y: 13 },
      { x: 249, y: 13 },
      { x: 248, y: 13 },
      { x: 247, y: 13 },
      { x: 246, y: 13 },
      { x: 246, y: 14 },
    ],
    pointIndex: 15,
  };
  A._engagement = {
    kind: "siege",
    countdown: 1,
    target: { cityIdx: city.idx },
  };
  setLegionDelegated(A, true);
  A.x = 255;
  A.y = 9;
  A.prevX = A.x;
  A.prevY = A.y;
  const D = legion("强守", 0, city.x, city.y);
  D.generalIdx = 1;
  D.slot = 1;
  sc.legions = [A, D];
  let cursor = 0;
  const app = makeApp(sc, {
    nextByte: () => [0, ...Array(12).fill(0)][cursor++] ?? 0,
  });
  aiTick(app, {
    runCityDaily: false,
    settleDaily: false,
    legionBatchStart: 0,
  });
  assert.equal(
    A._engagement?.kind,
    "siege",
    "旧Web pointIndex==points.length快照仍须兼容攻城重检",
  );
  // 直接完成倒计时，验证后续0x474A撤退；不能再依赖旧fixture中把
  // 据点中心伪装成边点的状态。
  A._engagement.countdown = 1;
  applyBattleResult(
    app,
    A,
    city,
    "def",
    500,
    [80, 80, 80, 80, 80, 80],
    city.troops,
    null,
    D,
    500,
    [80, 80, 80, 80, 80, 80],
  );
  assert.equal(A.dead, undefined, "接触点索引不得导致有路败军被清退");
  assert.ok(A._retreat, "战果坐标应恢复首都方向的有效撤退端点");
  assert.equal(A.target?.idx, 2, "省略节点格的边点列必须恢复己方端点");
  assert.ok(A.target, "战败存活军团必须保留撤退目标");
  assert.ok(A._march, "边内战败必须把0x487B点列恢复为活动撤退导航");
  assert.notDeepEqual(
    A._march.points.at(-1),
    { x: A.target.x, y: A.target.y },
    "0x487B只写目标字段，撤退边点列不得提前混入端点节点中心",
  );
  const battleX = A.x;
  const battleY = A.y;
  A.cooldown = 0;
  aiTick(app, { runCityDaily: false, settleDaily: false });
  assert.notDeepEqual(
    [A.x, A.y],
    [battleX, battleY],
    "败军冷却结束后必须沿当前边退走，不能卡在据点前",
  );
  assert.ok(A._retreat, "尚未抵达己方端点时不得提前清除撤退状态");
}

// 玩家攻方：status bit2决定战术/速算；无真实守军一律速算。
{
  const sc = makeScenario(1);
  const A = legion("甲", 0, 257, 9);
  const D = legion("乙", 1, 255, 9);
  sc.legions = [A, D];
  let app = makeApp(sc);
  assert.equal(resolveBattle(app, A, sc.cities[1]), true);
  assert.equal(app.tactical()?.D, D);

  setLegionDelegated(A, true);
  const rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  const expected = pureResult(sc, A, D, 0, rng, sc.cities[1].troops);
  app = makeApp(sc, rng);
  assert.equal(resolveBattle(app, A, sc.cities[1]), false);
  assert.equal(app.tactical(), null);
  assertSide(A, expected.attack, "delegated siege attacker");
  assertSide(D, expected.defence, "delegated siege defender");
}
{
  const sc = makeScenario(null);
  const A = legion("甲", 0, 257, 9);
  setLegionDelegated(A, false);
  sc.legions = [A];
  const rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  const synthetic = {
    leader: null,
    generalIdx: 0x7f,
    _commanderProfile: {
      ability: { force: 8, lead: 8, siege: 0, field: 0, naval: 0 },
    },
    faction: 0x18,
    troops: sc.cities[1].troops,
    morale: 0xff,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 200 })),
  };
  const expected = pureResult(sc, A, synthetic, 0, rng, sc.cities[1].troops);
  const app = makeApp(sc, rng);
  assert.equal(resolveBattle(app, A, sc.cities[1]), false);
  assert.equal(app.tactical(), null);
  assertSide(A, expected.attack, "neutral siege attacker");
  assert.equal(
    sc.cities[1].faction,
    0,
    "neutral city uses synthetic garrison and changes owner on victory",
  );
  assert.ok(
    sc.cities[1].troops > 0,
    "captured neutral city preserves 0x51B3 city troops",
  );
}

// 玩家真实主守军：委任走速算，未委任才进入战术层。
{
  const sc = makeScenario(0);
  const A = legion("乙", 1, 255, 9);
  const D = legion("甲", 0, 255, 9);
  sc.legions = [A, D];
  let app = makeApp(sc);
  assert.equal(resolveBattle(app, A, sc.cities[1]), true);
  assert.equal(app.tactical()?.D, D);

  setLegionDelegated(D, true);
  app = makeApp(sc);
  assert.equal(resolveBattle(app, A, sc.cities[1]), false);
  assert.equal(app.tactical(), null);
}

// 野战攻守双方同样按各自status bit2分流。
{
  const sc = makeScenario(1);
  const A = legion("甲", 0, 257, 9);
  const D = legion("乙", 1, 255, 9);
  sc.legions = [A, D];
  let app = makeApp(sc);
  assert.equal(resolveFieldBattle(app, A, D), true);
  setLegionDelegated(A, true);
  const rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  const expected = pureResult(sc, A, D, 1, rng);
  app = makeApp(sc, rng);
  assert.equal(resolveFieldBattle(app, A, D), false);
  assertSide(A, expected.attack, "delegated field attacker");
  assertSide(D, expected.defence, "delegated field defender");

  setLegionDelegated(A, false);
  sc.player_faction = 1;
  setLegionDelegated(D, true);
  app = makeApp(sc);
  assert.equal(resolveFieldBattle(app, A, D), false);
}

// 纯AI野战同样必须完整写回六队，并让败方进入0x474A撤退/fate链。
{
  const sc = makeScenario(1);
  sc.player_faction = null;
  sc.factions = [];
  const A = legion("甲", 0, 257, 9);
  const D = legion("乙", 1, 255, 9);
  D.morale = 100;
  D.units = D.units.map((unit, index) => ({
    ...unit,
    troops: index === 0 ? 10 : 0,
  }));
  D.troops = 1;
  sc.legions = [A, D];
  const rng = new OriginalBattleRng({ ch: 7, cl: 8, dh: 9 });
  const expected = pureResult(sc, A, D, 1, rng);
  const app = makeApp(sc, rng);
  assert.equal(resolveFieldBattle(app, A, D), false);
  assertSide(A, expected.attack, "AI field attacker");
  assertSide(D, expected.defence, "AI field defender");
  const loser = expected.winner === "atk" ? D : A;
  assert.ok(
    loser._retreat ||
      loser._active === false ||
      loser.dead ||
      loser.commandState === 8 ||
      loser.commandState === 10,
    "AI loser passes through continue/retreat/fate chain",
  );
}

// 无预建units的活动军团也必须从0x5130 side records初始化完整六队；
// 否则后续SAVE会写出首队0并被parse当成无效军团丢弃。
{
  const sc = makeScenario(1);
  sc.player_faction = null;
  sc.factions = [];
  const A = legion("甲", 0, 257, 9);
  const D = legion("乙", 1, 255, 9);
  delete A.units;
  delete D.units;
  sc.legions = [A, D];
  const rng = new OriginalBattleRng({ ch: 4, cl: 5, dh: 6 });
  const expected = pureResult(sc, A, D, 1, rng);
  const app = makeApp(sc, rng);
  assert.equal(resolveFieldBattle(app, A, D), false);
  assertSide(A, expected.attack, "unitless field attacker");
  assertSide(D, expected.defence, "unitless field defender");
  assert.deepEqual(
    A.units.map((unit) => unit.type),
    expected.attack.units.map((unit) => unit.type),
  );
  assert.deepEqual(
    D.units.map((unit) => unit.type),
    expected.defence.units.map((unit) => unit.type),
  );
}

// transition/battle gate active时，aiTick必须在cityDaily之前立即返回。
{
  const sc = makeScenario(1);
  const before = sc.cities[0].growth;
  sc.cities[0].sim = { morale: before, food: 100, troops: 100, cap: 120 };
  const app = makeApp(sc);
  app.engageTransition = { active: true };
  aiTick(app);
  assert.equal(sc.cities[0].growth, before);
  app.engageTransition = null;
  app.battleView.active = true;
  aiTick(app);
  assert.equal(sc.cities[0].growth, before);
}

process.stdout.write(
  "delegated autobattle OK: neutral siege + attacker/defender status-bit routing\n",
);
