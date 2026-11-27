// Native editor canvas adapter. No source or image object enters Vue state.
import { EMPTY_CELL, decode, cellKind } from '../../web/src/content/authoring/cellplane.js';
import { hasStructuredMapExtent } from '../../web/src/content/authoring/mapextent.js';
import { composeMapLayers } from '../../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../../web/src/editor/mapdisplay.js';
import { renderMinimapPixels } from '../../web/src/content/authoring/minimap.js';
import { componentCells, createDecorationPicker } from '../../web/src/editor/componenttools.js';
import { mapObjectParts } from '../../web/src/editor/mapobjectmove.js';
import { mapPositionProblems } from '../../web/src/editor/mappositionvalidation.js';
import { fitViewport, panViewport, screenToWorld, zoomAt } from '../../web/src/editor/viewport.js';
import { catalogLayer } from './mapcataloglayers.js';
import { projectAtomicSpriteCatalog } from './mapatomiccatalog.js';
import { planCityGroupPlacement, materializeCityGroupPlacement } from '../../web/src/editor/citygroupplacement.js';
import { planSpriteMaterialization } from './mapspriterecipes.js';
import cityGroupCatalog from './mapcitygroups.json' with { type: 'json' };

// Display-only recipes stay private, separate from placeable source definitions/plans.
const cityGroups = new Map(cityGroupCatalog.items.map(item => [`catalog:${item.itemId}`, {
  itemId: item.itemId, name: item.name,
  tiles: item.rows.flatMap((row, y) => row.map((tile, x) => [x, y, tile])),
  width: item.rows[0].length * cityGroupCatalog.previewCellSize,
  height: item.rows.length * cityGroupCatalog.previewCellSize,
}]));

