// Internal same-SQL structural association, NOT a command receipt, permission or cleanup grant.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { fail } from './security.js';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export class HttpCommandTargets {
  #sql; #requestKey;
  constructor(storage, requestKey) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function') throw new TypeError('actual SQLite storage required');
    this.#sql = storage.sql; this.#requestKey = requestKey;
    storage.transactionSync(() => {
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_http_command_targets (kind TEXT NOT NULL CHECK(kind IN ('copy','stage')),actor TEXT NOT NULL,op_key TEXT NOT NULL,game_id TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(kind,actor,op_key))");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_http_command_proofs (kind TEXT NOT NULL CHECK(kind IN ('copy','stage')),actor TEXT NOT NULL,op_key TEXT NOT NULL,game_id TEXT NOT NULL,target_id TEXT NOT NULL,binding_mac TEXT NOT NULL,PRIMARY KEY(kind,actor,op_key))");
    });
  }
  #binding(relation, command) {
    if (typeof this.#requestKey !== 'string' || !/^[a-f0-9]{64}$/.test(this.#requestKey)) fail(503, 'COMMAND_PROOF_KEY_UNAVAILABLE');
    if (!['copy','stage'].includes(relation.kind) || typeof relation.actor !== 'string' || !relation.actor || typeof relation.op_key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(relation.op_key) || !uuid(relation.game_id) || typeof relation.target_id !== 'string' || !relation.target_id || command.actor !== relation.actor || command.op_key !== relation.op_key || typeof command.request_digest !== 'string' || !/^[a-f0-9]{64}$/.test(command.request_digest) || !Number.isSafeInteger(command.auth_epoch) || command.auth_epoch < 1) fail(503, 'COMMAND_TARGET_PROOF_CORRUPT');
    return createHmac('sha256',Buffer.from(this.#requestKey,'hex')).update(JSON.stringify(['http-command-target-1',relation.kind,relation.actor,relation.op_key,relation.game_id,relation.target_id,command.request_digest,command.auth_epoch])).digest('hex');
  }
  // Internal verification only; callers still need actual authorization/transaction scope.
  verifyRelation(relation) {
    let command, target;
    if (relation.kind === 'copy') {
      command = this.#sql.exec('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?',relation.actor,relation.op_key).toArray()[0];
      target = this.#sql.exec('SELECT game_id FROM copy_requests WHERE actor=? AND op_key=?',relation.actor,relation.target_id).toArray()[0];
    } else if (relation.kind === 'stage') {
      command = this.#sql.exec('SELECT * FROM stage_http_commands WHERE actor=? AND op_key=?',relation.actor,relation.op_key).toArray()[0];
      target = this.#sql.exec('SELECT game_id FROM compile_jobs WHERE actor_id=? AND job_id=?',relation.actor,relation.target_id).toArray()[0];
    }
    if (!command || !target || target.game_id !== relation.game_id) fail(503,'COMMAND_TARGET_CORRUPT');
    const expected=this.#binding(relation,command),proof=this.#sql.exec('SELECT * FROM content_http_command_proofs WHERE kind=? AND actor=? AND op_key=?',relation.kind,relation.actor,relation.op_key).toArray()[0];
    if (!proof) return false; // Legacy row has no proof; it is never silently promoted.
    if (proof.game_id !== relation.game_id || proof.target_id !== relation.target_id || typeof proof.binding_mac !== 'string' || !/^[a-f0-9]{64}$/.test(proof.binding_mac) || !timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(proof.binding_mac,'hex'))) fail(503,'COMMAND_TARGET_PROOF_CORRUPT');
    return true;
  }
  // Caller must perform live authorization and invoke inside the command binding transaction.
  // Actual persisted request/job+command are checked; no supplied gameId or digest grants association.
  record(kind, actor, commandKey, target) {
    let command, request;
    if (kind === 'copy') {
      command = this.#sql.exec('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?', actor, commandKey).toArray()[0];
      request = this.#sql.exec('SELECT game_id FROM copy_requests WHERE actor=? AND op_key=?', actor, target).toArray()[0];
    } else if (kind === 'stage') {
      command = this.#sql.exec('SELECT * FROM stage_http_commands WHERE actor=? AND op_key=?', actor, commandKey).toArray()[0];
      request = this.#sql.exec('SELECT game_id FROM compile_jobs WHERE actor_id=? AND job_id=?', actor, target).toArray()[0];
    } else fail(503, 'COMMAND_TARGET_CORRUPT');
    if (!command || !request || !uuid(request.game_id)) fail(503, 'COMMAND_TARGET_CORRUPT');
    const old = this.#sql.exec('SELECT * FROM content_http_command_targets WHERE kind=? AND actor=? AND op_key=?', kind, actor, commandKey).toArray()[0];
    if (old && (old.game_id !== request.game_id || old.target_id !== target)) fail(503, 'COMMAND_TARGET_CORRUPT');
    const relation={kind,actor,op_key:commandKey,game_id:request.game_id,target_id:target};
    const sealed=this.verifyRelation(relation);
    if (!old) this.#sql.exec('INSERT INTO content_http_command_targets VALUES(?,?,?,?,?)', kind, actor, commandKey, request.game_id, target);
    if (!sealed) this.#sql.exec('INSERT INTO content_http_command_proofs VALUES(?,?,?,?,?,?)',kind,actor,commandKey,request.game_id,target,this.#binding(relation,command));
  }
}

