// Player-side structured graph loader. Experimental worlds never expose DOS
// node/edge pointer APIs. Only install a fully checked, owned graph.
import { selectStructuredRoad } from './structuredroadselection.js';
import { containsTile } from '../../content/authoring/mapextent.js';
// Uncontested friendly march only. Read contact/ownership before committing
// a point; no surrogate battle/arrival outcome for unsupported branches.
export function advanceGridMarch(sc, army, {graph,movement}) {
  const target = army.targetNode;
  if (army.faction !== sc.player_faction || !graph.nodes[target] || sc.cities[target].faction !== army.faction)
    throw new RangeError('Grid march requires a friendly player destination');
  const current = army.roadPosition;
  if (current.kind === 'city' && current.cityIndex === target) return 'arrived';
  let next;
  if (current.kind === 'city' || army.status & 2) {
    const result = selectStructuredRoad(graph,{ position:current,targetCityIndex:target,owner:army.faction,
      command:army.commandState,readCityOwner:i=>sc.cities[i].faction ?? 0x18 });
    if (result.status === 'unreachable') return 'unreachable';
    if (result.status !== 'selected') throw new Error(`Unsupported grid road selection: ${result.status}`);
    next = result.position;
  } else next = current;
  const edge = graph.edges[next.roadIndex];
  const terminates = flags => (flags & 7) >= 2 && ((flags & 0x40) ? next.direction < 0 : next.direction > 0);
  const turningAtPort = current.kind === 'road' && terminates(edge.points[next.pointIndex].flags);
  if (current.kind === 'road' && !turningAtPort) next = {...next, pointIndex:next.pointIndex+next.direction};
  const point = edge.points[next.pointIndex];
  if (!point) throw new RangeError('Grid road cursor outside geometry');
  let destination = point;
  const endpoint = next.direction===1 ? edge.toCityIndex : edge.fromCityIndex;
  if (sc.cities[endpoint].faction !== army.faction) throw new RangeError('Grid march contact unresolved');
  if (!turningAtPort && movement.readTile(point.x,point.y)) throw new RangeError('Grid field contact unresolved');
  // Equivalent to continues(flags) / nodeize in originalroadmovement.js:
  // a terminating port commits the city center in the same slot action.
  if (terminates(point.flags)) {
    destination = graph.nodes[endpoint];
    next = {kind:'city',cityIndex:endpoint};
  }
  const count = movement.readTile(army.x,army.y);
  if (!count || movement.readTile(destination.x,destination.y)) throw new RangeError('Grid occupancy conflict');
  movement.writeTile(army.x,army.y,count-1);
  movement.writeTile(destination.x,destination.y,1);
  army.x=destination.x; army.y=destination.y; army.roadPosition=next; army.status &= ~2;
  return 'moved';
}

export function createWorldGridRoads(definition,{fetcher = globalThis.fetch,assertCurrent}) {
  let graph, pending;
  const check = ok => { if (!ok) throw new TypeError('Invalid world-grid road graph'); };
  return Object.freeze({ loadedRoadVersion:()=>graph?.version,
    async loadRoadGraph() {
      assertCurrent();
      if (graph) return graph;
      return pending ??= (async()=>{
        const response = await fetcher(definition.assets.roadGraph); check(response.ok);
        const data = await response.json(); assertCurrent();
        check(data.version==='world-grid-experiment' && ['minX','minY','width','height','tileSize'].every(k=>data.bounds?.[k]===definition[k]));
        check(Array.isArray(data.nodes) && data.nodes.length>0 && data.nodes.length<=512 && Array.isArray(data.edges));
        const ids=new Set(), centers=new Set(), roads=new Set();
        for (const [i,n] of data.nodes.entries()) {
          const xy=`${n.x},${n.y}`;
          check(n.cityIndex===i && typeof n.cityId==='string' && n.cityId && !ids.has(n.cityId) && !centers.has(xy) && containsTile(definition,n.x,n.y) && Array.isArray(n.ports) && n.ports.length===4);
          ids.add(n.cityId); centers.add(xy);
          for (const p of n.ports) if(p!==null) {
            const e=data.edges[p.roadIndex]; check(Number.isInteger(p.roadIndex) && e && (p.end==='from'?e.fromCityIndex===i:p.end==='to' && e.toCityIndex===i));
          }
        }
        for(const [i,e] of data.edges.entries()) {
          check(typeof e.roadId==='string' && e.roadId && !roads.has(e.roadId) && e.fromCityIndex!==e.toCityIndex && Number.isInteger(e.cost) && e.cost>=0 && e.cost<=255 && Array.isArray(e.points) && e.points.length>=2);
          for(const [end,index] of [['from',e.fromCityIndex],['to',e.toCityIndex]]) check(Number.isInteger(index) && data.nodes[index]?.ports.filter(p=>p?.roadIndex===i && p.end===end).length===1);
          for(const [j,p] of e.points.entries()) check(containsTile(definition,p.x,p.y) && Number.isInteger(p.flags) && p.flags>=0 && p.flags<=255 && (!j || Math.max(Math.abs(p.x-e.points[j-1].x),Math.abs(p.y-e.points[j-1].y))===1));
          roads.add(e.roadId);
        }
        const freeze = v=>{if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};
        freeze(data);graph=data;return graph;
      })().finally(()=>{pending=null;});
    },
  });
}
