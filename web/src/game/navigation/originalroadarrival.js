// KI 28F4, 4300, 4325..4501, 4548 and city prefix 3F06..3F50.
// Exact wrapped aliases/lazy instruction boundaries: march notes §3.13.
const u16 = (value) => value & 0xffff;
function stop(label) {
  throw new RangeError(`Web engineering Uncovered ${label}`);
}
function unsigned(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) stop(label);
  return value;
}
const byte = (value, label) => unsigned(value, 255, label);
const word = (value, label) => unsigned(value, 65535, label);
function cityAtPointer(sc, pointer, instruction) {
  const offset = pointer - 0x840,
    index = offset / 32;
  if (
    offset < 0 ||
    offset % 32 ||
    index >= 192 ||
    sc.cities?.[index]?.idx !== index
  )
    stop(`city pointer ${pointer} at ${instruction}`);
  return sc.cities[index];
}
function factionAt(sc, owner, instruction) {
  if (!Number.isInteger(owner) || owner < 0 || owner >= 24)
    stop(`faction ${owner} at ${instruction}`);
  const faction = sc.factions?.find((record) => record?.idx === owner);
  if (!faction) stop(`faction ${owner} at ${instruction}`);
  return faction;
}
const encodedOrder = (value, at) =>
  value === null ? 255 : byte(value, `faction order at ${at}`);
function cacheCapability(context, at) {
  if (!context.cityCache) stop(`city cache capability at ${at}`);
  return context.cityCache;
}
export function readOriginalCityCache(context, index, at) {
  return cacheCapability(context, at).readByte(index);
}
function cacheAt(sc, context, address, at) {
  const city = cityAtPointer(sc, u16(address - 0x18), at);
  return readOriginalCityCache(context, city.idx, at);
}
function aliasedByte(sc, context, address) {
  address = u16(address);
  if (address >= 0x600 && address < 0x840) {
    const offset = address - 0x600;
    return byte(
      sc.diplomacy?.[Math.floor(offset / 24)]?.[offset % 24],
      `diplomacy ${address} at 43D3`,
    );
  }
  // 43D3 k=0..47: DI=k*0x20 (28F4: DI=BX*4, BX=idx*8), read [DI+0x18].
  // 偶k → 势力[k/2]+0x18（F18 武将数，live nativeGeneralCount）；
  // 奇k → 势力[k/2]+0x38（无直接位移写者，静态初值；别名指针写不可静态排除）。
  if (address < 0x600) {
    const faction = factionAt(sc, address >>> 6, "43D3 faction alias");
    const offset = address & 0x3f;
    if (offset === 0x18)
      return byte(faction.nativeGeneralCount, "faction F18 at 43D3");
    if (offset === 0x38) {
      const raw = faction.raw;
      const value =
        typeof raw === "string" && raw.length === 128
          ? Number.parseInt(raw.slice(0x38 * 2, 0x38 * 2 + 2), 16)
          : Number.NaN;
      return byte(value, "faction +38 raw at 43D3");
    }
    stop(`faction alias offset ${offset} at 43D3`);
  }
  return cacheAt(sc, context, address, "43D3");
}

/** 4300 returns mutated BX even on CLC; only STC re-enters 266A. */
export function interceptOriginalRoad4300(sc, context, io, bx) {
  bx = u16(bx * 4);
  if (cacheAt(sc, context, u16(bx + 0x858), "4304") > 1)
    return { cf: false, bx };
  if (io.readByte(8) === 4) return { cf: false, bx };
  const city = cityAtPointer(sc, u16(bx + 0x840), "4311");
  if (byte(city.attr, "city attr at 4311") < 0x80) return { cf: false, bx };
  bx = u16(bx * 8);
  io.writeByte(0x20, bx >>> 8);
  return { cf: true, bx };
}

