// 引擎主入口 — 装配数据/视图/输入/HUD
import { loadJSON, loadSeasonTile } from "./core/assets.js";
import {
  MapView,
  preloadDisasterObjectImages,
  preloadEngageMarkerImages,
  preloadWeatherCloudImages,
} from "./render/mapview.js";
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
import { activateNextMonthPolicy, monthlySettlement } from "./game/economy.js";
import { prepareEnvoyBudgetReports } from "./game/diplomacy.js";
import {
  aiTick,
  buildArmies,
  finishDeferredLegionDaily,
  initializeStrategicDiplomacy,
  monthlyAI,
  monthlyDiplomacyAI,
  completePlayerWarDeclaration,
  enqueueDeficitTrustEvent,
  enqueueDomesticBudgetEvents,
  enqueueEnvoyBudgetEvents,
  enqueueMonthlyDisasterEvents,
  processMonthlyGeneralFates,
  tickFactionStrategicState,
  tickStrategicWarEvents,
} from "./game/ai.js";
import { defaultWorldResources } from "./game/worldresources.js";
import { loadBuiltinContent } from "./content/catalog.js";
import { STRATEGIC_LAYOUT } from "./content/worlddefinition.js";
import { classifyFieldBattleTerrain } from "./game/fieldterrain.js";
import * as cmd from "./game/commands.js";
import { monthlyAppear } from "./game/recruits.js";
import { BattleView } from "./render/battleview.js";
import { EndView } from "./render/endview.js";
import { StartMenu } from "./ui/startmenu.js";
import * as speaker from "./core/speaker.js";
import { MusicPlayer } from "./core/music.js";
import { ScoreDirector } from "./core/score.js";
import { EngagementPresentation } from "./render/engagementpresentation.js";
import { createBattle, createFieldBattle } from "./game/tacticalbattle.js";
import { applyBattleResult, applyFieldBattleResult } from "./game/ai.js";
import {
  createOriginalBattleRng,
  originalBiosClockFromDate,
} from "./game/battle/originalrng.js";
import {
  applyWebMetaToState,
  canSnapshotState,
  snapshotState,
} from "./game/savegame.js";
import { loadLocalSaveSlots, saveLocalSaveSlots } from "./core/localstore.js";
import {
  normalizeDisasterMapObjectState,
  normalizeWeatherCloudState,
} from "./game/weather.js";

