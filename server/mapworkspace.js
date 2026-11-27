// Same bounded map commands for system templates and game copies. Selection
// groups are editor references, not another writer for terrain or topology.
import { applyCopyMapEdits } from './copyprofile.js';
import { reconcileMapSelectionGroups } from '../web/src/editor/mapcommands.js';

import { applyCellPaints, convertCellWorkspace } from '../web/src/content/authoring/cellmap.js';
import { MAP_EDIT_MAX_COMMANDS, MAP_EDIT_MAX_BYTES } from '../web/src/editor/mapeditlimits.js';

export function applyMapWorkspaceEdits(source, edits) {
  const cut = edits.findIndex(edit => edit?.op === 'cell-convert');
  if (source.map.format === 'cell-map-1' || cut >= 0) {
    if (!Array.isArray(edits) || !edits.length || edits.length > MAP_EDIT_MAX_COMMANDS || Buffer.byteLength(JSON.stringify(edits)) > MAP_EDIT_MAX_BYTES) throw new RangeError('invalid cell edit batch');
    if (cut < 0) return applyCellPaints(source, edits);
    if (source.map.format === 'cell-map-1' || cut !== 0 || Object.keys(edits[cut]).length !== 1) throw new RangeError('invalid map conversion');
    return applyCellPaints(convertCellWorkspace(source), edits.slice(1));
  }
  // These immutable definitions came from the controlled Web-piece conversion,
  // not an HTTP addition. Keep the original 1024-slot budget for atoms/authored
  // materials; legacy frozen-profile replay retains its unmodified default.
  const convertedDefinitions = Object.values(source.componentDefinitions).filter(definition => definition.revision === 'web-piece-policy-1').length;
  return reconcileMapSelectionGroups(source, applyCopyMapEdits(source, edits, 1024 + convertedDefinitions), edits);
}
