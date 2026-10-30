// UI projection + recording native canvas; not an original-rule certificate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const {installMapViewer} = await import('data:text/javascript;base64,'+Buffer.from(readFileSync('server/public/mapview.txt')).toString('base64'));
const GAME='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const game={gameId:GAME,metadata:{name:'<img>',introduction:''},draftRevision:'1'};
const road={id:'road-0',fromCityId:'city-000',toCityId:'city-002',travelKind:'land',geometry:[{x:1,y:1},{x:2,y:1}]};
const detail={gameId:GAME,draftRevision:'1',map:{placements:2,roads:[road]},strongholds:[{cityId:'city-000',x:5,y:5}],privateSource:'NOT_FOR_VUE'};
const topology={gameId:GAME,moves:[{cityId:'city-000',x:9,y:9}],rebuilds:[],blocked:true};
function setup(gameContext) {
  let actor={user:{id:'u',role:'author',mustChangePassword:false}},model,busy=false,hook=null;
  const log=[],calls=[],rows=[structuredClone(game)],body=structuredClone(detail),topo=structuredClone(topology),context={};
  for(const name of ['clearRect','fillRect','beginPath','moveTo','lineTo','stroke'])context[name]=(...args)=>log.push([name,...args]);
  for(const name of ['fillStyle','strokeStyle','lineWidth'])Object.defineProperty(context,name,{set:value=>log.push([name,value])});
  const canvas={width:384,height:256,getContext:()=>context};
  const ui=installMapViewer({gameContext,authority:()=>actor,isBusy:()=>busy,getCanvas:()=>canvas,publish:value=>{model=value;},work:async fn=>{if(busy)return;busy=true;try{return await fn();}finally{busy=false;ui.render();}},api:async(path,value)=>{
    assert.equal(value,undefined);calls.push(path);if(hook){const result=await hook(path);if(result!==undefined)return result;}
    if(path==='/api/games')return {games:rows};if(path.includes('/draft?'))return structuredClone(body);if(path.endsWith('/topology'))return structuredClone(topo);throw new Error(path);
  }});ui.setIdentity(actor);
  return {ui,a:ui.actions,canvas,log,calls,rows,body,topo,get model(){return model;},set hook(value){hook=value;},set identity(value){actor=value;ui.setIdentity(value);}};
}
test('explicit read only, projected text no raw geometry/source, native colors and exact coordinates unchanged',async()=>{
  const s=setup();assert.equal(s.calls.length,0);await s.a.refresh();assert.deepEqual(s.calls,['/api/games','/api/games/'+GAME+'/draft?revision=1','/api/games/'+GAME+'/topology']);assert.ok(s.model.lines.some(x=>x.includes('道路 1')));assert.ok(s.model.lines.some(x=>x.includes('拓撲意向 1')&&x.includes('斷路 1')&&x.includes('存盘发布阻挡')));assert.ok(s.log.some(x=>x[0]==='fillStyle'&&x[1]==='#d08000'));assert.ok(s.log.some(x=>x[0]==='strokeStyle'&&x[1]==='#d00000'));assert.ok(s.log.some(x=>JSON.stringify(x)===JSON.stringify(['fillRect',7,7,5,5])));assert.ok(s.log.some(x=>JSON.stringify(x)===JSON.stringify(['lineTo',2,1])));assert.ok(!JSON.stringify(s.model).includes('NOT_FOR_VUE'));s.model.games[0].label='bad';s.ui.render();assert.equal(s.model.games[0].label,'<img>／草稿 1');assert.deepEqual(s.body,detail);
});
test('malformed geometry refuses atomically before topology reads; malformed moves are unknown',async()=>{
  const s=setup(); await s.a.refresh(); const prior=[...s.model.lines];
  for(const mutate of [v=>{v.strongholds.push({...v.strongholds[0]});},v=>{v.strongholds[0].x=384;},v=>{v.strongholds[0].y=null;},v=>{v.map.roads.push({...v.map.roads[0]});},v=>{v.map.roads[0].geometry[0].x=0.5;},v=>{v.map.roads[0].geometry=[null];},v=>{v.map.roads[0].geometry={};}]) {
    const bad=structuredClone(detail); mutate(bad); s.hook=async path=>path.includes('/draft?')?bad:undefined;
    const before=s.calls.length; await assert.rejects(s.a.inspect(),/地圖幾何/);
    assert.deepEqual(s.calls.slice(before),['/api/games/'+GAME+'/draft?revision=1']); assert.deepEqual(s.model.lines,prior);
  }
  for(const moves of [[null],[{cityId:'city-000',x:Infinity,y:2}],[{cityId:'city-000',x:2,y:-1}],[{cityId:'foreign',x:1,y:1}],[topology.moves[0],topology.moves[0]]]) {
    s.hook=async path=>path.endsWith('/topology')?{...topology,moves}:undefined;
    await s.a.inspect(); assert.ok(s.model.lines.some(line=>line.includes('未確認')));
    assert.ok(!s.model.lines.some(line=>line.includes('無阻挡')));
  }
  s.hook=null; await s.a.inspect(); assert.deepEqual(s.model.lines,prior);
});
test('contradictory blocking and invalid rebuild references are unknown, never trusted overlays',async()=>{
  const s=setup(); await s.a.refresh();
  const rebuilt={roadId:'road-0',travelKind:'land'};
  const invalid=[{blocked:false},{moves:[],blocked:true},...[[null],[rebuilt,rebuilt],[{...rebuilt,roadId:'foreign'}],[{...rebuilt,travelKind:'air'}],[{travelKind:'land'}]].map(rebuilds=>({rebuilds}))];
  for(const change of invalid) {
    s.hook=async path=>path.endsWith('/topology')?{...topology,...change}:undefined;
    s.log.length=0; await s.a.inspect();
    assert.ok(s.model.lines.some(line=>line.includes('未確認')),JSON.stringify(change));
    assert.ok(!s.model.lines.some(line=>line.includes('無阻挡')));
    assert.ok(!s.log.some(row=>row[0]==='fillStyle'&&row[1]==='#d08000'));
    assert.ok(s.log.some(row=>JSON.stringify(row)===JSON.stringify(['fillRect',4,4,3,3])));
  }
  s.hook=async path=>path.endsWith('/topology')?{...topology,rebuilds:[rebuilt]}:undefined;
  await s.a.inspect(); assert.ok(s.model.lines.some(line=>line.includes('已登記重建 1')&&line.includes('存盘发布阻挡')));
  s.hook=async path=>path.endsWith('/topology')?{...topology,moves:[],rebuilds:[rebuilt],blocked:false}:undefined;
  await s.a.inspect(); assert.ok(s.model.lines.some(line=>line.includes('無阻挡')));
  assert.deepEqual(s.body,detail); assert.deepEqual(s.topo,topology);
});
test('viewport repaint scales all schematic layers without API or source changes',async()=>{
  const s=setup(); await s.a.refresh(); const count=s.calls.length;
  s.canvas.width=1536; s.canvas.height=1024; s.log.length=0; s.a.redraw();
  assert.ok(s.log.some(row=>JSON.stringify(row)===JSON.stringify(['fillRect',19,19,3,3])));
  assert.ok(s.log.some(row=>JSON.stringify(row)===JSON.stringify(['fillRect',34,34,5,5])));
  assert.ok(s.log.some(row=>JSON.stringify(row)===JSON.stringify(['lineTo',8,4])));
  assert.deepEqual(s.body,detail); assert.deepEqual(s.topo,topology); assert.equal(s.calls.length,count);
  s.identity=null; s.log.length=0; s.a.redraw();
  assert.deepEqual(s.log,[['clearRect',0,0,1536,1024]]); assert.equal(s.calls.length,count);
});
test('optional topology failure is explicitly unknown, original base drawing remains',async()=>{
  const s=setup();s.hook=async path=>{if(path.endsWith('/topology'))throw new Error('503');};await s.a.refresh();assert.ok(s.model.lines.some(x=>x.includes('未確認')));assert.ok(!s.log.some(x=>x[0]==='fillStyle'&&x[1]==='#d08000'));assert.ok(s.log.some(x=>JSON.stringify(x)===JSON.stringify(['fillRect',4,4,3,3])));
});
test('all geometry drawn while description stays bounded to first200',async()=>{
  const s=setup();s.body.map.roads=Array.from({length:202},(_,i)=>({...road,id:'road-'+i}));await s.a.refresh();assert.equal(s.model.lines.length,203);assert.equal(s.model.lines.at(-1),'…另 2 條未列出');assert.ok(s.log.filter(x=>x[0]==='lineTo'&&x[1]===2&&x[2]===1).length>=202);
});
test('selection clears pixels/overlay and does not read automatically; explicit read keeps original selected revision',async()=>{
  const s=setup();s.rows.push({...game,gameId:'second',draftRevision:'7'});await s.a.refresh();const n=s.calls.length;s.log.length=0;s.a.select('second');assert.equal(s.calls.length,n);assert.deepEqual(s.model.lines,[]);assert.deepEqual(s.log,[['clearRect',0,0,384,256]]);s.body.gameId='second';s.body.draftRevision='7';s.topo.gameId='second';await s.a.inspect();assert.ok(s.calls.some(x=>x.endsWith('second/draft?revision=7')));
});
test('identity change while draft or overlay awaits cannot resurrect pixels or old status',async()=>{
  for(const suffix of ['/draft?revision=1','/topology']) {
    const s=setup();await s.a.refresh();let resolve,reached;const waiting=new Promise(done=>{reached=done;});s.hook=path=>{if(path.endsWith(suffix)){reached();return new Promise(done=>{resolve=done;});}};const pending=s.a.inspect();await waiting;s.identity={user:{id:'other',mustChangePassword:false}};s.log.length=0;resolve(suffix.includes('draft')?structuredClone(s.body):structuredClone(s.topo));await pending;assert.deepEqual(s.model.games,[]);assert.deepEqual(s.model.lines,[]);assert.ok(s.log.every(x=>x[0]==='clearRect'));
  }
});
test('wrong draft binding rejects atomically; malformed or foreign overlay never grants an unblocked label',async()=>{
  const s=setup();await s.a.refresh();const prior=[...s.model.lines];s.hook=async path=>path.includes('/draft?')?{...s.body,gameId:'foreign'}:undefined;await assert.rejects(s.a.inspect(),/修訂無效/);assert.deepEqual(s.model.lines,prior);s.hook=async path=>path.endsWith('/topology')?{...s.topo,gameId:'foreign',blocked:false}:undefined;await s.a.inspect();assert.ok(s.model.lines.some(x=>x.includes('未確認')));assert.ok(!s.model.lines.some(x=>x.endsWith('無阻挡')));
});
test('global selection confirmation cannot resume an old identity or overwrite a newer context',async()=>{
  for (const action of ['refresh','select']) for (const change of ['identity','context']) {
    let onSelect=()=>true;
    const s=setup({current:()=>GAME,select:value=>onSelect(value)});
    s.rows.push({...game,gameId:'second',draftRevision:'7'});
    await s.a.refresh(); const before=s.calls.length;
    onSelect=()=>{
      if(change==='identity') s.identity={user:{id:'u',role:'author',mustChangePassword:false}};
      else s.ui.adoptGame('new-context');
      return true;
    };
    if(action==='refresh') await s.a.refresh(); else s.a.select('second');
    assert.equal(s.model.selected,change==='identity'?GAME:'new-context',action+'/'+change);
    assert.equal(s.model.context,''); assert.equal(s.model.message,''); assert.deepEqual(s.model.lines,[]);
    assert.deepEqual(s.calls.slice(before),action==='refresh'?['/api/games']:[],action+'/'+change+' no stale detail read');
  }
});
test('normal global adoption remains selected and requires explicit detail read',async()=>{
  let current=GAME, s;
  s=setup({current:()=>current,select:value=>{current=value;s.ui.adoptGame(value);return true;}});
  s.rows.push({...game,gameId:'second',draftRevision:'7'}); await s.a.refresh(); const before=s.calls.length;
  s.a.select('second'); assert.equal(s.model.selected,'second'); assert.deepEqual(s.model.lines,[]); assert.equal(s.calls.length,before);
  s.body.gameId='second'; s.body.draftRevision='7'; s.topo.gameId='second'; await s.a.inspect();
  assert.equal(s.model.context,'second／草稿修訂 7');
});
test('anonymous/forced accounts cannot read, logout clears canvas and private facts',async()=>{
  const s=setup();await s.a.refresh();s.identity=null;s.log.length=0;const n=s.calls.length;await assert.rejects(s.a.refresh());assert.equal(s.calls.length,n);assert.deepEqual(s.model.lines,[]);assert.ok(s.log.every(x=>x[0]==='clearRect'));s.identity={user:{id:'u',mustChangePassword:true}};await assert.rejects(s.a.inspect());assert.equal(s.calls.length,n);
});
