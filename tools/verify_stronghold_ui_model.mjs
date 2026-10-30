// Read-only projection regression. Numeric writes are covered by the shared draft controller.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const {installStronghold} = await import('data:text/javascript;base64,' + Buffer.from(readFileSync('server/public/stronghold.txt')).toString('base64'));
const GAME = '77777777-7777-4777-8777-777777777777', CH = 'chapter-1';
const game = {gameId:GAME,metadata:{name:'<img>',introduction:''},draftRevision:'1'};
const city = {idx:3,name:'北平',faction:14,troops:118,prod:20714,troopsCap:169,maxProd:21000};
const detail = {gameId:GAME,draftRevision:'1',metadata:game.metadata,privateSource:'not-reactive',chapters:[{chapterId:CH,name:'第一章',cities:[city,{...city,idx:4}]}],strongholds:[{runtimeSlot:3,placed:true,roads:['road-0'],chapters:[CH]}]};
function setup(gameContext) {
  let actor = {user:{id:'u',role:'author',mustChangePassword:false}}, model, busy = false, hook = null;
  const rows = [structuredClone(game)], body = structuredClone(detail), calls = [];
  const ui = installStronghold({authority:()=>actor,isBusy:()=>busy,publish:m=>{model=m;},gameContext,
    confirm:()=>{throw new Error('read-only adapter must not own edit confirmation');},
    work:async fn=>{if(busy)return;busy=true;try{return await fn();}finally{busy=false;ui.render();}},
    api:async(path,value,options)=>{assert.equal(value,undefined);assert.equal(options,undefined);calls.push({path,value,options});if(hook){const result=await hook(path);if(result!==undefined)return result;}
      if(path==='/api/games')return {games:rows};
      if(path.includes('/draft?revision='))return structuredClone(body);
      throw new Error('Unexpected API');
    }});
  ui.setIdentity(actor);
  return {ui,a:ui.actions,calls,body,rows,get model(){return model;},set hook(value){hook=value;},set identity(value){actor=value;ui.setIdentity(value);}};
}
test('explicit own-list read, detached display values and no write actions',async()=>{
  const s=setup();assert.equal(s.calls.length,0);await s.a.refresh();
  assert.equal(s.model.games.length,1);assert.equal(s.model.chapterId,CH);assert.equal(s.model.cities[0].roadCount,1);assert.equal(s.model.cities[0].chapterCount,1);
  assert.equal(s.model.cities[0].troops,'118');assert.equal(s.model.cities[0].prod,'20714');assert.ok(!JSON.stringify(s.model).includes('not-reactive'));
  assert.deepEqual(Object.keys(s.a).sort(),['blockers','inspect','refresh','selectChapter','selectGame']);
  s.model.cities[0].troops='100';s.model.cities[0].name='changed';s.ui.render();
  assert.equal(s.model.cities[0].name,'北平');assert.equal(s.model.cities[0].troops,'118');assert.equal(s.model.dirty,false);assert.equal(s.model.saveDisabled,true);
  assert.equal(s.ui.canLeave(),true);assert.equal(s.ui.canLeave(true),true);
});
test('read-only chapter navigation and deletion report cannot save or prompt',async()=>{
  const s=setup();s.body.chapters.push({chapterId:'other',name:'第二章',cities:[]});await s.a.refresh();const before=s.calls.length;
  await s.a.blockers(3);assert.match(s.model.message,/道路引用/);assert.match(s.model.message,/192 座/);
  s.a.selectChapter('other');assert.equal(s.model.cities.length,0);assert.equal(s.calls.length,before);
  s.a.selectChapter(CH);await s.a.inspect();assert.equal(s.calls.at(-1).path,`/api/games/${GAME}/draft?revision=1`);assert.equal(s.model.dirty,false);
});
test('global selection callback cannot resume an invalidated refresh or switch',async()=>{
  for(const action of ['refresh','selectGame']) {
    let armed=false,s;s=setup({current:()=>null,select:()=>{if(armed)s.ui.adoptGame('kept-context');return true;}});
    s.rows.push({...structuredClone(game),gameId:'other-game'});await s.a.refresh();const before=s.calls.length;armed=true;
    if(action==='refresh')await s.a.refresh();else s.a.selectGame('other-game');
    assert.equal(s.calls.length,before+(action==='refresh'?1:0));assert.equal(s.model.selected,'kept-context');assert.deepEqual(s.model.cities,[]);
  }
});
test('bad or failed detail read preserves prior exact projection',async()=>{
  const s=setup();await s.a.refresh();s.hook=async path=>path.includes('/draft?')?{...s.body,draftRevision:'999'}:undefined;
  await assert.rejects(s.a.inspect(),/修訂無效/);assert.equal(s.model.cities[0].troops,'118');assert.match(s.model.context,/修訂 1/);
  s.hook=async()=>{throw new Error('read unavailable');};await assert.rejects(s.a.inspect(),/read unavailable/);
  assert.equal(s.model.cities[0].troops,'118');assert.equal(s.model.saveDisabled,true);assert.equal(s.model.dirty,false);
});
test('references remain display-only; missing reports unknown, malformed reads atomic',async()=>{
  const s=setup();await s.a.refresh();await s.a.blockers(3);assert.match(s.model.message,/未提供/);
  s.body.strongholds[0].references=[{chapterId:CH,code:'CITY_CAPITAL_REF',detail:'勢力 #0 首都 <img>'},{chapterId:'other',code:'CITY_GOVERNOR_REF',detail:'太守武將：#0'}];
  await s.a.inspect();const before=s.calls.length;await s.a.blockers(3);assert.match(s.model.message,/chapter-1：勢力 #0 首都 <img>/);assert.match(s.model.message,/other：太守武將：#0/);assert.equal(s.calls.length,before);
  s.body.strongholds[0].references=[{chapterId:CH,code:'CITY_CAPITAL_REF',detail:4}];await assert.rejects(s.a.inspect(),/引用報告無效/);await s.a.blockers(3);assert.match(s.model.message,/勢力 #0 首都/);
  s.identity=null;assert.equal(s.model.message,'');
});
test('definition IDs follow runtime slots, not names or order; unknown stays unknown',async()=>{
  const s=setup();s.body.strongholds=[{runtimeSlot:4,cityId:'second-id',roads:[],chapters:[CH]},{runtimeSlot:3,cityId:'city-<img>',roads:[],chapters:[CH]}];
  await s.a.refresh();assert.deepEqual(s.model.cities.map(c=>c.cityId),['city-<img>','second-id']);s.model.cities[0].cityId='changed';s.ui.render();assert.equal(s.model.cities[0].cityId,'city-<img>');
  delete s.body.strongholds[1].cityId;await s.a.inspect();assert.equal(s.model.cities[0].cityId,null);s.identity=null;assert.deepEqual(s.model.cities,[]);
});
test('ambiguous or malformed definition identities preserve loaded snapshot',async()=>{
  const s=setup();s.body.strongholds[0].cityId='city-three';await s.a.refresh();const original=structuredClone(s.body.strongholds);
  for(const refs of [[{...original[0],cityId:3}],[{...original[0],cityId:''}],[original[0],{...original[0],cityId:'another'}],[original[0],{...original[0],runtimeSlot:4}],[{...original[0],runtimeSlot:-1}]]) {
    s.body.strongholds=refs;await assert.rejects(s.a.inspect(),/身份/);assert.equal(s.model.cities[0].cityId,'city-three');
  }
});
test('anonymous/forced identities and late replies cannot expose previous display',async()=>{
  const s=setup();await s.a.refresh();let finish;s.hook=path=>path.includes('/draft?')?new Promise(resolve=>{finish=resolve;}):undefined;
  const pending=s.a.inspect();s.identity={user:{id:'other',role:'author',mustChangePassword:false}};finish(structuredClone(s.body));await pending;
  assert.deepEqual(s.model.cities,[]);assert.deepEqual(s.model.games,[]);s.identity=null;const n=s.calls.length;await assert.rejects(s.a.refresh());assert.equal(s.calls.length,n);
  s.identity={user:{id:'u',role:'admin',mustChangePassword:true}};await assert.rejects(s.a.refresh());assert.equal(s.calls.length,n);
});
