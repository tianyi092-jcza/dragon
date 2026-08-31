import assert from "node:assert/strict";

const { createFieldBattle, settleVisualBattle } = await import(
  "../web/src/game/tacticalbattle.js"
);
const { resolveStrategicBattle } = await import(
  "../web/src/game/autobattle.js"
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);

const units = [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 }));
const sc = {
  player_faction: 0,
  generals: [
    { idx: 0, name: "甲", ability: { force: 8, lead: 7, field: 4, siege: 4, naval: 0 } },
    { idx: 1, name: "乙", ability: { force: 7, lead: 9, field: 3, siege: 3, naval: 0 } },
  ],
};
const A = { leader: "甲", faction: 0, troops: 600, morale: 200, units: structuredClone(units), formation: 1 };
const D = { leader: "乙", faction: 1, troops: 600, morale: 180, units: structuredClone(units), formation: 1 };
const battleMaps = {
  layouts: { 1: Array(4096).fill(0) },
  directory: [{ idx: 0xc0, layout: 1, theme: 0 }],
  navigation: {
    layouts: {
      "1": {
        tiles: Array(4096).fill(0),
        attributes: Array(0xf800).fill(0),
        schedule: Array(0x100).fill(0),
      },
    },
  },
};
const fieldTerrain = { directoryIndex: 0xc0, mirror: false };
const canonical = new OriginalBattleRng({ ch: 3, cl: 4, dh: 5 });
canonical.nextByte();
const startingSnapshot = canonical.snapshot();
const battle = createFieldBattle(
  sc,
  A,
  D,
  battleMaps,
  fieldTerrain,
  startingSnapshot,
);
assert.ok(
  battle.session.rng.calls > startingSnapshot.calls,
  "tactical initialization continues from canonical RNG and consumes it",
);
assert.equal(battle.session.rng.addend !== startingSnapshot.addend, true);

// 构造可结算退出；退出返回的stream成为后续战略速算/存档canonical状态。
battle.session.finished = true;
battle.session.winner = 0;
battle.session.registers.winnerState = 0;
const exit = settleVisualBattle(battle);
const app = { originalRng: exit.strategicRng, activeBattleRng: exit.strategicRng };
assert.equal(app.originalRng, app.activeBattleRng);
const beforeStrategic = app.originalRng.calls;
resolveStrategicBattle(sc, A, D, { mode: 1, rng: app.originalRng });
assert.ok(app.originalRng.calls > beforeStrategic);
const saveSnapshot = app.originalRng.snapshot();
const replay = new OriginalBattleRng().restore(saveSnapshot);
assert.equal(replay.nextByte(), app.originalRng.nextByte());

process.stdout.write(
  "tactical RNG continuity OK: canonical snapshot -> tactical -> strategic -> save snapshot\n",
);
