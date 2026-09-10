import { originalActiveObjectDisplay } from "../game/battle/originalobjectframe.js";
// 战场视图 — BATTLE.MAP/MDL等距地形 + BATTLE.SCH原版对象 + 点选指挥。
// 地图与对象均只投影OriginalBattleSession；Canvas不得推进规则态。
import {
  BATTLE_SCENE_HEIGHT,
  BATTLE_SCENE_WIDTH,
  FIELD,
  battleCellToScene,
  advanceOriginalScriptFrame,
  createVisualBattleStartupStepper,
  queueTacticalCommand,
  queueTacticalPanelInput,
  tacticalPanelState,
  settleVisualBattle,
} from "../game/tacticalbattle.js";
import { BattleScript } from "../game/battlescript.js";
import { BattleDialoguePresentation } from "../ui/battledialogue.js";
import { BATTLE_PANEL_SPECS, POPUP_FONT_PX } from "../ui/battlepanels.js";
import {
  issueOriginalCommandByGroupNumber,
  issueOriginalScriptCommand,
} from "../game/battle/originalcommands.js";
import { loadBytes, loadImage, loadJSON, portrait } from "../core/assets.js";
import { OriginalBattleDisplayProcess } from "./originalcompositor.js";
import { clickSfx } from "../core/speaker.js";
import { consumeTacticalFrameBudget } from "../game/tacticalclock.js";
import {
  ORIGINAL_OBJECT,
  originalAddressParts,
  originalObjectAddress,
} from "../game/battle/originalstate.js";

const TACTICAL_SIDEBAR_WIDTH = 144;
const BATTLE_ATLAS_COLUMNS = 16;
const BATTLE_SPRITE_WIDTH = 32;
const BATTLE_SPRITE_HEIGHT = 16;
// C7A9底栏固定显示顺序：左翼、左備、大將、先鋒、右備、右翼。
// 对应军团原始六队槽：大将0、先锋1、左右翼2/3、左右备4/5。
const BATTLE_CARD_GROUP_ORDER = Object.freeze([2, 4, 0, 1, 5, 3]);
const BATTLE_CARD_ROLE_LABELS = Object.freeze([
  "左翼",
  "左備",
  "大將",
  "先鋒",
  "右備",
  "右翼",
]);

export class BattleView {
  /** @param cv 覆盖层 canvas(#bcv) @param app 引擎句柄(用 clock/battle) */
  constructor(cv, app) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.app = app;
    this.active = false;
    this.battle = null;
    this.mapImg = null;
    this.unitImg = null;
    // CS:E164 is process-scoped: this owner survives every battle opened by
    // this app shell and is not reset by return-to-title or same-process load.
    this.originalDisplayProcess = new OriginalBattleDisplayProcess();
    this.sceneCanvas = document.createElement("canvas");
    this.sceneCanvas.width = BATTLE_SCENE_WIDTH;
    this.sceneCanvas.height = BATTLE_SCENE_HEIGHT;
    this.terrainLayers = [];
    this.sceneReady = false;
    this.battleScriptVm = null; // 0x9FA0每逻辑帧持续执行的BATTLE.DAT VM
    this.battleStartup = null; // A1C5逐A065让帧；对白只投影，不阻塞此状态机
    this.scriptAccumulator = 0;
    // A0F2 is the tail of A065. The first startup A065 performs work before
    // any wait; later frames consume the phase left by that completed frame.
    this.firstTacticalFramePending = false;
    this.scriptMessageCount = 0; // A69F条件满足后调用C315的次数
    this._raf = 0;
    this._last = 0;
    this._openGeneration = 0;
    // 战场以原始1:1像素合成完整2048×1088场景；视口只改变裁切范围。
    this.camera = { x: 0, y: 0 };
    this.ox = 0;
    this.oy = 0;
    this.s = 1;
    this.drag = null;
    this._panelSignature = "";
    this.dialoguePresentation = new BattleDialoguePresentation({
      show: (capture, entry) => this.showBattleDialogue(capture, entry),
      hide: (side) => this.hideBattleDialogue(side),
    });
    this.runtimeEnabled = true;
    this._layoutOnResize = () => this.layoutBattlePanels();
    globalThis.addEventListener?.("resize", this._layoutOnResize);

