import assert from "node:assert/strict";
import fs from "node:fs";
import {
  advanceOriginalScriptFrame,
  createFieldBattle,
  queueTacticalCommand,
  queueTacticalPanelInput,
  tacticalPanelState,
} from "../web/src/game/tacticalbattle.js";
import { OriginalBattleSession } from "../web/src/game/battle/originalsession.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import { applyOriginalPanelInput } from "../web/src/game/battle/originalcommands.js";
import { BattleScript } from "../web/src/game/battlescript.js";
import { BattleView } from "../web/src/render/battleview.js";

const json = (name) => {
  try {
    return JSON.parse(
      fs.readFileSync(new URL(`../web/${name}.json`, import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const maps = json("battle_maps");
maps.navigation = json("battle_navigation");
maps.formationVectors = json("battle_rules").formationVectors;
const scenario = {
  player_faction: 0,
  generals: ["P", "E"].map((name) => ({
    name,
    battle_formation: 0,
    ability: { force: 70, lead: 70, field: 4 },
  })),
};
const legion = (faction) => ({
  leader: faction ? "E" : "P",
  faction,
  morale: 180,
  troops: 6000,
  units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
});
function fixture() {
  return createFieldBattle(scenario, legion(0), legion(1), maps, {
    directoryIndex: 0xc0,
    terrainClass: 0,
    mirror: false,
  });
}
function consume(handle, check) {
  advanceOriginalScriptFrame(handle, {
    step() {
      check();
      return "run";
    },
  });
}
function panelIO(battle) {
  const view = {
    battle,
    app: {
      battleScripts: Array.from({ length: 32 }, () => [0]),
      hud: { flashEvent() {} },
    },
  };
  BattleView.prototype.startBattleScript.call(view);
  return view.battleScriptVm.io;
}
const pending = (session, side = 0) =>
  Array.from({ length: 6 }, (_, g) =>
    session.pool.read8(side * 0x600 + g * 0x100, O.PENDING_COMMAND),
  );

// C11A selects one of all 16 vector blocks, before op3/A50D reads D346.
for (let index = 0; index < 16; index++) {
  const battle = fixture();
  const before = battle.session.pool.snapshot();
  const rng = battle.session.rng.snapshot();
  queueTacticalPanelInput(battle, { type: "formation-select", index });
  assert.equal(battle.session.registers.selectedFormation, 0);
  assert.equal(tacticalPanelState(battle).selectedFormation, index);
  assert.deepEqual(battle.session.pool.snapshot(), before);
  consume(battle, () => {
    assert.equal(battle.session.registers.selectedFormation, index);
    assert.equal(battle.session.registers.side0FormationOffset, index * 0x60);
    assert.equal(panelIO(battle).d346(), index);
    assert.deepEqual(
      battle.session.pool.snapshot(),
      before,
      "shape selection sends NO command0 or other object write",
    );
    assert.deepEqual(battle.session.rng.snapshot(), rng);
  });
  const [dx, dy] = maps.formationVectors[index * 48];
  const base = battle.session.registers.side0FormationBase;
  const signed = (value) => (value & 0x80 ? (value & 0xff) - 256 : value);
  const clamp = (value) => Math.max(1, Math.min(62, value));
  assert.equal(
    battle.session.pool.read8(0, O.TARGET_X),
    clamp((base & 0xff) + signed(dx)),
    "AA2C consumes the selected block in the same frame",
  );
  assert.equal(
    battle.session.pool.read8(0, O.TARGET_Y),
    clamp((base >>> 8) + signed(dy)),
  );
}
// AA46 end-consumer coverage: all deployments/shapes, leaders + child, restored session.
const signedVector = (v) => (v & 0x80 ? (v & 0xff) - 256 : v);
const clampTarget = (v) => Math.max(1, Math.min(62, v));
function assertTargets(battle, side, shape, baseX, baseY) {
  for (const local of [0, 0x20, 0x100, 0x200, 0x300, 0x400, 0x500]) {
    const address = side * 0x600 + local;
    assert.ok(battle.session.pool.isActive(address));
    const [dx, dy] = maps.formationVectors[shape * 48 + local / 32];
    assert.equal(
      battle.session.pool.read8(address, O.TARGET_X),
      clampTarget(baseX + (side ? -1 : 1) * signedVector(dx)),
      `AA2C X side${side}/shape${shape}/slot${local}`,
    );
    assert.equal(
      battle.session.pool.read8(address, O.TARGET_Y),
      clampTarget(baseY + signedVector(dy)),
      "AA2C preserves custom base Y",
    );
  }
}
for (const restore of [false, true])
  for (const index of Array.from({ length: 16 }, (_, i) => i))
    for (const baseX of [0x30, 0x1c, 0x05]) {
      const battle = fixture();
      battle.session.registers.side0FormationBase = 0x2a05;
      queueTacticalPanelInput(battle, { type: "formation-select", index });
      queueTacticalPanelInput(battle, { type: "deployment-select", baseX });
      if (restore)
        battle.session = new OriginalBattleSession().restore(
          battle.session.snapshot(),
        );
      const before = battle.session.pool.snapshot();
      const rng = battle.session.rng.snapshot();
      consume(battle, () => {
        assert.equal(
          battle.session.registers.side0FormationBase,
          0x2a00 | baseX,
        );
        assert.equal(panelIO(battle).d33c(), baseX);
        assert.deepEqual(battle.session.pool.snapshot(), before);
        assert.deepEqual(battle.session.rng.snapshot(), rng);
      });
      assertTargets(battle, 0, index, baseX, 42);
      queueTacticalCommand(battle, { command: "formation" });
      advanceOriginalScriptFrame(battle, {
        step() {
          return "run";
        },
      });
      assertTargets(battle, 0, index, baseX, 42);
    }
for (const [operand, baseX] of [
  [0, 58],
  [1, 36],
  [2, 16],
]) {
  const battle = fixture();
  battle.session.registers.side1FormationBase = 0x2a3a;
  const vm = new BattleScript([(operand << 8) | 2], panelIO(battle));
  advanceOriginalScriptFrame(battle, vm); // actual A4AB -> AA56, not direct register injection
  assert.equal(battle.session.registers.side1FormationBase, 0x2a00 | baseX);
  assertTargets(battle, 1, 0, baseX, 42);
}
// Web snapshot contract: input/snapshot/restored arrays cannot rewrite another queue.
{
  const battle = fixture();
  const groups = [2];
  battle.session.enqueue({
    type: "tactical-command",
    frame: 0,
    groups,
    commandNumber: 1,
  });
  groups[0] = 0;
  const snapshot = battle.session.snapshot();
  const replay = fixture();
  replay.session = new OriginalBattleSession().restore(snapshot);
  replay.session.queue.commands[0].groups[0] = 5;
  snapshot.commands[0].groups[0] = 4;
  assert.deepEqual(battle.session.queue.commands[0].groups, [2]);
  assert.deepEqual(replay.session.queue.commands[0].groups, [5]);
  for (const [handle, selected] of [
    [battle, 2],
    [replay, 5],
  ])
    consume(handle, () => {
      assert.deepEqual(
        pending(handle.session),
        Array.from({ length: 6 }, (_, i) => (i === selected ? 1 : 0)),
      );
    });
}
for (const groups of [[2], [0, 2, 5], []]) {
  const battle = fixture();
  const before = battle.session.pool.snapshot();
  const rng = battle.session.rng.snapshot();
  for (const group of groups)
    queueTacticalPanelInput(battle, { type: "group-toggle", group });
  queueTacticalCommand(battle, { command: "attack" });
  assert.equal(tacticalPanelState(battle).selectedGroupMask, 0);
  assert.equal(battle.session.registers.selectedGroupMask, 0);
  consume(battle, () => {
    const expected = [...before];
    for (const g of groups.length ? groups : [0, 1, 2, 3, 4, 5])
      expected[g * 0x100 + O.PENDING_COMMAND] = 1;
    assert.deepEqual(
      battle.session.pool.snapshot(),
      expected,
      "C1B9 writes ONLY selected leader pending, no flags/children",
    );
    assert.equal(battle.session.registers.selectedGroupMask, 0);
    assert.deepEqual(battle.session.rng.snapshot(), rng);
  });
}
{
  const battle = fixture();
  queueTacticalPanelInput(battle, { type: "group-toggle", group: 2 });
  queueTacticalPanelInput(battle, { type: "group-toggle", group: 4 });
  queueTacticalPanelInput(battle, { type: "group-toggle", group: 2 });
  assert.equal(
    tacticalPanelState(battle).selectedGroupMask,
    1 << 4,
    "six cards XOR, not single-selection",
  );
  queueTacticalCommand(battle, { command: "defend" });
  queueTacticalCommand(battle, { command: "assault" });
  consume(battle, () =>
    assert.deepEqual(
      pending(battle.session),
      [2, 2, 2, 2, 2, 2],
      "second command sees cleared mask = all",
    ),
  );
}
for (const winnerState of [0, 1, 2]) {
  const battle = fixture();
  battle.session.registers.winnerState = winnerState;
  battle.session.registers.selectedGroupMask = 0x24;
  const before = pending(battle.session);
  queueTacticalCommand(battle, { command: "wall" });
  consume(battle, () => {
    assert.deepEqual(
      pending(battle.session),
      before,
      "AB4F=0 rejects wall writes",
    );
    assert.equal(
      battle.session.registers.selectedGroupMask,
      winnerState === 1 ? 0x24 : 0,
      "C1B9 winner gate precedes xchg; AB4F gate follows it",
    );
  });
}
for (const winnerState of [0, 1, 2]) {
  const battle = fixture();
  battle.session.registers.winnerState = winnerState;
  battle.session.registers.selectedGroupMask = 0x24;
  const before = pending(battle.session);
  queueTacticalCommand(battle, { command: "retreat" });
  consume(battle, () => {
    assert.deepEqual(
      pending(battle.session),
      winnerState === 0 ? [5, 5, 5, 5, 5, 5] : before,
    );
    assert.equal(battle.session.registers.winnerState, winnerState || 1);
    assert.equal(
      battle.session.registers.selectedGroupMask,
      winnerState === 0 ? 0 : 0x24,
    );
  });
}

function iconSession() {
  const session = new OriginalBattleSession({ objectsInitialized: true });
  for (let side = 0; side < 2; side++)
    for (let g = 0; g < 6; g++) {
      const address = side * 0x600 + g * 0x100;
      for (const [field, value] of [
        [O.FLAGS, 0x80],
        [O.HP, 180],
        [O.ANCHOR_X, side ? 40 : 20],
        [O.ANCHOR_Y, 20],
        [O.CURRENT_COMMAND, 8],
        [O.PENDING_COMMAND, 8],
      ])
        session.pool.write8(address, field, value);
    }
  return session;
}
const iconTick = (session) => session.tick({ updateMovement() {} });
{
  const session = iconSession();
  for (let g = 0; g < 6; g++)
    session.pool.write8(g * 0x100, O.PENDING_COMMAND, g);
  iconTick(session);
  assert.deepEqual(
    session.playerGroupStatusIcons,
    [0, 1, 2, 3, 4, 5],
    "A8CC/C673 update only accepted player group commands",
  );
  for (const continuation of [6, 7, 8]) {
    for (let g = 0; g < 5; g++)
      session.pool.write8(g * 0x100, O.PENDING_COMMAND, continuation);
    iconTick(session);
    assert.deepEqual(
      session.playerGroupStatusIcons,
      [0, 1, 2, 3, 4, 5],
      "internal continuations retain the last displayed icon; current5 is sticky",
    );
  }
  const saved = session.snapshot();
  const restored = new OriginalBattleSession().restore(saved);
  assert.deepEqual(restored.playerGroupStatusIcons, [0, 1, 2, 3, 4, 5]);
  restored.playerGroupStatusIcons[0] = 4;
  assert.equal(
    saved.playerGroupStatusIcons[0],
    0,
    "status snapshots do not alias",
  );
}
{
  const session = iconSession();
  session.pool.write8(0, O.CURRENT_COMMAND, 1);
  session.pool.write8(0, O.PENDING_COMMAND, 1);
  session.pool.write8(0x20, O.PENDING_COMMAND, 8);
  session.playerGroupStatusIcons[0] = 1;
  iconTick(session);
  assert.equal(
    session.pool.read8(0x20, O.PENDING_COMMAND),
    8,
    "reissuing same attack does not broadcast children early",
  );
  session.pool.write8(0, O.PENDING_COMMAND, 2);
  iconTick(session);
  assert.equal(
    session.pool.read8(0x20, O.PENDING_COMMAND),
    2,
    "actual A7B7 transition broadcasts inactive children",
  );
  assert.equal(session.pool.read8(0x20, O.FLAGS) & 8, 8);
}
{
  const visible = iconSession(),
    hidden = iconSession();
  applyOriginalPanelInput(hidden.registers, {
    type: "battlefield-display-toggle",
  });
  hidden.registers.mapRedraw = 1;
  const events = iconTick(hidden).events;
  iconTick(visible);
  assert.equal(
    hidden.registers.mapRedraw,
    1,
    "patched A06A skips redraw AND clear",
  );
  assert.ok(!events.some((event) => event.type === "map-redraw"));
  assert.equal(hidden.frame, visible.frame);
  assert.deepEqual(hidden.pool.snapshot(), visible.pool.snapshot());
  assert.deepEqual(
    hidden.rng.snapshot(),
    visible.rng.snapshot(),
    "display suppression does not change frame/RNG semantics",
  );
  applyOriginalPanelInput(hidden.registers, {
    type: "battlefield-display-toggle",
  });
  assert.ok(
    iconTick(hidden).events.some((event) => event.type === "map-redraw"),
  );
  assert.equal(hidden.registers.mapRedraw, 0);
}
console.log(
  "battle command panel OK: 16 shapes, 3 bases, ordered mask/leader writes, retreat gates, retained icons, display-only double arrow",
);
