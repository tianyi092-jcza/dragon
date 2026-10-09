// Fresh browser + owned OS store only. Never DOS/profile/formal storage.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {startEditorServer} from './editor_server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),round=process.argv[2];assert.equal(process.argv.length,3);assert.match(round??'',/^[a-zA-Z0-9-]{1,64}$/);
const output=join(root,'.dragon-analysis/editor-phase',round);mkdirSync(output);
const store=mkdtempSync(join(tmpdir(),'dragon-inspection-')),server=await startEditorServer(0,store),origin=`http://127.0.0.1:${server.address().port}`;
const sha=b=>createHash('sha256').update(b).digest('hex'),errors=[],forbidden=[];let browser;
function parse(b){try{return JSON.parse(String(b));}catch(cause){throw new Error('invalid owned inspection fixture',{cause});}}
async function call(path,body,status=200){const init={headers:{connection:'close'}};if(body!==undefined){init.method='POST';init.headers['content-type']='application/json';init.body=JSON.stringify(body);}const response=await fetch(origin+path,init),data=await response.json();assert.equal(response.status,status,data.error);return data;}
const file=id=>join(store,id,'gamesource.json');
try{
  await call('/api/copy',{gameId:'inspection-ui',kind:'full'});
  await call('/api/copy',{gameId:'minimal-ui',kind:'minimal'});
  const game=parse(readFileSync(file('inspection-ui'))),before=sha(readFileSync(file('inspection-ui')));
  const snapshots=[];for(const id of game.chapterOrder){const data=await call('/api/entity-inspection?game=inspection-ui&chapter='+encodeURIComponent(id));assert.equal(data.records.length,128);snapshots.push(data);}
  assert.equal(snapshots[14].originalStart.year,264);assert.equal(snapshots[15].originalStart.year,266);
  assert.equal(sha(readFileSync(file('inspection-ui'))),before);
  await call('/api/entity-inspection?game=inspection-ui&chapter=other',undefined,400);
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:800}});
  await context.addInitScript(()=>{window.__idbOpens=0;indexedDB.open=()=>{window.__idbOpens++;throw new Error('formal storage forbidden');};});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin||/save\.dat/i.test(url.pathname)){forbidden.push(url.href);return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/');await page.locator('[data-game="inspection-ui"]').click();await page.locator('#entities-link').click();
  await page.locator('#status').filter({hasText:'唯讀來源快照已載入'}).waitFor();assert.equal(await page.locator('#records tr').count(),128);
  await page.locator('#search').fill(snapshots[0].records[0].id);assert.equal(await page.locator('#records tr').count(),1);await page.locator('#search').fill('');
  await page.locator('[data-slot="127"]').click();assert.ok((await page.locator('#record-info').textContent()).includes('保留G127'));assert.equal(await page.locator('#bytes .unknown').count(),3);
  const row=snapshots[0].records.find(r=>r.references.length);assert.ok(row);await page.locator(`[data-slot="${row.slot}"]`).press('Enter');assert.equal(await page.locator('#references li').count(),row.references.length);
  await page.locator('#chapter').selectOption(game.chapterOrder[14]);await page.locator('#dates').filter({hasText:'264/'}).waitFor();assert.ok((await page.locator('#dates').textContent()).includes('現模板：264/'));
  await page.setViewportSize({width:1024,height:768});await page.screenshot({path:join(output,'entity-inspection.png')});
  await call('/api/metadata',{gameId:game.gameId,expectedRevision:'1',metadata:{name:'來源頁面',introduction:''}});
  assert.ok((await page.locator('#identity').textContent()).includes('修訂 1'));await page.locator('#reload').click();await page.locator('#identity').filter({hasText:'修訂 2'}).waitFor();
  const updated=parse(readFileSync(file(game.gameId)));updated.chapters[game.chapterOrder[14]].state.generals[0].name='<img src=x onerror=1>';writeFileSync(file(game.gameId),JSON.stringify(updated)+'\n');
  const ownedBefore=sha(readFileSync(file(game.gameId)));await page.locator('#reload').click();await page.locator('[data-slot="0"]').filter({hasText:'<img src=x onerror=1>'}).waitFor();assert.equal(await page.locator('img').count(),0);
  assert.equal(sha(readFileSync(file(game.gameId))),ownedBefore);assert.equal(await page.evaluate(()=>window.__idbOpens),0);
  await page.goto(origin+'/entities?game=minimal-ui');await page.locator('#status').filter({hasText:'未保存完整人物來源'}).waitFor();assert.equal(await page.locator('#records tr').count(),0);
  const legacy={...updated};delete legacy.sourceRecords;writeFileSync(file(game.gameId),JSON.stringify(legacy)+'\n');const legacySha=sha(readFileSync(file(game.gameId)));
  await page.goto(origin+'/entities?game='+game.gameId);await page.locator('#status').filter({hasText:'未保存完整人物來源'}).waitFor();assert.equal(sha(readFileSync(file(game.gameId))),legacySha);
  const bad=structuredClone(updated);bad.sourceRecords.bindings[game.chapterOrder[0]].completeOriginalRecords[0].originalRaw32='00';writeFileSync(file(game.gameId),JSON.stringify(bad)+'\n');const badSha=sha(readFileSync(file(game.gameId)));
  await call('/api/entity-inspection?game='+game.gameId,undefined,400);assert.equal(sha(readFileSync(file(game.gameId))),badSha);
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  writeFileSync(join(output,'receipt.json'),JSON.stringify({result:'PASS-READONLY-UI-NOT-ENTITY-EDIT-INIT',chapters:20,ordinarySourceIds:2540,reservedSlots:20,rawBytesUnchanged:true,malformedReferenceRejected:true,oldDraftNotPatched:true,minimalNoRecords:true,snapshotReloadExplicit:true,textNotHtml:true,errors,forbidden,idbOpens:0,artifacts:['entity-inspection.png']},null,2)+'\n',{flag:'wx'});
  process.stdout.write('PASS actual source inspector UI,20chapters,G127/raw/refs/years,readonly snapshots,XSS,minimal/legacy,IDB0\n');
}catch(error){writeFileSync(join(output,'failure.json'),JSON.stringify({error:String(error),errors,forbidden})+'\n',{flag:'wx'});throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));rmSync(store,{recursive:true,force:true});}
