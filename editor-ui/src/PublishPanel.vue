<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElText } from 'element-plus/es/components/text/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const stateTags = { draft: 'info', pending: 'warning', listed: 'success' };
const time = value => value === '—' ? value : new Date(value).toLocaleString();
const overlay = ref(null), elapsed = ref(0), checking = ref(false);
let ticker = null, closer = null;
const stop = () => { if (ticker) { clearInterval(ticker); ticker = null; } if (closer) { clearTimeout(closer); closer = null; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// 阻塞遮罩：只針对「正在跑的那一个动作」。不管结果如何，最后都要关掉回到正常页面。
function open(title) { stop(); overlay.value = { title, line: '', failed: false }; elapsed.value = 0; ticker = setInterval(() => { elapsed.value++; }, 1000); }
function close() { stop(); overlay.value = null; checking.value = false; }
// 单 POST 无分步进度：检查中整表统一显示 ▶，不假装逐项推进。
async function attached(title, run) {
  open(title);
  try { await run(); close(); }
  catch (error) {
    // 失敗或逾時：遮罩留在原處說明原因，按「關閉」才收；同樣的句子也會留在面板訊息裡。
    overlay.value = { title, line: (error && error.message) || '處理未完成（原因未回報）。', failed: true };
    if (ticker) { clearInterval(ticker); ticker = null; }
  }
}
async function publish(row) {
  const text = (props.model.description ?? '').trim();
  if (![...text].length) { await ElMessageBox.alert('请先填写发布说明（1..2000 字），再送出上架申请。', '缺少发布说明', { type: 'warning' }); return; }
  try {
    await ElMessageBox.confirm(`上架申請會先校驗整個遊戲（全部章節與跨章引用）。通過後版本號自動 +1（本次 ${row.nextVersion}）並提交管理員審核；校驗失敗則狀態不變並列出錯誤。\n\n发布说明（${[...text].length}/2000）：\n${text}`, `上架申請「${row.name}」`, { type: 'warning', confirmButtonText: '送出申請', cancelButtonText: '取消' });
  } catch { return; }
  await attached('正在送出上架申請…', () => props.actions.publish(row.gameId));
}
async function check(row) {
  if (props.busy || props.model.checkDisabled) return;
  open(`正在檢驗「${row.name}」…`);
  checking.value = true;
  try { await props.actions.check(row.gameId); }
  catch (error) {
    // 檢驗沒拿到結果：就地把原因寫在這一層視窗，不另開第二個窗。
    overlay.value = { title: `正在檢驗「${row.name}」…`, line: (error && error.message) || '檢驗未完成（原因未回報）。', failed: true };
    if (ticker) { clearInterval(ticker); ticker = null; }
    return;
  }
  // 四层→动态清单：遮罩里始终列出检验项；有结论才变 ✓/✗，全部通过才关窗。
  if (props.model.validationPassed) { await sleep(600); close(); return; }
  // 失败且确有红字明细才提红字；无明细（请求层失败）时只说原因，不指不存在的红字。
  if (ticker) { clearInterval(ticker); ticker = null; }
  const bad = (props.model.validationLayers ?? []).filter(layer => layer.done && !layer.ok);
  overlay.value = bad.length
    ? { title: `檢驗「${row.name}」未通過`, line: `請依下方紅字修正後重新檢驗（${bad.map(layer => layer.title).join('、')}未通過）；修正前上架申請按鈕保持不可用。`, failed: true }
    : { title: `檢驗「${row.name}」未拿到明细`, line: '检验请求没有返回可列出的明细（见面板消息）；修正网络或服务端问题后重新检验。', failed: true };
}
</script>

<template>
  <section id="publish-editor" class="module-card">
    <div class="module-toolbar">
      <ElButton id="publish-refresh" :disabled="busy || model.refreshDisabled" @click="actions.refresh()">刷新</ElButton>
    </div>
    <p id="publish-message" role="status">{{ model.message }}</p>
    <div class="module-toolbar">
      <label style="flex:1">发布说明<ElInput :model-value="model.description" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="必填，1..2000 字，随所选行的上架申请一起提交" :disabled="busy" @input="actions.setDescription($event)" /></label>
    </div>
    <ElTable id="publish-table" :data="model.rows" row-key="gameId">
      <ElTableColumn v-for="[key, title] in [['name','遊戲名稱'],['introduction','說明'],['version','版本號'],['state','狀態'],['validation','檢驗'],['created','創建時間'],['state-time','狀態時間'],['actions','操作']]" :key="key" :label="title" :min-width="key === 'actions' ? 240 : 180">
        <template #default="{ row }"><div :data-field="key" :data-game-id="row.gameId" :data-state="row.stateKey">
          <template v-if="key === 'state'"><ElTag :type="stateTags[row.stateKey]">{{ row.state }}</ElTag><ElTag v-if="row.rejected" data-field="rejected" type="danger">已駁回</ElTag></template>
          <div v-else-if="key === 'validation'" :data-validation="row.validationKey" :title="row.publishHint">{{ row.validation }}<br><small>{{ row.validationTime }}</small></div>
          <template v-else-if="key === 'created'">{{ time(row.createdAt) }}</template><template v-else-if="key === 'state-time'">{{ time(row.stateTime) }}</template>
          <div v-else-if="key === 'actions'" class="account-row-actions"><ElButton data-action="check" :disabled="busy || model.checkDisabled" @click="check(row)">校驗</ElButton><ElButton data-action="publish" :title="row.publishHint" :disabled="busy || row.publishDisabled" @click="publish(row)">上架申請</ElButton></div>
          <template v-else>{{ row[key] }}</template>
        </div></template>
      </ElTableColumn>
      <template #empty>尚未讀取清單，或此帳戶沒有可上架的遊戲。請在「新建遊戲」建立，或按「刷新」。</template>
    </ElTable>
    <p id="publish-result">{{ model.result }}</p>
    <ElDialog v-if="overlay" id="publish-overlay" :model-value="true" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" aria-busy="true">
        <p id="publish-overlay-text">{{ overlay.title }}</p>
        <!-- 检验清单：常驻两项；检查中统一 ▶，无结果时 ·，有结论 ✓/✗；未知码追加在后 -->
        <ElTable v-if="model.validationLayers?.length" id="publish-validation-layers" :data="model.validationLayers" :show-header="false"><ElTableColumn><template #default="{ row: layer }"><div :data-layer="layer.key" :data-layer-code="layer.code" :data-layer-ok="layer.done ? String(layer.ok) : 'pending'" :data-layer-done="layer.done">
          <ElText :type="layer.done ? (layer.ok ? 'success' : 'danger') : (checking ? 'primary' : 'info')">{{ layer.done ? (layer.ok ? '✓' : '✗') : (checking ? '▶ 检查中' : '· 未检验') }} {{ layer.title }}</ElText>
          <template v-if="layer.done && !layer.ok"><p v-for="failure in layer.failures" :key="failure.chapterId + failure.detail"><ElText type="danger">{{ failure.name }}：{{ failure.detail }}</ElText></p></template>
        </div></template></ElTableColumn></ElTable>
        <!-- 上架只送一次 POST，提交后轮询 slot 状态；无多段进度。 -->
        <!-- 第二行：處理過程；失敗或逾時就在這一行說明原因 -->
        <p id="publish-overlay-line">{{ overlay.failed ? overlay.line : (model.phase || '正在處理…') }}</p>
        <small id="publish-overlay-elapsed">{{ overlay.failed ? '上面這句話也會留在面板訊息裡' : '已用 ' + elapsed + ' 秒；完成後會自動關閉，也可以切到別的頁面' }}</small>
        <p v-if="overlay.failed"><ElButton id="publish-overlay-close" @click="close">關閉</ElButton></p>
    </ElDialog>
  </section>
</template>
