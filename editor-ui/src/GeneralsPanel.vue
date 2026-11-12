<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ListPagination from './ListPagination.vue';
import ListRowActions from './ListRowActions.vue';
import { usePagination } from './pagination.js';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTooltip } from 'element-plus/es/components/tooltip/index.mjs';
import { vLoading } from 'element-plus/es/components/loading/index.mjs';
import { loadingSvg } from './loading.js';
// 武將庫＝這款遊戲的共享武將資料（父表，全章共用）：頭像、姓名、字、
// 勢力被滅被俘（自殺旗，原版 attr bit4）、六項能力。章節經人物層繼承共享屬性，
// 章節自有欄位（所屬／出場／職務等）不在本頁；增刪另議。加載走副本頁。
const props = defineProps({ model: Object, actions: Object, busy: Boolean });

const ABILITIES = [
  { key: 'siege', title: '城塞战能力' },
  { key: 'field', title: '野战能力' },
  { key: 'naval', title: '水战能力' },
  { key: 'force', title: '武力' },
  { key: 'lead', title: '统率' },
  { key: 'politics', title: '政治' },
];
const ABILITY_KEYS = ABILITIES.map(item => item.key);

const search = ref('');
const sort = reactive({ key: 'seq', dir: 1 });
const editing = ref(null);
const form = reactive({ name: '', zi: '', hao: '', suicide: false, portraitRef: null, ability: { siege: null, field: null, naval: null, force: null, lead: null, politics: null } });
const status = ref('');
const failure = ref('');
const albumSearch = ref('');
const albumOpen = ref(false), albumLoading = ref(false);
const albumPick = ref(null);
const albumFailure = ref('');
const generalName = value => String(value ?? '').normalize('NFC').trim();

const page = computed(() => props.model?.copy?.page ?? null);
const gameId = computed(() => props.model?.fields?.gameId ?? null);
const library = computed(() => page.value?.generals ?? null);
const loaded = computed(() => library.value ?? []);
const supported = computed(() => Boolean(page.value));
const libraryReady = computed(() => Array.isArray(library.value));
const canLoad = computed(() => !props.busy && Boolean(gameId.value));
const locked = computed(() => Boolean(props.busy) || !props.model || !page.value || !libraryReady.value);
const portraits = computed(() => page.value?.portraits ?? null);
// 来源由服务端读取；空白新游戏也能导入。单次原子请求使用全局 Loading。
const canImport = computed(() => !props.busy && supported.value && !editing.value);
const albumReady = computed(() => Array.isArray(portraits.value));

const columns = [
  { key: 'seq', title: '序號', sortable: false, width: 60 },
  { key: 'portrait', title: '头像', sortable: false, width: 80 },
  { key: 'name', title: '姓名', sortable: true, type: 'text', width: 120 },
  { key: 'zi', title: '字', sortable: true, type: 'text', width: 100 },
  { key: 'hao', title: '号', sortable: true, type: 'text', width: 100 },
  { key: 'suicide', title: '势力被灭被俘', sortable: true, type: 'bool', width: 140 },
  ...ABILITIES.map(item => ({ key: item.key, title: item.title, sortable: true, type: 'number', width: 120 })),
  { key: 'actions', title: '操作', sortable: false },
];

function portraitUrl(ref) {
  if (!gameId.value || !ref) return null;
  return `/api/games/${encodeURIComponent(gameId.value)}/portraits/${encodeURIComponent(ref.assetId)}/bytes?sha256=${ref.sha256}`;
}
const suicideLabel = value => value === true ? '会自杀' : '—';

const visible = computed(() => {
  const needle = generalName(search.value).toLocaleLowerCase();
  const list = loaded.value.filter(row => !needle || generalName(row.name).toLocaleLowerCase().includes(needle) || generalName(row.hao).toLocaleLowerCase().includes(needle));
  const { key, dir } = sort;
  const column = columns.find(entry => entry.key === key);
  if (!column?.sortable) return list;
  const ordered = [...list].sort((a, b) => {
    if (column.type === 'number') return (a.ability?.[key] ?? -1) - (b.ability?.[key] ?? -1);
    if (column.type === 'bool') return Number(a.suicideOnCapture === true) - Number(b.suicideOnCapture === true);
    return generalName(a[key]).localeCompare(generalName(b[key]), 'zh-Hant');
  });
  return dir > 0 ? ordered : ordered.reverse();
});
// 序號跟著「現在看到的順序」重排，不是武將身份。
const rows = computed(() => visible.value.map((row, index) => ({ ...row, seq: index + 1 })));
const { currentPage, pageSize, total, pagedRows } = usePagination(rows);
const table = ref(null);
watch(search, () => { currentPage.value = 1; });
watch([currentPage, pageSize, search, () => sort.key, () => sort.dir], () => table.value?.setScrollTop(0), { flush: 'post' });

