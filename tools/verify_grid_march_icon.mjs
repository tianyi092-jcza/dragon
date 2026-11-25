// Isolated live movement and MapView projection; no save or asset I/O.
import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceGridMarch } from '../web/src/game/navigation/worldgridroads.js';
import { MapView } from '../web/src/render/mapview.js';

test('on-road lookahead, signed coordinates, bends, port reversal and stationary target', () => {
  const points = [[1,-3],[2,-3],[2,-2],[1,-2],[1,-3],[0,-4]].map(([x,y],i) => ({x,y,flags:i===0?0x44:i===5?4:0}));
  const nodes = [[0,-3],[-1,-4]].map(([x,y],i) => ({x,y,ports:[{roadIndex:0,end:i?'to':'from'},null,null,null]}));
  const graph = {nodes,edges:[{fromCityIndex:0,toCityIndex:1,points,cost:1}]};
  const view = {sx:x=>x,sy:y=>y};
  for (const start of [0,1]) {
    const target = 1-start;
    const army = {...nodes[start],status:0x82,faction:0,roadPosition:{kind:'city',cityIndex:start},targetNode:target,target:nodes[target],_markerFrame:4};
    const counts = new Map([[`${army.x},${army.y}`,1]]);
    const movement = {readTile:(x,y)=>counts.get(`${x},${y}`)??0,writeTile:(x,y,n)=>counts.set(`${x},${y}`,n)};
    const sc = {cities:[{faction:0},{faction:0}], legions:[army]};
    const frames = [];
    for (let i=0;i<points.length;i++) {
      army.prevX=army.x; army.prevY=army.y;
      assert.equal(advanceGridMarch(sc,army,{graph,movement}),'moved');
      frames.push(MapView.prototype.getLegionRenderPos.call(view,army,1).frame);
    }
    assert.deepEqual(frames, start ? [1,3,1,2,0,4] : [1,3,0,2,0,4]);
    assert.equal(advanceGridMarch(sc,army,{graph,movement}),'arrived');
    assert.equal(army._markerFrame,4);
  }
});
