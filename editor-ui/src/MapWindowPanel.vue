<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { screenToWorld, edgePanDelta, ZOOM_MIN, ZOOM_MAX } from '../../web/src/editor/viewport.js';
const props = defineProps({ model: Object, actions: Object, busy: Boolean, placementReady: Boolean, placementFootprint: Object, placementDrag: String, shiftAnchor: Object, shiftPreview: Object });
const emit = defineEmits(['placement-point', 'placement-drag-end', 'base-cells', 'shift-point', 'shift-candidate']);
const canvas = ref(null), viewport = ref(null), x = ref(''), y = ref(''), width = ref(''), height = ref(''), season = ref('');
const validRectangle = computed(() => [x.value, y.value, width.value, height.value].every(value => Number.isSafeInteger(value) && !Object.is(value, -0)) && x.value >= 0 && y.value >= 0 && width.value >= 1 && width.value <= 32 && height.value >= 1 && height.value <= 32 && x.value + width.value <= 384 && y.value + height.value <= 256);
const validSeason = computed(() => ['spring', 'summer', 'autumn', 'winter'].includes(season.value));
const libraryPoint = ref(null);
const picked = ref(null), mode = ref('inspect'), drag = ref(null), zoom = ref(1), baseRectangle = ref(null);
const zoomLevels = [ZOOM_MIN, 1 / 8, 1 / 4, 1 / 2, 1, 2, ZOOM_MAX];
const layers = [['base', '基本地圖'], ['decor', '裝飾'], ['roads', '道路'], ['cities', '據點']];
const visibleLayers = computed(() => props.model?.mapWindow?.value?.visibleLayers ?? { base: true, decor: true, roads: true, cities: true });
const layered = computed(() => props.model?.mapWindow?.value?.format === 'dragon-draft-map-layer-window-1');
function toggleLayer(name) {
  if (!navigable.value) return;
  const mask = layers.map(([key]) => {
    let visible = visibleLayers.value[key];
    if (key === name) visible = !visible;
    return visible ? '1' : '0';
  }).join('');
  cancelDrag(); picked.value = null; baseRectangle.value = null; props.actions.mapWindowLayers(mask);
}
function changeZoom(input) {
  const value = Number(input);
  if (!zoomLevels.includes(value)) return;
  cancelDrag(); picked.value = null; baseRectangle.value = null; zoom.value = value;
}
async function wheelZoom(event) {
  if (!event.ctrlKey || !event.deltaY) return;
  event.preventDefault();
  if (!readable.value || !canvas.value || !viewport.value) return;
  const index = zoomLevels.indexOf(zoom.value), next = zoomLevels[Math.max(0, Math.min(zoomLevels.length - 1, index + (event.deltaY < 0 ? 1 : -1)))];
  if (next === zoom.value) return;
  const element = canvas.value, scroller = viewport.value, rectangle = element.getBoundingClientRect(), key = windowKey.value;
  if (rectangle.width <= 0 || rectangle.height <= 0) return;
  const clientX = event.clientX, clientY = event.clientY;
  const anchorX = (clientX - rectangle.left) / rectangle.width, anchorY = (clientY - rectangle.top) / rectangle.height;
  changeZoom(next);
  await nextTick();
  if (!readable.value || canvas.value !== element || windowKey.value !== key || zoom.value !== next) return;
  const resized = element.getBoundingClientRect();
  scroller.scrollLeft += resized.left + anchorX * resized.width - clientX;
  scroller.scrollTop += resized.top + anchorY * resized.height - clientY;
}
const shiftOrigin = computed(() => drag.value?.kind === 'shift' && drag.value.preview || props.model?.mapWindow?.value);
const shiftPreviewVisible = computed(() => readable.value && (!drag.value || drag.value.kind === 'shift' && drag.value.end) && !props.placementDrag && props.shiftPreview &&
  props.shiftPreview.transient === (drag.value?.kind === 'shift') &&
  ['gameId', 'draftRevision', 'sourceDigest', 'width', 'height'].every(key => props.shiftPreview[key] === props.model.mapWindow.value[key]) &&
  props.shiftPreview.x === shiftOrigin.value.x && props.shiftPreview.y === shiftOrigin.value.y);
const navigable = computed(() => !props.busy && !props.model?.mapWindow?.locked && props.model?.mapWindow?.ready);
const readable = computed(() => !props.busy && !props.model?.mapWindow?.locked && props.model?.mapWindow?.ready && props.model?.mapAtlas?.ready);
watch([readable, () => props.model?.mapWindow?.value?.gameId, () => props.model?.mapWindow?.value?.draftRevision, () => props.model?.mapWindow?.value?.sourceDigest,
  () => props.model?.mapWindow?.value?.x, () => props.model?.mapWindow?.value?.y, () => props.model?.mapWindow?.value?.width, () => props.model?.mapWindow?.value?.height,
  () => props.model?.mapAtlas?.info?.season], () => { picked.value = null; });
