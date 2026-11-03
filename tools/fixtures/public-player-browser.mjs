// Unmodified production HTML/boot/title/navigation against the owned real
// publication authority and reader. Only transport observation and clock hold
// are test controls; no replacement boot, App start call, or navigation port.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { createStaticArchiver } from '../../vps/static-archive.mjs';
import { buildStaticRelease } from '../../vps/static-release.mjs';
import { registerStaticProgram } from '../../vps/program-registration.mjs';
import playerSite from '../../reader/site.js';
import { assertCompletedProgramStream } from './player-client-browser.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = { '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.html':'text/html', '.png':'image/png', '.woff2':'font/woff2', '.woff':'font/woff', '.flac':'audio/flac', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.svg':'image/svg+xml' };
export function createPublicPlayerBrowserProbe({ browser, origin, gameId, chapterId, root, bridge, observeContext, programPaths = false }) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, 'dist/static-release.json'), 'utf8')); }
  catch (cause) { throw new Error('owned static manifest invalid', { cause }); }
  const files = new Map(manifest.files.map(row => [row.path, row]));
  const manifestBytes = readFileSync(join(root, 'dist/static-release.json')), programDigest = sha(manifestBytes);
  const programBase = '/program-assets/' + programDigest + '/', programObjects = new Map(), programRequests = [];
  const artifactBase = 'artifacts/programs/' + programDigest + '/';
  const allowedKeys = new Set(['control/programs/' + programDigest + '.json', artifactBase + 'static-release.json',
    ...manifest.files.filter(file => file.kind === 'asset').map(file => artifactBase + 'files/' + file.path)]);
  // A distinct installed software package, with only an inert boot comment.
  // This tests URL ownership across deployment, not different-engine compatibility.
  const nextBoot = Buffer.concat([readFileSync(join(root, 'dist/src/boot.js')), Buffer.from('\n// owned next deployment\n')]);
  const nextProgram = buildStaticRelease(manifest.files.map(({ path, byteLength, sha256 }) =>
    path === 'src/boot.js' ? { path, byteLength: nextBoot.length, sha256: sha(nextBoot) } : { path, byteLength, sha256 }));
  const nextBase = '/program-assets/' + nextProgram.sha256 + '/';
  const programFiles = new Map([[programBase, files], [nextBase, new Map(nextProgram.manifest.files.map(row => [row.path, row]))]]);
  let deployedManifest = manifestBytes, archive, nextArchive, lateResources, programPuts = 0, installedPuts = 0;
  const programR2 = {
    async get(key, { maxBytes }) { assert.ok(allowedKeys.has(key)); const row = programObjects.get(key); if (!row) return null;
      assert.ok(row.bytes.length <= maxBytes); return { bytes: Buffer.from(row.bytes), headers: { 'content-type': row.type } }; },
    async putImmutable(key, bytes, type) { assert.ok(allowedKeys.has(key)); programPuts++; if (programObjects.has(key)) return false;
      programObjects.set(key, { bytes: Buffer.from(bytes), type }); return true; },
  };
  const programEnv = {
    ASSETS: { async fetch(request) { assert.equal(request.url, origin + '/static-release.json'); assert.equal(request.method, 'GET');
      return new Response(deployedManifest, { headers: { 'content-type': 'application/json' } }); } },
    PUBLISH_BUCKET: { async get(key) { assert.ok(allowedKeys.has(key)); const row = programObjects.get(key); if (!row) return null;
      return { size: row.bytes.length, httpMetadata: { contentType: row.type }, body: new Response(row.bytes).body }; } },
  };
  const sources = {}, checks = [], observations = [], traces = new Map();
  let page, initialMetadata, releaseId, savedDigest, saveSlot = 0, sequence = 4000000;
  async function record() {
    return page.evaluate(async ({ game, base, slot }) => {
      const { createGameSaveStore } = await import(base + 'src/core/gamesavestore.js');
      return createGameSaveStore({ gameId:game, databaseName:'wolong-web', getIndexedDB:()=>indexedDB }).get(slot);
    }, { game: gameId, base: await moduleBase(), slot: saveSlot });
  }
  async function ready() {
    await page.waitForFunction(() => {
      const a = window.__app;
      if (a?.gamebar) { a.gamebar._clockHoldRequested = true; a.gamebar.syncClock(); }
      return !!a?.gameStarted && !a._scenarioAssemblyPending && !a._scenarioAssemblyIncomplete && a.runtimeEnabled;
    });
  }
  function formalURL(value) { try { return new URL(value).searchParams.has('formalGame'); } catch (cause) { throw new Error('invalid owned page URL', { cause }); } }
  async function moduleBase() {
    if (!programPaths || !formalURL(page.url())) return '/';
    const base = await page.evaluate(() => document.baseURI);
    assert.ok([origin + programBase, origin + nextBase].includes(base)); return base.slice(origin.length);
  }
  async function metadata() { return page.evaluate(async base => (await import(base + 'src/game/scenarioassembly.js')).snapshotScenarioAssembly(window.__app), await moduleBase()); }
  async function title() {
    await page.locator('.player-catalog select:visible').waitFor();
    await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  }
  async function yesNo(yes) {
    const box = await page.locator('#startv').boundingBox(); assert.ok(box);
    await page.mouse.click(box.x + 310 * box.width / 640, box.y + (yes ? 176 : 200) * box.height / 400);
  }
  return {
    async serve(route, url) {
      if (url.pathname.startsWith('/play-api/')) return false;
      assert.equal(url.origin, origin); assert.equal(route.request().method(), 'GET');
      if (programPaths && (url.pathname.startsWith('/program-assets/') || ['/', '/index.html'].includes(url.pathname) && url.searchParams.has('formalGame'))) {
        const request = new Request(url.href), entry = !url.pathname.startsWith('/program-assets/');
        const base = [...programFiles.keys()].find(value => url.pathname.startsWith(value));
        if (!entry) assert.ok(base, 'only installed program resource URLs');
        const response = await playerSite.fetch(request, programEnv);
        assert.equal(response.status, 200, 'registered program response: ' + url.pathname);
        const body = Buffer.from(await response.arrayBuffer());
        if (entry) assert.equal(response.headers.get('x-program-digest'), sha(deployedManifest));
        else { const path = url.pathname.slice(base.length), row = programFiles.get(base).get(path); assert.ok(row); assert.equal(sha(body), row.sha256); sources[path] = row.sha256; }
        programRequests.push({ origin, path: url.pathname, query: url.search, entry, bytes: body.length, sha256: sha(body), status: response.status,
          sequence: route.request().headers()['x-owned-client-request'] ?? null });
        assert.equal(programPuts, installedPuts, 'program HTTP has no writes');
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body }); return true;
      }
      if (programPaths && formalURL(route.request().frame().url()))
        assert.ok(route.request().isNavigationRequest() && url.pathname === '/' && !url.search,
          'only explicit return-to-title navigation may leave the program: ' + url.pathname);
      const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      assert.ok(!path.startsWith('api/') && !path.startsWith('reader/') && !path.startsWith('web/') && !path.includes('%') && !path.includes('..'));
      if (path === 'index.html') {
        const params = [...url.searchParams.keys()]; assert.ok(params.every(key => ['formalGame','mode'].includes(key)));
      } else assert.ok(!url.search || url.search === '?v=original-sprites-1');
      const row = files.get(path); assert.ok(row, 'undeclared public static path: ' + path);
      const body = readFileSync(join(root, 'dist', path)); assert.equal(body.length, row.byteLength); assert.equal(sha(body), row.sha256);
      sources[path] = row.sha256; assert.ok(mime[extname(path)]);
      await route.fulfill({ contentType:mime[extname(path)], body }); return true;
    },
    async start(index) {
      if (programPaths) {
        archive = await createStaticArchiver({ r2: programR2, expectedDigest: programDigest, sourceTreeDigest: manifest.sourceTreeDigest, maxTotalBytes: 256 * 1024 * 1024,
          readStatic: async (path, { maxBytes }) => { assert.ok(path === 'static-release.json' || files.get(path)?.kind === 'asset');
            const bytes = readFileSync(join(root, 'dist', path)); assert.ok(bytes.length <= maxBytes); return bytes; },
        }).stage(() => {});
        await registerStaticProgram({ r2: programR2, releaseDigest: programDigest, sourceTreeDigest: manifest.sourceTreeDigest, assertCurrent: () => {} });
        installedPuts = programPuts; assert.equal(programObjects.size, archive.filesVerified + 2);
        const nextArtifactBase = 'artifacts/programs/' + nextProgram.sha256 + '/';
        allowedKeys.add('control/programs/' + nextProgram.sha256 + '.json'); allowedKeys.add(nextArtifactBase + 'static-release.json');
        for (const file of nextProgram.manifest.files.filter(row => row.kind === 'asset')) allowedKeys.add(nextArtifactBase + 'files/' + file.path);
        nextArchive = await createStaticArchiver({ r2: programR2, expectedDigest: nextProgram.sha256, sourceTreeDigest: nextProgram.manifest.sourceTreeDigest, maxTotalBytes: 256 * 1024 * 1024,
          readStatic: async (path, { maxBytes }) => { assert.ok(path === 'static-release.json' || files.get(path)?.kind === 'asset');
            let bytes; if (path === 'static-release.json') bytes = nextProgram.bytes; else if (path === 'src/boot.js') bytes = nextBoot; else bytes = readFileSync(join(root, 'dist', path));
            assert.ok(bytes.length <= maxBytes); return bytes; },
        }).stage(() => {});
        await registerStaticProgram({ r2: programR2, releaseDigest: nextProgram.sha256, sourceTreeDigest: nextProgram.manifest.sourceTreeDigest, assertCurrent: () => {} });
        installedPuts = programPuts; assert.equal(programObjects.size, archive.filesVerified + nextArchive.filesVerified + 4);
        checks.push('full owned package staged/registered before real program entry and asset handlers serve the browser');
      }
      const context = await browser.newContext({ viewport:{width:1024,height:768}, serviceWorkers:'block' });
      await context.exposeBinding('__ownedNextRequest', () => String(++sequence));
      await context.exposeBinding('__ownedTrace', (_, trace) => { traces.set(trace.sequence, trace); });
      await context.addInitScript(({ ownedOrigin, pinnedBases }) => {
        if (location.origin !== ownedOrigin) return;
        sessionStorage.setItem('wolong.intro.seen.v1', '1');
        const open = indexedDB.open.bind(indexedDB); window.__ownedDatabases = [];
        indexedDB.open = (name, ...args) => { if(name !== 'wolong-web') throw new Error('non-owned DB forbidden'); window.__ownedDatabases.push(name); return open(name,...args); };
        const transport = fetch.bind(window);
        window.fetch = async (url, options) => {
          const path = new URL(url, location.href).pathname;
          const pinnedBase = pinnedBases.find(base => path.startsWith(base));
          const season = pinnedBase && /^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/(?:map_atlas_|map_tiles_)(?:spring|summer|autumn|winter)\.png$/.test(path.slice(pinnedBase.length));
          if (!path.startsWith('/play-api/') && !season) return transport(url, options);
          const trace = { sequence:await window.__ownedNextRequest(), path, completed:false, cancelled:false, bytes:0, status:null };
          await window.__ownedTrace(trace);
          const response = await transport(url, {...options,headers:{...options?.headers,'X-Owned-Client-Request':trace.sequence}});
          trace.status = response.status;
          const getReader = response.body.getReader.bind(response.body);
          Object.defineProperty(response.body,'getReader',{value(){const reader=getReader();return{
            async read(){const row=await reader.read();if(row.done){trace.completed=true;await window.__ownedTrace(trace);}else trace.bytes+=row.value.byteLength;return row;},
            async cancel(){trace.cancelled=true;await window.__ownedTrace(trace);return reader.cancel();}, releaseLock(){return reader.releaseLock();},
          };}});return response;
        };
      }, { ownedOrigin: origin, pinnedBases: programPaths ? [programBase, nextBase] : [] });
      observeContext(context); await context.route('**/*', bridge);
      page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.goto(origin + '/'); await title();
      await page.locator('.player-catalog option').filter({hasText:'1.0'}).first().waitFor({state:'attached'});
      assert.equal(await page.locator('.player-catalog select').inputValue(), 'wolong-builtin');
      // 現行產品口徑（2026-11）：內置仍是默認首項，量產遊戲上架後只是多一個可選項；
      // 兩者必須同時出現在下拉框，且選中量產遊戲要真的開那一局（而不是回落到內置）。
      const catalogOptions = await page.locator('.player-catalog select option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent })));
      assert.equal(catalogOptions.length, 2);
      assert.equal(catalogOptions[0].value, 'wolong-builtin');
      assert.match(catalogOptions[0].label, /（内置）$/);
      assert.equal(catalogOptions[1].value, gameId);
      assert.match(catalogOptions[1].label, /（自建） 1.0$/);
      checks.push('builtin stays the default first option while the published own game is a second selectable entry labelled （自建） <ordinal>');
      await page.locator('.player-catalog-notice').click();
      const announcements = page.getByRole('dialog',{name:'發布資訊'}); await announcements.waitFor();
      assert.equal(await page.locator('.player-catalog select').isDisabled(),true);
      await announcements.click({button:'right'}); assert.equal(await announcements.count(),0);
      await page.locator('.player-catalog select').selectOption(gameId); await yesNo(true);
      await page.waitForURL(url=>url.searchParams.get('mode')==='new');
      await page.locator('[data-chapter-id]').first().waitFor(); assert.equal(await page.locator('[data-chapter-id]').count(),20);
      assert.equal(await page.locator('.player-catalog select').isHidden(),true);
      assert.equal(await page.evaluate(()=>!!window.__app._bootStarted),false);
      await page.locator('.player-catalog-notice').click();
      const childNotice=page.getByRole('dialog',{name:'發布資訊'});await childNotice.waitFor();
      const noticeBox=await childNotice.boundingBox();assert.ok(noticeBox.width>700&&noticeBox.height>500);
      await childNotice.click({button:'right'});assert.equal(await page.locator('[data-chapter-id]').count(),20);
      checks.push('formal chooser has notice-only header; full-viewport history returns without starting App or cancelling chapter selection');
      const at = await page.locator('[data-chapter-id]').evaluateAll((nodes,id)=>nodes.findIndex(node=>node.dataset.chapterId===id),chapterId); assert.ok(at>=0);
      await page.locator('[data-chapter-id]').nth(at).click(); await page.locator('[data-faction-slot]').first().click(); await ready();
      if (programPaths) {
        assert.equal(await page.evaluate(() => document.baseURI), origin + programBase);
        for (const stem of ['map_tiles_', 'map_atlas_']) for (const season of ['spring', 'summer', 'autumn', 'winter'])
          assert.ok(programRequests.some(row => row.path.startsWith(programBase + 'content/builtin/compiled/map-2-') && row.path.endsWith('/' + stem + season + '.png')), 'fixed season bytes from loaded program');
        assert.ok(programRequests.some(row => row.path === programBase + 'src/player/playerpublic.js'));
        checks.push('actual archived public module requests all eight season images from its own immutable program, without root fallback');
      }
      initialMetadata = await metadata(); releaseId = initialMetadata.scenarioAssembly.content.publication.releaseId;
      assert.equal(releaseId,index.releaseId); assert.equal(initialMetadata.scenarioAssembly.content.publication.ordinal,'1.0');
      assert.deepEqual(await page.evaluate(()=>({cities:window.__app.scenario.cities.length,trial:window.__app.trialIdentity??null})),{cities:192,trial:null});
      assert.deepEqual(await page.evaluate(()=>window.__app.saveGame(0,'public player save')),{saved:'local'});
      const first=await record(); savedDigest=first.token.bodyDigest; assert.equal(first.record.releaseId,releaseId);
      observations.push({first:initialMetadata,releaseId,savedDigest}); checks.push('production title/current catalog/notice/native YES/chapter/faction/shared App/native game-local save');
      // Unmodified saves.html uses the actual signed reader and compiled pack,
      // sharing only this fresh context's database with the running App.
      const backupPage = await context.newPage(); backupPage.setDefaultTimeout(90000);
      await backupPage.goto(origin + '/saves.html');
      const backup = backupPage.locator('#formal-backups');
      await backup.getByRole('button', { name: '更新上架遊戲', exact: true }).click();
      await backup.getByLabel('備份遊戲', { exact: true }).selectOption(gameId);
      await backup.getByRole('button', { name: '讀取章節', exact: true }).click();
      await backup.getByLabel('備份章節', { exact: true }).selectOption(chapterId);
      await backup.getByRole('button', { name: '讀取本機目錄', exact: true }).click();
      const download = backupPage.waitForEvent('download');
      await backup.getByRole('button', { name: '匯出目前槽 JSON', exact: true }).click();
      const stream = await (await download).createReadStream(), chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const backupBytes = Buffer.concat(chunks);
      await backup.getByLabel('正式遊戲備份檔', { exact: true }).setInputFiles({ name: 'owned-backup.json', mimeType: 'application/json', buffer: backupBytes });
      await backup.getByRole('button', { name: '驗證並另存新槽', exact: true }).click();
      await backupPage.waitForFunction(() => document.querySelector('#formal-backups [role=status]').textContent.includes('匯入已提交為槽5'));
      const imported = await backupPage.evaluate(async gameId => {
        const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
        return createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB }).get(4);
      }, gameId);
      assert.deepEqual(imported.record.snapshot, { ...first.record.snapshot, slot: 4 });
      assert.notEqual(imported.token.recordId, first.token.recordId);
      assert.deepEqual(await record(), first); assert.deepEqual(await metadata(), initialMetadata);
      assert.equal(await backupPage.evaluate(() => !!window.__app), false);
      observations.push({ backupImport: { slot: imported.record.slot, recordId: imported.token.recordId, releaseId: imported.record.releaseId, bodyDigest: imported.token.bodyDigest } });
      checks.push('unmodified saves.html/current signed reader/20 chapter previews/fresh pack/file download and import/native new-slot CAS; original record and live App unchanged');
      // Corrupt imports must refuse without creating slots or touching the
      // live App: truncated bytes fail decode, a foreign gameId fails the
      // explicit identity/admission path. Both leave catalog and records intact.
      const catalogBefore = await backupPage.evaluate(async gameId => {
        const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
        return (await createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB }).list()).map(entry => entry.slot);
      }, gameId);
      let parsedBackup;
      try { parsedBackup = JSON.parse(backupBytes.toString('utf8')); }
      catch (cause) { assert.fail('owned backup export must be JSON: ' + cause.message); }
      const foreign = Buffer.from(JSON.stringify({ ...parsedBackup, saved: { ...parsedBackup.saved, gameId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } }));
      for (const [name, buffer] of [['truncated', backupBytes.subarray(0, Math.floor(backupBytes.length / 2))], ['foreign-game', foreign]]) {
        await backup.getByLabel('正式遊戲備份檔', { exact: true }).setInputFiles({ name: `owned-${name}.json`, mimeType: 'application/json', buffer });
        await backup.getByRole('button', { name: '驗證並另存新槽', exact: true }).click();
        await backupPage.waitForFunction(() => document.querySelector('#formal-backups [role=status]').textContent.includes('操作未完成'));
        const after = await backupPage.evaluate(async gameId => {
          const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
          const store = createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB });
          return { slots: (await store.list()).map(entry => entry.slot), kept: await store.get(4), extra: await store.get(5) };
        }, gameId);
        assert.deepEqual(after.slots, catalogBefore, name + ': corrupt import must not add slots');
        assert.equal(after.extra, null, name + ': no slot 5 may exist');
        assert.deepEqual(after.kept.record.snapshot, { ...first.record.snapshot, slot: 4 }, name + ': good import intact');
        assert.equal(after.kept.token.recordId, imported.token.recordId, name + ': good import identity intact');
      }
      assert.deepEqual(await record(), first); assert.deepEqual(await metadata(), initialMetadata);
      assert.equal(await backupPage.evaluate(() => !!window.__app), false);
      checks.push('unmodified saves.html refuses truncated and foreign-game backup imports without new slots; good import, original record and live App unchanged');
      await backupPage.close();
      if (programPaths) {
        const latePaths = ['grf/battle_terrain_0.png', 'grf/battle_terrain_1.png', 'grf/battle_terrain_2.png', 'grf/battle_units.png', 'battle_talk.json', 'battle_display.bin', 'grf/music/loops/BGM_07.flac'];
        for (const path of latePaths) assert.ok(!programRequests.some(row => row.path === programBase + path), 'cold late resource: ' + path);
        deployedManifest = nextProgram.bytes; // Operator-side deployment changes; the existing document stays open.
        const since = programRequests.length;
        lateResources = await page.evaluate(async base => {
          const { loadImage, loadJSON, loadBytes } = await import(base + 'src/core/assets.js');
          const images = await Promise.all([0, 1, 2].map(layout => loadImage(`grf/battle_terrain_${layout}.png`)).concat(loadImage('grf/battle_units.png')));
          const talk = await loadJSON('battle_talk.json'), display = await loadBytes('battle_display.bin');
          const music = window.__app.score.music, previous = music.track;
          window.__ownedPreviousMusic = previous; music.select(7);
          return { images: images.map(image => [image.naturalWidth, image.naturalHeight]), talkLoaded: talk !== null && typeof talk === 'object', displayBytes: display.length };
        }, programBase);
        await page.waitForFunction(() => window.__app.score.music.track === 7 && window.__app.score.music.source && window.__app.score.music.cache?.track === 7);
        await page.evaluate(() => window.__app.score.music.select(window.__ownedPreviousMusic));
        for (const [width, height] of lateResources.images) assert.ok(width > 0 && height > 0);
        assert.equal(lateResources.talkLoaded, true); assert.equal(lateResources.displayBytes, (3 * 192 + 360) * 0x140);
        for (const path of latePaths) assert.ok(programRequests.slice(since).some(row => row.path === programBase + path), 'old document retains late resource: ' + path);
        assert.ok(programRequests.slice(since).every(row => row.path.startsWith(programBase)), 'no new-program resource in old document');
        assert.equal(await moduleBase(), programBase); assert.deepEqual(await metadata(), initialMetadata); assert.equal((await record()).token.bodyDigest, savedDigest);
        checks.push('after current software changes, cold tactical images/data use actual loaders and music decodes in the old program; no App/content/save replacement');
      }
      // Actual exit navigation, then native NO in the real title, not a test
      // startup function or a supplied savedSlot.
      await page.evaluate(()=>{void window.__app.returnToTitle();}); await page.waitForURL(origin+'/'); await title();
      await page.locator('.player-catalog option').filter({hasText:'1.0'}).first().waitFor({state:'attached'});
      await page.locator('.player-catalog select').selectOption(gameId); await yesNo(false);
      await page.waitForURL(url=>url.searchParams.get('mode')==='load'); await page.locator('[data-save-slot="0"]').click(); await ready();
      assert.deepEqual(await metadata(),initialMetadata); assert.equal((await record()).token.bodyDigest,savedDigest);
      assert.equal(await page.evaluate(()=>window.__app.loadedSaveSlot),0);
      if (programPaths) { assert.equal(await moduleBase(), nextBase); checks.push('fresh restore navigation selects the new program while preserving exact formal save identity'); }
      checks.push('actual title exit/NO/current restore chooser/captured snapshot/shared App restore');
      await Promise.all([page.waitForEvent('domcontentloaded'),page.evaluate(()=>{void window.__app.returnToTitle('load');})]);
      await page.locator('[data-save-slot="0"]').click();await ready();
      assert.deepEqual(await metadata(),initialMetadata);assert.equal((await record()).token.bodyDigest,savedDigest);
      checks.push('in-game load exits old App and actually reloads current title-phase restore before installing a captured archive');
      await Promise.all([page.waitForEvent('domcontentloaded'),page.evaluate(()=>{void window.__app.returnToTitle('load');})]);
      await page.locator('[data-save-slot="4"]').click();await ready();
      assert.equal(await page.evaluate(()=>window.__app.loadedSaveSlot),4);
      assert.deepEqual(await metadata(),initialMetadata);assert.deepEqual(await record(),first);
      const restoredImport = await page.evaluate(async ({ base, gameId }) => {
        const { createGameSaveStore } = await import(base + 'src/core/gamesavestore.js');
        const { saveJSON } = await import(base + 'src/core/gamesavecodec.js');
        const app = window.__app;
        const stored = await createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB }).get(4);
        return { stored, rng: saveJSON(app.originalRng.snapshot()) };
      }, { base: await moduleBase(), gameId });
      assert.deepEqual(restoredImport.stored, imported);
      const { saveJSON } = await import('../../web/src/core/gamesavecodec.js');
      assert.equal(restoredImport.rng, saveJSON(imported.record.snapshot.webMeta.originalRng));
      checks.push('actual title-phase chooser restores the page-imported slot4 through signed admission into a fresh App; full RNG and stored record retained, original slot0 unchanged');
    },
    async unavailable() {
      // All required pack bytes are already resident. The independent original
      // App probe retains the explicit failing lazy-resource read assertion.
      assert.equal(await page.evaluate(()=>window.__app.checkFormalCurrent()&&!!window.__app.scenario),true);
      checks.push('assembled production App is still active while server chapter is temporarily missing (no lazy fetch asserted)');
    },
    async observe(listed, index) {
      if (listed) {
        const oldReleaseId = releaseId, beforeURL = page.url();
        assert.equal(await page.evaluate(() => window.__app.gamebar.openSystemSaveDialog()), true);
        const dialog = page.getByRole('dialog', { name: '遊戲結束' }); await dialog.waitFor();
        assert.match(await dialog.textContent(), /版本已更新/);
        const attempted = await page.evaluate(async () => {
          const n = window.__ownedDatabases.length, saved = await window.__app.saveGame(0, 'must not save retired release');
          return { saved, noIO: n === window.__ownedDatabases.length, scenario: window.__app.scenario, enabled: window.__app.runtimeEnabled };
        });
        assert.deepEqual(attempted, { saved: { saved: 'blocked', reason: 'superseded' }, noIO: true, scenario: null, enabled: false });
        assert.equal((await record()).token.bodyDigest, savedDigest);
        await dialog.click({ button: 'right' }); assert.equal(page.url(), beforeURL); assert.equal(await dialog.isVisible(), true);
        await dialog.getByRole('button', { name: '確認', exact: true }).click(); await page.waitForURL(origin + '/'); await title();
        observations.push({ updatedRetirement: attempted, oldReleaseId, preservedDigest: savedDigest });
        checks.push('actual update discovery stops old App before IDB; right cannot confirm; explicit left navigates to current title');
        await page.locator('.player-catalog option').filter({ hasText: '1.1' }).first().waitFor({ state: 'attached' });
        await page.locator('.player-catalog select').selectOption(gameId); await yesNo(true);
        await page.waitForURL(url => url.searchParams.get('mode') === 'new');
        await page.locator('[data-chapter-id]').first().waitFor(); assert.equal(await page.locator('[data-chapter-id]').count(), 20);
        const at = await page.locator('[data-chapter-id]').evaluateAll((nodes, id) => nodes.findIndex(node => node.dataset.chapterId === id), chapterId); assert.ok(at >= 0);
        await page.locator('[data-chapter-id]').nth(at).click(); await page.locator('[data-faction-slot]').first().click(); await ready();
        initialMetadata = await metadata(); releaseId = initialMetadata.scenarioAssembly.content.publication.releaseId;
        assert.equal(releaseId, index.releaseId); assert.notEqual(releaseId, oldReleaseId);
        assert.equal(initialMetadata.scenarioAssembly.content.publication.ordinal, '1.1');
        // Old release slot 0 is reserved/unavailable, not an overwrite grant.
        // Save into an observed empty slot; the same commit must prune old 0.
        saveSlot = 1;
        assert.deepEqual(await page.evaluate(slot => window.__app.saveGame(slot, 'explicit fresh current release'), saveSlot), { saved: 'local' });
        const obsolete = await page.evaluate(async ({ game, base }) => {
          const { createGameSaveStore } = await import(base + 'src/core/gamesavestore.js');
          return createGameSaveStore({ gameId: game, databaseName: 'wolong-web', getIndexedDB: () => indexedDB }).get(0);
        }, { game: gameId, base: await moduleBase() });
        assert.equal(obsolete, null, 'current-release save atomically prunes old release slot');
        const current = await record(); assert.equal(current.record.releaseId, releaseId); assert.equal(current.record.releaseOrdinal, 1); savedDigest = current.token.bodyDigest;
        observations.push({ current: initialMetadata, releaseId, savedDigest });
        checks.push('explicit new 1.1 title/chapter/faction selection installs a fresh App and saves the current release, never hot-replaces old App');
        return;
      }
      assert.deepEqual(await page.evaluate(slot => window.__app.saveGame(slot, 'public current release unlisted'), saveSlot), { saved: 'local' });
      const stored = await record(); assert.equal(stored.record.releaseId, releaseId); assert.equal(stored.record.releaseOrdinal, 1); savedDigest = stored.token.bodyDigest;
      assert.equal((await metadata()).scenarioAssembly.content.publication.releaseId, releaseId);
      observations.push({ listed, releaseId: stored.record.releaseId, digest: savedDigest });
      checks.push('only unlisting without another update: already-current 1.1 production session can save without hot replacement');
    },
    async deleted() {
      const beforeURL=page.url();
      const attempted=await page.evaluate(async()=>{const n=window.__ownedDatabases.length;const saved=await window.__app.saveGame(0,'deleted');return{saved,noIO:n===window.__ownedDatabases.length,scenario:window.__app.scenario,enabled:window.__app.runtimeEnabled};});
      assert.deepEqual(attempted,{saved:{saved:'blocked',reason:'superseded'},noIO:true,scenario:null,enabled:false});
      const dialog=page.getByRole('dialog',{name:'遊戲結束'});await dialog.waitFor();assert.match(await dialog.textContent(),/遊戲已刪除/);
      assert.equal(page.url(),beforeURL);await dialog.click({button:'right'});assert.equal(page.url(),beforeURL);assert.equal(await dialog.isVisible(),true);
      await dialog.getByRole('button',{name:'確認',exact:true}).click();await page.waitForURL(origin+'/');await title();
      await page.waitForFunction(()=>!document.querySelector('.player-catalog [role="status"]')?.textContent.includes('正在取得'));
      assert.equal(await page.locator('.player-catalog option').count(),1);assert.equal((await record()).token.bodyDigest,savedDigest);
      observations.push({attempted,finalURL:page.url(),preservedDigest:savedDigest});checks.push('410 stops App/write; right retains confirmation; left actually navigates to current initial page, archive retained');
    },
    completedProgramStream(event) { assert.equal(programPaths, true); const basePath = [...programFiles.keys()].find(base => event.path.startsWith(base)); assert.ok(basePath);
      return assertCompletedProgramStream(event, [...traces.values()], programRequests, { origin, basePath, files: programFiles.get(basePath) }); },
    async traces(){
      // A fetch still in flight when the report is written is not evidence either way; give it a
      // bounded settle window, then assert. A real resolved-but-unread body still fails below.
      for(let i=0;i<50&&[...traces.values()].some(row=>row.status===null);i++)await new Promise(done=>setTimeout(done,100));
      const rows=[...traces.values()],bad=rows.filter(row=>!row.completed||row.cancelled||!(row.bytes>0));
      assert.ok(rows.length>0&&bad.length===0,JSON.stringify(bad.slice(0,5)));return rows;
    },
    async screenshot(path){await page.screenshot({path});},
    report(){assert.equal(programPuts,installedPuts);return{checks,observations,sources,program:programPaths?{archive,nextArchive,lateResources,programDigest,requests:programRequests,puts:programPuts,scope:'Two owned memory software archives, current-deployment manifest switch, actual late image/data loaders and MusicPlayer decoding, then new-program restore. Only an inert boot comment differs: actual site dispatch; not changed-engine compatibility, BattleView/Session execution or real cloud deployment.'}:null,sourceTreeDigest:manifest.sourceTreeDigest,scope:'Unmodified production HTML/boot/title/new/restore/status/confirmation/navigation, own native IDB and real publisher/reader through controlled transport. Startup intro uses owned seen marker; clock held by polling after assembly. Not real TLS/cloud, old-resource retention, author blank creation or full campaign.'};},
  };
}
