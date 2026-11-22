// Shared editor-only preview dispatch. Server authorization and command identity
// ledgers remain in copyprofile.js; this module grants no write permission.
import { enableSeaGroundBase, fillBase, splitDecoration, placeComponent, placeCityGroup, disbandCityGroup, removeCityGate, removeDecorations, reorderDecorations,
  translateDecorations, combineDecorations, captureComponent, renameMaterial, removeMaterial, createWaterGroup,
  splitWaterGroup, mergeWaterGroups, renameWaterGroup, setWaterGroupMinimapVisibility } from './componenttools.js';

import { removeMapObject, translateMapObject } from './mapobjectmove.js';
import { expandMapOneStep, shrinkMapOneStep } from '../content/authoring/mapextent.js';
// MAP-EXT E3: all four sides share one op; quota and strip-emptiness are
// rechecked server-side from stored state.

export function reconcileMapSelectionGroups(source, next, edits) {
  if (!source.selectionGroups) return next;
  let groups = source.selectionGroups;
  for (const edit of edits) {
    if (edit.op === 'decoration-split') {
      groups = groups.map(group => ({ ...group, members: group.members.flatMap(member =>
        member.layer === 'decorations' && member.id === edit.instanceId
          ? edit.childIds.map(id => ({ layer: 'decorations', id })) : [member]) }));
    } else if (edit.op === 'map-object-remove') {
      const live = Object.fromEntries(['roads', 'placements', 'decorations'].map(layer => [layer, new Set(next.map[layer].map(row => row.id))]));
      groups = groups.map(group => ({ ...group, members: group.members.filter(member => live[member.layer]?.has(member.id)) })).filter(group => group.members.length);
    } else if (edit.op === 'map-extent') {
      // Shrink removes whole decoration pieces atomically; drop their group
      // memberships the same way decoration-remove does (judged on live ids).
      const liveDeco = new Set(next.map.decorations.map(row => row.id));
      groups = groups.map(group => ({ ...group, members: group.members.filter(member =>
        member.layer !== 'decorations' || liveDeco.has(member.id)) })).filter(group => group.members.length);
    } else if (edit.op === 'decoration-remove' || edit.op === 'decoration-combine') {
      const removed = new Set(edit.memberIds);
      groups = groups.map(group => ({ ...group, members: group.members.filter(member =>
        member.layer !== 'decorations' || !removed.has(member.id)) })).filter(group => group.members.length);
    }
  }
  // Ops that drop whole groups on purpose (city-group-disband,
  // decoration-ungroup) are honored here too: the reconciler otherwise
  // rebuilds `groups` from the source and resurrects the disbanded entry.
  // Judged against the SOURCE set, so only groups the disband op could
  // have removed are filtered.
  const disbanded = new Set();
  for (const edit of edits) {
    if (edit.op === 'city-group-disband' && typeof edit.cityId === 'string' && edit.cityId)
      disbanded.add(`city-group-${edit.cityId}`);
    else if (edit.op === 'decoration-ungroup' && typeof edit.groupId === 'string' && edit.groupId)
      disbanded.add(edit.groupId);
  }
  if (disbanded.size) groups = groups.filter(group => !disbanded.has(group?.id));
  // them here; existing ops never stage groups so this is a no-op for them.
  // Newness is judged against the SOURCE: groups that reconcile deliberately
  // drops (e.g. emptied by decoration-remove) must not be resurrected.
  const before = new Set((source.selectionGroups ?? []).map(group => group?.id));
  const staged = new Set(groups.map(group => group.id));
  let merged = groups;
  for (const group of next.selectionGroups ?? []) {
    // Re-added disbanded ids (ungroup + regroup in one batch) must survive;
    // untouched source groups are already in merged via `groups`.
    if (staged.has(group.id) || (before.has(group.id) && !disbanded.has(group.id))) continue;
    if (merged === groups) merged = groups.slice();
    merged.push(group); staged.add(group.id);
  }
  return { ...next, selectionGroups: merged };
}

