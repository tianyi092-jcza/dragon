<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElLink } from 'element-plus/es/components/link/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElPopover } from 'element-plus/es/components/popover/index.mjs';
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index.mjs';
import { vLoading } from 'element-plus/es/components/loading/index.mjs';
import zhTw from 'element-plus/es/locale/lang/zh-tw.mjs';
import { ElMenu, ElMenuItem } from 'element-plus/es/components/menu/index.mjs';
import WorkspaceIcon from './WorkspaceIcon.vue';
import { notify } from './notify.js';
import LoginPage from './LoginPage.vue';
import AccountPages from './AccountPages.vue';
import AccountsPanel from './AccountsPanel.vue';
import DraftPanel from './DraftPanel.vue';
import ChaptersPanel from './ChaptersPanel.vue';
import StrongholdPanel from './StrongholdPanel.vue';
import SystemStrongholdPanel from './SystemStrongholdPanel.vue';
import BaseMapPanel from './BaseMapPanel.vue';
import CatalogPanel from './CatalogPanel.vue';
import GeneralsPanel from './GeneralsPanel.vue';
import CopyPanel from './CopyPanel.vue';
import CopyGamePanel from './CopyGamePanel.vue';
import PublishPanel from './PublishPanel.vue';
import ReviewPanel from './ReviewPanel.vue';
const props = defineProps({ state: Object, baseMapModel: Object, baseMap: Object, baseStrongholdModel: Object, baseStronghold: Object, gameMapModel: Object, gameMap: Object, accountsModel: Object, accounts: Object, draftModel: Object, draft: Object, stageAssetsModel: Object, stageAssets: Object, stageJobsModel: Object, stageJobs: Object, libraryModel: Object, library: Object, strongholdModel: Object, stronghold: Object, catalogModel: Object, catalog: Object, generalsModel: Object, generals: Object, copyModel: Object, copy: Object, fullCopyModel: Object, fullCopy: Object, publicationModel: Object, publication: Object, managementModel: Object, management: Object, reviewModel: Object, review: Object, navigate: Function, logout: Function });
import { loadingSvg } from './loading.js';
// 阻塞彈窗自行展示 Loading，不在它背後再疊一個全局動畫；請求計數與 busy 不變。
const publicationOverlay = ref(false);
const globalLoading = computed(() => !(publicationOverlay.value || props.fullCopyModel.tracking || props.fullCopyModel.failed) && (props.state.loading || props.state.busy && props.state.feedback === 'global'));
const accountsPanel = ref(null);
// New map sessions participate directly in the shared context's leave guard.
defineExpose({ accountDirty: () => accountsPanel.value?.dirty() ?? false });
const userMenu = ref(false);
const collapsed = ref(false), navigationMenu = ref(null);
const ready = computed(() => props.state.authenticated && !props.state.mustChange);
// 選單不再分組顯示：順序即 views 數組順序；權限過濾不變。
const menu = computed(() => props.state.views.filter(item => !item[2] || props.state.admin));
// 頂部選擇器是全局「當前遊戲」上下文；切換須經草稿控制器的未保存改動攔截。
function switchGame(value) { props.draft.chooseGame(value); }
const activeMap = computed(() => {
  if (props.state.view === 'base-map-editor') return props.baseMapModel;
  if (props.state.view === 'mapview-editor') return props.gameMapModel;
  return null;
});
const title = computed(() => ({ profile: '個人資料', password: '變更密碼' }[props.state.view] || menu.value.find(item => item[0] === props.state.view)?.[1] || '工作台'));
// 全局瞬時提示：所有常駐狀態文案（頂部狀態列＋各面板 model.message）
// 變化時同步發一條 Plain 白底 ElMessage；去重避免同一文案反覆彈出。
// 控制器只寫 model，不直接彈窗，Node 單測不受 DOM 影響。
const toasted = new Map();
function toastOnce(key, text, type = 'info') {
  const message = String(text ?? '').trim();
  if (!message || toasted.get(key) === message) return;
  toasted.set(key, message);
  notify(message, type);
}
// 章節面板的 @notice 只承載行內校驗／提示文案，不做錯誤分級猜測，一律 info；
// 真正的錯誤仍走 status(message, true) 的 statusError 旗標。
function onNotice(message) {
  props.state.statusMessage = message;
  props.state.statusError = false;
}
watch(() => props.state.statusMessage, message => toastOnce('status', message, props.state.statusError ? 'error' : 'info'));
watch(() => [
  props.accountsModel.message, props.draftModel.message, props.catalogModel.message,
  props.copyModel.message, props.fullCopyModel.message, props.publicationModel.message,
  props.managementModel.message, props.reviewModel.message, props.libraryModel.message,
  props.stageAssetsModel.message, props.stageJobsModel.message,
  props.baseMapModel.message, props.baseStrongholdModel.message, props.gameMapModel.message,
], messages => messages.forEach((message, index) => toastOnce(index, message)));
async function go(view) {
  userMenu.value = false;
  props.navigate(view);
  // Element Plus selects optimistically; the shared dirty/permission guard
  // remains authoritative even when it rejects a navigation attempt.
  await nextTick();
  navigationMenu.value?.updateActiveIndex(props.state.view);
}
</script>

