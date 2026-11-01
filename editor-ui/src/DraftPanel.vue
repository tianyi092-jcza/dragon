<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import ChapterRolesPanel from './ChapterRolesPanel.vue';
defineProps({ model: Object, actions: Object, busy: Boolean, copyModel: Object, copyActions: Object });
const resourceFields = [['money', '資金'], ['reserve_cav', '騎兵'], ['reserve_arc', '弓兵'], ['reserve_inf', '步兵']];
function choose(event, actions, model) {
  actions.chooseGame(event.target.value);
  // A cancelled dirty switch must restore the native select immediately.
  event.target.value = model.fields.gameId;
}
</script>

<template>
  <section id="draft-editor" class="module-card">
    <h2>遊戲管理</h2>
    <p>先選遊戲並載入明確已保存修訂；清單刷新不會替換正在編輯的資料。</p>
    <div class="module-toolbar">
      <ElButton id="draft-games-refresh" :disabled="busy || model.locked" @click="actions.refresh()">查看自己的遊戲</ElButton>
      <label>遊戲<select id="draft-game" :value="model.fields.gameId" :disabled="busy || model.gameLocked" @change="choose($event, actions, model)"><option v-if="model.selectionMissing" :value="model.fields.gameId" disabled>保留上下文：{{ model.fields.gameId }}（本次清單未列出）</option><option v-for="game in model.games" :key="game.gameId" :value="game.gameId">{{ game.name }}／清單修訂 {{ game.draftRevision }}</option></select></label>
      <label>明確已保存修訂<input id="draft-revision" inputmode="numeric" maxlength="64" :value="model.fields.revision" :disabled="busy || model.loadLocked" @input="actions.setField('revision', $event.target.value)"></label>
      <ElButton id="draft-load" :disabled="busy || model.loadLocked" @click="actions.load()">載入／放棄未保存資料</ElButton>
    </div>
    <details id="draft-list-times" open>
      <summary>遊戲清單（時間為UTC）</summary>
      <p>以下為最近一次清單回應；保存後可手動刷新。清單更新不替換已載入修訂或未保存輸入，缺時間顯示未記錄。</p>
      <div class="entity-table-wrap"><table class="entity-table"><thead><tr><th>遊戲／清單修訂</th><th>建立時間</th><th>修改時間</th><th>簡介</th><th>建立者帳號</th></tr></thead><tbody>
        <tr v-for="game in model.games" :key="game.gameId" :data-game-id="game.gameId"><td>{{ game.name }}／{{ game.draftRevision }}</td><td>{{ game.createdAt ?? '未記錄' }}</td><td>{{ game.modifiedAt ?? '未記錄' }}</td><td>{{ game.introduction }}</td><td>{{ game.creator ?? '未記錄' }}</td></tr>
      </tbody></table></div>
    </details>
    <section v-if="copyModel?.visible" id="draft-full-copy" class="module-form">
      <h3>複製遊戲（管理員）</h3>
      <p>地圖＋章節＋武將全套複製，產生原章完整副本；與「新建遊戲」只複製地圖不同。來源固定為已登記的底層資源，不選 registry。</p>
      <label>名稱<input id="full-copy-name" maxlength="1024" :value="copyModel.name" :disabled="busy || copyModel.locked" @input="copyActions.setField('name', $event.target.value)"></label>
      <label>簡介<input id="full-copy-introduction" maxlength="1024" :value="copyModel.introduction" :disabled="busy || copyModel.locked" @input="copyActions.setField('introduction', $event.target.value)"></label>
      <ElButton id="full-copy-create" type="primary" :disabled="busy || copyModel.createDisabled" @click="copyActions.create()">{{ copyModel.resume ? '複製遊戲（續）' : '複製遊戲' }}</ElButton>
      <p id="full-copy-message" role="status">{{ copyModel.message }}</p>
    </section>
    <p id="draft-context">{{ model.context ? `${model.context.gameId}／已保存修訂 ${model.context.draftRevision}${model.context.dirty ? '／有未保存修改' : ''}` : '未載入私有草稿' }}</p>
    <p id="draft-status" class="module-notice" role="status">{{ model.message }}</p>
    <form id="draft-save" class="module-form" @submit.prevent="actions.save()">
      <label>名稱<input id="draft-name" required maxlength="1024" :value="model.fields.name" :disabled="busy || model.editLocked" @input="actions.setField('name', $event.target.value)"></label>
      <label>簡介<input id="draft-introduction" maxlength="1024" :value="model.fields.introduction" :disabled="busy || model.editLocked" @input="actions.setField('introduction', $event.target.value)"></label>
      <p>名稱trim／NFC後最多8個碼點、簡介20個；不以輸入前的UTF-16長度截斷作者文字。與下方四資源修改一起手動保存；不修改其他原生欄位。</p>
      <ElButton id="draft-save-button" type="primary" native-type="submit" :disabled="busy || model.editLocked">保存資料與資源</ElButton>
      <ElButton id="draft-cancel-edits" :disabled="busy || model.cancelLocked" @click="actions.cancelEdits()">取消資料與資源編輯</ElButton>
      <p>取消只恢復本頁名稱、簡介和所有章節四資源到已讀值，不重新GET、不保存；人物表單與地圖準備保持。未確認保存操作須先查詢原鍵，不能用取消略過。</p>
    </form>
    <div class="module-toolbar">
      <ElButton id="draft-operation-query" :disabled="busy || model.queryLocked" @click="actions.query()">查詢原保存操作</ElButton>
      <ElButton id="draft-operation-retry" :disabled="busy || model.retryLocked" @click="actions.retry()">明確重試原請求</ElButton>
    </div>
    <p>保存回應失去時不另起鍵或自動重試。重新載入只記操作鍵與目標修訂，不保留作者輸入；沒有原請求內容時不能重造同鍵保存。</p>
    <div class="module-toolbar">
      <label>試運行章<select id="draft-trial-chapter" :value="model.fields.chapterId" :disabled="busy || model.locked || !model.chapters.length" @change="actions.setField('chapterId', $event.target.value)"><option v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }}</option></select></label>
      <ElButton id="draft-trial-start" :disabled="busy || model.trialLocked" @click="actions.trial()">測試運行本章</ElButton>
    </div>
    <p>草稿試運行僅記憶體、不寫正式存檔；須已載入明確修訂且無未確認操作。</p>
    <h3>章節管理</h3>
    <p>新增空白／複製本遊戲章節（地圖共用，不產生獨立地圖）；刪除僅影響草稿；草稿可暫無章節，但屆時禁止發布。保存缺口擋保存，發布缺口擋發布／試運行。</p>
    <div id="draft-chapters">
      <div v-for="chapter in model.chapters" :key="chapter.chapterId" class="chapter-row" :data-chapter-id="chapter.chapterId">
        <div><strong>{{ chapter.name }}</strong><p>{{ chapter.chapterId }}</p><ElTag effect="plain">保存缺口 {{ chapter.gaps.saveGaps }}／發布缺口 {{ chapter.gaps.activeGaps }}</ElTag>
          <p class="chapter-start-date">開局日期（唯讀）：<span v-if="chapter.startDate">{{ chapter.startDate.year }}年 {{ chapter.startDate.month }}月 {{ chapter.startDate.day }}日</span><span v-else>未提供／未知</span>。僅為已讀修訂的來源值，不補預設日期，也不代表可玩准入。</p>
          <details class="chapter-gap-details"><summary>查看章節校驗定位</summary>
            <p>只列目前章節欄位校驗；不含資源、道路或原證門檻。零缺口不代表可試運行或發布。位置中的編號為目前資料陣列位置，不是跨章人物身份。</p>
            <p v-if="!chapter.gaps.details">未提供校驗明細，不能視為沒有缺項。</p>
            <template v-else>
              <div v-for="[kind, label, omitted] in [['save', '保存缺口', 'omittedSave'], ['active', '發布／試運行缺口', 'omittedActive']]" :key="kind">
                <h4>{{ label }}</h4>
                <p v-if="!chapter.gaps.details[kind].length">本次欄位校驗沒有此類缺項。</p>
                <ul><li v-for="(gap, index) in chapter.gaps.details[kind]" :key="index"><code>{{ gap.code }}／{{ gap.subject }}</code>：{{ gap.description }}<span v-if="!gap.recognized">（診斷類型尚待核查）</span></li></ul>
                <p v-if="chapter.gaps.details[omitted]">另有 {{ chapter.gaps.details[omitted] }} 項未展示；請修正後重新讀取。</p>
              </div>
            </template>
          </details>
          <details class="chapter-asset-details"><summary>查看Trial肖像／據點圖檢查<span v-if="chapter.gaps.assets">（缺口 {{ chapter.gaps.assets.total }}）</span></summary>
            <p>沿用目前Trial啟動門，只檢查本章state已宣告的肖像／據點圖引用；槽號不是跨章人物身份。零缺口不代表完整資源閉包、原證、初始化或可玩准入。這裡不下載圖片或修補引用。</p>
            <p v-if="!chapter.gaps.assets">未提供此項檢查，不能視為沒有缺項。</p>
            <template v-else>
              <p v-if="!chapter.gaps.assets.total">目前限定啟動門未報告這兩類引用缺口。</p>
              <ul><li v-for="(gap, index) in chapter.gaps.assets.items" :key="index">{{ gap.kind === 'kao' ? '武將肖像' : '據點圖' }}／槽 {{ gap.slot ?? '未知' }}／值 {{ gap.value ?? '未知' }}：<code>{{ gap.logicalURL ?? '未提供路徑' }}</code></li></ul>
              <p v-if="chapter.gaps.assets.omitted">另有 {{ chapter.gaps.assets.omitted }} 項未展示；請修正後重新讀取。</p>
            </template>
          </details>
        </div>
        <div class="module-toolbar">
          <ElButton data-chapter-trial :disabled="busy || model.trialLocked" @click="actions.trial(chapter.chapterId)">選擇並測試本章</ElButton>
          <ElButton :disabled="busy || model.editLocked" @click="actions.chapter('copy', chapter.chapterId)">複製本章</ElButton>
          <ElButton :disabled="busy || model.editLocked" @click="actions.chapter('rename', chapter.chapterId)">改名</ElButton>
          <ElButton :disabled="busy || model.editLocked" @click="actions.chapter('delete', chapter.chapterId)">刪除本章</ElButton>
        </div>
      </div>
      <p v-if="!model.chapters.length" class="empty-state">尚未載入章節，或此修訂沒有章節。</p>
      <ElButton :disabled="busy || model.editLocked" @click="actions.chapter('add-blank')">新增空白章節</ElButton>
    </div>
    <ChapterRolesPanel :model="model" :actions="actions" :busy="busy" />
    <h3>章與四資源</h3>
    <p>只修改既有章節勢力；資金為 −8388608～8388607，三種預備兵為 0～65535。這是表示範圍，不代表可玩准入。每次最多修改32筆勢力；切換章節不丟棄輸入，保存按已載入修訂進行。</p>
    <div id="draft-resources"><details v-for="chapter in model.resources" :key="chapter.chapterId" :data-resource-chapter="chapter.chapterId"><summary>{{ chapter.name }}</summary>
      <fieldset v-for="faction in chapter.factions" :key="faction.slot" :data-resource-slot="faction.slot" :disabled="busy || model.editLocked">
        <legend>勢力槽 {{ faction.slot }}</legend>
        <label v-for="[key, label] in resourceFields" :key="key">{{ label }}<input form="draft-save" :name="key" inputmode="numeric" :value="faction.inputs[key]" @input="actions.setResource(chapter.chapterId, faction.slot, key, $event.target.value)"></label>
      </fieldset>
    </details></div>
  </section>
</template>
