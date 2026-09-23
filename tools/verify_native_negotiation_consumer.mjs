import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tickStrategicWarEvents } from "../web/src/game/ai.js";
import {
  beginScenarioAssistanceEvent,
  beginScenarioTruceEvent,
  commitScenarioTruceEvent,
  settleScenarioAssistanceEvent,
} from "../web/src/game/navigation/scenarionegotiation.js";
import { commitScenarioWarEvent } from "../web/src/game/navigation/scenariowarconsumer.js";

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
  const app = {
    scenario,
    clock: { hold: false },
    gamebar: {
      syncClock() {},
      enqueueTalkMessage(message) {
        messages.push(message);
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
    rngCalls: () => rngCalls,
  };
}

/** P18 paid example shape: A=0 pays 35000, B=2 receives; both commit peace. */
function trucePaidFixture() {
  const f = fixture();
  f.generals[0].faction = 0;
  f.generals[0].ability.politics = 10; // 37F5(A) first representative p=10
  f.generals[2].faction = 2;
  f.generals[2].ability.politics = 24; // 37F5(B) second representative q=24
  f.rows[2][0] = 0x80 | 10; // g = 10 - (0+2) = 8; 30-g = 22; t=48 -> b=70
  f.rows[0][2] = 0x94;
  return f;
}

test("fixed KI type2/type3 handlers, fee, representative and commit bytes", () => {
  assert.equal(raw(0x31f2, 6), "0c3220326232", "type1/2/3 jump table");
  assert.equal(raw(0x3220, 0x12), "52e8f602723a8bde8ae2e8ed02723187de8b");
  assert.equal(
    raw(0x3241, 0x1f),
    "2e3b36fd0c750ce89b06e890dab92f00e8e9093c027308e892035a52e8c602",
  );
  assert.equal(
    raw(0x3262, 0x1c),
    "558ac28be88afc32dbd1ebd1eb8bfb8afa32dbd1ebd1eb8bf3e84604",
  );
  assert.equal(
    raw(0x327e, 0x2a),
    "72272e3b36fd0c750ce83d06e851dab92b00e8aa093c027310e853038bc586c4e85713e8920fe8c2035d",
  );
  assert.equal(
    raw(0x36c4, 0x4d),
    "51b101e8a70072448ad08bc7d1e0d1e03a64197502b102e8edf9247f8a642880c4022ac4730232c0b41e2ae002d480fa007d0232d2d0ea32f6b8e803f7e28bd08ac123d2750232c0e8c900f859",
  );
  assert.equal(
    raw(0x3712, 0x5e),
    "51b101e8590072558ad087fbe8aaf987fb8af0e8a3f93ac67302b1023c80730232c0247f8a6428d0e480c4283ac47302b102b45a2ae08ad480fa007d0232d280fa3c7602b23cd0ea32f6b8e803f7e28bd08ac123d2750232c0e86a00f859",
  );
  assert.equal(
    raw(0x3771, 0x66),
    "53528a7c2a80ffff750b8bc7e8750072538bd8eb0c32dbd1ebd1ebd1eb81c340428a77138a7c0132dbd1ebd1eb8a874022d1eb80bf57420075098bc6e845008bd8eb083c80721d81c340428a57133ad6770d7207e818b5a8017404b2102ad68ac2d0e0f85a5b",
  );
  assert.equal(
    raw(0x37f5, 0x3b),
    "535152d1e0d1e032c033d2bb4042b97f003a671c7510807f1700750a3a471373058a47138bd383c320e2e622c074078bc25a595bf8c35a595bf9c3",
  );
  assert.equal(
    raw(0x35ed, 0x4b),
    "5051523c01750e8bc232d2e80e2087f7e83b2087f7578bc6d1e0d1e08af48bc7d1e0d1e08ad48bc286c4b97f00bf40423b551c74053b451c7503e8ad1a83c720e2ee5fb004e84b285a5958",
  );
  assert.equal(
    raw(0x45f8, 0x24),
    "538af832dbd1ebd1eb3a67197504c64719ff8afc32dbd1ebd1eb3a47197504c64719ff5b",
  );
  assert.equal(
    raw(0x4236, 0x32),
    "1e51562e8e1e520dbe4008b9c0003a440174053a640175103a441a74053a641a75068a6c01886c1a83c620fec975df5e591f",
  );
  assert.equal(
    raw(0x3669, 0x2d),
    "3c187501c380fc187501c3535156e81d008a8c00068aaf00063acd76028acd80c980888c0006888f00065e595b",
  );
  assert.equal(
    raw(0x5609, 0x21),
    "505203442012542280fa097c0cb2097f053d98fe7203b898fe8944208854225a58",
  );
  assert.equal(
    raw(0x563b, 0x27),
    "50522944201854228b44208a542280faf67f0cb2f67c053d68017703b868018944208854225a58",
  );
  assert.equal(
    raw(0x3138, 0x37),
    "5351528bced1e1d1e18bc7d1e0d1e08af48ad5bb404233c0b17f3a571d75063a771c75014083c320fec975ee5a595b3bc07402f9c3f8c3",
  );
});

test("type3 paid NPC truce commits money, targets, cities and 3669 peace", () => {
  const f = trucePaidFixture();
  f.factions[2].money = 0; // P18 paid example: receiver starts at zero
  f.factions[0].target_faction = 2; // cleared by 45F8
  f.factions[2].target_faction = 1; // untouched, does not match proposer
  f.cities[0].faction = 0;
  f.cities[0]._strategicLastFaction = 2; // normalized to current
  f.cities[1].faction = 3;
  f.cities[1]._strategicLastFaction = 2; // current outside {A,B}: untouched
  f.cities[2].faction = 2;
  f.cities[2]._strategicLastFaction = 3; // old outside {A,B}: untouched
  const state = beginScenarioTruceEvent(f.scenario, {
    type: 3,
    arg0: 0,
    arg1: 2,
    arg2: 0xff,
  });
  assert.deepEqual(state, {
    phase: "commit",
    proposer: 0,
    receiver: 2,
    outcome: 1,
    fee: 35000,
  });
  assert.equal(f.rngCalls(), 0, "unequal politics consume no RNG");
  const result = commitScenarioTruceEvent(f.scenario, state, f.rng);
  assert.equal(result.status, "committed");
  assert.equal(f.factions[0].money, 65000, "563B pays full fee");
  assert.equal(f.factions[2].money, 35000, "5609 collects full fee");
  assert.equal(f.factions[0].target_faction, null, "45F8 clears cross target");
  assert.equal(f.factions[2].target_faction, 1);
  assert.equal(f.cities[0]._strategicLastFaction, 0, "4236 old := current");
  assert.equal(f.cities[1]._strategicLastFaction, 2);
  assert.equal(f.cities[2]._strategicLastFaction, 3);
  assert.equal(f.rows[0][2], 0x8a, "3669 min raw | 80h");
  assert.equal(f.rows[2][0], 0x8a);
});

test("type3 signed-byte fee gate turns a huge base into a free agreement", () => {
  const f = trucePaidFixture();
  f.generals[2].ability.politics = 60; // t=120; b=u8(120+30)=150 -> s8<0 -> 0
  f.rows[2][0] = 0x80; // g = max(0, 0-2) = 0; 30-g = 30
  f.generals[9].faction = 0;
  f.generals[9].origFaction = 2; // captive returned even when free (AL=0)
  const state = beginScenarioTruceEvent(f.scenario, {
    type: 3,
    arg0: 0,
    arg1: 2,
    arg2: 0xff,
  });
  assert.deepEqual(state, {
    phase: "commit",
    proposer: 0,
    receiver: 2,
    outcome: 0,
    fee: 0,
  });
  commitScenarioTruceEvent(f.scenario, state, f.rng);
  assert.equal(f.factions[0].money, 100000, "AL=0 skips the money move");
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.generals[9].faction, 2, "50D7 returns the captive");
  assert.equal(f.generals[9].origFaction, null);
  assert.equal(f.generals[9].status, 0);
  assert.equal(
    f.factions[2].nativeGeneralCount,
    6,
    "2AD2 increments return side",
  );
  assert.equal(f.rows[0][2], 0x80);
  assert.equal(f.rows[2][0], 0x80);
});

