<script setup>
import { computed, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElText } from 'element-plus/es/components/text/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
// 物理刪除覆盖范围（与 server/gamepurge TABLES 对齐的面向用户的分组；共 36 张表全覆盖，bytes 组对应 R2 回收无库表）。
// 状态只反映本弹窗流程：确认＝将检查并清除；完成＝服务端逐表复查 0 残留；失败只标涉及的组，不画假勾。
const purgeScopes = Object.freeze([
  { key: 'content', title: '游戏内容数据', detail: '章节／据点／武将／地图定义与引用、试运行与编译记录、操作日志', tables: ['content_used_ids', 'content_names', 'content_audits', 'content_announcements', 'content_game_validations', 'content_snapshots', 'content_releases', 'game_releases', 'draft_requests', 'draft_objects', 'draft_references', 'draft_topology_moves', 'draft_topology_rebuilds', 'trial_sessions', 'compile_jobs', 'fallback_compile_objects', 'data_compile_objects', 'image_compile_objects', 'content_private_writes', 'content_http_command_targets', 'content_http_command_proofs', 'content_deletion_operations'] },
  { key: 'copy', title: '副本草稿与检验上架记录', detail: '编辑副本、检验票据、上架槽位', tables: ['copy_requests', 'copy_objects', 'copy_origins', 'game_copies', 'publish_slots', 'copy_validations', 'content_deletion_job_freezes', 'content_deletion_draft_freezes'] },
  { key: 'formal', title: '已上架版本与正式快照', detail: '正式版本、发布历史、玩家可见目录条目', tables: ['published_games', 'published_packs', 'published_pack_chapters', 'published_pack_assets', 'content_games', 'content_deletion_fences'] },
  { key: 'bytes', title: '存储字节', detail: '游戏包与资源字节、私有目录；共享画像与程序包、分发账本不受影响', tables: [] },
]);
// 物理刪除走自己的遮罩層：確認 → 正在刪除 → 完成後延遲 3 秒收起。
// 不用 ElMessageBox，因為那只能顯示靜態文字，不能在同一個彈窗裡走完三步。
const overlay = ref(null);
let closer = null;
const stopCloser = () => { if (closer) { clearTimeout(closer); closer = null; } };
const closeOverlay = () => { stopCloser(); overlay.value = null; };
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
const tableRows = computed(() => props.model.rows.flatMap(row => row.historyOpen ? [row, { ...row, historyDetail: true }] : [row]));
const spanHistory = ({ row, columnIndex }) => row.historyDetail ? (columnIndex === 0 ? [1, 8] : [0, 0]) : [1, 1];
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
  const doing = purgeScopes.map(scope => ({ ...scope, state: 'doing', note: '进行中...' }));
  const runId = Symbol('purge');
  overlay.value = { ...target, phase: 'running', runId, scopes: doing };
  let outcome = null, reason = '';
  try { outcome = await props.actions.remove(target.gameId, target.rowRevision); }
  catch (error) { reason = (error && error.message) || '原因未回報'; }
  // 用户已手动关闭：不再弹回，只留页面消息。
  if (overlay.value?.runId !== runId) return;
  // 栅栏/网络等异常：同弹窗就地留空状态，手动关闭，不自动收起。
  if (reason || !outcome) { overlay.value = { ...target, phase: 'failed', runId, line: reason || '原因未回報', scopes: doing.map(s => ({ ...s, state: 'idle', note: '' })) }; return; }
  if (outcome.ok) {
    const scopes = purgeScopes.map(scope => {
      if (scope.key === 'bytes') {
        const rec = outcome.receipt?.reclamation;
        return rec?.state === 'completed'
          ? { ...scope, state: 'cleared', note: '完成' }
          : { ...scope, state: 'todo', note: '待回收' };
      }
      return { ...scope, state: 'cleared', note: '完成' };
    });
    overlay.value = { ...target, phase: 'done', runId, line: `「${target.name}」的所有資料列已從資料庫物理刪除，玩家端目錄與正式入口已在同一事務撤下；R2 位元組與分發帳本由既有退役清理回收，不刪玩家本地存檔。這段提示 3 秒後自動關閉。`, scopes };
    closer = setTimeout(closeOverlay, 3000);
    return;
  }
  // 栅栏已成立但 purge 失败：同弹窗就地在涉及的组后面标删除失败，其余留空，手动关闭，不自动收起。
  const bad = new Set(outcome.errorTables ?? []);
  const scopes = purgeScopes.map(scope => {
    if (scope.key === 'bytes') return { ...scope, state: 'idle', note: '' };
    const hit = scope.tables.filter(t => bad.has(t));
    return hit.length ? { ...scope, state: 'failed', note: '删除失败！' } : { ...scope, state: 'idle', note: '' };
  });
  overlay.value = { ...target, phase: 'partial', runId, line: '已建立不可逆刪除柵欄，但物理刪除尚未完成：' + outcome.error + (bad.size ? '（涉及：' + [...bad].join('、') + '）' : '') + '。请依上方面板讯息稍后重试。', scopes };
}
</script>
<template>
  <section id="review-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="review-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">重新整理</ElButton>
    </div>
    <ElTable id="review-table" :data="tableRows" :row-key="row => row.gameId + (row.historyDetail ? '-history' : '')" :span-method="spanHistory">
      <ElTableColumn v-for="[key, title] in [['name','遊戲名稱'],['author','作者'],['description','发布说明'],['version','版本號'],['state','狀態'],['created','創建時間'],['state-time','狀態時間'],['actions','操作']]" :key="key" :label="title" :min-width="key === 'actions' ? 420 : 180">
        <template #default="{ row }">
          <div v-if="row.historyDetail" :data-history-for="row.gameId">
            <template v-if="model.history && !model.history.loading">
              <p v-if="model.history.message" :id="'review-history-message-' + row.gameId" role="status">{{ model.history.message }}</p>
              <ElTable v-if="model.history.rows.length" :id="'review-history-' + row.gameId" :data="model.history.rows" row-key="version">
                <ElTableColumn v-for="[field, label] in [['version','版本'],['published-at','上架時間'],['distribution','分發狀態'],['digest','發布摘要']]" :key="field" :label="label" min-width="180"><template #default="{ row: entry }"><span :data-field="field" :data-version="entry.version" :data-state="entry.state" :title="field === 'digest' ? entry.digest : undefined"><code v-if="field === 'digest'">{{ entry.shortDigest }}</code><template v-else>{{ field === 'published-at' ? time(entry.publishedAt) : field === 'distribution' ? entry.stateText : entry.version }}</template></span></template></ElTableColumn>
              </ElTable>
              <p v-else class="empty-state">還沒有發布記錄：發布日誌從這次上線之後才開始記，不會回填更舊的版本。</p>
              <small>摘要只是這次上架的身分前 8 位（滑鼠停留可看完整字串）；「待確認」＝已提交但尚未觀測到公開，「已公開」＝已讀回公開狀態。</small>
            </template>
          </div>
          <div v-else :data-field="key" :data-game-id="row.gameId" :data-state="row.stateKey">
            <template v-if="key === 'state'"><ElTag :type="stateTags[row.stateKey]">{{ row.state }}</ElTag><ElTag v-if="row.rejected" data-field="rejected" type="danger">已駁回</ElTag></template>
            <template v-else-if="key === 'created'">{{ time(row.createdAt) }}</template><template v-else-if="key === 'state-time'">{{ time(row.stateTime) }}</template>
            <div v-else-if="key === 'actions'" class="account-row-actions"><ElButton data-action="approve" :disabled="busy || row.approveDisabled" :title="row.approveHint" @click="approve(row)">同意上架</ElButton><ElButton data-action="reject" :title="row.rejectHint" :disabled="busy || row.rejectDisabled" @click="reject(row)">拒絕</ElButton><ElButton data-action="delete" :title="row.deleteHint" :disabled="busy || row.deleteDisabled" @click="askDelete(row)">刪除</ElButton><ElButton data-action="history" :disabled="busy || row.historyDisabled" @click="actions.history(row.gameId)">{{ row.historyOpen ? '收起發布歷史' : '發布歷史' }}</ElButton></div>
            <template v-else>{{ row[key] }}</template>
          </div>
        </template>
      </ElTableColumn>
      <template #empty>目前沒有待審核的遊戲。按「重新整理」可再讀一次。</template>
    </ElTable>
    <p id="review-result">{{ model.result }}</p>
    <!-- 物理刪除遮罩：確認（紅字警告）→ 正在刪除 → 完成／部分完成／失敗；完成後 3 秒自動收起。 -->
    <ElDialog v-if="overlay" id="review-overlay" :model-value="true" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" :aria-busy="overlay.phase === 'running'">
        <template v-if="overlay.phase === 'confirm'">
          <p id="review-overlay-title">物理刪除「{{ overlay.name }}」？</p>
          <p id="review-overlay-line">這是<b>物理刪除</b>：以下範圍如有資料將被徹底清除，不可恢復，也沒有復原入口；玩家本機存檔不受影響。</p>
          <ElTable id="review-overlay-scopes" :data="purgeScopes" :show-header="false"><ElTableColumn><template #default="{ row: scope, $index: i }"><strong>{{ i + 1 }}. {{ scope.title }}</strong><p>{{ scope.detail }}</p></template></ElTableColumn></ElTable>
          <div class="module-toolbar">
            <ElButton id="review-overlay-cancel" @click="closeOverlay()">取消</ElButton>
            <ElButton id="review-overlay-confirm" type="danger" @click="confirmDelete()">確認物理刪除</ElButton>
          </div>
        </template>
        <template v-else>
          <p id="review-overlay-title">{{ overlay.phase === 'running' ? '正在刪除，請等待…' : (overlay.phase === 'done' ? '刪除完成' : (overlay.phase === 'partial' ? '刪除未完全完成' : '刪除失敗')) }}</p>
          <p id="review-overlay-line">{{ overlay.phase === 'running' ? '正在刪除資料列並撤下線上入口；关闭本弹窗不影响继续执行。' : overlay.line }}</p>
          <ElTable v-if="overlay.scopes" id="review-overlay-scopes" :data="overlay.scopes" :show-header="false"><ElTableColumn><template #default="{ row: scope, $index: i }"><strong>{{ i + 1 }}. {{ scope.title }} <ElText v-if="scope.note" :type="scope.state === 'cleared' ? 'success' : scope.state === 'failed' ? 'danger' : scope.state === 'doing' ? 'primary' : 'info'">{{ scope.note }}</ElText></strong><p>{{ scope.detail }}</p></template></ElTableColumn></ElTable>
          <ElButton id="review-overlay-close" @click="closeOverlay()">關閉</ElButton>
        </template>
    </ElDialog>
  </section>
</template>
