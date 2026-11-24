<script setup>
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
defineProps({ model: Object, actions: Object, busy: Boolean });
const viewOf = row => {
  const match = /(\d+)\.png$/.exec(row?.path ?? '');
  return match ? Number(match[1]) : null;
};
// 上傳／替換共用一個對話窗；刪除在卡片上二次確認後直調。
const upload = ref({ open: false, mode: 'create', view: null, dataUrl: null, fileName: '', error: '' });
function openUpload(mode, view = null) {
  upload.value = { open: true, mode, view, dataUrl: null, fileName: '', error: '' };
}
function readFile(file, target) {
  if (!file) return;
  if (file.type !== 'image/png' && !/\.png$/i.test(file.name || '')) {
    target.error = '只接受 PNG 圖片。';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { target.dataUrl = reader.result; target.fileName = file.name || ''; target.error = ''; };
  reader.onerror = () => { target.error = '讀取圖片失敗，请重試。'; };
  reader.readAsDataURL(file);
}
function onDrop(event, target) {
  event.preventDefault();
  readFile(event.dataTransfer?.files?.[0], target);
}
async function confirmUpload(actions) {
  if (!upload.value.dataUrl) { upload.value.error = '请先選擇或拖放一張 PNG 圖片。'; return; }
  upload.value.error = '';
  try {
    if (upload.value.mode === 'replace') await actions.replaceCityPicture(upload.value.view, upload.value.dataUrl);
    else await actions.uploadCityPicture(upload.value.dataUrl);
    upload.value.open = false;
  } catch (error) { upload.value.error = (error && error.message) || '上傳失敗。'; }
}
function confirmDelete(actions, row) {
  const view = viewOf(row);
  if (!Number.isInteger(view)) return;
  if (window.confirm('如果删除，使用图片的据点图片会显示为空。確定刪除據點圖片 ' + view + ' 嗎？')) {
    void actions.deleteCityPicture(view);
  }
}
</script>
<template>
  <section id="catalog-editor" class="module-card resources-card">
    <p v-if="!model.loaded" id="catalog-message" role="status" class="muted">
      {{ model.message }}
    </p>

    <template v-if="model.loaded">
      <!-- 使用者 m1107：篩選與分類 TAB 同一行，靠右上；不再单独占一行高度。 -->
      <div class="resource-toolbar">
        <div class="resource-categories">
          <ElButton v-for="item in model.categories" :key="item.id" :data-category="item.id"
                  :type="model.category === item.id ? 'primary' : 'default'" :disabled="busy"
                  @click="actions.selectCategory(item.id)">
            {{ item.label }}
          </ElButton>
        </div>
        <div class="resource-filter">
          <label>篩選<ElInput :model-value="model.filter" maxlength="128" :disabled="busy"
                           placeholder="依檔名篩選" @input="actions.setFilter($event)" /></label>
        </div>
      </div>

      <!-- 據點圖片走相册：圖按原尺寸、圖下只放遊戲中編號（view），管理員另有新增／編輯／刪除。 -->
      <div v-if="model.category === 'city-picture'">
        <div v-if="model.canManage" class="resource-gallery-actions">
          <ElButton :disabled="busy" @click="openUpload('create')">新增</ElButton>
        </div>
        <div class="resource-list resource-gallery">
          <p v-if="!model.rows.length" class="muted">此分類沒有符合條件的資源。</p>
          <figure v-for="row in model.rows" :key="row.path" class="resource-card city-picture-card" :data-path="row.path">
            <span class="city-picture-frame">
              <img :src="row.url" :width="row.width" :height="row.height" :alt="row.label" loading="lazy" class="thumb city-picture-thumb">
              <span class="city-picture-badge">{{ viewOf(row) }}</span>
            </span>
            <figcaption v-if="model.canManage">
              <span class="card-actions">
                <ElButton :disabled="busy" @click="openUpload('replace', viewOf(row))">編輯</ElButton>
                <ElButton :disabled="busy" @click="confirmDelete(actions, row)">刪除</ElButton>
              </span>
            </figcaption>
          </figure>
        </div>
        <ElDialog v-model="upload.open" title="據點圖片" width="min(560px, 94vw)" align-center append-to-body>
          <p class="muted">上傳圖片大小要和當前的基本一致（192 寬）、格式為 PNG；單張不超過 400K。如圖片和指定的大小不同，在上傳保存後強行等寬壓縮（寬 192、高度等比）。</p>
          <div class="city-picture-drop" @dragover.prevent @drop="onDrop($event, upload)" @click="$refs.cityPictureFile?.click()">
            <p v-if="!upload.dataUrl">把 PNG 拖放到這裡，或點擊選擇（支援拖放、上傳對話框兩種方式）</p>
            <img v-else :src="upload.dataUrl" :alt="upload.fileName" class="thumb city-picture-thumb">
            <p v-if="upload.fileName" class="muted">{{ upload.fileName }}</p>
          </div>
          <input ref="cityPictureFile" type="file" accept="image/png,.png" hidden @change="readFile($event.target.files?.[0], upload); $event.target.value = ''">
          <p v-if="upload.error" role="status" class="city-picture-error">{{ upload.error }}</p>
          <p v-if="model.message" role="status" class="muted">{{ model.message }}</p>
          <template #footer>
            <ElButton :disabled="busy" @click="upload.open = false">取消</ElButton>
            <ElButton :disabled="busy || !upload.dataUrl" @click="confirmUpload(actions)">保存</ElButton>
          </template>
        </ElDialog>
      </div>

      <!-- 頭像走相册：序号—头像—路径，路径下一行是文件大小。 -->
      <div v-else-if="model.category === 'portrait'" class="resource-list resource-gallery">
        <p v-if="!model.rows.length" class="muted">此分類沒有符合條件的資源。</p>
        <figure v-for="(row, index) in model.rows" :key="row.path" class="resource-card" :data-path="row.path">
          <span class="index">{{ index + 1 }}</span>
          <img :src="row.url" :alt="row.label" loading="lazy" class="thumb">
          <figcaption>
            <span class="name">{{ row.path }}</span>
            <span class="muted size">{{ row.byteLength }} bytes</span>
          </figcaption>
        </figure>
      </div>

      <ElTable v-else :data="model.rows" row-key="path" :show-header="false">
        <ElTableColumn type="index" width="80" />
        <ElTableColumn min-width="120"><template #default="{ row }"><span class="resource-row" :data-path="row.path"><img v-if="row.category === 'image'" :src="row.url" :alt="row.label" loading="lazy" class="thumb"></span></template></ElTableColumn>
        <ElTableColumn prop="path" min-width="280" />
        <ElTableColumn min-width="300"><template #default="{ row }"><audio v-if="row.category === 'audio'" :src="row.url" controls preload="metadata"></audio><span v-else>{{ row.byteLength }} bytes</span></template></ElTableColumn>
        <template #empty>此分類沒有符合條件的資源。</template>
      </ElTable>
    </template>
  </section>
</template>
<style scoped>
.resource-gallery-actions { margin-bottom: 8px; }
.city-picture-thumb { width: auto; height: auto; max-width: 100%; image-rendering: pixelated; }
.resource-gallery .resource-card.city-picture-card { display: flex; flex-direction: column; align-items: center; }
.resource-gallery .resource-card img.city-picture-thumb { width: auto; height: auto; max-width: 100%; image-rendering: pixelated; background: var(--el-fill-color-light); }
.city-picture-frame { position: relative; display: inline-block; }
.city-picture-badge { position: absolute; top: 4px; left: 4px; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 12px; line-height: 1.6; padding: 0 6px; border-radius: 3px; }
.city-picture-drop { border: 1px dashed var(--el-border-color); border-radius: 4px; padding: 16px; text-align: center; cursor: pointer; }
.city-picture-error { color: var(--el-color-danger); }
.card-actions { display: flex; gap: 4px; justify-content: center; }
</style>
