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
  assert.equal(initial.digest, receipt.digest);
  assert.equal(initial.version, 1);
  const edited = structuredClone(template);
  Object.values(edited.content.cities)[0].name = '模板新城';
  const invalid = structuredClone(template);
  invalid.content.map.base.terrainRef[0] = null;
  invalid.content.map.decorations = [];
  assert.throws(() => store.save('admin', invalid));
  const wrongAssets = structuredClone(template);
  wrongAssets.content.editorAssets.springAtlas.sha256 = '0'.repeat(64);
  assert.throws(() => store.save('admin', wrongAssets), error => error.code === 'BASE_MAP_ASSETS_PROTECTED');
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
  console.log(JSON.stringify({ passed: true, initialDigest: receipt.digest, checks: ['real-sqlite-singleton', 'admin-only',
    'post-await-auth-recheck', 'no-template-refusal', 'invalid-save-retains-current', 'trusted-assets-protected',
    'conversion-origin-protected', 'transaction-rollback', 'isolated-snapshot', 'reentry-no-conversion',
    'reopen-preserves-edits', 'late-initialize-preserves-edits', 'corrupt-digest-refusal'], scope: 'store only; HTTP/schema-inventory/purge covered by separate lanes' }, null, 2));
} finally {
  storage.close();
  rmSync(directory, { recursive: true, force: true });
}
