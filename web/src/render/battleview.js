// 战场视图 — 全屏覆盖层: BATTLE.MAP 战场地形 + 单位横幅/血条 + 点选指挥
// 素材: grf/battle_map_{layout}.png (1024×1024, 64 图块 × 16px)
import { FIELD, placeStaging } from "../game/battle.js";
import { BattleScript } from "../game/battlescript.js";
import { factionColorEx } from "../game/world.js";
import { loadImage } from "../core/assets.js";
import { clickSfx } from "../core/speaker.js";

export const TACTICAL_SPEED_LABELS = [
  "最低速",
  "低速",
  "普通",
  "高速",
  "最高速",
];
export const TACTICAL_SPEED_FACTORS = [0.5, 0.75, 1.0, 1.5, 2.5];

export class BattleView {
  /** @param cv 覆盖层 canvas(#bcv) @param app 引擎句柄(用 clock/battle) */
  constructor(cv, app) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.app = app;
    this.active = false;
    this.battle = null;
    this.mapImg = null;
    this.sel = null; // 选中单位
    this.cutscene = null; // BATTLE.DAT 开场脚本回放态 (BattleScript + 元数据)
    this.flagPulse = 0; // op16 军旗绘制脉冲 (视觉反馈)
    this._raf = 0;
    this._last = 0;
    // 视口变换(draw 时算好, 点击换算用)
    this.ox = 0;
    this.oy = 0;
    this.s = 1;

    cv.addEventListener("mousedown", (e) => {
      if (this.cutscene) {
        this.endCutscene(true); // 开场任意点击跳过
        return;
      }
      this.onClick(e.clientX, e.clientY);
    });
    document.querySelector("#bassault").addEventListener("click", () => {
      clickSfx();
      if (this.cutscene) this.endCutscene(true);
      this.assault();
    });
    document.querySelector("#bretreat").addEventListener("click", () => {
      clickSfx();
      if (this.cutscene) this.endCutscene(true);
      this.finish(this.playerSide() === "atk" ? "def" : "atk", true);
    });
    document.querySelector("#bauto").addEventListener("click", async () => {
      clickSfx();
      if (this.cutscene) this.endCutscene(true);
      const { autoResolve } = await import("../game/battle.js");
      autoResolve(this.battle);
    });
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
    this.prevClockState = {
      strategicSpeed: this.app.clock.strategicSpeed,
      legacyPaused: this.app.clock._legacyPaused,
    };
    this.app.clock._legacyPaused = true; // ★战术时间接管 (原版战略/战术速度分离)
    this.cv.style.display = "block";
    document.querySelector("#bctl").style.display = "none"; // 开场期间隐藏指挥按钮
    document.querySelector("#btitle").textContent = battle.title;
    try {
      this.mapImg = await loadImage(`grf/battle_map_${battle.layout}.png`);
    } catch {
      this.mapImg = null;
    }
    this.active = true;
    this.startCutscene();
    if (!this.cutscene) document.querySelector("#bctl").style.display = "block";
    this._last = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      const factor = this.app.tacticalSpeedFactor ?? 1.0;
      import("../game/battle.js").then(({ tickBattle }) => {
        if (this.cutscene) this.updateCutscene(dt * factor);
        else {
          const over = tickBattle(battle, dt * factor);
          if (over) {
            this.draw();
            this.finish(over, false);
            return;
          }
        }
        this.draw();
        this._raf = requestAnimationFrame(loop);
      });
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
  }

  /** 结束: outcome=atk|def; retreat=true 表示攻方主动撤军 */
  finish(outcome, retreat) {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.cutscene = null;
    this.cv.style.display = "none";
    document.querySelector("#bctl").style.display = "none";
    if (this.prevClockState) {
      this.app.clock.strategicSpeed = this.prevClockState.strategicSpeed;
      this.app.clock._legacyPaused = this.prevClockState.legacyPaused;
      this.prevClockState = null;
    }
    const cb = this.onFinish;
    this.onFinish = null;
    cb?.({
      winner: outcome,
      retreat,
      atkLeft: survivorsOf(this.battle, "atk"),
      defLeft: survivorsOf(this.battle, "def"),
    });
  }

  assault() {
    for (const u of this.battle.units)
      if (u.side === this.playerSide() && !u.routed && !u.gone) u.order = null;
    this.sel = null;
  }

  onClick(px, py) {
    if (!this.active) return;
    // 屏幕→战场坐标
    const wx = (px - this.ox) / this.s,
      wy = (py - this.oy) / this.s;
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
  }

  draw() {
    const { ctx, cv } = this;
    cv.width = innerWidth;
    cv.height = innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!this.battle) return;

    this.s = Math.min(cv.width / FIELD, cv.height / FIELD) * 1.6;
    this.ox = (cv.width - FIELD * this.s) / 2;
    this.oy = (cv.height - FIELD * this.s) / 2;
    ctx.drawImage(
      this.mapImg ?? cv,
      this.ox,
      this.oy,
      FIELD * this.s,
      FIELD * this.s,
    );

    for (const u of this.battle.units) {
      if (u.gone) continue;
      const x = this.ox + u.x * this.s,
        y = this.oy + u.y * this.s;
      const facIdx =
        u.side === "atk" ? this.battle.A.faction : this.battle.city.faction;
      const col = factionColorEx(this.app?.scenario, facIdx ?? 0);
      const w = 14 * this.s,
        h = 18 * this.s;
      // 旗身
      ctx.fillStyle = u.routed ? "#555" : col;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.lineWidth = Math.max(1, 1.5 * this.s);
      if (this.sel === u) ctx.strokeStyle = "#ffd700";
      else ctx.strokeStyle = u.side === "atk" ? "#fff" : "#222";
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
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
      const c = b.city;
      const t = c?.sim ? c.sim.troops : c?.troops;
      return Math.min(0xff, (t ?? 0) >> 5);
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
