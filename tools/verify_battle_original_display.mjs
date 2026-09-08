// Authenticated raw-derived boundary tests, NOT a KI execution oracle or
// production rendering acceptance. No SAVE.DAT, browser, or runtime writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  OriginalBattleDisplay,
  NATIVE_DISPLAY,
  SCENE_DISPLAY,
  updateOriginalAttributeDisplays,
} from "../web/src/game/battle/originaldisplay.js";
import {
  OriginalBattleCompositor,
  OriginalBattleDisplayProcess,
  compositeOriginalRecord,
} from "../web/src/render/originalcompositor.js";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { OriginalBattleMapObjectPool } from "../web/src/game/battle/originalmapobjects.js";
import { spawnOriginalAttackEffect } from "../web/src/game/battle/originaleffects.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const original = (name) =>
  readFileSync(new URL(`../../Dragon/${name}`, import.meta.url));
const ki = original("KI.EXE"),
  mdl = original("BATTLE.MDL"),
  sch = original("BATTLE.SCH"),
  maps = original("BATTLE.MAP");
assert.equal(
  hash(ki),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
assert.equal(
  hash(mdl),
  "3522f7362f928fae45c1431a9efe57e285250d9db05d04ebdcb59f420e3e0bd3",
);
assert.equal(
  hash(sch),
  "2ddad3e90d2e6c6c2e0d7e278e2a07254374e7bd7f4e34d4405599ce76f5ec0b",
);
assert.equal(
  hash(maps),
  "8bbb2867ed526a2dcd2fcc1e0202a93952dcd113d3720936fd7304fd9e3ef872",
);
const bytesAt = (va, count) =>
  ki.subarray(va + 512, va + 512 + count).toString("hex");
// 99F3 raw camera writes and DC9D's E160/E162 transform. Raw (36,14)
// becomes OriginalBattleDisplay (column,row)=(50,21) before 99CB/DDB4.
assert.equal(bytesAt(0x99f5, 17), "c60648d301c7062ad30e00c70628d32400");
assert.equal(bytesAt(0x99ba, 11), "8b1628d38b1e2ad3e8d842");
assert.equal(bytesAt(0xdd07, 20), "8bc203c32ea360e12bdad1fb83c3202e891e62e1");
assert.equal(bytesAt(0x99c2, 15), "e8d842e80601e8e802e8731fe8e343"); // DC9D,9ACE,9CB3,B941,DDB4
assert.equal(bytesAt(0xbb31, 11), "e8cf20fe441b80641b03c3"); // draw before INC phase
assert.equal(bytesAt(0xe0b1, 6), "adf7d0262105"); // LODSW/NOT/AND, not alpha
assert.equal(bytesAt(0xe0cf, 4), "ad260905"); // unmasked color OR
assert.ok(
  ki.subarray(0xe364, 0xe464).every((v) => v === 0),
  "process-file scratch initial bytes only, NOT per-battle clearing",
);
const attributes = (layout) =>
  mdl.subarray(0x1000 + layout * 0xf800, 0x1800 + layout * 0xf800);
const terrain = (layout) =>
  mdl.subarray(0x1800 + layout * 0xf800, 0x10800 + layout * 0xf800);
const graphics = (layout) => Buffer.concat([terrain(layout), sch]);
assert.deepEqual(
  readFileSync(new URL("../web/battle_display.bin", import.meta.url)),
  Buffer.concat([terrain(0), terrain(1), terrain(2), sch]),
);
for (const [half, expected] of [
  [336, "0a2e5cc9e00795bba8a9f7dffea409fb328a0b72a629832d818eeeabb3d2c763"],
  [337, "d99f1374380cfa1ec6f483c5bf60a161111d4cb79a2db132f599f5ffefede783"],
  [340, "cff9b99864e78d5732689e92e117f9fe29321b214ccd31ebfb0a3be997212c39"],
  [341, "bab31d734fc7e7d4617997da9a6bc10e915a598bdb1b17c7ad54ab5a603c76bb"],
])
  assert.equal(hash(sch.subarray(half * 320, (half + 1) * 320)), expected);

// E085/E0E1 independent per-bit oracle on all real effect records, four
// neighboring quadrants and changing destination backgrounds, including transparent and opaque-black bits. Source planes are never rewritten.
let outsideMask = 0;
for (const half of [336, 337, 340, 341])
  for (const quadrant of [null, 0, 1, 2, 3])
    for (const background of [0, 0x35, 0xa6, 0xff]) {
      const code = 192 + half,
        g = graphics(0),
        scratch = new Uint8Array(256).fill(background),
        expected = scratch.slice();
      const source = quadrant == null ? 0 : quadrant * 16,
        destination = quadrant == null ? 0 : 48 - source,
        count = quadrant == null ? 64 : 16;
      for (let plane = 0; plane < 4; plane++)
        for (let b = 0; b < count; b++)
          for (let bit = 0; bit < 8; bit++) {
            const mask = (g[code * 320 + source + b] >> bit) & 1;
            const color =
              (g[code * 320 + (plane + 1) * 64 + source + b] >> bit) & 1;
            const at = plane * 64 + destination + b,
              old = (background >> bit) & 1;
            const value = (old & (mask ^ 1)) | color;
            expected[at] = (expected[at] & ~(1 << bit)) | (value << bit);
            if (!mask && color) outsideMask++;
          }
      compositeOriginalRecord(scratch, g, code, quadrant);
      assert.deepEqual(scratch, expected);
    }
assert.equal(outsideMask, 0);
// All936 authenticated records have zero color outside mask. The earlier
// requirement for a real nonzero sample had a false premise and was withdrawn.
let records = 0;
for (const source of [terrain(0), terrain(1), terrain(2), sch])
  for (let n = 0; n < source.length / 320; n++) {
    for (let p = 0; p < 4; p++)
      for (let b = 0; b < 64; b++)
        assert.equal(
          source[n * 320 + (p + 1) * 64 + b] & ~source[n * 320 + b],
          0,
        );
    records++;
  }
assert.equal(records, 936);
// Explicitly SYNTHETIC record checks the general raw OR semantics; it is NOT a
// real resource or a reachable-frame fixture.
const synthetic = new Uint8Array(320);
synthetic[0] = 0x80;
synthetic[64] = 0x40;
const syntheticBackground = new Uint8Array(256).fill(0x80);
compositeOriginalRecord(syntheticBackground, synthetic, 0);
assert.equal(syntheticBackground[0], 0x40);
assert.equal(syntheticBackground[64], 0);

const ZERO_NATIVE_DISPLAY = Object.freeze({
  ...NATIVE_DISPLAY,
  column: 0,
  row: 0,
});
assert.deepEqual(
  { column: NATIVE_DISPLAY.column, row: NATIVE_DISPLAY.row },
  { column: 0x32, row: 0x15 },
);
const startupCamera = new OriginalBattleDisplay();
assert.equal(
  startupCamera.cell({ x: 36, y: 14, level: 0 }),
  0,
  "99F3 raw origin maps to the native base cell",
);

// Explicit zero-origin fixture for literal DB34/DA1C addresses: native
// col15,row10,z2 -> base29E0, effect +0C, unit +0E, upper half row-1/+4.
const display = new OriginalBattleDisplay(ZERO_NATIVE_DISPLAY);
const point = { x: 27, y: -12, level: 2 }; // signed boundary coordinates yielding col15,row10
assert.equal(display.cell(point), 0x29e0);
display.draw({ ...point, code: 0x210 });
assert.equal(display.word(0x29ec), 0x210);
display.draw({ ...point, code: 0x211 });
assert.equal(display.word(0x29ec), 0x210, "occupied effect insertion loses");
display.draw({ ...point, code: 0x150, pair: true, attribute: true });
assert.equal(display.word(0x29ec), 0x151, "DC03 overwrite");
assert.equal(display.word(0x25f0), 0x150);
display.draw({ ...point, code: 0xc0, pair: true });
assert.equal(display.word(0x29ee), 0xc1);
assert.equal(display.word(0x25f2), 0xc0);
display.erase(point);
assert.equal(display.word(0x29ec), 0);
assert.equal(
  display.word(0x29ee),
  0xc1,
  "DB9B does not erase the unit channel",
);
display.setWord(0x29ec, 0xbf);
display.erase(point);
assert.equal(display.word(0x29ec), 0xbf, "terrain below C0 is not erased");
display.erase({ ...point, pair: true });
assert.equal(display.word(0x29ee), 0);
assert.equal(display.word(0x25f2), 0);
display.bytes[0x29e2] = 6;
display.draw({ ...point, code: 0x210 });
assert.equal(display.word(0x29ec), 0xbf, "height5 below floor6 is rejected");
const beforeClip = display.bytes.slice();
for (const p of [
  { x: -1, y: 0, level: 0 },
  { x: 31, y: 0, level: 0 },
  { x: 0, y: 0, level: 33 },
  { x: 0, y: 0, level: 0 },
])
  display.draw({ ...p, code: 0x210 });
assert.deepEqual(
  display.bytes,
  beforeClip,
  "columns -1/31 and rows -1/32 clipped",
);
// Use valid z0 with translated native camera for top-row partial pair clipping.
const topValid = new OriginalBattleDisplay({
  ...NATIVE_DISPLAY,
  column: 0,
  row: 12,
});
topValid.draw({ x: 27, y: -12, level: 0, code: 0xc0, pair: true });
assert.equal(topValid.word(15 * 32 + 6), 0xc1);

const saved = display.snapshot(),
  restored = OriginalBattleDisplay.fromSnapshot(saved);
saved.bytes[0] = 99;
saved.geometry.column = 10;
assert.notEqual(restored.bytes[0], 99);
assert.equal(restored.geometry.column, 0);
assert.throws(() =>
  OriginalBattleDisplay.fromSnapshot({ ...display.snapshot(), bytes: [0] }),
);
assert.throws(() =>
  OriginalBattleDisplay.fromSnapshot({ ...display.snapshot(), revision: NaN }),
);

// BB10 accepted-slot phase, single/pair, both bases, capture before increment.
for (const level of [0, 5, 6])
  for (const base of [0x150, 0x204])
    for (let phase = 0; phase < 4; phase++) {
      const pool = new OriginalBattleMapObjectPool();
      pool.write8(0xe00, 0, 0xc0);
      pool.write8(0xe00, 0xa, level);
      pool.write8(0xe00, 0x1b, phase);
      pool.write16(0xe00, 0x1c, base);
      const capture = updateOriginalAttributeDisplays(pool)[0];
      assert.equal(capture.phase, phase);
      assert.equal(capture.code, base + (level === 6 ? 8 + phase : 2 * phase));
      assert.equal(capture.pair, level !== 6);
      assert.equal(pool.read8(0xe00, 0x1b), (phase + 1) & 3);
      pool.write8(0xe00, 0, 0xbf);
      assert.deepEqual(updateOriginalAttributeDisplays(pool), []);
    }

// Production 99C2/99CB activation: direct terrain build, one accepted BB10
// phase, retained D348, once-only initial commit, then one B941/DDB4 boundary.
{
  const session = new OriginalBattleSession({
    registers: { side0Active: 1, side1Active: 1 },
  });
  session.mapObjects.write8(0xe00, 0, 0xc0);
  session.mapObjects.write8(0xe00, 6, 27);
  session.mapObjects.write8(0xe00, 8, -12);
  session.mapObjects.write8(0xe00, 0xa, 2);
  session.mapObjects.write8(0xe00, 0x1b, 3);
  session.mapObjects.write16(0xe00, 0x1c, 0x210);
  const tiles = new Uint8Array(0x1000);
  session.spatial.tileAttributes = Uint8Array.from(attributes(0));
  const rng = session.rng.snapshot();
  assert.equal(
    session.initializeNativeDisplay({
      tiles,
      tileBytes: tiles,
      attributes: attributes(0),
    }),
    true,
  );
  assert.equal(session.registers.mapRedraw, 1);
  assert.equal(session.mapObjects.read8(0xe00, 0x1b), 0);
  assert.equal(session.attributeDisplays.get(0xe00).phase, 3);
  assert.equal(session.consumeInitialNativeCommit().source, "99CB/DDB4");
  assert.equal(session.consumeInitialNativeCommit(), null);
  const frame = session.tick({
    updateObject: () => {},
    recountActivity: () => ({ side0Active: 1, side1Active: 1 }),
  });
  assert.equal(session.registers.mapRedraw, 0);
  assert.equal(session.mapObjects.read8(0xe00, 0x1b), 1);
  assert.equal(session.attributeDisplays.get(0xe00).phase, 0);
  assert.equal(
    frame.events.filter((event) => event.type === "native-display-commit")
      .length,
    1,
  );
  assert.deepEqual(session.rng.snapshot(), rng);
  const restoredSession = new OriginalBattleSession().restore(
    session.snapshot(),
  );
  assert.deepEqual(
    restoredSession.nativeDisplay.snapshot(),
    session.nativeDisplay.snapshot(),
  );
  assert.deepEqual(
    [...restoredSession.attributeDisplays.values()],
    [...session.attributeDisplays.values()],
  );
}

// Actual Session A082 calls B97E/BA2E/BAB7 and writes ordered native/modern
// captures without adding rule RNG.
for (const code of [0x210, 0x211, 0x214, 0x215]) {
  const session = new OriginalBattleSession({
    registers: { side0Active: 1, side1Active: 1 },
  });
  session.pool.write8(0, 0, 0xc0);
  session.pool.write8(0, 3, 100);
  session.pool.write8(0, 6, 10);
  session.pool.write8(0, 8, 10);
  session.pool.write8(0x600, 0, 0xc0);
  session.pool.write8(0x600, 3, 100);
  session.pool.write8(0x600, 6, 50);
  session.pool.write8(0x600, 8, 50);
  spawnOriginalAttackEffect(session.pool, session.effects, 0, {
    parameter: 0,
    direction: 2,
    effectClass: 0x1c,
    code,
  });
  const captures = [],
    rng = session.rng.snapshot();
  session.tick({
    updateObject: () => {},
    recountActivity: () => ({ side0Active: 1, side1Active: 1 }),
    objectHandlers: {
      effectRender: {
        erase: (p) => captures.push(["erase", p]),
        draw: (p) => captures.push(["draw", p]),
      },
    },
  });
  assert.equal(captures.length, 2);
  assert.equal(captures[0][0], "erase");
  assert.equal(captures[1][1].code, code);
  assert.equal(captures[0][1].x, 10);
  assert.equal(captures[1][1].x, 11);
  assert.equal(captures[1][1].level, 1);
  assert.deepEqual(session.rng.snapshot(), rng);
}

// Native DDB4: fast copy ignores mask and preserves scratch; dirty suppression,
// bit8 freeze, explicit state and restore independence. Boundary input only.
const g = graphics(0),
  fast = new OriginalBattleDisplay(ZERO_NATIVE_DISPLAY),
  fastCell = (10 * 32 + 15) * 32;
fast.bytes[fastCell] = 0x80;
fast.bytes[fastCell + 1] = fast.bytes[fastCell + 2] = 2;
fast.setWord(fastCell + 8, 8); // MDL0 sprite8 real mask has only58 set bits
const native = new OriginalBattleCompositor({
  scratch: new Uint8Array(256).fill(0x59),
  framebuffer: new Uint8Array(480 * 368).fill(7),
});
assert.equal(native.draw(fast, g), 1); // isolated odd-column dirty cell
assert.ok(
  native.scratch.every((v) => v === 0x59),
  "DFBB bypasses scratch",
);
assert.ok(native.framebuffer.some((v) => v !== 7));
let clearedOutsideMask = 0;
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 32; x++) {
    const q = Number(x >= 16) + 2 * Number(y >= 8),
      b = q * 16 + (y & 7) * 2 + ((x & 15) >> 3),
      bit = 7 - (x & 7);
    let color = 0;
    for (let p = 0; p < 4; p++)
      color |= ((g[8 * 320 + (p + 1) * 64 + b] >> bit) & 1) << p;
    assert.equal(native.framebuffer[(160 + y) * 480 + 224 + x], color);
    if (!((g[8 * 320 + b] >> bit) & 1)) {
      assert.equal(color, 0);
      clearedOutsideMask++;
    }
  }
