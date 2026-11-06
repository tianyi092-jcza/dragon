<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
const overlay = ref(null), elapsed = ref(0);
let ticker = null, closer = null;
const stop = () => { if (ticker) { clearInterval(ticker); ticker = null; } if (closer) { clearTimeout(closer); closer = null; } };
// 阻塞遮罩：只針对「正在跑的那一个动作」。不管结果如何，最后都要关掉回到正常页面。
function open(title) { stop(); overlay.value = { title, line: '', failed: false }; elapsed.value = 0; ticker = setInterval(() => { elapsed.value++; }, 1000); }
function close() { stop(); overlay.value = null; }
async function attached(title, run) {
  open(title);
  try { await run(); close(); }
  catch (error) {
    // 失敗或逾時：先在遮罩第二行說明原因，然後自動關閉；同樣的句子會留在面板訊息裡。
    overlay.value = { title, line: (error && error.message) || '處理未完成（原因未回報）。', failed: true };
    if (ticker) { clearInterval(ticker); ticker = null; }
    closer = setTimeout(() => { closer = null; close(); }, 2500);
  }
}
async function publish(row) {
  try {
    await ElMessageBox.confirm(`上架會先校驗整個遊戲（全部章節與跨章引用）。通過後版本號自動 +1（本次 ${row.nextVersion}）並提交管理員審核；校驗失敗則狀態不變並列出錯誤。`, `上架「${row.name}」`, { type: 'warning', confirmButtonText: '上架', cancelButtonText: '取消' });
  } catch { return; }
  await attached('正在處理上架…', () => props.actions.publish(row.gameId));
}
async function check(row) {
  if (props.busy || props.model.checkDisabled) return;
  await attached(`正在檢驗「${row.name}」…`, () => props.actions.check(row.gameId));
}
</script>

<template>
  <section id="publish-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="publish-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">刷新</ElButton>
    </div>
    <p id="publish-message" role="status">{{ model.message }}</p>
    <p v-if="model.blockedReason" id="publish-blocked" role="status" class="module-notice">{{ model.blockedReason }}</p>
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
              <ElButton data-action="publish" :title="row.publishHint" :disabled="busy || row.publishDisabled" @click="publish(row)">上架</ElButton>
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
    <div v-if="overlay" id="publish-overlay" class="progress-overlay" role="alertdialog" aria-busy="true">
      <div class="progress-card">
        <p id="publish-overlay-text">{{ overlay.title }}</p>
        <!-- 第二行：處理過程；失敗或逾時就在這一行說明原因 -->
        <p id="publish-overlay-line">{{ overlay.failed ? overlay.line : (model.phase || '正在處理…') }}</p>
        <small id="publish-overlay-elapsed">{{ overlay.failed ? '上面這句話也會留在面板訊息裡' : '已用 ' + elapsed + ' 秒；完成後會自動關閉，也可以切到別的頁面' }}</small>
      </div>
    </div>
  </section>
</template>
