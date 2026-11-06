// Web storage codec only. No scenario/profile or runtime admission certificate.
const encoder = new TextEncoder();
const forbidden = key => key === '__proto__' || key === 'constructor' || key === 'prototype';
// Shared with CanonicalSourceParser: single native scans instead of per-character work.
const rawControl = /[\u0000-\u001f]/;
const stringBreak = /["\\]/g;
const scalarRun = /[0-9a-zA-Z+.-]+/y;
// 15 digits always survive the Number round-trip; '-0', '007', '1.0' and 1e3 do not.
const plainInteger = /^(?:0|-?[1-9][0-9]{0,14})$/;
const arrayValue = expect => expect === 'value' || expect === 'valueOrEnd';
const scalarStart = code => code >= 0x30 && code <= 0x39 || code === 0x74 || code === 0x66 || code === 0x6e || code === 0x2d;
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
  #stack = []; #root; #hasRoot = false; #mode = null; #token = ''; #escaped = false; #plain = true; #nodes = 0;
  #maxDepth; #maxNodes; #maxToken;
  constructor({ maxDepth = 64, maxNodes = 4_000_000, maxToken = 1024 * 1024 } = {}) {
    for (const n of [maxDepth, maxNodes, maxToken]) if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('source parser policy');
    this.#maxDepth = maxDepth; this.#maxNodes = maxNodes; this.#maxToken = maxToken;
  }
  #value(value) {
    if (++this.#nodes > this.#maxNodes) throw new RangeError('source node budget');
    const frame = this.#stack[this.#stack.length - 1];
    if (!frame) { if (this.#hasRoot) throw new TypeError('multiple source roots'); this.#root = value; this.#hasRoot = true; return; }
    // Keys pass `forbidden()` before they can become a key, so plain assignment has
    // the same result as defineProperty without paying for a descriptor per field.
    if (frame.kind === 'object') {
      if (frame.expect !== 'value') throw new TypeError('source object value');
      frame.value[frame.key] = value;
    } else { if (!arrayValue(frame.expect)) throw new TypeError('source array value'); frame.value.push(value); }
    frame.expect = 'delimiter';
  }
  #scalarToken() {
    const token = this.#token, mode = this.#mode; this.#token = ''; this.#mode = null; let value = undefined, decided = false;
    // Two whole classes of token skip JSON.parse + re-serialization because the
    // canonical form is already proven by construction:
    //  1. a string token with no backslash is its own literal content;
    //  2. a plain integer of at most 15 digits, plus true/false/null, round-trips exactly.
    if (mode === 'string') {
      if (this.#plain) { const inner = token.slice(1, -1); if (!rawControl.test(inner) && inner.isWellFormed()) { value = inner; decided = true; } }
    } else if (plainInteger.test(token)) { value = Number(token); decided = true; }
    else if (token === 'true' || token === 'false' || token === 'null') { value = token === 'null' ? null : token === 'true'; decided = true; }
    if (!decided) {
      try { value = JSON.parse(token); } catch (cause) { throw new TypeError('invalid source scalar', { cause }); }
      if (scalar(value) !== token) throw new TypeError('noncanonical source scalar');
    }
    const frame = this.#stack[this.#stack.length - 1];
    if (typeof value === 'string' && frame?.kind === 'object' && (frame.expect === 'key' || frame.expect === 'keyOrEnd')) {
      if (forbidden(value) || frame.prior !== undefined && value <= frame.prior) throw new TypeError('duplicate/unsorted/unsafe source key');
      frame.key = value; frame.prior = value; frame.expect = 'colon'; return;
    }
    this.#value(value);
  }
  // Runs of ordinary characters are consumed in one native scan; only the
  // structural characters and token boundaries cost an iteration.
  feed(text) {
    if (typeof text !== 'string') throw new TypeError('source text fragment');
    const max = this.#maxToken, size = text.length; let at = 0;
    while (at < size) {
      if (this.#mode === 'string') {
        // A fragment ended right after a backslash: the escaped character is next.
        if (this.#escaped) {
          this.#token += text[at]; this.#escaped = false; if (this.#token.length > max) throw new RangeError('source token budget');
          if (++at >= size) break;
        }
        stringBreak.lastIndex = at;
        const found = stringBreak.exec(text), end = found ? found.index : size;
        if (end > at) { this.#token += text.slice(at, end); if (this.#token.length > max) throw new RangeError('source token budget'); at = end; }
        if (!found) break;
        if (found[0] === '\\') {
          this.#token += '\\'; this.#plain = false; at = end + 1;
          if (at < size) { this.#token += text[at]; if (this.#token.length > max) throw new RangeError('source token budget'); at++; }
          else this.#escaped = true;
          continue;
        }
        this.#token += '"'; if (this.#token.length > max) throw new RangeError('source token budget'); this.#scalarToken(); at = end + 1; continue;
      }
      if (this.#mode === 'scalar') {
        scalarRun.lastIndex = at;
        const run = scalarRun.exec(text);
        if (run) { this.#token += run[0]; if (this.#token.length > max) throw new RangeError('source token budget'); at = scalarRun.lastIndex; if (at >= size) break; }
        this.#scalarToken(); // The delimiter is handled below, not discarded.
      }
      const code = text.charCodeAt(at), frame = this.#stack[this.#stack.length - 1];
      if (code === 0x22) { this.#mode = 'string'; this.#token = '"'; this.#plain = true; at++; continue; }
      if (code === 0x7b || code === 0x5b) {
        const object = code === 0x7b, value = object ? {} : [];
        this.#value(value);
        if (this.#stack.length >= this.#maxDepth) throw new RangeError('source depth');
        this.#stack.push({ kind: object ? 'object' : 'array', value, expect: object ? 'keyOrEnd' : 'valueOrEnd' });
        at++; continue;
      }
      if (code === 0x7d || code === 0x5d) {
        const kind = code === 0x7d ? 'object' : 'array';
        if (!frame || frame.kind !== kind || !(frame.expect === 'delimiter' || frame.expect === (kind === 'object' ? 'keyOrEnd' : 'valueOrEnd'))) throw new TypeError('source closing delimiter');
        this.#stack.pop(); at++; continue;
      }
      if (code === 0x3a) { if (frame?.kind !== 'object' || frame.expect !== 'colon') throw new TypeError('source colon'); frame.expect = 'value'; at++; continue; }
      if (code === 0x2c) { if (!frame || frame.expect !== 'delimiter') throw new TypeError('source comma'); frame.expect = frame.kind === 'object' ? 'key' : 'value'; at++; continue; }
      if (scalarStart(code)) {
        scalarRun.lastIndex = at;
        const run = scalarRun.exec(text);
        this.#token = run[0]; this.#mode = 'scalar'; if (this.#token.length > max) throw new RangeError('source token budget');
        at = scalarRun.lastIndex; continue;
      }
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
