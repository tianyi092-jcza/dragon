// 引擎主入口 — 装配数据/视图/输入/HUD
import { loadJSON } from "./core/assets.js";
import {
  MapView,
  preloadDisasterObjectImages,
  preloadEngageMarkerImages,
  preloadWeatherCloudImages,
} from "./render/mapview.js";
import { attachInput } from "./core/input.js";
import { HUD } from "./ui/hud.js";
import { GameBar } from "./ui/gamebar.js";
import { createNewGameScenario, seasonOf, SEASONS } from "./game/world.js";
import { Clock } from "./game/clock.js";
import { captureLegionContinuation } from "./game/legioncontinuation.js";
import {
  prepareScenario,
  assertPlayableScenario,
  scenarioNativeRoadContext,
} from "./game/scenarioassembly.js";
import {
  aiTick,
  buildArmies,
  cancelLegionSlotBatch,
  clearNativeUiContinuations,
  clearNativeSuspendContinuations,
  finishDeferredLegionDaily,
  initializeStrategicDiplomacy,
  monthlyAI,
  monthlyDiplomacyAI,
  completePlayerWarDeclaration,
  enqueueDeficitTrustEvent,
  enqueueMonthlyDisasterEvents,
  processMonthlyBudgetProducers,
  processMonthlyFiscalSettlement,
  processMonthlyGeneralFates,
  processMonthlyGeneralRatings,
  processMonthlyPolicyActivation,
  tickFactionStrategicState,
  tickStrategicWarEvents,
} from "./game/ai.js";
import { defaultWorldResources } from "./game/worldresources.js";
import { loadBuiltinContent } from "./content/catalog.js";
import { STRATEGIC_LAYOUT } from "./content/worlddefinition.js";
import * as cmd from "./game/commands.js";
import { monthlyAppear } from "./game/recruits.js";
import { hasNativeLegionSlots } from "./game/nativelegions.js";
import { bindNativePlayerFactionPointer } from "./game/nativefactions.js";
import { BattleView } from "./render/battleview.js";
import { EndView } from "./render/endview.js";
import { StartMenu } from "./ui/startmenu.js";
import * as speaker from "./core/speaker.js";
import { MusicPlayer } from "./core/music.js";
import { ScoreDirector } from "./core/score.js";
import { EngagementPresentation } from "./render/engagementpresentation.js";
import { createStrategicBattleMethods } from "./app/battleflow.js";
import {
  createOriginalBattleRng,
  originalBiosClockFromDate,
} from "./game/battle/originalrng.js";
import {
  admitSavedScenario,
  canSnapshotState,
  snapshotState,
} from "./game/savegame.js";
import { localSaveRepository } from "./core/localstore.js";
import {
  normalizeDisasterMapObjectState,
  normalizeWeatherCloudState,
} from "./game/weather.js";

