// Fresh owned profile/native IDB. Controlled reader, real complete Web snapshots.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {startBrowserTestServer} from './browser_test_server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const largeOrdinal=process.argv.includes('--large-ordinal');
const alternateFaction=process.argv.includes('--alternate-faction');
assert.ok(process.argv.slice(2).every(arg=>['--large-ordinal','--alternate-faction'].includes(arg)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const parent='.dragon-analysis/release-readiness';await mkdir(parent,{recursive:true});const artifact=await mkdtemp(join(parent,'player-restore-browser-'));
const server=await startBrowserTestServer();let browser;const errors=[],failed=[],forbidden=[],sources={};let checks=0;
try{
 const origin=`http://127.0.0.1:${server.port}`,files=new Map();
 for(const name of ['player-restore-browser.mjs','formal-app-browser.mjs']){const path='tools/fixtures/'+name,body=await readFile(path);files.set('/__owned-fixtures/'+name,body);sources[path]=sha(body);}
 let html=await readFile('web/index.html','utf8');sources['web/index.html']=sha(html);
 const anchor='<script type="module" src="src/boot.js"></script>';assert.equal(html.split(anchor).length,2);
 html=html.replace(anchor,'<script type="module" src="/__owned-fixtures/player-restore-browser.mjs"></script>');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await context.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);window.__ownedDatabases=[];indexedDB.open=(name,...args)=>{if(name!=='owned-formal-app')throw new Error('non-owned IDB forbidden');window.__ownedDatabases.push(name);return open(name,...args);};});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==origin||/\/api\/|save\.dat|\.dragon-runtime|\/reader\/|\/web\/src\//i.test(u.pathname)){forbidden.push(u.origin===origin?u.pathname:'outside');return route.abort();}
  if(u.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:html});
  if(u.pathname==='/__owned-store-peer')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Owned save peer</title>'});
  if(files.has(u.pathname))return route.fulfill({contentType:'text/javascript',body:files.get(u.pathname)});
  return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(90000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});
 page.on('requestfailed',r=>failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
 const query=new URLSearchParams();if(largeOrdinal)query.set('large','1');if(alternateFaction)query.set('alternate-faction','1');
 await page.goto(origin+'/index.html?'+query);await page.waitForFunction(()=>window.__restore?.ready);
 const factionIdentity=await page.evaluate(async()=>{const c=window.__ownedFormal;return{selected:c.environment.player,first:c.environment.content.chapter(0).template.factions[0].idx,saved:(await c.store.get(0)).record.snapshot.state.player_faction};});
 assert.equal(factionIdentity.selected,factionIdentity.saved);
 assert.equal(factionIdentity.selected!==factionIdentity.first,alternateFaction);
 const root=page.locator('.player-restore'),row=page.locator('[data-save-slot="0"]');
 async function mount(){await page.evaluate(()=>window.__restore.mount());await root.getByRole('button',{name:'重新檢查',exact:true}).waitFor();}
 async function reset(){await page.evaluate(()=>window.__restore.reset());}
 const invalid=await page.evaluate(()=>{const before=window.__ownedDatabases.length;return{count:window.__restore.bad(),unchanged:window.__ownedDatabases.length===before,dialogs:document.querySelectorAll('.player-restore').length};});
 assert.deepEqual(invalid,{count:7,unchanged:true,dialogs:0});checks++;
 await page.evaluate(()=>window.__restore.seed(10,{releaseId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}));
 if(largeOrdinal){
  await page.evaluate(()=>window.__restore.seed(11,{releaseOrdinal:'9007199254740992'}));
 }
 const before=await page.evaluate(()=>window.__restore.before());await mount();
 if(largeOrdinal){
  assert.equal(before.find(row=>row.slot===0).releaseOrdinal,'9007199254740993');
  assert.equal(await page.locator('[data-unavailable-slot="11"]').count(),1);
  assert.equal(await page.evaluate(()=>window.__restore.gets.includes(11)),false);checks++;
 }
 assert.equal(await row.count(),1);assert.equal(await page.locator('[data-unavailable-slot="10"]').count(),1);
 assert.equal(await row.locator('img').count(),0);assert.match(await row.textContent(),/<img src=x/);
 assert.equal(await page.evaluate(()=>window.__restore.gets.includes(10)),false);checks++;
 await page.locator('[data-unavailable-slot="10"]').hover();await page.locator('[data-unavailable-slot="10"]').click();
 assert.equal(await page.evaluate(()=>window.__restore.settled||window.__restore.gets.includes(10)),false);assert.deepEqual(await page.evaluate(()=>window.__restore.before()),before);checks++;
 await root.getByRole('button',{name:'不可用存檔說明',exact:true}).click();assert.match(await root.textContent(),/將保留且不載入/);
 assert.equal(await root.locator('[data-save-slot]').count(),0);await root.click({button:'right'});
 assert.equal(await row.count(),1);assert.deepEqual(await page.evaluate(()=>window.__restore.before()),before);checks++;
 await page.screenshot({path:join(artifact,'choices.png')});
 await row.click();await page.waitForFunction(()=>window.__restore.settled);
 const transferred=await page.evaluate(async()=>{const c=window.__restore,v=c.chosen;c.view.close();const snapshot=await v.saveRepository.load();let consumed=false;try{await v.saveRepository.load();}catch{consumed=true;}return{slot:v.savedSlot,player:v.environment.player,label:snapshot.slots.find(r=>r.slot===0).label,active:v.session.state(),consumed,unchanged:await c.before()};});
 assert.equal(transferred.player,factionIdentity.selected);
 assert.equal(transferred.slot,0);assert.equal(transferred.label,'<img src=x onerror=alert(1)>');assert.equal(transferred.active,'active');assert.equal(transferred.consumed,true);assert.deepEqual(transferred.unchanged,before);checks++;
 await reset();await page.evaluate(()=>window.__restore.seed(4));await mount();await page.locator('[data-save-slot="4"]').click();await page.waitForFunction(()=>window.__restore.settled);
 const nonfirst=await page.evaluate(async()=>{const v=window.__restore.chosen;return{slot:v.savedSlot,slots:(await v.saveRepository.load()).slots.filter(s=>s.played).map(s=>s.slot)};});
 assert.deepEqual(nonfirst,{slot:4,slots:[0,4]});checks++;
 await reset();await mount();await page.evaluate(()=>window.__restore.seed());const replaced=await page.evaluate(()=>window.__restore.before());await row.click();
 await root.getByRole('button',{name:'重試',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__restore.settled),false);assert.deepEqual(await page.evaluate(()=>window.__restore.before()),replaced);checks++;
 await reset();await page.evaluate(()=>window.__restore.seed(1,{snapshot:{slot:1,played:true,scenario_idx:0,state:{player_faction:0}}}));await mount();
 assert.equal(await page.locator('[data-save-slot]').count(),0);assert.equal(await page.locator('[data-unavailable-slot]').count(),2);checks++;
 await reset();await page.evaluate(()=>{window.__restore.staticFailure=true;});const staticBefore=await page.evaluate(()=>window.__restore.before());await mount();
 assert.equal(await row.count(),0);assert.deepEqual(await page.evaluate(()=>window.__restore.before()),staticBefore);
 await page.evaluate(()=>{window.__restore.staticFailure=false;});await root.getByRole('button',{name:'重新檢查',exact:true}).click();await row.waitFor();checks++;
 await reset();await page.evaluate(()=>window.__restore.empty());await mount();assert.match(await root.textContent(),/目前沒有本機存檔/);assert.equal(await row.count(),0);checks++;
 await reset();await page.evaluate(()=>{const c=window.__restore;c.hold=true;c.mount();});await page.waitForFunction(()=>!!window.__restore.release);
 const readsBeforeCancel=await page.evaluate(()=>window.__ownedDatabases.length);await root.click({button:'right'});await page.evaluate(()=>{window.__restore.hold=false;window.__restore.release();});
 await page.waitForFunction(()=>window.__restore.settled&&window.__restore.sessions.every(s=>s.state()==='closed'));
 assert.equal(await page.evaluate(()=>window.__ownedDatabases.length),readsBeforeCancel);assert.equal(await root.count(),0);checks++;
 await reset();await mount();await page.evaluate(()=>{window.__restore.hold=true;});await row.click();await page.waitForFunction(()=>!!window.__restore.release);
 await root.click({button:'right'});await page.evaluate(()=>{window.__restore.hold=false;window.__restore.release();});
 await row.waitFor();await page.waitForFunction(()=>window.__restore.sessions.every(s=>s.state()==='closed'));assert.equal(await page.evaluate(()=>window.__restore.settled),false);checks++;
 await page.evaluate(()=>{window.__restore.changed=true;});await row.click();await root.getByRole('button',{name:'重試',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__restore.chosen),null);checks++;
 await reset();await mount();await page.evaluate(()=>{window.__restore.holdGet=true;});await row.click();await page.waitForFunction(()=>!!window.__restore.releaseGet);
 await root.click({button:'right'});await page.evaluate(()=>{window.__restore.holdGet=false;window.__restore.releaseGet();});await row.waitFor();
 await page.waitForFunction(()=>window.__restore.sessions.every(s=>s.state()==='closed'));assert.equal(await page.evaluate(()=>window.__restore.settled),false);checks++;
 await reset();await mount();await root.focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'重新檢查');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.saveSlot),'0');checks++;
 await root.click({button:'right'});await page.waitForFunction(()=>window.__restore.settled);assert.equal(await page.evaluate(()=>window.__restore.chosen),null);checks++;
 // Pause after the chooser captured the old token, then change the same
 // native-IDB slot from an independent page before its compare-delete.
 const peer=await context.newPage();
 peer.on('pageerror',e=>errors.push(String(e)));
 peer.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});
 peer.on('requestfailed',r=>failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
 await peer.goto(origin+'/__owned-store-peer');
 for(const recreate of [false,true]){
  await reset();await page.evaluate(()=>{const c=window.__restore;c.advance();c.holdStatus=true;c.mount();});
  await page.waitForFunction(()=>!!window.__restore.releaseStatus);
  const gameId=await page.evaluate(()=>window.__ownedFormal.store.gameId);
  const replaced=await peer.evaluate(async({gameId,recreate})=>{
   const {createGameSaveStore}=await import('/src/core/gamesavestore.js');
   const store=createGameSaveStore({gameId,databaseName:'owned-formal-app',getIndexedDB:()=>indexedDB});
   const prior=await store.get(0),input={...prior.record};
   delete input.format;delete input.recordId;delete input.writeRevision; // Store assigns these envelope fields.
   if(recreate)await store.compareDelete(prior.token);
   const next=await store.put({...input,snapshot:{...input.snapshot,label:'owned concurrent replacement'}},recreate?null:prior.token);
   return{prior:prior.token,next:next.token,record:next.record,catalog:await store.list()};
  },{gameId,recreate});
  assert.notEqual(replaced.next.bodyDigest,replaced.prior.bodyDigest);
  assert.equal(replaced.next.recordId===replaced.prior.recordId,!recreate);
  await page.evaluate(()=>{const c=window.__restore;c.holdStatus=false;c.releaseStatus();});
  await root.getByRole('button',{name:'重試',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__restore.settled),false);
  assert.match(await root.textContent(),/沒有刪除存檔/);
  assert.deepEqual(await page.evaluate(()=>window.__restore.before()),replaced.catalog);
  assert.deepEqual(await page.evaluate(()=>window.__ownedFormal.store.get(0)),{record:replaced.record,token:replaced.next});
  assert.equal(await page.locator('[data-save-slot]').count(),0);
  await root.click({button:'right'});await page.waitForFunction(()=>window.__restore.settled);
  assert.equal(await page.evaluate(()=>window.__restore.chosen),null);
  assert.deepEqual(await page.evaluate(()=>window.__restore.before()),replaced.catalog);checks++;
 }
 assert.ok(await peer.evaluate(()=>window.__ownedDatabases.every(name=>name==='owned-formal-app')));await peer.close();
 // B7 (user-approved): a deleted game is the reader's explicit 410 fact, never a
 // directory miss. The load-time notice must precede any local body read, cancel
 // must keep every save, and a confirmed deletion removes only verified slots.
 const rawSaves=({gameId,slot,rewriteCatalog})=>page.evaluate(async({gameId,slot,rewriteCatalog})=>{
  const {gameSaveKeys}=await import('/src/core/gamesavecodec.js');
  const keys=gameSaveKeys(gameId,slot);
  const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('owned-formal-app',1);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    // Either drop one body (catalog row survives, pair no longer verifiable) or
    // drop its summary (owned store returns to an empty catalog).
    if(rewriteCatalog)store.get(keys.catalog).onsuccess=event=>{const catalog=event.target.result;store.put({...catalog,rows:catalog.rows.filter(row=>row.slot!==slot)},keys.catalog);};
    else store.delete(keys.record);
   });
  }finally{db.close();}
 },{gameId,slot,rewriteCatalog});
 await reset();await page.evaluate(()=>{const c=window.__restore;c.deleted=true;c.mount();});
 const panelDeleted=page.locator('.player-game-deleted');
 await panelDeleted.waitFor();
 assert.match(await panelDeleted.textContent(),/該遊戲已刪除！/);
 assert.equal(await panelDeleted.getByRole('button').count(),1,'the panel notice offers exactly one control');
 assert.equal(await page.locator('[data-save-slot]').count(),0);
 assert.equal(await page.locator('[data-unavailable-slot]').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.__restore.gets),[]);
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0]);checks++;
 // 用户 m272：存档面板里的删除提示也是阻塞项，右键不关闭、不后退、不保留。
 await panelDeleted.click({button:'right'});
 await page.waitForTimeout(150);
 assert.equal(await panelDeleted.count(),1);
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0]);checks++;
 await panelDeleted.getByRole('button',{name:'確認',exact:true}).click();
 await page.waitForFunction(()=>window.__restore.settled);
 assert.equal(await page.evaluate(()=>window.__restore.chosen),null);
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),[]);
 assert.equal(await root.count(),0);checks++;
 // A body-less row is not a deletable proof: it is retained after the purge.
 await page.evaluate(()=>window.__restore.seed());
 await page.evaluate(()=>window.__restore.seed(2));
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0,2]);
 const ownedGame=await page.evaluate(()=>window.__ownedFormal.store.gameId);
 await rawSaves({gameId:ownedGame,slot:0,rewriteCatalog:false});
 await page.evaluate(()=>window.__restore.mount());
 await panelDeleted.getByRole('button',{name:'確認',exact:true}).click();
 await page.waitForFunction(()=>window.__restore.settled);
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0]);checks++;
 await rawSaves({gameId:ownedGame,slot:0,rewriteCatalog:true});
 // The standalone load-entry notice shares the same wording and blocking policy.
 await page.evaluate(()=>window.__restore.seed());
 await page.evaluate(()=>window.__restore.mountDeletedPrompt());
 const prompt=page.locator('#owned-deleted .player-game-deleted');
 await prompt.waitFor();
 assert.match(await prompt.textContent(),/該遊戲已刪除！/);
 assert.equal(await prompt.getByRole('button').count(),1,'the notice offers exactly one control');
 // 用户 m272：右键是阻塞项的一部分，不关闭、不后退、也不当作保留。
 await prompt.click({button:'right'});
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.player-game-deleted').count(),1);
 assert.equal(await page.evaluate(()=>window.__restore.promptExit),null);
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0]);checks++;
 // A failing catalog does not guess: the same confirmation stays the only control.
 await page.evaluate(()=>window.__restore.mountDeletedPrompt({listFailure:true}));
 await prompt.getByRole('button',{name:'確認',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.player-game-deleted')?.textContent.includes('本機進度尚未清除，請再確認一次。'));
 assert.deepEqual((await page.evaluate(()=>window.__restore.before())).map(value=>value.slot),[0]);
 assert.equal(await page.evaluate(()=>window.__restore.promptExit),null);checks++;
 await page.evaluate(()=>window.__restore.mountDeletedPrompt());
 await prompt.getByRole('button',{name:'確認',exact:true}).click();
 await page.waitForFunction(()=>window.__restore.promptExit!==null);
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),[]);
 assert.deepEqual(await page.evaluate(()=>window.__restore.promptExit),{deleted:1,kept:0});
 assert.equal(await page.locator('.player-game-deleted').count(),0,'the notice leaves only after the purge');checks++;
 await reset();await page.evaluate(()=>{window.__restore.advance();window.__restore.statusFailure=true;window.__restore.mount();});
 await root.getByRole('button',{name:'重試',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.__restore.before())).length,1);checks++;
 await page.evaluate(()=>{window.__restore.statusFailure=false;});await root.getByRole('button',{name:'重試',exact:true}).click();
 await root.getByRole('button',{name:'重新檢查',exact:true}).waitFor();assert.match(await root.textContent(),/舊版存檔不能載入，已自動清除1個/);
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),[]);assert.equal(await page.locator('[data-save-slot]').count(),0);checks++;
 // Actual backup controls, native file input/download and IDB; same controlled
 // reader as the restore cases, not a public HTTPS/bootstrap certificate.
 await reset();await page.evaluate(()=>window.__restore.mountBackup());
 const backup=page.locator('#owned-backup');
 await backup.getByRole('button',{name:'更新上架遊戲',exact:true}).click();
 await backup.getByRole('button',{name:'讀取章節',exact:true}).click();
 await backup.getByRole('button',{name:'讀取本機目錄',exact:true}).click();
 const exporting=backup.getByRole('button',{name:'匯出目前槽 JSON',exact:true});await exporting.waitFor();
 assert.equal(await backup.locator('img').count(),0);
 const backupBefore=await page.evaluate(()=>window.__ownedFormal.store.get(0));
 const downloading=page.waitForEvent('download');await exporting.click();const downloaded=await downloading;
 await downloaded.saveAs(join(artifact,'owned-backup.json'));const backupBytes=await readFile(join(artifact,'owned-backup.json'));
 assert.equal(JSON.parse(backupBytes.toString('utf8')).format,'wolong-game-save');
 assert.deepEqual(await page.evaluate(()=>window.__ownedFormal.store.get(0)),backupBefore);checks++;
 await backup.getByLabel('正式遊戲備份檔',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backupBytes});
 await backup.getByRole('button',{name:'驗證並另存新槽',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#owned-backup [role=status]').textContent.includes('匯入已提交為槽5'));
 const imported=await page.evaluate(()=>window.__ownedFormal.store.get(4));
 assert.deepEqual(imported.record.snapshot,{...backupBefore.record.snapshot,slot:4});assert.notEqual(imported.token.recordId,backupBefore.token.recordId);
 assert.deepEqual(await page.evaluate(()=>window.__ownedFormal.store.get(0)),backupBefore);checks++;
 // The backup preparation environment chooses the first chapter faction;
 // restoring the imported record must instead retain its saved player identity.
 await mount();await page.locator('[data-save-slot="4"]').click();await page.waitForFunction(()=>window.__restore.settled);
 const importedPlayer=await page.evaluate(async()=>{const c=window.__restore,v=c.chosen,snapshot=await v.saveRepository.load();const player=snapshot.slots.find(s=>s.slot===4).state.player_faction;const result={slot:v.savedSlot,player,environmentPlayer:v.environment.player};c.view.close();v.session.close();v.pack.close();c.chosen=null;return result;});
 assert.deepEqual(importedPlayer,{slot:4,player:factionIdentity.selected,environmentPlayer:factionIdentity.selected});
 assert.deepEqual(await page.evaluate(()=>window.__ownedFormal.store.get(4)),imported);
 assert.deepEqual(await page.evaluate(()=>window.__ownedFormal.store.get(0)),backupBefore);checks++;
 const importedCatalog=await page.evaluate(()=>window.__restore.before());
 await backup.getByLabel('正式遊戲備份檔',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await backup.getByRole('button',{name:'驗證並另存新槽',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#owned-backup [role=status]').textContent.includes('操作未完成'));
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),importedCatalog);checks++;
 await page.evaluate(()=>window.__restore.advance());
 await backup.getByLabel('正式遊戲備份檔',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backupBytes});
 await backup.getByRole('button',{name:'驗證並另存新槽',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#owned-backup input').disabled);
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),importedCatalog);checks++;
 await reset();
 await backup.getByRole('button',{name:'讀取本機目錄',exact:true}).click();await exporting.waitFor();
 await page.evaluate(()=>{window.__restore.hold=true;});await exporting.click();
 await page.waitForFunction(()=>typeof window.__restore.release==='function');
 const beforeClosing=await page.evaluate(()=>window.__restore.before());
 await page.evaluate(()=>{window.__restore.backup.close();window.__restore.release();});
 await page.waitForFunction(()=>window.__restore.sessions.every(session=>session.state()==='closed'));
 assert.deepEqual(await page.evaluate(()=>window.__restore.before()),beforeClosing);checks++;
 // The admission has captured the old identity but has not returned yet.
 // A new remote release must still be noticed by bound() after loading that
 // old pack, before local archive access, download or new-slot dispatch.
 for(const operation of ['export','import']){
  await reset();await page.evaluate(()=>window.__restore.mountBackup());
  await backup.getByRole('button',{name:'更新上架遊戲',exact:true}).click();
  await backup.getByRole('button',{name:'讀取章節',exact:true}).click();
  await backup.getByRole('button',{name:'讀取本機目錄',exact:true}).click();await exporting.waitFor();
  if(operation==='import')await backup.getByLabel('正式遊戲備份檔',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backupBytes});
  const retained=await page.evaluate(async()=>({catalog:await window.__restore.before(),save:await window.__ownedFormal.store.get(0)}));
  const opens=await page.evaluate(()=>window.__ownedDatabases.length);
  const downloads=[];const onDownload=value=>downloads.push(value);page.on('download',onDownload);
  await page.evaluate(()=>{window.__restore.hold=true;});
  await (operation==='export'?exporting:backup.getByRole('button',{name:'驗證並另存新槽',exact:true})).click();
  await page.waitForFunction(()=>typeof window.__restore.release==='function');
  await page.evaluate(()=>{const c=window.__restore;c.advance();c.hold=false;c.release();});
  await page.waitForFunction(()=>document.querySelector('#owned-backup [role=status]').textContent.includes('操作未完成')&&!document.querySelector('#owned-backup input').disabled);
  assert.equal(await page.evaluate(()=>window.__ownedDatabases.length),opens,'late release refusal precedes local store access');
  assert.deepEqual(downloads,[]);page.off('download',onDownload);
  assert.deepEqual(await page.evaluate(async()=>({catalog:await window.__restore.before(),save:await window.__ownedFormal.store.get(0)})),retained);
  assert.equal(await page.evaluate(()=>window.__ownedFormal.store.get(4)),null);
  assert.ok(await page.evaluate(()=>window.__restore.sessions.every(session=>session.state()==='closed')));checks++;
 }
 assert.ok(await page.evaluate(()=>window.__restore.sessions.every(session=>session.state()==='closed')));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(forbidden,[]);assert.ok(await page.evaluate(()=>window.__ownedDatabases.every(name=>name==='owned-formal-app')));checks++;
 for(const path of ['web/src/player/playerrestore.js','web/src/player/playerrepository.js'])sources[path]=sha(await readFile(path));
 await writeFile(join(artifact,'result.json'),JSON.stringify({checks,largeOrdinal,alternateFaction,factionIdentity,importedPlayer,invalid,transferred,errors,failed,forbidden,sources,screenshotSHA:sha(await readFile(join(artifact,'choices.png'))),scope:'Actual complete Web snapshots/native owned IDB/real preflight and chooser; controlled reader ports, automatic old-save cleanup under controlled current-version status; two-page native-IDB overwrite and delete/recreate during the status await reject stale cleanup and retain replacement body/token/catalog; backup import/export also reject release changes during a delayed old-identity admission before local-store access or download; no signed admission or production bootstrap.'},null,2));
 process.stdout.write(JSON.stringify({checks,artifact:relative('.',artifact)})+'\n');
}catch(error){await writeFile(join(artifact,'failure.json'),JSON.stringify({error:String(error),errors,failed,forbidden},null,2));throw error;}
finally{await browser?.close();await server.close();}
