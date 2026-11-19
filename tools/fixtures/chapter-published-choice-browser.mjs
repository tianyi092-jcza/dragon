// Real DOM chooser + published bytes + native preparation in fresh Chromium.
// The read ports belong to the isolated SQL fixture, not a signed reader admission.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { startBrowserTestServer } from '../browser_test_server.mjs';

export async function verifyPublishedChapterChoice({ selection, manifestDigest, readRole, readStatic, app = false, eraGeneralIdx = null }) {
  const { chromium } = createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  const server = await startBrowserTestServer(), origin = `http://127.0.0.1:${server.port}`;
  const errors = [], outside = [], results = [];
  const databaseName = 'chapter-wb-app-' + randomUUID();
  const anchor = '<script type="module" src="src/boot.js"></script>';
  const html = app ? readFileSync('web/index.html', 'utf8') : '';
  if (app) assert.equal(html.split(anchor).length, 2);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(({ app, databaseName }) => {
      const open = indexedDB.open.bind(indexedDB);
      window.__chapterDatabases = [];
      if (app) {
        const fillText = CanvasRenderingContext2D.prototype.fillText;
        window.__chapterDatePaint = null;
        CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
          if (y === 8 && maxWidth === 35) {
            const metrics = this.measureText(text);
            window.__chapterDatePaint = { sequence: (window.__chapterDatePaint?.sequence ?? 0) + 1,
              text: String(text), x, y, width: Math.min(metrics.width, maxWidth),
              inkTop: y - metrics.actualBoundingBoxAscent, inkBottom: y + metrics.actualBoundingBoxDescent };
          }
          return fillText.apply(this, arguments);
        };
      }
      indexedDB.open = (name, ...args) => {
        if (!app || name !== databaseName) throw new Error('non-owned storage forbidden');
        window.__chapterDatabases.push(name); return open(name, ...args);
      };
    }, { app, databaseName });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') { outside.push(request.url()); return route.abort(); }
      if (url.pathname === '/__chapter-choice') return route.fulfill({ contentType: 'text/html', body: app ? html.replace(anchor, '<main id="choice"></main>') : '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><main id="choice"></main>' });
      if (url.pathname === '/__chapter-role' || url.pathname === '/__chapter-static') {
        const value = await (url.pathname === '/__chapter-role' ? readRole(url.searchParams.get('key')) : readStatic(url.searchParams.get('key')));
        return route.fulfill({ contentType: value.contentType, body: Buffer.from(value.bytes) });
      }
      if (/^\/src\/[a-z0-9_./-]+\.js$/i.test(url.pathname)) return route.continue();
      if (app && (/^\/(?:assets|data|kao|content|font|intro|grf)\/[a-z0-9_./-]+\.(?:png|json|css|woff2?|svg|mp3|flac|wav)$/i.test(url.pathname) || /^\/(?:battle_maps|battle_navigation|battle_rules|battle_scripts|talk)\.json$/.test(url.pathname) || /^\/favicon(?:-64)?\.(?:ico|png)$/.test(url.pathname))) return route.continue();
      outside.push(request.url()); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
    for (const playerFaction of [0, 1]) for (const pass of app ? (eraGeneralIdx === null ? [0, 1] : [0, 1, 2]) : [0]) {
      const restoring = pass > 0, postEra = pass === 2;
      await page.goto(origin + '/__chapter-choice');
      await page.evaluate(async ({ selection, manifestDigest, app, databaseName, restoring, postEra, eraGeneralIdx }) => {
        const [{ mountPlayerNewGame }, { createPlayerEnvironment }, { prepareScenario }, { nativeMonthlyPolicyWord, writeNativeMonthlyPolicyWord, refreshNativeMonthlyPolicyViews }, { TRIAL_COMPILER_REVISION }, { sha256 }] = await Promise.all([
          import('/src/player/playernewgame.js'), import('/src/player/playerenvironment.js'), import('/src/game/scenarioassembly.js'),
          import('/src/game/nativemonthlypolicy.js'), import('/src/content/authoring/trialcompile.js'), import('/src/player/runtimecontract.js'),
        ]);
        const control = window.__chapterChoice = { result: null, error: null, sessions: [], appResult: null, exits: [] };
        const read = async (path, key) => {
          const response = await fetch(path + '?key=' + encodeURIComponent(key));
          if (!response.ok) throw new Error('owned read failed: ' + response.status);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return { bytes, contentType: response.headers.get('content-type'), sha256: await sha256(bytes) };
        };
        const reader = {
          async status() { return { ...selection, listed: true }; },
          async admit({ chapterId }) {
            let state = 'active';
            const session = { identity: { ...selection, chapterId, manifestDigest }, state: () => state,
              close() { state = 'closed'; }, read: role => read('/__chapter-role', role) };
            control.sessions.push(session); return session;
          },
        };
        const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
        const store = app ? createGameSaveStore({ gameId: selection.gameId, databaseName, getIndexedDB: () => indexedDB }) : null;
        const config = { root: document.querySelector('#choice'), reader, selection,
          compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic: path => read('/__chapter-static', path) };
        const chooser = restoring ? (await import('/src/player/playerrestore.js')).mountPlayerRestore({ ...config, store }) : mountPlayerNewGame(config);
        control.pending = chooser.result.then(async chosen => {
          if (!chosen) throw new Error('choice unexpectedly cancelled');
          try {
            const environment = chosen.environment ?? createPlayerEnvironment(chosen.pack, { playerFaction: chosen.playerFaction });
            let sc;
            if (!restoring) sc = (await prepareScenario({ raw: environment.raw, idx: 0, mode: 'fresh', content: environment.content, world: environment.world })).scenario;
            if (app) {
              const [{ startApp }, { createPlayerSaveStore }, { createPlayerSaveRepository }] = await Promise.all([
                import('/src/main.js'), import('/src/player/playersaves.js'), import('/src/player/playerrepository.js'),
              ]);
              const saves = createPlayerSaveStore({ environment, store });
              const repository = chosen.saveRepository ?? createPlayerSaveRepository({ saves, assertCurrent: chosen.pack.assertCurrent });
              await startApp(null, { formal: { environment, saveRepository: repository, savedSlot: chosen.savedSlot ?? null, onExit: value => { control.exits.push(value); } } });
              const live = window.__app;
              live.gamebar._clockHoldRequested = true; live.gamebar.syncClock();
              control.appResult = { active: live.runtimeEnabled, player: live.scenario.player_faction, trust: live.scenario.trust,
                tax: live.scenario.tax, recruitmentWord: nativeMonthlyPolicyWord(live.scenario, 2, 'actual App selected opening'), cities: live.scenario.cities.length, rng: live.originalRng.snapshot() };
              sc = structuredClone(live.scenario);
              live.scenario.trust = environment.player ? 27 : 13;
              if (!restoring) {
                writeNativeMonthlyPolicyWord(live.scenario, 2, 37, 'owned running-state save test');
                refreshNativeMonthlyPolicyViews(live.scenario);
              }
              if (eraGeneralIdx !== null) {
                const clock = live.clock, date = () => ({ era: clock.era, year: clock.year, month: clock.month, day: clock.day });
                const dateDisplay = async () => {
                  const deadline = performance.now() + 10000;
                  let hudRefreshed = false;
                  const observer = new MutationObserver(() => { hudRefreshed = true; });
                  observer.observe(document.querySelector('#datestr'), { childList: true, characterData: true, subtree: true });
                  await new Promise((resolve, reject) => {
                    const frame = () => {
                      // The production HUD refreshes at 10Hz, independently of
                      // Canvas paints. A held, unchanged date need not repaint.
                      if (window.__chapterDatePaint && hudRefreshed) return resolve();
                      if (performance.now() >= deadline) return reject(new Error('actual GameBar date was not painted'));
                      requestAnimationFrame(frame);
                    };
                    requestAnimationFrame(frame);
                  }).finally(() => observer.disconnect());
                  return { ...window.__chapterDatePaint, left: live.gamebar.bx + 459, right: live.gamebar.bx + 494,
                    hud: document.querySelector('#datestr').textContent };
                };
                const transition = control.appResult.era = { before: date(), beforeMonths: live.scenario.generals[eraGeneralIdx].appear_months,
                  months: 0, settlements: 0, nextPolicy: [...live.scenario.next_conscription], nextTax: live.scenario.next_tax,
                  beforeDisplay: await dateDisplay() };
                if (restoring && !postEra) {
                  const month = clock.onMonthEnd, hour = clock.onHour, settlement = live.hud.showSettlement.bind(live.hud);
                  clock.onMonthEnd = c => { transition.months++; return month(c); };
                  live.hud.showSettlement = report => { transition.settlements++; transition.finance = report.find(row => row.faction === environment.player); return settlement(report); };
                  const completed = new Promise(resolve => {
                    clock.onHour = c => {
                      hour(c);
                      if (c.era === 'ad' && c.year === 1 && c.month === 1 && c.day === 1) {
                        live.gamebar._clockHoldRequested = true; live.gamebar.syncClock(); resolve();
                      }
                    };
                  });
                  clock.hour = 23; clock.sub = 8;
                  live.gamebar._clockHoldRequested = false; live.gamebar.syncClock();
                  clock.advanceFrame(clock.currentStep);
                  await completed;
                  clock.onMonthEnd = month; clock.onHour = hour; live.hud.showSettlement = settlement;
                }
                if (postEra) {
                  const serial = clock.strategicTickSerial, sub = clock.sub;
                  live.gamebar._clockHoldRequested = false; live.gamebar.syncClock();
                  const advanced = clock.advanceFrame(clock.currentStep);
                  live.gamebar._clockHoldRequested = true; live.gamebar.syncClock();
                  transition.resumed = { advanced, ticks: clock.strategicTickSerial - serial, sub: clock.sub - sub };
                }
                Object.assign(transition, { after: date(), afterMonths: live.scenario.generals[eraGeneralIdx].appear_months,
                  activated: [...live.scenario.conscription], tax: live.scenario.tax, money: live.scenario.factions[environment.player].money,
                  afterDisplay: await dateDisplay() });
              }
              control.appResult.saved = await live.saveGame(environment.player, 'CHAPTER-WB owned App');
              const saved = await store.get(environment.player);
              control.appResult.savedTrust = saved?.record.snapshot.state.trust;
              control.appResult.savedRng = saved?.record.snapshot.webMeta.originalRng;
              control.appResult.savedRecruitment = saved?.record.snapshot.state.conscription[0];
              if (eraGeneralIdx !== null) control.appResult.savedDate = saved?.record.snapshot.state.save_date;
              control.appResult.databases = [...window.__chapterDatabases];
              await live.returnToTitle('load');
              control.appResult.exits = control.exits;
            }
            control.result = { chapterId: chosen.pack.identity.chapterId, selected: environment.player, actual: sc.player_faction,
              trust: sc.trust, tax: sc.tax, recruitmentWord: nativeMonthlyPolicyWord(sc, 2, 'browser selected opening'),
              next: sc.next_conscription, factionSlots: sc.nativeFactionSlots.records.length };
          } finally { chosen.pack.close(); chosen.session.close(); }
        }).catch(error => { control.error = String(error); });
      }, { selection, manifestDigest, app, databaseName, restoring, postEra, eraGeneralIdx });
      if (restoring) await page.locator(`[data-save-slot="${playerFaction}"]`).click();
      else {
        const firstChapter = page.locator('[data-chapter-id]').first();
        await page.waitForFunction(() => document.querySelector('[data-chapter-id]') || document.querySelector('.player-new-game h2')?.textContent === '新局暫不可用');
        assert.equal(await page.locator('.player-new-game h2').textContent(), '選擇章節', JSON.stringify({ errors, outside }));
        await firstChapter.waitFor();
        assert.equal(await firstChapter.getAttribute('data-chapter-id'), selection.chapters[0]);
        if (eraGeneralIdx !== null) assert.ok((await firstChapter.textContent()).includes('公元前1/12/31'), 'real DOM chooser includes the explicit era');
        await firstChapter.click();
        await page.locator(`[data-faction-slot="${playerFaction}"]`).click();
      }
      await page.waitForFunction(() => window.__chapterChoice.result || window.__chapterChoice.error);
      const result = await page.evaluate(() => ({ result: window.__chapterChoice.result, appResult: window.__chapterChoice.appResult, error: window.__chapterChoice.error,
        closed: window.__chapterChoice.sessions.every(session => session.state() === 'closed') }));
      assert.equal(result.error, null, JSON.stringify({ error: result.error, errors: errors.slice(0, 8), outside: outside.slice(0, 8), counts: [errors.length, outside.length] })); assert.equal(result.closed, true);
      const expectedTrust = restoring ? (playerFaction ? 27 : 13) : (playerFaction ? 201 : 47);
      const expectedRecruitment = postEra ? 2 : restoring ? 37 : (playerFaction ? 7 : 12);
      const expectedTax = postEra ? results.at(-1).app.era.nextTax : playerFaction ? 24 : 12;
      assert.deepEqual(result.result, { chapterId: selection.chapters[0], selected: playerFaction, actual: playerFaction,
        trust: expectedTrust, tax: expectedTax, recruitmentWord: expectedRecruitment,
        next: [20, 30, 40], factionSlots: 22 });
      if (app) {
        const { databases, era, savedDate, rng, savedRng, ...actual } = result.appResult;
        if (restoring) assert.deepEqual(rng, results.at(-1).app.savedRng, 'App restore must not replay RNG-consuming monthly steps');
        if (eraGeneralIdx !== null) {
          assert.deepEqual(era.before, postEra ? { era: 'ad', year: 1, month: 1, day: 1 } : { era: 'bc', year: 1, month: 12, day: 31 });
          assert.equal(era.beforeMonths, postEra ? 2 : 3);
          assert.deepEqual(era.after, restoring ? { era: 'ad', year: 1, month: 1, day: 1 } : era.before);
          assert.deepEqual(savedDate, era.after);
          for (const [date, display] of [[era.before, era.beforeDisplay], [era.after, era.afterDisplay]]) {
            assert.equal(display.text, date.era === 'bc' ? '前1' : '1', 'actual Canvas year text, not just clock state');
            assert.ok(display.x >= display.left - 0.001 && display.x + display.width <= display.right + 0.001, 'year fits its original calendar column');
            assert.ok(display.inkTop >= 0 && display.inkBottom <= 32, 'real font metrics fit the toolbar height');
            assert.ok(display.hud.startsWith(`${date.era === 'bc' ? '公元前' : ''}${date.year}年${date.month}月${date.day}日`), 'HUD clock text follows the same era: ' + JSON.stringify({ date, display }));
          }
          assert.equal(era.afterMonths, restoring ? 2 : 3);
          assert.equal(era.months, restoring && !postEra ? 1 : 0); assert.equal(era.settlements, restoring && !postEra ? 1 : 0);
          if (restoring && !postEra) {
            assert.deepEqual(era.activated, era.nextPolicy); assert.equal(era.tax, era.nextTax); assert.equal(era.finance.gold, era.money);
          }
          if (postEra) {
            assert.equal(era.money, results.at(-1).app.era.money, 'restoring the new era does not pay monthly income again');
            assert.deepEqual(era.resumed, { advanced: true, ticks: 1, sub: 1 }, 'restored new-era App continues its real strategic clock');
          }
        }
        assert.ok(databases.length && databases.every(name => name === databaseName));
        assert.deepEqual(actual, { active: true, player: playerFaction, trust: expectedTrust,
          tax: expectedTax, recruitmentWord: expectedRecruitment, cities: 192,
          saved: { saved: 'local' }, savedTrust: playerFaction ? 27 : 13, savedRecruitment: eraGeneralIdx !== null && restoring ? 20 : 370, exits: [{ reason: 'title', initialAction: 'load' }] });
      }
      results.push({ ...result.result, restoring, postEra, ...(app ? { app: result.appResult } : {}) });
    }
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    return results;
  } finally { await browser?.close(); await server.close(); }
}
