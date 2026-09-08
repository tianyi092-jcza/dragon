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
  const directoryIndex = [0, 1, 4][layout];
  const assets = navigationAssetsForLayout(resource, layout, {
    directoryIndex,
  });
  assert.equal(assets.directoryIndex, directoryIndex);
  assert.equal(assets.tiles.length, 0x1000);
  assert.equal(assets.attributes.length, 0x800);
  const built = buildOriginalBattleNavigation(assets.tiles, assets.attributes);
  assert.equal(built.navigation.length, 0x4000); // BC22 clears two surcharge planes
  assert.ok([4, 5].includes(built.canonicalRamp));
}
assert.notDeepEqual(
  resource.maps["0"],
  resource.maps["10"],
  "CAEB selects a distinct 0x1000-byte map by directory index",
);

{
  const source = new Uint8Array(ORIGINAL_MAP_CELLS);
  source[0] = 0xaa;
  source[0x40] = 0x30;
  source[0x0fbf] = 0xf0;
  source[0x0fc0] = 0xbb;
  const mirrored = mirrorOriginalBattleTiles(source);
  assert.equal(mirrored[0], 0xaa, "CB9B leaves the first border row intact");
  assert.equal(
    mirrored[0x0fc0],
    0xbb,
    "CB9B leaves the last border row intact",
  );
  assert.equal(
    mirrored[0x40],
    0xf1,
    "CB9B reverses the linear interior and CBBC transforms F0 to F1",
  );
  assert.equal(
    mirrored[0x0fbf],
    0x40,
    "CB9B reverses the linear interior and CBBC transforms 30 to 40",
  );
  assert.equal(source[0x40], 0x30, "mirror must not mutate the source buffer");
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
  assert.deepEqual(path.words, [0x0104]); // BE75 axis compression, raw differential.
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
    mask: 0x74,
    endpointPolicy: 0,
  });
  assert.equal(path.carry, false);
  // BEEA/BF05 emits the upper descriptor level (5), not level difference.
  assert.deepEqual(path.words, [0x0580, 0x0203]);
}

// BD96..BDBE endpoint plane choice: policy0/mask74 prefers the upper plane
// when target center/right/left has any cardinal connection; otherwise low plane.
{
  const navigation = new Uint8Array(ORIGINAL_NAV_COST_BASE + 0x1000);
  const start = 3 * 0x40 + 1;
  const target = 3 * 0x40 + 3;
  navigation[start] = 0x20 | 1;
  navigation[start + 1] = 0x10 | 0x20 | 1;
  navigation[target] = 0x10 | 1;
  navigation[target + 0x1000] = 0;
  const low = buildOriginalPath(navigation, {
    current: 0x0301,
    target: 0x0303,
    layer: 0,
    mask: 0x74,
    endpointPolicy: 0,
  });
  assert.equal(low.carry, false);
  assert.deepEqual(low.words, [0x0303]);

  navigation[start] = 8 | 1;
  navigation[start + 0x1000] = 8 | 0x20 | 5;
  navigation[start + 1 + 0x1000] = 0x10 | 0x20 | 5;
  navigation[target + 0x1000] = 0x10 | 5;
  const high = buildOriginalPath(navigation, {
    current: 0x0301,
    target: 0x0303,
    layer: 0,
    mask: 0x74,
    endpointPolicy: 0,
  });
  assert.equal(high.carry, false);
  assert.equal(high.words[0] & 0xff, 0x80);
}

{
  const navigation = new Uint8Array(ORIGINAL_NAV_COST_BASE + 0x1000);
  const none = buildOriginalPath(navigation, {
    current: 0x0401,
    target: 0x0403,
    layer: 0,
    mask: 0x74,
    endpointPolicy: 0,
  });
  assert.deepEqual(none, { carry: true, words: [], reason: "endpoint" });
}

process.stdout.write(
  "battle original navigation OK: 214 CAEB maps + BB3C/BBA6 graph + BD46 path\n",
);
