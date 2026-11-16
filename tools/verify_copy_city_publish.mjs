// D2 publish e2e over real HTTP: full copy -> cities.create -> city-stamp ->
// city-bind -> admit -> corridor paint -> road-add -> validate -> submit ->
// approve -> formal pack loads with 193 cities and a 193-node road graph,
// prepareScenario assembles 193 cities.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { ASSET_TYPES } from '../web/src/player/runtimecontract.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
import { request as httpsRequest } from 'node:https';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const port = Number(process.env.CITY_PUBLISH_TEST_PORT ?? 18788);
const own = mkdtempSync(join(tmpdir(), 'dragon-city-publish-'));
const origin = 'https://127.0.0.1:' + port;
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const password = randomBytes(24).toString('hex') + 'Aa1!';
const secret = randomBytes(32).toString('hex');
const SIEGE = 'ki-1995:siege:7';
const FULL_NUMBERS = { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 };
const hex64 = () => randomBytes(32).toString('hex');

const json = bytes => { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid JSON: ' + String(bytes).slice(0, 200), { cause }); } };
const config = json(readFileSync('server/wrangler.jsonc'));
config.main = resolve('server/worker.js');
config.dev.port = port;
config.vars.EDITOR_ORIGIN = origin;

async function call(path, body, session, extra = {}) {
  const headers = { Origin: origin, ...extra };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const response = await new Promise((done, reject) => {
    const req = httpsRequest(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => {
      const parts = [];
      res.on('data', b => parts.push(b));
      res.on('error', reject);
      res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], data: json(Buffer.concat(parts).toString()) }));
    });
    req.setTimeout(240000, () => req.destroy(new Error('timeout: ' + path)));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return response;
}

const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');
const { createEditorHTTPS } = await import('./editor_local_https.mjs');
const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');
import { writeFileSync } from 'node:fs';

writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config));
writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });
const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'private-objects') });
const source = await stageInstalledEditorSource({
  get: key => bucket.get(key),
  put: (key, bytes, _options) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }),
});
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
const close = async () => { try { await transport.close(); } finally { storage.close(); } };

function findSite(data) {
  const placements = data.map.placements;
  const maxKey = Math.max(...placements.map(p => p.y * 384 + p.x));
  const roadCells = new Set();
  for (const road of data.map.roads) for (const pt of road.geometry) roadCells.add(`${pt.x},${pt.y}`);
  const centers = new Set(placements.map(p => `${p.x},${p.y}`));
  const takenSlot3 = new Set();
  for (const road of data.map.roads)
    for (const s of road.nativeBinding?.slots ?? []) if (s.slot === 3) takenSlot3.add(s.node);
  for (const p of placements.filter(p => p.cityId).sort((a, b) => (b.y * 384 + b.x) - (a.y * 384 + a.x))) {
    if (takenSlot3.has(p.cityId)) continue;
    const x = p.x, y = p.y + 4;
    if (y > 255 || (y * 384 + x) <= maxKey) continue;
    const cells = [[x, y - 3], [x, y - 2], [x, y - 1], [x, y]];
    if (cells.some(([cx, cy]) => centers.has(`${cx},${cy}`) || roadCells.has(`${cx},${cy}`))) continue;
    return { fromCityId: p.cityId, x, y };
  }
  return null;
}

