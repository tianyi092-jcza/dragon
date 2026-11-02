// 工作台端到端（headless 段）：复制完整副本 → 建章 → 三面设定 → 保存回放 →
// 全章校驗 → 试运行编译 → 编译产物确定性。
// 上架／管理员同意／删旧游戏走 HTTP 与数据库，不在本脚本范围（分片验证已存在：
// verify_editor_authoring_context、verify_editor_backend_admin_copy、
// verify_editor_backend_deletion_*、verify_trial_app_boot）。
// 只用 pinned 固定源与内存对象：不碰 HTTP、正式存档或原生初始化授予。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CHAPTER_EDIT_OPS, FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter, assignChapterGeneral, chapterActiveGaps, createFaction,
  setChapterCityFaction, setChapterGeneralFaction, setChapterStart, setFactionCapital,
  setStrategist } from '../web/src/content/authoring/gamesource.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';
import { validateGameSource } from '../web/src/content/authoring/gamesource.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const loader = kind => createPinnedCopyLoader({ kind, readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)) });
const profile = new FixedCopyProfile({ loadCopy: loader('full') });
const context = { gameId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ownerId: 'workbench-e2e-author' };
const captured = await profile.capture(context), baseline = captured.game;
const START = { era: 'ad', year: 208, month: 11, day: 1 };
const edits = [];
let groups = 0;

// ① 重产：在完整副本里新建一章（带章节态：192 中立据点 + 128 空槽）。
const game = structuredClone(baseline);
edits.push({ op: 'add-blank', name: '端到端章', start: START });
const chapterId = addBlankChapter(game, { name: '端到端章', start: START });
const state = game.chapters[chapterId].state;
assert.equal(state.cities.length, 192);
assert.equal(state.generals.length, 128);
assert.deepEqual(state.factions, []);
groups++;

// ② 三面设定：年代、据点所属与首都、武将勾选与势力、内政官。
edits.push({ op: 'start-date', chapterId, values: { month: 12, day: 3 } });
setChapterStart(game, chapterId, { month: 12, day: 3 });
for (const [n, name, hao] of [[0, '甲', '甲乙'], [1, '乙', '乙乙'], [2, '丙', '丙丙'], [3, '丁', '丁丁']]) {
  const values = { generalId: `e2e-${n}`, name, hao, portrait: n + 1, ability: { siege: 2, field: 3, naval: 0, force: 60 + n, lead: 50 + n, politics: 40 + n } };
  edits.push({ op: 'general-assign', chapterId, values });
  assignChapterGeneral(game, chapterId, values);
}
edits.push({ op: 'create-faction', chapterId, monarchIdx: 0 });
createFaction(game, chapterId, { monarchIdx: 0 });
// 首都必须是本势力据点：先把 12 号据点划给势力 0，再设为首都。
edits.push({ op: 'city-faction', chapterId, cityIdx: 12, factionId: 0 });
setChapterCityFaction(game, chapterId, 12, 0);
edits.push({ op: 'set-capital', chapterId, factionIdx: 0, cityIdx: 12 });
setFactionCapital(game, chapterId, 0, 12);
// 内政官／外交官必须属于本势力：先把两人的所属写进势力 0。
for (const generalIdx of [1, 2]) {
  edits.push({ op: 'general-faction', chapterId, generalIdx, factionId: 0 });
  setChapterGeneralFaction(game, chapterId, generalIdx, 0);
}
edits.push({ op: 'set-strategist', chapterId, factionIdx: 0, generalIdx: 1 });
setStrategist(game, chapterId, 0, 1);
// 章节设置只开放军师：内政官（据点）与外交官（势力）不在建章阶段设置，
// 两者保持默认空值（+2 = 0x7F、+2A = 0xFF、城 +0x19 = 0xFF）。
assert.equal(state.factions[0].diplomat_idx, null);
assert.equal(state.cities[12].governor, null);
assert.deepEqual(chapterActiveGaps(state, chapterId), [], 'the new chapter passes every active gate');
groups++;

// ③ 保存回放：同一批命令在可信基线上重放必须逐栏等价（含原生位元组）。
const verified = await profile.verify(captured.capability, game, edits);
assert.match(verified.sourceDigest, /^[0-9a-f]{64}$/);
groups++;

// ④ 全章校驗：整份来源（20 内置章 + 新章）不得出现新的活动缺口。
const gaps = validateGameSource(game, { draft: false });
assert.deepEqual(gaps.filter(gap => String(gap.message ?? '').includes(chapterId)), [], 'the new chapter contributes no source-level gap');
groups++;

// ⑤ 试运行编译：整份来源（含新章）可编译，路网 192 节点且与原据点坐标闭合。
const compiled = compileTrialSource(game, sha);
assert.equal(compiled.roadGraph.nodes.length, 192);
assert.match(compiled.sourceDigest, /^[0-9a-f]{64}$/);
for (const node of compiled.roadGraph.nodes) {
  const record = state.cities.find(city => city.idx === node.id);
  assert.deepEqual([record.x, record.y], [node.x, node.y], `city ${node.id} coordinates match the road node`);
}
groups++;

// ⑥ 确定性：同一来源两次编译产物摘要相同（上架后玩家端读到的就是这份）。
assert.equal(compileTrialSource(game, sha).sourceDigest, compileTrialSource(structuredClone(game), sha).sourceDigest);
groups++;

// ⑦ 章节设置的职务口径（2026-11 用户裁决）：只开放军师，内政官／外交官不设；
//    军师必须是本势力、开局即到场（+0x18 = 0）、非俘虏；可以留空清空。
const officeGame = structuredClone(game);
setStrategist(officeGame, chapterId, 0, null);
assert.equal(officeGame.chapters[chapterId].state.factions[0].advisor_idx, null, 'strategist may stay empty');
const latecomer = structuredClone(game);
setChapterGeneralFaction(latecomer, chapterId, 3, 0);
latecomer.chapters[chapterId].state.generals[3].appear_months = 1;
assert.throws(() => setStrategist(latecomer, chapterId, 0, 3), /appear at chapter start/);
const captive = structuredClone(game);
setChapterGeneralFaction(captive, chapterId, 3, 0);
captive.chapters[chapterId].state.generals[3].status = 4;
assert.throws(() => setStrategist(captive, chapterId, 0, 3), /captive general cannot be strategist/);
assert.deepEqual(Object.keys(CHAPTER_EDIT_OPS).filter(op => CHAPTER_EDIT_OPS[op].blank).sort(),
  ['chapter-reorder', 'city-faction', 'create-faction', 'general-active', 'general-assign', 'general-clear',
    'general-faction', 'general-status', 'set-capital', 'set-strategist', 'start-date'],
  'blank chapters never set a governor or a diplomat');
assert.equal(CHAPTER_EDIT_OPS['city-governor'].blank, false);
assert.equal(CHAPTER_EDIT_OPS['set-diplomat'].blank, false);
groups++;

process.stdout.write(`${JSON.stringify({ groups, chapterId, edits: edits.length,
  scope: 'headless copy→chapter→three-faces→save-replay→source-check→compile; publish/approve/delete stay in HTTP shards' })}\n`);
