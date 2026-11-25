<script setup>
import { computed, reactive, ref, watch } from 'vue';
import StrongholdCreate from './StrongholdCreate.vue';
import ListPagination from './ListPagination.vue';
import ListRowActions from './ListRowActions.vue';
import { usePagination } from './pagination.js';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { siegeLabel, siegeValid, siegeInType, siegeParts, thumbUrl } from './siegebattletypes.js';
import CityPicture from './CityPicture.vue';
import SiegePickButton from './SiegePickButton.vue';
import SiegeThumbPicker from './SiegeThumbPicker.vue';
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
const form = reactive({ view: null, name: '', region: '', max_prod: '', prod: '', growth: '', defence: '', troops: '', type: '', battleMapId: '', troops_cap: '' });
const pickerVisible = ref(false);
const status = ref('');
const failure = ref('');
const cityName = value => String(value ?? '').normalize('NFC').trim();

const cities = computed(() => props.model?.cities ?? []);
const loaded = computed(() => cities.value ?? []);
const supported = computed(() => Boolean(props.model?.loaded));
const canLoad = computed(() => !loading.value && !props.busy && !props.model?.locked);
const locked = computed(() => Boolean(props.busy) || Boolean(props.model?.locked));
const canPromote = computed(() => !loading.value && !props.busy && !locked.value && Boolean(props.gameId));

const columns = [
  { key: 'seq', title: '序號', sortable: false },
  { key: 'name', title: '據點名稱', sortable: true, type: 'text' },
  { key: 'region', title: '所屬州郡', sortable: true, type: 'text' },
  { key: 'max_prod', title: '最大生產', sortable: false },
  { key: 'prod', title: '當前生產', sortable: false },
  { key: 'growth', title: '上升值', sortable: false },
  { key: 'defence', title: '防災值', sortable: false },
  { key: 'troops', title: '城兵*10', sortable: true, type: 'number' },
  { key: 'troops_cap', title: '城兵上限*10', sortable: false },
  { key: 'type', title: '類型', sortable: true, type: 'number' },
  { key: 'battleMapId', title: '攻城戰場', sortable: false },
  { key: 'view', title: '據點圖片', sortable: false },
  { key: 'actions', title: '操作', sortable: false },
];
// 無固定寬、100% 自適應撐滿：最小寬只保證內容不擠壓，表頭單行不回行。
const minWidths = { name: 112, region: 100, max_prod: 96, prod: 96, growth: 96,
  defence: 96, troops: 96, type: 90, troops_cap: 112, view: 112, actions: 180 };

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
  form.region = row.region ?? '';
  for (const key of FIELDS) form[key] = row[key] ?? '';
  form.view = row.view ?? null;
  form.battleMapId = row.battleMapId ?? '';
  form.troops_cap = row.troops_cap == null ? '' : String(row.troops_cap);
  failure.value = '';
}
watch(() => form.type, type => { if (form.battleMapId && !siegeInType(form.battleMapId, type)) form.battleMapId = ''; });
function cancelEdit() { editing.value = null; failure.value = ''; props.actions.setEditing(false); }

