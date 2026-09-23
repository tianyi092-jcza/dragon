// Synthetic IO only, no files/network/save/profile. Raw KI tables: fate §13.
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOriginalFieldTerrain,
  performOriginalFieldEntry,
  performScenarioFieldEntry,
} from "../web/src/game/navigation/originalfieldterrain.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { createScenarioMovementMemory } from "../web/src/game/navigation/scenariomovementmemory.js";
import { createScenarioTerrainMemory } from "../web/src/game/navigation/scenarioterrainmemory.js";

const sampleAt = ["4B92", "4B9B", "4BA4", "4BAB", "4BB4"];
function fixture({
  tiles = [0x70, 0xb1, 6, 0x0e, 0],
  player = 7,
  attacker = 0,
  defender = 1,
  aMarker = 0,
  dMarker = 1,
  occupancy = 0,
  alias = 7,
  offset = 10,
} = {}) {
  const trace = [],
    globals = {};
  const rng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  const io = {
    readPlayer(at) {
      trace.push([at]);
      return player;
    },
    readLegionByte(role, at, ip) {
      trace.push([ip, role, at]);
      return at === 1
        ? role === "attacker"
          ? attacker
          : defender
        : role === "attacker"
          ? aMarker
          : dMarker;
    },
    readLegionWord(role, at, ip) {
      trace.push([ip, role, at]);
      return at === 0x1a ? offset : 240;
    },
    readTerrainByte(row, bx, ip) {
      trace.push([ip, row, bx]);
      return tiles[sampleAt.indexOf(ip)];
    },
    readOccupancyByte(row, bx, ip) {
      trace.push([ip, row, bx]);
      return occupancy;
    },
    readOccupancyAliasByte(row, ip) {
      trace.push([ip, row]);
      return alias;
    },
    nextByte(ip) {
      trace.push([ip]);
      return rng.nextByte();
    },
    // Fault injection retains the historical pre-selection prefix assertions.
    selectDefenders() {
      const error = new TypeError("injected4A9E call failure");
      error.instruction = "4A9E";
      throw error;
    },
    writeGlobal(name, value, ip) {
      trace.push([ip, name, value]);
      globals[name] = value;
    },
  };
  return { io, trace, rng, globals };
}
function boundary(run, at) {
  let caught;
  assert.throws(run, (error) => {
    caught = error;
    return error.instruction === at;
  });
  return caught;
}

test("4C4C all byte values, fourteen raw triples and following9859 zero fallback", () => {
  // Literal class set expansion independently transcribed from raw 982F..9859.
  const expected = new Uint8Array(256);
  const ranges = [
    [1, 184, 185],
    [2, 186, 191],
    [3, 112, 167],
    [3, 169, 175],
    [4, 6, 6],
    [4, 29, 29],
    [4, 176, 176],
    [4, 182, 183],
    [5, 177, 179],
    [6, 14, 15],
    [6, 30, 111],
    [7, 168, 168],
    [8, 202, 202],
    [9, 192, 195],
  ];
  for (const [c, lo, hi] of ranges) expected.fill(c, lo, hi + 1);
  for (let tile = 0; tile < 256; tile++) {
    const f = fixture({ tiles: [0, 0, 0, 0, tile] });
    const before = f.rng.snapshot();
    const cx = classifyOriginalFieldTerrain(f.io, 0);
    if (expected[tile] === 8) {
      const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
      assert.equal(cx, 0xd1 + (control.nextByte() & 3));
      assert.deepEqual(f.rng.snapshot(), control.snapshot());
    } else {
      assert.equal(
        cx,
        expected[tile] === 9
          ? 0xd5
          : expected[tile]
            ? 0xce + expected[tile]
            : 0xc6,
        `tile ${tile}`,
      );
      assert.deepEqual(f.rng.snapshot(), before);
    }
    assert.deepEqual(
      f.trace.filter(([ip]) => sampleAt.includes(ip)).map(([ip]) => ip),
      sampleAt,
    );
  }
});

