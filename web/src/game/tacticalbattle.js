// 战术战斗稳定入口。Canvas使用legacy布局/动画DTO；所有胜负数据由OriginalBattleSession写入。

import {
  FIELD,
  TACTICAL_UNIT_TYPES,
  createBattle as createLegacyBattle,
  createFieldBattle as createLegacyFieldBattle,
  placeStaging,
  regroupFormation,
  survivors,
  tacticalTerrainProfile,
  tickBattle as tickLegacyBattle,
} from "./battle/simulation.js";
import { OriginalBattleSession } from "./battle/originalsession.js";
import {
  OriginalBattleTempRecords,
  createOriginalBattleSideTemp,
} from "./battle/originalinit.js";
import { legionBattleUnits } from "./autobattle.js";
import {
  broadcastOriginalGroupCommand,
  startOriginalFormation,
} from "./battle/originalcommands.js";
import {
  ORIGINAL_OBJECT,
  ORIGINAL_SIDE_SIZE,
  originalObjectAddress,
} from "./battle/originalstate.js";
import {
  createOriginalNavigationFromAssets,
  navigationAssetsForLayout,
} from "./battle/originalnavigation.js";
import { createOriginalPathBuilder } from "./battle/originalpathfinder.js";
import { updateOriginalObjectMovement } from "./battle/originalmoveframe.js";

export {
  FIELD,
  TACTICAL_UNIT_TYPES,
  placeStaging,
  regroupFormation,
  survivors,
  tacticalTerrainProfile,
};

/** 兼容旧表现测试；正式originalRules可视路径由advanceVisualBattle驱动。 */
export function tickBattle(handle, dt) {
  return handle?.originalRules
    ? advanceVisualBattle(handle, dt)
    : tickLegacyBattle(handle, dt);
}

export const ORIGINAL_TACTICAL_FPS = 60;

function generalOf(sc, legion) {
  return sc.generals.find(
    (general) =>
      general?.name === legion?.leader || general?.idx === legion?.leader,
  );
}

function originalGroups(legion) {
  return legionBattleUnits(legion).map((unit) => ({
    type: unit.type,
    troops: unit.troops,
  }));
}

function originalTotal(groups) {
  return groups.reduce((sum, group) => sum + group.troops, 0);
}

function sideTemp(sc, legion) {
  const groups = originalGroups(legion);
  return createOriginalBattleSideTemp({
    faction: legion?.faction ?? 0x18,
    commanderIndex: generalOf(sc, legion)?.idx ?? 0xff,
    total: originalTotal(groups),
    morale: legion?.morale ?? 0,
    groups,
  });
}

function seedSpatial(handle) {
  const session = handle.session;
  for (const address of session.pool.addresses()) {
    if (!session.pool.isActive(address)) continue;
    const spatial = session.pool.read16(address, 0x0c);
    const id = ((address >> 5) + 1) & 0x7f;
    const plane = session.pool.read8(address, 0x1e) === 0 ? 0 : 0x1000;
    session.spatial.write8(spatial + plane, id);
  }
}

function defaultFormationVectors() {
  const vectors = [];
  for (let group = 0; group < 6; group++) {
    for (let slot = 0; slot < 8; slot++) {
      let baseY = 0;
      if (group === 2 || group === 4) baseY = -17;
      else if (group === 3 || group === 5) baseY = 17;
      let dy = baseY + slot - 3;
      if (group < 2) {
        if (slot === 0) dy = 0;
        else if (slot % 2 === 0) dy = slot;
        else dy = -(slot + 1);
      }
      vectors.push([group >= 4 ? -2 : 0, dy]);
    }
  }
  return vectors;
}

function createHandle(sc, view, attacker, defender, mode, battleMaps) {
  const temps = new OriginalBattleTempRecords([
    sideTemp(sc, attacker),
    sideTemp(sc, defender),
  ]);
  const session = new OriginalBattleSession({
    tempBytes: temps.snapshot(),
    registers: {
      mode,
      battleSideFlag: view.mirror ? 0x80 : 0x00,
      side0FormationBase: 0x2005,
      side1FormationBase: 0x203a,
    },
  });
  session.initializeObjects({
    commanders: [generalOf(sc, attacker), generalOf(sc, defender)],
    mode,
  });
  const navigationAssets = navigationAssetsForLayout(
    battleMaps?.navigation,
    view.layout ?? 0,
    { mirror: Boolean(view.mirror) },
  );
  const originalNavigation =
    createOriginalNavigationFromAssets(navigationAssets);
  const handle = Object.assign(view, {
    originalRules: true,
    session,
    sideMap: { 0: "atk", 1: "def", atk: 0, def: 1 },
    exitContext: {
      legions: [attacker, defender],
      city: view.city,
      wallRecords: null,
    },
    logicAccumulator: 0,
    originalLastEvents: [],
    originalNavigation,
    originalPathBuilder: createOriginalPathBuilder(
      originalNavigation.navigation,
    ),
    originalFormation: {
      vectors: battleMaps?.formationVectors ?? defaultFormationVectors(),
      sideBases: [0x2005, 0x203a],
    },
  });
  handle.session.spatial.tiles.set(originalNavigation.tiles, 0);
  handle.session.spatial.tileAttributes = Uint8Array.from(
    originalNavigation.attributes,
  );
  handle.session.spatial.bytes.set(originalNavigation.navigation, 0x7000);
  handle.session.initializeMapObjects({
    tileBytes: originalNavigation.tiles,
    attributes: originalNavigation.attributes,
    cityTroops: view.city?.sim?.troops ?? view.city?.troops ?? 0,
    mode,
  });
  handle.wallRecords = handle.session.wallRecords();
  seedSpatial(handle);
  projectOriginalBattle(handle);
  return handle;
}

