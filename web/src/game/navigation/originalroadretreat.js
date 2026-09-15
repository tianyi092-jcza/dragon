// KI.EXE 487B..491A; caller/representation boundaries: march notes §3.11.
import { searchOriginalRoadMemory } from "./originalroadsearch.js";

const u16 = (value) => value & 0xffff;

function requireOriginalRetreatValue(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum)
    throw new RangeError(`Uncovered original road retreat ${label}: ${value}`);
  return value;
}

/** Literal 487B ABI, with lazy field reads in instruction order.
 * No-capital only defines BX/CF (AL=FF, but input AH/CX are not supplied).
 * All other returns define AX/BX/CX/CF. Exceptions are not KI carry failures:
 * prior caller and search writes remain committed; never catch/rollback here.
 */
export function retreatOriginalRoadMemory({
  readFactionByte,
  readCapitalByte,
  readCurrentWord,
  readGraphByte,
  writeGraphByte,
  readStateByte,
}) {
  const byte = (value, label) =>
    requireOriginalRetreatValue(value, 0xff, label);
  const word = (address) =>
    byte(readGraphByte(u16(address)), "graph byte") |
    (byte(readGraphByte(u16(address + 1)), "graph byte") << 8);
  const cityOwner = (node) =>
    byte(readStateByte(u16(node * 4 + 0x841)), "city owner");
  const faction = byte(readFactionByte(), "faction");
  const capital = byte(readCapitalByte(faction), "capital");
  if (capital === 0xff)
    return { bx: faction * 0x40, cf: true, reason: "no-capital" };
  let ax = capital * 8;
  const owner = byte(readFactionByte(), "faction"); // 4897 rereads L01.
  let bx = requireOriginalRetreatValue(
    readCurrentWord(),
    0xffff,
    "current word",
  );
  let cx = bx;
  const onEdge = bx >= 0x800;
  if (onEdge) {
    cx = word(bx + 6);
    bx = word(bx + 8);
    if (cityOwner(cx) !== owner) cx = bx;
    if (cityOwner(bx) !== owner) {
      if (bx === cx)
        return { ax, bx, cx, cf: true, reason: "foreign-endpoints" };
      bx = cx;
    }
  }
  const result = searchOriginalRoadMemory({
    start: ax,
    stopB: bx,
    stopC: cx,
    owner,
    readGraphByte,
    writeGraphByte,
    readStateByte,
  });
  ({ ax, bx, cx } = result);
  if (result.cf) {
    // 4911/4913 change AX itself; shortcut AND exhaustion take this exit.
    ax = u16(ax << 2);
    return { ax, bx: ax, cx, cf: false, reason: result.reason };
  }
  if (ax === (onEdge ? 0xfffc : 4)) bx = u16(bx + 2);
  bx = u16(word(bx + 6) << 2);
  const cf = byte(readStateByte(u16(bx + 0x841)), "city owner") !== owner;
  return { ax, bx, cx, cf, reason: cf ? "foreign-next-city" : "found" };
}

export function readOriginalRetreatFaction(legion) {
  return requireOriginalRetreatValue(legion.faction, 0xff, "faction");
}

export function readOriginalRetreatCapital(scenario, faction) {
  const value = scenario.factions?.find(
    (entry) => entry.idx === faction,
  )?.capital;
  // Existing named byte encoding: explicit null is FF, undefined is unknown.
  return value === null
    ? 0xff
    : requireOriginalRetreatValue(value, 0xff, "capital");
}

export function readOriginalRetreatCurrent(legion) {
  return requireOriginalRetreatValue(
    legion.roadEdgeOrNode,
    0xffff,
    "current word",
  );
}

/** Web named-city bridge, NOT a KI failure/extra ownership gate. */
export function originalRetreatRoute(scenario, legion, context) {
  const result = retreatOriginalRoadMemory({
    readFactionByte: () => readOriginalRetreatFaction(legion),
    readCapitalByte: (owner) => readOriginalRetreatCapital(scenario, owner),
    readCurrentWord: () => readOriginalRetreatCurrent(legion),
    readGraphByte: context.memory.readByte,
    writeGraphByte: context.memory.writeByte,
    readStateByte: context.readCityOwnerByte,
  });
  if (result.cf) return null;
  if (result.bx % 0x20 !== 0 || result.bx > 0x17e0)
    throw new RangeError(
      `Uncovered original road retreat city return: ${result.bx}`,
    );
  const id = result.bx / 0x20;
  const city = scenario.cities[id];
  const node = context.roads.roadNodeById(id);
  if (city?.idx !== id || node?.id !== id)
    throw new RangeError(`Uncovered original road retreat city slot: ${id}`);
  return { city, node, native: true };
}
