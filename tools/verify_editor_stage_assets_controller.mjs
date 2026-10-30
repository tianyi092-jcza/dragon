import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../server/public/stageassets.txt', import.meta.url), 'utf8');
const { installStageAssetBrowser } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const purposes = ['data','images','fallback-spring','fallback-summer','fallback-autumn','fallback-winter'];
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = () => ({ gameId: uuid(1), draftRevision: '7', operations: Object.fromEntries(purposes.map((p,i) => [p,uuid(i+2)])) });
function response(v) {
  const flags = { runtimeAllowed:false, trialAllowed:false, releaseAllowed:false, deleteAllowed:false };
  const reference = { gameId:v.gameId, draftRevision:v.draftRevision, sourceDigest:'a'.repeat(64), dependencyDigest:'b'.repeat(64), rootKey:'private-root-not-for-display' };
  return { admission:'stage-plan-collection-not-runtime', ...flags, plan: {
    schema:'dragon-stage-asset-plan-1', admission:'structural-stage-plan-not-runtime', ...flags, reference,
    artifacts:Array.from({length:44}, (_,i) => ({ purpose:'data', operationId:v.operations.data, assetId:`asset-${i}`, sha256:'c'.repeat(64), byteLength:1 })),
    reports:purposes.map(purpose => ({purpose, binding:{...reference, operationId:v.operations[purpose]}})),
    unresolvedReferences:Array.from({length:20}, () => ({ note:'<img src=x onerror=alert(1)>' })),
    missing:['complete-runtime-dependencies','runtime-manifest-and-loader-binding','a','b','c','d'],
    roles:{shared:Array(398).fill(null), chapters:Array(20).fill(null)},
  }};
}
function harness() {
  let user={user:{id:'admin',role:'admin',mustChangePassword:false}}, tuple=context(), model, busy=false;
  const calls=[];
  let handler=async () => response(tuple);
  const controller=installStageAssetBrowser({authority:()=>user,requestContext:()=>tuple,isBusy:()=>busy,
    publish:v=>{model=v;},api:async (...args)=>{calls.push(args);return handler(...args);},
    work:async action=>{if(busy)return;busy=true;try{return await action();}finally{busy=false;controller.render();}},
  });
  controller.setIdentity(user);
  return {controller,calls,get model(){return model;},get tuple(){return tuple;},set tuple(v){tuple=v;},set handler(v){handler=v;},set user(v){user=v;controller.setIdentity(v);}};
}
test('explicit GET only; six exact IDs, display-only projection, clear never writes', async()=>{
  const h=harness();assert.equal(h.calls.length,0);await h.controller.actions.load();
  assert.equal(h.calls.length,1);const [path,body,options]=h.calls[0];assert.equal(body,undefined);assert.deepEqual(options,{stagePlan:true});
  const url=new URL(path,'https://test.invalid');assert.equal(url.searchParams.get('revision'),'7');
  for(const p of purposes)assert.equal(url.searchParams.get(p),h.tuple.operations[p]);
  assert.equal(h.model.outputs.length,44);assert.deepEqual(h.model.missing,response(h.tuple).plan.missing);
  assert.deepEqual(h.model.unresolved,response(h.tuple).plan.unresolvedReferences.map(value=>JSON.stringify(value)));
  assert.match(h.model.summary,/6類.*20條.*不是缺失檔案數/);
  assert.ok(!JSON.stringify(h.model).includes('private-root-not-for-display'));
  h.model.outputs.push('local');h.model.missing.push('local');h.model.unresolved.push('local');
  h.controller.render();assert.equal(h.model.outputs.length,44);assert.equal(h.model.missing.length,6);assert.equal(h.model.unresolved.length,20);
  h.controller.actions.clear();assert.equal(h.model.outputs.length,0);assert.deepEqual(h.model.missing,[]);assert.deepEqual(h.model.unresolved,[]);assert.equal(h.calls.length,1);
});
test('author, anonymous and forced-password cannot read or retain display',async()=>{
  const h=harness();await h.controller.actions.load();
  for(const user of [null,{user:{id:'author',role:'author'}},{user:{id:'admin',role:'admin',mustChangePassword:true}}]){
    h.user=user;await h.controller.actions.load();assert.equal(h.model.outputs.length,0);assert.equal(h.model.context,'');assert.equal(h.model.loadDisabled,true);assert.deepEqual(h.model.missing,[]);assert.deepEqual(h.model.unresolved,[]);
  }
  assert.equal(h.calls.length,1);
});
test('changed or incomplete tuple clears old data without automatic requests',async()=>{
  const h=harness();await h.controller.actions.load();h.tuple={...h.tuple,draftRevision:'8'};h.controller.render();assert.equal(h.model.outputs.length,0);assert.equal(h.calls.length,1);
  h.tuple.operations.images=h.tuple.operations.data;h.controller.render();assert.equal(h.model.loadDisabled,true);await h.controller.actions.load();assert.equal(h.calls.length,1);
});
test('late result cannot cross identity or exact tuple boundary',async()=>{
  for(const change of [h=>{h.user=null;},h=>{h.tuple={...h.tuple,draftRevision:'9'};}]){
    const h=harness(), value=response(h.tuple);let resolve;h.handler=()=>new Promise(r=>{resolve=r;});
    const pending=h.controller.actions.load();change(h);resolve(value);await pending;assert.equal(h.model.outputs.length,0);
  }
});
test('invalid admission and GET error clear display, preserve association, never retry',async()=>{
  const h=harness(), original=structuredClone(h.tuple);await h.controller.actions.load();
  h.handler=async()=>({...response(h.tuple),runtimeAllowed:true});await assert.rejects(h.controller.actions.load(),/結構回應無效/);
  assert.equal(h.model.outputs.length,0);assert.deepEqual(h.model.missing,[]);assert.deepEqual(h.model.unresolved,[]);assert.deepEqual(h.tuple,original);assert.equal(h.calls.length,2);
  h.handler=async()=>{throw new Error('offline');};await assert.rejects(h.controller.actions.load(),/offline/);assert.equal(h.calls.length,3);
});
test('pagehide invalidates pending result and clears projection',async()=>{
  const h=harness(), value=response(h.tuple);let resolve;h.handler=()=>new Promise(r=>{resolve=r;});
  const pending=h.controller.actions.load();h.controller.pagehide();resolve(value);await pending;assert.equal(h.model.outputs.length,0);
});