const app = {
  data: null,
  content: null,
  saveRepository: localSaveRepository,
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
    const entry = {};
    this._gameEntryRequest = entry;
    const assertCurrentEntry = () => {
      if (this._gameEntryRequest !== entry)
        throw new DOMException("Game entry superseded", "AbortError");
    };
    this.setRuntimeEnabled(false);
    try {
      await this.ensureGameAssets();
      assertCurrentEntry();
      this.ensureGameShell();
      await load();
      assertCurrentEntry();
      this.gameStarted = true;
      this.exitConfirmed = false;
      this.hud ??= new HUD(this);
      this.hud.buildLegend();
      this.hud.refreshInfo();
      await this.gamebar._assets;
      assertCurrentEntry();
      document.body.classList.add("game-active");
      this.view.draw();
      this.opening?.hide();
    } catch (error) {
      if (this._gameEntryRequest === entry) {
        this.score.title();
        this.gameStarted = false;
        document.body.classList.remove("game-active");
      }
      throw error;
    } finally {
      if (this._gameEntryRequest === entry) this.setRuntimeEnabled(true);
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
    // Recheck the current slot before enterGame changes runtime/UI; never trust rows.
    const saved = this.saves?.slots.find((slot) => slot.slot === slotIdx);
    admitSavedScenario(saved, this);
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
    if (this.clock) {
      if (this.gamebar) this.gamebar.syncClock();
      else
        this.clock.hold =
          !this.runtimeEnabled || Boolean(this._scenarioAssemblyPending);
    }
  },

  /**
   * 委任速算仍在倒数为1且道路轮询到期时结算。独立音画到此一起停止；
   * 这里只留一个RAF的gate，不等待或追加动画/声音。
   */
  playDelegatedEngage(legion, onFinish) {
    if (this.engageTransition?.active || typeof onFinish !== "function")
      return false;
    this.engagementFx.reset();
    const continuation = captureLegionContinuation(this);
    let done = false;
    let rafId = null;
    const transition = {
      active: true,
      legion,
      cancel: () => complete(() => cancelLegionSlotBatch(this)),
      setRuntimeEnabled() {},
    };
    const complete = (operation) => {
      if (done) return;
      done = true;
      transition.active = false;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (this.engageTransition === transition) this.engageTransition = null;
      try {
        if (!continuation.claim()) return;
        operation();
      } finally {
        this.gamebar?.syncClock?.();
        this.view?.draw?.();
      }
    };
    this.engageTransition = transition;
    this.gamebar?.syncClock?.();
    rafId = requestAnimationFrame(() =>
      complete(() => {
        onFinish();
        finishDeferredLegionDaily(
          this,
          continuation.batch,
          continuation.ticket,
        );
      }),
    );
    return true;
  },

  /** 游戏结束：清理运行态并返回首页开局选单 (YES/NO) */
  async returnToTitle(initialAction) {
    this._gameEntryRequest = null;
    this._scenarioAssemblyPending = null;
    this._scenarioAssemblyIncomplete = null;
    cancelLegionSlotBatch(this);
    this._strategicBattleFailure = null;
    this._strategicCityRequest = null;
    this.engagementFx.reset();
    // P91：回标题同时废除旧 UI continuation（与 reset 队列同理）。
    clearNativeUiContinuations(this);
    // 挂起中的规则消息模态属于旧剧本：resume带旧scenario/ticket，
    // 留之则load后触发抛mismatch冻新局；剧本整体替换，丢尾合法。
    clearNativeSuspendContinuations(this);
    this.score.title();
    this.opening?.showFinished();
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
    this.setRuntimeEnabled(true);
    try {
      await this.startMenu.show(initialAction);
    } finally {
      if (this.gamebar) this.gamebar._clockHoldRequested = false;
      this.gamebar?.syncClock();
    }
  },

  // Tactical entry/exit ownership and startup errors share one adapter.
  ...createStrategicBattleMethods(),

  checkTrustGameOver() {
    return cmd.checkTrustGameOver(this);
  },

  completePlayerWarDeclaration(targetFaction) {
    return completePlayerWarDeclaration(this, targetFaction);
  },

  setScenario(i, playerFaction = null, advisor) {
    const raw = createNewGameScenario(
      this.content ? this.content.chapter(i)?.template : this.data.scenarios[i],
      playerFaction,
      advisor,
    );
    return this.loadState(raw, i, {
      initializeDiplomacy: playerFaction != null,
      mode: "fresh",
    });
  },

  /** 公共装配路径: 剧本与读档共用 (raw=parse_sinario/parse_save 输出的 state) */
  async loadState(
    raw,
    idx,
    {
      rngSnapshot = null,
      initializeDiplomacy = false,
      mode = "restore",
      metadata = null,
      roadMemory = null,
      movementMemory = null,
      terrainMemory = null,
      cityCache = null,
      savedSlot = null,
      savedLabel = null,
    } = {},
  ) {
    const loadedWorld = this.world,
      loadedContent = this.content;
    const entry = this._gameEntryRequest,
      previousClock = this.clock;
    const prior = this._scenarioAssemblyPending;
    const previousHold =
      prior && prior.preflightClock === previousClock
        ? prior.previousHold
        : previousClock?.hold;
    const assembly = { preflightClock: previousClock, previousHold };
    rngSnapshot = structuredClone(rngSnapshot);
    this._scenarioAssemblyPending = assembly;
    if (this.gamebar) this.gamebar.syncClock();
    else if (previousClock) previousClock.hold = true;
    const assertCurrentPreflight = () => {
      if (
        this._scenarioAssemblyPending !== assembly ||
        this.world !== loadedWorld ||
        this.content !== loadedContent ||
        this._gameEntryRequest !== entry ||
        this.clock !== previousClock
      )
        throw new DOMException("Scenario assembly superseded", "AbortError");
    };
    let prepared;
    try {
      prepared = await prepareScenario({
        raw,
        idx,
        content: loadedContent,
        world: loadedWorld,
        mode,
        metadata,
        roadMemory,
        movementMemory,
        terrainMemory,
        cityCache,
      });
      assertCurrentPreflight();
      // v2 never reaches initPlayer/buildArmies/diplomacy or the default v1 facades.
      assertPlayableScenario(prepared);
    } catch (error) {
      if (this._scenarioAssemblyPending === assembly) {
        this._scenarioAssemblyPending = null;
        if (this.gamebar) this.gamebar.syncClock();
        else if (this.clock === previousClock && previousClock)
          previousClock.hold =
            !!this._scenarioAssemblyIncomplete || previousHold;
        this.hud?.flashEvent?.("道路資料載入失敗，無法裝配此局。");
        globalThis.__dragonDebug?.reportError?.(
          "strategic map navigation assets failed to load",
          error,
        );
      }
      throw error;
    }
    // Protect installed/partially written state independently of the replaceable
    // preflight ticket. A rejected replacement must not release or revive it.
    this._scenarioAssemblyIncomplete = assembly;
    // Commit boundary. Later failures retain existing partial assembly semantics.
    cancelLegionSlotBatch(this);
    this._strategicBattleFailure = null;
    this.engagementFx.reset();
    // P91：剧本提交同时废除旧 UI continuation（与 reset 队列同理）。
    clearNativeUiContinuations(this);
    clearNativeSuspendContinuations(this);
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
    this.scenario = prepared.scenario;
    if (mode === "fresh") this.loadedSaveSlot = null;
    if (this.clock) this.clock.hold = true;
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
    const loadedScenario = this.scenario;
    let ownedClock = this.clock;
    const assertCurrentAssembly = () => {
      if (
        this._scenarioAssemblyPending !== assembly ||
        this._scenarioAssemblyIncomplete !== assembly ||
        this._gameEntryRequest !== entry ||
        this.content !== loadedContent ||
        this.scenario !== loadedScenario ||
        this.world !== loadedWorld ||
        this.clock !== ownedClock
      )
        throw new DOMException("Scenario assembly superseded", "AbortError");
    };
    assertCurrentAssembly();
    cmd.initPlayer(this.scenario); // ★原版剧本头FF=未指定→默认势力0/信赖100
    // P87 (KI 1B17-equivalent): CFD bound once CFF is resolved; one point
    // covers fresh assembly and snapshot restore alike. Absent = unselected.
    bindNativePlayerFactionPointer(this.scenario, "loadState/initPlayer");
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
    const seasonReady = this.setSeason(
      seasonOf(startMonth),
      () =>
        this._scenarioAssemblyPending === assembly &&
        this.scenario === loadedScenario,
    );
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
        // Native cursors commit at 3F6F / 25FF, never on a failed return.
        // P65 G4 (entire-v2-replacement gate): the v1 cursor arm is deleted.
        // Admission (G5) guarantees a native road context for every App
        // scenario, so no non-native live pump remains to advance here.
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
        const rep = processMonthlyFiscalSettlement(this, c);
        this.hud.showSettlement(rep);
        // 5921/5999玩家消息挂起时，剩余月结步延后为deferredTail（原版
        // CDE+8810阻塞语义）；无挂起则按5358序立即顺序执行。
        const nativeBlocked = !!(
          scenarioNativeRoadContext(this.scenario) ||
          hasNativeLegionSlots(this.scenario)
        );
        const runRemainingMonthEndSteps = () => {
          processMonthlyGeneralRatings(this); // ★0x5391→0x55A6 固定0..126派生评分
          monthlyDiplomacyAI(this); // ★0x5394→0x2BD9 关系变化/type-1宣战事件
          processMonthlyBudgetProducers(this); // ★0x5397/539A→5715/578F type4/5预算
          enqueueMonthlyDisasterEvents(this); // ★0x539D/0x53A0→type11/12
          enqueueDeficitTrustEvent(this); // ★0x53A3→0x57FE type-13负资金信赖处罚
          processMonthlyPolicyActivation(this); // ★0x53A6：严格8B政策镜像与5E80表现返回
          monthlyAI(this); // ★只清理退场军团；通关后不再触发D7END过场
          cmd.monthEnd(this); // ★征兵到达；天灾/暴动已排入type11/12
          // native场景登场由585F逐月倒数驱动；v1静态阈值法会腐蚀G18。
          if (!nativeBlocked) monthlyAppear(this);
        };
        // ★0x538E→0x585F/0x5940 type-9武将回归事件
        if (
          processMonthlyGeneralFates(this, runRemainingMonthEndSteps) !==
          "suspended"
        )
          runRemainingMonthEndSteps();
      },
      onDay: null,
    });
    ownedClock = this.clock;
    this.clock.hold = true; // this load owns the hold until its final ready barrier
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
    const ready = await seasonReady;
    assertCurrentAssembly();
    this._scenarioAssemblyPending = null;
    this._scenarioAssemblyIncomplete = null;
    if (savedSlot !== null) {
      this.loadedSaveSlot = savedSlot;
      this._lastLoadedSaveLabel = savedLabel;
    }
    if (this.gamebar) this.gamebar.syncClock();
    else this.clock.hold = !this.runtimeEnabled;
    return ready;
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
      try {
        let sv = snapshotState(this, slotIdx, label);
        // Stored snapshots are immutable to gameplay; copy the index, not every
        // other archive's full rule RAM, when replacing one record.
        const next = { schema: 1, slots: this.saves.slots.slice() };
        const index = next.slots.findIndex((saved) => saved.slot === slotIdx);
        if (index >= 0) {
          sv = await this.saveRepository.put(sv);
          next.slots[index] = sv;
        } else {
          sv = await this.saveRepository.add(sv);
          next.slots.push(sv);
        }
        slotIdx = sv.slot;
        this.saves = next;
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
    // Reject old/invalid phases before changing the scene, RNG or slot.
    // Restoration deep-clones; playing never mutates the stored snapshot.
    const admitted = admitSavedScenario(sv, this);
    await this.loadState(admitted.raw, admitted.idx, {
      mode: "restore",
      metadata: admitted.metadata,
      roadMemory: admitted.roadMemory,
      movementMemory: admitted.movementMemory,
      terrainMemory: admitted.terrainMemory,
      cityCache: admitted.cityCache,
      rngSnapshot: sv.webMeta?.originalRng ?? null,
      savedSlot: slotIdx,
      savedLabel: sv.label,
    });
    return true;
  },

  setSeason(i, isCurrent = () => true) {
    this.seasonIdx = i;
    const world = this.world;
    return world.loadSeason(SEASONS[i]).then((img) => {
      if (!isCurrent() || this.world !== world || this.seasonIdx !== i) return;
      this.view.seasonImg = img;
      if (this.gameStarted) this.view.draw();
    });
  },
};
app.score = new ScoreDirector(app.music, () => app.clock);

