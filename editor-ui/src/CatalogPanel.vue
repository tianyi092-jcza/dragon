<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="catalog-editor" class="module-card resources-card">
    <p v-if="!model.loaded" id="catalog-message" role="status" class="muted">
      {{ model.message || '正在讀取內置資源…' }}
    </p>

    <template v-if="model.loaded">
      <!-- 使用者 m1107：篩選與分類 TAB 同一行，靠右上；不再单独占一行高度。 -->
      <div class="resource-toolbar">
        <div class="resource-categories">
          <ElButton v-for="item in model.categories" :key="item.id" :data-category="item.id"
                  :type="model.category === item.id ? 'primary' : 'default'" :disabled="busy"
                  @click="actions.selectCategory(item.id)">
            {{ item.label }}<span class="count">{{ item.count }}</span>
          </ElButton>
        </div>
        <div class="resource-filter">
          <span class="muted">此分類 {{ model.rows.length }} 項</span>
          <label>篩選<ElInput :model-value="model.filter" maxlength="128" :disabled="busy"
                           placeholder="依檔名篩選" @input="actions.setFilter($event)" /></label>
        </div>
      </div>

      <!-- 頭像走相册：序号—头像—路径，路径下一行是文件大小。 -->
      <div v-if="model.category === 'portrait'" class="resource-list resource-gallery">
        <p v-if="!model.rows.length" class="muted">此分類沒有符合條件的資源。</p>
        <figure v-for="(row, index) in model.rows" :key="row.path" class="resource-card" :data-path="row.path">
          <span class="index">{{ index + 1 }}</span>
          <img :src="row.url" :alt="row.label" loading="lazy" class="thumb">
          <figcaption>
            <span class="name">{{ row.path }}</span>
            <span class="muted size">{{ row.byteLength }} bytes</span>
          </figcaption>
        </figure>
      </div>

      <ElTable v-else :data="model.rows" row-key="path" :show-header="false">
        <ElTableColumn type="index" width="80" />
        <ElTableColumn min-width="120"><template #default="{ row }"><span class="resource-row" :data-path="row.path"><img v-if="row.category === 'image'" :src="row.url" :alt="row.label" loading="lazy" class="thumb"></span></template></ElTableColumn>
        <ElTableColumn prop="path" min-width="280" />
        <ElTableColumn min-width="300"><template #default="{ row }"><audio v-if="row.category === 'audio'" :src="row.url" controls preload="metadata"></audio><span v-else>{{ row.byteLength }} bytes</span></template></ElTableColumn>
        <template #empty>此分類沒有符合條件的資源。</template>
      </ElTable>
    </template>
  </section>
</template>
