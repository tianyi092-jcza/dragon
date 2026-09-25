import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  clearNativeUiContinuations,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  applyScenarioPlayerTrustPenalty,
  PLAYER_TRUST_PENALTY_BORROW_SELECTOR,
  PLAYER_TRUST_PENALTY_DEFAULT_SELECTOR,
  readScenarioPlayerMonarchPersonality,
  readScenarioPlayerTrust,
} from "../web/src/game/navigation/scenarionegotiation.js";
import {
  PLAYER_DECISION_FEE_CAP,
  PLAYER_DECISION_TALK_BASE,
  resolveOriginalPlayerDecision,
  resolveOriginalPlayerDecisionChoice,
} from "../web/src/game/navigation/originalplayerdecision.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length).toString("hex");

test("fixed KI 38C7/38E6 wrappers, 3902 gate, keypad cap and 3C3D/3DC9 penalty bytes", () => {
  // 38C7：87FF 取君主记录偏移（BX=monarch_idx*0x20），+0x4240→SI；
  // CX=0x168(360) TALK 基，BX=0xFFFF；near call 2078→3902→20D6。
  assert.equal(
    raw(0x38c7, 0x1f),
    "535156e8324f81c340428bf3b96801bbffffe89ce7e82300e8f4e75e595bc3",
  );
  // 38E6：CX=0x175(373)，BX 保持 DI（A 攻击目标）。
  assert.equal(
    raw(0x38e6, 0x1c),
    "515653e8134f81c340428bf35bb97501e87fe7e80600e8d7e75e59c3",
  );
  // 3902 局部帧：[bp]=TALK基、[bp+2]=AL(outcome)、[bp+8]=DX(键盘额)、
  // [bp+0A]=DX 副本(算法fee)、[bp+0C]=AH。
  assert.equal(
    raw(0x3902, 0x1e),
    "1e06515583ec0e8bec894e00884602897e04895e0689560889560a88660c",
  );
  // 394B/394F：[bp]+=3 后 3B7E 三选项（al=3），返回 AL=选择码。
  assert.equal(raw(0x394b, 4), "83460003");
  assert.equal(raw(0x394f, 0x0c), "b003e82a028846033c01752f");
  // 7C6E 数字键盘：AX=0x7530=30000 上限；CF=1 取消回选项重选；
  // 输入 0 → [bp+3]=0（无条件同意）。
  assert.equal(raw(0x396b, 6), "b83075e8fd42");
  assert.equal(raw(0x397d, 0x0d), "72d089460823c07504c6460300");
  // 398A：军师评论 TALK[base+4+choice]（3CDC）。
  assert.equal(raw(0x398a, 0x10), "8a4603ff46008b4e0032e403c8e84203");
  // 399E：CALL ECE0 恰好 1 字节 RNG；cmp al,cs:[0D00]（信赖度）；ja 跳过。
  assert.equal(raw(0x399e, 0x0a), "e83fb32e3a06000d7717");
  // 39A8 采纳组：[bp]+=3(→base+10)；AL=选择；DX=输入额；
  // 输入额>算法fee → AL=3；出口 [bp+2]=AL、[bp+0A]=DX。
  assert.equal(
    raw(0x39a8, 0x17),
    "834600038a46038b56083b560a7602b00388460289560a",
  );
  // 39CE 出口：AL=[bp+2]、DX=[bp+0A]、DI/BX/AH 恢复。
  assert.equal(
    raw(0x39ce, 0x1a),
    "8a46028b7e048b5e068b560a8a660c83c40ee83e595d59071fc3",
  );
  // 3C99 个性变体：v=[si+1E]；v>=3 减 3（一次，非模 3）；CX+=v。
  assert.equal(
    raw(0x3c99, 0x18),
    "5053515257ba0000bb050032e48a441e3c0372022c0303c8",
  );
  // 3CDC 军师评论：BX=cs:[CFD] 玩家势力，BH=[BX+2] 顾问号。
  assert.equal(raw(0x3cdc, 0x0a), "50535152572e8b1efd0c");
  // 3C3D：通知行 TALK[CX+min(al,2)]（al=3→2）；al==2 或 AH==0 返回；
  // al==3 → al=30、CX=0x1A5、CALL 3DC9。
  assert.equal(raw(0x3c3d, 0x0c), "5053515657b3932e3b36fd0c");
  assert.equal(raw(0x3c60, 0x11), "3c037502b0028bfc32e403c88ac3e89f4b");
  assert.equal(
    raw(0x3c75, 0x16),
    "3c03741222e474163c02741283c11db093e8874beb08",
  );
  assert.equal(raw(0x3c8b, 8), "b01eb9a501e83601");
  // 3DC9（真身）：信赖-=AL(30)，借位夹 0 且 CX=0x19E（075B→470+个性
  // 解任台词）；CX!=FFFF 时显示君主行；信赖==0 → al=1 CALL 1CB1。
  assert.equal(
    raw(0x3dc9, 0x48),
    "1e5053512e8e1e520d2e2806000d73092ec606000d00b99e01b002e80ec5" +
      "83f9ff741be8104a8aa75e428a874142e8164a2e803e000d007505b001" +
      "e8aadeb002e87420595b581fc3",
  );
  // 3D09/3D45 显示行头（TALK[CX+AL] 系）；87FF：BX=cs:[CFD]，
  // BH=[BX+1] 君主号，BX>>=3 → 返回值=monarch_idx*0x20。
  assert.equal(raw(0x3d09, 9), "1e5053515256578cca");
  assert.equal(raw(0x3d45, 0x0e), "1e5053515256578cc88ed8e85c4a");
  assert.equal(raw(0x87ff, 0x11), "2e8b1efd0c8a7f0132dbd1ebd1ebd1ebc3");
  // 对比：3D91 是另一写方（信赖加算、溢出夹 0xFF），非本链。
  assert.equal(
    raw(0x3d91, 0x16),
    "1e5053512e8e1e520d2e0006000d73062ec606000dff",
  );
});

