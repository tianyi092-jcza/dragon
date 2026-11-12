<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { computed, ref, watch } from 'vue';
import PortraitPreview from './PortraitPreview.vue';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const portraitFilter = ref('');
const importFilter = ref('');
const filteredImportRows = computed(() => {
  const query = importFilter.value.trim().toLowerCase();
  const rows = props.model.importSource?.rows ?? [];
  return rows.filter(row => !query || [row.chapterName, row.chapterId, String(row.slot), row.name, row.hao].some(value => value.toLowerCase().includes(query)));
});
const selectedReferences = computed(() => {
  const generalId = props.model.definitions?.form.generalId;
  if (!generalId || !props.model.people?.supported) return [];
  return props.model.people.chapters.flatMap(chapter => chapter.people.filter(person => person.generalId === generalId).map(person => ({
    chapterId: chapter.chapterId,
    name: props.model.chapters.find(row => row.chapterId === chapter.chapterId).name,
    included: person.included,
    inheritedFields: person.inheritedFields,
    overriddenFields: person.overriddenFields,
  })));
});
const filteredPortraits = computed(() => {
  const query = portraitFilter.value.trim().toLowerCase();
  return (props.model.definitions?.library ?? []).filter(row => row.assetId.toLowerCase().includes(query));
});
watch(() => props.model.fields.gameId, () => { portraitFilter.value = ''; importFilter.value = ''; });
function chooseChapterPortrait(choice, chapterId, generalId) {
  return props.actions.person('portrait', chapterId, generalId, undefined, choice);
}
</script>
<template>
  <section v-if="model.definitions" id="general-definitions">
    <h3>本遊戲武將庫（默認空）</h3>
    <p>武將庫是遊戲級基礎資料，默認空；章節只引用它，不複製。目前開放姓名、字及共用頭像（能力仍屬章節原生欄位，只讀）。ID由服務產生，不是原章槽位、來源記錄ID或跨章同名人物的合併依據。下方可建立章節人物配置，但不建立原生武將，也不代表可發布。</p>
    <p>使用「遊戲資料」同一份明確載入的草稿與保存操作追蹤。人物保存只使用已保存的遊戲名稱／簡介，不會保存另一表尚未提交的資料或資源。</p>
    <div class="module-toolbar">
      <ElButton id="definition-refresh" :disabled="busy || model.locked" @click="actions.refresh()">更新遊戲清單</ElButton>
      <label>明確草稿修訂<ElInput id="definition-revision" :model-value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision',$event)" /></label>
      <ElButton id="definition-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂的人物定義</ElButton>
      <ElButton id="definition-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="definition-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試相同原鍵／內容</ElButton>
    </div>
    <p id="definition-context">遊戲：{{ model.fields.gameId || '尚未選擇' }}／已載入修訂：{{ model.context?.draftRevision ?? '未載入' }}<strong v-if="model.context && !model.context.verified">／須重新明確載入</strong></p>
    <p id="definition-status" role="status">{{ model.message }}</p>
    <p v-if="!model.definitions.supported" id="definition-unavailable">此修訂沒有遊戲自有武將庫（例如舊槽位字典或未載入），不把未知當成空庫；完整原章副本仍使用下方槽位資料，不自動轉成武將庫條目。</p>
    <template v-else>
      <section v-if="model.importSource?.supported" id="general-import">
        <h4>從底層資源導入</h4>
        <p>來源是本遊戲固定源武將記錄（每章 127 個非保留槽），逐條導入；不做跨章人物身份合併，也不推測缺失原圖。一次最多 {{ model.importSource.limit }} 名，導入後可在下方「章節人物配置」引用。</p>
        <div class="module-toolbar">
          <label>查找章節／槽／名／字<ElInput id="import-filter" v-model="importFilter" type="search" maxlength="1024" :disabled="busy || model.importSource.locked" /></label>
          <ElButton id="import-filter-clear" :disabled="busy || model.importSource.locked || !importFilter" @click="importFilter = ''">清除查找</ElButton>
          <ElButton id="import-clear" :disabled="busy || model.importSource.locked || !model.importSource.selectedCount" @click="actions.clearImportSelection()">清除選擇</ElButton>
          <ElButton id="import-run" :disabled="busy || model.importSource.locked || !model.importSource.selectedCount" @click="actions.importGenerals()">導入已選（{{ model.importSource.selectedCount }}／{{ model.importSource.limit }}）</ElButton>
        </div>
        <p id="import-status" role="status">符合 {{ filteredImportRows.length }}／{{ model.importSource.rows.length }} 條；已選 {{ model.importSource.selectedCount }}。已導入標記按姓名／字／頭像比對，僅供對照，不阻止重複導入。</p>
        <ElTable id="import-table" :data="filteredImportRows" row-key="key"><ElTableColumn v-for="[key, title] in [['selected','選'],['chapterName','章節'],['slot','槽'],['name','名'],['hao','字'],['portrait','頭像'],['imported','狀態']]" :key="key" :label="title" min-width="120"><template #default="{ row }"><div :data-import-key="row.key"><ElCheckbox v-if="key === 'selected'" :data-import-toggle="row.key" :model-value="row.selected" :disabled="busy || model.importSource.locked" @change="actions.toggleImport(row.key, $event)" /><template v-else-if="key === 'hao'">{{ row.hao || '無' }}</template><template v-else-if="key === 'portrait'">{{ row.portraitRef ? row.portraitRef.assetId : row.portraitKey ?? row.portrait ?? '無' }}</template><template v-else-if="key === 'imported'">{{ row.imported ? '庫中已有同名同字' : '未導入' }}</template><template v-else>{{ row[key] }}</template></div></template></ElTableColumn></ElTable>
      </section>
      <div class="module-toolbar"><ElButton id="definition-new" :disabled="busy || model.definitions.locked" @click="actions.selectDefinition(null)">清空本表／準備新增</ElButton></div>
      <div class="module-toolbar">
        <label>共用頭像ID篩選<ElInput id="definition-portrait-filter" v-model="portraitFilter" type="search" maxlength="32" :disabled="busy || model.definitions.locked || !model.definitions.library.length" /></label>
        <ElButton id="definition-portrait-filter-clear" :disabled="busy || model.definitions.locked || !portraitFilter" @click="portraitFilter = ''">清除篩選</ElButton>
      </div>
      <p id="definition-portrait-filter-status" role="status">符合 {{ filteredPortraits.length }}／{{ model.definitions.library.length }} 項。基表與章節共用此ID篩選，不分大小寫；不改已選引用、不讀取或保存。</p>
      <form id="definition-form" @submit.prevent="actions.saveDefinition()">
        <p id="definition-selected">{{ model.definitions.form.generalId ?? '新增模式：保存後由服務分配ID' }}</p>
        <label>姓名<ElInput id="definition-name" :model-value="model.definitions.form.name" :disabled="busy || model.definitions.locked" @input="actions.setDefinitionField('name',$event)" /></label>
        <label>字（可空）<ElInput id="definition-hao" :model-value="model.definitions.form.hao" :disabled="busy || model.definitions.locked" @input="actions.setDefinitionField('hao',$event)" /></label>
        <div class="module-toolbar">
          <ElButton id="definition-portraits" :disabled="busy || model.definitions.locked" @click="actions.definitionPortraits()">讀取共用頭像清單</ElButton>
          <label>頭像<ElSelect id="definition-portrait" :model-value="model.definitions.form.portraitRef?.assetId ?? ''" :disabled="busy || model.definitions.locked" @change="actions.chooseDefinitionPortrait($event)">
            <ElOption value="" label="未指定" />
            <ElOption v-if="model.definitions.form.portraitRef && !filteredPortraits.some(row => row.assetId === model.definitions.form.portraitRef.assetId)" :value="model.definitions.form.portraitRef.assetId" disabled :label="model.definitions.form.portraitRef.assetId + '（目前引用／篩選外）'" />
            <ElOption v-for="row in filteredPortraits" :key="row.assetId" :value="row.assetId" :label="row.assetId" />
          </ElSelect></label>
          <ElButton id="definition-save" native-type="submit" :disabled="busy || model.definitions.locked">{{ model.definitions.form.generalId ? '保存人物修改' : '新增人物' }}</ElButton>
          <ElButton id="definition-delete" :disabled="busy || model.definitions.locked || !model.definitions.form.generalId" @click="actions.deleteDefinition()">刪除此無章節引用的定義</ElButton>
        </div>
        <p v-if="model.definitions.dirty">此武將庫表有未保存輸入。保存回應不明時先查原鍵；確認保存後仍須載入回應修訂，不自動改讀最新修訂。</p>
      </form>
      <section v-if="model.definitions.form.generalId" id="definition-references">
        <h4>所選武將的已讀章節引用</h4>
        <p>僅顯示目前明確載入修訂的章節人物配置；未加入仍是引用。不受目前章節選擇影響，也不是原生任職／事件引用或刪除許可。</p>
        <p v-if="!model.people?.supported" id="definition-references-unknown">此修訂未提供完整章節人物投影，引用未知；不視為無引用。</p>
        <template v-else>
          <p id="definition-references-count">共 {{ selectedReferences.length }} 章引用。刪除前須逐章明確移除配置；服務仍會重新校驗。</p>
          <ElTable v-if="selectedReferences.length" :data="selectedReferences" row-key="chapterId"><ElTableColumn label="章節／ID" min-width="220"><template #default="{ row }"><span :data-definition-reference="row.chapterId">{{ row.name }}／{{ row.chapterId }}</span></template></ElTableColumn><ElTableColumn label="加入狀態" min-width="200"><template #default="{ row }">{{ row.included ? '加入' : '未加入（保留配置）' }}</template></ElTableColumn><ElTableColumn label="繼承欄位" min-width="160"><template #default="{ row }">{{ row.inheritedFields.join('、') || '無' }}</template></ElTableColumn><ElTableColumn label="覆蓋欄位" min-width="160"><template #default="{ row }">{{ row.overriddenFields.join('、') || '無' }}</template></ElTableColumn></ElTable>
        </template>
      </section>
      <PortraitPreview id="definition-portrait-preview" :game-id="model.fields.gameId" :portrait="model.definitions.form.portraitRef" :disabled="busy || model.definitions.locked" />
      <ElTable id="definition-table" :data="model.definitions.rows" row-key="generalId"><ElTableColumn label="人物ID" min-width="180"><template #default="{ row }"><span :data-definition-id="row.generalId">{{ row.generalId }}</span></template></ElTableColumn><ElTableColumn prop="name" label="姓名" min-width="120" /><ElTableColumn label="字" min-width="120"><template #default="{ row }">{{ row.hao || '無' }}</template></ElTableColumn><ElTableColumn label="頭像ID／SHA（唯讀）" min-width="300"><template #default="{ row }">{{ row.portraitRef ? row.portraitRef.assetId + '／' + row.portraitRef.sha256 : '未指定' }}</template></ElTableColumn><ElTableColumn label="操作" min-width="160"><template #default="{ row }"><ElButton :disabled="busy || model.definitions.locked" @click="actions.selectDefinition(row.generalId)">編輯此定義</ElButton></template></ElTableColumn></ElTable>
      <section id="chapter-people">
        <h4>章節人物配置</h4>
        <p>加入狀態不是死亡／出場時間，也不建立勢力或原生槽位。未加入配置仍保留繼承／覆蓋與刪除引用。切換狀態保留覆蓋；可設定本章姓名／字覆蓋或逐欄恢復繼承。字的空白覆蓋、頭像的明確清空都不等於恢復繼承。頭像只可從已讀取的共用清單選擇；不修改基表。</p>
        <p v-if="!model.people?.supported">此修訂未提供完整章節人物投影，不能編輯；不將未知當成空清單。</p>
        <template v-else>
          <ElButton id="people-portraits" :disabled="busy || model.people.locked" @click="actions.definitionPortraits()">讀取本章可選共用頭像</ElButton>
          <label>共用頭像ID篩選<ElInput id="people-portrait-filter" v-model="portraitFilter" type="search" maxlength="32" :disabled="busy || model.people.locked || !model.definitions.library.length" /></label>
          <ElButton id="people-portrait-filter-clear" :disabled="busy || model.people.locked || !portraitFilter" @click="portraitFilter = ''">清除篩選</ElButton>
          <label>目前章節<ElSelect id="people-chapter" :model-value="model.fields.chapterId" :disabled="busy || model.people.locked" @change="actions.setField('chapterId',$event)"><ElOption v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId" :label="chapter.name + '／' + chapter.chapterId" /></ElSelect></label>
          <div id="people-library"><ElTable :data="model.definitions.rows" row-key="generalId"><ElTableColumn label="基礎人物／ID" min-width="220"><template #default="{ row }"><span :data-person-id="row.generalId">{{ row.name }}／{{ row.generalId }}</span></template></ElTableColumn><ElTableColumn label="明確設定" min-width="320"><template #default="{ row }"><ElButton :disabled="busy || model.people.locked || !model.fields.chapterId" @click="actions.person('set',model.fields.chapterId,row.generalId,true)">加入此章</ElButton><ElButton :disabled="busy || model.people.locked || !model.fields.chapterId" @click="actions.person('set',model.fields.chapterId,row.generalId,false)">保留未加入配置</ElButton></template></ElTableColumn></ElTable></div>
          <ElTable id="people-table" :data="model.people.chapters.find(chapter => chapter.chapterId === model.fields.chapterId)?.people ?? []" row-key="generalId">
            <ElTableColumn label="人物ID" min-width="180"><template #default="{ row }"><span :data-person-id="row.generalId">{{ row.generalId }}</span></template></ElTableColumn>
            <ElTableColumn label="加入狀態" min-width="200"><template #default="{ row }">{{ row.included ? '加入' : '未加入（保留配置）' }}</template></ElTableColumn>
            <ElTableColumn label="目前有效值" min-width="240"><template #default="{ row }">{{ row.values.name }}／{{ row.values.hao || '無字' }}／頭像 {{ row.values.portraitRef?.assetId ?? '未指定' }}<PortraitPreview :key="model.fields.chapterId" data-person-portrait-preview :game-id="model.fields.gameId" :portrait="row.values.portraitRef" :disabled="busy || model.people.locked" /></template></ElTableColumn>
            <ElTableColumn label="繼承／覆蓋（唯讀）" min-width="220"><template #default="{ row }">繼承：{{ row.inheritedFields.join('、') || '無' }}；覆蓋：{{ row.overriddenFields.join('、') || '無' }}</template></ElTableColumn>
            <ElTableColumn label="操作" min-width="480"><template #default="{ row }"><label>設定本章頭像<ElSelect data-portrait-choice :model-value="''" :disabled="busy || model.people.locked || !filteredPortraits.length" @change="chooseChapterPortrait($event,model.fields.chapterId,row.generalId)"><ElOption value="" disabled label="選擇後確認保存" /><ElOption v-for="portrait in filteredPortraits" :key="portrait.assetId" :value="portrait.assetId" :label="portrait.assetId" /></ElSelect></label><div class="account-row-actions"><ElButton data-portrait-clear :disabled="busy || model.people.locked" @click="actions.person('portrait',model.fields.chapterId,row.generalId,undefined,null)">明確清空本章頭像</ElButton><ElButton v-for="field in ['name','hao']" :key="'override-'+field" :data-override-field="field" :disabled="busy || model.people.locked" @click="actions.person('override',model.fields.chapterId,row.generalId,undefined,field)">設定本章{{ field === 'name' ? '姓名' : '字' }}</ElButton><ElButton v-for="field in row.overriddenFields" :key="field" :data-inherit-field="field" :disabled="busy || model.people.locked" @click="actions.person('inherit',model.fields.chapterId,row.generalId,undefined,field)">恢復繼承：{{ { name:'姓名', hao:'字', portraitRef:'頭像' }[field] }}</ElButton><ElButton :disabled="busy || model.people.locked" @click="actions.person('remove',model.fields.chapterId,row.generalId)">移除此章配置</ElButton></div></template></ElTableColumn>
          </ElTable>
        </template>
      </section>
    </template>
  </section>
</template>