test("4BDD all AL bytes, both-player defender override and neither-player saved input", () => {
  for (let al = 0; al < 256; al++) {
    const f = fixture();
    assert.equal(
      classifyOriginalFieldTerrain(f.io, al),
      al === 0 ? 0x40cc : al === 1 ? 0xcc : al === 3 ? 0x40c2 : 0xc2,
    );
  }
  const both = fixture({
    player: 7,
    attacker: 7,
    defender: 7,
    aMarker: 0,
    dMarker: 3,
  });
  assert.equal(classifyOriginalFieldTerrain(both.io, 1), 0x40c2);
  assert.deepEqual(
    both.trace.slice(0, 5).map(([ip]) => ip),
    ["4B67", "4B6C", "4B71", "4B74", "4B79"],
  );
  assert.equal(
    classifyOriginalFieldTerrain(fixture({ player: 0, aMarker: 1 }).io, 3),
    0xcc,
  );
  assert.equal(
    classifyOriginalFieldTerrain(fixture({ player: 1, dMarker: 0 }).io, 3),
    0x40cc,
  );
});

test("4B92 five samples precede center decision, BX wraps independently and each failure is exact", () => {
  const f = fixture({ offset: 65535, tiles: [0, 0, 0, 0, 0xba] });
  assert.equal(classifyOriginalFieldTerrain(f.io, 0), 0xd0);
  assert.deepEqual(
    f.trace.filter(([ip]) => sampleAt.includes(ip)),
    [
      ["4B92", 216, 382],
      ["4B9B", 216, 384],
      ["4BA4", 216, 65535],
      ["4BAB", 216, 767],
      ["4BB4", 216, 383],
    ],
  );
  for (const at of sampleAt) {
    const g = fixture({ tiles: [0, 0, 0, 0, 0xca] });
    const original = g.io.readTerrainByte,
      error = new TypeError(at);
    error.instruction = at;
    g.io.readTerrainByte = (...args) => {
      if (args[2] === at) throw error;
      return original(...args);
    };
    const before = g.rng.snapshot();
    assert.equal(
      boundary(() => performOriginalFieldEntry(g.io, 0), at),
      error,
    );
    assert.deepEqual(g.globals, { d32: 0 });
    assert.deepEqual(g.rng.snapshot(), before);
    assert.deepEqual(
      g.trace.filter(([ip]) => sampleAt.includes(ip)).map(([ip]) => ip),
      sampleAt.slice(0, sampleAt.indexOf(at)),
    );
  }
});

test("4BFF ordered21 pair table, forward priority on symmetric pairs and fallback", () => {
  const representatives = [
    0, 0xb8, 0xba, 0x70, 6, 0xb1, 0x0e, 0xa8, 0xca, 0xc0,
  ];
  const pairs = [
    [0, 3, 3],
    [1, 3, 0],
    [2, 3, 5],
    [3, 3, 6],
    [4, 3, 4],
    [5, 3, 7],
    [6, 0, 0],
    [6, 0, 4],
    [7, 0, 5],
    [8, 0, 6],
    [8, 5, 6],
    [9, 5, 5],
    [10, 5, 4],
    [11, 4, 4],
    [12, 4, 6],
    [13, 6, 6],
    [14, 7, 7],
    [6, 0, 7],
    [9, 5, 7],
    [14, 6, 7],
    [11, 4, 7],
  ];
  for (let first = 0; first < 10; first++)
    for (let second = 0; second < 10; second++) {
      const f = fixture({
        tiles: [representatives[first], representatives[second], 0, 0, 0],
      });
      const row = pairs.find(
        ([, a, b]) =>
          (a === first && b === second) || (b === first && a === second),
      );
      const cx = row
        ? 0xc0 + row[0] + (row[1] === first && row[2] === second ? 0 : 0x4000)
        : 0xc6;
      assert.equal(
        classifyOriginalFieldTerrain(f.io, 255),
        cx,
        `${first},${second}`,
      );
    }
});

