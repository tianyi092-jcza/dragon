// 复制整游戏 → 直接上架 → 与内置游戏数据等价（用户验收口径）。
// 真实 editor application 代码（Node SQLite + 私有文件桶），不读正式存档。
//   node tools/verify_copy_publish_parity.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { copyBuiltinGame } from '../web/src/content/authoring/gamesource.js';
import { CITY_BASE_NUMBERS, CITY_CHAPTER_NUMBERS } from '../web/src/content/authoring/cityrecords.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');

const origin = 'https://owned-editor.invalid';
const own = mkdtempSync(join(tmpdir(), 'dragon-copy-parity-'));
mkdirSync(join(own, 'private'), { recursive: true });
const bucket = new FileBucket({ root: join(own, 'private') });
const storage = openStorage(join(own, 'editor.sqlite'));
const sql = storage.sql;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [], calls = [];
let service;

async function call(path, value, session, extra = {}) {
  const headers = new Headers();
  if (value !== undefined) {
    headers.set('Origin', origin);
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', extra.key ?? randomUUID());
  }
  if (session) { headers.set('Cookie', session.cookie); headers.set('X-CSRF-Token', session.csrf); }
  for (const [name, text] of Object.entries(extra.headers ?? {})) headers.set(name, text);
  const response = await service.fetch(new Request(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, body: value === undefined ? undefined : JSON.stringify(value) }));
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`真实服务必须回 JSON：${path} ← ${text.slice(0, 200)}`); }
  calls.push({ path, status: response.status });
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function ok(path, value, session, extra, expected = 200) {
  const result = await call(path, value, session, extra);
  assert.equal(result.status, expected, `${path} → ${JSON.stringify(result.data)}`);
  return result.data;
}

