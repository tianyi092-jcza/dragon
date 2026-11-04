// A 路線第一版（同步發布）的可回滾契約：同一本帳本，注入 drain 才在同一次 HTTP 內推進。
// 直接組裝真實應用＋真實 publisher＋記憶體 R2；不用瀏覽器、不連雲端、不開 socket。
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { installedSourcePolicy } = await import('../server/sourcecatalogpolicy.js');
const { encodeSourceChunks } = await import('../web/src/content/authoring/sourcejson.js');
const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
const { mac } = await import('../server/security.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ADMIN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OWNER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const origin = 'https://owned-editor.invalid', secret = 'c'.repeat(64), token = '1'.repeat(64), adminToken = '2'.repeat(64), hash = sha(token), adminHash = sha(adminToken);
const scratch = mkdtempSync(join(tmpdir(), 'publish-sync-'));
const storage = openStorage(join(scratch, 'sync.sqlite'));
let gameId, groups = 0, drainCalls = 0, drainFailure = null;
try {
  // 1) 可信組裝門：非函式 drain、或非 frozen 模式一律在動 SQL 前拒絕。
  const stagerPort = { async stage() { throw new Error('unexpected stage'); }, verifyStaged() { throw new Error('unexpected proof'); } };
  for (const options of [{ frozenPublication: true, runtimeStager: stagerPort, distributionDrain: 1 }, { frozenPublication: true, runtimeStager: stagerPort, distributionDrain: {} }, { distributionDrain: () => ({}) }]) {
    const owned = openStorage(':memory:');
    try {
      assert.throws(() => createEditorApplication(class {}, options), TypeError);
      assert.equal(owned.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").toArray()[0].n, 0);
      groups++;
    } finally { owned.close(); }
  }
  const staging = (await import('./fixtures/publish-runtime-stage.mjs')).makePublishRuntimeStage({ root: join(scratch, 'static-package') });
  const bucket = new FileBucket({ root: join(scratch, 'objects') });
  const env = { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: secret, EDITOR_DEFAULT_PASSWORD: 'Owned-Test-Password-Only-1!', EDITOR_BLOBS: bucket };
  // 同步態與回滾態共用同一份裝配，只差是否注入 drain。
  const makeApp = drain => {
    const ports = { runtimeStager: staging.stager, frozenPublication: true };
    if (drain) { ports.distributionDrain = drain; }
    return new (createEditorApplication(class {}, ports))({ storage }, env);
  };
  // 回滾態：不注入 drain（舊協議）。
  let app = makeApp(null);
  const sql = storage.sql;
  for (const [id, account, role, tokenHash] of [[ADMIN, 'tianyi', 'admin', adminHash], [OWNER, 'owned_author', 'author', hash]]) {
    sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role, '{}', 0, 0, 1, 1, '', '', '', '');
    sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', tokenHash, id, 1, Date.now() + 3600000, Date.now() + 3600000);
  }
  // 發佈門要的兩個惰性 schema 所有者。
  const { GameDeletionJobFreeze } = await import('../server/deletionjobfreeze.js');
  const { GameDeletionDraftFreeze } = await import('../server/deletiondraftfreeze.js');
  const freezeOptions = { storage, principal: () => { throw new Error('unused owned freeze principal'); }, requestKey: secret };
  new GameDeletionJobFreeze(freezeOptions); new GameDeletionDraftFreeze(freezeOptions);
  // 固定來源 install ＋ pinned 全份複製＝一份真正可發佈的 20 章遊戲。
  const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
  const stageInstalled = async bytes => {
    const data = new Uint8Array(bytes), digest = sha(data), key = `installed/${policy.registryId}/${digest}`;
    if (!await bucket.get(key)) { await bucket.put(key, data, {}); }
    return { sha256: digest, byteLength: data.length };
  };
  const roles = [];
  for (const role of policy.roles) {
    const data = readFileSync(join('web', role.path)), chunks = [];
    for (let at = 0; at < data.length; at += 1048576) { chunks.push(await stageInstalled(data.subarray(at, at + 1048576))); }
    roles.push({ path: role.path, sha256: role.sha256, byteLength: role.byteLength, chunks });
  }
  const definitionDigest = app.installedSources.definition().definitionDigest;
  const installedRoot = await stageInstalled(Buffer.concat(encodeSourceChunks({ schema: 'dragon-installed-source-index-1', registryId: policy.registryId, definitionDigest, roles })));
  await app.installedSources.install(adminHash, policy.registryId, installedRoot, 'owned-sync-install-01');
  const allocation = app.games.allocateGameId(hash); gameId = allocation.gameId;
  const { game } = await createPinnedCopyLoader()({ gameId, ownerId: OWNER });
  const stageGame = async bytes => {
    const put = await app.blobs.putImmutable(hash, { gameId, allocation, bytes: new Uint8Array(bytes) });
    return { sha256: put.sha256, byteLength: put.byteLength };
  };
  const all = createHash('sha256'), chunks = [];
  for (const bytes of encodeSourceChunks(game)) { all.update(bytes); chunks.push(await stageGame(bytes)); }
  const sourceDigest = all.digest('hex');
  const root = await stageGame(Buffer.concat(encodeSourceChunks({ schema: 'dragon-game-source-index-1', gameId, sourceDigest, sourceByteLength: chunks.reduce((n, part) => n + part.byteLength, 0), chunks, dependencies: [] })));
  storage.transactionSync(() => {
    sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', gameId, root.sha256, root.byteLength, 'committed');
    sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', gameId, policy.registryId, definitionDigest, installedRoot.sha256, policy.profileRevision, root.sha256, root.byteLength, sourceDigest, sourceDigest, createHash('sha256').update(JSON.stringify([['chunks', chunks.length]])).digest('hex'));
  });
  const prepared = await app.games.prepareSnapshot(hash, { gameId, draftRevision: '1', metadata: { ...game.metadata }, source: root, allocation });
  app.games.transaction(hash, { key: 'owned-sync-create-01', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, prepared));
  const csrf = await mac(`csrf:${token}`, secret), adminCsrf = await mac(`csrf:${adminToken}`, secret);
  // 記憶體 R2：根 CAS 以 etag 比對，不可變物件與收據只寫一次。
  const objects = new Map();
  let roots = 0;
  const r2 = {
    async get(key, { maxBytes }) {
      const value = objects.get(key) ?? staging.objects.get(key);
      if (!value) { return null; }
      assert.ok(value.bytes.length <= maxBytes);
      return { bytes: Buffer.from(value.bytes), headers: { ...value.headers } };
    },
    async putImmutable(key, bytes, type) {
      if (!objects.has(key)) { objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': type, etag: `"immutable-${sha(bytes)}"`, 'last-modified': 'Thu, 15 Oct 2026 00:00:00 GMT' } }); }
    },
    async putControl(key, bytes, etag) {
      if (key === `${staging.prefix}control/directory.json`) {
        objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': 'application/json', etag: `"directory-${++roots}"`, 'last-modified': 'Thu, 15 Oct 2026 00:00:00 GMT' } });
        return true;
      }
      const previous = objects.get(key);
      if ((previous?.headers.etag ?? null) !== (etag ?? null)) { return false; }
      roots += 1;
      objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': 'application/json', etag: `"root-${roots}"`, 'last-modified': new Date(Date.UTC(2026, 9, 15, 0, 0, roots)).toUTCString() } });
      return true;
    },
  };
  const publisher = createDistributionPublisher({ storage, r2, prefix: staging.prefix, verifyStaticResources: staging.verifyStaticResources });
  // 第一個請求用舊協議（未注入 drain）確認 rollback 態沒有多餘欄位。
  const publishRequest = (key, name) => new Request(`${origin}/api/publish`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': key }, body: JSON.stringify({ gameId, name }) });
  const publish = async (target, key, name) => {
    const response = await target.fetch(publishRequest(key, name));
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  const statusOf = async key => {
    const response = await app.fetch(new Request(`${origin}/api/games/${gameId}/publish-operations/${key}`, { headers: { Cookie: `__Secure-dragon-editor=${token}` } }));
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
  const confirmed = () => { const status = app.frozenDistribution.status(); return status.tailGeneration > 0 && status.confirmedGeneration === status.tailGeneration; };
  // 2) 回滾態：回應與舊協議逐位元相同，分發仍待確認。
  const legacy = await publish(app, 'owned-sync-legacy-01', '同步回歸');
  assert.equal('distribution' in legacy, false, '未注入 drain 時不得多帶分發欄位');
  assert.equal(sql.exec('SELECT COUNT(*) AS n FROM content_distribution_events').toArray()[0].n, 1);
  assert.equal(app.frozenDistribution.status().confirmedGeneration, 0);
  const legacyStatus = await statusOf('owned-sync-legacy-01');
  assert.equal(legacyStatus.distribution.state, 'pending'); groups++;
  // 3) 排程器路徑照舊可用（兩條路徑並存一代）。
  await publisher.drainOne(); assert.equal(confirmed(), true); groups++;
  // 4) 同步態：注入 drain 後，回應自帶已確認描述子，且不需要外部排空。
  const sync = makeApp(async () => { drainCalls++; if (drainFailure) { throw drainFailure; } return publisher.drainOne(); });
  const synced = await publish(sync, 'owned-sync-publish-02', '同步上架');
  assert.ok(synced.distribution, '注入 drain 後回應必須帶分發描述子');
  assert.equal(synced.distribution.state, 'confirmed');
  assert.equal(synced.distribution.kind, 'publish');
  assert.equal(typeof synced.distribution.visibleAt, 'string');
  assert.equal(synced.distribution.recoveryRequired, false);
  assert.equal(confirmed(), true);
  const syncedStatus = await statusOf('owned-sync-publish-02');
  assert.equal(syncedStatus.releaseId, synced.distribution.operationId);
  // 回執除了多帶的分發描述子，逐欄位仍是同一份 pin。
  const syncedPin = { ...synced }; delete syncedPin.distribution;
  assert.deepEqual({ ...syncedStatus.pin }, syncedPin); groups++;
  // 5) 重放不得再推進或改寫：回執完全相同，drain 次數不變。
  const beforeReplay = drainCalls, replayed = await publish(sync, 'owned-sync-publish-02', '同步上架');
  if (JSON.stringify(replayed) !== JSON.stringify(synced)) {
    for (const key of new Set([...Object.keys(replayed), ...Object.keys(synced)])) { if (JSON.stringify(replayed[key]) !== JSON.stringify(synced[key])) process.stdout.write(`DIFF ${key}: ${JSON.stringify(replayed[key])} != ${JSON.stringify(synced[key])}
`); }
  }
  assert.deepEqual(replayed, synced);
  assert.equal(drainCalls, beforeReplay, '重放不得再次推進分發'); groups++;
  // 6) 推進失敗只降級成待確認：本機操作仍然成功，排程器之後補上，不丟代次。
  drainFailure = Object.assign(new Error('owned transport outage'), { code: 'OWNED_OUTAGE' });
  const failed = await publish(sync, 'owned-sync-publish-03', '同步失敗');
  assert.ok(failed.distribution, '失敗也要回報分發狀態');
  assert.equal(failed.distribution.state, 'pending');
  assert.equal(failed.distribution.recoveryRequired, false);
  assert.equal(app.frozenDistribution.status().confirmedGeneration, app.frozenDistribution.status().tailGeneration - 1);
  drainFailure = null;
  await publisher.drainOne(); assert.equal(confirmed(), true);
  const recovered = await statusOf('owned-sync-publish-03');
  assert.equal(recovered.distribution.state, 'confirmed'); groups++;
  // 7) 同意上架（管理路徑）同樣在本次請求內推進，回應形狀不變。
  const rowRevision = sql.exec('SELECT row_revision FROM content_games WHERE game_id=?', gameId).toArray()[0].row_revision;
  const listing = await sync.fetch(new Request(`${origin}/api/games/${gameId}/listing`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${adminToken}`, 'X-CSRF-Token': adminCsrf, 'Idempotency-Key': 'owned-sync-listing-01', 'If-Match': `"${rowRevision}"` }, body: JSON.stringify({ action: 'list', expectedRowRevision: String(rowRevision) }) }));
  const listed = await listing.json();
  assert.equal(listing.status, 200, JSON.stringify(listed));
  assert.deepEqual(Object.keys(listed).sort(), ['createdAt', 'currentReleaseId', 'draftRevision', 'gameId', 'listed', 'metadata', 'modifiedAt', 'nextOrdinal', 'ownerId', 'restricted', 'rowRevision']);
  assert.equal(listed.listed, true);
  assert.equal('distribution' in listed, false, '管理回執形狀不變');
  assert.equal(confirmed(), true, '同意上架後分發必須已推進到可見');
  assert.equal(sql.exec("SELECT state FROM content_distribution_events ORDER BY generation DESC LIMIT 1").toArray()[0].state, 'confirmed'); groups++;
  // 8) 並发同键 + 慢速推进：两个回应必须一致，推进不得交叉，账本只多一代。
  let active = 0, peak = 0;
  const slowSync = makeApp(async () => {
    active += 1; peak = Math.max(peak, active);
    try { await new Promise(resolve => setTimeout(resolve, 20)); return await publisher.drainOne(); }
    finally { active -= 1; }
  });
  const beforeTail = app.frozenDistribution.status().tailGeneration;
  const raced = await Promise.all([publish(slowSync, 'owned-sync-race-01', '同步并发'), publish(slowSync, 'owned-sync-race-01', '同步并发')]);
  assert.deepEqual(raced[0], raced[1], '同键并发必须给出同一份回执');
  assert.equal(raced[0].distribution.state, 'confirmed');
  assert.equal(app.frozenDistribution.status().tailGeneration, beforeTail + 1, '同键并发只发一代');
  assert.ok(peak <= 1, `同一实例的推进不得交叉：peak=${peak}`); groups++;
  // 9) 回滚并存：旧协议实例留下的待确认代次 + 排程器与同步实例同时工作，账本仍一致。
  const stale = await publish(app, 'owned-sync-mixed-01', '并存旧代');
  assert.equal('distribution' in stale, false, '旧协议实例不得带分發欄位');
  assert.notEqual(app.frozenDistribution.status().tailGeneration, app.frozenDistribution.status().confirmedGeneration);
  const [mixedSync] = await Promise.all([publish(sync, 'owned-sync-mixed-02', '并存新代'), publisher.drainOne()]);
  assert.ok(['confirmed', 'pending'].includes(mixedSync.distribution.state));
  // 收尾：任何未确认代次都由同一个排程器补齐，代次连续且不重复。
  for (let step = 0; step < 8 && !confirmed(); step += 1) { await publisher.drainOne(); }
  assert.equal(confirmed(), true, '并存的旧代次必须仍能被排程器补齐');
  const generations = sql.exec('SELECT generation FROM content_distribution_events ORDER BY generation').toArray().map(row => row.generation);
  assert.deepEqual(generations, generations.map((_, index) => index + 1), '代次必须从 1 起连续不重复');
  groups++;
  process.stdout.write(`A 路線同步發布契約（可回滾）: ${groups} groups green\n`);
} finally {
  try { storage.close(); } catch { /* already closed */ }
  rmSync(scratch, { recursive: true, force: true });
}
