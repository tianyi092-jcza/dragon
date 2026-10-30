<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import WaterGroupsPanel from './WaterGroupsPanel.vue';
import MaterialsPanel from './MaterialsPanel.vue';
import BaseTerrainPanel from './BaseTerrainPanel.vue';
import MapWindowPanel from './MapWindowPanel.vue';
const props = defineProps({model:Object,actions:Object,draftModel:Object,draftActions:Object,busy:Boolean});
const canvas = ref(null), viewport = ref(null), scale = ref(1);
const materialPanel = ref(null), basePanel = ref(null), waterPanel = ref(null), placementReady = ref(false), placementFootprint = ref(null), placementDrag = ref(null), shiftAnchor = ref(null), shiftPreview = ref(null), shiftCandidate = ref(null);
defineExpose({ hasInputs: () => Boolean(materialPanel.value?.hasInputs() || basePanel.value?.hasInputs() || waterPanel.value?.hasInputs()) });
function resize(value) {
  scale.value = value;
  if (!canvas.value) return;
  canvas.value.width = 384 * value;
  canvas.value.height = 256 * value;
  if (viewport.value) { viewport.value.scrollLeft = 0; viewport.value.scrollTop = 0; }
  props.actions.redraw?.();
}
function zoom(value) { if (!props.busy && !props.model.locked && props.model.context && [1, 2, 4].includes(value)) resize(value); }
watch(() => props.model.context, () => resize(1));
// Initial shell mount precedes controller installation; its first render paints.
onMounted(() => { props.actions.attachCanvas(canvas.value); props.actions.redraw?.(); });
onBeforeUnmount(() => props.actions.attachCanvas(null));
function choose(event) { props.actions.select(event.target.value); event.target.value = props.model.selected ?? ''; }
</script>
<template>
  <section id="mapview-editor" class="module-card">
    <h2>地圖與水域顯示</h2>
    <label v-if="draftModel?.workspace">目前編輯層<select id="map-current-layer" :value="draftModel.workspace.layer" :disabled="busy || draftModel.workspace.locked" @change="draftActions.mapLayer($event.target.value)"><option value="base">基本地圖</option><option value="decor">裝飾</option><option value="roads">道路（目前唯讀）</option><option value="cities">據點（目前唯讀）</option></select></label>
    <p>只在目前層執行補底或裝飾實例操作；換層不改顯隱、鎖定、已存內容或其它表單，也不自動保存。道路／據點尚未開放寫入。素材庫與水域組資料管理獨立。</p>
    <MapWindowPanel :model="draftModel" :actions="draftActions" :busy="busy" :placement-ready="placementReady" :placement-footprint="placementFootprint" :placement-drag="placementDrag" :shift-anchor="shiftAnchor" :shift-preview="shiftPreview" @shift-candidate="shiftCandidate = $event" @shift-point="materialPanel?.useShiftPoint($event)" @placement-drag-end="placementDrag = null" @placement-point="materialPanel?.useWindowPoint($event)" @base-cells="basePanel?.useWindowCells($event)" />
    <WaterGroupsPanel ref="waterPanel" :model="draftModel" :actions="draftActions" :busy="busy" />
    <MaterialsPanel ref="materialPanel" :shift-candidate="shiftCandidate" :model="draftModel" :actions="draftActions" :busy="busy" @placement-ready="placementReady = $event" @placement-footprint="placementFootprint = $event" @placement-drag="placementDrag = $event" @shift-anchor="shiftAnchor = $event" @shift-preview="shiftPreview = $event" />
    <BaseTerrainPanel ref="basePanel" :model="draftModel" :actions="draftActions" :busy="busy" />
    <h3>據點與道路（唯讀示意）</h3>
    <p>放置192鎖定、道路拓撲章節釘死、圖塊語義未審計，這些編輯尚未開放；下圖僅顯示放置與道路幾何。拓撲意向是獨立查詢，不代表執行遷移、保存或發布准入。</p>
    <div class="module-toolbar">
      <ElButton id="mapview-refresh" :disabled="busy || model.locked" @click="actions.refresh()">讀取遊戲清單</ElButton>
      <label>遊戲<select id="mapview-games" :value="model.selected ?? ''" :disabled="busy || model.locked" @change="choose"><option v-if="model.selected && !model.games.some(g => g.gameId === model.selected)" :value="model.selected" disabled>目前遊戲：{{ model.selected }}（本面板未列出，請讀取清單）</option><option v-for="game in model.games" :key="game.gameId" :value="game.gameId">{{ game.label }}</option></select></label>
      <ElButton id="mapview-inspect" :disabled="busy || model.locked || !model.selected" @click="actions.inspect()">讀取地圖</ElButton>
    </div>
    <p>{{ model.context }}</p>
    <div class="module-toolbar" aria-label="示意圖檢視工具">
      <ElButton id="mapview-zoom-out" :disabled="busy || model.locked || !model.context || scale === 1" @click="zoom(scale / 2)">縮小</ElButton>
      <output id="mapview-scale" aria-live="polite">示意倍率 {{ scale }}×</output>
      <ElButton id="mapview-zoom-in" :disabled="busy || model.locked || !model.context || scale === 4" @click="zoom(scale * 2)">放大</ElButton>
      <ElButton id="mapview-reset" :disabled="busy || model.locked || !model.context" @click="zoom(1)">復位</ElButton>
    </div>
    <p>放大後可用捲軸或聚焦圖框後的方向鍵瀏覽；變更倍率會回到左上角。僅調整示意圖檢視，不保存或修改地圖。</p>
    <!-- Vue owns dimensions/scroll only; native code owns every pixel. -->
    <div ref="viewport" id="mapview-viewport" tabindex="0" aria-label="可捲動的唯讀地圖示意圖">
      <canvas ref="canvas" id="mapview-canvas" width="384" height="256" aria-label="唯讀據點與道路示意圖"></canvas>
    </div>
    <p id="mapview-message" role="status">{{ model.message }}</p>
    <div id="mapview-roads" class="entity-table-wrap" tabindex="0" aria-label="道路唯讀描述"><p v-for="(line,index) in model.lines" :key="index">{{ line }}</p></div>
  </section>
</template>
<style scoped>
#mapview-viewport { overflow: auto; max-height: 512px; max-width: 100%; border: 1px solid #768274; }
#mapview-canvas { display: block; max-width: none; width: auto; height: auto; }
</style>
