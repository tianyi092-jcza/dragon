// Web 存档：仅保存玩家浏览器 IndexedDB 中的 JSON 状态。
// 不读取、生成或上传 DOS SAVE.DAT；二进制格式兼容代码已从正式产品路径移除。
import { isLegionDelegated } from "./legionmode.js";
import { serializeRoadMarchContext } from "./roadgraph.js";

export function canSnapshotState(app) {
  return !(
    app?.engageTransition?.active ||
    app?.battleView?.active ||
    app?._strategicCityRequest ||
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
  for (const saved of webMeta?.legionRuleState ?? []) {
    const legion = state.legions?.find(
      (candidate) => (candidate.slot ?? candidate.idx) === saved.slot,
    );
    if (!legion) continue;
    if (saved._retreat) legion._retreat = structuredClone(saved._retreat);
    if (saved.retreatMarch)
      legion._savedRetreatMarch = structuredClone(saved.retreatMarch);
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
  const state = structuredClone({ ...sc });
  delete state.armies;
  delete state._nextRuntimeLegionId;
  delete state._appeared;
  delete state._strategicTickSerial;
  state.legions = state.legions
    .filter((legion) => !legion.dead)
    .map((legion) => {
      const clean = { ...legion };
      isLegionDelegated(clean);
      const roadContext = serializeRoadMarchContext(legion._march);
      if (roadContext) {
        clean.roadStride = roadContext.stride;
        clean.roadPointAddress = roadContext.pointAddress;
        clean.roadEdgeOrNode = roadContext.edgeOrNode;
      }
      delete clean._march;
      delete clean._currentNode;
      delete clean._runtimeId;
      delete clean._markerFrame;
      delete clean._renderMoveSerial;
      delete clean._path;
      delete clean._ptx;
      delete clean._pty;
      delete clean._feint;
      return clean;
    });
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
      const sourceLegion = sc.legions.find(
        (candidate) => (candidate.slot ?? candidate.idx) === slot,
      );
      const sourceMarch = sourceLegion?._march;
      const retreatMarch =
        legion._retreat && sourceMarch?.currentNode == null
          ? {
              targetX: sourceMarch.targetX,
              targetY: sourceMarch.targetY,
              targetNode: sourceMarch.targetNode ?? null,
              edgeId: sourceMarch.edgeId ?? null,
              toNode: sourceMarch.toNode ?? null,
              pointIndex: sourceMarch.pointIndex ?? 0,
              points: sourceMarch.points?.map((point) => ({ ...point })) ?? [],
            }
          : null;
      return {
        slot,
        _retreat: legion._retreat ?? null,
        retreatMarch,
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
        strategicEventSlots: structuredClone(sc.strategicEventSlots ?? []),
        disasterMapObjects: structuredClone(sc.disasterMapObjects ?? []),
        weatherClouds: structuredClone(sc.weatherClouds ?? []),
        _disasterBounds: structuredClone(sc._disasterBounds ?? null),
        delayedLegionReturns: structuredClone(sc.delayedLegionReturns ?? []),
        _legionBatchCursor: sc._legionBatchCursor ?? 0,
        _cityTickCursor: sc._cityTickCursor ?? 0,
        _factionTickCursor: sc._factionTickCursor ?? 0,
        _strategicEventCursor: sc._strategicEventCursor ?? 0,
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
          strategicCityPrimary: faction.strategic_city_primary ?? null,
          strategicCitySecondary: faction.strategic_city_secondary ?? null,
        })),
      },
    },
  };
}
