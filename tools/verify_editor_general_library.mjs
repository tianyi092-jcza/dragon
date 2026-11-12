// 武将库（游戏级身份＋能力基准）与「取消勾选＝不可用」的级联清理。
// 只用 pinned 固定副本与纯内存对象：不碰 HTTP、正式存档或原生初始化授予。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter, assignChapterGeneral, createFaction, setChapterCityFaction, setChapterGeneralFaction, setCityGovernor, setFactionCapital } from '../web/src/content/authoring/gamesource.js';
import { applyChapterPersonEdit, applyGeneralDefinitionEdit, generalDefinitionChangeImpact } from '../web/src/content/authoring/generaldefinitions.js';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = `${G}#general-${'a'.repeat(64)}`;
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { GamePortraits, collectPortraitIds } from '../server/portraits.js';
import { bindPortraitOverrides, buildPortraitOverrides, portraitURL } from '../web/src/core/assets.js';
const portrait = { assetId: '150', sha256: KAO_MANIFEST.find(row => row.id === '150').sha256 };
const ability = { siege: 3, field: 4, naval: 0, force: 11, lead: 12, politics: 13 };
const START = { era: 'ad', year: 208, month: 11, day: 1 };
const loader = createPinnedCopyLoader({ kind: 'full', readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)) });
const { game } = await loader({ gameId: G, ownerId: 'library-probe' });
const chapterId = addBlankChapter(game, { name: '庫測試', start: START });
let groups = 0;

// ① 能力值是游戏级资料库字段：可建库、可读回、旧记录缺省不补默认值。
const created = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '測試', hao: '字', portraitRef: portrait, ability } });
assert.deepEqual(created.generals[id], { name: '測試', zi: '', hao: '字', portraitRef: portrait, suicideOnCapture: false, ability });
assert.deepEqual(game.generals, {}, 'the source game is never mutated');
const legacy = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '舊記錄', hao: '', portraitRef: null } });
assert.deepEqual(legacy.generals[id], { name: '舊記錄', zi: '', hao: '', portraitRef: null, suicideOnCapture: false });
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
const impact = generalDefinitionChangeImpact(people, id, { name: '測試', hao: '字', portraitRef: portrait, ability: { ...ability, force: 14 } });
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

// ⑥ 在任太守也算「在任」：库级删除必须拒绝并保持库完好（原版任命同时写
// general[+0x17]=2 与 city[+0x19]，清空槽位会让太守引用悬空）。
const governed = applyGeneralDefinitionEdit(structuredClone(created), {
  op: 'create', generalId: id2, values: { name: '太守', hao: '', portraitRef: portrait, ability },
});
assignChapterGeneral(governed, chapterId, { generalId: id, name: '君主', hao: '', portrait: 1 });
assignChapterGeneral(governed, chapterId, { generalId: id2, name: '太守', hao: '', portrait: 2 });
createFaction(governed, chapterId, { monarchIdx: 0 });
setFactionCapital(governed, chapterId, 0, 3);
setChapterCityFaction(governed, chapterId, 3, 0);
setChapterGeneralFaction(governed, chapterId, 1, 0);
setCityGovernor(governed, chapterId, 3, 1);
assert.equal(governed.chapters[chapterId].state.cities[3].governor, 1);
assert.equal(governed.chapters[chapterId].state.generals[1].status, 2);
assert.throws(() => applyGeneralDefinitionEdit(governed, { op: 'delete', generalId: id2 }), /holds a chapter post/);
assert.ok(governed.generals[id2], 'the refusal leaves the library intact');
// 解任后即可删除，且槽位回到空位。
setCityGovernor(governed, chapterId, 3, null);
assert.equal(Object.hasOwn(applyGeneralDefinitionEdit(governed, { op: 'delete', generalId: id2 }).generals, id2), false);
groups++;

