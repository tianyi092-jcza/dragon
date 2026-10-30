// Display/controller contracts, not authority or full publication admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { installPublish } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../server/public/publish.txt', import.meta.url))).toString('base64'));
function parse(value) { try { return JSON.parse(value); } catch (cause) { throw new Error('invalid test journal', {cause}); } }
const GAME='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',RELEASE='dddddddd-dddd-4ddd-addd-dddddddddddd';
const author=()=>({user:{id:'11111111-1111-4111-8111-111111111111',role:'author',version:1,mustChangePassword:false}});
const row=(gameId=GAME)=>({gameId,metadata:{name:'臥龍',introduction:'原文'},listed:false,draftRevision:'3'});
const pin=()=>({gameId:GAME,name:'臥龍',revision:'3',sourceDigest:'d'.repeat(64),chapters:['ch1'],publishedAt:'2026-10-15T01:00:00.000Z',ordinal:'1.2'});
const receipt=(state='pending')=>({version:1,gameId:GAME,releaseId:RELEASE,pin:pin(),distribution:{gameId:GAME,operationId:RELEASE,generation:1,kind:'publish',state,visibleAt:state==='pending'?null:'2026-10-15T02:00:00.000Z',recoveryRequired:false}});
function setup(customStorage) {
 let identity=author(),busy=false,model,allow=true;
 const calls=[],journal=new Map();
 const storage=customStorage??{getItem:key=>journal.get(key)??null,setItem:(key,value)=>journal.set(key,value),removeItem:key=>journal.delete(key)};
 let response=async(path)=>{
  if(path==='/api/games')return {games:[row(),row(OTHER)]};
  if(path.endsWith('/releases'))return {releases:[{releaseId:RELEASE,ordinal:'1.2',draftRevision:'3',createdAt:'2026-10-15T00:00:00.000Z'}]};
  if(path==='/api/publish')return pin();
  if(path.includes('/publish-operations/'))return receipt();
  if(path==='/api/announcements')return {announcements:[{gameId:GAME,name:'臥龍',ordinal:'1.2',creatorAccount:'author1',firstOnlineAt:'2026-10-15T02:00:00.000Z'}]};
  throw new Error(path);
 };
 const ui=installPublish({api:async(...args)=>{calls.push(args);return response(...args);},authority:()=>identity,isBusy:()=>busy,work:async fn=>{if(busy)return;busy=true;try{return await fn();}finally{busy=false;ui.render();}},publish:value=>{model=value;},storage,confirm:()=>typeof allow==='function'?allow():allow});ui.setIdentity(identity);
 return {ui,calls,journal,get model(){return model;},get actor(){return identity;},reply:fn=>{response=fn;},confirm:value=>{allow=value;},identity(value){identity=value;ui.setIdentity(value);}};
}
test('new publication validates normalized code points before writing a journal or sending',async()=>{
 const h=setup();await h.ui.actions.refresh();const before=h.calls.length;
 for(const name of ['123456789','𠀀'.repeat(9),'x\nname','\ud800']){
  h.ui.actions.setName(name);await assert.rejects(h.ui.actions.publish(),/1至8/);
  assert.equal(h.calls.length,before);assert.equal(h.journal.size,0);
 }
 const name=' e\u0301'.trim().repeat(8);h.ui.actions.setName(name);
 h.reply(async()=>{throw new Error('owned response lost');});
 await assert.rejects(h.ui.actions.publish(),/owned response lost/);
 assert.equal(h.calls.at(-1)[1].name,name,'exact original wire body retained');
 assert.equal(parse([...h.journal.values()][0]).name,name);
});
test('explicit own games, versions, announcement and text-only copies; no automatic reads',async()=>{
 const h=setup();assert.equal(h.calls.length,0);await h.ui.actions.refresh();assert.equal(h.model.selected,GAME);assert.equal(h.model.name,'臥龍');assert.equal(h.model.games.length,2);h.model.games[0].gameId='forged';h.ui.render();assert.equal(h.model.games[0].gameId,GAME);
 await h.ui.actions.versions();assert.match(h.model.versions[0],/1.2.*草稿修訂 3/);await h.ui.actions.preview();assert.match(h.model.announcement,/公告：臥龍.*author1/);assert.doesNotMatch(JSON.stringify(h.model),/sourceDigest|chapters|csrf/);
 h.reply(async()=>({announcements:[]}));await h.ui.actions.preview();assert.match(h.model.announcement,/無公告/);
});
test('publish confirmation cancellation, original body/key, local commit differs from distribution',async()=>{
 const h=setup();await h.ui.actions.refresh();h.confirm(false);await h.ui.actions.publish();assert.equal(h.calls.filter(c=>c[1]).length,0);h.confirm(true);await h.ui.actions.publish();const post=h.calls.find(c=>c[0]==='/api/publish');assert.deepEqual(post[1],{gameId:GAME,name:'臥龍'});assert.equal(parse([...h.journal.values()][0]).key,post[2].key);assert.match(h.model.result,/版本 1.2.*發布≠上架.*分發待確認/);assert.equal(h.model.publishDisabled,true);assert.equal(h.model.retryDisabled,true);
 h.reply(async()=>receipt('confirmed'));await h.ui.actions.query();assert.match(h.model.result,/曾於.*不是目前上架/);assert.equal(h.ui.canLeave(true),false);
});
test('lost POST preserves original name/key; GET404 only permits explicit same-body retry',async()=>{
 const h=setup();await h.ui.actions.refresh();h.ui.actions.setName('原名稱');h.reply(async()=>{throw Object.assign(new Error('stale'),{code:'PUBLISH_STALE',status:409});});await assert.rejects(h.ui.actions.publish());assert.match(h.model.message,/草稿已變更/);const post=h.calls.at(-1);h.ui.actions.setName('不能重定向');h.ui.actions.select(OTHER);assert.equal(h.model.publishDisabled,true);
 h.reply(async()=>{throw Object.assign(new Error('missing'),{code:'PUBLISH_OPERATION_NOT_FOUND',status:404});});await assert.rejects(h.ui.actions.query());assert.equal(h.model.retryDisabled,false);const n=h.calls.length;h.confirm(false);await h.ui.actions.retry();assert.equal(h.calls.length,n);
 h.confirm(true);h.reply(async path=>path==='/api/publish'?pin():receipt());await h.ui.actions.retry();const replay=h.calls.findLast(c=>c[0]==='/api/publish');assert.deepEqual(replay.slice(1),post.slice(1));assert.equal(h.model.retryDisabled,true);
});
for (const [code,status,label] of [['PLAY_CITY_VIEW_MISSING',422,/據點圖片.*核對章節資源/],['PLAY_PORTRAIT_CORRUPT',500,/武將畫像引用無效.*核對已保存章節/],['DRAFT_TOPOLOGY_BROKEN',422,/據點移動意向.*不能發布.*重建記錄不代表已完成重連/]]) {
 test(`publication rejection ${code} explains the dependency without discarding or automatically retrying the operation`,async()=>{
  const h=setup();await h.ui.actions.refresh();const before=h.calls.length;
  h.reply(async()=>{throw Object.assign(new Error(code),{code,status});});
  await assert.rejects(h.ui.actions.publish(),error=>error.code===code);
  assert.match(h.model.message,label);assert.doesNotMatch(h.model.message,/PLAY_|DRAFT_TOPOLOGY_BROKEN/);
  assert.match(h.model.message,/不自動重送或取消/);
  assert.equal(h.calls.length,before+1);assert.equal(h.model.result,'');
  assert.equal(h.model.publishDisabled,true);assert.equal(h.model.retryDisabled,true);
  const post=h.calls.at(-1),saved=[...h.journal.entries()];
  h.ui.actions.setName('未提交新名');await assert.rejects(h.ui.actions.retry());
  assert.equal(h.calls.length,before+1);assert.deepEqual([...h.journal.entries()],saved);
  h.reply(async()=>{throw Object.assign(new Error('not found'),{code:'PUBLISH_OPERATION_NOT_FOUND',status:404});});
  await assert.rejects(h.ui.actions.query());assert.equal(h.model.retryDisabled,false);
  assert.deepEqual([...h.journal.entries()],saved);
  h.reply(async path=>path==='/api/publish'?pin():receipt());await h.ui.actions.retry();
  assert.deepEqual(h.calls.findLast(call=>call[0]==='/api/publish').slice(1),post.slice(1));
  assert.equal(h.model.name,'未提交新名');assert.equal(h.model.retryDisabled,true);
 });
}
test('reload restores only original tuple; current account version change disables replay',async()=>{
 const h=setup();await h.ui.actions.refresh();h.reply(async()=>{throw new Error('lost');});await assert.rejects(h.ui.actions.publish());const n=h.calls.length;h.identity(author()); // Same identity facts retain live state.
 assert.equal(h.calls.length,n);h.identity(null);h.identity(author());assert.equal(h.model.games.length,0);assert.match(h.model.operation,/原請求/);assert.equal(h.calls.length,n);
 h.identity({user:{...author().user,version:2}});h.reply(async()=>{throw Object.assign(new Error('missing'),{code:'PUBLISH_OPERATION_NOT_FOUND',status:404});});await assert.rejects(h.ui.actions.query());assert.equal(h.model.retryDisabled,true);assert.match(h.model.operation,/帳戶版本已變/);
});
test('successful POST plus failed GET remains local commit, cannot retry; forget local only',async()=>{
 const h=setup();await h.ui.actions.refresh();h.reply(async path=>{if(path==='/api/publish')return pin();throw new Error('observation unavailable');});await h.ui.actions.publish();assert.match(h.model.result,/本地已提交.*分發待確認/);assert.equal(h.model.retryDisabled,true);const n=h.calls.length;h.confirm(false);await h.ui.actions.forget();assert.equal(h.journal.size,1);h.confirm(true);await h.ui.actions.forget();assert.equal(h.journal.size,0);assert.equal(h.calls.length,n);assert.equal(h.model.result,'');
});
test('malformed receipts never grant confirmed distribution; original association retained',async()=>{
 const h=setup();await h.ui.actions.refresh();h.reply(async()=>({...pin(),gameId:OTHER}));await assert.rejects(h.ui.actions.publish());assert.equal(h.model.result,'');assert.equal(h.model.publishDisabled,true);h.reply(async()=>({...receipt(),distribution:{...receipt().distribution,state:'confirmed',visibleAt:null}}));await assert.rejects(h.ui.actions.query());assert.equal(h.model.result,'');assert.equal(h.model.retryDisabled,true);
});
test('broken storage and readback mismatch stop POST before unknown key can be lost',async()=>{
 for(const storage of [{getItem:()=>'{bad',setItem(){},removeItem(){}},{getItem:()=>null,setItem(){},removeItem(){}}]){const h=setup(storage);await h.ui.actions.refresh();await assert.rejects(h.ui.actions.publish());assert.equal(h.calls.some(c=>c[1]),false);assert.equal(h.model.publishDisabled,true);}
});
test('dirty name guards selection and unload; cancellation preserves old selection/input',async()=>{
 const h=setup();await h.ui.actions.refresh();assert.equal(h.ui.canLeave(true),true);h.ui.actions.setName('未提交');h.confirm(false);h.ui.actions.select(OTHER);assert.equal(h.model.selected,GAME);assert.equal(h.model.name,'未提交');assert.equal(h.ui.canLeave(),false);const n=h.calls.length;await h.ui.actions.refresh();assert.equal(h.calls.length,n);h.confirm(true);h.ui.actions.select(OTHER);assert.equal(h.model.name,'臥龍');assert.equal(h.ui.canLeave(true),true);
});
test('identity change during publish consent cannot overwrite the next actor journal',async()=>{
 const h=setup();await h.ui.actions.refresh();
 const next={user:{...author().user,id:OTHER}},key='editor-publication-operation:'+OTHER;
 const saved=JSON.stringify({actorId:OTHER,version:1,gameId:OTHER,key:'other_original_operation',name:'另一作者原稿'});
 h.journal.set(key,saved);const before=[...h.journal.entries()],n=h.calls.length;
 h.confirm(()=>{h.identity(next);return true;});
 await h.ui.actions.publish().catch(()=>{});
 assert.deepEqual([...h.journal.entries()],before);assert.equal(h.calls.length,n);assert.match(h.model.operation,/other_original_operation/);
});
test('identity change during forget consent cannot delete another actor journal',async()=>{
 const h=setup();await h.ui.actions.refresh();await h.ui.actions.publish();
 const next={user:{...author().user,id:OTHER}},key='editor-publication-operation:'+OTHER;
 h.journal.set(key,JSON.stringify({actorId:OTHER,version:1,gameId:OTHER,key:'other_original_operation',name:'另一作者原稿'}));
 const before=[...h.journal.entries()],n=h.calls.length;
 h.confirm(()=>{h.identity(next);return true;});await h.ui.actions.forget();
 assert.deepEqual([...h.journal.entries()],before);assert.equal(h.calls.length,n);assert.match(h.model.operation,/other_original_operation/);
});
test('identity change during dirty selection or refresh consent cannot retarget or read for the next actor',async()=>{
 for(const action of ['refresh','select']){
  const h=setup();await h.ui.actions.refresh();h.ui.actions.setName('未保存');const n=h.calls.length;
  h.confirm(()=>{h.identity({user:{...author().user,id:OTHER}});return true;});
  if(action==='refresh')await h.ui.actions.refresh();else h.ui.actions.select(OTHER);
  assert.equal(h.calls.length,n);assert.equal(h.model.selected,null);assert.equal(h.model.name,'');assert.deepEqual(h.model.games,[]);
 }
});
test('unauthorized accounts and late replies cannot show private data or continue POST',async()=>{
 for(const actor of [null,{user:{...author().user,mustChangePassword:true}},{user:{...author().user,role:'viewer'}}]){const h=setup();h.identity(actor);await assert.rejects(h.ui.actions.refresh());assert.equal(h.calls.length,0);assert.deepEqual(h.model.games,[]);assert.equal(h.model.locked,true);}
 const h=setup();let resolve;h.reply(()=>new Promise(done=>{resolve=done;}));const p=h.ui.actions.refresh();h.identity(null);resolve({games:[row()]});await p;assert.deepEqual(h.model.games,[]);
 const k=setup();await k.ui.actions.refresh();k.reply(()=>new Promise(done=>{resolve=done;}));const post=k.ui.actions.publish();k.identity(null);resolve(pin());await post;assert.equal(k.model.result,'');assert.equal(k.calls.filter(c=>c[0].includes('/publish-operations/')).length,0);
});
