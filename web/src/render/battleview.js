// 战场视图 — 全屏覆盖层: BATTLE.MAP 战场地形 + 单位横幅/血条 + 点选指挥
// 素材: grf/battle_map_{layout}.png (1024×1024, 64 图块 × 16px)
import {
  FIELD,
  TACTICAL_UNIT_TYPES,
  advanceOriginalScriptFrame,
  initializeVisualBattleStartup,
  queueTacticalCommand,
  settleVisualBattle,
} from "../game/tacticalbattle.js";
import { BattleScript } from "../game/battlescript.js";
import {
  issueOriginalCommandByGroupNumber,
  issueOriginalScriptCommand,
} from "../game/battle/originalcommands.js";
import { factionColorEx } from "../game/world.js";
import { loadImage, portrait } from "../core/assets.js";
import { clickSfx } from "../core/speaker.js";
import { wallDestroyed, wallRect } from "../game/battlewalls.js";
import { consumeTacticalFrameBudget } from "../game/tacticalclock.js";

const TACTICAL_SIDEBAR_WIDTH = 144;

export class BattleView {
  /** @param cv 覆盖层 canvas(#bcv) @param app 引擎句柄(用 clock/battle) */
  constructor(cv, app) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.app = app;
    this.active = false;
    this.battle = null;
    this.mapImg = null;
    this.sceneCanvas = document.createElement("canvas");
    this.sceneCanvas.width = FIELD;
    this.sceneCanvas.height = FIELD;
    this.sceneReady = false;
    this.sel = null; // 选中单位
    this.battleScriptVm = null; // 0x9FA0每逻辑帧持续执行的BATTLE.DAT VM
    this.scriptAccumulator = 0;
    this.flagPulse = 0; // op16/C315逐次投影的军旗绘制脉冲
    this.flagDrawCount = 0;
    this._raf = 0;
    this._last = 0;
    // 战场以原始 1:1 像素合成完整 1024×1024 场景；小窗口只改变可见范围。
    this.camera = { x: 0, y: 0 };
    this.ox = 0;
    this.oy = 0;
    this.s = 1;
    this.drag = null;
    this._panelSignature = "";
    this.dialogueSequence = -1;
    this.dialogueFaces = { atk: null, def: null };
    this.runtimeEnabled = true;

