// INTERNAL stage-plan collection, not RuntimeManifest or a new authorization service.
// Trusted SERVER assembly ports: existing games.snapshotReference, StageJobsAPI.read/
// assertCurrent and PrivateLibraryAssets.read's captured current-state assertion.
import { canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { assembleFixedStageAssets } from './stageassetplan.js';
const purposes = Object.freeze(['data','images','fallback-spring','fallback-summer','fallback-autumn','fallback-winter']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function requireValue(value, code) { if (!value) throw new TypeError('STAGE_COLLECTION_' + code); }
function canonical(value, maxBytes=1024*1024) {
  let text='',size=0;
  for (const token of canonicalSourceTokens(value,32)) { size+=Buffer.byteLength(token);requireValue(size<=maxBytes,'BUDGET');text+=token; }
  return text;
}
function parsed(text) { try { return JSON.parse(text); } catch (cause) { throw new TypeError('STAGE_COLLECTION_JSON',{cause}); } }
function exact(value, keys) { requireValue(value && !Array.isArray(value) && typeof value==='object' && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)), 'FIELDS'); }
function equal(a,b,code) { requireValue(a===b,code); }
function reportId(purpose) { if(purpose==='data')return 'binding_0';if(purpose==='images')return 'image_report';return 'fallback_report'; }
/** No new root route, provider transaction, runtime ticket or client-supplied ports.
 * The assertions must be existing services configured by the trusted server, not DTOs.
 * Fake ports can model this orchestration; they cannot prove native authorization.
 * A successful segment readback is not a simultaneous immutable provider snapshot.
 */
export async function collectFixedStageAssets(tokenHash, request, {games,stageApi,libraryAssets}) {
  requireValue(typeof tokenHash==='string' && /^[a-f0-9]{64}$/.test(tokenHash),'TOKEN');
  requireValue(typeof games?.snapshotReference==='function' && typeof stageApi?.read==='function' && typeof stageApi?.assertCurrent==='function' && typeof libraryAssets?.read==='function','SERVER_PORTS');
  request=parsed(canonical(request,8192));exact(request,['gameId','draftRevision','operations']);
  requireValue(typeof request.gameId==='string' && uuid.test(request.gameId),'GAME');
  requireValue(typeof request.draftRevision==='string' && /^[1-9][0-9]{0,63}$/.test(request.draftRevision),'REVISION');
  exact(request.operations,purposes);const ids=new Set();
  for(const p of purposes){const id=request.operations[p];requireValue(typeof id==='string' && uuid.test(id) && !ids.has(id),'OPERATION');ids.add(id);}
  const {gameId,draftRevision}=request;
  // First service captures actual actor+epoch itself; it rechecks them across its
  // own awaits. No principal DTO or reference is accepted as a read capability.
  const library=await libraryAssets.read(tokenHash,{gameId},draftRevision);
  requireValue(typeof library?.assertCurrent==='function' && library.body && !library.artifact,'LIBRARY_RESPONSE');
  library.assertCurrent();
  const libraryText=canonical(library.body),libraryBody=parsed(libraryText);
  const reference=games.snapshotReference(tokenHash,gameId,draftRevision),referenceText=canonical(reference);
  library.assertCurrent();
  const held=[],stages=[];
  function assertCurrent() {
    library.assertCurrent();equal(canonical(library.body),libraryText,'LIBRARY_CHANGED');
    for(const item of held)stageApi.assertCurrent(tokenHash,item.path,item.response);
    equal(canonical(games.snapshotReference(tokenHash,gameId,draftRevision)),referenceText,'SNAPSHOT_CHANGED');
    // A snapshot callback is not an authority grant: recheck the original
    // captured identity/catalog and all issued stage responses AFTER it too.
    library.assertCurrent();
    for(const item of held)stageApi.assertCurrent(tokenHash,item.path,item.response);
  }
  assertCurrent();
  for(const purpose of purposes) {
    const path=Object.freeze({gameId,purpose,id:request.operations[purpose]});
    assertCurrent();const summary=await stageApi.read(tokenHash,path);assertCurrent();
    stageApi.assertCurrent(tokenHash,path,summary);
    requireValue(summary?.body && !summary.artifact,'JOB_RESPONSE');
    exact(summary.body,['admission','purpose','job']);equal(summary.body.admission,'stage-only','ADMISSION');equal(summary.body.purpose,purpose,'PURPOSE');
    const job=parsed(canonical(summary.body.job));equal(job.operationId,path.id,'OPERATION');equal(job.gameId,gameId,'GAME');equal(job.draftRevision,draftRevision,'REVISION');equal(job.state,'ready','READY');
    held.push({path,response:summary});assertCurrent();
    const artifactPath=Object.freeze({...path,action:'artifacts/'+reportId(purpose),assetId:reportId(purpose)});
    assertCurrent();const response=await stageApi.read(tokenHash,artifactPath);assertCurrent();
    stageApi.assertCurrent(tokenHash,artifactPath,response);
    requireValue(response?.artifact && !response.body,'REPORT_RESPONSE');equal(response.artifact.assetId,artifactPath.assetId,'REPORT_ROLE');
    const raw=response.artifact.bytes;
    requireValue(raw instanceof Uint8Array && raw.length>0 && raw.length<=4*1024*1024,'REPORT_BYTES');
    let decoded;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch(cause){throw new TypeError('STAGE_COLLECTION_UTF8',{cause});}
    const binding=parsed(decoded);held.push({path:artifactPath,response});stages.push({purpose,job,binding});assertCurrent();
  }
  assertCurrent();
  const plan=assembleFixedStageAssets({reference:{gameId:reference.gameId,draftRevision:reference.draftRevision,rootKey:reference.rootKey,sourceDigest:reference.sourceDigest,dependencyDigest:reference.dependencyDigest},stages,library:libraryBody});
  assertCurrent();
  // Do not export handles, token hashes, byte buffers or assertions as new grants.
  // This optional server-only recheck remains backed by the original services.
  return Object.freeze({plan,assertCurrent,admission:'stage-plan-collection-not-runtime',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
