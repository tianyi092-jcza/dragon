<script setup>
import { computed } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index.mjs';
const props = defineProps({ model: Object, actions: Object, busy: Boolean });
const locked = computed(() => props.busy || !props.model.roles?.known || props.model.roles.locked);
const assignments = [
  { action: 'assignMonarch', label: '立草稿君主', prompt: '新君主普通武將槽（0..126；須為無任職的自由武將，由服務校驗）：' },
  { action: 'assignStrategist', label: '設草稿軍師', prompt: '新軍師普通武將槽（0..126；任職資格由服務校驗；清空請使用獨立按鈕）：' },
  { action: 'succeedMonarch', label: '指定繼任者免君主', prompt: '指定繼任普通武將槽（0..126；須為無任職的自由武將；解散請使用獨立按鈕）：' },
];
function assign(command, chapterId, slot) {
  if (locked.value) return;
  const source = props.model;
  const raw = globalThis.prompt(command.prompt);
  if (raw === null || raw === '' || locked.value || props.model !== source) return;
  props.actions[command.action](chapterId, slot, raw.trim() === '' ? NaN : Number(raw));
}
function describe(generals, slot) {
  if (slot === null) return '未配置';
  const general = generals.get(slot);
  if (!general) return `槽 ${slot}／人物資料缺少`;
  if (general.reserved) return `保留槽 ${slot}／${general.name}（非普通任官）`;
  return `槽 ${slot}／${general.name}${general.hao ? `／${general.hao}` : ''}`;
}
const createChapters = computed(() => (props.model.factionCreate?.chapters ?? []).map(chapter => ({ chapterId: chapter.chapterId, name: chapter.name, full: chapter.full })));
const createSelection = computed(() => props.model.factionCreate?.chapters?.find(chapter => chapter.chapterId === (props.model.factionCreate?.chapterId ?? '')) ?? null);
const createCandidates = computed(() => createSelection.value?.candidates ?? []);
const canCreateFaction = computed(() => !locked.value && Boolean(props.model.factionCreate?.ready) && Boolean(createSelection.value) && !createSelection.value.full && createCandidates.value.some(candidate => String(candidate.slot) === (props.model.factionCreate?.generalSlot ?? '')));
function pickChapter(value) {
  if (locked.value) return;
  props.actions.setFactionCreateField('chapterId', value);
  props.actions.setFactionCreateField('generalSlot', '');
}
function pickMonarch(value) { if (!locked.value) props.actions.setFactionCreateField('generalSlot', value); }
function submitCreate() {
  if (!canCreateFaction.value) return;
  props.actions.createFaction(createSelection.value.chapterId, Number(props.model.factionCreate.generalSlot));
}
const chapters = computed(() => (props.model.roles?.chapters ?? []).map(chapter => {
  const generals = new Map(chapter.generals.map(general => [general.slot, general]));
  return { chapterId: chapter.chapterId, name: props.model.chapters.find(row => row.chapterId === chapter.chapterId)?.name ?? chapter.chapterId,
    ordinaryGenerals: chapter.generals.filter(general => !general.reserved).map(general => ({
      ...general,
      affiliation: general.factionSlot === null ? '無所屬' : `勢力槽 ${general.factionSlot}${chapter.factions.some(faction => faction.slot === general.factionSlot) ? '' : '（本章未列出）'}`,
      appointments: chapter.factions.flatMap(faction => [
        ...(faction.monarchSlot === general.slot ? [`勢力槽 ${faction.slot}：君主`] : []),
        ...(faction.advisorSlot === general.slot ? [`勢力槽 ${faction.slot}：軍師`] : []),
      ]).join('；') || '未見君主／軍師引用',
    })),
    factions: chapter.factions.map(faction => ({ slot: faction.slot,
      monarch: describe(generals, faction.monarchSlot), advisor: describe(generals, faction.advisorSlot),
      canClear: generals.has(faction.advisorSlot) && !generals.get(faction.advisorSlot).reserved,
    })) };
}));
</script>