test("3902 choice resolution maps pay-0 to unconditional acceptance", () => {
  assert.equal(resolveOriginalPlayerDecisionChoice("honor", 0), 0);
  assert.equal(resolveOriginalPlayerDecisionChoice("accept", 0), 0);
  assert.equal(resolveOriginalPlayerDecisionChoice("pay", 1), 1);
  // 7C6E：输入 0 → [bp+3]=0（无条件同意）。
  assert.equal(resolveOriginalPlayerDecisionChoice("pay", 0), 0);
  assert.equal(resolveOriginalPlayerDecisionChoice("refuse", 0), 2);
  assert.throws(() => resolveOriginalPlayerDecisionChoice("maybe", 0));
});

test("3902 honor gate consumes exactly one RNG byte against trust", () => {
  const base = {
    kind: "truce",
    algorithmOutcome: 1,
    algorithmFee: 35000,
    choice: 0,
    amount: 0,
    trust: 100,
  };
  // RNG == 信赖：生效（ja 不跳）。
  const honored = resolveOriginalPlayerDecision({ ...base, rngByte: 100 });
  assert.equal(honored.honored, true);
  assert.equal(honored.outcome, 0);
  assert.equal(honored.fee, 35000);
  assert.equal(honored.responseTalk, PLAYER_DECISION_TALK_BASE.truce + 10);
  // RNG == 信赖+1：不生效，保持算法 AL/DX，犹豫回应集 base+7。
  const skipped = resolveOriginalPlayerDecision({ ...base, rngByte: 101 });
  assert.equal(skipped.honored, false);
  assert.equal(skipped.outcome, 1);
  assert.equal(skipped.fee, 35000);
  assert.equal(skipped.responseTalk, PLAYER_DECISION_TALK_BASE.truce + 7);
  // 信赖 0 且 RNG 0：0 <= 0 生效。
  const zero = resolveOriginalPlayerDecision({ ...base, trust: 0, rngByte: 0 });
  assert.equal(zero.honored, true);
});

