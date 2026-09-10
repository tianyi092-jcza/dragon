// B5B7/B799/B824/BB6D authenticated raw-branch fixtures, not a DOS emulator.
// Only KI.EXE and exported battle assets are read; state/snapshots stay in memory.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import {
  ORIGINAL_MAP_OBJECT as M,
  rewriteOriginalMapObjectTilesB824,
  rewriteOriginalMapObjectRowB799,
  sweepOriginalWallObjectsB7CB,
} from "../web/src/game/battle/originalmapobjects.js";
import { createOriginalPathBuilder } from "../web/src/game/battle/originalpathfinder.js";
import {
  createFieldBattle,
  advanceOriginalScriptFrame,
  queueTacticalCommand,
} from "../web/src/game/tacticalbattle.js";
import { BattleView } from "../web/src/render/battleview.js";

const raw = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const bytes = (va, hex) =>
  assert.equal(
    raw.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
    va.toString(16),
  );
bytes(
  0xb861,
  "32c02688042688840010268884002026888400302688840040268884005026c685009000",
);
bytes(0xb7a0, "bf000cb4103a45087503e8770083c720fecc75f1");
bytes(0xb5c7, "81fe00067345807c05007518c745180000eb11");
bytes(0xb5da, "81fe00067232807c05027505c745180000");
bytes(0xb5eb, "803d807222837d18007508e8a00180257feb14ff4d18");
bytes(0xbb7f, "23db740b438a0722c0740a3c70730626800d80eb042680257f");
const near = (va) => (va + 3 + raw.readInt16LE(va + 0x201)) & 0xffff;
assert.equal(
  near(0xb859),
  0x02f5,
  "E8 994A wraps to sound gate, not linear 102F5",
);
assert.equal(near(0xb85d), 0xbb6d);
assert.equal(near(0xb7aa), 0xb824);
assert.equal(near(0xb5f6), 0xb799);
assert.equal(near(0xb613), 0xc653);

function record(
  s,
  a = 0xc00,
  {
    flags = 0x80,
    kind = 1,
    y = 10,
    x = 10,
    source = y * 64 + x,
    span = 1,
    metric = 5,
  } = {},
) {
  for (const [f, v] of [
    [M.FLAGS, flags],
    [M.KIND, kind],
    [M.X, x],
    [M.Y, y],
    [M.SPAN, span],
  ])
    s.mapObjects.write8(a, f, v);
  s.mapObjects.write16(a, M.SOURCE, source);
  s.mapObjects.write16(a, M.METRIC, metric);
  return a;
}
function cleanRows(s) {
  s.mapObjects.bytes.fill(0);
  for (let a = 0xc00; a < 0xe00; a += 0x20) s.mapObjects.write8(a, M.Y, 63);
}
// Each of six physical planes starts with bit80 AND an occupancy ID. BB6D
// would retain/set bit80 in several planes, so AND80 cannot pass this fixture.
for (const [before, after, event] of [
  [0xd0, 0xe0, 4],
  [0xef, 0xff, 4],
  [0xf0, 0xf8, 5],
  [0xf7, 0xff, 5],
  [0xf8, 0, 5],
  [0xff, 7, 5],
]) {
  for (const lastAttribute of [0, 1, 0x6f, 0x70, 0xff]) {
    const s = new OriginalBattleSession();
    cleanRows(s);
    const a = record(s, 0xc00, { source: 0x228a, span: 2 }),
      index = 650;
    s.spatial.tileAttributes = new Uint8Array(0x800);
    // Includes zero, solid and >=70 passable attribute branches; tile0 ignores all.
    s.spatial.tileAttributes.set(
      [1, 0, 0x6f, 0x70, 2, 0xff, lastAttribute],
      after * 8 + 1,
    );
    s.spatial.bytes.fill(0xa5);
    s.spatial.writeTile(index, before);
    s.spatial.writeTile(index + 64, before);
    const expected = Uint8Array.from(s.spatial.bytes),
      rng = s.rng.snapshot();
    for (const cell of [index, index + 64]) {
      for (let plane = 0; plane < 6; plane++)
        expected[plane * 0x1000 + cell] = 0;
      expected[0x6000 + cell] =
        after === 0 || (lastAttribute > 0 && lastAttribute < 0x70)
          ? 0xa5
          : 0x25;
      expected[0x9000 + cell] = 0;
    }
    const result = rewriteOriginalMapObjectTilesB824(
      s.mapObjects,
      s.spatial,
      a,
    );
    assert.deepEqual(
      s.spatial.bytes,
      expected,
      "only six physical cells, seventh bit7, and lower surcharge change; neighbors + both D2FC planes + upper surcharge untouched",
    );
    assert.deepEqual(
      result.tileChanges,
      [index, index + 64].map((index) => ({
        index,
        tileBefore: before,
        tileAfter: after,
        eventId: event,
      })),
    );
    assert.equal(s.mapObjects.read8(a, M.FLAGS), 0x81);
    assert.equal(
      s.mapObjects.read16(a, M.METRIC),
      5,
      "B824 never changes metric",
    );
    assert.deepEqual(s.rng.snapshot(), rng);
  }
}
// Raw branch matrix: mode0 side mismatch returns before active/metric; direction
// clears the actual metric before active. Nonzero metric decrements without destruction.
let cases = 0;
for (const mode of [0, 1, 2])
  for (const battleSideFlag of [0, 0x80])
    for (const attacker of [0, 0x600])
      for (const direction of [0, 1, 2, 3])
        for (const flags of [0x00, 0x01, 0x80, 0x81])
          for (const metric of [0, 1, 5]) {
            const s = new OriginalBattleSession({
              registers: { mode, battleSideFlag, mapRedraw: 0 },
            });
            cleanRows(s);
            const a = record(s, 0xc00, { flags, metric });
            s.spatial.writeTile(650, 0xd0);
            s.pool.write8(attacker, O.DIRECTION, direction);
            const rng = s.rng.snapshot();
            const sideMismatch =
              mode === 0 && (attacker >= 0x600 ? 0x80 : 0) !== battleSideFlag;
            const forceZero =
              !sideMismatch &&
              mode === 0 &&
              direction === (battleSideFlag ? 2 : 0);
            const active = flags >= 0x80,
              value = forceZero ? 0 : metric;
            const destroyed = !sideMismatch && active && value === 0;
            const expectedMetric =
              !sideMismatch && active && value > 0 ? value - 1 : value;
            const result = s.collide(attacker, 0x61);
            assert.equal(s.mapObjects.read16(a, M.METRIC), expectedMetric);
            assert.equal(
              s.mapObjects.read8(a, M.FLAGS),
              destroyed ? (flags | 1) & 0x7f : flags,
            );
            assert.equal(s.spatial.tile(650), destroyed ? 0xe0 : 0xd0);
            assert.equal(s.registers.mapRedraw, destroyed ? 1 : 0);
            assert.equal(
              result.carry,
              false,
              "B616 CLC even when inactive/wrong-side",
            );
            assert.equal(
              s.paths.tail,
              2,
              "B613 C653 even when inactive/wrong-side",
            );
            assert.deepEqual(s.rng.snapshot(), rng);
            cases++;
          }
