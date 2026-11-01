// B8 全章匯總校驗（上架前）：pinned 20 章完整副本＋受控刪除變體。
// 只讀固定 Web 輸入與共用判定，不開 SQLite／瀏覽器／認證，也不讀任何 DOS 存檔。
// 目的是鎖定「哪些章因基礎資料被刪除而引用不到」這份逐章清單，以及它在
// 上架門裡先於通用結構錯誤的位置；不宣稱能從作者介面製造這種缺口。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { chapterBaseReferenceGaps, chapterReferenceReport, validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { HttpError, fail } from '../server/security.js';

let checks = 0, record = 0;
const check = () => checks++;
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'chapter-references-' + ++record });
const profile = new FixedCopyProfile({ loadCopy: loader });
const captured = await profile.capture({ gameId: 'chapter-references-engineering-1', ownerId: 'chapter-references-owner' });
const game = captured.game;
const clone = () => structuredClone(game);
const generalId = game.gameId + '#general-' + 'a'.repeat(64);
const person = { included: true, factionId: null, overrides: {} };

assert.equal(game.chapterOrder.length, 20);
assert.deepEqual(chapterBaseReferenceGaps(game), []);
assert.deepEqual(chapterReferenceReport(game), []);
check();

// ① 武將庫定義被刪除，仍被某章引用 → 只有那一章、指名「武將庫」。
const library = clone(), firstChapter = library.chapterOrder[0];
library.generals[generalId] = { name: '測試武將', hao: '字', portraitRef: null };
library.chapters[firstChapter].name = '第一章';
library.chapters[firstChapter].people = { [generalId]: person };
assert.deepEqual(chapterBaseReferenceGaps(library), []);
delete library.generals[generalId];
const generalGaps = chapterBaseReferenceGaps(library);
assert.equal(generalGaps.length, 1);
assert.equal(generalGaps[0].chapterId, firstChapter);
assert.equal(generalGaps[0].chapterName, '第一章');
assert.equal(generalGaps[0].code, 'CHAPTER_GENERAL_MISSING');
assert.match(generalGaps[0].detail, /武將庫/);
check();

// ② 據點定義被刪除 → 所有在原生記錄裡用到該固定槽的章逐章列出，且嚴格結構門
// 只會回一句「requires 192 cities」；所以上架門必須先跑逐章清單。
const cityless = clone();
const [cityId, definition] = Object.entries(cityless.cities)[0];
delete cityless.cities[cityId];
const slotGaps = chapterBaseReferenceGaps(cityless);
const affected = cityless.chapterOrder.filter(id => (cityless.chapters[id].state?.cities ?? []).some(city => city.idx === definition.runtimeSlot));
assert.ok(affected.length > 0);
assert.deepEqual([...new Set(slotGaps.map(gap => gap.chapterId))].sort(), [...affected].sort());
assert.ok(slotGaps.every(gap => gap.code === 'CHAPTER_CITY_SLOT_MISSING' && gap.detail.includes(String(definition.runtimeSlot))));
assert.throws(() => validateGameSource(cityless), /requires 192 cities/);
check();

// ③ 作者層據點配置引用被刪除的定義 → CHAPTER_CITY_MISSING，與槽位缺口並存。
const authoring = clone(), authoringChapter = authoring.chapterOrder[1], referenced = Object.entries(authoring.cities)[5];
authoring.chapters[authoringChapter].cities = { [referenced[0]]: { factionId: null, overrides: {} } };
assert.deepEqual(chapterBaseReferenceGaps(authoring), []);
delete authoring.cities[referenced[0]];
const authoringGaps = chapterBaseReferenceGaps(authoring).filter(gap => gap.chapterId === authoringChapter);
assert.deepEqual(authoringGaps.map(gap => gap.code).sort(), ['CHAPTER_CITY_MISSING', 'CHAPTER_CITY_SLOT_MISSING']);
assert.match(authoringGaps.find(gap => gap.code === 'CHAPTER_CITY_MISSING').detail, /據點定義/);
check();

