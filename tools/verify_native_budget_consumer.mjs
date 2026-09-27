import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  tickStrategicWarEvents,
  clearNativeUiContinuations,
} from "../web/src/game/ai.js";
import {
  beginScenarioDomesticBudgetEvent,
  beginScenarioEnvoyBudgetEvent,
  commitScenarioBudgetEvent,
  beginScenarioTruceEnvoyResult,
  scenarioTruceEnvoyOutcome,
  commitScenarioTruceEnvoyResult,
  beginScenarioAssistanceEnvoyResult,
  scenarioAssistanceEnvoyOutcome,
  commitScenarioAssistanceEnvoyResult,
  describeEnvoyResultMessageState,
} from "../web/src/game/navigation/scenarionegotiation.js";
import { classifyOriginalBudgetOutcome39E8 } from "../web/src/game/navigation/originalbudgetconsumer.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length).toString("hex");

function fixture({ player = 5 } = {}) {
  const factions = Array.from({ length: 22 }, (_, idx) => ({
    idx,
    attr: 0x80,
    monarch_idx: idx,
    advisor_idx: null,
    diplomat_idx: null,
    target_faction: null,
    reserve_cav: 800,
    reserve_arc: 0,
    reserve_inf: 0,
    n_cities: 10,
    nativeGeneralCount: 5,
    bellicosity: 0,
    money: 100000,
  }));
  const rows = Array.from({ length: 24 }, () => Array(24).fill(0));
  const generals = Array.from({ length: 0x80 }, (_, idx) => ({
    idx,
    name: `將${idx}`,
    talk_idx: idx % 8,
    ability: { politics: 0 },
    status: 0,
    faction: null,
    origFaction: null,
    assignment_budget: 0,
  }));
  const legions = Array.from({ length: 128 }, (_, slot) => ({
    slot,
    status: 0,
  }));
  const cities = Array.from({ length: 0xc0 }, (_, idx) => ({
    idx,
    faction: null,
    governor: null,
    _strategicLastFaction: 0x18,
  }));
  const slots = Array(256).fill(null);
  const scenario = {
    player_faction: player,
    nativePlayerFactionPointer: player * 0x40,
    nativeFactionSlots: { version: 1, records: factions },
    nativeDiplomacyMatrix: { version: 1, rows },
    nativeLegionSlots: { version: 1, records: legions },
    strategicEventSlots: slots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
    factions: factions.slice(0, 3),
    diplomacy: rows.slice(0, 3),
    generals,
    cities,
  };
  const rngQueue = [];
  let rngCalls = 0;
  const rng = {
    nextByte() {
      rngCalls++;
      return rngQueue.length ? rngQueue.shift() : 0;
    },
  };
  const messages = [];
  const budgets = [];
  const app = {
    scenario,
    clock: { hold: false },
    gamebar: {
      syncClock() {},
      enqueueTalkMessage(message) {
        messages.push(message);
      },
      enqueueDomesticBudgetReport(report) {
        budgets.push({ kind: "domestic", ...report });
      },
      enqueueEnvoyBudgetReport(report) {
        budgets.push({ kind: "envoy", ...report });
      },
    },
    originalRng: rng,
  };
  return {
    app,
    scenario,
    factions,
    rows,
    generals,
    legions,
    cities,
    slots,
    rng,
    rngQueue,
    messages,
    budgets,
    rngCalls: () => rngCalls,
  };
}

