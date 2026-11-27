import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCellPaints, cellKind, compileCellMap, convertCellMap, openCellDecorEditor, EMPTY_CELL } from '../web/src/content/authoring/cellmap.js';
import { baseMapSaveLane } from '../server/basemapsavelane.js';
import { mapPositionProblems } from '../web/src/editor/mappositionvalidation.js';
import { reconcileCellRoads } from '../server/copyprofile.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';

function fixture() {
  const n = 464 * 336, bounds = { width: 464, height: 336, minX: -40, minY: -40, tileSize: 16 };
  const componentDefinitions = Object.fromEntries([0, 12, 95, 166, 205, 212, 255].map(tile => [`tile-${tile}`, { id: `tile-${tile}`, category: 'atomic-original', revision: '1', anchor: [0, 0], footprint: [[0, 0]], variants: { original: { tiles: [[0, 0, tile]] } }, ruleRecipeRef: 'ki-byte-stamp-1', visualRef: `MMAP.MDL:tile-${tile}` }]));
  const stamp = (id, tile, x) => ({ id, definitionRef: `tile-${tile}`, x, y: -40 });
  return { schemaVersion: 1, componentDefinitions, selectionGroups: [], map: { bounds, base: { policy: 'sea-ground-1', terrainRef: Array(n).fill(95), geography: Array(n).fill(1), unknownUnderlays: {} },
    placements: [[-38,'a'],[-35,'b']].map(([x, cityId]) => ({ x, y: -40, id: cityId, cityId, componentRef: 'tile-205' })), roads: [{ id: 'road', fromCityId: 'a', toCityId: 'b', travelKind: 'land', geometry: [-37,-36].map(x => ({ x, y: -40 })), components: [stamp('gate1',212,-37),stamp('gate2',212,-36)] }],
    decorations: [stamp('land',0,-40), { ...stamp('river',12,-40), waterClass: 'river' }, stamp('mountain',166,-40), stamp('covered-by-road',255,-37), stamp('painted-sea',95,-34), stamp('zero',0,-33), stamp('last',255,-32)], waterGroups: [] } };
}

test('real JSON roundtrip: one value per coordinate; no hidden object IDs, separate rule values, real road and center', () => {
  const s=fixture(), legacy=compileMapSource(s,{mapExtent:true}), map=JSON.parse(JSON.stringify(convertCellMap(s))), out=compileCellMap(map);
  const data=Buffer.from(map.cellsLE,'base64');
  assert.equal(data.byteLength,311808);
  assert.deepEqual(Array.from({length:9},(_,i)=>data.readUInt16LE(i*2)),[166,EMPTY_CELL,205,212,212,205,95,0,255]);
  assert.ok(!JSON.stringify(map).includes('covered-by-road'));
  assert.deepEqual(out,legacy); assert.equal(out.geography[0],2);assert.equal(out.minimapGeography[0],0);
  assert.deepEqual([EMPTY_CELL,0,190,202,205,212,223].map(cellKind),['empty','decor','decor','road','city','road','decor']);
  // Same storage size even if every cell now has a material.
  for(let i=0;i<data.length;i+=2) if(data.readUInt16LE(i)===EMPTY_CELL) data.writeUInt16LE(166,i);
  const full={...map,cellsLE:data.toString('base64')};assert.equal(full.cellsLE.length,map.cellsLE.length);assert.equal(compileCellMap(full).terrainBytes.at(-1),166);
});

test('flat painting never appends an instance; clearing and undo include the rule result, failed brush commits nothing', () => {
  const s=fixture(), map=convertCellMap(s), editor=openCellDecorEditor(map,s.componentDefinitions);
  const first={x:-40,y:-40}, second={x:-39,y:-40}, road={x:-37,y:-40};
  assert.throws(()=>editor.paint([first,road],0),/not a decoration/); assert.deepEqual(editor.snapshot(),map);
  assert.equal(editor.paint([first,second,second],0),2); const painted=editor.snapshot(), p=compileCellMap(painted);
  assert.equal(p.terrainBytes[0],0);assert.equal(p.geography[0],1);assert.equal(p.minimapGeography[0],0);
  assert.equal(editor.paint([first],0),0);editor.undo();assert.deepEqual(editor.snapshot(),map);
  assert.equal(editor.paint([first],EMPTY_CELL),1);const clear=compileCellMap(editor.snapshot());
  assert.equal(clear.terrainBytes[0],95);assert.equal(clear.geography[0],1);assert.equal(clear.minimapGeography[0],1);
  editor.undo();assert.deepEqual(editor.snapshot(),map);
});

