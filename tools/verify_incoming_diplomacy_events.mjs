import assert from "node:assert/strict";

import {
  resolveFactionNegotiation,
  resolveIncomingDiplomacyChoice,
  settleFactionNegotiation,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import { runStrategicDiplomacy } from "../web/src/game/diplomacy.js";

function rawFaction(diplomat = 0xff) {
  const bytes = new Uint8Array(64).fill(0xff);
  bytes[0] = 0x80;
  bytes[0x2a] = diplomat;
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fixture() {
  const factions = [
    {
      idx: 0,
      active: true,
      capital: 0,
      n_cities: 1,
      monarch_idx: 0,
      bellicosity: 8,
      money: 100000,
      raw: rawFaction(),
    },
    {
      idx: 1,
      active: true,
      capital: 1,
      n_cities: 1,
      monarch_idx: 1,
      bellicosity: 10,
      money: 100000,
      raw: rawFaction(),
    },
    {
      idx: 2,
      active: true,
      capital: 2,
      n_cities: 1,
      monarch_idx: 2,
      bellicosity: 6,
      money: 100000,
      raw: rawFaction(),
    },
  ];
  const cities = [
    { idx: 0, faction: 0, raw: "00".repeat(32), x: 1, y: 1 },
    { idx: 1, faction: 1, raw: "00".repeat(32), x: 2, y: 1 },
    { idx: 2, faction: 2, raw: "00".repeat(32), x: 3, y: 1 },
  ];
  const generals = [
    { idx: 0, active: true, faction: 0, status: 0, ability: { politics: 12 } },
    { idx: 1, active: true, faction: 1, status: 0, ability: { politics: 8 } },
    { idx: 2, active: true, faction: 2, status: 0, ability: { politics: 10 } },
    { idx: 3, active: true, faction: 2, status: 0, ability: { politics: 14 } },
  ];
  const scenario = {
    player_faction: 0,
    trust: 255,
    factions,
    cities,
    generals,
    legions: [],
    diplomacy: [
      [0xff, 0xd0, 0xd8],
      [0xd0, 0xff, 0xe0],
      [0xd8, 0xe0, 0xff],
    ],
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  return scenario;
}

// type2 event argument order is recipient/player, attack target, requester.
{
  const sc = fixture();
  sc.strategicEventSlots[0] = { type: 2, arg0: 0, arg1: 1, arg2: 2 };
  let payload;
  const app = {
    scenario: sc,
    gamebar: {
      enqueueIncomingDiplomacyRequest(value) {
        payload = value;
      },
    },
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(payload.requesterFaction.idx, 2);
  assert.equal(payload.targetFaction.idx, 1);
  assert.equal(sc.factions[0].target_faction, undefined);
  payload.onResolve(0, 0);
  assert.equal(sc.factions[0].target_faction, 1);
  assert.equal(sc.diplomacy[0][1] < 0x80, true);
}

// type3 event is requester, recipient, FF; acceptance transfers requester money,
// releases mutual prisoners, clears pair targets and makes ceasefire.
{
  const sc = fixture();
  sc.factions[1].gold = 50000;
  sc.factions[2].gold = 10000;
  sc.factions[1].target_faction = 2;
  sc.factions[2].target_faction = 1;
  sc.diplomacy[1][2] = 0x20;
  sc.diplomacy[2][1] = 0x30;
  sc.generals.push({
    idx: 4,
    active: true,
    faction: 2,
    status: 4,
    origFaction: 1,
    captive_flag: 1,
    ability: { politics: 1 },
  });
  assert.equal(
    settleFactionNegotiation(
      { scenario: sc },
      {
        recipientFaction: sc.factions[2],
        requesterFaction: sc.factions[1],
        outcome: 1,
        goldRequired: 3000,
      },
    ),
    true,
  );
  assert.equal(sc.factions[1].gold, 47000);
  assert.equal(sc.factions[2].gold, 13000);
  assert.equal(sc.factions[1].target_faction, null);
  assert.equal(sc.factions[2].target_faction, null);
  assert.equal(sc.diplomacy[1][2] >= 0x80, true);
  assert.equal(sc.generals[4].faction, 1);
  assert.equal(sc.generals[4].origFaction, null);
}

// 0x3902: player choice overrides only when RNG<=trust; overpay becomes result3.
{
  const sc = fixture();
  const base = { outcome: 2, goldRequired: 4000 };
  assert.deepEqual(
    resolveIncomingDiplomacyChoice(
      { scenario: sc, originalRng: { nextByte: () => 0 } },
      base,
      "accept",
      0,
    ),
    { outcome: 0, goldRequired: 0 },
  );
  assert.deepEqual(
    resolveIncomingDiplomacyChoice(
      { scenario: sc, originalRng: { nextByte: () => 0 } },
      base,
      "pay",
      5000,
    ),
    { outcome: 3, goldRequired: 5000 },
  );
  sc.trust = 0;
  assert.deepEqual(
    resolveIncomingDiplomacyChoice(
      { scenario: sc, originalRng: { nextByte: () => 1 } },
      base,
      "accept",
      0,
    ),
    base,
  );
}

// Generic 0x3771/0x3712 path is callable for AI recipients.
{
  const sc = fixture();
  const result = resolveFactionNegotiation(
    { scenario: sc },
    sc.factions[0],
    sc.factions[2],
    sc.factions[1],
  );
  assert.ok(result);
  assert.ok([0, 1, 2].includes(result.outcome));
}

// Producer regression: type2/type3 are returned as typed 4-byte payloads when gates hit.
{
  const sc = fixture();
  sc.factions[1].target_faction = 2;
  sc.factions[1].reserve_cav = 100;
  sc.factions[2].reserve_cav = 400;
  // Work-list candidates are injected through the same city-neighbour format used by 0x2CDF.
  const city0 = Uint8Array.from({ length: 32 }, () => 0);
  const city1 = Uint8Array.from({ length: 32 }, () => 0);
  const city2 = Uint8Array.from({ length: 32 }, () => 0);
  city1[0] = 3;
  city1[0x1c] = 0;
  city1[0x1d] = 2;
  city2[0] = 2;
  city2[0x1d] = 1;
  sc.cities[0].raw = Buffer.from(city0).toString("hex");
  sc.cities[1].raw = Buffer.from(city1).toString("hex");
  sc.cities[2].raw = Buffer.from(city2).toString("hex");
  sc.diplomacy[1][0] = 0xd0;
  sc.diplomacy[2][0] = 0xd0;
  const events = runStrategicDiplomacy(sc);
  assert.ok(events.some((event) => event.type === 2));
  assert.ok(
    events.every(
      (event) =>
        event.type !== 2 ||
        (event.arg0 != null && event.arg1 != null && event.arg2 != null),
    ),
  );
}

// type3 producer: weaker AI with at least two hostile candidates queues each
// subsequent hostile candidate as {requester,recipient,FF}.
{
  const sc = fixture();
  sc.player_faction = 2;
  sc.factions[0].reserve_cav = 100;
  sc.factions[1].reserve_cav = 400;
  sc.factions[0].money = 100000;
  sc.factions[1].money = 100000;
  sc.factions[2].money = 100000;
  sc.diplomacy[0][1] = 0x10;
  sc.diplomacy[0][2] = 0x20;
  const c0 = Uint8Array.from({ length: 32 }, () => 0);
  c0[0] = 3;
  c0[0x1c] = 1;
  c0[0x1d] = 2;
  sc.cities[0].raw = Buffer.from(c0).toString("hex");
  const events = runStrategicDiplomacy(sc);
  assert.ok(
    events.some(
      (event) =>
        event.type === 3 &&
        event.arg0 === 0 &&
        event.arg1 === 2 &&
        event.arg2 === 0xff,
    ),
  );
}

process.stdout.write(
  "incoming diplomacy events OK: type2/3 decode, negotiation choice, payment/prisoners/target cleanup\n",
);
