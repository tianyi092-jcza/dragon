// Content-only internal capability. NEVER a principal, persistent author grant or runtime certificate.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { fail } from './security.js';
const resourceNames = Object.freeze(['money', 'reserve_cav', 'reserve_arc', 'reserve_inf']);
export const FIXED_COPY_PROFILE = 'fixed-copy-resources-1';
function view(value) {
  if (!value || typeof value !== 'object') fail(422, 'COPY_STRUCTURE');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && !(array && proto === Array.prototype)) fail(422, 'COPY_STRUCTURE');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  for (const key of keys) {
    const d = descriptors[key];
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(d, 'value') || (!d.enumerable && !(array && key === 'length'))) fail(422, 'COPY_STRUCTURE');
  }
  if (array && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))) fail(422, 'COPY_STRUCTURE');
  return descriptors;
}
function value(object, key) { const d = view(object)[key]; if (!d) fail(422, 'COPY_STRUCTURE'); return d.value; }
function digest(game) { const h = createHash('sha256'); for (const token of canonicalSourceTokens(game)) h.update(token, 'utf8'); return h.digest('hex'); }
function freezeGraph(root) {
  const pending = [root], seen = new WeakSet();
  while (pending.length) { const node = pending.pop(); if (!node || typeof node !== 'object' || seen.has(node)) continue; seen.add(node); for (const d of Object.values(view(node))) if (d.value && typeof d.value === 'object') pending.push(d.value); Object.freeze(node); }
  return root;
}
function compare(expected, candidate, replacements) {
  const stack = [[expected, candidate, 0]];
  while (stack.length) {
    let [a, b, depth] = stack.pop(); if (a && typeof a === 'object' && replacements.has(a)) a = replacements.get(a);
    if (Object.is(a, b)) continue;
    if (depth > 64 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) fail(422, 'COPY_PROTECTED_DELTA');
    const ad = view(a), bd = view(b), ak = Object.keys(ad).sort(), bk = Object.keys(bd).sort();
    if (ak.length !== bk.length || ak.some((key, i) => key !== bk[i])) fail(422, 'COPY_PROTECTED_DELTA');
    for (const key of ak) stack.push([ad[key].value, bd[key].value, depth + 1]);
  }
}
export class FixedCopyProfile {
  #load; #captures = new WeakMap();
  constructor({ loadCopy }) { if (typeof loadCopy !== 'function') throw new TypeError('service-owned pinned copy loader required'); this.#load = loadCopy; }
  async capture(context) {
    // Constructor port is trusted code, not an HTTP descriptor/APPROVED marker.
    const loaded = await this.#load(context), baseline = loaded.game;
    const baselineDigest = digest(baseline); freezeGraph(baseline);
    const capability = Object.freeze({});
    const provenance = freezeGraph(structuredClone(loaded.provenance));
    this.#captures.set(capability, { baseline, baselineDigest, provenance });
    return Object.freeze({ capability, game: baseline, baselineDigest, provenance });
  }
  verify(capability, candidate) {
    const captured = this.#captures.get(capability); if (!captured) fail(403, 'COPY_CAPTURE_REQUIRED');
    const { baseline, baselineDigest, provenance } = captured, replacements = new WeakMap(), changes = [];
    // No getters execute: validate descriptors before reading any candidate field.
    const metadata = value(candidate, 'metadata'); view(metadata);
    let normalized; try { normalized = normalizeGameMetadata(metadata); } catch { fail(422, 'COPY_METADATA'); }
    if (metadata.name !== normalized.name || metadata.introduction !== normalized.introduction) fail(422, 'COPY_METADATA');
    replacements.set(baseline.metadata, normalized);
    const chapters = value(candidate, 'chapters'); view(chapters);
    for (const chapterId of baseline.chapterOrder) {
      const oldState = baseline.chapters[chapterId].state, state = value(value(chapters, chapterId), 'state');
      const factions = value(state, 'factions'); view(factions);
      if (!Array.isArray(factions) || factions.length !== oldState.factions.length) fail(422, 'COPY_PROTECTED_DELTA');
      let shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId], chapters: { [chapterId]: { chapterId, state: { factions: oldState.factions, nativeFactionSlotRaw: oldState.nativeFactionSlotRaw } } } };
      for (let slot = 0; slot < oldState.factions.length; slot++) {
        const row = value(factions, String(slot)), requested = Object.fromEntries(resourceNames.map(name => [name, value(row, name)]));
        try { shell = editChapterResources(shell, chapterId, slot, requested); } catch { fail(422, 'COPY_RESOURCE_DELTA'); }
        const names = resourceNames.filter(name => requested[name] !== oldState.factions[slot][name]);
        if (names.length) changes.push(Object.freeze({ chapterId, slot, fields: Object.freeze(names) }));
      }
      replacements.set(oldState.factions, shell.chapters[chapterId].state.factions);
      replacements.set(oldState.nativeFactionSlotRaw, shell.chapters[chapterId].state.nativeFactionSlotRaw);
    }
    compare(baseline, candidate, replacements);
    const sourceDigest = digest(candidate); // Strict canonical JSON after protected delta checks.
    return Object.freeze({ profileRevision: FIXED_COPY_PROFILE, baselineDigest, sourceDigest, provenance, changes: Object.freeze(changes), limits: 'Content-only captured full-copy profile; signed24/u16 representation not playable-input admission. No map/newchapter/role/image/runtime permission; no principal or persistent grant.' });
  }
}
