<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { ElForm } from 'element-plus/es/components/form/index.mjs';
import ChapterRolesPanel from './ChapterRolesPanel.vue';
defineProps({ model: Object, actions: Object, busy: Boolean });
const resourceFields = [['money', '資金'], ['reserve_cav', '騎兵'], ['reserve_arc', '弓兵'], ['reserve_inf', '步兵']];
const page = model => model.copy?.page ?? null;
function choose(value, actions) { actions.chooseGame(value); }
function gapText(chapter) {
  if (!chapter.gaps) return '尚未检验';
  return chapter.gaps.details.active.length ? `检验 ${chapter.gaps.details.active.length} 项` : '检验通过';
}
</script>

<template>
  <section id="draft-editor" class="module-card">
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
    <form id="draft-save" class="module-form" @submit.prevent="actions.saveCopyPage()">
      <label>名稱<ElInput id="draft-name" required maxlength="1024" :model-value="model.fields.name" :disabled="busy || !page(model) || page(model).editLocked" @input="actions.setCopyField('name', $event)" /></label>
      <label>簡介<ElInput id="draft-introduction" maxlength="1024" :model-value="model.fields.introduction" :disabled="busy || !page(model) || page(model).editLocked" @input="actions.setCopyField('introduction', $event)" /></label>
      <p>名稱trim／NFC後1～8個碼點、簡介最多1024個；與下方四資源修改一起按模組保存，只寫本模組，不拦其它模組。成功後自動重讀副本。</p>
      <ElButton id="draft-save-button" type="primary" native-type="submit" :disabled="busy || !page(model) || page(model).editLocked">保存資料與資源</ElButton>
      <ElButton id="draft-cancel-edits" :disabled="busy || !page(model) || page(model).cancelLocked" @click="actions.cancelCopyEdits()">取消資料與資源編輯</ElButton>
      <p>取消只恢復本頁名稱、簡介和所有章節四資源到已讀副本，不重新讀取、不保存。</p>
    </form>
    <h3>章節管理</h3>
    <p>新增空白／複製本遊戲章節（地圖共用，不產生獨立地圖）；刪除僅影響副本；副本可暫無章節，但屆時禁止發布。模組缺口不攔保存，只在發布頁紅字列出。</p>
    <div id="draft-chapters">
      <ElTable :data="page(model)?.chapters ?? []" row-key="chapterId" :show-header="false"><ElTableColumn min-width="420"><template #default="{ row: chapter }">
        <div :data-chapter-id="chapter.chapterId"><strong>{{ chapter.name }}</strong><p>{{ chapter.chapterId }}</p><ElTag effect="plain">{{ gapText(chapter) }}</ElTag>
          <p class="chapter-start-date">開局日期（唯讀）：<span v-if="chapter.startDate">{{ chapter.startDate.year }}年 {{ chapter.startDate.month }}月 {{ chapter.startDate.day }}日</span><span v-else>未提供／未知</span>。僅為已讀副本的來源值，不補預設日期，也不代表可玩准入。</p>
          <details class="chapter-gap-details"><summary>查看章節檢驗定位</summary>
            <p v-if="!chapter.gaps">尚未檢驗：載入副本後請到發布頁檢驗，問題會在此按章列出。</p>
            <template v-else>
              <p v-if="!chapter.gaps.details.active.length">本次檢驗沒有此章缺項。</p>
              <ElTable v-if="chapter.gaps.details.active.length" :data="chapter.gaps.details.active" :show-header="false"><ElTableColumn><template #default="{ row: gap }"><code>{{ gap.code }}／{{ gap.subject }}</code>：{{ gap.description }}</template></ElTableColumn></ElTable>
            </template>
          </details>
        </div>
      </template></ElTableColumn><ElTableColumn min-width="320"><template #default="{ row: chapter }">
        <div class="module-toolbar">
          <ElButton :disabled="busy || !page(model) || page(model).editLocked" @click="actions.copyChapter('copy', chapter.chapterId)">複製本章</ElButton>
          <ElButton :disabled="busy || !page(model) || page(model).editLocked" @click="actions.copyChapter('rename', chapter.chapterId)">改名</ElButton>
          <ElButton :disabled="busy || !page(model) || page(model).editLocked" @click="actions.copyChapter('delete', chapter.chapterId)">刪除本章</ElButton>
        </div>
      </template></ElTableColumn><template #empty>尚未載入章節，或此副本沒有章節。</template></ElTable>
      <form id="draft-chapter-create" class="module-form" @submit.prevent="actions.createCopyChapter()">
        <h4>新增章節</h4>
        <p id="draft-chapter-create-hint">{{ page(model)?.create.hint ?? '未載入副本，不能新增章節。' }}</p>
        <label>章名<ElInput id="draft-chapter-create-name" required maxlength="40" :model-value="page(model)?.create.name ?? ''" :disabled="busy || !page(model) || page(model).create.locked" @input="actions.setChapterCreateField('name', $event)" /></label>
        <label>紀年<ElSelect id="draft-chapter-create-era" :model-value="page(model)?.create.era ?? 'ad'" :disabled="busy || !page(model) || page(model).create.locked" @change="actions.setChapterCreateField('era', $event)"><ElOption value="ad" label="公元" /><ElOption value="bc" label="公元前" /></ElSelect></label>
        <label>年<ElInput id="draft-chapter-create-year" inputmode="numeric" maxlength="5" :model-value="page(model)?.create.year ?? ''" :disabled="busy || !page(model) || page(model).create.locked" @input="actions.setChapterCreateField('year', $event)" /></label>
        <label>月<ElInput id="draft-chapter-create-month" inputmode="numeric" maxlength="2" :model-value="page(model)?.create.month ?? ''" :disabled="busy || !page(model) || page(model).create.locked" @input="actions.setChapterCreateField('month', $event)" /></label>
        <label>日<ElInput id="draft-chapter-create-day" inputmode="numeric" maxlength="2" :model-value="page(model)?.create.day ?? ''" :disabled="busy || !page(model) || page(model).create.locked" @input="actions.setChapterCreateField('day', $event)" /></label>
        <ElButton id="draft-chapter-create-submit" type="primary" native-type="submit" :disabled="busy || !page(model) || page(model).create.locked">新增章節</ElButton>
        <p>章名 trim／NFC 後最多 16 個碼點；年代只接受整數（年 1～9999、月 1～12、日 1～31）。
          新增章節會帶入固定源第 1 章同槽據點記錄與 128 個武將槽，所屬勢力為空；地圖與據點基礎資料共用本遊戲，不另建地圖。
          保存成功後清單才出現新章；缺口計數隨下次檢驗更新。</p>
      </form>
    </div>
    <ChapterRolesPanel :model="model" :actions="actions" :busy="busy" />
    <h3>章與四資源</h3>
    <p>只修改既有章節勢力；資金為 −8388608～8388607，三種預備兵為 0～65535。這是表示範圍，不代表可玩准入。每次最多修改32筆勢力；切換章節不丟棄輸入，保存走副本模組。</p>
    <div id="draft-resources"><details v-for="chapter in page(model)?.resources ?? []" :key="chapter.chapterId" :data-resource-chapter="chapter.chapterId"><summary>{{ chapter.name }}</summary>
      <ElForm v-for="faction in chapter.factions" :key="faction.slot" :data-resource-slot="faction.slot" :disabled="busy || !page(model) || page(model).editLocked">
        <h4>勢力槽 {{ faction.slot }}</h4>
        <label v-for="[key, label] in resourceFields" :key="label">{{ label }}<ElInput form="draft-save" :name="key" inputmode="numeric" :model-value="faction.inputs[key]" @input="actions.setCopyResource(chapter.chapterId, faction.slot, key, $event)" /></label>
      </ElForm>
    </details></div>
  </section>
</template>
