// ② 檢驗結果存服務端：一遊戲一列的 passed/failed 記錄，綁定已保存的草稿修訂。
// 這條 lane 只碰 owned SQLite seams（openStorage/ValidationStore/MetadataStore），
// 不啟動 HTTP、編譯或分發；驗證「清單投影」與「新鮮度」兩件事。
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { ValidationStore } from '../server/validations.js';
import { GameMetadataStore } from '../server/metadata.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-11-09T00:00:00.000Z';
const DIGEST = 'd'.repeat(64);

const storage = openStorage(':memory:');
try {
  storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL DEFAULT \'\', phone TEXT NOT NULL DEFAULT \'\', note TEXT NOT NULL DEFAULT \'\')');
  storage.sql.exec('INSERT INTO users(id,account,role,password_hash,disabled,must_change,epoch,version) VALUES(?,?,?,?,0,0,1,1)', OWNER, 'author', 'author', 'x');
  const metadata = new GameMetadataStore({ storage, principal: () => ({ id: OWNER, epoch: 1, role: 'author', must_change: 0 }) });
  const validations = new ValidationStore({ storage });
  // 只種一列已保存草稿：本 lane 驗清單投影與檢驗記錄，不跑複製／快照管線。
  const game = { gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' };
  storage.sql.exec('INSERT INTO content_games(game_id,owner_id,draft_name,draft_introduction,formal_name,formal_introduction,draft_revision,row_revision,current_release_id,next_ordinal,listed,restricted,created_at,modified_at) VALUES(?,?,?,?,NULL,NULL,?,?,NULL,?,0,0,?,?)', game.gameId, OWNER, '臥龍傳', '原文', '1', '1', '0', TIME, TIME);
  const row = () => metadata.submissionSummaries('t').find(entry => entry.gameId === game.gameId);
  const draftRevision = '1';

  // 1) 從未檢驗：清單仍回草稿，但沒有 validation；上架門因此不成立。
  assert.equal(row().validation, null);
  assert.equal(row().draftRevision, draftRevision);

  // 2) 通過：狀態/時間/綁定修訂落庫，清單投影只帶上架門需要的欄位。
  const passed = validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 20, chapters: [], checkedAt: TIME });
  assert.equal(passed.state, 'passed');
  const projected = row().validation;
  assert.deepEqual(projected, { state: 'passed', checkedAt: TIME, draftRevision, chapterCount: 20, failedChapters: 0 });
  assert.equal(Object.hasOwn(projected, 'sourceDigest'), false, '投影不帶摘要或逐章清單');
  assert.equal(validations.readFresh(game.gameId, draftRevision).state, 'passed');
  assert.equal(validations.readFresh(game.gameId, '99'), null, '修訂不符＝舊結果不能當上架依據');

  // 3) 失敗：逐章問題跟著記錄保存，失敗章數與清單一致。
  const chapters = [{ chapterId: `${game.gameId}#upper-1`, chapterName: '第一章', problems: [{ code: 'CHAPTER_CITY_SLOT_MISSING', detail: '底層據點已無固定槽 3' }] }];
  validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 20, chapters, checkedAt: TIME });
  assert.equal(row().validation.state, 'failed');
  assert.equal(row().validation.failedChapters, 1);
  assert.deepEqual(validations.read(game.gameId).chapters, chapters);
  // 失敗記錄不是上架依據，但也不能被靜默丟掉。
  assert.equal(validations.readFresh(game.gameId, draftRevision).state, 'failed');

  // 4) 形狀不合法一律拒絕（不寫入猜測值）。
  assert.throws(() => validations.recordInTxn({ gameId: game.gameId, draftRevision: '0', sourceDigest: DIGEST, chapterCount: 1, chapters: [], checkedAt: TIME }), error => error.code === 'VALIDATION_INPUT');
  assert.throws(() => validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: 'D'.repeat(64), chapterCount: 1, chapters: [], checkedAt: TIME }), error => error.code === 'VALIDATION_INPUT');
  assert.throws(() => validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 1, chapters: [], checkedAt: '2026-11-09' }), error => error.code === 'VALIDATION_INPUT');
  assert.throws(() => validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 0, chapters: [{ chapterId: 'x' }], checkedAt: TIME }), error => error.code === 'VALIDATION_INPUT');
  const oversized = Array.from({ length: 9000 }, (_, index) => ({ chapterId: `${game.gameId}#c${index}`, chapterName: 'c'.repeat(40), problems: [{ code: 'X'.repeat(60), detail: 'd'.repeat(200) }] }));
  assert.throws(() => validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 9000, chapters: oversized, checkedAt: TIME }), error => error.code === 'VALIDATION_REPORT_TOO_LARGE');

  // 5) 損壞的列不得被當成通過。
  storage.sql.exec("UPDATE content_game_validations SET problems_json='{}' WHERE game_id=?", game.gameId);
  assert.throws(() => validations.read(game.gameId), error => error.code === 'VALIDATION_ROW_CORRUPT');

  // 6) 這張表的宣告面由 verify_editor_schema_sources 以完整 55 表比對；本 lane 只驗記錄語義。

  // 7) 刪除流程清得掉：不留殘留列給後續清單。
  validations.recordInTxn({ gameId: game.gameId, draftRevision, sourceDigest: DIGEST, chapterCount: 1, chapters: [], checkedAt: TIME });
  validations.clear(game.gameId);
  assert.equal(validations.read(game.gameId), null);
  process.stdout.write('publish validation: 7 groups passed (owned SQLite seams; no HTTP/compile/distribution)\n');
} finally { storage.close(); }
