// 外交使者 — 依据 game-mechanics.md 逆向结论：
//   使者政治 <13 无效(花再多钱关系不动)；≥13 有效；政治15 半年内恶劣→良好
//   友好度矩阵 @状态段0x680，每势力24B；对角FF/未登场0x80/中立0xB7
import { playerFaction } from "./commands.js";

export const GIFT_COST = 200; // 遣使一次花费(金)
const NEUTRAL = 0xb7;
const MIN = 0x80,
  MAX = 0xff;

function clamp(v) {
  return Math.max(MIN, Math.min(MAX, v));
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

export function relation(sc, a, b) {
  return sc.diplomacy?.[a]?.[b] ?? NEUTRAL;
}

/** 是否处于交战状态 (关系 <= 0x80) */
export function isAtWar(sc, a, b) {
  return relation(sc, a, b) <= 0x80;
}

/** 宣告交战 (复刻 KI.EXE 0x3526): 关系双向置底 0x80 并撤回外交官 */
export function declareWar(sc, a, b) {
  if (a == null || b == null || a === b) return;
  if (!sc.diplomacy) return;
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  if (!sc.diplomacy[b]) sc.diplomacy[b] = [];
  sc.diplomacy[a][b] = 0x80;
  sc.diplomacy[b][a] = 0x80;
  if (sc.envoys && sc.envoys[b]) {
    delete sc.envoys[b];
  }
}

/** 外交等级 (原版标签表 @KI.EXE VA 0x7844, 字符串区实测):
 *  交戰/最惡/險惡/普通/良好/親密 (+－－ 无);
 *  颜色字节=表项+6: 交戰=0x0A(红) 最惡=0x03(蓝) 險惡/普通/良好=0x00(默认) 親密=0x05(绿);
 *  宣戰时关系置底 0x80，触底即交戰；其余阈值为观测范围 0x94..0xE4 的近似划分 */
export function relationLabel(v) {
  if (v <= 0x80) return "交戰"; // 触底=已宣戰
  if (v < 0x90) return "最惡";
  if (v < 0xb6) return "險惡"; // 实证: 呂布 0xA6 / 孔融 0x94
  if (v < 0xd0) return "普通"; // 实证: 曹操 0xB6 / 劉闢 0xCC
  if (v < 0xe0) return "良好";
  return "親密"; // 实证: 公孫瓚 0xE4
}

/** 外交标签色 (用于势力列表等亮色/米黄底面板) */
export function relationColor(v) {
  if (v <= 0x80) return "#ff0000"; // 交戰：红色 (原版 0x0A)
  if (v < 0x90) return "#00008b"; // 最惡：深蓝色
  if (v < 0xb6) return "#000000"; // 險惡：黑色
  if (v < 0xd0) return "#000000"; // 普通：黑色
  if (v < 0xe0) return "#000000"; // 良好：黑色
  return "#008000"; // 親密：绿色
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
 * 政治<13 → 无效(原版规则, 金照扣); 有效时友好度 +politics-10 (15→+5/次,
 * 半年6次可从恶劣0x80拉到~0xB7+, 与"15 半年恶劣→良好"量级一致)
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

  sc.diplomacy[f.idx][targetIdx] = clamp(
    relation(sc, f.idx, targetIdx) + (pol - 10),
  );
  // 对方对我的印象同步小幅改善(单向为主)
  sc.diplomacy[targetIdx][f.idx] = clamp(
    relation(sc, targetIdx, f.idx) + Math.ceil((pol - 10) / 2),
  );
  const v = relation(sc, f.idx, targetIdx);
  // 外交官駐在记录 (势力弹窗「外交官」列显示, 6 个月后归国)
  sc.envoys = sc.envoys ?? {};
  sc.envoys[targetIdx] = { name: envoy.name.trim(), left: 6 };
  return {
    ok: true,
    msg: `遣${envoy.name}出使${target.monarch ?? ""}：關係→${relationLabel(v)}(${v})`,
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

/** AI 攻击目标过滤: 友好(≥0xD8)势力城池不主动攻击(同盟默契) */
export function isFriendly(sc, a, b) {
  if (a === b) return true;
  return relation(sc, a, b) >= 0xd8;
}
