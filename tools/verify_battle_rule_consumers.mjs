// Literal fixtures from KI.EXE VA+0x200: AB39/ACA4/AD01/AED2/AF69/A85B/9A5E.
// Reads only Web assets; all objects, RNG and save-like snapshots remain in memory.
import assert from "node:assert/strict";
import fs from "node:fs";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import {
  calculateOriginalAttackGeometry,
  adjustOriginalProjectileTarget,
  executeOriginalEqualClassAttack,
} from "../web/src/game/battle/originalattack.js";
import { consumeOriginalPathQueue } from "../web/src/game/battle/originalpathqueue.js";
import { updateOriginalObjectMovement } from "../web/src/game/battle/originalmoveframe.js";
import {
  originalTargetScore,
  selectOriginalTarget,
} from "../web/src/game/battle/originaltargeting.js";
import {
  createBattle,
  createFieldBattle,
  advanceOriginalScriptFrame,
  queueTacticalCommand,
  initializeVisualBattleStartup,
} from "../web/src/game/tacticalbattle.js";
import { BattleView } from "../web/src/render/battleview.js";

function object(s, address, x, y, fields = []) {
  for (const [f, v] of [
    [O.FLAGS, 0x80],
    [O.HP, 180],
    [O.CLASS, 0x12],
    [O.ANCHOR_X, x],
    [O.ANCHOR_Y, y],
    [O.POSITION_X, x],
    [O.POSITION_Y, y],
    [O.TARGET_X, x],
    [O.TARGET_Y, y],
    ...fields,
  ])
    s.pool.write8(address, f, v);
  s.pool.write16(address, O.SPATIAL_0C, y * 64 + x);
  s.pool.write16(address, O.SPATIAL_0E, y * 64 + x);
}
const readXY = (s, a, f = O.ANCHOR_X, g = O.ANCHOR_Y) => [
  s.pool.read8(a, f),
  s.pool.read8(a, g),
];
const calls = (s) => s.rng.calls;
// ACA4 independently from AD01 so two wrong direction maps cannot cancel each other.
for (const [x, y, expected] of [
  [10, 20, 0],
  [20, 10, 1],
  [30, 20, 2],
  [20, 30, 3],
  [10, 10, 0],
  [30, 30, 2],
  [20, 20, 0],
]) {
  const s = new OriginalBattleSession();
  object(s, 0, 20, 20);
  object(s, 0x600, x, y);
  s.pool.write16(0, O.TARGET_POINTER, 0x600);
  const before = calls(s);
  assert.equal(calculateOriginalAttackGeometry(s.pool, 0).direction, expected);
  assert.equal(calls(s), before);
}
for (const [dir, x, y, expected] of [
  [0, 10, 20, [20, 20]],
  [1, 20, 10, [20, 20]],
  [2, 30, 20, [20, 20]],
  [3, 20, 30, [20, 20]],
  [0, 54, 20, [64, 20]],
  [0, 55, 20, [55, 20]],
  [1, 20, 54, [20, 64]],
  [1, 20, 55, [20, 55]],
  [2, 10, 20, [0, 20]],
  [2, 9, 20, [9, 20]],
  [3, 20, 10, [20, 0]],
  [3, 20, 9, [20, 9]],
]) {
  const s = new OriginalBattleSession();
  object(s, 0x600, x, y);
  adjustOriginalProjectileTarget(s.pool, 0, 0x600, 0, dir);
  assert.deepEqual(readXY(s, 0, O.TARGET_X, O.TARGET_Y), expected);
  adjustOriginalProjectileTarget(s.pool, 0, 0x600, -1, dir);
  assert.deepEqual(
    readXY(s, 0, O.TARGET_X, O.TARGET_Y),
    [x, y],
    "negative delta step=0",
  );
}
{
  const s = new OriginalBattleSession();
  object(s, 0, 20, 20, [[O.CLASS, 0x24]]);
  object(s, 0x600, 20, 10, [[O.LEVEL, 2]]);
  s.pool.write16(0, O.TARGET_POINTER, 0x600);
  const before = calls(s);
  const shot = executeOriginalEqualClassAttack(s.pool, s.effects, s.rng, 0);
  assert.equal(shot.geometry.direction, 1);
  assert.deepEqual(readXY(s, 0, O.TARGET_X, O.TARGET_Y), [20, 22]);
  assert.equal(shot.spawned, true);
  assert.equal(calls(s) - before, 1, "AD2D consumes one byte");
  executeOriginalEqualClassAttack(s.pool, s.effects, s.rng, 0);
  assert.equal(calls(s) - before, 1, "cooldown branch consumes none");
}
// AED2 input bytes and segment origin, including failed BD46 return.
{
  const s = new OriginalBattleSession();
  object(s, 0, 12, 20, [
    [O.PREVIOUS_X, 11],
    [O.HEIGHT, 0x10],
  ]);
  const cell = 20 * 64 + 12;
  s.spatial.write8(0x1000 + cell, 0x81);
  s.spatial.write8(0x8000 + cell, 0x46);
  s.enqueuePath(0);
  const before = calls(s);
  const [result] = consumeOriginalPathQueue(s.pool, s.paths, s.spatial, {
    buildPath(request) {
      assert.equal(request.current, 0x140c);
      assert.equal(request.layer, 0x10);
      return { carry: true, words: [] };
    },
  });
  assert.equal(result.built.carry, true);
  assert.equal(s.pool.read8(0, O.POSITION_LEVEL), 6);
  assert.equal(s.paths.head, s.paths.tail);
  assert.equal(calls(s), before);
}
function moveFixture() {
  const s = new OriginalBattleSession();
  object(s, 0, 10, 10);
  object(s, 0x600, 20, 20);
  s.pool.write16(0, O.TARGET_POINTER, 0x600);
  // Nonzero lower descriptors, level0; occupancy is independently controlled.
  s.spatial.bytes.fill(0x40, 0x7000, 0x8000);
  return s;
}
// AF69 X CF1 -> Y CLC in one call, using real B533 friendly blocker (zero RNG).
{
  const s = moveFixture();
  object(s, 0x20, 11, 10, [[O.CLASS, 0]]);
  s.spatial.write8(651, 2);
  s.pool.write16(0, O.POSITION_X, 0x0b0b);
  const before = calls(s),
    contacts = [];
  const collide = s.collide.bind(s);
  s.collide = (a, id, opts) => {
    contacts.push(id);
    return collide(a, id, opts);
  };
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.deepEqual(contacts, [2]);
  assert.deepEqual(readXY(s, 0), [10, 11]);
  assert.equal(result.step.direction, "south");
  assert.equal(result.step.carry, false);
  assert.equal(calls(s), before);
}
// X CF1, Y CF1 -> up CLC, same call. B112 collision never commits candidate itself.
{
  const s = moveFixture();
  object(s, 0, 10, 10, [
    [O.CLASS, 0x24],
    [O.POSITION_LEVEL, 1],
  ]);
  object(s, 0x20, 11, 10, [[O.CLASS, 0]]);
  object(s, 0x40, 10, 11, [[O.CLASS, 0]]);
  s.spatial.write8(651, 2);
  s.spatial.write8(714, 3);
  s.spatial.writeTile(650, 0xf8);
  s.pool.write16(0, O.POSITION_X, 0x0b0b);
  const before = calls(s);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.step.carry, false);
  assert.equal(s.pool.read8(0, O.LEVEL), 1);
  assert.equal(s.pool.read16(0, O.SPATIAL_0C), 0x128a);
  assert.equal(calls(s), before);
}
// CF1 probes suppress B00D even if a path word is waiting; exhausted axes queue instead.
{
  const s = moveFixture();
  object(s, 0x20, 11, 10, [[O.CLASS, 0]]);
  object(s, 0x40, 10, 11, [[O.CLASS, 0]]);
  s.spatial.write8(651, 2);
  s.spatial.write8(714, 3);
  s.pool.write16(0, O.POSITION_X, 0x0b0b);
  s.paths.writePath(0, [0x0a0c]);
  s.pool.write8(0, O.PATH_REMAINING, 1);
  const before = calls(s);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.queued, true);
  assert.equal(s.pool.read8(0, O.PATH_REMAINING), 1);
  assert.equal(s.pool.read8(0, O.PATH_OFFSET), 0);
  assert.equal(calls(s), before);
}
// CF1 X then enemy Y CLC: exactly the second probe consumes B618's one RNG byte.
{
  const s = moveFixture();
  object(s, 0x20, 11, 10, [[O.CLASS, 0]]);
  object(s, 0x600, 10, 11);
  s.spatial.write8(651, 2);
  s.spatial.write8(714, 49);
  s.pool.write16(0, O.POSITION_X, 0x0b0b);
  const before = calls(s),
    contacts = [];
  const collide = s.collide.bind(s);
  s.collide = (a, id, opts) => {
    contacts.push(id);
    return collide(a, id, opts);
  };
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.deepEqual(contacts, [2, 49]);
  assert.equal(result.step.carry, false);
  assert.deepEqual(readXY(s, 0), [10, 10]);
  assert.equal(calls(s) - before, 1);
}
// B00D height word takes its first vertical step immediately; downward counterpart.
for (const [level, word, expectedSpatial] of [
  [0, 0x0180, 0x128a],
  [1, 0x0080, 0x028a],
]) {
  const s = moveFixture();
  object(s, 0, 10, 10, [
    [O.CLASS, 0x24],
    [O.LEVEL, level],
    [O.HEIGHT, level ? 0x10 : 0],
    [O.POSITION_LEVEL, level],
  ]);
  s.pool.write16(0, O.SPATIAL_0C, level ? 0x128a : 0x028a);
  s.spatial.writeTile(650, 0xf8);
  s.paths.writePath(0, [word]);
  s.pool.write8(0, O.PATH_REMAINING, 1);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.path.word, word);
  assert.equal(result.step.carry, false);
  assert.equal(s.pool.read16(0, O.SPATIAL_0C), expectedSpatial);
  assert.equal(s.pool.read8(0, O.LEVEL), 1 - level);
}
// Enemy contact CLC must stop X fallback without physical movement; B618 consumes exactly one byte.
{
  const s = moveFixture();
  object(s, 0x600, 11, 10, [[O.CLASS, 0x12]]);
  s.spatial.write8(651, 49);
  s.pool.write16(0, O.POSITION_X, 0x0b0b);
  const before = calls(s);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.step.carry, false);
  assert.equal(result.step.direction, "east");
  assert.deepEqual(readXY(s, 0), [10, 10]);
  assert.equal(calls(s) - before, 1);
  assert.equal(s.paths.head, s.paths.tail, "no AFD0 queue after collision CLC");
}
// B00D success -> AF65 -> immediate movement, exhausted path -> chase or own target.
{
  const s = moveFixture();
  s.paths.writePath(0, [0x0a0b]);
  s.pool.write8(0, O.PATH_REMAINING, 1);
  const before = calls(s);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.path.word, 0x0a0b);
  assert.deepEqual(readXY(s, 0), [11, 10]);
  assert.equal(s.pool.read8(0, O.PATH_OFFSET), 2);
  assert.equal(calls(s), before);
}
{
  const s = moveFixture();
  object(s, 0x600, 11, 10, [[O.LEVEL, 2]]);
  s.pool.write8(0, O.DIRECTION, 3);
  s.pool.write8(0, O.STATE, 8);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.path.exhausted, true);
  assert.equal(result.queued, false);
  assert.deepEqual(readXY(s, 0, O.POSITION_X, O.POSITION_Y), [11, 10]);
  assert.equal(s.pool.read8(0, O.POSITION_LEVEL), 2);
  assert.equal(s.pool.read8(0, O.DIRECTION), 3);
  assert.equal(s.pool.read8(0, O.STATE) & 8, 0, "B00D called even for count0");
  assert.equal(s.paths.head, s.paths.tail);
}
{
  const s = moveFixture();
  s.pool.write16(0, O.TARGET_X, 0x0c0f);
  const result = updateOriginalObjectMovement(s, 0, { commit: false });
  assert.equal(result.queued, false);
  assert.deepEqual(readXY(s, 0, O.POSITION_X, O.POSITION_Y), [15, 12]);
  assert.equal(s.pool.read8(0, O.DIRECTION), 2);
  const t = moveFixture();
  const exhausted = updateOriginalObjectMovement(t, 0, {
    consumePath: false,
    commit: false,
  });
  assert.equal(
    exhausted.queued,
    true,
    "AF65 AH=0 terminal calls C653 even without a probe",
  );
}
// A88D south-only addition changes the actual target-pointer winner.
{
  const s = new OriginalBattleSession();
  object(s, 0, 20, 20);
  object(s, 0x600, 20, 25);
  object(s, 0x620, 20, 14);
  assert.equal(originalTargetScore(s.pool, 0, 0x600), 10);
  assert.equal(originalTargetScore(s.pool, 0, 0x620), 6);
  assert.equal(selectOriginalTarget(s.pool, 0).address, 0x620);
  assert.equal(s.pool.read16(0, O.TARGET_POINTER), 0x620);
  assert.equal(s.pool.read8(0, O.FLAGS) & 8, 8);
}
const json = (name) => {
  try {
    return JSON.parse(
      fs.readFileSync(new URL(`../web/${name}.json`, import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const maps = json("battle_maps");
maps.navigation = json("battle_navigation");
maps.formationVectors = json("battle_rules").formationVectors;
const scenario = {
  player_faction: 0,
  generals: [0, 1].map((idx) => ({
    idx,
    name: `G${idx}`,
    battle_formation: 1,
    ability: { force: 0, lead: 0, field: 1, naval: 6, siege: 2 },
  })),
};
const legion = (faction) => ({
  faction,
  generalIdx: faction,
  leader: `G${faction}`,
  troops: 6000,
  morale: 180,
  units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
});
// Production AB4F patched X + mirrored descriptor source at actual command consumer.
for (const defenderPlayer of [false, true]) {
  const b = createBattle(
    scenario,
    legion(defenderPlayer ? 1 : 0),
    { idx: 0, name: "C", faction: defenderPlayer ? 0 : 1, troops: 100 },
    maps,
    legion(defenderPlayer ? 0 : 1),
  );
  const x = defenderPlayer ? 27 : 36;
  assert.equal(b.session.registers.themeFlag, x);
  b.session.spatial.write8(0x8000 + 20 * 64 + x, 0x46);
  b.session.pool.write8(0, O.ANCHOR_Y, 20);
  queueTacticalCommand(b, { groups: [0], command: "wall" });
  advanceOriginalScriptFrame(
    b,
    {
      step() {
        return "run";
      },
    },
    {
      leaderHandlers: {
        after(result) {
          if (result.address === 0) {
            assert.deepEqual(readXY(b.session, 0, O.TARGET_X, O.TARGET_Y), [
              x,
              20,
            ]);
            assert.deepEqual(readXY(b.session, 0, O.POSITION_X, O.POSITION_Y), [
              x,
              20,
            ]);
            assert.equal(b.session.pool.read8(0, O.POSITION_LEVEL), 6);
            assert.equal(b.session.pool.read16(0, O.TIMER), 0);
          }
        },
      },
    },
  );
}
// AB48 -> AB7C clamp checked before ADC8's normal timed decrement.
for (const timed of [39, 40, 100]) {
  const s = new OriginalBattleSession({ objectsInitialized: true });
  object(s, 0, 10, 10, [
    [O.FLAGS, 0x82],
    [O.HEIGHT, 0x10],
    [O.STATUS_TIME, timed],
    [O.CURRENT_COMMAND, 3],
    [O.PENDING_COMMAND, 3],
  ]);
  object(s, 0x600, 20, 20, [
    [O.CURRENT_COMMAND, 8],
    [O.PENDING_COMMAND, 8],
  ]);
  const before = calls(s);
  s.tick({
    updateMovement() {},
    objectHandlers: {
      leaderHandlers: {
        after(result) {
          if (result.address === 0) {
            assert.equal(s.pool.read8(0, O.PENDING_COMMAND), 6);
            assert.equal(s.pool.read8(0, O.STATUS_TIME), Math.min(timed, 40));
          }
        },
      },
    },
  });
  assert.equal(calls(s), before);
}
// Directory D0 remains land despite layout2; D1/D5 use naval init/script/startup.
for (const directoryIndex of [0xd0, 0xd1, 0xd5])
  for (const playerDefender of [false, true]) {
    const b = createFieldBattle(
      scenario,
      legion(playerDefender ? 1 : 0),
      legion(playerDefender ? 0 : 1),
      maps,
      { directoryIndex },
    );
    const mode = directoryIndex === 0xd0 ? 1 : 2;
    assert.equal(b.layout, 2);
    assert.equal(b.session.registers.mode, mode);
    assert.equal(b.battleScriptBlock, mode === 1 ? 6 : 7);
    assert.equal(
      b.session.pool.read8(0, O.POWER),
      mode === 1 ? 2 : 12,
      "9C13 -> 9B45/9B49 doubles specialty into initial leader power",
    );
    const before = calls(b.session);
    const startup = initializeVisualBattleStartup(b);
    assert.equal(startup.frames, 50);
    assert.equal(startup.scriptWordSkip, 0);
    assert.equal(
      calls(b.session) - before,
      mode === 1 ? 4 : 0,
      "A1CD mode2 skips A34F RNG",
    );
    const scripts = json("battle_scripts");
    const view = {
      battle: b,
      app: { battleScripts: scripts, hud: { flashEvent() {} } },
    };
    BattleView.prototype.startBattleScript.call(view);
    assert.deepEqual(view.battleScriptVm.words, scripts[mode === 1 ? 6 : 7]);
  }
console.log(
  "battle rule consumers OK: AB4F/AB7C, ACA4/AD01, AED2, AF69 carry/path/chase, A85B, D1 naval mode",
);
