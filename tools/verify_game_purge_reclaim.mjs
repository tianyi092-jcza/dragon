// 刪除遊戲後的 R2 回收 lane（方案 B / C 批）：owned in-memory 物件埠，不連任何
// 雲端、不讀寫正式存檔。驗的是「刪一個遊戲只影響它自己」——在架指針移除該條目、
// artifacts/<gameId>/ 前綴清空，同時共享程序包、畫像與另一個內容完全相同的遊戲
// 逐位元組不動；以及 CAS、冪等、損壞輸入的邊界。
// 不是真實 R2/S3/TLS 證據，也不是 distribution ledger 退役路徑的證據。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGameReclaimer } from '../vps/game-reclaimer.mjs';
import { DIRECTORY_POINTER_KEY, directoryPointerBody, directoryState, validateDirectoryPointer } from '../reader/directorypointer.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
const pass = label => checks.push(label);
const gameA = '11111111-1111-4111-8111-111111111111';
const gameB = '22222222-2222-4222-8222-222222222222';
const gameC = '33333333-3333-4333-8333-333333333333';
const authorityId = '44444444-4444-4444-8444-444444444444';
// 兩個遊戲內容完全相同：同一份 runtime/chapter 摘要，共享同一組程序包位元組。
const contentDigest = sha(Buffer.from('identical-content'));
const programDigest = sha(Buffer.from('shared-program'));
const releaseOf = gameId => ({ releaseId: 'release-' + gameId.slice(0, 8), ordinal: '1.0', revision: '1', sourceDigest: contentDigest });
const runtimeKeyOf = gameId => `artifacts/${gameId}/1.0/${releaseOf(gameId).releaseId}/runtime-${contentDigest}.json`;
const chapterKeyOf = gameId => `artifacts/${gameId}/1.0/${releaseOf(gameId).releaseId}/chapters/${gameId}%23chapter-1.json`;
const manifestKeyOf = gameId => `artifacts/${gameId}/1.0/${releaseOf(gameId).releaseId}/manifest.json`;
const sharedKeys = [`artifacts/programs/${programDigest}/program.js`, `artifacts/programs/${programDigest}/trialweb.txt`, 'kao/17.png'];
const entryOf = gameId => Object.freeze({
  gameId, listed: true,
  release: { ...releaseOf(gameId), runtime: { key: runtimeKeyOf(gameId), sha256: contentDigest, byteLength: 32 } },
  directory: { name: 'identical-' + gameId.slice(0, 4), publishedAt: '2026-11-01T00:00:00.000Z', chapters: [`${gameId}#chapter-1`] },
  announcements: [],
});
// 讀回自己寫過的指針：解析失敗就是 lane 自身的破損，用 assert 明確報出來。
function storedPointer(memory) {
  try { return validateDirectoryPointer(JSON.parse(memory.objects.get(DIRECTORY_POINTER_KEY).bytes.toString())); }
  catch (cause) { assert.fail('owned pointer object must stay valid: ' + cause.message); }
}
function parseOwned(text) {
  try { return JSON.parse(text); }
  catch (cause) { assert.fail('owned JSON must stay parseable: ' + cause.message); }
}
const seal = games => {
  const body = directoryPointerBody({ version: 1, authorityId, generation: 7, games });
  const digest = sha(Buffer.from(JSON.stringify(body)));
  return Buffer.from(JSON.stringify({ version: 1, authorityId, generation: 7, digest, games: body.games }));
};
function memoryR2() {
  const objects = new Map();
  const counters = { reads: 0, controls: 0, removes: 0 };
  let controlGate = null, listGate = null;
  const store = (key, bytes) => objects.set(key, { bytes: Buffer.from(bytes), headers: { etag: '"' + sha(Buffer.from(bytes)) + '"', 'content-type': 'application/json' } });
  return {
    objects, counters, store,
    onControl(fn) { controlGate = fn; },
    onList(fn) { listGate = fn; },
    r2: Object.freeze({
      async get(key, options) {
        assert.ok(options?.maxBytes > 0, '有界讀取是埠合約');
        counters.reads++;
        const value = objects.get(key);
        return value ? { bytes: new Uint8Array(value.bytes), headers: { ...value.headers } } : null;
      },
      async putControl(key, bytes, etag) {
        assert.equal(arguments.length, 3, 'CAS 必須顯式帶 etag');
        counters.controls++;
        if (controlGate) { const outcome = controlGate(key, bytes, etag); if (outcome === false) return false; }
        const prior = objects.get(key);
        const current = prior ? prior.headers.etag : null;
        if (etag === null ? current !== null : current !== etag) return false;
        store(key, bytes);
        return true;
      },
      async list(prefix, maxKeys) {
        assert.equal(maxKeys, 1000, '掃描頁面大小固定');
        if (listGate) { const outcome = listGate(prefix); if (outcome !== undefined) return outcome; }
        return [...objects.keys()].filter(key => key.startsWith(prefix)).sort();
      },
      async remove(key) { counters.removes++; objects.delete(key); return 204; },
    }),
  };
}
function seed(memory) {
  for (const gameId of [gameA, gameB]) for (const key of [runtimeKeyOf(gameId), manifestKeyOf(gameId), chapterKeyOf(gameId)]) memory.store(key, `bytes-for-${gameId}`);
  for (const key of sharedKeys) memory.store(key, `shared-bytes-for-${key}`);
  memory.store(DIRECTORY_POINTER_KEY, seal([entryOf(gameA), entryOf(gameB)]));
}
const keysUnder = (store, gameId) => [...store.objects.keys()].filter(key => key.startsWith(`artifacts/${gameId}/`)).sort();

