// 引擎主入口 — 装配数据/视图/输入/HUD
import { loadJSON, seasonTiles } from "./core/assets.js";
import { MapView, preloadEngageMarkerImages } from "./render/mapview.js";
import { attachInput } from "./core/input.js";
import { HUD } from "./ui/hud.js";
import { GameBar } from "./ui/gamebar.js";
import {
  createNewGameScenario,
  Scenario,
  seasonOf,
  SEASONS,
} from "./game/world.js";
import { Clock } from "./game/clock.js";
import { monthlySettlement } from "./game/economy.js";
import { prepareEnvoyBudgetReports } from "./game/diplomacy.js";
import {
  aiTick,
  buildArmies,
  initializeStrategicDiplomacy,
  monthlyAI,
  monthlyDiplomacyAI,
} from "./game/ai.js";
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
  snapshotState,
} from "./game/savegame.js";
import { loadLocalSaveSlots, saveLocalSaveSlots } from "./core/localstore.js";

const app = {
  data: null,
  scenario: null,
  scenarioIdx: 0,
  loadedSaveSlot: null,
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
  runtimeEnabled: true,
  _saveQueue: Promise.resolve(),

  setRuntimeEnabled(enabled) {
    this.runtimeEnabled = Boolean(enabled);
    this.battleView?.setRuntimeEnabled?.(this.runtimeEnabled);
    this.engageTransition?.setRuntimeEnabled?.(this.runtimeEnabled);
    if (this.clock) this.clock.hold = !this.runtimeEnabled;
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
    this.loadedSaveSlot = null;
    const raw = createNewGameScenario(
      this.data.scenarios[i],
      playerFaction,
      advisor,
    );
    this.loadState(raw, i, { initializeDiplomacy: playerFaction != null });
  },

  /** 公共装配路径: 剧本与读档共用 (raw=parse_sinario/parse_save 输出的 state) */
  loadState(
    raw,
    idx,
    { rngSnapshot = null, initializeDiplomacy = false } = {},
  ) {
    if (!raw || !Array.isArray(raw.factions) || !Array.isArray(raw.cities))
      throw new TypeError("invalid scenario state");
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.data.scenarios.length)
      throw new RangeError(`invalid scenario index ${idx}`);
    this.engageTransition?.cancel?.();
    this.engageTransition = null;
    this.dispatching = null;
    this.scenarioIdx = idx;
    this.scenario = new Scenario(raw);
    // 每次新局/读档都是独立进程态：无sidecar的DOS档也必须重置随机流，
    // 不能继续消费上一局 RNG；Web sidecar存在时则在装配前恢复精确快照。
    this.originalRng = createOriginalBattleRng();
    if (rngSnapshot) this.originalRng.restore(rngSnapshot);
    this.activeBattleRng = this.originalRng;
    loadTerrain().catch((error) => {
      this.hud?.flashEvent?.("道路資料載入失敗，行軍功能暫停。");
      globalThis.__dragonDebug?.reportError?.(
        "strategic map navigation assets failed to load",
        error,
      );
    });
    cmd.initPlayer(this.scenario); // ★原版剧本头FF=未指定→默认势力0/信赖100
    if (initializeDiplomacy) initializeStrategicDiplomacy(this);
    this.gamebar?.setDefaultSelFaction(); // 小地图默认查看第一个非玩家势力
    buildArmies(this.scenario); // 新游戏保持空军团表；存档军团归一化坐标、槽位和主将名
    const loadedDate = this.scenario.save_date;
    const startMonth =
      loadedDate && 1 <= loadedDate.month && loadedDate.month <= 12
        ? loadedDate.month
        : this.scenario.start.month;
    const requestedDay = loadedDate?.day ?? this.scenario.start.day;
    const startYear = loadedDate?.year ?? this.scenario.start.year;
    this.setSeason(seasonOf(startMonth));
    // 新游戏使用章节起始日；存档使用 parse_save/snapshotState 的 save_date。
    this.clock = new Clock({
      startYear,
      startMonth,
      startDay: Math.max(1, requestedDay | 0),
      onMonthEnd: (c) => {
        // ★对应 KI.EXE call 0x5358
        const rep = monthlySettlement(this.scenario, c, this.scenario.tax);
        this.hud.showSettlement(rep);
        monthlyDiplomacyAI(this); // ★0x5394→0x2BD9 关系变化/type-1宣战事件
        monthlyAI(this); // ★俘虏回归/势力灭亡/流散投奔
        cmd.monthEnd(this); // ★征兵到达+信赖度动力学
        monthlyAppear(this); // ★appear_months 到期武将登场/改投(join_faction)
        const reports = prepareEnvoyBudgetReports(this.scenario).map(
          (report) => ({ ...report, delay: 7 }),
        );
        this.scenario.pendingEnvoyBudgetReports = reports;
      },
      onDay: () => aiTick(this), // ★对应 0x3E11/0x3EFD 每日 AI tick
    });
    this.clock.day = Math.min(this.clock.day, this.clock.daysInMonth);
    this.clock.sub = Math.max(
      0,
      Math.min(7, Number(this.scenario.save_sub) || 0),
    );
    this.clock.hour = Math.max(
      0,
      Math.min(23, Number(this.scenario.save_hour) || 0),
    );
    if (this.gamebar) {
      for (const report of this.scenario.pendingEnvoyBudgetReports ?? []) {
        this.gamebar.enqueueEnvoyBudgetReport(report);
      }
      this.scenario.pendingEnvoyBudgetReports = [];
    }
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

  /** 按调用顺序写入玩家浏览器的 IndexedDB；服务端不接收任何存档。 */
  async saveGame(slotIdx, label) {
    if (!this.runtimeEnabled) {
      this.hud?.flashEvent?.("遊戲目前已暫停，無法存檔。");
      return { saved: "blocked" };
    }
    const operation = async () => {
      if (!canSnapshotState(this)) {
        this.hud?.flashEvent?.("戰鬥處理中，現在無法存檔。");
        return { saved: "blocked" };
      }
      const sv = snapshotState(this, slotIdx, label);
      const next = structuredClone(this.saves);
      const index = next.slots.findIndex((saved) => saved.slot === slotIdx);
      if (index >= 0) next.slots[index] = sv;
      else next.slots.push(sv);
      try {
        this.saves = await saveLocalSaveSlots(next);
      } catch (error) {
        this.hud?.flashEvent?.("本機存檔失敗，原存檔未變更。");
        return { saved: "failed", error };
      }
      this.loadedSaveSlot = slotIdx;
      this.hud?.flashEvent?.(`存檔：槽${slotIdx + 1} ${label}`);
      return { saved: "local" };
    };
    const queued = this._saveQueue.then(operation, operation);
    this._saveQueue = queued.catch(() => null);
    return queued;
  },

  /** 读档: 用浏览器本地槽位状态覆盖当前场景 */
  loadSave(slotIdx) {
    const sv = this.saves?.slots.find((s) => s.slot === slotIdx);
    if (!sv?.played || !sv.state) return false;
    // 深拷贝: 游玩会改写 state(军团移动/死亡), 保留原始存档以便重复读档
    const state = applyWebMetaToState(structuredClone(sv.state), sv.webMeta);
    this.loadedSaveSlot = slotIdx;
    this.loadState(state, sv.scenario_idx, {
      rngSnapshot: sv.webMeta?.originalRng ?? null,
    });
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

// 新游戏章节由服务器静态资源 data.json 提供；存档仅来自浏览器 IndexedDB。
export async function startApp() {
  app.runtimeEnabled = false;
  app.data = await loadJSON("data.json");
  app.saves = await loadLocalSaveSlots();
  const [battleMaps, battleNavigation, battleRules, battleScripts, talkTable] =
    await Promise.all([
      loadJSON("battle_maps.json"),
      loadJSON("battle_navigation.json"),
      loadJSON("battle_rules.json"),
      loadJSON("battle_scripts.json"),
      loadJSON("talk.json"),
    ]);
  app.battleMaps = battleMaps;
  app.battleNavigation = battleNavigation;
  app.battleMaps.navigation = app.battleNavigation;
  app.battleMaps.formationVectors = battleRules.formationVectors;
  app.battleScripts = battleScripts;
  app.talkTable = talkTable;

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
  app.setRuntimeEnabled(true);
  // 仅在 boot.js 已取得浏览器单实例锁后发布 App 并启动主循环。
  globalThis.__dragonApp = app;
  if (!sessionStorage.getItem("openPlayed")) {
    sessionStorage.setItem("openPlayed", "1");
    await app.openView.play(); // 開場動畫(每次浏览器会话首次載入播放, 點擊跳過)
  }
  await app.startMenu.show(); // ★開局選單: NEW GAME YES/NO → 章節選擇/讀檔 (0x1AC3)
  window.__aiTick = () => aiTick(app); // 调试句柄
  window.__monthlyAI = () => monthlyAI(app); // 调试句柄
  window.__monthlyAppear = () => monthlyAppear(app); // 调试句柄
  window.__monthlySettlement = () => monthlySettlement(app.scenario, app.clock); // 调试句柄：换月财务与据点结算

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
