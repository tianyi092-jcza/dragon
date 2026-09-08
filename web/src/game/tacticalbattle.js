// 战术战斗稳定入口。Canvas布局DTO仅供投影；所有规则状态由OriginalBattleSession写入。

import {
  BATTLE_SCENE_HEIGHT,
  BATTLE_SCENE_WIDTH,
  FIELD,
  TACTICAL_UNIT_TYPES,
  battleCellToScene,
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
import { applyOriginalPanelInput } from "./battle/originalcommands.js";
import {
  ORIGINAL_OBJECT,
  originalObjectAddress,
} from "./battle/originalstate.js";
import {
  createOriginalNavigationFromAssets,
  navigationAssetsForLayout,
} from "./battle/originalnavigation.js";
import { createOriginalPathBuilder } from "./battle/originalpathfinder.js";
import { updateOriginalObjectMovement } from "./battle/originalmoveframe.js";
import {
  createOriginalBattleStartupStepper,
  runOriginalBattleStartup,
} from "./battle/originalstartup.js";
import { originalTalkContext } from "./battle/originalmessages.js";

export {
  BATTLE_SCENE_HEIGHT,
  BATTLE_SCENE_WIDTH,
  FIELD,
  TACTICAL_UNIT_TYPES,
  battleCellToScene,
};

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
  // 野战4B63的反向组合置bit6；攻城玩家守方4F16同时置bit7/bit6。
  // bit6由CB9B直接变换地图字节，Canvas不得再做第二次镜像。
  const mapMirrored =
    Boolean(view.mirror) || (mode === 0 && playerSide === "def");
  const resolvedTheme =
    mapMirrored && (view.theme ?? 0) !== 0
      ? 0x3f - (view.theme & 0xff)
      : (view.theme ?? 0);
  const battleSideFlag =
    (mapMirrored ? 0x40 : 0x00) | (playerSide === "def" ? 0x80 : 0x00);
  const session = new OriginalBattleSession({
    tempBytes: temps.snapshot(),
    rngSnapshot,
    talkContext: originalTalkContext(sc, sideLegions),
    registers: {
      mode,
      // D35 bit6=野战地图镜像，bit7=玩家所在战场侧；低四位由完整写入链证明恒0。
      battleSideFlag,
      themeFlag: resolvedTheme,
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
    {
      directoryIndex: view.directoryIndex ?? 0,
      mirror: mapMirrored,
    },
  );
  const originalNavigation =
    createOriginalNavigationFromAssets(navigationAssets);
  const handle = Object.assign(view, {
    originalRules: true,
    mirror: mapMirrored,
    theme: resolvedTheme,
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
      session.spatial.navigationBytes(),
    ),
    originalCommanders,
    originalFormation: {
      vectors: battleMaps?.formationVectors,
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
  // 99C2 DC9D and the once-only 99CB precede A1C5. This installs the
  // battle-scoped native cells while preserving D348=1 for the first A065.
  handle.session.initializeNativeDisplay({
    tileBytes: originalNavigation.tiles,
    attributes: originalNavigation.attributes,
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
  // 9A5E..9A6F: D34 directory, not MDL layout (D0 is still mode1).
  let mode = 2;
  if (view.directoryIndex < 0xc0) mode = 0;
  else if (view.directoryIndex < 0xd1) mode = 1;
  return createHandle(sc, view, A, D, mode, battleMaps, rngSnapshot);
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
      // 规则位置取本组活动对象锚点的平均值；Canvas 使用 DDB4 的等距坐标。
      unit.gridX = positions[side][group].x / active;
      unit.gridY = positions[side][group].y / active;
      const scene = battleCellToScene(unit.gridX, unit.gridY);
      unit.x = scene.x;
      unit.y = scene.y;
      unit.hx = scene.x;
      unit.hy = scene.y;
    }
  }
  // KI.EXE has no universal 60Hz tactical wall clock: 60A5/A0F2 gate each
  // complete frame by CFB<<4 timer callbacks, while highest speed skips waiting.
  handle.over = handle.session.finished
    ? handle.sideMap[handle.session.winner]
    : null;
  if (handle.kind === "siege")
    handle.wallRecords = handle.session.wallRecords();
  return handle;
}

// C8E6..C934注册的按钮命中号不是按画面行序排列：
// 突擊/攻擊/陣形/城壁/守陣/退卻分别为9/8/7/10/11/12；
// C1C2以命中号-7得到原版对象命令2/1/0/3/4，C21A负责命令5。
const ORIGINAL_UI_COMMAND = Object.freeze({
  formation: 0,
  attack: 1,
  assault: 2,
  wall: 3,
  defend: 4,
  retreat: 5,
});

/** Replay only input registers for responsive UI; authoritative writes wait for 9FA0. */
export function tacticalPanelState(handle) {
  const registers = { ...handle.session.registers };
  for (const input of handle.session.queue.snapshot()) {
    if (input.frame <= handle.session.frame)
      applyOriginalPanelInput(registers, input);
  }
  return registers;
}

export function queueTacticalPanelInput(handle, input) {
  if (!handle?.session || handle.session.finished) return false;
  const valid =
    (input.type === "formation-select" &&
      Number.isInteger(input.index) &&
      input.index >= 0 &&
      input.index < 16) ||
    (input.type === "deployment-select" &&
      [0x30, 0x1c, 0x05].includes(input.baseX)) ||
    (input.type === "group-toggle" &&
      Number.isInteger(input.group) &&
      input.group >= 0 &&
      input.group < 6) ||
    input.type === "battlefield-display-toggle" ||
    (input.type === "message-input" &&
      [27, 28, 29].includes(input.hitId) &&
      [0, 2].includes(input.button));
  if (!valid) return false;
  handle.session.enqueue({ ...input, frame: handle.session.frame });
  return true;
}

export function queueTacticalCommand(handle, { groups, command }) {
  if (!handle?.session || handle.session.finished) return false;
  const commandNumber = ORIGINAL_UI_COMMAND[command];
  if (commandNumber == null) return false;
  if (
    groups != null &&
    (!Array.isArray(groups) ||
      groups.some(
        (group) => !Number.isInteger(group) || group < 0 || group >= 6,
      ))
  )
    return false;
  // Gates and mask clearing happen at input consumption, not DOM click time.
  handle.session.enqueue({
    type: "tactical-command",
    frame: handle.session.frame,
    side: 0, // D2E always maps the player to object side 0.
    ...(groups == null ? {} : { groups: [...groups] }),
    commandNumber,
  });
  return true;
}

function applyReadyTacticalCommands(handle) {
  return handle.session.applyReadyCommands((session, queued) => {
    if (queued.type === "message-input") {
      session.messageInput(queued.hitId, queued.button);
      return;
    }
    let selector = null;
    const accepted = applyOriginalPanelInput(
      session.registers,
      queued,
      (value) => {
        selector = value;
      },
    );
    // C1E8/C21A write only leader pending. A7B7 dispatch owns acceptance,
    // but C216 acknowledgment occurs now, even if current5 later rejects it.
    if (accepted)
      for (const group of accepted.groups) {
        session.pool.write8(
          originalObjectAddress(0, group, 0),
          ORIGINAL_OBJECT.PENDING_COMMAND,
          accepted.command,
        );
      }
    if (selector != null) session.emitTalk(0, selector, "C1B9/C21A");
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

export function createVisualBattleStartupStepper(handle, handlers = null) {
  const startup = createOriginalBattleStartupStepper(handle, {
    commanders: handle.originalCommanders,
    tickFrame: () => tickOriginalBattleFrame(handle, handlers),
  });
  return {
    step() {
      const result = startup.step();
      if (result.advancedFrame || result.done) projectOriginalBattle(handle);
      return result;
    },
    get done() {
      return startup.done;
    },
    get result() {
      return startup.result;
    },
  };
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
