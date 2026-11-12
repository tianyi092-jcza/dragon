<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const purposes = [['data', '資料階段'], ['images', '圖像階段'], ['fallback-spring', '春季整圖階段'], ['fallback-summer', '夏季整圖階段'], ['fallback-autumn', '秋季整圖階段'], ['fallback-winter', '冬季整圖階段']];
function choose(value) { props.actions.choosePurpose(value); }
</script>

<template>
  <section id="stage-editor" class="module-card">
    <h3>已保存修訂的階段任務</h3>
    <p class="module-notice">只產生限定資料、六圖像或固定單季整圖階段產物，不是完整編譯或發布。未保存資料不參與，也不會自動保存。圖像及單季整圖階段目前限管理員本人的固定完整副本；單季ready不是四季或全部運行依賴完成。</p>
    <label>用途<ElSelect id="stage-purpose" :model-value="model.purpose" :disabled="busy || model.locked" @change="choose"><ElOption v-for="[value, label] in purposes" :key="value" :value="value" :disabled="value !== 'data' && !model.admin" :label="label" /></ElSelect></label>
    <p id="stage-context">{{ model.context }}</p>
    <div class="module-toolbar">
      <ElButton id="stage-create" type="primary" :disabled="busy || model.createDisabled" @click="actions.create()">明確預約已保存修訂</ElButton>
      <ElButton id="stage-query" :disabled="busy || model.queryDisabled" @click="actions.query()">查詢／同鍵確認預約</ElButton>
      <ElButton id="stage-run" :disabled="busy || model.runDisabled" @click="actions.run()">按已查狀態執行／恢復</ElButton>
      <ElButton id="stage-retry" :disabled="busy || model.retryDisabled" @click="actions.retry()">明確重試失敗任務</ElButton>
    </div>
    <p id="stage-task">{{ model.task }}</p>
    <p id="stage-status" role="status">{{ model.message }}</p>
    <p>未知預約須用原鍵及原固定body明確確認；命令失去回應先查服務，不自動重跑。重載只恢復操作關聯，不保留憑據或產物。ready只顯示階段事實，不證明命令執行歸屬或運行許可。</p>
    <ElTable id="stage-artifacts" :data="model.artifacts" :row-key="artifact => artifact.operationId + ':' + artifact.assetId" :show-header="false"><ElTableColumn min-width="320"><template #default="{ row: artifact }">{{ artifact.assetId }}／{{ artifact.byteLength }} bytes</template></ElTableColumn><ElTableColumn min-width="200"><template #default="{ row: artifact }"><ElButton :disabled="busy || model.downloadDisabled" @click="actions.download(artifact.assetId, artifact.operationId)">核驗並下載產物</ElButton></template></ElTableColumn></ElTable>
  </section>
</template>
