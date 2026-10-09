// Local copy persistence + async write-tail conflict guards; owned temp only.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startEditorServer} from './editor_server.mjs';
const store=mkdtempSync(join(tmpdir(),'dragon-source-copy-')),server=await startEditorServer(0,store),base=`http://127.0.0.1:${server.address().port}`;
async function post(body){const response=await fetch(base+'/api/copy',{method:'POST',headers:{'content-type':'application/json','connection':'close'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
function draft(id){try{return JSON.parse(readFileSync(join(store,id,'gamesource.json'),'utf8'));}catch(cause){throw new Error('invalid owned draft',{cause});}}
try{
  const body={gameId:'record-copy',ownerId:'owned-test',kind:'full',metadata:{name:'來源副本',introduction:''}};
  const results=await Promise.all([post(body),post(body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const game=draft(body.gameId),records=game.sourceRecords;assert.equal(Object.keys(records.entities).length,2540);assert.equal(Object.keys(records.bindings).length,20);
  for(const id of game.chapterOrder){const b=records.bindings[id];assert.equal(b.targetChapterId,id);assert.equal(b.sourceChapterId,game.chapters[id].sourceChapterId);assert.equal(b.reserved127.runtimeSlot,127);assert.equal(b.completeOriginalRecords.length,128);}
  const saved=JSON.stringify(records);
  const metadataResponse=await fetch(base+'/api/metadata',{method:'POST',headers:{'content-type':'application/json','connection':'close'},body:JSON.stringify({gameId:body.gameId,expectedRevision:'1',metadata:{name:'來源保留',introduction:'唯讀'}})});assert.equal(metadataResponse.status,200);await metadataResponse.json();assert.equal(JSON.stringify(draft(body.gameId).sourceRecords),saved);
  const minimal=await post({gameId:'record-minimal',ownerId:'owned-test',kind:'minimal'});assert.equal(minimal.status,200);assert.equal(draft('record-minimal').sourceRecords,undefined);
  const names=await Promise.all(['name-race-a','name-race-b'].map(gameId=>post({gameId,ownerId:'other-owned-test',kind:'full',metadata:{name:'同名競爭',introduction:''}})));assert.deepEqual(names.map(r=>r.status).sort(),[200,400]);
  const other=draft(names[0].status===200?'name-race-a':'name-race-b');assert.equal(new Set([...Object.keys(records.entities),...Object.keys(other.sourceRecords.entities)]).size,5080);
  process.stdout.write(JSON.stringify({result:'PASS-LOCAL-SOURCE-RECORD-PERSISTENCE-NOT-AUTH-UI',chapters:20,ordinaryRecords:2540,reserved127:20,independentGames:2,identityRaceRejected:1,nameRaceRejected:1,metadataSavePreservesIds:true,minimalNoRecords:true,
    limits:'Single-process synchronous write tail only; not durable multi-process CAS, credentials, actor editing/init/person merge or browser UI'})+'\n');
}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(store,{recursive:true,force:true});}
