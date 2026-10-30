// Real reader/workerd/R2 plus the browser-compatible client in Node.
// --catalog-browser also drives the public wrapper over owned loopback HTTPS.
// Opaque transport fixtures, not an App/game/save or production deployment proof.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { startBrowserTestServer } from './browser_test_server.mjs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createPlayerReader } from '../reader/playerclient.js';
import { uploadRelease } from '../vps/publish_to_r2.mjs';
import { GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT, publication, unlisted } from './fixtures/publication.mjs';
const require=createRequire(import.meta.url);let modulePath=process.env.MINIFLARE_MODULE;
if(!modulePath){try{modulePath=require.resolve('miniflare');}catch{modulePath=join(process.env.APPDATA??'','npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js');}}
if(!existsSync(modulePath))throw new Error('existing Miniflare required');
const {Miniflare}=await import(pathToFileURL(modulePath).href);
const catalogBrowser=process.argv.includes('--catalog-browser');
assert.ok(process.argv.slice(2).every(arg=>arg==='--catalog-browser'));
const own=mkdtempSync(join(tmpdir(),'dragon-player-client-'));let mf,browser,staticServer,artifact,outbound=0,checks=0;
const parse=bytes=>{try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('bad owned JSON');}};
try{
 mf=new Miniflare({modules:true,modulesRules:[{type:'ESModule',include:['**/*.js']}],scriptPath:resolve('reader/worker.js'),compatibilityDate:'2024-01-01',host:'127.0.0.1',port:0,https:catalogBrowser,r2Buckets:['PUBLISH_BUCKET'],r2Persist:join(own,'r2'),bindings:{PLAYER_ORIGIN:'https://reader.test',PLAYER_ADMISSION_ACTIVE_KEY:'owned',PLAYER_ADMISSION_KEYS:JSON.stringify({owned:'11'.repeat(32)})},outboundService:()=>{outbound++;return new Response('denied',{status:403});}});
 await mf.ready;const bucket=await mf.getR2Bucket('PUBLISH_BUCKET');
 const r2={async get(key){const row=await bucket.get(key);return row?{bytes:Buffer.from(await row.arrayBuffer()),headers:{etag:row.httpEtag}}:null;},putImmutable:(key,bytes,mime)=>bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:mime}}),putControl:(key,bytes,etag)=>bucket.put(key,bytes,{onlyIf:etag===null?{etagDoesNotMatch:'*'}:{etagMatches:etag.replaceAll('"','')}})};
 const commit=async value=>uploadRelease(r2,'',value,await r2.get('control/current.json'));
 await bucket.put('kao/0.png',PORTRAIT);await bucket.put('kao/p0001.png',TEMPLATE_PORTRAIT);
 const chapter=GAME+'#c1',v1=publication(0,GAME,[chapter]),v2=publication(1,GAME,[chapter]);await commit(v1);
 let admissions=0,files=0;
 const client=createPlayerReader({origin:'https://reader.test',fetch:(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');if(url.includes('/admissions?'))admissions++;if(url.includes('/file?'))files++;return mf.dispatchFetch(url,options);}});
 const first=await client.admit({gameId:GAME,ordinal:'1.0',chapterId:chapter});
 assert.equal(parse((await first.read('manifest')).bytes).identity.sourceDigest,first.identity.sourceDigest);
 assert.equal(parse((await first.read('chapter:'+chapter)).bytes).fixture,'0:'+chapter);assert.deepEqual(Buffer.from((await first.read('asset:p0001')).bytes),TEMPLATE_PORTRAIT);checks++;
 await commit(v2);assert.equal((await first.status()).ordinal,'1.1');assert.equal(first.identity.ordinal,'1.0');await assert.rejects(()=>first.read('chapter:'+chapter),e=>e.code==='RELEASE_CHANGED'&&e.status===409);assert.equal(first.state(),'outdated');
 await assert.rejects(()=>client.admit({gameId:GAME,ordinal:'1.0',chapterId:chapter}),e=>e.code==='RELEASE_CHANGED');checks++;
 const second=await client.admit({gameId:GAME,ordinal:'1.1',chapterId:chapter});assert.equal(parse((await second.read('chapter:'+chapter)).bytes).fixture,'1:'+chapter);checks++;
 await commit(unlisted(false,v2.directory[0]));assert.deepEqual((await second.status()).currentRelease,{releaseId:'r1',ordinal:'1.1'});assert.equal(parse((await second.read('chapter:'+chapter)).bytes).fixture,'1:'+chapter);
 await assert.rejects(()=>client.admit({gameId:GAME,ordinal:'1.1',chapterId:chapter}),e=>e.code==='GAME_NOT_LISTED');assert.equal(admissions,4);checks++;
 const oldFile=v2.files.find(row=>row.key.endsWith('/chapters/'+chapter+'.json'));await bucket.delete(oldFile.key);
 await assert.rejects(()=>second.read('chapter:'+chapter),e=>e.code==='RUNTIME_UNAVAILABLE'&&e.status===503);assert.equal(second.state(),'active');await bucket.put(oldFile.key,oldFile.bytes,{httpMetadata:{contentType:oldFile.contentType}});assert.equal(parse((await second.read('chapter:'+chapter)).bytes).fixture,'1:'+chapter);checks++;
 await commit(unlisted(true));await assert.rejects(()=>second.read('manifest'),e=>e.code==='GAME_DELETED'&&e.status===410);assert.equal(second.state(),'deleted');const count=files;await assert.rejects(()=>second.read('manifest'),e=>e.code==='GAME_DELETED');assert.equal(files,count);assert.ok(await bucket.get(oldFile.key),'deletion fact does not prove physical purge');checks++;
 await assert.rejects(first.status,e=>e.code==='RELEASE_CHANGED');assert.equal(first.state(),'outdated');assert.equal(admissions,4);assert.equal(outbound,0);checks++;
 if(catalogBrowser){
  // The public wrapper's native fetch crosses a real loopback HTTPS socket.
  // Only the HTML fixture and static modules are routed; registry responses
  // are never fulfilled, replayed or substituted by Playwright.
  mkdirSync('.dragon-analysis/editor-completion',{recursive:true});
  artifact=mkdtempSync('.dragon-analysis/editor-completion/announcement-http-');
  const requests=[],responses=[],errors=[],failed=[],forbidden=[];
  const catalog=publication(39,OTHER_GAME,[OTHER_GAME+'#c1']);
  catalog.gameStates.unshift({gameId:GAME,listed:false,deleted:true});
  catalog.announcements=Array.from({length:40},(_,i)=>({...catalog.announcements[0],ordinal:`1.${i}`,name:`公開快照${i}`,firstOnlineAt:new Date(Date.UTC(2037,0,1+Math.floor(i/3))).toISOString()}));
  await commit(catalog);
  staticServer=await startBrowserTestServer();
  const staticOrigin=`http://127.0.0.1:${staticServer.port}`,origin=(await mf.ready).origin;
  assert.ok(origin.startsWith('https://127.0.0.1:'));
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)));
  browser=await chromium.launch({headless:true,env});
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',ignoreHTTPSErrors:true});
  await context.addInitScript(()=>{window.__idb=0;indexedDB.open=()=>{window.__idb++;throw new Error('storage forbidden');};});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin||request.method()!=='GET'){forbidden.push(request.url());return route.abort();}
   if(url.pathname==='/play-api/v1/registry'){
    const headers=await request.allHeaders();
    requests.push({path:url.pathname,search:url.search,headers});
    return route.continue();
   }
   if(url.pathname==='/__owned-catalog')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="icon" href="data:,"><body></body></html>'});
   if(url.pathname.startsWith('/src/'))return route.fulfill({response:await route.fetch({url:staticOrigin+url.pathname})});
   forbidden.push(url.pathname);return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{
   if(new URL(response.url()).pathname==='/play-api/v1/registry')responses.push({url:response.url(),status:response.status(),cacheControl:response.headers()['cache-control']});
  });
  await page.goto(origin+'/__owned-catalog');
  await page.evaluate(async()=>{const {mountPublicCatalog}=await import('/src/player/playerpublic.js');window.__public=mountPublicCatalog(document.body);});
  const select=page.getByRole('combobox',{name:'選擇遊戲'}),notice=page.locator('.player-catalog-notice'),dialog=page.getByRole('dialog',{name:'發布資訊'});
  const more=dialog.getByRole('button',{name:'載入更多',exact:true}),retry=dialog.getByRole('button',{name:'重試',exact:true});
  await page.waitForFunction(()=>document.querySelector('select')?.options.length===2);
  assert.equal(await select.inputValue(),'wolong-builtin');assert.match(await notice.textContent(),/公開快照39/);checks++;
  await select.selectOption(OTHER_GAME);await notice.click();
  await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
  assert.equal(await more.isVisible(),true);assert.equal(await page.evaluate(()=>window.__public.view.selection()),null);checks++;
  await more.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===41);
  const historyRows=await dialog.locator('tr').evaluateAll(rows=>rows.slice(1).map(row=>[...row.cells].map(cell=>cell.textContent)));
  assert.equal(new Set(historyRows.map(row=>row[1])).size,40);
  assert.ok(historyRows.every((row,i)=>!i||historyRows[i-1][4]>row[4]||historyRows[i-1][4]===row[4]&&historyRows[i-1][1]>row[1]));
  assert.equal(await more.isVisible(),false);checks++;
  await retry.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
  await commit({...unlisted(),gameStates:[{gameId:GAME,listed:false,deleted:true},{gameId:OTHER_GAME,listed:false,currentRelease:{releaseId:catalog.directory[0].releaseId,ordinal:'1.39'}}]});
  await more.click();await page.waitForFunction(()=>document.querySelector('[role=dialog] div')?.textContent==='暫無發布資訊');
  assert.equal(await select.locator('option').count(),1);assert.equal(await more.isVisible(),false);
  await dialog.click({button:'right'});assert.equal((await page.evaluate(()=>window.__public.view.selection())).kind,'builtin');checks++;
  await commit(catalog);await notice.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
  // An intervening root generation must restart, not append the stale next page.
  await commit(catalog);const changedRoot=parse((await r2.get('control/current.json')).bytes);
  await more.click();await page.waitForFunction(()=>!document.querySelector('[role=dialog] button').disabled);
  assert.equal(await dialog.locator('tr').count(),31);assert.equal(await more.isVisible(),true);checks++;
  await more.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===41);
  assert.deepEqual(await dialog.locator('tr').evaluateAll(rows=>rows.slice(1).map(row=>[...row.cells].map(cell=>cell.textContent))),historyRows);checks++;
  await dialog.locator('td').first().click();await dialog.click({button:'right'});
  assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>window.__idb),0);
  assert.equal(requests.length,8);assert.equal(responses.length,requests.length);
  assert.ok(responses.every(row=>row.status===200&&row.cacheControl==='no-store'));
  const cursors=requests.map(row=>JSON.parse(new URLSearchParams(row.search).get('cursor')));
  assert.equal(cursors[2].generation,cursors[4].generation);
  assert.ok(cursors[6].generation<changedRoot.generation);
  assert.equal(cursors[7].generation,changedRoot.generation);assert.equal(cursors[7].digest,changedRoot.digest);
  assert.ok(requests.every(row=>new URLSearchParams(row.search).get('announcementPage')==='1'&&!row.headers.authorization&&!row.headers.cookie&&!row.headers.referer));
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(forbidden,[]);assert.equal(outbound,0);checks++;
  const paths=['reader/worker.js','reader/firstonline.js','web/src/player/playerpublic.js','web/src/player/playercatalog.js','web/src/player/playerclient.js','tools/verify_player_client_workerd.mjs','tools/fixtures/publication.mjs'];
  writeFileSync(join(artifact,'result.json'),JSON.stringify({checks,scope:'Actual public wrapper/native HTTPS fetch -> workerd reader -> owned R2, v1 opaque transport history. Static HTML/modules routed only; no API response mocks, App/author/compiler/cloud or save proof.',origin,requests,responses,changedRoot,historyRows,errors,failed,forbidden,idbOpens:0,sources:Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))},null,2));
  await page.evaluate(()=>window.__public.close());
 }
 process.stdout.write(JSON.stringify({checks,admissions,files,outbound,artifact,scope:catalogBrowser?'Owned HTTPS public catalog/workerd/R2 plus Node client; opaque fixtures, no App/save/production proof':'Real owned workerd/R2; client runs in Node, opaque fixtures, no engine/browser/save proof'})+'\n');
}catch(error){if(artifact)writeFileSync(join(artifact,'failure.txt'),String(error.stack));throw error;}
finally{await browser?.close();await staticServer?.close();await mf?.dispose();rmSync(own,{recursive:true,force:true});}
