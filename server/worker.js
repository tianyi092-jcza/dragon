import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { GameMetadataStore } from './metadata.js';
import { GameManagement } from './management.js';
import { ImmutableBlobStore } from './blobs.js';
import { InstalledSourceCatalog } from './sourcecatalog.js';
import { installedSourcePolicy, installedAvailableLibraryPolicy } from './sourcecatalogpolicy.js';
import availableLibraryManifest from './available-library.txt';
import { AdminFullCopy } from './admincopy.js';
import { GameSnapshotVerifier } from './snapshots.js';
import { PrivateDrafts } from './drafts.js';
import { FixedCopyDataCompiler } from './datacompiler.js';
import { FixedCopyImages } from './copyimages.js';
import { FixedCopyImageJobs } from './imagejobs.js';
import { FixedCopyFallbackJobs } from './fallbackjobs.js';
import { StageJobsAPI } from './stageapi.js';
import { collectFixedStageAssets } from './stageassetcollection.js';
import { HttpCommandTargets } from './commandtargets.js';
import { PrivateWriteJournal } from './privatewrites.js';
import { PrivateLibraryAssets } from './libraryassets.js';
import { TrialSessions } from './trials.js';
import worldManifest from './pinned/world-manifest.txt';
import entityManifest from './pinned/entity-manifest.txt';
import { HttpError, fail, config, fields, body, account, password, passwordHash, passwordMatches, randomToken, sha, mac, seal, unseal, equal } from './security.js';
import page from './public/index.html';
import client from './public/client.txt';
import draftClient from './public/draft.txt';
import stageClient from './public/stage.txt';
import libraryClient from './public/library.txt';
import catalogClient from './public/catalog.txt';
import managementClient from './public/management.txt';
import stageAssetsClient from './public/stageassets.txt';
import style from './public/style.css';
import trialwebBundle from './public/trialweb.txt';
import trialappShell from './public/trialapp.txt';
import { decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const COOKIE = '__Secure-dragon-editor';
function requestURL(request) { try { return new URL(request.url); } catch { fail(400, 'INVALID_URL'); } }
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
// Trial-window shell/bundle routes: same policy plus the image/media/font sources the App actually needs.
// style-src allows inline: the App applies element.style inline (faction panel cssText, in-document styles);
// script-src stays strict 'self' (no inline script, no eval).
const trialHeaders = { ...headers, 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const trialWebFiles = new Map(parseTrialJson(trialwebBundle, 'trial web bundle').files.map(file => [file.path, file]));
const trialAppPage = parseTrialJson(trialappShell, 'trial app shell').html;
function parseTrialJson(text, label) { try { return JSON.parse(text); } catch (cause) { throw new Error(`${label} corrupt`, { cause }); } }
const TRIAL_WAIT_PAGE = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>草稿試運行</title><p>正在建立試運行工作階段…若啟動失敗，請返回工作台查看診斷並重新開啟。</p></html>';
const TRIAL_WEB_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.flac': 'audio/flac', '.wav': 'audio/wav' };
const trialWebType = path => TRIAL_WEB_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';
function staticAsset(pathname) {
  if (pathname === '/client.js') { return { content: client, type: 'text/javascript' }; }
  if (pathname === '/draft.js') { return { content: draftClient, type: 'text/javascript' }; }
  if (pathname === '/stage.js') { return { content: stageClient, type: 'text/javascript' }; }
  if (pathname === '/library.js') { return { content: libraryClient, type: 'text/javascript' }; }
  if (pathname === '/catalog.js') { return { content: catalogClient, type: 'text/javascript' }; }
  if (pathname === '/management.js') { return { content: managementClient, type: 'text/javascript' }; }
  if (pathname === '/stage-assets.js') { return { content: stageAssetsClient, type: 'text/javascript' }; }
  if (pathname === '/style.css') { return { content: style, type: 'text/css' }; }
  return { content: page, type: 'text/html' };
}
function response(value, status = 200, token) {
  const h = new Headers(headers); h.set('Content-Type', 'application/json; charset=utf-8');
  if (token !== undefined) { h.set('Set-Cookie', `${COOKIE}=${token}; Path=/api; Secure; HttpOnly; SameSite=Strict${token ? '' : '; Max-Age=0'}`); }
  return new Response(JSON.stringify(value), { status, headers: h });
}
function dto(user) { return { id: user.id, account: user.account, role: user.role, disabled: Boolean(user.disabled), mustChangePassword: Boolean(user.must_change), version: user.version }; }
function cookie(request) {
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`));
  if (values.length !== 1 || !/^[a-f0-9]{64}$/.test(values[0].slice(COOKIE.length + 1))) { fail(401, 'LOGIN_REQUIRED'); }
  return values[0].slice(COOKIE.length + 1);
}
export class EditorMetadata extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    ctx.storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY CHECK(version=1))');
      this.sql.exec('INSERT OR IGNORE INTO schema_version VALUES(1)');
      this.sql.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','author')), password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)");
      this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), epoch INTEGER NOT NULL, absolute_until INTEGER NOT NULL, idle_until INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS login_rates (bucket TEXT PRIMARY KEY, start_at INTEGER NOT NULL, attempts INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, sealed_result TEXT NOT NULL, epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(actor,op_key))');
    });
    // Fixed-copy drafts and bounded stage artifacts only; runtime/Trial/publish stay closed.
    let copies;
    this.games = new GameMetadataStore({ storage: ctx.storage, principal: hash => this.principal(hash),
      verifySnapshot: env.EDITOR_BLOBS ? context => new GameSnapshotVerifier({ blobs: this.blobs }).verify(context.tokenHash, context) : undefined,
      recoverAllocation: (hash, cap) => { if (!copies) { fail(503, 'COPY_NOT_CONFIGURED');  }return copies.resolveAllocation(hash, cap); } });
    // Reuses permanent content reservation slots; historical 'copy' namespace name is not a copy capability.
    this.management = new GameManagement({ storage: ctx.storage, principal: hash => this.principal(hash), operationGuard: (actor, key) => this.contentKey(actor, key, 'copy') });
    this.trialSessions = null;
    this.blobs = null; this.installedSources = null; this.adminCopies = null; this.privateDrafts = null; this.stageApi = null; this.availableLibrary = null; this.libraryAssets = null;
    if (env.EDITOR_BLOBS) {
      const maxBytes = env.EDITOR_BLOB_MAX_BYTES === undefined ? 16 * 1024 * 1024 : Number(env.EDITOR_BLOB_MAX_BYTES);
      this.privateWrites = new PrivateWriteJournal({ storage: ctx.storage, bucket: env.EDITOR_BLOBS });
      this.blobs = new ImmutableBlobStore({ bucket: this.privateWrites, authority: (hash, context) => this.games.blobAuthority(hash, context), storage:ctx.storage, maxBytes });
      const policy = installedSourcePolicy(new TextEncoder().encode(worldManifest), new TextEncoder().encode(entityManifest));
      this.installedSources = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy, operationGuard: (actor, key) => this.contentKey(actor.id, key, 'source') });
      const libraryPolicy = installedAvailableLibraryPolicy(new TextEncoder().encode(availableLibraryManifest));
      this.availableLibrary = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy: libraryPolicy, operationGuard: (actor, key) => this.contentKey(actor.id, key, 'source') });
      copies = this.adminCopies = new AdminFullCopy({ storage: ctx.storage, principal: hash => this.principal(hash), catalog: this.installedSources, games: this.games, blobs: this.blobs, leaseMs: 300000 });
      this.commandTargets = new HttpCommandTargets(ctx.storage, env.EDITOR_REQUEST_KEY);
      ctx.storage.transactionSync(() => this.sql.exec('CREATE TABLE IF NOT EXISTS copy_http_commands (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))'));
      this.privateDrafts = new PrivateDrafts({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, blobs: this.blobs, definition: () => this.installedSources.definition(), operationGuard: (actor, key) => this.contentKey(actor, key, 'draft') });
      // Draft Trial sessions with support-domain chapter projection, private derived resources, registry visuals and fence-begin deletion cascade.
      this.trialSessions = new TrialSessions({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, drafts: this.privateDrafts, catalog: this.installedSources, policy });
      this.libraryAssets = new PrivateLibraryAssets({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, drafts: this.privateDrafts, catalog: this.availableLibrary, policy: libraryPolicy });
      const ports = { storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, blobs: this.blobs, operationGuard: (actor, key) => this.contentKey(actor, key, 'compile') };
      const imagePlanner = new FixedCopyImages({ ...ports, drafts: this.privateDrafts, catalog: this.installedSources, policy });
      const fallbacks = Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => [`fallback-${season}`, new FixedCopyFallbackJobs({ ...ports, images: imagePlanner, season })]));
      this.stageApi = new StageJobsAPI({ ...ports, requestKey: env.EDITOR_REQUEST_KEY, services: { data: new FixedCopyDataCompiler({ ...ports, drafts: this.privateDrafts }), images: new FixedCopyImageJobs({ ...ports, images: imagePlanner }), ...fallbacks }, operationGuard: (actor, key) => this.contentKey(actor, key, 'stage-command') });
    }
  }
  one(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  // Read-only public registry role bytes for the trial web route: pinned index roles, chunked R2 reads, sha re-verified.
  async #fetchRegistryChunks(registryId, role) {
    const pieces = [];
    for (const chunk of role.chunks) {
      if (!/^[a-f0-9]{64}$/.test(chunk.sha256 ?? '') || !Number.isSafeInteger(chunk.byteLength)) { fail(503, 'TRIAL_WEB_REGISTRY'); }
      const object = await this.env.EDITOR_BLOBS.get(`installed/${registryId}/${chunk.sha256}`);
      if (!object || object.size !== chunk.byteLength) { fail(503, 'TRIAL_WEB_REGISTRY'); }
      pieces.push(new Uint8Array(await object.arrayBuffer()));
    }
    return pieces;
  }
  async trialRegistryBytes(catalog, path) {
    const registryId = catalog.definition().registryId;
    const row = this.one('SELECT * FROM installed_sources WHERE registry_id=?', registryId);
    if (!row) { fail(404, 'TRIAL_WEB_PATH'); }
    const root = await this.env.EDITOR_BLOBS.get(`installed/${registryId}/${row.root_digest}`);
    if (!root || root.size !== row.root_byte_length) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    const rootBytes = new Uint8Array(await root.arrayBuffer());
    if (createHash('sha256').update(rootBytes).digest('hex') !== row.root_digest) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    let index; try { index = decodeSourceChunks([rootBytes]); } catch { fail(503, 'TRIAL_WEB_REGISTRY'); }
    const role = index?.roles?.find(item => item.path === path);
    if (!role || !/^[a-f0-9]{64}$/.test(role.sha256 ?? '') || !Number.isSafeInteger(role.byteLength) || !Array.isArray(role.chunks) || role.chunks.length < 1) { fail(404, 'TRIAL_WEB_PATH'); }
    const pieces = await this.#fetchRegistryChunks(registryId, role);
    const bytes = Buffer.concat(pieces);
    if (bytes.length !== role.byteLength || createHash('sha256').update(bytes).digest('hex') !== role.sha256) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    return bytes;
  }
  seed(policy) {
    if (this.one("SELECT id FROM users WHERE account='tianyi'")) { return; }
    const id = crypto.randomUUID(), encoded = passwordHash(policy.defaultPassword);
    this.ctx.storage.transactionSync(() => { if (!this.one("SELECT id FROM users WHERE account='tianyi'")) { this.sql.exec("INSERT INTO users VALUES(?,?,'admin',?,0,1,1,1)", id, 'tianyi', encoded);  }});
  }
  rate(accountName, source, policy) {
    const now = Date.now(); let denied = false;
    this.ctx.storage.transactionSync(() => {
      for (const [bucket, limit] of [[`account:${accountName}`, policy.accountLimit], [`source:${source}`, policy.sourceLimit]]) {
        const row = this.one('SELECT * FROM login_rates WHERE bucket=?', bucket);
        const start = row && now - row.start_at < policy.rateMs ? row.start_at : now;
        const attempts = row && start === row.start_at ? row.attempts : 0;
        if (attempts >= limit) { denied = true; }
        this.sql.exec('INSERT OR REPLACE INTO login_rates VALUES(?,?,?)', bucket, start, Math.min(attempts + 1, limit));
      }
    });
    if (denied) { fail(429, 'LOGIN_RATE_LIMIT'); }
  }
  principal(tokenHash) {
    const row = this.one('SELECT s.*,u.account,u.role,u.disabled,u.must_change,u.version,u.epoch AS user_epoch,u.password_hash FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=?', tokenHash);
    const now = Date.now();
    if (!row || row.disabled || row.epoch !== row.user_epoch || now >= row.absolute_until || now >= row.idle_until) { fail(401, 'SESSION_INVALID'); }
    return { ...row, id: row.user_id, epoch: row.user_epoch };
  }
  touch(tokenHash, policy) { this.sql.exec('UPDATE sessions SET idle_until=MIN(absolute_until,?) WHERE token_hash=?', Date.now() + policy.idleMs, tokenHash); }
  async sessionData(user, policy) {
    const token = randomToken(), hash = await sha(token), now = Date.now();
    return { token, hash, absolute: now + policy.sessionMs, idle: Math.min(now + policy.idleMs, now + policy.sessionMs), csrf: await mac(`csrf:${token}`, policy.secret), user };
  }
  insertSession(s, user) { this.sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', s.hash, user.id, user.epoch, s.absolute, s.idle); }
  async fetch(request) {
    try { return await this.handle(request); }
    catch (error) { return response({ error: error instanceof HttpError ? error.code : 'INTERNAL_ERROR' }, error instanceof HttpError ? error.status : 500); }
  }
  #gateEntry(request, policy, url, method, path) {
    if (url.origin !== policy.origin) { fail(403, 'ORIGIN_REJECTED'); }
    if (method === 'GET' && path === '/api/health') { return response({ service: 'dragon-editor', stage: 'accounts-sessions', initialized: Boolean(this.one("SELECT id FROM users WHERE account='tianyi'")) }); }
    if (method !== 'GET' && (method !== 'POST' || request.headers.get('Origin') !== policy.origin)) { fail(403, 'ORIGIN_REJECTED'); }
    const suppliedOrigin = request.headers.get('Origin'); if (suppliedOrigin && suppliedOrigin !== policy.origin) { fail(403, 'ORIGIN_REJECTED'); }
    return null;
  }
  #assertPasswordCurrent(user, path) {
    if (user.must_change && path !== '/api/auth/password' && path !== '/api/auth/logout') { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
  }
  async #postLogin(request, policy) {
    const value = await body(request); fields(value, ['account', 'password']); const name = account(value.account);
    const source = await mac(`source:${request.headers.get('X-Editor-Source')}`, policy.secret); this.rate(name, source, policy);
    const user = this.one('SELECT * FROM users WHERE account=?', name);
    // Equal-cost verification on unknown accounts; disabled state does not skip the KDF.
    const encoded = user?.password_hash ?? this.one("SELECT password_hash FROM users WHERE account='tianyi'").password_hash;
    const matches = passwordMatches(value.password, encoded);
    if (!user || !matches || user.disabled) { fail(401, 'INVALID_LOGIN'); }
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy);
    const old = await this.replay(op, policy); if (old) { this.principal(await sha(old.token)); return response(old.body, 200, old.token); }
    const s = await this.sessionData(user, policy), result = { body: { user: dto(user), csrf: s.csrf }, token: s.token };
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => {
      if (!this.canCommit(op)) { return false; }
      const current = this.one('SELECT * FROM users WHERE id=?', user.id); if (current.epoch !== user.epoch || current.disabled) { fail(401, 'SESSION_INVALID'); }
      this.insertSession(s, current); this.remember(op, sealed, policy); return true;
    });
    const chosen = committed ? result : await this.replay(op, policy); this.principal(await sha(chosen.token)); return response(chosen.body, 200, chosen.token);
  }
  async #getTrialRoutes(rt) {
    const { method, path } = rt;
    if (method === 'GET' && path === '/api/trial/wait') {
      const { url, tokenHash, policy } = rt;
      if (url.search) { fail(422, 'TRIAL_QUERY'); }
      this.touch(tokenHash, policy);
      return new Response(TRIAL_WAIT_PAGE, { headers: { ...trialHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (method === 'GET' && path === '/api/trial/web/') {
      const { url, tokenHash, policy } = rt;
      this.touch(tokenHash, policy);
      const trialId = url.searchParams.get('trial');
      if ([...url.searchParams.keys()].join(',') !== 'trial' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(trialId ?? '')) { fail(422, 'TRIAL_QUERY'); }
      return new Response(trialAppPage, { headers: { ...trialHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (method === 'GET' && path.startsWith('/api/trial/web/')) { return this.#getTrialWebFile(rt); }
    return null;
  }
  async #getTrialWebFile(rt) {
    const { url, path, tokenHash, policy } = rt;
    // core/assets.js imageBust appends ?v=original-sprites-1 to the four battle sprite
    // images; trial responses are no-store so the bust is inert here. Allow exactly that
    // one known value and keep the strict no-query gate for everything else.
    if (url.search && !([...url.searchParams.keys()].join(',') === 'v' && url.searchParams.get('v') === 'original-sprites-1')) { fail(422, 'TRIAL_QUERY'); }
    this.touch(tokenHash, policy);
    const rel = path.slice('/api/trial/web/'.length);
    if (!/^[A-Za-z0-9_][A-Za-z0-9_/.-]{0,255}$/.test(rel) || rel.includes('..') || rel.includes('\\') || rel.endsWith('/')) { fail(404, 'TRIAL_WEB_PATH'); }
    const bundled = trialWebFiles.get(rel);
    if (bundled) { return new Response(bundled.text, { headers: { ...trialHeaders, 'Content-Type': `${trialWebType(rel)}; charset=utf-8`, 'X-Content-SHA256': bundled.sha256 } }); }
    if (!this.installedSources || !this.availableLibrary) { fail(503, 'TRIAL_WEB_NOT_CONFIGURED'); }
    const bytes = await this.trialRegistryBytes(rel.startsWith('content/builtin/compiled/') ? this.installedSources : this.availableLibrary, rel);
    return new Response(bytes, { headers: { ...trialHeaders, 'Content-Type': trialWebType(rel), 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') } });
  }
  async #getAdminAccounts(rt) {
    const { tokenHash, policy, user } = rt;
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    this.touch(tokenHash, policy); return response({ accounts: this.sql.exec('SELECT * FROM users ORDER BY account').toArray().map(dto) });
  }
  async #getManagementCopy(rt) {
    const { method, url, tokenHash, managementQuery, copyPath } = rt;
    if (method === 'GET' && managementQuery) { if (url.search) { fail(422, 'MANAGEMENT_QUERY'); } return response(this.management.query(tokenHash, managementQuery[1], managementQuery[2])); }
    if (method === 'GET' && copyPath && !copyPath[2]) { this.copyAccess(tokenHash); return response(this.adminCopies.query(tokenHash, copyPath[1])); }
    return null;
  }
  async #getPrimaryRoutes(rt) {
    const { method, path, tokenHash, policy, user, csrf } = rt;
    if (method === 'GET' && path === '/api/session') { this.touch(tokenHash, policy); return response({ user: dto(user), csrf }); }
    if (method === 'GET' && path === '/api/admin/accounts') { return this.#getAdminAccounts(rt); }
    if (method === 'GET' && path === '/api/games') { return response({ games: this.games.listOwn(tokenHash) }); }
    if (method === 'GET' && path === '/api/admin/games') { return response({ games: this.games.managementSummaries(tokenHash) }); }
    if (method === 'GET' && path === '/api/admin/source') { return this.#getAdminSource(rt); }
    if (method === 'GET' && path === '/api/admin/library') { return this.#getAdminLibrary(rt); }
    return (await this.#getManagementCopy(rt)) ?? null;
  }
  async #getAdminSource(rt) {
    const { tokenHash } = rt;
    this.copyAccess(tokenHash); let staged = null;
    if (this.env.EDITOR_INSTALLED_SOURCE_ROOT) { try { staged = JSON.parse(this.env.EDITOR_INSTALLED_SOURCE_ROOT); } catch { fail(503, 'SOURCE_BOOTSTRAP_CONFIG'); } }
    let registered = null; try { registered = this.installedSources.status(tokenHash, this.installedSources.definition().registryId); } catch (error) { if (!(error instanceof HttpError) || error.code !== 'SOURCE_NOT_REGISTERED') { throw error; } }
    return response({ definition: this.installedSources.definition(), staged, registered });
  }
  async #getAdminLibrary(rt) {
    const { url, tokenHash } = rt;
    this.copyAccess(tokenHash); if (url.search) { fail(422, 'LIBRARY_QUERY'); }
    let staged = null; if (this.env.EDITOR_AVAILABLE_LIBRARY_ROOT) { try { staged = JSON.parse(this.env.EDITOR_AVAILABLE_LIBRARY_ROOT); } catch { fail(503, 'LIBRARY_BOOTSTRAP_CONFIG'); } }
    let registered = null; try { registered = this.availableLibrary.status(tokenHash, this.availableLibrary.definition().registryId); } catch (error) { if (!(error instanceof HttpError) || error.code !== 'SOURCE_NOT_REGISTERED') { throw error; } }
    return response({ definition: this.availableLibrary.definition(), mode: 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE', unresolvedReferences: 20, staged, registered });
  }
  async #getCollectionRoutes(rt) {
    const { method, stageAssetsPath, libraryPath, stagePath } = rt;
    if (stageAssetsPath) { return this.#getStageAssets(rt); }
    if (method === 'GET' && libraryPath) { return this.#getLibraryAsset(rt); }
    if (method === 'GET' && stagePath) { return this.#getStageRead(rt); }
    return null;
  }
  #checkStageCollectionQuery(url, gameId) {
    if (gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(gameId)) { fail(422, 'GAME_ID'); }
    const purposes = ['data', 'images', 'fallback-spring', 'fallback-summer', 'fallback-autumn', 'fallback-winter'];
    const names = [...url.searchParams.keys()], expected = ['revision', ...purposes];
    if (names.length !== expected.length || new Set(names).size !== expected.length || names.some(name => !expected.includes(name))) { fail(422, 'STAGE_COLLECTION_QUERY'); }
    const draftRevision = url.searchParams.get('revision');
    if (!/^[1-9][0-9]{0,63}$/.test(draftRevision)) { fail(422, 'DRAFT_REVISION'); }
    const operations = Object.fromEntries(purposes.map(purpose => [purpose, url.searchParams.get(purpose)]));
    if (new Set(Object.values(operations)).size !== purposes.length || Object.values(operations).some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))) { fail(422, 'STAGE_COLLECTION_OPERATION'); }
    return { draftRevision, operations };
  }
  async #getStageAssets(rt) {
    const { method, url, tokenHash, stageAssetsPath } = rt;
    if (method !== 'GET') { fail(404, 'NOT_FOUND'); }
    const actor = this.principal(tokenHash);
    if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
    if (actor.role !== 'admin') { fail(403, 'FIXED_LIBRARY_ADMIN_REQUIRED'); }
    const gameId = stageAssetsPath[1];
    const { draftRevision, operations } = this.#checkStageCollectionQuery(url, gameId);
    if (!this.stageApi || !this.libraryAssets) { fail(503, 'STAGE_COLLECTION_NOT_CONFIGURED'); }
    let result;
    try { result = await collectFixedStageAssets(tokenHash, { gameId, draftRevision, operations }, { games: this.games, stageApi: this.stageApi, libraryAssets: this.libraryAssets }); }
    catch (error) {
      if (error instanceof TypeError && error.message === 'STAGE_COLLECTION_READY') { fail(409, 'JOB_NOT_READY'); }
      if (error instanceof TypeError && error.message === 'STAGE_COLLECTION_REVISION') { fail(409, 'JOB_SNAPSHOT_CHANGED'); }
      throw error;
    }
    result.assertCurrent();
    const reply = response({ plan: result.plan, admission: result.admission, runtimeAllowed: false, trialAllowed: false, releaseAllowed: false, deleteAllowed: false });
    // Serialization is synchronous; recheck the ORIGINAL captured services and
    // actual Root session, never mint a read capability from the JSON response.
    result.assertCurrent(); const current = this.principal(tokenHash);
    if (current.id !== actor.id || current.epoch !== actor.epoch || current.role !== actor.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
    return reply;
  }
  async #getLibraryAsset(rt) {
    const { url, tokenHash, user, libraryPath } = rt;
    if ([...url.searchParams.keys()].join(',') !== 'revision') { fail(422, 'DRAFT_REVISION'); }
    const result = await this.libraryAssets.read(tokenHash, libraryPath, url.searchParams.get('revision'));
    result.assertCurrent();
    if (result.artifact) {
      const ref = this.games.snapshotReference(tokenHash, result.artifact.gameId, result.artifact.draftRevision);
      result.assertCurrent(); const current = this.principal(tokenHash);
      if (current.id !== user.id || current.epoch !== user.epoch || current.role !== user.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
      return new Response(result.artifact.bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${result.artifact.assetId}.bin"`, 'X-Content-SHA256': result.artifact.sha256, 'X-Game-ID': ref.gameId, 'X-Draft-Revision': ref.draftRevision, 'X-Source-SHA256': ref.sourceDigest, 'X-Dependency-SHA256': ref.dependencyDigest, 'X-Library-Root': result.artifact.catalogRoot, 'X-Content-Admission': result.artifact.admission } });
    }
    return response(result.body);
  }
  async #getStageRead(rt) {
    const { url, tokenHash, user, stagePath } = rt;
    if (url.search) { fail(422, 'STAGE_QUERY'); }
    const result = await this.stageApi.read(tokenHash, stagePath);
    this.stageApi.assertCurrent(tokenHash, stagePath, result);
    if (result.artifact) {
      const job = this.stageApi.assertCurrent(tokenHash, stagePath, result);
      const ref = this.games.snapshotReference(tokenHash, job.gameId, job.draftRevision);
      this.stageApi.assertCurrent(tokenHash, stagePath, result); const current = this.principal(tokenHash);
      if (current.id !== user.id || current.epoch !== user.epoch || current.role !== user.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
      return new Response(result.artifact.bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${result.artifact.assetId}"`, 'X-Content-SHA256': result.artifact.sha256, 'X-Game-ID': ref.gameId, 'X-Draft-Revision': ref.draftRevision, 'X-Source-SHA256': ref.sourceDigest, 'X-Dependency-SHA256': ref.dependencyDigest, 'X-Content-Admission': 'stage-only' } });
    }
    return response(result.body);
  }
  async #getDraftRead(rt) {
    const { url, tokenHash, draftPath } = rt;
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    if (!draftPath[2]) { if ([...url.searchParams.keys()].join(',') !== 'revision') { fail(422, 'DRAFT_REVISION'); } return response(await this.privateDrafts.read(tokenHash, draftPath[1], url.searchParams.get('revision'))); }
    if (draftPath[3]) { return response(this.privateDrafts.query(tokenHash, draftPath[1], draftPath[3])); }
    return null;
  }
  async #getTrialStatusPack(rt) {
    const { method, url, tokenHash, policy, trialPath } = rt;
    if (method === 'GET' && trialPath?.[2] === 'status') { if (!this.trialSessions) { fail(503, 'TRIAL_NOT_CONFIGURED'); } if (url.search) { fail(422, 'TRIAL_QUERY'); } this.touch(tokenHash, policy); return response(this.trialSessions.status(tokenHash, trialPath[1])); }
    if (method === 'GET' && trialPath?.[2] === 'pack') { if (!this.trialSessions) { fail(503, 'TRIAL_NOT_CONFIGURED'); } if (url.search) { fail(422, 'TRIAL_QUERY'); } this.touch(tokenHash, policy); return response(this.trialSessions.pack(tokenHash, trialPath[1])); }
    return null;
  }
  async #getRecordRoutes(rt) {
    const { method, draftPath, trialAssetPath } = rt;
    if (method === 'GET' && draftPath) { return this.#getDraftRead(rt); }
    const statusPack = await this.#getTrialStatusPack(rt);
    if (statusPack) { return statusPack; }
    if (method === 'GET' && trialAssetPath) { return this.#getTrialAsset(rt); }
    return null;
  }
  async #getTrialAsset(rt) {
    const { url, tokenHash, policy, trialAssetPath } = rt;
    if (!this.trialSessions) { fail(503, 'TRIAL_NOT_CONFIGURED'); }
    if (url.search) { fail(422, 'TRIAL_QUERY'); }
    this.touch(tokenHash, policy);
    const served = this.trialSessions.asset(tokenHash, trialAssetPath[1], trialAssetPath[2]);
    const assetName = trialAssetPath[2];
    let type = 'application/octet-stream';
    if (assetName === 'roadGraph' || assetName === 'roadOffset') { type = 'application/json'; }
    else if (assetName.startsWith('minimap')) { type = 'image/png'; }
    return new Response(served.bytes, { headers: { ...headers, 'Content-Type': type, 'X-Content-SHA256': served.sha256 } });
  }
  async #postManagement(rt) {
    const { request, tokenHash, user, policy, url, value, managementPath } = rt;
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    if (url.search) { fail(422, 'MANAGEMENT_QUERY'); }
    fields(value, managementPath[2] === 'listing' ? ['action'] : []);
    if (managementPath[2] === 'listing' && value.action !== 'unlist') { fail(422, 'MANAGEMENT_ACTION'); }
    const expected = /^"([1-9][0-9]*)"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected || expected[1].length > 8192) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], user.id, user.epoch, policy);
    return response(this.management.apply(tokenHash, op, { gameId: managementPath[1], action: managementPath[2] === 'listing' ? 'unlist' : 'clear-restriction', expectedRowRevision: expected[1] }));
  }
  async #postDraftSave(rt) {
    const { request, tokenHash, user, policy, value, draftPath } = rt;
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'draft');
    const expected = /^"([1-9][0-9]{0,63})"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], user.id, user.epoch, policy);
    return response(await this.privateDrafts.save(tokenHash, draftPath[1], expected[1], op.key, op.digest, value));
  }
  async #postLibraryInstall(rt) {
    const { tokenHash, url, value, request, user } = rt;
    this.copyAccess(tokenHash); if (url.search) { fail(422, 'LIBRARY_QUERY'); } fields(value, []); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'source');
    let staged; try { staged = JSON.parse(this.env.EDITOR_AVAILABLE_LIBRARY_ROOT); } catch { fail(503, 'LIBRARY_NOT_STAGED'); }
    fields(staged, ['registryId', 'root']);
    return response({ ...(await this.availableLibrary.install(tokenHash, staged.registryId, staged.root, request.headers.get('Idempotency-Key'))), mode: 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE', unresolvedReferences: 20 });
  }
  async #postEntryRoutes(rt) {
    const { request, tokenHash, user, policy, url, path, value, managementPath, stagePath, copyPath, draftPath } = rt;
    if (managementPath) { return this.#postManagement(rt); }
    if (stagePath) {
      if (url.search) { fail(422, 'STAGE_QUERY'); }
      const result = await this.stageApi.write(tokenHash, stagePath, value, request.headers.get('Idempotency-Key'), request.headers.get('If-Match')); this.stageApi.assertCurrent(tokenHash, stagePath, result); return response(result, stagePath.id ? 200 : 202);
    }
    if (path === '/api/admin/source/install') {
      this.copyAccess(tokenHash); fields(value, []); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'source');
      let staged; try { staged = JSON.parse(this.env.EDITOR_INSTALLED_SOURCE_ROOT); } catch { fail(503, 'SOURCE_NOT_STAGED'); }
      fields(staged, ['registryId', 'root']);
      return response(await this.installedSources.install(tokenHash, staged.registryId, staged.root, request.headers.get('Idempotency-Key')));
    }
    if (path === '/api/admin/library/install') { return this.#postLibraryInstall(rt); }
    if (path === '/api/admin/copies') {
      this.copyAccess(tokenHash); fields(value, ['registryId', 'name', 'introduction']); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'copy');
      return response(this.adminCopies.reserve(tokenHash, request.headers.get('Idempotency-Key'), value), 202);
    }
    if (copyPath?.[2]) { return this.copyCommand(request, tokenHash, user, policy, value, copyPath[1], copyPath[2]); }
    if (draftPath?.[2] === 'save') { return this.#postDraftSave(rt); }
    return null;
  }
  async #postTrialStart(rt) {
    const { request, tokenHash, user, policy, url, value, trialStartPath } = rt;
    if (!this.trialSessions) { fail(503, 'TRIAL_NOT_CONFIGURED'); }
    if (url.search) { fail(422, 'TRIAL_QUERY'); }
    fields(value, ['expectedRevision', 'chapterId']);
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy), old = await this.replay(op, policy);
    if (old) { return response(old.body, 200); }
    const issued = await this.trialSessions.issue(tokenHash, trialStartPath[1], value.expectedRevision, value.chapterId);
    let result = { body: issued.trial };
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => { if (!this.canCommit(op)) { return false; } const current = this.principal(tokenHash); if (current.epoch !== user.epoch) { fail(401, 'SESSION_INVALID'); } this.trialSessions.commit(tokenHash, result.body, issued.derived); this.touch(tokenHash, policy); this.remember(op, sealed, policy); return true; });
    if (!committed) { const replayed = await this.replay(op, policy); result = { body: replayed.body }; }
    return response(result.body, 200);
  }
  async #postTrialEnd(rt) {
    const { request, tokenHash, user, policy, url, value, trialPath } = rt;
    if (!this.trialSessions) { fail(503, 'TRIAL_NOT_CONFIGURED'); }
    if (url.search) { fail(422, 'TRIAL_QUERY'); }
    fields(value, []);
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy), old = await this.replay(op, policy);
    if (old) { return response(old.body, 200); }
    let result = { body: this.trialSessions.endPreview(tokenHash, trialPath[1]) };
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => { if (!this.canCommit(op)) { return false; } const current = this.principal(tokenHash); if (current.epoch !== user.epoch) { fail(401, 'SESSION_INVALID'); } result = { body: this.trialSessions.endCommit(tokenHash, trialPath[1], result.body) }; this.touch(tokenHash, policy); this.remember(op, sealed, policy); return true; });
    if (!committed) { const replayed = await this.replay(op, policy); result = { body: replayed.body }; }
    return response(result.body, 200);
  }
  async #buildPasswordMutation(user, value, policy) {
    fields(value, ['oldPassword', 'newPassword']); password(value.newPassword);
    if (value.newPassword === value.oldPassword || value.newPassword === policy.defaultPassword) { fail(422, 'NEW_PASSWORD_REQUIRED'); }
    if (!passwordMatches(value.oldPassword, user.password_hash)) { fail(401, 'INVALID_PASSWORD'); }
    const encoded = passwordHash(value.newPassword), changed = { ...user, must_change: 0, epoch: user.epoch + 1, version: user.version + 1 }, s = await this.sessionData(changed, policy);
    const mutation = () => { this.sql.exec('UPDATE users SET password_hash=?,must_change=0,epoch=epoch+1,version=version+1 WHERE id=?', encoded, user.id); this.sql.exec('DELETE FROM sessions WHERE user_id=?', user.id); this.insertSession(s, changed); };
    return { mutation, result: { body: { user: dto(changed), csrf: s.csrf }, token: s.token }, operationEpoch: changed.epoch };
  }
  #buildAccountMutation(user, match, value, policy) {
    fields(value, match[2] === 'disable' ? ['expectedVersion', 'disabled'] : ['expectedVersion']);
    if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) { fail(422, 'ACCOUNT_VERSION'); }
    if (match[2] === 'disable' && typeof value.disabled !== 'boolean') { fail(422, 'DISABLED_BOOLEAN'); }
    const target = this.one('SELECT * FROM users WHERE id=?', match[1]); if (!target) { fail(404, 'ACCOUNT_NOT_FOUND'); }
    if (target.account === 'tianyi') { fail(403, 'ADMIN_PROTECTED'); } if (target.version !== value.expectedVersion) { fail(409, 'ACCOUNT_CHANGED'); }
    const encoded = match[2] === 'reset' ? passwordHash(policy.defaultPassword) : target.password_hash;
    const changed = { ...target, disabled: match[2] === 'disable' ? Number(value.disabled) : target.disabled, must_change: match[2] === 'reset' ? 1 : target.must_change, epoch: target.epoch + 1, version: target.version + 1 };
    const mutation = () => { const current = this.one('SELECT version FROM users WHERE id=?', target.id); if (current.version !== value.expectedVersion) { fail(409, 'ACCOUNT_CHANGED'); } this.sql.exec('UPDATE users SET password_hash=?,disabled=?,must_change=?,epoch=?,version=? WHERE id=?', encoded, changed.disabled, changed.must_change, changed.epoch, changed.version, changed.id); this.sql.exec('DELETE FROM sessions WHERE user_id=?', target.id); };
    return { mutation, result: { body: { account: dto(changed) } }, operationEpoch: user.epoch };
  }
  async #postAuthMutation(rt) {
    const { request, tokenHash, user, policy, path, value } = rt;
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy), old = await this.replay(op, policy);
    if (old) { return response(old.body, 200, old.token); }
    let mutation, result, operationEpoch = user.epoch;
    if (path === '/api/auth/logout') {
      fields(value, []); mutation = () => this.sql.exec('DELETE FROM sessions WHERE token_hash=?', tokenHash); result = { body: { loggedOut: true }, token: '' };
    } else if (path === '/api/auth/password') {
      const built = await this.#buildPasswordMutation(user, value, policy);
      mutation = built.mutation; result = built.result; operationEpoch = built.operationEpoch;
    } else if (path === '/api/admin/accounts') {
      if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); } fields(value, ['account']); const name = account(value.account);
      const created = { id: crypto.randomUUID(), account: name, role: 'author', disabled: 0, must_change: 1, epoch: 1, version: 1 }, encoded = passwordHash(policy.defaultPassword);
      mutation = () => { if (this.one('SELECT id FROM users WHERE account=?', name)) { fail(409, 'ACCOUNT_EXISTS'); } this.sql.exec("INSERT INTO users VALUES(?,?,'author',?,0,1,1,1)", created.id, name, encoded); };
      result = { body: { account: dto(created) } };
    } else {
      const match = /^\/api\/admin\/accounts\/([a-f0-9-]{36})\/(disable|reset)$/.exec(path);
      if (!match) { fail(404, 'NOT_FOUND'); } if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
      const built = this.#buildAccountMutation(user, match, value, policy);
      mutation = built.mutation; result = built.result; operationEpoch = built.operationEpoch;
    }
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => { if (!this.canCommit(op)) { return false; } const current = this.principal(tokenHash); if (current.epoch !== user.epoch) { fail(401, 'SESSION_INVALID'); } mutation(); this.touch(tokenHash, policy); this.remember({ ...op, epoch: operationEpoch }, sealed, policy); return true; });
    if (!committed) { result = await this.replay({ ...op, epoch: operationEpoch }, policy); }
    return response(result.body, 200, result.token);
  }
  async handle(request) {
    const policy = config(this.env), url = requestURL(request), path = url.pathname, method = request.method;
    const gate = this.#gateEntry(request, policy, url, method, path);
    if (gate) { return gate; }
    this.seed(policy);
    if (method === 'POST' && path === '/api/auth/login') { return this.#postLogin(request, policy); }
    const token = cookie(request), tokenHash = await sha(token), user = this.principal(tokenHash), csrf = await mac(`csrf:${token}`, policy.secret);
    this.#assertPasswordCurrent(user, path);
    const managementQuery = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/management-operations\/([A-Za-z0-9_-]{16,128})$/.exec(path);
    const managementPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/(listing|restriction\/clear)$/.exec(path);
    const copyPath = /^\/api\/admin\/copies\/([A-Za-z0-9_-]{16,128})(?:\/(run|cancel))?$/.exec(path);
    const stageAssetsPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/stage-assets$/.exec(path);
    const libraryPath = this.libraryAssets?.match(path);
    const stagePath = this.stageApi?.match(path);
    const trialStartPath = /^\/api\/games\/([a-f0-9-]{36})\/trials$/.exec(path);
    const trialPath = /^\/api\/trials\/([a-f0-9-]{36})(?:\/(status|end|pack))?$/.exec(path);
    const trialAssetPath = /^\/api\/trials\/([a-f0-9-]{36})\/assets\/([A-Za-z]{1,32})$/.exec(path);
    const draftPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/draft(?:\/(save|operations\/([A-Za-z0-9_-]{16,128})))?$/.exec(path);
    const rt = { request, policy, url, path, method, tokenHash, user, csrf, managementQuery, managementPath, copyPath, stageAssetsPath, libraryPath, stagePath, trialStartPath, trialPath, trialAssetPath, draftPath };
    if (method === 'GET') {
      const hit = (await this.#getTrialRoutes(rt)) ?? (await this.#getPrimaryRoutes(rt)) ?? (await this.#getCollectionRoutes(rt)) ?? (await this.#getRecordRoutes(rt));
      if (hit) { return hit; }
      fail(404, 'NOT_FOUND');
    }
    if (method !== 'POST') { fail(404, 'NOT_FOUND'); }
    if (!equal(request.headers.get('X-CSRF-Token'), csrf)) { fail(403, 'CSRF_REJECTED'); }
    const value = await body(request);
    return (await this.#postEntryRoutes({ ...rt, value })) ?? (await this.#postTrialStart({ ...rt, value })) ?? (await this.#postTrialEnd({ ...rt, value })) ?? (await this.#postAuthMutation({ ...rt, value }));
  }
  #checkContentKeyNamespaces(actor, key, namespace) {
    for (const [table, kind, actorColumn] of [['operations', 'auth', 'actor'], ['source_operations', 'source', 'actor'], ['content_reservations', 'copy', 'actor'], ['copy_http_commands', 'command', 'actor'], ['draft_requests', 'draft', 'actor'], ['compile_operations', 'compile', 'actor_id'], ['stage_http_commands', 'stage-command', 'actor']]) {
      if (kind !== namespace && this.one(`SELECT op_key FROM ${table} WHERE ${actorColumn}=? AND op_key=?`, actor, key)) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    }
  }
  contentKey(actor, key, namespace) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    if (namespace !== 'delete' && this.one('SELECT op_key FROM content_deletion_operations WHERE actor=? AND op_key=?', actor, key)) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (!this.adminCopies) { return; }
    this.#checkContentKeyNamespaces(actor, key, namespace);
  }
  copyAccess(tokenHash) { const actor = this.principal(tokenHash); if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED');  }if (actor.role !== 'admin') { fail(403, 'FULL_COPY_ADMIN_REQUIRED');  }if (!this.installedSources || !this.adminCopies) { fail(503, 'COPY_NOT_CONFIGURED');  }return actor; }
  #recordCopyCommand(tokenHash, prior, op, target, action) {
    const actor = this.copyAccess(tokenHash); if (actor.epoch !== prior.epoch) { fail(401, 'SESSION_INVALID'); }
    this.contentKey(actor.id, op.key, 'command');
    if (action === 'run') { this.adminCopies.query(tokenHash, target); } // Run requires the captured epoch.
    else { // A newly authenticated owner may explicitly cancel stale pending work, not resume it.
      const targetRow = this.one('SELECT game_id FROM copy_requests WHERE actor=? AND op_key=?', actor.id, target);
      if (!targetRow) { fail(409, 'COPY_CHANGED'); }
      this.games.assertNotDeleting(targetRow.game_id);
    }
    const old = this.one('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?', actor.id, op.key);
    if (old && old.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (old && old.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
    if (!old) { this.sql.exec('INSERT INTO copy_http_commands VALUES(?,?,?,?)', actor.id, op.key, op.digest, actor.epoch); }
    this.commandTargets.record('copy', actor.id, op.key, target);
  }
  async #cancelCopy(tokenHash, target, expected) {
    try { return response(this.adminCopies.cancel(tokenHash, target, expected[1])); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED'); } throw error; }
  }
  async copyCommand(request, tokenHash, prior, policy, value, target, action) {
    fields(value, []); this.copyAccess(tokenHash); this.contentKey(prior.id, request.headers.get('Idempotency-Key'), 'command');
    const expected = /^"([1-9][0-9]*)"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], prior.id, prior.epoch, policy);
    this.ctx.storage.transactionSync(() => { this.#recordCopyCommand(tokenHash, prior, op, target, action); });
    const row = this.one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', prior.id, target);
    if (action === 'run' && row?.state === 'committed') { return response(this.adminCopies.query(tokenHash, target)); }
    if (action === 'cancel' && row?.state === 'canceled') { return response({ gameId: row.game_id, state: row.state, rowRevision: row.row_revision, generation: row.generation, leaseUntil: row.lease_until, registryId: row.registry_id }); }
    if (action === 'cancel') { return this.#cancelCopy(tokenHash, target, expected); }
    let cap; try { cap = this.adminCopies.claim(tokenHash, target, expected[1]); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED');  }throw error; }
    // The fixed full-source pipeline has synchronous sections: timers cannot be
    // relied upon to renew a lease inside this request. A bounded5minute lease is
    // the already-tested internal policy, not a Cloudflare execution/SLA promise.
    return response(await this.adminCopies.execute(tokenHash, cap));
  }
  async operation(request, value, actor, epoch, policy) {
    const key = request.headers.get('Idempotency-Key'); if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    const digest = await mac(JSON.stringify([request.method, requestURL(request).pathname, value]), policy.secret);
    return { actor, key, digest, epoch, aad: JSON.stringify([actor, key, digest]) };
  }
  async replay(op, policy) {
    const row = this.one('SELECT * FROM operations WHERE actor=? AND op_key=?', op.actor, op.key); if (!row) { return null; }
    if (row.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (row.epoch !== op.epoch || Date.now() >= row.expires_at) { fail(409, 'OPERATION_EXPIRED'); }
    return unseal(row.sealed_result, policy.secret, op.aad);
  }
  canCommit(op) {
    this.contentKey(op.actor, op.key, 'auth');
    const row = this.one('SELECT * FROM operations WHERE actor=? AND op_key=?', op.actor, op.key); if (!row) { return true; }
    const actor = this.one('SELECT epoch,disabled FROM users WHERE id=?', op.actor);
    if (row.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (!actor || actor.disabled || row.epoch !== actor.epoch || Date.now() >= row.expires_at) { fail(409, 'OPERATION_EXPIRED'); }
    return false; // Same operation won during an await; replay its sealed response without a second mutation.
  }
  remember(op, sealed, policy) { this.sql.exec('INSERT INTO operations VALUES(?,?,?,?,?,?)', op.actor, op.key, op.digest, sealed, op.epoch, Date.now() + policy.sessionMs); }
}
export default {
  async fetch(request, env) {
    const url = requestURL(request);
    if (request.method === 'GET' && ['/', '/client.js', '/draft.js', '/stage.js', '/library.js', '/catalog.js', '/management.js', '/stage-assets.js', '/style.css'].includes(url.pathname)) {
      const asset = staticAsset(url.pathname);
      return new Response(asset.content, { headers: { ...headers, 'Content-Type': `${asset.type}; charset=utf-8` } });
    }
    if (!url.pathname.startsWith('/api/')) { return response({ error: 'NOT_FOUND' }, 404); }
    // CF supplies this header at the ingress. Never accept caller-selected X-Editor-Source.
    // Capture bounded POST input before the DO RPC. Early authorization rejection must
    // not abandon a still-streaming RPC request and truncate the HTTP error response.
    try {
      const captured = request.method === 'POST' ? JSON.stringify(await body(request)) : undefined;
      const forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: captured });
      forwarded.headers.delete('Content-Length');
      forwarded.headers.set('X-Editor-Source', request.headers.get('CF-Connecting-IP') ?? 'local-shared');
      return await env.EDITOR_METADATA.get(env.EDITOR_METADATA.idFromName('editor-authority-v1')).fetch(forwarded);
    } catch (error) { return response({ error: error instanceof HttpError ? error.code : 'INTERNAL_ERROR' }, error instanceof HttpError ? error.status : 500); }
  }
};