test("class9 DS after LDS uses independent alias not attacker faction; class8 exactly one RNG", () => {
  for (const occupancy of [0, 0xca, 255])
    for (const alias of [0, 7, 255]) {
      const f = fixture({
        tiles: [0, 0, 0, 0, 0xc0],
        occupancy,
        alias,
        attacker: 7,
      });
      assert.equal(
        classifyOriginalFieldTerrain(f.io, 0),
        0xd5 | (((occupancy === 0xca) === (alias !== 7) ? 0 : 0x40) << 8),
      );
      assert.deepEqual(
        f.trace.slice(-5).map(([ip]) => ip),
        ["4C33", "4C33", "4C36", "4C3D", "4C41"],
      );
      assert.equal(
        f.trace.some(([ip]) => ip === "4C1F"),
        false,
      );
    }
});

test("4A87/4A91/4A96 and4A9B failures retain separate writes and consumed class8 RNG", () => {
  for (const at of ["4A87", "4A91", "4A96", "4A9B", "4A9E"]) {
    const f = fixture({ tiles: [0, 0, 0, 0, 0xca] });
    const error = new TypeError(at);
    error.instruction = at;
    const write = f.io.writeGlobal,
      read = f.io.readLegionByte;
    f.io.writeGlobal = (...args) => {
      if (args[2] === at) throw error;
      return write(...args);
    };
    f.io.readLegionByte = (...args) => {
      if (args[2] === at) throw error;
      return read(...args);
    };
    const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
    const directory = at === "4A87" ? null : 0xd1 + (control.nextByte() & 3);
    const caught = boundary(() => performOriginalFieldEntry(f.io, 10), at);
    if (at !== "4A9E") assert.equal(caught, error);
    assert.deepEqual(
      f.globals,
      at === "4A87"
        ? {}
        : at === "4A91"
          ? { d32: 0 }
          : at === "4A96"
            ? { d32: 0, d35: 0 }
            : { d32: 0, d35: 0, d34: directory },
    );
    assert.deepEqual(f.rng.snapshot(), control.snapshot());
  }
});

test("Scenario adapter canonical alias/hole stops preserve original error type; no resource fallback", () => {
  const identity = {
    world: { id: "test", revision: "1" },
    content: { packId: "test", chapterId: "one", revision: "1" },
  };
  const terrain = createScenarioTerrainMemory(
    { version: 1, spans: [] },
    identity,
    "00".repeat(384 * 256),
    false,
  );
  const movement = createScenarioMovementMemory(
    { version: 1, spans: [] },
    { identity, memory: { initialGraph: "00" } },
    false,
  );
  const A = {
    slot: 2,
    faction: 0,
    _markerFrame: 0,
    occupancyRowParagraph: 240,
    occupancyOffset: 10,
  };
  const D = { faction: 1, occupancyRowParagraph: 240, occupancyOffset: 10 };
  const sc = { player_faction: 0 },
    context = { terrain, movement };
  let error = boundary(
    () => performScenarioFieldEntry(sc, A, D, context, null, 44, 33),
    "4B92",
  );
  assert(error instanceof RangeError);
  assert.equal(error.message, "Uncovered terrain byte: 3849");
  assert.deepEqual(error.nativeFieldPrefix, { d32: 0 });
  for (const address of [3849, 3851, 3466, 4234, 3850])
    terrain.writeByte(address, 0);
  terrain.writeByte(3850, 0xc0);
  error = boundary(
    () => performScenarioFieldEntry(sc, A, D, context, null, 44, 33),
    "4C36",
  );
  movement.writeByte(240, 10, 0xca);
  error = boundary(
    () => performScenarioFieldEntry(sc, A, D, context, null, 44, 33),
    "4C41",
  );
  assert.equal(error.message, "Uncovered movement byte: 12737");
  assert.deepEqual(error.nativeFieldPrefix, { d32: 0 });
  assert.deepEqual(error.nativeFieldCall, {
    ax: 33,
    dx: 44,
    firstDefender: D,
    si: 0x22c0,
  });
  D.occupancyRowParagraph = 0;
  boundary(
    () => performScenarioFieldEntry(sc, A, D, context, null, 44, 33),
    "4B92",
  );
});
