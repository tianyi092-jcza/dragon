// CHAPTER-WB Web authoring choices, not a DOS relationship setter.
// KI 7A9A..7AC4: peaceful low7 0..100 -> five 20-point bands (100 -> band4).
// Representatives are existing upper-1 template cells, not guessed midpoints:
// 0->4=81, 4->5=96, 0->1=B7, 0->3=CC, 0->17=DD.
export const CHAPTER_DIPLOMACY_RELATIONS = Object.freeze([
  { id: 'worst', label: '最惡', value: 0x81 },
  { id: 'dangerous', label: '險惡', value: 0x96 },
  { id: 'ordinary', label: '普通', value: 0xb7 },
  { id: 'good', label: '良好', value: 0xcc },
  { id: 'close', label: '親密', value: 0xdd },
].map(Object.freeze));

export function chapterDiplomacyRelation(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError('diplomacy byte required');
  if (value < 128) return 'war';
  const score = value & 127;
  return score <= 100 ? CHAPTER_DIPLOMACY_RELATIONS[Math.floor(Math.min(score, 99) / 20)].id : 'unknown';
}

// Owns raw/declared-view agreement at authoring writes. No repair on read/write.
export function decodeChapterDiplomacy(state) {
  const encoded = state.nativeDiplomacyRaw;
  if (typeof encoded !== 'string' || !/^[0-9a-f]{1152}$/i.test(encoded)) throw new RangeError('complete native diplomacy matrix required');
  const rows = Array.from({ length: 24 }, (_, actor) => Array.from({ length: 24 }, (_, target) => {
    const offset = (actor * 24 + target) * 2;
    return Number.parseInt(encoded.slice(offset, offset + 2), 16);
  }));
  const width = state.factions.length;
  if (state.factions.some((faction, slot) => faction.idx !== slot)) throw new RangeError('diplomacy requires declared fixed-slot positions');
  if (!Array.isArray(state.diplomacy) || state.diplomacy.length !== width || state.diplomacy.some((row, actor) =>
    !Array.isArray(row) || row.length !== width || row.some((value, target) => value !== rows[actor][target])))
    throw new RangeError('declared diplomacy must match the native matrix');
  return rows;
}
