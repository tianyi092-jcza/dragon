import { nativeFactionAt } from "../nativefactions.js";
import { nativeLegionAt } from "../nativelegions.js";
import {
  originalCapitalRelocation33EA,
  originalRelocationCommit33FD,
} from "./originalcapitalrelocation.js";

const own = (record, field, at) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    throw new RangeError(
      `Web engineering Uncovered native capital ${field} at ${at}`,
    );
  return record[field];
};
const byte = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new RangeError(`Web engineering Uncovered native capital ${field}`);
  return value;
};

const nativeCapitalIo = (sc) => {
  const cityAt = (index, at) => {
    const city = sc?.cities?.[index];
    if (!city || city.idx !== index)
      throw new RangeError(
        `Web engineering Uncovered native capital city ${index} at ${at}`,
      );
    return city;
  };
  const factionAt = (index, at) => nativeFactionAt(sc, index, at);
  const legionAt = (slot, at) => nativeLegionAt(sc, slot, at);
  return {
    readPlayerFactionByte: () => own(sc, "player_faction", "33EA"),
    readPlayerFactionPointer: () =>
      own(sc, "nativePlayerFactionPointer", "341A"),
    readFactionAttr: (index) => own(factionAt(index, "33F3"), "attr", "33F3"),
    readFactionCapital: (index) => {
      const value = own(factionAt(index, "3408"), "capital", "3408");
      return value === null ? 0xff : value;
    },
    writeFactionCapital: (index, value) => {
      factionAt(index, "3408").capital = value === 0xff ? null : value;
    },
    readFactionDiplomat: (index) => {
      const value = own(factionAt(index, "3449"), "diplomat_idx", "3449");
      return value === null ? 0xff : value;
    },
    readCityOwner: (index) => own(cityAt(index, "6A50"), "faction", "6A50"),
    readCityAttr: (index) => own(cityAt(index, "6A55"), "attr", "6A55"),
    readCityProduction: (index) => own(cityAt(index, "6A5F"), "prod", "6A5F"),
    readLegionFaction: (slot) => own(legionAt(slot, "451F"), "faction", "451F"),
    readLegionStatus: (slot) => own(legionAt(slot, "4524"), "status", "4524"),
    readLegionTargetCity: (slot) =>
      own(legionAt(slot, "4529"), "targetCity", "4529"),
    writeLegionTargetCity: (slot, value) => {
      const legion = legionAt(slot, "452E");
      legion.targetCity = value;
      legion.target = sc.cities?.[value] ?? null;
    },
    readLegionRoadAddress: (slot) =>
      own(legionAt(slot, "4531"), "roadEdgeOrNode", "4531"),
    writeLegionRoadAddress: (slot, value) => {
      legionAt(slot, "4536").roadEdgeOrNode = value;
    },
    writeLegionStatus: (slot, value) => {
      legionAt(slot, "4539").status = value;
    },
  };
};

const resolveScenarioCapitalResult = (sc, result) => {
  const factionAt = (index, at) => nativeFactionAt(sc, index, at);
  const cityAt = (index, at) => {
    const city = sc?.cities?.[index];
    if (!city || city.idx !== index)
      throw new RangeError(
        `Web engineering Uncovered native capital city ${index} at ${at}`,
      );
    return city;
  };
  const faction = factionAt(result.faction, "3464");
  const monarchIndex = byte(
    own(faction, "monarch_idx", "3464"),
    "monarch index",
  );
  const monarch = sc?.generals?.[monarchIndex];
  if (!monarch || monarch.idx !== monarchIndex)
    throw new RangeError("Web engineering Uncovered native capital monarch");
  const city = cityAt(result.newCapital, "3464");
  if (result.status === "player-message") {
    // 3421..3448: only the monarch personality line (selector 0x1A4 =
    // TALK[518+talk_idx]); the \4 slot is the speaker (monarch) name byte AL,
    // \2 is the pushed new-capital parameter. 5E60 stays a display gate.
    return {
      ...result,
      monarchRecord: monarch,
      reply: {
        selector: result.monarchSelector,
        talkStyle: byte(own(monarch, "talk_idx", "3434"), "monarch talk_idx"),
        advisorName: monarch.name?.trim?.() ?? "",
        cityName: city.name?.trim?.() ?? "",
      },
    };
  }

  const diplomat = sc?.generals?.[result.diplomat];
  if (!diplomat || diplomat.idx !== result.diplomat)
    throw new RangeError("Web engineering Uncovered native capital diplomat");
  const talkStyle = byte(
    own(diplomat, "talk_idx", "3476"),
    "diplomat talk_idx",
  );
  return {
    ...result,
    diplomatRecord: diplomat,
    report: {
      talkIndex: result.reportTalkIndex,
      targetName: monarch.name?.trim?.() ?? "",
      generalName: diplomat.name?.trim?.() ?? "",
      cityName: city.name?.trim?.() ?? "",
    },
    reply: {
      selector: result.replySelector,
      talkStyle,
      targetName: monarch.name?.trim?.() ?? "",
      generalName: diplomat.name?.trim?.() ?? "",
      cityName: city.name?.trim?.() ?? "",
    },
  };
};

export function performScenarioCapitalRelocation(sc, event) {
  const result = originalCapitalRelocation33EA(nativeCapitalIo(sc), event);

  if (result.status !== "player-message" && result.status !== "message")
    return result;
  return resolveScenarioCapitalResult(sc, result);
}

/**
 * 33FD proposal commit (P38): explicit new capital, no 351A/6A3D/CFF gates.
 * The 6909 relocate proposal always acts on the player faction, so the only
 * reachable statuses are "unchanged" (340D same-capital ret) and
 * "player-message" (3421 monarch declaration + 3445 5E60 display gate).
 */
export function performScenarioRelocationCommit(sc, faction, newCapital) {
  const result = originalRelocationCommit33FD(
    nativeCapitalIo(sc),
    faction,
    newCapital,
  );
  if (result.status !== "player-message" && result.status !== "message")
    return result;
  return resolveScenarioCapitalResult(sc, result);
}
