// Bounded native Scenario adapter, KI fate notes §7. No legacy/raw fallback.
// nativeGeneralCount is the sole native F18; n_generals excludes advisors.
import { nativeFactionAt } from "../nativefactions.js";
import {
  hasNativeDiplomacyMatrix,
  nativeDiplomacyAt,
  writeNativeDiplomacyAt,
} from "../nativediplomacy.js";
import { nativeLegionAt, rebindNativeLegionViews } from "../nativelegions.js";
import { bindLegionSlotCounter } from "../legionphase.js";
import { returnOriginalLegionTroops } from "./originalformation.js";
import {
  OriginalFateBoundaryError,
  originalFate291A,
  originalCapture29C3,
  originalDelayedReturn2A7E,
  originalDisband463E,
  originalErase2BA8,
  originalExtinction4FCE,
  originalExtinctionAfterTalk36,
  originalExtinctionF00Clear,
  originalExtinctionPlayerCheck,
  originalGeneralFate3485,
  originalMonthlyGeneralScan585F,
  commitOriginalRecruitJoinOwnerWrite,
  commitOriginalCaptivePendingFactionWrite,
} from "./originallegionfate.js";

const legionFields = { 0: "status", 1: "faction", 2: "generalIdx" };
const generalFields = {
  0: "attr",
  23: "status",
  24: "appear_months",
  25: "join_faction",
  28: "faction",
  29: "origFaction",
  30: "talk_idx",
  31: "battle_rating",
};
const factionFields = {
  0: "attr",
  1: "monarch_idx",
  3: "capital",
  20: "n_legions",
  24: "nativeGeneralCount",
  25: "target_faction",
  35: "n_cities", // Stored F23, never a live citiesOf count.
  42: "diplomat_idx",
};
function missing(label) {
  throw new OriginalFateBoundaryError("Scenario IO", label);
}
function own(record, field, nullable = false) {
  if (!record || !field || !Object.hasOwn(record, field)) missing(field);
  const value = record[field];
  return nullable && value === null ? 255 : value;
}
function generalAt(sc, slot) {
  const general = sc.generals?.[slot];
  if (!general || general.idx !== slot) missing(`same-slot general ${slot}`);
  return general;
}
function factionAt(sc, owner) {
  try {
    return nativeFactionAt(sc, owner, "fate IO");
  } catch (error) {
    if (error instanceof RangeError) missing(`faction ${owner}`);
    throw error;
  }
}

