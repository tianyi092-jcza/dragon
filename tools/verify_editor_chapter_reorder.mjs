// 章节序号＝chapterOrder 位置（2026-11 用户裁决：允许重排，不新增 ordinal 字段）。
// 只用 pinned 固定副本/中立模板与纯内存对象：不碰 HTTP、正式存档或原生初始化。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { CHAPTER_EDIT_OPS, FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { addBlankChapter, moveChapter } from '../web/src/content/authoring/gamesource.js';
const context = { gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'reorder-author' };
const loader = (kind, extra = {}) => createPinnedCopyLoader({ kind, readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)), ...extra });
const copyProfile = new FixedCopyProfile({ loadCopy: loader('full', { allocateEntityId: (() => { let n = 0; return () => `reorder-${++n}`; })() }) });
const templateProfile = new FixedCopyProfile({ loadCopy: loader('minimal'), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await copyProfile.capture(context), baseline = captured.game;
const template = await templateProfile.capture(context);
const START = { era: 'ad', year: 208, month: 11, day: 1 };
const error = code => candidate => candidate.code === code;
let groups = 0;
// 章节编辑 op 表是分派与白名单的单一真相：集合漂移必须在这里被抓住。
const EXPECTED_OPS = ['rename', 'rename-general', 'portrait', 'set-strategist', 'set-monarch', 'remove-monarch',
  'disband-faction', 'create-faction', 'start-date', 'city-faction', 'set-capital', 'general-faction',
  'general-active', 'general-status', 'general-assign', 'general-clear', 'set-diplomat', 'city-governor',
  'city', 'city-native', 'chapter-reorder'];
assert.deepEqual(Object.keys(CHAPTER_EDIT_OPS).sort(), [...EXPECTED_OPS].sort());
for (const [op, spec] of Object.entries(CHAPTER_EDIT_OPS)) {
  if (spec.structural === true) { assert.equal(op, 'chapter-reorder'); continue; }
  assert.equal(typeof spec.apply, 'function', `${op} needs a replay writer`);
  assert.equal(typeof spec.blank, 'boolean', `${op} needs an explicit blank-chapter decision`);
}
// 原型污染与静默跳过都不成立：op 名只认自有属性。
assert.equal(Object.getPrototypeOf(CHAPTER_EDIT_OPS), null);
for (const hostile of ['__proto__', 'constructor', 'prototype', 'toString', '']) assert.equal(Object.hasOwn(CHAPTER_EDIT_OPS, hostile), false);
groups++;


// ① 写出器：只改顺序，不动章节内容；越界与未知章拒绝。
const reordered = structuredClone(baseline), order = [...reordered.chapterOrder];
const moved = moveChapter(reordered, order[2], 0);
assert.deepEqual(moved, { from: 2, toIndex: 0 });
assert.deepEqual(reordered.chapterOrder, [order[2], order[0], order[1], ...order.slice(3)]);
assert.equal(Object.keys(reordered.chapters).length, order.length);
for (const id of order) assert.deepEqual(reordered.chapters[id], baseline.chapters[id], `${id} content is untouched`);
assert.deepEqual(moveChapter(reordered, order[2], 0), { from: 0, toIndex: 0 }, 'same position is a no-op');
for (const bad of [-1, order.length, 1.5, '1', null]) assert.throws(() => moveChapter(reordered, order[2], bad), RangeError);
assert.throws(() => moveChapter(reordered, 'missing', 0), RangeError);
assert.deepEqual(reordered.chapterOrder, [order[2], order[0], order[1], ...order.slice(3)], 'refusals leave the order intact');
groups++;

// ② 固定副本历史：声明重排可回放；未声明改顺序被拒。
const edits = [{ op: 'add-blank', name: '重排章', start: START }];
const candidate = structuredClone(baseline), created = addBlankChapter(candidate, { name: '重排章', start: START });
edits.push({ op: 'chapter-reorder', chapterId: created, toIndex: 0 });
moveChapter(candidate, created, 0);
assert.equal(typeof copyProfile.verify(captured.capability, candidate, edits).sourceDigest, 'string');
const silent = structuredClone(baseline);
moveChapter(silent, silent.chapterOrder[0], 1);
assert.throws(() => copyProfile.verify(captured.capability, silent, []), error('COPY_PROTECTED_DELTA'));
groups++;

// ③ 中立模板历史：同 writer、同序列；未知字段仍 fail-closed。
const templateEdits = [{ op: 'add-blank', name: '模板重排', start: START }];
const templateCandidate = structuredClone(template.game), templateId = addBlankChapter(templateCandidate, { name: '模板重排', start: START });
templateEdits.push({ op: 'chapter-reorder', chapterId: templateId, toIndex: 0 });
moveChapter(templateCandidate, templateId, 0);
assert.equal(typeof templateProfile.verify(template.capability, templateCandidate, templateEdits).sourceDigest, 'string');
// 模板 profile 的 verify 也走 revertAppliedChapterEdits：未声明栏位同样 fail-closed，
// 只是拒绝码是 COPY_PROTECTED_DELTA（不是模板历史专用的 COPY_TEMPLATE_HISTORY）。
assert.throws(() => templateProfile.verify(template.capability, templateCandidate,
  [...templateEdits, { op: 'chapter-reorder', chapterId: templateId, toIndex: 0, extra: 1 }]),
  candidate => /^COPY_/.test(candidate.code));
groups++;

process.stdout.write(`${JSON.stringify({ groups, chapters: baseline.chapterOrder.length,
  scope: 'pinned fixed copy + neutral template, in-memory only; no HTTP, save, native init or runtime grant' })}\n`);
