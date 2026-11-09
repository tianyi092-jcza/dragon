// Frozen additive declarations for the per-game validation record. Same shape as
// distributiondeclarations: the 54-table baseline stays untouched; this module owns
// exactly one table (PK game_id) and one implicit index. No foreign key.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
const DDL = 'CREATE TABLE content_game_validations (game_id TEXT PRIMARY KEY, draft_revision TEXT NOT NULL, source_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN (\'passed\',\'failed\')), chapter_count INTEGER NOT NULL CHECK(chapter_count>=0), failed_chapters INTEGER NOT NULL CHECK(failed_chapters>=0), problems_json TEXT NOT NULL, checked_at TEXT NOT NULL)';
export const VALIDATION_LAYOUTS = freeze({
  content_game_validations: [[0, 'game_id', 'TEXT', 0, null, 1, 0], [1, 'draft_revision', 'TEXT', 1, null, 0, 0], [2, 'source_digest', 'TEXT', 1, null, 0, 0], [3, 'state', 'TEXT', 1, null, 0, 0], [4, 'chapter_count', 'INTEGER', 1, null, 0, 0], [5, 'failed_chapters', 'INTEGER', 1, null, 0, 0], [6, 'problems_json', 'TEXT', 1, null, 0, 0], [7, 'checked_at', 'TEXT', 1, null, 0, 0]],
});
export const VALIDATION_KEYS = freeze([
  { table: 'content_game_validations', index: 'sqlite_autoindex_content_game_validations_1', columns: ['game_id'] },
]);
const additions = freeze({
  objects: [
    ['index', 'sqlite_autoindex_content_game_validations_1', 'content_game_validations', null],
    ['table', 'content_game_validations', 'content_game_validations', DDL],
  ],
  fk: { content_game_validations: [] },
  indexList: { content_game_validations: [[0, 'sqlite_autoindex_content_game_validations_1', 1, 'pk', 0]] },
  indexInfo: { sqlite_autoindex_content_game_validations_1: [[0, 0, 'game_id', 0, 'BINARY', 1], [1, -1, null, 0, 'BINARY', 0]] },
});
export function withValidationDefinitions(baseline) {
  const compare = (a, b) => { if (a < b) return -1; if (a > b) return 1; return 0; };
  return freeze({
    ...baseline,
    objects: [...baseline.objects, ...additions.objects].sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1])),
    fk: { ...baseline.fk, ...additions.fk },
    indexList: { ...baseline.indexList, ...additions.indexList },
    indexInfo: { ...baseline.indexInfo, ...additions.indexInfo },
  });
}
