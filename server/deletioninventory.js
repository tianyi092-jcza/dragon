// Internal read-only deletion observations, NOT a cleanup plan/capability, bytes proof or drain.
import { createHash } from 'node:crypto';
import { fail } from './security.js';
import { assertDeletionColumnSchema } from './deletionschema.js';
import { buildPrivateReferenceEdges } from './deletionreferences.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const knownTables = new Set(['schema_version','users','sessions','login_rates','operations','content_schema','content_used_ids','content_games','content_snapshots','content_names','content_reservations','content_operations','content_audits','content_deletion_fences','content_deletion_operations','copy_http_commands','copy_requests','copy_objects','copy_origins','installed_sources','source_operations','draft_requests','draft_objects','draft_references','compile_jobs','compile_operations','stage_http_commands','content_http_command_targets','content_http_command_proofs','content_private_writes','content_deletion_job_freezes','data_compile_objects','image_compile_objects','fallback_compile_objects','content_deletion_draft_freezes']);
const scopedTables = ['content_snapshots','content_names','content_audits','content_deletion_operations','copy_requests','copy_objects','copy_origins','draft_requests','draft_objects','draft_references','compile_jobs','content_http_command_proofs','content_private_writes','content_deletion_job_freezes','data_compile_objects','image_compile_objects','fallback_compile_objects','content_deletion_draft_freezes'];
const objectTables = ['copy_objects','draft_objects','draft_references','data_compile_objects','image_compile_objects','fallback_compile_objects'];
function json(value) { try { return JSON.parse(value); } catch { fail(503, 'DELETE_INVENTORY_RECORD'); } }
function encode(value) { const text = JSON.stringify(value); if (Buffer.byteLength(text) > 4 * 1024 * 1024) fail(413, 'DELETE_INVENTORY_BUDGET'); return text; }
export class GameDeletionInventory {
  #storage; #sql; #principal; #bucket;
  constructor({ storage, principal, bucket }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof bucket?.list !== 'function') throw new TypeError('actual same SQLite principal and paginated bucket list required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#bucket = bucket;
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #capture(tokenHash, gameId) {
    return this.#storage.transactionSync(() => {
      const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
      if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED'); if (!uuid(gameId)) fail(422, 'GAME_ID');
      const game = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId);
      if (!game || game.owner_id !== actor.id && actor.role !== 'admin') fail(404, 'GAME_NOT_FOUND');
      const fence = this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?', gameId);
      if (!fence) fail(409, 'DELETE_FENCE_REQUIRED');
      if (game.listed !== 0 || fence.owner_id !== game.owner_id || fence.fence_revision !== game.row_revision || !this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', gameId)) fail(409, 'DELETE_FENCE_CHANGED');
      // New schema is not silently treated as having no references. No client-selected SQL.
      const schema = this.#sql.exec("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").toArray().filter(r => !r.name.startsWith('sqlite_') && !r.name.startsWith('_cf_'));
      if (schema.some(r => !knownTables.has(r.name)) || !schema.some(r => r.name === 'content_deletion_fences')) fail(503, 'DELETE_INVENTORY_SCHEMA');
      assertDeletionColumnSchema(this.#sql,schema);
      const present = new Set(schema.map(r => r.name)), rows = {};
      for (const table of scopedTables) rows[table] = present.has(table) ? this.#sql.exec('SELECT * FROM '+table+' WHERE game_id=?', gameId).toArray() : [];
      const jobs = new Set(rows.compile_jobs.map(r => r.job_id));
      rows.compile_operations = present.has('compile_operations') ? this.#sql.exec('SELECT * FROM compile_operations').toArray().filter(r => jobs.has(r.job_id)) : [];
      rows.content_operations = this.#sql.exec('SELECT * FROM content_operations').toArray().filter(r => r.target === gameId || json(r.result_json)?.gameId === gameId);
      const keys = new Set([...rows.content_operations,...rows.copy_requests].map(r => r.actor+'\0'+r.op_key));
      rows.content_reservations = this.#sql.exec('SELECT * FROM content_reservations').toArray().filter(r => r.target === gameId || keys.has(r.actor+'\0'+r.op_key));
      rows.content_http_command_targets = present.has('content_http_command_targets') ? this.#sql.exec('SELECT * FROM content_http_command_targets WHERE game_id=?', gameId).toArray() : [];
      rows.copy_http_commands = []; rows.stage_http_commands = [];
      for (const relation of rows.content_http_command_targets) {
        let command, target;
        if (relation.kind === 'copy') {
          command = this.#one('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?', relation.actor, relation.op_key);
          target = rows.copy_requests.find(r => r.actor === relation.actor && r.op_key === relation.target_id);
          if (command) rows.copy_http_commands.push(command);
        } else if (relation.kind === 'stage') {
          command = this.#one('SELECT * FROM stage_http_commands WHERE actor=? AND op_key=?', relation.actor, relation.op_key);
          target = rows.compile_jobs.find(r => r.actor_id === relation.actor && r.job_id === relation.target_id);
          if (command) rows.stage_http_commands.push(command);
        }
        if (!command || !target || target.game_id !== gameId) fail(503, 'DELETE_INVENTORY_COMMAND_TARGET');
      }
      // Complete root-key checks across games, never hash-equality-as-sharing.
      const prefix = 'private/'+gameId+'/', foreignRoots = [];
      for (const table of ['content_snapshots','compile_jobs']) if (present.has(table)) for (const r of this.#sql.exec('SELECT game_id,root_key FROM '+table).toArray()) if (r.game_id !== gameId && typeof r.root_key === 'string' && r.root_key.startsWith(prefix)) foreignRoots.push([table,r.game_id,r.root_key]);
      for (const values of Object.values(rows)) values.sort((a,b) => { const x=JSON.stringify(a), y=JSON.stringify(b); if(x<y)return -1; if(x>y)return 1; return 0; });
      foreignRoots.sort(); const text=encode({schema,game,fence,rows,foreignRoots});
      return { actorId:actor.id, epoch:actor.epoch, gameId, rowRevision:game.row_revision, rows, foreignRoots, sqlDigest:sha(text) };
    });
  }
  #current(tokenHash, prior) {
    const now=this.#capture(tokenHash, prior.gameId);
    if (now.actorId !== prior.actorId || now.epoch !== prior.epoch) fail(401, 'SESSION_INVALID');
    if (now.sqlDigest !== prior.sqlDigest) fail(409, 'DELETE_INVENTORY_CHANGED');
  }
  async #list(tokenHash, capture) {
    const prefix='private/'+capture.gameId+'/', seen=new Set(), cursors=new Set(), result=[]; let cursor;
    for (let page=0; page<128; page++) {
      const options={prefix,limit:1000}; if(cursor)options.cursor=cursor;
      const response=await this.#bucket.list(options); this.#current(tokenHash,capture);
      if (!response || !Array.isArray(response.objects) || typeof response.truncated !== 'boolean') fail(503,'DELETE_INVENTORY_LIST');
      for (const item of response.objects) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.key !== 'string' || !item.key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(item.key.slice(prefix.length)) || seen.has(item.key) || !Number.isSafeInteger(item.size) || item.size<1 || typeof item.etag !== 'string' || item.etag.length<1 || item.etag.length>256) fail(503,'DELETE_INVENTORY_OBJECT');
        seen.add(item.key); result.push({sha256:item.key.slice(prefix.length),byteLength:item.size,etag:item.etag}); if(result.length>10000)fail(413,'DELETE_INVENTORY_BUDGET');
      }
      if (!response.truncated) return result.sort((a,b)=>{if(a.sha256<b.sha256)return -1;if(a.sha256>b.sha256)return 1;return 0;});
      if (typeof response.cursor !== 'string' || !response.cursor || response.cursor.length>4096 || cursors.has(response.cursor)) fail(503,'DELETE_INVENTORY_CURSOR');
      cursors.add(response.cursor); cursor=response.cursor;
    }
    fail(413,'DELETE_INVENTORY_PAGES');
  }
  // Trusted internal metadata summary only. Fresh authorization/schema/fence; no object keys or authority escape.
  referenceSummary(tokenHash, gameId) {
    const captured=this.#capture(tokenHash,gameId), graph=buildPrivateReferenceEdges(captured);
    return Object.freeze({gameId,rowRevision:captured.rowRevision,sqlDigest:captured.sqlDigest,referenceDigest:graph.referenceDigest,referencedObjects:graph.nodes.length,referenceEdges:graph.edgeCount,multiplyReferencedObjects:graph.nodes.filter(n=>n.edges.length>1).length,unknownLengthObjects:graph.nodes.filter(n=>n.byteLength===null).length,foreignRootReferences:captured.foreignRoots.length,deleteAllowed:false,coverage:'CURRENT_EXPLICIT_EDGES_ONLY_LEGACY_UNKNOWN',mode:'OBSERVED_SQL_REFERENCE_EDGES_NOT_DELETE_PLAN'});
  }
  async observe(tokenHash, gameId) {
    const captured=this.#capture(tokenHash,gameId), first=await this.#list(tokenHash,captured), second=await this.#list(tokenHash,captured);
    if (encode(first)!==encode(second)) fail(409,'DELETE_INVENTORY_OBJECTS_CHANGED'); this.#current(tokenHash,captured);
    const graph=buildPrivateReferenceEdges(captured), refs=new Map(graph.nodes.map(node=>[node.sha256,node.byteLength]));
    const listed=new Map(second.map(r=>[r.sha256,r]));let missing=0,untracked=0;
    for(const[hash,length]of refs){const item=listed.get(hash);if(!item)missing++;else if(length!==null&&length!==item.byteLength)fail(503,'DELETE_INVENTORY_LENGTH');}
    for(const hash of listed.keys())if(!refs.has(hash))untracked++;
    const pending=captured.rows.compile_jobs.filter(r=>r.state==='running').length+captured.rows.copy_requests.filter(r=>['pending','running'].includes(r.state)).length+captured.rows.draft_requests.filter(r=>r.state==='pending').length;
    const summary={gameId,rowRevision:captured.rowRevision,sqlDigest:captured.sqlDigest,inventoryDigest:sha(encode({sqlDigest:captured.sqlDigest,objects:second})),privateListed:second.length,referencedHashes:refs.size,missingReferences:missing,untrackedPrivateObjects:untracked,foreignRootReferences:captured.foreignRoots.length,pendingRecords:pending,associatedRows:Object.values(captured.rows).reduce((n,r)=>n+r.length,0),intentRecords:objectTables.reduce((n,t)=>n+captured.rows[t].filter(r=>r.state==='intent').length,0),privateWritesPending:captured.rows.content_private_writes.filter(r=>r.state==='pending').length,privateWritesUncertain:captured.rows.content_private_writes.filter(r=>r.state==='uncertain').length,privateWriteCoverage:'ROOT_PUT_ADAPTER_ONLY_LEGACY_UNKNOWN',deleteAllowed:false,httpCommandCoverage:'BOUND_ROWS_ONLY_LEGACY_UNKNOWN',mode:'OBSERVED_METADATA_ONLY_NOT_DELETE_PLAN'};
    // Summary intentionally excludes other owners, content, object keys/hashes and lease/operation secrets.
    return Object.freeze(summary);
  }
}
