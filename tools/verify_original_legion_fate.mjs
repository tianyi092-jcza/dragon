// Pure-memory instruction contracts. No Scenario, fetch, saves, or filesystem IO.
import assert from "node:assert/strict";
import test from "node:test";
import {
  OriginalFateBoundaryError,
  originalFate291A,
  originalReturn2977,
  originalCapture29C3,
  originalDelayedReturn2A7E,
  originalGeneralCount2AD2,
  originalGeneralReturn50D7,
  originalGeneralFate3485,
  originalDelayedEnqueue301C,
  originalMonthlyCaptive5940,
  originalRecruitment5899,
  originalMonthlyGeneralScan585F,
  originalErase2BA8,
  originalRemove7028,
} from "../web/src/game/navigation/originallegionfate.js";

function fixture() {
  const state = {
    L: { 5: { 0: 0x90, 1: 1, 2: 90, 3: 77, 26: 17, 28: 48 } },
    G: { 5: { 0: 0x80, 23: 1, 28: 1, 29: 255, 30: 5, 31: 0 } },
    F: {
      1: { 0: 0x80, 1: 89, 3: 7, 20: 1, 24: 9 },
      2: { 0: 0x80, 24: 13 },
    },
    occupancy: { "48:17": 1 },
    player: 3,
    display: 0,
    random: 127,
    randomCalls: 0,
  };
  return memory(state);
}
function memory(state) {
  const log = [];
  const read = (kind, index, offset) => {
    const value = state[kind][index]?.[offset];
    log.push(["read", kind, index, offset, value]);
    return value;
  };
  const write = (kind, index, offset, value) => {
    log.push(["write", kind, index, offset, value]);
    (state[kind][index] ??= {})[offset] = value;
  };
  const io = {
    readLegionByte: (slot, offset) => read("L", slot, offset),
    readLegionWord: (slot, offset) => read("L", slot, offset),
    writeLegionByte: (slot, offset, value) => write("L", slot, offset, value),
    readGeneralByte: (slot, offset) => read("G", slot, offset),
    writeGeneralByte: (slot, offset, value) => write("G", slot, offset, value),
    writeGeneralWord(slot, offset, value) {
      log.push(["word", "G", slot, offset, value]);
      state.G[slot][offset] = value & 255;
      state.G[slot][offset + 1] = value >>> 8;
    },
    readFactionByte: (owner, offset) => read("F", owner, offset),
    writeFactionByte: (owner, offset, value) =>
      write("F", owner, offset, value),
    readOccupancyByte(row, offset) {
      log.push(["occupancy-read", row, offset]);
      return state.occupancy[`${row}:${offset}`];
    },
    writeOccupancyByte(row, offset, value) {
      log.push(["occupancy-write", row, offset, value]);
      state.occupancy[`${row}:${offset}`] = value;
    },
    readPlayerFactionPointer() {
      log.push(["player-pointer"]);
      return state.playerPointer;
    },
    readPlayerFaction() {
      log.push(["player"]);
      return state.player;
    },
    readDisplayFlags() {
      log.push(["display"]);
      return state.display;
    },
    nextRandomByte() {
      state.randomCalls++;
      return state.random;
    },
  };
  return { state, io, log, L: state.L[5], G: state.G[5], F: state.F[1] };
}
function boundary(run, at, detail) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof OriginalFateBoundaryError);
    assert.equal(error.instruction, at);
    if (detail) assert.match(error.message, detail);
    return true;
  });
}
const writes = (f) =>
  f.log.filter((item) =>
    ["write", "word", "occupancy-write"].includes(item[0]),
  );

test("291A inactive reads only status; 2BA8 clears bit4 before explicit display gate", () => {
  for (const status of [0, 8, 0x7f]) {
    const f = fixture();
    f.L[0] = status;
    assert.equal(originalFate291A(f.io, 5, undefined), "inactive");
    assert.deepEqual(f.log, [["read", "L", 5, 0, status]]);
  }
  for (const display of [undefined, 4]) {
    const f = fixture();
    f.state.display = display;
    boundary(
      () => originalFate291A(f.io, 5, 2),
      display === 4 ? "2BB3" : "2BAB",
    );
    assert.equal(f.L[0], 0x80);
    assert.equal(f.state.randomCalls, 0);
    assert.deepEqual(writes(f), [["write", "L", 5, 0, 0x80]]);
  }
  const f = fixture();
  f.state.display = 0xfb; // Other display bits do not block this branch.
  originalErase2BA8(f.io, 5);
  assert.equal(f.L[0], 0x80);
});

