// Actual owned Root/SQLite metadata only; no staged bytes, gameplay or DELETE admission.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {startEditorBackend} from './start_editor_backend.mjs';
const d='.dragon-analysis/editor-phase/backend-deletion-definitions-session-r1/',round=process.argv[2];
assert.match(round??'',/^[1-9][0-9]{0,2}$/);
const sha=b=>createHash('sha256').update(b).digest('hex');
function parse(b){try{return JSON.parse(b);}catch(cause){throw new Error('owned definition JSON',{cause});}}
const before=parse(readFileSync(`${d}before.json`));
for(const[p,h]of Object.entries({...before.inputs,...before.imports})){assert.equal(sha(readFileSync(p)),h,p);}
const sourceHashes=Object.fromEntries(['server/deletiondefinitions.js','server/deletionschemaintegrity.js','tools/verify_editor_backend_deletion_definitions.mjs',`${d}fixture-worker.js`,...Object.keys(parse(readFileSync(`${d}generation.json`)).sourceHashes)].map(p=>[p,sha(readFileSync(p))]));
const origin='https://127.0.0.1:8787',own=mkdtempSync(join(tmpdir(),'dragon-definition-')),config=parse(readFileSync('server/wrangler.jsonc')),initial=randomBytes(24).toString('hex'),password=randomBytes(24).toString('hex');
config.main=resolve(`${d}fixture-worker.js`);
writeFileSync(join(own,'wrangler.jsonc'),JSON.stringify(config),{flag:'wx'});
writeFileSync(join(own,'.dev.vars'),`EDITOR_DEFAULT_PASSWORD=${JSON.stringify(initial)}\nEDITOR_REQUEST_KEY=${JSON.stringify(randomBytes(32).toString('hex'))}\n`,{flag:'wx',mode:0o600});
const calls=[],checks=[],observations=[];let server;
async function call(path,value,session,extra={}){
 const headers={Origin:origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()};
 if(session){headers.Cookie=session.cookie;headers['X-CSRF-Token']=session.csrf;}
 Object.assign(headers,extra);
 const r=await new Promise((done,reject)=>{
  const req=httpsRequest(origin+path,{method:value===undefined?'GET':'POST',headers,rejectUnauthorized:false,agent:false},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',reject);
   res.on('end',()=>{try{done({status:res.statusCode,data:parse(Buffer.concat(chunks)),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});}catch(error){reject(error);}});
  });
  req.on('error',reject);req.end(value===undefined?undefined:JSON.stringify(value));
 });
 calls.push({path,status:r.status});return r;
}
async function ok(path,value,session,extra){const r=await call(path,value,session,extra);assert.equal(r.status,200,r.data.error);return r.data;}
const action=(v,s,extra)=>ok('/api/test/definitions',v,s,extra),raw=(v,s,extra)=>call('/api/test/definitions',v,s,extra);
async function rejected(v,s,status,code,extra){const r=await raw(v,s,extra);assert.equal(r.status,status,r.data.error);assert.equal(r.data.error,code);}
async function login(account){
 const r=await call('/api/auth/login',{account,password:initial});assert.equal(r.status,200);
 const next=await call('/api/auth/password',{oldPassword:initial,newPassword:password},{cookie:r.cookie,csrf:r.data.csrf});assert.equal(next.status,200);
 return{cookie:next.cookie,csrf:next.data.csrf};
}
async function observed(input,session){
 const x=(await action({action:'observe',input},session)).result;
 assert.deepEqual(Object.keys(x).sort(),['gameId','rowRevision','schemaDigest','tablesVerified','indexesVerified','foreignKeyDeclarationsVerified','definitionsVerified','rowIntegrityVerified','nativeDrainVerified','deleteAllowed','mode'].sort());
 assert.equal(x.gameId,input.gameId);assert.equal(x.rowRevision,input.expectedRowRevision);assert.match(x.schemaDigest,/^[a-f0-9]{64}$/);assert.equal(x.tablesVerified,35);assert.equal(x.definitionsVerified,true);assert.equal(x.rowIntegrityVerified,false);assert.equal(x.nativeDrainVerified,false);assert.equal(x.deleteAllowed,false);assert.equal(x.mode,'CURRENT_DECLARED_SQL_DEFINITIONS_ONLY_LEGACY_UNKNOWN');
 observations.push(x);return x;
}
try{
 server=await startEditorBackend(join(own,'wrangler.jsonc'),{stageSource:false,stageLibrary:false});
 const admin=await login('tianyi');await ok('/api/admin/accounts',{account:'definition_owner'},admin);await ok('/api/admin/accounts',{account:'definition_other'},admin);
 const owner=await login('definition_owner'),other=await login('definition_other'),dump=(await action({action:'dump'},admin)).result;
 writeFileSync(`${d}native-r${round}-schema.json`,JSON.stringify(dump,null,2)+'\n',{flag:'wx'});
 const expected=parse(readFileSync(`${d}expected.json`));assert.deepEqual(dump.objects.map(r=>[r.type,r.name,r.tbl_name,r.sql]),expected.objects);assert.equal(dump.foreignKeys[0].foreign_keys,1);assert.equal(dump.deferred[0].defer_foreign_keys,0);
 checks.push('real fresh Root/workerd initialized current35 code-declared tables, implicitindex identities/text equal independent NodeSQLite oracle; actual FK enforcement on/nondeferred. No staged bytes or source/runtime admission');
 const game=(await action({action:'create',name:'定義核驗'},owner)).result,input={gameId:game.gameId,expectedRowRevision:'1'};
 await rejected({action:'observe',input},owner,409,'DELETE_FENCE_REQUIRED');await rejected({action:'observe',input},other,404,'GAME_NOT_FOUND');await rejected({action:'observe',input:{gameId:'wolong-builtin',expectedRowRevision:'1'}},admin,403,'BUILTIN_PROTECTED');await rejected({action:'observe',input:{gameId:[game.gameId],expectedRowRevision:'1'}},owner,422,'DELETE_SCHEMA_INPUT');await rejected({action:'observe',input:{...input,expectedRowRevision:'01'}},owner,422,'DELETE_SCHEMA_INPUT');await rejected({action:'observe',input:{...input,plan:{}}},owner,422,'REQUEST_FIELDS');
 const fence=(await action({action:'fence',input:{...input,confirmationName:game.name}},owner)).result;input.expectedRowRevision=fence.rowRevision;
 await rejected({action:'observe',input:{...input,expectedRowRevision:'1'}},owner,409,'DELETE_SCHEMA_CHANGED');
 const stats=(await action({action:'stats'},admin)).result,first=await observed(input,owner);
 assert.equal((await observed(input,admin)).schemaDigest,first.schemaDigest);assert.deepEqual((await action({action:'stats'},admin)).result,stats);assert.equal(stats.writes,0);assert.equal(stats.jobFreezes,0);assert.equal(stats.draftFreezes,0);
 checks.push('actual owner/admin/authenticated foreign and builtin/UUID/exact fields/CAS/durable fence gates; exact11 facts do not grant row/native/delete. Owned skeleton is NOT GameSource; observation does not freeze Jobs/Drafts or write rows/R2');
 for(const kind of ['check','fk','collation','unique']){
  await action({action:'mutate',kind},admin);assert.equal((await action({action:'columns'},admin)).result.columnsVerified,true);await rejected({action:'observe',input},owner,503,'DELETE_SCHEMA_DEFINITION');await action({action:'restore'},admin);assert.equal((await observed(input,owner)).schemaDigest,first.schemaDigest);
  checks.push(`actual ${kind} DDL drift keeps original35/243 column gate passing; new current definition gate exact503, owned restore returns same oracle digest without SQL/R2 cleanup or migration`);
 }
 for(const kind of ['index','view','trigger','table']){
  await action({action:'mutate',kind},admin);if(kind!=='table'){assert.equal((await action({action:'columns'},admin)).result.columnsVerified,true);}await rejected({action:'observe',input},owner,503,'DELETE_SCHEMA_DEFINITION');await action({action:'restore'},admin);assert.equal((await observed(input,admin)).schemaDigest,first.schemaDigest);
  checks.push(`actual added ${kind} object rejected as unknown definition; no reserved-prefix blindpass or execution/callback assumptions; fixed owned fixture removal only, not product deletion`);
 }
 const reserved=(await action({action:'reserved-probe'},admin)).result;assert.deepEqual(reserved,{providerRejected:true,message:'not authorized: SQLITE_AUTH'});assert.equal((await observed(input,owner)).schemaDigest,first.schemaDigest);checks.push('actual workerd SDK refuses reserved_cf_ CREATE before mutation with characterized SQLITE_AUTH; schema remains exact. This is SDK refusal, NOT native newgate evidence for a created_cf_ table; independent NodeSQLite control covers that catalog case');
 await rejected({action:'deferred',input},admin,503,'DELETE_SCHEMA_ENFORCEMENT');assert.equal((await observed(input,owner)).schemaDigest,first.schemaDigest);
 checks.push('actual nondefault deferred-FK enforcement rejected within same native SQLtransaction even with exactDDLs; transaction restores flag, not row repair or historical FK validity');
 await action({action:'listed',gameId:game.gameId,value:1},admin);await rejected({action:'observe',input},owner,409,'DELETE_FENCE_CHANGED');await action({action:'listed',gameId:game.gameId,value:0},admin);
 await action({action:'corrupt-fence',gameId:game.gameId,owner:randomUUID()},admin);await rejected({action:'observe',input},owner,409,'DELETE_FENCE_CHANGED');await action({action:'corrupt-fence',gameId:game.gameId,owner:'restore'},admin);
 assert.equal((await observed(input,owner)).schemaDigest,first.schemaDigest);checks.push('actual listed and durable fence-owner corruption rejected before schema facts; exact owned row restoration, no undelete/native drain or legacy certificate');
 await rejected({action:'observe',input},undefined,401,'LOGIN_REQUIRED');await rejected({action:'observe',input},owner,403,'CSRF_REJECTED',{'X-CSRF-Token':'bad'});await rejected({action:'observe',input},owner,403,'ORIGIN_REJECTED',{Origin:'https://example.invalid'});
 checks.push('real loopback HTTP cookie/Origin/CSRF required; internal observation never trusts an anonymous DTO or supplied schema');
 await server.close();server=await startEditorBackend(join(own,'wrangler.jsonc'),{stageSource:false,stageLibrary:false});assert.equal((await observed(input,owner)).schemaDigest,first.schemaDigest);
 checks.push('actual workerd/DO restart retains fence/authority and exact35 declarations; reobservation is fresh facts, not immutable approval/oldprovider proof');
 const changed=await call('/api/auth/password',{oldPassword:password,newPassword:randomBytes(24).toString('hex')},owner);assert.equal(changed.status,200);await rejected({action:'observe',input},owner,401,'SESSION_INVALID');
 const latest={cookie:changed.cookie,csrf:changed.data.csrf};assert.equal((await observed(input,latest)).schemaDigest,first.schemaDigest);
 const missingPublic=await call(`/api/games/${game.gameId}/delete`,{},admin);assert.equal(missingPublic.status,404);
 checks.push('actual password handler revokes oldepoch and newprincipal rechecks schema; publicdelete still404, no completed410 or physical deletion');
 for(const[p,h]of Object.entries({...before.inputs,...before.imports,...sourceHashes})){assert.equal(sha(readFileSync(p)),h,p);}
 process.stdout.write(JSON.stringify({result:'PASS-ACTUAL-CURRENT-SQL-DEFINITIONS-NOT-DELETE',checks,calls,observations,protected:477,sourceHashes,limits:'Fresh current declarations/implicitindex/FK attributes/enforcement only. Row/FK data validity, complete global/historical refs, native/body/CPU/legacy drain, public deletion/scrub/cache/backup/runtime/Trial and overall completion remain open.'},null,2)+'\n');
}catch(error){writeFileSync(`${d}failure-r${round}.json`,JSON.stringify({message:String(error.message),checks,calls,observations},null,2)+'\n',{flag:'wx'});throw error;}finally{await server?.close();}
