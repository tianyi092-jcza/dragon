// 外交系统 — KI.EXE 外交矩阵与 0x2BD9 战略外交流程
// 逆向依据 (KI.EXE 0x2BD9, 0x2C52, 0x2D58, 0x2EFB, 0x30CB, 0x30D3,
// 0x30F0, 0x3091, 0x3644, 0x3674, 0x3E8E, 0x7A9A, 0x7844):
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
//   3. 宣战与停战:
//      - 宣战 (0x3644): 取双方较小值，清除 bit 7，低 7 位减半。
//      - 停战 (0x3674): 取双方较小值并置位 bit 7。
//   4. 0x30D3 / 0x30F0 只改一个方向；双向同步只由宣战/停战等显式路径完成。
//   5. 新游戏装载及每月月结都调用 0x2BD9；其地理候选、关系恶化与 0x2EFB
//      主动宣战门控不能由静态 SINARIO 外交矩阵替代。

import { playerFaction } from "./commands.js";
import { applyFactionFundsDelta, factionFundsWordQ256 } from "./economy.js";

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

/** 宣告交战 (复刻 KI.EXE 0x3644): 取双方较小 raw，清 bit 7 后减半 */
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

/** 缔结停战 / 恢复和平 (复刻 KI.EXE 0x3674): 取双方较小 raw 并置 bit 7 */
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

/** 单向提升友好度 (KI.EXE 0x30D3)，保留和平/交战 bit。 */
export function increaseRelation(sc, a, b, delta) {
  if (a == null || b == null || a === b || !sc.diplomacy) return;
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  const raw = relation(sc, a, b);
  const state = raw & 0x80;
  const value = Math.min(100, (raw & 0x7f) + Math.max(0, delta | 0));
  sc.diplomacy[a][b] = state | value;
}

/** 单向降低友好度 (KI.EXE 0x30F0)，保留和平/交战 bit。 */
export function decreaseRelation(sc, a, b, delta) {
  if (a == null || b == null || a === b || !sc.diplomacy) return;
  if (!sc.diplomacy[a]) sc.diplomacy[a] = [];
  const raw = relation(sc, a, b);
  const state = raw & 0x80;
  const value = Math.max(0, (raw & 0x7f) - Math.max(0, delta | 0));
  sc.diplomacy[a][b] = state | value;
}

const EMPTY_FACTION = 0x18;

function isActiveFaction(faction) {
  return Boolean(
    faction &&
      faction.idx != null &&
      faction.active !== false &&
      !faction.dead &&
      (faction.n_cities ?? 0) > 0,
  );
}

/**
 * 0x2C52/0x2CDF：按城记录顺序及 raw[0] 低四位连接顺序收集接壤势力。
 * 空城的 0x0600 sentinel 只作为工作表特殊项，不是可宣战势力。
 */
export function buildDiplomacyCandidates(sc, factionIdx) {
  const seen = new Set();
  const candidates = [];
  let touchesEmptyCity = false;
  for (const city of sc.cities ?? []) {
    if (city?.faction !== factionIdx || typeof city.raw !== "string") continue;
    const raw = Uint8Array.from(city.raw.match(/../g) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    );
    if (raw.length < 0x20) continue;
    for (let direction = 0; direction < 4; direction++) {
      if ((raw[0] & (1 << direction)) === 0) continue;
      const neighbor = sc.cities?.[raw[0x1c + direction]];
      const neighborFaction = neighbor?.faction;
      if (neighborFaction == null || neighborFaction === EMPTY_FACTION) {
        touchesEmptyCity = true;
        continue;
      }
      if (neighborFaction === factionIdx || seen.has(neighborFaction)) continue;
      const target = sc.factions?.find((f) => f?.idx === neighborFaction);
      if (!isActiveFaction(target)) continue;
      seen.add(neighborFaction);
      candidates.push({
        factionIdx: neighborFaction,
        raw: relation(sc, factionIdx, neighborFaction),
      });
    }
  }
  // 0x2C8A selection-sort 的首要效果：最差的现有关系成为第一候选；同值保持
  // 0x2CDF 首次收集的城/方向顺序。
  candidates.sort((left, right) => left.raw - right.raw);
  return { candidates, touchesEmptyCity };
}

