<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
async function approve(row) {
  try {
    await ElMessageBox.confirm(`同意上架版本 ${row.version}（作者 ${row.author}）。同意後此版本成為公開版本；公告與分發由服務端流程處理。`, `同意上架「${row.name}」`, { type: 'warning', confirmButtonText: '同意上架', cancelButtonText: '取消' });
  } catch { return; }
  props.actions.approve(row.gameId, row.rowRevision);
}
async function reject(row) {
  try {
    await ElMessageBox.confirm(`拒絕版本 ${row.version} 後，它回到待上架並標記「已駁回」；作者需重新提交新版本才能再審核。`, `拒絕「${row.name}」`, { type: 'warning', confirmButtonText: '拒絕', cancelButtonText: '取消' });
  } catch { return; }
  props.actions.reject(row.gameId, row.rowRevision);
}
async function remove(row) {
  try {
    await ElMessageBox.confirm('刪除整個遊戲（含所有章節與已上架版本），不是刪除單個版本；立即生效且不可恢復。遊戲、章節與線上入口都會消失，玩家端讀取視為「遊戲不存在」。此操作沒有復原入口。', `刪除「${row.name}」`, { type: 'error', confirmButtonText: '刪除整個遊戲', cancelButtonText: '取消', distinguishCancelAndClose: true });
  } catch { return; }
  props.actions.remove(row.gameId, row.rowRevision);
}
</script>
<template>
  <section id="review-editor" class="module-card">
    <p>管理員專屬，跨創作者列出所有遊戲。狀態只有三種：草稿（未提交過）／待上架（已提交，等待審核）／已上架；被拒絕的待上架版本另標「已駁回」。</p>
    <p>「同意上架」讓該版本成為公開版本；「拒絕」把它退回待上架並標記已駁回，作者需重新提交新版本；「刪除」刪的是整個遊戲（所有章節與所有版本），任何狀態都可刪，立即生效且不可恢復。</p>
    <div class="module-toolbar">
      <ElButton id="review-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">重新整理</ElButton>
    </div>
    <p id="review-message" role="status">{{ model.message }}</p>
    <div class="entity-table-wrap" tabindex="0">
      <table id="review-table" class="entity-table">
        <thead><tr><th>遊戲名稱</th><th>作者</th><th>說明</th><th>版本號</th><th>狀態</th><th>創建時間</th><th>狀態時間</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in model.rows" :key="row.gameId" :data-game-id="row.gameId" :data-state="row.stateKey">
            <td data-field="name">{{ row.name }}</td>
            <td data-field="author">{{ row.author }}</td>
            <td data-field="introduction">{{ row.introduction }}</td>
            <td data-field="version">{{ row.version }}</td>
            <td data-field="state" :class="'state-' + stateTags[row.stateKey]">{{ row.state }}<ElTag v-if="row.rejected" data-field="rejected" type="danger" effect="plain" size="small">已駁回</ElTag></td>
            <td data-field="created">{{ time(row.createdAt) }}</td>
            <td data-field="state-time">{{ time(row.stateTime) }}</td>
            <td class="account-row-actions">
              <ElButton data-action="approve" :disabled="busy || row.approveDisabled" @click="approve(row)">同意上架</ElButton>
              <ElButton data-action="reject" :title="row.rejectHint" :disabled="busy || row.rejectDisabled" @click="reject(row)">拒絕</ElButton>
              <ElButton data-action="delete" :title="row.deleteHint" :disabled="busy || row.deleteDisabled" @click="remove(row)">刪除</ElButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!model.rows.length" class="empty-state">尚未讀取清單，或目前沒有遊戲。按「重新整理」讀取全部創作者的遊戲。</p>
    </div>
    <p id="review-result">{{ model.result }}</p>
    <p>審核只改變上架狀態；不修改作者草稿內容。已上架的遊戲被刪除時，公開入口與公告同一個刪除事務內撤下。</p>
  </section>
</template>
