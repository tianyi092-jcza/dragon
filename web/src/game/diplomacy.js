// 外交系统 — 100% 还原原版 KI.EXE 外交引擎
// 逆向依据 (KI.EXE 0x30CB, 0x30D3, 0x30F0, 0x3644, 0x3674, 0x36C4, 0x3712, 0x3E8E, 0x7A9A, 0x7844):
//   1. 友好度存储: 24×24 矩阵 @ 状态段 0x680。
//      - bit 7 (0x80): 和平标记。bit 7 = 0 表示【交戰】(值 < 0x80)；bit 7 = 1 表示【和平】(值 >= 0x80)。
//      - 低 7 位 (0..100): 友好度数值 (0x00 ~ 0x64，对应 0 ~ 100)。
//      - 和平时实际存储值为 0x80 + 友好度 (如 0xB7 = 0x80 + 55 为中立，0xE4 = 0x80 + 100 为亲密滿值)。
//   2. 外交等级划分与颜色 (KI.EXE 0x7A9A & 0x7844):
//      - raw < 0x80: 【交戰】(红 #ff0000, 0x0A)
//      - raw >= 0x80 (取 val = raw & 0x7F, 0..100):
//        * 0..19   (raw 0x80..0x93): 【最惡】(深蓝 #00008b, 0x03)
//        * 20..39  (raw 0x94..0xA7): 【險惡】(黑 #000000, 0x00)
//        * 40..59  (raw 0xA8..0xBB): 【普通】(黑 #000000, 0x00，中立 55=0xB7 在此档)
//        * 60..79  (raw 0xBC..0xCF): 【良好】(黑 #000000, 0x00)
//        * 80..100 (raw 0xD0..0xE4): 【親密】(绿 #008000, 0x05)
//        * > 100 / 0xFF: 【－－】
//   3. 宣战与停战 (KI.EXE 0x3674 / 0x3644):
//      - 宣战 (0x3674): 清除 bit 7，值减半: raw = (raw & 0x7F) >> 1
//      - 停战 (0x3644): 置位 bit 7: raw = (min(raw_a, raw_b) & 0x7F) | 0x80
//   4. 外交官日常友好度维护 (KI.EXE 0x3E8E):
//      - 外交官政治力 pol，每月增益 gain = max(1, floor(pol / 4))，持续向 100 (raw 0xE4) 提升并维持。

import { playerFaction } from "./commands.js";

export const GIFT_COST = 200; // 遣使一次花费(金)
export const NEUTRAL = 0xb7; // 默认中立 (0x80 + 55)
export const HOSTILE = 0x80; // 恶劣底线 (0x80 + 0)
export const INTIMATE = 0xe4; // 亲密满值 (0x80 + 100)

/** 获取 a 势力对 b 势力的原始外交值 (0..255) */
export function relation(sc, a, b) {
  if (a == null || b == null) return NEUTRAL;
  if (a === b) return 0xff;
  return sc.diplomacy?.[a]?.[b] ?? NEUTRAL;
}

/** 是否处于交战状态 (bit 7 为 0，即 raw < 0x80) */
export function isAtWar(sc, a, b) {
  if (a == null || b == null || a === b) return false;
  return relation(sc, a, b) < 0x80;
}

/** 宣告交战 (复刻 KI.EXE 0x3674): 清除和平 bit 7，友好度减半 */
export function declareWar(sc, a, b) {
  if (a == null || b == null || a === b) return;
  if (!sc.diplomacy) sc.diplomacy = [];
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  if (!sc.diplomacy[b]) sc.diplomacy[b] = [];

  const curA = relation(sc, a, b) & 0x7f;
  const curB = relation(sc, b, a) & 0x7f;
  const minVal = Math.min(curA, curB);
  const warVal = minVal >> 1; // 0x365B: shr cl, 1 (不带 0x80)

  sc.diplomacy[a][b] = warVal;
  sc.diplomacy[b][a] = warVal;
}

/** 缔结停战 / 恢复和平 (复刻 KI.EXE 0x3644): 置位 bit 7 恢复和平状态 */
export function makeCeasefire(sc, a, b) {
  if (a == null || b == null || a === b) return;
  if (!sc.diplomacy) sc.diplomacy = [];
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  if (!sc.diplomacy[b]) sc.diplomacy[b] = [];

  const curA = relation(sc, a, b) & 0x7f;
  const curB = relation(sc, b, a) & 0x7f;
  const minVal = Math.min(curA, curB);
  const peaceVal = minVal | 0x80; // 0x3688: or cl, 0x80

  sc.diplomacy[a][b] = peaceVal;
  sc.diplomacy[b][a] = peaceVal;
}

/** 提升双方友好度 (复刻 KI.EXE 0x30D3) */
export function increaseRelation(sc, a, b, delta) {
  if (a == null || b == null || a === b || !sc.diplomacy) return;
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  if (!sc.diplomacy[b]) sc.diplomacy[b] = [];

  const rawA = relation(sc, a, b);
  const isPeaceA = (rawA & 0x80) !== 0;
  const valA = Math.min(100, (rawA & 0x7f) + delta);
  sc.diplomacy[a][b] = isPeaceA ? valA | 0x80 : valA;

  const rawB = relation(sc, b, a);
  const isPeaceB = (rawB & 0x80) !== 0;
  const valB = Math.min(
    100,
    (rawB & 0x7f) + Math.max(1, Math.floor(delta / 2)),
  );
  sc.diplomacy[b][a] = isPeaceB ? valB | 0x80 : valB;
}

