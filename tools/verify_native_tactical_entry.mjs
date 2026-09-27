// Native tactical entry (4F36/4F13/4E82/4EA1) suspend/writeback contract.
// KI raw evidence: fate §14/§15, tactical-rules P50 (opening TALK/sfx),
// ai-chain P48 (exit frame). No fs/network/profile.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyNativeTacticalExit,
  suspendNativeTacticalBattle,
} from "../web/src/game/ai.js";

function streamFixture() {
  return {
    state: { calls: 3 },
    restored: null,
    snapshot() {
      return { ...this.state };
    },
    restore(snapshot) {
      this.state = { ...snapshot };
      this.restored = snapshot;
    },
    nextByte() {
      this.state.calls++;
      return 7;
    },
  };
}

function appFixture() {
  const talks = [];
  const stream = streamFixture();
  const app = {
    scenario: { idx: 0 },
    originalRng: stream,
    activeBattleRng: stream,
    battleView: { active: false, open: async () => {} },
    battleMaps: {},
    clock: { hold: false },
    gamebar: {
      enqueueTalkMessage(message) {
        talks.push(message);
      },
    },
  };
  return { app, talks, stream };
}

function sidesFixture() {
  const unit = (type, troops) => ({ type, troops });
  return {
    attacker: {
      slot: 8,
      faction: 0,
      status: 0xc0,
      generalIdx: 8,
      morale: 200,
      troops: 600,
      leader: "劉備",
      x: 6,
      y: 6,
      units: [unit(1, 1000), unit(1, 1000), unit(3, 1000), unit(3, 1000), unit(2, 1000), unit(2, 1000)],
    },
    defender: {
      slot: 4,
      faction: 1,
      status: 0xc0,
      generalIdx: 4,
      morale: 200,
      troops: 600,
      leader: "曹操",
      x: 6,
      y: 6,
      units: [unit(1, 1000), unit(1, 1000), unit(3, 1000), unit(3, 1000), unit(2, 1000), unit(2, 1000)],
    },
    city: { idx: 3, name: "徐州", faction: 1, troops: 87, growth: 104, defence: 100 },
  };
}

function requestFixture(kind, talk, sides, extra = {}) {
  return {
    kind,
    talk,
    at: "4F36",
    resumeTail: () => "field-battle",
    sides,
    ...extra,
  };
}

function tacticalSidesFixture(sides, spec) {
  if (spec.noCity)
    return { attacker: sides.attacker, defender: sides.defender };
  return sides;
}

test("tactical suspend validates shape loudly without side effects", () => {
  const sides = sidesFixture();
  const cases = [
    ["bad kind", { kind: "siege-???", talk: 28 }],
    ["talk mismatch", { kind: "siege-attack", talk: 27 }],
    ["no resume tail", { kind: "siege-attack", talk: 28, noTail: true }],
    ["missing sides", { kind: "siege-attack", talk: 28, noSides: true }],
    ["missing city", { kind: "siege-attack", talk: 28, noCity: true }],
  ];
  for (const [label, spec] of cases) {
    const { app, talks } = appFixture();
    const request = {
      kind: spec.kind,
      talk: spec.talk,
      at: "4F36",
      resumeTail: spec.noTail ? null : () => "field-battle",
      sides: spec.noSides ? null : tacticalSidesFixture(sides, spec),
    };
    assert.throws(() => suspendNativeTacticalBattle(app, app.scenario, request), RangeError, label);
    assert.ok(app._strategicBattleFailure, `${label} holds loudly`);
    assert.equal(talks.length, 0, `${label} enqueues no TALK`);
    assert.deepEqual(app._nativeTacticalQueue ?? [], [], `${label} queues nothing`);
  }
});

test("tactical suspend requires RNG stream, battle view and UI", () => {
  const sides = sidesFixture();
  for (const mutate of [
    (f) => { f.app.originalRng = null; f.app.activeBattleRng = null; },
    (f) => { f.app.battleView = null; },
    (f) => { f.app.battleMaps = null; },
    (f) => { f.app.gamebar = null; },
  ]) {
    const f = appFixture();
    mutate(f);
    assert.throws(
      () => suspendNativeTacticalBattle(f.app, f.app.scenario, requestFixture("field-attack", 29, sides)),
      RangeError,
    );
    assert.ok(f.app._strategicBattleFailure, "holds loudly");
  }
});

