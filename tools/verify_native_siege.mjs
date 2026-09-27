// Synthetic IO only. KI raw evidence: fate §14/§15; no fs/network/profile.
import assert from "node:assert/strict";
import test from "node:test";
import { resolveOriginalSiegeQuickBattle } from "../web/src/game/navigation/originalfieldbattle.js";
import {
  buildOriginalSiegeDefender,
  dispatchOriginalSiegeBattle,
  performOriginalSiegeEntry,
} from "../web/src/game/navigation/originalsiege.js";
import { refreshOriginalLegion } from "../web/src/game/navigation/originalformation.js";
import {
  readOriginalRetreatCapital,
  retreatOriginalRoadMemory,
  continueOriginalLegionAfterBattle,
} from "../web/src/game/navigation/originalroadretreat.js";

// Explicit RAM contract from the 512 original487B/474A RET vectors (§17).
function neutralRetreatFixture(capital) {
  const sc = {
    factions: [{ idx: 24, capital: 99 }], // deliberately false alias source
    diplomacy: [[], [], []],
    cities: Array.from({ length: 192 }, (_, idx) => ({ idx })),
  };
  sc.diplomacy[0][3] = capital;
  sc.diplomacy[2][14] = 17;
  const legion = {
    slot: 127,
    faction: 24,
    status: 0x10,
    morale: 200,
    roadEdgeOrNode: capital * 8,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 500 })),
  };
  const unexpected = () => assert.fail("shortcut must not access graph RAM");
  const context = {
    memory: { readByte: unexpected, writeByte: unexpected },
    readCityOwnerByte: () => 0,
    roads: { roadNodeById: (id) => ({ id }) },
  };
  return { sc, legion, context };
}

test("neutral4884 reads raw0603 for all bytes; 487B shortcut/FF and474A match original RET, named city domain stays bounded", () => {
  for (let capital = 0; capital < 256; capital++) {
    const { sc, legion, context } = neutralRetreatFixture(capital);
    assert.equal(readOriginalRetreatCapital(sc, 24), capital);
    const result = retreatOriginalRoadMemory({
      readFactionByte: () => 24,
      readCapitalByte: (owner) => readOriginalRetreatCapital(sc, owner),
      readCurrentWord: () => {
        assert.notEqual(capital, 255, "487B FF returns before reading L0E");
        return legion.roadEdgeOrNode;
      },
      readGraphByte: context.memory.readByte,
      writeGraphByte: context.memory.writeByte,
      readStateByte: context.readCityOwnerByte,
    });
    if (capital === 255) {
      assert.deepEqual(result, { bx: 0x600, cf: true, reason: "no-capital" });
      //474A already reads L0E at4761 before calling487B: keep that input.
      assert.equal(
        continueOriginalLegionAfterBattle(sc, legion, false, context),
        false,
      );
    } else {
      assert.deepEqual(result, {
        ax: capital * 32,
        bx: capital * 32,
        cx: capital * 8,
        cf: false,
        reason: "shortcut",
      });
      if (capital < 192) {
        assert.equal(
          continueOriginalLegionAfterBattle(sc, legion, false, context),
          true,
        );
        assert.equal(legion.targetNode, capital);
        assert.equal(legion.targetCity, capital);
        assert.equal(legion.status, 0x12);
        assert.equal(legion.commandState, 10);
      } else {
        assert.throws(
          () => continueOriginalLegionAfterBattle(sc, legion, false, context),
          /city return/,
        );
        assert.equal(legion.status, 0x10);
        assert.equal(Object.hasOwn(legion, "targetNode"), false);
      }
    }
    assert.equal(legion.troops, 300);
    assert.equal(legion.movePeriod, 3);
    assert.equal(legion.markerBase, 85);
    assert.equal(legion.moveDelay, 1);
  }
});

