// Persistence seam, not a compiler/runtime or HTTP permission certificate.
// Real SQLite + real pack/ledger/pin/outbox/announcement stores. Synthetic
// compiled input; visual reader is a test port over exactly eight pinned images.
// No network, user DB, DOS data, or browser profile. Memory DB is always closed.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { PublishedPacks } = await import('../server/playpacks.js');
const { PublishedGames } = await import('../server/published.js');
const { GameMetadataStore } = await import('../server/metadata.js');
const { ReleaseLedger } = await import('../server/releases.js');
const { DistributionOutbox } = await import('../server/distribution.js');
const { AnnouncementStore } = await import('../server/announcements.js');
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const storage = openStorage(':memory:');
let groups = 0;
try {
  const actor = { id: 'owner', role: 'author', epoch: 1, must_change: 0 };
  const principal = token => {
    assert.equal(token, 'owned-token');
    return actor;
  };
  storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)');
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'owner', 'owned', 'author', '{}', 0, 0, 1, 1);
  const games = new GameMetadataStore({ storage, principal, recoverAllocation: () => { throw new Error('unused'); } });
  storage.sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', G, 'owner', 'Owned', '', null, null, '1', '1', null, '0', 1, 0, 't', 't');
  const rows = query => storage.sql.exec(query).toArray();
  const ledger = new ReleaseLedger({ storage, principal, games });
  const registry = new PublishedGames({ storage, principal });
  const outbox = new DistributionOutbox({ storage });
  const announcements = new AnnouncementStore({ storage });
  const visualBytes = new Map();
  let pause = null, captures = 0;
  const runtimeAssets = {
    definition: () => ({ definitionDigest: 'd'.repeat(64) }),
    async capture(token, reference, paths) {
      captures++;
      assert.equal(token, 'owned-token'); assert.equal(reference.gameId, G);
      assert.equal(paths.length, 8);
      assert.ok(paths.every(path => visualBytes.has(path)));
      if (pause) await pause();
      return { readWeb(path) { assert.ok(visualBytes.has(path)); return visualBytes.get(path); } };
    },
  };
  const packs = new PublishedPacks({ storage, principal, runtimeAssets });
  for (const role of packs.policy.roles) {
    if (/\/map_(atlas_|tiles_)(spring|summer|autumn|winter)\.png$/.test(role.path)) {
      visualBytes.set(role.path, readFileSync(new URL(`../web/${role.path}`, import.meta.url)));
    }
  }
  assert.equal(visualBytes.size, 8);
  storage.sql.exec('CREATE TABLE copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, profile_revision TEXT NOT NULL, definition_digest TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?)', G, packs.policy.registryId, packs.policy.profileRevision, runtimeAssets.definition().definitionDigest);
  const input = revision => ({
    game: { gameId: G, map: { bounds: { minX: 0, minY: 0, width: 384, height: 256 } }, chapterOrder: ['c1'], chapters: { c1: { state: { marker: revision, generals: [], cities: [{ idx: 0, view: 0 }] } } }, ruleProfile: { fixture: revision } },
    reference: { gameId: G, draftRevision: String(revision), sourceDigest: (revision === 1 ? 'a' : 'b').repeat(64) },
    compiled: { width: 384, height: 256, compatibilityAssetMode: 'fixture-only', terrainBytes: new Uint8Array([revision]), roadGraph: { marker: revision }, roadCost: new Uint8Array([revision]), roadOffsetBytes: new TextEncoder().encode('{}'), minimapGeography: new Uint8Array(384 * 256).fill(1), roadMask: new Uint8Array(384 * 256) },
  });
  const tables = ['content_games', 'published_packs', 'published_pack_chapters', 'published_pack_assets', 'published_games', 'content_releases', 'content_distribution_outbox', 'content_announcements', 'content_registry'];
  const snapshot = () => tables.map(table => rows(`SELECT * FROM ${table} ORDER BY rowid`));
  const commit = (ticket, value) => storage.transactionSync(() => {
    packs.installPreparedInTxn('owned-token', ticket);
    const { draftRevision, sourceDigest } = value.reference;
    const release = ledger.issueInTxn('owned-token', G, draftRevision, sourceDigest);
    registry.publishInTxn('owned-token', { gameId: G, name: 'Owned', revision: draftRevision, sourceDigest, chapters: ['c1'], ordinal: release.ordinal });
    ledger.pruneExceptInTxn('owned-token', G, release.releaseId);
    outbox.enqueueInTxn({ gameId: G, ordinal: release.ordinal, releaseId: release.releaseId });
    announcements.announceCurrentInTxn(G);
    return release;
  });
  const first = input(1), initial = snapshot();
  const firstTicket = await packs.prepare('owned-token', first);
  assert.deepEqual(snapshot(), initial, 'preparation must not install any SQL row');
  const staged = packs.snapshotPrepared('owned-token', firstTicket);
  const changed = packs.snapshotPrepared('owned-token', firstTicket);
  changed.assets.find(row => row.asset_id === 'terrain').bytes[0] = 255;
  assert.deepEqual(packs.snapshotPrepared('owned-token', firstTicket), staged, 'staging copies cannot change the prepared package');
  assert.throws(() => { staged.chapters.push({}); }, TypeError);
  assert.deepEqual(snapshot(), initial, 'staging export writes nothing'); groups++;
  assert.throws(() => packs.snapshotPrepared('owned-token', {}), error => error.code === 'PLAY_PREPARED');
  const otherPacks = new PublishedPacks({ storage, principal, runtimeAssets });
  assert.throws(() => otherPacks.snapshotPrepared('owned-token', firstTicket), error => error.code === 'PLAY_PREPARED');
  actor.epoch++;
  assert.throws(() => packs.snapshotPrepared('owned-token', firstTicket), error => error.code === 'SESSION_INVALID');
  actor.epoch--; groups++;
  const r1 = commit(firstTicket, first);
  assert.deepEqual({ ...rows('SELECT game_id,revision,source_digest,manifest_json FROM published_packs')[0] }, staged.pack);
  assert.deepEqual(rows('SELECT chapter_id,state_json FROM published_pack_chapters').map(row => ({ ...row })), staged.chapters);
  assert.deepEqual(rows('SELECT * FROM published_pack_assets').map(row => ({ ...row, bytes: Buffer.from(row.bytes) })), staged.assets);
  assert.throws(() => packs.snapshotPrepared('owned-token', firstTicket), error => error.code === 'PLAY_PREPARED'); groups++;
  assert.equal(r1.ordinal, '1.0');
  assert.equal(packs.pack(G).chapter.marker, 1);
  const old = snapshot();
  groups++;
  for (const [cities, code] of [[null, 'PLAY_SNAPSHOT'], [[{ idx: 0, view: 255 }], 'PLAY_CITY_VIEW_MISSING']]) {
    const bad = input(2), before = captures;
    bad.game.chapters.c1.state.cities = cities;
    await assert.rejects(packs.prepare('owned-token', bad), error => error.code === code);
    assert.equal(captures, before, 'bad city dependency rejects before visual I/O');
    assert.deepEqual(snapshot(), old, 'bad city dependency preserves live pack and all publication tables'); groups++;
  }

  // Every failure is after preparation; some occur after pack replacement,
  // ordinal consumption, pruning or pin replacement inside the transaction.
  for (const table of ['published_packs', 'published_pack_chapters', 'published_pack_assets', 'content_releases', 'published_games', 'content_distribution_outbox', 'content_announcements']) {
    const second = input(2), ticket = await packs.prepare('owned-token', second);
    assert.deepEqual(snapshot(), old, 'old version remains visible while prepared');
    storage.sql.exec(`CREATE TEMP TRIGGER owned_abort BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'owned publish fault'); END`);
    try { assert.throws(() => commit(ticket, second), /owned publish fault/); }
    finally { storage.sql.exec('DROP TRIGGER owned_abort'); }
    assert.deepEqual(snapshot(), old, table);
    assert.equal(packs.pack(G).chapter.marker, 1);
    assert.equal(packs.asset(G, '1', 'a'.repeat(64), 'terrain').bytes[0], 1);
    groups++;
  }
  assert.throws(() => storage.transactionSync(() => packs.installPreparedInTxn('owned-token', {})), error => error.code === 'PLAY_PREPARED');
  const stale = await packs.prepare('owned-token', input(2));
  actor.epoch++;
  assert.throws(() => storage.transactionSync(() => packs.installPreparedInTxn('owned-token', stale)), error => error.code === 'SESSION_INVALID');
  actor.epoch--;
  assert.deepEqual(snapshot(), old);
  groups++;

  // Mutations during the asynchronous read cannot alter the private capture.
  const mutable = input(2);
  pause = async () => {
    mutable.game.chapters.c1.state.marker = 999;
    mutable.game.chapters.c1.state.cities[0].view = 255;
    mutable.game.ruleProfile.fixture = 999;
    mutable.game.chapterOrder.push('other');
    mutable.reference.gameId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    mutable.reference.draftRevision = '999';
    mutable.compiled.terrainBytes[0] = 99;
    mutable.compiled.width = 999;
  };
  const secondTicket = await packs.prepare('owned-token', mutable);
  pause = null;
  assert.deepEqual(snapshot(), old);
  const r2 = commit(secondTicket, input(2));
  assert.equal(r2.ordinal, '1.1', 'failed commits consume no ordinal');
  const current = packs.pack(G);
  assert.equal(current.chapter.marker, 2);
  assert.equal(current.chapter.cities[0].view, 0, 'late caller mutation cannot replace checked city reference');
  assert.equal(current.manifest.ruleProfile.fixture, 2);
  assert.equal(current.manifest.world.width, 384);
  assert.deepEqual(current.manifest.chapters, ['c1']);
  assert.equal(packs.asset(G, '2', 'b'.repeat(64), 'terrain').bytes[0], 2);
  assert.equal(rows('SELECT * FROM content_releases').length, 1);
  assert.equal(rows('SELECT * FROM content_announcements').length, 2);
  assert.equal(announcements.list().announcements[1].releaseId, r1.releaseId);
  assert.equal(outbox.pending().length, 2, 'historical pending row must not be silently confirmed');
  assert.throws(() => storage.transactionSync(() => packs.installPreparedInTxn('owned-token', secondTicket)), error => error.code === 'PLAY_PREPARED');
  groups++;
  process.stdout.write(`publish atomicity: ${groups} groups passed\n`);
} finally { storage.close(); }
