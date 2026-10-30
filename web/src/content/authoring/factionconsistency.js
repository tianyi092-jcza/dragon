// Web consistency guard, not a role initializer or additional rule permission.
// Reuse the actual fresh decoder; never mutate the declared view or fixed raw.
import { initializeNativeFactionSlots } from '../../game/nativefactions.js';

// Direct fields overwritten by fresh's Object.assign, including the four
// resources whose authoring writer synchronizes both sources. The count
// conversion at +18 and other unencoded fields are deliberately not invented.
const FIELDS = Object.freeze(['attr', 'monarch_idx', 'advisor_idx', 'capital',
  'strategic_city_primary', 'strategic_city_secondary', 'target_faction',
  'legion_morale_cap', 'talk_style', 'n_cities', 'bellicosity', 'diplomat_idx', 'march_marker_style',
  'money', 'reserve_cav', 'reserve_arc', 'reserve_inf']);
export function factionNativeConsistencyGaps(state, chapterId = '?') {
  // Absence is not a second initialization policy. Other admission gates still
  // own missing native dependencies; this guard compares two PRESENT sources.
  if (!state || !Object.hasOwn(state, 'nativeFactionSlotRaw')) return [];
  const captured = { factions: [], nativeFactionSlotRaw: state.nativeFactionSlotRaw };
  try { initializeNativeFactionSlots(captured); }
  catch { return [{ code: 'entity-native-source', subject: `chapter ${chapterId}`, message: 'native faction source must contain 22 valid fixed slots' }]; }
  const gaps = [], factions = Array.isArray(state.factions) ? state.factions : [];
  // The imported declaration is not the fixed 22-slot capacity. A tail removal
  // can retain prefix order while leaving this declaration and raw slots stale.
  // Compare an existing declaration only; do not invent missing initialization.
  if (Object.hasOwn(state, 'n_factions') && state.n_factions !== factions.length) gaps.push({
    code: 'entity-native-view', subject: `chapter ${chapterId}`,
    message: 'declared faction count differs from public view length; initialization edit unsupported',
  });
  for (const [index, faction] of factions.entries()) {
    const slot = faction?.idx;
    // Identity gaps have their own precise validator; do not guess a slot.
    if (!Number.isInteger(slot) || slot < 0 || slot > 21) continue;
    if (slot !== index) gaps.push({ code: 'entity-native-view', subject: `chapter ${chapterId} faction[${index}]`,
      message: `faction slot ${slot} is not declared position ${index}; native view order required`,
    });
    const native = captured.nativeFactionSlots.records[slot];
    for (const field of FIELDS) if (faction[field] !== native[field]) gaps.push({
      code: 'entity-native-mismatch', subject: `chapter ${chapterId} faction[${index}]`,
      message: `faction slot ${slot} ${field} differs from native source; initialization edit unsupported`,
    });
  }
  return gaps;
}
