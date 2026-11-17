// Strict KI.EXE weather/event leaves.
import { originalDelayedEnqueue301C } from "./originallegionfate.js";
import { queueOverflowRecord } from "./strategiceventschedule.js";
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

/** 2FBF: current 0x100-byte page only; CF reports insertion failure.
 * D2-EVENT-64: a refused record may still be *accepted* into the Web schedule
 * (D5). `inserted` stays the original four-byte write truth; `accepted` is the
 * producer-facing "Web took it"; `overflow` is the scheduled entry, if any. */
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
  const refuse = (at, pageFull) => {
    const overflow = queueOverflowRecord(io, ax, dx, { offset: at, pageFull });
    return {
      inserted: false,
      accepted: overflow !== null,
      offset: at,
      cf: true,
      overflow,
    };
  };
  if (offset >= 0x100) return refuse(offset, false);

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
      // Web-only hook (D2-EVENT-64): adapters attach D6/D7 metadata keyed by
      // the absolute slot the record landed in. No original byte changes.
      if (typeof io.noteEventPlacement === "function")
        io.noteEventPlacement({ offset, ax, dx });
      return {
        inserted: true,
        accepted: true,
        offset,
        cf: false,
        overflow: null,
      };
    }
    offset = (offset + 4) & 0xffff;
    if (offset >= 0x100) return refuse(0x100, true);
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
/** 34B1 entry. `expectedGeneration` is the Web-only D7 guard: a clear event
 * only owns the disaster it was produced for, so a newer disaster (higher
 * generation) is left untouched. Unbound (null) keeps the original behavior. */
export function beginOriginalDisasterObject34B1(
  io,
  subtype,
  cityPointer,
  expectedGeneration = null,
) {
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
    if (expectedGeneration !== null) {
      const generation = call(
        io,
        "readCityPointerGeneration",
        [cityPointer],
        "34BD",
      );
      if (generation !== expectedGeneration)
        return {
          status: "return",
          changed: false,
          skipped: true,
          subtype,
          cityPointer,
        };
    }
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

/** 22DB: clear the prior non-global area, then optionally queue type11.
 * D4 live sampling (Web产品决定，非原版机制，用户B4批准实施；
 * N=193..256用k=2为用户2026-11-明确决定，使顶槽可达，替代提案最小byte
 * 规则在该区间的顶槽不可达；N<=192逐字节一致不变）。
 * 选城按live城市数N抽样。B=256^k为容纳N的byte空间（N<=192时k=1；
 * N>=193时k=2），k个原RNG byte
 * （大端序，先耗高位）组成r；接受r<floor(B*3/4)后选floor(r*N/floor(B*3/4))，
 * 否则按原`index>=0xc0`语义返回false。N=192且k=1时接受0..191且index=r，
 * 与旧单字节读取逐字节一致；xLow门、1/2门与bounds写回保持原样。 */
function originalRegionalCityIndex2313(io, count) {
  if (!Number.isInteger(count) || count < 1 || count > 512) stop("2313", "live city count out of range");
  const width = count <= 192 ? 1 : 2, space = width === 1 ? 256 : 65536;
  const cap = Math.floor((space * 3) / 4);
  let sample = 0;
  for (let position = 0; position < width; position++)
    sample = sample * 256 + rng(io, position === 0 ? "2313" : `2313+${position}`);
  if (sample >= cap) return -1;
  return Math.floor((sample * count) / cap);
}
export function originalMonthlyWeather22DB(io) {
  if (bound(io, "minX", "22E3") !== 0xfff0) {
    originalDisasterArea237E(io, 0);
    writeBound(io, "minX", 0xfff0, "22F0");
    writeBound(io, "minY", 0xfff0, "22F7");
    writeBound(io, "maxX", 0x0190, "22FE");
    writeBound(io, "maxY", 0x0190, "2305");
  }
  if ((rng(io, "230C") & 1) === 0) return false;
  const index = originalRegionalCityIndex2313(io, call(io, "readCityCount", [], "2313N"));
  if (index < 0) return false;
  if (cityByte(io, index, "xLow", "2324") < 0xc0 && (rng(io, "232B") & 1) === 0)
    return false;
  const delay = ((rng(io, "2333") & 7) + 8) << 2;
  const area = originalCurrentEnqueue2FBF(io, 0x000b, 0, delay);
  // D5: the producer-facing acceptance is "the Web took it" (wheel or
  // schedule); `inserted` alone no longer means the event was dropped.
  if (!area.inserted && !area.accepted) return false;
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

/** 2286: fixed 192 city records at N=192; live city count beyond (D2-capacity
 * slice: new cities join the monthly disaster scan. Web产品决定，非原版机制).
 * First successful gate skips the second gate; per-city RNG order unchanged. */
export function originalMonthlyCityDisasters2286(io) {
  const total = call(io, "readCityCount", [], "2286N");
  if (!Number.isInteger(total) || total < 1 || total > 512) stop("2286N", "live city count out of range");
  let inserted = 0;
  for (let index = 0; index < total; index++) {
    if (rng(io, "2297") < 0x18) {
      const roll = rng(io, "229E") & 0x3f;
      if (roll >= cityByte(io, index, "defence", "22A3")) {
        const fire = originalCurrentEnqueue2FBF(
          io,
          0x010c,
          0x0840 + index * 0x20,
          0xff,
        );
        if (fire.inserted || fire.accepted) inserted++;
        continue;
      }
    }
    if (rng(io, "22B4") >= 0x18) continue;
    const roll = rng(io, "22BB") & 0x3f;
    if (roll < cityByte(io, index, "growth", "22C0")) continue;
    const riot = originalCurrentEnqueue2FBF(
      io,
      0x020c,
      0x0840 + index * 0x20,
      0xff,
    );
    if (riot.inserted || riot.accepted) inserted++;
  }
  return inserted;
}

export function originalMonthlyWeatherEvents(io) {
  const areaQueued = originalMonthlyWeather22DB(io);
  const cityQueued = originalMonthlyCityDisasters2286(io);
  return { areaQueued, cityQueued };
}
