// B5 武將庫（遊戲級基礎資料）：空庫、從底層資源導入、章節引用、刪除受阻與
// 受保護原生狀態。作者層表示驗證，不是原生初始化、試玩、發布或 HTTP 權限證明。
import assert from 'node:assert/strict';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { applyGeneralDefinitionEdit, applyChapterPersonEdit, generalDefinitionReferences, effectiveChapterPerson, chapterPeopleProjection, generalLibrarySupported } from '../web/src/content/authoring/generaldefinitions.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader() });
const captured = await profile.capture({ gameId: G, ownerId: 'owned-general-library' });
const base = captured.game, chapterIds = base.chapterOrder;
let checks = 0;

// 1. 新建完整副本的武將庫默認空；庫層可用，章節人物投影是空清單而非未知。
assert.equal(base.sourceRef.kind, 'builtin-copy');
assert.deepEqual(base.generals, {});
assert.equal(generalLibrarySupported(base), true);
const projection = chapterPeopleProjection(base);
assert.deepEqual(projection.chapterPeople.map(row => [row.chapterId, row.people.length]), chapterIds.map(id => [id, 0]));
assert.deepEqual(projection.generalReferences, []);
checks++;

// 2. 從底層資源導入：來源是本遊戲固定源武將記錄；原圖字節只有命中共享頭像庫才帶 SHA。
const source = base.chapters[chapterIds[0]].state.generals.find(row => row.idx !== 127);
assert.ok(source && typeof source.name === 'string');
const image = KAO_MANIFEST.find(row => row.id === String(source.portrait));
const portraitRef = image ? { assetId: image.id, sha256: image.sha256 } : null;
const generalId = G + '#general-' + 'c'.repeat(64);
const create = { op: 'create', generalId, values: { name: source.name, hao: source.hao, portraitRef } };
const imported = applyGeneralDefinitionEdit(base, create);
assert.deepEqual(base.generals, {});
assert.deepEqual(imported.chapters[chapterIds[0]], base.chapters[chapterIds[0]]);
assert.deepEqual(imported.generals[generalId], { name: source.name, zi: '', hao: source.hao, portraitRef, suicideOnCapture: false });
assert.equal(typeof profile.verify(captured.capability, imported, [], [create]).sourceDigest, 'string');
checks++;

// 3. 導入後章節可引用：引用不改原生 128 槽，繼承／覆蓋按庫值計算。
const bind = (chapterId, overrides = {}) => ({ op: 'set', chapterId, generalId, values: { included: true, factionId: null, overrides } });
const reference = bind(chapterIds[3], { name: '章內名' });
assert.deepEqual(generalDefinitionReferences(imported, generalId), []);
const referenced = applyChapterPersonEdit(imported, reference);
assert.deepEqual(generalDefinitionReferences(referenced, generalId).map(row => [row.chapterId, row.overriddenFields]), [[chapterIds[3], ['name']]]);
assert.deepEqual(referenced.chapters[chapterIds[3]].state, base.chapters[chapterIds[3]].state);
assert.deepEqual(effectiveChapterPerson(referenced, chapterIds[3], generalId).values, { name: '章內名', zi: '', hao: source.hao, portraitRef, suicideOnCapture: false });
const proof = profile.verify(captured.capability, referenced, [], [create], [], [reference]);
assert.equal(typeof proof.sourceDigest, 'string');
assert.notEqual(proof.sourceDigest, captured.baselineDigest);
checks++;

// 4. 未記錄的引用或定義不得夾帶；原生狀態仍受保護。
assert.throws(() => profile.verify(captured.capability, referenced, [], [create]), error => error.code === 'COPY_PEOPLE_DELTA');
const tampered = structuredClone(referenced);
tampered.chapters[chapterIds[0]].state.generals[0].force++;
assert.throws(() => profile.verify(captured.capability, tampered, [], [create], [], [reference]), error => error.code === 'COPY_PROTECTED_DELTA');
const unrecordedDefinition = structuredClone(imported);
unrecordedDefinition.generals[G + '#general-' + 'd'.repeat(64)] = { name: '未記錄', hao: '', portraitRef: null };
assert.throws(() => profile.verify(captured.capability, unrecordedDefinition, [], [create]), error => error.code === 'COPY_DEFINITION_DELTA');
checks++;

// 5. 刪除：被章節引用（含未加入章節的配置）時拒絕；逐章移除後可刪，回到原摘要。
assert.throws(() => applyGeneralDefinitionEdit(referenced, { op: 'delete', generalId }), /referenced/);
const unbound = applyChapterPersonEdit(referenced, { op: 'remove', chapterId: chapterIds[3], generalId });
const removedDefinition = applyGeneralDefinitionEdit(unbound, { op: 'delete', generalId });
assert.deepEqual(unbound.generals[generalId], imported.generals[generalId]);
assert.deepEqual(removedDefinition.generals, {});
// 扁平端口按「先定義、後人物」重放，無法表達 create→引用→移除→刪除 的步序；
// 有序端口由 verify_editor_people_history 覆蓋。此處只鎖寫入器：引用存在時拒絕刪除，
// 逐章移除後刪除本身改動 generals 一個根。
assert.equal(profile.verify(captured.capability, imported, [], [create]).sourceDigest !== captured.baselineDigest, true);
checks++;

// 6. 舊槽位字典仍不是庫：不支持且寫入 fail-closed，不靜默重解釋。
const legacy = structuredClone(base);
legacy.generals = { 0: { slot: 0, name: '舊' } };
assert.equal(generalLibrarySupported(legacy), false);
assert.throws(() => applyGeneralDefinitionEdit(legacy, { ...create, generalId: G + '#general-' + 'd'.repeat(64) }), /game-owned general library/);
assert.throws(() => profile.verify(captured.capability, legacy, [], [create]), error => error.code === 'COPY_DEFINITION_DELTA');
checks++;

process.stdout.write(JSON.stringify({ result: 'PASS-GENERAL-LIBRARY', checks, chapters: chapterIds.length, imported: generalId, scope: 'authoring library + chapter references only; no native initialization, HTTP, Trial or publication admission' }) + '\n');