/** 降低双方友好度 (复刻 KI.EXE 0x30F0) */
export function decreaseRelation(sc, a, b, delta) {
  if (a == null || b == null || a === b || !sc.diplomacy) return;
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  if (!sc.diplomacy[b]) sc.diplomacy[b] = [];

  const rawA = relation(sc, a, b);
  const isPeaceA = (rawA & 0x80) !== 0;
  const valA = Math.max(0, (rawA & 0x7f) - delta);
  sc.diplomacy[a][b] = isPeaceA ? valA | 0x80 : valA;

  const rawB = relation(sc, b, a);
  const isPeaceB = (rawB & 0x80) !== 0;
  const valB = Math.max(0, (rawB & 0x7f) - delta);
  sc.diplomacy[b][a] = isPeaceB ? valB | 0x80 : valB;
}

/** 外交等级 (原版标签表 @KI.EXE VA 0x7844 & 算法 0x7A9A)
 *  交戰/最惡/險惡/普通/良好/親密 (+－－ 无)
 */
export function relationLabel(v) {
  if (v == null || v === 0xff) return "－－";
  if (v < 0x80) return "交戰"; // bit 7 = 0 即交战
  const val = v & 0x7f;
  if (val > 100) return "－－";
  const adj = val === 100 ? 99 : val;
  const tier = Math.floor(adj / 20) + 1; // 1..5
  const names = ["", "最惡", "險惡", "普通", "良好", "親密"];
  return names[tier] ?? "普通";
}

/** 外交标签色 (KI.EXE 0x7844: 交戰=0x0A红, 最惡=0x03深蓝, 險惡/普通/良好=0x00黑, 親密=0x05绿) */
export function relationColor(v) {
  if (v == null || v === 0xff) return "#000000";
  if (v < 0x80) return "#dd0000"; // 交戰：红色 (原版 0x0A)
  const val = v & 0x7f;
  if (val > 100) return "#000000";
  const adj = val === 100 ? 99 : val;
  const tier = Math.floor(adj / 20) + 1;
  if (tier === 1) return "#00008b"; // 最惡：深蓝色
  if (tier === 5) return "#008000"; // 親密：绿色
  return "#000000"; // 險惡/普通/良好：黑色
}

/** 遣使驻在记录衰减 (外交官列显示, 每月调) */
export function tickEnvoys(sc) {
  const es = sc.envoys;
  if (!es) return;
  for (const k of Object.keys(es)) {
    if (--es[k].left <= 0) delete es[k];
  }
}

/**
 * 遣使: 派政治最高的可用使者携金出使目标势力。
 */
export function sendEnvoy(sc, targetIdx) {
  const f = playerFaction(sc);
  if (!f || targetIdx === f.idx) return { err: "無效對象" };
  const target = sc.factions.find((x) => x.idx === targetIdx);
  if (!target || target.n_cities === 0) return { err: "該勢力已滅亡" };
  const envoy = pickEnvoy(sc, f);
  if (!envoy) return { err: "無政治≥13的使者可派" };
  if ((f.gold ?? 0) < GIFT_COST) return { err: "资金不足" };

  f.gold -= GIFT_COST;
  const pol = envoy.ability.politics;
  if (pol < 13)
    return {
      ok: false,
      msg: `${envoy.name}拙於言辭，${target.monarch ?? ""}不以為然。（無效果）`,
    };

  const delta = Math.max(1, Math.floor(pol / 3));
  increaseRelation(sc, f.idx, targetIdx, delta);

  const v = relation(sc, f.idx, targetIdx);
  // 外交官駐在记录 (势力弹窗「外交官」列显示, 6 个月后归国)
  sc.envoys = sc.envoys ?? {};
  sc.envoys[targetIdx] = { name: envoy.name.trim(), left: 6 };
  return {
    ok: true,
    msg: `遣${envoy.name}出使${target.monarch ?? ""}：關係→${relationLabel(v)}`,
  };
}

/**
 * 遷都 — 复刻 0x6909→0x33FD:
 *   城池选择器只列己方城([di+0x16]&0xF 校验) → 与当前主城相同则提示重选
 *   (cmp ax,bx 回环, TALK 0x93) → 确认后改写主城指针 → 0x33EA 战报入队
 */
export function moveCapital(sc, city) {
  const f = playerFaction(sc);
  if (!f) return { err: "無玩家勢力" };
  if (!city || city.faction !== f.idx) return { err: "非己方城池" };
  if (city.idx === f.capital) return { err: "此城已經是主城" };
  const old = sc.cities[f.capital];
  f.capital = city.idx;
  return {
    ok: `遷都：主城自${old?.name ?? "?"}移至${city.name}。`,
  };
}

/** AI 攻击目标过滤: 友好/亲密 (>= 0x80+60 = 0xBC) 势力城池不主动攻击 */
export function isFriendly(sc, a, b) {
  if (a === b) return true;
  const r = relation(sc, a, b);
  if (r < 0x80) return false;
  return (r & 0x7f) >= 60; // 良好 (60+) / 亲密 (80+) 不主动进攻
}

/** 选玩家势力政治最高且≥13的空闲武将任使者(null=无人可派) */
export function pickEnvoy(sc, f) {
  let best = null;
  for (const g of sc.generals) {
    if (g.faction !== f.idx || g.status !== 0 || !g.active) continue;
    if (g.ability.politics < 13) continue;
    if (!best || g.ability.politics > best.ability.politics) best = g;
  }
  return best;
}
