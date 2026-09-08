// Raw KI branch fixtures: A376/A1DE/A40B/A219/A264, A12A,
// BA0D, AE26/B4AF/B358/B35B, AE04/B360/B4B8. No external save I/O.
import assert from "node:assert/strict";
import { runOriginalBattleStartup } from "../web/src/game/battle/originalstartup.js";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import { ORIGINAL_EFFECT as E } from "../web/src/game/battle/originaleffects.js";
import { contactOriginalAttackEffect } from "../web/src/game/battle/originaleffectframe.js";
import { updateOriginalInactiveObject } from "../web/src/game/battle/originalobjectframe.js";
import { commitOriginalSpatialOccupancy } from "../web/src/game/battle/originalmovement.js";
import { BattleView } from "../web/src/render/battleview.js";

function startupFixture({
  powers = [100, 60],
  stats = [15, 0],
  mode = 1,
  onTick = () => {},
  random = 255,
} = {}) {
  const s = new OriginalBattleSession({ registers: { mode } });
  for (const [i, a] of [0, 0x600].entries()) {
    s.pool.write8(a, O.POWER, powers[i]);
    s.pool.write8(a, O.HP, 100);
    s.pool.write8(a, O.CURRENT_COMMAND, 8);
    s.pool.write8(a, O.PENDING_COMMAND, 8);
    s.pool.write8(a, O.ANCHOR_X, i ? 62 : 1);
    s.pool.write8(a, O.ANCHOR_Y, 32);
  }
  // Boundary-only A04B stand-in: deliberately no incidental combat RNG.
  s.rng = {
    calls: 0,
    nextByte() {
      return ++this.calls <= 4 ? 0 : random;
    },
  };
  const result = runOriginalBattleStartup(
    { session: s },
    {
      commanders: [0, 1].map(() => ({
        ability: { force: stats[0], lead: stats[1] },
      })),
      tickFrame() {
        assert.ok(
          s.frame < 5000,
          "bounded fixture must not enter a guessed 65536 wait",
        );
        s.frame++;
        onTick(s);
      },
    },
  );
  return {
    s,
    result,
    talks: result.events.filter((e) => e.type === "startup-flag"),
  };
}
for (const mode of [0, 2]) {
  const { s, result } = startupFixture({ mode });
  assert.equal(result.frames, 50);
  assert.equal(s.rng.calls, 0);
  assert.deepEqual(result.events, []);
  assert.equal(
    s.pool.read8(0, O.PENDING_COMMAND),
    8,
    "non-mode1 RET does not A27A",
  );
}
// A370 byte arithmetic before A376 borrow saturation, including wide-domain fixture.
for (const stats of [
  [5, 20],
  [90, 20],
  [0, 15],
]) {
  const { s, result, talks } = startupFixture({ stats });
  assert.equal(result.frames, 50);
  assert.equal(result.scriptWordSkip, 0);
  assert.equal(s.rng.calls, 4);
  assert.deepEqual(talks, []);
  assert.equal(s.pool.read8(0, O.PENDING_COMMAND), 0);
}
for (const powers of [
  [100, 1],
  [100, 49],
  [120, 50],
  [1, 100],
]) {
  const { s, result, talks } = startupFixture({ powers });
  assert.equal(result.frames, 110);
  assert.equal(result.scriptWordSkip, 3);
  assert.equal(s.rng.calls, 4);
  assert.deepEqual(
    talks.map((e) => e.originalId),
    [0x1b7, 0x1b9, 0x1cc],
  );
  assert.deepEqual(
    talks.map((e) => e.side),
    powers[0] < powers[1] ? [1, 0, 1] : [0, 1, 0],
  );
  assert.deepEqual(result.events.slice(-2), [
    { type: "startup-input-drain", button: 0 },
    { type: "startup-input-drain", button: 1 },
  ]);
}
// A308 >=4800, A324 >=half and score ties retain side0; A387 gate equality accepts.
for (const [powers, stats] of [
  [
    [48, 48],
    [12, 20],
  ],
  [
    [100, 50],
    [15, 0],
  ],
  [
    [100, 60],
    [100, 20],
  ],
]) {
  const { result, talks } = startupFixture({
    powers,
    stats,
    onTick(s) {
      if (s.frame === 141) s.pool.write8(0x600, O.HP, 69);
    },
  });
  assert.equal(result.frames, 181);
  assert.deepEqual(
    talks.slice(0, 2).map((e) => [e.side, e.originalId]),
    [
      [0, 0x1b7],
      [1, 0x1b8],
    ],
  );
}
assert.equal(startupFixture({ powers: [47, 47] }).result.frames, 50);
// A298 exits: every Q, round saturation, both score orders, loser CURRENT5 vs non5.
for (const round of [0, 1, 2, 3, 4, 5])
  for (const gap of [5, 25])
    for (const alreadyRetreating of [false, true]) {
      const end = 141 + 110 * round;
      const q =
        round === 0
          ? 0x1bb
          : 0x1bd + 4 * (Math.min(round, 4) - 1) + (gap < 20 ? 2 : 0);
      const { s, result, talks } = startupFixture({
        powers: round % 2 ? [60, 100] : [100, 60],
        onTick(s) {
          if (s.frame === 130 + 110 * round) {
            s.pool.write8(0, O.HP, 100 + gap);
            s.pool.write8(0x600, O.HP, 100);
          }
          if (s.frame === end) {
            s.pool.write8(0x600, O.HP, 69);
            s.pool.write8(0x600, O.CURRENT_COMMAND, alreadyRetreating ? 5 : 8);
          }
        },
      });
      assert.equal(result.frames, end + (alreadyRetreating ? q : 20) + 20);
      assert.equal(s.rng.calls, 4 + round * 47);
      assert.equal(talks.at(alreadyRetreating ? -2 : -3).originalId, q);
      assert.equal(talks.at(-1).originalId, 0x1cd);
      assert.equal(s.pool.read8(0, O.PENDING_COMMAND), 0);
      assert.equal(s.pool.read8(0x600, O.PENDING_COMMAND), 0);
      assert.equal(
        s.pool.read8(0, O.ANCHOR_X),
        1,
        "startup target writes are not teleports",
      );
    }
