// MAP-EXT E2: controller stage->save->reload->undo with the real preview and
// the real server op, stub transport only. No service, store, browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createMapController } from '../editor-ui/src/basemap.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

const { game: captured } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
const gameId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const digestOf = data => 'd'.repeat(64);
let stored = structuredClone(captured);
const calls = [];
const api = async (path, body) => {
  calls.push({ path, body });
  if (body === undefined) return { gameId, data: structuredClone(stored), copyDigest: digestOf(stored) };
  assert.equal(body.module, 'map');
  stored = applyMapWorkspaceEdits(stored, body.patch.edits);
  return { gameId, copyDigest: digestOf(stored) };
};
const work = fn => fn();
let model = null;
const paintLog = [];
const controller = createMapController({ api, work, publish: m => { model = m; }, paint: (source, check) => paintLog.push(!!source), confirm: () => true, gameId });
controller.setIdentity({ user: { id: 'u', role: 'admin', mustChangePassword: false }, version: 1 });

test('controller north loop: stage, save, reload, undo', async () => {
  await controller.actions.reload();
  assert.equal(model.loaded, true);
  assert.equal(model.exists, true);
  await controller.actions.stage({ op: 'map-extent', side: 'north', delta: 1 });
  assert.equal(model.dirty, true);
  assert.equal(model.message, '有尚未保存的修改。');
  const saveCall = calls.length;
  await controller.actions.save();
  assert.ok(calls.length > saveCall, 'save posts the patch');
  const posted = calls.find(c => c.body?.module === 'map');
  assert.deepEqual(posted.body.patch.edits.at(-1), { op: 'map-extent', side: 'north', delta: 1 });
  assert.ok(posted.body.patch.edits.every(e => ['sea-ground-enable', 'map-extent'].includes(e.op)));
  assert.equal(model.dirty, false);
  assert.deepEqual(stored.map.bounds, { minX: 0, minY: -1, width: 384, height: 257, tileSize: 16 });
  await controller.actions.stage({ op: 'map-extent', side: 'north', delta: -1 });
  assert.equal(model.dirty, true);
  controller.actions.undo();
  assert.equal(model.dirty, false);
  assert.deepEqual(stored.map.bounds.minY, -1, 'undo before save writes nothing');
  await controller.actions.stage({ op: 'map-extent', side: 'north', delta: -1 });
  await controller.actions.save();
  assert.deepEqual(stored.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  assert.equal(model.message, '已保存並重新讀取遊戲地圖。');
});

test('controller shows save-gate repairs and keeps the batch for fix-or-undo', async () => {
  let store2 = structuredClone(captured);
  const api2 = async (path, body) => {
    if (body === undefined) return { gameId, data: structuredClone(store2), copyDigest: digestOf(store2) };
    store2 = applyMapWorkspaceEdits(store2, body.patch.edits);
    const err = new Error('MAP_POSITION_INVALID');
    err.status = 422; err.code = 'MAP_POSITION_INVALID';
    err.detail = { problems: [{ message: '道路 road-x 端點沒有連接到所屬據點城門' }] };
    throw err;
  };
  let model2 = null;
  const c2 = createMapController({ api: api2, work, publish: m => { model2 = m; }, paint: () => {}, confirm: () => true, gameId });
  c2.setIdentity({ user: { id: 'u', role: 'admin', mustChangePassword: false }, version: 1 });
  await c2.actions.reload();
  await c2.actions.stage({ op: 'map-extent', side: 'north', delta: 1 });
  await c2.actions.save();
  assert.equal(model2.saveReport.state, 'failed');
  assert.ok(model2.serverProblems.some(p => p.message.includes('road-x')), 'repair item shown');
  assert.equal(model2.dirty, true, 'blocked save keeps the batch');
  c2.actions.undo();
  assert.equal(model2.dirty, true, 'one undo drops the extent batch, auto sea-ground op remains');
  c2.actions.undo();
  assert.equal(model2.dirty, false, 'second undo clears the auto op');
});

test('controller surfaces refusal without losing inputs', async () => {
  await controller.actions.reload();
  assert.throws(() => controller.actions.stage({ op: 'map-extent', side: 'up', delta: 1 }), /北／南／西／東/);
  const postedBefore = calls.filter(c => c.body?.module === 'map').length;
  // Server-side unknown-side refusal through the real op (preview bypassed on purpose).
  stored = applyMapWorkspaceEdits(stored, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  await controller.actions.reload();
  assert.throws(() => applyMapWorkspaceEdits(stored, [{ op: 'map-extent', side: 'up', delta: 1 }]));
  assert.equal(calls.filter(c => c.body?.module === 'map').length, postedBefore, 'no save posted by refused edits');
});
