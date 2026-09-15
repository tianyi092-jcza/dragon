// KI 2662..28CB, 42AB..4324, 47BB..487A; static source and limits: march §3.12.
// One bounded native driver for detached real slots and stepTo, not a second pump.
import { searchOriginalRoadMemory } from "./originalroadsearch.js";
import { movementPlaneAddress } from "./scenariomovementmemory.js";
import { nativeLegionAt } from "../nativelegions.js";
import {
  redistributeOriginalLegion,
  refreshOriginalLegion,
} from "./originalformation.js";
import {
  arriveOriginalRoad,
  interceptOriginalRoad4300,
} from "./originalroadarrival.js";
import {
  bindLegionSlotCounter,
  projectEngagementCounter,
} from "../legionphase.js";

const u16 = (value) => value & 0xffff;
const s8 = (value) => (value & 0x80 ? (value & 255) - 256 : value & 255);
function unsigned(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum)
    throw new RangeError(`Uncovered original movement ${label}: ${value}`);
  return value;
}
export function uncoveredOriginalMovement(callee, instruction) {
  throw new Error(`Web engineering Uncovered ${callee} at ${instruction}`);
}

/** Only CF is exposed: other 47BB register values are not an asserted ABI.
 * Reads and writes are lazy and immediate; search CF is deliberately ignored.
 */
export function selectOriginalRoad47BB(io) {
  const {
    readByte: rb,
    readWord: rw,
    writeByte: wb,
    writeWord: ww,
    graphWord: gw,
  } = io;
  const target = rw(0x14),
    current = rw(0x0e),
    owner = rb(1);
  const edge = current >= 0x800;
  let stopB = current,
    stopC = current;
  if (edge) {
    stopC = gw(current + 6);
    stopB = gw(current + 8);
    if (target === stopB || target === stopC) {
      wb(0, rb(0) | 1);
      wb(0x0a, target === stopB ? 4 : 0xfc);
      return { cf: false };
    }
  } else if (target === current) return { cf: false };
  const result = searchOriginalRoadMemory({
    start: target,
    stopB,
    stopC,
    owner,
    readGraphByte: io.readGraphByte,
    writeGraphByte: io.writeGraphByte,
    readStateByte: io.readCityOwnerByte,
  });
  if (result.cx >= 0x8000 && rb(0x23) >= 0x0a) {
    rb(1); // 47FE / 484E: AL is read before the unimplemented callee.
    uncoveredOriginalMovement("291A", edge ? "4801" : "4851");
  }
  const al = result.ax & 255;
  if (edge) {
    const node = gw(result.bx + (al === 4 ? 6 : 8));
    wb(0, rb(0) | 1);
    wb(0x0a, node === stopB ? 4 : 0xfc);
  } else {
    const point = gw(result.bx + (al === 4 ? 0 : 2));
    ww(0x0c, point);
    ww(0x0e, result.bx);
    wb(0, rb(0) & 0xfe);
    wb(0x0a, al);
  }
  return { cf: false };
}