test("3902 honored choices: honor/refuse keep algorithm fee; pay keeps fee unless above cap rule", () => {
  const base = {
    kind: "assistance",
    algorithmOutcome: 1,
    algorithmFee: 20000,
    rngByte: 0,
    trust: 0,
  };
  const refuse = resolveOriginalPlayerDecision({
    ...base,
    choice: 2,
    amount: 0,
  });
  assert.equal(refuse.outcome, 2);
  assert.equal(refuse.fee, 20000);
  // 提供资金 <= 算法 fee：outcome 1，fee=输入额。
  const pay = resolveOriginalPlayerDecision({
    ...base,
    choice: 1,
    amount: 15000,
  });
  assert.equal(pay.outcome, 1);
  assert.equal(pay.fee, 15000);
  assert.equal(pay.responseTalk, PLAYER_DECISION_TALK_BASE.assistance + 10);
  // 输入额 > 算法 fee：AL=3（索价过高破裂），fee=输入额（39D4 DX=[bp+8]）。
  const over = resolveOriginalPlayerDecision({
    ...base,
    choice: 1,
    amount: 25000,
  });
  assert.equal(over.outcome, 3);
  assert.equal(over.fee, 25000);
});

test("3902 is fail-closed without the RNG byte and rejects out-of-range input", () => {
  const base = {
    kind: "truce",
    algorithmOutcome: 1,
    algorithmFee: 35000,
    choice: 0,
    amount: 0,
    trust: 100,
  };
  assert.throws(() => resolveOriginalPlayerDecision(base), /rng byte/);
  assert.throws(() =>
    resolveOriginalPlayerDecision({ ...base, rngByte: 0x100 }),
  );
  assert.throws(() =>
    resolveOriginalPlayerDecision({ ...base, rngByte: 0, choice: 3 }),
  );
  assert.throws(() =>
    resolveOriginalPlayerDecision({ ...base, rngByte: 0, kind: "war" }),
  );
  assert.throws(() =>
    resolveOriginalPlayerDecision({
      ...base,
      rngByte: 0,
      choice: 1,
      amount: PLAYER_DECISION_FEE_CAP + 1,
    }),
  );
  // 上限 30000 本身合法。
  const cap = resolveOriginalPlayerDecision({
    ...base,
    rngByte: 0,
    choice: 1,
    amount: PLAYER_DECISION_FEE_CAP,
  });
  assert.equal(cap.outcome, 1);
});

test("3DC9 penalty subtracts 30, clamps on borrow and reports game over at zero", () => {
  const sc = { trust: 100 };
  const r1 = applyScenarioPlayerTrustPenalty(sc, 3);
  assert.equal(sc.trust, 70);
  assert.equal(r1.selector, PLAYER_TRUST_PENALTY_DEFAULT_SELECTOR); // 0x1A5
  assert.equal(r1.gameOver, false);

  const sc2 = { trust: 30 };
  const r2 = applyScenarioPlayerTrustPenalty(sc2, 3);
  assert.equal(sc2.trust, 0);
  assert.equal(r2.selector, PLAYER_TRUST_PENALTY_DEFAULT_SELECTOR);
  assert.equal(r2.gameOver, true);

  const sc3 = { trust: 20 };
  const r3 = applyScenarioPlayerTrustPenalty(sc3, 3);
  assert.equal(sc3.trust, 0);
  assert.equal(r3.selector, PLAYER_TRUST_PENALTY_BORROW_SELECTOR); // 0x19E
  assert.equal(r3.gameOver, true);

  // outcome 0/1/2 不进 3DC9：无写入。
  for (const outcome of [0, 1, 2]) {
    const scN = { trust: 55 };
    const r = applyScenarioPlayerTrustPenalty(scN, outcome);
    assert.equal(scN.trust, 55);
    assert.equal(r.selector, null);
    assert.equal(r.gameOver, false);
  }
  // 信赖缺失 fail-closed。
  assert.throws(() => applyScenarioPlayerTrustPenalty({}, 3), /trust/);
});