const app = {
  data: null,
  content: null,
  world: defaultWorldResources,
  scenario: null,
  scenarioIdx: 0,
  loadedSaveSlot: null,
  seasonIdx: 1,
  view: null,
  hud: null,
  battleMaps: null, // BATTLE.MAP 城池→战场布局索引
  battleNavigation: null, // CAEB/BB3C/BBA6 原版tile属性与导航源
  tacticalSpeed: 2,
  tacticalSpeedFactor: 1.0, // 旧调试兼容字段；正式战术帧使用IRQ门控
  music: new MusicPlayer({
    context: speaker.getAudioContext,
    onDriverStart: speaker.musicDriverStarted,
  }),
  // KI.EXE initializes 0xEC82 once at process start from BIOS local RTC;
  // title/new-game/load paths continue that stream unless a Web sidecar restores it.
  originalRng: createOriginalBattleRng(originalBiosClockFromDate()),
  activeBattleRng: null,
  engageTransition: null,
  engagementFx: new EngagementPresentation({
    playSound: speaker.engageSfx,
    stopSound: speaker.stopEngageSfx,
  }),
  // 用户批准的地图指针计时hold；与GameBar模态hold取并集。
  mapPointerHold: false,
  runtimeEnabled: true,
  gameStarted: false,
  exitConfirmed: false,
  _gameAssetsPromise: null,
  _saveQueue: Promise.resolve(),

  /** 用户手势内解锁AudioContext并开始解码委任接战样本。 */
  prepareEngageAudio() {
    speaker.unlockSfx();
    return speaker.prepareEngageSfx();
  },

  /** 标题选单只加载背景和菜单数据；确认新局/存档后才载入地图与战斗资源。 */
  async ensureGameAssets() {
    if (!this._gameAssetsPromise) {
      this._gameAssetsPromise = Promise.all([
        loadJSON("battle_maps.json"),
        loadJSON("battle_navigation.json"),
        loadJSON("battle_rules.json"),
        loadJSON("battle_scripts.json"),
        loadJSON("talk.json"),
        speaker.preloadEngageSfx(),
        preloadEngageMarkerImages(() => this.view?.draw?.()),
        preloadWeatherCloudImages(() => this.view?.draw?.()),
        preloadDisasterObjectImages(() => this.view?.draw?.()),
      ]).then(
        ([
          battleMaps,
          battleNavigation,
          battleRules,
          battleScripts,
          talkTable,
        ]) => {
          battleMaps.navigation = battleNavigation;
          battleMaps.formationVectors = battleRules.formationVectors;
          this.battleMaps = battleMaps;
          this.battleNavigation = battleNavigation;
          this.battleScripts = battleScripts;
          this.talkTable = talkTable;
        },
      );
    }
    return this._gameAssetsPromise;
  },

  ensureGameShell() {
    this.battleView ??= new BattleView(document.querySelector("#bcv"), this);
    this.endView ??= new EndView(document.querySelector("#endv"), this);
    if (!this.gamebar) {
      this.gamebar = new GameBar(this);
      this.view.overlay = (ctx) => this.gamebar.draw(ctx);
    }
  },

  async enterGame(load) {
    this.setRuntimeEnabled(false);
    try {
      await this.ensureGameAssets();
      this.ensureGameShell();
      await load();
      this.gameStarted = true;
      this.exitConfirmed = false;
      this.hud ??= new HUD(this);
      this.hud.buildLegend();
      this.hud.refreshInfo();
      await this.gamebar._assets;
      document.body.classList.add("game-active");
      this.view.draw();
    } catch (error) {
      this.score.title();
      this.gameStarted = false;
      document.body.classList.remove("game-active");
      throw error;
    } finally {
      this.setRuntimeEnabled(true);
    }
  },

  beginNewGame(i, playerFaction, advisor) {
    return this.enterGame(() => this.setScenario(i, playerFaction, advisor));
  },

  promptExit(action = "reload") {
    if (!this.gameStarted || !this.scenario) return false;
    this.ensureGameShell();
    this.gamebar?.openExitConfirmDialog?.(action);
    return true;
  },

  async beginSavedGame(slotIdx) {
    await this.enterGame(async () => {
      if (!(await this.loadSave(slotIdx))) throw new Error("無法讀取指定存檔");
    });
    this.hud?.flashEvent?.(`讀檔：${this._lastLoadedSaveLabel}`);
  },

  setRuntimeEnabled(enabled) {
    this.runtimeEnabled = Boolean(enabled);
    this.music.setEnabled(this.runtimeEnabled);
    if (!this.runtimeEnabled) {
      clearMapPointerClockHold();
      this.engagementFx.reset();
    }
    this.battleView?.setRuntimeEnabled?.(this.runtimeEnabled);
    this.engageTransition?.setRuntimeEnabled?.(this.runtimeEnabled);
    if (this.clock) this.clock.hold = !this.runtimeEnabled;
  },

  /**
   * 委任速算仍在倒数为1且道路轮询到期时结算。独立音画到此一起停止；
   * 这里只留一个RAF的gate，不等待或追加动画/声音。
   */
  playDelegatedEngage(legion, onFinish) {
    if (this.engageTransition?.active || typeof onFinish !== "function")
      return false;
    this.engagementFx.reset();
    let done = false;
    let rafId = null;
    const transition = {
      active: true,
      legion,
      cancel: () => finish(false),
      setRuntimeEnabled() {},
    };
    const finish = (resolveBattle = true) => {
      if (done) return;
      done = true;
      transition.active = false;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (this.engageTransition === transition) this.engageTransition = null;
      try {
        if (resolveBattle) onFinish();
      } finally {
        finishDeferredLegionDaily(this);
        this.gamebar?.syncClock?.();
        this.view?.draw?.();
      }
    };
    this.engageTransition = transition;
    this.gamebar?.syncClock?.();
    rafId = requestAnimationFrame(() => finish());
    return true;
  },

  /** 游戏结束：清理运行态并返回首页开局选单 (YES/NO) */
  async returnToTitle(initialAction) {
    this._strategicCityRequest = null;
    this.engagementFx.reset();
    this.score.title();
    clearMapPointerClockHold();
    this.engageTransition?.cancel?.();
    this.engageTransition = null;
    if (this.gamebar) {
      // GameBar会跨剧本复用；先取消旧剧本的自动关闭计时器和战略消息FIFO，
      // 避免下一局触发旧宣战/谈判闭包或显示过期对白。
      this.gamebar.resetScenarioUi?.();
      this.gamebar._clockHoldRequested = true;
      this.gamebar.submenuOpen = false;
      this.gamebar.miniOpen = false;
      this.gamebar.resOpen = false;
      this.gamebar.selFaction = null;
      this.gamebar.settingsOpen = false;
      this.gamebar.settingsHover = -1;
      this.gamebar.systemSaveDialog = null;
      this.gamebar.systemLoadConfirmDialog = null;
      this.gamebar.exitConfirmDialog = null;
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
    this.exitConfirmed = false;
    this.hud?.closeAll?.();
    if (this.view) {
      this.view.selectedCity = null;
      this.view.hoverTarget = null;
      this.view.draw();
    }
    this.gameStarted = false;
    document.body.classList.remove("game-active");
    this.view.seasonImg = null;
    this.scenario = null;
    this.clock = null;
    try {
      await this.startMenu.show(initialAction);
    } finally {
      if (this.gamebar) this.gamebar._clockHoldRequested = false;
      this.gamebar?.syncClock();
    }
  },

  /** 开战: 战术层接管 (玩家军团攻城/敌军犯境时由 ai.resolveBattle 调用) */
  startBattle(A, city, D = null) {
    this.engagementFx.reset();
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
      this.score.endBattle(battle);
      finishDeferredLegionDaily(this);
      this.hud.buildLegend();
      this.view.draw();
    });
  },

  /** 野外战：双方均为军团，不借用城池结算。 */
  startFieldBattle(A, D) {
    this.engagementFx.reset();
    const terrain = classifyFieldBattleTerrain(
      A,
      D,
      this.scenario.player_faction,
      this.originalRng,
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
      this.score.endBattle(battle);
      finishDeferredLegionDaily(this);
      this.hud.buildLegend();
      this.view.draw();
    });
  },

  checkTrustGameOver() {
    return cmd.checkTrustGameOver(this);
  },

  completePlayerWarDeclaration(targetFaction) {
    return completePlayerWarDeclaration(this, targetFaction);
  },

  setScenario(i, playerFaction = null, advisor) {
    this.loadedSaveSlot = null;
    const raw = createNewGameScenario(
      this.content ? this.content.chapter(i)?.template : this.data.scenarios[i],
      playerFaction,
      advisor,
    );
    return this.loadState(raw, i, {
      initializeDiplomacy: playerFaction != null,
    });
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
    this.engagementFx.reset();
    clearMapPointerClockHold();
    this.engageTransition?.cancel?.();
    this.engageTransition = null;
    this._legionDailySettlementDeferred = false;
    this._legionDailySettlementSlots = null;
    this._strategicWeatherTickDeferred = false;
    this._strategicCityRequest = null;
    this._strategicEventPostMessageRngPending = false;
    this._factionTickDeferred = false;
    this.dispatching = null;
    this.scenarioIdx = idx;
    this.scenario = new Scenario(raw);
    normalizeDisasterMapObjectState(this.scenario);
    normalizeWeatherCloudState(
      this.scenario,
      this.data.scenarios[idx]?.weatherClouds ?? [],
      this.data.scenarios[idx]?.weatherCloudBounds ?? null,
    );
    // KI.EXE 仅在0x0077启动路径调用一次0xEC82；切换标题、新局或读档
    // 不会重新播种。Web首次装配已按本地BIOS式时钟建流，sidecar读档才恢复
    // 保存时的精确状态；无sidecar DOS档继续当前进程流。
    this.originalRng ??= createOriginalBattleRng(originalBiosClockFromDate());
    if (rngSnapshot) this.originalRng.restore(rngSnapshot);
    this.activeBattleRng = this.originalRng;
    const terrainReady = this.world.terrain.loadTerrain().catch((error) => {
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
    const seasonReady = this.setSeason(seasonOf(startMonth));
    // 新游戏使用章节起始日；存档使用 parse_save/snapshotState 的 save_date。
    this.clock = new Clock({
      startYear,
      startMonth,
      startDay: Math.max(1, requestedDay | 0),
      onStrategicTick: (c) => {
        const batchStart = this.scenario._legionBatchCursor ?? 0;
        const cityCursor = this.scenario._cityTickCursor ?? 0;
        // 表现层只用它判断某次道路单步的插值是否仍属于当前战略更新。
        // 不进入规则、RNG 或存档。
        this.scenario._strategicTickSerial = c.strategicTickSerial;
        aiTick(this, {
          legionBatchStart: batchStart,
          cityIndex: cityCursor,
          hour: c.hour,
          runFactionTick: false,
        });
        this.scenario._legionBatchCursor =
          (batchStart + STRATEGIC_LAYOUT.legionBatchSize) %
          STRATEGIC_LAYOUT.legionSlots;
        this.scenario._cityTickCursor =
          (cityCursor + 1) % STRATEGIC_LAYOUT.citySlots;
      },
      onSyncHold: () => this.gamebar?.syncClock?.(),
      onHour: (c) => {
        this.score.calendar(c); // KI:1DE9 before 3E11; no audio await/clock mutation
        // 0x1D8E 仅在CF2达到8时调用一次0x3E11：先泵一个全局事件槽，
        // 再对当前势力做财政危机、预备兵维护累计和外交官维护。
        tickStrategicWarEvents(this);
        tickFactionStrategicState(this);
      },
      onMonthEnd: (c) => {
        // ★对应 KI.EXE call 0x5358
        const rep = monthlySettlement(this.scenario, c, this.originalRng);
        this.hud.showSettlement(rep);
        processMonthlyGeneralFates(this); // ★0x538E→0x585F/0x5940 type-9武将回归事件
        monthlyDiplomacyAI(this); // ★0x5394→0x2BD9 关系变化/type-1宣战事件
        enqueueDomesticBudgetEvents(this); // ★0x5397→0x5715 type-4内政预算
        enqueueEnvoyBudgetEvents(
          this,
          prepareEnvoyBudgetReports(this.scenario),
        ); // ★0x539A→0x578F type-5外交预算
        enqueueMonthlyDisasterEvents(this); // ★0x539D/0x53A0→type11/12
        enqueueDeficitTrustEvent(this); // ★0x53A3→0x57FE type-13负资金信赖处罚
        activateNextMonthPolicy(this.scenario); // ★0x53A6：次月税率/征兵设定转正
        monthlyAI(this); // ★只清理退场军团；通关后不再触发D7END过场
        cmd.monthEnd(this); // ★征兵到达；天灾/暴动已排入type11/12
        monthlyAppear(this); // ★appear_months 到期武将登场/改投(join_faction)
      },
      onDay: null,
    });
    this.clock.day = Math.min(this.clock.day, this.clock.daysInMonth);
    this.clock.sub = Math.max(
      0,
      Math.min(8, Number(this.scenario.save_sub) || 0),
    );
    this.clock.hour = Math.max(
      0,
      Math.min(23, Number(this.scenario.save_hour) || 0),
    );
    this.score.strategy(); // loaded month, not the graphics season callback
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
    return Promise.all([terrainReady, seasonReady]);
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
  async loadSave(slotIdx) {
    const sv = this.saves?.slots.find((s) => s.slot === slotIdx);
    if (!sv?.played || !sv.state) return false;
    // 深拷贝: 游玩会改写 state(军团移动/死亡), 保留原始存档以便重复读档
    const state = applyWebMetaToState(structuredClone(sv.state), sv.webMeta);
    this.loadedSaveSlot = slotIdx;
    await this.loadState(state, sv.scenario_idx, {
      rngSnapshot: sv.webMeta?.originalRng ?? null,
    });
    this._lastLoadedSaveLabel = sv.label;
    return true;
  },

  setSeason(i) {
    this.seasonIdx = i;
    return loadSeasonTile(SEASONS[i]).then((img) => {
      if (this.seasonIdx !== i) return;
      this.view.seasonImg = img;
      if (this.gameStarted) this.view.draw();
    });
  },
};
app.score = new ScoreDirector(app.music, () => app.clock);

const canvas = document.querySelector("#cv");
window.__app = app; // 调试句柄(控制台可用 __app.clock 等)
window.app = app;
app.view = new MapView(canvas, () => app.scenario);
app.view.app = app;
attachInput(app.view, {
  uiHit: (x, y) => app.gamebar?.hitTest(x, y) ?? false,
  onHover: (target, e) => {
    if (!app.gameStarted || !app.hud) return;
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
    // 标题选单有独立输入绑定；战略层全局右键监听不得穿透到持久GameBar。
    if (!app.gameStarted || !app.scenario) return;
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
    if (!app.gameStarted || !app.scenario) return;
    if (app.gamebar?.wheel(e.clientX, e.clientY, e.deltaY)) return;
  },
});
let mouseDown = false;
// 高频pointer事件只保存最新位置；战略RAF在下一可见帧统一执行hit-test和重绘，
// 避免一次鼠标移动触发多次完整Canvas重画。
let queuedMapPointer;
let mapRedrawRequested = false;
function queueMapPointer(x, y) {
  queuedMapPointer = { x, y };
}
function clearQueuedMapPointer() {
  queuedMapPointer = null;
}
function requestMapRedraw() {
  mapRedrawRequested = true;
}
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) mouseDown = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
});

