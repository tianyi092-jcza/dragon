// Pure synthetic IO; no filesystem/network/process/profile. Raw KI: fate §13.6.
import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchOriginalFieldBattle,
  resolveOriginalFieldQuickBattle,
} from "../web/src/game/navigation/originalfieldbattle.js";
import { performOriginalFieldEntry } from "../web/src/game/navigation/originalfieldterrain.js";

function fixture() {
  const records = {
    attacker: {
      status: 0xc0,
      faction: 0,
      leader: 4,
      troops: 600,
      morale: 200,
      teams: Array(6).fill(100),
      types: Array(6).fill(1),
    },
    defender: {
      status: 0xc0,
      faction: 1,
      leader: 9,
      troops: 600,
      morale: 200,
      teams: Array(6).fill(100),
      types: Array(6).fill(3),
    },
  };
  const abilities = {
    4: { force: 8, lead: 9, field: 0 },
    9: { force: 8, lead: 9, field: 0 },
  };
  const frame = { d34: 0xc6, d35: 0x40 },
    trace = [],
    bytes = Array(12).fill(0);
  let calls = 0;
  const io = {
    readPlayer: () => 2,
    readLegionByte: (role, offset) =>
      records[role][
        { 0: "status", 1: "faction", 2: "leader", 6: "morale" }[offset]
      ],
    writeLegionByte: (role, offset, value) => {
      records[role][{ 0: "status", 3: "counter", 6: "morale" }[offset]] = value;
    },
    readLegionWord: (role) => records[role].troops,
    writeLegionWord: (role, offset, value) => {
      records[role].troops = value;
    },
    readTeamType: (role, index) => records[role].types[index],
    readTeamTroops: (role, index) => records[role].teams[index],
    writeTeamTroops: (role, index, value) => {
      records[role].teams[index] = value;
    },
    readAbility: (leader, key) => abilities[leader][key],
    nextByte: () => {
      assert(calls < bytes.length);
      return bytes[calls++];
    },
    readGlobal: (key) => frame[key],
    writeGlobal: (key, value) => {
      frame[key] = value;
    },
    legionPointer: (role) => (role === "attacker" ? 0x2240 : 0x2440),
    continueLegion: () => true,
  };
  for (const [key, fn] of Object.entries(io))
    io[key] = (...args) => {
      trace.push([key, ...args]);
      return fn(...args);
    };
  return { io, records, abilities, frame, trace, bytes, calls: () => calls };
}
function boundary(run, instruction) {
  let error;
  assert.throws(run, (e) => {
    error = e;
    return e.instruction === instruction;
  });
  return error;
}

test("4E5C player-A precedence including both-player; selected-D delegation; exact global writes and first unknown", () => {
  for (const player of [0, 1, 2])
    for (const delegated of [false, true]) {
      const f = fixture();
      f.io.readPlayer = () => player;
      if (player < 2 && delegated)
        f.records[player === 0 ? "attacker" : "defender"].status |= 4;
      if (player === 2 || delegated) {
        assert.deepEqual(dispatchOriginalFieldBattle(f.io), { ax: 0 });
        assert.deepEqual(f.frame, { d34: 0xc6, d35: 0x40 });
        assert.equal(f.calls(), 12);
      } else {
        boundary(
          () => dispatchOriginalFieldBattle(f.io),
          player === 0 ? "4E82" : "4EA1",
        );
        assert.deepEqual(
          f.frame,
          player === 0
            ? { d34: 0xc6, d35: 0x40, d2e: 0x2240, d30: 0x2440 }
            : { d34: 0xc6, d35: 0xc0, d30: 0x2240, d2e: 0x2440 },
        );
        assert.equal(f.calls(), 0);
        assert(!f.trace.some(([method]) => method === "readTeamType"));
      }
    }
  for (const aDelegated of [false, true]) {
    const f = fixture();
    f.io.readPlayer = () => 0;
    f.records.defender.faction = 0;
    f.records.attacker.status |= aDelegated ? 4 : 0;
    if (aDelegated)
      assert.deepEqual(dispatchOriginalFieldBattle(f.io), { ax: 0 });
    else boundary(() => dispatchOriginalFieldBattle(f.io), "4E82");
    //4E63 short-circuits D-owner and D-status, unlike classifier's both-player override.
    assert(
      !f.trace.some(
        ([m, role, off]) =>
          m === "readLegionByte" &&
          role === "defender" &&
          (off === 0 || off === 1),
      ),
    );
  }
});

test("5130 original six byte writes interleave, old totals not recomputed, 474A A then D and AX failure bits", () => {
  for (const lost of [false, true])
    for (const failed of [0, 1, 2, 3]) {
      const f = fixture();
      if (lost)
        [f.records.attacker.types, f.records.defender.types] = [
          f.records.defender.types,
          f.records.attacker.types,
        ];
      f.records.attacker.troops = 1200;
      f.io.continueLegion = (role, won) => {
        assert.equal(won, role === "attacker" ? !lost : lost);
        assert.equal(f.calls(), 12);
        assert.notEqual(f.records.attacker.morale, 200);
        assert.notEqual(f.records.defender.morale, 200);
        f.trace.push(["474A", role]);
        return !(failed & (role === "attacker" ? 1 : 2));
      };
      assert.deepEqual(resolveOriginalFieldQuickBattle(f.io), {
        ax: failed * 256 + Number(lost),
      });
      const winner = lost ? "defender" : "attacker",
        loser = lost ? "attacker" : "defender";
      assert.deepEqual(f.records[winner].teams, Array(6).fill(98));
      assert.deepEqual(f.records[loser].teams, Array(6).fill(92));
      assert.equal(f.records.attacker.morale, lost ? 46 : 98);
      assert.equal(f.records.defender.morale, lost ? 196 : 92);
      assert.deepEqual(
        f.trace
          .filter(([m]) => m === "writeTeamTroops")
          .map(([, role, i, , at]) => [role, i, at]),
        Array.from({ length: 6 }, (_, i) => [
          [winner, i, "5215"],
          [loser, i, "523A"],
        ]).flat(),
      );
      assert.deepEqual(
        f.trace.filter(([m]) => m === "474A"),
        [
          ["474A", "attacker"],
          ["474A", "defender"],
        ],
      );
    }
});

