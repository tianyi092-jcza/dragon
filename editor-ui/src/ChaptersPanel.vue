<script setup>
import { computed, reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
// 遊戲章節（章節級）：章節開始年代、據點章節屬性、武將章節屬性。
// 三面只送單一命令，保存後控制器自動重讀副本；君主／軍師仍在「遊戲管理」的章節角色區，
// 內政官（太守）在本頁據點面設定，寫入器同時維護身份與舊預算。
// 資料走副本頁 attributes 投影，不再經過修訂。
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const page = computed(() => props.model?.copy?.page ?? null);
const attributes = computed(() => page.value?.attributes ?? null);
const locked = computed(() => Boolean(props.busy) || !attributes.value || attributes.value.locked);
const chapters = computed(() => attributes.value?.chapters ?? []);
const chapter = computed(() => chapters.value.find(row => row.chapterId === props.model?.fields?.chapterId) ?? chapters.value[0] ?? null);
const eras = [['ad', '公元后'], ['bc', '公元前']];
// 章節可改的五屬性：所屬勢力（即時單命令）＋四項數值（同列一次保存）。
// 上限：當前生產 ≤ 最大生產、城兵 ≤ 城兵上限、上升值／防災值是 u8。
const NUMBER_FIELDS = [['prod', '當前生產', 'maxProd'], ['growth', '上升值', 255], ['defence', '防災值', 255], ['troops', '城兵', 'troopsCap']];
const numberEdit = ref(null), numberError = ref('');
const numberForm = reactive({ prod: '', growth: '', defence: '', troops: '' });
const numberLocked = computed(() => locked.value);
const factionSlotLabel = slot => (slot === null || slot === undefined ? '中立' : `勢力槽 ${slot}`);
const cityName = idx => chapter.value?.cities.find(city => city.idx === idx)?.name ?? (idx === null || idx === undefined ? null : `據點 #${idx}`);
const generalName = slot => {
  if (slot === null || slot === undefined) return '未配置';
  const general = chapter.value?.generals.find(row => row.slot === slot);
  return general ? `槽 ${slot}／${general.name}${general.hao ? `／${general.hao}` : ''}` : `槽 ${slot}／人物資料缺少`;
};
const factionRows = computed(() => (chapter.value?.factions ?? []).map(faction => ({
  ...faction,
  members: (chapter.value?.generals ?? []).filter(general => !general.reserved && general.factionSlot === faction.slot),
})));
const ordinaryGenerals = computed(() => (chapter.value?.generals ?? []).filter(general => !general.reserved));
function switchChapter(value) {
  props.actions.setCopyField('chapterId', value);
  numberEdit.value = null; numberError.value = '';
}
function setEra(value) { if (chapter.value) props.actions.setCopyStartInput(chapter.value.chapterId, 'era', value); }
function setStart(field, value) { if (chapter.value) props.actions.setCopyStartInput(chapter.value.chapterId, field, value); }
// Controlled selects keep the stored value when a command is cancelled.
function setCityFaction(city, choice) {
  props.actions.copyCityFaction(chapter.value.chapterId, city.idx, choice === '' ? null : Number(choice));
}
function setGeneralFaction(general, choice) {
  props.actions.copyGeneralFaction(chapter.value.chapterId, general.slot, choice === '' ? null : Number(choice));
}
// 太守（內政官）只能從該據點勢力的成員中選；空值＝清空（同時清該武將身份與舊預算）。
function setGovernor(city, choice) {
  props.actions.copyGovernor(chapter.value.chapterId, city.idx, choice === '' ? null : Number(choice));
}
function setDiplomat(faction, choice) {
  props.actions.copyDiplomat(chapter.value.chapterId, faction.slot, choice === '' ? null : Number(choice));
}
function startNumbers(city) {
  if (numberLocked.value) return;
  numberError.value = ''; numberEdit.value = city.idx;
  for (const [key] of NUMBER_FIELDS) numberForm[key] = city[key] === null || city[key] === undefined ? '' : String(city[key]);
}
function cancelNumbers() { numberEdit.value = null; numberError.value = ''; }
// 只在頁面預檢；服務端仍按記錄自身上限與原生位元組再驗一次。
async function saveNumbers(city) {
  if (numberLocked.value) return;
  numberError.value = '';
  const values = {};
  for (const [key, label, capKey] of NUMBER_FIELDS) {
    const text = String(numberForm[key] ?? '').trim();
    if (text === '') { if (city[key] !== null && city[key] !== undefined) { numberError.value = label + ' 不可留空。'; return; } continue; }
    const cap = typeof capKey === 'string' ? city[capKey] : capKey;
    if (!/^[0-9]{1,5}$/.test(text) || cap === null || cap === undefined || Number(text) > cap) { numberError.value = label + ' 必須是 0–' + (cap ?? 255) + ' 的整數。'; return; }
    const value = Number(text);
    if (value !== city[key]) values[key] = value;
  }
  if (!Object.keys(values).length) { numberError.value = '數值與已讀資料相同；沒有保存。'; return; }
  try { await props.actions.copyCityNumbers(chapter.value.chapterId, city.idx, values); numberEdit.value = null; }
  // 控制器保存後已重讀副本：行回到只讀時顯示新值，不另起一次讀取。
  catch (error) { numberError.value = (error && error.message) || '保存未完成（原因未回報）。'; }
}
</script>

<template>
  <section id="chapters-editor" class="module-card">
    <p>章節屬遊戲級：每章各自有開始年代、據點所屬／首都與武將所屬／職務；地圖與武將基礎資料由底層資源共用。三面都只送一條命令，保存後控制器自動重讀副本，不開放初始化或運行准入。</p>
    <p v-if="!attributes" class="module-notice">尚未載入副本：請先載入本遊戲的副本再查看章節屬性。</p>
    <p v-if="!chapters.length" class="empty-state">沒有可顯示的章節屬性；載入副本後再查看。</p>
    <template v-else>
      <div class="module-toolbar">
        <label>章節<ElSelect id="chapters-select" :model-value="chapter?.chapterId" :disabled="busy || !attributes" @change="switchChapter($event)"><ElOption v-for="row in chapters" :key="row.chapterId" :value="row.chapterId" :label="row.name" /></ElSelect></label>
        <ElTag effect="plain">{{ chapter?.chapterId }}</ElTag>
        <ElTag v-if="chapter?.startDirty" type="warning" effect="plain">年代輸入未保存</ElTag>
      </div>
      <h3>章節定義：開始年代</h3>
      <p>紀年標籤是作者層標記，與年／月／日一起構成該章計時起點；切換紀年不會把既有年份取負或重編號。年 1～65535、月 1～12、日 1～31 只是輸入範圍。</p>
      <p v-if="chapter?.startMissing" class="module-notice">本章沒有已讀的開始日期物件；本頁不補預設日期。</p>
      <div class="module-toolbar">
        <label>紀年<ElSelect data-start-era :model-value="chapter?.start.era" :disabled="locked || chapter?.startMissing" @change="setEra($event)"><ElOption v-for="[value, label] in eras" :key="value" :value="value" :label="label" /></ElSelect></label>
        <label>年<ElInput data-start-year inputmode="numeric" maxlength="5" :model-value="chapter?.start.year" :disabled="locked || chapter?.startMissing" @input="setStart('year', $event)" /></label>
        <label>月<ElInput data-start-month inputmode="numeric" maxlength="2" :model-value="chapter?.start.month" :disabled="locked || chapter?.startMissing" @input="setStart('month', $event)" /></label>
        <label>日<ElInput data-start-day inputmode="numeric" maxlength="2" :model-value="chapter?.start.day" :disabled="locked || chapter?.startMissing" @input="setStart('day', $event)" /></label>
        <ElButton data-start-save :disabled="locked || !chapter?.startDirty" @click="actions.saveCopyChapterStart(chapter.chapterId)">保存開始年代</ElButton>
        <ElButton data-start-cancel :disabled="locked || !chapter?.startDirty" @click="actions.cancelCopyStartInput(chapter.chapterId)">取消年代輸入</ElButton>
      </div>
      <h3>據點章節屬性</h3>
      <p>所屬勢力可設為中立；首都唯一且不要求該據點屬於此勢力。四項數值同列一次保存：當前生產 ≤ 最大生產、城兵 ≤ 城兵上限、上升值／防災值為 0–255。名稱與座標屬遊戲共享資料。內政官只能選該據點所屬勢力的武將。</p>
      <ElTable :data="factionRows" row-key="slot">
        <ElTableColumn label="勢力槽" min-width="120"><template #default="{ row: faction }"><span :data-faction-slot="faction.slot">勢力槽 {{ faction.slot }}</span></template></ElTableColumn>
        <ElTableColumn label="君主" min-width="180"><template #default="{ row: faction }">{{ generalName(faction.monarchSlot) }}</template></ElTableColumn>
        <ElTableColumn label="軍師" min-width="180"><template #default="{ row: faction }">{{ generalName(faction.advisorSlot) }}</template></ElTableColumn>
        <ElTableColumn label="外交官" min-width="240"><template #default="{ row: faction }"><ElSelect data-faction-diplomat :model-value="faction.diplomatSlot ?? ''" :disabled="locked" @change="setDiplomat(faction, $event)"><ElOption value="" label="未配置（清空）" /><ElOption v-for="general in faction.members" :key="general.slot" :value="general.slot" :label="`槽 ${general.slot}／${general.name}${general.posts.length ? `（${general.posts.join('、')}）` : ''}`" /></ElSelect></template></ElTableColumn>
        <ElTableColumn label="首都" min-width="180"><template #default="{ row: faction }">{{ faction.capital === null ? '未設定' : `${cityName(faction.capital)}（#${faction.capital}）` }}</template></ElTableColumn>
        <template #empty>本章沒有已宣告的勢力。</template>
      </ElTable>
      <ElTable :data="chapter?.cities ?? []" row-key="idx">
        <ElTableColumn label="據點" min-width="90"><template #default="{ row: city }"><span :data-city-idx="city.idx">#{{ city.idx }}</span></template></ElTableColumn>
        <ElTableColumn prop="name" label="名稱" min-width="120" />
        <ElTableColumn label="所屬勢力" min-width="180"><template #default="{ row: city }"><ElSelect data-city-faction :model-value="city.faction ?? ''" :disabled="locked" @change="setCityFaction(city, $event)"><ElOption value="" label="中立" /><ElOption v-for="faction in factionRows" :key="faction.slot" :value="faction.slot" :label="`勢力槽 ${faction.slot}`" /></ElSelect></template></ElTableColumn>
        <ElTableColumn v-for="[key, label, capKey] in NUMBER_FIELDS" :key="key" :label="label" min-width="140"><template #default="{ row: city }"><div :data-city-number="key" :title="label + '（上限 ' + (typeof capKey === 'string' ? city[capKey] : capKey) + '）'"><ElInput v-if="numberEdit === city.idx" v-model="numberForm[key]" :data-number-input="key" inputmode="numeric" maxlength="5" :disabled="busy" /><template v-else>{{ city[key] ?? '—' }}</template></div></template></ElTableColumn>
        <ElTableColumn label="首都" min-width="160"><template #default="{ row: city }"><ElTag v-if="city.faction !== null && factionRows.find(row => row.slot === city.faction)?.capital === city.idx" type="success" effect="plain">首都</ElTag><ElButton v-else-if="city.faction !== null" data-city-capital :disabled="locked" @click="actions.copyCapital(chapter.chapterId, city.faction, city.idx)">設為首都</ElButton><span v-else>—</span></template></ElTableColumn>
        <ElTableColumn label="內政官" min-width="240"><template #default="{ row: city }"><ElSelect data-city-governor :model-value="city.governor ?? ''" :disabled="locked || city.faction === null" :title="city.faction === null ? '中立據點沒有內政官' : undefined" @change="setGovernor(city, $event)"><ElOption value="" label="未配置（清空）" /><ElOption v-for="general in (factionRows.find(row => row.slot === city.faction)?.members ?? [])" :key="general.slot" :value="general.slot" :label="`槽 ${general.slot}／${general.name}${general.posts.length ? `（${general.posts.join('、')}）` : ''}`" /></ElSelect></template></ElTableColumn>
        <ElTableColumn label="操作" min-width="180"><template #default="{ row: city }"><div class="account-row-actions"><template v-if="numberEdit === city.idx"><ElButton data-number-save :disabled="busy" @click="saveNumbers(city)">保存</ElButton><ElButton data-number-cancel :disabled="busy" @click="cancelNumbers()">取消</ElButton></template><ElButton v-else data-number-edit :disabled="numberLocked" @click="startNumbers(city)">編輯</ElButton></div></template></ElTableColumn>
        <template #empty>本章沒有據點。</template>
      </ElTable>
      <p v-if="numberError" class="module-notice" role="status">{{ numberError }}</p>
      <h3>武將章節屬性</h3>
      <p>所屬勢力可設為自由；持有君主／軍師／外交官職務的武將須先清空職務才能改所屬。君主與軍師請用「遊戲管理」的章節角色工作流；外交官在上一表設定或清空。保留槽不參與任官。</p>
      <ElTable :data="ordinaryGenerals" row-key="slot">
        <ElTableColumn label="槽" min-width="90"><template #default="{ row: general }"><span :data-general-slot="general.slot">#{{ general.slot }}</span></template></ElTableColumn>
        <ElTableColumn prop="name" label="名" min-width="120" />
        <ElTableColumn label="字" min-width="120"><template #default="{ row: general }">{{ general.hao || '—' }}</template></ElTableColumn>
        <ElTableColumn label="所屬勢力" min-width="200"><template #default="{ row: general }"><ElSelect data-general-faction :model-value="general.factionSlot ?? ''" :disabled="Boolean(locked || general.posts.length)" :title="general.posts.length ? `已擔任${general.posts.join('、')}；請先清空職務` : undefined" @change="setGeneralFaction(general, $event)"><ElOption value="" label="自由" /><ElOption v-for="faction in factionRows" :key="faction.slot" :value="faction.slot" :label="`勢力槽 ${faction.slot}`" /></ElSelect></template></ElTableColumn>
        <ElTableColumn label="身份與職務" min-width="200"><template #default="{ row: general }">{{ general.posts.length ? general.posts.join('、') : '無職務' }}</template></ElTableColumn>
        <template #empty>本章沒有普通武將槽。</template>
      </ElTable>
      <p id="chapters-status" class="module-notice" role="status">{{ model.message }}</p>
    </template>
  </section>
</template>
