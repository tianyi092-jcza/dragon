import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { monthlyDiplomacyAI } from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { initializeNativeFactionSlots } from "../web/src/game/nativefactions.js";
import {
  initializeNativeDiplomacyMatrix,
  nativeDiplomacyAt,
  rebindNativeDiplomacyViews,
  writeNativeDiplomacyAt,
} from "../web/src/game/nativediplomacy.js";
import { initializeNativeStrategicEventWheel } from "../web/src/game/nativeevents.js";
import { performScenarioMonthlyDiplomacy } from "../web/src/game/navigation/scenariomonthlydiplomacy.js";

const parseJson = (raw, label) => {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`cannot parse ${label}`, { cause });
  }
};
const jsonClone = (value, label) =>
  parseJson(JSON.stringify(value), `${label} JSON round-trip`);
let data;
try {
  data = parseJson(
    fs.readFileSync(new URL("../web/data.json", import.meta.url), "utf8"),
    "web/data.json",
  );
} catch (cause) {
  throw new Error("cannot load native diplomacy fixture", { cause });
}
const official = () => structuredClone(data.scenarios[16]);

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length);

test("KI.EXE 2EFB/3119 FFFF-candidate alias pins (P34)", () => {
  const pins = [
    // 2EFB entry: push di; ax=es:[di]; ah&=7F; bx=ax; ax<<=2; cmp ah,[si+19]
    [0x2efb, "57268b0580e47f8bd8d1e0d1e03a6419"],
    // 2F2A: di=bx（完整被掩候选字，先于2F2C的BL覆写）；BL=好战阈计算
    [0x2f2a, "8bfb8a5c288afbd0ef02df80c31480cb80"],
    // 2F3B: call 30CB; cmp al,bl; ja reject
    [0x2f3b, "e88d013ac3772c"],
    // 2F42: bx=si; call 3091; cx=ax; bx=di; call 3091
    [0x2f42, "8bdee84a018bc88bdfe84301"],
    // 2F6E early reject: pop di; stc; ret
    [0x2f6e, "5ff9c3"],
    // 30CB relation byte read via 3119
    [0x30cb, "53e84a008a075bc3"],
    // 3119 full window: bx=(si>>2)+(si>>3); ax=((di<<2)>>8)&FF; bx+=ax+0x600
    [0x3119, "508bded1ebd1eb8bc3d1eb03d88bc7d1e0d1e08ac432e403d881c3000658c3"],
    // 2CDF候选构造：entry=owner<<6（2D12..2D18）
    [0x2d12, "32dbd1ebd1eb83c300"],
    // 中立邻城写行首0x0600（=0x18<<6）
    [0x2d0b, "26c7050006"],
    // 2D8E目标尾段解码：ah==FF跳、bit7战争marker、(entry&7FFF)>>6==F19才保留
    [0x2d9a, "268b0580fcff741180fc80720c80e47fd1e0d1e03a6419"],
    // 8CAE初始化：向D52:0恰好载入0x5240字节（3094读取0x8003超出此界）
    [0x8cdb, "bf4052e8ab56"],
  ];
  for (const [address, hex] of pins) {
    assert.equal(
      Buffer.from(raw(address, hex.length / 2)).toString("hex"),
      hex,
      `pin mismatch at 0x${address.toString(16)}`,
    );
  }
});
const initialize = (sc) => {
  initializeNativeFactionSlots(sc);
  initializeNativeDiplomacyMatrix(sc);
  initializeNativeStrategicEventWheel(sc);
  return sc;
};
const event = (type, arg0, arg1, arg2) => ({ type, arg0, arg1, arg2 });

