<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="copy" class="module-card">
    <h3>新建遊戲</h3>
    <p>建立一份內置遊戲的完整副本（20 個章節）。副本歸你所有，可自由編輯；內置原件永遠不會被修改。</p>

    <form id="copy-create" @submit.prevent="actions.create()">
      <label>遊戲名稱<input name="name" required maxlength="1024" :value="model.name"
             :disabled="busy || model.locked" @input="actions.setField('name', $event.target.value)"></label>
      <p class="hint">名稱去掉首尾空白後最多 8 個字。</p>
      <label>簡介<input name="introduction" maxlength="1024" :value="model.introduction"
             :disabled="busy || model.locked" @input="actions.setField('introduction', $event.target.value)"></label>
      <p class="hint">簡介最多 100 個字，可留空。</p>
      <ElButton native-type="submit" type="primary" :disabled="busy || model.createDisabled">
        {{ model.resume ? '確認新建（續）' : '確認新建' }}
      </ElButton>
    </form>

    <p id="copy-message" role="status">{{ model.message }}</p>

    <h4>我的遊戲</h4>
    <p v-if="!model.games.length" class="muted">尚無遊戲。填入名稱後按「確認新建」即可建立第一份完整副本。</p>
    <div id="own-games">
      <div v-for="game in model.games" :key="game.gameId" :data-game-id="game.gameId">
        <p>{{ game.label }}</p>
        <ElButton :disabled="busy || model.locked" @click="actions.gotoGame(game.gameId)">編輯草稿</ElButton>
        <ElButton :disabled="busy || model.locked" @click="actions.openDeletion(game.gameId)">刪除追蹤</ElButton>
      </div>
    </div>
  </section>
</template>
