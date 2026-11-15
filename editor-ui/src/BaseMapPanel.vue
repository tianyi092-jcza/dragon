<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index.mjs';
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs';
import WorkspaceIcon from './WorkspaceIcon.vue';
import ListPagination from './ListPagination.vue';
import { usePagination } from './pagination.js';
const props = defineProps({ model: { type: Object, required: true }, actions: { type: Object, required: true }, busy: Boolean });
const canvas = ref(null), host = ref(null), catalogCategory = ref('mountain');
const sideTool = ref('library'), selectionDetails = ref(false);
const dx = ref(0), dy = ref(0);
const labels = { base: '底圖', decor: '裝飾', roads: '道路', cities: '據點' };
watch([() => props.model.selected?.layer, () => props.model.selected?.id, () => props.model.readRevision], () => { selectionDetails.value = false; });
const rows = computed(() => (props.model.catalogItems || []).filter(row => row.category === catalogCategory.value));
const { currentPage, pageSize, total, pagedRows } = usePagination(rows);
const locked = computed(() => props.busy || props.model.locked || props.model.atlasLoading || Boolean(props.model.atlasError));
const placementLocked = computed(() => locked.value || props.model.layers.some(layer => layer.id === 'decor' && (layer.locked || !layer.visible)));
let observer, pointer = null, materialPointer = null, materialKeyboard = null;
function cancelMaterial() {
  materialPointer = null;
  materialKeyboard = null;
  props.actions.cancelPlacement();
}
function materialDown(event, materialId) {
  if (event.button !== 0 || placementLocked.value) return;
  event.preventDefault();
  cancelMaterial();
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
  canvas.value.focus({ preventScroll: true });
  materialKeyboard = { materialId, origin: event.currentTarget, x: canvas.value.clientWidth / 2, y: canvas.value.clientHeight / 2 };
  props.actions.previewPlacement(materialId, materialKeyboard.x, materialKeyboard.y);
}
function moveMaterialKeyboard(event) {
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
function cancelMaterialKey(event) {
  if (event.key === 'Escape' && (materialPointer || materialKeyboard)) {
    event.preventDefault();
    const origin = materialKeyboard?.origin;
    cancelMaterial();
    origin?.focus({ preventScroll: true });
  }
}
watch([placementLocked, () => props.model.readRevision, () => props.model.zoom, catalogCategory, currentPage, pageSize, sideTool], cancelMaterial);
function down(event) {
  if (props.busy || event.button !== 0) return;
  cancelMaterial();
  pointer = { id: event.pointerId, x: event.offsetX, y: event.offsetY, startX: event.offsetX, startY: event.offsetY, moved: false };
  canvas.value.setPointerCapture(event.pointerId);
}
function move(event) {
  if (!pointer || props.busy) return;
  if (Math.hypot(event.offsetX - pointer.startX, event.offsetY - pointer.startY) > 3) pointer.moved = true;
  if (pointer.moved) props.actions.pan(pointer.x - event.offsetX, pointer.y - event.offsetY);
  pointer.x = event.offsetX; pointer.y = event.offsetY;
}
function up(event) {
  if (!pointer) return;
  if (!pointer.moved && !props.busy) props.actions.pick(event.offsetX, event.offsetY);
  pointer = null;
}
onMounted(() => {
  props.actions.attach(canvas.value, null);
  observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; cancelMaterial(); props.actions.resize(width, height); });
  observer.observe(host.value);
  window.addEventListener('keydown', cancelMaterialKey);
  window.addEventListener('blur', cancelMaterial);
});
onBeforeUnmount(() => {
  cancelMaterial();
  window.removeEventListener('keydown', cancelMaterialKey);
  window.removeEventListener('blur', cancelMaterial);
  observer?.disconnect(); props.actions.attach(null, null); props.actions.formDirty(false);
});
</script>

