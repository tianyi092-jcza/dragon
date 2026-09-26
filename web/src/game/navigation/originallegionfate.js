// KI 291A..2AF3, 2BA8, 301C, 3485/50D7, 585F/5899/5940 and 7028.
// Evidence: docs/re-notes-legion-fate.md, monthly contracts in §9–10.
// Bounded instruction kernel; Scenario IO/callers: scenariolegionfate.js.
// IO owns explicit bytes, the unique fixed slots and canonical occupancy plane.
// No raw/live-array fallback, inferred F18, synthetic callee RET or rollback.

export class OriginalFateBoundaryError extends RangeError {
  constructor(at, detail) {
    super(`Web engineering Uncovered fate ${detail} at ${at}`);
    this.name = "OriginalFateBoundaryError";
    this.instruction = at;
  }
}
const stop = (at, detail) => {
  throw new OriginalFateBoundaryError(at, detail);
};
function unsigned(value, max, at, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) stop(at, label);
  return value;
}
function call(io, method, args, at) {
  if (typeof io[method] !== "function") stop(at, method);
  return io[method](...args);
}
const byte = (io, method, args, at) =>
  unsigned(call(io, method, args, at), 255, at, method);
const lb = (io, slot, offset, at) =>
  byte(io, "readLegionByte", [slot, offset], at);
const gb = (io, slot, offset, at) =>
  byte(io, "readGeneralByte", [slot, offset], at);
function fb(io, owner, offset, at) {
  unsigned(owner, 23, at, "faction address alias");
  return byte(io, "readFactionByte", [owner, offset], at);
}
const lw = (io, slot, offset, value, at) =>
  call(io, "writeLegionByte", [slot, offset, value], at);
const gw = (io, slot, offset, value, at) =>
  call(io, "writeGeneralByte", [slot, offset, value], at);
const fw = (io, owner, offset, value, at) =>
  call(io, "writeFactionByte", [owner, offset, value], at);
const player = (io, at) => byte(io, "readPlayerFaction", [], at);
function slotIndex(slot, at) {
  return unsigned(slot, 127, at, "fixed-slot address");
}

// The word pair is the existing Web canonical pointer, NOT a DOS segment.
// The IO must reject noncanonical pointers/unknown plane bytes, not derive XY.
function decrementOccupancy(io, slot, pointerAt, at) {
  const offset = unsigned(
    call(io, "readLegionWord", [slot, 0x1a], pointerAt),
    383,
    pointerAt,
    "occupancy offset",
  );
  const row = unsigned(
    call(io, "readLegionWord", [slot, 0x1c], pointerAt),
    24 * 255,
    pointerAt,
    "occupancy row paragraph",
  );
  if (row % 24) stop(pointerAt, "occupancy row alias");
  const value = byte(io, "readOccupancyByte", [row, offset], at);
  call(io, "writeOccupancyByte", [row, offset, (value - 1) & 255], at);
}
function decrementLegions(io, slot) {
  const owner = lb(io, slot, 1, "468A");
  fw(io, owner, 0x14, (fb(io, owner, 0x14, "4693") - 1) & 255, "4693");
}

/** 2AD2: independent old/new FF gates, ordered byte DEC then INC. */
export function originalGeneralCount2AD2(io, oldOwner, newOwner) {
  unsigned(oldOwner, 255, "2AD3", "AH old owner");
  if (oldOwner !== 255)
    fw(io, oldOwner, 0x18, (fb(io, oldOwner, 0x18, "2AE0") - 1) & 255, "2AE0");
  unsigned(newOwner, 255, "2AE3", "AL new owner");
  if (newOwner !== 255)
    fw(io, newOwner, 0x18, (fb(io, newOwner, 0x18, "2AEF") + 1) & 255, "2AEF");
}

