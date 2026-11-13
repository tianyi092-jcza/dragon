<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import ListPagination from './ListPagination.vue';
import { usePagination } from './pagination.js';
const props = defineProps({ model: { type: Object, required: true }, actions: { type: Object, required: true }, busy: Boolean });
const canvas = ref(null), minimap = ref(null), host = ref(null), category = ref('materials');
const dx = ref(0), dy = ref(0), tile = ref(16), geography = ref(0), materialName = ref('');
const editingMaterial = ref(null), renamedMaterial = ref('');
watch(() => props.model.readRevision, () => { editingMaterial.value = null; renamedMaterial.value = ''; materialName.value = ''; });
watch([editingMaterial, renamedMaterial, materialName, () => props.model.materials], () => {
  const row = props.model.materials?.find(item => item.id === editingMaterial.value);
  props.actions.formDirty(Boolean(materialName.value.trim() || row && renamedMaterial.value !== row.name));
}, { flush: 'sync' });
async function saveMaterialName(id) {
  const name = renamedMaterial.value;
  await props.actions.command('material-rename', { materialId: id, name });
  if (props.model.materials.find(row => row.id === id)?.name === name.trim()) editingMaterial.value = null;
}
const labels = { base: '基底', decor: '裝飾', roads: '道路', cities: '據點' };
const rows = computed(() => props.model[category.value] || []);
const { currentPage, pageSize, total, pagedRows } = usePagination(rows);
const locked = computed(() => props.busy || props.model.locked || props.model.atlasLoading || Boolean(props.model.atlasError));
let observer, pointer = null;
function down(event) {
  if (props.busy || event.button !== 0) return;
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
  props.actions.attach(canvas.value, minimap.value);
  observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; props.actions.resize(width, height); });
  observer.observe(host.value);
});
onBeforeUnmount(() => { observer?.disconnect(); props.actions.attach(null, null); props.actions.formDirty(false); });
</script>

