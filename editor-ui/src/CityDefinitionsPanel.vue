<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
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
      <label>明確草稿修訂<input id="city-definition-revision" :value="model.fields.revision" :disabled="busy || model.loadLocked" inputmode="numeric" @input="actions.setField('revision', $event.target.value)"></label>
      <ElButton id="city-definition-load" :disabled="busy || model.loadLocked || !model.fields.gameId" @click="actions.load()">載入此修訂的據點名稱</ElButton>
      <ElButton id="city-definition-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="city-definition-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">重試相同原鍵／內容</ElButton>
    </div>
    <p>遊戲：{{ model.fields.gameId || '尚未選擇' }}／已載入修訂：{{ model.context?.draftRevision ?? '未載入' }}<strong v-if="model.context && !model.context.verified">／須重新明確載入</strong></p>
    <p id="city-definition-status" role="status">{{ model.message }}</p>
    <p v-if="!model.cities.supported">未提供支援的中立據點基礎資料；未知不等於空庫，請明確讀取自己的修訂。</p>
    <div v-else class="entity-table-wrap">
      <p v-if="!model.cities.referencesKnown" id="chapter-city-unknown">未提供完整章節據點清單；影響範圍未知，名稱與配置操作暫不可用。</p>
      <label>據點配置章節<select id="chapter-city-select" :value="model.fields.chapterId" :disabled="busy || model.cities.locked" @change="actions.setField('chapterId', $event.target.value)"><option v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }} [{{ chapter.chapterId }}]</option></select></label>
      <p>配置只建立本章中立引用；移除不刪除基礎據點或地圖。不初始化原生城市，不解除試玩缺口。</p>
      <p>引用清單僅列已讀修訂的明確章節配置，與所選章節無關；不涵蓋道路、事件或原始資料的完整刪除檢查，基礎據點仍不可刪除。</p>
      <p v-if="!model.cities.rows.length">此修訂的據點基礎清單為空。</p>
      <table id="city-definition-table" class="entity-table"><thead><tr><th>據點身份</th><th>基礎名稱</th><th>操作</th><th>本章配置</th><th>明確章節引用</th></tr></thead><tbody>
        <tr v-for="row in model.cities.rows" :key="row.cityId" :data-city-definition-id="row.cityId"><td>{{ row.cityId }}</td><td>{{ row.name ?? '未配置' }}</td><td><ElButton data-city-rename :disabled="busy || model.cities.locked" @click="actions.cityRename(row.cityId)">設定名稱</ElButton></td><td><span>{{ !model.cities.referencesKnown ? '未知' : configured(row.cityId) ? '已配置中立引用' : '未配置' }}</span><ElButton data-chapter-city :disabled="busy || model.cities.locked || !model.fields.chapterId" @click="actions.chapterCity(configured(row.cityId) ? 'remove' : 'set', model.fields.chapterId, row.cityId)">{{ configured(row.cityId) ? '移除此章配置' : '配置中立引用' }}</ElButton></td><td data-city-references>
          <span v-if="!model.cities.referencesKnown">未知，未取得完整章節配置</span>
          <details v-else><summary>已讀修訂：{{ references(row.cityId).length }} 章配置</summary>
            <ul v-if="references(row.cityId).length"><li v-for="reference in references(row.cityId)" :key="reference.chapterId">{{ chapterName(reference.chapterId) }} [{{ reference.chapterId }}]</li></ul>
            <p v-else>沒有明確章節配置；不代表沒有其它引用。</p>
          </details>
        </td></tr>
      </tbody></table>
    </div>
  </section>
</template>
