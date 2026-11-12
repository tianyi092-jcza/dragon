// Local development service for the editor workbench: the SAME application the
// production Durable Object runs, on Node SQLite plus a private file bucket,
// behind a loopback TLS entrance. It is a development harness, not a deployment
// path: nothing is pushed, published or archived, and no real save file is read.
//
//   node tools/dev_editor.mjs [--port 8443] [--store .dragon-analysis/dev] [--no-watch]
//
// Supervisor mode (default) rebuilds the Vue shell / Trial bundle and restarts
// the service when sources change. Look at the printed `DEV READY` line for the
// URL to open; state survives restarts in the store directory.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const PORT = Number(option('port', 8443));
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new RangeError('port must be 1024..65535');
const STORE = resolve(option('store', '.dragon-analysis/dev'));
const ORIGIN = `https://127.0.0.1:${PORT}`;
// Local-only bootstrap credential; the first login still forces a real password
// change exactly like production. Empty database only, never overwrites one.
const BOOTSTRAP_PASSWORD = 'Dev-Local-Only-2026!';

// Staged operators write `onlyIf.etagDoesNotMatch`; the file bucket port takes
// HTTP condition headers, so the two shapes are bridged here and nowhere else.
function operatorPort(bucket) {
  return {
    get: key => bucket.get(key),
    put: (key, bytes, conditions) => {
      assert.deepEqual(conditions, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    },
  };
}

// Staging 58 MiB of pinned source on every restart would dominate the edit loop,
// so the verified result is cached against the pinned manifest fingerprints.
// Any pinned byte change invalidates the marker and forces a full restage.
// `--no-library` 只给本地实测用：available-library 的消费者指纹是钉死清单，代码改了
// main.js 之类就会不匹配；城池据点等游戏级模块不依赖素材库，没装也不影响读/存。
async function stagedPinned(bucket, withLibrary = true) {
  const marker = join(STORE, 'staged.json');
  const inputs = ['../server/pinned/world-manifest.txt', '../server/pinned/entity-manifest.txt', '../server/available-library.txt']
    .map(path => readFileSync(new URL(path, import.meta.url)));
  const fingerprint = createHash('sha256').update(Buffer.concat(inputs)).digest('hex');
  if (existsSync(marker)) {
    try {
      const cached = JSON.parse(readFileSync(marker, 'utf8'));
      if (cached.fingerprint === fingerprint) {
        if (!withLibrary && cached.library) delete cached.library;
        else if (withLibrary && !cached.library) { /* 下面的完整 staging 会补齐素材库 */ }
        else return cached;
      }
    } catch { /* 损坏的缓存标记只意味着重跑一次 staging */ }
  }
  process.stderr.write('dev: staging pinned source and available library（约 40s，仅 pinned 字节变化时重跑）\n');
  const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');
  const staged = { fingerprint, source: await stageInstalledEditorSource(bucket) };
  if (withLibrary) {
    const { stageInstalledAvailableLibrary } = await import('./editor_stage_library.mjs');
    staged.library = await stageInstalledAvailableLibrary(bucket);
  }
  writeFileSync(marker, `${JSON.stringify(staged, null, 2)}\n`);
  return staged;
}

async function serve() {
  mkdirSync(join(STORE, 'private'), { recursive: true });
  const { openStorage } = await import('../vps/sqlite-port.mjs');
  const { FileBucket } = await import('../vps/file-bucket.mjs');
  const { createEditorService } = await import('../vps/editor-server.mjs');
  const { reclaimPrivateGame } = await import('../vps/game-reclaimer.mjs');
  const { createEditorHTTPS } = await import('./editor_local_https.mjs');
  const bucket = new FileBucket({ root: join(STORE, 'private') });
  const storage = openStorage(join(STORE, 'editor.sqlite'));
  let transport;
  try {
    const { source, library } = await stagedPinned(operatorPort(bucket), !argv.includes('--no-library'));
    const wrangler = readFileSync(new URL('../server/wrangler.jsonc', import.meta.url), 'utf8');
    const env = {
      ...JSON.parse(wrangler).vars,
      EDITOR_ORIGIN: ORIGIN,
      EDITOR_DEFAULT_PASSWORD: BOOTSTRAP_PASSWORD,
      EDITOR_REQUEST_KEY: requestKey(),
      // 5 attempts per 10 minutes is production anti-brute-force; here it only
      // locks the tester out of a loop of quick re-logins.
      EDITOR_RATE_MS: '1000',
      EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source),
      ...(process.env.DRAGON_TIMING ? { DRAGON_TIMING: '1' } : {}),
      ...(library ? { EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library) } : {}),
    };
    // 此開發入口沒有 runtimeStager／公開分發桶；所有遊戲專屬檔案只在 private 桶。
    const purgeReclaimer = async gameId => ({ gameId, pointer: 'absent', objects: 0, privateObjects: await reclaimPrivateGame(bucket, gameId) });
    const service = createEditorService({ storage, bucket, env, purgeReclaimer });
    transport = await createEditorHTTPS(
      { dispatchFetch: (url, init) => service.fetch(new Request(url, init)) },
      { port: PORT, tls: developmentTLS() },
    );
  } catch (error) {
    storage.close();
    throw error;
  }
  process.stdout.write(`DEV READY ${ORIGIN}/  (account tianyi, bootstrap password ${BOOTSTRAP_PASSWORD})\n`);
  process.stdout.write('DEV NOTE 首次登录必须改密码；改了之后下面的 bootstrap 口令不再生效。\n');
  process.send?.('ready');
  const stop = async () => { try { await transport.close(); } finally { storage.close(); process.exit(0); } };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

