// KI D56:0000..03FF fixed 256×4-byte strategic event wheel.
const SLOT_COUNT = 256;
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new TypeError(`Invalid native strategic event ${label}`);
  return value;
};

export const hasNativeStrategicEventWheel = (sc) =>
  Array.isArray(sc?.strategicEventSlots) &&
  sc.strategicEventSlots.length === SLOT_COUNT;

function decodeSource(encoded) {
  if (
    typeof encoded !== "string" ||
    !new RegExp(`^[0-9a-f]{${SLOT_COUNT * 8}}$`, "i").test(encoded)
  )
    throw new TypeError("Invalid native strategic event raw wheel");
  return Array.from({ length: SLOT_COUNT }, (_, slot) => {
    const at = slot * 8;
    const bytes = Array.from({ length: 4 }, (_, i) =>
      Number.parseInt(encoded.slice(at + i * 2, at + i * 2 + 2), 16),
    );
    return bytes.every((value) => value === 0)
      ? null
      : { type: bytes[0], arg0: bytes[1], arg1: bytes[2], arg2: bytes[3] };
  });
}

export function assertNativeStrategicEventWheel(sc) {
  if (!Object.hasOwn(sc ?? {}, "strategicEventSlots")) return;
  const slots = sc.strategicEventSlots;
  if (!Array.isArray(slots) || slots.length !== SLOT_COUNT)
    throw new TypeError("Invalid native strategic event slot count");
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (!Object.hasOwn(slots, slot) || slots[slot] === undefined)
      throw new TypeError(`Invalid native strategic event slot ${slot}`);
    const event = slots[slot];
    if (event === null) continue;
    if (!event || typeof event !== "object" || Array.isArray(event))
      throw new TypeError(`Invalid native strategic event record ${slot}`);
    for (const field of ["type", "arg0", "arg1", "arg2"])
      byte(event[field], `${slot}.${field}`);
  }
}

export function initializeNativeStrategicEventWheel(sc) {
  if (Object.hasOwn(sc ?? {}, "strategicEventSlots"))
    throw new TypeError("Native strategic event wheel already initialized");
  sc.strategicEventSlots = decodeSource(sc?.nativeStrategicEventRaw);
  assertNativeStrategicEventWheel(sc);
}