/** 50D7: DI is a general pointer; no G00/current-owner/same-owner gate. */
export function originalGeneralReturn50D7(io, slot) {
  slotIndex(slot, "50DC");
  gw(io, slot, 0x17, 0, "50DC");
  const origin = gb(io, slot, 0x1d, "50E0");
  gw(io, slot, 0x1d, 255, "50E0");
  // No FF gate: FF and18 address state aliases outside the supported F table.
  // Stop there AFTER XCHG, never reinterpret either as an inactive faction.
  const owner = fb(io, origin, 0, "50EB") >= 0x80 ? origin : 255;
  gw(io, slot, 0x1c, owner, "50F2");
  // AH is explicitly FF, NOT old G1C: this call only increments the return side.
  originalGeneralCount2AD2(io, 255, owner);
  if (owner === player(io, "50FA")) stop("5101", "CDE/TALK37/199 block");
  return owner === 255 ? "unaffiliated" : "returned";
}

/** 3485: AH event byte -> DI=4240h+AH*20h; RET directly after50D7. */
export function originalGeneralFate3485(io, generalIndex) {
  unsigned(generalIndex, 255, "3485", "AH event general");
  slotIndex(generalIndex, "3490"); // Higher indices address unmodelled state.
  return originalGeneralReturn50D7(io, generalIndex);
}

/** 301C: BL byte delay, D20 word byte-offset; probe precedes the end check.
 * Both ordinary full and inserted exits have CF=0; it is NOT a success flag.
 * The two MOV-word writes are separate committed prefixes.
 */
export function originalDelayedEnqueue301C(io, ax, dx, delay) {
  unsigned(ax, 65535, "3021", "AX event word");
  unsigned(dx, 65535, "3020", "DX event word");
  unsigned(delay, 255, "3023", "BL delay");
  const cursor = unsigned(
    call(io, "readEventCursorWord", [], "3029"),
    65535,
    "3029",
    "D20 cursor word",
  );
  let offset = (cursor + delay * 4) & 65535;
  for (;;) {
    if (byte(io, "readEventTypeByte", [offset], "3033") === 0) {
      call(io, "writeEventWord", [offset, ax], "3038");
      call(io, "writeEventWord", [(offset + 2) & 65535, dx], "303A");
      return { inserted: true, offset, cf: false };
    }
    offset = (offset + 4) & 65535;
    if (offset >= 0x400) return { inserted: false, offset, cf: false };
  }
}

// 5990 only returns without messages when player != the current G1C.
// 玩家径：5999压栈→CDE→8810(cx)→pop si；deferred合同保留mid-state。
function monthlyFateNotice5990(io, slot, talkIndex) {
  const who = player(io, "5990");
  const owner = gb(io, slot, 0x1c, "5994");
  if (who !== owner) return undefined;
  if (typeof io.deferPlayerFateMessage !== "function")
    stop("599C", "CDE/TALK65 or66 block");
  return {
    deferred: {
      at: 0x599c,
      kind: talkIndex === 66 ? "captive-joined" : "captive-pending",
      slot,
      owner,
      talkIndex,
    },
  };
}

/** 5940: one full byte RNG; no join mismatch fallthrough and no CF test. */
export function originalMonthlyCaptive5940(io, slot) {
  slotIndex(slot, "5940");
  const random = byte(io, "nextRandomByte", [], "5941");
  if (random >= 0x40) return "unchanged";
  if (random >= 0x20) {
    const owner = gb(io, slot, 0x1c, "594C");
    if (owner !== gb(io, slot, 0x19, "594F")) return "unchanged";
    gw(io, slot, 0x1d, 255, "5956");
    gw(io, slot, 0x17, 0, "595A");
    originalGeneralCount2AD2(io, 255, owner);
    const joined = monthlyFateNotice5990(io, slot, 66); // CX=0x42→TALK[66]
    if (joined?.deferred) return joined;
    return "joined";
  }
  originalDelayedEnqueue301C(io, (slot << 8) | 9, 0xffff, (random & 15) + 8);
  const notice = monthlyFateNotice5990(io, slot, 65); // CX=0x41→TALK[65]
  if (notice?.deferred) return notice;
  commitOriginalCaptivePendingFactionWrite(io, slot);
  return "pending"; // Also on full queue: 5981 has no CF consumer.
}

