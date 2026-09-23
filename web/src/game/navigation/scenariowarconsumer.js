import {
  nativeDiplomacyAt,
  writeNativeDiplomacyAt,
} from "../nativediplomacy.js";
import { nativeFactionAt } from "../nativefactions.js";
import {
  originalBeginWarEvent320C,
  originalCommitWarEvent358C,
  originalContinueWarEvent356E,
} from "./originalwarconsumer.js";

const own = (record, field, at) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    throw new RangeError(
      `Web engineering Uncovered native type1 ${field} at ${at}`,
    );
  return record[field];
};
const resourceWord = (money) => {
  if (!Number.isInteger(money) || money < -0x800000 || money > 0x7fffff)
    throw new RangeError("Web engineering Uncovered native type1 money");
  const raw = money < 0 ? money + 0x1000000 : money;
  return (raw >>> 8) & 0xffff;
};

/**
 * 35AB old-target state aliases for T in 0x16..0x23 (22..35). 3091 is pure
 * index arithmetic (T*0x40), so those reads land outside the 22-slot faction
 * table on the original fixed state regions (re-notes §39):
 *   0x580..0x5FF  faction slots 22/23 — all four official chapters all-zero;
 *   0x600..0x83F  the live 24x24 diplomacy matrix bytes;
 *   0x840..0x8FF  city records 0..5; byte +1 is the live owner, every other
 *                 read offset is static chapter bytes via nativeCityRecordRaw.
 * T >= 0x24 never reaches 3091 (35C3 `80 FC 24` / jae writes directly).
 */
const aliasStateByte = (sc, absolute, at) => {
  if (!Number.isInteger(absolute) || absolute < 0x580 || absolute > 0x8ff)
    throw new RangeError(
      `Web engineering Uncovered native type1 alias address at ${at}`,
    );
  if (absolute < 0x600) return 0;
  if (absolute < 0x840) {
    const offset = absolute - 0x600;
    return nativeDiplomacyAt(sc, (offset / 24) >>> 0, offset % 24, at);
  }
  const slot = (absolute - 0x840) >>> 5;
  const offset = (absolute - 0x840) & 0x1f;
  if (offset === 1) {
    const city = sc?.cities?.[slot];
    if (!city || city.idx !== slot)
      throw new RangeError(
        `Web engineering Uncovered native type1 alias city at ${at}`,
      );
    if (city.faction === null) return 0x18;
    if (
      !Number.isInteger(city.faction) ||
      city.faction < 0 ||
      city.faction > 0xff
    )
      throw new RangeError(
        `Web engineering Uncovered native type1 alias city owner at ${at}`,
      );
    return city.faction;
  }
  const records = sc?.nativeCityRecordRaw;
  const hex = Array.isArray(records) ? records[slot] : null;
  if (
    typeof hex !== "string" ||
    !/^[0-9a-f]{64}$/i.test(hex) ||
    (Array.isArray(records) && records.length !== 192)
  )
    throw new RangeError(
      `Web engineering Uncovered native type1 alias city record at ${at}`,
    );
  return Number.parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);
};
const aliasStateWord = (sc, absolute, at) =>
  aliasStateByte(sc, absolute, at) |
  (aliasStateByte(sc, absolute + 1, at) << 8);