test("474A over300 rereads raw0603 at47A0 after committing target/status; late fault preserves prefix", () => {
  for (const fail of [false, true]) {
    const { sc, legion, context } = neutralRetreatFixture(0);
    for (const unit of legion.units) unit.troops = 600;
    let reads = 0;
    const failure = new Error("explicit second0603 read fault");
    Object.defineProperty(sc.diplomacy[0], 3, {
      get() {
        reads++;
        if (fail && reads === 2) throw failure;
        return 0;
      },
    });
    const run = () =>
      continueOriginalLegionAfterBattle(sc, legion, false, context);
    if (fail) assert.throws(run, (error) => error === failure);
    else assert.equal(run(), true);
    assert.equal(reads, 2);
    assert.equal(legion.troops, 360);
    assert.equal(legion.targetNode, 0);
    assert.equal(legion.targetCity, 0);
    assert.equal(legion.status, 0x12);
    assert.equal(legion.commandState, fail ? undefined : 10);
    assert.equal(Object.hasOwn(legion, "_retreat"), !fail);
  }
});

test("missing/malformed/inherited0603 is not neutral/default/faction24; late failure keeps6FD2 and winning path does not read it", () => {
  for (const bad of [undefined, null, -1, 256, 0.5, "0"]) {
    const { sc, legion, context } = neutralRetreatFixture(0);
    sc.diplomacy[0][3] = bad;
    assert.throws(
      () => continueOriginalLegionAfterBattle(sc, legion, false, context),
      /DS0603/,
    );
    assert.equal(legion.troops, 300);
    assert.equal(legion.moveDelay, 1);
    assert.equal(legion.markerBase, 85);
    assert.equal(legion.status, 0x10);
    assert.equal(Object.hasOwn(legion, "commandState"), false);
    assert.equal(
      continueOriginalLegionAfterBattle(sc, legion, true, context),
      true,
    );
    assert.equal(legion.commandState, 8);
  }
  const { sc } = neutralRetreatFixture(0);
  sc.diplomacy[0] = Object.create({ 3: 0 });
  assert.throws(() => readOriginalRetreatCapital(sc, 24), /DS0603/);
  sc.factions.push({ idx: 0, capital: null });
  assert.equal(readOriginalRetreatCapital(sc, 0), 255);
});

