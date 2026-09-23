import { originalRefreshGeneralRatings55A6 } from "./originalgeneralrating.js";

const missing = (field) => {
  throw new RangeError(
    `Web engineering Uncovered native general rating ${field}`,
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
const byte = (value, field) => integer(value, 0, 0xff, field);
const nibble = (value, field) => integer(value, 0, 0x0f, field);

export function performScenarioGeneralRatingRefresh(sc) {
  const general = (slot, at) => {
    const value = sc.generals?.[slot];
    if (!value || value.idx !== slot) missing(`${at} general ${slot}`);
    return value;
  };
  const ability = (slot, field, at) =>
    own(own(general(slot, at), "ability"), field);
  return originalRefreshGeneralRatings55A6({
    readGeneralAttr(slot) {
      return byte(own(general(slot, "55B2"), "attr"), "attr");
    },
    readGeneralSpecialty(slot, field) {
      return nibble(ability(slot, field, "55C1"), field);
    },
    readGeneralAbility(slot, field) {
      return byte(ability(slot, field, "55D3"), field);
    },
    writeGeneralRating(slot, value) {
      const record = general(slot, "55DC");
      own(record, "battle_rating");
      record.battle_rating = byte(value, "battle_rating write");
    },
  });
}
