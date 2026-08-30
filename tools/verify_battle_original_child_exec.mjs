import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { executeOriginalChild } = await import(
  "../web/src/game/battle/originalexecutor.js"
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

const pool = new OriginalBattleObjectPool();
const child = originalObjectAddress(0, 2, 3);
const enemy = originalObjectAddress(1, 0, 0);
pool.write8(child, ORIGINAL_OBJECT.FLAGS, 0x80);
pool.write8(child, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
pool.write8(child, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
pool.write8(child, ORIGINAL_OBJECT.ANCHOR_X, 20);
pool.write8(child, ORIGINAL_OBJECT.ANCHOR_Y, 20);
pool.write8(child, ORIGINAL_OBJECT.POSITION_LEVEL, 5);
pool.write8(enemy, ORIGINAL_OBJECT.FLAGS, 0x80);
pool.write8(enemy, ORIGINAL_OBJECT.ANCHOR_X, 40);
pool.write8(enemy, ORIGINAL_OBJECT.ANCHOR_Y, 20);

const result = executeOriginalChild(pool, child, {
  formation: {
    vectors: rules.formationVectors,
    sideBases: [30 | (30 << 8), 34 | (30 << 8)],
  },
});
assert.equal(result.command, 0);
assert.equal(result.changed, true);
assert.equal(result.formationTarget.vectorIndex, 19);
assert.equal(pool.read8(child, ORIGINAL_OBJECT.POSITION_LEVEL), 0);
assert.deepEqual(
  [
    pool.read8(child, ORIGINAL_OBJECT.TARGET_X),
    pool.read8(child, ORIGINAL_OBJECT.TARGET_Y),
  ],
  [30 + rules.formationVectors[19][0], 30 + rules.formationVectors[19][1]],
);
assert.equal(pool.read8(child, ORIGINAL_OBJECT.CURRENT_COMMAND), 0);
assert.equal(
  pool.read8(child, ORIGINAL_OBJECT.PENDING_COMMAND),
  0,
  "AI cmd0 does not switch to player idle command7 on arrival",
);

assert.throws(
  () => executeOriginalChild(pool, originalObjectAddress(0, 2, 0)),
  /requires a child slot/,
);

process.stdout.write(
  "battle original child exec OK: A7FD transition + AI cmd0 AA2C target\n",
);