/** 598A唯一写者语义：仅在5990返回后把G1C改为0x18。 */
export function commitOriginalCaptivePendingFactionWrite(io, slot) {
  slotIndex(slot, "598A");
  gw(io, slot, 0x1c, 0x18, "598A");
}

const playerPointer = (io, at) =>
  unsigned(
    call(io, "readPlayerFactionPointer", [], at),
    65535,
    at,
    "CS:CFD word",
  );
function factionPointerByte(io, pointer, offset, at) {
  if (pointer % 64) stop(at, "unaligned faction pointer alias");
  return fb(io, pointer / 64, offset, at);
}

/** 5899: preferred G19 or fixed22 minimum-F18 scan, then one full ECE0.
 * CFD is an independent word, NOT CFF*40h. Player CDE precedes owner/count.
 */
export function originalRecruitment5899(io, slot) {
  slotIndex(slot, "589A");
  const preferred = gb(io, slot, 0x19, "589A");
  let target = 0;
  if (preferred === 255) {
    let minimum = 255;
    for (let owner = 0; owner < 22; owner++) {
      if (fb(io, owner, 0, "58CA") < 0x80) continue;
      if (minimum < fb(io, owner, 0x18, "58CF")) continue;
      minimum = fb(io, owner, 0x18, "58D4"); // Original second read; ties go later.
      target = owner * 64;
    }
    let remaining = (byte(io, "nextRandomByte", [], "58E0") & 0x3f) + 1;
    if (remaining >= 0x30) {
      target = playerPointer(io, "5907");
      const threshold =
        (factionPointerByte(io, target, 0x23, "590C") >>> 2) + 1;
      if (threshold <= factionPointerByte(io, target, 0x18, "5915"))
        return "unchanged";
    } else {
      if (remaining >= 0x18) remaining = 1;
      let inactiveProbes = 0;
      for (;;) {
        if (factionPointerByte(io, target, 0, "58F1") >= 0x80) {
          inactiveProbes = 0;
          if (--remaining === 0) break;
        } else if (++inactiveProbes === 22) {
          // Static state: another identical ring cannot decrement AL. This is
          // an engineering nontermination boundary, never an original RET.
          stop("58F1", "all-inactive recruitment ring (no original return)");
        }
        target += 64;
        if (target >= 0x580) target = 0;
      }
    }
  } else {
    if (byte(io, "nextRandomByte", [], "58A2") >= 0x40) return "unchanged";
    gw(io, slot, 0x19, 255, "58A9");
    target = preferred * 64;
    if (factionPointerByte(io, target, 0, "58B3") < 0x80) {
      if (gb(io, slot, 0, "58B8") & 0x20) gw(io, slot, 0, 0, "58BD"); // Whole G00 clear, not just bit20.
      return "unaffiliated";
    }
  }
  if (target === playerPointer(io, "591A")) {
    // 5921玩家消息：CDE+8810(cx=0x29→TALK[41])返回后5930才写owner/2AD2。
    // deferred合同：消息返回前不写owner/F18；G19清与RNG已在前缀提交。
    if (typeof io.deferPlayerFateMessage !== "function")
      stop("5924", "CDE/TALK41 block");
    return {
      deferred: {
        at: 0x5924,
        kind: "recruit-join",
        slot,
        owner: ((target << 2) & 65535) >>> 8,
        talkIndex: 41,
      },
    };
  }
  const owner = ((target << 2) & 65535) >>> 8;
  gw(io, slot, 0x1c, owner, "5934");
  originalGeneralCount2AD2(io, 255, owner);
  return "joined";
}

/** 5930恢复写：G1C=owner→2AD2(AH=FF,AL=owner) INC F18；Web侧幂等门。 */
export function commitOriginalRecruitJoinOwnerWrite(io, slot, owner) {
  slotIndex(slot, "5930");
  unsigned(owner, 255, "5930", "owner byte");
  if (gb(io, slot, 0x1c, "5934") !== 255) stop("5930", "recruit owner rewrite");
  gw(io, slot, 0x1c, owner, "5934");
  originalGeneralCount2AD2(io, 255, owner);
}

