// Loopback transport and installation only. Publication, reader and title boot
// are production modules; the editor origin has no player assets or admission API.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { createDiskBucket } from '../vps/disk-bucket.mjs';
import { startPublicationServer } from '../vps/publication-server.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createPlayerService } from '../vps/player-server.mjs';
import { verifyInstalledProgram } from '../vps/installed-program.mjs';
import { createStaticResourceVerifier } from '../vps/static-resources.mjs';
import { createStaticArchiver } from '../vps/static-archive.mjs';
import { parseStaticRelease } from '../vps/static-release.mjs';
import { registerStaticProgram } from '../vps/program-registration.mjs';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { createEditorHTTPS } from './editor_local_https.mjs';

export async function startDevSites({ root, store, port, playerPort, tls, storage, bucket, env }) {
  const distRoot = join(root, 'dist'), bucketRoot = join(store, 'distribution');
  const inventory = readFileSync(join(distRoot, 'static-release.json'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const expectedDigest = sha(inventory), { sourceTreeDigest } = parseStaticRelease(inventory, expectedDigest);
  verifyInstalledProgram({ webRoot: join(root, 'web'), bundlePath: join(root, 'server/public/trialweb.txt'), expectedSourceTreeDigest: sourceTreeDigest });
  const readStatic = (path, { maxBytes }) => {
    const bytes = readFileSync(join(distRoot, path));
    if (bytes.length > maxBytes) throw new Error(`oversized local static asset: ${path}`);
    return bytes;
  };
  const pins = { readStatic, expectedDigest, sourceTreeDigest };
  const r2 = createDiskBucket({ root: bucketRoot });
  const assertCurrent = () => {};
  await createStaticArchiver({ ...pins, r2, maxTotalBytes: 256 * 1024 * 1024 }).stage(assertCurrent);
  await registerStaticProgram({ r2, releaseDigest: expectedDigest, sourceTreeDigest, assertCurrent });
  // Shared portraits are independently provisioned on the VPS. Never source
  // them from an author's game or overwrite a conflicting immutable object.
  for (const { file, sha256 } of KAO_MANIFEST) {
    const key = `kao/${file}`, bytes = readFileSync(join(distRoot, key));
    if (sha(bytes) !== sha256) throw new Error(`portrait inventory mismatch: ${key}`);
    r2.putImmutable(key, bytes, 'image/png');
    const stored = r2.get(key);
    if (stored.headers['content-type'] !== 'image/png' || !stored.bytes.equals(bytes)) throw new Error(`portrait bucket mismatch: ${key}`);
  }
  const origin = `https://127.0.0.1:${playerPort}`;
  const player = createPlayerService({ distRoot, bucketRoot, origin, activeKey: 'dev', admissionKeys: JSON.stringify({
    dev: createHmac('sha256', env.EDITOR_REQUEST_KEY).update('local-player-admission').digest('hex'),
  }) });
  const reader = await createEditorHTTPS({ dispatchFetch: (url, init) => player.fetch(new Request(url, init)) }, { port: playerPort, player: true, tls });
  try {
    const editor = await startPublicationServer({ storage, bucket, env, r2, port, intervalMs: 5000,
      verifyStaticResources: createStaticResourceVerifier(pins),
      listen: async options => {
        const service = createEditorService(options);
        return createEditorHTTPS({ dispatchFetch: (url, init) => new URL(url).pathname === '/play' && init.method === 'GET'
          ? Response.redirect(origin + '/', 302) : service.fetch(new Request(url, init)) }, { port, tls });
      },
    });
    return { close: () => Promise.all([editor.close(), reader.close()]) };
  } catch (error) { await reader.close(); throw error; }
}
