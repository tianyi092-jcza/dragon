// Strict KI.EXE negotiation primitives shared by the type2 3220 and type3
// 3262 consumers: 3771 representative selection, 37F5 free-general scan,
// 5609/563B saturating money moves and the 35ED money + mutual-captive
// settlement. Evidence: docs/re-notes-ai-diplomacy.md P18/P22 windows.
import { originalGeneralReturn50D7 } from "./originallegionfate.js";

const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native negotiation ${field} at ${at}`,
  );
};
const u8 = (value, at, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) stop(at, field);
  return value;
};

/**
 * 37F5: AH faction byte scan of general slots 0..126 (+1C faction, +17 must
 * be zero, strictly greater +13 politics wins, ties keep the earlier slot).
 * Zero-politics generals never qualify; an all-empty scan carries CF=1.
 * Returns null on CF=1; callers decide whether that CF is checked.
 */
export function originalSelectFreeGeneral37F5(io, faction) {
  const owner = u8(faction, "37F8", "scan faction");
  let bestPolitics = 0;
  let bestSlot = null;
  for (let slot = 0; slot < 0x7f; slot++) {
    if (u8(io.readGeneralFaction(slot), "3806", "general faction") !== owner)
      continue;
    if (u8(io.readGeneralStatus(slot), "380B", "general status") !== 0)
      continue;
    const politics = u8(io.readGeneralPolitics(slot), "3811", "politics");
    if (politics <= bestPolitics) continue;
    bestPolitics = politics;
    bestSlot = slot;
  }
  // 3820: AND AL,AL; an all-zero scan leaves AL=0 and STC at 382E.
  return bestSlot === null ? null : { slot: bestSlot, politics: bestPolitics };
}

/**
 * 3771: two-representative politics selection for SI=siFaction (receiver
 * side) and DI=diFaction (other side). Returns { failed: true } for the two
 * checked CF=1 exits, otherwise { base } with base = u8(chosen * 2).
 * The second 37F5 failure CF is NOT checked by the original (37B0 reads
 * through AX as a state-segment alias); that input is uncovered, so stop.
 */
export function originalRepresentative3771(io, siFaction, diFaction) {
  const si = u8(siFaction, "3771", "SI faction");
  const di = u8(diFaction, "3771", "DI faction");
  // 3773: BH=[SI+2A]; !=FF reads that general's +13 without any other check.
  const diplomat = u8(io.readFactionDiplomat(si), "3773", "SI diplomat");
  let first;
  if (diplomat === 0xff) {
    // 377B: AX=DI; the first representative comes from the DI side.
    const selected = originalSelectFreeGeneral37F5(io, di);
    if (selected === null) return { failed: true }; // 3780 JB, CF checked
    first = selected.politics;
  } else {
    first = u8(io.readGeneralPolitics(diplomat), "3792", "diplomat politics");
  }
  // 3795: BH=[SI+1] monarch number; 379E reads legion slot monarch first byte.
  const monarch = u8(io.readFactionMonarch(si), "3795", "SI monarch");
  const monarchLegionByte = u8(
    io.readLegionStatusByte(monarch),
    "379E",
    "monarch legion slot first byte",
  );
  let second;
  // 37A4: general monarch record +17 (4240h+monarch*20h+17h).
  if (u8(io.readGeneralStatus(monarch), "37A4", "monarch status") === 0) {
    // 37AB: AX=SI; 37B0 consumes AX without testing the 37F5 carry flag.
    const selected = originalSelectFreeGeneral37F5(io, si);
    if (selected === null)
      stop("37B0", "unchecked second 37F5 failure aliases DS state");
    second = selected.politics;
  } else {
    // 37B4: legion slot first byte < 80h fails with a checked CF=1.
    if (monarchLegionByte < 0x80) return { failed: true };
    second = u8(io.readGeneralPolitics(monarch), "37BC", "monarch politics");
  }
  // 37BF: unsigned q vs p; equal consumes one ECE0 byte, even keeps q.
  let chosen;
  if (second > first) chosen = second;
  else if (second < first) chosen = (16 - first) & 0xff;
  else
    chosen =
      (u8(io.nextRandomByte(), "37C5", "representative RNG") & 1) === 0
        ? second
        : (16 - first) & 0xff;
  return { failed: false, base: (chosen << 1) & 0xff };
}

/** 5609: SI faction money += AX:DL, 24-bit saturated at 655000 (09FE98h). */
export function originalAddMoney5609(io, faction, amount) {
  const money = io.readFactionMoney(u8(faction, "5609", "faction"));
  io.writeFactionMoney(faction, Math.min(money + amount, 655000));
}

/** 563B: SI faction money -= AX:DL, 24-bit saturated at -655000 (F6:0168). */
export function originalSubMoney563B(io, faction, amount) {
  const money = io.readFactionMoney(u8(faction, "563B", "faction"));
  io.writeFactionMoney(faction, Math.max(money - amount, -655000));
}

/**
 * 35ED: AL outcome, DX fee word, SI receives / DI pays. AL=1 moves money
 * first (5609 receiver then 563B payer), then the 3617..362D loop scans
 * general slots 0..126 for word[+1C] matching (orig,current) = (SI,DI) or
 * (DI,SI) pairs and calls 50D7 on each in slot order. 50D7 may stop at the
 * 5101 CDE player boundary AFTER that general's writes; money and earlier
 * generals stay committed, exactly like the original partial prefix.
 * 3630 CALL 5E80 is the 98A6-bit1 display gate, a rule no-op here.
 */
export function originalNegotiationSettlement35ED(
  io,
  siFaction,
  diFaction,
  outcome,
  fee,
) {
  const si = u8(siFaction, "35ED", "SI faction");
  const di = u8(diFaction, "35ED", "DI faction");
  if (u8(outcome, "35F0", "outcome") === 1) {
    originalAddMoney5609(io, si, fee);
    originalSubMoney563B(io, di, fee);
  }
  for (let slot = 0; slot < 0x7f; slot++) {
    const current = u8(io.readGeneralFaction(slot), "361D", "general +1C");
    const origin = u8(io.readGeneralOrigin(slot), "361D", "general +1D");
    if ((origin === si && current === di) || (origin === di && current === si))
      originalGeneralReturn50D7(io, slot);
  }
}
