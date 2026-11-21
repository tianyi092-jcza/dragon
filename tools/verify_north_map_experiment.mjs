// Isolated north-line experiment: registered Web bytes only. No running service,
// user copy, editor store, browser profile, or game saves are accessed.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeInterruptedMarch } from './fixtures/north-interrupted-march.mjs';
import { northPlayerTransport } from './fixtures/north-player-pack.mjs';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { GameBar } from '../web/src/ui/gamebar.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { aiTick, performLegionSlotAction } from '../web/src/game/ai.js';
import { prepareScenario, scenarioGridRoadContext, snapshotScenarioAssembly, assertPlayableScenario } from '../web/src/game/scenarioassembly.js';
import { createScenarioMovementMemory } from '../web/src/game/navigation/scenariomovementmemory.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createHash } from 'node:crypto';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { admitChapterCity } from '../web/src/content/authoring/gamesource.js';
import { syncRoadEndpoints } from '../server/copyprofile.js';
import { extendNorthOneRow } from '../web/src/content/authoring/mapextent.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { compileCityIdentity } from '../web/src/content/authoring/cityidentity.js';
import { buildRoad } from '../web/src/content/authoring/roadedit.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { searchStructuredRoadGraph } from '../web/src/game/navigation/structuredroadsearch.js';
import { compileMapSource, assertMapConnected } from '../web/src/content/authoring/mapcompile.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const { game } = await createPinnedCopyLoader()({gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',ownerId:'isolated'});
const original = game.map;
const before = composeMapLayers(game);
const ordered = Object.values(game.cities).sort((a,b) => a.runtimeSlot-b.runtimeSlot).map(c=>c.cityId);
for (let i=0; i<12; i++) game.map = extendNorthOneRow(game.map);
const map = game.map, bounds = map.bounds;
assert.deepEqual(bounds,{minX:0,minY:-12,width:384,height:268,tileSize:16});
let capped=map;
for(let i=12;i<20;i++) capped=extendNorthOneRow(capped);
assert.equal(capped.bounds.minY,-20);
assert.throws(()=>extendNorthOneRow(capped),/20/);
// Probe admission only, not the editing or rendering of these shapes.
for(const unsupported of [{minX:-1,width:385},{width:385},{height:257},{minX:-20,minY:-20,width:424,height:296}]) {
  assert.throws(()=>compileMapSource({...game,map:{...original,bounds:{...original.bounds,...unsupported}}},{northExperiment:true}),/unsupported map bounds/);
}
const expanded = composeMapLayers(game);
for (const plane of ['terrain','geography','minimapGeography']) assert.deepEqual(expanded[plane].slice(12*384),before[plane]);
assert.ok(expanded.terrain.slice(0,12*384).every(tile=>tile===95));
const origin = original.placements.find(p=>p.cityId==='city-000');
const dest = { ...origin, id:'placement-north', cityId:'city-north', y:-8 };
delete dest.importRef;
const geometry = Array.from({length:origin.y-dest.y-1},(_,i)=>({x:origin.x,y:origin.y-1-i}));
map.placements = [...map.placements,dest];
game.cities[dest.cityId] = { ...game.cities[origin.cityId], cityId:dest.cityId, runtimeSlot:ordered.length, name:'遼東測試城', y:dest.y };
assert.equal(admitChapterCity(game,dest.cityId,60,'ki-1995:siege:7',bounds).admitted,game.chapterOrder.length);
const stamps = geometry.map((point,i)=>({...point,id:`north-road-${i}`,definitionRef:`tile-${i===0||i===geometry.length-1?212:200}`,variantRef:'original'}));
map.decorations = [...map.decorations,...stamps];
const composed = composeMapLayers(game);
const tiles = (x,y)=>composed.terrain[(y-bounds.minY)*bounds.width+x-bounds.minX];
assert.equal(tiles(dest.x,dest.y),205);
const roadInput = {fromCityId:origin.cityId,toCityId:dest.cityId,travelKind:'land',geometry,
  cities:new Map(map.placements.map(p=>[p.cityId,p])),roads:map.roads,tiles};
