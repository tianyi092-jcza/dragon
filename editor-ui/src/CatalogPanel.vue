<script setup>
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="catalog-editor" class="module-card">
    <h2>遊戲資源</h2>
    <p>系統內置的只讀共享素材：頭像、圖像／圖塊、音樂、音效、字體。可查看與使用，不可上傳、替換或刪除。</p>

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
      <span class="muted">此分類 {{ model.rows.length }} 項</span>
    </div>

    <div v-if="model.loaded" class="resource-list">
      <p v-if="!model.rows.length" class="muted">此分類沒有符合條件的資源。</p>
      <div v-for="(row, index) in model.rows" :key="row.path" class="resource-row" :data-path="row.path">
        <span class="index">{{ index + 1 }}</span>
        <template v-if="row.category === 'portrait' || row.category === 'image'">
          <img :src="row.url" :alt="row.label" loading="lazy" class="thumb">
          <span class="name">{{ row.path }}</span>
          <span class="muted">{{ row.byteLength }} bytes</span>
        </template>
        <template v-else-if="row.category === 'audio'">
          <span class="name">{{ row.path }}</span>
          <audio :src="row.url" controls preload="metadata"></audio>
        </template>
        <template v-else>
          <span class="name">{{ row.path }}</span>
          <span class="muted">{{ row.byteLength }} bytes</span>
        </template>
      </div>
    </div>
  </section>
</template>
