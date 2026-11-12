// 管理面：提交过申请即保留行，只有submitted可审批，删除沿既有栅栏/purge。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_review_controller_queue.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installReview } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/review.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const queueRow = (over = {}) => ({
  gameId, state: 'submitted', listed: false, name: '甲', author: '作者甲', description: '首版说明', submittedAt: '2026-01-02T03:04:05.000Z', validatedAt: '2026-01-02T03:04:06.000Z',
  validation: { state: 'passed', checkedAt: '2026-01-02T03:04:06.000Z' }, version: null, nextVersion: '1.0', rowRevision: '7', createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

function harness() {
  let identity = { user: { id: 'admin', version: 1, role: 'admin', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [], workOptions = [];
  let response = null;
  const h = { calls, errors, workOptions, response: handler => { response = handler; }, model: () => model };
  let controller;
  const install = () => { controller = installReview({
    api: async (path, body, options) => { calls.push({ path, body, options }); if (response) return response(path, body); throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    work: async (fn, options) => { workOptions.push(options); if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    publish: value => { model = value; },
    onPurged: () => {},
  }); }; install();
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}

test('refresh builds rows from the slot queue with description and enabled approve', async () => {
  const h = harness();
  h.response(path => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow()] };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const row = h.model().rows[0];
  assert.equal(row.description, '首版说明');
  assert.equal(row.nextVersion, '1.0');
  assert.equal(row.stateKey, 'submitted');
  assert.equal(row.approveDisabled, false);
  assert.match(row.approveHint, /1\.0/);
  assert.equal(row.rejectDisabled, false);
  assert.equal(h.errors.length, 0);
});

test('refresh rejects malformed queue without claiming success', async () => {
  for (const bad of [{ queue: [{ ...queueRow(), description: 1 }] }, { queue: [{ ...queueRow(), gameId: 'x' }] }, { games: [] }]) {
    const h = harness();
    h.response(() => bad);
    await h.actions.refresh();
    assert.equal(h.model().rows.length, 0);
    assert.equal(h.errors.length, 1);
  }
});

test('reject posts empty body and retains the row with review disabled', async () => {
  const h = harness();
  let rejected = false;
  h.response((path, body) => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow(rejected ? { state: 'empty', submittedAt: null } : {})] };
    if (path === `/api/games/${gameId}/copy/reject`) { rejected = true; assert.deepEqual(body, {}); return { gameId, state: 'empty' }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  await h.actions.reject(gameId, '7');
  assert.match(h.model().result, /已驳回/);
  assert.equal(h.model().rows.length, 1);
  assert.equal(h.model().rows[0].approveDisabled, true);
  assert.equal(h.model().rows[0].deleteDisabled, false);
  assert.equal(h.errors.length, 0);
});

test('approve posts empty body and retains the listed game and delete entry', async () => {
  const h = harness();
  let approved = false;
  h.response((path, body) => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow(approved ? { state: 'approved', listed: true, version: '1.0', nextVersion: '1.1' } : {})] };
    if (path === `/api/games/${gameId}/copy/approve`) { approved = true; assert.deepEqual(body, {}); return { gameId, state: 'approved', ordinal: '1.0', copyDigest: 'a'.repeat(64), releaseId: '11111111-1111-4111-8111-111111111112', description: '首版说明', approvedAt: '2026-01-02T03:04:07.000Z' }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  assert.equal(h.model().rows[0].approveDisabled, false);
  assert.match(h.model().rows[0].approveHint, /1\.0/);
  await h.actions.approve(gameId, '7');
  assert.match(h.model().result, /已同意上架版本 1\.0/);
  assert.equal(h.model().rows.length, 1);
  assert.equal(h.model().rows[0].approveDisabled, true);
  assert.equal(h.model().rows[0].rejectDisabled, true);
  assert.equal(h.model().rows[0].deleteDisabled, false);
  assert.equal(h.errors.length, 0);
});

test('reject surfaces server refusal', async () => {
  const h2 = harness();
  h2.response((path) => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow()] };
    if (path === `/api/games/${gameId}/copy/reject`) { const e = new Error('too late'); e.status = 409; e.code = 'SLOT_NOT_SUBMITTED'; throw e; }
    throw new Error('unexpected api: ' + path);
  });
  await h2.actions.refresh();
  await h2.actions.reject(gameId, '7');
  assert.match(h2.model().message, /不在已提交状态/);
  assert.equal(h2.errors.length, 1);
});

