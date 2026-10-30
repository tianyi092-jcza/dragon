<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>

<template>
  <section id="stage-assets-editor" class="module-card">
    <h3>六階段與可用庫的結構（非運行准入）</h3>
    <p class="module-notice">只使用原六用途任務的同一明確遊戲與已保存修訂。不保存未保存輸入、不自動預約／執行／查詢／重試。即使目前草稿較新，這裡也不改綁latest。資料僅是此時服務傳回的描述，不是RuntimeManifest或權限憑據；本頁不授予Trial／發布／刪除准入，也不代表其它流程全部未實作。</p>
    <p id="stage-assets-context">{{ model.context }}</p>
    <div class="module-toolbar">
      <ElButton id="stage-assets-load" type="primary" :disabled="busy || model.loadDisabled" @click="actions.load()">明確GET六階段結構</ElButton>
      <ElButton id="stage-assets-clear" :disabled="busy || model.clearDisabled" @click="actions.clear()">只清除本頁顯示</ElButton>
    </div>
    <p id="stage-assets-status" role="status">{{ model.message }}</p>
    <p id="stage-assets-summary">{{ model.summary }}</p>
    <h4>用途分立的階段描述（無執行／下載入口）</h4>
    <div id="stage-assets-outputs"><p v-for="(output, index) in model.outputs" :key="index">{{ output }}</p></div>
    <p>以下兩類分開保留：報告未提供的准入證明，不等於整個系統缺少該能力；來源未閉合引用，也不等於每條都缺少一個檔案。不能相加當成缺失檔案總數。</p>
    <div id="stage-assets-missing">
      <h4>本結構報告未提供的准入證明<span v-if="model.summary">（{{ model.missing.length }}類）</span></h4>
      <div id="stage-assets-proof-gaps"><p v-for="(missing, index) in model.missing" :key="index">{{ missing }}</p></div>
      <h4>來源登記保留的未閉合引用<span v-if="model.summary">（{{ model.unresolved.length }}條）</span></h4>
      <div id="stage-assets-unresolved"><p v-for="(reference, index) in model.unresolved" :key="index">{{ reference }}</p></div>
    </div>
  </section>
</template>
