// 引擎主入口 — 装配数据/视图/输入/HUD
import { loadJSON, seasonTiles } from "./core/assets.js";
import { MapView, preloadEngageMarkerImages } from "./render/mapview.js";
import { attachInput } from "./core/input.js";
import { HUD } from "./ui/hud.js";
import { GameBar } from "./ui/gamebar.js";
import { Scenario, seasonOf, SEASONS } from "./game/world.js";
import { Clock } from "./game/clock.js";
import { monthlySettlement } from "./game/economy.js";
import { aiTick, buildArmies, monthlyAI } from "./game/ai.js";
import { loadTerrain } from "./game/pathfind.js";
import { classifyFieldBattleTerrain } from "./game/fieldterrain.js";
import * as cmd from "./game/commands.js";
import { monthlyAppear } from "./game/recruits.js";
import { BattleView } from "./render/battleview.js";
import { DiploView } from "./render/diploview.js";
import { EndView } from "./render/endview.js";
import { OpenView } from "./render/openview.js";
import { StartMenu } from "./ui/startmenu.js";
import * as speaker from "./core/speaker.js";
import { createBattle, createFieldBattle } from "./game/tacticalbattle.js";
import { applyBattleResult, applyFieldBattleResult } from "./game/ai.js";
import { createOriginalBattleRng } from "./game/battle/originalrng.js";
import { playEngageTransition } from "./game/engagetransition.js";
import {
  applyWebMetaToState,
  canSnapshotState,
  commitSaveImage,
  encodeWebSaveMeta,
  initSaveAssets,
  serializeSave,
  snapshotState,
  stageSave,
} from "./game/savegame.js";
import {
  InstanceLeaseError,
  instanceFetch,
  instanceRuntimeActive,
  requireInstanceRuntime,
} from "./core/singleinstance.js";