function fixture({ player = 5, trust = 100 } = {}) {
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
  }));
  const legions = Array.from({ length: 128 }, (_, slot) => ({
    slot,
    status: 0,
  }));
  const cities = Array.from({ length: 0xc0 }, (_, idx) => ({
    idx,
    faction: null,
    _strategicLastFaction: 0x18,
  }));
  const scenario = {
    player_faction: player,
    nativePlayerFactionPointer: player * 0x40,
    nativeFactionSlots: { version: 1, records: factions },
    nativeDiplomacyMatrix: { version: 1, rows },
    nativeLegionSlots: { version: 1, records: legions },
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
    factions: factions.slice(0, 3),
    diplomacy: rows.slice(0, 3),
    generals,
    cities,
    trust,
    // 生产 Scenario（World）恒带 monarchOf；P91 前置门依赖此形状。
    monarchOf(faction) {
      return this.generals[faction?.monarch_idx];
    },
  };
  const rngQueue = [];
  let rngCalls = 0;
  const rng = {
    nextByte() {
      rngCalls++;
      return rngQueue.length ? rngQueue.shift() : 0;
    },
  };
  const requests = [];
  const messages = [];
  let gameOverCalls = 0;
  const app = {
    scenario,
    clock: { hold: false },
    gamebar: {
      syncClock() {},
      enqueueTalkMessage(message) {
        messages.push(message);
      },
      enqueueIncomingDiplomacyRequest(payload) {
        requests.push(payload);
      },
    },
    originalRng: rng,
    checkTrustGameOver() {
      gameOverCalls++;
    },
  };
  return {
    app,
    scenario,
    factions,
    rows,
    generals,
    requests,
    messages,
    rng,
    rngQueue,
    rngCalls: () => rngCalls,
    gameOverCalls: () => gameOverCalls,
  };
}

/** type3：A=0 提出停战，接收方 B=2 为玩家；算法 outcome=1、fee=35000。 */
function trucePlayerFixture(options = {}) {
  const f = fixture({ player: 2, ...options });
  f.scenario.factions = f.factions.slice(0, 3);
  f.generals[0].faction = 0;
  f.generals[0].ability.politics = 10;
  f.generals[2].faction = 2;
  f.generals[2].ability.politics = 24;
  f.rows[2][0] = 0x80 | 10;
  f.rows[0][2] = 0x94;
  f.scenario.strategicEventSlots[0] = { type: 3, arg0: 0, arg1: 2, arg2: 0xff };
  return f;
}

/** type2：受邀 R=17 为玩家，A=0 攻击目标，T=2 支付；算法 outcome=1、fee=20000。 */
function assistancePlayerFixture(options = {}) {
  const f = fixture({ player: 17, ...options });
  f.generals[3].faction = 2;
  f.generals[3].ability.politics = 12;
  f.generals[17].faction = 17;
  f.generals[18].faction = 17;
  f.generals[18].ability.politics = 8;
  f.rows[17][0] = 0x80 | 30;
  f.rows[17][2] = 0x80 | 50;
  f.rows[0][17] = 0x80 | 60;
  f.scenario.strategicEventSlots[0] = { type: 2, arg0: 17, arg1: 0, arg2: 2 };
  return f;
}