function movementIO(sc, legion, context) {
  const byteFields = {
    0: "status",
    1: "faction",
    6: "morale",
    8: "_markerFrame",
    11: "moveDelay",
    32: "targetCity",
    35: "commandState",
  };
  const wordFields = {
    4: "troops",
    12: "roadPointAddress",
    14: "roadEdgeOrNode",
    16: "x",
    18: "y",
    22: "targetX",
    24: "targetY",
    26: "occupancyOffset",
    28: "occupancyRowParagraph",
  };
  const rb = (offset) => {
    if (offset === 0x0a) {
      const stride = legion.roadStride;
      if (!Number.isInteger(stride) || stride < -128 || stride > 127)
        throw new RangeError(`Uncovered original movement stride: ${stride}`);
      return stride & 255;
    }
    if (offset === 3) {
      bindLegionSlotCounter(sc, legion);
      return legion.engagementCountdown;
    }
    if (offset === 0x12) return unsigned(legion.y, 65535, "Y") & 255;
    return unsigned(legion[byteFields[offset]], 255, `L${offset.toString(16)}`);
  };
  const rw = (offset) =>
    offset === 0x14
      ? unsigned(legion.targetNode, 191, "target node id") * 8
      : unsigned(legion[wordFields[offset]], 65535, `L${offset.toString(16)}`);
  const wb = (offset, value) => {
    value &= 255;
    if (offset === 0x0a) legion.roadStride = s8(value);
    else if (offset === 3) {
      bindLegionSlotCounter(sc, legion);
      legion.engagementCountdown = value;
    } else if (offset === 0x12) legion.y = (rw(0x12) & 0xff00) | value;
    else legion[byteFields[offset]] = value;
  };
  const ww = (offset, value) => {
    value = u16(value);
    if (offset === 0x14) {
      if (value % 8 || value > 191 * 8)
        throw new RangeError(
          `Uncovered original movement target bridge: ${value}`,
        );
      legion.targetNode = value / 8;
    } else {
      // Validate each half at its own instruction, not as an atomic pointer.
      if (offset === 0x1a) movementPlaneAddress(0, value);
      if (offset === 0x1c) movementPlaneAddress(value, 0);
      legion[wordFields[offset]] = value;
    }
  };
  const gb = (address) =>
    unsigned(context.memory.readByte(u16(address)), 255, "graph byte");
  const gw = (address) => gb(address) | (gb(address + 1) << 8);
  return {
    readByte: rb,
    readWord: rw,
    writeByte: wb,
    writeWord: ww,
    graphWord: gw,
    readGraphByte: gb,
    writeGraphByte: context.memory.writeByte,
    readCityOwnerByte: context.readCityOwnerByte,
    replenish: () => {
      redistributeOriginalLegion(sc, legion);
      refreshOriginalLegion(sc, legion);
    },
    readTeamTroops: (index) => {
      const persons = unsigned(
        legion.units?.[index]?.troops,
        2550,
        `team ${index} at 4470`,
      );
      if (persons % 10)
        throw new RangeError(
          `Uncovered original team byte at 4470: ${persons}`,
        );
      return persons / 10;
    },
  };
}

