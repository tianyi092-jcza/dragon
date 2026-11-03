// Actual common application Request dispatch and compiler/pack stores on owned
// SQLite/FileBucket. Seeded test sessions and pinned full-copy bootstrap are NOT
// login, author blank-creation, network HTTP/TLS, R2 or browser certificates.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildRuntimeIndex } from '../vps/runtime-index.mjs';
import { parseJSON, validateIndex } from '../reader/runtimecontract.js';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { installedSourcePolicy } = await import('../server/sourcecatalogpolicy.js');
const { encodeSourceChunks, canonicalSourceTokens } = await import('../web/src/content/authoring/sourcejson.js');
const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
const { mac } = await import('../server/security.js');
const { assertDeletionDefinitions } = await import('../server/deletiondefinitions.js');
const { GameDeletionJobFreeze } = await import('../server/deletionjobfreeze.js');
const { GameDeletionDraftFreeze } = await import('../server/deletiondraftfreeze.js');
const scratch = mkdtempSync(join(tmpdir(), 'publish-operation-root-')), storage = openStorage(':memory:');
const ADMIN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OWNER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const origin = 'https://owned-editor.invalid', secret = 'c'.repeat(64), token = '1'.repeat(64), adminToken = '2'.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = sha(token), adminHash = sha(adminToken);
let staging = null;
let app, gameId, groups = 0, reads = 0, puts = 0, pauseReads = null;
try {
  if (process.argv.includes('--stage-runtime')) staging = (await import('./fixtures/publish-runtime-stage.mjs')).makePublishRuntimeStage({ root: join(scratch, 'static-package') });
  const bucket = new FileBucket({ root: join(scratch, 'objects') }), get = bucket.get.bind(bucket), put = bucket.put.bind(bucket);
  bucket.get = async key => { reads++; if (pauseReads) { await pauseReads(key); } return get(key); };
  bucket.put = async (...args) => { puts++; return put(...args); };
  const env = { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: 'Owned-Test-Password-Only-1!', EDITOR_BLOBS: bucket };
  const makeApp = () => new (createEditorApplication(class {}, { runtimeStager: staging?.stager }))({ storage }, env);
  app = makeApp();
  // Include the two lazy, actual schema owners before the complete frozen gate.
  const freezeOptions = { storage, principal: () => { throw new Error('unused owned freeze principal'); }, requestKey: secret };
  new GameDeletionJobFreeze(freezeOptions); new GameDeletionDraftFreeze(freezeOptions);
  const sql = storage.sql;
  for (const [id, account, role, tokenHash] of [[ADMIN, 'tianyi', 'admin', adminHash], [OWNER, 'owned_author', 'author', hash]]) {
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role, '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', tokenHash, id, 1, Date.now() + 3600000, Date.now() + 3600000);
  }
  assert.equal(assertDeletionDefinitions(sql).tablesVerified, 53);
  const csrf = await mac(`csrf:${token}`, secret);
  // Scenario labels are not product names. Keep explicit, legal wire names
  // (no truncation or normalization of arbitrary test input).
  const scenarioNames = { 'HTTP proof': 'HTTP證明', 'Race proof': '競態證明', 'Fault proof': '故障證明', 'Revoked during staging': '撤銷測試', 'R2 concurrent replay': '並行重放' };
  const call = async (label, key, extra = {}) => {
    const name = scenarioNames[label] ?? label;
    const started = performance.now();
    const response = await app.fetch(new Request(`${origin}/api/publish`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': key, ...extra }, body: JSON.stringify({ gameId, name }) }));
    const result = { status: response.status, value: await response.json() };
    if (staging) process.stdout.write(JSON.stringify({ request: key, status: result.status, milliseconds: Math.round(performance.now() - started) }) + '\n');
    return result;
  };
  const reserveName = async (name, key) => {
    const response = await app.fetch(new Request(`${origin}/api/games`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': key }, body: JSON.stringify({ name, introduction: '' }) }));
    return { status: response.status, value: await response.json() };
  };
  const adminCsrf = await mac(`csrf:${adminToken}`, secret);
  let managementSerial = 0, lastManagementRequest;
  const managementRequest = async (request, expectedStatus = 200) => {
    const response = await app.fetch(request.clone());
    const result = await response.json(); assert.equal(response.status, expectedStatus, JSON.stringify(result));
    return result;
  };
  const manage = async (action, expectedStatus = 200, asAuthor = false) => {
    const rowRevision = sql.exec('SELECT row_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].row_revision;
    const path = action === 'clear' ? 'restriction/clear' : 'listing';
    let value = {};
    if (action === 'list') value = { action, expectedRowRevision: rowRevision };
    else if (action !== 'clear') value = { action };
    lastManagementRequest = new Request(`${origin}/api/games/${gameId}/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${asAuthor ? token : adminToken}`, 'X-CSRF-Token': asAuthor ? csrf : adminCsrf, 'Idempotency-Key': `owned-history-management-${++managementSerial}`, 'If-Match': `"${rowRevision}"` }, body: JSON.stringify(value) });
    return managementRequest(lastManagementRequest, expectedStatus);
  };
  const announcementPage = async () => {
    const response = await app.fetch(new Request(`${origin}/api/announcements`));
    assert.equal(response.status, 200); return response.json();
  };
  const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
  const stageInstalled = async bytes => {
    const data = new Uint8Array(bytes), digest = sha(data), key = `installed/${policy.registryId}/${digest}`;
    if (!await bucket.get(key)) { await bucket.put(key, data, {}); }
    return { sha256: digest, byteLength: data.length };
  };
  const roles = [];
  for (const role of policy.roles) {
    const data = readFileSync(join('web', role.path)), chunks = [];
    for (let at = 0; at < data.length; at += 1048576) { chunks.push(await stageInstalled(data.subarray(at, at + 1048576))); }
    roles.push({ path: role.path, sha256: role.sha256, byteLength: role.byteLength, chunks });
  }
  const definitionDigest = app.installedSources.definition().definitionDigest;
  const installedRoot = await stageInstalled(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  await app.installedSources.install(adminHash, policy.registryId, installedRoot, 'owned-install-operation-01');
  const allocation = app.games.allocateGameId(hash); gameId = allocation.gameId;
  const { game } = await createPinnedCopyLoader()({ gameId, ownerId: OWNER });
  const stageGame = async bytes => {
    const put = await app.blobs.putImmutable(hash, { gameId, allocation, bytes: new Uint8Array(bytes) });
    return { sha256: put.sha256, byteLength: put.byteLength };
  };
  const all = createHash('sha256'), chunks = [];
  for (const bytes of encodeSourceChunks(game)) { all.update(bytes); chunks.push(await stageGame(bytes)); }
  const sourceDigest = all.digest('hex');
  const root = await stageGame(Buffer.concat(encodeSourceChunks({ schema: 'dragon-game-source-index-1', gameId, sourceDigest, sourceByteLength: chunks.reduce((n, part) => n + part.byteLength, 0), chunks, dependencies: [] })));
  const dependencies = createHash('sha256'); for (const part of canonicalSourceTokens({ chunks, dependencies: [] })) { dependencies.update(part, 'utf8'); }
  storage.transactionSync(() => {
    sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', gameId, root.sha256, root.byteLength, 'committed');
    sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', gameId, policy.registryId, definitionDigest, installedRoot.sha256, policy.profileRevision, root.sha256, root.byteLength, sourceDigest, sourceDigest, dependencies.digest('hex'));
  });
  const prepared = await app.games.prepareSnapshot(hash, { gameId, draftRevision: '1', metadata: { ...game.metadata }, source: root, allocation });
  app.games.transaction(hash, { key: 'owned-bootstrap-create-01', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, prepared));
  // Publishing and listing are separate: an administrator cannot pre-list a
  // draft and thereby make a later first author publication automatically public.
  const listingState = () => ['content_games', 'content_names', 'content_audits', 'content_announcements', 'content_registry', 'content_releases', 'published_games', 'content_distribution_outbox', 'content_operations', 'content_reservations'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
  const unpublishedState = listingState();
  assert.equal((await manage('list', 403, true)).error, 'ADMIN_REQUIRED');
  const unpublished = await manage('list', 409);
  assert.equal(unpublished.error, 'GAME_NOT_PUBLISHED');
  assert.deepEqual(listingState(), unpublishedState, 'rejected listing rolls back flag, revision, audit and announcement state');
  groups++;
  // Observe actual candidate + prepared bytes BEFORE the formal transaction.
  // No fake R2 success: this only checks the pre/post SQL byte boundary.
  let candidateIdentity, stagedRuntime;
  const prepareRelease = app.releases.prepare, preparePack = app.playPacks.prepare;
  app.releases.prepare = function (...args) {
    const result = prepareRelease.apply(this, args); candidateIdentity = result.identity; return result;
  };
  app.playPacks.prepare = async function (...args) {
    const ticket = await preparePack.apply(this, args), snapshot = this.snapshotPrepared(args[0], ticket);
    assert.equal(sql.exec('SELECT * FROM content_releases').toArray().length, 0);
    assert.equal(sql.exec('SELECT * FROM published_packs').toArray().length, 0);
    assert.equal(sql.exec('SELECT next_ordinal FROM content_games WHERE game_id=?', gameId).toArray()[0].next_ordinal, '0');
    const identity = candidateIdentity;
    stagedRuntime = buildRuntimeIndex({ gameId, revision: identity.draftRevision, sourceDigest: identity.sourceDigest, ordinal: identity.ordinal, chapters: JSON.parse(snapshot.pack.manifest_json).chapters },
      { game_id: gameId, release_id: identity.releaseId, ordinal: identity.ordinal, draft_revision: identity.draftRevision, source_digest: identity.sourceDigest }, snapshot.pack, snapshot.chapters, snapshot.assets);
    return ticket;
  };
  if (staging) staging.interceptOnce('put', async () => {
    assert.equal(sql.exec('SELECT * FROM content_releases').toArray().length, 0);
    assert.equal(sql.exec('SELECT * FROM published_packs').toArray().length, 0);
    assert.equal(sql.exec("SELECT * FROM content_reservations WHERE method='publish'").toArray().length, 0);
  });
  let first;
  try { first = await call('HTTP proof', 'owned-publish-request-01'); }
  finally { app.releases.prepare = prepareRelease; app.playPacks.prepare = preparePack; }
  assert.equal(first.status, 200, JSON.stringify(first.value)); assert.equal(first.value.ordinal, '1.0');
  const formal = sql.exec('SELECT draft_name,draft_introduction,formal_name,formal_introduction FROM content_games WHERE game_id=?', gameId).toArray()[0];
  assert.equal(formal.formal_name, first.value.name);
  assert.equal(formal.formal_introduction, formal.draft_introduction);
  assert.deepEqual(sql.exec('SELECT name FROM content_names WHERE game_id=? ORDER BY name', gameId).toArray().map(row => row.name), [...new Set([formal.draft_name, first.value.name])].sort());
  assert.equal(app.playPacks.pack(gameId).manifest.chapters.length, 20);
  assert.equal(sql.exec("SELECT * FROM content_operations WHERE method='publish'").toArray().length, 1); groups++;
  const nameState = () => ['content_games', 'content_names', 'content_used_ids', 'content_operations', 'content_reservations', 'copy_requests', 'copy_origins', 'copy_objects'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
  const occupiedState = nameState(), occupiedReads = reads;
  for (const [index, name] of [...new Set([formal.draft_name, formal.formal_name])].entries()) {
    assert.deepEqual(await reserveName(name, `owned-formal-name-conflict-${index}`), { status: 409, value: { error: 'GAME_NAME_OCCUPIED' } });
    assert.deepEqual(nameState(), occupiedState, 'actual published and draft names both reject new creation reservations');
  }
  assert.equal(reads, occupiedReads, 'name conflicts do not load or copy source objects'); groups++;
  // Exercise the transport builder with the ACTUAL stored compiled chapters,
  // not c1/c2 DTOs. Source IDs and raw chapter JSON must remain byte-identical.
  const releaseRow = sql.exec('SELECT * FROM content_releases WHERE game_id=?', gameId).toArray()[0];
  const packRow = sql.exec('SELECT * FROM published_packs WHERE game_id=?', gameId).toArray()[0];
  const chapterRows = sql.exec('SELECT * FROM published_pack_chapters WHERE game_id=? ORDER BY chapter_id', gameId).toArray();
  const assetRows = sql.exec('SELECT * FROM published_pack_assets WHERE game_id=? ORDER BY asset_id', gameId).toArray();
  const built = buildRuntimeIndex(first.value, releaseRow, packRow, chapterRows, assetRows);
  assert.equal(releaseRow.release_id, candidateIdentity.releaseId);
  assert.deepEqual(built.reference, stagedRuntime.reference);
  assert.deepEqual(new Map(built.files.map(file => [file.key, file])), new Map(stagedRuntime.files.map(file => [file.key, file])));
  assert.deepEqual(built.dependencies, stagedRuntime.dependencies); groups++;
  if (staging) {
    for (const file of built.files) assert.deepEqual(staging.objects.get(staging.prefix + file.key)?.bytes, file.bytes);
    assert.equal(staging.stats().puts, built.files.length);
    assert.equal(staging.stats().staticChecks, 1);
    assert.ok(staging.stats().staticAssets > 1000);
    assert.ok(staging.stats().staticReads >= staging.stats().staticAssets + 2);
    groups++;
  }
  const runtime = validateIndex(parseJSON(built.files.find(file => file.key === built.reference.key).bytes));
  assert.deepEqual(runtime.chapters, game.chapterOrder);
  for (const row of chapterRows) {
    assert.ok(row.chapter_id.startsWith(`${gameId}#`));
    const ref = runtime.resources[`chapter:${row.chapter_id}`];
    assert.ok(ref.key.endsWith(`/chapters/${row.chapter_id}.json`));
    assert.deepEqual(built.files.find(file => file.key === ref.key).bytes, Buffer.from(row.state_json));
  }
  groups++;
  assert.deepEqual((await announcementPage()).announcements, [], 'hidden first release is not announced');
  // Torn/foreign committed identities must not list, even though the formal
  // pointer is non-null. Faults affect only this owned SQLite fixture.
  const originalPinRow = sql.exec('SELECT * FROM published_games WHERE game_id=?', gameId).toArray()[0];
  const originalPin = JSON.parse(originalPinRow.pin_json);
  const faults = [
    ['content_games', 'current_release_id', 'invalid'],
    ['content_games', 'current_release_id', 'cccccccc-cccc-4ccc-cccc-cccccccccccc'],
    ['content_releases', 'game_id', 'cccccccc-cccc-4ccc-cccc-cccccccccccc'],
    ['content_releases', 'ordinal', '1.01'],
    ['content_releases', 'draft_revision', '2'],
    ['content_releases', 'source_digest', 'f'.repeat(64)],
    ['published_games', 'owner_id', ADMIN],
    ['published_games', 'pin_json', '{', 500, 'PUBLISH_CORRUPT'],
    ...Object.entries({ ordinal: '1.8', revision: '2', sourceDigest: 'f'.repeat(64), chapters: [] }).map(([field, value]) => ['published_games', 'pin_json', JSON.stringify({ ...originalPin, [field]: value })]),
    ['published_games', 'pin_json', JSON.stringify({ ...originalPin, chapters: [originalPin.chapters[0], originalPin.chapters[0]] })],
    ['published_packs', 'revision', '2'],
    ['published_packs', 'source_digest', 'f'.repeat(64)],
  ];
  for (const [table, column, value, status = 503, code = 'PUBLISH_REFERENCE_CORRUPT'] of faults) {
    const prior = sql.exec(`SELECT ${column} AS value FROM ${table}`).toArray()[0].value;
    sql.exec(`UPDATE ${table} SET ${column}=?`, value);
    const before = listingState();
    try {
      assert.equal((await manage('list', status)).error, code, table + '.' + column);
      assert.deepEqual(listingState(), before, 'failed listing preserves the whole mutation transaction');
    } finally { sql.exec(`UPDATE ${table} SET ${column}=?`, prior); }
  }
  for (const [table, row] of [['published_games', originalPinRow], ['published_packs', packRow]]) {
    sql.exec(`DELETE FROM ${table} WHERE game_id=?`, gameId);
    const before = listingState();
    try {
      assert.equal((await manage('list', 503)).error, 'PUBLISH_REFERENCE_CORRUPT');
      assert.deepEqual(listingState(), before);
    } finally { sql.exec(`INSERT INTO ${table} VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row)); }
  }
  assert.equal(faults.length, 15); groups++;
  const listingBeforeFault = listingState();
  sql.exec("CREATE TEMP TRIGGER owned_listing_receipt_fault BEFORE INSERT ON content_operations WHEN NEW.method='admin-list' BEGIN SELECT RAISE(ABORT,'owned listing receipt fault'); END");
  try { await manage('list', 500); }
  finally { sql.exec('DROP TRIGGER owned_listing_receipt_fault'); }
  assert.deepEqual(listingState(), listingBeforeFault, 'late listing receipt failure rolls back flag, announcements, audit and reservation'); groups++;
  const firstListingRequest = lastManagementRequest.clone();
  const [firstListing, concurrentListing] = await Promise.all([managementRequest(firstListingRequest), managementRequest(firstListingRequest)]);
  assert.deepEqual(concurrentListing, firstListing);
  assert.equal(sql.exec("SELECT COUNT(*) AS n FROM content_operations WHERE method='admin-list'").toArray()[0].n, 1); groups++;
  const listedState = listingState();
  assert.deepEqual(await managementRequest(firstListingRequest), firstListing, 'same listing request returns the permanent original result');
  assert.deepEqual(listingState(), listedState, 'retry changes no listing, audit or announcement'); groups++;
  const originalAnnouncement = (await announcementPage()).announcements[0];
  assert.equal(originalAnnouncement.ordinal, '1.0'); assert.equal(originalAnnouncement.name, scenarioNames['HTTP proof']);
  assert.equal(originalAnnouncement.creatorAccount, 'owned_author'); groups++;
  sql.exec('UPDATE users SET account=? WHERE id=?', 'renamed_author', OWNER);
  const beforeReplay = reads, beforeReplayR2 = staging?.stats();
  assert.deepEqual(await call('HTTP proof', 'owned-publish-request-01'), first);
  assert.deepEqual(staging?.stats(), beforeReplayR2, 'permanent replay performs no staging or static reads');
  assert.equal(reads, beforeReplay, 'replay does not compile or read private objects'); groups++;
  app = makeApp();
  assert.deepEqual(await managementRequest(firstListingRequest), firstListing);
  const listingQuery = await app.fetch(new Request(`${origin}/api/admin/games/${gameId}/management-operations/${firstListingRequest.headers.get('Idempotency-Key')}`, { headers: { Cookie: `__Secure-dragon-editor=${adminToken}` } }));
  assert.equal(listingQuery.status, 200); assert.deepEqual(await listingQuery.json(), firstListing); groups++;
  const conflictingListing = new Request(firstListingRequest.clone(), { body: JSON.stringify({ action: 'list', expectedRowRevision: firstListing.rowRevision }) });
  assert.equal((await managementRequest(conflictingListing, 409)).error, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await managementRequest(new Request(firstListingRequest.clone(), { headers: { ...Object.fromEntries(firstListingRequest.headers), Origin: 'https://other.invalid' } }), 403)).error, 'ORIGIN_REJECTED');
  assert.deepEqual(await call('HTTP proof', 'owned-publish-request-01'), first);
  assert.equal(reads, beforeReplay, 'new common application instance uses the permanent receipt'); groups++;
  assert.deepEqual(await call('Changed', 'owned-publish-request-01'), { status: 409, value: { error: 'IDEMPOTENCY_CONFLICT' } }); groups++;
  assert.equal((await call('HTTP proof', 'owned-publish-request-01', { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await call('HTTP proof', 'owned-publish-request-01', { Origin: 'https://other.invalid' })).status, 403);
  assert.equal((await call('HTTP proof', 'owned-publish-request-01', { Cookie: '' })).status, 401); groups++;
  assert.equal((await call('HTTP proof', 'owned-bootstrap-create-01')).value.error, 'IDEMPOTENCY_CONFLICT'); groups++;
  let release, arrived;
  const held = new Promise(resolve => { release = resolve; }), both = new Promise(resolve => { arrived = resolve; });
  let waiting = 0;
  pauseReads = async key => { if (key.startsWith(`private/${gameId}/`)) { if (++waiting === 2) { arrived(); } await held; } };
  const a = call('Race proof', 'owned-publish-request-02'), b = call('Race proof', 'owned-publish-request-02');
  let timer;
  try { await Promise.race([both, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('owned publication barrier timeout')), 30000); })]); }
  finally { clearTimeout(timer); pauseReads = null; release(); }
  const results = await Promise.all([a, b]);
  assert.equal(results[0].status, 200, JSON.stringify(results)); assert.deepEqual(results[0], results[1]); assert.equal(results[0].value.ordinal, '1.1');
  assert.equal(sql.exec("SELECT * FROM content_operations WHERE method='publish'").toArray().length, 2);
  assert.equal(sql.exec('SELECT * FROM content_releases').toArray().length, 1);
  assert.equal(sql.exec('SELECT * FROM content_distribution_outbox').toArray().length, 2); groups++;
  assert.deepEqual(await call('HTTP proof', 'owned-publish-request-01'), first, 'replay is not a historical-version restore'); groups++;
  assert.equal(app.playPacks.pack(gameId).manifest.identity.draftRevision, '1');
  assert.equal(sql.exec('SELECT next_ordinal FROM content_games WHERE game_id=?', gameId).toArray()[0].next_ordinal, '1.1');
  const historyAfterSecond = (await announcementPage()).announcements;
  assert.equal(historyAfterSecond.length, 2, 'current-only play does not delete announcement history');
  assert.deepEqual(historyAfterSecond.find(row => row.ordinal === '1.0'), originalAnnouncement);
  assert.equal(historyAfterSecond[0].ordinal, '1.1'); assert.equal(historyAfterSecond[0].creatorAccount, 'renamed_author'); groups++;
  assert.deepEqual(sql.exec('SELECT name FROM content_names WHERE game_id=? ORDER BY name', gameId).toArray().map(row => row.name), [...new Set([formal.draft_name, results[0].value.name])].sort());
  const freedKey = 'owned-former-published-name';
  const freed = await reserveName(first.value.name, freedKey);
  assert.equal(freed.status, 202, JSON.stringify(freed)); assert.notEqual(freed.value.gameId, gameId);
  assert.deepEqual(await reserveName(first.value.name, freedKey), freed);
  assert.deepEqual(sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', OWNER, first.value.name).toArray().map(row => row.game_id), [freed.value.gameId]);
  const cancel = await app.fetch(new Request(`${origin}/api/games/create/${freedKey}/cancel`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': 'owned-former-name-cancel', 'If-Match': '"1"' }, body: '{}' }));
  const canceled = await cancel.json(); assert.equal(cancel.status, 200, JSON.stringify(canceled)); assert.equal(canceled.state, 'canceled');
  assert.deepEqual(sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', OWNER, first.value.name).toArray(), []);
  assert.deepEqual((await announcementPage()).announcements, historyAfterSecond, 'reusing a former formal name does not rewrite old announcement snapshots'); groups++;
  await manage('unlist');
  const downState = listingState();
  assert.deepEqual(await managementRequest(firstListingRequest), firstListing, 'old receipt is not permission to relist');
  assert.deepEqual(listingState(), downState); groups++;
  assert.deepEqual((await announcementPage()).announcements, []);
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_announcements WHERE game_id=?', gameId).toArray()[0].n, 2); groups++;
  const tables = ['content_games', 'content_names', 'published_packs', 'published_pack_chapters', 'published_pack_assets', 'published_games', 'content_releases', 'content_distribution_outbox', 'content_announcements', 'content_registry', 'content_operations', 'content_reservations'];
  const fingerprint = () => tables.map(table => sha(JSON.stringify(sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray())));
  const beforeRuntimeFailure = fingerprint(), putsBeforeRuntimeFailure = puts;
  let failedRuntimeGets = 0;
  pauseReads = async key => {
    if (key === `installed/${policy.registryId}/${installedRoot.sha256}`) {
      failedRuntimeGets++;
      sql.exec('UPDATE users SET epoch=2 WHERE id=?', OWNER);
      throw new Error('owned installed runtime GET failed after revocation');
    }
  };
  try {
    assert.deepEqual(await call('撤銷取數', 'owned-runtime-read-revoked'), { status: 401, value: { error: 'SESSION_INVALID' } });
    assert.equal(failedRuntimeGets, 1, 'failure reached the installed runtime root, not a private draft read');
    const rejectedReads = reads;
    assert.deepEqual(await call('撤銷取數', 'owned-runtime-read-revoked'), { status: 401, value: { error: 'SESSION_INVALID' } });
    assert.equal(reads, rejectedReads, 'revoked request stops before another object read');
    assert.deepEqual(fingerprint(), beforeRuntimeFailure, 'failed runtime read preserves all publication tables and permanent receipts');
    assert.equal(puts, putsBeforeRuntimeFailure, 'no object writes after runtime read failure');
  } finally { pauseReads = null; sql.exec('UPDATE users SET epoch=1 WHERE id=?', OWNER); }
  const readsBeforeOldReplay = reads;
  assert.deepEqual(await call('HTTP proof', 'owned-publish-request-01'), first);
  assert.equal(reads, readsBeforeOldReplay);
  assert.deepEqual(fingerprint(), beforeRuntimeFailure); groups++;
  const beforeFault = fingerprint();
  sql.exec("CREATE TEMP TRIGGER owned_receipt_fault BEFORE INSERT ON content_operations WHEN NEW.method='publish' BEGIN SELECT RAISE(ABORT,'owned receipt fault'); END");
  try { assert.equal((await call('Fault proof', 'owned-publish-request-fault')).status, 500); }
  finally { sql.exec('DROP TRIGGER owned_receipt_fault'); }
  assert.deepEqual(fingerprint(), beforeFault, 'late receipt failure rolls back all twelve publication tables including name occupancy'); groups++;
  const recovered = await call('Fault proof', 'owned-publish-request-fault');
  assert.equal(recovered.status, 200, JSON.stringify(recovered.value)); assert.equal(recovered.value.ordinal, '1.2');
  assert.deepEqual(await call('Fault proof', 'owned-publish-request-fault'), recovered); groups++;
  assert.deepEqual((await announcementPage()).announcements, [], 'hidden update stays hidden');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_announcements WHERE game_id=?', gameId).toArray()[0].n, 2); groups++;
  await manage('clear');
  assert.deepEqual((await announcementPage()).announcements, [], 'clearing restriction does not list');
  await manage('list');
  const relistedHistory = (await announcementPage()).announcements;
  assert.equal(relistedHistory.length, 3); assert.equal(relistedHistory[0].ordinal, '1.2');
  assert.deepEqual(relistedHistory.filter(row => row.ordinal !== '1.2'), historyAfterSecond); groups++;
  await manage('unlist'); await manage('clear'); await manage('list');
  assert.deepEqual((await announcementPage()).announcements, relistedHistory, 'same-version relist preserves every announcement ID/snapshot/date/order'); groups++;
  if (staging) {
    const rowRevision = sql.exec('SELECT row_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].row_revision;
    const cases = [
      ['disabled', () => sql.exec('UPDATE users SET disabled=1 WHERE id=?', OWNER), () => sql.exec('UPDATE users SET disabled=0 WHERE id=?', OWNER), 401, 'SESSION_INVALID'],
      ['epoch', () => sql.exec('UPDATE users SET epoch=2 WHERE id=?', OWNER), () => sql.exec('UPDATE users SET epoch=1 WHERE id=?', OWNER), 401, 'SESSION_INVALID'],
      ['password', () => sql.exec('UPDATE users SET must_change=1 WHERE id=?', OWNER), () => sql.exec('UPDATE users SET must_change=0 WHERE id=?', OWNER), 403, 'PASSWORD_CHANGE_REQUIRED'],
      ['row', () => sql.exec("UPDATE content_games SET row_revision='999' WHERE game_id=?", gameId), () => sql.exec('UPDATE content_games SET row_revision=? WHERE game_id=?', rowRevision, gameId), 409, 'PUBLISH_STALE'],
      ['fence', () => sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', gameId, OWNER, OWNER, rowRevision, '999', '2030-01-01T00:00:00.000Z'), () => sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', gameId), 409, 'GAME_DELETING'],
    ];
    for (const [label, mutate, restore, status, error] of cases) {
      const before = fingerprint(), counts = staging.stats();
      staging.interceptOnce('put', async () => { mutate(); });
      let result;
      try { result = await call('Revoked during staging', `owned-stage-revoke-${label}`); }
      finally { restore(); }
      assert.deepEqual(result, { status, value: { error } }, label);
      assert.deepEqual(fingerprint(), before, 'no formal SQL writes after ' + label);
      assert.equal(staging.stats().puts, counts.puts + 1, 'stop after the in-flight PUT; no cleanup or further upload');
      groups++;
    }
    // Two real Request preparations have different candidate release paths. B
    // commits while A is suspended inside its first immutable PUT; A must stop
    // and return B's permanent result, not stale/conflict or a second version.
    let resume, reached;
    const suspended = new Promise(resolve => { resume = resolve; });
    const entered = new Promise(resolve => { reached = resolve; });
    staging.interceptOnce('put', async () => { reached(); await suspended; });
    const pending = call('R2 concurrent replay', 'owned-stage-concurrent-replay');
    let sibling, timeout;
    try {
      await Promise.race([entered, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('owned R2 staging barrier timeout')), 30000); })]);
      sibling = await call('R2 concurrent replay', 'owned-stage-concurrent-replay');
    } finally { clearTimeout(timeout); resume(); }
    const original = await pending;
    assert.equal(sibling.status, 200, JSON.stringify(sibling));
    assert.equal(sibling.value.ordinal, '1.3');
    assert.deepEqual(original, sibling);
    assert.equal(sql.exec("SELECT * FROM content_operations WHERE method='publish'").toArray().length, 4);
    groups++;
  }
  if (process.argv.includes('--save-names')) {
    // Opt-in full-source saves: actual dispatcher/profile/blob writer, not a
    // prepared-snapshot fixture. Publication authority must remain unchanged.
    const formalBeforeSave = sql.exec('SELECT formal_name,formal_introduction,current_release_id,next_ordinal FROM content_games WHERE game_id=?', gameId).toArray()[0];
    const publishedState = () => ['published_packs', 'published_pack_chapters', 'published_pack_assets', 'published_games', 'content_releases', 'content_distribution_outbox', 'content_announcements', 'content_registry'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
    const publishedBeforeSave = publishedState();
    const savedNames = () => sql.exec('SELECT name FROM content_names WHERE game_id=? ORDER BY name', gameId).toArray().map(row => row.name);
    const saveName = async (name, revision, key) => {
      const response = await app.fetch(new Request(`${origin}/api/games/${gameId}/draft/save`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': key, 'If-Match': `"${revision}"` }, body: JSON.stringify({ metadata: { name, introduction: '草稿新簡介' }, resourceEdits: [] }) }));
      return { status: response.status, value: await response.json() };
    };
    const sameName = await saveName(formalBeforeSave.formal_name, '1', 'owned-save-formal-name');
    assert.equal(sameName.status, 200, JSON.stringify(sameName)); assert.equal(sameName.value.draftRevision, '2');
    assert.deepEqual(savedNames(), [formalBeforeSave.formal_name], 'draft may share its own formal name without a second occupancy');
    assert.deepEqual(publishedState(), publishedBeforeSave); groups++;
    const renamed = await saveName('新草稿名', '2', 'owned-save-new-draft-name');
    assert.equal(renamed.status, 200, JSON.stringify(renamed)); assert.equal(renamed.value.draftRevision, '3');
    assert.deepEqual(savedNames(), [formalBeforeSave.formal_name, '新草稿名'].sort());
    assert.deepEqual(sql.exec('SELECT formal_name,formal_introduction,current_release_id,next_ordinal FROM content_games WHERE game_id=?', gameId).toArray()[0], formalBeforeSave);
    assert.deepEqual(publishedState(), publishedBeforeSave, 'draft rename neither republishes nor changes formal introduction/history'); groups++;
    const committed = listingState(), readsBeforeReplay = reads;
    assert.deepEqual(await saveName(formalBeforeSave.formal_name, '1', 'owned-save-formal-name'), sameName, 'old save key returns its historical revision2 receipt, not current revision3');
    assert.deepEqual(await saveName('新草稿名', '2', 'owned-save-new-draft-name'), renamed);
    assert.deepEqual(listingState(), committed); assert.equal(reads, readsBeforeReplay, 'save receipt replay reads no blobs'); groups++;
    const stale = await saveName('過期草稿', '2', 'owned-save-stale-name');
    assert.deepEqual(stale, { status: 412, value: { error: 'DRAFT_CHANGED' } });
    assert.deepEqual(listingState(), committed); assert.deepEqual(publishedState(), publishedBeforeSave); groups++;
    for (const [index, name] of savedNames().entries()) {
      const denied = await reserveName(name, `owned-save-occupied-name-${index}`);
      assert.deepEqual(denied, { status: 409, value: { error: 'GAME_NAME_OCCUPIED' } });
    }
    assert.deepEqual(listingState(), committed);
    const releasedDraft = await reserveName(formal.draft_name, 'owned-save-released-draft');
    assert.equal(releasedDraft.status, 202, JSON.stringify(releasedDraft));
    assert.notEqual(releasedDraft.value.gameId, gameId);
    assert.deepEqual(publishedState(), publishedBeforeSave); groups++;
    const historyBeforeRepublish = (await announcementPage()).announcements;
    const republished = await call('新草稿名', 'owned-publish-saved-draft');
    assert.equal(republished.status, 200, JSON.stringify(republished));
    assert.equal(republished.value.ordinal, staging ? '1.4' : '1.3');
    assert.equal(app.playPacks.pack(gameId).manifest.identity.draftRevision, '3');
    assert.deepEqual(savedNames(), ['新草稿名']);
    const finalMetadata = sql.exec('SELECT formal_name,formal_introduction FROM content_games WHERE game_id=?', gameId).toArray()[0];
    assert.deepEqual({ ...finalMetadata }, { formal_name: '新草稿名', formal_introduction: '草稿新簡介' });
    const releasedFormal = await reserveName(formalBeforeSave.formal_name, 'owned-save-released-formal');
    assert.equal(releasedFormal.status, 202, JSON.stringify(releasedFormal));
    assert.notEqual(releasedFormal.value.gameId, gameId);
    const afterRepublish = (await announcementPage()).announcements;
    assert.equal(afterRepublish[0].ordinal, republished.value.ordinal);
    assert.deepEqual(afterRepublish.filter(row => row.ordinal !== republished.value.ordinal), historyBeforeRepublish);
    groups++;
    // Existing service-port tests reject foreign principals. Exercise the
    // real Request auth/CSRF/dispatch boundary against committed receipts too.
    const otherId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc', otherToken = '3'.repeat(64);
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', otherId, 'owned_other_author', 'author', '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', sha(otherToken), otherId, 1, Date.now() + 3600000, Date.now() + 3600000);
    const otherCsrf = await mac(`csrf:${otherToken}`, secret);
    const protectedTables = [...new Set([...tables, 'content_snapshots', 'content_audits', 'draft_requests', 'draft_objects', 'draft_references', 'copy_requests', 'copy_origins', 'copy_objects', 'content_used_ids'])];
    const protectedState = () => protectedTables.map(table => sha(JSON.stringify(sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray())));
    const protectedBefore = protectedState(), ioBefore = [reads, puts];
    const saveBody = { metadata: { name: '新草稿名', introduction: '草稿新簡介' }, resourceEdits: [] };
    const attempts = [
      [`/api/games/${gameId}/draft?revision=3`],
      [`/api/games/${gameId}/draft/operations/owned-save-new-draft-name`],
      [`/api/games/${gameId}/draft/save`, saveBody, 'owned-save-new-draft-name'],
      [`/api/games/${gameId}/draft/save`, saveBody, 'owned-foreign-save-new'],
      [`/api/games/${gameId}/publish-operations/owned-publish-saved-draft`],
      ['/api/publish', { gameId, name: '新草稿名' }, 'owned-publish-saved-draft'],
      ['/api/publish', { gameId, name: '新草稿名' }, 'owned-foreign-publish-new'],
    ];
    for (const [label, credential, csrfValue, status] of [['other author', otherToken, otherCsrf, 404], ['administrator', adminToken, adminCsrf, 404], ['anonymous', null, null, 401]]) {
      for (const [path, body, key] of attempts) {
        const headers = { Origin: origin };
        if (credential) { headers.Cookie = `__Secure-dragon-editor=${credential}`; headers['X-CSRF-Token'] = csrfValue; }
        if (body) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = key; headers['If-Match'] = '"2"'; }
        const response = await app.fetch(new Request(origin + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }));
        const result = await response.json();
        assert.equal(response.status, status, `${label} ${path}: ${JSON.stringify(result)}`);
        if (credential) assert.deepEqual(result, { error: 'GAME_NOT_FOUND' });
        assert.deepEqual(protectedState(), protectedBefore, 'denial creates no operation, source reference or publication mutation');
        assert.deepEqual([reads, puts], ioBefore, 'denial performs no object GET/PUT');
      }
      groups++;
    }
  }
  assert.throws(() => app.contentKey(OWNER, 'owned-publish-request-01', 'auth'), error => error.code === 'IDEMPOTENCY_CONFLICT'); groups++;
  sql.exec('UPDATE users SET disabled=1 WHERE id=?', OWNER);
  assert.equal((await call('HTTP proof', 'owned-publish-request-01')).status, 401); groups++;
  assert.equal(assertDeletionDefinitions(sql).tablesVerified, 53); groups++;
  process.stdout.write(JSON.stringify({ groups, chapters: 20, schemaTables: 53, staging: staging?.stats() ?? null, scope: staging ? 'actual common Request/compiler/SQLite -> immutable staging with real current authority; actual tracked static bytes via local file port and owned memory R2, no durable distribution producer/visibility/network/browser/blank-author proof' : 'actual common Request dispatcher/compiler/owned installed assets and SQLite, same-key concurrent replay; seeded sessions/full-copy bootstrap, no network/R2/browser/blank-author creation proof' }) + '\n');
} finally { storage.close(); rmSync(scratch, { recursive: true, force: true }); }
