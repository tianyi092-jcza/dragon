// Explicit opt-in production entry, separate from the historical auth sidecar.
// Secrets come only from process env. Never print configuration or raw errors.
import { lstatSync, openSync, closeSync } from 'node:fs';
import { join, parse, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { verifyInstalledProgram } from './installed-program.mjs';
import { registerStaticProgram } from './program-registration.mjs';
import { registerPinnedSource } from './register-pinned-source.mjs';
import { parsePublicationEnvironment } from './publication-config.mjs';
import { openStorage } from './sqlite-port.mjs';
import { FileBucket } from './file-bucket.mjs';
import { r2client } from './r2client.mjs';
import { startPublicationServer } from './publication-server.mjs';

function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
function privateOwned(value) {
  if (process.platform !== 'win32' && ((value.mode & 0o077) !== 0 || value.uid !== process.getuid())) throw new Error('private owner permissions required');
}
function databasePath(root) {
  let current = parse(root).root;
  for (const part of root.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part); const value = stat(current);
    if (!value?.isDirectory() || value.isSymbolicLink()) throw new Error('unsafe data directory');
  }
  privateOwned(lstatSync(root));
  const path = join(root, 'editor.sqlite');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const value = stat(path + suffix);
    if (value) {
      if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1) throw new Error('unsafe database file');
      privateOwned(value);
    }
  }
  return path;
}
export async function startConfiguredPublication(environment, { signal } = {}) {
  const current = () => { signal?.throwIfAborted(); };
  current();
  const options = parsePublicationEnvironment(environment);
  const path = databasePath(options.dataRoot);
  // Fail before creating private objects/SQLite or contacting remote services.
  // This measures installation bytes, not previously imported ESM or assets.
  verifyInstalledProgram({ webRoot: fileURLToPath(new URL('../web/', import.meta.url)),
    bundlePath: fileURLToPath(new URL('../server/public/trialweb.txt', import.meta.url)),
    expectedSourceTreeDigest: options.sourceTreeDigest });
  const remote = r2client(options.r2);
  // Preserve the independently pinned software bytes before opening authority or
  // listening. A partial archive is neither a publication nor admission authority.
  const archived = await options.archiveStaticProgram(remote, current);
  current();
  // The archive involved awaits: recheck both installation and private paths.
  verifyInstalledProgram({ webRoot: fileURLToPath(new URL('../web/', import.meta.url)),
    bundlePath: fileURLToPath(new URL('../server/public/trialweb.txt', import.meta.url)),
    expectedSourceTreeDigest: options.sourceTreeDigest });
  databasePath(options.dataRoot);
  // The operator-only record is separate from uncommitted archive objects and
  // game publication roots. It neither selects a program nor admits a game.
  await registerStaticProgram({ r2: remote, releaseDigest: archived.releaseDigest,
    sourceTreeDigest: options.sourceTreeDigest, prefix: options.prefix, assertCurrent: current });
  current();
  verifyInstalledProgram({ webRoot: fileURLToPath(new URL('../web/', import.meta.url)),
    bundlePath: fileURLToPath(new URL('../server/public/trialweb.txt', import.meta.url)),
    expectedSourceTreeDigest: options.sourceTreeDigest });
  databasePath(options.dataRoot);
  const bucket = new FileBucket({ root: join(options.dataRoot, 'private-objects') });
  // Do not chmod or replace existing data. A new database starts private even
  // when the invoking process has a permissive umask; SQLite inherits its mode.
  if (!stat(path)) closeSync(openSync(path, 'wx', 0o600));
  const storage = openStorage(path);
  let service;
  try {
    // Opt-in: registers the operator-staged fixed source through the real install
    // path before the port opens. A drifted pin fails closed with startup-failed.
    const prepare = options.env.EDITOR_REGISTER_SOURCE === '1'
      ? async ({ storage: sql, bucket: objects, env }) => { await registerPinnedSource({ storage: sql, bucket: objects, env }); }
      : undefined;
    service = await startPublicationServer({ ...options, storage, bucket, r2: remote, prepare });
  } catch (error) {
    // An aggregate means service cleanup itself failed: never close SQL behind
    // potentially active requests. Operator intervention is required in that case.
    if (!(error instanceof AggregateError)) storage.close();
    throw error;
  }
  let closing;
  return Object.freeze({
    address: service.address,
    status: service.status,
    close() {
      if (!closing) closing = service.close().then(() => storage.close());
      return closing;
    },
  });
}

export async function runPublicationCommand({ argv = process.argv.slice(2), env = process.env, processHost = process, report = value => process.stdout.write(JSON.stringify(value) + '\n') } = {}) {
  const emit = event => { try { report(Object.freeze({ event })); } catch { /* logging cannot skip cleanup */ } };
  let runtime, monitor, closing, stopRequested = false, last;
  const startup = new AbortController();
  const signals = ['SIGINT', 'SIGTERM'];
  const detach = () => { for (const signal of signals) processHost.off(signal, stop); };
  function close() {
    if (closing) return closing;
    clearInterval(monitor);
    closing = runtime.close().then(() => { detach(); emit('stopped'); }, () => { processHost.exitCode = 1; emit('shutdown-failed'); throw new Error('publication shutdown failed'); });
    return closing;
  }
  function stop() {
    stopRequested = true;
    startup.abort();
    if (runtime) void close().catch(() => {});
  }
  try {
    if (argv.length !== 0 && !(argv.length === 1 && argv[0] === '--check-config')) throw new Error('arguments');
    const options = parsePublicationEnvironment(env);
    if (argv.length) { emit('configuration-valid'); return null; }
    for (const signal of signals) processHost.on(signal, stop);
    runtime = await startConfiguredPublication(env, { signal: startup.signal });
    if (stopRequested) { await close(); return runtime; }
    const observe = () => {
      const value = runtime.status().distribution;
      let event = 'distribution-pending';
      if (value.state === 'blocked') event = 'distribution-blocked';
      else if (value.state === 'faulted') event = 'distribution-faulted';
      else if (value.lastResult === 'IDLE') event = 'distribution-idle';
      else if (value.lastResult === 'VISIBLE_CONFIRMED') event = 'distribution-confirmed';
      if (event !== last) { last = event; emit(event); }
    };
    monitor = setInterval(observe, options.intervalMs);
    emit('started');
    // The exposed close owns the signal handlers/monitor as well as HTTP/SQL.
    return Object.freeze({ address: runtime.address, status: runtime.status, close });
  } catch (error) {
    if (!runtime && stopRequested && error === startup.signal.reason) {
      detach(); emit('stopped'); return null;
    }
    clearInterval(monitor);
    if (runtime && !closing) { try { await close(); } catch { /* retain SQL on failed service close */ } }
    detach(); processHost.exitCode = 1; emit('startup-failed'); return null;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runPublicationCommand();
