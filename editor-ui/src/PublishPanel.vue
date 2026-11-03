<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
const checking = ref(false), percent = ref(0), phase = ref('');
async function publish(row) {
  try {
    await ElMessageBox.confirm(`上架會先校驗整個遊戲（全部章節與跨章引用）。通過後版本號自動 +1（本次 ${row.nextVersion}）並提交管理員審核；校驗失敗則狀態不變並列出錯誤。`, `上架「${row.name}」`, { type: 'warning', confirmButtonText: '上架', cancelButtonText: '取消' });
  } catch { return; }
  props.actions.publish(row.gameId);
}
async function check(row) {
  if (props.busy || props.model.checkDisabled) return;
  checking.value = true; percent.value = 15; phase.value = `正在校驗「${row.name}」的全部章節…`;
  const timer = setInterval(() => { percent.value = Math.min(92, percent.value + 3); }, 700);
  try { await props.actions.check(row.gameId); }
  catch { /* 失敗摘要由 #publish-message 顯示 */ }
  finally {
    clearInterval(timer); percent.value = 100;
    setTimeout(() => { checking.value = false; percent.value = 0; phase.value = ''; }, 500);
  }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm('刪除整個遊戲（含所有章節與已上架版本），不是刪除單個版本；刪除立即生效且不可恢復。遊戲、章節與線上入口都會消失，玩家端讀取視為「遊戲不存在」。此操作沒有復原入口。', `刪除「${row.name}」`, { type: 'error', confirmButtonText: '刪除整個遊戲', cancelButtonText: '取消', distinguishCancelAndClose: true });
  } catch { return; }
  props.actions.remove(row.gameId, row.rowRevision);
}
</script>

<template>
  <section id="publish-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="publish-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">刷新</ElButton>
    </div>
    <p id="publish-message" role="status">{{ model.message }}</p>
    <p id="publish-references" role="status">{{ model.referencesText }}</p>
    <ul v-if="model.references?.length" id="publish-reference-list" class="empty-state">
      <li v-for="chapter in model.references" :key="chapter.chapterId" :data-chapter-id="chapter.chapterId">
        {{ chapter.name }}：{{ chapter.problems.join('；') }}
      </li>
    </ul>
    <div class="entity-table-wrap" tabindex="0">
      <table id="publish-table" class="entity-table">
        <thead><tr><th>遊戲名稱</th><th>說明</th><th>版本號</th><th>狀態</th><th>創建時間</th><th>狀態時間</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in model.rows" :key="row.gameId" :data-game-id="row.gameId" :data-state="row.stateKey">
            <td data-field="name">{{ row.name }}</td>
            <td data-field="introduction">{{ row.introduction }}</td>
            <td data-field="version">{{ row.version }}</td>
            <td data-field="state" :class="'state-' + stateTags[row.stateKey]">{{ row.state }}<ElTag v-if="row.rejected" data-field="rejected" type="danger" effect="plain" size="small">已駁回</ElTag></td>
            <td data-field="created">{{ time(row.createdAt) }}</td>
            <td data-field="state-time">{{ time(row.stateTime) }}</td>
            <td class="account-row-actions">
              <ElButton data-action="check" :disabled="busy || model.checkDisabled" @click="check(row)">校驗</ElButton>
              <ElButton data-action="publish" :title="row.publishTitle" :disabled="busy || row.publishDisabled" @click="publish(row)">上架</ElButton>
              <ElButton data-action="delete" :title="row.deleteHint" :disabled="busy || row.deleteDisabled" @click="remove(row)">刪除</ElButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!model.rows.length" class="empty-state">尚未讀取清單，或此帳戶沒有可上架的遊戲。請在「新建遊戲」建立，或按「刷新」。</p>
    </div>
    <p id="publish-operation">{{ model.operation }}</p>
    <div class="module-toolbar">
      <ElButton id="publish-query" :disabled="busy || model.queryDisabled" @click="actions.query()">查詢原操作</ElButton>
      <ElButton id="publish-retry" :disabled="busy || model.retryDisabled" @click="actions.retry()">以原鍵重試</ElButton>
      <ElButton id="publish-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">只停止本機追蹤</ElButton>
    </div>
    <p id="publish-result">{{ model.result }}</p>
    <div v-if="checking" id="publish-overlay" class="progress-overlay" role="alertdialog" aria-busy="true">
      <div class="progress-card">
        <p id="publish-overlay-text">{{ phase }}</p>
        <div class="progress-track"><div class="progress-fill" :style="{ width: percent + '%' }"></div></div>
        <small>{{ percent }}%（只讀校驗，不修改資料、不提交上架）</small>
      </div>
    </div>
  </section>
</template>
