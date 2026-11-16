// Shared editor-only preview dispatch. Server authorization and command identity
// ledgers remain in copyprofile.js; this module grants no write permission.
import { enableSeaGroundBase, fillBase, splitDecoration, placeComponent, placeCityGroup, disbandCityGroup, removeCityGate, removeDecorations, reorderDecorations,
  translateDecorations, captureComponent, renameMaterial, removeMaterial, createWaterGroup,
  splitWaterGroup, mergeWaterGroups, renameWaterGroup, setWaterGroupMinimapVisibility } from './componenttools.js';

export function reconcileMapSelectionGroups(source, next, edits) {
  if (!source.selectionGroups) return next;
  let groups = source.selectionGroups;
  for (const edit of edits) {
    if (edit.op === 'decoration-split') {
      groups = groups.map(group => ({ ...group, members: group.members.flatMap(member =>
        member.layer === 'decorations' && member.id === edit.instanceId
          ? edit.childIds.map(id => ({ layer: 'decorations', id })) : [member]) }));
    } else if (edit.op === 'decoration-remove') {
      const removed = new Set(edit.memberIds);
      groups = groups.map(group => ({ ...group, members: group.members.filter(member =>
        member.layer !== 'decorations' || !removed.has(member.id)) })).filter(group => group.members.length);
    }
  }
  // Ops that drop whole groups on purpose (city-group-disband) are honored
  // here too: the reconciler otherwise rebuilds `groups` from the source
  // and resurrects the disbanded entry. Judged against the SOURCE set, so
  // only groups the disband op could have removed are filtered.
  const disbanded = new Set();
  for (const edit of edits)
    if (edit.op === 'city-group-disband' && typeof edit.cityId === 'string' && edit.cityId)
      disbanded.add(`city-group-${edit.cityId}`);
  if (disbanded.size) groups = groups.filter(group => !disbanded.has(group?.id));
  // them here; existing ops never stage groups so this is a no-op for them.
  // Newness is judged against the SOURCE: groups that reconcile deliberately
  // drops (e.g. emptied by decoration-remove) must not be resurrected.
  const before = new Set((source.selectionGroups ?? []).map(group => group?.id));
  const staged = new Set(groups.map(group => group.id));
  let merged = groups;
  for (const group of next.selectionGroups ?? []) {
    if (before.has(group.id) || staged.has(group.id)) continue;
    if (merged === groups) merged = groups.slice();
    merged.push(group); staged.add(group.id);
  }
  return { ...next, selectionGroups: merged };
}

export function previewMapEdits(source, edits) {
  const next = edits.reduce((current, edit) => {
    switch (edit.op) {
      case 'sea-ground-enable': return enableSeaGroundBase(current);
      case 'base-fill': return fillBase(current, edit.cells, edit.tile, edit.geography);
      case 'decoration-split': return splitDecoration(current, edit.instanceId, edit.childIds);
      case 'decoration-place': return placeComponent(current, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
      case 'city-group-place': return placeCityGroup(current, edit.materialized);
      case 'city-group-disband': return disbandCityGroup(current, edit.cityId);
      case 'city-gate-remove': return removeCityGate(current, edit);
      case 'decoration-remove': return removeDecorations(current, edit.memberIds);
      case 'decoration-reorder': return reorderDecorations(current, edit.memberIds, edit.direction);
      case 'decoration-translate': return translateDecorations(current, edit.memberIds, edit.dx, edit.dy);
      // D2 copy ops: client preview mirrors geometry only (placement tile,
      // binding link, road path). All certification (scan order, ports,
      // slots, neighbour agreement) stays server-side at save.
      case 'city-stamp': {
        if (!Number.isInteger(edit.x) || !Number.isInteger(edit.y) ||
            !Number.isInteger(edit.tile) || typeof edit.pieceId !== 'string')
          throw new RangeError('新據點圖塊位置或圖號無效');
        return { ...current, map: { ...current.map,
          placements: [...(current.map?.placements ?? []),
            { id: edit.pieceId, cityId: null, x: edit.x, y: edit.y,
              componentRef: `tile-${edit.tile}`, variantRef: 'original' }] } };
      }
      case 'city-bind': {
        if (typeof edit.pieceId !== 'string' || typeof edit.cityId !== 'string')
          throw new RangeError('圖塊或據點身份無效');
        return { ...current, map: { ...current.map,
          placements: (current.map?.placements ?? []).map(place =>
            place?.id === edit.pieceId ? { ...place, cityId: edit.cityId } : place) } };
      }
      case 'road-add': {
        if (typeof edit.roadId !== 'string' || typeof edit.fromCityId !== 'string' ||
            typeof edit.toCityId !== 'string' || !Array.isArray(edit.geometry))
          throw new RangeError('道路端點或路徑無效');
        return { ...current, map: { ...current.map,
          roads: [...(current.map?.roads ?? []),
            { id: edit.roadId, fromCityId: edit.fromCityId, toCityId: edit.toCityId,
              travelKind: edit.travelKind, geometry: edit.geometry }] } };
      }
      case 'material-capture': return captureComponent(current, edit.memberIds, edit.materialId, edit.name);
      case 'material-rename': return renameMaterial(current, edit.materialId, edit.name);
      case 'material-remove': return removeMaterial(current, edit.materialId);
      case 'water-create': return createWaterGroup(current, edit.memberIds, edit.baseCells, edit.groupId, edit.name, edit.showOnMinimap);
      case 'water-split': return splitWaterGroup(current, edit.sourceGroupId, edit.memberIds, edit.baseCells, edit.groupId, edit.name);
      case 'water-merge': return mergeWaterGroups(current, edit.groupIds, edit.groupId, edit.name, edit.showOnMinimap);
      case 'water-rename': return renameWaterGroup(current, edit.groupId, edit.name);
      case 'water-visibility': return setWaterGroupMinimapVisibility(current, edit.groupId, edit.showOnMinimap);
      default: throw new RangeError('不支援的地圖編輯命令');
    }
  }, source);
  return reconcileMapSelectionGroups(source, next, edits);
}
