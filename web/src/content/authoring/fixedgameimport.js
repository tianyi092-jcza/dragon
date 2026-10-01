// Controlled fixed-input import, not an editor authority/write bypass.
// Any identity receives the same GameSource validation and game compiler.
import { canonicalDigest, validateGameSource, GAMESOURCE_SCHEMA, GAME_RULE_PROFILE } from "./gamesource.js";
import { deriveSlots } from "./roadedit.js";

export function importFixedGameSource(input, sha256hex) {
  if (typeof input?.gameId !== "string" || typeof input.revision !== "string" || !input.revision ||
      !Array.isArray(input.chapters) || !input.world || !input.map) throw new TypeError("fixed source input required");
  const source = structuredClone(input);
  const game = { schemaVersion: GAMESOURCE_SCHEMA, gameId: source.gameId, ruleProfile: GAME_RULE_PROFILE,
    sourceRef: { kind: "controlled-fixed-map-import", sourceId: source.gameId, revision: source.revision,
      digest: canonicalDigest(source, sha256hex) },
    metadata: { name: source.name ?? "", introduction: "Controlled fixed-map migration; no arbitrary topology or expansion" },
    map: source.map, componentDefinitions: source.componentDefinitions ?? {}, cities: {}, generals: {},
    chapters: {}, chapterOrder: [], assets: source.assets ?? {},
    compatibility: { slotBindings: { cities: {}, generals: {} }, idMap: { chapters: {} } },
    localModel: { ownerId: null, draftRevision: "1" } };
  const placements = new Map(game.map.placements.map((p) => [p.cityId, p]));
  for (const city of source.world.cities) {
    if (typeof city.id !== "string") throw new TypeError("fixed city business ID required");
    game.cities[city.id] = { cityId: city.id, runtimeSlot: city.index, x: city.x, y: city.y };
    game.compatibility.slotBindings.cities[city.id] = city.index;
  }
  for (const road of game.map.roads) {
    if (!Array.isArray(road.nativeBinding?.slots)) {
      const [first, last] = deriveSlots(road.geometry, placements.get(road.fromCityId));
      road.nativeBinding = { ...road.nativeBinding, slots: [{ node: road.fromCityId, ...first }, { node: road.toCityId, ...last }] };
    }
  }
  for (const chapter of source.chapters) {
    if (typeof chapter.id !== "string" || Object.hasOwn(game.chapters, chapter.id)) throw new RangeError("invalid/duplicate fixed chapter ID");
    // Original chapter IDs and fixed table indices are retained, not
    // merged by names or regenerated from a compacted roster.
    game.chapters[chapter.id] = { chapterId: chapter.id, sourceChapterId: chapter.id,
      legacyScenarioIndex: chapter.legacyScenarioIndex, state: chapter.state };
    game.chapterOrder.push(chapter.id);
    game.compatibility.idMap.chapters[chapter.id] = chapter.id;
    for (const general of chapter.state.generals ?? []) {
      if (!Object.hasOwn(game.generals, general.idx)) game.generals[general.idx] = { slot: general.idx, name: general.name };
      game.compatibility.slotBindings.generals[general.idx] = general.idx;
    }
  }
  if (source.compatibilityAssets !== undefined) game.compatibilityAssets = source.compatibilityAssets;
  validateGameSource(game);
  return game;
}