function fixture() {
  const records = {
    attacker: {
      status: 0xe4,
      faction: 0,
      generalIdx: 4,
      morale: 200,
      troops: 600,
      counter: 1,
      teams: Array(6).fill(100),
      types: [1, 1, 3, 3, 2, 2],
    },
    defender: {
      status: 0xe4,
      faction: 1,
      generalIdx: 9,
      morale: 200,
      troops: 600,
      counter: 7,
      teams: Array(6).fill(100),
      types: [1, 1, 3, 3, 2, 2],
    },
  };
  const city = {
    faction: 1,
    x: 8,
    y: 10,
    troops: 87,
    growth: 104,
    defence: 100,
  };
  const abilities = {
    4: { force: 15, lead: 11, siege: 4 },
    9: { force: 13, lead: 5, siege: 0 },
    127: { force: 8, lead: 8, siege: 0 },
  };
  const globals = { d32: 0x860, d34: 1, d35: 0 };
  const trace = [],
    bytes = [0, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  let calls = 0;
  const byteKeys = {
    0: "status",
    1: "faction",
    2: "generalIdx",
    3: "counter",
    6: "morale",
  };
  const cityKeys = {
    1: "faction",
    8: "x",
    10: "y",
    16: "growth",
    17: "defence",
    19: "troops",
  };
  const io = {
    readPlayer: () => 2,
    readLegionByte: (r, o) => records[r][byteKeys[o]],
    writeLegionByte: (r, o, v) => {
      records[r][byteKeys[o]] = v;
    },
    readLegionWord: (r) => records[r].troops,
    writeLegionWord: (r, _offset, v) => {
      records[r].troops = v;
    },
    readTeamType: (r, i) => records[r].types[i],
    writeTeamType: (r, i, v) => {
      records[r].types[i] = v;
    },
    readTeamTroops: (r, i) => records[r].teams[i],
    writeTeamTroops: (r, i, v) => {
      records[r].teams[i] = v;
    },
    readAbility: (g, k) => abilities[g][k],
    readGlobal: (k) => globals[k],
    writeGlobal: (k, v) => {
      globals[k] = v;
    },
    readCityByte: (p, o) => {
      assert.equal(p, 0x860);
      return city[cityKeys[o]];
    },
    readCityWord: (p, o) => {
      assert.equal(p, 0x860);
      return city[cityKeys[o]];
    },
    writeCityByte: (p, o, v) => {
      assert.equal(p, 0x860);
      city[cityKeys[o]] = v;
    },
    nextByte: () => {
      assert(calls < bytes.length);
      return bytes[calls++];
    },
    continueLegion: () => true,
    selectDefenders: () => ({ bx: 0x2480, cf: false, cx: 4 }),
    selectDefender: () => {},
    prepareTemporaryDefender: () => {},
    fate: () => {},
    captureCity: () => {},
    dispatchSiege: (c, d) => dispatchOriginalSiegeBattle(io, c, d),
  };
  for (const [name, fn] of Object.entries(io))
    io[name] = (...args) => {
      trace.push([name, ...args]);
      return fn(...args);
    };
  return {
    io,
    records,
    city,
    abilities,
    globals,
    trace,
    bytes,
    calls: () => calls,
  };
}

test("mode0 original official-byte four outcomes: siege specialty, asymmetric weights, interleaved RNG, city-before-teams", () => {
  for (const [a, d, loses, ratio] of [
    [0, 0, false, 9],
    [0, 1, true, 11],
    [1, 0, false, 12],
    [1, 1, true, 8],
  ]) {
    const f = fixture();
    f.bytes[0] = a;
    f.bytes[1] = d;
    assert.deepEqual(resolveOriginalSiegeQuickBattle(f.io), {
      ax: Number(loses),
    });
    assert.equal(f.calls(), 14);
    const damage = ((63 - ratio) & 255) >>> 2;
    assert.deepEqual(
      [f.city.troops, f.city.growth, f.city.defence],
      [87 - damage, 104 - damage, 100 - damage],
    );
    const cityWrites = f.trace.filter((r) => r[0] === "writeCityByte");
    assert.deepEqual(
      cityWrites.map((r) => [r[2], r[4]]),
      [
        [19, "51D0"],
        [16, "51D9"],
        [17, "51E2"],
      ],
    );
    assert(
      f.trace.indexOf(cityWrites.at(-1)) <
        f.trace.findIndex((r) => r[0] === "writeTeamTroops"),
    );
    assert.deepEqual(
      f.records[loses ? "defender" : "attacker"].teams,
      [96, 92, 96, 92, 96, 92],
    );
    assert.deepEqual(
      f.trace
        .filter((r) => r[0] === "continueLegion")
        .map((r) => r.slice(1, 3)),
      [
        ["attacker", !loses],
        ["defender", loses],
      ],
    );
  }
});

test("city SUB/borrow commits before separate clamp; every IO fault preserves prefix and prevents later RNG/writes", () => {
  const baseline = fixture();
  baseline.city.troops = 1;
  baseline.city.growth = 0;
  baseline.city.defence = 2;
  resolveOriginalSiegeQuickBattle(baseline.io);
  assert(baseline.trace.some((r) => r.at(-1) === "51D5"));
  for (let cut = 0; cut < baseline.trace.length; cut++) {
    const f = fixture();
    f.city.troops = 1;
    f.city.growth = 0;
    f.city.defence = 2;
    let n = 0;
    const failure = new Error(`cut ${cut}`);
    for (const [name, fn] of Object.entries(f.io))
      f.io[name] = (...args) => {
        if (n++ === cut) throw failure;
        return fn(...args);
      };
    assert.throws(
      () => resolveOriginalSiegeQuickBattle(f.io),
      (e) => e === failure,
    );
    assert.deepEqual(f.trace, baseline.trace.slice(0, cut));
  }
});

test("4F8A all 256 totals: preserve residue, no status/03/location/RNG/F14 writes; quotient then type then remainder INC", () => {
  for (let total = 0; total < 256; total++) {
    const f = fixture();
    f.city.troops = total;
    f.records.defender.residue = { node: 0x810 };
    buildOriginalSiegeDefender(f.io, 0x860);
    assert.deepEqual(
      f.records.defender.teams,
      Array.from(
        { length: 6 },
        (_, i) => Math.floor(total / 6) + Number(i < total % 6),
      ),
    );
    assert.equal(f.records.defender.status, 0xe4);
    assert.equal(f.records.defender.counter, 7);
    assert.deepEqual(f.records.defender.residue, { node: 0x810 });
    assert.equal(f.calls(), 0);
    assert.equal(f.records.defender.generalIdx, 127);
    assert.equal(f.records.defender.morale, 255);
    assert.deepEqual(f.records.defender.types, Array(6).fill(3));
    const writes = f.trace.filter((r) => r[0] === "writeTeamTroops");
    assert.equal(writes.length, 6 + (total % 6));
  }
});

test("4ED7 gates use city owner, A priority and no fake message/tactical globals", () => {
  for (const empty of [false, true])
    for (const player of [0, 1, 2])
      for (const delegated of [false, true]) {
        const f = fixture();
        f.io.readPlayer = () => player;
        f.records.attacker.status = f.records.defender.status = delegated
          ? 0xc4
          : 0xc0;
        if (empty) buildOriginalSiegeDefender(f.io, 0x860);
        const gate =
          !empty && !delegated && player < 2
            ? player === 0
              ? "4F36"
              : "4F13"
            : null;
        if (gate) {
          // 4F36/4F13不再裸停：dispatch回战术挂起描述符（kind/talk/at），
          // 全局/D2E-D35照旧不写（战术返回后才由1B5A写）；通道缺失的历史stop
          // 下沉到入口层io.suspendTacticalBattle（裸叶合同，行军集成测试锁定）。
          const kind = player === 0 ? "siege-attack" : "siege-defence";
          assert.deepEqual(dispatchOriginalSiegeBattle(f.io, 0x860, 0x2480), {
            suspended: "tactical-suspended",
            kind,
            talk: player === 0 ? 28 : 27,
            at: gate,
            detail:
              gate === "4F36"
                ? "CDE/TALK28/tactical return"
                : "4F58/TALK27/tactical return",
          });
          assert.equal(f.calls(), 0);
        } else {
          // For a player-owned empty city, victory stops at TALK26 BEFORE cleanup/capture.
          if (empty && player === 1) {
            assert.throws(
              () => dispatchOriginalSiegeBattle(f.io, 0x860, 0x4200),
              (e) => e.instruction === "4F06",
            );
          } else
            dispatchOriginalSiegeBattle(f.io, 0x860, empty ? 0x4200 : 0x2480);
          assert(f.calls() >= 12);
        }
        assert.deepEqual(f.globals, { d32: 0x860, d34: 1, d35: 0 });
      }
});

test("4ADE all AX return-site inputs: only losing side fate, temporary cleanup first, original BP capture contract", () => {
  for (const empty of [false, true])
    for (const lost of [0, 1])
      for (const ah of [0, 1, 2, 3]) {
        const f = fixture();
        f.io.dispatchSiege = () => ({ ax: ah * 256 + lost });
        if (empty)
          f.io.selectDefenders = () => ({ bx: 0x4200, cx: 256, cf: true });
        assert.equal(performOriginalSiegeEntry(f.io, 0x860), "siege-battle");
        assert.equal(f.records.attacker.status, 0xc4);
        assert.equal(f.records.attacker.counter, 0);
        assert.equal(f.records.defender.counter, 7);
        assert.equal(f.records.defender.status, empty ? 0 : 0xe4);
        const fates = f.trace.filter((r) => r[0] === "fate");
        assert.deepEqual(
          fates.map((r) => r.slice(1, 3)),
          lost
            ? ah & 1
              ? [["attacker", 1]]
              : []
            : !empty && ah & 2
              ? [["defender", 0]]
              : [],
        );
        assert.equal(
          f.trace.filter((r) => r[0] === "captureCity").length,
          Number(!lost),
        );
      }
});

test("6FD2 neutral owner uses same raw diplomacy063E for every byte, keeps late-failure prefix", () => {
  for (let b = 0; b < 256; b++) {
    const record = {
      slot: 127,
      faction: 24,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 10 })),
    };
    const sc = { diplomacy: Array.from({ length: 3 }, () => []) };
    sc.diplomacy[2][14] = b;
    refreshOriginalLegion(sc, record);
    assert.deepEqual(
      [record.troops, record.movePeriod, record.markerBase, record.moveDelay],
      [6, 3, (b * 5) & 255, 1],
    );
  }
  const record = {
    slot: 127,
    faction: 24,
    moveDelay: 9,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 10 })),
  };
  assert.throws(() => refreshOriginalLegion({}, record), /700F/);
  assert.equal(record.troops, 6);
  assert.equal(record.movePeriod, 3);
  assert.equal(record.moveDelay, 9);
});

