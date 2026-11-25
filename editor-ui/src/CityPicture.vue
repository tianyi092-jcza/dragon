<script setup>
import { computed, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { cityPictures } from '../../server/citypictures.js';
const props = defineProps({ value: Number, editable: Boolean, disabled: Boolean, large: Boolean });
const emit = defineEmits(['select']);
const open = ref(false), detail = ref(null);
const src = id => `/city-picture/${id}.png`;
// 自管庫上傳圖（view 15..255）：選圖器自讀清單（同源 cookie 會話；登入可讀）。
// 模組級快取，同一頁多實例只取一次；失敗即只用內建 15 張。
let customViewsPromise = null;
function customViews() {
  if (!customViewsPromise) {
    customViewsPromise = fetch('/api/city-pictures', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('list'); return response.json(); })
      .then(data => Array.isArray(data?.pictures) ? data.pictures.map(row => row?.view).filter(view => Number.isInteger(view) && view >= cityPictures.length && view <= 255).sort((a, b) => a - b) : [])
      .catch(() => []);
  }
  return customViewsPromise;
}
const customs = ref([]);
const available = computed(() => Number.isInteger(props.value) && (Object.hasOwn(cityPictures, props.value) || customs.value.includes(props.value)));
function ensureCustoms() {
  detail.value = null;
  if (!customs.value.length) {
    void customViews().then(views => { customs.value = views; });
  }
  open.value = true;
}
</script>
<template>
  <span class="city-picture" :class="{ large }">
    <img v-if="available" :src="src(value)" :alt="`據點圖片 ${value}`" loading="lazy" />
    <ElButton v-if="editable" aria-label="選擇據點圖片" :disabled="disabled" @click="ensureCustoms">選圖</ElButton>
    <span v-else-if="!available" class="city-picture-empty"></span>
  </span>
  <ElDialog v-if="editable && open" v-model="open" class="siege-thumb-dialog" body-class="stronghold-dialog-scroll" title="據點圖片" width="min(980px, 94vw)" align-center append-to-body>
    <div v-if="detail === null" class="city-picture-grid">
      <button v-for="(_, id) in cityPictures" :key="'builtin-' + id" type="button" :aria-pressed="id === value" @click="detail = id"><img :src="src(id)" :alt="`據點圖片 ${id}`" loading="lazy" />{{ id }}</button>
      <button v-for="id in customs" :key="'custom-' + id" type="button" :aria-pressed="id === value" @click="detail = id"><img :src="src(id)" :alt="`據點圖片 ${id}`" loading="lazy" />{{ id }}</button>
    </div>
    <div v-else class="city-picture-detail"><img :src="src(detail)" :alt="`據點圖片 ${detail}`" /><p>據點圖片 {{ detail }}</p></div>
    <template #footer><ElButton @click="emit('select', null); open = false">不使用圖片</ElButton><template v-if="detail !== null"><ElButton @click="detail = null">返回列表</ElButton><ElButton @click="emit('select', detail); open = false">選定這張</ElButton></template><ElButton @click="open = false">關閉</ElButton></template>
  </ElDialog>
</template>
<style scoped>
.city-picture { display: inline-grid; place-items: center; vertical-align: middle; }
.city-picture > * { grid-area: 1 / 1; }
.city-picture img { width: 64px; height: 64px; }
.city-picture.large img { width: 192px; height: 192px; }
.city-picture-empty { display: inline-block; width: 64px; height: 64px; }
.city-picture-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(148px, 100%), 1fr)); gap: 12px; }
.city-picture-grid img { display: block; width: 100%; height: auto; }
.city-picture-detail { text-align: center; }
.city-picture-detail img { width: min(384px, 100%); image-rendering: pixelated; }
</style>