test("type3 receiver targeting the proposer refuses without any write", () => {
  const f = trucePaidFixture();
  f.factions[2].target_faction = 0; // k=2 at 36D4
  const state = beginScenarioTruceEvent(f.scenario, {
    type: 3,
    arg0: 0,
    arg1: 2,
    arg2: 0xff,
  });
  assert.deepEqual(state, {
    phase: "return",
    status: "refused",
    proposer: 0,
    receiver: 2,
  });
  assert.equal(f.factions[0].money, 100000);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.rows[0][2], 0x94);
  assert.equal(f.rows[2][0], 0x8a);
});

test("type3 equal politics consume exactly one ECE0 byte per agreement", () => {
  const even = trucePaidFixture();
  even.generals[2].ability.politics = 10; // q == p == 10
  even.rngQueue.push(0); // even keeps q=10: t=20, b=42, fee 21000
  const evenState = beginScenarioTruceEvent(
    even.scenario,
    { type: 3, arg0: 0, arg1: 2, arg2: 0xff },
    even.rng,
  );
  assert.equal(even.rngCalls(), 1);
  assert.deepEqual(evenState, {
    phase: "commit",
    proposer: 0,
    receiver: 2,
    outcome: 1,
    fee: 21000,
  });

  const odd = trucePaidFixture();
  odd.generals[2].ability.politics = 10;
  odd.rngQueue.push(1); // odd takes 16-10=6: t=12, b=34, fee 17000
  const oddState = beginScenarioTruceEvent(
    odd.scenario,
    { type: 3, arg0: 0, arg1: 2, arg2: 0xff },
    odd.rng,
  );
  assert.equal(odd.rngCalls(), 1);
  assert.deepEqual(oddState, {
    phase: "commit",
    proposer: 0,
    receiver: 2,
    outcome: 1,
    fee: 17000,
  });
});

