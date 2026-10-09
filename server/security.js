import { scryptSync, timingSafeEqual } from 'node:crypto';
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
export const fail = (status, code) => { throw new HttpError(status, code); };
export const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const unhex = text => Uint8Array.from(text.match(/../g), s => Number.parseInt(s, 16));
const encoder = new TextEncoder();
function parse(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('invalid stored security data', { cause }); } }
export function password(value) { if (typeof value !== 'string' || [...value].length < 16 || [...value].length > 128 || value.includes('\0') || !value.isWellFormed()) fail(422, 'PASSWORD_LENGTH'); return value; }
export function account(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(value)) fail(422, 'ACCOUNT_FORMAT'); return value; }
export function passwordHash(value) {
  password(value); const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return JSON.stringify({ algorithm: 'scrypt-32768-8-3', salt, digest: hex(scryptSync(value, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })) });
}
export function passwordMatches(value, encoded) {
  if (typeof value !== 'string' || [...value].length > 128 || !value.isWellFormed() || value.includes('\0')) return false;
  const entry = parse(encoded);
  if (entry.algorithm !== 'scrypt-32768-8-3' || !/^[a-f0-9]{32}$/.test(entry.salt) || !/^[a-f0-9]{64}$/.test(entry.digest)) throw new Error('invalid stored password format');
  const derived = scryptSync(value, entry.salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(derived, unhex(entry.digest));
}
export async function sha(text) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))); }
export async function mac(text, secret) {
  const key = await crypto.subtle.importKey('raw', unhex(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))));
}
async function sealKey(secret) {
  const raw = await crypto.subtle.importKey('raw', unhex(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('dragon-editor-v1'), info: encoder.encode('operation-response') }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(value, secret, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), key = await sealKey(secret);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(JSON.stringify(value)));
  return hex(iv) + hex(new Uint8Array(ciphertext));
}
export async function unseal(value, secret, aad) {
  const key = await sealKey(secret), data = unhex(value);
  return parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: encoder.encode(aad) }, key, data.slice(12))));
}
export function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string') return false; const left = encoder.encode(a), right = encoder.encode(b); return left.length === right.length && timingSafeEqual(left, right); }
export function config(env) {
  let origin; try { const u = new URL(env.EDITOR_ORIGIN); if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error(); origin = u.origin; } catch { fail(503, 'ORIGIN_NOT_CONFIGURED'); }
  if (!/^[a-f0-9]{64}$/.test(env.EDITOR_REQUEST_KEY ?? '') || typeof env.EDITOR_DEFAULT_PASSWORD !== 'string') fail(503, 'SECRETS_NOT_CONFIGURED');
  password(env.EDITOR_DEFAULT_PASSWORD);
  const integer = (key, fallback) => { const n = env[key] === undefined ? fallback : Number(env[key]); if (!Number.isSafeInteger(n) || n < 1) fail(503, 'INVALID_POLICY'); return n; };
  return { origin, secret: env.EDITOR_REQUEST_KEY, defaultPassword: env.EDITOR_DEFAULT_PASSWORD, sessionMs: integer('EDITOR_SESSION_MS', 8 * 3600000), idleMs: integer('EDITOR_IDLE_MS', 30 * 60000), rateMs: integer('EDITOR_RATE_MS', 10 * 60000), accountLimit: integer('EDITOR_ACCOUNT_LIMIT', 5), sourceLimit: integer('EDITOR_SOURCE_LIMIT', 30) };
}
export function fields(value, expected) { if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail(422, 'REQUEST_FIELDS'); }
export async function body(request) {
  if (!request.headers.get('content-type')?.split(';')[0].trim().toLowerCase().endsWith('/json')) fail(415, 'JSON_REQUIRED');
  const reader = request.body?.getReader(); if (!reader) fail(422, 'REQUEST_BODY'); const chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 16384) fail(413, 'REQUEST_TOO_LARGE'); chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const value of chunks) { bytes.set(value, offset); offset += value.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(422, 'INVALID_JSON'); }
}
