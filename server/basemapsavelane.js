// Only called after the trusted command writer has applied the complete batch.
// Test the touched footprints against possible topology inputs; not a new road classifier.
import { ROAD_TILE_MIN, ROAD_TILE_MAX } from '../web/src/editor/roadchain.js';

export function baseMapSaveLane(before, after, edits) {
  if (before.map.base.policy !== 'sea-ground-1' || edits.some(e => ['map-extent', 'sea-ground-enable', 'base-fill'].includes(e.op))) return 'full';
  const touched = new Set();
  for (const e of edits) {
    switch (e.op) {
      case 'city-stamp': case 'city-bind': case 'city-unbind': case 'road-add': return 'roads-cities';
      case 'map-object-translate': case 'map-object-remove': return 'roads-cities';
      case 'decoration-place': touched.add(e.instanceId); break;
      case 'decoration-split': touched.add(e.instanceId); e.childIds.forEach(id => touched.add(id)); break;
      case 'decoration-combine': touched.add(e.instanceId); e.memberIds.forEach(id => touched.add(id)); break;
      case 'decoration-remove': case 'decoration-translate': case 'decoration-reorder': e.memberIds.forEach(id => touched.add(id)); break;
      case 'decoration-group': case 'decoration-ungroup': case 'water-rename': case 'water-visibility':
      case 'water-create': case 'water-merge': case 'water-split': case 'material-capture': case 'material-remove': case 'material-rename': break;
      default: return 'full';
    }
  }
  if (!touched.size) return 'direct';
  if (before.selectionGroups?.some(g => g.id.startsWith('city-group-') && g.members.some(m => m.layer === 'decorations' && touched.has(m.id)))) return 'roads-cities';
  // Both ends matter: removing/moving an ordinary stamp can expose a road beneath it.
  const cells = new Set(), key = (x, y) => `${x},${y}`;
  for (const source of [before, after]) for (const item of source.map.decorations) {
    if (!touched.has(item.id)) continue;
    const def = source.componentDefinitions[item.definitionRef];
    for (const [dx, dy, tile] of def.variants[item.variantRef ?? 'original'].tiles) {
      if (tile >= ROAD_TILE_MIN && tile <= ROAD_TILE_MAX) return 'roads-cities';
      cells.add(key(item.x + dx - def.anchor[0], item.y + dy - def.anchor[1]));
      cells.add(key(item.x + dx, item.y + dy)); // roadchain.collectRoadCells coverage
    }
  }
  if (!cells.size) return 'direct';
  const near = (x,y) => cells.has(key(x,y));
  const intersectsStamp = (item, ref, source, allTiles) => {
    const def = source.componentDefinitions[ref];
    return def.variants[item.variantRef ?? 'original'].tiles.some(([dx,dy,tile]) =>
      (allTiles || tile >= ROAD_TILE_MIN && tile <= ROAD_TILE_MAX) && near(item.x + dx - def.anchor[0], item.y + dy - def.anchor[1]));
  };
  // Only decorations could have moved in this branch. Roads/placements are unchanged.
  if (before.map.roads.some(r => r.geometry.some(p => near(p.x,p.y)) || r.components?.some(i => intersectsStamp(i,i.definitionRef,before,true))) ||
      before.map.placements.some(p => near(p.x,p.y) || p.componentRef && intersectsStamp(p,p.componentRef,before,true))) return 'roads-cities';
  // Any newly added/moved road stamp was itself tested above. Also account for unchanged road stamps under/over the edited area.
  return before.map.decorations.some(i => intersectsStamp(i,i.definitionRef,before,false)) ? 'roads-cities' : 'direct';
}