test("fixed KI dispatch table and type4-7 consumer bytes", () => {
  assert.equal(
    raw(0x31f2, 24),
    "0c3220326232a932e93227338833ea3385349634a634b134",
    "type1..12 jump table",
  );
  assert.equal(raw(0x351a, 12), "32c0d1e8d1e88bf0803c80c3", "351A gate");
  assert.equal(
    raw(0x32a9, 64),
    "32c0d1e8d1e8d1e80540088bd88a671980fcff742a32c0d1e8d1e8d1e805404250538bfce80edab93800b093e838555b5e8bc2b91601e896ede80307e8eeedc3",
    "type4 32A9",
  );
  assert.equal(
    raw(0x32e9, 62),
    "32c0d1e8d1e80500008bd88a672a80fcff742a32c0d1e8d1e8d1e805404250538bfce8d0d9b93900b093e8fa545b5e8bc2b93f01e858ede8c506e8b0edc3",
    "type5 32E9",
  );
  assert.equal(
    raw(0x3327, 97),
    "e8f001725b8a442a3cff7454b4ff50568bfce8a2d9b93900b093e8cc545e582e8b3efd0ce8760373178a7c2a32dbd1ebd1ebd1eb8a874142b93a00e8ab54eb20b92b00e8d0083c027316e879028bc6d1e0d1e02ea0ff0ce87712e8b20ee8e202c3",
    "type6 3327",
  );
  assert.equal(
    raw(0x3388, 98),
    "e88f01725c8bde8ae2e88601725387de8a442a3cff744ab4ff50568bfce836d9b93900b093e860545e582e8b3efd0ce8580373178a7c2a32dbd1ebd1ebd1eb8a874142b93a00e83f54eb16b92f00e864083c02730ce80d02d1e3d1e38ad7e83d01c3",
    "type7 3388",
  );
});

test("fixed KI 39E8 clamp, keypad, outcome and commit bytes", () => {
  assert.equal(
    raw(0x39f1, 12),
    "23c074083df4017303b8f401",
    "39F1 entry clamp 1..499 -> 500",
  );
  assert.equal(
    raw(0x3a64, 22),
    "b8010033db9a00000010ba5800bbb800b83075e8f441",
    "keypad call cap 0x7530",
  );
  assert.equal(raw(0x7ca2, 4), "33f68bc6", "7C6E default SI=0");
  assert.equal(
    raw(0x3a88, 35),
    "8946088b5e0a23c074143bc374097213c746020303eb0cc746020000eb05c746020202",
    "outcome classification 0/1/2/3",
  );
  assert.equal(
    raw(0x3ad9, 31),
    "807e020274198b4608d1e088641ad1e832d22e8b36fd0ce8481bb004e88823",
    "commit: +1A write before 563B deduct",
  );
});

test("39E8 entry clamp only raises 1..499 to 500", () => {
  const f = fixture();
  f.cities[3].governor = 9;
  const clamp = (amount) =>
    beginScenarioDomesticBudgetEvent(f.scenario, {
      type: 4,
      arg0: 3,
      arg1: amount & 0xff,
      arg2: amount >> 8,
    }).suggested;
  assert.equal(clamp(0), 0);
  assert.equal(clamp(1), 500);
  assert.equal(clamp(499), 500);
  assert.equal(clamp(500), 500);
  assert.equal(clamp(21000), 21000);
  assert.equal(f.rngCalls(), 0, "clamp consumes no RNG");
});

test("type4 gate: FF governor silently consumes; audience carries CX=116h", () => {
  const f = fixture();
  const empty = beginScenarioDomesticBudgetEvent(f.scenario, {
    type: 4,
    arg0: 3,
    arg1: 0x88,
    arg2: 0x13, // 5000
  });
  assert.equal(empty.phase, "return");
  assert.equal(empty.status, "no-governor");
  f.cities[3].governor = 9;
  const state = beginScenarioDomesticBudgetEvent(f.scenario, {
    type: 4,
    arg0: 3,
    arg1: 0x88,
    arg2: 0x13,
  });
  assert.equal(state.phase, "audience");
  assert.equal(state.kind, "domestic");
  assert.equal(state.general, 9);
  assert.equal(state.requestTalkBase, 0x116);
  assert.equal(state.suggested, 5000);
  assert.equal(f.rngCalls(), 0);
});