/** 585F: fixed127, G00 -> G18 -> G1C -> G1D, no inferred absent records.
 * deferred立即暂停：恢复方从slot+1重入，与LOOP CX/SI语义等价。 */
export function originalMonthlyGeneralScan585F(io, startSlot = 0) {
  unsigned(startSlot, 126, "585F", "scan start slot");
  for (let slot = startSlot; slot < 127; slot++) {
    if (gb(io, slot, 0, "586A") < 0x80) continue;
    const countdown = gb(io, slot, 0x18, "586F");
    if (countdown !== 0) {
      gw(io, slot, 0x18, countdown - 1, "5875");
      continue; // Even 1->0 waits until the next scan.
    }
    if (gb(io, slot, 0x1c, "587A") === 255) {
      const recruited = originalRecruitment5899(io, slot);
      if (recruited?.deferred) return { deferred: recruited.deferred, slot };
      continue;
    }
    if (gb(io, slot, 0x1d, "5885") !== 255) {
      const captive = originalMonthlyCaptive5940(io, slot);
      if (captive?.deferred) return { deferred: captive.deferred, slot };
    }
  }
  return undefined;
}

/** 2BA8: clear bit4 BEFORE reading the explicit 98A6 display gate. */
export function originalErase2BA8(io, slot) {
  slotIndex(slot, "2BA8");
  lw(io, slot, 0, lb(io, slot, 0, "2BA8") & 0xef, "2BA8");
  if (byte(io, "readDisplayFlags", [], "2BAB") & 4)
    stop("2BB3", "display-on 9656/96ED block");
}

/** 2977/29C3玩家去向消息通道（现刷关闭见去向§4）：有handler时把原8810
 * 序列交调用方泵挂起（返回handler裁决），缺失时保持历史stop（裸叶合同）。
 * 所有分支规则前缀皆在消息前提交，关闭后原版直接返回，无尾写。 */
function fateMessageOrStop(onFateMessage, talk, slot, at, detail, fallen) {
  if (typeof onFateMessage === "function") {
    const verdict = onFateMessage({ talk, slot });
    return typeof verdict === "string" ? verdict : fallen;
  }
  stop(at, detail);
}

/** 2977玩家消息（现刷299D..29C2关闭）：299A预置CX=0x1F；玩家==L01走
 * 29AE单8810 CX=0x1F（TALK31），否则玩家==captor则INC CX后单8810
 * CX=0x20（TALK32），都不是则静默。参数push AX=L02|FF00、DI=SP、
 * AL=0x93；无CDE、无第二段。08/30/F14前缀已提交，关闭后直接返回。 */
export function originalReturn2977(io, slot, captor, onFateMessage) {
  slotIndex(slot, "297B");
  decrementOccupancy(io, slot, "2989", "298C");
  lw(io, slot, 0, 8, "2990");
  lw(io, slot, 3, 0x30, "2993");
  decrementLegions(io, slot);
  const who = player(io, "299D");
  if (who === lb(io, slot, 1, "29A1"))
    return fateMessageOrStop(
      onFateMessage,
      31,
      slot,
      "29AE",
      "TALK31 block",
      "returning",
    );
  if (who === unsigned(captor, 255, "29A6", "CS2919"))
    return fateMessageOrStop(
      onFateMessage,
      32,
      slot,
      "29AE",
      "TALK32 block",
      "returning",
    );
  return "returning";
}