const app = {
  data: null,
  scenario: null,
  scenarioIdx: 0,
  seasonIdx: 1,
  view: null,
  hud: null,
  battleMaps: null, // BATTLE.MAP 城池→战场布局索引
  battleNavigation: null, // CAEB/BB3C/BBA6 原版tile属性与导航源
  tacticalSpeed: 2,
  tacticalSpeedFactor: 1.0,
  soundType: 1,
  originalRng: null,
  activeBattleRng: null,
  engageTransition: null,
  runtimeEnabled: instanceRuntimeActive(),
  _saveQueue: Promise.resolve(),

  setRuntimeEnabled(enabled) {
    this.runtimeEnabled = Boolean(enabled);
    this.battleView?.setRuntimeEnabled?.(this.runtimeEnabled);
    this.engageTransition?.setRuntimeEnabled?.(this.runtimeEnabled);
    if (this.clock) this.clock.hold = !this.runtimeEnabled;
  },

  loseInstanceLease() {
    this.runtimeEnabled = false;
    this.engageTransition?.suspend?.();
    this.battleView?.setRuntimeEnabled?.(false);
    if (this.clock) this.clock.hold = true;
  },

  /** 委任玩家战斗：预载四图后在战略地图按0→3播放一次，再执行0x5130。 */
  playDelegatedEngage(legion, onFinish) {
    return playEngageTransition(this, legion, onFinish, {
      prepare: () => preloadEngageMarkerImages(() => this.view?.draw?.()),
    });
  },

  /** 游戏结束：清理运行态并返回首页开局选单 (YES/NO) */
  async returnToTitle(initialAction) {
    this.engageTransition?.cancel?.();
    this.engageTransition = null;
    if (this.gamebar) {
      this.gamebar._clockHoldRequested = true;
      this.gamebar.submenuOpen = false;
      this.gamebar.miniOpen = false;
      this.gamebar.resOpen = false;
      this.gamebar.selFaction = null;
      this.gamebar.settingsOpen = false;
      this.gamebar.settingsHover = -1;
      this.gamebar.systemSaveDialog = null;
      this.gamebar.systemLoadConfirmDialog = null;
      this.gamebar.selectedSubmenu = null;
      this.gamebar.selectedCity = null;
      this.gamebar.listDialog = null;
      this.gamebar.cityCard = null;
      this.gamebar.generalCard = null;
      this.gamebar.formationDialog = null;
      this.gamebar.formationQuote = null;
      this.gamebar.financeDialog = null;
      this.gamebar.keypadDialog = null;
      this.gamebar.baseMenu = null;
      this.gamebar.personnelMenu = null;
      this.gamebar.adviceMenu = null;
      this.gamebar.closeProposalAudience?.();
      this.gamebar.legionMenu = null;
      this.gamebar.marchingOrder = null;
      this.gamebar.orderChoiceMenu = null;
      this.gamebar.choiceDialog = null;
      this.gamebar.hoverAct = null;
      this.gamebar.syncClock();
    } else if (this.clock) {
      this.clock.hold = true;
    }
    this.dispatching = null;
    this.hud?.closeAll?.();
    if (this.view) {
      this.view.selectedCity = null;
      this.view.hoverTarget = null;
      this.view.draw();
    }
    try {
      await this.startMenu.show(initialAction);
    } finally {
      if (this.gamebar) this.gamebar._clockHoldRequested = false;
      this.gamebar?.syncClock();
    }
  },

  /** 开战: 战术层接管 (玩家军团攻城/敌军犯境时由 ai.resolveBattle 调用) */
  startBattle(A, city, D = null) {
    const battle = createBattle(
      this.scenario,
      A,
      city,
      this.battleMaps,
      D,
      this.originalRng?.snapshot?.(),
    );
    this.battleView.open(battle, (exit) => {
      this.originalRng = exit.strategicRng;
      this.activeBattleRng = this.originalRng;
      applyBattleResult(
        this,
        A,
        city,
        exit.winnerName,
        null,
        null,
        null,
        null,
        D,
        null,
        null,
        exit,
      );
      this.hud.buildLegend();
      this.view.draw();
    });
  },

  /** 野外战：双方均为军团，不借用城池结算。 */
  startFieldBattle(A, D) {
    const terrain = classifyFieldBattleTerrain(
      A,
      D,
      this.scenario.player_faction,
    );
    const battle = createFieldBattle(
      this.scenario,
      A,
      D,
      this.battleMaps,
      terrain,
      this.originalRng?.snapshot?.(),
    );
    this.battleView.open(battle, (exit) => {
      this.originalRng = exit.strategicRng;
      this.activeBattleRng = this.originalRng;
      applyFieldBattleResult(
        this,
        A,
        D,
        exit.winnerName,
        null,
        null,
        null,
        null,
        exit,
      );
      this.hud.buildLegend();
      this.view.draw();
    });
  },

  checkTrustGameOver() {
    return cmd.checkTrustGameOver(this);
  },

  setScenario(i, playerFaction = null, advisor) {
    const raw = this.data.scenarios[i];
    if (playerFaction != null) raw.player_faction = playerFaction; // 开局选势力
    // 新章节初始信赖满值 255 (原版 SINARIO.DAT sc[0x10]=0xFF); 读档走 loadState 保留存档信赖
    raw.trust = 255;
    delete raw.trust_game_over;
    for (const f of raw.factions ?? []) {
      delete f.brokeMonths;
      delete f.deficitScolded;
    }
    // 軍師確認 (startmenu._advisorDialog): null=扮演原軍師NPC, 對象=自定軍師
    raw.player_advisor = null;
    if (advisor === null) {
      const f = raw.factions[raw.player_faction];
      if (f?.advisor_idx != null) {
        const g = raw.generals[f.advisor_idx];
        raw.player_advisor = {
          custom: false,
          general_idx: g.idx,
          name: g.name.trim(),
          hao: (g.hao ?? "").trim(),
          portrait: g.portrait,
        };
      }
    } else if (advisor) {
      raw.player_advisor = { custom: true, general_idx: null, ...advisor };
    }
    this.loadState(raw, i);
  },

  /** 公共装配路径: 剧本与读档共用 (raw=parse_sinario/parse_save 输出的 state) */
  loadState(raw, idx) {
    this.scenarioIdx = idx;
    this.scenario = new Scenario(raw);
    this.originalRng ??= createOriginalBattleRng();
    this.activeBattleRng = this.originalRng;
    loadTerrain().catch((error) =>
      console.error("strategic map navigation assets failed to load", error),
    );
    cmd.initPlayer(this.scenario); // ★原版剧本头FF=未指定→默认势力0/信赖100
    this.gamebar?.setDefaultSelFaction(); // 小地图默认查看第一个非玩家势力
    buildArmies(this.scenario); // 无军团→首都合成; 有真实军团(存档)→内部归一化坐标+解析主将名
    this.setSeason(seasonOf(this.scenario.start.month)); // 按起始月自动选季
    // 时钟重置到剧本起始日 (对应 SINARIO 头部时钟区)
    this.clock = new Clock({
      startYear: this.scenario.start.year,
      startMonth: this.scenario.start.month,
      startDay: this.scenario.start.day,
      onMonthEnd: (c) => {
        // ★对应 KI.EXE call 0x5358
        const rep = monthlySettlement(this.scenario, c, this.scenario.tax);
        this.hud.showSettlement(rep);
        monthlyAI(this); // ★俘虏回归/势力灭亡/流散投奔
        cmd.monthEnd(this); // ★征兵到达+信赖度动力学
        monthlyAppear(this); // ★appear_months 到期武将登场/改投(join_faction)
      },
      onDay: () => aiTick(this), // ★对应 0x3E11/0x3EFD 每日 AI tick
    });
    if (this.hud) {
      this.hud.buildLegend();
      this.hud.refreshInfo();
    }
    this.view.fit();
    // 开局定位: 地图中心 = 玩家势力首都
    const meF = this.scenario.factions.find(
      (f) => f.idx === this.scenario.player_faction,
    );
    if (meF && meF.capital != null) {
      const cap = this.scenario.city(meF.capital);
      if (cap) {
        const [wxp, wyp] = this.view.cityPixel(cap);
        this.view.cam.x = innerWidth / 2 - wxp;
        this.view.cam.y = innerHeight / 2 - wyp;
        this.view.clampCam();
      }
    }
    this.view.draw();
    this.checkTrustGameOver(); // 读入 trust=0 的坏档也立即进入结束画面
  },

  /** 单实例授权下按调用顺序串行写SAVE；lease错误禁止下载回退。 */
  async saveGame(slotIdx, label) {
    if (!instanceRuntimeActive() || !this.runtimeEnabled) {
      this.hud?.flashEvent?.("遊戲使用權已失效，無法存檔。");
      return { saved: "blocked" };
    }
    const operation = async () => {
      if (!canSnapshotState(this)) {
        this.hud?.flashEvent?.("戰鬥處理中，現在無法存檔。");
        return { saved: "blocked" };
      }
      // 内存槽与四槽binary都只在服务端确认后提交；网络/HTTP失败不得污染后续保存。
      const sv = snapshotState(this, slotIdx, label);
      const dat = stageSave(this, slotIdx, label);
      let res;
      try {
        res = await instanceFetch("/api/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Dragon-Web-Meta": encodeWebSaveMeta(slotIdx, sv.webMeta),
          },
          body: dat,
        });
      } catch (error) {
        this.hud?.flashEvent?.("存檔失敗，原存檔未變更。");
        return { saved: "failed", error };
      }
      if (res.status === 409 || res.status === 423) {
        this.loseInstanceLease();
        throw new InstanceLeaseError("lease-lost", res.status);
      }
      if (!res.ok) {
        this.hud?.flashEvent?.("存檔失敗，原存檔未變更。");
        return { saved: "failed", status: res.status };
      }
      commitSaveImage(dat);
      const cur = this.saves?.slots.find((s) => s.slot === slotIdx);
      if (cur) Object.assign(cur, sv);
      else this.saves?.slots.push(sv);
      this.hud?.flashEvent?.(`存檔：槽${slotIdx + 1} ${label}`);
      return { saved: "file" };
    };
    const queued = this._saveQueue.then(operation, operation);
    this._saveQueue = queued.catch(() => null);
    return queued;
  },

  /** 读档: 用 SAVE.DAT 槽位状态覆盖当前场景 */
  loadSave(slotIdx) {
    const sv = this.saves?.slots.find((s) => s.slot === slotIdx);
    if (!sv) return false;
    // 深拷贝: 游玩会改写 state(军团移动/死亡), 保留原始存档以便重复读档
    const state = applyWebMetaToState(
      structuredClone(sv.state),
      sv.webMeta,
    );
    this.loadState(state, sv.scenario_idx);
    const rngSnapshot = sv.webMeta?.originalRng;
    if (rngSnapshot) {
      this.originalRng.restore(rngSnapshot);
      this.activeBattleRng = this.originalRng;
    }
    // ★可选#3: 恢复存档日期 (槽头 CS:[0xCF0] 块, parse_save.py → state.save_date)
    const d = sv.state?.save_date;
    if (d) {
      this.clock.year = d.year;
      this.clock.month = d.month;
      this.clock.day = Math.min(d.day, this.clock.daysInMonth);
      this.setSeason(seasonOf(d.month));
    }
    this.hud.flashEvent(`讀檔：${sv.label}`);
    return true;
  },

  setSeason(i) {
    this.seasonIdx = i;
    seasonTiles[SEASONS[i]].then((img) => {
      this.view.seasonImg = img;
      this.view.draw();
    });
  },
};

