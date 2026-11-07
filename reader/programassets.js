// Public software bytes only, registered by the trusted installation path.
// No HTML entry, game selection, capability issuance, author upload or fallback.
import { staticAssetPath } from './staticreleaseformat.js';
import { ProgramFileNotFound, readRegisteredProgramFile } from './programarchive.js';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
const types = Object.freeze({ js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  bin: 'application/octet-stream', flac: 'audio/flac', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg' });
const error = (status, code) => new Response(JSON.stringify({ error: code }), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });

export default { async fetch(request, env) {
  let match, path, mime;
  try {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) || url.hash) return error(404, 'PROGRAM_ASSET_NOT_FOUND');
    match = /^\/program-assets\/([a-f0-9]{64})\/(.+)$/.exec(url.pathname);
    path = match?.[2];
    if (!staticAssetPath(path)) return error(404, 'PROGRAM_ASSET_NOT_FOUND');
    // 快取破除參數：只接受單一 `v`（既有 core/assets.js 的 v=original-sprites-1 也在其中），
    // 其餘查詢一律 404。位元組仍由已註冊的檔案提供，參數不改變內容，只影響快取鍵。
    // 2026-11-07 實錘：開場音樂寫死 `?v=<hash>`（web/intro/intro.config.js），舊規則讓它
    // 一律 404 → 開場音樂下載失敗 → 正式入口整頁退回首頁。
    // 形狀仍然嚴格：只有單一 `v=<1..64 個 [A-Za-z0-9._-]>`，其餘（含空 `?`、重複、尾隨 `&`、
    // 百分號編碼、`?V=`）一律 404；只是不再限於那四張 grf 圖。
    if (url.href.includes('?') && !/^\?v=[A-Za-z0-9._-]{1,64}$/.test(url.search)) return error(404, 'PROGRAM_ASSET_NOT_FOUND');
    const extension = path.slice(path.lastIndexOf('.') + 1);
    // The opening module fetches this reviewed fragment as text and parses it
    // locally. Serve no executable HTML document or arbitrary HTML suffix.
    mime = Object.hasOwn(types, extension) ? types[extension] : null;
    if (path === 'intro/scene.html') mime = 'text/plain; charset=utf-8';
    if (!mime) return error(404, 'PROGRAM_ASSET_NOT_FOUND');
  } catch { return error(404, 'PROGRAM_ASSET_NOT_FOUND'); }
  try {
    const { bytes } = await readRegisteredProgramFile({ get: env.PUBLISH_BUCKET.get.bind(env.PUBLISH_BUCKET), digest: match[1], path, signal: request.signal });
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...headers, 'Content-Type': mime, 'Content-Length': String(bytes.length) } });
  } catch (cause) { return cause instanceof ProgramFileNotFound ? error(404, 'PROGRAM_ASSET_NOT_FOUND') : error(503, 'PROGRAM_ASSET_UNAVAILABLE'); }
} };
