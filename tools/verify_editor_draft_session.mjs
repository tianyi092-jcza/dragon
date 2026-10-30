// Actual common Request/auth routes + SQLite; explicit draft-port seam.
// No source compiler, browser, production session or elapsed-time sleeps.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
const { mac, fail } = await import('../server/security.js');
const { StageJobsAPI } = await import('../server/stageapi.js');
const { PrivateLibraryAssets } = await import('../server/libraryassets.js');
const storage = openStorage(':memory:'), realNow = Date.now;
const origin = 'https://owned-editor.invalid', secret = 'c'.repeat(64), token = '1'.repeat(64);
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', game = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hash = createHash('sha256').update(token).digest('hex');
let now = realNow(), calls = 0, checks = 0, serial = 0;
Date.now = () => now;
try {
  const app = new (createEditorApplication(class {}))({ storage }, { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: 'Owned-Test-Password-Only-1!', EDITOR_IDLE_MS: '1000' });
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', actor, 'owned_author', 'author', '{}', 0, 0, 1, 1, '', '', '', '');
  const seed = (idle = now + 100, absolute = now + 5000) => {
    storage.sql.exec('DELETE FROM sessions');
    storage.sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', hash, actor, 1, absolute, idle);
  };
  const session = () => storage.sql.exec('SELECT * FROM sessions WHERE token_hash=?', hash).toArray()[0];
  app.privateDrafts = {
    async read() { calls++; return { ownedFixture: 'read' }; },
    query() { calls++; return { ownedFixture: 'query' }; },
    async save() { calls++; return { ownedFixture: 'save' }; },
  };
  // Keep real route matching; only the resource services are explicit seams.
  app.stageApi = { match: StageJobsAPI.prototype.match, async read() { calls++; return { body: { ownedFixture: 'stage' } }; }, assertCurrent() { app.principal(hash); } };
  app.libraryAssets = { match: PrivateLibraryAssets.prototype.match, async read() { calls++; return { body: { ownedFixture: 'library' }, assertCurrent() { app.principal(hash); } }; } };
  const stagePath = `/api/games/${game}/stage-jobs/data/${actor}`, libraryPath = `/api/games/${game}/draft/library-assets`;
  // Lists retain their real SQLite/role checks. Registry/copy data ports are
  // explicit seams; root copyAccess and session policy remain real.
  for (const method of ['listOwn', 'managementSummaries']) {
    const original = app.games[method].bind(app.games);
    app.games[method] = (...args) => { const value = original(...args); calls++; return value; };
  }
  const writePorts = Object.fromEntries(['installedSources', 'availableLibrary', 'adminCopies', 'authorCopies'].map(key => [key, app[key]]));
  const registry = () => ({ definition: () => ({ registryId: 'owned-fixture' }), status() { calls++; return { ownedFixture: 'registry' }; } });
  const installReadSeams = () => {
    app.installedSources = registry(); app.availableLibrary = registry();
    app.adminCopies = { query() { calls++; return { ownedFixture: 'admin-copy' }; } };
    app.authorCopies = { query() { calls++; return { ownedFixture: 'author-copy' }; } };
    app.publicationProducer = {}; // Explicit status-data seams, not publication proof.
    app.publishOperations = { query() { calls++; return { gameId: game, releaseId: actor }; } };
    app.management = {
      query() { calls++; return { ownedFixture: 'management' }; },
      queryDistribution() { return { result: {}, distribution: { operationId: game, generation: 2 } }; },
    };
    app.frozenDistribution = { operationStatus(_gameId, operationId) { return { generation: 2, kind: operationId === actor ? 'publish' : 'listing' }; } };
  };
  const adminCopyPath = '/api/admin/copies/owned-copy-operation', authorCopyPath = '/api/games/create/owned-copy-operation';
  const csrf = await mac(`csrf:${token}`, secret);
  async function request(path, post = false, headers = {}) {
    const response = await app.fetch(new Request(origin + path, { method: post ? 'POST' : 'GET', headers: { Cookie: `__Secure-dragon-editor=${token}`, ...(post ? { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': `owned-draft-session-${++serial}`, 'If-Match': '"1"' } : {}), ...headers }, ...(post ? { body: JSON.stringify({ metadata: { name: 'Fixture', introduction: '' }, resourceEdits: [] }) } : {}) }));
    return { status: response.status, body: await response.json() };
  }
  const routes = [[`/api/games/${game}/draft?revision=1`, false], [`/api/games/${game}/draft/operations/owned-operation-key`, false], [`/api/games/${game}/draft/save`, true], [stagePath, false], [libraryPath + '?revision=1', false]];
  routes.push(['/api/games', false], ['/api/admin/games', false, 'admin'], ['/api/admin/source', false, 'admin'], ['/api/admin/library', false, 'admin'], [adminCopyPath, false, 'admin'], [authorCopyPath, false]);
  const publishStatusPath = `/api/games/${game}/publish-operations/owned-status-operation`;
  const managementStatusPath = `/api/admin/games/${game}/management-operations/owned-status-operation`;
  routes.push([publishStatusPath, false], [managementStatusPath, false, 'admin'], [managementStatusPath + '/distribution', false, 'admin']);
  for (const [path, post, role = 'author'] of routes) {
    // Read seams have no source-write schema; activate only after POST cases.
    if (path === '/api/games') installReadSeams();
    storage.sql.exec('UPDATE users SET role=? WHERE id=?', role, actor);
    seed(); const absolute = session().absolute_until, before = calls;
    const result = await request(path, post);
    assert.equal(result.status, 200, JSON.stringify({ path, result }));
    assert.equal(calls, before + 1); assert.equal(session().idle_until, now + 1000);
    assert.equal(session().absolute_until, absolute); checks++;
    now += 101; // Past the old idle boundary, still active under the same policy.
    assert.equal((await request(path, post)).status, 200); checks++;
    seed(now + 100, now + 200);
    assert.equal((await request(path, post)).status, 200);
    assert.equal(session().idle_until, now + 200, 'never extend the absolute deadline'); checks++;
    seed(now, now + 5000); const expired = session(), beforeExpired = calls;
    assert.equal((await request(path, post)).status, 401);
    assert.equal(calls, beforeExpired); assert.deepEqual(session(), expired); checks++;
    seed(); storage.sql.exec('UPDATE users SET epoch=2 WHERE id=?', actor);
    const revoked = session(), beforeRevoked = calls;
    assert.equal((await request(path, post)).status, 401);
    assert.equal(calls, beforeRevoked); assert.deepEqual(session(), revoked);
    storage.sql.exec('UPDATE users SET epoch=1 WHERE id=?', actor); checks++;
    seed(now + 1000, now); const absoluteExpired = session(), beforeAbsolute = calls;
    assert.equal((await request(path, post)).status, 401);
    assert.equal(calls, beforeAbsolute); assert.deepEqual(session(), absoluteExpired); checks++;
    for (const [field, status] of [['disabled', 401], ['must_change', 403]]) {
      seed(); storage.sql.exec(`UPDATE users SET ${field}=1 WHERE id=?`, actor);
      const blocked = session(), beforeBlocked = calls;
      assert.equal((await request(path, post)).status, status);
      assert.equal(calls, beforeBlocked); assert.deepEqual(session(), blocked);
      storage.sql.exec(`UPDATE users SET ${field}=0 WHERE id=?`, actor); checks++;
    }
  }
  for (const [path, post, headers, status] of [
    [`/api/games/${game}/draft?extra=1`, false, {}, 422],
    [stagePath + '?extra=1', false, {}, 422],
    [libraryPath + '?extra=1', false, {}, 422],
    [publishStatusPath + '?extra=1', false, {}, 422],
    [managementStatusPath + '?extra=1', false, {}, 422],
    [managementStatusPath + '/distribution?extra=1', false, {}, 422],
    [`/api/games/${game}/draft/save`, true, { 'If-Match': '' }, 428],
    [`/api/games/${game}/draft/save`, true, { 'X-CSRF-Token': 'wrong' }, 403],
  ]) {
    if (post) Object.assign(app, writePorts);
    seed(); const before = session(), count = calls;
    assert.equal((await request(path, post, headers)).status, status);
    assert.equal(calls, count); assert.deepEqual(session(), before); checks++;
  }
  installReadSeams();
  for (const [path, role] of [['/api/admin/games', 'author'], ['/api/admin/source', 'author'], ['/api/admin/library', 'author'], [adminCopyPath, 'author'], [authorCopyPath, 'admin']]) {
    storage.sql.exec('UPDATE users SET role=? WHERE id=?', role, actor);
    seed(); const before = session(), count = calls;
    assert.equal((await request(path)).status, 403);
    assert.equal(calls, count); assert.deepEqual(session(), before); checks++;
  }
  storage.sql.exec('UPDATE users SET role=? WHERE id=?', 'admin', actor);
  seed(); const beforeBadLibrary = session(), beforeBadLibraryCalls = calls;
  assert.equal((await request('/api/admin/library?extra=1')).status, 422);
  assert.deepEqual(session(), beforeBadLibrary); assert.equal(calls, beforeBadLibraryCalls); checks++;
  for (const [path, port, method, role] of [
    ['/api/admin/source', app.installedSources, 'status', 'admin'],
    ['/api/admin/library', app.availableLibrary, 'status', 'admin'],
    [adminCopyPath, app.adminCopies, 'query', 'admin'],
    [authorCopyPath, app.authorCopies, 'query', 'author'],
    [publishStatusPath, app.publishOperations, 'query', 'author'],
    [managementStatusPath, app.management, 'query', 'admin'],
    [managementStatusPath + '/distribution', app.management, 'queryDistribution', 'admin'],
    [publishStatusPath, app.frozenDistribution, 'operationStatus', 'author'],
  ]) {
    storage.sql.exec('UPDATE users SET role=? WHERE id=?', role, actor);
    seed(); const before = session(), original = port[method];
    port[method] = () => fail(404, 'OWNED_READ_REFUSED');
    try {
      assert.equal((await request(path)).status, 404);
      assert.deepEqual(session(), before, 'refused data read must not renew the session'); checks++;
    } finally { port[method] = original; }
  }
  const originalStatus = app.frozenDistribution.operationStatus;
  app.frozenDistribution.operationStatus = () => ({ kind: 'restriction', generation: 99 });
  try {
    for (const path of [publishStatusPath, managementStatusPath + '/distribution']) {
      seed(); const before = session();
      assert.equal((await request(path)).status, 503);
      assert.deepEqual(session(), before, 'inconsistent distribution receipt must not renew'); checks++;
    }
  } finally { app.frozenDistribution.operationStatus = originalStatus; }
  app.management.queryDistribution = () => ({ result: {}, distribution: null });
  seed(); assert.equal((await request(managementStatusPath + '/distribution')).status, 200);
  assert.equal(session().idle_until, now + 1000); checks++;
  // Actual collection orchestration with a deliberately not-ready job. The
  // first awaited library read crosses the old idle boundary; no ready-plan
  // fixture or runtime admission is invented for this timing check.
  const purposes = ['data', 'images', 'fallback-spring', 'fallback-summer', 'fallback-autumn', 'fallback-winter'];
  const parameters = new URLSearchParams({ revision: '1', ...Object.fromEntries(purposes.map((purpose, index) => [purpose, `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`])) });
  const collectionPath = `/api/games/${game}/stage-assets?${parameters}`;
  let revokeCollection = false;
  app.games.snapshotReference = () => { app.principal(hash); return { gameId: game, draftRevision: '1' }; };
  app.libraryAssets.read = async () => {
    calls++; now += 101;
    if (revokeCollection) storage.sql.exec('UPDATE users SET epoch=2 WHERE id=?', actor);
    return { body: {}, assertCurrent() { app.principal(hash); } };
  };
  app.stageApi.read = async (_token, path) => {
    calls++; return { body: { admission: 'stage-only', purpose: path.purpose, job: { operationId: path.id, gameId: game, draftRevision: '1', state: 'pending' } } };
  };
  storage.sql.exec('UPDATE users SET role=? WHERE id=?', 'admin', actor);
  seed(); const collectionStart = now, collectionCalls = calls;
  const notReady = await request(collectionPath);
  assert.equal(notReady.status, 409, JSON.stringify(notReady)); assert.equal(notReady.body.error, 'JOB_NOT_READY');
  assert.equal(calls, collectionCalls + 2); assert.equal(session().idle_until, collectionStart + 1000); checks++;
  seed(); revokeCollection = true; const beforeRevokeCollection = calls;
  assert.equal((await request(collectionPath)).status, 401);
  assert.equal(calls, beforeRevokeCollection + 1, 'revoked captured library assertion stops later reads');
  storage.sql.exec('UPDATE users SET epoch=1 WHERE id=?', actor); revokeCollection = false; checks++;
  for (const [path, role, status, expired] of [
    [collectionPath, 'author', 403, false],
    [collectionPath + '&extra=1', 'admin', 422, false],
    [collectionPath, 'admin', 401, true],
  ]) {
    storage.sql.exec('UPDATE users SET role=? WHERE id=?', role, actor);
    seed(expired ? now : now + 100); const before = session(), count = calls;
    assert.equal((await request(path)).status, status);
    assert.deepEqual(session(), before); assert.equal(calls, count); checks++;
  }
  seed(now + 20, now + 50); const collectionDeadline = session().absolute_until, deadlineCalls = calls;
  assert.equal((await request(collectionPath)).status, 401);
  assert.equal(session().idle_until, collectionDeadline); assert.equal(session().absolute_until, collectionDeadline);
  assert.equal(calls, deadlineCalls + 1, 'absolute expiry during collection cannot be revived'); checks++;
  const stagePort = app.stageApi; app.stageApi = null;
  try {
    seed(); const before = session(), count = calls;
    assert.equal((await request(collectionPath)).status, 503);
    assert.deepEqual(session(), before); assert.equal(calls, count); checks++;
  } finally { app.stageApi = stagePort; }
  process.stdout.write(`editor data session activity: ${checks} checks; actual auth/SQLite/matchers, stub data ports\n`);
} finally { Date.now = realNow; storage.close(); }
