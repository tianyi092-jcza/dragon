import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Tactical entry totality (M-04 deep cover, second round).
// city.idx -> BATTLE.MAP directory for all 192 cities x 20 chapters, plus
// field directories 0xC0..0xD5, plus the 214 x 0x1000 independent-map asset
// shape. Rule-layer entry only (which directory a battle uses); it does not
// certify layout/theme rendering. No SAVE.DAT, no profile, no writes.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  createFieldProjection,
  createSiegeProjection,
} from "../web/src/game/battle/battleprojection.js";

let battleMaps;
try {
  battleMaps = JSON.parse(
    await readFile(new URL("../web/battle_maps.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load battle map directory", { cause: error });
}
assert.ok(Array.isArray(battleMaps.directory), "directory must be an array");
assert.equal(battleMaps.directory.length, 214, "214 independent directories");
assert.deepEqual(
  battleMaps.directory.map((entry) => entry.idx).sort((a, b) => a - b),
  Array.from({ length: 214 }, (_, index) => index),
  "directory idx must be exactly 0..213",
);
for (const entry of battleMaps.directory) {
  assert.ok(
    Number.isInteger(entry.layout) && entry.layout >= 0 && entry.layout <= 2,
    `dir ${entry.idx} layout byte range`,
  );
  assert.ok(
    Number.isInteger(entry.theme) && entry.theme >= 0 && entry.theme <= 255,
    `dir ${entry.idx} theme byte range`,
  );
}
// Field directories follow the original pairing: C0..CF -> layout 1,
// D0..D5 -> layout 2 (battle SKILL section 3, loader CS:97F0 pairs).
for (let dir = 0xc0; dir <= 0xcf; dir++)
  assert.equal(battleMaps.directory[dir].layout, 1, `field dir ${dir}`);
for (let dir = 0xd0; dir <= 0xd5; dir++)
  assert.equal(battleMaps.directory[dir].layout, 2, `field dir ${dir}`);

// BATTLE.MAP binary: 0x200 header + 214 independent 0x1000 maps.
const battleMapBytes = await readFile(
  new URL("../../Dragon/BATTLE.MAP", import.meta.url),
);
assert.equal(
  battleMapBytes.length,
  0x200 + 214 * 0x1000,
  "BATTLE.MAP size must fit 214 independent maps",
);
const sliceHashes = new Set();
for (let dir = 0; dir < 214; dir++) {
  const slice = battleMapBytes.subarray(
    0x200 + dir * 0x1000,
    0x200 + (dir + 1) * 0x1000,
  );
  assert.equal(slice.length, 0x1000, `dir ${dir} slice length`);
  sliceHashes.add(createHash("sha256").update(slice).digest("hex"));
}
assert.ok(
  sliceHashes.size > 1,
  "map slices must not be a single repeated fill",
);

// Every city idx in every one of the 20 chapters must resolve a directory.
const chapterFiles = (await readdir(new URL("../web/content/builtin/chapters/", import.meta.url)))
  .filter((name) => name.endsWith(".json"))
  .sort();
assert.equal(chapterFiles.length, 20, "20 chapters on disk");
let checkedCities = 0;
for (const name of chapterFiles) {
  let chapter;
  try {
    chapter = JSON.parse(
      await readFile(
        new URL(`../web/content/builtin/chapters/${name}`, import.meta.url),
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error(`cannot load chapter ${name}`, { cause: error });
  }
  assert.equal(chapter.state.cities.length, 192, `${name} city count`);
  for (const city of chapter.state.cities) {
    const map =
      battleMaps.directory[city.idx] ??
      battleMaps.cities.find((entry) => entry.idx === city.idx);
    assert.ok(
      map && map.idx === city.idx,
      `${name} city ${city.idx} must resolve a directory`,
    );
    checkedCities++;
  }
}

// End-to-end entry functions on the boundary directories.
const scenario = { generals: [], factions: [] };
const legion = (leader) => ({
  leader,
  units: [{ type: 3, troops: 100 }],
});
test("siege entry resolves city directories 0 and 191", () => {
  for (const idx of [0, 191]) {
    const view = createSiegeProjection(
      scenario,
      legion("攻"),
      { idx, name: `城${idx}` },
      battleMaps,
      legion("守"),
    );
    assert.equal(view.directoryIndex, idx);
    assert.equal(view.layout, battleMaps.directory[idx].layout);
    assert.equal(view.mirror, false);
  }
});
test("field entry resolves directories 0xC0 and 0xD5, class-9 water flag", () => {
  for (const dir of [0xc0, 0xd5]) {
    const view = createFieldProjection(
      scenario,
      legion("攻"),
      legion("守"),
      battleMaps,
      { directoryIndex: dir, mirror: false, terrainClass: 0 },
    );
    assert.equal(view.directoryIndex, dir);
    assert.equal(view.layout, battleMaps.directory[dir].layout);
  }
  const water = createFieldProjection(
    scenario,
    legion("攻"),
    legion("守"),
    battleMaps,
    { directoryIndex: 0xc0, mirror: false, terrainClass: 9 },
  );
  assert.equal(water.terrain.key, "water");
});
tlog(
  `tactical entry full: ${checkedCities} city-directory resolutions, ` +
    `214 slices, ${sliceHashes.size} distinct slice hashes`,
);