<template>
  <section id="draft-role-editor">
    <h3>章節角色引用</h3>
    <p>依章與原槽顯示，不把同槽或同名當成跨章同一人物，也不代表任官資格。任命、指定繼任、清空已知普通軍師引用及解散均沿共用草稿記錄。任官資格由服務校驗；解散只作用於本章，成員轉自由、據點轉中立。不刪人物、不補原生計數或初始化，草稿仍可能無法試運行／發布。</p>
    <p>此操作獨立確認，不保存其它表單輸入；回應不明使用上方原鍵查詢／重試，成功後須明確重讀修訂。</p>
    <p v-if="!model.roles?.known" id="draft-role-unknown">角色資料未知或尚未精確重讀；中立定義模式不提供此原槽操作。</p>
    <template v-else>
      <form id="faction-create" class="module-form" @submit.prevent="submitCreate">
        <h4>新建勢力（選君主）</h4>
        <p id="faction-create-hint">{{ model.factionCreate?.hint ?? '未提供新建勢力狀態，不能視為可建立。' }}</p>
        <label>章節<select id="faction-create-chapter" :value="model.factionCreate?.chapterId ?? ''" :disabled="locked || !model.factionCreate?.ready" @change="pickChapter($event.target.value)"><option value="">請選擇章節</option><option v-for="chapter in createChapters" :key="chapter.chapterId" :value="chapter.chapterId">{{ chapter.name }}{{ chapter.full ? '（勢力槽已滿）' : '' }}</option></select></label>
        <label>君主<select id="faction-create-monarch" :value="model.factionCreate?.generalSlot ?? ''" :disabled="locked || !model.factionCreate?.ready || !createSelection" @change="pickMonarch($event.target.value)"><option value="">請選擇武將</option><option v-for="candidate in createCandidates" :key="candidate.slot" :value="String(candidate.slot)">槽 {{ candidate.slot }}／{{ candidate.name }}</option></select></label>
        <ElButton id="faction-create-submit" type="primary" native-type="submit" :disabled="!canCreateFaction">建立勢力</ElButton>
        <p>候選只列本章已出場（已勾選）且無任職的普通武將；G127 保留槽不列入。建立後還必須指定首都才可保存——沒有首都的勢力保存與試運行都會被拒。</p>
      </form>
      <p v-if="!chapters.length">此已讀修訂沒有章節。</p>
      <details v-for="chapter in chapters" :key="chapter.chapterId" :data-role-chapter="chapter.chapterId">
        <summary>{{ chapter.name }}／{{ chapter.chapterId }}</summary>
        <div data-role-roster>
          <h4>普通武將槽位索引（{{ chapter.ordinaryGenerals.length }}）</h4>
          <p>已讀修訂 {{ model.context?.draftRevision ?? '未知' }}；所屬與君主／軍師引用只取自本次已讀資料，不代表自由身或任官資格。未見角色引用不等於沒有其它任職；本章未列出的所屬仍保留原槽號，不改成無所屬。G127不列入；請在任命提示中明確輸入槽號，仍由服務校驗。</p>
          <ul class="chapter-role-roster"><li v-for="general in chapter.ordinaryGenerals" :key="general.slot" :data-role-general="general.slot">槽 {{ general.slot }}／{{ general.name }}／字：{{ general.hao || '無' }}<br><span data-role-affiliation>{{ general.affiliation }}</span>／<span data-role-appointments>{{ general.appointments }}</span></li></ul>
          <p v-if="!chapter.ordinaryGenerals.length">此章沒有已讀普通武將。</p>
        </div>
        <div class="entity-table-wrap"><table class="entity-table">
          <thead><tr><th>勢力槽</th><th>君主引用</th><th>軍師引用</th><th>獨立操作</th></tr></thead>
          <tbody><tr v-for="faction in chapter.factions" :key="faction.slot" :data-role-slot="faction.slot">
            <td>{{ faction.slot }}</td><td>{{ faction.monarch }}</td><td data-role-advisor>{{ faction.advisor }}</td>
            <td>
              <ElButton v-for="command in assignments" :key="command.action" :data-role-action="command.action" :disabled="locked" @click="assign(command, chapter.chapterId, faction.slot)">{{ command.label }}</ElButton>
              <ElButton data-role-clear :disabled="locked || !faction.canClear" @click="actions.clearStrategist(chapter.chapterId, faction.slot)">清空草稿軍師引用</ElButton>
              <ElButton data-role-disband :disabled="locked" @click="actions.disbandFaction(chapter.chapterId, faction.slot)">解散草稿勢力</ElButton>
            </td>
          </tr></tbody>
        </table></div>
        <p v-if="!chapter.factions.length">此章沒有已列出的勢力。</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.chapter-role-roster { max-height: 12rem; overflow: auto; }
</style>