function cityAt(sc, index, at) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 192 ||
    sc.cities?.[index]?.idx !== index
  )
    missing(`city address ${index} at ${at}`);
  return sc.cities[index];
}
/** Explicit nullable named sentinels encode FF; absent keys remain unknown. */
export function createScenarioLegionFateIO(sc, context, rng) {
  const recordAt = (slot) => nativeLegionAt(sc, slot, "fate IO");
  const movement = () => {
    if (!context?.movement) missing("movement capability");
    return context.movement;
  };
  return {
    readLegionByte(slot, offset) {
      const record = recordAt(slot);
      if (offset === 3) {
        bindLegionSlotCounter(sc, record);
        return record.engagementCountdown;
      }
      return own(record, legionFields[offset]);
    },
    writeLegionByte(slot, offset, value) {
      const record = recordAt(slot);
      if (offset === 3) {
        bindLegionSlotCounter(sc, record);
        record.engagementCountdown = value;
      } else {
        const field = legionFields[offset];
        if (!field) missing(`legion write ${offset}`);
        record[field] = value;
      }
      if (offset === 0) rebindNativeLegionViews(sc);
    },
    readLegionWord(slot, offset) {
      return own(
        recordAt(slot),
        { 26: "occupancyOffset", 28: "occupancyRowParagraph" }[offset],
      );
    },
    readGeneralByte(slot, offset) {
      return own(
        generalAt(sc, slot),
        generalFields[offset],
        offset === 25 || offset === 28 || offset === 29,
      );
    },
    writeGeneralByte(slot, offset, value) {
      const general = generalAt(sc, slot),
        field = generalFields[offset];
      if (!field) missing(`general write ${offset}`);
      general[field] =
        (offset === 25 || offset === 28 || offset === 29) && value === 255
          ? null
          : value;
      // Existing UI projections, never sources for the native byte reads.
      if (offset === 0) {
        general.active = value >= 0x80;
        general.is_monarch = !!(value & 0x40);
      }
      if (offset === 29) general.captive_flag = value;
    },
    writeGeneralWord(slot, offset, value) {
      if (offset !== 28 || value !== 0xffff) missing("general word write");
      const general = generalAt(sc, slot);
      general.faction = null;
      general.origFaction = null;
      general.captive_flag = 255;
    },
    readFactionByte(owner, offset) {
      return own(
        factionAt(sc, owner),
        factionFields[offset],
        offset === 3 || offset === 25 || offset === 42,
      );
    },
    writeFactionByte(owner, offset, value) {
      if (offset !== 0 && offset !== 20 && offset !== 24 && offset !== 25 && offset !== 42)
        missing(`faction write ${offset}`);
      const faction = factionAt(sc, owner);
      if (offset === 25 || offset === 42) {
        // Nullable sentinels: 255 writes back to null, never to a 255 faction.
        if (value === 255) {
          faction[factionFields[offset]] = null;
          return;
        }
        if (!Number.isInteger(value) || value < 0 || value > 23)
          missing(`faction write ${offset}`);
        faction[factionFields[offset]] = value;
        return;
      }
      if (!Number.isInteger(value) || value < 0 || value > 255)
        missing(`faction write ${offset}`);
      faction[factionFields[offset]] = value;
    },
    readOccupancyByte: (row, offset) => movement().readByte(row, offset),
    writeOccupancyByte: (row, offset, value) =>
      movement().writeByte(row, offset, value),
    readCityOwnerByte: (index) => {
      const value = cityAt(sc, index, "4236").faction;
      return value === null ? 0x18 : value;
    },
    readCityLastByte: (index) => cityAt(sc, index, "4236")._strategicLastFaction,
    writeCityLastByte: (index, value) => {
      cityAt(sc, index, "4236")._strategicLastFaction = value;
    },
    readDiplomacyByte: (from, to) => {
      if (!hasNativeDiplomacyMatrix(sc)) missing("diplomacy matrix");
      try {
        return nativeDiplomacyAt(sc, from, to, "3669");
      } catch (error) {
        if (error instanceof RangeError) missing("diplomacy cell");
        throw error;
      }
    },
    writeDiplomacyByte: (from, to, value) => {
      if (!hasNativeDiplomacyMatrix(sc)) missing("diplomacy matrix");
      try {
        writeNativeDiplomacyAt(sc, from, to, value, "3669");
      } catch (error) {
        if (error instanceof RangeError) missing("diplomacy cell");
        throw error;
      }
    },
    readPlayerFaction: () => own(sc, "player_faction"),
    readPlayerFactionPointer: () => own(sc, "nativePlayerFactionPointer"),
    readDisplayFlags: () => own(sc, "nativeFateDisplayFlags"),
    nextRandomByte: () => {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return rng.nextByte();
    },
    returnTroops4717: (slot, owner) =>
      returnOriginalLegionTroops(sc, recordAt(slot), owner),
  };
}

/** Named event wheel is the sole authority. No ensure/padding/legacy conversion.
 * Cursor is an exact slot-unit representation of aligned CS:D20, not a clamp.
 * null knows only type=0; absent bytes/slots stay unknown until actually written.
 */
