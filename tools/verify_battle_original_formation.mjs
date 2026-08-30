import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { applyOriginalFormationTarget } = await import(
  "../web/src/game/battle/originalformation.js"
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

const rules = parseJson(
  await fs.readFile(
    new URL("../web/battle_rules.json", import.meta.url),
    "utf8",
  ),
  "battle_rules.json",
);
const vectors = rules.formationVectors;
assert.equal(vectors.length, 48);

{
  const pool = new OriginalBattleObjectPool();
  const address = originalObjectAddress(0, 0, 0);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 30);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 20);
  pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 4);
  const result = applyOriginalFormationTarget(pool, address, {
    vectors,
    sideBases: [20 | (20 << 8), 40 | (20 << 8)],
    commandChanged: true,
  });
  assert.equal(result.vectorIndex, 0);
  assert.deepEqual([result.dx, result.dy], [-2, 0]);
  assert.deepEqual([result.targetX, result.targetY], [18, 20]);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.POSITION_LEVEL), 0);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = originalObjectAddress(1, 0, 0);
  const result = applyOriginalFormationTarget(pool, address, {
    vectors,
    sideBases: [20 | (20 << 8), 40 | (20 << 8)],
  });
  assert.deepEqual([result.dx, result.dy], [2, 0], "side1 mirrors dx only");
  assert.deepEqual([result.targetX, result.targetY], [42, 20]);
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(0, 2, 0);
  const child = originalObjectAddress(0, 2, 3);
  pool.write8(leader, ORIGINAL_OBJECT.TARGET_X, 1);
  pool.write8(leader, ORIGINAL_OBJECT.TARGET_Y, 2);
  const result = applyOriginalFormationTarget(pool, child, {
    vectors,
    baseMode: "leader-target",
  });
  assert.equal(result.vectorIndex, 19);
  assert.equal(result.baseAddress, leader);
  assert.deepEqual([result.targetX, result.targetY], [1, 1]);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = originalObjectAddress(0, 5, 7);
  assert.throws(
    () =>
      applyOriginalFormationTarget(pool, address, {
        vectors,
        sideOffsets: [2, 0],
        sideBases: [0x2020, 0x2020],
      }),
    /outside exported table/,
    "nonzero selector must not wrap the exported 48-vector window",
  );
}

process.stdout.write(
  "battle original formation OK: AA2C/AA7E vector indexing + side mirror + clamp\n",
);
