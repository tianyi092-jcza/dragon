// KI CS:D08..D17 fixed 16-byte current/next monthly policy block.
// Named Web fields are presentation views (conscription is displayed in people,
// while the original words store units of ten); native rules use this byte table.
const POLICY_SIZE = 0x10;
const has = (value, field) =>
  value != null && typeof value === "object" && Object.hasOwn(value, field);
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new TypeError(`Invalid native monthly policy ${label}`);
  return value;
};
const word = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    throw new TypeError(`Invalid native monthly policy ${label}`);
  return value;
};

export const hasNativeMonthlyPolicy = (sc) => has(sc, "nativeMonthlyPolicy");

function bytes(sc, at) {
  const state = sc?.nativeMonthlyPolicy;
  if (state?.version !== 1 || !Array.isArray(state.bytes))
    throw new RangeError(
      `Web engineering Uncovered native monthly policy at ${at}`,
    );
  return state.bytes;
}

function decodeSource(encoded) {
  if (
    typeof encoded !== "string" ||
    !new RegExp(`^[0-9a-f]{${POLICY_SIZE * 2}}$`, "i").test(encoded)
  )
    throw new TypeError("Invalid native monthly policy raw block");
  return Array.from({ length: POLICY_SIZE }, (_, index) =>
    Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16),
  );
}

function readWord(raw, offset, label) {
  if (!Number.isInteger(offset) || offset < 0 || offset + 1 >= POLICY_SIZE)
    throw new RangeError(`Invalid native monthly policy ${label} offset`);
  return (
    byte(raw[offset], `${label}.lo`) |
    (byte(raw[offset + 1], `${label}.hi`) << 8)
  );
}

function expectedViews(raw) {
  return {
    tax: byte(raw[0], "D08"),
    conscription: [2, 4, 6].map(
      (offset) =>
        readWord(raw, offset, `D${(0x08 + offset).toString(16)}`) * 10,
    ),
    nextTax: byte(raw[8], "D10"),
    nextConscription: [10, 12, 14].map(
      (offset) =>
        readWord(raw, offset, `D${(0x08 + offset).toString(16)}`) * 10,
    ),
  };
}

function assertNamedViews(sc, raw) {
  const expected = expectedViews(raw);
  if (sc.tax !== expected.tax || sc.next_tax !== expected.nextTax)
    throw new TypeError("Divergent native monthly tax view");
  for (const [field, values] of [
    ["conscription", expected.conscription],
    ["next_conscription", expected.nextConscription],
  ]) {
    const view = sc[field];
    if (!Array.isArray(view) || view.length !== 3)
      throw new TypeError(`Invalid native monthly policy ${field} view`);
    for (let index = 0; index < 3; index++)
      if (view[index] !== values[index])
        throw new TypeError(
          `Divergent native monthly policy ${field}[${index}]`,
        );
  }
}

export function assertNativeMonthlyPolicy(sc) {
  if (!hasNativeMonthlyPolicy(sc)) return;
  const raw = bytes(sc, "schema");
  if (raw.length !== POLICY_SIZE)
    throw new TypeError("Invalid native monthly policy byte count");
  for (let index = 0; index < POLICY_SIZE; index++) {
    if (!Object.hasOwn(raw, index))
      throw new TypeError(`Invalid native monthly policy byte ${index}`);
    byte(raw[index], `byte ${index}`);
  }
  assertNamedViews(sc, raw);
}

export function initializeNativeMonthlyPolicy(sc) {
  if (hasNativeMonthlyPolicy(sc))
    throw new TypeError("Native monthly policy already initialized");
  const raw = decodeSource(sc?.nativeMonthlyPolicyRaw);
  assertNamedViews(sc, raw);
  sc.nativeMonthlyPolicy = { version: 1, bytes: raw };
  assertNativeMonthlyPolicy(sc);
}

export function nativeMonthlyPolicyByte(sc, offset, at) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= POLICY_SIZE)
    throw new RangeError(`Invalid native monthly policy byte offset at ${at}`);
  return byte(bytes(sc, at)[offset], `byte ${offset}`);
}

export function nativeMonthlyPolicyWord(sc, offset, at) {
  return readWord(bytes(sc, at), offset, at);
}

export function writeNativeMonthlyPolicyWord(sc, offset, value, at) {
  const raw = bytes(sc, at);
  const next = word(value, at);
  if (!Number.isInteger(offset) || offset < 0 || offset + 1 >= POLICY_SIZE)
    throw new RangeError(`Invalid native monthly policy word offset at ${at}`);
  raw[offset] = next & 0xff;
  raw[offset + 1] = next >>> 8;
}

/** Refresh scalar/array Web views only after original writes have committed. */
export function refreshNativeMonthlyPolicyViews(sc) {
  const expected = expectedViews(bytes(sc, "refresh views"));
  sc.tax = expected.tax;
  sc.conscription = expected.conscription;
  sc.next_tax = expected.nextTax;
  sc.next_conscription = expected.nextConscription;
  assertNativeMonthlyPolicy(sc);
}
