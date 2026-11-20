<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ListPagination from './ListPagination.vue';
import ListRowActions from './ListRowActions.vue';
import { usePagination } from './pagination.js';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
// 系統基礎據點＝系統兩大基礎資料之一（與基礎地圖並列），管理員專用。
// 與遊戲級「城池據點」同列同編輯；座標／runtimeSlot 只讀（歸基礎地圖）。
const props = defineProps({ model: Object, actions: Object, busy: Boolean, gameId: String, gameName: String });

const NUMBERS = { max_prod: 65535, prod: 65535, growth: 255, defence: 255, troops: 255, type: 255 };
const FIELDS = ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type'];
const CITY_TYPES = [['0', '大都市'], ['1', '中都市'], ['2', '小都市'], ['3', '關卡'], ['4', '戰場']];
const typeLabel = value => CITY_TYPES.find(([key]) => Number(key) === value)?.[1] ?? (value === null || value === undefined ? '—' : String(value) + '（未知）');

const loading = ref(false);
const search = ref('');
const sort = reactive({ key: 'seq', dir: 1 });
const editing = ref(null);
const form = reactive({ name: '', max_prod: '', prod: '', growth: '', defence: '', troops: '', type: '' });
const status = ref('');
const failure = ref('');
const cityName = value => String(value ?? '').normalize('NFC').trim();

const cities = computed(() => props.model?.cities ?? []);
const loaded = computed(() => cities.value ?? []);
const supported = computed(() => Boolean(props.model?.loaded));
const blessed = computed(() => props.model?.blessed ?? null);
const canLoad = computed(() => !loading.value && !props.busy && !props.model?.locked);
const locked = computed(() => Boolean(props.busy) || Boolean(props.model?.locked));
const canPromote = computed(() => !loading.value && !props.busy && !locked.value && Boolean(props.gameId));

const columns = [
  { key: 'seq', title: '序號', sortable: false },
  { key: 'name', title: '據點名稱', sortable: true, type: 'text' },
  { key: 'max_prod', title: '最大生產', sortable: true, type: 'number' },
  { key: 'prod', title: '當前生產', sortable: true, type: 'number' },
  { key: 'growth', title: '上升值', sortable: true, type: 'number' },
  { key: 'defence', title: '防災值', sortable: true, type: 'number' },
  { key: 'troops', title: '城兵*10', sortable: true, type: 'number' },
  { key: 'type', title: '類型', sortable: true, type: 'number' },
  { key: 'actions', title: '操作', sortable: false },
];

const visible = computed(() => {
  const needle = cityName(search.value).toLocaleLowerCase();
  const list = loaded.value.filter(row => !needle || cityName(row.name).toLocaleLowerCase().includes(needle));
  const { key, dir } = sort;
  const column = columns.find(entry => entry.key === key);
  if (!column?.sortable) return list;
  const ordered = [...list].sort((a, b) => {
    if (column.type === 'number') return (a[key] ?? -1) - (b[key] ?? -1);
    return cityName(a[key]).localeCompare(cityName(b[key]), 'zh-Hant');
  });
  return dir > 0 ? ordered : ordered.reverse();
});
const rows = computed(() => visible.value.map((row, index) => ({ ...row, seq: index + 1 })));
const { currentPage, pageSize, total, pagedRows } = usePagination(rows);
const table = ref(null);
watch(search, () => { currentPage.value = 1; });
watch([currentPage, pageSize, search, () => sort.key, () => sort.dir], () => table.value?.setScrollTop(0), { flush: 'post' });

function onSortChange({ prop, order }) {
  sort.key = prop;
  sort.dir = order === 'descending' ? -1 : 1;
  currentPage.value = 1;
}

async function load() {
  if (!canLoad.value) return;
  loading.value = true;
  currentPage.value = 1;
  status.value = ''; failure.value = ''; editing.value = null;
  props.actions.setEditing(false);
  try { await props.actions.load(); }
  catch (error) { status.value = ''; failure.value = (error && error.message) || '加載未完成。'; return; }
  finally { loading.value = false; }
  const list = cities.value ?? [];
  status.value = supported.value ? '已加載 ' + list.length + ' 座' : '';
}

function startEdit(row) {
  if (locked.value) return;
  editing.value = row.cityId;
  props.actions.setEditing(true);
  form.name = row.name ?? '';
  for (const key of FIELDS) form[key] = row[key] ?? '';
  failure.value = '';
}
function cancelEdit() { editing.value = null; failure.value = ''; props.actions.setEditing(false); }

