// Synthetic IO only. KI4C41/4C72/4AA3 raw goldens: legion-fate §13.5.
// No files, original executable, real saves/profile, network or child process.
import assert from "node:assert/strict";
import test from "node:test";
import {
  selectOriginalFieldDefenders,
  performScenarioFieldEntry,
} from "../web/src/game/navigation/originalfieldterrain.js";
import { createScenarioMovementMemory } from "../web/src/game/navigation/scenariomovementmemory.js";
import { createScenarioTerrainMemory } from "../web/src/game/navigation/scenarioterrainmemory.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

const identity = {
  world: { id: "selection", revision: "1" },
  content: { packId: "p", chapterId: "c", revision: "1" },
};
function plane(spans = []) {
  return createScenarioMovementMemory(
    { version: 1, spans },
    { identity, memory: { initialGraph: "00" } },
    false,
  );
}
function boundary(run, at, same) {
  let caught;
  assert.throws(run, (error) => {
    caught = error;
    return error.instruction === at;
  });
  if (same) assert.equal(caught, same);
  return caught;
}
function kernel(records = {}) {
  const words = {},
    trace = [];
  const io = {
    readSlotByte(slot, offset, at) {
      trace.push([at, slot, offset]);
      if (offset === 0) return records[slot]?.status ?? 0; // explicit synthetic inactive scan fixture
      return records[slot][offset];
    },
    readSlotWord(slot, offset, at) {
      trace.push([at, slot, offset]);
      return records[slot][offset];
    },
    readGeneralRating(slot, at) {
      trace.push([at, slot]);
      return records[slot].rating;
    },
    writeBpWord(offset, value, at) {
      trace.push([at, offset, value]);
      words[offset] = value;
    },
    readBpWord(offset, at) {
      trace.push([at, offset]);
      assert(Object.hasOwn(words, offset));
      return words[offset];
    },
  };
  return {
    io,
    trace,
    words,
    run: () => selectOriginalFieldDefenders(io, 10, 6, 1),
  };
}
const eligible = (troops = 100, morale = 100, rating = 32) => ({
  status: 0x80,
  18: 10,
  16: 6,
  1: 1,
  4: troops,
  6: morale,
  rating,
});

test("4C41 same-plane alias preserves ordinary pointer domain, holes, known0/FF, bounds and JSON identity", () => {
  const m = plane([
    { address: 0, hex: "00" },
    { address: 12737, hex: "ff" },
    { address: 98303, hex: "ca" },
  ]);
  const before = m.snapshot();
  assert.equal(m.readAliasByte(0, 0), 0);
  assert.equal(m.readAliasByte(240, 0x22c1), 255);
  assert.equal(m.readByte(24 * 33, 65), 255); // same underlying byte, not a second alias store.
  assert.equal(m.readAliasByte(24 * 200, 98303 - 384 * 200), 0xca);
  assert.equal(m.readAliasByte(24 * 255, 383), 0xca);
  assert.throws(
    () => m.readAliasByte(24 * 255, 384),
    /Uncovered movement alias/,
  );
  assert.throws(
    () => m.readAliasByte(240, 65535),
    /Uncovered movement byte: 69375/,
  );
  for (const [row, offset] of [
    [1, 0],
    [-24, 0],
    [6144, 0],
    [240, -1],
    [240, 65536],
    [240, 1.5],
  ])
    assert.throws(() => m.readAliasByte(row, offset), RangeError);
  assert.throws(() => m.readByte(240, 0x22c1), /Uncovered movement pointer/);
  assert.throws(
    () => m.writeByte(240, 0x22c1, 1),
    /Uncovered movement pointer/,
  );
  assert.deepEqual(m.snapshot(), before);
  const restored = createScenarioMovementMemory(
    JSON.parse(JSON.stringify(before)),
    { identity, memory: { initialGraph: "00" } },
    true,
  );
  assert.equal(restored.readAliasByte(240, 0x22c1), 255);
  m.writeByte(24 * 33, 65, 0);
  assert.equal(m.readAliasByte(240, 0x22c1), 0);
  assert.equal(restored.readAliasByte(240, 0x22c1), 255);
  assert.throws(
    () =>
      createScenarioMovementMemory(
        before,
        { identity, memory: { initialGraph: "01" } },
        true,
      ),
    /initial graph/,
  );
  // Explicit relative raw mapping: segment delta paragraphs *16 + u16 offset.
  for (const base of [0x1000, 0x4000])
    for (const slot of [0, 2, 126, 127]) {
      const row = 240,
        offset = (0x2240 + slot * 0x40 + 1) & 65535;
      assert.equal((base + row) * 16 + offset - base * 16, row * 16 + offset);
    }
});

