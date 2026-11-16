// KI.EXE 487B..491A; caller/representation boundaries: march notes §3.11.
import { searchOriginalRoadMemory } from "./originalroadsearch.js";
import { searchRegionsFor } from "./originalroadmemory.js";
import { cityNodeBoundOf, readRoadNodeOwner, roadNodeToCitySlot } from "./originalroadstate.js";
import {
  refreshOriginalLegion,
  formationByte,
  originalTeamTroops,
} from "./originalformation.js";

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
  readCityOwnerAtNode,
  cityNodeBound,
  regions,
  edgeBase = 0x800,
}) {
  const byte = (value, label) =>
    requireOriginalRetreatValue(value, 0xff, label);
  const word = (address) =>
    byte(readGraphByte(u16(address)), "graph byte") |
    (byte(readGraphByte(u16(address + 1)), "graph byte") << 8);
  const cityOwner = (node) =>
    byte(
      readCityOwnerAtNode
        ? readCityOwnerAtNode(node, "city owner")
        : readStateByte(u16(node * 4 + 0x841)),
      "city owner",
    );
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
  // Edge/node kind marker follows the road version (v2 0x800).
  const onEdge = bx >= edgeBase;
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
    readCityOwnerAtNode,
    cityNodeBound,
    regions,
  });
  ({ ax, bx, cx } = result);
  if (result.cf) {
    // 4911/4913 change AX itself; shortcut AND exhaustion take this exit.
    ax = u16(ax << 2);
    return { ax, bx: ax, cx, cf: false, reason: result.reason };
  }
  if (ax === (onEdge ? 0xfffc : 4)) bx = u16(bx + 2);
  bx = u16(word(bx + 6) << 2);
  // Final next-city owner read: BX is the same node*4 encoding, so the
  // legacy address is BX+0x841. The indexed form decodes the slot first;
  // misaligned returns stay fail-closed on both contracts.
  let nextOwner;
  if (readCityOwnerAtNode) {
    if (bx % 0x20 !== 0)
      throw new RangeError(
        `Uncovered original road retreat return bridge: ${bx}`,
      );
    nextOwner = cityOwner((bx / 0x20) * 8);
  } else {
    nextOwner = byte(readStateByte(u16(bx + 0x841)), "city owner");
  }
  const cf = nextOwner !== owner;
  return { ax, bx, cx, cf, reason: cf ? "foreign-next-city" : "found" };
}

export function readOriginalRetreatFaction(legion) {
  return requireOriginalRetreatValue(legion.faction, 0xff, "faction");
}

export function readOriginalRetreatCapital(scenario, faction) {
  // KI4884/47A0: owner18h gives DS:0603, the SAME raw diplomacy[0][3]
  // byte (3119), not a synthetic faction24. No relation/default/bit7 mask.
  // legion-fate notes §17; other DOS aliases remain outside this bridge.
  if (faction === 0x18) {
    const row = scenario.diplomacy?.[0];
    return requireOriginalRetreatValue(
      row && Object.hasOwn(row, 3) ? row[3] : undefined,
      0xff,
      "DS0603 capital alias",
    );
  }
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

/** 474A shared native implementation. won=true means original CL=0.
 * Boolean return is !CF; exceptions retain every preceding write.
 */
export function continueOriginalLegionAfterBattle(sc, legion, won, context) {
  refreshOriginalLegion(sc, legion);
  if (formationByte(legion.morale, "L06 at 4751") === 0) return false;
  if (originalTeamTroops(legion, 0, "L29 at 4757") === 0) return false;
  if (won) {
    legion.commandState = 8;
    return true;
  }
  const current = readOriginalRetreatCurrent(legion);
  // 474A current-city shortcut: same node bridge as the state reader, but
  // the owner comes from the indexed reader with a live city-node range.
  // Cities absent keeps the legacy bound; misaligned input stays fail-closed.
  const cityRange = (sc.cities?.length ?? 192) * 8;
  if (
    current < cityRange &&
    context.readCityOwner(
      roadNodeToCitySlot(sc, current, "474A-current"),
      "474A-current",
    ) ===
      readOriginalRetreatFaction(legion)
  ) {
    legion.commandState = 8;
    return true;
  }
  const retreat = originalRetreatRoute(sc, legion, context);
  if (!retreat) return false;
  legion.targetNode = retreat.node.id; //4780 before4789
  legion.targetCity = retreat.city.idx;
  legion.status = formationByte(legion.status, "L00 at 478C") | 2;
  legion.commandState =
    legion.troops <= 300 ||
    retreat.city.idx ===
      readOriginalRetreatCapital(sc, readOriginalRetreatFaction(legion))
      ? 10
      : 8;
  // Existing presentation projections only, not another route authority.
  legion.target = retreat.city;
  legion._battleRoadContext = null;
  legion._retreat = {
    cityIdx: retreat.city.idx,
    nodeId: retreat.node.id,
    captorFaction: null,
  };
  return true;
}

/** 4DA4 consumes the original BP record references, including retired members. */
export function retreatOriginalGarrison(sc, defenders, context, fate) {
  if (!defenders.length) return { retreat: 0, fates: [] };
  const retreat = originalRetreatRoute(sc, defenders[0], context);
  if (!retreat) return { retreat: 0, fates: defenders.map(fate) };
  for (const legion of defenders) {
    legion.targetCity = retreat.city.idx;
    legion.targetNode = retreat.node.id;
    legion.moveDelay = 1;
    legion.status = formationByte(legion.status, "L00 at 4DD3") | 2;
    legion.target = retreat.city; // presentation only
  }
  return { retreat: defenders.length, fates: [] };
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
    // Versioned search workspace regions (memory roadLayout, v2 default).
    regions: searchRegionsFor(context.memory?.roadLayout),
    // Edge/node kind marker follows the road version (v2 0x800).
    edgeBase: context.memory?.roadLayout?.edgeBase ?? 0x800,
    // Indexed 487B contract, attached only when the live indexed owner
    // capability exists; legacy mocks keep the address reads above.
    ...(typeof context.readCityOwner === "function"
      ? {
          readCityOwnerAtNode: (node, at) =>
            readRoadNodeOwner(scenario, context, node, at ?? "487B"),
          cityNodeBound: cityNodeBoundOf(scenario),
        }
      : {}),
  });
  if (result.cf) return null;
  // BX return bridge: BX>>2 is the same node*4 encoding, so BX%0x20 must be
  // zero and BX/0x20 must be a live city slot; the legacy 0x17e0 cap is the
  // 192-city spelling of that bound.
  if (
    result.bx % 0x20 !== 0 ||
    result.bx / 0x20 >= (scenario.cities?.length ?? 0)
  )
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
