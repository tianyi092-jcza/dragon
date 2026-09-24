// KI D52:0080..05FF fixed 22×40h faction-slot ownership.
// Initialization provenance is nativeFactionSlotRaw; runtime truth is this table.
const SLOT_COUNT = 22;
const has = (value, field) =>
  value != null && typeof value === "object" && Object.hasOwn(value, field);
const integer = (value, min, max, field) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError(`Invalid native faction ${field}`);
  return value;
};
const byte = (raw, offset) => raw[offset];
const word = (raw, offset) => raw[offset] | (raw[offset + 1] << 8);
const signed24 = (raw, offset) => {
  const value = word(raw, offset) | (raw[offset + 2] << 16);
  return value & 0x800000 ? value - 0x1000000 : value;
};
const unsigned24 = (raw, offset) => word(raw, offset) | (raw[offset + 2] << 16);
const nullable = (value, sentinel = 0xff) =>
  value === sentinel ? null : value;

function decodeSlot(encoded, slot) {
  if (typeof encoded !== "string" || !/^[0-9a-f]{128}$/i.test(encoded))
    throw new TypeError(`Invalid native faction raw slot ${slot}`);
  const raw = Uint8Array.from({ length: 64 }, (_, index) =>
    Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16),
  );
  return {
    idx: slot,
    attr: byte(raw, 0),
    active: byte(raw, 0) >= 0x80,
    monarch_idx: byte(raw, 1),
    advisor_idx: nullable(byte(raw, 2), 0x7f),
    capital: nullable(byte(raw, 3)),
    reserve_cav: word(raw, 4),
    reserve_arc: word(raw, 6),
    reserve_inf: word(raw, 8),
    n_legions: byte(raw, 0x14),
    strategic_city_primary: nullable(byte(raw, 0x16)),
    strategic_city_secondary: nullable(byte(raw, 0x17)),
    nativeGeneralCount: byte(raw, 0x18),
    target_faction: nullable(byte(raw, 0x19)),
    monthly_reserve_upkeep: unsigned24(raw, 0x1a),
    legion_morale_cap: byte(raw, 0x1d),
    talk_style: byte(raw, 0x1e),
    money: signed24(raw, 0x20),
    n_cities: byte(raw, 0x23),
    bellicosity: byte(raw, 0x28),
    diplomat_idx: nullable(byte(raw, 0x2a)),
    march_marker_style: byte(raw, 0x3e),
    raw: encoded.toLowerCase(),
  };
}

export const hasNativeFactionSlots = (sc) => has(sc, "nativeFactionSlots");

function records(sc, at) {
  const table = sc?.nativeFactionSlots;
  if (table?.version !== 1 || !Array.isArray(table.records))
    throw new RangeError(
      `Web engineering Uncovered native faction table at ${at}`,
    );
  return table.records;
}

export function nativeFactionAt(sc, slot, at) {
  integer(slot, 0, SLOT_COUNT - 1, "slot");
  const value = records(sc, at)[slot];
  if (!value || value.idx !== slot)
    throw new RangeError(
      `Web engineering Uncovered faction slot ${slot} at ${at}`,
    );
  return value;
}

export function assertNativeFactionSlots(sc) {
  if (!hasNativeFactionSlots(sc)) return;
  const table = records(sc, "schema");
  if (table.length !== SLOT_COUNT)
    throw new TypeError("Invalid native faction slot count");
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const faction = table[slot];
    if (!faction || faction.idx !== slot)
      throw new TypeError(`Invalid native faction slot ${slot}`);
    integer(faction.attr, 0, 255, "attr");
    for (const field of [
      "monarch_idx",
      "n_legions",
      "nativeGeneralCount",
      "legion_morale_cap",
      "talk_style",
      "bellicosity",
      "march_marker_style",
    ])
      if (Object.hasOwn(faction, field)) integer(faction[field], 0, 255, field);
    for (const field of ["reserve_cav", "reserve_arc", "reserve_inf"])
      integer(faction[field], 0, 65535, field);
    integer(faction.money, -0x800000, 0x7fffff, "money");
    integer(faction.n_cities, 0, 255, "n_cities");
    integer(
      faction.monthly_reserve_upkeep,
      0,
      0xffffff,
      "monthly_reserve_upkeep",
    );
    for (const field of [
      "advisor_idx",
      "capital",
      "strategic_city_primary",
      "strategic_city_secondary",
    ]) {
      if (!Object.hasOwn(faction, field)) continue;
      if (faction[field] !== null) integer(faction[field], 0, 255, field);
    }
    for (const field of ["target_faction", "diplomat_idx"])
      if (faction[field] !== null) integer(faction[field], 0, 255, field);
  }
}