test("4C7B..4C9D status/Yword/Xword/CH order,127 slots, word count after scan and original BP order", () => {
  const f = kernel({
    0: { status: 0x7f },
    1: { status: 0x80, 18: 0x010a },
    2: { status: 0x80, 18: 10, 16: 7 },
    3: { status: 0x80, 18: 10, 16: 6, 1: 2 },
    4: eligible(),
    126: eligible(),
    127: eligible(65535, 255, 255),
  });
  assert.deepEqual(f.run(), { bx: 0x2340, cx: 4, cf: false });
  assert.deepEqual(f.words, { 0: 0x2340, 2: 0x41c0, 254: 2 });
  assert.deepEqual(f.trace.slice(0, 10), [
    ["4C7B", 0, 0],
    ["4C7B", 1, 0],
    ["4C80", 1, 18],
    ["4C7B", 2, 0],
    ["4C80", 2, 18],
    ["4C85", 2, 16],
    ["4C7B", 3, 0],
    ["4C80", 3, 18],
    ["4C85", 3, 16],
    ["4C8A", 3, 1],
  ]);
  assert.equal(f.trace.filter(([at]) => at === "4C7B").length, 127);
  assert(
    f.trace.findIndex(([at]) => at === "4C9D") >
      f.trace.findLastIndex(([at]) => at === "4C7B"),
  );
  const all = kernel(
    Object.fromEntries(
      Array.from({ length: 127 }, (_, slot) => [slot, eligible(0)]),
    ),
  );
  assert.deepEqual(all.run(), { bx: 0x2240, cx: 4, cf: false });
  assert.equal(Object.keys(all.words).length, 128);
  for (let slot = 0; slot < 127; slot++)
    assert.equal(all.words[slot * 2], 0x2240 + slot * 64);
  assert.equal(all.words[254], 127);
  const empty = kernel();
  assert.deepEqual(empty.run(), { bx: 0x4200, cx: 0x100, cf: true });
  assert.deepEqual(empty.words, { 254: 0 });
});

test("4CBE shifted L04 AL truncation,4CC8 byte MUL,4CD9 lowword,stored G1F and strict ties/allzero", () => {
  const cases = [
    [eligible(15, 255, 255), eligible(16, 16, 0), 1], // L04 SHR4; not display troops/10.
    [eligible(4095, 255, 255), eligible(4096, 255, 255), 0], // AH overwritten: 256 -> AL0.
    [eligible(65535, 255, 255), eligible(4095, 255, 255), 0], // 4095 -> AL255, tied61200.
    [eligible(16, 15, 255), eligible(16, 16, 0), 1],
    [eligible(16, 16, 15), eligible(16, 16, 16), 1],
    [eligible(32, 16, 0), eligible(16, 32, 0), 0],
    [eligible(0, 255, 255), eligible(65535, 0, 255), 0],
  ];
  for (const [a, b, expected] of cases) {
    const f = kernel({ 2: a, 9: b });
    assert.equal(f.run().bx, 0x2240 + (expected ? 9 : 2) * 64);
    assert.deepEqual(
      f.trace.filter(([at]) => at === "4CD0").map(([, s]) => s),
      [2, 9],
    );
  }
  // Exhaust allAL/AH-nibble/G1F-nibble products: valid stored inputs cannot
  // overflow16bits (max61200), despite raw word MUL truncating DX:AX.
  let maximum = 0;
  for (let al = 0; al < 256; al++)
    for (let ah = 0; ah < 16; ah++)
      for (let dl = 1; dl <= 16; dl++) {
        const product = al * ah * dl;
        assert.equal(product & 65535, product);
        maximum = Math.max(maximum, product);
      }
  assert.equal(maximum, 61200);
});