// A219 checks before LOOP: all 20 remaining-CX outcomes (normal completion above).
for (let k = 1; k <= 20; k++)
  for (const alreadyRetreating of [false, true]) {
    const end = 220 + k;
    const { s, result } = startupFixture({
      onTick(s) {
        if (s.frame === end) {
          s.pool.write8(0x600, O.HP, 69);
          s.pool.write8(0x600, O.CURRENT_COMMAND, alreadyRetreating ? 5 : 8);
        }
      },
    });
    assert.equal(result.frames, end + (alreadyRetreating ? 21 - k : 20) + 20);
    assert.equal(s.rng.calls, 51);
  }
// A298 first RNG counter47, additional RNG only on gate<32.
for (const random of [31, 32]) {
  const { s, result } = startupFixture({
    random,
    onTick(s) {
      if (s.frame === 173) assert.equal(s.rng.calls, 4);
      if (s.frame === 174) s.pool.write8(0x600, O.HP, 69);
    },
  });
  assert.equal(result.frames, 214);
  assert.equal(s.rng.calls, random < 32 ? 6 : 5);
  assert.equal(s.pool.read8(0, O.POSITION_X), random < 32 ? 39 : 32);
}

// D318 INC-byte / whole-word compares / C3C0+C4AA resets, including FFFF collision.
for (const high of [0, 0x1200, 0xff00]) {
  const s = new OriginalBattleSession({
    registers: {
      side0Active: 1,
      side1Active: 1,
      tacticalFrameCounter: high | 0xf0,
      side0MarkerAt: high | 0x2c,
      side1MarkerAt: (high ^ 0x100) | 0x2c,
      wallMarkerAt: high | 0x2c,
    },
  });
  const before = s.rng.snapshot();
  for (let i = 1; i <= 60; i++) {
    const events = s.tick().events;
    assert.equal(s.registers.tacticalFrameCounter, high | ((0xf0 + i) & 255));
    const markers = events.filter((e) => e.type.endsWith("marker"));
    assert.deepEqual(
      markers,
      i === 60 ? [{ type: "side-marker", side: 0 }] : [],
    );
    if (i === 16) {
      // This counter-only fixture deliberately installs markers without C315/
      // C407 captures. New message continuation cannot reconstruct that history.
      assert.throws(
        () => new OriginalBattleSession().restore(s.snapshot()),
        /incomplete-tactical-message-state/,
      );
    }
  }
  assert.equal(s.registers.side0MarkerAt, 0xffff);
  assert.equal(
    s.registers.wallMarkerAt,
    high | 0x2c,
    "C3B8 changed AX to011B before wall comparison",
  );
  assert.deepEqual(s.rng.snapshot(), before);
}
{
  const s = new OriginalBattleSession({
    registers: { side0Active: 1, side1Active: 1, tacticalFrameCounter: 0xfffe },
  });
  assert.equal(
    s.tick().events.filter((e) => e.type.endsWith("marker")).length,
    1,
    "no FFFF sentinel exemption, but side0 close changes subsequent comparison AX",
  );
}

