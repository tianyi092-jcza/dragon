// Real workerd/R2 in a fresh owned Miniflare directory; no cloud credentials.
// Producer/index/reader integration plus capability negatives. Opaque fixtures
// are NOT evidence of a compiled game, browser loading or production migration.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { uploadRelease } from '../vps/publish_to_r2.mjs';
import reader from '../reader/worker.js';
import { GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT, publication, unlisted, sha } from './fixtures/publication.mjs';
let n = 0;
const check = (name, value) => { assert.ok(value, name); n++; };
const require = createRequire(import.meta.url);
let modulePath = process.env.MINIFLARE_MODULE;
if (!modulePath) {
  try { modulePath = require.resolve('miniflare'); }
  catch { modulePath = join(process.env.APPDATA ?? '', 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js'); }
}
if (!existsSync(modulePath)) { throw new Error('miniflare required'); }
const { Miniflare } = await import(pathToFileURL(modulePath).href);
const own = mkdtempSync(join(tmpdir(), 'dragon-reader-admission-'));
const bindings = { PLAYER_ORIGIN: 'https://reader.test', PLAYER_ADMISSION_ACTIVE_KEY: 'owned1', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned1: '11'.repeat(32) }) };
let outbound = 0;
const options = { modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/worker.js'), compatibilityDate: '2024-01-01', host: '127.0.0.1', port: 0, r2Buckets: ['PUBLISH_BUCKET'], r2Persist: join(own, 'blobs'), bindings, outboundService: () => { outbound++; return new Response('outbound forbidden', { status: 403 }); } };
let mf, bucket;
try {
  mf = new Miniflare(options);
  await mf.ready;
  bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  const r2 = {
    async get(key) {
      const row = await bucket.get(key);
      return row ? { bytes: Buffer.from(await row.arrayBuffer()), headers: { etag: row.httpEtag } } : null;
    },
    async putImmutable(key, bytes, mime) {
      return bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: mime } });
    },
    async putControl(key, bytes, etag) {
      return bucket.put(key, bytes, { onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag.replaceAll('"', '') } });
    },
  };
  const commit = async payload => uploadRelease(r2, '', payload, await r2.get('control/current.json'));
  const call = (path, ticket = null) => mf.dispatchFetch(`https://reader.test${path}`, { headers: ticket ? { Authorization: `Bearer ${ticket}` } : {} });
  const admitPath = (version = 0, game = GAME, chapter = 'c1') => `/play-api/v1/admissions?game=${game}&ordinal=1.${version}&chapter=${encodeURIComponent(chapter)}`;
  const getFile = (role, ticket) => call(`/play-api/v1/file?role=${encodeURIComponent(role)}`, ticket);
  const data = async response => { try { return await response.json(); } catch { return null; } };
  const v1 = publication(0), v2 = publication(1);
  await assert.rejects(() => commit(v1), /runtime dependency mismatch/);
  check('missing library cannot switch root', await bucket.get('control/current.json') === null);
  await bucket.put('kao/0.png', PORTRAIT);
  await assert.rejects(() => commit(v1), /runtime dependency mismatch/);
  check('missing template portrait cannot switch root', await bucket.get('control/current.json') === null);
  await bucket.put('kao/p0001.png', PORTRAIT);
  await assert.rejects(() => commit(v1), /runtime dependency mismatch/);
  check('wrong template portrait bytes cannot switch root', await bucket.get('control/current.json') === null);
  await bucket.put('kao/p0001.png', TEMPLATE_PORTRAIT);
  await commit(v1);
  let response = await call('/play-api/v1/registry'), body = await data(response);
  check('current registry and public fields only', response.status === 200 && body.directory[0].ordinal === '1.0' && body.directory[0].chapters.length === 2 && body.announcements.length === 1 && !JSON.stringify(body).includes('owner_id'));
  check('registry no-store', response.headers.get('Cache-Control') === 'no-store');
  response = await call(admitPath()); body = await data(response);
  check('current chapter gets signed admission', response.status === 200 && typeof body.ticket === 'string' && body.manifestDigest === sha(v1.files.find(f => f.key.endsWith('/manifest.json')).bytes));
  const oldTicket = body.ticket;
  response = await getFile('asset:terrain', oldTicket);
  check('allowlisted bytes and digest', response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(v1.files.find(f => f.contentType === 'application/octet-stream').bytes) && response.headers.get('X-Content-SHA256') === sha(v1.files.find(f => f.contentType === 'application/octet-stream').bytes));
  check('asset no-store and no sniff/referrer', response.headers.get('Cache-Control') === 'no-store' && response.headers.get('X-Content-Type-Options') === 'nosniff' && response.headers.get('Referrer-Policy') === 'no-referrer');
  response = await getFile('asset:0', oldTicket);
  check('only declared shared portrait is readable', response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(PORTRAIT));
  response = await getFile('asset:p0001', oldTicket);
  check('declared template portrait uses exact fixed bytes and MIME', response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(TEMPLATE_PORTRAIT) && response.headers.get('Content-Type') === 'image/png');
  check('undeclared template ID has no wildcard access', (await getFile('asset:p0002', oldTicket)).status === 403);
  check('template aliases and paths are not allowed roles', (await getFile('asset:p1', oldTicket)).status === 403 && (await getFile('asset:../p0001', oldTicket)).status === 403);
  await bucket.put('kao/p0001.png', PORTRAIT);
  check('changed template bytes fail closed despite valid ticket', (await getFile('asset:p0001', oldTicket)).status === 503);
  await bucket.put('kao/p0001.png', TEMPLATE_PORTRAIT);
  response = await getFile('manifest', oldTicket);
  check('manifest fixed identity, no Node Buffer requirement', response.status === 200 && (await data(response)).identity.draftRevision === '1');
  response = await getFile('chapter:c1', oldTicket);
  check('fixed admitted chapter', response.status === 200 && (await data(response)).fixture === '0:c1');
  check('another chapter refused', (await getFile('chapter:c2', oldTicket)).status === 403);
  check('unknown role refused', (await getFile('asset:999', oldTicket)).status === 403);
  check('no bearer no resource', (await getFile('manifest', null)).status === 403);
  const forged = `${oldTicket.slice(0, oldTicket.indexOf('.') + 1)}${oldTicket.split('.')[1][0] === 'A' ? 'B' : 'A'}${oldTicket.split('.')[1].slice(1)}`;
  check('forged signature refused', (await getFile('manifest', forged)).status === 403);
  check('oversized/malformed bearer refused', (await getFile('manifest', 'x'.repeat(5000))).status === 403 && (await getFile('manifest', 'x.y')).status === 403);
  for (const key of ['kao/0.png', 'kao/p0001.png', 'control/current.json', v1.releases[0].runtime.key, 'artifacts/uncommitted/private.json', 'kao/../private']) {
    check('raw-key API retired', (await call(`/play-api/v1/file?key=${encodeURIComponent(key)}`, oldTicket)).status === 403);
  }
  check('cross-game parameter refused', (await call(`/play-api/v1/file?role=manifest&game=${OTHER_GAME}`, oldTicket)).status === 403);
  check('duplicate role refused', (await call('/play-api/v1/file?role=manifest&role=asset:0', oldTicket)).status === 403);
  // 语义反转（用户 m256/m262 产品决定）：purge 后读者没有任何墓碑可查，所以「指针里没有
  // 这个 gameId」一律答 410 GAME_DELETED，与显式 deleted 走同一个玩家阻塞提示。已知但
  // 未上架的游戏仍是 403 GAME_NOT_LISTED（下一段的 unlisted 断言），二者不再相同。
  const unknownAdmit = await call(admitPath(0, OTHER_GAME));
  check('unknown game is answered as deleted, not merely unlisted', unknownAdmit.status === 410 && (await data(unknownAdmit)).error === 'GAME_DELETED');
  check('unknown chapter cannot obtain ticket', (await call(admitPath(0, GAME, 'other'))).status === 422);
  check('missing expected version cannot obtain ticket', (await call(`/play-api/v1/admissions?game=${GAME}&chapter=c1`)).status === 422);

  await commit(v2);
  check('old version cannot receive fresh admission', (await call(admitPath())).status === 409);
  response = await call(admitPath(1)); body = await data(response);
  check('new version admission', response.status === 200 && body.ordinal === '1.1');
  const newTicket = body.ticket;
  response = await getFile('chapter:c1', oldTicket);
  check('update invalidates old capability', response.status === 409 && (await data(response)).error === 'RELEASE_CHANGED');
  response = await getFile('chapter:c1', newTicket);
  check('new game uses new chapter', response.status === 200 && (await data(response)).fixture === '1:c1');
  await commit(unlisted(false, v2.directory[0]));
  check('unlisted forbids new admission', (await call(admitPath(1))).status === 403);
  response = await getFile('chapter:c1', oldTicket);
  check('unlisting cannot revive an obsolete capability', response.status === 409 && (await data(response)).error === 'RELEASE_CHANGED');
  response = await getFile('asset:p0001', newTicket);
  check('unlisting alone retains current admitted resources', response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(TEMPLATE_PORTRAIT));
  response = await call('/play-api/v1/registry');
  check('unlisted has no public directory/announcements', (await data(response)).directory.length === 0);
  response = await call(`/play-api/v1/status?game=${GAME}`);
  check('unlisted not deletion', response.status === 200 && (await data(response)).listed === false);
  await commit(v2);
  check('relisting only current, old cannot restart', (await call(admitPath())).status === 409 && (await call(admitPath(1))).status === 200);

  // Rotate the issuing key, retain the previous verification key for old games.
  const rotated = { ...bindings, PLAYER_ADMISSION_ACTIVE_KEY: 'owned2', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned1: '11'.repeat(32), owned2: '22'.repeat(32) }) };
  await mf.setOptions({ ...options, bindings: rotated }); bucket = await mf.getR2Bucket('PUBLISH_BUCKET');
  check('current capability survives signing-key rotation and worker restart', (await getFile('chapter:c1', newTicket)).status === 200);
  check('new key can issue current admission', (await call(admitPath(1))).status === 200);
  const nodeEnv = { ...rotated, PUBLISH_BUCKET: { get: key => bucket.get(key) } };
  const nodeCall = (path, env = nodeEnv, ticket = null) => reader.fetch(new Request(`https://reader.test${path}`, { headers: ticket ? { Authorization: `Bearer ${ticket}` } : {} }), env);
  let raced = false;
  const duringIndex = { ...nodeEnv, PUBLISH_BUCKET: { async get(key) {
    const row = await bucket.get(key);
    if (!raced && key === v2.releases[0].runtime.key) { raced = true; await commit(unlisted()); }
    return row;
  } } };
  check('unlist during admission await returns no ticket', (await nodeCall(admitPath(1), duringIndex)).status === 409 && raced);
  await commit(v2); raced = false;
  const oldChapterKey = v2.files.find(f => f.key.endsWith('/chapters/c1.json')).key;
  const duringUpdate = { ...nodeEnv, PUBLISH_BUCKET: { async get(key) {
    const row = await bucket.get(key);
    if (!raced && key === oldChapterKey) { raced = true; await commit(publication(2, GAME, ['c1', 'c2'], 'race-r2')); }
    return row;
  } } };
  const lateUpdate = await nodeCall('/play-api/v1/file?role=chapter:c1', duringUpdate, newTicket);
  check('update after resource read suppresses late bytes', lateUpdate.status === 409 && (await data(lateUpdate)).error === 'RELEASE_CHANGED' && raced);
  await commit(v2); raced = false;
  const duringFile = { ...nodeEnv, PUBLISH_BUCKET: { async get(key) {
    const row = await bucket.get(key);
    if (!raced && key === oldChapterKey) { raced = true; await commit(unlisted(true)); }
    return row;
  } } };
  check('deletion observed after await suppresses late bytes', (await nodeCall('/play-api/v1/file?role=chapter:c1', duringFile, newTicket)).status === 410 && raced);
  check('explicit deletion denies existing capability', (await getFile('chapter:c1', oldTicket)).status === 410);
  check('explicit deletion status', (await call(`/play-api/v1/status?game=${GAME}`)).status === 410);
  const unknownStatus = await call(`/play-api/v1/status?game=${OTHER_GAME}`);
  check('unknown ID is answered as deleted', unknownStatus.status === 410 && (await data(unknownStatus)).error === 'GAME_DELETED');
  // Fixture rollback below is test setup, never a production restore procedure.
  await commit({ ...unlisted(), gameStates: [] });
  check('state the frozen view does not know is answered as deleted', (await getFile('chapter:c1', oldTicket)).status === 410);
  await commit(v2);
  const oldBytes = await r2.get(oldChapterKey);
  await bucket.put(oldChapterKey, Buffer.from('{'));
  check('tampered current immutable bytes fail closed', (await getFile('chapter:c1', newTicket)).status === 503);
  await bucket.put(oldChapterKey, oldBytes.bytes);
  await bucket.delete(v1.releases[0].runtime.key);
  check('obsolete capability denied before missing old index lookup', (await getFile('chapter:c1', oldTicket)).status === 409);
  check('current capability unaffected by missing unrelated old index', (await getFile('chapter:c1', newTicket)).status === 200);
  check('missing signing configuration fails closed', (await nodeCall(admitPath(1), { PUBLISH_BUCKET: nodeEnv.PUBLISH_BUCKET })).status === 503);
  check('wrong origin cannot use capability', (await reader.fetch(new Request('https://other.test/play-api/v1/file?role=manifest', { headers: { Authorization: `Bearer ${newTicket}` } }), nodeEnv)).status === 503);
  const scopedChapter = `${GAME}#upper-1`, scopedOther = `${GAME}#copy-21`;
  await commit(publication(2, GAME, [scopedChapter, scopedOther]));
  response = await call(admitPath(2, GAME, scopedChapter)); body = await data(response);
  check('scoped chapter admission preserves exact source ID', response.status === 200 && body.chapterId === scopedChapter && body.chapters[0] === scopedChapter);
  const scopedTicket = body.ticket;
  response = await getFile(`chapter:${scopedChapter}`, scopedTicket);
  check('actual R2 literal hash key returns exact admitted chapter', response.status === 200 && (await data(response)).fixture === `2:${scopedChapter}`);
  check('scoped cross-chapter refused', (await getFile(`chapter:${scopedOther}`, scopedTicket)).status === 403);
  check('foreign chapter scope refused', (await call(admitPath(2, GAME, `${OTHER_GAME}#upper-1`))).status === 422);
  check('encoded chapter alias is not a second identity', (await call(admitPath(2, GAME, scopedChapter.replace('#', '%23')))).status === 422);
  check('encoded role alias cannot read literal hash key', (await getFile(`chapter:${scopedChapter.replace('#', '%23')}`, scopedTicket)).status === 403);
  check('stripped scope is not the selected chapter', (await call(admitPath(2, GAME, 'upper-1'))).status === 422);
  await commit(publication(3, GAME, [scopedChapter, scopedOther]));
  await commit(unlisted(false, publication(3, GAME, [scopedChapter, scopedOther]).directory[0]));
  response = await getFile(`chapter:${scopedChapter}`, scopedTicket);
  check('scoped old ticket is invalid after update and unlist', response.status === 409 && (await data(response)).error === 'RELEASE_CHANGED');
  await commit(publication(3, GAME, [scopedChapter, scopedOther]));
  // Public frozen reader pagination, not the retired SQL announcement route.
  const history = publication(39);
  history.announcements = Array.from({ length: 40 }, (_, i) => ({ ...history.announcements[0], ordinal: `1.${i}`, firstOnlineAt: new Date(Date.UTC(2037, 0, 1 + i % 5)).toISOString() }));
  await commit(history);
  const firstPage = await data(await call('/play-api/v1/registry?announcementPage=1'));
  check('public first page is bounded with a cursor', firstPage.announcements.length === 30 && typeof firstPage.announcementPage.nextCursor === 'string' && firstPage.announcementPage.reset === false);
  const pagePath = `/play-api/v1/registry?announcementPage=1&cursor=${encodeURIComponent(firstPage.announcementPage.nextCursor)}`;
  const secondPage = await data(await call(pagePath));
  const all = [...firstPage.announcements, ...secondPage.announcements];
  check('public second page contains remainder exactly once', secondPage.announcements.length === 10 && secondPage.announcementPage.nextCursor === null && new Set(all.map(row => row.announcementId)).size === 40);
  check('resolved dates and stable IDs sort descending across page boundary', all.every((row, i) => !i || all[i - 1].firstOnlineAt > row.firstOnlineAt || all[i - 1].firstOnlineAt === row.firstOnlineAt && all[i - 1].announcementId > row.announcementId));
  check('public identity is stable public pair, not SQL position', all.every(row => row.announcementId === `${row.gameId}:${row.ordinal}`));
  check('unpaged callers retain complete legacy response', (await data(await call('/play-api/v1/registry'))).announcements.length === 40);
  for (const query of ['cursor=%7B', 'announcementPage=1', `cursor=${encodeURIComponent(JSON.stringify({ ...JSON.parse(firstPage.announcementPage.nextCursor), id: 'missing' }))}`]) {
    const bad = await data(await call(`/play-api/v1/registry?announcementPage=1&${query}`));
    check('bad cursor/page input is isolated from valid directory', bad.directory.length === 1 && bad.announcementsError === 'ANNOUNCEMENTS_UNAVAILABLE');
  }
  await commit(unlisted(false, history.directory[0]));
  const hiddenPage = await data(await call(pagePath));
  check('directory change restarts paging and filters newly unlisted history', hiddenPage.announcementPage.reset === true && hiddenPage.announcements.length === 0 && hiddenPage.announcementPage.nextCursor === null && hiddenPage.directory.length === 0);
  await commit(history);
  const restartedPage = await data(await call(pagePath));
  check('relist with stale cursor returns first page with unchanged snapshots', restartedPage.announcementPage.reset === true && JSON.stringify(restartedPage.announcements) === JSON.stringify(firstPage.announcements));
  const root = await r2.get('control/current.json');
  let rootValue; try { rootValue = JSON.parse(root.bytes); } catch { throw new Error('bad fixture root'); }
  await bucket.put(`projections/${rootValue.generation}/${rootValue.digest}/projection.json`, '{}');
  check('projection tamper fails closed', (await call('/play-api/v1/registry')).status === 503);
  check('non-GET rejected', (await mf.dispatchFetch('https://reader.test/play-api/v1/registry', { method: 'POST' })).status === 404);
  check('unknown route rejected', (await call('/play-api/v1/other')).status === 404);
  check('no worker outbound traffic', outbound === 0);
} finally { try { await mf?.dispose(); } finally { rmSync(own, { recursive: true, force: true }); } }
process.stdout.write(`reader: ${n} checks green\n`);
