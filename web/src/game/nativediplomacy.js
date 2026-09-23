// KI D52:0600..083F fixed 24×24 directed diplomacy matrix.
// The declared diplomacy array is only a prefix view; native rules use rows.
const SIDE_COUNT = 24;
const has = (value, field) =>
  value != null && typeof value === "object" && Object.hasOwn(value, field);
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new TypeError(`Invalid native diplomacy ${label}`);
  return value;
};

export const hasNativeDiplomacyMatrix = (sc) =>
  has(sc, "nativeDiplomacyMatrix");

function rows(sc, at) {
  const table = sc?.nativeDiplomacyMatrix;
  if (table?.version !== 1 || !Array.isArray(table.rows))
    throw new RangeError(
      `Web engineering Uncovered native diplomacy matrix at ${at}`,
    );
  return table.rows;
}

function decodeSource(encoded) {
  if (
    typeof encoded !== "string" ||
    !new RegExp(`^[0-9a-f]{${SIDE_COUNT * SIDE_COUNT * 2}}$`, "i").test(encoded)
  )
    throw new TypeError("Invalid native diplomacy raw matrix");
  return Array.from({ length: SIDE_COUNT }, (_, actor) =>
    Array.from({ length: SIDE_COUNT }, (_, target) => {
      const index = (actor * SIDE_COUNT + target) * 2;
      return Number.parseInt(encoded.slice(index, index + 2), 16);
    }),
  );
}

export function assertNativeDiplomacyMatrix(sc) {
  if (!hasNativeDiplomacyMatrix(sc)) return;
  const table = rows(sc, "schema");
  if (table.length !== SIDE_COUNT)
    throw new TypeError("Invalid native diplomacy row count");
  for (let actor = 0; actor < SIDE_COUNT; actor++) {
    const row = table[actor];
    if (!Array.isArray(row) || row.length !== SIDE_COUNT)
      throw new TypeError(`Invalid native diplomacy row ${actor}`);
    for (let target = 0; target < SIDE_COUNT; target++)
      byte(row[target], `${actor}->${target}`);
  }
}

export function nativeDiplomacyAt(sc, actor, target, at) {
  byte(actor, "actor");
  byte(target, "target");
  if (actor >= SIDE_COUNT || target >= SIDE_COUNT)
    throw new RangeError(
      `Web engineering Uncovered diplomacy cell ${actor}->${target} at ${at}`,
    );
  return byte(rows(sc, at)[actor][target], `${actor}->${target}`);
}

export function writeNativeDiplomacyAt(sc, actor, target, value, at) {
  nativeDiplomacyAt(sc, actor, target, at);
  rows(sc, at)[actor][target] = byte(value, `${actor}->${target}`);
}

export function initializeNativeDiplomacyMatrix(sc) {
  if (hasNativeDiplomacyMatrix(sc))
    throw new TypeError("Native diplomacy matrix already initialized");
  const table = decodeSource(sc?.nativeDiplomacyRaw);
  if (!Array.isArray(sc?.factions) || sc.factions.length > 22)
    throw new TypeError("Invalid declared faction table for diplomacy");
  if (
    !Array.isArray(sc.diplomacy) ||
    sc.diplomacy.length !== sc.factions.length
  )
    throw new TypeError("Invalid declared diplomacy view");
  const declared = sc.diplomacy.length;
  for (let actor = 0; actor < declared; actor++) {
    const view = sc.diplomacy[actor];
    if (!Array.isArray(view) || view.length !== declared)
      throw new TypeError(`Invalid declared diplomacy row ${actor}`);
    for (let target = 0; target < declared; target++)
      if (byte(view[target], `${actor}->${target}`) !== table[actor][target])
        throw new TypeError(`Divergent native diplomacy ${actor}->${target}`);
  }
  sc.nativeDiplomacyMatrix = { version: 1, rows: table };
  // Full rows retain fixed columns while the outer array remains the declared
  // prefix. Shared row objects keep legacy UI reads/writes on that prefix live.
  sc.diplomacy = table.slice(0, declared);
  assertNativeDiplomacyMatrix(sc);
}

export function rebindNativeDiplomacyViews(sc) {
  assertNativeDiplomacyMatrix(sc);
  if (!Array.isArray(sc?.factions) || !Array.isArray(sc.diplomacy))
    throw new TypeError("Missing declared diplomacy views");
  const declared = sc.factions.length;
  if (declared > 22 || sc.diplomacy.length !== declared)
    throw new TypeError("Invalid declared diplomacy view count");
  const table = rows(sc, "rebind");
  for (let actor = 0; actor < declared; actor++) {
    const view = sc.diplomacy[actor];
    if (!Array.isArray(view) || view.length !== SIDE_COUNT)
      throw new TypeError(`Invalid declared diplomacy row ${actor}`);
    for (let target = 0; target < SIDE_COUNT; target++)
      if (byte(view[target], `${actor}->${target}`) !== table[actor][target])
        throw new TypeError(`Divergent native diplomacy ${actor}->${target}`);
    table[actor] = view;
  }
}
