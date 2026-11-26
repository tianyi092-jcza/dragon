// Opt-in: read only the published pack from dev; all serving, distribution,
// tickets and browser saves belong to a disposable fixture, never the dev DB.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localTestCertificate } from './editor_local_https.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startDevSites } from './dev_player_site.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createDiskBucket } from '../vps/disk-bucket.mjs';
import { buildRuntimeIndex } from '../vps/runtime-index.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';

const [gameId, rules] = process.argv.slice(2);
assert.ok(!rules || rules === '--rules');
assert.ok(gameId, 'Specify a locally published game UUID (at least two chapters)');
const source = new DatabaseSync('.dragon-analysis/basemaps-dev-store/editor.sqlite', { readOnly: true });
let pin, release, built;
try {
  source.exec('BEGIN');
  const get = table => source.prepare(`SELECT * FROM ${table} WHERE game_id=?`);
  pin = JSON.parse(get('published_games').get(gameId).pin_json);
  release = source.prepare('SELECT * FROM content_releases WHERE game_id=? AND ordinal=?').get(gameId, pin.ordinal);
  built = buildRuntimeIndex(pin, release, get('published_packs').get(gameId), get('published_pack_chapters').all(gameId), get('published_pack_assets').all(gameId));
} finally { source.close(); }
assert.ok(pin.chapters.length > 1);
const store = mkdtempSync(join(tmpdir(), 'dragon-formal-dev-')), storage = openStorage(join(store, 'editor.sqlite'));
const port = 19731, playerPort = port + 1, origin = `https://127.0.0.1:${port}`, playerOrigin = `https://127.0.0.1:${playerPort}`;
let sites, browser;
try {
  // Seed the isolated distribution, not the source authority. Production drain
  // verifies every referenced role and writes root + receipt before reader admission.
  const disk = createDiskBucket({ root: join(store, 'distribution') });
  for (const file of built.files) disk.putImmutable(file.key, file.bytes, file.contentType);
  const { gameId, name, ordinal, revision, sourceDigest, publishedAt, chapters } = pin, releaseId = release.release_id;
  const identity = { gameId, releaseId, ordinal, revision, sourceDigest, chapters };
  const projection = { runtimeVersion: 1, directory: [{ ...identity, name, publishedAt }], releases: [{ ...release, runtime: built.reference }], gameStates: [{ gameId, listed: true }], announcements: [] };
  const ledger = new FrozenDistributionLedger({ storage, verifyReceipt() { throw new Error('fixture only enqueues'); } });
  storage.transactionSync(() => ledger.enqueueInTxn({ kind: 'publish', gameId, operationId: releaseId, payload: Buffer.from(JSON.stringify({ version: 1, projection, runtime: { ...identity, runtime: built.reference } })) }));
  sites = await startDevSites({ root: resolve('.'), store, port, playerPort, tls: localTestCertificate(store), storage, bucket: new FileBucket({ root: join(store, 'private') }), env: { EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: 'Fixture-Only-Password1!', EDITOR_REQUEST_KEY: randomBytes(32).toString('hex') } });
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], failures = [], paths = new Set();
  page.setDefaultTimeout(45000);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(new URL(r.url()).pathname); });
  page.on('request', r => paths.add(new URL(r.url()).pathname));
  const deadline = Date.now() + 45000;
  while (!ledger.status().confirmedGeneration && Date.now() < deadline) await new Promise(done => setTimeout(done, 200));
  assert.equal(ledger.status().confirmedGeneration, 1);
  for (const [path, status] of [['/play',302],['/api/published-games',503],['/api/trial-pack',503]]) {
    const res = await context.request.get(origin + path, { maxRedirects: 0 }); assert.equal(res.status(),status,path);
  }
  const served = await context.request.get(playerOrigin + '/src/main.js'); assert.deepEqual(await served.body(),readFileSync('web/src/main.js'));
  const click = async (x, y) => { const box = await page.locator('#startv').boundingBox(); await page.mouse.click(box.x+x*box.width/640,box.y+y*box.height/400); };
  for (const [mode,index] of [['new',0],['new',1],['load',0],['load',1]]) {
    await page.goto(origin + '/play'); assert.equal(page.url(),playerOrigin+'/');
    await page.waitForFunction(() => window.__dragonApp?.startMenu?._onClick && !document.querySelector('.player-public-catalog').hidden);
    const select = page.getByLabel('選擇遊戲'); await select.selectOption(gameId); await click(302,mode === 'load' ? 200 : 176);
    if (mode === 'load') await page.locator(`[data-save-slot="${index}"]`).click();
    else {
      await page.waitForFunction(() => window.__dragonApp?.startMenu?._sortedScenarios?.length > 1); await click(200,58+index*28);
      await page.waitForFunction(() => window.__dragonApp?.startMenu?._banners.length === 2); await click(180,54);
      await page.waitForFunction(() => document.querySelector('#advisor-input-overlay input') || document.querySelector('#startv').getContext('2d').getImageData(370,267,1,1).data[0] === 192);
      const name = page.locator('#advisor-input-overlay input').first();
      if (await name.count()) { await name.fill('子明'); await name.press('Enter'); } else await click(390,268);
    }
    await page.waitForFunction(() => window.__dragonApp?.gameStarted && window.__dragonApp.runtimeEnabled);
    const live = await page.evaluate(async ({mode,index}) => { const app = window.__dragonApp;
      return { id:app.content.chapter(0).reference.chapterId, idx:app.scenarioIdx, cities:app.scenario.cities.length, saved:mode === 'load' ? null : await app.saveGame(index,'隔離章節 '+index) };
    },{mode,index});
    assert.equal(live.id,chapters[index]); assert.equal(live.idx,0); assert.ok(live.cities > 0);
    if (mode === 'new') assert.equal(live.saved.saved,'local',JSON.stringify(live.saved));
    console.log({mode, index, ...live});
  }
  assert.ok(paths.has('/play-api/v1/admissions') && paths.has('/play-api/v1/file'));
  assert.ok(![...paths].some(p => p.startsWith('/api/trial') || p === '/api/published-games'));
  assert.deepEqual(errors,[]); assert.deepEqual(failures,[]);
  if (rules) for (const script of ['verify_grid_war_ai_release','verify_release_xinye_recruit']) {
    const result = await promisify(execFile)(process.execPath,[`tools/${script}.mjs`,gameId],{ env:{ ...process.env,
      DRAGON_TEST_PLAYER_PORT:String(playerPort), NODE_EXTRA_CA_CERTS:join(store,'engineering.crt') } });
    console.log(script,result.stdout.trim());
  }
} finally { await browser?.close(); await sites?.close(); storage.close(); rmSync(store,{ recursive:true,force:true }); }
