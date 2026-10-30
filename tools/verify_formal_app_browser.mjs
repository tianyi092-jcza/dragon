// Fresh native browser/IDB; trusted full-copy pack seam, not remote admission.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {startBrowserTestServer} from './browser_test_server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function urlOf(value){try{return new URL(value);}catch{throw new Error('invalid owned URL');}}
const parent='.dragon-analysis/release-readiness';await mkdir(parent,{recursive:true});const artifact=await mkdtemp(join(parent,'formal-app-browser-'));
const server=await startBrowserTestServer();let browser,releaseAsset;
const errors=[],failed=[],forbidden=[],sources={};let checks=0;
const alternateFaction=process.argv.includes('--alternate-faction');
try {
 const origin=`http://127.0.0.1:${server.port}`;
 const bootPath='tools/fixtures/formal-app-browser.mjs',boot=await readFile(bootPath);sources[bootPath]=sha(boot);
 let html=await readFile('web/index.html','utf8');sources['web/index.html']=sha(html);
 const anchor='<script type="module" src="src/boot.js"></script>';assert.equal(html.split(anchor).length,2);
 html=html.replace(anchor,'<script type="module" src="/__owned-formal-boot.mjs"></script>');
 assert.equal(html.includes('type="importmap"'),false);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 await context.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);window.__ownedDatabases=[];indexedDB.open=(...args)=>{window.__ownedDatabases.push(args[0]);return open(...args);};});
 await context.route('**/*',route=>{
  const u=urlOf(route.request().url());if(u.origin!==origin||/\/api\/|save\.dat|\.dragon-runtime/i.test(u.pathname)){forbidden.push(u.origin===origin?u.pathname:'outside');return route.abort();}
  if(u.pathname==='/index.html')return route.fulfill({status:200,contentType:'text/html',body:html});
  if(u.pathname==='/__owned-formal-boot.mjs')return route.fulfill({status:200,contentType:'text/javascript',body:boot});
  // No test module aliases: all production modules come from the ordinary web root.
  if(u.pathname.startsWith('/web/src/')||u.pathname.startsWith('/reader/')){forbidden.push(u.pathname);return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(90000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))errors.push(m.text());});
 page.on('requestfailed',r=>failed.push({path:urlOf(r.url()).pathname,error:r.failure()?.errorText}));
 async function ready(path){const target=new URL(path,origin);if(alternateFaction&&target.searchParams.has('large'))target.searchParams.set('alternate-faction','1');await page.goto(target.href);await page.waitForFunction(()=>window.__ownedFormal?.ready||window.__ownedFormal?.bootError);assert.equal(await page.evaluate(()=>window.__ownedFormal.bootError??null),null);}
 await ready('/index.html');
 const initial=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal;
  const {snapshotScenarioAssembly}=await import('/src/game/scenarioassembly.js');
  const metadata=snapshotScenarioAssembly(a);
  const saved=await a.saveGame(0,'owned formal App');
  const stored=await c.store.get(0);
  return{saved,record:{releaseId:stored.record.releaseId,releaseOrdinal:stored.record.releaseOrdinal,label:stored.record.snapshot.label},metadata,
   rejectedOptions:c.rejectedOptions,cities:a.scenario.cities.length,trial:a.trialIdentity??null,startMenu:!!a.startMenu,clock:a.clock.constructor.name,db:window.__ownedDatabases};
 });
 assert.equal(initial.rejectedOptions,10);checks++;
 assert.deepEqual(initial.saved,{saved:'local'});assert.equal(initial.cities,192);assert.equal(initial.trial,null);assert.equal(initial.startMenu,false);assert.equal(initial.clock,'Clock');checks++;
 assert.equal(initial.record.releaseId,'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');assert.equal(initial.record.releaseOrdinal,0);assert.equal(initial.record.label,'owned formal App');checks++;
 assert.ok(initial.db.length>0&&initial.db.every(name=>name==='owned-formal-app'));assert.deepEqual(initial.metadata.scenarioAssembly.content.publication,{releaseId:initial.record.releaseId,ordinal:'1.0'});checks++;
 // An identity-mismatched record is reserved, not authenticated old history.
 // Its body is deliberately not relabelled into a valid old-release snapshot.
 const choices=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal,base=(await c.store.get(0)).record.snapshot;
  const other=await c.store.put({...c.saves.identity,releaseId:'dddddddd-dddd-4ddd-addd-dddddddddddd',slot:10,snapshot:{...base,slot:10}},null);
  a.saves=await c.repository.load();a.gamebar.openSystemSaveDialog();
  const vacant=a.gamebar.systemSaveDialog.rows.map(row=>row.slot);
  a.gamebar.systemSaveDialog=null;a.gamebar.syncClock();
  for(const slot of [1,2,3])await c.saves.put({...base,slot});
  a.saves=await c.repository.load();a.gamebar.openSystemSaveDialog();
  const full=a.gamebar.systemSaveDialog.rows.map(row=>row.slot);
  a.gamebar.systemSaveDialog=null;a.gamebar.syncClock();
  const saved=await a.saveGame(11,'above reserved identity');
  const retained=await c.store.get(10),added=await c.store.get(11);
  return{vacant,full,saved,unchanged:retained.token.bodyText===other.token.bodyText&&retained.token.bodyDigest===other.token.bodyDigest,
   addedSlot:added.record.slot,addedLabel:added.record.snapshot.label,absent:await c.store.get(4)};
 });
 assert.deepEqual(choices,{vacant:[0,1,2,3],full:[0,1,2,3,11],saved:{saved:'local'},unchanged:true,addedSlot:11,addedLabel:'above reserved identity',absent:null});checks++;
 const exited=await page.evaluate(async()=>{const a=window.__app,c=window.__ownedFormal;await a.returnToTitle('load');a.setRuntimeEnabled(true);return{exits:c.exits,scenario:a.scenario,enabled:a.runtimeEnabled,discarded:a.battleView._trialDiscarded,trial:a.trialEnded??null};});
 assert.deepEqual(exited,{exits:[{reason:'title',initialAction:'load'}],scenario:null,enabled:false,discarded:true,trial:null});checks++;
 await ready('/index.html?restore=1');
 const restored=await page.evaluate(async()=>{const a=window.__app;const {snapshotScenarioAssembly}=await import('/src/game/scenarioassembly.js');return{slot:a.loadedSaveSlot,label:a._lastLoadedSaveLabel,metadata:snapshotScenarioAssembly(a)};});
 assert.equal(restored.slot,0);assert.equal(restored.label,'owned formal App');assert.deepEqual(restored.metadata,initial.metadata);checks++;
 const statusChecks=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal,opened=window.__ownedDatabases.length,calls=c.statusCalls;
  const rng=JSON.stringify(a.originalRng.snapshot()),hold=a.clock.hold;
  const dialogOpened=a.gamebar.openSystemSaveDialog();await Promise.resolve();
  const dialog={opened:dialogOpened,calls:c.statusCalls-calls,noIO:window.__ownedDatabases.length===opened,hold:a.clock.hold===hold,rng:JSON.stringify(a.originalRng.snapshot())===rng};
  a.gamebar.systemSaveDialog=null;
  const beforeGuard=c.statusCalls;a._strategicBattleFailure={};
  const unsafe=await a.saveGame(0,'already unsafe');a._strategicBattleFailure=null;
  const guard={saved:unsafe,noCheck:c.statusCalls===beforeGuard,noIO:window.__ownedDatabases.length===opened};
  const delayed=[];
  for(const mode of ['battle','paused']){
   let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
   c.statusHook=()=>{entered();return gate;};const pending=a.saveGame(0,'must not snapshot');await started;
   if(mode==='battle')a._strategicBattleFailure={};else a.setRuntimeEnabled(false);
   release();const saved=await pending;
   delayed.push({mode,saved,noIO:window.__ownedDatabases.length===opened});
   a._strategicBattleFailure=null;a.setRuntimeEnabled(true);
  }
  // A thrown 410-looking error is not proof of deletion of the captured pack.
  c.statusHook=()=>{throw Object.assign(new Error('unverified status failure'),{code:'GAME_DELETED',status:410});};
  const offline=await a.saveGame(0,'owned formal App');c.statusHook=null;
  return{dialog,guard,delayed,offline,active:a.checkFormalCurrent(),exits:c.exits.length};
 });
 assert.deepEqual(statusChecks.dialog,{opened:true,calls:1,noIO:true,hold:true,rng:true});checks++;
 assert.deepEqual(statusChecks.guard,{saved:{saved:'blocked'},noCheck:true,noIO:true});checks++;
 assert.deepEqual(statusChecks.delayed,['battle','paused'].map(mode=>({mode,saved:{saved:'blocked'},noIO:true})));checks++;
 assert.deepEqual(statusChecks.offline,{saved:'local'});assert.equal(statusChecks.active,true);assert.equal(statusChecks.exits,0);checks++;
 const retired=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal,repo=a.saveRepository;
  let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  a.saveRepository={...repo,async put(snapshot){const result=await repo.put(snapshot);entered();await gate;return result;}};
  const pending=a.saveGame(0,'owned committed before retirement'),queued=a.saveGame(1,'stale queued');await started;
  const stored=await c.store.get(0),scenario=a.scenario,tax=scenario.next_tax;
  c.retire();document.querySelector('#taxup').click();const allowed=a.checkFormalCurrent(),inputBlocked=scenario.next_tax===tax;
  const live=a.saves,slot=a.loadedSaveSlot;release();const result=await pending,skipped=await queued;await a.returnToTitle();
  const before=window.__ownedDatabases.length,blocked=await a.saveGame(0,'retired');
  let openRejected=false;try{await a.beginNewGame(0,c.environment.player,null);}catch{openRejected=true;}
  return{allowed,inputBlocked,result,skipped,blocked,openRejected,liveUnchanged:a.saves===live&&a.loadedSaveSlot===slot,
   exits:c.exits,scenario:a.scenario,runtime:a.runtimeEnabled,storedLabel:stored.record.snapshot.label,noNewIO:before===window.__ownedDatabases.length,
   battleStopped:a.battleView.updateBattleFrames(1)===false};
 });
 assert.equal(retired.inputBlocked,true);checks++;
 assert.equal(retired.allowed,false);assert.deepEqual(retired.result,{saved:'superseded',committed:true,slot:0});assert.deepEqual(retired.skipped,{saved:'blocked',reason:'superseded'});checks++;
 assert.deepEqual(retired.blocked,{saved:'blocked',reason:'superseded'});assert.equal(retired.openRejected,true);assert.equal(retired.noNewIO,true);checks++;
 assert.equal(retired.liveUnchanged,true);assert.equal(retired.scenario,null);assert.equal(retired.runtime,false);assert.equal(retired.battleStopped,true);assert.deepEqual(retired.exits,[{reason:'deleted',initialAction:undefined}]);checks++;
 assert.equal(retired.storedLabel,'owned committed before retirement');checks++;
 await page.screenshot({path:join(artifact,'retired.png')});
 // Retirement while the real App is awaiting its shared asset barrier: no install.
 let enteredAsset;const assetStarted=new Promise(r=>{enteredAsset=r;});const assetGate=new Promise(r=>{releaseAsset=r;});
 await page.route('**/battle_rules.json',async route=>{enteredAsset();await assetGate;await route.continue();});
 await page.goto(origin+'/index.html?preflight=1');await assetStarted;
 await page.evaluate(()=>{window.__ownedFormal.retire();window.__app.checkFormalCurrent();});releaseAsset();
 await page.waitForFunction(()=>!!window.__ownedFormal?.bootError);
 const stale=await page.evaluate(()=>({error:window.__ownedFormal.bootError.code,exits:window.__ownedFormal.exits,scenario:window.__app.scenario,started:window.__app.gameStarted,enabled:window.__app.runtimeEnabled}));
 assert.deepEqual(stale,{error:'GAME_DELETED',exits:[{reason:'deleted',initialAction:undefined}],scenario:null,started:false,enabled:false});checks++;
 await ready('/index.html?restore=1');
 await page.evaluate(()=>{
  const a=window.__app,c=window.__ownedFormal;
  // A controlled image completion, while the actual strategic RAF observes the
  // terminal formal owner. No test calls checkFormalCurrent for this case.
  let release;const waiting=new Promise(r=>{release=r;});
  a.world={...a.world,loadSeason:()=>waiting};
  c.lateSeason=a.setSeason(1);c.releaseSeason=()=>release({ownedLateImage:true});c.retire();
 });
 await page.waitForFunction(()=>window.__ownedFormal.exits.length===1);
 const frameRetired=await page.evaluate(async()=>{const c=window.__ownedFormal,a=window.__app;c.releaseSeason();await c.lateSeason;return{exits:c.exits,scenario:a.scenario,image:a.view.seasonImg,enabled:a.runtimeEnabled};});
 assert.deepEqual(frameRetired,{exits:[{reason:'deleted',initialAction:undefined}],scenario:null,image:null,enabled:false});checks++;
 await ready('/index.html?restore=1');
 const statusRetired=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal;
  let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  c.statusHook=()=>{entered();return gate;};
  const before=window.__ownedDatabases.length,calls=c.statusCalls;
  const pending=a.saveGame(0,'late status'),queued=a.saveGame(1,'queued after status');await started;
  await a.returnToTitle();release();
  const saved=await pending,skipped=await queued;
  return{saved,skipped,calls:c.statusCalls-calls,noIO:window.__ownedDatabases.length===before,exits:c.exits,enabled:a.runtimeEnabled};
 });
 assert.deepEqual(statusRetired,{saved:{saved:'blocked',reason:'superseded'},skipped:{saved:'blocked',reason:'superseded'},calls:1,noIO:true,exits:[{reason:'title',initialAction:undefined}],enabled:false});checks++;
 const archiveBefore=await page.evaluate(()=>window.__ownedFormal.store.list());
 const startupFailures=[];
 for(const kind of ['repository','null','delete-code','missing-slot','season']){
  await page.goto(origin+'/index.html?failure='+kind);
  await page.waitForFunction(()=>!!window.__ownedFormal?.bootError);
  await page.waitForFunction(()=>window.__ownedFormal.exits.length===1);
  const result=await page.evaluate(async()=>{
   const a=window.__app,c=window.__ownedFormal,before=window.__ownedDatabases.length;
   a.setRuntimeEnabled(true);const blocked=await a.saveGame(0,'failed startup');await a.returnToTitle();
   return{error:c.bootError,prefix:c.failurePrefix??null,exits:c.exits,ready:c.ready,ended:a._formalEntry.ended,
    scenario:a.scenario,clock:a.clock,entry:a._gameEntryRequest,pending:a._scenarioAssemblyPending,incomplete:a._scenarioAssemblyIncomplete,
    enabled:a.runtimeEnabled,started:a.gameStarted,rng:a.originalRng,discarded:a.battleView?._trialDiscarded??null,
    blocked,noSaveIO:before===window.__ownedDatabases.length,opensBeforeCheck:before,archive:await c.store.list()};
  });
  assert.deepEqual(result.exits,[{reason:'unavailable',initialAction:undefined}]);
  for(const key of ['scenario','clock','entry','pending','incomplete','rng'])assert.equal(result[key],null,key);
  assert.equal(result.ended,true);assert.equal(result.discarded,kind==='season'?true:null);assert.equal(result.ready,false);assert.equal(result.started,false);assert.equal(result.enabled,false);
  assert.deepEqual(result.blocked,{saved:'blocked',reason:'superseded'});assert.equal(result.noSaveIO,true);assert.deepEqual(result.archive,archiveBefore);
  if(['repository','null','delete-code'].includes(kind))assert.equal(result.opensBeforeCheck,0);
  if(kind==='delete-code')assert.equal(result.error.code,'GAME_DELETED');
  if(kind==='null')assert.equal(result.error.nullRejection,true);
  if(kind==='season')assert.deepEqual(result.prefix,{scenario:true,clock:true,incomplete:true});
  startupFailures.push({kind,...result,archive:'unchanged owned summaries'});checks++;
 }
 await ready('/index.html?capture=1');
 const capturedRestore=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal,stored=await c.store.get(0);
  const loadedLabel=a._lastLoadedSaveLabel,capturedLabel=c.capturedLabel;
  const overwrite=await a.saveGame(0,'must not replace other window');
  let secondLoadRejected=false;try{await c.repository.load();}catch{secondLoadRejected=true;}
  const after=await c.store.get(0);await a.returnToTitle();
  return{loadedLabel,capturedLabel,externalLabel:stored.record.snapshot.label,result:overwrite.saved,
   unchanged:after.token.bodyText===stored.token.bodyText&&after.token.writeRevision===stored.token.writeRevision,secondLoadRejected};
 });
 assert.equal(capturedRestore.loadedLabel,capturedRestore.capturedLabel);assert.equal(capturedRestore.externalLabel,'external after capture');checks++;
 assert.equal(capturedRestore.result,'failed');assert.equal(capturedRestore.unchanged,true);assert.equal(capturedRestore.secondLoadRejected,true);checks++;
 const smallArchive=await page.evaluate(()=>window.__ownedFormal.store.get(0));
 await ready('/index.html?large=1');
 const factionIdentity=await page.evaluate(()=>{
  const a=window.__app,c=window.__ownedFormal;
  return{selected:c.environment.player,live:a.scenario.player_faction,first:a.content.chapter(0).template.factions[0].idx};
 });
 assert.equal(factionIdentity.live,factionIdentity.selected);
 if(alternateFaction)assert.notEqual(factionIdentity.selected,factionIdentity.first);
 else assert.equal(factionIdentity.selected,factionIdentity.first);
 checks++;
 const largeSaved=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal;
  const saved=await a.saveGame(0,'large exact ordinal'),record=await c.store.get(0);
  const {createGameSaveExchange}=await import('/src/core/gamesaveexchange.js');
  const exchange=createGameSaveExchange({identity:c.saves.identity,context:{data:a.data,content:a.content,world:a.world}});
  const exported=await exchange.encode(record.record),decoded=await exchange.decode(exported);
  await a.returnToTitle();
  return{saved,ordinal:record.record.releaseOrdinal,publication:record.record.snapshot.webMeta.scenarioAssembly.content.publication,
   backupOrdinal:decoded.input.releaseOrdinal,backupEqual:JSON.stringify(decoded.input.snapshot)===JSON.stringify(record.record.snapshot)};
 });
 assert.deepEqual(largeSaved,{saved:{saved:'local'},ordinal:'9007199254740993',publication:{releaseId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',ordinal:'1.9007199254740993'},backupOrdinal:'9007199254740993',backupEqual:true});checks++;
 await ready('/index.html?large=1&restore=1');
 const largeRestored=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal,saved=await a.saveGame(0,'large restored overwrite'),record=await c.store.get(0);
  const {createGameSaveStore}=await import('/src/core/gamesavestore.js');
  const other=createGameSaveStore({gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',databaseName:'owned-formal-app',getIndexedDB:()=>indexedDB});
  const small=await other.get(0);await a.returnToTitle();
  return{saved,label:a._lastLoadedSaveLabel,ordinal:record.record.releaseOrdinal,revision:record.record.writeRevision,smallDigest:small.token.bodyDigest};
 });
 assert.deepEqual(largeRestored,{saved:{saved:'local'},label:'large exact ordinal',ordinal:'9007199254740993',revision:2,smallDigest:smallArchive.token.bodyDigest});checks++;
 // Explicit programmatic backup import, not a file-picker or latest-version UI.
 await ready('/index.html?large=1&restore=1');
 const backupImport=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal;
  const {createGameSaveExchange}=await import('/src/core/gamesaveexchange.js');
  const {createGameSaveStore}=await import('/src/core/gamesavestore.js');
  const other=createGameSaveStore({gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',databaseName:'owned-formal-app',getIndexedDB:()=>indexedDB});
  const source=await c.store.get(0),otherBefore=await other.get(0),otherCatalog=await other.list();
  const scenario=a.scenario,liveSaves=a.saves,loadedSlot=a.loadedSaveSlot,rng=JSON.stringify(a.originalRng.snapshot()),serial=a.clock.strategicTickSerial;
  const exchange=createGameSaveExchange({identity:c.saves.identity,context:{data:a.data,content:a.content,world:a.world}});
  const text=await c.saves.exportBackup(0),decoded=await exchange.decode(text);
  const candidate={...decoded.input.snapshot,slot:12};
  const receipt=await c.saves.importBackup(text,12),imported=await c.store.get(12);
  const roundtrip=await exchange.decode(await c.saves.exportBackup(12));
  const catalog=await c.store.list();let conflict=null;
  try{await c.saves.importBackup(text,12);}catch(error){conflict=error.name;}
  const result={committed:receipt.committed,ordinal:imported.record.releaseOrdinal,slot:imported.record.slot,
   freshRecordId:imported.record.recordId!==decoded.origin.recordId,revision:imported.record.writeRevision,
   snapshotEqual:JSON.stringify(imported.record.snapshot)===JSON.stringify(candidate),
   roundtripEqual:JSON.stringify(roundtrip.input.snapshot)===JSON.stringify(candidate),
   sourceUnchanged:JSON.stringify(await c.store.get(0))===JSON.stringify(source),
   otherUnchanged:JSON.stringify(await other.get(0))===JSON.stringify(otherBefore)&&JSON.stringify(await other.list())===JSON.stringify(otherCatalog),
   liveUnchanged:a.scenario===scenario&&a.saves===liveSaves&&a.loadedSaveSlot===loadedSlot&&JSON.stringify(a.originalRng.snapshot())===rng&&a.clock.strategicTickSerial===serial,
   conflict,occupiedUnchanged:JSON.stringify(await c.store.get(12))===JSON.stringify(imported)&&JSON.stringify(await c.store.list())===JSON.stringify(catalog)};
  await a.returnToTitle();return result;
 });
 assert.deepEqual(backupImport,{committed:true,ordinal:'9007199254740993',slot:12,freshRecordId:true,revision:3,snapshotEqual:true,roundtripEqual:true,
  sourceUnchanged:true,otherUnchanged:true,liveUnchanged:true,conflict:'GameSaveConflictError',occupiedUnchanged:true});checks++;
 // New page/Realm: restore the imported record, not the original slot0.
 await ready('/index.html?large=1&restore-import=1');
 const importedRestore=await page.evaluate(async()=>{
  const a=window.__app,c=window.__ownedFormal;
  const {createGameSaveStore}=await import('/src/core/gamesavestore.js');
  const other=createGameSaveStore({gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',databaseName:'owned-formal-app',getIndexedDB:()=>indexedDB});
  const source=await c.store.get(0),imported=await c.store.get(12),otherBefore=await other.get(0),otherCatalog=await other.list();
  const {saveJSON}=await import('/src/core/gamesavecodec.js');
  const slot=a.loadedSaveSlot,label=a._lastLoadedSaveLabel,rngEqual=saveJSON(a.originalRng.snapshot())===saveJSON(imported.record.snapshot.webMeta.originalRng);
  const saved=await a.saveGame(12,'restored from imported backup'),after=await c.store.get(12);
  const result={slot,label,rngEqual,saved,ordinal:after.record.releaseOrdinal,revision:after.record.writeRevision,
   player:a.scenario.player_faction,environmentPlayer:c.environment.player,importedPlayer:imported.record.snapshot.state.player_faction,savedPlayer:after.record.snapshot.state.player_faction,
   sameRecordId:after.record.recordId===imported.record.recordId,savedLabel:after.record.snapshot.label,
   sourceUnchanged:JSON.stringify(await c.store.get(0))===JSON.stringify(source),
   otherUnchanged:JSON.stringify(await other.get(0))===JSON.stringify(otherBefore)&&JSON.stringify(await other.list())===JSON.stringify(otherCatalog)};
  await a.returnToTitle();return result;
 });
 assert.deepEqual(importedRestore,{slot:12,label:'large restored overwrite',rngEqual:true,saved:{saved:'local'},ordinal:'9007199254740993',revision:4,
  sameRecordId:true,savedLabel:'restored from imported backup',sourceUnchanged:true,otherUnchanged:true,
  player:factionIdentity.selected,environmentPlayer:factionIdentity.selected,importedPlayer:factionIdentity.selected,savedPlayer:factionIdentity.selected});checks++;
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert.deepEqual(failed,[]);checks++;
 for(const path of ['web/src/main.js','web/src/ui/gamebar.js','web/src/render/battleview.js','web/src/app/battleflow.js','web/src/core/savecatalog.js',...['playerclient','playerenvironment','playerpack','playerrepository','playersaves','runtimecontract'].map(name=>'web/src/player/'+name+'.js')])sources[path]=sha(await readFile(path));
 const result={checks,alternateFaction,factionIdentity,initial,choices,restored,statusChecks,statusRetired,retired,stale,frameRetired,startupFailures,capturedRestore,largeSaved,largeRestored,backupImport,importedRestore,errors,failed,forbidden,sources,screenshotSHA:sha(await readFile(join(artifact,'retired.png'))),scope:'Actual shared App fresh/restore/native IDB and retirement; trusted current-Web full-copy pack seam; ordinary static Web module routes, no import map or reader module alias. No signed admission, public title, deletion-confirmation UI or cloud proof.'};
 await writeFile(join(artifact,'result.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({checks,artifact:relative('.',artifact)})+'\n');
} catch(error){await writeFile(join(artifact,'failure.json'),JSON.stringify({error:String(error),errors,failed,forbidden},null,2));throw error;}
finally{releaseAsset?.();await browser?.close();await server.close();}
