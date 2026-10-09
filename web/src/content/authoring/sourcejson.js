// Web storage codec only. No scenario/profile or runtime admission certificate.
const encoder = new TextEncoder();
const forbidden = key => key === '__proto__' || key === 'constructor' || key === 'prototype';
function scalar(value) {
  if (typeof value === 'string') { if (!value.isWellFormed()) throw new TypeError('source Unicode'); return JSON.stringify(value); }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  throw new TypeError('lossy or non-JSON source');
}
// Produces canonical tokens without allocating a full source-sized JSON string.
export function* canonicalSourceTokens(value, maxDepth = 64) {
  const ancestors = new Set();
  function* visit(item, depth) {
    if (depth > maxDepth) throw new RangeError('source depth');
    if (item === null || typeof item !== 'object') { yield scalar(item); return; }
    if (ancestors.has(item)) throw new TypeError('cyclic source');
    const d = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(d);
    if (keys.some(k => typeof k !== 'string')) throw new TypeError('source symbol');
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (keys.length !== item.length + 1) throw new TypeError('source array extras/holes');
      yield '[';
      for (let i = 0; i < item.length; i++) {
        const field = d[i]; if (!field || !field.enumerable || !Object.hasOwn(field, 'value')) throw new TypeError('source array accessor/hole');
        if (i) yield ','; yield* visit(field.value, depth + 1);
      }
      yield ']';
    } else {
      const proto = Object.getPrototypeOf(item); if (proto !== Object.prototype && proto !== null) throw new TypeError('source object prototype');
      yield '{'; let first = true;
      for (const key of keys.sort()) {
        const field = d[key];
        if (forbidden(key) || !field.enumerable || !Object.hasOwn(field, 'value')) throw new TypeError('source key/accessor/hidden');
        if (!first) yield ','; first = false; yield scalar(key); yield ':'; yield* visit(field.value, depth + 1);
      }
      yield '}';
    }
    ancestors.delete(item);
  }
  yield* visit(value, 0);
}
// Explicit synchronous capture. Chunks belong to the caller; no aliased source buffers.
export function encodeSourceChunks(value, chunkBytes = 1024 * 1024) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 4 * 1024 * 1024) throw new RangeError('source chunk policy');
  const chunks = []; let part = new Uint8Array(chunkBytes), length = 0;
  for (const token of canonicalSourceTokens(value)) {
    const bytes = encoder.encode(token); let at = 0;
    while (at < bytes.length) {
      const n = Math.min(part.length - length, bytes.length - at); part.set(bytes.subarray(at, at + n), length); length += n; at += n;
      if (length === part.length) { chunks.push(part); part = new Uint8Array(chunkBytes); length = 0; }
    }
  }
  if (length) chunks.push(part.slice(0, length));
  return chunks;
}
export class CanonicalSourceParser {
  #stack = []; #root; #hasRoot = false; #mode = null; #token = ''; #escaped = false; #nodes = 0;
  #maxDepth; #maxNodes; #maxToken;
  constructor({ maxDepth = 64, maxNodes = 4_000_000, maxToken = 1024 * 1024 } = {}) {
    for (const n of [maxDepth, maxNodes, maxToken]) if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('source parser policy');
    this.#maxDepth = maxDepth; this.#maxNodes = maxNodes; this.#maxToken = maxToken;
  }
  #value(value) {
    if (++this.#nodes > this.#maxNodes) throw new RangeError('source node budget');
    const frame = this.#stack.at(-1);
    if (!frame) { if (this.#hasRoot) throw new TypeError('multiple source roots'); this.#root = value; this.#hasRoot = true; return; }
    if (frame.kind === 'object') {
      if (frame.expect !== 'value') throw new TypeError('source object value');
      Object.defineProperty(frame.value, frame.key, { value, enumerable: true, writable: true, configurable: true });
    } else { if (!['value', 'valueOrEnd'].includes(frame.expect)) throw new TypeError('source array value'); frame.value.push(value); }
    frame.expect = 'delimiter';
  }
  #scalarToken() {
    const token = this.#token; this.#token = ''; this.#mode = null; let value;
    try { value = JSON.parse(token); } catch (cause) { throw new TypeError('invalid source scalar', { cause }); }
    if (scalar(value) !== token) throw new TypeError('noncanonical source scalar');
    const frame = this.#stack.at(-1);
    if (typeof value === 'string' && frame?.kind === 'object' && ['key', 'keyOrEnd'].includes(frame.expect)) {
      if (forbidden(value) || frame.prior !== undefined && value <= frame.prior) throw new TypeError('duplicate/unsorted/unsafe source key');
      frame.key = value; frame.prior = value; frame.expect = 'colon'; return;
    }
    this.#value(value);
  }
  feed(text) {
    if (typeof text !== 'string') throw new TypeError('source text fragment');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (this.#mode === 'string') {
        this.#token += ch; if (this.#token.length > this.#maxToken) throw new RangeError('source token budget');
        if (this.#escaped) this.#escaped = false;
        else if (ch === '\\') this.#escaped = true;
        else if (ch === '"') this.#scalarToken();
        continue;
      }
      if (this.#mode === 'scalar') {
        if (/[0-9a-zA-Z+.-]/.test(ch)) { this.#token += ch; if (this.#token.length > this.#maxToken) throw new RangeError('source token budget'); continue; }
        this.#scalarToken(); // The delimiter is processed below, not discarded.
      }
      const frame = this.#stack.at(-1);
      if (ch === '"') { this.#mode = 'string'; this.#token = ch; continue; }
      if (ch === '{' || ch === '[') {
        const value = ch === '{' ? {} : []; this.#value(value);
        if (this.#stack.length >= this.#maxDepth) throw new RangeError('source depth');
        this.#stack.push({ kind: ch === '{' ? 'object' : 'array', value, expect: ch === '{' ? 'keyOrEnd' : 'valueOrEnd' }); continue;
      }
      if (ch === '}' || ch === ']') {
        const kind = ch === '}' ? 'object' : 'array';
        if (!frame || frame.kind !== kind || !['delimiter', kind === 'object' ? 'keyOrEnd' : 'valueOrEnd'].includes(frame.expect)) throw new TypeError('source closing delimiter');
        this.#stack.pop(); continue;
      }
      if (ch === ':') { if (frame?.kind !== 'object' || frame.expect !== 'colon') throw new TypeError('source colon'); frame.expect = 'value'; continue; }
      if (ch === ',') { if (!frame || frame.expect !== 'delimiter') throw new TypeError('source comma'); frame.expect = frame.kind === 'object' ? 'key' : 'value'; continue; }
      if (/[0-9tfn-]/.test(ch)) { this.#mode = 'scalar'; this.#token = ch; continue; }
      throw new TypeError('noncanonical source character');
    }
  }
  finish() {
    if (this.#mode === 'scalar') this.#scalarToken();
    if (this.#mode || this.#stack.length || !this.#hasRoot) throw new TypeError('incomplete source JSON');
    return this.#root;
  }
}
export function decodeSourceChunks(chunks, policy) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), parser = new CanonicalSourceParser(policy);
  for (const bytes of chunks) { if (!(bytes instanceof Uint8Array)) throw new TypeError('source byte fragment'); parser.feed(decoder.decode(bytes, { stream: true })); }
  parser.feed(decoder.decode()); return parser.finish();
}
