// Opt-in same-SQL definitions + original freezes; NOT row/ref/native drain/delete admission.
import {fields,fail} from './security.js';
import {GameDeletionSchemaIntegrity} from './deletionschemaintegrity.js';
import {GameDeletionSqlFreeze} from './deletionsqlfreeze.js';
export class GameDeletionDefinitionFreeze {
 #storage;#principal;#key;
 constructor({storage,principal,requestKey}){
  if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('actual same SQLite storage and trusted principal required');
  this.#storage=storage;this.#principal=principal;this.#key=requestKey;
 }
 freeze(tokenHash,input){
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input,target=Object.freeze({gameId,expectedRowRevision});
  return this.#storage.transactionSync(()=>{
   const first=this.#principal(tokenHash);if(first.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
   const identity=Object.freeze({id:first.id,epoch:first.epoch,role:first.role});
   const pinned=h=>{const actor=this.#principal(h);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(actor.id!==identity.id||actor.epoch!==identity.epoch||actor.role!==identity.role)fail(401,'DELETE_DEFINITION_FREEZE_ACTOR_CHANGED');return actor;};
   // Validate BEFORE original IF-NOT-EXISTS constructors: missing tables must not be silently recreated.
   const schema=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:pinned});
   const before=schema.observe(tokenHash,target);
   const original=new GameDeletionSqlFreeze({storage:this.#storage,principal:pinned,requestKey:this.#key});
   const frozen=original.freeze(tokenHash,target);
   const after=schema.observe(tokenHash,target);pinned(tokenHash);
   if(after.schemaDigest!==before.schemaDigest)fail(503,'DELETE_DEFINITION_FREEZE_SCHEMA_CHANGED');
   return Object.freeze({...frozen,schemaDigest:after.schemaDigest,definitionsVerified:true,rowIntegrityVerified:false,mode:'CURRENT_DECLARED_SQL_FREEZES_ATOMIC_NATIVE_DRAIN_UNKNOWN'});
  });
 }
}
