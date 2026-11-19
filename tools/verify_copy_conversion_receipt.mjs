// Presentation receipt boundary only; no files, database or user profile.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCopyController } from '../editor-ui/src/copy.js';

const conversion = () => ({ version: 1,
  labels: [{ chapterId: 'private-chapter', sourceNumber: null, sourceName: '原來很長的章節名稱', number: '1', name: '章1' }],
  capitals: [{ chapterId: 'private-chapter', cityIdx: 7, cityName: '首都城', before: null, after: 0 }],
});
async function restored(receipt) {
  const actor = { user: { id: 'owned-admin', role: 'admin', mustChangePassword: false } };
  const key = 'isolated-operation-123456', entries = new Map([['editor-fullcopy-operation:owned-admin', key]]);
  const calls = [], errors = [];
  let model, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const ui = createCopyController({ mode: 'full', authority: () => actor, isBusy: () => false,
    api: async (...args) => { calls.push(args); return receipt; },
    storage: { getItem: name => entries.get(name) ?? null, setItem: (name, value) => entries.set(name, value), removeItem: name => entries.delete(name) },
    publish: value => { model = value; }, gotoGame: () => {},
    work: async fn => { try { await fn(); } catch (error) { errors.push(error); } finally { ui.render(); finish(); } },
  });
  ui.setIdentity(actor); await done;
  return { ui, calls, errors, entries, get model() { return model; } };
}
test('committed conversion receipt is visible after original-key recovery without writes or private IDs', async () => {
  const receipt = { gameId: 'owned-game', draftRevision: '1', sourceDigest: 'private-digest', chapterConversion: conversion() };
  const before = JSON.stringify(receipt), h = await restored(receipt);
  assert.deepEqual(h.errors, []);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1], undefined);
  assert.match(h.model.message, /轉換明細/);
  assert.match(h.model.conversionDetails, /未編號「原來很長的章節名稱」 → 1「章1」/);
  assert.match(h.model.conversionDetails, /章節 1「首都城」：原始所屬值 空城 → 0/);
  assert.doesNotMatch(h.model.conversionDetails, /private-chapter|private-digest/);
  assert.equal(JSON.stringify(receipt), before);
  assert.equal(h.entries.size, 0);
  h.ui.setIdentity(null); assert.equal(h.model.conversionDetails, '');
});
test('duplicate faction receipt identifies the first retained and later discarded faction', async () => {
  const h = await restored({ gameId: 'owned-game', draftRevision: '1', chapterConversion: { ...conversion(),
    duplicates: [{ chapterId: 'private-chapter', keptFactionIdx: 2, discardedFactionIdx: 11, monarchName: '藏岷', monarchIdx: 107 }],
  } });
  assert.deepEqual(h.errors, []);
  assert.match(h.model.conversionDetails, /勢力丟棄：1 項/);
  assert.match(h.model.conversionDetails, /章節 1「藏岷」：保留原序號 3，丟棄 12/);
  assert.doesNotMatch(h.model.conversionDetails, /private-chapter/);
  assert.ok(h.calls.every(([, body]) => body === undefined));
});
test('shared-capital receipt explains discarding a different monarch without private IDs', async () => {
  const h = await restored({ gameId: 'owned-game', draftRevision: '1', chapterConversion: { ...conversion(),
    duplicates: [{ chapterId: 'private-chapter', keptFactionIdx: 1, discardedFactionIdx: 10,
      monarchName: '劉寧', monarchIdx: 34, reason: 'shared-capital', cityIdx: 116, cityName: '建業' }],
  } });
  assert.deepEqual(h.errors, []);
  assert.match(h.model.conversionDetails, /保留原序號 2，丟棄 11（共用首都「建業」）/);
  assert.doesNotMatch(h.model.conversionDetails, /private-chapter/);
  assert.ok(h.calls.every(([, body]) => body === undefined));
});
test('capital failure keeps actionable source details on original-key recovery, not rename advice', async () => {
  for (const failedDetail of [JSON.stringify({ message: '章節「上1」：「甲」與「乙」共用首都「武陵」。' }), undefined, '{broken']) {
    const h = await restored({ gameId: 'owned-game', state: 'failed', rowRevision: '3', failedCode: 'COPY_CHAPTER_CAPITAL', failedDetail });
    assert.deepEqual(h.errors, []);
    assert.match(h.model.message, /不是名稱問題/);
    assert.match(h.model.message, /原件與已有遊戲未修改/);
    assert.doesNotMatch(h.model.message, /可修改後直接重新複製/);
    if (failedDetail?.startsWith('{"message"')) assert.match(h.model.message, /上1.*甲.*乙.*武陵/);
    assert.ok(h.calls.every(([, body]) => body === undefined));
  }
});
test('legacy receipt remains readable without fabricating a conversion report', async () => {
  const h = await restored({ gameId: 'owned-game', draftRevision: '1' });
  assert.deepEqual(h.errors, []); assert.equal(h.model.conversionDetails, '');
  assert.doesNotMatch(h.model.message, /轉換明細/);
});
test('malformed conversion cannot be shown as a verified report or release the original operation', async () => {
  for (const chapterConversion of [null, { ...conversion(), version: 2 }, { ...conversion(), capitals: [{ before: 0 }] }, { ...conversion(), duplicates: null }, { ...conversion(), duplicates: [{}] }]) {
    const h = await restored({ gameId: 'owned-game', draftRevision: '1', chapterConversion });
    assert.equal(h.errors.length, 1); assert.match(h.errors[0].message, /轉換明細格式無效/);
    assert.equal(h.model.conversionDetails, ''); assert.equal(h.entries.size, 1);
    assert.ok(h.calls.every(([, body]) => body === undefined));
  }
});