test("siege-attack suspends with TALK28 v1 opening shape and queues repeats", () => {
  const { app, talks } = appFixture();
  const sides = sidesFixture();
  const out = suspendNativeTacticalBattle(
    app, app.scenario, requestFixture("siege-attack", 28, sides),
  );
  assert.equal(out, "tactical-suspended");
  assert.equal(app._nativeTacticalQueue.length, 1);
  assert.equal(talks.length, 1);
  assert.equal(talks[0].talkIndex, 28);
  assert.equal(talks[0].kind, "siege-attack-opening");
  assert.equal(talks[0].generalName, "劉備");
  assert.equal(talks[0].cityName, "徐州");
  assert.equal(typeof talks[0].onClose, "function");
  // 同tick第二场排队，不显示第二个开场TALK。
  const out2 = suspendNativeTacticalBattle(
    app, app.scenario, requestFixture("field-defence", 29, sides, { at: "4EA1" }),
  );
  assert.equal(out2, "tactical-suspended");
  assert.equal(app._nativeTacticalQueue.length, 2);
  assert.equal(talks.length, 1);
});

test("field-defence suspends with TALK29 both-names shape", () => {
  const { app, talks } = appFixture();
  const sides = sidesFixture();
  const out = suspendNativeTacticalBattle(
    app, app.scenario, requestFixture("field-defence", 29, sides, { at: "4EA1" }),
  );
  assert.equal(out, "tactical-suspended");
  assert.equal(talks.length, 1);
  assert.equal(talks[0].talkIndex, 29);
  assert.equal(talks[0].kind, "field-battle-opening");
  assert.deepEqual(talks[0].generalName, ["劉備", "曹操"]);
});

test("applyNativeTacticalExit writes teams/morale/city back and synthesizes ax", () => {
  const sc = {
    factions: [
      { idx: 0, march_marker_style: 2 },
      { idx: 1, march_marker_style: 3 },
    ],
    diplomacy: [[], [], []],
  };
  const sides = sidesFixture();
  sides.attacker.roadEdgeOrNode = 0x600;
  sides.defender.roadEdgeOrNode = 0x600;
  const stream = streamFixture();
  const request = requestFixture("siege-attack", 28, sides);
  const exit = {
    winnerName: "atk",
    sides: [
      { troops: 560, units: [90, 95, 95, 95, 95, 90], morale: 190 },
      { troops: 300, units: [50, 50, 50, 50, 50, 50], morale: 0 },
    ],
    cityDamage: { growth: 100, defence: 96, troops: 83 },
    strategicRng: { snapshot: () => ({ calls: 41 }) },
  };
  // 无装配sc走continueLegionAfterBattle传统臂（ax合成一致）；原生474A臂由
  // 退路套件＋实机覆盖。此处锁定写回映射与ax位（攻方胜lost=0＋守方续行
  // 失败bit1）。
  const verdict = applyNativeTacticalExit(sc, request, stream, exit);
  assert.deepEqual(stream.restored, { calls: 41 });
  assert.deepEqual(
    sides.attacker.units.map((u) => u.troops),
    [900, 950, 950, 950, 950, 900],
  );
  assert.equal(sides.attacker.troops, 560);
  assert.equal(sides.attacker.morale, 190);
  assert.deepEqual(
    sides.defender.units.map((u) => u.troops),
    [500, 500, 500, 500, 500, 500],
  );
  assert.equal(sides.defender.morale, 0);
  assert.equal(sides.city.troops, 83);
  assert.equal(sides.city.growth, 100);
  assert.equal(sides.city.defence, 96);
  // 攻方胜（lost=0）＋守方474A失败（morale 0→bit1）：ax=0x200。
  assert.equal(verdict.ax, 0x200);
});