test("type3 receiver-player enqueues the native decision with algorithm outcome pending", () => {
  const f = trucePlayerFixture();
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.requests.length, 1);
  const p = f.requests[0];
  assert.equal(p.type, "incoming-truce");
  assert.equal(p.requesterFaction.idx, 0);
  assert.deepEqual(p.result, { outcome: 1, goldRequired: 35000 });
  assert.equal(p.nativeDecision.kind, "truce");
  assert.equal(p.nativeDecision.personality, 2); // generals[2].talk_idx
  assert.equal(p.nativeDecision.keypadDefault, 0); // 7C6E 默认 0
  // 决定前无任何写入。
  assert.equal(f.factions[0].money, 100000);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.rows[0][2], 0x94);
  assert.equal(f.rows[2][0], 0x8a);
  assert.equal(f.rngCalls(), 0, "3902 门尚未消费 RNG");
  assert.equal(f.app._nativePlayerDecisionContinuation != null, true);
});

test("type3 honored pay below fee commits with the entered amount", () => {
  const f = trucePlayerFixture({ trust: 100 });
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(50); // 50 <= 100：生效
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("pay", 30000);
  assert.equal(f.rngCalls(), 1, "3902 恰好消费 1 字节 RNG");
  assert.equal(r.outcome, 1);
  assert.equal(r.fee, 30000); // DX=输入额
  assert.equal(r.responseTalk, 372); // 370+variant(2)
  assert.equal(r.advisorTalk, 365); // 364+choice(1)
  assert.equal(r.notifyTalk, 0x2b + 1); // TALK[44] 已成立
  assert.equal(r.praiseTalk, null);
  assert.equal(f.scenario.trust, 100, "outcome 1 不触发 3D8F");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[0].money, 70000, "563B 提出方支付输入额");
  assert.equal(f.factions[2].money, 130000, "5609 接收方收输入额");
  assert.equal(f.rows[0][2], 0x8a, "3669 min|80h");
  assert.equal(f.rows[2][0], 0x8a);
  assert.equal(f.app._nativePlayerDecisionContinuation, null);
});

test("type2 honored pay above fee breaks with outcome 3 and the 3DC9 penalty", () => {
  const f = assistancePlayerFixture({ trust: 100 });
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  // 算法 fee=20000 < 键盘上限 30000：输入 25000 超限破裂。
  const r = p.nativeDecision.resolveChoice("pay", 25000);
  assert.equal(r.outcome, 3, "输入额 > 算法 fee → 索价过高破裂");
  assert.equal(r.fee, 25000, "DX=输入额");
  assert.equal(r.responseTalk, 383 + 1, "采纳组+variant(1)");
  assert.equal(r.notifyTalk, 0x2f + 2, "al=3 映为 TALK[CX+2] 破裂");
  assert.equal(r.praiseTalk, null, "未借位：CX=0x1A5 空串");
  assert.equal(f.scenario.trust, 70, "3DC9：信赖-30");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[2].money, 100000, "324B：AL>=2 不提交");
  assert.equal(f.factions[17].money, 100000);
  assert.equal(f.factions[17].target_faction, null);
  assert.equal(f.messages.length, 0, "无战争尾段");
  assert.equal(f.gameOverCalls(), 0);
});

test("type2 over-demand with trust <= 30 clamps to zero and fires 1CB1", () => {
  const f = assistancePlayerFixture({ trust: 20 });
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("pay", 25000);
  assert.equal(r.outcome, 3);
  // 借位 → CX=0x19E → 075B 展开 470+talk_idx(1)=471 解任台词。
  assert.equal(r.praiseTalk, 471);
  assert.equal(f.scenario.trust, 0, "借位夹 0");
  assert.equal(f.gameOverCalls(), 1, "信赖==0 → al=1 CALL 1CB1");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.factions[17].target_faction, null);
});