// Optional private recipe port remains for reusable combination tooling, never
// populated by the current workspace. City groups are previews, not placement plans.
export function createMapCanvas({ publish, stage, gameId = 'system-base-map', spriteRecipes = [] }) {
  let pickedCell = null, copiedCells = null;
  const decorById = new Map(), groupById = new Map(), selectableByDecor = new Map();
  let source = null, canvas = null, mini = null, atlas = null, tiles = null, picker = null, selected = null;
  let diagnostics = [], gridVisible = true, placement = null, objectMove = null, multi = [];
  let moveBackdrop = null, errorCells = [], positionCheckActive = false;
  let miniImage = null;
  let view = { x: 0, y: 0, zoom: 1 }, size = { width: 1, height: 1 }, minimap = null;
  const thumbnails = new Map();
  // Program descriptors and plans stay private; no fabricated definition enters source or Vue.
  const recipes = structuredClone(spriteRecipes);
  let recipePlans = new Map(), availableCityGroups = new Set();
  let atomicCatalog = projectAtomicSpriteCatalog();
  const materialDefinition = id => {
    if (cityGroups.has(id)) return recipePlans.get(id)?.definition;
    return recipePlans.has(id) ? recipePlans.get(id)?.definition : source?.componentDefinitions[id];
  };
  const visible = { base: true, decor: true, roads: true, cities: true };
  const locked = { base: false, decor: false, roads: false, cities: false };
  const world = () => ({ width: source.map.bounds.width * 16, height: source.map.bounds.height * 16 });
  const newId = kind => `${gameId}#${kind}-${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  function drawThumbnail(target, id) {
    const context = target.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, target.width, target.height);
    const group = cityGroups.get(id), def = materialDefinition(id);
    if (group ? !availableCityGroups.has(id) : !def) return;
    const tiles = group ? group.tiles : def.variants[Object.keys(def.variants)[0]].tiles;
    const xs = tiles.map(([x]) => x), ys = tiles.map(([, y]) => y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    // Single atoms use 2x previews; city groups keep native 16px cells and aspect ratio.
    const cell = group ? cityGroupCatalog.previewCellSize : 32;
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
    const group = groupById.get(id);
    return (group?.members ?? []).flatMap(member => {
      if (!includeHidden && !visible[({ decorations: 'decor', roads: 'roads', placements: 'cities' })[member.layer]]) return [];
      if (member.layer === 'roads') return source.map.roads.find(row => row.id === member.id).geometry.map(point => [point.x, point.y]);
      const item = member.layer === 'placements' ? source.map.placements.find(row => row.id === member.id) : decorById.get(member.id);
      const def = source.componentDefinitions[item.definitionRef ?? item.componentRef];
      return def ? def.footprint.map(([x, y]) => [item.x + x - def.anchor[0], item.y + y - def.anchor[1]]) : [[item.x, item.y]];
    });
  }
  let cellValues = null;
  const cellIndex = (x,y) => (y-source.map.bounds.minY)*source.map.bounds.width+x-source.map.bounds.minX;
  const cellTile = (x,y) => cellValues.getUint16(cellIndex(x,y)*2,true);
  function facts() {
    const projectedCatalog = structuredClone(atomicCatalog);
    const usedMaterials = new Set(source ? [...(source.map.decorations ?? []).map(row => row.definitionRef), ...source.map.roads.flatMap(road => (road.components ?? []).map(row => row.definitionRef)), ...source.map.placements.map(row => row.componentRef)] : []);
    const selectedDefinition = selected?.layer === 'decor' ? source.map.decorations.find(row => row.id === selected.id)?.definitionRef : null;
    const selectedCategory = projectedCatalog.catalogItems.find(row => row.id === selectedDefinition)?.category;
    const selectedType = selected?.layer === 'cell' ? ({ empty: '空格', decor: '裝飾', road: '道路', city: '據點' })[cellKind(cellValues.getUint16(selected.index * 2, true))] : projectedCatalog.catalogCategories.find(row => row.id === selectedCategory)?.name || ({ decor: '裝飾片段', base: '底圖', roads: '道路', cities: '據點', group: '組合' })[selected?.layer];
    let selectedGroup = null;
    if (selected?.layer === 'decor') selectedGroup = selectableGroupOf(selected.id)?.id ?? null;
    // Match the visible cell to the atomic catalog, not the object's instance ID or multi-cell anchor.
    const cell = pickedCell?.selection === selected ? pickedCell : selected;
    const bounds = source?.map.bounds;
    const cellTileId = selected?.layer === 'cell' ? (selectedType === '空格' ? null : cellValues.getUint16(selected.index * 2, true)) : cell && bounds && selected?.layer !== 'group' ? tiles?.[(cell.y - bounds.minY) * bounds.width + cell.x - bounds.minX] : null;
    publish({ cellMap: Boolean(cellValues), loaded: Boolean(source), zoom: view.zoom, gridVisible, selected: selected ? { ...selected, type: selectedType, cellTileId } : null,
      ...projectedCatalog,
      catalogCategories: projectedCatalog.catalogCategories.flatMap(category => category.id === 'city' ? [category, { id: 'city-group', name: '據點組' }] : [category]),
      catalogItems: [...projectedCatalog.catalogItems.map(row=>{
        if (!cellValues || !row.available) return row;
        const kind=cellKind(Number(row.id.slice(5)));
        if (kind==='city') return {...row,note:'放置中心後，請右鍵綁定據點並確認道路連通。'};
        if (kind==='road') return {...row,note:'放置道路或城門圖塊，不自動建立道路連線。'};
        return row;
      }), ...Array.from(cityGroups, ([id, group]) => {
        const available = availableCityGroups.has(id);
        return { id, itemId: group.itemId, name: group.name, category: 'city-group', cells: group.tiles.length,
          previewWidth: group.width, previewHeight: group.height, available, canPlace: Boolean(recipePlans.get(id)?.canPlace),
          note: available ? (cellValues ? '展開為獨立格；中心須綁定，不自動連路。' : '整組放置為裝飾，不建立城市或道路連線。') : '本圖缺少匹配的原子定義；不可預覽或放置。' };
      }), ...recipes.map(recipe => {
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
      waters: source ? (source.map.waterGroups ?? []).map(group => ({ id: group.id, name: group.name || group.id, visible: group.showOnMinimap })) : [],
      cities: source ? Object.values(source.cities ?? {}).map(city => ({ cityId: city.cityId, name: city.name ?? city.cityId, x: city.x, y: city.y, bound: source.map.placements.some(p => p?.cityId === city.cityId) })) : [],
      placements: source ? source.map.placements.map(p => ({ id: p.id, cityId: p.cityId ?? null, x: p.x, y: p.y })) : [],
      unboundCities: source ? Object.values(source.cities ?? {}).filter(city => !source.map.placements.some(p => p?.cityId === city.cityId)).map(city => ({ cityId: city.cityId, name: city.name ?? city.cityId })) : [],
      selectedBinding: selected?.layer === 'cities' || (selected?.layer === 'cell' && selectedType === '據點') ? (() => { const piece = source.map.placements.find(p => selected.layer==='cell' ? p.x===selected.x && p.y===selected.y : p.id===selected.id); return piece ? { pieceId: piece.id, cityId: piece.cityId ?? null, x: piece.x, y: piece.y } : null; })() : selected?.center205 ? { pieceId: null, cityId: null, x: selected.x + selected.center205[0], y: selected.y + selected.center205[1] } : null,
      selectedGroup,
      multi: multi.map(({ kind, id }) => ({ kind, id })),
      multiNames: multi.slice(0, 3).map(row => row.name || row.id),
      objectMove: objectMove ? { ...objectMove } : null,
    });
  }
  // Layer ownership, not tile colour: a placed sea tile can be byte-identical to the base.
  function coverage(map) {
    if (gameId !== 'system-base-map') return null;
    const { width, height, minX, minY } = map.bounds, bits = new Uint8Array(width * height);
    const mark = (item, ref, bit) => {
      const def = source.componentDefinitions[ref];
      for (const [dx, dy] of def.footprint) bits[(item.y - minY + dy - def.anchor[1]) * width + item.x - minX + dx - def.anchor[0]] |= bit;
    };
    for (const item of map.decorations) mark(item, item.definitionRef, 1);
    for (const road of map.roads) for (const item of road.components ?? []) mark(item, item.definitionRef, 2);
    for (const item of map.placements) if (item.componentRef) mark(item, item.componentRef, 4);
    return bits;
  }
  let overlayCells = null, backdropCoverage = null;
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
    const moving = objectMove?.started;
    const movingIds = new Set(moving ? objectMove.memberIds ?? [objectMove.id] : []);
    const lifting = moving && !objectMove.copy;
    if (!lifting) moveBackdrop = null;
    else if (!moveBackdrop && cellValues) {
      moveBackdrop = tiles.slice(); backdropCoverage = overlayCells?.slice();
      for (const [x,y] of objectMove.baseCells) {
        const i=cellIndex(x,y); moveBackdrop[i]=95; if (backdropCoverage) backdropCoverage[i]=0;
      }
    } else if (!moveBackdrop) {
      const parts = ['roads', 'cities'].includes(objectMove.layer) ? mapObjectParts(source, objectMove.layer, objectMove.id) : null;
      const removed = new Set(parts ? parts.decorations.map(item => item.id) : movingIds);
      const map = { ...source.map,
        decorations: source.map.decorations.filter(item => !removed.has(item.id)),
        roads: source.map.roads.filter(item => item !== parts?.road),
        placements: source.map.placements.filter(item => item !== parts?.place), waterGroups: [] };
      moveBackdrop = composeMapDisplayLayers({ ...source, map }, visible).tiles;
      backdropCoverage = coverage(map);
    }
    const displayTiles = lifting ? moveBackdrop : tiles, masks = lifting ? backdropCoverage : overlayCells;
    const shown = (visible.decor ? 1 : 0) | (visible.roads ? 2 : 0) | (visible.cities ? 4 : 0);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const tile = displayTiles[y * width + x], sx = (x * 16 - view.x) * view.zoom, sy = (y * 16 - view.y) * view.zoom;
      if (tile === null) { context.fillStyle = (x + y) % 2 ? '#dddddd' : '#eeeeee'; context.fillRect(sx, sy, cell, cell); }
      else if (atlas) {
        context.drawImage(atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16, sx, sy, cell, cell);
        if (masks && visible.base && !(masks[y * width + x] & shown)) {
          context.fillStyle = 'rgba(150, 150, 150, 0.55)'; context.fillRect(sx, sy, cell, cell);
        }
      }
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
    if (moving && atlas) {
      context.globalAlpha = cellValues && !objectMove.copy ? 1 : 0.5;
      if (cellValues) for (const [x,y] of objectMove.baseCells) {
        const tile = cellTile(x,y);
        context.drawImage(atlas,tile%16*16,Math.floor(tile/16)*16,16,16,((x+objectMove.dx-source.map.bounds.minX)*16-view.x)*view.zoom,((y+objectMove.dy-source.map.bounds.minY)*16-view.y)*view.zoom,cell,cell);
      }
      const stamps = cellValues ? [] : ['roads', 'cities'].includes(objectMove.layer) ? mapObjectParts(source, objectMove.layer, objectMove.id).stamps : source.map.decorations.filter(item => movingIds.has(item.id));
      stamps.forEach(item => {
        const def = source.componentDefinitions[item.definitionRef];
        def.variants[item.variantRef ?? 'original'].tiles.forEach(([dx, dy, tile]) => {
          const x = item.x + dx - def.anchor[0] + objectMove.dx - source.map.bounds.minX;
          const y = item.y + dy - def.anchor[1] + objectMove.dy - source.map.bounds.minY;
          context.drawImage(atlas, tile % 16 * 16, Math.floor(tile / 16) * 16, 16, 16,
            (x * 16 - view.x) * view.zoom, (y * 16 - view.y) * view.zoom, cell, cell);
        });
      });
      context.globalAlpha = 1;
    }
    // Errors belong to the candidate, not visibility or selection. One fill per
    // cell avoids darker overlap and disappears on the next successful repair.
    context.fillStyle = 'rgba(255, 0, 0, 0.35)';
    errorCells.forEach(([x, y]) => {
      const col = x - source.map.bounds.minX, row = y - source.map.bounds.minY;
      if (col >= left && col < right && row >= top && row < bottom)
        context.fillRect((col * 16 - view.x) * view.zoom, (row * 16 - view.y) * view.zoom, cell, cell);
    });
    if (selected && !moving) {
      let cells = selected.layer === 'group' ? groupCells(selected.id) : [[selected.x, selected.y]];
      if (selected.layer === 'decor') {
        const item = source.map.decorations.find(row => row.id === selected.id);
        if (item) { const def = source.componentDefinitions[item.definitionRef]; cells = def.footprint.map(([x, y]) => [item.x + x - def.anchor[0], item.y + y - def.anchor[1]]); }
      }
      context.strokeStyle = '#ffffff'; context.lineWidth = 1;
      cells.forEach(([x, y]) => context.strokeRect(((x - source.map.bounds.minX) * 16 - view.x) * view.zoom, ((y - source.map.bounds.minY) * 16 - view.y) * view.zoom, cell, cell));
    }
    if (multi.length && !moving) {
      const cells = multiCells();
      context.strokeStyle = '#ff9900'; context.lineWidth = 1;
      cells.forEach(([x, y]) => context.strokeRect(((x - source.map.bounds.minX) * 16 - view.x) * view.zoom, ((y - source.map.bounds.minY) * 16 - view.y) * view.zoom, cell, cell));
    }
    if (moving && objectMove.cells.length) {
      context.strokeStyle = objectMove.inBounds ? '#00ffcc' : '#ff4444'; context.lineWidth = 2;
      objectMove.cells.forEach(([x, y]) => context.strokeRect(((x - source.map.bounds.minX) * 16 - view.x) * view.zoom, ((y - source.map.bounds.minY) * 16 - view.y) * view.zoom, cell, cell));
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

    }
    if (mini && minimap) {
      const ctx = mini.getContext('2d');
      if (!miniImage) {
        miniImage = ctx.createImageData(250, 167);
        const rgba = miniImage.data, rgb = minimap.pixels;
        for (let s = 0, d = 0; s < rgb.length; s += 3, d += 4) {
          rgba[d] = rgb[s]; rgba[d+1] = rgb[s+1]; rgba[d+2] = rgb[s+2]; rgba[d+3] = 255;
        }
      }
      if (mini.width !== 250) mini.width = 250;
      if (mini.height !== 167) mini.height = 167;
      ctx.putImageData(miniImage, 0, 0);
      ctx.strokeStyle = '#ffcc00'; ctx.strokeRect(view.x / world().width * 250, view.y / world().height * 167, size.width / view.zoom / world().width * 250, size.height / view.zoom / world().height * 167);
    }
  }
  function snappedCell(sx, sy, clamp = false) {
    if (!source || !Number.isFinite(sx) || !Number.isFinite(sy)) return null;
    const [wx, wy] = screenToWorld(view, sx, sy);
    const { minX, minY, width, height } = source.map.bounds;
    const x = Math.floor(wx / 16) + minX, y = Math.floor(wy / 16) + minY;
    if (clamp) return { x: Math.max(minX, Math.min(minX + width - 1, x)), y: Math.max(minY, Math.min(minY + height - 1, y)) };
    if (x < minX || x >= minX + width || y < minY || y >= minY + height) return null;
    return { x, y };
  }
  function decorMoveCells(item, toX, toY) {
    const def = source.componentDefinitions[item.definitionRef];
    if (!def) return null;
    const cells = def.footprint.map(([dx, dy]) => [toX + dx - def.anchor[0], toY + dy - def.anchor[1]]);
    const { minX, minY, width, height } = source.map.bounds;
    const inBounds = cells.every(([x, y]) => x >= minX && x < minX + width && y >= minY && y < minY + height);
    return { cells, inBounds };
  }
  function beginObjectMove(sx, sy, copy = false) {
    objectMove = null;
    if (!source || !selected) return false;
    if (cellValues) return beginCellMove([[selected.x,selected.y]], sx, sy, copy);
    const layer = ['roads', 'cities'].includes(selected.layer) ? selected.layer : 'decor';
    if (locked[layer] || !visible[layer]) return false;
    const cell = snappedCell(sx, sy);
    if (!cell) return false;
    if (layer !== 'decor') {
      if (copy) return false;
      const parts = mapObjectParts(source, layer, selected.id);
      if (parts.decorations.length && (locked.decor || !visible.decor)) return false;
      if (!parts.cells.some(([x, y]) => x === cell.x && y === cell.y)) return false;
      objectMove = { layer, id: selected.id, fromX: selected.x, fromY: selected.y, toX: selected.x, toY: selected.y,
        dx: 0, dy: 0, gripX: cell.x, gripY: cell.y, inBounds: true, cells: parts.cells, baseCells: parts.cells };
      draw(); facts(); return true;
    }
    if (selected.layer === 'decor') {
      const item = source.map.decorations.find(row => row.id === selected.id);
      if (!item) return false;
      const info = decorMoveCells(item, item.x, item.y);
      if (!info || !info.cells.some(([x, y]) => x === cell.x && y === cell.y)) return false;
      objectMove = { copy, layer: 'decor', id: item.id, fromX: item.x, fromY: item.y, toX: item.x, toY: item.y, dx: 0, dy: 0, gripX: cell.x, gripY: cell.y, inBounds: true, cells: info.cells };
      draw(); facts();
      return true;
    }
    if (selected.layer === 'group') {
      const group = source.selectionGroups?.find(row => row.id === selected.id);
      if (!group || !group.members.length || group.members.some(member => member.layer !== 'decorations')) return false;
      const cells = groupCells(selected.id);
      if (!cells.some(([x, y]) => x === cell.x && y === cell.y)) return false;
      objectMove = { copy, layer: 'group', id: selected.id, memberIds: group.members.map(member => member.id), fromX: selected.x, fromY: selected.y, toX: selected.x, toY: selected.y, dx: 0, dy: 0, gripX: cell.x, gripY: cell.y, inBounds: true, cells };
      draw(); facts();
      return true;
    }
    return false;
  }
  function moveFeedback() {
    draw();
    publish({ objectMove: objectMove ? { ...objectMove } : null });
  }
  function previewObjectMove(sx, sy) {
    if (!objectMove || !source) return objectMove ? { ...objectMove } : null;
    const cell = snappedCell(sx, sy);
    if (objectMove.started && cell?.x === objectMove.pointerX && cell?.y === objectMove.pointerY) return { ...objectMove };
    objectMove.started = true;
    objectMove.pointerX = cell?.x;
    objectMove.pointerY = cell?.y;
    if (!cell) { objectMove = { ...objectMove, inBounds: false }; draw(); facts(); return { ...objectMove }; }
    if (objectMove.layer === 'decor') {
      const item = source.map.decorations.find(row => row.id === objectMove.id);
      if (!item) { objectMove = null; draw(); facts(); return null; }
      // Snap anchor to grid; top-left follows because anchor offsets are integers.
      const toX = item.x + cell.x - objectMove.gripX, toY = item.y + cell.y - objectMove.gripY;
      const info = decorMoveCells(item, toX, toY);
      objectMove = { ...objectMove, toX, toY, dx: toX - item.x, dy: toY - item.y, inBounds: info.inBounds, cells: info.cells };
      moveFeedback();
      return { ...objectMove };
    }
    if (objectMove.layer === 'group') {
      // Recompute from original group cells anchored at fromX/fromY.
      const group = source.selectionGroups?.find(row => row.id === objectMove.id);
      if (!group) { objectMove = null; draw(); facts(); return null; }
      const baseCells = groupCells(objectMove.id, true);
      if (!baseCells.length) { objectMove = null; draw(); facts(); return null; }
      const shiftX = cell.x - objectMove.gripX, shiftY = cell.y - objectMove.gripY;
      const moved = baseCells.map(([x, y]) => [x + shiftX, y + shiftY]);
      const { minX: boundMinX, minY: boundMinY, width, height } = source.map.bounds;
      const inBounds = moved.every(([x, y]) => x >= boundMinX && x < boundMinX + width && y >= boundMinY && y < boundMinY + height);
      objectMove = { ...objectMove, toX: objectMove.fromX + shiftX, toY: objectMove.fromY + shiftY, dx: shiftX, dy: shiftY, inBounds, cells: moved };
      moveFeedback();
      return { ...objectMove };
    }
    if (['cells','multi', 'roads', 'cities'].includes(objectMove.layer)) {
      const base = objectMove.baseCells;
      if (!base?.length) { objectMove = null; draw(); facts(); return null; }
      const shiftX = cell.x - objectMove.gripX, shiftY = cell.y - objectMove.gripY;
      const moved = base.map(([x, y]) => [x + shiftX, y + shiftY]);
      const { minX: boundMinX, minY: boundMinY, width, height } = source.map.bounds;
      const inBounds = moved.every(([x, y]) => x >= boundMinX && x < boundMinX + width && y >= boundMinY && y < boundMinY + height);
      objectMove = { ...objectMove, toX: objectMove.fromX + shiftX, toY: objectMove.fromY + shiftY, dx: shiftX, dy: shiftY, inBounds, cells: moved };
      moveFeedback();
      return { ...objectMove };
    }
    return null;
  }
  function commitObjectMove() {
    const pending = objectMove;
    objectMove = null; draw();
    const layer = ['roads', 'cities'].includes(pending?.layer) ? pending.layer : 'decor';
    if (!pending?.inBounds || !source || locked[layer] || !visible[layer]) { facts(); return; }
    if (pending.dx === 0 && pending.dy === 0) { facts(); return; }
    if (pending.layer==='cells') {
      const many = Boolean(multi.length);
      const result = stage({op:'cell-transfer',points:pending.baseCells.map(([x,y])=>({x,y})),dx:pending.dx,dy:pending.dy,copy:pending.copy});
      if (result !== false) {
        if (many) { selected=null; multi=pending.cells.map(([x,y])=>({kind:'cell',id:cellIndex(x,y),x,y,name:`${x}, ${y}`})); }
        else { const [[x,y]]=pending.cells; selected={layer:'cell',x,y,index:cellIndex(x,y)}; }
        draw(); facts();
      }
      return result;
    }
    if (layer !== 'decor') {
      positionCheckActive = true;
      facts();
      return stage({ op: 'map-object-translate', layer, id: pending.id, dx: pending.dx, dy: pending.dy });
    }
    // 落定即置顶：同一撤销单元内先平移再置顶，否则被晚绘制的实例盖住（视觉下沉）。
    let members = null;
    if (pending.layer === 'group' || pending.layer === 'multi') members = [...pending.memberIds];
    else if (pending.layer === 'decor') members = [pending.id];
    if (!members) { facts(); return; }
    facts();
    if (pending.copy) {
      const ids = new Set(members);
      // Source order preserves the overlap order even if the user selected in reverse.
      const originals = source.map.decorations.filter(item => ids.has(item.id));
      const edits = originals.map(item => ({
        op: 'decoration-place', instanceId: newId('decoration'), copyFrom: item.id, materialId: item.definitionRef, variantRef: item.variantRef ?? 'original',
        x: item.x + pending.dx, y: item.y + pending.dy, waterClass: item.waterClass ?? null,
      }));
      const copied = new Map(originals.map((item, i) => [item.id, edits[i].instanceId]));
      const groups = pending.layer === 'group' ? [pending.id] : pending.layer === 'multi' ? multi.filter(entry => entry.kind === 'group').map(entry => entry.id) : [];
      for (const id of groups) {
        const memberIds = groupById.get(id).members.map(member => copied.get(member.id));
        if (memberIds.length > 1 && memberIds.every(Boolean)) edits.push({ op: 'decoration-group', groupId: newId('group'), memberIds });
      }
      return stage(edits);
    }
    return stage([
      { op: 'decoration-translate', memberIds: members, dx: pending.dx, dy: pending.dy },
      { op: 'decoration-reorder', memberIds: members, direction: 'top' },
    ]);
  }
  function cancelObjectMove() { if (objectMove) { objectMove = null; draw(); facts(); } }
  const genericGroupPrefix = () => `${gameId}#group-`;
  function legacyGroupId(id) { return /^web-piece-group-\d+$/.test(id ?? ''); }
  function selectableGroupOf(decorId) {
    return selectableByDecor.get(decorId);
  }
  function isSelectableGroup(row) {
    return row && typeof row.id === 'string' && (row.id.startsWith(genericGroupPrefix()) || legacyGroupId(row.id));
  }
  function multiCells() {
    if (cellValues) return multi.map(p=>[p.x,p.y]);
    const cells = [];
    for (const entry of multi) {
      if (entry.kind === 'decor') {
        const item = decorById.get(entry.id);
        if (!item) continue;
        const def = source.componentDefinitions[item.definitionRef];
        if (!def) continue;
        for (const [x, y] of def.footprint) cells.push([item.x + x - def.anchor[0], item.y + y - def.anchor[1]]);
      } else if (entry.kind === 'group') cells.push(...groupCells(entry.id));
    }
    return cells;
  }
  function multiDecorIds() {
    const ids = new Set();
    for (const entry of multi) {
      if (entry.kind === 'decor') ids.add(entry.id);
      else if (entry.kind === 'group') {
        const group = groupById.get(entry.id);
        for (const member of group?.members ?? []) if (member?.layer === 'decorations') ids.add(member.id);
      }
    }
    return [...ids];
  }
  // Shift+click toggles the topmost object: a generic group when the decor
  // belongs to one (city groups never join multi-select), else the decor.
  // Roads/cities are rejected for grouping. Plain clicks still use pick().
  function toggleMulti(sx, sy, endX, endY) {
    if (cellValues) {
      const a=snappedCell(sx,sy), b=endX===undefined?a:snappedCell(endX,endY,true);
      if (!a || !b) return {toggled:false};
      const entries=new Map(multi.map(p=>[p.id,p]));
      const add=(x,y,toggle)=>{
        if (cellKind(cellTile(x,y))==='empty') return;
        const id=cellIndex(x,y);
        if (toggle && entries.has(id)) entries.delete(id); else entries.set(id,{kind:'cell',id,x,y,name:`${x}, ${y}`});
      };
      if (selected) add(selected.x,selected.y,false);
      for(let y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y++) for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x++) add(x,y,endX===undefined);
      selected=null; multi=[...entries.values()]; placement=null; objectMove=null;draw();facts();return {toggled:true,multi};
    }
    if (!source || locked.decor || !visible.decor) return { toggled: false };
    const cell = snappedCell(sx, sy);
    if (!cell) return { toggled: false };
    const range = endX !== undefined;
    const indices = new Set();
    if (range) {
      const end = snappedCell(endX, endY, true);
      const blocked = new Set();
      if (visible.cities && !locked.cities) for (const p of source.map.placements) blocked.add(`${p.x},${p.y}`);
      if (visible.roads && !locked.roads) for (const road of source.map.roads) for (const p of road.geometry) blocked.add(`${p.x},${p.y}`);
      for (let y = Math.min(cell.y, end.y); y <= Math.max(cell.y, end.y); y++) {
        for (let x = Math.min(cell.x, end.x); x <= Math.max(cell.x, end.x); x++) {
          if (!blocked.has(`${x},${y}`)) indices.add(picker.pick(x, y));
        }
      }
    } else {
      if (visible.cities && !locked.cities && source.map.placements.some(row => row.x === cell.x && row.y === cell.y)) return { toggled: false, rejected: 'city' };
      if (visible.roads && !locked.roads && source.map.roads.some(row => row.geometry.some(point => point.x === cell.x && point.y === cell.y))) return { toggled: false, rejected: 'road' };
      indices.add(picker.pick(cell.x, cell.y));
    }
    const items = [...indices].map(i => source.map.decorations[i]).filter(Boolean);
    if (!items.length) return { toggled: false };
    if (!multi.length && selected && (selected.layer === 'decor' || selected.layer === 'group')) {
      const first = selected.layer === 'group' ? { kind: 'group', id: selected.id } : { kind: 'decor', id: selected.id };
      const known = first.kind === 'decor' || (source.selectionGroups ?? []).some(row => row.id === first.id && isSelectableGroup(row));
      if (known) multi.push({ ...first, name: selected.name });
      selected = null;
    }
    const entries = new Map(multi.map(row => [`${row.kind}:${row.id}`, row]));
    for (const item of items) {
      const group = selectableGroupOf(item.id);
      const entry = group ? { kind: 'group', id: group.id, name: group.label } : { kind: 'decor', id: item.id, name: source.componentDefinitions[item.definitionRef].name || item.definitionRef };
      const key = `${entry.kind}:${entry.id}`;
      if (!range && entries.has(key)) entries.delete(key);
      else entries.set(key, entry);
    }
    if (range) selected = null;
    multi = [...entries.values()];
    objectMove = null; placement = null;
    draw(); facts();
    return { toggled: true, multi: multi.map(({ kind, id }) => ({ kind, id })) };
  }
  function beginCellMove(cells,sx,sy,copy) {
    const grip=snappedCell(sx,sy);
    if (!grip || !cells.some(([x,y])=>x===grip.x && y===grip.y) || cells.some(([x,y])=>cellKind(cellTile(x,y))==='empty' || (copy && cellKind(cellTile(x,y))!=='decor'))) return false;
    objectMove={layer:'cells',copy,gripX:grip.x,gripY:grip.y,fromX:grip.x,fromY:grip.y,dx:0,dy:0,cells,baseCells:cells,inBounds:true};
    moveFeedback(); return true;
  }
  function beginMultiMove(sx, sy, copy = false) {
    if (cellValues) return beginCellMove(multiCells(),sx,sy,copy);
    if (!source || !multi.length || locked.decor || !visible.decor) return false;
    const cell = snappedCell(sx, sy);
    if (!cell) return false;
    const cells = multiCells();
    if (!cells.length || !cells.some(([x, y]) => x === cell.x && y === cell.y)) return false;
    const memberIds = multiDecorIds();
    if (!memberIds.length) return false;
    objectMove = { copy, layer: 'multi', id: null, memberIds, baseCells: cells.map(pair => [...pair]), fromX: Math.min(...cells.map(([x]) => x)), fromY: Math.min(...cells.map(([, y]) => y)), toX: 0, toY: 0, dx: 0, dy: 0, gripX: cell.x, gripY: cell.y, inBounds: true, cells };
    draw(); facts();
    return true;
  }
  // Flatten selected footprints into one new object; historical grouping is
  // reconciled away, never copied into the new object's identity.
  function groupSelection() {
    if (!source || locked.decor || !visible.decor) return { error: 'locked' };
    const memberIds = multiDecorIds();
    if (memberIds.length < 2) return { error: 'at-least-two' };
    const instanceId = newId('decoration');
    if (stage([{ op: 'decoration-combine', memberIds, materialId: newId('material'), instanceId }]) === false) return { error: 'rejected' };
    multi = []; objectMove = null; placement = null;
    const item = source.map.decorations.find(row => row.id === instanceId);
    selected = item ? { layer: 'decor', id: item.id, x: item.x, y: item.y, cells: source.componentDefinitions[item.definitionRef].footprint.length, captureAllowed: true } : null;
    draw(); facts();
    return { grouped: true };
  }
  function ungroupSelection() {
    if (!source || locked.decor || !visible.decor) return { error: 'locked' };
    let groupIds = multi.filter(entry => entry.kind === 'group').map(entry => entry.id);
    if (!groupIds.length && selected?.layer === 'decor') {
      const group = selectableGroupOf(selected.id);
      if (group) groupIds = [group.id];
    }
    const memberIds = new Set(multiDecorIds());
    if (selected?.layer === 'decor') memberIds.add(selected.id);
    for (const groupId of groupIds) {
      for (const member of source.selectionGroups.find(row => row.id === groupId).members) {
        if (member.layer !== 'decorations') return { error: 'unsupported' };
        memberIds.add(member.id);
      }
    }
    const splits = source.map.decorations.filter(item => memberIds.has(item.id)).flatMap(item => {
      const def = source.componentDefinitions[item.definitionRef];
      return def.footprint.length > 1 ? [{ op: 'decoration-split', instanceId: item.id,
        childIds: def.footprint.map(() => newId('decoration')) }] : [];
    });
    const edits = [...groupIds.map(groupId => ({ op: 'decoration-ungroup', groupId })), ...splits];
    if (!edits.length) return { noop: true };
    // Dedicated city/water selection groups must never be flattened here.
    if ((source.selectionGroups ?? []).some(group => !isSelectableGroup(group) && group.members.some(member => member.layer === 'decorations' && memberIds.has(member.id)))) return { error: 'unsupported' };
    const selectedSplit = splits.find(edit => edit.instanceId === selected?.id);
    const child = selectedSplit ? source.map.decorations.find(item => item.id === selectedSplit.instanceId) : null;
    const def = child ? source.componentDefinitions[child.definitionRef] : null;
    const firstCell = def?.variants[child.variantRef ?? 'original'].tiles[0];
    // Controller preflights the entire batch before installing one undo unit.
    if (stage(edits) === false) return { error: 'locked' };
    if (selectedSplit) selected = { layer: 'decor', id: selectedSplit.childIds[0],
      x: child.x + firstCell[0] - def.anchor[0], y: child.y + firstCell[1] - def.anchor[1], cells: 1 };
    multi = []; objectMove = null; placement = null;
    draw(); facts();
    return splits.length ? { ungrouped: groupIds, split: splits.length } : { ungrouped: groupIds };
  }
  function resize(width, height) {
    placement = null; objectMove = null;
    const previous = size;
    size = { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
    const ratio = globalThis.devicePixelRatio || 1;
    if (canvas) { canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio); }
    if (source) view = panViewport({ ...view, x: view.x + (previous.width - size.width) / (2 * view.zoom), y: view.y + (previous.height - size.height) / (2 * view.zoom) }, 0, 0, size, world());
    draw();
  }
  function setSource(value, checkPositions = positionCheckActive, unchangedCatalog = false) {
    positionCheckActive = Boolean(value && checkPositions);
    const first = !source;
    const previousCells = cellValues, previousMap = source?.map;
    placement = null; objectMove = null; multi = [];
    source = value;
    cellValues = source?.map.format === 'cell-map-1' ? new DataView(decode(source.map.cellsLE, source.map.bounds.width * source.map.bounds.height * 2).buffer) : null;
    if (cellValues && !unchangedCatalog) {
      for (const id of Object.keys(visible)) { visible[id] = true; locked[id] = false; }
    }
    if ((cellValues && selected?.layer !== 'cell') || (!cellValues && selected?.layer === 'cell')) selected = null;
    if (cellValues && selected && selected.index * 2 >= cellValues.byteLength) selected = null;
    decorById.clear(); groupById.clear(); selectableByDecor.clear();
    for (const item of source?.map.decorations ?? []) decorById.set(item.id, item);
    for (const group of source?.selectionGroups ?? []) {
      groupById.set(group.id, group);
      if (isSelectableGroup(group)) for (const m of group.members) {
        if (m.layer === 'decorations' && !selectableByDecor.has(m.id)) selectableByDecor.set(m.id, group);
      }
    }
    pickedCell = null;
    if (!source) copiedCells = null;
    moveBackdrop = null;
    if (!unchangedCatalog) {
      atomicCatalog = projectAtomicSpriteCatalog(source?.componentDefinitions);
      availableCityGroups = new Set(Array.from(cityGroups).filter(([, group]) => group.tiles.every(([, , tile]) => atomicCatalog.catalogAtoms[tile].available)).map(([id]) => id));
      // Library group drops are visual decorations; semantic city creation remains a separate command.
      const groupRecipes = Array.from(cityGroups.values(), group => ({ ...group, anchor: [0, 0], footprint: group.tiles.map(([x, y]) => [x, y]),
        ruleRecipeRef: 'ki-byte-stamp-1', support: 'existing-decoration', geographyEffect: 'preserve-underlay' }));
      recipePlans = new Map([...recipes, ...groupRecipes].map(recipe => [`catalog:${recipe.itemId}`, source ? planSpriteMaterialization(source.componentDefinitions, recipe) : null]));
    }
    if (!source) { diagnostics = []; atlas = null; tiles = null; picker = null; selected = null; minimap = null; thumbnails.forEach((target, id) => drawThumbnail(target, id)); if (mini) mini.getContext('2d').clearRect(0, 0, mini.width, mini.height); draw(); facts(); return; }
    const composed = composeMapLayers(source, { draft: true });
    if (cellValues) {
      tiles = composed.terrain;
      overlayCells = gameId === 'system-base-map' ? Uint8Array.from(tiles, (_, i) => cellValues.getUint16(i*2,true) === EMPTY_CELL ? 0 : 1) : null;
      picker = null;
    } else if (Object.values(visible).every(Boolean)) {
      const unsupported = composed.diagnostics.find(problem => problem.code !== 'UNKNOWN_UNDERLAY');
      if (unsupported) throw new RangeError(unsupported.message);
      tiles = composed.terrain;
    } else tiles = composeMapDisplayLayers(source, visible).tiles;
    if (!cellValues) { picker = createDecorationPicker(source); overlayCells = coverage(source.map); }
    if (selected?.layer === 'decor') {
      const item = source.map.decorations.find(row => row.id === selected.id);
      selected = item ? { ...selected, x: item.x, y: item.y, cells: source.componentDefinitions[item.definitionRef].footprint.length, captureAllowed: true } : null;
    }
    if (selected?.layer === 'group') {
      const group = source.selectionGroups?.find(group => group.id === selected.id);
      selected = group ? { ...selected, members: group.members.length, cells: groupCells(group.id, true).length, captureAllowed: group.members.every(member => member.layer === 'decorations') } : null;
    }
    if (selected?.layer === 'cities' || selected?.layer === 'roads') {
      const item = (selected.layer === 'cities' ? source.map.placements : source.map.roads).find(row => row.id === selected.id);
      const point = selected.layer === 'cities' ? item : item?.geometry[0];
      selected = point ? { ...selected, x: point.x, y: point.y } : null;
    }
    // Keep the red overlay through decor-only gestures, including a pre-existing break after reload.
    const unchangedNetwork = cellValues && previousCells && previousMap.roads === source.map.roads && previousMap.placements === source.map.placements && previousMap.bounds === source.map.bounds && !tiles.some((_, i) => {
      const a = previousCells.getUint16(i*2,true), b = cellValues.getUint16(i*2,true);
      return a !== b && (cellKind(a) === 'road' || cellKind(b) === 'road' || cellKind(a) === 'city' || cellKind(b) === 'city');
    });
    if (!unchangedNetwork) {
      const positionProblems = cellValues || positionCheckActive ? mapPositionProblems(source, composed.terrain) : [];
      errorCells = [...new Map(positionProblems.flatMap(problem => problem.cells).map(cell => [cell.join(','), cell])).values()];
    }
    // Position details are save-only; live feedback is the red cell overlay.
    diagnostics = composed.diagnostics;
    const { width, height, minX, minY } = source.map.bounds, roads = new Uint8Array(width * height);
    source.map.roads.forEach(road => road.geometry.forEach(({ x, y }) => { roads[(y - minY) * width + x - minX] = 1; }));
    miniImage = null;
    minimap = renderMinimapPixels(composed.minimapGeography, roads, width, height, 250, 167, 1);
    if (first) view = fitViewport(size, world());
    draw();
    if (!unchangedCatalog) thumbnails.forEach((target, id) => drawThumbnail(target, id));
    facts();
  }
  function pick(sx, sy) {
    if (!source) return;
    const [wx, wy] = screenToWorld(view, sx, sy), { minX, minY, width, height } = source.map.bounds;
    const x = Math.floor(wx / 16) + minX, y = Math.floor(wy / 16) + minY;
    if (x < minX || x >= minX + width || y < minY || y >= minY + height) return;
    placement = null; objectMove = null; multi = [];
    if (cellValues) {
      selected = { layer: 'cell', x, y, index: (y - minY) * width + x - minX };
      draw(); facts(); return;
    }
    const prev = selected;
    selected = null;
    if (visible.cities && !locked.cities) {
      const place = source.map.placements.find(row => row.x === x && row.y === y);
      if (place) selected = { layer: 'cities', id: place.id,
        name: place.cityId == null ? `未綁定圖塊 ${place.id.slice(-8)}` : (source.cities[place.cityId]?.name || place.cityId), x, y };
    }
    if (!selected && visible.roads && !locked.roads) {
      const road = source.map.roads.find(row => row.geometry.some(point => point.x === x && point.y === y));
      if (road) selected = { layer: 'roads', id: road.id, name: road.id, x, y };
    }
    if (!selected && visible.decor && !locked.decor) {
      const index = picker.pick(x, y), item = source.map.decorations[index];
      if (item) {
        const def = source.componentDefinitions[item.definitionRef], dx = x - item.x, dy = y - item.y;
        const center = visible.cities && !locked.cities && def.variants[item.variantRef ?? 'original'].tiles.some(([tx, ty, tile]) => tile === 205 && tx === dx + def.anchor[0] && ty === dy + def.anchor[1]);
        selected = { layer: 'decor', id: item.id, name: def.name || item.definitionRef, x: item.x, y: item.y, cells: def.footprint.length, captureAllowed: true, ...(center ? { center205: [dx, dy] } : {}) };
      }
    }
    if (!selected && visible.base && !locked.base) selected = { layer: 'base', id: String((y - minY) * width + x - minX), name: '底圖格', x, y };
    if (selected && prev && (selected.layer === 'decor' || selected.layer === 'group') && selected.layer === prev.layer && selected.id === prev.id && String(selected.center205) === String(prev.center205)) selected = null;
    pickedCell = selected ? { x, y, selection: selected } : null;
    draw(); facts();
  }
  function newCityStamp(x, y, tile) {
    const places = source.map.placements;
    if (places.some(place => place.x === x && place.y === y)) throw new Error(`(${x}, ${y}) 已有據點中心。`);
    const last = places.reduce((end, p) => !end || p.y > end.y || (p.y === end.y && p.x > end.x) ? p : end, null);
    if (!hasStructuredMapExtent(source.map.bounds) && last && (y < last.y || (y === last.y && x <= last.x))) throw new Error(`不能在 (${x}, ${y}) 新增據點中心：請選在最後一個中心 (${last.x}, ${last.y}) 的南方，或同一行的東側。先前修改仍可保存。`);
    return { op: 'city-stamp', pieceId: newId('city-piece'), x, y, tile };
  }
  function command(op, fields = {}) {
    if (cellValues) {
      const points=multi.length?multi.map(({x,y})=>({x,y})):selected?[{x:selected.x,y:selected.y}]:[];
      if (!points.length) throw new RangeError('請先選取格子。');
      const [anchor]=points;
      if (op==='city-bind' || op==='city-unbind') return stage({op,...fields});
      if (op==='cell-clear') {
        const piece=!multi.length && source.map.placements.find(p=>p.x===anchor.x && p.y===anchor.y);
        if (piece?.cityId) return stage([{op:'city-unbind',pieceId:piece.id},{op,points}]);
        return stage(points.every(p=>cellKind(cellTile(p.x,p.y))==='decor') ? {op:'cell-paint',points,tile:EMPTY_CELL} : {op,points});
      }
      if (op==='cell-copy') {
        if (points.some(p=>cellKind(cellTile(p.x,p.y))!=='decor')) throw new RangeError('只能複製裝飾格。');
        copiedCells=points.map(({x,y})=>({dx:x-anchor.x,dy:y-anchor.y,tile:cellTile(x,y)})); return `已複製 ${points.length} 格。`;
      }
      if (op==='cell-paste') {
        if (!copiedCells || points.length!==1) throw new RangeError('請先複製裝飾，再選一個貼上起點。');
        const groups=new Map();
        for (const {dx,dy,tile} of copiedCells) {if (!groups.has(tile)) groups.set(tile,[]); groups.get(tile).push({x:anchor.x+dx,y:anchor.y+dy});}
        return stage([...groups].map(([tile,points])=>({op:'cell-paint',tile,points})));
      }
      throw new RangeError('此操作不適用於單格地圖。');
    }
    if (op === 'cell-copy' || op === 'cell-paste') {
      if (op === 'cell-paste' && multi.length) throw new Error('請點選一個貼上目標格。');
      const cells = multi.length ? [...new Map(multiCells().map(([x, y]) => [`${x},${y}`, { x, y }])).values()]
        : pickedCell && pickedCell.selection === selected ? [pickedCell] : [];
      if (!source || !cells.length) throw new Error('請先點選地圖單元格。');
      const [anchor] = cells;
      const { minX, minY, width, height } = source.map.bounds;
      if (op === 'cell-copy') {
        copiedCells = cells.map(({x,y}) => {
          const tile = tiles[(y-minY)*width+x-minX];
          if (!Number.isInteger(tile) || !source.componentDefinitions[`tile-${tile}`]) throw new Error(`(${x}, ${y}) 沒有可複製的圖塊。`);
          return { dx:x-anchor.x, dy:y-anchor.y, tile };
        });
        return `已複製 ${cells.length} 格；點選一個目標格後貼上。`;
      }
      if (!copiedCells) throw new Error('請先用 Ctrl+C 複製圖塊。');
      if (cells.length !== 1) throw new Error('請點選一個貼上目標格。');
      if (!visible.decor || locked.decor) throw new Error('請顯示並解鎖裝飾層後再貼上。');
      const batch = copiedCells.map(({dx,dy,tile}) => {
        const x = anchor.x+dx, y = anchor.y+dy;
        if (x < minX || y < minY || x >= minX+width || y >= minY+height) throw new Error(`(${x}, ${y}) 超出地圖，整組未貼上。`);
        return { op:'decoration-place', instanceId:newId('decoration'), materialId:`tile-${tile}`, variantRef:'original', x, y, waterClass:null };
      });
      if (stage(batch) !== false) return `已貼上 ${batch.length} 格，尚未保存。`;
      return;
    }
    if (!source) return;
    if (op === 'city-bind' && fields.pieceId === null && selected?.center205) {
      const stamp = newCityStamp(selected.x + selected.center205[0], selected.y + selected.center205[1], 205);
      const { pieceId, x, y } = stamp;
      const result = stage([stamp, { op, pieceId, cityId: fields.cityId }]);
      if (result !== false) { selected = { layer: 'cities', id: pieceId, name: source.cities[fields.cityId]?.name || fields.cityId, x, y }; draw(); facts(); }
      return result;
    }
    if (op === 'city-stamp') {
      if (!selected || locked.cities || !visible.cities) throw new Error('請先在地圖上選取新據點中心位置');
      const tile = Number(fields.tile);
      if (!Number.isInteger(tile) || tile < 0xcb || tile > 0xd3) throw new Error('中心圖號須為 CB..D3');
      return stage(newCityStamp(selected.x, selected.y, tile));
    }
    if (op === 'map-object-remove') {
      if (!selected || !['cities', 'roads'].includes(selected.layer) || locked[selected.layer] || !visible[selected.layer]) throw new Error('請先選取未鎖定的道路或據點');
      return stage({ op, layer: selected.layer, id: selected.id });
    }
    if (op === 'decoration-remove' && selected?.layer === 'group' && !multi.length && selected.captureAllowed && !locked.decor && visible.decor) {
      const group = source.selectionGroups.find(row => row.id === selected.id);
      return stage({ op, memberIds: group.members.map(row => row.id) });
    }
    if (op === 'decoration-remove' && multi.length) {
      if (locked.decor || !visible.decor) throw new Error('請先選取未鎖定的裝飾片段');
      return stage({ op, memberIds: multiDecorIds() });
    }
    if (op.startsWith('decoration-') && op !== 'decoration-place') {
      if (selected?.layer !== 'decor' || locked.decor || !visible.decor) throw new Error('請先選取未鎖定的裝飾片段');
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
      if (cityGroups.has(fields.materialId)) {
        // C7-F: city-group placement routes through the all-or-nothing
        // precheck plus map-side materialization, staged as a single
        // city-group-place op. The stable cityId must be caller-issued
        // through the copy-model path (C6-1); the canvas never invents one,
        // so a bare preview call keeps the legacy refusal below.
        if (typeof fields.cityId !== 'string' || !fields.cityId) throw new Error('據點組目前僅供預覽，尚未開放放置。');
        if (!selected || locked.decor || !visible.decor) throw new Error('請先選取放置位置並解鎖裝飾層');
        const item = cityGroupCatalog.items.find(entry => `catalog:${entry.itemId}` === fields.materialId);
        const plan = planCityGroupPlacement(source, item, { x: selected.x, y: selected.y, cityType: fields.cityType });
        const materialized = materializeCityGroupPlacement(plan, { cityId: fields.cityId, newId });
        return stage({ op: 'city-group-place', materialized });
      }
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
  return Object.freeze({ setSource, command, pick, beginObjectMove, previewObjectMove, commitObjectMove, cancelObjectMove, toggleMulti, beginMultiMove, groupSelection, ungroupSelection,
    // CSS canvas coordinates only. Bounds feedback is not compiler approval:
    // stage retains all existing capability, collision and source validation.
    previewPlacement(materialId, sx, sy) {
      placement = null;
      const def = materialDefinition(materialId);
      const allowed = !recipePlans.has(materialId) || (recipePlans.get(materialId)?.canPlace && (!cellValues || cityGroups.has(materialId)));
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
      if (cellValues) {
        const {x,y,materialId}=pending;
        const stamps=cityGroups.get(materialId)?.tiles ?? [[0,0,Number(materialId.slice(5))]];
        const batch=stamps.flatMap(([dx,dy,tile])=>{
          const at={x:x+dx,y:y+dy};
          if (cellTile(at.x,at.y)===tile) return [];
          const kind=cellKind(tile);
          return [kind==='decor' ? {op:'cell-paint',tile,points:[at]} : {op:'cell-stamp',tile,...at,...(kind==='city' && {pieceId:newId('city-piece')})}];
        });
        return batch.length ? stage(batch.length===1?batch[0]:batch) : undefined;
      }
      if (recipePlans.has(pending.materialId)) {
        const plan = recipePlans.get(pending.materialId);
        if (!plan?.canPlace) return;
        return stage(plan.place(pending.x, pending.y, newId));
      }
      const def = source.componentDefinitions[pending.materialId];
      const { x, y } = pending;
      const place = { op: 'decoration-place', instanceId: newId('decoration'), materialId: def.id, variantRef: Object.keys(def.variants)[0], x, y, waterClass: def.authorWaterClass ?? null };
      if (def.footprint.length === 1) {
        const covers = stamp => componentCells(source, stamp).some(([cx, cy]) => cx === x && cy === y);
        if (source.map.placements.some(p => (p.x === x && p.y === y) || (p.componentRef && covers({ ...p, definitionRef: p.componentRef }))) || source.map.roads.some(r => r.geometry.some(p => p.x === x && p.y === y) || r.components?.some(covers)))
          throw new Error('此格有道路或據點，不能用單格素材替換。');
        const previous = source.map.decorations[picker.pick(x, y)];
        if (previous) {
          if (source.componentDefinitions[previous.definitionRef].footprint.length !== 1 || source.selectionGroups?.some(g => g.members.some(m => m.layer === 'decorations' && m.id === previous.id)))
            throw new Error('此格屬於多格物件或組合，請先拆散再替換。');
          if (previous.definitionRef === place.materialId && (previous.variantRef ?? 'original') === place.variantRef) return;
          return stage([{ op: 'decoration-remove', memberIds: [previous.id] }, place]);
        }
      }
      return stage(place);
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
    pan(dx, dy) { placement = null; objectMove = null; if (source) { view = panViewport(view, dx, dy, size, world()); draw(); } },
    zoom(factor, x = size.width / 2, y = size.height / 2) { placement = null; objectMove = null; if (source) { view = zoomAt(view, view.zoom * factor, [x, y], size, world()); draw(); facts(); } },
    fit() { placement = null; objectMove = null; if (source) { view = fitViewport(size, world()); draw(); facts(); } },
    locate(x, y) { placement = null; objectMove = null; if (source) { view = panViewport({ ...view, x: x * world().width - size.width / view.zoom / 2, y: y * world().height - size.height / view.zoom / 2 }, 0, 0, size, world()); draw(); } },
    layer(id, field, value) {
      if (!Object.hasOwn(visible, id) || !['visible', 'locked'].includes(field) || typeof value !== 'boolean') throw new Error('圖層設定無效');
      (field === 'visible' ? visible : locked)[id] = value; selected = null; placement = null; objectMove = null; multi = [];
      if (source && field === 'visible') tiles = composeMapDisplayLayers(source, visible).tiles;
      draw(); facts();
    },
  });
}
