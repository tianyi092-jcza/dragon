// REAL new default + REAL archived saved draft after switch, owned OS store only.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {BUILTIN_RELEASE} from '../web/src/content/builtinrelease.generated.js';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {BUILTIN_ENTITY_HISTORY} from '../web/src/editor/builtinentityhistory.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource,readEntitySourceForDraft} from './editor_entity_source.mjs';
import {decodeEntitySource} from '../web/src/editor/entitysource.js';
import {copyBuiltinGame} from '../web/src/content/authoring/gamesource.js';
import {copyEntitySourceRecords} from '../web/src/editor/entitycopy.js';
import {startEditorServer} from './editor_server.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function json(b){try{return JSON.parse(String(b));}catch(cause){throw new TypeError('invalid upgrade fixture',{cause});}}
assert.strictEqual(BUILTIN_RELEASE.resources,BUILTIN_RESOURCES);assert.strictEqual(BUILTIN_RELEASE.entitySource,BUILTIN_ENTITY_SOURCE);assert.ok(Object.isFrozen(BUILTIN_RELEASE.entitySource.resource));
const current=readInstalledEditorSource(),currentBundle=await readInstalledEntitySource();assert.deepEqual([current.chapters[14].state.start.year,current.chapters[15].state.start.year],[264,266]);
const tuple=BUILTIN_ENTITY_HISTORY[0],d=tuple.descriptor,prefix=tuple.dataURL.replace(/data\.json$/,'');assert.notEqual(tuple.sourceRevision,current.revision);
const oldResources={...BUILTIN_RESOURCES,world:json(readFileSync(new URL('../web/'+prefix+'world-definition.json',import.meta.url))),catalogURL:prefix+'catalog.json',dataURL:tuple.dataURL,sourceURL:prefix+'game-source.json',sourceDigest:'65ef2263b4587cb3d831e926ce5c9ada97462ce8aa2222bd9fa8c68c1ffcd986',geographyReview:'APPROVED'},oldSource=readInstalledEditorSource(oldResources);
const oldBundle=await decodeEntitySource(json(readFileSync(new URL('../web/'+d.manifestURL,import.meta.url))),readFileSync(new URL('../web/'+d.resourceURL,import.meta.url)),d,sha);
const old=copyBuiltinGame({gameId:'date-upgrade-old',kind:'full',source:oldSource},sha);let next=0;old.sourceRecords=copyEntitySourceRecords(old,oldSource,oldBundle,d,()=>`preserved-old-${next++}`);
const store=mkdtempSync(join(tmpdir(),'dragon-date-upgrade-'));mkdirSync(join(store,old.gameId));const oldFile=join(store,old.gameId,'gamesource.json');writeFileSync(oldFile,JSON.stringify(old)+'\n');const before=sha(readFileSync(oldFile));
let server;
try{
  server=await startEditorServer(0,store);const origin=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body){const init={headers:{connection:'close'}};if(body!==undefined){init.method='POST';init.headers['content-type']='application/json';init.body=JSON.stringify(body);}const response=await fetch(origin+path,init),data=await response.json();assert.equal(response.status,200,data.error);return data;}
  await call('/api/copy',{gameId:'date-upgrade-new',kind:'full'});const fresh=json(readFileSync(join(store,'date-upgrade-new','gamesource.json')));assert.equal(fresh.sourceRef.revision,current.revision);assert.equal(old.sourceRef.revision,tuple.sourceRevision);assert.notEqual(fresh.sourceRecords.resourceRef.sha256,old.sourceRecords.resourceRef.sha256);
  for(const idx of[14,15]){
    const archived=await call('/api/entity-inspection?game='+old.gameId+'&chapter='+encodeURIComponent(old.chapterOrder[idx]));const updated=await call('/api/entity-inspection?game='+fresh.gameId+'&chapter='+encodeURIComponent(fresh.chapterOrder[idx]));
    assert.equal(archived.templateStart.year,idx===14?8:10);assert.equal(archived.originalStart.year,idx===14?264:266);assert.equal(updated.templateStart.year,updated.originalStart.year);assert.equal(updated.originalStart.year,idx===14?264:266);assert.equal(archived.records.length,128);assert.equal(updated.records.length,128);
    assert.deepEqual(archived.records.map(r=>r.originalRaw32),updated.records.map(r=>r.originalRaw32));assert.equal(archived.resourceRef.sha256,d.resource.sha256);assert.equal(updated.resourceRef.sha256,BUILTIN_ENTITY_SOURCE.resource.sha256);
  }
  const selected=await readEntitySourceForDraft(old);assert.deepEqual(selected.descriptor,d);assert.deepEqual(selected.bundle,oldBundle);assert.deepEqual(currentBundle.chapters,oldBundle.chapters);assert.equal(sha(readFileSync(oldFile)),before);
  const ids=new Set(Object.keys(old.sourceRecords.entities));assert.ok(Object.keys(fresh.sourceRecords.entities).every(id=>!ids.has(id)));
  process.stdout.write(JSON.stringify({result:'PASS-REAL-DEFAULT-AND-ARCHIVE-UPGRADE',oldRevision:tuple.sourceRevision,newRevision:current.revision,originalYears:[264,266],oldDraftYears:[8,10],newDraftYears:[264,266],oldDraftByteUnchanged:true,rawRecordsUnchanged:true,sourceIdsDisjoint:true,immutableReleaseCoherent:true,limits:'Real local API/source upgrade,not browser/App/date progression/remote auth/publish/full goal completion;only owned store'})+'\n');
}finally{if(server)await new Promise(resolve=>server.close(resolve));rmSync(store,{recursive:true,force:true});}