function unitSession() {
  const s = new OriginalBattleSession({
    registers: { mode: 1, side0Active: 1, side1Active: 1 },
  });
  for (const a of [0, 0x600]) {
    s.pool.write8(a, O.FLAGS, 0x80);
    s.pool.write8(a, O.HP, 100);
    s.pool.write8(a, O.ANCHOR_X, a ? 20 : 10);
    s.pool.write8(a, O.ANCHOR_Y, 20);
    s.pool.write16(a, O.SPATIAL_0C, 1280 + (a ? 20 : 10));
    s.pool.write16(a, O.SPATIAL_0E, 1280 + (a ? 20 : 10));
  }
  return s;
}
// B97E all commander lethal conditions and noncommander quarter/death branches.
for (const cls of [0, 0x18, 0x24, 0x36])
  for (const phase of [0, 1])
    for (const hp of [0, 1, 2, 8]) {
      const s = unitSession(),
        a = 0x600;
      s.pool
        .write8(a, O.CLASS, cls)
        .write8(a, O.STATE, phase)
        .write8(a, O.HP, hp);
      s.effects
        .write8(0, E.FLAGS, 0xc0)
        .write8(0, E.CLASS, 4)
        .write16(0, E.SOURCE_POINTER, 0)
        .write16(0, E.POSITION_X, 42);
      s.spatial.write8(42, 49);
      const before = s.rng.snapshot(),
        bytes = s.pool.snapshot().slice(a, a + 32);
      const hit = contactOriginalAttackEffect(s.pool, s.effects, s.spatial, 0);
      if (cls === 0 && phase === 0) {
        assert.deepEqual(s.pool.snapshot().slice(a, a + 32), bytes);
        assert.equal(hit.damaged, false);
      } else {
        const damage = cls === 0 || cls === 0x36 ? 1 : 4;
        const killed = cls !== 0 && hp <= damage;
        assert.equal(hit.damage, damage);
        assert.equal(hit.killed, killed);
        assert.equal(
          s.pool.read8(a, O.HP),
          killed ? 0 : Math.max(1, hp - damage),
        );
        assert.equal(s.pool.read8(a, O.KIND), killed ? 4 : 2);
        assert.equal(s.pool.read8(a, O.FLAGS), killed ? 1 : 0xc0);
        assert.equal(s.pool.read8(a, O.STATE), phase | 0x10);
      }
      assert.equal(s.effects.read8(0, E.FLAGS), 0x80);
      assert.deepEqual(s.rng.snapshot(), before);
    }