test("type3 RNG above trust keeps the algorithm answer (犹豫组)", () => {
  const f = trucePlayerFixture({ trust: 100 });
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(200); // 200 > 100：不生效
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("refuse", 0);
  assert.equal(r.outcome, 1, "保持 NPC 算法 AL");
  assert.equal(r.fee, 35000, "保持 NPC 算法 DX");
  assert.equal(r.responseTalk, 369, "367+variant(2) 犹豫组");
  assert.equal(r.notifyTalk, 0x2b + 1);
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[0].money, 65000, "算法 fee 提交");
  assert.equal(f.factions[2].money, 135000);
});

test("type3 honored refuse returns without writes", () => {
  const f = trucePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("refuse", 0);
  assert.equal(r.outcome, 2);
  assert.equal(r.notifyTalk, 0x2b + 2, "TALK[45] 谈判破裂");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[0].money, 100000);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.rows[0][2], 0x94);
});

test("type3 honored honor commits unconditional peace without payment", () => {
  const f = trucePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("honor", 0);
  assert.equal(r.outcome, 0);
  assert.equal(r.notifyTalk, 0x2b + 0, "TALK[43] 无条件达成");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[0].money, 100000, "35ED 仅 AL==1 转账");
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.rows[0][2], 0x8a, "停战关系仍提交");
});

test("type2 invited-player honor commits the war tail after the 8810 message", () => {
  const f = assistancePlayerFixture();
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.requests.length, 1);
  const p = f.requests[0];
  assert.equal(p.type, "incoming-assistance");
  assert.equal(p.requesterFaction.idx, 2, "提出方/支付方 T");
  assert.equal(p.targetFaction.idx, 0, "A 攻击目标");
  assert.equal(p.nativeDecision.kind, "assistance");
  assert.deepEqual(p.result, { outcome: 1, goldRequired: 20000 });
  f.rngQueue.push(0); // 生效
  const r = p.nativeDecision.resolveChoice("honor", 0);
  assert.equal(r.outcome, 0);
  assert.equal(r.notifyTalk, 0x2f + 0, "TALK[47] 无条件合作");
  assert.equal(r.responseTalk, 383 + 1, "370 基+13=383 采纳组+variant(1)");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[2].money, 100000, "AL=0 不转账");
  assert.equal(f.factions[17].money, 100000);
  // 325D 直连 3526 战争尾段：玩家为进攻方 → 3550 8810 君主下令消息。
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].kind, "native-war-declaration");
  f.messages[0].onClose();
  // 358C：CFD==进攻方（玩家命令优先）不写自身目标；仅防守方重定向与外交值。
  assert.equal(f.factions[17].target_faction, null, "玩家进攻方不写自身目标");
  assert.equal(f.factions[0].target_faction, 17, "35AB：A 转目标 R");
  assert.equal(f.rows[17][0], 15, "3639 min raw & 7Fh >> 1");
  assert.equal(f.rows[0][17], 15);
  assert.equal(f.app._nativePlayerDecisionContinuation, null);
});

test("type2 honored pay commits the algorithm fee when below it", () => {
  const f = assistancePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("pay", 15000);
  assert.equal(r.outcome, 1);
  assert.equal(r.fee, 15000, "DX=输入额");
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[2].money, 85000, "563B 支付输入额");
  assert.equal(f.factions[17].money, 115000, "5609 收输入额");
  assert.equal(f.messages.length, 1, "战争尾段消息");
  f.messages[0].onClose();
  assert.equal(f.factions[17].target_faction, null, "玩家进攻方不写自身目标");
  assert.equal(f.factions[0].target_faction, 17);
});

test("type2 honored refuse skips payment and the war", () => {
  const f = assistancePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.rngQueue.push(0);
  const p = f.requests[0];
  const r = p.nativeDecision.resolveChoice("refuse", 0);
  assert.equal(r.outcome, 2);
  p.onResolve(r.outcome, r.fee);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.factions[17].money, 100000);
  assert.equal(f.factions[17].target_faction, null);
  assert.equal(f.messages.length, 0, "无 3526 战争尾段");
});