const canvas = document.querySelector("#cv");
window.__app = app; // 调试句柄(控制台可用 __app.clock 等)
window.app = app;
app.view = new MapView(canvas, () => app.scenario);
app.view.app = app;
attachInput(app.view, {
  uiHit: (x, y) => app.gamebar?.hitTest(x, y) ?? false,
  onHover: (target, e) => {
    // UI (工具栏/面板/弹窗) 区域内不触发地图拾取
    if (app.gamebar?.hitTest(e.clientX, e.clientY)) {
      const changed = app.gamebar.hover(e.clientX, e.clientY);
      app.hud.showTooltip(null);
      if (changed || app.view.hoverTarget) {
        app.view.hoverTarget = null;
        app.view.draw();
      }
      return;
    }
    // 据点/军团交互：仅显示光标，不弹出悬停提示
    const moved = app.view.hoverTarget !== target;
    app.view.hoverTarget = target;
    app.hud.showTooltip(null);
    if (moved && !mouseDown) app.view.draw();
  },
  onSelect: (target, e) => {
    // UI 点击优先消费 (工具栏图标/子菜单/小地图城点/设置菜单/弹窗)
    if (app.gamebar?.click(e.clientX, e.clientY, e.button, target)) {
      app.view.draw();
      return;
    }
    const sc = app.scenario;
    // 出征目标选择模式
    if (
      app.dispatching &&
      target?.type === "city" &&
      target.city !== app.dispatching
    ) {
      const r = cmd.dispatch(sc, app.dispatching, target.city);
      app.hud.flashEvent(r.ok ?? r.err);
      app.dispatching = null;
      app.view.hoverTarget = null;
      app.view.draw();
      return;
    }
    app.dispatching = null;
    app.view.hoverTarget = null;

    if (target?.type === "legion") {
      app.gamebar.showLegionCard(target.legion);
      app.gamebar.syncClock();
      app.view.draw();
      return;
    }

    if (target?.type === "city") {
      const city = target.city;
      app.view.selectedCity = city;
      const g = app.view.garrisonOf(city);
      if (g) {
        app.gamebar.showGarrisonChoice(city, g);
      } else {
        app.gamebar.showCityCard(city);
      }
      app.gamebar.syncClock();
      app.view.draw();
      return;
    }

    // 4、除点击据点中心或行走军团外，在地图其它地方左键点击没有任何功能
  },
  onWheel: (e) => {
    if (app.gamebar?.wheel(e.clientX, e.clientY, e.deltaY)) return;
  },
});
let mouseDown = false;
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) mouseDown = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
});

