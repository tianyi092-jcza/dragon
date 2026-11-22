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
import { siegeLabel, siegeValid, siegeInType, thumbUrl } from "./siegebattletypes.js";
import SiegeThumbPicker from './SiegeThumbPicker.vue';
const loading = ref(false);
const search = ref('');
const sort = reactive({ key: 'seq', dir: 1 });
const editing = ref(null);
const form = reactive({ name: '', max_prod: '', prod: '', growth: '', defence: '', troops: '', type: '', battleMapId: '', troops_cap: '' });
const creating = ref(false);
const pickerVisible = ref(false);
const createPickerVisible = ref(false);
const create = reactive({ name: '', max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1, battleMapId: '', troops_cap: 60 });
// 類型先行：類型一切換，戰場若不在該類型子集內即清空重選（新增與編輯同規則）。
watch(() => form.type, type => { if (form.battleMapId && !siegeInType(form.battleMapId, type)) form.battleMapId = ''; });
watch(() => create.type, type => { if (create.battleMapId && !siegeInType(create.battleMapId, type)) create.battleMapId = ''; });
const status = ref('');
const failure = ref('');
const cityName = value => String(value ?? '').normalize('NFC').trim();

const page = computed(() => props.model?.copy?.page ?? null);
const cities = computed(() => page.value?.cities ?? null);
const placements = computed(() => page.value?.placements ?? {});
const mapPlaced = row => Boolean(placements.value[row.cityId]);
const mapLabel = row => { const place = placements.value[row.cityId]; return place ? `${place.x}, ${place.y}` : ''; };
const loaded = computed(() => cities.value ?? []);
const supported = computed(() => Boolean(page.value));
const canLoad = computed(() => !loading.value && !props.busy && Boolean(props.model?.fields?.gameId));
const locked = computed(() => Boolean(props.busy) || !props.model || !page.value);

