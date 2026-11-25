<script setup>
import { reactive, ref, watch } from 'vue';
import { notifyError, notifyInfo } from './notify.js';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
const NUMBERS = { max_prod: 65535, prod: 65535, growth: 255, defence: 255, troops: 255, type: 255 };
const FIELDS = ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type'];
const CITY_TYPES = ['大都市','中都市','小都市','關卡','戰場'].map((name, i) => [i, name]);
import { siegeLabel, siegeValid, siegeInType } from "./siegebattletypes.js";
import CityPicture from './CityPicture.vue';
import SiegePickButton from './SiegePickButton.vue';
import SiegeThumbPicker from './SiegeThumbPicker.vue';
const creating = ref(false);
const createPickerVisible = ref(false);
const create = reactive({ name: '', region: '', max_prod: 0, prod: 0, growth: 0, defence: 0, troops: 0, type: 0, view: null, battleMapId: '', troops_cap: 0 });
watch(() => create.type, type => { if (create.battleMapId && !siegeInType(create.battleMapId, type)) create.battleMapId = ''; });
const status = ref('');
const failure = ref('');
// 本地失敗／成功行不經過全局 model.message，直接在這裡補一條 Plain 提示。
watch(failure, message => { if (String(message ?? '').trim()) notifyError(message); });
watch(status, message => { if (String(message ?? '').trim()) notifyInfo(message); });
const cityName = value => String(value ?? '').normalize('NFC').trim();
const props = defineProps({columns:Array,cities:Array,save:Function,busy:Boolean,locked:Boolean,prefix:String});
const emit = defineEmits(['editing']);
watch(creating, value => emit('editing',value));
async function createCity() {
  if (props.locked) return;
  const name = cityName(create.name);
  if (!name) { failure.value = '據點名稱不可空白。'; return; }
  if ([...name].length > 12) { failure.value = '據點名稱最多 12 個字。'; return; }
  if (props.cities.some(item => cityName(item.name) === name)) { failure.value = '據點名稱「' + name + '」已被其他據點使用。'; return; }
  const region = cityName(create.region);
  if ([...region].length > 5) { failure.value = '所屬州郡最多 5 個字。'; return; }
  const numbers = {};
  for (const key of ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']) {
    if (key === 'view' && create.view === null) continue;
    const raw = String(create[key] ?? '').trim() || '0';
    const limit = key === 'view' ? 255 : NUMBERS[key];
    if (!/^[0-9]{1,5}$/.test(raw) || Number(raw) > limit) { failure.value = (props.columns.find(c => c.key === key)?.title ?? '城景編號') + ' 必須是 0–' + limit + ' 的整數。'; return; }
    numbers[key] = Number(raw);
  }
  const createCapRaw = String(create.troops_cap ?? '').trim() || '0';
  if (!/^[0-9]{1,3}$/.test(createCapRaw) || Number(createCapRaw) > 255) { failure.value = '城兵上限必須是 0–255 的整數。'; return; }
  if (!siegeValid(String(create.battleMapId ?? ''))) { failure.value = '攻城戰場須為 ki-1995:siege:0..191（先定類型，再按版式／主題分組選擇）。'; return; }
  if (!siegeInType(String(create.battleMapId ?? ''), create.type)) { failure.value = '所選攻城戰場不在該據點類型的子集內，請重選。'; return; }
  failure.value = ''; status.value = '';
  try {
    const reply = await props.save({ name, region, numbers, battleMapId: String(create.battleMapId), troops_cap: Number(create.troops_cap) });
    creating.value = false;
    create.name = ''; create.region = ''; create.battleMapId = '';
    if (typeof reply === 'string') status.value = reply;
  } catch (error) {
    failure.value = (error && error.message) || '新增未完成（原因未回報）。';
  }
}
</script>
<template>
      <ElButton :id="`${prefix}-create-toggle`" :disabled="locked" @click="creating = !creating; failure = ''">{{ creating ? '取消新增' : '新增據點' }}</ElButton>
    <ElDialog v-model="creating" title="新增據點" width="min(900px, 94vw)" align-center append-to-body :close-on-click-modal="false" destroy-on-close class="stronghold-create-dialog" body-class="stronghold-dialog-scroll">
      <ElForm label-position="top" class="editor-form-grid" @submit.prevent="createCity()">
        <ElFormItem v-for="field in columns.filter(c => ['name', 'region', ...FIELDS, 'troops_cap'].includes(c.key))" :key="field.key" :label="field.title">
          <ElSelect v-if="field.key === 'type'" v-model="create.type" :disabled="busy"><ElOption v-for="[value, label] in CITY_TYPES" :key="value" :value="Number(value)" :label="label" /></ElSelect>
          <ElInput v-else v-model="create[field.key]" :maxlength="field.key === 'name' ? 12 : field.key === 'region' ? 5 : undefined" :inputmode="(field.key === 'name' || field.key === 'region') ? 'text' : 'numeric'" :disabled="busy" />
        </ElFormItem>
        <ElFormItem label="攻城戰場" class="stronghold-create-battle"><SiegePickButton :value="create.battleMapId" :disabled="busy" @open="createPickerVisible = true" /><span class="siege-current">{{ create.battleMapId ? siegeLabel(create.battleMapId) : '尚未選擇戰場' }}</span></ElFormItem>
        <ElFormItem label="據點圖片" class="stronghold-create-battle"><CityPicture :value="create.view" editable large :disabled="busy" @select="create.view = $event" /></ElFormItem>
      </ElForm>
      <p v-if="failure" role="alert">{{ failure }}</p>
      <template #footer><ElButton :disabled="busy" @click="creating = false">取消</ElButton><ElButton :id="`${prefix}-create`" :disabled="busy || locked" @click="createCity()">建檔</ElButton></template>
    </ElDialog>
    <SiegeThumbPicker :visible="createPickerVisible" :city-type="create.type" :value="create.battleMapId" @select="create.battleMapId = $event" @close="createPickerVisible = false" />
</template>
