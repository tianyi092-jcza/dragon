// Q26 author self-service creation (decision 3): AdminFullCopy role gate,
// pinned-template reserve, intra-author name uniqueness vs cross-author
// duplicates, published directory creatorAccount (player 名+版本(作者)).
// Units over vps/sqlite-port; no workerd boot, no R2.
import { readFileSync } from 'node:fs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { AdminFullCopy } from '../server/admincopy.js';
import { FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { PublishedGames } from '../server/published.js';
import { HttpError, fail } from '../server/security.js';

let passed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { console.error(`FAIL ${name} ${extra}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};
const fails = async (name, fn, code) => {
  try { await fn(); } catch (e) {
    check(name, e instanceof HttpError && e.code === code, e?.code);
    return;
  }
  check(name, false);
};

const storage = openStorage(':memory:');
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL DEFAULT \'\', phone TEXT NOT NULL DEFAULT \'\', note TEXT NOT NULL DEFAULT \'\')');
  storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, formal_name TEXT, draft_name TEXT NOT NULL, draft_revision TEXT NOT NULL, row_revision TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0)');
  storage.sql.exec('CREATE TABLE content_used_ids (game_id TEXT PRIMARY KEY)');
  storage.sql.exec('CREATE TABLE content_names (owner_id TEXT NOT NULL, name TEXT COLLATE BINARY NOT NULL, game_id TEXT NOT NULL, PRIMARY KEY(owner_id,name))');
  storage.sql.exec('CREATE TABLE content_reservations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))');
  storage.sql.exec('CREATE TABLE content_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  for (const [id, account, role] of [['u1', 'author_a', 'author'], ['u2', 'author_b', 'author'], ['u9', 'tianyi', 'admin']]) {
    storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role, '{}', 0, 0, 1, 1, '', '', '', '');
  }
});
const actors = {
  ha: { id: 'u1', role: 'author', epoch: 1, must_change: 0 },
  hb: { id: 'u2', role: 'author', epoch: 1, must_change: 0 },
  hadmin: { id: 'u9', role: 'admin', epoch: 1, must_change: 0 },
};
const principal = h => { if (!actors[h]) { fail(401, 'SESSION_INVALID'); } return actors[h]; };
const PINNED = 'approved-builtin-47e358-entities086-1';
const catalog = {
  status: (_h, id) => { if (id !== PINNED) { fail(404, 'SOURCE_NOT_REGISTERED'); } return { definitionDigest: 'd'.repeat(64), rootDigest: 'e'.repeat(64) }; },
  definition: () => ({ registryId: PINNED, profileRevision: FIXED_COPY_PROFILE }),
  loadFull: () => fail(503, 'COPY_NOT_CONFIGURED'),
};
// This role-gate fixture only models indexed claims; the real metadata port and
// legacy formal-name reservations are covered by verify_formal_name_occupancy.
const gamesStub = {
  // This reserve-only fixture must never enter the current-copy store ports.
  assertNotDeleting: () => fail(503, 'UNEXPECTED_COPY_STORE_CALL'),
  listOwn: () => fail(503, 'UNEXPECTED_COPY_STORE_CALL'),
  recoverGameId: () => fail(503, 'COPY_NOT_CONFIGURED'),
  assertNameAvailableInTxn(token, name) {
    if (storage.sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', principal(token).id, name).toArray().length) fail(409, 'GAME_NAME_OCCUPIED');
  },
};
const blobsStub = { putImmutable: () => fail(503, 'COPY_NOT_CONFIGURED'), read: () => fail(503, 'COPY_NOT_CONFIGURED') };
const opts = roles => ({ storage, principal, catalog, games: gamesStub, blobs: blobsStub, roles });

// 1. Default instance stays admin-only (existing contract frozen).
const adminCopies = new AdminFullCopy(opts(undefined));
await fails('default-rejects-author', () => adminCopies.reserve('ha', 'k'.repeat(16), { registryId: PINNED, name: '名', introduction: '' }), 'FULL_COPY_ADMIN_REQUIRED');
// 2. Author instance: author OK, admin rejected.
const authorCopies = new AdminFullCopy({ ...opts(['author']), profileRevision: FIXED_TEMPLATE_PROFILE });
await fails('author-instance-rejects-admin', () => authorCopies.reserve('hadmin', 'k'.repeat(16), { registryId: PINNED, name: '名', introduction: '' }), 'FULL_COPY_ADMIN_REQUIRED');
// 3. Bad roles rejected at construction.
await fails('bad-roles', () => new AdminFullCopy(opts(['ghost'])), 'COPY_ROLE_POLICY');
await fails('empty-roles', () => new AdminFullCopy(opts([])), 'COPY_ROLE_POLICY');
// 4. Author reserve pins template; registry stored server-side value.
const r1 = authorCopies.reserve('ha', 'a1'.padEnd(16, '0'), { registryId: PINNED, name: '三國志', introduction: '自建' });
check('author-reserve-state', r1.state === 'pending' && r1.registryId === PINNED, r1.state);
check('author-template-profile', storage.sql.exec('SELECT profile_revision FROM copy_requests WHERE game_id=?', r1.gameId).toArray()[0].profile_revision === FIXED_TEMPLATE_PROFILE);
// 5. Unknown registry rejected (client cannot smuggle a template).
await fails('unknown-registry', () => authorCopies.reserve('ha', 'a2'.padEnd(16, '0'), { registryId: 'evil-template', name: 'X', introduction: '' }), 'SOURCE_NOT_REGISTERED');
// 6. Intra-author duplicate name 409; cross-author same name OK (重名允许).
await fails('same-author-dup-name', () => authorCopies.reserve('ha', 'a3'.padEnd(16, '0'), { registryId: PINNED, name: '三國志', introduction: '' }), 'GAME_NAME_OCCUPIED');
const r2 = authorCopies.reserve('hb', 'b1'.padEnd(16, '0'), { registryId: PINNED, name: '三國志', introduction: '' });
check('cross-author-same-name-ok', r2.state === 'pending' && r2.gameId !== r1.gameId);
// 7. Query/cancel round-trip on author instance.
const q = authorCopies.query('ha', 'a1'.padEnd(16, '0'));
check('author-query', q.gameId === r1.gameId && q.state === 'pending');
const c = authorCopies.cancel('ha', 'a1'.padEnd(16, '0'), q.rowRevision);
check('author-cancel', c.state === 'canceled');
// 8. Worker route surface (static): POST /api/games + author create path exist,
// admin copies path untouched.
const workerSrc = readFileSync('server/editorapp.js', 'utf8');
check('route-post-games', workerSrc.includes("if (path === '/api/games')"));
check('route-author-create-path', workerSrc.includes('authorCopyPath'));
check('route-pinned-registry', workerSrc.includes('installedSources.definition().registryId'));
check('route-admin-copies-intact', workerSrc.includes("if (path === '/api/admin/copies')"));
// 9. Player directory entries carry creatorAccount (名+版本(作者)).
const published = new PublishedGames({ storage, principal });
storage.transactionSync(() => {
  storage.sql.exec("INSERT INTO content_games VALUES('ga','u1','正式名','草稿名','1','1',1)");
  storage.sql.exec("INSERT INTO published_games VALUES('ga','u1',?,?)", JSON.stringify({ gameId: 'ga', name: '三國志', revision: '1', sourceDigest: 'a'.repeat(64), chapters: ['c1'], publishedAt: new Date().toISOString(), ordinal: '1.0' }), new Date().toISOString());
  storage.sql.exec("INSERT INTO content_games VALUES('gb','u2','正式名2','草稿名2','1','1',0)");
  storage.sql.exec("INSERT INTO published_games VALUES('gb','u2',?,?)", JSON.stringify({ gameId: 'gb', name: '三國志', revision: '1', sourceDigest: 'a'.repeat(64), chapters: ['c1'], publishedAt: new Date().toISOString(), ordinal: '1.0' }), new Date().toISOString());
});
const listed = published.list();
check('directory-only-listed', listed.length === 1 && listed[0].gameId === 'ga', String(listed.length));
check('directory-creator-account', listed[0].creatorAccount === 'author_a', listed[0].creatorAccount);
check('directory-ordinal', listed[0].ordinal === '1.0');
console.log(`author-create: ${passed} checks passed`);
