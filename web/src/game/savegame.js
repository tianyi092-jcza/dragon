// 存盘序列化 — 复刻 KI.EXE 存盘例程 0x8CFF (2026-08-24)
// 槽格式: slot×0x56C0; +0..0x3A CS:[0xCF0] 全局块镜像 / +0x40 32B标签(Big5)
// / +0x80 状态段(=剧本文件同布局, 静态字节取剧本槽底版) / 尾部事件队列 0x400
// 素材: scen_raw.json(20×剧本槽b64+SAVE.DAT底版b64) big5_map.json(字符→Big5)
import { loadJSON } from "../core/assets.js";
import { isLegionDelegated } from "./legionmode.js";
import { ensureLegionUnits } from "./legionunits.js";
import { serializeRoadMarchContext } from "./roadgraph.js";
import {
  InstanceLeaseError,
  instanceFetch,
  requireInstanceRuntime,
} from "../core/singleinstance.js";

const SLOT_SIZE = 0x56c0;
const N_SLOT = 4;
const OFF_FACTION = 0x80; // 24×64B
const OFF_DIPLO = 0x680; // 行距24
const OFF_CITY = 0x8c0; // 200×32B
const LEGION_BASE = 0x22c0; // 槽文件偏移；运行时状态段内偏移0x2240
const N_LEGION = 128;
const OFF_GENERAL = 0x42c0; // 128×32B

let scenRaw = null;
let big5Map = null;
let saveImage = null;

/** 启动时载入存盘素材 (main.js 装配阶段调用一次) */
export async function initSaveAssets({ allowStaticFallback = false } = {}) {
  [scenRaw, big5Map] = await Promise.all([
    loadJSON("scen_raw.json"),
    loadJSON("big5_map.json"),
  ]);
  const bundled = scenRaw.save_b64
    ? b64Bytes(scenRaw.save_b64)
    : new Uint8Array(N_SLOT * SLOT_SIZE);
  // 本地服务提供当前整份 SAVE.DAT；fresh reload 必须以它为四槽底版，
  // 否则首次保存一个槽会把服务端其它三槽覆盖成 bundled scenRaw。
  try {
    requireInstanceRuntime();
    const response = await instanceFetch("/api/save.dat", {
      cache: "no-store",
    });
    if (response.status === 409 || response.status === 423)
      throw new InstanceLeaseError("lease-lost", response.status);
    if (!response.ok) throw new Error(`SAVE.DAT ${response.status}`);
    const current = new Uint8Array(await response.arrayBuffer());
    if (current.length !== N_SLOT * SLOT_SIZE)
      throw new Error(`bad SAVE.DAT size ${current.length}`);
    saveImage = current;
    requireInstanceRuntime();
  } catch (error) {
    // 仅测试/显式静态工具可请求bundled底版；正式boot对授权/网络/尺寸错误fail closed。
    if (!allowStaticFallback) throw error;
    saveImage = bundled;
  }
}

