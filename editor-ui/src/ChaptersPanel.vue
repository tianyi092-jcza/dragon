<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import ListPagination from './ListPagination.vue';
import { notifyError, notifyInfo } from './notify.js';
import { usePagination } from './pagination.js';
import { CHAPTER_DIPLOMACY_RELATIONS, chapterDiplomacyRelation } from '../../web/src/editor/chapterdiplomacy.js';
// CHAPTER-WB：四頁共用目前章節；保存後控制器重讀副本。
// 任官遷移與完整章節管理仍由後續切片接線；保留內政官／數值編輯。
// 資料走副本頁 attributes 投影，不再經過修訂。
const props = defineProps({ model: Object, actions: Object, busy: Boolean, active: { type: Boolean, default: true } });
const page = computed(() => props.model?.copy?.page ?? null);
const attributes = computed(() => page.value?.attributes ?? null);
const locked = computed(() => Boolean(props.busy) || !attributes.value || attributes.value.locked);
const chapters = computed(() => attributes.value?.chapters ?? []);
const chapter = computed(() => chapters.value.find(row => row.chapterId === props.model?.fields?.chapterId) ?? chapters.value[0] ?? null);
const eras = [['ad', '公元'], ['bc', '公元前']];
const cityTypeNames = ['大都市', '中都市', '小都市', '關卡', '戰場'];
const openingFields = [
  { key: 'trust', label: '信賴', max: 255, read: plan => plan.trust },
  { key: 'tax', label: '本月稅率%', max: 100, read: plan => plan.tax },
  ...['conscription', 'nextConscription'].flatMap((group, month) => ['騎', '弓', '步'].map((kind, i) => ({ key: group + i, label: `${month ? '下月' : '本月'}徵${kind}`, max: 10000, people: true, read: plan => plan[group][i] }))),
];
const arrivalEdit = ref(null), arrivalForm = reactive({ appearMonths: 0, joinFaction: null, active: null, factionId: null });
function editArrival(general) {
  Object.assign(arrivalForm, general.arrival ?? { appearMonths: 0, joinFaction: null }, { active: general.unassigned ? false : general.active, factionId: general.factionSlot });
  arrivalEdit.value = general.editKey; numberError.value = '';
}
async function saveArrival(general) {
  if (!Number.isInteger(arrivalForm.appearMonths) || arrivalForm.appearMonths < 0 || arrivalForm.appearMonths > 255) { numberError.value = '登場倒計時須為0–255個月。'; return; }
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  try {
    const values = { appearMonths: arrivalForm.appearMonths, joinFaction: arrivalForm.joinFaction, ...(arrivalForm.active === null ? {} : { active: arrivalForm.active }) };
    const saved = general.generalId
      ? await props.actions.saveCopyGeneralSettings(id, general.generalId, { ...values, factionId: arrivalForm.factionId })
      : await props.actions.saveCopyGeneralArrival(id, general.slot, { ...values, factionId: arrivalForm.factionId });
    if (saved && props.model.fields.gameId === gameId && chapter.value?.chapterId === id) { arrivalEdit.value = null; numberError.value = ''; }
  } catch (error) { numberError.value = error.message; }
}
const resourceFields = [['money', '金錢', 650000], ['reserve_cav', '預備騎兵', 65000], ['reserve_arc', '預備弓兵', 65000], ['reserve_inf', '預備步兵', 65000]];
const resourceEdit = ref(null), resourceForm = reactive({});
function editResources(faction) {
  resourceFields.forEach(([key]) => { resourceForm[key] = String(faction.resourcePeople[key]); });
  resourceEdit.value = faction.slot; numberError.value = '';
}
async function saveResources(faction) {
  const values = {};
  for (const [key, label, max] of resourceFields) {
    if (resourceForm[key] === String(faction.resourcePeople[key])) continue;
    const value = Number(resourceForm[key]);
    if (!/^\d+$/.test(resourceForm[key]) || !Number.isSafeInteger(value) || value < 0 || value > max) { numberError.value = `${label}須為0–${max}的整數。`; return; }
    values[key] = value;
  }
  if (!Object.keys(values).length) { resourceEdit.value = null; return; }
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  try {
    const saved = await props.actions.saveCopyResourcePeople(id, faction.slot, values);
    if (saved && props.model.fields.gameId === gameId && chapter.value?.chapterId === id) { resourceEdit.value = null; numberError.value = ''; }
  } catch (error) { numberError.value = error.message; }
}
const openingEdit = ref(null), openingForm = reactive({});
function editOpening(faction) {
  openingFields.forEach(field => { openingForm[field.key] = String(field.read(faction.opening)); });
  openingEdit.value = faction.slot; numberError.value = '';
}
async function saveOpening(faction) {
  const values = openingFields.map(field => Number(openingForm[field.key]));
  if (openingFields.some((field, i) => !/^\d+$/.test(openingForm[field.key]) || !Number.isSafeInteger(values[i]) || values[i] < 0 || values[i] > field.max)) {
    numberError.value = '信賴須為0–255、稅率0–100、各兵種徵兵0–10000的整數。'; return;
  }
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  try {
    const saved = await props.actions.saveCopyPlayerOpening(id, faction.slot, { trust: values[0], tax: values[1], conscription: values.slice(2, 5), nextConscription: values.slice(5, 8) });
    if (saved && props.model.fields.gameId === gameId && chapter.value?.chapterId === id) { openingEdit.value = null; numberError.value = ''; }
  } catch (error) { numberError.value = error.message; }
}
const factionSelectionRevision = ref(0);
async function saveFactionSelection(faction, field, value) {
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  numberError.value = '';
  try {
    if (field === 'capital') await props.actions.copyCapital(id, faction.slot, value);
    else if (field === 'monarch') await props.actions.copyMonarch(id, faction.slot, value);
    else if (field === 'disband') await props.actions.copyDisbandFaction(id, faction.slot);
    else if (value === null) await props.actions.copyClearStrategist(id, faction.slot);
    else await props.actions.copyStrategist(id, faction.slot, value);
  } catch (error) {
    if (props.model.fields.gameId === gameId && chapter.value?.chapterId === id) numberError.value = error.message;
  } finally {
    // Re-read, cancellation and failure all display the persisted selection.
    factionSelectionRevision.value++;
  }
}
const diplomacySelectionRevision = ref(0);
async function saveDiplomacy(actorIdx, targetIdx, relation) {
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  numberError.value = '';
  try { await props.actions.copyDiplomacy(id, actorIdx, targetIdx, relation); }
  catch (error) {
    if (props.model.fields.gameId === gameId && chapter.value?.chapterId === id) numberError.value = error.message;
  } finally {
    if (props.model.fields.gameId === gameId && chapter.value?.chapterId === id) diplomacySelectionRevision.value++;
  }
}
const activeTab = ref('chapters');
const creating = ref(false);
const loading = ref(false);
const canLoad = computed(() => !loading.value && !props.busy && Boolean(props.model?.fields?.gameId));
const createForm = reactive({ number: '', name: '', era: 'ad', year: '', month: '', day: '' });
const createResult = ref('');
watch(createResult, message => { if (String(message ?? '').trim()) notifyInfo(message); });
const createClosing = ref(false);
let createTimer = null;
function cancelCreate() {
  if (createTimer !== null) { clearTimeout(createTimer); createTimer = null; }
  createClosing.value = false;
  Object.assign(createForm, { number: '', name: '', era: 'ad', year: '', month: '', day: '' });
  createResult.value = '';
  numberError.value = '';
  creating.value = false;
}
async function createChapter() {
  if (createTimer !== null) return;
  const gameId = props.model.fields.gameId;
  numberError.value = '';
  createResult.value = '';
  try {
    const saved = await props.actions.createNumberedCopyChapter({ ...createForm });
    if (saved && props.model.fields.gameId === gameId) {
      createResult.value = '保存成功，3 秒後關閉。';
      activeTab.value = 'chapters';
      factionPage.value = generalPage.value = cityPage.value = 1;
      createClosing.value = true;
      createTimer = setTimeout(() => { createTimer = null; cancelCreate(); }, 3000);
    } else if (saved) {
      createResult.value = '保存成功，但當前遊戲已切換，請重讀核對。';
    } else {
      createResult.value = '保存未確認，請重試。';
    }
  } catch (error) { createResult.value = '保存失敗：' + (error.message || '原因未回報'); }
}
const chapterOptionDate = row => row.startMissing
  ? '日期未設定'
  : `${row.start.era === 'bc' ? '公元前' : '公元'}${row.start.year}年${row.start.month}月${row.start.day}日`;