test("4C72 partial list/count/scoring failures preserve exact write prefixes and original Error", () => {
  for (const [method, at, occurrence] of [
    ["readSlotByte", "4C7B", 3],
    ["readSlotWord", "4C80", 3],
    ["readSlotWord", "4C85", 3],
    ["readSlotByte", "4C8A", 3],
    ["writeBpWord", "4C8F", 3],
    ["writeBpWord", "4C9D", 1],
    ["readSlotWord", "4CBE", 2],
    ["readSlotByte", "4CC3", 2],
    ["readGeneralRating", "4CD0", 2],
  ]) {
    const f = kernel({ 0: eligible(), 1: eligible(), 2: eligible() });
    const original = f.io[method],
      error = new TypeError(at);
    error.instruction = at;
    let calls = 0;
    f.io[method] = (...args) => {
      if (args.at(-1) === at && ++calls === occurrence) throw error;
      return original(...args);
    };
    boundary(f.run, at, error);
    assert.equal(f.words[0], 0x2240);
    assert.equal(f.words[2], 0x2280);
    if (["4CBE", "4CC3", "4CD0"].includes(at))
      assert.deepEqual(f.words, { 0: 0x2240, 2: 0x2280, 4: 0x22c0, 254: 3 });
    else {
      assert.equal(Object.hasOwn(f.words, 254), false);
      assert.equal(Object.hasOwn(f.words, 4), at === "4C9D");
    }
  }
});

function scenario() {
  const records = Array.from({ length: 128 }, (_, slot) => ({
    slot,
    status: 0,
  }));
  const A = records[2],
    D = records[4],
    selected = records[8];
  Object.assign(A, {
    status: 0xe1,
    faction: 0,
    x: 5,
    y: 10,
    _markerFrame: 0,
    occupancyOffset: 10,
    occupancyRowParagraph: 240,
  });
  for (const record of [D, selected])
    Object.assign(record, {
      status: 0xe4,
      faction: 1,
      x: 6,
      y: 10,
      occupancyOffset: 10,
      occupancyRowParagraph: 240,
      morale: 100,
      generalIdx: 126,
    });
  D.troops = 1;
  selected.troops = 600;
  const sc = {
    player_faction: 7,
    nativeLegionSlots: { version: 1, records },
    legionSlotCounters: Array(128).fill(9),
    generals: Array.from({ length: 128 }, () => ({ battle_rating: 32 })),
  };
  sc.generals[126].battle_rating = 255; // L02 must NOT select this storedbyte.
  const terrain = createScenarioTerrainMemory(
    { version: 1, spans: [] },
    identity,
    "00".repeat(98304),
    false,
  );
  for (const at of [3849, 3851, 3466, 4234, 3850]) terrain.writeByte(at, 0);
  const movement = plane([{ address: 3850, hex: "ca" }]);
  const rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  return {
    sc,
    A,
    D,
    selected,
    terrain,
    movement,
    rng,
    run: () =>
      performScenarioFieldEntry(sc, A, D, { terrain, movement }, rng, 6, 10),
  };
}

