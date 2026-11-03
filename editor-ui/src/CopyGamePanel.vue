<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const running = ref(false), percent = ref(0), phase = ref('');
let timer = null;
async function create() {
  if (props.busy || props.model.createDisabled) return;
  running.value = true; percent.value = 8; phase.value = '正在核對名稱與來源…';
  timer = setInterval(() => { percent.value = Math.min(95, percent.value + 3); }, 900);
  try { await props.actions.create(); }
  catch { /* 失敗訊息由 model.message 統一顯示 */ }
  finally {
    clearInterval(timer); timer = null;
    percent.value = 100; phase.value = '已完成';
    setTimeout(() => { running.value = false; percent.value = 0; phase.value = ''; }, 600);
  }
}
</script>

<template>
  <section id="copy-game-editor" class="module-card">
    <!-- 唯一訊息區：複製期間、成功、失敗都在這一處顯示 -->
    <p id="full-copy-message" role="status">{{ model.message }}</p>
    <p>地圖＋章節＋武將全套複製，產生原章完整副本。名稱不能與既有遊戲重複。</p>
    <form id="full-copy-form" class="module-form" @submit.prevent="create()">
      <label>名稱<input id="full-copy-name" maxlength="1024" :value="model.name" :disabled="busy || model.locked" @input="actions.setField('name', $event.target.value)"></label>
      <label>簡介<input id="full-copy-introduction" maxlength="1024" :value="model.introduction" :disabled="busy || model.locked" @input="actions.setField('introduction', $event.target.value)"></label>
      <ElButton id="full-copy-create" type="primary" :disabled="busy || running || model.createDisabled" @click="create()">{{ model.resume ? '複製遊戲（續）' : '複製遊戲' }}</ElButton>
      <ElButton v-if="model.canForget" id="full-copy-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">清除本機追蹤</ElButton>
    </form>
    <div v-if="running" id="full-copy-overlay" class="progress-overlay" role="alertdialog" aria-busy="true">
      <div class="progress-card">
        <p id="full-copy-overlay-text">{{ phase }}</p>
        <div class="progress-track"><div class="progress-fill" :style="{ width: percent + '%' }"></div></div>
        <small>{{ percent }}%（複製完成後會自動載入遊戲清單，請勿關閉頁面）</small>
      </div>
    </div>
  </section>
</template>

<style>
.progress-overlay { position: fixed; inset: 0; background: rgba(20, 28, 22, .45); display: flex; align-items: center; justify-content: center; z-index: 3000; }
.progress-card { background: #fbfdf7; border: 1px solid #b8d0a0; border-radius: 10px; padding: 22px 26px; min-width: 340px; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); }
.progress-card p { margin: 0 0 12px; font-weight: 600; color: #2f4a1f; }
.progress-card small { color: #55654a; }
.progress-track { height: 10px; background: #dfe8d3; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
.progress-fill { height: 100%; background: #4a7828; transition: width .3s ease; }
</style>
