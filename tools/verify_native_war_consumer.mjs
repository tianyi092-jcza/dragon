import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tickStrategicWarEvents } from "../web/src/game/ai.js";
import { performScenarioWarEvent } from "../web/src/game/navigation/scenariowarconsumer.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length);

function fixture({ actor = 1, defender = 2, cff = 0, cfd = 0 } = {}) {
  const factions = Array.from({ length: 22 }, (_, idx) => ({
    idx,
    attr: 0x80,
    monarch_idx: idx,
    advisor_idx: null,
    target_faction: null,
    reserve_cav: 800,
    reserve_arc: 0,
    reserve_inf: 0,
    n_cities: 10,
    money: 100000,
  }));
  const rows = Array.from({ length: 24 }, () => Array(24).fill(0xff));
  rows[actor][defender] = 0x94;
  rows[defender][actor] = 0xbe;
  const slots = Array(256).fill(null);
  slots[0] = { type: 1, arg0: actor, arg1: defender, arg2: 0xff };
  const scenario = {
    player_faction: cff,
    nativePlayerFactionPointer: cfd,
    nativeFactionSlots: { version: 1, records: factions },
    nativeDiplomacyMatrix: { version: 1, rows },
    nativeLegionSlots: { version: 1, records: [] },
    strategicEventSlots: slots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
    factions: factions.slice(0, 3),
    diplomacy: rows.slice(0, 3),
    generals: Array.from({ length: 0x80 }, (_, idx) => ({
      idx,
      name: `將${idx}`,
      talk_idx: idx % 8,
    })),
  };
  const messages = [];
  let rngCalls = 0;
  const app = {
    scenario,
    clock: { hold: false },
    gamebar: {
      syncClock() {},
      enqueueTalkMessage(message) {
        messages.push(message);
      },
    },
    originalRng: {
      nextByte() {
        rngCalls++;
        return 0;
      },
    },
  };
  return { app, scenario, factions, rows, messages, rngCalls: () => rngCalls };
}

test("fixed KI type1 jump, 320C gates, 3091 power, and 3639 relation bytes", () => {
  assert.equal(raw(0x31f2, 2).toString("hex"), "0c32");
  assert.equal(
    raw(0x320c, 0x14).toString("hex"),
    "e80b03720e8bde8ae2e80203720587dee80703c3",
  );
  assert.equal(
    raw(0x3091, 0x3a).toString("hex"),
    "5233c08b5704d1ead1ea03c28b5706d1ead1ea03c28b5708d1ead1ea03c23a67237203b8d0073dd0077603b8d007837f211376025ac333c05ac3",
  );
  assert.equal(
    raw(0x3639, 0x30).toString("hex"),
    "3c187501c380fc187501c3535156e84d008a8c00068aaf00063acd76028acd80e17fd0e9888c0006888f00065e595bc3",
  );
  assert.equal(
    raw(0x35ab, 0x42).toString("hex"),
    "572e3a16ff0c743880fa1874338afa32dbd1ebd1eb8a671980fc24731a32c0d1e8d1e88bf8538bdee8bbfa8bc88bdfe8b4fa5b3bc173098bc6d1e0d1e08867195fc3",
  );
});

test("native NPC type1 commits both targets then symmetric hostile raw with zero RNG", () => {
  const { app, factions, rows, rngCalls } = fixture();
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(factions[1].target_faction, 2);
  assert.equal(factions[2].target_faction, 1);
  assert.equal(rows[1][2], 10);
  assert.equal(rows[2][1], 10);
  assert.equal(rngCalls(), 0);
});

