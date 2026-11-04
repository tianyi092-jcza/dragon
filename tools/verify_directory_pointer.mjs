// A 批证据：游戏级目录指针（方案 B）与冻结投影同源、按 gameId 分条，
// 并且必须在根 CAS 之前落地。纯 node + 自有内存 CAS 端口，没有浏览器、SQL 或网络。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
import { directoryPointerFromProjection, writeDirectoryPointer } from '../vps/directory-pointer.mjs';
import { DIRECTORY_POINTER_KEY, directoryPointerBody, directoryState, validateDirectoryPointer } from '../reader/directorypointer.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function parse(bytes) {
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error('unreadable JSON in this lane'); }
}
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GENERATION = 5;
const iso = n => `2026-11-0${n}T00:00:00.000Z`;
let checks = 0;

function releaseOf(gameId, releaseId, ordinal = '1.0') {
  const digest = sha(Buffer.from(gameId + ordinal));
  const sha256 = sha(Buffer.from(gameId + ordinal));
  const key = `artifacts/${gameId}/${ordinal}/${releaseId}/runtime-${sha256}.json`;
  return { gameId, releaseId, ordinal, revision: '3', sourceDigest: digest, runtime: { key, sha256, byteLength: 512 } };
}
const releaseIdOf = gameId => `rel${gameId.slice(0, 4)}`;

// One frozen projection: two visible games, one unlisted, one deleted tombstone.
function projection(g = GENERATION) {
  const a = releaseOf(A, releaseIdOf(A)), b = releaseOf(B, releaseIdOf(B));
  return {
    runtimeVersion: 2,
    directory: [
      { gameId: a.gameId, releaseId: a.releaseId, ordinal: a.ordinal, revision: a.revision, sourceDigest: a.sourceDigest, name: '甲乙', publishedAt: iso(1), chapters: ['c1', 'c2'] },
      { gameId: b.gameId, releaseId: b.releaseId, ordinal: b.ordinal, revision: b.revision, sourceDigest: b.sourceDigest, name: '丙丁', publishedAt: iso(2), chapters: ['c9'] },
    ],
    releases: [
      { game_id: a.gameId, release_id: a.releaseId, ordinal: a.ordinal, draft_revision: a.revision, source_digest: a.sourceDigest, created_at: iso(1), runtime: a.runtime },
      { game_id: b.gameId, release_id: b.releaseId, ordinal: b.ordinal, draft_revision: b.revision, source_digest: b.sourceDigest, created_at: iso(2), runtime: b.runtime },
    ],
    gameStates: [
      { gameId: A, listed: true, currentRelease: { releaseId: a.releaseId, ordinal: a.ordinal } },
      { gameId: B, listed: true, currentRelease: { releaseId: b.releaseId, ordinal: b.ordinal } },
      { gameId: C, listed: false, currentRelease: { releaseId: 'relc', ordinal: '1.0' } },
      { gameId: D, listed: false, deleted: true },
    ],
    announcements: [
      { gameId: A, ordinal: '1.0', name: '甲乙', creatorAccount: 'acct-a', publishedAt: iso(1), firstOnline: { generation: g } },
      // 第二笔公告来自更早的代次：必须有完整收据引用；该代次就是当前代次时只留 generation。
      { gameId: B, ordinal: '1.0', name: '丙丁', creatorAccount: 'acct-b', publishedAt: iso(2), firstOnline: g > 1 ? { generation: g - 1, operationId: '99999999-9999-4999-8999-999999999999', operationDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) } : { generation: g } },
    ],
  };
}

const authorityOf = () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const built = (generation = GENERATION) => directoryPointerFromProjection(projection(generation), { authorityId: authorityOf(), generation });