    cv.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    cv.addEventListener("pointermove", (e) => this.onPointerMove(e));
    cv.addEventListener("pointerup", (e) => this.onPointerUp(e));
    cv.addEventListener("pointercancel", (e) => this.cancelDrag(e));
    cv.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.app.gamebar?.exitConfirmDialog) {
        this.app.gamebar.click(e.clientX, e.clientY, 2);
        this.draw();
      }
    });
    for (let i = 0; i < 6; i++) {
      document.querySelector(`#bunit${i}`).addEventListener("click", () => {
        clickSfx();
        this.selectPlayerUnit(i);
      });
    }
    document.querySelector("#bassault").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("assault");
    });
    document.querySelector("#battack").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("attack");
    });
    document.querySelector("#bformation").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("formation");
    });
    document.querySelector("#bwall").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("wall");
    });
    document.querySelector("#bdefend").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("defend");
    });
    document.querySelector("#bretreat").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("retreat");
    });
    for (const button of document.querySelectorAll(".battle-symbol-btn")) {
      button.addEventListener("click", () => {
        clickSfx();
        this.queuePanelInput({
          type: "formation-select",
          index: Number(button.dataset.formation),
        });
      });
    }
    for (const button of document.querySelectorAll(".battle-deployment-btn")) {
      button.addEventListener("click", () => {
        clickSfx();
        this.queuePanelInput({
          type: "deployment-select",
          baseX: Number(button.dataset.baseX),
        });
      });
    }
  }

  setRuntimeEnabled(enabled) {
    this.runtimeEnabled = Boolean(enabled);
  }

  playerSide() {
    // 4E75/4E9A→9E70 已在 createHandle 固化：玩家无论攻守都映射为
    // 对象0侧；不要在渲染层按势力重新猜测双方身份。
    return this.battle?.playerSide ?? null;
  }

  /** 开战：暂停战略时钟→A1C5启动→持续9FA0输入/A426/A065主循环。 */
  async open(battle, onFinish) {
    const generation = ++this._openGeneration;
    cancelAnimationFrame(this._raf);
    this.active = false;
    this.battle = battle;
    this.onFinish = onFinish;
    this._panelSignature = "";
    this.clearBattleDialogue();
    this.focusCameraOnPlayer();
    this.updateCursor();
    this.prevClockState ??= {
      strategicSpeed: this.app.clock.strategicSpeed,
      legacyPaused: this.app.clock._legacyPaused,
      hold: this.app.clock.hold,
    };
    // 战术时间接管：同时置hold与旧暂停位。主循环每帧会调用GameBar.syncClock，
    // 其battleActive门控必须保持hold，不能把这里只写一次的暂停状态覆盖掉。
    this.app.clock.hold = true;
    this.app.clock._legacyPaused = true;
    this.cv.style.display = "block";
    document.querySelector("#bctl").style.display = "none";
    document.querySelector("#btitle").textContent = battle.title;
    this.syncBattlePanel();
    this.app.score?.beginBattle(battle);
    try {
      const [mapImg, unitImg, talkCatalog, displayBytes] = await Promise.all([
        loadImage(`grf/battle_terrain_${battle.layout}.png`),
        loadImage("grf/battle_units.png"),
        loadJSON("battle_talk.json"),
        loadBytes("battle_display.bin"),
      ]);
      if (generation !== this._openGeneration) return;
      this.mapImg = mapImg;
      this.unitImg = unitImg;
      battle.session.messages.catalog = talkCatalog;
      const terrainSize = 192 * 0x140;
      const schOffset = 3 * terrainSize;
      if (displayBytes.length !== schOffset + 360 * 0x140)
        throw new Error("invalid authenticated battle_display.bin length");
      const nativeGraphics = new Uint8Array((192 + 360) * 0x140);
      nativeGraphics.set(
        displayBytes.subarray(
          battle.layout * terrainSize,
          (battle.layout + 1) * terrainSize,
        ),
      );
      nativeGraphics.set(displayBytes.subarray(schOffset), terrainSize);
      const initialCommit = battle.session.consumeInitialNativeCommit();
      if (!initialCommit)
        throw new Error("missing once-only 99CB native display boundary");
      const processCommit = this.originalDisplayProcess.startBattle(
        battle.session.nativeDisplay,
        nativeGraphics,
      );
      if (
        processCommit.boundary !== initialCommit.boundary ||
        processCommit.boundary !== battle.session.nativeDisplayBoundary
      )
        throw new Error("99CB native display boundary mismatch");
      this.composeBattlefield();
    } catch (error) {
      if (generation !== this._openGeneration) return;
      this.clearBattleDialogue();
      this.cv.style.display = "none";
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.app.clock.hold = this.prevClockState.hold;
      this.prevClockState = null;
      this.app.score?.endBattle(battle);
      throw error;
    }
    this.app.score?.readyBattle(battle);
    this.active = true;
    try {
      // A1C5 is part of live tactical time. It advances one A065 at each
      // tactical frame budget instead of being synchronously consumed before
      // the first paint, so both genuine startup speakers can be seen.
      this.battleStartup = createVisualBattleStartupStepper(battle);
      this.scriptAccumulator = 0;
      this.firstTacticalFramePending = true;
    } catch (error) {
      this.active = false;
      this.cv.style.display = "none";
      document.querySelector("#bctl").style.display = "none";
      document.querySelector("#battle-bottom-bar").style.display = "none";
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.app.clock.hold = this.prevClockState.hold;
      this.app.score?.endBattle(battle);
      throw error;
    }
    document.querySelector("#bctl").style.display = "block";
    document.querySelector("#battle-bottom-bar").style.display = "block";
    this.dialoguePendingStart = true;
    this.syncBattleDialogue();
    this._last = performance.now();
    const loop = (now) => {
      if (!this.active || generation !== this._openGeneration) return;
      if (!this.runtimeEnabled || this.app.runtimeEnabled === false) {
        this._last = now;
        this._raf = requestAnimationFrame(loop);
        return;
      }
      const elapsedSeconds = (now - this._last) / 1000;
      const dt =
        Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
          ? elapsedSeconds
          : 0;
      this._last = now;
      const over = this.updateBattleFrames(dt);
      if (over) {
        this.draw();
        this.finish();
        return;
      }
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** CBE5选择后建立持续运行的BATTLE.DAT VM；无脚本属于资产错误。 */
  startBattleScript() {
    const scripts = this.app.battleScripts;
    const b = this.battle;
    if (!scripts?.[0]?.length)
      throw new Error("BATTLE.DAT script blocks are unavailable");
    // CBE5块号由战术创建时按对手武将+0x16与原版战型变体计算。
    const words = scripts[b.battleScriptBlock];
    if (!words)
      throw new RangeError(`missing BATTLE.DAT block ${b.battleScriptBlock}`);
    const vm = new BattleScript(words, makeBattleIO(this));
    vm.pc = b.originalStartup?.scriptWordSkip ?? 0;
    this.battleScriptVm = vm;
    // Do not reset scriptAccumulator here. The final A1C5 A065 has already
    // reached A0F2, so its fractional wait phase also paces the first 9FA0
    // A426→A065 frame (which may start in this same due callback).
    this.app.hud.flashEvent("⚔ 開戰");
  }

  commitNativeDisplay(events) {
    const commits = (events ?? []).filter(
      (event) => event.type === "native-display-commit",
    );
    if (!commits.length) return;
    if (commits.length !== 1 || !this.battle?.session?.nativeDisplay)
      throw new Error("invalid native display commit event");
    const processCommit = this.originalDisplayProcess.commit(
      this.battle.session.nativeDisplay,
    );
    if (
      processCommit.boundary !== commits[0].boundary ||
      processCommit.boundary !== this.battle.session.nativeDisplayBoundary
    )
      throw new Error("native display boundary mismatch");
  }

  /** Internal deterministic post-start checkpoint; never part of game saves. */
  captureActiveCheckpoint() {
    const session = this.battle?.session;
    if (!this.active || this.battleStartup || !this.battleScriptVm || !session)
      throw new Error(
        "active checkpoint requires a quiescent post-start battle",
      );
    const native = this.originalDisplayProcess.snapshotBattle();
    if (
      !native ||
      session.nativeInitialCommitPending ||
      native.boundary !== session.nativeDisplayBoundary
    )
      throw new Error("active checkpoint native boundary mismatch");
    const vm = this.battleScriptVm;
    return {
      session: session.snapshot(),
      vm: {
        pc: vm.pc,
        wait: vm.wait,
        R: vm.R,
        cmd: vm.cmd,
        mode: vm.mode,
        done: vm.done,
      },
      native,
      pacing: {
        scriptAccumulator: this.scriptAccumulator,
        firstTacticalFramePending: this.firstTacticalFramePending,
      },
    };
  }

  restoreActiveCheckpoint(checkpoint, now = performance.now()) {
    const session = this.battle?.session;
    if (
      !checkpoint ||
      !this.active ||
      this.battleStartup ||
      !this.battleScriptVm ||
      !session
    )
      throw new Error(
        "active checkpoint restore requires a quiescent post-start battle",
      );
    session.restore(checkpoint.session);
    Object.assign(this.battleScriptVm, checkpoint.vm);
    this.originalDisplayProcess.restoreBattle(
      checkpoint.native,
      this.originalDisplayProcess.graphics,
    );
    this.scriptAccumulator = Math.max(
      0,
      Number(checkpoint.pacing?.scriptAccumulator) || 0,
    );
    this.firstTacticalFramePending = Boolean(
      checkpoint.pacing?.firstTacticalFramePending,
    );
    if (
      session.nativeInitialCommitPending ||
      session.nativeDisplayBoundary !== this.originalDisplayProcess.boundary
    )
      throw new Error("restored native display boundary mismatch");
    this._last = Number.isFinite(now) ? now : performance.now();
  }

  /** 每逻辑帧严格执行输入队列→A426→A065，直到战斗本身结束。 */
  updateBattleFrames(dt) {
    const firstFrameDue = this.firstTacticalFramePending;
    const elapsedSeconds = Number(dt);
    const elapsedMs =
      Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
        ? elapsedSeconds * 1000
        : 0;
    const budget = firstFrameDue
      ? { frames: 1, remainderMs: this.scriptAccumulator }
      : consumeTacticalFrameBudget(
          this.scriptAccumulator,
          elapsedMs,
          this.app.tacticalSpeed ?? 2,
          // 原版最高速只取消INT61额外等待，并不会在同一幅显示帧中瞬间
          // 执行12次完整A426/A065。用户要求五档统一减半后，最高档固定
          // 30Hz；入场与后续帧共用门控，RAF仍至多一帧，不改帧内规则。
          1,
        );
    this.scriptAccumulator = budget.remainderMs;
    let frames = 0;
    while (!this.battle.session.finished && frames < budget.frames) {
      if (this.battleStartup) {
        const startup = this.battleStartup.step();
        const frameEvents = startup.ended
          ? startup.result?.terminalFrameResult?.events
          : startup.result?.events;
        if (frameEvents?.some((event) => event.type === "map-redraw"))
          this.composeBattlefield();
        this.commitNativeDisplay(frameEvents);
        if (startup.advancedFrame) {
          frames++;
          if (firstFrameDue) {
            this.firstTacticalFramePending = false;
            // Elapsed time before the first A065 is not phase for the wait
            // that begins only after that frame completes.
            this.scriptAccumulator = 0;
          }
        }
        if (!startup.done) continue;
        this.battleStartup = null;
        // 9FDC bypasses the rest of A1C5 and 9FA0. Never instantiate A426 or
        // flash battle-start after a terminal yielded A065.
        if (startup.ended || this.battle.session.finished) continue;
        // A1C5 has returned: only now does 9FA0 begin A426 input/script work.
        this.focusCameraOnPlayer();
        this.startBattleScript();
        continue;
      }
      const result = advanceOriginalScriptFrame(
        this.battle,
        this.battleScriptVm,
      );
      if (result.events?.some((event) => event.type === "map-redraw"))
        this.composeBattlefield();
      this.commitNativeDisplay(result.events);
      frames++;
    }
    return this.battle.over;
  }

  /** 结束：战果只来自OriginalBattleSession.settleExit。 */
  finish() {
    if (!this.active) return;
    this.active = false;
    this._openGeneration++;
    cancelAnimationFrame(this._raf);
    this.battleScriptVm = null;
    this.battleStartup = null;
    this.originalDisplayProcess?.endBattle();
    this.scriptAccumulator = 0;
    this.firstTacticalFramePending = false;
    this.drag = null;
    this.clearBattleDialogue();
    this.cv.style.display = "none";
    document.querySelector("#bctl").style.display = "none";
    document.querySelector("#battle-bottom-bar").style.display = "none";
    if (this.prevClockState) {
      this.app.clock.strategicSpeed = this.prevClockState.strategicSpeed;
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.app.clock.hold = this.prevClockState.hold;
      this.prevClockState = null;
    }
    const cb = this.onFinish;
    this.onFinish = null;
    this.app.score?.fadeBattle(this.battle);
    cb?.(settleVisualBattle(this.battle));
  }

  playerUnits() {
    const side = this.playerSide();
    const byStrategicGroup = new Map(
      (this.battle?.units ?? [])
        .filter((unit) => unit.side === side)
        .map((unit) => [unit.strategicIndex ?? unit.idx, unit]),
    );
    return BATTLE_CARD_GROUP_ORDER.map(
      (strategicIndex) => byStrategicGroup.get(strategicIndex) ?? null,
    );
  }

  panelState() {
    return this.battle?.session ? tacticalPanelState(this.battle) : null;
  }

  queuePanelInput(input) {
    if (!this.active || !queueTacticalPanelInput(this.battle, input)) return;
    this.updateCursor();
    this.syncBattlePanel();
  }

  selectedUnits() {
    const mask = this.panelState()?.selectedGroupMask ?? 0;
    return this.playerUnits().filter(
      (unit) =>
        unit && (!mask || mask & (1 << (unit.strategicIndex ?? unit.idx))),
    );
  }

  selectPlayerUnit(index) {
    const group = BATTLE_CARD_GROUP_ORDER[index];
    if (group == null) return;
    // C27D..C30C toggle even an empty/inactive group's bit.
    this.queuePanelInput({ type: "group-toggle", group });
  }

  commandTargetX(unit, distance) {
    return Math.max(
      20,
      Math.min(
        FIELD - 20,
        unit.x + (unit.side === "atk" ? distance : -distance),
      ),
    );
  }

  issueTacticalCommand(command) {
    if (!this.active) return;
    const before = this.panelState();
    if (!queueTacticalCommand(this.battle, { command })) return;
    this.updateCursor();
    this.syncBattlePanel();
    if (
      before.winnerState === 1 ||
      (command === "retreat" && before.winnerState !== 0)
    )
      return;
    if (command === "wall" && (before.themeFlag & 0xff) === 0) {
      this.setCommandHint("此戰場不能下達城壁命令。", "blocked");
      return;
    }
    if (command === "retreat") {
      this.setCommandHint("全軍開始退卻。", "retreat");
      this.updateCursor();
      this.syncBattlePanel();
      return;
    }

    if (command === "assault") {
      this.setCommandHint("所選部隊向敵軍突擊。", command);
    } else if (command === "attack") {
      this.setCommandHint("所選部隊攻擊敵軍。", command);
    } else if (command === "formation") {
      this.setCommandHint("所選部隊按選定陣形與部署位置列陣。", command);
    } else if (command === "wall") {
      this.setCommandHint("所選部隊集中破壞最近城壁。", command);
    } else if (command === "defend") {
      this.setCommandHint("所選部隊原地守陣。", command);
    }
    this.syncBattlePanel();
  }

  setCommandHint(text, command = null) {
    const hint = document.querySelector("#bcommandhint");
    hint.textContent = text;
    hint.dataset.command = command ?? "";
  }

  clearBattleDialogue() {
    this.dialoguePendingStart = false;
    this.dialoguePresentation?.dispose();
    for (const side of [0, 1]) this.hideBattleDialogue(side);
  }

  dialogueSideName(side) {
    return this.battle?.sideMap?.atk === side ? "atk" : "def";
  }

  hideBattleDialogue(side) {
    const name = this.dialogueSideName(side);
    const box = document.querySelector(`#bdialogue-${name}`);
    if (box) {
      box.dataset.kind = "";
      box.dataset.originalSide = String(side);
    }
    const face = document.querySelector(`#bdialogue-${name}-face`);
    if (face) face.removeAttribute("src");
  }

  showBattleDialogue(capture, entry) {
    const side = this.dialogueSideName(capture.side);
    const box = document.querySelector(`#bdialogue-${side}`);
    const name = document.querySelector(`#bdialogue-${side}-name`);
    const text = document.querySelector(`#bdialogue-${side}-text`);
    const face = document.querySelector(`#bdialogue-${side}-face`);
    if (box) {
      box.dataset.kind = "decoded";
      // Object side0 is always the player and belongs at the bottom even when
      // the strategic player was the defending legion; side1 is the top enemy.
      box.dataset.originalSide = String(capture.side);
    }
    if (name) name.textContent = capture.speaker.name;
    if (text) text.textContent = capture.text;
    if (face) face.removeAttribute("src");
    // Only the retained slot portrait, never commander/generalIdx or NPC fallback.
    // Slow asset loads may fill this capture, but cannot revive/replace a window.
    portrait(capture.speaker.portrait)
      .then((image) => {
        this.dialoguePresentation.expire();
        if (face && this.dialoguePresentation.owns(capture.side, entry))
          face.src = image.src;
      })
      .catch(() => {});
  }

  syncBattleDialogue() {
    // Hidden tabs don't start an unseen capture's three seconds. Existing
    // deadlines still elapse; sync expires them before the next visible paint.
    if (document.hidden || !this.dialoguePresentation) return;
    if (this.dialoguePendingStart) {
      this.dialoguePendingStart = false;
      const session = this.battle.session;
      this.dialoguePresentation.start(session.events, session.messages.slots);
    } else {
      this.dialoguePresentation.sync(this.battle?.session?.events ?? []);
    }
  }

  dismissBattleDialogue() {
    // Global modern right click is NOT native IDs27/28 or a queued command.
    if (this.drag) this.cancelDrag({ pointerId: this.drag.pointerId });
    this.dialoguePresentation?.dismissAll();
  }

  syncBattlePanel() {
    if (!this.battle) return;
    this.syncBattleDialogue();
    const def = this.battle.units.filter((u) => u.side === "def");
    const sideMorale = (sideName) => {
      const side = this.battle.sideMap?.[sideName];
      if (side == null) return 0;
      // 战术主将HP可因能力加成超过200，但显示的军团士气上限仍为200；
      // 这里只钳制呈现值，不改对象HP、C78E黄线或战斗规则态。
      return Math.min(
        200,
        this.battle.session.pool.read8(
          originalObjectAddress(side, 0, 0),
          ORIGINAL_OBJECT.HP,
        ),
      );
    };
    const atkName = this.battle.A?.leader ?? "攻方";
    const defName =
      this.battle.D?.leader ??
      def.find((u) => u.gen)?.gen ??
      this.battle.city?.name ??
      "守方";
    const atkTroops = survivorsOf(this.battle, "atk");
    const defTroops = survivorsOf(this.battle, "def");
    const atkMorale = sideMorale("atk");
    const defMorale = sideMorale("def");
    const playerSideName = this.battle.sideMap?.[0] ?? "atk";
    const enemySideName = this.battle.sideMap?.[1] ?? "def";
    const nameBySide = { atk: atkName, def: defName };
    const troopsBySide = { atk: atkTroops, def: defTroops };
    const moraleBySide = { atk: atkMorale, def: defMorale };
    // C6F6→C775/C78E：红线取临时记录+4总兵/4，黄线取主将的
    // 士气/HP字段×3/4；两者都在124px封顶。顶栏固定原始1侧。
    const meterByOriginalSide = [0, 1].map((side) => {
      const troops = this.battle.session.temps.read16(side, 4);
      const morale = this.battle.session.pool.read8(
        originalObjectAddress(side, 0, 0),
        ORIGINAL_OBJECT.HP,
      );
      return {
        troops: Math.min(124, troops >> 2),
        morale: Math.min(124, (morale >> 1) + (morale >> 2)),
      };
    });
    const entityBySide = { atk: this.battle.A, def: this.battle.D };
    const rulerBySide = (sideName) => {
      const factionIndex = entityBySide[sideName]?.faction;
      return (
        this.app.scenario?.factions?.[factionIndex]?.monarch ??
        nameBySide[sideName]
      );
    };
    let operationName;
    if (this.battle.kind === "siege")
      operationName = `${this.battle.city?.name ?? "據點"}　作戰`;
    else {
      const fieldName =
        this.battle.session.registers.mode === 2 ? "海上" : "陸上";
      operationName = `${fieldName}　作戰`;
    }
    const units = this.playerUnits();
    const panel = this.panelState();
    const statusIcons = this.battle.session.playerGroupStatusIcons;
    const signature = [
      this.battle.kind,
      this.battle.terrain?.key ?? "",
      operationName,
      playerSideName,
      enemySideName,
      rulerBySide(playerSideName),
      rulerBySide(enemySideName),
      atkName,
      defName,
      atkTroops,
      defTroops,
      atkMorale,
      defMorale,
      meterByOriginalSide[0].troops,
      meterByOriginalSide[0].morale,
      meterByOriginalSide[1].troops,
      meterByOriginalSide[1].morale,
      panel.selectedGroupMask,
      panel.selectedFormation,
      panel.side0FormationBase,
      panel.battlefieldHidden,
      ...statusIcons,
      this.battle.wallRevision ?? 0,
      ...(this.battle.wallRecords ?? []).map(
        (wall) => `${wall.index}:${wall.metric | 0}:${wall.flags | 0}`,
      ),
      ...units.map((unit) => {
        if (!unit) return "-";
        return `${unit.strategicIndex ?? unit.idx}:${unit.type ?? 0}:${unit.troops | 0}:${unit.routed ? 1 : 0}:${unit.gone ? 1 : 0}`;
      }),
    ].join("|");
    if (signature === this._panelSignature) return;
    this._panelSignature = signature;

    document.querySelector("#btitle").textContent = operationName;
    document.querySelector("#bbelligerents").textContent =
      `${rulerBySide(playerSideName)}　對　${rulerBySide(enemySideName)}`;
    document.querySelector("#batkname").textContent =
      nameBySide[playerSideName];
    document.querySelector("#bdefname").textContent = nameBySide[enemySideName];
    document.querySelector("#batktroops").textContent =
      Math.max(0, troopsBySide[playerSideName] | 0) * 10;
    document.querySelector("#bdeftroops").textContent =
      Math.max(0, troopsBySide[enemySideName] | 0) * 10;
    document.querySelector("#batkmorale").textContent =
      moraleBySide[playerSideName];
    document.querySelector("#bdefmorale").textContent =
      moraleBySide[enemySideName];
    // C775/C78E的0..124原始值等比映射到现代浮窗的160px内容宽度。
    const meterWidth = (value) => Math.round((value * 160) / 124);
    document.querySelector("#batk-troops-fill").style.width =
      `${meterWidth(meterByOriginalSide[0].troops)}px`;
    document.querySelector("#batk-morale-fill").style.width =
      `${meterWidth(meterByOriginalSide[0].morale)}px`;
    document.querySelector("#bdef-troops-fill").style.width =
      `${meterWidth(meterByOriginalSide[1].troops)}px`;
    document.querySelector("#bdef-morale-fill").style.width =
      `${meterWidth(meterByOriginalSide[1].morale)}px`;

    for (let i = 0; i < 6; i++) {
      const card = document.querySelector(`#bunit${i}`);
      const unit = units[i];
      if (!card) continue;
      const group = BATTLE_CARD_GROUP_ORDER[i];
      const selected = (panel.selectedGroupMask & (1 << group)) !== 0;
      card.classList.toggle("active", selected);
      card.setAttribute("aria-pressed", String(selected));
      const statusEl = card.querySelector(".battle-card-status");
      if (statusEl) {
        statusEl.dataset.command = String(statusIcons[group]);
        statusEl.style.backgroundImage = `url("grf/ui/battle_status_${statusIcons[group]}.png")`;
      }
      card.classList.toggle(
        "routed",
        Boolean(!unit || unit.routed || unit.gone),
      );
      const roleEl = card.querySelector(".battle-card-role-label");
      const iconEl = card.querySelector(".battle-card-unit-icon");
      const troopsValEl = card.querySelector(".battle-card-troops-val");
      const troopsFillEl = card.querySelector(".battle-card-troops-fill");
      if (roleEl) roleEl.textContent = BATTLE_CARD_ROLE_LABELS[i];
      if (iconEl) {
        iconEl.dataset.unitType = unit?.typeKey ?? "infantry";
        let iconFile = "battle_unit_infantry.png";
        if (unit?.type === 1) iconFile = "battle_unit_cavalry.png";
        else if (unit?.type === 2) iconFile = "battle_unit_archer.png";
        iconEl.style.backgroundImage = `url("grf/ui/${iconFile}")`;
      }
      if (troopsValEl)
        troopsValEl.textContent = unit ? Math.max(0, unit.troops | 0) * 10 : 0;
      if (troopsFillEl) {
        const pct =
          unit && unit.maxTroops > 0
            ? Math.max(0, Math.min(100, (unit.troops / unit.maxTroops) * 100))
            : 0;
        troopsFillEl.style.width = `${pct}%`;
      }
    }
    for (const button of document.querySelectorAll(".battle-symbol-btn")) {
      const selected =
        Number(button.dataset.formation) === panel.selectedFormation;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const button of document.querySelectorAll(".battle-deployment-btn")) {
      const selected =
        Number(button.dataset.baseX) === (panel.side0FormationBase & 0xff);
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    // C1CE still clears selection for an unavailable wall command.
    document.querySelector("#bwall").disabled = false;
  }

  atlasFrame(ctx, image, index, x, y) {
    if (!image || index < 0) return;
    const sx = (index % BATTLE_ATLAS_COLUMNS) * BATTLE_SPRITE_WIDTH;
    const sy = Math.floor(index / BATTLE_ATLAS_COLUMNS) * BATTLE_SPRITE_HEIGHT;
    ctx.drawImage(
      image,
      sx,
      sy,
      BATTLE_SPRITE_WIDTH,
      BATTLE_SPRITE_HEIGHT,
      Math.round(x),
      Math.round(y),
      BATTLE_SPRITE_WIDTH,
      BATTLE_SPRITE_HEIGHT,
    );
  }

  composeBattlefield() {
    const ctx = this.sceneCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, BATTLE_SCENE_WIDTH, BATTLE_SCENE_HEIGHT);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BATTLE_SCENE_WIDTH, BATTLE_SCENE_HEIGHT);
    const directoryIndex = this.battle?.directoryIndex ?? 0;
    const rawTiles = this.app.battleMaps?.maps?.[String(directoryIndex)];
    const sessionTiles = this.battle?.session?.spatial?.tiles;
    const tiles = sessionTiles?.length >= 0x1000 ? sessionTiles : rawTiles;
    const attributes =
      this.app.battleMaps?.navigation?.layouts?.[
        String(this.battle?.layout ?? 0)
      ]?.attributes;
    if (!this.mapImg || !tiles || tiles.length < 0x1000)
      throw new Error(`missing tactical map ${directoryIndex}`);
    if (!attributes || attributes.length < 0x800)
      throw new Error(
        `missing tactical MDL layout ${this.battle?.layout ?? 0}`,
      );

    // DD22越界时固定取tile0；descriptor0的首图形正是原版蓝色菱形底纹。
    const outsideSprite = attributes[1] & 0xff;
    const mapTop = battleCellToScene(0, 0).y - 8;
    // 同一屏幕行相隔8px，奇偶行水平错开16px；这是DA1C投影后的tile0
    // 晶格。旧的32×16矩形平铺会留下错误黑洞并把菱格排成方阵。
    for (let y = 0; y < BATTLE_SCENE_HEIGHT; y += 8) {
      const depth = (y - mapTop) / 8;
      const firstX = (depth & 1) === 0 ? 0 : -16;
      for (let x = firstX; x < BATTLE_SCENE_WIDTH; x += BATTLE_SPRITE_WIDTH)
        this.atlasFrame(ctx, this.mapImg, outsideSprite, x, y);
    }

    // DA1C/DAAA的深度轴是y-x。静态地形按深度预合成窄条，显示时与
    // 动态对象交错绘制，避免城墙/树林后的部队错误浮在所有建筑上方。
    this.terrainLayers = [];
    for (let depth = -0x3f; depth <= 0x3f; depth++) {
      const firstX = Math.max(0, -depth);
      const lastX = Math.min(0x3f, 0x3f - depth);
      const firstPoint = battleCellToScene(firstX, firstX + depth);
      const lastPoint = battleCellToScene(lastX, lastX + depth);
      const left = firstPoint.x - 16;
      // DD22每个descriptor槽把SI减0x400，正好上移DDB4的一条16px
      // screen row；同时写入的0,2,..,12是遮挡高度码，不是8px坐标。
      const top = firstPoint.y - 104;
      const layer = document.createElement("canvas");
      layer.width = lastPoint.x + 16 - left;
      layer.height = 112;
      const layerContext = layer.getContext("2d");
      layerContext.imageSmoothingEnabled = false;
      for (let x = firstX; x <= lastX; x++) {
        const y = x + depth;
        const tile = tiles[y * 0x40 + x] & 0xff;
        const descriptor = tile * 8;
        const point = battleCellToScene(x, y);
        for (let level = 0; level < 7; level++) {
          const sprite = attributes[descriptor + level + 1] & 0xff;
          if (sprite === 0) continue;
          this.atlasFrame(
            layerContext,
            this.mapImg,
            sprite,
            point.x - 16 - left,
            point.y - 8 - level * 16 - top,
          );
        }
      }
      this.terrainLayers.push({ depth, image: layer, x: left, y: top });
    }
    this.sceneReady = true;
  }

  battleUiScale() {
    // 战场地图扩大为可拖拽视口，但面板文字与图形始终保持100%。
    return 1;
  }

  layoutBattlePanels() {
    const rootStyle = document.documentElement?.style;
    rootStyle?.setProperty?.("--popup-font-size", `${POPUP_FONT_PX}px`);
    const dialogue = BATTLE_PANEL_SPECS.dialogue;
    for (const [name, value] of [
      ["width", dialogue.width],
      ["height", dialogue.height],
      ["inset", dialogue.inset],
      ["portrait", dialogue.portrait],
      ["copy-gap", dialogue.copyGap],
      ["line-height", dialogue.lineHeight],
      ["name-margin", dialogue.nameMargin],
      ["top", BATTLE_PANEL_SPECS[dialogue.topAnchor].top],
      ["bottom", BATTLE_PANEL_SPECS[dialogue.bottomAnchor].bottom],
    ])
      rootStyle?.setProperty?.(`--battle-dialogue-${name}`, `${value}px`);
    rootStyle?.setProperty?.(
      "--battle-dialogue-copy-align",
      dialogue.copyAlign,
    );

    // The title, side windows and cards remain exact 1:1 panels. Their shared
    // specs also drive every textured canvas backing below.
    for (const key of ["title", "enemy", "player", "cards"]) {
      const spec = BATTLE_PANEL_SPECS[key];
      const panel = document.querySelector(spec.selector);
      if (!panel) continue;
      panel.style.width = `${spec.width}px`;
      panel.style.height = `${spec.height}px`;
      for (const edge of ["top", "right", "bottom", "left"])
        if (spec[edge] != null) panel.style[edge] = `${spec[edge]}px`;
    }

    for (const box of document.querySelectorAll(dialogue.selector)) {
      box.style.width = `${dialogue.width}px`;
      box.style.height = `${dialogue.height}px`;
      box.style.padding = `${dialogue.inset}px`;
      box.style.gridTemplateColumns = `${dialogue.portrait}px 1fr`;
      if (box.dataset.originalSide === "1") {
        box.style.top = `${BATTLE_PANEL_SPECS[dialogue.topAnchor].top}px`;
        box.style.bottom = "auto";
      } else {
        box.style.top = "auto";
        box.style.bottom = `${BATTLE_PANEL_SPECS[dialogue.bottomAnchor].bottom}px`;
      }
    }

    for (const canvas of document.querySelectorAll(
      ".battle-window-frame[data-battle-panel]",
    )) {
      const spec = BATTLE_PANEL_SPECS[canvas.dataset.battlePanel];
      if (!spec?.cols || !spec?.rows) continue;
      canvas.dataset.windowCols = String(spec.cols);
      canvas.dataset.windowRows = String(spec.rows);
      if (canvas.width !== spec.width) canvas.width = spec.width;
      if (canvas.height !== spec.height) canvas.height = spec.height;
    }
  }

  // Compatibility name for older focused fixtures; all panel geometry now
  // comes from BATTLE_PANEL_SPECS rather than this method's callers.
  layoutBattleDialogues() {
    this.layoutBattlePanels();
  }

  drawBattleWindowFrames() {
    this.layoutBattlePanels();
    const windowBuilder = this.app.gamebar?._drawWindow;
    if (typeof windowBuilder !== "function" || !this.app.gamebar?._gf) return;
    for (const canvas of document.querySelectorAll(
      ".battle-window-frame[data-battle-panel]",
    )) {
      const spec = BATTLE_PANEL_SPECS[canvas.dataset.battlePanel];
      if (!spec?.cols || !spec?.rows) continue;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, spec.width, spec.height);
      // Preserve GameBar's raw frame_sq/frame_col/frame_cap composition.
      windowBuilder.call(
        this.app.gamebar,
        context,
        0,
        0,
        spec.cols,
        spec.rows,
        "black",
      );
    }
  }

  battlefieldViewport() {
    const uiScale = this.battleUiScale();
    const sidebarWidth = Math.round(TACTICAL_SIDEBAR_WIDTH * uiScale);
    const panel = document.querySelector("#bctl");
    if (panel) {
      panel.style.width = `${sidebarWidth}px`;
      panel.style.setProperty?.("--battle-ui-scale", String(uiScale));
      panel.style.setProperty?.("--battle-sidebar-width", `${sidebarWidth}px`);
    }
    const bottomBar = document.querySelector("#battle-bottom-bar");
    if (bottomBar) {
      bottomBar.style.removeProperty?.("right");
      bottomBar.style.setProperty?.("--battle-ui-scale", String(uiScale));
    }
    // 三个右侧窗口与六队卡栏都浮在Canvas上，不再为整条黑色侧栏/底栏
    // 预留裁切区域，让战场使用完整浏览器视口。
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    return { width, height, sidebarWidth, uiScale };
  }

  focusCameraOnPlayer() {
    const side = this.playerSide();
    const units = this.battle?.units.filter((u) => u.side === side && !u.gone);
    const focusX = units?.length
      ? units.reduce((sum, u) => sum + (u.hx ?? u.x), 0) / units.length
      : BATTLE_SCENE_WIDTH / 2;
    const focusY = units?.length
      ? units.reduce((sum, u) => sum + (u.hy ?? u.y), 0) / units.length
      : BATTLE_SCENE_HEIGHT / 2;
    const viewport = this.battlefieldViewport();
    // DDB4图形以1:1的32×16/32×32像素绘制；依靠相机裁切而非缩图。
    this.s = 1;
    this.camera.x = focusX - viewport.width / (2 * this.s);
    this.camera.y = focusY - viewport.height / (2 * this.s);
    this.clampCamera();
  }

  clampCamera() {
    const viewport = this.battlefieldViewport();
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const maxX = Math.max(0, BATTLE_SCENE_WIDTH - viewportWidth / this.s);
    const maxY = Math.max(0, BATTLE_SCENE_HEIGHT - viewportHeight / this.s);
    this.camera.x = Math.max(0, Math.min(maxX, this.camera.x));
    this.camera.y = Math.max(0, Math.min(maxY, this.camera.y));
  }

  pan(dx, dy) {
    this.camera.x -= dx / this.s;
    this.camera.y -= dy / this.s;
    this.clampCamera();
  }

  updateCursor() {
    if (this.drag?.moved) this.cv.style.cursor = "grabbing";
    else
      this.cv.style.cursor = this.panelState()?.selectedGroupMask
        ? "crosshair"
        : "grab";
  }

  onPointerDown(e) {
    if (!this.active || e.button !== 0) return;
    if (this.app.gamebar?.exitConfirmDialog) return;
    const viewport = this.battlefieldViewport();
    if (e.clientX >= viewport.width || e.clientY >= viewport.height) return;
    this.drag = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    this.cv.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  onPointerMove(e) {
    if (this.app.gamebar?.exitConfirmDialog) {
      const changed = this.app.gamebar.hover(e.clientX, e.clientY);
      if (changed) this.draw();
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (
      !drag.moved &&
      Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 3
    ) {
      drag.moved = true;
      this.updateCursor();
    }
    if (drag.moved) {
      this.pan(dx, dy);
      this.draw();
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  }

  onPointerUp(e) {
    if (this.app.gamebar?.exitConfirmDialog) {
      this.app.gamebar.click(e.clientX, e.clientY, e.button);
      this.draw();
      return;
    }
    if (e.button !== 0) return;
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    this.cancelDrag(e);
    if (moved) return;
    this.onClick(e.clientX, e.clientY);
    this.updateCursor();
  }

  cancelDrag(e) {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    this.cv.releasePointerCapture?.(e.pointerId);
    this.drag = null;
    this.updateCursor();
  }

  onClick(px, py) {
    if (!this.active) return;
    // 屏幕→战场坐标
    const wx = (px - this.ox) / this.s;
    const wy = (py - this.oy) / this.s;
    if (wx < 0 || wy < 0 || wx > BATTLE_SCENE_WIDTH || wy > BATTLE_SCENE_HEIGHT)
      return;
    const mine = this.playerSide();
    let hit = null,
      hd = 40 * 40;
    for (const u of this.battle.units) {
      if (u.side !== mine || u.routed || u.gone) continue;
      const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
      if (d < hd) {
        hd = d;
        hit = u;
      }
    }
    if (hit && !this.battle.session.registers.battlefieldHidden)
      this.queuePanelInput({
        type: "group-toggle",
        group: hit.strategicIndex ?? hit.idx,
      });
    // 原版战术地图空白左键只参与按钮/组选择流程，不存在任意坐标移动命令。
    // Canvas不得写无规则消费者的legacy unit.order。
    this.updateCursor();
    this.syncBattlePanel();
  }

  originalObjectSprite(address) {
    const pool = this.battle?.session?.pool;
    if (!pool) return null;
    const { side, group, slot } = originalAddressParts(address);
    const captured = this.battle.session.objectDisplays?.[address >>> 5];
    // B240 draws before STATE^1; B360 draws inactive dying slots. Rendering
    // never advances the phase/countdown, and older/pre-frame snapshots fall
    // back only for active objects that have not had a captured DA1C draw.
    if (!captured && !pool.isActive(address)) return null;
    const display = captured ?? originalActiveObjectDisplay(pool, address);
    if (display.frame < 0 || display.frame >= 180) return null;
    return {
      ...display,
      side,
      group,
      slot,
      point: battleCellToScene(display.x, display.y, display.level),
    };
  }

  originalAttributeSprites() {
    const captures = this.battle?.session?.attributeDisplays;
    if (!captures) return [];
    return [...captures.values()]
      .map((capture) => {
        const { address, x, y, level, code, pair } = capture;
        const point = battleCellToScene(x, y, level);
        // This is the actual BB10 pre-increment capture. Repaint and camera
        // movement never derive or advance a phase from D318.
        return pair
          ? {
              address,
              mapAttribute: true,
              frame: (code - 0x00c0) >> 1,
              x,
              y,
              level,
              point,
            }
          : {
              address,
              mapAttribute: true,
              halfFrame: code - 0x00c0,
              x,
              y,
              level,
              point,
            };
      })
      .filter((object) =>
        object.halfFrame == null
          ? object.frame >= 0 && object.frame < 180
          : object.halfFrame >= 0 && object.halfFrame < 360,
      );
  }

  drawBattlefieldLayers(ctx) {
    if (!this.sceneReady) return false;
    const pool = this.battle?.session?.pool;
    const unitObjects =
      this.unitImg && pool
        ? pool
            .addresses()
            .map((address) => this.originalObjectSprite(address))
            .filter(Boolean)
        : [];
    const effectObjects = [
      ...(this.battle?.session?.effectDisplays?.values?.() ?? []),
    ]
      .map((capture) => ({
        ...capture,
        effect: true,
        halfFrame: capture.code - 0x00c0,
        point: battleCellToScene(capture.x, capture.y, capture.level),
      }))
      .filter((object) => object.halfFrame >= 0 && object.halfFrame < 360);
    const objects = [
      ...this.originalAttributeSprites(),
      ...effectObjects,
      ...unitObjects,
    ].sort(
      (left, right) =>
        left.y - left.x - (right.y - right.x) ||
        left.x + left.y - (right.x + right.y) ||
        left.level - right.level ||
        Number(Boolean(left.mapAttribute)) -
          Number(Boolean(right.mapAttribute)) ||
        left.address - right.address,
    );
    const drawUnitFrame = (frame, point) => {
      const frameTop = frame * 2;
      this.atlasFrame(ctx, this.unitImg, frameTop, point.x - 16, point.y - 24);
      this.atlasFrame(
        ctx,
        this.unitImg,
        frameTop + 1,
        point.x - 16,
        point.y - 8,
      );
    };
    const drawObject = (object) => {
      if (object.halfFrame != null) {
        this.atlasFrame(
          ctx,
          this.unitImg,
          object.halfFrame,
          object.point.x - 16,
          object.point.y - 8,
        );
        return;
      }
      drawUnitFrame(object.frame, object.point);
    };
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.s, this.s);
    ctx.drawImage(this.sceneCanvas, 0, 0);
    // C234/DC9D(128,128): only off-map tile0 remains; rule frames continue.
    if (this.battle.session.registers.battlefieldHidden) {
      ctx.restore();
      return true;
    }
    let objectIndex = 0;
    for (const layer of this.terrainLayers) {
      while (
        objectIndex < objects.length &&
        objects[objectIndex].y - objects[objectIndex].x < layer.depth
      )
        drawObject(objects[objectIndex++]);
      ctx.drawImage(layer.image, layer.x, layer.y);
      while (
        objectIndex < objects.length &&
        objects[objectIndex].y - objects[objectIndex].x === layer.depth
      )
        drawObject(objects[objectIndex++]);
    }
    while (objectIndex < objects.length) drawObject(objects[objectIndex++]);
    ctx.restore();
    return true;
  }

  draw() {
    const { ctx, cv } = this;
    if (cv.width !== innerWidth) cv.width = innerWidth;
    if (cv.height !== innerHeight) cv.height = innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!this.battle) return;
    // 直接复用GameBar通用弹窗构造器；四边纹理不在CSS中另造。
    this.drawBattleWindowFrames();

    // 原生像素大场景按相机裁切；不同分辨率只改变可见范围。
    const viewport = this.battlefieldViewport();
    this.s = 1;
    this.clampCamera();
    const scaledWidth = BATTLE_SCENE_WIDTH * this.s;
    const scaledHeight = BATTLE_SCENE_HEIGHT * this.s;
    this.ox =
      viewport.width >= scaledWidth
        ? Math.floor((viewport.width - scaledWidth) / 2)
        : -this.camera.x * this.s;
    this.oy =
      viewport.height >= scaledHeight
        ? Math.floor((viewport.height - scaledHeight) / 2)
        : -this.camera.y * this.s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.clip();
    // 水路、河岸与桥均来自 BATTLE.MAP/MDL；不叠加 Web 自制波纹。
    // BATTLE.SCH 是唯一人员图形来源；资产错误时不回退到矩形/文字代用品。
    this.drawBattlefieldLayers(ctx);
    // B941投射物只使用实际捕获的SCH单半帧336/337/340/341；没有
    // wall-clock轮播、PNG alpha替代或手绘几何兜底。
    ctx.restore();
    this.syncBattlePanel();
    if (this.app.gamebar?.exitConfirmDialog) {
      this.app.gamebar._drawExitConfirmDialog(ctx);
    }
  }

  drawBattleEffects(ctx) {
    for (const effect of this.battle?.effects ?? []) {
      const duration = Math.max(0.001, effect.duration ?? 0.001);
      const progress = Math.max(0, Math.min(1, effect.age / duration));
      const alpha = 1 - progress;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (effect.kind === "arrow") {
        const x = effect.fromX + (effect.toX - effect.fromX) * progress;
        const baseY = effect.fromY + (effect.toY - effect.fromY) * progress;
        const y = baseY - Math.sin(progress * Math.PI) * (effect.arc ?? 0);
        const dx = effect.toX - effect.fromX;
        const dy =
          effect.toY -
          effect.fromY -
          Math.cos(progress * Math.PI) * Math.PI * (effect.arc ?? 0);
        const angle = Math.atan2(dy, dx);
        const sx = this.ox + x * this.s;
        const sy = this.oy + y * this.s;
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.strokeStyle = "#f4df91";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(7, 0);
        ctx.lineTo(3, -3);
        ctx.moveTo(7, 0);
        ctx.lineTo(3, 3);
        ctx.stroke();
      } else if (
        effect.kind === "melee" ||
        effect.kind === "wall" ||
        effect.kind === "boarding"
      ) {
        const x = this.ox + effect.x * this.s;
        const y = this.oy + effect.y * this.s;
        const radius = 4 + progress * 12;
        let strikeColor = "#fff2b0";
        if (effect.kind === "wall") strikeColor = "#ffd060";
        else if (effect.kind === "boarding") strikeColor = "#9ee9ff";
        ctx.strokeStyle = strikeColor;
        ctx.lineWidth = effect.kind === "boarding" ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(x - radius, y - radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.moveTo(x + radius, y - radius);
        ctx.lineTo(x - radius, y + radius);
        ctx.stroke();
      } else if (effect.kind === "damage") {
        const x = this.ox + effect.x * this.s;
        const y = this.oy + (effect.y - progress * 18) * this.s;
        ctx.font = 'bold 12px "Noto Serif TC","PMingLiU",serif';
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#160a06";
        ctx.strokeText(`-${effect.value}`, x, y);
        ctx.fillStyle = effect.color ?? "#ff9a78";
        ctx.fillText(`-${effect.value}`, x, y);
      } else if (effect.kind === "position") {
        const labels = { flank: "側擊", rear: "背擊", surround: "包圍" };
        const x = this.ox + effect.x * this.s;
        const y = this.oy + (effect.y - progress * 12) * this.s;
        const text = labels[effect.label] ?? "夾擊";
        ctx.font = 'bold 13px "Noto Serif TC","PMingLiU",serif';
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#241000";
        ctx.strokeText(text, x, y);
        ctx.fillStyle = effect.label === "rear" ? "#ff754f" : "#ffd45a";
        ctx.fillText(text, x, y);
      } else if (effect.kind === "charge" || effect.kind === "volley") {
        const x = this.ox + effect.x * this.s;
        const y = this.oy + (effect.y - progress * 12) * this.s;
        const text = effect.kind === "charge" ? "衝鋒" : `齊射×${effect.count}`;
        ctx.font = 'bold 13px "Noto Serif TC","PMingLiU",serif';
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#241000";
        ctx.strokeText(text, x, y);
        ctx.fillStyle = effect.kind === "charge" ? "#ff9a4a" : "#d9f1ff";
        ctx.fillText(text, x, y);
      }
      ctx.restore();
    }
  }
}

function survivorsOf(s, side) {
  return s.units
    .filter((u) => u.side === side)
    .reduce((a, u) => a + Math.max(0, u.troops | 0), 0);
}

/** A426/A436 BATTLE.DAT VM io：规则读写直接落到OriginalBattleSession。 */
function makeBattleIO(view) {
  const battle = view.battle;
  const session = battle.session;
  // A4BF/A52E等脚本处理器固定以0x600侧为脚本命令区，0侧为另一侧。
  const activeBase = 0x600;
  const otherBase = 0;
  const groupAddress = (base, group, slot = 0) =>
    base + group * 0x100 + slot * 0x20;
  const maximumNormalizedCommand = (base) => {
    let value = 0;
    for (let group = 0; group < 6; group++) {
      const command = session.pool.read8(groupAddress(base, group), 0x1a);
      const normalized = command < 4 ? command : 0;
      if (normalized > value) value = normalized;
    }
    return value;
  };
  return {
    issueCmd(command, group) {
      issueOriginalScriptCommand(session.pool, session.registers, {
        group,
        command,
        themeFlag: (session.registers.themeFlag & 0xff) !== 0,
      });
    },
    formation() {
      const accepted = issueOriginalScriptCommand(
        session.pool,
        session.registers,
        {
          group: 7,
          command: 5,
          themeFlag: (session.registers.themeFlag & 0xff) !== 0,
        },
      );
      if (accepted) session.emitTalk(1, 0x1af, "A500/A8F6");
    },
    select(groupNumber, command) {
      issueOriginalCommandByGroupNumber(session.pool, {
        groupNumber,
        command,
        themeFlag: (session.registers.themeFlag & 0xff) !== 0,
      });
    },
    command(value) {
      session.registers.scriptCommandByte = value & 0xff;
      session.registers.side1FormationOffset = ((value & 0xff) * 0x60) & 0xffff;
    },
    scriptMessage(selector, side) {
      // A69F至多调用一次C315；CX=0x1CE+脚本AH，是TALK选择值而非军旗数。
      view.scriptMessageCount = (view.scriptMessageCount ?? 0) + 1;
      view.lastScriptMessageSelector = selector & 0xffff;
      session.emitTalk(side, selector, "A69F");
    },
    formationBaseX(x) {
      session.registers.side1FormationBase =
        (session.registers.side1FormationBase & 0xff00) | (x & 0xff);
    },
    balance: () => ({
      side1Timed: session.registers.side1Timed & 0xff,
      d31e: session.registers.d31e & 0xff,
    }),
    moving: () => session.pool.read8(activeBase, 0x1b) >= 9,
    scanUnits(area) {
      return maximumNormalizedCommand(
        area === "active" ? activeBase : otherBase,
      );
    },
    scan16() {
      let minimum = 0xffff;
      let anyBit0 = false;
      for (const record of session.wallRecords().slice(0, 16)) {
        if (record.kind !== 1) continue;
        if ((record.flags & 1) !== 0) anyBit0 = true;
        minimum = Math.min(minimum, record.metric & 0xffff);
      }
      if (minimum === 0xffff) return 0xff;
      return anyBit0 ? 0 : Math.min(0xff, (minimum * 4) >> 8);
    },
    mapWord(offset) {
      const side = offset === 0x24 ? 1 : 0;
      return session.temps.read16(side, 4);
    },
    nextRandomByte: () => session.rng.nextByte(),
    gate2: () => session.registers.winnerState === 2,
    winnerState: () => session.registers.winnerState & 0xff,
    themeFlag: () => (session.registers.themeFlag & 0xff) !== 0,
    d346: () => session.registers.selectedFormation ?? 0,
    d33c: () => session.registers.side0FormationBase & 0xff,
    d31d: () => session.registers.side1Active & 0xff,
    unitByte: (offset) =>
      session.pool.read8(groupAddress(activeBase, 0), offset),
  };
}
