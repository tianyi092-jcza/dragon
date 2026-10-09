// INTERNAL STRUCTURAL PLAN ONLY. Never authentication, byte verification or RuntimeManifest@1.
// Sources: current Data/Image/Fallback #plan/#manifest; PrivateLibraryAssets.read;
// shared worldresources/catalog and engineering §4.1–4.2. No rule/initializer changes.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { DATA_COMPILER_REVISION } from './datacompiler.js';
import { IMAGE_JOB_REVISION } from './imagejobs.js';
import { COPY_IMAGE_REVISION, FALLBACK_IMAGE_REVISION } from './copyimages.js';
import { PNG_IO_REVISION } from './pngio.js';
import { ROW_PNG_REVISION } from './rowpng.js';
import { TILE_PIXEL_REVISION } from '../web/src/content/authoring/tilepixels.js';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { FIXED_TRIAL_ASSET_PATHS } from '../web/src/editor/trialassetpaths.js';
const seasons = ['spring','summer','autumn','winter'];
const bytes = v => Buffer.concat(encodeSourceChunks(v));
const sha = v => createHash('sha256').update(v).digest('hex');
const digest = v => sha(bytes(v));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
function requireValue(ok, code) { if (!ok) throw new TypeError('STAGE_PLAN_' + code); }
function exact(v, keys) { requireValue(v && !Array.isArray(v) && typeof v==='object' && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k)), 'FIELDS'); }
function equal(a,b,code) { requireValue(typeof a===typeof b && a===b, code); }
function capture(v) {
  let text='', size=0;
  for (const token of canonicalSourceTokens(v,32)) { size+=Buffer.byteLength(token); requireValue(size<=1024*1024,'BUDGET'); text+=token; }
  try { return JSON.parse(text); } catch (cause) { throw new TypeError('STAGE_PLAN_JSON',{cause}); }
}
function freeze(v) { if(v && typeof v==='object') { for(const child of Object.values(v))freeze(child);Object.freeze(v); } return v; }
function descriptor(o, max=4*1024*1024) { exact(o,['assetId','sha256','byteLength']);requireValue(typeof o.assetId==='string' && hash.test(o.sha256) && typeof o.sha256==='string' && Number.isSafeInteger(o.byteLength) && o.byteLength>0 && o.byteLength<=max,'DESCRIPTOR'); }
function contract(purpose) {
  if(purpose==='data')return {compiler:DATA_COMPILER_REVISION,stages:['validate','compile-data'],schema:'dragon-data-compilation-1',admission:'data-only',report:'binding_0',sourceReport:'source_report',outputs:['binding_0','terrain_0','geography_0','minimap_geography_0','road_mask_0','road_cost_0','road_offset_0','roads_0',...Array.from({length:20},(_,i)=>'chapter_'+i+'_0')]};
  if(purpose==='images')return {compiler:IMAGE_JOB_REVISION,stages:['validate-images','store-images'],schema:'dragon-image-job-1',admission:'image-stage-outputs-only',report:'image_report',sourceReport:'image_report',outputs:[...seasons.map(s=>'atlas_'+s),'minimap_base','minimap_large']};
  const season=seasons.find(s=>purpose==='fallback-'+s);requireValue(season!==undefined,'PURPOSE');
  const io=digest({PNG_IO_REVISION,ROW_PNG_REVISION,TILE_PIXEL_REVISION}).slice(0,16);
  return {compiler:FALLBACK_IMAGE_REVISION+'-'+season+'-'+io+'-job-1',stages:['validate-fallback','store-fallback'],schema:'dragon-fallback-job-1',admission:'single-season-stage-outputs-only',report:'fallback_report',sourceReport:'fallback_report',outputs:['fallback_'+season],season};
}
/** All inputs are untrusted JSON descriptions, even when their hashes/relationships agree.
 * Caller must independently enforce actual authority/fence/epoch and verify bytes again.
 * This function has no I/O, callbacks, handles, actor/session claims or admission branches. */
