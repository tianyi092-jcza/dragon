// A 路線發布日誌（game_releases）：pending→confirmed、去重、同版本衝突、回執
// releaseDigest，以及「日誌不參與 ledger 尾代次不變量」的加性證明。
// Owned in-memory SQLite + fake receipt seam：不是 R2、落盤或生產證據。
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { decodeManagementReceipt, encodeManagementReceipt } from '../server/managementreceipt.js';
const AUTHORITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DIGEST = 'a'.repeat(64);
const THIRD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const op = n => `cccccccc-cccc-4ccc-8ccc-${n.toString(16).padStart(12, '0')}`;
const publishPayload = ordinal => Buffer.from(JSON.stringify({ version: 1, projection: { marker: `release-${ordinal}` }, runtime: { gameId: GAME, ordinal } }));
const syntheticPayload = () => Buffer.from(JSON.stringify({ version: 1, projection: { marker: 'synthetic' } }));
let groups = 0;
const storage = openStorage(':memory:');
const receipts = new WeakMap();
const verifyReceipt = ticket => { if (!receipts.has(ticket)) throw new Error('OWNED_RECEIPT_REQUIRED'); return receipts.get(ticket); };
const ledger = new FrozenDistributionLedger({ storage, authorityId: AUTHORITY, verifyReceipt });
const q = (text, ...values) => storage.sql.exec(text, ...values).toArray();
const tx = fn => storage.transactionSync(fn);
const ticket = record => {
  const key = Object.freeze({});
  receipts.set(key, { authorityId: record.authorityId, generation: record.generation, operationId: record.operationId, operationDigest: record.operationDigest, payloadDigest: record.payloadDigest, rootDigest: '1'.repeat(64), rootETag: `"etag-${record.generation}"`, visibleAt: `2026-11-05T00:00:0${record.generation}.000Z` });
  return key;
};
const logRows = () => q('SELECT game_id,version,digest,state,published_at FROM game_releases ORDER BY rowid').map(row => ({ ...row }));
const parsed = text => { try { return JSON.parse(text); } catch (error) { throw new Error('回執不是合法 JSON', { cause: error }); } };

// 1. 上架入隊即寫 pending 日誌行，digest 就是該代次的 operation digest。
const first = tx(() => ledger.enqueueInTxn({ operationId: op(1), kind: 'publish', gameId: GAME, payload: publishPayload('1.0') }));
assert.deepEqual(logRows(), [{ game_id: GAME, version: '1.0', digest: first.operationDigest, state: 'pending', published_at: null }]);
assert.equal(ledger.operationStatus(GAME, op(1)).releaseDigest, first.operationDigest);
groups++;

// 2. 確認後日誌行跟著該代次變 confirmed，時間取回執自己的 visibleAt。
tx(() => ledger.confirmInTxn(op(1), ticket(ledger.entry(1))));
assert.deepEqual(logRows(), [{ game_id: GAME, version: '1.0', digest: first.operationDigest, state: 'confirmed', published_at: '2026-11-05T00:00:01.000Z' }]);
assert.equal(ledger.operationStatus(GAME, op(1)).releaseDigest, first.operationDigest);
groups++;

// 3. 同一操作重放不新增行、不推進代次、不改已確認的時間。
const replayed = tx(() => ledger.enqueueInTxn({ operationId: op(1), kind: 'publish', gameId: GAME, payload: publishPayload('1.0') }));
assert.equal(replayed.deduped, true);
assert.equal(ledger.status().tailGeneration, 1);
assert.deepEqual(logRows(), [{ game_id: GAME, version: '1.0', digest: first.operationDigest, state: 'confirmed', published_at: '2026-11-05T00:00:01.000Z' }]);
groups++;

// 4. 換一個操作去搶同一個 (game,version) 是身份衝突，不是覆寫。
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: op(2), kind: 'publish', gameId: GAME, payload: publishPayload('1.0') })), error => error.status === 503 && error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
assert.equal(ledger.status().tailGeneration, 1);
assert.equal(logRows().length, 1);
groups++;

// 5. 下一個版本另起一行；releaseLog 依寫入順序回傳，且是唯讀快照。
tx(() => ledger.enqueueInTxn({ operationId: op(3), kind: 'publish', gameId: GAME, payload: publishPayload('1.1') }));
const log = ledger.releaseLog(GAME);
assert.deepEqual(log.map(row => [row.version, row.state]), [['1.0', 'confirmed'], ['1.1', 'pending']]);
assert.equal(log[1].digest, ledger.operationStatus(GAME, op(3)).releaseDigest);
assert.throws(() => { log.push({}); }, TypeError);
assert.deepEqual(ledger.releaseLog(OTHER), []);
assert.throws(() => ledger.releaseLog('not-a-game'), error => error.status === 422);
groups++;

