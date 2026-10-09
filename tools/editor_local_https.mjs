// Local developer transport only: TLS stays at the public loopback entrance.
// Cloudflare deployment never imports this module or changes its edge TLS.
import { createServer } from 'node:https';
import { mkdtempSync, readFileSync, existsSync, unlinkSync, rmdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const allowedHeaders = new Set(['accept', 'content-type', 'origin', 'cookie', 'x-csrf-token', 'idempotency-key', 'if-match']);
const maxJSONBytes = 16384;
function capture(incoming) {
  return new Promise((done, reject) => {
    let length = 0, oversized = false; const parts = [];
    incoming.on('data', part => { length += part.length; if (length > maxJSONBytes) oversized = true; if (!oversized) parts.push(part); });
    incoming.once('error', reject);
    incoming.once('aborted', () => reject(new Error('LOCAL_INPUT_ABORTED')));
    incoming.once('end', () => done({ oversized, bytes: oversized ? null : Buffer.concat(parts) }));
  });
}
function certificate(directory) {
  const key = join(directory, 'engineering.key'), cert = join(directory, 'engineering.crt'), env = {};
  for (const name of ['SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','ComSpec','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH']) if (process.env[name] !== undefined) env[name] = process.env[name];
  // Only installed tools, never installation, global trust or an existing private key.
  const gitOpenSSL = 'C:/Program Files/Git/mingw64/bin/openssl.exe';
  const executable = process.platform === 'win32' && existsSync(gitOpenSSL) ? gitOpenSSL : 'openssl';
  const generated = spawnSync(executable, ['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert], { env, encoding:'utf8', timeout:30000 });
  if (generated.status !== 0) throw new Error('Installed OpenSSL required for a local engineering certificate; nothing was installed.');
  chmodSync(key, 0o600);
  return { key: readFileSync(key), cert: readFileSync(cert), minVersion: 'TLSv1.2' };
}
export async function createEditorHTTPS(mf, { port = 8787 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local backend port');
  const directory = mkdtempSync(join(tmpdir(), 'dragon-editor-tls-'));
  const cleanup = () => { for (const name of ['engineering.key', 'engineering.crt']) { const path = join(directory,name); if (existsSync(path)) unlinkSync(path); } rmdirSync(directory); };
  const origin = 'https://127.0.0.1:' + port; let server, closing;
  const sockets = new Set();
  const errorResponse = (outgoing, code, status) => { if (outgoing.headersSent) { outgoing.destroy(); return; } outgoing.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); outgoing.end(JSON.stringify({ error:code })); };
  try {
    server = createServer(certificate(directory), async (incoming, outgoing) => {
      try {
        if (incoming.headers.host !== '127.0.0.1:' + port) { incoming.resume(); errorResponse(outgoing,'LOCAL_HOST',400); return; }
        const url = new URL(incoming.url, origin);
        if (url.origin !== origin) { incoming.resume(); errorResponse(outgoing,'LOCAL_URL',400); return; }
        const input = await capture(incoming);
        if (input.oversized) { errorResponse(outgoing,'BODY_TOO_LARGE',413); return; }
        const headers = new Headers();
        for (const [name,value] of Object.entries(incoming.headers)) if (value !== undefined && allowedHeaders.has(name)) headers.set(name, Array.isArray(value) ? value.join(',') : value);
        // SDK maps this exact public HTTPS URL to its own HTTP listener, without
        // caller-controlled forwarded-host/MF headers or bypassing Worker authority.
        const response = await mf.dispatchFetch(url.href, { method:incoming.method, headers, body:['GET','HEAD'].includes(incoming.method) ? undefined : input.bytes });
        const bytes = Buffer.from(await response.arrayBuffer());
        for (const [name,value] of response.headers) if (!['content-length','transfer-encoding','connection','set-cookie'].includes(name)) outgoing.setHeader(name,value);
        const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader('Set-Cookie',cookies);
        outgoing.setHeader('Content-Length',String(bytes.length)); outgoing.writeHead(response.status); outgoing.end(bytes);
      } catch { errorResponse(outgoing,'LOCAL_UPSTREAM_FAILURE',502); }
    });
    server.on('connection', socket => {
      if (closing) { socket.destroy(); return; }
      sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    });
    await new Promise((done,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',done); });
    return { url:new URL(origin), close() {
      // Explicit local shutdown, not graceful completion of in-flight HTTP work.
      // Node's HTTP connection tracking misses TLS clients that send no request.
      if (!closing) closing = (async () => {
        const stopped = new Promise((done,reject) => server.close(error => error ? reject(error) : done()));
        for (const socket of sockets) socket.destroy();
        try { await stopped; } finally { cleanup(); }
      })();
      return closing;
    } };
  } catch (error) { if (server?.listening) await new Promise(done => server.close(done)); cleanup(); throw error; }
}
