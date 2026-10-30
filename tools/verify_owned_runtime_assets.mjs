// Owner-bound resource reads only: real metadata/SQLite/pinned policy, owned
// in-memory bucket and admitted-index fixture. Not a source-install, compiler,
// browser, or publication E2E certificate. Unrequested source chunks are absent
// deliberately: this port must never materialize the administrator's full copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { GameMetadataStore } from '../server/metadata.js';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { OwnedRuntimeAssets } from '../server/runtimeassets.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { fail } from '../server/security.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const db = openStorage(':memory:');
let groups = 0;
try {
  const actors = {
    owner: { id: 'owner', role: 'author', epoch: 1, must_change: 0 },
    other: { id: 'other', role: 'author', epoch: 1, must_change: 0 },
    admin: { id: 'admin', role: 'admin', epoch: 1, must_change: 0 },
  };
  let sessionValid = true, hook = null, cancelled = 0, wrongSize = false;
  const principal = token => { if (!actors[token] || (token === 'owner' && !sessionValid)) fail(401, 'SESSION_INVALID'); return actors[token]; };
  const objects = new Map(), reads = [];
  const bucket = { async get(key) {
    reads.push(key);
    if (hook) await hook('get', key);
    const original = objects.get(key);
    if (!original) return null;
    const bytes = Uint8Array.from(original);
    const body = new ReadableStream({
      async pull(controller) { if (hook) await hook('body', key); controller.enqueue(bytes); controller.close(); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 });
    return { size: bytes.length + (wrongSize ? 1 : 0), body };
  } };
  db.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  for (const id of Object.keys(actors)) db.sql.exec('INSERT INTO users VALUES(?)', id);
  const games = new GameMetadataStore({ storage: db, principal });
  db.sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', G, 'owner', 'Owned', '', null, null, '1', '1', null, '0', 0, 0, 't', 't');
  db.sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?,?,?)', G, '1', `private/${G}/${'a'.repeat(64)}`, 'b'.repeat(64), 'c'.repeat(64), 't');
  const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
  const catalog = new InstalledSourceCatalog({ storage: db, bucket, principal, policy });
  const runtime = new OwnedRuntimeAssets({ storage: db, bucket, principal, games, policy, kind: 'visuals' });
  assert.throws(() => new OwnedRuntimeAssets({ storage: db, bucket, principal, games, policy, kind: 'library' }), /fixed visual runtime role policy required/);
  assert.throws(() => new OwnedRuntimeAssets({ storage: db, bucket, principal, games, policy: { ...policy }, kind: 'visuals' }), /trusted owned runtime asset ports required/);
  assert.deepEqual(runtime.definition(), catalog.definition());
  const base = `content/builtin/compiled/${policy.revision}/`;
  const allowed = [`${base}manifest.json`, ...['map_atlas_', 'map_tiles_'].flatMap(stem => ['spring', 'summer', 'autumn', 'winter'].map(season => `${base}${stem}${season}.png`))];
  const keyOf = digest => `installed/${policy.registryId}/${digest}`;
  const stage = bytes => { const digest = sha(bytes); objects.set(keyOf(digest), Uint8Array.from(bytes)); return { sha256: digest, byteLength: bytes.length }; };
  const roleBytes = new Map();
  const index = { schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest: catalog.definition().definitionDigest, roles: policy.roles.map(role => {
    const chunks = [];
    if (allowed.includes(role.path)) {
      const bytes = readFileSync(new URL(`../web/${role.path}`, import.meta.url));
      assert.equal(sha(bytes), role.sha256); assert.equal(bytes.length, role.byteLength);
      roleBytes.set(role.path, bytes);
      for (let at = 0; at < bytes.length; at += 1048576) chunks.push(stage(bytes.subarray(at, at + 1048576)));
    } else {
      for (let remaining = role.byteLength; remaining > 0; remaining -= 1048576) chunks.push({ sha256: '0'.repeat(64), byteLength: Math.min(remaining, 1048576) });
    }
    return { ...role, chunks };
  }) };
  const originalRoot = stage(Buffer.concat(encodeSourceChunks(index)));
  const setRoot = root => {
    db.sql.exec('UPDATE installed_sources SET root_digest=?,root_byte_length=? WHERE registry_id=?', root.sha256, root.byteLength, policy.registryId);
    db.sql.exec('UPDATE copy_origins SET catalog_root=? WHERE game_id=?', root.sha256, G);
  };
  db.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', policy.registryId, index.definitionDigest, originalRoot.sha256, originalRoot.byteLength, '1', 'admin', 't');
  db.sql.exec('CREATE TABLE copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT, profile_revision TEXT, definition_digest TEXT, catalog_root TEXT)');
  db.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?)', G, policy.registryId, policy.profileRevision, index.definitionDigest, originalRoot.sha256);
  const reference = games.snapshotReference('owner', G, '1');
  const reject = async (fn, code) => assert.rejects(fn, error => error.code === code);
  const capture = () => runtime.capture('owner', reference, allowed);
  const first = await capture();
  for (const path of allowed) assert.deepEqual(Buffer.from(first.readWeb(path)), roleBytes.get(path));
  assert.equal(reads.includes(keyOf('0'.repeat(64))), false);
  const isolated = first.readWeb(allowed[0]); isolated[0] ^= 255;
  assert.deepEqual(Buffer.from(first.readWeb(allowed[0])), roleBytes.get(allowed[0]));
  assert.deepEqual(runtime.assertCapture('owner', first), catalog.definition());
  groups++;

  for (const bad of [[], [allowed[0], allowed[0]], [`${base}game-source.json`], ['private/secret'], ['../../secret'], ['https://outside.invalid/a']]) {
    const count = reads.length;
    await reject(() => runtime.capture('owner', reference, bad), 'SOURCE_RUNTIME_ROLE');
    assert.equal(reads.length, count);
  }
  assert.throws(() => first.readWeb(`${base}game-source.json`), error => error.code === 'SOURCE_RUNTIME_ROLE');
  assert.throws(() => runtime.assertCapture('owner', {}), error => error.code === 'SOURCE_CAPTURE_REQUIRED');
  for (const token of ['other', 'admin']) await reject(() => runtime.capture(token, reference, allowed), 'GAME_NOT_FOUND');
  await reject(() => catalog.loadFull('owner', policy.registryId), 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
  await reject(() => catalog.install('owner', policy.registryId, originalRoot, 'owned-install-0001'), 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
  assert.throws(() => catalog.status('owner', policy.registryId), error => error.code === 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
  groups++;

  const changes = [
    { code: 'SESSION_INVALID', change: () => { actors.owner.epoch++; }, restore: () => { actors.owner.epoch--; } },
    { code: 'SESSION_INVALID', change: () => { sessionValid = false; }, restore: () => { sessionValid = true; } },
    { code: 'PASSWORD_CHANGE_REQUIRED', change: () => { actors.owner.must_change = 1; }, restore: () => { actors.owner.must_change = 0; } },
    { code: 'SOURCE_RUNTIME_CHANGED', change: () => db.sql.exec("UPDATE content_games SET draft_revision='2' WHERE game_id=?", G), restore: () => db.sql.exec("UPDATE content_games SET draft_revision='1' WHERE game_id=?", G) },
    { code: 'GAME_NOT_FOUND', change: () => db.sql.exec("UPDATE content_games SET owner_id='other' WHERE game_id=?", G), restore: () => db.sql.exec("UPDATE content_games SET owner_id='owner' WHERE game_id=?", G) },
    { code: 'GAME_DELETING', change: () => db.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', G, 'owner', 'admin', '1', '2', 't'), restore: () => db.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', G) },
    { code: 'SOURCE_CHANGED', change: () => db.sql.exec("UPDATE installed_sources SET row_revision='2'"), restore: () => db.sql.exec("UPDATE installed_sources SET row_revision='1'") },
    { code: 'SOURCE_RUNTIME_CHANGED', change: () => db.sql.exec("UPDATE copy_origins SET catalog_root=?", 'f'.repeat(64)), restore: () => setRoot(originalRoot) },
  ];
  for (const stageName of ['get', 'body']) for (const change of changes) {
    const cancellationBefore = cancelled;
    hook = async stageNameSeen => { if (stageNameSeen === stageName) { hook = null; change.change(); } };
    try { await reject(capture, change.code); }
    finally { hook = null; change.restore(); }
    if (stageName === 'get') assert.ok(cancelled > cancellationBefore, 'unconsumed stream cancelled on late authority failure');
    groups++;
  }
  // Failed I/O must not bypass the same captured authority/source boundary.
  const ioFailure = new Error('owned runtime I/O failed');
  for (const stageName of ['get', 'body']) {
    hook = async seen => { if (seen === stageName) { hook = null; throw ioFailure; } };
    try { await assert.rejects(capture, error => error === ioFailure); }
    finally { hook = null; }
    groups++;
    for (const change of changes) {
      const readsBefore = reads.length;
      hook = async seen => { if (seen === stageName) { hook = null; change.change(); throw ioFailure; } };
      try {
        await reject(capture, change.code);
        assert.equal(reads.length, readsBefore + 1, 'no follow-up object read after failed root I/O');
      } finally { hook = null; change.restore(); }
      groups++;
    }
  }
  actors.owner.epoch++;
  assert.throws(() => first.readWeb(allowed[0]), error => error.code === 'SESSION_INVALID');
  actors.owner.epoch--;
  groups++;

  wrongSize = true;
  try { await reject(capture, 'SOURCE_OBJECT_CORRUPT'); } finally { wrongSize = false; }
  const rootKey = keyOf(originalRoot.sha256), rootBytes = objects.get(rootKey);
  objects.delete(rootKey);
  try { await reject(capture, 'SOURCE_OBJECT_MISSING'); } finally { objects.set(rootKey, rootBytes); }
  objects.set(rootKey, Uint8Array.from(rootBytes, (byte, i) => i === 0 ? byte ^ 1 : byte));
  try { await reject(capture, 'SOURCE_OBJECT_CORRUPT'); } finally { objects.set(rootKey, rootBytes); }
  groups++;

  // pi-lens-ignore: no-array-reverse-mutation-js
  for (const corrupt of [value => { value.roles[0].path = 'private/secret'; }, value => { value.roles[0].chunks[0].byteLength++; }, value => { value.extra = true; }, value => { value.roles.reverse(); }]) {
    const bad = structuredClone(index); corrupt(bad);
    setRoot(stage(Buffer.concat(encodeSourceChunks(bad))));
    try { await reject(capture, 'SOURCE_RUNTIME_INDEX'); } finally { setRoot(originalRoot); }
    groups++;
  }
  const bad = structuredClone(index), role = bad.roles.find(entry => entry.path === allowed[0]);
  const corrupted = Uint8Array.from(roleBytes.get(allowed[0])); corrupted[0] ^= 1;
  role.chunks = [stage(corrupted)];
  setRoot(stage(Buffer.concat(encodeSourceChunks(bad))));
  try { await reject(capture, 'SOURCE_ROLE_CORRUPT'); } finally { setRoot(originalRoot); }
  groups++;
  const final = await capture();
  assert.deepEqual(Buffer.from(final.readWeb(allowed[0])), roleBytes.get(allowed[0]));
  process.stdout.write(`owned runtime assets: ${groups} groups passed\n`);
} finally { db.close(); }
