// Actual current20chapter snapshots + opt-in mock store + shared detached restore.
// No native IDB/profile/DOS/network, publication identity, App installation or rule ticks.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{BUILTIN_RESOURCES as resources}from'../web/src/content/builtinresources.generated.js';
import{createContentCatalog}from'../web/src/content/catalog.js';import{createWorldResources}from'../web/src/game/worldresources.js';import{createNewGameScenario}from'../web/src/game/world.js';
import{prepareScenario,snapshotScenarioAssembly}from'../web/src/game/scenarioassembly.js';import{snapshotState,admitSavedScenario}from'../web/src/game/savegame.js';import{Clock}from'../web/src/game/clock.js';import{createOriginalBattleRng}from'../web/src/game/battle/originalrng.js';
import{saveJSON}from'../web/src/core/gamesavecodec.js';import{createGameSaveStore}from'../web/src/core/gamesavestore.js';import{gameSaveMemoryIDB}from'./gamesave_mock.mjs';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),inputHashes={};
function read(path){assert.ok(path.startsWith('web/'));const bytes=readFileSync(new URL(path,root));inputHashes[path]=hash(bytes);return bytes;}function parse(bytes){try{return JSON.parse(bytes.toString('utf8'));}catch(cause){throw new TypeError('invalid bound snapshot fixture JSON',{cause});}}
const prefix='web/content/builtin/compiled/'+resources.world.revision+'/',manifestBytes=read(prefix+'manifest.json'),manifest=parse(manifestBytes),files=new Map();assert.equal(manifest.assets.length,38);
const names=['data.json','catalog.json','world-definition.json','terrain.bin','roads.json','road_cost.bin','road_offset.json'];
for(const name of names){const row=manifest.assets.find(a=>a.path===name);assert.ok(row,name);assert.equal(row.url,prefix.slice(4)+name);const bytes=read(prefix+name);assert.equal(bytes.length,row.byteLength);assert.equal(hash(bytes),row.sha256);files.set(row.url,bytes);}
const definition=parse(files.get(prefix.slice(4)+'world-definition.json')),data=parse(files.get(prefix.slice(4)+'data.json')),catalog=parse(files.get(prefix.slice(4)+'catalog.json'));assert.deepEqual(definition,resources.world);assert.equal(data.scenarios.length,20);const content=createContentCatalog(catalog,data);
const allowed=[definition.assets.terrain,definition.assets.roadGraph,definition.assets.roadCost,definition.assets.roadOffset],requests=[],checks=[];let implicitIDB=0,negativeControls=0;
const priorIDB=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),priorFetch=globalThis.fetch;Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){implicitIDB++;throw new Error('native IDB forbidden');}});
globalThis.fetch=async input=>{const url=String(input);assert.ok(allowed.includes(url));assert.ok(files.has(url));requests.push(url);return new Response(files.get(url));};
try{for(let idx=0;idx<20;idx++){
 const world=createWorldResources(definition),raw=createNewGameScenario(content.chapter(idx).template);raw.player_faction=raw.factions[0].idx;
 const ready=await prepareScenario({raw,idx,mode:'fresh',content,world}),scenario=ready.scenario,clock=new Clock({startYear:scenario.start.year,startMonth:scenario.start.month,startDay:scenario.start.day}),rng=createOriginalBattleRng({ch:1,cl:2,dh:3});
 const app={scenario,scenarioIdx:idx,content,world,data,clock,originalRng:rng},before=structuredClone(scenario),rngBefore=rng.snapshot(),assemblyBefore=snapshotScenarioAssembly(app),saved=snapshotState(app,0,'工程夾具，不是正式版本');
 const text=saveJSON(saved),memory=gameSaveMemoryIDB(),gameId='snapshot-fixture-'+idx,store=createGameSaveStore({gameId,databaseName:'owned-snapshot-memory',getIndexedDB:()=>memory.indexedDB,createRecordId:()=>gameId+'-'+memory.stats.writes.length});
 const input=(slot,snapshot)=>({gameId,releaseId:'fixture-not-published',releaseOrdinal:0,chapterId:content.chapter(idx).id,manifestDigest:hash(manifestBytes),slot,snapshot});
 await store.put(input(0,saved));const got=await store.get(0);assert.equal(saveJSON(got.record.snapshot),text);assert.deepEqual(got.record.snapshot,saved);
 const restoredWorld=createWorldResources(definition),admitted=admitSavedScenario(got.record.snapshot,{data,content,world:restoredWorld}),restored=await prepareScenario({...admitted,mode:'restore',content,world:restoredWorld});
 const resumedRng=createOriginalBattleRng({ch:9,cl:8,dh:7}).restore(got.record.snapshot.webMeta.originalRng),referenceRng=createOriginalBattleRng({ch:4,cl:5,dh:6}).restore(rngBefore);
 assert.deepEqual(resumedRng.snapshot(),rngBefore);assert.deepEqual(Array.from({length:16},()=>resumedRng.nextByte()),Array.from({length:16},()=>referenceRng.nextByte()));
 // Re-snapshot with unadvanced saved RNG. Next-byte check above uses separate owned clones.
 const coldRng=createOriginalBattleRng({ch:0,cl:0,dh:0}).restore(got.record.snapshot.webMeta.originalRng),coldApp={...app,scenario:restored.scenario,world:restoredWorld,originalRng:coldRng};
 assert.deepEqual(snapshotScenarioAssembly(coldApp),assemblyBefore);const cold=snapshotState(coldApp,0,saved.label);assert.equal(saveJSON(cold.webMeta),saveJSON(saved.webMeta));assert.deepEqual(cold.state.nativeLegionSlots,saved.state.nativeLegionSlots);
 for(const [order,field]of ['movementMemory','terrainMemory','cityCache','wrong-index'].entries()){
   const bad=structuredClone(saved),slot=order+1;bad.slot=slot;if(field==='wrong-index')bad.scenario_idx=(idx+1)%20;else delete bad.webMeta[field];
   // Strict JSON storage is intentionally NOT semantic restore admission.
   await store.put(input(slot,bad));const badStored=await store.get(slot),recordBefore=structuredClone(memory.records());
   assert.throws(()=>admitSavedScenario(badStored.record.snapshot,{data,content,world:restoredWorld}));negativeControls++;
   assert.deepEqual(memory.records(),recordBefore);assert.deepEqual((await store.get(slot)).token,badStored.token);
 }
 assert.deepEqual(structuredClone(scenario),before);assert.deepEqual(rng.snapshot(),rngBefore);assert.equal(clock.strategicTickSerial,0);assert.deepEqual(memory.stats.deletes,[]);
 checks.push({idx,chapterId:content.chapter(idx).id,result:'SNAPSHOT-STRICT-STORE-COMMON-RESTORE',bodyBytes:Buffer.byteLength(text),bodySha256:hash(text),nativeMemoryAndMetaEqual:true,rngRestoredAnd16NextBytesEqual:true,refusedSemanticLoadsPreserved:4});
}}finally{globalThis.fetch=priorFetch;if(priorIDB)Object.defineProperty(globalThis,'indexedDB',priorIDB);else delete globalThis.indexedDB;}
assert.equal(implicitIDB,0);assert.equal(negativeControls,80);for(const[path,h]of Object.entries(inputHashes))assert.equal(hash(readFileSync(new URL(path,root))),h,path);
const toolHashes=Object.fromEntries(['tools/verify_game_save_snapshot.mjs','tools/gamesave_mock.mjs','web/src/core/gamesavecodec.js','web/src/core/gamesavestore.js','web/src/game/savegame.js','web/src/game/scenarioassembly.js','web/src/game/world.js','web/src/game/clock.js','web/src/game/battle/originalrng.js','web/src/content/catalog.js','web/src/game/worldresources.js'].map(path=>[path,hash(readFileSync(new URL(path,root)))]));
process.stdout.write(JSON.stringify({result:'PASS-REAL-SNAPSHOT-OPT-IN-STORE-DETACHED',chapters:20,negativeControls,implicitIDB,inputHashes,toolHashes,checks,requests,limits:'Current20fresh0tick only, engineering release fixture not formal validity/confirmation/backup/import/App/browserUI. Cold detached common admission and native RAM/RNG verified, not live campaign/native CPU equivalence. Lossy/accessor policy unchanged; semantic refusal never deletes.'},null,2)+'\n');