    cv.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    cv.addEventListener("pointermove", (e) => this.onPointerMove(e));
    cv.addEventListener("pointerup", (e) => this.onPointerUp(e));
    cv.addEventListener("pointercancel", (e) => this.cancelDrag(e));
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
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
    document.querySelector("#bsiege").addEventListener("click", () => {
      clickSfx();
      this.issueTacticalCommand("siege");
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
  }

  setRuntimeEnabled(enabled) {
    this.runtimeEnabled = Boolean(enabled);
  }

  playerSide() {
    const pf = this.app.scenario.player_faction;
    if (!this.battle) return null;
    return this.battle.A.faction === pf ? "atk" : "def";
  }

  /** 开战：暂停战略时钟→A1C5启动→持续9FA0输入/A426/A065主循环。 */
  async open(battle, onFinish) {
    this.battle = battle;
    this.onFinish = onFinish;
    this.sel = null;
    this.dialogueSequence = -1;
    this.clearBattleDialogue();
    this.loadBattleDialogueFaces();
    this.focusCameraOnPlayer();
    this.updateCursor();
    this.prevClockState = {
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
    try {
      this.mapImg = await loadImage(`grf/battle_map_${battle.layout}.png`);
    } catch {
      this.mapImg = null;
    }
    this.composeBattlefield();
    this.active = true;
    try {
      initializeVisualBattleStartup(battle);
    } catch (error) {
      this.active = false;
      this.cv.style.display = "none";
      document.querySelector("#bctl").style.display = "none";
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.app.clock.hold = this.prevClockState.hold;
      throw error;
    }
    this.startBattleScript();
    document.querySelector("#bctl").style.display = "block";
    this._last = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      if (!this.runtimeEnabled || this.app.runtimeEnabled === false) {
        this._last = now;
        this._raf = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.05, (now - this._last) / 1000);
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
    this.scriptAccumulator = 0;
    this.app.hud.flashEvent("⚔ 開戰");
  }

  /** 每逻辑帧严格执行输入队列→A426→A065，直到战斗本身结束。 */
  updateBattleFrames(dt) {
    const budget = consumeTacticalFrameBudget(
      this.scriptAccumulator,
      Math.max(0, dt) * 1000,
      this.app.tacticalSpeed ?? 2,
    );
    this.scriptAccumulator = budget.remainderMs;
    let frames = 0;
    while (!this.battle.session.finished && frames < budget.frames) {
      advanceOriginalScriptFrame(this.battle, this.battleScriptVm);
      frames++;
    }
    this.flagPulse = Math.max(0, this.flagPulse - dt * 2);
    return this.battle.over;
  }

  /** 结束：战果只来自OriginalBattleSession.settleExit。 */
  finish() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.battleScriptVm = null;
    this.scriptAccumulator = 0;
    this.drag = null;
    this.clearBattleDialogue();
    this.cv.style.display = "none";
    document.querySelector("#bctl").style.display = "none";
    if (this.prevClockState) {
      this.app.clock.strategicSpeed = this.prevClockState.strategicSpeed;
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.app.clock.hold = this.prevClockState.hold;
      this.prevClockState = null;
    }
    const cb = this.onFinish;
    this.onFinish = null;
    cb?.(settleVisualBattle(this.battle));
  }

  playerUnits() {
    const side = this.playerSide();
    return (
      this.battle?.units
        .filter((u) => u.side === side)
        .sort((a, b) => a.idx - b.idx) ?? []
    );
  }

  selectedUnits() {
    if (this.sel && !this.sel.gone) return [this.sel];
    return this.playerUnits().filter((u) => !u.gone);
  }

  selectPlayerUnit(index) {
    const unit = this.playerUnits()[index];
    if (!unit || unit.routed || unit.gone) return;
    this.sel = this.sel === unit ? null : unit;
    this.updateCursor();
    this.syncBattlePanel();
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
    if (
      (command === "siege" || command === "wall") &&
      this.battle.kind !== "siege"
    ) {
      this.setCommandHint(
        command === "siege"
          ? "野戰與水戰不能下達攻城命令。"
          : "野戰與水戰沒有城壁目標。",
        "blocked",
      );
      return;
    }
    const units = this.selectedUnits();
    if (!units.length && command !== "retreat") return;
    const groups = units.map((unit) => unit.strategicIndex ?? unit.idx);
    if (!queueTacticalCommand(this.battle, { groups, command })) return;
    if (command === "retreat") {
      this.sel = null;
      this.setCommandHint("所選部隊開始退卻。", "retreat");
      this.announceBattleDialogue(
        this.playerSide(),
        "全軍撤退！！",
        "manual-retreat",
      );
      this.updateCursor();
      this.syncBattlePanel();
      return;
    }

    if (command === "assault") {
      this.setCommandHint("所選部隊向敵軍突擊。", command);
      this.announceBattleDialogue(
        this.playerSide(),
        "全軍，向敵陣突擊！",
        command,
      );
    } else if (command === "siege") {
      this.setCommandHint("所選部隊向城壁缺口進軍並攻擊。", command);
      this.announceBattleDialogue(
        this.playerSide(),
        "攻向城壁，打開突破口！",
        command,
      );
    } else if (command === "formation") {
      this.setCommandHint("所選部隊在當前位置重新集結列陣。", command);
      this.announceBattleDialogue(this.playerSide(), "擺出陣形！！", command);
    } else if (command === "wall") {
      this.setCommandHint("所選部隊集中破壞最近城壁。", command);
      this.announceBattleDialogue(this.playerSide(), "集中攻擊城壁！", command);
    } else if (command === "defend") {
      this.setCommandHint("所選部隊原地守陣。", command);
      this.announceBattleDialogue(
        this.playerSide(),
        "守住陣地，不可妄動！",
        command,
      );
    }
    this.syncBattlePanel();
  }

  setCommandHint(text, command = null) {
    const hint = document.querySelector("#bcommandhint");
    hint.textContent = text;
    hint.dataset.command = command ?? "";
  }

  clearBattleDialogue() {
    for (const side of ["atk", "def"]) {
      const box = document.querySelector(`#bdialogue-${side}`);
      const text = document.querySelector(`#bdialogue-${side}-text`);
      const face = document.querySelector(`#bdialogue-${side}-face`);
      if (box) box.dataset.kind = "";
      if (text) text.textContent = "－－－";
      if (face) face.removeAttribute("src");
    }
  }

  async loadBattleDialogueFaces() {
    for (const side of ["atk", "def"]) {
      const speaker = this.battle?.speakers?.[side];
      let image = null;
      if (speaker?.portrait != null)
        image = await portrait(speaker.portrait).catch(() => null);
      if (!image)
        image = await loadImage("grf/ui/message_npc.png").catch(() => null);
      if (!this.active && this.battle == null) return;
      this.dialogueFaces[side] = image;
      const face = document.querySelector(`#bdialogue-${side}-face`);
      if (face && image?.src) face.src = image.src;
    }
  }

  showBattleDialogue(event) {
    if (!event || (event.side !== "atk" && event.side !== "def")) return;
    const side = event.side;
    const box = document.querySelector(`#bdialogue-${side}`);
    const name = document.querySelector(`#bdialogue-${side}-name`);
    const text = document.querySelector(`#bdialogue-${side}-text`);
    if (box) box.dataset.kind = event.kind ?? "battle";
    if (name)
      name.textContent =
        event.speaker ??
        this.battle?.speakers?.[side]?.name ??
        (side === "atk" ? this.battle?.A?.leader : this.battle?.D?.leader) ??
        (side === "atk" ? "攻方" : "守方");
    if (text) text.textContent = event.text ?? "……";
  }

  syncBattleDialogue() {
    for (const event of this.battle?.dialogues ?? []) {
      if ((event.sequence ?? -1) <= this.dialogueSequence) continue;
      this.dialogueSequence = event.sequence;
      this.showBattleDialogue(event);
    }
  }

  announceBattleDialogue(side, text, kind = "command") {
    if (!this.battle || !text) return;
    this.battle.dialogues ??= [];
    const event = {
      sequence: this.battle.nextDialogueSequence ?? 0,
      side,
      speaker:
        side === "atk"
          ? this.battle.A?.leader
          : (this.battle.D?.leader ?? this.battle.speakers?.def?.name),
      text,
      kind,
    };
    this.battle.nextDialogueSequence = event.sequence + 1;
    this.battle.dialogues.push(event);
    this.syncBattleDialogue();
  }

  syncBattlePanel() {
    if (!this.battle) return;
    this.syncBattleDialogue();
    const def = this.battle.units.filter((u) => u.side === "def");
    const sideMorale = (sideName) => {
      const side = this.battle.sideMap?.[sideName];
      return side == null ? 0 : this.battle.session.temps.read8(side, 6) & 0xff;
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
    const units = this.playerUnits();
    const signature = [
      this.battle.kind,
      this.battle.terrain?.key ?? "",
      atkName,
      defName,
      atkTroops,
      defTroops,
      atkMorale,
      defMorale,
      this.sel?.idx ?? -1,
      this.battle.wallRevision ?? 0,
      ...(this.battle.wallRecords ?? []).map(
        (wall) => `${wall.index}:${wall.metric | 0}:${wall.flags | 0}`,
      ),
      ...units.map(
        (u) =>
          `${u.idx}:${u.type ?? 0}:${u.troops | 0}:${u.routed ? 1 : 0}:${u.gone ? 1 : 0}`,
      ),
    ].join("|");
    if (signature === this._panelSignature) return;
    this._panelSignature = signature;

    document.querySelector("#btitle").textContent =
      `${this.battle.title}　${this.battle.terrain?.label ?? ""}`;
    document.querySelector("#batkname").textContent = `${atkName}軍（攻）`;
    document.querySelector("#bdefname").textContent = `${defName}軍（守）`;
    document.querySelector("#batktroops").textContent = atkTroops;
    document.querySelector("#bdeftroops").textContent = defTroops;
    document.querySelector("#batkmorale").textContent = atkMorale;
    document.querySelector("#bdefmorale").textContent = defMorale;
    document.querySelector("#bdialogue-atk-name").textContent = atkName;
    document.querySelector("#bdialogue-def-name").textContent = defName;

    for (let i = 0; i < 6; i++) {
      const button = document.querySelector(`#bunit${i}`);
      const unit = units[i];
      button.disabled = !unit || unit.routed || unit.gone;
      button.textContent = unit
        ? `${unit.typeLabel ?? TACTICAL_UNIT_TYPES[unit.type]?.label ?? i + 1}\n${Math.max(0, unit.troops | 0)}`
        : `${i + 1}\n－－`;
      button.dataset.unitType = unit?.typeKey ?? "empty";
      button.classList.toggle("selected", this.sel === unit);
    }
    const siegeOnly = this.battle.kind !== "siege";
    document.querySelector("#bsiege").disabled = siegeOnly;
    document.querySelector("#bwall").disabled = siegeOnly;
  }

  composeBattlefield() {
    const ctx = this.sceneCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, FIELD, FIELD);
    if (this.mapImg) ctx.drawImage(this.mapImg, 0, 0, FIELD, FIELD);
    this.sceneReady = true;
  }

  battlefieldViewport() {
    const width = Math.max(1, innerWidth - TACTICAL_SIDEBAR_WIDTH);
    return { width, height: Math.max(1, innerHeight) };
  }

  focusCameraOnPlayer() {
    const side = this.playerSide();
    const units = this.battle?.units.filter((u) => u.side === side && !u.gone);
    const focusX = units?.length
      ? units.reduce((sum, u) => sum + (u.hx ?? u.x), 0) / units.length
      : FIELD / 2;
    const focusY = units?.length
      ? units.reduce((sum, u) => sum + (u.hy ?? u.y), 0) / units.length
      : FIELD / 2;
    const viewport = this.battlefieldViewport();
    this.camera.x = focusX - viewport.width / 2;
    this.camera.y = focusY - viewport.height / 2;
    this.clampCamera();
  }

  clampCamera() {
    const viewport = this.battlefieldViewport();
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const maxX = Math.max(0, FIELD - viewportWidth / this.s);
    const maxY = Math.max(0, FIELD - viewportHeight / this.s);
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
    else this.cv.style.cursor = this.sel ? "crosshair" : "grab";
  }

  onPointerDown(e) {
    if (!this.active || e.button !== 0) return;
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
    const wx = (px - this.ox) / this.s,
      wy = (py - this.oy) / this.s;
    if (wx < 0 || wy < 0 || wx > FIELD || wy > FIELD) return;
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
    if (hit) this.sel = this.sel === hit ? null : hit;
    // 原版战术地图空白左键只参与按钮/组选择流程，不存在任意坐标移动命令。
    // Canvas不得写无规则消费者的legacy unit.order。
    this.updateCursor();
    this.syncBattlePanel();
  }

  draw() {
    const { ctx, cv } = this;
    if (cv.width !== innerWidth) cv.width = innerWidth;
    if (cv.height !== innerHeight) cv.height = innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!this.battle) return;

    // 与战略地图相同，固定 100% 比例；视口小于战场时通过拖动相机查看。
    this.s = 1;
    this.clampCamera();
    const viewport = this.battlefieldViewport();
    this.ox =
      viewport.width >= FIELD
        ? Math.floor((viewport.width - FIELD) / 2)
        : -this.camera.x;
    this.oy =
      viewport.height >= FIELD
        ? Math.floor((viewport.height - FIELD) / 2)
        : -this.camera.y;
    const mapSize = FIELD;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.clip();
    if (this.battle.mirror) {
      ctx.translate(this.ox + mapSize, this.oy);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.sceneReady ? this.sceneCanvas : this.mapImg,
        0,
        0,
        mapSize,
        mapSize,
      );
    } else if (this.sceneReady || this.mapImg) {
      ctx.drawImage(
        this.sceneReady ? this.sceneCanvas : this.mapImg,
        this.ox,
        this.oy,
        mapSize,
        mapSize,
      );
    }
    if (this.battle.terrain?.key === "water") {
      const waveOffset = ((this.battle.time ?? 0) * 18) % 32;
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#bfeaff";
      ctx.lineWidth = 1;
      for (let y = -32 + waveOffset; y < FIELD; y += 32) {
        ctx.beginPath();
        for (let x = 0; x <= FIELD; x += 32) {
          const sx = this.ox + x * this.s;
          const sy = this.oy + (y + Math.sin((x + y) / 34) * 3) * this.s;
          if (x === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.battle.kind === "siege") {
      for (const wall of this.battle.wallRecords ?? []) {
        if (!wallDestroyed(wall)) continue;
        const rect = wallRect(wall);
        if (!rect) continue;
        const x = this.ox + rect.left * this.s;
        const y = this.oy + rect.top * this.s;
        const width = (rect.right - rect.left) * this.s;
        const height = (rect.bottom - rect.top) * this.s;
        ctx.fillStyle = "rgba(18, 12, 8, .78)";
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = "#d8a840";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + height * 0.2);
        ctx.lineTo(x + width, y + height * 0.45);
        ctx.moveTo(x, y + height * 0.65);
        ctx.lineTo(x + width, y + height * 0.9);
        ctx.stroke();
      }
    }
    for (const u of this.battle.units) {
      if (u.gone) continue;
      const attackDirection = u.side === "atk" ? 1 : -1;
      const attackOffset = (u.attackPulse ?? 0) > 0 ? attackDirection * 3 : 0;
      const x = this.ox + (u.x + attackOffset) * this.s,
        y = this.oy + u.y * this.s;
      const facIdx =
        u.side === "atk"
          ? this.battle.A.faction
          : (this.battle.D?.faction ?? this.battle.city?.faction);
      const col = factionColorEx(this.app?.scenario, facIdx ?? 0);
      const w = 14 * this.s,
        h = 18 * this.s;
      // 旗身
      let unitColor = col;
      if (u.routed) unitColor = "#555";
      else if ((u.hitPulse ?? 0) > 0) unitColor = "#fff";
      ctx.fillStyle = unitColor;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.lineWidth = Math.max(1, 1.5 * this.s);
      if (this.sel === u) ctx.strokeStyle = "#ffd700";
      else ctx.strokeStyle = u.side === "atk" ? "#fff" : "#222";
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      if (this.battle.terrain?.key === "water" && !u.routed) {
        ctx.strokeStyle = "rgba(192, 234, 255, .9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 10, y + h / 2 + 3);
        ctx.quadraticCurveTo(x, y + h / 2 + 7, x + 10, y + h / 2 + 3);
        ctx.stroke();
      }
      // 兵种标识：战略记录的1骑/2步/3弓直接带入战术层。
      ctx.font = '10px "Noto Serif TC","PMingLiU",serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff7c4";
      ctx.fillText(
        u.typeLabel ?? TACTICAL_UNIT_TYPES[u.type]?.label ?? "兵",
        x,
        y,
      );
      ctx.textBaseline = "alphabetic";
      // 兵力条
      const fill = Math.max(0, u.troops / u.maxTroops);
      ctx.fillStyle = "#300";
      ctx.fillRect(x - w / 2, y - h / 2 - 7 * this.s, w, 4 * this.s);
      if (fill > 0.5) ctx.fillStyle = "#7c5";
      else if (fill > 0.25) ctx.fillStyle = "#fc5";
      else ctx.fillStyle = "#f55";
      ctx.fillRect(x - w / 2, y - h / 2 - 7 * this.s, w * fill, 4 * this.s);
      // 开场军旗投影 (BATTLE.DAT op16逐次调用0xC315)
      if (this.flagPulse > 0 && !u.routed) {
        ctx.globalAlpha = this.flagPulse * 0.5;
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = Math.max(1, 2 * this.s);
        ctx.strokeRect(
          x - w / 2 - 3 * this.s,
          y - h / 2 - 3 * this.s,
          w + 6 * this.s,
          h + 6 * this.s,
        );
        ctx.globalAlpha = 1;
      }
      // 主将名
      if (this.s > 0.45) {
        ctx.font = `${Math.round(11 * Math.min(1.4, this.s))}px "Noto Serif TC","PMingLiU",serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,.8)";
        ctx.strokeText(u.label, x, y + h / 2 + 12 * this.s);
        ctx.fillStyle = "#ffe9a0";
        ctx.fillText(u.label, x, y + h / 2 + 12 * this.s);
        ctx.textAlign = "start";
      }
    }
    this.drawBattleEffects(ctx);
    ctx.restore();
    // 计时/兵力总览
    const ta = survivorsOf(this.battle, "atk"),
      td = survivorsOf(this.battle, "def");
    ctx.font = '16px "Noto Serif TC","PMingLiU",serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.8)";
    const txt = `攻 ${ta}   ⚔   守 ${td}`;
    ctx.strokeText(txt, 16, 30);
    ctx.fillStyle = "#e8d9b0";
    ctx.fillText(txt, 16, 30);
    this.syncBattlePanel();
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
      issueOriginalScriptCommand(session.pool, session.registers, {
        group: 7,
        command: 5,
        themeFlag: (session.registers.themeFlag & 0xff) !== 0,
      });
    },
    select(groupNumber, command) {
      issueOriginalCommandByGroupNumber(session.pool, {
        groupNumber,
        command,
        themeFlag: (session.registers.themeFlag & 0xff) !== 0,
      });
      view.flagPulse = Math.max(view.flagPulse, 0.6);
    },
    command(value) {
      session.registers.scriptCommandByte = value & 0xff;
      session.registers.side1FormationOffset = ((value & 0xff) * 0x60) & 0xffff;
    },
    flags(count) {
      // A69F：AH次调用C315。C315只读战术记录并绘制军旗，不改规则对象；
      // Canvas逐次记录相同调用次数并刷新投影，避免把AH误作“阶段号”。
      for (let index = 0; index < (count & 0xff); index++) {
        view.flagDrawCount = (view.flagDrawCount ?? 0) + 1;
        view.flagPulse = 1;
      }
    },
    camMode(mode) {
      view.camMode = mode;
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
    themeFlag: () => (session.registers.themeFlag & 0xff) !== 0,
    d346: () => session.registers.cameraColumn ?? 0,
    d33c: () => session.registers.side0FormationBase & 0xff,
    d31d: () => session.registers.side1Active & 0xff,
    unitByte: (offset) =>
      session.pool.read8(groupAddress(activeBase, 0), offset),
  };
}