function memoryStore() {
  const objects = new Map();
  let writes = 0;
  const stamp = () => { const n = ++writes; return { etag: `"e${n}"`, 'last-modified': new Date(Date.UTC(2026, 10, 4, 0, 0, n)).toUTCString() }; };
  return {
    log: [],
    objects,
    async get(key) { const row = objects.get(key); return row ? { bytes: Buffer.from(row.bytes), headers: { ...row.headers } } : null; },
    async put(key, bytes, contentType) { objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': contentType, ...stamp() } }); },
    async putControl(key, bytes, priorETag) {
      this.log.push(key);
      const prior = objects.get(key);
      if ((prior?.headers.etag ?? null) !== (priorETag ?? null)) return false;
      objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': 'application/json', ...stamp() } });
      return true;
    },
    async putImmutable(key, bytes, contentType) {
      this.log.push(key);
      if (!objects.has(key)) objects.set(key, { bytes: Buffer.from(bytes), headers: { 'content-type': contentType, ...stamp() } });
    },
  };
}

// 1) 整形保真：不新增、不丢游戏，未上架与墓碑不携带任何游戏内容。
{
  const { pointer, bytes, digest } = built();
  // digest 覆盖不带 digest 的 body；写入的是带 digest 的信封。
  assert.equal(digest, sha(JSON.stringify(directoryPointerBody(pointer))));
  assert.equal(pointer.digest, digest);
  assert.deepEqual(Buffer.from(JSON.stringify(pointer)), bytes);
  assert.deepEqual(Buffer.from(JSON.stringify(directoryPointerBody(validateDirectoryPointer(parse(bytes))))), Buffer.from(JSON.stringify(directoryPointerBody(pointer))));
  assert.deepEqual(pointer.games.map(entry => entry.gameId), [A, B, C, D]);
  assert.deepEqual(pointer.games.map(entry => entry.listed), [true, true, false, false]);
  assert.deepEqual(pointer.games[2], { gameId: C, listed: false, currentRelease: { releaseId: 'relc', ordinal: '1.0' } });
  assert.deepEqual(pointer.games[3], { gameId: D, listed: false, deleted: true });
  assert.deepEqual(pointer.games[0].directory.chapters, ['c1', 'c2']);
  assert.deepEqual(pointer.games[0].announcements, [{ ordinal: '1.0', name: '甲乙', creatorAccount: 'acct-a', publishedAt: iso(1), firstOnline: { generation: GENERATION } }]);
  assert.equal(pointer.games[1].announcements[0].firstOnline.generation, GENERATION - 1);
  // 回放成旧投影的五列视图，逐项一致（firstOnline 原样保留，未解析）。
  const view = directoryState(pointer);
  assert.deepEqual(view.directory.map(row => [row.gameId, row.releaseId, row.chapters.length]), [[A, releaseIdOf(A), 2], [B, releaseIdOf(B), 1]]);
  assert.deepEqual({ ...view.releases.get(B).runtime }, releaseOf(B, releaseIdOf(B)).runtime);
  assert.deepEqual(Object.entries(view.states.get(D)), [['gameId', D], ['listed', false], ['deleted', true]]);
  assert.deepEqual(view.announcementRows.map(row => [row.gameId, row.firstOnline.generation]), [[A, GENERATION], [B, 4]]);
  checks++;
}

// 2) 整形不接受猜测：任何「投影里没有、指针里却有」的偏差都拒绝，且失败不落盘。
for (const [label, patch] of [
  ['章節屬於別的游戏', value => { value.directory[0].chapters = ['c1', `${B}#c2`]; }],
  ['目录行与 release 身份不一致', value => { value.directory[1].revision = '4'; }],
  ['上架游戏没有目录行', value => { value.directory.pop(); }],
  ['上架游戏没有 runtime', value => { value.releases.pop(); }],
  ['未上架游戏却带目录行', value => { value.directory.push({ ...value.directory[0], gameId: C, chapters: ['c3'] }); }],
  ['未上架游戏却有公告', value => { value.announcements.push({ ...value.announcements[0], gameId: C }); }],
  ['公告指向目录里没有的游戏', value => { value.announcements.push({ ...value.announcements[0], gameId: D, ordinal: '1.0' }); }],
  ['currentRelease 与释放不一致', value => { value.gameStates[0].currentRelease = { releaseId: releaseIdOf(B), ordinal: '1.0' }; }],
  ['未知的 gameState 字段', value => { value.gameStates[0].listed = 'yes'; }],
]) {
  const value = projection();
  patch(value);
  assert.throws(() => directoryPointerFromProjection(value, { authorityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', generation: GENERATION }), /DIRECTORY_PROJECTION|REGISTRY_CORRUPT/, label);
  checks++;
}
for (const [label, mutate] of [
  ['指针字段多了', value => { value.extra = 1; }],
  ['digest 非 sha256', value => { value.digest = 'not-a-digest'; }],
  ['games 未按 gameId 升序', value => { value.games.reverse(); }],
  ['未上架条目带内容', value => { value.games[2].directory = value.games[0].directory; }],
  ['上架条目缺 runtime', value => { delete value.games[0].release.runtime; }],
  ['未知条目字段', value => { value.games[0].mystery = true; }],
]) {
  const { pointer } = built();
  const copy = structuredClone(pointer);
  mutate(copy);
  assert.throws(() => validateDirectoryPointer(copy), /REGISTRY_CORRUPT/, label);
  checks++;
}

// 3) CAS 写入：新建、幂等、并发冲突、回读不一致都不是「成功」。
{
  const store = memoryStore(), port = { get: store.get.bind(store), putControl: store.putControl.bind(store) };
  const { bytes, digest } = built();
  const first = await writeDirectoryPointer(port, 'test/dir-1/', { bytes, digest });
  assert.equal(first.written, true);
  assert.deepEqual(Buffer.from((await store.get(`test/dir-1/${DIRECTORY_POINTER_KEY}`)).bytes), Buffer.from(bytes));
  const again = await writeDirectoryPointer(port, 'test/dir-1/', { bytes, digest });
  assert.deepEqual([again.written, again.digest], [false, digest]);
  checks++;
  // 并发：第二个写者拿着旧 etag，CAS 必须拒绝。
  const prior = await store.get(`test/dir-1/${DIRECTORY_POINTER_KEY}`);
  assert.equal(await store.putControl(`test/dir-1/${DIRECTORY_POINTER_KEY}`, Buffer.from('{"x":1}'), '"stale"'), false);
  assert.equal(await store.putControl(`test/dir-1/${DIRECTORY_POINTER_KEY}`, Buffer.from('{"x":1}'), prior.headers.etag), true);
  checks++;
  const lossy = { get: async () => ({ bytes: Buffer.from('{"different":true}'), headers: { etag: '"x"' } }), putControl: async () => true };
  await assert.rejects(() => writeDirectoryPointer(lossy, '', { bytes, digest }), /DIRECTORY_CONFIRMATION_PENDING/);
  const noEtag = { get: async () => ({ bytes: Buffer.from('{"different":true}'), headers: {} }), putControl: async () => true };
  await assert.rejects(() => writeDirectoryPointer(noEtag, '', { bytes, digest }), /DIRECTORY_ETAG/);
  checks++;
}

// 4) 发布顺序：指针先落地，根 CAS 在后；指针写不成，根就不动（A 批的失败语义）。
async function publisherFixture({ pointerControl } = {}) {
  const store = memoryStore(), storage = openStorage(':memory:');
  const authorityId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const control = { putControl: store.putControl.bind(store) };
  if (pointerControl) control.putControl = pointerControl(store.putControl.bind(store));
  const r2 = { get: store.get.bind(store), putImmutable: store.putImmutable.bind(store), putControl: control.putControl };
  const directoryAt = generation => directoryPointerFromProjection(projection(generation), { authorityId, generation });
  let directoryReturned = true;
  const publisher = createDistributionPublisher({ storage, r2, prefix: 'test/pub-1/', authorityId, verifyResources: async record => (directoryReturned ? { runtimes: 1, objects: 3, reads: 4, directory: directoryAt(record.generation) } : { runtimes: 1, objects: 3, reads: 4 }) });
  const payload = Buffer.from(JSON.stringify({ version: 1, projection: projection() }));
  storage.transactionSync(() => publisher.ledger.enqueueInTxn({ operationId: '77777777-7777-4777-8777-777777777777', kind: 'listing', gameId: A, payload }));
  return { store, storage, publisher, directoryAt, rootKey: 'test/pub-1/control/current.json', pointerKey: `test/pub-1/${DIRECTORY_POINTER_KEY}`, setDirectory: value => { directoryReturned = value; } };
}
{
  const f = await publisherFixture();
  const result = await f.publisher.drainOne();
  assert.equal(result.state, 'VISIBLE_CONFIRMED');
  const pointer = await f.store.get(f.pointerKey), root = await f.store.get(f.rootKey);
  assert.ok(pointer && root);
  const parsed = validateDirectoryPointer(parse(pointer.bytes));
  assert.equal(parsed.digest, f.directoryAt(1).digest);
  assert.equal(parsed.generation, parse(root.bytes).generation);
  // 老逻辑不动：旧投影仍然写在同一代次下，根 digest 就是它的 sha256。
  const control = parse(root.bytes);
  assert.ok(f.store.objects.has(`test/pub-1/projections/${control.generation}/${control.digest}/projection.json`));
  // 顺序证据：指针的 CAS 出现在根 CAS 之前。
  const log = f.store.log;
  assert.ok(log.indexOf(f.pointerKey) !== -1 && log.indexOf(f.pointerKey) < log.indexOf(f.rootKey));
  assert.equal((await f.publisher.drainOne()).state, 'IDLE');
  checks++;
}
{
  // 中途失败：指针 CAS 被拒绝 → 根不动、玩家仍看旧代次；恢复后同一操作补写成功。
  const f = await publisherFixture({ pointerControl: putControl => async (key, bytes, etag) => (key.endsWith(DIRECTORY_POINTER_KEY) ? false : putControl(key, bytes, etag)) });
  assert.equal((await f.publisher.drainOne()).state, 'COMMITTED_SYNC_PENDING');
  assert.equal(await f.store.get(f.rootKey), null);
  assert.equal(f.publisher.ledger.status().confirmedGeneration, 0);
  const resumed = createDistributionPublisher({ storage: f.storage, r2: { get: f.store.get.bind(f.store), putImmutable: f.store.putImmutable.bind(f.store), putControl: f.store.putControl.bind(f.store) }, prefix: 'test/pub-1/', authorityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', verifyResources: async record => ({ runtimes: 1, objects: 3, reads: 4, directory: f.directoryAt(record.generation) }) });
  assert.equal((await resumed.drainOne()).state, 'VISIBLE_CONFIRMED');
  assert.equal(parse((await f.store.get(f.rootKey)).bytes).generation, 1);
  checks++;
}
{
  // 注入式校验端口不背书目录时不写指针：不许凭空生成未经闭包证明的目录。
  const f = await publisherFixture();
  f.setDirectory(false);
  assert.equal((await f.publisher.drainOne()).state, 'VISIBLE_CONFIRMED');
  assert.equal(await f.store.get(f.pointerKey), null);
  checks++;
}

process.stdout.write(`directory pointer: ${checks} checks green (game-level entries, faithful legacy view, CAS+readback, pointer-before-root, mid-publish failure keeps the old root)\n`);
