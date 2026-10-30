import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const {installLibraryRegistration}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync('server/public/catalog.txt')).toString('base64'));
const registryId='approved-available-library-f4ba804b-1',mode='STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE',definitionDigest='a'.repeat(64),rootDigest='b'.repeat(64);
const snapshot={definition:{registryId,definitionDigest,roleCount:400,profileRevision:'fixed-available-web-library-1'},mode,unresolvedReferences:20,staged:{registryId,root:{sha256:rootDigest,byteLength:123}},registered:null};
const fact={registryId,definitionDigest,rootDigest,rootByteLength:123,rowRevision:'1',registeredAt:'2026-10-20T00:00:00.000Z'};
function storedRecord(store) {
  try { return JSON.parse([...store.values()][0]); }
  catch (cause) { throw new Error('Test association must contain valid JSON', {cause}); }
}
function setup(store=new Map()) {
  let actor={user:{id:'admin',role:'admin',version:2,mustChangePassword:false}},model,busy=false,confirm=true,hook=null;
  const calls=[],view=structuredClone(snapshot),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  const ui=installLibraryRegistration({api:async(path,body,options)=>{calls.push({path,body,options});if(hook){const result=await hook(path,body,options);if(result!==undefined)return result;}return body===undefined?structuredClone(view):{...fact,mode,unresolvedReferences:20};},authority:()=>actor,isBusy:()=>busy,storage,confirm:()=>typeof confirm==='function'?confirm():confirm,publish:value=>{model=value;},work:async fn=>{if(busy)return;busy=true;try{return await fn();}finally{busy=false;ui.render();}}});ui.setIdentity(actor);
  return {ui,a:ui.actions,view,calls,store,storage,get model(){return model;},set hook(value){hook=value;},set confirm(value){confirm=value;},get identity(){return actor;},set identity(value){actor=value;ui.setIdentity(value);}};
}
test('explicit read projects strings only, registration is not execution permission; cancel sends no POST',async()=>{
  const s=setup();assert.equal(s.calls.length,0);assert.equal(s.model.installDisabled,true);await s.a.read();assert.equal(s.model.installDisabled,false);assert.ok(!JSON.stringify(s.model).includes(definitionDigest));assert.ok(!JSON.stringify(s.model).includes(rootDigest));s.model.state='changed';s.ui.render();assert.match(s.model.state,/400角色/);s.confirm=false;await s.a.install();assert.equal(s.calls.length,1);assert.equal(s.store.size,0);
});
test('unknown reply survives reload without requests; read fact does not confirm original key; explicit replay uses original empty body/key',async()=>{
  const s=setup();await s.a.read();s.hook=async(_path,body)=>{if(body)throw new Error('lost');};await assert.rejects(s.a.install(),/lost/);const request=s.calls.at(-1),record=storedRecord(s.store);assert.deepEqual(Object.keys(record).sort(),['definitionDigest','key','registryId','root','state','userVersion']);assert.equal(record.state,'unknown');assert.deepEqual(request.body,{});assert.equal(s.ui.canLeave(true),false);s.confirm=false;assert.equal(s.ui.canLeave(),false);
  const restored=setup(s.store);assert.equal(restored.calls.length,0);assert.equal(restored.model.replayDisabled,true);restored.view.registered={...fact};await restored.a.read();assert.match(restored.model.operation,/回應未確認/);assert.equal(restored.model.installDisabled,true);assert.equal(restored.model.replayDisabled,false);await restored.a.replay();assert.deepEqual(restored.calls.at(-1),request);assert.match(restored.model.operation,/已收到並核對/);assert.equal(restored.ui.canLeave(true),true);const n=restored.calls.length;await restored.a.forget();assert.equal(restored.store.size,0);assert.equal(restored.calls.length,n);assert.equal(restored.model.installDisabled,true);
});
test('account version or staged root change prohibits replay and cannot silently replace key',async()=>{
  const s=setup();await s.a.read();s.hook=async(_path,body)=>{if(body)throw new Error('lost');};await assert.rejects(s.a.install());const stored=[...s.store.values()][0];s.identity={user:{id:'admin',role:'admin',version:3}};await s.a.read();assert.equal(s.model.replayDisabled,true);const n=s.calls.length;await assert.rejects(s.a.replay());assert.equal(s.calls.length,n);assert.equal([...s.store.values()][0],stored);
  const r=setup(s.store);r.view.staged.root.sha256='c'.repeat(64);await r.a.read();assert.equal(r.model.replayDisabled,true);await assert.rejects(r.a.replay());assert.equal(r.calls.length,1);
});
test('corrupt/read-only storage fails closed; only explicit local forget permits fresh read',async()=>{
  const store=new Map([['editor-library-registration:admin','{bad']]),s=setup(store);await s.a.read();assert.equal(s.model.installDisabled,true);assert.equal(s.ui.canLeave(true),false);s.confirm=false;await s.a.forget();assert.equal(store.size,1);s.confirm=true;await s.a.forget();assert.equal(store.size,0);assert.equal(s.calls.length,1);await s.a.read();s.storage.setItem=()=>{throw new Error('blocked');};await assert.rejects(s.a.install(),/無法保留/);assert.equal(s.calls.length,2);assert.equal(s.model.installDisabled,true);
});
test('malformed snapshot or wrong receipt retains unknown association and cannot enable another write',async()=>{
  const s=setup();s.view.unresolvedReferences=0;await assert.rejects(s.a.read());assert.equal(s.model.installDisabled,true);s.view.unresolvedReferences=20;await s.a.read();s.hook=async(_path,body)=>body?{...fact,rootDigest:'c'.repeat(64),mode,unresolvedReferences:20}:undefined;await assert.rejects(s.a.install(),/不符/);assert.equal(storedRecord(s.store).state,'unknown');assert.equal(s.model.installDisabled,true);assert.equal(s.model.replayDisabled,true);assert.equal(s.calls.filter(x=>x.body).length,1);
});
test('registration/replay/forget confirmations cannot affect a replacement identity or changed view',async()=>{
  for(const action of ['install','replay','forget','broken-forget']) for(const change of ['other','logout','session','aba','version','pagehide','mutated-id']) {
    const s=setup();await s.a.read();
    if(action!=='install') {
      s.hook=async(_path,body)=>{if(body)throw new Error('lost');};await assert.rejects(s.a.install(),/lost/);s.hook=null;
      if(action==='broken-forget') {s.store.set('editor-library-registration:admin','{bad');s.identity={user:{...s.identity.user}};}
      else await s.a.read();
    }
    s.store.set('editor-library-registration:other',JSON.stringify({key:'other-original-key-123',userVersion:2,registryId,definitionDigest,root:{sha256:rootDigest,byteLength:123},state:'unknown'}));
    const before=new Map(s.store), count=s.calls.length, original=s.identity;
    s.confirm=()=>{
      if(change==='other')s.identity={user:{...original.user,id:'other'}};
      if(change==='logout')s.identity=null;
      if(change==='session')s.identity={user:{...original.user}};
      if(change==='aba'){s.identity={user:{...original.user,id:'other'}};s.identity=original;}
      if(change==='version')original.user.version++;
      if(change==='mutated-id')original.user.id='other';
      if(change==='pagehide')s.ui.pagehide();
      return true;
    };
    await assert.rejects(s.a[action==='broken-forget'?'forget':action](),/確認|會話|上下文/);
    assert.equal(s.calls.length,count,action+':'+change);assert.deepEqual(s.store,before,action+':'+change);
  }
});
test('unauthorized actors and late reads/submits after identity/pagehide cannot revive private state',async()=>{
  for(const identity of [null,{user:{id:'a',role:'author',version:1}},{user:{id:'a',role:'admin',version:1,mustChangePassword:true}}]){const s=setup();s.identity=identity;await assert.rejects(s.a.read());await assert.rejects(s.a.install());assert.equal(s.calls.length,0);assert.equal(s.model.state,'');assert.equal(s.model.operation,'');}
  for(const submit of [false,true]){const s=setup();await s.a.read();let resolve,reached;const waiting=new Promise(done=>{reached=done;});s.hook=()=>{reached();return new Promise(done=>{resolve=done;});};const p=submit?s.a.install():s.a.read();await waiting;s.identity=null;resolve(submit?{...fact,mode,unresolvedReferences:20}:snapshot);await p;assert.equal(s.model.state,'');assert.equal(s.model.operation,'');if(submit)assert.equal(storedRecord(s.store).state,'unknown');}
  const s=setup();await s.a.read();let resolve; s.hook=()=>new Promise(done=>{resolve=done;});const p=s.a.read();s.ui.pagehide();resolve(snapshot);await p;assert.equal(s.model.installDisabled,true);assert.match(s.model.message,/頁面離開/);
});
