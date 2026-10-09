// Actual isolated Worker + R2 + SQLite and NodeHTTPS. No production copy/save route installed.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { Worker } from 'node:worker_threads';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
const { Miniflare } = await import(pathToFileURL(process.env.MINIFLARE_MODULE).href);
const d = '.dragon-analysis/editor-phase/backend-provenance-session-r1/', own = mkdtempSync(join(tmpdir(),'dragon-copy-profile-')), origin = 'https://127.0.0.1:8787';
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex'), nextPassword = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function json(bytes) { try { return JSON.parse(bytes); } catch(cause) { throw new Error('invalid owned fixture JSON',{cause}); } }
const files=['server/copyprofile.js','tools/editor_trusted_copy.mjs','tools/verify_editor_backend_copy_profile.mjs',d+'fixture-worker.js','server/snapshots.js','tools/editor_local_https.mjs','.dragon-analysis/editor-phase/backend-snapshot-session-r1/encode-worker.mjs'];
const sourceHashes=Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));let mf,frontend,bucket;
function build(setting) { return new Miniflare({name:'copy-profile-fixture',modules:true,scriptPath:resolve(d+'fixture-worker.js'),compatibilityDate:'2026-01-01',compatibilityFlags:['nodejs_compat'],modulesRules:[{type:'ESModule',include:['**/*.js']},{type:'Text',include:['**/*.html','**/*.txt','**/*.css']}],host:'127.0.0.1',port:0,https:false,durableObjects:{EDITOR_METADATA:{className:'CopyFixture',useSQLite:true}},durableObjectsPersist:join(own,'metadata'),r2Buckets:['EDITOR_BLOBS'],r2Persist:join(own,'blobs'),bindings:{EDITOR_ORIGIN:origin,EDITOR_DEFAULT_PASSWORD:initial,EDITOR_REQUEST_KEY:secret,EDITOR_ACCOUNT_LIMIT:'50',EDITOR_SOURCE_LIMIT:'100',FIXTURE_COPY:JSON.stringify(setting??{})}}); }
const calls=[];
async function call(path,value,session,overrides={}) {
  const headers={'Content-Type':'application/json',Origin:origin,'Idempotency-Key':randomUUID(),...overrides};if(session){headers.Cookie=session.cookie;headers['X-CSRF-Token']=session.csrf;Object.assign(headers,overrides);}
  const payload=JSON.stringify(value);headers['Content-Length']=Buffer.byteLength(payload);
  const response=await new Promise((done,reject)=>{const req=httpsRequest(origin+path,{method:'POST',headers,rejectUnauthorized:false,agent:false},res=>{const chunks=[];res.on('data',p=>chunks.push(p));res.on('error',reject);res.on('end',()=>done({status:res.statusCode,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],data:json(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(payload);});calls.push({path,status:response.status});return response;
}
const fixture=(v,s,o)=>call('/api/fixture/copy',v,s,o);
async function login(account) { const r=await call('/api/auth/login',{account,password:initial});assert.equal(r.status,200);const changed=await call('/api/auth/password',{oldPassword:initial,newPassword:password},{cookie:r.cookie,csrf:r.data.csrf});assert.equal(changed.status,200);return{cookie:changed.cookie,csrf:changed.data.csrf,user:changed.data.user}; }
async function put(bytes) { const descriptor={sha256:sha(bytes),byteLength:bytes.length},key='fixture-copy/'+descriptor.sha256,existing=await bucket.get(key);if(existing){const b=new Uint8Array(await existing.arrayBuffer());assert.equal(b.length,bytes.length);assert.equal(sha(b),descriptor.sha256);}else assert.notEqual(await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}}),null);return descriptor; }
async function encode(game) { const w=new Worker(pathToFileURL(resolve('.dragon-analysis/editor-phase/backend-snapshot-session-r1/encode-worker.mjs')));try{const result=new Promise((done,reject)=>{w.once('message',m=>m.error?reject(new Error(m.error)):done(m.parts));w.once('error',reject);w.once('exit',code=>{if(code!==0)reject(new Error('owned encoder exited'));});});w.postMessage(game);return await result;}finally{await w.terminate();} }
async function stage(game) { const parts=await encode(game),h=createHash('sha256'),chunks=[];for(const part of parts){h.update(part);chunks.push(await put(part));}const index={schema:'dragon-game-source-index-1',gameId:game.gameId,sourceDigest:h.digest('hex'),sourceByteLength:parts.reduce((n,p)=>n+p.length,0),chunks,dependencies:[]};return{root:await put(Buffer.concat(encodeSourceChunks(index))),index}; }
const checks=[];
try{
  mf=build();await mf.ready;frontend=await createEditorHTTPS(mf);bucket=await mf.getR2Bucket('EDITOR_BLOBS');
  const admin=await login('tianyi');assert.equal((await call('/api/admin/accounts',{account:'author_a'},admin)).status,200);const author=await login('author_a');
  let record=0;const profile=new FixedCopyProfile({loadCopy:createPinnedCopyLoader({allocateEntityId:()=> 'worker-source-record-'+ ++record})});
  const captured=await profile.capture({gameId:'fixture-copy-'+randomUUID(),ownerId:admin.user.id}),baseline=captured.game;
  const id=baseline.chapterOrder[0],f=baseline.chapters[id].state.factions[0];
  const changed=editChapterResources(baseline,id,0,{money:f.money+1,reserve_cav:f.reserve_cav+1,reserve_arc:f.reserve_arc+1,reserve_inf:f.reserve_inf+1});
  const bad={...baseline,chapters:{...baseline.chapters,[id]:{...baseline.chapters[id],state:{...baseline.chapters[id].state,n_factions:baseline.chapters[id].state.n_factions+1}}}};
  // Stage before the transient content capture. Host-only privileged bootstrap; never author upload permission.
  const original=await stage(baseline),accepted=await stage(changed),rejected=await stage(bad);
  assert.equal(original.index.sourceDigest,captured.baselineDigest);
  const setting={gameId:baseline.gameId,ownerId:admin.user.id,metadata:baseline.metadata,candidateMetadata:baseline.metadata,root:original.root,sourceDigest:captured.baselineDigest,provenance:captured.provenance};
  await frontend.close();frontend=undefined;await mf.dispose();mf=undefined;mf=build(setting);await mf.ready;frontend=await createEditorHTTPS(mf);bucket=await mf.getR2Bucket('EDITOR_BLOBS');
  assert.equal((await fixture({action:'capture'},author)).status,403);assert.equal((await fixture({action:'capture'},admin,{Origin:'http://127.0.0.1:8787'})).status,403);assert.equal((await fixture({action:'capture'},admin,{'X-CSRF-Token':'wrong'})).status,403);
  const ticket=await fixture({action:'capture'},admin);assert.equal(ticket.status,200,ticket.data.error);assert.equal(ticket.data.baselineDigest,captured.baselineDigest);
  checks.push('actual pinned41Web inputs sharedcopy/source-record IDs -> host immutable R2 bootstrap -> actual streamed Worker baseline/private content capability; separate from persistent author permission');
  const request={action:'verify',ticket:ticket.data.ticket,source:accepted.root};const good=await fixture(request,admin);assert.equal(good.status,200,good.data.error);assert.equal(good.data.changes,1);assert.equal(good.data.sourceDigest,accepted.index.sourceDigest);assert.equal(good.data.baselineDigest,captured.baselineDigest);
  checks.push('actual full-source R2 candidate and standard shared four-resource writer pass precise9byte difference; distinct old/new digests, no byte/role initialization repair');
  assert.equal((await fixture({...request,source:rejected.root},admin)).status,422);assert.equal((await fixture({...request,source:{...accepted.root,valid:true}},admin)).status,422);assert.equal((await fixture({...request,ticket:{}},admin)).status,404);assert.equal((await fixture(request,author)).status,403);
  checks.push('actual source semantic count modification/self-asserted validity/serialized capability/cross-author role controls reject; private capture map not content storage');
  const switched=await call('/api/auth/password',{oldPassword:password,newPassword:nextPassword},admin);assert.equal(switched.status,200);const renewed={cookie:switched.cookie,csrf:switched.data.csrf,user:switched.data.user};assert.equal((await fixture(request,admin)).status,401);assert.equal((await fixture(request,renewed)).status,401);
  checks.push('real SQLite password/epoch revocation invalidates existing capture with old and new sessions; new cookie never revives old capture');
  await frontend.close();frontend=undefined;await mf.dispose();mf=undefined;mf=build(setting);await mf.ready;frontend=await createEditorHTTPS(mf);const lost=await fixture(request,renewed);assert.equal(lost.status,404);assert.equal(lost.data.error,'FIXTURE_CAPTURE_LOST');
  const fresh=await fixture({action:'capture'},renewed);assert.equal(fresh.status,200,fresh.data.error);assert.equal((await fixture({...request,ticket:fresh.data.ticket},renewed)).status,200);
  checks.push('actual Worker restart loses transient capture instead of reconstructing from DTO, retains verified R2 baseline/candidate/SQL session; explicit recapture required');
  assert.equal((await call('/api/games/'+baseline.gameId+'/draft',{source:accepted.root},renewed)).status,404);checks.push('ordinary production source copy/draft/upload/compiler/publish ports remain closed; no marker/origin or role weakening');
  for(const[p,h]of Object.entries(sourceHashes))assert.equal(sha(readFileSync(p)),h);
  process.stdout.write(JSON.stringify({result:'PASS-REAL-WORKER-R2-COPY-CONTENT-PROFILE',checks,calls,sourceBytes:original.index.sourceByteLength,chunks:original.index.chunks.length,inputHashes:captured.provenance.inputHashes,sourceHashes,limits:'Own NodeTLS/workerd/SQLite/R2 content fixture and privileged pinned bootstrap only, not production/persistent trusted registry, authenticated copy admission, image/runtime/Q69/SLA or permission to run arbitrary signed24/u16. No game rows created/saved/published, no deployment/cloudresourcecreation/user state.'},null,2)+'\n');
}finally{await frontend?.close();await mf?.dispose();}
