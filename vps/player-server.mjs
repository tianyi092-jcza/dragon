// 玩家端 Node 服務（2026-11 用戶決定方案 B）：把原本跑在 Cloudflare Worker 上的
// reader/site.js 原樣跑在本機 VPS，桶是磁碟目錄、靜態資源是 dist/。這樣就不再受
// Worker 的 CPU/記憶體上限（實測 /play-api/v1/registry 單次 11ms CPU，免費套餐 10ms
// 上限 → Error 1102）影響。
//
// 不複製業務邏輯：路由、准入簽章、指針讀取、digest 校驗全部沿用 reader/site.js 與
// reader/worker.js，這裡只做三件平台適配——Request/Response、磁碟桶、靜態檔案。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, join, resolve, sep } from 'node:path';
import site from '../reader/site.js';
import { createDiskBucket } from './disk-bucket.mjs';

const MAX_STATIC = 64 * 1024 * 1024;
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
});
// web/_headers 的 /* 區塊（Cloudflare 靜態層原本替我們加的標頭），逐條在本機重放。
const STATIC_HEADERS = Object.freeze({
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
});

// 靜態資源埠：dist/ 目錄。不是沙箱，只是把路徑形狀與 404 行為對齊原本的 Static Assets。
export function createStaticAssets(distRoot) {
  const base = resolve(distRoot);
  async function serve(request) {
    let url;
    try { url = new URL(request.url); }
    catch { return new Response('Not Found', { status: 404, headers: STATIC_HEADERS }); }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response('Not Found', { status: 404, headers: STATIC_HEADERS }); }
    // Cloudflare 把 /index.html 307 到 /；正式入口（帶 formalGame/mode）不會走到這裡。
    if (pathname === '/index.html' || pathname.endsWith('/index.html')) {
      return new Response(null, { status: 307, headers: { ...STATIC_HEADERS, location: '/' + url.search } });
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = resolve(base, '.' + pathname);
    if (target !== base && !target.startsWith(base + sep)) return new Response('Not Found', { status: 404, headers: STATIC_HEADERS });
    try {
      const body = await readFile(target);
      if (body.length > MAX_STATIC) return new Response('Not Found', { status: 404, headers: STATIC_HEADERS });
      return new Response(body, { status: 200, headers: { ...STATIC_HEADERS, 'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream' } });
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR' && error?.code !== 'ENOTDIR') throw error;
      // not_found_handling: 404-page
      const page = await readFile(join(base, '404.html')).catch(() => null);
      if (page === null) return new Response('Not Found', { status: 404, headers: STATIC_HEADERS });
      return new Response(page, { status: 404, headers: { ...STATIC_HEADERS, 'content-type': TYPES['.html'] } });
    }
  }
  return Object.freeze({ fetch: serve });
}

// R2 綁定形狀的唯讀轉接：reader/*.js 只用 get()，物件需要 size 與 arrayBuffer()。
// reader/*.js 讀的是 Workers 綁定形狀：`{ size, httpMetadata.contentType, body(ReadableStream) }`，
// 而 disk-bucket 回的是 REST 形狀 `{ bytes, headers: { etag, 'content-type', 'last-modified' } }`。
// 少一個 body 就會讓 reader/programarchive.js 的 read() 直接 503（program-assets 全掛）。
export function readOnlyBinding(bucket) {
  return Object.freeze({
    async get(key) {
      const object = bucket.get(key);
      if (object === null) return null;
      const bytes = object.bytes;
      return {
        key, size: bytes.length,
        httpMetadata: { contentType: object.headers['content-type'] },
        body: new Blob([bytes]).stream(),
        arrayBuffer: async () => bytes,
      };
    },
    async list(prefix, maxKeys) { return bucket.list(prefix, maxKeys); },
  });
}

export function createPlayerService({ distRoot, bucketRoot, origin, admissionKeys, activeKey }) {
  if (typeof origin !== 'string' || !origin.startsWith('https://')) throw new TypeError('https player origin required');
  if (typeof admissionKeys !== 'string' || admissionKeys.length === 0) throw new TypeError('admission keys required');
  const bucket = createDiskBucket({ root: bucketRoot, readOnly: true });
  const env = Object.freeze({
    PLAYER_ORIGIN: origin,
    PLAYER_ADMISSION_KEYS: admissionKeys,
    PLAYER_ADMISSION_ACTIVE_KEY: activeKey,
    PUBLISH_BUCKET: readOnlyBinding(bucket),
    ASSETS: createStaticAssets(distRoot),
  });
  return Object.freeze({ env, fetch: request => site.fetch(request, env) });
}

function toResponse(res, response) {
  const headers = {};
  for (const [key, value] of response.headers) headers[key] = value;
  res.writeHead(response.status, headers);
  if (response.body === null) { res.end(); return; }
  Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
}

export function startPlayerServer({ port = 8789, host = '127.0.0.1', ...options }) {
  const service = createPlayerService(options);
  const server = createServer((req, res) => {
    // 只信任本機反代：請求 URL 一律用設定的 origin 重建，准入的 aud 才能逐字比對。
    const request = new Request(options.origin + (req.url ?? '/'), {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === 'string')),
    });
    service.fetch(request).then(response => toResponse(res, response), error => {
      // reader/*.js 對外只回錯誤碼；PLAYER_DEBUG=1 時把原始錯誤寫到 stderr 供排查。
      if (process.env.PLAYER_DEBUG === '1') process.stderr.write(JSON.stringify({ event: 'reader-failed', message: String(error?.message ?? error), stack: String(error?.stack ?? '').split(String.fromCharCode(10)).slice(0, 6) }) + String.fromCharCode(10));
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'READER_UNAVAILABLE' }));
    });
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => done({ server, service, address: server.address() }));
  });
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('player-server.mjs')) {
  const required = ['PLAYER_ORIGIN', 'PLAYER_ADMISSION_KEYS', 'PLAYER_ADMISSION_ACTIVE_KEY', 'PLAYER_DIST_ROOT', 'PLAYER_BUCKET_ROOT'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length > 0) { process.stderr.write(JSON.stringify({ event: 'config-missing', names: missing }) + '\n'); process.exit(1); }
  const started = await startPlayerServer({
    distRoot: process.env.PLAYER_DIST_ROOT,
    bucketRoot: process.env.PLAYER_BUCKET_ROOT,
    origin: process.env.PLAYER_ORIGIN,
    admissionKeys: process.env.PLAYER_ADMISSION_KEYS,
    activeKey: process.env.PLAYER_ADMISSION_ACTIVE_KEY,
    port: Number(process.env.PLAYER_PORT ?? 8789),
    host: process.env.PLAYER_HOST ?? '127.0.0.1',
  });
  process.stdout.write(JSON.stringify({ event: 'started', port: started.address.port }) + '\n');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { started.server.close(() => process.exit(0)); });
}
