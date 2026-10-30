<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { computed, ref, watch } from 'vue';
import PortraitPreview from './PortraitPreview.vue';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const portraitFilter = ref('');
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
watch(() => props.model.fields.gameId, () => { portraitFilter.value = ''; });
function chooseChapterPortrait(event, chapterId, generalId) {
  const choice = event.currentTarget.value;
  // This is a command picker, not an unsaved form. Cancellation must not leave
  // the DOM displaying a choice that has never been saved.
  event.currentTarget.value = '';
  return props.actions.person('portrait', chapterId, generalId, undefined, choice);
}
</script>
<template>
  <section v-if="model.definitions" id="general-definitions">
    <h3>全遊戲人物基礎定義與章節配置</h3>
    <p>目前只開放中立模板的姓名、字及共用頭像。ID由服務產生，不是原章槽位、來源記錄ID或跨章同名人物的合併依據。下方可建立章節配置，但不建立原生武將，也不代表可試運行。</p>
    <p>使用「遊戲資料」同一份明確載入的草稿與保存操作追蹤。人物保存只使用已保存的遊戲名稱／簡介，不會保存另一表尚未提交的資料或資源。</p>
    <div class="module-toolbar">
      <ElButton id="definition-refresh" :disabled="busy || model.locked" @click="actions.refresh()">更新遊戲清單</ElButton>
      <label>明確草稿修訂<input id="definition-revision" :value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision',$event.target.value)"></label>
      <ElButton id="definition-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂的人物定義</ElButton>
      <ElButton id="definition-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="definition-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試相同原鍵／內容</ElButton>
    </div>
    <p id="definition-context">遊戲：{{ model.fields.gameId || '尚未選擇' }}／已載入修訂：{{ model.context?.draftRevision ?? '未載入' }}<strong v-if="model.context && !model.context.verified">／須重新明確載入</strong></p>
    <p id="definition-status" role="status">{{ model.message }}</p>
    <p v-if="!model.definitions.supported" id="definition-unavailable">尚未載入支援的中立模板人物庫；完整原章副本仍使用下方槽位資料，不自動轉成人物基礎定義。</p>
    <template v-else>
      <div class="module-toolbar"><ElButton id="definition-new" :disabled="busy || model.definitions.locked" @click="actions.selectDefinition(null)">清空本表／準備新增</ElButton></div>
      <div class="module-toolbar">
        <label>共用頭像ID篩選<input id="definition-portrait-filter" v-model="portraitFilter" type="search" maxlength="32" :disabled="busy || model.definitions.locked || !model.definitions.library.length"></label>
        <ElButton id="definition-portrait-filter-clear" :disabled="busy || model.definitions.locked || !portraitFilter" @click="portraitFilter = ''">清除篩選</ElButton>
      </div>
      <p id="definition-portrait-filter-status" role="status">符合 {{ filteredPortraits.length }}／{{ model.definitions.library.length }} 項。基表與章節共用此ID篩選，不分大小寫；不改已選引用、不讀取或保存。</p>
      <form id="definition-form" @submit.prevent="actions.saveDefinition()">
        <p id="definition-selected">{{ model.definitions.form.generalId ?? '新增模式：保存後由服務分配ID' }}</p>
        <label>姓名<input id="definition-name" :value="model.definitions.form.name" :disabled="busy || model.definitions.locked" @input="actions.setDefinitionField('name',$event.target.value)"></label>
        <label>字（可空）<input id="definition-hao" :value="model.definitions.form.hao" :disabled="busy || model.definitions.locked" @input="actions.setDefinitionField('hao',$event.target.value)"></label>
        <div class="module-toolbar">
          <ElButton id="definition-portraits" :disabled="busy || model.definitions.locked" @click="actions.definitionPortraits()">讀取共用頭像清單</ElButton>
          <label>頭像<select id="definition-portrait" :value="model.definitions.form.portraitRef?.assetId ?? ''" :disabled="busy || model.definitions.locked" @change="actions.chooseDefinitionPortrait($event.target.value)">
            <option value="">未指定</option>
            <option v-if="model.definitions.form.portraitRef && !filteredPortraits.some(row => row.assetId === model.definitions.form.portraitRef.assetId)" :value="model.definitions.form.portraitRef.assetId" disabled>{{ model.definitions.form.portraitRef.assetId }}（目前引用／篩選外）</option>
            <option v-for="row in filteredPortraits" :key="row.assetId" :value="row.assetId">{{ row.assetId }}</option>
          </select></label>
          <ElButton id="definition-save" native-type="submit" :disabled="busy || model.definitions.locked">{{ model.definitions.form.generalId ? '保存人物修改' : '新增人物' }}</ElButton>
          <ElButton id="definition-delete" :disabled="busy || model.definitions.locked || !model.definitions.form.generalId" @click="actions.deleteDefinition()">刪除此無章節引用的定義</ElButton>
        </div>
        <p v-if="model.definitions.dirty">此人物表有未保存輸入。保存回應不明時先查原鍵；確認保存後仍須載入回應修訂，不自動改讀最新修訂。</p>
      </form>
      <section v-if="model.definitions.form.generalId" id="definition-references">
        <h4>所選人物的已讀章節引用</h4>
        <p>僅顯示目前明確載入修訂的中立人物配置；未加入仍是引用。不受目前章節選擇影響，也不是原生任職／事件引用或刪除許可。</p>
        <p v-if="!model.people?.supported" id="definition-references-unknown">此修訂未提供完整章節人物投影，引用未知；不視為無引用。</p>
        <template v-else>
          <p id="definition-references-count">共 {{ selectedReferences.length }} 章引用。刪除前須逐章明確移除配置；服務仍會重新校驗。</p>
          <div v-if="selectedReferences.length" class="entity-table-wrap"><table class="entity-table"><thead><tr><th>章節／ID</th><th>加入狀態</th><th>繼承欄位</th><th>覆蓋欄位</th></tr></thead><tbody>
            <tr v-for="row in selectedReferences" :key="row.chapterId" :data-definition-reference="row.chapterId"><td>{{ row.name }}／{{ row.chapterId }}</td><td>{{ row.included ? '加入' : '未加入（保留配置）' }}</td><td>{{ row.inheritedFields.join('、') || '無' }}</td><td>{{ row.overriddenFields.join('、') || '無' }}</td></tr>
          </tbody></table></div>
        </template>
      </section>
      <PortraitPreview id="definition-portrait-preview" :game-id="model.fields.gameId" :portrait="model.definitions.form.portraitRef" :disabled="busy || model.definitions.locked" />
      <div class="entity-table-wrap"><table id="definition-table" class="entity-table"><thead><tr><th>人物ID</th><th>姓名</th><th>字</th><th>頭像ID／SHA（唯讀）</th><th>操作</th></tr></thead><tbody>
        <tr v-for="row in model.definitions.rows" :key="row.generalId" :data-definition-id="row.generalId"><td>{{ row.generalId }}</td><td>{{ row.name }}</td><td>{{ row.hao || '無' }}</td><td>{{ row.portraitRef ? row.portraitRef.assetId + '／' + row.portraitRef.sha256 : '未指定' }}</td><td><ElButton :disabled="busy || model.definitions.locked" @click="actions.selectDefinition(row.generalId)">編輯此定義</ElButton></td></tr>
      </tbody></table></div>
      <section id="chapter-people">
        <h4>章節人物配置</h4>
        <p>加入狀態不是死亡／出場時間，也不建立勢力或原生槽位。未加入配置仍保留繼承／覆蓋與刪除引用。切換狀態保留覆蓋；可設定本章姓名／字覆蓋或逐欄恢復繼承。字的空白覆蓋、頭像的明確清空都不等於恢復繼承。頭像只可從已讀取的共用清單選擇；不修改基表。</p>
        <p v-if="!model.people?.supported">此修訂未提供完整章節人物投影，不能編輯；不將未知當成空清單。</p>
        <template v-else>
          <ElButton id="people-portraits" :disabled="busy || model.people.locked" @click="actions.definitionPortraits()">讀取本章可選共用頭像</ElButton>
          <label>共用頭像ID篩選<input id="people-portrait-filter" v-model="portraitFilter" type="search" maxlength="32" :disabled="busy || model.people.locked || !model.definitions.library.length"></label>
          <ElButton id="people-portrait-filter-clear" :disabled="busy || model.people.locked || !portraitFilter" @click="portraitFilter = ''">清除篩選</ElButton>
          <label>目前章節<select id="people-chapter" :value="model.fields.chapterId" :disabled="busy || model.people.locked" @change="actions.setField('chapterId',$event.target.value)"><option v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }}／{{ chapter.chapterId }}</option></select></label>
          <div id="people-library" class="entity-table-wrap"><table class="entity-table"><thead><tr><th>基礎人物／ID</th><th>明確設定</th></tr></thead><tbody>
            <tr v-for="row in model.definitions.rows" :key="row.generalId" :data-person-id="row.generalId"><td>{{ row.name }}／{{ row.generalId }}</td><td>
              <ElButton :disabled="busy || model.people.locked || !model.fields.chapterId" @click="actions.person('set',model.fields.chapterId,row.generalId,true)">加入此章</ElButton>
              <ElButton :disabled="busy || model.people.locked || !model.fields.chapterId" @click="actions.person('set',model.fields.chapterId,row.generalId,false)">保留未加入配置</ElButton>
            </td></tr>
          </tbody></table></div>
          <div class="entity-table-wrap"><table id="people-table" class="entity-table"><thead><tr><th>人物ID</th><th>加入狀態</th><th>目前有效值</th><th>繼承／覆蓋（唯讀）</th><th>操作</th></tr></thead><tbody>
            <tr v-for="row in model.people.chapters.find(chapter => chapter.chapterId === model.fields.chapterId)?.people ?? []" :key="row.generalId" :data-person-id="row.generalId"><td>{{ row.generalId }}</td><td>{{ row.included ? '加入' : '未加入（保留配置）' }}</td><td>{{ row.values.name }}／{{ row.values.hao || '無字' }}／頭像 {{ row.values.portraitRef?.assetId ?? '未指定' }}<PortraitPreview :key="model.fields.chapterId" data-person-portrait-preview :game-id="model.fields.gameId" :portrait="row.values.portraitRef" :disabled="busy || model.people.locked" /></td><td>繼承：{{ row.inheritedFields.join('、') || '無' }}；覆蓋：{{ row.overriddenFields.join('、') || '無' }}</td><td><label>設定本章頭像<select data-portrait-choice :disabled="busy || model.people.locked || !filteredPortraits.length" @change="chooseChapterPortrait($event,model.fields.chapterId,row.generalId)"><option value="" disabled selected>選擇後確認保存</option><option v-for="portrait in filteredPortraits" :key="portrait.assetId" :value="portrait.assetId">{{ portrait.assetId }}</option></select></label><ElButton data-portrait-clear :disabled="busy || model.people.locked" @click="actions.person('portrait',model.fields.chapterId,row.generalId,undefined,null)">明確清空本章頭像</ElButton><ElButton v-for="field in ['name','hao']" :key="'override-'+field" :data-override-field="field" :disabled="busy || model.people.locked" @click="actions.person('override',model.fields.chapterId,row.generalId,undefined,field)">設定本章{{ field === 'name' ? '姓名' : '字' }}</ElButton><ElButton v-for="field in row.overriddenFields" :key="field" :data-inherit-field="field" :disabled="busy || model.people.locked" @click="actions.person('inherit',model.fields.chapterId,row.generalId,undefined,field)">恢復繼承：{{ { name:'姓名', hao:'字', portraitRef:'頭像' }[field] }}</ElButton><ElButton :disabled="busy || model.people.locked" @click="actions.person('remove',model.fields.chapterId,row.generalId)">移除此章配置</ElButton></td></tr>
          </tbody></table></div>
        </template>
      </section>
    </template>
  </section>
</template>
