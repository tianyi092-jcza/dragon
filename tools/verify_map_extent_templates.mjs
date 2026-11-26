// MAP-EXT E5: template quota, creation/copy inheritance, server protection.
// Isolated only: real registered source + :memory: SQLite. No dev store, no
// browser, no second repo database, no live copies. Covers: template admit of
// N/S extents (W/E fail closed at compat), snapshot-quota inheritance for both
// creation entries (minimal/new + full/copy), template/copy independence, old
// snapshot readability, refusal atomicity, admin-only template writes.
// Usage: node --test tools/verify_map_extent_templates.mjs (cwd=web-port)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { validateSystemBaseMap, instantiateSystemBaseMap } from '../server/systembasemap.js';
import { SystemBaseMapStore } from '../server/systembasemapstore.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';
import { copyBuiltinGame } from '../web/src/content/authoring/gamesource.js';
import { openStorage } from '../vps/sqlite-port.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readInstalledEditorSource(BUILTIN_RESOURCES);
const { template: baseTemplate } = convertInstalledSystemBaseMap(source, BUILTIN_RESOURCES.sourceDigest);
const baseDigest = validateSystemBaseMap(baseTemplate, sha).digest;

const growTemplate = (side, n) => {
  let cur = { ...baseTemplate.content, gameId: 'e5-probe' };
  for (let k = 0; k < n; k++) cur = applyMapWorkspaceEdits(cur, [{ op: 'map-extent', side, delta: 1 }]);
  const { gameId, ...content } = cur;
  return { ...structuredClone(baseTemplate), content };
};
const snapshotOf = template => ({ version: 1, digest: validateSystemBaseMap(template, sha).digest, template });
const fails = (fn, code, status = 422) => {
  try { fn(); } catch (e) { assert.equal(e.code, code, `code ${e.code} ${e.message}`); assert.equal(e.status, status); return e; }
  assert.fail(`should have thrown ${code}`);
};
const originRowsEqual = (grown, baseCompiled) => {
  const { compiled: grownCompiled } = validateSystemBaseMap(grown, sha);
  const { bounds } = grown.content.map;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++) {
    const g = grownCompiled.terrainBytes[(y - bounds.minY) * bounds.width + x - bounds.minX];
    if (g !== baseCompiled.terrainBytes[y * 384 + x]) return false;
  }
  return true;
};
const baseCompiled = validateSystemBaseMap(baseTemplate, sha).compiled;

test('E5 template north+12 validates; origin cells identical, new strip is sea', () => {
  const grown = growTemplate('north', 12);
  assert.deepEqual(grown.content.map.bounds, { minX: 0, minY: -12, width: 384, height: 268, tileSize: 16 });
  const { digest, compiled } = validateSystemBaseMap(grown, sha);
  assert.ok(originRowsEqual(grown, baseCompiled), 'origin domain byte-identical');
  assert.deepEqual(compiled.roadGraph.version, 'world-grid-experiment');
  for (let y = -12; y < 0; y++) for (let x = 0; x < 384; x++) {
    assert.equal(compiled.terrainBytes[(y + 12) * 384 + x], 95, `new cell ${x},${y} is sea`);
    assert.equal(compiled.geography[(y + 12) * 384 + x], 1);
  }
  assert.notEqual(digest, baseDigest, 'extent changes the template digest');
  assert.equal(validateSystemBaseMap(structuredClone(grown), sha).digest, digest, 'JSON roundtrip stable');
});

test('E5 template south validates; west/east admitted since E6 origin-plane compat', () => {
  const south = growTemplate('south', 5);
  assert.deepEqual(south.content.map.bounds, { minX: 0, minY: 0, width: 384, height: 261, tileSize: 16 });
  validateSystemBaseMap(south, sha);
  assert.ok(originRowsEqual(south, baseCompiled));
  // MAP-EXT E6: explicit compat is always the origin 384x256 plane, overlaid
  // at the world offset; west/east templates now validate (E5 boundary retired).
  for (const side of ['west', 'east']) {
    const grown = growTemplate(side, 1);
    const { compiled } = validateSystemBaseMap(grown, sha);
    const { minX, width } = grown.content.map.bounds;
    assert.ok(originRowsEqual(grown, baseCompiled), `${side} origin domain identical`);
    for (let y = 0; y < 256; y++) {
      const wx = side === 'west' ? minX : 384;
      assert.equal(compiled.terrainBytes[y * width + wx - minX], 95, `${side} new column ${wx},${y} is sea`);
      assert.equal(compiled.geography[y * width + wx - minX], 1);
    }
  }
});