test("4F06 attacker-won verdict suspends TALK26 with a channel, historic stop without", () => {
  // Empty player city (defender 0x4200): attacker wins the default-byte
  // quick battle, so 4F06 fires before any cleanup/capture.
  const bare = fixture();
  bare.io.readPlayer = () => 1;
  assert.throws(
    () => dispatchOriginalSiegeBattle(bare.io, 0x860, 0x4200),
    (e) => e.instruction === "4F06",
  );
  const wired = fixture();
  wired.io.readPlayer = () => 1;
  // Channel presence alone selects the verdict path; dispatch never calls
  // it (the entry owns the suspend call, pinned by the next test).
  wired.io.suspendSiegeWarning = () => "suspended";
  const out = dispatchOriginalSiegeBattle(wired.io, 0x860, 0x4200);
  // Bare-leaf contract: dispatch only reports the verdict, it never calls
  // the suspend channel itself (the entry owns the suspend call).
  assert.equal(out.suspended, "siege-warning-26");
  assert.equal(out.result.ax & 255, 0);
  assert.equal(out.city, 0x860);
  assert.equal(out.defender, 0x4200);
});

test("4F06 entry suspends before temp-defender cleanup and capture, resume finishes", () => {
  const f = fixture();
  const verdict = {
    suspended: "siege-warning-26",
    result: { ax: 0 },
    city: 0x860,
    defender: 0x4200,
  };
  let tail = null;
  f.io.dispatchSiege = () => verdict;
  f.io.suspendSiegeWarning = (v, t) => {
    assert.equal(v, verdict);
    tail = t;
    return "suspended";
  };
  f.io.selectDefenders = () => ({ bx: 0x4200, cx: 256, cf: true });
  assert.equal(performOriginalSiegeEntry(f.io, 0x860), "suspended");
  // Deferred past the message: no 4FC9 cleanup, no capture yet.
  assert.equal(
    f.trace.filter((r) => r[0] === "captureCity").length,
    0,
  );
  assert.equal(f.records.defender.status, 0xe4);
  assert.equal(typeof tail, "function");
  // TALK26 close: clear temp defender, then capture, then siege-battle.
  assert.equal(tail(), "siege-battle");
  assert.equal(
    f.trace.filter((r) => r[0] === "captureCity").length,
    1,
  );
  assert.equal(f.records.defender.status, 0);
});
