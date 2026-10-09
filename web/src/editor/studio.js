// Fixed-domain author workspace; no Scenario, rule ticks, persistence or RNG.
import { composeMapLayers } from "../content/authoring/maplayers.js";
import { renderMinimapPixels } from "../content/authoring/minimap.js";
import { buildRoad } from "../content/authoring/roadedit.js";
import { componentCells, createDecorationPicker, decorationIdsInRect, captureComponent, placeComponent, fillBase, createWaterGroup, splitWaterGroup, mergeWaterGroups, splitDecoration, translateDecorations, reorderDecorations, materialReferences, renameMaterial, removeMaterial } from "./componenttools.js";
import { clampViewport, screenToWorld, zoomAt, fitViewport, panViewport, edgePanDelta } from "./viewport.js";
import { mountEditorNavigation } from "./navigation.js";
const gameId = new URLSearchParams(location.search).get("game") || null;
const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), groupList = $("group-list"), toolMenu = $("tool-menu");
const ui = { layer: "decor", tool: "inspect", visible: { base: true, decor: true, roads: true, cities: true },
  locked: { base: true, decor: false, roads: true, cities: true }, cam: { x: 0, y: 0 }, draft: null,
  sel: -1, citySel: null, pendingMove: false, diagnostics: [], roadDraft: [], groupId: null, dirty: false, busy: false,
  selectedIds: new Set(), baseSelection: new Set(), hover: null, areaStart: null, zoom: 1, dragMaterial: false, navPoint: null };