test("type5 gate: FF diplomat silently consumes; audience carries CX=13Fh", () => {
  const f = fixture();
  const empty = beginScenarioEnvoyBudgetEvent(f.scenario, {
    type: 5,
    arg0: 7,
    arg1: 0x58,
    arg2: 0x1e, // 7760
  });
  assert.equal(empty.phase, "return");
  assert.equal(empty.status, "no-diplomat");
  f.factions[7].diplomat_idx = 21;
  const state = beginScenarioEnvoyBudgetEvent(f.scenario, {
    type: 5,
    arg0: 7,
    arg1: 0x58,
    arg2: 0x1e,
  });
  assert.equal(state.phase, "audience");
  assert.equal(state.kind, "envoy");
  assert.equal(state.general, 21);
  assert.equal(state.requestTalkBase, 0x13f);
  assert.equal(state.suggested, 0x1e58, "7768");
});

test("39E8 outcome classification matches 3A88..3AA6", () => {
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(0, 0, 5000), {
    outcome: 0,
    grant: 5000,
  });
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(2, 0, 5000), {
    outcome: 2,
    grant: 0,
  });
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(1, 0, 5000), {
    outcome: 2,
    grant: 0,
  });
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(1, 5000, 5000), {
    outcome: 0,
    grant: 5000,
  });
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(1, 3000, 5000), {
    outcome: 1,
    grant: 3000,
  });
  assert.deepEqual(classifyOriginalBudgetOutcome39E8(1, 8000, 5000), {
    outcome: 3,
    grant: 8000,
  });
});

test("39E8 commit writes +1A before deducting the player treasury", () => {
  const f = fixture();
  const order = [];
  const sc = f.scenario;
  const general = sc.generals[9];
  // spy ordering via property setters
  let budget = 0;
  Object.defineProperty(general, "assignment_budget", {
    get: () => budget,
    set: (v) => {
      budget = v;
      order.push(["budget", v, sc.factions[0].money]);
    },
  });
  const money0 = f.factions[5].money;
  const commit = commitScenarioBudgetEvent(sc, {
    phase: "commit",
    general: 9,
    outcome: 0,
    grant: 21000,
  });
  assert.equal(commit.status, "committed");
  assert.equal(budget, Math.floor(21000 / 128), "floor(grant/128)=164");
  assert.equal(f.factions[5].money, money0 - 21000, "563B deducts player");
  assert.equal(order.length, 1);
  assert.equal(order[0][2], money0, "+1A write precedes 563B deduction");
  const refused = commitScenarioBudgetEvent(sc, {
    phase: "commit",
    general: 9,
    outcome: 2,
    grant: 0,
  });
  assert.equal(refused.status, "refused");
  assert.equal(budget, 164, "refusal leaves the earlier budget byte");
  assert.equal(f.rngCalls(), 0, "39E8 consumes no RNG");
});

/** type6 paid fixture: player=5 派出使者向 target=2 停战；代表政治 10/24。 */
function truceEnvoyFixture() {
  const f = fixture();
  f.factions[2].diplomat_idx = 9;
  f.generals[9].ability.politics = 10; // 驻目标外交官 p=10（[SI+2A] 直接取）
  f.generals[2].faction = 2;
  f.generals[2].ability.politics = 24; // 37F5(目标) q 侧代表 q=24
  f.rows[2][5] = 0x80 | 10; // g=10-(0+2)=8；30-g=22；t=48 → b=70 → fee 35000
  f.rows[5][2] = 0x94;
  return f;
}

test("type6 gates: inactive target and missing diplomat silently consume", () => {
  const f = truceEnvoyFixture();
  f.factions[2].attr = 0x7f;
  let state = beginScenarioTruceEnvoyResult(f.scenario, { type: 6, arg0: 2 });
  assert.equal(state.status, "ignored-inactive");
  f.factions[2].attr = 0x80;
  f.factions[2].diplomat_idx = null;
  state = beginScenarioTruceEnvoyResult(f.scenario, { type: 6, arg0: 2 });
  assert.equal(state.status, "no-diplomat");
  assert.equal(f.rngCalls(), 0);
});

