// 战场视图 — 全屏覆盖层: BATTLE.MAP 战场地形 + 单位横幅/血条 + 点选指挥
// 素材: grf/battle_map_{layout}.png (1024×1024, 64 图块 × 16px)
import {
  FIELD,
  TACTICAL_UNIT_TYPES,
  advanceVisualBattle,
  placeStaging,
  queueTacticalCommand,
  settleVisualBattle,
} from "../game/tacticalbattle.js";
import { BattleScript } from "../game/battlescript.js";
import { factionColorEx } from "../game/world.js";
import { loadImage, portrait } from "../core/assets.js";
import { clickSfx } from "../core/speaker.js";
import { wallDestroyed, wallRect } from "../game/battlewalls.js";

export const TACTICAL_SPEED_LABELS = [
  "最低速",
  "低速",
  "普通",
  "高速",
  "最高速",
];
export const TACTICAL_SPEED_FACTORS = [0.5, 0.75, 1.0, 1.5, 2.5];

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
    this.cutscene = null; // BATTLE.DAT 开场脚本回放态 (BattleScript + 元数据)
    this.flagPulse = 0; // op16 军旗绘制脉冲 (视觉反馈)
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
        if (this.cutscene) this.endCutscene(true);
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

  /** 开战: 暂停战略时钟 → 加载地图 → 回放开场脚本 → 进入主循环 */
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
    };
    this.app.clock._legacyPaused = true; // ★战术时间接管 (原版战略/战术速度分离)
    this.cv.style.display = "block";
    document.querySelector("#bctl").style.display = "none"; // 开场期间隐藏指挥按钮
    document.querySelector("#btitle").textContent = battle.title;
    this.syncBattlePanel();
    try {
      this.mapImg = await loadImage(`grf/battle_map_${battle.layout}.png`);
    } catch {
      this.mapImg = null;
    }
    this.composeBattlefield();
    this.active = true;
    this.startCutscene();
    if (!this.cutscene) document.querySelector("#bctl").style.display = "block";
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
      const factor = this.app.tacticalSpeedFactor ?? 1.0;
      if (this.cutscene) this.updateCutscene(dt * factor);
      else {
        const over = advanceVisualBattle(battle, dt * factor);
        if (over) {
          this.draw();
          this.finish(false);
          return;
        }
      }
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** BATTLE.DAT 开场: 单位退场边待命, VM 驱动列阵/移动/军旗 (无脚本素材则跳过) */
  startCutscene() {
    const scripts = this.app.battleScripts;
    const b = this.battle;
    if (!scripts?.[0]?.length) return;
    // 编制类型真实判定 (0xCBE5): 块号 = 军团编制字节×4 + 攻守；编制 1..4 → 索引 0..3
    const type = Math.min(3, Math.max(0, (b.formation ?? 1) - 1));
    const side = this.playerSide() === "atk" ? 0 : 1;
    const words = scripts[type * 4 + side];
    if (!words) return;
    placeStaging(b);
    this.cutscene = {
      vm: new BattleScript(words, makeBattleIO(this)),
      t: 0,
      acc: 0,
    };
    this.app.hud.flashEvent("⚔ 開戰（點擊跳過開場）");
  }

  /** 开场帧推进: 60fps 虚拟帧驱动 VM + 单位行军 */
  updateCutscene(dt) {
    const cs = this.cutscene,
      b = this.battle;
    cs.t += dt;
    cs.acc += dt * 60;
    while (cs.acc >= 1 && this.cutscene) {
      cs.acc -= 1;
      if (cs.vm.step() === "done") this.endCutscene(false);
    }
    // 单位向指令目标行军 (与 tickBattle 同速逻辑)
    for (const u of b.units) {
      if (u.gone || !u.order) continue;
      const dx = u.order.x - u.x,
        dy = u.order.y - u.y,
        d = Math.hypot(dx, dy);
      if (d < 6) u.order = null;
      else {
        const st = Math.min(d, u.speed * dt);
        u.x += (dx / d) * st;
        u.y += (dy / d) * st;
      }
    }
    this.flagPulse = Math.max(0, this.flagPulse - dt * 2);
    // 安全阀: 超时强收 (结尾 WAIT(255) 待机循环节流)
    if (this.cutscene && cs.t > 40) this.endCutscene(false);
  }

  /** 结束开场: snap=true(用户跳过)把未到位单位收回编队槽位; 自然播完则就地清指令 */
  endCutscene(snap) {
    if (!this.cutscene) return;
    this.cutscene = null;
    for (const u of this.battle.units) {
      if (u.gone) continue;
      if (snap) {
        u.x = u.hx;
        u.y = u.hy;
      }
      u.order = null;
    }
    document.querySelector("#bctl").style.display = "block";
    this.syncBattlePanel();
  }

  /** 结束：战果只来自OriginalBattleSession.settleExit。 */
  finish(retreat = false) {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.cutscene = null;
    this.drag = null;
    this.clearBattleDialogue();
    this.cv.style.display = "none";
    document.querySelector("#bctl").style.display = "none";
    if (this.prevClockState) {
      this.app.clock.strategicSpeed = this.prevClockState.strategicSpeed;
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.prevClockState = null;
    }
    const cb = this.onFinish;
    this.onFinish = null;
    cb?.({ ...settleVisualBattle(this.battle), retreat });
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
    if (this.cutscene) this.endCutscene(true);
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
      if (this.battle.kind !== "siege") {
        this.setCommandHint("野戰與水戰不能下達攻城命令。", "blocked");
        return;
      }
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
      if (this.battle.kind !== "siege") {
        this.setCommandHint("野戰與水戰沒有城壁目標。", "blocked");
        return;
      }
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
    const atk = this.battle.units.filter((u) => u.side === "atk");
    const def = this.battle.units.filter((u) => u.side === "def");
    const averageMorale = (units) =>
      units.length
        ? Math.round(
            units.reduce((sum, u) => sum + Math.max(0, u.morale), 0) /
              units.length,
          )
        : 0;
    const atkName = this.battle.A?.leader ?? "攻方";
    const defName =
      this.battle.D?.leader ??
      def.find((u) => u.gen)?.gen ??
      this.battle.city?.name ??
      "守方";
    const atkTroops = survivorsOf(this.battle, "atk");
    const defTroops = survivorsOf(this.battle, "def");
    const atkMorale = averageMorale(atk);
    const defMorale = averageMorale(def);
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
    if (this.cutscene) this.endCutscene(true);
    else this.onClick(e.clientX, e.clientY);
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
    else if (this.sel) {
      this.sel.order = {
        x: Math.max(20, Math.min(FIELD - 20, wx)),
        y: Math.max(20, Math.min(FIELD - 20, wy)),
      };
      this.app.hud.flashEvent(`${this.sel.gen} 移動指令`);
    }
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
      // 开场军旗脉冲 (BATTLE.DAT op16 → 0xC315 画旗的 web 近似)
      if (this.cutscene && this.flagPulse > 0 && !u.routed) {
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
    const txt = this.cutscene
      ? `⚔ 開戰… ${ta} 對 ${td}（點擊跳過）`
      : `攻 ${ta}   ⚔   守 ${td}`;
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

/** VM io 钩子 → web 战斗状态映射 (控制流严格复刻; 状态查询为近似映射)
 *  单位区语义: 0x600=开场主视角方(active), 0x000=对手(other) */
function makeBattleIO(view) {
  const b = view.battle;
  const activeSide = view.playerSide() ?? "atk";
  const unitsOf = (area) =>
    b.units.filter(
      (u) =>
        !u.gone &&
        (area === "active" ? u.side === activeSide : u.side !== activeSide),
    );
  return {
    // op3: ah==5 已分流; 其余命令=向敌方向推进一段 (原版命令值→方向/步数语义)
    issueCmd(_c, sel) {
      const targets =
        sel === 7
          ? unitsOf("active")
          : [unitsOf("active")[sel]].filter(Boolean);
      for (const u of targets) {
        const dir = u.side === "atk" ? 1 : -1;
        u.order = { x: u.hx + dir * 90, y: u.hy }; // 向前探一步的可见动作
      }
    },
    formation() {
      for (const u of unitsOf("active")) u.order = { x: u.hx, y: u.hy };
    },
    select(group) {
      if (group > 1) return; // 原版 +0x24==imm*18 组选; web 仅映射 0/1 两边
      view.flagPulse = Math.max(view.flagPulse, 0.6); // 组选中→旗帜高亮脉冲
    },
    flags(stage) {
      view.flagPulse = 1; // 军旗阶段脉冲
      view.flagStage = stage;
    },
    camMode(m) {
      view.camMode = m;
    },
    camPos() {
      // 相机漂移相位: 高位>0x20 使 op8 走低位分支
      const ph = Math.floor((view.cutscene?.t ?? 0) * 8) & 0xff;
      return { hi: 0x30, lo: ph };
    },
    moving() {
      return unitsOf("active").some((u) => u.order);
    },
    scanUnits(area) {
      return unitsOf(area).some((u) => u.order) ? 1 : 0;
    },
    scan16: () => 0, // 援军记录表无对应物 → 无增援分支
    mapWord(_off) {
      let troops = b.D?.troops;
      if (b.city) troops = b.city.sim ? b.city.sim.troops : b.city.troops;
      return Math.min(0xff, (troops ?? 0) >> 5);
    },
    rand: () => Math.random(),
    gate2: () => false,
    themeFlag: () => false,
    d346: () => 0,
    d33c: () => 0,
    d31d: () => 0,
    unitByte: () => 0,
  };
}