const names = { base: "基本地圖", decor: "裝飾", roads: "道路", cities: "據點" };
const status = (text) => { $("status").textContent = text; };
async function call(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "工作台請求失敗");
  return data;
}
let atlas, composed, fullTerrain, instanceById, decorationPicker, panFrom = null, visiblePlane, visibleKey, edgeFrame = null, edgeTime = null;
const viewState = () => ({ ...ui.cam, zoom: ui.zoom });
const screenSize = () => ({ width: cv.width, height: cv.height });
const worldSize = () => ({ width: ui.draft.map.bounds.width * 16, height: ui.draft.map.bounds.height * 16 });
function setView(next) { ui.cam.x = next.x; ui.cam.y = next.y; ui.zoom = next.zoom; $("zoom-value").textContent = `${Math.round(ui.zoom * 1000) / 10}%`; }
function canvasPoint(e) {
  const r = cv.getBoundingClientRect(), sx = r.width / cv.offsetWidth, sy = r.height / cv.offsetHeight;
  return [(e.clientX - r.left - cv.clientLeft * sx) * cv.width / (cv.clientWidth * sx),
    (e.clientY - r.top - cv.clientTop * sy) * cv.height / (cv.clientHeight * sy)];
}
function stopEdge() { if (edgeFrame !== null) cancelAnimationFrame(edgeFrame); edgeFrame = null; edgeTime = null; ui.navPoint = null; }
function edgeActive() { return ui.navPoint && toolMenu.hidden && !document.hidden && (ui.dragMaterial || ui.areaStart || ui.pendingMove); }
function edgeTick(time) {
  edgeFrame = null;
  if (!edgeActive()) { stopEdge(); return; }
  const delta = edgePanDelta(ui.navPoint, screenSize(), edgeTime === null ? 16 : time - edgeTime); edgeTime = time;
  const old = viewState(), next = panViewport(old, delta[0], delta[1], screenSize(), worldSize());
  if (old.x === next.x && old.y === next.y) { edgeTime = null; return; }
  setView(next);
  if (ui.tool === "material" || ui.pendingMove) { const p = screenToWorld(next, ...ui.navPoint); ui.hover = p.map((v) => Math.floor(v / 16)); }
  draw(); edgeFrame = requestAnimationFrame(edgeTick);
}
function trackEdge(e) { ui.navPoint = canvasPoint(e); if (edgeActive() && edgeFrame === null) edgeFrame = requestAnimationFrame(edgeTick); }
function stopNavigation() { panFrom = null; ui.areaStart = null; ui.dragMaterial = false; ui.hover = null; stopEdge(); }
function changeZoom(zoom, point = [cv.width / 2, cv.height / 2]) {
  if (!ui.draft || !atlas) return;
  if (panFrom || ui.areaStart) { status("請先結束目前拖曳再縮放"); return; }
  setView(zoomAt(viewState(), zoom, point, screenSize(), worldSize())); ui.hover = null; stopEdge(); draw();
}
const deletedRoads = [];
function groups() { return ui.draft?.map.waterGroups ?? []; }
function selectedGroup() { return groups().find((g) => g.id === ui.groupId); }
function groupCells(group) {
  if (!group) return [];
  const cells = (group.baseCells ?? []).map((at) => [at % 384, Math.floor(at / 384)]);
  for (const id of group.memberIds) {
    const d = instanceById.get(id), def = ui.draft.componentDefinitions[d?.definitionRef];
    if (!d || !def) continue;
    for (const [dx, dy] of def.footprint) cells.push([d.x + dx - def.anchor[0], d.y + dy - def.anchor[1]]);
  }
  return cells;
}
function groupControls() {
  const peers = new Set([...$("group-merge-list").selectedOptions].map((o) => o.value));
  $("group-merge-list").replaceChildren();
  groupList.replaceChildren();
  for (const g of groups()) {
    const option = document.createElement("option"); option.value = g.id;
    option.textContent = (g.showOnMinimap ? "● " : "○ ") + (g.name ?? g.id); groupList.append(option);
    if (g.id !== ui.groupId) { const peer = option.cloneNode(true); peer.selected = peers.has(g.id); $("group-merge-list").append(peer); }
  }
  groupList.value = ui.groupId ?? "";
  const group = selectedGroup();
  $("show-minimap").disabled = !group; $("show-minimap").checked = group?.showOnMinimap ?? false;
  $("group-info").textContent = group ? group.id + "：" + group.memberIds.length + "個組件／" + group.baseCells.length + "個基礎水格" : "點選水域或列表選取實際組合";
}
function rebuild() {
  composed = composeMapLayers(ui.draft, { draft: true }); fullTerrain = composed.terrain; visiblePlane = null; visibleKey = null;
  decorationPicker = createDecorationPicker(ui.draft);
  instanceById = new Map([...ui.draft.map.decorations, ...ui.draft.map.roads.flatMap((r) => r.components ?? [])].map((d) => [d.id, d]));
  const roadMask = new Uint8Array(384 * 256);
  for (const road of ui.draft.map.roads) for (const p of road.geometry) if (p.x >= 0 && p.x < 384 && p.y >= 0 && p.y < 256) roadMask[p.y * 384 + p.x] = 1;
  const { pixels } = renderMinimapPixels(composed.minimapGeography, roadMask, 384, 256, 250, 167, 1);
  const mini = $("mini").getContext("2d"), image = mini.createImageData(250, 167);
  for (let i = 0; i < pixels.length / 3; i++) { image.data.set(pixels.subarray(i * 3, i * 3 + 3), i * 4); image.data[i * 4 + 3] = 255; }
  mini.putImageData(image, 0, 0);
  groupControls();
  materialControls();
  $("selection").textContent = `已選完整裝飾 ${ui.selectedIds.size} 個／基礎格 ${ui.baseSelection.size} 個；Shift加選，框選不拆多格實例`;
}
function draw() {
  const key = Object.values(ui.visible).join(",");
  if (key !== visibleKey) {
    if (Object.values(ui.visible).every(Boolean)) visiblePlane = fullTerrain;
    else {
      const source = { ...ui.draft, map: { ...ui.draft.map, waterGroups: [],
        base: { ...ui.draft.map.base, terrainRef: ui.visible.base ? ui.draft.map.base.terrainRef : Array(384 * 256).fill(null) },
        decorations: ui.visible.decor ? ui.draft.map.decorations : [], roads: ui.visible.roads ? ui.draft.map.roads : [],
        placements: ui.visible.cities ? ui.draft.map.placements : [] } };
      visiblePlane = composeMapLayers(source, { draft: true }).terrain;
    }
    visibleKey = key;
  }
  const orderDisabled = ui.layer !== "decor" || ui.locked.decor || ui.selectedIds.size === 0;
  $("move-up").disabled = orderDisabled; $("move-down").disabled = orderDisabled;
  const plane = visiblePlane, viewW = cv.width / ui.zoom, viewH = cv.height / ui.zoom;
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.imageSmoothingEnabled = false;
  ctx.save(); ctx.scale(ui.zoom, ui.zoom); ctx.lineWidth = 1 / ui.zoom;
  for (let y = Math.max(0, Math.floor(ui.cam.y / 16)); y < Math.min(256, Math.ceil((ui.cam.y + viewH) / 16)); y++)
    for (let x = Math.max(0, Math.floor(ui.cam.x / 16)); x < Math.min(384, Math.ceil((ui.cam.x + viewW) / 16)); x++) {
      const tile = plane[y * 384 + x], sx = x * 16 - ui.cam.x, sy = y * 16 - ui.cam.y;
      if (tile == null || !ui.visible.base && !ui.visible.decor && !ui.visible.roads && !ui.visible.cities) {
        ctx.fillStyle = (x + y) % 2 ? "#bbb" : "#ddd"; ctx.fillRect(sx, sy, 16, 16);
      } else ctx.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, sx, sy, 16, 16);
    }
  ctx.strokeStyle = "#4a7828";
  for (const [x, y] of groupCells(selectedGroup())) if (x * 16 >= ui.cam.x - 16 && x * 16 < ui.cam.x + viewW && y * 16 >= ui.cam.y - 16 && y * 16 < ui.cam.y + viewH)
    ctx.strokeRect(x * 16 - ui.cam.x, y * 16 - ui.cam.y, 16, 16);
  ctx.strokeStyle = "#007a9a";
  for (const id of ui.selectedIds) { const d = instanceById.get(id); if (d) for (const [x, y] of componentCells(ui.draft, d)) ctx.strokeRect(x * 16 - ui.cam.x + 1, y * 16 - ui.cam.y + 1, 14, 14); }
  for (const cell of ui.baseSelection) ctx.strokeRect((cell % 384) * 16 - ui.cam.x + 1, Math.floor(cell / 384) * 16 - ui.cam.y + 1, 14, 14);
  if (ui.hover && (ui.tool === "material" || ui.pendingMove)) {
    const moving = ui.pendingMove ? ui.draft.map.decorations[ui.sel] : null;
    const def = ui.draft.componentDefinitions[moving?.definitionRef ?? $("material-select").value];
    if (def) {
      const [x, y] = ui.hover, tiles = def.variants.original.tiles;
      const valid = tiles.every(([dx, dy]) => x + dx - def.anchor[0] >= 0 && x + dx - def.anchor[0] < 384 && y + dy - def.anchor[1] >= 0 && y + dy - def.anchor[1] < 256);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = valid ? "#4a7828" : "#d00000";
      for (const [dx, dy, tile] of tiles) { const sx = (x + dx - def.anchor[0]) * 16 - ui.cam.x, sy = (y + dy - def.anchor[1]) * 16 - ui.cam.y;
        ctx.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, sx, sy, 16, 16); ctx.strokeRect(sx, sy, 16, 16); }
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = "#f00";
  for (const road of ui.draft.map.roads) if (ui.diagnostics.some((d) => d.roadId === road.id)) for (const p of [road.geometry[0], road.geometry.at(-1)])
    if (p) ctx.strokeRect(p.x * 16 - ui.cam.x, p.y * 16 - ui.cam.y, 16, 16);
  ctx.strokeStyle = "#0a0"; ctx.beginPath();
  ui.roadDraft.forEach((p, i) => { const x = p.x * 16 + 8 - ui.cam.x, y = p.y * 16 + 8 - ui.cam.y; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.restore();
  $("layers").replaceChildren();
  for (const [layer, label] of Object.entries(names)) {
    const b = document.createElement("button"); b.textContent = (ui.layer === layer ? "● " : "") + label + (ui.visible[layer] ? "" : "（隱藏）") + (ui.locked[layer] ? "🔒" : "");
    b.onclick = () => { ui.layer = layer; draw(); }; b.ondblclick = () => { ui.visible[layer] = !ui.visible[layer]; draw(); }; $("layers").append(b);
  }
}
let materialRows = [], materialPage = 0;
const materialPageSize = 24; // DOM/display budget, not an engine capacity or content limit.
function materialControls() {
  const select = $("material-select"), value = select.value, search = $("material-search").value.trim().toLowerCase();
  const origin = $("material-origin").value, shape = $("material-shape").value;
  select.replaceChildren(); materialRows = [];
  for (const [id, def] of Object.entries(ui.draft.componentDefinitions)) {
    const label = def.name ?? (id === "deco-grass" ? "草地原子" : "原圖塊 " + id.replace("tile-", ""));
    const author = def.category === "author-multicell" && def.revision === "author-byte-stamp-1";
    if (!(label + id).toLowerCase().includes(search) || origin === "author" && !author ||
        shape === "single" && def.footprint.length !== 1 || shape === "multi" && def.footprint.length <= 1) continue;
    materialRows.push({ id, label, def });
    const option = document.createElement("option"); option.value = id; option.textContent = label + `（${def.footprint.length}格）`; select.append(option);
  }
  if (materialRows.some(row => row.id === value)) select.value = value;
  materialPage = Math.floor(Math.max(0, materialRows.findIndex(row => row.id === select.value)) / materialPageSize);
  materialPreview();
}
function paintMaterial(canvas, def) {
  const c = canvas.getContext("2d"); c.clearRect(0, 0, canvas.width, canvas.height);
  if (!def || !atlas) return;
  const tiles = def.variants.original.tiles, xs = tiles.map(p => p[0]), ys = tiles.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
  const scale = Math.min(32, canvas.width / w, canvas.height / h); c.imageSmoothingEnabled = false;
  for (const [x, y, tile] of tiles) c.drawImage(atlas, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, (x - x0) * scale, (y - y0) * scale, scale, scale);
}
function materialGallery() {
  const gallery = $("material-gallery"), selected = $("material-select").value;
  gallery.replaceChildren();
  for (const row of materialRows.slice(materialPage * materialPageSize, (materialPage + 1) * materialPageSize)) {
    const button = document.createElement("button"), canvas = document.createElement("canvas"), label = document.createElement("span");
    button.type = "button"; button.dataset.materialId = row.id; button.title = row.label + "／" + row.id;
    button.setAttribute("aria-label", row.label + `（${row.def.footprint.length}格）`); button.setAttribute("aria-pressed", String(row.id === selected));
    canvas.width = 52; canvas.height = 40; canvas.setAttribute("aria-hidden", "true"); paintMaterial(canvas, row.def);
    label.textContent = row.label; button.append(canvas, label);
    button.onclick = () => {
      $("material-select").value = row.id; $("material-select").onchange();
      [...gallery.querySelectorAll("button")].find(b => b.dataset.materialId === row.id)?.focus({ preventScroll: true });
    };
    gallery.append(button);
  }
  const active = [...gallery.querySelectorAll("button")].find(b => b.dataset.materialId === selected);
  gallery.scrollTop = active ? Math.max(0, active.offsetTop + active.offsetHeight - gallery.clientHeight) : 0;
  $("material-page-info").textContent = materialRows.length ? `共${materialRows.length}項；第${materialPage + 1}／${Math.ceil(materialRows.length / materialPageSize)}頁` : "沒有符合的素材；請調整搜尋或篩選";
  $("material-prev").disabled = materialPage === 0;
  $("material-next").disabled = (materialPage + 1) * materialPageSize >= materialRows.length;
}
function materialPreview() {
  const def = ui.draft?.componentDefinitions[$("material-select").value], canvas = $("material-preview"), c = canvas.getContext("2d");
  c.clearRect(0, 0, canvas.width, canvas.height); canvas.draggable = Boolean(def && atlas);
  $("material-info").textContent = "沒有選取素材"; materialGallery();
  const refs = def ? materialReferences(ui.draft, def.id) : [], author = def?.category === "author-multicell" && def.revision === "author-byte-stamp-1";
  $("rename-material").disabled = !author; $("remove-material").disabled = !author || refs.length > 0;
  let referenceLabel = "沒有選取素材；請調整搜尋或篩選。";
  if (def) referenceLabel = "無地圖引用；只可移除作者素材定義，不清理共享圖集／舊快照。";
  if (refs.length) { referenceLabel = `引用${refs.length}處：` + refs.slice(0, 20).join("、"); if (refs.length > 20) referenceLabel += "…"; }
  $("material-references").textContent = referenceLabel;
  if (!def || !atlas) return;
  const tiles = def.variants.original.tiles, xs = tiles.map((p) => p[0]), ys = tiles.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  paintMaterial(canvas, def);
  $("material-info").textContent = `${def.name ?? def.id}：${w}×${h}占用框／${tiles.length}格；固定原圖塊配方`;
}
function authorOperation(action) {
  try { ui.draft = action(); changed(); status("已更新本地預覽；尚未保存"); return true; }
  catch (error) { status("編輯被拒絕：" + error.message); return false; }
}
function placeAt(x, y) {
  if (ui.layer !== "decor" || ui.locked.decor) { status("請選擇並解鎖裝飾層"); return; }
  const id = "studio-deco-" + crypto.randomUUID();
  authorOperation(() => placeComponent(ui.draft, $("material-select").value, x, y, id, $("material-water").value));
}
$("split-instances").onclick = () => {
  if (ui.layer !== "decor" || ui.locked.decor) { status("請選擇並解鎖裝飾層"); return; }
  stopNavigation(); ui.pendingMove = false;
  const selected = [...ui.selectedIds], children = [];
  if (authorOperation(() => {
    if (!selected.length) throw new RangeError("請先選取多格裝飾實例");
    let next = ui.draft;
    for (const id of selected) {
      const d = next.map.decorations.find((entry) => entry.id === id);
      const ids = componentCells(next, d).map(() => "studio-deco-" + crypto.randomUUID());
      next = splitDecoration(next, id, ids); children.push(...ids);
    }
    return next;
  })) { ui.selectedIds = new Set(children); ui.sel = ui.draft.map.decorations.findIndex((d) => d.id === children[0]); rebuild(); draw(); }
};
$("translate-selection").onclick = () => {
  if (ui.layer !== "decor" || ui.locked.decor) { status("請選擇並解鎖裝飾層"); return; }
  stopNavigation(); ui.pendingMove = false;
  authorOperation(() => translateDecorations(ui.draft, [...ui.selectedIds], Number($("translate-x").value), Number($("translate-y").value)));
};
$("rename-material").onclick = () => authorOperation(() => renameMaterial(ui.draft, $("material-select").value, $("material-name").value));
$("remove-material").onclick = () => {
  const id = $("material-select").value;
  if (!confirm("移除無引用的作者素材？不刪地圖實例、共享圖集或已編譯快照。")) return;
  authorOperation(() => removeMaterial(ui.draft, id));
};
$("material-search").oninput = materialControls;
$("material-origin").onchange = materialControls; $("material-shape").onchange = materialControls;
$("material-prev").onclick = () => { if (materialPage > 0) { materialPage--; materialGallery(); } };
$("material-next").onclick = () => { if ((materialPage + 1) * materialPageSize < materialRows.length) { materialPage++; materialGallery(); } };
$("material-select").onchange = () => {
  materialPage = Math.floor(Math.max(0, materialRows.findIndex(row => row.id === $("material-select").value)) / materialPageSize);
  materialPreview(); $("material-water").value = ui.draft.componentDefinitions[$("material-select").value]?.authorWaterClass ?? "";
};
$("capture-material").onclick = () => {
  const id = "material-" + crypto.randomUUID();
  authorOperation(() => captureComponent(ui.draft, [...ui.selectedIds], id, $("material-name").value));
  if (ui.draft.componentDefinitions[id]) { $("material-search").value = ""; materialControls(); $("material-select").value = id; materialPreview(); $("material-water").value = ui.draft.componentDefinitions[id].authorWaterClass ?? ""; }
};
$("material-preview").ondragstart = (e) => { if (!ui.draft || !atlas || !Object.hasOwn(ui.draft.componentDefinitions, $("material-select").value)) { e.preventDefault(); return; } e.dataTransfer.setData("application/x-wolong-component", $("material-select").value); ui.tool = "material"; ui.dragMaterial = true; };
$("material-preview").ondragend = () => { ui.dragMaterial = false; ui.hover = null; stopEdge(); if (ui.draft && atlas) draw(); };
cv.ondragover = (e) => { if (!ui.draft || !atlas || !e.dataTransfer.types.includes("application/x-wolong-component")) return; e.preventDefault(); ui.dragMaterial = true; ui.hover = cellAt(e); trackEdge(e); draw(); };
cv.ondragleave = () => { ui.hover = null; stopEdge(); if (ui.draft && atlas) draw(); };
cv.ondrop = (e) => { e.preventDefault(); if (!ui.draft || !atlas) return; const id = e.dataTransfer.getData("application/x-wolong-component"), [x, y] = cellAt(e); ui.dragMaterial = false; stopEdge(); ui.hover = null; if (!Object.hasOwn(ui.draft.componentDefinitions, id)) return; $("material-select").value = id; placeAt(x, y); };
$("clear-selection").onclick = () => { ui.selectedIds.clear(); ui.baseSelection.clear(); $("selection").textContent = "已清除選取"; draw(); };
$("fill-base").onclick = () => {
  if (ui.locked.base) { status("請先解鎖基本地圖層；補底未提交"); return; }
  const cells = new Set(ui.baseSelection);
  for (const id of ui.selectedIds) { const d = instanceById.get(id); if (d) for (const [x, y] of componentCells(ui.draft, d)) cells.add(y * 384 + x); }
  if (!cells.size) { status("請先選取需要補底的格／完整組件"); return; }
  if (!confirm(`明確補繪${cells.size}格底層？此操作不是還原原本未知地形，上層組件與其它格不變。`)) return;
  authorOperation(() => fillBase(ui.draft, [...cells], Number($("base-tile").value), Number($("base-geography").value)));
};
$("create-group").onclick = () => {
  const id = "water-" + crypto.randomUUID();
  authorOperation(() => createWaterGroup(ui.draft, [...ui.selectedIds], [...ui.baseSelection], id, $("group-name").value, $("new-group-visible").checked));
  if (groups().some((g) => g.id === id)) { ui.groupId = id; groupControls(); draw(); }
};
$("split-group").onclick = () => {
  const id = "water-" + crypto.randomUUID();
  authorOperation(() => splitWaterGroup(ui.draft, ui.groupId, [...ui.selectedIds], [...ui.baseSelection], id, $("group-name").value));
  if (groups().some((g) => g.id === id)) { ui.groupId = id; groupControls(); draw(); }
};
$("merge-groups").onclick = () => {
  const peers = [...$("group-merge-list").selectedOptions].map((o) => o.value), id = "water-" + crypto.randomUUID();
  authorOperation(() => mergeWaterGroups(ui.draft, [ui.groupId, ...peers], id, $("group-name").value, $("new-group-visible").checked));
  if (groups().some((g) => g.id === id)) { ui.groupId = id; groupControls(); draw(); }
};
function changed() { ui.dirty = true; rebuild(); draw(); }
function removeMembers(ids) {
  ui.draft.map.waterGroups = groups().map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !ids.has(id)) })).filter((g) => g.memberIds.length || g.baseCells.length);
}
groupList.onchange = () => { ui.groupId = groupList.value; groupControls(); draw(); };
$("show-minimap").onchange = () => { const g = selectedGroup(); if (g) { g.showOnMinimap = $("show-minimap").checked; changed(); status("組合預覽已更新；尚未保存"); } };
$("locate-group").onclick = () => { const cell = groupCells(selectedGroup())[0]; if (cell) { stopNavigation(); setView(clampViewport({ x: cell[0] * 16 + 8 - cv.width / ui.zoom / 2, y: cell[1] * 16 + 8 - cv.height / ui.zoom / 2, zoom: ui.zoom }, screenSize(), worldSize())); draw(); } };
$("zoom-in").onclick = () => changeZoom(ui.zoom * 2);
$("zoom-out").onclick = () => changeZoom(ui.zoom / 2);
$("zoom-reset").onclick = () => changeZoom(1);
$("zoom-fit").onclick = () => { if (!ui.draft || !atlas) return; stopNavigation(); setView(fitViewport(screenSize(), worldSize())); draw(); };
cv.addEventListener("wheel", (e) => { if (!ui.draft || !atlas) return; e.preventDefault(); changeZoom(ui.zoom * 2 ** (-Math.sign(e.deltaY) / 4), canvasPoint(e)); }, { passive: false });
$("lock").onclick = () => { ui.locked[ui.layer] = !ui.locked[ui.layer]; draw(); };
function closeToolMenu() { toolMenu.hidden = true; cv.setAttribute("aria-expanded", "false"); }
function closeMenuToCanvas() { closeToolMenu(); cv.focus({ preventScroll: true }); }
cv.addEventListener("contextmenu", (e) => {
  if (!ui.draft || !composed || !atlas) return;
  e.preventDefault(); stopNavigation(); draw(); toolMenu.replaceChildren();
  for (const original of document.querySelectorAll("#tools button")) {
    const button = original.cloneNode(true); button.type = "button";
    button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(original.dataset.tool === ui.tool));
    button.onclick = () => { closeMenuToCanvas(); original.click(); draw(); };
    toolMenu.append(button);
  }
  const note = document.createElement("p"); note.className = "notice"; note.textContent = "只切換工具；放置／刪除需另行左鍵。"; toolMenu.append(note);
  toolMenu.hidden = false; toolMenu.style.left = "0px"; toolMenu.style.top = "0px";
  const rect = toolMenu.getBoundingClientRect();
  toolMenu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - rect.width - 4)) + "px";
  toolMenu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - rect.height - 4)) + "px";
  cv.setAttribute("aria-expanded", "true"); toolMenu.querySelector('[aria-checked="true"]')?.focus();
});
toolMenu.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenuToCanvas(); return; }
  const buttons = [...toolMenu.querySelectorAll("button:not(:disabled)")], index = buttons.indexOf(document.activeElement);
  if (!buttons.length || !["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  let next;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = buttons.length - 1;
  else next = (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});
toolMenu.addEventListener("focusout", (e) => { if (!toolMenu.contains(e.relatedTarget)) closeToolMenu(); });
document.addEventListener("pointerdown", (e) => {
  if (toolMenu.hidden || toolMenu.contains(e.target)) return;
  closeToolMenu();
  if (e.target === cv) { e.preventDefault(); e.stopPropagation(); }
}, true);
window.addEventListener("resize", () => closeToolMenu());
window.addEventListener("blur", () => closeToolMenu());
document.addEventListener("visibilitychange", () => { if (document.hidden) closeToolMenu(); });
for (const b of document.querySelectorAll("#tools button")) b.onclick = () => { closeToolMenu(); stopNavigation(); ui.tool = b.dataset.tool; ui.pendingMove = false; ui.roadDraft = []; $("roadbar").style.display = "none"; };
function cellAt(e) { return screenToWorld(viewState(), ...canvasPoint(e)).map((v) => Math.floor(v / 16)); }
function selectCell(x, y, append) {
  if (!append) { ui.selectedIds.clear(); ui.baseSelection.clear(); }
  if (ui.layer === "base") { const cell = y * 384 + x; if (append && ui.baseSelection.has(cell)) ui.baseSelection.delete(cell); else ui.baseSelection.add(cell); }
  else if (ui.layer === "decor") { ui.sel = decorationPicker.pick(x, y); const d = ui.draft.map.decorations[ui.sel];
    if (d) { if (append && ui.selectedIds.has(d.id)) ui.selectedIds.delete(d.id); else ui.selectedIds.add(d.id); }
    const group = groups().find((g) => g.memberIds.includes(d?.id) || g.baseCells.includes(y * 384 + x)); ui.groupId = group?.id ?? null;
  }
  groupControls(); $("selection").textContent = `已選完整裝飾 ${ui.selectedIds.size} 個／基礎格 ${ui.baseSelection.size} 個；格(${x},${y})：${fullTerrain[y * 384 + x] ?? "未知底層"}`; draw();
}
cv.onpointerdown = (e) => {
  if (e.button !== 0 || !toolMenu.hidden) return;
  if (!ui.draft || !composed || !atlas) return;
  const [x, y] = cellAt(e);
  if (ui.tool === "pan") { panFrom = [...canvasPoint(e), ui.cam.x, ui.cam.y]; cv.setPointerCapture(e.pointerId); return; }
  if (x < 0 || x >= 384 || y < 0 || y >= 256) return;
  if (ui.tool === "inspect") { selectCell(x, y, e.shiftKey); return; }
  if (ui.tool === "select-area") { ui.areaStart = [x, y, e.shiftKey]; cv.setPointerCapture(e.pointerId); return; }
  if (ui.locked[ui.layer]) { status(names[ui.layer] + "圖層已鎖定"); return; }
  if (ui.tool === "material") { placeAt(x, y); return; }
  if (ui.tool === "grass" && ui.layer === "decor") {
    ui.draft.map.decorations.push({ id: "studio-deco-" + crypto.randomUUID(), definitionRef: "deco-grass", x, y }); changed(); return;
  }
  if (ui.tool === "move" && ui.layer === "decor") {
    if (!ui.pendingMove) { ui.sel = decorationPicker.pick(x, y); ui.pendingMove = ui.sel >= 0; status("請點選移動目標"); return; }
    ui.pendingMove = false;
    const d = { ...ui.draft.map.decorations[ui.sel], x, y };
    if (componentCells(ui.draft, d).some(([cx, cy]) => cx < 0 || cx >= 384 || cy < 0 || cy >= 256)) { status("整個多格組件超界；未移動"); return; }
    ui.draft.map.decorations[ui.sel] = d; changed(); return;
  }
  if (ui.tool === "del" && ui.layer === "decor") {
    const i = decorationPicker.pick(x, y); if (i < 0) return;
    const [d] = ui.draft.map.decorations.splice(i, 1); removeMembers(new Set([d.id])); ui.selectedIds.delete(d.id); changed(); status("已刪除；未知底層將阻斷編譯，須明確補齊"); return;
  }
  if (ui.tool === "del" && ui.layer === "roads") {
    const road = ui.draft.map.roads.find((r) => r.geometry.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1)); if (!road) return;
    deletedRoads.push({ road, groups: structuredClone(groups()), terrain: fullTerrain.slice() });
    ui.draft.map.roads = ui.draft.map.roads.filter((r) => r !== road); removeMembers(new Set((road.components ?? []).map((d) => d.id)));
    changed(); status("已刪除道路；原底層仍未知，重建可明確沿用原圖塊"); return;
  }
  if (ui.tool === "road" && ui.layer === "roads") {
    const last = ui.roadDraft.at(-1);
    if (last?.x === x && last.y === y) { $("roadbar").style.display = "inline"; return; }
    if (last && Math.max(Math.abs(last.x - x), Math.abs(last.y - y)) !== 1) { status("道路格必須相鄰"); return; }
    ui.roadDraft.push({ x, y }); draw(); return;
  }
  status("此工具／圖層未接入；移城及任意拓撲仍不受支持");
};
window.addEventListener("pointermove", (e) => {
  if (panFrom) { const [x, y] = canvasPoint(e); setView(panViewport({ x: panFrom[2], y: panFrom[3], zoom: ui.zoom }, panFrom[0] - x, panFrom[1] - y, screenSize(), worldSize())); draw(); }
  if (ui.areaStart) trackEdge(e);
});
cv.onpointermove = (e) => { if (toolMenu.hidden && ui.draft && atlas && (ui.tool === "material" || ui.pendingMove)) { ui.hover = cellAt(e); trackEdge(e); draw(); } };
cv.onpointerleave = () => { ui.hover = null; if (!ui.areaStart) stopEdge(); if (ui.draft && atlas) draw(); };
cv.onpointercancel = () => { stopNavigation(); ui.pendingMove = false; if (ui.draft && atlas) draw(); };
cv.onlostpointercapture = () => { panFrom = null; ui.areaStart = null; stopEdge(); };
window.addEventListener("blur", stopNavigation);
document.addEventListener("visibilitychange", () => { if (document.hidden) stopNavigation(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") { stopNavigation(); ui.pendingMove = false; ui.roadDraft = []; $("roadbar").style.display = "none"; if (ui.draft && atlas) draw(); } });
window.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  panFrom = null; stopEdge();
  if (!ui.areaStart) return;
  const [x0, y0, append] = ui.areaStart, [x1, y1] = cellAt(e); ui.areaStart = null;
  const left = Math.max(0, Math.min(x0, x1)), right = Math.min(383, Math.max(x0, x1)), top = Math.max(0, Math.min(y0, y1)), bottom = Math.min(255, Math.max(y0, y1));
  if (!append) { ui.selectedIds.clear(); ui.baseSelection.clear(); }
  if (ui.layer === "decor") for (const id of decorationIdsInRect(ui.draft, left, right, top, bottom)) ui.selectedIds.add(id);
  if (ui.layer === "base") for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) ui.baseSelection.add(y * 384 + x);
  $("selection").textContent = `已選完整裝飾 ${ui.selectedIds.size} 個／基礎格 ${ui.baseSelection.size} 個`; draw();
});
$("roadcancel").onclick = () => { ui.roadDraft = []; $("roadbar").style.display = "none"; draw(); };
for (const b of document.querySelectorAll("#roadbar [data-kind]")) b.onclick = () => {
  try {
    const geometry = ui.roadDraft, old = deletedRoads.find((d) => JSON.stringify(d.road.geometry) === JSON.stringify(geometry));
    if (old && !confirm("沿用所刪道路的原圖塊組件重建？此操作不猜補未知底層。")) return;
    const near = (p) => ui.draft.map.placements.find((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= 2);
    const from = near(geometry[0]), to = near(geometry.at(-1)); if (!from || !to) throw new Error("道路兩端須鄰近據點");
    const road = buildRoad({ fromCityId: from.cityId, toCityId: to.cityId, geometry: geometry.map((p) => ({ ...p })), travelKind: b.dataset.kind,
      cities: new Map(ui.draft.map.placements.map((p) => [p.cityId, p])), roads: ui.draft.map.roads,
      tiles: (x, y) => fullTerrain[y * 384 + x] ?? old?.terrain[y * 384 + x] });
    road.id = "road-" + crypto.randomUUID() + "-new";
    if (old) {
      road.components = structuredClone(old.road.components ?? []);
      const ids = new Set(road.components.map((d) => d.id));
      for (const original of old.groups) {
        const members = original.memberIds.filter((id) => ids.has(id)); if (!members.length) continue;
        const current = groups().find((g) => g.id === original.id);
        if (current) current.memberIds.push(...members); else groups().push({ ...original, memberIds: members });
      }
      deletedRoads.splice(deletedRoads.indexOf(old), 1);
    }
    ui.draft.map.roads.push(road); ui.roadDraft = []; $("roadbar").style.display = "none"; changed(); status("已建造 " + road.id);
  } catch (error) { status("建造被拒絕：" + error.message); }
};
window.moveSelected = (direction) => {
  if (!ui.draft || ui.layer !== "decor" || ui.locked.decor) { status("請選擇並解鎖裝飾層；調序未提交"); return false; }
  try {
    const selected = [...ui.selectedIds], focus = ui.draft.map.decorations[ui.sel]?.id;
    const next = reorderDecorations(ui.draft, selected, direction);
    if (next === ui.draft) { status("所選裝飾已達本層順序邊界；未修改"); return false; }
    stopNavigation(); ui.pendingMove = false; ui.draft = next;
    ui.sel = next.map.decorations.findIndex((d) => d.id === (ui.selectedIds.has(focus) ? focus : selected[0]));
    changed(); status("已調整所選裝飾順序；相對順序保留，尚未保存"); return true;
  } catch (error) { status("調序被拒絕：" + error.message); return false; }
};
$("move-up").onclick = () => window.moveSelected(1);
$("move-down").onclick = () => window.moveSelected(-1);
$("reload-draft").onclick = () => {
  if (ui.busy || !composed || !atlas) return;
  // A new document, guarded by the existing native beforeunload; never replace a live draft in-place.
  location.reload();
};
for (const action of ["save", "validate", "compile"]) $(action).onclick = async () => {
  if (ui.busy) return; ui.busy = true;
  const buttons = ["save", "validate", "compile", "reload-draft"].map($); buttons.forEach((b) => { b.disabled = true; });
  try {
    const map = action === "save" ? structuredClone(ui.draft.map) : undefined;
    const request = { gameId };
    const definitions = action === "save" ? structuredClone(ui.draft.componentDefinitions) : undefined;
    if (map) { request.map = map; request.componentDefinitions = definitions; request.expectedRevision = ui.draft.localModel.draftRevision; }
    const data = await call("/api/" + action, request);
    if (action === "save") { ui.draft.localModel.draftRevision = data.draftRevision; ui.dirty = JSON.stringify(ui.draft.map) !== JSON.stringify(map) || JSON.stringify(ui.draft.componentDefinitions) !== JSON.stringify(definitions); }
    ui.diagnostics = data.diagnostics ?? []; $("report").textContent = JSON.stringify(data).slice(0, 1200);
    const labels = { save: "已保存修訂 ", validate: data.valid ? "校驗通過" : "校驗未通過", compile: "已編譯修訂 " };
    const revision = action === "validate" ? "" : data.draftRevision ?? data.identity?.draftRevision ?? "";
    status(labels[action] + revision + (action !== "save" && ui.dirty ? "（未保存修改未包含）" : ""));
    if (action === "compile") {
      $("compiled-minis").replaceChildren();
      for (const a of data.minimapAssets) { const image = document.createElement("img"); image.src = a.url; image.alt = "已保存修訂小地圖"; $("compiled-minis").append(image); }
    }
    draw();
  } catch (error) { status("操作被拒絕：" + error.message); }
  finally { ui.busy = false; buttons.forEach((b) => { b.disabled = false; }); }
};
$("trial-app").onclick = async () => {
  if (ui.busy || !$("trial-chapter").value) return;
  if (ui.dirty && !confirm("未保存修改不包含在試運行中；繼續測試已保存修訂？")) return;
  const child = window.open("/trial-wait", "_blank");
  if (!child) { status("視窗被阻擋；請再次點擊「測試運行」開啟，不會取代工作台。"); return; }
  child.opener = null;
  ui.busy = true; $("trial-app").disabled = true; $("reload-draft").disabled = true;
  try {
    const chapter = $("trial-chapter").value;
    const manifest = await call("/api/compile", { gameId, expectedRevision: ui.draft.localModel.draftRevision, scope: { kind: "chapter", chapterId: chapter } });
    if (!manifest.visualAssets) throw new Error("缺少四季快照資源，請從當前原件建立新副本");
    if (child.closed) throw new Error("試運行視窗已關閉，請重新開啟");
    child.location.replace("/trial-app?" + new URLSearchParams({ game: gameId, revision: manifest.identity.draftRevision, chapter, scope: "chapter" }));
    status("已開啟固定已保存修訂 " + manifest.identity.draftRevision + " 的選定章節；正式存讀檔停用");
  } catch (error) { status("試運行被拒絕：" + error.message); }
  finally { ui.busy = false; $("trial-app").disabled = false; $("reload-draft").disabled = false; }
};
window.addEventListener("beforeunload", (e) => { if (ui.dirty || ui.busy) { e.preventDefault(); e.returnValue = ""; } });
const startupControls = [...document.querySelectorAll("button,select,input")];
startupControls.forEach((control) => { control.disabled = true; });
mountEditorNavigation({ moduleKey: "map", gameId });
try {
  ui.draft = await call("/api/draft?game=" + encodeURIComponent(gameId));
  const asset = ui.draft.assets.editorVisuals?.springAtlas;
  if (!asset || !/^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/map_atlas_spring\.png$/.test(asset.url)) throw new Error("草稿缺受信圖集，請從當前原件重新複製");
  const response = await fetch("/" + asset.url); if (!response.ok) throw new Error("圖集讀取失敗");
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== asset.byteLength || digest !== asset.sha256) throw new Error("圖集摘要不符");
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  try { atlas = new Image(); atlas.src = url; await atlas.decode(); } finally { URL.revokeObjectURL(url); }
  if (atlas.width !== 256 || atlas.height !== 256) throw new Error("圖集尺寸不符");
  const resize = () => { stopNavigation(); cv.width = Math.max(480, Math.min(960, cv.parentElement.clientWidth - cv.parentElement.querySelector("aside").getBoundingClientRect().width - 14)); cv.height = Math.max(320, Math.min(600, innerHeight - 195)); setView(clampViewport(viewState(), screenSize(), worldSize())); draw(); };
  window.addEventListener("resize", resize);
  startupControls.forEach((control) => { control.disabled = false; });
  for (const id of ui.draft.chapterOrder) { const option = document.createElement("option"); option.value = id; option.textContent = ui.draft.chapters[id].state.name ?? id; $("trial-chapter").append(option); }
  $("trial-app").disabled = ui.draft.chapterOrder.length === 0;
  rebuild(); resize(); window.__studio = ui; status("就緒（" + ui.draft.sourceRef.revision + "）");
} catch (error) { status("載入被拒絕：" + error.message); }
