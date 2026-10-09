// Internal current pending draft requests terminalization; NOT provider drain or deletion permission.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fail, fields } from './security.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,63}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const columns=['actor','op_key','request_digest','auth_epoch','game_id','expected_revision','request_json','state','result_json','error_code','error_status','source_digest','dependency_digest','root_key','result_revision','created_at','completed_at'];
function digest(rows){const s=JSON.stringify(rows);if(Buffer.byteLength(s)>4*1024*1024)fail(413,'DELETE_DRAFT_FREEZE_BUDGET');return createHash('sha256').update(s).digest('hex');}
export class GameDeletionDraftFreeze {
 #storage;#sql;#principal;#key;
 constructor({storage,principal,requestKey}){
  if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('actual same SQLite storage and principal required');
  this.#storage=storage;this.#sql=storage.sql;this.#principal=principal;this.#key=requestKey;
  storage.transactionSync(()=>this.#sql.exec('CREATE TABLE IF NOT EXISTS content_deletion_draft_freezes (game_id TEXT PRIMARY KEY,fence_revision TEXT NOT NULL,actor_id TEXT NOT NULL,before_digest TEXT NOT NULL,after_digest TEXT NOT NULL,freeze_mac TEXT NOT NULL,frozen_count INTEGER NOT NULL,preserved_count INTEGER NOT NULL,created_at TEXT NOT NULL)'));
 }
 #one(q,...v){return this.#sql.exec(q,...v).toArray()[0];}
 #seal(r){
  if(!hex(this.#key))fail(503,'DELETE_DRAFT_FREEZE_KEY_UNAVAILABLE');
  if(!uuid(r.game_id)||!revision(r.fence_revision)||typeof r.actor_id!=='string'||!r.actor_id||r.actor_id.length>256||!hex(r.before_digest)||!hex(r.after_digest)||!Number.isSafeInteger(r.frozen_count)||r.frozen_count<0||!Number.isSafeInteger(r.preserved_count)||r.preserved_count<0||typeof r.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.created_at))fail(503,'DELETE_DRAFT_FREEZE_CORRUPT');
  return createHmac('sha256',Buffer.from(this.#key,'hex')).update(JSON.stringify(['draft-request-deletion-freeze-1',r.game_id,r.fence_revision,r.actor_id,r.before_digest,r.after_digest,r.frozen_count,r.preserved_count,r.created_at])).digest('hex');
 }
 #requests(game){
  const schema=this.#sql.exec('PRAGMA table_xinfo(draft_requests)').toArray();
  if(JSON.stringify(schema.map(r=>r.name))!==JSON.stringify(columns)||schema.some(r=>r.hidden!==0))fail(503,'DELETE_DRAFT_FREEZE_SCHEMA');
  const rows=this.#sql.exec('SELECT * FROM draft_requests WHERE game_id=? ORDER BY actor,op_key',game.game_id).toArray();if(rows.length>10000)fail(413,'DELETE_DRAFT_FREEZE_BUDGET');
  for(const r of rows){
   if(r.actor!==game.owner_id||typeof r.op_key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(r.op_key)||!hex(r.request_digest)||!Number.isSafeInteger(r.auth_epoch)||r.auth_epoch<0||!revision(r.expected_revision)||typeof r.request_json!=='string'||!['pending','failed','committed'].includes(r.state))fail(503,'DELETE_DRAFT_FREEZE_REQUEST');
   if(r.state==='pending'&&[r.result_json,r.error_code,r.error_status,r.source_digest,r.dependency_digest,r.root_key,r.result_revision,r.completed_at].some(v=>v!==null))fail(503,'DELETE_DRAFT_FREEZE_REQUEST');
  }
  return {rows,digest:digest(rows)};
 }
 freeze(tokenHash,input){
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input;
  return this.#storage.transactionSync(()=>{
   const actor=this.#principal(tokenHash);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
   if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED');if(!uuid(gameId)||!revision(expectedRowRevision))fail(422,'DELETE_DRAFT_FREEZE_INPUT');
   const game=this.#one('SELECT * FROM content_games WHERE game_id=?',gameId);if(!game||game.owner_id!==actor.id&&actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
   const fence=this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId);if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
   if(game.listed!==0||fence.owner_id!==game.owner_id||fence.fence_revision!==game.row_revision||!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId))fail(409,'DELETE_FENCE_CHANGED');
   if(expectedRowRevision!==game.row_revision)fail(409,'DELETE_DRAFT_FREEZE_CHANGED');
   const before=this.#requests(game),old=this.#one('SELECT * FROM content_deletion_draft_freezes WHERE game_id=?',gameId);let record=old;
   if(old){
    const seal=this.#seal(old);if(!hex(old.freeze_mac)||!timingSafeEqual(Buffer.from(seal,'hex'),Buffer.from(old.freeze_mac,'hex')))fail(503,'DELETE_DRAFT_FREEZE_CORRUPT');
    if(old.fence_revision!==game.row_revision||old.after_digest!==before.digest||old.frozen_count+old.preserved_count!==before.rows.length)fail(409,'DELETE_DRAFT_FREEZE_CHANGED');
   }else{
    let frozen=0,preserved=0;const time=new Date().toISOString();
    for(const r of before.rows){if(r.state!=='pending'){preserved++;continue;}this.#sql.exec("UPDATE draft_requests SET state='failed',error_code='DELETION_FROZEN',error_status=409,completed_at=? WHERE actor=? AND op_key=? AND game_id=? AND state='pending'",time,r.actor,r.op_key,gameId);frozen++;}
    const after=this.#requests(game);record={game_id:gameId,fence_revision:game.row_revision,actor_id:actor.id,before_digest:before.digest,after_digest:after.digest,frozen_count:frozen,preserved_count:preserved,created_at:time};
    const seal=this.#seal(record);this.#sql.exec('INSERT INTO content_deletion_draft_freezes VALUES(?,?,?,?,?,?,?,?,?)',gameId,record.fence_revision,actor.id,record.before_digest,record.after_digest,seal,frozen,preserved,time);
   }
   return Object.freeze({gameId,rowRevision:game.row_revision,draftStateDigest:record.after_digest,requestsFrozen:record.frozen_count,requestsPreserved:record.preserved_count,createdAt:record.created_at,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_DRAFT_REQUESTS_FROZEN_NOT_DRAINED'});
  });
 }
}