function createScenarioMonthlyFateIO(sc, rng, queued) {
  const eventAt = (offset) => {
    if (!Number.isInteger(offset) || offset < 0 || offset >= 0x400)
      missing(`event address ${offset}`);
    const slots = own(sc, "strategicEventSlots");
    const index = offset >>> 2;
    if (!Array.isArray(slots) || !Object.hasOwn(slots, index))
      missing(`event slot ${index}`);
    const event = slots[index];
    if (event !== null && (typeof event !== "object" || Array.isArray(event)))
      missing(`event record ${index}`);
    return { slots, index, event };
  };
  const io = {
    ...createScenarioLegionFateIO(sc, null, rng),
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("aligned D20 cursor");
      return cursor * 4;
    },
    readEventTypeByte(offset) {
      if (offset % 4) missing("unaligned event type");
      const { event } = eventAt(offset);
      return event === null ? 0 : own(event, "type");
    },
    writeEventWord(offset, value) {
      const { slots, index, event } = eventAt(offset);
      if (offset % 4 === 0) {
        // First MOV does not read unknown argument bytes in an empty slot.
        const next = { type: value & 255, arg0: value >>> 8 };
        for (const field of ["arg1", "arg2"])
          if (event !== null && Object.hasOwn(event, field))
            next[field] = event[field];
        slots[index] = next;
      } else if (offset % 4 === 2) {
        if (event === null) missing("event first-word prefix");
        slots[index] = { ...event, arg1: value & 255, arg2: value >>> 8 };
        queued.push({ ...slots[index] }); // Web report only, not another rule queue.
      } else missing("unaligned event word");
    },
  };
  return io;
}

/** deferred合同只由显式调用方启用；缺省保持5924/599C fail-closed。 */
function createScenarioMonthlyFateDeferIO(sc, rng, queued) {
  const io = createScenarioMonthlyFateIO(sc, rng, queued);
  io.deferPlayerFateMessage = () => true;
  return io;
}

function runScenarioMonthlyGeneralFates(sc, rng, startSlot, createIo) {
  const queued = [];
  const result = originalMonthlyGeneralScan585F(
    createIo(sc, rng, queued),
    startSlot,
  );
  if (result?.deferred)
    return { deferred: result.deferred, slot: result.slot, queued };
  return queued;
}

export function performScenarioMonthlyGeneralFates(sc, rng, startSlot = 0) {
  return runScenarioMonthlyGeneralFates(
    sc,
    rng,
    startSlot,
    createScenarioMonthlyFateIO,
  );
}

/** 显式deferred变体：玩家消息径挂起而非stop。 */
export function performScenarioMonthlyGeneralFatesDeferred(
  sc,
  rng,
  startSlot = 0,
) {
  return runScenarioMonthlyGeneralFates(
    sc,
    rng,
    startSlot,
    createScenarioMonthlyFateDeferIO,
  );
}

/** 5930：玩家招募消息返回后的owner/F18恢复写。 */
export function commitScenarioRecruitJoinOwnerWrite(sc, slot, owner) {
  commitOriginalRecruitJoinOwnerWrite(
    createScenarioLegionFateIO(sc),
    slot,
    owner,
  );
}

/** 598A：玩家俘虏pending消息返回后的G1C=0x18恢复写。 */
export function commitScenarioCaptivePendingFactionWrite(sc, slot) {
  commitOriginalCaptivePendingFactionWrite(
    createScenarioLegionFateIO(sc),
    slot,
  );
}

/** 3485 consumes the explicit event AH byte, not a legion/L02 or UI active flag. */
export function performScenarioGeneralFateEvent(sc, event) {
  return originalGeneralFate3485(
    createScenarioLegionFateIO(sc),
    own(event, "arg0"),
  );
}

/** 4FCE extinction scan: BYO explicit dead owner and captor bytes, no RNG.
 * Message stops (5074/5101/2A31/2A6A/5042) propagate with prefix kept; the
 * post-TALK36 resume entry below never self-invokes: production fires it
 * through the TALK36 FIFO-close trigger (P54-C09-1, see resumeNativeExtinction
 * in ai.js and the onExtinctionBlock seam in originalcitycapture.js). */
export function performScenarioExtinction4FCE(
  sc,
  deadOwner,
  captor,
  context,
  onDiplomatBlock,
) {
  return originalExtinction4FCE(
    createScenarioLegionFateIO(sc, context),
    deadOwner,
    captor,
    onDiplomatBlock,
  );
}
/** 4FD9..4FDC player gate (P55-C09-2c): commits the F00 clear, then reports
 * whether the extinct faction is the player faction (4FE5→1CB1). Production
 * routes player-dead to the defeat endview instead of the scan; direct
 * callers keep the orchestrator's historic 4FE5 hold. */