export function assembleFixedStageAssets(input) {
  input=capture(input);exact(input,['reference','stages','library']);
  const ref=input.reference;exact(ref,['gameId','draftRevision','rootKey','sourceDigest','dependencyDigest']);
  requireValue(typeof ref.gameId==='string' && uuid.test(ref.gameId),'GAME');
  requireValue(typeof ref.draftRevision==='string' && /^[1-9][0-9]{0,63}$/.test(ref.draftRevision),'REVISION');
  requireValue(typeof ref.rootKey==='string' && ref.rootKey.length>0 && ref.rootKey.length<=1024,'ROOT');
  for(const k of ['sourceDigest','dependencyDigest'])requireValue(typeof ref[k]==='string' && hash.test(ref[k]),'REFERENCE');
  requireValue(Array.isArray(input.stages) && input.stages.length===6,'PURPOSES');
  const map=new Map(), operations=new Set(), artifacts=[], reports=[];
  for(const entry of input.stages) {
    exact(entry,['purpose','job','binding']);const {purpose,job,binding}=entry;
    requireValue(typeof purpose==='string' && !map.has(purpose),'PURPOSE');const c=contract(purpose);
    exact(job,['operationId','gameId','draftRevision','scope','compilerRevision','profileRevision','state','stage','attempt','rowRevision','checkpoint','failureCode','retryable','createdAt','updatedAt']);
    requireValue(typeof job.operationId==='string' && uuid.test(job.operationId) && !operations.has(job.operationId),'OPERATION');operations.add(job.operationId);
    for(const k of ['gameId','draftRevision'])equal(job[k],ref[k],'JOB_REFERENCE');
    equal(job.compilerRevision,c.compiler,'COMPILER');equal(job.profileRevision,FIXED_COPY_PROFILE,'PROFILE');equal(job.scope,'all','SCOPE');equal(job.state,'ready','READY');equal(job.stage,2,'STAGE');
    requireValue(Number.isSafeInteger(job.attempt) && job.attempt>0 && typeof job.rowRevision==='string' && /^[1-9][0-9]{0,63}$/.test(job.rowRevision) && job.failureCode===null && job.retryable===false && typeof job.createdAt==='string' && typeof job.updatedAt==='string','JOB_STATE');
    const keys=['schema','operationId','gameId','draftRevision','sourceDigest','dependencyDigest','compilerRevision','profileRevision','pipelineDigest','admission'];
    if(purpose==='data')keys.push('scope','missing');else keys.push('sourceReport');if(c.season)keys.push('season');exact(binding,keys);
    equal(binding.schema,c.schema,'SCHEMA');equal(binding.admission,c.admission,'ADMISSION');equal(binding.operationId,job.operationId,'BINDING');
    for(const k of ['gameId','draftRevision','sourceDigest','dependencyDigest'])equal(binding[k],ref[k],'BINDING');
    equal(binding.compilerRevision,c.compiler,'COMPILER');equal(binding.profileRevision,FIXED_COPY_PROFILE,'PROFILE');
    const pipeline=digest({compilerRevision:c.compiler,profileRevision:FIXED_COPY_PROFILE,stages:c.stages});equal(binding.pipelineDigest,pipeline,'PIPELINE');
    if(purpose==='data') { equal(binding.scope,'all','SCOPE');requireValue(Array.isArray(binding.missing) && binding.missing.length===4 && ['image-decode','pixel-png-output','complete-runtime-dependencies','runtime-admission'].every((s,i)=>binding.missing[i]===s),'MISSING'); }
    else { const source=binding.sourceReport;requireValue(source && !Array.isArray(source) && typeof source==='object','SOURCE_REPORT');for(const k of ['gameId','draftRevision','sourceDigest','dependencyDigest'])equal(source[k],ref[k],'SOURCE_REPORT');if(c.season){equal(binding.season,c.season,'SEASON');equal(source.season,c.season,'SEASON');equal(source.compilerRevision,FALLBACK_IMAGE_REVISION,'SOURCE_COMPILER');equal(source.pngRevision,PNG_IO_REVISION,'PNG');equal(source.rowPNGRevision,ROW_PNG_REVISION,'PNG');equal(source.tilePixelRevision,TILE_PIXEL_REVISION,'PIXELS');equal(source.admission,'single-season-fallback-only','ADMISSION');}else{equal(source.compilerRevision,COPY_IMAGE_REVISION,'SOURCE_COMPILER');equal(source.admission,'bounded-images-only','ADMISSION');} }
    requireValue(Array.isArray(job.checkpoint) && job.checkpoint.length===2,'CHECKPOINT');let previousDigest=null;const local=new Map();
    for(let i=0;i<2;i++) { const checkpoint=job.checkpoint[i];exact(checkpoint,['stage','digest','outputs']);equal(checkpoint.stage,c.stages[i],'CHECKPOINT_STAGE');requireValue(Array.isArray(checkpoint.outputs),'OUTPUTS');const expected=i===0?[c.sourceReport]:c.outputs;requireValue(checkpoint.outputs.length===expected.length,'OUTPUTS');
      for(let index=0;index<expected.length;index++) {const o=checkpoint.outputs[index];descriptor(o);equal(o.assetId,expected[index],'ROLE');requireValue(!local.has(o.assetId),'DUPLICATE_ROLE');local.set(o.assetId,o);artifacts.push({purpose,operationId:job.operationId,...o});}
      const manifest={operationId:job.operationId,gameId:ref.gameId,draftRevision:ref.draftRevision,sourceDigest:ref.sourceDigest,dependencyDigest:ref.dependencyDigest,compilerRevision:c.compiler,profileRevision:FIXED_COPY_PROFILE,pipelineDigest:pipeline,stage:checkpoint.stage,previousDigest,outputs:checkpoint.outputs};equal(checkpoint.digest,digest(manifest),'CHAIN');previousDigest=checkpoint.digest;
    }
    const report=local.get(c.report);equal(report.sha256,digest(binding),'REPORT_SHA');equal(report.byteLength,bytes(binding).length,'REPORT_LENGTH');
    const locate=id=>{const o=local.get(id);requireValue(o!==undefined,'ROLE');return {kind:'private-stage',gameId:ref.gameId,draftRevision:ref.draftRevision,sourceDigest:ref.sourceDigest,purpose,operationId:job.operationId,...o};};map.set(purpose,locate);reports.push({purpose,binding,artifact:locate(c.report)});
  }
  const library=input.library;exact(library,['gameId','draftRevision','sourceDigest','registryId','catalogRoot','admission','mode','assets','unresolvedReferences','limits']);for(const k of ['gameId','draftRevision','sourceDigest'])equal(library[k],ref[k],'LIBRARY_REFERENCE');equal(library.admission,'private-available-bytes-only','LIBRARY_ADMISSION');equal(library.mode,'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE','LIBRARY_MODE');equal(library.registryId,'approved-available-library-76cdf28-1','LIBRARY_REGISTRY');requireValue(typeof library.catalogRoot==='string' && hash.test(library.catalogRoot) && Array.isArray(library.assets) && library.assets.length===FIXED_TRIAL_ASSET_PATHS.length && Array.isArray(library.unresolvedReferences) && library.unresolvedReferences.length===20 && typeof library.limits==='string','LIBRARY');
  const shared=library.assets.map((a,index)=>{exact(a,['assetId','logicalURL','sha256','byteLength','mime']);descriptor({assetId:a.assetId,sha256:a.sha256,byteLength:a.byteLength},16*1024*1024);equal(a.assetId,'library-'+String(index).padStart(3,'0'),'LIBRARY_ROLE');equal(a.logicalURL,FIXED_TRIAL_ASSET_PATHS[index],'LIBRARY_PATH');const mimes={bin:'application/octet-stream',json:'application/json',png:'image/png',flac:'audio/flac',wav:'audio/wav',woff2:'font/woff2'};equal(a.mime,mimes[a.logicalURL.split('.').at(-1)],'LIBRARY_MIME');return {kind:'private-library',gameId:ref.gameId,draftRevision:ref.draftRevision,sourceDigest:ref.sourceDigest,registryId:library.registryId,catalogRoot:library.catalogRoot,...a};});
  const data=map.get('data'),image=map.get('images');
  const roles={world:{terrain:data('terrain_0'),roadGraph:data('roads_0'),roadCost:data('road_cost_0'),roadOffset:data('road_offset_0'),seasonAtlases:Object.fromEntries(seasons.map(s=>[s,image('atlas_'+s)])),seasons:Object.fromEntries(seasons.map(s=>[s,map.get('fallback-'+s)('fallback_'+s)])),minimap:{base:image('minimap_base'),large:image('minimap_large')}},auxiliary:{geography:data('geography_0'),minimapGeography:data('minimap_geography_0'),roadMask:data('road_mask_0')},chapters:Array.from({length:20},(_,runtimeIndex)=>({runtimeIndex,artifact:data('chapter_'+runtimeIndex+'_0')})),shared};
  return freeze({schema:'dragon-stage-asset-plan-1',reference:ref,admission:'structural-stage-plan-not-runtime',roles,artifacts,reports,unresolvedReferences:library.unresolvedReferences,libraryLimits:library.limits,missing:['actual-authority-and-current-fence-epoch','native-byte-readback','complete-runtime-dependencies','chapter-identity-and-slot-map','profile-certificate','runtime-manifest-and-loader-binding'],runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
