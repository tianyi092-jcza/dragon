// Native editor canvas adapter. No source or image object enters Vue state.
import { composeMapLayers } from '../../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../../web/src/editor/mapdisplay.js';
import { renderMinimapPixels } from '../../web/src/content/authoring/minimap.js';
import { createDecorationPicker } from '../../web/src/editor/componenttools.js';
import { fitViewport, panViewport, screenToWorld, zoomAt } from '../../web/src/editor/viewport.js';
import { catalogLayer } from './mapcataloglayers.js';
import { projectAtomicSpriteCatalog } from './mapatomiccatalog.js';
import { planSpriteMaterialization } from './mapspriterecipes.js';

// Optional private recipe port remains for reusable combination tooling, never
// populated by the current atomic-only workspace.
export function createMapCanvas({ publish, stage, gameId = 'system-base-map', spriteRecipes = [] }) {
  let source = null, canvas = null, mini = null, atlas = null, tiles = null, picker = null, selected = null;
  let diagnostics = [], gridVisible = true, placement = null;
  let view = { x: 0, y: 0, zoom: 1 }, size = { width: 1, height: 1 }, minimap = null;
  const thumbnails = new Map();
  // Program descriptors and plans stay private; no fabricated definition enters source or Vue.
  const recipes = structuredClone(spriteRecipes);
  let recipePlans = new Map();
  const materialDefinition = id => recipePlans.has(id) ? recipePlans.get(id)?.definition : source?.componentDefinitions[id];
  const visible = { base: true, decor: true, roads: true, cities: true };
  const locked = { base: false, decor: false, roads: true, cities: true };
  const world = () => ({ width: source.map.bounds.width * 16, height: source.map.bounds.height * 16 });
  const newId = kind => `${gameId}#${kind}-${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  function drawThumbnail(target, id) {
    const context = target.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, target.width, target.height);
    const def = materialDefinition(id);
    if (!def) return;
    const tiles = def.variants[Object.keys(def.variants)[0]].tiles;
    const xs = tiles.map(([x]) => x), ys = tiles.map(([, y]) => y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    // Library-only 2x nearest-neighbour preview; source cells and map ghosts stay 16px.
    const cell = 32;
    const width = (Math.max(...xs) - minX + 1) * cell, height = (Math.max(...ys) - minY + 1) * cell;
    const ratio = globalThis.devicePixelRatio || 1;
    target.style.width = `${width}px`; target.style.height = `${height}px`;
    target.width = Math.round(width * ratio); target.height = Math.round(height * ratio);
    context.setTransform(target.width / width, 0, 0, target.height / height, 0, 0);
    context.imageSmoothingEnabled = false;
    if (!atlas) return;
    tiles.forEach(([x, y, tile]) => context.drawImage(atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16, (x - minX) * cell, (y - minY) * cell, cell, cell));
  }
  function groupCells(id, includeHidden = false) {
    const group = source.selectionGroups?.find(row => row.id === id);
    return (group?.members ?? []).flatMap(member => {
      if (!includeHidden && !visible[({ decorations: 'decor', roads: 'roads', placements: 'cities' })[member.layer]]) return [];
      if (member.layer === 'roads') return source.map.roads.find(row => row.id === member.id).geometry.map(point => [point.x, point.y]);
      const item = (member.layer === 'placements' ? source.map.placements : source.map.decorations).find(row => row.id === member.id);
      const def = source.componentDefinitions[item.definitionRef ?? item.componentRef];
      return def ? def.footprint.map(([x, y]) => [item.x + x - def.anchor[0], item.y + y - def.anchor[1]]) : [[item.x, item.y]];
    });
  }
  function facts() {
    const usedMaterials = new Set(source ? [...source.map.decorations.map(row => row.definitionRef), ...source.map.roads.flatMap(road => (road.components ?? []).map(row => row.definitionRef)), ...source.map.placements.map(row => row.componentRef)] : []);
    const projectedCatalog = projectAtomicSpriteCatalog(source?.componentDefinitions);
    publish({ loaded: Boolean(source), zoom: view.zoom, gridVisible, selected: selected ? { ...selected } : null,
      ...projectedCatalog,
      catalogItems: [...projectedCatalog.catalogItems, ...recipes.map(recipe => {
        const id = `catalog:${recipe.itemId}`, plan = recipePlans.get(id);
        let note = '本圖缺少匹配的原子定義；不可預覽或放置';
        if (plan) {
          note = '外觀參考；不開放放置';
          if (plan.canPlace) note = `${plan.materialId ? '復用本圖完整配方' : '放置時擷取原子為本圖素材'}；${plan.commandCount}條命令，一次撤銷；只有地面影響小地圖輪廓`;
        }
        return { id, itemId: recipe.itemId, name: recipe.name, layer: catalogLayer(recipe.itemId), category: recipe.category, cells: recipe.footprint.length,
          available: Boolean(plan), canPlace: Boolean(plan?.canPlace), note };
      })],
      layers: Object.keys(visible).map(id => ({ id, visible: visible[id], locked: locked[id] })),
      materials: source ? Object.values(source.componentDefinitions).map(def => ({ id: def.id, name: def.name || def.id, cells: def.footprint.length, originalAtom: def.category === 'atomic-original' && /^tile-\d+$/.test(def.id), editable: def.id.startsWith(`${gameId}#material-`), inUse: usedMaterials.has(def.id) })) : [],
      groups: (source?.selectionGroups ?? []).map(group => ({ id: group.id, name: ({ 'ground-shore-pattern': '地面／岸線片段', 'mountain-pattern': '山紋片段', 'field-pattern': '田紋片段', 'structure-pattern': '建築／牆段片段' })[group.label] || group.label, members: group.members.length })),
      diagnostics: diagnostics.map((problem, index) => ({ index, code: problem.code, message: problem.message, x: problem.x, y: problem.y })),
      waters: source ? source.map.waterGroups.map(group => ({ id: group.id, name: group.name || group.id, visible: group.showOnMinimap })) : [],
    });
  }
  function draw() {
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
    if (!source || !tiles) return;
    context.imageSmoothingEnabled = false;
    const { width, height } = source.map.bounds, cell = 16 * view.zoom;
    const left = Math.max(0, Math.floor(view.x / 16)), top = Math.max(0, Math.floor(view.y / 16));
    const right = Math.min(width, Math.ceil((view.x + size.width / view.zoom) / 16));
    const bottom = Math.min(height, Math.ceil((view.y + size.height / view.zoom) / 16));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const tile = tiles[y * width + x], sx = (x * 16 - view.x) * view.zoom, sy = (y * 16 - view.y) * view.zoom;
      if (tile === null) { context.fillStyle = (x + y) % 2 ? '#dddddd' : '#eeeeee'; context.fillRect(sx, sy, cell, cell); }
      else if (atlas) context.drawImage(atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16, sx, sy, cell, cell);
    }
    // Presentation only: suppress the dense grid below one native tile on screen.
    if (gridVisible && cell >= 16) {
      // One path per boundary, not per cell: shared edges must not darken twice.
      // Widths are CSS pixels under the DPR transform, independent of world zoom.
      const sx = (left * 16 - view.x) * view.zoom, sy = (top * 16 - view.y) * view.zoom;
      const ex = (right * 16 - view.x) * view.zoom, ey = (bottom * 16 - view.y) * view.zoom;
      context.beginPath();
      for (let x = left; x <= right; x++) {
        const px = (x * 16 - view.x) * view.zoom;
        context.moveTo(px, sy); context.lineTo(px, ey);
      }
      for (let y = top; y <= bottom; y++) {
        const py = (y * 16 - view.y) * view.zoom;
        context.moveTo(sx, py); context.lineTo(ex, py);
      }
      context.lineWidth = 2; context.strokeStyle = 'rgba(0, 0, 0, 0.45)'; context.stroke();
      context.lineWidth = 1; context.strokeStyle = 'rgba(255, 255, 255, 0.55)'; context.stroke();
    }
    if (selected) {
      let cells = selected.layer === 'group' ? groupCells(selected.id) : [[selected.x, selected.y]];
      if (selected.layer === 'decor') {
        const item = source.map.decorations.find(row => row.id === selected.id);
        if (item) { const def = source.componentDefinitions[item.definitionRef]; cells = def.footprint.map(([x, y]) => [item.x + x - def.anchor[0], item.y + y - def.anchor[1]]); }
      }
      context.strokeStyle = '#ffcc00'; context.lineWidth = 1;
      cells.forEach(([x, y]) => context.strokeRect(((x - source.map.bounds.minX) * 16 - view.x) * view.zoom, ((y - source.map.bounds.minY) * 16 - view.y) * view.zoom, cell, cell));
    }
    if (placement && atlas) {
      const def = materialDefinition(placement.materialId);
      // Same variant and byte identity as commit; opacity is presentation only.
      context.globalAlpha = 0.5;
      def.variants[Object.keys(def.variants)[0]].tiles.forEach(([dx, dy, tile]) => {
        const x = placement.x + dx - def.anchor[0] - source.map.bounds.minX;
        const y = placement.y + dy - def.anchor[1] - source.map.bounds.minY;
        context.drawImage(atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16,
          (x * 16 - view.x) * view.zoom, (y * 16 - view.y) * view.zoom, cell, cell);
      });
      context.globalAlpha = 1;
      context.strokeStyle = placement.inBounds ? '#00ccff' : '#ff4444'; context.lineWidth = 2;
      def.footprint.forEach(([dx, dy]) => {
        const x = placement.x + dx - def.anchor[0] - source.map.bounds.minX;
        const y = placement.y + dy - def.anchor[1] - source.map.bounds.minY;
        context.strokeRect((x * 16 - view.x) * view.zoom, (y * 16 - view.y) * view.zoom, cell, cell);
      });
      const ax = ((placement.x - source.map.bounds.minX) * 16 - view.x) * view.zoom;
      const ay = ((placement.y - source.map.bounds.minY) * 16 - view.y) * view.zoom;
      context.beginPath();
      context.moveTo(ax, ay + cell / 2); context.lineTo(ax + cell, ay + cell / 2);
      context.moveTo(ax + cell / 2, ay); context.lineTo(ax + cell / 2, ay + cell);
      context.stroke();
    }
    if (mini && minimap) {
      const ctx = mini.getContext('2d'), image = ctx.createImageData(250, 167);
      minimap.pixels.forEach((byte, index) => { image.data[Math.floor(index / 3) * 4 + index % 3] = byte; });
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
      mini.width = 250; mini.height = 167; ctx.putImageData(image, 0, 0);
      ctx.strokeStyle = '#ffcc00'; ctx.strokeRect(view.x / world().width * 250, view.y / world().height * 167, size.width / view.zoom / world().width * 250, size.height / view.zoom / world().height * 167);
    }
  }
  function resize(width, height) {
    placement = null;
    const previous = size;
    size = { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
    const ratio = globalThis.devicePixelRatio || 1;
    if (canvas) { canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio); }
    if (source) view = panViewport({ ...view, x: view.x + (previous.width - size.width) / (2 * view.zoom), y: view.y + (previous.height - size.height) / (2 * view.zoom) }, 0, 0, size, world());
    draw();
  }
  function setSource(value) {
    const first = !source;
    placement = null;
    source = value;
    recipePlans = new Map(recipes.map(recipe => [`catalog:${recipe.itemId}`, source ? planSpriteMaterialization(source.componentDefinitions, recipe) : null]));
    if (!source) { diagnostics = []; atlas = null; tiles = null; picker = null; selected = null; minimap = null; thumbnails.forEach((target, id) => drawThumbnail(target, id)); if (mini) mini.getContext('2d').clearRect(0, 0, mini.width, mini.height); draw(); facts(); return; }
    tiles = composeMapDisplayLayers(source, visible).tiles;
    picker = createDecorationPicker(source);
    if (selected?.layer === 'decor') {
      const item = source.map.decorations.find(row => row.id === selected.id);
      selected = item ? { ...selected, x: item.x, y: item.y, cells: source.componentDefinitions[item.definitionRef].footprint.length, captureAllowed: true } : null;
    }
    if (selected?.layer === 'group') {
      const group = source.selectionGroups?.find(group => group.id === selected.id);
      selected = group ? { ...selected, members: group.members.length, cells: groupCells(group.id, true).length, captureAllowed: group.members.every(member => member.layer === 'decorations') } : null;
    }
    const composed = composeMapLayers(source, { draft: true });
    diagnostics = composed.diagnostics;
    const { width, height, minX, minY } = source.map.bounds, roads = new Uint8Array(width * height);
    source.map.roads.forEach(road => road.geometry.forEach(({ x, y }) => { roads[(y - minY) * width + x - minX] = 1; }));
    minimap = renderMinimapPixels(composed.minimapGeography, roads, width, height, 250, 167, 1);
    if (first) view = fitViewport(size, world());
    draw(); thumbnails.forEach((target, id) => drawThumbnail(target, id)); facts();
  }
  function pick(sx, sy) {
    if (!source) return;
    const [wx, wy] = screenToWorld(view, sx, sy), { minX, minY, width, height } = source.map.bounds;
    const x = Math.floor(wx / 16) + minX, y = Math.floor(wy / 16) + minY;
    if (x < minX || x >= minX + width || y < minY || y >= minY + height) return;
    placement = null; selected = null;
    if (visible.cities && !locked.cities) {
      const place = source.map.placements.find(row => row.x === x && row.y === y);
      if (place) selected = { layer: 'cities', id: place.id, name: source.cities[place.cityId]?.name || place.cityId, x, y };
    }
    if (!selected && visible.roads && !locked.roads) {
      const road = source.map.roads.find(row => row.geometry.some(point => point.x === x && point.y === y));
      if (road) selected = { layer: 'roads', id: road.id, name: road.id, x, y };
    }
    if (!selected && visible.decor && !locked.decor) {
      const index = picker.pick(x, y), item = source.map.decorations[index];
      if (item) { const def = source.componentDefinitions[item.definitionRef]; selected = { layer: 'decor', id: item.id, name: def.name || item.definitionRef, x: item.x, y: item.y, cells: def.footprint.length, captureAllowed: true }; }
    }
    if (!selected && visible.base && !locked.base) selected = { layer: 'base', id: String((y - minY) * width + x - minX), name: '底圖格', x, y };
    draw(); facts();
  }
  function command(op, fields = {}) {
    if (!source) return;
    if (op.startsWith('decoration-') && op !== 'decoration-place') {
      if (selected?.layer !== 'decor' || locked.decor) throw new Error('請先選取未鎖定的裝飾片段');
      if (op === 'decoration-split') return stage({ op, instanceId: selected.id, childIds: Array.from({ length: selected.cells }, () => newId('decoration')) });
      return stage({ op, memberIds: [selected.id], ...fields });
    }
    if (op === 'material-capture') {
      if (!selected || locked.decor || !visible.decor) throw new Error('請先選取未鎖定的裝飾片段');
      let members = [];
      if (selected.layer === 'decor') members = [{ layer: 'decorations', id: selected.id }];
      else if (selected.layer === 'group') members = source.selectionGroups.find(group => group.id === selected.id).members;
      if (!members.length || members.some(member => member.layer !== 'decorations')) throw new Error('素材擷取只接受裝飾層組合，不含道路或據點');
      return stage({ op, memberIds: members.map(member => member.id), materialId: newId('material'), name: fields.name });
    }
    if (['base-fill', 'base-fill-rectangle', 'water-visibility'].includes(op)) throw new Error('海域基底固定；小地圖只顯示地面輪廓、道路及據點');
    if (op === 'decoration-place') {
      if (!selected || locked.decor) throw new Error('請先選取放置位置並解鎖裝飾層');
      if (recipePlans.has(fields.materialId)) {
        const plan = recipePlans.get(fields.materialId);
        if (!plan?.canPlace || !visible.decor) throw new Error('此目錄配方目前不可放置。');
        return stage(plan.place(selected.x, selected.y, newId));
      }
      const def = source.componentDefinitions[fields.materialId];
      return stage({ op, instanceId: newId('decoration'), materialId: def.id, variantRef: Object.keys(def.variants)[0], x: selected.x, y: selected.y, waterClass: def.authorWaterClass ?? null });
    }
    return stage({ op, ...fields });
  }
  return Object.freeze({ setSource, command, pick,
    // CSS canvas coordinates only. Bounds feedback is not compiler approval:
    // stage retains all existing capability, collision and source validation.
    previewPlacement(materialId, sx, sy) {
      placement = null;
      const def = materialDefinition(materialId);
      const allowed = !recipePlans.has(materialId) || recipePlans.get(materialId)?.canPlace;
      if (allowed && def && atlas && visible.decor && !locked.decor && Number.isFinite(sx) && Number.isFinite(sy) && sx >= 0 && sy >= 0 && sx < size.width && sy < size.height) {
        const [wx, wy] = screenToWorld(view, sx, sy);
        const { minX, minY, width, height } = source.map.bounds;
        const x = Math.floor(wx / 16) + minX, y = Math.floor(wy / 16) + minY;
        const inBounds = def.footprint.every(([dx, dy]) => x + dx - def.anchor[0] >= minX && x + dx - def.anchor[0] < minX + width && y + dy - def.anchor[1] >= minY && y + dy - def.anchor[1] < minY + height);
        placement = { materialId, x, y, inBounds };
      }
      draw();
      return placement ? { ...placement } : null;
    },
    cancelPlacement() { placement = null; draw(); },
    commitPlacement() {
      const pending = placement;
      placement = null; draw();
      if (!pending?.inBounds || !source || !atlas || locked.decor || !visible.decor) return;
      if (recipePlans.has(pending.materialId)) {
        const plan = recipePlans.get(pending.materialId);
        if (!plan?.canPlace) return;
        return stage(plan.place(pending.x, pending.y, newId));
      }
      const def = source.componentDefinitions[pending.materialId];
      return stage({ op: 'decoration-place', instanceId: newId('decoration'), materialId: def.id, variantRef: Object.keys(def.variants)[0], x: pending.x, y: pending.y, waterClass: def.authorWaterClass ?? null });
    },
    grid(value) { gridVisible = value; draw(); facts(); },
    attach(main, minimapCanvas) { canvas = main; mini = minimapCanvas; if (canvas) resize(canvas.clientWidth || 1, canvas.clientHeight || 1); draw(); },
    setAtlas(image) { atlas = image; if (!image) placement = null; draw(); thumbnails.forEach((target, id) => drawThumbnail(target, id)); }, resize,
    selectGroup(id) {
      if (!source) return;
      const group = source.selectionGroups?.find(row => row.id === id);
      if (!group) return;
      const cells = groupCells(id, true);
      if (!cells.length) return;
      placement = null;
      const bounds = cells.reduce((box, [x, y]) => ({ minX: Math.min(box.minX, x), minY: Math.min(box.minY, y), maxX: Math.max(box.maxX, x), maxY: Math.max(box.maxY, y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      selected = { layer: 'group', id, name: 'Web 編輯組合', x: bounds.minX, y: bounds.minY, cells: cells.length, members: group.members.length, captureAllowed: group.members.every(member => member.layer === 'decorations') };
      const zoom = Math.min(4, Math.max(1 / 16, Math.min(size.width / ((bounds.maxX - bounds.minX + 3) * 16), size.height / ((bounds.maxY - bounds.minY + 3) * 16))));
      view = panViewport({ x: ((bounds.minX + bounds.maxX + 1) / 2 - source.map.bounds.minX) * 16 - size.width / zoom / 2, y: ((bounds.minY + bounds.maxY + 1) / 2 - source.map.bounds.minY) * 16 - size.height / zoom / 2, zoom }, 0, 0, size, world());
      draw(); facts();
    },
    focusDiagnostic(index) {
      const problem = diagnostics[index];
      if (!source || !problem || !Number.isInteger(problem.x) || !Number.isInteger(problem.y)) return;
      placement = null;
      const x = problem.x + source.map.bounds.minX, y = problem.y + source.map.bounds.minY;
      selected = { layer: 'base', id: String(problem.cell), name: '待補底圖格', x, y };
      const zoom = Math.max(1, view.zoom);
      view = panViewport({ x: (problem.x + 0.5) * 16 - size.width / zoom / 2, y: (problem.y + 0.5) * 16 - size.height / zoom / 2, zoom }, 0, 0, size, world());
      draw(); facts();
    },
    previewMaterial(target, id) { if (target) { thumbnails.set(id, target); drawThumbnail(target, id); } else thumbnails.delete(id); },
    pan(dx, dy) { placement = null; if (source) { view = panViewport(view, dx, dy, size, world()); draw(); } },
    zoom(factor, x = size.width / 2, y = size.height / 2) { placement = null; if (source) { view = zoomAt(view, view.zoom * factor, [x, y], size, world()); draw(); facts(); } },
    fit() { placement = null; if (source) { view = fitViewport(size, world()); draw(); facts(); } },
    locate(x, y) { placement = null; if (source) { view = panViewport({ ...view, x: x * world().width - size.width / view.zoom / 2, y: y * world().height - size.height / view.zoom / 2 }, 0, 0, size, world()); draw(); } },
    layer(id, field, value) {
      if (!Object.hasOwn(visible, id) || !['visible', 'locked'].includes(field) || typeof value !== 'boolean') throw new Error('圖層設定無效');
      (field === 'visible' ? visible : locked)[id] = value; selected = null; placement = null;
      if (source && field === 'visible') tiles = composeMapDisplayLayers(source, visible).tiles;
      draw(); facts();
    },
  });
}
