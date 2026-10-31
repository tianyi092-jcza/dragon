<script setup>
import { computed, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import LoginPage from './LoginPage.vue';
import AccountPages from './AccountPages.vue';
import AccountsPanel from './AccountsPanel.vue';
import DraftPanel from './DraftPanel.vue';
import StageAssetsPanel from './StageAssetsPanel.vue';
import StageJobsPanel from './StageJobsPanel.vue';
import LibraryPanel from './LibraryPanel.vue';
import StrongholdPanel from './StrongholdPanel.vue';
import MapPanel from './MapPanel.vue';
import CatalogPanel from './CatalogPanel.vue';
import GeneralsPanel from './GeneralsPanel.vue';
import CopyPanel from './CopyPanel.vue';
import PublishPanel from './PublishPanel.vue';
import ManagementPanel from './ManagementPanel.vue';
import DeletionPanel from './DeletionPanel.vue';
const props = defineProps({ state: Object, accountsModel: Object, accounts: Object, draftModel: Object, draft: Object, stageAssetsModel: Object, stageAssets: Object, stageJobsModel: Object, stageJobs: Object, libraryModel: Object, library: Object, strongholdModel: Object, stronghold: Object, mapviewModel: Object, mapview: Object, catalogModel: Object, catalog: Object, generalsModel: Object, generals: Object, copyModel: Object, copy: Object, publicationModel: Object, publication: Object, managementModel: Object, management: Object, deletionModel: Object, deletion: Object, navigate: Function, logout: Function });
const accountsPanel = ref(null), mapPanel = ref(null);
defineExpose({ accountDirty: () => accountsPanel.value?.dirty() ?? false, mapInputs: () => Boolean(ready.value && mapPanel.value?.hasInputs()) });
const userMenu = ref(null);
const ready = computed(() => props.state.authenticated && !props.state.mustChange);
const menu = computed(() => props.state.views.filter(item => !item[2] || props.state.admin));
const title = computed(() => ({ profile: '個人資料', password: '變更密碼' }[props.state.view] || menu.value.find(item => item[0] === props.state.view)?.[1] || '工作台'));
function go(view) { if (userMenu.value) userMenu.value.open = false; props.navigate(view); }
</script>

<template>
  <div class="workbench" :class="{ 'auth-layout': !ready }">
    <header class="workbench-header">
      <a class="brand" href="#draft-editor" @click.prevent="go('draft-editor')"><span class="brand-mark">臥</span><span>臥龍傳<span class="brand-caption">創作工作台</span></span></a>
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
      <p class="nav-label">內容與管理</p>
      <ElButton v-for="[id, label] in menu" :key="id" :data-view="id" :class="{ on: state.view === id }" :aria-current="state.view === id ? 'page' : undefined" :disabled="state.busy" @click="go(id)">{{ label }}</ElButton>
      <p class="nav-note">草稿與正式版本分離<br>遊戲規則共用同一引擎<br><a href="/shell-ui-licenses.txt" target="_blank" rel="noopener">第三方授權</a></p>
    </aside>
    <main class="workbench-main">
      <div class="page-heading" :hidden="!ready"><span>編輯後台 / {{ title }}</span><h1>{{ title }}</h1></div>
      <div id="workspace-context" class="workspace-context" :hidden="!ready || state.view === 'catalog-editor'">
        <span v-if="draftModel.context">目前草稿：{{ draftModel.context.name }}／{{ draftModel.context.gameId }}／修訂 {{ draftModel.context.draftRevision }}<strong v-if="draftModel.context.dirty">／有未保存修改</strong><strong v-if="draftModel.context.pending">／原操作未確認</strong><strong v-if="!draftModel.context.verified">／尚須明確載入</strong></span>
        <span v-else>目前未載入草稿；請在「遊戲與章節草稿」選擇明確修訂。</span>
        <small>僅顯示草稿上下文；其它模組已選的精確目標不會自動替換。</small>
      </div>
      <p id="status" role="status" aria-live="polite"></p>
      <LoginPage :hidden="state.authenticated" :busy="state.busy" />
      <section id="session" :hidden="!state.authenticated">
        <AccountPages :state="state" :ready="ready" />
        <AccountsPanel ref="accountsPanel" :model="accountsModel" :actions="accounts" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'admin'" />
        <DraftPanel :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'draft-editor'" />
        <StageJobsPanel :model="stageJobsModel" :actions="stageJobs" :busy="state.busy" :hidden="!ready || state.view !== 'stage-editor'" />
        <StageAssetsPanel :model="stageAssetsModel" :actions="stageAssets" :busy="state.busy" :hidden="!ready || state.view !== 'stage-assets-editor'" />
        <LibraryPanel :model="libraryModel" :actions="library" :busy="state.busy" :hidden="!ready || state.view !== 'library-editor'" />
        <StrongholdPanel :model="strongholdModel" :actions="stronghold" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'stronghold-editor'" />
        <MapPanel ref="mapPanel" :model="mapviewModel" :actions="mapview" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'mapview-editor'" />
        <CatalogPanel :model="catalogModel" :actions="catalog" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'catalog-editor'" />
        <GeneralsPanel :model="generalsModel" :actions="generals" :draft-model="draftModel" :draft-actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'generals-editor'" />
        <CopyPanel :model="copyModel" :actions="copy" :busy="state.busy" :hidden="!ready || state.view !== 'copy'" />
        <PublishPanel :model="publicationModel" :actions="publication" :busy="state.busy" :hidden="!ready || state.view !== 'publish-editor'" />
        <ManagementPanel :model="managementModel" :current-game="ready ? draftModel.fields.gameId : null" :actions="management" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'management-editor'" />
        <DeletionPanel :model="deletionModel" :current-game="ready ? draftModel.fields.gameId : null" :actions="deletion" :busy="state.busy" :hidden="!ready || state.view !== 'deletion-editor'" />
      </section>
    </main>
  </div>
</template>
