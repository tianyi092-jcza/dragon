// Strict KI.EXE 32A9 type4 / 32E9 type5 budget consumers and the shared
// 39E8 audience body. Evidence: docs/re-notes-ai-diplomacy.md §37
// (authoritative capstone windows 32A9..33EA, 39E8..3C3D, 7C6E) and
// .agents/skills/re-domestic-diplomacy/SKILL.md §2/§7.
import { originalSubMoney563B } from "./originalnegotiation.js";

const stop = (at, field) => {
 throw new RangeError(
  `Web engineering Uncovered native budget ${field} at ${at}`,
 );
};
const u8 = (value, at, field) => {
 if (!Number.isInteger(value) || value < 0 || value > 0xff) stop(at, field);
 return value;
};
const u16 = (value, at, field) => {
 if (!Number.isInteger(value) || value < 0 || value > 0xffff) stop(at, field);
 return value;
};

/** 39F1..39FA：仅入口建议额 1..499 钳为 500；0 与 >=500 保持原值。 */
export function originalBudgetEntryClamp39F1(amount) {
 const value = u16(amount, "39F1", "suggested");
 if (value !== 0 && value < 0x1f4) return 0x1f4;
 return value;
}

/**
 * 32A9..32E8 type4：AX=arg0*20h+840h 据点记录；[BX+19]=内政官将号，
 * FF 直接 RET（事件仍消费，无消息无写入）。CDE 蜂鸣 + 8810 TALK56 通知
 * 后 2078→39E8→20D6。SI=内政官武将记录(4240h+id*20h)，CX=116h(278)，
 * AX=DX=事件金额字。
 */
export function originalBeginDomesticBudgetEvent32A9(io, event) {
 const type = u8(event?.type, "32A9", "event type");
 if (type !== 4) stop("32A9", `expected type 4, got ${type}`);
 const city = u8(event?.arg0, "32A9", "city index");
 const amount = u16(
  u8(event?.arg1, "32A9", "amount low") |
   (u8(event?.arg2, "32A9", "amount high") << 8),
  "32A9",
  "amount word",
 );
 const governor = u8(io.readCityGovernor(city), "32B6", "city +19");
 if (governor === 0xff)
  return { phase: "return", status: "no-governor", kind: "domestic", city };
 return {
  phase: "audience",
  kind: "domestic",
  city,
  general: governor,
  requestTalkBase: 0x116, // CX=116h：278 个性请求池
  suggested: originalBudgetEntryClamp39F1(amount),
 };
}

/**
 * 32E9..3326 type5：AX=arg0*40h 势力记录；[BX+2A]=驻外外交官将号，FF
 * 直接 RET。CDE + 8810 TALK57 后 2078→39E8→20D6。SI=外交官武将记录，
 * CX=13Fh(319)，AX=DX=事件金额字。
 */
export function originalBeginEnvoyBudgetEvent32E9(io, event) {
 const type = u8(event?.type, "32E9", "event type");
 if (type !== 5) stop("32E9", `expected type 5, got ${type}`);
 const faction = u8(event?.arg0, "32E9", "faction index");
 const amount = u16(
  u8(event?.arg1, "32E9", "amount low") |
   (u8(event?.arg2, "32E9", "amount high") << 8),
  "32E9",
  "amount word",
 );
 const diplomat = u8(io.readFactionDiplomat(faction), "32F4", "faction +2A");
 if (diplomat === 0xff)
  return { phase: "return", status: "no-diplomat", kind: "envoy", faction };
 return {
  phase: "audience",
  kind: "envoy",
  faction,
  general: diplomat,
  requestTalkBase: 0x13f, // CX=13Fh：319 请求池
  suggested: originalBudgetEntryClamp39F1(amount),
 };
}

/**
 * 39E8 对话结果分类（3A5D..3AA6 实锤）。菜单 3B7E(al=3) 返回
 * choice 0 答应 / 1 提示金额 / 2 拒绝；键盘 7C6E（上限 0x7530，默认 0
 * 由 7CA2 xor si,si 实锤）取消 CF=1 回菜单重选。键盘返回额写 [bp+8]：
 * 0 → outcome 2（拒绝）；== 建议额 → 0（全额）；< 建议额 → 1（少给）；
 * > 建议额 → 3（多给）。菜单直接答应 grant=建议额 outcome 0；直接拒绝
 * outcome 2。返回 { outcome, grant }；outcome==2 不进入提交。
 */
export function classifyOriginalBudgetOutcome39E8(choice, entered, suggested) {
 const menu = u8(choice, "3A5D", "menu choice");
 const want = u16(suggested, "3A92", "suggested");
 if (menu === 0) return { outcome: 0, grant: want };
 if (menu === 2) return { outcome: 2, grant: 0 };
 if (menu !== 1) stop("3A5D", `menu choice ${menu}`);
 const grant = u16(entered, "3A88", "entered amount");
 if (grant === 0) return { outcome: 2, grant: 0 }; // 3AA6
 if (grant === want) return { outcome: 0, grant }; // 3A9F
 if (grant < want) return { outcome: 1, grant }; // 3A96 保持 1
 return { outcome: 3, grant }; // 3A98
}

/**
 * 3AD9..3AF5 提交（实锤顺序）：outcome==2 直接跳过；否则先写
 * 武将[+1A]=AH(shl ax,1 后)=floor(grant/128)，再以 SI=cs:[CFD] 玩家势力
 * 调用 563B 一次性扣款（下封 -655000，同 35ED 扣款叶），最后 5E80(al=4)
 * 纯显示门无规则作用。
 * 建议额 0 的 3A31 零请求路径不初始化 [bp+2]（原栈垃圾）；正常域内此时
 * 武将+1A 已为 0 且扣款额为 0，两分支无可见规则差异（推断），Web 取
 * 不提交（由调用方在 suggested==0 时不产生 commit 状态）。
 */
export function originalCommitBudget39E8(io, state) {
 if (state?.phase !== "commit")
  stop("3AD9", `invalid commit phase ${String(state?.phase)}`);
 const outcome = u8(state.outcome, "3AD9", "outcome");
 const general = u8(state.general, "3AE4", "general slot");
 const grant = u16(state.grant, "3ADF", "grant");
 if (outcome === 2) return { phase: "return", status: "refused" };
 if (outcome > 3) stop("3AD9", `outcome ${outcome}`);
 // 3ADF..3AE4：先写预算点（AH = u8(grant*2 >> 8)）。
 io.writeGeneralByte(general, 0x1a, ((grant << 1) >>> 8) & 0xff);
 // 3AE7..3AF0：shr ax,1 恢复 grant；DL=0；SI=cs:[CFD]；563B 扣款。
 const player = io.readPlayerFactionPointer() >>> 6;
 originalSubMoney563B(io, player, grant);
 return { phase: "return", status: "committed", general, grant };
}