const columns = [
  { key: 'seq', title: '序號', sortable: false },
  { key: 'name', title: '據點名稱', sortable: true, type: 'text' },
  { key: 'map', title: '地圖座標', sortable: false },
  { key: 'max_prod', title: '最大生產', sortable: true, type: 'number' },
  { key: 'prod', title: '當前生產', sortable: true, type: 'number' },
  { key: 'growth', title: '上升值', sortable: true, type: 'number' },
  { key: 'defence', title: '防災值', sortable: true, type: 'number' },
  { key: 'troops', title: '城兵*10', sortable: true, type: 'number' },
  { key: 'type', title: '類型', sortable: true, type: 'number' },
  { key: 'troops_cap', title: '城兵上限', sortable: true, type: 'number' },
  { key: 'battleMapId', title: '攻城戰場', sortable: true, type: 'text' },
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

const canRemove = row => !locked.value && editing.value === null && !mapPlaced(row);
const removeReasons = { COPY_CITY_PLACED: '該據點已在地圖上使用，請先解除綁定。', COPY_CITY_ROADED: '該據點仍被道路引用。', COPY_CITY_CHAPTER: '該據點仍被章節引用。' };
function describeRemoveError(error) {
  const known = error && removeReasons[error.code];
  if (!known) return (error && error.message) || '刪除未完成（原因未回報）。';
  const details = Array.isArray(error.detail?.blockers) ? error.detail.blockers.map(item => item.detail).filter(Boolean).slice(0, 3) : [];
  return known + (details.length ? '（' + details.join('；') + '）' : '');
}
async function remove(row) {
  if (!canRemove(row)) return;
  failure.value = ''; status.value = '';
  if (!window.confirm(`確定刪除據點「${row.name}」嗎？刪除後不可恢復。`)) return;
  try {
    const reply = await props.actions.cityCopyRemove(row.cityId, { feedback: 'local' });
    editing.value = null;
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = describeRemoveError(error);
  }
}
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
  form.battleMapId = row.battleMapId ?? '';
  form.troops_cap = row.troops_cap ?? '';
  failure.value = '';
}
function cancelEdit() { editing.value = null; failure.value = ''; }
async function createCity() {
  if (locked.value) return;
  const name = cityName(create.name);
  if (!name) { failure.value = '據點名稱不可空白。'; return; }
  if ([...name].length > 12) { failure.value = '據點名稱最多 12 個字。'; return; }
  if (loaded.value.some(item => cityName(item.name) === name)) { failure.value = '據點名稱「' + name + '」已被其他據點使用。'; return; }
  const numbers = {};
  for (const key of ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']) {
    const raw = String(create[key] ?? '').trim();
    const limit = key === 'view' ? 255 : NUMBERS[key];
    if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) > limit) { failure.value = key + ' 必須是 0–' + limit + ' 的整數。'; return; }
    numbers[key] = Number(raw);
  }
  const createCapRaw = String(create.troops_cap ?? '').trim();
  if (!/^[0-9]{1,3}$/.test(createCapRaw) || Number(createCapRaw) > 255) { failure.value = '城兵上限必須是 0–255 的整數。'; return; }
  if (!siegeValid(String(create.battleMapId ?? ''))) { failure.value = '攻城戰場須為 ki-1995:siege:0..191（先定類型，再按版式／主題分組選擇）。'; return; }
  if (!siegeInType(String(create.battleMapId ?? ''), create.type)) { failure.value = '所選攻城戰場不在該據點類型的子集內，請重選。'; return; }
  failure.value = ''; status.value = '';
  try {
    const reply = await props.actions.cityCopyCreate({ name, numbers, battleMapId: String(create.battleMapId), troops_cap: Number(create.troops_cap) });
    creating.value = false;
    create.name = ''; create.battleMapId = '';
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '新增未完成（原因未回報）。';
  }
}

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
  if (!siegeValid(String(form.battleMapId ?? ''))) return '攻城戰場須為 ki-1995:siege:0..191（先定類型，再按版式／主題分組選擇）。';
  if (!siegeInType(String(form.battleMapId ?? ''), form.type)) return '所選攻城戰場不在該據點類型的子集內，請重選。';
  if (String(form.troops_cap ?? '').trim() === '') { if (row.troops_cap !== null) return '城兵上限不可空白；請填 0–255 的整數。'; }
  else {
    const capRaw = String(form.troops_cap ?? '').trim();
    if (!/^[0-9]{1,3}$/.test(capRaw) || Number(capRaw) > 255) return '城兵上限必須是 0–255 的整數。';
  }
  return '';
}
async function save(row) {
  if (locked.value) return;
  const problem = validate(row);
  if (problem) { failure.value = problem; return; }
  failure.value = ''; status.value = '';
  const patch = { name: cityName(form.name), battleMapId: String(form.battleMapId) };
  for (const key of FIELDS) patch[key] = form[key];
  patch.troops_cap = String(form.troops_cap ?? '').trim() === '' ? null : Number(form.troops_cap);
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
      <ElButton id="stronghold-create-toggle" :disabled="locked" @click="creating = !creating; failure = ''">{{ creating ? '取消新增' : '新增據點' }}</ElButton>
      <ElInput id="stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱" :disabled="!supported" />
      <span id="stronghold-status" role="status" class="stronghold-status">{{ failure || status }}</span>
    </div>
    <div v-if="creating && supported" class="module-toolbar stronghold-create" aria-label="新增據點">
      <label>名稱<ElInput v-model="create.name" maxlength="12" :disabled="busy" /></label>
      <label v-for="key in ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']" :key="key">{{ key }}<ElInput :model-value="create[key]" inputmode="numeric" :disabled="busy" @input="create[key] = $event" /></label>
      <label class="siege-pick">攻城戰場<img v-if="thumbUrl(create.battleMapId)" :src="thumbUrl(create.battleMapId)" alt="" width="96" height="51" /><span class="siege-current">{{ siegeLabel(create.battleMapId) }}</span><ElButton :disabled="busy" @click="createPickerVisible = true">選圖</ElButton></label>
      <label>城兵上限<ElInput v-model="create.troops_cap" inputmode="numeric" :disabled="busy" /></label>
      <ElButton id="stronghold-create" :disabled="busy || locked" @click="createCity()">建檔</ElButton>
    </div>
    <SiegeThumbPicker :visible="createPickerVisible" :city-type="create.type" :value="create.battleMapId" @select="create.battleMapId = $event" @close="createPickerVisible = false" />
    <SiegeThumbPicker :visible="pickerVisible" :city-type="form.type" :value="form.battleMapId" @select="form.battleMapId = $event" @close="pickerVisible = false" />
    <div v-if="supported" class="table-region" tabindex="0">
      <ElTable id="stronghold-table" ref="table" :data="pagedRows" height="100%" row-key="cityId" @sort-change="onSortChange">
        <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="column.title" :sortable="column.sortable ? 'custom' : false" :sort-orders="['ascending', 'descending']" :min-width="column.key === 'actions' ? 180 : 120">
          <template #header><span :data-column="column.key" :data-sort="column.sortable ? column.key : undefined">{{ column.title }}</span></template>
          <template #default="{ row }">
            <div :data-field="column.key" :data-city-id="row.cityId" :data-city-seq="row.seq">
              <template v-if="column.key === 'seq'">{{ row.seq }}</template>
              <template v-else-if="column.key === 'actions'">
                <div class="account-row-actions stronghold-row-actions">
                <ListRowActions :editing="editing === row.cityId" :busy="busy" :locked="locked" @save="save(row)" @cancel="cancelEdit()" @edit="startEdit(row)" />
                <ElButton v-if="editing !== row.cityId" data-action="delete" :disabled="!canRemove(row)" :title="mapPlaced(row) ? '已在地圖上使用，不能刪除' : '刪除此據點'" @click="remove(row)">刪除</ElButton>
                </div>
              </template>
              <template v-else-if="column.key === 'map'">
                <span data-map-coord>{{ mapLabel(row) }}</span>
              </template>
              <template v-else-if="column.key === 'type'">
                <ElSelect v-if="editing === row.cityId" v-model="form.type" data-input="type" :disabled="busy"><ElOption v-for="[value, label] in CITY_TYPES" :key="value" :value="Number(value)" :label="label" /><ElOption v-if="!CITY_TYPES.some(([value]) => Number(value) === Number(form.type))" :value="form.type" :label="form.type + '（未知）'" /></ElSelect>
                <template v-else>{{ typeLabel(row.type) }}</template>
              </template>
              <template v-else-if="column.key === 'name'">
                <ElInput v-if="editing === row.cityId" v-model="form.name" data-input="name" maxlength="12" :disabled="busy" /><template v-else>{{ row.name ?? '未配置' }}</template>
              </template>
              <template v-else-if="column.key === 'troops_cap'">
                <ElInput v-if="editing === row.cityId" v-model="form.troops_cap" data-input="troops_cap" inputmode="numeric" :disabled="busy" />
                <template v-else>{{ row.troops_cap ?? '（分章）' }}</template>
              </template>
              <template v-else-if="column.key === 'battleMapId'">
                <div v-if="editing === row.cityId" class="siege-pick"><img v-if="thumbUrl(form.battleMapId)" :src="thumbUrl(form.battleMapId)" alt="" width="96" height="51" /><ElButton :disabled="busy" @click="pickerVisible = true">選圖</ElButton><span>{{ siegeLabel(form.battleMapId) }}</span></div>
                <template v-else>{{ siegeLabel(row.battleMapId) }}</template>
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