// ① 埠與前綴邊界：缺 list/remove 或前綴不合法一律是開機前的 TypeError/合約錯。
{
  for (const broken of [{}, { get: () => {} }, { get: () => {}, putControl: () => {}, list: () => {} }]) {
    assert.throws(() => createGameReclaimer({ r2: broken }), TypeError);
  }
  const memory = memoryR2();
  for (const prefix of ['../escape/', 'test//', 7]) {
    assert.throws(() => createGameReclaimer({ r2: memory.r2, prefix }), /reclaim prefix invalid/);
  }
  pass('埠缺件與前綴越界在裝配時就拒絕');
}

// ② 刪 A：指針只掉 A，B 逐位元組不動；A 的位元組清空，B 與共享程序包不動。
{
  const memory = memoryR2();
  seed(memory);
  const before = Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes);
  const beforeB = entryOf(gameB);
  const beforeKeysB = keysUnder(memory, gameB), beforeShared = sharedKeys.map(key => memory.objects.get(key).bytes.toString());
  assert.deepEqual(keysUnder(memory, gameA).length, 3, 'fixture 必須讓 A 有三個物件');
  const reclaim = createGameReclaimer({ r2: memory.r2 });
  const facts = await reclaim(gameA);
  assert.equal(facts.pointer, 'removed');
  assert.equal(facts.objects, 3, 'A 的三個物件都要刪掉');
  assert.deepEqual(keysUnder(memory, gameA), [], 'A 的前綴不得留任何位元組');
  assert.deepEqual(keysUnder(memory, gameB), beforeKeysB, 'B 的位元組不得被連帶刪除');
  assert.deepEqual(sharedKeys.map(key => memory.objects.get(key).bytes.toString()), beforeShared, '共享程序包與畫像不得被刪');
  const after = Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes);
  assert.equal(after.toString().includes(gameA), false, '在架指針不得再含已刪遊戲');
  const pointer = storedPointer(memory);
  assert.equal(pointer.authorityId, authorityId);
  assert.equal(pointer.generation, 7, '回收是已提交目錄的修補，不得推進代次');
  assert.equal(sha(Buffer.from(JSON.stringify(directoryPointerBody(pointer)))), pointer.digest, '新指針必須自洽');
  assert.deepEqual(pointer.games, [beforeB], '另一個內容完全相同的遊戲條目必須逐欄不變');
  // 讀者視角：A 查不到（410 GAME_DELETED 的前提），B 完全沒變。
  const view = directoryState(pointer);
  assert.equal(view.states.has(gameA), false);
  assert.equal(view.states.get(gameB).listed, true);
  assert.deepEqual(view.directory.map(row => row.gameId), [gameB]);
  assert.deepEqual(view.releases.get(gameB).runtime.key, runtimeKeyOf(gameB));
  assert.notDeepEqual(before.toString(), after.toString(), '指針內容必須真的變了');
  pass('刪 A 只移除自己：指針掉一條、自己三物件清空、B 與共享位元組不動');
  pass('回收後讀者視圖：A 不存在、B 章節與 runtime 引用不變');

  // ③ 冪等：重複回收同一遊戲不再寫入，指針位元組完全一致。
  const snapshot = Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes);
  const controls = memory.counters.controls;
  const again = await reclaim(gameA);
  assert.equal(again.pointer, 'already-absent');
  assert.equal(again.objects, 0);
  assert.equal(memory.counters.controls, controls, '已無條目時不得再寫指針');
  assert.deepEqual(Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes), snapshot);
  pass('重複回收是冪等：不重寫指針、不再刪位元組');
}