// ⑤ 人物层勾选＝原生槽位编码：勾选占最小空槽，取消清空留洞，内置章不被改写。
const bridgeBase = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '測試', hao: '字', portraitRef: portrait, ability } });
const includedOnce = applyChapterPersonEdit(bridgeBase, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: {} } });
const slotRecord = includedOnce.chapters[chapterId].state.generals[0];
assert.equal(slotRecord.generalId, id);
assert.equal(slotRecord.name, '測試');
assert.equal(slotRecord.attr, 0x80);
assert.equal(slotRecord.portrait, 150, 'numeric resource 150 fits the native byte');
assert.equal(slotRecord.portraitKey, '150');
assert.deepEqual(slotRecord.ability, ability);
assert.equal(includedOnce.chapters[chapterId].state.generals.length, 128);
const excludedAgain = applyChapterPersonEdit(includedOnce, { op: 'set', chapterId, generalId: id, values: { included: false, factionId: null, overrides: {} } });
assert.equal(excludedAgain.chapters[chapterId].state.generals[0].generalId, null, 'cancel clears the slot and leaves a hole');
assert.equal(excludedAgain.chapters[chapterId].state.generals.length, 128);
// 再次勾選復用同一個最小空槽，不重排其它武將。
const reIncluded = applyChapterPersonEdit(excludedAgain, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: {} } });
assert.equal(reIncluded.chapters[chapterId].state.generals[0].generalId, id);
// 內置章的原生記錄沒有 generalId 鍵：人物層不得改寫它們。
const builtinChapter = game.chapterOrder.find(entry => Object.hasOwn(game.chapters[entry].state, '_src'));
const builtinBefore = structuredClone(game.chapters[builtinChapter].state.generals);
const builtinTouched = applyChapterPersonEdit(bridgeBase, { op: 'set', chapterId: builtinChapter, generalId: id, values: { included: true, factionId: null, overrides: {} } });
assert.deepEqual(builtinTouched.chapters[builtinChapter].state.generals, builtinBefore);
groups++;

// Web resource IDs span 0..620; never truncate large IDs into the DOS byte.
for (const assetId of ['0', '150', '255', '256', '620']) {
  const entry = KAO_MANIFEST.find(row => row.id === assetId);
  const portraitRef = { assetId, sha256: entry.sha256 };
  const base = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '綁定', hao: '', portraitRef, ability } });
  const included = applyChapterPersonEdit(base, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: {} } });
  const record = included.chapters[chapterId].state.generals[0];
  assert.equal(record.portrait, Number(assetId) <= 255 ? Number(assetId) : 0);
  assert.equal(record.portraitKey, assetId);
  const rows = new GamePortraits().forPublish(collectPortraitIds([record])).map(row => ({ ...row, url: `kao/${row.assetId}.png` }));
  assert.ok(rows.some(row => row.assetId === assetId && row.sha256 === entry.sha256));
  const world = {};
  bindPortraitOverrides(world, buildPortraitOverrides([record], rows));
  assert.equal(portraitURL(record, world), `kao/${assetId}.png`);
  let restored;
  try { restored = JSON.parse(JSON.stringify(record)); }
  catch (cause) { throw new Error('portrait record JSON round trip failed', { cause }); }
  assert.deepEqual(restored, record);
  if (Number(assetId) > 255) {
    const existing = applyChapterPersonEdit(includedOnce, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: { portraitRef } } });
    assert.equal(existing.chapters[chapterId].state.generals[0].portrait, 150, 'existing byte survives a large-ID override');
    assert.equal(existing.chapters[chapterId].state.generals[0].portraitKey, assetId);
    const clearedPortrait = applyChapterPersonEdit(existing, { op: 'set', chapterId, generalId: id, values: { included: true, factionId: null, overrides: { portraitRef: null } } });
    assert.equal(clearedPortrait.chapters[chapterId].state.generals[0].portraitKey, null);
  }
  groups++;
}

process.stdout.write(`${JSON.stringify({ groups, scope: 'pinned fixed copy + in-memory objects only; no HTTP, save, native init or runtime grant' })}\n`);
