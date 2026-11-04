<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
async function create() {
  if (props.busy || props.model.createDisabled) return;
  try { await props.actions.create(); }
  catch { /* 失敗訊息由 model.message 統一顯示 */ }
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
      <ElButton id="full-copy-create" type="primary" :disabled="busy || model.createDisabled" @click="create()">複製遊戲</ElButton>
      <ElButton v-if="model.canForget" id="full-copy-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">清除本機追蹤</ElButton>
    </form>
    <div v-if="model.tracking" id="full-copy-overlay" class="progress-overlay" role="alertdialog" aria-busy="true">
      <div class="progress-card">
        <!-- 标题与背景面板同一句话：只有一套进度说法，不用百分比。 -->
        <p id="full-copy-overlay-text">{{ model.message }}</p>
        <div class="progress-track"><div class="progress-fill indeterminate"></div></div>
        <small>進度以實際寫入的檔案數計算；完成後會自動載入遊戲清單，不必再按任何按鈕。</small>
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
/* 總檔案數要等兩份文件都編碼完才知道，所以不宣稱%；用往復滑動表示仍在進行。 */
.progress-fill.indeterminate { width: 40%; animation: progress-slide 1.4s ease-in-out infinite; }
@keyframes progress-slide { from { margin-left: -40%; } to { margin-left: 100%; } }
</style>
