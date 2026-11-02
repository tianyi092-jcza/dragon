// 太守（內政官）章節屬性寫入器（計劃第 7 步，2026-11）。
// 只用固定源 Web 輸入與共享寫入器：無 DOS 存檔、資料庫、瀏覽器 profile、認證或執行期授權。
// 原版證據（.agents/skills/re-domestic-diplomacy §1）：
//   · 任命 0x6AD8..0x6AEA 只寫 general[+0x17]=2 與 city[+0x19]，不改 general[+0x1A]；
//   · 手動解任 0x6B08→0x6B4F 清 city[+0x19]、general[+0x17]、general[+0x1A]；
//   · 候選 0x7663/0x76A0 要求活動、同屬本勢力、general[+0x17]==0、非君主。
// 城記錄 +0x19 的編碼與 materialize／content_pipeline 同一組位元組（0xFF＝空）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { factionNativeConsistencyGaps } from '../web/src/content/authoring/factionconsistency.js';
import { validateGameSource, setCityGovernor, setChapterCityFaction, setStrategist, setGeneralActive, setGeneralStatus } from '../web/src/content/authoring/gamesource.js';

const byte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const table = state => Array.isArray(state.nativeCityRecordRaw) ? state.nativeCityRecordRaw : [];
const postsOf = (state, idx) => {
  const posts = [];
  for (const f of state.factions) {
    if (f.monarch_idx === idx) posts.push({ slot: f.idx, post: 'monarch' });
    if (f.advisor_idx === idx) posts.push({ slot: f.idx, post: 'strategist' });
    if (f.diplomat_idx === idx) posts.push({ slot: f.idx, post: 'diplomat' });
  }
  for (const c of state.cities) if (c.governor === idx) posts.push({ slot: c.idx, post: 'governor' });
  return posts;
};
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ allocateEntityId: () => 'chapter-officers-' + Math.random().toString(16).slice(2) }) });
const captured = await profile.capture({ gameId: 'chapter-officers-engineering-1', ownerId: 'chapter-officers-owner' });
const game = captured.game, capability = captured.capability;
assert.equal(game.chapterOrder.length, 20);

test('governor writes +0x19 and the identity byte, and manual release clears the old budget', () => {
  const edited = structuredClone(game), id = edited.chapterOrder[0], state = edited.chapters[id].state;
  const faction = state.factions.find(f => state.cities.some(c => c.faction === f.idx));
  assert.ok(faction, 'pinned chapter needs a faction that owns a city');
  const city = state.cities.find(c => c.faction === faction.idx && c.governor === null);
  const candidate = state.generals.find(g => g.idx !== 127 && g.faction === faction.idx && g.active === true && g.status === 0 && !postsOf(state, g.idx).length && g.is_monarch !== true);
  assert.ok(city && candidate, 'pinned chapter needs a governor-less city and a free active member');
  const oldOwner = byte(city.raw, 0x1a);
  // 任命：寫 governor 與 +0x19，身份改 2，不動舊預算。
  candidate.assignment_budget = 7;
  assert.deepEqual(setCityGovernor(edited, id, city.idx, candidate.idx), { replaced: null });
  assert.equal(city.governor, candidate.idx);
  assert.equal(byte(city.raw, 0x19), candidate.idx);
  if (typeof table(state)[city.idx] === 'string') assert.equal(byte(table(state)[city.idx], 0x19), candidate.idx);
  assert.equal(candidate.status, 2);
  assert.equal(candidate.assignment_budget, 7, '任命不清舊預算（原版實錘）');
  assert.equal(byte(city.raw, 0x1a), oldOwner, '舊所屬 +0x1A 永不改寫');
  assert.deepEqual(factionNativeConsistencyGaps(state, id), []);
  assert.deepEqual(validateGameSource(edited, { draft: true }), []);
  // 重複任命同一人為冪等。
  assert.deepEqual(setCityGovernor(edited, id, city.idx, candidate.idx), { replaced: null });
  // 撤任：governor 與 +0x19 回空哨兵，身份回 0，舊預算清零（0x6B08→0x6B4F）。
  assert.deepEqual(setCityGovernor(edited, id, city.idx, null), { replaced: candidate.idx });
  assert.equal(city.governor, null);
  assert.equal(byte(city.raw, 0x19), 0xff);
  if (typeof table(state)[city.idx] === 'string') assert.equal(byte(table(state)[city.idx], 0x19), 0xff);
  assert.equal(candidate.status, 0);
  assert.equal(candidate.assignment_budget, 0);
  assert.equal(byte(city.raw, 0x1a), oldOwner);
  assert.deepEqual(validateGameSource(edited), []);
});

