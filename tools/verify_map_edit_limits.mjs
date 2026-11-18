// Isolated request-budget regression; no user store/profile or production IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { body, requestBodyLimit } from '../server/security.js';
import { MAP_EDIT_MAX_BYTES, MAP_EDIT_MAX_COMMANDS } from '../web/src/editor/mapeditlimits.js';
import { startEditorServer } from '../vps/editor-server.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
const paths = ['/api/admin/base-map/save', '/api/games/11111111-1111-4111-8111-111111111111/copy'];
const payload = size => JSON.stringify({ text: 'x'.repeat(size - 11) });

test('shared JSON boundary accepts exact map budget and rejects overflow; unrelated routes stay small', async () => {
  assert.equal(MAP_EDIT_MAX_COMMANDS, 4096);
  for (const path of paths) {
    assert.equal(requestBodyLimit('POST', path), MAP_EDIT_MAX_BYTES);
    const parsed = await body(new Request('https://fixture.invalid' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload(MAP_EDIT_MAX_BYTES) }));
    assert.equal(parsed.text.length, MAP_EDIT_MAX_BYTES - 11);
    await assert.rejects(body(new Request('https://fixture.invalid' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload(MAP_EDIT_MAX_BYTES + 1) })), error => error.status === 413);
  }
  for (const path of ['/api/auth/login', '/api/admin/accounts', paths[0] + '/extra', paths[1] + '/submission']) {
    assert.equal(requestBodyLimit('POST', path), 16384);
    await assert.rejects(body(new Request('https://fixture.invalid' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload(16385) })), error => error.status === 413);
  }
});

function send(request, port, path, bytes, host, chunked) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'POST', rejectUnauthorized: false,
      headers: { Host: host, Origin: 'https://' + host, 'Content-Type': 'application/json', ...(!chunked ? { 'Content-Length': Buffer.byteLength(bytes) } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    if (chunked) req.write(bytes.slice(0, 100));
    req.end(chunked ? bytes.slice(100) : bytes);
  });
}

test('Node HTTP and local HTTPS transports accept large map requests and retain ordinary limits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dragon-map-budget-'));
  const storage = openStorage(join(directory, 'test.sqlite'));
  let server, tls;
  try {
    server = await startEditorServer({ storage, bucket: new FileBucket({ root: join(directory, 'private') }), port: 0,
      env: { EDITOR_ORIGIN: 'https://owned-editor.invalid', EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_DEFAULT_PASSWORD: 'Isolated budget password 123!' } });
    for (const path of paths) for (const chunked of [false, true]) {
      const result = await send(httpRequest, server.address.port, path, payload(256 * 1024), 'owned-editor.invalid', chunked);
      assert.ok([401, 403].includes(result.status), JSON.stringify(result)); // transport accepted, authorization still enforced
    }
    assert.equal((await send(httpRequest, server.address.port, '/api/auth/login', payload(16385), 'owned-editor.invalid', false)).status, 413);
    const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    tls = await createEditorHTTPS({ dispatchFetch: async (url, options) => {
      const value = await body(new Request(url, options)); return Response.json({ length: value.text.length });
    } }, { port });
    for (const path of paths) for (const chunked of [false, true]) {
      const result = await send(httpsRequest, port, path, payload(256 * 1024), '127.0.0.1:' + port, chunked);
      assert.equal(result.status, 200); assert.equal(result.value.length, 256 * 1024 - 11);
    }
    assert.equal((await send(httpsRequest, port, '/api/auth/login', payload(16385), '127.0.0.1:' + port, true)).status, 413);
  } finally {
    await tls?.close(); await server?.close(); storage.close(); rmSync(directory, { recursive: true, force: true });
  }
});
