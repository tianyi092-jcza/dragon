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

const { aiTick, resolveBattle, resolveFieldBattle } = await import(
  "../web/src/game/ai.js"
);
const { setLegionDelegated } = await import(
  "../web/src/game/legionmode.js"
);
const { resolveStrategicBattle } = await import(
  "../web/src/game/autobattle.js"
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
const { loadTerrain } = await import("../web/src/game/pathfind.js");
await loadTerrain();

const units = () =>
  [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 }));
const general = (idx, name, faction) => ({
  idx,
  name,
  faction,
  status: 1,
  active: true,
  attr: 0x80,
  battle_rating: 0,
  ability: { force: 80, lead: 70, field: 4, siege: 4, naval: 0 },
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
    { idx: 0, name: "甲城", faction: 0, x: 257, y: 9, troops: 120, growth: 150, defence: 140 },
    { idx: 1, name: "乙城", faction: cityFaction, x: 255, y: 9, troops: 120, growth: 150, defence: 140 },
    { idx: 2, name: "退路", faction: 1, x: 246, y: 15, troops: 120, growth: 150, defence: 140 },
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
const makeApp = (scenario, rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 })) => {
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
    _commanderProfile: { ability: { force: 8, lead: 8, siege: 0, field: 0, naval: 0 } },
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
  assert.equal(sc.cities[1].faction, 0, "neutral city uses synthetic garrison and changes owner on victory");
  assert.ok(sc.cities[1].troops > 0, "captured neutral city preserves 0x51B3 city troops");
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
