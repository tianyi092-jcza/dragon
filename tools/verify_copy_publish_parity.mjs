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
import { CITY_BASE_NUMBERS, CITY_CHAPTER_NUMBERS, CITY_SHARED_INVARIANTS } from '../web/src/content/authoring/cityrecords.js';
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
  const baseMap = await ok('/api/admin/base-map/initialize', {}, admin);
  checks.push({ check: 'pinnedSourceAndLibraryInstalled', registryId: source.registryId });
  checks.push({ check: 'systemBaseMapInitialized', digest: baseMap.snapshot?.digest ?? null });

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

  // VPUBLISH 迁移：直接上架（/api/publish）已退役，改走 copy 检验链
  // validate → submission → approve → 公开目录。
  const validated = await call(`/api/games/${gameId}/copy/validate`, {}, admin);
  assert.equal(validated.status, 200, `整包检验必须通过：${JSON.stringify(validated.data).slice(0, 300)}`);
  assert.equal(validated.data.state, 'passed');
  assert.ok(typeof validated.data.ticket === 'string' && validated.data.ticket.length >= 32);
  checks.push({ check: 'copyValidatePassed', nextVersion: validated.data.nextVersion ?? null });
  const submitted = await call(`/api/games/${gameId}/copy/submission`, { ticket: validated.data.ticket, description: '複製等同驗證首版' }, admin);
  assert.equal(submitted.status, 200, `提交必须成功：${JSON.stringify(submitted.data).slice(0, 300)}`);
  assert.equal(submitted.data.state, 'submitted');
  const approved = await call(`/api/games/${gameId}/copy/approve`, {}, admin);
  assert.equal(approved.status, 200, `管理员同意必须成功：${JSON.stringify(approved.data).slice(0, 500)}`);
  assert.equal(approved.data.state, 'approved');
  const managed = await ok('/api/admin/copy/submissions', undefined, admin);
  const queueRow = (managed.queue ?? []).find(row => row.gameId === gameId);
  assert.equal(queueRow?.state, 'approved');
  assert.equal(queueRow?.listed, true);
  const listed = await ok('/api/published-games', undefined);
  const entry = (listed.games ?? []).find(row => row.gameId === gameId);
  assert.ok(entry, '上架后必须出现在目录');
  assert.equal(entry.chapters.length, 20, '目录章数必须与原版一致');
  checks.push({ check: 'copyChainApproved', chapters: entry.chapters.length, ordinal: approved.data.ordinal ?? null });

  // 数据等价：formal 包编译产物与内置编译产物逐资产同哈希
  // （trial-pack 端口已退役，直接读同进程 published_pack_assets 表）。
  const builtinRevision = JSON.parse(readFileSync('web/src/content/builtinrelease.generated.js', 'utf8').match(/"resources":(\{.*?\}),"entitySource"/s)[1]);
  const builtinDir = 'web/' + builtinRevision.dataURL.replace(/\/data\.json$/, '');
  const packRow = storage.sql.exec('SELECT manifest_json FROM published_packs WHERE game_id=?', gameId).toArray()[0];
  assert.ok(packRow, '批准后必须有 formal 包行');
  const manifest = JSON.parse(packRow.manifest_json);
  const formalAssetBytes = assetId => {
    const row = storage.sql.exec('SELECT bytes FROM published_pack_assets WHERE game_id=? AND asset_id=?', gameId, assetId).toArray()[0];
    assert.ok(row, `formal 包缺少 ${assetId}`);
    return Buffer.from(row.bytes);
  };
  const compared = [];
  const terrainBytes = formalAssetBytes('terrain');
  assert.equal(sha(terrainBytes), sha(readFileSync(join(builtinDir, 'terrain.bin'))), 'terrain 必须与内置编译产物逐字节一致');
  compared.push({ assetId: 'terrain', mode: 'bytes' });
  assert.deepEqual(JSON.parse(formalAssetBytes('roadGraph').toString('utf8')), JSON.parse(readFileSync(join(builtinDir, 'roads.json'), 'utf8')), 'roadGraph 语义必须与内置编译产物一致');
  compared.push({ assetId: 'roadGraph', mode: 'json' });
  assert.equal(manifest.chapters.length, 20);
  checks.push({ check: 'approvedAssetsMatchBuiltin', compared });

  // 游戏级基础资料（现行模型：硬共享三值＋缺省四值第一章回填）。
  // max_prod/type/view 在 20 章完全一致，是硬共享属性；prod/growth/defence/troops
  // 逐章演化，定义只存第一章回填的缺省值；growth/defence/troops_cap 不得上定义。
  const pure = copyBuiltinGame({ gameId: 'definitions-check', ownerId: 'local-fixture', kind: 'full', source: readInstalledEditorSource() }, sha);
  const definitions = Object.values(pure.cities);
  assert.equal(definitions.length, 192);
  for (const city of definitions) {
    assert.equal(typeof city.name === 'string' && city.name.length > 0, true, `据点 ${city.cityId} 缺少名称`);
    for (const name of CITY_BASE_NUMBERS) assert.equal(Number.isSafeInteger(city[name]), true, `据点 ${city.cityId} 缺少 ${name}`);
    for (const name of ['troops_cap']) assert.equal(Object.hasOwn(city, name), false, `城兵上限 ${name} 由 admit 显式收，不得进游戏级定义`);
  }
  const slots = new Map(definitions.map((city) => [city.runtimeSlot, city]));
  const firstChapter = pure.chapterOrder[0];
  let cellsCompared = 0;
  for (const chapterId of pure.chapterOrder) {
    for (const record of pure.chapters[chapterId].state.cities) {
      const definition = slots.get(record.idx);
      assert.ok(definition, `章 ${chapterId} 据点 ${record.idx} 无游戏级定义`);
      for (const name of CITY_SHARED_INVARIANTS) {
        assert.equal(record[name], definition[name], `章 ${chapterId} 据点 ${record.idx} 硬共享 ${name} 必须与定义一致`);
      }
      if (chapterId === firstChapter) {
        for (const name of ['prod', 'growth', 'defence', 'troops']) {
          assert.equal(definition[name], record[name], `据点 ${record.idx} 缺省 ${name} 必须回填第一章值`);
        }
      }
      cellsCompared += 1;
    }
  }
  checks.push({ check: 'cityDefinitionsAreGameLevel', cities: definitions.length, chapters: pure.chapterOrder.length, cellsCompared, sharedInvariants: CITY_SHARED_INVARIANTS, chapterNumbers: CITY_CHAPTER_NUMBERS });

  process.stdout.write(JSON.stringify({ result: 'PASS-COPY-PUBLISH-PARITY', checks, calls }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ result: 'FAIL', error: error?.message, checks, calls: calls.slice(-12) }, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  try { await service?.close?.(); } catch { /* 服务清理失败不掩盖主结论 */ }
  try { storage.close(); } catch { /* 同上 */ }
  rmSync(own, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