function b64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 字符串→Big5 字节 (未收录字符以 '?' 兜底) */
export function encodeWebSaveMeta(slotIdx, webMeta) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ slot: slotIdx, webMeta: webMeta ?? null }),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function applyWebMetaToState(state, webMeta) {
  const runtime = webMeta?.scenarioRuntimeState;
  for (const field of [
    "player_advisor",
    "pendingRecruits",
    "pendingTruceNegotiations",
    "pendingAssistanceNegotiations",
    "envoys",
    "prisoners",
  ]) {
    if (runtime && Object.hasOwn(runtime, field)) {
      state[field] = structuredClone(runtime[field]);
    }
  }
  for (const saved of runtime?.factionRuleState ?? []) {
    const faction = state.factions?.find(
      (candidate) => candidate.idx === saved.idx,
    );
    if (!faction) continue;
    if (saved.brokeMonths != null) faction.brokeMonths = saved.brokeMonths;
    if (saved.deficitScolded != null)
      faction.deficitScolded = saved.deficitScolded;
  }
  for (const saved of webMeta?.legionRuleState ?? []) {
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

export function big5Encode(str) {
  const out = [];
  for (const ch of String(str)) {
    const b = big5Map?.[ch];
    if (b) out.push(...b);
    else out.push(0x3f);
  }
  return Uint8Array.from(out);
}

const u8 = (a, i, v) => (a[i] = Math.max(0, Math.min(255, v | 0)));
const u16 = (a, i, v) => {
  a[i] = (v | 0) & 0xff;
  a[i + 1] = ((v | 0) >> 8) & 0xff;
};
const u24 = (a, i, v) => {
  const value = Math.max(0, Math.min(0xffffff, Math.trunc(Number(v) || 0)));
  a[i] = value & 0xff;
  a[i + 1] = (value >> 8) & 0xff;
  a[i + 2] = (value >> 16) & 0xff;
};

export function canSnapshotState(app) {
  return !(
    app?.engageTransition?.active ||
    app?.battleView?.active ||
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

/**
 * 序列化当前运行时状态 → 单个 SAVE.DAT 槽 (0x56C0 B)
 * 以当前SAVE目标槽为底版，保留所有未建模字节和尾部事件队列；
 * 仅在没有有效当前SAVE时（显式测试/工具）退回对应剧本槽。
 */
export function serializeSlot(app, label, slotIdx = null) {
  const sc = app.scenario;
  const sourceSlot = Number.isInteger(app.loadedSaveSlot)
    ? app.loadedSaveSlot
    : slotIdx;
  const sourceOffset = Number.isInteger(sourceSlot)
    ? sourceSlot * SLOT_SIZE
    : -1;
  const scenarioTemplate = scenRaw?.slots?.[app.scenarioIdx];
  const slot =
    Number.isInteger(app.loadedSaveSlot) &&
    sourceOffset >= 0 &&
    saveImage?.length === N_SLOT * SLOT_SIZE
      ? saveImage.slice(sourceOffset, sourceOffset + SLOT_SIZE)
      : typeof scenarioTemplate === "string"
        ? b64Bytes(scenarioTemplate).slice()
        : sourceOffset >= 0 && saveImage?.length === N_SLOT * SLOT_SIZE
          ? saveImage.slice(sourceOffset, sourceOffset + SLOT_SIZE)
          : null;
  if (!(slot instanceof Uint8Array) || slot.length !== SLOT_SIZE) {
    throw new Error(`missing scenario template ${app.scenarioIdx}`);
  }

  // ---- 全局块 (+0..0x3A): 月历/玩家势力/信赖/税率 ----
  // [0xCF0]word=本月天数<<8|当日 / +2子刻度 / +3时刻 / +4月 / +6word年
  const ck = app.clock;
  u16(slot, 0x00, (ck.daysInMonth << 8) | ck.day);
  u8(slot, 0x02, ck.sub ?? 0);
  u8(slot, 0x03, ck.hour ?? 0);
  slot[0x04] = ck.month;
  slot[0x05] = 0;
  u16(slot, 0x06, ck.year);
  if (sc.player_faction != null) slot[0x0f] = sc.player_faction;
  if (sc.trust != null) u8(slot, 0x10, sc.trust);
  // 章节号是 parse_save 映射20章的首选键；中篇原始模板自身并非全局号，
  // 因此必须由当前 data.json 索引显式回写，不能沿用源槽/模板的旧字节。
  if (Number.isInteger(app.scenarioIdx)) u8(slot, 0x11, app.scenarioIdx);
  if (sc.tax != null) u8(slot, 0x18, sc.tax);
  const writeConscription = (offset, values) => {
    for (let index = 0; index < 3; index++) {
      // Web 以“人”为单位，原版头部以十人为单位；不可表示的个位向下取整。
      const strength = Math.floor(
        Math.max(0, Number(values?.[index]) || 0) / 10,
      );
      u16(slot, offset + index * 2, Math.min(0xffff, strength));
    }
  };
  writeConscription(0x1a, sc.conscription);
  if (sc.next_tax != null) u8(slot, 0x20, sc.next_tax);
  writeConscription(0x22, sc.next_conscription);

  // ---- 标签 (+0x40, 32B Big5, 不足补空格) ----
  const lab = big5Encode(label).slice(0, 32);
  const labBuf = new Uint8Array(32).fill(0x20);
  labBuf.set(lab);
  slot.set(labBuf, 0x40);

  // ---- 外交矩阵 (@0x680, 行距24) ----
  const n = sc.factions.length;
  for (let i = 0; i < n; i++) {
    const row = sc.diplomacy?.[i];
    if (!row) continue;
    for (let j = 0; j < n && j < 24; j++) {
      if (row[j] != null) u8(slot, OFF_DIPLO + i * 24 + j, row[j]);
    }
  }

  // ---- 势力区 (24×64 @0x80): 君主/都城/金/将数/城数 ----
  for (let i = 0; i < n; i++) {
    const f = sc.factions[i];
    const o = OFF_FACTION + i * 64;
    if (f.attr != null) {
      let attr = f.attr & 0xff;
      attr = f.dead || f.active === false ? attr & 0x7f : attr | 0x80;
      slot[o] = attr;
    }
    if (f.monarch_idx != null) slot[o + 1] = f.monarch_idx;
    slot[o + 3] = f.capital == null ? 0xff : f.capital;
    u16(slot, o + 4, f.reserve_cav ?? 0);
    u16(slot, o + 6, f.reserve_arc ?? 0);
    u16(slot, o + 8, f.reserve_inf ?? 0);
    u8(
      slot,
      o + 0x18,
      sc.generals.filter((g) => g && g.faction === f.idx && g.active !== false)
        .length,
    );
    // 势力资金是24bit：word@+0x20 + byte@+0x22<<16。
    u8(slot, o + 0x19, f.target_faction == null ? 0xff : f.target_faction);
    u24(slot, o + 0x20, f.gold ?? f.money ?? 0);
    u8(slot, o + 0x23, sc.citiesOf(f.idx).length);
  }

  // ---- 城池区 (200×32 @0x8C0): 所属/生产/sim(士气·粮·上限·兵·耗) ----
  for (let i = 0; i < sc.cities.length; i++) {
    const c = sc.cities[i];
    const o = OFF_CITY + i * 32;
    slot[o + 1] = c.faction == null ? 0x18 : c.faction;
    if (c.prod != null) u16(slot, o + 0x0e, c.prod);
    const s = c.sim;
    u8(slot, o + 0x10, s?.morale ?? c.growth ?? 0); // 上升率/士气
    u8(slot, o + 0x11, s?.food ?? c.defence ?? 0); // 储备/防灾
    // 当前 Web/parser 已确认并实际使用的是 +0x12/+0x13 两个独立字节；
    // 不得以 u16 写入，否则会把当前城兵覆盖成上限高字节。
    u8(slot, o + 0x12, s?.cap ?? c.troops_cap ?? 0); // 城兵上限
    u8(slot, o + 0x13, s?.troops ?? c.troops ?? 0); // 当前城兵
    if (s?.drain != null) u8(slot, o + 0x15, s.drain); // 日耗
    u8(slot, o + 0x19, c.governor == null ? 0xff : c.governor);
  }

  // ---- 军团记录 (64B×128 @槽文件0x22C0 / 状态段0x2240):
  // 活动槽沿用当前底版的未建模字节，只覆盖已证字段；未占用槽清零，避免
  // 已解散/改槽军团复活。随后把0x2977延迟队列还原为status=8/+3倒计时槽。 ----
  const occupiedLegionSlots = new Set();
  const claimLegionSlot = (preferred) => {
    if (
      Number.isInteger(preferred) &&
      preferred >= 0 &&
      preferred < N_LEGION &&
      !occupiedLegionSlots.has(preferred)
    ) {
      occupiedLegionSlots.add(preferred);
      return preferred;
    }
    for (let slotIdx = 0; slotIdx < N_LEGION; slotIdx++) {
      if (occupiedLegionSlots.has(slotIdx)) continue;
      occupiedLegionSlots.add(slotIdx);
      return slotIdx;
    }
    return null;
  };
  sc.legions.forEach((A) => {
    if (A.dead || A._active === false || A.faction == null) return;
    const generalIndex = sc.generals.findIndex((g) => g && g.name === A.leader);
    const preferredSlot =
      Number.isInteger(A.slot) && A.slot >= 0 && A.slot < N_LEGION
        ? A.slot
        : generalIndex;
    const legionSlot = claimLegionSlot(preferredSlot);
    if (legionSlot == null) return;
    const r = LEGION_BASE + legionSlot * 64;
    let status = A.status ?? 0x80;
    if (A.delegated === true) status |= 0x04;
    else if (A.delegated === false) status &= ~0x04;
    // 0x2831/0x2880：接敌等待由status bit5与军团+3倒计时共同保存。
    const pendingEngagement = A._engagement;
    if (pendingEngagement) status |= 0x20;
    else status &= ~0x20;
    slot[r] = status & 0xff;
    slot[r + 1] = A.faction;
    // 0x291A读取byte [si+2]；+3由0x2831接敌倒计时复用，不能写成u16主将。
    u8(slot, r + 2, generalIndex >= 0 ? generalIndex : 0xff);
    u8(slot, r + 3, 0);
    // +8 是当前朝向/驻止帧，运行中会变化；+9 是势力标识图组基址。
    // 二者虽可从底版继承，但保存必须反映当前运行态，不能把旧帧写回来。
    const faction = sc.factions.find(
      (candidate) => candidate.idx === A.faction,
    );
    u8(slot, r + 0x08, A._markerFrame ?? A.marker_frame ?? 4);
    u8(
      slot,
      r + 0x09,
      A.marker_base ?? (faction?.march_marker_style ?? A.faction) * 5,
    );
    // Web兼容防御：原版记录固定六队；旧synthetic/recreation军团可能仅有总兵。
    // 共享helper补为项目既有默认编成，避免有效军团被写成六队0后由parser删除。
    const units =
      Array.isArray(A.units) && A.units.length === 6
        ? A.units.slice(0, 6)
        : ensureLegionUnits({ ...A }).slice(0, 6);
    const unitStrengths = units.map((unit) =>
      Math.max(0, Math.min(100, Math.floor((unit.troops ?? 0) / 10))),
    );
    u16(
      slot,
      r + 0x04,
      unitStrengths.reduce((sum, strength) => sum + strength, 0),
    );
    u8(slot, r + 0x06, A.morale ?? 200);
    if (pendingEngagement) {
      u8(
        slot,
        r + 0x03,
        pendingEngagement.countdown ?? A.engagementCountdown ?? 1,
      );
    }
    // 0x8CFF完整镜像：+0A stride、+0C点记录地址、+0E边/节点地址。
    // 先清理所有已建模导航字段：活动槽会继承底版未知字节；若当前命令已取消，
    // 不显式清零就会在下一次parse时复活旧目标/旧道路上下文。
    u8(slot, r + 0x0a, 0);
    u8(slot, r + 0x0b, 0);
    u16(slot, r + 0x0c, 0);
    u16(slot, r + 0x0e, 0);
    u16(slot, r + 0x14, 0);
    u16(slot, r + 0x16, 0);
    u16(slot, r + 0x18, 0);
    u8(slot, r + 0x20, 0xff);
    const roadContext = serializeRoadMarchContext(A._march);
    const roadStride = roadContext?.stride ?? A.roadStride;
    const roadPointAddress = roadContext?.pointAddress ?? A.roadPointAddress;
    const roadEdgeOrNode = roadContext?.edgeOrNode ?? A.roadEdgeOrNode;
    if (Number.isInteger(roadStride)) u8(slot, r + 0x0a, roadStride & 0xff);
    if (Number.isInteger(roadPointAddress))
      u16(slot, r + 0x0c, roadPointAddress);
    if (Number.isInteger(roadEdgeOrNode)) u16(slot, r + 0x0e, roadEdgeOrNode);
    u16(slot, r + 0x10, A.x ?? 0);
    u16(slot, r + 0x12, A.y ?? 0);
    if (Number.isInteger(A.targetNode)) u16(slot, r + 0x14, A.targetNode);
    const engagementCity =
      pendingEngagement?.kind === "siege"
        ? sc.cities[pendingEngagement.target?.cityIdx]
        : null;
    const targetX = engagementCity?.x ?? A.target?.x;
    const targetY = engagementCity?.y ?? A.target?.y;
    if (Number.isInteger(targetX)) u16(slot, r + 0x16, targetX);
    if (Number.isInteger(targetY)) u16(slot, r + 0x18, targetY);
    const hasTarget = Boolean(A._retreat || A.target || pendingEngagement);
    u8(slot, r + 0x0b, hasTarget ? 1 : 0);
    const targetCity =
      pendingEngagement?.kind === "siege"
        ? pendingEngagement.target?.cityIdx
        : (A._retreat?.cityIdx ?? A.target?.idx);
    if (Number.isInteger(targetCity)) u8(slot, r + 0x20, targetCity);
    u8(slot, r + 0x23, A.commandState ?? 0);
    for (let i = 0; i < 6; i++) {
      u8(slot, r + 0x29 + i * 4, unitStrengths[i]);
      u8(slot, r + 0x2a + i * 4, units[i]?.type ?? 4);
    }
  });
  for (const item of sc.delayedLegionReturns ?? []) {
    if (item.countdown <= 0 || item.faction == null) continue;
    const legionSlot = claimLegionSlot(
      Number.isInteger(item.slot) ? item.slot : item.generalIdx,
    );
    if (legionSlot == null) continue;
    const r = LEGION_BASE + legionSlot * 64;
    // 延迟回归不是活动军团，整条记录只保留已证四字节，不能继承旧活动槽状态。
    slot.fill(0, r, r + 64);
    slot[r] = 0x08;
    slot[r + 1] = item.faction;
    u8(slot, r + 2, item.generalIdx);
    u8(slot, r + 3, item.countdown);
  }
  for (let legionSlot = 0; legionSlot < N_LEGION; legionSlot++) {
    if (occupiedLegionSlots.has(legionSlot)) continue;
    const r = LEGION_BASE + legionSlot * 64;
    slot.fill(0, r, r + 64);
  }

  // ---- 武将区 (128×32 @0x42C0): 状态(+17)/所属(+1C)/原属(+1D) ----
  for (let i = 0; i < sc.generals.length; i++) {
    const g = sc.generals[i];
    if (!g) continue;
    const o = OFF_GENERAL + i * 32;
    if (g.attr != null) {
      let attr = g.attr & 0xff;
      if (g.active === false) attr &= 0x7f;
      slot[o] = attr;
    }
    if (g.status != null) slot[o + 0x17] = g.status;
    slot[o + 0x1c] = g.faction == null ? 0xff : g.faction;
    // +0x1D 是被俘时的原属势力；旧解析态字段名为 captive_flag。
    // 未发生 Web 俘获改写时必须保留解析出的值，不能把真实 DOS 俘虏清成 FF。
    const originalFaction = g.origFaction ?? g.captive_flag;
    slot[o + 0x1d] = originalFaction == null ? 0xff : originalFaction;
    if (g.talk_idx != null) u8(slot, o + 0x1e, g.talk_idx);
  }
  return slot;
}

/** 仅构造候选完整SAVE，不修改模块当前底版；服务端确认后再commit。 */
export function stageSave(app, slotIdx, label) {
  const total = N_SLOT * SLOT_SIZE;
  const baseline =
    saveImage?.length === total ? saveImage : new Uint8Array(total);
  const dat = baseline.slice();
  dat.set(serializeSlot(app, label, slotIdx), slotIdx * SLOT_SIZE);
  return dat;
}

/** 服务端保存成功后更新本会话四槽底版。 */
export function commitSaveImage(dat) {
  if (!(dat instanceof Uint8Array) || dat.length !== N_SLOT * SLOT_SIZE)
    throw new Error("invalid committed SAVE.DAT image");
  saveImage = dat.slice();
}

/** 兼容导出/验证工具：构造并立即接纳候选SAVE。正式保存路径使用stage+commit。 */
export function serializeSave(app, slotIdx, label) {
  const dat = stageSave(app, slotIdx, label);
  commitSaveImage(dat);
  return dat;
}

/** 运行时状态快照 → save.json 槽条目结构 (供 app.saves 即时读档) */
export function snapshotState(app, slotIdx, label) {
  assertSnapshotSafe(app);
  const sc = app.scenario;
  const st = structuredClone({ ...sc });
  delete st.armies; // 与 legions 同引用, 克隆后冗余
  delete st._nextRuntimeLegionId;
  delete st._appeared; // Set通过webMeta.appearedGeneralIds显式持久化
  st.legions = st.legions
    .filter((A) => !A.dead)
    .map((A) => {
      // JSON不保留大点列，但先将E717道路地址写回轻量字段；接敌精确kind
      // 仍由Web sidecar覆盖，纯DOS档则首次tick按0x2831/0x2880重检。
      // 兼容旧metadata时只在快照副本上同步委任位；保存失败不得修改live对象。
      const clean = { ...A };
      isLegionDelegated(clean);
      const roadContext = serializeRoadMarchContext(A._march);
      if (roadContext) {
        clean.roadStride = roadContext.stride;
        clean.roadPointAddress = roadContext.pointAddress;
        clean.roadEdgeOrNode = roadContext.edgeOrNode;
      }
      delete clean._march;
      delete clean._runtimeId;
      delete clean._markerFrame;
      delete clean._path;
      delete clean._ptx;
      delete clean._pty;
      delete clean._feint;
      return clean;
    });
  const ck = app.clock;
  st.save_date = { year: ck.year, month: ck.month, day: ck.day };
  st.save_sub = ck.sub ?? 0;
  st.save_hour = ck.hour ?? 0;
  const originalRng = app.originalRng ?? app.activeBattleRng;
  const legionRuleState = st.legions
    .map((legion) => {
      const slot = Number.isInteger(legion.slot)
        ? legion.slot
        : sc.generals.findIndex(
            (general) => general && general.name === legion.leader,
          );
      if (slot < 0 || (!legion._retreat && !legion._engagement)) return null;
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
    state: st,
    webMeta: {
      schema: 2,
      originalRng:
        originalRng && typeof originalRng.snapshot === "function"
          ? originalRng.snapshot()
          : null,
      // 原版SAVE靠道路上下文逐轮重检战型；sidecar保存Web精确帧态与强制撤退，
      // 是快速恢复overlay，不占原版SAVE未知区。
      legionRuleState,
      // Set 无法经 structuredClone→JSON 自动保真；否则读档后已登场武将会再次触发。
      appearedGeneralIds:
        sc._appeared instanceof Set ? Array.from(sc._appeared) : [],
      // 仍未映射到已证SAVE字段的Web规则队列/标记，只在sidecar恢复。
      scenarioRuntimeState: {
        player_advisor: structuredClone(sc.player_advisor ?? null),
        pendingRecruits: structuredClone(sc.pendingRecruits ?? []),
        pendingTruceNegotiations: structuredClone(
          sc.pendingTruceNegotiations ?? [],
        ),
        pendingAssistanceNegotiations: structuredClone(
          sc.pendingAssistanceNegotiations ?? [],
        ),
        envoys: structuredClone(sc.envoys ?? {}),
        prisoners: structuredClone(sc.prisoners ?? []),
        factionRuleState: (sc.factions ?? []).map((faction) => ({
          idx: faction.idx,
          brokeMonths: faction.brokeMonths ?? null,
          deficitScolded: faction.deficitScolded ?? null,
        })),
      },
    },
  };
}