const chapterOptionLabel = row => `${row.number ?? ''}  ${row.name}  ${chapterOptionDate(row)}`;
const labelForm = reactive({ number: '', name: '' });
const chapterFormResult = ref('');
watch(chapterFormResult, message => { if (String(message ?? '').trim()) notifyInfo(message); });
const labelDirty = computed(() => Boolean(chapter.value) && ((labelForm.number || '') !== (chapter.value.number ?? '') || labelForm.name !== (chapter.value.name ?? '')));
const chapterFormDirty = computed(() => Boolean(chapter.value) && (labelDirty.value || chapter.value.startDirty));
// 合併保存：編號名稱＋暫存年代一次提交，各自仍走原控制器命令與確認。
async function saveChapterForm() {
  const current = chapter.value;
  if (!current || locked.value) return;
  const id = current.chapterId, gameId = props.model.fields.gameId;
  const wantLabels = labelDirty.value, wantStart = Boolean(current.startDirty);
  if (!wantLabels && !wantStart) { chapterFormResult.value = '資料與已讀相同；沒有保存。'; return; }
  chapterFormResult.value = '';
  numberError.value = '';
  try {
    if (wantLabels) {
      const saved = await props.actions.saveCopyChapterLabels(id, labelForm.number, labelForm.name);
      if (!saved) { chapterFormResult.value = '編號名稱未保存（已取消確認）。'; return; }
      if (props.model.fields.gameId !== gameId) { chapterFormResult.value = '保存成功，但當前遊戲已切換，請重讀核對。'; return; }
    }
    if (wantStart) {
      const savedStart = await props.actions.saveCopyChapterStart(id);
      if (!savedStart) { chapterFormResult.value = wantLabels ? '編號名稱已保存；年代未保存（已取消確認或無變更）。' : '年代未保存（已取消確認）。'; return; }
      if (props.model.fields.gameId !== gameId) { chapterFormResult.value = '保存成功，但當前遊戲已切換，請重讀核對。'; return; }
    }
    labelForm.number = chapter.value?.number ?? '';
    labelForm.name = chapter.value?.name ?? '';
    chapterFormResult.value = '保存成功。';
    factionPage.value = generalPage.value = cityPage.value = 1;
  } catch (error) { chapterFormResult.value = '保存失敗：' + (error.message || '原因未回報'); }
}
function cancelChapterForm() {
  const current = chapter.value;
  if (!current) return;
  labelForm.number = current.number ?? '';
  labelForm.name = current.name ?? '';
  numberError.value = '';
  chapterFormResult.value = '';
  if (current.startDirty) props.actions.cancelCopyStartInput(current.chapterId);
}
// 章節可改的五屬性：所屬勢力＋四項數值（同列一次保存，唯讀態顯示文字）。
// 上限：當前生產 ≤ 最大生產、城兵 ≤ 城兵上限、上升值／防災值是 u8。
const NUMBER_FIELDS = [['prod', '當前生產', 'maxProd'], ['growth', '上升值', 255], ['defence', '防災值', 255], ['troops', '城兵', 'troopsCap'], ['troopsCap', '城兵上限', 255]];
// 城兵與城兵上限以「人」為顯示單位（存檔值×10）；其餘為原值。服務端鍵用蛇形，送信時轉回。
const tenfold = key => key === 'troops' || key === 'troopsCap';
const serverKey = key => key === 'troopsCap' ? 'troops_cap' : key;
const numberEdit = ref(null), numberError = ref('');
const numberForm = reactive({ prod: '', growth: '', defence: '', troops: '', troopsCap: '', faction: '' });
const numberLocked = computed(() => locked.value);
const generalName = slot => {
  if (slot === null || slot === undefined) return '未配置';
  const general = chapter.value?.generals.find(row => row.slot === slot);
  return general ? `${general.name}${general.hao ? `／${general.hao}` : ''}` : '人物資料缺少';
};
const factionRows = computed(() => (chapter.value?.factions ?? []).map(faction => ({
  ...faction,
  members: (chapter.value?.generals ?? []).filter(general => !general.reserved && general.factionSlot === faction.slot),
})));
const creatingFaction = ref(false), factionForm = reactive({ monarchIdx: null, cityIdx: null });
const lordCandidates = computed(() => (chapter.value?.generals ?? []).filter(row => row.monarchEligible && row.factionSlot === null && row.posts.length === 0));
const capitalCandidates = computed(() => (chapter.value?.cities ?? []).filter(city => !city.pendingChapter && city.idx <= 255 && !factionRows.value.some(faction => faction.capital === city.idx)));
function beginFaction() {
  Object.assign(factionForm, { monarchIdx: null, cityIdx: null });
  creatingFaction.value = true; numberError.value = '';
}
async function saveFaction() {
  const id = chapter.value.chapterId, gameId = props.model.fields.gameId;
  try {
    const saved = await props.actions.createCopyFaction(id, factionForm.monarchIdx, factionForm.cityIdx);
    if (saved && props.model.fields.gameId === gameId && chapter.value?.chapterId === id) { creatingFaction.value = false; numberError.value = ''; }
  } catch (error) {
    if (props.model.fields.gameId === gameId && chapter.value?.chapterId === id) numberError.value = error.message;
  }
}
const cityFactionLabel = city => {
  if (city.faction === null || city.faction === undefined) return '空城';
  const faction = factionRows.value.find(row => row.slot === city.faction);
  if (!faction) return `未列出的勢力（${city.faction}）`;
  return generalName(faction.monarchSlot);
};
const ordinaryGenerals = computed(() => {
  if (!chapter.value) return [];
  const assigned = chapter.value.generals;
  const ids = new Set(assigned.map(general => general.generalId));
  const existing = assigned.filter(general => !general.reserved && general.name.trim() && !factionRows.value.some(faction => faction.monarchSlot === general.slot))
    .map(general => ({ ...general, editKey: general.generalId ?? general.slot, unassigned: false }));
  const unassigned = (page.value?.generals ?? []).filter(general => !ids.has(general.generalId))
    .map(general => ({ ...general, editKey: general.generalId, slot: null, unassigned: true, reserved: false, posts: [], factionSlot: null, active: null, arrival: null }));
  return [...existing, ...unassigned];
});
const cities = computed(() => chapter.value?.cities ?? []);
const { currentPage: factionPage, pageSize: factionSize, total: factionTotal, pagedRows: pagedFactions } = usePagination(factionRows);
const { currentPage: generalPage, pageSize: generalSize, total: generalTotal, pagedRows: pagedGenerals } = usePagination(ordinaryGenerals);
const { currentPage: cityPage, pageSize: citySize, total: cityTotal, pagedRows: pagedCities } = usePagination(cities);
const dirty = computed(() => chapter.value?.startDirty || numberEdit.value !== null || openingEdit.value !== null || resourceEdit.value !== null || arrivalEdit.value !== null || chapterFormDirty.value || creating.value || creatingFaction.value);
// The shell mounts before controller actions are installed; initial input state is clean.
const emit = defineEmits(['notice']);
watch(numberError, message => { if (props.active) emit('notice', message); }, { flush: 'sync' });
watch(() => props.active && !attributes.value, missing => {
  if (missing) emit('notice', '尚未載入副本：請先載入本遊戲的副本再查看章節屬性。');
});
watch(dirty, value => props.actions.setChapterInputDirty(Boolean(value)), { flush: 'sync' });
onUnmounted(() => { if (createTimer !== null) { clearTimeout(createTimer); createTimer = null; } props.actions.setChapterInputDirty(false); });
watch(() => props.model.fields.gameId, () => {
  numberEdit.value = null; openingEdit.value = null; resourceEdit.value = null; arrivalEdit.value = null;
  labelForm.number = ''; labelForm.name = ''; chapterFormResult.value = '';
  creating.value = false; creatingFaction.value = false; numberError.value = '';
});
// 切換章節即載入該章現值，常駐表單不保留上一章的輸入。
watch(() => chapter.value?.chapterId, () => {
  labelForm.number = chapter.value?.number ?? '';
  labelForm.name = chapter.value?.name ?? '';
  chapterFormResult.value = '';
});
function canNavigate() {
  if (props.busy) return false;
  if (dirty.value) { numberError.value = '請先保存或取消目前輸入，再切換章節或頁籤。'; return false; }
  numberError.value = ''; return true;
}
function switchChapter(value) {
  if (!canNavigate()) return;
  props.actions.setCopyField('chapterId', value);
  factionPage.value = generalPage.value = cityPage.value = 1;
  numberEdit.value = null; numberError.value = ''; chapterFormResult.value = '';
}
// 與城池據點／武將管理同語義：按頂部當前遊戲顯式載入副本，成功後回到第一頁。
async function load() {
  if (!canLoad.value) return;
  if (dirty.value) { numberError.value = '請先保存或取消目前輸入，再重新載入副本。'; return; }
  loading.value = true; numberError.value = '';
  try { await props.actions.loadCopy(); }
  catch (error) { numberError.value = (error && error.message) || '加載未完成。'; return; }
  finally { loading.value = false; }
  factionPage.value = generalPage.value = cityPage.value = 1;
}
function setEra(value) { if (chapter.value) props.actions.setCopyStartInput(chapter.value.chapterId, 'era', value); }
function setStart(field, value) { if (chapter.value) props.actions.setCopyStartInput(chapter.value.chapterId, field, value); }
function startNumbers(city) {
  if (numberLocked.value) return;
  numberError.value = ''; numberEdit.value = city.idx;
  for (const [key] of NUMBER_FIELDS) numberForm[key] = city[key] === null || city[key] === undefined ? '' : String(city[key] * (tenfold(key) ? 10 : 1));
  numberForm.faction = city.faction ?? '';
}
function cancelNumbers() { numberEdit.value = null; numberError.value = ''; }
// 只在頁面預檢；服務端仍按記錄自身上限與原生位元組再驗一次。
async function saveNumbers(city) {
  if (numberLocked.value) return;
  numberError.value = '';
  const factionChoice = numberForm.faction === '' ? null : Number(numberForm.faction);
  if (factionChoice !== null && !factionRows.value.some(faction => faction.slot === factionChoice)) { numberError.value = '所屬勢力必須是本章已宣告的勢力槽，或空城。'; return; }
  if (factionChoice !== (city.faction ?? null) && factionRows.value.some(faction => faction.capital === city.idx)) { numberError.value = '首都不允許直接改所屬；請先在勢力設置遷都。'; return; }
  const factionChanged = factionChoice !== (city.faction ?? null);
  const values = {};
  for (const [key, label, capKey] of NUMBER_FIELDS) {
    const text = String(numberForm[key] ?? '').trim();
    if (text === '') { if (city[key] !== null && city[key] !== undefined) { numberError.value = label + ' 不可留空。'; return; } continue; }
    const storedCap = typeof capKey === 'string' ? city[capKey] : capKey;
    const scale = tenfold(key) ? 10 : 1;
    const cap = storedCap == null ? null : storedCap * scale;
    if (!/^[0-9]{1,5}$/.test(text) || cap === null || Number(text) > cap) { numberError.value = label + ' 必須是 0–' + (cap ?? '未知') + ' 的整數。'; return; }
    if (Number(text) % scale !== 0) { numberError.value = label + '人數必須是 10 的倍數。'; return; }
    const value = Number(text) / scale;
    if (value !== city[key]) values[serverKey(key)] = value;
  }
  if (!Object.keys(values).length && !factionChanged) { numberError.value = '資料與已讀相同；沒有保存。'; return; }
  try {
    if (factionChanged) {
      const saved = await props.actions.copyCityFaction(chapter.value.chapterId, city.idx, factionChoice);
      if (!saved) return;
    }
    if (Object.keys(values).length) await props.actions.copyCityNumbers(chapter.value.chapterId, city.idx, values);
    numberEdit.value = null;
  }
  // 控制器保存後已重讀副本：行回到只讀時顯示新值，不另起一次讀取。
  catch (error) { numberError.value = (error && error.message) || '保存未完成（原因未回報）。'; }
}
</script>

