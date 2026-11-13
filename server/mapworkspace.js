// Same bounded map commands for system templates and game copies. Selection
// groups are editor references, not another writer for terrain or topology.
import { applyCopyMapEdits } from './copyprofile.js';
import { reconcileMapSelectionGroups } from '../web/src/editor/mapcommands.js';

export function applyMapWorkspaceEdits(source, edits) {
  // These immutable definitions came from the controlled Web-piece conversion,
  // not an HTTP addition. Keep the original 1024-slot budget for atoms/authored
  // materials; legacy frozen-profile replay retains its unmodified default.
  const convertedDefinitions = Object.values(source.componentDefinitions).filter(definition => definition.revision === 'web-piece-policy-1').length;
  return reconcileMapSelectionGroups(source, applyCopyMapEdits(source, edits, 1024 + convertedDefinitions), edits);
}
