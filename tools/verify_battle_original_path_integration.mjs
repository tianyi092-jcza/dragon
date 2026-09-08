import assert from "node:assert/strict";

const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
);
const { buildOriginalPath } = await import(
  "../web/src/game/battle/originalpathfinder.js"
);

const session = new OriginalBattleSession({
  objectBytes: new Uint8Array(0xc00),
  registers: { side0Active: 1, side1Active: 1, mode: 1 },
});
const address = originalObjectAddress(0, 0, 1);
session.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
session.pool.write8(address, ORIGINAL_OBJECT.CLASS, 1);
session.pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 1);
session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 1); // AEF9 reads +8, not previousX +7.
session.pool.write8(address, ORIGINAL_OBJECT.TARGET_X, 4);
session.pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, 1);
session.enqueuePath(address);

const navigation = new Uint8Array(0x3000);
for (let x = 1; x <= 4; x++) {
  const index = 0x40 + x;
  navigation[index] = (x > 1 ? 0x10 : 0) | (x < 4 ? 0x20 : 0) | 1;
}
const result = session.tick({
  updateObject() {},
  objectHandlers: {
    buildPath: (request) => buildOriginalPath(navigation, request),
  },
  recountActivity: () => ({
    side0Active: 1,
    side1Active: 1,
    side0Timed: 0,
    side1Timed: 0,
  }),
});
const pathEvent = result.events.find((event) => event.type === "path-frames");
assert.ok(pathEvent);
assert.equal(pathEvent.paths[0].built.carry, false);
assert.deepEqual(pathEvent.paths[0].built.words, [0x0104]); // Raw BE75 compression.
assert.equal(session.pool.read16(address, ORIGINAL_OBJECT.POSITION_X), 0x0104);
assert.equal(session.pool.read8(address, ORIGINAL_OBJECT.PATH_REMAINING), 0);
assert.equal(session.rng.calls, 0);

process.stdout.write(
  "battle original path integration OK: AED2 consumes BD46 builder on fixed frame\n",
);