const bootstrapPassword = 'Dev-Test-Only-2026!';
const changedPassword = 'Dev-Test-Only-2027!';
try {
  // 固定源与库先落到真实对象桶，服务启动时按 env 描述符自愈登记。
  const operator = {
    get: key => bucket.get(key),
    put: (key, bytes, conditions) => {
      assert.deepEqual(conditions, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    },
  };
  const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');
  const { stageInstalledAvailableLibrary } = await import('./editor_stage_library.mjs');
  const source = await stageInstalledEditorSource(operator);
  const library = await stageInstalledAvailableLibrary(operator);
  const env = {
    EDITOR_ORIGIN: origin,
    EDITOR_DEFAULT_PASSWORD: bootstrapPassword,
    EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'),
    EDITOR_RATE_MS: '1000',
    EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source),
    EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library),
  };
  service = createEditorService({ storage, bucket, env });

  const login = await call('/api/auth/login', { account: 'tianyi', password: bootstrapPassword });
  assert.equal(login.status, 200, 'login → ' + JSON.stringify(login.data));
  const session = { cookie: login.cookie, csrf: login.data.csrf };
  const changed = await call('/api/auth/password', { oldPassword: bootstrapPassword, newPassword: changedPassword }, session);
  assert.equal(changed.status, 200, 'password change → ' + JSON.stringify(changed.data));
  const admin = { cookie: changed.cookie ?? session.cookie, csrf: changed.data.csrf };
  await ok('/api/admin/source/install', {}, admin);
  await ok('/api/admin/library/install', {}, admin);
  checks.push({ check: 'pinnedSourceAndLibraryInstalled', registryId: source.registryId });

  // 管理员复制整个游戏：地图 + 20 章 + 原生武将
  const copyKey = randomUUID();
  const reserved = await ok('/api/admin/copies', { registryId: source.registryId, name: '複製等同驗證', introduction: '' }, admin, { key: copyKey }, 202);
  const started = await call(`/api/admin/copies/${copyKey}/run`, {}, admin, { headers: { 'If-Match': '"1"' } });
  assert.ok([200, 202].includes(started.status), `copy run → ${JSON.stringify(started.data)}`);
  // committed 回执是 {gameId,draftRevision,sourceDigest,baselineDigest}；未完成才是 {state,...}
  let copyDone = started.data;
  for (let i = 0; i < 240 && !copyDone?.gameId; i++) {
    if (copyDone?.state === 'failed') throw new Error('copy failed: ' + JSON.stringify(copyDone));
    await new Promise(done => setTimeout(done, 500));
    copyDone = await ok(`/api/admin/copies/${copyKey}`, undefined, admin);
  }
  assert.ok(copyDone?.gameId, '副本必须完成：' + JSON.stringify(copyDone));
  const gameId = reserved.gameId;
  assert.equal(copyDone.gameId, gameId, '回执 gameId 必须与预约一致');
  const draft = await ok(`/api/games/${gameId}/draft?revision=1`, undefined, admin);
  assert.equal(draft.chapters.length, 20, '副本必须是原版 20 章');
  assert.ok(draft.chapters.every(c => c.generals.length === 128 && c.cities.length === 192) || draft.chapters.every(c => c.generals === 128 && c.cities === 192));
  checks.push({ check: 'adminFullCopy', gameId, chapters: draft.chapters.length, profileRevision: draft.profileRevision });

  // 直接上架（不做任何编辑）
  const published = await call('/api/publish', { gameId, name: '複製等同驗證' }, admin);
  assert.equal(published.status, 200, `上架提交必须成功：${JSON.stringify(published.data)}`);
  // 提交后为「待上架」，管理员同意后才进公开目录（状态机要求）。
  const submissions = await ok('/api/games/submissions', undefined, admin);
  const pendingRow = (submissions.games ?? []).find(row => row.gameId === gameId);
  assert.equal(pendingRow?.state, 'pending', '提交后必须是待上架：' + JSON.stringify(pendingRow));
  const listedNow = await call(`/api/games/${gameId}/listing`, { action: 'list', expectedRowRevision: pendingRow.rowRevision }, admin);
  assert.equal(listedNow.status, 200, `管理员同意上架失败：${JSON.stringify(listedNow.data)}`);
  const listed = await ok('/api/published-games', undefined);
  const entry = (listed.games ?? []).find(row => row.gameId === gameId);
  assert.ok(entry, '上架后必须出现在目录');
  assert.equal(entry.chapters.length, 20, '目录章数必须与原版一致');
  checks.push({ check: 'publishRightAfterCopy', chapters: entry.chapters.length, revision: published.data.pin?.revision ?? null });

  // 数据等价：副本编译产物与内置编译产物逐资产同哈希
  const builtinRevision = JSON.parse(readFileSync('web/src/content/builtinrelease.generated.js', 'utf8').match(/"resources":(\{.*?\}),"entitySource"/s)[1]);
  const builtinDir = 'web/' + builtinRevision.dataURL.replace(/\/data\.json$/, '');
  const pack = await ok(`/api/trial-pack?game=${encodeURIComponent(gameId)}&revision=${encodeURIComponent(String(draft.draftRevision))}&chapter=${encodeURIComponent(entry.chapters[0])}`, undefined, admin);
  const asset = id => pack.manifest.assets.find(item => item.assetId === id);
  // 二进制产物按字节同哈希；JSON 产物按语义深比较（重新序列化不改语义，不算差异）。
  const pairs = [['terrain', 'terrain.bin', 'bytes'], ['roadGraph', 'roads.json', 'json'],
    ['roadCost', 'road_cost.bin', 'bytes'], ['roadOffset', 'road_offset.json', 'json']];
  const copyAssetBytes = async assetId => {
    const response = await service.fetch(new Request(origin + `/api/trial-asset?game=${encodeURIComponent(gameId)}&revision=${encodeURIComponent(String(draft.draftRevision))}&digest=${encodeURIComponent(String(asset('sourceDigest')?.sha256 ?? pack.manifest.identity?.sourceDigest ?? ''))}&asset=${encodeURIComponent(assetId)}`, { headers: new Headers({ Cookie: admin.cookie }) }));
    assert.equal(response.status, 200, `取副本资产 ${assetId} 失败`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const compared = [];
  for (const [assetId, file, kind] of pairs) {
    const copyDigest = asset(assetId)?.sha256;
    assert.ok(copyDigest, `副本缺少 ${assetId}`);
    const builtinBytes = readFileSync(join(builtinDir, file));
    if (kind === 'bytes') {
      assert.equal(copyDigest, sha(builtinBytes), `${assetId} 必须与内置编译产物逐字节一致`);
      compared.push({ assetId, mode: 'bytes', sha256: copyDigest });
    } else {
      const copyBytes = await copyAssetBytes(assetId);
      const copyValue = JSON.parse(Buffer.from(copyBytes).toString('utf8'));
      const builtinValue = JSON.parse(builtinBytes.toString('utf8'));
      assert.deepEqual(copyValue, builtinValue, `${assetId} 语义必须与内置编译产物一致`);
      compared.push({ assetId, mode: 'json', bytesMatch: sha(copyBytes) === sha(builtinBytes) });
    }
  }
  checks.push({ check: 'compiledAssetsMatchBuiltin', compared });

  // 游戏级基础资料（用户 2026-11）：据点固定属性跨章完全相同，章节不再各存一份。
  const pure = copyBuiltinGame({ gameId: 'definitions-check', ownerId: 'local-fixture', kind: 'full', source: readInstalledEditorSource() }, sha);
  const definitions = Object.values(pure.cities);
  assert.equal(definitions.length, 192);
  for (const city of definitions) {
    assert.equal(typeof city.name === 'string' && city.name.length > 0, true, `据点 ${city.cityId} 缺少名称`);
    for (const name of CITY_BASE_NUMBERS) assert.equal(Number.isSafeInteger(city[name]), true, `据点 ${city.cityId} 缺少 ${name}`);
    for (const runtime of ['prod', 'troops']) assert.equal(Object.hasOwn(city, runtime), false, `定义不得存运行时值 ${runtime}`);
  }
  const bySlot = new Map(definitions.map((city) => [city.runtimeSlot, city]));
  // 模型 C（用户 2026-11）：游戏级只保留原版 20 章完全一致的 max_prod/type/view；
  // growth/defence/troops_cap 逐章不同，属章节初始化值，必须原样保留。
  const slots = new Map(definitions.map((city) => [city.runtimeSlot, city]));
  const chapterDrift = {}, baseDrift = {}, driftChapters = {};
  let cellsCompared = 0;
  for (const chapterId of pure.chapterOrder) {
    let cells = 0;
    for (const record of pure.chapters[chapterId].state.cities) {
      const definition = slots.get(record.idx);
      assert.ok(definition, `章 ${chapterId} 据点 ${record.idx} 无游戏级定义`);
      for (const name of CITY_BASE_NUMBERS) {
        if (Object.hasOwn(definition, name) && record[name] !== definition[name]) {
          baseDrift[name] = (baseDrift[name] ?? 0) + 1;
          cells += 1;
        }
      }
      for (const name of CITY_CHAPTER_NUMBERS) {
        if (Object.hasOwn(definition, name)) chapterDrift[name] = (chapterDrift[name] ?? 0) + 1;
        else if (Object.hasOwn(record, name)) chapterDrift[name] = chapterDrift[name] ?? 0;
      }
      cellsCompared += 1;
    }
    if (cells) driftChapters[chapterId] = cells;
  }
  assert.deepEqual(baseDrift, {}, '游戏级字段必须跨章一致');
  assert.deepEqual(driftChapters, {}, '不得有任何章改写游戏级字段');
  assert.deepEqual(chapterDrift, { growth: 0, defence: 0, troops_cap: 0 },
    '章节初始化值不得提升到游戏级定义');
  checks.push({ check: 'cityDefinitionsAreGameLevel', cities: definitions.length, chapters: pure.chapterOrder.length, cellsCompared, baseNumbers: CITY_BASE_NUMBERS, chapterNumbers: CITY_CHAPTER_NUMBERS });

  process.stdout.write(JSON.stringify({ result: 'PASS-COPY-PUBLISH-PARITY', checks, calls }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ result: 'FAIL', error: error?.message, checks, calls: calls.slice(-12) }, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  try { await service?.close?.(); } catch { /* 服务清理失败不掩盖主结论 */ }
  try { storage.close(); } catch { /* 同上 */ }
  rmSync(own, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