const canvas = document.querySelector("#cv");
window.__app = app; // 调试句柄(控制台可用 __app.clock 等)
window.app = app;
app.view = new MapView(canvas, () => app.scenario, () => app.world.definition);
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
export async function startApp(opening) {
  app.opening = opening;
  app.runtimeEnabled = false;
  [app.content, app.saves] = await Promise.all([
    loadBuiltinContent(),
    app.saveRepository.load(),
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
  // boot.js 取得单实例锁后挂载独立开场；这里不装配默认地图。
  globalThis.__dragonApp = app;
  await Promise.all([opening?.menuReady, app.startMenu._loadAssets()]);
  await app.startMenu.show(); // 15秒或提前跳过后显示；弹窗流程独立于开场控制
  window.__aiTick = () => aiTick(app); // 调试句柄
  window.__monthlyAI = () => monthlyAI(app); // 调试句柄
  window.__monthlyAppear = () => monthlyAppear(app); // 调试句柄
  window.__monthlySettlement = () =>
    processMonthlyFiscalSettlement(app, app.clock); // 调试句柄：换月财务与据点结算

  // ── 主循环: 实时驱动游戏时钟 (对应 KI.EXE 0x1D8E) ──
  let last = performance.now(),
    uiAcc = 0,
    lastDateKey = "";
  function frame(now) {
    // 调度先行：任何逃逸异常都不能杀死主循环（P88：此前尾部调度，
    // onHour类异常曾永久冻结计时与光标；调度与工作解耦，异常仍上浮上报）。
    requestAnimationFrame(frame);
    const dt = now - last;
    last = now;
    if (!app.runtimeEnabled) {
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
    // 下一帧已在入口调度，此处不再调度（见P88注释）。
  }
  requestAnimationFrame(frame);
}
