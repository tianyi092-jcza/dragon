// Exact STATIC coverage domain only. No dynamic reachability or whole-scene
// acceptance follows from this finite check (see the scratch counterexample).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
 OriginalBattleDisplay,
 SCENE_DISPLAY,
} from "../web/src/game/battle/originaldisplay.js";
const read = (name) =>
 readFileSync(new URL(`../../Dragon/${name}`, import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const mdl = read("BATTLE.MDL"),
 sch = read("BATTLE.SCH"),
 maps = read("BATTLE.MAP");
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
let blocks = 0;
for (let directory = 0; directory < 214; directory++) {
 const layout = maps[directory * 2],
  attributes = mdl.subarray(0x1000 + layout * 0xf800, 0x1800 + layout * 0xf800);
 const graphics = Buffer.concat([
  mdl.subarray(0x1800 + layout * 0xf800, 0x10800 + layout * 0xf800),
  sch,
 ]);
 const display = new OriginalBattleDisplay(SCENE_DISPLAY);
 display.terrain(
  maps.subarray(512 + directory * 4096, 512 + (directory + 1) * 4096),
  attributes,
 );
 const stride = 132 * 32;
 for (let row = 0; row < 73; row++)
  for (let column = 1; column < 131; column += 2) {
   const cell = (row * 132 + column) * 32,
    floor = display.bytes[cell + 2];
   const maximum = Math.max(
    ...[0, -32, 32, stride - 32, stride + 32].map(
     (delta) => display.bytes[cell + delta + 1],
    ),
   );
   const covered = new Uint8Array(64);
   for (let level = floor >> 1; level <= maximum >> 1; level++) {
    for (const [delta, quadrant] of [
     [-32, 3],
     [32, 2],
     [0, null],
     [stride - 32, 1],
     [stride + 32, 0],
    ])
     for (const channel of [0, 2]) {
      const code = display.word(cell + delta + 4 + level * 4 + channel);
      if (!code) continue;
      const source = quadrant == null ? 0 : quadrant * 16,
       destination = quadrant == null ? 0 : 48 - source,
       count = quadrant == null ? 64 : 16;
      for (let i = 0; i < count; i++)
       covered[destination + i] |= graphics[code * 320 + source + i];
     }
   }
   assert.ok(
    covered.every((v) => v === 255),
    `undefined scratch bits: directory${directory}, row${row}, column${column}`,
   );
   blocks++;
  }
}
assert.equal(blocks, 1015430);
console.log(
 `battle display STATIC coverage OK: ${blocks} complete masks; 214 unmirrored/unmodified maps, no units/effects/flags, analysis-only132x80 grid; dynamic domain NOT certified`,
);
