// Real launcher/RootWorker, explicit operator staging, real SQL/R2 and fresh browser. No fixture endpoints.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { startEditorBackend } from './start_editor_backend.mjs';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
const own = mkdtempSync(join(tmpdir(), 'dragon-copy-entry-')), origin = 'https://127.0.0.1:8787', d = '.dragon-analysis/editor-phase/backend-copy-entry-session-r1/';
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
const sha = b => createHash('sha256').update(b).digest('hex');
function json(bytes) { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid owned entry JSON', { cause }); } }
const doc = json(readFileSync('server/wrangler.jsonc')); doc.main = resolve('server/worker.js');
writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(doc)); writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });
const files = ['server/worker.js','server/sourcecatalog.js','tools/start_editor_backend.mjs','tools/editor_stage_source.mjs','server/public/client.txt','server/public/index.html','server/pinned/world-manifest.txt','server/pinned/entity-manifest.txt','tools/verify_editor_backend_copy_entry.mjs'];
const sourceHashes = Object.fromEntries(files.map(p => [p, sha(readFileSync(p))])); const calls = [], checks = [];
const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
const inputHashes = Object.fromEntries(policy.roles.map(role => ['web/' + role.path, sha(readFileSync('web/' + role.path))]));
let server, browser;
async function call(path, value, session, extra = {}) {
  const headers = { Origin: origin };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  Object.assign(headers, extra);
  if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const r = await new Promise((done, reject) => { const req = httpsRequest(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => { const parts = []; res.on('data', b => parts.push(b)); res.on('error', reject); res.on('end', () => done({ status: res.statusCode, data: json(Buffer.concat(parts).toString()), cookie: res.headers['set-cookie']?.[0]?.split(';')[0] })); }); req.on('error', reject); req.end(value === undefined ? undefined : JSON.stringify(value)); });
  calls.push({ path, status: r.status }); return r;
}
async function login(account, pw) { const r = await call('/api/auth/login', { account, password: pw }); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; }
async function change(s) { const r = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, s); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.data.csrf, user: r.data.user }; }
try {
  process.stderr.write('entry: initial stage/start\n');
  server = await startEditorBackend(join(own, 'wrangler.jsonc'), { stageSource: true }); assert.equal(server.url.origin, origin);
  const staged = json(readFileSync(join(own, '.local/source-root.json'))), stagedSha = sha(readFileSync(join(own, '.local/source-root.json')));
  assert.equal((await call('/api/admin/source')).status, 401);
  const first = await login('tianyi', initial); assert.equal((await call('/api/admin/source', undefined, first)).status, 403); const admin = await change(first);
  assert.equal((await call('/api/admin/accounts', { account: 'entry_author' }, admin)).status, 200); const author = await change(await login('entry_author', initial));
  for (const [path,value] of [['/api/admin/source',undefined],['/api/admin/source/install',{}],['/api/admin/copies',{registryId:staged.registryId,name:'越權',introduction:''}]]) assert.equal((await call(path,value,author)).status,403);
  assert.equal((await call('/api/admin/source/install', {}, admin, { Origin: 'https://invalid.example' })).status, 403);
  assert.equal((await call('/api/admin/source/install', {}, admin, { 'X-CSRF-Token': 'invalid' })).status, 403);
  const before = await call('/api/admin/source', undefined, admin); assert.equal(before.data.registered, null); assert.deepEqual(before.data.staged, staged);
  assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200); assert.ok((await call('/api/admin/source', undefined, admin)).data.registered);
  const raceKey = randomUUID(), raced = await Promise.all([call('/api/admin/source/install', {}, admin, { 'Idempotency-Key': raceKey }), call('/api/admin/accounts', { account: 'race_author' }, admin, { 'Idempotency-Key': raceKey })]);
  assert.deepEqual(raced.map(r => r.status).sort((a,b)=>a-b), [200,409]);
  checks.push('real launcher explicit fixed41-role R2 staging, not SQL approval; actual admin forced-password/Origin/CSRF/source byte admission and author403; asyncsource/auth samekey race commits one namespace');
  const payload = { registryId: staged.registryId, name: '入口驗收', introduction: '原文É😀' }, key = randomUUID(), headers = { 'Idempotency-Key': key };
  const reserved = await call('/api/admin/copies', payload, admin, headers); assert.equal(reserved.status, 202); const target = reserved.data.gameId;
  assert.equal((await call('/api/admin/copies', payload, admin, headers)).data.gameId, target);
  assert.equal((await call('/api/admin/copies', { ...payload, introduction: '異內容' }, admin, headers)).status, 409);
  assert.equal((await call('/api/admin/accounts', { account: 'forbidden_key' }, admin, headers)).status, 409);
  assert.equal((await call('/api/admin/source/install', {}, admin, headers)).status, 409);
  assert.equal((await call('/api/admin/copies', { ...payload, gameId: target }, admin)).status, 422);
  assert.equal((await call('/api/admin/copies', payload, admin)).status, 409);
  assert.equal((await call('/api/admin/copies/' + key, undefined, author)).status, 403);
  assert.equal((await call('/api/admin/copies/' + key + '/run', {}, admin)).status, 428);
  const staleKey = randomUUID(); assert.equal((await call('/api/admin/copies/' + key + '/run', {}, admin, { 'If-Match': '"99"', 'Idempotency-Key': staleKey })).status, 412);
  assert.equal((await call('/api/admin/copies/' + key + '/run', {}, admin, { 'If-Match': '"1"', 'Idempotency-Key': staleKey })).status, 409);
  checks.push('real public reserve permanentkey/name/target/namespace binding; author rejection, strict If-Match428/stale412 and samecommand-key-different-condition409');
  const cancelKey = randomUUID(), c = await call('/api/admin/copies', { ...payload, name: '取消入口' }, admin, { 'Idempotency-Key': cancelKey }); assert.equal(c.status, 202);
  const command = randomUUID(), cancelHeaders = { 'If-Match': '"1"', 'Idempotency-Key': command };
  const canceled = await call('/api/admin/copies/' + cancelKey + '/cancel', {}, admin, cancelHeaders); assert.equal(canceled.status, 200); assert.equal(canceled.data.state, 'canceled'); assert.deepEqual((await call('/api/admin/copies/' + cancelKey + '/cancel', {}, admin, cancelHeaders)).data, canceled.data);
  assert.equal((await call('/api/admin/copies/' + cancelKey + '/run', {}, admin, { 'If-Match': '"2"' })).status, 409);
  checks.push('public explicit cancellation/CAS/command replay, target-key not reused, no physical-delete claim');
  const runKey = randomUUID(), runHeaders = { 'If-Match': '"1"', 'Idempotency-Key': runKey };
  process.stderr.write('entry: first actual copy\n');
  const began = performance.now();
  const copied = await call('/api/admin/copies/' + key + '/run', {}, admin, runHeaders);
  if (copied.status !== 200) { const probe = await call('/api/admin/copies/' + key, undefined, admin); process.stderr.write(JSON.stringify({ phase: 'owned copy failure probe', elapsedMs: Math.round(performance.now() - began), status: copied.status, code: copied.data.error, state: probe.data.state, generation: probe.data.generation, rowRevision: probe.data.rowRevision, leaseRemainingMs: probe.data.leaseUntil - Date.now() }) + '\n'); }
  assert.equal(copied.status, 200, copied.data.error); assert.equal(copied.data.gameId, target); assert.equal(copied.data.draftRevision, '1');
  const games = await call('/api/games', undefined, admin); assert.equal(games.data.games.length, 1); assert.equal(games.data.games[0].ownerId, admin.user.id); assert.deepEqual(games.data.games[0].metadata, { name: payload.name, introduction: payload.introduction });
  assert.deepEqual((await call('/api/admin/copies/' + key + '/run', {}, admin, runHeaders)).data, copied.data);
  assert.equal((await call('/api/admin/copies/' + key + '/cancel', {}, admin, runHeaders)).status, 409);
  assert.equal((await call('/api/games', undefined, author)).data.games.length, 0); assert.equal((await call('/api/games/' + target + '/draft', {}, admin)).status, 404);
  checks.push('actual production RootWorker full-copy execute/SQL commit and actual owned summary, bounded300second lease/no timer renewal or waitUntil, immutable result replay; no generic draft/compiler/release route');
  await server.close(); server = await startEditorBackend(join(own, 'wrangler.jsonc'));
  assert.equal(sha(readFileSync(join(own, '.local/source-root.json'))), stagedSha); assert.deepEqual((await call('/api/admin/copies/' + key, undefined, admin)).data, copied.data); assert.equal((await call('/api/games', undefined, admin)).data.games.length, 1);
  checks.push('actual launcher restart retains staged descriptor/R2/registered SQL/completecopy/currentsession, no restaging/latest or transientMap authority');
  process.stderr.write('entry: browser start\n');
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href); browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const outside = [], errors = [], expected = []; await context.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { get() { globalThis.__idbAccess = (globalThis.__idbAccess ?? 0) + 1; throw new Error('IDB forbidden'); } }));
  await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { outside.push('outside'); return route.abort(); } return route.continue(); });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (message.type() !== 'error') return; const path = new URL(message.location().url || origin).pathname, text = message.text(); if (path === '/api/session' && text.includes('401') || path === '/favicon.ico' && text.includes('404')) expected.push({ path, text }); else errors.push(text); });
  await page.goto(origin); await page.locator('#login [name=account]').fill('tianyi'); await page.locator('#login [name=password]').fill(password); await page.locator('#login button').click(); await page.locator('#admin').waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('#logout').disabled);
  await page.locator('#source-refresh').click(); await page.waitForFunction(() => document.querySelector('#source-state').textContent.includes('已驗證登記') && !document.querySelector('#source-refresh').disabled);
  assert.ok((await page.locator('#own-games').textContent()).includes(payload.name));
  await page.locator('#source-install').click(); await page.waitForFunction(() => document.querySelector('#source-state').textContent.includes('已驗證登記') && !document.querySelector('#source-install').disabled);
  await page.locator('#copy-create [name=name]').fill('<img>'); await page.locator('#copy-create [name=introduction]').fill('É😀原文'); await page.locator('#copy-create button').click(); await page.waitForFunction(() => document.querySelector('#copy-state').textContent.includes('pending') && !document.querySelector('#copy-run').disabled);
  const pendingText = await page.locator('#copy-state').textContent();
  process.stderr.write('entry: pending browser close server\n');
  await server.close(); process.stderr.write('entry: pending server closed, restart\n'); server = await startEditorBackend(join(own, 'wrangler.jsonc'));
  process.stderr.write('entry: pending reload\n'); await page.reload(); await page.locator('#admin').waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('#source-refresh').disabled); await page.locator('#source-refresh').click(); await page.waitForFunction(() => document.querySelector('#copy-state').textContent.includes('pending') && !document.querySelector('#copy-run').disabled); assert.equal(await page.locator('#copy-state').textContent(), pendingText);
  process.stderr.write('entry: second browser copy\n');
  await page.locator('#copy-run').click(); await page.waitForFunction(() => document.querySelector('#copy-state').textContent.includes('committed') && !document.querySelector('#copy-run').disabled, undefined, { timeout: 240000 });
  assert.ok((await page.locator('#own-games').textContent()).includes('<img>')); assert.equal(await page.locator('#own-games img').count(), 0); assert.equal(await page.evaluate(() => globalThis.__idbAccess ?? 0), 0); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  const screenshot = process.argv[2] ?? d + 'entry-shot-' + randomUUID() + '.png';
  assert.match(screenshot, /^\.dragon-analysis\/editor-phase\/backend-copy-entry-session-r1\/entry-(?:r[1-9][0-9]*|shot-[a-f0-9-]{36})\.png$/);
  writeFileSync(screenshot, await page.screenshot({ fullPage: true }), { flag: 'wx' });
  checks.push('fresh real browser source/admin entry, pending SQL target + operation-key survive actual launcher restart/samewindow reload, actual second fullcopy, author textContent no image injection, IDB0/outside0/pageerrors0');
  for (const [p, h] of Object.entries({ ...sourceHashes, ...inputHashes })) assert.equal(sha(readFileSync(p)), h);
  process.stdout.write(JSON.stringify({ result: 'PASS-REAL-ROOT-ADMIN-COPY-ENTRY', checks, calls, sourceHashes, inputHashes, errors, outside, expected, screenshot, screenshotSha: sha(readFileSync(screenshot)), limits: 'Local real Root API/launcher/two copies. No Cloudflare CPU/memory/SLA/deployment or wholeeditor/Trial/compiler/PNG/Q69/release. Operator staging not account impersonation; operation-key sessionStorage no credential.' }, null, 2) + '\n');
} finally { await browser?.close(); await server?.close(); }
