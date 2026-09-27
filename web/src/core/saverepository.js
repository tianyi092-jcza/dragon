// Storage policy only; never interprets or repairs game state.
import { assertSaveId, normalizeSaveSlots, summarizeSave } from './savecatalog.js';
export function emptySaveSlots() {
  return normalizeSaveSlots(null);
}

/** Transport: read() -> record; write(record) resolves only after commit.
 * App owns save sequencing and guards. No shared mutable snapshots cross here.
 * Slot identities are stable non-negative safe integers, independent of DOS.
 */
export function createSaveRepository(transport) {
  return Object.freeze({
    async load() {
      return structuredClone(normalizeSaveSlots(await transport.read()));
    },
    async list() {
      const rows = transport.list
        ? await transport.list()
        : (await transport.read())?.slots?.map(summarizeSave) ?? [];
      return structuredClone(rows);
    },
    async get(slot) {
      assertSaveId(slot);
      const saved = transport.readOne
        ? await transport.readOne(slot)
        : (await transport.read())?.slots?.find((entry) => entry.slot === slot);
      return structuredClone(saved ?? null);
    },
    async add(saved) {
      if (!transport.createOne) throw new TypeError('Create-save transport required');
      return structuredClone(await transport.createOne(structuredClone(saved)));
    },
    async put(saved) {
      const candidate = structuredClone(saved);
      assertSaveId(candidate?.slot);
      if (!transport.writeOne) throw new TypeError('Single-save transport required');
      await transport.writeOne(structuredClone(candidate));
      return candidate;
    },
    async save(saves) {
      const candidate = structuredClone(normalizeSaveSlots(saves));
      await transport.write(structuredClone(candidate));
      return candidate;
    },
  });
}
