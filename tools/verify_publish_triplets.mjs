// CITY-CAPACITY-1 C6(c): publisher emits the frozen formal-pack triplet per
// graph version (v2 unchanged; v3 schema 2 / studio-app-3 / native-road-v3),
// and rejects version-less or unknown graph versions. Real SQLite + pinned
// season visuals; synthetic compiled input; no network or browser.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { PublishedPacks } = await import('../server/playpacks.js');
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const storage = openStorage(':memory:');
const actor = { id: 'owner', role: 'author', epoch: 1, must_change: 0 };
const principal = token => {
  assert.equal(token, 'owned-token');
  return actor;
};
storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)');
storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'owner', 'owned', 'author', '{}', 0, 0, 1, 1);
const visualBytes = new Map();
const runtimeAssets = {
  definition: () => ({ definitionDigest: 'd'.repeat(64) }),
  async readShared(token, paths) {
    assert.equal(token, 'owned-token');
    assert.equal(paths.length, 8);
    return { readWeb(path) { assert.ok(visualBytes.has(path)); return visualBytes.get(path); } };
  },
};
const packs = new PublishedPacks({ storage, principal, runtimeAssets, portraits: null });
for (const role of packs.policy.roles) {
  if (/\/map_(atlas_|tiles_)(spring|summer|autumn|winter)\.png$/.test(role.path)) {
    visualBytes.set(role.path, readFileSync(new URL(`../web/${role.path}`, import.meta.url)));
  }
}
assert.equal(visualBytes.size, 8);
storage.sql.exec('CREATE TABLE copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, profile_revision TEXT NOT NULL, definition_digest TEXT NOT NULL)');
storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?)', G, packs.policy.registryId, packs.policy.profileRevision, runtimeAssets.definition().definitionDigest);
const input = roadGraph => ({
  game: { gameId: G, map: { bounds: { minX: 0, minY: 0, width: 384, height: 256 } }, chapterOrder: ['c1'], chapters: { c1: { state: { marker: 1, generals: [], cities: [{ idx: 0, view: 0 }] } } }, ruleProfile: {} },
  reference: { gameId: G, draftRevision: '1', sourceDigest: 'a'.repeat(64) },
  compiled: { width: 384, height: 256, compatibilityAssetMode: 'fixture-only', terrainBytes: new Uint8Array([1]), roadGraph, roadCost: new Uint8Array([1]), roadOffsetBytes: new TextEncoder().encode('{}'), minimapGeography: new Uint8Array(384 * 256).fill(1), roadMask: new Uint8Array(384 * 256) },
});
const manifestOf = async roadGraph => {
  const ticket = await packs.prepare('owned-token', input(roadGraph));
  const staged = packs.snapshotPrepared('owned-token', ticket);
  return JSON.parse(staged.pack.manifest_json);
};
{
  const manifest = await manifestOf({ version: 2, nodes: [], edges: [] });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.buildFormat, 'studio-app-2');
  assert.equal(manifest.assets.find(e => e.assetId === 'roadGraph').role, 'native-road-v2');
  assert.equal(manifest.assets.find(e => e.assetId === 'terrain').role, 'rules-initial-terrain');
}
{
  const manifest = await manifestOf({ version: 3, nodes: [], edges: [] });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.buildFormat, 'studio-app-3');
  assert.equal(manifest.assets.find(e => e.assetId === 'roadGraph').role, 'native-road-v3');
  assert.equal(manifest.assets.find(e => e.assetId === 'terrain').role, 'rules-initial-terrain');
  assert.equal(manifest.world.width, 384);
}
{
  const graph = { version: 2, nodes: [], edges: [] }, full = await manifestOf(graph);
  storage.sql.exec('UPDATE copy_origins SET profile_revision=? WHERE game_id=?', 'fixed-template-authoring-1', G);
  const template = await manifestOf(graph);
  assert.deepEqual(template.visualAssets, full.visualAssets, 'both creation modes keep exactly the same pinned season descriptors');
  const [path, bytes] = visualBytes.entries().next().value, corrupted = Uint8Array.from(bytes);
  corrupted[0] ^= 1; visualBytes.set(path, corrupted);
  await assert.rejects(packs.prepare('owned-token', input(graph)), error => error.code === 'PLAY_VISUALS_BINDING');
  visualBytes.set(path, bytes);
  storage.sql.exec('UPDATE copy_origins SET profile_revision=? WHERE game_id=?', packs.policy.profileRevision, G);
}
for (const legacyName of [undefined, '舊章名']) {
  const source = input({ version: 2, nodes: [], edges: [] });
  source.game.chapters.c1.name = '新甲';
  if (legacyName !== undefined) source.game.chapters.c1.state.name = legacyName;
  const before = JSON.stringify(source.game);
  const pending = packs.prepare('owned-token', source);
  assert.equal(JSON.stringify(source.game), before, 'publication name projection does not rewrite author/native source');
  source.game.chapters.c1.name = '稍後修改';
  const ticket = await pending;
  const staged = packs.snapshotPrepared('owned-token', ticket);
  assert.equal(JSON.parse(staged.chapters[0].state_json).name, '新甲', 'prepared chapter uses the captured author label, not absent/stale state.name');
}
for (const roadGraph of [{}, { version: 1 }, { version: 4 }, null]) {
  await assert.rejects(packs.prepare('owned-token', input(roadGraph)), error => error.code === 'PLAY_SNAPSHOT');
}
process.stdout.write(JSON.stringify({ checks: 6, scope: 'C6(c) publisher triplets: v2 unchanged, v3 schema2/studio-app-3/native-road-v3, unknown versions rejected; CHAPTER-WB both creation profiles retain identical visuals and reject corrupt asset bytes' }) + '\n');