test("type3 receiver-player enters 38C7 decision flow; missing UI stays fail-closed", () => {
  const f = trucePaidFixture();
  f.scenario.player_faction = 2;
  f.scenario.nativePlayerFactionPointer = 2 * 0x40;
  f.slots[0] = { type: 3, arg0: 0, arg1: 2, arg2: 0xff };
  assert.throws(() => tickStrategicWarEvents(f.app), /player decision UI/);
  assert.equal(f.app.clock.hold, true);
  assert.equal(f.factions[0].money, 100000);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.rows[0][2], 0x94);
  assert.equal(f.rows[2][0], 0x8a);
});

test("type3 proposer-player captive prefix stops at 5101 after committed writes", () => {
  const f = trucePaidFixture();
  f.scenario.player_faction = 0;
  f.scenario.nativePlayerFactionPointer = 0;
  f.generals[5].faction = 0;
  f.generals[5].origFaction = 2; // released to NPC B first (slot order)
  f.generals[9].faction = 2;
  f.generals[9].origFaction = 0; // restored to the player: CDE boundary
  const state = beginScenarioTruceEvent(f.scenario, {
    type: 3,
    arg0: 0,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(state.phase, "commit");
  assert.throws(
    () => commitScenarioTruceEvent(f.scenario, state, f.rng),
    /5101/,
  );
  assert.equal(f.factions[2].money, 135000, "money moves before the scan");
  assert.equal(f.factions[0].money, 65000);
  assert.equal(f.generals[5].faction, 2, "earlier slot fully returned");
  assert.equal(f.generals[9].status, 0, "50D7 writes precede the stop");
  assert.equal(f.generals[9].origFaction, null);
  assert.equal(f.generals[9].faction, 0);
  assert.equal(f.factions[0].target_faction, null, "45F8 not reached");
  assert.equal(f.rows[0][2], 0x94, "3669 not reached");
  assert.equal(f.rows[2][0], 0x8a);
});

test("type3 monarch gates: legion byte fails, active legion uses monarch politics", () => {
  const blocked = trucePaidFixture();
  blocked.generals[2].status = 2; // monarch busy: 37A4 non-zero
  blocked.factions[2].diplomat_idx = 7;
  blocked.generals[7].ability.politics = 14; // direct read, no other checks
  blocked.generals[7].faction = null; // proves no faction/active gate
  assert.deepEqual(
    beginScenarioTruceEvent(blocked.scenario, {
      type: 3,
      arg0: 0,
      arg1: 2,
      arg2: 0xff,
    }),
    {
      phase: "return",
      status: "qualification-failed",
      proposer: 0,
      receiver: 2,
    },
  );
  assert.equal(blocked.factions[0].money, 100000);

  const allowed = trucePaidFixture();
  allowed.generals[2].status = 2;
  allowed.generals[2].ability.politics = 9;
  allowed.legions[2].status = 0x80; // slot monarch first byte >= 80h
  allowed.factions[2].diplomat_idx = 7;
  allowed.generals[7].ability.politics = 14; // p=14, q=9 -> chosen=2, t=4
  const state = beginScenarioTruceEvent(allowed.scenario, {
    type: 3,
    arg0: 0,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(allowed.rngCalls(), 0);
  assert.deepEqual(state, {
    phase: "commit",
    proposer: 0,
    receiver: 2,
    outcome: 1,
    fee: 13000,
  });
});

test("type3 unchecked second 37F5 failure is a hard stop, not a default", () => {
  const f = trucePaidFixture();
  f.generals[2].ability.politics = 0; // no B-side candidate with politics > 0
  f.factions[2].diplomat_idx = 7;
  f.generals[7].ability.politics = 14; // first representative passes
  assert.throws(
    () =>
      beginScenarioTruceEvent(f.scenario, {
        type: 3,
        arg0: 0,
        arg1: 2,
        arg2: 0xff,
      }),
    /37B0/,
  );
  const failed = trucePaidFixture();
  failed.generals[0].ability.politics = 0; // no A-side candidate either
  assert.deepEqual(
    beginScenarioTruceEvent(failed.scenario, {
      type: 3,
      arg0: 0,
      arg1: 2,
      arg2: 0xff,
    }),
    {
      phase: "return",
      status: "qualification-failed",
      proposer: 0,
      receiver: 2,
    },
  );
});

/** P22 paid example shape: T=2 pays 20000, R=17 declares war on A=0. */
function assistancePaidFixture() {
  const f = fixture();
  f.generals[3].faction = 2;
  f.generals[3].ability.politics = 12; // 37F5(T) first representative p=12
  f.generals[17].faction = 17;
  f.generals[18].faction = 17;
  f.generals[18].ability.politics = 8; // 37F5(R) q=8 < p
  f.rows[17][0] = 0x80 | 30; // x
  f.rows[17][2] = 0x80 | 50; // y >= x; e=50; threshold 40; v=40 -> fee 20000
  f.rows[0][17] = 0x80 | 60;
  return f;
}

test("type2 paid NPC cooperation pays first then commits the war tail", () => {
  const f = assistancePaidFixture();
  f.slots[0] = { type: 2, arg0: 17, arg1: 0, arg2: 2 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.rngCalls(), 0, "unequal politics consume no RNG");
  assert.equal(f.factions[2].money, 80000, "563B payer T");
  assert.equal(f.factions[17].money, 120000, "5609 invited R");
  assert.equal(f.factions[17].target_faction, 0, "3593 writes R target A");
  assert.equal(f.factions[0].target_faction, 17, "35AB redirects A to R");
  assert.equal(f.rows[17][0], 15, "3639 min raw & 7Fh >> 1");
  assert.equal(f.rows[0][17], 15);
});

test("type2 busy invited keeps the payment but skips the war", () => {
  const f = assistancePaidFixture();
  f.factions[17].target_faction = 3; // 352A gate fails inside the 325D call
  const state = beginScenarioAssistanceEvent(f.scenario, {
    type: 2,
    arg0: 17,
    arg1: 0,
    arg2: 2,
  });
  assert.equal(state.phase, "settle");
  const tail = settleScenarioAssistanceEvent(f.scenario, state, f.rng);
  assert.deepEqual(tail, {
    phase: "return",
    status: "ignored-busy",
    aggressor: 17,
    defender: 0,
  });
  assert.equal(f.factions[2].money, 80000, "payment is not rolled back");
  assert.equal(f.factions[17].money, 120000);
  assert.equal(f.factions[17].target_faction, 3);
  assert.equal(f.rows[17][0], 0x9e);
});

test("type2 zero fee overrides a computed refusal into a free agreement", () => {
  const f = assistancePaidFixture();
  f.rows[17][0] = 0x80 | 100; // x
  f.rows[17][2] = 0x80 | 89; // y < x -> code 2, but e=89 -> v=1 -> fee 0
  const state = beginScenarioAssistanceEvent(f.scenario, {
    type: 2,
    arg0: 17,
    arg1: 0,
    arg2: 2,
  });
  assert.deepEqual(state, {
    phase: "settle",
    invited: 17,
    target: 0,
    payer: 2,
    outcome: 0,
    fee: 0,
  });
  const tail = settleScenarioAssistanceEvent(f.scenario, state, f.rng);
  assert.equal(tail.phase, "commit");
  commitScenarioWarEvent(f.scenario, tail);
  assert.equal(f.factions[2].money, 100000, "AL=0 skips the money move");
  assert.equal(f.factions[17].money, 100000);
  assert.equal(f.factions[17].target_faction, 0);
});

test("type2 bellicosity byte wrap keeps a hostile-y agreement at 30000", () => {
  const f = assistancePaidFixture();
  f.factions[17].bellicosity = 108; // threshold u8(216+40) wraps to 0
  f.rows[17][0] = 0x50; // x hostile
  f.rows[17][2] = 0x60; // y >= x, y < 80h -> e=0 -> v=90 capped 60 -> fee 30000
  const state = beginScenarioAssistanceEvent(f.scenario, {
    type: 2,
    arg0: 17,
    arg1: 0,
    arg2: 2,
  });
  assert.deepEqual(state, {
    phase: "settle",
    invited: 17,
    target: 0,
    payer: 2,
    outcome: 1,
    fee: 30000,
  });
  const tail = settleScenarioAssistanceEvent(f.scenario, state, f.rng);
  assert.equal(tail.phase, "commit", "hostile relation skips 353F messages");
  commitScenarioWarEvent(f.scenario, tail);
  assert.equal(f.factions[2].money, 70000);
  assert.equal(f.factions[17].money, 130000);
  assert.equal(f.factions[17].target_faction, 0);
  assert.equal(f.rows[17][0], 40, "3639: min(0x50, 0xBC)=0x50 -> 0x28>>1");
});

test("type2 activity gates exit in packet order without any write", () => {
  for (const [slot, label] of [
    [17, "R"],
    [0, "A"],
    [2, "T"],
  ]) {
    const f = assistancePaidFixture();
    f.factions[slot].attr = 0x7f;
    const state = beginScenarioAssistanceEvent(f.scenario, {
      type: 2,
      arg0: 17,
      arg1: 0,
      arg2: 2,
    });
    assert.equal(state.status, "ignored-inactive", label);
    assert.equal(f.factions[2].money, 100000);
    assert.equal(f.rngCalls(), 0);
  }
});

test("type2 invited-player enters 38E6 decision flow; missing UI stays fail-closed", () => {
  const f = assistancePaidFixture();
  f.scenario.player_faction = 17;
  f.scenario.nativePlayerFactionPointer = 17 * 0x40;
  f.slots[0] = { type: 2, arg0: 17, arg1: 0, arg2: 2 };
  assert.throws(() => tickStrategicWarEvents(f.app), /player decision UI/);
  assert.equal(f.app.clock.hold, true);
  assert.equal(f.factions[2].money, 100000);
  assert.equal(f.factions[17].money, 100000);
  assert.equal(f.factions[17].target_faction, null);
});

test("type2 peaceful player defender reuses the two-message 8810 contract", () => {
  const f = assistancePaidFixture();
  f.scenario.player_faction = 0; // A is the player
  f.scenario.nativePlayerFactionPointer = 0;
  f.slots[0] = { type: 2, arg0: 17, arg1: 0, arg2: 2 };
  assert.equal(tickStrategicWarEvents(f.app), true);
  assert.equal(f.factions[2].money, 80000, "35ED settles before the messages");
  assert.equal(f.factions[17].money, 120000);
  assert.equal(f.messages.length, 1, "CE7->8810 TALK63 report first");
  assert.equal(f.messages[0].talkIndex, 63);
  assert.equal(f.messages[0].targetName, "將17", "\\3 is the R monarch");
  assert.equal(f.factions[17].target_faction, null, "no commit before closes");
  f.messages[0].onClose();
  assert.equal(f.messages.length, 2, "3570 monarch declaration follows");
  assert.equal(f.messages[1].talkIndex, 478 + 1, "CX=0x19F selector");
  assert.equal(f.messages[1].gen.idx, 17);
  assert.equal(f.app._strategicEventPostMessageRngPending, true);
  f.messages[1].onClose();
  assert.equal(f.app._nativeWarEventContinuation, null);
  assert.equal(f.app._strategicEventPostMessageRngPending, false);
  assert.equal(f.factions[17].target_faction, 0, "3593 writes R target A");
  assert.equal(
    f.factions[0].target_faction,
    null,
    "35AB skips the player defender",
  );
  assert.equal(f.rows[17][0], 15);
  assert.equal(f.rows[0][17], 15);
});