test("Scenario4C41 reads actual attacker SI alias not L01/XY/terrain, known0/FF and no RNG/writes", () => {
  for (const alias of [0, 7, 255]) {
    const f = scenario();
    f.terrain.writeByte(3850, 0xc0);
    f.movement.writeByte(24 * 33, 65, alias); // attackerSI22C0 +1 +row*16 =12737
    f.terrain.writeByte(12737, alias === 7 ? 0 : 7); // independent contrary terrain.
    const before = f.movement.snapshot(),
      rng = f.rng.snapshot();
    const e = boundary(f.run, "529A"); // first unknown six-team input after real4E6C
    assert.equal(e.nativeFieldPrefix.d34, 0xd5);
    assert.equal(e.nativeFieldPrefix.d35, alias === 7 ? 0x40 : 0);
    assert.equal(e.nativeFieldCall.si, 0x22c0);
    assert.deepEqual(f.movement.snapshot(), before);
    assert.deepEqual(f.rng.snapshot(), rng);
  }
  for (const row of [240, 24 * 255]) {
    const f = scenario();
    f.terrain.writeByte(3850, 0xc0);
    f.A.occupancyRowParagraph = row;
    f.movement.writeByte(row, 10, 0);
    const before = f.movement.snapshot(),
      rng = f.rng.snapshot();
    const e = boundary(f.run, "4C41");
    assert.deepEqual(e.nativeFieldPrefix, { d32: 0 });
    assert.equal(f.A.status, 0xe1);
    assert.equal(f.sc.legionSlotCounters[2], 9);
    assert.deepEqual(f.movement.snapshot(), before);
    assert.deepEqual(f.rng.snapshot(), rng);
  }
});

test("Scenario4C72 missing fixedslots/ownfields stops in raw order; no inherited/raw/recomputed G1F", () => {
  for (const [kind, at] of [
    ["slot", "4C7B"],
    ["Y", "4C80"],
    ["X", "4C85"],
    ["owner", "4C8A"],
    ["troops", "4CBE"],
    ["morale", "4CC3"],
    ["rating", "4CD0"],
    ["inherited", "4CD0"],
    ["invalid", "4CD0"],
  ]) {
    const f = scenario();
    if (kind === "slot") f.sc.nativeLegionSlots.records.splice(8, 1);
    if (kind === "Y") delete f.selected.y;
    if (kind === "X") delete f.selected.x;
    if (kind === "owner") delete f.selected.faction;
    if (kind === "troops") delete f.selected.troops;
    if (kind === "morale") delete f.selected.morale;
    if (kind === "rating") delete f.sc.generals[8].battle_rating;
    if (kind === "inherited")
      f.sc.generals[8] = Object.create({ battle_rating: 32 });
    if (kind === "invalid") f.sc.generals[8].battle_rating = 256;
    const e = boundary(f.run, at);
    assert.equal(e.nativeFieldPrefix.bpWords[0], 0x2340);
    assert.equal(
      Object.hasOwn(e.nativeFieldPrefix.bpWords, 254),
      ["troops", "morale", "rating", "inherited", "invalid"].includes(kind),
    );
    assert.equal(Object.hasOwn(e.nativeFieldCall, "selection"), false);
    assert.equal(f.A.status, 0xe1);
    assert.equal(f.sc.legionSlotCounters[2], 9);
    assert.equal(f.D.status, 0xe4);
    assert.equal(f.sc.legionSlotCounters[4], 9);
  }
});