test('overlapping transfer snapshots both material and geography; clear and rebind respect road references', () => {
  const legacy=fixture(), source={...legacy,gameId:'system-base-map',cities:{a:{},b:{}},map:convertCellMap(legacy)};
  const point=x=>({x,y:-40}), shift={op:'cell-transfer',points:[point(-40)],dx:1,dy:0,copy:true};
  const copy=applyCellPaints(source,[shift]); assert.equal(compileCellMap(copy.map).geography[1],2);
  const moved=applyCellPaints(copy,[{...shift,points:[point(-34),point(-33)],copy:false}]);
  assert.deepEqual(Array.from({length:3},(_,i)=>Buffer.from(moved.map.cellsLE,'base64').readUInt16LE((6+i)*2)),[256,95,0]);
  assert.throws(()=>applyCellPaints(source,[{...shift,dx:2}]),/覆蓋/);
  const clear={op:'cell-clear',points:[point(-37)]}, unbind={op:'city-unbind',pieceId:'a'};
  assert.throws(()=>applyCellPaints(source,[unbind]),/相連道路/);
  assert.throws(()=>applyCellPaints(source,[{...clear,points:[point(-38)]}]),/先解綁/);
  const draft=applyCellPaints(source,[clear,unbind]); assert.equal(draft.map.placements[0].cityId,null);
  const rebound=applyCellPaints(draft,[{op:'city-bind',pieceId:'a',cityId:'a'}]);assert.deepEqual(rebound.cities.a,point(-38));
  assert.equal(applyCellPaints(draft,[{...clear,points:[point(-38)]}]).map.placements.length,1);
  assert.equal(source.map.roads.length,1);
});

test('library road and city stamps edit independent cells; no implicit edges, binds or partial writes',()=>{
  const legacy=fixture(), source={...legacy,gameId:'system-base-map',cities:{a:{},b:{},c:{}},map:convertCellMap(legacy)};
  const road={op:'cell-stamp',x:-31,y:-40,tile:212}, city={...road,x:-30,tile:205,pieceId:'system-base-map#city-piece-'+'1'.repeat(64)};
  const draft=applyCellPaints(source,[road,city]); assert.equal(draft.map.roads.length,1); assert.equal(draft.map.placements.at(-1).cityId,null);
  assert.equal(draft.map.geographyBits,source.map.geographyBits);assert.equal(Buffer.from(draft.map.cellsLE,'base64').readUInt16LE(18),212);
  assert.throws(()=>compileCellMap(draft.map),/placements\[2\]\.cityId invalid/);assert.throws(()=>applyCellPaints(source,[road,{...city,x:-38}]),/已有道路或據點/);
  assert.equal(source.map.placements.length,2);assert.equal(Buffer.from(source.map.cellsLE,'base64').readUInt16LE(18),EMPTY_CELL);
});

test('save certifies an unregistered bent east-to-west gate chain and explains a missing segment',()=>{
  const legacy=fixture(), map=convertCellMap(legacy), data=Buffer.from(map.cellsLE,'base64');
  const tile=(x,y,t)=>data.writeUInt16LE(t,2*((y+40)*464+x+40));
  tile(-35,-40,95); map.placements[1]={...map.placements[1],x:-29,y:-37};tile(-29,-37,205);
  const path=[[-37,-40],[-36,-40],[-35,-40],[-34,-40],[-34,-39],[-34,-38],[-34,-37],[-33,-37],[-32,-37],[-31,-37],[-30,-37]];
  path.forEach(([x,y],i)=>tile(x,y,i===0||i===path.length-1?212:184));
  const game={gameId:'example',cities:{a:{name:'右北平'},b:{name:'北平'}},map:{...map,roads:[],cellsLE:data.toString('base64')}};
  const [road]=reconcileCellRoads(game);assert.deepEqual(new Set([road.fromCityId,road.toCityId]),new Set(['a','b']));assert.equal(road.geometry.length,path.length);compileCellMap(game.map);
  assert.deepEqual(reconcileCellRoads(game),[]);assert.equal(game.map.roads[0],road);
  const broken=applyCellPaints(game,[{op:'cell-clear',points:[{x:-34,y:-38}]}]);assert.equal(broken.map.roads.length,0);
  assert.throws(()=>reconcileCellRoads(broken),/右北平（-38, -40）.*東門.*路鏈中斷.*-34, -39/);assert.equal(broken.map.roads.length,0);
  tile(-34,-38,190);broken.map.cellsLE=data.toString('base64');assert.throws(()=>reconcileCellRoads(broken),/路鏈中斷/,'BE is decor');
  tile(-34,-38,184);broken.map.cellsLE=data.toString('base64');assert.equal(reconcileCellRoads(broken)[0].id,road.id);
});

