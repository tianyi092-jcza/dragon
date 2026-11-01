// B7 gate: the actual public load entry, a controlled same-origin HTTPS reader
// and a fresh isolated Chromium profile. No listener is opened (the origin is
// route-fulfilled), no production reader/admission, no real user save or
// SAVE.DAT, no cloud service.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,normalize,relative,sep} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const G='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',origin='https://127.0.0.1:18443';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const types={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.flac':'audio/flac','.wav':'audio/wav','.ico':'image/x-icon','.wasm':'application/wasm'};
const parent='.dragon-analysis/release-readiness';await mkdir(parent,{recursive:true});const artifact=await mkdtemp(join(parent,'player-deleted-entry-browser-'));
let browser,checks=0;const errors=[],failed=[],outside=[],missing=[],statusCalls=[],sources={};
try{
 const fixture=await readFile('tools/fixtures/player-deleted-entry-browser.mjs');sources['tools/fixtures/player-deleted-entry-browser.mjs']=sha(fixture);
 let html=await readFile('web/index.html');sources['web/index.html']=sha(html);
 const anchor='<script type="module" src="src/boot.js"></script>';const text=html.toString('utf8');
 assert.equal(text.split(anchor).length,2,'owned boot anchor');checks++;
 html=Buffer.from(text.replace(anchor,'<script type="module" src="/__fixtures/player-deleted-entry-browser.mjs"></script>'));
 async function disk(pathname){
  const local=normalize(join('web',decodeURIComponent(pathname)));
  if(!local.startsWith('web'+sep))return null;
  try{const body=await readFile(local);return {body,contentType:types[local.slice(local.lastIndexOf('.'))]??'application/octet-stream'};}catch{return null;}
 }
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1024,height:768},serviceWorkers:'block'});
 await context.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);window.__ownedDatabases=[];indexedDB.open=(name,...args)=>{if(name!=='wolong-web')throw new Error('non-owned IDB forbidden');window.__ownedDatabases.push(name);return open(name,...args);};});
 await context.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){outside.push(url.origin);return route.abort();}
  if(route.request().method()!=='GET'){outside.push(route.request().method()+' '+url.pathname);return route.abort();}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><title>owned initial page</title><p id="owned-initial">owned initial page</p>'});
  if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
  if(url.pathname==='/__fixtures/player-deleted-entry-browser.mjs')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fixture});
  if(url.pathname==='/play-api/v1/registry')return route.fulfill({contentType:'application/json',body:JSON.stringify({generation:1,digest:'a'.repeat(64),directory:[],announcements:[],announcementPage:{reset:false,nextCursor:null}})});
  if(url.pathname==='/play-api/v1/status'){statusCalls.push(url.searchParams.get('game'));return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({error:'GAME_DELETED',gameId:G})});}
  const asset=await disk(url.pathname);
  if(asset)return route.fulfill({contentType:asset.contentType,body:asset.body});
  missing.push(url.pathname);return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(90000);
 page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{
  if(message.type()!=='error')return;
  const path=new URL(message.location().url||origin).pathname,text=message.text();
  // The controlled 410 is the deliberate deletion fact under test, and a missing
  // favicon is not a player result.
  if(path==='/play-api/v1/status'&&text.includes('410'))return;
  if(path==='/favicon.ico')return;
  errors.push(text);
 });
 page.on('requestfailed',request=>failed.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
 // Scenario 1: the game is gone but the local saves are not; cancel keeps them.
 await page.goto(origin+'/index.html?formalGame='+G+'&mode=load');
 await page.waitForFunction(()=>window.__entry?.ready===true);
 const prompt=page.locator('.player-save-deleted');
 await prompt.waitFor();
 assert.match(await prompt.textContent(),/該遊戲已被刪除，存檔不可用，是否刪除？/);
 assert.equal(await page.locator('.player-public-failure').count(),0,'the deletion notice replaces the generic failure page');
 assert.deepEqual(await page.evaluate(()=>window.__entry.before().then(rows=>rows.map(row=>row.slot))),[0]);
 assert.equal(await page.evaluate(()=>window.__entry.failure),undefined);
 assert.ok(statusCalls.includes(G));
 await page.screenshot({path:join(artifact,'deleted-notice.png')});checks++;
 await prompt.getByRole('button',{name:'保留存檔',exact:true}).click();
 await page.waitForURL(origin+'/');
 assert.match(await page.textContent('body'),/owned initial page/);
 const kept=await page.evaluate(async gameId=>{const {createGameSaveStore}=await import('/src/core/gamesavestore.js');const store=createGameSaveStore({gameId,databaseName:'wolong-web',getIndexedDB:()=>indexedDB});return (await store.list()).map(row=>row.slot);},G);
 assert.deepEqual(kept,[0],'cancel keeps every local save');checks++;
 // Scenario 2: the same entry, then the confirmed irreversible deletion.
 await page.goto(origin+'/index.html?formalGame='+G+'&mode=load');
 await page.waitForFunction(()=>window.__entry?.ready===true);
 await prompt.waitFor();
 await prompt.getByRole('button',{name:'刪除本機存檔',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.player-save-deleted')?.textContent.includes('已刪除1個本機存檔'));
 assert.deepEqual(await page.evaluate(()=>window.__entry.before()),[]);
 assert.equal(await prompt.getByRole('button',{name:'刪除本機存檔',exact:true}).count(),0,'no second deletion control after the purge');
 await page.screenshot({path:join(artifact,'deleted-purged.png')});
 await prompt.getByRole('button',{name:'返回首頁',exact:true}).click();
 await page.waitForURL(origin+'/');
 const purged=await page.evaluate(async gameId=>{const {createGameSaveStore}=await import('/src/core/gamesavestore.js');const store=createGameSaveStore({gameId,databaseName:'wolong-web',getIndexedDB:()=>indexedDB});return (await store.list()).length;},G);
 assert.equal(purged,0,'confirmed deletion removes the verified local row only');checks++;
 // Scenario 3: right click is the keep answer and never deletes implicitly.
 await page.goto(origin+'/index.html?formalGame='+G+'&mode=load');
 await page.waitForFunction(()=>window.__entry?.ready===true);
 await prompt.waitFor();
 await prompt.click({button:'right'});
 await page.waitForURL(origin+'/');
 const keptAgain=await page.evaluate(async gameId=>{const {createGameSaveStore}=await import('/src/core/gamesavestore.js');const store=createGameSaveStore({gameId,databaseName:'wolong-web',getIndexedDB:()=>indexedDB});return (await store.list()).length;},G);
 assert.equal(keptAgain,1);checks++;
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(outside,[]);assert.deepEqual(missing,[]);
 assert.ok(await page.evaluate(()=>window.__ownedDatabases.every(name=>name==='wolong-web')));checks++;
 for(const path of ['web/src/player/playerpublic.js','web/src/player/playerdeletedgame.js','web/src/player/playerclient.js'])sources[path]=sha(await readFile(path));
 await writeFile(join(artifact,'result.json'),JSON.stringify({checks,statusCalls,kept,keptAgain,purged,errors,failed,outside,missing,sources,scope:'Actual public load entry and real Chromium IndexedDB for the deleted-game save notice: reader /play-api responses are route-fulfilled fixtures (no production reader, admission or signed ticket), one store-level row with a synthetic snapshot is seeded only to test the prompt/purge, and the initial-page navigation is a fulfilled placeholder. No real user save, SAVE.DAT, cloud service or deployment.'},null,2));
 process.stdout.write(JSON.stringify({checks,artifact:relative('.',artifact)})+'\n');
}catch(error){await writeFile(join(artifact,'failure.json'),JSON.stringify({error:String(error),errors,failed,outside,missing,statusCalls},null,2));throw error;}
finally{await browser?.close();}