assert.equal(
  clearedOutsideMask,
  454,
  "MDL0 frame8 mask58: DFBB clears other454 pixels, unlike alpha",
);
// Literal DE95 order: left BR, right BL, center full, lower-left TR,
// lower-right TL, channel0 THEN channel2 at each level; no depth sorting.
const orderDisplay = new OriginalBattleDisplay(ZERO_NATIVE_DISPLAY),
  center = (10 * 32 + 15) * 32;
orderDisplay.bytes[center] = 0x80;
orderDisplay.bytes[center + 1] = 3;
const ordered = [];
let sequence = 0;
for (let z = 0; z < 2; z++)
  for (const [delta, q] of [
    [-32, 3],
    [32, 2],
    [0, null],
    [0x3e0, 1],
    [0x420, 0],
  ])
    for (const channel of [0, 2]) {
      const code = [32, 192, 193, 528, 529, 532, 533][sequence++ % 7];
      orderDisplay.setWord(center + delta + 4 + z * 4 + channel, code);
      ordered.push([code, q]);
    }
const expectedPlanes = new Uint8Array(256).fill(0x9a);
for (const [code, q] of ordered) {
  const src = q == null ? 0 : q * 16,
    dst = q == null ? 0 : 48 - src,
    n = q == null ? 64 : 16;
  for (let p = 0; p < 4; p++)
    for (let b = 0; b < n; b++)
      for (let bit = 0; bit < 8; bit++) {
        const at = p * 64 + dst + b,
          m = (g[code * 320 + src + b] >> bit) & 1,
          c = (g[code * 320 + (p + 1) * 64 + src + b] >> bit) & 1;
        const value = ((expectedPlanes[at] >> bit) & 1 & (1 - m)) | c;
        expectedPlanes[at] =
          (expectedPlanes[at] & ~(1 << bit)) | (value << bit);
      }
}
const orderedCompositor = new OriginalBattleCompositor({
  scratch: new Uint8Array(256).fill(0x9a),
  framebuffer: new Uint8Array(480 * 368),
});
assert.equal(orderedCompositor.draw(orderDisplay, g), 1);
assert.deepEqual(orderedCompositor.scratch, expectedPlanes);
const after = native.snapshot();
assert.equal(native.draw(fast, g), 0);
assert.deepEqual(native.snapshot(), after);
fast.bytes[fastCell] = 0x88;
const frozen = native.framebuffer.slice();
native.draw(fast, g);
for (let y = 160; y < 176; y++)
  assert.deepEqual(
    native.framebuffer.slice(y * 480 + 224, y * 480 + 256),
    frozen.slice(y * 480 + 224, y * 480 + 256),
  );