function onSortChange({ prop, order }) {
  sort.key = order ? prop : 'seq';
  sort.dir = order === 'descending' ? -1 : 1;
  currentPage.value = 1;
}

async function load() {
  if (!canLoad.value) return;
  currentPage.value = 1;
  status.value = ''; failure.value = ''; editing.value = null;
  try { await props.actions.loadCopy(); }
  catch (error) { failure.value = (error && error.message) || '加載未完成。'; return; }
  const list = loaded.value;
  status.value = page.value ? (libraryReady.value ? '已加載 ' + list.length + ' 名' : '本遊戲尚無武將庫。') : '';
}

function startEdit(row) {
  if (locked.value) return;
  editing.value = row.generalId;
  form.name = row.name ?? '';
  form.zi = row.zi ?? '';
  form.hao = row.hao ?? '';
  form.suicide = row.suicideOnCapture === true;
  form.portraitRef = row.portraitRef ? { ...row.portraitRef } : null;
  for (const key of ABILITY_KEYS) form.ability[key] = row.ability?.[key] ?? null;
  failure.value = '';
}
function cancelEdit() { editing.value = null; failure.value = ''; }

// 從內置遊戲覆蓋導入；控制器確認後送一次請求，成功重讀。
async function importRecords() {
  if (!canImport.value) return;
  status.value = ''; failure.value = '';
  try {
    const reply = await props.actions.generalCopyImport(text => ElMessageBox.confirm(text, '覆蓋武將庫', {
      type: 'warning', confirmButtonText: '確認覆蓋', cancelButtonText: '取消',
    }).then(() => true, () => false));
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '導入未完成（原因未回報）。';
  }
}

// 只校驗作者本次改動：導入來的原版 0 值（專長 0 合法）不改就不拦。
function validate(row, patch) {
  if (patch.name !== undefined) {
    if (!patch.name) return '姓名不可空白。';
    if (loaded.value.some(item => item.generalId !== row.generalId && generalName(item.name) === patch.name)) return '姓名「' + patch.name + '」已被其他武將使用。';
  }
  for (const [key, value] of Object.entries(patch.ability ?? {})) {
    if (value < 0 || value > 15) return ABILITIES.find(item => item.key === key).title + ' 必須是 0–15 的整數。';
  }
  return '';
}
async function save(row) {
  if (locked.value) return;
  // 只發改動字段：未觸碰的原版 0 不會被重寫成 1，也不會因未改而报錯。
  const patch = {};
  const name = generalName(form.name);
  if (name !== (row.name ?? '')) patch.name = name;
  const zi = String(form.zi ?? '').normalize('NFC');
  if (zi !== (row.zi ?? '')) patch.zi = zi;
  const hao = String(form.hao ?? '').normalize('NFC');
  if (hao !== (row.hao ?? '')) patch.hao = hao;
  const suicide = form.suicide === true;
  if (suicide !== (row.suicideOnCapture === true)) patch.suicideOnCapture = suicide;
  if (JSON.stringify(form.portraitRef) !== JSON.stringify(row.portraitRef ?? null)) patch.portraitRef = form.portraitRef ? { ...form.portraitRef } : null;
  const ability = {};
  for (const key of ABILITY_KEYS) {
    const raw = String(form.ability[key] ?? '').trim();
    if (raw === '' && row.ability === null) continue;
    if (!/^[0-9]{1,2}$/.test(raw)) { failure.value = ABILITIES.find(item => item.key === key).title + ' 必須是整數。'; return; }
    if (Number(raw) !== row.ability?.[key]) ability[key] = Number(raw);
  }
  if (Object.keys(ability).length) patch.ability = ability;
  if (!Object.keys(patch).length) { editing.value = null; status.value = '武將沒有變更。'; return; }
  const problem = validate(row, patch);
  if (problem) { failure.value = problem; return; }
  failure.value = ''; status.value = '';
  try {
    const reply = await props.actions.generalCopySave(row.generalId, patch);
    editing.value = null;
    // 控制器保存後已重讀副本：行回到只讀時顯示新值，不另起一次讀取。
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '保存未完成（原因未回報）。';
  }
}