test("fixed sources preserve 24x24 diplomacy and 256x4 event bytes in all 20 chapters", () => {
  assert.equal(data.scenarios.length, 20);
  for (const [index, sc] of data.scenarios.entries()) {
    assert.match(sc.nativeDiplomacyRaw, /^[0-9a-f]{1152}$/);
    assert.match(sc.nativeStrategicEventRaw, /^[0-9a-f]{2048}$/);
    assert.equal(
      new Set(sc.nativeStrategicEventRaw).size,
      1,
      `chapter ${index}`,
    );
    assert.equal(sc.nativeStrategicEventRaw[0], "0", `chapter ${index}`);
    const raw = Buffer.from(sc.nativeDiplomacyRaw, "hex");
    for (let actor = 0; actor < sc.diplomacy.length; actor++)
      for (let target = 0; target < sc.diplomacy.length; target++)
        assert.equal(
          raw[actor * 24 + target],
          sc.diplomacy[actor][target],
          `chapter ${index} ${actor}->${target}`,
        );
  }
});

test("official first chapter matches P17 full 2BD9 RNG count and Cao Cao/Lu Bu relation result", () => {
  const sc = initialize(official());
  sc.player_faction = 0;
  const rng = new OriginalBattleRng({ ch: 0, cl: 0, dh: 0 });
  const result = performScenarioMonthlyDiplomacy(sc, rng);
  assert.equal(rng.calls, 30);
  assert.equal(nativeDiplomacyAt(sc, 0, 13, "test"), 0xa1);
  assert.equal(nativeDiplomacyAt(sc, 13, 0, "test"), 0xa7);
  assert.ok(
    sc.strategicEventSlots.some(
      (item) =>
        item?.type === 1 &&
        item.arg0 === 0 &&
        item.arg1 === 13 &&
        item.arg2 === 0xff,
    ),
  );
  assert.equal(result.rows.length, 22);
  assert.equal(sc._strategicEventCursor, 0);
  assert.equal(sc._strategicEventDivider, 7);
});

test("fixed hidden faction rows produce the same month as a 22-faction public view", () => {
  const full = official();
  full.player_faction = 0;
  const hidden = official();
  hidden.player_faction = 0;
  hidden.factions = hidden.factions.slice(0, 1);
  hidden.diplomacy = hidden.diplomacy.slice(0, 1).map((row) => row.slice(0, 1));
  initialize(full);
  initialize(hidden);
  const a = new OriginalBattleRng({ ch: 0, cl: 0, dh: 0 });
  const b = new OriginalBattleRng({ ch: 0, cl: 0, dh: 0 });
  performScenarioMonthlyDiplomacy(full, a);
  performScenarioMonthlyDiplomacy(hidden, b);
  assert.deepEqual(hidden.nativeDiplomacyMatrix, full.nativeDiplomacyMatrix);
  assert.deepEqual(
    hidden.nativeFactionSlots.records.map(
      ({ target_faction }) => target_faction,
    ),
    full.nativeFactionSlots.records.map(({ target_faction }) => target_faction),
  );
  assert.deepEqual(hidden.strategicEventSlots, full.strategicEventSlots);
  assert.deepEqual(b.snapshot(), a.snapshot());
  assert.equal(hidden.factions.length, 1);
  assert.equal(hidden.diplomacy.length, 1);
});

test("2BD9 shifts all three future pages forward and clears the fourth before decisions", () => {
  const sc = initialize(official());
  for (const faction of sc.nativeFactionSlots.records) faction.attr = 0;
  sc.strategicEventSlots.fill(null);
  sc.strategicEventSlots[64] = event(10, 1, 2, 3);
  sc.strategicEventSlots[127] = event(0, 4, 5, 6);
  sc.strategicEventSlots[128] = event(11, 7, 8, 9);
  sc.strategicEventSlots[255] = event(13, 10, 11, 12);
  sc._strategicEventCursor = 63;
  sc._strategicEventDivider = 1;
  let calls = 0;
  performScenarioMonthlyDiplomacy(sc, { nextByte: () => (calls++, 0) });
  assert.equal(calls, 0);
  assert.deepEqual(sc.strategicEventSlots[0], event(10, 1, 2, 3));
  assert.deepEqual(sc.strategicEventSlots[63], event(0, 4, 5, 6));
  assert.deepEqual(sc.strategicEventSlots[64], event(11, 7, 8, 9));
  assert.deepEqual(sc.strategicEventSlots[191], event(13, 10, 11, 12));
  assert.ok(sc.strategicEventSlots.slice(192).every((item) => item === null));
  assert.equal(sc._strategicEventCursor, 0);
  assert.equal(sc._strategicEventDivider, 7);
});

