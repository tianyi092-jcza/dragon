// Fixed-imported chapter projection, NOT a new initializer or release validator.
// Keep every shared field and every slot in the selected state; no IO/RNG.
import { validateGameSource, canonicalDigest } from "../content/authoring/gamesource.js";
export function projectTrialChapter(game, chapterId, sha256hex) {
  validateGameSource(game); // global JSON/IDs/map safety is never skipped
  if (typeof chapterId !== "string" || !chapterId || !Array.isArray(game.chapterOrder) ||
      new Set(game.chapterOrder).size !== game.chapterOrder.length ||
      !game.chapterOrder.includes(chapterId) || !Object.hasOwn(game.chapters, chapterId) || typeof sha256hex !== "function")
    throw new RangeError("unknown/ambiguous trial chapter scope");
  const savedSourceDigest = canonicalDigest(game, sha256hex);
  const selected = structuredClone(game);
  selected.chapterOrder = [chapterId];
  selected.chapters = Object.fromEntries([[chapterId, selected.chapters[chapterId]]]);
  // No general/asset/shared compatibility pruning: unused slots may be read by
  // native scripts. Source-record metadata is preserved, not an initializer.
  return { mode: "FIXED_IMPORTED_CHAPTER_PROJECTION", chapterId, savedSourceDigest,
    selectedSourceDigest: canonicalDigest(selected, sha256hex), selected };
}