// ④ 指針不存在：沒有可見清單可修，但位元組仍必須按前綴清掉。
{
  const memory = memoryR2();
  memory.store(runtimeKeyOf(gameC), 'c-runtime');
  const facts = await createGameReclaimer({ r2: memory.r2 })(gameC);
  assert.equal(facts.pointer, 'absent');
  assert.equal(facts.objects, 1);
  assert.deepEqual(keysUnder(memory, gameC), []);
  pass('指針缺失時只清位元組，不偽造清單');
}

// ⑤ 損壞的指針（digest 與 body 不符）：必須拒絕，且不能動原本的物件。
{
  const memory = memoryR2();
  seed(memory);
  const forged = parseOwned(memory.objects.get(DIRECTORY_POINTER_KEY).bytes.toString());
  forged.games.push({ ...entryOf(gameC), gameId: gameC });
  memory.store(DIRECTORY_POINTER_KEY, Buffer.from(JSON.stringify(forged)));
  const before = Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes);
  await assert.rejects(createGameReclaimer({ r2: memory.r2 })(gameA), /DIRECTORY_CORRUPT/);
  assert.deepEqual(Buffer.from(memory.objects.get(DIRECTORY_POINTER_KEY).bytes), before, '拒絕時不得寫入指針');
  assert.equal(keysUnder(memory, gameA).length, 3, '被拒絕時不得開始刪位元組');
  pass('指針 digest 不自洽就整體拒絕，且位元組一個都不刪');
}

// ⑥ CAS：與別的寫入者競賽時重讀重算，衝突持續則如實報錯且不越權覆寫。
{
  const memory = memoryR2();
  seed(memory);
  const reclaim = createGameReclaimer({ r2: memory.r2 });
  let conflicted = 0;
  memory.onControl(() => { if (conflicted++ === 0) return false; });
  assert.equal((await reclaim(gameA)).pointer, 'removed', '一次 CAS 失敗後重讀必須收斂');
  assert.equal(conflicted, 2);
  const pointer = storedPointer(memory);
  assert.deepEqual(pointer.games.map(entry => entry.gameId), [gameB]);
  pass('指針 CAS 失敗一次 → 重讀重算後收斂');

  const blocked = memoryR2();
  seed(blocked);
  const before = Buffer.from(blocked.objects.get(DIRECTORY_POINTER_KEY).bytes);
  blocked.onControl(() => false);
  await assert.rejects(createGameReclaimer({ r2: blocked.r2 })(gameA), /DIRECTORY_CAS_CONFLICT/);
  assert.deepEqual(Buffer.from(blocked.objects.get(DIRECTORY_POINTER_KEY).bytes), before);
  assert.equal(keysUnder(blocked, gameA).length, 3, '指針沒改成功前不得刪位元組');
  pass('持續 CAS 衝突：拒絕且不動指針與位元組');
}

