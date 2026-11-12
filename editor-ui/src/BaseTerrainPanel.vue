<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElCheckbox, ElCheckboxGroup } from 'element-plus/es/components/checkbox/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const selected = ref([]), tile = ref(''), geography = ref(''), page = ref('');
const valid = computed(() => Number.isSafeInteger(tile.value) && !Object.is(tile.value, -0) && tile.value >= 0 && tile.value <= 255 && Number.isSafeInteger(geography.value) && !Object.is(geography.value, -0) && geography.value >= 0 && geography.value <= 3);
const validPage = computed(() => Number.isSafeInteger(page.value) && page.value >= 1 && page.value <= (props.model?.base?.pages ?? 0));
const locked = computed(() => props.busy || props.model?.base?.locked);
const readLocked = computed(() => props.busy || props.model?.base?.readLocked);
const hiddenSelected = computed(() => selected.value.filter(cell => !props.model.base.rows.some(row => row.cell === cell)).length);
const pageSelected = computed(() => {
  const cells = new Set(selected.value);
  return (props.model?.base?.rows ?? []).filter(row => cells.has(row.cell)).length;
});
const selectedNavigation = computed(() => {
  const base = props.model?.base;
  const navigation = { previous: null, next: null };
  if (!base?.rows.length) return navigation;
  // The current fixed-domain projection supplies the same page size on every page.
  return selected.value.reduce((result, cell) => {
    const target = Math.floor(cell / base.rows.length);
    if (target < base.page && (result.previous === null || target > result.previous)) result.previous = target;
    if (target > base.page && (result.next === null || target < result.next)) result.next = target;
    return result;
  }, navigation);
});
function selectPage(checked) {
  if (locked.value) return;
  const cells = new Set(props.model.base.rows.map(row => row.cell));
  selected.value = checked ? [...new Set([...selected.value, ...cells])] : selected.value.filter(cell => !cells.has(cell));
}
function useWindowCells(selection) {
  const window = props.model?.mapWindow;
  if (locked.value || !props.model?.base?.supported || !props.model?.context?.verified || props.model?.workspace?.layer !== 'base' || !window?.ready || selection.gameId !== props.model.fields.gameId || selection.draftRevision !== props.model.context.draftRevision || selection.sourceDigest !== window.value.sourceDigest) return;
  selected.value = [...new Set([...selected.value, ...selection.cells])];
  props.actions.basePage(Math.floor(selection.cells[0] / props.model.base.rows.length));
}
defineExpose({ useWindowCells, hasInputs: () => tile.value !== '' || geography.value !== '' });
watch([() => props.model?.fields?.gameId, () => props.model?.context?.draftRevision, () => props.model?.context?.verified, () => props.model?.context?.readGeneration], () => { selected.value = []; tile.value = ''; geography.value = ''; page.value = ''; });
</script>
<template>
  <section v-if="model?.base" id="base-terrain-editor">
    <h3>基礎格原值與明確補底</h3>
    <p>這是基礎層數值列表，不是合成地圖或通行預覽。未知圖塊不補零；未知來源記錄不等於目前露出未知。補底不改上層，數值合法不代表可試玩。</p>
    <div class="module-toolbar">
      <label>明確草稿修訂<ElInput id="base-revision" :model-value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event)" /></label>
      <ElButton id="base-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂基礎格</ElButton>
      <ElButton id="base-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="base-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試同一個請求／內容</ElButton>
    </div>
    <p id="base-context">遊戲 {{ model.fields.gameId || '未選擇' }}／已讀 {{ model.context?.draftRevision ?? '未知' }}<strong v-if="model.context && !model.context.verified">／須明確重讀</strong></p>
    <p id="base-status" role="status">{{ model.message }}</p>
    <p v-if="!model.base.supported" id="base-unknown">基礎格資料未知，不能視為空白或全零。</p>
    <template v-else>
      <ElCheckbox id="base-unlock" :model-value="model.base.unlocked" :disabled="readLocked" @change="actions.baseUnlock($event)">明確解鎖基礎層（僅本次工作區，不寫入源）</ElCheckbox>
      <ElCheckbox id="base-page-select" :model-value="model.base.rows.length > 0 && pageSelected === model.base.rows.length" :indeterminate="pageSelected > 0 && pageSelected < model.base.rows.length" :disabled="locked || !model.base.rows.length" @change="selectPage($event)">本頁全選／取消本頁（保留頁外選取，不填數值或保存）</ElCheckbox>
      <p id="base-selection">已選 {{ selected.length }} 格（本頁外 {{ hiddenSelected }} 格仍會覆寫）；未知來源記錄 {{ model.base.unknownCount }} 格。讀取／保存後重新鎖定；不捎帶其它表單。</p>
      <div class="module-toolbar">
        <label>圖塊byte（0–255）<ElInput id="base-tile" v-model.number="tile" type="number" min="0" max="255" step="1" :disabled="locked" /></label>
        <label>地理值（0–3）<ElInput id="base-geography" v-model.number="geography" type="number" min="0" max="3" step="1" :disabled="locked" /></label>
        <ElButton id="base-fill" :disabled="locked || !selected.length || !valid" @click="actions.baseFill([...selected], tile, geography)">確認覆寫所選基礎格</ElButton>
        <ElButton id="base-clear" :disabled="locked || !selected.length" @click="selected = []">清除全部選取</ElButton>
        <ElButton id="base-cancel-inputs" :disabled="readLocked || (tile === '' && geography === '')" @click="tile = ''; geography = ''">取消補底準備（保留選格／不保存）</ElButton>
      </div>
      <p>取消補底準備只清空圖塊byte與地理值，保留頁外選格、頁碼及其它表單；不讀取、不保存、不解除基礎層鎖。原保存操作尚未確認時不可取消。</p>
      <ElCheckboxGroup v-model="selected"><ElTable id="base-table" :data="model.base.rows" row-key="cell"><ElTableColumn label="格索引／選取" min-width="180"><template #default="{ row }"><span :data-base-cell="row.cell"><ElCheckbox data-base-select :value="row.cell" :disabled="locked">{{ row.cell }}</ElCheckbox></span></template></ElTableColumn><ElTableColumn label="座標" min-width="120"><template #default="{ row }">{{ row.x }}, {{ row.y }}</template></ElTableColumn><ElTableColumn label="基礎圖塊" min-width="160"><template #default="{ row }"><span data-base-tile>{{ row.tile === null ? '未知（未補值）' : row.tile }}</span></template></ElTableColumn><ElTableColumn prop="geography" label="地理值" min-width="120" /><ElTableColumn label="未知來源記錄" min-width="160"><template #default="{ row }">{{ row.unknownUnderlay ? '有' : '無' }}</template></ElTableColumn></ElTable></ElCheckboxGroup>
      <div class="module-toolbar">
        <ElButton id="base-prev" :disabled="readLocked || model.base.page === 0" @click="actions.basePage(model.base.page - 1)">上一頁基礎格</ElButton>
        <ElButton id="base-selected-prev" :disabled="readLocked || selectedNavigation.previous === null" @click="actions.basePage(selectedNavigation.previous)">上一已選頁</ElButton>
        <span id="base-page">{{ model.base.page + 1 }}／{{ model.base.pages }}</span>
        <ElButton id="base-selected-next" :disabled="readLocked || selectedNavigation.next === null" @click="actions.basePage(selectedNavigation.next)">下一已選頁</ElButton>
        <ElButton id="base-next" :disabled="readLocked || model.base.page + 1 >= model.base.pages" @click="actions.basePage(model.base.page + 1)">下一頁基礎格</ElButton>
        <label>頁碼<ElInput id="base-page-input" v-model.number="page" type="number" min="1" :max="model.base.pages" step="1" :disabled="readLocked" /></label>
        <ElButton id="base-page-go" :disabled="readLocked || !validPage" @click="actions.basePage(page - 1)">前往頁碼</ElButton>
      </div>
      <p>已選頁導航跳到前方／後方最近含選格的頁，不循環；只切換已讀基礎格列表，不改選格、補底參數或手填頁碼，也不讀取或保存。基礎層鎖定仍可檢視，原保存未確認時禁用。</p>
    </template>
  </section>
</template>
