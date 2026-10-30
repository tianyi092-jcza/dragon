<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
function select(event) { props.actions.select(event.target.value); event.target.value = props.model.selected ?? ''; }
</script>
<template>
  <section id="publish-editor" class="module-card">
    <h3>發布（作者定版；上架需管理員）</h3>
    <p>本地定版、分發確認與上架分別處理。首次發布仍需管理員上架；已上架遊戲發布新版後保持上架。新版不能讀取舊版存檔；確認更新後舊局停止且禁存，不熱換資源。</p>
    <ElButton id="publish-games-refresh" :disabled="busy || model.locked" @click="actions.refresh()">讀取自己的遊戲</ElButton>
    <label>遊戲<select id="publish-game" :value="model.selected" :disabled="busy || model.locked" @change="select"><option v-if="model.selected && !model.games.some(g => g.gameId === model.selected)" :value="model.selected" disabled>目前遊戲：{{ model.selected }}（本面板未列出，請讀取清單）</option><option v-for="game in model.games" :key="game.gameId" :value="game.gameId">{{ game.label }}</option></select></label>
    <ElButton id="publish-versions-refresh" :disabled="busy || model.readDisabled" @click="actions.versions()">讀取正式版本</ElButton>
    <div id="publish-versions"><p v-if="!model.versions.length">尚未讀取或尚無正式版本。</p><p v-for="(line, index) in model.versions" :key="index">{{ line }}</p></div>
    <form id="publish-form" @submit.prevent="actions.publish()"><label>發布名稱（最多8碼點）<input id="publish-name" maxlength="1024" :value="model.name" :disabled="busy || model.locked" @input="actions.setName($event.target.value)"></label><ElButton id="publish-button" native-type="submit" :disabled="busy || model.publishDisabled">定版發布</ElButton></form>
    <p id="publish-operation">{{ model.operation }}</p>
    <ElButton id="publish-query" :disabled="busy || model.queryDisabled" @click="actions.query()">查詢原發布與分發狀態</ElButton>
    <ElButton id="publish-retry" :disabled="busy || model.retryDisabled" @click="actions.retry()">明確同鍵同名稱重試</ElButton>
    <ElButton id="publish-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">只停止本機發布追蹤</ElButton>
    <p>遊戲選擇與資料／據點／武將／地圖同步；這只改變下一次發布的目標。原追蹤操作仍按下方顯示的原目標查詢／重試，不會跟著改鍵或名稱。本分頁保存原名稱與請求鍵，不存憑據或草稿。重載不自動發布；未知回應先查詢，404不代表已取消。同鍵重試若尚未提交，仍須校驗當時的已保存草稿。已確認分發是歷史觀察，不代表目前仍上架。</p>
    <div id="publish-result"><p v-if="model.result">{{ model.result }}</p></div><p id="publish-message" role="status">{{ model.message }}</p>
    <h4>公告預覽</h4><ElButton id="publish-ann-preview" :disabled="busy || model.readDisabled" @click="actions.preview()">預覽本站公告</ElButton><div id="publish-announcement"><p v-if="model.announcement">{{ model.announcement }}</p></div>
  </section>
</template>