test("F03 FF precedes every escape gate; F00 is not the capital gate", () => {
  for (const captor of [1, 0x18, 2]) {
    const f = fixture();
    f.F[3] = 255;
    f.F[1] = f.L[2];
    assert.equal(originalFate291A(f.io, 5, captor), "captured");
    assert.equal(f.state.randomCalls, 0);
    assert.equal(f.G[28], captor);
    assert.equal(f.F[24], 8);
  }
  const f = fixture();
  f.F[0] = 0;
  assert.equal(originalFate291A(f.io, 5, 1), "returning");
  assert.equal(f.state.randomCalls, 0);
  assert.equal(f.G[23], 1);
});

test("monarch compares L02, while rating and capture use SAME slot general", () => {
  for (const gate of ["monarch", "same-owner", "neutral"]) {
    const f = fixture();
    delete f.G[31];
    if (gate === "monarch") f.F[1] = 90;
    const captor = { monarch: 2, "same-owner": 1, neutral: 24 }[gate];
    assert.equal(originalFate291A(f.io, 5, captor), "returning");
    assert.equal(f.state.randomCalls, 0);
    assert.equal(f.L[3], 48);
    assert.equal(f.G[23], 1);
    assert.equal(f.state.G[90], undefined);
  }
  const f = fixture();
  f.F[1] = 5; // Same slot is NOT L02: must still consume ECE0.
  assert.equal(originalFate291A(f.io, 5, 2), "captured");
  assert.equal(f.state.randomCalls, 1);
  assert.equal(f.G[23], 4);
});

test("ECE0 byte and G1F exhaustive 256x256 gates, including always-success ratings", () => {
  const f = fixture();
  for (let rating = 0; rating < 256; rating++) {
    for (let random = 0; random < 256; random++) {
      f.L[0] = 0x80;
      f.G[0] = 0x80;
      f.G[28] = 1;
      f.G[31] = rating;
      f.state.random = random;
      f.state.randomCalls = 0;
      const expected =
        (random & 127) <= (rating >>> 1) + 40 ? "returning" : "captured";
      assert.equal(
        originalFate291A(f.io, 5, 2),
        expected,
        `${rating}/${random}`,
      );
      assert.equal(f.state.randomCalls, 1);
      f.log.length = 0;
    }
  }
  delete f.G[31];
  f.L[0] = 0x90;
  f.state.randomCalls = 0;
  boundary(() => originalFate291A(f.io, 5, 2), "2960");
  assert.equal(f.state.randomCalls, 1);
  assert.equal(f.L[0], 0x80);
});

test("2AD2 independent FF gates, byte wrap, same-owner observable DEC then INC", () => {
  const empty = fixture();
  originalGeneralCount2AD2(empty.io, 255, 255);
  assert.deepEqual(empty.log, []);
  for (const [oldOwner, newOwner, oldResult, newResult] of [
    [1, 255, 255, 255],
    [255, 2, 0, 0],
    [1, 2, 255, 0],
    [1, 1, 0, 255],
  ]) {
    const f = fixture();
    f.F[24] = 0;
    f.state.F[2][24] = 255;
    originalGeneralCount2AD2(f.io, oldOwner, newOwner);
    assert.equal(f.F[24], oldResult);
    assert.equal(f.state.F[2][24], newResult);
    if (oldOwner === newOwner)
      assert.deepEqual(writes(f), [
        ["write", "F", 1, 24, 255],
        ["write", "F", 1, 24, 0],
      ]);
  }
  const f = fixture();
  delete f.state.F[2][24];
  boundary(() => originalGeneralCount2AD2(f.io, 1, 2), "2AEF");
  assert.equal(f.F[24], 8); // No transaction-style rollback.
  boundary(() => originalGeneralCount2AD2(f.io, 1, 24), "2AEF", /alias/);
  assert.equal(f.F[24], 7);
});

test("2977 exact write order and failures preserve only the completed prefix", () => {
  const f = fixture();
  f.state.occupancy["48:17"] = 0;
  f.F[20] = 0;
  originalReturn2977(f.io, 5, 2);
  assert.deepEqual(writes(f), [
    ["occupancy-write", 48, 17, 255],
    ["write", "L", 5, 0, 8],
    ["write", "L", 5, 3, 48],
    ["write", "F", 1, 20, 255],
  ]);
  for (const broken of ["pointer", "occupancy", "F14"]) {
    const f = fixture();
    if (broken === "pointer") f.L[28] = 1;
    if (broken === "occupancy") delete f.state.occupancy["48:17"];
    if (broken === "F14") delete f.F[20];
    const at = { pointer: "2989", occupancy: "298C", F14: "4693" }[broken];
    boundary(() => originalReturn2977(f.io, 5, 2), at);
    assert.equal(f.L[0], broken === "F14" ? 8 : 0x90);
    assert.equal(f.L[3], broken === "F14" ? 48 : 77);
  }
});