// Internal fenced management observation, never a command receipt or deletion capability.
export class GameDeletionCommandIntegrity {
  #storage; #sql; #principal; #targets;
  constructor({storage,principal,targets}) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function' || typeof principal !== 'function' || typeof targets?.verifyRelation !== 'function') throw new TypeError('actual same SQLite, principal and trusted command verifier required');
    this.#storage=storage; this.#sql=storage.sql; this.#principal=principal; this.#targets=targets;
  }
  observe(tokenHash,gameId) {
    return this.#storage.transactionSync(()=>{
      const actor=this.#principal(tokenHash); if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
      if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED'); if(!uuid(gameId))fail(422,'GAME_ID');
      const game=this.#sql.exec('SELECT * FROM content_games WHERE game_id=?',gameId).toArray()[0];
      if(!game || game.owner_id!==actor.id && actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
      const fence=this.#sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId).toArray()[0];
      if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
      if(game.listed!==0 || fence.owner_id!==game.owner_id || fence.fence_revision!==game.row_revision || !this.#sql.exec('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId).toArray()[0])fail(409,'DELETE_FENCE_CHANGED');
      const relations=this.#sql.exec('SELECT * FROM content_http_command_targets WHERE game_id=? ORDER BY kind,actor,op_key',gameId).toArray(),proofs=this.#sql.exec('SELECT * FROM content_http_command_proofs WHERE game_id=? ORDER BY kind,actor,op_key',gameId).toArray();
      if(relations.length>10000 || proofs.length>10000)fail(413,'COMMAND_PROOF_BUDGET');
      let sealed=0,unsealed=0;
      for(const r of relations){if(this.#targets.verifyRelation(r))sealed++;else unsealed++;}
      const byKey=new Map(relations.map(r=>[JSON.stringify([r.kind,r.actor,r.op_key]),r]));
      for(const proof of proofs){const r=byKey.get(JSON.stringify([proof.kind,proof.actor,proof.op_key]));if(!r || r.target_id!==proof.target_id)fail(503,'COMMAND_TARGET_PROOF_CORRUPT');}
      const commands=relations.map(r=>{const table=r.kind==='copy'?'copy_http_commands':'stage_http_commands';return this.#sql.exec('SELECT * FROM '+table+' WHERE actor=? AND op_key=?',r.actor,r.op_key).toArray()[0];});
      const text=JSON.stringify({game,fence,relations,proofs,commands});if(Buffer.byteLength(text)>4*1024*1024)fail(413,'COMMAND_PROOF_BUDGET');
      return Object.freeze({gameId,rowRevision:game.row_revision,associationDigest:createHash('sha256').update(text).digest('hex'),sealedTargets:sealed,unsealedTargets:unsealed,deleteAllowed:false,coverage:'BOUND_COMMAND_PROOFS_ONLY_LEGACY_UNKNOWN',mode:'VERIFIED_BOUND_COMMAND_ASSOCIATIONS_NOT_DELETE_PLAN'});
    });
  }
}
