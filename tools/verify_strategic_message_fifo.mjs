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
globalThis.fetch = async (url) => {
  if (String(url).endsWith("talk.json")) {
    const strings = Array.from({ length: 1023 }, () => []);
    strings[37] = ["被敵軍所擒的\\1大人回來了。"];
    strings[57] = ["外交官前來報告。"];
    strings[70] = ["\\2發生了暴風雨。"];
    strings[380] = ["交涉成功。"];
    strings[442] = ["個性第二段。"];
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const { GameBar } = await import("../web/src/ui/gamebar.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function dueTimer(ms = 3000) {
  return [...scheduled.entries()].find(([, timer]) => timer.ms === ms);
}

function fireTimer(id) {
  const timer = scheduled.get(id);
  assert.ok(timer, `missing timer ${id}`);
  scheduled.delete(id);
  timer.callback();
}

function cardText(card) {
  return card.lines
    .flat()
    .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
    .join("");
}

function fixture() {
  const holdStates = [];
  const clock = {
    hold: false,
    setHold(value) {
      this.hold = Boolean(value);
      holdStates.push(this.hold);
    },
  };
  const app = {
    scenario: {
      player_faction: 0,
      factions: [
        { idx: 0, monarch_idx: 0, monarch: "曹操", gold: 10000 },
        { idx: 1, monarch_idx: 1, monarch: "劉備", gold: 10000 },
      ],
      generals: [
        { idx: 0, name: "曹操", portrait: 0, ability: { politics: 12 } },
        { idx: 1, name: "劉備", portrait: 1, ability: { politics: 10 } },
      ],
      cities: [],
      legions: [],
      diplomacy: [
        [0xff, 0xd0],
        [0xd0, 0xff],
      ],
      monarchOf(faction) {
        return this.generals[faction?.monarch_idx] ?? null;
      },
    },
    clock,
    view: { draw() {} },
    hud: {
      refreshInfo() {},
      buildLegend() {},
      refreshTrust() {},
      flashEvent() {},
    },
    battleView: { active: false },
    engageTransition: { active: false },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  bar.imgs = { messageNpc: {} };
  return { app, bar, clock, holdStates };
}

// 普通战略消息必须严格FIFO；右键与旧自动关闭timer竞争时回调只执行一次。
{
  scheduled.clear();
  const { bar, clock } = fixture();
  const closes = [];
  bar.enqueueStrategicMessage({ text: "A", onClose: () => closes.push("A") });
  bar.enqueueStrategicMessage({
    gen: { idx: 3, portrait: 3 },
    text: "B",
    onClose: () => closes.push("B"),
  });
  bar.enqueueStrategicMessage({ text: "C", onClose: () => closes.push("C") });
  await flush();
  assert.equal(bar.generalCard.lines[0], "A");
  assert.equal(bar._strategicMessageQueue.length, 2);
  assert.equal(clock.hold, true);
  const [aTimerId, aTimer] = dueTimer();
  assert.equal(aTimer.ms, 3000);
  const staleA = aTimer.callback;
  fireTimer(aTimerId);
  await flush();
  assert.deepEqual(closes, ["A"]);
  assert.equal(bar.generalCard.lines[0], "B");
  assert.equal(clock.hold, true);
  const [bTimerId, bTimer] = dueTimer();
  const staleB = bTimer.callback;
  bar.closeGeneralCard();
  await flush();
  assert.deepEqual(closes, ["A", "B"]);
  assert.equal(bar.generalCard.lines[0], "C");
  staleB();
  staleA();
  await flush();
  assert.deepEqual(closes, ["A", "B"]);
  assert.equal(bar.generalCard.lines[0], "C");
  const [cTimerId] = dueTimer();
  fireTimer(cTimerId);
  await flush();
  assert.deepEqual(closes, ["A", "B", "C"]);
  assert.equal(bar.generalCard, null);
  assert.equal(bar._strategicMessageActive, false);
  assert.equal(clock.hold, false);
  assert.equal(scheduled.has(bTimerId), false);
}

// 已确认TALK索引的规则消息使用同一FIFO并按占位符格式化。
{
  scheduled.clear();
  const { bar } = fixture();
  bar.enqueueTalkMessage({
    talkIndex: 70,
    cityName: "許昌",
    kind: "disaster-area",
  });
  await flush();
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => part.text)
      .join(""),
    "許昌發生了暴風雨。",
  );
}

// 0x075B个性选择器展开为紧邻的第二条FIFO消息；第一段关闭前不得显示。
{
  scheduled.clear();
  const { bar, clock } = fixture();
  const gen = { idx: 3, name: "荀彧", portrait: 3, talk_idx: 4 };
  bar.enqueueTalkMessage({
    gen,
    talkIndex: 37,
    generalName: "荀彧",
    personalitySelector: 0x19a,
    kind: "general-returned",
  });
  await flush();
  assert.equal(cardText(bar.generalCard), "被敵軍所擒的荀彧大人回來了。");
  assert.equal(bar._strategicMessageQueue.length, 1);
  assert.equal(bar._strategicMessageQueue[0].talkIndex, 442);
  assert.equal(clock.hold, true);
  const [firstTimerId] = dueTimer();
  fireTimer(firstTimerId);
  await flush();
  assert.equal(cardText(bar.generalCard), "個性第二段。");
  assert.equal(clock.hold, true);
}

// 返回标题/reset后，等待头像的旧剧本消息不得复活或执行旧回调。
{
  scheduled.clear();
  const { bar } = fixture();
  let resolvePortrait;
  globalThis.Image = class {
    set src(_value) {
      resolvePortrait = () => this.onload?.();
    }
  };
  let closes = 0;
  bar.enqueueStrategicMessage({
    gen: { idx: 9, portrait: 99 },
    text: "stale",
    onClose: () => closes++,
  });
  await flush();
  assert.equal(bar._strategicMessageActive, true);
  bar.resetScenarioUi();
  resolvePortrait();
  await flush();
  assert.equal(bar.generalCard, null);
  assert.equal(bar._strategicMessageQueue.length, 0);
  assert.equal(closes, 0);
  globalThis.Image = class {
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
}

// 高优先级模态存在时不得出队；解除后继续drain。
{
  scheduled.clear();
  globalThis.performance = { now: () => 2000 };
  const { bar } = fixture();
  bar.settingsOpen = true;
  bar.enqueueStrategicMessage({ text: "blocked" });
  await flush();
  assert.equal(bar.generalCard, null);
  assert.equal(bar._strategicMessageQueue.length, 1);
  bar.settingsOpen = false;
  bar.onModalClosed();
  await flush();
  assert.equal(bar.generalCard.lines[0], "blocked");
}

// 战术层活跃时被动消息不得出队；战术关闭后由统一模态钩子恢复FIFO。
{
  scheduled.clear();
  const { app, bar } = fixture();
  app.battleView.active = true;
  bar.enqueueTalkMessage({ talkIndex: 63, targetName: "呂布" });
  await flush();
  assert.equal(bar.generalCard, null);
  assert.equal(bar._strategicMessageQueue.length, 1);
  app.battleView.active = false;
  bar.onModalClosed();
  await flush();
  assert.notEqual(bar.generalCard, null);
  assert.equal(bar._strategicMessageQueue.length, 0);
}

// 入站外交结果只在最终结果框关闭时提交，且右键关闭只提交一次。
{
  scheduled.clear();
  const { app, bar, clock } = fixture();
  let commits = 0;
  const opened = await bar._showIncomingDiplomacyRequest({
    type: "incoming-assistance",
    requesterFaction: app.scenario.factions[1],
    targetFaction: app.scenario.factions[1],
    result: { outcome: 0, goldRequired: 0 },
    onResolve() {
      commits++;
    },
  });
  assert.equal(opened, true);
  bar._strategicMessageActive = true;
  bar._clockHoldRequested = true;
  bar.syncClock();
  assert.equal(bar.proposalAudience.step, "incoming_diplomacy_choice");
  await bar._finishIncomingDiplomacy("accept");
  assert.equal(bar.proposalAudience.step, "incoming_diplomacy_result");
  assert.equal(commits, 0);
  assert.equal(clock.hold, true);
  const [, resultTimer] = dueTimer();
  assert.equal(resultTimer.ms, 3000);
  const stale = resultTimer.callback;
  bar._clickProposalAudience(0, 0, 2);
  assert.equal(commits, 1);
  assert.equal(bar.proposalAudience, null);
  assert.equal(clock.hold, false);
  stale();
  assert.equal(commits, 1);
}

process.stdout.write(
  "strategic message FIFO OK: order, 3s timer, right-click once, hold/modal gate, incoming commit boundary\n",
);