test("29C3 active/inactive gates, distinct L01/F14 vs G1C/F18, no captor F18 credit", () => {
  for (const status of [0, 8, 0x7f, 0x80, 0xff]) {
    const f = fixture();
    f.L[0] = status;
    f.G[28] = 2;
    assert.equal(originalCapture29C3(f.io, 5, 1), "captured");
    assert.equal(f.F[20], status >= 128 ? 0 : 1);
    assert.equal(f.F[24], 9);
    assert.equal(f.state.F[2][24], 12);
    assert.equal(f.G[28], 1);
    assert.equal(f.G[29], 2);
    assert.equal(f.G[23], 4);
    assert.equal(f.L[0], 0);
    assert.equal(f.L[3], 77);
    assert.equal(f.state.occupancy["48:17"], status >= 128 ? 0 : 1);
  }
  const f = fixture();
  delete f.F[24];
  boundary(() => originalCapture29C3(f.io, 5, 2), "2AE0");
  assert.equal(f.F[20], 0);
  assert.equal(f.L[0], 0x90);
  assert.equal(f.G[23], 1);
});

test("29C3 permanent branch retains G17=4 and bypasses monarch/talk adjustment", () => {
  const f = fixture();
  f.F[0] = 0x7f;
  f.G[0] = 0xd0;
  assert.equal(originalCapture29C3(f.io, 5, 2), "eliminated");
  assert.deepEqual(
    [f.G[0], f.G[23], f.G[28], f.G[29], f.G[30]],
    [0, 4, 255, 255, 5],
  );
  assert.ok(f.log.some((entry) => entry[0] === "word" && entry[4] === 65535));
  assert.equal(f.F[24], 8);
  const monarch = fixture();
  monarch.G[0] = 0xc0;
  monarch.G[30] = 254;
  originalCapture29C3(monarch.io, 5, 2);
  assert.equal(monarch.G[0], 0x80);
  assert.equal(monarch.G[30], 1);
  const unknown = fixture();
  delete unknown.F[0];
  boundary(() => originalCapture29C3(unknown.io, 5, 2), "2A08");
  assert.deepEqual(
    [unknown.L[0], unknown.G[23], unknown.G[28], unknown.G[29]],
    [0, 4, 2, 1],
  );
});

test("player message blocks stop after rule writes; old-owner wins same-owner input", () => {
  for (const [who, captor, talk] of [
    [1, 2, 33],
    [2, 2, 34],
    [1, 1, 33],
  ]) {
    const f = fixture();
    f.state.player = who;
    boundary(
      () => originalCapture29C3(f.io, 5, captor),
      "2A31",
      new RegExp(`TALK${talk}`),
    );
    assert.equal(f.G[23], 4);
    assert.equal(f.L[0], 0);
  }
  for (const [who, captor, talk] of [
    [1, 2, 31],
    [2, 2, 32],
    [1, 1, 31],
  ]) {
    const f = fixture();
    f.state.player = who;
    boundary(
      () => originalReturn2977(f.io, 5, captor),
      "29AE",
      new RegExp(`TALK${talk}`),
    );
    assert.equal(f.L[3], 48);
    assert.equal(f.F[20], 0);
  }
  const dead = fixture();
  dead.F[0] = 0;
  dead.G[0] = 0x90;
  dead.state.player = 2;
  boundary(() => originalCapture29C3(dead.io, 5, 2), "2A6A", /TALK67/);
  assert.equal(dead.G[23], 4);
  assert.equal(dead.G[28], 255);
});

test("2A7E counts caller-provided byte; JSON memory resume is not a savegame certificate", () => {
  for (const [initial, visits] of [
    [48, 48],
    [0, 256],
    [1, 1],
  ]) {
    let f = fixture();
    f.L[0] = 8;
    f.L[3] = initial;
    for (let i = 1; i <= visits; i++) {
      const result = originalDelayedReturn2A7E(f.io, 5);
      assert.equal(result, i === visits ? "returned" : "waiting");
      if (i === 17) {
        try {
          f = memory(JSON.parse(JSON.stringify(f.state)));
        } catch (error) {
          assert.fail(
            `Explicit memory fixture failed JSON round trip: ${error}`,
          );
        }
      }
    }
    assert.equal(f.G[23], 0);
    assert.equal(f.G[28], 1);
    assert.equal(f.F[24], 9);
  }
  const dead = fixture();
  dead.L[3] = 1;
  dead.F[0] = 0;
  delete dead.state.player; // Dead-faction RET must not even read this field.
  assert.equal(originalDelayedReturn2A7E(dead.io, 5), "unaffiliated");
  assert.equal(dead.G[28], 255);
  assert.ok(!dead.log.some((entry) => entry[0] === "player"));
  const player = fixture();
  player.L[3] = 1;
  player.state.player = 1;
  boundary(() => originalDelayedReturn2A7E(player.io, 5), "2AB2", /CDE/);
  assert.equal(player.L[0], 0);
  assert.equal(player.G[23], 0);
  const waiting = fixture();
  waiting.L[3] = 0;
  delete waiting.state.G[5];
  delete waiting.state.F[1];
  assert.equal(originalDelayedReturn2A7E(waiting.io, 5), "waiting");
  assert.equal(waiting.L[3], 255);
});

