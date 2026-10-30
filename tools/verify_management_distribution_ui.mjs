// Actual controller, owned display/session/transport seams; not an authority/browser certificate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const moduleURL = 'data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/management.txt')).toString('base64');
const { installGameManagement } = await import(moduleURL);
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',G='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',R='cccccccc-cccc-4ccc-8ccc-cccccccccccc',T='2026-10-15T00:00:00.000Z';
const actor={user:{id:A,role:'admin',version:1,mustChangePassword:false}},key='editor-management-operation:'+A;
const failure=(status,code)=>Object.assign(new Error(code),{status,code});
const parse=text=>{try{return JSON.parse(text);}catch(cause){throw new Error('owned journal JSON',{cause});}};
let checks=0;
function setup(action='list') {
 let model;
 // Legacy assertion labels resolve only display facts; no fake DOM or event wiring.
 const nodes=new Proxy({}, {get(_target,id){if(id==='management-games')return {children:model.games.map(g=>({children:[{},...g.actions]}))};if(id==='management-editor')return {hidden:model.locked};const name=id.slice('management-'.length);return {disabled:model[name+'Disabled'],textContent:model[name]??''};}});
 const journal=new Map(),calls=[],prompts=[];let identity=structuredClone(actor),consent=true,storeMode='ok';
 const g={gameId:G,creatorAccount:'owned',name:null,introduction:null,currentReleaseId:R,listed:action==='unlist',restricted:action==='clear-restriction',rowRevision:'4',createdAt:T,modifiedAt:T};
 const result=action==='list'?{gameId:G,ownerId:A,metadata:{name:'正式名稱',introduction:''},draftRevision:'1',rowRevision:'5',currentReleaseId:R,nextOrdinal:'1.1',listed:true,restricted:false,createdAt:T,modifiedAt:T}:{gameId:G,action,listed:false,restricted:action==='unlist',rowRevision:'5',eventAt:T};
 const observed={version:1,gameId:G,result,distribution:{gameId:G,operationId:R,generation:2,kind:action==='list'?'listing':'restriction',state:'pending',visibleAt:null,recoveryRequired:false}};
 let post=async()=>structuredClone(result),get=async()=>structuredClone(result),status=async()=>structuredClone(observed);
 const storage={getItem:k=>journal.get(k)??null,setItem(k,v){if(storeMode==='throw')throw new Error('owned quota');if(storeMode!=='silent')journal.set(k,v);},removeItem:k=>journal.delete(k)};
 let confirmHook=()=>{};
 const confirm=text=>{prompts.push(text);confirmHook();return consent;};
 const api=async(path,value,options)=>{calls.push({path,value:structuredClone(value),options:structuredClone(options)});if(value!==undefined)return post();if(path==='/api/admin/games')return {games:[g]};if(path.endsWith('/distribution'))return status();if(path.includes('/management-operations/'))return get();throw new Error('unexpected UI path');};
 let ui;const mount=()=>{ui=installGameManagement({api,authority:()=>identity,work:fn=>fn(),isBusy:()=>false,storage,confirm,publish:value=>{model=value;}});ui.setIdentity(identity);};mount();
 return {nodes,get model(){return model;},journal,calls,prompts,result,observed,g,mount,get ui(){return ui;},load:()=>ui.actions.refresh(),start:()=>ui.actions.start(model.games[0].gameId,model.games[0].rowRevision,action),query:()=>ui.actions.query(),retry:()=>ui.actions.retry(),forget:()=>ui.actions.forget(),text:()=>nodes['management-result'].textContent,posts:()=>calls.filter(c=>c.value!==undefined),post:fn=>{post=fn;},get:fn=>{get=fn;},status:fn=>{status=fn;},confirmHook:fn=>{confirmHook=fn;},consent:v=>{consent=v;},storeMode:v=>{storeMode=v;},identity:v=>{identity=v;ui.setIdentity(v);}};
}
for(const action of ['list','unlist','clear-restriction']){
 const f=setup(action);await f.load();f.post(async()=>{assert.ok(f.journal.has(key),'journal before POST');return structuredClone(f.result);});await f.start();
 const saved=parse(f.journal.get(key)),post=f.posts()[0];assert.equal(saved.action,action);assert.equal(post.options.key,saved.key);assert.equal(post.options.revision,'4');let expectedBody={};if(action==='list')expectedBody={action:'list',expectedRowRevision:'4'};else if(action==='unlist')expectedBody={action:'unlist'};assert.deepEqual(post.value,expectedBody);
 assert.match(f.text(),/本地已提交.*分發待確認/);assert.equal(f.nodes['management-retry'].disabled,true);assert.ok(f.journal.has(key));checks++;
 f.observed.distribution.state='confirmed';f.observed.distribution.visibleAt=T;await f.query();assert.match(f.text(),/此次分發曾於.*不是目前上架/);checks++;
 f.observed.distribution.recoveryRequired=true;await f.query();assert.match(f.text(),/恢復鎖/);const before=f.calls.length;f.mount();assert.equal(f.calls.length,before);assert.equal(f.text(),'');await f.query();assert.match(f.text(),/恢復鎖/);checks++;
 const prompts=f.prompts.length;assert.equal(f.ui.canLeave(true),false);assert.equal(f.prompts.length,prompts);f.consent(false);f.forget();assert.ok(f.journal.has(key));f.consent(true);f.forget();assert.equal(f.journal.has(key),false);assert.equal(f.posts().length,1);checks++;
}
for(const action of ['list','unlist','clear-restriction']){
 const f=setup(action);await f.load();f.post(async()=>{throw failure(503,'LOST');});await assert.rejects(f.start());assert.equal(f.nodes['management-retry'].disabled,true);const original=structuredClone(f.posts()[0]);f.mount();await f.load();f.get(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());assert.equal(f.nodes['management-retry'].disabled,false);
 f.g.rowRevision='999';f.post(async()=>structuredClone(f.result));f.get(async()=>structuredClone(f.result));await f.retry();assert.deepEqual(f.posts()[1],original);assert.match(f.text(),/本地已提交/);f.get(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());assert.equal(f.nodes['management-retry'].disabled,true);checks++;
}
for(const [code,status] of [['GAME_NOT_FOUND',404],['DISTRIBUTION_NOT_CONFIGURED',503],['DISTRIBUTION_STATUS_UNAVAILABLE',503],['OPERATION_REVOKED',409],['GAME_DELETING',409],['SESSION_INVALID',401]]){
 const f=setup();await f.load();f.post(async()=>{throw failure(503,'LOST');});await assert.rejects(f.start());f.get(async()=>{throw failure(status,code);});await assert.rejects(f.query());assert.equal(f.nodes['management-retry'].disabled,true);assert.ok(f.journal.has(key));checks++;
}
for(const mutate of [v=>{v.gameId=R;},v=>{v.extra=1;},v=>{v.result.rowRevision='7';},v=>{v.distribution=null;},v=>{v.distribution.operationId='x';},v=>{v.distribution.kind='publish';},v=>{v.distribution.generation=0;},v=>{v.distribution.state='done';},v=>{v.distribution.visibleAt=T;},v=>{v.distribution.recoveryRequired=1;},v=>{v.distribution.extra=1;}]){
 const f=setup();await f.load();await f.start();const bad=structuredClone(f.observed);mutate(bad);f.status(async()=>bad);await assert.rejects(f.query());assert.doesNotMatch(f.text(),/此次分發曾於/);assert.equal(f.nodes['management-retry'].disabled,true);checks++;
}
{
 const f=setup('clear-restriction');await f.load();f.result.rowRevision='4';f.observed.distribution=null;await f.start();assert.match(f.text(),/沒有新增分發/);assert.doesNotMatch(f.text(),/分發待確認|此次分發曾於/);checks++;
}
for(const mode of ['throw','silent']){const f=setup();await f.load();f.storeMode(mode);await assert.rejects(f.start(),/無法保留/);assert.equal(f.posts().length,0);assert.equal(f.nodes['management-query'].disabled,true);checks++;}
for(const bad of ['{','{}','x'.repeat(20001)]){const f=setup();f.journal.set(key,bad);f.mount();await f.load();await assert.rejects(f.start());assert.equal(f.posts().length,0);checks++;}
{
 const f=setup();await f.load();await f.start();f.status(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());assert.equal(f.nodes['management-retry'].disabled,true);assert.match(f.text(),/本地已提交/);checks++;
 f.identity({user:{...actor.user,version:2}});f.get(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());await assert.rejects(f.retry());checks++;
 f.identity({user:{...actor.user,id:R}});assert.equal(f.text(),'');assert.equal(f.nodes['management-operation'].textContent.includes(parse(f.journal.get(key)).key),false);assert.ok(f.journal.has(key));checks++;
}
{
 const f=setup();await f.load();let release;f.post(()=>new Promise(r=>{release=r;}));const running=f.start();f.identity(null);release(f.result);await running;assert.equal(f.text(),'');assert.equal(f.calls.some(c=>c.path.includes('/management-operations/')),false);checks++;
}
{
 const f=setup();await f.load();await f.start();let release,entered;const ready=new Promise(r=>{entered=r;});f.status(()=>new Promise(r=>{release=r;entered();}));const old=f.query();await ready;f.status(async()=>({...f.observed,distribution:{...f.observed.distribution,state:'confirmed',visibleAt:T}}));await f.query();release(f.observed);await old;assert.match(f.text(),/此次分發曾於/);checks++;
}
for(const role of ['author','admin']){const f=setup();f.identity({user:{...actor.user,role,mustChangePassword:role==='admin'}});assert.equal(f.nodes['management-editor'].hidden,true);await assert.rejects(f.load());assert.equal(f.calls.length,0);checks++;}
{
 const f=setup();await f.load();f.g.currentReleaseId=null;await f.load();assert.equal(f.nodes['management-games'].children[0].children[1].disabled,true);await assert.rejects(f.start());f.g.currentReleaseId=R;f.g.restricted=true;await f.load();await assert.rejects(f.start());assert.equal(f.posts().length,0);checks++;
}
{
 const f=setup();await f.load();const n=f.calls.length;f.model.games[0].gameId=R;f.model.games[0].actions[0].disabled=true;f.ui.render();assert.equal(f.model.games[0].gameId,G);assert.equal(f.model.games[0].actions[0].disabled,false);assert.doesNotMatch(JSON.stringify(f.model),/metadata|sourceDigest|csrf/);assert.equal(f.calls.length,n);checks++;
 await assert.rejects(f.ui.actions.start(R,'4','list'));await assert.rejects(f.ui.actions.start(G,'999','list'));f.consent(false);await f.start();assert.equal(f.posts().length,0);assert.equal(f.journal.size,0);checks++;
}
// Confirmation callbacks model invalidation while a native dialog is open.
for (const transition of ['other', 'version', 'logout', 'aba']) {
 const f=setup(); await f.load();
 const next={user:{...actor.user,id:transition==='other'?R:A,version:transition==='version'?2:1}};
 f.confirmHook(()=>{if(transition==='logout'||transition==='aba')f.identity(null);if(transition!=='logout')f.identity(next);});
 await assert.rejects(f.start()); assert.equal(f.posts().length,0); assert.equal(f.journal.size,0); checks++;
}
for (const operation of ['forget','retry']) {
 const f=setup();await f.load();f.post(async()=>{throw failure(503,'LOST');});await assert.rejects(f.start());
 f.get(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());
 const original=f.journal.get(key),otherKey='editor-management-operation:'+R;
 const other={...parse(original),actorId:R,key:'owned-other-management-key'};f.journal.set(otherKey,JSON.stringify(other));
 f.confirmHook(()=>f.identity({user:{...actor.user,id:R}}));
 await assert.rejects(f[operation]());assert.equal(f.journal.get(key),original);assert.equal(f.journal.get(otherKey),JSON.stringify(other));assert.equal(f.posts().length,1);checks++;
}
{
 const f=setup();await f.load();f.post(async()=>{throw failure(503,'LOST');});await assert.rejects(f.start());
 f.get(async()=>{throw failure(404,'MANAGEMENT_OPERATION_NOT_FOUND');});await assert.rejects(f.query());
 let query,release;f.get(()=>new Promise(r=>{release=r;}));f.confirmHook(()=>{query=f.query();});
 await assert.rejects(f.retry());assert.equal(f.posts().length,1);release(f.result);await query;checks++;
}
process.stdout.write(JSON.stringify({checks,scope:'Actual management controller with owned display/session/transport seams; no server authority proof'})+'\n');
