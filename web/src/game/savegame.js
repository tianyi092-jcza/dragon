// Web 存档：仅保存玩家浏览器 IndexedDB 中的 JSON 状态。
// 不读取、生成或上传 DOS SAVE.DAT；二进制格式兼容代码已从正式产品路径移除。
import { isLegionDelegated } from "./legionmode.js";
import { assertNativeFateSnapshotState } from "./navigation/scenariolegionfate.js";
import {
  hasNativeLegionSlots,
  assertNativeLegionSlots,
  rebindNativeLegionViews,
  snapshotNativeLegionSlots,
} from "./nativelegions.js";
import {
  assertNativeFactionSlots,
  hasNativeFactionSlots,
  rebindNativeFactionViews,
} from "./nativefactions.js";
import {
  assertNativeDiplomacyMatrix,
  hasNativeDiplomacyMatrix,
  rebindNativeDiplomacyViews,
} from "./nativediplomacy.js";
import {
  assertNativeStrategicEventWheel,
  hasNativeStrategicEventWheel,
} from "./nativeevents.js";
import {
  assertNativeMonthlyPolicy,
  hasNativeMonthlyPolicy,
} from "./nativemonthlypolicy.js";
import { assertLegionPhaseState, LEGION_PHASE_VERSION } from "./legionphase.js";
import {
  readSavedAssembly,
  assertAssemblyIdentity,
  assertPlayableScenario,
  snapshotScenarioAssembly,
} from "./scenarioassembly.js";

export function canSnapshotState(app) {
  return !(
    app?.engageTransition?.active ||
    app?.battleView?.active ||
    app?._strategicCityRequest ||
    app?._scenarioAssemblyPending ||
    app?._scenarioAssemblyIncomplete ||
    app?._legionSlotBatch ||
    app?._nativeMonthlyFateContinuation ||
    app?._nativeExtinctionContinuation ||
    app?._nativeDiplomatContinuation ||
    app?._nativeGovernorContinuation ||
    app?._strategicBattleFailure ||
    app?.gamebar?._strategicMessageActive ||
    app?.gamebar?.proposalAudience ||
    app?.clock?._pendingStrategicAdvance ||
    app?.clock?._pendingDayAdvance
  );
}

function assertSnapshotSafe(app) {
  if (!canSnapshotState(app)) {
    throw new Error(
      "cannot save during battle transition or pending calendar advance",
    );
  }
}

// Current snapshots require the explicit fixed-slot phase format; do not
// reconstruct missing old state. Rejection itself does not write any save.
export function restoreSnapshotState(saved) {
  if (saved?.state?.legionPhaseVersion !== LEGION_PHASE_VERSION) {
    throw new Error("此為舊版 AI 存檔，已原樣保留；修正版請從新遊戲開始。");
  }
  let state;
  try {
    state = applyWebMetaToState(structuredClone(saved.state), saved.webMeta);
    assertNativeLegionSlots(state);
    if (hasNativeLegionSlots(state)) rebindNativeLegionViews(state);
    assertNativeFactionSlots(state);
    if (hasNativeFactionSlots(state)) rebindNativeFactionViews(state);
    assertNativeDiplomacyMatrix(state);
    if (hasNativeDiplomacyMatrix(state)) {
      rebindNativeDiplomacyViews(state);
      if (!hasNativeStrategicEventWheel(state))
        throw new TypeError("Missing native strategic event wheel");
      assertNativeStrategicEventWheel(state);
      if (!hasNativeMonthlyPolicy(state))
        throw new TypeError("Missing native monthly policy");
      assertNativeMonthlyPolicy(state);
    } else if (hasNativeMonthlyPolicy(state)) {
      throw new TypeError(
        "Native monthly policy requires native diplomacy matrix",
      );
    }
    assertLegionPhaseState(state);
  } catch (cause) {
    throw new Error("存檔的軍團調度資料不完整或已損壞，原存檔未變更。", {
      cause,
    });
  }
  const assembly = readSavedAssembly(saved);
  if (hasNativeLegionSlots(state) && assembly.metadata?.roadVersion !== 2)
    throw new TypeError("Native legion slots require v2 assembly identity");
  if (assembly.metadata?.roadVersion === 2)
    assertNativeCitySnapshotState(state);
  return state;
}

