// Owned in-memory R2 + actual tracked public bytes, plus the current default
// builtin tuple when it exists as uncommitted worktree files (commit needs
// separate authorization). Static reads remain a local file port, NOT HTTPS or
// an old-session retention/engine-compatibility certificate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUILTIN_RELEASE } from '../../web/src/content/builtinrelease.generated.js';
import { createRuntimeStager } from '../../vps/runtime-stage.mjs';
import { buildStaticRelease, parseStaticRelease } from '../../vps/static-release.mjs';
import { createStaticResourceVerifier } from '../../vps/static-resources.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function makePublishRuntimeStage({ root, includePlayerModules = false }) {
  assert.equal(existsSync(root), false, 'caller-owned fresh package directory');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec)$/i.test(key)));
  const listing = spawnSync('git', ['ls-files', '-z', '--', 'web'], { env, encoding: 'utf8', timeout: 30000 });
  assert.ifError(listing.error); assert.equal(listing.status, 0, listing.stderr);
  // Local work may be intentionally uncommitted. Use the already-built program
  // inventory rather than a stale hand-maintained subset of its JS dependencies.
  const playerPaths = [];
  if (includePlayerModules) {
    let bundle;
    try { bundle = JSON.parse(readFileSync('server/public/trialweb.txt', 'utf8')); }
    catch (cause) { throw new Error('owned installed program inventory required', { cause }); }
    assert.ok(Array.isArray(bundle.files)); assert.equal(bundle.fileCount, bundle.files.length);
    for (const file of bundle.files) {
      assert.equal(typeof file.path, 'string');
      if (!file.path.startsWith('src/') || !file.path.endsWith('.js')) continue;
      assert.match(file.path, /^src\/[A-Za-z0-9_./-]+\.js$/); assert.ok(!file.path.includes('..'));
      const path = 'web/' + file.path, bytes = readFileSync(path);
      assert.equal(bytes.length, file.byteLength); assert.equal(sha(bytes), file.sha256);
      assert.equal(bytes.toString('utf8'), file.text); playerPaths.push(path);
    }
    assert.ok(playerPaths.length > 0);
  }
  const dirOf = url => 'web/' + url.slice(0, url.lastIndexOf('/') + 1);
  const defaultDirs = [dirOf(BUILTIN_RELEASE.resources.catalogURL), dirOf(BUILTIN_RELEASE.entitySource.manifestURL)];
  const untracked = spawnSync('git', ['ls-files', '-z', '--others', '--exclude-standard', '--', ...defaultDirs], { env, encoding: 'utf8', timeout: 30000 });
  assert.ifError(untracked.error); assert.equal(untracked.status, 0, untracked.stderr);
  const paths = [...new Set([...listing.stdout.split('\0').filter(Boolean), ...untracked.stdout.split('\0').filter(Boolean), ...playerPaths])].filter(path => !/(^|\/)\./.test(path) && !/^web\/content\/builtin\/compiled\/[^/]+\/game-source\.json$/.test(path));
  const objects = new Map(), prefix = 'test/owned-publish-root/';
  const entries = paths.map(path => {
    assert.ok(path.startsWith('web/') && !path.includes('..') && !path.includes('\\'));
    assert.equal(lstatSync(path).isSymbolicLink(), false);
    const bytes = readFileSync(path), relative = path.slice(4);
    const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(path, target);
    assert.equal(sha(readFileSync(target)), sha(bytes));
    if (/^kao\/p?[0-9]{1,6}\.png$/.test(relative)) objects.set(prefix + relative, { bytes, headers: { 'content-type': 'image/png' } });
    return { path: relative, byteLength: bytes.length, sha256: sha(bytes) };
  });
  assert.equal(objects.size, 621);
  for (const path of ['tools/prepare_deploy.mjs', 'vps/static-release.mjs', 'reader/staticreleaseformat.js']) {
    const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(path, target);
    assert.deepEqual(readFileSync(target), readFileSync(path));
  }
  const prepared = spawnSync(process.execPath, ['tools/prepare_deploy.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 90000 });
  assert.ifError(prepared.error); assert.equal(prepared.status, 0, prepared.stderr);
  const inventory = readFileSync(join(root, 'dist/static-release.json')), digest = sha(inventory);
  const manifest = parseStaticRelease(inventory, digest), inputs = new Map(entries.map(entry => [entry.path, entry]));
  for (const file of manifest.files) {
    assert.equal(file.sha256, inputs.get(file.path)?.sha256);
    assert.equal(file.byteLength, inputs.get(file.path)?.byteLength);
  }
  const sourceTreeDigest = buildStaticRelease(entries.filter(file => file.path.startsWith('src/') && file.path.endsWith('.js'))).manifest.sourceTreeDigest;
  assert.equal(manifest.sourceTreeDigest, sourceTreeDigest);
  const allowed = new Set(manifest.files.filter(file => file.kind === 'asset').map(file => file.path));
  assert.ok(allowed.size > 1000);
  let gets = 0, puts = 0, staticReads = 0, staticChecks = 0, hook = null;
  const verifyStaticResources = createStaticResourceVerifier({
    expectedDigest: digest, sourceTreeDigest,
    readStatic: async (path, { maxBytes }) => {
      staticReads++;
      assert.ok(path === 'static-release.json' || allowed.has(path));
      const bytes = readFileSync(join(root, 'dist', path));
      assert.ok(bytes.length <= maxBytes); return bytes;
    },
  });
  const fire = async (kind, key) => {
    if (hook?.kind === kind) { const callback = hook.callback; hook = null; await callback(key); }
  };
  const r2 = {
    async get(key, { maxBytes }) {
      gets++; assert.ok(key.startsWith(prefix + 'artifacts/') || key.startsWith(prefix + 'kao/'));
      const object = objects.get(key);
      await fire('get', key);
      if (!object) return null;
      assert.ok(object.bytes.length <= maxBytes);
      return { bytes: Buffer.from(object.bytes), headers: { ...object.headers } };
    },
    async putImmutable(key, bytes, type) {
      puts++; assert.ok(key.startsWith(prefix + 'artifacts/'));
      if (!objects.has(key)) objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': type } });
      await fire('put', key);
    },
  };
  const stager = createRuntimeStager({ r2, prefix, verifyStaticResources: async value => { staticChecks++; return verifyStaticResources(value); } });
  return Object.freeze({ stager, objects, prefix, verifyStaticResources,
    interceptOnce(kind, callback) { assert.equal(hook, null); assert.ok(['get', 'put'].includes(kind)); hook = { kind, callback }; },
    stats() { return { gets, puts, staticReads, staticChecks, staticAssets: allowed.size, staticDigest: digest }; },
  });
}
