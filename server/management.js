// Web Q20/product §5.1: administrator unlist locks; clear stays unlisted.
// Listing receipts wrap a trusted synchronous Root callback; no publish/content authority.
import {fail, fields} from './security.js';
import {decodeManagementReceipt, encodeManagementReceipt} from './managementreceipt.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const revision=v=>typeof v==='string'&&v.length<=8192&&/^[1-9][0-9]*$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(v);
const methods=Object.freeze({'unlist':'admin-unlist','clear-restriction':'admin-clear-restriction'});
// B3 上架審核: rejection is its own receipt method (no distribution, no registry).
const rejectMethod='admin-reject';
function synchronous(callback) { if (callback !== undefined && (typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction')) throw new TypeError('synchronous trusted distribution callback required'); }
// Exact legacy listing-response shape; receipts are snapshots, not current state.
function listingSummary(row) {
 return { gameId: row.game_id, ownerId: row.owner_id, metadata: { name: row.draft_name, introduction: row.draft_introduction }, draftRevision: row.draft_revision, rowRevision: row.row_revision, currentReleaseId: row.current_release_id, nextOrdinal: row.next_ordinal, listed: Boolean(row.listed), restricted: Boolean(row.restricted), createdAt: row.created_at, modifiedAt: row.modified_at };
}
function listingResult(value, id) {
 const keys = 'createdAt,currentReleaseId,draftRevision,gameId,listed,metadata,modifiedAt,nextOrdinal,ownerId,restricted,rowRevision';
 if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys || value.gameId !== id || value.listed !== true || value.restricted !== false || typeof value.ownerId !== 'string' || !value.ownerId || !uuid(value.currentReleaseId) || !revision(value.rowRevision) || !revision(value.draftRevision) || typeof value.nextOrdinal !== 'string' || !/^1\.(0|[1-9][0-9]{0,30})$/.test(value.nextOrdinal) || !value.metadata || Array.isArray(value.metadata) || Object.keys(value.metadata).sort().join(',') !== 'introduction,name' || !['name','introduction'].every(k => typeof value.metadata[k] === 'string') || !['createdAt','modifiedAt'].every(k => typeof value[k] === 'string' && Number.isFinite(Date.parse(value[k])) && new Date(value[k]).toISOString() === value[k])) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
 return Object.freeze({ ...value, metadata: Object.freeze({ ...value.metadata }) });
}
export class GameManagement {
 #storage;#sql;#principal;#guard;
 constructor({storage,principal,operationGuard}){if(!storage?.sql||typeof storage.transactionSync!=='function'||typeof principal!=='function'||typeof operationGuard!=='function')throw new TypeError('same SQLite and trusted Root principal/reservation guard required');this.#storage=storage;this.#sql=storage.sql;this.#principal=principal;this.#guard=operationGuard;}
 #one(q,...v){return this.#sql.exec(q,...v).toArray()[0];}
 #actor(h){const a=this.#principal(h);if(a.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');if(a.role!=='admin')fail(403,'ADMIN_REQUIRED');return Object.freeze({id:a.id,epoch:a.epoch,role:a.role});}
 #session(h,a){const r=this.#one('SELECT u.id,u.epoch,u.role,u.disabled,u.must_change,s.epoch AS session_epoch,s.absolute_until,s.idle_until FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=?',h),now=Date.now();if(!r||r.disabled!==0||r.must_change!==0||!Number.isSafeInteger(r.absolute_until)||!Number.isSafeInteger(r.idle_until)||!Number.isSafeInteger(r.epoch)||!Number.isSafeInteger(r.session_epoch)||r.id!==a.id||r.epoch!==a.epoch||r.session_epoch!==a.epoch||r.role!=='admin'||now>=r.absolute_until||now>=r.idle_until)fail(401,'SESSION_INVALID');}
 #target(id){if(id==='wolong-builtin')fail(403,'BUILTIN_PROTECTED');if(!uuid(id))fail(422,'MANAGEMENT_GAME_ID');const r=this.#one('SELECT game_id,row_revision,listed,restricted FROM content_games WHERE game_id=? COLLATE BINARY',id);if(!r)fail(404,'GAME_NOT_FOUND');if(this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=? COLLATE BINARY',id))fail(409,'GAME_DELETING');if(r.game_id!==id||!revision(r.row_revision)||![0,1].includes(r.listed)||![0,1].includes(r.restricted)||!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=? COLLATE BINARY',id))fail(503,'MANAGEMENT_ROW_CORRUPT');return r;}
 // Root's legacy guard skips optional tables without configured copies. Check retained known families too.
 #keySpace(actor,operationKey){this.#guard(actor,operationKey);for(const[table,column]of [['operations','actor'],['source_operations','actor'],['copy_http_commands','actor'],['draft_requests','actor'],['compile_operations','actor_id'],['stage_http_commands','actor'],['content_deletion_operations','actor']]){if(this.#one("SELECT name FROM sqlite_master WHERE type='table' AND name=?",table)&&this.#one('SELECT op_key FROM '+table+' WHERE '+column+'=? COLLATE BINARY AND op_key=? COLLATE BINARY',actor,operationKey))fail(409,'IDEMPOTENCY_CONFLICT');}}
 #receipt(a,id,row){if(row.auth_epoch!==a.epoch)fail(409,'OPERATION_REVOKED');if(row.actor!==a.id||row.target!==id||!Object.values(methods).includes(row.method)||typeof row.result_json!=='string'||Buffer.byteLength(row.result_json)>16384)fail(503,'MANAGEMENT_RECEIPT_CORRUPT');const reserved=this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,row.op_key);if(!reserved||reserved.method!==row.method||reserved.target!==id||reserved.request_digest!==row.request_digest||reserved.auth_epoch!==row.auth_epoch)fail(503,'MANAGEMENT_RECEIPT_CORRUPT');const value=decodeManagementReceipt(row.result_json).result;if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='action,eventAt,gameId,listed,restricted,rowRevision'||value.gameId!==id||typeof value.action!=='string'||!Object.hasOwn(methods,value.action)||methods[value.action]!==row.method||value.listed!==false||typeof value.restricted!=='boolean'||!revision(value.rowRevision)||typeof value.eventAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.eventAt)||(value.action==='unlist'&&!value.restricted)||(value.action==='clear-restriction'&&value.restricted))fail(503,'MANAGEMENT_RECEIPT_CORRUPT');return Object.freeze(value);}
 apply(h,operation,input,distribution){synchronous(distribution);fields(input,['gameId','action','expectedRowRevision']);const v=Object.freeze({gameId:input.gameId,action:input.action,expectedRowRevision:input.expectedRowRevision}),op=Object.freeze({actor:operation?.actor,key:operation?.key,digest:operation?.digest,epoch:operation?.epoch});if(typeof v.action!=='string'||!Object.hasOwn(methods,v.action)||!revision(v.expectedRowRevision)||!key(op.key)||typeof op.digest!=='string'||!/^[a-f0-9]{64}$/.test(op.digest))fail(422,'MANAGEMENT_INPUT');return this.#storage.transactionSync(()=>{
  const a=this.#actor(h);if(a.id!==op.actor||a.epoch!==op.epoch)fail(401,'SESSION_INVALID');this.#keySpace(a.id,op.key);this.#session(h,a);const row=this.#target(v.gameId),method=methods[v.action],old=this.#one('SELECT * FROM content_operations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key),reservation=this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key);
  for(const prior of [old,reservation]){if(prior&&(prior.method!==method||prior.target!==v.gameId||prior.request_digest!==op.digest))fail(409,'IDEMPOTENCY_CONFLICT');if(prior&&prior.auth_epoch!==a.epoch)fail(409,'OPERATION_REVOKED');}if(old){const result=this.#receipt(a,v.gameId,old);this.#session(h,a);return result;}if(reservation)fail(503,'MANAGEMENT_RECEIPT_CORRUPT');if(row.row_revision!==v.expectedRowRevision)fail(409,'GAME_CHANGED');
  const restricted=Number(v.action==='unlist'),changed=row.listed!==0||row.restricted!==restricted,next=changed?String(BigInt(row.row_revision)+1n):row.row_revision,eventAt=new Date().toISOString();if(next.length>8192)fail(503,'MANAGEMENT_REVISION_BUDGET');if(changed){const updated=this.#one('UPDATE content_games SET listed=0,restricted=?,row_revision=? WHERE game_id=? COLLATE BINARY AND row_revision=? COLLATE BINARY RETURNING game_id',restricted,next,v.gameId,row.row_revision);if(!updated)fail(409,'GAME_CHANGED');}
  const result={gameId:v.gameId,action:v.action,listed:false,restricted:Boolean(restricted),rowRevision:next,eventAt};this.#sql.exec('INSERT INTO content_reservations VALUES(?,?,?,?,?,?)',a.id,op.key,method,v.gameId,op.digest,a.epoch);this.#sql.exec('INSERT INTO content_operations VALUES(?,?,?,?,?,?,?,?)',a.id,op.key,method,v.gameId,op.digest,a.epoch,this.#encode(result,distribution,changed,'restriction'),eventAt);this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),a.id,method,v.gameId,row.row_revision,next,eventAt);
  // D-下架/限制变更同时推 registry revision（公告读时按 listed 过滤；
  // DDL 主人在 server/announcements.js，worker 启动已建行）。
  if(changed){this.#sql.exec('UPDATE content_registry SET revision=revision+1 WHERE id=1');}
  this.#keySpace(a.id,op.key);const current=this.#target(v.gameId);if(current.row_revision!==next||current.listed!==0||current.restricted!==restricted)fail(409,'GAME_CHANGED');this.#session(h,a);return Object.freeze(result);
 });}
 // B3 上架審核 (Web product decision 2026-11): 拒絕 returns the submitted
 // version to 待上架 and marks it 已駁回. The mark is exactly one audit row whose
 // before_revision is the rejected release ordinal (see
 // GameMetadataStore#submissionState); nothing public changes, so there is no
 // distribution event and no registry bump. Same CAS/epoch/idempotency rules
 // as unlisting; a repeat with the same key replays and a repeat with a new key
 // fails GAME_CHANGED because row_revision advanced.
 reject(h,operation,input) {
  fields(input,['gameId','expectedRowRevision']);
  const id=input.gameId, expected=input.expectedRowRevision;
  const op=Object.freeze({actor:operation?.actor,key:operation?.key,digest:operation?.digest,epoch:operation?.epoch});
  if (!revision(expected) || !key(op.key) || typeof op.digest!=='string' || !/^[a-f0-9]{64}$/.test(op.digest)) fail(422,'MANAGEMENT_INPUT');
  return this.#storage.transactionSync(()=>{
   const a=this.#actor(h);
   if (a.id!==op.actor || a.epoch!==op.epoch) fail(401,'SESSION_INVALID');
   this.#keySpace(a.id,op.key); this.#session(h,a);
   const row=this.#target(id);
   const old=this.#one('SELECT * FROM content_operations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key);
   const reservation=this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key);
   for (const prior of [old,reservation]) {
    if (prior && (prior.method!==rejectMethod || prior.target!==id || prior.request_digest!==op.digest)) fail(409,'IDEMPOTENCY_CONFLICT');
    if (prior && prior.auth_epoch!==a.epoch) fail(409,'OPERATION_REVOKED');
   }
   if (old) { const result=this.#rejectReceipt(a,id,old); this.#session(h,a); return result; }
   if (reservation) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
   // #target already refused builtin/fence/unknown rows.
   const game=this.#one('SELECT current_release_id FROM content_games WHERE game_id=? COLLATE BINARY',id);
   const release=game?.current_release_id===null?undefined:this.#one('SELECT ordinal FROM content_releases WHERE game_id=? AND release_id=?',id,game?.current_release_id);
   if (!release || typeof release.ordinal!=='string' || !/^1\.(0|[1-9][0-9]{0,30})$/.test(release.ordinal)) fail(409,'REVIEW_NOT_SUBMITTED');
   if (row.listed!==0) fail(409,'REVIEW_LISTED');
   if (row.row_revision!==expected) fail(409,'GAME_CHANGED');
   const next=String(BigInt(row.row_revision)+1n), time=new Date().toISOString();
   if (next.length>8192) fail(503,'MANAGEMENT_REVISION_BUDGET');
   const result={gameId:id,action:'reject',ordinal:release.ordinal,rowRevision:next,rejectedAt:time};
   this.#sql.exec('INSERT INTO content_reservations VALUES(?,?,?,?,?,?)',a.id,op.key,rejectMethod,id,op.digest,a.epoch);
   const updated=this.#one('UPDATE content_games SET row_revision=? WHERE game_id=? COLLATE BINARY AND row_revision=? COLLATE BINARY AND listed=0 RETURNING game_id',next,id,row.row_revision);
   if (!updated) fail(409,'GAME_CHANGED');
   this.#sql.exec('INSERT INTO content_operations VALUES(?,?,?,?,?,?,?,?)',a.id,op.key,rejectMethod,id,op.digest,a.epoch,JSON.stringify(result),time);
   this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),a.id,rejectMethod,id,release.ordinal,next,time);
   this.#keySpace(a.id,op.key); const current=this.#target(id);
   if (current.row_revision!==next || current.listed!==0) fail(409,'GAME_CHANGED');
   this.#session(h,a); return Object.freeze(result);
  });
 }
 #rejectReceipt(a,id,row) {
  if (row.auth_epoch!==a.epoch) fail(409,'OPERATION_REVOKED');
  if (row.actor!==a.id || row.target!==id || row.method!==rejectMethod || typeof row.result_json!=='string' || Buffer.byteLength(row.result_json)>16384) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  const reserved=this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,row.op_key);
  if (!reserved || reserved.method!==row.method || reserved.target!==id || reserved.request_digest!==row.request_digest || reserved.auth_epoch!==row.auth_epoch) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  let value; try { value=JSON.parse(row.result_json); } catch { fail(503,'MANAGEMENT_RECEIPT_CORRUPT'); }
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',')!=='action,gameId,ordinal,rejectedAt,rowRevision' || value.gameId!==id || value.action!=='reject' || typeof value.ordinal!=='string' || !/^1\.(0|[1-9][0-9]{0,30})$/.test(value.ordinal) || !revision(value.rowRevision) || typeof value.rejectedAt!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.rejectedAt)) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  return Object.freeze(value);
 }
 #listingReceipt(a,id,row) {
  if (row.auth_epoch !== a.epoch) fail(409,'OPERATION_REVOKED');
  if (row.actor !== a.id || row.target !== id || row.method !== 'admin-list' || typeof row.result_json !== 'string' || Buffer.byteLength(row.result_json) > 65536) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  const reserved = this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,row.op_key);
  if (!reserved || reserved.method !== row.method || reserved.target !== id || reserved.request_digest !== row.request_digest || reserved.auth_epoch !== row.auth_epoch) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  const decoded = decodeManagementReceipt(row.result_json);
  const result = listingResult(decoded.result,id);
  if (encodeManagementReceipt(result,decoded.distribution) !== row.result_json) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  return result;
 }
 // No await may split listing + announcement + permanent reservation/result.
 // The callback is server code, never supplied by a request; replay skips it.
 list(h,operation,input,commit,distribution) {
  synchronous(distribution);
  fields(input,['gameId','expectedRowRevision']);
  const id=input.gameId, expected=input.expectedRowRevision;
  const op=Object.freeze({actor:operation?.actor,key:operation?.key,digest:operation?.digest,epoch:operation?.epoch});
  if (!revision(expected) || !key(op.key) || typeof op.digest !== 'string' || !/^[a-f0-9]{64}$/.test(op.digest)) fail(422,'MANAGEMENT_INPUT');
  if (typeof commit !== 'function' || commit.constructor?.name === 'AsyncFunction') throw new TypeError('synchronous trusted listing commit required');
  return this.#storage.transactionSync(() => {
   const a=this.#actor(h);
   if (a.id !== op.actor || a.epoch !== op.epoch) fail(401,'SESSION_INVALID');
   this.#keySpace(a.id,op.key); this.#session(h,a);
   const before=this.#target(id), method='admin-list';
   const old=this.#one('SELECT * FROM content_operations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key);
   const reservation=this.#one('SELECT * FROM content_reservations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,op.key);
   for (const prior of [old,reservation]) {
    if (prior && (prior.method !== method || prior.target !== id || prior.request_digest !== op.digest)) fail(409,'IDEMPOTENCY_CONFLICT');
    if (prior && prior.auth_epoch !== a.epoch) fail(409,'OPERATION_REVOKED');
   }
   if (old) { const result=this.#listingReceipt(a,id,old); this.#session(h,a); return result; }
   if (reservation) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
   if (before.restricted !== 0) fail(409,'LISTING_RESTRICTED');
   if (before.row_revision !== expected) fail(409,'GAME_CHANGED');
   this.#sql.exec('INSERT INTO content_reservations VALUES(?,?,?,?,?,?)',a.id,op.key,method,id,op.digest,a.epoch);
   const value=commit();
   if (!value || typeof value.then === 'function') throw new TypeError('synchronous listing result required');
   const result=listingResult(value,id), text=JSON.stringify(result);
   const receiptText=this.#encode(result,distribution,before.listed !== 1,'listing');
   const current=this.#target(id), row=this.#one('SELECT * FROM content_games WHERE game_id=? COLLATE BINARY',id);
   const next=before.listed === 1 ? before.row_revision : String(BigInt(before.row_revision)+1n);
   if (current.row_revision !== next || current.listed !== 1 || current.restricted !== 0 || text !== JSON.stringify(listingSummary(row)) || Buffer.byteLength(text) > 65536) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
   const time=new Date().toISOString();
   this.#sql.exec('INSERT INTO content_operations VALUES(?,?,?,?,?,?,?,?)',a.id,op.key,method,id,op.digest,a.epoch,receiptText,time);
   this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),a.id,method,id,before.row_revision,next,time);
   this.#keySpace(a.id,op.key); this.#session(h,a);
   return result;
  });
 }
 #encode(result,callback,changed,kind) {
  if (callback === undefined) return encodeManagementReceipt(result,undefined);
  const record=callback(changed);
  if (record && typeof record.then === 'function') throw new TypeError('synchronous distribution result required');
  if (record === undefined) fail(503,'MANAGEMENT_DISTRIBUTION_CORRUPT');
  let reference=null;
  if (changed) {
   if (!record || record.deduped !== false || record.gameId !== result.gameId || record.kind !== kind || !uuid(record.operationId) || !Number.isSafeInteger(record.generation) || record.generation < 1) fail(503,'MANAGEMENT_DISTRIBUTION_CORRUPT');
   reference={operationId:record.operationId,generation:record.generation};
   this.#distributionRow(result.gameId,kind,reference);
  } else if (record !== null) fail(503,'MANAGEMENT_DISTRIBUTION_CORRUPT');
  const text=encodeManagementReceipt(result,reference);
  if (Buffer.byteLength(text) > (kind === 'listing' ? 65536 : 16384)) fail(503,'MANAGEMENT_RECEIPT_CORRUPT');
  return text;
 }
 #distributionRow(id,kind,reference) {
  const row=this.#one('SELECT game_id,kind,generation FROM content_distribution_events WHERE operation_id=?',reference.operationId);
  if (!row || row.game_id !== id || row.kind !== kind || row.generation !== reference.generation) fail(503,'MANAGEMENT_DISTRIBUTION_CORRUPT');
 }
 queryDistribution(h,id,operationKey) {
  return this.#storage.transactionSync(() => {
   const result=this.query(h,id,operationKey), a=this.#actor(h);
   this.#keySpace(a.id,operationKey);
   const row=this.#one('SELECT * FROM content_operations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,operationKey);
   const decoded=decodeManagementReceipt(row.result_json);
   if (decoded.distribution === undefined) fail(503,'DISTRIBUTION_STATUS_UNAVAILABLE');
   if (decoded.distribution !== null) this.#distributionRow(id,row.method === 'admin-list' ? 'listing' : 'restriction',decoded.distribution);
   this.#session(h,a);
   return Object.freeze({result,distribution:decoded.distribution});
  });
 }
 query(h,id,operationKey){if(!key(operationKey))fail(422,'IDEMPOTENCY_KEY');return this.#storage.transactionSync(()=>{const a=this.#actor(h);this.#target(id);const row=this.#one('SELECT * FROM content_operations WHERE actor=? COLLATE BINARY AND op_key=? COLLATE BINARY',a.id,operationKey);if(!row||row.target!==id||!(row.method==='admin-list'||Object.values(methods).includes(row.method)))fail(404,'MANAGEMENT_OPERATION_NOT_FOUND');const result=row.method==='admin-list'?this.#listingReceipt(a,id,row):this.#receipt(a,id,row);this.#session(h,a);return result;});}
}