test('E5 template op refusal matrix (quota, side, delta, corrupt input)', () => {
  const workspace = () => ({ ...baseTemplate.content, gameId: 'e5-probe' });
  fails(() => applyMapWorkspaceEdits(workspace(), [{ op: 'map-extent', side: 'up', delta: 1 }]), 'MAP_EXTENT_NOT_ENABLED');
  fails(() => applyMapWorkspaceEdits(workspace(), [{ op: 'map-extent', side: 'north', delta: 2 }]), 'COPY_MAP_DELTA');
  fails(() => applyMapWorkspaceEdits(workspace(), [{ op: 'map-extent', side: 'north', delta: 0 }]), 'COPY_MAP_DELTA');
  let cur = workspace();
  for (let k = 0; k < 40; k++) cur = applyMapWorkspaceEdits(cur, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  fails(() => applyMapWorkspaceEdits(cur, [{ op: 'map-extent', side: 'north', delta: 1 }]), 'MAP_EXTENT_BUDGET');
  const before = JSON.stringify(baseTemplate);
  assert.throws(() => validateSystemBaseMap({ ...baseTemplate, version: 0 }, sha));
  assert.equal(JSON.stringify(baseTemplate), before, 'failed validation leaves the template untouched');
});

test('E5 both creation entries inherit the template snapshot and quota', () => {
  const grown = growTemplate('north', 12), snap = snapshotOf(grown);
  const minimal = copyBuiltinGame({ gameId: 'e5-new', ownerId: 'o', kind: 'minimal', source }, sha);
  const full = copyBuiltinGame({ gameId: 'e5-copy', ownerId: 'o', kind: 'full', source }, sha);
  const bornMinimal = instantiateSystemBaseMap(minimal, snap, sha);
  const bornFull = instantiateSystemBaseMap(full, snap, sha);
  for (const born of [bornMinimal, bornFull]) {
    assert.deepEqual(born.map.bounds, grown.content.map.bounds, 'used quota inherited, not reset');
    assert.deepEqual(born.mapOrigin, { schema: grown.schema, supportProfile: grown.supportProfile, version: 1, digest: snap.digest });
  }
  // Template north already +12: only 28 more rows allowed, the 29th refuses.
  let cur = bornFull;
  for (let k = 0; k < 28; k++) cur = applyCopyMapEdits(cur, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  assert.equal(cur.map.bounds.minY, -40, '28 more rows reach the per-side cap of 40');
  fails(() => applyCopyMapEdits(cur, [{ op: 'map-extent', side: 'north', delta: 1 }]), 'MAP_EXTENT_BUDGET');
  // Other sides keep their own independent quota.
  const south = applyCopyMapEdits(bornMinimal, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  assert.equal(south.map.bounds.height, 269);
});

test('E5 template edits do not chase existing copies; copies are independent', () => {
  const s1 = snapshotOf(growTemplate('north', 12));
  const gameA = copyBuiltinGame({ gameId: 'e5-a', ownerId: 'o', kind: 'full', source }, sha);
  const copyA = instantiateSystemBaseMap(gameA, s1, sha);
  const s2 = snapshotOf(growTemplate('north', 13));
  assert.deepEqual(copyA.map.bounds.minY, -12, 'existing copy unaffected by later template edits');
  const gameB = copyBuiltinGame({ gameId: 'e5-b', ownerId: 'o', kind: 'full', source }, sha);
  const copyB = instantiateSystemBaseMap(gameB, s2, sha);
  assert.deepEqual(copyB.map.bounds.minY, -13);
  const mutatedA = applyCopyMapEdits(copyA, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  assert.equal(mutatedA.map.bounds.height, 269);
  assert.equal(copyA.map.bounds.height, 268, 'pure ops never mutate the input copy');
  assert.equal(copyB.map.bounds.height, 269, 'editing one copy never touches another');
  assert.equal(validateSystemBaseMap(baseTemplate, sha).digest, baseDigest, 'template itself never mutated');
});

test('E5 old origin snapshots still instantiate; bad snapshots refuse atomically', () => {
  const old = snapshotOf(baseTemplate);
  const game = copyBuiltinGame({ gameId: 'e5-old', ownerId: 'o', kind: 'full', source }, sha);
  const born = instantiateSystemBaseMap(game, old, sha);
  assert.deepEqual(born.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  assert.throws(() => instantiateSystemBaseMap(game, { version: 0, digest: old.digest, template: baseTemplate }, sha),
    /snapshot version required/);
  assert.throws(() => instantiateSystemBaseMap(game, { version: 1, digest: '0'.repeat(64), template: baseTemplate }, sha),
    /snapshot digest mismatch/);
});

test('E5 template writes require admin; capture stays an internal snapshot port', async () => {
  const storage = openStorage(':memory:');
  const roles = new Map([['admin-tok', { id: 'admin', role: 'admin', must_change: 0, epoch: 1 }], ['author-tok', { id: 'author', role: 'author', must_change: 0, epoch: 1 }]]);
  const store = new SystemBaseMapStore({ storage, principal: tok => roles.get(tok) ?? null,
    loadInitialTemplate: async () => structuredClone(baseTemplate) });
  const v1 = await store.initialize('admin-tok');
  assert.equal(v1.version, 1);
  fails(() => store.read('author-tok'), 'ADMIN_REQUIRED', 403);
  fails(() => store.edit('author-tok', [{ op: 'map-extent', side: 'north', delta: 1 }]), 'ADMIN_REQUIRED', 403);
  fails(() => store.saveCities('author-tok', { rename: {} }), 'ADMIN_REQUIRED', 403);
  const v2 = await store.edit('admin-tok', [{ op: 'map-extent', side: 'north', delta: 1 }]);
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.template.content.map.bounds.minY, -12 + 11, 'admin north+1 on the origin template');
  const snap = store.capture();
  assert.equal(snap.version, 2);
  assert.equal(snap.digest, v2.digest, 'capture returns the installed snapshot, not a moving draft');
  assert.equal(store.read('admin-tok').version, 2, 'author refusals changed nothing');
});
