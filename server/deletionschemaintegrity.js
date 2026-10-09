// Read-only current SQL declarations within the real authority/fence transaction. Not row/ref/delete authority.
import {assertDeletionDefinitions} from './deletiondefinitions.js';
import {fail,fields} from './security.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const revision=v=>typeof v==='string'&&/^[1-9][0-9]{0,63}$/.test(v);
export class GameDeletionSchemaIntegrity {
 #storage;#sql;#principal;
 constructor({storage,principal}){if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('same SQLite storage and trusted principal required');this.#storage=storage;this.#sql=storage.sql;this.#principal=principal;}
 #one(q,...v){return this.#sql.exec(q,...v).toArray()[0];}
 observe(tokenHash,input){
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input;
  return this.#storage.transactionSync(()=>{
   const actor=this.#principal(tokenHash);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
   if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED');if(!uuid(gameId)||!revision(expectedRowRevision))fail(422,'DELETE_SCHEMA_INPUT');
   const game=this.#one('SELECT * FROM content_games WHERE game_id=?',gameId);if(!game||game.owner_id!==actor.id&&actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
   const fence=this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId);if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
   if(game.listed!==0||fence.owner_id!==game.owner_id||fence.fence_revision!==game.row_revision||!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId))fail(409,'DELETE_FENCE_CHANGED');
   if(expectedRowRevision!==game.row_revision)fail(409,'DELETE_SCHEMA_CHANGED');
   const facts=assertDeletionDefinitions(this.#sql);
   return Object.freeze({gameId,rowRevision:game.row_revision,...facts,definitionsVerified:true,rowIntegrityVerified:false,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_DECLARED_SQL_DEFINITIONS_ONLY_LEGACY_UNKNOWN'});
  });
 }
}
