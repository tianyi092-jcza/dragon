// Current declared SQL/index projections + target name/ID bindings + freezes in ONE transaction. NOT full rows/ref/drain/delete.
import {fail,fields} from './security.js';
import {GameDeletionSchemaIntegrity} from './deletionschemaintegrity.js';
import {GameDeletionDefinitionFreeze} from './deletiondefinitionfreeze.js';
import {inspectNativeQuickCheck} from './deletioncheckrows.js';
import {inspectDeclaredForeignKeyRows} from './deletionforeignkeyrows.js';
import {inspectDeclaredUniqueKeys} from './deletionuniquerows.js';
import {inspectDeclaredIndexProjections} from './deletionindexprojections.js';
import {inspectGameNameBindings} from './deletionnamebindings.js';
import {inspectPrivateObjectRowBindings} from './deletionprivaterows.js';
import {inspectSavedJobSnapshotLinks} from './deletionsavedjobs.js';
import {inspectCopyOriginLinks} from './deletioncopyorigins.js';
import {inspectCommittedDraftReceiptLinks} from './deletiondraftreceipts.js';
import {inspectCopyOperationLinks} from './deletioncopyoperations.js';
import {inspectCompileOperationLinks} from './deletioncompileoperations.js';
import {inspectStageCommandLinks} from './deletionstagecommands.js';
import {inspectCopyCommandLinks} from './deletioncopycommands.js';
import {inspectSelectedKeyNamespaces} from './deletionkeynamespaces.js';
function checks(sql,gameId,requestKey){inspectNativeQuickCheck(sql);inspectDeclaredForeignKeyRows(sql);inspectDeclaredUniqueKeys(sql);inspectDeclaredIndexProjections(sql);inspectGameNameBindings(sql,gameId);inspectPrivateObjectRowBindings(sql,gameId);inspectSavedJobSnapshotLinks(sql,gameId);inspectCopyOriginLinks(sql,gameId);inspectCommittedDraftReceiptLinks(sql,gameId);inspectCopyOperationLinks(sql,gameId);inspectCompileOperationLinks(sql,gameId);const stage=inspectStageCommandLinks(sql,gameId,requestKey);const copy=inspectCopyCommandLinks(sql,gameId,requestKey);inspectSelectedKeyNamespaces(sql,gameId);return{stage,copy};}
// Root.principal (worker.js:97-102) policy, narrowed projection; no callback after this actual SQL read.
function finalSession(sql,h,identity){let rows;try{rows=sql.exec('SELECT u.id,u.epoch,u.role,u.disabled,u.must_change,s.epoch AS session_epoch,s.absolute_until,s.idle_until FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? LIMIT 2',h).toArray();}catch{fail(503,'DELETE_VALIDATED_FREEZE_SESSION_QUERY');}
 if(!Array.isArray(rows)||rows.length>1)fail(503,'DELETE_VALIDATED_FREEZE_SESSION_QUERY');const row=rows[0],now=Date.now();
 if(!row||row.disabled||row.epoch!==row.session_epoch||now>=row.absolute_until||now>=row.idle_until)fail(401,'SESSION_INVALID');if(row.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
 if(row.id!==identity.id||row.epoch!==identity.epoch||row.role!==identity.role)fail(401,'DELETE_VALIDATED_FREEZE_ACTOR_CHANGED');
}
export class GameDeletionValidatedFreeze{
 #storage;#principal;#key;
 constructor({storage,principal,requestKey}){if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('actual same SQLite and trusted Root principal required');this.#storage=storage;this.#principal=principal;this.#key=requestKey;}
 freeze(tokenHash,input){fields(input,['gameId','expectedRowRevision']);const target=Object.freeze({gameId:input.gameId,expectedRowRevision:input.expectedRowRevision});return this.#storage.transactionSync(()=>{
  const first=this.#principal(tokenHash);if(first.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');const identity=Object.freeze({id:first.id,epoch:first.epoch,role:first.role});
  const pinned=h=>{const actor=this.#principal(h);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(actor.id!==identity.id||actor.epoch!==identity.epoch||actor.role!==identity.role)fail(401,'DELETE_VALIDATED_FREEZE_ACTOR_CHANGED');return actor;};
  const gate=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:pinned}),before=gate.observe(tokenHash,target);checks(this.#storage.sql,target.gameId,this.#key);
  const original=new GameDeletionDefinitionFreeze({storage:this.#storage,principal:pinned,requestKey:this.#key}),frozen=original.freeze(tokenHash,target);
  const after=gate.observe(tokenHash,target);if(after.schemaDigest!==before.schemaDigest||frozen.schemaDigest!==before.schemaDigest)fail(503,'DELETE_VALIDATED_FREEZE_SCHEMA_CHANGED');
  // All trusted principal callbacks have returned. These final scans/actual session read have NO callbacks/await.
  const current=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:h=>{finalSession(this.#storage.sql,h,identity);return {...identity,must_change:false};}}).observe(tokenHash,target);
  if(current.schemaDigest!==before.schemaDigest)fail(503,'DELETE_VALIDATED_FREEZE_SCHEMA_CHANGED');
  const {stage,copy}=checks(this.#storage.sql,target.gameId,this.#key);finalSession(this.#storage.sql,tokenHash,identity);
  return Object.freeze({...frozen,quickCheckVerified:true,foreignKeyRowsVerified:true,foreignKeyEdgesVerified:3,uniqueKeysVerified:true,uniqueConstraintsVerified:35,indexProjectionsVerified:true,indexesCompared:35,indexContentIntegrityVerified:false,nameBindingsVerified:true,usedIdBindingVerified:true,privateObjectRowsVerified:true,privateObjectParentLinksVerified:true,draftSnapshotLinksVerified:true,privateObjectLengthBindingsVerified:true,savedJobSnapshotLinksVerified:true,copyOriginLinksVerified:true,copyReceiptLinksVerified:true,draftReceiptLinksVerified:true,copyReservationLinksVerified:true,copyOperationLinksVerified:true,compileJobOperationLinksVerified:true,enqueueRequestDigestsVerified:true,retryRequestDigestsVerified:false,stageHttpCommandLinksVerified:true,stageHttpProofBindingsVerified:stage.unsealedTargets===0,stageHttpUnsealedTargets:stage.unsealedTargets,copyHttpCommandLinksVerified:true,copyHttpProofBindingsVerified:copy.unsealedTargets===0,copyHttpUnsealedTargets:copy.unsealedTargets,selectedKeyNamespaceConflictsAbsent:true,normalRootOriginVerified:false,rowIntegrityVerified:false,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_DECLARED_SQL_AND_SELECTED_KEY_NAMESPACES_FREEZES_ATOMIC_LEGACY_UNKNOWN'});
 });}
}
