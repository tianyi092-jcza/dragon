// Read-only production smoke, overriding only changed JS in an isolated browser context.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
import {readFile} from 'node:fs/promises';
const origin='https://dragon.720108.xyz', gameId=process.argv[2];
if (!gameId) throw Error('pass a listed test game ID');
const browser=await chromium.launch();
try {
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const path of ['src/main.js','src/player/playerpublic.js','src/ui/startmenu.js']) await page.route(origin+'/'+path,r=>r.fulfill({contentType:'text/javascript',body:readFileSyncCache[path]}));
 const readFileSyncCache=Object.fromEntries(await Promise.all(['src/main.js','src/player/playerpublic.js','src/ui/startmenu.js'].map(async p=>[p,await readFile(new URL('../web/'+p,import.meta.url))])));
 await page.goto(origin);await page.waitForFunction(()=>window.__dragonApp?.startMenu?._onClick,null,{timeout:120000});
 const select=page.locator('.player-public-catalog select').first();await select.selectOption(gameId);
 const expected=await page.evaluate(async id=>(await (await fetch('/play-api/v1/chapters?game='+id)).json()).chapters.map(c=>c.name),gameId);
 const box=await page.locator('#startv').boundingBox();const click=(y,button='left')=>page.mouse.click(box.x+300*box.width/640,box.y+y*box.height/400,{button});
 await click(175);await page.waitForFunction(()=>!!window.__dragonApp?._formalEntry?.catalog);await page.waitForFunction(()=>window.__dragonApp.startMenu._sortedScenarios?.length>0);
 assert.deepEqual(await page.evaluate(()=>window.__dragonApp.startMenu._chapterRows().map(r=>r.name)),expected);
 await click(175,'right');await select.waitFor({state:'visible'});await click(198);await page.waitForFunction(()=>document.querySelector('.player-restore')?.textContent.includes(window.__dragonApp.startMenu.selectedGame.name));
 console.log({chapters:expected.length,errors,load:await page.locator('[role=dialog]').allTextContents()});assert.deepEqual(errors,[]);
} finally {await browser.close()}