// 清单按需读取；只挂载当前页的 25 张缩略图，不以滚动追加下一批。
async function openAlbum() {
  if (locked.value) return;
  albumFailure.value = '';
  albumPick.value = form.portraitRef ? form.portraitRef.assetId : null;
  albumSearch.value = '';
  albumPage.value = 1;
  albumOpen.value = true;
  if (albumReady.value || albumLoading.value) return;
  albumLoading.value = true;
  try { await props.actions.loadCopyPortraits(); }
  catch (error) { albumFailure.value = (error && error.message) || '相冊讀取未完成。'; }
  finally { albumLoading.value = false; }
}
function closeAlbum() { albumOpen.value = false; albumFailure.value = ''; }
function confirmAlbum() {
  if (albumPick.value === null || albumPick.value === '') form.portraitRef = null;
  else {
    const found = (portraits.value ?? []).find(item => item.assetId === albumPick.value);
    if (!found) { albumFailure.value = '請選擇相冊中的頭像。'; return; }
    form.portraitRef = { ...found };
  }
  closeAlbum();
}
const albumRows = computed(() => {
  const needle = albumSearch.value.trim().toLowerCase();
  return (portraits.value ?? []).filter(item => !needle || item.assetId.toLowerCase().includes(needle))
    .sort((a, b) => a.assetId.localeCompare(b.assetId, 'zh-Hant', { numeric: true }));
});
const { currentPage: albumPage, pageSize: albumPageSize, total: albumTotal, pagedRows: albumPageRows } = usePagination(albumRows);
const albumGrid = ref(null);
watch(albumSearch, () => { albumPage.value = 1; });
watch([albumPage, albumSearch], () => { if (albumGrid.value) albumGrid.value.scrollTop = 0; }, { flush: 'post' });
</script>

