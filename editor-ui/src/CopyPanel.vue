<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="copy" class="module-card">
    <form id="copy-create" @submit.prevent="actions.create()">
      <label>遊戲名稱<ElInput name="name" required maxlength="1024" :model-value="model.name"
             :disabled="busy || model.locked" @input="actions.setField('name', $event)" /></label>
      <p class="hint">名稱去掉首尾空白後最多 8 個字；只填遊戲屬性。</p>
      <label>簡介<ElInput name="introduction" maxlength="1024" :model-value="model.introduction"
             :disabled="busy || model.locked" @input="actions.setField('introduction', $event)" /></label>
      <p class="hint">簡介最多 100 個字，可留空。</p>
      <p class="hint">新建只複製底層地圖（含據點）：章節與武將庫都是空的，由作者自行建立；管理員要整套複製時用「遊戲管理」的「複製遊戲」。</p>
      <ElButton native-type="submit" type="primary" :disabled="busy || model.createDisabled">
        {{ model.resume ? '確認新建（續）' : '確認新建' }}
      </ElButton>
    </form>

    <p id="copy-message" role="status">{{ model.message }}</p>

    <h4>我的遊戲</h4>
    <p v-if="!model.games.length" class="muted">尚無遊戲。填入名稱後按「確認新建」即可建立第一份遊戲。</p>
    <div id="own-games">
      <div v-for="game in model.games" :key="game.gameId" :data-game-id="game.gameId">
        <p>{{ game.label }}</p>
        <ElButton :disabled="busy || model.locked" @click="actions.gotoGame(game.gameId)">編輯草稿</ElButton>
      </div>
    </div>
  </section>
</template>
