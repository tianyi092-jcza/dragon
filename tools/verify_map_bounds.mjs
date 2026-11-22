// Q39: over-boundary preview, expansion refusal, unconfigured-bounds
// publish block. Usage: node tools/verify_map_bounds.mjs
import { register } from 'node:module';
register('../vps/text-loader.mjs', import.meta.url);
const { previewTranslateOutOfBounds, requestMapExpansion } = await import('../web/src/editor/componenttools.js');
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { PublishedPacks } = await import('../server/playpacks.js');
const { HttpError } = await import('../server/security.js');

let passed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { console.error(`FAIL ${name} ${extra}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};

const def = { id: 'atom', footprint: [[0, 0]], anchor: [0, 0], variants: { original: { tiles: [[0, 0, 32]] } } };
const source = { componentDefinitions: { atom: def }, map: { decorations: [{ id: 'a', x: 382, y: 10, definitionRef: 'atom' }] } };
const pvOk = previewTranslateOutOfBounds(source, ['a'], 1, 0);
check('inside preview empty', pvOk.count === 0 && pvOk.cells.length === 0);
const pvOver = previewTranslateOutOfBounds(source, ['a'], 2, 0);
check('over preview exact cells', pvOver.count === 1 && JSON.stringify(pvOver.cells) === '[[384,10]]');
check('source unmutated', source.map.decorations[0].x === 382);
for (const bad of [
  () => previewTranslateOutOfBounds(source, ['zzz'], 1, 0),
  () => previewTranslateOutOfBounds(source, ['a'], 0, 0),
  () => previewTranslateOutOfBounds(source, [], 1, 0),
]) {
  try { bad(); check('bad input refused', false); }
  catch { check('bad input refused', true); }
}
try { requestMapExpansion(); check('expansion refused', false); }
catch (e) { check('expansion refused', e instanceof RangeError && String(e.message).startsWith('MAP_EXPANSION_CLOSED')); }

const storage = openStorage(':memory:');
const packs = new PublishedPacks({ storage, principal: () => ({ id: 'u', must_change: 0 }) });
const GAME = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const ref = { gameId: GAME, draftRevision: '1', sourceDigest: 'b'.repeat(64) };
const game = bounds => ({ gameId: GAME, chapterOrder: ['c'], chapters: { c: { state: {} } }, map: { bounds } });
const good = { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 };
try {
  await packs.buildAndStore('h1', { game: game({ ...good, width: 500 }), reference: ref, compiled: {} });
  check('bad bounds blocked', false);
} catch (e) { check('bad bounds blocked', e instanceof HttpError && e.code === 'PLAY_MAP_BOUNDS', e?.code); }
// MAP-EXT E10: supported extents (here east +16, within the per-side budget)
// pass the bounds gate; the failure below is the empty chapter state, which
// proves gate passage rather than a bounds refusal.
try {
  await packs.buildAndStore('h1', { game: game({ ...good, width: 400 }), reference: ref, compiled: {} });
  check('extended bounds pass gate', false);
} catch (e) { check('extended bounds pass gate', e?.code === 'PLAY_SNAPSHOT', e?.code); }
try {
  await packs.buildAndStore('h1', { game: { ...game(good), chapterOrder: [] }, reference: ref, compiled: {} });
  check('gate passes good bounds', false);
} catch (e) { check('gate passes good bounds', e?.code === 'PLAY_SNAPSHOT', e?.code); }

console.log(`passed ${passed} checks`);
