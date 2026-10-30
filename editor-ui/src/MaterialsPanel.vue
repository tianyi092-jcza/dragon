<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean, shiftCandidate: Object });
const emit = defineEmits(['placement-ready', 'placement-footprint', 'placement-drag', 'shift-anchor', 'shift-preview']);
const selected = ref([]), instanceFilter = ref(''), selectedOnly = ref(false), materialFilter = ref(''), authorOnly = ref(false);
const instancePage = ref(0), materialPage = ref(0), pageSize = 24;
const shiftX = ref(''), shiftY = ref(''), shiftAnchorId = ref('');
const placeId = ref(''), placeVariant = ref(''), placeX = ref(''), placeY = ref(''), placeWater = ref('');
const placement = computed(() => props.model?.materials?.placement);
const variants = computed(() => placement.value?.materials.find(row => row.materialId === placeId.value)?.variantRefs ?? []);
const offsets = computed(() => placement.value?.materials.find(row => row.materialId === placeId.value)?.offsets);
const footprintFits = computed(() => !offsets.value || offsets.value.every(([dx, dy]) => placeX.value + dx >= 0 && placeX.value + dx < 384 && placeY.value + dy >= 0 && placeY.value + dy < 256));
const validPlace = computed(() => variants.value.includes(placeVariant.value) && Number.isInteger(placeWater.value) && placeWater.value >= 0 && placeWater.value < placement.value.waterClasses.length && Number.isSafeInteger(placeX.value) && !Object.is(placeX.value, -0) && placeX.value >= 0 && placeX.value < 384 && Number.isSafeInteger(placeY.value) && !Object.is(placeY.value, -0) && placeY.value >= 0 && placeY.value < 256 && footprintFits.value);
function choosePlacement(id = '') { placeId.value = id; placeVariant.value = ''; placeX.value = ''; placeY.value = ''; placeWater.value = ''; }
const validShift = computed(() => [shiftX.value, shiftY.value].every(value => Number.isSafeInteger(value) && !Object.is(value, -0)) && (shiftX.value !== 0 || shiftY.value !== 0));
const locked = computed(() => props.busy || props.model?.materials?.locked);
const instanceLocked = computed(() => locked.value || props.model?.materials?.decorationLocked || props.model?.workspace?.layer !== 'decor');
const canPickPoint = computed(() => !instanceLocked.value && !!props.model?.context?.verified && variants.value.includes(placeVariant.value) && Number.isInteger(placeWater.value) && placeWater.value >= 0 && placeWater.value < placement.value.waterClasses.length);
watch(canPickPoint, value => emit('placement-ready', value), { immediate: true });
watch([canPickPoint, offsets, placeId, placeVariant], () => emit('placement-footprint', canPickPoint.value && offsets.value ? { materialId: placeId.value, variantRef: placeVariant.value, offsets: offsets.value } : null), { immediate: true });
function useWindowPoint(point) {
  const window = props.model?.mapWindow;
  if (!canPickPoint.value || !window?.ready || point.gameId !== props.model.fields.gameId || point.draftRevision !== props.model.context.draftRevision || point.sourceDigest !== window.value.sourceDigest) return;
  placeX.value = point.x; placeY.value = point.y;
}
const shiftAnchor = computed(() => selected.value.includes(shiftAnchorId.value) ? props.model?.materials?.instances.find(row => row.instanceId === shiftAnchorId.value) ?? null : null);
watch(shiftAnchor, value => { if (!value) shiftAnchorId.value = ''; });
watch([shiftAnchor, instanceLocked, selected], () => emit('shift-anchor', !instanceLocked.value && props.model?.context?.verified && shiftAnchor.value ? { instanceId: shiftAnchor.value.instanceId, x: shiftAnchor.value.x, y: shiftAnchor.value.y } : null), { immediate: true });
function canUseShiftPoint(point) {
  const window = props.model?.mapWindow;
  return point && !instanceLocked.value && props.model?.context?.verified && shiftAnchor.value && point.anchorId === shiftAnchor.value.instanceId && window?.ready && point.gameId === props.model.fields.gameId && point.draftRevision === props.model.context.draftRevision && point.sourceDigest === window.value.sourceDigest;
}
function useShiftPoint(point) {
  if (!canUseShiftPoint(point)) return;
  shiftX.value = point.x - shiftAnchor.value.x; shiftY.value = point.y - shiftAnchor.value.y;
}
const shiftPreview = computed(() => {
  const window = props.model?.mapWindow;
  const candidate = props.shiftCandidate;
  if (instanceLocked.value || !props.model?.context?.verified || !selected.value.length || !window?.ready || window.locked) return null;
  if (candidate ? !canUseShiftPoint(candidate) : !validShift.value) return null;
  const shift = candidate ? { x: candidate.x - shiftAnchor.value.x, y: candidate.y - shiftAnchor.value.y } : { x: shiftX.value, y: shiftY.value };
  const view = candidate ? { ...window.value, x: candidate.windowX, y: candidate.windowY } : window.value, cells = new Set();
  const chosen = new Set(selected.value);
  // Source order, not checkbox click order, owns overlap in the target ghost.
  const instances = props.model.materials.instances.filter(row => chosen.has(row.instanceId));
  const definitions = new Map((placement.value?.materials ?? []).map(row => [row.materialId, row]));
  const picture = new Map();
  let outside = 0, unknown = selected.value.length - instances.length, unknownVisual = 0;
  for (const instance of instances) {
    const definition = definitions.get(instance.materialId), offsets = definition?.offsets;
    if (!offsets) { unknown++; continue; }
    const tiles = definition.visualVariants?.find(row => row.variantRef === instance.variantRef)?.tiles;
    if (!tiles) unknownVisual++;
    const values = new Map(tiles?.map(([x, y, tile]) => [x + ',' + y, tile]));
    for (const [dx, dy] of offsets) {
      const x = instance.x + shift.x + dx, y = instance.y + shift.y + dy;
      if (x < 0 || x >= 384 || y < 0 || y >= 256) outside++;
      else if (x >= view.x && x < view.x + view.width && y >= view.y && y < view.y + view.height) {
        const cell = y * 384 + x; cells.add(cell);
        // Unknown upper visuals erase lower known pixels, never invent a top tile.
        picture.set(cell, values.get(dx + ',' + dy) ?? null);
      }
    }
  }
  return { gameId: view.gameId, draftRevision: view.draftRevision, sourceDigest: view.sourceDigest,
    x: view.x, y: view.y, width: view.width, height: view.height, outside, unknown, count: selected.value.length, transient: !!candidate,
    cells: [...cells].map(cell => [cell % 384, Math.floor(cell / 384)]), unknownVisual,
    tiles: unknown ? [] : [...picture].filter(([, tile]) => tile !== null).map(([cell, tile]) => [cell % 384 - view.x, Math.floor(cell / 384) - view.y, tile]) };
});
watch(shiftPreview, value => emit('shift-preview', value), { immediate: true });
defineExpose({ useWindowPoint, useShiftPoint, hasInputs: () => placeId.value !== '' || shiftX.value !== '' || shiftY.value !== '' });
const dragPayload = computed(() => {
  const window = props.model?.mapWindow, atlas = props.model?.mapAtlas;
  if (!canPickPoint.value || !offsets.value || !window?.ready || !atlas?.ready) return null;
  const value = window.value;
  return JSON.stringify([value.gameId, value.draftRevision, value.sourceDigest, value.x, value.y, value.width, value.height, atlas.info.season, placeId.value, placeVariant.value, placement.value.waterClasses[placeWater.value]]);
});
function startLibraryDrag(event, id) {
  if (!dragPayload.value || id !== placeId.value) { event.preventDefault(); return; }
  event.dataTransfer.setData('application/x-wolong-material-placement', dragPayload.value);
  event.dataTransfer.effectAllowed = 'copy';
  emit('placement-drag', dragPayload.value);
}
watch(dragPayload, () => emit('placement-drag', null));
onBeforeUnmount(() => emit('placement-drag', null));
const canTakeSelection = computed(() => !locked.value && props.model?.decorationSelection?.ready && !props.model.decorationSelection.locked && props.model.decorationSelection.selectedIds.length > 0);
function takeSelection() {
  const ids = props.actions.takeDecorationSelection();
  if (ids !== null) selected.value = ids;
}
const canAnchorSelection = computed(() => canTakeSelection.value && !instanceLocked.value && props.model.decorationSelection.selectedIds.length === 1);
function takeSelectionAnchor() {
  if (!canAnchorSelection.value) return;
  const ids = props.actions.takeDecorationSelection();
  if (ids?.length !== 1 || !canAnchorSelection.value) return;
  selected.value = ids; shiftAnchorId.value = ids[0];
}
const matches = (values, query) => values.some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));
const instances = computed(() => {
  const chosen = selectedOnly.value ? new Set(selected.value) : null;
  return (props.model?.materials?.instances ?? []).filter(row => (!chosen || chosen.has(row.instanceId)) && matches([row.instanceId, row.materialId], instanceFilter.value));
});
const materials = computed(() => (props.model?.materials?.rows ?? []).filter(row => (!authorOnly.value || row.authorEditable) && matches([row.materialId, row.name], materialFilter.value)));
const splitKnown = computed(() => Array.isArray(props.model?.materials?.splitCandidates));
const splitCounts = computed(() => new Map((props.model?.materials?.splitCandidates ?? []).map(row => [row.instanceId, row.childCount])));
function splitLabel(id) {
  if (!splitKnown.value) return '候選未知';
  const count = splitCounts.value.get(id);
  return count == null ? '非多格候選' : `${count} 格候選`;
}
const layerPositions = computed(() => new Map((props.model?.materials?.instances ?? []).map((row, index) => [row.instanceId, index + 1])));
const instanceRows = computed(() => instances.value.slice(instancePage.value * pageSize, (instancePage.value + 1) * pageSize));
const materialRows = computed(() => materials.value.slice(materialPage.value * pageSize, (materialPage.value + 1) * pageSize));
const pageSelected = computed(() => {
  const ids = new Set(selected.value);
  return instanceRows.value.filter(row => ids.has(row.instanceId)).length;
});
function selectInstancePage(checked) {
  if (locked.value) return;
  const ids = new Set(instanceRows.value.map(row => row.instanceId));
  selected.value = checked ? [...new Set([...selected.value, ...ids])] : selected.value.filter(id => !ids.has(id));
}
const pictureVariant = row => row.materialId === placeId.value && placeVariant.value ? placeVariant.value : 'original';
const hiddenSelected = computed(() => selected.value.filter(id => !instanceRows.value.some(row => row.instanceId === id)).length);
watch([instanceFilter, selectedOnly], () => { instancePage.value = 0; });
watch(() => instances.value.length, count => { instancePage.value = Math.min(instancePage.value, Math.max(0, Math.ceil(count / pageSize) - 1)); });
watch([materialFilter, authorOnly], () => { materialPage.value = 0; });
watch([() => props.model?.fields?.gameId, () => props.model?.context?.draftRevision, () => props.model?.context?.verified, () => props.model?.context?.readGeneration], () => {
  choosePlacement(); selected.value = []; shiftX.value = ''; shiftY.value = ''; shiftAnchorId.value = ''; instanceFilter.value = ''; selectedOnly.value = false; materialFilter.value = ''; authorOnly.value = false; instancePage.value = 0; materialPage.value = 0;
});
</script>
<template>
  <section v-if="model?.materials" id="materials-editor">
    <h3>作者素材與完整裝飾實例</h3>
    <p>從已保存的完整裝飾實例擷取素材不改地圖；整批平移會改變所選實例座標，可能露出未知底層。原配方唯讀；移除素材定義只限無引用作者素材。移除裝飾實例會露出目前下層，未知底層不補值；兩者都不刪除舊修訂或共享資源。</p>
    <p>共用遊戲資料的單一保存操作，只保存本次素材或裝飾命令，不捎帶其它表單。成功後須明確讀取收據修訂；未知回應先查詢原鍵。</p>
    <div class="module-toolbar">
      <label>明確草稿修訂<input id="material-revision" :value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event.target.value)"></label>
      <ElButton id="material-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂素材</ElButton>
      <ElButton id="material-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="material-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試原鍵／內容</ElButton>
    </div>
    <p id="material-context">遊戲 {{ model.fields.gameId || '未選擇' }}／已載入 {{ model.context?.draftRevision ?? '未知' }}<strong v-if="model.context && !model.context.verified">／須明確重讀</strong></p>
    <p id="material-status" role="status">{{ model.message }}</p>
    <p v-if="!model.materials.supported" id="material-unknown">素材或實例資料未知，不能視為空庫。請明確載入完整摘要。</p>
    <template v-else>
      <div class="module-toolbar">
        <ElButton id="material-decoration-lock" :disabled="busy || !model.context?.verified" :aria-pressed="model.materials.decorationLocked" @click="actions.decorLock(!model.materials.decorationLocked)">{{ model.materials.decorationLocked ? '解鎖裝飾層' : '鎖定裝飾層' }}</ElButton>
        <span id="material-decoration-lock-state">{{ model.materials.decorationLocked ? '裝飾實例已鎖定' : '裝飾實例可編輯' }}</span>
      </div>
      <p>裝飾鎖只保護放置、平移、調序、拆分與移除實例，不改顯隱或草稿。篩選、勾選、素材庫與原鍵查詢不受此鎖限制；裝飾寫入重試須先解鎖，已發出的請求不會被取消。</p>
      <h4>擷取完整裝飾實例</h4>
      <p>列出已保存的身份、目前變體及格座標。實例縮圖只用服務確認的目前變體與同修訂季節圖集；舊摘要未提供變體時明示未知，不代用original。缺圖集或貼圖配方保持空白，不是移動後合成或運行准入。定位錨點只移動同修訂已讀窗口並捲動畫布，不改勾選、表單或實例；靠邊時限制窗口在地圖內，保留季節及顯隱。整圖已讀時不另發請求，否則沿原窗口讀取；沒有窗口須先明確讀取。定位不受裝飾鎖或目前編輯層限制，也不代讀圖集。服務仍核對完整footprint、分類及配方；不保證任意選取可擷取。</p>
      <div class="module-toolbar">
        <label>篩選實例／定義<input id="material-instance-filter" v-model="instanceFilter" type="search" :disabled="locked"></label>
        <label><input id="material-selected-only" v-model="selectedOnly" type="checkbox" :disabled="locked">只看已勾選</label>
        <ElButton id="material-capture" :disabled="locked || !selected.length" @click="actions.material('material-capture', [...selected])">擷取所選實例</ElButton>
        <ElButton id="material-remove-instances" :disabled="instanceLocked || !selected.length" @click="actions.removeInstances([...selected])">移除所選裝飾實例</ElButton>
        <ElButton id="material-use-window-selection" :disabled="!canTakeSelection" @click="takeSelection">以窗口選取取代勾選</ElButton>
        <ElButton id="material-use-window-anchor" :disabled="!canAnchorSelection" @click="takeSelectionAnchor">取用單項並設為位移錨點</ElButton>
        <ElButton id="material-clear-window-selection" :disabled="locked || !model.decorationSelection?.ready" @click="actions.clearDecorationSelection()">清除窗口選取（保留勾選與錨點）</ElButton>
        <ElButton id="material-clear" :disabled="locked || !selected.length" @click="selected = []">清除全部選取</ElButton>
      </div>
      <p>窗口框選不自動改變勾選。可在確認後以同修訂累計集合取代全部勾選（包含頁外項目）；此步不執行任何素材或地圖命令，仍須另選操作並確認。單項結果可明確取用並設為位移錨點，不必翻頁尋找實例；只在裝飾層解鎖時可用，不改篩選／頁碼或X／Y位移，仍須自行指示目標並確認保存。</p>
      <label><input id="material-page-select" :key="JSON.stringify(instanceRows.map(row => row.instanceId))" type="checkbox" :checked="instanceRows.length > 0 && pageSelected === instanceRows.length" :indeterminate.prop="pageSelected > 0 && pageSelected < instanceRows.length" :disabled="locked || !instanceRows.length" @change="selectInstancePage($event.target.checked)">本頁全選／取消本頁（保留頁外選取）</label>
      <p id="material-selection">符合 {{ instances.length }}／{{ model.materials.instances.length }} 個；已選 {{ selected.length }}（本頁外 {{ hiddenSelected }} 個仍會參與擷取、平移、調序或移除）。篩選與翻頁不改內容。「只看已勾選」可與文字篩選合用，仍按原繪製序列出；取消勾選後該列離開此檢視，取消篩選不復活已取消的勾選。</p>
      <div class="module-toolbar">
        <span id="material-shift-anchor">取點位移錨點：<template v-if="shiftAnchor">{{ shiftAnchor.instanceId }}（{{ shiftAnchor.x }}, {{ shiftAnchor.y }}）</template><template v-else>請在已勾選實例列明確選擇</template></span>
        <label>X 位移（格）<input id="material-shift-x" v-model.number="shiftX" type="number" step="1" :disabled="locked"></label>
        <label>Y 位移（格）<input id="material-shift-y" v-model.number="shiftY" type="number" step="1" :disabled="locked"></label>
        <ElButton id="material-translate" :disabled="instanceLocked || !selected.length || !validShift" @click="actions.translate([...selected], shiftX, shiftY)">整批平移所選實例</ElButton>
        <ElButton id="material-shift-clear" :disabled="locked || (shiftX === '' && shiftY === '')" @click="shiftX = ''; shiftY = ''">取消位移準備（不保存）</ElButton>
      </div>
      <div class="module-toolbar">
        <ElButton id="material-order-up" :disabled="instanceLocked || !selected.length" @click="actions.reorder([...selected], 1)">上移（較後繪製）</ElButton>
        <ElButton id="material-order-down" :disabled="instanceLocked || !selected.length" @click="actions.reorder([...selected], -1)">下移（較先繪製）</ElButton>
      </div>
      <p>同層調序按整個裝飾層計算，不是只在篩選頁交換；每個選中塊越過一個相鄰未選實例。重疊水域摘要可能改變，城市與道路不變；邊界操作可能沒有變化。</p>
      <p>可明確輸入兩個整數位移，或選定已勾選實例為錨點，再在上方圖塊窗口檢查圖格並取用為錨點目的地。取點只填X／Y，所有勾選實例共用同一位移，不移動或保存內容，仍須另按整批平移並確認；至少一軸非零才可提交。服務端核對完整占格，不裁切；未知底層未補齊時不能通過嚴格編譯。取消位移準備只清空X／Y，保留實例勾選、篩選及素材放置參數；不讀取或保存。窗口另提供位移目標拖曳，拖動只預覽、鬆手才填參數，仍不是可玩預覽。</p>
      <div class="entity-table-wrap"><table id="material-instance-table" class="entity-table"><thead><tr><th>完整實例身份</th><th>定義身份／目前變體</th><th>繪製序（1先）</th><th>格座標</th><th>完整拆分</th></tr></thead><tbody>
        <tr v-for="row in instanceRows" :key="row.instanceId" :data-instance-id="row.instanceId"><td><label><input v-model="selected" type="checkbox" data-material-select :value="row.instanceId" :disabled="locked">{{ row.instanceId }}</label></td><td>{{ row.materialId }}<br><span data-instance-variant>{{ row.variantRef ?? '未知（舊摘要未提供）' }}</span><canvas v-if="row.variantRef" :ref="canvas => actions.drawMaterialPreview(canvas, row.materialId, row.variantRef)" data-instance-picture width="128" height="128" :aria-label="`${row.instanceId}／${row.variantRef} 目前變體縮圖`"></canvas></td><td data-layer-order>{{ layerPositions.get(row.instanceId) }}</td><td><span data-instance-coordinates>{{ row.x }}, {{ row.y }}</span><br><ElButton data-instance-locate :disabled="locked || !model.mapWindow?.ready" @click="actions.locateInstance(row.instanceId)">定位錨點</ElButton><ElButton data-instance-shift-anchor :disabled="instanceLocked || !selected.includes(row.instanceId)" @click="shiftAnchorId = row.instanceId">用作位移錨點</ElButton></td><td><ElButton data-decoration-split :disabled="instanceLocked || splitCounts.get(row.instanceId) == null" @click="actions.split(row.instanceId)">拆分全部圖格</ElButton><span data-split-count>{{ splitLabel(row.instanceId) }}</span></td></tr>
      </tbody></table></div>
      <p>拆分只針對該列完整實例，不使用勾選集合或篩選頁；候選數量不保證配方核驗成功。子身份由服務分配，收據後須重讀，不提前移除父實例。</p>
      <p v-if="!instances.length">沒有符合篩選的實例；不代表其它引用不存在。</p>
      <div class="module-toolbar"><ElButton id="material-instance-prev" :disabled="locked || instancePage === 0" @click="instancePage--">上一頁實例</ElButton><span>{{ instancePage + 1 }}／{{ Math.max(1, Math.ceil(instances.length / pageSize)) }}</span><ElButton id="material-instance-next" :disabled="locked || (instancePage + 1) * pageSize >= instances.length" @click="instancePage++">下一頁實例</ElButton></div>
      <h4>放置完整素材</h4>
      <p v-if="!placement" id="material-placement-unknown">放置選項未知；不能猜測變體或水域類別。其它素材操作仍依已讀資料處理。</p>
      <template v-else>
        <p id="material-placement-selection">目標素材：{{ placeId || '請在素材列選擇放置' }}。座標為圖格；完整占格由服務核驗，不裁切。可在上方畫布檢查圖格後明確取用落點；只填入X／Y，不複製合成值、不自動保存。窗口提供占用格及已知配方貼圖預覽，仍不是可玩認證；選項完整、偏移及窗口已讀後，可從下方該素材列的拖放按鈕拖至窗口定位。</p>
        <div class="module-toolbar">
          <label>明確變體<select id="material-place-variant" v-model="placeVariant" :disabled="locked || !placeId"><option disabled value="">請選擇</option><option v-for="variant in variants" :key="variant" :value="variant">{{ variant }}</option></select></label>
          <label>X 格<input id="material-place-x" v-model.number="placeX" type="number" min="0" max="383" step="1" :disabled="locked || !placeId"></label>
          <label>Y 格<input id="material-place-y" v-model.number="placeY" type="number" min="0" max="255" step="1" :disabled="locked || !placeId"></label>
          <label>明確水域類別<select id="material-place-water" v-model="placeWater" :disabled="locked || !placeId"><option disabled value="">請選擇</option><option v-for="(kind, index) in placement.waterClasses" :key="index" :value="index">{{ kind === null ? '不指定水域組合（非判定陸地）' : kind }}</option></select></label>
          <ElButton id="material-place" :disabled="instanceLocked || !validPlace" @click="actions.place(placeId, placeVariant, placeX, placeY, placement.waterClasses[placeWater])">確認放置完整素材</ElButton>
          <ElButton id="material-place-clear" :disabled="locked || !placeId" @click="choosePlacement()">取消放置準備（不保存）</ElButton>
        </div>
      </template>
      <h4>已讀素材庫</h4>
      <p id="material-picture-context">貼圖使用同修訂已讀季節圖集：{{ model.mapAtlas?.ready ? model.mapAtlas.info.season : '尚未讀取' }}。未選放置變體時只展示具名original示例，不代選放置參數；選定變體後顯示該變體。未知配方／貼圖或缺圖集保持空白；透明空隙不是補底或通行判定。</p>
      <div class="module-toolbar"><label>篩選名稱／身份<input id="material-filter" v-model="materialFilter" type="search" :disabled="locked"></label><label><input id="material-author-only" v-model="authorOnly" type="checkbox" :disabled="locked">僅作者素材</label></div>
      <p id="material-count">符合 {{ materials.length }}／{{ model.materials.rows.length }} 項；引用只列目前具名消費者，不代表完整資源刪除閉包。</p>
      <div class="entity-table-wrap"><table id="material-table" class="entity-table"><thead><tr><th>名稱／身份</th><th>格數／類別</th><th>目前引用</th><th>操作</th></tr></thead><tbody>
        <tr v-for="row in materialRows" :key="row.materialId" :data-material-id="row.materialId"><td><canvas :ref="canvas => actions.drawMaterialPreview(canvas, row.materialId, pictureVariant(row))" data-material-picture width="128" height="128" :aria-label="`${row.name ?? '未命名'}／${pictureVariant(row)} 貼圖示例`"></canvas><br><span data-material-picture-variant>{{ pictureVariant(row) }}</span><br>{{ row.name ?? '未命名' }}<br>{{ row.materialId }}</td><td>{{ row.cellCount }}／{{ row.authorEditable ? '作者素材' : '原配方唯讀' }}</td><td><details><summary>{{ row.references.length }} 項</summary><ul><li v-for="reference in row.references" :key="reference">{{ reference }}</li></ul></details></td><td><ElButton data-material-place :disabled="locked || !placement" @click="choosePlacement(row.materialId)">選擇放置</ElButton><ElButton data-material-drag :disabled="!dragPayload || row.materialId !== placeId" :draggable="!!dragPayload && row.materialId === placeId" @dragstart="startLibraryDrag($event, row.materialId)" @dragend="emit('placement-drag', null)">拖放至圖塊窗口</ElButton><ElButton data-material-rename :disabled="locked || !row.authorEditable" @click="actions.material('material-rename', row.materialId)">更名</ElButton><ElButton data-material-remove :disabled="locked || !row.authorEditable || row.references.length > 0" @click="actions.material('material-remove', row.materialId)">移除</ElButton></td></tr>
      </tbody></table></div>
      <p v-if="!materials.length">沒有符合篩選的素材。</p>
      <div class="module-toolbar"><ElButton id="material-prev" :disabled="locked || materialPage === 0" @click="materialPage--">上一頁素材</ElButton><span>{{ materialPage + 1 }}／{{ Math.max(1, Math.ceil(materials.length / pageSize)) }}</span><ElButton id="material-next" :disabled="locked || (materialPage + 1) * pageSize >= materials.length" @click="materialPage++">下一頁素材</ElButton></div>
    </template>
  </section>
</template>

<style scoped>
[data-instance-picture] { display: block; width: 64px; height: 64px; image-rendering: pixelated; background: repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 16px 16px; }
[data-material-picture] { width: 96px; height: 96px; image-rendering: pixelated; background: repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 16px 16px; }
</style>
