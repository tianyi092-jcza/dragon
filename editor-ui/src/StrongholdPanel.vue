<script setup>
import { computed, reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
// 城池據點（遊戲級）：只做據點清單本身。座標由地圖放置自動寫入，不在此顯示或修改；
// 上升值／防災值／城兵與勢力／首都屬章節級。加載沿用當前遊戲的明確修訂，不再要一個
// 修訂號輸入框；完整副本沒有遊戲級據點定義，只留一行說明，不假裝有表格。
const props = defineProps({ draftModel: Object, draftActions: Object, busy: Boolean });

const search = ref('');
const sort = reactive({ key: 'seq', dir: 1 });
const editing = ref(null);
const form = reactive({ name: '', max_prod: '', type: '' });
const status = ref('');
const failure = ref('');
const cityName = value => String(value ?? '').normalize('NFC').trim();

const cities = computed(() => props.draftModel?.cities ?? null);
const loaded = computed(() => cities.value?.rows ?? []);
const supported = computed(() => Boolean(cities.value?.supported));
const canLoad = computed(() => !props.busy && !props.draftModel?.loadLocked && Boolean(props.draftModel?.fields?.gameId) && Boolean(props.draftModel?.fields?.revision));
const locked = computed(() => Boolean(props.busy) || !props.draftModel || Boolean(props.draftModel.loadLocked) || Boolean(cities.value?.locked));

const columns = [
  { key: 'seq', title: '序號', sortable: false },
  { key: 'name', title: '據點名稱', sortable: true, type: 'text' },
  { key: 'max_prod', title: '最大生產力', sortable: true, type: 'number' },
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

function toggleSort(key) {
  const column = columns.find(entry => entry.key === key);
  if (!column?.sortable) return;
  if (sort.key === key) sort.dir = sort.dir > 0 ? -1 : 1;
  else { sort.key = key; sort.dir = 1; }
}
function sortMark(key) { return sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''; }

async function load() {
  if (!canLoad.value) return;
  status.value = ''; failure.value = ''; editing.value = null;
  try { await props.draftActions.load(); }
  catch (error) { failure.value = (error && error.message) || '加載未完成。'; return; }
  const list = cities.value?.rows ?? [];
  status.value = cities.value?.supported ? '已加載 ' + list.length + ' 座' : '';
}

function startEdit(row) {
  if (locked.value) return;
  editing.value = row.cityId;
  form.name = row.name ?? '';
  form.max_prod = row.max_prod ?? '';
  form.type = row.type ?? '';
  failure.value = '';
}
function cancelEdit() { editing.value = null; failure.value = ''; }

// 同一套規則服務端還會再驗一次：這裡只為即時顯示，不代替服務端判定。
function validate(row) {
  const name = cityName(form.name);
  if (!name) return '據點名稱不可空白。';
  if ([...name].length > 12) return '據點名稱最多 12 個字。';
  if (loaded.value.some(item => item.cityId !== row.cityId && cityName(item.name) === name)) return '據點名稱「' + name + '」已被其他據點使用。';
  for (const key of ['max_prod', 'type']) {
    const raw = String(form[key] ?? '').trim();
    if (raw === '') { if (row[key] !== null) return key + ' 不可留空；請填 0–65535 的整數。'; continue; }
    if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) > 65535) return key + ' 必須是 0–65535 的整數。';
  }
  return '';
}
async function save(row) {
  if (locked.value) return;
  const problem = validate(row);
  if (problem) { failure.value = problem; return; }
  failure.value = ''; status.value = '';
  try {
    const reply = await props.draftActions.citySave(row.cityId, { name: cityName(form.name), max_prod: form.max_prod, type: form.type });
    editing.value = null;
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '保存未完成（原因未回報）。';
  }
}
</script>

<template>
  <section id="stronghold-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="stronghold-load" :disabled="!canLoad" @click="load()">加載</ElButton>
      <input id="stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱" :disabled="!supported">
      <span id="stronghold-status" role="status" class="stronghold-status">{{ failure || status }}</span>
    </div>
    <div v-if="supported" class="entity-table-wrap" tabindex="0">
      <table id="stronghold-table" class="entity-table">
        <thead><tr>
          <th v-for="column in columns" :key="column.key" :data-column="column.key">
            <button v-if="column.sortable" type="button" class="sort-header" :data-sort="column.key" :aria-pressed="sort.key === column.key" @click="toggleSort(column.key)">{{ column.title }}{{ sortMark(column.key) }}</button>
            <template v-else>{{ column.title }}</template>
          </th>
        </tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.cityId" :data-city-id="row.cityId" :data-city-seq="row.seq">
            <td data-field="seq">{{ row.seq }}</td>
            <td data-field="name">
              <input v-if="editing === row.cityId" v-model="form.name" data-input="name" maxlength="12" :disabled="busy">
              <template v-else>{{ row.name ?? '未配置' }}</template>
            </td>
            <td data-field="max_prod">
              <input v-if="editing === row.cityId" v-model="form.max_prod" data-input="max_prod" inputmode="numeric" :disabled="busy">
              <template v-else>{{ row.max_prod ?? '未知' }}</template>
            </td>
            <td data-field="type">
              <input v-if="editing === row.cityId" v-model="form.type" data-input="type" inputmode="numeric" :disabled="busy">
              <template v-else>{{ row.type ?? '未知' }}</template>
            </td>
            <td class="account-row-actions" data-field="actions">
              <template v-if="editing === row.cityId">
                <ElButton data-action="save" :disabled="busy" @click="save(row)">保存</ElButton>
                <ElButton data-action="cancel" :disabled="busy" @click="cancelEdit()">取消</ElButton>
              </template>
              <ElButton v-else data-action="edit" :disabled="locked" @click="startEdit(row)">編輯</ElButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="empty-state">{{ search ? '沒有符合的據點；清空搜尋可看全部。' : '據點清單是空的。' }}</p>
    </div>
    <p v-else-if="draftModel?.context?.verified" id="stronghold-unsupported" class="stronghold-note">完整副本沒有遊戲級據點定義；據點名稱與數值請在「遊戲章節」各章檢視。</p>
    <p v-else class="stronghold-note">先選遊戲，再按「加載」。</p>
  </section>
</template>

<style>
#stronghold-editor{padding:16px 18px}
#stronghold-editor .module-toolbar{gap:8px;margin:0 0 10px;align-items:center}
#stronghold-editor .module-toolbar .el-button{min-height:32px;padding:0 14px}
#stronghold-editor #stronghold-search{height:32px;width:200px;padding:0 10px;box-sizing:border-box}
#stronghold-editor .entity-table-wrap{max-height:calc(100vh - 288px)}
#stronghold-editor .entity-table{min-width:560px}
#stronghold-editor .entity-table th,#stronghold-editor .entity-table td{padding:6px 10px}
#stronghold-editor .entity-table thead th{font-size:12px;letter-spacing:1px}
#stronghold-editor .entity-table td input{width:100%;min-width:4em;height:28px;box-sizing:border-box}
#stronghold-editor .entity-table .el-button{min-height:28px;padding:0 10px}
#stronghold-editor .entity-table .account-row-actions{min-width:120px;white-space:nowrap}
#stronghold-editor .sort-header{border:0;background:none;padding:0;font:inherit;cursor:pointer;color:inherit}
#stronghold-editor .sort-header[aria-pressed="true"]{font-weight:700}
#stronghold-editor .stronghold-status{font-size:13px;color:#5b7264}
#stronghold-editor .stronghold-status:empty{display:none}
#stronghold-editor .stronghold-note{margin:0;font-size:13px;color:#718077}
</style>