<template>
  <section id="generals-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="generals-load" :disabled="!canLoad" @click="load()">加載</ElButton>
      <ElButton id="generals-import" :disabled="!canImport" @click="importRecords()">從內置遊戲導入</ElButton>
      <ElInput id="generals-search" v-model="search" type="search" placeholder="搜尋姓名／字" aria-label="搜尋姓名／字" :disabled="!supported" />
      <span id="generals-status" role="status" class="generals-status">{{ failure || status }}</span>
    </div>
    <div v-if="supported && libraryReady" class="table-region" tabindex="0">
    <ElTable id="generals-table" ref="table" :data="pagedRows" height="100%" row-key="generalId" @sort-change="onSortChange">
      <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="({ portrait: '頭像', hao: '號', suicide: '勢力被滅被俘' })[column.key] ?? column.title" :sortable="column.sortable ? 'custom' : false" :width="column.width" :min-width="column.key === 'actions' ? 180 : undefined">
        <template #header="{ column: tableColumn }"><span :data-column="column.key" :data-sort="column.sortable ? column.key : undefined">{{ tableColumn.label }}</span></template>
        <template #default="{ row }">
          <div :data-field="column.key" :data-general-id="row.generalId">
            <template v-if="column.key === 'seq'">{{ row.seq }}</template>
            <template v-else-if="column.key === 'portrait'">
              <ElTooltip v-if="editing === row.generalId" content="點擊選擇頭像"><ElButton :disabled="busy" data-action="portrait" title="點擊選擇頭像" @click="openAlbum()"><img v-if="form.portraitRef" :src="portraitUrl(form.portraitRef)" :alt="form.portraitRef.assetId" loading="lazy" class="generals-thumb"><span v-else>無</span></ElButton></ElTooltip>
              <img v-else-if="row.portraitRef" :src="portraitUrl(row.portraitRef)" :alt="row.portraitRef.assetId" loading="lazy" class="generals-thumb"><span v-else>無</span>
            </template>
            <template v-else-if="column.key === 'actions'"><ListRowActions :editing="editing === row.generalId" :busy="busy" :locked="locked" @save="save(row)" @cancel="cancelEdit()" @edit="startEdit(row)" /></template>
            <template v-else-if="column.key === 'suicide'"><ElCheckbox v-if="editing === row.generalId" v-model="form.suicide" data-input="suicide" :disabled="busy" /><span v-else>{{ suicideLabel(row.suicideOnCapture) }}</span></template>
            <template v-else-if="column.type === 'number'"><ElInputNumber v-if="editing === row.generalId" v-model="form.ability[column.key]" controls-position="right" :data-input="column.key" :min="0" :max="15" :step="1" :disabled="busy" /><span v-else>{{ row.ability?.[column.key] ?? '—' }}</span></template>
            <template v-else><ElInput v-if="editing === row.generalId" v-model="form[column.key]" :data-input="column.key" :disabled="busy" /><span v-else>{{ column.key === 'name' ? (row.name ?? '未配置') : (row[column.key] || '—') }}</span></template>
          </div>
        </template>
      </ElTableColumn>
      <template #empty><p class="empty-state">{{ search ? '沒有符合的武將；清空搜尋可看全部。' : '武將庫是空的；可按「從內置遊戲導入」初始化。' }}</p></template>
    </ElTable>
    </div>
    <p v-else-if="supported" id="generals-unsupported" class="generals-note">本遊戲尚無武將庫（父表）；可從內置遊戲導入。</p>
    <p v-else id="generals-unloaded" class="generals-note">先按「加載」讀取這款遊戲的武將資料。</p>
    <ListPagination v-if="supported && libraryReady" id="generals-pagination" v-model:current-page="currentPage" v-model:page-size="pageSize" :total="total" :disabled="busy" />
    <ElDialog v-if="albumOpen" id="generals-portrait-dialog" class="generals-portrait-dialog" :model-value="true" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" width="min(900px, 94vw)" top="5vh" aria-label="選擇頭像">
      <div id="generals-portrait-card" v-loading="albumLoading" :element-loading-svg="loadingSvg" element-loading-custom-class="generals-album-loading" :aria-busy="albumLoading">
        <div class="module-toolbar">
          <ElInput id="generals-album-search" v-model="albumSearch" type="search" placeholder="篩選頭像ID" aria-label="篩選頭像ID" :disabled="!albumReady" />
          <ElButton :type="albumPick === null ? 'primary' : 'default'" :disabled="!albumReady" @click="albumPick = null">無頭像</ElButton>
          <span class="generals-note" v-if="albumReady">符合 {{ albumRows.length }}／{{ portraits.length }} 張；點縮圖選中，再按確定。</span>
          <span class="generals-note" v-else-if="!albumLoading">尚未讀取頭像清單。</span>
        </div>
        <p v-if="albumFailure" role="status" class="generals-status">{{ albumFailure }}</p>
        <div id="generals-album-grid" ref="albumGrid" class="generals-album-grid" tabindex="0">
          <template v-if="!albumLoading">
            <div v-for="item in albumPageRows" :key="item.assetId" class="generals-album-item" :data-portrait-id="item.assetId">
              <img :src="portraitUrl(item)" :alt="item.assetId" width="64" height="64" loading="lazy" decoding="async" class="generals-album-thumb" @click="albumPick = item.assetId">
              <ElButton :type="albumPick === item.assetId ? 'primary' : 'default'" @click="albumPick = item.assetId">{{ item.assetId }}</ElButton>
            </div>
          </template>
        </div>
        <ListPagination v-if="albumReady && !albumLoading" id="generals-album-pagination" v-model:current-page="albumPage" :page-size="albumPageSize" :page-sizes="[25]" :total="albumTotal" :disabled="busy" />
        <div id="generals-album-actions" class="module-toolbar">
          <ElButton data-action="album-confirm" :disabled="!albumReady" @click="confirmAlbum()">確定</ElButton>
          <ElButton data-action="album-cancel" @click="closeAlbum()">取消</ElButton>
        </div>
      </div>
    </ElDialog>
  </section>
</template>

<style scoped>
#generals-editor:not([hidden]) { display: flex; flex-direction: column; overflow: hidden; }
.module-toolbar { flex-shrink: 0; }
.table-region { flex: 1; min-height: 0; overflow: hidden; }
#generals-table :deep([data-field] > .el-input),
#generals-table :deep([data-field] > .el-input-number) { width: 100%; min-width: 0; max-width: 100%; }
#generals-table :deep([data-action="portrait"]) { max-width: 100%; }
.generals-thumb { width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated; vertical-align: middle; }
:global(.generals-portrait-dialog) { display: flex; flex-direction: column; resize: both; overflow: hidden; height: min(800px, 90vh); max-width: 94vw; max-height: 90vh; min-width: min(360px, 94vw); min-height: min(420px, 90vh); }
:global(.generals-portrait-dialog .el-dialog__body) { display: flex; flex-direction: column; flex: 1; min-height: 0; }
#generals-portrait-card { display: flex; flex-direction: column; flex: 1; min-height: 0; }
#generals-album-grid { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); align-content: start; gap: 12px; }
#generals-album-pagination, #generals-album-actions { justify-content: flex-end; }
.generals-album-item { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.generals-album-thumb { object-fit: contain; image-rendering: pixelated; cursor: pointer; }
</style>
