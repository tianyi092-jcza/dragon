<script setup>
import { computed } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
// 遊戲章節（章節級）：章節開始年代、據點章節屬性、武將章節屬性。
// 三面只送單一命令，保存後自動重讀；君主／軍師仍在「遊戲管理」的章節角色區，
// 內政官（太守）在本頁據點面設定，寫入器同時維護身份與舊預算。
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const attributes = computed(() => props.model.attributes ?? {});
const locked = computed(() => Boolean(props.busy) || !attributes.value.known || attributes.value.locked !== false);
const chapters = computed(() => attributes.value.chapters ?? []);
const chapter = computed(() => chapters.value.find(row => row.chapterId === props.model.fields.chapterId) ?? chapters.value[0] ?? null);
const eras = [['ad', '公元后'], ['bc', '公元前']];
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
function switchChapter(event) {
  props.actions.setField('chapterId', event.target.value);
  event.target.value = props.model.fields.chapterId;
}
function setEra(event) { if (chapter.value) props.actions.setStartInput(chapter.value.chapterId, 'era', event.target.value); }
function setStart(field, event) { if (chapter.value) props.actions.setStartInput(chapter.value.chapterId, field, event.target.value); }
// A cancelled save keeps the model value; restore the native control so the
// select never shows an affiliation that was not stored.
function setCityFaction(city, event) {
  const value = event.target.value === '' ? null : Number(event.target.value);
  props.actions.cityFaction(chapter.value.chapterId, city.idx, value);
  event.target.value = city.faction === null || city.faction === undefined ? '' : String(city.faction);
}
function setGeneralFaction(general, event) {
  const value = event.target.value === '' ? null : Number(event.target.value);
  props.actions.generalFaction(chapter.value.chapterId, general.slot, value);
  event.target.value = general.factionSlot === null || general.factionSlot === undefined ? '' : String(general.factionSlot);
}
// 太守（內政官）只能從該據點勢力的成員中選；空值＝清空（同時清該武將身份與舊預算）。
function setGovernor(city, event) {
  const value = event.target.value === '' ? null : Number(event.target.value);
  props.actions.cityGovernor(chapter.value.chapterId, city.idx, value);
  event.target.value = city.governor === null || city.governor === undefined ? '' : String(city.governor);
}
function setDiplomat(faction, event) {
  const value = event.target.value === '' ? null : Number(event.target.value);
  props.actions.setDiplomat(chapter.value.chapterId, faction.slot, value);
  event.target.value = faction.diplomatSlot === null || faction.diplomatSlot === undefined ? '' : String(faction.diplomatSlot);
}
</script>

