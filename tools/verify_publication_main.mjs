// Owned temp data/loopback only. Actual signed HTTPS clients are intercepted in
// process; no TLS/cloud credentials, user data, or production service execution.
import assert from 'node:assert/strict';
import https from 'node:https';
import { createServer, request } from 'node:http';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, mkdirSync, existsSync, rmSync, symlinkSync, writeFileSync, linkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parsePublicationEnvironment } from '../vps/publication-config.mjs';
import { startConfiguredPublication, runPublicationCommand } from '../vps/publication-main.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { buildStaticRelease } from '../vps/static-release.mjs';
import { installedStaticHTTPS } from './fixtures/installed-static-https.mjs';
const archive = installedStaticHTTPS('test/owned-cli/');
archive.state.missingSource = true;
let installedBundle;
try { installedBundle = JSON.parse(readFileSync('server/public/trialweb.txt', 'utf8')); }
catch (cause) { throw new Error('owned test requires the installed Trial bundle', { cause }); }
const installedSource = buildStaticRelease(installedBundle.files.filter(f => f.path.startsWith('src/') && f.path.endsWith('.js')).map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }))).manifest.sourceTreeDigest;
const own = mkdtempSync(join(tmpdir(), 'dragon-publication-main-'));
const env = { EDITOR_ORIGIN: 'https://owned-editor.invalid', EDITOR_REQUEST_KEY: 'c'.repeat(64), EDITOR_DEFAULT_PASSWORD: 'Owned password only secret marker 1!', EDITOR_DATA_DIR: join(own, 'not-created'), EDITOR_LISTEN_HOST: '127.0.0.1', EDITOR_LISTEN_PORT: '8788', EDITOR_DRAIN_INTERVAL_MS: '20', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'd'.repeat(64), R2_BUCKET: 'dragon', R2_PREFIX: 'test/owned-cli/', STATIC_ORIGIN: 'https://owned-static.invalid', STATIC_PATH_PREFIX: 'release/', STATIC_RELEASE_SHA256: archive.release.sha256, STATIC_SOURCE_SHA256: installedSource };
const original = https.request; let checks = 0, calls = 0, pending, hold = false, holdArchive = false, holdRegistration = false, broken = false, outage = null, service, boot;
https.request = (url, options, callback) => {
  assert.equal(options.rejectUnauthorized, true);
  const staticRequest = url.startsWith('https://owned-static.invalid/release/');
  const archiveRequest = url.startsWith(archive.base);
  const registrationRequest = url === archive.registrationURL;
  const controlRequest = !staticRequest && !archiveRequest && !registrationRequest;
  if (controlRequest) {
    assert.equal(options.method, 'GET');
    assert.ok(archive.registrations.get(archive.registrationURL)?.equals(archive.registrationBytes));
    assert.equal(archive.objects.size, archive.files.size);
    assert.ok(archive.objects.get(archive.manifestURL).bytes.equals(archive.release.bytes));
    assert.equal(url, `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/dragon/test/owned-cli/control/current.json`);
    assert.ok(options.headers.Authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/`));
  }
  calls++;
  const req = new EventEmitter(), res = new EventEmitter();
  req.destroy = () => { req.destroyed = true; }; res.destroy = () => { res.destroyed = true; };
  req.end = (body = Buffer.alloc(0)) => {
    const deliver = () => {
      // B8：只有传输层失败才可降级；未分类的错误仍必须 start-failed。
      if (outage === 'network' && controlRequest) { req.emit('error', Object.assign(new Error('owned transport'), { code: 'ECONNRESET' })); return; }
      if (outage === 'unknown' && controlRequest) { req.emit('error', new Error('owned transport private-secret')); return; }
      let stored;
      try { stored = archive.handle(url, options, body); }
      catch (error) { req.emit('error', error); return; }
      const bytes = stored?.bytes ?? (broken && !staticRequest ? Buffer.from('{"version":2}') : Buffer.alloc(0));
      res.statusCode = stored?.status ?? (bytes.length ? 200 : 404); res.headers = stored?.headers ?? { 'content-length': String(bytes.length) };
      callback(res); if (bytes.length) res.emit('data', bytes); res.complete = true; res.emit('end');
    };
    if ((hold && controlRequest) || (holdArchive && staticRequest) || (holdRegistration && registrationRequest)) pending = deliver; else queueMicrotask(deliver);
  };
  return req;
};
syncBuiltinESMExports();
const check = () => checks++;
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'owned condition deadline'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
async function port() {
  const listener = createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const value = listener.address().port; await new Promise(resolve => listener.close(resolve)); return String(value);
}
function get(address, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, headers: { Host: 'owned-editor.invalid' } }, res => {
      const chunks = []; res.on('data', b => chunks.push(b)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('owned HTTP timeout'))); req.on('error', reject); req.end();
  });
}
try {
  const options = parsePublicationEnvironment(env);
  assert.equal(options.r2.bucket, 'dragon'); assert.equal(options.prefix, 'test/owned-cli/'); assert.equal(options.port, 8788);
  assert.ok(Object.isFrozen(options) && Object.isFrozen(options.env) && Object.isFrozen(options.r2));
  assert.equal(existsSync(env.EDITOR_DATA_DIR), false); assert.equal(calls, 0); check();
  for (const key of ['EDITOR_INSTALLED_SOURCE_ROOT', 'EDITOR_AVAILABLE_LIBRARY_ROOT']) {
    const descriptor = { registryId: 'owned-fixed-source-1', root: { sha256: 'e'.repeat(64), byteLength: 1024 } };
    const encoded = JSON.stringify(descriptor);
    const staged = parsePublicationEnvironment({ ...env, [key]: encoded });
    assert.equal(staged.env[key], encoded); assert.ok(Object.isFrozen(staged.env)); check();
    for (const invalid of ['', 'null', '[]', '{}', '{', JSON.stringify({ ...descriptor, extra: true }),
      JSON.stringify({ ...descriptor, registryId: '../escape' }),
      JSON.stringify({ ...descriptor, root: { sha256: 'E'.repeat(64), byteLength: 1 } }),
      JSON.stringify({ ...descriptor, root: { sha256: 'e'.repeat(64), byteLength: 0 } }),
      JSON.stringify({ ...descriptor, root: { sha256: 'e'.repeat(64), byteLength: 1024 * 1024 + 1 } }),
      JSON.stringify({ ...descriptor, root: { ...descriptor.root, extra: true } }), encoded + ' '.repeat(4096)]) {
      assert.throws(() => parsePublicationEnvironment({ ...env, [key]: invalid })); check();
    }
  }
  assert.equal(calls, 0); assert.equal(existsSync(env.EDITOR_DATA_DIR), false);
  for (const key of ['EDITOR_ORIGIN', 'EDITOR_REQUEST_KEY', 'EDITOR_DEFAULT_PASSWORD', 'EDITOR_DATA_DIR', 'EDITOR_LISTEN_HOST', 'EDITOR_LISTEN_PORT', 'EDITOR_DRAIN_INTERVAL_MS', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PREFIX', 'STATIC_ORIGIN', 'STATIC_RELEASE_SHA256', 'STATIC_SOURCE_SHA256']) {
    const bad = { ...env }; delete bad[key]; assert.throws(() => parsePublicationEnvironment(bad)); check();
  }
  for (const [key, value] of [['EDITOR_ORIGIN', env.EDITOR_ORIGIN + '/'], ['EDITOR_PLAY_ORIGIN', 'https://legacy.invalid'], ['EDITOR_DATA_DIR', '.'], ['EDITOR_LISTEN_HOST', 'remote.invalid'], ['EDITOR_LISTEN_PORT', '0'], ['EDITOR_LISTEN_PORT', '65536'], ['EDITOR_LISTEN_PORT', '01'], ['EDITOR_DRAIN_INTERVAL_MS', '1e3'], ['EDITOR_DRAIN_INTERVAL_MS', '2147483648'], ['EDITOR_IDLE_MS', ' 100'], ['R2_ACCOUNT_ID', 'https://bad.invalid'], ['R2_ACCESS_KEY_ID', 'x\r\nheader'], ['R2_SECRET_ACCESS_KEY', 'short'], ['R2_BUCKET', 'other'], ['R2_PREFIX', 'artifacts/'], ['STATIC_ORIGIN', 'http://owned-static.invalid'], ['STATIC_PATH_PREFIX', '../'], ['STATIC_RELEASE_SHA256', 'no'], ['STATIC_SOURCE_SHA256', 'F'.repeat(64)]]) {
    assert.throws(() => parsePublicationEnvironment({ ...env, [key]: value })); check();
  }
  assert.equal(calls, 0); assert.equal(existsSync(env.EDITOR_DATA_DIR), false);
  const visualAssets = Object.fromEntries([['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']].map(([group, stem]) => [group, Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => {
    const path = `content/builtin/compiled/owned/${stem}${season}.png`;
    return [season, { path, url: path, sha256: '0'.repeat(64), byteLength: 1 }];
  }))]));
  await assert.rejects(options.verifyStaticResources({ manifest: { visualAssets } }), /STATIC_RESOURCE_MISSING/); assert.equal(calls, 1); check();
  archive.state.missingSource = false;
  const processHost = new EventEmitter(), reports = [];
  assert.equal(await runPublicationCommand({ argv: ['--check-config'], env, processHost, report: v => reports.push(v) }), null);
  assert.deepEqual(reports, [{ event: 'configuration-valid' }]); assert.equal(processHost.listenerCount('SIGTERM'), 0);
  assert.equal(existsSync(env.EDITOR_DATA_DIR), false); assert.equal(calls, 1); check();
  for (const argv of [['--env', 'DO-NOT-READ'], ['--check-config', '--check-config']]) {
    const host = new EventEmitter(), log = [];
    await runPublicationCommand({ argv, env, processHost: host, report: v => log.push(v) });
    assert.equal(host.exitCode, 1); assert.deepEqual(log, [{ event: 'startup-failed' }]); check();
  }
  const osEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec)$/i.test(key)));
  for (const valid of [true, false]) {
    const child = spawnSync(process.execPath, ['--require', resolve('.dragon-analysis/r2-player-connection/r3/deny-network.cjs'), 'vps/publication-main.mjs', '--check-config'], { env: { ...osEnv, ...env, STATIC_ORIGIN: valid ? env.STATIC_ORIGIN : 'https://private-user:private-secret@bad.invalid' }, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, valid ? 0 : 1, child.stderr); assert.equal(child.stdout.trim(), JSON.stringify({ event: valid ? 'configuration-valid' : 'startup-failed' }));
    for (const secret of [env.EDITOR_REQUEST_KEY, env.R2_SECRET_ACCESS_KEY, env.EDITOR_DEFAULT_PASSWORD, 'private-secret']) assert.ok(!(child.stdout + child.stderr).includes(secret)); check();
  }
  await assert.rejects(startConfiguredPublication(env), /unsafe data directory/); assert.equal(existsSync(env.EDITOR_DATA_DIR), false); check();
  const actual = join(own, 'actual'); mkdirSync(actual, { mode: 0o700 });
  const linked = join(own, 'linked'); symlinkSync(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(startConfiguredPublication({ ...env, EDITOR_DATA_DIR: linked }), /unsafe data directory/); assert.equal(existsSync(join(actual, 'editor.sqlite')), false); check();
  const hardRoot = join(own, 'hard'); mkdirSync(hardRoot, { mode: 0o700 }); const source = join(own, 'owned-file'); writeFileSync(source, '', { mode: 0o600 }); linkSync(source, join(hardRoot, 'editor.sqlite'));
  await assert.rejects(startConfiguredPublication({ ...env, EDITOR_DATA_DIR: hardRoot }), /unsafe database file/); check();
  // B8：R2 不是開機條件。遠端根讀取遇到「傳輸層不可達」時降級啟動，工作台可編輯，
  // 但分發狀態仍由同一 publisher 判定（不宣稱可見性）；權威事實不符照舊 fail-closed。
  const degradedRoot = join(own, 'degraded'); mkdirSync(degradedRoot, { mode: 0o700 });
  outage = 'network'; archive.state.losePut = true; archive.state.loseRegistrationPut = true;
  service = await startConfiguredPublication({ ...env, EDITOR_DATA_DIR: degradedRoot, EDITOR_LISTEN_PORT: await port() });
  outage = null; archive.state.losePut = false; archive.state.loseRegistrationPut = false;
  assert.equal(service.status().remote, 'unreachable');
  assert.deepEqual(service.status().startup, { staticArchive: 'complete', registration: 'complete' });
  assert.equal((await get(service.address, '/api/health')).status, 200, '編輯入口仍可啟動');
  assert.equal((await get(service.address, '/play')).status, 503);
  assert.deepEqual(archive.registrations.get(archive.registrationURL), archive.registrationBytes);
  assert.deepEqual(archive.registrationEvents, ['GET', 'PUT', 'GET']); check();
  assert.equal(archive.events.filter(e => e.type === 'PUT').length, archive.files.size);
  assert.equal(archive.objects.size, archive.files.size); // Every lost PUT response recovered only by readback.
  check();
  await service.close(); service = null; check();
  // 連程式位元組歸檔都不可達：跳過歸檔／登記但照舊啟動，下一次啟動冪等重試。
  const archiveDownRoot = join(own, 'archive-down'); mkdirSync(archiveDownRoot, { mode: 0o700 });
  archive.state.unreachable = true;
  service = await startConfiguredPublication({ ...env, EDITOR_DATA_DIR: archiveDownRoot, EDITOR_LISTEN_PORT: await port() });
  archive.state.unreachable = false;
  assert.deepEqual(service.status().startup, { staticArchive: 'unreachable', registration: 'skipped' });
  assert.equal(service.status().remote, 'unreachable');
  assert.equal((await get(service.address, '/api/health')).status, 200);
  await service.close(); service = null;
  const archiveDownPuts = archive.events.filter(e => e.type === 'PUT').length;
  service = await startConfiguredPublication({ ...env, EDITOR_DATA_DIR: archiveDownRoot, EDITOR_LISTEN_PORT: await port() });
  assert.deepEqual(service.status().startup, { staticArchive: 'complete', registration: 'complete' });
  assert.equal(archive.events.filter(e => e.type === 'PUT').length, archiveDownPuts, '已完成的不可變物件不重傳');
  await service.close(); service = null; check();
  // 未分類的傳輸錯誤不是「不可達」：維持監聽前失敗，且不建立 auth schema。
  const failRoot = join(own, 'failed'); mkdirSync(failRoot, { mode: 0o700 }); const failedHost = new EventEmitter(), failedLog = [];
  outage = 'unknown';
  assert.equal(await runPublicationCommand({ argv: [], env: { ...env, EDITOR_DATA_DIR: failRoot, EDITOR_LISTEN_PORT: await port() }, processHost: failedHost, report: v => failedLog.push(v) }), null);
  outage = null;
  assert.equal(failedHost.exitCode, 1); assert.equal(failedHost.listenerCount('SIGTERM'), 0); assert.equal(failedHost.listenerCount('SIGINT'), 0);
  assert.deepEqual(failedLog, [{ event: 'startup-failed' }]);
  assert.equal(existsSync(join(failRoot, 'editor.sqlite')), true, 'unknown outage reached publisher preflight after archiving');
  const failedDB = openStorage(join(failRoot, 'editor.sqlite'));
  try { assert.equal(failedDB.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").toArray().length, 0); } finally { failedDB.close(); }
  check();
  // 已觀測到的權威事實（舊協議根）仍是 fail-closed，不因 R2 可達而放寬。
  const legacyRoot = join(own, 'legacy'); mkdirSync(legacyRoot, { mode: 0o700 });
  broken = true;
  await assert.rejects(startConfiguredPublication({ ...env, EDITOR_DATA_DIR: legacyRoot, EDITOR_LISTEN_PORT: await port() }), /DISTRIBUTION_RECOVERY_REQUIRED|REMOTE_GAP|LEGACY_PENDING/);
  broken = false; check();
  const wrongProgramRoot = join(own, 'wrong-program'); mkdirSync(wrongProgramRoot, { mode: 0o700 });
  const beforeWrongProgram = calls, wrongProgram = { ...env, EDITOR_DATA_DIR: wrongProgramRoot, STATIC_SOURCE_SHA256: '0'.repeat(64) };
  await assert.rejects(startConfiguredPublication(wrongProgram), /INSTALLED_PROGRAM_INVALID/);
  assert.equal(calls, beforeWrongProgram); assert.equal(existsSync(join(wrongProgramRoot, 'editor.sqlite')), false); assert.equal(existsSync(join(wrongProgramRoot, 'private-objects')), false); check();
  const wrongHost = new EventEmitter(), wrongLog = [];
  assert.equal(await runPublicationCommand({ argv: [], env: wrongProgram, processHost: wrongHost, report: v => wrongLog.push(v) }), null);
  assert.deepEqual(wrongLog, [{ event: 'startup-failed' }]); assert.equal(wrongHost.exitCode, 1); assert.equal(wrongHost.listenerCount('SIGTERM'), 0); assert.equal(calls, beforeWrongProgram); check();
  // --check-config remains syntax-only and does not certify installed bytes.
  const syntaxLog = [];
  await runPublicationCommand({ argv: ['--check-config'], env: wrongProgram, processHost: new EventEmitter(), report: v => syntaxLog.push(v) });
  assert.deepEqual(syntaxLog, [{ event: 'configuration-valid' }]); assert.equal(calls, beforeWrongProgram); assert.equal(existsSync(join(wrongProgramRoot, 'editor.sqlite')), false); check();
  // Archive failure is before any authority creation/listener, not a successful
  // publication. Completed immutable bytes may remain and are rechecked on retry.
  const archiveRoot = join(own, 'archive-failure'); mkdirSync(archiveRoot, { mode: 0o700 });
  const archiveEnv = { ...env, EDITOR_DATA_DIR: archiveRoot, EDITOR_LISTEN_PORT: await port() };
  archive.state.missingSource = true;
  await assert.rejects(startConfiguredPublication(archiveEnv), /STATIC_ARCHIVE_INVALID/);
  archive.state.missingSource = false;
  assert.equal(existsSync(join(archiveRoot, 'editor.sqlite')), false); assert.equal(existsSync(join(archiveRoot, 'private-objects')), false); check();
  archive.state.missingReadback = true;
  await assert.rejects(startConfiguredPublication(archiveEnv), /STATIC_ARCHIVE_INVALID/);
  archive.state.missingReadback = false;
  assert.equal(existsSync(join(archiveRoot, 'editor.sqlite')), false); check();
  const collisionKey = archive.base + 'files/owned/probe.bin', originalObject = archive.objects.get(collisionKey);
  archive.objects.set(collisionKey, { bytes: Buffer.from('bad'), mime: 'application/octet-stream' });
  const putsBeforeCollision = archive.events.filter(e => e.type === 'PUT').length;
  await assert.rejects(startConfiguredPublication(archiveEnv), /STATIC_ARCHIVE_INVALID/);
  assert.equal(archive.objects.get(collisionKey).bytes.toString(), 'bad');
  assert.equal(archive.events.filter(e => e.type === 'PUT').length, putsBeforeCollision);
  archive.objects.set(collisionKey, originalObject); check();
  const putsBeforeRetry = archive.events.filter(e => e.type === 'PUT').length;
  service = await startConfiguredPublication(archiveEnv); await service.close(); service = null;
  assert.equal(archive.events.filter(e => e.type === 'PUT').length, putsBeforeRetry);
  assert.ok(archive.objects.get(archive.manifestURL).bytes.equals(archive.release.bytes)); check();
  const archiveStopRoot = join(own, 'archive-stop'); mkdirSync(archiveStopRoot, { mode: 0o700 });
  const archiveStopHost = new EventEmitter(), archiveStopLog = [];
  holdArchive = true; pending = null;
  boot = runPublicationCommand({ argv: [], env: { ...env, EDITOR_DATA_DIR: archiveStopRoot }, processHost: archiveStopHost, report: v => archiveStopLog.push(v) });
  await until(() => pending); archiveStopHost.emit('SIGTERM'); holdArchive = false; const finishArchive = pending; pending = null; finishArchive();
  assert.equal(await boot, null); boot = null;
  assert.deepEqual(archiveStopLog, [{ event: 'stopped' }]); assert.equal(archiveStopHost.exitCode, undefined);
  assert.equal(archiveStopHost.listenerCount('SIGTERM'), 0); assert.equal(existsSync(join(archiveStopRoot, 'editor.sqlite')), false); check();
  const registrationRoot = join(own, 'registration-failure'); mkdirSync(registrationRoot, { mode: 0o700 });
  const registrationEnv = { ...env, EDITOR_DATA_DIR: registrationRoot, EDITOR_LISTEN_PORT: await port() };
  archive.registrations.set(archive.registrationURL, Buffer.from('bad registration'));
  const registrationPuts = archive.registrationEvents.filter(method => method === 'PUT').length;
  await assert.rejects(startConfiguredPublication(registrationEnv), /PROGRAM_REGISTRATION_INVALID/);
  assert.equal(archive.registrations.get(archive.registrationURL).toString(), 'bad registration');
  assert.equal(archive.registrationEvents.filter(method => method === 'PUT').length, registrationPuts);
  assert.equal(existsSync(join(registrationRoot, 'editor.sqlite')), false); assert.equal(existsSync(join(registrationRoot, 'private-objects')), false); check();
  archive.registrations.set(archive.registrationURL, Buffer.from(archive.registrationBytes));
  archive.state.missingRegistration = true;
  await assert.rejects(startConfiguredPublication(registrationEnv), /PROGRAM_REGISTRATION_UNAVAILABLE/);
  archive.state.missingRegistration = false;
  assert.deepEqual(archive.registrations.get(archive.registrationURL), archive.registrationBytes);
  assert.equal(existsSync(join(registrationRoot, 'editor.sqlite')), false); check();
  const registrationRetryPuts = archive.registrationEvents.filter(method => method === 'PUT').length;
  service = await startConfiguredPublication(registrationEnv); await service.close(); service = null;
  assert.equal(archive.registrationEvents.filter(method => method === 'PUT').length, registrationRetryPuts); check();
  const registrationStopRoot = join(own, 'registration-stop'); mkdirSync(registrationStopRoot, { mode: 0o700 });
  const registrationStopHost = new EventEmitter(), registrationStopLog = [];
  holdRegistration = true; pending = null;
  boot = runPublicationCommand({ argv: [], env: { ...env, EDITOR_DATA_DIR: registrationStopRoot }, processHost: registrationStopHost, report: value => registrationStopLog.push(value) });
  await until(() => pending); registrationStopHost.emit('SIGTERM'); holdRegistration = false;
  const finishRegistration = pending; pending = null; finishRegistration();
  assert.equal(await boot, null); boot = null;
  assert.deepEqual(registrationStopLog, [{ event: 'stopped' }]); assert.equal(registrationStopHost.exitCode, undefined);
  assert.equal(registrationStopHost.listenerCount('SIGTERM'), 0); assert.equal(existsSync(join(registrationStopRoot, 'editor.sqlite')), false); check();
  const quietRoot = join(own, 'quiet'); mkdirSync(quietRoot, { mode: 0o700 }); const quietHost = new EventEmitter();
  service = await runPublicationCommand({ argv: [], env: { ...env, EDITOR_DATA_DIR: quietRoot, EDITOR_LISTEN_PORT: await port() }, processHost: quietHost, report: () => { throw new Error('owned logging failure'); } });
  assert.ok(service); await service.close(); service = null;
  assert.equal(quietHost.listenerCount('SIGTERM'), 0); assert.equal(quietHost.listenerCount('SIGINT'), 0); assert.equal(quietHost.exitCode, undefined); check();
  const log = [], host = new EventEmitter();
  service = await runPublicationCommand({ argv: [], env: { ...env, EDITOR_DATA_DIR: actual, EDITOR_LISTEN_PORT: await port() }, processHost: host, report: v => log.push(v) });
  assert.ok(service); assert.equal((await get(service.address, '/api/health')).status, 200); assert.equal((await get(service.address, '/play')).status, 503);
  await until(() => log.some(v => v.event === 'distribution-idle'));
  assert.equal(host.listenerCount('SIGINT'), 1); assert.equal(host.listenerCount('SIGTERM'), 1); check();
  broken = true; await until(() => log.some(v => v.event === 'distribution-blocked'));
  assert.equal(service.status().distribution.blockedReason, 'REMOTE_GAP'); check();
  host.emit('SIGTERM'); host.emit('SIGINT'); const stopped = service.close(); assert.equal(service.close(), stopped); await stopped;
  assert.equal(log.filter(v => v.event === 'stopped').length, 1); assert.equal(host.listenerCount('SIGTERM'), 0); assert.equal(host.listenerCount('SIGINT'), 0);
  assert.equal(host.exitCode, undefined); service = null;
  const reopened = openStorage(join(actual, 'editor.sqlite')); try { assert.equal(reopened.sql.exec('SELECT blocked_reason FROM content_distribution_state').toArray()[0].blocked_reason, 'REMOTE_GAP'); } finally { reopened.close(); }
  check(); broken = false;
  // A signal during asynchronous startup is remembered. The subsequently bound
  // service is immediately drained/closed, with no started/visibility claim.
  const earlyRoot = join(own, 'early'); mkdirSync(earlyRoot, { mode: 0o700 }); const earlyHost = new EventEmitter(), earlyLog = [];
  const earlyEnv = { ...env, EDITOR_DATA_DIR: earlyRoot, EDITOR_LISTEN_PORT: await port() };
  hold = true; pending = null;
  boot = runPublicationCommand({ argv: [], env: earlyEnv, processHost: earlyHost, report: v => earlyLog.push(v) });
  await until(() => pending); earlyHost.emit('SIGTERM'); hold = false; const finish = pending; pending = null; finish();
  service = await boot; assert.ok(service); assert.equal(service.status().state, 'stopped'); await service.close(); service = null;
  assert.deepEqual(earlyLog, [{ event: 'stopped' }]); assert.equal(earlyHost.listenerCount('SIGTERM'), 0); check();
  process.stdout.write(JSON.stringify({ checks, scope: 'pure configuration, redacted child CLI check, owned filesystem/HTTP/SQLite and simulated process signals, degraded startup on transport unreachability; real signed HTTPS clients intercepted, no TLS/cloud/deployment proof' }) + '\n');
} finally { hold = false; pending?.(); pending = null; await service?.close(); const late = await boot; await late?.close(); https.request = original; syncBuiltinESMExports(); rmSync(own, { recursive: true, force: true }); }
