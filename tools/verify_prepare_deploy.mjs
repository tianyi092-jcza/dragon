// Local-only deployment regression. No Cloudflare, R2, DOS files or browser profiles.
// Each CLI run owns its temporary repository/dist; never run against shared dist/.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync,
  ftruncateSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseStaticRelease } from '../vps/static-release.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const tool = fileURLToPath(new URL('./prepare_deploy.mjs', import.meta.url));
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'TMPDIR', 'HOME', 'USERPROFILE', 'PATH'].filter(k => process.env[k] !== undefined)
  .map(k => [k, process.env[k]]));
const limit = 25 * 1024 * 1024;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dragon-deploy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tools'));
  mkdirSync(join(root, 'web'));
  copyFileSync(tool, join(root, 'tools/prepare_deploy.mjs'));
  mkdirSync(join(root, 'vps'));
  copyFileSync(new URL('../vps/static-release.mjs', import.meta.url), join(root, 'vps/static-release.mjs'));
  mkdirSync(join(root, 'reader'));
  copyFileSync(new URL('../reader/staticreleaseformat.js', import.meta.url), join(root, 'reader/staticreleaseformat.js'));
  function put(path, bytes = 'fixture') {
    const dest = join(root, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  function sized(path, size) {
    put(path, '');
    const fd = openSync(join(root, path), 'w');
    try { ftruncateSync(fd, size); } finally { closeSync(fd); }
  }
  function run() {
    const result = spawnSync(process.execPath, ['tools/prepare_deploy.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 30000,
    });
    assert.ifError(result.error);
    return result;
  }
  return { root, put, sized, run, has: path => existsSync(join(root, 'dist', path)) };
}

test('exclude only unified-map authoring source, preserve runtime bytes and shared engine', t => {
  const f = fixture(t);
  for (const rev of ['map-2-old', 'map-2-current']) {
    f.sized(`web/content/builtin/compiled/${rev}/game-source.json`, limit + 1);
  }
  const runtime = ['index.html', '404.html', '_headers', 'src/main.js',
    'src/editor/trialpolicy.js', 'src/editor/trialruleboundaries.js',
    'src/content/builtinrelease.generated.js', 'kao/0.png', 'kao/150.png', 'kao/255.png', 'kao/620.png',
    ...['catalog.json', 'data.json', 'terrain.bin', 'roads.json', 'road_cost.bin',
      'road_offset.json', 'map_atlas_spring.png', 'map_tiles_winter.png',
      'minimap_base.png', 'minimap_large.png'].map(p => `content/builtin/compiled/map-2-current/${p}`)];
  for (const path of runtime) f.put(`web/${path}`, `bytes:${path}`);
  f.put('server/worker.js', 'not a player worker');
  f.put('reader/worker.js', 'not production admitted');
  f.put('vps/server-main.mjs', 'not a static asset');
  f.put('dist/stale.txt');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.has('content/builtin/compiled/map-2-current/game-source.json'), false);
  assert.equal(f.has('content/builtin/compiled/map-2-old/game-source.json'), false);
  for (const path of runtime) assert.equal(readFileSync(join(f.root, 'dist', path), 'utf8'), `bytes:${path}`);
  for (const path of ['server/worker.js', 'reader/worker.js', 'vps/server-main.mjs', 'stale.txt'])
    assert.equal(f.has(path), false, path);
  const bytes = readFileSync(join(f.root, 'dist/static-release.json'));
  const inventory = parseStaticRelease(bytes, sha(bytes));
  assert.deepEqual(inventory.files.map(file => file.path), runtime.toSorted());
  for (const file of inventory.files) {
    const actual = readFileSync(join(f.root, 'dist', file.path));
    assert.equal(file.sha256, sha(actual));
    assert.equal(file.byteLength, actual.length);
    assert.equal(file.kind, file.path === '_headers' ? 'configuration' : 'asset');
  }
  assert.equal(f.run().status, 0);
  assert.deepEqual(readFileSync(join(f.root, 'dist/static-release.json')), bytes, 'repeat build is byte-identical');
});

test('oversized runtime JSON remains a hard failure before replacing output', t => {
  const f = fixture(t);
  f.sized('web/content/builtin/compiled/map-2-current/data.json', limit + 1);
  f.put('dist/keep.txt', 'previous package');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Exceeds 25 MiB: .*data\.json/);
  assert.equal(readFileSync(join(f.root, 'dist/keep.txt'), 'utf8'), 'previous package');
});

test('same filename outside the exact authoring namespace is not silently excluded', t => {
  const f = fixture(t);
  f.sized('web/content/other/game-source.json', limit + 1);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Exceeds 25 MiB: content\/other\/game-source\.json/);
});

test('25 MiB boundary remains inclusive', t => {
  const f = fixture(t);
  f.sized('web/asset.bin', limit);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.has('asset.bin'), true);
});

test('source cannot supply a generated inventory, and rejection preserves prior output', t => {
  const f = fixture(t);
  f.put('web/static-release.json', '{"untrusted":true}');
  f.put('dist/keep.txt', 'previous package');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Reserved static release inventory path/);
  assert.equal(readFileSync(join(f.root, 'dist/keep.txt'), 'utf8'), 'previous package');
});

test('existing audio/debug filtering stays unchanged', t => {
  const f = fixture(t);
  const kept = ['intro/assets/opening.mp3', 'grf/music/playback.json',
    'grf/music/loops/spring.flac', 'grf/sfx/ynsound-record3.wav', 'grf/sfx/ynsound-record13.wav'];
  const excluded = ['demo.html', 'road_graph_probe.json', 'capture/test.png',
    '.env', 'dir/.private', 'debug.log', 'grf/music/source.wav', 'grf/sfx/other.wav'];
  for (const path of [...kept, ...excluded]) f.put(`web/${path}`);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  for (const path of kept) assert.equal(f.has(path), true, path);
  for (const path of excluded) assert.equal(f.has(path), false, path);
});
