<script setup>
import { computed, reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
// 城池據點（遊戲級）：一頁只做據點清單本身。
// 據點身份、槽位、座標凍結（用戶 2026-11 決定：先不解除凍結），本頁只改名稱與
// 遊戲級數值；勢力／首都屬章節級，不在本頁；刪除另議，本版不提供。
const props = defineProps({ model: Object, actions: Object, draftModel: Object, draftActions: Object, busy: Boolean });

const search = ref('');
const sort = reactive({ key: 'name', dir: 1 });
const editing = ref(null);
const form = reactive({ name: '', max_prod: '', type: '' });
const rowError = ref('');
const cityName = value => String(value ?? '').normalize('NFC').trim();

const cities = computed(() => props.draftModel?.cities ?? null);
const loaded = computed(() => cities.value?.rows ?? []);
const locked = computed(() => Boolean(props.busy) || !props.draftModel || Boolean(props.draftModel.loadLocked) || Boolean(cities.value?.locked));

// 用戶 2026-11 口徑：坐標（槽位／X／Y）由地圖放置自動寫入，不顯示也不可改；
// 當前生產力是引擎運行時值，不做定義欄位。上升值／防災值／城兵留在章節級：
// 新建章節時自動帶上上一章（沒有上一章就取原版第一章）的值，再在各章修改。
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

function startEdit(row) {
  if (locked.value) return;
  editing.value = row.cityId;
  form.name = row.name ?? '';
  form.max_prod = row.max_prod ?? '';
  form.type = row.type ?? '';
  rowError.value = '';
}
function cancelEdit() { editing.value = null; rowError.value = ''; }

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
  if (problem) { rowError.value = problem; return; }
  rowError.value = '';
  try {
    await props.actions.citySave(row.cityId, { name: cityName(form.name), max_prod: form.max_prod, type: form.type });
    editing.value = null;
  } catch (error) {
    rowError.value = (error && error.message) || '保存未完成（原因未回報）。';
  }
}
</script>

<template>
  <section id="stronghold-editor" class="module-card">
    <div class="module-toolbar">
      <span id="stronghold-game">{{ draftModel?.fields.gameId || '未選擇遊戲' }}</span>
      <label>修訂<input id="stronghold-revision" :value="draftModel?.fields.revision ?? ''" :disabled="busy || draftModel?.loadLocked" inputmode="numeric" @input="draftActions.setField('revision', $event.target.value)"></label>
      <ElButton id="stronghold-load" :disabled="busy || draftModel?.loadLocked || !draftModel?.fields.gameId || !draftModel?.fields.revision" @click="draftActions.load()">加載</ElButton>
      <input id="stronghold-search" v-model="search" type="search" placeholder="搜尋據點名稱" aria-label="搜尋據點名稱">
    </div>
    <p id="stronghold-status" role="status">{{ draftModel?.message }}</p>
    <p class="module-notice">坐標由地圖放置自動寫入，不顯示也不可改。上升值、防災值、城兵是章節級：新建章節時自動帶上上一章的值，再在章節頁各自修改。勢力與首都在章節頁；刪除待另行討論後才提供。</p>
    <p v-if="rowError" id="stronghold-row-error" role="alert" class="module-notice">{{ rowError }}</p>
    <p v-if="!cities?.supported">尚未加載據點清單；請先選擇遊戲與修訂後按「加載」。</p>
    <div v-else class="entity-table-wrap" tabindex="0">
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
      <p v-if="!rows.length" class="empty-state">沒有符合的據點；清空搜尋可看全部。</p>
    </div>
  </section>
</template>

<style>
#stronghold-editor .sort-header{border:0;background:none;padding:0;font:inherit;cursor:pointer;color:inherit}
#stronghold-editor .sort-header[aria-pressed="true"]{font-weight:700}
#stronghold-editor td input{width:100%;min-width:4em;box-sizing:border-box}
</style>