test("message boundaries do not consume arguments; capital FF does not consume L02", () => {
  const returning = fixture();
  returning.state.player = 1;
  delete returning.L[2];
  boundary(() => originalReturn2977(returning.io, 5, 2), "29AE", /TALK31/);
  assert.ok(
    !returning.log.some(
      (entry) => entry[0] === "read" && entry[1] === "L" && entry[3] === 2,
    ),
  );
  const captured = fixture();
  captured.state.player = 2;
  delete captured.G[1];
  delete captured.G[30];
  boundary(() => originalCapture29C3(captured.io, 5, 2), "2A31", /TALK34/);
  assert.ok(
    !captured.log.some(
      (entry) =>
        entry[0] === "read" && entry[1] === "G" && [1, 30].includes(entry[3]),
    ),
  );
  const capital = fixture();
  capital.F[3] = 255;
  delete capital.L[2];
  assert.equal(originalFate291A(capital.io, 5, 2), "captured");
  assert.ok(
    !capital.log.some(
      (entry) => entry[0] === "read" && entry[1] === "L" && entry[3] === 2,
    ),
  );
});

test("capture old G1C=FF skips F18 but preserves writes before faction alias rejection", () => {
  const f = fixture();
  f.G[28] = 255;
  boundary(() => originalCapture29C3(f.io, 5, 2), "2A08", /alias/);
  assert.deepEqual(
    [f.L[0], f.G[23], f.G[28], f.G[29], f.F[24]],
    [0, 4, 2, 255, 9],
  );
  assert.ok(!f.log.some((entry) => entry[1] === "F" && entry[3] === 24));
});

test("injected IO write failure is propagated, without rollback or later writes", () => {
  const f = fixture();
  const failure = new Error("injected L00 write failure");
  f.io.writeLegionByte = () => {
    throw failure;
  };
  assert.throws(
    () => originalCapture29C3(f.io, 5, 2),
    (error) => error === failure,
  );
  assert.equal(f.state.occupancy["48:17"], 0);
  assert.equal(f.F[20], 0);
  assert.equal(f.F[24], 8);
  assert.equal(f.L[0], 0x90);
  assert.equal(f.G[23], 1);
  assert.equal(f.G[28], 1);
});

test("7028 old bit3, not active gate; no F14/G17 writes", () => {
  for (const status of [0, 8, 0x80, 0x88]) {
    const f = fixture();
    f.L[0] = status;
    f.state.occupancy["48:17"] = 0;
    originalRemove7028(f.io, 5);
    assert.equal(f.L[0], 0);
    assert.equal(f.state.occupancy["48:17"], status & 8 ? 0 : 255);
    assert.equal(f.F[20], 1);
    assert.equal(f.G[23], 1);
  }
  const f = fixture();
  delete f.state.occupancy["48:17"];
  boundary(() => originalRemove7028(f.io, 5), "7036");
  assert.equal(f.L[0], 0);
});

// Raw KI:50DC/50E0/50EB/50F2/50F5, not the old legacy return helper.
test("50D7 never reads current owner/G00: only active original side gains F18, including same owner", () => {
  for (const current of [undefined, 1, 2, 0x18, 255])
    for (const attr of [0, 0x7f, 0x80, 255])
      for (const count of [0, 255]) {
        const f = fixture();
        delete f.G[0];
        f.G[28] = current;
        f.G[29] = 1;
        f.F[0] = attr;
        f.F[24] = count;
        const untouched = JSON.stringify([
          f.L,
          f.state.occupancy,
          f.state.F[2],
        ]);
        const active = attr >= 0x80;
        assert.equal(
          originalGeneralReturn50D7(f.io, 5),
          active ? "returned" : "unaffiliated",
        );
        assert.deepEqual(writes(f), [
          ["write", "G", 5, 23, 0],
          ["write", "G", 5, 29, 255],
          ["write", "G", 5, 28, active ? 1 : 255],
          ...(active ? [["write", "F", 1, 24, (count + 1) & 255]] : []),
        ]);
        assert.equal(
          JSON.stringify([f.L, f.state.occupancy, f.state.F[2]]),
          untouched,
        );
        assert.equal(f.state.randomCalls, 0);
        assert(
          !f.log.some(
            ([op, kind, , offset]) =>
              op === "read" && kind === "G" && [0, 28].includes(offset),
          ),
        );
      }
});

test("50D7 no FF/18 origin shortcut: all unsupported faction aliases stop after G17/G1D writes", () => {
  for (let origin = 24; origin <= 255; origin++) {
    const f = fixture();
    f.G[29] = origin;
    boundary(() => originalGeneralReturn50D7(f.io, 5), "50EB", /alias/);
    assert.deepEqual(writes(f), [
      ["write", "G", 5, 23, 0],
      ["write", "G", 5, 29, 255],
    ]);
    assert.equal(f.G[28], 1);
    assert.equal(f.F[24], 9);
    assert.equal(f.state.randomCalls, 0);
  }
});

