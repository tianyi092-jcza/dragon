// Actual owned full-copy compiler -> frozen publication -> reader/client ->
// Blob URL pack -> unchanged world loaders. Memory R2/fixed provider date and
// local static bytes; not browser App, gameplay, save or cloud certification.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPublicationBrowserAuthority } from './fixtures/publication-browser-authority.mjs';
import { makePublishRuntimeStage } from './fixtures/publish-runtime-stage.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
import reader from '../reader/worker.js';
import { createPlayerReader } from '../reader/playerclient.js';
import { loadPlayerPack } from '../reader/playerpack.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { createPlayerEnvironment } from '../reader/playerenvironment.js';
import { prepareScenario, assertAssemblyIdentity, snapshotScenarioAssembly, readSavedAssembly } from '../web/src/game/scenarioassembly.js';
import { portraitURL } from '../web/src/core/assets.js';
import { createPlayerSaveStore } from '../reader/playersaves.js';
import { createPlayerSaveRepository } from '../reader/playerrepository.js';
import { createGameSaveStore } from '../web/src/core/gamesavestore.js';
import { gameSaveMemoryIDB } from './gamesave_mock.mjs';
import { snapshotState, admitSavedScenario } from '../web/src/game/savegame.js';
import { Clock } from '../web/src/game/clock.js';
import { loadPlayerChapters, admitPlayerChapter } from '../web/src/player/playerchapters.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
const environmentMode=process.argv.includes('--environment'),savesMode=process.argv.includes('--saves'),repositoryMode=process.argv.includes('--repository'),chaptersMode=process.argv.includes('--chapters'),portraitMode=process.argv.includes('--portrait');
if(process.argv.slice(2).some(arg=>!['--environment','--saves','--repository','--chapters','--portrait'].includes(arg))||savesMode&&!environmentMode||repositoryMode&&!savesMode||portraitMode&&!savesMode)throw new TypeError('unknown or incomplete arguments');
const own=mkdtempSync(join(tmpdir(),'dragon-player-pack-')),origin='https://owned-editor.invalid',playerOrigin='https://owned-player.invalid';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let authority,pack,session,formalSaves,saveReceipt,saveMemory,repository,chapterPreview,checks=0,rootWrites=0,staticReads=0,assetReads=0;
try {
  const staticRoot=join(own,'static');const staged=makePublishRuntimeStage({root:staticRoot});mkdirSync(join(own,'authority'));
  authority=await createPublicationBrowserAuthority({root:join(own,'authority'),origin,runtimeStager:staged.stager,nodeService:true});
  const login=await authority.fetch(new Request(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':'owned-pack-login-001'},body:JSON.stringify({account:authority.account,password:authority.password})}));
  assert.equal(login.status,200);const user=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
  if(portraitMode){
    const headers={Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':user.csrf};
    const path=origin+'/api/games/'+authority.gameId+'/draft';
    const initial=await authority.fetch(new Request(path+'?revision=1',{headers}));assert.equal(initial.status,200);
    const before=await initial.json(),body={metadata:before.metadata,resourceEdits:[],chapterEdits:[{op:'portrait',chapterId:authority.chapters[0],generalIdx:0,portraitKey:'p0001'}]};
    const saved=await authority.fetch(new Request(path+'/save',{method:'POST',headers:{...headers,'If-Match':'"1"','Idempotency-Key':'owned-pack-portrait-001'},body:JSON.stringify(body)}));
    assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).draftRevision,'2');
    const current=await authority.fetch(new Request(path+'?revision=2',{headers}));assert.equal(current.status,200);
    const expected=structuredClone(before.chapters);expected[0].generals.find(row=>row.idx===0).portraitKey='p0001';
    assert.deepEqual((await current.json()).chapters,expected);
    const old=await authority.fetch(new Request(path+'?revision=1',{headers}));assert.equal(old.status,200);assert.deepEqual(await old.json(),before);checks++;
  }
  const published=await authority.fetch(new Request(origin+'/api/publish',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':user.csrf,'Idempotency-Key':'owned-pack-publish-001'},body:JSON.stringify({gameId:authority.gameId,name:'Own pack'})}));
  assert.equal(published.status,200,await published.clone().text());checks++;
  const headers=object=>({...object.headers,etag:'"'+sha(object.bytes)+'"','last-modified':'Thu, 01 Jan 2037 00:00:00 GMT'});
  const r2={
    async get(key,{maxBytes}){const object=staged.objects.get(key);if(!object)return null;assert.ok(object.bytes.length<=maxBytes);return{bytes:Buffer.from(object.bytes),headers:headers(object)};},
    async putImmutable(key,bytes,type){assert.ok(key.startsWith(staged.prefix+'projections/')||key.startsWith(staged.prefix+'control/roots/')||key.startsWith(staged.prefix+'control/receipts/'));if(!staged.objects.has(key))staged.objects.set(key,{bytes:Buffer.from(bytes),headers:{'content-type':type}});},
    async putControl(key,bytes,etag){assert.equal(key,staged.prefix+'control/current.json');const old=staged.objects.get(key);if((old?headers(old).etag:null)!==etag)return false;rootWrites++;staged.objects.set(key,{bytes:Buffer.from(bytes),headers:{'content-type':'application/json'}});return true;}
  };
  const publisher=createDistributionPublisher({storage:authority.storage,r2,prefix:staged.prefix,verifyStaticResources:staged.verifyStaticResources});
  assert.equal((await publisher.drainOne()).state,'VISIBLE_CONFIRMED');await authority.manage('list');assert.equal((await publisher.drainOne()).state,'VISIBLE_CONFIRMED');assert.equal(rootWrites,2);checks++;
  const env={PLAYER_ORIGIN:playerOrigin,PLAYER_ADMISSION_ACTIVE_KEY:'owned',PLAYER_ADMISSION_KEYS:JSON.stringify({owned:'a'.repeat(64)}),PUBLISH_BUCKET:{async get(key){const object=staged.objects.get(staged.prefix+key);if(!object)return null;return{size:object.bytes.length,uploaded:new Date('2037-01-01T00:00:00.000Z'),httpMetadata:{contentType:object.headers['content-type']},arrayBuffer:async()=>Uint8Array.from(object.bytes).buffer};}}};
  const client=createPlayerReader({origin:playerOrigin,fetch:(url,init)=>reader.fetch(new Request(url,init),env)});
  if(chaptersMode){
    const current=(await client.registry()).directory.find(entry=>entry.gameId===authority.gameId);
    chapterPreview=await loadPlayerChapters({reader:client,selection:current});
    assert.equal(chapterPreview.chapters.length,20);
    for(const row of chapterPreview.chapters){const raw=JSON.parse(authority.storage.sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?',authority.gameId,row.chapterId).toArray()[0].state_json);assert.deepEqual(row,{chapterId:row.chapterId,name:raw.name,start:raw.start});}
    assert.deepEqual(chapterPreview.chapters.map(row=>row.chapterId),authority.chapters);checks++;
    session=await admitPlayerChapter({reader:client,selection:chapterPreview.selection,chapterId:authority.chapters[0]});
    assert.equal(session.identity.manifestDigest,chapterPreview.selection.manifestDigest);checks++;
  }else session=await client.admit({gameId:authority.gameId,ordinal:'1.0',chapterId:authority.chapters[0]});
  const readStatic=async(path,{maxBytes})=>{assert.match(path,/^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/map_(atlas|tiles)_(spring|summer|autumn|winter)\.png$/);staticReads++;const bytes=readFileSync(join(staticRoot,'dist',path));assert.ok(bytes.length<=maxBytes);return{bytes,contentType:'image/png',sha256:sha(bytes)};};
  pack=await loadPlayerPack({session,compilerRevision:TRIAL_COMPILER_REVISION,maxTotalBytes:128*1024*1024,readStatic});
  assert.equal(staticReads,8);assert.equal(pack.identity.releaseId,session.identity.releaseId);assert.equal(pack.identity.ordinal,'1.0');assert.equal(pack.manifest.chapters.length,20);
  const sql=authority.storage.sql;assert.equal(JSON.stringify(pack.chapter),sql.exec('SELECT state_json FROM published_pack_chapters WHERE game_id=? AND chapter_id=?',authority.gameId,authority.chapters[0]).toArray()[0].state_json);
  const declarations=[...pack.manifest.assets,...pack.manifest.minimapAssets,...pack.manifest.portraits];assert.equal(declarations.length,152+(portraitMode?1:0));assert.equal(Object.keys(pack.resourceURLs).length,160+(portraitMode?1:0));
  if(portraitMode){
    const declaration=pack.manifest.portraits.find(row=>row.assetId==='p0001');assert.ok(declaration);
    const bytes=readFileSync('web/kao/p0001.png');assert.equal(declaration.sha256,sha(bytes));assert.equal(declaration.byteLength,bytes.length);
    assert.equal(pack.chapter.generals.find(row=>row.idx===0).portraitKey,'p0001');checks++;
  }
  for(const entry of declarations){const response=await fetch(pack.resourceURLs['asset:'+entry.assetId]);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(sha(bytes),entry.sha256);assert.equal(bytes.length,entry.byteLength);assetReads++;}checks++;
  const assets=Object.fromEntries(['terrain','roadGraph','roadCost','roadOffset'].map(id=>[id,pack.resourceURLs['asset:'+id]]));
  const world=createWorldResources({...pack.manifest.world,assets},{assertCurrent:pack.assertCurrent});
  const roads=await world.roads.loadRoadGraph(),terrain=await world.terrain.loadTerrain();
  assert.equal(roads.version,2);assert.equal(roads.nodes.length,192);assert.equal(sha(terrain),pack.manifest.assets.find(a=>a.assetId==='terrain').sha256);checks++;
  if(environmentMode){
    const before=JSON.stringify(pack.chapter),player=pack.chapter.factions[0].idx;
    const environment=createPlayerEnvironment(pack,{playerFaction:player});
    assert.equal(environment.raw.player_faction,player);assert.equal(JSON.stringify(pack.chapter),before);
    assert.equal(environment.content.revision,pack.identity.sourceDigest);assert.equal(environment.world.definition.revision,pack.identity.sourceDigest);
    for(const general of environment.raw.generals)if(general.portraitKey)assert.equal(portraitURL(general,environment.world),pack.resourceURLs['asset:'+general.portraitKey]);
    if(portraitMode){
      const overridden=environment.raw.generals.filter(general=>general.portraitKey==='p0001');assert.equal(overridden.length,1);assert.equal(overridden[0].idx,0);
      assert.equal(portraitURL(overridden[0],environment.world),pack.resourceURLs['asset:p0001']);
      assert.equal(overridden[0].portrait,pack.chapter.generals.find(general=>general.idx===0).portrait);checks++;
    }
    const prepared=await prepareScenario({raw:environment.raw,idx:0,mode:'fresh',content:environment.content,world:environment.world});
    environment.assertCurrent();assert.equal(prepared.metadata.roadVersion,2);assert.equal(prepared.scenario.cities.length,192);
    assert.deepEqual(prepared.metadata.content.publication,{releaseId:pack.identity.releaseId,ordinal:'1.0'});
    const sidecar=snapshotScenarioAssembly({scenario:prepared.scenario,scenarioIdx:0,content:environment.content,world:environment.world});
    let roundTrip;try{roundTrip=JSON.parse(JSON.stringify(sidecar));}catch{throw new Error('owned metadata JSON round trip');}
    const copied=readSavedAssembly({state:{},webMeta:roundTrip}).metadata;
    assert.deepEqual(copied,prepared.metadata);assertAssemblyIdentity(copied,0,environment.content,environment.world);
    for(const change of [p=>delete p.publication,p=>{p.publication.ordinal='1.1';},p=>{p.publication.releaseId=authority.gameId;}]){const wrong=structuredClone(copied);change(wrong.content);assert.throws(()=>assertAssemblyIdentity(wrong,0,environment.content,environment.world),/content identity/);}
    assert.equal(JSON.stringify(pack.chapter),before);checks++;
    if(savesMode){
      saveMemory=gameSaveMemoryIDB();const store=createGameSaveStore({gameId:pack.identity.gameId,databaseName:'owned-compiled-formal-saves',getIndexedDB:()=>saveMemory.indexedDB});
      formalSaves=createPlayerSaveStore({environment,store});
      const scenario=prepared.scenario,clock=new Clock({startYear:scenario.start.year,startMonth:scenario.start.month,startDay:scenario.start.day}),originalRng=createOriginalBattleRng({ch:1,cl:2,dh:3});
      const saved=snapshotState({data:environment.content.data,content:environment.content,world:environment.world,scenario,scenarioIdx:0,clock,originalRng},0,'正式版存檔');
      const rngBefore=originalRng.snapshot();saveReceipt=await formalSaves.put(saved);assert.equal(saveReceipt.committed,true);
      const reread=await formalSaves.get(0);assert.deepEqual(reread.snapshot,saved);assert.deepEqual(reread.token,saveReceipt.token);
      // Actual portable JSON round trip, not structuredClone, before cold admission.
      const portable=JSON.parse(JSON.stringify(reread.snapshot));
      assert.deepEqual(portable,reread.snapshot);
      const admitted=admitSavedScenario(portable,{data:environment.content.data,content:environment.content,world:environment.world});
      const restored=await prepareScenario({...admitted,content:environment.content,world:environment.world,mode:'restore'});
      assert.deepEqual(restored.metadata,prepared.metadata);assert.deepEqual(originalRng.snapshot(),rngBefore);assert.equal((await store.get(0)).record.releaseId,pack.identity.releaseId);checks++;
      if(portraitMode){
        const general=restored.scenario.generals.find(row=>row.idx===0);
        assert.equal(general.portraitKey,'p0001');assert.equal(general.portrait,pack.chapter.generals.find(row=>row.idx===0).portrait);
        assert.equal(portraitURL(general,environment.world),pack.resourceURLs['asset:p0001']);checks++;
      }
    }
  }
  const originalURL=pack.resourceURLs['asset:terrain'];await authority.manage('unlist');assert.equal((await publisher.drainOne()).state,'VISIBLE_CONFIRMED');assert.equal((await session.status()).listed,false);pack.assertCurrent();assert.equal((await fetch(originalURL)).status,200);checks++;
  if(chaptersMode){await assert.rejects(()=>admitPlayerChapter({reader:client,selection:chapterPreview.selection,chapterId:authority.chapters[0]}),e=>e.code==='GAME_NOT_LISTED');pack.assertCurrent();checks++;}
  if(savesMode){saveReceipt=await formalSaves.put(saveReceipt.snapshot,saveReceipt.token);assert.equal(saveReceipt.committed,true);assert.equal(saveReceipt.token.writeRevision,2);assert.equal((await formalSaves.get(0)).token.savedReleaseId,pack.identity.releaseId);checks++;}
  if(repositoryMode){
    repository=createPlayerSaveRepository({saves:formalSaves,assertCurrent:pack.assertCurrent});
    const loaded=await repository.load();assert.deepEqual(loaded.slots.find(s=>s.slot===0),saveReceipt.snapshot);
    const changed={...saveReceipt.snapshot,label:'App形狀覆寫'};assert.deepEqual(await repository.put(changed),changed);
    const read=await repository.get(0);assert.deepEqual(read,changed);assert.equal((await formalSaves.get(0)).token.writeRevision,3);checks++;
    const added=await repository.add(changed);assert.equal(added.slot,4);assert.deepEqual(await repository.get(4),added);
    const observed=await formalSaves.get(0);await formalSaves.put({...observed.snapshot,label:'另一觀察者'},observed.token);
    const before=saveMemory.records();await assert.rejects(()=>repository.put(changed),/changed/);assert.deepEqual(saveMemory.records(),before);checks++;
  }
  await authority.manage('delete');assert.equal((await publisher.drainOne()).state,'VISIBLE_CONFIRMED');await assert.rejects(session.status(),e=>e.code==='GAME_DELETED');assert.throws(pack.assertCurrent,e=>e.code==='GAME_DELETED');
  if(savesMode){const before=saveMemory.records();await assert.rejects(()=>formalSaves.get(0),e=>e.code==='GAME_DELETED');await assert.rejects(()=>formalSaves.put(saveReceipt.snapshot,saveReceipt.token),e=>e.code==='GAME_DELETED');assert.deepEqual(saveMemory.records(),before);assert.equal(saveMemory.stats.deletes.length,0);checks++;}
  if(repositoryMode){const before=saveMemory.records();await assert.rejects(repository.load,e=>e.code==='GAME_DELETED');await assert.rejects(()=>repository.put(saveReceipt.snapshot),e=>e.code==='GAME_DELETED');assert.deepEqual(saveMemory.records(),before);checks++;}
  // A downloaded Blob is not DRM. Explicit owner cleanup, not HTTP410 alone,
  // revokes it; the future engine exit must call close before discarding a pack.
  assert.equal((await fetch(originalURL)).status,200);pack.close();await assert.rejects(fetch(originalURL));pack=null;checks++;
  process.stdout.write(JSON.stringify({checks,environmentMode,savesMode,repositoryMode,chaptersMode,portraitMode,chapters:20,assetReads,staticReads,rootWrites,scope:savesMode?'actual admitted formal snapshot/owned mock store/common detached restore, unlist-save and explicit-delete refusal; memory R2/fixed time, no browser App/native IDB/version-delete UI':'actual compiler/shared Node authority/default publisher/reader/client and unchanged world road/terrain loaders; memory R2/fixed time, native Node Blob URLs, no browser engine or formal saves'})+'\n');
} finally {pack?.close();session?.close();authority?.storage.close();rmSync(own,{recursive:true,force:true});}