<template>
  <section :id="model.gameScoped ? 'game-map-editor' : 'base-map-editor'" class="base-map-panel">
    <header class="base-map-toolbar">
      <strong>{{ model.gameScoped ? '遊戲地圖' : '基礎地圖' }}</strong><span>{{ model.gameScoped ? '遊戲副本 · 摘要' : '系統模板 · 版本' }} {{ model.version || '—' }}</span>
      <ElButton :disabled="busy" @click="actions.reload()">重新讀取／取消修改</ElButton>
      <ElButton v-if="!model.gameScoped && model.loaded && !model.exists" :disabled="busy" @click="actions.initialize()">首次建立</ElButton>
      <ElButton :disabled="locked || !model.dirty" @click="actions.save()">保存</ElButton>
      <ElButton :disabled="locked || !model.dirty" @click="actions.undo()">撤銷上一步</ElButton>
      <span>{{ model.message }}</span>
    </header>
    <div class="base-map-toolbar">
      <ElSelect :model-value="model.season || 'spring'" class="base-map-season" :disabled="busy || !model.exists" @update:model-value="actions.season($event)">
        <ElOption v-for="(label, value) in { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }" :key="value" :value="value" :label="label" />
      </ElSelect>
      <ElButton :disabled="!model.exists" @click="actions.fit()">全圖</ElButton>
      <ElButton :disabled="!model.exists" @click="actions.zoom(1.25)">放大</ElButton>
      <ElButton :disabled="!model.exists" @click="actions.zoom(0.8)">縮小</ElButton>
      <span v-if="model.atlasLoading">圖集載入中…</span>
      <template v-if="model.atlasError"><span>{{ model.atlasError }}</span><ElButton @click="actions.retryAtlas()">重試圖集</ElButton></template>
    </div>
    <div v-if="model.serverProblems?.length" class="base-map-problems" role="alert"><p v-for="(problem, index) in model.serverProblems" :key="index">{{ problem.message }}</p></div>
    <div class="base-map-body">
      <div ref="host" class="base-map-canvas-host">
        <canvas ref="canvas" class="base-map-canvas" :aria-label="model.gameScoped ? '可編輯遊戲地圖' : '可編輯基礎地圖'" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="pointer = null" @lostpointercapture="pointer = null" @wheel.prevent="!busy && actions.zoom($event.deltaY < 0 ? 1.2 : 1 / 1.2, $event.offsetX, $event.offsetY)" />
      </div>
      <aside class="base-map-inspector">
        <canvas ref="minimap" class="base-map-minimap" width="250" height="167" :aria-label="model.gameScoped ? '遊戲地圖小地圖' : '基礎地圖小地圖'" @click="actions.locate($event.offsetX / $event.currentTarget.clientWidth, $event.offsetY / $event.currentTarget.clientHeight)" />
        <div v-for="layer in model.layers" :key="layer.id" class="base-map-toolbar">
          <span>{{ labels[layer.id] }}</span>
          <ElCheckbox :model-value="layer.visible" @update:model-value="actions.layer(layer.id, 'visible', $event)">顯示</ElCheckbox>
          <ElCheckbox :model-value="layer.locked" @update:model-value="actions.layer(layer.id, 'locked', $event)">鎖定</ElCheckbox>
        </div>
        <p>圖層顯隱只影響工作區。道路與據點目前僅供選取檢視，不開放移動或刪除。</p>
        <template v-if="model.selected">
          <strong>{{ model.selected.name }}</strong><span>（{{ model.selected.x }}, {{ model.selected.y }}）</span>
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
          <template v-if="model.selected.captureAllowed">
            <ElInput v-model="materialName" placeholder="新素材名稱" maxlength="80" aria-label="新素材名稱" />
            <ElButton :disabled="locked || !materialName.trim() || model.selected.cells > 256" @click="actions.command('material-capture', { name: materialName })">擷取為素材</ElButton>
            <span v-if="model.selected.cells > 256">擷取上限256格，請改選單片段。</span>
          </template>
          <p v-if="model.selected.layer === 'group'">{{ model.selected.members }} 個成員；按實際格形顯示整組範圍。組合僅供選取檢視，不解除圖層鎖定；點選單片段後編輯，不整體移動道路或據點。</p>
          <template v-if="model.selected.layer === 'base'">
            <label>明確圖塊編號 <ElInputNumber v-model="tile" :min="0" :max="255" :precision="0" /></label>
            <ElSelect v-model="geography"><ElOption v-for="(label, value) in ['陸地', '海', '河', '湖']" :key="value" :label="label" :value="value" /></ElSelect>
            <ElButton :disabled="locked" @click="actions.command('base-fill', { tile, geography })">填入此基底格</ElButton>
          </template>
        </template>
      </aside>
      <aside class="base-map-library">
        <ElSelect v-model="category"><ElOption value="materials" label="元素素材" /><ElOption value="waters" label="水域與小地圖" /><ElOption value="groups" label="Web 編輯組合" /><ElOption value="diagnostics" :label="`問題定位（${model.diagnostics?.length || 0}）`" /></ElSelect>
        <ElTable :data="pagedRows" height="100%" class="base-map-list">
          <ElTableColumn v-if="category === 'materials'" label="圖樣" width="88"><template #default="{ row }"><canvas :ref="node => actions.previewMaterial(node, row.id)" width="64" height="64" :aria-label="row.name" /></template></ElTableColumn>
          <ElTableColumn v-if="category === 'diagnostics'" label="問題" min-width="180"><template #default="{ row }">{{ row.code === 'UNKNOWN_UNDERLAY' ? '下層地塊未知' : row.code + '（未知）' }}<br>{{ row.message }}</template></ElTableColumn>
          <ElTableColumn v-else label="名稱" min-width="150"><template #default="{ row }">
            <ElInput v-if="category === 'materials' && editingMaterial === row.id" v-model="renamedMaterial" maxlength="80" aria-label="素材名稱" />
            <span v-else>{{ row.name }}</span>
          </template></ElTableColumn>
          <ElTableColumn label="操作" min-width="180"><template #default="{ row }">
            <template v-if="category === 'materials'">
              <template v-if="editingMaterial === row.id">
                <ElButton :disabled="locked || !renamedMaterial.trim()" @click="saveMaterialName(row.id)">保存</ElButton>
                <ElButton :disabled="busy" @click="editingMaterial = null">取消</ElButton>
              </template>
              <template v-else>
                <ElButton :disabled="locked || !model.selected" @click="actions.command('decoration-place', { materialId: row.id })">放置</ElButton>
                <ElButton v-if="row.editable" :disabled="locked" @click="editingMaterial = row.id; renamedMaterial = row.name">編輯</ElButton>
                <ElButton v-if="row.editable" :disabled="locked || row.inUse" @click="actions.command('material-remove', { materialId: row.id })">刪除素材</ElButton>
              </template>
            </template>
            <ElButton v-else-if="category === 'waters'" :disabled="locked" @click="actions.command('water-visibility', { groupId: row.id, showOnMinimap: !row.visible })">{{ row.visible ? '從小地圖隱藏' : '顯示於小地圖' }}</ElButton>
            <ElButton v-else-if="category === 'groups'" @click="actions.selectGroup(row.id)">選取組合</ElButton>
            <ElButton v-else :disabled="!Number.isInteger(row.x) || !Number.isInteger(row.y)" @click="actions.focusDiagnostic(row.index)">定位基底格</ElButton>
          </template></ElTableColumn>
        </ElTable>
        <ListPagination v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.base-map-panel { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; overflow: hidden; }
.base-map-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.base-map-season { width: 90px; }
.base-map-problems { max-height: 96px; overflow: auto; flex-shrink: 0; }
.base-map-body { display: grid; grid-template-columns: minmax(240px, 1fr) 270px minmax(300px, 400px); gap: 12px; flex: 1; min-height: 0; overflow: auto; }
.base-map-canvas-host { position: relative; min-height: 280px; overflow: hidden; }
.base-map-canvas { position: absolute; width: 100%; height: 100%; touch-action: none; }
.base-map-minimap { width: 250px; height: 167px; flex-shrink: 0; }
.base-map-inspector { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.base-map-library { display: flex; flex-direction: column; gap: 8px; overflow: hidden; min-height: 0; }
.base-map-list { flex: 1; min-height: 0; }
@media (max-width: 1200px) { .base-map-body { grid-template-columns: minmax(240px, 1fr) 270px; } .base-map-library { grid-column: 1 / -1; min-height: 320px; } }
</style>
