import { scenarioGridRoadContext } from '../scenarioassembly.js';
import { nativeFactionAt } from "../nativefactions.js";
import { nativeLegionAt } from "../nativelegions.js";
import {
  nativeMonthlyPolicyByte,
  nativeMonthlyPolicyWord,
} from "../nativemonthlypolicy.js";
import { originalMonthlyFiscal5358 } from "./originalmonthlyfiscal.js";

const missing = (field) => {
  throw new RangeError(
    `Web engineering Uncovered native monthly fiscal ${field}`,
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
const word = (value, field) => integer(value, 0, 0xffff, field);
const u24 = (value, field) => integer(value, 0, 0xffffff, field);
const raw24 = (value) => (value < 0 ? value + 0x1000000 : value);
const signed24 = (value) => (value & 0x800000 ? value - 0x1000000 : value);

export function performScenarioMonthlyFiscal(sc, rng) {
  const faction = (slot, at) => nativeFactionAt(sc, slot, at);
  const city = (slot, at) => {
    const cities = own(sc, "cities");
    const live = Array.isArray(cities) ? cities.length : 192;
    const value = cities?.[slot];
    if (!value || value.idx !== slot || slot < 0 || slot >= live)
      missing(`${at} city ${slot}`);
    return value;
  };
  const cityOwner = (record) =>
    record.faction === null
      ? 0x18
      : byte(own(record, "faction"), "city faction");
  let playerReport = null;
  const bounds = scenarioGridRoadContext(sc)?.world.definition;
  const reports = originalMonthlyFiscal5358({
    readGridCoordinate: bounds && ((slot, axis) => {
      const min = axis === 'x' ? bounds.minX : bounds.minY;
      const size = axis === 'x' ? bounds.width : bounds.height;
      return integer(own(city(slot, axis), axis), min, min + size - 1, `grid city ${axis}`);
    }),
    readFactionByte(slot, field) {
      const record = faction(slot, field);
      const value = own(record, field);
      if ((field === "capital" || field === "target_faction") && value === null)
        return 0xff;
      // M257(d): n_cities rides word; every other fiscal byte is untouched.
      if (field === "n_cities") return word(value, field);
      return byte(value, field);
    },
    writeFactionByte(slot, field, value) {
      faction(slot, field)[field] =
        field === "n_cities"
          ? word(value, `${field} write`)
          : byte(value, `${field} write`);
    },
    readFactionWord(slot, field) {
      return word(own(faction(slot, field), field), field);
    },
    writeFactionWord(slot, field, value) {
      faction(slot, field)[field] = word(value, `${field} write`);
    },
    readFactionExpense24(slot) {
      return u24(
        own(faction(slot, "monthly_reserve_upkeep"), "monthly_reserve_upkeep"),
        "monthly_reserve_upkeep",
      );
    },
    writeFactionExpense24(slot, value) {
      faction(slot, "monthly_reserve_upkeep").monthly_reserve_upkeep = u24(
        value,
        "monthly_reserve_upkeep write",
      );
    },
    readFactionMoney24(slot) {
      const value = integer(
        own(faction(slot, "money"), "money"),
        -0x800000,
        0x7fffff,
        "money",
      );
      return raw24(value);
    },
    writeFactionMoney24(slot, value) {
      const record = faction(slot, "money write");
      const signed = signed24(u24(value, "money write"));
      record.money = signed;
      if (Object.hasOwn(record, "gold")) record.gold = signed;
    },
    readCityCount(at) {
      const cities = own(sc, "cities");
      return integer(
        Array.isArray(cities) ? cities.length : 192,
        1,
        0xffff,
        at ?? "city count",
      );
    },
    readCityByte(slot, field) {
      const record = city(slot, field);
      return field === "faction"
        ? cityOwner(record)
        : byte(own(record, field), `city ${field}`);
    },
    writeCityByte(slot, field, value) {
      city(slot, field)[field] = byte(value, `city ${field} write`);
    },
    readCityWord(slot, field) {
      return word(own(city(slot, field), field), `city ${field}`);
    },
    writeCityWord(slot, field, value) {
      city(slot, field)[field] = word(value, `city ${field} write`);
    },
    readPlayerFactionPointer() {
      return word(
        own(sc, "nativePlayerFactionPointer"),
        "nativePlayerFactionPointer",
      );
    },
    readPlayerFactionByte() {
      return byte(own(sc, "player_faction"), "player_faction");
    },
    readCurrentTaxByte() {
      return nativeMonthlyPolicyByte(sc, 0, "548F current tax");
    },
    readCurrentConscriptionWord(index) {
      integer(index, 0, 2, "conscription index");
      return nativeMonthlyPolicyWord(
        sc,
        2 + index * 2,
        `54CA current conscription ${index}`,
      );
    },
    writePlayerFinanceReport(income, expense) {
      playerReport = { income, expense };
      sc.playerFinanceReport = playerReport; // 54E3..54F6, before the accumulated expense is cleared.
    },
    readLegionHalfByte(half, field) {
      const slot = half >>> 1;
      const record = nativeLegionAt(sc, slot, `5456 half ${half}`);
      if ((half & 1) === 0) return byte(own(record, field), `legion ${field}`);
      const alias =
        field === "status" ? "targetCity" : "contactAnimationByte21";
      return byte(own(record, alias), `legion half ${alias}`);
    },
    readLegionHalfWord(half) {
      const record = nativeLegionAt(sc, half >>> 1, `5475 half ${half}`);
      const field = half & 1 ? "monthlyAliasWord24" : "troops";
      return word(own(record, field), `legion half ${field}`);
    },
    nextRandomByte() {
      if (typeof rng?.nextByte !== "function") missing("canonical RNG");
      return rng.nextByte();
    },
  });
  return reports.map((report) => {
    const record = faction(report.slot, "report");
    const result = {
      faction: report.slot,
      monarch: record.monarch_idx,
      income: report.income,
      expense: report.expense,
      cav: report.cav,
      arc: report.arc,
      inf: report.inf,
      gold: record.money,
    };
    if (report.slot * 0x40 === sc.nativePlayerFactionPointer && playerReport)
      result.playerReport = playerReport;
    return result;
  });
}
