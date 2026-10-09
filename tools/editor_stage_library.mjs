// Explicit operator-only fixed available bytes. Does NOT authorize a game or runtime.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installedAvailableLibraryPolicy } from '../server/sourcecatalogpolicy.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function stageInstalledAvailableLibrary(bucket) {
  if (typeof bucket?.get !== 'function' || typeof bucket?.put !== 'function') throw new TypeError('actual operator R2 required');
  const manifest = readFileSync(new URL('../server/available-library.txt', import.meta.url)), policy = installedAvailableLibraryPolicy(manifest), captured = new Map();
  for (const [path, expected] of Object.entries(policy.programHashes)) if (sha(readFileSync(new URL('../' + path, import.meta.url))) !== expected) throw new Error('available library consumer fingerprint mismatch');
  // Capture every bounded fixed role BEFORE first await. No untrusted paths/latest.
  for (const role of policy.roles) {
    const bytes = role.path === 'available-library-manifest.json' ? Buffer.from(manifest) : readFileSync(new URL('../web/' + role.path, import.meta.url));
    if (bytes.length !== role.byteLength || sha(bytes) !== role.sha256) throw new Error('available library role mismatch');
    captured.set(role.path, bytes);
  }
  const definitionDigest = sha(Buffer.concat(encodeSourceChunks(policy))), roles = [];
  async function put(bytes) {
    const descriptor = { sha256: sha(bytes), byteLength: bytes.length }, key = 'installed/' + policy.registryId + '/' + descriptor.sha256;
    const old = await bucket.get(key);
    if (old) { const actual = new Uint8Array(await old.arrayBuffer()); if (actual.length !== bytes.length || sha(actual) !== descriptor.sha256) throw new Error('available library object conflict'); }
    else if (!await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } })) throw new Error('available library staging conflict');
    const stored = await bucket.get(key); if (!stored) throw new Error('available library staging missing');
    const actual = new Uint8Array(await stored.arrayBuffer()); if (actual.length !== bytes.length || sha(actual) !== descriptor.sha256) throw new Error('available library staging integrity');
    return descriptor;
  }
  for (const role of policy.roles) {
    const bytes = captured.get(role.path), chunks = [];
    for (let at = 0; at < bytes.length; at += 1024 * 1024) chunks.push(await put(bytes.subarray(at, at + 1024 * 1024)));
    roles.push({ ...role, chunks });
  }
  const root = await put(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  for (const [path, expected] of Object.entries(policy.programHashes)) if (sha(readFileSync(new URL('../' + path, import.meta.url))) !== expected) throw new Error('available library consumer changed during staging');
  return { registryId: policy.registryId, root };
}
