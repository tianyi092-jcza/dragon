// Actual common Request routes, SQLite and FileBucket. Seeded sessions and
// operator-installed fixed sources are explicit seams, NOT login/HTTPS/cloud
// or playable initialization certificates. Only owned temporary data is used.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { installedSourcePolicy, installedAvailableLibraryPolicy } from '../server/sourcecatalogpolicy.js';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
import { createPrivateByteContext } from '../web/src/content/privatebytes.js';
import { decodePNG } from '../server/pngio.js';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { setStrategist } from '../web/src/content/authoring/gamesource.js';
import { trialChapterAssetGaps } from '../server/trials.js';
import { AdminFullCopy } from '../server/admincopy.js';
import { FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { mac, fail } from '../server/security.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';
import { WATER_CLASSES, composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../web/src/editor/mapdisplay.js';
import { componentCells, fillBase, placeComponent, splitDecoration, removeDecorations, splitWaterGroup, createWaterGroup } from '../web/src/editor/componenttools.js';
import { renderMinimapPixels, MINIMAP_SIZES, MINIMAP_STYLE_REVISION } from '../web/src/content/authoring/minimap.js';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
assert.ok(process.argv.length === 2 || process.argv.length === 3 && ['--city-names-only', '--materials-only', '--placement-only', '--base-fill-only', '--map-window-only', '--role-slots-only', '--private-library-only', '--reservation-only', '--portrait-epoch-only', '--topology-fence-only', '--trial-commit-only', '--library-failure-only'].includes(process.argv[2]));
const reservationOnly = process.argv[2] === '--reservation-only';
const privateLibraryOnly = process.argv[2] === '--private-library-only';
const roleSlotsOnly = process.argv[2] === '--role-slots-only';
const mapWindowOnly = process.argv[2] === '--map-window-only';
const baseFillOnly = process.argv[2] === '--base-fill-only';
const placementOnly = process.argv[2] === '--placement-only';
const materialsOnly = process.argv[2] === '--materials-only' || placementOnly || baseFillOnly || mapWindowOnly;
const cityNamesOnly = process.argv[2] === '--city-names-only';
const scratch = mkdtempSync(join(tmpdir(), 'dragon-template-root-'));
const storage = openStorage(join(scratch, 'authority.sqlite')), sql = storage.sql;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', author = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const tokens = { admin: '1'.repeat(64), author: '2'.repeat(64), other: '3'.repeat(64) };
const hashes = Object.fromEntries(Object.entries(tokens).map(([key, token]) => [key, sha(token)]));
const secret = 'a'.repeat(64), origin = 'https://owned-editor.invalid';
const bucket = new FileBucket({ root: join(scratch, 'objects') });
const env = { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: 'Owned-Fixture-Only-1!', EDITOR_BLOBS: bucket };
const make = (options = {}) => new (createEditorApplication(class {}, options))({ storage }, env);
let app = make(), groups = 0, reservationIO = null;
const csrf = Object.fromEntries(await Promise.all(Object.entries(tokens).map(async ([role, token]) => [role, await mac(`csrf:${token}`, secret)])));
const call = async (role, path, body, extra = {}) => {
  const headers = { Cookie: `__Secure-dragon-editor=${tokens[role]}`, Origin: origin, ...extra };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = csrf[role]; headers['Idempotency-Key'] ??= randomUUID(); }
  const response = await app.fetch(new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: response.status, data: await response.json() };
};
const ok = async (role, path, body, extra, status = 200) => { const result = await call(role, path, body, extra); assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const copyInput = name => ({ registryId: app.installedSources.definition().registryId, name, introduction: '' });
try {
  for (const [role, id, account] of [['admin', admin, 'tianyi'], ['author', author, 'template_author'], ['other', other, 'other_author']]) {
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role === 'admin' ? 'admin' : 'author', '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', hashes[role], id, 1, Date.now() + 86400000, Date.now() + 86400000);
  }
  if (process.argv[2] === '--library-failure-only') {
    // Actual Request/auth/metadata/library service; source capture and library
    // loading are explicit failing async ports, not a valid installed copy.
    const target = randomUUID(), time = new Date().toISOString();
    sql.exec('INSERT INTO content_used_ids VALUES(?)', target);
    sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', target, admin, 'owned library fixture', '', '1', '1', null, '1', time, time);
    sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?,?,?)', target, '1', 'owned-library-root', 'a'.repeat(64), 'b'.repeat(64), time);
    const sourceDefinition = app.installedSources.definition(), libraryDefinition = app.availableLibrary.definition();
    for (const definition of [sourceDefinition, libraryDefinition]) {
      sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', definition.registryId, definition.definitionDigest, 'c'.repeat(64), 1, '1', admin, time);
    }
    sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', target, sourceDefinition.registryId, sourceDefinition.definitionDigest, 'c'.repeat(64), FIXED_COPY_PROFILE, 'd'.repeat(64), 1, 'e'.repeat(64), 'a'.repeat(64), 'b'.repeat(64));
    const reference = app.games.snapshotReference(hashes.admin, target, '1');
    let captureCalls = 0, catalogCalls = 0, objectIO = 0, pending;
    const ioFailure = new Error('owned library async failure');
    bucket.get = async () => { objectIO++; throw new Error('unexpected fixture object GET'); };
    bucket.put = async () => { objectIO++; throw new Error('unexpected fixture object PUT'); };
    app.privateDrafts.captureForCompile = async (token, id, revision) => {
      assert.equal(token, hashes.admin); assert.equal(id, target); assert.equal(revision, '1'); captureCalls++;
      await Promise.resolve();
      if (pending.point === 'capture') { pending.change(); throw ioFailure; }
      return { ownerId: admin, authEpoch: 1, reference };
    };
    app.availableLibrary.loadFull = async (token, registryId) => {
      assert.equal(token, hashes.admin); assert.equal(registryId, libraryDefinition.registryId); catalogCalls++;
      await Promise.resolve(); pending.change(); throw ioFailure;
    };
    const tables = ['content_games', 'content_snapshots', 'copy_origins', 'installed_sources', 'content_deletion_fences', 'source_operations', 'draft_requests', 'draft_objects', 'trial_sessions', 'content_releases'];
    const rows = () => tables.map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
    const baseline = rows();
    const transitions = {
      unchanged: { status: 500, code: 'INTERNAL_ERROR', change() {} },
      owner: { status: 404, code: 'GAME_NOT_FOUND', change() { sql.exec('UPDATE content_games SET owner_id=? WHERE game_id=?', other, target); } },
      snapshot: { status: 409, code: 'LIBRARY_SNAPSHOT_CHANGED', change() { sql.exec('UPDATE content_snapshots SET source_digest=? WHERE game_id=?', 'f'.repeat(64), target); } },
      origin: { status: 409, code: 'DRAFT_SOURCE_CHANGED', change() { sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', 'f'.repeat(64), target); } },
      fence: { status: 409, code: 'GAME_DELETING', change() { sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', target, admin, admin, '1', '2', time); } },
      epoch: { status: 401, code: 'SESSION_INVALID', change() { sql.exec('UPDATE users SET epoch=2 WHERE id=?', admin); } },
    };
    for (const suffix of ['', '/library-000']) for (const point of ['capture', 'catalog']) {
      for (const [transition, expected] of Object.entries(transitions)) {
        const captures = captureCalls, catalogs = catalogCalls;
        pending = { point, change: expected.change };
        try {
          const result = await call('admin', `/api/games/${target}/draft/library-assets${suffix}?revision=1`);
          assert.equal(result.status, expected.status, `${suffix || 'list'} ${point} ${transition}: ${JSON.stringify(result.data)}`);
          assert.deepEqual(result.data, { error: expected.code });
          assert.equal(captureCalls, captures + 1); assert.equal(catalogCalls, catalogs + (point === 'catalog' ? 1 : 0));
          assert.equal(objectIO, 0);
        } finally {
          sql.exec('UPDATE users SET epoch=1 WHERE id=?', admin);
          sql.exec('UPDATE content_games SET owner_id=? WHERE game_id=?', admin, target);
          sql.exec('UPDATE content_snapshots SET source_digest=? WHERE game_id=?', reference.sourceDigest, target);
          sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', 'e'.repeat(64), target);
          sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', target);
        }
        assert.deepEqual(rows(), baseline); groups++;
      }
    }
    for (const point of ['capture', 'catalog']) {
      pending = { point, change: transitions.unchanged.change };
      await assert.rejects(() => app.libraryAssets.read(hashes.admin, { gameId: target }, '1'), error => error === ioFailure);
      assert.deepEqual(rows(), baseline); assert.equal(objectIO, 0); groups++;
    }
    process.stdout.write(JSON.stringify({ groups, captureCalls, catalogCalls, objectIO, scope: '24 actual Request/auth/metadata/library refusals and 2 direct original-error controls, owned SQLite; seeded identities/reference/registrations and failing async capture/catalog ports; no source compilation, valid library bytes, HTTP or runtime admission' }) + '\n');
  } else if (process.argv[2] === '--trial-commit-only') {
    // Only issue/compilation is a fixture. Request authentication, sealing,
    // Trial commit, receipt persistence, replay and SQLite transactions are real.
    const gameId = randomUUID(), time = new Date().toISOString(), rootKey = 'owned-trial-root';
    sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
    sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', gameId, author, 'owned trial fixture', '', '1', '1', null, '1', time, time);
    sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?,?,?)', gameId, '1', rootKey, 'a'.repeat(64), 'b'.repeat(64), time);
    const ids = [randomUUID(), randomUUID(), randomUUID()], issued = [];
    const derived = ['manifest', 'chapter', 'terrain', 'roadGraph', 'roadCost', 'roadOffset', 'minimapBase', 'minimapLarge'].map(assetId => {
      const bytes = Buffer.from(JSON.stringify({ assetId, fixture: true }));
      return { assetId, bytes, byteLength: bytes.length, sha256: sha(bytes) };
    });
    app.trialSessions.issue = async (tokenHash, id, revision, chapterId) => {
      assert.equal(tokenHash, hashes.author); assert.equal(id, gameId); assert.equal(revision, '1'); assert.equal(chapterId, 'owned-chapter');
      const actor = app.principal(tokenHash), reference = app.games.snapshotReference(tokenHash, id, revision);
      assert.ok(issued.length < ids.length);
      const trial = { trialId: ids[issued.length], ownerId: actor.id, gameId: id, draftRevision: revision, chapterId,
        snapshotId: reference.rootKey, snapshotDigest: reference.sourceDigest, manifestDigest: 'c'.repeat(64), authEpoch: actor.epoch,
        state: 'active', endReason: null, createdAt: time, absoluteUntil: actor.absolute_until, limits: 'owned issue fixture, not a playable manifest' };
      issued.push(trial); return { trial, derived };
    };
    const path = `/api/games/${gameId}/trials`, body = { expectedRevision: '1', chapterId: 'owned-chapter' };
    const baseline = await ok('author', path, body, { 'Idempotency-Key': randomUUID() });
    assert.equal(baseline.trialId, ids[0]); assert.equal(issued.length, 1);
    const tables = ['trial_sessions', 'trial_assets', 'operations', 'content_games', 'content_snapshots', 'sessions'];
    const snapshot = () => tables.map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
    const before = snapshot(), key = randomUUID();
    // The fault fires only after this request has inserted its session and all
    // eight assets, proving rollback of the last receipt-persistence boundary.
    sql.exec(`CREATE TEMP TRIGGER owned_trial_receipt_failure BEFORE INSERT ON operations
      WHEN NEW.op_key='${key}' AND EXISTS(SELECT 1 FROM trial_sessions WHERE trial_id='${ids[1]}')
      AND (SELECT COUNT(*) FROM trial_assets WHERE trial_id='${ids[1]}')=8
      BEGIN SELECT RAISE(ABORT, 'OWNED_TRIAL_RECEIPT_FAILURE'); END`);
    const failed = await call('author', path, body, { 'Idempotency-Key': key });
    assert.equal(failed.status, 500); assert.equal(failed.data.error, 'INTERNAL_ERROR'); assert.equal(issued.length, 2);
    assert.deepEqual(snapshot(), before); groups++;
    sql.exec('DROP TRIGGER owned_trial_receipt_failure');
    const retried = await ok('author', path, body, { 'Idempotency-Key': key });
    assert.equal(retried.trialId, ids[2]); assert.equal(issued.length, 3);
    assert.equal(sql.exec('SELECT trial_id FROM trial_sessions WHERE trial_id=?', ids[1]).toArray().length, 0);
    const assets = sql.exec('SELECT * FROM trial_assets WHERE trial_id=? ORDER BY asset_id', ids[2]).toArray();
    assert.equal(assets.length, 8);
    for (const item of derived) {
      const stored = assets.find(row => row.asset_id === item.assetId);
      assert.equal(stored.sha256, item.sha256); assert.equal(stored.byte_length, item.byteLength);
      assert.deepEqual(Buffer.from(stored.bytes), item.bytes); assert.equal(sha(item.bytes), item.sha256);
    }
    assert.equal(sql.exec('SELECT * FROM operations WHERE actor=? AND op_key=?', author, key).toArray().length, 1);
    assert.deepEqual(sql.exec('SELECT * FROM trial_sessions WHERE trial_id=?', ids[0]).toArray(), before[0]);
    assert.deepEqual(sql.exec('SELECT * FROM trial_assets WHERE trial_id=? ORDER BY rowid', ids[0]).toArray(), before[1]); groups++;
    const committed = snapshot();
    assert.deepEqual(committed[2].filter(row => row.op_key !== key), before[2]);
    assert.deepEqual(committed.slice(3, 5), before.slice(3, 5));
    assert.deepEqual(await ok('author', path, body, { 'Idempotency-Key': key }), retried);
    assert.equal(issued.length, 3); assert.deepEqual(snapshot(), committed); groups++;
    const conflict = await call('author', path, { ...body, chapterId: 'changed-chapter' }, { 'Idempotency-Key': key });
    assert.equal(conflict.status, 409); assert.equal(conflict.data.error, 'IDEMPOTENCY_CONFLICT');
    assert.equal(issued.length, 3); assert.deepEqual(snapshot(), committed); groups++;
    assert.equal(committed[0].length, 2); assert.equal(committed[1].length, 16);
    const endPath = `/api/trials/${retried.trialId}/end`, endKey = randomUUID();
    // End has the inverse write set: close the target and remove its assets.
    // Only fail receipt insertion after both changes have actually happened.
    sql.exec(`CREATE TEMP TRIGGER owned_trial_end_receipt_failure BEFORE INSERT ON operations
      WHEN NEW.op_key='${endKey}' AND EXISTS(SELECT 1 FROM trial_sessions WHERE trial_id='${retried.trialId}' AND state='ended' AND end_reason='explicit')
      AND (SELECT COUNT(*) FROM trial_assets WHERE trial_id='${retried.trialId}')=0
      BEGIN SELECT RAISE(ABORT, 'OWNED_TRIAL_END_RECEIPT_FAILURE'); END`);
    const failedEnd = await call('author', endPath, {}, { 'Idempotency-Key': endKey });
    assert.equal(failedEnd.status, 500); assert.equal(failedEnd.data.error, 'INTERNAL_ERROR');
    assert.deepEqual(snapshot(), committed); groups++;
    sql.exec('DROP TRIGGER owned_trial_end_receipt_failure');
    const ended = await ok('author', endPath, {}, { 'Idempotency-Key': endKey });
    assert.equal(ended.trialId, retried.trialId); assert.equal(ended.state, 'ended'); assert.equal(ended.endReason, 'explicit');
    const afterEnd = snapshot(), target = afterEnd[0].find(row => row.trial_id === retried.trialId);
    assert.deepEqual({ ...target }, { ...committed[0].find(row => row.trial_id === retried.trialId), state: 'ended', end_reason: 'explicit' });
    assert.equal(afterEnd[0].length, 2);
    assert.deepEqual(afterEnd[0].filter(row => row.trial_id !== retried.trialId), committed[0].filter(row => row.trial_id !== retried.trialId));
    assert.deepEqual(afterEnd[1], committed[1].filter(row => row.trial_id !== retried.trialId));
    assert.equal(afterEnd[1].length, 8);
    assert.deepEqual(afterEnd[2].filter(row => row.op_key !== endKey), committed[2]);
    assert.equal(afterEnd[2].filter(row => row.op_key === endKey).length, 1);
    assert.deepEqual(afterEnd.slice(3, 5), committed.slice(3, 5)); groups++;
    assert.deepEqual(await ok('author', endPath, {}, { 'Idempotency-Key': endKey }), ended);
    assert.deepEqual(snapshot(), afterEnd); assert.equal(issued.length, 3); groups++;
    const lateDenials = [];
    for (const [role, barrier] of [['author', 'fence'], ['other', 'epoch']]) {
      const owner = role === 'author' ? author : other, lateGame = randomUUID(), lateId = randomUUID();
      sql.exec('INSERT INTO content_used_ids VALUES(?)', lateGame);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', lateGame, owner, 'owned late trial fixture', '', '1', '1', null, '1', time, time);
      sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?,?,?)', lateGame, '1', rootKey, 'a'.repeat(64), 'b'.repeat(64), time);
      let prepared = 0;
      app.trialSessions.issue = async (tokenHash, id, revision, chapterId) => {
        assert.equal(tokenHash, hashes[role]); assert.equal(id, lateGame); assert.equal(revision, '1'); assert.equal(chapterId, body.chapterId);
        const actor = app.principal(tokenHash), reference = app.games.snapshotReference(tokenHash, id, revision);
        const trial = { ...issued[0], trialId: lateId, ownerId: actor.id, gameId: id, snapshotId: reference.rootKey,
          snapshotDigest: reference.sourceDigest, authEpoch: actor.epoch, absoluteUntil: actor.absolute_until };
        prepared++;
        await Promise.resolve();
        // Explicit timing fixture after preparation; no new admission or hook.
        if (barrier === 'fence') sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', id, owner, owner, '1', '2', time);
        else sql.exec('UPDATE users SET epoch=epoch+1 WHERE id=?', owner);
        return { trial, derived };
      };
      const beforeLate = snapshot(), lateKey = randomUUID();
      const rejected = await call(role, `/api/games/${lateGame}/trials`, body, { 'Idempotency-Key': lateKey });
      const status = barrier === 'fence' ? 409 : 401, code = barrier === 'fence' ? 'GAME_DELETING' : 'SESSION_INVALID';
      assert.equal(rejected.status, status); assert.equal(rejected.data.error, code); assert.equal(prepared, 1);
      assert.deepEqual(snapshot(), beforeLate);
      assert.equal(sql.exec('SELECT trial_id FROM trial_sessions WHERE trial_id=?', lateId).toArray().length, 0);
      if (barrier === 'fence') assert.equal(sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?', lateGame).toArray().length, 1);
      else assert.equal(sql.exec('SELECT epoch FROM users WHERE id=?', owner).toArray()[0].epoch, 2);
      for (const item of derived) assert.equal(sha(item.bytes), item.sha256);
      lateDenials.push({ barrier, status, code, prepared }); groups++;
    }
    console.log(JSON.stringify({ groups, rollbackIssueCalls: issued.length, issueCalls: issued.length + lateDenials.reduce((sum, row) => sum + row.prepared, 0), lateDenials, committedTrials: afterEnd[0].length, assetsBeforeEnd: committed[1].length, assets: afterEnd[1].length, receiptRollback: true, endReceiptRollback: true,
      scope: 'Real common Request/session/CSRF/seal/commit/end/remember/replay with owned file SQLite; seeded actors, snapshot metadata and issue payload are explicit fixtures, not compilation, login, HTTPS, workerd or crash durability.' }));
  } else if (process.argv[2] === '--topology-fence-only') {
    // Common Request/auth/SQLite are real; capture returns an explicit small
    // intent-only shape and changes an authorization barrier during its await.
    const cases = [];
    for (const [role, kind, barrier] of [
      ['author', 'move', 'fence'], ['author', 'rebuild', 'fence'],
      ['other', 'move', 'fence'], ['other', 'rebuild', 'fence'],
      ['author', 'move', 'epoch'], ['other', 'rebuild', 'epoch'],
    ]) {
      const owner = role === 'author' ? author : other, gameId = randomUUID(), time = new Date().toISOString();
      sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', gameId, owner, 'owned topology fixture', '', '1', '1', null, '1', time, time);
      const game = { gameId, cities: { 'city-000': { cityId: 'city-000', x: 10, y: 10 }, 'city-001': { cityId: 'city-001', x: 12, y: 10 } }, map: { roads: [{ id: 'road-owned', fromCityId: 'city-000', toCityId: 'city-001', travelKind: 'land' }] } };
      const sourceBefore = structuredClone(game), path = `/api/games/${gameId}/topology`;
      const move = { cityId: 'city-000', x: 11, y: 10 };
      const rebuild = { roadId: 'road-owned', travelKind: 'land', geometry: [{ x: 11, y: 10 }, { x: 12, y: 10 }] };
      let captures = 0, invalidateDuringCapture = false;
      app.privateDrafts.captureForCompile = async (tokenHash, id, revision) => {
        assert.equal(tokenHash, hashes[role]); assert.equal(id, gameId); assert.equal(revision, '1');
        app.games.assertNotDeleting(id); captures++;
        await Promise.resolve();
        if (invalidateDuringCapture) {
          if (barrier === 'fence') sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', gameId, owner, owner, '1', '2', time);
          else sql.exec('UPDATE users SET epoch=epoch+1 WHERE id=?', owner);
        }
        return { game };
      };
      await ok(role, path + '/move', move); await ok(role, path + '/rebuild', rebuild);
      assert.equal(captures, 2);
      const snapshot = () => ['draft_topology_moves', 'draft_topology_rebuilds', 'content_games'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
      const before = snapshot(); invalidateDuringCapture = true;
      const changed = kind === 'move' ? { ...move, x: 10, y: 11 } : { ...rebuild, travelKind: 'water', geometry: [{ x: 10, y: 11 }, { x: 11, y: 11 }] };
      const late = await call(role, path + '/' + kind, changed);
      const deniedStatus = barrier === 'fence' ? 409 : 401, deniedCode = barrier === 'fence' ? 'GAME_DELETING' : 'SESSION_INVALID';
      assert.equal(late.status, deniedStatus); assert.equal(late.data.error, deniedCode);
      assert.equal(captures, 3); assert.deepEqual(snapshot(), before);
      const denials = [];
      const actors = barrier === 'fence' ? [role, role === 'author' ? 'other' : 'author', 'admin'] : [role];
      for (const actor of actors) {
        for (const [suffix, body] of [['', undefined], ['/move', move], ['/rebuild', rebuild], ['/move/clear', { cityId: 'city-000' }], ['/move/clear', {}], ['/rebuild/clear', { roadId: 'road-owned' }]]) {
          const reply = await call(actor, path + suffix, body);
          assert.equal(reply.status, actor === role ? deniedStatus : 404);
          assert.equal(reply.data.error, actor === role ? deniedCode : 'GAME_NOT_FOUND');
          denials.push({ actor, suffix, status: reply.status });
          assert.deepEqual(snapshot(), before);
        }
      }
      assert.equal(captures, 3); assert.deepEqual(game, sourceBefore);
      assert.equal(sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?', gameId).toArray().length, barrier === 'fence' ? 1 : 0);
      if (barrier === 'epoch') assert.equal(sql.exec('SELECT epoch FROM users WHERE id=?', owner).toArray()[0].epoch, 2);
      cases.push({ role, kind, barrier, captures, lateStatus: late.status, denials }); groups++;
    }
    process.stdout.write(JSON.stringify({ groups, cases, scope: 'Actual common Request/session/CSRF routes and owned file SQLite. Explicit small intent-only capture fixtures insert deletion fences or revoke user epoch during await. Epoch cases cover author move and other-author rebuild; subsequent old-session requests never reach capture again. No source installation, blobs, real deletion transaction, login/HTTPS or physical cleanup certification.' }) + '\n');
  } else if (process.argv[2] === '--portrait-epoch-only') {
    // Real Request/authentication/SQLite; the usage-read await is an explicit
    // adapter fixture, not a source/blob or network certificate.
    for (const role of ['author', 'other']) {
      const owner = role === 'author' ? author : other, gameId = randomUUID(), time = new Date().toISOString();
      sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', gameId, owner, 'owned portrait fixture', '', '1', '1', null, '1', time, time);
      let reads = 0;
      const usageDTO = role === 'author'
        ? { chapters: [{ generals: [{ portraitKey: 'p0001' }] }], generalDefinitions: null, chapterPeople: null }
        : { chapters: [{ generals: [] }], generalDefinitions: [{ portraitRef: { assetId: 'p0002' } }, { portraitRef: null }], chapterPeople: [{ people: [
          { included: false, values: { portraitRef: { assetId: '0' } } },
          { included: true, values: { portraitRef: { assetId: 'p0002' } } },
          { included: true, values: { portraitRef: null } },
        ] }] };
      const usageBefore = structuredClone(usageDTO);
      app.privateDrafts.read = async () => { reads++; return usageDTO; };
      const path = `/api/games/${gameId}/portraits`;
      const available = await ok(role, path);
      assert.equal(available.portraits.length, KAO_MANIFEST.length);
      assert.deepEqual(available.portraits.filter(row => row.inUse).map(row => row.assetId).sort(), role === 'author' ? ['p0001'] : ['0', 'p0002']);
      assert.deepEqual(usageDTO, usageBefore);
      await ok(role, path + '/p0001'); assert.equal(reads, 1); groups++;
      const portrait = KAO_MANIFEST.find(row => row.id === (role === 'author' ? '0' : 'p0001'));
      const preview = `${path}/${portrait.id}/bytes?sha256=${portrait.sha256}`;
      assert.equal((await call(role, preview)).data.error, 'PORTRAIT_BYTES_NOT_CONFIGURED');
      const originalApp = app; let byteReads = 0;
      app = make({ readSharedPortrait: async () => { byteReads++; return new Uint8Array(portrait.bytes); } });
      for (const query of ['', '?sha256=bad', `?sha256=${portrait.sha256}&sha256=${portrait.sha256}`, `?sha256=${portrait.sha256}&extra=1`]) assert.equal((await call(role, `${path}/${portrait.id}/bytes${query}`)).status, 422);
      assert.equal((await call(role, `${path}/${portrait.id}/bytes?sha256=${'f'.repeat(64)}`)).status, 409);
      assert.equal((await call(role, `${path}/missing/bytes?sha256=${portrait.sha256}`)).status, 404);
      assert.equal(byteReads, 0);
      assert.equal((await call(role, preview)).data.error, 'PORTRAIT_BYTES_CORRUPT'); assert.equal(byteReads, 1);
      const trialPortraitPath = `/api/trial/web/kao/${portrait.id}.png`;
      assert.equal((await call(role, trialPortraitPath + '?unexpected=1')).status, 422);
      assert.equal((await call(role, '/api/trial/web/kao/missing.png')).status, 404);
      assert.equal(byteReads, 1);
      assert.equal((await call(role, trialPortraitPath)).data.error, 'PORTRAIT_BYTES_CORRUPT'); assert.equal(byteReads, 2);
      app = originalApp;
      const { createEditorService } = await import('../vps/editor-server.mjs');
      const service = createEditorService({ storage, bucket, env });
      assert.equal((await service.fetch(new Request(origin + preview))).status, 401);
      const pixels = await service.fetch(new Request(origin + preview, { headers: { Cookie: `__Secure-dragon-editor=${tokens[role]}`, Origin: origin } }));
      assert.equal(pixels.status, 200); assert.equal(pixels.headers.get('content-type'), 'image/png');
      assert.equal(pixels.headers.get('cache-control'), 'no-store'); assert.equal(pixels.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(pixels.headers.get('x-content-sha256'), portrait.sha256);
      const bytes = new Uint8Array(await pixels.arrayBuffer()); assert.equal(bytes.length, portrait.bytes); assert.equal(sha(bytes), portrait.sha256);
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(reads, 1); groups++;
      assert.equal((await service.fetch(new Request(origin + trialPortraitPath))).status, 401);
      const trialPixels = await service.fetch(new Request(origin + trialPortraitPath, { headers: { Cookie: `__Secure-dragon-editor=${tokens[role]}`, Origin: origin } }));
      assert.equal(trialPixels.status, 200); assert.equal(trialPixels.headers.get('content-type'), 'image/png');
      assert.equal(trialPixels.headers.get('cache-control'), 'no-store'); assert.equal(trialPixels.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(trialPixels.headers.get('x-content-sha256'), portrait.sha256);
      const trialBytes = new Uint8Array(await trialPixels.arrayBuffer());
      assert.deepEqual(trialBytes, bytes); assert.equal(trialBytes.length, portrait.bytes); assert.equal(sha(trialBytes), portrait.sha256);
      assert.equal(reads, 1); groups++;
      app.privateDrafts.read = async () => {
        reads++;
        if (role === 'other') fail(503, 'OWNED_USAGE_UNAVAILABLE');
        throw new Error('owned usage read failure');
      };
      const unavailable = await call(role, path);
      assert.equal(unavailable.status, role === 'other' ? 503 : 500);
      assert.equal(unavailable.data.error, role === 'other' ? 'OWNED_USAGE_UNAVAILABLE' : 'INTERNAL_ERROR');
      assert.equal(Object.hasOwn(unavailable.data, 'portraits'), false);
      assert.equal(reads, 2); groups++;
      // Explicit fence fixture in owned SQLite; no deletion operation or cleanup.
      const fencedGameId = randomUUID(), fencedPath = `/api/games/${fencedGameId}/portraits`;
      sql.exec('INSERT INTO content_used_ids VALUES(?)', fencedGameId);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', fencedGameId, owner, 'owned fence fixture', '', '1', '1', null, '1', time, time);
      const fencedGameBefore = sql.exec('SELECT * FROM content_games WHERE game_id=?', fencedGameId).toArray();
      let fencedReads = 0;
      app.privateDrafts.read = async () => {
        fencedReads++;
        sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', fencedGameId, owner, owner, '1', '2', time);
        return usageDTO;
      };
      const fenced = await call(role, fencedPath);
      assert.equal(fenced.status, 409, 'catalogue must recheck the fence after usage read');
      assert.equal(fenced.data.error, 'GAME_DELETING'); assert.equal(Object.hasOwn(fenced.data, 'portraits'), false);
      for (const suffix of ['', '/p0001', `/${portrait.id}/bytes?sha256=${portrait.sha256}`]) {
        const denied = await call(role, fencedPath + suffix);
        assert.equal(denied.status, 409); assert.equal(denied.data.error, 'GAME_DELETING');
      }
      assert.equal(fencedReads, 1); assert.deepEqual(usageDTO, usageBefore);
      assert.deepEqual(sql.exec('SELECT * FROM content_games WHERE game_id=?', fencedGameId).toArray(), fencedGameBefore);
      assert.equal(sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?', fencedGameId).toArray().length, 1); groups++;
      app.privateDrafts.read = async () => {
        reads++;
        sql.exec('UPDATE users SET epoch=epoch+1 WHERE id=?', owner);
        if (role === 'other') throw new Error('owned failed usage read after revocation');
        return { chapters: [{ generals: [{ portraitKey: 'p0001' }] }] };
      };
      const revoked = await call(role, path);
      assert.equal(revoked.status, 401, role + ' must not receive a catalogue after the usage await revokes its session');
      assert.equal(revoked.data.error, 'SESSION_INVALID');
      assert.equal(Object.hasOwn(revoked.data, 'portraits'), false);
      assert.equal(reads, 3);
      assert.equal((await call(role, path)).status, 401); assert.equal(reads, 3); groups++;
    }
    // Successful reads and reader failures retain their ordinary response when
    // authority remains valid; payload is deliberately an adapter fixture.
    const registryActor = randomUUID(), registryToken = sha(randomUUID());
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', registryActor, registryActor, 'author', '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', sha(registryToken), registryActor, 1, Date.now() + 86400000, Date.now() + 86400000);
    for (const path of ['/api/trial/web/content/builtin/compiled/owned-fixture/manifest.json', '/api/trial/web/assets/owned-fixture.bin']) {
      app = make(); let registryReads = 0;
      const bytes = Buffer.from('owned registry response');
      app.trialRegistryBytes = async () => { registryReads++; return bytes; };
      const request = () => new Request(origin + path, { headers: { Cookie: `__Secure-dragon-editor=${registryToken}`, Origin: origin } });
      const valid = await app.fetch(request());
      assert.equal(valid.status, 200); assert.equal(valid.headers.get('x-content-sha256'), sha(bytes));
      assert.equal(valid.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await valid.arrayBuffer()), bytes);
      app.trialRegistryBytes = async () => { registryReads++; fail(503, 'TRIAL_WEB_REGISTRY'); };
      const failed = await app.fetch(request());
      assert.equal(failed.status, 503); assert.equal((await failed.json()).error, 'TRIAL_WEB_REGISTRY');
      assert.equal(registryReads, 2); groups++;
    }
    // The game-specific preview must recheck a late deletion fence, without
    // turning a shared PNG into a globally revoked resource for other games.
    const lateFenceGame = randomUUID(), retainedGame = randomUUID(), fenceTime = new Date().toISOString();
    for (const gameId of [lateFenceGame, retainedGame]) {
      sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)', gameId, registryActor, 'owned byte fence fixture', '', '1', '1', null, '1', fenceTime, fenceTime);
    }
    const fenceGamesBefore = sql.exec('SELECT * FROM content_games ORDER BY game_id').toArray();
    const sharedPortrait = KAO_MANIFEST[0], sharedBytes = readFileSync(join('web/kao', sharedPortrait.file));
    let fenceByteReads = 0;
    app = make({ readSharedPortrait: async () => {
      if (++fenceByteReads === 1) sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', lateFenceGame, registryActor, registryActor, '1', '2', fenceTime);
      return sharedBytes;
    } });
    const fenceRequest = path => app.fetch(new Request(origin + path, { headers: { Cookie: `__Secure-dragon-editor=${registryToken}`, Origin: origin } }));
    const previewSuffix = `/portraits/${sharedPortrait.id}/bytes?sha256=${sharedPortrait.sha256}`;
    const lateBytes = await fenceRequest(`/api/games/${lateFenceGame}${previewSuffix}`);
    assert.equal(lateBytes.status, 409); assert.equal((await lateBytes.json()).error, 'GAME_DELETING'); assert.equal(fenceByteReads, 1);
    for (const suffix of ['/portraits', `/portraits/${sharedPortrait.id}`, previewSuffix]) {
      const denied = await fenceRequest(`/api/games/${lateFenceGame}${suffix}`);
      assert.equal(denied.status, 409); assert.equal((await denied.json()).error, 'GAME_DELETING');
    }
    assert.equal(fenceByteReads, 1);
    for (const path of [`/api/games/${retainedGame}${previewSuffix}`, `/api/trial/web/kao/${sharedPortrait.id}.png`]) {
      const retained = await fenceRequest(path);
      assert.equal(retained.status, 200); assert.equal(retained.headers.get('x-content-sha256'), sharedPortrait.sha256);
      assert.equal(retained.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await retained.arrayBuffer()), sharedBytes);
    }
    assert.equal(fenceByteReads, 3);
    assert.deepEqual(sql.exec('SELECT * FROM content_games ORDER BY game_id').toArray(), fenceGamesBefore);
    assert.equal(sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?', lateFenceGame).toArray().length, 1); groups++;
    const byteDenials = [];
    for (const barrier of ['epoch', 'disabled', 'absolute-expiry', 'idle-expiry']) for (const target of ['editor-preview', 'trial-web', 'trial-source', 'trial-library']) for (const rejects of [false, true]) {
      const actor = randomUUID(), token = sha(randomUUID()), hash = sha(token);
      sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', actor, actor, 'author', '{}', 0, 0, 1, 1, '', '', '', '');
      sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', hash, actor, 1, Date.now() + 86400000, Date.now() + 86400000);
      // This case must reach the byte-reader await, not an earlier fence denial.
      const portrait = KAO_MANIFEST[0], gameId = sql.exec('SELECT game_id FROM content_games AS g WHERE NOT EXISTS (SELECT 1 FROM content_deletion_fences AS f WHERE f.game_id=g.game_id) ORDER BY game_id LIMIT 1').toArray()[0].game_id;
      let byteReads = 0;
      let revokedRows;
      const authorityRows = () => [sql.exec('SELECT * FROM users WHERE id=?', actor).toArray(), sql.exec('SELECT * FROM sessions WHERE token_hash=?', hash).toArray()];
      const gamesBefore = sql.exec('SELECT * FROM content_games ORDER BY game_id').toArray();
      const readBytes = async () => {
        byteReads++;
        if (barrier === 'epoch') sql.exec('UPDATE users SET epoch=epoch+1 WHERE id=?', actor);
        else if (barrier === 'disabled') sql.exec('UPDATE users SET disabled=1 WHERE id=?', actor);
        else if (barrier === 'absolute-expiry') sql.exec('UPDATE sessions SET absolute_until=0 WHERE token_hash=?', hash);
        else sql.exec('UPDATE sessions SET idle_until=0 WHERE token_hash=?', hash);
        revokedRows = authorityRows();
        if (rejects) throw new Error('owned portrait read failed after authority change');
        return readFileSync(join('web/kao', portrait.file));
      };
      app = make({ readSharedPortrait: readBytes });
      // Registry decoding is not under test here: replace the already-assembled
      // byte port to isolate the authenticated route's post-await authority.
      if (target === 'trial-source' || target === 'trial-library') app.trialRegistryBytes = readBytes;
      const endpoint = {
        'trial-web': `/api/trial/web/kao/${portrait.id}.png`,
        'editor-preview': `/api/games/${gameId}/portraits/${portrait.id}/bytes?sha256=${portrait.sha256}`,
        'trial-source': '/api/trial/web/content/builtin/compiled/owned-fixture/manifest.json',
        'trial-library': '/api/trial/web/assets/owned-fixture.bin',
      }[target];
      const reply = await app.fetch(new Request(origin + endpoint, { headers: { Cookie: `__Secure-dragon-editor=${token}`, Origin: origin } }));
      assert.equal(reply.status, 401); assert.equal((await reply.json()).error, 'SESSION_INVALID'); assert.equal(byteReads, 1);
      const again = await app.fetch(new Request(origin + endpoint, { headers: { Cookie: `__Secure-dragon-editor=${token}`, Origin: origin } }));
      assert.equal(again.status, 401); assert.equal((await again.json()).error, 'SESSION_INVALID'); assert.equal(byteReads, 1);
      assert.deepEqual(authorityRows(), revokedRows);
      assert.deepEqual(sql.exec('SELECT * FROM content_games ORDER BY game_id').toArray(), gamesBefore);
      byteDenials.push({ barrier, target, rejects, status: reply.status, retryStatus: again.status, byteReads }); groups++;
    }
    process.stdout.write(JSON.stringify({groups,byteDenials,scope:'Actual common Request and SQLite session epochs; real Node adapter reads fixed manifest PNG 0/p0001 through editor preview and Trial web-relative paths with identical bytes/length/SHA and no-store, unconfigured/corrupt/bad-query refusal, resolve/reject byte-reader epoch fixtures for both routes return401; explicit legacy/native override and neutral definition/chapter portrait-reference fixtures (including inactive configuration and null references); usage-read errors stay 500/503 without fabricated usage flags; catalogue rejects409 when an explicit SQLite fence fixture appears during usage await, subsequent catalogue/descriptor/bytes deny before read with game metadata unchanged; no physical deletion. A late byte-read fence rejects the game preview and subsequent catalogue/descriptor/bytes without another read; the same shared PNG remains readable through an unfenced game and authenticated Trial web route. Two usage-read fixtures revoke epoch during await. Thirty-two byte-reader fixtures independently change epoch, disabled flag, absolute expiry or idle expiry during await (resolve/reject for each of four routes, including both Trial registry catalog selections with an explicit assembled-byte adapter); both the late response and next request are 401, the next request performs no byte read, and changed authority rows/game metadata remain intact. These are explicit SQL boundary fixtures, not actual account-management operations or elapsed-wall-clock tests. No fixed-source installation, blob reads, login, HTTPS, browser decode or full authorization matrix.'}) + '\n');
  } else {
  const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
  const put = async bytes => {
    const ref = { sha256: sha(bytes), byteLength: bytes.length }, key = `installed/${policy.registryId}/${ref.sha256}`;
    if (!await bucket.get(key)) await bucket.put(key, bytes, {});
    return ref;
  };
  const roles = [];
  for (const role of policy.roles) {
    const bytes = readFileSync(join('web', role.path)); assert.equal(sha(bytes), role.sha256);
    const chunks = [];
    for (let at = 0; at < bytes.length; at += 1048576) chunks.push(await put(bytes.subarray(at, at + 1048576)));
    roles.push({ ...role, chunks });
  }
  const definitionDigest = app.installedSources.definition().definitionDigest;
  const root = await put(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  await app.installedSources.install(hashes.admin, policy.registryId, root, 'owned-template-install-01');
  if (reservationOnly) {
    // Legacy authority is explicit SQL fixture data, not a fabricated publication
    // receipt. Requests, principal checks, catalogue registration and stores are real.
    const legacy = new Map();
    for (const [role, owner, name] of [['author', author, '舊作者名'], ['admin', admin, '舊管理名']]) {
      const gameId = randomUUID(), releaseId = randomUUID(), digest = 'a'.repeat(64), time = new Date().toISOString();
      const pin = JSON.stringify({gameId,name,ordinal:'1.0',revision:'1',sourceDigest:digest});
      sql.exec('INSERT INTO content_used_ids VALUES(?)',gameId);
      sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,?, ?,0,0,?,?)',gameId,owner,'草稿名','', '1','1',releaseId,'1',time,time);
      sql.exec('INSERT INTO content_names VALUES(?,?,?)',owner,'草稿名',gameId);
      sql.exec('INSERT INTO content_releases VALUES(?,?,?,?,?,?)',gameId,releaseId,'1.0','1',digest,time);
      sql.exec('INSERT INTO published_games VALUES(?,?,?,?)',gameId,owner,pin,time);
      legacy.set(role,{gameId,pin,name});
    }
    reservationIO = { reads: 0, writes: 0 };
    bucket.get = async () => { reservationIO.reads++; throw new Error('reservation must not read objects'); };
    bucket.put = async () => { reservationIO.writes++; throw new Error('reservation must not write objects'); };
    const snapshot = () => ['content_games','content_names','content_reservations','content_operations','copy_requests','copy_origins','copy_objects','content_used_ids','content_releases','published_games'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
    for (const role of ['author','admin']) {
      const path = role === 'author' ? '/api/games' : '/api/admin/copies';
      const input = name => role === 'author' ? {name,introduction:''} : copyInput(name);
      const before = snapshot(), headers = {'Idempotency-Key':randomUUID()};
      for (let replay = 0; replay < 2; replay++) {
        const denied = await call(role,path,input(legacy.get(role).name),headers);
        assert.equal(denied.status,409); assert.equal(denied.data.error,'GAME_NAME_OCCUPIED');
        assert.deepEqual(snapshot(),before);
      }
      groups++;
      sql.exec('UPDATE published_games SET pin_json=? WHERE game_id=?','{',legacy.get(role).gameId);
      const damaged = snapshot(), denied = await call(role,path,input('未占新名'));
      assert.equal(denied.status,503); assert.equal(denied.data.error,'GAME_NAME_STATE_UNKNOWN');
      assert.deepEqual(snapshot(),damaged);
      sql.exec('UPDATE published_games SET pin_json=? WHERE game_id=?',legacy.get(role).pin,legacy.get(role).gameId);
      groups++;
    }
    const key = randomUUID(), body = {name:'舊作者名',introduction:''};
    const reserved = await ok('other','/api/games',body,{'Idempotency-Key':key},202);
    assert.deepEqual(await ok('other','/api/games',body,{'Idempotency-Key':key},202),reserved);
    assert.equal(sql.exec('SELECT profile_revision FROM copy_requests WHERE game_id=?',reserved.gameId).toArray()[0].profile_revision,FIXED_TEMPLATE_PROFILE);
    const before = snapshot();
    const changed = await call('other','/api/games',{...body,name:'換正文'},{'Idempotency-Key':key});
    assert.equal(changed.status,409); assert.equal(changed.data.error,'IDEMPOTENCY_CONFLICT');
    const duplicate = await call('other','/api/games',body);
    assert.equal(duplicate.status,409); assert.equal(duplicate.data.error,'GAME_NAME_OCCUPIED');
    assert.equal((await call('author','/api/games/create/'+key)).status,404);
    assert.deepEqual(snapshot(),before); groups++;
    const canceled = await ok('other',`/api/games/create/${key}/cancel`,{}, {'If-Match':'"1"'});
    assert.equal(canceled.state,'canceled');
    const replacement = await ok('other','/api/games',body,undefined,202);
    assert.notEqual(replacement.gameId,reserved.gameId); groups++;
    const adminReservation = await ok('admin','/api/admin/copies',copyInput('舊作者名'),undefined,202);
    assert.equal(sql.exec('SELECT profile_revision FROM copy_requests WHERE game_id=?',adminReservation.gameId).toArray()[0].profile_revision,FIXED_COPY_PROFILE);
    assert.deepEqual(reservationIO,{reads:0,writes:0}); groups++;
    // Each route retains its own role gate; administrator is not an author here.
    const roleBefore = snapshot();
    for (const [role, path, body] of [['admin', '/api/games', { name: '角色拒絕', introduction: '' }], ['author', '/api/admin/copies', copyInput('角色拒絕')]]) {
      const denied = await call(role, path, body);
      assert.equal(denied.status, 403); assert.equal(denied.data.error, 'FULL_COPY_ADMIN_REQUIRED');
      assert.deepEqual(snapshot(), roleBefore);
    }
    groups++;
    // Concurrent same-process Requests, not a cross-process SQLite race proof.
    for (const [role, owner] of [['author', author], ['admin', admin]]) {
      const attempts = [' Cafe\u0301 ', 'Café'].map(name => ({
        path: role === 'admin' ? '/api/admin/copies' : '/api/games',
        body: role === 'admin' ? copyInput(name) : { name, introduction: '' }, key: randomUUID(),
        profile: role === 'admin' ? FIXED_COPY_PROFILE : FIXED_TEMPLATE_PROFILE,
      }));
      const replies = await Promise.all(attempts.map(attempt => call(role, attempt.path, attempt.body, { 'Idempotency-Key': attempt.key })));
      assert.deepEqual(replies.map(reply => reply.status).sort(), [202, 409]);
      const winnerIndex = replies.findIndex(reply => reply.status === 202), loserIndex = 1 - winnerIndex;
      const winner = attempts[winnerIndex], loser = attempts[loserIndex], reserved = replies[winnerIndex].data;
      assert.equal(replies[loserIndex].data.error, 'GAME_NAME_OCCUPIED');
      const row = sql.exec('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', owner, winner.key).toArray()[0];
      assert.equal(row.game_id, reserved.gameId); assert.equal(row.profile_revision, winner.profile);
      assert.deepEqual(JSON.parse(row.metadata_json), { name: 'Café', introduction: '' });
      assert.deepEqual(sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', owner, 'Café').toArray().map(row => row.game_id), [reserved.gameId]);
      assert.equal(sql.exec('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', owner, loser.key).toArray().length, 0);
      assert.equal(sql.exec('SELECT * FROM content_reservations WHERE actor=? AND op_key=?', owner, loser.key).toArray().length, 0);
      groups++;
      const held = snapshot();
      assert.deepEqual(await ok(role, winner.path, winner.body, { 'Idempotency-Key': winner.key }, 202), reserved);
      const denied = await call(role, loser.path, loser.body, { 'Idempotency-Key': loser.key });
      assert.equal(denied.status, 409); assert.equal(denied.data.error, 'GAME_NAME_OCCUPIED');
      assert.deepEqual(snapshot(), held); groups++;
      const operationPath = winner.path === '/api/admin/copies' ? '/api/admin/copies/' : '/api/games/create/';
      assert.equal((await ok(role, `${operationPath}${winner.key}/cancel`, {}, { 'If-Match': '"1"' })).state, 'canceled');
      const canceledState = snapshot();
      const oldKey = await ok(role, winner.path, winner.body, { 'Idempotency-Key': winner.key }, 202);
      assert.equal(oldKey.state, 'canceled'); assert.equal(oldKey.gameId, reserved.gameId);
      assert.deepEqual(snapshot(), canceledState); // An old key cannot resurrect the released reservation.
      const retried = await ok(role, loser.path, loser.body, { 'Idempotency-Key': loser.key }, 202);
      assert.notEqual(retried.gameId, reserved.gameId);
      assert.equal(sql.exec('SELECT profile_revision FROM copy_requests WHERE actor=? AND op_key=?', owner, loser.key).toArray()[0].profile_revision, loser.profile);
      assert.deepEqual(sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', owner, 'Café').toArray().map(row => row.game_id), [retried.gameId]);
      // Prior content, origins, objects, used IDs, releases and pins stay unchanged.
      for (const index of [0, 3, 5, 6, 7, 8, 9]) assert.deepEqual(snapshot()[index], held[index]);
      groups++;
    }
    assert.equal(sql.exec('SELECT * FROM content_names WHERE name=?', 'Café').toArray().length, 2);
    assert.deepEqual(reservationIO, { reads: 0, writes: 0 });
  } else {
  const authorSource = new InstalledSourceCatalog({ storage, bucket, principal: h => app.principal(h), policy, readRole: 'author' });
  assert.throws(() => app.installedSources.status(hashes.author, policy.registryId), e => e.code === 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
  await assert.rejects(() => authorSource.install(hashes.author, policy.registryId, root, 'owned-author-install-01'), e => e.code === 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
  const originalGet = bucket.get.bind(bucket); let revocationReads = 0;
  bucket.get = async key => { const object = await originalGet(key); revocationReads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', author); return object; };
  try { await assert.rejects(() => authorSource.loadFull(hashes.author, policy.registryId), e => e.code === 'SESSION_INVALID'); }
  finally { bucket.get = originalGet; sql.exec('UPDATE users SET disabled=0 WHERE id=?', author); }
  assert.equal(revocationReads, 1); groups++;
  const operationKey = 'owned-author-template-01', input = { name: '中立起點', introduction: '作者原文' };
  const reserved = await ok('author', '/api/games', input, { 'Idempotency-Key': operationKey }, 202);
  const profileOf = gameId => sql.exec('SELECT profile_revision FROM copy_requests WHERE game_id=?', gameId).toArray()[0].profile_revision;
  assert.equal(profileOf(reserved.gameId), FIXED_TEMPLATE_PROFILE);
  assert.deepEqual(await ok('author', '/api/games', input, { 'Idempotency-Key': operationKey }, 202), reserved);
  assert.equal((await call('author', '/api/games', { ...input, profileRevision: FIXED_COPY_PROFILE })).status, 422);
  assert.equal((await call('admin', '/api/games', input)).status, 403);
  assert.equal((await call('author', '/api/admin/copies', copyInput('越權'))).status, 403);
  assert.equal((await call('other', '/api/games/create/' + operationKey)).status, 404); groups++;
  const commandKey = 'owned-template-run-001';
  const receipt = await ok('author', `/api/games/create/${operationKey}/run`, {}, { 'If-Match': '"1"', 'Idempotency-Key': commandKey });
  assert.equal(receipt.gameId, reserved.gameId); assert.equal(receipt.draftRevision, '1');
  assert.deepEqual(await ok('author', `/api/games/create/${operationKey}/run`, {}, { 'If-Match': '"1"', 'Idempotency-Key': commandKey }), receipt);
  assert.deepEqual(await ok('author', '/api/games/create/' + operationKey), receipt); groups++;
  const gameId = receipt.gameId, draft = await ok('author', `/api/games/${gameId}/draft?revision=1`);
  assert.equal(draft.profileRevision, FIXED_TEMPLATE_PROFILE); assert.equal(draft.chapters.length, 1); assert.equal(draft.strongholds.length, 192);
  const first = draft.chapters[0]; assert.equal(first.name, '第一章');
  assert.deepEqual([first.factions, first.generals, first.cities], [[], [], []]);
  assert.equal(first.gaps.saveGaps, 0); assert.equal(first.gaps.activeGaps, 3);
  assert.equal((await call('other', `/api/games/${gameId}/draft?revision=1`)).status, 404);
  const captured = await app.privateDrafts.captureForCompile(hashes.author, gameId, '1');
  assert.equal(captured.profileRevision, FIXED_TEMPLATE_PROFILE); assert.equal(captured.game.sourceRef.kind, 'builtin-template');
  assert.deepEqual(captured.game.generals, {}); assert.equal(Object.hasOwn(captured.game, 'sourceRecords'), false); groups++;
  const saveBody = { metadata: { name: '中立修訂', introduction: '' }, resourceEdits: [], chapterEdits: [{ op: 'rename', chapterId: first.chapterId, name: '自訂章' }, { op: 'copy', chapterId: first.chapterId }] };
  const saved = await ok('author', `/api/games/${gameId}/draft/save`, saveBody, { 'If-Match': '"1"', 'Idempotency-Key': 'owned-template-save-001' });
  assert.equal(saved.draftRevision, '2');
  const updated = await ok('author', `/api/games/${gameId}/draft?revision=2`);
  assert.deepEqual(updated.chapters.map(c => c.name), ['自訂章', '自訂章（副本）']);
  assert.ok(updated.chapters.every(c => c.factions.length === 0 && c.generals.length === 0 && c.cities.length === 0 && c.gaps.activeGaps === 3));
  const next = await app.privateDrafts.captureForCompile(hashes.author, gameId, '2');
  assert.deepEqual(next.game.map, captured.game.map); assert.deepEqual(next.game.cities, captured.game.cities);
  assert.equal((await call('author', `/api/games/${gameId}/draft/save`, saveBody, { 'If-Match': '"1"' })).status, 412); groups++;
  sql.exec('UPDATE copy_origins SET profile_revision=? WHERE game_id=?', FIXED_COPY_PROFILE, gameId);
  try {
    const mismatched = await call('author', `/api/games/${gameId}/draft?revision=2`);
    assert.equal(mismatched.status, 422); assert.equal(mismatched.data.error, 'COPY_PROFILE_BASELINE');
    assert.equal((await call('author', '/api/games/create/' + operationKey)).status, 503);
  } finally { sql.exec('UPDATE copy_origins SET profile_revision=? WHERE game_id=?', FIXED_TEMPLATE_PROFILE, gameId); }
  groups++;
  const trial = await call('author', `/api/games/${gameId}/trials`, { expectedRevision: '2', chapterId: first.chapterId });
  assert.equal(trial.status, 409); assert.equal(trial.data.error, 'TRIAL_SNAPSHOT_CHANGED');
  const publication = await call('author', '/api/publish', { gameId, name: '未准入' });
  assert.equal(publication.status, 422); assert.equal(publication.data.error, 'PUBLISH_NOT_COMPILED');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  // Real administrator entry still creates the original independent twenty chapters.
  const adminKey = 'owned-admin-fullcopy-01';
  const ar = await ok('admin', '/api/admin/copies', copyInput('完整原章'), { 'Idempotency-Key': adminKey }, 202);
  await ok('admin', `/api/admin/copies/${adminKey}/run`, {}, { 'If-Match': '"1"' });
  const ad = await ok('admin', `/api/games/${ar.gameId}/draft?revision=1`);
  assert.equal(ad.profileRevision, FIXED_COPY_PROFILE); assert.equal(ad.chapters.length, 20);
  assert.ok(ad.chapters.every(c => c.generals.length === 128 && c.cities.length === 192)); groups++;
  if (privateLibraryOnly) {
    // Existing Node operator adapter: preserve the R2 create-only condition.
    const operatorBucket = { get: key => bucket.get(key), put: (key, bytes, options) => {
      assert.deepEqual(options, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    } };
    const staged = await stageInstalledAvailableLibrary(operatorBucket);
    const libraryPolicy = installedAvailableLibraryPolicy(readFileSync('server/available-library.txt'));
    assert.equal(libraryPolicy.roles.length, 400);
    await app.availableLibrary.install(hashes.admin, staged.registryId, staged.root, 'owned-private-library-install');
    const target = ar.gameId, path = `/api/games/${target}/draft`;
    const listing = await ok('admin', path + '/library-assets?revision=1');
    assert.equal(listing.registryId, libraryPolicy.registryId); assert.equal(listing.catalogRoot, staged.root.sha256);
    assert.equal(listing.assets.length, 398); assert.deepEqual(listing.unresolvedReferences, libraryPolicy.unresolvedReferences);
    const snapshot = app.games.snapshotReference(hashes.admin, target, '1');
    const reference = { gameId: target, draftRevision: '1', sourceDigest: snapshot.sourceDigest, dependencyDigest: snapshot.dependencyDigest };
    assert.equal(listing.sourceDigest, reference.sourceDigest);
    const libraryIdentity = { registryId: listing.registryId, catalogRoot: listing.catalogRoot };
    const savedLibrary = await ok('admin', path + '/save', { metadata: { ...ad.metadata, introduction: '新版不替換舊庫讀取身份' }, resourceEdits: [] }, { 'If-Match': '"1"' });
    assert.equal(savedLibrary.draftRevision, '2');
    const current = app.games.snapshotReference(hashes.admin, target, '2'); groups++;
    let role = 'admin'; const requests = [];
    const ports = { libraryIdentity, subtle: webcrypto.subtle, assertCurrent() {}, async fetcher(url, init) {
      assert.ok(url.startsWith(path + '/library-assets/library-') && url.endsWith('?revision=1'));
      assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'same-origin');
      assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
      const headers = new Headers(init.headers); headers.set('Cookie', `__Secure-dragon-editor=${tokens[role]}`); headers.set('Origin', origin);
      const response = await app.fetch(new Request(origin + url, { ...init, headers }));
      requests.push({ url, status: response.status }); return response;
    } };
    const context = createPrivateByteContext(reference, ports);
    const descriptors = ['application/json', 'image/png', 'audio/flac'].map(mime => {
      const descriptor = listing.assets.filter(asset => asset.mime === mime).sort((a, b) => a.byteLength - b.byteLength)[0];
      assert.ok(descriptor, mime); return descriptor;
    });
    const locator = descriptor => ({ kind: 'private-library', gameId: target, draftRevision: '1', sourceDigest: reference.sourceDigest, ...libraryIdentity, ...descriptor });
    const objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    const requestRows = sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray();
    for (const descriptor of descriptors) {
      const pinned = libraryPolicy.roles.find(item => item.path === descriptor.logicalURL);
      assert.ok(pinned); assert.equal(descriptor.sha256, pinned.sha256); assert.equal(descriptor.byteLength, pinned.byteLength);
      const bytes = await context.read(locator(descriptor));
      assert.equal(bytes.length, pinned.byteLength); assert.equal(sha(bytes), pinned.sha256);
    }
    assert.equal(requests.length, 3);
    assert.deepEqual(['runtimeAllowed', 'trialAllowed', 'releaseAllowed', 'deleteAllowed'].map(key => context[key]), [false, false, false, false]); groups++;
    const selected = locator(descriptors[0]);
    const again = await context.read(selected); again[0] ^= 255;
    const fresh = await context.read(selected); assert.equal(sha(fresh), selected.sha256);
    assert.equal(requests.length, 5);
    assert.deepEqual(sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray(), requestRows);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
    assert.deepEqual(app.games.snapshotReference(hashes.admin, target, '2'), current); groups++;
    for (const binding of [undefined, { ...libraryIdentity, registryId: 'owned-wrong-library' }, { ...libraryIdentity, catalogRoot: '0'.repeat(64) }]) {
      const wrong = createPrivateByteContext(reference, { ...ports, libraryIdentity: binding });
      await assert.rejects(() => wrong.read(selected), /PRIVATE_BYTES_LIBRARY_CONTEXT/); wrong.close();
    }
    assert.equal(requests.length, 5);
    const wrongSource = { ...reference, sourceDigest: '0'.repeat(64) }, wrong = createPrivateByteContext(wrongSource, ports);
    await assert.rejects(() => wrong.read({ ...selected, sourceDigest: wrongSource.sourceDigest }), /PRIVATE_BYTES_HEADER/); wrong.close();
    assert.equal(requests.at(-1).status, 200); groups++;
    role = 'other'; await assert.rejects(() => context.read(selected), /PRIVATE_BYTES_HTTP_403/);
    role = 'admin'; app = make();
    assert.equal(sha(await context.read(selected)), selected.sha256);
    assert.deepEqual(await ok('admin', path + '?revision=1'), ad); groups++;
    const originalGet = bucket.get.bind(bucket); let revokedReads = 0;
    bucket.get = async key => { const object = await originalGet(key); if (key.startsWith('installed/' + libraryIdentity.registryId + '/')) { revokedReads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', admin); } return object; };
    try { await assert.rejects(() => context.read(selected), /PRIVATE_BYTES_HTTP_401/); assert.equal(revokedReads, 1); }
    finally { bucket.get = originalGet; sql.exec('UPDATE users SET disabled=0 WHERE id=?', admin); }
    context.close();
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
    assert.deepEqual(sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray(), requestRows);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  } else if (roleSlotsOnly) {
    const target = ar.gameId, path = `/api/games/${target}/draft`;
    const source = (await app.privateDrafts.captureForCompile(hashes.admin, target, '1')).game;
    const chapterId = source.chapterOrder[0], faction = source.chapters[chapterId].state.factions.find(row => Number.isInteger(row.advisor_idx));
    assert.ok(faction);
    const body = chapterEdits => ({ metadata: ad.metadata, resourceEdits: [], chapterEdits });
    const roleState = source.chapters[chapterId].state;
    const occupied = new Set(roleState.factions.flatMap(row => [row.monarch_idx, row.advisor_idx]));
    const foreign = roleState.generals.find(row => row.idx < 127 && Number.isInteger(row.faction) && row.faction !== faction.idx && !occupied.has(row.idx));
    assert.ok(foreign);
    const edits = [
      { op: 'set-monarch', chapterId, factionIdx: faction.idx, generalIdx: 127 },
      { op: 'set-strategist', chapterId, factionIdx: faction.idx, generalIdx: 127 },
      { op: 'remove-monarch', chapterId, factionIdx: faction.idx, resolution: { successor: 127 } },
      { op: 'set-strategist', chapterId, factionIdx: faction.idx, generalIdx: foreign.idx },
    ];
    const objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    const requestCount = sql.exec('SELECT COUNT(*) AS n FROM draft_requests').toArray()[0].n;
    const originalPut = bucket.put.bind(bucket); let refusedPuts = 0;
    bucket.put = async (...args) => { refusedPuts++; return originalPut(...args); };
    const attempts = [...edits.map(edit => [edit]), [{ op: 'rename', chapterId, name: '不得留下的先行修改' }, edits[1]], [edits[3], { ...edits[1], generalIdx: null }]];
    for (const [index, commands] of attempts.entries()) {
      const key = `owned-reserved-role-${index}`, input = body(commands), headers = { 'If-Match': '"1"', 'Idempotency-Key': key };
      const denied = await call('admin', path + '/save', input, headers);
      assert.equal(denied.status, 422); assert.equal(denied.data.error, 'DRAFT_CHAPTER_EDIT');
      const record = sql.exec('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', admin, key).toArray()[0];
      assert.equal(record.state, 'failed'); assert.equal(record.result_revision, null);
      assert.deepEqual(JSON.parse(record.request_json), input);
      assert.deepEqual(await ok('admin', path + '/operations/' + key), { gameId: target, state: 'failed', expectedRevision: '1', error: 'DRAFT_CHAPTER_EDIT', status: 422 });
      if (index === 1 || index === 3) {
        assert.deepEqual(await call('admin', path + '/save', input, headers), denied);
        assert.equal((await call('admin', path + '/save', body([{ ...edits[1], generalIdx: null }]), headers)).status, 409);
      }
    }
    bucket.put = originalPut;
    assert.equal(refusedPuts, 0); assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_requests').toArray()[0].n, requestCount + attempts.length); groups++;
    for (const role of ['author', 'other']) assert.equal((await call(role, path + '/save', body([edits[1]]), { 'If-Match': '"1"' })).status, 404);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_requests').toArray()[0].n, requestCount + attempts.length);
    app = make();
    assert.deepEqual(await ok('admin', path + '?revision=1'), ad);
    assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.admin, target, '1')).game, source);
    assert.equal((await ok('admin', path + '/operations/owned-reserved-role-1')).state, 'failed'); groups++;
    const clear = { ...edits[1], generalIdx: null };
    const { installDraftEditor: installRoleWriter } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/draft.txt', 'utf8')).toString('base64'));
    const journal = new Map(); let roleModel, key, savedRole, roleWrites = 0;
    const roleActor = { user: { id: admin, role: 'admin', mustChangePassword: false } };
    const roleWriter = installRoleWriter({ authority: () => roleActor,
      publish: value => { roleModel = value; }, isBusy: () => false, work: callback => callback(),
      confirm: text => { assert.ok(text.includes('不補原生計數')); return true; },
      storage: { getItem: name => journal.get(name) ?? null, setItem: (name, value) => journal.set(name, value), removeItem: name => journal.delete(name) },
      api: async (url, input, options) => {
        if (input === undefined) return ok('admin', url);
        assert.equal(url, path + '/save'); assert.deepEqual(input, body([clear]));
        assert.equal(options.revision, '1'); assert.equal(journal.size, 1);
        roleWrites++; key = options.key;
        savedRole = await ok('admin', url, input, { 'If-Match': '"1"', 'Idempotency-Key': key });
        return savedRole;
      },
    });
    roleWriter.setIdentity(roleActor); await roleWriter.actions.refresh(); await roleWriter.actions.chooseGame(target);
    roleWriter.actions.setField('revision', '1'); await roleWriter.actions.load();
    roleWriter.actions.setField('name', '未保存'); roleWriter.actions.setField('revision', '999');
    roleWriter.actions.setResource(chapterId, faction.idx, 'money', '777');
    await roleWriter.actions.clearStrategist(chapterId, faction.idx);
    assert.equal(roleWrites, 1); assert.equal(journal.size, 0);
    assert.equal(roleModel.context.verified, false); assert.equal(roleModel.roles.known, false);
    assert.equal(roleModel.fields.name, '未保存');
    assert.equal(roleModel.resources.find(row => row.chapterId === chapterId).factions.find(row => row.slot === faction.idx).inputs.money, '777');
    assert.equal(savedRole.draftRevision, '2');
    const expected = structuredClone(source); setStrategist(expected, chapterId, faction.idx, null);
    assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.admin, target, '2')).game, expected);
    const afterRole = await ok('admin', path + '?revision=2');
    assert.deepEqual(await ok('admin', path + '?revision=1'), ad); groups++;
    const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', admin, key).toArray()[0].request_json;
    const corrupt = JSON.parse(stored); corrupt.chapterEdits[0].generalIdx = 127;
    sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corrupt), admin, key);
    try {
      assert.equal((await call('admin', path + '?revision=2')).status, 422);
      await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.admin, target, '2'), error => error.status === 422);
      assert.equal((await call('admin', path + '/save', body([]), { 'If-Match': '"2"' })).status, 422);
    } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, admin, key); }
    app = make(); assert.deepEqual(await ok('admin', path + '?revision=2'), afterRole);
    {
      const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(readFileSync('server/public/draft.txt')).toString('base64')}`);
      const actor = { user: { id: admin, mustChangePassword: false }, version: 'owned-role-read' };
      let model, reads = 0;
      const controller = installDraftEditor({ authority: () => actor, isBusy: () => false, publish: value => { model = value; }, work: fn => fn(), confirm: () => true, prompt: () => null,
        storage: { getItem: () => null, setItem: () => assert.fail('role read must not write a journal'), removeItem: () => {} },
        api: async (url, body) => { assert.equal(body, undefined); reads++; return ok('admin', url); } });
      controller.setIdentity(actor); await controller.actions.refresh(); await controller.actions.chooseGame(target);
      for (const [revision, current] of [['1', source], ['2', expected]]) {
        controller.actions.setField('revision', revision); await controller.actions.load();
        const projected = current.chapterOrder.map(chapterId => ({ chapterId,
          factions: current.chapters[chapterId].state.factions.map(f => ({ slot: f.idx, monarchSlot: f.monarch_idx, advisorSlot: f.advisor_idx })),
          generals: current.chapters[chapterId].state.generals.map(g => ({ slot: g.idx, name: g.name, hao: g.hao, factionSlot: g.faction, reserved: g.idx === 127 })),
        }));
        const assetReports = current.chapterOrder.map(chapterId => {
          const gaps = trialChapterAssetGaps(current.chapters[chapterId].state);
          return { chapterId, assets: { total: gaps.length, items: gaps.slice(0, 100), omitted: Math.max(0, gaps.length - 100) } };
        });
        assert.deepEqual(model.chapters.map(chapter => ({ chapterId: chapter.chapterId, assets: chapter.gaps.assets })), assetReports);
        assert.equal(model.roles.known, true); assert.deepEqual(model.roles.chapters, projected);
        const count = reads; model.roles.chapters[0].generals.length = 0;
        model.chapters[0].gaps.assets.items.push({ kind: 'kao', slot: 0, value: 999, logicalURL: 'forged' });
        controller.actions.setField('revision', '999'); controller.render();
        assert.deepEqual(model.chapters.map(chapter => ({ chapterId: chapter.chapterId, assets: chapter.gaps.assets })), assetReports);
        assert.deepEqual(model.roles.chapters, projected); assert.equal(reads, count);
      }
      controller.setIdentity(null); assert.deepEqual(model.chapters, []);
      controller.setIdentity(actor); controller.render();
      assert.equal(model.roles.known, false); assert.deepEqual(model.roles.chapters, []); groups++;
    }
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  } else if (mapWindowOnly) {
    for (const [role, target, initial] of [['author', gameId, '2'], ['admin', ar.gameId, '1']]) {
      const path = `/api/games/${target}/draft`, sourceCapture = await app.privateDrafts.captureForCompile(hashes[role], target, initial), source = sourceCapture.game;
      const covers = new Map(Object.entries(source.map.base.unknownUnderlays).map(([cell, record]) => [record.coveringInstanceId, Number(cell)]));
      let selected, removed, cell;
      for (const instance of source.map.decorations) {
        const at = covers.get(instance.id);
        if (at === undefined || source.componentDefinitions[instance.definitionRef].footprint.length !== 1) continue;
        const candidate = removeDecorations(source, [instance.id]);
        if (composeMapLayers(candidate, { draft: true }).terrain[at] !== null) continue;
        selected = instance.id; removed = candidate; cell = at; break;
      }
      assert.ok(selected, 'fixed input must expose an unknown cell after decoration removal');
      const x = cell % 384, y = Math.floor(cell / 384), width = Math.min(32, 384 - x), height = Math.min(32, 256 - y);
      const query = revision => `${path}/map-window?revision=${revision}&x=${x}&y=${y}&width=${width}&height=${height}`;
      const expectedTiles = game => { const result = composeMapLayers(game, { draft: true }); return Array.from({ length: height }, (_, row) => result.terrain.slice((y + row) * 384 + x, (y + row) * 384 + x + width)).flat(); };
      const before = await ok(role, query(initial));
      assert.deepEqual(before, { format: 'dragon-draft-map-window-1', gameId: target, draftRevision: initial, sourceDigest: sourceCapture.reference.sourceDigest, worldWidth: 384, worldHeight: 256, tileSize: 16, x, y, width, height, tiles: expectedTiles(source), admission: 'display-only' });
      assert.notEqual(before.tiles[0], null); assert.equal(before.tiles.length, width * height);
      const layerQuery = (revision, layers = '1111') => `${path}/map-layer-window?revision=${revision}&x=${x}&y=${y}&width=${width}&height=${height}&layers=${layers}`;
      const objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      let allVisible;
      for (const mask of ['1111', '1000', '0000', '0111', '1011', '1101', '1110']) {
        const visibleLayers = Object.fromEntries(['base','decor','roads','cities'].map((name, index) => [name, mask[index] === '1']));
        const plane = composeMapDisplayLayers(source, visibleLayers).tiles;
        const expected = Array.from({ length: height }, (_, row) => plane.slice((y + row) * 384 + x, (y + row) * 384 + x + width)).flat();
        const actual = await ok(role, layerQuery(initial, mask));
        assert.deepEqual(actual, { ...before, format: 'dragon-draft-map-layer-window-1', visibleLayers, tiles: expected });
        if (mask === '1111') { allVisible = actual; assert.deepEqual(actual.tiles, before.tiles); }
        if (mask === '0000') assert.ok(actual.tiles.every(tile => tile === null));
      }
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, initial)).game, source);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount); groups++;
      for (const mask of ['', '111', '11111', 'abcd', '2222', 'true', '1111&layers=0000', '1111&extra=1']) assert.equal((await call(role, layerQuery(initial, mask))).status, 422);
      assert.equal((await call(role, layerQuery(initial).replace('&layers=1111', ''))).status, 422);
      assert.equal((await call(role, `${query(initial)}&layers=1111`)).status, 422);
      assert.equal((await call(role, layerQuery(initial).replace(`width=${width}`, 'width=33'))).status, 422);
      assert.equal((await call(role, layerQuery('0'))).status, 422);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, layerQuery(initial))).status, 404);
      assert.equal((await app.fetch(new Request(origin + layerQuery(initial)))).status, 401);
      assert.equal((await call(role, `${path}/map-layer-window`, { layers: '1111' })).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount); groups++;
      const selectionQuery = revision => `${path}/decoration-selection?revision=${revision}&x=${x}&y=${y}&width=1&height=1`;
      const selectionIds = game => game.map.decorations.filter(instance => componentCells(game, instance).some(([cx, cy]) => cx === x && cy === y)).map(instance => instance.id);
      const selectedBefore = await ok(role, selectionQuery(initial));
      assert.deepEqual(selectedBefore, { format: 'dragon-draft-decoration-selection-1', gameId: target, draftRevision: initial, sourceDigest: sourceCapture.reference.sourceDigest,
        worldWidth: 384, worldHeight: 256, tileSize: 16, x, y, width: 1, height: 1, instanceIds: selectionIds(source), admission: 'display-only' });
      assert.ok(selectedBefore.instanceIds.includes(selected));
      const fullSelection = await ok(role, `${path}/decoration-selection?revision=${initial}&x=0&y=0&width=384&height=256`);
      assert.deepEqual(fullSelection.instanceIds, source.map.decorations.map(instance => instance.id));
      const last = await ok(role, `${path}/map-window?revision=${initial}&x=383&y=255&width=1&height=1`);
      assert.deepEqual(last.tiles, [composeMapLayers(source, { draft: true }).terrain.at(-1)]);
      const saved = await ok(role, `${path}/save`, { metadata: source.metadata, resourceEdits: [], mapEdits: [{ op: 'decoration-remove', memberIds: [selected] }] }, { 'If-Match': `"${initial}"` });
      const after = await ok(role, query(saved.draftRevision));
      assert.equal(after.tiles[0], null); assert.deepEqual(after.tiles, expectedTiles(removed));
      const afterCapture = await app.privateDrafts.captureForCompile(hashes[role], target, saved.draftRevision);
      assert.equal(after.sourceDigest, afterCapture.reference.sourceDigest); assert.deepEqual(afterCapture.game, removed);
      assert.deepEqual(await ok(role, query(initial)), before);
      const layerAfter = await ok(role, layerQuery(saved.draftRevision));
      assert.deepEqual(layerAfter.tiles, after.tiles); assert.equal(layerAfter.sourceDigest, afterCapture.reference.sourceDigest);
      assert.deepEqual(await ok(role, layerQuery(initial)), allVisible); groups++;
      const count = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      const atlasQuery = (revision, season = 'spring') => `${path}/map-atlas?revision=${revision}&season=${season}`;
      let spring;
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const asset = policy.roles.find(row => row.path.endsWith(`/map_atlas_${season}.png`)); assert.ok(asset);
        const bytes = readFileSync(join('web', asset.path)); assert.equal(sha(bytes), asset.sha256);
        const image = decodePNG(bytes), atlas = await ok(role, atlasQuery(initial, season));
        assert.deepEqual(atlas, { format: 'dragon-draft-map-atlas-1', gameId: target, draftRevision: initial, sourceDigest: sourceCapture.reference.sourceDigest,
          season, width: 256, height: 256, tileSize: 16, pixelFormat: 'rgba8', assetSha256: asset.sha256, pixelsSha256: sha(image.pixels), pixelsHex: Buffer.from(image.pixels).toString('hex'), admission: 'display-only' });
        if (season === 'spring') spring = atlas;
      }
      const newerAtlas = await ok(role, atlasQuery(saved.draftRevision));
      assert.equal(newerAtlas.sourceDigest, after.sourceDigest); assert.equal(newerAtlas.pixelsSha256, spring.pixelsSha256);
      assert.deepEqual(await ok(role, atlasQuery(initial)), spring); groups++;
      // Actual read-only routes through the native controller, not an API DTO fixture.
      {
        const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(readFileSync('server/public/draft.txt')).toString('base64')}`);
        const actor = { user: { id: role === 'admin' ? admin : author, mustChangePassword: false }, version: 'owned-atlas-read' };
        let model, reads = 0;
        const controller = installDraftEditor({ authority: () => actor, isBusy: () => false, publish: value => { model = value; }, work: fn => fn(), confirm: () => true, prompt: () => null,
          storage: { getItem: () => null, setItem: () => assert.fail('atlas read must not write a journal'), removeItem: () => {} },
          api: async (url, body) => { assert.equal(body, undefined); reads++; return ok(role, url); } });
        controller.setIdentity(actor); await controller.actions.refresh(); await controller.actions.chooseGame(target);
        controller.actions.setField('revision', saved.draftRevision); await controller.actions.load();
        controller.actions.setField('revision', '999');
        await controller.actions.mapWindow(x, y, width, height); await controller.actions.mapAtlas('spring'); controller.render();
        assert.deepEqual(model.mapWindow.value, after);
        assert.deepEqual(model.mapAtlas.info, { gameId: target, draftRevision: saved.draftRevision, sourceDigest: newerAtlas.sourceDigest, season: 'spring', assetSha256: newerAtlas.assetSha256, pixelsSha256: newerAtlas.pixelsSha256 });
        assert.equal(Object.hasOwn(model.mapAtlas, 'pixels'), false); assert.equal(Object.hasOwn(model.mapAtlas, 'pixelsHex'), false);
        await controller.actions.decorationSelection(0, 0, 384, 256); controller.render();
        assert.equal(model.decorationSelection.ready, true);
        assert.equal(model.decorationSelection.value.draftRevision, saved.draftRevision);
        assert.equal(model.decorationSelection.value.sourceDigest, after.sourceDigest);
        assert.deepEqual(model.decorationSelection.value.instanceIds, removed.map.decorations.map(instance => instance.id));
        model.decorationSelection.value.instanceIds.length = 0;
        const count = reads; model.mapAtlas.info.season = 'forged'; controller.render(); assert.equal(model.mapAtlas.info.season, 'spring'); assert.equal(reads, count);
        assert.deepEqual(model.decorationSelection.value.instanceIds, removed.map.decorations.map(instance => instance.id));
        for (const mask of ['0000', '1000']) {
          const visibleLayers = Object.fromEntries(['base','decor','roads','cities'].map((name, index) => [name, mask[index] === '1']));
          const plane = composeMapDisplayLayers(removed, visibleLayers).tiles;
          const tiles = Array.from({ length: height }, (_, row) => plane.slice((y + row) * 384 + x, (y + row) * 384 + x + width)).flat();
          const beforeReads = reads; await controller.actions.mapWindowLayers(mask); controller.render();
          assert.equal(reads, beforeReads + 1);
          assert.deepEqual(model.mapWindow.value, { ...after, format: 'dragon-draft-map-layer-window-1', tiles, visibleLayers });
          assert.equal(model.mapAtlas.info.season, 'spring');
          assert.deepEqual(model.decorationSelection.selectedIds, removed.map.decorations.map(instance => instance.id));
        }
        controller.setIdentity(null); controller.setIdentity(actor); controller.render();
        assert.equal(model.mapAtlas.info, null); assert.equal(model.mapWindow.value, null); assert.equal(model.decorationSelection.value, null); groups++;
      }
      for (const params of [`revision=${initial}`, `revision=${initial}&season=unknown`, `revision=${initial}&season=../spring`, `revision=${initial}&season=spring&season=summer`, `revision=${initial}&season=spring&path=anything`, 'revision=0&season=spring']) assert.equal((await call(role, `${path}/map-atlas?${params}`)).status, 422);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, atlasQuery(initial))).status, 404);
      assert.equal((await app.fetch(new Request(origin + atlasQuery(initial)))).status, 401);
      assert.equal((await call(role, `${path}/map-atlas`, {}, { 'If-Match': `"${saved.draftRevision}"` })).status, 404);
      const atlasRead = bucket.get.bind(bucket), atlasRole = policy.roles.find(row => row.path.endsWith('/map_atlas_spring.png'));
      let corrupted = 0;
      bucket.get = async key => {
        const object = await atlasRead(key);
        if (key === `installed/${policy.registryId}/${atlasRole.sha256}`) {
          const bytes = new Uint8Array(await new Response(object.body).arrayBuffer()); bytes[0] ^= 1; corrupted++;
          return { ...object, body: new Response(bytes).body };
        }
        return object;
      };
      try { const denied = await call(role, atlasQuery(initial)); assert.equal(denied.status, 503); assert.equal(denied.data.error, 'SOURCE_OBJECT_CORRUPT'); }
      finally { bucket.get = atlasRead; }
      assert.equal(corrupted, 1);
      let atlasReads = 0;
      bucket.get = async key => { const object = await atlasRead(key); if (key.startsWith(`installed/${policy.registryId}/`)) { atlasReads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', role === 'admin' ? admin : author); } return object; };
      try { assert.equal((await call(role, atlasQuery(initial))).status, 401); }
      finally { bucket.get = atlasRead; sql.exec('UPDATE users SET disabled=0 WHERE id=?', role === 'admin' ? admin : author); }
      assert.equal(atlasReads, 1); assert.deepEqual(await ok(role, atlasQuery(initial)), spring);
      const originalBaseline = sql.exec('SELECT baseline_digest FROM copy_origins WHERE game_id=?', target).toArray()[0].baseline_digest;
      let originChanged = false;
      bucket.get = async key => { const object = await atlasRead(key); if (!originChanged && key.startsWith(`installed/${policy.registryId}/`)) { originChanged = true; sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', 'f'.repeat(64), target); } return object; };
      try { const denied = await call(role, atlasQuery(initial)); assert.equal(denied.status, 409); assert.equal(denied.data.error, 'DRAFT_SOURCE_CHANGED'); }
      finally { bucket.get = atlasRead; sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', originalBaseline, target); }
      assert.equal(originChanged, true); assert.deepEqual(await ok(role, atlasQuery(initial)), spring);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count); groups++;
      for (const parameters of ['x=-1&y=0&width=1&height=1', 'x=00&y=0&width=1&height=1', 'x=0&y=0&width=33&height=1', 'x=0&y=0&width=1&height=0', 'x=383&y=255&width=2&height=1', 'x=0&y=0&width=1&height=2.5', 'x=0&y=0&width=1', 'x=0&y=0&width=1&height=1&x=1', 'x=0&y=0&width=1&height=1&extra=1']) {
        assert.equal((await call(role, `${path}/map-window?revision=${saved.draftRevision}&${parameters}`)).status, 422);
      }
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, query(initial))).status, 404);
      const post = await call(role, `${path}/map-window`, { metadata: source.metadata, resourceEdits: [] }, { 'If-Match': `"${saved.draftRevision}"` });
      assert.equal(post.status, 404);
      assert.equal((await call(role, `${path}/map-window?revision=0&x=0&y=0&width=1&height=1`)).status, 422);
      assert.equal((await app.fetch(new Request(origin + query(initial)))).status, 401);
      // Explicit trusted-port fault injection, not an accepted malformed draft.
      const originalCapture = app.privateDrafts.captureForCompile.bind(app.privateDrafts);
      app.privateDrafts.captureForCompile = async (...args) => {
        const value = await originalCapture(...args), malformed = structuredClone(value.game);
        malformed.componentDefinitions[malformed.map.decorations[0].definitionRef].visualRef = 'owned-unsupported-fixture';
        return { ...value, game: malformed };
      };
      try {
        for (const endpoint of [query(saved.draftRevision), layerQuery(saved.draftRevision, '0000')]) {
          const denied = await call(role, endpoint); assert.equal(denied.status, 422); assert.equal(denied.data.error, 'DRAFT_MAP_PREVIEW_UNSUPPORTED');
        }
      }
      finally { app.privateDrafts.captureForCompile = originalCapture; }
      const originalRead = bucket.get.bind(bucket); let reads = 0;
      bucket.get = async key => { const data = await originalRead(key); reads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', role === 'admin' ? admin : author); return data; };
      try { assert.equal((await call(role, query(saved.draftRevision))).status, 401); }
      finally { bucket.get = originalRead; sql.exec('UPDATE users SET disabled=0 WHERE id=?', role === 'admin' ? admin : author); }
      assert.equal(reads, 1);
      reads = 0;
      bucket.get = async key => { const data = await originalRead(key); reads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', role === 'admin' ? admin : author); return data; };
      try { assert.equal((await call(role, layerQuery(saved.draftRevision))).status, 401); }
      finally { bucket.get = originalRead; sql.exec('UPDATE users SET disabled=0 WHERE id=?', role === 'admin' ? admin : author); }
      assert.equal(reads, 1); app = make();
      assert.deepEqual(await ok(role, layerQuery(saved.draftRevision)), layerAfter);
      assert.deepEqual(await ok(role, query(saved.draftRevision)), after);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count); groups++;
      const selectedAfter = await ok(role, selectionQuery(saved.draftRevision));
      assert.deepEqual(selectedAfter.instanceIds, selectionIds(removed)); assert.ok(!selectedAfter.instanceIds.includes(selected));
      assert.deepEqual(await ok(role, selectionQuery(initial)), selectedBefore);
      const original = source.map.decorations.find(instance => instance.id === selected);
      const place = { op: 'decoration-place', materialId: original.definitionRef, variantRef: Object.keys(source.componentDefinitions[original.definitionRef].variants)[0], x: original.x, y: original.y, waterClass: null };
      const stackedSave = await ok(role, `${path}/save`, { metadata: source.metadata, resourceEdits: [], mapEdits: [place, place] }, { 'If-Match': `"${saved.draftRevision}"`, 'Idempotency-Key': `owned-selection-overlay-${role}` });
      const stackedSource = await app.privateDrafts.captureForCompile(hashes[role], target, stackedSave.draftRevision);
      const stacked = await ok(role, selectionQuery(stackedSave.draftRevision));
      assert.equal(stacked.sourceDigest, stackedSource.reference.sourceDigest);
      assert.deepEqual(stacked.instanceIds, selectionIds(stackedSource.game));
      assert.deepEqual(stacked.instanceIds.slice(0, -2), selectedAfter.instanceIds);
      assert.deepEqual(stacked.instanceIds.slice(-2), stackedSource.game.map.decorations.slice(-2).map(instance => instance.id));
      assert.equal(new Set(stacked.instanceIds).size, stacked.instanceIds.length);
      assert.deepEqual(await ok(role, selectionQuery(saved.draftRevision)), selectedAfter); groups++;
      const selectionCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      const directSelection = await app.privateDrafts.readDecorationSelection(hashes[role], target, stackedSave.draftRevision, { x, y, width: 1, height: 1 });
      directSelection.instanceIds.length = 0;
      assert.deepEqual(await ok(role, selectionQuery(stackedSave.draftRevision)), stacked);
      const selectionCapture = app.privateDrafts.captureForCompile.bind(app.privateDrafts);
      app.privateDrafts.captureForCompile = async (...args) => {
        const value = await selectionCapture(...args), malformed = structuredClone(value.game);
        delete malformed.componentDefinitions[malformed.map.decorations[0].definitionRef];
        return { ...value, game: malformed };
      };
      try { const denied = await call(role, selectionQuery(stackedSave.draftRevision)); assert.equal(denied.status, 422); assert.equal(denied.data.error, 'DRAFT_DECORATION_SELECTION_UNSUPPORTED'); }
      finally { app.privateDrafts.captureForCompile = selectionCapture; }
      app.privateDrafts.captureForCompile = async (...args) => {
        const value = await selectionCapture(...args);
        sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', 'f'.repeat(64), target);
        return value;
      };
      try { const denied = await call(role, selectionQuery(stackedSave.draftRevision)); assert.equal(denied.status, 409); assert.equal(denied.data.error, 'DRAFT_SOURCE_CHANGED'); }
      finally { app.privateDrafts.captureForCompile = selectionCapture; sql.exec('UPDATE copy_origins SET baseline_digest=? WHERE game_id=?', originalBaseline, target); }
      for (const parameters of ['x=-1&y=0&width=1&height=1', 'x=00&y=0&width=1&height=1', 'x=0&y=0&width=385&height=1', 'x=0&y=0&width=1&height=0', 'x=383&y=255&width=2&height=1', 'x=0&y=0&width=1&height=2.5', 'x=0&y=0&width=1', 'x=0&y=0&width=1&height=1&x=1', 'x=0&y=0&width=1&height=1&extra=1', 'x=0&y=0&width=1&height=1&revision=1']) {
        assert.equal((await call(role, `${path}/decoration-selection?revision=${stackedSave.draftRevision}&${parameters}`)).status, 422);
      }
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, selectionQuery(initial))).status, 404);
      assert.equal((await app.fetch(new Request(origin + selectionQuery(initial)))).status, 401);
      assert.equal((await call(role, selectionQuery('0'))).status, 422);
      assert.equal((await call(role, `${path}/decoration-selection`, { metadata: source.metadata, resourceEdits: [] }, { 'If-Match': `"${stackedSave.draftRevision}"` })).status, 404);
      let selectionReads = 0;
      bucket.get = async key => { const data = await originalRead(key); selectionReads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', role === 'admin' ? admin : author); return data; };
      try { assert.equal((await call(role, selectionQuery(stackedSave.draftRevision))).status, 401); }
      finally { bucket.get = originalRead; sql.exec('UPDATE users SET disabled=0 WHERE id=?', role === 'admin' ? admin : author); }
      assert.equal(selectionReads, 1); app = make();
      assert.deepEqual(await ok(role, selectionQuery(stackedSave.draftRevision)), stacked);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, selectionCount); groups++;
    }
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0);
  } else if (baseFillOnly) {
    const { installDraftEditor } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/draft.txt')).toString('base64'));
    const legacy = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json;
    for (const [role, target, initial] of [['author', gameId, '2'], ['admin', ar.gameId, '1']]) {
      const actorId = role === 'admin' ? admin : author, path = `/api/games/${target}/draft`;
      const before = await ok(role, path + '?revision=' + initial);
      const source = (await app.privateDrafts.captureForCompile(hashes[role], target, initial)).game;
      const expectedTerrain = game => ({ width: game.map.bounds.width, height: game.map.bounds.height, tiles: game.map.base.terrainRef, geography: game.map.base.geography, unknownCells: Object.keys(game.map.base.unknownUnderlays).map(Number) });
      const expectedWater = game => ({
        memberIds: [...game.map.decorations, ...game.map.roads.flatMap(road => road.components ?? [])].filter(row => Object.hasOwn(WATER_CLASSES, row.waterClass)).map(row => row.id),
        baseCells: game.map.base.geography.flatMap((value, cell) => value ? [cell] : []),
      });
      assert.ok(before.waterCreateCandidates, 'water-create candidates required');
      assert.deepEqual(before.waterCreateCandidates, expectedWater(source));
      assert.equal(new Set(before.waterCreateCandidates.memberIds).size, before.waterCreateCandidates.memberIds.length);
      assert.ok(before.waterCreateCandidates.memberIds.length > 0);
      assert.ok(before.baseTerrain, 'base terrain projection required');
      assert.deepEqual(before.baseTerrain, expectedTerrain(source));
      assert.equal(before.baseTerrain.tiles.length, 384 * 256); assert.equal(before.baseTerrain.geography.length, 384 * 256);
      const cells = Object.keys(source.map.base.unknownUnderlays).slice(0, 2).map(Number); assert.equal(cells.length, 2);
      for (const cell of cells) assert.equal(before.baseTerrain.tiles[cell], null);
      const direct = await app.privateDrafts.read(hashes[role], target, initial);
      direct.baseTerrain.tiles[cells[0]] = 255; direct.baseTerrain.geography[cells[0]] = 3; direct.baseTerrain.unknownCells.length = 0;
      direct.waterCreateCandidates.memberIds.length = 0; direct.waterCreateCandidates.baseCells.push(-1);
      assert.deepEqual((await ok(role, path + '?revision=' + initial)).waterCreateCandidates, expectedWater(source)); groups++;
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, initial)).game, source);
      const actor = { user: { id: actorId, mustChangePassword: false } }; let model, reads = 0;
      const controller = installDraftEditor({ authority: () => actor, isBusy: () => false, publish: value => { model = value; }, work: fn => fn(), confirm: () => true, prompt: () => null,
        storage: { getItem: () => null, removeItem() {}, setItem() { throw new Error('base read probe must not save'); } },
        api: (url, input) => { assert.equal(input, undefined); reads++; return ok(role, url); } });
      controller.setIdentity(actor); await controller.actions.refresh(); await controller.actions.chooseGame(target); controller.actions.setField('revision', initial); await controller.actions.load();
      assert.equal(model.base.supported, true); assert.equal(model.base.locked, true); assert.equal(model.base.unknownCount, before.baseTerrain.unknownCells.length);
      const readCount = reads; controller.actions.basePage(4095); controller.actions.mapLayer('base'); controller.actions.baseUnlock(true);
      assert.equal(reads, readCount); assert.equal(model.base.locked, false);
      for (const row of model.base.rows) { assert.equal(row.tile, before.baseTerrain.tiles[row.cell]); assert.equal(row.geography, before.baseTerrain.geography[row.cell]); assert.equal(row.unknownUnderlay, before.baseTerrain.unknownCells.includes(row.cell)); }
      assert.equal(model.base.rows.at(-1).cell, 98303);
      assert.deepEqual(model.water.createCandidates, expectedWater(source)); assert.equal(model.water.createLocked, false);
      model.water.createCandidates.memberIds.push('owned-projection-change'); model.water.createCandidates.baseCells.push(98303);
      controller.render(); assert.deepEqual(model.water.createCandidates, expectedWater(source)); assert.equal(reads, readCount); groups++;
      const edit = { op: 'base-fill', cells, tile: 20, geography: 0 };
      const body = mapEdits => ({ metadata: before.metadata, resourceEdits: [], mapEdits });
      const key = 'owned-base-fill-' + role + '-001', headers = { 'If-Match': '"' + initial + '"', 'Idempotency-Key': key };
      const saved = await ok(role, path + '/save', body([edit]), headers);
      assert.equal(saved.draftRevision, String(BigInt(initial) + 1n));
      assert.deepEqual(await ok(role, path + '/save', body([edit]), headers), saved);
      assert.deepEqual(await ok(role, path + '/operations/' + key), { state: 'committed', result: saved });
      const expected = fillBase(source, cells, 20, 0);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, saved.draftRevision)).game, expected);
      for (const cell of cells) { assert.equal(expected.map.base.terrainRef[cell], 20); assert.equal(Object.hasOwn(expected.map.base.unknownUnderlays, cell), false); }
      const current = await ok(role, path + '?revision=' + saved.draftRevision);
      assert.deepEqual(current.baseTerrain, expectedTerrain(expected));
      assert.deepEqual(current.waterCreateCandidates, expectedWater(expected));
      for (const cell of cells) assert.equal(current.waterCreateCandidates.baseCells.includes(cell), false);
      for (const cell of cells) { assert.equal(current.baseTerrain.tiles[cell], 20); assert.equal(current.baseTerrain.unknownCells.includes(cell), false); }
      for (const field of ['chapters', 'map', 'strongholds', 'cityDefinitions', 'materialDefinitions', 'decorationInstances', 'decorationSplitCandidates', 'materialPlacement']) assert.deepEqual(current[field], before[field]);
      assert.deepEqual(await ok(role, path + '?revision=' + initial), before);
      const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, key).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(stored).mapEdits, [edit]); groups++;
      const revisionHeaders = { 'If-Match': '"' + saved.draftRevision + '"' }, count = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      for (const bad of [{ ...edit, cells: [] }, { ...edit, cells: [cells[0], cells[0]] }, { ...edit, cells: [0, 98304] }, { ...edit, cells: [-1] }, { ...edit, cells: ['0'] }, { ...edit, cells: null }, { ...edit, tile: -1 }, { ...edit, tile: 256 }, { ...edit, tile: 0.5 }, { ...edit, geography: 4 }, { ...edit, geography: null }, { ...edit, extra: true }]) assert.equal((await call(role, path + '/save', body([bad]), revisionHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...edit, tile: 21 }, { ...edit, cells: [98304] }]), revisionHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(edit)), revisionHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...edit, cells: Array.from({ length: 6000 }, (_, i) => i) }]), revisionHeaders)).status, 413);
      assert.equal((await call(role, path + '/save', body([{ ...edit, tile: 21 }]), headers)).status, 409);
      assert.equal((await call(role, path + '/save', body([edit]), { 'If-Match': '"' + initial + '"' })).status, 412);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([edit]), revisionHeaders)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count);
      const corrupt = JSON.parse(stored); corrupt.mapEdits[0].tile = 21;
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corrupt), actorId, key);
      try {
        assert.equal((await call(role, path + '?revision=' + saved.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, saved.draftRevision), error => error.status === 422);
        assert.equal((await call(role, path + '/save', body([]), revisionHeaders)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, actorId, key); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + saved.draftRevision), current);
      const overwritten = await ok(role, path + '/save', body([{ ...edit, cells: [cells[0]], tile: 255, geography: 3 }]), revisionHeaders);
      const lastSource = fillBase(expected, [cells[0]], 255, 3);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, overwritten.draftRevision)).game, lastSource);
      assert.deepEqual((await ok(role, path + '?revision=' + overwritten.draftRevision)).baseTerrain, expectedTerrain(lastSource));
      assert.deepEqual(await ok(role, path + '?revision=' + saved.draftRevision), current); groups++;
      const wet = lastSource.map.decorations.find(row => row.waterClass);
      assert.ok(wet);
      const create = { op: 'water-create', memberIds: [wet.id], baseCells: [cells[0]], name: '明確新組', showOnMinimap: false };
      const groupKey = `owned-water-create-${role}-001`, groupHeaders = { 'If-Match': `"${overwritten.draftRevision}"`, 'Idempotency-Key': groupKey };
      const grouped = await ok(role, path + '/save', body([create]), groupHeaders);
      assert.deepEqual(await ok(role, path + '/save', body([create]), groupHeaders), grouped);
      assert.deepEqual(await ok(role, path + '/operations/' + groupKey), { state: 'committed', result: grouped });
      const groupId = `${target}#water-${createHash('sha256').update(JSON.stringify(['dragon-water-group-1', target, actorId, groupKey, 0])).digest('hex')}`;
      const groupedSource = createWaterGroup(lastSource, create.memberIds, create.baseCells, groupId, create.name, false);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, grouped.draftRevision)).game, groupedSource);
      const groupDTO = await ok(role, path + '?revision=' + grouped.draftRevision);
      assert.deepEqual(groupDTO.waterGroupMembers.at(-1), { groupId, memberIds: create.memberIds, baseCells: create.baseCells });
      assert.equal(groupDTO.waterGroups.at(-1).showOnMinimap, false);
      assert.deepEqual(groupDTO.baseTerrain, expectedTerrain(lastSource));
      assert.deepEqual(groupDTO.waterCreateCandidates, expectedWater(lastSource));
      assert.ok(groupDTO.waterCreateCandidates.baseCells.includes(cells[0]));
      assert.ok(groupDTO.waterCreateCandidates.memberIds.includes(wet.id)); // Already grouped remains eligible.
      assert.equal(groupDTO.waterCreateCandidates.baseCells.includes(cells[1]), false);
      const priorDTO = await ok(role, path + '?revision=' + overwritten.draftRevision);
      for (const field of ['chapters', 'map', 'strongholds', 'cityDefinitions', 'materialDefinitions', 'decorationInstances']) assert.deepEqual(groupDTO[field], priorDTO[field]);
      const groupJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, groupKey).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(groupJSON).mapEdits, [create]); assert.ok(!groupJSON.includes('groupId')); groups++;
      const nextHeaders = { 'If-Match': `"${grouped.draftRevision}"` }, objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      for (const bad of [{ ...create, groupId }, { ...create, memberIds: ['missing'] }, { ...create, baseCells: [cells[1]] }, { ...create, memberIds: [], baseCells: [] }, { ...create, memberIds: [wet.id, wet.id] }, { ...create, baseCells: [98304] }, { ...create, showOnMinimap: null }, { ...create, name: '' }, { ...create, extra: true }]) assert.equal((await call(role, path + '/save', body([bad]), nextHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([create, { ...create, memberIds: ['missing'] }]), nextHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(create)), nextHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...create, name: 'x'.repeat(17000) }]), nextHeaders)).status, 413);
      assert.equal((await call(role, path + '/save', body([{ ...create, name: '不同正文' }]), groupHeaders)).status, 409);
      assert.equal((await call(role, path + '/save', body([create]), { 'If-Match': `"${overwritten.draftRevision}"` })).status, 412);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([create]), nextHeaders)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
      const brokenGroup = JSON.parse(groupJSON); brokenGroup.mapEdits[0].memberIds = ['missing-history-member'];
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(brokenGroup), actorId, groupKey);
      try {
        assert.equal((await call(role, path + '?revision=' + grouped.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, grouped.draftRevision), error => error.status === 422);
        assert.equal((await call(role, path + '/save', body([]), nextHeaders)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', groupJSON, actorId, groupKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + grouped.draftRevision), groupDTO);
      const transferred = await ok(role, path + '/save', body([create]), nextHeaders);
      const transferDTO = await ok(role, path + '?revision=' + transferred.draftRevision);
      assert.notEqual(transferDTO.waterGroups.at(-1).groupId, groupId);
      assert.equal(transferDTO.waterGroups.some(row => row.groupId === groupId), false);
      assert.deepEqual(await ok(role, path + '?revision=' + grouped.draftRevision), groupDTO); groups++;
    }
    assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json, legacy);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0);
  } else if (materialsOnly) {
    const { componentCells, translateDecorations, reorderDecorations } = await import('../web/src/editor/componenttools.js');
    const { composeMapLayers, WATER_CLASSES } = await import('../web/src/content/authoring/maplayers.js');
    const { installDraftEditor } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/draft.txt')).toString('base64'));
    const legacy = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json;
    for (const [role, target, initial] of [['author', gameId, '2'], ['admin', ar.gameId, '1']]) {
      const path = `/api/games/${target}/draft`, before = await ok(role, path + '?revision=' + initial);
      const actor = { user: { id: role === 'admin' ? admin : author, mustChangePassword: false } };
      let model;
      const controller = installDraftEditor({ authority: () => actor, isBusy: () => false, publish: value => { model = value; },
        work: fn => fn(), confirm: () => true, prompt: () => null,
        storage: { getItem: () => null, removeItem() {}, setItem() { throw new Error('read-only protocol probe must not save'); } },
        api: (url, body) => { assert.equal(body, undefined); return ok(role, url); } });
      controller.setIdentity(actor); await controller.actions.refresh(); await controller.actions.chooseGame(target);
      controller.actions.setField('revision', initial); await controller.actions.load();
      assert.equal(model.materials.supported, true); assert.equal(model.materials.locked, false);
      assert.deepEqual(model.materials.rows, before.materialDefinitions); assert.deepEqual(model.materials.instances, before.decorationInstances);
      assert.deepEqual(model.materials.placement, before.materialPlacement);
      assert.deepEqual(model.materials.splitCandidates, before.decorationSplitCandidates);
      assert.deepEqual(before.decorationSplitCandidates.map(row => row.instanceId), before.decorationInstances.map(row => row.instanceId)); groups++;
      const memberId = before.decorationInstances[0].instanceId;
      const create = { op: 'material-capture', memberIds: [memberId], name: '作者素材' };
      const body = mapEdits => ({ metadata: before.metadata, resourceEdits: [], mapEdits });
      const key = 'owned-material-' + role + '-001', headers = { 'If-Match': '"' + initial + '"', 'Idempotency-Key': key };
      const receipt = await ok(role, path + '/save', body([create]), headers);
      let rev = receipt.draftRevision;
      assert.deepEqual(await ok(role, path + '/save', body([create]), headers), receipt);
      assert.deepEqual(await ok(role, path + '/operations/' + key), { state: 'committed', result: receipt });
      const created = await ok(role, path + '?revision=' + rev);
      controller.actions.setField('revision', rev); await controller.actions.load();
      assert.deepEqual(model.materials.rows, created.materialDefinitions); assert.equal(model.materials.locked, false);
      const definitions = created.materialDefinitions.filter(row => row.authorEditable);
      assert.equal(definitions.length, 1);
      const definition = definitions[0], materialId = definition.materialId;
      assert.ok(materialId.startsWith(target + '#material-')); assert.match(materialId.slice((target + '#material-').length), /^[a-f0-9]{64}$/);
      assert.equal(definition.name, create.name); assert.deepEqual(definition.references, []);
      assert.deepEqual(created.decorationInstances, before.decorationInstances);
      for (const field of ['chapters', 'map', 'cityDefinitions', 'strongholds']) assert.deepEqual(created[field], before[field]);
      assert.deepEqual(await ok(role, path + '?revision=' + initial), before);
      const actorId = role === 'admin' ? admin : author;
      const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, key).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(stored).mapEdits, [create]); groups++;
      let placementRevision = receipt.draftRevision, source;
      if (!placementOnly) {
      const current = { 'If-Match': '"' + rev + '"' }, count = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      // Clients cannot supply the internal instance identity.
      const internalPlace = { op: 'decoration-place', materialId, variantRef: 'original', x: 0, y: 0, waterClass: null, instanceId: target + '#decoration-' + 'f'.repeat(64) };
      assert.equal((await call(role, path + '/save', body([internalPlace]), current)).status, 422);
      for (const edit of [{ ...create, materialId }, { ...create, memberIds: [] }, { ...create, memberIds: [memberId, memberId] }, { ...create, memberIds: ['missing'] }, { ...create, name: '' }, { op: 'material-place', materialId }, { op: 'decoration-translate', memberIds: [memberId], dx: 384, dy: 0 }, { op: 'material-remove', materialId: before.materialDefinitions[0].materialId }, { op: 'material-rename', materialId: before.materialDefinitions[0].materialId, name: '不能改原配方' }, { ...create, definition: {} }]) assert.equal((await call(role, path + '/save', body([edit]), current)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(create)), current)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...create, name: 'x'.repeat(17000) }]), current)).status, 413);
      assert.equal((await call(role, path + '/save', body([{ ...create, name: '不同正文' }]), headers)).status, 409);
      assert.equal((await call(role, path + '/save', body([create]), { 'If-Match': '"' + initial + '"' })).status, 412);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) {
        assert.equal((await call(outsider, path + '?revision=' + rev)).status, 404);
        assert.equal((await call(outsider, path + '/save', body([create]), current)).status, 404);
      }
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count); groups++;
      const renamed = await ok(role, path + '/save', body([{ op: 'material-rename', materialId, name: '更名素材' }]), current);
      rev = renamed.draftRevision;
      const named = await ok(role, path + '?revision=' + rev);
      assert.equal(named.materialDefinitions.find(row => row.materialId === materialId).name, '更名素材');
      const damaged = JSON.parse(stored); damaged.mapEdits[0].memberIds = ['missing-history'];
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(damaged), actorId, key);
      try {
        assert.equal((await call(role, path + '?revision=' + rev)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, rev));
        assert.equal((await call(role, path + '/save', body([]), { 'If-Match': '"' + rev + '"' })).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, actorId, key); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + rev), named); groups++;
      const removed = await ok(role, path + '/save', body([{ op: 'material-remove', materialId }]), { 'If-Match': '"' + rev + '"' });
      const cleared = await ok(role, path + '?revision=' + removed.draftRevision);
      assert.deepEqual(cleared.materialDefinitions, before.materialDefinitions);
      assert.deepEqual(cleared.decorationInstances, before.decorationInstances);
      assert.deepEqual(await ok(role, path + '?revision=' + receipt.draftRevision), created);
      const recreated = await ok(role, path + '/save', body([create]), { 'If-Match': '"' + removed.draftRevision + '"' });
      const again = await ok(role, path + '?revision=' + recreated.draftRevision);
      assert.notEqual(again.materialDefinitions.find(row => row.authorEditable).materialId, materialId); groups++;
      source = (await app.privateDrafts.captureForCompile(hashes[role], target, recreated.draftRevision)).game;
      const memberIds = source.map.decorations.filter(row => componentCells(source, row).every(([x]) => x < 383)).slice(0, 2).map(row => row.id);
      assert.equal(memberIds.length, 2);
      const move = { op: 'decoration-translate', memberIds, dx: 1, dy: 0 };
      const moveKey = 'owned-decoration-' + role + '-001';
      const moveHeaders = { 'If-Match': '"' + recreated.draftRevision + '"', 'Idempotency-Key': moveKey };
      const moved = await ok(role, path + '/save', body([move]), moveHeaders);
      assert.deepEqual(await ok(role, path + '/save', body([move]), moveHeaders), moved);
      assert.deepEqual(await ok(role, path + '/operations/' + moveKey), { state: 'committed', result: moved });
      const dto = await ok(role, path + '?revision=' + moved.draftRevision);
      assert.deepEqual(dto.decorationInstances.map(row => memberIds.includes(row.instanceId) ? { ...row, x: row.x - 1 } : row), again.decorationInstances);
      for (const field of ['chapters', 'map', 'cityDefinitions', 'strongholds', 'materialDefinitions']) assert.deepEqual(dto[field], again[field]);
      const movedSource = (await app.privateDrafts.captureForCompile(hashes[role], target, moved.draftRevision)).game;
      assert.deepEqual(movedSource, translateDecorations(source, memberIds, 1, 0));
      assert.equal(composeMapLayers(source, { draft: true }).diagnostics.some(row => row.code === 'UNKNOWN_UNDERLAY'), false);
      assert.ok(composeMapLayers(movedSource, { draft: true }).diagnostics.some(row => row.code === 'UNKNOWN_UNDERLAY'));
      assert.throws(() => composeMapLayers(movedSource), /UNKNOWN_UNDERLAY/);
      assert.deepEqual(await ok(role, path + '?revision=' + recreated.draftRevision), again); groups++;
      const movedHeaders = { 'If-Match': '"' + moved.draftRevision + '"' }, objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      for (const edit of [{ ...move, dx: 0 }, { ...move, dx: 0.5 }, { ...move, dx: 384 }, { ...move, memberIds: [] }, { ...move, memberIds: [memberIds[0], memberIds[0]] }, { ...move, memberIds: [memberIds[0], 'missing'] }, { ...move, x: 0 }, { ...move, memberIds: null }]) assert.equal((await call(role, path + '/save', body([edit]), movedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...move, dx: 384 }, { ...move, dx: -384 }]), movedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(move)), movedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([move]), { 'If-Match': '"' + recreated.draftRevision + '"' })).status, 412);
      assert.equal((await call(role, path + '/save', body([{ ...move, dx: -1 }]), moveHeaders)).status, 409);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([move]), movedHeaders)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
      const moveJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, moveKey).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(moveJSON).mapEdits, [move]);
      const badMove = JSON.parse(moveJSON); badMove.mapEdits[0].memberIds = ['missing-history'];
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(badMove), actorId, moveKey);
      try {
        assert.equal((await call(role, path + '?revision=' + moved.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, moved.draftRevision));
        assert.equal((await call(role, path + '/save', body([]), movedHeaders)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', moveJSON, actorId, moveKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + moved.draftRevision), dto);
      const restored = await ok(role, path + '/save', body([{ ...move, dx: -1 }]), movedHeaders);
      assert.deepEqual((await ok(role, path + '?revision=' + restored.draftRevision)).decorationInstances, again.decorationInstances);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, restored.draftRevision)).game, source);
      assert.deepEqual(await ok(role, path + '?revision=' + moved.draftRevision), dto); groups++;
      const order = { op: 'decoration-reorder', memberIds: source.map.decorations.slice(0, 2).map(row => row.id), direction: 1 };
      const orderKey = 'owned-reorder-' + role + '-001';
      const orderHeaders = { 'If-Match': '"' + restored.draftRevision + '"', 'Idempotency-Key': orderKey };
      const ordered = await ok(role, path + '/save', body([order]), orderHeaders);
      assert.deepEqual(await ok(role, path + '/save', body([order]), orderHeaders), ordered);
      assert.deepEqual(await ok(role, path + '/operations/' + orderKey), { state: 'committed', result: ordered });
      const orderedDTO = await ok(role, path + '?revision=' + ordered.draftRevision);
      const expectedOrder = reorderDecorations(source, order.memberIds, 1);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, ordered.draftRevision)).game, expectedOrder);
      assert.deepEqual(orderedDTO.decorationInstances.map(row => row.instanceId), expectedOrder.map.decorations.map(row => row.id));
      assert.deepEqual(orderedDTO.decorationInstances.slice(0, 3).map(row => row.instanceId), [source.map.decorations[2].id, ...order.memberIds]);
      for (const field of ['chapters', 'map', 'strongholds', 'cityDefinitions']) assert.deepEqual(orderedDTO[field], again[field]);
      // Diagnostic decoration references follow layer order; membership and definitions do not change.
      const unorderedReferences = rows => rows.map(row => ({ ...row, references: row.references.toSorted() }));
      assert.deepEqual(unorderedReferences(orderedDTO.materialDefinitions), unorderedReferences(again.materialDefinitions));
      assert.deepEqual((await ok(role, path + '?revision=' + restored.draftRevision)).decorationInstances, again.decorationInstances); groups++;
      const orderedHeaders = { 'If-Match': '"' + ordered.draftRevision + '"' };
      const beforeInvalidOrder = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      for (const edit of [{ ...order, direction: 0 }, { ...order, direction: '1' }, { ...order, direction: 2 }, { ...order, memberIds: [] }, { ...order, memberIds: [order.memberIds[0], order.memberIds[0]] }, { ...order, memberIds: ['missing'] }, { ...order, dx: 1 }]) assert.equal((await call(role, path + '/save', body([edit]), orderedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([order]), { 'If-Match': '"' + restored.draftRevision + '"' })).status, 412);
      assert.equal((await call(role, path + '/save', body([{ ...order, direction: -1 }]), orderHeaders)).status, 409);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([order]), orderedHeaders)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, beforeInvalidOrder);
      const orderJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, orderKey).toArray()[0].request_json;
      const corruptOrder = JSON.parse(orderJSON); corruptOrder.mapEdits[0].direction = 0;
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corruptOrder), actorId, orderKey);
      try {
        const badRead = await call(role, path + '?revision=' + ordered.draftRevision);
        assert.equal(badRead.status, 503); assert.equal(badRead.data.error, 'DRAFT_HISTORY_CORRUPT');
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, ordered.draftRevision), error => error.code === 'DRAFT_HISTORY_CORRUPT');
        const badSave = await call(role, path + '/save', body([]), orderedHeaders);
        assert.equal(badSave.status, 503); assert.equal(badSave.data.error, 'DRAFT_HISTORY_CORRUPT');
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', orderJSON, actorId, orderKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + ordered.draftRevision), orderedDTO);
      const undoneOrder = await ok(role, path + '/save', body([{ ...order, direction: -1 }]), orderedHeaders);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, undoneOrder.draftRevision)).game, source);
      assert.deepEqual(await ok(role, path + '?revision=' + ordered.draftRevision), orderedDTO);
      const noOpOrder = await ok(role, path + '/save', body([{ ...order, direction: -1 }]), { 'If-Match': '"' + undoneOrder.draftRevision + '"' });
      assert.equal(noOpOrder.draftRevision, undoneOrder.draftRevision); groups++;
      placementRevision = noOpOrder.draftRevision;
      }
      if (placementOnly) process.stderr.write('placement ' + role + ': setup complete\n');
      source ??= (await app.privateDrafts.captureForCompile(hashes[role], target, placementRevision)).game;
      const placementBefore = await ok(role, path + '?revision=' + placementRevision);
      assert.deepEqual(placementBefore.materialPlacement, { materials: Object.entries(source.componentDefinitions).map(([materialId, definition]) => ({ materialId, variantRefs: Object.keys(definition.variants), offsets: componentCells(source, { definitionRef: materialId, x: 0, y: 0 }), visualVariants: Object.entries(definition.variants).map(([variantRef, variant]) => ({ variantRef, tiles: variant.tiles.map(([x, y, tile]) => [x - definition.anchor[0], y - definition.anchor[1], tile]) })) })), waterClasses: [null, ...Object.keys(WATER_CLASSES)] });
      const authoredId = placementBefore.materialDefinitions.find(row => row.authorEditable).materialId;
      const original = source.map.decorations.find(row => row.id === memberId), wet = source.map.decorations.find(row => row.waterClass);
      assert.ok(original); assert.ok(wet);
      const place = { op: 'decoration-place', materialId: authoredId, variantRef: 'original', x: original.x, y: original.y, waterClass: original.waterClass ?? null };
      const waterPlace = { ...place, materialId: wet.definitionRef, variantRef: wet.variantRef ?? 'original', x: wet.x, y: wet.y, waterClass: wet.waterClass };
      const placeBody = body([place, place, waterPlace]), placeKey = 'owned-placement-' + role + '-001';
      const placeHeaders = { 'If-Match': '"' + placementRevision + '"', 'Idempotency-Key': placeKey };
      const placedReceipt = await ok(role, path + '/save', placeBody, placeHeaders);
      assert.deepEqual(await ok(role, path + '/save', placeBody, placeHeaders), placedReceipt);
      assert.deepEqual(await ok(role, path + '/operations/' + placeKey), { state: 'committed', result: placedReceipt });
      const ids = [0, 1, 2].map(index => target + '#decoration-' + sha(JSON.stringify(['dragon-decoration-instance-1', target, actorId, placeKey, index])));
      const placedDTO = await ok(role, path + '?revision=' + placedReceipt.draftRevision);
      assert.deepEqual(placedDTO.decorationInstances.slice(0, -3), placementBefore.decorationInstances);
      assert.deepEqual(placedDTO.decorationInstances.slice(-3), placeBody.mapEdits.map((edit, index) => ({ instanceId: ids[index], materialId: edit.materialId, x: edit.x, y: edit.y })));
      const expectedSource = placeBody.mapEdits.reduce((game, edit, index) => placeComponent(game, edit.materialId, edit.x, edit.y, ids[index], edit.waterClass, edit.variantRef), source);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, placedReceipt.draftRevision)).game, expectedSource);
      assert.equal(placedDTO.waterGroupMembers.at(-1).groupId, 'group-' + ids[2]);
      assert.deepEqual(placedDTO.waterGroupMembers.at(-1).memberIds, [ids[2]]);
      assert.deepEqual(placedDTO.materialDefinitions.find(row => row.materialId === authoredId).references, ['裝飾:' + ids[0], '裝飾:' + ids[1]]);
      for (const field of ['metadata', 'chapters', 'map', 'strongholds', 'cityDefinitions', 'chapterCities', 'generalDefinitions', 'chapterPeople']) assert.deepEqual(placedDTO[field], placementBefore[field]);
      assert.deepEqual(await ok(role, path + '?revision=' + placementRevision), placementBefore);
      const placeJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, placeKey).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(placeJSON).mapEdits, placeBody.mapEdits); assert.ok(!placeJSON.includes('instanceId')); groups++;
      const placedHeaders = { 'If-Match': '"' + placedReceipt.draftRevision + '"' };
      const placedCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      // Splitting requires an exact count assertion; client child IDs remain forbidden.
      for (const edit of [{ op: 'decoration-split', instanceId: ids[0] }, { op: 'decoration-split', instanceId: ids[0], childIds: [target + '#decoration-' + 'a'.repeat(64), target + '#decoration-' + 'b'.repeat(64)] }]) {
        const denied = await call(role, path + '/save', body([edit]), placedHeaders);
        assert.equal(denied.status, 422); assert.equal(denied.data.error, 'REQUEST_FIELDS');
      }
      const missingVariant = { ...place }; delete missingVariant.variantRef;
      for (const edit of [missingVariant, { ...place, instanceId: ids[0] }, { ...place, materialId: 'missing' }, { ...place, variantRef: 'missing' }, { ...place, waterClass: '' }, { ...place, waterClass: false }, { ...place, waterClass: 'unknown' }, { ...place, x: 384 }, { ...place, y: 256 }, { ...place, x: 0.5 }, { ...place, x: '0' }, { ...place, extra: true }, { op: 'material-remove', materialId: authoredId }]) {
        assert.equal((await call(role, path + '/save', body([edit]), placedHeaders)).status, 422);
      }
      assert.equal((await call(role, path + '/save', body([place, { ...place, x: 384 }]), placedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(place)), placedHeaders)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...place, variantRef: 'x'.repeat(17000) }]), placedHeaders)).status, 413);
      assert.equal((await call(role, path + '/save', body([place]), { 'If-Match': '"' + placementRevision + '"' })).status, 412);
      assert.equal((await call(role, path + '/save', body([place]), placeHeaders)).status, 409);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([place]), placedHeaders)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, placedCount);
      const corruptPlace = JSON.parse(placeJSON); corruptPlace.mapEdits[0].x = 384;
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corruptPlace), actorId, placeKey);
      try {
        assert.equal((await call(role, path + '?revision=' + placedReceipt.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, placedReceipt.draftRevision), error => error.status === 422);
        assert.equal((await call(role, path + '/save', body([]), placedHeaders)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', placeJSON, actorId, placeKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + placedReceipt.draftRevision), placedDTO);
      const secondPlacement = await ok(role, path + '/save', body([place]), placedHeaders);
      const secondDTO = await ok(role, path + '?revision=' + secondPlacement.draftRevision);
      assert.equal(secondDTO.decorationInstances.length, placedDTO.decorationInstances.length + 1);
      assert.ok(!ids.includes(secondDTO.decorationInstances.at(-1).instanceId));
      assert.deepEqual(await ok(role, path + '?revision=' + placedReceipt.draftRevision), placedDTO); groups++;
      if (placementOnly) process.stderr.write('placement ' + role + ': persistence and refusals complete\n');
      // Capture two actual adjacent atoms: splitting must use the entire variant.
      const splitStart = (await app.privateDrafts.captureForCompile(hashes[role], target, secondPlacement.draftRevision)).game;
      const atoms = new Map();
      for (const row of splitStart.map.decorations) { const cells = componentCells(splitStart, row); if (!row.waterClass && cells.length === 1) atoms.set(cells[0].join(','), row.id); }
      let pair;
      for (const [at, id] of atoms) { const [x, y] = at.split(',').map(Number), other = atoms.get(`${x + 1},${y}`); if (other) { pair = [id, other]; break; } }
      assert.ok(pair);
      const pairReceipt = await ok(role, path + '/save', body([{ op: 'material-capture', memberIds: pair, name: '拆分驗證' }]), { 'If-Match': '"' + secondPlacement.draftRevision + '"' });
      const pairDTO = await ok(role, path + '?revision=' + pairReceipt.draftRevision);
      const pairMaterial = pairDTO.materialDefinitions.find(row => !secondDTO.materialDefinitions.some(old => old.materialId === row.materialId));
      assert.equal(pairMaterial.cellCount, 2);
      const pairVariant = pairDTO.materialPlacement.materials.find(row => row.materialId === pairMaterial.materialId).variantRefs[0];
      const parentReceipt = await ok(role, path + '/save', body([{ op: 'decoration-place', materialId: pairMaterial.materialId, variantRef: pairVariant, x: 0, y: 0, waterClass: 'river' }]), { 'If-Match': '"' + pairReceipt.draftRevision + '"' });
      const parentDTO = await ok(role, path + '?revision=' + parentReceipt.draftRevision), parentId = parentDTO.decorationInstances.at(-1).instanceId;
      const parentSource = (await app.privateDrafts.captureForCompile(hashes[role], target, parentReceipt.draftRevision)).game;
      assert.deepEqual(parentDTO.decorationSplitCandidates.find(row => row.instanceId === parentId), { instanceId: parentId, childCount: 2 });
      controller.actions.setField('revision', parentReceipt.draftRevision); await controller.actions.load();
      assert.deepEqual(model.materials.splitCandidates, parentDTO.decorationSplitCandidates);
      const split = { op: 'decoration-split', instanceId: parentId, childCount: 2 }, splitKey = 'owned-' + role + '-decoration-split-001';
      const splitHeaders = { 'If-Match': '"' + parentReceipt.draftRevision + '"', 'Idempotency-Key': splitKey };
      const parentCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      const parentHeaders = { 'If-Match': '"' + parentReceipt.draftRevision + '"' };
      // In-range but inaccurate counts and an invalid suffix after a valid
      // split must fail before any draft object is written.
      for (const edits of [[{ ...split, childCount: 3 }], [{ ...split, childCount: 256 }], [split, split], [split, { ...split, instanceId: 'missing' }], Array(17).fill(split)]) {
        assert.equal((await call(role, path + '/save', body(edits), parentHeaders)).status, 422);
      }
      assert.equal((await call(role, path + '/save', body([{ ...split, instanceId: 'x'.repeat(17000) }]), parentHeaders)).status, 413);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, parentCount);
      const splitEdits = [{ op: 'water-rename', groupId: 'group-' + parentId, name: parentDTO.waterGroups.find(row => row.groupId === 'group-' + parentId).name }, split];
      const splitReceipt = await ok(role, path + '/save', body(splitEdits), splitHeaders);
      assert.deepEqual(await ok(role, path + '/save', body(splitEdits), splitHeaders), splitReceipt);
      assert.deepEqual(await ok(role, path + '/operations/' + splitKey), { state: 'committed', result: splitReceipt });
      const children = [0, 1].map(i => target + '#decoration-' + sha(JSON.stringify(['dragon-decoration-child-1', target, actorId, splitKey, 1, i])));
      const splitSource = (await app.privateDrafts.captureForCompile(hashes[role], target, splitReceipt.draftRevision)).game;
      assert.deepEqual(splitSource, splitDecoration(parentSource, parentId, children));
      const splitDTO = await ok(role, path + '?revision=' + splitReceipt.draftRevision);
      assert.deepEqual(splitDTO.decorationInstances.slice(-2).map(row => row.instanceId), children);
      assert.deepEqual(splitDTO.decorationSplitCandidates.slice(-2), children.map(instanceId => ({ instanceId, childCount: null })));
      assert.equal(splitDTO.decorationSplitCandidates.some(row => row.instanceId === parentId), false);
      controller.actions.setField('revision', splitReceipt.draftRevision); await controller.actions.load();
      assert.deepEqual(model.materials.splitCandidates, splitDTO.decorationSplitCandidates);
      assert.deepEqual(splitDTO.decorationInstances.slice(0, -2), parentDTO.decorationInstances.slice(0, -1));
      assert.deepEqual(splitDTO.waterGroupMembers.find(row => row.groupId === 'group-' + parentId).memberIds, children);
      for (const field of ['chapters', 'strongholds', 'map', 'cityDefinitions']) assert.deepEqual(splitDTO[field], parentDTO[field]);
      assert.deepEqual(await ok(role, path + '?revision=' + parentReceipt.draftRevision), parentDTO);
      const splitJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, splitKey).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(splitJSON).mapEdits, splitEdits); assert.ok(!splitJSON.includes('childIds')); groups++;
      const splitCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      const splitCurrent = { 'If-Match': '"' + splitReceipt.draftRevision + '"' };
      for (const edit of [{ ...split, childCount: 0 }, { ...split, childCount: 257 }, { ...split, childCount: 2.5 }, { ...split, childCount: '2' }, { ...split, childIds: children }, { ...split, instanceId: 'missing' }, { ...split, instanceId: children[0] }, split]) {
        assert.equal((await call(role, path + '/save', body([edit]), splitCurrent)).status, 422);
      }
      assert.equal((await call(role, path + '/save', body([{ ...split, childCount: 3 }]), splitHeaders)).status, 409);
      assert.equal((await call(role, path + '/save', body([split]), { 'If-Match': '"' + parentReceipt.draftRevision + '"' })).status, 412);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([split]), splitCurrent)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, splitCount);
      const corruptSplit = JSON.parse(splitJSON); corruptSplit.mapEdits[1].childCount = 3;
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corruptSplit), actorId, splitKey);
      try {
        assert.equal((await call(role, path + '?revision=' + splitReceipt.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, splitReceipt.draftRevision), error => error.status === 422);
        assert.equal((await call(role, path + '/save', body([]), splitCurrent)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', splitJSON, actorId, splitKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + splitReceipt.draftRevision), splitDTO);
      const removedPair = await ok(role, path + '/save', body([{ op: 'material-remove', materialId: pairMaterial.materialId }]), splitCurrent);
      const cleaned = await ok(role, path + '?revision=' + removedPair.draftRevision);
      assert.deepEqual(cleaned.decorationInstances, splitDTO.decorationInstances);
      assert.deepEqual(cleaned.waterGroupMembers, splitDTO.waterGroupMembers);
      assert.deepEqual(await ok(role, path + '?revision=' + splitReceipt.draftRevision), splitDTO); groups++;
      if (placementOnly) process.stderr.write('split ' + role + ': identities and history complete\n');
      const removeKey = 'owned-' + role + '-decoration-remove-001';
      const remove = { op: 'decoration-remove', memberIds: [children[0]] };
      const removeHeaders = { 'If-Match': '"' + removedPair.draftRevision + '"', 'Idempotency-Key': removeKey };
      const removalBase = (await app.privateDrafts.captureForCompile(hashes[role], target, removedPair.draftRevision)).game;
      const removed = await ok(role, path + '/save', body([remove]), removeHeaders);
      assert.deepEqual(await ok(role, path + '/save', body([remove]), removeHeaders), removed);
      assert.deepEqual(await ok(role, path + '/operations/' + removeKey), { state: 'committed', result: removed });
      const removalDTO = await ok(role, path + '?revision=' + removed.draftRevision);
      assert.deepEqual(removalDTO.decorationInstances, cleaned.decorationInstances.filter(row => row.instanceId !== children[0]));
      assert.deepEqual(removalDTO.decorationSplitCandidates, cleaned.decorationSplitCandidates.filter(row => row.instanceId !== children[0]));
      assert.deepEqual(removalDTO.waterGroupMembers.find(row => row.groupId === 'group-' + parentId).memberIds, [children[1]]);
      for (const field of ['chapters', 'strongholds', 'map', 'cityDefinitions', 'materialPlacement']) assert.deepEqual(removalDTO[field], cleaned[field]);
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, removed.draftRevision)).game, removeDecorations(removalBase, remove.memberIds));
      assert.deepEqual(await ok(role, path + '?revision=' + removedPair.draftRevision), cleaned);
      const removalJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, removeKey).toArray()[0].request_json;
      assert.deepEqual(JSON.parse(removalJSON).mapEdits, [remove]); groups++;
      const removalCurrent = { 'If-Match': '"' + removed.draftRevision + '"' }, remaining = { op: 'decoration-remove', memberIds: [children[1]] };
      const removalCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      for (const edit of [remove, { ...remaining, memberIds: [] }, { ...remaining, memberIds: [children[1], children[1]] }, { ...remaining, memberIds: [children[1], 'missing'] }, { ...remaining, memberIds: [0] }, { ...remaining, extra: true }, { ...remaining, memberIds: [removalBase.map.placements[0].id] }]) assert.equal((await call(role, path + '/save', body([edit]), removalCurrent)).status, 422);
      assert.equal((await call(role, path + '/save', body([remaining, { ...remaining, memberIds: ['missing'] }]), removalCurrent)).status, 422);
      assert.equal((await call(role, path + '/save', body(Array(17).fill(remaining)), removalCurrent)).status, 422);
      assert.equal((await call(role, path + '/save', body([{ ...remaining, memberIds: ['x'.repeat(17000)] }]), removalCurrent)).status, 413);
      assert.equal((await call(role, path + '/save', body([remaining]), removeHeaders)).status, 409);
      assert.equal((await call(role, path + '/save', body([remaining]), { 'If-Match': '"' + removedPair.draftRevision + '"' })).status, 412);
      for (const outsider of ['other', role === 'admin' ? 'author' : 'admin']) assert.equal((await call(outsider, path + '/save', body([remaining]), removalCurrent)).status, 404);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, removalCount);
      const corruptRemoval = JSON.parse(removalJSON); corruptRemoval.mapEdits[0].memberIds = ['missing-history-instance'];
      sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corruptRemoval), actorId, removeKey);
      try {
        assert.equal((await call(role, path + '?revision=' + removed.draftRevision)).status, 422);
        await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[role], target, removed.draftRevision), error => error.status === 422);
        assert.equal((await call(role, path + '/save', body([]), removalCurrent)).status, 422);
      } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', removalJSON, actorId, removeKey); }
      app = make(); assert.deepEqual(await ok(role, path + '?revision=' + removed.draftRevision), removalDTO);
      const lastRemoved = await ok(role, path + '/save', body([remaining]), removalCurrent);
      const emptyGroupDTO = await ok(role, path + '?revision=' + lastRemoved.draftRevision);
      assert.equal(emptyGroupDTO.waterGroupMembers.some(row => row.groupId === 'group-' + parentId), false);
      assert.deepEqual(emptyGroupDTO.decorationInstances, cleaned.decorationInstances.filter(row => !children.includes(row.instanceId)));
      assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[role], target, lastRemoved.draftRevision)).game, removeDecorations(removalBase, children));
      assert.deepEqual(await ok(role, path + '?revision=' + removed.draftRevision), removalDTO); groups++;
      if (placementOnly) process.stderr.write('remove ' + role + ': membership and history complete\n');
    }
    assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json, legacy);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0);
  } else {
  if (!cityNamesOnly) {
  // Explicit predecessor service fixture, never a client-selectable mode.
  const modern = app.authorCopies;
  const legacy = new AdminFullCopy({ storage, principal: h => app.principal(h), catalog: authorSource, games: app.games, blobs: app.blobs, roles: ['author'], leaseMs: 300000 });
  app.authorCopies = legacy;
  const legacyKey = 'owned-legacy-copy-001', legacyInput = copyInput('舊版完整');
  const lr = legacy.reserve(hashes.author, legacyKey, legacyInput);
  const oldReceipt = await legacy.execute(hashes.author, legacy.claim(hashes.author, legacyKey, lr.rowRevision));
  const pendingKey = 'owned-legacy-pending-1', pendingInput = copyInput('舊待執行');
  const oldPending = legacy.reserve(hashes.author, pendingKey, pendingInput);
  app.authorCopies = modern;
  const storedRequest = sql.exec('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', author, pendingKey).toArray()[0];
  assert.deepEqual(await ok('author', '/api/games/create/' + legacyKey), oldReceipt);
  assert.equal((await ok('author', `/api/games/${lr.gameId}/draft?revision=1`)).chapters.length, 20);
  assert.deepEqual(modern.reserve(hashes.author, pendingKey, pendingInput), oldPending);
  assert.throws(() => modern.claim(hashes.author, pendingKey, oldPending.rowRevision), error => error.code === 'COPY_PROFILE_CHANGED');
  assert.deepEqual(sql.exec('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', author, pendingKey).toArray()[0], storedRequest);
  assert.equal(modern.cancel(hashes.author, pendingKey, oldPending.rowRevision).state, 'canceled'); groups++;
  app = make();
  assert.deepEqual(await ok('author', '/api/games/create/' + operationKey), receipt);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=2`), updated);
  assert.deepEqual(await ok('author', '/api/games/create/' + legacyKey), oldReceipt); groups++;
  // Definitions remain outside chapter slots. Their allocated IDs and edit
  // history survive read/restart without mutating an earlier captured source.
  const savePath = `/api/games/${gameId}/draft/save`;
  const bodyFor = generalEdits => ({ metadata: updated.metadata, resourceEdits: [], generalEdits });
  const saveAt = (revision, key, body) => ok('author', savePath, body, { 'If-Match': `"${revision}"`, 'Idempotency-Key': key });
  const definitionId = (key, index) => gameId + '#general-' + sha(JSON.stringify(['dragon-general-definition-1', gameId, author, key, index]));
  assert.deepEqual(updated.generalDefinitions, []); assert.equal(ad.generalDefinitions, null);
  const portrait = KAO_MANIFEST[0], values = { name: ' e\u0301 ', hao: '𠀀', portraitRef: { assetId: portrait.id, sha256: portrait.sha256 } };
  const createKey = 'owned-general-create-001', createBody = bodyFor([{ op: 'create', values }, { op: 'create', values }]);
  const created = await saveAt('2', createKey, createBody); assert.equal(created.draftRevision, '3');
  assert.deepEqual(await saveAt('2', createKey, createBody), created);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft/operations/${createKey}`), { state: 'committed', result: created });
  const withDefinitions = await ok('author', `/api/games/${gameId}/draft?revision=3`);
  const ids = [definitionId(createKey, 0), definitionId(createKey, 1)];
  assert.deepEqual(withDefinitions.generalDefinitions.map(row => row.generalId).sort(), [...ids].sort());
  assert.ok(withDefinitions.generalDefinitions.every(row => row.name === 'é' && row.hao === '𠀀' && row.portraitRef.assetId === portrait.id && row.portraitRef.sha256 === portrait.sha256));
  assert.deepEqual(withDefinitions.chapters, updated.chapters); assert.deepEqual(withDefinitions.strongholds, updated.strongholds); groups++;
  const definitionSource = await app.privateDrafts.captureForCompile(hashes.author, gameId, '3');
  assert.deepEqual(definitionSource.game.map, next.game.map); assert.deepEqual(definitionSource.game.cities, next.game.cities);
  assert.equal(Object.keys(definitionSource.game.generals).length, 2); assert.deepEqual(next.game.generals, {});
  assert.equal(Object.hasOwn(definitionSource.game, 'sourceRecords'), false);
  assert.equal((await call('other', savePath, createBody, { 'If-Match': '"3"' })).status, 404);
  assert.equal((await call('admin', savePath, createBody, { 'If-Match': '"3"' })).status, 404);
  assert.equal((await call('other', `/api/games/${gameId}/draft/operations/${createKey}`)).status, 404); groups++;
  const changedValues = { name: '同名人物', hao: '', portraitRef: null };
  assert.equal((await saveAt('3', 'owned-general-update-001', bodyFor([{ op: 'update', generalId: ids[0], values: changedValues }]))).draftRevision, '4');
  const changedDefinitions = await ok('author', `/api/games/${gameId}/draft?revision=4`);
  assert.deepEqual(changedDefinitions.generalDefinitions.find(row => row.generalId === ids[0]), { generalId: ids[0], ...changedValues });
  assert.deepEqual(changedDefinitions.generalDefinitions.find(row => row.generalId === ids[1]), withDefinitions.generalDefinitions.find(row => row.generalId === ids[1])); groups++;
  assert.equal((await saveAt('4', 'owned-general-delete-001', bodyFor([{ op: 'delete', generalId: ids[0] }]))).draftRevision, '5');
  const afterDelete = await ok('author', `/api/games/${gameId}/draft?revision=5`);
  assert.deepEqual(afterDelete.generalDefinitions, withDefinitions.generalDefinitions.filter(row => row.generalId === ids[1]));
  assert.deepEqual(afterDelete.chapters, updated.chapters); groups++;
  for (const generalEdits of [null, [{ op: 'create', generalId: ids[0], values }], [{ op: 'create', values: { ...values, force: 99 } }]]) {
    assert.equal((await call('author', savePath, { ...bodyFor([]), generalEdits }, { 'If-Match': '"5"' })).status, 422);
  }
  const foreignId = other + '#general-' + 'a'.repeat(64);
  for (const edit of [{ op: 'delete', generalId: foreignId }, { op: 'create', values: { ...values, portraitRef: { assetId: portrait.id, sha256: '0'.repeat(64) } } }]) {
    const rejected = await call('author', savePath, bodyFor([edit]), { 'If-Match': '"5"' });
    assert.equal(rejected.status, 422); assert.equal(rejected.data.error, 'DRAFT_GENERAL_EDIT');
  }
  const fullRejected = await call('admin', `/api/games/${ar.gameId}/draft/save`, { metadata: ad.metadata, resourceEdits: [], generalEdits: createBody.generalEdits }, { 'If-Match': '"1"' });
  assert.equal(fullRejected.status, 422); assert.equal(fullRejected.data.error, 'DRAFT_GENERAL_EDIT');
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=5`), afterDelete); groups++;
  // Reserve an invalid future-revision request FIRST, then retry it unchanged
  // as a no-op after that revision is created. History must not use rowid order.
  const laterKey = 'owned-general-create-002', laterId = definitionId(laterKey, 0), futureKey = 'owned-general-future-001';
  const futureBody = bodyFor([{ op: 'update', generalId: laterId, values: changedValues }]);
  assert.equal((await call('author', savePath, futureBody, { 'If-Match': '"6"', 'Idempotency-Key': futureKey })).status, 412);
  const later = await saveAt('5', laterKey, bodyFor([{ op: 'create', values: changedValues }])); assert.equal(later.draftRevision, '6');
  const noChange = await saveAt('6', futureKey, futureBody); assert.equal(noChange.draftRevision, '6');
  const ordered = sql.exec('SELECT op_key FROM draft_requests WHERE op_key IN (?,?) ORDER BY rowid', futureKey, laterKey).toArray().map(row => row.op_key);
  assert.deepEqual(ordered, [futureKey, laterKey]);
  const stableDefinitions = await ok('author', `/api/games/${gameId}/draft?revision=6`);
  assert.deepEqual(stableDefinitions.generalDefinitions.map(row => row.generalId).sort(), [ids[1], laterId].sort());
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_snapshots WHERE game_id=? AND revision=?', gameId, '7').toArray()[0].n, 0); groups++;
  app = make();
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=6`), stableDefinitions);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=3`), withDefinitions);
  assert.deepEqual(await saveAt('2', createKey, createBody), created);
  assert.equal((await call('author', savePath, futureBody, { 'If-Match': '"5"' })).status, 412);
  assert.equal((await call('author', savePath, { ...createBody, generalEdits: [createBody.generalEdits[0]] }, { 'If-Match': '"2"', 'Idempotency-Key': createKey })).status, 409); groups++;
  const legacyRequest = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json;
  let legacyBody; try { legacyBody = JSON.parse(legacyRequest); } catch (cause) { throw new Error('invalid owned request fixture', { cause }); }
  assert.equal(Object.hasOwn(legacyBody, 'generalEdits'), false);
  assert.deepEqual(await saveAt('1', 'owned-template-save-001', saveBody), saved);
  assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json, legacyRequest); groups++;
  const stillNoTrial = await call('author', `/api/games/${gameId}/trials`, { expectedRevision: '6', chapterId: first.chapterId });
  assert.equal(stillNoTrial.status, 409); assert.equal(stillNoTrial.data.error, 'TRIAL_SNAPSHOT_CHANGED');
  assert.equal((await call('author', '/api/publish', { gameId, name: '仍未准入' })).data.error, 'PUBLISH_NOT_COMPILED');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  const storedCreate = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, createKey).toArray()[0].request_json;
  let changedHistory; try { changedHistory = JSON.parse(storedCreate); } catch (cause) { throw new Error('invalid owned creation fixture', { cause }); }
  changedHistory.generalEdits[1].values.name = '非原請求';
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(changedHistory), author, createKey);
  try {
    const rejected = await call('author', `/api/games/${gameId}/draft?revision=6`);
    assert.equal(rejected.status, 422); assert.equal(rejected.data.error, 'COPY_PROTECTED_DELTA');
  } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', storedCreate, author, createKey); }
  const withoutChapterHistory = { ...legacyBody }; delete withoutChapterHistory.chapterEdits;
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(withoutChapterHistory), author, 'owned-template-save-001');
  try { assert.equal((await call('author', `/api/games/${gameId}/draft?revision=6`)).data.error, 'DRAFT_HISTORY_CORRUPT'); }
  finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', legacyRequest, author, 'owned-template-save-001'); }
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=6`), stableDefinitions); groups++;
  let draftRevocationReads = 0;
  bucket.get = async key => { const object = await originalGet(key); draftRevocationReads++; sql.exec('UPDATE users SET epoch=2 WHERE id=?', author); return object; };
  try {
    const revoked = await call('author', savePath, bodyFor([{ op: 'create', values: changedValues }]), { 'If-Match': '"6"', 'Idempotency-Key': 'owned-general-revoked-001' });
    assert.equal(revoked.status, 401); assert.equal(revoked.data.error, 'SESSION_INVALID');
  } finally { bucket.get = originalGet; sql.exec('UPDATE users SET epoch=1 WHERE id=?', author); }
  assert.equal(draftRevocationReads, 1);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=6`), stableDefinitions);
  assert.equal(sql.exec('SELECT draft_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].draft_revision, '6'); groups++;
  const ordinarySave = { metadata: { name: '定義保留', introduction: '' }, resourceEdits: [], chapterEdits: [{ op: 'copy', chapterId: first.chapterId }] };
  assert.equal((await saveAt('6', 'owned-general-ordinary-01', ordinarySave)).draftRevision, '7');
  const ordinaryRead = await ok('author', `/api/games/${gameId}/draft?revision=7`);
  assert.deepEqual(ordinaryRead.generalDefinitions, stableDefinitions.generalDefinitions);
  assert.deepEqual(ordinaryRead.chapters.slice(0, 2), stableDefinitions.chapters);
  assert.equal(ordinaryRead.chapters.length, 3); assert.equal(ordinaryRead.metadata.name, '定義保留');
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=6`), stableDefinitions); groups++;
  // Malformed lists remain refused before a request reservation; optional
  // absence in old request_json is still preserved byte-for-byte.
  const requestCount = sql.exec('SELECT COUNT(*) AS n FROM draft_requests').toArray()[0].n;
  for (const peopleEdits of [null, [{ op: 'unknown' }], Array(17).fill({ op: 'remove', chapterId: first.chapterId, generalId: laterId })]) {
    const denied = await call('author', savePath, { metadata: ordinaryRead.metadata, resourceEdits: [], peopleEdits }, { 'If-Match': '"7"' });
    assert.equal(denied.status, 422); assert.equal(denied.data.error, 'DRAFT_PEOPLE_EDITS');
  }
  for (const mapEdits of [null, [{ op: 'unknown', groupId: 'not-an-http-grant', showOnMinimap: false }]]) {
    const denied = await call('author', savePath, { metadata: ordinaryRead.metadata, resourceEdits: [], mapEdits }, { 'If-Match': '"7"' });
    assert.equal(denied.status, 422); assert.equal(denied.data.error, 'DRAFT_MAP_EDITS');
  }
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_requests').toArray()[0].n, requestCount);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=7`), ordinaryRead); groups++;
  // A source-equivalent final update still fails if inserted before creation.
  const outOfOrder = { ...legacyBody, generalEdits: [{ op: 'update', generalId: laterId, values: changedValues }] };
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(outOfOrder), author, 'owned-template-save-001');
  try {
    const denied = await call('author', `/api/games/${gameId}/draft?revision=7`);
    assert.equal(denied.status, 422); assert.equal(denied.data.error, 'COPY_TEMPLATE_HISTORY');
    await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.author, gameId, '7'), error => error.code === 'COPY_TEMPLATE_HISTORY');
    const deniedSave = await call('author', savePath, { metadata: ordinaryRead.metadata, resourceEdits: [] }, { 'If-Match': '"7"', 'Idempotency-Key': 'owned-history-bad-001' });
    assert.equal(deniedSave.status, 422); assert.equal(deniedSave.data.error, 'COPY_TEMPLATE_HISTORY');
    assert.equal(sql.exec('SELECT draft_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].draft_revision, '7');
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects WHERE op_key=?', 'owned-history-bad-001').toArray()[0].n, 0);
  } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', legacyRequest, author, 'owned-template-save-001'); }
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=7`), ordinaryRead); groups++;
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify({ ...legacyBody, peopleEdits: null }), author, 'owned-template-save-001');
  try { assert.equal((await call('author', `/api/games/${gameId}/draft?revision=7`)).data.error, 'DRAFT_HISTORY_CORRUPT'); }
  finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', legacyRequest, author, 'owned-template-save-001'); }
  assert.equal((await saveAt('7', 'owned-history-clean-001', { metadata: ordinaryRead.metadata, resourceEdits: [] })).draftRevision, '7');
  app = make();
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=7`), ordinaryRead);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=3`), withDefinitions); groups++;
  // Actual chapter-person HTTP writes, with the same original-key, exact
  // revision and whole-source ordered verification as existing draft commands.
  const secondChapter = ordinaryRead.chapters[1].chapterId;
  const personEdit = (chapterId, overrides = {}, included = true) => ({ op: 'set', chapterId, generalId: laterId, values: { included, factionId: null, overrides } });
  const personBody = (peopleEdits = [], generalEdits = []) => ({ metadata: ordinaryRead.metadata, resourceEdits: [], peopleEdits, generalEdits });
  assert.equal(ad.chapterPeople, null); assert.equal(ad.generalReferences, null);
  assert.deepEqual(ordinaryRead.chapterPeople, ordinaryRead.chapters.map(row => ({ chapterId: row.chapterId, people: [] })));
  assert.ok(ordinaryRead.generalReferences.every(row => row.chapters.length === 0));
  assert.equal((await saveAt('7', 'owned-people-empty-001', personBody())).draftRevision, '7');
  const bindKey = 'owned-people-bind-001', bindBody = personBody([personEdit(first.chapterId), personEdit(secondChapter, { name: '章名', portraitRef: null }, false)]);
  const bound = await saveAt('7', bindKey, bindBody); assert.equal(bound.draftRevision, '8');
  assert.deepEqual(await saveAt('7', bindKey, bindBody), bound);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft/operations/${bindKey}`), { state: 'committed', result: bound });
  const boundRead = await ok('author', `/api/games/${gameId}/draft?revision=8`);
  const personOf = (dto, chapterId) => dto.chapterPeople.find(row => row.chapterId === chapterId).people.find(row => row.generalId === laterId);
  const refsOf = dto => dto.generalReferences.find(row => row.generalId === laterId).chapters;
  assert.deepEqual(personOf(boundRead, first.chapterId).overrides, {});
  assert.deepEqual(personOf(boundRead, first.chapterId).values, changedValues);
  assert.equal(personOf(boundRead, secondChapter).included, false);
  assert.deepEqual(personOf(boundRead, secondChapter).values, { ...changedValues, name: '章名' });
  assert.deepEqual(refsOf(boundRead), [
    { chapterId: first.chapterId, included: true, inheritedFields: ['name', 'hao', 'portraitRef'], overriddenFields: [] },
    { chapterId: secondChapter, included: false, inheritedFields: ['hao'], overriddenFields: ['name', 'portraitRef'] },
  ]);
  assert.deepEqual(boundRead.chapters, ordinaryRead.chapters); assert.deepEqual(boundRead.generalDefinitions, ordinaryRead.generalDefinitions);
  assert.equal(Object.hasOwn(legacyBody, 'peopleEdits'), false);
  assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json, legacyRequest); groups++;
  let deniedIndex = 0;
  const refuse = async (expected, body, status, code) => {
    const key = `owned-people-refusal-${++deniedIndex}`;
    const denied = await call('author', savePath, body, { 'If-Match': `"${expected}"`, 'Idempotency-Key': key });
    assert.equal(denied.status, status, JSON.stringify(denied.data)); if (code) assert.equal(denied.data.error, code);
    assert.equal(sql.exec('SELECT draft_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].draft_revision, expected);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects WHERE op_key=?', key).toArray()[0].n, 0);
  };
  for (const edit of [personEdit('missing'), { ...personEdit(first.chapterId), generalId: foreignId },
    { ...personEdit(first.chapterId), values: { included: true, factionId: 'unknown', overrides: {} } }, personEdit(first.chapterId, { force: 100 }), personEdit(first.chapterId, { name: null }),
    personEdit(first.chapterId, { portraitRef: { assetId: portrait.id, sha256: '0'.repeat(64) } }), { ...personEdit(first.chapterId), slot: 0 }]) {
    await refuse('8', personBody([edit]), 422);
  }
  const fullPeople = await call('admin', `/api/games/${ar.gameId}/draft/save`, { ...personBody([personEdit(first.chapterId)]), metadata: ad.metadata }, { 'If-Match': '"1"' });
  assert.equal(fullPeople.status, 422); assert.equal(fullPeople.data.error, 'DRAFT_PEOPLE_EDIT');
  assert.equal((await call('other', savePath, bindBody, { 'If-Match': '"8"' })).status, 404);
  assert.equal((await call('admin', savePath, bindBody, { 'If-Match': '"8"' })).status, 404);
  assert.equal((await call('author', savePath, bindBody, { 'If-Match': '"7"' })).status, 412);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=8`), boundRead); groups++;
  // No old client can silently change inherited values: exact chapter/field
  // acknowledgments are required, also for included=false configurations.
  const baseValues = { name: 'é', hao: '新字', portraitRef: values.portraitRef };
  const baseEdit = { op: 'update', generalId: laterId, values: baseValues };
  const impacts = [{ chapterId: first.chapterId, fields: ['name', 'hao', 'portraitRef'] }, { chapterId: secondChapter, fields: ['hao'] }];
  await refuse('8', personBody([], [baseEdit]), 409, 'DRAFT_GENERAL_IMPACT_REQUIRED');
  for (const confirmedImpacts of [[], [impacts[0]], impacts.toReversed(), [{ ...impacts[0], fields: ['name'] }, impacts[1]]]) {
    await refuse('8', personBody([], [{ ...baseEdit, confirmedImpacts }]), 409, 'DRAFT_GENERAL_IMPACT_CHANGED');
  }
  await refuse('8', personBody([], [{ ...baseEdit, confirmedImpacts: [impacts[0], impacts[0]] }]), 422, 'DRAFT_GENERAL_IMPACTS');
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=8`), boundRead); groups++;
  const acknowledgedBody = personBody([], [{ ...baseEdit, confirmedImpacts: impacts }]);
  assert.equal((await saveAt('8', 'owned-people-impact-001', acknowledgedBody)).draftRevision, '9');
  const inheritedRead = await ok('author', `/api/games/${gameId}/draft?revision=9`);
  assert.deepEqual(personOf(inheritedRead, first.chapterId).values, baseValues);
  assert.deepEqual(personOf(inheritedRead, secondChapter).values, { name: '章名', hao: '新字', portraitRef: null });
  assert.deepEqual(personOf(inheritedRead, secondChapter).overrides, { name: '章名', portraitRef: null });
  assert.equal((await saveAt('9', 'owned-people-canonical-01', personBody([], [{ ...baseEdit, values: { ...baseValues, name: ' e\u0301 ' } }]))).draftRevision, '9');
  app = make(); assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=9`), inheritedRead);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=8`), boundRead); groups++;
  // In one save, chapter copy precedes the people change: the copy captures the
  // previous override record, but both still inherit the current base values.
  const copiedBody = { ...personBody([personEdit(first.chapterId, { name: '原章覆寫' })]), chapterEdits: [{ op: 'copy', chapterId: first.chapterId }] };
  assert.equal((await saveAt('9', 'owned-people-copy-001', copiedBody)).draftRevision, '10');
  const copiedRead = await ok('author', `/api/games/${gameId}/draft?revision=10`), copyId = copiedRead.chapters.at(-1).chapterId;
  assert.equal(copiedRead.chapters.length, 4);
  assert.deepEqual(personOf(copiedRead, copyId).overrides, {}); assert.deepEqual(personOf(copiedRead, copyId).values, baseValues);
  assert.equal(personOf(copiedRead, first.chapterId).values.name, '原章覆寫');
  const removes = [first.chapterId, secondChapter, copyId].map(chapterId => ({ op: 'remove', chapterId, generalId: laterId }));
  await refuse('10', personBody([], [{ op: 'delete', generalId: laterId }]), 422, 'DRAFT_GENERAL_EDIT');
  await refuse('10', personBody(removes, [{ op: 'delete', generalId: laterId }]), 422, 'DRAFT_GENERAL_EDIT'); groups++;
  assert.equal((await saveAt('10', 'owned-people-remove-001', personBody([removes[0], removes[2]]))).draftRevision, '11');
  const inactiveOnly = await ok('author', `/api/games/${gameId}/draft?revision=11`);
  assert.deepEqual(refsOf(inactiveOnly).map(row => [row.chapterId, row.included]), [[secondChapter, false]]);
  await refuse('11', personBody([], [{ op: 'delete', generalId: laterId }]), 422, 'DRAFT_GENERAL_EDIT');
  assert.equal((await saveAt('11', 'owned-people-remove-002', personBody([removes[1]]))).draftRevision, '12');
  const unboundRead = await ok('author', `/api/games/${gameId}/draft?revision=12`); assert.deepEqual(refsOf(unboundRead), []);
  assert.equal((await saveAt('12', 'owned-people-delete-001', personBody([], [{ op: 'delete', generalId: laterId }]))).draftRevision, '13');
  const finalPeople = await ok('author', `/api/games/${gameId}/draft?revision=13`);
  assert.deepEqual(finalPeople.generalDefinitions, withDefinitions.generalDefinitions.filter(row => row.generalId === ids[1]));
  assert.ok(finalPeople.chapterPeople.every(row => row.people.length === 0)); groups++;
  const finalSource = await app.privateDrafts.captureForCompile(hashes.author, gameId, '13');
  assert.deepEqual(finalSource.game.map, captured.game.map); assert.deepEqual(finalSource.game.cities, captured.game.cities);
  assert.deepEqual(finalSource.game.compatibility, captured.game.compatibility);
  assert.ok(finalPeople.chapters.every(row => row.generals.length === 0 && row.factions.length === 0 && row.cities.length === 0 && row.gaps.activeGaps === 3));
  app = make(); assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=13`), finalPeople);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=8`), boundRead);
  assert.deepEqual(await saveAt('7', bindKey, bindBody), bound); groups++;
  const storedBind = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, bindKey).toArray()[0].request_json;
  let badPeopleHistory; try { badPeopleHistory = JSON.parse(storedBind); } catch (cause) { throw new Error('invalid owned people fixture', { cause }); }
  badPeopleHistory.peopleEdits[0].generalId = foreignId;
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(badPeopleHistory), author, bindKey);
  try {
    const rejected = await call('author', `/api/games/${gameId}/draft?revision=13`);
    assert.equal(rejected.status, 422); assert.equal(rejected.data.error, 'COPY_TEMPLATE_HISTORY');
    await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.author, gameId, '13'), error => error.code === 'COPY_TEMPLATE_HISTORY');
    await refuse('13', personBody(), 422, 'COPY_TEMPLATE_HISTORY');
  } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', storedBind, author, bindKey); }
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=13`), finalPeople); groups++;
  const noPeopleTrial = await call('author', `/api/games/${gameId}/trials`, { expectedRevision: '13', chapterId: first.chapterId });
  assert.equal(noPeopleTrial.status, 409); assert.equal(noPeopleTrial.data.error, 'TRIAL_SNAPSHOT_CHANGED');
  assert.equal((await call('author', '/api/publish', { gameId, name: '仍未准入' })).data.error, 'PUBLISH_NOT_COMPILED');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  // Saved display flag only: same original operation, exact source and history.
  const water = finalPeople.waterGroups[0]; assert.ok(water);
  assert.deepEqual(ad.waterGroups, finalPeople.waterGroups, 'same captured map exposes the same visibility commands, not template people permission');
  assert.deepEqual(finalPeople.waterGroups, finalSource.game.map.waterGroups.map(group => ({ groupId: group.id, name: typeof group.name === 'string' ? group.name : null, showOnMinimap: group.showOnMinimap, memberCount: group.memberIds.length, baseCellCount: group.baseCells.length })));
  const mapEdit = { op: 'water-visibility', groupId: water.groupId, showOnMinimap: !water.showOnMinimap };
  const mapBody = edits => ({ metadata: finalPeople.metadata, resourceEdits: [], mapEdits: edits });
  const mapKey = 'owned-water-visibility-001', waterBody = mapBody([mapEdit]);
  const waterSaved = await saveAt('13', mapKey, waterBody); assert.equal(waterSaved.draftRevision, '14');
  assert.deepEqual(await saveAt('13', mapKey, waterBody), waterSaved);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft/operations/${mapKey}`), { state: 'committed', result: waterSaved });
  const waterRead = await ok('author', `/api/games/${gameId}/draft?revision=14`);
  const expectedRead = structuredClone(finalPeople);
  expectedRead.draftRevision = '14'; expectedRead.sourceDigest = waterRead.sourceDigest;
  expectedRead.waterGroups[0].showOnMinimap = mapEdit.showOnMinimap;
  assert.deepEqual(waterRead, expectedRead);
  const waterSource = await app.privateDrafts.captureForCompile(hashes.author, gameId, '14');
  const expectedSource = structuredClone(finalSource.game); expectedSource.map.waterGroups[0].showOnMinimap = mapEdit.showOnMinimap;
  assert.deepEqual(waterSource.game, expectedSource); groups++;
  for (const mapEdits of [null, Array(17).fill(mapEdit), [{ ...mapEdit, groupId: 'missing' }], [{ ...mapEdit, showOnMinimap: 0 }], [{ ...mapEdit, memberIds: [] }], [{ ...mapEdit, op: 'move-city' }]]) await refuse('14', mapBody(mapEdits), 422);
  const fullMap = await call('admin', `/api/games/${ar.gameId}/draft/save`, { metadata: ad.metadata, resourceEdits: [], mapEdits: [{ ...mapEdit, groupId: 'missing' }] }, { 'If-Match': '"1"' });
  assert.equal(fullMap.status, 422); assert.equal(fullMap.data.error, 'DRAFT_MAP_EDIT');
  for (const actor of ['other', 'admin']) assert.equal((await call(actor, savePath, waterBody, { 'If-Match': '"14"' })).status, 404);
  assert.equal((await call('author', savePath, waterBody, { 'If-Match': '"13"' })).status, 412);
  assert.equal((await call('author', savePath, mapBody([{ ...mapEdit, showOnMinimap: water.showOnMinimap }]), { 'If-Match': '"13"', 'Idempotency-Key': mapKey })).status, 409);
  assert.equal((await saveAt('14', 'owned-water-noop-001', waterBody)).draftRevision, '14'); groups++;
  app = make(); assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=14`), waterRead);
  assert.equal((await saveAt('14', 'owned-water-restore-001', mapBody([{ ...mapEdit, showOnMinimap: water.showOnMinimap }]))).draftRevision, '15');
  assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.author, gameId, '15')).game, finalSource.game);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=14`), waterRead);
  assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=13`), finalPeople);
  assert.equal((await saveAt('15', 'owned-water-legacy-001', { metadata: finalPeople.metadata, resourceEdits: [] })).draftRevision, '15');
  assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, 'owned-template-save-001').toArray()[0].request_json, legacyRequest); groups++;
  const storedMap = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, mapKey).toArray()[0].request_json;
  let badMap; try { badMap = JSON.parse(storedMap); } catch (cause) { throw new Error('invalid owned map history', { cause }); }
  // A later recorded no-op legitimately reasserts the same flag, so changing
  // only an earlier boolean can be content-equivalent. Unknown identity cannot.
  badMap.mapEdits[0].groupId = 'missing-history-group';
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(badMap), author, mapKey);
  try {
    assert.equal((await call('author', `/api/games/${gameId}/draft?revision=14`)).data.error, 'COPY_TEMPLATE_HISTORY');
    await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.author, gameId, '14'), error => error.code === 'COPY_TEMPLATE_HISTORY');
    assert.equal((await call('author', `/api/games/${gameId}/draft/minimap?revision=14`)).data.error, 'COPY_TEMPLATE_HISTORY');
  } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', storedMap, author, mapKey); }
  app = make(); assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=14`), waterRead);
  assert.equal((await call('author', `/api/games/${gameId}/trials`, { expectedRevision: '15', chapterId: first.chapterId })).data.error, 'TRIAL_SNAPSHOT_CHANGED');
  assert.equal((await call('author', '/api/publish', { gameId, name: '顯示非准入' })).data.error, 'PUBLISH_NOT_COMPILED');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  // Authenticated display projection, never latest and never a compile ticket.
  const previewPath = `/api/games/${gameId}/draft/minimap`;
  const counts = () => ['draft_objects', 'draft_requests', 'trial_sessions', 'content_releases'].map(table => sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).toArray()[0].n);
  const beforePreviewCounts = counts(), originalPut = bucket.put.bind(bucket); let previewPuts = 0;
  bucket.put = async (...args) => { previewPuts++; return originalPut(...args); };
  try {
    const originalPreview = await ok('author', previewPath + '?revision=13');
    const hiddenPreview = await ok('author', previewPath + '?revision=14');
    const restoredPreview = await ok('author', previewPath + '?revision=15');
    const expectedPreview = (source, draftRevision, sourceDigest) => {
      const map = compileMapSource({ schemaVersion: 1, map: source.map, componentDefinitions: source.componentDefinitions });
      const { w: width, h: height } = MINIMAP_SIZES.large;
      const { pixels } = renderMinimapPixels(map.minimapGeography, map.roadMask, map.width, map.height, width, height, 1);
      return { format: 'dragon-draft-minimap-1', gameId, draftRevision, sourceDigest, styleRevision: MINIMAP_STYLE_REVISION, textureSeed: 1, width, height, pixelFormat: 'rgb8', pixelsSha256: sha(pixels), pixelsHex: Buffer.from(pixels).toString('hex') };
    };
    assert.deepEqual(originalPreview, expectedPreview(finalSource.game, '13', finalPeople.sourceDigest));
    assert.deepEqual(hiddenPreview, expectedPreview(waterSource.game, '14', waterRead.sourceDigest));
    assert.deepEqual(restoredPreview, { ...originalPreview, draftRevision: '15' });
    assert.notEqual(hiddenPreview.pixelsSha256, originalPreview.pixelsSha256);
    assert.equal(Buffer.from(hiddenPreview.pixelsHex, 'hex').length, 250 * 167 * 3);
    const fullPreview = await ok('admin', `/api/games/${ar.gameId}/draft/minimap?revision=1`);
    assert.equal(fullPreview.gameId, ar.gameId); assert.equal(fullPreview.sourceDigest, ad.sourceDigest);
    assert.equal(fullPreview.pixelsHex, originalPreview.pixelsHex); groups++;
    for (const actor of ['other', 'admin']) assert.equal((await call(actor, previewPath + '?revision=14')).status, 404);
    assert.equal((await call('author', '/api/games/wolong-builtin/draft/minimap?revision=1')).status, 403);
    for (const query of ['', '?revision=14&revision=15', '?revision=14&width=10000', '?revision=0']) assert.equal((await call('author', previewPath + query)).status, 422);
    assert.equal((await call('author', previewPath + '?revision=14', {})).status, 404);
    assert.equal((await call('author', previewPath + '?revision=14', undefined, { Cookie: '' })).status, 401);
    app = make(); assert.deepEqual(await ok('author', previewPath + '?revision=14'), hiddenPreview); groups++;
    let revokedReads = 0;
    bucket.get = async key => { const object = await originalGet(key); revokedReads++; sql.exec('UPDATE users SET disabled=1 WHERE id=?', author); return object; };
    try { assert.equal((await call('author', previewPath + '?revision=14')).status, 401); }
    finally { bucket.get = originalGet; sql.exec('UPDATE users SET disabled=0 WHERE id=?', author); }
    assert.equal(revokedReads, 1); assert.deepEqual(await ok('author', previewPath + '?revision=14'), hiddenPreview);
    assert.deepEqual(counts(), beforePreviewCounts); assert.equal(previewPuts, 0);
    assert.deepEqual(await ok('author', `/api/games/${gameId}/draft?revision=13`), finalPeople); groups++;
  } finally { bucket.put = originalPut; }
  // Full-copy display writes use the same owner/CAS/journal contract, while
  // native records, source identities and all other map fields stay fixed.
  const fullPath = `/api/games/${ar.gameId}/draft`, fullKey = 'owned-fullcopy-water-001';
  const fullSource = await app.privateDrafts.captureForCompile(hashes.admin, ar.gameId, '1');
  const fullBody = { metadata: ad.metadata, resourceEdits: [], mapEdits: [mapEdit] };
  const fullSave = (rev, key, body) => ok('admin', fullPath + '/save', body, { 'If-Match': '"' + rev + '"', 'Idempotency-Key': key });
  const fullSaved = await fullSave('1', fullKey, fullBody); assert.equal(fullSaved.draftRevision, '2');
  assert.deepEqual(await fullSave('1', fullKey, fullBody), fullSaved);
  assert.deepEqual(await ok('admin', fullPath + '/operations/' + fullKey), { state: 'committed', result: fullSaved });
  const fullRead = await ok('admin', fullPath + '?revision=2');
  const expectedFullRead = structuredClone(ad); expectedFullRead.draftRevision = '2'; expectedFullRead.sourceDigest = fullRead.sourceDigest;
  expectedFullRead.waterGroups[0].showOnMinimap = mapEdit.showOnMinimap;
  assert.deepEqual(fullRead, expectedFullRead);
  const expectedFullSource = structuredClone(fullSource.game); expectedFullSource.map.waterGroups[0].showOnMinimap = mapEdit.showOnMinimap;
  assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.admin, ar.gameId, '2')).game, expectedFullSource);
  assert.equal(fullRead.generalDefinitions, null); assert.equal(fullRead.chapterPeople, null); groups++;
  for (const actor of ['author', 'other']) {
    assert.equal((await call(actor, fullPath + '?revision=2')).status, 404);
    assert.equal((await call(actor, fullPath + '/save', fullBody, { 'If-Match': '"2"' })).status, 404);
  }
  assert.equal((await call('admin', fullPath + '/save', fullBody, { 'If-Match': '"1"' })).status, 412);
  assert.equal((await call('admin', fullPath + '/save', { ...fullBody, mapEdits: [] }, { 'If-Match': '"1"', 'Idempotency-Key': fullKey })).status, 409);
  assert.equal((await fullSave('2', 'owned-fullcopy-water-noop', fullBody)).draftRevision, '2'); groups++;
  app = make(); assert.deepEqual(await ok('admin', fullPath + '?revision=2'), fullRead);
  const fullHiddenPreview = await ok('admin', fullPath + '/minimap?revision=2');
  const fullOriginalPreview = await ok('admin', fullPath + '/minimap?revision=1');
  assert.notEqual(fullHiddenPreview.pixelsSha256, fullOriginalPreview.pixelsSha256);
  assert.equal((await fullSave('2', 'owned-fullcopy-water-restore', { ...fullBody, mapEdits: [{ ...mapEdit, showOnMinimap: water.showOnMinimap }] })).draftRevision, '3');
  assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.admin, ar.gameId, '3')).game, fullSource.game);
  assert.deepEqual(await ok('admin', fullPath + '?revision=1'), ad);
  assert.deepEqual(await ok('admin', fullPath + '?revision=2'), fullRead);
  assert.equal((await ok('admin', fullPath + '/minimap?revision=3')).pixelsSha256, fullOriginalPreview.pixelsSha256); groups++;
  const fullHistory = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', admin, fullKey).toArray()[0].request_json;
  let corruptFullHistory; try { corruptFullHistory = JSON.parse(fullHistory); } catch (cause) { throw new Error('invalid owned full-copy history', { cause }); }
  corruptFullHistory.mapEdits[0].groupId = 'missing-history-group';
  sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(corruptFullHistory), admin, fullKey);
  try {
    assert.equal((await call('admin', fullPath + '?revision=2')).data.error, 'COPY_MAP_DELTA');
    assert.equal((await call('admin', fullPath + '/minimap?revision=2')).data.error, 'COPY_MAP_DELTA');
    await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.admin, ar.gameId, '2'), error => error.code === 'COPY_MAP_DELTA');
  } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', fullHistory, admin, fullKey); }
  app = make(); assert.deepEqual(await ok('admin', fullPath + '?revision=2'), fullRead);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  // Shared naming API for both authoring profiles, retaining every prior test.
  for (const [actor, id, rev] of [['author', gameId, '15'], ['admin', ar.gameId, '3']]) {
    const path = `/api/games/${id}/draft`, key = 'owned-water-name-' + actor;
    const old = await ok(actor, path + '?revision=' + rev);
    const source = await app.privateDrafts.captureForCompile(hashes[actor], id, rev);
    const oldPixels = await ok(actor, path + '/minimap?revision=' + rev);
    const rename = { op: 'water-rename', groupId: old.waterGroups[0].groupId, name: '  自訂河段𠀀  ' };
    const body = { metadata: old.metadata, resourceEdits: [], mapEdits: [rename] };
    const headers = { 'If-Match': '"' + rev + '"', 'Idempotency-Key': key };
    const saved = await ok(actor, path + '/save', body, headers), next = String(BigInt(rev) + 1n);
    assert.equal(saved.draftRevision, next);
    assert.deepEqual(await ok(actor, path + '/save', body, headers), saved);
    assert.deepEqual(await ok(actor, path + '/operations/' + key), { state: 'committed', result: saved });
    const named = await ok(actor, path + '?revision=' + next), wanted = structuredClone(old);
    wanted.draftRevision = next; wanted.sourceDigest = named.sourceDigest; wanted.waterGroups[0].name = '自訂河段𠀀';
    assert.deepEqual(named, wanted);
    const expectedSource = structuredClone(source.game); expectedSource.map.waterGroups[0].name = '自訂河段𠀀';
    assert.deepEqual((await app.privateDrafts.captureForCompile(hashes[actor], id, next)).game, expectedSource);
    assert.equal((await ok(actor, path + '/minimap?revision=' + next)).pixelsSha256, oldPixels.pixelsSha256); groups++;
    const countBefore = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    for (const bad of [{ ...rename, name: null }, { ...rename, name: '' }, { ...rename, name: 'bad\ud800' }, { ...rename, name: 'x'.repeat(65) }, { ...rename, groupId: 'missing' }, { ...rename, showOnMinimap: true }]) {
      assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [bad] }, { 'If-Match': '"' + next + '"' })).status, 422);
    }
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, countBefore);
    assert.equal((await call('other', path + '/save', body, { 'If-Match': '"' + next + '"' })).status, 404);
    assert.equal((await call(actor, path + '/save', body, { 'If-Match': '"' + rev + '"' })).status, 412);
    assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [] }, headers)).status, 409);
    assert.equal((await ok(actor, path + '/save', body, { 'If-Match': '"' + next + '"' })).draftRevision, next); groups++;
    app = make(); assert.deepEqual(await ok(actor, path + '?revision=' + next), named);
    assert.deepEqual(await ok(actor, path + '?revision=' + rev), old);
    assert.deepEqual(await ok(actor, path + '/minimap?revision=' + rev), oldPixels);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  }
  // Merge IDs come from the original server operation, never from the client.
  for (const [actor, id, rev, actorId] of [['author', gameId, '16', author], ['admin', ar.gameId, '4', admin]]) {
    const path = `/api/games/${id}/draft`, key = 'owned-water-merge-' + actor;
    const before = await ok(actor, path + '?revision=' + rev);
    const source = (await app.privateDrafts.captureForCompile(hashes[actor], id, rev)).game;
    const instances = new Map([...source.map.decorations, ...source.map.roads.flatMap(road => road.components ?? [])].map(instance => [instance.id, instance]));
    const eligible = group => group.memberIds.every(member => ['river','lake','sea'].includes(instances.get(member)?.waterClass)) && group.baseCells.every(cell => source.map.base.geography[cell]);
    const selected = source.map.waterGroups.filter(eligible).slice(0, 4); assert.equal(selected.length, 4);
    const maps = [0, 2].map(index => ({ op: 'water-merge', groupIds: selected.slice(index, index + 2).map(group => group.id), name: '  合併𠀀  ', showOnMinimap: false }));
    const body = { metadata: before.metadata, resourceEdits: [], mapEdits: maps }, headers = { 'If-Match': '"' + rev + '"', 'Idempotency-Key': key };
    const saved = await ok(actor, path + '/save', body, headers), next = String(BigInt(rev) + 1n);
    assert.equal(saved.draftRevision, next);
    assert.deepEqual(await ok(actor, path + '/save', body, headers), saved);
    assert.deepEqual(await ok(actor, path + '/operations/' + key), { state: 'committed', result: saved });
    const merged = await ok(actor, path + '?revision=' + next);
    const actual = (await app.privateDrafts.captureForCompile(hashes[actor], id, next)).game;
    const expected = structuredClone(source), ids = maps.map((_, index) => id + '#water-' + sha(JSON.stringify(['dragon-water-group-1', id, actorId, key, index])));
    assert.notEqual(ids[0], ids[1]);
    expected.map.waterGroups = source.map.waterGroups.filter(group => !selected.some(item => item.id === group.id));
    for (let index = 0; index < maps.length; index++) {
      const members = selected.slice(index * 2, index * 2 + 2), group = actual.map.waterGroups.find(item => item.id === ids[index]);
      assert.ok(group); assert.equal(group.name, '合併𠀀'); assert.equal(group.showOnMinimap, false);
      assert.deepEqual(group.memberIds, members.flatMap(item => item.memberIds)); assert.deepEqual(group.baseCells, members.flatMap(item => item.baseCells));
      expected.map.waterGroups.push(structuredClone(group));
    }
    assert.deepEqual(actual, expected); assert.equal(merged.waterGroups.length, before.waterGroups.length - 2);
    for (const field of ['chapters','strongholds','map','generalDefinitions','chapterPeople']) assert.deepEqual(merged[field], before[field]);
    const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, key).toArray()[0].request_json;
    let storedBody; try { storedBody = JSON.parse(stored); } catch (cause) { throw new Error('invalid owned merge request', { cause }); }
    assert.deepEqual(storedBody.mapEdits, maps); assert.ok(storedBody.mapEdits.every(edit => !Object.hasOwn(edit, 'groupId'))); groups++;
    const countBefore = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    const unsupported = source.map.waterGroups.find(group => !eligible(group)); assert.ok(unsupported);
    for (const bad of [
      { ...maps[0], groupId: ids[0] }, { ...maps[0], groupIds: [] }, { ...maps[0], groupIds: [ids[0], ids[0]] },
      { ...maps[0], groupIds: [ids[0], 'missing'] }, { ...maps[0], groupIds: [ids[0], unsupported.id] },
      { ...maps[0], groupIds: ids, showOnMinimap: null }, { ...maps[0], groupIds: ids, name: 'bad\ud800' },
    ]) assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [bad] }, { 'If-Match': '"' + next + '"' })).status, 422);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, countBefore);
    assert.equal((await call('other', path + '/save', body, { 'If-Match': '"' + next + '"' })).status, 404);
    assert.equal((await call(actor, path + '/save', body, { 'If-Match': '"' + rev + '"' })).status, 412);
    assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [] }, headers)).status, 409); groups++;
    app = make(); assert.deepEqual(await ok(actor, path + '?revision=' + next), merged);
    assert.deepEqual(await ok(actor, path + '?revision=' + rev), before);
    const map = compileMapSource({ schemaVersion: 1, map: actual.map, componentDefinitions: actual.componentDefinitions });
    const { pixels } = renderMinimapPixels(map.minimapGeography, map.roadMask, map.width, map.height, 250, 167, 1);
    assert.equal((await ok(actor, path + '/minimap?revision=' + next)).pixelsSha256, sha(pixels));
    storedBody.mapEdits[0].groupIds[0] = 'missing-history-group';
    sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(storedBody), actorId, key);
    try {
      assert.equal((await call(actor, path + '?revision=' + next)).status, 422);
      await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[actor], id, next));
    } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, actorId, key); }
    assert.deepEqual(await ok(actor, path + '?revision=' + next), merged);
    const renamed = await ok(actor, path + '/save', { metadata: before.metadata, resourceEdits: [], mapEdits: [{ op: 'water-rename', groupId: ids[0], name: '後續名稱' }] }, { 'If-Match': '"' + next + '"' });
    assert.equal(renamed.draftRevision, String(BigInt(next) + 1n));
    assert.equal((await ok(actor, path + '?revision=' + renamed.draftRevision)).waterGroups.find(group => group.groupId === ids[0]).name, '後續名稱');
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  }
  // Both profiles split captured members without accepting a client-created ID.
  for (const [actor, id, rev, actorId] of [['author', gameId, '18', author], ['admin', ar.gameId, '6', admin]]) {
    const path = `/api/games/${id}/draft`, key = 'owned-water-split-' + actor;
    const before = await ok(actor, path + '?revision=' + rev);
    const source = (await app.privateDrafts.captureForCompile(hashes[actor], id, rev)).game;
    assert.deepEqual(before.waterGroupMembers, source.map.waterGroups.map(group => ({ groupId: group.id, memberIds: group.memberIds, baseCells: group.baseCells })));
    const target = source.map.waterGroups.find(group => group.id.startsWith(id + '#water-') && group.memberIds.length >= 3); assert.ok(target);
    const command = { op: 'water-split', sourceGroupId: target.id, memberIds: [target.memberIds[0]], baseCells: [], name: '  拆出𠀀  ' };
    const body = { metadata: before.metadata, resourceEdits: [], mapEdits: [command] }, headers = { 'If-Match': '"' + rev + '"', 'Idempotency-Key': key };
    const oldPreview = await ok(actor, path + '/minimap?revision=' + rev);
    const saved = await ok(actor, path + '/save', body, headers), next = String(BigInt(rev) + 1n);
    assert.equal(saved.draftRevision, next);
    assert.deepEqual(await ok(actor, path + '/save', body, headers), saved);
    assert.deepEqual(await ok(actor, path + '/operations/' + key), { state: 'committed', result: saved });
    const split = await ok(actor, path + '?revision=' + next);
    const actual = (await app.privateDrafts.captureForCompile(hashes[actor], id, next)).game;
    const newId = id + '#water-' + sha(JSON.stringify(['dragon-water-group-1', id, actorId, key, 0]));
    const extracted = actual.map.waterGroups.find(group => group.id === newId), remaining = actual.map.waterGroups.find(group => group.id === target.id);
    assert.ok(extracted); assert.equal(extracted.name, '拆出𠀀'); assert.equal(extracted.showOnMinimap, target.showOnMinimap);
    assert.deepEqual(extracted.memberIds, command.memberIds); assert.deepEqual(extracted.baseCells, []);
    assert.deepEqual(remaining, { ...target, memberIds: target.memberIds.slice(1) });
    const expected = structuredClone(source); expected.map.waterGroups = source.map.waterGroups.map(group => group.id === target.id ? structuredClone(remaining) : group); expected.map.waterGroups.push(structuredClone(extracted));
    assert.deepEqual(actual, expected); assert.equal(split.waterGroups.length, before.waterGroups.length + 1);
    assert.deepEqual(split.waterGroupMembers, actual.map.waterGroups.map(group => ({ groupId: group.id, memberIds: group.memberIds, baseCells: group.baseCells })));
    for (const field of ['chapters','strongholds','map','generalDefinitions','chapterPeople']) assert.deepEqual(split[field], before[field]);
    const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', actorId, key).toArray()[0].request_json;
    let storedBody; try { storedBody = JSON.parse(stored); } catch (cause) { throw new Error('invalid owned split request', { cause }); }
    assert.deepEqual(storedBody.mapEdits, [command]); assert.equal(Object.hasOwn(storedBody.mapEdits[0], 'groupId'), false); groups++;
    const countBefore = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    // Start each refusal from a still-valid subset, not the already removed
    // member: otherwise a bad name could pass via an unrelated membership error.
    const validSubset = { ...command, memberIds: [remaining.memberIds[0]] };
    assert.doesNotThrow(() => splitWaterGroup(actual, target.id, validSubset.memberIds, [], id + '#water-' + 'e'.repeat(64), '有效子集'));
    for (const bad of [
      { ...validSubset, groupId: newId }, { ...validSubset, sourceGroupId: 'missing' },
      { ...validSubset, memberIds: [] }, { ...validSubset, memberIds: ['missing'] },
      { ...validSubset, memberIds: [remaining.memberIds[0], remaining.memberIds[0]] },
      { ...validSubset, memberIds: remaining.memberIds, baseCells: remaining.baseCells },
      { ...validSubset, memberIds: null }, { ...validSubset, baseCells: [-1] },
      { ...validSubset, baseCells: [0.5] }, { ...validSubset, name: 'bad\ud800' },
      { ...validSubset, showOnMinimap: true },
    ]) assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [bad] }, { 'If-Match': '"' + next + '"' })).status, 422);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, countBefore);
    assert.equal((await call('other', path + '/save', body, { 'If-Match': '"' + next + '"' })).status, 404);
    assert.equal((await call('other', path + '?revision=' + next)).status, 404);
    assert.equal((await call(actor, path + '/save', body, { 'If-Match': '"' + rev + '"' })).status, 412);
    assert.equal((await call(actor, path + '/save', { ...body, mapEdits: [] }, headers)).status, 409); groups++;
    app = make(); assert.deepEqual(await ok(actor, path + '?revision=' + next), split);
    assert.deepEqual(await ok(actor, path + '?revision=' + rev), before);
    assert.deepEqual(await ok(actor, path + '/minimap?revision=' + rev), oldPreview);
    assert.equal((await ok(actor, path + '/minimap?revision=' + next)).pixelsSha256, oldPreview.pixelsSha256);
    storedBody.mapEdits[0].memberIds[0] = 'missing-history-member';
    sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(storedBody), actorId, key);
    try {
      assert.equal((await call(actor, path + '?revision=' + next)).status, 422);
      await assert.rejects(() => app.privateDrafts.captureForCompile(hashes[actor], id, next));
    } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, actorId, key); }
    assert.deepEqual(await ok(actor, path + '?revision=' + next), split);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  }
  }
  // Global neutral city names are separate from chapter/runtime city records.
  {
    const path = `/api/games/${gameId}/draft`, key = 'owned-city-definition-name-01';
    const oldRevision = cityNamesOnly ? '2' : '19', namedRevision = String(BigInt(oldRevision) + 1n), nextRevision = String(BigInt(oldRevision) + 2n), fullRevision = cityNamesOnly ? '1' : '7';
    const currentHeaders = { 'If-Match': '"' + namedRevision + '"' };
    const before = await ok('author', path + '?revision=' + oldRevision);
    assert.equal(before.cityDefinitions.length, 192);
    assert.ok(before.cityDefinitions.every(row => row.name === null));
    assert.equal((await ok('admin', `/api/games/${ar.gameId}/draft?revision=${fullRevision}`)).cityDefinitions, null);
    const source = (await app.privateDrafts.captureForCompile(hashes.author, gameId, oldRevision)).game;
    const cityId = before.cityDefinitions[0].cityId, sibling = before.cityDefinitions[1].cityId;
    const command = { op: 'rename', cityId, name: '  e\u0301𠀀城  ' };
    const body = { metadata: before.metadata, resourceEdits: [], cityEdits: [command] };
    const headers = { 'If-Match': '"' + oldRevision + '"', 'Idempotency-Key': key };
    const legacyKey = 'owned-template-save-001';
    const legacy = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, legacyKey).toArray()[0].request_json;
    assert.ok(!legacy.includes('cityEdits'));
    const saved = await ok('author', path + '/save', body, headers); assert.equal(saved.draftRevision, namedRevision);
    assert.deepEqual(await ok('author', path + '/save', body, headers), saved);
    assert.deepEqual(await ok('author', path + '/operations/' + key), { state: 'committed', result: saved });
    const named = await ok('author', path + '?revision=' + namedRevision);
    assert.deepEqual(named.cityDefinitions[0], { cityId, name: 'é𠀀城' });
    assert.deepEqual(named.cityDefinitions.slice(1), before.cityDefinitions.slice(1));
    for (const field of ['chapters','strongholds','map','generalDefinitions','chapterPeople','waterGroups','waterGroupMembers']) assert.deepEqual(named[field], before[field]);
    const expected = structuredClone(source); expected.cities[cityId].name = 'é𠀀城';
    assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.author, gameId, namedRevision)).game, expected);
    const stored = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, key).toArray()[0].request_json;
    let capturedBody; try { capturedBody = JSON.parse(stored); } catch (cause) { throw new Error('invalid owned city request', { cause }); }
    assert.deepEqual(capturedBody.cityEdits, [command]); groups++;
    const count = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    // Chapter-city API remains strict: no unknown commands/fields or implicit values.
    for (const chapterCityEdits of [null, [{ op: 'move', chapterId: source.chapterOrder[0], cityId }], [{ op: 'set', chapterId: source.chapterOrder[0], cityId }]]) {
      const denied = await call('author', path + '/save', { ...body, chapterCityEdits }, currentHeaders);
      assert.equal(denied.status, 422);
    }
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count); groups++;
    for (const cityEdits of [null, [null], [false], [[]], Array(17).fill(command), [{ ...command, op: 'move' }], [{ ...command, x: 0 }], [{ ...command, cityId: 'missing' }], [{ ...command, name: '' }], [{ ...command, name: 'bad\u0001' }], [{ ...command, name: 'bad\ud800' }]]) {
      assert.equal((await call('author', path + '/save', { ...body, cityEdits }, currentHeaders)).status, 422);
    }
    assert.equal((await call('author', path + '/save', { ...body, cityEdits: [{ ...command, name: '𠀀'.repeat(5000) }] }, currentHeaders)).status, 413);
    for (const role of ['other', 'admin']) assert.equal((await call(role, path + '/save', body, currentHeaders)).status, 404);
    const full = await call('admin', `/api/games/${ar.gameId}/draft/save`, { metadata: { name: '完整副本', introduction: '' }, resourceEdits: [], cityEdits: [{ ...command, cityId: (await app.privateDrafts.captureForCompile(hashes.admin, ar.gameId, fullRevision)).game.map.placements[0].cityId }] }, { 'If-Match': '"' + fullRevision + '"' });
    assert.equal(full.status, 422); assert.equal(full.data.error, 'DRAFT_CITY_PROFILE');
    assert.equal((await call('author', path + '/save', body, { 'If-Match': '"' + oldRevision + '"' })).status, 412);
    assert.equal((await call('author', path + '/save', { ...body, cityEdits: [] }, headers)).status, 409);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, count); groups++;
    assert.equal((await ok('author', path + '/save', body, currentHeaders)).draftRevision, namedRevision);
    const second = await ok('author', path + '/save', { ...body, cityEdits: [{ op: 'rename', cityId: sibling, name: 'é𠀀城' }] }, currentHeaders);
    assert.equal(second.draftRevision, nextRevision); expected.cities[sibling].name = 'é𠀀城';
    app = make(); assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.author, gameId, nextRevision)).game, expected);
    assert.deepEqual(await ok('author', path + '?revision=' + oldRevision), before);
    assert.deepEqual(await ok('author', path + '?revision=' + namedRevision), named);
    assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, legacyKey).toArray()[0].request_json, legacy); groups++;
    // A later legitimate no-op reasserts the name, masking name-only drift.
    // Unknown identity must instead fail at that earlier command boundary.
    capturedBody.cityEdits[0].cityId = 'missing-history-city';
    sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(capturedBody), author, key);
    try {
      assert.equal((await call('author', path + '?revision=' + namedRevision)).status, 422);
      await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.author, gameId, namedRevision));
      const objects = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
      assert.equal((await call('author', path + '/save', { metadata: before.metadata, resourceEdits: [] }, { 'If-Match': '"' + nextRevision + '"' })).status, 422);
      assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objects);
    } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', stored, author, key); }
    assert.deepEqual(await ok('author', path + '?revision=' + namedRevision), named);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;

    const cityChapter = source.chapterOrder[0];
    let rev = nextRevision;
    const request = (chapterCityEdits) => ({ metadata: before.metadata, resourceEdits: [], chapterCityEdits });
    const set = { op: 'set', chapterId: cityChapter, cityId, values: { factionId: null, overrides: {} } };
    const configKey = 'owned-chapter-city-save-001';
    const configHeaders = { 'If-Match': '"' + rev + '"', 'Idempotency-Key': configKey };
    const prior = await ok('author', path + '?revision=' + rev);
    assert.ok(prior.chapterCities.every(row => row.cities.length === 0));
    const configured = await ok('author', path + '/save', request([set]), configHeaders);
    assert.equal(configured.draftRevision, String(BigInt(rev) + 1n)); rev = configured.draftRevision;
    assert.deepEqual(await ok('author', path + '/save', request([set]), configHeaders), configured);
    assert.deepEqual(await ok('author', path + '/operations/' + configKey), { state: 'committed', result: configured });
    const configDTO = await ok('author', path + '?revision=' + rev);
    assert.deepEqual(configDTO.chapterCities.find(row => row.chapterId === cityChapter).cities, [{ cityId, factionId: null, overrides: {}, values: { name: 'é𠀀城' }, inheritedFields: ['name'], overriddenFields: [] }]);
    for (const field of ['chapters', 'map', 'cityDefinitions', 'generalDefinitions', 'chapterPeople']) assert.deepEqual(configDTO[field], prior[field]);
    assert.deepEqual(await ok('author', path + '?revision=' + nextRevision), prior);
    const cityRefs = configDTO.strongholds.find(row => row.cityId === cityId);
    assert.deepEqual(cityRefs.chapters, [cityChapter]);
    assert.deepEqual(cityRefs.references, [{ chapterId: cityChapter, code: 'CITY_AUTHORING_REF', detail: '本章中立據點配置' }]);
    assert.deepEqual(configDTO.strongholds.filter(row => row.cityId !== cityId), prior.strongholds.filter(row => row.cityId !== cityId));
    assert.ok(!legacy.includes('chapterCityEdits'));
    assert.equal(sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, legacyKey).toArray()[0].request_json, legacy); groups++;

    const snapshot = (await app.privateDrafts.captureForCompile(hashes.author, gameId, rev)).game;
    const configuredJSON = sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', author, configKey).toArray()[0].request_json;
    const objectCount = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    const h = { 'If-Match': '"' + rev + '"' };
    for (const edits of [Array(17).fill(set), [{ ...set, cityId: 'missing' }], [{ ...set, chapterId: 'missing' }], [{ ...set, values: { factionId: 'unknown', overrides: {} } }], [{ ...set, values: { factionId: null, overrides: { name: '不允許' } } }], [{ op: 'remove', chapterId: cityChapter, cityId: sibling }]]) assert.equal((await call('author', path + '/save', request(edits), h)).status, 422);
    assert.equal((await call('author', path + '/save', request(Array(16).fill({ ...set, cityId: 'x'.repeat(2000) })), h)).status, 413);
    for (const role of ['other', 'admin']) assert.equal((await call(role, path + '/save', request([set]), h)).status, 404);
    assert.equal((await call('author', path + '/save', request([set]), { 'If-Match': '"' + nextRevision + '"' })).status, 412);
    assert.equal((await call('author', path + '/save', request([]), configHeaders)).status, 409);
    const fullCity = await call('admin', `/api/games/${ar.gameId}/draft/save`, { metadata: { name: '完整副本', introduction: '' }, resourceEdits: [], chapterCityEdits: [set] }, { 'If-Match': '"' + fullRevision + '"' });
    assert.equal(fullCity.status, 422); assert.equal(fullCity.data.error, 'DRAFT_CHAPTER_CITY_PROFILE');
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount); groups++;

    const renameBody = { metadata: before.metadata, resourceEdits: [], cityEdits: [{ op: 'rename', cityId, name: '全域新名' }] };
    const required = await call('author', path + '/save', renameBody, h);
    assert.equal(required.status, 409); assert.equal(required.data.error, 'DRAFT_CITY_IMPACT_REQUIRED');
    const wrong = await call('author', path + '/save', { ...renameBody, cityEdits: [{ ...renameBody.cityEdits[0], confirmedImpacts: [] }] }, h);
    assert.equal(wrong.status, 409); assert.equal(wrong.data.error, 'DRAFT_CITY_IMPACT_CHANGED');
    for (const confirmedImpacts of [null, [{ chapterId: cityChapter, fields: [] }], [{ chapterId: cityChapter, fields: ['troops'] }], [{ chapterId: cityChapter, fields: ['name'] }, { chapterId: cityChapter, fields: ['name'] }]]) {
      const invalid = await call('author', path + '/save', { ...renameBody, cityEdits: [{ ...renameBody.cityEdits[0], confirmedImpacts }] }, h);
      assert.equal(invalid.status, 422);
    }
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, objectCount);
    const confirmedImpacts = [{ chapterId: cityChapter, fields: ['name'] }];
    const renamed = await ok('author', path + '/save', { ...renameBody, cityEdits: [{ ...renameBody.cityEdits[0], confirmedImpacts }] }, h);
    rev = renamed.draftRevision;
    const renamedDTO = await ok('author', path + '?revision=' + rev);
    assert.equal(renamedDTO.chapterCities.find(row => row.chapterId === cityChapter).cities[0].values.name, '全域新名');
    assert.deepEqual(renamedDTO.chapters, configDTO.chapters);
    app = make();
    assert.deepEqual(await ok('author', path + '?revision=' + configured.draftRevision), configDTO);
    assert.deepEqual((await app.privateDrafts.captureForCompile(hashes.author, gameId, configured.draftRevision)).game, snapshot); groups++;

    const damaged = JSON.parse(configuredJSON); damaged.chapterCityEdits[0].cityId = 'unknown-history-city';
    sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', JSON.stringify(damaged), author, configKey);
    try {
      assert.equal((await call('author', path + '?revision=' + rev)).status, 422);
      await assert.rejects(() => app.privateDrafts.captureForCompile(hashes.author, gameId, rev));
      assert.equal((await call('author', path + '/save', request([]), { 'If-Match': '"' + rev + '"' })).status, 422);
    } finally { sql.exec('UPDATE draft_requests SET request_json=? WHERE actor=? AND op_key=?', configuredJSON, author, configKey); }
    const removed = await ok('author', path + '/save', request([{ op: 'remove', chapterId: cityChapter, cityId }]), { 'If-Match': '"' + rev + '"' });
    const removedDTO = await ok('author', path + '?revision=' + removed.draftRevision);
    assert.ok(removedDTO.chapterCities.every(row => row.cities.length === 0));
    assert.deepEqual(removedDTO.cityDefinitions, renamedDTO.cityDefinitions);
    assert.deepEqual(removedDTO.map, renamedDTO.map);
    assert.deepEqual(removedDTO.strongholds, prior.strongholds);
    assert.deepEqual(await ok('author', path + '?revision=' + rev), renamedDTO);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;

    // Persisted copy semantics: chapter operations precede city operations in
    // one request. A copy captures the configured parent before its removal.
    const reset = await ok('author', path + '/save', request([set]), { 'If-Match': '"' + removed.draftRevision + '"' });
    const resetDTO = await ok('author', path + '?revision=' + reset.draftRevision);
    const copyBody = { ...request([{ op: 'remove', chapterId: cityChapter, cityId }]), chapterEdits: [{ op: 'copy', chapterId: cityChapter }] };
    const copyHeaders = { 'If-Match': '"' + reset.draftRevision + '"', 'Idempotency-Key': 'owned-city-copy-remove-001' };
    const copied = await ok('author', path + '/save', copyBody, copyHeaders);
    assert.deepEqual(await ok('author', path + '/save', copyBody, copyHeaders), copied);
    const copiedDTO = await ok('author', path + '?revision=' + copied.draftRevision);
    const oldIds = new Set(resetDTO.chapters.map(row => row.chapterId));
    const added = copiedDTO.chapters.filter(row => !oldIds.has(row.chapterId)); assert.equal(added.length, 1);
    const childId = added[0].chapterId;
    const parentRow = resetDTO.chapterCities.find(row => row.chapterId === cityChapter);
    assert.deepEqual(copiedDTO.chapterCities.find(row => row.chapterId === childId), { ...parentRow, chapterId: childId });
    assert.deepEqual(copiedDTO.chapterCities.find(row => row.chapterId === cityChapter).cities, []);
    assert.deepEqual(copiedDTO.strongholds.find(row => row.cityId === cityId).chapters, [childId]);
    assert.deepEqual(copiedDTO.map, resetDTO.map); assert.deepEqual(copiedDTO.cityDefinitions, resetDTO.cityDefinitions);
    assert.deepEqual(await ok('author', path + '?revision=' + reset.draftRevision), resetDTO); groups++;

    const nextName = { op: 'rename', cityId, name: '副本共用名', confirmedImpacts: [{ chapterId: cityChapter, fields: ['name'] }] };
    const renameCopy = { metadata: before.metadata, resourceEdits: [], cityEdits: [nextName] };
    const copyRevisionHeaders = { 'If-Match': '"' + copied.draftRevision + '"' };
    const beforeRefusal = sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
    const staleImpact = await call('author', path + '/save', renameCopy, copyRevisionHeaders);
    assert.equal(staleImpact.status, 409); assert.equal(staleImpact.data.error, 'DRAFT_CITY_IMPACT_CHANGED');
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n, beforeRefusal);
    nextName.confirmedImpacts = [{ chapterId: childId, fields: ['name'] }];
    const final = await ok('author', path + '/save', { ...renameCopy, chapterEdits: [{ op: 'delete', chapterId: cityChapter }] }, copyRevisionHeaders);
    const finalDTO = await ok('author', path + '?revision=' + final.draftRevision);
    assert.equal(finalDTO.chapters.some(row => row.chapterId === cityChapter), false);
    assert.equal(finalDTO.chapterCities.find(row => row.chapterId === childId).cities[0].values.name, '副本共用名');
    assert.deepEqual(finalDTO.strongholds.find(row => row.cityId === cityId).chapters, [childId]);
    assert.deepEqual(finalDTO.map, resetDTO.map);
    const finalSource = (await app.privateDrafts.captureForCompile(hashes.author, gameId, final.draftRevision)).game;
    assert.deepEqual(finalSource.chapters[childId].state, snapshot.chapters[cityChapter].state);
    assert.deepEqual(finalSource.chapters[childId].cities, { [cityId]: { factionId: null, overrides: {} } });
    app = make();
    assert.deepEqual(await ok('author', path + '?revision=' + final.draftRevision), finalDTO);
    assert.deepEqual(await ok('author', path + '?revision=' + copied.draftRevision), copiedDTO);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM trial_sessions').toArray()[0].n, 0);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_releases').toArray()[0].n, 0); groups++;
  }
  }
  }
  let scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral definitions/people, water and city names; original-key/legacy/restart/CAS, corruption/epoch refusal; administrator full copy; seeded authentication, no browser/cloud or playable initialization';
  if (cityNamesOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral creation/chapter copy, city-name and chapter-city save/read/old-body/restart/CAS/history refusals, rename impact confirmation; administrator full-copy denial; seeded authentication, no browser/cloud or playable initialization; earlier people/water lanes skipped';
  if (materialsOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral and full-copy material capture/rename/remove, translation/reorder/placement, DTO, old-body/key/CAS/permissions/restart/history refusals; seeded authentication, no browser/runtime/publication';
  if (placementOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral and full-copy placement with captured author material, server identities, water groups, DTO, old-body/key/CAS/permissions/service reconstruction/history refusals; earlier translation/reorder/rename/delete lanes skipped; seeded authentication, no browser/runtime/publication';
  if (baseFillOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral/full-copy explicit base fill, exact whole source, old revisions/body/key/CAS/permission/history/service reconstruction; seeded authentication, no UI/runtime/publication';
  if (mapWindowOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; neutral/full-copy exact tile windows, full-footprint ordered decoration selection including overlapping instances, old revisions, input budgets, owner isolation and mid-read revocation; four-season pinned atlas pixels and integrity/authority refusals; seeded authentication, no Canvas/runtime/publication grant';
  if (roleSlotsOnly) scope = 'actual common Request, SQLite/FileBucket and 41 fixed inputs; full-copy reserved-role refusals, failed original-key records, zero object writes, atomic batch refusal, owner isolation, normal advisor clearing and corrupt-history refusal; seeded authentication, no browser or initialization grant';
  if (privateLibraryOnly) scope = 'actual common Request, SQLite/FileBucket, 41 source inputs and 400 staged library roles; explicit current library binding, JSON/PNG/FLAC bytes, exact saved1/current2, fresh GETs, source-header mismatch, role denial, restart and mid-read revocation; seeded authentication, no browser/decoder/runtime grant';
  if (reservationOnly) scope = 'actual common Request and SQLite, 41 registered fixed inputs; author/admin legacy-name reservation rejection with unchanged SQL, corrupt legacy authority refusal, cross-author same name, original-key replay/conflict, pending cancellation, route role denials, concurrent same-process normalized-name reservations, canceled-key non-resurrection and losing-key retry after release; seeded authentication and explicit legacy SQL fixtures, zero object I/O after registration; no copy execution/publication/browser/HTTPS';
  process.stdout.write(JSON.stringify({ groups, ...(reservationOnly ? {reservationOnly,reservationIO} : {}), cityNamesOnly, materialsOnly, placementOnly, baseFillOnly, mapWindowOnly, roleSlotsOnly, privateLibraryOnly, scope }) + '\n');
  }
} finally { storage.close(); rmSync(scratch, { recursive: true, force: true }); }