test('governor refuses neutral cities, foreign generals, inactive or posted generals', () => {
  const edited = structuredClone(game), id = edited.chapterOrder[0], state = edited.chapters[id].state;
  const neutral = state.cities.find(c => c.faction === null);
  const owned = state.cities.find(c => c.faction !== null && c.governor === null);
  const faction = owned.faction;
  const foreign = state.generals.find(g => g.idx !== 127 && g.faction !== null && g.faction !== faction && !postsOf(state, g.idx).length);
  assert.ok(neutral && owned && foreign);
  assert.throws(() => setCityGovernor(edited, id, neutral.idx, foreign.idx), /neutral city cannot have a governor/);
  assert.throws(() => setCityGovernor(edited, id, owned.idx, foreign.idx), /must belong to the city faction/);
  assert.throws(() => setCityGovernor(edited, id, owned.idx, 127), /ordinary general slot/);
  assert.throws(() => setCityGovernor(edited, id, owned.idx, 999), /ordinary general slot/);
  assert.throws(() => setCityGovernor(edited, id, 192, foreign.idx), /chapter city idx/);
  const inactive = state.generals.find(g => g.idx !== 127 && g.faction === faction && g.active !== true && !postsOf(state, g.idx).length);
  if (inactive) assert.throws(() => setCityGovernor(edited, id, owned.idx, inactive.idx), /must be active/);
  // 君主不能當太守。
  const monarch = state.factions.find(f => f.idx === faction)?.monarch_idx;
  if (monarch !== null && monarch !== undefined) assert.throws(() => setCityGovernor(edited, id, owned.idx, monarch), /monarch cannot be governor/);
  // 已是軍師的武將不能再兼任太守（原版 general[+0x17] 是單一身份欄位）。
  const free = state.generals.find(g => g.idx !== 127 && g.faction === faction && g.active === true && g.status === 0 && !postsOf(state, g.idx).length && g.is_monarch !== true);
  assert.ok(free);
  setStrategist(edited, id, faction, free.idx);
  assert.throws(() => setCityGovernor(edited, id, owned.idx, free.idx), /governor holds another post/);
  setStrategist(edited, id, faction, null);
  // 反過來：已有太守的武將也不能被設為軍師。
  setCityGovernor(edited, id, owned.idx, free.idx);
  assert.throws(() => setStrategist(edited, id, faction, free.idx), /strategist holds another post/);
  // 已有其他城太守的武將不能再兼另一城。
  const another = state.cities.find(c => c.idx !== owned.idx && c.faction === faction && c.governor === null);
  if (another) assert.throws(() => setCityGovernor(edited, id, another.idx, free.idx), /governor holds another post/);
});

test('copy profile replays and reverts the governor command, and refuses unrecorded deltas', () => {
  const id = game.chapterOrder[0], state = game.chapters[id].state;
  const city = state.cities.find(c => c.faction !== null && c.governor === null);
  const faction = city.faction;
  const candidate = state.generals.find(g => g.idx !== 127 && g.faction === faction && g.active === true && g.status === 0 && !postsOf(state, g.idx).length && g.is_monarch !== true);
  assert.ok(candidate);
  const edit = { op: 'city-governor', chapterId: id, cityIdx: city.idx, generalIdx: candidate.idx };
  const edited = structuredClone(game);
  setCityGovernor(edited, id, city.idx, candidate.idx);
  assert.equal(typeof profile.verify(capability, edited, [edit]).sourceDigest, 'string');
  // 同一內容沒有命令歷史即受保護差異。
  assert.throws(() => profile.verify(capability, edited), error => error.code === 'COPY_PROTECTED_DELTA');
  // 命令未寫的欄位仍受保護（直接改預算）。
  const extraBudget = structuredClone(edited);
  extraBudget.chapters[id].state.generals[candidate.idx].assignment_budget = 3;
  assert.throws(() => profile.verify(capability, extraBudget, [edit]), error => error.code === 'COPY_PROTECTED_DELTA');
  // 撤任命令同樣可回放。
  const released = structuredClone(edited);
  setCityGovernor(released, id, city.idx, null);
  assert.equal(typeof profile.verify(capability, released, [edit, { ...edit, generalIdx: null }]).sourceDigest, 'string');
});

test('governor identity stays consistent with explicit status edits', () => {
  const edited = structuredClone(game), id = edited.chapterOrder[0], state = edited.chapters[id].state;
  const city = state.cities.find(c => c.faction !== null && c.governor === null);
  const faction = city.faction;
  const candidate = state.generals.find(g => g.idx !== 127 && g.faction === faction && g.active === true && g.status === 0 && !postsOf(state, g.idx).length && g.is_monarch !== true);
  setCityGovernor(edited, id, city.idx, candidate.idx);
  // 作者把身份改成 0 但保留 governor：這是宣告不一致，必須由缺口檢查報出而不是靜默接受。
  setGeneralStatus(edited, id, candidate.idx, 0);
  const gaps = factionNativeConsistencyGaps(state, id).filter(g => /governor/i.test(String(g.message ?? '') + String(g.code ?? '')));
  const active = validateGameSource(edited, { draft: true });
  assert.ok(gaps.length + active.length > 0, 'status/governor divergence must surface as a gap');
  void setGeneralActive;
});
