<script setup>
import { reactive } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
const fields = reactive({ account: '', password: '' });
defineProps({ busy: Boolean });
</script>

<template>
  <div class="auth-card">
    <img class="auth-logo" src="/auth-logo.png" alt="臥龍傳" width="128" height="128">
    <p class="eyebrow">WOLONG · EDITOR</p><h1>臥龍傳編輯器</h1><p class="muted">管理你的遊戲、編輯草稿，並在同一引擎中測試。</p>
    <!-- 基礎用法 ElForm：提交／重置仍由外部 client.txt 接管（FormData＋reset），這裡只換殼。 -->
    <ElForm id="login" label-position="top" :model="fields" @reset="fields.account = ''; fields.password = ''">
      <ElFormItem label="帳戶" prop="account"><ElInput v-model="fields.account" name="account" autocomplete="username" required maxlength="32" /></ElFormItem>
      <ElFormItem label="密碼" prop="password"><ElInput v-model="fields.password" name="password" type="password" autocomplete="current-password" required maxlength="128" /></ElFormItem>
      <ElFormItem><ElButton type="primary" native-type="submit" :disabled="busy">登入</ElButton></ElFormItem>
    </ElForm>
    <p class="muted">此入口僅供創作者使用；玩家遊戲不需登入。</p>
  </div>
</template>
