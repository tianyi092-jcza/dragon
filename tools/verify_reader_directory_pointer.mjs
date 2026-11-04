// 方案 B 读侧：真实 workerd/R2 里，读者优先读 control/directory.json，并且当指针与冻结
// 根同代次时必须给出与旧投影逐字节相同的公开视图；代次不一致或缺指针时回落旧投影；
// 指针 digest 被改即 fail closed；指针里没有的 gameId 一律 410 GAME_DELETED。
// 不涉及浏览器、App、真实游戏字节或生产环境。
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { uploadRelease } from '../vps/publish_to_r2.mjs';
import { directoryPointerFromProjection, writeDirectoryPointer } from '../vps/directory-pointer.mjs';
import reader from '../reader/worker.js';
import { GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT, publication, sha } from './fixtures/publication.mjs';
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
const own = mkdtempSync(join(tmpdir(), 'dragon-reader-pointer-'));
const bindings = { PLAYER_ORIGIN: 'https://reader.test', PLAYER_ADMISSION_ACTIVE_KEY: 'owned1', PLAYER_ADMISSION_KEYS: JSON.stringify({ owned1: '11'.repeat(32) }) };
const options = { modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }], scriptPath: resolve('reader/worker.js'), compatibilityDate: '2024-01-01', host: '127.0.0.1', port: 0, r2Buckets: ['PUBLISH_BUCKET'], r2Persist: join(own, 'blobs'), bindings, outboundService: () => new Response('outbound forbidden', { status: 403 }) };
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
  const call = (path, ticket = null) => mf.dispatchFetch(`https://reader.test${path}`, { headers: ticket ? { Authorization: `Bearer ${ticket}` } : {} });
  const admitPath = (game = GAME) => `/play-api/v1/admissions?game=${game}&ordinal=1.0&chapter=c1`;
  const data = async response => { try { return await response.json(); } catch { return null; } };
  await bucket.put('kao/0.png', PORTRAIT);
  await bucket.put('kao/p0001.png', TEMPLATE_PORTRAIT);
  const payload = publication(0);
  await uploadRelease(r2, '', payload, await r2.get('control/current.json'));
  const legacyRoot = JSON.parse((await r2.get('control/current.json')).bytes);
  const legacyProjection = JSON.parse((await r2.get(`projections/${legacyRoot.generation}/${legacyRoot.digest}/projection.json`)).bytes);
  check('legacy root committed without a pointer', legacyRoot.generation === 1 && await r2.get('control/directory.json') === null);

  // 冻结 v2 根：A 批只在这种投影上写指针，投影内容来自真实发布器写下的那份。
  const authorityId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const projection = { ...legacyProjection, runtimeVersion: 2, announcements: [] };
  const generation = legacyRoot.generation + 1;
  const payloadBytes = Buffer.from(JSON.stringify(projection)), digest = sha(payloadBytes);
  await bucket.put(`projections/${generation}/${digest}/projection.json`, payloadBytes);
  const root = { version: 2, authorityId, generation, operationId: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
    operationDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64), previousOperationDigest: 'c'.repeat(64), digest };
  await bucket.put('control/current.json', JSON.stringify(root));
  check('frozen root committed without a pointer', (await r2.get('control/directory.json')) === null);

  // 旧投影读取的基线：这份字节就是「不读指针时」的答案。
  const legacyRegistry = await call('/play-api/v1/registry');
  const legacyRegistryText = await legacyRegistry.text();
  const legacyStatus = await call(`/play-api/v1/status?game=${GAME}`);
  const legacyStatusText = await legacyStatus.text();
  const legacyAdmit = await data(await call(admitPath()));
  const legacyChapter = Buffer.from(await (await call('/play-api/v1/file?role=chapter%3Ac1', legacyAdmit.ticket)).arrayBuffer());
  const historyPath = `/play-api/v1/releases?game=${GAME}&release=${legacyAdmit.releaseId}&ordinal=${legacyAdmit.ordinal}`;
  const legacyHistory = await call(historyPath);
  const legacyHistoryText = await legacyHistory.text();
  check('legacy projection serves the frozen view', legacyRegistry.status === 200 && JSON.parse(legacyRegistryText).directory.length === 1 && legacyChapter.length > 0);

  // 同一代次的指针：读者必须给出逐字节相同的公开视图，而不是「差不多」的一份。
  const shaped = directoryPointerFromProjection(projection, { authorityId: root.authorityId, generation: root.generation });
  const written = await writeDirectoryPointer(r2, '', { bytes: shaped.bytes, digest: shaped.digest });
  check('pointer written for the committed generation', written.written === true && written.key === 'control/directory.json');
  const pointerRegistry = await call('/play-api/v1/registry');
  const pointerRegistryText = await pointerRegistry.text();
  check('registry bytes are identical with the pointer', pointerRegistry.status === 200 && pointerRegistryText === legacyRegistryText);
  const pointerStatus = await call(`/play-api/v1/status?game=${GAME}`);
  check('status bytes are identical with the pointer', pointerStatus.status === 200 && await pointerStatus.text() === legacyStatusText);
  const pointerHistory = await call(historyPath);
  check('release history is identical with the pointer', pointerHistory.status === legacyHistory.status && await pointerHistory.text() === legacyHistoryText);
  const pointerAdmit = await data(await call(admitPath()));
  check('pointer admission identity and manifest match the legacy one',
    pointerAdmit.releaseId === legacyAdmit.releaseId && pointerAdmit.ordinal === legacyAdmit.ordinal &&
    pointerAdmit.chapters.join() === legacyAdmit.chapters.join() && pointerAdmit.manifestDigest === legacyAdmit.manifestDigest);
  const pointerChapter = Buffer.from(await (await call('/play-api/v1/file?role=chapter%3Ac1', pointerAdmit.ticket)).arrayBuffer());
  check('chapter bytes are identical with the pointer', pointerChapter.equals(legacyChapter));
  check('pointer never exposes its own key as a role', (await call(`/play-api/v1/file?role=${encodeURIComponent('control/directory.json')}`, pointerAdmit.ticket)).status === 403);

  // 指针里没有的 gameId：purge 之后只剩这条路，必须与显式删除同一个事实。
  const unknownStatus = await call(`/play-api/v1/status?game=${OTHER_GAME}`);
  const unknownAdmit = await call(admitPath(OTHER_GAME));
  check('unknown game is 410 GAME_DELETED on status and admission',
    unknownStatus.status === 410 && (await data(unknownStatus)).error === 'GAME_DELETED' &&
    unknownAdmit.status === 410 && (await data(unknownAdmit)).error === 'GAME_DELETED');

  // 代次不一致（发布中途失败：指针已写、根还是旧代次）：回落旧投影，答案仍是旧版本。
  const ahead = directoryPointerFromProjection(projection, { authorityId: root.authorityId, generation: root.generation + 1 });
  await writeDirectoryPointer(r2, '', { bytes: ahead.bytes, digest: ahead.digest });
  const aheadRegistry = await call('/play-api/v1/registry');
  check('pointer for another generation falls back to the frozen projection', aheadRegistry.status === 200 && await aheadRegistry.text() === legacyRegistryText);
  await writeDirectoryPointer(r2, '', { bytes: shaped.bytes, digest: shaped.digest });
  check('same-generation pointer can be restored idempotently', (await writeDirectoryPointer(r2, '', { bytes: shaped.bytes, digest: shaped.digest })).written === false);

  // digest 被改：这是损坏，不是回落。
  const tampered = JSON.parse(new TextDecoder().decode(shaped.bytes));
  tampered.games[0].directory.name = tampered.games[0].directory.name + 'x';
  await bucket.put('control/directory.json', JSON.stringify(tampered));
  check('tampered pointer body fails closed instead of serving', (await call('/play-api/v1/registry')).status === 503);
  const badDigest = { ...JSON.parse(new TextDecoder().decode(shaped.bytes)), digest: 'f'.repeat(64) };
  await bucket.put('control/directory.json', JSON.stringify(badDigest));
  check('wrong pointer digest fails closed', (await call('/play-api/v1/registry')).status === 503);
  await bucket.put('control/directory.json', shaped.bytes);
  check('restored pointer serves the frozen view again', await (await call('/play-api/v1/registry')).text() === legacyRegistryText);
} finally { try { await mf?.dispose(); } finally { rmSync(own, { recursive: true, force: true }); } }
process.stdout.write(`reader directory pointer: ${n} checks green (real workerd/R2; pointer and frozen projection produce identical public views, stale generation falls back, tampered pointer fails closed, unknown game is 410 GAME_DELETED; no browser/App/production proof)\n`);
