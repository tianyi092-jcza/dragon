const stop = (at, field) => {
  throw new RangeError(
    `Web engineering Uncovered native capital ${field} at ${at}`,
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

/** 6A3D: fixed 192-city scan, including the original no-candidate 189 result. */
export function originalSelectCapital6A3D(io, faction) {
  const owner = u8(faction, "6A3D", "faction");
  let bestType = 0xff;
  let bestProduction = 0;
  let preferred = false;
  let selected = -1;
  for (let city = 0; city < 192; city++) {
    if (u8(io.readCityOwner(city), "6A50", `city ${city} owner`) !== owner)
      continue;
    const attr = u8(io.readCityAttr(city), "6A55", `city ${city} attr`);
    const type = attr & 0x0f;
    if (bestType < type) continue;
    const production = u16(
      io.readCityProduction(city),
      "6A5F",
      `city ${city} production`,
    );
    if (bestProduction > production) continue;
    if (!preferred) {
      bestType = type;
      bestProduction = production;
      selected = city;
    }
    if ((attr & 0x1f) === 0) {
      preferred = true;
      bestType = type;
      bestProduction = production;
      selected = city;
    }
  }
  // 33FD..3406 does not inspect 6A3D CF. FFFF transforms to AL=BDh.
  return selected < 0 ? 0xbd : selected;
}

/** 4502: exactly slots 0..126 and exactly +20/+14/status writes. */
export function originalRetargetCapitalLegions4502(
  io,
  faction,
  newCapital,
  oldCapital,
) {
  const owner = u8(faction, "4502", "faction");
  const next = u8(newCapital, "4502", "new capital");
  const previous = u8(oldCapital, "4502", "old capital");
  const newAddress = next << 3;
  const oldAddress = previous << 3;
  for (let slot = 0; slot < 127; slot++) {
    if (
      u8(io.readLegionFaction(slot), "451F", `slot ${slot} faction`) !== owner
    )
      continue;
    const status = u8(io.readLegionStatus(slot), "4524", `slot ${slot} status`);
    if (status < 0x80) continue;
    if (
      u8(io.readLegionTargetCity(slot), "4529", `slot ${slot} target city`) !==
      previous
    )
      continue;
    io.writeLegionTargetCity(slot, next);
    if (
      u16(
        io.readLegionRoadAddress(slot),
        "4531",
        `slot ${slot} road address`,
      ) !== newAddress
    )
      continue;
    io.writeLegionRoadAddress(slot, oldAddress);
    io.writeLegionStatus(slot, status | 2);
  }
}

/** 33EA..3484 bounded type-8 consumer up to the two proven TALK returns. */
export function originalCapitalRelocation33EA(io, event) {
  const type = u8(event?.type, "33EA", "event type");
  if (type !== 8) stop("33EA", `expected type 8, got ${type}`);
  const faction = u8(event?.arg0, "33EA", "event faction");
  if (faction === u8(io.readPlayerFactionByte(), "33EA", "CFF"))
    return { status: "ignored-player", faction };
  if (u8(io.readFactionAttr(faction), "33F3", "faction attr") < 0x80)
    return { status: "ignored-inactive", faction };

  const newCapital = originalSelectCapital6A3D(io, faction);
  const oldCapital = u8(io.readFactionCapital(faction), "3408", "old capital");
  io.writeFactionCapital(faction, newCapital);
  if (newCapital === oldCapital)
    return { status: "unchanged", faction, oldCapital, newCapital };

  originalRetargetCapitalLegions4502(io, faction, newCapital, oldCapital);
  const playerPointer = u16(
    io.readPlayerFactionPointer(),
    "341A",
    "CFD pointer",
  );
  // 341A: cmp SI,CS:[CFD] — independent player-pointer word compare (CFF is
  // NOT consulted here). Equal falls into 3421: AL=[SI+3] new capital pushed
  // as the \2 parameter, monarch record = [SI+1]>>3, 8810 with CX=0x1A4
  // (075B expands to TALK[518+talk_idx]), then 3445 CALL 5E60 — the
  // 98A6-bit1 UI-field refresh gate, display-only with no rule writes and no
  // RNG (same proven convention as the 5E80 gate in originalnegotiation.js).
  if (playerPointer === faction * 0x40)
    return {
      status: "player-message",
      faction,
      oldCapital,
      newCapital,
      monarchSelector: 0x01a4,
    };

  const diplomat = u8(io.readFactionDiplomat(faction), "3449", "diplomat");
  return diplomat === 0xff
    ? { status: "relocated", faction, oldCapital, newCapital, diplomat: null }
    : {
        status: "message",
        faction,
        oldCapital,
        newCapital,
        diplomat,
        reportTalkIndex: 57,
        replySelector: 0x01a4,
      };
}

/**
 * 33FD..3484 bounded relocation commit body (C07 proposal tail, P38). Unlike
 * the type-8 event consumer 33EA, the new capital is the explicit caller
 * argument (33FD..3406: AX = 0x840 + city*0x20 record address, transformed to
 * AL = city index), there is no 351A attr gate, no 6A3D selection and no CFF
 * ignored-player early-out — the 6909 proposal gates already validated the
 * choice. The write order is proven: 3408 xchg [SI+3] commits the new capital
 * before the 340B same-value compare, then 4502 legion retarget, then the
 * 341A independent CFD-word player compare (player: 3421 monarch declaration
 * selector 0x1A4 + 3445 5E60 display gate; NPC: 3449 diplomat gate with the
 * same TALK57/0x1A4 message contract as 33EA).
 */
export function originalRelocationCommit33FD(io, faction, newCapital) {
  const owner = u8(faction, "33FD", "faction");
  const next = u8(newCapital, "33FD", "new capital");
  const oldCapital = u8(io.readFactionCapital(owner), "3408", "old capital");
  // 3408: xchg [SI+3],AH — the write happens before the 340B compare.
  io.writeFactionCapital(owner, next);
  if (next === oldCapital)
    return {
      status: "unchanged",
      faction: owner,
      oldCapital,
      newCapital: next,
    };
  originalRetargetCapitalLegions4502(io, owner, next, oldCapital);
  const playerPointer = u16(
    io.readPlayerFactionPointer(),
    "341A",
    "CFD pointer",
  );
  if (playerPointer === owner * 0x40)
    return {
      status: "player-message",
      faction: owner,
      oldCapital,
      newCapital: next,
      monarchSelector: 0x01a4,
    };
  const diplomat = u8(io.readFactionDiplomat(owner), "3449", "diplomat");
  return diplomat === 0xff
    ? {
        status: "relocated",
        faction: owner,
        oldCapital,
        newCapital: next,
        diplomat: null,
      }
    : {
        status: "message",
        faction: owner,
        oldCapital,
        newCapital: next,
        diplomat,
        reportTalkIndex: 57,
        replySelector: 0x01a4,
      };
}
