<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
async function publish(row) {
  try {
    await ElMessageBox.confirm(`上架會先校驗整個遊戲（全部章節與跨章引用）。通過後版本號自動 +1（本次 ${row.nextVersion}）並提交管理員審核；校驗失敗則狀態不變並列出錯誤。`, `上架「${row.name}」`, { type: 'warning', confirmButtonText: '上架', cancelButtonText: '取消' });
  } catch { return; }
  props.actions.publish(row.gameId);
}
async function check(row) {
  props.actions.check(row.gameId);
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
    <p>一個遊戲一行。狀態只有三種：草稿（未提交過，版本號顯示「—」）／待上架（已提交，等待管理員同意）／已上架。任何人都可以刪除自己的遊戲，刪除立即生效且不可恢復，彈窗會再次確認刪除的是整個遊戲而不是單個版本。</p>
    <p>「上架」不是即時公開：它先校驗整個遊戲，通過後自動把版本號 +1 並提交審核，只有管理員同意後才變成已上架；被拒絕的提交會標記「已駁回」，重新上架即產生新版本。刪除在任何狀態都可用（含已上架），不需要對方同意。</p>
    <div class="module-toolbar">
      <ElButton id="publish-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">重新整理</ElButton>
    </div>
    <p id="publish-message" role="status">{{ model.message }}</p>
    <p id="publish-references" role="status">{{ model.referencesText }}</p>
    <ul id="publish-reference-list" class="empty-state">
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
              <ElButton data-action="check" title="只讀：遍歷全部章節，列出引用不到基礎資料的章；不提交上架" :disabled="busy || model.checkDisabled" @click="check(row)">校驗整遊戲</ElButton>
              <ElButton data-action="publish" :title="row.publishTitle" :disabled="busy || row.publishDisabled" @click="publish(row)">上架</ElButton>
              <ElButton data-action="delete" :title="row.deleteHint" :disabled="busy || row.deleteDisabled" @click="remove(row)">刪除</ElButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!model.rows.length" class="empty-state">尚未讀取清單，或此帳戶沒有可上架的遊戲。請在「新建遊戲」建立，或按「重新整理」。</p>
    </div>
    <p id="publish-operation">{{ model.operation }}</p>
    <div class="module-toolbar">
      <ElButton id="publish-query" :disabled="busy || model.queryDisabled" @click="actions.query()">查詢原操作</ElButton>
      <ElButton id="publish-retry" :disabled="busy || model.retryDisabled" @click="actions.retry()">以原鍵重試</ElButton>
      <ElButton id="publish-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">只停止本機追蹤</ElButton>
    </div>
    <p id="publish-result">{{ model.result }}</p>
    <p>未知回應保留原操作者、遊戲、鍵、內容及原修訂；重載不自動重送或查詢，404 不表示請求已取消。本地提交、分發確認、管理員同意與目前遠端狀態是不同事實。</p>
    <p>「校驗整遊戲」只讀：它遍歷全部章節，列出因基礎資料（據點、武將庫）被刪除而引用不到的章；不改資料、不發試玩、不提交上架。上架本身仍由服務端重跑同一校驗，未通過時版本號與狀態都不變。</p>
  </section>
</template>