/** One handler only. A normal return is owned by the original slot pump. */
export function arriveOriginalRoad(sc, context, io, bx, rng) {
  const { readByte: rb, readWord: rw, writeByte: wb, writeWord: ww } = io;
  wb(8, 4); // 266A, before either owner read or unknown 291A.
  const di = u16(bx * 4);
  const owner = rb(1);
  const cityOwner = context.readCityOwnerByte(u16(di + 0x841));
  if (owner !== cityOwner) {
    const targetAddress = rb(0x20) * 8;
    if (targetAddress === bx) {
      if (typeof io.fate !== "function") stop("291A at 2912");
      io.fate(targetAddress & 255); // AL, NOT the city owner; 2915 returns STC.
    }
  }
  // 2671 is unconditional after 28F4 returns, regardless of its CF.
  const target = rb(0x20),
    pointer = 0x840 + target * 32;
  let handler = rb(0x23);
  if (handler < 8 && byte(sc.player_faction, "player at 4342") !== rb(1))
    handler += 4;
  if (handler >= 12) stop("4325 dispatch table at 434F");
  const attr = (at) =>
    byte(cityAtPointer(sc, pointer, at).attr, `city attr at ${at}`);
  const capital = (faction, at) => encodedOrder(faction.capital, at);
  function targetCoordinates(cityPointer) {
    const city = cityAtPointer(sc, cityPointer, "4549");
    const x = word(city.x, "city X at 4549"),
      y = word(city.y, "city Y at 454C");
    const node = u16(cityPointer - 0x840) >>> 2;
    const equal = rw(0x10) === x && rw(0x12) === y && rw(0x0e) === node;
    ww(0x16, x);
    ww(0x18, y);
    ww(0x14, node);
    return equal;
  }
  function decrementCache(at) {
    const index = cityAtPointer(sc, pointer, at).idx;
    const cache = cacheCapability(context, at);
    cache.writeByte(index, (cache.readByte(index) - 1) & 255);
  }
  if (handler <= 3) {
    wb(0x23, 0);
    if (
      targetCoordinates(pointer) &&
      rw(4) < 600 &&
      target === capital(factionAt(sc, sc.player_faction, "438E"), "4393")
    )
      wb(0x23, 9);
  } else if (handler === 4) {
    if (targetCoordinates(pointer) && !(attr("43A5") & 0x40)) wb(0x23, 1);
  } else if (handler === 5) {
    if (rw(0x0e) >= 0x800) wb(0x23, 0);
    else if (rw(4) <= 300) wb(0x23, 10);
    else if (attr("43C9") & 0x40) wb(0x23, 0);
    else if (attr("43CE") < 0x80 || aliasedByte(sc, context, di + 0x18) > 2) {
      if (typeof rng?.nextByte !== "function") stop("canonical RNG at 43D9");
      wb(0x0b, (byte(rng.nextByte(), "RNG byte at 43D9") & 7) + 1);
      wb(0x23, 2);
    } else if (
      rw(4) < 600 &&
      target === capital(factionAt(sc, rb(1), "43F8"), "4405")
    )
      wb(0x23, 9);
  } else if (handler === 6) {
    if (
      attr("4411") & 0x40 ||
      (attr("4416") >= 0x80 &&
        cacheAt(sc, context, pointer + 0x18, "441B") <= 1)
    ) {
      wb(0x23, 1);
    } else {
      const faction = factionAt(sc, rb(1), "442F");
      let order = 255;
      if (!(byte(faction.attr, "faction attr at 442F") & 0x40)) {
        order = encodedOrder(faction.strategic_city_secondary, "4436");
        faction.strategic_city_secondary = 255;
      }
      if (order === 255) {
        order = encodedOrder(faction.strategic_city_primary, "443F");
        faction.strategic_city_primary = 255;
      }
      if (order !== 255) {
        if (rb(0x20) !== order) {
          wb(0x20, order);
          wb(0, rb(0) | 2);
        }
        wb(0x23, 0);
        decrementCache("4455");
      } else if (attr("4459") < 0x80) {
        wb(0x23, 11);
        decrementCache("4462");
      }
    }
  } else if (handler === 7) {
    for (let index = 0; index < 6; index++) {
      // Web team troops are persons; KI +29 is tens. No defaults or rounding.
      const troops = io.readTeamTroops(index);
      if (troops < 30) {
        wb(0x23, 11);
        return "arrived";
      }
    }
    wb(0x23, 8);
  } else if (handler === 8) {
    const cap = byte(
      factionAt(sc, rb(1), "448C").legion_morale_cap,
      "faction morale cap at 448C",
    );
    if (rb(6) >= cap) wb(0x23, 1);
  } else if (handler === 9) {
    if (typeof io.replenish !== "function") stop("461D at 4499");
    io.replenish(); // 4499→461D then 449C→6FD2, with immediate partial writes.
    wb(0x23, 3);
    // Approved Web projection ONLY for 5E80/AL8: no rule writes/RNG/wait.
    // The owning slot pump already requests the read-only HUD/view refresh.
    // This does not synthesize the DOS 98A6 gate or emulate VGA registers.
    return "reserves-refreshed";
  } else {
    const city = capital(
      factionAt(sc, rb(1), handler === 10 ? "44B2" : "44DF"),
      "capital",
    );
    if (rb(0x20) !== city) {
      wb(0x20, city);
      wb(0, rb(0) | 2);
    }
    if (targetCoordinates(0x840 + city * 32)) {
      if (handler === 10) wb(0x23, 9);
      else {
        if (typeof io.disband !== "function") stop("463E at 44FE");
        io.disband();
      }
    }
  }
  return "arrived";
}

/** Explicit detached city inputs; never backfill from raw/current owner. */
export function refreshOriginalCityCache(sc, context, city) {
  const cooldown = byte(city._aiCooldown, "city cooldown at 3F06");
  if (cooldown) city._aiCooldown = cooldown - 1;
  const oldOwner = byte(city._strategicLastFaction, "city old owner at 3F11");
  const owner = context.readCityOwnerByte(0x841 + city.idx * 32);
  if (oldOwner !== owner)
    factionAt(sc, oldOwner, "3F29").strategic_city_secondary = city.idx;
  const y = word(city.y, "city Y at 3F2C"),
    row = u16(y * 24);
  const x = word(city.x, "city X at 3F43");
  if (!context.movement) stop("movement capability at 3F47");
  // Wrapped far-segment aliases outside the canonical plane remain unknown.
  if (y > 255) stop("city row alias at 3F47");
  const value = context.movement.readByte(row, x) & 0x7f;
  cacheCapability(context, "3F4C").writeByte(city.idx, value);
}
