<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
// 物理刪除走自己的遮罩層：確認 → 正在刪除 → 完成後延遲 3 秒收起。
// 不用 ElMessageBox，因為那只能顯示靜態文字，不能在同一個彈窗裡走完三步。
const overlay = ref(null);
let closer = null;
const stopCloser = () => { if (closer) { clearTimeout(closer); closer = null; } };
const closeOverlay = () => { stopCloser(); overlay.value = null; };
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
function askDelete(row) {
  if (props.busy || row.deleteDisabled) return;
  stopCloser();
  overlay.value = { phase: 'confirm', gameId: row.gameId, rowRevision: row.rowRevision, name: row.name, line: '' };
}
async function confirmDelete() {
  const target = overlay.value;
  if (!target || target.phase !== 'confirm') return;
  stopCloser();
  overlay.value = { ...target, phase: 'running' };
  let purged = false, reason = '';
  try { purged = await props.actions.remove(target.gameId, target.rowRevision) === true; }
  catch (error) { reason = (error && error.message) || '原因未回報'; }
  if (reason) { overlay.value = { ...target, phase: 'failed', line: reason }; return; }
  overlay.value = purged
    ? { ...target, phase: 'done', line: `「${target.name}」的所有資料列已從資料庫物理刪除，玩家端目錄與正式入口已在同一事務撤下；R2 位元組與分發帳本由既有退役清理回收，不刪玩家本地存檔。這段提示 3 秒後自動關閉。` }
    : { ...target, phase: 'partial', line: '不可逆刪除柵欄已成立，但物理刪除尚未完成；清單會保留它，請依上方面板訊息稍後重試。這段提示 3 秒後自動關閉。' };
  closer = setTimeout(closeOverlay, 3000);
}
</script>
<template>
  <section id="review-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="review-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">重新整理</ElButton>
    </div>
    <p id="review-message" role="status">{{ model.message }}</p>
    <div class="entity-table-wrap" tabindex="0">
      <table id="review-table" class="entity-table">
        <thead><tr><th>遊戲名稱</th><th>作者</th><th>說明</th><th>版本號</th><th>狀態</th><th>創建時間</th><th>狀態時間</th><th>操作</th></tr></thead>
        <tbody>
          <template v-for="row in model.rows" :key="row.gameId">
            <tr :data-game-id="row.gameId" :data-state="row.stateKey">
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
                <ElButton data-action="delete" :title="row.deleteHint" :disabled="busy || row.deleteDisabled" @click="askDelete(row)">刪除</ElButton>
                <ElButton data-action="history" :disabled="busy || row.historyDisabled" @click="actions.history(row.gameId)">{{ row.historyOpen ? '收起發布歷史' : '發布歷史' }}</ElButton>
              </td>
            </tr>
            <!-- 發布歷史：行內展開，不另開頁面；只有按了「發布歷史」才讀一次。 -->
            <tr v-if="row.historyOpen" :data-history-for="row.gameId" class="history-row">
              <td colspan="8">
                <p v-if="!model.history || model.history.loading" role="status">正在讀取「{{ row.name }}」的發布歷史…</p>
                <template v-else>
                  <p v-if="model.history.message" :id="'review-history-message-' + row.gameId" role="status">{{ model.history.message }}</p>
                  <div v-if="model.history.rows.length" class="entity-table-wrap">
                    <table class="entity-table" :id="'review-history-' + row.gameId">
                      <thead><tr><th>版本</th><th>上架時間</th><th>分發狀態</th><th>發布摘要</th></tr></thead>
                      <tbody>
                        <tr v-for="entry in model.history.rows" :key="entry.version" :data-version="entry.version" :data-state="entry.state">
                          <td data-field="version">{{ entry.version }}</td>
                          <td data-field="published-at">{{ time(entry.publishedAt) }}</td>
                          <td data-field="distribution">{{ entry.stateText }}</td>
                          <td data-field="digest" :title="entry.digest"><code>{{ entry.shortDigest }}</code></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-else class="empty-state">還沒有發布記錄：發布日誌從這次上線之後才開始記，不會回填更舊的版本。</p>
                  <small>摘要只是這次上架的身分前 8 位（滑鼠停留可看完整字串）；「待確認」＝已提交但尚未觀測到公開，「已公開」＝已讀回公開狀態。</small>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="!model.rows.length" class="empty-state">尚未讀取清單，或目前沒有遊戲。按「重新整理」讀取全部創作者的遊戲。</p>
    </div>
    <p id="review-result">{{ model.result }}</p>
    <!-- 物理刪除遮罩：確認（紅字警告）→ 正在刪除 → 完成／部分完成／失敗；完成後 3 秒自動收起。 -->
    <div v-if="overlay" id="review-overlay" class="progress-overlay" role="alertdialog" :aria-busy="overlay.phase === 'running'">
      <div class="progress-card">
        <template v-if="overlay.phase === 'confirm'">
          <p id="review-overlay-title">物理刪除「{{ overlay.name }}」？</p>
          <p id="review-overlay-line">這是<b>物理刪除</b>：整個遊戲、所有章節與所有已上架版本都會從資料庫刪除，線上入口與公告同一事務撤下，R2 位元組與分發帳本由退役清理回收。不可恢復，也沒有復原入口；玩家本機存檔不受影響。</p>
          <div class="module-toolbar">
            <ElButton id="review-overlay-cancel" @click="closeOverlay()">取消</ElButton>
            <ElButton id="review-overlay-confirm" type="danger" @click="confirmDelete()">確認物理刪除</ElButton>
          </div>
        </template>
        <template v-else>
          <p id="review-overlay-title">{{ overlay.phase === 'running' ? '正在刪除，請等待…' : (overlay.phase === 'done' ? '刪除完成' : (overlay.phase === 'partial' ? '刪除未完全完成' : '刪除失敗')) }}</p>
          <p id="review-overlay-line">{{ overlay.phase === 'running' ? '正在刪除資料列並撤下線上入口，請不要關閉頁面。' : overlay.line }}</p>
          <ElButton v-if="overlay.phase !== 'running'" id="review-overlay-close" @click="closeOverlay()">關閉</ElButton>
        </template>
      </div>
    </div>
  </section>
</template>
