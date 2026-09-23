import { nativeFactionAt } from "../nativefactions.js";
import {
  nativeDiplomacyAt,
  writeNativeDiplomacyAt,
} from "../nativediplomacy.js";
import { originalFactionTick3E14 } from "./originalfactiontick.js";

const missing = (field) => {
  throw new RangeError(
    `Web engineering Uncovered native faction tick ${field}`,
  );
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const integer = (value, min, max, field) => {
  if (!Number.isInteger(value) || value < min || value > max) missing(field);
  return value;
};
const byte = (value, field) => integer(value, 0, 255, field);
const word = (value, field) => integer(value, 0, 65535, field);

export function performScenarioFactionTick(sc, rng = null) {
  const faction = (slot, at) => nativeFactionAt(sc, slot, at);
  const general = (slot, field) => {
    const record = sc.generals?.[slot];
    if (!record || record.idx !== slot) missing(`${field} general ${slot}`);
    return record;
  };
  return originalFactionTick3E14({
    readFactionCursor() {
      return integer(own(sc, "_factionTickCursor"), 0, 21, "D1C cursor");
    },
    writeFactionCursor(value) {
      sc._factionTickCursor = integer(value, 0, 21, "D1C cursor write");
    },
    readFactionByte(slot, field) {
      const record = faction(slot, field);
      if (field === "target_faction" || field === "diplomat_idx")
        return record[field] === null ? 0xff : byte(own(record, field), field);
      return byte(own(record, field), field);
    },
    writeFactionByte(slot, field, value) {
      const record = faction(slot, field);
      value = byte(value, `${field} write`);
      if (field === "target_faction")
        record[field] = value === 0xff ? null : value;
      else if (field === "attr") {
        record.attr = value;
        record.active = value >= 0x80;
      } else missing(`${field} write`);
    },
    readFactionWord(slot, field) {
      return word(own(faction(slot, field), field), field);
    },
    readFactionMoneyQ256Signed(slot) {
      const money = integer(
        own(faction(slot, "money"), "money"),
        -0x800000,
        0x7fffff,
        "money",
      );
      return money >> 8;
    },
    readFactionExpense24(slot) {
      return integer(
        own(faction(slot, "monthly_reserve_upkeep"), "monthly_reserve_upkeep"),
        0,
        0xffffff,
        "monthly_reserve_upkeep",
      );
    },
    writeFactionExpense24(slot, value) {
      faction(slot, "monthly_reserve_upkeep").monthly_reserve_upkeep = integer(
        value,
        0,
        0xffffff,
        "monthly_reserve_upkeep write",
      );
    },
    readGeneralByte(slot, field) {
      const record = general(slot, field);
      if (field === "politics") return byte(own(record.ability, field), field);
      if (field === "assignment_budget") return byte(own(record, field), field);
      return missing(field);
    },
    writeGeneralByte(slot, field, value) {
      if (field !== "assignment_budget") return missing(`${field} write`);
      general(slot, field).assignment_budget = byte(value, `${field} write`);
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return rng.nextByte();
    },
    readPlayerFactionSlot() {
      const pointer = integer(
        own(sc, "nativePlayerFactionPointer"),
        0,
        0xffff,
        "CFD player faction pointer",
      );
      if (pointer % 0x40 !== 0 || pointer / 0x40 > 21)
        missing("CFD player faction pointer");
      return pointer / 0x40;
    },
    readDiplomacyByte(from, to) {
      return nativeDiplomacyAt(sc, from, to, "3E8E diplomacy read");
    },
    writeDiplomacyByte(from, to, value) {
      writeNativeDiplomacyAt(
        sc,
        from,
        to,
        byte(value, "diplomacy write"),
        "3E8E diplomacy write",
      );
    },
  });
}
