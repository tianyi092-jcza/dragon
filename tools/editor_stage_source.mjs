// Explicit operator bootstrap: fixed Web bytes to isolated R2, never account impersonation/SQL approval.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function stageInstalledEditorSource(bucket) {
  if (typeof bucket?.get !== 'function' || typeof bucket?.put !== 'function') throw new TypeError('actual operator R2 required');
  const readWeb = path => Buffer.from(readFileSync(new URL('../web/' + path, import.meta.url)));
  // Pinned role bytes are read directly and verified per-role below against
  // the server pinned manifests. The Web-default trusted-copy gate is a
  // separate scope and must not decide which pinned bytes get staged.
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
    const bytes = readWeb(role.path); if (!bytes || bytes.length !== role.byteLength || sha(bytes) !== role.sha256) throw new Error('pinned source role mismatch');
    const chunks = []; for (let at = 0; at < bytes.length; at += 1024 * 1024) chunks.push(await put(bytes.subarray(at, at + 1024 * 1024)));
    roles.push({ ...role, chunks });
  }
  const root = await put(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  return { registryId: policy.registryId, root };
}