// 用户批准的Web交互：地图移动先暂停战略，静止满1秒才自动恢复。它是
// 指针可点击性的产品决定，不参与原版规则、RNG或路线；GameBar同步其它
// 模态hold时必须保留这个独立holder。
const MAP_POINTER_IDLE_HOLD_MS = 1000;
let mapPointerHoldTimer = null;
function holdMapPointerClock() {
  if (app.mapPointerHold) return;
  app.mapPointerHold = true;
  app.gamebar?.syncClock?.();
}
function releaseMapPointerClock() {
  if (!app.mapPointerHold) return;
  app.mapPointerHold = false;
  app.gamebar?.syncClock?.();
}
function deferMapPointerClockResume() {
  holdMapPointerClock();
  if (mapPointerHoldTimer != null) clearTimeout(mapPointerHoldTimer);
  mapPointerHoldTimer = setTimeout(() => {
    mapPointerHoldTimer = null;
    releaseMapPointerClock();
  }, MAP_POINTER_IDLE_HOLD_MS);
}
function clearMapPointerClockHold() {
  if (mapPointerHoldTimer != null) clearTimeout(mapPointerHoldTimer);
  mapPointerHoldTimer = null;
  releaseMapPointerClock();
}
canvas.addEventListener("mousemove", (event) => {
  queueMapPointer(event.clientX, event.clientY);
  if (
    app.gameStarted &&
    app.scenario &&
    app.runtimeEnabled &&
    !app.gamebar?.hitMapChrome?.(event.clientX, event.clientY)
  )
    deferMapPointerClockResume();
});
canvas.addEventListener("mouseleave", () => {
  clearQueuedMapPointer();
});
addEventListener("resize", requestMapRedraw);