test('D2 HTTP: new city with road publishes and plays at 193', async () => {
  try {
    const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
    assert.equal(login.status, 200);
    const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
    assert.equal(changed.status, 200);
    const admin = { cookie: changed.cookie, csrf: changed.data.csrf };
    assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200);
    const installed = await call('/api/admin/source', undefined, admin);
    assert.equal(installed.status, 200);
    assert.equal((await call('/api/admin/base-map/initialize', {}, admin)).status, 200);
    const copyKey = randomUUID();
    assert.equal((await call('/api/admin/copies', { registryId: installed.data.definition.registryId, name: '新城首发', introduction: 'D2隔离验证' }, admin, { 'Idempotency-Key': copyKey })).status, 202);
    const run = await call('/api/admin/copies/' + copyKey + '/run', {}, admin, { 'If-Match': '"1"' });
    assert.equal(run.status, 200);
    const gameId = run.data.gameId;
    const read = async () => (await call(`/api/games/${gameId}/copy`, undefined, admin)).data.data;

    const created = await call(`/api/games/${gameId}/copy`, { module: 'cities', patch: { create: { name: '上架新城', numbers: FULL_NUMBERS } } }, admin);
    assert.equal(created.status, 200, JSON.stringify(created.data).slice(0, 300));
    const data0 = await read();
    const gid = data0.gameId;
    const site = findSite(data0);
    assert.ok(site, 'a southern expansion site exists');
    const pieceId = `${gid}#city-piece-` + hex64();
    assert.equal((await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: [{ op: 'city-stamp', pieceId, x: site.x, y: site.y, tile: 205 }] } }, admin)).status, 200);
    assert.equal((await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: [{ op: 'city-bind', pieceId, cityId: 'city-192' }] } }, admin)).status, 200);
    assert.equal((await call(`/api/games/${gameId}/copy`, { module: 'chapters', patch: { admit: { cityId: 'city-192', troops_cap: 60, battleMapId: SIEGE } } }, admin)).status, 200);
    for (const [dy, tile] of [[-3, 212], [-2, 200], [-1, 212]]) {
      const painted = await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: [{ op: 'decoration-place',
        instanceId: `${gid}#decoration-` + hex64(), materialId: `tile-${tile}`,
        variantRef: 'original', x: site.x, y: site.y + dy, waterClass: null }] } }, admin);
      assert.equal(painted.status, 200, JSON.stringify(painted.data).slice(0, 300));
    }
    const roadId = `${gid}#road-` + hex64();
    const roaded = await call(`/api/games/${gameId}/copy`, { module: 'map', patch: { edits: [{ op: 'road-add', roadId,
      fromCityId: site.fromCityId, toCityId: 'city-192', travelKind: 'land',
      geometry: [{ x: site.x, y: site.y - 3 }, { x: site.x, y: site.y - 2 }, { x: site.x, y: site.y - 1 }] }] } }, admin);
    assert.equal(roaded.status, 200, JSON.stringify(roaded.data).slice(0, 300));

    const v = await call(`/api/games/${gameId}/copy/validate`, {}, admin);
    assert.equal(v.status, 200, JSON.stringify(v.data).slice(0, 500));
    assert.equal(v.data.state, 'passed');
    const sub = await call(`/api/games/${gameId}/copy/submission`, { ticket: v.data.ticket, description: '新城首版\n上架说明' }, admin);
    assert.equal(sub.status, 200, JSON.stringify(sub.data).slice(0, 300));
    const ok = await call(`/api/games/${gameId}/copy/approve`, {}, admin);
    assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 500));
    assert.equal(ok.data.state, 'approved');

    const packRow = storage.sql.exec('SELECT * FROM published_packs WHERE game_id=?', gameId).toArray()[0];
    assert.ok(packRow, 'formal pack installed');
    const manifest = JSON.parse(packRow.manifest_json), chapterId = manifest.chapters[0];
    const identity = { gameId, releaseId: ok.data.releaseId, ordinal: ok.data.ordinal, revision: packRow.revision,
      sourceDigest: packRow.source_digest, chapterId, chapters: manifest.chapters, manifestDigest: sha(packRow.manifest_json) };
    const declarations = new Map([...manifest.assets, ...manifest.minimapAssets, ...manifest.portraits].map(entry => [entry.assetId, entry]));
    const result = (bytes, contentType) => ({ bytes: new Uint8Array(bytes), contentType, sha256: sha(bytes) });
    const pack = await loadPlayerPack({ compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024,
      session: { identity, state: () => 'active', read: async role => {
        if (role === 'manifest') return result(Buffer.from(packRow.manifest_json), 'application/json');
        if (role === 'chapter:' + chapterId) return result(Buffer.from(storage.sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?', gameId, chapterId).toArray()[0].state_json), 'application/json');
        assert.ok(role.startsWith('asset:')); const id = role.slice(6), declaration = declarations.get(id); assert.ok(declaration);
        if (declaration.role === 'game-portrait') return result(readFileSync('web/' + declaration.url), 'image/png');
        const row = storage.sql.exec('SELECT bytes FROM published_pack_assets WHERE game_id=? AND asset_id=?', gameId, id).toArray()[0];
        assert.ok(row); return result(Buffer.from(row.bytes), ASSET_TYPES[id]);
      } }, readStatic: async path => {
        assert.ok([...Object.values(manifest.visualAssets.seasons), ...Object.values(manifest.visualAssets.seasonAtlases)].some(entry => entry.path === path));
        return result(readFileSync('web/' + path), 'image/png');
      } });
    try {
      const environment = createPlayerEnvironment(pack, { playerFaction: pack.chapter.factions[0].idx });
      const roads = await environment.world.roads.loadRoadGraph();
      assert.equal(roads.version, 2);
      assert.equal(roads.nodes.length, 193);
      assert.equal(roads.nodes[192].x, site.x);
      assert.equal(roads.nodes[192].y, site.y);
      const prepared = await prepareScenario({ raw: environment.raw, idx: 0, mode: 'fresh', content: environment.content, world: environment.world });
      assert.equal(prepared.scenario.cities.length, 193);
      const city192 = prepared.scenario.cities[192];
      assert.equal(city192.idx, 192);
      assert.equal(city192.battleMapId, SIEGE);
      assert.equal(city192.faction, null);
    } finally { pack.close(); }
  } finally { await close(); }
});
