<script setup>
import { computed, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { cityPictures } from '../../server/citypictures.js';
const props = defineProps({ value: Number, editable: Boolean, disabled: Boolean, large: Boolean });
const emit = defineEmits(['select']);
const open = ref(false), detail = ref(null);
const src = id => `/city-picture/${id}.png`;
const available = computed(() => Number.isInteger(props.value) && Object.hasOwn(cityPictures, props.value));
</script>
<template>
  <span class="city-picture" :class="{ large }">
    <img v-if="available" :src="src(value)" :alt="`據點圖片 ${value}`" loading="lazy" />
    <ElButton v-if="editable" aria-label="選擇據點圖片" :disabled="disabled" @click="detail = null; open = true">選圖</ElButton>
    <span v-else-if="!available">{{ value == null ? '—' : `${value}（未知）` }}</span>
  </span>
  <ElDialog v-if="editable && open" v-model="open" class="siege-thumb-dialog" body-class="stronghold-dialog-scroll" title="據點圖片" width="min(980px, 94vw)" align-center append-to-body>
    <div v-if="detail === null" class="city-picture-grid">
      <button v-for="(_, id) in cityPictures" :key="id" type="button" :aria-pressed="id === value" @click="detail = id"><img :src="src(id)" :alt="`據點圖片 ${id}`" loading="lazy" />{{ id }}</button>
    </div>
    <div v-else class="city-picture-detail"><img :src="src(detail)" :alt="`據點圖片 ${detail}`" /><p>據點圖片 {{ detail }}</p></div>
    <template #footer><template v-if="detail !== null"><ElButton @click="detail = null">返回列表</ElButton><ElButton @click="emit('select', detail); open = false">選定這張</ElButton></template><ElButton @click="open = false">關閉</ElButton></template>
  </ElDialog>
</template>
<style scoped>
.city-picture { display: inline-grid; place-items: center; vertical-align: middle; }
.city-picture > * { grid-area: 1 / 1; }
.city-picture img { width: 64px; height: 64px; }
.city-picture.large img { width: 192px; height: 192px; }
.city-picture-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(148px, 100%), 1fr)); gap: 12px; }
.city-picture-grid img { display: block; width: 100%; height: auto; }
.city-picture-detail { text-align: center; }
.city-picture-detail img { width: min(384px, 100%); image-rendering: pixelated; }
</style>
