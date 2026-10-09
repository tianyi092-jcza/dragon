// Internal current CompileJobs terminalization; NOT native drain, cleanup or deletion authority.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fail, fields } from './security.js';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const revision = v => typeof v === 'string' && /^[1-9][0-9]{0,63}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const columns = ['job_id','actor_id','auth_epoch','game_id','draft_revision','root_key','source_digest','dependency_digest','scope','compiler_revision','profile_revision','pipeline_digest','state','stage_cursor','attempt','generation','lease_hash','lease_until','row_revision','checkpoint_json','failure_code','retryable','created_at','updated_at'];
const sha = text => createHash('sha256').update(text).digest('hex');
function encoded(rows) { const text=JSON.stringify(rows);if(Buffer.byteLength(text)>4*1024*1024)fail(413,'DELETE_JOB_FREEZE_BUDGET');return text; }
export class GameDeletionJobFreeze {
  #storage; #sql; #principal; #key;
  constructor({storage,principal,requestKey}) {
    if(!storage?.sql || typeof storage.transactionSync!=='function' || typeof principal!=='function')throw new TypeError('actual same SQLite storage and principal required');
    this.#storage=storage;this.#sql=storage.sql;this.#principal=principal;this.#key=requestKey;
    storage.transactionSync(()=>this.#sql.exec('CREATE TABLE IF NOT EXISTS content_deletion_job_freezes (game_id TEXT PRIMARY KEY,fence_revision TEXT NOT NULL,actor_id TEXT NOT NULL,before_digest TEXT NOT NULL,after_digest TEXT NOT NULL,freeze_mac TEXT NOT NULL,frozen_count INTEGER NOT NULL,preserved_count INTEGER NOT NULL,created_at TEXT NOT NULL)'));
  }
  #one(q,...values){return this.#sql.exec(q,...values).toArray()[0];}
  #seal(row) {
    if(!hex(this.#key))fail(503,'DELETE_JOB_FREEZE_KEY_UNAVAILABLE');
    if(!uuid(row.game_id)||!revision(row.fence_revision)||typeof row.actor_id!=='string'||!row.actor_id||row.actor_id.length>256||!hex(row.before_digest)||!hex(row.after_digest)||!Number.isSafeInteger(row.frozen_count)||row.frozen_count<0||!Number.isSafeInteger(row.preserved_count)||row.preserved_count<0||typeof row.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.created_at))fail(503,'DELETE_JOB_FREEZE_CORRUPT');
    return createHmac('sha256',Buffer.from(this.#key,'hex')).update(JSON.stringify(['compile-job-deletion-freeze-1',row.game_id,row.fence_revision,row.actor_id,row.before_digest,row.after_digest,row.frozen_count,row.preserved_count,row.created_at])).digest('hex');
  }
  #jobs(game) {
    const schema=this.#sql.exec('PRAGMA table_info(compile_jobs)').toArray().map(r=>r.name);
    if(JSON.stringify(schema)!==JSON.stringify(columns))fail(503,'DELETE_JOB_FREEZE_SCHEMA');
    const rows=this.#sql.exec('SELECT * FROM compile_jobs WHERE game_id=? ORDER BY job_id',game.game_id).toArray();if(rows.length>10000)fail(413,'DELETE_JOB_FREEZE_BUDGET');
    for(const r of rows){
      if(!uuid(r.job_id)||r.actor_id!==game.owner_id||!['queued','running','failed','ready'].includes(r.state)||![0,1].includes(r.retryable)||!revision(r.row_revision)||!Number.isSafeInteger(r.generation)||r.generation<0||!Number.isSafeInteger(r.lease_until)||r.lease_until<0||r.state==='running'&&(!hex(r.lease_hash)||r.lease_until<1)||r.state!=='running'&&(r.lease_hash!==null||r.lease_until!==0))fail(503,'DELETE_JOB_FREEZE_JOB');
    }
    return {rows,digest:sha(encoded(rows))};
  }
  freeze(tokenHash,input) {
    fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input;
    return this.#storage.transactionSync(()=>{
      const actor=this.#principal(tokenHash);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
      if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED');if(!uuid(gameId)||!revision(expectedRowRevision))fail(422,'DELETE_JOB_FREEZE_INPUT');
      const game=this.#one('SELECT * FROM content_games WHERE game_id=?',gameId);
      if(!game || game.owner_id!==actor.id&&actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
      const fence=this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId);
      if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
      if(game.listed!==0||fence.owner_id!==game.owner_id||fence.fence_revision!==game.row_revision||!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId))fail(409,'DELETE_FENCE_CHANGED');
      if(expectedRowRevision!==game.row_revision)fail(409,'DELETE_JOB_FREEZE_CHANGED');
      const before=this.#jobs(game),old=this.#one('SELECT * FROM content_deletion_job_freezes WHERE game_id=?',gameId);
      let record=old;
      if(old){
        const seal=this.#seal(old);if(!hex(old.freeze_mac)||!timingSafeEqual(Buffer.from(seal,'hex'),Buffer.from(old.freeze_mac,'hex')))fail(503,'DELETE_JOB_FREEZE_CORRUPT');
        if(old.fence_revision!==game.row_revision||old.after_digest!==before.digest||old.frozen_count+old.preserved_count!==before.rows.length)fail(409,'DELETE_JOB_FREEZE_CHANGED');
      }else{
        let frozen=0,preserved=0;const time=new Date().toISOString();
        for(const row of before.rows){
          if(row.state==='ready'||row.state==='failed'&&row.retryable===0){preserved++;continue;}
          const next=String(BigInt(row.row_revision)+1n);if(!revision(next)||row.generation===Number.MAX_SAFE_INTEGER)fail(503,'DELETE_JOB_FREEZE_JOB');
          this.#sql.exec("UPDATE compile_jobs SET state='failed',generation=?,lease_hash=NULL,lease_until=0,row_revision=?,failure_code='DELETION_FROZEN',retryable=0,updated_at=? WHERE job_id=?",row.generation+1,next,time,row.job_id);frozen++;
        }
        const after=this.#jobs(game);record={game_id:gameId,fence_revision:game.row_revision,actor_id:actor.id,before_digest:before.digest,after_digest:after.digest,frozen_count:frozen,preserved_count:preserved,created_at:time};
        const seal=this.#seal(record);this.#sql.exec('INSERT INTO content_deletion_job_freezes VALUES(?,?,?,?,?,?,?,?,?)',gameId,record.fence_revision,actor.id,record.before_digest,record.after_digest,seal,frozen,preserved,time);
      }
      return Object.freeze({gameId,rowRevision:game.row_revision,jobStateDigest:record.after_digest,jobsFrozen:record.frozen_count,jobsPreserved:record.preserved_count,createdAt:record.created_at,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_COMPILE_JOBS_FROZEN_NOT_DRAINED'});
    });
  }
}
