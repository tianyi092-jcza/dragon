// Native fixed-slot ownership, not a second RAM or an empty-army inference.
// KI 2240..423F / 6EA0; approved representation: march notes §3.15.
import { bindLegionSlotCounter, bindLegionReturnCounter } from "./legionphase.js";
import { movementPlaneAddress } from "./navigation/scenariomovementmemory.js";

const byteFields = [
  "status",
  "faction",
  "generalIdx",
  "morale",
  "_markerFrame",
  "markerBase",
  "moveDelay",
  "movePeriod",
  "targetCity",
  "commandState",
  "contactAnimationByte21",
];
const wordFields = [
  "troops",
  "roadPointAddress",
  "roadEdgeOrNode",
  "x",
  "y",
  "targetX",
  "targetY",
  // 5456 scans the second 20h half-record and may read raw word +24.
  "monthlyAliasWord24",
  "occupancyOffset",
  "occupancyRowParagraph",
];
export const hasNativeLegionSlots = (sc) =>
  Object.hasOwn(sc, "nativeLegionSlots");

// Presentation-only references, mirrored from snapshotNativeLegionSlots: they
// are derived by rebindNativeLegionViews and must never seed the fixed table.
const PRESENTATION_KEYS = new Set([
  "engagementCountdown",
  "countdown",
  "target",
  "leader",
  "dead",
  "_active",
  "_runtimeId",
  "prevX",
  "prevY",
  "_march",
  "_path",
  "_currentNode",
  "_renderMoveSerial",
  "_ptx",
  "_pty",
  "_feint",
  "_battleRoadContext",
  "_engagement",
]);

/**
 * UI/legacy writer write-through (manual formation, monarch legacy arm,
 * dispatch). These callers build a plain record with UI-chosen values and
 * historically pushed it to sc.legions. Under native slots sc.legions is a
 * derived view rebuilt by rebindNativeLegionViews, so a raw push is
 * discarded by the next batch/save rebind while reserve deductions and the
 * general's status persist (formed legion vanishes from list and map).
 * Write the record into the fixed-slot table instead and rebind, returning
 * the rebound view. This is Web persistence plumbing only: field VALUES
 * still come from the caller; no KI formation entry is claimed here (manual
 * 6CDA entry remains unclosed, only its 6FD2 tail is evidenced). Callers
 * must still run ensure/bind/reset/count BEFORE this (count checks the
 * pre-insert state), and must not push afterwards.
 *
 * 6F86 parity for first movement (march §3.15.2): the movement pump reads
 * occupancyOffset/RowParagraph (L1a/L1c) on the first slot action, so the
 * record must carry targetX/targetY, zero-init stride/point defaults,
 * _markerFrame, 701A markerBase and the occupancy pointer, plus the
 * movement-plane INC when a movement plane is supplied. Without these the
 * legion forms fine but the first march step fails closed with
 * "Uncovered original movement L1a: undefined".
 */
