// Native quick_check fact only; no UNIQUE/index-content/FK/business/ref/delete certification.
import {GameDeletionSchemaIntegrity} from './deletionschemaintegrity.js';
import {fail,fields} from './security.js';
function budget(sql){let size;try{size=sql.databaseSize;}catch{fail(503,'DELETE_SQL_CHECK_QUERY');}if(!Number.isSafeInteger(size)||size<0)fail(503,'DELETE_SQL_CHECK_QUERY');if(size>32*1024*1024)fail(503,'DELETE_SQL_CHECK_BUDGET');}
function enforcement(sql){let rows;try{rows=sql.exec('PRAGMA ignore_check_constraints').toArray();}catch{fail(503,'DELETE_SQL_CHECK_QUERY');}if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).length!==1||!Object.hasOwn(rows[0],'ignore_check_constraints'))fail(503,'DELETE_SQL_CHECK_QUERY');if(rows[0].ignore_check_constraints!==0)fail(503,'DELETE_SQL_CHECK_ENFORCEMENT');}
export function inspectNativeQuickCheck(sql){
 budget(sql);enforcement(sql);let rows;
 try{rows=sql.exec('PRAGMA quick_check(1)').toArray();}catch{fail(503,'DELETE_SQL_CHECK_QUERY');}
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).length!==1||!Object.hasOwn(rows[0],'quick_check'))fail(503,'DELETE_SQL_CHECK_QUERY');
 if(rows[0].quick_check!=='ok')fail(503,'DELETE_SQL_CHECK_ROWS');
 enforcement(sql);budget(sql);return Object.freeze({quickCheckVerified:true});
}
export class GameDeletionCheckRows{
 #storage;#principal;
 constructor({storage,principal}){if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('same SQLite storage and trusted principal required');this.#storage=storage;this.#principal=principal;}
 observe(tokenHash,input){
  fields(input,['gameId','expectedRowRevision']);const target=Object.freeze({gameId:input.gameId,expectedRowRevision:input.expectedRowRevision});
  return this.#storage.transactionSync(()=>{
   const first=this.#principal(tokenHash);if(first.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');const identity={id:first.id,epoch:first.epoch,role:first.role};
   const pinned=h=>{const actor=this.#principal(h);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(actor.id!==identity.id||actor.epoch!==identity.epoch||actor.role!==identity.role)fail(401,'DELETE_SQL_CHECK_ACTOR_CHANGED');return actor;};
   const gate=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:pinned}),initial=gate.observe(tokenHash,target);
   inspectNativeQuickCheck(this.#storage.sql);const final=gate.observe(tokenHash,target);pinned(tokenHash);inspectNativeQuickCheck(this.#storage.sql);
   if(initial.schemaDigest!==final.schemaDigest)fail(503,'DELETE_SQL_CHECK_SCHEMA_CHANGED');
   // No global database size, row counts, IDs, SQLite messages or bad-row values in the owner DTO.
   return Object.freeze({...final,quickCheckVerified:true,rowIntegrityVerified:false,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_NATIVE_SQL_QUICK_CHECK_ONLY_LEGACY_UNKNOWN'});
  });
 }
}
