// Local HTTPS entrance to the real Worker/SQLite authority. Never deploys or reads cloud credentials.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
function parse(text, label) { try { return JSON.parse(text); } catch (cause) { throw new Error('Invalid ' + label, { cause }); } }
function options(args) {
  const result = { config: join(root, 'server/wrangler.jsonc'), init: false, stageSource: false, stageLibrary: false };
  for (let i = 0; i < args.length; i++) { if (args[i] === '--init') result.init = true; else if (args[i] === '--stage-source') result.stageSource = true; else if (args[i] === '--stage-library') result.stageLibrary = true; else if (args[i] === '--config' && args[i + 1]) result.config = resolve(args[++i]); else throw new Error('Usage: node tools/start_editor_backend.mjs [--init] [--stage-source] [--stage-library] [--config path]'); }
  return result;
}
async function secretPrompt() {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal, or EDITOR_DEFAULT_PASSWORD for --init. Never put passwords in command arguments.');
  process.stdout.write('初始密碼（至少16字元；不回顯）：'); const wasRaw = process.stdin.isRaw; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolveValue, reject) => {
    let value = ''; const done = error => { process.stdin.off('data', receive); process.stdin.setRawMode(Boolean(wasRaw)); process.stdin.pause(); process.stdout.write('\n'); if (error) reject(error); else resolveValue(value); };
    const receive = text => { for (const char of text) { if (char === '\u0003') { done(new Error('Cancelled')); return; } if (char === '\r' || char === '\n') { done(); return; } if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join(''); else if (char.codePointAt(0) >= 32 && value.length < 256) value += char; } }; process.stdin.on('data', receive);
  });
}
export async function startEditorBackend(configPath, { stageSource = false, stageLibrary = false } = {}) {
  const doc = parse(readFileSync(configPath, 'utf8'), 'editor config'), directory = dirname(configPath), secretPath = join(directory, '.dev.vars');
  if (!existsSync(secretPath)) throw new Error('Initialise first: node tools/start_editor_backend.mjs --init');
  const bindings = { ...doc.vars };
  for (const line of readFileSync(secretPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = /^(EDITOR_DEFAULT_PASSWORD|EDITOR_REQUEST_KEY)=(".*")$/.exec(line); if (!match) throw new Error('Unsupported secrets-file line'); bindings[match[1]] = parse(match[2], 'private setting');
  }
  let modulePath;
  try { modulePath = createRequire(import.meta.url).resolve('miniflare'); }
  catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
  if (!existsSync(modulePath)) throw new Error('Installed Wrangler/Miniflare required; no package was installed automatically.');
  const { Miniflare } = await import(pathToFileURL(modulePath).href);
  const persist = join(directory, '.local/metadata'); mkdirSync(persist, { recursive: true });
  const sourcePath = join(directory, '.local/source-root.json');
  if (existsSync(sourcePath)) bindings.EDITOR_INSTALLED_SOURCE_ROOT = JSON.stringify(parse(readFileSync(sourcePath, 'utf8'), 'installed source descriptor'));
  const libraryPath = join(directory, '.local/library-root.json');
  if (existsSync(libraryPath)) bindings.EDITOR_AVAILABLE_LIBRARY_ROOT = JSON.stringify(parse(readFileSync(libraryPath, 'utf8'), 'available library descriptor'));
  const mfOptions = { name: doc.name, modules: true, scriptPath: resolve(directory, doc.main), compatibilityDate: doc.compatibility_date, compatibilityFlags: doc.compatibility_flags,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }, { type: 'Text', include: ['**/*.html', '**/*.css', '**/*.txt'] }], durableObjects: { EDITOR_METADATA: { className: 'EditorMetadata', useSQLite: true } }, durableObjectsPersist: persist, bindings,
    r2Buckets: (doc.r2_buckets ?? []).map(row => row.binding), r2Persist: join(directory, '.local/blobs'),
    host: '127.0.0.1', port: 0, https: false };
  const mf = new Miniflare(mfOptions);
  try {
    await mf.ready;
    if (stageSource) {
      if (!(doc.r2_buckets ?? []).some(row => row.binding === 'EDITOR_BLOBS')) throw new Error('Dedicated local R2 binding required');
      const staged = await stageInstalledEditorSource(await mf.getR2Bucket('EDITOR_BLOBS')), encoded = JSON.stringify(staged);
      if (existsSync(sourcePath)) { if (JSON.stringify(parse(readFileSync(sourcePath, 'utf8'), 'installed source descriptor')) !== encoded) throw new Error('Existing source descriptor conflict'); }
      else writeFileSync(sourcePath, encoded + '\n', { flag: 'wx' });
      bindings.EDITOR_INSTALLED_SOURCE_ROOT = encoded;
      await mf.setOptions({ ...mfOptions, bindings }); await mf.ready;
    }
    if (stageLibrary) {
      if (!(doc.r2_buckets ?? []).some(row => row.binding === 'EDITOR_BLOBS')) throw new Error('Dedicated local R2 binding required');
      const staged = await stageInstalledAvailableLibrary(await mf.getR2Bucket('EDITOR_BLOBS')), encoded = JSON.stringify(staged);
      if (existsSync(libraryPath)) { if (JSON.stringify(parse(readFileSync(libraryPath, 'utf8'), 'available library descriptor')) !== encoded) throw new Error('Existing available library descriptor conflict'); }
      else writeFileSync(libraryPath, encoded + '\n', { flag: 'wx' });
      bindings.EDITOR_AVAILABLE_LIBRARY_ROOT = encoded;
      await mf.setOptions({ ...mfOptions, bindings }); await mf.ready;
    }
    const frontend = await createEditorHTTPS(mf, { port: doc.dev.port });
    return { url: frontend.url, async close() { try { await frontend.close(); } finally { await mf.dispose(); } } };
  } catch (error) { await mf.dispose(); throw error; }
}
async function main() {
  const opt = options(process.argv.slice(2)), directory = dirname(opt.config);
  if (opt.init) {
    const password = process.env.EDITOR_DEFAULT_PASSWORD ?? await secretPrompt();
    if ([...password].length < 16 || [...password].length > 128 || password.includes('\0') || !password.isWellFormed()) throw new Error('Initial password must contain16–128characters.');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(password) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(randomBytes(32).toString('hex')) + '\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write('已建立本機私密設定（未覆寫任何既有檔案）。請重新執行啟動命令。\n'); return;
  }
  const server = await startEditorBackend(opt.config, { stageSource: opt.stageSource, stageLibrary: opt.stageLibrary }); process.stdout.write('編輯後台：' + server.url.origin + '\n僅本機HTTPS；不部署、不修改玩家服務。Ctrl+C停止。\n');
  let closing = false; const stop = async () => { if (closing) return; closing = true; await server.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stderr.write('Backend start failed. Check private configuration, installed Wrangler/OpenSSL and port availability. No existing process was stopped.\n'); process.exitCode = 1; });
