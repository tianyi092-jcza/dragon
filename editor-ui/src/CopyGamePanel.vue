<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElProgress } from 'element-plus/es/components/progress/index.mjs';
import { vLoading } from 'element-plus/es/components/loading/index.mjs';
import { loadingSvg } from './loading.js';
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
      <label>名稱<ElInput id="full-copy-name" maxlength="1024" :model-value="model.name" :disabled="busy || model.locked" @input="actions.setField('name', $event)" /></label>
      <label>簡介<ElInput id="full-copy-introduction" maxlength="1024" :model-value="model.introduction" :disabled="busy || model.locked" @input="actions.setField('introduction', $event)" /></label>
      <ElButton id="full-copy-create" type="primary" :disabled="busy || model.createDisabled" @click="create()">複製遊戲</ElButton>
      <ElButton v-if="model.canForget" id="full-copy-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">清除本機追蹤</ElButton>
    </form>
    <ElDialog v-if="model.tracking || model.failed" id="full-copy-overlay" width="min(440px, calc(100vw - 32px))" align-center :model-value="true" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" role="alertdialog" :aria-busy="model.tracking">
      <div class="full-copy-progress">
        <div v-if="model.tracking" id="full-copy-loading" v-loading="true" :element-loading-svg="loadingSvg" class="full-copy-loading" />
        <!-- 标题与背景面板同一句话：只有一套进度说法，不用百分比。
             失败时弹窗不自动消失（用户要求）：列出原因，按「確認」才关。 -->
        <p id="full-copy-overlay-text">{{ model.message }}</p>
        <template v-if="model.failed">
          <div class="module-toolbar">
            <ElButton id="full-copy-dismiss" type="primary" :disabled="busy" @click="actions.dismiss()">確認</ElButton>
          </div>
        </template>
        <template v-else>
          <ElProgress :percentage="50" indeterminate :show-text="false" :aria-valuenow="null" />
        </template>
      </div>
    </ElDialog>
  </section>
</template>

<style scoped>
.full-copy-progress { min-height: 220px; display: flex; flex-direction: column; justify-content: center; gap: 20px; padding: 8px 16px 24px; }
.full-copy-loading { position: relative; height: 80px; flex-shrink: 0; }
#full-copy-overlay-text { margin: 0; }
</style>
