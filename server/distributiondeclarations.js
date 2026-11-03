// Frozen additive declarations for the distribution ledger, NOT runtime DDL
// discovery. Keep the original 47-table declarations intact; verify both against
// actual Node/workerd SQLite. No unknown table/index/column is admitted here.
// The 3-table baseline (state/events/chunks) landed in d2acb08; retirement
// checkpoint, cleanup and enqueue-barrier tables are frozen here too because the
// ledger DDL has owned them since d301c49 (retirement and backup/restore lanes
// read them). Total: 6 ledger tables, no new foreign key.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export const DISTRIBUTION_LAYOUTS = freeze({
  content_distribution_chunks: [[0,'generation','INTEGER',1,null,1,0],[1,'part','INTEGER',1,null,2,0],[2,'bytes','BLOB',1,null,0,0]],
  content_distribution_events: [[0,'generation','INTEGER',0,null,1,0],[1,'operation_id','TEXT',1,null,0,0],[2,'kind','TEXT',1,null,0,0],[3,'game_id','TEXT',0,null,0,0],[4,'previous_digest','TEXT',0,null,0,0],[5,'operation_digest','TEXT',1,null,0,0],[6,'payload_digest','TEXT',1,null,0,0],[7,'payload_length','INTEGER',1,null,0,0],[8,'chunk_count','INTEGER',1,null,0,0],[9,'created_at','TEXT',1,null,0,0],[10,'state','TEXT',1,null,0,0],[11,'attempts','INTEGER',1,null,0,0],[12,'confirmed_at','TEXT',0,null,0,0],[13,'receipt_json','TEXT',0,null,0,0]],
  content_distribution_state: [[0,'singleton','INTEGER',0,null,1,0],[1,'authority_id','TEXT',1,null,0,0],[2,'tail_generation','INTEGER',1,null,0,0],[3,'tail_digest','TEXT',0,null,0,0],[4,'confirmed_generation','INTEGER',1,null,0,0],[5,'confirmed_digest','TEXT',0,null,0,0],[6,'blocked_reason','TEXT',0,null,0,0],[7,'version','INTEGER',1,null,0,0]],
  content_distribution_checkpoints: [[0,'checkpoint_digest','TEXT',0,null,1,0],[1,'authority_id','TEXT',1,null,0,0],[2,'retired_generations','TEXT',1,null,0,0],[3,'anchor_digest','TEXT',1,null,0,0],[4,'created_at','TEXT',1,null,0,0]],
  content_distribution_cleanup: [[0,'checkpoint_digest','TEXT',0,null,1,0],[1,'retired_generations','TEXT',1,null,0,0],[2,'deleted_generations','TEXT',1,"'[]'",0,0],[3,'state','TEXT',1,null,0,0],[4,'started_at','TEXT',1,null,0,0],[5,'completed_at','TEXT',0,null,0,0]],
  content_distribution_enqueue_barrier: [[0,'singleton','INTEGER',0,null,1,0],[1,'paused','INTEGER',1,null,0,0]],
});
export const DISTRIBUTION_KEYS = freeze([
  {table:'content_distribution_chunks',index:'sqlite_autoindex_content_distribution_chunks_1',columns:['generation','part']},
  {table:'content_distribution_events',index:'sqlite_autoindex_content_distribution_events_1',columns:['operation_id']},
]);
const additions = freeze({
  objects: [
    ['index','sqlite_autoindex_content_distribution_chunks_1','content_distribution_chunks',null],
    ['index','sqlite_autoindex_content_distribution_events_1','content_distribution_events',null],
    ['table','content_distribution_chunks','content_distribution_chunks','CREATE TABLE content_distribution_chunks (generation INTEGER NOT NULL REFERENCES content_distribution_events(generation), part INTEGER NOT NULL CHECK(part>=0), bytes BLOB NOT NULL, PRIMARY KEY(generation,part))'],
    ['table','content_distribution_events','content_distribution_events',"CREATE TABLE content_distribution_events (generation INTEGER PRIMARY KEY CHECK(generation>0), operation_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, game_id TEXT, previous_digest TEXT, operation_digest TEXT NOT NULL, payload_digest TEXT NOT NULL, payload_length INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','confirmed')), attempts INTEGER NOT NULL CHECK(attempts>=0), confirmed_at TEXT, receipt_json TEXT)"],
    ['table','content_distribution_state','content_distribution_state','CREATE TABLE content_distribution_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), authority_id TEXT NOT NULL, tail_generation INTEGER NOT NULL CHECK(tail_generation>=0), tail_digest TEXT, confirmed_generation INTEGER NOT NULL CHECK(confirmed_generation>=0), confirmed_digest TEXT, blocked_reason TEXT, version INTEGER NOT NULL CHECK(version=1))'],
    ['index','sqlite_autoindex_content_distribution_checkpoints_1','content_distribution_checkpoints',null],
    ['index','sqlite_autoindex_content_distribution_cleanup_1','content_distribution_cleanup',null],
    ['table','content_distribution_checkpoints','content_distribution_checkpoints','CREATE TABLE content_distribution_checkpoints (checkpoint_digest TEXT PRIMARY KEY, authority_id TEXT NOT NULL, retired_generations TEXT NOT NULL, anchor_digest TEXT NOT NULL, created_at TEXT NOT NULL)'],
    ['table','content_distribution_cleanup','content_distribution_cleanup',"CREATE TABLE content_distribution_cleanup (checkpoint_digest TEXT PRIMARY KEY, retired_generations TEXT NOT NULL, deleted_generations TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL CHECK(state IN ('in-progress','completed')), started_at TEXT NOT NULL, completed_at TEXT)"],
    ['table','content_distribution_enqueue_barrier','content_distribution_enqueue_barrier','CREATE TABLE content_distribution_enqueue_barrier (singleton INTEGER PRIMARY KEY CHECK(singleton=1), paused INTEGER NOT NULL CHECK(paused IN (0,1)))'],
  ],
  fk: {content_distribution_chunks:[[0,0,'content_distribution_events','generation','generation','NO ACTION','NO ACTION','NONE']],content_distribution_events:[],content_distribution_state:[],content_distribution_checkpoints:[],content_distribution_cleanup:[],content_distribution_enqueue_barrier:[]},
  indexList: {content_distribution_chunks:[[0,'sqlite_autoindex_content_distribution_chunks_1',1,'pk',0]],content_distribution_events:[[0,'sqlite_autoindex_content_distribution_events_1',1,'u',0]],content_distribution_state:[],content_distribution_checkpoints:[[0,'sqlite_autoindex_content_distribution_checkpoints_1',1,'pk',0]],content_distribution_cleanup:[[0,'sqlite_autoindex_content_distribution_cleanup_1',1,'pk',0]],content_distribution_enqueue_barrier:[]},
  indexInfo: {sqlite_autoindex_content_distribution_chunks_1:[[0,0,'generation',0,'BINARY',1],[1,1,'part',0,'BINARY',1],[2,-1,null,0,'BINARY',0]],sqlite_autoindex_content_distribution_events_1:[[0,1,'operation_id',0,'BINARY',1],[1,-1,null,0,'BINARY',0]],sqlite_autoindex_content_distribution_checkpoints_1:[[0,0,'checkpoint_digest',0,'BINARY',1],[1,-1,null,0,'BINARY',0]],sqlite_autoindex_content_distribution_cleanup_1:[[0,0,'checkpoint_digest',0,'BINARY',1],[1,-1,null,0,'BINARY',0]]},
});
export function withDistributionDefinitions(baseline) {
  const compare = (a,b) => { if (a < b) return -1; if (a > b) return 1; return 0; };
  return freeze({
    ...baseline,
    objects: [...baseline.objects,...additions.objects].sort((a,b)=>compare(a[0],b[0]) || compare(a[1],b[1])),
    fk: {...baseline.fk,...additions.fk},
    indexList: {...baseline.indexList,...additions.indexList},
    indexInfo: {...baseline.indexInfo,...additions.indexInfo},
  });
}