test('remove fences then purges, returning the receipt for per-scope display', async () => {
  const h = harness();
  let purged = false;
  const removed = { content_games: 1, content_deletion_fences: 1, game_copies: 2 };
  h.response((path, body) => {
    if (path === '/api/admin/copy/submissions') return { queue: purged ? [] : [queueRow()] };
    if (path === `/api/games/${gameId}/deletion`) { assert.deepEqual(body, { gameId, expectedRowRevision: '7', confirmationName: '甲' }); return { gameId, state: 'fenced', rowRevision: '8', createdAt: '2026-01-02T03:04:07.000Z' }; }
    if (path === `/api/admin/games/${gameId}/purge`) { purged = true; assert.deepEqual(body, { confirmationName: '甲', expectedRowRevision: '8' }); return { gameId, state: 'purged', version: 1, tables: 3, purgedAt: '2026-01-02T03:04:08.000Z', removed, reclamation: { state: 'completed', pointer: 'removed', objects: 1, privateObjects: 49 } }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const progress = [];
  const start = h.calls.length;
  const outcome = await h.actions.remove(gameId, '7', stage => progress.push(stage));
  assert.deepEqual(progress, ['fencing', 'purging', 'refreshing']);
  assert.equal(h.workOptions.at(-1).feedback, 'progress');
  assert.ok(h.calls.slice(start).every(call => call.options?.feedback === 'progress'), 'fence, purge and reload must not show global loading');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.receipt.reclamation.privateObjects, 49);
  assert.deepEqual(outcome.receipt.removed, removed);
  assert.equal(h.model().rows.length, 0);
  assert.equal(h.errors.length, 0);
});

test('remove on an already-fenced game proceeds with the fence revision', async () => {
  const h = harness();
  h.response((path, body) => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow()] };
    if (path === `/api/games/${gameId}/deletion`) return { gameId, state: 'fenced', rowRevision: '8', createdAt: '2026-01-02T03:04:07.000Z' };
    if (path === `/api/admin/games/${gameId}/purge`) { assert.deepEqual(body, { confirmationName: '甲', expectedRowRevision: '8' }); return { gameId, state: 'purged', version: 1, tables: 3, purgedAt: '2026-01-02T03:04:08.000Z', removed: { content_games: 1, content_deletion_fences: 1 }, reclamation: { state: 'pending', code: 'RECLAIMER_UNCONFIGURED', objects: 0 } }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const outcome = await h.actions.remove(gameId, '7');
  assert.equal(outcome.ok, true);
  assert.equal(h.errors.length, 0);
});

test('remove accepts a fence receipt equal to the listed revision (list already current)', async () => {
  const h = harness();
  h.response((path, body) => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow({ rowRevision: '8' })] };
    if (path === `/api/games/${gameId}/deletion`) return { gameId, state: 'fenced', rowRevision: '8', createdAt: '2026-01-02T03:04:07.000Z' };
    if (path === `/api/admin/games/${gameId}/purge`) { assert.deepEqual(body, { confirmationName: '甲', expectedRowRevision: '8' }); return { gameId, state: 'purged', version: 1, tables: 3, purgedAt: '2026-01-02T03:04:08.000Z', removed: { content_games: 1, content_deletion_fences: 1 }, reclamation: { state: 'completed', pointer: 'absent', objects: 0 } }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const outcome = await h.actions.remove(gameId, '8');
  assert.equal(outcome.ok, true);
  assert.equal(h.errors.length, 0);
});

test('remove reports per-table leftovers for scope display on purge failure', async () => {
  const h = harness();
  h.response(path => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow()] };
    if (path === `/api/games/${gameId}/deletion`) return { gameId, state: 'fenced', rowRevision: '8', createdAt: '2026-01-02T03:04:07.000Z' };
    if (path === `/api/admin/games/${gameId}/purge`) { const e = new Error('PURGE_INCOMPLETE'); e.status = 503; e.code = 'PURGE_INCOMPLETE'; e.detail = { tables: ['game_copies'] }; throw e; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const outcome = await h.actions.remove(gameId, '7');
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.errorTables, ['game_copies']);
  assert.match(outcome.error, /残留/);
  assert.match(h.model().result, /game_copies/);
});

test('file cleanup failure retains the row, reports the reason and never requests global loading', async () => {
  const h = harness();
  h.response(path => {
    if (path === '/api/admin/copy/submissions') return { queue: [queueRow({ rowRevision: '8' })] };
    if (path === `/api/games/${gameId}/deletion`) return { gameId, state: 'fenced', rowRevision: '8', createdAt: '2026-01-02T03:04:07.000Z' };
    if (path === `/api/admin/games/${gameId}/purge`) throw Object.assign(new Error('RECLAIM_FAILED'), { code: 'RECLAIM_FAILED', detail: { reason: 'INJECTED_DISK_FAILURE' } });
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const start = h.calls.length;
  const outcome = await h.actions.remove(gameId, '8');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 'RECLAIM_FAILED');
  assert.match(outcome.error, /INJECTED_DISK_FAILURE/);
  assert.equal(h.model().rows[0].deleteDisabled, false);
  assert.ok(h.calls.slice(start).every(call => call.options?.feedback === 'progress'));
});
