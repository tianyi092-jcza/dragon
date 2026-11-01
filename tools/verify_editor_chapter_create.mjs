// 章節創作（Web 作者層，非原版機制）驗證：新章 writer 形狀、固定副本／中立模板
// 歷史回放、以及控制器只送一筆 add-blank 命令。不含 HTTP 服務、原生初始化或運行准入。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter } from '../web/src/content/authoring/gamesource.js';
const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const readByte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const readWord = (raw, offset) => readByte(raw, offset) + readByte(raw, offset + 1) * 256;
const START = { era: 'ad', year: 208, month: 11, day: 1 };
const context = { gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'chapter-create-author' };
const loader = (kind, extra = {}) => createPinnedCopyLoader({ kind, readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)), ...extra });
const copyProfile = new FixedCopyProfile({ loadCopy: loader('full', { allocateEntityId: (() => { let n = 0; return () => `chapter-create-${++n}`; })() }) });
const templateProfile = new FixedCopyProfile({ loadCopy: loader('minimal'), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await copyProfile.capture(context), baseline = captured.game;
const template = await templateProfile.capture(context);

test('新章 writer：章名 trim／NFC、章節態與中立據點引用，舊呼叫仍得空殼', async () => {
  const game = structuredClone(baseline), chapterId = addBlankChapter(game, { name: '  赤壁之戰  ', start: START });
  const chapter = game.chapters[chapterId];
  assert.equal(chapter.name, '赤壁之戰');
  assert.equal(game.chapterOrder.at(-1), chapterId);
  assert.deepEqual(chapter.state.start, START);
  assert.equal(chapter.state.factions.length, 0);
  assert.equal(chapter.state.cities.length, 192);
  assert.equal(chapter.state.generals.length, 128);
  assert.deepEqual(chapter.state.nativeCityRecordRaw, chapter.state.cities.map(city => city.raw));
  assert.equal(Object.keys(chapter.cities).length, 192);
  assert.ok(Object.values(chapter.cities).every(ref => ref.factionId === null && Object.keys(ref.overrides).length === 0));
  // 遊戲級常數沿用本遊戲的據點定義；未證實位元組與鄰接表不得改寫。
  const source = baseline.chapters[baseline.chapterOrder[0]].state.cities;
  for (const [slot, city] of chapter.state.cities.entries()) {
    assert.equal(city.idx, slot);
    assert.equal(city.faction, null);
    assert.equal(city.governor, null);
    assert.equal(readByte(city.raw, 0x01), 0x18);
    assert.equal(readByte(city.raw, 0x19), 0xff);
    assert.equal(city.raw.slice(0x1c * 2), source[slot].raw.slice(0x1c * 2));
    assert.equal(readWord(city.raw, 0x08), source[slot].x);
  }
  assert.ok(chapter.state.generals.every(general => general.active === false && general.faction === null && general.join_faction === null));
  assert.ok(chapter.state.generals.every(general => (general.attr & 0x80) === 0));
  // 舊呼叫（無 options）仍是空殼：內部投影與舊歷史靠這個形狀回放。
  const legacy = structuredClone(baseline), legacyId = addBlankChapter(legacy);
  assert.deepEqual(Object.keys(legacy.chapters[legacyId]).sort(), ['chapterId', 'cities', 'name', 'state']);
  assert.deepEqual(legacy.chapters[legacyId].state, { factions: [], generals: [], cities: [] });
  // 拒絕面：日期域、缺年份、非整數、未知紀年、章名空白。
  for (const start of [{ year: 0, month: 1, day: 1 }, { year: 200, month: 13, day: 1 }, { year: 200, month: 1, day: 32 }, { month: 1, day: 1 }, { year: 200.5, month: 1, day: 1 }, { era: 'ce', year: 200, month: 1, day: 1 }])
    assert.throws(() => addBlankChapter(structuredClone(baseline), { start }), RangeError);
  assert.throws(() => addBlankChapter(structuredClone(baseline), { name: '   ', start: START }), RangeError);
});

test('固定副本：add-blank 帶章名與年代可回放，任何竄改都被拒', () => {
  const candidate = structuredClone(baseline), chapterId = addBlankChapter(candidate, { name: '新戰役', start: START });
  const edits = [{ op: 'add-blank', name: '新戰役', start: START }];
  assert.equal(typeof copyProfile.verify(captured.capability, candidate, edits).sourceDigest, 'string');
  for (const mutate of [
    chapter => { chapter.state.cities[0].troops += 1; },
    chapter => { chapter.state.start.year = 209; },
    chapter => { chapter.state.factions.push({ idx: 0 }); },
    chapter => { chapter.name = '另一章'; },
    chapter => { chapter.cities = {}; },
  ]) {
    const tampered = structuredClone(candidate);
    mutate(tampered.chapters[chapterId]);
    assert.throws(() => copyProfile.verify(captured.capability, tampered, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  }
  // 只帶 op 的舊命令不得冒充帶章節態的新章，反之亦然。
  assert.throws(() => copyProfile.verify(captured.capability, candidate, [{ op: 'add-blank' }]), error => error.code === 'COPY_PROTECTED_DELTA');
  const legacy = structuredClone(baseline), legacyId = addBlankChapter(legacy);
  assert.throws(() => copyProfile.verify(captured.capability, legacy, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  assert.equal(typeof copyProfile.verify(captured.capability, legacy, [{ op: 'add-blank' }]).sourceDigest, 'string');
  assert.equal(legacy.chapters[legacyId].state.cities.length, 0);
});

test('中立模板：有序歷史可回放帶章名與年代的新章', () => {
  const candidate = structuredClone(template.game), chapterId = addBlankChapter(candidate, { name: '模板新章', start: { year: 264, month: 2, day: 3 } });
  const steps = [{ chapterEdits: [{ op: 'add-blank', name: '模板新章', start: { year: 264, month: 2, day: 3 } }], generalEdits: [], peopleEdits: [] }];
  const proof = templateProfile.verifyOrderedTemplate(template.capability, candidate, steps);
  assert.equal(typeof proof.sourceDigest, 'string');
  assert.equal(candidate.chapters[chapterId].state.cities.length, 192);
  const tampered = structuredClone(candidate); tampered.chapters[chapterId].state.cities[7].prod += 1;
  assert.throws(() => templateProfile.verifyOrderedTemplate(template.capability, tampered, steps), error => error.code === 'COPY_PROTECTED_DELTA');
  // 未宣告的欄位不得混進命令（原生欄位保持關閉）。
  assert.throws(() => templateProfile.verifyOrderedTemplate(template.capability, candidate, [{ chapterEdits: [{ op: 'add-blank', name: '模板新章', start: { year: 264, month: 2, day: 3 }, chapterId: 'x' }], generalEdits: [], peopleEdits: [] }]), error => error.code === 'COPY_TEMPLATE_HISTORY');
});

test('控制器：新增章節只送一筆 add-blank，成功後清空表單，未就緒與非法輸入不送請求', async () => {
  const gameId = context.gameId, calls = [], errors = [];
  const cities = Array.from({ length: 192 }, (_, idx) => ({ idx, name: `city-${idx}`, typeCode: 0, faction: null, governor: null, troops: 1, prod: 2, troopsCap: 3, maxProd: 4, growth: 5, defence: 6 }));
  const chapter = startDate => {
    const row = { chapterId: `${gameId}#custom-1`, name: '新戰役', gaps: { saveGaps: 0, activeGaps: 1 }, factions: [], generals: [], cities };
    if (startDate !== null) row.startDate = startDate;
    return row;
  };
  const receipt = (draftRevision, startDate) => ({ gameId, draftRevision, profileRevision: 'fixed-copy-resources-1', metadata: { name: '草稿', introduction: '簡介' }, chapters: [chapter(startDate)] });
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'never-project' }, busy = false, model = null, startDate = null;
  const controller = installDraftEditor({
    api: async (path, body, options) => {
      calls.push({ path, body, options });
      if (path === '/api/games') return { games: [{ gameId, draftRevision: '1', metadata: { name: '草稿', introduction: '簡介' } }] };
      if (path.endsWith('/draft/save')) { startDate = body.chapterEdits[0].start; return receipt('2', startDate); }
      const requested = decodeURIComponent(path.split('revision=')[1] ?? '1');
      return receipt(requested, startDate);
    },
    authority: () => identity, isBusy: () => busy, publish: value => { model = value; },
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: () => undefined, setItem: () => {}, removeItem: () => {} },
    confirm: () => true, prompt: () => null,
  });
  controller.setIdentity(identity);
  await controller.actions.refresh(); controller.actions.setField('revision', '1'); await controller.actions.load();
  assert.equal(model.chapterCreate.ready, true);
  assert.equal(model.chapterCreate.era, 'ad');
  const before = calls.length;
  // 未填章名／非整數年代：只報錯，不產生保存請求。
  for (const [field, value] of [['name', '   '], ['year', ''], ['year', '20x8'], ['month', '13'], ['day', '0']]) {
    controller.actions.setChapterCreateField('name', '新戰役'); controller.actions.setChapterCreateField('year', '208');
    controller.actions.setChapterCreateField('month', '11'); controller.actions.setChapterCreateField('day', '1');
    controller.actions.setChapterCreateField(field, value);
    await controller.actions.createChapter();
    assert.equal(calls.length, before);
    assert.ok(errors.length);
    assert.equal(model.chapterCreate.name, field === 'name' ? '   ' : '新戰役');
  }
  errors.length = 0;
  controller.actions.setChapterCreateField('name', '  新戰役  ');
  controller.actions.setChapterCreateField('era', 'bc');
  controller.actions.setChapterCreateField('year', '208'); controller.actions.setChapterCreateField('month', '11'); controller.actions.setChapterCreateField('day', '1');
  controller.actions.setChapterCreateField('era', 'ce'); assert.equal(model.chapterCreate.era, 'bc');
  await controller.actions.createChapter();
  const save = calls.find(call => call.path.endsWith('/draft/save'));
  assert.deepEqual(save.body, { metadata: { name: '草稿', introduction: '簡介' }, resourceEdits: [], chapterEdits: [{ op: 'add-blank', name: '新戰役', start: { era: 'bc', year: 208, month: 11, day: 1 } }] });
  assert.equal(typeof save.options.key, 'string');
  assert.deepEqual(model.chapterCreate, { ...model.chapterCreate, name: '', era: 'ad', year: '', month: '', day: '' });
  assert.deepEqual(model.chapters[0].startDate, { era: 'bc', year: 208, month: 11, day: 1 });
  assert.equal(errors.length, 0);
  // 身份失效後不得送出：命令與表單都留在本頁記憶體。
  identity = { user: { id: 'author', mustChangePassword: true }, csrf: 'never-project' };
  controller.setIdentity(identity); controller.render();
  assert.equal(model.chapterCreate.ready, false);
  controller.actions.setChapterCreateField('name', '不該送出');
  const after = calls.length;
  await controller.actions.createChapter();
  assert.equal(calls.length, after);
  assert.ok(errors.length);
});