/** 29C3: also callable with an inactive same-number slot (e.g. 5030). */
export function originalCapture29C3(io, slot, captor, onFateMessage) {
  slotIndex(slot, "29C8");
  if (lb(io, slot, 0, "29D4") >= 0x80) {
    decrementOccupancy(io, slot, "29DB", "29DE");
    decrementLegions(io, slot);
  }
  originalGeneralCount2AD2(io, gb(io, slot, 0x1c, "29E7"), 255);
  lw(io, slot, 0, 0, "29ED");
  gw(io, slot, 0x17, 4, "29F0");
  unsigned(captor, 255, "29F4", "CS2919");
  const oldOwner = gb(io, slot, 0x1c, "29F8");
  gw(io, slot, 0x1c, captor, "29F8");
  gw(io, slot, 0x1d, oldOwner, "29FB");
  if (fb(io, oldOwner, 0, "2A08") < 0x80 && gb(io, slot, 0, "2A0D") & 0x10) {
    gw(io, slot, 0, 0, "2A57");
    // One original word write, not two independently recoverable byte writes.
    call(io, "writeGeneralWord", [slot, 0x1c, 0xffff], "2A5A");
    // 永久退场TALK67（现刷2A5F..2A78关闭）：玩家==captor才单8810
    // CX=0x43（push BX、DI=SP、AL=0x93；无CDE、无第二段），否则静默。
    // G17保持4，不再写；之后直接返回。
    if (player(io, "2A5F") === captor)
      return fateMessageOrStop(
        onFateMessage,
        67,
        slot,
        "2A6A",
        "TALK67 block",
        "eliminated",
      );
    return "eliminated"; // G17 remains 4.
  }
  if (gb(io, slot, 0, "2A12") & 0x40) {
    gw(io, slot, 0, gb(io, slot, 0, "2A17") & 0xbf, "2A17");
    gw(io, slot, 0x1e, (gb(io, slot, 0x1e, "2A1A") + 3) & 255, "2A1A");
  }
  const who = player(io, "2A20");
  // 被俘消息（去向§4.1字节实锤）：玩家==旧属单8810 CX=0x21（TALK33，
  // 无19Ah，返回后直接退出）；否则玩家==captor才8810 CX=0x22（TALK34）
  // 后接第二段8810 CX=0x19A（AH=G1E、AL=G01）；都不是则静默。
  // 两段皆push BX、DI=SP、首段AL=0x93；全程无CDE。
  if (who === gb(io, slot, 0x1d, "2A24"))
    return fateMessageOrStop(
      onFateMessage,
      33,
      slot,
      "2A31",
      "TALK33 block (no 19A)",
      "captured",
    );
  if (who === captor)
    return fateMessageOrStop(
      onFateMessage,
      34,
      slot,
      "2A31",
      "TALK34 then 19A block",
      "captured",
    );
  return "captured";
}

/** 291A: inactive gate, capital FF priority, L02 monarch gate, then one ECE0. */
export function originalFate291A(io, slot, captor, onFateMessage) {
  slotIndex(slot, "291A");
  if (lb(io, slot, 0, "291A") < 0x80) return "inactive";
  unsigned(captor, 255, "2922", "AL captor");
  originalErase2BA8(io, slot);
  const owner = lb(io, slot, 1, "2929");
  const monarch = fb(io, owner, 1, "2932");
  const capital = fb(io, owner, 3, "2935");
  if (capital === 255)
    return originalCapture29C3(io, slot, captor, onFateMessage);
  if (
    monarch === lb(io, slot, 2, "2949") ||
    captor === lb(io, slot, 1, "2952") ||
    captor === 0x18
  )
    return originalReturn2977(io, slot, captor, onFateMessage);
  const random = byte(io, "nextRandomByte", [], "295B") & 0x7f;
  const threshold = (gb(io, slot, 0x1f, "2960") >>> 1) + 0x28;
  return random <= threshold
    ? originalReturn2977(io, slot, captor, onFateMessage)
    : originalCapture29C3(io, slot, captor, onFateMessage);
}