export function publishLegacyLegionRecord(sc, legion, at, movement = null) {
  if (!hasNativeLegionSlots(sc)) {
    sc.legions.push(legion);
    return legion;
  }
  integer(legion?.slot, 0, 127, "slot");
  const record = nativeLegionAt(sc, legion.slot, at, true);
  for (const key of Object.keys(record)) {
    if (key !== "slot" && key !== "engagementCountdown") delete record[key];
  }
  for (const [key, value] of Object.entries(legion)) {
    if (key === "slot" || PRESENTATION_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (key === "units") {
      if (!Array.isArray(value) || value.length !== 6)
        throw new TypeError("Invalid legacy six-team table");
      record.units = structuredClone(value);
      continue;
    }
    if (typeof value === "object") continue;
    record[key] = value;
  }
  // 6F86 formation-time truths (caller values win when already set).
  if (!Number.isInteger(record.x) || !Number.isInteger(record.y))
    throw new TypeError("Legacy formation record requires integer x/y");
  if (record.targetX == null) record.targetX = record.x;
  if (record.targetY == null) record.targetY = record.y;
  if (record.roadStride == null) record.roadStride = 0;
  if (record.roadPointAddress == null) record.roadPointAddress = 0;
  if (record._markerFrame == null) record._markerFrame = 4;
  if (record.markerBase == null) {
    const style = sc.factions?.find((f) => f?.idx === record.faction)
      ?.march_marker_style;
    if (Number.isInteger(style)) record.markerBase = (style * 5) & 255;
  }
  record.occupancyOffset = record.x;
  record.occupancyRowParagraph = (record.y & 255) * 24;
  if (movement) {
    // 6FCA: validate the pointer halves, then INC the new square.
    movementPlaneAddress(0, record.x);
    movementPlaneAddress(record.occupancyRowParagraph, 0);
    movement.writeByte(
      record.occupancyRowParagraph,
      record.x,
      (movement.readByte(record.occupancyRowParagraph, record.x) + 1) & 255,
    );
  }
  bindLegionSlotCounter(sc, record);
  rebindNativeLegionViews(sc);
  return sc.legions.find((item) => item.slot === legion.slot) ?? record;
}
function integer(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError(`Invalid native legion ${field}`);
}
function table(sc, at) {
  const value = sc.nativeLegionSlots;
  if (value?.version !== 1 || !Array.isArray(value.records))
    throw new RangeError(
      `Web engineering Uncovered native fixed-slot table at ${at}`,
    );
  return value.records;
}
export function nativeLegionAt(sc, slot, at, write = false) {
  integer(slot, 0, 127, "slot");
  const records = table(sc, at);
  let record = records.find((item) => item.slot === slot);
  if (!record && write) {
    record = { slot };
    records.push(record);
    records.sort((a, b) => a.slot - b.slot);
    bindLegionSlotCounter(sc, record);
  }
  if (!record)
    throw new RangeError(
      `Web engineering Uncovered fixed slot ${slot} at ${at}`,
    );
  return record;
}
export function assertNativeLegionSlots(sc) {
  if (!hasNativeLegionSlots(sc)) return;
  let previous = -1;
  for (const record of table(sc, "schema")) {
    if (!record || typeof record !== "object")
      throw new TypeError("Invalid native record");
    integer(record.slot, previous + 1, 127, "ordered slot");
    previous = record.slot;
    for (const field of byteFields)
      if (Object.hasOwn(record, field)) integer(record[field], 0, 255, field);
    for (const field of wordFields)
      if (Object.hasOwn(record, field)) integer(record[field], 0, 65535, field);
    if (Object.hasOwn(record, "roadStride"))
      integer(record.roadStride, -128, 127, "stride");
    if (Object.hasOwn(record, "targetNode"))
      integer(record.targetNode, 0, 191, "targetNode");
    if (Object.hasOwn(record, "units")) {
      if (!Array.isArray(record.units) || record.units.length !== 6)
        throw new TypeError("Invalid native six-team table");
      for (let i = 0; i < 6; i++) {
        const unit = record.units[i];
        if (!unit || typeof unit !== "object" || Array.isArray(unit))
          throw new TypeError("Invalid native team/hole");
        if (Object.hasOwn(unit, "type"))
          integer(unit.type, 0, 255, "team type");
        if (Object.hasOwn(unit, "troops")) {
          integer(unit.troops, 0, 2550, "team troops");
          if (unit.troops % 10)
            throw new TypeError("Invalid native team scale");
        }
      }
    }
  }
}

// References only: never let dead/delegated/raw/defaults write named rule fields.
export function rebindNativeLegionViews(sc) {
  const active = [],
    delayed = [];
  for (const record of table(sc, "views")) {
    bindLegionSlotCounter(sc, record);
    if (
      Number.isInteger(record.status) &&
      record.status >= 0x80 &&
      record.status <= 255
    ) {
      record.dead = false;
      record._active = true;
      record.leader = sc.generals?.[record.generalIdx]?.name ?? "？";
      record.target = sc.cities?.[record.targetCity] ?? null;
      active.push(record);
    } else if (
      Number.isInteger(record.status) &&
      record.status >= 0 &&
      record.status < 0x80
    ) {
      record._active = false;
      if (record.status & 8) {
        bindLegionReturnCounter(sc, record);
        delayed.push(record);
      }
    }
  }
  sc.legions = active;
  sc.delayedLegionReturns = delayed;
}

// Explicit opt-in only. Source: five fixed SINARIO files, all 20 complete
// chapter+22C0h 8192-byte tables zero; not a runtime/restore missing-data repair.
export function initializeNativeLegionSlotsFromZeroChapter(sc) {
  if (
    hasNativeLegionSlots(sc) ||
    sc.legions?.length ||
    sc.delayedLegionReturns?.length
  )
    throw new TypeError(
      "Native zero chapter requires an uninitialized empty table",
    );
  sc.nativeLegionSlots = {
    version: 1,
    records: Array.from({ length: 128 }, (_, slot) => ({
      slot,
      ...Object.fromEntries(
        [...byteFields, ...wordFields].map((key) => [key, 0]),
      ),
      roadStride: 0,
      targetNode: 0,
      units: Array.from({ length: 6 }, () => ({ type: 0, troops: 0 })),
    })),
  };
  rebindNativeLegionViews(sc);
}

export function snapshotNativeLegionSlots(sc) {
  assertNativeLegionSlots(sc);
  const records = table(sc, "snapshot").map((record) => {
    const clean = { ...record };
    // +03 stays solely in legionSlotCounters. These are presentation references.
    for (const key of [
      "engagementCountdown",
      "countdown",
      "target",
      "leader",
      "dead",
      "_active",
      "_runtimeId",
      "prevX",
      "prevY",
      "_march",
      "_path",
      "_currentNode",
      "_renderMoveSerial",
      "_ptx",
      "_pty",
      "_feint",
      "_battleRoadContext",
    ])
      delete clean[key];
    if (clean._engagement) {
      clean._engagement = { ...clean._engagement };
      delete clean._engagement.countdown;
    }
    return structuredClone(clean);
  });
  // JSON must not silently erase unknown payload values or encode them as null.
  const check = (value) => {
    if (
      value === undefined ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw new TypeError("Lossy native record JSON value");
    if (Array.isArray(value))
      for (let i = 0; i < value.length; i++) check(value[i]);
    else if (value && typeof value === "object")
      for (const item of Object.values(value)) check(item);
  };
  check(records);
  return { version: 1, records };
}
