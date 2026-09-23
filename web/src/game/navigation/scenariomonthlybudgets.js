import { nativeFactionAt } from "../nativefactions.js";
import { nativeDiplomacyAt } from "../nativediplomacy.js";
import {
  originalDeficitTrust57FE,
  originalMonthlyDomesticBudgets5715,
  originalMonthlyEnvoyBudgets578F,
} from "./originalmonthlybudgets.js";

const missing = (label) => {
  throw new RangeError(`Web engineering Uncovered monthly budget ${label}`);
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

function createScenarioMonthlyBudgetIO(sc, rng) {
  const cityAt = (slot) => {
    const cities = own(sc, "cities");
    if (
      !Array.isArray(cities) ||
      cities.length !== 192 ||
      !Object.hasOwn(cities, slot)
    )
      missing(`city ${slot}`);
    const city = cities[slot];
    if (!city || city.idx !== slot) missing(`city ${slot}`);
    return city;
  };
  const generalAt = (slot) => {
    const generals = own(sc, "generals");
    if (!Array.isArray(generals) || !Object.hasOwn(generals, slot))
      missing(`general ${slot}`);
    const general = generals[slot];
    if (!general || general.idx !== slot) missing(`general ${slot}`);
    return general;
  };
  const factionAtPointer = (pointer, label) => {
    pointer = word(pointer, `${label} pointer`);
    if (pointer % 0x40 || pointer >= 22 * 0x40)
      missing(`${label} non-aligned faction pointer ${pointer}`);
    return nativeFactionAt(sc, pointer >>> 6, label);
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
      offset >= 0x100 ||
      offset % 2
    )
      missing(`current-page event word ${offset}`);
    const index = offset >>> 2;
    const values = slots();
    if (!Object.hasOwn(values, index) || values[index] === undefined)
      missing(`event slot ${index}`);
    return { values, index, event: values[index] };
  };
  return {
    readPlayerFactionByte() {
      return byte(own(sc, "player_faction"), "CFF player faction");
    },
    readPlayerFactionPointerWord() {
      return word(
        own(sc, "nativePlayerFactionPointer"),
        "CFD player faction pointer",
      );
    },
    readCityByte(slot, field) {
      const city = cityAt(slot);
      switch (field) {
        case "owner": {
          const value = own(city, "faction");
          return value === null ? 0x18 : byte(value, `city ${slot} owner`);
        }
        case "governor": {
          const value = own(city, "governor");
          return value === null ? 0xff : byte(value, `city ${slot} governor`);
        }
        case "growth":
          return byte(own(city, "growth"), `city ${slot} growth`);
        case "defence":
          return byte(own(city, "defence"), `city ${slot} defence`);
        case "troopCap":
          return byte(own(city, "troops_cap"), `city ${slot} troop cap`);
        case "troops":
          return byte(own(city, "troops"), `city ${slot} troops`);
        default:
          return missing(`city ${field}`);
      }
    },
    readFactionDiplomatByte(slot) {
      const value = own(nativeFactionAt(sc, slot, "578F"), "diplomat_idx");
      return value === null ? 0xff : byte(value, `faction ${slot} diplomat`);
    },
    readFactionPointerMoneyHighWord(pointer) {
      const money = own(factionAtPointer(pointer, "57FE money"), "money");
      if (!Number.isInteger(money) || money < -0x800000 || money > 0x7fffff)
        missing("57FE signed24 money");
      const raw = money < 0 ? money + 0x1000000 : money;
      return (raw >>> 8) & 0xffff;
    },
    readFactionPointerBellicosityByte(pointer) {
      return byte(
        own(factionAtPointer(pointer, "57FE bellicosity"), "bellicosity"),
        "57FE bellicosity",
      );
    },
    readGeneralBudgetByte(slot) {
      return byte(
        own(generalAt(slot), "assignment_budget"),
        `general ${slot} assignment budget`,
      );
    },
    readRelationPointerByte(siPointer, diPointer, at) {
      siPointer = word(siPointer, "relation SI pointer");
      diPointer = word(diPointer, "relation DI pointer");
      const quarter = siPointer >>> 2;
      const rowOffset = (quarter + (quarter >>> 1)) & 0xffff;
      const shifted = (diPointer << 2) & 0xffff;
      const column = shifted >>> 8;
      const offset = rowOffset + column;
      if (offset >= 24 * 24) missing(`relation pointer alias ${offset}`);
      return nativeDiplomacyAt(sc, Math.floor(offset / 24), offset % 24, at);
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
    readEventTypeByte(offset) {
      return eventBytes(eventAt(offset).event, `event ${offset >>> 2}`)[0];
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
      entry.values[entry.index] = bytes.every((item) => item === 0)
        ? null
        : { type: bytes[0], arg0: bytes[1], arg1: bytes[2], arg2: bytes[3] };
    },
  };
}

export function performScenarioMonthlyDomesticBudgets(sc, rng) {
  return originalMonthlyDomesticBudgets5715(
    createScenarioMonthlyBudgetIO(sc, rng),
  );
}

export function performScenarioMonthlyEnvoyBudgets(sc, rng) {
  return originalMonthlyEnvoyBudgets578F(
    createScenarioMonthlyBudgetIO(sc, rng),
  );
}

export function performScenarioMonthlyBudgetProducers(sc, rng) {
  const io = createScenarioMonthlyBudgetIO(sc, rng);
  return {
    domestic: originalMonthlyDomesticBudgets5715(io),
    envoy: originalMonthlyEnvoyBudgets578F(io),
  };
}

export function performScenarioDeficitTrustEvent(sc, rng) {
  return originalDeficitTrust57FE(createScenarioMonthlyBudgetIO(sc, rng));
}
