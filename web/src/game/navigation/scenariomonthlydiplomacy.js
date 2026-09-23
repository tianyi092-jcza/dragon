import { nativeFactionAt } from "../nativefactions.js";
import {
  nativeDiplomacyAt,
  writeNativeDiplomacyAt,
} from "../nativediplomacy.js";
import { originalMonthlyDiplomacy2BD9 } from "./originalmonthlydiplomacy.js";

const missing = (label) => {
  throw new RangeError(`Web engineering Uncovered monthly diplomacy ${label}`);
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) missing(label);
  return value;
};
const word = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) missing(label);
  return value;
};
const eventBytes = (event, label) => {
  if (event === null) return [0, 0, 0, 0];
  if (!event || typeof event !== "object" || Array.isArray(event))
    missing(label);
  return ["type", "arg0", "arg1", "arg2"].map((field) =>
    byte(own(event, field), `${label}.${field}`),
  );
};

function createScenarioMonthlyDiplomacyIO(sc, rng) {
  const faction = (slot, at) => nativeFactionAt(sc, slot, at);
  const city = (slot) => {
    const cities = own(sc, "cities");
    if (
      !Array.isArray(cities) ||
      cities.length !== 192 ||
      !Object.hasOwn(cities, slot)
    )
      missing(`city ${slot}`);
    const value = cities[slot];
    if (!value || value.idx !== slot) missing(`city ${slot}`);
    return value;
  };
  const cityRaw = (slot) => {
    const encoded = own(city(slot), "raw");
    if (typeof encoded !== "string" || !/^[0-9a-f]{64}$/i.test(encoded))
      missing(`city ${slot} raw`);
    return Uint8Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16),
    );
  };
  const slots = () => {
    const value = own(sc, "strategicEventSlots");
    if (!Array.isArray(value) || value.length !== 256)
      missing("fixed 256-slot event wheel");
    return value;
  };
  const eventAt = (offset) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= 0x400 ||
      offset % 2
    )
      missing(`event word ${offset}`);
    const index = offset >>> 2;
    const values = slots();
    if (!Object.hasOwn(values, index) || values[index] === undefined)
      missing(`event slot ${index}`);
    return { values, index, event: values[index] };
  };
  const storeEventBytes = ({ values, index }, bytes) => {
    values[index] = bytes.every((value) => value === 0)
      ? null
      : { type: bytes[0], arg0: bytes[1], arg1: bytes[2], arg2: bytes[3] };
  };
  return {
    readPlayerFaction() {
      return byte(own(sc, "player_faction"), "CFF player faction");
    },
    readFactionByte(slot, field) {
      if (field === "cityOwner") {
        const owner = own(city(slot), "faction");
        return owner === null ? 0x18 : byte(owner, `city ${slot} owner`);
      }
      if (field === "cityConnectionMask") return cityRaw(slot)[0] & 0x0f;
      if (field.startsWith("cityConnection")) {
        const direction = Number(field.slice("cityConnection".length));
        if (!Number.isInteger(direction) || direction < 0 || direction > 3)
          missing(`city ${slot} ${field}`);
        return cityRaw(slot)[0x1c + direction];
      }
      const record = faction(slot, `2BD9 ${field}`);
      switch (field) {
        case "attr":
          return byte(own(record, "attr"), `faction ${slot} attr`);
        case "targetFaction": {
          const value = own(record, "target_faction");
          return value === null ? 0xff : byte(value, `faction ${slot} target`);
        }
        case "nCities":
          return byte(own(record, "n_cities"), `faction ${slot} n_cities`);
        case "bellicosity":
          return byte(
            own(record, "bellicosity"),
            `faction ${slot} bellicosity`,
          );
        default:
          return missing(`faction byte ${field}`);
      }
    },
    writeFactionByte(slot, field, value) {
      if (field !== "targetFaction") missing(`faction write ${field}`);
      faction(slot, "2BD9 target write").target_faction =
        byte(value, `faction ${slot} target write`) === 0xff ? null : value;
    },
    readFactionWord(slot, field) {
      const record = faction(slot, `3091 ${field}`);
      let source = null;
      if (field === "reserveCav") source = "reserve_cav";
      else if (field === "reserveArc") source = "reserve_arc";
      else if (field === "reserveInf") source = "reserve_inf";
      if (source === null) missing(`faction word ${field}`);
      return word(own(record, source), `faction ${slot} ${source}`);
    },
    readFactionMoneyHighWord(slot) {
      const money = own(faction(slot, "money high word"), "money");
      if (!Number.isInteger(money) || money < -0x800000 || money > 0x7fffff)
        missing(`faction ${slot} signed24 money`);
      const raw = money < 0 ? money + 0x1000000 : money;
      return (raw >>> 8) & 0xffff;
    },
    readRelationByte(actor, target, at) {
      return nativeDiplomacyAt(sc, actor, target, at);
    },
    writeRelationByte(actor, target, value, at) {
      writeNativeDiplomacyAt(sc, actor, target, value, at);
    },
    readNoCandidateRelationAliasByte(actor, at) {
      // 2EFB FFFF候选：DI=0x7FFF；3119 → BX=0x600+24*actor+0xFF。
      // actor 0..13 落在24×24矩阵区（平展行(actor+10)、列15）；
      // actor 14..21 越过0600..083F进入城记录区0840起，走P30静态raw权威。
      faction(actor, at);
      const address = 0x600 + 24 * actor + 0xff;
      if (address <= 0x83f) {
        const flat = address - 0x600;
        return nativeDiplomacyAt(sc, Math.floor(flat / 24), flat % 24, at);
      }
      const records = own(sc, "nativeCityRecordRaw");
      if (!Array.isArray(records) || records.length !== 192)
        missing(`FFFF alias city records at ${at}`);
      const cityOffset = address - 0x840;
      const encoded = records[cityOffset >>> 5];
      if (typeof encoded !== "string" || !/^[0-9a-f]{64}$/i.test(encoded))
        missing(`FFFF alias city record ${cityOffset >>> 5} at ${at}`);
      return Number.parseInt(
        encoded.slice((cityOffset & 0x1f) * 2, (cityOffset & 0x1f) * 2 + 2),
        16,
      );
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return byte(rng.nextByte(), "canonical RNG byte");
    },
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("D20 cursor");
      return cursor * 4;
    },
    writeEventCursorWord(value) {
      value = word(value, "D20 cursor write");
      if (value % 4) missing("unaligned D20 cursor write");
      sc._strategicEventCursor = value >>> 2;
    },
    writeEventDividerByte(value) {
      sc._strategicEventDivider = byte(value, "event divider write");
    },
    readEventTypeByte(offset) {
      return eventBytes(eventAt(offset).event, `event ${offset >>> 2}`)[0];
    },
    readEventWord(offset) {
      const bytes = eventBytes(eventAt(offset).event, `event ${offset >>> 2}`);
      return offset % 4 === 0
        ? bytes[0] | (bytes[1] << 8)
        : bytes[2] | (bytes[3] << 8);
    },
    writeEventWord(offset, value) {
      value = word(value, "event word write");
      const entry = eventAt(offset);
      const bytes = eventBytes(entry.event, `event ${entry.index}`);
      if (offset % 4 === 0) {
        bytes[0] = value & 0xff;
        bytes[1] = value >>> 8;
      } else {
        bytes[2] = value & 0xff;
        bytes[3] = value >>> 8;
      }
      storeEventBytes(entry, bytes);
    },
  };
}

export function performScenarioMonthlyDiplomacy(sc, rng) {
  return originalMonthlyDiplomacy2BD9(
    createScenarioMonthlyDiplomacyIO(sc, rng),
  );
}