/** 2A7E: slot argument represents relative SI/40h, not absolute 2240h. */
export function originalDelayedReturn2A7E(io, slot, onPlayerBlock) {
  slotIndex(slot, "2A7E");
  const remaining = (lb(io, slot, 3, "2A7E") - 1) & 255;
  lw(io, slot, 3, remaining, "2A7E");
  if (remaining) return "waiting";
  lw(io, slot, 0, 0, "2A85");
  gw(io, slot, 0x17, 0, "2A8E");
  const owner = lb(io, slot, 1, "2A93");
  if (fb(io, owner, 0, "2A9D") < 0x80) {
    gw(io, slot, 0x1c, 255, "2AA2");
    return "unaffiliated";
  }
  if (player(io, "2AA8") === lb(io, slot, 1, "2AAC")) {
    if (typeof onPlayerBlock === "function")
      return onPlayerBlock(slot, "2AB2");
    stop("2AB2", "CDE/TALK35/198 block");
  }
  return "returned";
}

/** 463E/4651: F14, six pools, status, same-slot G17, occupancy, then HUD gate. */
export function originalDisband463E(io, slot) {
  slotIndex(slot, "4651");
  decrementLegions(io, slot);
  const owner = lb(io, slot, 1, "465B");
  call(io, "returnTroops4717", [slot, owner], "466C");
  lw(io, slot, 0, 0, "466F");
  gw(io, slot, 0x17, 0, "467A");
  decrementOccupancy(io, slot, "467F", "4682");
  // 4641..4650：旧属主与 cs:[CFF] 比较，相等时 AL=8 CALL 5E80 刷新玩家
  // HUD 资金面板（5F7F）。P32 写集审计实锤 5E80 全树零规则写入、零 RNG、
  // 98A6-bit1 门控纯显示（re-notes-strategic-message-abi 审计节），随后
  // 4650 直接 RET——规则路径两侧等价，放行。
  const returnedOwner = lb(io, slot, 1, "4641");
  const hudRefresh = returnedOwner === player(io, "4644");
  void hudRefresh;
  return "disbanded";
}

/** 7028 differs from both 2977 and 29C3: test OLD bit3, not active>=80. */
export function originalRemove7028(io, slot) {
  slotIndex(slot, "7028");
  const status = lb(io, slot, 0, "702D");
  lw(io, slot, 0, 0, "702D");
  if (!(status & 8)) decrementOccupancy(io, slot, "7033", "7036");
}

/** 50B4: scatter an active-legion general with no G1D chain. No TALK path.
 * Slot is the same-number legion slot (SI=DI-4240h, x2, +2240h). */
export function originalGeneralScatter50B4(io, slot) {
  slotIndex(slot, "50B4");
  if (byte(io, "readGeneralByte", [slot, 0x17], "50B5") !== 0) {
    originalErase2BA8(io, slot);
    originalRemove7028(io, slot);
    gw(io, slot, 0x17, 0, "50CD");
  }
  gw(io, slot, 0x1c, 255, "50D1");
  return "scattered";
}

/** 5074: diplomat discharge prefix. The F2A xchg with FF and the G17 clear sit
 * strictly before the first 8810/TALK69 (509E; P55 fresh window confirms no CDE
 * prefix in 5074, unlike 4D86's CE7 beep — the old "509D CDE" label is retired).
 * The 1A7 second segment and everything after stay beyond the message stop.
 * General +1/+1E reads belong to that unreached segment, not to this prefix.
 * With onDiplomatBlock the caller owns the TALK69+1A7 sequence: the handler
 * receives (deadOwner, diplomat, diplomatTail) and the leaf returns
 * "diplomat-suspended"; without it the historic 509E hold stays. */
export function originalExtinctionDiplomat5074(
  io,
  deadOwner,
  onDiplomatBlock,
  diplomatTail,
) {
  unsigned(deadOwner, 23, "5074", "dead owner");
  const diplomat = fb(io, deadOwner, 0x2a, "5074");
  if (diplomat === 255) return "no-diplomat"; // 5078 je 50B3.
  call(io, "writeFactionByte", [deadOwner, 0x2a, 255], "5082");
  slotIndex(diplomat, "508D"); // (idx>>3)+4240h past the generals is unmodelled.
  gw(io, diplomat, 0x17, 0, "5091");
  if (typeof onDiplomatBlock === "function") {
    if (typeof diplomatTail !== "function")
      stop("509E", "diplomat resume tail missing");
    onDiplomatBlock(deadOwner, diplomat, diplomatTail);
    return "diplomat-suspended";
  }
  stop("509E", "8810/TALK69 + 1A7 diplomat message return");
}