function validate(row) {
  const name = cityName(form.name);
  if (!name) return '據點名稱不可空白。';
  if ([...name].length > 12) return '據點名稱最多 12 個字。';
  if (loaded.value.some(item => item.cityId !== row.cityId && cityName(item.name) === name)) return '據點名稱「' + name + '」已被其他據點使用。';
  for (const key of FIELDS) {
    const raw = String(form[key] ?? '').trim();
    if (raw === '') { if (row[key] !== null) return key + ' 不可留空；請填 0–' + NUMBERS[key] + ' 的整數。'; continue; }
    if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) > NUMBERS[key]) return key + ' 必須是 0–' + NUMBERS[key] + ' 的整數。';
  }
  return '';
}
async function save(row) {
  if (locked.value) return;
  const problem = validate(row);
  if (problem) { failure.value = problem; return; }
  failure.value = ''; status.value = '';
  const patch = { name: cityName(form.name) };
  for (const key of FIELDS) patch[key] = form[key];
  try {
    const reply = await props.actions.saveCity(row.cityId, patch);
    editing.value = null;
    props.actions.setEditing(false);
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '保存未完成（原因未回報）。';
  }
}
async function promote() {
  if (!canPromote.value) return;
  status.value = ''; failure.value = '';
  try {
    const reply = await props.actions.promote(props.gameId, props.gameName);
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '匯入未完成（原因未回報）。';
  }
}
</script>

<template>
  <section id="base-stronghold-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="base-stronghold-load" :aria-busy="loading" :disabled="!canLoad" @click="load()">加載</ElButton>
      <ElButton id="base-stronghold-promote" :disabled="!canPromote" @click="promote()">從目前遊戲匯入{{ gameName ? `（${gameName}）` : '' }}</ElButton>
      <ElInput id="base-stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱" :disabled="!supported" />
      <span id="base-stronghold-status" role="status" class="stronghold-status">{{ failure || status }}</span>
    </div>
    <div class="module-toolbar">
      <span id="base-stronghold-blessed" class="module-notice">目前基準複製遊戲：{{ blessed ? `${blessed.name}／${blessed.gameId}` : '未設定（尚無成功的完整複製）' }}</span>
    </div>
    <div v-if="supported" class="table-region" tabindex="0">
      <ElTable id="base-stronghold-table" ref="table" :data="pagedRows" height="100%" row-key="cityId" @sort-change="onSortChange">
        <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="column.title" :sortable="column.sortable ? 'custom' : false" :sort-orders="['ascending', 'descending']" :min-width="column.key === 'actions' ? 180 : 120">
          <template #header><span :data-column="column.key" :data-sort="column.sortable ? column.key : undefined">{{ column.title }}</span></template>
          <template #default="{ row }">
            <div :data-field="column.key" :data-city-id="row.cityId" :data-city-seq="row.seq">
              <template v-if="column.key === 'seq'">{{ row.seq }}</template>
              <template v-else-if="column.key === 'actions'">
                <ListRowActions :editing="editing === row.cityId" :busy="busy" :locked="locked" @save="save(row)" @cancel="cancelEdit()" @edit="startEdit(row)" />
              </template>
              <template v-else-if="column.key === 'type'">
                <ElSelect v-if="editing === row.cityId" v-model="form.type" data-input="type" :disabled="busy"><ElOption v-for="[value, label] in CITY_TYPES" :key="value" :value="Number(value)" :label="label" /><ElOption v-if="!CITY_TYPES.some(([value]) => Number(value) === Number(form.type))" :value="form.type" :label="form.type + '（未知）'" /></ElSelect>
                <template v-else>{{ typeLabel(row.type) }}</template>
              </template>
              <template v-else-if="column.key === 'name'">
                <ElInput v-if="editing === row.cityId" v-model="form.name" data-input="name" maxlength="12" :disabled="busy" /><template v-else>{{ row.name ?? '未配置' }}</template>
              </template>
              <template v-else><ElInput v-if="editing === row.cityId" v-model="form[column.key]" :data-input="column.key" inputmode="numeric" :disabled="busy" /><template v-else>{{ row[column.key] ?? '—' }}</template></template>
            </div>
          </template>
        </ElTableColumn>
        <template #empty>{{ search ? '沒有符合的據點；清空搜尋可看全部。' : '據點清單是空的。' }}</template>
      </ElTable>
    </div>
    <p v-else id="base-stronghold-unsupported" class="stronghold-note">先按「加載」讀取系統基礎據點。</p>
    <ListPagination v-if="supported" id="base-stronghold-pagination" v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
  </section>
</template>

<style scoped>
#base-stronghold-editor:not([hidden]) { display: flex; flex-direction: column; overflow: hidden; }
.module-toolbar { flex-shrink: 0; }
.table-region { flex: 1; min-height: 0; overflow: hidden; }
</style>