assert.throws(()=>buildRoad(roadInput), /out of bounds/);
const road = {...buildRoad(roadInput,bounds),id:'north-link'};
const placements = map.placements;
const identity = compileCityIdentity({cities:game.cities,cityOrder:[...ordered,dest.cityId],placements},bounds);
assert.deepEqual(identity.cityIds.slice(0,-1),ordered);
const projection = {identity,placements};
const graph = projectStructuredRoadGraph([...map.roads,road],projection,bounds);
const options = {startCityIndex:ordered.length,stopCityIndices:[identity.indexByCityId[origin.cityId]],owner:0,readCityOwner:()=>0};
assert.equal(searchStructuredRoadGraph(projectStructuredRoadGraph(map.roads,projection,bounds),options).status,'unreachable');
const dir = await mkdtemp(join(tmpdir(),'dragon-north-road-'));
try {
  const path = join(dir,'road-graph.json');
  await writeFile(path,JSON.stringify(graph),{flag:'wx'});
  const restored = JSON.parse(await readFile(path,'utf8'));
  const result = searchStructuredRoadGraph(restored,options);
  assert.equal(result.status,'found');
  assert.equal(restored.edges[result.roadIndex].roadId,road.id);
  assert.deepEqual(restored.edges[result.roadIndex].points.map(({x,y})=>({x,y})),geometry);
  assert.ok(geometry.some((p,i)=>p.y===-1 && geometry[i-1]?.y===0));
  map.roads = [...map.roads,road];
  syncRoadEndpoints(game,origin.cityId,dest.cityId);
  for (const id of game.chapterOrder) {
    const rows = game.chapters[id].state.cities;
    assert.equal(rows.at(-1).battleMapId,'ki-1995:siege:7');
    assert.ok(rows.at(-1).neighbourCityIds.includes(origin.cityId));
    assert.ok(rows[0].neighbourCityIds.includes(dest.cityId));
  }
  assertMapConnected(game);
  const compiled = compileMapSource(game,{northExperiment:true});
  for (const {x,y} of geometry) assert.equal(compiled.roadMask[(y-bounds.minY)*bounds.width+x],1);
  assert.deepEqual(compiled.terrainBytes,Uint8Array.from(composed.terrain));
  assert.throws(()=>createWorldResources(bounds),/unsupported world dimensions/);
  // Old profiles still refuse expanded sources. Opt-in package transport is tested separately.
  assert.throws(()=>compileTrialSource(game,sha), /unsupported map bounds/);
  // Friendly transfer separates movement from siege. Only set the new city's
  // chapter ownership, before hashing/packing, never during the simulated trip.
  const chapterState = game.chapters[game.chapterOrder[0]].state;
  chapterState.cities.at(-1).faction = chapterState.cities[0].faction;
  const source = compileTrialSource(game,sha,{northExperiment:true});
  assert.deepEqual(source.roadGraph,graph);
  const transport = await northPlayerTransport(game,source);
  await assert.rejects(loadPlayerPack(transport),e=>e.code==='PLAYER_PACK_INVALID');
  const pack = await loadPlayerPack({...transport,northExperiment:true});
  try {
    const graphBytes = await (await fetch(pack.resourceURLs['asset:roadGraph'])).json();
    assert.deepEqual(graphBytes,graph);
    assert.equal(pack.chapter.cities.at(-1).y,-8);
    const env = createPlayerEnvironment(pack,{playerFaction:pack.chapter.cities[0].faction,northExperiment:true});
    await env.world.terrain.loadTerrain();
    assert.equal(env.world.terrain.terrainTile(dest.x,dest.y),205);
    const loadedGraph = await env.world.roads.loadRoadGraph();
    assert.deepEqual(loadedGraph,source.roadGraph);
    const checkpoint = { identity:{world:env.world.definition,content:{packId:game.gameId,chapterId:pack.identity.chapterId,revision:source.sourceDigest}},memory:{initialGraph:sha(JSON.stringify(loadedGraph))} };
    const plane = createScenarioMovementMemory({version:2,bounds,zeroFilled:true,spans:[]},checkpoint,false,bounds);
    plane.writeTile(origin.x,-1,1);
    assert.equal(plane.readTile(origin.x,255),0);
    const roundtrip = createScenarioMovementMemory(JSON.parse(JSON.stringify(plane.snapshot())),checkpoint,true,bounds);
    assert.equal(roundtrip.readTile(origin.x,-1),1);
    const input={raw:env.raw,idx:0,mode:'fresh',world:env.world,content:env.content};
    await assert.rejects(prepareScenario(input),/Invalid scenario assembly schema\/road version/);
    // Seed one preformed player army at its own city. Do not supply a route,
    // target, cursor, occupied tiles, intermediate positions or an arrival.
    input.raw.legions.push({slot:0,x:origin.x,y:origin.y,faction:env.player,status:0x80,troops:800,commandState:0,moveDelay:1,movePeriod:3});
    const prepared=await prepareScenario({...input,northExperiment:true});
    assert.throws(()=>assertPlayableScenario(prepared),/unstaged/);
    const sc=prepared.scenario, army=sc.legions[0], app={scenario:sc,clock:{strategicTickSerial:0},originalRng:createOriginalBattleRng({ch:0,cl:0,dh:1})};
    const bar=Object.assign(Object.create(GameBar.prototype),{app});
    const {movement}=scenarioGridRoadContext(sc);
    for (const [to,points] of [[sc.cities.at(-1),geometry],[sc.cities[0],geometry.toReversed()]]) {
      assert.ok(bar.assignMarchOrder(army,to,false));
      assert.equal(army.targetNode,to.idx);
      const trace=[], uninterrupted=[];
      let replay;
      for(let i=0;i<geometry.length;i++) {
        const x=army.x,y=army.y;
        assert.equal(movement.readTile(x,y),1);
        const visits=army.moveDelay;
        assert.equal(visits,i===0?1:army.movePeriod);
        for(let visit=1;visit<=visits;visit++) {
          app.clock.strategicTickSerial++;
          aiTick(app,{legionBatchStart:0,runCityDaily:false,settleDaily:false});
          assert.ok(!app._strategicBattleFailure,app._strategicBattleFailure?.message);
          if(replay) uninterrupted.push([app.clock.strategicTickSerial,army.x,army.y,army.moveDelay,{...army.roadPosition},movement.snapshot().spans]);
          if(visit<visits) assert.deepEqual([army.x,army.y],[x,y]);
        }
        assert.equal(movement.readTile(x,y),0);
        assert.equal(movement.readTile(army.x,army.y),1);
        trace.push([army.x,army.y]);
        if(army.y===-1 && to===sc.cities.at(-1)) replay=await probeInterruptedMarch({app,army,movement,prepared,transport,dir});
      }
      if(to===sc.cities.at(-1)) {
        assert.ok(uninterrupted.length>0);
        assert.deepEqual(replay,uninterrupted);
        console.log(JSON.stringify({checkpoint:[257,-1],matchedSlotVisits:uninterrupted.length,matched:'clock serial, position, phase, road cursor and all occupied cells',officialSave:'refused',officialRestore:'refused'}));
      }
      assert.deepEqual(trace,[...points.slice(0,-1).map(p=>[p.x,p.y]),[to.x,to.y]]);
      assert.deepEqual(army.roadPosition,{kind:'city',cityIndex:to.idx});
      performLegionSlotAction(app,army);
      assert.equal(movement.readTile(to.x,to.y),1);
      console.log(JSON.stringify({order:to.name,trace}));
    }
    // Reversing at the very first port must resolve back to the city, not
    // address point -1. Occupied candidate cells refuse without moving.
    assert.ok(bar.assignMarchOrder(army,sc.cities.at(-1),false));
    const first=geometry[0];
    movement.writeTile(first.x,first.y,1);
    assert.throws(()=>performLegionSlotAction(app,army),/field contact unresolved/);
    assert.deepEqual([army.x,army.y],[origin.x,origin.y]);
    assert.equal(movement.readTile(origin.x,origin.y),1);
    movement.writeTile(first.x,first.y,0);
    performLegionSlotAction(app,army);
    assert.ok(bar.assignMarchOrder(army,sc.cities[0],false));
    performLegionSlotAction(app,army);
    assert.deepEqual(army.roadPosition,{kind:'city',cityIndex:0});
    assert.equal(movement.readTile(first.x,first.y),0);
    assert.throws(()=>snapshotScenarioAssembly(app),/not admitted/);
  } finally { pack.close(); }
  console.log(JSON.stringify({bounds,from:[origin.cityId,origin.x,origin.y],to:[dest.cityId,dest.x,dest.y],nodes:graph.nodes.length,roadPoints:geometry.length,search:result.status,withoutLink:'unreachable',legacyFormalCompile:'rejected: unsupported map bounds',experimentalGameCompile:'passed',playerPack:'verified and loaded',playerWorld:'terrain and graph loaded',scenario:'isolated fresh',playerMarch:'friendly north and return, slot actions'}));
} finally { await rm(dir,{recursive:true,force:true}); }
