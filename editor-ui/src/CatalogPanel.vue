<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="catalog-editor" class="module-card">
    <h2>遊戲資源</h2>
    <p>系統內置的只讀共享素材：頭像、圖像／圖塊、音樂、音效、字體。可查看與使用，不可上傳、替換或刪除。</p>
    <div class="module-toolbar">
      <ElButton id="catalog-load" type="primary" :disabled="busy || model.loading" @click="actions.load()">
        {{ model.loaded ? '重新整理清單' : '讀取資源清單' }}
      </ElButton>
      <span v-if="model.loaded" class="muted">共 {{ model.total }} 個資源</span>
    </div>
    <p id="catalog-message" role="status">{{ model.message }}</p>

    <div v-if="model.loaded" class="resource-categories">
      <button v-for="item in model.categories" :key="item.id" :data-category="item.id"
              :class="{ on: model.category === item.id }" :disabled="busy"
              @click="actions.selectCategory(item.id)">
        {{ item.label }}<span class="count">{{ item.count }}</span>
      </button>
    </div>

    <div v-if="model.loaded" class="resource-filter">
      <label>篩選<input :value="model.filter" maxlength="128" :disabled="busy"
                       placeholder="依檔名篩選" @input="actions.setFilter($event.target.value)"></label>
    </div>

    <div v-if="model.loaded" class="resource-list">
      <p v-if="!model.rows.length" class="muted">此分類沒有符合條件的資源。</p>
      <div v-for="row in model.rows" :key="row.path" class="resource-row" :data-path="row.path">
        <template v-if="row.category === 'portrait' || row.category === 'image'">
          <img :src="row.url" :alt="row.label" loading="lazy" class="thumb">
          <span class="name">{{ row.path }}</span>
          <span class="muted">{{ row.byteLength }} bytes</span>
        </template>
        <template v-else-if="row.category === 'audio'">
          <span class="name">{{ row.path }}</span>
          <span class="muted">{{ row.byteLength }} bytes</span>
          <audio :src="row.url" controls preload="none"></audio>
        </template>
        <template v-else>
          <span class="name">{{ row.path }}</span>
          <span class="muted">{{ row.byteLength }} bytes</span>
        </template>
      </div>
    </div>
  </section>
</template>
