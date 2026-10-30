// Existing Web source + unchanged snapshot/restore and owned IDB mock. No native
// storage, real user saves, DOS files, browser, remote network or deletion UI.
import assert from 'node:assert/strict';
import { gameSaveFixture } from './gamesavefixture.mjs';
import { gameSaveMemoryIDB } from './gamesave_mock.mjs';
import { createGameSaveStore } from '../web/src/core/gamesavestore.js';
import { createContentCatalog } from '../web/src/content/catalog.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
import { snapshotState, admitSavedScenario } from '../web/src/game/savegame.js';
import { Clock } from '../web/src/game/clock.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { createPlayerSaveStore } from '../reader/playersaves.js';
const G='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',R='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',R2='cccccccc-cccc-4ccc-accc-cccccccccccc';
const fixture=gameSaveFixture(),nativeFetch=globalThis.fetch;
const identity={gameId:G,releaseId:R,ordinal:'1.0',revision:'1',sourceDigest:'a'.repeat(64),chapterId:G+'#c1',manifestDigest:'b'.repeat(64)};
const memory=gameSaveMemoryIDB([['slots',{ownedLegacy:true}]]),store=createGameSaveStore({gameId:G,databaseName:'owned-formal-saves',getIndexedDB:()=>memory.indexedDB});
let retired=false,checks=0;
const current=()=>{if(retired)throw new Error('owned retired session');};
try {
 globalThis.fetch=fixture.fetch;
 const baseContext=fixture.context(),base=createContentCatalog({schemaVersion:1,rules:'ki-1995',id:G,revision:identity.sourceDigest,chapters:[{id:identity.chapterId,legacyScenarioIndex:0,official:false}]},{scenarios:[baseContext.content.chapter(0).template]});
 const chapter=Object.freeze({...base.chapter(0),reference:Object.freeze({...base.chapter(0).reference,publication:Object.freeze({releaseId:R,ordinal:'1.0'})})});
 const content=Object.freeze({...base,chapter:i=>i===0||i===chapter.id?chapter:null,resolveReference:ref=>ref?.publication?.releaseId===R&&ref.publication.ordinal==='1.0'&&base.resolveReference(ref)?chapter:null});
 const environment={identity,content,world:baseContext.world,assertCurrent:current};
 const bound=createPlayerSaveStore({environment,store});
 const raw=createNewGameScenario(chapter.template,chapter.template.factions[0].idx);
 const prepared=await prepareScenario({raw,idx:0,mode:'fresh',content,world:environment.world});
 const scenario=prepared.scenario,clock=new Clock({startYear:scenario.start.year,startMonth:scenario.start.month,startDay:scenario.start.day}),originalRng=createOriginalBattleRng({ch:1,cl:2,dh:3});
 const app={data:content.data,content,world:environment.world,scenario,scenarioIdx:0,clock,originalRng};
 const snapshot=snapshotState(app,0,'正式保存'),before=structuredClone(snapshot),rng=originalRng.snapshot();
 const pending=bound.put(snapshot);snapshot.label='caller changed after await';const saved=await pending;
 assert.equal(saved.committed,true);assert.equal(saved.snapshot.label,before.label);assert.equal(saved.token.writeRevision,1);assert.deepEqual(originalRng.snapshot(),rng);checks++;
 const read=await bound.get(0);assert.deepEqual(read.snapshot,before);assert.deepEqual(read.token,saved.token);
 const admitted=admitSavedScenario(read.snapshot,{data:content.data,content,world:environment.world});const restored=await prepareScenario({...admitted,mode:'restore',content,world:environment.world});
 assert.deepEqual(restored.metadata,prepared.metadata);assert.deepEqual(originalRng.snapshot(),rng);checks++;
 read.snapshot.label='overwrite';const written=await bound.put(read.snapshot,read.token);assert.equal(written.token.writeRevision,2);assert.equal(written.token.recordId,read.token.recordId);
 await assert.rejects(()=>bound.put(before,read.token),/changed/);assert.equal((await bound.get(0)).snapshot.label,'overwrite');checks++;
 await assert.rejects(()=>bound.put(before),/changed/);assert.equal(memory.stats.deletes.length,0);checks++;
 for(const change of [s=>{s.played=false;},s=>{s.scenario_idx=1;},s=>delete s.webMeta.scenarioAssembly.content.publication,s=>{s.webMeta.scenarioAssembly.content.publication.releaseId=R2;},s=>{s.webMeta.scenarioAssembly.content.publication.ordinal='1.1';},s=>{s.webMeta.scenarioAssembly.content.revision='c'.repeat(64);},s=>{s.webMeta.originalRng.index=999;},s=>{s.slot=-1;},s=>{s.state.nativeFactionSlots=[];}]){
   const bad=structuredClone(before);change(bad);const prior=memory.records();await assert.rejects(()=>bound.put(bad,written.token));assert.deepEqual(memory.records(),prior);checks++;
 }
 for(const patch of [{gameId:R2},{manifestDigest:'bad'},{ordinal:'1.9007199254740992'},{releaseId:R2},{ordinal:'1.1'},{chapterId:G+'#other'}]){
   const opens=memory.stats.opens.length;assert.throws(()=>createPlayerSaveStore({environment:{...environment,identity:{...identity,...patch}},store}));assert.equal(memory.stats.opens.length,opens);checks++;
 }
 {
   const secondIdentity={...identity,releaseId:R2,ordinal:'1.1'},secondChapter={...chapter,reference:{...chapter.reference,publication:{releaseId:R2,ordinal:'1.1'}}};
   const other=createPlayerSaveStore({environment:{...environment,identity:secondIdentity,content:{...content,chapter:()=>secondChapter,resolveReference:()=>null}},store});
   const beforeRecords=memory.records();await assert.rejects(()=>other.get(0),/identity mismatch/);assert.deepEqual(memory.records(),beforeRecords);assert.equal((await other.list())[0].releaseId,R);assert.equal(Object.hasOwn(other,'compareDelete'),false);checks++;
 }
 {
   const prior=memory.records();memory.configure({failAt:3,outcome:'abort'});await assert.rejects(()=>bound.put(before,written.token),/abort/);memory.configure({});assert.deepEqual(memory.records(),prior);checks++;
 }
 {
   let release;const waiting=new Promise(resolve=>{release=resolve;});
   const delayed=createPlayerSaveStore({environment,store:{...store,get:async slot=>{const value=await store.get(slot);await waiting;return value;}}});
   const getting=delayed.get(0);retired=true;release();await assert.rejects(getting,/retired/);retired=false;checks++;
 }
 {
   let finish,entered;const ready=new Promise(resolve=>{entered=resolve;});const gate=new Promise(resolve=>{finish=resolve;});
   const delayed=createPlayerSaveStore({environment,store:{...store,put:async(input,expected)=>{entered();await gate;return store.put(input,expected);}}});
   const writing=delayed.put(before,written.token);await ready;retired=true;finish();const receipt=await writing;
   assert.equal(receipt.committed,true);assert.equal(receipt.token.writeRevision,3);retired=false;assert.equal((await bound.get(0)).snapshot.label,before.label);checks++;
 }
 for(const patch of [{releaseId:R2},{releaseOrdinal:1},{chapterId:G+'#other'},{manifestDigest:'f'.repeat(64)}]){
   const owned=gameSaveMemoryIDB(),otherStore=createGameSaveStore({gameId:G,databaseName:'owned-mismatched-save',getIndexedDB:()=>owned.indexedDB});
   await otherStore.put({...bound.identity,slot:0,snapshot:before,...patch});const prior=owned.records();
   await assert.rejects(()=>createPlayerSaveStore({environment,store:otherStore}).get(0),/identity mismatch/);assert.deepEqual(owned.records(),prior);assert.equal(owned.stats.deletes.length,0);checks++;
 }
 {
   let release,entered,first=true;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
   const world=fixture.context().world,delayed=createPlayerSaveStore({environment:{...environment,world},store});
   const prior=memory.records();globalThis.fetch=async input=>{if(first){first=false;entered();await gate;}return fixture.fetch(input);};
   try{const writing=delayed.put(before,(await store.get(0)).token);await ready;retired=true;release();await assert.rejects(writing,/retired/);assert.deepEqual(memory.records(),prior);checks++;}
   finally{release();retired=false;globalThis.fetch=fixture.fetch;}
 }
 const backup=await bound.exportBackup(0),sourceRecord=await store.get(0);
 {
   const receipt=await bound.importBackup(backup,12),imported=await store.get(12);
   assert.equal(receipt.committed,true);assert.deepEqual(receipt.snapshot,{...before,slot:12});
   assert.notEqual(imported.token.recordId,sourceRecord.token.recordId);assert.equal(imported.token.writeRevision,4);
   assert.deepEqual(await store.get(0),sourceRecord);assert.deepEqual(originalRng.snapshot(),rng);checks++;
   const prior=memory.records();await assert.rejects(()=>bound.importBackup(backup,12),/changed/);
   await assert.rejects(()=>bound.importBackup(backup,-1));await assert.rejects(()=>bound.importBackup('{}',13));
   await assert.rejects(()=>bound.exportBackup(999),/empty/);assert.deepEqual(memory.records(),prior);checks++;
   memory.configure({failAt:3,outcome:'abort'});await assert.rejects(()=>bound.importBackup(backup,13),/abort/);
   memory.configure({});assert.deepEqual(memory.records(),prior);checks++;
 }
 for(const operation of ['exportBackup','importBackup']) {
   let release,entered,first=true;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
   const world=fixture.context().world,delayed=createPlayerSaveStore({environment:{...environment,world},store});
   const prior=memory.records();globalThis.fetch=async input=>{if(first){first=false;entered();await gate;}return fixture.fetch(input);};
   try {
     const pending=operation==='exportBackup'?delayed.exportBackup(0):delayed.importBackup(backup,13);
     await ready;retired=true;release();await assert.rejects(pending,/retired/);assert.deepEqual(memory.records(),prior);checks++;
   } finally {release();retired=false;globalThis.fetch=fixture.fetch;}
 }
 {
   let finish,entered;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{finish=resolve;});
   const delayed=createPlayerSaveStore({environment,store:{...store,put:async(input,expected,options)=>{entered();await gate;return store.put(input,expected,options);}}});
   const importing=delayed.importBackup(backup,13);await ready;retired=true;finish();const receipt=await importing;
   assert.equal(receipt.committed,true);assert.equal(receipt.snapshot.slot,13);retired=false;
   assert.deepEqual(await store.get(0),sourceRecord);assert.equal((await store.get(13)).token.recordId,receipt.token.recordId);checks++;
 }
 retired=true;const opens=memory.stats.opens.length;await assert.rejects(()=>bound.get(0),/retired/);await assert.rejects(()=>bound.put(before),/retired/);await assert.rejects(bound.list,/retired/);await assert.rejects(()=>bound.exportBackup(0),/retired/);await assert.rejects(()=>bound.importBackup(backup,14),/retired/);assert.equal(memory.stats.opens.length,opens);retired=false;checks++;
 assert.deepEqual(memory.records().find(([key])=>key==='slots'),['slots',{ownedLegacy:true}]);assert.equal(memory.stats.deletes.length,0);assert.deepEqual(originalRng.snapshot(),rng);fixture.verify();checks++;
 process.stdout.write(JSON.stringify({checks,scope:'Bound formal identity and unchanged full snapshot/JSON/detached restore; owned IDB mock CAS/abort/late completion, no real browser or version-deletion permission'})+'\n');
}finally{globalThis.fetch=nativeFetch;fixture.verify();}
