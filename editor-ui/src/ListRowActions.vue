<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';

defineProps({ editing: Boolean, busy: Boolean, locked: Boolean });
const emit = defineEmits(['edit', 'save', 'cancel']);
</script>

<template>
  <div class="account-row-actions">
    <template v-if="editing">
      <ElButton data-action="save" :disabled="busy" @click="emit('save')">保存</ElButton>
      <ElButton data-action="cancel" :disabled="busy" @click="emit('cancel')">取消</ElButton>
    </template>
    <ElButton v-else data-action="edit" :disabled="locked" @click="emit('edit')">編輯</ElButton>
  </div>
</template>