// Optional known native inputs remain optional; present bytes must survive
// JSON exactly. In particular array holes/NaN cannot turn into FF or zero.
function assertNativeCitySnapshotState(state) {
  assertNativeFateSnapshotState(state);
  if (hasNativeLegionSlots(state)) assertNativeFormationSnapshotState(state);
  const checkByte = (value, field, nullable = false) => {
    if (nullable && value === null) return;
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new TypeError(`Invalid native city/weather byte: ${field}`);
  };
  for (const city of state.cities ?? []) {
    for (const field of [
      "strategicThreat",
      "strategicBorderCount",
      "attr",
      "_strategicLastFaction",
      // P58 flip: fresh v2 initializes both 3F06/3F11 tick inputs from
      // record bytes, so restore validates both when present.
      "_aiCooldown",
    ])
      if (Object.hasOwn(city, field)) checkByte(city[field], field);
    if (Object.hasOwn(city, "faction"))
      checkByte(city.faction, "city faction", true);
    for (const [field, max] of [
      ["type", 15],
      ["prod", 65535],
    ]) {
      if (!Object.hasOwn(city, field)) continue;
      const value = city[field];
      if (!Number.isInteger(value) || value < 0 || value > max)
        throw new TypeError(`Invalid native capture city field: ${field}`);
    }
    if (Object.hasOwn(city, "strategicNeighbours")) {
      const neighbours = city.strategicNeighbours;
      if (!Array.isArray(neighbours) || neighbours.length !== 4)
        throw new TypeError("Invalid native strategicNeighbours");
      for (let i = 0; i < 4; i++)
        checkByte(neighbours[i], `strategicNeighbours[${i}]`);
    }
    if (Object.hasOwn(city, "governor"))
      checkByte(city.governor, "governor", true);
  }
  for (const faction of state.factions ?? [])
    if (Object.hasOwn(faction, "target_faction"))
      checkByte(faction.target_faction, "target_faction", true);
  for (const general of state.generals ?? [])
    if (general && Object.hasOwn(general, "faction"))
      checkByte(general.faction, "general faction", true);
  for (const records of [state.disasterMapObjects, state.weatherClouds])
    for (const record of records ?? []) {
      if (!record || !Object.hasOwn(record, "status")) continue;
      for (const field of ["status", "timer", "interval"])
        if (Object.hasOwn(record, field))
          checkByte(record[field], `weather ${field}`);
    }
}

// Formation's newly consumed named inputs: absent keys remain unknown, while
// own undefined/null/nonfinite values must not change meaning across JSON.
function assertNativeFormationSnapshotState(state) {
  const check = (record, field, max, nullable = false, min = 0) => {
    if (!record || !Object.hasOwn(record, field)) return;
    const value = record[field];
    if (nullable && value === null) return;
    if (!Number.isInteger(value) || value < min || value > max)
      throw new TypeError(`Invalid native formation field: ${field}`);
  };
  for (const faction of state.factions ?? []) {
    for (const field of [
      "march_marker_style",
      "legion_morale_cap",
      "n_legions",
    ])
      check(faction, field, 255);
    check(faction, "capital", 255, true);
    for (const field of ["reserve_cav", "reserve_arc", "reserve_inf"])
      check(faction, field, 65535);
    check(
      faction,
      Object.hasOwn(faction, "gold") ? "gold" : "money",
      0x7fffff,
      false,
      -0x800000,
    );
  }
  for (const general of state.generals ?? []) {
    check(general, "status", 255);
    check(general?.ability, "force", 255);
  }
}

