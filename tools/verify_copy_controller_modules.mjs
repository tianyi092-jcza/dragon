// F6 副本链控制器增量：saveCopyModule / readCopySubmission（加法，不碰旧路）。
// UI-controller checks only; transport/backend authorization are tested separately.
// 用法：node --test tools/verify_copy_controller_modules.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const game = (id = gameId) => ({ gameId: id, draftRevision: '1', metadata: { name: '舊', introduction: '稿' } });
const DIGEST_A = 'a'.repeat(64), DIGEST_B = 'b'.repeat(64);

function harness() {
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [], records = new Map();
  let response = null;
  const h = { calls, errors, response: handler => { response = handler; }, model: () => model };
  const controller = installDraftEditor({
    api: async (path, body) => { calls.push({ path, body }); if (response) return response(path, body); if (path === '/api/games') return { games: [game(), game(otherId)] }; throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    publish: value => { model = value; },
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) },
    confirm: () => true, prompt: () => null,
  });
  controller.setIdentity(identity);
  Object.assign(h, {
    controller, actions: controller.actions,
    identity: next => { identity = next; controller.setIdentity(next); },
    busy: value => { busy = value; },
  });
  return h;
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };

test('saveCopyModule posts exact module body, stores digest, clears stale submission', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, updatedAt: '2026-01-02T03:04:05.000Z' }));
  const result = await h.actions.saveCopyModule('metadata', { name: '新名', introduction: '新介' });
  assert.equal(result.copyDigest, DIGEST_A);
  const write = h.calls.find(c => c.path === `/api/games/${gameId}/copy`);
  assert.deepEqual(write.body, { module: 'metadata', patch: { name: '新名', introduction: '新介' } });
  assert.equal(h.model().copy.digest, DIGEST_A);
  assert.equal(h.model().copy.updatedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(h.model().copy.submission, null);
  assert.match(h.model().message, /檢驗票已失效/);
  assert.equal(h.errors.length, 0);
});

test('saveCopyModule guards: busy, logged-out and unselected game send nothing', async () => {
  const h = harness(); await selectGame(h);
  const before = h.calls.length;
  h.busy(true); assert.equal(await h.actions.saveCopyModule('metadata', {}), null); h.busy(false);
  h.identity(null); assert.equal(await h.actions.saveCopyModule('metadata', {}), null);
  assert.equal(h.calls.length, before);
  assert.equal(h.errors.length, 0);
});

test('copy state follows the selected game; switching games hides the other digest', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, updatedAt: null }));
  await h.actions.saveCopyModule('metadata', { name: '甲', introduction: '' });
  assert.equal(h.model().copy.digest, DIGEST_A);
  h.actions.chooseGame(otherId);
  assert.deepEqual(h.model().copy, { digest: null, updatedAt: null, submission: null, validation: null, ticketReady: false, page: null });
  h.actions.chooseGame(gameId);
  assert.equal(h.model().copy.digest, DIGEST_A);
});

test('saveCopyModule surfaces server rejection without claiming success', async () => {
  const h = harness(); await selectGame(h);
  const failure = new Error('未知模組'); failure.status = 422; failure.code = 'COPY_MODULE';
  h.response(() => { throw failure; });
  assert.equal(await h.actions.saveCopyModule('nope', {}), undefined);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].code, 'COPY_MODULE');
  assert.match(h.model().message, /副本保存未確認/);
  assert.equal(h.model().copy.digest, null);
});

test('saveCopyModule rejects mismatched game identity in the receipt', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId: otherId, copyDigest: DIGEST_B, updatedAt: null }));
  assert.equal(await h.actions.saveCopyModule('metadata', {}), undefined);
  assert.equal(h.errors.length, 1);
  assert.match(h.model().message, /副本保存回應無效/);
  assert.equal(h.model().copy.digest, null);
});

