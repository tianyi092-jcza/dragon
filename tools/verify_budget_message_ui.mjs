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
  assert.equal(timer.ms, 3000);
  return { id, timer };
}

function choiceRect(bar) {
  bar.proposalAudience.reasonsRect = {
    x: 0,
    y: 0,
    w: 90,
    h: 90,
    items: ["答應", "提示金額", "拒絕"],
  };
}

async function leftAdvance(bar) {
  bar.click(0, 0, 0);
  await flush();
}

function fixture() {
  const player = {
    idx: 0,
    active: true,
    monarch_idx: 0,
    advisor_idx: 0,
    monarch: "曹操",
    money: 50000,
    gold: 50000,
  };
  const target = {
    idx: 1,
    active: true,
    monarch_idx: 2,
    monarch: "劉備",
    diplomat_idx: 3,
  };
  const governor = {
    idx: 1,
    name: "荀彧",
    faction: 0,
    status: 2,
    portrait: 1,
    talk_idx: 0,
    assignment_budget: 0,
  };
  const envoy = {
    idx: 3,
    name: "程昱",
    faction: 0,
    status: 3,
    portrait: 3,
    talk_idx: 0,
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

// Type4: TALK56→内政官请求→选择→军师回应→内政官回应；最后一段关闭才提交。
{
  scheduled.clear();
  const { bar, clock, player, governor } = fixture();
  bar.enqueueDomesticBudgetReport({ cityIdx: 0, requested: 1000 });
  bar.enqueueStrategicMessage({ text: "NEXT" });
  await flush();
  assert.equal(bar.proposalAudience?.step, "budget_report");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK56");
  assert.equal(clock.hold, true);
  assert.equal(bar._strategicMessageQueue.length, 1);

  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "budget_request");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK278");
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_choice");
  choiceRect(bar);

  bar.click(10, 10, 0);
  bar.click(10, 10, 0); // 快速双击也只能进入一次提交准备
  await flush();
  assert.equal(bar.proposalAudience?.step, "budget_advisor_result");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK284");
  assert.equal(player.money, 50000);
  assert.equal(governor.assignment_budget, 0);

  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK288");
  assert.equal(player.money, 50000);
  const { timer: staleTimer } = onlyTimer();
  bar.click(0, 0, 2);
  await flush();
  assert.equal(player.money, 49000);
  assert.equal(governor.assignment_budget, 7);
  assert.equal(bar.generalCard?.lines?.[0], "NEXT");
  assert.equal(clock.hold, true);
  staleTimer.callback();
  assert.equal(player.money, 49000);
  assert.equal(governor.assignment_budget, 7);
}

// Type4：选择页右键不拒绝；键盘右键退回选择；自定义1..499不钳为500。
{
  scheduled.clear();
  const { bar, player, governor } = fixture();
  bar.enqueueDomesticBudgetReport({ cityIdx: 0, requested: 100 });
  await flush();
  assert.equal(bar.proposalAudience?.budgetRequested, 500);
  await leftAdvance(bar);
  await leftAdvance(bar);
  choiceRect(bar);
  bar.click(10, 10, 2);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_choice");
  bar.click(10, 35, 0);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_keypad");
  bar.click(0, 0, 2);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_choice");
  choiceRect(bar);
  bar.click(10, 35, 0);
  bar.keypadDialog.val = 127;
  const keypad = bar.keypadDialog;
  bar.click(keypad.ox + 128, keypad.oy + 92, 0);
  await flush();
  assert.equal(bar.proposalAudience?.step, "budget_advisor_result");
  assert.equal(player.money, 50000);
  await leftAdvance(bar);
  await leftAdvance(bar);
  assert.equal(player.money, 49873);
  assert.equal(governor.assignment_budget, 0);
}

// 建议额为0时0x39E8跳过三选项，按内政官→军师→内政官三段自动返回。
{
  scheduled.clear();
  const { bar, player, governor } = fixture();
  governor.talk_idx = 7; // 相关对话选择器按7-3归一为风格4
  bar.enqueueDomesticBudgetReport({ cityIdx: 0, requested: 0 });
  await flush();
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "budget_zero_worker");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK312");
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "budget_zero_advisor");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK313");
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK318");
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience, null);
  assert.equal(player.money, 50000);
  assert.equal(governor.assignment_budget, 0);
}

// Type5整段屏蔽右键/羽扇，只允许左键走完；最后回应关闭时once提交。
{
  scheduled.clear();
  const { bar, clock, player, envoy, scenario } = fixture();
  const envoyState = scenario.envoys[1];
  bar.enqueueEnvoyBudgetReport({ targetIdx: 1, requested: 1280 });
  await flush();
  assert.equal(bar.proposalAudience?.step, "budget_report");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK57");
  bar.click(338, 5, 0);
  assert.equal(bar.proposalAudience?.step, "budget_report");
  bar.click(0, 0, 2);
  assert.equal(bar.proposalAudience?.step, "budget_report");

  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "budget_request");
  assert.equal(bar.proposalAudience?.monarchLines?.[0]?.[0]?.text, "TALK319");
  bar.click(0, 0, 2);
  assert.equal(bar.proposalAudience?.step, "budget_request");
  await leftAdvance(bar);
  choiceRect(bar);
  bar.click(10, 35, 2);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_choice");
  bar.click(10, 35, 0);
  const keypad = bar.keypadDialog;
  bar.click(keypad.ox + 128, keypad.oy + 92, 2);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_keypad");
  bar.click(keypad.ox + 128, keypad.oy + 92, 0);
  bar.click(keypad.ox + 128, keypad.oy + 92, 0); // 键盘确认快速双击仍只准备一次
  await flush();
  assert.equal(bar.proposalAudience?.step, "budget_advisor_result");
  assert.equal(player.money, 50000);
  assert.equal(envoy.assignment_budget, 0);
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  assert.equal(player.money, 50000);
  bar.click(0, 0, 2);
  assert.equal(bar.proposalAudience?.step, "envoy_budget_result");
  await leftAdvance(bar);
  assert.equal(bar.proposalAudience, null);
  assert.equal(player.money, 48720);
  assert.equal(envoy.assignment_budget, 10);
  assert.equal(envoyState.budget, 10);
  assert.equal(clock.hold, false);
}

process.stdout.write(
  "budget message UI OK: original type4/type5 talk order, deferred once commit, amount semantics, RMB/fan guards and FIFO hold\n",
);
