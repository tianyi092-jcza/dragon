import assert from "node:assert/strict";

const scheduled = new Map();
let nextTimerId = 1;
globalThis.innerWidth = 640;
globalThis.innerHeight = 400;
globalThis.setTimeout = (callback, ms) => {
  const id = nextTimerId++;
  scheduled.set(id, { callback, ms });
  return id;
};
globalThis.clearTimeout = (id) => scheduled.delete(id);
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  if (String(url).endsWith("talk.json")) {
    const strings = Array.from({ length: 1023 }, (_, index) => [
      `TALK${index}`,
    ]);
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};

const { GameBar } = await import("../web/src/ui/gamebar.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function onlyTimer() {
  assert.equal(scheduled.size, 1);
  const [id, timer] = [...scheduled.entries()][0];
  return { id, timer };
}

function fixture({ betterRelocation = true, deploying = false, deployable = true } = {}) {
  const me = {
    idx: 0,
    active: true,
    monarch_idx: 0,
    monarch: "曹操",
    capital: 0,
    gold: 10000,
    money: 10000,
    bellicosity: 15,
    reserve_cav: deployable ? 300 : 100,
    reserve_inf: deployable ? 300 : 100,
    reserve_arc: deployable ? 300 : 100,
  };
  const cities = [
    { idx: 0, name: "許昌", faction: 0, x: 10, y: 10, type: 2, prod: 100 },
    {
      idx: 1,
      name: "洛陽",
      faction: 0,
      x: 20,
      y: 20,
      type: betterRelocation ? 1 : 3,
      prod: betterRelocation ? 120 : 80,
    },
  ];
  const monarch = {
    idx: 0,
    name: "曹操",
    faction: 0,
    status: deploying ? 1 : 0,
    portrait: 0,
    talk_idx: 0,
  };
  const advisor = {
    idx: 1,
    name: "荀彧",
    faction: 0,
    status: 0,
    portrait: 1,
    ability: { politics: 15 },
  };
  const scenario = {
    player_faction: 0,
    trust: 200,
    factions: [me],
    generals: [monarch, advisor],
    cities,
    legions: [],
    advisor_idx: 1,
    capital: 0,
    monarchOf(faction) {
      return this.generals[faction?.monarch_idx] ?? null;
    },
    citiesOf(faction) {
      return this.cities.filter((city) => city.faction === faction);
    },
  };
  const clock = {
    hold: false,
    setHold(value) {
      this.hold = Boolean(value);
    },
  };
  const view = {
    cam: { x: 0, y: 0 },
    cityPixel(city) {
      return [city.x, city.y];
    },
    clampCam() {},
    draw() {},
  };
  const app = {
    scenario,
    clock,
    view,
    hud: { refreshTrust() {}, refreshInfo() {}, flashEvent() {} },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  bar.showCityCard = () => {};
  return { bar, clock, scenario, me, monarch, cities };
}

// 0x6909: successful relocation is committed only after the final monarch line closes.
{
  scheduled.clear();
  const { bar, clock, scenario, me, cities } = fixture();
  await bar.showRelocateCapitalAudience(cities[1]);
  await bar._advanceToMonarchReaction();
  assert.equal(bar.proposalAudience?.step, "done");
  assert.equal(me.capital, 0);
  assert.equal(scenario.capital, 0);
  assert.equal(scenario.trust, 200);
  assert.equal(clock.hold, true);
  const { id, timer } = onlyTimer();
  assert.equal(timer.ms, 3000);
  scheduled.delete(id);
  timer.callback();
  await flush();
  assert.equal(me.capital, 1);
  assert.equal(scenario.capital, 1);
  assert.equal(scenario.trust, 210);
}

// Right-click on that final line uses the same commit boundary and executes once.
{
  scheduled.clear();
  const { bar, scenario, me, cities } = fixture();
  await bar.showRelocateCapitalAudience(cities[1]);
  await bar._advanceToMonarchReaction();
  const [, stale] = [...scheduled.entries()][0];
  bar._clickProposalAudience(0, 0, 2);
  assert.equal(me.capital, 1);
  assert.equal(scenario.trust, 210);
  stale.callback();
  assert.equal(scenario.trust, 210);
}

// 迁都失败：信赖处罚只执行一次，最终对白关闭前仍保持clock hold。
{
  scheduled.clear();
  const { bar, clock, scenario, cities } = fixture({ betterRelocation: false });
  await bar.showRelocateCapitalAudience(cities[1]);
  await bar._advanceToMonarchReaction();
  assert.equal(scenario.trust, 180);
  assert.equal(clock.hold, true);
  const { id, timer } = onlyTimer();
  scheduled.delete(id);
  timer.callback();
  await flush();
  assert.equal(scenario.trust, 180);
  assert.equal(clock.hold, false);
}

// TALK64：已出阵君主使用3秒/右键统一关闭，期间保持暂停。
{
  scheduled.clear();
  const { bar, clock } = fixture({ deploying: true });
  await bar.showMonarchDeployAudience();
  assert.equal(bar.generalCard.lines.flat().map((part) => part.text).join(""), "TALK64");
  assert.equal(clock.hold, true);
  const [, stale] = [...scheduled.entries()][0];
  bar.closeGeneralCard();
  assert.equal(clock.hold, false);
  stale.callback();
  assert.equal(clock.hold, false);
}

// 0x699E: reserves and monarch legion are likewise unchanged until final close.
{
  scheduled.clear();
  const { bar, clock, scenario, me, monarch } = fixture();
  await bar.showMonarchDeployAudience();
  await bar._advanceToMonarchReaction();
  assert.equal(bar.proposalAudience?.step, "done");
  assert.equal(me.reserve_cav, 300);
  assert.equal(me.reserve_inf, 300);
  assert.equal(me.reserve_arc, 300);
  assert.equal(monarch.status, 0);
  assert.equal(scenario.legions.length, 0);
  assert.equal(clock.hold, true);
  const { id, timer } = onlyTimer();
  assert.equal(timer.ms, 3000);
  scheduled.delete(id);
  timer.callback();
  await flush();
  assert.equal(me.reserve_cav, 100);
  assert.equal(me.reserve_inf, 100);
  assert.equal(me.reserve_arc, 100);
  assert.equal(monarch.status, 1);
  assert.equal(scenario.legions.length, 1);
  assert.equal(scenario.legions[0].leader, "曹操");
  assert.deepEqual(
    scenario.legions[0].units.map((unit) => unit.type),
    [1, 1, 3, 3, 2, 2],
    "君主亲征也必须使用原始1骑/3步/2弓编成码",
  );
}

// 君主无法出阵：拒绝对白不修改兵池/军团，关闭后恢复计时。
{
  scheduled.clear();
  const { bar, clock, scenario, me, monarch } = fixture({ deployable: false });
  await bar.showMonarchDeployAudience();
  await bar._advanceToMonarchReaction();
  assert.equal(bar.proposalAudience?.step, "done");
  assert.equal(me.reserve_cav, 100);
  assert.equal(monarch.status, 0);
  assert.equal(scenario.legions.length, 0);
  assert.equal(clock.hold, true);
  const { id, timer } = onlyTimer();
  scheduled.delete(id);
  timer.callback();
  await flush();
  assert.equal(scenario.legions.length, 0);
  assert.equal(clock.hold, false);
}

process.stdout.write(
  "advice commit boundary OK: relocation/deploy success and failure, TALK64, final close\n",
);
