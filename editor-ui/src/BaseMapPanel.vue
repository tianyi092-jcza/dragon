<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElCard } from 'element-plus/es/components/card/index.mjs';
import { ElSelect } from 'element-plus/es/components/select/index.mjs';
import { ElOption } from 'element-plus/es/components/select/index.mjs';
import WorkspaceIcon from './WorkspaceIcon.vue';
const props = defineProps({ model: { type: Object, required: true }, actions: { type: Object, required: true }, busy: Boolean });
const canvas = ref(null), host = ref(null), album = ref(null), sentinel = ref(null), floating = ref(null), menu = ref(null);
const catalogCategory = ref('mountain'), loadedCount = ref(24), floatingPosition = ref(null), contextPosition = ref(null);
const panLocked = ref(false);
const bindCityId = ref('');
const notice = ref('');
let objectDragging = false, shiftSelect = false;
const labels = { base: '底圖', decor: '裝飾', roads: '道路', cities: '據點' };
const rows = computed(() => (props.model.catalogItems || []).filter(row => row.category === catalogCategory.value));
const visibleRows = computed(() => rows.value.slice(0, loadedCount.value));
const locked = computed(() => props.busy || props.model.locked || props.model.atlasLoading || Boolean(props.model.atlasError));
const placementLocked = computed(() => locked.value || props.model.layers.some(layer => layer.id === 'decor' && (layer.locked || !layer.visible)));
const objectLocked = computed(() => placementLocked.value || props.model.selected?.layer !== 'decor');
const orderActions = [{ name: '置頂', icon: 'to-top', direction: 'top' }, { name: '下移一層', icon: 'layer-down', direction: -1 }, { name: '上移一層', icon: 'layer-up', direction: 1 }, { name: '置底', icon: 'to-bottom', direction: 'bottom' }];
const futureActions = [{ name: '複製', icon: 'duplicate' }, { name: '填充', icon: 'fill' }];
const multiCount = computed(() => props.model.multi?.length ?? 0);
const groupDisabled = computed(() => placementLocked.value || multiCount.value < 2);
const ungroupDisabled = computed(() => placementLocked.value || (multiCount.value === 0 && !props.model.selectedGroup && props.model.selected?.layer !== 'decor'));
const deleteDisabled = computed(() => placementLocked.value || (multiCount.value === 0 && props.model.selected?.layer !== 'decor'));
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
  if (objectDragging) { event.preventDefault(); pointer = null; objectDragging = false; props.actions.cancelObjectMove(); }
  if (contextPosition.value) { event.preventDefault(); contextPosition.value = null; canvas.value.focus({ preventScroll: true }); }
  if (materialPointer || materialKeyboard) {
    event.preventDefault();
    const origin = materialKeyboard?.origin;
    cancelMaterial();
    origin?.focus({ preventScroll: true });
  }
}
watch([placementLocked, () => props.model.readRevision, () => props.model.zoom, catalogCategory], () => { cancelMaterial(); contextPosition.value = null; });
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
  if (props.busy || event.button !== 0) return;
  notice.value = '';
  cancelMaterial();
  props.actions.cancelObjectMove();
  objectDragging = false; shiftSelect = false;
  pointer = { id: event.pointerId, x: event.offsetX, y: event.offsetY, startX: event.offsetX, startY: event.offsetY, moved: false };
  canvas.value.setPointerCapture(event.pointerId);
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
  if (pointer.moved) {
    if (!panLocked.value) props.actions.pan(pointer.x - event.offsetX, pointer.y - event.offsetY);
    else if (objectDragging) props.actions.previewObjectMove(event.offsetX, event.offsetY);
  }
  pointer.x = event.offsetX; pointer.y = event.offsetY;
}
function up(event) {
  if (!pointer) return;
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
function dismissContext(event) { if (!menu.value?.contains(event.target)) contextPosition.value = null; }
function runObjectCommand(op, fields) { contextPosition.value = null; bindCityId.value = ''; props.actions.command(op, fields); }
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
function runBindToggle() {
  const binding = props.model.selectedBinding;
  if (!binding || props.busy) return;
  if (binding.cityId) runObjectCommand('city-unbind', { pieceId: binding.pieceId });
  else if (bindCityId.value) runObjectCommand('city-bind', { pieceId: binding.pieceId, cityId: bindCityId.value });
}
watch([() => props.model.selectedBinding?.pieceId, () => props.model.selectedBinding?.cityId], () => { bindCityId.value = ''; });
onMounted(() => {
  props.actions.attach(canvas.value, null);
  observer = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    cancelMaterial(); contextPosition.value = null;
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
      <ElCheckbox :model-value="model.gridVisible !== false" @update:model-value="actions.grid($event)">網格</ElCheckbox>
      <ElButton :disabled="!model.exists" title="縮放至顯示整張地圖" @click="actions.fit()">全圖</ElButton>
      <ElButton :disabled="!model.exists" title="放大地圖" @click="actions.zoom(1.25)">放大</ElButton>
      <ElButton :disabled="!model.exists" title="原始比例：每格16×16像素，保持視野中心" @click="actions.zoom(1 / model.zoom)">100%</ElButton>
      <ElButton :disabled="!model.exists" title="縮小地圖" @click="actions.zoom(0.8)">縮小</ElButton>
      <ElButton :disabled="busy || !model.exists" aria-label="鎖圖" :aria-pressed="panLocked" :title="panLocked ? '已鎖圖：拖動已選物件；點擊解鎖' : '未鎖圖：拖動平移；點擊鎖定後可拖動已選物件'" @click="panLocked = !panLocked; pointer = null; objectDragging = false; bindCityId = ''; actions.cancelObjectMove(); actions.cancelPlacement()"><WorkspaceIcon :name="panLocked ? 'locked' : 'unlocked'" /></ElButton>
      <ElButton v-for="item in futureActions" :key="item.icon" :aria-label="item.name" :title="`${item.name}：暫未開放`" disabled><WorkspaceIcon :name="item.icon" /></ElButton>
      </div>
      <span class="map-status" role="status" aria-live="polite" :title="notice || model.message">{{ model.atlasLoading ? '圖集载入中…' : notice || model.message }}</span>
    </header>
    <div class="base-map-workspace">
    <div v-if="model.atlasError" class="base-map-problems" role="alert"><span>{{ model.atlasError }}</span><ElButton @click="actions.retryAtlas()">重試</ElButton></div>
    <div v-if="model.serverProblems?.length" class="base-map-problems" role="alert"><p v-for="(problem, index) in model.serverProblems" :key="index">{{ problem.message }}</p></div>
    <div v-if="model.diagnostics?.length" class="base-map-problems" role="alert"><div v-for="problem in model.diagnostics" :key="problem.index"><span>{{ problem.message }}</span><ElButton :disabled="!Number.isInteger(problem.x) || !Number.isInteger(problem.y)" title="定位底圖格" @click="actions.focusDiagnostic(problem.index)">定位</ElButton></div></div>
      <div ref="host" class="base-map-canvas-host">
        <canvas ref="canvas" class="base-map-canvas" tabindex="0" aria-description="選取素材後以方向鍵逐格移動，Enter或空白鍵放置，Esc取消；選取地圖物件後右鍵或Shift+F10開啟操作。" @keydown="moveMaterialKeyboard" @blur="cancelMaterial" :aria-label="model.gameScoped ? '可編輯遊戲地圖' : '可編輯基礎地圖'" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="pointer = null; objectDragging = false; actions.cancelObjectMove()" @lostpointercapture="pointer = null; objectDragging = false; actions.cancelObjectMove()" @contextmenu.prevent="openContext($event)" @wheel.prevent="contextPosition = null; !busy && actions.zoom($event.deltaY < 0 ? 1.2 : 1 / 1.2, $event.offsetX, $event.offsetY)" />
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
          <div class="base-map-object-info"><template v-if="model.multi && model.multi.length"><strong>组合</strong><span>共{{ model.multi.length }}件</span><span>Shift+单击切换增减</span></template><template v-else><strong>{{ model.selected.type || labels[model.selected.layer] || '组合' }}</strong><span>{{ model.selected.x }}, {{ model.selected.y }}</span><span>ID：{{ model.selected.id }}</span><span v-if="model.selected.layer === 'cities'">綁定：{{ model.selectedBinding?.cityId ? (model.cities.find(c => c.cityId === model.selectedBinding.cityId)?.name || model.selectedBinding.cityId) : '未綁定' }}</span></template></div>
          <div v-if="model.selected && model.selected.layer === 'cities'" class="base-map-context-actions base-map-city-bind">
            <ElSelect v-model="bindCityId" filterable :disabled="busy || locked || panLocked || Boolean(model.selectedBinding?.cityId)" placeholder="未綁定據點列表" aria-label="綁定據點下拉框"><ElOption v-for="city in model.unboundCities || []" :key="city.cityId" :value="city.cityId" :label="`${city.name}［${city.cityId}］`" /></ElSelect>
            <ElButton :disabled="busy || locked || panLocked || (!model.selectedBinding?.cityId && !bindCityId)" @click="runBindToggle()">{{ model.selectedBinding?.cityId ? '解綁' : '綁定' }}</ElButton>
          </div>
          <div class="base-map-context-actions">
            <ElButton v-for="item in orderActions" :key="item.icon" :aria-label="item.name" :title="item.name" :disabled="objectLocked" @click="runObjectCommand('decoration-reorder', { direction: item.direction })"><WorkspaceIcon :name="item.icon" /></ElButton>
          </div>
          <div class="base-map-context-actions">
            <ElButton aria-label="组合" title="组合" :disabled="groupDisabled" @click="runGroup()"><WorkspaceIcon name="group" /></ElButton>
            <ElButton aria-label="拆散" title="拆散" :disabled="ungroupDisabled" @click="runUngroup()"><WorkspaceIcon name="ungroup" /></ElButton>

            <ElButton aria-label="鎖定物件" title="鎖定物件：暫未開放" disabled><WorkspaceIcon name="locked" /></ElButton>
            <ElButton aria-label="刪除" title="刪除選取的完整裝飾物件" :disabled="deleteDisabled" @click="runObjectCommand('decoration-remove')"><WorkspaceIcon name="delete" /></ElButton>
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
          <span v-if="catalogCategory === 'city-group'">目前僅供預覽，尚未開放放置。</span>
          <div v-for="row in visibleRows" :key="row.itemId" role="listitem" :data-tile="row.id">
            <div v-if="row.canPlace" class="base-map-material-preview" role="button" tabindex="0" :aria-label="`${row.name}；拖至地圖或按Enter／空白鍵開始放置`" :aria-disabled="placementLocked" @keydown="startMaterialKeyboard($event, row.id)" @pointerdown="materialDown($event, row.id)" @pointermove="materialMove" @pointerup="materialUp" @pointercancel="cancelMaterial" @lostpointercapture="cancelMaterial" @dragstart.prevent><canvas :ref="node => actions.previewMaterial(node, row.id)" width="32" height="32" :aria-label="row.name" /></div>
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
.base-map-toolbar .map-status { flex: 0 1 auto; min-width: 120px; max-width: 240px; margin-left: auto; text-align: right; }
.base-map-panel :deep(.el-button + .el-button) { margin-left: 0; }
.base-map-problems { max-height: 96px; overflow: auto; flex-shrink: 0; }
.base-map-body { display: grid; grid-template-columns: minmax(0, 1fr) 260px; grid-template-rows: auto minmax(0, 1fr); gap: 4px 8px; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.base-map-workspace { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.base-map-canvas-host { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.base-map-canvas { position: absolute; width: 100%; height: 100%; touch-action: none; }
.base-map-floating { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); max-height: calc(100% - 16px); overflow: auto; }
.base-map-layer-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
/* User-approved map floating-toolbar exception: default-height square text buttons. */
.base-map-layer-tools :deep(.el-button) { width: 32px; padding: 0; }
.base-map-layer-tools :deep(.el-button:hover), .base-map-layer-tools :deep(.el-button:focus-visible) { border-color: var(--el-border-color); }
.base-map-layer { display: flex; align-items: center; gap: 2px; }
.base-map-drag-handle { touch-action: none; cursor: move; }
.base-map-context { position: absolute; width: 240px; max-width: 100%; max-height: 100%; overflow: auto; box-sizing: border-box; }
.base-map-object-info { display: flex; flex-direction: column; overflow-wrap: anywhere; gap: 4px; }
.base-map-context-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.base-map-library { grid-column: 2; grid-row: 1 / -1; display: flex; flex-direction: column; gap: 8px; overflow: hidden; min-height: 0; }
.base-map-catalog-tabs { display: grid; grid-template-columns: repeat(4, auto); gap: 4px 2px; flex-shrink: 0; }
.base-map-material-album { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
.base-map-material-album > [role="listitem"] { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; }
.base-map-city-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.base-map-city-groups > [role="listitem"] { min-width: 0; text-align: center; overflow-wrap: anywhere; }
.base-map-city-group-preview { display: flex; justify-content: center; align-items: center; width: 80px; height: 80px; }
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
