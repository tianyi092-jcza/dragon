// Actual frozen publisher/SQLite -> owned workerd R2 -> reader. Transport data
// only: no common HTTP producer, author/compiler, browser, cloud or physical delete.
import assert from 'node:assert/strict';
import { exerciseReleaseHistory } from './fixtures/release-history.mjs';
const releaseHistory = process.argv.includes('--release-history');
assert.ok(process.argv.slice(2).every(arg => arg === '--release-history'));
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
import { createDistributionResourceVerifier } from '../vps/distribution-resources.mjs';
import { validateFirstOnlineReference, firstOnlineReceiptKey, rootVisibleAt, receiptVisibleAt } from '../reader/firstonline.js';
import { publication, unlisted, GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT, sha } from './fixtures/publication.mjs';
const AUTHORITY = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const require = createRequire(import.meta.url);
let modulePath;
try { modulePath = require.resolve('miniflare'); }
catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
if (!existsSync(modulePath)) throw new Error('installed Miniflare required; no installation');
const { Miniflare } = await import(pathToFileURL(modulePath).href);
const own = mkdtempSync(join(tmpdir(), 'dragon-first-online-'));
const bindings = { PLAYER_ORIGIN: 'https://reader.test', PLAYER_ADMISSION_ACTIVE_KEY: 'owned', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned: '11'.repeat(32) }) };
const rootKey = 'control/current.json';
let mf, storage, bucket, publisher, outbound = 0, checks = 0, serial = 0, roots = 0, directories = 0, gets = 0, failReceipt = true;
const check = (name, value) => { assert.ok(value, name); checks++; };
const project = (source, firstOnline) => ({ runtimeVersion: 2, directory: source.directory, releases: source.releases, gameStates: source.gameStates, announcements: source.announcements.map(({ firstOnlineAt: _firstOnlineAt, ...row }) => ({ ...row, firstOnline })) });
try {
  const context = { authorityId: AUTHORITY, generation: 2 };
  const ref = { generation: 1, operationId: GAME, operationDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
  for (const bad of [null, [], {}, { generation: 0 }, { generation: 1.5 }, { generation: 3 }, { generation: Number.MAX_SAFE_INTEGER + 1 }, { generation: 1 }, { ...ref, extra: true }, { ...ref, operationId: '../escape' }, { ...ref, operationDigest: 'x' }, { ...ref, payloadDigest: null }, { ...ref, generation: 2 }]) {
    assert.throws(() => validateFirstOnlineReference(bad, context)); checks++;
  }
  assert.deepEqual(validateFirstOnlineReference({ generation: 2 }, context), { generation: 2 }); checks++;
  assert.throws(() => firstOnlineReceiptKey({ generation: 2 }, context)); checks++;
  assert.throws(() => validateFirstOnlineReference(ref, { ...context, authorityId: '../escape' })); checks++;
  for (const bad of [undefined, null, '2026-01-01', 0, new Date(NaN)]) { assert.throws(() => rootVisibleAt(bad)); checks++; }
  check('service seconds do not use local time', rootVisibleAt(new Date('2026-01-01T01:02:03.987Z')) === '2026-01-01T01:02:03.000Z');
  storage = openStorage(join(own, 'ledger.sqlite'));
  mf = new Miniflare({ modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/worker.js'), compatibilityDate: '2024-01-01', host: '127.0.0.1', port: 0, r2Buckets: ['PUBLISH_BUCKET'], r2Persist: join(own, 'r2'), bindings, outboundService: () => { outbound++; return new Response('forbidden', { status: 403 }); } });
  await mf.ready; bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  const r2 = {
    async get(key, options) {
      gets++; const row = await bucket.get(key); if (row === null) return null;
      if (options) assert.ok(row.size <= options.maxBytes);
      return { bytes: new Uint8Array(await row.arrayBuffer()), headers: { etag: row.httpEtag, 'content-type': row.httpMetadata.contentType, 'last-modified': row.uploaded.toUTCString() } };
    },
    async putImmutable(key, bytes, contentType) {
      assert.equal(arguments.length, 3); assert.notEqual(key, rootKey); assert.ok(!key.startsWith('kao/'));
      if (failReceipt && key.startsWith('control/receipts/')) throw new Error('owned receipt outage');
      return await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType } }) !== null;
    },
    async putControl(key, bytes, etag) {
      // 游戏级目录指针与根共用条件写端口，但它是另一个 key，不能计入根代次。
      assert.equal(arguments.length, 3);
      if (key === 'control/directory.json') { directories++; return await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } }) !== null; }
      assert.equal(key, rootKey); roots++;
      return await bucket.put(key, bytes, { onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag.slice(1, -1) }, httpMetadata: { contentType: 'application/json' } }) !== null;
    },
  };
  publisher = createDistributionPublisher({ storage, r2, authorityId: AUTHORITY });
  const source = releaseHistory ? publication(0, GAME, ['c1', 'c2'], 'cccccccc-cccc-4ccc-accc-ccccccccccc0') : publication();
  for (const file of source.files) await r2.putImmutable(file.key, file.bytes, file.contentType);
  for (const [key, bytes] of [['kao/0.png', PORTRAIT], ['kao/p0001.png', TEMPLATE_PORTRAIT]]) await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
  const enqueue = (projection, prepared = null) => {
    const release = prepared?.releases[0];
    const runtime = prepared ? { gameId: GAME, releaseId: release.release_id, ordinal: release.ordinal, revision: release.draft_revision, sourceDigest: release.source_digest, chapters: prepared.directory[0].chapters, runtime: release.runtime } : null;
    return storage.transactionSync(() => publisher.ledger.enqueueInTxn({ operationId: `eeeeeeee-eeee-4eee-aeee-${String(++serial).padStart(12, '0')}`, kind: prepared ? 'publish' : 'listing', gameId: GAME, payload: Buffer.from(JSON.stringify({ version: 1, projection, ...(runtime ? { runtime } : {}) })) }));
  };
  const call = (path, ticket) => mf.dispatchFetch('https://reader.test'+path, { headers: ticket ? { Authorization: `Bearer ${ticket}` } : {} });
  const registry = async () => { const response = await call('/play-api/v1/registry'); assert.equal(response.status, 200); return response.json(); };
  const admission = `/play-api/v1/admissions?game=${GAME}&ordinal=1.0&chapter=c1`;
  const first = enqueue(project(source, { generation: 1 }));
  check('queue has no public root or invented visibility', (await call('/play-api/v1/registry')).status === 503);
  check('root visible but missing receipt remains pending', (await publisher.drainOne()).state === 'COMMITTED_SYNC_PENDING' && roots === 1 && publisher.ledger.status().confirmedGeneration === 0);
  // A 批：同一代次的游戏级目录指针在根 CAS 之前落地，且只落一次，不随重试重复写。
  check('game-level directory pointer precedes the root and is not rewritten by retries', directories === 1 && roots === 1);
  const initialRoot = await bucket.get(rootKey), visibleAt = rootVisibleAt(initialRoot.uploaded);
  let body = await registry();
  const originalAnnouncement = structuredClone(body.announcements[0]);
  check('unconfirmed actual root gives service time, not SQL queue date', body.announcements[0].firstOnlineAt === visibleAt && visibleAt !== source.announcements[0].publishedAt);
  check('private time references not exposed', !/firstOnline"|authorityId|operationDigest|payloadDigest/.test(JSON.stringify(body)));
  const admitted = await call(admission), ticket = (await admitted.json()).ticket;
  check('admission independent of missing minimal receipt', admitted.status === 200 && typeof ticket === 'string');
  const fixed = { generation: first.generation, operationId: first.operationId, operationDigest: first.operationDigest, payloadDigest: first.payloadDigest };
  enqueue(project(unlisted()));
  check('queued later root cannot pass unknown predecessor', (await publisher.drainOne()).state === 'COMMITTED_SYNC_PENDING' && roots === 1);
  failReceipt = false;
  check('retry confirms same root without retiming', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && roots === 1 && directories === 1);
  const receiptKey = firstOnlineReceiptKey(fixed, { authorityId: AUTHORITY, generation: 3 });
  const receiptObject = await bucket.get(receiptKey), receiptBytes = new Uint8Array(await receiptObject.arrayBuffer());
  const receipt = JSON.parse(new TextDecoder().decode(receiptBytes));
  check('durable receipt uses identical service seconds', receipt.visibleAt === visibleAt && receiptVisibleAt(receiptBytes, fixed, { authorityId: AUTHORITY, generation: 3 }) === visibleAt);
  await new Promise(resolveWait => setTimeout(resolveWait, 1100));
  check('unlisting advances only after receipt', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && roots === 2);
  check('unlisted announcement hidden', (await registry()).announcements.length === 0);
  storage.close(); storage = openStorage(join(own, 'ledger.sqlite'));
  publisher = createDistributionPublisher({ storage, r2, authorityId: AUTHORITY });
  check('durable restart does not rewrite', (await publisher.drainOne()).state === 'IDLE' && roots === 2);
  enqueue(project(source, fixed));
  check('relist accepted with actual prior receipt', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && roots === 3);
  body = await registry();
  check('relist keeps first date despite later root date', body.announcements[0].firstOnlineAt === visibleAt && rootVisibleAt((await bucket.get(rootKey)).uploaded) !== visibleAt);
  const verifier = createDistributionResourceVerifier({ r2 });
  const record = publisher.ledger.entry(3);
  for (const bad of [{ generation: 4 }, { generation: 1 }, { ...fixed, operationId: '../x' }, { generation: 3, firstOnlineAt: visibleAt }]) {
    const payload = Buffer.from(JSON.stringify({ version: 1, projection: project(source, bad) })), before = gets;
    await assert.rejects(() => verifier({ ...record, payload, payloadDigest: sha(payload) }));
    check('invalid reference rejected before any object read', gets === before);
  }
  const negatives = [
    null, { bytes: Buffer.from('{}') }, { bytes: Buffer.from(JSON.stringify({ ...receipt, extra: 'private-sentinel' })) },
    ...[['authorityId', OTHER_GAME], ['generation', 2], ['operationId', OTHER_GAME], ['operationDigest', 'c'.repeat(64)], ['payloadDigest', 'd'.repeat(64)], ['rootDigest', 'bad'], ['rootETag', 'bad\r\nheader'], ['visibleAt', 'not-time'], ['visibleAt', visibleAt.replace('.000Z', '.123Z')]].map(([field, value]) => ({ bytes: Buffer.from(JSON.stringify({ ...receipt, [field]: value })) })),
    { bytes: Buffer.concat([Buffer.from(receiptBytes), Buffer.from('\n')]) },
    { bytes: Buffer.from(receiptBytes), contentType: 'text/plain' },
    { bytes: Buffer.alloc(4097, 65) },
  ];
  for (const bad of negatives) {
    if (bad === null) await bucket.delete(receiptKey);
    else await bucket.put(receiptKey, bad.bytes, { httpMetadata: { contentType: bad.contentType ?? 'application/json' } });
    body = await registry();
    assert.deepEqual(body.directory, source.directory);
    check('missing/corrupt receipt isolates announcement error', body.announcementsError === 'ANNOUNCEMENTS_UNAVAILABLE' && body.announcements.length === 0 && !JSON.stringify(body).includes('private-sentinel'));
    check('announcement fault never cancels admission or old resources', (await call(admission)).status === 200 && (await call('/play-api/v1/file?role=chapter%3Ac1', ticket)).status === 200);
    await assert.rejects(() => verifier(record)); checks++;
  }
  // Only owned corrupt fixture objects are repaired; no root rollback or migration.
  await bucket.put(receiptKey, receiptBytes, { httpMetadata: { contentType: 'application/json' } });
  check('restored valid minimal receipt restores announcement', (await registry()).announcements[0].firstOnlineAt === visibleAt);
  enqueue(project(source, fixed));
  await bucket.delete(receiptKey);
  check('default publisher refuses missing historical visibility proof', (await publisher.drainOne()).state === 'COMMITTED_SYNC_PENDING' && roots === 3);
  await bucket.put(receiptKey, receiptBytes, { httpMetadata: { contentType: 'application/json' } });
  check('repair allows same frozen generation, no new operation', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && roots === 4 && publisher.ledger.status().tailGeneration === 4);
  check('later generation still carries original first date', (await registry()).announcements[0].firstOnlineAt === visibleAt);
  const newer = releaseHistory ? publication(1, GAME, ['c1', 'c2'], 'cccccccc-cccc-4ccc-accc-ccccccccccc1') : publication(1);
  newer.directory[0].name = '新版名稱'; newer.announcements[0].name = '新版名稱'; newer.announcements[0].creatorAccount = 'renamed-account';
  for (const file of newer.files) await r2.putImmutable(file.key, file.bytes, file.contentType);
  const updated = project(newer, { generation: 5 });
  updated.announcements.push(project(source, fixed).announcements[0]);
  const update = enqueue(updated, newer);
  check('current and historical announcements pass default publication gate', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && roots === 5);
  const history = (await registry()).announcements;
  assert.equal(history.length, 2); assert.deepEqual(history[1], originalAnnouncement); checks++;
  check('new snapshot does not rename old snapshot', history[0].name === '新版名稱' && history[0].creatorAccount === 'renamed-account' && history[0].ordinal === '1.1');
  check('historical notice grants no old-version admission', (await call(admission)).status === 409 && (await call(admission.replace('1.0', '1.1'))).status === 200);
  const oldResponse = await call('/play-api/v1/file?role=chapter%3Ac1', ticket);
  check('current-version-only policy rejects obsolete admitted session', oldResponse.status === 409 && (await oldResponse.json()).error === 'RELEASE_CHANGED');
  if (releaseHistory) checks += await exerciseReleaseHistory({ call, bucket, bindings, source, newer, ref: fixed, authority: AUTHORITY });
  enqueue(project(unlisted()));
  check('unlist hides the complete public history', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED' && (await registry()).announcements.length === 0);
  if (releaseHistory) {
    const response = await call('/play-api/v1/releases?' + new URLSearchParams({ game: GAME, release: source.directory[0].releaseId, ordinal: '1.0' }));
    assert.equal(response.status, 403); assert.equal((await response.json()).error, 'GAME_NOT_LISTED'); checks++;
  }
  const restored = structuredClone(updated);
  restored.announcements[0].firstOnline = { generation: update.generation, operationId: update.operationId, operationDigest: update.operationDigest, payloadDigest: update.payloadDigest };
  enqueue(restored);
  check('relist restores all snapshots without retiming', (await publisher.drainOne()).state === 'VISIBLE_CONFIRMED');
  assert.deepEqual((await registry()).announcements, history); checks++;
  const page = await (await call('/play-api/v1/registry?announcementPage=1')).json();
  check('v2 paged history preserves real receipt dates and snapshots', page.announcementPage.nextCursor === null && page.announcementPage.reset === false && page.announcements.length === 2 && page.announcements.every(row => history.some(old => old.gameId === row.gameId && old.ordinal === row.ordinal && old.firstOnlineAt === row.firstOnlineAt && old.name === row.name)));
  check('v2 equal service-second dates use stable public identity tie break', page.announcements[0].firstOnlineAt > page.announcements[1].firstOnlineAt || page.announcements[0].firstOnlineAt === page.announcements[1].firstOnlineAt && page.announcements[0].announcementId > page.announcements[1].announcementId);
  const last = publisher.ledger.entry(7), root = JSON.parse(new TextDecoder().decode((await r2.get(rootKey)).bytes));
  // After the final publisher action only: controlled owned projections exercise
  // reader negatives. The private production writer is never bypassed in use.
  for (const version of [1, 2]) {
    const valid = structuredClone(restored); valid.runtimeVersion = version;
    if (version === 1) valid.announcements = structuredClone(history);
    const bytes = Buffer.from(JSON.stringify({ version: 1, projection: valid }));
    await verifier({ ...last, payload: bytes, payloadDigest: sha(bytes) }); checks++;
    const badRows = [[...valid.announcements, valid.announcements[1]], [{ ...valid.announcements[0], ordinal: '1.9' }], [{ ...valid.announcements[0], ordinal: '1.01' }]];
    if (version === 2) badRows.push([{ ...valid.announcements[1], firstOnline: { generation: 7 } }]);
    for (const announcements of badRows) {
      const projection = { ...valid, announcements }, payload = Buffer.from(JSON.stringify({ version: 1, projection })), before = gets;
      await assert.rejects(() => verifier({ ...last, payload, payloadDigest: sha(payload) }));
      check('duplicate/future/invalid/retimed history rejected before I/O', gets === before);
      const projectionBytes = Buffer.from(JSON.stringify(projection)), digest = sha(projectionBytes);
      await bucket.put(`projections/7/${digest}/projection.json`, projectionBytes, { httpMetadata: { contentType: 'application/json' } });
      await bucket.put(rootKey, JSON.stringify({ ...root, digest }), { httpMetadata: { contentType: 'application/json' } });
      body = await registry();
      assert.deepEqual(body.directory, newer.directory);
      check('bad history is an isolated announcement failure', body.announcementsError === 'ANNOUNCEMENTS_UNAVAILABLE' && body.announcements.length === 0 && (await call(admission.replace('1.0', '1.1'))).status === 200);
    }
  }
  check('worker never performs outbound fetch', outbound === 0);
  process.stdout.write(`first online: ${checks} checks passed; seven real frozen generations, service time/receipt/history/retry/relist/restart/error isolation; not production producer or browser proof\n`);
} finally {
  if (mf) await mf.dispose();
  if (storage) storage.close();
  rmSync(own, { recursive: true, force: true });
}
