// 外交觐见 — 复刻 KI.EXE 地图菜单(TALK 0x77)三动作 + 0x3830 通用觐见场景
// 逆向依据 (re-notes-kernel.md「★外交/事件/天灾」节):
//   宣戰 0x6405→IVENTGRF图0 / 停戰 0x64F1→图1 / 請援 0x6623→图2
//   信赖分档 0x3C1E: ≥0xE0档1 / ≥0x90档2 / ≥0x20档3 / 否则4 (决定台词与态度)
//   停战成功率 0x36C4/0x3712: 关系值加权; 同盟检查 0x37D8(友好≥0xD8)
import {
	isFriendly,
	relation,
	relationLabel,
	declareWar,
	makeCeasefire,
} from "./diplomacy.js";
import { fmt } from "./talk.js";
import { applyFactionFundsDelta } from "./economy.js";

const NEUTRAL = 0xb7;
const HOSTILE = 0x80; // 惡劣下限
const FRIENDLY = 0xd8;

/** 信赖分档 (KI.EXE 0x3C1E) */
export function trustTier(sc) {
	const t = sc.trust ?? 0;
	if (t >= 0xe0) return 1;
	if (t >= 0x90) return 2;
	if (t >= 0x20) return 3;
	return 4;
}

function clampRel(v) {
	return Math.max(HOSTILE, Math.min(0xff, v));
}

/**
 * 停战成功率 (%) — 近似 0x36C4 加权:
 * 关系越差越难, 使者政治加成, 分档微调 (原版为查表, 系数按语义拟合)
 */
export function ceasefireChance(sc, targetIdx, envoyPol) {
	const me = playerIdx(sc);
	const rel = relation(sc, me, targetIdx);
	const base = 20 + ((rel - HOSTILE) * 45) / (FRIENDLY - HOSTILE);
	const tierBonus = [0, 15, 10, 5, 0][trustTier(sc)];
	return Math.max(10, Math.min(85, Math.round(base + tierBonus + envoyPol)));
}

/** 请援成功率 (%) — 仅同盟/友好势力受理 (0x37D8 同盟检查); 关系+信赖加权 */
export function requestAidChance(sc, targetIdx, envoyPol) {
	const me = playerIdx(sc);
	const rel = relation(sc, me, targetIdx);
	if (!isFriendly(sc, me, targetIdx)) return 0;
	const base = 25 + ((rel - FRIENDLY) * 40) / (0xff - FRIENDLY || 1);
	const tierBonus = [0, 15, 10, 5, 0][trustTier(sc)];
	return Math.max(15, Math.min(80, Math.round(base + tierBonus + envoyPol)));
}

function playerIdx(sc) {
	// 与 commands.playerFaction 一致的玩家势力判定 (剧本头FF→默认0)
	return sc.player_faction ?? 0;
}

/** 随机整数 1..n (原版 rand&0x7F 风格的简化) */
const roll = () => (Math.random() * 100) | 0;

export const ACTIONS = [
	{ id: "war", label: "宣戰", ivent: 0 },
	{ id: "ceasefire", label: "停戰", ivent: 1 },
	{ id: "aid", label: "請援", ivent: 2 },
];

/**
 * ★觐见台词取词实录 (0x3C99: 行=cx+偏移0..2, 偏移随信赖档):
 *   宣战 cx=0x56: 0x54/55 低信赖拒斥 · 0x56-58 分档问候 · 0x59 进言 · 0x5A 拒绝
 *   停战 cx=0x96: 0x94/95 拒斥     · 0x96-98 分档问候 · 0x99 进言 · 0x9A/9B 怒斥
 *   请援 cx=0xD6: 0xD4/D5 拒斥     · 0xD6-D8 分档问候 · 0xD9 进言 · 0xDA/DB 驳斥
 * ★场景实为觐见【己方君主】(玩家=军师进言): 宣战成功后直接置敌对(0x3526),
 *   无对方谈判环节; 0x3CDC 另有玩家君主一行。\3=对象君主名 \4=军师
 */
const SCENE_BASE = { war: 0x56, ceasefire: 0x96, aid: 0xd6 };

/**
 * 构建一次觐见会话 (纯数据, 由 DiploView 渲染).
 * 返回 {ivent, monarch, portrait, lines:[{text}], options:[{label,run}]}
 * run() → {result, trustDelta, lines} ; null option.run = 结束
 * @param {object} talkTable TALK.DAT 字符串表 (talk.json)
 */
export function buildAudience(app, actionId, targetIdx, talkTable) {
	const sc = app.scenario;
	const me = sc.factions[playerIdx(sc)];
	const target = sc.factions[targetIdx];
	const monarch = sc.monarchOf(me); // 觐见对象=己方君主 (非目标势力!)
	const tier = trustTier(sc);
	const base = SCENE_BASE[actionId] ?? 0x56;

	// 台词池: TALK 表 (原版 cx+偏移取词)
	const T = (i) => (talkTable?.strings?.[i] ?? ["…"]).join("");
	const say = (i) =>
		fmt(T(i), {
			3: target.monarch ?? target.name ?? "",
			4: "軍師",
		});

	if (!(actionId in SCENE_BASE)) return null;
	const ctx = { app, sc, me, target, monarch, tier, say, base };
	switch (actionId) {
		case "war":
			return warScene(ctx);
		case "ceasefire":
			return ceasefireScene(ctx);
		case "aid":
			return aidScene(ctx);
	}
}