<template>
  <ElConfigProvider :locale="zhTw" size="default" :empty-values="[null, undefined]">
  <div v-loading.fullscreen="globalLoading" :element-loading-svg="loadingSvg" element-loading-custom-class="workbench-loading" :aria-busy="Boolean(state.busy || state.loading)" class="workbench" :class="{ 'auth-layout': !ready, 'nav-collapsed': ready && collapsed, 'map-workspace': ready && Boolean(activeMap) }" :style="{ fontFamily: 'var(--el-font-family)', fontSize: 'var(--el-font-size-base)', color: 'var(--el-text-color-primary)' }">
    <header class="workbench-header">
      <ElLink v-if="ready" :underline="false" class="brand brand-static" href="#copy" @click.prevent="go('copy')"><img class="brand-mark" src="/brand.png" alt="臥龍傳編輯器"><span class="brand-title">臥龍傳編輯器</span></ElLink>
      <div class="current-game" :hidden="!ready">
        <span>當前遊戲</span>
        <ElSelect id="current-game" :model-value="draftModel.fields.gameId" :disabled="state.busy || draftModel.gameLocked" @change="switchGame">
          <ElOption value="" disabled :label="draftModel.selectionMissing ? '原遊戲已不在清單，請重新選擇' : (draftModel.games.length ? '請選擇遊戲' : '尚未載入遊戲清單')" />
          <ElOption v-for="game in draftModel.games" :key="game.gameId" :value="game.gameId" :label="game.name" />
        </ElSelect>
        <ElButton :disabled="state.busy || draftModel.locked" @click="draft.refresh()">重新整理</ElButton>
      </div>
      <div class="account-actions" :hidden="!state.authenticated">
        <ElTag :type="state.admin ? 'success' : 'info'" effect="plain">{{ state.admin ? '管理員' : '創作者' }}</ElTag>
        <span id="identity">{{ state.account }}{{ state.mustChange ? ' — 請先變更密碼' : '' }}</span>
        <ElPopover v-if="ready" v-model:visible="userMenu" trigger="click" :width="220">
          <template #reference><ElButton>帳戶選單</ElButton></template>
          <div class="user-menu-items">
            <ElButton text @click="go('profile')" :disabled="state.busy">個人資料</ElButton>
            <ElButton text @click="go('password')" :disabled="state.busy">變更密碼</ElButton>
            <ElButton text @click="logout()" :disabled="state.busy">登出</ElButton>
          </div>
        </ElPopover>
        <ElButton id="logout" :disabled="state.busy">登出</ElButton>
        <ElLink class="licenses-link" href="/shell-ui-licenses.txt" target="_blank" rel="noopener" aria-label="第三方授權" title="第三方授權">第三方授權</ElLink>
      </div>
    </header>
    <aside id="menu" class="workbench-menu" :hidden="!ready" aria-label="編輯模組">
      <ElMenu ref="navigationMenu" class="module-menu" :collapse="collapsed" :collapse-transition="false" :default-active="state.view" @select="go">
        <ElMenuItem v-for="[id, label] in menu" :key="id" :index="id" :data-view="id" :aria-label="label" :aria-current="state.view === id ? 'page' : undefined" :disabled="state.busy">
          <WorkspaceIcon :name="id" /><template #title>{{ label }}</template>
        </ElMenuItem>
      </ElMenu>
      <div class="navigation-footer">
        <ElButton :aria-expanded="!collapsed" :aria-label="collapsed ? '展開導覽' : '折疊導覽'" @click="collapsed = !collapsed"><WorkspaceIcon :name="collapsed ? 'expand' : 'collapse'" /></ElButton>
      </div>
    </aside>
    <main class="workbench-main">
      <div class="page-heading" :hidden="!ready"><h1>{{ title }}</h1></div>
      <div class="page-line" :hidden="!ready || Boolean(activeMap)">
        <p id="status" role="status" aria-live="polite" :hidden="Boolean(activeMap)">{{ state.statusMessage }}</p>
        <div id="workspace-context" class="workspace-context" :hidden="Boolean(activeMap) || !draftModel.context || state.view === 'catalog-editor' || state.view === 'copy' || state.view === 'management-editor'">
          <span v-if="draftModel.context">目前草稿：{{ draftModel.context.name }}／{{ draftModel.context.gameId }}<strong v-if="draftModel.context.dirty">／有未保存修改</strong><strong v-if="draftModel.context.pending">／原操作未確認</strong><strong v-if="!draftModel.context.verified">／尚須明確載入</strong></span>
        </div>
      </div>
      <LoginPage :hidden="state.authenticated" :busy="state.busy" />
      <section id="session" :hidden="!state.authenticated">
        <AccountPages :state="state" :ready="ready" />
        <AccountsPanel ref="accountsPanel" :model="accountsModel" :actions="accounts" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'admin'" />
        <DraftPanel :active="ready && state.view === 'draft-editor'" :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'draft-editor'" />
        <ChaptersPanel :active="ready && state.view === 'chapters-editor'" :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'chapters-editor'" @notice="onNotice" />
        <StrongholdPanel :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'stronghold-editor'" />
        <SystemStrongholdPanel :model="baseStrongholdModel" :actions="baseStronghold" :busy="state.busy" :game-id="draftModel.fields.gameId" :game-name="(draftModel.games.find(game => game.gameId === draftModel.fields.gameId) || {}).name" :hidden="!ready || !state.admin || state.view !== 'base-stronghold-editor'" />
        <BaseMapPanel v-if="ready && state.admin && state.view === 'base-map-editor'" :model="baseMapModel" :actions="baseMap" :busy="state.busy" />
        <BaseMapPanel v-if="ready && state.view === 'mapview-editor'" :key="gameMapModel.gameId || 'no-game'" :model="gameMapModel" :actions="gameMap" :busy="state.busy" />
        <CatalogPanel :model="catalogModel" :actions="catalog" :busy="state.busy" :hidden="!ready || state.view !== 'catalog-editor'" />
        <GeneralsPanel :model="draftModel" :actions="draft" :busy="state.busy" :hidden="!ready || state.view !== 'generals-editor'" />
        <CopyPanel :model="copyModel" :actions="copy" :busy="state.busy" :hidden="!ready || state.view !== 'copy'" />
        <PublishPanel :model="publicationModel" :actions="publication" :busy="state.busy" :hidden="!ready || state.view !== 'publish-editor'" @overlay-change="publicationOverlay = $event" />
        <ReviewPanel :model="reviewModel" :actions="review" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'management-editor'" />
        <CopyGamePanel :model="fullCopyModel" :actions="fullCopy" :busy="state.busy" :hidden="!ready || !state.admin || state.view !== 'copy-game-editor'" />
      </section>
    </main>
  </div>
  </ElConfigProvider>
</template>