function warEventIo(sc) {
  const factionAt = (index, at) => nativeFactionAt(sc, index, at);
  // 3091 alias reads only occur for old targets 22..35 (< 0x24, 35C3 gate).
  const aliased = (index, at) => {
    if (!Number.isInteger(index) || index < 0x16 || index > 0x23)
      throw new RangeError(
        `Web engineering Uncovered native type1 alias target at ${at}`,
      );
    return index * 0x40;
  };
  return {
    readPlayerFactionPointer: () =>
      own(sc, "nativePlayerFactionPointer", "3549/358C"),
    readPlayerFactionByte: () => own(sc, "player_faction", "3558/35AC"),
    readFactionAttr: (index) => own(factionAt(index, "351A"), "attr", "351A"),
    readFactionTarget: (index) => {
      const value = own(
        factionAt(index, "352A/35C0"),
        "target_faction",
        "352A/35C0",
      );
      return value === null ? 0xff : value;
    },
    writeFactionTarget: (index, value) => {
      factionAt(index, "3593/35E8").target_faction =
        value === 0xff ? null : value;
    },
    readFactionReserve: (index, kind) => {
      if (index >= 0x16)
        return aliasStateWord(
          sc,
          aliased(index, "3091") + 4 + kind * 2,
          "3091",
        );
      const fields = ["reserve_cav", "reserve_arc", "reserve_inf"];
      return own(factionAt(index, "3091"), fields[kind], "3091");
    },
    readFactionCityCount: (index) =>
      index >= 0x16
        ? aliasStateByte(sc, aliased(index, "30AF") + 0x23, "30AF")
        : own(factionAt(index, "30AF"), "n_cities", "30AF"),
    readFactionResourceWord: (index) =>
      index >= 0x16
        ? aliasStateWord(sc, aliased(index, "30BF") + 0x21, "30BF")
        : resourceWord(own(factionAt(index, "30BF"), "money", "30BF")),
    readDiplomacy: (from, to) => nativeDiplomacyAt(sc, from, to, "type1"),
    writeDiplomacy: (from, to, value) =>
      writeNativeDiplomacyAt(sc, from, to, value, "type1"),
  };
}

const generalAt = (sc, index, at) => {
  if (!Number.isInteger(index) || index < 0 || index > 0x7f)
    throw new RangeError(
      `Web engineering Uncovered native type1 general ${index} at ${at}`,
    );
  const general = sc?.generals?.[index];
  if (!general || general.idx !== index)
    throw new RangeError(
      `Web engineering Uncovered native type1 general ${index} at ${at}`,
    );
  return general;
};

const monarchName = (sc, faction, at) => {
  const monarch = generalAt(sc, own(faction, "monarch_idx", at), at);
  return monarch.name?.trim?.() || "";
};

/**
 * Attach the display records the two peaceful player messages need. Also
 * used by the type2 325D direct 3526 call, whose war tail can reach the
 * same defender-report/defender-message phases with aggressor=R.
 */
export function describeMessageState(sc, state) {
  if (state.phase === "aggressor-message") {
    const aggressor = nativeFactionAt(sc, state.aggressor, "3575");
    const defender = nativeFactionAt(sc, state.defender, "3570");
    const monarch = generalAt(
      sc,
      own(aggressor, "monarch_idx", "3575"),
      "3575",
    );
    const advisorIndex = own(aggressor, "advisor_idx", "3570");
    const advisorName =
      (advisorIndex === null
        ? null
        : generalAt(sc, advisorIndex, "3570").name?.trim?.()) ||
      sc?.player_advisor?.name?.trim?.() ||
      "";
    return {
      ...state,
      monarch,
      targetName: monarchName(sc, defender, "3570"),
      advisorName,
    };
  }
  if (state.phase === "defender-report" || state.phase === "defender-message") {
    const aggressor = nativeFactionAt(sc, state.aggressor, "3561");
    const monarch = generalAt(
      sc,
      own(aggressor, "monarch_idx", "3575"),
      "3575",
    );
    return { ...state, monarch, aggressorName: monarch.name?.trim?.() || "" };
  }
  return state;
}

export function beginScenarioWarEvent(sc, event) {
  return describeMessageState(
    sc,
    originalBeginWarEvent320C(warEventIo(sc), event),
  );
}

export function continueScenarioWarEvent(sc, state) {
  return describeMessageState(sc, originalContinueWarEvent356E(state));
}

export function commitScenarioWarEvent(sc, state) {
  return originalCommitWarEvent358C(warEventIo(sc), state);
}

/**
 * Synchronous no-message entry: retained for paths that never reach a player
 * TALK boundary. Peaceful player messages must go through begin/continue/
 * commit with real TALK close callbacks.
 */
export function performScenarioWarEvent(sc, event) {
  const state = beginScenarioWarEvent(sc, event);
  if (state.phase === "return") return state;
  if (state.phase !== "commit")
    throw new RangeError(
      `Web engineering Uncovered native type1 TALK return: ${state.phase}`,
    );
  return commitScenarioWarEvent(sc, state);
}