<template>
  <section :id="model.gameScoped ? 'game-map-editor' : 'base-map-editor'" class="base-map-panel">
    <header class="base-map-toolbar">
      <strong :title="`${model.gameScoped ? '遊戲副本 · 摘要' : '系統模板 · 版本'} ${model.version || '—'}`">{{ model.gameScoped ? '遊戲地圖' : '基礎地圖' }}</strong>
      <ElButton :disabled="busy" @click="actions.reload()">重新讀取／取消修改</ElButton>
      <ElButton v-if="!model.gameScoped && model.loaded && !model.exists" :disabled="busy" @click="actions.initialize()">首次建立</ElButton>
      <ElButton :disabled="locked || !model.dirty" @click="actions.save()">保存</ElButton>
      <ElButton :disabled="locked || !model.dirty" @click="actions.undo()">撤銷上一步</ElButton>
      <span class="base-map-message" role="status" :title="model.message">{{ model.atlasLoading ? '圖集載入中…' : model.message }}</span>
      <ElCheckbox :model-value="model.gridVisible !== false" @update:model-value="actions.grid($event)">網格</ElCheckbox>
      <ElButton :disabled="!model.exists" @click="actions.fit()">全圖</ElButton>
      <ElButton :disabled="!model.exists" @click="actions.zoom(1.25)">放大</ElButton>
      <ElButton :disabled="!model.exists" @click="actions.zoom(0.8)">縮小</ElButton>
    </header>
    <div v-if="model.seaGroundPending" class="base-map-problems" role="status">已預覽新底圖與地面輪廓，尚未寫入；保存後生效，可撤銷。未放置素材的位置自然露出底圖；讀取不會改寫舊地圖或已發布版本。</div>
    <div v-if="model.atlasError" class="base-map-problems" role="alert"><span>{{ model.atlasError }}</span><ElButton @click="actions.retryAtlas()">重試圖集</ElButton></div>
    <div v-if="model.serverProblems?.length" class="base-map-problems" role="alert"><p v-for="(problem, index) in model.serverProblems" :key="index">{{ problem.message }}</p></div>
    <div class="base-map-body" :class="`base-map-tool-${sideTool}`">
      <ElTabs v-model="sideTool" class="base-map-tool-tabs" aria-label="地圖側邊工具">
        <ElTabPane name="inspector" label="圖層／屬性" />
        <ElTabPane name="library" label="素材" />
      </ElTabs>
      <div ref="host" class="base-map-canvas-host">
        <canvas ref="canvas" class="base-map-canvas" tabindex="0" aria-description="選取素材後以方向鍵逐格移動，Enter或空白鍵放置，Esc取消；離開焦點取消預覽。" @keydown="moveMaterialKeyboard" @blur="cancelMaterial" :aria-label="model.gameScoped ? '可編輯遊戲地圖' : '可編輯基礎地圖'" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="pointer = null" @lostpointercapture="pointer = null" @wheel.prevent="!busy && actions.zoom($event.deltaY < 0 ? 1.2 : 1 / 1.2, $event.offsetX, $event.offsetY)" />
      </div>
      <aside class="base-map-inspector">
        <div v-for="layer in model.layers" :key="layer.id" class="base-map-layer">
          <span>{{ labels[layer.id] }}</span>
          <ElButton :aria-label="`${layer.visible ? '隱藏' : '顯示'}${labels[layer.id]}`" :title="`${layer.visible ? '隱藏' : '顯示'}${labels[layer.id]}`" :aria-pressed="layer.visible" @click="actions.layer(layer.id, 'visible', !layer.visible)"><WorkspaceIcon :name="layer.visible ? 'visible' : 'hidden'" /></ElButton>
          <ElButton :aria-label="`${layer.locked ? '解鎖' : '鎖定'}${labels[layer.id]}`" :title="`${layer.locked ? '解鎖' : '鎖定'}${labels[layer.id]}`" :aria-pressed="layer.locked" @click="actions.layer(layer.id, 'locked', !layer.locked)"><WorkspaceIcon :name="layer.locked ? 'locked' : 'unlocked'" /></ElButton>
        </div>
        <template v-if="model.selected">
          <strong>{{ { decor: '裝飾片段', roads: '道路', cities: '據點' }[model.selected.layer] || model.selected.name }}</strong><span>（{{ model.selected.x }}, {{ model.selected.y }}）</span>
          <ElButton :aria-expanded="selectionDetails" @click="selectionDetails = !selectionDetails">{{ selectionDetails ? '隱藏識別資料' : '查看識別資料' }}</ElButton>
          <div v-if="selectionDetails" class="base-map-selection-details"><div>{{ model.selected.name }}</div><div>ID：{{ model.selected.id }}</div></div>
          <p v-if="model.selected.layer === 'roads' || model.selected.layer === 'cities'">目前僅供檢視；不開放新增、移動或變更道路連接。</p>
          <template v-if="model.selected.layer === 'decor'">
            <span>{{ model.selected.cells }} 格 · 可拆編輯片段</span>
            <div class="base-map-toolbar">
              <ElButton :disabled="locked || model.selected.cells < 2 || model.selected.cells > 256" @click="actions.command('decoration-split')">拆分</ElButton>
              <ElButton :disabled="locked" @click="actions.command('decoration-remove')">刪除</ElButton>
              <ElButton :disabled="locked" @click="actions.command('decoration-reorder', { direction: 1 })">上移一層</ElButton>
              <ElButton :disabled="locked" @click="actions.command('decoration-reorder', { direction: -1 })">下移一層</ElButton>
            </div>
            <label>橫向位移 <ElInputNumber v-model="dx" :min="-383" :max="383" :precision="0" /></label>
            <label>縱向位移 <ElInputNumber v-model="dy" :min="-255" :max="255" :precision="0" /></label>
            <ElButton :disabled="locked || (!dx && !dy)" @click="actions.command('decoration-translate', { dx, dy })">移動片段</ElButton>
          </template>
          <p v-if="model.selected.layer === 'group'">{{ model.selected.members }} 個成員；按實際格形顯示整組範圍。組合僅供選取檢視，不解除圖層鎖定；點選單片段後編輯，不整體移動道路或據點。</p>
          <p v-if="model.selected.layer === 'base'">{{ model.seaGroundEnabled ? '未放置素材的位置就是底圖；放置地面圖塊形成陸地。小地圖僅顯示地面輪廓、道路與據點。' : '目前保留舊底圖模式；重新讀取可再次預覽新底圖，保存後才寫入。' }}</p>
        </template>
        <div v-if="model.diagnostics?.length" class="base-map-problems" role="alert">
          <div v-for="problem in model.diagnostics" :key="problem.index"><span>{{ problem.message }}</span><ElButton :disabled="!Number.isInteger(problem.x) || !Number.isInteger(problem.y)" @click="actions.focusDiagnostic(problem.index)">定位底圖格</ElButton></div>
        </div>
      </aside>
      <aside class="base-map-library">
        <ElTabs v-model="catalogCategory" class="base-map-catalog-tabs" aria-label="素材分類">
          <ElTabPane v-for="item in model.catalogCategories" :key="item.id" :name="item.id" :label="item.name" />
        </ElTabs>
        <div class="base-map-material-album" role="list" aria-label="原子素材相冊">
          <div v-for="row in pagedRows" :key="row.itemId" role="listitem">
              <div v-if="row.canPlace" class="base-map-material-preview" role="button" tabindex="0" :aria-label="`${row.name}；拖至地圖或按Enter／空白鍵開始放置`" :aria-disabled="placementLocked" @keydown="startMaterialKeyboard($event, row.id)" @pointerdown="materialDown($event, row.id)" @pointermove="materialMove" @pointerup="materialUp" @pointercancel="cancelMaterial" @lostpointercapture="cancelMaterial" @dragstart.prevent><canvas :ref="node => actions.previewMaterial(node, row.id)" width="32" height="32" :aria-label="row.name" /></div>
              <div v-else class="base-map-atom-preview" tabindex="0" :aria-label="`${row.name}；${row.note}`"><canvas v-if="row.available" :ref="node => actions.previewMaterial(node, row.id)" width="32" height="32" :aria-label="row.name" /><span v-else>不可用</span></div>
          </div>
          <span v-if="!total">此分類尚無原子素材。</span>
        </div>
        <ListPagination v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.base-map-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; overflow: hidden; }