assert.throws(() => new OriginalBattleCompositor());
const copy = OriginalBattleCompositor.fromSnapshot(native.snapshot());
const snap = copy.snapshot();
snap.scratch[0] ^= 255;
snap.framebuffer[0] = 15;
assert.notEqual(copy.scratch[0], snap.scratch[0]);
assert.throws(() =>
  OriginalBattleCompositor.fromSnapshot({ ...copy.snapshot(), scratch: [0] }),
);
assert.throws(
  () => native.draw(new OriginalBattleDisplay(SCENE_DISPLAY), g),
  "expanded traversal is deliberately NOT activated",
);

// Source-preserving scratch counterexample. The fixture lists all27 initial
// nodes, original bytes and all5 literal B824 transforms; NOT reachability proof.
let fixture;
try {
  fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/battle_display_scratch.json", import.meta.url),
    ),
  );
} catch (error) {
  throw new Error("cannot read authenticated battle display scratch fixture", {
    cause: error,
  });
}
const tiles = Buffer.from(
  maps.subarray(
    512 + fixture.directory * 4096,
    512 + (fixture.directory + 1) * 4096,
  ),
);
assert.equal(fixture.mapSha256, hash(maps));
assert.equal(fixture.changes.length, 27);
for (const { node, values } of fixture.changes) {
  assert.equal(tiles[node], values[0]);
  for (let i = 1; i < values.length; i++)
    assert.equal(
      values[i],
      (values[i - 1] + (values[i - 1] < 0xf0 ? 16 : 8)) & 255,
    );
  tiles[node] = values.at(-1);
}
const counter = new OriginalBattleDisplay({
  ...NATIVE_DISPLAY,
  column: fixture.camera.column,
  row: fixture.camera.row,
});
counter.terrain(tiles, attributes(fixture.layout));
const cellsHash = hash(counter.bytes),
  outputs = [];