// ★鼠标活动=战略暂停, 静止1秒自动恢复 (原版机制: 愌知鼠标移动/停止控制计时)
addEventListener("mousemove", () => app.gamebar?.pokeClock());

// 数据加载完成后装配 HUD 并进入初始剧本；每个异步seam后重新校验lease。
export async function startApp() {
requireInstanceRuntime();
app.runtimeEnabled = false;
app.data = await loadJSON("data.json");
requireInstanceRuntime();
// 正式入口由boot持有单实例lease；存档读取也必须受同一token授权，禁止静态回落。
const savesResponse = await instanceFetch("/api/saves.json", {
  cache: "no-store",
});
if (!savesResponse.ok) {
  if (savesResponse.status === 409) app.loseInstanceLease();
  throw new InstanceLeaseError("save-read-denied", savesResponse.status);
}
app.saves = await savesResponse.json();
requireInstanceRuntime();
const [battleMaps, battleNavigation, battleRules, battleScripts, talkTable] =
  await Promise.all([
    loadJSON("battle_maps.json"),
    loadJSON("battle_navigation.json"),
    loadJSON("battle_rules.json"),
    loadJSON("battle_scripts.json"),
    loadJSON("talk.json"),
  ]);
requireInstanceRuntime();
app.battleMaps = battleMaps;
app.battleNavigation = battleNavigation;
app.battleMaps.navigation = app.battleNavigation;
app.battleMaps.formationVectors = battleRules.formationVectors;
app.battleScripts = battleScripts;
app.talkTable = talkTable;
await initSaveAssets(); // scen_raw.json + big5_map.json + authorized /api/save.dat
requireInstanceRuntime();
app.battleView = new BattleView(document.querySelector("#bcv"), app);
app.diploView = new DiploView(document.querySelector("#diplov"), app);
app.endView = new EndView(document.querySelector("#endv"), app); // D7OVER/D7END 结束动画
app.openView = new OpenView(document.querySelector("#openv"), app); // D7OPEN 开场动画
app.speaker = speaker; // 0xCDE/0xCE7 PC喇叭音效复刻
app.scenario = new Scenario(app.data.scenarios[0]);
app.hud = new HUD(app);
app.gamebar = new GameBar(app); // 顶部工具栏+小地图+资源面板 (UI 覆盖层画在主画布)
app.view.overlay = (ctx) => app.gamebar.draw(ctx);
app.setScenario(0); // 背景地图 (原版标题画面=全国地图)
app.startMenu = new StartMenu(app);
requireInstanceRuntime();
app.setRuntimeEnabled(true);
// 发布app只表示初始化完成；菜单/RAF仍在下方各自经过lease检查。
globalThis.__dragonApp = app;
if (!sessionStorage.getItem("openPlayed")) {
  sessionStorage.setItem("openPlayed", "1");
  await app.openView.play(); // 開場動畫(每次浏览器会话首次載入播放, 點擊跳過)
  requireInstanceRuntime();
}
await app.startMenu.show(); // ★開局選單: NEW GAME YES/NO → 章節選擇/讀檔 (0x1AC3)
requireInstanceRuntime();
window.__aiTick = () => aiTick(app); // 调试句柄
window.__monthlyAI = () => monthlyAI(app); // 调试句柄
window.__monthlyAppear = () => monthlyAppear(app); // 调试句柄
window.__monthlySettlement = () => monthlySettlement(app.scenario, app.clock); // 调试句柄：换月财务与据点结算
window.__saveDat = (slot, label) => serializeSave(app, slot, label); // 调试句柄：导出SAVE.DAT字节

// ── 主循环: 实时驱动游戏时钟 (对应 KI.EXE 0x1D8E) ──
let last = performance.now(),
  uiAcc = 0,
  blinkAcc = 0,
  lastDateKey = "";
function frame(now) {
  const dt = now - last;
  last = now;
  if (!app.runtimeEnabled) {
    requestAnimationFrame(frame);
    return;
  }
  app.gamebar?.syncClock?.(); // 模态弹窗开→计时冻结 (原版 [0xD2A]=1)
  app.clock?.advance(dt);

  const c = app.clock;
  const isRunning =
    c &&
    c.speed > 0 &&
    !c.hold &&
    (!app.hud || app.hud.dialogCount === 0) &&
    (!app.gamebar ||
      (!app.gamebar.listDialog &&
        app.gamebar.selectedSubmenu == null &&
        !app.gamebar.settingsOpen &&
        !app.gamebar.systemSaveDialog &&
        !app.gamebar.systemLoadConfirmDialog));

  if (isRunning) {
    // 时钟流逝期间：逐帧重绘，驱动军团行走平滑插值 (60fps lerp)
    app.view.draw();
  } else if (c) {
    // 暂停/冻结期间：仅在日期变化时重绘
    const key = `${c.year}/${c.month}/${c.day}/${c.hold ? 1 : 0}`;
    if (key !== lastDateKey) {
      lastDateKey = key;
      app.view.draw();
    }
  }

  uiAcc += dt;
  blinkAcc += dt;
  if (uiAcc >= 100) {
    // 10Hz 刷新日期显示
    uiAcc = 0;
    app.hud.refreshClock();
    // 换月时按月份同步季节画面 (复刻 0x9377 换季逻辑)
    if (c) {
      const want = seasonOf(c.month);
      if (want !== app.seasonIdx) app.setSeason(want);
    }
  }
  // 小地图遇袭闪烁: 4Hz 重绘 (暂停时也能闪烁)
  if (blinkAcc >= 250) {
    blinkAcc = 0;
    if (!isRunning && app.gamebar?.needsAnim()) app.view.draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
}