test("50D7 ordered unknown-field failures retain only the completed original prefix", () => {
  for (const [missingKind, offset, at, expected] of [
    ["G", 29, "50E0", [["write", "G", 5, 23, 0]]],
    [
      "F",
      0,
      "50EB",
      [
        ["write", "G", 5, 23, 0],
        ["write", "G", 5, 29, 255],
      ],
    ],
    [
      "F",
      24,
      "2AEF",
      [
        ["write", "G", 5, 23, 0],
        ["write", "G", 5, 29, 255],
        ["write", "G", 5, 28, 1],
      ],
    ],
  ]) {
    const f = fixture();
    f.G[29] = 1;
    delete f[missingKind][offset];
    boundary(() => originalGeneralReturn50D7(f.io, 5), at);
    assert.deepEqual(writes(f), expected);
  }
});

test("50D7 player stop follows count write; inactive-origin FF still compares to player byte", () => {
  for (const active of [false, true]) {
    const f = fixture();
    f.G[29] = 1;
    f.F[0] = active ? 0x80 : 0x7f;
    f.state.player = active ? 1 : 255;
    boundary(
      () => originalGeneralReturn50D7(f.io, 5),
      "5101",
      /CDE\/TALK37\/199/,
    );
    assert.equal(f.G[23], 0);
    assert.equal(f.G[29], 255);
    assert.equal(f.G[28], active ? 1 : 255);
    assert.equal(f.F[24], active ? 10 : 9);
    assert.equal(f.state.randomCalls, 0);
  }
});

test("3485 maps AH directly with no active gate; unknown high general aliases do not write", () => {
  const f = fixture();
  f.G[0] = 0;
  f.G[29] = 2;
  assert.equal(originalGeneralFate3485(f.io, 5), "returned");
  assert.equal(f.G[28], 2);
  assert.equal(f.state.F[2][24], 14);
  for (const index of [undefined, null, "5", -1, 128, 255, 256]) {
    const g = fixture();
    boundary(
      () => originalGeneralFate3485(g.io, index),
      index === 128 || index === 255 ? "3490" : "3485",
    );
    assert.deepEqual(g.log, []);
  }
});

function monthlyMemory(random = 0) {
  const f = fixture();
  Object.assign(f.G, { 24: 0, 25: 1, 29: 2 });
  f.state.random = random;
  f.events = Array(256).fill(0);
  f.words = [];
  f.io.readEventCursorWord = () => 0;
  f.io.readEventTypeByte = (offset) => {
    f.log.push(["event-read", offset]);
    return f.events[offset / 4];
  };
  f.io.writeEventWord = (offset, value) => {
    f.words.push([offset, value]);
    if (offset % 4 === 0) f.events[offset / 4] = value & 255;
  };
  return f;
}

test("5940 full256 RNG domain: only below20 queues; mismatch20..3F returns; join INC wraps", () => {
  for (let random = 0; random < 256; random++) {
    for (const match of [false, true]) {
      const f = monthlyMemory(random);
      f.G[25] = match ? 1 : 2;
      f.F[24] = 255;
      const outcome = originalMonthlyCaptive5940(f.io, 5);
      assert.equal(f.state.randomCalls, 1);
      if (random < 32) {
        const offset = ((random & 15) + 8) * 4;
        assert.equal(outcome, "pending");
        assert.deepEqual(f.words, [
          [offset, 0x0509],
          [offset + 2, 0xffff],
        ]);
        assert.deepEqual(writes(f), [["write", "G", 5, 28, 24]]);
        assert.equal(f.F[24], 255);
      } else if (random < 64 && match) {
        assert.equal(outcome, "joined");
        assert.deepEqual(writes(f), [
          ["write", "G", 5, 29, 255],
          ["write", "G", 5, 23, 0],
          ["write", "F", 1, 24, 0],
        ]);
        assert.equal(f.G[28], 1);
      } else {
        assert.equal(outcome, "unchanged");
        assert.deepEqual(writes(f), []);
        if (random >= 64) assert.deepEqual(f.log, []);
      }
      if (random >= 32) assert.deepEqual(f.words, []);
    }
  }
});

