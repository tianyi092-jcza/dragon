// F4 上架面：installPublish 走 copy 单槽 API（检验落库/票据一次性/说明必填/只轮询 slot）。
// UI-controller checks only；传输/后端鉴权另测。注：提交后 slot 轮询 5s 一跳，
// 文件末尾等待一次以让轮询自然停止，不靠 process.exit 掩盖挂起。
// 用法：node --test tools/verify_publish_controller_slot.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { installPublish } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/publish.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const submission = (over = {}) => ({
  gameId, state: 'draft', version: null, nextVersion: '1.0', copyDigest: DIGEST_A, copyUpdatedAt: '2026-01-02T03:04:05.000Z',
  validation: { state: 'passed', checkedAt: '2026-01-02T03:04:06.000Z', problems: [] },
  slot: { state: 'ready', description: null, submittedAt: null, validatedAt: '2026-01-02T03:04:06.000Z' },
  publishEnabled: true, blockedReason: null,
  ...over,
});

function harness(draftChapters = () => ({ gameId, chapters: [] })) {
  let identity = { user: { id: 'author', version: 1, role: 'author', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [];
  let response = null;
  const h = { calls, errors, response: handler => { response = handler; }, model: () => model };
  const controller = installPublish({
    api: async (path, body) => { calls.push({ path, body }); if (path === `/api/games/${gameId}/draft/chapter-references`) return draftChapters(path, body); if (response) return response(path, body); throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; } },
    publish: value => { model = value; },
    gameContext: { current: () => null, select: () => false, reset: () => {} },
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    confirm: () => true,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}
const games = () => ({ games: [{ gameId, draftRevision: '1', metadata: { name: '甲', introduction: '介' }, createdAt: '2026-01-01T00:00:00.000Z' }] });

test('refresh builds rows from games list plus per-game submission', async () => {
  const h = harness();
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission`) return submission();
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const row = h.model().rows[0];
  assert.equal(row.name, '甲');
  assert.equal(row.nextVersion, '1.0');
  assert.equal(row.validation, '检验成功');
  assert.equal(row.publishDisabled, true); // 说明未填
  assert.match(row.publishHint, /发布说明/);
  // 跨面板游戏切换的一票：本面板不得一票否决（F4 回归，曾恒返回 false 导致顶部下拉选不上游戏）。
  assert.equal(h.controller.canAdoptGame(gameId), true);
  assert.equal(h.controller.canAdoptGame('nope'), false);
  assert.equal(h.errors.length, 0);
});

test('check stores ticket and groups problems by code into layers', async () => {
  const h = harness();
  let failed = false;
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission`) return failed
      ? submission({ validation: { state: 'failed', checkedAt: '2026-01-02T03:04:07.000Z', problems: [{ chapterId: 'ch1', code: 'CHAPTER_REFERENCE', detail: '缺' }] }, publishEnabled: false, blockedReason: '检验未通过，请依红字修正后重新检验。' })
      : submission();
    if (path === `/api/games/${gameId}/copy/validate`) { failed = true; return { gameId, state: 'failed', copyDigest: DIGEST_A, ticket: null, checkedAt: '2026-01-02T03:04:07.000Z', problems: [{ chapterId: 'ch1', code: 'CHAPTER_REFERENCE', detail: '缺' }, { chapterId: '-', code: 'MAP_BAD', detail: '图坏' }] }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const reply = await h.actions.check(gameId);
  assert.equal(reply, '检验未通过，请看下方清单。');
  assert.equal(h.model().validationPassed, false);
  assert.deepEqual(h.model().validationLayers.map(l => [l.key, l.ok, l.failures.length, l.done]), [['CHAPTER_REFERENCE', false, 1, true], ['VALIDATION_FAILED', true, 0, true], ['MAP_BAD', false, 1, true]]);
  assert.match(h.model().rows[0].validation, /检验失败/);
  assert.equal(h.errors.length, 0);
});

test('publish refuses without description and sends nothing', async () => {
  const h = harness();
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission`) return submission();
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  await h.actions.publish(gameId);
  assert.match(h.errors[0]?.message ?? h.errors[0] ?? '', /发布说明/);
  assert.ok(!h.calls.some(c => c.body !== undefined));
});

test('publish auto-checks for a ticket, submits once, clears text and ticket', async () => {
  const h = harness();
  let submitted = null;
  h.response((path, body) => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission` && body === undefined) return submitted ?? submission();
    if (path === `/api/games/${gameId}/copy/validate`) return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', checkedAt: '2026-01-02T03:04:07.000Z', problems: [] };
    if (path === `/api/games/${gameId}/copy/submission`) { submitted = submission({ slot: { state: 'submitted', description: body.description, submittedAt: '2026-01-02T03:04:08.000Z', validatedAt: '2026-01-02T03:04:07.000Z' }, publishEnabled: false, blockedReason: '已提交待审核；需重新检验通过才会再次解禁上架申请。' }); return { gameId, state: 'submitted', copyDigest: DIGEST_A, description: body.description, submittedAt: '2026-01-02T03:04:08.000Z' }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  h.actions.setDescription('第一版说明');
  assert.equal(h.model().descriptionCount, 5);
  await h.actions.publish(gameId);
  const posts = h.calls.filter(c => c.path.endsWith('/copy/submission') && c.body !== undefined);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { ticket: 'T', description: '第一版说明' });
  assert.equal(h.model().description, '');
  assert.match(h.model().result, /已提交上架申请/);
  assert.match(h.model().rows[0].publishHint, /已提交待审核/);
  // 票已核销：再次提交必须重新检验（多一次 validate 调用）。
  const validates = () => h.calls.filter(c => c.path.endsWith('/copy/validate')).length;
  assert.equal(validates(), 1);
  h.actions.setDescription('第二版');
  await h.actions.publish(gameId);
  assert.equal(validates(), 2);
  assert.equal(h.errors.length, 0);
  await new Promise(resolve => setTimeout(resolve, 6000)); // 让提交后的 slot 轮询自然停止
});

test('submit surfaces server rejection without claiming success', async () => {
  for (const [code, status, pattern] of [['VALIDATION_STALE', 409, /检验票已失效/], ['PUBLISH_TOO_SOON', 429, /提交太频繁/]]) {
    const h = harness();
    h.response((path, body) => {
      if (path === '/api/games') return games();
      if (path === `/api/games/${gameId}/copy/submission` && body === undefined) return submission();
      if (path === `/api/games/${gameId}/copy/validate`) return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', checkedAt: '2026-01-02T03:04:07.000Z', problems: [] };
      const failure = new Error(code); failure.status = status; failure.code = code; throw failure;
    });
    await h.actions.refresh();
    h.actions.setDescription('说明');
    await h.actions.publish(gameId);
    assert.match(h.model().message, pattern);
    assert.equal(h.model().description, '说明');
  }
});

test('setDescription caps at 2000 code points', async () => {
  const h = harness();
  h.actions.setDescription('a'.repeat(3000));
  assert.equal(h.model().descriptionCount, 2000);
});

test('check ensures a missing copy once, then validates', async () => {
  const h = harness();
  let validates = 0;
  const missing = Object.assign(new Error('无副本'), { status: 404, code: 'COPY_NOT_FOUND' });
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission`) return submission();
    if (path === `/api/games/${gameId}/copy/validate`) {
      validates++;
      if (validates === 1) throw missing;
      return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', checkedAt: '2026-01-02T03:04:05.000Z', problems: [] };
    }
    if (path === `/api/games/${gameId}/copy/ensure`) return { gameId, copyDigest: DIGEST_A, updatedAt: null };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  const reply = await h.actions.check(gameId);
  assert.equal(reply, '检验完成。');
  const ensures = h.calls.filter(c => c.path === `/api/games/${gameId}/copy/ensure`);
  assert.equal(ensures.length, 1);
  assert.deepEqual(ensures[0].body, {});
  assert.equal(h.model().validationPassed, true);
  assert.equal(h.errors.length, 0);
});

test('check blocks on draft chapter gaps before copy validation', async () => {
  const h = harness(() => ({ gameId, chapterCount: 1, chapters: [{ chapterId: 'ch9', chapterName: '第九章', problems: [{ code: 'CHAPTER_GENERAL_MISSING', detail: '缺武将' }] }] }));
  let validated = 0;
  h.response(path => {
    if (path === '/api/games') return games();
    if (path === `/api/games/${gameId}/copy/submission`) return submission();
    if (path === `/api/games/${gameId}/copy/validate`) { validated++; return { gameId, state: 'passed', copyDigest: DIGEST_A, ticket: 'T', checkedAt: '2026-01-02T03:04:07.000Z', problems: [] }; }
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.refresh();
  await h.actions.check(gameId);
  assert.match(h.errors[0]?.message ?? '', /章节引用不到/);
  assert.equal(validated, 0);
  assert.deepEqual(h.model().validationLayers[0], { key: 'CHAPTER_REFERENCE', code: 'CHAPTER_REFERENCE', title: '章节引用完整性', done: true, ok: false, failures: [{ chapterId: 'ch9', name: '第九章', detail: '[第九章] CHAPTER_GENERAL_MISSING: 缺武将' }] });
  assert.equal(h.model().validationPassed, false);
});