test("candidate sort performs each immediate strict-smaller exchange", () => {
  const sc = initialize(official());
  sc.player_faction = 0;
  for (const faction of sc.nativeFactionSlots.records) faction.attr = 0;
  const actor = sc.nativeFactionSlots.records[0];
  Object.assign(actor, {
    attr: 0x80,
    target_faction: null,
    n_cities: 1,
    bellicosity: 0,
    money: 0,
    reserve_cav: 0,
    reserve_arc: 0,
    reserve_inf: 0,
  });
  for (const city of sc.cities) {
    city.faction = null;
    const raw = Buffer.from(city.raw, "hex");
    raw[0] &= 0xf0;
    city.raw = raw.toString("hex");
  }
  sc.cities[0].faction = 0;
  const source = Buffer.from(sc.cities[0].raw, "hex");
  source[0] = (source[0] & 0xf0) | 0x0f;
  source.set([1, 2, 3, 4], 0x1c);
  sc.cities[0].raw = source.toString("hex");
  for (let owner = 1; owner <= 4; owner++) sc.cities[owner].faction = owner;
  for (const [target, raw] of [
    [1, 20],
    [2, 10],
    [3, 10],
    [4, 0],
  ])
    writeNativeDiplomacyAt(sc, 0, target, raw, "test");
  let calls = 0;
  const result = performScenarioMonthlyDiplomacy(sc, {
    nextByte: () => (calls++, 0xff),
  });
  assert.deepEqual(
    result.rows[0].ordinary.map(({ slot }) => slot),
    [4, 3, 2, 1],
  );
  assert.equal(calls, 1);
});

test("native failure retains shifted-event prefix and enters the strategic hold", () => {
  const sc = initialize(official());
  sc.player_faction = 0;
  sc.strategicEventSlots[64] = event(10, 1, 2, 3);
  sc.nativeDiplomacyMatrix.rows[0][13] = undefined;
  const app = {
    scenario: sc,
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 0 }),
    clock: { hold: false },
  };
  assert.throws(() => monthlyDiplomacyAI(app), /diplomacy/);
  assert.deepEqual(sc.strategicEventSlots[0], event(10, 1, 2, 3));
  assert.equal(sc._strategicEventCursor, 0);
  assert.equal(sc._strategicEventDivider, 7);
  assert.equal(app.originalRng.calls, 0);
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
});

test("JSON restore rejects diplomacy divergence instead of rebuilding fixed bytes", () => {
  const sc = initialize(official());
  const restored = jsonClone(sc, "diplomacy divergence");
  restored.diplomacy[0][13] ^= 1;
  assert.throws(() => rebindNativeDiplomacyViews(restored), /Divergent/);
  const missing = jsonClone(sc, "diplomacy hole");
  delete missing.nativeDiplomacyMatrix.rows[21][23];
  assert.throws(() => rebindNativeDiplomacyViews(missing), /row 21|21->23/);
});

// P34 FFFF-candidate alias fixtures: single active faction with no owned
// cities, so the candidate ring has no ordinary entries and no neutral
// marker; every 2EFB gate runs against the FFFF candidate.
const buildFfffCandidateFixture = (actorIndex) => {
  const sc = initialize(official());
  sc.player_faction = actorIndex;
  for (const faction of sc.nativeFactionSlots.records) faction.attr = 0;
  Object.assign(sc.nativeFactionSlots.records[actorIndex], {
    attr: 0x80,
    target_faction: 0x18,
    n_cities: 0,
    bellicosity: 15, // relation gate threshold = ((15+7+20)&FF)|80 = 0xAA
    money: 100000, // high word 390 > min(0*16+64, 0x61A) = 64
    reserve_cav: 0,
    reserve_arc: 0,
    reserve_inf: 0,
  });
  for (const city of sc.cities) {
    city.faction = null;
    const raw = Buffer.from(city.raw, "hex");
    raw[0] &= 0xf0;
    city.raw = raw.toString("hex");
  }
  return sc;
};
const countRng = () => {
  const feed = { calls: 0 };
  return [feed, { nextByte: () => (feed.calls++, 0xff) }];
};
const assertQuietMonth = (sc, calls) => {
  assert.equal(calls, 0, "no enqueue means no 2FCB RNG");
  assert.ok(
    sc.strategicEventSlots.every((item) => item === null),
    "no strategic event queued",
  );
};

