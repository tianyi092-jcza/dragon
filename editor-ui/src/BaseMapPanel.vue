<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElButton, ElButtonGroup } from 'element-plus/es/components/button/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElCard } from 'element-plus/es/components/card/index.mjs';
import { ElSelect } from 'element-plus/es/components/select/index.mjs';
import { ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import WorkspaceIcon from './WorkspaceIcon.vue';
const props = defineProps({ model: { type: Object, required: true }, actions: { type: Object, required: true }, busy: Boolean });
const checks = computed(() => (props.model.saveReport?.steps || []).map((label, i) => {
  const { index, state } = props.model.saveReport;
  if (i < index) return `已完成：${label}`;
  if (i > index) return `${state === 'running' ? '等待中' : '未執行'}：${label}`;
  return `${({ running: '進行中', unknown: '結果待確認', failed: '失敗' })[state]}：${label}`;
}));
const canvas = ref(null), host = ref(null), album = ref(null), sentinel = ref(null), floating = ref(null), menu = ref(null);
const catalogCategory = ref('mountain'), loadedCount = ref(24), floatingPosition = ref(null), contextPosition = ref(null);
const panLocked = ref(false), selectionBox = ref(null);
let rightGesture = false;
const preferredCityId = ref('');
const bindingPending = ref(false);
const bindCityId = computed({
  get() {
    const choices = props.model.unboundCities || [];
    return choices.some(city => city.cityId === preferredCityId.value) ? preferredCityId.value : choices[0]?.cityId || '';
  },
  set(id) { preferredCityId.value = id; },
});
const notice = ref('');
let objectDragging = false, shiftSelect = false;
const labels = { base: '底圖', decor: '裝飾', roads: '道路', cities: '據點' };
const rows = computed(() => (props.model.catalogItems || []).filter(row => row.category === catalogCategory.value));
const visibleRows = computed(() => rows.value.slice(0, loadedCount.value));
const locked = computed(() => props.busy || props.model.locked || props.model.atlasLoading || Boolean(props.model.atlasError));
const placementLocked = computed(() => locked.value || props.model.layers.some(layer => layer.id === 'decor' && (layer.locked || !layer.visible)));
const objectLocked = computed(() => placementLocked.value || props.model.selected?.layer !== 'decor');
const orderActions = [{ name: '置頂', icon: 'to-top', direction: 'top' }, { name: '下移一層', icon: 'layer-down', direction: -1 }, { name: '上移一層', icon: 'layer-up', direction: 1 }, { name: '置底', icon: 'to-bottom', direction: 'bottom' }];
const multiCount = computed(() => props.model.multi?.length ?? 0);
const groupDisabled = computed(() => placementLocked.value || multiCount.value < 2);
const ungroupDisabled = computed(() => placementLocked.value || (multiCount.value === 0 && !props.model.selectedGroup && props.model.selected?.layer !== 'decor'));
const deleteDisabled = computed(() => {
  const layer = props.model.selected?.layer;
  if (multiCount.value || layer === 'decor' || layer === 'group' && props.model.selected.captureAllowed) return placementLocked.value;
  return locked.value || !['cities', 'roads'].includes(layer) || props.model.layers.some(row => row.id === layer && (row.locked || !row.visible));
});
let observer, lazyObserver, pointer = null, floatingPointer = null, materialPointer = null, materialKeyboard = null;
function cancelMaterial() {
  materialPointer = null;
  materialKeyboard = null;
  props.actions.cancelPlacement();
}
function materialDown(event, materialId) {
  if (event.button !== 0 || placementLocked.value) return;
  event.preventDefault();
  cancelMaterial();
  contextPosition.value = null;
  materialPointer = { id: event.pointerId, materialId, x: event.clientX, y: event.clientY, moved: false };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function materialMove(event) {
  if (!materialPointer || materialPointer.id !== event.pointerId) return;
  if (placementLocked.value) { cancelMaterial(); return; }
  if (Math.hypot(event.clientX - materialPointer.x, event.clientY - materialPointer.y) > 3) materialPointer.moved = true;
  if (!materialPointer.moved) return;
  const rect = canvas.value.getBoundingClientRect();
  props.actions.previewPlacement(materialPointer.materialId, event.clientX - rect.left, event.clientY - rect.top);
}
function materialUp(event) {
  if (!materialPointer || materialPointer.id !== event.pointerId) return;
  materialMove(event);
  const commit = materialPointer?.moved && !placementLocked.value;
  materialPointer = null;
  if (commit) props.actions.commitPlacement();
  else props.actions.cancelPlacement();
}
function startMaterialKeyboard(event, materialId) {
  if (!['Enter', ' '].includes(event.key) || event.repeat || placementLocked.value) return;
  event.preventDefault();
  cancelMaterial();
  contextPosition.value = null;
  canvas.value.focus({ preventScroll: true });
  materialKeyboard = { materialId, origin: event.currentTarget, x: canvas.value.clientWidth / 2, y: canvas.value.clientHeight / 2 };
  props.actions.previewPlacement(materialId, materialKeyboard.x, materialKeyboard.y);
}
function moveMaterialKeyboard(event) {
  const key = event.key.toLowerCase();
  if (event.key === 'Delete' && !event.repeat && !materialKeyboard && !pointer && !deleteDisabled.value) {
    event.preventDefault(); void askRemove(); return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && ['c', 'v'].includes(key)) {
    event.preventDefault();
    if (!event.repeat && !locked.value && !materialKeyboard && !pointer && !contextPosition.value) void props.actions.command(key === 'c' ? 'cell-copy' : 'cell-paste');
    return;
  }
  if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); void openContext(); return; }
  if (!materialKeyboard || placementLocked.value) return;
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (direction) {
    event.preventDefault();
    materialKeyboard.x += direction[0] * 16 * props.model.zoom;
    materialKeyboard.y += direction[1] * 16 * props.model.zoom;
    props.actions.previewPlacement(materialKeyboard.materialId, materialKeyboard.x, materialKeyboard.y);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (event.repeat) return;
    const origin = materialKeyboard.origin;
    materialKeyboard = null;
    props.actions.commitPlacement();
    origin.focus({ preventScroll: true });
  }
}
function cancelKey(event) {
  if (event.key !== 'Escape') return;
  if (pointer?.right) { event.preventDefault(); pointer = null; selectionBox.value = null; }
  if (objectDragging) { event.preventDefault(); pointer = null; objectDragging = false; props.actions.cancelObjectMove(); }
  if (contextPosition.value) { event.preventDefault(); contextPosition.value = null; canvas.value.focus({ preventScroll: true }); }
  if (materialPointer || materialKeyboard) {
    event.preventDefault();
    const origin = materialKeyboard?.origin;
    cancelMaterial();
    origin?.focus({ preventScroll: true });
  }
}
watch(placementLocked, () => { cancelMaterial(); if (!props.model.selectedBinding) contextPosition.value = null; });
watch([() => props.model.readRevision, () => props.model.zoom, catalogCategory], () => { cancelMaterial(); contextPosition.value = null; });
watch([() => props.model.selected?.layer, () => props.model.selected?.id], () => { contextPosition.value = null; });
watch(catalogCategory, () => { loadedCount.value = 24; album.value.scrollTop = 0; });
watch([loadedCount, catalogCategory, () => rows.value.length], async () => {
  await nextTick();
  lazyObserver?.disconnect();
  if (sentinel.value && loadedCount.value < rows.value.length) lazyObserver?.observe(sentinel.value);
});
function categoryKey(event, index) {
  const count = props.model.catalogCategories.length;
  const next = { ArrowRight: (index + 1) % count, ArrowLeft: (index + count - 1) % count, Home: 0, End: count - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  catalogCategory.value = props.model.catalogCategories[next].id;
  event.currentTarget.parentElement.children[next].focus();
}
function down(event) {
  contextPosition.value = null;
  rightGesture = event.button === 2;
  if (props.busy || (event.button !== 0 && !rightGesture)) return;
  notice.value = '';
  cancelMaterial();
  props.actions.cancelObjectMove();
  objectDragging = false; shiftSelect = false;
  pointer = { id: event.pointerId, x: event.offsetX, y: event.offsetY, startX: event.offsetX, startY: event.offsetY, moved: false };
  canvas.value.setPointerCapture(event.pointerId);
  canvas.value.focus({ preventScroll: true });
  if (rightGesture) { pointer.right = true; return; }
  if (event.shiftKey) { shiftSelect = true; return; }
  // 只有锁定地图才允许拖动已选对象；未锁定一律平移地图。
  if (!panLocked.value) return;
  if (props.model.multi && props.model.multi.length) {
    try { objectDragging = props.actions.beginMultiMove(event.offsetX, event.offsetY) === true; } catch { objectDragging = false; }
    return;
  }
  if (props.model.selected && ['decor', 'group', 'roads', 'cities'].includes(props.model.selected.layer)) {
    try { objectDragging = props.actions.beginObjectMove(event.offsetX, event.offsetY) === true; } catch { objectDragging = false; }
  }
}
function move(event) {
  if (!pointer || props.busy || pointer.id !== event.pointerId) return;
  if (Math.hypot(event.offsetX - pointer.startX, event.offsetY - pointer.startY) > 3) pointer.moved = true;
  if (pointer.right && pointer.moved) {
    selectionBox.value = { left: `${Math.min(pointer.startX,event.offsetX)}px`, top: `${Math.min(pointer.startY,event.offsetY)}px`, width: `${Math.abs(pointer.startX-event.offsetX)}px`, height: `${Math.abs(pointer.startY-event.offsetY)}px` };
  } else if (!pointer.right && pointer.moved) {
    if (!panLocked.value) props.actions.pan(pointer.x - event.offsetX, pointer.y - event.offsetY);
    else if (objectDragging) props.actions.previewObjectMove(event.offsetX, event.offsetY);
  }
  pointer.x = event.offsetX; pointer.y = event.offsetY;
}
function up(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (pointer.right) {
    move(event);
    const { moved, startX, startY } = pointer;
    pointer = null; selectionBox.value = null;
    if (props.busy) return;
    if (!moved) void openContext(event);
    else props.actions.toggleMulti(startX, startY, event.offsetX, event.offsetY);
    return;
  }
  if (shiftSelect) {
    shiftSelect = false;
    if (!pointer.moved && !props.busy) {
      const result = props.actions.toggleMulti(event.offsetX, event.offsetY);
      if (result && !result.toggled && result.rejected === 'road') notice.value = '道路不能参与组合';
      else if (result && !result.toggled && result.rejected === 'city') notice.value = '据点不能参与组合';
      if (result && result.toggled && !(result.multi && result.multi.length)) contextPosition.value = null;
    }
    pointer = null; return;
  }
  if (objectDragging) {
    objectDragging = false;
    if (pointer.moved) { props.actions.commitObjectMove(); pointer = null; return; }
    // 无位移的按下即普通单击：先取消拖拽态，再走 pick，落在已选对象上正好切换取消选中。
    props.actions.cancelObjectMove();
  }
  // 单击切换选中与地图锁定无关；只有锁定才允许拖动已选对象。
  if (!pointer.moved && !props.busy) { props.actions.pick(event.offsetX, event.offsetY); notice.value = ''; }
  pointer = null;
}
function constrainFloating() {
  if (!host.value || !floating.value) return;
  const maxX = Math.max(0, host.value.clientWidth - floating.value.offsetWidth - 8);
  const maxY = Math.max(0, host.value.clientHeight - floating.value.offsetHeight - 8);
  if (floatingPosition.value) floatingPosition.value = { x: Math.max(0, Math.min(maxX, floatingPosition.value.x)), y: Math.max(0, Math.min(maxY, floatingPosition.value.y)) };
}
function floatingDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  cancelMaterial();
  const rect = floating.value.getBoundingClientRect(), bounds = host.value.getBoundingClientRect();
  floatingPosition.value = { x: rect.left - bounds.left, y: rect.top - bounds.top };
  floatingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function floatingMove(event) {
  if (!floatingPointer || floatingPointer.id !== event.pointerId) return;
  floatingPosition.value = { x: floatingPosition.value.x + event.clientX - floatingPointer.x, y: floatingPosition.value.y + event.clientY - floatingPointer.y };
  floatingPointer.x = event.clientX; floatingPointer.y = event.clientY;
  constrainFloating();
}
function floatingKey(event) {
  const direction = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
  if (!direction) return;
  event.preventDefault();
  const rect = floating.value.getBoundingClientRect(), bounds = host.value.getBoundingClientRect();
  floatingPosition.value = { x: rect.left - bounds.left + direction[0], y: rect.top - bounds.top + direction[1] };
  constrainFloating();
}
async function openContext(event) {
  cancelMaterial();
  if ((!props.model.selected && !(props.model.multi && props.model.multi.length)) || props.model.selected?.layer === 'base' || props.busy) return;
  const bounds = host.value.getBoundingClientRect();
  contextPosition.value = { x: event ? event.clientX - bounds.left : bounds.width / 2, y: event ? event.clientY - bounds.top : bounds.height / 2 };
  await nextTick();
  if (!menu.value) return;
  contextPosition.value = { x: Math.max(0, Math.min(contextPosition.value.x, bounds.width - menu.value.offsetWidth)), y: Math.max(0, Math.min(contextPosition.value.y, bounds.height - menu.value.offsetHeight)) };
  menu.value.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}
function dismissContext(event) { if (!menu.value?.contains(event.target) && !event.target.closest('.base-map-bind-options')) contextPosition.value = null; }
async function askRemove() {
  if (deleteDisabled.value) return;
  const { selected, multi, gameId, readRevision } = props.model;
  const objects = multi?.length ? multi : [selected];
  const names = (multi?.length ? props.model.multiNames : [selected.name || selected.id]).map(name => `「${name}」`).join('、');
  const target = objects.length === 1 ? names : `${names}${objects.length > 3 ? '等' : ''}（共 ${objects.length} 件）`;
  contextPosition.value = null;
  const confirmed = await ElMessageBox.confirm(`是否刪除${target}？`, '刪除地圖物件', {
    type: 'warning', confirmButtonText: '確認刪除', cancelButtonText: '取消', closeOnClickModal: false,
  }).then(() => true, () => false);
  if (confirmed && !deleteDisabled.value && props.model.gameId === gameId && props.model.readRevision === readRevision &&
    props.model.selected?.id === selected?.id && JSON.stringify(props.model.multi) === JSON.stringify(multi)) runObjectCommand(!multi?.length && ['cities', 'roads'].includes(selected?.layer) ? 'map-object-remove' : 'decoration-remove');
}
function runObjectCommand(op, fields) { contextPosition.value = null; bindCityId.value = ''; props.actions.command(op, fields); }
async function runExtent(side, delta) {
  notice.value = '';
  const names = { north: '北', south: '南', west: '西', east: '東' };
  const unit = side === 'west' || side === 'east' ? '列' : '行';
  const confirmed = await ElMessageBox.confirm(
    delta === 1 ? `沿${names[side]}側目前的邊緣延伸一${unit}地形（不複製道路、橋、城門或據點）？預覽後須按保存寫入，撤銷可還原。` : `縮回${names[side]}側新增的一${unit}？跨界裝飾將整件移除、據點只解綁不刪檔、裁切道路列明待修；預覽與紅字診斷確認影響後再保存，撤銷可還原。`,
    delta === 1 ? `${names[side]}側加一${unit}` : `${names[side]}側縮回一${unit}`,
    { type: 'info', confirmButtonText: '確認', cancelButtonText: '取消', closeOnClickModal: false }).then(() => true, () => false);
  if (confirmed) runObjectCommand('map-extent', delta === 1 ? { side, delta, fill: 'edge' } : { side, delta });
}
const extentDirections = [ ['north', 'N', '北', '行'], ['south', 'S', '南', '行'], ['west', 'W', '西', '列'], ['east', 'E', '東', '列'] ];
const extentQuota = (side) => props.model.extentSides?.[side] ?? null;
async function runGroup() {
  contextPosition.value = null;
  const result = await props.actions.groupSelection();
  if (result && result.error === 'at-least-two') notice.value = '至少选择两个装饰才能组合';
  else if (result && result.error) notice.value = '当前状态不可组合';
  else if (result && result.grouped) notice.value = '已合成为独立对象（未保存，撤销可还原）';
}
async function runUngroup() {
  contextPosition.value = null; notice.value = '';
  const result = await props.actions.ungroupSelection();
  if (result && result.noop) notice.value = '所选已是独立单格，无需拆散';
  else if (result && result.error) notice.value = '当前状态不可拆散';
  else if (result && result.ungrouped) notice.value = `已拆散${result.ungrouped.length}个组合${result.split ? `，${result.split}个装饰片段已拆为独立单格` : ''}（未保存，撤销可还原）`;
}
async function runBindToggle() {
  const binding = props.model.selectedBinding;
  if (!binding || locked.value || bindingPending.value || (!binding.cityId && !bindCityId.value)) return;
  bindingPending.value = true;
  try {
    if (binding.cityId) {
      preferredCityId.value = binding.cityId;
      await props.actions.command('city-unbind', { pieceId: binding.pieceId });
    } else await props.actions.command('city-bind', { pieceId: binding.pieceId, cityId: bindCityId.value });
  } catch (error) { notice.value = error.message; }
  finally { bindingPending.value = false; }
}
watch(() => props.model.selectedBinding?.pieceId, () => { preferredCityId.value = ''; });
onMounted(() => {
  props.actions.attach(canvas.value, null);
  observer = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    cancelMaterial();
    if (contextPosition.value && menu.value && props.model.selectedBinding) {
      contextPosition.value = { x: Math.max(0, Math.min(contextPosition.value.x, width - menu.value.offsetWidth)), y: Math.max(0, Math.min(contextPosition.value.y, height - menu.value.offsetHeight)) };
    } else contextPosition.value = null;
    props.actions.resize(width, height);
    constrainFloating();
  });
  observer.observe(host.value);
  lazyObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadedCount.value = Math.min(rows.value.length, loadedCount.value + 24);
  }, { root: album.value, rootMargin: '64px' });
  if (sentinel.value && loadedCount.value < rows.value.length) lazyObserver.observe(sentinel.value);
  window.addEventListener('keydown', cancelKey);
  window.addEventListener('blur', cancelMaterial);
  document.addEventListener('pointerdown', dismissContext);
});
onBeforeUnmount(() => {
  cancelMaterial();
  window.removeEventListener('keydown', cancelKey);
  window.removeEventListener('blur', cancelMaterial);
  document.removeEventListener('pointerdown', dismissContext);
  observer?.disconnect(); lazyObserver?.disconnect();
  props.actions.attach(null, null); props.actions.formDirty(false);
});
</script>

