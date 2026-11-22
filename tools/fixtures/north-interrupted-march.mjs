// Pre-development probe, NOT a player save codec. MAP-EXT E9/E10: the grid
// snapshot it once recorded as refused is now formally admitted; this probe
// keeps the legacy-shape restore rejection (pre-grid metadata is never
// blessed) plus the movement-plane unit checks and the march replay.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { snapshotState } from '../../web/src/game/savegame.js';
import { prepareScenario, scenarioGridRoadContext } from '../../web/src/game/scenarioassembly.js';
import { createScenarioMovementMemory } from '../../web/src/game/navigation/scenariomovementmemory.js';
import { advanceGridMarch } from '../../web/src/game/navigation/worldgridroads.js';
import { LegionSlotBatch } from '../../web/src/game/legionscheduler.js';
import { finishLegionSlotTail } from '../../web/src/game/legionphase.js';
import { loadPlayerPack } from '../../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../../web/src/player/playerenvironment.js';

export async function probeInterruptedMarch({app,army,movement,prepared,transport,dir,env}) {
  assert.equal(army.y,-1);
  // MAP-EXT E9/E10: grid saves are formally admitted. The file below keeps
  // the legacy pre-grid metadata shape, whose restore stays rejected.
  const snapApp = { scenario: app.scenario, scenarioIdx: 0, content: env.content, world: env.world, clock: app.clock, originalRng: app.originalRng };
  const snap = snapshotState(snapApp,0,'北線隔離檢查');
  assert.equal(snap.webMeta.scenarioAssembly.roadVersion,'grid');
  assert.deepEqual(snap.webMeta.scenarioAssembly.bounds,snap.webMeta.movementMemory.bounds);
  const file=join(dir,'north-midpoint.json');
  await writeFile(file,JSON.stringify({army,plane:movement.snapshot(),metadata:prepared.metadata,serial:app.clock.strategicTickSerial}),{flag:'wx'});
  const saved=JSON.parse(await readFile(file,'utf8'));
  const pack=await loadPlayerPack({...transport,northExperiment:true});
  try {
    const env=createPlayerEnvironment(pack,{playerFaction:army.faction,northExperiment:true});
    const graph=await env.world.roads.loadRoadGraph();
    const sc=env.raw;
    // MAP-EXT E9/E10: the file carries formal grid metadata, so title-load
    // restore on fresh world objects succeeds (formal path, not a probe
    // bypass). Pre-grid metadata shapes stay rejected at the schema gate.
    const ready = await prepareScenario({raw:sc,idx:0,mode:'restore',world:env.world,content:env.content,northExperiment:true,metadata:saved.metadata,movementMemory:saved.plane});
    assert.equal(ready.metadata.roadVersion,'grid');
    assert.equal(scenarioGridRoadContext(ready.scenario).movement.readTile(saved.army.x,-1),1);
    const baseline={identity:{world:env.world.definition,content:env.content.chapter(0).reference},memory:{initialGraph:pack.identity.sourceDigest}};
    const bounds=env.world.definition;
    const restorePlane=(plane,ref=baseline)=>createScenarioMovementMemory(plane,ref,true,bounds);
    assert.throws(()=>restorePlane({...saved.plane,bounds:{...saved.plane.bounds,minY:0}}),/schema/);
    assert.throws(()=>restorePlane({...saved.plane,initialGraph:'different'}),/initial graph/);
    const other=structuredClone(baseline);other.identity.content.chapterId+='-other';
    assert.throws(()=>restorePlane(saved.plane,other),/identity/);
    const plane=restorePlane(saved.plane), record=saved.army;
    assert.deepEqual(record.roadPosition,army.roadPosition);
    assert.equal(record.targetNode,sc.cities.at(-1).idx);
    assert.equal(plane.readTile(record.x,-1),1);
    assert.equal(plane.readTile(record.x,255),0);
    const visits=[];
    for(let i=0;i<64 && record.roadPosition.kind==='road';i++) {
      const batch=new LegionSlotBatch({firstSlot:0,endSlot:16,settleDaily:false});
      for(;;){
        const op=batch.next(slot=>slot===record.slot?record:null);
        if(op.kind==='done')break;
        if(op.kind==='action')assert.equal(advanceGridMarch(sc,record,{graph,movement:plane}),'moved');
        else {assert.equal(op.kind,'tail');finishLegionSlotTail(record);}
      }
      visits.push([saved.serial+i+1,record.x,record.y,record.moveDelay,{...record.roadPosition},plane.snapshot().spans]);
    }
    assert.deepEqual(record.roadPosition,{kind:'city',cityIndex:record.targetNode});
    return visits;
  } finally {pack.close();}
}
