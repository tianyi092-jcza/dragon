import test from 'node:test';
import assert from 'node:assert/strict';
import { createCopyController } from '../editor-ui/src/copy.js';
const admin = () => ({user:{id:'admin',role:'admin',version:1,mustChangePassword:false},csrf:'private'});
const source = () => ({definition:{registryId:'fixed-source',private:'secret'},registered:{root:'private-root'},staged:{root:'private'}});
const row = () => ({gameId:'game-a',draftRevision:'1',metadata:{name:'<img>',introduction:'intro'},createdAt:'created',modifiedAt:'modified',listed:false,restricted:true,private:'secret'});
const pending = () => ({gameId:'game-a',state:'pending',rowRevision:'1',registryId:'fixed-source',leaseUntil:0});
function setup(options={}) {
  let identity=admin(),busy=false,model,allow=true;
  const entries=new Map(),calls=[],jumps=[],errors=[];
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  let reply=async path=>path==='/api/admin/source'?source():path==='/api/games'?{games:[row()]}:pending();
  const ui=createCopyController({api:async(...args)=>{calls.push(args);return reply(...args);},authority:()=>identity,isBusy:()=>busy,work:async action=>{if(busy)return;busy=true;try{return await action();}catch(error){errors.push(error); }finally{busy=false;ui.render();}},publish:value=>{model=value;},confirm:()=>typeof allow==='function'?allow():allow,storage:options.storage??storage,gotoGame:async id=>jumps.push(id),openDeletion:async id=>jumps.push(['deletion',id])});
  ui.setIdentity(identity);
  return {ui,calls,entries,errors,jumps,get model(){return model;},get actor(){return identity;},reply:fn=>{reply=fn;},confirm:value=>{allow=value;},identity(value){identity=value;ui.setIdentity(value);}};
}
test('explicit reads, allowlisted copies, stable jump IDs, no automatic requests',async()=>{
  const h=setup();assert.equal(h.calls.length,0);await h.ui.actions.refreshSource();assert.deepEqual(h.calls.map(c=>c[0]),['/api/admin/source','/api/games']);assert.equal(h.model.games.length,1);assert.doesNotMatch(JSON.stringify(h.model),/private-root|secret|csrf/);
  h.model.games[0].gameId='forged';await h.ui.actions.gotoGame('forged');assert.deepEqual(h.jumps,[]);await h.ui.actions.gotoGame('game-a');await h.ui.actions.openDeletion('game-a');assert.deepEqual(h.jumps,['game-a',['deletion','game-a']]);h.ui.render();assert.equal(h.model.games[0].gameId,'game-a');
});
test('reservation exact body, original key stored, original row CAS, cancel sends no POST',async()=>{
  const h=setup();await h.ui.actions.refreshSource();h.ui.actions.setField('name','新遊戲');h.ui.actions.setField('introduction','原文');assert.equal(h.ui.canLeave(true),false);h.confirm(false);assert.equal(h.ui.canLeave(),false);
  await h.ui.actions.create();const call=h.calls.at(-1);assert.deepEqual(call[1],{registryId:'fixed-source',name:'新遊戲',introduction:'原文'});assert.equal(h.entries.get('editor-copy-operation:admin'),call[2].key);assert.equal(h.model.name,'');const before=h.calls.length;await h.ui.actions.cancel();assert.equal(h.calls.length,before);
  h.confirm(true);h.reply(async()=>({...pending(),state:'canceled',rowRevision:'2'}));await h.ui.actions.cancel();assert.equal(h.calls.at(-1)[0],'/api/admin/copies/'+call[2].key+'/cancel');assert.deepEqual(h.calls.at(-1).slice(1),[{}, {revision:'1'}]);assert.equal(h.model.createDisabled,false);
});
test('unknown reservation survives reload; explicit GET resolves original key without new POST',async()=>{
  const h=setup();await h.ui.actions.refreshSource();h.ui.actions.setField('name','保留');h.reply(async()=>{throw new Error('lost');});await h.ui.actions.create();const key=h.entries.get('editor-copy-operation:admin');assert.ok(key);assert.equal(h.model.name,'保留');assert.equal(h.model.createDisabled,true);const n=h.calls.length;await h.ui.actions.create();assert.equal(h.calls.length,n);
  h.identity(admin());assert.equal(h.model.name,'');assert.equal(h.calls.length,n);h.reply(async path=>path==='/api/games'?{games:[row()]}:pending());await h.ui.actions.refresh();assert.equal(h.calls[n][0],'/api/admin/copies/'+key);assert.equal(h.model.runDisabled,false);
});
test('lost run response locks commands until GET; receipt projects no source hashes',async()=>{
  const h=setup();await h.ui.actions.refreshSource();h.ui.actions.setField('name','副本');await h.ui.actions.create();h.reply(async()=>{throw new Error('lost');});await h.ui.actions.run();assert.equal(h.model.runDisabled,true);assert.equal(h.model.cancelDisabled,true);const n=h.calls.length;await h.ui.actions.run();assert.equal(h.calls.length,n);
  h.reply(async path=>path==='/api/games'?{games:[row()]}:{gameId:'game-a',draftRevision:'1',sourceDigest:'hidden',baselineDigest:'hidden'});await h.ui.actions.refresh();assert.match(h.model.copyState,/committed/);assert.doesNotMatch(JSON.stringify(h.model),/hidden/);assert.equal(h.ui.canLeave(true),true);
});
test('404 never silently drops original key; explicit local clear does not cancel or create',async()=>{
  const h=setup();h.entries.set('editor-copy-operation:admin','original-key-123456');h.identity(admin());h.reply(async path=>{if(path==='/api/games')return {games:[]};throw Object.assign(new Error('missing'),{status:404});});h.confirm(false);await h.ui.actions.refresh();assert.equal(h.entries.size,1);assert.equal(h.model.createDisabled,true);h.confirm(true);await h.ui.actions.refresh();assert.equal(h.entries.size,0);assert.ok(h.calls.every(c=>c[1]===undefined));
});
test('revoked epoch never restores authority; stopping local tracking requires confirmation',async()=>{
  const h=setup();h.entries.set('editor-copy-operation:admin','original-key-123456');h.identity(admin());h.reply(async path=>{if(path==='/api/games')return {games:[]};throw Object.assign(new Error('revoked'),{status:409,code:'COPY_OPERATION_REVOKED'});});h.confirm(false);await h.ui.actions.refresh();assert.equal(h.entries.size,1);assert.equal(h.model.runDisabled,true);assert.match(h.model.message,/撤銷/);h.confirm(true);await h.ui.actions.refresh();assert.equal(h.entries.size,0);assert.ok(h.calls.every(c=>c[1]===undefined));
});
test('unwritable/corrupt tracking fails closed before POST',async()=>{
  const h=setup({storage:{getItem:()=>null,setItem:()=>{throw new Error('denied');},removeItem:()=>{}}});await h.ui.actions.refreshSource();h.ui.actions.setField('name','失敗');await h.ui.actions.create();assert.ok(h.calls.every(c=>c[1]===undefined));assert.equal(h.model.createDisabled,true);
  const b=setup({storage:{getItem:()=>'{broken}',setItem:()=>{},removeItem:()=>{}}});await b.ui.actions.refreshSource();assert.equal(b.model.createDisabled,true);assert.match(b.model.message,/(原鍵|上次操作記錄)不可讀/);
});
test('anonymous/forced sessions and author admin-source actions never expose prior private state',async()=>{
  for(const identity of [null,{user:{id:'author',role:'author'}},{user:{id:'admin',role:'admin',mustChangePassword:true}}]){const h=setup();h.identity(identity);await h.ui.actions.refreshSource();await h.ui.actions.installSource();await h.ui.actions.create();assert.equal(h.calls.length,0);assert.deepEqual(h.model.games,[]);}
  const h=setup();let resolve;h.reply(()=>new Promise(done=>{resolve=done;}));const p=h.ui.actions.refreshSource();h.identity(null);resolve(source());await p;assert.equal(h.model.sourceState,'');assert.equal(h.calls.length,1);
  const j=setup();await j.ui.actions.refreshSource();j.ui.actions.setField('name','舊');let finish;j.reply(()=>new Promise(done=>{finish=done;}));const write=j.ui.actions.create();j.identity(admin());finish(pending());await write;assert.equal(j.model.copyState,'');assert.equal(j.model.name,'');
});
test('author reserves a neutral game without registry selection or administrator API',async()=>{
  const h=setup();h.identity({user:{id:'author',role:'author',mustChangePassword:false}});
  assert.equal(h.model.author,true);assert.equal(h.model.sourceLocked,true);assert.equal(h.model.createDisabled,false);
  await h.ui.actions.refreshSource();await h.ui.actions.installSource();assert.equal(h.calls.length,0);
  for(const value of ['123456789','𠀀'.repeat(9),'bad\ud800']){
    h.ui.actions.setField('name',value);await h.ui.actions.create();assert.equal(h.calls.length,0);assert.equal(h.entries.size,0);
  }
  h.reply(async(path,body)=>path==='/api/games'&&!body?{games:[row()]}:pending());
  h.ui.actions.setField('name','中立新建');h.ui.actions.setField('introduction','原文');await h.ui.actions.create();
  const [path,body,options]=h.calls.at(-1);assert.equal(path,'/api/games');assert.deepEqual(body,{name:'中立新建',introduction:'原文'});
  assert.equal(h.entries.get('editor-copy-operation:author'),options.key);assert.equal(h.model.createDisabled,true);assert.match(h.model.message,/空白首章/);
  const before=h.calls.length;await h.ui.actions.create();assert.equal(h.calls.length,before);
  h.reply(async path=>path==='/api/games'?{games:[row()]}:{gameId:'game-a',draftRevision:'1'});await h.ui.actions.run();
  assert.equal(h.calls.at(-2)[0],'/api/games/create/'+options.key+'/run');assert.deepEqual(h.calls.at(-2)[2],{revision:'1'});
  assert.equal(h.model.games.length,1);assert.match(h.model.message,/不代表可運行/);assert.ok(h.calls.every(call=>!call[0].startsWith('/api/admin/')));
});
test('author lost response recovers only the original create key after identity reload',async()=>{
  const h=setup(), author=()=>({user:{id:'author',role:'author',mustChangePassword:false}});h.identity(author());
  h.ui.actions.setField('name','中立');h.reply(async()=>{throw new Error('lost');});await h.ui.actions.create();
  const key=h.entries.get('editor-copy-operation:author'), before=h.calls.length;assert.ok(key);assert.equal(h.model.createDisabled,true);
  h.identity(author());assert.equal(h.calls.length,before);h.reply(async path=>path==='/api/games'?{games:[]}:pending());await h.ui.actions.refresh();
  assert.equal(h.calls[before][0],'/api/games/create/'+key);assert.equal(h.model.runDisabled,false);
  h.confirm(false);const n=h.calls.length;await h.ui.actions.cancel();assert.equal(h.calls.length,n);
  h.confirm(true);h.reply(async()=>({...pending(),state:'canceled',rowRevision:'2'}));await h.ui.actions.cancel();
  assert.equal(h.calls.at(-1)[0],'/api/games/create/'+key+'/cancel');assert.deepEqual(h.calls.at(-1)[2],{revision:'1'});
});
test('copy confirmation cannot clear or command a new identity operation',async()=>{
  for(const action of ['refresh','cancel']){
    const h=setup();h.entries.set('editor-copy-operation:admin','original-key-123456');h.identity(admin());
    h.reply(async path=>path==='/api/games'?{games:[]}:pending());await h.ui.actions.refresh();
    h.entries.set('editor-copy-operation:author','next-actor-key-12345');
    if(action==='refresh')h.reply(async()=>{throw Object.assign(new Error('missing'),{status:404});});
    h.confirm(()=>{h.identity({user:{id:'author',role:'author',mustChangePassword:false}});return true;});
    const before=h.calls.length;await h.ui.actions[action]();
    assert.equal(h.entries.get('editor-copy-operation:author'),'next-actor-key-12345');assert.equal(h.entries.get('editor-copy-operation:admin'),'original-key-123456');
    assert.equal(h.calls.length,before+(action==='refresh'?1:0));assert.equal(h.model.copyState,'');
  }
});
test('malformed target and stale page response cannot replace display or unlock mutations',async()=>{
  const h=setup();await h.ui.actions.refreshSource();h.ui.actions.setField('name','副本');await h.ui.actions.create();h.reply(async()=>({...pending(),gameId:'wrong'}));await h.ui.actions.refresh();assert.match(h.model.copyState,/game-a/);assert.equal(h.model.runDisabled,true);
  let resolve;h.reply(()=>new Promise(done=>{resolve=done;}));const p=h.ui.actions.refresh();h.ui.pagehide();resolve(pending());await p;assert.equal(h.model.copyState,'');assert.deepEqual(h.model.games,[]);
});