.base-map-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
header.base-map-toolbar { flex-wrap: nowrap; overflow-x: auto; flex-shrink: 0; }
header.base-map-toolbar > * { flex-shrink: 0; }
header.base-map-toolbar > .base-map-message { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 160px; min-width: 80px; }
.base-map-layer { display: flex; align-items: center; gap: 8px; }
.base-map-layer > span { flex: 1; }
.base-map-problems { max-height: 96px; overflow: auto; flex-shrink: 0; }
.base-map-body { display: grid; grid-template-columns: minmax(160px, 1fr) 200px minmax(260px, 340px); gap: 8px; flex: 1; min-height: 0; overflow: hidden; }
.base-map-canvas-host { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.base-map-canvas { position: absolute; width: 100%; height: 100%; touch-action: none; }
.base-map-inspector { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.base-map-selection-details { overflow-wrap: anywhere; }
.base-map-library { display: flex; flex-direction: column; gap: 8px; overflow: hidden; min-height: 0; }
.base-map-catalog-tabs { flex-shrink: 0; min-width: 0; }
.base-map-material-album { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); align-content: start; gap: 8px; flex: 1; min-height: 0; overflow: auto; }
.base-map-material-album > [role="listitem"] { display: flex; justify-content: center; padding: 8px 0; }
.base-map-material-album > span { grid-column: 1 / -1; }
.base-map-material-preview, .base-map-atom-preview { width: 64px; height: 64px; overflow: auto; }
.base-map-material-preview[aria-disabled="false"] { touch-action: none; }
.base-map-material-preview canvas, .base-map-atom-preview canvas { display: block; max-width: none; image-rendering: pixelated; }
.base-map-tool-tabs { display: none; }
@media (max-width: 1200px) {
  .base-map-body { grid-template-columns: minmax(160px, 1fr) 300px; grid-template-rows: auto minmax(0, 1fr); }
  .base-map-tool-tabs { display: block; grid-column: 2; grid-row: 1; min-width: 0; }
  .base-map-canvas-host { grid-column: 1; grid-row: 1 / 3; }
  .base-map-inspector, .base-map-library { grid-column: 2; grid-row: 2; }
  .base-map-tool-library .base-map-inspector, .base-map-tool-inspector .base-map-library { display: none; }
}
</style>
