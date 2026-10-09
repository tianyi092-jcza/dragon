// Current target's SQL name/used-ID bindings only. Never full reference or deletion authority.
import {fail,fields} from './security.js';
import {GameDeletionSchemaIntegrity} from './deletionschemaintegrity.js';
function size(sql){let value;try{value=sql.databaseSize;}catch{fail(503,'DELETE_NAME_BINDING_QUERY');}if(!Number.isSafeInteger(value)||value<0)fail(503,'DELETE_NAME_BINDING_QUERY');if(value>32*1024*1024)fail(503,'DELETE_NAME_BINDING_BUDGET');}
function rows(sql,query,...values){let result;try{result=sql.exec(query,...values).toArray();}catch{fail(503,'DELETE_NAME_BINDING_QUERY');}if(!Array.isArray(result)||result.length>3)fail(503,'DELETE_NAME_BINDING_QUERY');return result;}
function markers(result,key){for(const row of result)if(!row||Object.keys(row).length!==1||row[key]!==1)fail(503,'DELETE_NAME_BINDING_QUERY');return result.length;}
export function inspectGameNameBindings(sql,gameId){
 if(typeof gameId!=='string')fail(503,'DELETE_NAME_BINDING_QUERY');size(sql);
 const target=rows(sql,'SELECT typeof(owner_id) AS ownerKind,typeof(draft_name) AS draftKind,typeof(formal_name) AS formalKind,CASE WHEN formal_name IS NULL OR formal_name COLLATE BINARY=draft_name COLLATE BINARY THEN 1 ELSE 2 END AS expectedNames FROM content_games WHERE game_id=? LIMIT 2',gameId);
 if(target.length!==1)fail(503,'DELETE_NAME_BINDING_ROWS');if(!target[0]||typeof target[0]!=='object'||Object.keys(target[0]).length!==4)fail(503,'DELETE_NAME_BINDING_QUERY');if(target[0].ownerKind!=='text'||target[0].draftKind!=='text'||!['text','null'].includes(target[0].formalKind))fail(503,'DELETE_NAME_BINDING_ROWS');
 if(![1,2].includes(target[0].expectedNames))fail(503,'DELETE_NAME_BINDING_QUERY');
 const used=markers(rows(sql,'SELECT 1 AS idBinding FROM content_used_ids NOT INDEXED WHERE game_id=? LIMIT 2',gameId),'idBinding');if(used!==1)fail(503,'DELETE_NAME_BINDING_ROWS');
 const count=markers(rows(sql,'SELECT 1 AS nameBinding FROM content_names NOT INDEXED WHERE game_id=? LIMIT 3',gameId),'nameBinding');if(count!==target[0].expectedNames)fail(503,'DELETE_NAME_BINDING_ROWS');
 const unexpected=rows(sql,"SELECT 1 AS badBinding FROM content_names n WHERE n.game_id=? AND (typeof(n.game_id)<>'text' OR typeof(n.owner_id)<>'text' OR typeof(n.name)<>'text' OR NOT EXISTS (SELECT 1 FROM content_games g WHERE g.game_id=? AND n.owner_id COLLATE BINARY=g.owner_id COLLATE BINARY AND (n.name COLLATE BINARY=g.draft_name COLLATE BINARY OR n.name COLLATE BINARY=g.formal_name COLLATE BINARY))) LIMIT 1",gameId,gameId);
 if(markers(unexpected,'badBinding'))fail(503,'DELETE_NAME_BINDING_ROWS');
 const missing=rows(sql,'SELECT 1 AS missingBinding FROM content_games g WHERE g.game_id=? AND (NOT EXISTS (SELECT 1 FROM content_names n WHERE n.game_id=g.game_id AND n.owner_id COLLATE BINARY=g.owner_id COLLATE BINARY AND n.name COLLATE BINARY=g.draft_name COLLATE BINARY) OR (g.formal_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_names n WHERE n.game_id=g.game_id AND n.owner_id COLLATE BINARY=g.owner_id COLLATE BINARY AND n.name COLLATE BINARY=g.formal_name COLLATE BINARY))) LIMIT 1',gameId);
 if(markers(missing,'missingBinding'))fail(503,'DELETE_NAME_BINDING_ROWS');size(sql);
 return Object.freeze({nameBindingsVerified:true,usedIdBindingVerified:true});
}
// Narrow protected Root.principal policy, actual same SQL, no external callback or stored DTO authority.
function session(sql,h,identity){let result;try{result=sql.exec('SELECT u.id,u.epoch,u.role,u.disabled,u.must_change,s.epoch AS session_epoch,s.absolute_until,s.idle_until FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? LIMIT 2',h).toArray();}catch{fail(503,'DELETE_NAME_BINDING_SESSION_QUERY');}if(!Array.isArray(result)||result.length>1)fail(503,'DELETE_NAME_BINDING_SESSION_QUERY');const row=result[0],now=Date.now();if(!row||row.disabled||row.epoch!==row.session_epoch||now>=row.absolute_until||now>=row.idle_until)fail(401,'SESSION_INVALID');if(row.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(row.id!==identity.id||row.epoch!==identity.epoch||row.role!==identity.role)fail(401,'DELETE_NAME_BINDING_ACTOR_CHANGED');}
export class GameDeletionNameBindings{
 #storage;#principal;
 constructor({storage,principal}){if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function')throw new TypeError('actual SQLite and trusted Root principal required');this.#storage=storage;this.#principal=principal;}
 observe(tokenHash,input){fields(input,['gameId','expectedRowRevision']);const target=Object.freeze({gameId:input.gameId,expectedRowRevision:input.expectedRowRevision});return this.#storage.transactionSync(()=>{
  const first=this.#principal(tokenHash);if(first.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');const identity=Object.freeze({id:first.id,epoch:first.epoch,role:first.role}),pinned=h=>{const actor=this.#principal(h);if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(actor.id!==identity.id||actor.epoch!==identity.epoch||actor.role!==identity.role)fail(401,'DELETE_NAME_BINDING_ACTOR_CHANGED');return actor;};
  const gate=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:pinned}),initial=gate.observe(tokenHash,target);inspectGameNameBindings(this.#storage.sql,target.gameId);
  const checked=gate.observe(tokenHash,target);pinned(tokenHash);if(checked.schemaDigest!==initial.schemaDigest)fail(503,'DELETE_NAME_BINDING_SCHEMA_CHANGED');
  const current=new GameDeletionSchemaIntegrity({storage:this.#storage,principal:h=>{session(this.#storage.sql,h,identity);return {...identity,must_change:false};}}).observe(tokenHash,target);if(current.schemaDigest!==initial.schemaDigest)fail(503,'DELETE_NAME_BINDING_SCHEMA_CHANGED');
  const bindings=inspectGameNameBindings(this.#storage.sql,target.gameId);session(this.#storage.sql,tokenHash,identity);
  return Object.freeze({...current,...bindings,rowIntegrityVerified:false,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_GAME_NAME_ID_BINDINGS_ONLY_LEGACY_UNKNOWN'});
 });}
}