// 全局刷新或关闭防丢失保护 (首选游戏内弹窗，回车/右键默认返回游戏)
window.addEventListener(
  "keydown",
  (e) => {
    if (app.gamebar?.exitConfirmDialog) {
      if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        e.stopPropagation();
        app.gamebar.closeExitConfirmDialog();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        app.gamebar.closeExitConfirmDialog();
        return;
      }
    }

    const isRefreshKey =
      e.key === "F5" ||
      ((e.ctrlKey || e.metaKey) &&
        (e.key === "r" || e.key === "R" || e.code === "KeyR"));
    const isCloseKey =
      (e.ctrlKey || e.metaKey) &&
      (e.key === "w" || e.key === "W" || e.code === "KeyW");

    if (isRefreshKey || isCloseKey) {
      if (app.gameStarted && app.scenario) {
        e.preventDefault();
        e.stopPropagation();
        app.gamebar?.openExitConfirmDialog?.(isRefreshKey ? "reload" : "close");
      }
    }
  },
  { capture: true },
);

window.addEventListener(
  "contextmenu",
  (e) => {
    if (app.gamebar?.exitConfirmDialog) {
      e.preventDefault();
      e.stopPropagation();
      app.gamebar.closeExitConfirmDialog();
    }
  },
  { capture: true },
);