test("type6 accepted: TALK57 -> 36C4 -> TALK44 -> 3371 commit pays and peaces", () => {
  const f = truceEnvoyFixture();
  f.slots[0] = { type: 6, arg0: 2, arg1: 0, arg2: 0 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.messages.length, 1, "TALK57 report first");
  assert.equal(f.messages[0].talkIndex, 57);
  assert.equal(f.messages[0].generalName, "將9", "\\1 diplomat name");
  assert.equal(f.messages[0].targetName, "將2", "\\3 target monarch");
  assert.equal(f.rngCalls(), 0, "36C4 waits for the TALK57 close");
  assert.equal(f.factions[5].money, 100000);
  f.messages[0].onClose();
  assert.equal(f.messages.length, 2, "3C3D notify follows");
  const notify = f.messages[1];
  assert.equal(notify.talkIndex >= 43 && notify.talkIndex <= 45, true);
  assert.equal(f.factions[5].money, 100000, "no commit before notify closes");
  notify.onClose();
  const state = f.app._nativeEnvoyResultContinuation;
  assert.equal(state, null);
  if (notify.talkIndex === 44) {
    assert.equal(f.factions[2].money, 135000, "target collects 35000");
    assert.equal(f.factions[5].money, 65000, "player pays 35000");
  } else {
    assert.equal(notify.talkIndex, 43, "free acceptance");
    assert.equal(f.factions[5].money, 100000);
  }
  assert.equal(f.rngCalls(), 0, "p!=q：3771 相等 RNG 未消费");
  assert.equal(f.rows[5][2] & 0x80, 0x80, "3669 peace bit forward");
  assert.equal(f.rows[2][5] & 0x80, 0x80, "3669 peace bit reverse");
});

test("type6 qualification failure shows TALK58 without writes", () => {
  const f = truceEnvoyFixture();
  // 3771 君主军团门：君主 +17!=0 且军团槽 <80h → CF1。
  f.factions[2].monarch_idx = 2;
  f.generals[2].status = 3;
  f.legions[2].status = 0;
  f.slots[0] = { type: 6, arg0: 2, arg1: 0, arg2: 0 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.messages[0].talkIndex, 57);
  f.messages[0].onClose();
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[1].talkIndex, 58, "敵方的君主已不在了。");
  f.messages[1].onClose();
  assert.equal(f.app._nativeEnvoyResultContinuation, null);
  assert.equal(f.factions[5].money, 100000);
  assert.equal(f.rows[5][2], 0x94, "no relation write");
  assert.equal(f.rows[2][5], 0x80 | 10, "reverse row unchanged");
});

/** type7 paid fixture: player=5 请 ally=17 攻 target=0。 */
function assistanceEnvoyFixture() {
  const f = fixture();
  f.factions[17].diplomat_idx = 21;
  f.generals[21].ability.politics = 24; // 驻 ally 外交官 p=24
  f.generals[17].faction = 17;
  f.generals[17].ability.politics = 10; // 37F5(ally) q=10（不等，0 RNG）
  f.rows[17][0] = 10; // x = rel[R][A]
  f.rows[17][5] = 0x80 | 52; // y = rel[R][T] 和平 52
  return f;
}

test("type6 refusal (receiver targets player) commits nothing", () => {
  const f = truceEnvoyFixture();
  f.factions[2].target_faction = 5; // 36CE：接收方目标==提出方 → k=2
  const state = beginScenarioTruceEnvoyResult(f.scenario, { type: 6, arg0: 2 });
  assert.equal(state.phase, "report");
  const outcome = scenarioTruceEnvoyOutcome(f.scenario, state, f.rng);
  assert.equal(outcome.phase, "notify");
  assert.equal(outcome.outcome, 2);
  assert.equal(outcome.fee, 35000, "fee 仍按公式计算但不收");
  assert.equal(outcome.notifyTalkBase, 0x2b);
  assert.throws(
    () =>
      commitScenarioTruceEnvoyResult(f.scenario, {
        phase: "commit",
        target: 2,
        proposer: 5,
        outcome: 2,
        fee: 35000,
      }),
    /refused state cannot commit/,
  );
  assert.equal(f.factions[5].money, 100000);
});

