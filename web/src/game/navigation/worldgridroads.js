// Player-side structured graph loader. Experimental worlds never expose DOS
// node/edge pointer APIs. Only install a fully checked, owned graph.
import { selectStructuredRoad } from './structuredroadselection.js';
import { containsTile } from '../../content/authoring/mapextent.js';
// Uncontested friendly march only. Read contact/ownership before committing
// a point; no surrogate battle/arrival outcome for unsupported branches.
export function advanceGridMarch(sc, army, {graph,movement}) {
  let target = army.targetNode;
  if (!graph.nodes[target]) throw new RangeError('Grid march target node outside graph');
  const current = army.roadPosition;
  const peacefulForeign = owner => {
    if (owner == null || owner === army.faction) return false;
    const relation = sc.diplomacy?.[army.faction]?.[owner];
    if (!Number.isInteger(relation) || relation < 0 || relation > 255) throw new RangeError('Missing grid march diplomacy byte');
    return relation >= 0x80;
  };
  // KI 2694 -> 42AB: test the current edge BEFORE 47BB reselects it.
  if (current.kind === 'road') {
    const edge = graph.edges[current.roadIndex];
    const forward = current.direction === 1;
    if (peacefulForeign(sc.cities[forward ? edge.toCityIndex : edge.fromCityIndex].faction)) {
      target = forward ? edge.fromCityIndex : edge.toCityIndex;
      army.targetNode = army.targetCity = target;
      army.target = sc.cities[target];
      army.status |= 2;
      army._retreat = null;
      army._engagement = null;
    }
  }
  if (current.kind === 'city' && current.cityIndex === target) {
    army._markerFrame = 4; // 266A
    return 'arrived';
  }
  let next;
  if (current.kind === 'city' || army.status & 2) {
    const result = selectStructuredRoad(graph,{ position:current,targetCityIndex:target,owner:army.faction,
      command:army.commandState,readCityOwner:i=>sc.cities[i].faction ?? 0x18 });
    if (result.status === 'fate-required') {
      // 26A5 consumes the reselect bit before 47BB; 4801/4851 return CF.
      // The slot owner runs 291A (including any player message), not a move.
      army.status &= ~2;
      return 'fate-required';
    }
    if (result.status === 'unreachable') return 'unreachable';
    if (result.status !== 'selected') throw new Error(`Unsupported grid road selection: ${result.status}`);
    next = result.position;
  } else next = current;
  const edge = graph.edges[next.roadIndex];
  const terminates = flags => (flags & 7) >= 2 && ((flags & 0x40) ? next.direction < 0 : next.direction > 0);
  const turningAtPort = current.kind === 'road' && terminates(edge.points[next.pointIndex].flags);
  if (current.kind === 'road' && !turningAtPort) next = {...next, pointIndex:next.pointIndex+next.direction};
  const { pointIndex, direction } = next;
  const point = edge.points[pointIndex];
  if (!point) throw new RangeError('Grid road cursor outside geometry');
  let destination = point;
  const endpoint = next.direction===1 ? edge.toCityIndex : edge.fromCityIndex;
  const endpointOwner = sc.cities[endpoint].faction;
  // KI 2831: the first matching active slot wins; a friendly formation
  // does not block the column behind it. Keep unaccounted occupancy closed.
  const friendlyAt = tile => sc.legions?.filter(l => l.slot < 127 && l.status >= 0x80 && l.x === tile.x && l.y === tile.y)
    .toSorted((a,b) => a.slot-b.slot)[0]?.faction === army.faction;
  if (!turningAtPort && movement.readTile(point.x,point.y) && !friendlyAt(point)) {
    // MAP-EXT E8: field contact carries its tile; the slot pump turns a
    // hostile occupant into a field engagement, otherwise the refusal stands.
    const contact = new RangeError('Grid field contact unresolved');
    contact.point = { x: point.x, y: point.y };
    throw contact;
  }
  // Equivalent to continues(flags) / nodeize in originalroadmovement.js:
  // a terminating port commits the city center in the same slot action.
  if (terminates(point.flags)) {
    // Neutral endpoints pass 42AB; 2708 checks field contact first, then
    // 2880 enters siege before the terminal point or city center is occupied.
    // KI 274C..275E: the candidate gate triggers siege, including transit cities.
    if (endpointOwner == null || endpointOwner !== army.faction) {
      const contact = new RangeError('Grid march contact unresolved');
      contact.endpoint = endpoint;
      throw contact;
    }
    destination = graph.nodes[endpoint];
    next = {kind:'city',cityIndex:endpoint};
  }
  const count = movement.readTile(army.x,army.y);
  // KI 2728/2736 checks the road point. 27A2 then replaces the occupancy
  // pointer with the city center; 26FA increments it without a second scan.
  // A retreating former garrison can still be here after the city changed hands.
  if (!count) throw new RangeError('Grid occupancy conflict');
  // 2804/2808 looks AHEAD of the committed cursor (X first); 27F6
  // looks back and flips direction at a port. Only the target uses frame 4.
  const atPort = next.kind === 'city';
  if (atPort && endpoint === target) army._markerFrame = 4;
  else {
    const look = edge.points[pointIndex + (atPort ? -direction : direction)];
    const dx = look.x - point.x, dy = look.y - point.y;
    if (dx) army._markerFrame = dx > 0 ? 1 : 0;
    else if (dy) army._markerFrame = dy > 0 ? 3 : 2;
    if (atPort) army._markerFrame ^= 1;
  }
  movement.writeTile(army.x,army.y,count-1);
  movement.writeTile(destination.x,destination.y,movement.readTile(destination.x,destination.y)+1);
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
