// Differential guard for the CanonicalSourceParser fast path.
// The current parser consumes runs with native scans instead of working one
// character at a time. Performance work must never widen or narrow the accepted
// language: this file keeps the pre-optimization parser verbatim and asserts that
// both implementations agree on every input below, in acceptance, error identity
// and resulting value. Node-only, in-memory, no storage/browser/network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalSourceParser as FastParser, decodeSourceChunks, encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';

// --- frozen reference implementation (verbatim, character-at-a-time) ---------
const forbidden = key => key === '__proto__' || key === 'constructor' || key === 'prototype';
function scalar(value) {
  if (typeof value === 'string') { if (!value.isWellFormed()) throw new TypeError('source Unicode'); return JSON.stringify(value); }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  throw new TypeError('lossy or non-JSON source');
}
class ReferenceParser {
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
        this.#scalarToken();
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
// --- comparison harness ------------------------------------------------------
function outcome(Parser, fragments, policy) {
  let parser;
  try { parser = new Parser(policy); } catch (error) { return { ok: false, error: error.constructor.name + ': ' + error.message }; }
  try {
    for (const fragment of fragments) parser.feed(fragment);
  } catch (error) { return { ok: false, error: error.constructor.name + ': ' + error.message }; }
  try { return { ok: true, value: parser.finish() }; }
  catch (error) { return { ok: false, error: error.constructor.name + ': ' + error.message }; }
}
// Frames arrive as arbitrary fragments (chunk seams, mid-token, mid-escape).
function compare(label, fragments, policy) {
  const reference = outcome(ReferenceParser, fragments, policy), fast = outcome(FastParser, fragments, policy);
  assert.deepEqual(fast, reference, `${label} → fragments ${JSON.stringify(fragments.map(f => f.slice(0, 80)))}
  fast=${JSON.stringify(fast).slice(0, 400)}
  reference=${JSON.stringify(reference).slice(0, 400)}`);
  // Identical values must also re-serialize to the identical canonical bytes.
  if (reference.ok) assert.equal([...canonicalSourceTokens(fast.value)].join(''), [...canonicalSourceTokens(reference.value)].join(''), label + ' → canonical tokens');
  return reference;
}
const split = (text, size) => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));
const canonical = value => [...canonicalSourceTokens(value)].join('');

// --- 1. every canonical encoding is accepted identically ---------------------
test('both parsers accept canonical encodings, at every chunk seam', () => {
  const values = [
    {}, [], null, 'x', 0, -1, true, false,
    { a: 1, b: [1, 2, 3], c: { d: 'e' } },
    { 名称: '臥龍傳', 說明: '中文', 空: '', 引號: 'He said "hi"', 反斜線: 'a\\b', 換行: 'a\nb', 控制: '\u0007' },
    { n: [0, -0.5, 1.5e-7, 9007199254740991, 1234567890123456, 999999999999999] },
    { deep: { a: { b: { c: { d: [{ e: 'f' }] } } } } },
    { unicode: ['\u2028\u2029', '😀', '∑'], escape: '\u0000\u001f' },
  ];
  for (const value of values) {
    const text = canonical(value);
    for (const chunk of [1, 2, 3, 5, 7, 11, 64, 4096]) compare('values ' + text.slice(0, 40), split(text, chunk));
    compare('values whole ' + text.slice(0, 40), [text]);
  }
  // The encoder refuses numbers that are integers but not safe; the parser still
  // accepts the canonical text of every exactly-representable integer, so cover
  // the 15/16/17-digit seam directly. Anything beyond exactness must be rejected.
  for (const text of ['{"a":9007199254740992}', '{"a":-9007199254740992}', '{"a":1234567890123456}', '{"a":12345678901234560}', '[999999999999999,0]', '{"a":0}', '{"a":-0.0}']) {
    for (const chunk of [1, 3, 7, 4096]) compare('boundary ' + text, split(text, chunk));
    compare('boundary whole ' + text, [text]);
  }
});