<template>
  <section :id="model.gameScoped ? 'game-map-editor' : 'base-map-editor'" class="base-map-panel">
    <div class="base-map-body">
    <header class="base-map-toolbar" aria-label="地圖工具">
      <div class="base-map-controls">
      <ElButton :disabled="busy" title="重新讀取地圖，取消未保存修改" @click="notice = ''; actions.reload()">載入</ElButton>
      <ElButton v-if="!model.gameScoped && model.loaded && !model.exists" :disabled="busy" title="首次建立系統基礎地圖" @click="actions.initialize()">建立</ElButton>
      <ElButton :disabled="locked || !model.dirty" title="保存並重新讀取地圖" @click="notice = ''; actions.save()">保存</ElButton>
      <ElButton :disabled="locked || !model.dirty" title="撤銷上一步修改" @click="notice = ''; actions.undo()">撤銷</ElButton>
      <slot name="tools" />
      <ElButton :disabled="!model.exists" title="縮放至顯示整張地圖" @click="actions.fit()">全圖</ElButton>
      <ElButton :disabled="!model.exists" title="放大地圖" @click="actions.zoom(1.25)">放大</ElButton>
      <ElButton :disabled="!model.exists" title="原始比例：每格16×16像素，保持視野中心" @click="actions.zoom(1 / model.zoom)">100%</ElButton>
      <ElButton :disabled="!model.exists" title="縮小地圖" @click="actions.zoom(0.8)">縮小</ElButton>
      <ElButton :disabled="busy || !model.exists" aria-label="鎖圖" :aria-pressed="panLocked" :title="panLocked ? '已鎖圖：拖動已選物件；點擊解鎖' : '未鎖圖：拖動平移；點擊鎖定後可拖動已選物件'" @click="panLocked = !panLocked; pointer = null; objectDragging = false; actions.cancelObjectMove(); actions.cancelPlacement()"><WorkspaceIcon :name="panLocked ? 'locked' : 'unlocked'" /></ElButton>
      <ElCheckbox :model-value="model.gridVisible !== false" @update:model-value="actions.grid($event)">網格</ElCheckbox>
        <span class="extent-label">地圖擴展</span>
        <div v-for="[side, key, name, unit] in extentDirections" :key="side" class="extent-direction" role="group" :aria-label="`${name}側擴縮`">
          <span>{{ name }}</span>
          <ElButtonGroup>
            <ElButton :aria-label="`${name}增`" :title="`向${name}延伸一${unit}；已用 ${extentQuota(key) ?? '?'}／20 格`" :disabled="locked || !model.exists || (extentQuota(key) ?? 0) >= 20" @click="runExtent(side, 1)"><WorkspaceIcon name="plus" /></ElButton>
            <ElButton :aria-label="`${name}縮`" :title="`縮回${name}側一${unit}；已用 ${extentQuota(key) ?? '?'}／20 格`" :disabled="locked || !model.exists || (extentQuota(key) ?? 0) <= 0" @click="runExtent(side, -1)"><WorkspaceIcon name="minus" /></ElButton>
          </ElButtonGroup>
        </div>
      </div>
      <span class="map-status" role="status" aria-live="polite" >{{ model.atlasLoading ? '圖集載入中…' : notice || (model.saveReport ? ({ success: '保存成功', failed: model.uncertain ? '重讀失敗' : '保存失敗', unknown: '結果待確認', running: '保存中…' })[model.saveReport.state] : model.message) }}</span>
    </header>
    <div class="base-map-workspace">
    <ElDialog :model-value="model.saveReport?.state === 'running'" title="地圖保存檢查" width="min(calc(32rem + 80px), 90vw)" align-center append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
      <div role="status" aria-live="polite"><strong>{{ model.saveReport?.summary }}</strong><ol><li v-for="line in checks" :key="line">{{ line }}</li></ol></div>
    </ElDialog>
    <details v-if="model.saveReport && model.saveReport.state !== 'running'" class="map-save-report" :open="model.saveReport.state !== 'success'">
      <summary>{{ model.saveReport.state === 'success' ? '查看保存詳情' : '查看原因與處理方式' }}</summary>
      <p v-if="model.saveReport.state === 'success'">地圖已保存並重新載入。</p>
      <p v-for="(problem, index) in model.serverProblems" :key="index">{{ problem.message }}</p>
      <p v-if="model.uncertain">請先重新讀取地圖，確認目前版本；不要重送同一批修改。</p>
      <p v-else-if="model.saveReport.state === 'failed'">這次沒有寫入地圖。編輯內容仍保留，請修正後再保存。</p>
    </details>
    <div v-if="model.atlasError" class="base-map-problems" role="alert"><span>{{ model.atlasError }}</span><ElButton @click="actions.retryAtlas()">重試</ElButton></div>
    <div v-if="model.diagnostics?.length" class="base-map-problems" role="alert"><div v-for="problem in model.diagnostics" :key="problem.index"><span>{{ problem.message }}</span><ElButton :disabled="!Number.isInteger(problem.x) || !Number.isInteger(problem.y)" title="定位底圖格" @click="actions.focusDiagnostic(problem.index)">定位</ElButton></div></div>
      <div ref="host" class="base-map-canvas-host">
        <canvas ref="canvas" class="base-map-canvas" tabindex="0" title="右鍵拖曳框選物件，Delete 確認刪除；Shift+點擊增減物件，Ctrl+C 複製，Ctrl+V 貼上。" aria-description="點選單格、Shift 多選或右鍵框選後按 Ctrl+C 複製圖塊，再點選目標格按 Ctrl+V 貼上。選取素材後以方向鍵逐格移動，Enter或空白鍵放置，Esc取消；選取地圖物件後右鍵或Shift+F10開啟操作。" @keydown="moveMaterialKeyboard" @blur="cancelMaterial" :aria-label="model.gameScoped ? '可編輯遊戲地圖' : '可編輯基礎地圖'" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="pointer = null; selectionBox = null; objectDragging = false; actions.cancelObjectMove()" @lostpointercapture="pointer = null; selectionBox = null; objectDragging = false; actions.cancelObjectMove()" @contextmenu.prevent="!rightGesture && openContext($event)" @wheel.prevent="contextPosition = null; !busy && actions.zoom($event.deltaY < 0 ? 1.2 : 1 / 1.2, $event.offsetX, $event.offsetY)" />
        <div v-if="selectionBox" aria-hidden="true" class="base-map-selection-box" :style="selectionBox" />
        <div ref="floating" class="base-map-floating" :style="floatingPosition ? { left: `${floatingPosition.x}px`, top: `${floatingPosition.y}px`, bottom: 'auto' } : {}" aria-label="浮動圖層工具">
        <ElCard :body-style="{ padding: '4px' }">
          <div class="base-map-layer-tools">
            <ElButton text class="base-map-drag-handle" aria-label="移動圖層工具" title="拖動圖層工具；方向鍵亦可移動" @pointerdown="floatingDown" @pointermove="floatingMove" @pointerup="floatingPointer = null" @pointercancel="floatingPointer = null" @lostpointercapture="floatingPointer = null" @keydown="floatingKey"><WorkspaceIcon name="drag" /></ElButton>
            <div v-for="layer in model.layers" :key="layer.id" class="base-map-layer">
              <span>{{ labels[layer.id] }}</span>
              <ElButton text :aria-label="`${layer.visible ? '隱藏' : '顯示'}${labels[layer.id]}`" :title="`${layer.visible ? '隱藏' : '顯示'}${labels[layer.id]}`" :aria-pressed="layer.visible" @click="actions.layer(layer.id, 'visible', !layer.visible)"><WorkspaceIcon :name="layer.visible ? 'visible' : 'hidden'" /></ElButton>
              <ElButton text :aria-label="`${layer.locked ? '解鎖' : '鎖定'}${labels[layer.id]}`" :title="`${layer.locked ? '解鎖' : '鎖定'}${labels[layer.id]}`" :aria-pressed="layer.locked" @click="actions.layer(layer.id, 'locked', !layer.locked)"><WorkspaceIcon :name="layer.locked ? 'locked' : 'unlocked'" /></ElButton>
            </div>
          </div>
        </ElCard>
        </div>
        <div v-if="contextPosition && (model.selected || (model.multi && model.multi.length))" ref="menu" class="base-map-context" :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }" role="dialog" aria-label="物件操作" @contextmenu.prevent>
        <ElCard :body-style="{ padding: '12px' }">
          <div class="base-map-object-info"><template v-if="model.multi && model.multi.length"><strong>组合</strong><span>共{{ model.multi.length }}件</span><span>Shift+单击切换增减</span></template><template v-else><strong>{{ model.selected.type || labels[model.selected.layer] || '组合' }}</strong><span>{{ model.selected.x }}, {{ model.selected.y }}</span><span class="map-object-id" :title="model.selected.id">ID：{{ model.selected.id }}</span></template></div>
          <div v-if="model.selectedBinding && !model.multi?.length" class="base-map-context-actions base-map-city-bind">
            <span>綁定：</span>
            <ElSelect v-if="model.selectedBinding?.cityId" :model-value="model.selectedBinding.cityId" disabled aria-label="綁定據點下拉框"><ElOption :value="model.selectedBinding.cityId" :label="model.cities.find(c => c.cityId === model.selectedBinding.cityId)?.name || model.selectedBinding.cityId" /></ElSelect>
            <ElSelect v-else v-model="bindCityId" filterable popper-class="base-map-bind-options" :disabled="locked || bindingPending || !bindCityId" placeholder="無可綁據點" aria-label="綁定據點下拉框"><ElOption v-for="city in model.unboundCities || []" :key="city.cityId" :value="city.cityId" :label="city.name" /></ElSelect>
            <ElButton :loading="bindingPending" :disabled="locked || (!model.selectedBinding?.cityId && !bindCityId)" @click="runBindToggle()">{{ model.selectedBinding?.cityId ? '解綁' : '綁定' }}</ElButton>
          </div>
          <div class="base-map-context-actions">
            <ElButton v-for="item in orderActions" :key="item.icon" :aria-label="item.name" :title="item.name" :disabled="objectLocked" @click="runObjectCommand('decoration-reorder', { direction: item.direction })"><WorkspaceIcon :name="item.icon" /></ElButton>
          </div>
          <div class="base-map-context-actions">
            <ElButton aria-label="组合" title="组合" :disabled="groupDisabled" @click="runGroup()"><WorkspaceIcon name="group" /></ElButton>
            <ElButton aria-label="拆散" title="拆散" :disabled="ungroupDisabled" @click="runUngroup()"><WorkspaceIcon name="ungroup" /></ElButton>

            <ElButton aria-label="鎖定物件" title="鎖定物件：暫未開放" disabled><WorkspaceIcon name="locked" /></ElButton>
            <ElButton aria-label="刪除" title="刪除選取的地圖物件" :disabled="deleteDisabled" @click="askRemove()"><WorkspaceIcon name="delete" /></ElButton>
          </div>
        </ElCard>
        </div>
      </div>
    </div>
      <aside class="base-map-library">
        <div class="base-map-catalog-tabs" role="tablist" aria-label="素材分類">
          <ElButton v-for="(item, index) in model.catalogCategories" :key="item.id" role="tab" :aria-selected="catalogCategory === item.id" :type="catalogCategory === item.id ? 'primary' : 'default'" :plain="catalogCategory === item.id" @click="catalogCategory = item.id" @keydown="categoryKey($event, index)">{{ item.name }}</ElButton>
        </div>
        <div ref="album" class="base-map-material-album" :class="{ 'base-map-city-groups': catalogCategory === 'city-group' }" role="list" :aria-label="catalogCategory === 'city-group' ? '據點組素材相冊' : '原子素材相冊'" @scroll="cancelMaterial">
          <div v-for="row in visibleRows" :key="row.itemId" role="listitem" :data-tile="row.id">
            <div v-if="row.canPlace" class="base-map-material-preview" :class="{ 'base-map-city-group-preview': row.category === 'city-group' }" role="button" tabindex="0" :aria-label="`${row.name}；拖至地圖或按Enter／空白鍵開始放置`" :aria-disabled="placementLocked" @keydown="startMaterialKeyboard($event, row.id)" @pointerdown="materialDown($event, row.id)" @pointermove="materialMove" @pointerup="materialUp" @pointercancel="cancelMaterial" @lostpointercapture="cancelMaterial" @dragstart.prevent><canvas :ref="node => actions.previewMaterial(node, row.id)" :width="row.previewWidth || 32" :height="row.previewHeight || 32" :aria-label="row.name" /></div>
            <div v-else :class="row.category === 'city-group' ? 'base-map-city-group-preview' : 'base-map-atom-preview'" tabindex="0" :aria-label="`${row.name}；${row.note}`"><canvas v-if="row.available" :ref="node => actions.previewMaterial(node, row.id)" :width="row.previewWidth || 32" :height="row.previewHeight || 32" :aria-label="row.name" /><span v-else>不可用</span></div>
            <span v-if="row.category === 'city-group'">{{ row.name }}</span>
            <span>ID：{{ row.id.replace('tile-', '') }}</span>
          </div>
          <span v-if="!rows.length">此分類尚無素材。</span>
          <div v-show="loadedCount < rows.length" ref="sentinel" class="base-map-lazy-sentinel" aria-hidden="true"></div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.base-map-panel { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.base-map-toolbar { display: flex; gap: 4px; align-items: center; min-width: 0; overflow: hidden; }
.base-map-controls { display: flex; align-items: center; gap: 4px; flex: 0 1 auto; min-width: 0; overflow-x: auto; }
.base-map-controls :deep(.el-button), .base-map-controls :deep(.el-checkbox) { flex-shrink: 0; }
.base-map-controls :deep(.el-checkbox) { margin-right: 0; }
.extent-label { margin-left: 8px; white-space: nowrap; }
.extent-direction { display: inline-flex; flex: none; align-items: center; gap: 4px; }
.extent-direction + .extent-direction { margin-inline-start: 12px; }
.base-map-toolbar .map-status { flex: 0 1 auto; min-width: 120px; max-width: 240px; margin-left: auto; text-align: right; }
.base-map-panel :deep(.el-button + .el-button) { margin-left: 0; }
.map-save-report { max-height: 25%; overflow: auto; flex-shrink: 0; }
.base-map-problems { max-height: 96px; overflow: auto; flex-shrink: 0; }
.base-map-body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; grid-template-rows: auto minmax(0, 1fr); gap: 4px 8px; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.base-map-workspace { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.base-map-selection-box { position: absolute; pointer-events: none; box-sizing: border-box; border: 1px dashed white; background: rgb(40 100 180 / 20%); }
.base-map-canvas-host { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.base-map-canvas { position: absolute; width: 100%; height: 100%; touch-action: none; }
.base-map-floating { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); max-height: calc(100% - 16px); overflow: auto; }
.base-map-layer-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
/* User-approved map floating-toolbar exception: default-height square text buttons. */
.base-map-layer-tools :deep(.el-button:hover), .base-map-layer-tools :deep(.el-button:focus-visible) { border-color: var(--el-border-color); }
.base-map-layer { display: flex; align-items: center; gap: 2px; }
.base-map-drag-handle { touch-action: none; cursor: move; }
.base-map-context { position: absolute; width: 240px; max-width: 100%; max-height: 100%; overflow: auto; box-sizing: border-box; }
.map-object-id { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.base-map-object-info { display: flex; flex-direction: column; overflow-wrap: anywhere; gap: 4px; }
.base-map-context-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.base-map-city-bind { grid-template-columns: auto minmax(calc(4em + 44px), 1fr) auto; align-items: center; gap: 4px; }
.base-map-library { grid-column: 2; grid-row: 1 / -1; display: flex; flex-direction: column; gap: 8px; overflow: hidden; min-height: 0; }
.base-map-catalog-tabs { display: grid; grid-template-columns: repeat(4, auto); gap: 4px 2px; flex-shrink: 0; }
.base-map-material-album { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
.base-map-material-album > [role="listitem"] { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; }
.base-map-city-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.base-map-city-groups > [role="listitem"] { min-width: 0; text-align: center; overflow-wrap: anywhere; }
.base-map-material-album .base-map-city-group-preview { display: flex; justify-content: center; align-items: center; width: 80px; height: 80px; }
.base-map-material-album > span, .base-map-lazy-sentinel { grid-column: 1 / -1; }
.base-map-lazy-sentinel { height: 1px; }
.base-map-material-preview, .base-map-atom-preview { width: 32px; height: 32px; }
.base-map-material-preview[aria-disabled="false"] { touch-action: none; }
.base-map-material-preview[aria-disabled="false"] { cursor: grab; }
.base-map-material-preview[aria-disabled="false"]:hover, .base-map-material-preview[aria-disabled="false"]:focus-visible { outline: 2px solid #00ccff; outline-offset: 1px; }
.base-map-material-preview[aria-disabled="false"]:active { cursor: grabbing; }
.base-map-material-preview[aria-disabled="true"] { cursor: not-allowed; }
.base-map-material-preview canvas, .base-map-atom-preview canvas, .base-map-city-group-preview canvas { display: block; max-width: none; image-rendering: pixelated; }
</style>
