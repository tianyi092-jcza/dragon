<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { siegeLabel, thumbUrl } from './siegebattletypes.js';
defineProps({ value: String, disabled: Boolean });
defineEmits(['open']);
</script>
<template>
  <span class="siege-pick-button">
    <img v-if="thumbUrl(value)" :src="thumbUrl(value)" :alt="siegeLabel(value)" width="96" height="51" />
    <ElButton :disabled="disabled" :aria-label="thumbUrl(value) ? '更換攻城戰場' : '選圖'" @click="$emit('open')">選圖</ElButton>
  </span>
</template>
<style scoped>
.siege-pick-button { display: inline-grid; place-items: center; flex: none; }
.siege-pick-button > * { grid-area: 1 / 1; }
.siege-pick-button > button { z-index: 1; }
</style>
