<script setup>
import { reactive } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
const fields = reactive({ account: '', password: '' });
defineProps({ busy: Boolean });
</script>

<template>
  <div class="auth-card">
    <p class="eyebrow">WOLONG · EDITOR</p><h1>登入創作工作台</h1><p class="muted">管理你的遊戲、編輯草稿，並在同一引擎中測試。</p>
    <form id="login" @reset="fields.account = ''; fields.password = ''">
      <label>帳戶<ElInput v-model="fields.account" name="account" autocomplete="username" required maxlength="32" /></label>
      <label>密碼<ElInput v-model="fields.password" name="password" type="password" autocomplete="current-password" required maxlength="128" /></label>
      <ElButton type="primary" native-type="submit" :disabled="busy">登入</ElButton>
    </form>
    <p class="muted">此入口僅供創作者使用；玩家遊戲不需登入。</p>
  </div>
</template>