// Idempotency keys are HMAC'd with this secret, so it must outlive restarts or a
// pending create/run would answer MISSING instead of resuming.
function requestKey() {
  const path = join(STORE, 'request-key.txt');
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim();
    if (/^[a-f0-9]{64}$/.test(existing)) return existing;
  }
  const key = randomBytes(32).toString('hex');
  writeFileSync(path, `${key}\n`, { mode: 0o600 });
  return key;
}

// One stable self-signed identity keeps the browser's exception valid across
// restarts; regenerated only when missing or older than its validity window.
function developmentTLS() {
  const dir = join(STORE, 'tls'), key = join(dir, 'dev.key'), cert = join(dir, 'dev.crt');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    for (const path of [key, cert]) if (existsSync(path)) unlinkSync(path);
    const executable = process.platform === 'win32' && existsSync('C:/Program Files/Git/mingw64/bin/openssl.exe')
      ? 'C:/Program Files/Git/mingw64/bin/openssl.exe' : 'openssl';
    const made = spawnSync(executable, ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '825',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { encoding: 'utf8' });
    if (made.status !== 0) throw new Error(`本机 OpenSSL 生成开发证书失败（未安装任何东西）：${made.stderr ?? ''}`);
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

// Cheap size/mtime census of one watched tree; equal census means no real edit.
function fingerprint(entry) {
  const parts = [];
  for (const item of readdirSync(entry.dir, { recursive: true, withFileTypes: true })) {
    if (!item.isFile()) continue;
    const path = join(item.parentPath, item.name);
    if (!path.endsWith('.js') && !path.endsWith('.mjs') && !path.endsWith('.vue') && !path.endsWith('.json') && !path.endsWith('.css')) continue;
    if (entry.ignore?.(path)) continue;
    const stat = statSync(path);
    parts.push(`${path}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
  }
  parts.sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

// Vue shell and Trial bundle are imported as modules by the service, so they are
// only re-read on a fresh process: rebuild first, then restart the child.
const REBUILDS = [
  { label: 'Vue shell', script: join(root, 'editor-ui/build.mjs') },
  { label: 'Trial bundle', script: join(root, 'tools/build_trial_web_bundle.mjs') },
];
const WATCHES = [
  { label: 'editor-ui/src', dir: join(root, 'editor-ui/src'), rebuild: true },
  { label: 'web/src', dir: join(root, 'web/src'), rebuild: true },
  { label: 'server', dir: join(root, 'server'), rebuild: false, ignore: path => path.includes(join('server', 'public')) },
  { label: 'vps', dir: join(root, 'vps'), rebuild: false },
];

async function supervise() {
  const watchEnabled = !argv.includes('--no-watch');
  let child, stopping = false, queue = Promise.resolve();
  const log = text => process.stdout.write(`dev: ${text}\n`);

  function build() {
    for (const { label, script } of REBUILDS) {
      const started = Date.now();
      const done = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      if (done.status !== 0) {
        process.stderr.write(done.stdout ?? '');
        process.stderr.write(done.stderr ?? '');
        throw new Error(`${label} 构建失败，服务保持旧产物`);
      }
      const summary = (done.stdout ?? '').trim().split('\n').pop();
      log(`${label} 就绪 ${Date.now() - started}ms — ${summary}`);
    }
  }

  function start() {
    // 子进程重新执行同一个文件；本地实测开关必须显式传下去。
    const flags = ['--child', '--port', String(PORT), '--store', STORE];
    if (argv.includes('--no-library')) flags.push('--no-library');
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...flags],
      { cwd: root, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    const started = child;
    started.once('exit', (code, signal) => {
      if (stopping || child !== started) return;
      process.stderr.write(`dev: 子进程意外退出 code=${code} signal=${signal}\n`);
      process.exit(code ?? 1);
    });
    return started;
  }

  async function restart(reason) {
    log(`${reason} → 重启服务`);
    const dying = child;
    child = undefined;
    const exited = new Promise(done => dying.once('exit', done));
    dying.kill('SIGTERM');
    await exited;
    start();
  }

  // Serialize rebuild/restart pairs so two saves in a row cannot interleave.
  const enqueue = (task, reason) => {
    queue = queue.then(async () => {
      try { task(); await restart(reason); }
      catch (error) { process.stderr.write(`dev: ${error.message}\n`); }
    });
    return queue;
  };

  log(`启动 ${ORIGIN}/ …（状态目录 ${STORE}）`);
  build();
  start();

  if (watchEnabled) {
    let timer;
    const touched = new Map();  // watch entry -> last path that fired
    const trigger = (entry, path) => {
      touched.set(entry, path);
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Windows recursive watching also reports directory enumeration and
        // scanner reads. Only act when size/mtime really moved.
        const changed = [...touched.keys()].filter(entry => {
          const next = fingerprint(entry);
          if (next === entry.current) return false;
          entry.current = next;
          return true;
        });
        touched.clear();
        if (!changed.length) return;
        const wantsBuild = changed.some(entry => entry.rebuild);
        enqueue(wantsBuild ? build : () => {}, `${changed.map(entry => entry.label).join('、')} 变更`);
      }, 250);
    };
    for (const entry of WATCHES) {
      const { dir, ignore } = entry;
      if (!existsSync(dir)) { log(`跳过不存在的监视目录 ${dir}`); continue; }
      entry.current = fingerprint(entry);
      watch(dir, { recursive: true }, (_event, file) => {
        const path = file ? join(dir, file) : dir;
        if (path.endsWith('~') || path.endsWith('.swp') || path.endsWith('.tmp')) return;
        if (ignore?.(path)) return;
        trigger(entry, path);
      });
    }
    if (process.stdin.isTTY) process.stdin.setEncoding('utf8');
    process.stdin.on('data', () => enqueue(() => {}, '手动重启'));
    log('监视中：editor-ui/src、web/src、server、vps。改 web/ 顶层资源或 web/intro 请手动回车重启。');
  } else log('未开启监视（--no-watch）。');

  const shutdown = () => {
    stopping = true;
    if (!child) process.exit(0);
    const dying = child;
    child = undefined;
    dying.once('exit', () => process.exit(0));
    dying.kill('SIGTERM');
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

// Module-level constants must be initialized before either mode runs.
if (argv.includes('--child')) await serve();
else await supervise();
