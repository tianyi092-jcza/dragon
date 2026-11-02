// 武将库（游戏级身份＋能力基准）与「取消勾选＝不可用」的级联清理。
// 只用 pinned 固定副本与纯内存对象：不碰 HTTP、正式存档或原生初始化授予。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter, assignChapterGeneral, createFaction, setFactionCapital } from '../web/src/content/authoring/gamesource.js';
import { applyChapterPersonEdit, applyGeneralDefinitionEdit, generalDefinitionChangeImpact } from '../web/src/content/authoring/generaldefinitions.js';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = `${G}#general-${'a'.repeat(64)}`;
const portrait = { assetId: 'p0001', sha256: (await import('../web/kao/manifest.js')).KAO_MANIFEST.find(row => row.id === 'p0001').sha256 };
const ability = { siege: 3, field: 4, naval: 0, force: 88, lead: 77, politics: 66 };
const START = { era: 'ad', year: 208, month: 11, day: 1 };
const loader = createPinnedCopyLoader({ kind: 'full', readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)) });
const { game } = await loader({ gameId: G, ownerId: 'library-probe' });
const chapterId = addBlankChapter(game, { name: '庫測試', start: START });
let groups = 0;

// ① 能力值是游戏级资料库字段：可建库、可读回、旧记录缺省不补默认值。
const created = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '測試', hao: '字', portraitRef: portrait, ability } });
assert.deepEqual(created.generals[id], { name: '測試', hao: '字', portraitRef: portrait, ability });
assert.deepEqual(game.generals, {}, 'the source game is never mutated');
const legacy = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '舊記錄', hao: '', portraitRef: null } });
assert.deepEqual(legacy.generals[id], { name: '舊記錄', hao: '', portraitRef: null });
assert.equal(Object.hasOwn(legacy.generals[id], 'ability'), false);
for (const bad of [{ ...ability, force: 256 }, { ...ability, siege: 16 }, { ...ability, naval: -1 }])
  assert.throws(() => applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '壞', hao: '', portraitRef: null, ability: bad } }), RangeError);
// 能力必须六项齐全：缺项是形状错误，不是值域错误。
assert.throws(() => applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '壞', hao: '', portraitRef: null, ability: { siege: 1 } } }), TypeError);
groups++;

// ② 章节可以覆写能力；未覆写时库变更会波及该章。
const work = structuredClone(created);
const { slot } = assignChapterGeneral(work, chapterId, { generalId: id, name: '測試', hao: '字', portrait: 1, ability });
assert.equal(slot, 0);
assert.deepEqual(work.chapters[chapterId].state.generals[0].ability, ability);
const people = applyChapterPersonEdit(work, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: {} } });
const impact = generalDefinitionChangeImpact(people, id, { name: '測試', hao: '字', portraitRef: portrait, ability: { ...ability, force: 90 } });
assert.deepEqual(impact.changedFields, ['ability']);
assert.deepEqual(impact.affectedChapters, [{ chapterId, fields: ['ability'] }]);
groups++;

// ③ 取消勾选＝删除库记录，并清空所有章节对该身份的引用（people 与原生槽位）。
const cleared = applyGeneralDefinitionEdit(people, { op: 'delete', generalId: id });
assert.deepEqual(cleared.generals, {});
assert.equal(Object.hasOwn(cleared.chapters[chapterId], 'people'), false);
assert.equal(cleared.chapters[chapterId].state.generals[0].generalId, null);
assert.equal(cleared.chapters[chapterId].state.generals[0].attr, 0);
assert.equal(people.chapters[chapterId].state.generals[0].generalId, id, 'the source is untouched');
groups++;

// ④ 仍担任本章职务的槽位不会被隐式免职：拒绝，要求先解除。
const withFaction = structuredClone(created);
assignChapterGeneral(withFaction, chapterId, { generalId: id, name: '測試', hao: '字', portrait: 1 });
createFaction(withFaction, chapterId, { monarchIdx: 0 });
setFactionCapital(withFaction, chapterId, 0, 3);
assert.throws(() => applyGeneralDefinitionEdit(withFaction, { op: 'delete', generalId: id }), /holds a chapter post/);
assert.ok(withFaction.generals[id], 'the refusal leaves the library intact');
groups++;

// ⑤ 模板 profile 也接受 materialize 后的中性章節态（2026-11 用户裁决 (a)），
// 但只属于完整副本的原生字段仍被拒。
const id2 = `${G}#general-${'b'.repeat(64)}`;
const { game: templateGame } = await createPinnedCopyLoader({ kind: 'minimal', readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)) })({ gameId: G, ownerId: 'library-probe' });
const templateChapter = addBlankChapter(templateGame, { name: '模板章', start: START });
const templateCreated = applyGeneralDefinitionEdit(templateGame, { op: 'create', generalId: id, values: { name: '模板', hao: '', portraitRef: portrait, ability } });
assignChapterGeneral(templateCreated, templateChapter, { generalId: id, name: '模板', hao: '', portrait: 1, ability });
assert.equal(templateCreated.chapters[templateChapter].state.generals[0].generalId, id);
const templateDeleted = applyGeneralDefinitionEdit(templateCreated, { op: 'delete', generalId: id });
assert.deepEqual(templateDeleted.generals, {});
assert.equal(templateDeleted.chapters[templateChapter].state.generals[0].generalId, null);
const withNativeField = structuredClone(templateCreated);
withNativeField.chapters[templateChapter].state._src = 'builtin';
assert.throws(() => applyGeneralDefinitionEdit(withNativeField, { op: 'create', generalId: id2, values: { name: '外來', hao: '', portraitRef: null } }), /not understood/);
groups++;

process.stdout.write(`${JSON.stringify({ groups, scope: 'pinned fixed copy + in-memory objects only; no HTTP, save, native init or runtime grant' })}\n`);
