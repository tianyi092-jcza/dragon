// Node HTTP platform adapter for the SAME editor application as the DO.
// Only the configured editor Host is accepted. Proxy/source headers are never
// trusted: rate identity comes from the socket (shared behind a local proxy).
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config, HttpError } from '../server/security.js';
register('./text-loader.mjs', import.meta.url);
const { createEditorApplication, createEditorGateway } = await import('../server/editorapp.js');
const portraitFiles = new Map(KAO_MANIFEST.map(entry => [entry.id, new URL(`../web/kao/${entry.file}`, import.meta.url)]));
// Only the common application's manifest-validated descriptor reaches this port.
const readSharedPortrait = descriptor => readFile(portraitFiles.get(descriptor.assetId));
const EditorApplication = createEditorApplication(class NodeApplicationBase {}, { readSharedPortrait });
const LIMIT = 16384; // Same bounded JSON request contract as server/security.js.
const errorReply = (status, error) => Response.json({ error }, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
} });

export function createEditorService({ storage, bucket, env, runtimeStager, frozenPublication = false, purgeReclaimer }) {
  const policy = config(env);
  if (!storage?.sql || !bucket) throw new TypeError('SQLite and private bucket ports required');
  const bindings = { ...env, EDITOR_BLOBS: bucket };
  // Trusted startup option only; the shared factory validates it before SQL.
  const Application = runtimeStager === undefined && frozenPublication === false && purgeReclaimer === undefined ? EditorApplication : createEditorApplication(class NodeApplicationBase {}, { runtimeStager, frozenPublication, readSharedPortrait, purgeReclaimer });
  const entry = createEditorGateway({ frozenPublication });
  const application = new Application({ storage }, bindings);
  bindings.EDITOR_METADATA = {
    idFromName(name) { if (name !== 'editor-authority-v1') throw new Error('unknown authority'); return name; },
    get(name) { if (name !== 'editor-authority-v1') throw new Error('unknown authority'); return application; },
  };
  return Object.freeze({
    origin: policy.origin,
    async fetch(request, source = 'local-shared') {
      let origin;
      try { origin = new URL(request.url).origin; }
      catch { return errorReply(400, 'INVALID_URL'); }
      if (origin !== policy.origin) return errorReply(403, 'ORIGIN_REJECTED');
      const forwarded = new Request(request);
      for (const name of ['X-Editor-Source', 'CF-Connecting-IP', 'Forwarded', 'X-Forwarded-For', 'X-Real-IP']) forwarded.headers.delete(name);
      forwarded.headers.set('CF-Connecting-IP', source);
      return entry.fetch(forwarded, bindings);
    },
  });
}

function capture(request) {
  return new Promise((resolve, reject) => {
    let length = 0;
    const chunks = [];
    const clean = () => {
      request.off('data', data); request.off('end', end);
      request.off('error', error); request.off('aborted', aborted);
    };
    const error = cause => { clean(); reject(cause); };
    const aborted = () => error(new HttpError(400, 'REQUEST_ABORTED'));
    const end = () => { clean(); resolve(Buffer.concat(chunks, length)); };
    const data = bytes => {
      length += bytes.length;
      if (length > LIMIT) { request.pause(); error(new HttpError(413, 'REQUEST_TOO_LARGE')); }
      else chunks.push(bytes);
    };
    request.on('data', data); request.once('end', end);
    request.once('error', error); request.once('aborted', aborted);
  });
}

export async function startEditorServer({ storage, bucket, env, runtimeStager, frozenPublication = false, purgeReclaimer, host = '127.0.0.1', port = 8787, prepare }) {
  if (!['127.0.0.1', '0.0.0.0'].includes(host) || !Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('listen address');
  if (prepare !== undefined && typeof prepare !== 'function') throw new TypeError('trusted startup preparation required');
  if (purgeReclaimer !== undefined && typeof purgeReclaimer !== 'function') throw new TypeError('trusted purge reclaimer required');
  const service = createEditorService({ storage, bucket, env, runtimeStager, frozenPublication, purgeReclaimer });
  // Schema and the library row exist by now; optional operator startup steps run
  // before the port opens so no request can observe a half-configured database.
  if (prepare) await prepare({ storage, bucket, env });
  let authority;
  try { authority = new URL(service.origin).host; }
  catch { throw new TypeError('configured editor origin'); }
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 30000, headersTimeout: 10000 }, async (request, response) => {
    // 每個請求都留一條可查證的收據：慢到不合理或抛錯就寫 JSON 事件，方便用 docker logs 對帳。
    // 不記請求體、cookie、token、idempotency key。
    const startedAt = Date.now(), route = (request.url ?? '').split('?')[0].slice(0, 200);
    const elapsed = () => Date.now() - startedAt;
    try {
      if (request.headers.host?.toLowerCase() !== authority) throw new HttpError(403, 'ORIGIN_REJECTED');
      if (!request.url?.startsWith('/') || request.url.startsWith('//') || /[\\#\x00-\x20]/.test(request.url)) throw new HttpError(400, 'INVALID_URL');
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const method = request.method;
      if (method !== 'GET' && method !== 'POST') throw new HttpError(404, 'NOT_FOUND');
      if (Number(request.headers['content-length'] ?? 0) > LIMIT) throw new HttpError(413, 'REQUEST_TOO_LARGE');
      const bytes = method === 'POST' ? await capture(request) : undefined;
      headers.delete('content-length'); headers.delete('transfer-encoding');
      const input = new Request(service.origin + request.url, { method, headers, body: bytes });
      const reply = await service.fetch(input, request.socket.remoteAddress ?? 'local-shared');
      for (const [key, value] of reply.headers) if (key !== 'set-cookie') response.setHeader(key, value);
      const cookies = reply.headers.getSetCookie();
      if (cookies.length) response.setHeader('Set-Cookie', cookies);
      response.writeHead(reply.status);
      if (reply.body) await pipeline(Readable.fromWeb(reply.body), response);
      else response.end();
      if (elapsed() > 15000 || reply.status >= 500) process.stdout.write(JSON.stringify({ event: 'request-slow', method: request.method, route, status: reply.status, ms: elapsed() }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ event: 'request-failed', method: request.method, route, ms: elapsed(), code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR', message: String(error?.message ?? '').slice(0, 200) }) + '\n');
      if (response.headersSent) { response.destroy(); return; }
      const reply = errorReply(error instanceof HttpError ? error.status : 500, error instanceof HttpError ? error.code : 'INTERNAL_ERROR');
      response.writeHead(reply.status, { ...Object.fromEntries(reply.headers), Connection: 'close' });
      response.end(await reply.text(), () => request.destroy());
    }
  });
  server.maxHeadersCount = 64;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  return Object.freeze({
    address: server.address(),
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  });
}