export function initializeNativeFactionSlots(sc) {
  if (hasNativeFactionSlots(sc))
    throw new TypeError("Native faction table already initialized");
  const source = sc?.nativeFactionSlotRaw;
  if (!Array.isArray(source) || source.length !== SLOT_COUNT)
    throw new TypeError("Missing 22-slot native faction source");
  if (!Array.isArray(sc.factions) || sc.factions.length > SLOT_COUNT)
    throw new TypeError("Invalid declared faction table");
  const table = source.map(decodeSlot);
  for (let slot = 0; slot < sc.factions.length; slot++) {
    const current = sc.factions[slot];
    if (!current || current.idx !== slot)
      throw new TypeError(`Invalid declared faction slot ${slot}`);
    Object.assign(current, table[slot]);
    table[slot] = current;
  }
  sc.nativeFactionSlots = { version: 1, records: table };
  assertNativeFactionSlots(sc);
}

export function rebindNativeFactionViews(sc) {
  assertNativeFactionSlots(sc);
  if (!Array.isArray(sc.factions))
    throw new TypeError("Missing declared faction views");
  const table = records(sc, "rebind");
  const fields = [
    "attr",
    "monarch_idx",
    "advisor_idx",
    "capital",
    "reserve_cav",
    "reserve_arc",
    "reserve_inf",
    "n_legions",
    "strategic_city_primary",
    "strategic_city_secondary",
    "nativeGeneralCount",
    "target_faction",
    "monthly_reserve_upkeep",
    "legion_morale_cap",
    "talk_style",
    "money",
    "n_cities",
    "bellicosity",
    "diplomat_idx",
    "march_marker_style",
  ];
  for (let slot = 0; slot < sc.factions.length; slot++) {
    const view = sc.factions[slot],
      stored = table[slot];
    if (!view || view.idx !== slot)
      throw new TypeError(`Invalid declared faction view ${slot}`);
    if (view !== stored)
      for (const field of fields)
        if (view[field] !== stored[field])
          throw new TypeError(`Divergent native faction ${slot}.${field}`);
    table[slot] = view;
  }
}

/**
 * KI 1B17-equivalent (`MOV CS:[CFD],BX`, custom-data §6.1): CFD is the
 * player faction slot pointer (slot*0x40), written once at player
 * selection together with CFF, never inferred mid-game from CFF
 * (world.js template hygiene keeps it absent until here). FFFF
 * (absent here) means unselected: leave absent, consumption fail-closes.
 * Runs at loadState after initPlayer resolves CFF, so one binding point
 * covers fresh assembly and snapshot restore alike (“与0F同时重建”).
 */
export function bindNativePlayerFactionPointer(sc, at) {
  if (!hasNativeFactionSlots(sc)) return false;
  const player = sc?.player_faction;
  if (player == null) return false;
  const table = records(sc, at);
  const slot = table.findIndex(
    (record) => record && record.idx === player,
  );
  if (
    !Number.isInteger(player) ||
    slot < 0 ||
    slot >= (sc.factions?.length ?? 0)
  )
    throw new RangeError(
      `Web engineering Uncovered native player faction slot at ${at}`,
    );
  sc.nativePlayerFactionPointer = slot * 0x40;
  return true;
}