test("type7 gate order: ally active -> target active -> ally diplomat", () => {
  const f = assistanceEnvoyFixture();
  f.factions[17].attr = 0x7f;
  let state = beginScenarioAssistanceEnvoyResult(f.scenario, {
    type: 7,
    arg0: 17,
    arg1: 0,
  });
  assert.equal(state.status, "ignored-inactive");
  f.factions[17].attr = 0x80;
  f.factions[0].attr = 0x7f;
  state = beginScenarioAssistanceEnvoyResult(f.scenario, {
    type: 7,
    arg0: 17,
    arg1: 0,
  });
  assert.equal(state.status, "ignored-inactive");
  f.factions[0].attr = 0x80;
  f.factions[17].diplomat_idx = null;
  state = beginScenarioAssistanceEnvoyResult(f.scenario, {
    type: 7,
    arg0: 17,
    arg1: 0,
  });
  assert.equal(state.status, "no-diplomat");
  assert.equal(f.rngCalls(), 0);
});

test("type7 accepted: notify 47..49 then 35ED + direct 3526 war tail", () => {
  const f = assistanceEnvoyFixture();
  f.slots[0] = { type: 7, arg0: 17, arg1: 0, arg2: 0 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.messages[0].talkIndex, 57);
  f.messages[0].onClose();
  assert.equal(f.messages.length, 2);
  const notify = f.messages[1];
  assert.equal(notify.talkIndex >= 47 && notify.talkIndex <= 49, true);
  notify.onClose();
  assert.equal(f.app._nativeEnvoyResultContinuation, null);
  if (notify.talkIndex === 48) {
    // e=52 → v=u8(90-52)=38 → fee=(38>>1)*1000=19000
    assert.equal(f.factions[17].money, 119000, "ally collects 19000");
    assert.equal(f.factions[5].money, 81000, "player pays 19000");
  } else {
    assert.equal(notify.talkIndex, 47);
    assert.equal(f.factions[5].money, 100000);
  }
  assert.equal(f.factions[17].target_faction, 0, "3526 writes R target A");
  assert.equal(f.rows[17][0] & 0x80, 0, "war clears the peace bit");
});

test("type7 refusal (rel below bellicosity threshold) commits nothing", () => {
  const f = assistanceEnvoyFixture();
  f.factions[17].bellicosity = 100; // 阈值 u8(200+40)=240 > e=52 → 拒绝
  const state = beginScenarioAssistanceEnvoyResult(f.scenario, {
    type: 7,
    arg0: 17,
    arg1: 0,
  });
  assert.equal(state.phase, "report");
  const outcome = scenarioAssistanceEnvoyOutcome(f.scenario, state, f.rng);
  assert.equal(outcome.phase, "notify");
  assert.equal(outcome.outcome, 2);
  assert.equal(outcome.notifyTalkBase, 0x2f);
  assert.throws(
    () =>
      commitScenarioAssistanceEnvoyResult(f.scenario, {
        phase: "commit",
        ally: 17,
        target: 0,
        payer: 5,
        outcome: 2,
        fee: 0,
      }),
    /refused state cannot commit/,
  );
});

test("native dispatch routes type4 into the audience queue and commits", () => {
  const f = fixture();
  f.cities[3].governor = 9;
  f.slots[0] = { type: 4, arg0: 3, arg1: 0x88, arg2: 0x13 }; // 5000
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.budgets.length, 1);
  const domestic = f.budgets[0];
  assert.equal(domestic.kind, "domestic");
  assert.equal(domestic.requested, 5000);
  assert.equal(domestic.nativeGeneral, 9);
  assert.equal(domestic.nativeBudget.keypadDefault, 0);
  // UI 答应（outcome 0，grant=建议额）后提交。
  domestic.nativeBudget.commit(5000, 0);
  assert.equal(f.generals[9].assignment_budget, Math.floor(5000 / 128));
  assert.equal(f.factions[5].money, 95000);
  assert.equal(f.app._nativeBudgetContinuation, null);
});

