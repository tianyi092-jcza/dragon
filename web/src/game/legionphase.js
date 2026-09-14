// KI 2240h + slot*40h: +03 survives record deactivation and reuse.
// New-game source: SINARIO chapter +22C0h, 8192 zero bytes in all 20
// shipped chapters; 6F26/6FD2 do NOT clear +03. See AI chain P24.
import { factionLegionCount } from "./legioncounts.js";

export const LEGION_PHASE_VERSION = 1;

function byte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new TypeError(`Missing or invalid legion byte: ${name}`);
  }
  return value;
}

export function initializeLegionSlotState(sc) {
  if (sc.legions?.length || sc.delayedLegionReturns?.length) {
    throw new Error("Only an empty new-game legion table can be initialized");
  }
  sc.legionPhaseVersion = LEGION_PHASE_VERSION;
  sc.legionSlotCounters = Array(128).fill(0);
}

// Web format boundary, not a reconstruction of old cooldown/raw history.
// Validate before loading or saving; do not modify the supplied snapshot.
export function assertLegionPhaseState(sc) {
  if (sc?.legionPhaseVersion !== LEGION_PHASE_VERSION) {
    throw new TypeError("Unsupported legion phase format; start a new game");
  }
  if (
    !Array.isArray(sc.legionSlotCounters) ||
    sc.legionSlotCounters.length !== 128
  ) {
    throw new TypeError("Missing fixed legion slot counter table");
  }
  for (let slot = 0; slot < 128; slot++)
    byte(sc.legionSlotCounters[slot], `slot ${slot} +03`);
  if (
    !Array.isArray(sc.legions) ||
    (sc.delayedLegionReturns != null && !Array.isArray(sc.delayedLegionReturns))
  ) {
    throw new TypeError("Invalid legion record lists");
  }
  if (!Array.isArray(sc.factions)) throw new TypeError("Missing faction table");
  for (const faction of sc.factions) factionLegionCount(faction);
  const slots = new Set();
  for (const record of [...sc.legions, ...(sc.delayedLegionReturns ?? [])]) {
    const slot = record?.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= 128 || slots.has(slot)) {
      throw new TypeError("Invalid or duplicate legion slot");
    }
    slots.add(slot);
    if (byte(record.status, `slot ${slot} status`) >= 0x80) {
      byte(record.moveDelay, `slot ${slot} +0B`);
      byte(record.movePeriod, `slot ${slot} +1E`);
    }
  }
}

// The array is the authority, including slots with no live Web object.
// Enumerable projections preserve existing presentation/JSON field names;
// rebuilding these projections must never overwrite the stored slot byte.
export function bindLegionSlotCounter(sc, record) {
  const slot = record.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot >= 128) {
    throw new RangeError("Legion counter requires a fixed slot");
  }
  if (
    !Array.isArray(sc.legionSlotCounters) ||
    sc.legionSlotCounters.length !== 128
  ) {
    throw new TypeError("Missing fixed legion slot counter table");
  }
  byte(sc.legionSlotCounters[slot], `slot ${slot} +03`);
  Object.defineProperty(record, "engagementCountdown", {
    configurable: true,
    enumerable: true,
    get: () => sc.legionSlotCounters[slot],
    set: (value) => {
      sc.legionSlotCounters[slot] = byte(value, `slot ${slot} +03`);
    },
  });
  if (record._engagement) projectEngagementCounter(record);
}

export function projectEngagementCounter(record) {
  Object.defineProperty(record._engagement, "countdown", {
    configurable: true,
    enumerable: true,
    get: () => record.engagementCountdown,
  });
}

export function bindLegionReturnCounter(sc, record) {
  bindLegionSlotCounter(sc, record);
  Object.defineProperty(record, "countdown", {
    configurable: true,
    enumerable: true,
    get: () => record.engagementCountdown,
  });
}

export function legionSlotCounter(record) {
  return byte(record.engagementCountdown, "+03");
}

// Timing slice of 6FD2: 6FE0 reads every type (including zero-strength
// teams); 6FFB compares the POST-LOOP BX address, not total troops.
// Valid legion slots therefore store 2 iff all six types are 1, else 3.
// 7003 writes +1E; 701D writes +0B=1, even if replenishment changed no troops.
export function resetLegionActionPhase(record) {
  if (!Array.isArray(record.units) || record.units.length !== 6) {
    throw new TypeError("Legion action period requires all six teams");
  }
  const types = record.units.map((unit) => byte(unit.type, "team type"));
  record.movePeriod = types.every((type) => type === 1) ? 2 : 3;
  record.moveDelay = 1;
}

// 264A is called after an entered active slot's action/daily, even if the
// action deactivated it. Bit5 clear writes zero, otherwise byte DEC then
// replace zero with one: input zero becomes 255, not one.
export function finishLegionSlotTail(record) {
  record.engagementCountdown =
    record.status & 0x20 ? (legionSlotCounter(record) - 1) & 255 || 1 : 0;
}