/** Shared title/final-load admission. No terrain fetch or live mutation. */
export function admitSavedScenario(saved, app) {
  if (!saved?.played || !saved.state) throw new TypeError("Unused save slot");
  const raw = restoreSnapshotState(saved);
  const idx = saved.scenario_idx;
  if (
    !Array.isArray(raw.cities) ||
    !Number.isInteger(idx) ||
    idx < 0 ||
    idx >= app.data.scenarios.length
  )
    throw new TypeError("Invalid saved scenario index/state");
  const assembly = readSavedAssembly(saved);
  if (assembly.metadata)
    assertAssemblyIdentity(assembly.metadata, idx, app.content, app.world);
  assertPlayableScenario(assembly);
  return { raw, idx, ...assembly };
}

/** 将 Web 专有运行态覆盖到从 IndexedDB 取出的场景快照。 */
export function applyWebMetaToState(state, webMeta) {
  const runtime = webMeta?.scenarioRuntimeState;
  for (const field of [
    "player_advisor",
    "pendingRecruits",
    "pendingTruceNegotiations",
    "pendingAssistanceNegotiations",
    "pendingStrategicEvents",
    "pendingEnvoyBudgetReports",
    "strategicEventSlots",
    "disasterMapObjects",
    "weatherClouds",
    "_disasterBounds",
    "delayedLegionReturns",
    "envoys",
    "_legionBatchCursor",
    "_cityTickCursor",
    "_factionTickCursor",
    "_strategicEventCursor",
    "_strategicEventDivider",
    "_envoyDiplomacyCursor",
  ]) {
    if (field === "delayedLegionReturns" && hasNativeLegionSlots(state))
      continue;
    if (runtime && Object.hasOwn(runtime, field)) {
      state[field] = structuredClone(runtime[field]);
    }
  }
  if (state.pendingEnvoyBudgetReports?.length) {
    state.pendingStrategicEvents = [
      ...(state.pendingStrategicEvents ?? []),
      ...state.pendingEnvoyBudgetReports.map((report) => ({ type: 5, report })),
    ];
    state.pendingEnvoyBudgetReports = [];
  }
  for (const [targetIdx, envoy] of Object.entries(state.envoys ?? {})) {
    if (envoy?.budget == null) envoy.budget = 0;
    if (envoy?.requested == null) envoy.requested = 0;
    if (envoy?.reportPending == null) envoy.reportPending = false;
    const general =
      envoy?.gen_idx == null ? null : state.generals?.[envoy.gen_idx];
    if (general && general.assignment_budget == null) {
      general.assignment_budget = envoy.budget;
    }
    state.envoys[targetIdx] = envoy;
  }
  for (const saved of runtime?.cityRuleState ?? []) {
    const city = state.cities?.[saved.idx];
    if (city && saved.disasterEvent != null)
      city.disaster_event = saved.disasterEvent;
  }
  for (const saved of runtime?.factionRuleState ?? []) {
    const faction = state.factions?.find(
      (candidate) => candidate.idx === saved.idx,
    );
    if (!faction) continue;
    if (saved.extinctionHandled != null)
      faction._extinctionHandled = saved.extinctionHandled;
    if (saved.monthlyReserveUpkeep != null)
      faction.monthly_reserve_upkeep = saved.monthlyReserveUpkeep;
    if (Object.hasOwn(saved, "diplomatIdx"))
      faction.diplomat_idx = saved.diplomatIdx;
    if (Object.hasOwn(saved, "strategicCityPrimary"))
      faction.strategic_city_primary = saved.strategicCityPrimary;
    if (Object.hasOwn(saved, "strategicCitySecondary"))
      faction.strategic_city_secondary = saved.strategicCitySecondary;
  }
  for (const saved of hasNativeLegionSlots(state)
    ? []
    : (webMeta?.legionRuleState ?? [])) {
    const legion = state.legions?.find(
      (candidate) => (candidate.slot ?? candidate.idx) === saved.slot,
    );
    if (!legion) continue;
    if (saved._retreat) legion._retreat = structuredClone(saved._retreat);
    if (saved._engagement)
      legion._engagement = structuredClone(saved._engagement);
    if (saved.engagementCountdown != null)
      legion.engagementCountdown = saved.engagementCountdown;
  }
  if (Array.isArray(webMeta?.appearedGeneralIds)) {
    state._appeared = new Set(webMeta.appearedGeneralIds);
  } else if (Array.isArray(state._appeared)) {
    state._appeared = new Set(state._appeared);
  }
  return state;
}

