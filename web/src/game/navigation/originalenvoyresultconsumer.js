// Strict KI.EXE 3327 type6 / 3388 type7 player-envoy result consumers.
// Evidence: docs/re-notes-ai-diplomacy.md §37 (authoritative capstone
// windows 3327..33EA, 351A helper) plus the §35 36C4/3712/35ED/3297/3258
// contracts this file reuses through extracted shared outcomes.
import { originalNegotiationSettlement35ED } from "./originalnegotiation.js";
import { originalTruceOutcome36C4 } from "./originaltruceconsumer.js";
import {
  originalAssistanceOutcome3712,
  originalCommitAssistanceEvent3258,
} from "./originalassistanceconsumer.js";

const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native envoy result ${field} at ${at}`,
  );
};
const u8 = (value, at, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) stop(at, field);
  return value;
};

/**
 * 351A（实锤字节 32c0 d1e8 d1e8 8bf0 803c80 c3）：AX=AH<<6=势力索引*40h
 * → SI=势力记录；CF = ([SI] < 80h) = 势力非活动。消费两道门的调用者在
 * CF=1 时直接 RET：事件消费但不产生任何消息或写入。
 */
function factionGate351A(io, index, at) {
  return u8(io.readFactionAttr(index), at, "faction attr") < 0x80;
}

/**
 * 3327..3344 type6 入口门（顺序实锤）：351A(arg0=目标势力) → CF 返回；
 * [SI+2A] 外交官将号 ==FF 返回；否则 CDE 蜂鸣 + 8810 TALK57 使者回京
 * 通知（DI=栈上 [外交官|FF00h, 势力指针]，AL=93h 显示模式）。
 * 条目不保存姓名/结果/赔款，出队时重读仍在任的外交官。
 */
export function originalBeginTruceEnvoyResult3327(io, event) {
  const type = u8(event?.type, "3327", "event type");
  if (type !== 6) stop("3327", `expected type 6, got ${type}`);
  const target = u8(event?.arg0, "3327", "target faction");
  if (factionGate351A(io, target, "3327"))
    return { phase: "return", status: "ignored-inactive", target };
  const diplomat = u8(io.readFactionDiplomat(target), "332C", "target +2A");
  if (diplomat === 0xff)
    return { phase: "return", status: "no-diplomat", target };
  return { phase: "report", kind: "truce", target, diplomat };
}

/**
 * 3346..336D：TALK57 真实关闭后才执行。DI=cs:[CFD] 玩家势力指针；
 * 36C4(SI=目标=接收方, DI=玩家=提出方)。CF=1（3771 代表资格失败，
 * 实锤语义「敌方君主不在」）→ 8810 TALK58（CX=3Ah，AL=[外交官+1]
 * 君主号字节）后返回，无写入。否则 3C3D(CX=2Bh, AL) 通知
 * TALK[43+min(AL,2)]；AL>=2 拒绝返回。3771 政治相等 RNG 在此点消费。
 */
export function originalTruceEnvoyOutcome3346(io, state) {
  const target = u8(state?.target, "3346", "target faction");
  // 3346: DI=cs:[CFD]；与 CFF 字节独立读取，不互推。
  const proposer = io.readPlayerFactionPointer() >>> 6;
  const result = originalTruceOutcome36C4(io, target, proposer);
  if (result.failed)
    return {
      phase: "report-failed",
      kind: "truce",
      target,
      proposer,
      diplomat: u8(state?.diplomat, "3350", "diplomat"),
      talkIndex: 0x3a, // TALK58「敵方的君主已不在了。」
    };
  return {
    phase: "notify",
    kind: "truce",
    target,
    proposer,
    diplomat: u8(state?.diplomat, "3367", "diplomat"),
    outcome: result.outcome,
    fee: result.fee,
    notifyTalkBase: 0x2b, // 3C3D CX=2Bh → TALK[43..45]
  };
}

/**
 * 3371..3384 提交（TALK[43+min(AL,2)] 关闭后，AL<2）：
 * 35ED（SI=目标收款、DI=玩家付款，互俘双向，玩家恢复将命中 5101
 * 中段停止合同）→ 45F8（AX 由 3374..337E 构造：AH=目标（SI*4 高字节）、
 * AL=cs:[CFF] 字节——与 3297 的包内提出方不同来源，独立读取）→
 * 4236 城旧主归一 → 3669 双向停战（双方 !=18h 时 min(raw)|80h）。
 */
export function originalCommitTruceEnvoyResult3371(io, state) {
  if (state?.phase !== "commit")
    stop("3371", `invalid commit phase ${String(state?.phase)}`);
  const target = u8(state.target, "3371", "target faction");
  const proposer = u8(state.proposer, "3371", "proposer (CFD)");
  const outcome = u8(state.outcome, "3371", "outcome");
  if (outcome >= 2) stop("3371", "refused state cannot commit");
  const fee = state.fee;
  if (!Number.isInteger(fee) || fee < 0 || fee > 0xffff) stop("3371", "fee");

  // 3371: 35ED——SI=目标收款，DI=玩家(CFD)付款；俘囚目标↔玩家。
  originalNegotiationSettlement35ED(io, target, proposer, outcome, fee);

  // 3374..337E: AX=(SI*4 & FF00h)|cs:[CFF]；AL=玩家势力索引字节。
  const cff = u8(io.readPlayerFaction(), "337A", "CFF player byte");
  // 45F8 (AL=玩家, AH=目标)：仅精确交叉目标清 FF。
  if (u8(io.readFactionTarget(cff), "4601", "player target") === target)
    io.writeFactionTarget(cff, 0xff);
  if (u8(io.readFactionTarget(target), "4612", "target target") === cff)
    io.writeFactionTarget(target, 0xff);

  // 4236: city current and old owner both inside {玩家, 目标}。
  for (let city = 0; city < 0xc0; city++) {
    const current = u8(io.readCityOwner(city), "4244", "city owner");
    if (current !== cff && current !== target) continue;
    const old = u8(io.readCityOldOwner(city), "424E", "city old owner");
    if (old !== cff && old !== target) continue;
    io.writeCityOldOwner(city, current);
  }

  // 3669 (AL=玩家, AH=目标)：双方 !=18h 时双向写 min(raw)|80h。
  if (cff !== 0x18 && target !== 0x18) {
    const forward = u8(io.readDiplomacy(cff, target), "367A", "forward");
    const reverse = u8(io.readDiplomacy(target, cff), "367E", "reverse");
    const peace = Math.min(forward, reverse) | 0x80;
    io.writeDiplomacy(cff, target, peace);
    io.writeDiplomacy(target, cff, peace);
  }
  return { phase: "return", status: "committed", target, proposer: cff };
}

/**
 * 3388..33B0 type7 入口门（顺序实锤）：351A(arg0=协助势力) → CF 返回；
 * BX=SI 保存协助方；AH=DL(arg1=目标) 再 351A → CF 返回；xchg 后
 * SI=协助方、BX=目标；[SI+2A] 协助方外交官 ==FF 返回；否则 CDE +
 * 8810 TALK57 通知。
 */
export function originalBeginAssistanceEnvoyResult3388(io, event) {
  const type = u8(event?.type, "3388", "event type");
  if (type !== 7) stop("3388", `expected type 7, got ${type}`);
  const ally = u8(event?.arg0, "3388", "ally faction");
  const target = u8(event?.arg1, "3388", "target faction");
  if (factionGate351A(io, ally, "3388"))
    return { phase: "return", status: "ignored-inactive", ally, target };
  if (factionGate351A(io, target, "3391"))
    return { phase: "return", status: "ignored-inactive", ally, target };
  const diplomat = u8(io.readFactionDiplomat(ally), "3398", "ally +2A");
  if (diplomat === 0xff)
    return { phase: "return", status: "no-diplomat", ally, target };
  return { phase: "report", kind: "assistance", ally, target, diplomat };
}

/**
 * 33B2..33D9：TALK57 关闭后 DI=cs:[CFD]；3712(SI=协助=R, BX=目标=A,
 * DI=玩家=T)。CF=1 → 8810 TALK58 后返回。否则 3C3D(CX=2Fh, AL) 通知
 * TALK[47+min(AL,2)]；AL>=2 拒绝返回。
 */
export function originalAssistanceEnvoyOutcome33B2(io, state) {
  const ally = u8(state?.ally, "33B2", "ally faction");
  const target = u8(state?.target, "33B2", "target faction");
  const payer = io.readPlayerFactionPointer() >>> 6;
  const result = originalAssistanceOutcome3712(io, ally, target, payer);
  if (result.failed)
    return {
      phase: "report-failed",
      kind: "assistance",
      ally,
      target,
      payer,
      diplomat: u8(state?.diplomat, "33BC", "diplomat"),
      talkIndex: 0x3a,
    };
  return {
    phase: "notify",
    kind: "assistance",
    ally,
    target,
    payer,
    diplomat: u8(state?.diplomat, "33D3", "diplomat"),
    outcome: result.outcome,
    fee: result.fee,
    notifyTalkBase: 0x2f, // 3C3D CX=2Fh → TALK[47..49]
  };
}

/**
 * 33DD..33E6 提交（TALK[47+min(AL,2)] 关闭后，AL<2）：35ED（SI=协助方
 * 收款、DI=玩家付款）→ BX=目标 shl×2 取 DL=目标索引 → 直接 CALL 3526
 * （SI=协助方, DL=目标）。与 3258 同一调用形状，直接复用其提交。
 */
export function originalCommitAssistanceEnvoyResult33DD(io, state) {
  if (state?.phase !== "commit")
    stop("33DD", `invalid commit phase ${String(state?.phase)}`);
  return originalCommitAssistanceEvent3258(io, {
    phase: "settle",
    invited: u8(state.ally, "33DD", "ally R"),
    target: u8(state.target, "33E4", "target A"),
    payer: u8(state.payer, "33DD", "payer T"),
    outcome: state.outcome,
    fee: state.fee,
  });
}