// 6. listing／restriction 不發布 release：不寫日誌、狀態裡也不冒充 release 身分。
tx(() => ledger.enqueueInTxn({ operationId: op(4), kind: 'listing', gameId: OTHER, payload: syntheticPayload() }));
assert.deepEqual(ledger.releaseLog(OTHER), []);
assert.equal(ledger.operationStatus(OTHER, op(4)).releaseDigest, null);
groups++;

// 7. 沒有 runtime 的合成 publish（只有傳輸）不寫日誌行，狀態也不假造 digest。
tx(() => ledger.enqueueInTxn({ operationId: op(5), kind: 'publish', gameId: THIRD, payload: syntheticPayload() }));
assert.equal(ledger.operationStatus(THIRD, op(5)).releaseDigest, null);
assert.equal(logRows().length, 2);
groups++;

// 8. runtime 存在但 ordinal 形狀不對 → 拒絕，不猜也不寫半行。
const malformed = op(6);
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: malformed, kind: 'publish', gameId: GAME, payload: Buffer.from(JSON.stringify({ version: 1, projection: {}, runtime: { gameId: GAME, ordinal: 'v1' } })) })), error => error.status === 422 && error.code === 'DISTRIBUTION_OPERATION');
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: malformed, kind: 'publish', gameId: GAME, payload: Buffer.from(JSON.stringify({ version: 1, projection: {}, runtime: 'x' })) })), error => error.status === 422);
assert.equal(q('SELECT * FROM content_distribution_events WHERE operation_id=?', malformed).length, 0);
groups++;

// 9. 日誌行不參與 ledger 的尾／確認代次不變量：破壞它不影響狀態，也不被當成 payload。
const status = ledger.status();
q('DELETE FROM game_releases WHERE version=?', '1.1');
assert.deepEqual(ledger.status(), status);
assert.equal(ledger.operationStatus(GAME, op(3)).releaseDigest, null);
groups++;

// 10. 管理回執：帶 releaseDigest 寫 version 2，缺鍵仍是 version 1，兩者都能回讀。
const result = { gameId: GAME, action: 'list', eventAt: '2026-11-05T00:00:03.000Z', listed: true, restricted: false, rowRevision: '2' };
const v2 = encodeManagementReceipt(result, { operationId: op(7), generation: 2, releaseDigest: DIGEST });
assert.equal(parsed(v2).version, 2);
assert.deepEqual(decodeManagementReceipt(v2), { result, distribution: { operationId: op(7), generation: 2, releaseDigest: DIGEST } });
const nullDigest = encodeManagementReceipt(result, { operationId: op(7), generation: 2, releaseDigest: null });
assert.equal(parsed(nullDigest).distribution.releaseDigest, null);
assert.equal(decodeManagementReceipt(nullDigest).distribution.releaseDigest, null);
const legacy = JSON.stringify({ version: 1, result, distribution: { operationId: op(7), generation: 2 } });
assert.deepEqual(decodeManagementReceipt(legacy).distribution, { operationId: op(7), generation: 2 });
assert.equal(encodeManagementReceipt(result, decodeManagementReceipt(legacy).distribution), legacy);
groups++;

// 11. 形狀被改動或版本未知時失敗關閉，不把壞回執讀成有效 release 身分。
const corrupt = code => error => error.status === 503 && error.code === code;
for (const bad of [
  JSON.stringify({ version: 3, result, distribution: { operationId: op(7), generation: 2, releaseDigest: DIGEST } }),
  JSON.stringify({ version: 2, result, distribution: { operationId: op(7), generation: 2, releaseDigest: DIGEST, extra: 1 } }),
  JSON.stringify({ version: 2, result, distribution: { operationId: op(7), generation: 2, releaseDigest: 'not-a-digest' } }),
  JSON.stringify({ version: 2, result, distribution: { operationId: op(7), generation: 2 } }),
  JSON.stringify({ version: 1, result, distribution: { operationId: op(7), generation: 2, releaseDigest: DIGEST } }),
]) assert.throws(() => decodeManagementReceipt(bad), corrupt('MANAGEMENT_RECEIPT_CORRUPT'));
assert.throws(() => encodeManagementReceipt(result, { operationId: op(7), generation: 2, releaseDigest: 1 }), corrupt('MANAGEMENT_RECEIPT_CORRUPT'));
groups++;

storage.close();
process.stdout.write(`A 路線發布日誌：${groups} groups green（自建 SQLite 與假回執；不是 R2／生產證據）\n`);