function updateOrdinaryFactionRelation(sc, factionIdx, candidateIdx) {
  if (candidateIdx == null) return;
  const raw = relation(sc, factionIdx, candidateIdx);
  if (raw >= 0x80) {
    const value = Math.max(raw & 0x7f, 22) - 2;
    sc.diplomacy[factionIdx][candidateIdx] = 0x80 | value;
  } else if (candidateIdx !== sc.player_faction && raw < 50) {
    sc.diplomacy[factionIdx][candidateIdx] = raw + 1;
  }
}

function updatePlayerFactionRelations(sc, candidateIdx, touchesEmptyCity) {
  const playerIdx = sc.player_faction;
  if (candidateIdx != null) {
    decreaseRelation(sc, playerIdx, candidateIdx, 1);
    // 0x2DF3 检查工作项高字节 marker；候选带特殊项时额外 -7。
    if (touchesEmptyCity) decreaseRelation(sc, playerIdx, candidateIdx, 7);
  }
  for (const faction of sc.factions ?? []) {
    if (!isActiveFaction(faction) || faction.idx === playerIdx) continue;
    decreaseRelation(sc, faction.idx, playerIdx, 1);
  }
}

function factionResourceWord(faction) {
  // KI直接比较未对齐signed word[faction+0x21]，等价24位资金算术右移8位。
  return factionFundsWordQ256(faction);
}

/** 0x3091：三类预备兵各除以4，按城数/2000封顶，并受 raw +0x21 word 门控。 */
export function factionStrategicPower(faction) {
  if (!faction) return 0;
  let power =
    ((faction.reserve_cav ?? 0) >> 2) +
    ((faction.reserve_arc ?? 0) >> 2) +
    ((faction.reserve_inf ?? 0) >> 2);
  const cityCap = Math.max(0, (faction.n_cities ?? 0) << 8);
  if (power >= cityCap || power > 2000) power = 2000;
  return factionResourceWord(faction) <= 19 ? 0 : power;
}

/** 0x2EFB：判断第一地理候选是否应排入 type-1 主动宣战事件。 */
export function shouldDeclareStrategicWar(sc, faction, candidateIdx) {
  if (!isActiveFaction(faction) || candidateIdx == null) return false;
  if (candidateIdx === faction.target_faction) return false;
  const target = sc.factions?.find((item) => item?.idx === candidateIdx);
  if (!isActiveFaction(target)) return false;
  const resourceThreshold = Math.min(
    ((faction.n_cities ?? 0) << 4) + 0x40,
    0x061a,
  );
  if (resourceThreshold >= factionResourceWord(faction)) return false;
  const bell = faction.bellicosity ?? 0;
  const relationThreshold = 0x80 | (bell + (bell >> 1) + 0x14);
  if (relation(sc, faction.idx, candidateIdx) > relationThreshold) return false;
  return (
    factionStrategicPower(faction) >=
    factionStrategicPower(target) - (factionStrategicPower(target) >> 2)
  );
}

/**
 * 0x1B29/0x5358 → 0x2BD9：运行一次地理外交更新并生成 type-1 宣战事件。
 * 返回事件而不直接操作 UI；调用方按原版事件调度节奏处理。
 */
