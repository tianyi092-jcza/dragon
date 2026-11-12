<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElCheckbox, ElCheckboxGroup } from 'element-plus/es/components/checkbox/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const selected = ref([]), visibility = ref(''), filter = ref(''), page = ref(0);
defineExpose({ hasInputs: () => visibility.value !== '' });
const candidates = computed(() => props.model?.water?.createCandidates ?? null);
const entries = computed(() => candidates.value ? [
  ...candidates.value.memberIds.map(id => ({ key: `member:${id}`, label: `完整組件 ${id}` })),
  ...candidates.value.baseCells.map(cell => ({ key: `cell:${cell}`, label: `基礎水格 ${cell}（${cell % 384}, ${Math.floor(cell / 384)}）` })),
] : []);
const filtered = computed(() => { const query = filter.value.trim().toLowerCase(); return entries.value.filter(row => !query || row.label.toLowerCase().includes(query)); });
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 24)));
const currentPage = computed(() => Math.min(page.value, pages.value - 1));
const rows = computed(() => filtered.value.slice(currentPage.value * 24, (currentPage.value + 1) * 24));
const hidden = computed(() => { const visible = new Set(rows.value.map(row => row.key)); return selected.value.filter(key => !visible.has(key)).length; });
const locked = computed(() => props.busy || props.model?.water?.createLocked !== false);
watch(filter, () => { page.value = 0; });
watch([() => props.model?.fields?.gameId, () => props.model?.context?.draftRevision, () => props.model?.context?.verified, () => props.model?.context?.readGeneration, () => candidates.value !== null], () => {
  selected.value = []; visibility.value = ''; filter.value = ''; page.value = 0;
});
function create() {
  const members = selected.value.filter(key => key.startsWith('member:')).map(key => key.slice(7));
  const cells = selected.value.filter(key => key.startsWith('cell:')).map(key => Number(key.slice(5)));
  props.actions.waterCreate(members, cells, visibility.value === 'yes');
}
</script>
<template>
  <section id="water-create-editor">
    <h4>從明確候選新建水域組合</h4>
    <p>選擇完整組件及基礎水格；已在原組內的成員會轉入新組，原組保留餘項，空組移除。這不是拆開多格實例或改變地形分類。名稱與影響由確認視窗列出，新身份由服務端分配。</p>
    <p v-if="!candidates" id="water-create-unknown">此修訂沒有提供新建候選，不能視為空庫；請用上方按鈕明確載入。</p>
    <template v-else>
      <div class="module-toolbar">
        <label>篩選候選<ElInput id="water-create-filter" v-model="filter" type="search" :disabled="locked" /></label>
        <label>新組小地圖設定<ElSelect id="water-create-visibility" v-model="visibility" :disabled="locked"><ElOption value="" disabled label="請明確選擇" /><ElOption value="yes" label="顯示" /><ElOption value="no" label="不顯示" /></ElSelect></label>
        <ElButton id="water-create-clear" :disabled="locked || !selected.length" @click="selected = []">清除全部新建選取</ElButton>
        <ElButton id="water-create-cancel" :disabled="locked || (!visibility && !selected.length)" @click="selected = []; visibility = ''">取消新建準備</ElButton>
        <ElButton id="water-create-save" :disabled="locked || !selected.length || !visibility" @click="create">新建所選水域組合</ElButton>
      </div>
      <p id="water-create-summary">共 {{ entries.length }} 項候選；篩選 {{ filtered.length }} 項；已選 {{ selected.length }} 項（本頁外 {{ hidden }} 項仍會加入新組）。未保存選取不修改內容。</p>
      <div class="module-toolbar">
        <ElButton id="water-create-prev" :disabled="locked || currentPage === 0" @click="page = currentPage - 1">上一頁候選</ElButton>
        <span id="water-create-page">{{ currentPage + 1 }}／{{ pages }}</span>
        <ElButton id="water-create-next" :disabled="locked || currentPage + 1 >= pages" @click="page = currentPage + 1">下一頁候選</ElButton>
      </div>
      <p v-if="!filtered.length">沒有符合篩選的候選；不代表沒有水域。</p>
      <ElCheckboxGroup v-model="selected"><ElTable id="water-create-candidates" :data="rows" row-key="key" :show-header="false" aria-label="新建水域完整候選"><ElTableColumn><template #default="{ row }"><ElCheckbox data-water-create-candidate :value="row.key" :disabled="locked">{{ row.label }}</ElCheckbox></template></ElTableColumn></ElTable></ElCheckboxGroup>
    </template>
  </section>
</template>
