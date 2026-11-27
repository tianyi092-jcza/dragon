// Real SQLite in a newly allocated temporary directory; no production state.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { SystemBaseMapStore } from '../server/systembasemapstore.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { fail } from '../server/security.js';
const { template, receipt } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const directory = mkdtempSync(join(tmpdir(), 'dragon-system-base-map-'));
const filename = join(directory, 'isolated.sqlite');
let storage = openStorage(filename), authorized = true, failCommit = false, loads = 0;
const principal = token => {
  if (!authorized || !['admin', 'author', 'change'].includes(token)) fail(401, 'AUTH_REQUIRED');
  return { id: token, role: token === 'author' ? 'author' : 'admin', must_change: token === 'change' };
};
const faultStorage = { sql: storage.sql, transactionSync: fn => storage.transactionSync(() => { const result = fn(); if (failCommit) throw new Error('injected rollback'); return result; }) };
let releaseInitial;
const store = new SystemBaseMapStore({ storage: faultStorage, principal, loadInitialTemplate: () => {
  loads += 1;
  return loads === 1 ? new Promise(resolve => { releaseInitial = () => resolve(structuredClone(template)); }) : structuredClone(template);
} });
try {
  assert.equal(store.read('admin'), null);
  assert.throws(() => store.capture(), error => error.code === 'BASE_MAP_NOT_INITIALIZED');
  for (const token of ['author', 'change', 'anonymous']) {
    assert.throws(() => store.read(token));
    assert.throws(() => store.save(token, template));
    await assert.rejects(store.initialize(token));
  }
  assert.equal(loads, 0);
  const pending = store.initialize('admin');
  authorized = false;
  releaseInitial();
  await assert.rejects(pending, error => error.code === 'AUTH_REQUIRED');
  authorized = true;
  assert.equal(store.read('admin'), null);
  const initial = await store.initialize('admin');
  assert.notEqual(initial.digest, receipt.digest, 'new store uses the Web ocean/ground model, not the legacy conversion digest');
  assert.equal(initial.template.content.map.base.policy, 'sea-ground-1');
  assert.ok(initial.template.content.map.base.terrainRef.every(tile => tile === 95));
  assert.equal(initial.version, 1);
  assert.throws(() => store.edit('admin', Array.from({ length: 129 }, () => ({}))), error => error.code === 'COPY_MAP', '129 commands reach semantic validation instead of the retired 128 cap');
  assert.throws(() => store.edit('admin', Array.from({ length: 4097 }, () => ({}))), error => error.code === 'BASE_MAP_EDITS');
  assert.deepEqual(store.capture(), initial, 'budget and semantic rejections never install a prefix');
  const roadToMove = initial.template.content.map.roads.find(road => road.geometry.every(point => point.y < 252));
  assert.throws(() => store.edit('admin', [{ op: 'map-object-translate', layer: 'roads', id: roadToMove.id, dx: 0, dy: 2 }]),
    error => error.status === 422 && error.detail?.problems.some(problem => problem.message.includes(roadToMove.id) && problem.message.includes('請檢查')));
  assert.deepEqual(store.capture(), initial, 'invalid road movement retains the complete persisted snapshot');
  const edited = structuredClone(initial.template);
  Object.values(edited.content.cities)[0].name = '模板新城';
  // As with auto roads, the visible bricks may belong to the decoration
  // layer; the route record itself need not own any component instances.
  const route = edited.content.map.roads[0];
  edited.content.map.decorations.push(...route.components);
  delete route.components;
  const invalid = structuredClone(template);
  invalid.content.map.base.terrainRef[0] = null;
  invalid.content.map.decorations = [];
  assert.throws(() => store.save('admin', invalid));
  const wrongAssets = structuredClone(template);
  wrongAssets.content.editorAssets.springAtlas.sha256 = '0'.repeat(64);
  assert.throws(() => store.save('admin', wrongAssets), error => error.code === 'BASE_MAP_ASSETS_PROTECTED');
  // Capacity is checked before the expensive compiler (even an invalid schema is too large).
  assert.throws(() => store.save('admin', { ...initial.template, schema: 'x'.repeat(64 * 1024 * 1024) }),
    error => error.code === 'BASE_MAP_TOO_LARGE' && error.status === 413 && error.detail.excessBytes === error.detail.bytes - 64 * 1024 * 1024);
  const wrongOrigin = structuredClone(template);
  wrongOrigin.provenance.sourceDigest = '0'.repeat(64);
  assert.throws(() => store.save('admin', wrongOrigin), error => error.code === 'BASE_MAP_PROVENANCE_PROTECTED');
  failCommit = true;
  assert.throws(() => store.save('admin', edited), /injected rollback/);
  failCommit = false;
  assert.deepEqual(store.capture(), initial);
  const saved = store.save('admin', edited);
  assert.equal(saved.version, 2);
  assert.notEqual(saved.digest, initial.digest);
  assert.equal(initial.template.content.cities['city-000'].name, '北平');
  assert.deepEqual(await store.initialize('admin'), saved);
  assert.equal(loads, 2, 'reentry does not re-import');
  saved.template.content.cities['city-000'].name = 'unsaved mutation';
  assert.equal(store.capture().template.content.cities['city-000'].name, '模板新城');
  storage.close();
  storage = openStorage(filename);
  const reopened = new SystemBaseMapStore({ storage, principal, loadInitialTemplate: () => { throw new Error('must not reconvert'); } });
  assert.equal((await reopened.initialize('admin')).version, 2);
  assert.equal(reopened.capture().template.content.cities['city-000'].name, '模板新城');
  const stamp = { op: 'decoration-place', instanceId: `system-base-map#decoration-${'8'.repeat(64)}`, materialId: 'tile-12', variantRef: 'original', x: 0, y: 0, waterClass: null };
  const rejected = {};
  assert.throws(() => reopened.edit('admin', [{ ...stamp, materialId: 'tile-205' }], rejected), e => e.status === 422,
    'an apparent decoration adding a stray city node must still fail the composed node scan');
  assert.equal(rejected.lane, 'roads-cities'); assert.equal(reopened.capture().version, 2);
  const metrics = {}, direct = reopened.edit('admin', [stamp], metrics);
  assert.equal(metrics.lane, 'direct'); assert.equal(metrics.validateCompileMs, undefined); assert.equal(metrics.roadsPositionsMs, undefined);
  const persisted = reopened.capture(); assert.equal(persisted.version, 3); assert.equal(persisted.digest, direct.digest);
  assert.ok(persisted.template.content.map.decorations.some(i => i.id === stamp.instanceId));
  const packed = reopened.edit('admin', [{ op: 'cell-convert' }], {});
  const compact = reopened.capture();
  assert.equal(compact.digest, packed.digest); assert.equal(compact.template.content.map.format, 'cell-map-1');
  assert.equal(compact.template.content.map.decorations, undefined); assert.deepEqual(compact.template.content.selectionGroups, []);
  const cell = { op:'cell-paint', points:[{x:0,y:0}], tile:95 };
  const blocked = compact.template.content.map.placements[0];
  assert.throws(() => reopened.edit('admin',[cell,{...cell,points:[{x:blocked.x,y:blocked.y}]}]),e=>e.status===422);
  assert.equal(reopened.capture().digest,packed.digest);
  const written = reopened.edit('admin',[cell],{});
  assert.equal(reopened.capture().digest,written.digest);
  assert.equal(Buffer.from(reopened.capture().template.content.map.cellsLE,'base64').readUInt16LE(0),95);
  // Repaint a tile on 北平's actual corridor: clearing it drops the edge, the final plane restores it at save.
  const cm = compact.template.content.map, corridor = cm.roads.find(r => r.fromCityId === 'city-000' || r.toCityId === 'city-000');
  const point = corridor.geometry[Math.floor(corridor.geometry.length / 2)], i = (point.y-cm.bounds.minY)*cm.bounds.width + point.x-cm.bounds.minX;
  const tile = Buffer.from(cm.cellsLE,'base64').readUInt16LE(2*i);
  reopened.edit('admin',[{op:'cell-clear',points:[{x:point.x,y:point.y}]},{op:'cell-stamp',x:point.x,y:point.y,tile}],{});
  const restored = reopened.capture().template.content.map.roads;
  assert.equal(restored.length, cm.roads.length);
  assert.ok(restored.some(r=>r.id.includes('#road-auto-') && [r.fromCityId,r.toCityId].includes(corridor.fromCityId) && [r.fromCityId,r.toCityId].includes(corridor.toCityId)));
  // All cities remain reachable; a newly orphaned road tile must still block the whole batch.
  const prior=reopened.capture();
  assert.throws(()=>reopened.edit('admin',[cell,{op:'cell-stamp',tile:184,x:0,y:0}],{}),e=>e.status===422 && e.detail.problems.some(p=>p.message.includes('道路未接通')));
  assert.equal(reopened.capture().digest,prior.digest);
  const clearMetrics={};reopened.edit('admin',[{op:'cell-clear',points:[{x:0,y:0}]}],clearMetrics);
  assert.equal(clearMetrics.lane,'direct');assert.equal(clearMetrics.validateCompileMs,undefined);
  // A bound leaf town may stand alone: remove its entire corridor, keep its identity and save/reload.
  const leaf=cm.placements.find(p=>restored.filter(r=>[r.fromCityId,r.toCityId].includes(p.cityId)).length===1);
  const leafRoad=restored.find(r=>[r.fromCityId,r.toCityId].includes(leaf.cityId));
  const detached=reopened.edit('admin',[{op:'cell-clear',points:leafRoad.geometry.map(({x,y})=>({x,y}))}],{});
  const detachedMap=reopened.capture();assert.equal(detachedMap.digest,detached.digest);
  assert.deepEqual(detachedMap.template.content.map.placements.find(p=>p.id===leaf.id),leaf);
  assert.ok(detachedMap.template.content.map.roads.every(r=>![r.fromCityId,r.toCityId].includes(leaf.cityId)));
  const concurrentStorage = openStorage(join(directory, 'concurrent.sqlite'));
  try {
    let finish, requests = 0;
    const concurrent = new SystemBaseMapStore({ storage: concurrentStorage, principal, loadInitialTemplate: () => ++requests === 1
      ? new Promise(resolve => { finish = () => resolve(structuredClone(template)); }) : structuredClone(template) });
    const late = concurrent.initialize('admin');
    await concurrent.initialize('admin');
    const newest = concurrent.save('admin', edited);
    finish();
    assert.deepEqual(await late, newest, 'late initialization cannot overwrite an installed edit');
  } finally { concurrentStorage.close(); }
  storage.sql.exec("UPDATE system_base_map SET digest=? WHERE singleton=1", '0'.repeat(64));
  assert.throws(() => reopened.capture(), error => error.code === 'BASE_MAP_CORRUPT');
  console.log(JSON.stringify({ passed: true, initialDigest: initial.digest, legacyConversionDigest: receipt.digest, checks: ['real-sqlite-singleton', 'admin-only',
    'post-await-auth-recheck', 'no-template-refusal', 'invalid-save-retains-current', 'trusted-assets-protected',
    'conversion-origin-protected', 'transaction-rollback', 'isolated-snapshot', 'reentry-no-conversion',
    'reopen-preserves-edits', 'late-initialize-preserves-edits', 'corrupt-digest-refusal'], scope: 'store only; HTTP/schema-inventory/purge covered by separate lanes' }, null, 2));
} finally {
  storage.close();
  rmSync(directory, { recursive: true, force: true });
}