<template>
  <section id="chapters-editor" class="module-card" :aria-busy="loading">
    <template v-if="active">
      <div v-if="!creating" class="module-toolbar"><ElButton id="chapters-load" :aria-busy="loading" :disabled="!canLoad" @click="load()">加載</ElButton><ElButton data-chapter-create :disabled="busy || dirty || !attributes || attributes.locked" @click="creating = true; numberError = ''">新增章節</ElButton></div>
      <ElDialog v-else v-model="creating" title="新增章節" width="480" align-center :close-on-click-modal="false" destroy-on-close @close="cancelCreate">
        <ElForm :model="createForm" label-width="auto" class="chapter-create-form" @submit.prevent="createChapter">
        <div class="chapter-create-fields">
          <ElFormItem class="chapter-create-number" label="編號"><ElInput v-model="createForm.number" data-new-chapter-number :disabled="busy" /></ElFormItem>
          <ElFormItem class="chapter-create-name" label="名稱"><ElInput v-model="createForm.name" data-new-chapter-name :disabled="busy" /></ElFormItem>
        </div>
        <div class="chapter-create-fields">
          <ElFormItem class="chapter-create-era" label="紀年"><ElSelect v-model="createForm.era" :disabled="busy"><ElOption v-for="[value, label] in eras" :key="value" :value="value" :label="label" /></ElSelect></ElFormItem>
          <ElFormItem class="chapter-create-year" label="年"><ElInput v-model="createForm.year" inputmode="numeric" :disabled="busy" /></ElFormItem>
          <ElFormItem class="chapter-create-day" label="月"><ElInput v-model="createForm.month" inputmode="numeric" :disabled="busy" /></ElFormItem>
          <ElFormItem class="chapter-create-day" label="日"><ElInput v-model="createForm.day" inputmode="numeric" :disabled="busy" /></ElFormItem>
        </div>
        <p class="module-notice chapter-create-result" role="status">{{ createResult }}</p>
        </ElForm>
        <template #footer>
          <div class="chapter-create-footer">
          <ElButton data-new-chapter-save :disabled="busy || createClosing" @click="createChapter">保存</ElButton>
          <ElButton data-new-chapter-cancel :disabled="busy" @click="cancelCreate">取消</ElButton>
          </div>
        </template>
      </ElDialog>
    </template>
    <p v-if="!chapters.length && !creating" class="empty-state">尚無章節，可新增章節。</p>
    <!-- 組件與 numberForm 保留；隱藏時不掛載數百個選單及其選項。 -->
    <template v-else-if="active && !creating && chapters.length">
      <div class="module-toolbar">
        <label>章節<ElSelect id="chapters-select" class="chapter-switch" :model-value="chapter?.chapterId" :disabled="busy || !attributes" @change="switchChapter($event)"><ElOption v-for="row in chapters" :key="row.chapterId" :value="row.chapterId" :label="chapterOptionLabel(row)"><span class="chapter-option-number">{{ row.number ?? '' }}</span><span class="chapter-option-name">{{ row.name }}</span><span class="chapter-option-date">{{ chapterOptionDate(row) }}</span></ElOption></ElSelect></label>
        <ElTag v-if="chapter?.startDirty" type="warning" effect="plain">年代輸入未保存</ElTag>
      </div>
      <ElTabs v-model="activeTab" class="chapter-tabs" :before-leave="canNavigate">
      <ElTabPane label="章節管理" name="chapters">
      <div class="module-toolbar">
        <ElButton data-chapter-copy :disabled="locked || dirty" @click="actions.copyChapter('copy', chapter.chapterId)">複製本章</ElButton>
        <ElButton data-chapter-delete :disabled="locked || dirty" @click="actions.copyChapter('delete', chapter.chapterId)">刪除本章</ElButton>
      </div>
      <ElForm :model="labelForm" label-width="auto" class="chapter-create-form" @submit.prevent="saveChapterForm">
      <div class="chapter-create-fields">
        <ElFormItem class="chapter-create-number" label="編號"><ElInput v-model="labelForm.number" data-chapter-number :disabled="locked" /></ElFormItem>
        <ElFormItem class="chapter-create-name" label="名稱"><ElInput v-model="labelForm.name" data-chapter-name :disabled="locked" /></ElFormItem>
      </div>
      <p class="chapter-start-title">開始年代</p>
      <p v-if="chapter?.startMissing" class="module-notice">本章沒有已讀的開始日期物件；本頁不補預設日期。</p>
      <div class="chapter-create-fields">
        <ElFormItem class="chapter-create-era" label="紀年"><ElSelect data-start-era :model-value="chapter?.start.era" :disabled="locked || chapter?.startMissing" @change="setEra($event)"><ElOption v-for="[value, label] in eras" :key="value" :value="value" :label="label" /></ElSelect></ElFormItem>
        <ElFormItem class="chapter-create-year" label="年"><ElInput data-start-year inputmode="numeric" maxlength="5" :model-value="chapter?.start.year" :disabled="locked || chapter?.startMissing" @input="setStart('year', $event)" /></ElFormItem>
        <ElFormItem class="chapter-create-day" label="月"><ElInput data-start-month inputmode="numeric" maxlength="2" :model-value="chapter?.start.month" :disabled="locked || chapter?.startMissing" @input="setStart('month', $event)" /></ElFormItem>
        <ElFormItem class="chapter-create-day" label="日"><ElInput data-start-day inputmode="numeric" maxlength="2" :model-value="chapter?.start.day" :disabled="locked || chapter?.startMissing" @input="setStart('day', $event)" /></ElFormItem>
      </div>
      <p class="module-notice chapter-create-result" role="status">{{ chapterFormResult }}</p>
      <div class="chapter-create-footer">
        <ElButton data-chapter-form-save :disabled="busy || locked || !chapterFormDirty" @click="saveChapterForm">保存</ElButton>
        <ElButton data-chapter-form-cancel :disabled="busy || locked || !chapterFormDirty" @click="cancelChapterForm">取消</ElButton>
      </div>
      </ElForm>
      </ElTabPane>
      <ElTabPane label="勢力設置" name="factions">
      <div class="module-toolbar">
        <ElButton v-if="!creatingFaction" data-faction-create :disabled="locked || dirty || !chapter || chapter.allocatedFactionSlots >= 22" :title="chapter?.allocatedFactionSlots >= 22 ? '本章22個正常勢力槽已分配完畢；已退役槽不復用' : undefined" @click="beginFaction">建立勢力</ElButton>
        <template v-else>
          <label>君主<ElSelect v-model="factionForm.monarchIdx" data-faction-new-lord :disabled="busy || !lordCandidates.length" :placeholder="lordCandidates.length ? '選擇君主' : '暫無可任用自由武將'"><ElOption v-for="general in lordCandidates" :key="general.slot" :value="general.slot" :label="general.name" /></ElSelect></label>
          <label>首都<ElSelect v-model="factionForm.cityIdx" data-faction-new-capital :disabled="busy" placeholder="選擇首都"><ElOption v-for="city in capitalCandidates" :key="city.idx" :value="city.idx" :label="city.name" /></ElSelect></label>
          <ElButton data-faction-create-save :disabled="busy || factionForm.monarchIdx === null || factionForm.cityIdx === null" @click="saveFaction">保存</ElButton>
          <ElButton data-faction-create-cancel :disabled="busy" @click="creatingFaction = false; numberError = ''">取消</ElButton>
        </template>
      </div>
      <ElTable id="chapters-factions-table" :data="pagedFactions" row-key="slot" height="100%">
        <ElTableColumn label="編號" width="80"><template #default="{ row: faction }"><span :data-faction-slot="faction.slot">{{ faction.number ?? faction.slot + 1 }}</span></template></ElTableColumn>
        <ElTableColumn label="君主" width="180"><template #default="{ row: faction }"><ElSelect :key="factionSelectionRevision" data-monarch-select :model-value="faction.monarchSlot" :disabled="locked || dirty" @change="saveFactionSelection(faction, 'monarch', $event)"><ElOption v-for="general in chapter.generals.filter(row => row.slot === faction.monarchSlot || row.monarchEligible && row.posts.length === 0 && (row.factionSlot === null || row.factionSlot === faction.slot))" :key="general.slot" :value="general.slot" :label="general.name" /></ElSelect></template></ElTableColumn>
        <ElTableColumn label="軍師" width="180"><template #default="{ row: faction }"><ElSelect :key="factionSelectionRevision" data-strategist-select :model-value="faction.advisorSlot" :empty-values="[undefined]" :disabled="locked || dirty" @change="saveFactionSelection(faction, 'strategist', $event)"><ElOption :value="null" label="無" /><ElOption v-for="general in chapter.generals.filter(row => row.slot === faction.advisorSlot || row.strategistEligible && row.factionSlot === faction.slot && row.posts.length === 0)" :key="general.slot" :value="general.slot" :label="general.name" /></ElSelect></template></ElTableColumn>
        <ElTableColumn label="首都" width="180"><template #default="{ row: faction }"><ElSelect :key="factionSelectionRevision" data-faction-capital :model-value="faction.capital" :empty-values="[undefined]" placeholder="未設定" :disabled="locked || dirty" @change="saveFactionSelection(faction, 'capital', $event)"><ElOption v-for="city in chapter.cities.filter(row => row.faction === faction.slot && !factionRows.some(other => other.slot !== faction.slot && other.capital === row.idx))" :key="city.idx" :value="city.idx" :label="city.name" /></ElSelect></template></ElTableColumn>
        <ElTableColumn v-for="field in openingFields" :key="field.key" :label="field.label" width="130"><template #default="{ row: faction }">
          <template v-if="openingEdit === faction.slot"><ElInput v-model="openingForm[field.key]" :data-opening-input="field.key" inputmode="numeric" :disabled="busy" /><small v-if="field.people && /^\d+$/.test(openingForm[field.key])">保存人數 {{ Math.floor(Number(openingForm[field.key]) / 10) * 10 }}</small></template>
          <template v-else>{{ faction.opening ? field.read(faction.opening) : '—' }}</template>
        </template></ElTableColumn>
        <ElTableColumn v-for="[key, label] in resourceFields" :key="key" :label="label" width="130"><template #default="{ row: faction }">
          <template v-if="resourceEdit === faction.slot"><ElInput v-model="resourceForm[key]" :data-resource-input="key" inputmode="numeric" :disabled="busy" /><small v-if="key !== 'money' && /^\d+$/.test(resourceForm[key])">保存人數 {{ Math.floor(Number(resourceForm[key]) / 10) * 10 }}</small></template>
          <template v-else>{{ faction.resourcePeople[key] }}</template>
        </template></ElTableColumn>
        <ElTableColumn label="操作" width="280"><template #default="{ row: faction }"><div class="account-row-actions chapter-faction-actions">
          <template v-if="openingEdit === faction.slot"><ElButton data-opening-save :disabled="busy" @click="saveOpening(faction)">保存</ElButton><ElButton :disabled="busy" @click="openingEdit = null; numberError = ''">取消</ElButton></template>
          <template v-else-if="resourceEdit === faction.slot"><ElButton data-resource-save :disabled="busy" @click="saveResources(faction)">保存</ElButton><ElButton :disabled="busy" @click="resourceEdit = null; numberError = ''">取消</ElButton></template>
          <template v-else><ElButton data-opening-edit :disabled="locked || dirty || !faction.opening" @click="editOpening(faction)">開局方案</ElButton><ElButton data-resource-edit :disabled="locked || dirty" @click="editResources(faction)">資源</ElButton><ElButton :data-faction-disband="faction.slot" :disabled="locked || dirty" @click="saveFactionSelection(faction, 'disband')">解散</ElButton></template>
        </div></template></ElTableColumn>
        <template #empty>本章沒有已宣告的勢力。</template>
      </ElTable>
      <ListPagination v-model:current-page="factionPage" v-model:page-size="factionSize" :total="factionTotal" :disabled="busy || dirty" />
      </ElTabPane>
      <ElTabPane label="勢力武將" name="generals">
      <ElTable id="chapters-generals-table" class="chapter-fluid-table" :data="pagedGenerals" row-key="editKey" height="100%">
        <ElTableColumn label="槽" min-width="24"><template #default="{ row: general }"><span :data-general-slot="general.slot">{{ general.unassigned ? '未配置' : general.slot }}</span></template></ElTableColumn>
        <ElTableColumn label="頭像" min-width="56"><template #default="{ row: general }"><img v-if="general.portraitRef" :src="`/api/games/${encodeURIComponent(model.fields.gameId)}/portraits/${encodeURIComponent(general.portraitRef.assetId)}/bytes?sha256=${general.portraitRef.sha256}`" :alt="general.name" width="48" height="48" loading="lazy" /><span v-else>—</span></template></ElTableColumn>
        <ElTableColumn prop="name" label="姓名" min-width="48" show-overflow-tooltip />
        <ElTableColumn label="字" min-width="24" show-overflow-tooltip><template #default="{ row: general }">{{ general.zi || '—' }}</template></ElTableColumn>
        <ElTableColumn label="號" min-width="24" show-overflow-tooltip><template #default="{ row: general }">{{ general.hao || '—' }}</template></ElTableColumn>
        <ElTableColumn v-for="[key, label] in [['force', '武力'], ['lead', '統率'], ['politics', '政治'], ['siege', '攻城'], ['field', '野戰'], ['naval', '水戰']]" :key="key" :label="label" min-width="24"><template #default="{ row: general }">{{ general.ability?.[key] ?? '—' }}</template></ElTableColumn>
        <ElTableColumn label="勢力被滅被俘" width="112"><template #default="{ row: general }">{{ general.suicideOnCapture ? '會自殺' : '—' }}</template></ElTableColumn>
        <ElTableColumn label="所屬勢力" min-width="64"><template #default="{ row: general }"><ElSelect v-if="arrivalEdit === general.editKey" v-model="arrivalForm.factionId" data-arrival-faction :empty-values="[undefined]" :disabled="busy || general.posts.length > 0"><ElOption :value="null" label="無" /><ElOption v-if="arrivalForm.factionId !== null && !factionRows.some(row => row.slot === arrivalForm.factionId)" :value="arrivalForm.factionId" :label="general.unlistedFactionName || `未列出的勢力（${arrivalForm.factionId}）`" disabled /><ElOption v-for="faction in factionRows.filter(row => row.monarchSlot !== null)" :key="faction.slot" :value="faction.slot" :label="generalName(faction.monarchSlot)" /></ElSelect><span v-else data-general-faction>{{ general.factionSlot === null ? '無' : factionRows.some(row => row.slot === general.factionSlot) ? generalName(factionRows.find(row => row.slot === general.factionSlot).monarchSlot) : general.unlistedFactionName || `未列出的勢力（${general.factionSlot}）` }}</span></template></ElTableColumn>
        <ElTableColumn label="已登場" min-width="32"><template #default="{ row: general }"><ElCheckbox v-if="arrivalEdit === general.editKey && arrivalForm.active !== null" v-model="arrivalForm.active" data-arrival-active :disabled="busy" aria-label="已登場" /><span v-else>{{ general.active === null ? '—' : general.active ? '是' : '否' }}</span></template></ElTableColumn>
        <ElTableColumn label="登場倒計時（月）" min-width="112"><template #default="{ row: general }"><ElInputNumber v-if="arrivalEdit === general.editKey" v-model="arrivalForm.appearMonths" data-arrival-months :min="0" :max="255" :step="1" step-strictly :disabled="busy" /><span v-else>{{ general.arrival?.appearMonths ?? '—' }}</span></template></ElTableColumn>
        <ElTableColumn label="預定投奔" min-width="64" show-overflow-tooltip><template #default="{ row: general }"><ElSelect v-if="arrivalEdit === general.editKey" v-model="arrivalForm.joinFaction" data-arrival-join :empty-values="[undefined]" :disabled="busy"><ElOption :value="null" label="無" /><ElOption v-for="faction in factionRows.filter(row => row.monarchSlot !== null)" :key="faction.slot" :value="faction.slot" :label="generalName(faction.monarchSlot)" /></ElSelect><span v-else>{{ !general.arrival ? '—' : general.arrival.joinFaction === null ? '無' : generalName(factionRows.find(row => row.slot === general.arrival.joinFaction)?.monarchSlot) }}</span></template></ElTableColumn>
        <ElTableColumn label="操作" min-width="80"><template #default="{ row: general }"><div class="account-row-actions"><template v-if="arrivalEdit === general.editKey"><ElButton data-arrival-save :disabled="busy" @click="saveArrival(general)">保存</ElButton><ElButton :disabled="busy" @click="arrivalEdit = null; numberError = ''">取消</ElButton></template><ElButton v-else data-arrival-edit :disabled="locked || dirty || (!general.arrival && !general.unassigned)" @click="editArrival(general)">編輯</ElButton></div></template></ElTableColumn>
        <template #empty>本章沒有普通武將槽。</template>
      </ElTable>
      <ListPagination v-model:current-page="generalPage" v-model:page-size="generalSize" :total="generalTotal" :disabled="busy || dirty" />
      </ElTabPane>
      <ElTabPane label="外交關係" name="diplomacy">
        <ElTable id="chapters-diplomacy-table" :data="chapter?.diplomacy ? pagedFactions : []" row-key="slot" height="100%" :empty-text="chapter && !chapter.diplomacy ? '本章尚無完整外交資料' : '暫無勢力'">
          <ElTableColumn width="60"><template #default="{ row }">{{ generalName(row.monarchSlot) }}</template></ElTableColumn>
          <ElTableColumn v-for="target in factionRows" :key="target.slot" :label="generalName(target.monarchSlot)" width="70">
            <template #default="{ row }">
              <span v-if="row.slot === target.slot" data-diplomacy-diagonal>－</span>
              <ElSelect v-else :key="diplomacySelectionRevision" :data-diplomacy-cell="`${row.slot}-${target.slot}`" :model-value="chapterDiplomacyRelation(chapter.diplomacy[row.slot][target.slot])" :disabled="locked || dirty" @change="saveDiplomacy(row.slot, target.slot, $event)">
                <ElOption v-if="chapterDiplomacyRelation(chapter.diplomacy[row.slot][target.slot]) === 'war'" value="war" label="交戰" disabled />
                <ElOption v-if="chapterDiplomacyRelation(chapter.diplomacy[row.slot][target.slot]) === 'unknown'" value="unknown" label="－－" disabled />
                <ElOption v-for="option in CHAPTER_DIPLOMACY_RELATIONS" :key="option.id" :value="option.id" :label="option.label" />
              </ElSelect>
            </template>
          </ElTableColumn>
        </ElTable>
        <ListPagination v-model:current-page="factionPage" v-model:page-size="factionSize" :total="factionTotal" :disabled="busy || dirty" />
      </ElTabPane>
      <ElTabPane label="勢力據點" name="cities">
      <ElTable id="chapters-cities-table" class="chapter-fluid-table" :data="pagedCities" row-key="idx" height="100%">
        <ElTableColumn label="據點" min-width="32"><template #default="{ row: city }"><span :data-city-idx="city.idx">{{ city.idx }}</span></template></ElTableColumn>
        <ElTableColumn prop="name" label="名稱" min-width="48" show-overflow-tooltip />
        <ElTableColumn label="座標" min-width="44"><template #default="{ row: city }"><span data-city-position>{{ city.x ?? '—' }}, {{ city.y ?? '—' }}</span></template></ElTableColumn>
        <ElTableColumn label="類型" min-width="40"><template #default="{ row: city }"><span data-city-type>{{ cityTypeNames[city.type] ?? (city.type == null ? '—' : city.type + '（未知）') }}</span></template></ElTableColumn>
        <ElTableColumn label="最大生產" min-width="48"><template #default="{ row: city }"><span data-city-max-prod>{{ city.maxProd ?? '—' }}</span></template></ElTableColumn>
        <ElTableColumn label="所屬勢力" min-width="80"><template #default="{ row: city }"><ElSelect v-if="numberEdit === city.idx" v-model="numberForm.faction" data-city-faction :disabled="busy || factionRows.some(faction => faction.capital === city.idx)"><ElOption value="" label="空城" /><ElOption v-for="faction in factionRows" :key="faction.slot" :value="faction.slot" :label="generalName(faction.monarchSlot)" /></ElSelect><span v-else data-city-faction-readonly>{{ city.pendingChapter ? '尚無章節設定' : cityFactionLabel(city) }}</span></template></ElTableColumn>
        <ElTableColumn v-for="[key, label, capKey] in NUMBER_FIELDS" :key="key" :label="label" min-width="48"><template #default="{ row: city }"><div :data-city-number="key" :title="label + '（上限 ' + ((typeof capKey === 'string' ? city[capKey] : capKey) == null ? '未知' : (typeof capKey === 'string' ? city[capKey] : capKey) * (tenfold(key) ? 10 : 1)) + '）'"><ElInput v-if="numberEdit === city.idx" v-model="numberForm[key]" :data-number-input="key" inputmode="numeric" maxlength="5" :disabled="busy" /><template v-else>{{ city[key] == null ? '—' : city[key] * (tenfold(key) ? 10 : 1) }}</template></div></template></ElTableColumn>
        <ElTableColumn label="首都" min-width="40"><template #default="{ row: city }"><span data-city-capital-readonly>{{ factionRows.some(faction => faction.capital === city.idx) ? '✓' : '' }}</span></template></ElTableColumn>
        <ElTableColumn label="操作" min-width="80"><template #default="{ row: city }"><div class="account-row-actions"><template v-if="numberEdit === city.idx"><ElButton data-number-save :disabled="busy" @click="saveNumbers(city)">保存</ElButton><ElButton data-number-cancel :disabled="busy" @click="cancelNumbers()">取消</ElButton></template><ElButton v-else data-number-edit :disabled="numberLocked || city.pendingChapter" @click="startNumbers(city)">編輯</ElButton></div></template></ElTableColumn>
        <template #empty>本章沒有據點。</template>
      </ElTable>
      <ListPagination v-model:current-page="cityPage" v-model:page-size="citySize" :total="cityTotal" :disabled="busy || dirty" />
      </ElTabPane>
      </ElTabs>
    </template>
  </section>
</template>

<style scoped>
#chapters-editor:not([hidden]) { display: flex; flex-direction: column; overflow: hidden; }
.chapter-tabs { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.chapter-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.chapter-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.chapter-tabs :deep(.el-table) { flex: 1; min-height: 0; }
/* Keep default controls; avoid the wrapped action stack that inflated every faction row. */
.chapter-faction-actions { flex-wrap: nowrap; }
#chapters-factions-table :deep(.el-table__body .el-table__cell) { padding-block: 6px; }
.chapter-faction-actions :deep(.el-button + .el-button), .chapter-fluid-table :deep(.el-button + .el-button) { margin-left: 0; }
.chapter-fluid-table :deep(.cell), #chapters-diplomacy-table :deep(.cell) { padding-inline: 4px; overflow-wrap: anywhere; }
.chapter-fluid-table :deep(.el-input-number) { width: 100%; min-width: 0; }
.chapter-fluid-table :deep(.el-select), .chapter-fluid-table :deep(.el-input) { min-width: 0; max-width: 100%; }
#chapters-diplomacy-table :deep(.el-select__wrapper) { padding-inline: 4px; gap: 2px; }
</style>