test("2F71 empty-city expansion (defender 0x18) sets aggressor target with no war", () => {
  // KI 320C/3215 attr gates have no range check (351A window pinned above):
  // defender=0x18 reads DS:0600 = matrix[0][0] (0xff here, proceeds).
  // 3526 then skips both messages (3530 je 358c) and the commit writes
  // only the aggressor target; no defender response, no relation writes.
  const { app, scenario, factions, rows, messages, rngCalls } = fixture();
  scenario.strategicEventSlots[0] = { type: 1, arg0: 1, arg1: 0x18, arg2: 0 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(factions[1].target_faction, 0x18);
  assert.equal(messages.length, 0);
  assert.equal(rows[1][2], 0x94, "no forward relation write");
  assert.equal(rows[0][0], 0xff, "alias attr byte not consumed");
  assert.equal(rngCalls(), 0);
});

test("35AB compares old target power, not defender power", () => {
  const stronger = fixture();
  stronger.factions[2].target_faction = 3;
  stronger.factions[3].reserve_cav = 804;
  let result = performScenarioWarEvent(stronger.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(
    stronger.factions[2].target_faction,
    3,
    "equal-or-stronger old target stays",
  );

  const weaker = fixture();
  weaker.factions[2].target_faction = 3;
  weaker.factions[3].reserve_cav = 796;
  result = performScenarioWarEvent(weaker.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(weaker.factions[2].target_faction, 1);
});

test("busy and inactive rechecks consume the event without downstream writes", () => {
  const busy = fixture();
  busy.factions[1].target_faction = 4;
  assert.deepEqual(
    performScenarioWarEvent(busy.scenario, {
      type: 1,
      arg0: 1,
      arg1: 2,
      arg2: 0,
    }),
    { phase: "return", status: "ignored-busy", aggressor: 1, defender: 2 },
  );
  assert.equal(busy.rows[1][2], 0x94);
  const inactive = fixture();
  inactive.factions[2].attr = 0x7f;
  assert.equal(
    performScenarioWarEvent(inactive.scenario, {
      type: 1,
      arg0: 1,
      arg1: 2,
      arg2: 0,
    }).status,
    "ignored-defender",
  );
  assert.equal(inactive.factions[1].target_faction, null);
});

test("already-hostile player paths commit silently using independent CFD/CFF gates", () => {
  const { scenario, factions, rows } = fixture({ cff: 2, cfd: 1 * 0x40 });
  rows[1][2] = 0x10;
  rows[2][1] = 0x30;
  const result = performScenarioWarEvent(scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0,
  });
  assert.equal(result.status, "committed");
  assert.equal(
    factions[1].target_faction,
    null,
    "CFD skips aggressor target write",
  );
  assert.equal(factions[2].target_faction, null, "CFF skips defender response");
  assert.equal(rows[1][2], 8);
  assert.equal(rows[2][1], 8);
});

test("peaceful aggressor-player message holds all writes until TALK closes", () => {
  const { app, factions, rows, messages } = fixture({ cfd: 1 * 0x40 });
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(messages.length, 1, "CDE→8810 declaration enqueued");
  assert.equal(messages[0].talkIndex, 486 + 1, "CX=0x1A0 monarch selector");
  assert.equal(messages[0].gen.idx, 1, "aggressor monarch speaks");
  assert.equal(messages[0].targetName, "將2");
  assert.equal(messages[0].sound, "warn");
  assert.equal(app._strategicEventPostMessageRngPending, true);
  assert.equal(factions[1].target_faction, null);
  assert.equal(factions[2].target_faction, null);
  assert.equal(rows[1][2], 0x94);
  assert.equal(rows[2][1], 0xbe);
  messages[0].onClose();
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(
    factions[1].target_faction,
    null,
    "358C skips the player aggressor target write",
  );
  assert.equal(factions[2].target_faction, 1, "35AB redirects NPC defender");
  assert.equal(rows[1][2], 10);
  assert.equal(rows[2][1], 10);
});

test("peaceful defender-player path shows TALK63 then monarch talk before commit", () => {
  const { app, factions, rows, messages } = fixture({ cff: 2 });
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(messages.length, 1, "CE7→8810 TALK63 report first");
  assert.equal(messages[0].talkIndex, 63);
  assert.equal(messages[0].gen, null);
  assert.equal(messages[0].targetName, "將1", "\\3 is the aggressor monarch");
  assert.equal(messages[0].sound, "warn");
  assert.equal(factions[1].target_faction, null);
  assert.equal(rows[1][2], 0x94);
  messages[0].onClose();
  assert.equal(messages.length, 2, "3570 monarch declaration follows");
  assert.equal(messages[1].talkIndex, 478 + 1, "CX=0x19F monarch selector");
  assert.equal(messages[1].gen.idx, 1);
  assert.equal(factions[1].target_faction, null, "still no write before close");
  assert.equal(rows[1][2], 0x94);
  messages[1].onClose();
  assert.equal(
    factions[1].target_faction,
    2,
    "3593 writes NPC aggressor target",
  );
  assert.equal(
    factions[2].target_faction,
    null,
    "35AB skips the player defender",
  );
  assert.equal(rows[1][2], 10);
  assert.equal(rows[2][1], 10);
});

test("missing TALK return capability stays fail-closed without writes", () => {
  const { app, factions, rows } = fixture({ cfd: 1 * 0x40 });
  delete app.gamebar.enqueueTalkMessage;
  assert.throws(() => tickStrategicWarEvents(app), /TALK return/);
  assert.equal(factions[1].target_faction, null);
  assert.equal(factions[2].target_faction, null);
  assert.equal(rows[1][2], 0x94);
  assert.equal(rows[2][1], 0xbe);
  assert.equal(app.clock.hold, true);
});

// 35AB alias state: T=22/23 hit the all-zero faction slots 22/23; T=24..32
// hit the live 24x24 matrix bytes; T=33..35 hit city records 0..5 (byte +1 is
// the live owner, other offsets come from nativeCityRecordRaw chapter bytes).
const aliasCityState = ({ owner = 0, raw2 = 0, raw3 = 0 } = {}) => {
  const records = Array.from({ length: 192 }, () => "00".repeat(32));
  const city1 = Buffer.alloc(32);
  city1[2] = raw2;
  city1[3] = raw3;
  records[1] = city1.toString("hex");
  const cities = Array.from({ length: 6 }, (_, idx) => ({
    idx,
    faction: idx === 1 ? owner : 0,
    name: `城${idx}`,
  }));
  return { cities, nativeCityRecordRaw: records };
};

test("35AB old targets 22/23 read the zero faction slots and switch", () => {
  for (const target of [22, 23]) {
    const { app, factions, rows } = fixture();
    factions[2].target_faction = target;
    assert.equal(tickStrategicWarEvents(app), true);
    assert.equal(factions[1].target_faction, 2);
    assert.equal(factions[2].target_faction, 1, "P(slot)=0 switches to A");
    assert.equal(rows[1][2], 10);
    assert.equal(rows[2][1], 10);
  }
});

test("35AB old targets 24..32 read live diplomacy matrix bytes", () => {
  const keep = fixture();
  keep.factions[2].target_faction = 24;
  let result = performScenarioWarEvent(keep.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(
    keep.factions[2].target_faction,
    24,
    "matrix 0xff bytes cap at 2000",
  );

  // T=25: resource word = matrix bytes 0x661/0x662 = rows[4][1], rows[4][2].
  const zero = fixture();
  zero.factions[2].target_faction = 25;
  zero.rows[4][1] = 0;
  zero.rows[4][2] = 0;
  result = performScenarioWarEvent(zero.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(
    zero.factions[2].target_faction,
    1,
    "resource word 0 zeroes power",
  );
});

test("35AB old targets 33..35 read city record aliases with live owner", () => {
  // T=33: reserves = city0 raw words 4/6/8 (zero), city-count byte = city1
  // raw[3], resource word = live owner(city1) | raw[2]<<8.
  const zero = fixture();
  zero.factions[2].target_faction = 33;
  Object.assign(zero.scenario, aliasCityState({ owner: 5 }));
  let result = performScenarioWarEvent(zero.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(zero.factions[2].target_faction, 1, "owner 5 keeps word <= 19");

  const keep = fixture();
  keep.factions[2].target_faction = 33;
  Object.assign(keep.scenario, aliasCityState({ owner: null }));
  result = performScenarioWarEvent(keep.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(
    keep.factions[2].target_faction,
    33,
    "owner 0x18 with zero reserves resets to capped 2000 and keeps",
  );
});

test("35AB city alias state is fail-closed when city records are undeclared", () => {
  const { app, factions } = fixture();
  factions[2].target_faction = 33;
  assert.throws(() => tickStrategicWarEvents(app), /alias city record/);
  assert.equal(factions[1].target_faction, 2, "aggressor prefix committed");
  assert.equal(factions[2].target_faction, 33);
  assert.equal(app.clock.hold, true);
});

test("35AB old target 0x24 writes directly without alias reads", () => {
  const direct = fixture();
  direct.factions[2].target_faction = 0x24;
  const result = performScenarioWarEvent(direct.scenario, {
    type: 1,
    arg0: 1,
    arg1: 2,
    arg2: 0xff,
  });
  assert.equal(result.status, "committed");
  assert.equal(direct.factions[2].target_faction, 1);
});