<template>
  <section id="chapters-editor" class="module-card">
    <p>章節屬遊戲級：每章各自有開始年代、據點所屬／首都與武將所屬／職務；地圖與武將基礎資料由底層資源共用。三面都只送一條命令，保存後自動重讀該修訂，不開放初始化或運行准入。</p>
    <p v-if="!attributes.supported" class="module-notice">本修訂屬封閉原生的作者檔案：章節屬性只能改章名與章節結構，原生勢力／據點／武將欄位保持封閉，請改用完整副本再編輯。</p>
    <p v-else-if="!attributes.known" class="module-notice">尚未取得完整章節屬性投影：請先載入完整副本的明確修訂並確認沒有未確認的保存操作。</p>
    <p v-if="!chapters.length" class="empty-state">沒有可顯示的章節屬性；載入修訂後再查看。</p>
    <template v-else>
      <div class="module-toolbar">
        <label>章節<select id="chapters-select" :value="chapter?.chapterId" :disabled="busy || !attributes.known" @change="switchChapter($event)"><option v-for="row in chapters" :key="row.chapterId" :value="row.chapterId">{{ row.name }}</option></select></label>
        <ElTag effect="plain">{{ chapter?.chapterId }}</ElTag>
        <ElTag v-if="chapter?.startDirty" type="warning" effect="plain">年代輸入未保存</ElTag>
      </div>
      <h3>章節定義：開始年代</h3>
      <p>紀年標籤是作者層標記，與年／月／日一起構成該章計時起點；切換紀年不會把既有年份取負或重編號。年 1～65535、月 1～12、日 1～31 只是輸入範圍。</p>
      <p v-if="chapter?.startMissing" class="module-notice">本章沒有已讀的開始日期物件；本頁不補預設日期。</p>
      <div class="module-toolbar">
        <label>紀年<select data-start-era :value="chapter?.start.era" :disabled="locked || chapter?.startMissing" @change="setEra($event)"><option v-for="[value, label] in eras" :key="value" :value="value">{{ label }}</option></select></label>
        <label>年<input data-start-year inputmode="numeric" maxlength="5" :value="chapter?.start.year" :disabled="locked || chapter?.startMissing" @input="setStart('year', $event)"></label>
        <label>月<input data-start-month inputmode="numeric" maxlength="2" :value="chapter?.start.month" :disabled="locked || chapter?.startMissing" @input="setStart('month', $event)"></label>
        <label>日<input data-start-day inputmode="numeric" maxlength="2" :value="chapter?.start.day" :disabled="locked || chapter?.startMissing" @input="setStart('day', $event)"></label>
        <ElButton data-start-save :disabled="locked || !chapter?.startDirty" @click="actions.saveChapterStart(chapter.chapterId)">保存開始年代</ElButton>
        <ElButton data-start-cancel :disabled="locked || !chapter?.startDirty" @click="actions.cancelStartInput(chapter.chapterId)">取消年代輸入</ElButton>
      </div>
      <h3>據點章節屬性</h3>
      <p>所屬勢力可設為中立；中立寫中立城主位。首都唯一且不要求該據點屬於此勢力（原版資料自有此情形）；取消首都只能改設另一據點。內政官（太守）只能選該據點所屬勢力的武將：任命同時把該武將身份寫成內政官，清空時一併清身份與舊預算。</p>
      <div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>勢力槽</th><th>君主</th><th>軍師</th><th>外交官</th><th>首都</th></tr></thead><tbody>
        <tr v-for="faction in factionRows" :key="faction.slot" :data-faction-slot="faction.slot">
          <td>勢力槽 {{ faction.slot }}</td>
          <td>{{ generalName(faction.monarchSlot) }}</td>
          <td>{{ generalName(faction.advisorSlot) }}</td>
          <td><select data-faction-diplomat :value="faction.diplomatSlot ?? ''" :disabled="locked" @change="setDiplomat(faction, $event)"><option value="">未配置（清空）</option><option v-for="general in faction.members" :key="general.slot" :value="general.slot">槽 {{ general.slot }}／{{ general.name }}{{ general.posts.length ? `（${general.posts.join('、')}）` : '' }}</option></select></td>
          <td>{{ faction.capital === null ? '未設定' : `${cityName(faction.capital)}（#${faction.capital}）` }}</td>
        </tr>
        <tr v-if="!factionRows.length"><td colspan="5">本章沒有已宣告的勢力。</td></tr>
      </tbody></table></div>
      <div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>據點</th><th>名稱</th><th>所屬勢力</th><th>首都</th><th>內政官</th></tr></thead><tbody>
        <tr v-for="city in chapter?.cities ?? []" :key="city.idx" :data-city-idx="city.idx">
          <td>#{{ city.idx }}</td>
          <td>{{ city.name }}</td>
          <td><select data-city-faction :value="city.faction ?? ''" :disabled="locked" @change="setCityFaction(city, $event)"><option value="">中立</option><option v-for="faction in factionRows" :key="faction.slot" :value="faction.slot">勢力槽 {{ faction.slot }}</option></select></td>
          <td>
            <ElTag v-if="city.faction !== null && factionRows.find(row => row.slot === city.faction)?.capital === city.idx" type="success" effect="plain">首都</ElTag>
            <ElButton v-else-if="city.faction !== null" data-city-capital :disabled="locked" @click="actions.setCapital(chapter.chapterId, city.faction, city.idx)">設為首都</ElButton>
            <span v-else>—</span>
          </td>
          <td>
            <select data-city-governor :value="city.governor ?? ''" :disabled="locked || city.faction === null" :title="city.faction === null ? '中立據點沒有內政官' : undefined" @change="setGovernor(city, $event)">
              <option value="">未配置（清空）</option>
              <option v-for="general in (factionRows.find(row => row.slot === city.faction)?.members ?? [])" :key="general.slot" :value="general.slot">槽 {{ general.slot }}／{{ general.name }}{{ general.posts.length ? `（${general.posts.join('、')}）` : '' }}</option>
            </select>
          </td>
        </tr>
        <tr v-if="!(chapter?.cities ?? []).length"><td colspan="5">本章沒有據點。</td></tr>
      </tbody></table></div>
      <h3>武將章節屬性</h3>
      <p>所屬勢力可設為自由；持有君主／軍師／外交官職務的武將須先清空職務才能改所屬。君主與軍師請用「遊戲管理」的章節角色工作流；外交官在上一表設定或清空。保留槽不參與任官。</p>
      <div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>槽</th><th>名</th><th>字</th><th>所屬勢力</th><th>身份與職務</th></tr></thead><tbody>
        <tr v-for="general in ordinaryGenerals" :key="general.slot" :data-general-slot="general.slot">
          <td>#{{ general.slot }}</td>
          <td>{{ general.name }}</td>
          <td>{{ general.hao || '—' }}</td>
          <td><select data-general-faction :value="general.factionSlot ?? ''" :disabled="locked || general.posts.length" :title="general.posts.length ? `已擔任${general.posts.join('、')}；請先清空職務` : undefined" @change="setGeneralFaction(general, $event)"><option value="">自由</option><option v-for="faction in factionRows" :key="faction.slot" :value="faction.slot">勢力槽 {{ faction.slot }}</option></select></td>
          <td>{{ general.posts.length ? general.posts.join('、') : '無職務' }}</td>
        </tr>
        <tr v-if="!ordinaryGenerals.length"><td colspan="5">本章沒有普通武將槽。</td></tr>
      </tbody></table></div>
      <p id="chapters-status" class="module-notice" role="status">{{ model.message }}</p>
    </template>
  </section>
</template>
