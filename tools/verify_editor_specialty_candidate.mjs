// Owned pending candidates only; optional isolated loopback App/IDB verification.
// No installation, external network, DOS or user stores.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { BUILTIN_ENTITY_SOURCE } from '../web/src/editor/builtinentitysource.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { readInstalledEntitySource } from './editor_entity_source.mjs';
import { decodeEntitySource } from '../web/src/editor/entitysource.js';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { createContentCatalog } from '../web/src/content/catalog.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { prepareScenario, snapshotScenarioAssembly, readSavedAssembly } from '../web/src/game/scenarioassembly.js';

const appBrowser = process.argv[4] === '--app-browser';
assert.equal(process.argv.length, appBrowser ? 5 : 4);
const rounds = process.argv.slice(2, 4);
for (const round of rounds) assert.match(round, /^[A-Za-z0-9-]{1,64}$/);
assert.notEqual(rounds[0], rounds[1]);
const root = fileURLToPath(new URL('../', import.meta.url));
const dirs = rounds.map(round => join(root, '.dragon-analysis/editor-phase', round));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function parsed(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (cause) { throw new TypeError('Invalid candidate verification JSON', { cause }); }
}
const read = path => readFileSync(join(dirs[0], path));
const receipt = parsed(read('receipt.json'));
assert.equal(receipt.result, 'PASS-SPECIALTY-RUNTIME-CANDIDATE-NOT-INSTALLED');
assert.equal(receipt.runtimePackageProduced, true);
assert.deepEqual(read('receipt.json'), readFileSync(join(dirs[1], 'receipt.json')));
for (const [path, hash] of Object.entries(receipt.artifacts)) {
  assert.match(path, /^(?:[A-Za-z0-9_-]+\.json|author-input\/[A-Za-z0-9_-]+\.json|package\/(?:[A-Za-z0-9_-]+\.(?:json|bin|png)|chapters\/[A-Za-z0-9_-]+\.json))$/);
  const bytes = read(path);
  assert.equal(sha(bytes), hash);
  assert.deepEqual(bytes, readFileSync(join(dirs[1], path)));
}
const oldBytes = new Map();
readInstalledEditorSource(BUILTIN_RESOURCES, url => {
  const bytes = readFileSync(join(root, 'web', url));
  oldBytes.set(url, bytes);
  return bytes;
});
const oldAuthor = await readInstalledEntitySource();
const envelope = parsed(read('candidate.json')), source = parsed(read('package/game-source.json'));
assert.deepEqual(source, envelope.source);
const oldSource = parsed(oldBytes.get(BUILTIN_RESOURCES.sourceURL));
const probe = structuredClone(source), data = parsed(read('package/data.json'));
const catalog = parsed(read('package/catalog.json'));
let records = 0, nonzeroRecords = 0;
for (const [index, id] of probe.chapterOrder.entries()) {
  assert.equal(catalog.chapters[index].id, id);
  assert.equal(oldAuthor.chapters[index].chapterId, id);
  assert.match(catalog.chapters[index].file, /^chapters\/[A-Za-z0-9_-]+\.json$/);
  assert.deepEqual(parsed(read('package/' + catalog.chapters[index].file)), source.chapters[id].state);
  assert.deepEqual(data.scenarios[index], source.chapters[id].state);
  for (const [slot, general] of probe.chapters[id].state.generals.entries()) {
    const raw = Buffer.from(oldAuthor.chapters[index].general32[slot], 'hex');
    const low = [14, 15, 16].map(offset => (raw[offset] & 15).toString(16)).join('');
    assert.equal(general.specialty_low_bits, low);
    if (low !== '000') nonzeroRecords++;
    delete general.specialty_low_bits;
    records++;
  }
}
assert.equal(records, 2560); assert.equal(nonzeroRecords, 5);
assert.deepEqual(probe, oldSource);
const dataProbe = structuredClone(data);
dataProbe.scenarios = probe.chapterOrder.map(id => probe.chapters[id].state);
assert.deepEqual(dataProbe, parsed(oldBytes.get(BUILTIN_RESOURCES.dataURL)));
const manifest = parsed(read('package/manifest.json')), resources = parsed(read('resources.json'));
assert.notEqual(resources.world.revision, BUILTIN_RESOURCES.world.revision);
assert.equal(manifest.worldRevision, resources.world.revision);
assert.equal(manifest.contentRevision, catalog.revision);
assert.equal(manifest.contentRevision, resources.world.revision);
assert.equal(manifest.geographyReview, 'PENDING-SPECIALTY-DELTA');
assert.equal(manifest.visualReview, manifest.geographyReview);
assert.equal(manifest.authorDisplayData.status, manifest.geographyReview);
assert.equal(resources.geographyReview, manifest.geographyReview);
assert.equal(Object.hasOwn(manifest, 'displayAcceptance'), false);
assert.equal(Object.hasOwn(manifest, 'displayAcceptanceInheritance'), false);
const prefix = `content/builtin/compiled/${resources.world.revision}/`;
for (const entry of manifest.assets) {
  assert.equal(entry.url, prefix + entry.path);
  const bytes = read('package/' + entry.path);
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
}
const compiled = compileGameSource(source, sha);
assert.equal(compiled.sourceDigest, manifest.sourceDigest);
assert.equal(compiled.sourceDigest, resources.sourceDigest);
const oldPrefix = `content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
const oldManifest = parsed(oldBytes.get(oldPrefix + 'manifest.json'));
const oldWorldManifestBytes = oldBytes.get(oldPrefix + 'manifest.json');
const oldEntityManifestBytes = readFileSync(join(root, 'web', BUILTIN_ENTITY_SOURCE.manifestURL));
const currentPolicy = installedSourcePolicy(oldWorldManifestBytes, oldEntityManifestBytes);
assert.equal(currentPolicy.revision, BUILTIN_RESOURCES.world.revision);
assert.equal(currentPolicy.sourceDigest, BUILTIN_RESOURCES.sourceDigest);
assert.equal(currentPolicy.roles.length, 41);
let unregisteredPolicyRejections = 0;
for (const [worldBytes, entityBytes] of [
  [read('package/manifest.json'), oldEntityManifestBytes],
  [oldWorldManifestBytes, read('author-input/manifest.json')],
  [read('package/manifest.json'), read('author-input/manifest.json')],
]) {
  const before = [sha(worldBytes), sha(entityBytes)];
  assert.throws(() => installedSourcePolicy(worldBytes, entityBytes), { status: 503, code: 'SOURCE_MANIFEST_NOT_PINNED' });
  assert.deepEqual([sha(worldBytes), sha(entityBytes)], before);
  unregisteredPolicyRejections++;
}
assert.deepEqual(installedSourcePolicy(oldWorldManifestBytes, oldEntityManifestBytes), currentPolicy);
assert.deepEqual(parsed(read('package/world-definition.json')), resources.world);
const worldProbe = structuredClone(resources.world);
worldProbe.revision = BUILTIN_RESOURCES.world.revision;
for (const field of ['terrain', 'roadGraph', 'roadCost', 'roadOffset']) {
  assert.ok(worldProbe.assets[field].startsWith(prefix));
  worldProbe.assets[field] = oldPrefix + worldProbe.assets[field].slice(prefix.length);
}
for (const field of ['seasonAtlases', 'seasons', 'minimap']) for (const name of Object.keys(worldProbe.assets[field])) {
  assert.ok(worldProbe.assets[field][name].startsWith(prefix));
  worldProbe.assets[field][name] = oldPrefix + worldProbe.assets[field][name].slice(prefix.length);
}
assert.deepEqual(worldProbe, BUILTIN_RESOURCES.world);
assert.deepEqual({ ...catalog, revision: BUILTIN_RESOURCES.world.revision }, parsed(oldBytes.get(BUILTIN_RESOURCES.catalogURL)));
assert.equal(manifest.assets.length, 38);
assert.equal(resources.sourceURL, prefix + 'game-source.json');
assert.equal(resources.dataURL, prefix + 'data.json');
assert.equal(resources.catalogURL, prefix + 'catalog.json');
let unchangedRoles = 0;
for (const entry of oldManifest.assets) {
  if (!receipt.runtime.alteredRoles.includes(entry.path)) {
    assert.deepEqual(read('package/' + entry.path), oldBytes.get(entry.url));
    unchangedRoles++;
  }
}
assert.equal(unchangedRoles, 14);
assert.equal(receipt.runtime.alteredRoles.length, 24);
const descriptor = parsed(read('author-descriptor.json')), authorManifest = parsed(read('author-input/manifest.json'));
assert.equal(descriptor.runtimeDataSha256, sha(read('package/data.json')));
assert.equal(descriptor.manifestSha256, sha(read('author-input/manifest.json')));
assert.equal(descriptor.manifestByteLength, read('author-input/manifest.json').length);
const author = await decodeEntitySource(authorManifest, read('author-input/entity-source.json'), descriptor, sha);
author.runtimeDataSha256 = oldAuthor.runtimeDataSha256;
assert.deepEqual(author, oldAuthor);
await assert.rejects(() => decodeEntitySource(authorManifest, read('author-input/entity-source.json'), BUILTIN_ENTITY_SOURCE, sha), /invalid\/unbound/);
assert.throws(() => readInstalledEditorSource(resources, url => {
  assert.ok(url.startsWith(prefix));
  return read('package/' + url.slice(prefix.length));
}), error => error.code === 'ERR_ASSERTION' && error.actual === 'PENDING-SPECIALTY-DELTA' && error.expected === 'APPROVED');
const oldContent = createContentCatalog(parsed(oldBytes.get(BUILTIN_RESOURCES.catalogURL)), parsed(oldBytes.get(BUILTIN_RESOURCES.dataURL)));
const newContent = createContentCatalog(catalog, data);
const oldWorld = createWorldResources(BUILTIN_RESOURCES.world), newWorld = createWorldResources(resources.world);
const assetBytes = new Map(oldBytes);
for (const entry of manifest.assets) assetBytes.set(entry.url, read('package/' + entry.path));
const priorFetch = globalThis.fetch, resourceRequests = [];
let freshAndJsonRestore = 0, wrongIdentityRejections = 0;
globalThis.fetch = async url => {
  const key = String(url);
  assert.ok(assetBytes.has(key), `No network or fallback permitted: ${key}`);
  resourceRequests.push(key);
  return new Response(assetBytes.get(key), { status: 200 });
};
try {
  for (let idx = 0; idx < 20; idx++) {
    const old = await prepareScenario({ raw: createNewGameScenario(oldContent.chapter(idx).template, 0), idx, mode: 'fresh', content: oldContent, world: oldWorld });
    const fresh = await prepareScenario({ raw: createNewGameScenario(newContent.chapter(idx).template, 0), idx, mode: 'fresh', content: newContent, world: newWorld });
    assert.deepEqual(fresh.scenario.generals.map(general => general.specialty_low_bits), data.scenarios[idx].generals.map(general => general.specialty_low_bits));
    const stateProbe = structuredClone(fresh.scenario);
    for (const general of stateProbe.generals) delete general.specialty_low_bits;
    assert.deepEqual(stateProbe, structuredClone(old.scenario), 'fresh state differs only by preserved low bits');
    const webMeta = snapshotScenarioAssembly({ scenario: fresh.scenario, scenarioIdx: idx, content: newContent, world: newWorld });
    const saved = parsed(Buffer.from(JSON.stringify({ state: fresh.scenario, webMeta })));
    const restored = await prepareScenario({ raw: saved.state, idx, mode: 'restore', content: newContent, world: newWorld, ...readSavedAssembly(saved) });
    assert.deepEqual(structuredClone(restored.scenario), structuredClone(fresh.scenario));
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content: newContent, world: newWorld }), webMeta);
    const oldMeta = snapshotScenarioAssembly({ scenario: old.scenario, scenarioIdx: idx, content: oldContent, world: oldWorld });
    await assert.rejects(() => prepareScenario({ raw: old.scenario, idx, mode: 'restore', content: newContent, world: newWorld, ...readSavedAssembly({ state: old.scenario, webMeta: oldMeta }) }), /mismatch/);
    await assert.rejects(() => prepareScenario({ raw: saved.state, idx, mode: 'restore', content: oldContent, world: oldWorld, ...readSavedAssembly(saved) }), /mismatch/);
    wrongIdentityRejections += 2;
    freshAndJsonRestore++;
  }
} finally { globalThis.fetch = priorFetch; }
assert.equal(resourceRequests.length, 8);
assert.deepEqual(data, parsed(read('package/data.json')), 'runtime assembly leaves candidate templates unchanged');
assert.deepEqual(source, parsed(read('package/game-source.json')));
assert.deepEqual(manifest, parsed(read('package/manifest.json')));
assert.deepEqual(resources, parsed(read('resources.json')));
assert.equal(manifest.geographyReview, 'PENDING-SPECIALTY-DELTA');
let appChecks = null;
if (appBrowser) {
  const { createRequire } = await import('node:module');
  const { startBrowserTestServer, mockBuiltinOnlyCatalog } = await import('./browser_test_server.mjs');
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs');
  const server = await startBrowserTestServer(), origin = `http://127.0.0.1:${server.port}`;
  const errors = [], forbidden = [], openedDatabases = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await context.exposeFunction('ownedDatabaseOpened', name => openedDatabases.push(name));
    await context.addInitScript(() => {
      sessionStorage.setItem('wolong.intro.seen.v1', '1');
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, ...args) => {
        if (name !== 'wolong-web') throw new Error('Unexpected candidate database');
        window.ownedDatabaseOpened(name);
        return open(name, ...args);
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || /\/api\/|save\.dat/i.test(url.pathname)) {
        forbidden.push(url.href); return route.abort();
      }
      const key = url.pathname.slice(1);
      if (key.startsWith(prefix)) {
        assert.ok(assetBytes.has(key), `Undeclared candidate request ${key}`);
        let contentType = 'application/octet-stream';
        if (key.endsWith('.png')) contentType = 'image/png';
        else if (key.endsWith('.json')) contentType = 'application/json';
        return route.fulfill({ status: 200, contentType, body: assetBytes.get(key) });
      }
      return route.continue();
    });
    await mockBuiltinOnlyCatalog(context, origin);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => typeof window.__app?.startMenu?._onClick === 'function');
    appChecks = await page.evaluate(async ({ catalog, data, world }) => {
      const { createContentCatalog } = await import('/src/content/catalog.js');
      const { createWorldResources } = await import('/src/game/worldresources.js');
      const { loadLocalSaveSlots } = await import('/src/core/localstore.js');
      const { saveJSON } = await import('/src/core/gamesavecodec.js');
      const app = window.__app;
      // Explicit test injection, not an approved source switch or public admission.
      app.content = createContentCatalog(catalog, data);
      app.data = app.content.data;
      app.world = createWorldResources(world);
      await app.ensureGameAssets();
      const template = saveJSON(app.data), checks = [];
      for (const idx of [2, 5, 6, 10]) {
        await app.beginNewGame(idx, 0, null);
        app.clock.hold = true;
        const expected = data.scenarios[idx].generals.map(g => g.specialty_low_bits);
        const fresh = app.scenario.generals.map(g => g.specialty_low_bits);
        const rng = saveJSON(app.originalRng.snapshot());
        const saved = await app.saveGame(2, 'Owned specialty candidate');
        if (saved.saved !== 'local') throw new Error('Candidate save did not commit');
        const stored = (await loadLocalSaveSlots()).slots[2], body = saveJSON(stored);
        const show = app.startMenu.show;
        app.startMenu.show = async () => {};
        try { await app.returnToTitle(); } finally { app.startMenu.show = show; }
        if (app.scenario !== null || app.gameStarted) throw new Error('Candidate restore skipped title');
        app.saves.slots[2] = stored;
        await app.beginSavedGame(2);
        app.clock.hold = true;
        checks.push({ idx, expected, fresh, restored: app.scenario.generals.map(g => g.specialty_low_bits),
          sameRng: rng === saveJSON(app.originalRng.snapshot()),
          storedUnchanged: body === saveJSON((await loadLocalSaveSlots()).slots[2]),
          templateUnchanged: template === saveJSON(app.data) });
      }
      app.runtimeEnabled = false;
      return checks;
    }, { catalog, data, world: resources.world });
    for (const check of appChecks) {
      assert.deepEqual(check.fresh, check.expected);
      assert.deepEqual(check.restored, check.expected);
      assert.equal(check.sameRng, true);
      assert.equal(check.storedUnchanged, true);
      assert.equal(check.templateUnchanged, true);
    }
    assert.ok(openedDatabases.length > 0);
    assert.deepEqual([...new Set(openedDatabases)], ['wolong-web']);
    assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  } finally { await browser?.close(); await server.close(); }
}
process.stdout.write(JSON.stringify({ result: 'PASS-PENDING-SPECIALTY-PACKAGE', appChecks, records, nonzeroRecords, unchangedRoles, alteredRoles: 24, reproducible: true, staleAuthorRejected: true, unapprovedSourceRejected: true, unregisteredPolicyRejections, freshAndJsonRestore, wrongIdentityRejections, resourceRequests, revision: resources.world.revision, limits: 'explicit pending candidate, optional fresh isolated browser App with injected catalog/world and native IDB; title show is a test stub. No approval/installation/public admission/clock progression/old-draft migration or runtime-rule certification' }) + '\n');