test("5940 strict RNG, FF/18 owner aliases and same-owner F18 reads preserve exact prefixes", () => {
  for (const random of [undefined, null, -1, 256, 0.5, NaN]) {
    const f = monthlyMemory(random);
    f.state.random = random;
    boundary(() => originalMonthlyCaptive5940(f.io, 5), "5941");
    assert.deepEqual(f.log, []);
  }
  for (const owner of [1, 0x18, 255]) {
    const f = monthlyMemory(32);
    f.G[28] = f.G[25] = owner;
    if (owner === 24)
      boundary(() => originalMonthlyCaptive5940(f.io, 5), "2AEF");
    else assert.equal(originalMonthlyCaptive5940(f.io, 5), "joined");
    assert.equal(f.G[29], 255);
    assert.equal(f.G[23], 0);
    assert.equal(f.F[24], owner === 1 ? 10 : 9);
  }
  const f = monthlyMemory(32);
  delete f.F[24];
  boundary(() => originalMonthlyCaptive5940(f.io, 5), "2AEF");
  assert.deepEqual(writes(f), [
    ["write", "G", 5, 29, 255],
    ["write", "G", 5, 23, 0],
  ]);
});

test("301C first probe, word wrapping, occupied search, full CF and separate word failures", () => {
  for (const cursor of [0, 0x3fc, 0x400, 0xfffc]) {
    const f = monthlyMemory();
    f.io.readEventCursorWord = () => cursor;
    f.io.readEventTypeByte = (offset) => {
      f.log.push(["probe", offset]);
      return 0;
    };
    const result = originalDelayedEnqueue301C(f.io, 0x0509, 0xffff, 8);
    const start = (cursor + 32) & 65535;
    assert.deepEqual(f.log, [["probe", start]]);
    assert.deepEqual(result, { inserted: true, offset: start, cf: false });
  }
  const full = monthlyMemory();
  full.events.fill(255);
  assert.deepEqual(originalDelayedEnqueue301C(full.io, 9, 0xffff, 8), {
    inserted: false,
    offset: 0x400,
    cf: false,
  });
  assert.equal(full.log.filter((x) => x[0] === "event-read").length, 248);
  assert.deepEqual(full.words, []);
  const wrap = monthlyMemory();
  wrap.io.readEventCursorWord = () => 0xffdc;
  wrap.io.readEventTypeByte = (offset) => {
    wrap.log.push(["probe", offset]);
    return offset === 0xfffc ? 9 : 0;
  };
  assert.equal(originalDelayedEnqueue301C(wrap.io, 9, 0xffff, 8).offset, 0);
  assert.deepEqual(wrap.log, [
    ["probe", 0xfffc],
    ["probe", 0],
  ]);
  for (const failingOffset of [32, 34]) {
    const f = monthlyMemory();
    const write = f.io.writeEventWord;
    f.io.writeEventWord = (offset, value) => {
      if (offset === failingOffset) throw new Error("injected word failure");
      write(offset, value);
    };
    assert.throws(() => originalMonthlyCaptive5940(f.io, 5), /word failure/);
    assert.deepEqual(f.words, failingOffset === 32 ? [] : [[32, 0x0509]]);
    assert.equal(f.G[28], 1);
    assert.equal(f.state.randomCalls, 1);
    assert.deepEqual(writes(f), []);
  }
});

test("5990 player CDE boundary after queue or F18; queue-full still reaches598A only on actual no-message RET", () => {
  for (const random of [0, 32]) {
    for (const full of [false, true]) {
      const f = monthlyMemory(random);
      f.state.player = 1;
      if (full) f.events.fill(9);
      boundary(() => originalMonthlyCaptive5940(f.io, 5), "599C");
      assert.equal(f.G[28], 1);
      assert.equal(f.F[24], random === 32 ? 10 : 9);
      assert.equal(f.words.length, random === 0 && !full ? 2 : 0);
    }
  }
  const f = monthlyMemory(0);
  f.events.fill(9);
  assert.equal(originalMonthlyCaptive5940(f.io, 5), "pending");
  assert.equal(f.G[28], 24);
  assert.deepEqual(f.words, []);
});

test("585F fixed127 scan order, active gate, countdown1 waits and missing589A stops before RNG", () => {
  const f = monthlyMemory(255);
  f.state.G = Object.fromEntries(
    Array.from({ length: 127 }, (_, i) => [i, { 0: 0 }]),
  );
  f.state.G[0] = { 0: 128, 24: 1 };
  f.state.G[1] = { 0: 128, 24: 255 };
  f.state.G[2] = { 0: 128, 24: 0, 28: 1, 29: 255 };
  f.state.G[3] = { 0: 128, 24: 0, 28: 24, 29: 2 };
  originalMonthlyGeneralScan585F(f.io);
  assert.equal(f.state.G[0][24], 0);
  assert.equal(f.state.G[1][24], 254);
  assert.equal(f.state.randomCalls, 1);
  assert.equal(
    f.log.filter((x) => x[0] === "read" && x[1] === "G" && x[3] === 0).length,
    127,
  );
  assert.equal(
    f.log.some((x) => x[1] === "G" && x[2] === 127),
    false,
  );
  f.state.G[1] = { 0: 128, 24: 0, 28: 255, 29: 2 };
  f.state.G[0] = { 0: 128, 24: 2 };
  boundary(() => originalMonthlyGeneralScan585F(f.io), "589A");
  assert.equal(f.state.G[0][24], 1);
  assert.equal(f.state.randomCalls, 1);
  assert.equal(f.state.G[1][29], 2);
});