// ④ chapterOrder 指向不存在的章 → 一筆無章名的 CHAPTER_MISSING，排在最後。
const orphan = clone(), missing = orphan.gameId + '#chapter-missing';
orphan.chapterOrder.push(missing);
const orphanReport = chapterReferenceReport(orphan);
assert.equal(orphanReport.length, 1);
assert.equal(orphanReport[0].chapterId, missing);
assert.equal(orphanReport[0].chapterName, null);
assert.deepEqual(orphanReport[0].problems, [{ code: 'CHAPTER_MISSING', detail: '章節索引指向不存在的章節' }]);
check();

// ⑤ 同一章多個原因合併成一列，順序跟 chapterOrder；不是每筆問題一列。
const grouped = clone();
delete grouped.cities[cityId];
grouped.chapters[grouped.chapterOrder[0]].people = { [generalId]: person };
const groupedReport = chapterReferenceReport(grouped);
const firstRow = groupedReport.find(row => row.chapterId === grouped.chapterOrder[0]);
assert.ok(firstRow.problems.length >= 2);
assert.deepEqual(groupedReport.map(row => row.chapterId), [...new Set(chapterBaseReferenceGaps(grouped).map(gap => gap.chapterId))]);
check();

// ⑥ 拒絕封包：detail 只在帶清單時出現，既有錯誤形狀不變。
const rejected = (() => { try { fail(422, 'PUBLISH_CHAPTER_REFERENCES', { chapters: orphanReport }); } catch (error) { return error; } })();
assert.ok(rejected instanceof HttpError);
assert.equal(rejected.status, 422);
assert.equal(rejected.code, 'PUBLISH_CHAPTER_REFERENCES');
assert.deepEqual(rejected.detail, { chapters: orphanReport });
const plain = (() => { try { fail(404, 'GAME_NOT_FOUND'); } catch (error) { return error; } })();
assert.equal(Object.hasOwn(plain, 'detail'), false);
check();

// ⑦ 真實程式碼接線：逐章清單先於結構門；唯讀入口走既有 draft 路由；錯誤封包轉交 detail。
const editorapp = readFileSync(new URL('../server/editorapp.js', import.meta.url), 'utf8');
const reportAt = editorapp.indexOf('chapterReferenceReport(captured.game)');
const strictAt = editorapp.indexOf('validateGameSource(captured.game)');
assert.ok(reportAt > 0 && strictAt > reportAt, '全章清單必須先於 validateGameSource');
assert.ok(editorapp.includes("if (references.length) { fail(422, 'PUBLISH_CHAPTER_REFERENCES', { chapters: references }); }"));
assert.ok(editorapp.includes("if (draftPath[2] === 'chapter-references')"));
assert.ok(editorapp.includes('this.privateDrafts.chapterReferences(tokenHash, draftPath[1], owned.draftRevision)'));
assert.match(editorapp, /chapter-references\|operations/);
assert.ok(editorapp.includes('return response(detail === undefined ? { error: code } : { error: code, detail }, status);'));
const drafts = readFileSync(new URL('../server/drafts.js', import.meta.url), 'utf8');
assert.ok(drafts.includes('async chapterReferences(tokenHash, gameId, requested)'));
assert.ok(drafts.includes('chapters: chapterReferenceReport(game)'));
const client = readFileSync(new URL('../server/public/publish.txt', import.meta.url), 'utf8');
assert.ok(client.includes("'/api/games/' + gameId + '/draft/chapter-references'"));
assert.ok(client.includes('PUBLISH_CHAPTER_REFERENCES'));
assert.ok(client.includes("checkDisabled: !visible || isBusy() || sending"));
check();

process.stdout.write(JSON.stringify({ checks, chapters: game.chapterOrder.length, scope: 'pinned 20-chapter copy + controlled base-data deletion variants; shared check and route wiring only, no SQLite/browser/auth/DOS save' }) + '\n');