test('validateCopy stores passed validation with ticket, failed with problem count', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'ticket-1', problems: [], checkedAt: '2026-01-03T00:00:00.000Z' }));
  await h.actions.validateCopy();
  const write = h.calls.find(c => c.path === `/api/games/${gameId}/copy/validate`);
  assert.deepEqual(write.body, {});
  assert.equal(h.model().copy.validation.state, 'passed');
  assert.equal(h.model().copy.ticketReady, true);
  assert.match(h.model().message, /檢驗通過/);
  h.response(() => ({ gameId, state: 'failed', copyDigest: DIGEST_A, ticket: null, problems: [{ chapterId: 'c1', code: 'CHAPTER_REFERENCE', detail: '缺' }], checkedAt: '2026-01-03T00:01:00.000Z' }));
  await h.actions.validateCopy();
  assert.equal(h.model().copy.validation.problems.length, 1);
  assert.equal(h.model().copy.ticketReady, false);
  assert.match(h.model().message, /檢驗未通過：1 項/);
  assert.equal(h.errors.length, 0);
});
test('submitCopy sends ticket once, clears it, and surfaces stale tickets', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'ticket-9', problems: [], checkedAt: null }));
  await h.actions.validateCopy();
  h.response(() => ({ gameId, state: 'submitted', copyDigest: DIGEST_A, description: '首版', submittedAt: '2026-01-03T00:02:00.000Z' }));
  const result = await h.actions.submitCopy('首版說明\n第二行');
  assert.equal(result.state, 'submitted');
  const post = h.calls.find(c => c.path === `/api/games/${gameId}/copy/submission`);
  assert.deepEqual(post.body, { ticket: 'ticket-9', description: '首版說明\n第二行' });
  assert.equal(h.model().copy.ticketReady, false);
  assert.match(h.model().message, /已提交上架申請/);
  h.response(() => ({ gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'ticket-10', problems: [], checkedAt: null }));
  await h.actions.validateCopy();
  const stale = new Error('票已用過'); stale.status = 409; stale.code = 'VALIDATION_STALE';
  h.response(() => { throw stale; });
  assert.equal(await h.actions.submitCopy('再送'), undefined);
  assert.equal(h.model().copy.ticketReady, false);
  assert.match(h.model().message, /上架申請未確認/);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].code, 'VALIDATION_STALE');
});
test('submitCopy refuses without ticket or description and sends nothing', async () => {
  const h = harness(); await selectGame(h);
  const before = h.calls.length;
  await assert.rejects(h.actions.submitCopy('  '), /請填寫發布說明/);
  await assert.rejects(h.actions.submitCopy('有說明但未檢驗'), /請先通過檢驗/);
  assert.equal(h.calls.length, before);
  assert.equal(h.errors.length, 0);
});
test('readCopySubmission stores blockedReason/publishEnabled and syncs digest', async () => {
  const h = harness(); await selectGame(h);
  const submission = { gameId, state: 'draft', version: null, nextVersion: '1.0', copyDigest: DIGEST_B, copyUpdatedAt: null, validation: { state: 'failed', checkedAt: '2026-01-02T03:04:05.000Z', problems: [{ chapterId: 'c1', code: 'CHAPTER_REFERENCE', detail: 'x' }] }, slot: { state: 'empty', description: null, submittedAt: null, validatedAt: null }, publishEnabled: false, blockedReason: '檢驗未通過，請依紅字修正後重新檢驗。' };
  h.response(() => submission);
  const result = await h.actions.readCopySubmission();
  assert.equal(result.blockedReason, submission.blockedReason);
  const stored = h.model().copy.submission;
  assert.equal(stored.publishEnabled, false);
  assert.equal(stored.blockedReason, submission.blockedReason);
  assert.deepEqual(stored.validation.problems, submission.validation.problems);
  assert.equal(h.model().copy.digest, DIGEST_B);
  assert.match(h.model().message, /檢驗未通過/);
});
