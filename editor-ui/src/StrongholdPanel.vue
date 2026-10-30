<script setup>
import { ElButton } from 'element-plus/es/components/button/index.mjs';
import CityDefinitionsPanel from './CityDefinitionsPanel.vue';
import { computed } from 'vue';
const props = defineProps({ model: Object, actions: Object, draftModel: Object, draftActions: Object, busy: Boolean });
const nativeChapter = computed(() => props.draftModel?.nativeCities?.chapters.find(chapter => chapter.chapterId === props.draftModel.fields.chapterId));
function chooseGame(event) { props.actions.selectGame(event.target.value); event.target.value = props.model.selected ?? ''; }
function chooseChapter(event) { props.actions.selectChapter(event.target.value); event.target.value = props.model.chapterId ?? ''; }
</script>

<template>
  <section id="stronghold-editor" class="module-card">
    <CityDefinitionsPanel :model="draftModel" :actions="draftActions" :busy="busy" />
    <template v-if="draftModel?.nativeCities">
    <h3>章節據點數值（共用草稿保存）</h3>
    <p>只編輯完整副本既有城市的troops／prod，同步明確欄位的原生來源；不開放其它字段、初始化或運行准入。保存、查詢與原鍵重試使用同一份草稿操作記錄，不捎其它未保存表單。</p>
    <div class="module-toolbar">
      <label>明確修訂<input id="native-city-revision" :value="draftModel.fields.revision" :disabled="busy || draftModel.loadLocked" @input="draftActions.setField('revision', $event.target.value)"></label>
      <ElButton id="native-city-load" :disabled="busy || draftModel.loadLocked || !draftModel.fields.gameId" @click="draftActions.load()">載入此修訂</ElButton>
      <ElButton id="native-city-query" :disabled="busy || draftModel.queryLocked" @click="draftActions.query()">查詢原保存操作</ElButton>
      <ElButton id="native-city-retry" :disabled="busy || draftModel.retryLocked" @click="draftActions.retry()">以原鍵重試原內容</ElButton>
      <label>章節<select id="native-city-chapter" :value="draftModel.fields.chapterId" :disabled="busy || draftModel.nativeCities.locked" @change="draftActions.setField('chapterId', $event.target.value)"><option v-for="chapter in draftModel.nativeCities.chapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }}</option></select></label>
    </div>
    <p>上昇率／防災僅顯示同一已讀修訂：上昇率原值以100為基準，防災不是城壁。缺值保持未知；目前不開放這兩項寫入，也不從原生記錄補值。</p>
    <p>類型代碼僅顯示已保存來源值，不推定類型名稱或允許編輯的範圍；未知不補零。</p>
    <p>歸屬／太守僅顯示同章已保存欄位的槽號，不依名稱推定身份或任職資格；空值／舊回應未提供不補零，也不據此修改歸屬或任免。</p>
    <p id="native-city-message" role="status">{{ draftModel.message }}</p>
    <p v-if="draftModel.nativeCities.known">以下數值來自已讀修訂 {{ draftModel.nativeCities.draftRevision }}；確認保存後須明確載入收據修訂，才可繼續編輯。取消只清該城本地輸入，不讀取或保存。</p>
    <p v-else>尚未讀取完整副本的原生據點清單；中立章及舊回應缺資料時不猜值。</p>
    <div class="entity-table-wrap" tabindex="0"><table id="native-city-table" class="entity-table"><thead><tr><th>據點</th><th>類型代碼（唯讀）</th><th>歸屬／太守（唯讀）</th><th>troops</th><th>prod</th><th>上昇率（唯讀）</th><th>防災（唯讀）</th><th>操作</th></tr></thead><tbody>
      <tr v-for="city in nativeChapter?.cities ?? []" :key="city.idx" :data-native-city="city.idx">
        <td>#{{ city.idx }} {{ city.name }}</td>
        <td data-native-type>{{ city.typeCode ?? '未知' }}</td>
        <td><div data-native-faction>歸屬欄位：{{ city.faction === null ? '未提供／無' : '#' + city.faction }}</div><div data-native-governor>太守欄位：{{ city.governor === null ? '未提供／無' : '#' + city.governor }}</div></td>
        <td><label>上限 {{ city.troopsCap ?? '未知' }}<input data-native-field="troops" type="number" min="0" :max="city.troopsCap" :value="city.inputs.troops" :disabled="busy || draftModel.nativeCities.locked || city.troopsCap === null" @input="draftActions.setNativeCityInput(nativeChapter.chapterId, city.idx, 'troops', $event.target.value)"></label></td>
        <td><label>上限 {{ city.maxProd ?? '未知' }}<input data-native-field="prod" type="number" min="0" :max="city.maxProd" :value="city.inputs.prod" :disabled="busy || draftModel.nativeCities.locked || city.maxProd === null" @input="draftActions.setNativeCityInput(nativeChapter.chapterId, city.idx, 'prod', $event.target.value)"></label></td>
        <td data-native-growth><template v-if="city.growth !== null">原值 {{ city.growth }}（相對100：{{ city.growth - 100 }}）</template><template v-else>未知</template></td>
        <td data-native-defence>{{ city.defence ?? '未知' }}</td>
        <td><ElButton data-native-save :disabled="busy || draftModel.nativeCities.locked || !city.dirty" @click="draftActions.saveNativeCityInputs(nativeChapter.chapterId, city.idx)">保存據點數值</ElButton><ElButton data-native-cancel :disabled="busy || draftModel.nativeCities.locked || !city.dirty" @click="draftActions.cancelNativeCityInputs(nativeChapter.chapterId, city.idx)">取消此城輸入</ElButton></td>
      </tr>
    </tbody></table></div>
    </template>
    <h3>據點引用檢查（獨立唯讀資料）</h3>
    <p>基礎據點鎖定192座、槽位與座標凍結，不開放新增／改圖／刪除；此表只供引用檢查，數值編輯使用上方共用草稿表。刪除檢查只列出阻止項，不會刪除據點。定義ID來自已讀地圖資料，不依據名稱或表格位置推算；缺少資料顯示未知。</p>
    <div class="module-toolbar">
    <ElButton id="stronghold-refresh" :disabled="busy || model.locked" @click="actions.refresh()">讀取遊戲清單</ElButton>
    <label>遊戲<select id="stronghold-games" :value="model.selected ?? ''" :disabled="busy || model.locked" @change="chooseGame"><option v-if="model.selected && !model.games.some(g => g.gameId === model.selected)" :value="model.selected" disabled>目前遊戲：{{ model.selected }}（本面板未列出，請讀取清單）</option><option v-for="game in model.games" :key="game.gameId" :value="game.gameId">{{ game.label }}</option></select></label>
    <ElButton id="stronghold-inspect" :disabled="busy || model.locked || !model.selected" @click="actions.inspect()">讀取據點表</ElButton>
    <label>章節<select id="stronghold-chapters" :value="model.chapterId ?? ''" :disabled="busy || model.locked" @change="chooseChapter"><option v-for="chapter in model.chapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }}</option></select></label>
    </div>
    <p>{{ model.context }}<strong v-if="model.dirty">／有未保存數值</strong></p>
    <p id="stronghold-message" role="status">{{ model.message }}</p>
    <div id="stronghold-cities" class="entity-table-wrap" tabindex="0" aria-label="據點數值表"><table class="entity-table"><thead><tr><th>據點／引用</th><th>troops</th><th>prod</th><th>操作</th></tr></thead><tbody>
      <tr v-for="city in model.cities" :key="city.idx" :data-city-idx="city.idx">
        <td>#{{ city.idx }} {{ city.name }}／勢力 {{ city.faction }}<br><span class="city-definition-id">定義ID：{{ city.cityId ?? '未知' }}</span><br>道路 {{ city.roadCount }}／章節 {{ city.chapterCount }}</td>
        <td><label>上限 {{ city.troopsCap ?? '?' }}：{{ city.troops }}</label></td>
        <td><label>上限 {{ city.maxProd ?? '?' }}：{{ city.prod }}</label></td>
        <td><div class="account-row-actions"><ElButton :disabled="busy || model.locked" @click="actions.blockers(city.idx)">刪除檢查</ElButton></div></td>
      </tr>
    </tbody></table></div>
  </section>
</template>
