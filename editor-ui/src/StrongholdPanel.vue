<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ListPagination from './ListPagination.vue';
import ListRowActions from './ListRowActions.vue';
import { usePagination } from './pagination.js';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
// 城池據點＝這款遊戲的共享資料（192 座，全章共用）。座標由地圖放置寫回，這裡只讀；
// 所屬勢力／首都等屬章節屬性，不在本頁。加載走副本頁，不再經過修訂。
const props = defineProps({ model: Object, actions: Object, busy: Boolean });

const NUMBERS = { max_prod: 65535, prod: 65535, growth: 255, defence: 255, troops: 255, type: 255 };
const FIELDS = ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type'];
// 類型存的是低 4 位索引：原版 CS:7DF5 七條×6B，0 大都市、1 中都市、2 小都市、
// 3 關卡、4 戰場；5 首都／6 中立是同一表後續項，不是合法存儲 type。
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

const page = computed(() => props.model?.copy?.page ?? null);
const cities = computed(() => page.value?.cities ?? null);
const loaded = computed(() => cities.value ?? []);
const supported = computed(() => Boolean(page.value));
const canLoad = computed(() => !loading.value && !props.busy && Boolean(props.model?.fields?.gameId));
const locked = computed(() => Boolean(props.busy) || !props.model || !page.value);

const columns = [
  { key: 'seq', title: '序號', sortable: false },
  { key: 'name', title: '據點名稱', sortable: true, type: 'text' },
  { key: 'max_prod', title: '最大生產', sortable: true, type: 'number' },
  { key: 'prod', title: '當前生產', sortable: true, type: 'number' },
  { key: 'growth', title: '上升值', sortable: true, type: 'number' },
  { key: 'defence', title: '防災值', sortable: true, type: 'number' },
  { key: 'troops', title: '城兵', sortable: true, type: 'number' },
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
// 序號跟著「現在看到的順序」重排，不是據點身份或槽位。
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
  try { await props.actions.loadCopy(); }
  catch (error) { status.value = ''; failure.value = (error && error.message) || '加載未完成。'; return; }
  finally { loading.value = false; }
  const list = cities.value ?? [];
  status.value = page.value ? '已加載 ' + list.length + ' 座' : '';
}

function startEdit(row) {
  if (locked.value) return;
  editing.value = row.cityId;
  form.name = row.name ?? '';
  for (const key of FIELDS) form[key] = row[key] ?? '';
  failure.value = '';
}
function cancelEdit() { editing.value = null; failure.value = ''; }

// 同一套規則服務端還會再驗一次：這裡只為即時顯示，不代替服務端判定。
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
    const reply = await props.actions.cityCopySave(row.cityId, patch);
    editing.value = null;
    // 控制器保存後已重讀副本：行回到只讀時顯示新值，不另起一次讀取。
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '保存未完成（原因未回報）。';
  }
}
</script>

<template>
  <section id="stronghold-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="stronghold-load" :aria-busy="loading" :disabled="!canLoad" @click="load()">加載</ElButton>
      <ElInput id="stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱" :disabled="!supported" />
      <span id="stronghold-status" role="status" class="stronghold-status">{{ failure || status }}</span>
    </div>
    <div v-if="supported" class="table-region" tabindex="0">
      <ElTable id="stronghold-table" ref="table" :data="pagedRows" height="100%" row-key="cityId" @sort-change="onSortChange">
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
    <p v-else id="stronghold-unsupported" class="stronghold-note">先按「加載」讀取這款遊戲的據點資料。</p>
    <ListPagination v-if="supported" id="stronghold-pagination" v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
  </section>
</template>

<style scoped>
#stronghold-editor:not([hidden]) { display: flex; flex-direction: column; overflow: hidden; }
.module-toolbar { flex-shrink: 0; }
.table-region { flex: 1; min-height: 0; overflow: hidden; }
</style>