test("native dispatch type5 refusal writes nothing", () => {
  const f = fixture();
  f.factions[7].diplomat_idx = 21;
  f.slots[0] = { type: 5, arg0: 7, arg1: 0x58, arg2: 0x1e }; // 7768
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.budgets.length, 1);
  const envoy = f.budgets[0];
  assert.equal(envoy.kind, "envoy");
  assert.equal(envoy.requested, 7768);
  assert.equal(envoy.nativeGeneral, 21);
  envoy.nativeBudget.commit(0, 2);
  assert.equal(f.generals[21].assignment_budget, 0);
  assert.equal(f.factions[5].money, 100000);
  assert.equal(f.app._nativeBudgetContinuation, null);
});

test("native dispatch without audience UI stays fail-closed", () => {
  const f = fixture();
  f.cities[3].governor = 9;
  f.slots[0] = { type: 4, arg0: 3, arg1: 0x88, arg2: 0x13 };
  delete f.app.gamebar.enqueueDomesticBudgetReport;
  assert.throws(() => tickStrategicWarEvents(f.app), /audience UI/);
  assert.equal(f.app.clock.hold, true);
  assert.equal(f.generals[9].assignment_budget, 0);
  assert.equal(f.factions[5].money, 100000);
});

test("overlapping budget audience stays loud; refuse-commit and lifecycle clear both release it", () => {
  // 用户报障：内政官 dialog 未提交关闭后，下月外交官在 enqueue 抛 overlapping 锁钟。
  const f = fixture();
  f.cities[3].governor = 9;
  f.factions[7].diplomat_idx = 21;
  f.slots[0] = { type: 4, arg0: 3, arg1: 0x88, arg2: 0x13 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.budgets.length, 1);
  assert.notEqual(f.app._nativeBudgetContinuation, null);
  // 未提交就到达的第二个预算事件必须大声失败，不能静默吞掉或覆盖。
  f.slots[1] = { type: 5, arg0: 7, arg1: 0x58, arg2: 0x1e };
  f.scenario._strategicEventDivider = 1;
  f.scenario._strategicEventCursor = 1;
  assert.throws(() => tickStrategicWarEvents(f.app), /overlapping/);
  assert.equal(f.budgets.length, 1);
  // UI 关闭路径按拒绝结算（grant 0/outcome 2，无写入）后放行。
  f.budgets[0].nativeBudget.commit(0, 2);
  assert.equal(f.app._nativeBudgetContinuation, null);
  f.scenario._strategicEventDivider = 1;
  f.scenario._strategicEventCursor = 1;
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.budgets.length, 2);
  assert.equal(f.budgets[1].kind, "envoy");
  // 生命周期卫生：剧本卸载/装配同样断开残留 continuation。
  f.budgets[1].nativeBudget.commit(0, 2);
  f.slots[2] = { type: 4, arg0: 3, arg1: 0x88, arg2: 0x13 };
  f.scenario._strategicEventDivider = 1;
  f.scenario._strategicEventCursor = 2;
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.notEqual(f.app._nativeBudgetContinuation, null);
  clearNativeUiContinuations(f.app);
  assert.equal(f.app._nativeBudgetContinuation, null);
  f.scenario._strategicEventDivider = 1;
  f.scenario._strategicEventCursor = 2;
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.budgets.length, 4);
});

test("describeEnvoyResultMessageState resolves names from native records", () => {
  const f = assistanceEnvoyFixture();
  const state = beginScenarioAssistanceEnvoyResult(f.scenario, {
    type: 7,
    arg0: 17,
    arg1: 0,
  });
  const described = describeEnvoyResultMessageState(f.scenario, state);
  assert.equal(described.factionName, "將17");
  assert.equal(described.diplomatGeneral.idx, 21);
});
