// KI 6E8F..7027 / 461D..4749. Static instruction contract, march §3.15.
// Every read is at its consumption point; Uncovered is never original CF1.
import { nativeLegionAt, rebindNativeLegionViews } from "../nativelegions.js";
import { movementPlaneAddress } from "./scenariomovementmemory.js";

export function formationUncovered(at) {
  throw new RangeError(`Web engineering Uncovered ${at}`);
}
export function formationByte(value, at) {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    formationUncovered(at);
  return value;
}
function word(value, at) {
  if (!Number.isInteger(value) || value < 0 || value > 65535)
    formationUncovered(at);
  return value;
}
const encoded = (value, at) =>
  value === null ? 255 : formationByte(value, at);
const pools = ["reserve_cav", "reserve_arc", "reserve_inf"];
function factionAt(sc, owner, at) {
  const faction = owner < 24 && sc.factions?.find((f) => f?.idx === owner);
  if (!faction) formationUncovered(`faction ${owner} at ${at}`);
  return faction;
}
function readPool(sc, owner, type, at) {
  if (type < 1 || type > 3)
    formationUncovered(`pool alias type ${type} at ${at}`);
  return word(
    factionAt(sc, owner, at)[pools[type - 1]],
    `pool ${type} at ${at}`,
  );
}
function writePool(sc, owner, type, value) {
  factionAt(sc, owner, "pool write")[pools[type - 1]] = value;
}
function team(record, index, at) {
  const unit = record.units?.[index];
  if (!unit || typeof unit !== "object")
    formationUncovered(`team ${index} at ${at}`);
  return unit;
}
export function originalTeamTroops(record, index, at) {
  const persons = team(record, index, at).troops;
  if (
    !Number.isInteger(persons) ||
    persons < 0 ||
    persons > 2550 ||
    persons % 10
  )
    formationUncovered(`team ${index} troops at ${at}`);
  return persons / 10;
}

/** 461D: return old troops under the CURRENT types, then redistribute. No RNG. */
export function redistributeOriginalLegion(sc, record) {
  const owner = formationByte(record.faction, "L01 at 4625");
  for (let i = 0; i < 6; i++) {
    const unit = team(record, i, "4725");
    const type = formationByte(unit.type, "type at 4725");
    if (type === 4) continue;
    const old = originalTeamTroops(record, i, "4732");
    unit.troops = 0; // XCHG precedes the pool read, including unknown/alias pools.
    const sum = old + readPool(sc, owner, type, "4735");
    writePool(sc, owner, type, Math.min(0xffdc, sum)); // 55EC carry or >FFDC.
  }
  const counts = [0, 0, 0];
  for (let i = 0; i < 6; i++) {
    const type = formationByte(team(record, i, "46B8").type, "type at 46B8");
    if (type === 4) continue;
    if (type < 1 || type > 3)
      formationUncovered(`stack alias type ${type} at 46C7`);
    counts[type - 1]++;
  }
  let clipped = 0;
  for (let i = 0; i < 6; i++) {
    const unit = team(record, i, "46D4");
    const type = formationByte(unit.type, "type at 46D4");
    if (type === 4) continue;
    const pool = readPool(sc, owner, type, "46E5");
    const count = counts[type - 1];
    if (!count) formationUncovered("DIV at 46EA");
    let amount = Math.floor(pool / count) + (pool % count);
    counts[type - 1]--; // 46ED before remainder addition / clamp / real pool SUB.
    if (amount > 100) {
      amount = 100;
      clipped++;
    }
    writePool(sc, owner, type, pool - amount);
    unit.troops = amount * 10;
  }
  return { cf: clipped < 6 }; // CMP CH,6; callers do not treat this as failure.
}

/** 6FD2 full native write order; not legacy ensureUnits/phase normalization. */
export function refreshOriginalLegion(sc, record) {
  let total = 0,
    cavalry = true;
  for (let i = 0; i < 6; i++) {
    const type = formationByte(team(record, i, "6FE0").type, "type at 6FE0");
    if (type !== 1) cavalry = false;
    total += originalTeamTroops(record, i, "6FE9");
  }
  record.troops = total;
  if (!Number.isInteger(record.slot) || record.slot < 0 || record.slot >= 128)
    formationUncovered("fixed-slot BX at 6FFB");
  record.movePeriod = cavalry ? 2 : 3;
  const owner = formationByte(record.faction, "L01 at 7006");
  const style = formationByte(
    factionAt(sc, owner, "700F").march_marker_style,
    "F3E at 700F",
  );
  record.markerBase = (style * 5) & 255;
  record.moveDelay = 1;
}
const candidates = [
  [1, 3, 2],
  [1, 3, 2],
  [3, 1, 2],
  [3, 1, 2],
  [2, 3, 1],
  [2, 3, 1],
];

/** 6E8F original same-general slot, with partial writes even on genuine CF1. */
export function createOriginalLegion(sc, context, index) {
  const record = nativeLegionAt(sc, index, "6EA0", true);
  record.generalIdx = index;
  const general = sc.generals?.[index];
  const owner = encoded(general?.faction, "G1C at 6EA4");
  const available = [1, 2, 3].map((type) => readPool(sc, owner, type, "6ED7"));
  for (let i = 0; i < 6; i++) {
    const type = candidates[i].find(
      (candidate) => available[candidate - 1] >= 50,
    );
    if (type === undefined) return { cf: true };
    available[type - 1] -= 50;
    // A definite type write may establish a partially known team, not its troops.
    if (!Object.hasOwn(record, "units"))
      record.units = Array.from({ length: 6 }, () => ({}));
    team(record, i, "6F0A").type = type;
  }
  record.generalIdx = index; // 6F34
  general.status = 1;
  record.faction = encoded(general.faction, "G1C at 6F44");
  const faction = factionAt(sc, record.faction, "6F51");
  const capital = encoded(faction.capital, "F03 at 6F51");
  record.targetCity = capital;
  if (formationByte(record.status, "L00 at 6F57") < 0x80)
    faction.n_legions =
      (formationByte(faction.n_legions, "F14 at 6F5C") + 1) & 255;
  record.status = 0xc0;
  rebindNativeLegionViews(sc); // Publish the same C0 record even if a later read fails.
  record._markerFrame = 4;
  const city = capital < 192 && sc.cities?.[capital];
  if (!city || city.idx !== capital) formationUncovered("city at 6F89");
  const x = word(city.x, "city X at 6F89"),
    y = word(city.y, "city Y at 6F8C");
  record.roadEdgeOrNode = capital * 8;
  record.targetNode = capital;
  record.x = x;
  record.targetX = x;
  record.y = y;
  record.targetY = y;
  movementPlaneAddress(0, x);
  record.occupancyOffset = x;
  const row = (y & 255) * 24;
  movementPlaneAddress(row, 0);
  record.occupancyRowParagraph = row;
  if (!context.movement) formationUncovered("movement capability at 6FCA");
  context.movement.writeByte(
    row,
    x,
    (context.movement.readByte(row, x) + 1) & 255,
  );
  record.morale = formationByte(faction.legion_morale_cap, "F1D at 6F77");
  record.commandState = 1;
  redistributeOriginalLegion(sc, record);
  refreshOriginalLegion(sc, record);
  record.status = formationByte(record.status, "L00 at 6EC1") | 4;
  return { cf: false, record };
}