// --- 2. adversarial non-canonical text: identical rejection ------------------
test('both parsers reject the same non-canonical text with the same error', () => {
  const bad = [
    '', ' ', '{} ', ' {}', '{ }', '[ ]', '{"a" :1}', '{"a": 1}', '{"a":1 }',
    '{"b":1,"a":2}', '{"a":1,"a":2}', '{"__proto__":1}', '{"constructor":1}', '{"prototype":1}',
    '{a:1}', "{'a':1}", '{"a":01}', '{"a":007}', '{"a":-0}', '{"a":1.0}', '{"a":1e3}', '{"a":+1}',
    '{"a":.5}', '{"a":1.}', '{"a":NaN}', '{"a":Infinity}', '{"a":TruE}', '{"a":true}', '{"a":nul}',
    '{"a":9007199254740993}', '{"a":123456789012345678901234567890}',
    '{"a":"\\x41"}', '{"a":"\\u0041"}', '{"a":"\\ud800"}', '{"a":"\\udfff"}', '{"a":"\\uD83D\\uDE00"}',
    '{"a":"\u0001"}', '{"a":"tab\there"}', '{"a":1}{"b":2}', '{"a":1},', '[1,]', '[,1]', '[,]',
    '{"a":}', '{:1}', '{"a":1,}', '[1 2]', '{"a":[}', '[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]',
    'tru', 'truex', 'nullx', '-', '--1', '1-', '{"a":1}}', ']', '}', ':', ',', 'x', '\ufeff{}', '{"a":\n1}',
  ];
  for (const text of bad) {
    for (const chunk of [1, 2, 3, 64]) compare('bad ' + JSON.stringify(text).slice(0, 40), split(text, chunk));
    compare('bad whole ' + JSON.stringify(text).slice(0, 40), [text]);
  }
});

// --- 3. policy limits fire identically --------------------------------------
test('depth, node and token budgets fire at the same input', () => {
  for (const policy of [{ maxDepth: 2 }, { maxDepth: 3 }, { maxToken: 4 }, { maxToken: 5 }, { maxNodes: 3 }, { maxNodes: 4 }]) {
    for (const text of ['{"a":{"b":{"c":1}}}', '[1,2,3,4]', '{"a":"abc"}', '{"a":"abcd"}', '{"ab":"cd"}', '{"a":[1,[2]]}']) {
      for (const chunk of [1, 2, 3, 64]) compare('policy ' + JSON.stringify(policy) + ' ' + text, split(text, chunk), policy);
    }
  }
  for (const policy of [{ maxDepth: 0 }, { maxToken: -1 }, { maxNodes: 1.5 }]) assert.throws(() => new FastParser(policy), RangeError);
});

// --- 4. randomized differential fuzz ---------------------------------------
function rng(seed) { let state = seed >>> 0; return () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296; }
test('random canonical documents and random mutations agree', () => {
  const random = rng(20261106);
  const pick = list => list[Math.floor(random() * list.length)];
  const strings = ['', 'a', 'z', '중', '😀', 'a"b', 'a\\b', '\n', '\u0000', 'name', '値', '__proto__', 'length'];
  const numbers = [0, 1, -1, 7, 1.5, -0.25, 1.5e-7, 9007199254740991, -123456789012345, 3.0000000000000004];
  let state = 7;
  const nextKey = () => { state += 1; return 'k' + String(state).padStart(4, '0'); };
  function value(depth) {
    const kind = Math.floor(random() * (depth > 2 ? 4 : 6));
    if (kind === 0) return pick(strings);
    if (kind === 1) return pick(numbers);
    if (kind === 2) return pick([null, true, false]);
    if (kind === 3) return pick([0, 1, -5, 123456789]);
    if (kind === 4) return Array.from({ length: Math.floor(random() * 4) }, () => value(depth + 1));
    const out = {};
    for (let i = 0, n = Math.floor(random() * 4); i < n; i++) out[nextKey()] = value(depth + 1);
    return out;
  }
  const mutations = [
    text => text.replace('"', ' '), text => text.replace(',', ' ,'), text => text.replace(':', ': '),
    text => text.replace(/(\d)/, '0$1'), text => text + ' ', text => ' ' + text, text => text.replace(/}$/, ',}'),
    text => text.replace(/]/, ',]'), text => text.replace(/"/g, "'"), text => text.replace(/([a-z])/, 'Z'),
    text => text.slice(0, -1), text => text.slice(1), text => text.replace(/true|false|null/, 'nul'),
    text => text.replace(/\[/, '[['), text => text.replace(/\]/, ']]'), text => text.replace(/\\/, '\\\\'),
  ];
  for (let round = 0; round < 400; round++) {
    const text = canonical(value(0));
    for (const chunk of [1, 2, 4, 9, 33, 256, 65536]) compare('fuzz#' + round, split(text, chunk));
    const mutation = pick(mutations);
    const mutated = mutation(text);
    for (const chunk of [2, 5, 64, 65536]) compare('mutant#' + round + ' ' + mutated.slice(0, 40), split(mutated, chunk));
  }
});

// --- 5. the decode path used by the server agrees byte-for-byte -------------
test('decodeSourceChunks agrees with the reference parser on split byte input', () => {
  const game = { assets: {}, chapterOrder: ['c1', 'c2'], gameId: 'x', metadata: { introduction: '', name: 'n' }, tiles: Array.from({ length: 500 }, (_, i) => i % 7) };
  const chunks = encodeSourceChunks(game, 97);
  const reference = new ReferenceParser();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  for (const bytes of chunks) reference.feed(decoder.decode(bytes, { stream: true }));
  reference.feed(decoder.decode());
  assert.deepEqual(decodeSourceChunks(chunks), reference.finish());
});