function visibleCanvasRect() {
  const rect = canvas.value.getBoundingClientRect(), port = viewport.value.getBoundingClientRect();
  const left = Math.max(rect.left, port.left + viewport.value.clientLeft, 0), top = Math.max(rect.top, port.top + viewport.value.clientTop, 0);
  const right = Math.min(rect.right, port.left + viewport.value.clientLeft + viewport.value.clientWidth, window.innerWidth);
  const bottom = Math.min(rect.bottom, port.top + viewport.value.clientTop + viewport.value.clientHeight, window.innerHeight);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
function cellAt(event, outside = 'reject') {
  if (!readable.value || !canvas.value) return;
  const rectangle = canvas.value.getBoundingClientRect(), value = props.model.mapWindow.value;
  if (rectangle.width <= 0 || rectangle.height <= 0) return;
  if (outside === 'reject' && (event.clientX < rectangle.left || event.clientX >= rectangle.right || event.clientY < rectangle.top || event.clientY >= rectangle.bottom)) return;
  // The canvas has no border/padding. Its DOM rectangle maps to backing pixels;
  // the shared camera inverse then maps the saved window to world pixels.
  const pixelX = (event.clientX - rectangle.left) * canvas.value.width / rectangle.width;
  const pixelY = (event.clientY - rectangle.top) * canvas.value.height / rectangle.height;
  const origin = drag.value?.preview ?? value;
  if (['place', 'shift'].includes(drag.value?.kind)) {
    const visible = visibleCanvasRect();
    if (event.clientX < visible.left || event.clientX >= visible.right || event.clientY < visible.top || event.clientY >= visible.bottom) return;
  }
  const world = screenToWorld({ x: origin.x * value.tileSize, y: origin.y * value.tileSize, zoom: 1 }, pixelX, pixelY);
  const tileX = Math.max(origin.x, Math.min(origin.x + value.width - 1, Math.floor(world[0] / value.tileSize)));
  const tileY = Math.max(origin.y, Math.min(origin.y + value.height - 1, Math.floor(world[1] / value.tileSize)));
  return { x: tileX, y: tileY, cell: tileY * value.worldWidth + tileX, tile: origin === value ? value.tiles[(tileY - value.y) * value.width + tileX - value.x] : null, draftRevision: value.draftRevision };
}
const placeable = computed(() => readable.value && props.placementReady && !!props.placementFootprint);
const placementOrigin = computed(() => drag.value?.kind === 'place' && drag.value.preview || props.model?.mapWindow?.value);
const placementPreview = computed(() => {
  const point = props.placementDrag ? libraryPoint.value : drag.value?.kind === 'place' ? drag.value.end : picked.value;
  if (!placeable.value || !point || drag.value?.kind === 'shift') return null;
  const value = props.model.mapWindow.value;
  const cells = props.placementFootprint.offsets.map(([dx, dy]) => [point.x + dx, point.y + dy]);
  const origin = placementOrigin.value;
  return { point, cells, renderX: point.x - origin.x + value.x, renderY: point.y - origin.y + value.y,
    outside: cells.filter(([x, y]) => x < 0 || x >= 384 || y < 0 || y >= 256).length,
    offWindow: cells.filter(([x, y]) => x < origin.x || x >= origin.x + value.width || y < origin.y || y >= origin.y + value.height).length };
});
const baseSelectable = computed(() => readable.value && props.model?.workspace?.layer === 'base' && props.model?.context?.verified && props.model?.base?.supported && !props.model.base.locked);
const baseCells = computed(() => {
  if (!baseSelectable.value) return [];
  if (mode.value !== 'base-select') return picked.value ? [picked.value.cell] : [];
  if (!baseRectangle.value) return [];
  const { start, end } = baseRectangle.value, value = props.model.mapWindow.value;
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x) + 1, height = Math.abs(start.y - end.y) + 1;
  return Array.from({ length: width * height }, (_, index) => (y + Math.floor(index / width)) * value.worldWidth + x + index % width);
});
function takeBaseSelection() {
  if (!baseCells.value.length) return;
  const value = props.model.mapWindow.value;
  emit('base-cells', { cells: [...baseCells.value], gameId: value.gameId, draftRevision: value.draftRevision, sourceDigest: value.sourceDigest });
}
const shiftable = computed(() => readable.value && !!props.shiftAnchor);
const shiftCandidate = computed(() => {
  const gesture = drag.value;
  if (gesture?.kind !== 'shift' || !gesture.end || !shiftable.value) return null;
  const value = props.model.mapWindow.value, origin = shiftOrigin.value;
  return { anchorId: gesture.anchor.instanceId, x: gesture.end.x - (gesture.grabOffset?.x ?? 0), y: gesture.end.y - (gesture.grabOffset?.y ?? 0), windowX: origin.x, windowY: origin.y,
    gameId: value.gameId, draftRevision: value.draftRevision, sourceDigest: value.sourceDigest };
});
watch(shiftCandidate, value => emit('shift-candidate', value));
watch(() => props.shiftAnchor, () => { closeToolMenu(); if (drag.value?.kind === 'shift') cancelDrag(); });
function takeShiftPoint() {
  if (!readable.value || !props.shiftAnchor || !picked.value) return;
  const value = props.model.mapWindow.value;
  emit('shift-point', { anchorId: props.shiftAnchor.instanceId, x: picked.value.x, y: picked.value.y, gameId: value.gameId, draftRevision: value.draftRevision, sourceDigest: value.sourceDigest });
}
function takePlacementPoint() {
  if (!readable.value || !props.placementReady || !picked.value || placementPreview.value?.outside) return;
  const value = props.model.mapWindow.value;
  emit('placement-point', { x: picked.value.x, y: picked.value.y, gameId: value.gameId, draftRevision: value.draftRevision, sourceDigest: value.sourceDigest });
  return true;
}
function previewLibraryDrag(event) {
  if (!placeable.value || !props.placementDrag || !event.dataTransfer?.types.includes('application/x-wolong-material-placement')) return;
  if (drag.value && !drag.value.library) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  if (!drag.value) {
    const rectangle = canvas.value.getBoundingClientRect(), value = props.model.mapWindow.value;
    if (rectangle.width <= 0 || rectangle.height <= 0) return;
    picked.value = null; baseRectangle.value = null;
    drag.value = { kind: 'place', library: props.placementDrag, key: windowKey.value,
      scaleX: value.width / rectangle.width, scaleY: value.height / rectangle.height, dx: 0, dy: 0, edgeX: 0, edgeY: 0 };
  }
  drag.value.point = { clientX: event.clientX, clientY: event.clientY };
  libraryPoint.value = cellAt(event) ?? null; drag.value.end = libraryPoint.value;
  if (props.model.mapWindow.localNavigation && edgeFrame === null) { drag.value.edgeTime = null; edgeFrame = requestAnimationFrame(edgePan); }
}
function leaveLibraryDrag() {
  if (drag.value?.library) clearDrag(); // Keep the native drag token so re-entry starts a fresh preview.
  else libraryPoint.value = null;
}
function dropLibrary(event) {
  if (!placeable.value || !props.placementDrag || event.dataTransfer?.getData('application/x-wolong-material-placement') !== props.placementDrag) return;
  event.preventDefault();
  const selected = drag.value;
  libraryPoint.value = cellAt(event) ?? null; picked.value = libraryPoint.value;
  const taken = takePlacementPoint(); cancelDrag();
  if (selected?.preview) {
    picked.value = null;
    if (taken) props.actions.mapWindowPan(selected.dx, selected.dy);
  }
}
watch(() => props.placementDrag, () => { libraryPoint.value = null; if (drag.value?.library) clearDrag(); });
function inspect(event) {
  if (event.button !== 0) return;
  if (mode.value === 'pick') {
    const point = pickable.value ? cellAt(event) : null;
    if (point) props.actions.decorationPick(point.x, point.y);
    return;
  }
  if (mode.value === 'inspect') picked.value = cellAt(event) ?? null;
}
const selectable = computed(() => readable.value && !!props.model?.decorationSelection && !props.model.decorationSelection.locked);
const pickable = computed(() => selectable.value && !props.model?.materials?.decorationLocked && visibleLayers.value.decor);
const grabOffsets = computed(() => {
  if (!shiftable.value || !pickable.value) return null;
  const instance = props.model.materials.instances.find(row => row.instanceId === props.shiftAnchor.instanceId);
  return props.model.materials.placement?.materials.find(row => row.materialId === instance?.materialId)?.offsets ?? null;
});
watch(grabOffsets, () => { if (drag.value?.grabOffset) cancelDrag(); });
const selectionOutline = computed(() => {
  const selection = props.model?.decorationSelection;
  const ids = mode.value === 'grab' ? (grabOffsets.value ? [props.shiftAnchor.instanceId] : []) : (selection?.ready ? selection.selectedIds : []);
  if (!['pick', 'select', 'grab'].includes(mode.value) || !pickable.value || drag.value || props.placementDrag || !ids.length) return null;
  const selected = new Set(ids), cells = new Set(), view = props.model.mapWindow.value;
  const definitions = new Map((props.model.materials.placement?.materials ?? []).map(row => [row.materialId, row]));
  let total = 0, unknown = 0;
  props.model.materials.instances.filter(row => selected.has(row.instanceId)).forEach(instance => {
    const offsets = definitions.get(instance.materialId)?.offsets;
    if (!offsets) { unknown++; return; }
    total += offsets.length;
    offsets.forEach(([dx, dy]) => {
      const x = instance.x + dx, y = instance.y + dy;
      if (x >= view.x && x < view.x + view.width && y >= view.y && y < view.y + view.height) cells.add(y * view.worldWidth + x);
    });
  });
  return { instanceId: ids.length === 1 ? ids[0] : null, count: ids.length, unknown, total,
    cells: [...cells].map(cell => [cell % view.worldWidth, Math.floor(cell / view.worldWidth)]) };
});
const tools = computed(() => [
  ['inspect', '只檢查圖格', false], ['place', '拖動素材落點（只填表單）', !placeable.value],
  ['pan', '拖動已讀窗口', !readable.value], ['select', '讀取完整裝飾框選', !selectable.value],
  ['base-select', '框選基礎格（只預覽選取）', !baseSelectable.value],
  ['shift', '拖動位移目標（只填表單）', !shiftable.value],
  ['pick', '讀取最上完整裝飾', !pickable.value],
  ['grab', '抓住已選錨點占格位移（只填表單）', !grabOffsets.value],
]);
const toolMenu = ref(null), toolMenuElement = ref(null);
function closeToolMenu() { toolMenu.value = null; }
async function openToolMenu(event) {
  event.preventDefault();
  if (!readable.value) return;
  cancelDrag();
  const opened = { x: event.clientX, y: event.clientY };
  toolMenu.value = opened;
  await nextTick();
  if (!toolMenu.value || !toolMenuElement.value || !readable.value) return;
  const rectangle = toolMenuElement.value.getBoundingClientRect();
  toolMenu.value.x = Math.max(4, Math.min(opened.x, window.innerWidth - rectangle.width - 4));
  toolMenu.value.y = Math.max(4, Math.min(opened.y, window.innerHeight - rectangle.height - 4));
  const buttons = toolMenuElement.value.querySelectorAll('button:not(:disabled)');
  (Array.from(buttons).find(button => button.getAttribute('aria-checked') === 'true') ?? buttons[0])?.focus();
}
function chooseTool(value) {
  if (!readable.value || !tools.value.some(([id, , disabled]) => id === value && !disabled)) return;
  mode.value = value; closeToolMenu(); canvas.value?.focus({ preventScroll: true });
}
function toolMenuKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault(); closeToolMenu(); canvas.value?.focus({ preventScroll: true }); return;
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(toolMenuElement.value.querySelectorAll('button:not(:disabled)'));
  let index = buttons.indexOf(document.activeElement);
  if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = buttons.length - 1;
  else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
}
function toolMenuFocusOut(event) { if (!event.currentTarget.contains(event.relatedTarget)) closeToolMenu(); }
const windowKey = computed(() => {
  const value = props.model?.mapWindow?.value;
  return JSON.stringify([value?.gameId, value?.draftRevision, value?.sourceDigest, value?.x, value?.y, value?.width, value?.height, props.model?.mapAtlas?.info?.season]);
});
let panFrame = null, edgeFrame = null;
function edgePan(now) {
  edgeFrame = null;
  const gesture = drag.value;
  if (!['place', 'shift', 'select', 'base-select'].includes(gesture?.kind) || gesture.kind === 'shift' && !shiftable.value || !readable.value || gesture.kind === 'place' && !placeable.value || gesture.kind === 'select' && !selectable.value || gesture.kind === 'base-select' && !baseSelectable.value || !props.model.mapWindow.localNavigation || gesture.key !== windowKey.value || gesture.library && gesture.library !== props.placementDrag) { cancelDrag(); return; }
  const rect = visibleCanvasRect(), point = gesture.point;
  if (rect.width <= 0 || rect.height <= 0 || point.clientX < rect.left || point.clientX >= rect.right || point.clientY < rect.top || point.clientY >= rect.bottom) return;
  // Seed from RAF itself: its frame timestamp can precede a pointer event's performance.now().
  if (gesture.edgeTime === null) { gesture.edgeTime = now; edgeFrame = requestAnimationFrame(edgePan); return; }
  const [sx, sy] = edgePanDelta([point.clientX - rect.left, point.clientY - rect.top], rect, now - gesture.edgeTime);
  gesture.edgeTime = now;
  const view = props.model.mapWindow.value;
  const x = Math.max(-view.x, Math.min(view.worldWidth - view.width - view.x, gesture.edgeX + sx * gesture.scaleX));
  const y = Math.max(-view.y, Math.min(view.worldHeight - view.height - view.y, gesture.edgeY + sy * gesture.scaleY));
  if (x === gesture.edgeX && y === gesture.edgeY) return;
  gesture.edgeX = x; gesture.edgeY = y;
  const dx = Math.trunc(x) || 0, dy = Math.trunc(y) || 0;
  if (dx !== gesture.dx || dy !== gesture.dy) {
    gesture.dx = dx; gesture.dy = dy;
    gesture.preview = props.actions.previewMapWindowPan(dx, dy);
    if (!gesture.preview) { cancelDrag(); return; }
    gesture.end = cellAt(point, ['place', 'shift'].includes(gesture.kind) ? 'reject' : 'clamp') ?? null;
    if (gesture.library) libraryPoint.value = gesture.end;
  }
  edgeFrame = requestAnimationFrame(edgePan);
}
function clearDrag() {
  if (panFrame !== null) { cancelAnimationFrame(panFrame); panFrame = null; }
  if (edgeFrame !== null) { cancelAnimationFrame(edgeFrame); edgeFrame = null; }
  const previous = drag.value; drag.value = null; libraryPoint.value = null;
  if (previous?.preview) props.actions.redrawMapWindow();
  if (previous && !previous.library && canvas.value?.hasPointerCapture(previous.pointerId)) canvas.value.releasePointerCapture(previous.pointerId);
}
function cancelDrag() {
  clearDrag();
  if (props.placementDrag) emit('placement-drag-end');
}
function startDrag(event) {
  if (!['select', 'base-select', 'pan', 'place', 'shift', 'grab'].includes(mode.value) || mode.value === 'grab' && !grabOffsets.value || mode.value === 'shift' && !shiftable.value || !readable.value || mode.value === 'select' && !selectable.value || mode.value === 'base-select' && !baseSelectable.value || mode.value === 'place' && !placeable.value || event.button !== 0 || !event.isPrimary || drag.value) return;
  const start = cellAt(event); if (!start) return;
  const grabOffset = mode.value === 'grab' ? { x: start.x - props.shiftAnchor.x, y: start.y - props.shiftAnchor.y } : null;
  if (grabOffset && !grabOffsets.value.some(([dx, dy]) => dx === grabOffset.x && dy === grabOffset.y)) return;
  event.preventDefault(); picked.value = null; baseRectangle.value = null;
  const rectangle = canvas.value.getBoundingClientRect(), value = props.model.mapWindow.value;
  drag.value = { kind: mode.value === 'grab' ? 'shift' : mode.value, grabOffset, anchor: props.shiftAnchor, pointerId: event.pointerId, key: windowKey.value, start, end: start, selectionMode: event.shiftKey ? 'append' : 'replace',
    clientX: event.clientX, clientY: event.clientY, scaleX: value.width / rectangle.width, scaleY: value.height / rectangle.height, dx: 0, dy: 0 };
  canvas.value.setPointerCapture(event.pointerId);
  if (mode.value !== 'pan') { drag.value.edgeX = 0; drag.value.edgeY = 0; moveDrag(event); }
}
function moveDrag(event) {
  if (drag.value?.pointerId !== event.pointerId) return;
  if (!readable.value || drag.value.kind === 'shift' && !shiftable.value || drag.value.kind === 'select' && !selectable.value || drag.value.kind === 'base-select' && !baseSelectable.value || drag.value.kind === 'place' && !placeable.value || drag.value.key !== windowKey.value) { cancelDrag(); return; }
  if (drag.value.kind === 'pan') {
    const dx = Math.trunc((drag.value.clientX - event.clientX) * drag.value.scaleX);
    const dy = Math.trunc((drag.value.clientY - event.clientY) * drag.value.scaleY);
    drag.value.dx = dx === 0 ? 0 : dx; drag.value.dy = dy === 0 ? 0 : dy;
    if (props.model.mapWindow.localNavigation && panFrame === null) panFrame = requestAnimationFrame(() => {
      panFrame = null;
      if (drag.value?.kind === 'pan' && readable.value && drag.value.key === windowKey.value) drag.value.preview = props.actions.previewMapWindowPan(drag.value.dx, drag.value.dy);
    });
    return;
  }
  drag.value.point = { clientX: event.clientX, clientY: event.clientY };
  drag.value.end = cellAt(event, ['place', 'shift'].includes(drag.value.kind) ? 'reject' : 'clamp') ?? null;
  if (props.model.mapWindow.localNavigation && edgeFrame === null) { drag.value.edgeTime = null; edgeFrame = requestAnimationFrame(edgePan); }
}
function endDrag(event) {
  if (drag.value?.pointerId !== event.pointerId) return;
  moveDrag(event);
  const selected = drag.value, target = shiftCandidate.value; cancelDrag();
  if (!selected || event.button !== 0) return;
  if (selected.kind === 'shift') {
    if (target) {
      emit('shift-point', target);
      if (selected.preview) props.actions.mapWindowPan(selected.dx, selected.dy);
    }
    return;
  }
  if (selected.kind === 'pan') { props.actions.mapWindowPan(selected.dx, selected.dy); return; }
  if (selected.kind === 'place') {
    picked.value = selected.end;
    const taken = takePlacementPoint();
    if (selected.preview) {
      picked.value = null; // A transient slice is not a confirmed tile inspection.
      if (taken) props.actions.mapWindowPan(selected.dx, selected.dy);
    }
    return;
  }
  if (selected.kind === 'base-select') { baseRectangle.value = { start: selected.start, end: selected.end }; return; }
  const x = Math.min(selected.start.x, selected.end.x), y = Math.min(selected.start.y, selected.end.y);
  props.actions.decorationSelection(x, y, Math.abs(selected.start.x - selected.end.x) + 1, Math.abs(selected.start.y - selected.end.y) + 1, selected.selectionMode);
}
const dragStyle = computed(() => {
  const selection = ['select', 'base-select'].includes(drag.value?.kind) ? drag.value : baseRectangle.value;
  if (!selection || !canvas.value) return {};
  const { start, end } = selection, value = props.model.mapWindow.value, rect = canvas.value.getBoundingClientRect();
  if (!end) return {};
  const origin = drag.value?.preview ?? value;
  return { left: `${(Math.min(start.x, end.x) - origin.x) * rect.width / value.width}px`, top: `${(Math.min(start.y, end.y) - origin.y) * rect.height / value.height}px`,
    width: `${(Math.abs(start.x - end.x) + 1) * rect.width / value.width}px`, height: `${(Math.abs(start.y - end.y) + 1) * rect.height / value.height}px` };
});
function escapeDrag(event) { if (event.key === 'Escape' && (drag.value || props.placementDrag || baseRectangle.value)) { event.preventDefault(); cancelDrag(); baseRectangle.value = null; } }
watch([readable, selectable, baseSelectable, windowKey, mode], () => { closeToolMenu(); cancelDrag(); picked.value = null; baseRectangle.value = null; });
watch([placeable, () => props.placementFootprint], () => { closeToolMenu(); if (drag.value?.kind === 'place' || props.placementDrag) cancelDrag(); });
onMounted(() => {
  window.addEventListener('blur', cancelDrag); window.addEventListener('keydown', escapeDrag);
  window.addEventListener('resize', cancelDrag); document.addEventListener('visibilitychange', cancelDrag);
  window.addEventListener('blur', closeToolMenu); window.addEventListener('resize', closeToolMenu);
  document.addEventListener('visibilitychange', closeToolMenu);
});
const unknown = computed(() => props.model?.mapWindow?.value?.tiles.filter(tile => tile === null).length ?? 0);
watch([() => props.model?.fields?.gameId, () => props.model?.context?.draftRevision, () => props.model?.context?.verified], () => {
  x.value = ''; y.value = ''; width.value = ''; height.value = ''; season.value = ''; zoom.value = 1;
});
watch(canvas, value => { props.actions.attachMapWindowCanvas(value); props.actions.redrawMapWindow?.(); }, { flush: 'post' });
onBeforeUnmount(() => {
  closeToolMenu(); cancelDrag(); window.removeEventListener('blur', cancelDrag); window.removeEventListener('keydown', escapeDrag);
  window.removeEventListener('resize', cancelDrag); document.removeEventListener('visibilitychange', cancelDrag);
  window.removeEventListener('blur', closeToolMenu); window.removeEventListener('resize', closeToolMenu);
  document.removeEventListener('visibilitychange', closeToolMenu); props.actions.attachMapWindowCanvas(null);
});
</script>
<template>
  <section v-if="model?.mapWindow && model?.mapAtlas" id="map-window-editor" :class="{ placing: mode === 'place' || placeable }">
    <h3>已保存修訂的圖塊窗口（唯讀）</h3>
    <p>共用已明確載入的草稿修訂。座標與尺寸以圖格計，單邊最多32格；須明確選擇季節並分別讀取窗口及圖集。未保存表單不參與，輸入變更不會自動發請求。</p>
    <div class="module-toolbar">
      <label>明確草稿修訂<input id="map-window-revision" :value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event.target.value)"></label>
      <ElButton id="map-window-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂</ElButton>
      <ElButton id="map-window-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
    </div>
    <div class="module-toolbar">
      <label>X<input id="map-window-x" v-model.number="x" type="number" min="0" max="383" step="1" :disabled="busy || model.mapWindow.locked"></label>
      <label>Y<input id="map-window-y" v-model.number="y" type="number" min="0" max="255" step="1" :disabled="busy || model.mapWindow.locked"></label>
      <label>寬<input id="map-window-width" v-model.number="width" type="number" min="1" max="32" step="1" :disabled="busy || model.mapWindow.locked"></label>
      <label>高<input id="map-window-height" v-model.number="height" type="number" min="1" max="32" step="1" :disabled="busy || model.mapWindow.locked"></label>
      <ElButton id="map-window-read" :disabled="busy || model.mapWindow.locked || !validRectangle" @click="actions.mapWindow(x, y, width, height)">讀取圖格窗口</ElButton>
      <ElButton id="map-scene-read" :disabled="busy || model.mapWindow.locked || !validRectangle" @click="actions.mapScene(x, y, width, height)">讀取整圖供本地導航</ElButton>
      <label>季節<select id="map-window-season" v-model="season" :disabled="busy || model.mapAtlas.locked"><option value="" disabled>請明確選擇</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>
      <ElButton id="map-window-atlas" :disabled="busy || model.mapAtlas.locked || !validSeason" @click="actions.mapAtlas(season)">讀取季節圖集</ElButton>
    </div>
    <p id="map-scene-state">{{ model.mapWindow.localNavigation ? '固定域整圖已讀取；導航只在本地切換顯示窗口，顯隱變更仍重新讀取。' : '窗口讀取模式；導航會請求確切已保存修訂的窗口。' }} 保存、重讀或身份切換會清除整圖顯示資料；不是可寫來源或運行准入。</p>
    <div class="module-toolbar" aria-label="已讀窗口導航">
      <ElButton id="map-window-left" :disabled="!navigable || model.mapWindow.value.x === 0" @click="actions.mapWindowStep(-1, 0)">向左一窗</ElButton>
      <ElButton id="map-window-right" :disabled="!navigable || model.mapWindow.value.x + model.mapWindow.value.width === model.mapWindow.value.worldWidth" @click="actions.mapWindowStep(1, 0)">向右一窗</ElButton>
      <ElButton id="map-window-up" :disabled="!navigable || model.mapWindow.value.y === 0" @click="actions.mapWindowStep(0, -1)">向上一窗</ElButton>
      <ElButton id="map-window-down" :disabled="!navigable || model.mapWindow.value.y + model.mapWindow.value.height === model.mapWindow.value.worldHeight" @click="actions.mapWindowStep(0, 1)">向下一窗</ElButton>
    </div>
    <p>導航只按已讀窗口的位置及尺寸移動；邊緣維持整窗在地圖內，可能與前窗部分重疊。不使用上方未讀輸入，不重新讀圖集或保存。</p>
    <div class="module-toolbar" aria-label="窗口四層顯示">
      <ElButton v-for="layer in layers" :key="layer[0]" :data-map-layer="layer[0]" :aria-pressed="model.mapWindow.ready && visibleLayers[layer[0]]" :disabled="!navigable" @click="toggleLayer(layer[0])">{{ layer[1] }}：<template v-if="model.mapWindow.ready">{{ visibleLayers[layer[0]] ? '顯示' : '隱藏' }}</template><template v-else>未讀取</template></ElButton>
    </div>
    <p>四層開關只重讀目前窗口的顯示，不保存或改變規則，也不是圖層鎖定。導航沿用顯隱；重新「讀取圖格窗口」恢復全層。完整裝飾框選仍查詢完整源，包含顯示已隱藏的裝飾。</p>
    <p id="map-window-status" role="status">{{ model.message }}</p>
    <p v-if="model.mapWindow.ready" id="map-window-context">窗口：{{ model.mapWindow.value.gameId }}／修訂 {{ model.mapWindow.value.draftRevision }}／({{ model.mapWindow.value.x }}, {{ model.mapWindow.value.y }}) {{ model.mapWindow.value.width }}×{{ model.mapWindow.value.height }}格；{{ layered ? '空白／未知' : '未知' }} {{ unknown }}格。</p>
    <p v-if="model.mapAtlas.ready" id="map-window-atlas-context">已核圖集：{{ model.mapAtlas.info.season }}／修訂 {{ model.mapAtlas.info.draftRevision }}／來源 {{ model.mapAtlas.info.sourceDigest }}</p>
    <p v-if="!model.mapWindow.ready || !model.mapAtlas.ready">同一修訂的窗口與圖集尚未全部就緒，畫布保持空白。</p>
    <p>灰色棋盤在全層窗口表示未知底層，在顯隱窗口也可能只是被隱藏的空白；不能據此補值或判斷源缺口。此圖只顯示合成圖塊，不直接寫入地圖或授予運行准入；原生控制器繪製像素，保存／換修訂或身份會清除舊圖。</p>
    <p>檢查模式的左鍵只檢查已顯示的合成圖格；不是選中基礎層、裝飾實例或填色目標，不會發出讀取或保存請求。</p>
    <p>「讀取最上完整裝飾」在裝飾層顯示並解鎖時，以單格查詢完整占用範圍，按已保存繪製順序取最上實例（不是按像素顏色或透明度）。結果取代窗口累計選取；空格清除結果，但不改素材勾選。須在素材面板另行確認取用，不自動移動、選位移錨點或保存。</p>
    <div id="map-window-inspection"><output v-if="picked" id="map-window-picked" :data-cell="picked.cell">修訂 {{ picked.draftRevision }}／圖格 ({{ picked.x }}, {{ picked.y }})／索引 {{ picked.cell }}／合成值：<span id="map-window-picked-tile"><template v-if="picked.tile === null">{{ layered ? '空白／未知（顯示投影）' : '未知（未補值）' }}</template><template v-else>{{ picked.tile }}</template></span></output></div>
    <ElButton id="map-window-use-base" :disabled="!baseCells.length" @click="takeBaseSelection">追加{{ mode === 'base-select' ? '框選基礎格' : '檢查格' }}至補底選取並定位列表（不填數值／不保存）</ElButton>
    <ElButton id="map-window-use-shift" :disabled="!readable || !shiftAnchor || !picked" @click="takeShiftPoint">將檢查格用作所選位移錨點目的地（只填位移）</ElButton>
    <ElButton id="map-window-use-placement" :disabled="!readable || !placementReady || !picked || !!placementPreview?.outside" @click="takePlacementPoint">將檢查格用作素材落點</ElButton>
    <p>先在素材表單明確選擇素材、變體與水域類別，再檢查圖格並取用落點。此步只替換放置表單的X／Y；素材、類別與其它輸入保持，必須另按確認放置才保存。裝飾層鎖定時不可取用。</p>
    <div id="map-window-placement-feedback"><p v-if="placementPreview" id="map-window-placement-status" :data-outside="placementPreview.outside">占用 {{ placementPreview.cells.length }} 格；超出固定地圖 {{ placementPreview.outside }} 格／窗口外 {{ placementPreview.offWindow }} 格。輪廓表示占用範圍；已知配方與圖集可疊加半透明貼圖，缺資料保持空白，不代表運行准入。窗口外部分不畫，越界不可取用落點，不裁切保存。</p>
    <p v-else-if="placementReady && picked">占用格預覽未知，不能從格數猜形狀；保存仍由服務核驗完整範圍。</p></div>
    <label>窗口顯示縮放<select id="map-window-zoom" :value="zoom" :disabled="!readable" @change="changeZoom($event.target.value)"><option v-for="level in zoomLevels" :key="level" :value="level">{{ level * 100 }}%</option></select></label>
    <p>縮放只改目前窗口的顯示尺寸，不改圖格、框選集合或未讀輸入，不重新讀取圖集；變更倍率會取消尚未完成的拖框。畫布內Ctrl＋滾輪以滑鼠位置縮放；普通滾輪仍捲動頁面。錨點受目前窗口可捲動範圍限制，不能因此讀取更多地圖；這不是整圖縮放。</p>
    <label>左鍵模式<select id="map-window-mode" v-model="mode"><option v-for="[value, label, disabled] in tools" :key="value" :value="value" :disabled="disabled">{{ label }}</option></select></label>
    <p>畫布右鍵只開啟同一組模式選單，不選格、不保存、不切換圖層或解除鎖定。方向鍵／Home／End選工具，Enter確認；Esc只關選單，選單外首次點擊只關閉。</p>
    <p v-if="mode === 'base-select'" id="map-window-base-selection">基礎格框選：待取用 {{ baseCells.length }} 格。拖曳只預覽完整圖格範圍，須按上方追加鈕才加入補底選取；保留原頁外勾選，不猜數值、不保存。Esc清除未取用範圍。</p>
    <p>框選模式拖曳後只讀取完整裝飾集合，包含被遮住的實例；不選道路或據點、不保存，也不覆蓋素材面板勾選。拖出窗口會限制在當前窗口內；Esc、失焦或切換窗口取消拖曳。一般拖框取代集合；按下時按住Shift會追加，同修訂導航後可繼續追加，途中放開或按下Shift不改本次模式。已讀整圖時，裝飾／基礎格框選可在可見邊緣平移預覽；鬆手還原原窗口，按跨窗口的完整世界矩形讀取裝飾或保留待取用基礎範圍，不自動保存或擴邊。</p>
    <p>素材落點模式只在占用格資料已知、選項完整且裝飾解鎖時可用。拖動按圖格吸附並預覽完整占用範圍；在窗口內合法鬆手只替換放置表單X／Y，不保存。越界、拖出窗口鬆手、Esc或失焦不改表單；仍須另按確認放置。已讀整圖時，本模式在可見畫布邊緣自動平移預覽，合法鬆手才確定窗口位置及落點；取消還原，不自動讀圖或擴邊。素材庫HTML拖放同樣支援已讀整圖邊緣平移；拖出畫布還原，重新進入重新預覽。框選沿上段的還原窗口流程。</p>
    <p>位移目標模式須先明確選定已勾選實例的錨點。拖動時只預覽整批目的占格，不改原位移輸入；游標圖格是錨點目的地，不是另加拖曳距離。可在已讀整圖邊緣平移，窗口內鬆手才填X／Y並確定窗口；離窗、Esc、失焦、尺寸／資格變更取消。仍須另按整批平移並確認，紅色越界提示不裁切實例或代替服務校驗。</p>
    <p v-if="mode === 'grab'">先明確選取並指定錨點。藍色輪廓只標示該錨點實例的已知完整占格（含被遮住的格），不是最上拾取；須從其中一格按下。拖動保留抓取格相對錨點的偏移，預覽整批所選實例，合法鬆手只填位移，不疊加原輸入。仍須獨立確認保存；未知占格、隱藏或鎖定不可抓取，不裁切、不擴圖。</p>
    <p>拖動模式按顯示比例換算整數圖格位移。已讀整圖時逐幀預覽本地窗口，鬆手才確定位置；未讀整圖時只顯示位移，鬆手才請求新窗口。Esc／失焦／視窗尺寸變更／頁面隱藏還原已確定窗口；不改未讀輸入、選取或來源，不移動裝飾、不保存，仍不是邊緣自動平移。</p>
    <output id="map-window-pan-preview" :data-edge-x="drag?.kind !== 'pan' ? drag?.preview?.x : null" :data-edge-y="drag?.kind !== 'pan' ? drag?.preview?.y : null"><template v-if="drag?.kind === 'pan'">請求窗口位移：X {{ drag.dx }}／Y {{ drag.dy }} 格；<template v-if="drag.preview">本地預覽 ({{ drag.preview.x }}, {{ drag.preview.y }})，鬆手確定、Esc還原。</template><template v-else>鬆手後讀取，Esc取消。</template></template><template v-else-if="drag?.kind === 'place' && drag.preview">素材拖曳窗口預覽：({{ drag.preview.x }}, {{ drag.preview.y }})，合法鬆手確定，取消還原。</template><template v-else-if="drag?.kind === 'shift' && drag.preview">位移目標窗口預覽：({{ drag.preview.x }}, {{ drag.preview.y }})，鬆手只填參數，取消還原。</template><template v-else-if="drag?.preview">框選窗口預覽：({{ drag.preview.x }}, {{ drag.preview.y }})；鬆手還原窗口並取用完整範圍，Esc取消。</template></output>
    <p v-if="['pick', 'select', 'grab'].includes(mode)" id="map-window-pick-status" role="status"><template v-if="selectionOutline"><template v-if="selectionOutline.count === 1">{{ mode === 'grab' ? '已選位移錨點' : '已讀選取' }} {{ selectionOutline.instanceId }}：<template v-if="!selectionOutline.unknown">完整占用 {{ selectionOutline.total }} 格，窗口內 {{ selectionOutline.cells.length }} 格以藍色標示。</template><template v-else>占用形狀未知，不畫輪廓。</template></template><template v-else>已讀選取 {{ selectionOutline.count }} 個實例；已知完整占格 {{ selectionOutline.total }} 格次，形狀未知 {{ selectionOutline.unknown }} 個；窗口內已知占格聯集 {{ selectionOutline.cells.length }} 格以藍色標示（含被遮實例，不代表完整合成）。</template>不是素材勾選或位移目的地；不補未知形狀、不保存。</template><template v-else>尚無可顯示的已讀裝飾選取；查詢中、拖曳、鎖定或隱藏時不畫輪廓。</template></p>
    <div ref="viewport" class="map-window-viewport" tabindex="0" aria-label="唯讀圖塊窗口">
      <div class="map-window-surface">
        <canvas ref="canvas" id="map-window-canvas" :style="{ zoom }" :class="{ selecting: mode === 'select' || mode === 'base-select', panning: mode === 'pan', placing: mode === 'place' || mode === 'shift' || mode === 'grab' }" width="1" height="1" tabindex="0" aria-label="已保存修訂的圖塊窗口像素" @contextmenu="openToolMenu" @click="inspect" @wheel="wheelZoom" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @dragenter="previewLibraryDrag" @dragover="previewLibraryDrag" @dragleave="leaveLibraryDrag" @drop="dropLibrary"></canvas>
        <canvas v-if="placementPreview" id="map-window-placement-picture" :ref="element => element && placementPreview && placementFootprint && actions.drawPlacementPreview(element, placementFootprint.materialId, placementFootprint.variantRef, placementPreview.renderX, placementPreview.renderY)" width="1" height="1" aria-label="未保存素材貼圖預覽"></canvas>
        <svg v-if="placementPreview" id="map-window-placement-preview" :viewBox="`0 0 ${model.mapWindow.value.width} ${model.mapWindow.value.height}`" preserveAspectRatio="none" aria-label="素材占用格預覽" :class="{ outside: placementPreview.outside }">
          <rect v-for="cell in placementPreview.cells" :key="cell.join(',')" :x="cell[0] - placementOrigin.x" :y="cell[1] - placementOrigin.y" width="1" height="1" />
        </svg>
        <canvas v-if="shiftPreviewVisible" id="map-window-shift-picture" :ref="element => element && actions.drawShiftPreview(element, shiftPreview.tiles)" width="1" height="1" aria-label="所選實例目的地貼圖（非移動後合成）"></canvas>
        <svg v-if="shiftPreviewVisible" id="map-window-shift-preview" :viewBox="`0 0 ${shiftPreview.width} ${shiftPreview.height}`" preserveAspectRatio="none" aria-label="未保存整批位移占格聯集" :class="{ outside: shiftPreview.outside }">
          <rect v-for="cell in shiftPreview.cells" :key="cell.join(',')" :x="cell[0] - shiftPreview.x" :y="cell[1] - shiftPreview.y" width="1" height="1" />
        </svg>
        <svg v-if="selectionOutline?.cells.length" id="map-window-pick-outline" :viewBox="`0 0 ${model.mapWindow.value.width} ${model.mapWindow.value.height}`" preserveAspectRatio="none" aria-label="已讀裝飾選取的已知占格聯集（窗口內）">
          <rect v-for="cell in selectionOutline.cells" :key="cell.join(',')" :x="cell[0] - model.mapWindow.value.x" :y="cell[1] - model.mapWindow.value.y" width="1" height="1" />
        </svg>
        <div v-if="drag?.kind === 'select' || drag?.kind === 'base-select' || baseRectangle" id="map-window-selection-box" :style="dragStyle" aria-hidden="true"></div>
      </div>
    </div>
    <p id="map-window-shift-status" :data-outside="shiftPreviewVisible ? shiftPreview.outside : null" :data-unknown="shiftPreviewVisible ? shiftPreview.unknown : null">整批位移貼圖／輪廓預覽，不改底圖或保存。<template v-if="shiftPreviewVisible"><strong v-if="shiftPreview.transient">拖曳中，尚未填入參數。</strong>所選 {{ shiftPreview.count }} 個實例／窗口內占格聯集 {{ shiftPreview.cells.length }} 格／越界 {{ shiftPreview.outside }} 格次（按實例計）／形狀未知 {{ shiftPreview.unknown }} 個／貼圖未知 {{ shiftPreview.unknownVisual }} 個。貼圖沿源繪製序疊放，未知上層留空；形狀未知時只保留已知輪廓。紫色為目的占格，越界時紅色；窗口外不畫，不裁切保存集合。未知形狀不猜填；原位置仍在底圖，移除後的下層及完整合法性仍須服務校驗。</template><template v-else>須有非零整數位移、已選實例及已讀窗口；鎖定、換層或其它工具拖曳期間不顯示。</template></p>
    <Teleport to="body">
      <div v-if="toolMenu" class="window-tool-backdrop" @pointerdown.self.prevent @click.self="closeToolMenu" @contextmenu.prevent.self="closeToolMenu">
        <div id="map-window-tool-menu" ref="toolMenuElement" role="menu" aria-label="圖塊窗口工具" :style="{ left: toolMenu.x + 'px', top: toolMenu.y + 'px' }" @keydown.stop="toolMenuKey" @focusout="toolMenuFocusOut" @contextmenu.prevent>
          <button v-for="[value, label, disabled] in tools" :key="value" type="button" role="menuitemradio" tabindex="-1" :data-window-tool="value" :aria-checked="mode === value" :disabled="disabled" @click="chooseTool(value)">{{ label }}</button>
        </div>
      </div>
    </Teleport>
    <details v-if="model.decorationSelection?.ready" id="map-window-selection-result">
      <summary>修訂 {{ model.decorationSelection.value.draftRevision }}：累計完整裝飾 {{ model.decorationSelection.selectedIds.length }} 項（只讀）</summary>
      <p id="map-window-selection-last">最後查詢：({{ model.decorationSelection.value.x }}, {{ model.decorationSelection.value.y }}) {{ model.decorationSelection.value.width }}×{{ model.decorationSelection.value.height }}格，命中 {{ model.decorationSelection.value.instanceIds.length }} 項；累計集合可包含此前矩形。</p>
      <ul><li v-for="id in model.decorationSelection.selectedIds" :key="id">{{ id }}</li></ul>
    </details>
  </section>
