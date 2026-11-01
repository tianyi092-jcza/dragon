// Tracked public Web bytes plus thirteen explicit player modules -> OWNED package.
// Reads only these web/ inputs (never DOS SAVE, profiles, env files or private
// editor stores). Does not use or replace the repository's shared dist/.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStaticRelease, parseStaticRelease } from '../vps/static-release.mjs';
import { createStaticResourceVerifier } from '../vps/static-resources.mjs';
import { createStaticArchiver } from '../vps/static-archive.mjs';
import { createStaticArchiveReader } from '../vps/static-archive-reader.mjs';
const archiveMode = process.argv.includes('--archive'), archiveReadMode = process.argv.includes('--archive-read');
assert.ok(!archiveReadMode || archiveMode);
assert.ok(process.argv.slice(2).every(arg => ['--archive', '--archive-read'].includes(arg)));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = realpathSync(join(root, 'web'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec)$/i.test(key)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const listing = spawnSync('git', ['ls-files', '-z', '--', 'web'], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
assert.ifError(listing.error); assert.equal(listing.status, 0, listing.stderr);
const playerModules = ['playerclient', 'playerenvironment', 'playerpack', 'playerrepository', 'playersaves', 'runtimecontract', 'playercatalog', 'playersessionhost', 'playerstatic', 'playerchapters', 'playernewgame', 'playerrestore', 'playerpublic', 'playerdeletedgame'].map(name => `web/src/player/${name}.js`);
const inputs = [...new Set([...listing.stdout.split('\0').filter(Boolean), ...playerModules])].filter(path =>
  !/(^|\/)\./.test(path) && !/^web\/content\/builtin\/compiled\/[^/]+\/game-source\.json$/.test(path));
assert.ok(inputs.length > 1000, 'actual tracked public tree, not a transport fixture');
const own = mkdtempSync(join(tmpdir(), 'dragon-static-release-'));
const pins = new Map(), metadata = new Map();
try {
  for (const path of [...inputs, 'tools/prepare_deploy.mjs', 'vps/static-release.mjs', 'reader/staticreleaseformat.js']) {
    assert.ok(!path.includes('..') && !path.includes('\\'));
    assert.notEqual(path.split('/').at(-1).toUpperCase(), 'SAVE.DAT');
    const source = join(root, path);
    assert.equal(lstatSync(source).isSymbolicLink(), false);
    if (path.startsWith('web/')) assert.ok(realpathSync(source).startsWith(web + sep));
    const bytes = readFileSync(source);
    pins.set(path, sha(bytes));
    if (path.startsWith('web/')) metadata.set(path.slice(4), { path: path.slice(4), sha256: pins.get(path), byteLength: bytes.length });
    const target = join(own, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    assert.equal(sha(readFileSync(target)), pins.get(path));
  }
  const run = () => {
    const result = spawnSync(process.execPath, ['tools/prepare_deploy.mjs'], {
      cwd: own, env, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    return readFileSync(join(own, 'dist/static-release.json'));
  };
  const first = run(), digest = sha(first), manifest = parseStaticRelease(first, digest);
  assert.ok(manifest.files.length > 1000);
  for (const path of playerModules) assert.ok(manifest.files.some(file => file.path === path.slice(4)), path);
  assert.equal(manifest.files.some(file => file.path.endsWith('/game-source.json')), false);
  assert.equal(manifest.files.some(file => /^(server|vps|reader)\//.test(file.path)), false);
  for (const file of manifest.files) {
    const bytes = readFileSync(join(own, 'dist', file.path));
    assert.equal(file.byteLength, bytes.length, file.path);
    assert.equal(file.sha256, sha(bytes), file.path);
    assert.equal(file.sha256, pins.get('web/' + file.path), file.path);
  }
  // Local source measurement and the same fixed eight role names used by
  // PublishedPacks; values come from the pinned source inputs, not a remote echo.
  const sourceTreeDigest = buildStaticRelease([...metadata.values()].filter(file => file.path.startsWith('src/') && file.path.endsWith('.js'))).manifest.sourceTreeDigest;
  const prefix = 'content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/';
  const visualAssets = {};
  for (const [group, stem] of [['seasonAtlases', 'map_atlas_'], ['seasons', 'map_tiles_']]) {
    visualAssets[group] = Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => {
      const path = prefix + stem + season + '.png', file = metadata.get(path);
      assert.ok(file, path); return [season, { ...file, url: path }];
    }));
  }
  const allowed = new Map(manifest.files.map(file => [file.path, file]));
  const readStatic = async (path, { maxBytes }) => {
    assert.ok(path === 'static-release.json' || allowed.get(path)?.kind === 'asset');
    assert.ok(maxBytes > 0);
    try { return readFileSync(join(own, 'dist', path)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const verify = createStaticResourceVerifier({ readStatic, expectedDigest: digest, sourceTreeDigest });
  const verified = await verify({ manifest: { visualAssets } });
  assert.equal(verified.filesVerified, manifest.files.filter(file => file.kind === 'asset').length);
  const music = manifest.files.find(file => file.path.startsWith('grf/music/loops/') && file.path.endsWith('.flac'));
  assert.ok(music); rmSync(join(own, 'dist', music.path));
  await assert.rejects(verify({ manifest: { visualAssets } }), /STATIC_RESOURCE_MISSING/, 'success is not cached and music is not omitted');
  assert.deepEqual(run(), first, 'repeat actual package preserves exact inventory bytes');
  let archive = null, archiveRead = null;
  if (archiveMode) {
    const objects = new Map(), prefix = 'test/actual-static-package/', base = `${prefix}artifacts/programs/${digest}/`;
    let writes = 0;
    const r2 = {
      async get(key, { maxBytes }) {
        assert.ok(key.startsWith(base));
        const value = objects.get(key);
        if (!value) return null;
        assert.ok(value.bytes.length <= maxBytes);
        return { bytes: Buffer.from(value.bytes), headers: { 'content-type': value.type } };
      },
      async putImmutable(key, bytes, type) {
        assert.ok(key.startsWith(base)); writes++;
        if (!objects.has(key)) objects.set(key, { bytes: Buffer.from(bytes), type });
      },
    };
    const stager = createStaticArchiver({ r2, readStatic, prefix, expectedDigest: digest, sourceTreeDigest, maxTotalBytes: 512 * 1024 * 1024 });
    archive = await stager.stage(() => {});
    assert.equal(archive.filesVerified, verified.filesVerified);
    assert.equal(objects.size, verified.filesVerified + 1);
    assert.equal(writes, objects.size);
    assert.deepEqual(objects.get(archive.manifestKey).bytes, first);
    for (const file of manifest.files.filter(file => file.kind === 'asset'))
      assert.equal(sha(objects.get(base + 'files/' + file.path).bytes), file.sha256, file.path);
    const before = writes;
    assert.deepEqual(await stager.stage(() => {}), archive);
    assert.equal(writes, before, 'complete retry verifies existing bytes without overwrites');
    if (archiveReadMode) {
      // Remove ONLY this test's disposable original package/source. A new reader
      // gets a GET-only port and pins, never the live file port or staging cache.
      rmSync(join(own, 'dist'), { recursive: true });
      rmSync(join(own, 'web'), { recursive: true });
      const archived = createStaticArchiveReader({ r2: { get: r2.get }, prefix, expectedDigest: digest, sourceTreeDigest, assertCurrent: () => {} });
      assert.deepEqual(await archived('static-release.json', { maxBytes: first.length }), first);
      const coldVerify = createStaticResourceVerifier({ readStatic: archived, expectedDigest: digest, sourceTreeDigest });
      archiveRead = await coldVerify({ manifest: { visualAssets } });
      assert.deepEqual(archiveRead, verified);
      for (const path of ['battle_talk.json', 'battle_display.bin', 'grf/battle_terrain_0.png', 'grf/battle_terrain_1.png', 'grf/battle_terrain_2.png', 'grf/battle_units.png', 'grf/music/playback.json', music.path]) {
        const file = allowed.get(path); assert.ok(file, path);
        assert.equal(sha(await archived(path, { maxBytes: Math.max(1, file.byteLength) })), file.sha256, path);
      }
      const musicKey = base + 'files/' + music.path, kept = objects.get(musicKey);
      objects.delete(musicKey);
      await assert.rejects(coldVerify({ manifest: { visualAssets } }), /STATIC_ARCHIVE_READ_INVALID/);
      objects.set(musicKey, kept);
      assert.equal(writes, before, 'cold reads never repair, overwrite or re-stage');
    }
  }
  for (const [path, digest] of pins) assert.equal(sha(readFileSync(join(root, path))), digest, path);
  process.stdout.write(JSON.stringify({ inputs: pins.size, files: manifest.files.length,
    sourceFiles: manifest.files.filter(file => file.path.startsWith('src/') && file.path.endsWith('.js')).length,
    bytes: manifest.files.reduce((sum, file) => sum + file.byteLength, 0), inventoryBytes: first.length,
    digest, sourceTreeDigest: manifest.sourceTreeDigest, stable: true, assetsVerified: verified.filesVerified,
    ...(archiveMode ? { archive, archiveTransport: 'owned conditional memory bucket, not workerd/cloud/serving' } : {}),
    ...(archiveReadMode ? { archiveRead, coldRead: 'owned original package/source removed; GET-only archived bytes, not browser/lazy-loader wiring' } : {}),
    scope: 'tracked worktree plus explicit player modules, public-byte inventory and owned-file-port preflight; no HTTP/import-closure/browser/cloud/old-session certificate' }) + '\n');
} finally { rmSync(own, { recursive: true, force: true }); }
