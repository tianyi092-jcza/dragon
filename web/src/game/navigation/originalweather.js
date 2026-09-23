// Strict KI.EXE weather/event leaves.
import { originalDelayedEnqueue301C } from "./originallegionfate.js";
// Evidence: docs/re-notes-march-pathfinding.md#native-weather-monthly-producer.
export class OriginalWeatherBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original weather boundary at ${at}: ${detail}`);
    this.name = "OriginalWeatherBoundaryError";
  }
}

const stop = (at, detail) => {
  throw new OriginalWeatherBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const unsigned = (value, max, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > max)
    stop(at, `${label} is not u${max === 255 ? 8 : 16}`);
  return value;
};
const byte = (value, at, label) => unsigned(value, 255, at, label);
const word = (value, at, label) => unsigned(value, 65535, at, label);
const rng = (io, at) =>
  byte(call(io, "nextRandomByte", [], at), at, "random byte");
const cityByte = (io, index, field, at) =>
  byte(call(io, "readCityByte", [index, field], at), at, `city ${field}`);
const cityWord = (io, index, field, at) =>
  word(call(io, "readCityWord", [index, field], at), at, `city ${field}`);
const bound = (io, field, at) =>
  word(call(io, "readBoundWord", [field], at), at, `bound ${field}`);
const writeBound = (io, field, value, at) =>
  call(io, "writeBoundWord", [field, value & 0xffff], at);

/** 2FBF: current 0x100-byte page only; CF reports insertion failure. */
export function originalCurrentEnqueue2FBF(io, ax, dx, delay) {
  ax = word(ax, "2FC4", "AX event word");
  dx = word(dx, "2FC3", "DX event word");
  delay = byte(delay, "2FC6", "BL delay");
  let offset;
  if (delay === 0xff) offset = rng(io, "2FCB") & 0x7c;
  else offset = (delay << 2) & 0xffff;
  const cursor = word(
    call(io, "readEventCursorWord", [], "2FD4"),
    "2FD4",
    "D20 cursor word",
  );
  offset = (offset + cursor) & 0xffff;
  if (offset >= 0x100) return { inserted: false, offset, cf: true };
  for (;;) {
    if (
      byte(
        call(io, "readEventTypeByte", [offset], "2FF1"),
        "2FF1",
        "event type",
      ) === 0
    ) {
      call(io, "writeEventWord", [offset, ax], "2FF6");
      call(io, "writeEventWord", [(offset + 2) & 0xffff, dx], "2FF8");
      return { inserted: true, offset, cf: false };
    }
    offset = (offset + 4) & 0xffff;
    if (offset >= 0x100) return { inserted: false, offset, cf: true };
  }
}

/** 237E entry: bounds are captured once before the fixed city scan. */
export function beginOriginalDisasterArea237E(io, strength) {
  strength = byte(strength, "237E", "AL strength");
  const maxX = bound(io, "maxX", "2383");
  const minX = bound(io, "minX", "2388");
  const maxY = bound(io, "maxY", "2393");
  const minY = bound(io, "minY", "2398");
  return {
    strength,
    centerX: (minX + (((maxX - minX) & 0xffff) >>> 1)) & 0xffff,
    centerY: (minY + (((maxY - minY) & 0xffff) >>> 1)) & 0xffff,
    index: 0,
    changed: false,
  };
}

/** 237E continuation: returns at each real player 8810 call boundary. */
export function continueOriginalDisasterArea237E(io, state) {
  if (
    !state ||
    !Number.isInteger(state.index) ||
    state.index < 0 ||
    state.index > 0xc0
  )
    stop("23A3", "invalid area continuation");
  for (let index = state.index; index < 0xc0; index++) {
    const x = cityWord(io, index, "x", "23AC");
    const y = cityWord(io, index, "y", "23B3");
    const dx =
      state.centerX >= x ? state.centerX - x : (x - state.centerX) & 0xffff;
    const dy =
      state.centerY >= y ? state.centerY - y : (y - state.centerY) & 0xffff;
    const distance = Math.max(dx, dy);
    state.index = index + 1;
    if (distance > 0x14) continue;
    const damage = Math.max(0, state.strength - ((distance & 0xff) >>> 1));
    call(io, "writeCityByte", [index, "disaster", damage], "23CF");
    if (damage === 0) continue;
    state.changed = true;
    const player = byte(
      call(io, "readPlayerFaction", [], "23D6"),
      "23D6",
      "player faction",
    );
    if (player !== cityByte(io, index, "owner", "23DB")) continue;
    return { status: "message", index, damage, state };
  }
  return { status: "return", changed: state.changed, state };
}

/** Synchronous 237E wrapper used where no Web message suspension is required. */
export function originalDisasterArea237E(io, strength) {
  const state = beginOriginalDisasterArea237E(io, strength);
  for (;;) {
    const result = continueOriginalDisasterArea237E(io, state);
    if (result.status === "return") return result.changed;
    call(io, "showAreaMessage", [result.index, result.damage], "23EC");
  }
}

/** 34A6 consumes exactly one RNG byte before entering 237E. */
export function beginOriginalDisasterAreaEvent34A6(io) {
  return beginOriginalDisasterArea237E(io, (rng(io, "34A6") & 0x0f) + 0x18);
}

/** 23FF: first status<80 slot, with original write order. */
export function originalDisasterObjectSpawn23FF(io, subtype, x, y) {
  subtype = byte(subtype, "23FF", "object subtype");
  x = word(x, "241F", "object X");
  y = word(y, "2422", "object Y");
  for (let slot = 0; slot < 16; slot++) {
    const status = byte(
      call(io, "readObjectByte", [slot, "status"], "2404"),
      "2404",
      "object status",
    );
    if (status >= 0x80) continue;
    call(io, "writeObjectByte", [slot, "status", 0x80], "2415");
    call(io, "writeObjectByte", [slot, "subtype", subtype], "2418");
    call(io, "writeObjectByte", [slot, "interval", 0x10], "241B");
    call(io, "writeObjectWord", [slot, "x", x], "241F");
    call(io, "writeObjectWord", [slot, "y", y], "2422");
    for (const [field, at] of [
      ["raw6", "2428"],
      ["raw7", "242B"],
      ["timer", "242E"],
      ["frame", "2431"],
    ])
      call(io, "writeObjectByte", [slot, field, 1], at);
    return { inserted: true, slot, cf: false };
  }
  return { inserted: false, slot: 16, cf: true };
}

/** 2438: clear status for every active object at the exact coordinates. */
export function originalDisasterObjectRemove2438(io, x, y) {
  x = word(x, "2441", "object X");
  y = word(y, "2446", "object Y");
  let removed = 0;
  for (let slot = 0; slot < 16; slot++) {
    const status = byte(
      call(io, "readObjectByte", [slot, "status"], "243C"),
      "243C",
      "object status",
    );
    if (status < 0x80) continue;
    const objectX = word(
      call(io, "readObjectWord", [slot, "x"], "2441"),
      "2441",
      "object X",
    );
    if (objectX !== x) continue;
    const objectY = word(
      call(io, "readObjectWord", [slot, "y"], "2446"),
      "2446",
      "object Y",
    );
    if (objectY !== y) continue;
    call(io, "writeObjectByte", [slot, "status", 0], "244B");
    removed++;
  }
  return removed;
}

/** 34B1 through its optional TALK71/72 boundary. */
export function beginOriginalDisasterObject34B1(io, subtype, cityPointer) {
  subtype = byte(subtype, "34B9", "event subtype");
  cityPointer = word(cityPointer, "34B1", "city pointer");
  const x = word(
    call(io, "readCityPointerWord", [cityPointer, "x"], "34B3"),
    "34B3",
    "city X",
  );
  const y = word(
    call(io, "readCityPointerWord", [cityPointer, "y"], "34B6"),
    "34B6",
    "city Y",
  );
  if (subtype === 0) {
    call(io, "writeCityPointerByte", [cityPointer, "disaster", 0], "34BD");
    originalDisasterObjectRemove2438(io, x, y);
    return { status: "return", changed: true, subtype, cityPointer };
  }
  if (!originalDisasterObjectSpawn23FF(io, subtype, x, y).inserted)
    return { status: "return", changed: false, subtype, cityPointer };
  const player = byte(
    call(io, "readPlayerFaction", [], "34CC"),
    "34CC",
    "player faction",
  );
  const owner = byte(
    call(io, "readCityPointerByte", [cityPointer, "owner"], "34D1"),
    "34D1",
    "city owner",
  );
  return {
    status: player === owner ? "message" : "continue",
    changed: true,
    subtype,
    cityPointer,
  };
}

/** 34EB suffix after a real message return, or immediately for an NPC city. */
export function continueOriginalDisasterObject34B1(io, state) {
  const damage = (rng(io, "34EB") & 7) + 4;
  call(
    io,
    "writeCityPointerByte",
    [state.cityPointer, "disaster", damage],
    "34F2",
  );
  const delay = (rng(io, "34F5") & 7) + 6;
  const queued = originalDelayedEnqueue301C(
    io,
    0x000c,
    state.cityPointer,
    delay,
  );
  return { status: "return", changed: true, damage, delay, queued };
}

/** 22DB: clear the prior non-global area, then optionally queue type11. */
export function originalMonthlyWeather22DB(io) {
  if (bound(io, "minX", "22E3") !== 0xfff0) {
    originalDisasterArea237E(io, 0);
    writeBound(io, "minX", 0xfff0, "22F0");
    writeBound(io, "minY", 0xfff0, "22F7");
    writeBound(io, "maxX", 0x0190, "22FE");
    writeBound(io, "maxY", 0x0190, "2305");
  }
  if ((rng(io, "230C") & 1) === 0) return false;
  const index = rng(io, "2313");
  if (index >= 0xc0) return false;
  if (cityByte(io, index, "xLow", "2324") < 0xc0 && (rng(io, "232B") & 1) === 0)
    return false;
  const delay = ((rng(io, "2333") & 7) + 8) << 2;
  if (!originalCurrentEnqueue2FBF(io, 0x000b, 0, delay).inserted) return false;
  let value = cityWord(io, index, "x", "234C");
  if ((value << 16) >> 16 >= 10) value = (value - 5) & 0xffff;
  writeBound(io, "minX", value, "2358");
  writeBound(io, "maxX", value + 10, "235F");
  value = cityWord(io, index, "y", "2363");
  if ((value << 16) >> 16 >= 10) value = (value - 5) & 0xffff;
  writeBound(io, "minY", value, "236F");
  writeBound(io, "maxY", value + 10, "2376");
  return true;
}

/** 2286: fixed 192 city records, first successful gate skips the second gate. */
export function originalMonthlyCityDisasters2286(io) {
  let inserted = 0;
  for (let index = 0; index < 0xc0; index++) {
    if (rng(io, "2297") < 0x18) {
      const roll = rng(io, "229E") & 0x3f;
      if (roll >= cityByte(io, index, "defence", "22A3")) {
        if (
          originalCurrentEnqueue2FBF(io, 0x010c, 0x0840 + index * 0x20, 0xff)
            .inserted
        )
          inserted++;
        continue;
      }
    }
    if (rng(io, "22B4") >= 0x18) continue;
    const roll = rng(io, "22BB") & 0x3f;
    if (roll < cityByte(io, index, "growth", "22C0")) continue;
    if (
      originalCurrentEnqueue2FBF(io, 0x020c, 0x0840 + index * 0x20, 0xff)
        .inserted
    )
      inserted++;
  }
  return inserted;
}

export function originalMonthlyWeatherEvents(io) {
  const areaQueued = originalMonthlyWeather22DB(io);
  const cityQueued = originalMonthlyCityDisasters2286(io);
  return { areaQueued, cityQueued };
}
