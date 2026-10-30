<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import WaterCreatePanel from './WaterCreatePanel.vue';
import { minimapTransform } from '../../web/src/content/authoring/minimap.js';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const canvas = ref(null), selectedGroups = ref([]), mergedVisibility = ref(''), createPanel = ref(null);
defineExpose({ hasInputs: () => Boolean(mergedVisibility.value || createPanel.value?.hasInputs()) });
// dragon-draft-minimap-1 and map-window-1 both certify this fixed domain.
const projection = minimapTransform({ width: 384, height: 256, tileSize: 16 }, { x: 0, y: 0, w: 250, h: 167 });
const imageStyle = { left: `${projection.rect.x / 250 * 100}%`, top: `${projection.rect.y / 167 * 100}%`, width: `${projection.rect.w / 250 * 100}%`, height: `${projection.rect.h / 167 * 100}%` };
const navigable = computed(() => !props.busy && props.model?.minimap?.ready && !props.model.minimap.locked && props.model?.mapWindow?.ready && !props.model.mapWindow.locked);
const windowRect = computed(() => {
  if (!navigable.value) return null;
  const view = props.model.mapWindow.value, [x, y] = projection.worldToDisplay(view.x * view.tileSize, view.y * view.tileSize);
  return { x, y, width: view.width * view.tileSize * projection.scale, height: view.height * view.tileSize * projection.scale };
});
function locate(event) {
  if (event.button !== 0 || !navigable.value) return;
  const box = event.currentTarget.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const point = projection.displayToWorld((event.clientX - box.left) * 250 / box.width, (event.clientY - box.top) * 167 / box.height);
  if (point) props.actions.locateMinimapCell(Math.floor(point[0] / 16), Math.floor(point[1] / 16));
}
const splitGroup = ref(''), splitMembers = ref([]), splitCells = ref([]), groupFilter = ref('');
const filteredGroups = computed(() => {
  const query = groupFilter.value.trim().normalize('NFC').toLowerCase();
  return (props.model?.water?.rows ?? []).filter(row => !query || [row.groupId, row.name ?? ''].some(value => value.normalize('NFC').toLowerCase().includes(query)));
});
const hiddenSelectedCount = computed(() => {
  const visible = new Set(filteredGroups.value.map(row => row.groupId));
  return selectedGroups.value.filter(id => !visible.has(id)).length;
});
const splitSource = computed(() => props.model?.water?.members?.find(row => row.groupId === splitGroup.value) ?? null);
const splitCount = computed(() => splitMembers.value.length + splitCells.value.length);
watch(splitGroup, () => { splitMembers.value = []; splitCells.value = []; });
watch([() => props.model?.fields?.gameId, () => props.model?.context?.draftRevision, () => props.model?.context?.verified, () => props.model?.context?.readGeneration], () => {
  selectedGroups.value = []; mergedVisibility.value = ''; splitGroup.value = ''; splitMembers.value = []; splitCells.value = []; groupFilter.value = '';
});
watch(canvas, value => { props.actions.attachMinimapCanvas(value); props.actions.redrawMinimap?.(); }, { flush: 'post' });
onBeforeUnmount(() => props.actions.attachMinimapCanvas(null));
</script>
<template>
  <section v-if="model?.water" id="water-groups-editor">
    <h3>水域組合的小地圖顯示</h3>
    <p>只開放自己中立模板或完整副本組合的名稱、顯示開關及明確水域成員的新建／合併／拆分，不改大地圖、地形、道路或規則。這是保存於內容的設定，不是工作區隱藏；下方道路示意圖不預覽水域顯示結果。</p>
    <p>共用「遊戲資料」的已載入修訂與原保存操作。只保存選中的名稱、開關、新建、合併或拆分，不提交其它表單輸入；確認收據後須明確重讀，不自動讀最新修訂。</p>
    <div class="module-toolbar">
      <ElButton id="water-refresh" :disabled="busy || model.locked" @click="actions.refresh()">更新遊戲清單</ElButton>
      <label>明確草稿修訂<input id="water-revision" :value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event.target.value)"></label>
      <ElButton id="water-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂的水域組合</ElButton>
      <ElButton id="water-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="water-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試相同原鍵／內容</ElButton>
    </div>
    <p id="water-context">遊戲：{{ model.fields.gameId || '尚未選擇' }}／已載入修訂：{{ model.context?.draftRevision ?? '未載入' }}<strong v-if="model.context && !model.context.verified">／須重新明確載入</strong></p>
    <p id="water-status" role="status">{{ model.message }}</p>
    <div v-if="model.minimap">
      <h4>已保存修訂的小地圖背景</h4>
      <ElButton id="water-preview" :disabled="busy || model.minimap.locked" @click="actions.minimap()">預覽已載入修訂</ElButton>
      <p>不包含未保存輸入、拓撲意向或據點標記；預覽成功不代表可玩准入。另有同修訂窗口時，左鍵可定位窗口，留邊及右鍵不導航；只改檢視，圖集仍須獨立讀取。保存或換上下文會清除舊圖，須明確重讀再預覽。</p>
      <p v-if="model.minimap.ready" id="water-preview-context">遊戲 {{ model.minimap.info.gameId }}／修訂 {{ model.minimap.info.draftRevision }}／{{ model.minimap.info.styleRevision }}／來源 {{ model.minimap.info.sourceDigest }}</p>
      <p v-else>尚無通過摘要核驗的當前修訂預覽。</p>
      <!-- Vue owns the element only; native controller owns verified pixels. -->
      <div id="water-preview-navigation" :class="{ navigable }" @click="locate">
        <canvas ref="canvas" id="water-preview-canvas" :style="imageStyle" width="250" height="167" aria-label="已保存修訂的小地圖背景預覽"></canvas>
        <svg v-if="windowRect" id="water-preview-window" viewBox="0 0 250 167" preserveAspectRatio="none" aria-label="目前已讀地圖窗口範圍"><rect v-bind="windowRect" /></svg>
      </div>
    </div>
    <WaterCreatePanel ref="createPanel" :model="model" :actions="actions" :busy="busy" />
    <p v-if="!model.water.supported" id="water-unavailable">尚未載入支援的水域摘要；缺少資料不等於沒有水域，請明確讀取自己遊戲的確切修訂。</p>
    <div v-else class="entity-table-wrap" tabindex="0" aria-label="水域組合顯示設定">
      <p v-if="model.water.rows.length === 0">此修訂沒有已配置的水域組合。</p>
      <div class="module-toolbar">
        <label>合併新組的小地圖設定<select id="water-merge-visibility" v-model="mergedVisibility" :disabled="busy || model.water.locked"><option value="" disabled>請明確選擇</option><option value="yes">顯示</option><option value="no">不顯示</option></select></label>
        <ElButton id="water-merge-cancel" :disabled="busy || model.water.locked || (!mergedVisibility && !selectedGroups.length)" @click="selectedGroups = []; mergedVisibility = ''">取消合併準備</ElButton>
        <ElButton id="water-merge" :disabled="busy || model.water.locked || selectedGroups.length < 2 || !mergedVisibility" @click="actions.waterMerge([...selectedGroups], mergedVisibility === 'yes')">合併所選組合</ElButton>
      </div>
      <p>勾選至少兩組；合併移除原組合身份，保留完整成員並建立新身份。不猜分類，含未明確分類成員時服務會拒絕。未保存選取不會修改內容。</p>
      <h4>拆分完整成員</h4>
      <p v-if="model.water.members === null">此修訂未提供完整成員清單，不能拆分；缺失不表示空組。</p>
      <div class="module-toolbar">
        <label>原組合<select id="water-split-group" v-model="splitGroup" :disabled="busy || model.water.splitLocked"><option value="" disabled>請選擇原組合</option><option v-for="group in model.water.rows" :key="group.groupId" :value="group.groupId" :disabled="group.memberCount + group.baseCellCount < 2">{{ group.name ?? group.groupId }}（{{ group.memberCount }}組件／{{ group.baseCellCount }}基礎格）</option></select></label>
        <ElButton id="water-split" :disabled="busy || model.water.splitLocked || !splitSource || splitCount === 0 || splitCount >= splitSource.memberIds.length + splitSource.baseCells.length" @click="actions.waterSplit(splitGroup, [...splitMembers], [...splitCells])">拆出所選成員</ElButton>
      </div>
      <p>每個組件身份代表完整實例，不拆成圖格。原組至少保留一項；新組繼承原顯示開關，名稱須確認，身份由服務端分配。不推測未明確分類的成員；未保存選取不修改內容。</p>
      <div v-if="splitSource" id="water-split-members" class="entity-table-wrap" tabindex="0" aria-label="原組完整成員選擇">
        <p v-for="id in splitSource.memberIds" :key="'member:' + id"><label><input v-model="splitMembers" data-water-member type="checkbox" :value="id" :disabled="busy || model.water.splitLocked">組件 {{ id }}</label></p>
        <p v-for="cell in splitSource.baseCells" :key="'cell:' + cell"><label><input v-model="splitCells" data-water-cell type="checkbox" :value="cell" :disabled="busy || model.water.splitLocked">基礎格 {{ cell }}（{{ cell % 384 }}, {{ Math.floor(cell / 384) }}）</label></p>
      </div>
      <div class="module-toolbar">
        <label>篩選組合名稱／身份<input id="water-filter" v-model="groupFilter" type="search" :disabled="busy || model.water.locked"></label>
        <ElButton id="water-clear-selection" :disabled="busy || model.water.locked || selectedGroups.length === 0" @click="selectedGroups = []">清除全部合併選取</ElButton>
      </div>
      <p id="water-filter-summary" role="status">顯示 {{ filteredGroups.length }}／{{ model.water.rows.length }} 組；已選 {{ selectedGroups.length }} 組（篩選外 {{ hiddenSelectedCount }} 組仍會參與合併）。篩選只影響下方列表，不改內容或拆分選取。</p>
      <p v-if="model.water.rows.length && !filteredGroups.length" id="water-filter-empty">沒有符合篩選的組合；不代表此修訂沒有水域。</p>
      <table id="water-table" class="entity-table"><thead><tr><th>組合身份／名稱</th><th>組件／基礎格</th><th>已讀小地圖設定</th><th>操作</th></tr></thead><tbody>
        <tr v-for="group in filteredGroups" :key="group.groupId" :data-water-id="group.groupId">
          <td><label><input v-model="selectedGroups" data-water-select type="checkbox" :value="group.groupId" :disabled="busy || model.water.locked">{{ group.name ?? '未命名' }}</label><br>{{ group.groupId }}</td><td>{{ group.memberCount }}／{{ group.baseCellCount }}</td>
          <td>{{ group.showOnMinimap ? '顯示' : '不顯示' }}</td>
          <td><ElButton data-water-rename :disabled="busy || model.water.locked" @click="actions.waterRename(group.groupId)">改名</ElButton><ElButton data-water-toggle :disabled="busy || model.water.locked" @click="actions.waterVisibility(group.groupId, !group.showOnMinimap)">{{ group.showOnMinimap ? '設為不顯示' : '設為顯示' }}</ElButton></td>
        </tr>
      </tbody></table>
    </div>
  </section>
</template>
<style scoped>
#water-preview-navigation { position: relative; width: 250px; max-width: 100%; aspect-ratio: 250 / 167; background: #182018; }
#water-preview-navigation.navigable { cursor: crosshair; }
#water-preview-canvas { position: absolute; display: block; border: 0; padding: 0; max-width: none; image-rendering: pixelated; }
#water-preview-window { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; fill: none; stroke: #ffd65a; stroke-width: 1; }
</style>
