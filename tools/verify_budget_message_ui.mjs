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

function resultTimer() {
  assert.equal(scheduled.size, 1);
  const [id, timer] = [...scheduled.entries()][0];
  assert.equal(timer.ms, 3000);
  return { id, timer };
}

function fixture() {
  const player = {
    idx: 0,
    active: true,
    monarch_idx: 0,
    monarch: "曹操",
    money: 50000,
    gold: 50000,
  };
  const target = {
    idx: 1,
    active: true,
    monarch_idx: 2,
    monarch: "劉備",
  };
  const governor = {
    idx: 1,
    name: "荀彧",
    faction: 0,
    status: 2,
    portrait: 1,
    assignment_budget: 0,
  };
  const envoy = {
    idx: 3,
    name: "程昱",
    faction: 0,
    status: 3,
    portrait: 3,
    assignment_budget: 0,
  };
  const city = {
    idx: 0,
    name: "許昌",
    faction: 0,
    governor: 1,
  };
  const scenario = {
    player_faction: 0,
    factions: [player, target],
    generals: [
      { idx: 0, name: "曹操", faction: 0, portrait: 0 },
      governor,
      { idx: 2, name: "劉備", faction: 1, portrait: 2 },
      envoy,
    ],
    cities: [city],
    legions: [],
    envoys: { 1: { gen_idx: 3, name: "程昱", budget: 0 } },
    monarchOf(faction) {
      return this.generals[faction?.monarch_idx] ?? null;
    },
  };
  const clock = {
    hold: false,
    setHold(value) {
      this.hold = Boolean(value);
    },
  };
  const app = {
    scenario,
    clock,
    view: { draw() {} },
    hud: { refreshInfo() {}, buildLegend() {} },
    battleView: { active: false },
    engageTransition: { active: false },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  return { bar, clock, player, target, governor, envoy, city, scenario };
}

// Type4: audience opens under FIFO hold; accepting commits immediately, result closes
// after 3 seconds, and a queued rule message cannot overtake it.
{
  scheduled.clear();
  const { bar, clock, player, governor } = fixture();
  bar.enqueueDomesticBudgetReport({ cityIdx: 0, requested: 1000 });
  bar.enqueueStrategicMessage({ text: "NEXT" });
  await flush();
  assert.equal(bar.proposalAudience?.type, "domestic-budget");
  assert.equal(bar.proposalAudience?.step, "envoy_budget_choice");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK56");
  assert.equal(bar.proposalAudience?.advLines?.[0]?.[0]?.text, "TALK278");
  assert.equal(clock.hold, true);
  assert.equal(bar._strategicMessageQueue.length, 1);

  bar.proposalAudience.reasonsRect = {
    x: 0,
    y: 0,
    w: 90,
    h: 90,
    items: ["答應", "提示金額", "拒絕"],
  };
  bar._clickProposalAudience(10, 10, 0);
  await flush();
  assert.equal(player.money, 49000);
  assert.equal(governor.assignment_budget, 7);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK284");
  const { id, timer } = resultTimer();
  scheduled.delete(id);
  timer.callback();
  await flush();
  assert.equal(bar.generalCard?.lines?.[0], "NEXT");
  assert.equal(clock.hold, true);
}

// Type5: right-click on the result closes it; it must not re-run refusal or mutate twice.
{
  scheduled.clear();
  const { bar, clock, player, envoy, scenario } = fixture();
  const envoyState = scenario.envoys[1];
  bar.enqueueEnvoyBudgetReport({ targetIdx: 1, requested: 1280 });
  await flush();
  assert.equal(bar.proposalAudience?.type, "envoy-budget");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK57");
  assert.equal(bar.proposalAudience?.advLines?.[0]?.[0]?.text, "TALK319");
  await bar._finishBudgetAudience(1280, "accept");
  assert.equal(player.money, 48720);
  assert.equal(envoy.assignment_budget, 10);
  assert.equal(envoyState.budget, 10);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  const [, staleTimer] = [...scheduled.entries()][0];
  bar._clickProposalAudience(0, 0, 2);
  assert.equal(bar.proposalAudience, null);
  assert.equal(player.money, 48720);
  assert.equal(clock.hold, false);
  staleTimer.callback();
  assert.equal(player.money, 48720);
}

process.stdout.write(
  "budget message UI OK: type4/type5 FIFO hold, choice commit, 3s/right-click result close\n",
);
