// Faction +14 is a stored byte, not a fresh count of the Web live list.
// KI 6F57/6F5C increments only on inactive-slot activation; 4689/4693
// decrements with byte wrap (4658, 2997, or active-only 29E2 callers).
export function factionLegionCount(faction) {
  const value = faction?.n_legions;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new TypeError("Missing or invalid faction +14 legion count");
  }
  return value;
}

// Only for fresh content, never for recovering a running/saved counter
// from a stale raw mirror. Named content takes precedence over raw bytes.
export function initializeFactionLegionCounts(sc) {
  for (const faction of sc.factions) {
    if (faction.n_legions == null) {
      const rawByte = faction.raw?.slice(0x14 * 2, 0x15 * 2);
      if (typeof rawByte !== "string" || !/^[0-9a-f]{2}$/i.test(rawByte)) {
        throw new TypeError("Fresh content is missing faction +14");
      }
      faction.n_legions = Number.parseInt(rawByte, 16);
    }
    factionLegionCount(faction);
  }
}

// Invoke BEFORE inserting/replacing the active record. All active slots
// have a Web record; absent/inactive slots do not satisfy 6F57's >=80 gate.
export function countLegionActivation(sc, legion) {
  if (sc.legions.some((old) => old.slot === legion.slot && old.status >= 0x80))
    return;
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  faction.n_legions = (factionLegionCount(faction) + 1) & 255;
}

// The caller owns the original eligibility gate. 4651/2977 are unconditional;
// 29C3 invokes 4689 only when its old legion status is >=80.
export function countLegionRemoval(sc, legion) {
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  faction.n_legions = (factionLegionCount(faction) - 1) & 255;
}