assert.equal(
  cellsHash,
  "7be61d96f9b2300bf04d6b74799a9b73ce40d386d2c8fd4c8d412b5229fd339b",
);
for (const fill of fixture.scratchVariants) {
  const d = OriginalBattleDisplay.fromSnapshot(counter.snapshot());
  const c = new OriginalBattleCompositor({
    scratch: new Uint8Array(256).fill(fill),
    framebuffer: new Uint8Array(480 * 368),
  });
  c.draw(d, graphics(fixture.layout));
  outputs.push(c.framebuffer);
}
const first = outputs[0].findIndex((v, n) => v !== outputs[1][n]);
assert.equal(first, 4350);
assert.equal(outputs[0][first], 0);
assert.equal(outputs[1][first], 15);
console.log(
  "scratch counterexample:",
  JSON.stringify({
    cellsHash,
    first,
    x: first % 480,
    y: Math.floor(first / 480),
    values: outputs.map((o) => o[first]),
    framebufferHashes: outputs.map(hash),
  }),
);
// Process scratch survives battle teardown while cells/framebuffer are new.
{
  const process = new OriginalBattleDisplayProcess();
  const firstDisplay = OriginalBattleDisplay.fromSnapshot(
    orderDisplay.snapshot(),
  );
  firstDisplay.bytes[center] |= 0x80;
  process.startBattle(firstDisplay, g);
  const retained = process.scratch.slice();
  assert.ok(retained.some((value) => value !== 0));
  process.endBattle();
  assert.deepEqual(process.scratch, retained);
  const secondDisplay = new OriginalBattleDisplay(ZERO_NATIVE_DISPLAY);
  process.startBattle(secondDisplay, g);
  assert.deepEqual(process.scratch, retained);
  assert.ok(process.battle.framebufferKnown.every((value) => value === 0));
  process.endBattle();
}

console.log(
  `battle original display OK: authenticated planes, production 99CB/B941, half-frame/mask/phase/cell/clip/dirty/restore/process-history tests; outside-mask observations=${outsideMask}`,
);