/**
 * 运行时状态快照 → 浏览器本地存档槽。
 * _march 的大点列不直接 JSON 化，改存可恢复的道路上下文；精确接敌/撤退态在
 * webMeta 中保存，读取时由 applyWebMetaToState 覆盖。
 */
export function snapshotState(app, slotIdx, label) {
  assertSnapshotSafe(app);
  const sc = app.scenario;
  const assembly = snapshotScenarioAssembly(app);
  const nativeRoads = assembly.scenarioAssembly?.roadVersion === 2;
  if (nativeRoads) {
    assertNativeCitySnapshotState(sc);
    // JSON turns non-finite numbers into null, which these native bytes encode
    // as known FF. IndexedDB structuredClone itself does not lose these values.
    for (const faction of sc.factions)
      for (const field of [
        "strategic_city_primary",
        "strategic_city_secondary",
      ]) {
        const value = faction[field];
        if (typeof value === "number" && !Number.isFinite(value))
          throw new TypeError(
            `Non-finite native faction order: ${faction.idx} ${field}`,
          );
      }
  }
  const nativeSlots = hasNativeLegionSlots(sc);
  if (nativeSlots && !nativeRoads)
    throw new TypeError("Native legion slots require v2 assembly identity");
  const state = structuredClone(
    nativeSlots
      ? {
          ...sc,
          nativeLegionSlots: snapshotNativeLegionSlots(sc),
          legions: [],
          delayedLegionReturns: [],
        }
      : { ...sc },
  );
  delete state.armies;
  delete state._nextRuntimeLegionId;
  delete state._appeared;
  delete state._strategicTickSerial;
  state.legions = state.legions
    .filter((legion) => !legion.dead)
    .map((legion) => {
      const clean = { ...legion };
      isLegionDelegated(clean);
      // P66 G6 (entire-v2-replacement gate): the legacy !nativeRoads
      // _march-to-road-fields backfill is deleted. Post-G5 every App
      // scenario is bound v2 with explicit 0A/0C/0E; detached fixtures
      // carry their own explicit road fields. Never derive road fields
      // from a projection here.
      delete clean._march;
      delete clean._currentNode;
      delete clean._runtimeId;
      // Keep the actual runtime direction, including 0. Original L+08 is
      // consumed by 430B, not purely a disposable drawing cache. This does
      // not repair missing old values or certify the current direction writer.
      delete clean._renderMoveSerial;
      delete clean._path;
      delete clean._ptx;
      delete clean._pty;
      delete clean._feint;
      return clean;
    });
  if (nativeSlots) rebindNativeLegionViews(state);
  if (hasNativeFactionSlots(state)) {
    assertNativeFactionSlots(state);
    rebindNativeFactionViews(state);
  }
  if (hasNativeDiplomacyMatrix(state)) {
    assertNativeDiplomacyMatrix(state);
    rebindNativeDiplomacyViews(state);
    if (!hasNativeStrategicEventWheel(state))
      throw new TypeError("Missing native strategic event wheel");
    assertNativeStrategicEventWheel(state);
    if (!hasNativeMonthlyPolicy(state))
      throw new TypeError("Missing native monthly policy");
    assertNativeMonthlyPolicy(state);
  } else if (hasNativeMonthlyPolicy(state)) {
    throw new TypeError(
      "Native monthly policy requires native diplomacy matrix",
    );
  }
  assertLegionPhaseState(state);
  // Store the authoritative table once, not copies of active/delayed views.
  if (nativeSlots) {
    state.nativeLegionSlots = snapshotNativeLegionSlots(state);
    state.legions = [];
    state.delayedLegionReturns = [];
  }
  const clock = app.clock;
  state.save_date = {
    year: clock.year,
    month: clock.month,
    day: clock.day,
  };
  state.save_sub = clock.sub ?? 0;
  state.save_hour = clock.hour ?? 0;
  const originalRng = app.originalRng ?? app.activeBattleRng;
  const legionRuleState = state.legions
    .map((legion) => {
      const slot = Number.isInteger(legion.slot)
        ? legion.slot
        : sc.generals.findIndex(
            (general) => general && general.name === legion.leader,
          );
      if (slot < 0 || (!legion._retreat && !legion._engagement)) return null;
      // P79 G6-closed: retreatMarch compat-read deleted with the last v1
      // surface (no writer since P66 snapshots, no test pins it; pre-P66
      // saves fall under the approved no-old-save policy). Restore keeps
      // only authoritative _retreat/_engagement; mid-retreat resume rides
      // native road fields (P74-B twin-track proof).
      return {
        slot,
        _retreat: legion._retreat ?? null,
        _engagement: legion._engagement ?? null,
        engagementCountdown: legion.engagementCountdown ?? null,
      };
    })
    .filter(Boolean);
  return {
    slot: slotIdx,
    label,
    played: true,
    scenario_idx: app.scenarioIdx,
    state,
    webMeta: {
      schema: 1,
      ...assembly,
      originalRng:
        originalRng && typeof originalRng.snapshot === "function"
          ? originalRng.snapshot()
          : null,
      legionRuleState,
      appearedGeneralIds:
        sc._appeared instanceof Set ? Array.from(sc._appeared) : [],
      scenarioRuntimeState: {
        player_advisor: structuredClone(sc.player_advisor ?? null),
        pendingRecruits: structuredClone(sc.pendingRecruits ?? []),
        pendingStrategicEvents: structuredClone(
          sc.pendingStrategicEvents ?? [],
        ),
        pendingEnvoyBudgetReports: structuredClone(
          sc.pendingEnvoyBudgetReports ?? [],
        ),
        ...(nativeRoads
          ? Object.hasOwn(sc, "strategicEventSlots")
            ? { strategicEventSlots: structuredClone(sc.strategicEventSlots) }
            : {}
          : {
              strategicEventSlots: structuredClone(
                sc.strategicEventSlots ?? [],
              ),
            }),
        disasterMapObjects: structuredClone(sc.disasterMapObjects ?? []),
        weatherClouds: structuredClone(sc.weatherClouds ?? []),
        _disasterBounds: structuredClone(sc._disasterBounds ?? null),
        ...(nativeSlots
          ? {}
          : {
              delayedLegionReturns: structuredClone(
                sc.delayedLegionReturns ?? [],
              ),
            }),
        _legionBatchCursor: sc._legionBatchCursor ?? 0,
        _cityTickCursor: sc._cityTickCursor ?? 0,
        _factionTickCursor: sc._factionTickCursor ?? 0,
        ...(nativeRoads
          ? Object.hasOwn(sc, "_strategicEventCursor")
            ? { _strategicEventCursor: sc._strategicEventCursor }
            : {}
          : { _strategicEventCursor: sc._strategicEventCursor ?? 0 }),
        _strategicEventDivider: sc._strategicEventDivider ?? 7,
        _envoyDiplomacyCursor: sc._envoyDiplomacyCursor ?? 0,
        envoys: structuredClone(sc.envoys ?? {}),
        cityRuleState: (sc.cities ?? [])
          .filter((city) => city?.disaster_event != null)
          .map((city) => ({
            idx: city.idx,
            disasterEvent: city.disaster_event,
          })),
        factionRuleState: (sc.factions ?? []).map((faction) => ({
          idx: faction.idx,
          extinctionHandled: faction._extinctionHandled ?? false,
          monthlyReserveUpkeep: faction.monthly_reserve_upkeep ?? 0,
          diplomatIdx: faction.diplomat_idx ?? null,
          ...(nativeRoads
            ? {
                ...(Object.hasOwn(faction, "strategic_city_primary")
                  ? { strategicCityPrimary: faction.strategic_city_primary }
                  : {}),
                ...(Object.hasOwn(faction, "strategic_city_secondary")
                  ? { strategicCitySecondary: faction.strategic_city_secondary }
                  : {}),
              }
            : {
                strategicCityPrimary: faction.strategic_city_primary ?? null,
                strategicCitySecondary:
                  faction.strategic_city_secondary ?? null,
              }),
        })),
      },
    },
  };
}
