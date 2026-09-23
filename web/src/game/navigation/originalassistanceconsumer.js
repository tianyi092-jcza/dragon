// Strict KI.EXE 3220 type2 cooperation consumer. Evidence:
// docs/re-notes-ai-diplomacy.md P22 (production roles, 3712 fee, payment
// before war attempt) and the 3220..3260 / 3712..3770 original windows.
// Packet AX=(invited<<8)|2, DX=(payer<<8)|attackTarget. SI=invited R,
// DI=payer T, DL=A is the faction R is paid to declare war on.
import {
 originalNegotiationSettlement35ED,
 originalRepresentative3771,
} from "./originalnegotiation.js";
import { originalWarEvent3526 } from "./originalwarconsumer.js";

const stop = (at, field) => {
 throw new RangeError(
  `Web engineering Uncovered native type2 ${field} at ${at}`,
 );
};
const u8 = (value, at, field) => {
 if (!Number.isInteger(value) || value < 0 || value > 0xff) stop(at, field);
 return value;
};

/**
 * 3712 协同结果计算（type2 3220 与 type7 3388 共用）：CL=1；3715 的
 * 3771(SI=R, DI=T) CF=1 资格失败即退。x=rel[R][A]，y=rel[R][T]；
 * y<x → CL=2；e=y>=80h?y&7F:0；阈值 u8(u8(F28<<1)+28h)，e<阈值→2；
 * v=u8(90-e) 带符号负→0、封顶60；fee=(v>>1)*1000 精确 16 位积；
 * fee==0 覆盖为 AL=0。3771 政治相等 RNG 字节仍消费（3748 覆盖不用）。
 * 37D8 后 AH 恒 0。无任何写入。
 */
export function originalAssistanceOutcome3712(io, invited, target, payer) {
 const representative = originalRepresentative3771(io, invited, payer);
 if (representative.failed) return { failed: true };
 // 371C..3728: x = relation[R][A], y = relation[R][T]; y < x sets CL=2.
 const forwardTarget = u8(io.readDiplomacy(invited, target), "371E", "R->A");
 const forwardPayer = u8(io.readDiplomacy(invited, payer), "3725", "R->T");
 let outcome = 1;
 if (forwardPayer < forwardTarget) outcome = 2;
 // 372E: e = y >= 80h ? y & 7Fh : 0.
 const e = forwardPayer >= 0x80 ? forwardPayer & 0x7f : 0;
 // 3736: threshold = u8(u8(F28 << 1) + 28h); e < threshold forces refusal.
 const threshold =
  (((io.readFactionBellicosity(invited) << 1) & 0xff) + 0x28) & 0xff;
 if (e < threshold) outcome = 2;
 // 3744: v = u8(90 - e), signed byte floor 0, unsigned cap 60.
 let v = (90 - e) & 0xff;
 if (v & 0x80) v = 0;
 if (v > 0x3c) v = 0x3c;
 // 3758..3761: fee = (v >> 1) * 1000 as an exact 16-bit product.
 const fee = (v >>> 1) * 1000;
 // 3763: AL=CL, but a zero fee word overrides any refusal to AL=0.
 if (fee === 0) outcome = 0;
 return { failed: false, outcome, fee };
}

/**
 * 3220..3254: three 351A activity gates (R, A, T in packet order), then the
 * 3712 qualification. 3712 consumes the 3771 equal-politics RNG even though
 * the politics value itself is overwritten at 3748 and never used for the
 * fee. An invited-player event (3241 SI==CFD) enters the 38E6 player
 * decision before any write.
 */
export function originalBeginAssistanceEvent3220(io, event) {
 const type = u8(event?.type, "3220", "event type");
 if (type !== 2) stop("3220", `expected type 2, got ${type}`);
 const invited = u8(event?.arg0, "3220", "invited R");
 const target = u8(event?.arg1, "3220", "attack target A");
 const payer = u8(event?.arg2, "3220", "payer T");

 // 3221/322A/3235: unsigned attr < 80h exits before any other read.
 if (u8(io.readFactionAttr(invited), "3221", "invited attr") < 0x80)
  return {
   phase: "return",
   status: "ignored-inactive",
   invited,
   target,
   payer,
  };
 if (u8(io.readFactionAttr(target), "322A", "target attr") < 0x80)
  return {
   phase: "return",
   status: "ignored-inactive",
   invited,
   target,
   payer,
  };
 if (u8(io.readFactionAttr(payer), "3235", "payer attr") < 0x80)
  return {
   phase: "return",
   status: "ignored-inactive",
   invited,
   target,
   payer,
  };

 // 3712: CL=1; 3715 3771 with SI=R, DI=T; a checked CF=1 exits the event.
 const result = originalAssistanceOutcome3712(io, invited, target, payer);
 if (result.failed)
  return {
   phase: "return",
   status: "qualification-failed",
   invited,
   target,
   payer,
  };
 const { outcome, fee } = result;

 // 3241: SI invited == CFD player pointer enters 38E6 before any write.
 if (invited * 0x40 === io.readPlayerFactionPointer())
  return { phase: "player-decision", invited, target, payer, outcome, fee };
 // 3254: AL>=2 refuses without writes.
 if (outcome >= 2)
  return { phase: "return", status: "refused", invited, target, payer };
 return { phase: "settle", invited, target, payer, outcome, fee };
}

/**
 * 3258..325D NPC agreement: 35ED settles money (R collects, T pays) and the
 * R<->T mutual captives first — payment is never rolled back when the war
 * attempt later fails — then the original packet DX is restored and 3526 is
 * CALLED directly with SI=R, DL=A. The returned war-tail state uses the
 * same phases as the type1 consumer (return/commit/defender-report), with
 * aggressor=R and defender=A.
 */
export function originalCommitAssistanceEvent3258(io, state) {
 if (state?.phase !== "settle")
  stop("3258", `invalid commit phase ${String(state?.phase)}`);
 const invited = u8(state.invited, "3258", "invited R");
 const target = u8(state.target, "3258", "attack target A");
 const payer = u8(state.payer, "3258", "payer T");
 const outcome = u8(state.outcome, "3258", "outcome");
 if (outcome >= 2) stop("3258", "refused state cannot commit");
 const fee = state.fee;
 if (!Number.isInteger(fee) || fee < 0 || fee > 0xffff) stop("3258", "fee");

 originalNegotiationSettlement35ED(io, invited, payer, outcome, fee);
 return originalWarEvent3526(io, invited, target);
}
