// Explicit operator bootstrap: fixed Web bytes to isolated R2, never account impersonation/SQL approval.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function stageInstalledEditorSource(bucket) {
  if (typeof bucket?.get !== 'function' || typeof bucket?.put !== 'function') throw new TypeError('actual operator R2 required');
  const captured = new Map(), readWeb = path => { const bytes = readFileSync(new URL('../web/' + path, import.meta.url)); captured.set(path, Buffer.from(bytes)); return bytes; };
  const load = createPinnedCopyLoader({ readWeb });
  await load({ gameId: randomUUID(), ownerId: 'operator-source-preflight' });
  const policy = installedSourcePolicy(readFileSync(new URL('../server/pinned/world-manifest.txt', import.meta.url)), readFileSync(new URL('../server/pinned/entity-manifest.txt', import.meta.url)));
  const definitionDigest = sha(Buffer.concat(encodeSourceChunks(policy))), roles = [];
  async function put(bytes) {
    const descriptor = { sha256: sha(bytes), byteLength: bytes.length }, key = `installed/${policy.registryId}/${descriptor.sha256}`;
    const old = await bucket.get(key);
    if (old) { const actual = new Uint8Array(await old.arrayBuffer()); if (actual.length !== bytes.length || sha(actual) !== descriptor.sha256) throw new Error('installed source object conflict'); }
    else if (!await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } })) throw new Error('installed source staging conflict');
    const stored = await bucket.get(key); if (!stored) throw new Error('installed source staging missing');
    const actual = new Uint8Array(await stored.arrayBuffer()); if (actual.length !== bytes.length || sha(actual) !== descriptor.sha256) throw new Error('installed source staging integrity');
    return descriptor;
  }
  for (const role of policy.roles) {
    const bytes = captured.get(role.path); if (!bytes || bytes.length !== role.byteLength || sha(bytes) !== role.sha256) throw new Error('pinned source role mismatch');
    const chunks = []; for (let at = 0; at < bytes.length; at += 1024 * 1024) chunks.push(await put(bytes.subarray(at, at + 1024 * 1024)));
    roles.push({ ...role, chunks });
  }
  const root = await put(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  return { registryId: policy.registryId, root };
}
