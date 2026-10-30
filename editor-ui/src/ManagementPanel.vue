<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean, currentGame: String });
const onlyCurrent = ref(false);
const games = computed(() => onlyCurrent.value ? props.model.games.filter(game => game.gameId === props.currentGame) : props.model.games);
watch(() => props.currentGame, id => { if (!id) onlyCurrent.value = false; });
</script>
<template>
  <section id="management-editor" class="module-card">
    <h3>管理上架、下架與限制</h3>
    <p>僅管理員可上架已發布的正式版本，不修改或發布他人草稿。下架同時限制；解除仍保持下架，須另行上架。內置遊戲不提供寫入操作。本地管理標記不等於玩家已可見。</p>
    <ElButton id="management-load" :disabled="busy || model.locked" @click="actions.refresh()">明確讀取目前管理清單</ElButton>
    <p id="management-current-game">目前編輯遊戲：{{ currentGame || '未選擇' }}。僅用於定位清單，不提供編輯權限，也不更換原管理操作目標或修訂。</p>
    <label><input id="management-current-only" v-model="onlyCurrent" type="checkbox" :disabled="busy || model.locked || !currentGame">只顯示目前編輯遊戲（不重新讀取）</label>
    <p v-if="onlyCurrent && !games.length" id="management-current-missing">已讀清單沒有此遊戲；請明確讀取管理清單，不據此判定已刪除。</p>
    <div id="management-games"><div v-for="game in games" :key="game.gameId" :data-game-id="game.gameId"><p>{{ game.label }}</p><ElButton v-for="action in game.actions" :key="action.action" :disabled="busy || action.disabled" @click="actions.start(game.gameId, game.rowRevision, action.action)">{{ action.label }}</ElButton></div></div>
    <p id="management-operation">{{ model.operation }}</p>
    <ElButton id="management-query" :disabled="busy || model.queryDisabled" @click="actions.query()">查詢原管理操作與分發狀態</ElButton>
    <ElButton id="management-retry" :disabled="busy || model.retryDisabled" @click="actions.retry()">明確同鍵同body與原修訂重試</ElButton>
    <ElButton id="management-forget" :disabled="busy || model.forgetDisabled" @click="actions.forget()">只停止本機操作追蹤</ElButton>
    <p id="management-result">{{ model.result }}</p><p id="management-message" role="status">{{ model.message }}</p>
    <p>未知回應保留原操作者、遊戲、key、動作、body及If-Match。重載不發管理POST；404不表示請求已取消，不自動重試／另鍵／回滾。本地提交、歷史分發確認及目前遠端狀態不同；沒有新增分發也不表示目前已同步。回執確認後仍保留原鍵，須明確停止追蹤才可另起操作。重載不自動查詢；停止本機追蹤不取消或清理永久SQL。</p>
  </section>
</template>
