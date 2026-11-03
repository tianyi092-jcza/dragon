<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>

<template>
  <section id="copy-game-editor" class="module-card">
    <p>地圖＋章節＋武將全套複製，產生原章完整副本；與「新建遊戲」只複製地圖不同。來源固定為已登記的底層資源，不選 registry。只有管理員能用這個模組。</p>
    <form id="full-copy-form" class="module-form" @submit.prevent="actions.create()">
      <label>名稱<input id="full-copy-name" maxlength="1024" :value="model.name" :disabled="busy || model.locked" @input="actions.setField('name', $event.target.value)"></label>
      <label>簡介<input id="full-copy-introduction" maxlength="1024" :value="model.introduction" :disabled="busy || model.locked" @input="actions.setField('introduction', $event.target.value)"></label>
      <ElButton id="full-copy-create" type="primary" :disabled="busy || model.createDisabled" @click="actions.create()">{{ model.resume ? '複製遊戲（續）' : '複製遊戲' }}</ElButton>
      <p id="full-copy-message" role="status">{{ model.message }}</p>
    </form>
  </section>
</template>
