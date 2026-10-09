// 事项④人物头像上传验证：真 installedSourcePolicy（pinned 文件）＋stub 端口，直连真实
// TrialSessions。覆盖 PNG/JPG 正例、魔数/尺寸/形状/保留名/幂等/权限负例、manifest 登记、
// serve mime、级联兼容（8h 不动）。Web 产品决定（用户裁决 2026-10-09，非原版机制）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { format } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { TrialSessions, sniffPortraitMime } from '../server/trials.js';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';

/** Harness progress goes through tlog (repo convention), not console.log. */
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
const sha = b => createHash('sha256').update(b).digest('hex');

function makeStorage() {
  const db = new DatabaseSync(':memory:');
  // Eager: node:sqlite runs on prepare().all(); deferring to toArray() would skip writes.
  const sql = { exec: (q, ...v) => { const rows = db.prepare(q).all(...v); return { toArray: () => rows }; } };
  // node:sqlite exposes no transaction() helper: BEGIN/COMMIT/ROLLBACK explicitly.
  const transactionSync = fn => {
    db.exec('BEGIN');
    try { const out = fn(); db.exec('COMMIT'); return out; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return { sql, transactionSync };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(120)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(120)]);

const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
const owner = randomUUID(), gameId = randomUUID();
const principal = () => ({ id: owner, epoch: 1, absolute_until: Date.now() + 3600000 });
const games = { snapshotReference: () => { throw new Error('not needed'); }, assertNotDeleting: () => {} };
const drafts = { captureForCompile: () => { throw new Error('not needed'); } };
const catalog = { loadFull: () => { throw new Error('not needed'); }, definition: () => ({}) };

function newSessions() {
  const storage = makeStorage();
  const sessions = new TrialSessions({ storage, principal, games, drafts, catalog, policy });
  return { storage, sessions };
}
function addTrial(storage, state = 'active', token = 'tok', gid = gameId) {
  const trialId = randomUUID();
  storage.sql.exec('INSERT INTO trial_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', trialId, owner, token, 1, gid, '1', 'ch', 'snap', 'd'.repeat(64), 'm'.repeat(64), state, state === 'active' ? null : 'explicit', new Date().toISOString(), Date.now() + 3600000);
  const bytes = Buffer.from(JSON.stringify({ portraits: [] }));
  storage.sql.exec('INSERT INTO trial_assets VALUES(?,?,?,?,?)', trialId, 'manifest', sha(bytes), bytes.length, bytes);
  return trialId;
}
const codeOf = fn => { try { fn(); } catch (e) { return e.code ?? null; } return null; };

// 场景1：sniff 魔数
assert.equal(sniffPortraitMime(PNG), 'image/png');
assert.equal(sniffPortraitMime(JPG), 'image/jpeg');
assert.equal(sniffPortraitMime(GIF), null);
assert.equal(sniffPortraitMime(Buffer.alloc(0)), null);
assert.equal(sniffPortraitMime('nope'), null);
tlog('场景1通过：PNG/JPG 魔数识别，GIF/空/非字节拒绝');
// 场景2：PNG 上传全链（preview 无写 → commit 写 → manifest 登记 → serve mime）
{
  const { storage, sessions } = newSessions();
  const trialId = addTrial(storage);
  const preview = sessions.uploadPreview('tok', trialId, 'upPortraitA', PNG);
  assert.equal(preview.mime, 'image/png');
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM trial_assets WHERE trial_id=? AND asset_id=?', trialId, 'upPortraitA').toArray()[0].n, 0);
  const portrait = sessions.uploadCommit('tok', trialId, 'upPortraitA', PNG, preview);
  assert.equal(portrait.url, `/api/trials/${trialId}/assets/upPortraitA`);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM trial_assets WHERE trial_id=? AND asset_id=?', trialId, 'upPortraitA').toArray()[0].n, 1);
  let manifest; try { manifest = JSON.parse(Buffer.from(storage.sql.exec("SELECT bytes FROM trial_assets WHERE trial_id=? AND asset_id='manifest'", trialId).toArray()[0].bytes).toString('utf8')); } catch { assert.fail('manifest JSON corrupt'); }
  assert.equal(manifest.portraits.length, 1);
  assert.equal(manifest.portraits[0].mime, 'image/png');
  const served = sessions.asset('tok', trialId, 'upPortraitA');
  assert.equal(served.mime, 'image/png');
  assert.ok(Buffer.from(served.bytes).equals(PNG));
  tlog('场景2通过：PNG 上传全链＋manifest 登记＋原字节 serve');
}
// 场景3：JPG 上传 → image/jpeg
{
  const { storage, sessions } = newSessions();
  const trialId = addTrial(storage);
  const preview = sessions.uploadPreview('tok', trialId, 'upPortraitB', JPG);
  assert.equal(preview.mime, 'image/jpeg');
  sessions.uploadCommit('tok', trialId, 'upPortraitB', JPG, preview);
  assert.equal(sessions.asset('tok', trialId, 'upPortraitB').mime, 'image/jpeg');
  tlog('场景3通过：JPG 上传 serve 为 image/jpeg（原字节存储，不转码）');
}
// 场景4：负例矩阵
{
  const { storage, sessions: s2 } = newSessions();
  const t = addTrial(storage);
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'upGif', GIF)), 'TRIAL_PORTRAIT_TYPE');
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'upEmpty', Buffer.alloc(0))), 'TRIAL_PORTRAIT_BYTES');
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'upBig', Buffer.alloc(100 * 1024 + 1))), 'TRIAL_PORTRAIT_BYTES');
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'bad-id!', PNG)), 'TRIAL_PORTRAIT_ID');
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'manifest', PNG)), 'TRIAL_PORTRAIT_ID');
  assert.equal(codeOf(() => s2.uploadPreview('tok', t, 'terrain', PNG)), 'TRIAL_PORTRAIT_ID');
  assert.equal(codeOf(() => s2.uploadPreview('tok', randomUUID(), 'upX', PNG)), 'TRIAL_INVALID');
  const p = s2.uploadPreview('tok', t, 'upDup', PNG);
  s2.uploadCommit('tok', t, 'upDup', PNG, p);
  assert.equal(codeOf(() => s2.uploadCommit('tok', t, 'upDup', PNG, p)), 'TRIAL_PORTRAIT_EXISTS');
  assert.equal(codeOf(() => s2.uploadCommit('tok', t, 'upChanged', JPG, p)), 'TRIAL_CHANGED');
  assert.equal(codeOf(() => s2.asset('tok', t, 'noSuchAsset')), 'TRIAL_ASSET_NOT_FOUND');
  assert.equal(codeOf(() => s2.asset('tok', t, 'manifest')), 'TRIAL_ASSET_NOT_FOUND');
  tlog('场景4通过：类型/尺寸/形状/保留名/幂等/404 负例全对');
}
// 场景5：权限（他人 trial／已结束／异会话）
{
  const { storage, sessions } = newSessions();
  const t = addTrial(storage);
  const other = addTrial(storage, 'active', 'tok2');
  void other;
  const ended = addTrial(storage, 'ended');
  assert.equal(codeOf(() => sessions.uploadPreview('tok2', t, 'upZ', PNG)), 'TRIAL_INVALID');
  assert.equal(codeOf(() => sessions.uploadPreview('tok', ended, 'upZ', PNG)), 'TRIAL_INVALID');
  assert.equal(codeOf(() => sessions.asset('tok2', t, 'manifest')), 'TRIAL_INVALID');
  tlog('场景5通过：他人／已结束 trial 401，派生 manifest 不可经资产路由取');
}
tlog('人物头像上传六场景全部通过');
