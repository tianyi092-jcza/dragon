<script setup>
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { siegeOptionsFor } from './siegebattletypes.js';
// 攻城戰場縮略圖選擇器（遊戲＋基礎據點共用）：按據點類型先過濾，只列該類型
// 在內建用過的 (版式,主題) 組合；組內是該組合的全部獨立地圖（逐張不同地形）。
// 縮圖為真實戰鬥渲染器靜態地形合成（tools/export_siege_thumbnails.mjs）。
// 點縮略圖進單張大圖（2 倍像素化放大），可返回列表，可直接選中。
const props = defineProps({ visible: Boolean, cityType: [String, Number], value: String });
const emit = defineEmits(['select', 'close']);
const open = computed({ get: () => props.visible, set: value => { if (!value) emit('close'); } });
const detailId = ref('');
watch(() => props.visible, visible => { if (visible) detailId.value = ''; });
const TYPE_NAMES = { 0: '大都市', 1: '中都市', 2: '小都市', 3: '關卡', 4: '戰場' };
const pool = computed(() => siegeOptionsFor(props.cityType));
const groups = computed(() => {
  const byCombo = new Map();
  for (const option of pool.value) {
    const key = `${option.layout},${option.theme}`;
    if (!byCombo.has(key)) byCombo.set(key, { layout: option.layout, theme: option.theme, ids: [] });
    byCombo.get(key).ids.push(option);
  }
  return [...byCombo.values()];
});
const total = computed(() => groups.value.reduce((sum, group) => sum + group.ids.length, 0));
const detailOption = computed(() => pool.value.find(option => option.id === detailId.value) ?? null);
function thumbUrl(id) {
  const match = /^ki-1995:siege:(\d{1,3})$/.exec(typeof id === 'string' ? id : '');
  const index = match ? Number(match[1]) : -1;
  return index >= 0 && index <= 191 ? `/siege-thumb/${index}.png` : '';
}
function pick(id) { emit('select', id); emit('close'); }
</script>
<template>
  <ElDialog v-model="open" class="siege-thumb-dialog" title="攻城戰場（點圖選擇）" width="80%" append-to-body destroy-on-close>
    <template v-if="!detailId">
      <p>據點類型：{{ TYPE_NAMES[Number(cityType)] ?? '未定（列出全部 192 張）' }}；共 {{ total }} 張獨立地圖。點縮略圖看大圖。</p>
      <p class="siege-thumb-note">只列出該據點類型用過的版式＋主題組合（如大都市只用版式0的4種組合）；同組合內每張都是獨立地圖（地形不同），版式定畫法、主題定變體。</p>
      <div class="siege-thumb-groups">
        <section v-for="group in groups" :key="`${group.layout},${group.theme}`" class="siege-thumb-group">
          <h4>版式{{ group.layout }} · 主題{{ group.theme }}（{{ group.ids.length }} 張）</h4>
          <div class="siege-thumb-grid">
            <button v-for="option in group.ids" :key="option.id" type="button" class="siege-thumb" :class="{ selected: option.id === value }" :title="option.label" @click="detailId = option.id">
              <img :src="thumbUrl(option.id)" :alt="option.label" loading="lazy" width="240" height="128" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
    <template v-else>
      <div class="siege-thumb-detail">
        <img :src="thumbUrl(detailId)" :alt="detailId" width="480" height="256" />
        <p>{{ detailOption?.label ?? detailId }}</p>
        <div>
          <ElButton type="primary" @click="pick(detailId)">選定這張</ElButton>
          <ElButton @click="detailId = ''">返回列表</ElButton>
        </div>
      </div>
    </template>
    <template #footer><ElButton @click="emit('close')">關閉</ElButton></template>
  </ElDialog>
</template>
<style scoped>
.siege-thumb-dialog { margin-top: 5vh !important; margin-bottom: 5vh; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.siege-thumb-dialog .el-dialog__body { overflow-y: auto; }
.siege-thumb-groups { min-height: 200px; }
.siege-thumb-group h4 { margin: 8px 0 4px; }
.siege-thumb-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.siege-thumb { border: 2px solid transparent; padding: 2px; background: none; cursor: pointer; width: 256px; }
.siege-thumb img { width: 240px; height: 128px; display: block; image-rendering: pixelated; }
.siege-thumb.selected { border-color: var(--el-color-primary); }
.siege-thumb span { display: block; font-size: 12px; }
.siege-thumb-detail { text-align: center; }
.siege-thumb-detail img { image-rendering: pixelated; max-width: 100%; height: auto; }
</style>
