// Source-record index, NOT a writable GeneralDefinition/initializer/identity merge.
// Trusted importer supplies complete original records; no IO/RNG/guessing here.
export function createImportedEntityIndex({ gameId, sourceRevision, chapters, rawChapters }, allocateId) {
  if (typeof gameId !== "string" || !gameId || typeof sourceRevision !== "string" || !sourceRevision ||
      !Array.isArray(chapters) || !Array.isArray(rawChapters) || chapters.length !== rawChapters.length || typeof allocateId !== "function")
    throw new TypeError("explicit entity source context required");
  const entities = {}, bindings = {}, ids = new Set(), chapterIds = new Set();
  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index], raw = rawChapters[index];
    if (typeof chapter?.id !== "string" || !chapter.id || chapterIds.has(chapter.id) || raw?.chapterId !== chapter.id ||
        !Array.isArray(chapter.state?.generals) || chapter.state.generals.length !== 128 ||
        !Array.isArray(raw.rawGeneralRecords) || raw.rawGeneralRecords.length !== 128) throw new RangeError("incomplete/mixed chapter entity source");
    chapterIds.add(chapter.id);
    const slotMap = {}, sourceRecords = [];
    for (let slot = 0; slot < 128; slot++) {
      const hex = raw.rawGeneralRecords[slot], named = chapter.state.generals[slot];
      if (typeof hex !== "string" || !/^[0-9a-f]{64}$/i.test(hex) || named?.idx !== slot || typeof named.name !== "string" || typeof named.hao !== "string")
        throw new RangeError("complete explicit general32 required");
      const bytes = Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
      if (named.attr !== bytes[0] || named.portrait !== bytes[1]) throw new RangeError("general source view mismatch");
      for (const [field, offset, shift] of [["siege",14,4],["field",15,4],["naval",16,4],["force",17,0],["lead",18,0],["politics",19,0]])
        if (named.ability?.[field] !== bytes[offset] >>> shift) throw new RangeError("lossy/mixed general ability source");
      const record = { sourceChapterId: chapter.id, runtimeSlot: slot, originalRaw32: hex.toLowerCase() };
      sourceRecords.push(record);
      if (slot === 127) continue; // preserved separately; never an ordinary extra person
      const id = allocateId({ gameId, sourceChapterId: chapter.id, runtimeSlot: slot });
      if (typeof id !== "string" || !id || ids.has(id) || ["__proto__","constructor","prototype"].includes(id)) throw new RangeError("invalid/reused entity identity");
      ids.add(id);
      Object.defineProperty(entities, id, { enumerable: true, configurable: true, writable: true, value: {
        id, gameId, origin: { sourceRevision, ...record }, display: { name: named.name, hao: named.hao, portrait: named.portrait, ability: structuredClone(named.ability) },
        policy: "source-record-only; no name/slot/appearance merge and no writable initialization" } });
      slotMap[slot] = id;
    }
    Object.defineProperty(bindings, chapter.id, { enumerable: true, configurable: true, writable: true,
      value: { slotMap, reserved127: sourceRecords[127], completeOriginalRecords: sourceRecords } });
  }
  return { schemaVersion: 1, mode: "READONLY_SOURCE_RECORD_INDEX", gameId, sourceRevision, entities, bindings };
}