// Actual ADC8 multi-frame commander bypass -> kind countdown -> movement resumes.
{
  const s = unitSession();
  s.pool
    .write8(0, O.FLAGS, 0xc0)
    .write8(0, O.STATE, 8)
    .write8(0, O.KIND, 2)
    .write8(0, O.STATUS_TIME, 3);
  const before = s.rng.snapshot();
  let moves = 0;
  for (const [kind, state, frame, status] of [
    [2, 9, 8, 3],
    [1, 8, 9, 3],
    [0, 1, 0, 3],
    [0, 0, 1, 2],
  ]) {
    s.tick({
      updateObject() {},
      recountActivity: () => ({ side0Active: 1, side1Active: 1 }),
      updateMovement(_, a) {
        if (a === 0) moves++;
      },
    });
    assert.equal(s.pool.read8(0, O.FLAGS), 0x80);
    assert.equal(s.pool.read8(0, O.KIND), kind);
    assert.equal(s.pool.read8(0, O.STATE), state);
    assert.equal(s.pool.read8(0, O.STATUS_TIME), status);
    assert.equal(s.objectDisplays[0].frame, frame);
  }
  assert.equal(moves, 1);
  assert.deepEqual(s.rng.snapshot(), before);
  const state = s.pool.read8(0, O.STATE);
  commitOriginalSpatialOccupancy(s.pool, s.spatial, 0);
  assert.equal(
    s.pool.read8(0, O.STATE),
    state,
    "utility occupancy is not B240 tail",
  );
}
// Death all class/side variants, prior coordinates, no STATE toggle or survivor credit.
for (const a of [0, 0x600])
  for (const cls of [0x18, 0x24, 0x36]) {
    const s = unitSession(),
      side = a ? 1 : 0,
      base = (a ? 174 : 84) + (cls === 0x18 ? 0 : cls === 0x24 ? 2 : 4);
    s.pool
      .write8(a, O.FLAGS, 0x11)
      .write8(a, O.KIND, 4)
      .write8(a, O.CLASS, cls)
      .write8(a, O.STATE, 0x11)
      .write8(a, O.LEVEL, 2);
    s.pool
      .write8(a, O.PREVIOUS_X, 3)
      .write8(a, O.PREVIOUS_Y, 4)
      .write8(a, O.PREVIOUS_LEVEL, 1);
    s.temps.write8(side, 11, 7);
    const rng = s.rng.snapshot();
    for (const [kind, frame] of [
      [3, base],
      [2, base + 1],
      [1, base + 1],
      [0, null],
    ]) {
      const result = updateOriginalInactiveObject(
        s.pool,
        s.temps,
        s.spatial,
        s.registers,
        a,
      );
      assert.equal(s.pool.read8(a, O.KIND), kind);
      assert.equal(result.display?.frame ?? null, frame);
      assert.equal(s.pool.read8(a, O.STATE), 0x11);
      assert.equal(s.pool.read8(a, O.FLAGS), kind ? 0x11 : 0x10);
      assert.equal(s.pool.read8(a, O.PREVIOUS_X), a ? 20 : 10);
      assert.equal(s.pool.read8(a, O.PREVIOUS_Y), 20);
      assert.equal(s.pool.read8(a, O.PREVIOUS_LEVEL), 2);
      assert.equal(s.temps.read8(side, 11), 7);
    }
    assert.deepEqual(s.rng.snapshot(), rng);
  }