// B799 ignores kind/active/bit0, fixed first16, same Y only; no invented idempotence.
{
  const s = new OriginalBattleSession({ registers: { mode: 1 } });
  cleanRows(s);
  for (const [a, flags, kind, y, x] of [
    [0xc00, 0x80, 1, 10, 10],
    [0xc20, 1, 2, 10, 12],
    [0xde0, 0, 0, 10, 14],
    [0xc40, 0x80, 1, 11, 16],
    [0xe00, 0x80, 1, 10, 18],
  ]) {
    record(s, a, { flags, kind, y, x, metric: 0 });
    s.spatial.writeTile(y * 64 + x, 0xd0);
  }
  for (const after of [0xe0, 0xf0, 0xf8, 0]) {
    const row = rewriteOriginalMapObjectRowB799(s.mapObjects, s.spatial, 0xc00);
    assert.deepEqual(
      row.rewritten.map((x) => x.address),
      [0xc00, 0xc20, 0xde0],
    );
    for (const x of [10, 12, 14]) assert.equal(s.spatial.tile(640 + x), after);
    assert.equal(s.spatial.tile(11 * 64 + 16), 0xd0);
    assert.equal(s.spatial.tile(658), 0xd0);
  }
  // The actual B5F9 clears ONLY hit record; active peers can be contacted later.
  for (const a of [0xc00, 0xc20]) s.mapObjects.write8(a, M.FLAGS, 0x80);
  s.collide(0, 0x61);
  assert.equal(s.mapObjects.read8(0xc00, M.FLAGS), 1);
  assert.equal(s.mapObjects.read8(0xc20, M.FLAGS), 0x81);
  const tiles = s.spatial.tiles.slice();
  s.registers.mapRedraw = 0;
  s.collide(0, 0x61);
  assert.deepEqual(s.spatial.tiles, tiles);
  assert.equal(s.registers.mapRedraw, 0);
  s.collide(0, 0x62);
  assert.equal(
    s.spatial.tile(650),
    0x20,
    "peer collision rewrites same row again",
  );
}
// B7CB only active/unbroken kind1; repeat or empty scan cannot set D348.
{
  const s = new OriginalBattleSession({
    registers: { mode: 0, battleSideFlag: 0x80, mapRedraw: 0 },
  });
  cleanRows(s);
  for (const [a, flags, kind] of [
    [0xc00, 0x80, 1],
    [0xc20, 0x81, 1],
    [0xc40, 0, 1],
    [0xc60, 0x80, 2],
  ]) {
    const x = 10 + (a - 0xc00) / 32;
    record(s, a, { flags, kind, x });
    s.spatial.writeTile(640 + x, 0xd0);
  }
  const result = sweepOriginalWallObjectsB7CB(
    s.mapObjects,
    s.spatial,
    0,
    s.registers,
  );
  assert.deepEqual(
    result.destroyed.map((x) => x.address),
    [0xc00],
  );
  assert.equal(s.registers.mapRedraw, 1);
  assert.equal(s.mapObjects.read16(0xc00, M.METRIC), 5);
  assert.equal(s.mapObjects.read8(0xc00, M.FLAGS), 0x81);
  s.registers.mapRedraw = 0;
  sweepOriginalWallObjectsB7CB(s.mapObjects, s.spatial, 0, s.registers);
  assert.equal(s.registers.mapRedraw, 0);
  // Map-object collision outside first16 has no matching row: no B824/D348.
  cleanRows(s);
  record(s, 0xe00, { metric: 0 });
  s.registers.mode = 1;
  s.collide(0, 0x71);
  assert.equal(s.registers.mapRedraw, 0);
  assert.equal(s.mapObjects.read8(0xe00, M.FLAGS), 0);
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
const scripts = json("battle_scripts");
const sc = {
  player_faction: 0,
  generals: [0, 1].map((idx) => ({
    idx,
    name: String(idx),
    battle_formation: 0,
    ability: { force: 80, lead: 70, field: 5 },
  })),
};
const legion = (faction) => ({
  generalIdx: faction,
  leader: String(faction),
  faction,
  morale: 200,
  troops: 100,
  units: [
    { type: 1, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
function place(s, a, x, y, plane = 0) {
  for (const [f, v] of [
    [O.FLAGS, 0xc0],
    [O.HP, 180],
    [O.ANCHOR_X, x],
    [O.PREVIOUS_X, x],
    [O.ANCHOR_Y, y],
    [O.PREVIOUS_Y, y],
    [O.CURRENT_COMMAND, 8],
    [O.PENDING_COMMAND, 8],
    [O.HEIGHT, plane],
    [O.PREVIOUS_HEIGHT, plane],
    [O.LEVEL, plane ? 4 : 0],
    [O.PREVIOUS_LEVEL, plane ? 4 : 0],
    [O.POSITION_LEVEL, plane ? 4 : 0],
    [O.POSITION_X, x],
    [O.POSITION_Y, y],
  ])
    s.pool.write8(a, f, v);
  s.pool.write16(a, O.TARGET_X, x | (y << 8));
  s.pool.write16(a, O.SPATIAL_0C, (plane ? 0x4000 : 0) + y * 64 + x);
  s.pool.write16(a, O.SPATIAL_0E, (plane ? 0x4000 : 0) + y * 64 + x);
}
function liveFixture() {
  const battle = createFieldBattle(sc, legion(0), legion(1), maps, {
      directoryIndex: 0xc0,
    }),
    s = battle.session;
  const view = {
    battle,
    app: { battleScripts: scripts, hud: { flashEvent() {} } },
  };
  BattleView.prototype.startBattleScript.call(view);
  s.pool.bytes.fill(0);
  s.temps.bytes.fill(0);
  s.effects.bytes.fill(0);
  s.spatial.bytes.fill(0);
  s.spatial.tiles.fill(1);
  s.spatial.tileAttributes.fill(0);
  cleanRows(s);
  s.registers.side0Active = 1;
  s.registers.side1Active = 1;
  s.registers.winnerState = 0;
  s.registers.mode = 1;
  s.registers.mapRedraw = 0;
  place(s, 0, 20, 20);
  place(s, 0x600, 30, 30);
  for (const p of [0, 0x1000])
    for (let x = 1; x <= 4; x++)
      s.spatial.write8(
        0x7000 + p + 64 + x,
        (x > 1 ? 0x10 : 0) | (x < 4 ? 0x20 : 0) | (p ? 4 : 0),
      );
  // Broken E0 MDL samples set bit7 on every physical plane before literal clears.
  s.spatial.tileAttributes.fill(1, 0xe0 * 8 + 1, 0xe0 * 8 + 8);
  record(s, 0xc00, { y: 1, x: 3, metric: 0 });
  s.spatial.writeTile(67, 0xd0);
  for (let p = 0; p < 7; p++) s.spatial.write8(p * 0x1000 + 67, 0xe1);
  s.spatial.write8(0x9043, 100);
  s.spatial.write8(0xa043, 8);
  return { battle, s, vm: view.battleScriptVm };
}
// Real queued player assault -> A426 VM -> A96D/B7CB/B824; then real facade
// AED2/B00D/AF65 on each descriptor plane. No rule handler/VM/buildPath stubs.
for (const plane of [0, 0x10]) {
  const { battle, s, vm } = liveFixture();
  s.registers.mode = 0;
  s.registers.battleSideFlag = 0x80;
  const rng = s.rng.snapshot(),
    descriptors = s.spatial.bytes.slice(0x7000, 0x9000);
  const request = {
    current: 0x101,
    target: 0x104,
    layer: plane,
    mask: plane ? 0x74 : 0xeb,
    endpointPolicy: plane ? 0 : 1,
  };
  const old = createOriginalPathBuilder(s.spatial.navigationBytes())(request);
  assert.equal(old.distance, plane ? 13 : 105);
  assert.deepEqual(old.words, [0x103, 0x104]);
  queueTacticalCommand(battle, { command: "assault" });
  advanceOriginalScriptFrame(battle, vm);
  assert.ok(
    battle.originalLastEvents.some(
      (e) => e.type === "map-object-destroyed" && e.source === "B7CB",
    ),
  );
  assert.equal(s.mapObjects.read8(0xc00, M.FLAGS), 0x81);
  assert.equal(s.registers.mapRedraw, 1);
  for (let p = 0; p < 6; p++) assert.equal(s.spatial.read8(p * 0x1000 + 67), 0);
  assert.equal(
    s.spatial.read8(0x6043),
    0xe1,
    "seventh keeps low ID and BB6D bit7",
  );
  assert.deepEqual(
    s.spatial.bytes.slice(0x7000, 0x9000),
    descriptors,
    "both descriptor planes unchanged, NOT rebuilt",
  );
  assert.equal(s.spatial.read8(0x9043), 0);
  assert.equal(s.spatial.read8(0xa043), 8);
  const expected = {
    carry: false,
    words: plane ? [0x103, 0x104] : [0x104],
    distance: plane ? 13 : 5,
    visited: 4,
  };
  assert.deepEqual(battle.originalPathBuilder(request), expected);
  assert.deepEqual(
    s.rng.snapshot(),
    rng,
    "assault/wall destruction consumes no RNG",
  );
  // Isolate subsequent movement from assault target selection using ordinary idle
  // object state; all facade path/frame consumers remain installed.
  place(s, 0, 1, 1, plane);
  s.pool.write8(0, O.CLASS, plane ? 0x24 : 0);
  s.registers.mode = 1;
  s.pool.write16(0, O.TARGET_X, 0x104);
  s.enqueuePath(0);
  advanceOriginalScriptFrame(battle, vm);
  assert.ok(battle.originalLastEvents.some((e) => e.type === "map-redraw"));
  const path = battle.originalLastEvents
    .find((e) => e.type === "path-frames")
    .paths.find((p) => p.address === 0);
  assert.deepEqual(path.built, expected);
  assert.equal(path.first.word, plane ? 0x103 : 0x104);
  for (const x of [2, 3, 4]) {
    advanceOriginalScriptFrame(battle, vm);
    assert.equal(s.pool.read8(0, O.ANCHOR_X), x);
  }
  assert.equal(s.pool.read8(0, O.PATH_REMAINING), 0);
  assert.deepEqual(s.rng.snapshot(), rng);
}
// Production movement contact -> B533/B5B7/B799 -> route queue -> broken tile.
{
  const { battle, s, vm } = liveFixture(),
    rng = s.rng.snapshot();
  place(s, 0, 2, 1);
  s.pool.write8(0, O.FLAGS, 0x80);
  s.pool.write16(0, O.POSITION_X, 0x104);
  s.pool.write16(0, O.TARGET_X, 0x104);
  advanceOriginalScriptFrame(battle, vm);
  // ADC8 does not flatten collision events into facade events; inspect the
  // actual target/tiles/queue writes rather than inventing a UI notification.
  assert.equal(
    s.pool.read8(0, O.ANCHOR_X),
    2,
    "contact CLC does not itself move",
  );
  assert.equal(s.spatial.tile(67), 0xe0);
  assert.equal(s.mapObjects.read8(0xc00, M.FLAGS), 1);
  assert.equal(s.paths.tail, 2);
  assert.equal(s.registers.mapRedraw, 1);
  advanceOriginalScriptFrame(battle, vm);
  assert.ok(battle.originalLastEvents.some((e) => e.type === "path-frames"));
  assert.equal(
    s.pool.read8(0, O.ANCHOR_X),
    3,
    "next queued route physically enters cleared cell",
  );
  advanceOriginalScriptFrame(battle, vm);
  assert.equal(s.pool.read8(0, O.ANCHOR_X), 4);
  assert.deepEqual(s.rng.snapshot(), rng);
}
console.log(
  `wall clear OK: authenticated KI, 30 seven-plane byte fixtures, ${cases} collision branches, repeated-row/sweep, production command/contact + two-plane routes, zero RNG`,
);
