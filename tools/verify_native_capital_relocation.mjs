import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tickStrategicWarEvents } from "../web/src/game/ai.js";
import {
  performScenarioCapitalRelocation,
  performScenarioRelocationCommit,
} from "../web/src/game/navigation/scenariocapitalrelocation.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length);

function fixture({ player = 0, pointer = 0, diplomat = 9 } = {}) {
  const cities = Array.from({ length: 192 }, (_, idx) => ({
    idx,
    faction: 0xff,
    attr: 0x80,
    prod: 0,
    name: `城${idx}`,
  }));
  Object.assign(cities[5], { faction: 7, attr: 0x85, prod: 100 });
  Object.assign(cities[7], { faction: 7, attr: 0x80, prod: 200 });
  Object.assign(cities[8], { faction: 7, attr: 0x80, prod: 200 });
  const factions = Array.from({ length: 22 }, (_, idx) => ({ idx }));
  Object.assign(factions[7], {
    attr: 0x80,
    capital: 5,
    diplomat_idx: diplomat,
    monarch_idx: 7,
  });
  const records = Array.from({ length: 128 }, (_, slot) =>
    slot === 127
      ? { slot }
      : { slot, faction: 0xff, status: 0, targetCity: 0xff, roadEdgeOrNode: 0 },
  );
  Object.assign(records[0], {
    faction: 7,
    status: 0x80,
    targetCity: 5,
    roadEdgeOrNode: 40,
  });
  Object.assign(records[1], {
    faction: 7,
    status: 0x80,
    targetCity: 5,
    roadEdgeOrNode: 64,
  });
  Object.assign(records[2], {
    faction: 7,
    status: 0x80,
    targetCity: 9,
    roadEdgeOrNode: 64,
  });
  records[3] = { slot: 3, faction: 2 };
  records[4] = { slot: 4, faction: 7, status: 0x7f };
  const slots = Array(256).fill(null);
  slots[0] = { type: 8, arg0: 7, arg1: 0xff, arg2: 0xff };
  const scenario = {
    player_faction: player,
    nativePlayerFactionPointer: pointer,
    nativeFactionSlots: { version: 1, records: factions },
    nativeLegionSlots: { version: 1, records },
    strategicEventSlots: slots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
    cities,
    factions: factions.slice(0, 8),
    generals: Array.from({ length: 128 }, (_, idx) => ({
      idx,
      name: `將${idx}`,
      talk_idx: idx === 9 ? 2 : 0,
    })),
  };
  const messages = [];
  let rngCalls = 0;
  const app = {
    scenario,
    clock: { hold: false },
    gamebar: {
      enqueueTalkMessage(message) {
        messages.push(message);
      },
      syncClock() {},
    },
    originalRng: {
      nextByte() {
        rngCalls++;
        return 0;
      },
    },
  };
  return {
    app,
    scenario,
    factions,
    cities,
    records,
    messages,
    rngCalls: () => rngCalls,
  };
}

test("fixed KI type8 jump entry and 33EA/6A3D/4502 bodies", () => {
  assert.equal(raw(0x3200, 2).toString("hex"), "ea33");
  assert.equal(
    raw(0x6a3d, 0x5e).toString("hex"),
    "5351525657b9c000be400833d2bbff00bfffff3a440175308a641680e40f3adc72263b540e772122ff750b8a5c1680e30f8b540e8bfef6041f750db7018a5c1680e30f8b540e8bfe83c620e2c68bc73dffff7403f8eb01f95f5e5a595bc3",
  );
  assert.equal(
    raw(0x4502, 0x46).toString("hex"),
    "53515256be402233c98bd18ac88ad4d1e1d1e1d1e1d1e2d1e2d1e2b77f385c017518803c8072133a6420750e884420394c147506895414800c0283c640fecf75dc5e5a595bc3",
  );
});

