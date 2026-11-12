<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const configured = cityId => props.model.cities.chapters.some(chapter => chapter.chapterId === props.model.fields.chapterId && chapter.cities.some(city => city.cityId === cityId));
const references = cityId => props.model.cities.chapters.filter(chapter => chapter.cities.some(city => city.cityId === cityId));
const chapterName = chapterId => props.model.chapters.find(chapter => chapter.chapterId === chapterId)?.name ?? '';
</script>
<template>
  <section v-if="model?.cities" id="city-definitions">
    <h3>中立據點基礎名稱與章節配置</h3>
    <p>只修改已有據點的基礎名稱，不改身份、槽位、座標、道路或原生章表；有明確章引用時須確認名稱影響。不從原章名稱補預設值；同名不代表同一據點。完整副本不開放此項。</p>
    <p>共用遊戲資料的精確修訂與原保存操作，只保存本次明確操作。確認收據後須明確重讀，不自動保存其它表單或切換最新修訂。</p>
    <div class="module-toolbar">
      <ElButton id="city-definition-refresh" :disabled="busy || model.locked" @click="actions.refresh()">更新遊戲清單</ElButton>
      <label>明確草稿修訂<ElInput id="city-definition-revision" :model-value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event)" /></label>
      <ElButton id="city-definition-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂的據點名稱</ElButton>
      <ElButton id="city-definition-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="city-definition-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試同一個請求／內容</ElButton>
    </div>
    <p>遊戲：{{ model.fields.gameId || '尚未選擇' }}／已載入修訂：{{ model.context?.draftRevision ?? '未載入' }}<strong v-if="model.context && !model.context.verified">／須重新明確載入</strong></p>
    <p id="city-definition-status" role="status">{{ model.message }}</p>
    <p v-if="!model.cities.supported">未提供支援的中立據點基礎資料；未知不等於空庫，請明確讀取自己的修訂。</p>
    <div v-else class="table-region">
      <p v-if="!model.cities.referencesKnown" id="chapter-city-unknown">未提供完整章節據點清單；影響範圍未知，名稱與配置操作暫不可用。</p>
      <label>據點配置章節<ElSelect id="chapter-city-select" :model-value="model.fields.chapterId" :disabled="busy || model.cities.locked" @change="actions.setField('chapterId', $event)"><ElOption v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId" :label="`${chapter.name} [${chapter.chapterId}]`" /></ElSelect></label>
      <p>配置只建立本章中立引用；移除不刪除基礎據點或地圖。不初始化原生城市，不解除試玩缺口。</p>
      <p>引用清單僅列已讀修訂的明確章節配置，與所選章節無關；不涵蓋道路、事件或原始資料的完整刪除檢查，基礎據點仍不可刪除。</p>
      <p v-if="!model.cities.rows.length">此修訂的據點基礎清單為空。</p>
      <ElTable id="city-definition-table" :data="model.cities.rows" row-key="cityId">
        <ElTableColumn label="據點身份" min-width="180"><template #default="{ row }"><span :data-city-definition-id="row.cityId">{{ row.cityId }}</span></template></ElTableColumn>
        <ElTableColumn label="基礎名稱" min-width="160"><template #default="{ row }">{{ row.name ?? '未配置' }}</template></ElTableColumn>
        <ElTableColumn label="操作" min-width="140"><template #default="{ row }"><ElButton data-city-rename :disabled="busy || model.cities.locked" @click="actions.cityRename(row.cityId)">設定名稱</ElButton></template></ElTableColumn>
        <ElTableColumn label="本章配置" min-width="240"><template #default="{ row }"><span>{{ !model.cities.referencesKnown ? '未知' : configured(row.cityId) ? '已配置中立引用' : '未配置' }}</span><ElButton data-chapter-city :disabled="busy || model.cities.locked || !model.fields.chapterId" @click="actions.chapterCity(configured(row.cityId) ? 'remove' : 'set', model.fields.chapterId, row.cityId)">{{ configured(row.cityId) ? '移除此章配置' : '配置中立引用' }}</ElButton></template></ElTableColumn>
        <ElTableColumn label="明確章節引用" min-width="300"><template #default="{ row }"><div data-city-references><span v-if="!model.cities.referencesKnown">未知，未取得完整章節配置</span><details v-else><summary>已讀修訂：{{ references(row.cityId).length }} 章配置</summary><ElTable v-if="references(row.cityId).length" :data="references(row.cityId)" :show-header="false"><ElTableColumn><template #default="{ row: reference }">{{ chapterName(reference.chapterId) }} [{{ reference.chapterId }}]</template></ElTableColumn></ElTable><p v-else>沒有明確章節配置；不代表沒有其它引用。</p></details></div></template></ElTableColumn>
      </ElTable>
    </div>
  </section>
</template>
