// Actual DOM + player reader, controlled registry responses, fresh profile.
// No App/admission, stored data, navigation, remote socket or production UI
// claim. One explicit local-inspection click exercises the denied-IDB path.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {startBrowserTestServer} from './browser_test_server.mjs';
import {assertCompletedStreamObservation} from './fixtures/player-client-browser.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sha=b=>createHash('sha256').update(b).digest('hex');
const parent='.dragon-analysis/release-readiness';await mkdir(parent,{recursive:true});const artifact=await mkdtemp(join(parent,'player-catalog-browser-'));
const server=await startBrowserTestServer(),origin=`http://127.0.0.1:${server.port}`,api='https://reader.owned.invalid';
const game='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',release='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const row={gameId:game,releaseId:release,ordinal:'1.39',revision:'1',sourceDigest:'a'.repeat(64),name:'<img src=x>自建',publishedAt:'2037-01-01T00:00:00Z',chapters:[game+'#chapter']};
const history=Array.from({length:40},(_,i)=>({gameId:game,ordinal:'1.'+(39-i),name:row.name,creatorAccount:'<script>owner</script>',publishedAt:new Date(Date.UTC(2037,0,40-i)).toISOString(),firstOnlineAt:new Date(Date.UTC(2037,1,40-i)).toISOString()}));
const payload=()=>({generation:1,digest:'c'.repeat(64),directory:[row],announcements:history});
let response=payload(),hold=false,browser;const waiters=[],calls=[],errors=[],failed=[],forbidden=[];let checks=0;
function releaseAll(){hold=false;for(const release of waiters.splice(0))release();}
async function held(){for(let i=0;i<300;i++){if(waiters.length)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('owned response did not reach hold');}
try{
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)));
 browser=await chromium.launch({headless:true,env});const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await context.addInitScript(()=>{window.__idb=0;indexedDB.open=()=>{window.__idb++;throw new Error('storage forbidden');};});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.origin===api&&u.pathname==='/play-api/v1/registry'&&request.method()==='GET'){
   const headers=await request.allHeaders();
   assert.equal(u.searchParams.get('announcementPage'),'1');
   let selected=response;
   if(Array.isArray(response.announcements)){
    const cursor=u.searchParams.get('cursor'),reset=cursor!==null&&cursor!==`owned-page-${response.generation}`;
    const visible=response.announcements.filter(item=>response.directory.some(entry=>entry.gameId===item.gameId));
    const offset=cursor&&!reset?30:0;
    selected={...response,announcements:visible.slice(offset,offset+30).map(item=>({...item,announcementId:`${item.gameId}:${item.ordinal}`})),announcementPage:{reset,nextCursor:visible.length>offset+30?`owned-page-${response.generation}`:null}};
   }
   const body=JSON.stringify(selected);
   const sequence=/^application\/json;owned-sequence=([1-9][0-9]*)$/.exec(headers.accept??'')?.[1];
   calls.push({origin:api,path:u.pathname,search:u.search,method:request.method(),headers,sequence,status:200,bytes:Buffer.byteLength(body)});
   if(hold)await new Promise(resolve=>waiters.push(resolve));
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','cache-control':'no-store'},body});
  }
  if(u.origin!==origin||/save\.dat|\/api\/|\/play-api\//i.test(u.pathname)){forbidden.push(u.pathname);return route.abort();}
  if(u.pathname==='/__owned-catalog')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body><main id="catalog" style="width:420px"></main><p id="outside">原界面</p></body></html>'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});page.on('requestfailed',r=>failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText,sequence:/^application\/json;owned-sequence=([1-9][0-9]*)$/.exec(r.headers().accept??'')?.[1]}));
 await page.goto(origin+'/__owned-catalog');
 await page.evaluate(async api=>{
  const {mountPlayerCatalog}=await import('/src/player/playercatalog.js');const {createPlayerReader}=await import('/src/player/playerclient.js');
  const traces=window.__catalogTraces=[];
  const transport=async(url,options)=>{
   const sequence=String(traces.length+1),trace={sequence,completed:false,cancelled:false,bytes:0,status:null};traces.push(trace);
   // A CORS-safelisted header associates this exact native stream, without a
   // query change, extra request, body substitution or ignored failure event.
   const response=await fetch(url,{...options,headers:{...options.headers,Accept:'application/json;owned-sequence='+sequence}});
   trace.status=response.status;const body=response.body,getReader=body.getReader.bind(body);
   Object.defineProperty(body,'getReader',{value(){const reader=getReader();return{
    async read(){const row=await reader.read();if(row.done)trace.completed=true;else trace.bytes+=row.value.byteLength;return row;},
    cancel(){trace.cancelled=true;return reader.cancel();},releaseLock(){return reader.releaseLock();},
   };}});return response;
  };
  window.__catalog=mountPlayerCatalog({root:document.querySelector('#catalog'),reader:createPlayerReader({origin:api,fetch:transport})});
 },api);
 const selection=()=>page.evaluate(()=>window.__catalog.selection());
 assert.equal((await selection()).kind,'builtin');assert.equal(calls.length,0);checks++;
 assert.equal(await page.evaluate(()=>window.__catalog.refresh()),true);
 const select=page.getByRole('combobox',{name:'選擇遊戲'}),notice=page.locator('.player-catalog-notice');
 assert.equal(await page.getByRole('combobox').count(),1);
 assert.equal(await select.locator('option').first().textContent(),'卧龙传·三国制霸之计（内置）');
 assert.equal(await select.locator('option').nth(1).textContent(),row.name+'（自建） 1.39');
 assert.equal(await select.inputValue(),'wolong-builtin');
 assert.equal(await select.locator('option').count(),2);await select.selectOption(game);
 assert.equal((await selection()).releaseId,release);assert.equal((await selection()).ordinal,'1.39');checks++;
 const second={...row,gameId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'第二個遊戲',chapters:['cccccccc-cccc-4ccc-8ccc-cccccccccccc#chapter']};
 response={...payload(),directory:[row,second]};await page.evaluate(()=>window.__catalog.refresh());
 assert.equal(await page.getByRole('combobox').count(),1);assert.equal(await select.locator('option').count(),3);
 assert.equal((await selection()).gameId,game);await select.selectOption(second.gameId);
 assert.equal((await selection()).gameId,second.gameId);
 response=payload();await page.evaluate(()=>window.__catalog.refresh());
 assert.equal(await select.locator('option').count(),2);assert.equal((await selection()).kind,'builtin');
 await select.selectOption(game);checks++;
 assert.match(await notice.textContent(),/<img src=x>自建 1.39/);assert.equal(await page.locator('img,script').count(),0);checks++;
 const before=calls.length;await notice.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
 assert.equal(calls.length,before+1);assert.equal(await selection(),null);assert.equal(await select.isDisabled(),true);checks++;
 const dialog=page.getByRole('dialog',{name:'發布資訊'});
 assert.equal(await dialog.locator('td').count(),150);assert.ok((await dialog.textContent()).includes(history[0].publishedAt));assert.equal(await dialog.locator('button').count(),2);assert.equal(await dialog.locator('img,script,a').count(),0);checks++;
 const more=dialog.getByRole('button',{name:'載入更多',exact:true});
 await more.focus();await page.keyboard.press('Tab');assert.equal(await dialog.getByRole('button',{name:'重試',exact:true}).evaluate(node=>node===document.activeElement),true);
 await more.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===41);
 assert.equal(await dialog.locator('td').count(),200);assert.ok((await dialog.textContent()).includes(history[39].firstOnlineAt));assert.equal(await more.isVisible(),false);assert.equal(new URLSearchParams(calls.at(-1).search).get('cursor'),'owned-page-1');checks++;
 const scroll=dialog.locator('div');assert.equal(await scroll.evaluate(node=>node.scrollHeight>node.clientHeight),true);await scroll.hover();await page.mouse.wheel(0,500);await page.waitForFunction(()=>document.querySelector('[role=dialog] div').scrollTop>0);checks++;
 await dialog.locator('td').first().click();await page.waitForTimeout(3250);assert.equal(await dialog.count(),1);assert.equal(await selection(),null);assert.equal(calls.length,before+2);checks++;
 await dialog.click({button:'right'});assert.equal(await dialog.count(),0);assert.equal((await selection()).gameId,game);assert.equal(await select.isDisabled(),false);checks++;
 response={...payload(),announcementsError:'ANNOUNCEMENTS_UNAVAILABLE'};await page.evaluate(()=>window.__catalog.refresh());
 assert.equal(await select.locator('option').count(),2);assert.equal((await selection()).gameId,game);assert.equal(await notice.textContent(),'通知暫不可用');checks++;
 response={...payload(),directory:[],announcements:history};await page.evaluate(()=>window.__catalog.refresh());
 assert.equal(await select.locator('option').count(),1);assert.equal((await selection()).kind,'builtin');assert.equal(await notice.textContent(),'暫無發布資訊');checks++;
 response={generation:'invalid'};assert.equal(await page.evaluate(()=>window.__catalog.refresh()),false);
 assert.equal(await page.getByRole('status').count(),0);assert.equal((await selection()).kind,'builtin');assert.equal(await notice.textContent(),'通知暫不可用');checks++;
 await notice.click();await page.waitForFunction(()=>document.querySelector('[role=dialog] p').textContent==='通知暫不可用');
 response=payload();await dialog.getByRole('button',{name:'重試',exact:true}).click();await page.waitForFunction(()=>document.querySelector('select').options.length===2);
 await dialog.click({button:'right'});checks++;
 await select.selectOption(game);hold=true;await page.evaluate(()=>{window.__pending=window.__catalog.refresh();});await page.waitForFunction(()=>document.querySelector('select').options.length===1);
 assert.equal((await selection()).kind,'builtin');assert.equal(await select.isDisabled(),false);await held();checks++;
 // A later empty directory wins over the earlier held result.
 hold=false;response={...payload(),generation:2,directory:[],announcements:[]};await page.evaluate(()=>window.__catalog.refresh());releaseAll();await page.evaluate(()=>window.__pending);
 assert.equal(await select.locator('option').count(),1);assert.equal((await selection()).kind,'builtin');checks++;
 response=payload();await page.evaluate(()=>window.__catalog.refresh());await select.selectOption(game);hold=true;await notice.click();await page.waitForFunction(()=>!!document.querySelector('[role=dialog]'));
 await held();await dialog.click({button:'right'});releaseAll();await page.waitForFunction(()=>document.querySelector('select').options.length===2);
 assert.equal(await dialog.count(),0);assert.equal((await selection()).gameId,game);checks++;
 await notice.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
 // A directory generation change replaces the accumulated history, never mixes pages.
 response={...payload(),generation:2,announcements:history.slice(35)};
 await more.click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===6);
 assert.equal(await more.isVisible(),false);assert.ok(!(await dialog.textContent()).includes(history[0].firstOnlineAt));checks++;
 // A failed later page keeps the valid directory but clears stale announcements.
 response=payload();await dialog.getByRole('button',{name:'重試',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
 response={...payload(),announcementsError:'ANNOUNCEMENTS_UNAVAILABLE'};await more.click();await page.waitForFunction(()=>document.querySelector('[role=dialog] div').textContent==='通知暫不可用');
 assert.equal(await select.locator('option').count(),2);assert.equal(await more.isVisible(),false);checks++;
 response=payload();await dialog.getByRole('button',{name:'重試',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog] tr').length===31);
 await page.screenshot({path:join(artifact,'history.png')});
 hold=true;await page.evaluate(()=>{window.__last=window.__catalog.refresh();window.__catalog.close();});releaseAll();assert.equal(await page.evaluate(()=>window.__last),false);
 assert.equal(await page.locator('.player-catalog,[role=dialog]').count(),0);assert.equal(await selection(),null);assert.equal(await page.locator('#outside').textContent(),'原界面');checks++;
 // Actual public wrapper: transparent heading, one centered selector and an
 // explicit local-inspection entry; merely mounting never opens IndexedDB.
 await page.evaluate(async()=>{const {mountPublicCatalog}=await import('/src/player/playerpublic.js');window.__public=mountPublicCatalog(document.body);});
 const layout=await page.locator('.player-public-catalog').evaluate(node=>{
  const host=node.querySelector('.player-catalog'),label=host.querySelector('button'),select=host.querySelector('select');
  const box=node.getBoundingClientRect(),a=label.getBoundingClientRect(),b=select.getBoundingClientRect();
  return {background:getComputedStyle(node).backgroundColor,padding:getComputedStyle(node).padding,border:getComputedStyle(node).borderWidth,
   labelBackground:getComputedStyle(label).backgroundColor,labelBorder:getComputedStyle(label).borderWidth,
   children:host.children.length,width:b.width/box.width,center:b.x+b.width/2-innerWidth/2,gap:b.y-a.bottom,heights:[a.height,b.height]};
 });
 assert.deepEqual(layout,{background:'rgba(0, 0, 0, 0)',padding:'0px',border:'0px',labelBackground:'rgba(0, 0, 0, 0)',labelBorder:'0px',children:3,width:0.7,center:0,gap:12,heights:[28,28]});
 assert.equal(await page.getByRole('button',{name:'重試',exact:true}).count(),0);
 await page.screenshot({path:join(artifact,'catalog.png')});checks++;
 assert.equal(await page.evaluate(()=>window.__idb),0,'mount and remote failure must not inspect local storage');
 const localEntry=page.getByRole('button',{name:'不可用存檔管理',exact:true});await localEntry.click();
 const localPanel=page.getByRole('dialog',{name:'不可用存檔管理',exact:true});
 await page.waitForFunction(()=>document.querySelector('[aria-label="不可用存檔管理"]')?.textContent.includes('不能判定為沒有存檔'));
 assert.equal(await page.evaluate(()=>window.__idb),1,'explicit click reaches the real public-wrapper read-only port');
 assert.equal(await page.evaluate(()=>window.__public.view.selection()),null);
 await localPanel.click({button:'right'});assert.equal(await localPanel.count(),0);
 await page.evaluate(()=>window.__public.close());checks++;
 await page.evaluate(async()=>{const {mountPublicCatalog}=await import('/src/player/playerpublic.js');window.__formalCatalog=mountPublicCatalog(document.body,{selectionVisible:false});});
 assert.equal(await page.getByRole('button',{name:'不可用存檔管理',exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>window.__idb),1);await page.evaluate(()=>window.__formalCatalog.close());checks++;
 await page.waitForFunction(()=>window.__catalogTraces.every(trace=>trace.completed));
 const traces=await page.evaluate(()=>window.__catalogTraces),completedStreamFailures=[];
 assert.equal(traces.length,calls.length);assert.ok(traces.every(trace=>trace.completed&&!trace.cancelled&&trace.bytes>0));
 for(const event of failed){assert.ok(!completedStreamFailures.some(row=>row.sequence===event.sequence));completedStreamFailures.push(assertCompletedStreamObservation(event,traces,calls,api));}
 assert.equal(await page.evaluate(()=>window.__idb),1);assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 assert.ok(calls.every(call=>!call.headers.authorization&&!call.headers.cookie&&!call.headers.referer&&call.method==='GET'));checks++;
 const paths=['web/src/core/gamesavecatalogs.js','web/src/player/playercatalog.js','web/src/player/playerpublic.js','web/src/player/playerclient.js','web/src/player/runtimecontract.js','tools/verify_player_catalog_browser.mjs'];
 const sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(p))])));
 await writeFile(join(artifact,'result.json'),JSON.stringify({checks,sources,calls:calls.map(({origin,path,search,method,sequence,status,bytes})=>({origin,path,search,method,sequence,status,bytes})),traces,completedStreamFailures,errors,failed,forbidden,screenshotSHA:sha(await readFile(join(artifact,'history.png'))),scope:'Actual DOM/catalog + real reader with controlled registry responses. No title/App mount, admission, stored data, recognized old releases, cloud or deploy.'},null,2));
 process.stdout.write(JSON.stringify({checks,artifact})+'\n');
}catch(error){await writeFile(join(artifact,'failure.json'),JSON.stringify({error:String(error),errors,failed,forbidden},null,2));throw error;}
finally{releaseAll();await browser?.close();await server.close();}
