import { createMapController } from './basemap.js';
import { createMapCanvas } from './mapcanvas.js';
import { createMapAtlasLoader } from './mapatlas.js';

export { createMapWorkbench as createBaseMapWorkbench };
export function createMapWorkbench({ api, work, publish, confirm, gameId = null }) {
  let controller;
  const canvas = createMapCanvas({ publish, gameId: gameId ?? 'system-base-map', stage: edit => controller.actions.stage(edit) });
  const atlas = createMapAtlasLoader({ api, publish, path: gameId ? '/api/games/' + encodeURIComponent(gameId) + '/copy/map-atlas' : '/api/admin/base-map/atlas', install: image => canvas.setAtlas(image) });
  controller = createMapController({ api, work, publish, confirm, gameId,
    paint: source => { canvas.setSource(source); void atlas.setSource(source); } });
  return Object.freeze({ ...controller, actions: Object.freeze({ ...controller.actions,
    attach: canvas.attach, resize: canvas.resize, pick: canvas.pick, pan: canvas.pan, zoom: canvas.zoom,
    fit: canvas.fit, locate: canvas.locate, focusDiagnostic: canvas.focusDiagnostic, selectGroup: canvas.selectGroup, layer: canvas.layer, previewMaterial: canvas.previewMaterial, season: atlas.setSeason, retryAtlas: atlas.retry,
    command: (op, fields) => work(() => canvas.command(op, fields)),
  }) });
}
