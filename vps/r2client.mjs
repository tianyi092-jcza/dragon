// Minimal R2 object client over raw HTTPS (no dependencies).
// Auth via ./r2sign.mjs. Credentials never leave the caller's env file.
import { createHash } from 'node:crypto';
import { requestHTTPSBytes } from './https-bytes.mjs';
import { signR2 } from './r2sign.mjs';
import { MAX_METADATA_BYTES, MAX_RESOURCE_BYTES } from '../reader/runtimecontract.js';

const sha256hex = bytes => createHash('sha256').update(bytes).digest('hex');

function call({ accountId, accessKeyId, secretAccessKey, method, key, query = {}, headers = {}, body = null, maxBytes = MAX_METADATA_BYTES, timeoutMs = 60000 }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESOURCE_BYTES) throw new TypeError('R2 response budget invalid');
  const payloadSha = body ? sha256hex(body) : 'UNSIGNED-PAYLOAD';
  const signed = signR2({ accountId, accessKeyId, secretAccessKey, method, key, query, headers, payloadSha256: payloadSha });
  return requestHTTPSBytes({
    url: `https://${signed.host}${signed.path}`, method,
    headers: { ...signed.headers, ...headers }, body, maxBytes, maxErrorBytes: 64 * 1024, timeoutMs, errorPrefix: 'R2',
  });
}

export function r2client({ accountId, accessKeyId, secretAccessKey, bucket, timeoutMs = 60000 }) {
  if (!bucket) { throw new TypeError('bucket required'); }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new TypeError('R2 deadline invalid');
  const invoke = options => call({ accountId, accessKeyId, secretAccessKey, timeoutMs, ...options });
  const key = suffix => `${bucket}/${suffix}`.replace(/\/+/g, '/');
  return Object.freeze({
    async list(prefix, maxKeys = 1000) {
      const r = await invoke({ method: 'GET', key: bucket, query: { 'list-type': '2', prefix, 'max-keys': String(maxKeys) } });
      if (r.status !== 200) { throw new Error(`R2 list ${r.status}`); }
      const out = [], re = /<Key>([^<]*)<\/Key>/g;
      let match; while ((match = re.exec(r.bytes.toString('utf8'))) !== null) { out.push(match[1]); }
      return out;
    },
    // 只給遷移／稽核用：跟著 NextContinuationToken 走完整個前綴。list() 的
    // 單頁語意（回收器依賴它）不變，避免一次改動波及既有呼叫端。
    async listAll(prefix, maxKeys = 1000) {
      const out = [];
      let token = null;
      for (let page = 0; page < 10000; page++) {
        const query = { 'list-type': '2', prefix, 'max-keys': String(maxKeys) };
        if (token !== null) query['continuation-token'] = token;
        const r = await invoke({ method: 'GET', key: bucket, query });
        if (r.status !== 200) { throw new Error(`R2 list ${r.status}`); }
        const text = r.bytes.toString('utf8');
        const re = /<Key>([^<]*)<\/Key>/g;
        let match; while ((match = re.exec(text)) !== null) { out.push(match[1]); }
        if (!/<IsTruncated>true<\/IsTruncated>/.test(text)) { return out; }
        const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text);
        if (next === null) { throw new Error('R2 list continuation missing'); }
        token = next[1];
      }
      throw new Error('R2 list pagination runaway');
    },
    async get(suffix, { maxBytes = MAX_RESOURCE_BYTES } = {}) {
      const r = await invoke({ method: 'GET', key: key(suffix), maxBytes });
      // Unconditional GET has no precondition: 412 is not proof of absence.
      if (r.status === 404) { return null; }
      if (r.status !== 200) { throw new Error(`R2 get ${r.status}`); }
      return r;
    },
    async putImmutable(suffix, bytes, contentType = 'application/octet-stream') {
      const r = await invoke({ method: 'PUT', key: key(suffix), headers: { 'If-None-Match': '*', 'Content-Type': contentType, 'Cache-Control': 'no-store' }, body: Buffer.from(bytes) });
      if (r.status === 412) { return null; }
      if (r.status !== 200) { throw new Error(`R2 put ${r.status}`); }
      return r;
    },
    async putControl(suffix, bytes, ifMatch = null) {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      if (ifMatch === null) { headers['If-None-Match'] = '*'; }
      else { headers['If-Match'] = ifMatch; }
      const r = await invoke({ method: 'PUT', key: key(suffix), headers, body: Buffer.from(bytes) });
      if (r.status === 412) { return null; }
      if (r.status !== 200) { throw new Error(`R2 control put ${r.status}`); }
      return r;
    },
    async remove(suffix) {
      const r = await invoke({ method: 'DELETE', key: key(suffix) });
      if (r.status !== 204 && r.status !== 404) { throw new Error(`R2 delete ${r.status}`); }
      return r.status;
    },
  });
}