test("5940 each joined write failure preserves only5956/595A/2AEF prefix; scan never replays earlier general", () => {
  const expected = [
    ["write", "G", 5, 29, 255],
    ["write", "G", 5, 23, 0],
    ["write", "F", 1, 24, 10],
  ];
  for (let failOn = 0; failOn < 3; failOn++) {
    const f = monthlyMemory(32);
    let index = 0;
    for (const method of ["writeGeneralByte", "writeFactionByte"]) {
      const write = f.io[method];
      f.io[method] = (...args) => {
        if (index++ === failOn) throw new Error("joined write failure");
        return write(...args);
      };
    }
    assert.throws(
      () => originalMonthlyCaptive5940(f.io, 5),
      /joined write failure/,
    );
    assert.deepEqual(writes(f), expected.slice(0, failOn));
    assert.equal(f.state.randomCalls, 1);
    assert.equal(
      f.log.some((x) => x[0] === "player"),
      false,
    );
  }
  const f = monthlyMemory(32);
  f.state.G = { 0: { 0: 128, 24: 0, 28: 1, 29: 2, 25: 1 }, 1: { 0: 128 } };
  boundary(() => originalMonthlyGeneralScan585F(f.io), "586F");
  assert.equal(f.state.G[0][29], 255);
  assert.equal(f.state.G[0][23], 0);
  assert.equal(f.F[24], 10);
  assert.equal(f.state.randomCalls, 1);
});

function recruitmentMemory(random, preferred = 255) {
  const f = fixture();
  Object.assign(f.G, { 25: preferred, 28: 255, 29: 7 });
  f.state.F = Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => [
      i,
      { 0: i < 22 ? 128 : 0, 24: 10, 35: 0 },
    ]),
  );
  f.state.random = random;
  f.state.playerPointer = 0xffff; // Independent word; not player byte3.
  return f;
}

test("5899 preferred full256 RNG, dead bit20 whole attr clear, FF consumption and byte count wrap", () => {
  for (let random = 0; random < 256; random++)
    for (const active of [false, true])
      for (const attr of [0x80, 0xa5]) {
        const f = recruitmentMemory(random, 1);
        f.state.F[1][0] = active ? 128 : 127;
        f.state.F[1][24] = 255;
        f.G[0] = attr;
        originalRecruitment5899(f.io, 5);
        assert.equal(f.state.randomCalls, 1);
        assert.equal(f.G[25], random < 64 ? 255 : 1);
        assert.equal(f.G[28], random < 64 && active ? 1 : 255);
        assert.equal(f.G[0], random < 64 && !active && attr & 32 ? 0 : attr);
        assert.equal(f.state.F[1][24], random < 64 && active ? 0 : 255);
        assert.equal(f.G[23], 1); // Recruitment does not clear G17/G1D.
        assert.equal(f.G[29], 7);
        if (random >= 64) assert.deepEqual(writes(f), []);
      }
});

test("5899 all256 selections x1..22 active counts: later ties, wrap0580, fixed22 excludes slots22/23", () => {
  for (let count = 1; count <= 22; count++)
    for (let random = 0; random < 256; random++) {
      const f = recruitmentMemory(random);
      for (let i = 0; i < 22; i++) f.state.F[i][0] = i < count ? 128 : 0;
      // Special route uses slot23 although minimum scan excludes it.
      f.state.playerPointer = 23 * 64;
      f.state.F[23][35] = 255;
      f.state.F[23][24] = 64;
      const selection = (random & 63) + 1;
      const result = originalRecruitment5899(f.io, 5);
      if (selection >= 48) {
        assert.equal(result, "unchanged");
        assert.equal(f.G[28], 255);
      } else {
        const steps = selection >= 24 ? 1 : selection;
        const expected = (count - 1 + steps - 1) % count;
        assert.equal(f.G[28], expected);
        assert.equal(f.state.F[expected][24], 11);
      }
      assert.equal(f.state.randomCalls, 1);
      assert.equal(
        f.log.filter(
          ([op, k, , off]) => op === "read" && k === "F" && off === 24,
        ).length,
        count * 2 + (selection >= 48 ? 1 : 1),
      );
    }
});

test("5899 minimum F18 ties choose last even FF; strict smaller wins; each qualifying F18 reread is observable", () => {
  for (const base of [0, 1, 254, 255]) {
    const f = recruitmentMemory(0);
    for (let i = 0; i < 22; i++) f.state.F[i][24] = base;
    originalRecruitment5899(f.io, 5);
    assert.equal(f.G[28], 21);
    assert.equal(f.state.F[21][24], (base + 1) & 255);
  }
  const f = recruitmentMemory(0);
  f.state.F[4][24] = 1;
  f.state.F[7][24] = 1;
  originalRecruitment5899(f.io, 5);
  assert.equal(f.G[28], 7);
  const broken = recruitmentMemory(0);
  let count = 0;
  const read = broken.io.readFactionByte;
  broken.io.readFactionByte = (i, o) =>
    i === 0 && o === 24 && ++count === 2 ? undefined : read(i, o);
  boundary(() => originalRecruitment5899(broken.io, 5), "58D4");
  assert.equal(broken.state.randomCalls, 0);
});

