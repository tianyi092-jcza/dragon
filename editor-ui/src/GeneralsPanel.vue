<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import GeneralDefinitionsPanel from './GeneralDefinitionsPanel.vue';
import PortraitPreview from './PortraitPreview.vue';
import { computed, ref, watch } from 'vue';
const props = defineProps({model:Object,actions:Object,draftModel:Object,draftActions:Object,busy:Boolean});
function choose(event, action, field) { props.actions[action](event.target.value); event.target.value = props.model[field] ?? ''; }
const nativeReady = computed(() => !props.busy && !props.model.saveDisabled && !props.draftModel?.editLocked && props.draftModel?.context?.verified && props.model.selected === props.draftModel.context.gameId && props.model.draftRevision === props.draftModel.context.draftRevision);
function rename(general) {
  if (!nativeReady.value) return;
  const source = props.model, context = props.draftModel.context;
  const current = () => nativeReady.value && props.model === source && props.draftModel.context === context;
  const name = globalThis.prompt('名（取消不保存）：', general.name);
  if (name === null || !current()) return;
  const hao = globalThis.prompt('字（可空）：', general.hao ?? '');
  if (hao === null || !current()) return;
  props.draftActions.renameNativeGeneral({ gameId: source.selected, draftRevision: source.draftRevision, chapterId: source.chapterId, generalIdx: general.idx, values: { name, hao } });
}
const assignableFactions = computed(() => {
  if (!nativeReady.value || !props.draftModel.roles?.known || props.draftModel.roles.locked) return new Set();
  const chapter = props.draftModel.roles.chapters.find(row => row.chapterId === props.model.chapterId);
  return new Set((chapter?.factions ?? []).filter(faction => props.model.factions.some(row => row.idx === faction.slot && row.advisor === faction.advisorSlot)).map(faction => faction.slot));
});
function assignAdvisor(faction) {
  if (!assignableFactions.value.has(faction.idx)) return;
  const source = props.model, context = props.draftModel.context;
  const raw = globalThis.prompt('新軍師普通武將槽（0..126；任職資格由服務校驗；清空請使用獨立按鈕）：');
  if (raw === null || raw === '' || props.model !== source || props.draftModel.context !== context || !assignableFactions.value.has(faction.idx)) return;
  props.draftActions.assignStrategist(source.chapterId, faction.idx, raw.trim() === '' ? NaN : Number(raw));
}
const assignableMonarchs = computed(() => {
  if (!nativeReady.value || !props.draftModel.roles?.known || props.draftModel.roles.locked) return new Set();
  const chapter = props.draftModel.roles.chapters.find(row => row.chapterId === props.model.chapterId);
  return new Set((chapter?.factions ?? []).filter(faction => props.model.factions.some(row => row.idx === faction.slot && row.monarch === faction.monarchSlot)).map(faction => faction.slot));
});
function assignMonarch(faction) {
  if (!assignableMonarchs.value.has(faction.idx)) return;
  const source = props.model, context = props.draftModel.context;
  const raw = globalThis.prompt('新君主普通武將槽（0..126；須為無任職的自由武將，由服務校驗）：');
  if (raw === null || raw === '' || props.model !== source || props.draftModel.context !== context || !assignableMonarchs.value.has(faction.idx)) return;
  props.draftActions.assignMonarch(source.chapterId, faction.idx, raw.trim() === '' ? NaN : Number(raw));
}
function succeedMonarch(faction) {
  if (!assignableMonarchs.value.has(faction.idx)) return;
  const source = props.model, context = props.draftModel.context;
  const raw = globalThis.prompt('指定繼任普通武將槽（0..126；須為無任職的自由武將；解散請使用獨立按鈕）：');
  if (raw === null || raw === '' || props.model !== source || props.draftModel.context !== context || !assignableMonarchs.value.has(faction.idx)) return;
  props.draftActions.succeedMonarch(source.chapterId, faction.idx, raw.trim() === '' ? NaN : Number(raw));
}
const disbandableFactions = computed(() => new Set([...assignableMonarchs.value].filter(slot => assignableFactions.value.has(slot))));
const clearableAdvisors = computed(() => {
  if (!nativeReady.value || !props.draftModel.roles?.known || props.draftModel.roles.locked) return new Set();
  const chapter = props.draftModel.roles.chapters.find(row => row.chapterId === props.model.chapterId);
  return new Set((chapter?.factions ?? []).filter(faction =>
    chapter.generals.some(general => general.slot === faction.advisorSlot && !general.reserved) &&
    props.model.factions.some(row => row.idx === faction.slot && row.advisor === faction.advisorSlot)
  ).map(faction => faction.slot));
});
const generalFilter = ref('');
const filteredGenerals = computed(() => {
  const query = generalFilter.value.trim().toLowerCase();
  return props.model.generals.filter(general => !query || [String(general.idx), general.name, general.hao, general.sourceRecordId ?? ''].some(value => value.toLowerCase().includes(query)));
});
const portraitFilter = ref('');
const filteredPortraits = computed(() => {
  const query = portraitFilter.value.trim().toLowerCase();
  return props.model.library.filter(row => row.assetId.toLowerCase().includes(query));
});
const portraitById = computed(() => new Map(props.model.library.map(row => [row.assetId, row])));
const portraitSelected = computed(() => props.model.library.some(row => row.assetId === props.model.portraitId));
const portraitOutsideFilter = computed(() => portraitSelected.value && !filteredPortraits.value.some(row => row.assetId === props.model.portraitId));
watch(() => props.model.selected, () => { portraitFilter.value = ''; generalFilter.value = ''; });
function portrait(general) {
  if (!nativeReady.value || !general.portraitKey && !portraitSelected.value) return;
  const source = props.model;
  props.draftActions.portraitNativeGeneral({ gameId: source.selected, draftRevision: source.draftRevision, chapterId: source.chapterId, generalIdx: general.idx, portraitKey: general.portraitKey ? null : source.portraitId });
}
</script>
<template>
  <section id="generals-editor" class="module-card">
    <GeneralDefinitionsPanel v-if="draftModel && draftActions" :model="draftModel" :actions="draftActions" :busy="busy" />
    <h3>原章武將槽位（128 密排鎖定）</h3>
    <div v-if="draftModel && draftActions" class="module-toolbar">
      <label>共用明確修訂<input id="native-general-revision" :value="draftModel.fields.revision" :disabled="busy || draftModel.loadLocked" @input="draftActions.setField('revision', $event.target.value)"></label>
      <ElButton id="native-general-load" :disabled="busy || draftModel.loadLocked || !draftModel.fields.gameId" @click="draftActions.load()">載入此修訂</ElButton>
      <ElButton id="native-general-query" :disabled="busy || draftModel.queryLocked" @click="draftActions.query()">查詢原保存操作</ElButton>
      <ElButton id="native-general-retry" :disabled="busy || draftModel.retryLocked" @click="draftActions.retry()">以原鍵重試原內容</ElButton>
    </div>
    <p id="native-general-message" role="status">{{ draftModel?.message }}</p>
    <p>改名／字與頭像使用共用草稿操作記錄。先載入明確修訂，再讀取下方同修訂武將表；兩者不符時不可改名或變更頭像。確認保存後不自動讀取，須明確載入收據修訂並重新讀表。其它未保存表單不會隨此操作保存。君主／軍師任命與「清空草稿軍師引用」也使用共用記錄，不刪武將或補原生計數；指定繼任者免君主與直接解散亦使用共用記錄。解散只作用於本章，成員轉自由、據點轉中立，仍須明確確認。</p>
    <p>原章槽位增刪鎖定 128 密排；改名／字與頭像綁定經草稿保存寫入。頭像取自共用庫（唯讀；武將一對一），不開放上傳或刪除。</p>
    <div class="module-toolbar">
      <ElButton id="generals-refresh" :disabled="busy || model.locked" @click="actions.refresh()">讀取遊戲清單</ElButton>
      <label>遊戲<select id="generals-games" :value="model.selected ?? ''" :disabled="busy || model.locked" @change="choose($event,'selectGame','selected')"><option v-if="model.selected && !model.games.some(g => g.gameId === model.selected)" :value="model.selected" disabled>目前遊戲：{{ model.selected }}（本面板未列出，請讀取清單）</option><option v-for="g in model.games" :key="g.gameId" :value="g.gameId">{{ g.label }}</option></select></label>
      <ElButton id="generals-inspect" :disabled="busy || model.locked || !model.selected" @click="actions.inspect()">讀取武將表</ElButton>
      <label>章節<select id="generals-chapter" :value="model.chapterId ?? ''" :disabled="busy || model.locked" @change="choose($event,'selectChapter','chapterId')"><option v-for="c in model.chapters" :key="c.chapterId" :value="c.chapterId">{{ c.name }}</option></select></label>
    </div>
    <p id="generals-context">{{ model.context }}</p><p id="generals-message" role="status">{{ model.message }}</p>
    <p>來源記錄ID只識別已保存的匯入記錄，不是跨章人物身份；同槽不合併。未提供來源綁定時不推測，G127仍是保留槽。</p>
    <h3>頭像資源庫（共用，唯讀）</h3>
    <div class="module-toolbar">
      <ElButton id="portrait-list" :disabled="busy || model.locked || !model.selected" @click="actions.listPortraits()">讀取資源庫</ElButton>
      <label>篩選頭像ID<input id="portrait-filter" v-model="portraitFilter" type="search" maxlength="32" :disabled="busy || model.locked || !model.library.length"></label>
      <ElButton id="portrait-filter-clear" :disabled="busy || model.locked || !portraitFilter" @click="portraitFilter = ''">清除篩選</ElButton>
      <label>選擇頭像<select id="portrait-pick" :value="model.portraitId ?? ''" :disabled="busy || model.locked || !filteredPortraits.length" @change="choose($event,'selectPortrait','portraitId')"><option v-if="portraitOutsideFilter" :value="model.portraitId" disabled>已選：{{ model.portraitId }}（篩選外）</option><option v-for="p in filteredPortraits" :key="p.assetId" :value="p.assetId">{{ p.assetId }}</option></select></label>
    </div>
    <p id="portrait-filter-status" role="status">符合 {{ filteredPortraits.length }}／{{ model.library.length }} 項；已選：{{ portraitSelected ? model.portraitId : '無' }}。篩選不分大小寫，只改顯示，不改已選頭像、不讀取或保存。</p>
    <details><summary>資源清單（{{ filteredPortraits.length }}／{{ model.library.length }}）</summary><div id="portrait-library"><p v-for="p in filteredPortraits" :key="p.assetId">{{ p.assetId }}／{{ p.mime }}／{{ p.byteLength }}B／{{ p.inUse ? '作者引用中' : '未見作者引用' }}</p></div></details>
    <PortraitPreview id="native-portrait-preview" :game-id="model.selected" :portrait="model.library.find(row => row.assetId === model.portraitId)" :disabled="busy || model.locked" />
    <div id="generals-chapters">
      <h3>勢力</h3><div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>槽</th><th>君主</th><th>軍師</th><th>首都槽</th><th>操作</th></tr></thead><tbody>
        <tr v-for="f in model.factions" :key="model.chapterId + ':' + f.idx" :data-faction-idx="f.idx"><td>{{ f.idx }}</td><td>#{{ f.monarch }}</td><td>{{ f.advisor ?? '無' }}</td><td>{{ f.capital }}</td><td>
          <ElButton data-native-monarch-assign :disabled="!assignableMonarchs.has(f.idx)" @click="assignMonarch(f)">立草稿君主（須自由武將）</ElButton>
          <ElButton data-native-advisor-assign :disabled="!assignableFactions.has(f.idx)" @click="assignAdvisor(f)">設草稿軍師</ElButton>
          <ElButton data-native-advisor-clear :disabled="!clearableAdvisors.has(f.idx)" @click="clearableAdvisors.has(f.idx) && draftActions.clearStrategist(model.chapterId,f.idx)">清空草稿軍師引用</ElButton>
          <ElButton data-native-monarch-succeed :disabled="!assignableMonarchs.has(f.idx)" @click="succeedMonarch(f)">指定繼任者免君主</ElButton>
          <ElButton data-native-faction-disband :disabled="!disbandableFactions.has(f.idx)" @click="disbandableFactions.has(f.idx) && draftActions.disbandFaction(model.chapterId,f.idx)">解散草稿勢力</ElButton>
        </td></tr></tbody></table></div>
      <p>行內預覽使用已讀章修訂的頭像綁定；未綁定時只按明確提供的原圖ID查共享庫。請先讀取資源庫，再展開該行並明確預覽；原圖未知、缺少共享引用或摘要時不補圖。選擇器的未保存選項不會改變行內預覽。</p>
    <h3>武將</h3>
    <div class="module-toolbar">
      <label>查找槽號／名／字／來源ID<input id="general-filter" v-model="generalFilter" type="search" maxlength="1024" :disabled="busy || model.saveDisabled"></label>
      <ElButton id="general-filter-clear" :disabled="busy || model.saveDisabled || !generalFilter" @click="generalFilter = ''">清除武將篩選</ElButton>
    </div>
    <p id="general-filter-status" role="status">符合 {{ filteredGenerals.length }}／{{ model.generals.length }} 項。只篩選目前已讀章，不改槽號、任官資格或保存目標；切章保留查找文字，換遊戲清除。</p>
    <p v-if="model.generals.length && !filteredGenerals.length" id="general-filter-empty">目前已讀章沒有符合的武將；可清除篩選檢視全部。</p>
    <div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>槽</th><th>名</th><th>字</th><th>來源記錄ID（唯讀）</th><th>頭像</th><th>能力（唯讀）</th><th>操作</th></tr></thead><tbody>
        <tr v-for="g in filteredGenerals" :key="model.chapterId + ':' + g.idx" :data-general-idx="g.idx"><td>{{ g.idx }}</td><td>{{ g.name }}</td><td>{{ g.hao || '無' }}</td><td>{{ g.idx === 127 ? 'G127保留槽（非一般人物）' : g.sourceRecordId ?? '未提供來源綁定' }}</td><td><span data-native-general-portrait-id>{{ g.portraitKey ?? (g.originalPortraitId === null ? '原圖ID未知' : `原圖 #${g.originalPortraitId}`) }}</span>
          <details data-native-general-preview><summary>檢視已讀頭像</summary><PortraitPreview :key="model.draftRevision" :game-id="model.selected" :portrait="portraitById.get(g.portraitKey ?? g.originalPortraitId)" :disabled="busy || model.saveDisabled" /></details>
        </td><td>
          <details data-native-general-ability><summary>檢視已讀能力（唯讀）</summary>
            <p>僅顯示本表已讀修訂；不開放能力修改，不代表任意高值或初始化已通過執行驗證。</p>
            <p v-if="g.ability === null" data-native-ability-unknown>未提供能力數值，不補零。</p>
            <dl v-else data-native-ability-values><dt>武術／統率／政治</dt><dd>{{ g.ability.force }}／{{ g.ability.lead }}／{{ g.ability.politics }}</dd><dt>攻城／野戰／水戰（原高四位）</dt><dd>{{ g.ability.siege }}／{{ g.ability.field }}／{{ g.ability.naval }}</dd></dl>
            <p data-native-specialty-low>專長低四位（攻城／野戰／水戰）：{{ g.specialtyLowBits === null ? '未提供；未知不等於000' : g.specialtyLowBits }}。不由高位推回原字節。</p>
          </details>
        </td><td>
          <ElButton data-native-general-rename :disabled="!nativeReady" @click="rename(g)">改名／字</ElButton>
          <ElButton data-native-general-portrait :disabled="!nativeReady || !g.portraitKey && !portraitSelected" @click="portrait(g)">{{ g.portraitKey ? '清除頭像綁定' : '綁定頭像' }}</ElButton>
          <ElButton :disabled="busy || model.saveDisabled" @click="actions.blockers(model.chapterId,g.idx)">刪除檢查</ElButton>
        </td></tr></tbody></table></div>
    </div>
  </section>
</template>
