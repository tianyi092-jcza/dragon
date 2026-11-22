<script setup>
import { ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElProgress } from 'element-plus/es/components/progress/index.mjs';
import { vLoading } from 'element-plus/es/components/loading/index.mjs';
import { loadingSvg } from './loading.js';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const showConversion = ref(false);
watch(() => props.model.conversionDetails, () => { showConversion.value = false; });
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
    <ElButton v-if="model.conversionDetails" id="full-copy-conversion" @click="showConversion = true">轉換明細</ElButton>
    <ElDialog v-model="showConversion" title="章節轉換明細" width="min(880px, calc(100vw - 32px))" align-center destroy-on-close>
      <ElInput id="full-copy-conversion-details" type="textarea" readonly :autosize="{ minRows: 8, maxRows: 18 }" :model-value="model.conversionDetails" />
      <template #footer><ElButton @click="showConversion = false">關閉</ElButton></template>
    </ElDialog>
    <p>地圖＋章節＋武將全套複製，產生原章完整副本。名稱不能與既有遊戲重複。</p>
    <ElForm id="full-copy-form" class="module-form" label-position="top" :model="model" @submit.prevent="create()">
      <ElFormItem label="名稱" prop="name"><ElInput id="full-copy-name" maxlength="1024" :model-value="model.name" :disabled="busy || model.locked" @input="actions.setField('name', $event)" /></ElFormItem>
      <ElFormItem label="簡介" prop="introduction"><ElInput id="full-copy-introduction" maxlength="1024" :model-value="model.introduction" :disabled="busy || model.locked" @input="actions.setField('introduction', $event)" /></ElFormItem>
      <ElFormItem>
      <ElButton id="full-copy-create" type="primary" :disabled="busy || model.createDisabled" @click="create()">複製遊戲</ElButton>
      <ElButton v-if="model.canForget" id="full-copy-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">清除本機追蹤</ElButton>
      </ElFormItem>
    </ElForm>
    <ElDialog v-if="model.tracking || model.failed" id="full-copy-overlay" width="min(440px, calc(100vw - 32px))" align-center :model-value="true" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" role="alertdialog" :aria-busy="model.tracking">
      <div class="full-copy-progress">
        <div v-if="model.tracking" id="full-copy-loading" v-loading="true" :element-loading-svg="loadingSvg" class="full-copy-loading" />
        <p id="full-copy-overlay-text">{{ model.message }}</p>
        <ElProgress v-if="!model.failed" :percentage="50" indeterminate :show-text="false" :aria-valuenow="null" />
      </div>
      <!-- 失敗確認走基礎用法的 footer 動作位；運行中無 footer，不改變幾何。 -->
      <template v-if="model.failed" #footer><ElButton id="full-copy-dismiss" type="primary" :disabled="busy" @click="actions.dismiss()">確認</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.full-copy-progress { min-height: 220px; display: flex; flex-direction: column; justify-content: center; gap: 20px; padding: 8px 16px 24px; }
.full-copy-loading { position: relative; height: 80px; flex-shrink: 0; }
#full-copy-overlay-text { margin: 0; }
</style>
