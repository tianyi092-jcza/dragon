// Actual fixed-library stager + InstalledSourceCatalog + owned file SQLite.
// Optional actual owned R2; legacy rows/objects are explicitly seeded fixture data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { openStorage } from '../vps/sqlite-port.mjs';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { installedAvailableLibraryPolicy } from '../server/sourcecatalogpolicy.js';
import { HttpError } from '../server/security.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
import { priorAvailableLibrary as previousAvailableLibrary, priorLibraryId as previousLibraryId, priorLibraryDigest as previousLibraryDigest } from './fixtures/previous-available-library.mjs';
assert.ok(process.argv.slice(2).every(arg => arg === '--workerd'));
const workerd = process.argv.includes('--workerd'), own = mkdtempSync(join(tmpdir(), 'dragon-library-refresh-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.concat(encodeSourceChunks(value));
const manifest = readFileSync('server/available-library.txt'), oldManifest = previousAvailableLibrary(manifest);
const policy = installedAvailableLibraryPolicy(manifest);
let oldJSON;
try { oldJSON = JSON.parse(oldManifest.toString('utf8')); }
catch (cause) { throw new Error('owned previous manifest JSON invalid', { cause }); }
const previousPolicy = { ...policy, registryId: previousLibraryId, manifestDigest: previousLibraryDigest,
  programHashes: oldJSON.programHashes,
  roles: policy.roles.map(role => role.path === 'available-library-manifest.json' ? { ...role, sha256: previousLibraryDigest } : role) };
let storage, mf, bucket, checks = 0, outbound = 0, writes = 0, hook, readFailure;
let reads = 0;
const check = label => { checks++; process.stdout.write('ok ' + label + '\n'); };
const objects = new Map(), keys = new Set();
const key = (id, digest) => `installed/${id}/${digest}`;
const principal = () => ({ id: 'owned-admin', epoch: 1, role: 'admin', must_change: 0 });
const reject = (action, code) => assert.rejects(action, error => error.code === code);
try {
  if (workerd) {
    let modulePath;
    try { modulePath = createRequire(import.meta.url).resolve('miniflare'); }
    catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
    const { Miniflare } = await import(pathToFileURL(modulePath).href);
    mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("owned")}}', compatibilityDate: '2026-01-01',
      r2Buckets: ['OWNED'], r2Persist: join(own, 'r2'), host: '127.0.0.1', port: 0,
      outboundService: () => { outbound++; return new Response('forbidden', { status: 403 }); } });
    bucket = await mf.getR2Bucket('OWNED');
  }
  function allowed(path) {
    assert.ok([policy.registryId, previousLibraryId].some(id => path.startsWith(`installed/${id}/`)));
    assert.match(path.split('/').at(-1), /^[a-f0-9]{64}$/);
  }
  const r2 = {
    async get(path) {
      allowed(path); reads++; let result;
      if (bucket) result = await bucket.get(path);
      else if (objects.has(path)) {
        const bytes = Buffer.from(objects.get(path));
        result = { size: bytes.length, body: new Response(bytes).body, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
      }
      hook?.(path);
      const failure = readFailure;
      if (failure?.point === 'get') { failure.transition(); throw failure.error; }
      if (failure?.point === 'body') {
        assert.ok(result?.body);
        const reader = result.body.getReader();
        return { size: result.size, body: { getReader: () => ({
          async read() { await reader.read(); failure.transition(); throw failure.error; },
          async cancel() { failure.cancels++; await reader.cancel(); },
          releaseLock() { failure.releases++; reader.releaseLock(); },
        }) } };
      }
      return result ?? null;
    },
    async put(path, bytes, options) {
      allowed(path); writes++; keys.add(path);
      if (bucket) return bucket.put(path, bytes, options);
      if (objects.has(path) && options?.onlyIf?.etagDoesNotMatch === '*') return null;
      objects.set(path, Buffer.from(bytes)); return { key: path };
    },
  };
  async function put(id, bytes) {
    const descriptor = { sha256: sha(bytes), byteLength: bytes.length };
    const path = key(id, descriptor.sha256);
    if (!await r2.get(path)) assert.ok(await r2.put(path, bytes, { onlyIf: { etagDoesNotMatch: '*' } }));
    return descriptor;
  }
  const staged = await stageInstalledAvailableLibrary(r2), count = writes;
  assert.equal(staged.registryId, policy.registryId);
  assert.deepEqual(await stageInstalledAvailableLibrary(r2), staged); assert.equal(writes, count);
  check('actual 400-role staging and retry verifies current consumer fingerprints without overwrites');
  const currentIndex = decodeSourceChunks([new Uint8Array(await (await r2.get(key(policy.registryId, staged.root.sha256))).arrayBuffer())]);
  const oldRoles = [];
  for (const role of currentIndex.roles) {
    if (role.path === 'available-library-manifest.json') {
      oldRoles.push({ ...role, sha256: previousLibraryDigest, chunks: [await put(previousLibraryId, oldManifest)] });
    } else {
      for (const part of role.chunks) await put(previousLibraryId, new Uint8Array(await (await r2.get(key(policy.registryId, part.sha256))).arrayBuffer()));
      oldRoles.push(role);
    }
  }
  const oldDefinition = sha(encode(previousPolicy));
  const oldRootBytes = encode({ schema: currentIndex.schema, registryId: previousLibraryId, definitionDigest: oldDefinition, roles: oldRoles });
  const oldRoot = await put(previousLibraryId, oldRootBytes);
  const oldObjects = new Map();
  for (const path of keys) if (path.startsWith(`installed/${previousLibraryId}/`)) oldObjects.set(path, sha(new Uint8Array(await (await r2.get(path)).arrayBuffer())));
  storage = openStorage(join(own, 'authority.db'));
  storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY)'); storage.sql.exec('INSERT INTO users VALUES(?)', principal().id);
  let catalog = new InstalledSourceCatalog({ storage, bucket: r2, principal, policy });
  storage.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', previousLibraryId, oldDefinition, oldRoot.sha256, oldRoot.byteLength, '1', principal().id, '2026-01-01T00:00:00.000Z');
  const oldRow = storage.sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', previousLibraryId).toArray()[0];
  // An actual old operation-key row must not be reused for the new definition.
  storage.sql.exec('INSERT INTO source_operations VALUES(?,?,?,?,?,?)', principal().id, 'owned-previous-operation', 'a'.repeat(64), 1, previousLibraryId, '{}');
  const oldOperation = storage.sql.exec('SELECT * FROM source_operations').toArray();
  assert.throws(() => catalog.status('owned', policy.registryId), error => error.code === 'SOURCE_NOT_REGISTERED');
  assert.throws(() => catalog.status('owned', previousLibraryId), error => error.code === 'SOURCE_NOT_REGISTERED');
  await reject(() => catalog.install('owned', policy.registryId, staged.root, 'owned-previous-operation'), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(storage.sql.exec('SELECT * FROM source_operations').toArray(), oldOperation);
  check('old registry is not silently upgraded and old permanent operation key cannot approve the new definition');
  // A correctly hashed old index still fails identity when transplanted to the new namespace.
  await put(policy.registryId, oldRootBytes);
  await reject(() => catalog.install('owned', policy.registryId, oldRoot, 'owned-old-root-rejected'), 'SOURCE_INDEX_IDENTITY');
  assert.equal(storage.sql.exec('SELECT count(*) AS n FROM installed_sources').toArray()[0].n, 1);
  check('old root cannot register as the new policy despite correct content SHA');
  const installed = await catalog.install('owned', policy.registryId, staged.root, 'owned-current-operation');
  assert.deepEqual(await catalog.install('owned', policy.registryId, staged.root, 'owned-current-operation'), installed);
  assert.equal(storage.sql.exec('SELECT count(*) AS n FROM installed_sources').toArray()[0].n, 2);
  const captured = await catalog.loadFull('owned', policy.registryId);
  assert.deepEqual(Buffer.from(captured.readWeb('available-library-manifest.json')), manifest);
  for (const role of policy.roles) assert.equal(sha(captured.readWeb(role.path)), role.sha256);
  check('explicit new installation, permanent replay and full 400-role capture coexist with old registration');
  const newRow = storage.sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', policy.registryId).toArray()[0];
  storage.sql.exec("UPDATE installed_sources SET row_revision='2' WHERE registry_id=?", policy.registryId);
  assert.throws(() => catalog.assertCapture('owned', captured), error => error.code === 'SOURCE_CHANGED');
  assert.throws(() => captured.readWeb(policy.roles[0].path), error => error.code === 'SOURCE_CHANGED');
  storage.sql.exec('UPDATE installed_sources SET row_revision=? WHERE registry_id=?', newRow.row_revision, policy.registryId);
  check('captured read and assertion reject an intervening registration change');
  let revoked = false; hook = () => { revoked = true; };
  await reject(() => new InstalledSourceCatalog({ storage, bucket: r2, policy, principal: () => {
    if (revoked) throw new HttpError(401, 'SESSION_INVALID'); return principal();
  } }).loadFull('owned', policy.registryId).finally(() => { hook = undefined; }), 'SESSION_INVALID');
  check('real object await followed by session revocation denies capture');
  // Actual catalog/install paths, with failure injected after the owned GET or
  // first real stream read. Actor/source transitions are explicit port fixtures.
  for (const operation of ['load', 'install']) for (const point of ['get', 'body']) {
    const transitions = operation === 'load' ? ['unchanged', 'epoch', 'revoked', 'source'] : ['unchanged', 'epoch', 'revoked'];
    for (const transition of transitions) {
      const actor = principal(), original = new Error('owned catalog IO failure');
      let sessionRevoked = false, transitionsSeen = 0;
      const guarded = new InstalledSourceCatalog({ storage, bucket: r2, policy, principal: () => {
        if (sessionRevoked) throw new HttpError(401, 'SESSION_INVALID');
        return { ...actor };
      } });
      const rows = () => JSON.stringify(['installed_sources', 'source_operations'].map(table => storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray()));
      const beforeRows = rows(), beforeReads = reads, beforeWrites = writes;
      const failure = { point, error: original, cancels: 0, releases: 0, transition() {
        transitionsSeen++;
        if (transition === 'epoch') actor.epoch++;
        if (transition === 'revoked') sessionRevoked = true;
        if (transition === 'source') storage.sql.exec("UPDATE installed_sources SET row_revision='2' WHERE registry_id=?", policy.registryId);
      } };
      readFailure = failure;
      try {
        const action = () => operation === 'load' ? guarded.loadFull('owned', policy.registryId)
          : guarded.install('owned', policy.registryId, staged.root, 'owned-failure-' + point + '-' + transition);
        if (transition === 'unchanged') await assert.rejects(action, error => error === original);
        else await reject(action, transition === 'source' ? 'SOURCE_CHANGED' : 'SESSION_INVALID');
        assert.equal(transitionsSeen, 1); assert.equal(reads, beforeReads + 1); assert.equal(writes, beforeWrites);
        assert.equal(failure.cancels, point === 'body' ? 1 : 0);
        assert.equal(failure.releases, point === 'body' ? 1 : 0);
      } finally {
        readFailure = undefined;
        storage.sql.exec('UPDATE installed_sources SET row_revision=? WHERE registry_id=?', newRow.row_revision, policy.registryId);
      }
      assert.equal(rows(), beforeRows);
      check(`${operation} ${point} failure rechecks ${transition}, no extra IO/SQL receipt; stream cleanup retained`);
    }
  }
  const part = currentIndex.roles[0].chunks[0], partKey = key(policy.registryId, part.sha256);
  const before = new Uint8Array(await (await r2.get(partKey)).arrayBuffer()), broken = Uint8Array.from(before); broken[0] ^= 1;
  await r2.put(partKey, broken);
  await reject(() => catalog.loadFull('owned', policy.registryId), 'SOURCE_OBJECT_CORRUPT');
  const beforeRetry = writes;
  await assert.rejects(() => stageInstalledAvailableLibrary(r2), /object conflict/); assert.equal(writes, beforeRetry);
  await r2.put(partKey, before);
  assert.deepEqual(storage.sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', policy.registryId).toArray()[0], newRow);
  check('corrupt installed bytes fail capture and retry refuses overwrite without changing SQL');
  storage.close(); storage = openStorage(join(own, 'authority.db'));
  catalog = new InstalledSourceCatalog({ storage, bucket: r2, principal, policy });
  assert.deepEqual(catalog.status('owned', policy.registryId), installed);
  assert.deepEqual(storage.sql.exec('SELECT * FROM installed_sources WHERE registry_id=?', previousLibraryId).toArray()[0], oldRow);
  assert.deepEqual(storage.sql.exec('SELECT * FROM source_operations WHERE op_key=?', 'owned-previous-operation').toArray(), oldOperation);
  const afterRestart = await catalog.loadFull('owned', policy.registryId);
  assert.throws(() => catalog.assertCapture('owned', captured), error => error.code === 'SOURCE_CAPTURE_REQUIRED');
  assert.equal(sha(afterRestart.readWeb('available-library-manifest.json')), policy.manifestDigest);
  for (const [path, digest] of oldObjects) assert.equal(sha(new Uint8Array(await (await r2.get(path)).arrayBuffer())), digest);
  assert.equal(outbound, 0);
  check('restart preserves both SQL identities and every old object; process-local capture cannot be imported');
  process.stdout.write(JSON.stringify({ checks, workerd, roles: policy.roles.length, oldObjects: oldObjects.size, oldRegistry: previousLibraryId, newRegistry: policy.registryId, outbound, scope: 'Actual stager/catalog + owned SQLite; seeded legacy data, not deployed registry migration or runtime compatibility.' }) + '\n');
} finally { storage?.close(); await mf?.dispose(); rmSync(own, { recursive: true, force: true }); }