test("player decision is fail-closed without the canonical RNG and holds the clock", () => {
  const f = trucePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.app.originalRng = null;
  const p = f.requests[0];
  assert.throws(() => p.nativeDecision.resolveChoice("honor", 0), /RNG/);
  assert.equal(f.app.clock.hold, true);
  // 拒绝重入：continuation 仍在。
  assert.equal(f.app._nativePlayerDecisionContinuation != null, true);
});

test("overlapping player decisions stay fail-closed", () => {
  const f = trucePlayerFixture();
  tickStrategicWarEvents(f.app);
  f.scenario.strategicEventSlots[1] = { type: 3, arg0: 0, arg1: 2, arg2: 0xff };
  // 31AE 泵有分频节奏：第二个事件需要多个 tick 才派发。
  let thrown = null;
  for (let i = 0; i < 64 && !thrown; i++) {
    try {
      tickStrategicWarEvents(f.app);
    } catch (error) {
      thrown = error;
    }
  }
  assert.match(String(thrown?.message), /overlapping/);
  assert.equal(f.app.clock.hold, true);
});

test("P91 missing monarch fails fast with no stranded continuation", () => {
  const f = trucePlayerFixture();
  // 君主记录在但 talk_idx 缺失：begin 的 3771 读可过，3C99 个性 strict 读抛错。
  // 旧序（先 set 再构造）会残留 continuation；新序必须在 set 之前精确抛。
  delete f.generals[2].talk_idx;
  assert.throws(() => tickStrategicWarEvents(f.app), /talk_idx/);
  assert.ok(!f.app._nativePlayerDecisionContinuation, "no stranded continuation");
  assert.equal(f.requests.length, 0);
  // 恢复后新事件可正常派发：无误报 overlapping（31AE 分频，需多 tick）。
  f.generals[2].talk_idx = 2;
  f.scenario.strategicEventSlots[0] = { type: 3, arg0: 0, arg1: 2, arg2: 0xff };
  f.scenario._strategicEventDivider = 1;
  f.scenario._strategicEventCursor = 0;
  let redispatched = false;
  for (let i = 0; i < 64 && !redispatched; i++) {
    try {
      redispatched = tickStrategicWarEvents(f.app) === true;
    } catch { redispatched = false; }
  }
  assert.equal(redispatched, true);
  assert.equal(f.requests.length, 1);
  assert.ok(f.app._nativePlayerDecisionContinuation);
});

test("P91 teardown clearing releases a pending decision", () => {
  const f = trucePlayerFixture();
  tickStrategicWarEvents(f.app);
  assert.ok(f.app._nativePlayerDecisionContinuation);
  // 读档/回标题装配语义：废除旧 UI continuation（与 reset 队列同理）。
  clearNativeUiContinuations(f.app);
  assert.equal(f.app._nativePlayerDecisionContinuation, null);
  assert.equal(f.app._nativeWarEventContinuation, null);
  assert.equal(f.app._nativeEnvoyResultContinuation, null);
  f.scenario.strategicEventSlots[1] = { type: 3, arg0: 0, arg1: 2, arg2: 0xff };
  let second = false;
  for (let i = 0; i < 64 && !second; i++) {
    second = tickStrategicWarEvents(f.app) === true && f.requests.length === 2;
  }
  assert.equal(second, true, "cleared teardown dispatches cleanly");
});

test("87FF monarch personality and trust readers are strict", () => {
  const f = trucePlayerFixture();
  assert.equal(readScenarioPlayerMonarchPersonality(f.scenario), 2);
  assert.equal(readScenarioPlayerTrust(f.scenario), 100);
  const broken = fixture({ player: 2 });
  broken.scenario.nativePlayerFactionPointer = 1; // 未对齐
  assert.throws(() => readScenarioPlayerMonarchPersonality(broken.scenario));
  delete broken.scenario.trust;
  assert.throws(() => readScenarioPlayerTrust(broken.scenario), /trust/);
});
