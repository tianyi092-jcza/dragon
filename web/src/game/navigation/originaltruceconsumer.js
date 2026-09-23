// Strict KI.EXE 3262 type3 truce consumer. Evidence:
// docs/re-notes-ai-diplomacy.md P18 (production/consumption order, 36C4 fee,
// 3771 representatives, partial-commit player boundaries).
import {
  originalNegotiationSettlement35ED,
  originalRepresentative3771,
} from "./originalnegotiation.js";

const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native type3 ${field} at ${at}`,
  );
};
const u8 = (value, at, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) stop(at, field);
  return value;
};

/**
 * 36C4 停战结果计算（type3 3262 与 type6 3327 共用）：CL=1；被查的
 * 3771 CF=1 失败；k=2 仅当接收方当前目标为提出方；R=接收方→提出方
 * 原字节，g=max(0,(R&7F)-u8(F28+2))，b=u8(t+u8(30-g)) 带符号负→0，
 * fee=(b>>1)*1000 精确 16 位积；fee==0 把任何拒绝覆盖为 AL=0。
 * 37D8 后 AH 恒 0（3138 尾 CMP AX,AX→CLC）。无任何写入。
 */
export function originalTruceOutcome36C4(io, receiver, proposer) {
  const representative = originalRepresentative3771(io, receiver, proposer);
  if (representative.failed) return { failed: true };
  // 36CE: k=2 only when the receiver currently targets the proposer.
  let outcome = 1;
  if (
    u8(io.readFactionTarget(receiver), "36D4", "receiver target") === proposer
  )
    outcome = 2;
  // 36DB: R is the raw receiver -> proposer relation byte.
  const relation = u8(io.readDiplomacy(receiver, proposer), "36DB", "relation");
  const bellicosity = u8(io.readFactionBellicosity(receiver), "36E0", "F28");
  const excess = (relation & 0x7f) - ((bellicosity + 2) & 0xff);
  const g = Math.max(excess, 0); // 36E6 SUB borrow floors at zero
  // 36EC: b = u8(t + u8(30 - g)); 36F2 is a SIGNED byte gate.
  let b = (representative.base + ((30 - g) & 0xff)) & 0xff;
  if (b & 0x80) b = 0;
  // 36F9..3702: fee = (b >> 1) * 1000 as an exact 16-bit product.
  const fee = (b >>> 1) * 1000;
  // 3704: AL=k, but a zero fee word overrides any refusal to AL=0.
  if (fee === 0) outcome = 0;
  return { failed: false, outcome, fee };
}

/**
 * 3262..3293: packet AX=(proposer<<8)|3, DX=FF00h|receiver. SI=receiver
 * (arg1), DI=proposer (arg0). 36C4 runs the 3771 selection and the fee
 * formula without any write; 3280 routes a receiver-player event into the
 * 38C7 player decision, which stays an uncovered boundary for now.
 */
export function originalBeginTruceEvent3262(io, event) {
  const type = u8(event?.type, "3262", "event type");
  if (type !== 3) stop("3262", `expected type 3, got ${type}`);
  const proposer = u8(event?.arg0, "3262", "proposer");
  const receiver = u8(event?.arg1, "3262", "receiver");

  // 36C4: CL=1; a checked 3771 CF=1 exits the whole event without writes.
  const result = originalTruceOutcome36C4(io, receiver, proposer);
  if (result.failed)
    return {
      phase: "return",
      status: "qualification-failed",
      proposer,
      receiver,
    };
  const { outcome, fee } = result;

  // 3280: SI receiver == CFD player pointer enters 38C7 before any write.
  if (receiver * 0x40 === io.readPlayerFactionPointer())
    return { phase: "player-decision", proposer, receiver, outcome, fee };
  // 3293: AL>=2 refuses without writes.
  if (outcome >= 2)
    return { phase: "return", status: "refused", proposer, receiver };
  return { phase: "commit", proposer, receiver, outcome, fee };
}

/**
 * 3297..32A4 NPC agreement commit, in exact original call order:
 * 35ED (money + mutual captives, may stop at the 5101 player boundary after
 * partial writes), 45F8 target clearing, 4236 city old-owner normalization,
 * 3669 symmetric relation = min(rawAB, rawBA) | 80h. No legion writes and no
 * return-to-capital broadcast exist in this chain.
 */
export function originalCommitTruceEvent3297(io, state) {
  if (state?.phase !== "commit")
    stop("3297", `invalid commit phase ${String(state?.phase)}`);
  const proposer = u8(state.proposer, "3297", "proposer");
  const receiver = u8(state.receiver, "3297", "receiver");
  const outcome = u8(state.outcome, "3297", "outcome");
  if (outcome >= 2) stop("3297", "refused state cannot commit");
  const fee = state.fee;
  if (!Number.isInteger(fee) || fee < 0 || fee > 0xffff) stop("3297", "fee");

  // 35ED: SI=receiver collects, DI=proposer pays; captives both directions.
  originalNegotiationSettlement35ED(io, receiver, proposer, outcome, fee);

  // 45F8 (AL=proposer, AH=receiver): only exact cross targets clear to FF.
  if (
    u8(io.readFactionTarget(proposer), "4601", "proposer target") === receiver
  )
    io.writeFactionTarget(proposer, 0xff);
  if (
    u8(io.readFactionTarget(receiver), "4612", "receiver target") === proposer
  )
    io.writeFactionTarget(receiver, 0xff);

  // 4236: city current and old owner both inside {proposer, receiver}.
  for (let city = 0; city < 0xc0; city++) {
    const current = u8(io.readCityOwner(city), "4244", "city owner");
    if (current !== proposer && current !== receiver) continue;
    const old = u8(io.readCityOldOwner(city), "424E", "city old owner");
    if (old !== proposer && old !== receiver) continue;
    io.writeCityOldOwner(city, current);
  }

  // 3669 (AL=proposer, AH=receiver): neither may be the 18h neutral slot.
  if (proposer !== 0x18 && receiver !== 0x18) {
    const forward = u8(io.readDiplomacy(proposer, receiver), "367A", "forward");
    const reverse = u8(io.readDiplomacy(receiver, proposer), "367E", "reverse");
    const peace = Math.min(forward, reverse) | 0x80;
    io.writeDiplomacy(proposer, receiver, peace);
    io.writeDiplomacy(receiver, proposer, peace);
  }
  return { phase: "return", status: "committed", proposer, receiver };
}
