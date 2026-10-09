// Actual20 snapshots, opt-in bound JSON backup and explicit mock import. No UI/auth or native IDB.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{gameSaveFixture}from'./gamesavefixture.mjs';import{gameSaveMemoryIDB}from'./gamesave_mock.mjs';
import{createGameSaveExchange}from'../web/src/core/gamesaveexchange.js';import{createGameSaveStore,GameSaveConflictError}from'../web/src/core/gamesavestore.js';
import{saveJSON,gameSaveKeys,hashSaveText}from'../web/src/core/gamesavecodec.js';import{MAX_SAVE_FILE_BYTES,encodeSaveFile}from'../web/src/core/saveexchange.js';
const fixture=gameSaveFixture(),priorFetch=globalThis.fetch,priorIDB=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');let implicitIDB=0,negativeControls=0,getterCalls=0;const checks=[];
globalThis.fetch=fixture.fetch;Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){implicitIDB++;throw new Error('implicit native IDB forbidden');}});
const refuse=async fn=>{await assert.rejects(fn);negativeControls++;};
function parse(text){try{return JSON.parse(text);}catch(cause){throw new TypeError('bad captured backup fixture JSON',{cause});}}
async function edited(text,change){const envelope=parse(text),record=parse(envelope.bodyText);change(record,envelope);envelope.bodyText=saveJSON(record);envelope.bodyDigest=await hashSaveText(envelope.bodyText);return saveJSON(envelope);}
try{for(let idx=0;idx<20;idx++){
 const {app,saved}=await fixture.snapshot(idx),liveBefore=structuredClone(app.scenario),rngBefore=app.originalRng.snapshot(),identity={gameId:'exchange-fixture-'+idx,releaseId:'fixture-not-published',releaseOrdinal:0,chapterId:app.content.chapter(idx).id,manifestDigest:fixture.manifestDigest};
 const memory=gameSaveMemoryIDB([[gameSaveKeys(identity.gameId,0).catalog,{format:3,gameId:identity.gameId,nextWriteRevision:41,rows:[]}]]),store=createGameSaveStore({gameId:identity.gameId,databaseName:'owned-source',getIndexedDB:()=>memory.indexedDB,createRecordId:()=> 'source-'+idx});
 const source=await store.put({...identity,slot:0,snapshot:saved}),sourceRecords=memory.records();assert.equal(source.record.writeRevision,41);
 const exchange=createGameSaveExchange({identity,context:fixture.context()}),text=await exchange.encode(source.record),decoded=await exchange.decode(text);assert.deepEqual(decoded.input.snapshot,saved);assert.deepEqual(decoded.origin,{slot:0,recordId:'source-'+idx,writeRevision:41});assert.ok(Object.isFrozen(decoded.origin));
 const destination=gameSaveMemoryIDB([['slots',{keep:'legacy'}],['catalog-v2',{keep:'old-catalog'}],['record:0',{keep:'old-body'}]]),legacy=destination.records(),target=createGameSaveStore({gameId:identity.gameId,databaseName:'owned-target',getIndexedDB:()=>destination.indexedDB,createRecordId:()=> 'destination-'+idx});
 const imported=await target.put(decoded.input);assert.equal(imported.record.recordId,'destination-'+idx);assert.equal(imported.record.writeRevision,1);assert.deepEqual(imported.record.snapshot,saved);assert.deepEqual((await target.get(0)).record,imported.record);
 const other=createGameSaveStore({gameId:'other-game',databaseName:'owned-target',getIndexedDB:()=>destination.indexedDB,createRecordId:()=> 'other-'+idx});await other.put({...decoded.input,gameId:'other-game'});const beforeRefusals=destination.records();
 await assert.rejects(()=>target.put(decoded.input),GameSaveConflictError);negativeControls++;assert.deepEqual(destination.records(),beforeRefusals);
 for(const field of ['movementMemory','terrainMemory','cityCache','bad-rng','wrong-index']){
   const bad=await edited(text,record=>{if(field==='bad-rng')record.snapshot.webMeta.originalRng.table.pop();else if(field==='wrong-index')record.snapshot.scenario_idx=(idx+1)%20;else delete record.snapshot.webMeta[field];});
   await refuse(()=>exchange.decode(bad));assert.deepEqual(destination.records(),beforeRefusals);
 }
 if(idx===0){
   for(const [field,value]of Object.entries({gameId:'another',releaseId:'another-release',releaseOrdinal:1,chapterId:'another-chapter',manifestDigest:'a'.repeat(64)}))await refuse(()=>createGameSaveExchange({identity:{...identity,[field]:value},context:fixture.context()}).decode(text));
   const badDigest=parse(text);badDigest.bodyDigest='0'.repeat(64);await refuse(()=>exchange.decode(saveJSON(badDigest)));
   for(const change of [e=>{e.version=2;},e=>{e.extra=true;},e=>{delete e.bodyDigest;},e=>{e.rules.revision='unknown';},e=>{e.bodyText=e.bodyText+' ';}]){const e=parse(text);change(e);await refuse(()=>exchange.decode(saveJSON(e)));}
   for(const change of [r=>{r.gameId='foreign';},r=>{r.format=2;},r=>{r.recordId='';},r=>{r.writeRevision=0;},r=>{r.slot=-1;},r=>{r.snapshot.constructor={unsafe:true};}]){const bad=await edited(text,change);await refuse(()=>exchange.decode(bad));}
   await refuse(async()=>exchange.decode(await encodeSaveFile(saved,fixture.context())));await refuse(()=>exchange.decode('{bad json'));await refuse(()=>exchange.decode(null));
   const large='雪'.repeat(Math.floor(MAX_SAVE_FILE_BYTES/3)+1);await refuse(()=>exchange.decode(large));
   const accessor={...source.record};Object.defineProperty(accessor,'snapshot',{enumerable:true,get(){getterCalls++;return saved;}});await refuse(()=>exchange.encode(accessor));assert.equal(getterCalls,0);
   for(const value of [undefined,NaN,Infinity,-0,new Uint8Array(1)]){const bad=structuredClone(source.record);bad.snapshot.extra=value;await refuse(()=>exchange.encode(bad));}
   const cycle=structuredClone(source.record);cycle.snapshot.extra=cycle;await refuse(()=>exchange.encode(cycle));
   const captured=structuredClone(source.record),operation=exchange.encode(captured);captured.releaseId='late';captured.snapshot.label='late';assert.deepEqual((await exchange.decode(await operation)).input.snapshot,saved);
   const boundIdentity={...identity},bound=createGameSaveExchange({identity:boundIdentity,context:fixture.context()});boundIdentity.gameId='late';assert.deepEqual((await bound.decode(text)).input.snapshot,saved);
   assert.deepEqual(destination.records(),beforeRefusals);
 }
 assert.deepEqual(memory.records(),sourceRecords);assert.deepEqual(destination.records().filter(([key])=>legacy.some(([old])=>old===key)),legacy);assert.deepEqual(destination.stats.deletes,[]);
 assert.deepEqual(structuredClone(app.scenario),liveBefore);assert.deepEqual(app.originalRng.snapshot(),rngBefore);assert.equal(app.clock.strategicTickSerial,0);
 checks.push({idx,chapterId:identity.chapterId,sourceRevision:41,destinationRevision:1,canonicalSnapshotEqual:true,rejectedSemanticInputs:5,liveClockRngUnchanged:true});
}}finally{globalThis.fetch=priorFetch;if(priorIDB)Object.defineProperty(globalThis,'indexedDB',priorIDB);else delete globalThis.indexedDB;}
fixture.verify();assert.equal(implicitIDB,0);assert.equal(getterCalls,0);assert.equal(checks.length,20);
const names=['tools/verify_game_save_exchange.mjs','tools/gamesavefixture.mjs','web/src/core/gamesaveexchange.js','web/src/core/saveexchange.js','web/src/content/ruleprofile.js'],toolHashes=Object.fromEntries(names.map(p=>[p,createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex')]));
process.stdout.write(JSON.stringify({result:'PASS-GAME-BOUND-BACKUP-COMMON-ADMISSION',chapters:20,negativeControls,implicitIDB,getterCalls,checks,inputHashes:fixture.inputHashes,toolHashes,requests:fixture.requests,limits:'Engineering expected tuple only, NOT trusted published/latest/auth. Captured records, full fresh0tick snapshots and detached common path; explicit own mock import, not UI/App/nativeIDB/campaign. Decode never writes/deletes; old format remains separate; receiving store owns identity/counter.'},null,2)+'\n');
