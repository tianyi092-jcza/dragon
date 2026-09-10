// Production BD46/AED2/B00D/AF65 regression, adapted from independent review.
// Actual exported VM + production IO; no rule handlers/builders are stubbed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const moduleAt = (p) => import(pathToFileURL(`${root}/web/src/${p}`).href);
const { createFieldBattle, advanceOriginalScriptFrame } = await moduleAt(
  "game/tacticalbattle.js",
);
const { ORIGINAL_OBJECT: O } = await moduleAt("game/battle/originalstate.js");
const { createOriginalPathBuilder } = await moduleAt(
  "game/battle/originalpathfinder.js",
);
const json = (name) => {
  try {
    return JSON.parse(fs.readFileSync(`${root}/web/${name}.json`, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const maps = json("battle_maps");
maps.navigation = json("battle_navigation");
maps.formationVectors = json("battle_rules").formationVectors;
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
const make = () =>
  createFieldBattle(sc, legion(0), legion(1), maps, { directoryIndex: 0xc0 });
const { BattleView } = await moduleAt("render/battleview.js");
const scripts = json("battle_scripts");
function place(s, a, x, y, plane = 0) {
  for (const [k, v] of [
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
    [O.LEVEL, plane ? 2 : 0],
    [O.PREVIOUS_LEVEL, plane ? 2 : 0],
    [O.POSITION_X, x],
    [O.POSITION_Y, y],
  ])
    s.pool.write8(a, k, v);
  s.pool.write16(a, O.TARGET_X, x | (y << 8));
  s.pool.write16(a, O.SPATIAL_0C, (plane ? 0x2000 : 0) + y * 64 + x);
  s.pool.write16(a, O.SPATIAL_0E, (plane ? 0x2000 : 0) + y * 64 + x);
}
for (const plane of [0, 0x10]) {
  const battle = make(),
    s = battle.session;
  const notifications = [];
  const view = {
    battle,
    app: {
      battleScripts: scripts,
      hud: {
        flashEvent(message) {
          notifications.push(message);
        },
      },
    },
  };
  BattleView.prototype.startBattleScript.call(view);
  const vm = view.battleScriptVm;
  assert.equal(notifications.length, 1);
  s.pool.bytes.fill(0);
  s.temps.bytes.fill(0);
  s.effects.bytes.fill(0);
  s.spatial.bytes.fill(0);
  s.spatial.tiles.fill(1);
  s.spatial.tileAttributes.fill(0);
  s.registers.side0Active = 2;
  s.registers.side1Active = 1;
  s.registers.winnerState = 0;
  s.registers.mode = 1;
  for (const p of [0, 0x1000])
    for (let x = 1; x <= 4; x++)
      s.spatial.write8(
        0x7000 + p + 64 + x,
        (x > 1 ? 0x10 : 0) | (x < 4 ? 0x20 : 0) | (p ? 2 : 0),
      );
  // First actual production frame puts the occupant's surcharge at corridor x3.
  // Both leaders are off-corridor so its ONLY nonzero cost is x3.
  place(s, 0, 20, 20);
  place(s, 0x600, 30, 30);
  place(s, 0x20, 3, 1, plane);
  const request = {
    current: 0x101,
    target: 0x104,
    layer: plane,
    mask: plane ? 0x74 : 0xeb,
    endpointPolicy: plane ? 0 : 1,
  };
  const oldInput = createOriginalPathBuilder(
    Uint8Array.from(s.spatial.navigationBytes()),
  );
  const before = oldInput(request),
    rng = s.rng.snapshot();
  advanceOriginalScriptFrame(battle, vm);
  assert.equal(s.spatial.read8((plane ? 0xa000 : 0x9000) + 0x43), 8);
  assert.equal(
    s.pool.read8(0x20, O.STATE),
    1,
    "exactly one B240 phase transition",
  );
  const live = battle.originalPathBuilder(request);
  assert.deepEqual(before, {
    carry: false,
    words: [0x104],
    distance: 5,
    visited: 4,
  });
  assert.deepEqual(live, {
    carry: false,
    words: [0x103, 0x104],
    distance: 13,
    visited: 4,
  });
  assert.deepEqual(
    oldInput(request),
    before,
    "old detached navigation does not see B240 writes",
  );

  // Restore copies spatial bytes and keeps facade builder bound to its same buffer.
  const snapshot = s.snapshot(),
    twin = make();
  twin.session.restore(snapshot);
  s.finalizeObject(0x20);
  assert.equal(battle.originalPathBuilder(request).carry, false);
  assert.deepEqual(twin.originalPathBuilder(request), live);
  assert.equal(snapshot.spatialBytes[(plane ? 0xa000 : 0x9000) + 0x43], 8);
  s.restore(snapshot);
  assert.deepEqual(battle.originalPathBuilder(request), live);
  assert.notEqual(s.spatial.bytes, twin.session.spatial.bytes);
  assert.notEqual(
    s.spatial.tileAttributes,
    twin.session.spatial.tileAttributes,
  );

  // Arrange source current after prior B240; no added surcharge at start until
  // after AED2, matching the literal raw fixture at the instant of its search.
  place(s, 0, 1, 1, plane);
  s.pool.write8(0, O.CLASS, plane ? 0x24 : 0);
  s.pool.write16(0, O.TARGET_X, 0x104);
  s.enqueuePath(0);
  advanceOriginalScriptFrame(battle, vm);
  const event = battle.originalLastEvents.find((e) => e.type === "path-frames");
  assert.ok(event, "actual facade must execute queued AED2");
  const path = event.paths.find((p) => p.address === 0);
  assert.deepEqual(path.built, live);
  assert.deepEqual(path.first, { carry: false, exhausted: false, word: 0x103 });
  assert.equal(s.pool.read8(0, O.PATH_REMAINING), 1);
  assert.equal(s.pool.read16(0, O.POSITION_X), 0x103);
  assert.equal(s.pool.read8(0, O.PATH_OFFSET), 2);
  assert.equal(
    s.paths.head,
    s.paths.tail,
    "successful reachable request was dequeued",
  );
  assert.deepEqual(
    s.rng.snapshot(),
    rng,
    "new writes/search/queue consume zero RNG",
  );
  // Remove the occupant through the real B3B2 path, then allow AF69 movement.
  // Compressed x3 -> x4 words are not expanded by the queue: AF99 re-enters
  // AF65 (AH0) and moves to x4 in the same frame as consuming word 2.
  s.finalizeObject(0x20);
  for (const expectedX of [2, 3, 4]) {
    advanceOriginalScriptFrame(battle, vm);
    assert.equal(s.pool.read8(0, O.ANCHOR_X), expectedX);
    assert.equal(s.pool.read8(0, O.PATH_OFFSET), expectedX === 4 ? 4 : 2);
    assert.equal(s.pool.read8(0, O.PATH_REMAINING), expectedX === 4 ? 0 : 1);
  }
  advanceOriginalScriptFrame(battle, vm);
  assert.equal(
    s.pool.read8(0, O.PATH_REMAINING),
    0,
    "B00D exhausted clamps zero",
  );
  assert.equal(
    s.pool.read8(0, O.PATH_OFFSET),
    4,
    "exhausted does not read another word",
  );
  assert.deepEqual(s.rng.snapshot(), rng);
  assert.equal(vm.pc, 2, "real BATTLE.DAT op16 then WAIT executed");
  assert.equal(vm.wait, 11, "real VM decremented during movement");
  console.log(
    `BD46 live plane ${plane}: CF0 [0103,0104], AED2 first=0103, AF65 same-frame second consumption, snapshot/RNG invariant`,
  );
}