</template>
<style scoped>
#map-window-shift-status { height: 4em; overflow: auto; }
#map-window-pick-status { height: 3em; overflow: auto; }
#map-window-pick-outline { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; fill: #217bce22; stroke: #217bce; stroke-width: 0.1; }
#map-window-shift-preview { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; fill: #8246c022; stroke: #8246c0; stroke-width: 0.1; }
#map-window-shift-preview.outside { fill: #ed403322; stroke: #af2018; }
.map-window-surface { position: relative; width: max-content; overflow: hidden; }
.window-tool-backdrop { position: fixed; inset: 0; z-index: 2000; }
#map-window-tool-menu { position: fixed; max-width: calc(100vw - 8px); max-height: calc(100vh - 8px); overflow: auto; padding: 4px; background: #fff; border: 1px solid #768274; box-shadow: 0 2px 10px #0004; }
#map-window-tool-menu button { display: block; width: 100%; padding: 8px; text-align: left; border: 0; background: transparent; color: #203020; }
#map-window-tool-menu button[aria-checked="true"] { background: #e5efe1; }
#map-window-tool-menu button:focus-visible { outline: 2px solid #4a7828; outline-offset: -2px; }
#map-window-tool-menu button:disabled { color: #777; }
#map-window-shift-picture,
#map-window-placement-picture { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; image-rendering: pixelated; opacity: 0.7; }
#map-window-placement-preview { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; fill: #58c87844; stroke: #146838; stroke-width: 0.08; }
#map-window-placement-preview.outside { fill: #ed403344; stroke: #af2018; }
.placing #map-window-inspection { height: 3em; overflow: auto; }
.placing #map-window-placement-feedback { height: 5em; overflow: auto; }
.placing #map-window-placement-feedback p { margin: 0; }
#map-window-canvas.placing,
#map-window-canvas.selecting { touch-action: none; cursor: crosshair; }
#map-window-canvas.panning { touch-action: none; cursor: grab; }
#map-window-canvas.panning:active { cursor: grabbing; }
#map-window-pan-preview { display: block; min-height: 1.5em; }
#map-window-selection-box { position: absolute; box-sizing: border-box; border: 2px solid #ffd65a; pointer-events: none; }
#map-window-selection-result { max-height: 180px; overflow: auto; }
.map-window-viewport { overflow: auto; max-height: 512px; max-width: 100%; border: 1px solid #768274; }
#map-window-canvas { display: block; width: auto; height: auto; max-width: none; border: 0; padding: 0; image-rendering: pixelated; }
</style>