test("FFFF candidate with F19==0xFF short-circuits before the alias read", () => {
  const sc = buildFfffCandidateFixture(0);
  sc.nativeFactionSlots.records[0].target_faction = null;
  const [feed, rng] = countRng();
  performScenarioMonthlyDiplomacy(sc, rng);
  // F19==0xFF reaches the 2D46 capital-move gate: exactly one 2FCB RNG, and
  // the 0xFF feed (>= 0x40) skips the type8 enqueue.
  assert.equal(feed.calls, 1);
  assert.ok(sc.strategicEventSlots.every((item) => item === null));
  assert.equal(sc.nativeFactionSlots.records[0].target_faction, null);
});

test("FFFF candidate relation alias reads the flat matrix row for actor 0", () => {
  const sc = buildFfffCandidateFixture(0);
  writeNativeDiplomacyAt(sc, 10, 15, 0xab, "test");
  const [feed, rng] = countRng();
  performScenarioMonthlyDiplomacy(sc, rng);
  assertQuietMonth(sc, feed.calls);
  assert.equal(sc.nativeFactionSlots.records[0].target_faction, null);
  const passing = buildFfffCandidateFixture(0);
  writeNativeDiplomacyAt(passing, 10, 15, 0xaa, "test");
  assert.throws(
    () =>
      performScenarioMonthlyDiplomacy(passing, {
        nextByte: () => 0xff,
      }),
    /3094/,
  );
});

test("FFFF candidate relation alias reads the flat matrix row for actor 5", () => {
  const rejected = buildFfffCandidateFixture(5);
  writeNativeDiplomacyAt(rejected, 15, 15, 0xab, "test");
  const [feed, rng] = countRng();
  performScenarioMonthlyDiplomacy(rejected, rng);
  assertQuietMonth(rejected, feed.calls);
  assert.equal(sc_record(rejected).target_faction, null);
  const passing = buildFfffCandidateFixture(5);
  writeNativeDiplomacyAt(passing, 15, 15, 0xaa, "test");
  assert.throws(
    () =>
      performScenarioMonthlyDiplomacy(passing, {
        nextByte: () => 0xff,
      }),
    /3094/,
  );
});
const sc_record = (sc) => sc.nativeFactionSlots.records[sc.player_faction];

test("FFFF candidate relation alias crosses into city records for actor 14", () => {
  const rejected = buildFfffCandidateFixture(14);
  rejected.nativeCityRecordRaw = rejected.cities.map((city) => city.raw);
  const raw = Buffer.from(rejected.nativeCityRecordRaw[0], "hex");
  raw[15] = 0xab;
  rejected.nativeCityRecordRaw[0] = raw.toString("hex");
  const [feed, rng] = countRng();
  performScenarioMonthlyDiplomacy(rejected, rng);
  assertQuietMonth(rejected, feed.calls);
  assert.equal(rejected.nativeFactionSlots.records[14].target_faction, null);

  const passing = buildFfffCandidateFixture(14);
  passing.nativeCityRecordRaw = passing.cities.map((city) => city.raw);
  const passRaw = Buffer.from(passing.nativeCityRecordRaw[0], "hex");
  passRaw[15] = 0xaa;
  passing.nativeCityRecordRaw[0] = passRaw.toString("hex");
  assert.throws(
    () =>
      performScenarioMonthlyDiplomacy(passing, {
        nextByte: () => 0xff,
      }),
    /3094/,
  );

  const missing = buildFfffCandidateFixture(14);
  delete missing.nativeCityRecordRaw;
  assert.throws(
    () =>
      performScenarioMonthlyDiplomacy(missing, {
        nextByte: () => 0xff,
      }),
    /nativeCityRecordRaw/,
  );
});