// ⑦ list 回傳前綴以外的鍵（埠契約被破壞）：拒絕，不刪任何東西。
{
  const memory = memoryR2();
  seed(memory);
  memory.onList(() => ['artifacts/programs/' + programDigest + '/program.js']);
  await assert.rejects(createGameReclaimer({ r2: memory.r2 })(gameA), /RECLAIM_LIST/);
  assert.equal(memory.counters.removes, 0);
  pass('掃描越界就拒絕，不誤刪共享位元組');
}

// ⑧ 私有位元組（編輯器檔案桶 private/<gameId>/<sha256>）：一起掃，共享 installed/ 不動。
{
  const memory = memoryR2();
  seed(memory);
  const privates = new Map();
  const privateKeyOf = (gameId, n) => `private/${gameId}/${String(n).repeat(64)}`;
  for (const gameId of [gameA, gameB]) for (let n = 1; n <= 3; n++) privates.set(privateKeyOf(gameId, n), Buffer.from('private-' + gameId + n));
  const installedKey = 'installed/runtime/' + 'f'.repeat(64);
  privates.set(installedKey, Buffer.from('shared-installed'));
  const bucket = Object.freeze({
    async list({ prefix = '' } = {}) { return { objects: [...privates.keys()].filter(key => key.startsWith(prefix)).sort().map(key => ({ key, size: privates.get(key).length })) }; },
    async remove(key) { return privates.delete(key); },
  });
  const reclaim = createGameReclaimer({ r2: memory.r2, objects: bucket });
  const facts = await reclaim(gameA);
  assert.equal(facts.privateObjects, 3, 'A 的三個私有物件都要刪掉');
  assert.deepEqual([...privates.keys()].filter(key => key.startsWith(`private/${gameA}/`)), [], 'A 的私有前綴不得留位元組');
  assert.equal([...privates.keys()].filter(key => key.startsWith(`private/${gameB}/`)).length, 3, 'B 的私有位元組不得被連帶刪除');
  assert.ok(privates.has(installedKey), '共享 installed 底層資源永不刪');
  const again = await reclaim(gameA);
  assert.equal(again.privateObjects, 0, '重複回收不得再刪');
  // 沒有私有埠時照實報 0，不假裝清過。
  assert.equal((await createGameReclaimer({ r2: memory.r2 })(gameB)).privateObjects, 0);
  assert.throws(() => createGameReclaimer({ r2: memory.r2, objects: { list: () => {} } }), TypeError);
  // 私有埠回報前綴以外的鍵＝契約被破壞：拒絕，不刪任何東西。
  const bad = Object.freeze({ async list() { return { objects: [{ key: installedKey, size: 1 }] }; }, async remove(key) { privates.delete(key); } });
  await assert.rejects(createGameReclaimer({ r2: memory.r2, objects: bad })(gameB), /RECLAIM_LIST/);
  assert.ok(privates.has(installedKey));
  pass('私有位元組一起回收：只刪自己、installed 不動、缺埠照實報 0');
}

const result = {
  checks: checks.length,
  labels: checks,
  sources: {
    'vps/game-reclaimer.mjs': sha(Buffer.from((await import('node:fs')).readFileSync('vps/game-reclaimer.mjs'))),
    'server/editorapp.js': sha((await import('node:fs')).readFileSync('server/editorapp.js')),
    'server/publicationproducer.js': sha((await import('node:fs')).readFileSync('server/publicationproducer.js')),
  },
  scope: 'owned in-memory R2 port; delete reclamation only — no real S3/R2 deployment, no distribution-ledger retirement, no player-side play-through',
};
process.stdout.write(JSON.stringify(result) + '\n');
