<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean, active: { type: Boolean, default: true } });
const page = model => model.copy?.page ?? null;
function choose(value, actions) { actions.chooseGame(value); }
</script>

<template>
  <section id="draft-editor" class="module-card">
    <!-- 隱藏時保留控制器輸入；章節與勢力編輯統一由 ChaptersPanel 提供。 -->
    <template v-if="active">
    <p>先選遊戲並載入副本；清單刷新不會替換正在編輯的資料。</p>
    <div class="module-toolbar">
      <ElButton id="draft-games-refresh" :disabled="busy || model.locked" @click="actions.refresh()">查看自己的遊戲</ElButton>
      <label>遊戲<ElSelect id="draft-game" :model-value="model.selectionMissing ? '' : model.fields.gameId" :disabled="busy || model.gameLocked" @change="choose($event, actions)"><ElOption value="" disabled :label="model.selectionMissing ? '原遊戲已不在清單，請重新選擇' : '請選擇遊戲'" /><ElOption v-for="game in model.games" :key="game.gameId" :value="game.gameId" :label="game.name" /></ElSelect></label>
      <ElButton id="copy-load" :disabled="busy || model.locked || !model.fields.gameId" @click="actions.loadCopy()">載入副本／放棄未保存資料</ElButton>
    </div>
    <details id="draft-list-times" open>
      <summary>遊戲清單（時間為UTC）</summary>
      <p>以下為最近一次清單回應；保存後可手動刷新。清單更新不替換已載入副本或未保存輸入，缺時間顯示未記錄。</p>
      <ElTable :data="model.games" row-key="gameId"><ElTableColumn label="遊戲" min-width="180"><template #default="{ row: game }"><span :data-game-id="game.gameId">{{ game.name }}</span></template></ElTableColumn><ElTableColumn label="建立時間" min-width="200"><template #default="{ row: game }">{{ game.createdAt ?? '未記錄' }}</template></ElTableColumn><ElTableColumn label="修改時間" min-width="200"><template #default="{ row: game }">{{ game.modifiedAt ?? '未記錄' }}</template></ElTableColumn><ElTableColumn prop="introduction" label="簡介" min-width="180" /><ElTableColumn label="建立者帳號" min-width="160"><template #default="{ row: game }">{{ game.creator ?? '未記錄' }}</template></ElTableColumn></ElTable>
    </details>
    <p id="draft-context">{{ page(model) ? `${model.fields.gameId}／副本摘要 ${page(model).digest.slice(0, 12)}…${page(model).dirty ? '／有未保存修改' : ''}` : '未載入副本' }}</p>
    <p id="draft-status" class="module-notice" role="status">{{ model.message }}</p>
    <ElForm id="draft-save" class="module-form" label-position="top" :model="page(model)?.fields ?? {}" @submit.prevent="actions.saveCopyPage()">
      <ElFormItem label="名稱" prop="name"><ElInput id="draft-name" required maxlength="1024" :model-value="model.fields.name" :disabled="busy || !page(model) || page(model).editLocked" @input="actions.setCopyField('name', $event)" /></ElFormItem>
      <ElFormItem label="簡介" prop="introduction"><ElInput id="draft-introduction" maxlength="1024" :model-value="model.fields.introduction" :disabled="busy || !page(model) || page(model).editLocked" @input="actions.setCopyField('introduction', $event)" /></ElFormItem>
      <p>名稱trim／NFC後1～8個碼點，簡介最多1024個。保存成功後自動重讀副本。</p>
      <ElFormItem>
      <ElButton id="draft-save-button" native-type="submit" :disabled="busy || !page(model) || page(model).editLocked">保存資料</ElButton>
      <ElButton id="draft-cancel-edits" :disabled="busy || !page(model) || page(model).cancelLocked" @click="actions.cancelCopyEdits()">取消編輯</ElButton>
      </ElFormItem>
      <p>取消恢復已讀名稱與簡介，不重新讀取或保存。章節、勢力與開局資源請至「遊戲章節」編輯。</p>
    </ElForm>
    </template>
  </section>
</template>
