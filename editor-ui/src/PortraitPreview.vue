<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ gameId: String, portrait: Object, disabled: Boolean });
const image = ref(null), request = ref(null), state = ref('');
let serial = 0;
const identity = computed(() => !props.disabled && props.gameId && props.portrait && /^[a-f0-9]{64}$/.test(props.portrait.sha256 ?? '')
  ? JSON.stringify([props.gameId, props.portrait.assetId, props.portrait.sha256]) : null);
function clear() { request.value = null; state.value = ''; }
function preview() {
  if (!identity.value) return;
  request.value = { identity: identity.value, serial: ++serial,
    url: `/api/games/${encodeURIComponent(props.gameId)}/portraits/${encodeURIComponent(props.portrait.assetId)}/bytes?sha256=${props.portrait.sha256}` };
  state.value = 'loading';
}
function finish(event, result) {
  if (event.currentTarget !== image.value || request.value?.identity !== identity.value) return;
  state.value = result;
}
watch(identity, clear, { flush: 'sync' });
</script>
<template>
  <div class="portrait-preview">
    <ElButton data-portrait-preview :disabled="!identity || state === 'loading'" @click="preview">預覽所選頭像（不保存）</ElButton>
    <ElButton data-portrait-preview-clear :disabled="!request" @click="clear">清除預覽</ElButton>
    <p role="status" data-portrait-preview-status><template v-if="state === 'loading'">正在讀取已核摘要的共享頭像。</template><template v-else-if="state === 'error'">預覽讀取失敗；請重新讀取清單或重試。</template><template v-else-if="state === 'ready'">共享頭像 {{ portrait.assetId }}；不代表已保存引用。</template><template v-else>只預覽明確選擇且含摘要的頭像，不自動讀取。</template></p>
    <img v-if="request" :key="request.serial" ref="image" :src="request.url" :hidden="state !== 'ready'" :alt="`共享頭像 ${portrait.assetId}`" width="128" height="128" @load="finish($event, 'ready')" @error="finish($event, 'error')">
  </div>
</template>
<style scoped>
.portrait-preview img { object-fit: contain; image-rendering: pixelated; }
.portrait-preview p { min-height: 1.5em; }
</style>