test("native type8 chooses later preferred tie and preserves exact 127-slot write set", () => {
  const { app, factions, records, messages, rngCalls } = fixture();
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(factions[7].capital, 8);
  assert.equal(records[0].targetCity, 8);
  assert.equal(records[0].roadEdgeOrNode, 40);
  assert.equal(records[0].status, 0x80);
  assert.equal(records[1].targetCity, 8);
  assert.equal(records[1].roadEdgeOrNode, 40);
  assert.equal(records[1].status, 0x82);
  assert.equal(records[2].targetCity, 9);
  assert.deepEqual(records[127], { slot: 127 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 57);
  assert.equal(messages[0].cityName, "城8");
  assert.equal(app._strategicEventPostMessageRngPending, true);
  messages[0].onClose();
  assert.equal(messages.length, 2);
  assert.equal(messages[1].gen.idx, 9);
  assert.equal(messages[1].talkIndex, 0x196 + (0x1a4 - 0x196) * 8 + 2);
  messages[1].onClose();
  assert.equal(app._nativeCapitalRelocationContinuation, null);
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(rngCalls(), 0);
});

test("CFF player and inactive gates return before city/legion mutation", () => {
  const playerCase = fixture({ player: 7 });
  assert.deepEqual(
    performScenarioCapitalRelocation(playerCase.scenario, {
      type: 8,
      arg0: 7,
      arg1: 0,
      arg2: 0,
    }),
    { status: "ignored-player", faction: 7 },
  );
  assert.equal(playerCase.factions[7].capital, 5);
  const inactive = fixture();
  inactive.factions[7].attr = 0x7f;
  assert.deepEqual(
    performScenarioCapitalRelocation(inactive.scenario, {
      type: 8,
      arg0: 7,
      arg1: 0,
      arg2: 0,
    }),
    { status: "ignored-inactive", faction: 7 },
  );
  assert.equal(inactive.factions[7].capital, 5);
});

test("no owned city retains original CF-ignored transformation to capital 189", () => {
  const { scenario, factions, cities } = fixture({ diplomat: null });
  for (const city of cities) city.faction = 0xff;
  const result = performScenarioCapitalRelocation(scenario, {
    type: 8,
    arg0: 7,
    arg1: 0,
    arg2: 0,
  });
  assert.equal(result.status, "relocated");
  assert.equal(result.newCapital, 0xbd);
  assert.equal(factions[7].capital, 0xbd);
});

test("matching independent CFD shows the monarch line after committed writes", () => {
  // 341A cmp SI,CS:[CFD] equal falls into 3421: one monarch personality
  // line (8810 CX=0x1A4 = TALK[518+talk_idx], \2 = committed new capital),
  // then 3445 CALL 5E60 = 98A6-bit1 display gate (rule no-op, 0 RNG).
  const { app, factions, records, messages, rngCalls } = fixture({
    pointer: 7 * 0x40,
  });
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(factions[7].capital, 8);
  assert.equal(records[0].targetCity, 8);
  assert.equal(records[1].status, 0x82);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "native-capital-relocation-player");
  assert.equal(messages[0].gen.idx, 7);
  assert.equal(messages[0].talkIndex, 0x196 + (0x1a4 - 0x196) * 8 + 0);
  assert.equal(messages[0].advisorName, "將7");
  assert.equal(messages[0].cityName, "城8");
  assert.equal(app._strategicEventPostMessageRngPending, true);
  messages[0].onClose();
  assert.equal(app._nativeCapitalRelocationContinuation, null);
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(rngCalls(), 0);
  assert.equal(app.clock.hold, false);
});

test("fixed KI 341A CFD compare, monarch line and 5E60 gate bytes", () => {
  assert.equal(raw(0x341a, 5).toString("hex"), "2e3b36fd0c");
  assert.equal(raw(0x341f, 2).toString("hex"), "7528");
  assert.equal(raw(0x3421, 5).toString("hex"), "8a4403b4ff");
  assert.equal(raw(0x3429, 11).toString("hex"), "8a7c0132dbd1ebd1ebd1eb");
  assert.equal(raw(0x3434, 9).toString("hex"), "8aa75e428a874142b9");
  assert.equal(raw(0x343c, 5).toString("hex"), "b9a401e8ce");
  assert.equal(raw(0x3442, 7).toString("hex"), "83c402e8182ac3");
  assert.equal(raw(0x5e60, 9).toString("hex"), "2ef606a698027501c3");
});

test("late fixed-slot hole preserves earlier 33EA/4502 write prefix", () => {
  const { app, factions, records } = fixture({ diplomat: null });
  delete records[1].faction;
  assert.throws(
    () => tickStrategicWarEvents(app),
    /native capital faction at 451F/,
  );
  assert.equal(factions[7].capital, 8);
  assert.equal(records[0].targetCity, 8);
  assert.equal(records[1].targetCity, 5);
  assert.equal(app.clock.hold, true);
});