test('a reachable city does not excuse a broken corridor; decorations bypass topology checks',()=>{
  const legacy=fixture(), map=convertCellMap(legacy);
  const data=Buffer.from(map.cellsLE,'base64'), point=(x,y)=>({x,y});
  // The original a–b edge stays intact. An unfinished side road leaves a's south gate.
  data.writeUInt16LE(212,(464+2)*2); data.writeUInt16LE(184,(2*464+2)*2);
  const game={gameId:'test',cities:{a:{name:'甲'},b:{name:'乙'}}, map:{...map,cellsLE:data.toString('base64')}};
  assert.throws(()=>reconcileCellRoads(game),/道路未接通/);
  assert.throws(()=>compileCellMap(game.map),/道路未接通/);
  assert.ok(mapPositionProblems(game).find(p=>p.code==='ROAD_UNLINKED').cells.some(([x,y])=>x===-38&&y===-38));
  const decor={op:'cell-clear',points:[point(-40,-40)]};
  assert.equal(baseMapSaveLane(game,game,[...Array(1024).fill({op:'cell-paint'}),decor]),'direct');
  assert.equal(baseMapSaveLane(game,game,[decor,{op:'cell-clear',points:[point(-38,-38)]}]),'full');
  assert.equal(baseMapSaveLane(game,game,[{op:'city-bind'},decor]),'full');
  data.writeUInt16LE(256,(2*464+2)*2);game.map.cellsLE=data.toString('base64');assert.deepEqual(reconcileCellRoads(game),[],'a city can have an unused south gate');
});

test('city and road cells move, retain identities and trigger road diagnostics; a bound roadless town is valid',()=>{
  const legacy=fixture(), map=convertCellMap(legacy), raw='00'.repeat(42);
  const game={...legacy,map,gameId:'test',cities:{a:{cityId:'a',runtimeSlot:0,x:-38,y:-40},b:{cityId:'b',runtimeSlot:1,x:-35,y:-40}},chapters:{one:{state:{cities:[{idx:0,raw}],nativeCityRecordRaw:[raw]}}}};
  const move={op:'cell-transfer',points:[{x:-38,y:-40}],dx:0,dy:4,copy:false};
  const city=applyCellPaints(game,[move]);assert.equal(baseMapSaveLane(game,city,[move]),'full');
  assert.deepEqual(city.map.placements[0],{...map.placements[0],y:-36});assert.equal(city.cities.a.y,-36);
  const state=city.chapters.one.state;assert.equal(state.cities[0].y,-36);assert.equal(state.cities[0].raw.slice(16,24),'daffdcff');assert.equal(state.nativeCityRecordRaw[0],state.cities[0].raw);
  assert.equal(game.chapters.one.state.cities[0].raw,raw);assert.equal(city.map.roads.length,0);
  const shiftRoad={...move,points:[{x:-37,y:-40}],dy:5};const road=applyCellPaints(game,[shiftRoad]);assert.equal(baseMapSaveLane(game,road,[shiftRoad]),'full');
  assert.ok(mapPositionProblems(road).some(p=>p.cells.some(([x,y])=>x===-37&&y===-35)));assert.throws(()=>reconcileCellRoads(road),/道路未接通|路鏈中斷/);
  assert.throws(()=>applyCellPaints(game,[{...move,copy:true}]),/不能複製/);assert.throws(()=>applyCellPaints(game,[{...move,dx:1,dy:0}]),/不可覆蓋/);
  const isolated=applyCellPaints(city,[{op:'cell-clear',points:map.roads[0].geometry}]);assert.deepEqual(reconcileCellRoads(isolated),[]);compileCellMap(isolated.map);
  assert.ok(!mapPositionProblems(isolated).some(p=>p.code==='MAP_CONNECTION'));
});

test('refuse city / road conflicts, wrong extent, unknown base, invalid planes, no silent collapse', () => {
  const source=fixture(), map=convertCellMap(source);
  const edit=(i,tile)=>{const bytes=Buffer.from(map.cellsLE,'base64');bytes.writeUInt16LE(tile,i*2);return {...map,cellsLE:bytes.toString('base64')};};
  assert.throws(()=>compileCellMap(edit(3,166)),/non-road cell \(-37,-40\)/);
  assert.throws(()=>compileCellMap(edit(2,166)),/city binding.*\(-38,-40\)/);
  assert.throws(()=>compileCellMap(edit(0,205)),/city binding.*\(-40,-40\)/);
  assert.throws(()=>compileCellMap(edit(0,257)),/material/);
  assert.throws(()=>compileCellMap({...map,geographyBits:''}),/length/);
  assert.throws(()=>compileCellMap({...map,roads:source.map.roads}),/overlays/);
  assert.throws(()=>compileCellMap({...map,bounds:{...map.bounds,width:465}}),/unsupported/);
  delete source.map.base.policy; source.map.base.terrainRef[0]=null;assert.throws(()=>convertCellMap(source),/legacy base/);
});
