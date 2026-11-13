// Shared editor-only preview dispatch. Server authorization and command identity
// ledgers remain in copyprofile.js; this module grants no write permission.
import { fillBase, splitDecoration, placeComponent, removeDecorations, reorderDecorations,
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
  return { ...next, selectionGroups: groups };
}

export function previewMapEdits(source, edits) {
  const next = edits.reduce((current, edit) => {
    switch (edit.op) {
      case 'base-fill': return fillBase(current, edit.cells, edit.tile, edit.geography);
      case 'decoration-split': return splitDecoration(current, edit.instanceId, edit.childIds);
      case 'decoration-place': return placeComponent(current, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
      case 'decoration-remove': return removeDecorations(current, edit.memberIds);
      case 'decoration-reorder': return reorderDecorations(current, edit.memberIds, edit.direction);
      case 'decoration-translate': return translateDecorations(current, edit.memberIds, edit.dx, edit.dy);
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
