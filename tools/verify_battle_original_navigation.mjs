import assert from "node:assert/strict";
import fs from "node:fs/promises";

const {
  ORIGINAL_MAP_CELLS,
  ORIGINAL_NAV_COST_BASE,
  buildOriginalBattleNavigation,
  mirrorOriginalBattleTiles,
  navigationAssetsForLayout,
} = await import("../web/src/game/battle/originalnavigation.js");
const { buildOriginalPath } = await import(
  "../web/src/game/battle/originalpathfinder.js"
);

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

const resource = parseJson(
  await fs.readFile(
    new URL("../web/battle_navigation.json", import.meta.url),
    "utf8",
  ),
  "battle_navigation.json",
);
for (let layout = 0; layout < 3; layout++) {
  const assets = navigationAssetsForLayout(resource, layout);
  assert.equal(assets.tiles.length, 0x1000);
  assert.equal(assets.schedule.length, 0x100);
  assert.equal(assets.attributes.length, 0xf800);
  const built = buildOriginalBattleNavigation(assets.tiles, assets.attributes);
  assert.equal(built.navigation.length, 0x3000);
  assert.ok([4, 5].includes(built.canonicalRamp));
}

{
  const source = Uint8Array.from({ length: ORIGINAL_MAP_CELLS }, (_, i) => i);
  const mirrored = mirrorOriginalBattleTiles(source);
  assert.equal(
    mirrored[0],
    0x4f,
    "0x3f mirrors and applies CBBC direction transform",
  );
  assert.equal(mirrored[0x3f], source[0]);
  assert.equal(source[0], 0, "mirror must not mutate the original tile buffer");
}

{
  const navigation = new Uint8Array(ORIGINAL_NAV_COST_BASE + 0x1000);
  // 单层直线：x=1→4，低平面允许左右移动。
  for (let x = 1; x <= 4; x++) {
    const index = 1 * 0x40 + x;
    navigation[index] = (x > 1 ? 0x10 : 0) | (x < 4 ? 0x20 : 0) | 1;
  }
  const path = buildOriginalPath(navigation, {
    current: 0x0101,
    target: 0x0104,
    layer: 0,
    mask: 0xeb,
    endpointPolicy: 1,
  });
  assert.equal(path.carry, false);
  assert.deepEqual(path.words, [0x0102, 0x0103, 0x0104]);
}

{
  const navigation = new Uint8Array(ORIGINAL_NAV_COST_BASE + 0x1000);
  const index = 2 * 0x40 + 2;
  navigation[index] = 8 | 2;
  navigation[index + 0x1000] = 8 | 0x20 | 5;
  navigation[index + 1 + 0x1000] = 0x10 | 5;
  const path = buildOriginalPath(navigation, {
    current: 0x0202,
    target: 0x0203,
    layer: 0,
    targetLayer: 1,
    mask: 0x74,
    endpointPolicy: 1,
  });
  assert.equal(path.carry, false);
  assert.equal(path.words.length, 3);
  assert.equal(path.words[0] & 0xff, 0x80, "first word is a layer transition");
  assert.deepEqual(path.words.slice(1), [0x0202, 0x0203]);
}

process.stdout.write(
  "battle original navigation OK: CAEB assets + BB3C/BBA6 graph + BD46 path\n",
);
