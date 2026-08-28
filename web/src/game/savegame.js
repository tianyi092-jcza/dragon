// 存盘序列化 — 复刻 KI.EXE 存盘例程 0x8CFF (2026-08-24)
// 槽格式: slot×0x56C0; +0..0x3A CS:[0xCF0] 全局块镜像 / +0x40 32B标签(Big5)
// / +0x80 状态段(=剧本文件同布局, 静态字节取剧本槽底版) / 尾部事件队列 0x400
// 素材: scen_raw.json(4×剧本槽b64+SAVE.DAT底版b64) big5_map.json(字符→Big5)
import { loadJSON } from "../core/assets.js";

const SLOT_SIZE = 0x56c0;
const N_SLOT = 4;
const OFF_FACTION = 0x80; // 24×64B
const OFF_DIPLO = 0x680; // 行距24
const OFF_CITY = 0x8c0; // 200×32B
const LEGION_BASE = 0x2240; // 军团记录64B×32
const OFF_GENERAL = 0x42c0; // 128×32B

let scenRaw = null;
let big5Map = null;

/** 启动时载入存盘素材 (main.js 装配阶段调用一次) */
export async function initSaveAssets() {
  [scenRaw, big5Map] = await Promise.all([
    loadJSON("scen_raw.json"),
    loadJSON("big5_map.json"),
  ]);
}

function b64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 字符串→Big5 字节 (未收录字符以 '?' 兜底) */
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

/**
 * 序列化当前运行时状态 → 单个 SAVE.DAT 槽 (0x56C0 B)
 * 以剧本槽为底版保证静态字节与原版一致, 仅回写可变字段。
 */
export function serializeSlot(app, label) {
  const sc = app.scenario;
  const slot = b64Bytes(scenRaw.slots[app.scenarioIdx]).slice();

  // ---- 全局块 (+0..0x3A): 月历/玩家势力/信赖/税率 ----
  // [0xCF0]word=本月天数<<8|当日 / +2子刻度 / +3时刻 / +4月 / +6word年
  const ck = app.clock;
  u16(slot, 0x00, (ck.daysInMonth << 8) | ck.day);
  slot[0x02] = 0;
  slot[0x03] = 0;
  slot[0x04] = ck.month;
  slot[0x05] = 0;
  u16(slot, 0x06, ck.year);
  if (sc.player_faction != null) slot[0x0f] = sc.player_faction;
  if (sc.trust != null) u8(slot, 0x10, sc.trust);
  if (sc.tax != null) u8(slot, 0x18, sc.tax);

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
    if (f.monarch_idx != null) slot[o + 1] = f.monarch_idx;
    slot[o + 3] = f.capital == null ? 0xff : f.capital;
    u8(
      slot,
      o + 0x18,
      sc.generals.filter((g) => g && g.faction === f.idx && g.active !== false)
        .length,
    );
    u16(slot, o + 0x20, Math.min(f.gold ?? f.money ?? 0, 0xffff));
    slot[o + 0x22] = 0;
    u8(slot, o + 0x23, sc.citiesOf(f.idx).length);
  }

  // ---- 城池区 (200×32 @0x8C0): 所属/生产/sim(士气·粮·上限·兵·耗) ----
  for (let i = 0; i < sc.cities.length; i++) {
    const c = sc.cities[i];
    const o = OFF_CITY + i * 32;
    slot[o + 1] = c.faction == null ? 0x18 : c.faction;
    if (c.prod != null) u16(slot, o + 0x0e, c.prod);
    const s = c.sim;
    if (s) {
      u8(slot, o + 0x10, s.morale ?? 0); // 士气
      u8(slot, o + 0x11, s.food ?? 0); // 储粮
      u8(slot, o + 0x12, s.cap ?? 0); // 兵上限
      u8(slot, o + 0x13, s.troops ?? 0); // 现兵
      u8(slot, o + 0x15, s.drain ?? 0); // 日耗
    }
  }

  // ---- 军团记录 (64B×32 @0x2240): 先清区再写存活军团 ----
  slot.fill(0, LEGION_BASE, LEGION_BASE + 32 * 64);
  sc.legions.slice(0, 32).forEach((A, j) => {
    if (A.dead || A.faction == null) return;
    const r = LEGION_BASE + j * 64;
    slot[r] = 0x80; // 存活位图 (bit2有命令/bit5战斗中 未用)
    slot[r + 1] = A.faction;
    const gi = sc.generals.findIndex((g) => g && g.name === A.leader);
    u16(slot, r + 2, gi >= 0 ? gi : 0xff);
    u16(slot, r + 0x10, A.x ?? 0);
    u16(slot, r + 0x12, A.y ?? 0);
    u16(slot, r + 0x20, A.troops ?? 0);
  });

  // ---- 武将区 (128×32 @0x42C0): 状态(+17)/所属(+1C)/原属(+1D) ----
  for (let i = 0; i < sc.generals.length; i++) {
    const g = sc.generals[i];
    if (!g) continue;
    const o = OFF_GENERAL + i * 32;
    if (g.status != null) slot[o + 0x17] = g.status;
    slot[o + 0x1c] = g.faction == null ? 0xff : g.faction;
    if (g.origFaction != null) slot[o + 0x1d] = g.origFaction;
  }
  return slot;
}

/** 组装完整 SAVE.DAT (4×0x56C0): 底版保留其它槽, 写入目标槽 */
export function serializeSave(app, slotIdx, label) {
  const total = N_SLOT * SLOT_SIZE;
  let dat = scenRaw.save_b64
    ? b64Bytes(scenRaw.save_b64)
    : new Uint8Array(total);
  if (dat.length !== total) {
    const t = new Uint8Array(total);
    t.set(dat.subarray(0, Math.min(dat.length, total)));
    dat = t;
  }
  dat.set(serializeSlot(app, label), slotIdx * SLOT_SIZE);
  return dat;
}

/** 运行时状态快照 → save.json 槽条目结构 (供 app.saves 即时读档) */
export function snapshotState(app, slotIdx, label) {
  const sc = app.scenario;
  const st = structuredClone({ ...sc });
  delete st.armies; // 与 legions 同引用, 克隆后冗余
  st.legions = st.legions.filter((A) => !A.dead);
  const ck = app.clock;
  st.save_date = { year: ck.year, month: ck.month, day: ck.day };
  return {
    slot: slotIdx,
    label,
    played: true,
    scenario_idx: app.scenarioIdx,
    state: st,
  };
}
