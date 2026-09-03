// 战术战斗稳定入口。Canvas布局DTO仅供投影；所有规则状态由OriginalBattleSession写入。

import {
  FIELD,
  TACTICAL_UNIT_TYPES,
  createFieldProjection,
  createSiegeProjection,
} from "./battle/battleprojection.js";
import { OriginalBattleSession } from "./battle/originalsession.js";
import {
  OriginalBattleTempRecords,
  createOriginalBattleSideTemp,
} from "./battle/originalinit.js";
import { legionBattleUnits } from "./autobattle.js";
import { generalForLegion } from "./legionunits.js";
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
import { runOriginalBattleStartup } from "./battle/originalstartup.js";

export { FIELD, TACTICAL_UNIT_TYPES };

export const ORIGINAL_TACTICAL_FPS = 60;

function generalOf(sc, legion) {
  return generalForLegion(sc, legion);
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

function createHandle(
  sc,
  view,
  attacker,
  defender,
  mode,
  battleMaps,
  rngSnapshot = null,
) {
  let playerSide = null;
  if (attacker?.faction === sc?.player_faction) playerSide = "atk";
  else if (defender?.faction === sc?.player_faction) playerSide = "def";
  // 4E5C把玩家军团指针固定写D2E，9E70首先复制为对象0侧；玩家守方时交换双方。
  const sideNames = playerSide === "def" ? ["def", "atk"] : ["atk", "def"];
  const sideLegions =
    playerSide === "def" ? [defender, attacker] : [attacker, defender];
  const sideMap = {
    0: sideNames[0],
    1: sideNames[1],
    [sideNames[0]]: 0,
    [sideNames[1]]: 1,
  };
  const temps = new OriginalBattleTempRecords([
    sideTemp(sc, sideLegions[0]),
    sideTemp(sc, sideLegions[1]),
  ]);
  const opponentFormation = generalOf(sc, sideLegions[1])?.battle_formation;
  if (
    !Number.isInteger(opponentFormation) ||
    opponentFormation < 0 ||
    opponentFormation > 7
  )
    throw new RangeError("CBE5 opponent general +0x16 must be 0..7");
  let scriptVariant = Math.min(3, mode + 1);
  if (mode === 0) scriptVariant = playerSide === "def" ? 0 : 1;
  const battleScriptBlock = opponentFormation * 4 + scriptVariant;
  // 4B63返回CH只含镜像bit6；4E8F/4F16仅追加bit7/bit6，故D35低四位恒0。
  const battleSideFlag =
    (view.mirror ? 0x40 : 0x00) | (playerSide === "def" ? 0x80 : 0x00);
  const session = new OriginalBattleSession({
    tempBytes: temps.snapshot(),
    rngSnapshot,
    registers: {
      mode,
      // D35 bit6=野战地图镜像，bit7=玩家所在战场侧；低四位由完整写入链证明恒0。
      battleSideFlag,
      themeFlag: view.theme ?? 0,
      side0FormationBase: 0x2005,
      side1FormationBase: 0x203a,
    },
  });
  const originalCommanders = [
    generalOf(sc, sideLegions[0]),
    generalOf(sc, sideLegions[1]),
  ];
  session.initializeObjects({
    commanders: originalCommanders,
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
    playerSide,
    battleScriptBlock,
    session,
    sideMap,
    exitContext: {
      legions: sideLegions,
      city: view.city,
      wallRecords: null,
    },
    logicAccumulator: 0,
    originalLastEvents: [],
    originalNavigation,
    originalPathBuilder: createOriginalPathBuilder(
      originalNavigation.navigation,
    ),
    originalCommanders,
    originalFormation: {
      vectors: battleMaps?.formationVectors,
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
  // 9C45只写对象+0C/+0E；单位占用由首帧ADC8按地址顺序B240逐槽建立。
  projectOriginalBattle(handle);
  return handle;
}

export function createBattle(
  sc,
  A,
  city,
  battleMaps,
  D = null,
  rngSnapshot = null,
) {
  const view = createSiegeProjection(sc, A, city, battleMaps, D);
  const defender = view.D;
  return createHandle(sc, view, A, defender, 0, battleMaps, rngSnapshot);
}

export function createFieldBattle(
  sc,
  A,
  D,
  battleMaps,
  fieldTerrain,
  rngSnapshot = null,
) {
  const view = createFieldProjection(sc, A, D, battleMaps, fieldTerrain);
  return createHandle(sc, view, A, D, 1, battleMaps, rngSnapshot);
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
  const activeCounts = Array.from({ length: 2 }, () => Array(6).fill(0));
  const positions = Array.from({ length: 2 }, () =>
    Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  );
  for (const address of handle.session.pool.addresses()) {
    if (!handle.session.pool.isActive(address)) continue;
    const side = address >= 0x600 ? 1 : 0;
    const group = ((address - side * 0x600) >> 8) & 7;
    activeCounts[side][group]++;
    positions[side][group].x += handle.session.pool.read8(
      address,
      ORIGINAL_OBJECT.ANCHOR_X,
    );
    positions[side][group].y += handle.session.pool.read8(
      address,
      ORIGINAL_OBJECT.ANCHOR_Y,
    );
  }
  for (const unit of handle.units) {
    const side = handle.sideMap[unit.side];
    const group = unit.strategicIndex ?? unit.idx;
    const active = activeCounts[side][group] ?? 0;
    unit.troops =
      (handle.session.temps.group(side, group)?.remaining ?? 0) + active;
    unit.gone = unit.troops <= 0;
    unit.routed = false;
    if (active > 0) {
      // Canvas只投影组级横幅；规则位置取本组活动对象锚点的平均值。
      unit.x = (positions[side][group].x / active + 0.5) * 16;
      unit.y = (positions[side][group].y / active + 0.5) * 16;
    }
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
  const side = handle.sideMap[handle.playerSide];
  const commandNumber = ORIGINAL_UI_COMMAND[command];
  if (commandNumber == null) return false;
  // C1D9..C211：玩家按钮命令3在AB4F=0时只显示原版提示，不写pending。
  if (commandNumber === 3 && (handle.session.registers.themeFlag & 0xff) === 0)
    return false;
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

function applyReadyTacticalCommands(handle) {
  return handle.session.applyReadyCommands((session, queued) => {
    if (queued.type === "tactical-command")
      applyQueuedTacticalCommand(session, queued);
  });
}

function tickOriginalBattleFrame(handle, handlers = null, inputEvents = null) {
  const result = handle.session.tick({
    inputEvents,
    objectHandlers: {
      formation: handle.originalFormation,
      buildPath: handle.originalPathBuilder,
      ...(handlers ?? {}),
    },
    updateMovement: (session, address) =>
      updateOriginalObjectMovement(session, address),
  });
  handle.originalLastEvents = result.events;
  return result;
}

export function initializeVisualBattleStartup(handle, handlers = null) {
  const result = runOriginalBattleStartup(handle, {
    commanders: handle.originalCommanders,
    tickFrame: () => tickOriginalBattleFrame(handle, handlers),
  });
  projectOriginalBattle(handle);
  return result;
}

/** 9FA0固定顺序：玩家输入/按钮→A426脚本→A065战术帧。 */
export function advanceOriginalScriptFrame(handle, vm, handlers = null) {
  if (!handle?.session || !vm || handle.session.finished)
    return { vmState: "done", battle: handle?.over ?? null };
  const inputEvents = applyReadyTacticalCommands(handle);
  const vmState = vm.step();
  const result = tickOriginalBattleFrame(handle, handlers, inputEvents);
  handle.logicAccumulator = 0;
  projectOriginalBattle(handle);
  return { vmState, battle: handle.over, events: result.events };
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