export function performScenarioExtinctionPlayerGate(sc, deadOwner, context) {
  const io = createScenarioLegionFateIO(sc, context);
  originalExtinctionF00Clear(io, deadOwner);
  return originalExtinctionPlayerCheck(io, deadOwner);
}

/** 4FCE post-TALK36 resume (504D..5073): F19 sweep then return to 4D1E+3.
 * Same IO contract as the scan entry; production trigger is the TALK36 FIFO
 * close (resumeNativeExtinction in ai.js). Detached callers without a block
 * handler keep the historic 5042 hold. */
export function performScenarioExtinctionAfterTalk36(sc, deadOwner, context) {
  return originalExtinctionAfterTalk36(
    createScenarioLegionFateIO(sc, context),
    deadOwner,
  );
}
// Object identity, not generalIdx/leader or an equal copy, establishes SI.
export function performScenarioLegionFate(
  sc,
  record,
  context,
  entry,
  captor,
  rng,
  blocks,
) {
  if (nativeLegionAt(sc, record.slot, entry) !== record)
    missing("unique SI record");
  const io = createScenarioLegionFateIO(sc, context, rng);
  switch (entry) {
    case "291A":
      return originalFate291A(io, record.slot, captor);
    case "29C3":
      return originalCapture29C3(io, record.slot, captor);
    case "2A7E":
      return originalDelayedReturn2A7E(
        io,
        record.slot,
        blocks?.onPlayerDelayedReturn,
      );
    case "463E":
      return originalDisband463E(io, record.slot);
    case "2BA8":
      return originalErase2BA8(io, record.slot);
    default:
      return missing(`entry ${entry}`);
  }
}

/** Optional explicit inputs; no initializer, counter recomputation or sidecar. */
export function assertNativeFateSnapshotState(sc) {
  const check = (record, field, nullable = false) => {
    if (!record || !Object.hasOwn(record, field)) return;
    const value = record[field];
    if (nullable && value === null) return;
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new TypeError(`Invalid native fate field: ${field}`);
  };
  if (Object.hasOwn(sc, "_strategicEventCursor")) {
    const cursor = sc._strategicEventCursor;
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
      throw new TypeError("Invalid native fate event cursor");
  }
  if (Object.hasOwn(sc, "strategicEventSlots")) {
    const slots = sc.strategicEventSlots;
    if (!Array.isArray(slots) || slots.length > 256)
      throw new TypeError("Invalid native fate event slots");
    for (let index = 0; index < slots.length; index++) {
      const event = slots[index];
      if (
        !Object.hasOwn(slots, index) ||
        event === undefined ||
        (event !== null && (typeof event !== "object" || Array.isArray(event)))
      )
        throw new TypeError("Invalid native fate event record");
      if (event !== null)
        for (const field of ["type", "arg0", "arg1", "arg2"])
          check(event, field);
    }
  }
  if (Object.hasOwn(sc, "nativePlayerFactionPointer")) {
    const pointer = sc.nativePlayerFactionPointer;
    if (!Number.isInteger(pointer) || pointer < 0 || pointer > 65535)
      throw new TypeError(
        "Invalid native fate field: nativePlayerFactionPointer",
      );
  }
  check(sc, "nativeFateDisplayFlags");
  check(sc, "player_faction");
  for (const faction of sc.factions ?? []) {
    for (const field of [
      "nativeGeneralCount",
      "n_cities",
      "attr",
      "monarch_idx",
      "n_legions",
    ])
      check(faction, field);
    check(faction, "capital", true);
    check(faction, "target_faction", true);
    check(faction, "diplomat_idx", true);
  }
  for (const general of sc.generals ?? []) {
    for (const field of [
      "attr",
      "status",
      "appear_months",
      "talk_idx",
      "battle_rating",
    ])
      check(general, field);
    check(general, "join_faction", true);
    check(general, "faction", true);
    check(general, "origFaction", true);
  }
}
