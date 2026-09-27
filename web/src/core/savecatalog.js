// Web storage identities, not DOS slot indices. Four placeholders preserve the
// original empty-list presentation; actual records have no four-slot limit.
export function assertSaveId(slot) {
  if (!Number.isSafeInteger(slot) || slot < 0)
    throw new TypeError('Invalid save identity');
  return slot;
}

export function emptySave(slot) {
  return { slot: assertSaveId(slot), label: '', played: false,
    scenario_idx: null, state: null, webMeta: null };
}

export function normalizeSaveSlots(value) {
  const byId = new Map();
  for (const entry of value?.slots ?? []) {
    assertSaveId(entry?.slot);
    if (byId.has(entry.slot)) throw new TypeError('Duplicate save identity');
    byId.set(entry.slot, { ...entry, played: Boolean(entry.played) });
  }
  for (let slot = 0; slot < 4; slot++)
    if (!byId.has(slot)) byId.set(slot, emptySave(slot));
  return { schema: 1, slots: [...byId.values()].sort((a, b) => a.slot - b.slot) };
}

export function nextSaveId(slots) {
  let last = 3;
  for (const entry of slots) last = Math.max(last, assertSaveId(entry.slot));
  return assertSaveId(last + 1);
}

export function saveChoices(slots = []) {
  const normalized = normalizeSaveSlots({ slots }).slots;
  return normalized.some((entry) => !entry.played)
    ? normalized : [...normalized, emptySave(nextSaveId(normalized))];
}

export function summarizeSave(saved) {
  const state = saved.state;
  return structuredClone({
    slot: assertSaveId(saved.slot), label: saved.label ?? '',
    played: Boolean(saved.played), scenario_idx: saved.scenario_idx ?? null,
    date: state?.save_date ?? null,
    faction: state?.factions?.[state?.player_faction]?.name ?? '',
    advisor: state?.player_advisor?.name ?? '',
    content: saved.webMeta?.scenarioAssembly ?? null,
  });
}