test("5285/52D7 A commander before D teams, force/lead short circuit and 5304 lead reread, byte wrapping", () => {
  for (const a of [0, 1, 2])
    for (const d of [0, 1, 2]) {
      const f = fixture();
      //0: F<L no RNG;1: F>=L with low2 zero;2: nonzero.
      f.abilities[4] = { force: a ? 200 : 8, lead: a ? 100 : 9, field: 3 };
      f.abilities[9] = { force: d ? 180 : 8, lead: d ? 100 : 9, field: 4 };
      f.bytes.unshift(...[a, d].filter(Boolean).map((x) => (x === 1 ? 0 : 1)));
      resolveOriginalFieldQuickBattle(f.io);
      assert.equal(f.calls(), 12 + Number(a !== 0) + Number(d !== 0));
      const aEnd = f.trace.findIndex(
        ([m, id, key]) => m === "readAbility" && id === 4 && key === "field",
      );
      const dStart = f.trace.findIndex(
        ([m, role]) => m === "readTeamType" && role === "defender",
      );
      assert(aEnd < dStart);
      assert.equal(
        f.trace.filter(([m, , , at]) => m === "readAbility" && at === "5304")
          .length,
        Number(a !== 2) + Number(d !== 2),
      );
    }
});

test("every quick IO failure preserves exact preceding writes and RNG; no DTO commit or second474A after failure", () => {
  const baseline = fixture();
  resolveOriginalFieldQuickBattle(baseline.io);
  for (let cut = 0; cut < baseline.trace.length; cut++) {
    const f = fixture(),
      failure = new TypeError(`cut${cut}`);
    let n = 0;
    for (const [name, fn] of Object.entries(f.io))
      f.io[name] = (...args) => {
        if (n++ === cut) throw failure;
        return fn(...args);
      };
    assert.throws(
      () => resolveOriginalFieldQuickBattle(f.io),
      (e) => e === failure,
    );
    assert.deepEqual(f.trace, baseline.trace.slice(0, cut));
    // Replay only the independently recorded committed prefix on explicit old values.
    const expected = fixture().records;
    for (const [method, role, offset, value] of baseline.trace.slice(0, cut)) {
      if (method === "writeTeamTroops") expected[role].teams[offset] = value;
      if (method === "writeLegionWord") expected[role].troops = value;
      if (method === "writeLegionByte") expected[role].morale = value;
    }
    assert.deepEqual(f.records, expected);
    assert.equal(
      f.calls(),
      baseline.trace.slice(0, cut).filter(([m]) => m === "nextByte").length,
    );
  }
});

test("5171/5263/527B divide exceptions and weight aliases are explicit stops with committed prefixes", () => {
  for (const at of ["5263", "527B"]) {
    const f = fixture();
    f.records[at === "5263" ? "attacker" : "defender"].troops = 1;
    if (at === "527B") f.records.defender.teams = Array(6).fill(255);
    boundary(() => resolveOriginalFieldQuickBattle(f.io), at);
    assert.equal(f.calls(), 12);
    assert.equal(f.records.attacker.troops, 588);
    assert.equal(f.records.defender.troops, at === "527B" ? 1482 : 552);
    assert.equal(f.records.attacker.morale, at === "5263" ? 200 : 196);
    assert.equal(f.records.defender.morale, 200);
  }
  const alias = fixture();
  alias.records.attacker.types[2] = 0;
  boundary(() => resolveOriginalFieldQuickBattle(alias.io), "52A4");
  assert.equal(alias.calls(), 0);
  assert.equal(alias.trace.at(-1).at(-1), "52A1");
  // Legal byte inputs: weighted869*19=16511; modifier4064; power65528 +8 wraps0.
  const zero = fixture();
  zero.records.attacker.teams = [255, 34, 1, 0, 0, 0];
  zero.records.attacker.types = [1, 1, 2, 4, 4, 4];
  zero.records.attacker.morale = 152;
  zero.abilities[4] = { force: 127, lead: 0, field: 15 };
  zero.bytes.unshift(1);
  boundary(() => resolveOriginalFieldQuickBattle(zero.io), "5171");
  assert.equal(zero.calls(), 1);
  assert.equal(zero.records.attacker.troops, 600);
});

test("4AB6 AH1/3 selects only attacker; AH2 only defender; tail does not use AL or quick CF", () => {
  for (const failed of [0, 1, 2, 3]) {
    const f = fixture(),
      calls = [];
    Object.assign(f.io, {
      readTerrainByte: () => 0,
      readLegionWord: (role, off) => (off === 0x1a ? 10 : 240),
      selectDefenders: () => ({ bx: 0x2440, cf: false }),
      selectDefender: () => {},
      dispatchBattle: () => ({ ax: (failed << 8) | 1 }),
      fate: (...args) => calls.push(args),
    });
    assert.equal(performOriginalFieldEntry(f.io, 10), "field-battle");
    assert.deepEqual(
      calls,
      failed
        ? [
            [
              failed === 2 ? "defender" : "attacker",
              failed === 2 ? 0 : 1,
              failed === 2 ? "4ACE" : "4AC4",
            ],
          ]
        : [],
    );
  }
});