test("5899 rare pointer gate exhausts F23/F18 byte pair, equality rejects and inactive player is not gated", () => {
  const f = recruitmentMemory(47);
  f.state.playerPointer = 23 * 64;
  for (let cities = 0; cities < 256; cities++)
    for (let generals = 0; generals < 256; generals++) {
      f.state.F[23][35] = cities;
      f.state.F[23][24] = generals;
      if ((cities >>> 2) + 1 > generals)
        boundary(() => originalRecruitment5899(f.io, 5), "5924", /TALK41/);
      else assert.equal(originalRecruitment5899(f.io, 5), "unchanged");
      assert.equal(f.G[28], 255);
      assert.deepEqual(writes(f), []);
      f.log.length = 0;
    }
  assert.equal(f.state.randomCalls, 65536);
});

test("5899 all-inactive ring stops without fabricated RET; rare pointer route still executes after scan+RNG", () => {
  for (const random of [0, 23, 46, 47, 63]) {
    const f = recruitmentMemory(random);
    for (let i = 0; i < 22; i++) f.state.F[i][0] = 0;
    f.state.playerPointer = 23 * 64;
    if (random < 47)
      boundary(
        () => originalRecruitment5899(f.io, 5),
        "58F1",
        /no original return/,
      );
    else assert.equal(originalRecruitment5899(f.io, 5), "unchanged");
    assert.equal(f.state.randomCalls, 1);
    assert.deepEqual(writes(f), []);
    assert.equal(
      f.log.filter(([op, k, , o]) => op === "read" && k === "F" && o === 0)
        .length,
      random < 47 ? 44 : 22,
    );
  }
});

test("5899 unknown/alias/message boundaries retain ordered G19/owner/count prefixes without CFF reads", () => {
  for (let preferred = 24; preferred < 255; preferred++) {
    const f = recruitmentMemory(0, preferred);
    boundary(() => originalRecruitment5899(f.io, 5), "58B3", /alias/);
    assert.deepEqual(writes(f), [["write", "G", 5, 25, 255]]);
    assert.equal(f.state.randomCalls, 1);
  }
  for (const [kind, at, ownerWritten] of [
    ["attr", "58B3", false],
    ["pointer", "591A", false],
    ["player", "5924", false],
    ["count", "2AEF", true],
  ]) {
    const f = recruitmentMemory(0, 1);
    if (kind === "attr") delete f.state.F[1][0];
    if (kind === "pointer") delete f.state.playerPointer;
    if (kind === "player") f.state.playerPointer = 64;
    if (kind === "count") delete f.state.F[1][24];
    boundary(() => originalRecruitment5899(f.io, 5), at);
    assert.equal(f.G[25], 255);
    assert.equal(f.G[28], ownerWritten ? 1 : 255);
    assert.equal(f.state.randomCalls, 1);
    assert(!f.log.some(([op]) => op === "player"));
  }
  for (const pointer of [1, 0x600, 0xffff]) {
    const f = recruitmentMemory(47);
    f.state.playerPointer = pointer;
    boundary(() => originalRecruitment5899(f.io, 5), "590C", /alias/);
    assert.equal(f.state.randomCalls, 1);
  }
});

test("5899 every committed write failure and585F later unknown preserve preceding general+RNG", () => {
  const expected = [
    ["write", "G", 5, 25, 255],
    ["write", "G", 5, 28, 1],
    ["write", "F", 1, 24, 11],
  ];
  for (let failOn = 0; failOn < 3; failOn++) {
    const f = recruitmentMemory(0, 1);
    let index = 0;
    for (const method of ["writeGeneralByte", "writeFactionByte"]) {
      const write = f.io[method];
      f.io[method] = (...args) => {
        if (index++ === failOn) throw new Error("recruitment write failure");
        return write(...args);
      };
    }
    assert.throws(
      () => originalRecruitment5899(f.io, 5),
      /recruitment write failure/,
    );
    assert.deepEqual(writes(f), expected.slice(0, failOn));
    assert.equal(f.state.randomCalls, 1);
  }
  const f = recruitmentMemory(0, 1);
  f.state.G = { 0: { 0: 128, 24: 0, 25: 1, 28: 255 }, 1: { 0: 128 } };
  boundary(() => originalMonthlyGeneralScan585F(f.io), "586F");
  assert.equal(f.state.G[0][28], 1);
  assert.equal(f.state.F[1][24], 11);
  assert.equal(f.state.randomCalls, 1);
});
