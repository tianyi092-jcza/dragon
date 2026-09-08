// Real BattleView DOM-listener path with production Session/input/A7 execution.
// Fake DOM/time only; original command/TALK/formation rules are not stubbed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { BattleDialoguePresentation } from "../web/src/ui/battledialogue.js";
import { createFieldBattle } from "../web/src/game/tacticalbattle.js";
import { ORIGINAL_OBJECT as O } from "../web/src/game/battle/originalstate.js";
import { BattleView } from "../web/src/render/battleview.js";

const json = (name) => {
  try {
    return JSON.parse(fs.readFileSync(`web/${name}.json`, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${name}.json`, { cause: error });
  }
};
const maps = json("battle_maps");
maps.navigation = json("battle_navigation");
maps.formationVectors = json("battle_rules").formationVectors;
const catalog = json("battle_talk");
const generals = Array.from({ length: 128 }, (_, idx) => ({
  idx,
  name: `將${idx}`,
  portrait: idx,
  talk_idx: 0,
  battle_formation: 0,
  ability: { force: 70, lead: 70, field: 4, siege: 4 },
}));
const scenario = {
  player_faction: 0,
  generals,
  factions: [{ monarch: "我君" }, { monarch: "敵君" }],
};
const legion = (faction, slot) => ({
  faction,
  slot,
  generalIdx: slot,
  leader: generals[slot].name,
  morale: 180,
  troops: 6000,
  units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
});

const generic = () => ({
  dataset: {},
  style: { setProperty() {}, removeProperty() {} },
  textContent: "",
  disabled: false,
  handlers: {},
  classList: { toggle() {} },
  addEventListener(type, handler) {
    this.handlers[type] = handler;
  },
  setAttribute(name, value) {
    this[name] = value;
  },
  removeAttribute(name) {
    this[name] = "";
  },
  querySelector() {
    return generic();
  },
});
const controls = new Map();
for (const id of [
  "bassault",
  "battack",
  "bformation",
  "bwall",
  "bdefend",
  "bretreat",
  "bctl",
  "battle-bottom-bar",
  "btitle",
  "bbelligerents",
  "batkname",
  "bdefname",
  "batktroops",
  "bdeftroops",
  "batkmorale",
  "bdefmorale",
  "batk-troops-fill",
  "batk-morale-fill",
  "bdef-troops-fill",
  "bdef-morale-fill",
  "bcommandhint",
  "bdialogue-atk",
  "bdialogue-atk-face",
  "bdialogue-atk-name",
  "bdialogue-atk-text",
  "bdialogue-def",
  "bdialogue-def-face",
  "bdialogue-def-name",
  "bdialogue-def-text",
  "bunit0",
  "bunit1",
  "bunit2",
  "bunit3",
  "bunit4",
  "bunit5",
])
  controls.set(`#${id}`, generic());
const formations = Array.from({ length: 16 }, (_, index) => {
  const value = generic();
  value.dataset.formation = String(index);
  return value;
});
const deployments = [48, 28, 5].map((baseX) => {
  const value = generic();
  value.dataset.baseX = String(baseX);
  return value;
});
for (let index = 0; index < 6; index++) {
  const status = generic();
  const fill = generic();
  controls.get(`#bunit${index}`).querySelector = (selector) =>
    selector === ".battle-card-status"
      ? status
      : selector === ".battle-card-troops-fill"
        ? fill
        : generic();
}
const context = new Proxy(
  {},
  {
    get(target, key) {
      return target[key] ?? (() => {});
    },
  },
);
globalThis.document = {
  hidden: false,
  createElement() {
    return { width: 0, height: 0, getContext: () => context };
  },
  querySelector(selector) {
    return controls.get(selector) ?? generic();
  },
  querySelectorAll(selector) {
    if (selector === ".battle-symbol-btn") return formations;
    if (selector === ".battle-deployment-btn") return deployments;
    return [];
  },
};
globalThis.window = {};
globalThis.Image = class {};
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
const canvas = () => ({
  width: 1024,
  height: 768,
  style: {},
  getContext: () => context,
  addEventListener() {},
  releasePointerCapture() {},
});

function interactionFixture() {
  const battle = createFieldBattle(scenario, legion(0, 2), legion(1, 3), maps, {
    directoryIndex: 0xc0,
    terrainClass: 0,
    mirror: false,
  });
  battle.session.messages.catalog = catalog;
  battle.session.registers.themeFlag = 1;
  for (let group = 0; group < 6; group++) {
    const address = group * 0x100;
    battle.session.pool.write8(address, O.FLAGS, 0x80);
    battle.session.pool.write8(address, O.CURRENT_COMMAND, 8);
    battle.session.pool.write8(address, O.PENDING_COMMAND, 8);
  }
  battle.session.playerGroupStatusIcons.fill(4);
  const app = {
    scenario,
    tacticalSpeed: 5,
    clock: { hold: false },
    hud: { flashEvent() {} },
    battleMaps: maps,
  };
  const view = new BattleView(canvas(), app);
  view.active = true;
  view.battle = battle;
  view.battleStartup = null;
  view.battleScriptVm = {
    step() {
      return "run";
    },
  };
  // This listener fixture bypasses BattleView.open/raw asset loading.
  view.composeBattlefield = () => {};
  view.commitNativeDisplay = () => {};
  const visible = [null, null];
  view.dialoguePresentation = new BattleDialoguePresentation({
    show(capture) {
      visible[capture.side] = capture;
    },
    hide(side) {
      visible[side] = null;
    },
  });
  view.dialoguePresentation.start(
    battle.session.events,
    battle.session.messages.slots,
  );
  return { battle, view, visible };
}

const commands = [
  ["#bassault", 2, 0x1b3],
  ["#battack", 1, 0x1b2],
  ["#bformation", 0, 0x1b1],
  ["#bwall", 3, 0x1b4],
  ["#bdefend", 4, 0x1b5],
  ["#bretreat", 5, 0x1af],
];
for (const [selector, command, talkSelector] of commands) {
  const { battle, view, visible } = interactionFixture();
  const rngBefore = battle.session.rng.snapshot();
  const holdBefore = view.app.clock.hold;
  controls.get("#bunit0").handlers.click(); // displayed left wing => raw group2
  controls.get(selector).handlers.click();
  assert.deepEqual(
    battle.session.rng.snapshot(),
    rngBefore,
    "pointer listeners consume no RNG",
  );
  assert.equal(
    view.app.clock.hold,
    holdBefore,
    "dialogue/command listeners do not change strategic hold",
  );
  assert.equal(
    battle.session.events.filter((event) => event.type === "tactical-talk-show")
      .length,
    0,
    `${selector}: DOM click queues input but does not pre-emit TALK`,
  );
  assert.deepEqual(
    battle.session.playerGroupStatusIcons,
    [4, 4, 4, 4, 4, 4],
    `${selector}: pointer acceptance does not pre-empt A8CC/C673 icon refresh`,
  );
  const beforeFrame = battle.session.frame;
  view.updateBattleFrames(0.05);
  assert.equal(
    battle.session.frame,
    beforeFrame + 1,
    `${selector}: accepted input still runs A426/A065`,
  );
  const talks = battle.session.events.filter(
    (event) =>
      event.type === "tactical-talk-show" &&
      event.message.source === "C1B9/C21A",
  );
  assert.equal(talks.length, 1, `${selector}: one native general TALK`);
  assert.equal(talks[0].message.selector, talkSelector);
  view.syncBattleDialogue();
  assert.ok(visible[0], `${selector}: decoded player dialogue displayed`);
  if (command === 5)
    assert.deepEqual(battle.session.playerGroupStatusIcons, [5, 5, 5, 5, 5, 5]);
  else {
    assert.equal(battle.session.playerGroupStatusIcons[2], command);
    for (const group of [0, 1, 3, 4, 5])
      assert.equal(battle.session.playerGroupStatusIcons[group], 4);
  }
  const pending = battle.session.pool.read8(0x200, O.PENDING_COMMAND);
  const rngAtDismiss = battle.session.rng.snapshot();
  view.dismissBattleDialogue();
  assert.equal(visible[0], null, `${selector}: right-click presentation close`);
  assert.deepEqual(
    battle.session.rng.snapshot(),
    rngAtDismiss,
    "right-click close consumes no RNG",
  );
  assert.equal(
    view.app.clock.hold,
    holdBefore,
    "right-click close does not add/remove hold",
  );
  assert.equal(
    battle.session.pool.read8(0x200, O.PENDING_COMMAND),
    pending,
    "dismiss does not cancel command",
  );
  assert.equal(
    battle.session.playerGroupStatusIcons[command === 5 ? 0 : 2],
    command,
  );
  const frameAtDismiss = battle.session.frame;
  view.updateBattleFrames(0.05);
  assert.equal(
    battle.session.frame,
    frameAtDismiss + 1,
    "dismiss/timer never pauses tactical time",
  );
}

{
  // A second real button remains actionable while the first decoded window is
  // present. It replaces only presentation after its own C315 confirmation.
  const { battle, view, visible } = interactionFixture();
  controls.get("#bunit0").handlers.click();
  controls.get("#battack").handlers.click();
  view.updateBattleFrames(0.05);
  view.syncBattleDialogue();
  assert.equal(visible[0]?.selector, 0x1b2);
  const firstTalkCount = battle.session.events.filter(
    (event) => event.type === "tactical-talk-show",
  ).length;
  controls.get("#bunit1").handlers.click();
  controls.get("#bassault").handlers.click();
  assert.equal(
    battle.session.playerGroupStatusIcons[4],
    4,
    "icon waits at A8CC boundary",
  );
  view.updateBattleFrames(0.05);
  view.syncBattleDialogue();
  assert.equal(battle.session.playerGroupStatusIcons[4], 2);
  assert.equal(
    visible[0]?.selector,
    0x1b3,
    "active dialogue does not block next command listener",
  );
  assert.equal(
    battle.session.events.filter((event) => event.type === "tactical-talk-show")
      .length,
    firstTalkCount + 1,
    "active-panel command emits exactly one additional native TALK",
  );
  assert.equal(view.app.clock.hold, false);
}

// All sixteen live listeners write D346/D342 without TALK. Multiple shapes then
// feed AA2C targets and actual movement only after command0 is accepted.
for (let index = 0; index < 16; index++) {
  const { battle, view } = interactionFixture();
  const talkCount = battle.session.events.filter(
    (event) => event.type === "tactical-talk-show",
  ).length;
  formations[index].handlers.click();
  assert.equal(battle.session.queue.commands.at(-1).type, "formation-select");
  assert.equal(battle.session.queue.commands.at(-1).index, index);
  view.updateBattleFrames(0.05);
  assert.equal(
    battle.session.registers.selectedFormation,
    index,
    `shape${index}: live D346`,
  );
  assert.equal(
    battle.session.registers.side0FormationOffset,
    index * 0x60,
    `shape${index}: live D342`,
  );
  assert.equal(
    battle.session.events.filter((event) => event.type === "tactical-talk-show")
      .length,
    talkCount,
    "C11A selection has no C315 call",
  );
}
for (const shape of [0, 7, 15]) {
  const { battle, view } = interactionFixture();
  formations[shape].handlers.click();
  controls.get("#bunit0").handlers.click();
  controls.get("#bformation").handlers.click();
  const address = 0x200;
  const start = [
    battle.session.pool.read8(address, O.ANCHOR_X),
    battle.session.pool.read8(address, O.ANCHOR_Y),
  ];
  view.updateBattleFrames(0.05);
  assert.equal(battle.session.registers.selectedFormation, shape);
  assert.equal(battle.session.registers.side0FormationOffset, shape * 0x60);
  const target = [
    battle.session.pool.read8(address, O.TARGET_X),
    battle.session.pool.read8(address, O.TARGET_Y),
  ];
  assert.notDeepEqual(
    target,
    start,
    `shape${shape}: AA2C writes selected live target`,
  );
  let moved = false;
  for (let frame = 0; frame < 12 && !moved; frame++) {
    view.updateBattleFrames(0.05);
    moved =
      battle.session.pool.read8(address, O.ANCHOR_X) !== start[0] ||
      battle.session.pool.read8(address, O.ANCHOR_Y) !== start[1];
  }
  assert.equal(
    moved,
    true,
    `shape${shape}: object moves toward selected formation target`,
  );
}

console.log(
  "battle dialogue/command clicks OK: 16 listener selections, six command mappings/TALK/icons, live AA2C movement, dialogue dismissal without pause",
);
