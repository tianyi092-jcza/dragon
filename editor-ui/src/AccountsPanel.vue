<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElTag } from 'element-plus/es/components/tag/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect } from 'element-plus/es/components/select/index.mjs';
import { ElOption } from 'element-plus/es/components/select/index.mjs';
import { ElTable } from 'element-plus/es/components/table/index.mjs';
import { ElTableColumn } from 'element-plus/es/components/table/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const newAccount = ref(''), query = ref(''), status = ref('all');
const filtered = computed(() => {
  const text = query.value.trim().toLocaleLowerCase();
  return props.model.rows.filter(row => (status.value === 'all' || (status.value === 'disabled') === row.disabled) &&
    (!text || [row.account, row.displayName, row.email, row.phone, row.note].some(value => value.toLocaleLowerCase().includes(text))));
});
watch(() => props.model.generation, () => { newAccount.value = ''; query.value = ''; status.value = 'all'; }, { flush: 'sync' });
async function create() {
  const generation = props.model.generation, value = newAccount.value;
  const created = await props.actions.create(value);
  if (created && generation === props.model.generation && value === newAccount.value) newAccount.value = '';
}
defineExpose({ dirty: () => Boolean(newAccount.value) });
</script>

<template>
  <section id="admin" class="accounts-panel module-card" aria-label="創作者帳戶" :aria-busy="busy">
    <div class="accounts-intro"><div><h2>帳戶清單</h2><p class="muted">管理創作者的存取權限；停用帳戶不會自動下架其遊戲。</p></div><ElButton id="refresh" :disabled="busy" @click="actions.refresh()">重載清單</ElButton></div>
    <form id="create" class="account-create" @submit.prevent="create">
      <label for="new-account">新創作者帳戶<ElInput id="new-account" v-model="newAccount" name="account" required maxlength="32" autocomplete="off" :disabled="busy || model.stale" aria-describedby="account-password-note" /></label>
      <ElButton type="primary" native-type="submit" :disabled="busy || model.stale">建立</ElButton>
    </form>
    <p id="account-password-note" class="muted">新建或重設帳戶使用管理者配置的初始密碼；首次登入必須修改。請透過安全管道交付，不顯示或傳回初始密碼。</p>
    <p v-if="model.message" id="accounts-message" class="account-warning" role="status">{{ model.message }}</p>
    <div class="account-filters">
      <label for="account-search">搜尋帳戶或個人資料<ElInput id="account-search" v-model="query" type="search" placeholder="帳戶、姓名、郵箱、電話、備註" :disabled="busy" /></label>
      <label for="account-filter">狀態<ElSelect id="account-filter" v-model="status" :disabled="busy"><ElOption value="all" label="全部狀態" /><ElOption value="enabled" label="啟用" /><ElOption value="disabled" label="停用" /></ElSelect></label>
      <span class="muted" role="status">{{ filtered.length }} / {{ model.rows.length }} 個帳戶</span>
    </div>
    <div class="account-table-wrap" tabindex="0" aria-label="帳戶清單（可水平捲動）">
      <p class="muted">目前載入的帳戶清單{{ model.stale ? '（待重載，操作已鎖定）' : '' }}</p>
      <ElTable id="accounts" :data="filtered" row-key="id">
        <ElTableColumn label="帳戶／姓名" min-width="160"><template #default="{ row }"><span :data-account-id="row.id"><strong>{{ row.account }}</strong><span class="account-secondary">{{ row.displayName || '未填姓名' }}</span></span></template></ElTableColumn>
        <ElTableColumn label="角色／狀態" min-width="220"><template #default="{ row }"><div class="account-tags"><ElTag :type="row.role === 'admin' ? 'success' : 'info'" effect="plain">{{ row.role === 'admin' ? '管理員' : '創作者' }}</ElTag><ElTag :type="row.disabled ? 'danger' : 'success'">{{ row.disabled ? '停用' : '啟用' }}</ElTag><ElTag v-if="row.mustChangePassword" type="warning">須改密碼</ElTag></div></template></ElTableColumn>
        <ElTableColumn label="聯絡資料" min-width="180"><template #default="{ row }"><span class="account-secondary">{{ row.email || '未填郵箱' }}</span><span class="account-secondary">{{ row.phone || '未填電話' }}</span></template></ElTableColumn>
        <ElTableColumn label="備註" min-width="160"><template #default="{ row }">{{ row.note || '—' }}</template></ElTableColumn>
        <ElTableColumn label="操作" min-width="230"><template #default="{ row }"><div v-if="row.role === 'author'" class="account-row-actions"><ElButton :disabled="busy || model.stale" @click="actions.mutate(row.id, 'disable')">{{ row.disabled ? '恢復' : '停用' }}</ElButton><ElButton :disabled="busy || model.stale" @click="actions.mutate(row.id, 'reset')">重設密碼</ElButton></div><span v-else class="muted">管理員不可在此操作</span></template></ElTableColumn>
        <template #empty>{{ !model.loaded ? '尚未取得清單，請重載。' : model.rows.length ? '沒有符合條件的帳戶。' : '目前沒有帳戶。' }}</template>
      </ElTable>
    </div>
  </section>
</template>
