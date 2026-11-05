<script setup>
import { computed, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import LoginPage from './LoginPage.vue';
import AccountPages from './AccountPages.vue';
import AccountsPanel from './AccountsPanel.vue';
import DraftPanel from './DraftPanel.vue';
import ChaptersPanel from './ChaptersPanel.vue';
import StrongholdPanel from './StrongholdPanel.vue';
import MapPanel from './MapPanel.vue';
import CatalogPanel from './CatalogPanel.vue';
import GeneralsPanel from './GeneralsPanel.vue';
import CopyPanel from './CopyPanel.vue';
import CopyGamePanel from './CopyGamePanel.vue';
import PublishPanel from './PublishPanel.vue';
import ReviewPanel from './ReviewPanel.vue';
const props = defineProps({ state: Object, accountsModel: Object, accounts: Object, draftModel: Object, draft: Object, stageAssetsModel: Object, stageAssets: Object, stageJobsModel: Object, stageJobs: Object, libraryModel: Object, library: Object, strongholdModel: Object, stronghold: Object, mapviewModel: Object, mapview: Object, catalogModel: Object, catalog: Object, generalsModel: Object, generals: Object, copyModel: Object, copy: Object, fullCopyModel: Object, fullCopy: Object, publicationModel: Object, publication: Object, reviewModel: Object, review: Object, navigate: Function, logout: Function });
const accountsPanel = ref(null), mapPanel = ref(null);
defineExpose({ accountDirty: () => accountsPanel.value?.dirty() ?? false, mapInputs: () => Boolean(ready.value && mapPanel.value?.hasInputs()) });
const userMenu = ref(null);
const ready = computed(() => props.state.authenticated && !props.state.mustChange);
const menu = computed(() => props.state.views.filter(item => !item[2] || props.state.admin));
// 選單只有一級，分組只作標籤：工作台級（底層資源）→ 遊戲級 → 管理員專屬。
const groups = computed(() => {
  const labels = { workbench: '工作台級', game: '遊戲級', admin: '管理員' };
  return Object.entries(labels).map(([key, label]) => ({ key, label, items: menu.value.filter(item => item[3] === key) })).filter(group => group.items.length);
});
// 頂部選擇器是全局「當前遊戲」上下文；切換須經草稿控制器的未保存改動攔截。
function switchGame(event) {
  props.draft.chooseGame(event.target.value);
  event.target.value = props.draftModel.fields.gameId;
}
const title = computed(() => ({ profile: '個人資料', password: '變更密碼' }[props.state.view] || menu.value.find(item => item[0] === props.state.view)?.[1] || '工作台'));
function go(view) { if (userMenu.value) userMenu.value.open = false; props.navigate(view); }
</script>

<template>
  <div class="workbench" :class="{ 'auth-layout': !ready }">
    <header class="workbench-header">
      <a class="brand" href="#draft-editor" @click.prevent="go('draft-editor')"><span class="brand-mark">臥</span><span>臥龍傳<span class="brand-caption">創作工作台</span></span></a>
      <div class="current-game" :hidden="!ready">
        <span>當前遊戲</span>
        <select id="current-game" :value="draftModel.fields.gameId" :disabled="state.busy || draftModel.gameLocked" @change="switchGame">
          <option value="" disabled>{{ draftModel.selectionMissing ? '原遊戲已不在清單，請重新選擇' : (draftModel.games.length ? '請選擇遊戲' : '尚未載入遊戲清單') }}</option>
          <option v-for="game in draftModel.games" :key="game.gameId" :value="game.gameId">{{ game.name }}／修訂 {{ game.draftRevision }}</option>
        </select>
        <ElButton :disabled="state.busy || draftModel.locked" @click="draft.refresh()">重新整理</ElButton>
      </div>
      <div class="account-actions" :hidden="!state.authenticated">
        <ElTag :type="state.admin ? 'success' : 'info'" effect="plain">{{ state.admin ? '管理員' : '創作者' }}</ElTag>
        <span id="identity">{{ state.account }}{{ state.mustChange ? ' — 請先變更密碼' : '' }}</span>
        <details ref="userMenu" class="user-menu" :hidden="!ready">
          <summary>帳戶選單</summary>
          <div class="user-menu-items">
            <ElButton text @click="go('profile')" :disabled="state.busy">個人資料</ElButton>
            <ElButton text @click="go('password')" :disabled="state.busy">變更密碼</ElButton>
            <ElButton text @click="logout()" :disabled="state.busy">登出</ElButton>
          </div>
        </details>
        <ElButton id="logout" :disabled="state.busy">登出</ElButton>
      </div>
    </header>
    <aside id="menu" class="workbench-menu" :hidden="!ready" aria-label="編輯模組">
      <template v-for="group in groups" :key="group.key">
        <p class="nav-label">{{ group.label }}</p>
        <ElButton v-for="[id, label] in group.items" :key="id" :data-view="id" :class="{ on: state.view === id }" :aria-current="state.view === id ? 'page' : undefined" :disabled="state.busy" @click="go(id)">{{ label }}</ElButton>
      </template>
      <p class="nav-note">草稿與正式版本分離<br>遊戲規則共用同一引擎<br><a href="/shell-ui-licenses.txt" target="_blank" rel="noopener">第三方授權</a></p>
    </aside>
    <main class="workbench-main">
      <div class="page-heading" :hidden="!ready"><span>編輯後台 / {{ title }}</span><h1>{{ title }}</h1></div>
      <div id="workspace-context" class="workspace-context" :hidden="!ready || state.view === 'catalog-editor' || state.view === 'copy'">
        <span v-if="draftModel.context">目前草稿：{{ draftModel.context.name }}／{{ draftModel.context.gameId }}／修訂 {{ draftModel.context.draftRevision }}<strong v-if="draftModel.context.dirty">／有未保存修改</strong><strong v-if="draftModel.context.pending">／原操作未確認</strong><strong v-if="!draftModel.context.verified">／尚須明確載入</strong></span>
        <span v-else>目前未載入草稿；請在「遊戲管理」選擇明確修訂。</span>
        <small>僅顯示草稿上下文；其它模組已選的精確目標不會自動替換。</small>
      </div>
      <p id="status" role="status" aria-live="polite"></p>
      <LoginPage :hidden="state.authenticated" :busy="state.busy" />
      <section id="session" :hidden="!state.authenticated">
        <AccountPages :state="state" :ready="ready" />
        <AccountsPanel ref="accountsPanel" :model="accountsModel" :actions="accounts" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'admin'" />
        <DraftPanel :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'draft-editor'" />
        <ChaptersPanel :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'chapters-editor'" />
        <StrongholdPanel :model="strongholdModel" :actions="stronghold" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'stronghold-editor'" />
        <MapPanel ref="mapPanel" :model="mapviewModel" :actions="mapview" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'mapview-editor'" />
        <CatalogPanel :model="catalogModel" :actions="catalog" :busy="state.busy" :hidden="!ready || state.view !== 'catalog-editor'" />
        <GeneralsPanel :model="generalsModel" :actions="generals" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'generals-editor'" />
        <CopyPanel :model="copyModel" :actions="copy" :busy="state.busy" :hidden="!ready || state.view !== 'copy'" />
        <PublishPanel :model="publicationModel" :actions="publication" :busy="state.busy" :hidden="!ready || state.view !== 'publish-editor'" />
        <ReviewPanel :model="reviewModel" :actions="review" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'management-editor'" />
        <CopyGamePanel :model="fullCopyModel" :actions="fullCopy" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'copy-game-editor'" />
      </section>
    </main>
  </div>
</template>