window.addEventListener("beforeunload", (e) => {
  if (app.exitConfirmed || !app.gameStarted || !app.scenario) return;
  e.preventDefault();
  const msg = "刷新或关闭会丢失当前进度，请检查是否已存档。";
  e.returnValue = msg;
  return msg;
});

// 标题阶段只读取章节目录和本机存档；地图/道路/战斗数据在确认进入游戏后加载。
export async function startApp() {
  app.runtimeEnabled = false;
  [app.content, app.saves] = await Promise.all([
    loadBuiltinContent(),
    loadLocalSaveSlots(),
  ]);
  app.data = app.content.data;

  app.speaker = speaker; // 0xCDE/0xCE7 PC喇叭音效复刻
  app.startMenu = new StartMenu(app);
  app.score.title();
  document.addEventListener(
    "pointerdown",
    () => {
      speaker.unlockSfx();
      app.music.unlock();
    },
    { capture: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) app.engagementFx.pause();
  });
  // 仅在 boot.js 已取得浏览器单实例锁后发布 App；不再播放开场动画或装配默认地图。
  globalThis.__dragonApp = app;
  await app.startMenu.show(); // ★背景图上的开局选单；确认章节/存档后才进入地图
  window.__aiTick = () => aiTick(app); // 调试句柄
  window.__monthlyAI = () => monthlyAI(app); // 调试句柄
  window.__monthlyAppear = () => monthlyAppear(app); // 调试句柄
  window.__monthlySettlement = () =>
    monthlySettlement(app.scenario, app.clock, app.originalRng); // 调试句柄：换月财务与据点结算

  // ── 主循环: 实时驱动游戏时钟 (对应 KI.EXE 0x1D8E) ──
  let last = performance.now(),
    uiAcc = 0,
    lastDateKey = "";
  function frame(now) {
    const dt = now - last;
    last = now;
    if (!app.runtimeEnabled) {
      requestAnimationFrame(frame);
      return;
    }
    const pointerUpdate = queuedMapPointer;
    queuedMapPointer = undefined;
    let pointerChanged = false;
    if (pointerUpdate === null)
      pointerChanged = app.view.setPointer(null, null);
    else if (pointerUpdate !== undefined)
      pointerChanged = app.view.setPointer(pointerUpdate.x, pointerUpdate.y);

    app.gamebar?.syncClock?.(); // 模态弹窗开→计时冻结 (原版 [0xD2A]=1)
    app.clock?.advanceFrame(dt);

    const c = app.clock;
    const effectsChanged = app.engagementFx.update(app.scenario, now, {
      enabled:
        app.gameStarted &&
        app.score.scene === "strategy" &&
        !app.engageTransition?.active,
      paused: document.hidden || !c || c.hold || c.speed <= 0,
    });
    const isRunning =
      c &&
      c.speed > 0 &&
      !c.hold &&
      // HUD刚装配且没有模态时dialogCount允许缺省；undefined不能被误判为暂停。
      (app.hud?.dialogCount ?? 0) === 0 &&
      (!app.gamebar ||
        (!app.gamebar.listDialog &&
          app.gamebar.selectedSubmenu == null &&
          !app.gamebar.settingsOpen &&
          !app.gamebar.systemSaveDialog &&
          !app.gamebar.systemLoadConfirmDialog &&
          !app.gamebar.exitConfirmDialog));

    let mapDrawn = false;
    if (isRunning) {
      // 时钟流逝期间：逐帧重绘，驱动军团行走平滑插值 (60fps lerp)
      app.view.draw();
      mapDrawn = true;
    } else if (c) {
      // 暂停/冻结期间：仅在日期变化时重绘
      const key = `${c.year}/${c.month}/${c.day}/${c.hold ? 1 : 0}`;
      if (key !== lastDateKey) {
        lastDateKey = key;
        app.view.draw();
        mapDrawn = true;
      }
    }
    if (!mapDrawn && (pointerChanged || mapRedrawRequested || effectsChanged)) {
      app.view.draw();
      mapDrawn = true;
    }
    mapRedrawRequested = false;

    uiAcc += dt;
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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