export function runStrategicDiplomacy(sc) {
  if (!sc?.diplomacy || sc.player_faction == null) return [];
  const work = new Map();
  for (const faction of sc.factions ?? []) {
    if (!isActiveFaction(faction)) continue;
    work.set(faction.idx, buildDiplomacyCandidates(sc, faction.idx));
  }

  const events = [];
  for (const faction of sc.factions ?? []) {
    if (!isActiveFaction(faction)) continue;
    const item = work.get(faction.idx);
    const candidates = item?.candidates ?? [];
    const candidateIdx = candidates[0]?.factionIdx ?? null;
    if (faction.idx === sc.player_faction) {
      updatePlayerFactionRelations(sc, candidateIdx, item?.touchesEmptyCity);
    } else {
      updateOrdinaryFactionRelation(sc, faction.idx, candidateIdx);
    }

    // 0x2E33：正在进攻第三方的势力若与玩家接壤，而被攻击方与玩家关系
    // 至少0xA3，则由被攻击方向玩家提出协同参战请求。4B参数顺序由
    // 0x2E7B交换后的SI与DX实锤：{player,attacker,requester}。
    const targetIdx = faction.target_faction;
    const playerTouches = candidates.some(
      (candidate) => candidate.factionIdx === sc.player_faction,
    );
    if (
      targetIdx != null &&
      targetIdx !== sc.player_faction &&
      playerTouches &&
      relation(sc, faction.idx, sc.player_faction) >= 0x80 &&
      relation(sc, targetIdx, sc.player_faction) >= 0xa3
    ) {
      events.push({
        type: 2,
        arg0: sc.player_faction,
        arg1: faction.idx,
        arg2: targetIdx,
      });
    }

    // 0x2E89：仅非玩家；从最差关系候选起逐个减去对方战略实力，直到
    // 累计敌力达到当前势力。随后从该位置向后，对除首候选外的连续交战
    // 候选逐一排type3。工作表raw是0x2C52排序时快照，不能读更新后关系。
    if (faction.idx !== sc.player_faction && candidates[0]?.raw < 0x80) {
      let remainingPower = factionStrategicPower(faction);
      let startIndex = -1;
      for (let index = 0; index < Math.min(0x15, candidates.length); index++) {
        const candidate = candidates[index];
        if (candidate.raw >= 0x80) break;
        const other = sc.factions?.find(
          (item) => item?.idx === candidate.factionIdx,
        );
        if (!isActiveFaction(other)) break;
        remainingPower -= factionStrategicPower(other);
        if (remainingPower <= 0) {
          startIndex = index;
          break;
        }
      }
      if (startIndex >= 0) {
        const firstFactionIdx = candidates[0].factionIdx;
        for (
          let index = startIndex;
          index < Math.min(0x15, candidates.length);
          index++
        ) {
          const candidate = candidates[index];
          if (candidate.raw >= 0x80) break;
          if (candidate.factionIdx === firstFactionIdx) continue;
          events.push({
            type: 3,
            arg0: faction.idx,
            arg1: candidate.factionIdx,
            arg2: 0xff,
          });
        }
      }
    }

    if (
      faction.idx !== sc.player_faction &&
      shouldDeclareStrategicWar(sc, faction, candidateIdx)
    ) {
      events.push({ type: 1, aggressor: faction.idx, defender: candidateIdx });
    }
  }
  return events;
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

/** 外交官预算申请额 (0x578F)：和平差距按100，交战差距按125，每点×200金。 */
export function envoyBudgetRequest(sc, targetIdx) {
  const a = relation(sc, sc.player_faction, targetIdx);
  const b = relation(sc, targetIdx, sc.player_faction);
  const raw = Math.min(a, b);
  const ceiling = raw >= 0x80 ? 100 : 125;
  return Math.max(0, ceiling - (raw & 0x7f)) * 200;
}

/**
 * 月结生成外交官预算报告。原版 0x578F 每月为每名活跃外交官排 type5；
 * 事件显示时再由君主决定答应、改额或拒绝。
 */
export function prepareEnvoyBudgetReports(sc) {
  const reports = [];
  for (const [targetKey, envoy] of Object.entries(sc.envoys ?? {})) {
    const targetIdx = Number(targetKey);
    if (!envoy?.name || !Number.isInteger(targetIdx)) continue;
    const target = sc.factions?.find((f) => f?.idx === targetIdx);
    if (!target || target.dead || (target.n_cities ?? 0) <= 0) continue;
    const general =
      (envoy.gen_idx != null && sc.generals?.[envoy.gen_idx]) ||
      sc.generals?.find((g) => g?.name?.trim?.() === envoy.name?.trim?.());
    const budget = envoy.budget ?? general?.assignment_budget ?? 0;
    if (budget > 0) continue;
    const requested = envoyBudgetRequest(sc, targetIdx);
    envoy.requested = requested;
    envoy.reportPending = true;
    reports.push({ targetIdx, requested });
  }
  return reports;
}

/** 外交官任期显示衰减；预算报告系统本身不以该字段决定是否继续驻在。 */
export function tickEnvoys(sc) {
  const es = sc.envoys;
  if (!es) return;
  for (const envoy of Object.values(es)) {
    if (envoy?.left > 0) envoy.left--;
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

  applyFactionFundsDelta(f, -GIFT_COST);
  const pol = envoy.ability.politics;
  if (pol < 13)
    return {
      ok: false,
      msg: `${envoy.name}拙於言辭，${target.monarch ?? ""}不以為然。（無效果）`,
    };

  const delta = Math.max(1, Math.floor(pol / 3));
  // 遣使本身是双边外交动作；底层0x30D3仍保持单向，调用点显式写双方。
  increaseRelation(sc, f.idx, targetIdx, delta);
  increaseRelation(sc, targetIdx, f.idx, Math.max(1, Math.floor(delta / 2)));

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
