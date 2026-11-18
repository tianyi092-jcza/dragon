import { createMapController } from './basemap.js';
import { createMapCanvas } from './mapcanvas.js';
import { createMapAtlasLoader } from './mapatlas.js';

export { createMapWorkbench as createBaseMapWorkbench };
export function createMapWorkbench({ api, work, publish, confirm, gameId = null }) {
  let controller;
  const canvas = createMapCanvas({ publish, gameId: gameId ?? 'system-base-map', stage: edit => controller.actions.stage(edit) });
  // Workspace uses the loader's spring default; seasonal layout remains shared.
  const atlas = createMapAtlasLoader({ api, publish, path: gameId ? '/api/games/' + encodeURIComponent(gameId) + '/copy/map-atlas' : '/api/admin/base-map/atlas', install: image => canvas.setAtlas(image) });
  controller = createMapController({ api, work, publish, confirm, gameId,
    paint: (source, checkPositions) => { canvas.setSource(source, checkPositions); void atlas.setSource(source); } });
  return Object.freeze({ ...controller, actions: Object.freeze({ ...controller.actions,
    attach: canvas.attach, resize: canvas.resize, pick: canvas.pick, pan: canvas.pan, zoom: canvas.zoom,
    fit: canvas.fit, grid: canvas.grid, locate: canvas.locate, focusDiagnostic: canvas.focusDiagnostic, selectGroup: canvas.selectGroup, layer: canvas.layer, previewMaterial: canvas.previewMaterial, retryAtlas: atlas.retry,
    previewPlacement: canvas.previewPlacement, cancelPlacement: canvas.cancelPlacement,
    beginObjectMove: canvas.beginObjectMove, previewObjectMove: canvas.previewObjectMove,
    commitObjectMove: () => work(() => canvas.commitObjectMove()), cancelObjectMove: canvas.cancelObjectMove,
    toggleMulti: canvas.toggleMulti, beginMultiMove: canvas.beginMultiMove,
    groupSelection: () => work(() => canvas.groupSelection()), ungroupSelection: () => work(() => canvas.ungroupSelection()),
    commitPlacement: () => work(() => canvas.commitPlacement()),
    command: (op, fields) => work(() => canvas.command(op, fields)),
  }) });
}
