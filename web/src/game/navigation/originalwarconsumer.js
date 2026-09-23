const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native type1 ${field} at ${at}`,
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

/** 3091 exact strategic power, including unsigned word[F+21] gate. */
export function originalStrategicPower3091(io, faction) {
  const index = u8(faction, "3091", "power faction");
  let power =
    (u16(io.readFactionReserve(index, 0), "3094", "cavalry reserve") >>> 2) +
    (u16(io.readFactionReserve(index, 1), "309D", "archer reserve") >>> 2) +
    (u16(io.readFactionReserve(index, 2), "30A6", "infantry reserve") >>> 2);
  if (power >>> 8 >= u8(io.readFactionCityCount(index), "30AF", "city count"))
    power = 2000;
  if (power > 2000) power = 2000;
  return u16(io.readFactionResourceWord(index), "30BF", "resource word") <= 19
    ? 0
    : power;
}

/**
 * 3526..3558: F19 re-gate plus peaceful player message routing. Shared by
 * the queued type1 handler (320C attr gates fall through here) and by the
 * type2 325D direct CALL, which deliberately skips the 320C/3215 checks.
 * No target or relation writes happen in this phase: both peaceful player
 * paths hold at CDE/CE7→8810 before any commit.
 */
export function originalWarEvent3526(io, aggressor, defender) {
  aggressor = u8(aggressor, "3526", "aggressor");
  defender = u8(defender, "3526", "defender");
  const oldAggressorTarget = u8(
    io.readFactionTarget(aggressor),
    "352A",
    "aggressor target",
  );
  if (oldAggressorTarget < 0x18)
    return { phase: "return", status: "ignored-busy", aggressor, defender };

  if (defender !== 0x18) {
    const relation = u8(
      io.readDiplomacy(aggressor, defender),
      "353F",
      "forward relation",
    );
    if (relation >= 0x80) {
      // 3546: CX=0x1A0; 3549: player aggressor → CDE → 8810 declaration.
      const messagePointer = u16(
        io.readPlayerFactionPointer(),
        "3549",
        "CFD pointer",
      );
      if (messagePointer === aggressor * 0x40)
        return {
          phase: "aggressor-message",
          aggressor,
          defender,
          selector: 0x1a0,
        };
      // 3555: CX=0x19F; 3558: player defender → CE7 → 8810 TALK63 report.
      if (defender === u8(io.readPlayerFactionByte(), "3558", "CFF"))
        return {
          phase: "defender-report",
          aggressor,
          defender,
          talkIndex: 63,
          selector: 0x19f,
        };
    }
  }
  return { phase: "commit", aggressor, defender };
}

/**
 * 320C gates plus 3526..3558 message routing. No target or relation writes
 * happen in this phase: both peaceful player paths hold at CDE/CE7→8810
 * before any commit, matching the original instruction order.
 */
export function originalBeginWarEvent320C(io, event) {
  const type = u8(event?.type, "320C", "event type");
  if (type !== 1) stop("320C", `expected type 1, got ${type}`);
  const aggressor = u8(event?.arg0, "320C", "aggressor");
  const defender = u8(event?.arg1, "3213", "defender");
  if (u8(io.readFactionAttr(aggressor), "320C", "aggressor attr") < 0x80)
    return {
      phase: "return",
      status: "ignored-aggressor",
      aggressor,
      defender,
    };
  if (u8(io.readFactionAttr(defender), "3215", "defender attr") < 0x80)
    return { phase: "return", status: "ignored-defender", aggressor, defender };

  return originalWarEvent3526(io, aggressor, defender);
}

/**
 * 356E..3570: after the TALK63 report truly closes, the same 8810 entry
 * shows the aggressor monarch declaration with selector CX=0x19F.
 */
export function originalContinueWarEvent356E(state) {
  if (state?.phase !== "defender-report")
    stop("356E", "invalid defender-report continuation");
  return {
    phase: "defender-message",
    aggressor: u8(state.aggressor, "356E", "aggressor"),
    defender: u8(state.defender, "356E", "defender"),
    selector: 0x19f,
  };
}

/**
 * 358B→358C..35A3 commit tail. It may only run after every required message
 * has returned; CFD is re-read at 358C and CFF at 35AC, exactly like the
 * original independent reads.
 */
export function originalCommitWarEvent358C(io, state) {
  const phase = state?.phase;
  if (
    phase !== "commit" &&
    phase !== "aggressor-message" &&
    phase !== "defender-message"
  )
    stop("358C", `invalid commit phase ${String(phase)}`);
  const aggressor = u8(state.aggressor, "358C", "aggressor");
  const defender = u8(state.defender, "358C", "defender");

  const commitPointer = u16(
    io.readPlayerFactionPointer(),
    "358C",
    "CFD pointer",
  );
  if (commitPointer !== aggressor * 0x40)
    io.writeFactionTarget(aggressor, defender);

  const playerFaction = u8(io.readPlayerFactionByte(), "35AC", "CFF");
  if (defender !== playerFaction && defender !== 0x18) {
    const oldDefenderTarget = u8(
      io.readFactionTarget(defender),
      "35C0",
      "defender target",
    );
    if (
      oldDefenderTarget >= 0x24 ||
      originalStrategicPower3091(io, oldDefenderTarget) <
        originalStrategicPower3091(io, aggressor)
    )
      io.writeFactionTarget(defender, aggressor);
  }

  if (aggressor !== 0x18 && defender !== 0x18) {
    const forward = u8(
      io.readDiplomacy(aggressor, defender),
      "364A",
      "forward relation",
    );
    const reverse = u8(
      io.readDiplomacy(defender, aggressor),
      "364E",
      "reverse relation",
    );
    const hostile = (Math.min(forward, reverse) & 0x7f) >>> 1;
    io.writeDiplomacy(aggressor, defender, hostile);
    io.writeDiplomacy(defender, aggressor, hostile);
  }
  return { phase: "return", status: "committed", aggressor, defender };
}
