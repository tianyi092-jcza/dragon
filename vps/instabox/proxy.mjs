// instabox 測試環境的極薄反代（只為這台機器存在，不是產品代碼）。
//
// 為什麼需要它：instabox 的公網代理把 Host 改寫成 127.0.0.1:<port>，真主機名放在
// x-forwarded-host；而編輯器要求 Host 逐字等於配置 origin 的 host
// （vps/editor-server.mjs:88），所以這裡把 Host 還原成公網主機名再轉給 8788。
//
// 第二件事：編輯器開機時的靜態程式歸檔會讀 STATIC_ORIGIN + STATIC_PATH_PREFIX
// （原本由 nginx alias /srv/dragon/dist/ 提供），所以這裡直接從本機 dist 供應，
// 讓這台機器自給自足、不再依賴舊 VPS。content-type 必須與 vps/static-client.mjs
// 的白名單逐字相符，否則開機會 STATIC_CONTENT_TYPE 失敗。
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const PORT = Number(process.env.PROXY_PORT ?? 18990);
const TARGET_HOST = process.env.PROXY_TARGET_HOST ?? '127.0.0.1';
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT ?? 8788);
const PUBLIC_HOST = process.env.PROXY_PUBLIC_HOST;
const DIST = resolve(process.env.PROXY_DIST ?? '/data/dragon/dist');
const PREFIX = process.env.PROXY_STATIC_PREFIX ?? '';
if (!PUBLIC_HOST) throw new Error('PROXY_PUBLIC_HOST required');

const TYPES = Object.freeze({
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2',
  flac: 'audio/flac', mp3: 'audio/mpeg', wav: 'audio/wav', mid: 'audio/midi', wasm: 'application/wasm',
});
const STATIC_HEADERS = Object.freeze({
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
});
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname.slice(1 + PREFIX.length)); }
  catch { res.writeHead(400, STATIC_HEADERS).end('Bad Request'); return; }
  const target = resolve(join(DIST, rel));
  if (target !== DIST && !target.startsWith(DIST + sep)) { res.writeHead(404, STATIC_HEADERS).end('Not Found'); return; }
  let body;
  try { body = await readFile(target); }
  catch { res.writeHead(404, STATIC_HEADERS).end('Not Found'); return; }
  const ext = extname(target).slice(1).toLowerCase();
  res.writeHead(200, { ...STATIC_HEADERS, 'content-type': TYPES[ext] ?? 'application/octet-stream', 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function proxy(req, res, url) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!HOP.has(name.toLowerCase()) && typeof value === 'string') headers[name] = value;
  }
  headers.host = PUBLIC_HOST;
  headers['x-forwarded-host'] = PUBLIC_HOST;
  headers['x-forwarded-proto'] = 'https';
  const upstream = httpRequest({ host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers }, response => {
    const out = {};
    for (const [name, value] of Object.entries(response.headers)) {
      if (!HOP.has(name.toLowerCase())) out[name] = value;
    }
    res.writeHead(response.statusCode ?? 502, out);
    response.pipe(res);
  });
  upstream.setTimeout(600000, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', error => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'PROXY_UPSTREAM', detail: String(error?.message ?? error) }));
  });
  req.pipe(upstream);
}

createServer((req, res) => {
  let url;
  try { url = new URL(req.url ?? '/', 'https://' + PUBLIC_HOST); }
  catch { res.writeHead(400).end('Bad Request'); return; }
  if (PREFIX && url.pathname.startsWith('/' + PREFIX)) { serveStatic(req, res, url.pathname).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); return; }
  proxy(req, res, url);
}).listen(PORT, '127.0.0.1', () => process.stdout.write(JSON.stringify({ event: 'proxy-listening', port: PORT, publicHost: PUBLIC_HOST, staticPrefix: PREFIX }) + String.fromCharCode(10)));