/** 低信赖档(4)通用拒斥行: base 前两行 0x54/55 型 */
const refuseLine = (monarch, say, base) =>
	`${monarch.name}：「${say(base - 2 + ((Math.random() < 0.5) | 0))}」（信賴不足，進言不被採納）`;

function warScene({ sc, me, target, monarch, tier, say, base }) {
	if (tier >= 4)
		return {
			ivent: 0,
			monarch,
			lines: [refuseLine(monarch, say, base)],
			options: [{ label: "退去" }],
		};
	return {
		ivent: 0,
		monarch,
		lines: [
			`${monarch.name}：「${say(base + Math.min(tier - 1, 2))}」`,
			`軍師：「${say(base + 3)}」`, // 0x59 想請主公答允對\3的進兵
		],
		options: [
			{
				label: `進言：對${target.monarch}宣戰`,
				apply() {
					declareWar(sc, me.idx, target.idx);
					return {
						result: `${me.monarch}允諾，對${target.monarch}宣戰！關係→交戰`,
						trustDelta: 20,
					};
				},
			},
			{ label: "退去" },
		],
	};
}

function ceasefireScene(ctx) {
	const { sc, me, target, monarch, tier, say, base } = ctx;
	const envoyPol = bestEnvoyPol(sc, me);
	const chance = ceasefireChance(sc, target.idx, envoyPol);
	const rel = relation(sc, me.idx, target.idx);
	if (tier >= 4)
		return {
			ivent: 1,
			monarch,
			lines: [refuseLine(monarch, say, base)],
			options: [{ label: "退去" }],
		};
	return {
		ivent: 1,
		monarch,
		lines: [
			`${monarch.name}：「${say(base + Math.min(tier - 1, 2))}」`,
			`軍師：「${say(base + 3)}」（停戰成功率 ${chance}%）`, // 0x99
		],
		options: [
			{
				label: "進言：與罷兵停戰",
				apply() {
					if (roll() < chance) {
						makeCeasefire(sc, me.idx, target.idx);
						return {
							result: `停戰成立！關係→${relationLabel(relation(sc, me.idx, target.idx))}`,
							trustDelta: 10,
						};
					}
					return {
						result: `${monarch.name}：「${say(base + 4 + ((Math.random() < 0.5) | 0))}」交涉失敗。`,
						trustDelta: -20,
					};
				},
			},
			{ label: "退去" },
		],
	};
}

function aidScene(ctx) {
	const { sc, me, target, monarch, tier, say, base } = ctx;
	const envoyPol = bestEnvoyPol(sc, me);
	const chance = requestAidChance(sc, target.idx, envoyPol);
	if (tier >= 4)
		return {
			ivent: 2,
			monarch,
			lines: [refuseLine(monarch, say, base)],
			options: [{ label: "退去" }],
		};
	if (chance === 0)
		return {
			ivent: 2,
			monarch,
			lines: [
				`${monarch.name}：「${say(base + Math.min(tier - 1, 2))}」`,
				`${monarch.name}：「${say(base + 5)}」`, // 0xDB 非同盟驳斥
				`(需關係達${relationLabel(FRIENDLY)}以上方可請援)`,
			],
			options: [{ label: "退去" }],
		};
	const gold = 200 + ((target.gold ?? 400) >> 3);
	const troops = 2000 + ((target.troops ?? 8000) >> 3);
	return {
		ivent: 2,
		monarch,
		lines: [
			`${monarch.name}：「${say(base + Math.min(tier - 1, 2))}」`,
			`軍師：「${say(base + 3)}」`, // 0xD9 同盟進言
			`（成功率 ${chance}% — 可得金${gold}或兵${troops}）`,
		],
		options: [
			{
				label: `進言：向${target.monarch}請求金${gold}`,
				apply() {
					return aidRoll(sc, me, target, monarch, chance, { gold, say, base });
				},
			},
			{
				label: `進言：向${target.monarch}請求兵${troops}`,
				apply() {
					return aidRoll(sc, me, target, monarch, chance, { troops, say, base });
				},
			},
			{ label: "退去" },
		],
	};
}

function aidRoll(sc, me, target, monarch, chance, grant) {
	if (roll() < chance) {
		const cap = sc.city(me.capital);
		if (grant.gold == null) {
			if (cap?.sim) cap.sim.troops += grant.troops;
			else me.troops = (me.troops ?? 0) + grant.troops;
		} else {
			applyFactionFundsDelta(me, grant.gold);
			applyFactionFundsDelta(target, -grant.gold);
		}
		return {
			result: `${monarch.name}踐盟相助！獲得${grant.gold == null ? `兵${grant.troops}` : `金${grant.gold}`}`,
			trustDelta: 3,
		};
	}
	return {
		result: `${monarch.name}：「${grant.say(grant.base + 5)}」請援未成。`,
		trustDelta: -2,
	};
}

/** 使者政治 (无可用使者=12, 视为最低有效档以下) */
function bestEnvoyPol(sc, f) {
	let best = 0;
	for (const g of sc.generals) {
		if (g.faction !== f.idx || g.status !== 0 || !g.active) continue;
		if (g.ability.politics > best) best = g.ability.politics;
	}
	return best || 12;
}