test("4AA3 selects fixed object; four status/03 writes raw order with precise retained prefix on each failure", () => {
  for (const fault of [null, "4AA5", "4AA8", "4AAC", "4AAF"]) {
    const f = scenario(),
      writes = [],
      error = new TypeError(String(fault));
    for (const [record, at] of [
      [f.A, "4AA5"],
      [f.selected, "4AAC"],
    ]) {
      let value = record.status;
      Object.defineProperty(record, "status", {
        enumerable: true,
        configurable: true,
        get: () => value,
        set: (next) => {
          if (at === fault) throw error;
          writes.push(at);
          value = next;
        },
      });
    }
    f.sc.legionSlotCounters = new Proxy(f.sc.legionSlotCounters, {
      set(array, key, value) {
        const at = key === "2" ? "4AA8" : "4AAF";
        if (at === fault) throw error;
        writes.push(at);
        array[key] = value;
        return true;
      },
    });
    const e = boundary(f.run, fault ?? "529A", fault ? error : undefined);
    assert.deepEqual(e.nativeFieldCall.selection, {
      bx: 0x2440,
      cx: 4,
      cf: false,
    });
    assert.equal(e.nativeFieldCall.di, 0x2440);
    assert.equal(e.nativeFieldCall.firstDefender, f.D);
    assert.deepEqual(e.nativeFieldPrefix.bpWords, {
      0: 0x2340,
      2: 0x2440,
      254: 2,
    });
    const sequence = ["4AA5", "4AA8", "4AAC", "4AAF"];
    assert.deepEqual(
      writes,
      fault ? sequence.slice(0, sequence.indexOf(fault)) : sequence,
    );
    assert.equal(f.A.status, writes.includes("4AA5") ? 0xc1 : 0xe1);
    assert.equal(f.sc.legionSlotCounters[2], writes.includes("4AA8") ? 0 : 9);
    assert.equal(f.selected.status, writes.includes("4AAC") ? 0xc4 : 0xe4);
    assert.equal(f.sc.legionSlotCounters[8], writes.includes("4AAF") ? 0 : 9);
    assert.equal(f.D.status, 0xe4);
    assert.equal(f.sc.legionSlotCounters[4], 9);
  }
});

test("4CD0 same-slot own G1F differs from L02 and six-team/ability recomputation", () => {
  for (const winner of [4, 8]) {
    const f = scenario();
    f.D.troops = f.selected.troops = 16;
    for (const record of [f.D, f.selected]) {
      record.units = Array.from({ length: 6 }, () => ({
        troops: record === f.D ? 2550 : 0,
      }));
      f.sc.generals[record.slot].battle_rating =
        record.slot === winner ? 240 : 0;
      f.sc.generals[record.slot].ability = {
        field: 255,
        siege: 255,
        naval: 255,
      };
    }
    const e = boundary(f.run, "529A");
    assert.equal(e.nativeFieldCall.selection.bx, 0x2240 + winner * 64);
  }
});

test("4AA5/4AAC AND reads preserve original Error and counters before any later clear", () => {
  for (const at of ["4AA5", "4AAC"]) {
    const f = scenario(),
      record = at === "4AA5" ? f.A : f.selected;
    const old = record.status,
      error = new TypeError(at);
    let reads = 0,
      value = old;
    Object.defineProperty(record, "status", {
      enumerable: true,
      configurable: true,
      get() {
        if (++reads === 2) throw error;
        return value;
      },
      set(next) {
        value = next;
      },
    });
    boundary(f.run, at, error);
    assert.equal(value, old);
    assert.equal(f.sc.legionSlotCounters[2], at === "4AA5" ? 9 : 0);
    assert.equal(f.sc.legionSlotCounters[8], 9);
    assert.equal(f.sc.legionSlotCounters[4], 9);
    assert.equal(f.A.status, at === "4AA5" ? 0xe1 : 0xc1);
  }
});

test("4CA9 CF1 stops before4AD3 tail without clears; supplied AX/DX/firstDI preserved", () => {
  const f = scenario();
  f.D.y = 11;
  f.selected.y = 11;
  const e = boundary(f.run, "4AD3");
  assert.deepEqual(e.nativeFieldCall.selection, {
    bx: 0x4200,
    cx: 0x100,
    cf: true,
  });
  assert.equal(e.nativeFieldCall.ax, 10);
  assert.equal(e.nativeFieldCall.dx, 6);
  assert.equal(e.nativeFieldCall.firstDefender, f.D);
  assert.equal(Object.hasOwn(e.nativeFieldCall, "di"), false);
  assert.deepEqual(e.nativeFieldPrefix.bpWords, { 254: 0 });
  assert.equal(f.A.status, 0xe1);
  assert.equal(f.sc.legionSlotCounters[2], 9);
  assert.equal(f.D.status, 0xe4);
  assert.equal(f.sc.legionSlotCounters[4], 9);
});