/** 4236: 192-city +1A normalize; owner and last both in {dead,captor} becomes
 * last=owner. The D52:0840 stride-20h city identity is closed by the 89F0 8A1E
 * loop using the identical base/stride/count. No messages, no RNG. */
export function originalExtinctionCitySweep4236(io, deadOwner, captor) {
  unsigned(deadOwner, 23, "4236", "AL dead owner");
  unsigned(captor, 255, "4236", "AH captor");
  for (let city = 0; city < 192; city++) {
    const owner = byte(io, "readCityOwnerByte", [city], "4244");
    if (owner !== deadOwner && owner !== captor) continue;
    const last = byte(io, "readCityLastByte", [city], "424E");
    if (last !== deadOwner && last !== captor) continue;
    call(io, "writeCityLastByte", [city, owner], "425B");
  }
  return "normalized";
}

/** 3669: symmetric min-merge of diplomacy cells [A][B]/[B][A] with 80h set.
 * 3697 addressing is row-major over the fixed 24-wide matrix. Either side 0x18
 * returns with no write. Cell bounds belong to the matrix IO, not the kernel. */
export function originalRelationMerge3669(io, sideA, sideB) {
  unsigned(sideA, 255, "3669", "AL side");
  unsigned(sideB, 255, "3669", "AH side");
  if (sideA === 0x18 || sideB === 0x18) return "neutral"; // 366D/3673.
  const forward = byte(io, "readDiplomacyByte", [sideA, sideB], "367A");
  const reverse = byte(io, "readDiplomacyByte", [sideB, sideA], "367E");
  const merged = Math.min(forward, reverse) | 0x80;
  call(io, "writeDiplomacyByte", [sideA, sideB, merged], "368B");
  call(io, "writeDiplomacyByte", [sideB, sideA, merged], "368F");
  return "merged";
}

/** 4FCE F19 sweep (504E..506D): active factions whose target_faction is the
 * dead owner drop it (FF) and merge their row/column with faction 0.
 * Reached in production only through originalExtinctionAfterTalk36 once the
 * TALK36-close trigger fires; standalone-tested as well. */
export function originalExtinctionTargetSweep(io, deadOwner) {
  unsigned(deadOwner, 23, "504E", "CH dead owner");
  for (let owner = 0; owner < 22; owner++) {
    if (byte(io, "readFactionByte", [owner, 0], "5055") < 0x80) continue;
    if (byte(io, "readFactionByte", [owner, 0x19], "505A") !== deadOwner)
      continue;
    call(io, "writeFactionByte", [owner, 0x19, 255], "505F");
    originalRelationMerge3669(io, owner, 0);
  }
  return "swept";
}

/** 4FCE post-TALK36 resume (504D..5073). 504D pop ax balances the 503F push
 * ax around the CDE/8810 message call: no net register or state effect, so no
 * Web operation. 5051 mov ch,al observes that AL still holds the dead index
 * across the message call; the Web threads deadOwner explicitly (the same
 * projection pattern as captor for CS:2919). The 504E..506D loop is inline in
 * 4FCE, not a call, and runs here through originalExtinctionTargetSweep. The
 * 506F..5072 pop di/cx/bx/ax restore the 4FCE prologue pushes and 5073 ret
 * returns to the unique caller 4D1E+3; the Web has no caller registers, so the
 * epilogue is a normal return. No messages, no RNG. Production fires this
 * entry on the TALK36 FIFO close (P54-C09-1); it never self-invokes. */
export function originalExtinctionAfterTalk36(io, deadOwner) {
  unsigned(deadOwner, 23, "504D", "CH dead owner");
  originalExtinctionTargetSweep(io, deadOwner); // 504E..506D inline loop.
  return "returned-to-4D1E"; // 506F..5072 epilogue + 5073 ret to 4D1E+3.
}
/** 4FD9: F00 bit7 clear. Committed before the 4FDC CFD gate on every path,
 * including the player-dead 1CB1 exit (prefix kept, no rollback). Idempotent. */
