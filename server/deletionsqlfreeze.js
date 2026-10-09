// Current same-SQL coordinator. SQL terminalization is NOT native drain or deletion permission.
import { GameDeletionJobFreeze } from './deletionjobfreeze.js';
import { GameDeletionDraftFreeze } from './deletiondraftfreeze.js';
import { assertDeletionColumnSchema } from './deletionschema.js';
import { fail, fields } from './security.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,63}$/.test(v);
export class GameDeletionSqlFreeze {
 #storage;#sql;#principal;#jobs;#drafts;
 constructor({storage,principal,requestKey}){
  if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('actual same SQLite storage and principal required');
  this.#storage=storage;this.#sql=storage.sql;this.#principal=principal;
  this.#jobs=new GameDeletionJobFreeze({storage,principal,requestKey});this.#drafts=new GameDeletionDraftFreeze({storage,principal,requestKey});
 }
 #one(q,...v){return this.#sql.exec(q,...v).toArray()[0];}
 freeze(tokenHash,input){
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input,target=Object.freeze({gameId,expectedRowRevision});
  return this.#storage.transactionSync(()=>{
   const actor=this.#principal(tokenHash);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
   if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED');if(!uuid(gameId)||!revision(expectedRowRevision))fail(422,'DELETE_SQL_FREEZE_INPUT');
   const game=this.#one('SELECT * FROM content_games WHERE game_id=?',gameId);if(!game||game.owner_id!==actor.id&&actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
   const fence=this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId);if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
   if(game.listed!==0||fence.owner_id!==game.owner_id||fence.fence_revision!==game.row_revision||!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId))fail(409,'DELETE_FENCE_CHANGED');
   if(expectedRowRevision!==game.row_revision)fail(409,'DELETE_SQL_FREEZE_CHANGED');
   const schema=this.#sql.exec("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").toArray().filter(r=>!r.name.startsWith('sqlite_')&&!r.name.startsWith('_cf_'));
   assertDeletionColumnSchema(this.#sql,schema);
   // Current AdminFullCopy creates Game and committed request atomically. Any nonterminal row is unknown/corrupt here, not a cancellable copy lease.
   const copies=this.#sql.exec('SELECT * FROM copy_requests WHERE game_id=? ORDER BY actor,op_key',gameId).toArray();
   if(copies.length>1)fail(503,'DELETE_SQL_FREEZE_COPY_CHANGED');
   for(const r of copies)if(r.actor!==game.owner_id||r.state!=='committed'||r.lease_hash!==null||r.lease_until!==0)fail(409,'DELETE_SQL_FREEZE_COPY_ACTIVE');
   const writes=this.#sql.exec('SELECT state,COUNT(*) AS n FROM content_private_writes WHERE game_id=? GROUP BY state ORDER BY state',gameId).toArray();let pending=0,uncertain=0;
   for(const r of writes){if(!['pending','settled','uncertain'].includes(r.state)||!Number.isSafeInteger(r.n)||r.n<1)fail(503,'DELETE_SQL_FREEZE_WRITES');if(r.state==='pending')pending=r.n;else if(r.state==='uncertain')uncertain=r.n;}
   // Both services use THIS storage. An outer failure must also roll back their nested transaction effects and seals.
   const jobs=this.#jobs.freeze(tokenHash,target),drafts=this.#drafts.freeze(tokenHash,target);
   return Object.freeze({gameId,rowRevision:game.row_revision,jobStateDigest:jobs.jobStateDigest,draftStateDigest:drafts.draftStateDigest,jobsFrozen:jobs.jobsFrozen,jobsPreserved:jobs.jobsPreserved,requestsFrozen:drafts.requestsFrozen,requestsPreserved:drafts.requestsPreserved,copyRequestsPreserved:copies.length,privateWritesPending:pending,privateWritesUncertain:uncertain,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_SQL_FREEZES_ATOMIC_NATIVE_DRAIN_UNKNOWN'});
  });
 }
}
