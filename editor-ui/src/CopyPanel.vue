<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
</script>
<template>
  <section id="copy" class="module-card">
    <h3>{{ model.author ? '建立中立遊戲' : '完整複製內置遊戲' }}</h3>
    <p v-if="model.author">使用管理員已登記的固定來源，新建保留基礎地圖、道路、據點定義及空白首章；不複製原版人物／勢力。尚不可試運行或發布，仍須完成資料與准入校驗。</p>
    <p v-else>固定來源須先由操作員以 --stage-source 裝配。來源登記與完整複製只允許管理員；不修改內置原件。</p>
    <ElButton id="source-refresh" :disabled="busy || model.sourceLocked" @click="actions.refreshSource()">查看來源</ElButton>
    <ElButton id="source-install" :disabled="busy || model.sourceLocked" @click="actions.installSource()">驗證並登記固定來源</ElButton>
    <p id="source-state">{{ model.sourceState }}</p>
    <form id="copy-create" @submit.prevent="actions.create()">
      <label>遊戲名稱<input name="name" required maxlength="1024" :value="model.name" :disabled="busy || model.locked" @input="actions.setField('name', $event.target.value)"></label>
      <label>簡介<input name="introduction" maxlength="1024" :value="model.introduction" :disabled="busy || model.locked" @input="actions.setField('introduction', $event.target.value)"></label>
      <ElButton native-type="submit" :disabled="busy || model.createDisabled">{{ model.author ? '預約中立新建' : '預約完整副本' }}</ElButton>
    </form>
    <p>名稱trim／NFC後最多8個碼點、簡介20個；不以輸入前的UTF-16長度截斷作者文字。預約與執行分開，離開後可查狀態並於租約到期後顯式恢復；不自動重試或另建遊戲。</p>
    <ElButton id="copy-refresh" :disabled="busy || model.locked" @click="actions.refresh()">查詢複製狀態</ElButton>
    <ElButton id="copy-run" :disabled="busy || model.runDisabled" @click="actions.run()">{{ model.author ? '執行／恢復新建' : '執行／恢復複製' }}</ElButton>
    <ElButton id="copy-cancel" :disabled="busy || model.cancelDisabled" @click="actions.cancel()">取消未完成複製</ElButton>
    <p id="copy-state">{{ model.copyState }}</p><p id="copy-message" role="status">{{ model.message }}</p>
    <h4>自己的草稿</h4>
    <p>上下架由管理員處理；已上架須先下架再刪除。刪除請求請到「刪除追蹤」保留原鍵；柵欄不等於物理清理完成，內置遊戲不可刪除。測試運行跳轉到草稿節載入後試玩，不寫正式存檔。</p>
    <div id="own-games">
      <div v-for="game in model.games" :key="game.gameId" :data-game-id="game.gameId">
        <p>{{ game.label }}</p><p>上下架與限制由管理員在管理面板操作；發布不等於上架。</p>
        <ElButton :disabled="busy || model.locked" @click="actions.gotoGame(game.gameId)">測試運行</ElButton>
        <ElButton :disabled="busy || model.locked" @click="actions.openDeletion(game.gameId)">查看刪除追蹤</ElButton>
      </div>
    </div>
  </section>
</template>