export function previewMapEdits(source, edits) {
  const next = edits.reduce((current, edit) => {
    switch (edit.op) {
      case 'map-extent': {
        if (!['north', 'south', 'west', 'east'].includes(edit.side)) throw new RangeError('地圖擴縮方向須為北／南／西／東');
        if (edit.delta === 1) return { ...current, map: expandMapOneStep(current.map, edit.side) };
        if (edit.delta === -1) return { ...current, map: shrinkMapOneStep(current.map, current.componentDefinitions, edit.side) };
        throw new RangeError('地圖擴縮方向須為加一或減一');
      }
      case 'sea-ground-enable': return enableSeaGroundBase(current);
      case 'base-fill': return fillBase(current, edit.cells, edit.tile, edit.geography);
      case 'map-object-remove': return removeMapObject(current, edit.layer, edit.id);
      case 'map-object-translate': return translateMapObject(current, edit.layer, edit.id, edit.dx, edit.dy);
      case 'decoration-split': return splitDecoration(current, edit.instanceId, edit.childIds);
      case 'decoration-place': return placeComponent(current, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
      case 'city-group-place': return placeCityGroup(current, edit.materialized);
      case 'city-group-disband': return disbandCityGroup(current, edit.cityId);
      case 'city-gate-remove': return removeCityGate(current, edit);
      case 'decoration-remove': return removeDecorations(current, edit.memberIds);
      case 'decoration-combine': return combineDecorations(current, edit.memberIds, edit.materialId, edit.instanceId);
      case 'decoration-reorder': return reorderDecorations(current, edit.memberIds, edit.direction);
      case 'decoration-translate': return translateDecorations(current, edit.memberIds, edit.dx, edit.dy);
      case 'decoration-group': {
        if (!Array.isArray(edit.memberIds) || edit.memberIds.length < 2 || typeof edit.groupId !== 'string' || !edit.groupId)
          throw new RangeError('成組至少需要兩個裝飾與有效成組身份');
        return { ...current, selectionGroups: [...(current.selectionGroups ?? []), { id: edit.groupId, members: edit.memberIds.map(id => ({ layer: 'decorations', id })) }] };
      }
      case 'decoration-ungroup': {
        if (typeof edit.groupId !== 'string' || !edit.groupId) throw new RangeError('解散缺少成組身份');
        return { ...current, selectionGroups: (current.selectionGroups ?? []).filter(row => row?.id !== edit.groupId) };
      }
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
        const bound = (current.map?.placements ?? []).find(place => place?.id === edit.pieceId);
        if (!bound) throw new RangeError('圖塊不存在');
        const cities = current.cities ? { ...current.cities } : current.cities;
        if (cities?.[edit.cityId]) cities[edit.cityId] = { ...cities[edit.cityId], x: bound.x, y: bound.y };
        return { ...current, ...(cities ? { cities } : null), map: { ...current.map,
          placements: (current.map?.placements ?? []).map(place =>
            place?.id === edit.pieceId ? { ...place, cityId: edit.cityId } : place) } };
      }
      case 'city-unbind': {
        if (typeof edit.pieceId !== 'string' || !edit.pieceId)
          throw new RangeError('圖塊身份無效');
        const target = (current.map?.placements ?? []).find(place => place?.id === edit.pieceId);
        if (!target || typeof target.cityId !== 'string' || !target.cityId)
          throw new RangeError('圖塊尚未綁定據點');
        const oldCityId = target.cityId;
        const cities = current.cities ? { ...current.cities } : current.cities;
        if (cities?.[oldCityId]) {
          if (current.gameId === 'system-base-map') {
            const cleared = { ...cities[oldCityId] };
            delete cleared.x; delete cleared.y;
            cities[oldCityId] = cleared;
          } else {
            cities[oldCityId] = { ...cities[oldCityId], x: 0, y: 0 };
          }
        }
        return { ...current, ...(cities ? { cities } : null), map: { ...current.map,
          placements: (current.map?.placements ?? []).map(place =>
            place?.id === edit.pieceId ? { ...place, cityId: null } : place) } };
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
