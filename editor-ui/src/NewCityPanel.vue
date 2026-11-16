<script setup>
import { reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean, mapActions: Object, mapSelected: Object });
const create = reactive({ name: '', numbers: { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 } });
const stampTile = ref(205);
const bind = reactive({ pieceId: '', cityId: '' });
const admit = reactive({ cityId: '', troops_cap: 60, battleMapId: 'ki-1995:siege:7' });
const road = reactive({ fromCityId: '', toCityId: '', travelKind: 'land', geometry: '' });
const siegeOptions = Array.from({ length: 192 }, (_, i) => `ki-1995:siege:${i}`);
async function run(action) {
  try { await action(); }
  catch (error) { props.model.message = error.message ?? String(error); }
}
</script>
<template>
  <section v-if="model?.gameScoped" id="new-city-panel" class="module-card">
    <h3>新據點：建檔 → 放圖塊 → 綁定 → 接見 → 加路</h3>
    <p>走廊須先用裝飾素材鋪好（埠 D4..DD、腹地 B8..DD）；放圖塊前請先在地圖工作台保存其它地圖修改，綁定／接見／加路後請重新載入地圖。各步皆為直接寫入，發布前請走檢驗。</p>
    <p id="new-city-status" role="status">{{ model.message }}</p>
    <h4>一、建檔（據點主表）</h4>
    <div class="module-toolbar">
      <label>名稱<ElInput v-model="create.name" maxlength="12" /></label>
      <label v-for="key in ['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']" :key="key">{{ key }}<ElInput :model-value="create.numbers[key]" inputmode="numeric" @input="create.numbers[key] = $event" /></label>
      <ElButton :disabled="busy || model.locked" @click="run(() => actions.createCity(create))">建檔</ElButton>
    </div>
    <h4>二、放圖塊（地圖工作台選位後）</h4>
    <div class="module-toolbar">
      <label>中心圖號<ElSelect v-model="stampTile"><ElOption v-for="tile in [203, 204, 205, 206, 207, 208, 209, 210, 211]" :key="tile" :value="tile" :label="`0x${tile.toString(16).toUpperCase()}（${tile}）`" /></ElSelect></label>
      <span>地圖已選：{{ mapSelected ? `${mapSelected.x}, ${mapSelected.y}（${mapSelected.name}）` : '未選' }}</span>
      <ElButton :disabled="busy || model.locked" @click="run(() => {
        if (!mapSelected || mapSelected.layer !== 'base') { model.message = '請先在地圖上點選一個空格（底圖格）再放置圖塊。'; return; }
        return mapActions.command('city-stamp', { tile: stampTile });
      })">在選位放置圖塊</ElButton>
    </div>
    <h4>三、綁定（圖塊 ↔ 檔案）</h4>
    <div class="module-toolbar">
      <label>未綁定圖塊<ElSelect v-model="bind.pieceId"><ElOption v-for="piece in model.unboundPieces" :key="piece.id" :value="piece.id" :label="`${piece.x}, ${piece.y}（…${piece.id.slice(-8)}）`" /></ElSelect></label>
      <label>據點檔案<ElSelect v-model="bind.cityId" filterable><ElOption v-for="city in model.cities.filter(c => !c.placed)" :key="city.cityId" :value="city.cityId" :label="`${city.name}［${city.cityId}］`" /></ElSelect></label>
      <ElButton :disabled="busy || model.locked" @click="run(() => actions.bindCity(bind))">綁定</ElButton>
      <ElButton :disabled="busy" @click="run(() => actions.refresh())">重讀</ElButton>
    </div>
    <h4>四、接見（全章 admit）</h4>
    <div class="module-toolbar">
      <label>據點檔案<ElSelect v-model="admit.cityId" filterable><ElOption v-for="city in model.cities" :key="city.cityId" :value="city.cityId" :label="`${city.name}［${city.cityId}］${city.placed ? '' : '（未放）'}`" /></ElSelect></label>
      <label>城兵上限<ElInput :model-value="admit.troops_cap" inputmode="numeric" @input="admit.troops_cap = $event" /></label>
      <label>攻城戰場<ElSelect v-model="admit.battleMapId" filterable><ElOption v-for="id in siegeOptions" :key="id" :value="id" :label="id" /></ElSelect></label>
      <ElButton :disabled="busy || model.locked" @click="run(() => actions.admitCity(admit))">接見</ElButton>
    </div>
    <h4>五、加路（走廊鋪好後）</h4>
    <div class="module-toolbar">
      <label>起點<ElSelect v-model="road.fromCityId" filterable><ElOption v-for="city in model.cities.filter(c => c.placed)" :key="city.cityId" :value="city.cityId" :label="`${city.name}［${city.cityId}］`" /></ElSelect></label>
      <label>訖點<ElSelect v-model="road.toCityId" filterable><ElOption v-for="city in model.cities.filter(c => c.placed)" :key="city.cityId" :value="city.cityId" :label="`${city.name}［${city.cityId}］`" /></ElSelect></label>
      <label>行旅<ElSelect v-model="road.travelKind"><ElOption value="land" label="land" /><ElOption value="water" label="water" /></ElSelect></label>
      <label>路徑（x,y;…）<ElInput v-model="road.geometry" placeholder="191,249;191,250;191,251" /></label>
      <ElButton :disabled="busy || model.locked" @click="run(() => actions.addRoad(road))">加路</ElButton>
    </div>
    <p>已放 {{ model.cities.filter(c => c.placed).length }}／{{ model.cities.length }} 城；未綁定圖塊 {{ model.unboundPieces.length }}；共 {{ model.chapters }} 章。</p>
  </section>
</template>
