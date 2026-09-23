/**
 * 原版五项进言（軍師提案）规则函数（C07）。全部为 KI.EXE capstone
 * 现刷实锤；证据单一维护源见 `.agents/skills/re-war-proposal/SKILL.md` §6/§7。
 * 只做纯函数判定：UI 对白、信赖写入、事件排队由调用方按既有合同执行。
 * 信赖度分级、判定公式、理由位图与提交尾（敌对 645D→3526 宣战、停战
 * 6548→300E 排 [6,T,0,0x14]、协助 66A9→301C 排 [7,R,A,0x14]）均 0 RNG。
 * file offset = VA + 0x200。
 */

function u8(value, what) {
 if (!Number.isInteger(value) || value < 0 || value > 0xff)
  throw new RangeError(`Uncovered proposal input ${what}: ${value}`);
 return value;
}

/** 3C1E：信赖分级 → 所需理由数（trust≥0xE0→1，≥0x90→2，≥0x20→3，否则4）。 */
export function originalProposalRequiredReasons3C1E(trustByte) {
 const trust = u8(trustByte, "3C1E trust");
 if (trust >= 0xe0) return 1;
 if (trust >= 0x90) return 2;
 if (trust >= 0x20) return 3;
 return 4;
}

/**
 * 6A28 实力比较（si=我方、di=对方由 caller 保证）：
 * ax = 我城数 * (我好战度 + 0x14)；cx = 敌城数 * 25。返回 { mine, other }。
 */
export function originalStrengthCompare6A28(mine, other) {
 const myCities = u8(mine.cities, "6A28 my cities");
 const myBell = u8(mine.bellicosity, "6A28 my bellicosity");
 const otherCities = u8(other.cities, "6A28 other cities");
 return { mine: myCities * (myBell + 0x14), other: otherCities * 25 };
}

/**
 * 6475 敌对提案判定。输入：
 * - pendingType1OnTarget：事件环中存在 type1 [1,玩家,目标]（304E 查重，含 delay 门）。
 * - relationByte：matrix[玩家][目标] 原始字节（bit7=交战）。
 * - bellicosity：玩家 +0x28。
 * - targetAttackingFaction：目标 F19（0xFF=无）。
 * - targetMoneyWord：目标 +0x21 资金 word（signed16 语义，负数=疲乏）。
 * 返回 { al, reasons }，reasons=[bit0..bit3]。
 */
export function originalHostileProposalVerdict6475(input) {
 const relation = u8(input.relationByte, "6475 relation");
 const bell = u8(input.bellicosity, "6475 bellicosity");
 if (input.pendingType1OnTarget === true)
  return { al: 1, reasons: [0, 0, 0, 0] };
 if (relation < 0x80) return { al: 3, reasons: [0, 0, 0, 0] }; // 已交战
 const low = relation & 0x7f;
 // 6499..64A3：sub al,0x80 后 cmp (好战*2+0x14)，jae→驳回。
 if (low >= bell * 2 + 0x14) return { al: 0, reasons: [0, 0, 0, 0] };
 const target = input.targetAttackingFaction;
 if (target !== null && target !== 0xff) u8(target, "6475 target F19");
 const reasons = [
  low < bell + 0x0f ? 1 : 0, // bit0：外交惡劣（关系 < 好战+15）
  input.weStronger === true ? 1 : 0, // bit1：我國有利（6A28 我强>敌强）
  target !== null && target !== 0xff && target !== input.playerIndex ? 1 : 0, // bit2：敵侵他國
  input.targetMoneyWord < 0 ? 1 : 0, // bit3：敵疲乏（+0x21 signed < 0）
 ];
 return { al: 2, reasons };
}

/**
 * 6577 停战提案判定。relationByte=matrix[玩家][目标]（≥0x80=和平→al=3）。
 * 交战时：关系低7位 ≥ 好战/2 → al=2 进入理由循环；否则 al=0 直接驳回。
 * reasons：bit0=我弱(6A28 myForce<targetForce)、bit1=存在他国F19==玩家、
 * bit2=目标侵他国(F19!=FF且!=玩家)、bit3=我疲乏(玩家+0x21 signed<0)。
 */
export function originalTruceProposalVerdict6577(input) {
 const relation = u8(input.relationByte, "6577 relation");
 const bell = u8(input.bellicosity, "6577 bellicosity");
 if (relation >= 0x80) return { al: 3, reasons: [0, 0, 0, 0] }; // 和平中驳回
 const low = relation & 0x7f;
 if (low < bell >> 1) return { al: 0, reasons: [0, 0, 0, 0] };
 const target = input.targetAttackingFaction;
 const reasons = [
  input.weWeaker === true ? 1 : 0,
  input.anotherFactionTargetsMe === true ? 1 : 0,
  target !== null && target !== 0xff && target !== input.playerIndex ? 1 : 0,
  input.playerMoneyWord < 0 ? 1 : 0,
 ];
 return { al: 2, reasons };
}

/**
 * 66D9 請求協助判定。[bp]=协助方R，[bp+2]=目标A。
 * R==A→al=4；relation(玩家,R) < ((好战*4+0x1e)|0x80) → al=0；
 * 与A未交战(relation≥0x80)→al=3；A正攻我且我力<A力/2→al=1(紧急采纳)；
 * 否则 al=2，理由位图：bit0=关系(R)低7位≥好战*4+0x3c、bit1=R强于我、
 * bit2=A强于我、bit3=A攻我(A.F19==玩家)。
 */
export function originalAssistanceProposalVerdict66D9(input) {
 if (input.allyIndex === input.targetIndex)
  return { al: 4, reasons: [0, 0, 0, 0] };
 const bell = u8(input.bellicosity, "66D9 bellicosity");
 const relAlly = u8(input.relationToAllyByte, "66D9 relation ally");
 // 66EE..66FA：bh=(好战*4+0x1e)|0x80，cmp al,bh；jb→al=0。
 if (relAlly < (((bell * 4 + 0x1e) & 0x7f) | 0x80))
  return { al: 0, reasons: [0, 0, 0, 0] };
 const relTarget = u8(input.relationToTargetByte, "66D9 relation target");
 if (relTarget >= 0x80) return { al: 3, reasons: [0, 0, 0, 0] }; // 与A未交战
 const targetAttackingMe = input.targetAttackingMe === true;
 // 6716..6727：A攻我且 ax(我力) < cx/2(A力/2) → al=1。
 if (targetAttackingMe && input.myForce < Math.floor(input.targetForce / 2))
  return { al: 1, reasons: [0, 0, 0, 0] };
 const reasons = [
  // bit0：关系(R)≥好战*4+60。6748..6750：bh=((b*4+0x1e)|0x80)+0x1e 整字节回绕后与 bl=raw 比较。
  relAlly >= (((((bell * 4 + 0x1e) & 0x7f) | 0x80) + 0x1e) & 0xff) ? 1 : 0,
  input.allyStrongerThanMe === true ? 1 : 0, // bit1：R强于我（6A28）
  input.targetStrongerThanMe === true ? 1 : 0, // bit2：A强于我（6A28）
  targetAttackingMe ? 1 : 0, // bit3：A攻我
 ];
 return { al: 2, reasons };
}