function validate(row) {
  const name = cityName(form.name);
  if (!name) return '據點名稱不可空白。';
  if ([...name].length > 12) return '據點名稱最多 12 個字。';
  if (loaded.value.some(item => item.cityId !== row.cityId && cityName(item.name) === name)) return '據點名稱「' + name + '」已被其他據點使用。';
  const region = cityName(form.region);
  if ([...region].length > 5) return '所屬州郡最多 5 個字。';
  for (const key of FIELDS) {
    const raw = String(form[key] ?? '').trim();
    if (!raw) continue;
    if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) > NUMBERS[key]) return key + ' 必須是 0–' + NUMBERS[key] + ' 的整數。';
  }
  if (!siegeValid(String(form.battleMapId ?? ''))) return '攻城戰場須為 ki-1995:siege:0..191（先定類型，再按版式／主題分組選擇）。';
  if (!siegeInType(String(form.battleMapId ?? ''), form.type)) return '所選攻城戰場不在該據點類型的子集內，請重選。';
  const cap = String(form.troops_cap ?? '').trim();
  if (cap && (!/^[0-9]{1,3}$/.test(cap) || Number(cap) > 255)) return '城兵上限必須是 0–255 的整數（每單位 10 人）。';
  return '';
}
async function save(row) {
  if (locked.value) return;
  const problem = validate(row);
  if (problem) { failure.value = problem; return; }
  failure.value = ''; status.value = '';
  const patch = { name: cityName(form.name), region: cityName(form.region), battleMapId: String(form.battleMapId) };
  patch.troops_cap = Number(form.troops_cap);
  if (form.view !== (row.view ?? null)) patch.view = form.view;
  for (const key of FIELDS) patch[key] = Number(form[key]);
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
      <StrongholdCreate prefix="base-stronghold" :columns="columns" :cities="cities" :save="actions.createCity" :busy="busy" :locked="locked || !supported || loading || editing !== null" @editing="actions.setEditing" />
      <ElButton id="base-stronghold-promote" :disabled="!canPromote" @click="promote()">從目前遊戲匯入{{ gameName ? `（${gameName}）` : '' }}</ElButton>
      <ElInput id="base-stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱" :disabled="!supported" />
      <span id="base-stronghold-status" role="status" class="stronghold-status">{{ failure || status }}</span>
    </div>
    <div v-if="supported" class="table-region" tabindex="0">
      <ElTable id="base-stronghold-table" ref="table" :data="pagedRows" height="100%" row-key="cityId" @sort-change="onSortChange">
        <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="column.title" :sortable="column.sortable ? 'custom' : false" :sort-orders="['ascending', 'descending']" :width="column.key === 'seq' ? 60 : column.key === 'battleMapId' ? 180 : undefined" :min-width="minWidths[column.key]">
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
              <template v-else-if="column.key === 'region'">
                <ElInput v-if="editing === row.cityId" v-model="form.region" data-input="region" maxlength="5" :disabled="busy" /><template v-else>{{ row.region ?? '' }}</template>
              </template>
              <template v-else-if="column.key === 'troops_cap'">
                <ElInput v-if="editing === row.cityId" v-model="form.troops_cap" data-input="troops_cap" inputmode="numeric" :disabled="busy" />
                <template v-else>{{ row.troops_cap ?? '—' }}</template>
              </template>
              <CityPicture v-else-if="column.key === 'view'" :value="editing === row.cityId ? form.view : row.view" :editable="editing === row.cityId" :disabled="busy" @select="form.view = $event" />
              <template v-else-if="column.key === 'battleMapId'">
                <div v-if="editing === row.cityId" class="siege-pick"><SiegePickButton :value="form.battleMapId" :disabled="busy" @open="pickerVisible = true" /><span>{{ siegeLabel(form.battleMapId) }}</span></div>
                <template v-else><div class="siege-cell"><img v-if="thumbUrl(row.battleMapId)" :src="thumbUrl(row.battleMapId)" :alt="siegeLabel(row.battleMapId)" loading="lazy" width="96" height="51" /><div class="siege-text"><span>{{ siegeParts(row.battleMapId).name }}</span><span>{{ siegeParts(row.battleMapId).tag }}</span></div></div></template>
              </template>
              <template v-else><ElInput v-if="editing === row.cityId" v-model="form[column.key]" :data-input="column.key" inputmode="numeric" :disabled="busy" /><template v-else>{{ row[column.key] ?? '—' }}</template></template>
            </div>
          </template>
        </ElTableColumn>
        <template #empty>{{ search ? '沒有符合的據點；清空搜尋可看全部。' : '據點清單是空的。' }}</template>
      </ElTable>
    </div>
    <p v-else id="base-stronghold-unsupported" class="stronghold-note">先按「加載」讀取系統基礎據點。</p>
    <SiegeThumbPicker :visible="pickerVisible" :city-type="form.type" :value="form.battleMapId" @select="form.battleMapId = $event" @close="pickerVisible = false" />
    <ListPagination v-if="supported" id="base-stronghold-pagination" v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
  </section>
</template>

<style scoped>
#base-stronghold-editor:not([hidden]) { display: flex; flex-direction: column; overflow: hidden; }
#base-stronghold-table :deep(th .cell) { white-space: nowrap; }
.siege-cell { display: flex; align-items: center; gap: 8px; }
.siege-text { display: flex; flex-direction: column; line-height: 1.5; white-space: nowrap; }
.module-toolbar { flex-shrink: 0; }
.table-region { flex: 1; min-height: 0; overflow: hidden; }
</style>
