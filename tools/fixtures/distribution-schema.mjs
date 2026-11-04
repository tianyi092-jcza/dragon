// Shared owned Node/workerd SQLite probes. Engineered SQL rows, no publishing,
// external I/O, real account, game source, physical cleanup or receipt authority.
import assert from 'node:assert/strict';
import { assertDeletionDefinitions } from '../../server/deletiondefinitions.js';
import { assertDeletionColumnSchema } from '../../server/deletionschema.js';
import { inspectDeclaredForeignKeyRows } from '../../server/deletionforeignkeyrows.js';
import { inspectDeclaredUniqueKeys } from '../../server/deletionuniquerows.js';
import { inspectDeclaredIndexProjections } from '../../server/deletionindexprojections.js';
import { GameDeletionInventory } from '../../server/deletioninventory.js';
const owner = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', game = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', other = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const operation = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
export async function verifyDistributionSchema(storage, ledger) {
  const sql = storage.sql, checks = [];
  const rows = query => sql.exec(query).toArray();
  const rejected = (fn, code) => assert.throws(fn, error => error.status === 503 && error.code === code);
  const rollback = fn => {
    const sentinel = new Error('owned rollback');
    assert.equal(rows('PRAGMA defer_foreign_keys')[0].defer_foreign_keys,0);
    try { assert.throws(() => storage.transactionSync(() => { fn(); throw sentinel; }), error => error === sentinel); }
    finally {
      // workerd uses a savepoint inside its request transaction: this connection
      // PRAGMA is not rolled back by that savepoint. Restore only our own probe.
      sql.exec('PRAGMA defer_foreign_keys=OFF');
    }
  };
  const cursor = sql.exec('SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3');
  const iterator = cursor[Symbol.iterator](); assert.equal(iterator.next().value.n,1);
  assert.deepEqual(cursor.toArray().map(row=>row.n),[2,3]); assert.equal(cursor.toArray().length,0); assert.equal(iterator.next().done,true);
  assert.ok(Number.isSafeInteger(sql.databaseSize) && sql.databaseSize > 0);
  checks.push('actual provider consuming cursor and finite logical database byte count');
  const facts = assertDeletionDefinitions(sql);
  assert.equal(facts.tablesVerified, 54); assert.equal(facts.indexesVerified, 52); assert.equal(facts.foreignKeyDeclarationsVerified, 4);
  assert.equal(rows("SELECT name FROM sqlite_master WHERE type='table'").reduce((n,t)=>n+rows(`PRAGMA table_xinfo(${t.name})`).length,0),361);
  const original = rows('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
  checks.push('exact 54 tables / 52 indexes / 361 columns / four FK declarations');
  assert.equal(inspectDeclaredForeignKeyRows(sql).edgesVerified, 4);
  assert.equal(inspectDeclaredUniqueKeys(sql).constraintsVerified, 50);
  assert.equal(inspectDeclaredIndexProjections(sql).indexesCompared, 50);
  checks.push('all four typed edges and 50 native covering index/unique scans');
  rollback(() => { sql.exec('CREATE TABLE future_ledger (id INTEGER)'); rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION'); });
  rollback(() => { sql.exec('CREATE INDEX future_index ON content_distribution_events(game_id)'); rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION'); });
  rollback(() => { sql.exec("CREATE TRIGGER future_trigger AFTER INSERT ON content_distribution_events BEGIN SELECT 1; END"); rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION'); });
  checks.push('unknown table, index and trigger remain rejected');
  for (const table of ['content_distribution_chunks','content_distribution_events','content_distribution_state']) {
    rollback(() => { sql.exec(`DROP TABLE ${table}`); rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION'); });
    rollback(() => {
      sql.exec(`ALTER TABLE ${table} ADD COLUMN future_ref TEXT`);
      rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION');
      rejected(()=>assertDeletionColumnSchema(sql,[{name:table}]),'DELETE_INVENTORY_COLUMNS');
    });
    checks.push(`${table}: missing table and new column rejected`);
  }
  rollback(() => {
    const ddl = rows("SELECT sql FROM sqlite_master WHERE name='content_distribution_chunks'")[0].sql;
    sql.exec('DROP TABLE content_distribution_chunks'); sql.exec(ddl.replace(' CHECK(part>=0)',''));
    assertDeletionColumnSchema(sql,[{name:'content_distribution_chunks'}]);
    rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION');
  }); checks.push('same columns but removed CHECK is not blessed');
  rollback(() => {
    sql.exec('PRAGMA defer_foreign_keys=ON');
    rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_ENFORCEMENT');
  }); checks.push('deferred FK enforcement rejected');
  const enqueue = () => storage.transactionSync(()=>ledger.enqueueInTxn({operationId:operation,kind:'publish',gameId:other,payload:new TextEncoder().encode(JSON.stringify({version:1,projection:{privateFixture:'other-game-name'}}))}));
  rollback(() => {
    enqueue();
    assert.equal(inspectDeclaredForeignKeyRows(sql).rowsChecked,1);
    assert.equal(inspectDeclaredUniqueKeys(sql).constraintsVerified,50);
    assert.equal(inspectDeclaredIndexProjections(sql).indexesCompared,50);
    assert.throws(()=>sql.exec('INSERT INTO content_distribution_chunks SELECT * FROM content_distribution_chunks'));
    assert.throws(()=>sql.exec('INSERT INTO content_distribution_events SELECT generation+1,operation_id,kind,game_id,previous_digest,operation_digest,payload_digest,payload_length,chunk_count,created_at,state,attempts,confirmed_at,receipt_json FROM content_distribution_events'));
  }); checks.push('actual integer generation edge and both native UNIQUE constraints');
  for (const value of [999,'not-a-generation',new Uint8Array([1])]) rollback(() => {
    sql.exec('PRAGMA defer_foreign_keys=ON');
    sql.exec('INSERT INTO content_distribution_chunks VALUES(?,0,?)',value,new Uint8Array([1]));
    rejected(()=>inspectDeclaredForeignKeyRows(sql),'DELETE_FOREIGN_KEY_ROWS');
  }); checks.push('orphan, TEXT and BLOB child generation rejected under owned deferred fixture');
  rollback(() => {
    sql.exec('DROP TABLE content_distribution_chunks');
    sql.exec('CREATE TABLE content_distribution_chunks (generation INTEGER,part INTEGER,bytes BLOB)');
    sql.exec('INSERT INTO content_distribution_chunks VALUES(1,0,?), (1,0,?)',new Uint8Array([1]),new Uint8Array([2]));
    rejected(()=>inspectDeclaredUniqueKeys(sql),'DELETE_UNIQUE_ROWS');
    rejected(()=>assertDeletionDefinitions(sql),'DELETE_SCHEMA_DEFINITION');
  }); checks.push('low-level duplicate composite detected; full gate rejects removed constraint first');
  assert.deepEqual(rows('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),original);
  assert.equal(ledger.status().tailGeneration,0);
  checks.push('all schema/row fault transactions rolled back, original empty authority intact');
  sql.exec("INSERT INTO users(id,account,role,password_hash,disabled,must_change,epoch,version) VALUES(?, 'schema_owner','author','fixture',0,0,1,1)",owner);
  sql.exec("INSERT INTO content_games VALUES(?,?,'schema game','',NULL,NULL,'1','2',NULL,'0',0,0,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",game,owner);
  sql.exec('INSERT INTO content_used_ids VALUES(?)',game);
  sql.exec("INSERT INTO content_deletion_fences VALUES(?,?,?,'1','2','2026-01-01T00:00:00.000Z')",game,owner,owner);
  let lists = 0, mutate = false, changeTopology = null;
  const inventory = new GameDeletionInventory({storage,principal:()=>({id:owner,epoch:1,role:'author',must_change:false}),bucket:{async list(){lists++;if(mutate){mutate=false;enqueue();}if(changeTopology){const change=changeTopology;changeTopology=null;change();}return{objects:[],truncated:false};}}});
  const empty = await inventory.observe('owned',game);
  assert.equal(empty.deleteAllowed,false); assert.equal(lists,2);
  assert.ok(!JSON.stringify(empty).includes('other-game-name'));
  rollback(() => { enqueue(); rejected(()=>inventory.referenceSummary('owned',game),'DELETE_DISTRIBUTION_UNSUPPORTED'); });
  assert.equal(lists,2);
  checks.push('empty-ledger observation stays non-authorizing; foreign-game envelope blocks inventory before bucket I/O');
  rollback(() => { sql.exec('DELETE FROM content_distribution_state'); rejected(()=>inventory.referenceSummary('owned',game),'DELETE_DISTRIBUTION_UNSUPPORTED'); });
  rollback(() => { sql.exec('DROP TABLE content_distribution_chunks'); rejected(()=>inventory.referenceSummary('owned',game),'DELETE_INVENTORY_SCHEMA'); });
  checks.push('missing singleton/table cannot masquerade as empty distribution');
  // Existing intent rows belong to the fenced game even though no object-byte
  // reference is introduced. Foreign-game intent rows are not its inventory.
  const geometry = JSON.stringify([{x:1,y:1},{x:2,y:1}]);
  for (const id of [game, other]) {
    sql.exec('INSERT INTO draft_topology_moves VALUES(?,?,?,?,?)',id,'city-owned',10,20,'2026-01-01T00:00:00.000Z');
    sql.exec('INSERT INTO draft_topology_rebuilds VALUES(?,?,?,?,?)',id,'road-owned',geometry,'land','2026-01-01T00:00:00.000Z');
  }
  const topologyRows = () => ['draft_topology_moves','draft_topology_rebuilds'].map(table=>rows(`SELECT * FROM ${table} ORDER BY game_id`));
  const beforeTopology = topologyRows(), tracked = await inventory.observe('owned',game);
  assert.equal(tracked.associatedRows,empty.associatedRows+2);
  assert.notEqual(tracked.sqlDigest,empty.sqlDigest);
  assert.equal(tracked.referencedHashes,empty.referencedHashes);
  assert.equal(tracked.privateListed,0); assert.equal(tracked.deleteAllowed,false);
  assert.deepEqual(topologyRows(),beforeTopology);
  sql.exec('UPDATE draft_topology_moves SET x=11 WHERE game_id=?',other);
  sql.exec("UPDATE draft_topology_rebuilds SET travel_kind='water' WHERE game_id=?",other);
  const changedForeign = topologyRows();
  assert.deepEqual(await inventory.observe('owned',game),tracked);
  assert.deepEqual(topologyRows(),changedForeign);
  checks.push('target move/rebuild rows counted and hashed without adding object references; foreign intents excluded and observations do not write');
  for (const [change,restore] of [
    [()=>sql.exec('UPDATE draft_topology_moves SET x=11 WHERE game_id=?',game),()=>sql.exec('UPDATE draft_topology_moves SET x=10 WHERE game_id=?',game)],
    [()=>sql.exec("UPDATE draft_topology_rebuilds SET travel_kind='water' WHERE game_id=?",game),()=>sql.exec("UPDATE draft_topology_rebuilds SET travel_kind='land' WHERE game_id=?",game)],
  ]) {
    const beforeLists = lists; changeTopology = change;
    await assert.rejects(()=>inventory.observe('owned',game),error=>error.code==='DELETE_INVENTORY_CHANGED'&&error.status===409);
    assert.equal(lists,beforeLists+1); assert.equal(changeTopology,null);
    restore(); assert.deepEqual(await inventory.observe('owned',game),tracked);
    assert.deepEqual(topologyRows(),changedForeign);
  }
  checks.push('either target intent table changing during list rejects at first await; explicit fixture restoration permits fresh observation, never deletion');
  const beforeDistributionLists = lists; mutate = true;
  await assert.rejects(()=>inventory.observe('owned',game),error=>error.code==='DELETE_DISTRIBUTION_UNSUPPORTED'&&error.status===503);
  assert.equal(lists,beforeDistributionLists+1); assert.equal(ledger.status().tailGeneration,1);
  checks.push('cross-game enqueue during list is rejected at await boundary, no second list');
  assert.equal(assertDeletionDefinitions(sql).schemaDigest,facts.schemaDigest);
  return {checks,groups:checks.length,tables:54,indexes:52,columns:361,foreignKeys:4,scope:'owned SQL and deletion observation only; populated global ledger deliberately unsupported, no producer/drain/physical deletion proof'};
}
