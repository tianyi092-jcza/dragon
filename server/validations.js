// 上架前整遊戲檢驗的服務端記錄（產品決定 2026-11）：檢驗結果是服務端事實，
// 綁定當下已保存的草稿修訂；清單與上架門只讀這張表，不採用瀏覽器留存。
// 一遊戲一列（只保留最近一次），換修訂即失效由讀取端比對 draft_revision 判定。
import { fail } from './security.js';

const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,30}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

export class ValidationStore {
  #sql;
  constructor({ storage }) {
    if (!storage?.sql) throw new TypeError('same SQLite required');
    this.#sql = storage.sql;
    this.#sql.exec("CREATE TABLE IF NOT EXISTS content_game_validations (game_id TEXT PRIMARY KEY, draft_revision TEXT NOT NULL, source_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('passed','failed')), chapter_count INTEGER NOT NULL CHECK(chapter_count>=0), failed_chapters INTEGER NOT NULL CHECK(failed_chapters>=0), problems_json TEXT NOT NULL, checked_at TEXT NOT NULL)");
  }
  // 與上架共用同一份 whole-game 報告：報告非空即 failed，落庫是冪等的最近狀態。
  recordInTxn({ gameId, draftRevision, sourceDigest, chapterCount, chapters, checkedAt }) {
    if (typeof gameId !== 'string' || !gameId.length || !revision(draftRevision) || !digest(sourceDigest) || !Number.isSafeInteger(chapterCount) || chapterCount < 0 || !Array.isArray(chapters) || chapters.length > chapterCount || !iso(checkedAt)) fail(422, 'VALIDATION_INPUT');
    const problems = JSON.stringify(chapters);
    if (problems.length > 262144) fail(422, 'VALIDATION_REPORT_TOO_LARGE');
    const state = chapters.length ? 'failed' : 'passed';
    this.#sql.exec('INSERT INTO content_game_validations(game_id,draft_revision,source_digest,state,chapter_count,failed_chapters,problems_json,checked_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET draft_revision=excluded.draft_revision,source_digest=excluded.source_digest,state=excluded.state,chapter_count=excluded.chapter_count,failed_chapters=excluded.failed_chapters,problems_json=excluded.problems_json,checked_at=excluded.checked_at', gameId, draftRevision, sourceDigest, state, chapterCount, chapters.length, problems, checkedAt);
    return Object.freeze({ state, checkedAt, draftRevision, sourceDigest, chapterCount, failedChapters: chapters.length, chapters: Object.freeze([...chapters]) });
  }
  read(gameId) {
    const row = this.#sql.exec('SELECT draft_revision,source_digest,state,chapter_count,failed_chapters,problems_json,checked_at FROM content_game_validations WHERE game_id=?', gameId).toArray()[0];
    if (!row) return null;
    if (!revision(row.draft_revision) || !digest(row.source_digest) || !['passed', 'failed'].includes(row.state) || !Number.isSafeInteger(row.chapter_count) || !Number.isSafeInteger(row.failed_chapters) || !iso(row.checked_at)) fail(503, 'VALIDATION_ROW_CORRUPT');
    let chapters;
    try { chapters = JSON.parse(row.problems_json); } catch { fail(503, 'VALIDATION_ROW_CORRUPT'); }
    if (!Array.isArray(chapters) || chapters.length !== row.failed_chapters) fail(503, 'VALIDATION_ROW_CORRUPT');
    return Object.freeze({ state: row.state, checkedAt: row.checked_at, draftRevision: row.draft_revision, sourceDigest: row.source_digest, chapterCount: row.chapter_count, failedChapters: row.failed_chapters, chapters: Object.freeze(chapters) });
  }
  // 修訂改了就不再是「這次草稿的檢驗」；不刪列，讓畫面仍能說明上次檢驗發生在何時。
  readFresh(gameId, draftRevision) { const record = this.read(gameId); return record && record.draftRevision === draftRevision ? record : null; }
  clear(gameId) { this.#sql.exec('DELETE FROM content_game_validations WHERE game_id=?', gameId); }
}