test("fixed KI 33FD proposal commit bytes (P38)", () => {
  // 33FD..340E: sub ax,0x840; shl ax x3; mov al,ah; xchg [si+3],ah; cmp al,ah; je 3448
  assert.equal(
    raw(0x33fd, 0x12).toString("hex"),
    "2d4008d1e0d1e0d1e08ac48664033ac47439",
  );
  // 341A: cmp si,cs:[0CFD]; jne 3449 (player/NPC branch)
  assert.equal(raw(0x341a, 0x7).toString("hex"), "2e3b36fd0c7528");
  // 3449: diplomat gate mov ch,[si+2A]; cmp ch,0xFF; je 3484
  assert.equal(raw(0x3449, 0x8).toString("hex"), "8a6c2a80fdff7433");
});

test("live neutral cities (faction null) scan as 0x18 and never throw", () => {
  // P89 live crash: city 6 (live neutral, faction null) threw
  // "Uncovered native capital city 6 owner at 6A50" at strategic tick 243.
  // Fixtures used 0xff sentinels so the suite stayed green.
  const { scenario, factions } = fixture({ diplomat: null });
  for (const city of scenario.cities) city.faction = null;
  Object.assign(scenario.cities[5], { faction: 7, attr: 0x85, prod: 100 });
  Object.assign(scenario.cities[7], { faction: 7, attr: 0x80, prod: 200 });
  Object.assign(scenario.cities[8], { faction: 7, attr: 0x80, prod: 200 });
  const result = performScenarioCapitalRelocation(scenario, {
    type: 8,
    arg0: 7,
    arg1: 0,
    arg2: 0,
  });
  assert.equal(result.status, "relocated");
  assert.equal(result.newCapital, 8);
  assert.equal(factions[7].capital, 8);
});

test("33FD player proposal commit writes capital, retargets 4502 legions and resolves the monarch declaration", () => {
  const { scenario, factions, records } = fixture({
    player: 7,
    pointer: 7 * 0x40,
  });
  const result = performScenarioRelocationCommit(scenario, 7, 8);
  assert.equal(result.status, "player-message");
  assert.equal(result.faction, 7);
  assert.equal(result.oldCapital, 5);
  assert.equal(result.newCapital, 8);
  assert.equal(result.monarchSelector, 0x1a4);
  // 3408 committed the write before any message
  assert.equal(factions[7].capital, 8);
  // 4502 exact write set: slot0 target only; slot1 target+road+status|2; slot2 untouched
  assert.deepEqual(
    [records[0].targetCity, records[0].roadEdgeOrNode, records[0].status],
    [8, 40, 0x80],
  );
  assert.deepEqual(
    [records[1].targetCity, records[1].roadEdgeOrNode, records[1].status],
    [8, 40, 0x82],
  );
  assert.equal(records[2].targetCity, 9);
  // 3421..3448 monarch declaration resolution
  assert.equal(result.reply.talkStyle, 0);
  assert.equal(result.reply.advisorName, "將7");
  assert.equal(result.reply.cityName, "城8");
  assert.equal(result.monarchRecord.idx, 7);
});

test("33FD same-capital ret preserves the committed xchg and skips 4502/messages", () => {
  const { scenario, factions, records } = fixture({
    player: 7,
    pointer: 7 * 0x40,
  });
  const result = performScenarioRelocationCommit(scenario, 7, 5);
  assert.equal(result.status, "unchanged");
  assert.equal(factions[7].capital, 5);
  assert.equal(records[0].targetCity, 5);
  assert.equal(records[1].status, 0x80);
});

test("33FD NPC commit reports through the diplomat gate like 33EA", () => {
  const { scenario, factions } = fixture({ player: 0, pointer: 0 });
  const result = performScenarioRelocationCommit(scenario, 7, 8);
  assert.equal(result.status, "message");
  assert.equal(result.reportTalkIndex, 57);
  assert.equal(result.reply.selector, 0x1a4);
  assert.equal(result.reply.talkStyle, 2);
  assert.equal(result.reply.generalName, "將9");
  assert.equal(result.reply.targetName, "將7");
  assert.equal(factions[7].capital, 8);
  const silent = performScenarioRelocationCommit(
    fixture({ player: 0, pointer: 0, diplomat: null }).scenario,
    7,
    8,
  );
  assert.equal(silent.status, "relocated");
  assert.equal(silent.diplomat, null);
});
