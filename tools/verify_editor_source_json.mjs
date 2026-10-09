import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { encodeSourceChunks, decodeSourceChunks, CanonicalSourceParser } from '../web/src/content/authoring/sourcejson.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let checks = 0, rejects = 0;
const values = [null, true, false, 0, 1, -1, 1.25, 1e-7, '', '漢字😀', '\\"\n\t', [], {}, [1, null, { 漢: '😀' }], { z: [true, 2], a: '漢😀' }];
for (const value of values) for (const chunk of [1, 2, 3, 7, 31, 1024]) {
  const parts = encodeSourceChunks(value, chunk); assert.deepEqual(decodeSourceChunks(parts), value);
  assert.equal(Buffer.concat(parts).toString(), canonicalDigest(value, text => text)); checks++;
}
for (const text of ['{"a":1,"a":2}', '{"z":1,"a":2}', '{"__proto__":1}', '{"constructor":1}', '{"prototype":1}', '{"a":01}', '{"a":-0}', '{"a":1e999}', '{"a":9007199254740993}', '{"a":9007199254740992}', '{"a":"\\ud800"}', '{"a":"\\u0061"}', '{"a":true,}', '[1,]', '[,1]', ' {"a":1}', '{"a":1}\n', '{}{}', '"unfinished', 'undefined', '\ufeff{}', '']) {
  assert.throws(() => decodeSourceChunks([new TextEncoder().encode(text)])); rejects++;
}
assert.throws(() => decodeSourceChunks([new Uint8Array([0xff])])); rejects++;
const decoder = new CanonicalSourceParser({ maxDepth: 2 }); assert.throws(() => { decoder.feed('[[[0]]]'); decoder.finish(); }); rejects++;
const bounded = new CanonicalSourceParser({ maxNodes: 2 }); assert.throws(() => { bounded.feed('[1,2]'); bounded.finish(); }); rejects++;
const token = new CanonicalSourceParser({ maxToken: 3 }); assert.throws(() => token.feed('"abcd"')); rejects++;
const hole = [,], hidden = {}, getter = {}; let getterHits = 0;
Object.defineProperty(hidden, 'x', { value: 1 }); Object.defineProperty(getter, 'x', { get() { getterHits++; throw new Error('getter executed'); }, enumerable: true });
const cyclic = {}; cyclic.x = cyclic;
for (const value of [undefined, Infinity, NaN, -0, 2n, '\ud800', hole, hidden, getter, cyclic, new Date(), { [Symbol('x')]: 1 }]) { assert.throws(() => encodeSourceChunks(value)); rejects++; }
assert.equal(getterHits, 0, 'reject accessor before executing author code');
const sourcePath = 'web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/game-source.json';
const input = readFileSync(sourcePath), oldHash = sha(input); let game;
try { game = JSON.parse(input); } catch (cause) { throw new Error('invalid fixed Web source fixture', { cause }); }
const started = performance.now(), parts = encodeSourceChunks(game), digest = createHash('sha256'); for (const part of parts) digest.update(part);
const sourceDigest = digest.digest('hex'); assert.equal(sourceDigest, canonicalDigest(game, sha));
assert.deepEqual(decodeSourceChunks(parts), game); checks++;
assert.equal(sha(readFileSync(sourcePath)), oldHash);
process.stdout.write(JSON.stringify({ result: 'PASS-CANONICAL-SOURCE-STREAM-CODEC', checks, rejects, originalBytes: input.length, canonicalBytes: parts.reduce((n, p) => n + p.length, 0), chunks: parts.length, sourceDigest, fixtureMillis: Math.round(performance.now() - started), sourceHash: oldHash, toolHash: sha(readFileSync(import.meta.filename)), limits: 'Node engineering measurement only; no WorkerCPU/SLA or scenario/runtime certificate.' }) + '\n');