// B413 early-outs: reserve, winner, either occupancy plane; success only once.
for (const reason of ["reserve", "winner", "low", "high", "success"]) {
  const s = unitSession();
  s.pool.write8(0, O.FLAGS, 0x10).write8(0, O.STATE, 9);
  s.temps
    .write8(0, 9, reason === "reserve" ? 0 : 2)
    .write16(0, 4, 2)
    .write8(0, 6, 100);
  if (reason === "winner") s.registers.winnerState = 1;
  if (reason === "low" || reason === "high")
    s.spatial.write8(1281 + (reason === "high" ? 0x1000 : 0), 1);
  const result = updateOriginalInactiveObject(
    s.pool,
    s.temps,
    s.spatial,
    s.registers,
    0,
  );
  assert.equal(result.revived, reason === "success");
  assert.equal(s.pool.read8(0, O.STATE), reason === "success" ? 1 : 9);
  assert.equal(result.display?.frame ?? null, reason === "success" ? 0 : null);
  assert.equal(s.temps.read16(0, 4), reason === "success" ? 1 : 2);
}
// Captured normal/death draw repeat is read-only, deep snapshots, revival replaces death.
{
  const s = unitSession();
  s.pool.write8(0, O.FLAGS, 1).write8(0, O.KIND, 4).write8(0, O.CLASS, 0x24);
  const tick = () =>
    s.tick({
      updateObject() {},
      recountActivity: () => ({ side0Active: 1, side1Active: 1 }),
    });
  tick();
  assert.equal(s.objectDisplays[0].frame, 86);
  const snapshot = s.snapshot(),
    restored = new OriginalBattleSession().restore(snapshot);
  const view = Object.create(BattleView.prototype);
  view.battle = { session: restored };
  const before = restored.snapshot();
  view.sceneReady = true;
  view.unitImg = {};
  view.terrainLayers = [];
  view.ox = view.oy = 0;
  view.s = 1;
  const drawn = [];
  view.atlasFrame = (_, _image, halfFrame) => drawn.push(halfFrame);
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage() {},
  };
  for (let i = 0; i < 10; i++) {
    assert.equal(view.originalObjectSprite(0).frame, 86);
    assert.equal(view.drawBattlefieldLayers(ctx), true);
  }
  assert.ok(
    drawn.includes(172) && drawn.includes(173),
    "actual draw layer includes inactive B360 halves",
  );
  assert.deepEqual(
    restored.snapshot(),
    before,
    "repeated render projection is zero-RNG/read-only",
  );
  const twin = new OriginalBattleSession().restore(before);
  for (let i = 0; i < 2; i++) {
    for (const session of [restored, twin])
      session.tick({
        updateObject() {},
        recountActivity: () => ({ side0Active: 1, side1Active: 1 }),
      });
    assert.deepEqual(
      restored.snapshot(),
      twin.snapshot(),
      "death snapshot continuation preserves bytes/displays/RNG",
    );
  }
  snapshot.objectDisplays[0].frame = 999;
  s.objectDisplays[0].x = 99;
  assert.equal(restored.objectDisplays[0].frame, 87);
  assert.equal(restored.objectDisplays[0].x, 10);
  tick();
  tick();
  tick();
  assert.equal(s.objectDisplays[0], null);
  // Make reserves available only now; inactive child slots otherwise own the
  // right to consume them while the leader is still in its death countdown.
  s.temps.write8(0, 9, 1).write16(0, 4, 1).write8(0, 6, 100);
  tick();
  assert.equal(
    s.objectDisplays[0].frame,
    0x24,
    "revival draws normal class phase0, not stale death",
  );
  assert.equal(s.pool.read8(0, O.STATE), 1);
  assert.equal(s.temps.read16(0, 4), 0);
  // Real AEA9 does not count a just-revived slot until its next scan.
  const t = unitSession();
  t.pool.write8(0, O.FLAGS, 0);
  t.temps.write8(0, 9, 1).write16(0, 4, 1).write8(0, 6, 100);
  t.objectsInitialized = true;
  t.tick({ updateObject() {} });
  assert.equal(t.registers.side0Active, 0);
  assert.equal(t.objectDisplays[0].frame, 0);
}
console.log(
  "original lifecycle OK: startup branch/CX/RNG tables, byte markers, HP floor, active/death tails, read-only snapshots/revival",
);