export function originalExtinctionF00Clear(io, deadOwner) {
  unsigned(deadOwner, 23, "4FD9", "BX dead owner");
  fw(io, deadOwner, 0, fb(io, deadOwner, 0, "4FD9") & 0x7f, "4FD9");
  return "f00-cleared";
}
/** 4FDC: CFD gate. True when deadOwner*64 equals the CS:CFD word, i.e. the
 * extinct faction is the player faction; DOS then takes 4FE5 CALL 1CB1
 * (stack reset + far-call exit, no scan, no 4D2A tail). */
export function originalExtinctionPlayerCheck(io, deadOwner) {
  unsigned(deadOwner, 23, "4FDC", "BX dead owner");
  return (
    deadOwner * 64 === call(io, "readPlayerFactionPointer", [], "4FDC")
  );
}
/** 4FCE post-diplomat rest (4FFD..5042): 4236 city sweep, the fixed 127
 * general dispatch, then the unconditional 5042 CDE/TALK36 block. Runs inline
 * when no diplomat suspends, or on the TALK69+1A7 sequence close via the
 * diplomat tail. Inner message stops (5101/29C3) stay held with prefix kept. */
export function originalExtinctionPostDiplomat(io, deadOwner, captor) {
  originalExtinctionCitySweep4236(io, deadOwner, captor);
  const monarch = fb(io, deadOwner, 1, "5005");
  for (let slot = 0; slot < 127; slot++) {
    if (gb(io, slot, 0, "500A") < 0x80) continue; // Inactive record.
    if (gb(io, slot, 0x1c, "500F") !== deadOwner) continue;
    if (gb(io, slot, 0x1d, "5014") !== 255) {
      originalGeneralReturn50D7(io, slot); // Has an origin chain.
      continue;
    }
    if (slot !== monarch && gb(io, slot, 0x17, "5023") !== 0) {
      originalGeneralScatter50B4(io, slot);
      continue;
    }
    originalCapture29C3(io, slot, captor); // 502E: BX=DI general pointer.
  }
  stop("5042", "CDE/TALK36 extinction block");
}
/** 4FCE extinction scan. BX is the dead faction record (idx*40h), SI the city,
 * AL the captor; CS:2919 has no stored Web byte — threading captor through the
 * 4236/29C3 call sites is the exact projection of the stash and its re-read.
 * The 4FD9 F00 clear precedes the CFD gate; the player-dead 1CB1 exit, every
 * message block stay stopped with prefix kept; the post-TALK36 F19 sweep runs
 * only via originalExtinctionAfterTalk36 on the TALK36 FIFO-close trigger.
 * 4FE8 D2A dec is the live-count consequence of the F00 clear: no stored D2A
 * byte (P36), pinned by the live-count invariant test, not by a counter.
 * With onDiplomatBlock the 5074 TALK69+1A7 sequence suspends (P55-C09-2b):
 * the handler owns the sequence close and the diplomat tail
 * (originalExtinctionPostDiplomat); the scan returns "diplomat-suspended".
 * Without it the historic 509E hold stays. */
export function originalExtinction4FCE(io, deadOwner, captor, onDiplomatBlock) {
  unsigned(deadOwner, 23, "4FCE", "BX dead owner");
  unsigned(captor, 255, "4FCE", "AL captor");
  originalExtinctionF00Clear(io, deadOwner);
  if (originalExtinctionPlayerCheck(io, deadOwner))
    stop("4FE5", "1CB1 nonlocal player-extinction exit");
  const rest = () => originalExtinctionPostDiplomat(io, deadOwner, captor);
  const diplomat = originalExtinctionDiplomat5074(
    io,
    deadOwner,
    onDiplomatBlock,
    rest,
  );
  if (diplomat === "diplomat-suspended") return diplomat;
  return rest();
}