export function performOriginalRoadAction(sc, legion, context, rng = null) {
  if (!context?.movement)
    throw new Error("Web engineering Uncovered native movement capability");
  const io = movementIO(sc, legion, context);
  const {
    readByte: rb,
    readWord: rw,
    writeByte: wb,
    writeWord: ww,
    graphWord: gw,
    readGraphByte: gb,
  } = io;
  const cityOwner = (node) =>
    unsigned(
      context.readCityOwnerByte(u16(node * 4 + 0x841)),
      255,
      "city owner",
    );
  const cityAt = (node) => {
    if (node % 8 || node >= 0x600 || sc.cities?.[node / 8]?.idx !== node / 8)
      throw new RangeError(`Uncovered original movement city bridge: ${node}`);
    return sc.cities[node / 8];
  };
  const occupancyDelta = (delta) => {
    // LDS reads offset then segment; re-read the current pointer at 26F7.
    const offset = rw(0x1a),
      row = rw(0x1c);
    const value = context.movement.readByte(row, offset);
    context.movement.writeByte(row, offset, (value + delta) & 255);
  };
  function direction(stride) {
    const point = u16(stride + rw(0x0c));
    const dx = u16(rw(0x10) - gw(point));
    if (dx) wb(8, dx >>> 15);
    else {
      const dy = (rb(0x12) - gb(point + 2)) & 255;
      if (dy) wb(8, (dy >>> 7) + 2);
    }
  }
  function nodeize() {
    direction(s8(-rb(0x0a) & 255)); // NEG AL then CBW, including 80h.
    wb(8, rb(8) ^ 1);
    const edge = rw(0x0e);
    const node = gw(edge + (rb(0x0a) === 4 ? 8 : 6));
    ww(0x0e, node);
    if (node < 0x600) {
      const city = cityAt(node);
      const x = unsigned(city.x, 65535, "city X"),
        y = unsigned(city.y, 65535, "city Y");
      ww(0x10, x);
      ww(0x12, y);
      ww(0x1a, x);
      ww(0x1c, (y & 255) * 24);
    }
    if (rw(0x0e) === rw(0x14)) wb(8, 4);
  }
  function continues(flags) {
    if ((flags & 7) < 2) return true;
    const stride = s8(rb(0x0a));
    return flags & 0x40 ? stride > 0 : stride < 0;
  }
  function wait(kind, target) {
    wb(0, rb(0) | 0x20);
    const count = rb(3);
    if (count === 1)
      uncoveredOriginalMovement(
        kind === "field" ? "4A7B" : "4ADE",
        kind === "field" ? "2873" : "28BF",
      );
    if (count === 0) wb(3, 12);
    // Product presentation only; never used to select the next native contact.
    legion._engagement = { kind, target };
    projectEngagementCounter(legion);
    return "contact";
  }
  function fieldContact(x, y) {
    rw(0x0e); // 2834 reads current edge even though this bounded callee only scans.
    for (let slot = 0; slot < 127; slot++) {
      const record = nativeLegionAt(sc, slot, "L00 at 2831");
      if (unsigned(record.status, 255, "occupant status") < 0x80) continue;
      if (unsigned(record.y, 65535, "occupant Y") !== y) continue;
      if (unsigned(record.x, 65535, "occupant X") !== x) continue;
      const owner = rb(1);
      if (owner === unsigned(record.faction, 255, "occupant faction"))
        return null;
      return wait("field", { slot, faction: record.faction, x, y });
    }
    return null;
  }
  function candidate(point) {
    const x = gw(point),
      yf = gw(point + 2),
      y = yf & 255,
      row = y * 24;
    if (context.movement.readByte(row, x) !== 0) {
      const contact = fieldContact(x, y);
      if (contact) return contact;
    }
    const tile = unsigned(context.readTerrainByte(x, y), 255, "terrain byte");
    if (rb(0) & 1 && tile >= 0xce && tile <= 0xdd) {
      const edge = rw(0x0e);
      const node = gw(edge + (rb(0x0a) === 4 ? 8 : 6));
      const owner = rb(1);
      if (cityOwner(node) !== owner)
        return wait("siege", { cityIdx: node / 8 });
    }
    ww(0x1c, row);
    ww(0x1a, x);
    ww(0x0c, point);
    const committed = gw(point + 2); // 276D is a distinct read, after pointer/0C.
    ww(0x10, x);
    wb(0x12, committed & 255);
    if (continues(committed >>> 8)) direction(s8(rb(0x0a)));
    else nodeize();
    return "moved";
  }

  const current = rw(0x0e);
  if (current === rw(0x14))
    return arriveOriginalRoad(sc, context, io, current, rng);
  if (rb(0) & 0x10) uncoveredOriginalMovement("2BA8", "267A");
  if (current < 0x800) {
    if (rb(1) !== unsigned(sc.player_faction, 255, "player faction")) {
      const interception = interceptOriginalRoad4300(sc, context, io, current);
      if (interception.cf)
        return arriveOriginalRoad(sc, context, io, interception.bx, rng);
    }
  } else {
    // 42AB: only byte FC selects +6; other signed values still select +8.
    const offset = rb(0x0a) === 0xfc ? 6 : 8;
    const endpoint = gw(current + offset),
      owner = rb(1),
      other = cityOwner(endpoint);
    if (other !== owner && other !== 0x18) {
      const diplomacy = unsigned(
        sc.diplomacy?.[owner]?.[other],
        255,
        "diplomacy byte",
      );
      if (diplomacy >= 0x80) {
        const node = gw(current + (offset === 6 ? 8 : 6));
        ww(0x14, node);
        wb(0x20, node >>> 3);
        wb(0, rb(0) | 2);
      }
    }
  }
  occupancyDelta(-1);
  let firstPoint = false;
  if (rb(0) & 2) {
    wb(0, rb(0) & 0xfd);
    selectOriginalRoad47BB(io);
    firstPoint = !(rb(0) & 1);
  } else if (rw(0x0e) < 0x800) {
    selectOriginalRoad47BB(io);
    firstPoint = true;
  }
  let outcome = "moved";
  if (firstPoint) outcome = candidate(rw(0x0c));
  else {
    const point = rw(0x0c),
      flags = gb(point + 3);
    if (continues(flags)) {
      wb(0, rb(0) | 1);
      outcome = candidate(u16(point + s8(rb(0x0a))));
    } else nodeize();
  }
  occupancyDelta(1); // Normal RET only: never finally, never after Uncovered.
  return outcome;
}