export function createBattle(sc, A, city, battleMaps, D = null) {
  const view = createLegacyBattle(sc, A, city, battleMaps, D);
  const defender = D ?? {
    leader: view.speakers?.def?.name ?? "守軍",
    faction: city.faction ?? 0x18,
    morale: 0x80,
    troops: city.sim?.troops ?? city.troops ?? 0,
    units: view.units
      .filter((unit) => unit.side === "def")
      .sort((left, right) => left.idx - right.idx)
      .map((unit) => ({ type: unit.type, troops: unit.troops })),
  };
  return createHandle(sc, view, A, defender, 0, battleMaps);
}

export function createFieldBattle(sc, A, D, battleMaps, fieldTerrain) {
  const view = createLegacyFieldBattle(sc, A, D, battleMaps, fieldTerrain);
  return createHandle(sc, view, A, D, 1, battleMaps);
}

function eventDialogue(handle, event) {
  if (event.type === "automatic-retreat") {
    const side = handle.sideMap[event.side];
    handle.dialogues.push({
      sequence: handle.nextDialogueSequence++,
      side,
      speaker: side === "atk" ? handle.A?.leader : handle.D?.leader,
      text: "全軍撤退！！",
      kind: "automatic-retreat",
    });
  }
}

export function projectOriginalBattle(handle) {
  const groupTotals = Array.from({ length: 2 }, () => Array(6).fill(0));
  for (const address of handle.session.pool.addresses()) {
    if (!handle.session.pool.isActive(address)) continue;
    const side = address >= 0x600 ? 1 : 0;
    const group = ((address - side * 0x600) >> 8) & 7;
    groupTotals[side][group]++;
  }
  for (const unit of handle.units) {
    const side = handle.sideMap[unit.side];
    unit.troops = groupTotals[side][unit.strategicIndex ?? unit.idx] ?? 0;
    unit.gone = unit.troops <= 0;
    unit.routed = false;
  }
  handle.time = handle.session.frame / ORIGINAL_TACTICAL_FPS;
  handle.over = handle.session.finished
    ? handle.sideMap[handle.session.winner]
    : null;
  if (handle.kind === "siege")
    handle.wallRecords = handle.session.wallRecords();
  for (const event of handle.originalLastEvents) eventDialogue(handle, event);
  return handle;
}

const ORIGINAL_UI_COMMAND = Object.freeze({
  formation: 0,
  assault: 1,
  wall: 2,
  defend: 3,
  siege: 4,
  retreat: 5,
});

function applyQueuedTacticalCommand(session, queued) {
  const side = queued.side === 1 ? 1 : 0;
  if (queued.commandNumber === 5) {
    startOriginalFormation(
      session.pool,
      session.registers,
      side * ORIGINAL_SIDE_SIZE,
    );
    return;
  }
  for (const group of queued.groups) {
    if (group < 0 || group >= 6) continue;
    const leader = originalObjectAddress(side, group, 0);
    session.pool.write8(
      leader,
      ORIGINAL_OBJECT.FLAGS,
      session.pool.read8(leader, ORIGINAL_OBJECT.FLAGS) | 0x08,
    );
    session.pool.write8(
      leader,
      ORIGINAL_OBJECT.PENDING_COMMAND,
      queued.commandNumber,
    );
    broadcastOriginalGroupCommand(session.pool, leader, queued.commandNumber);
  }
}

export function queueTacticalCommand(handle, { groups = [], command }) {
  if (!handle?.session || !handle?.sideMap) return true;
  const commandNumber = ORIGINAL_UI_COMMAND[command];
  if (commandNumber == null) return false;
  const side = handle.sideMap[handle.playerSide];
  const selected = (groups.length ? groups : [0, 1, 2, 3, 4, 5]).filter(
    (group) => Number.isInteger(group) && group >= 0 && group < 6,
  );
  handle.session.enqueue({
    type: "tactical-command",
    frame: handle.session.frame,
    side,
    groups: selected,
    commandNumber,
  });
  return true;
}

export function advanceVisualBattle(handle, elapsedSeconds, handlers = null) {
  handle.logicAccumulator +=
    Math.max(0, elapsedSeconds) * ORIGINAL_TACTICAL_FPS;
  let frames = 0;
  while (
    handle.logicAccumulator >= 1 &&
    !handle.session.finished &&
    frames < 12
  ) {
    handle.logicAccumulator--;
    const result = handle.session.tick({
      playerSide: handle.sideMap[handle.playerSide],
      applyCommand: (session, queued) => {
        if (queued.type === "tactical-command")
          applyQueuedTacticalCommand(session, queued);
      },
      objectHandlers: {
        formation: handle.originalFormation,
        buildPath: handle.originalPathBuilder,
        ...(handlers ?? {}),
      },
      updateMovement: (session, address) =>
        updateOriginalObjectMovement(session, address),
    });
    handle.originalLastEvents = result.events;
    frames++;
  }
  projectOriginalBattle(handle);
  return handle.over;
}

export function settleVisualBattle(handle) {
  const exit = handle.session.settleExit(handle.exitContext);
  return {
    ...exit,
    winnerName: handle.sideMap[exit.winner],
    strategicRng: handle.session.rng,
    rng: handle.session.rng.snapshot(),
  };
}
