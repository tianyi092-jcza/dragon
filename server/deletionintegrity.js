// Internal read-only byte observations, NOT a cleanup capability, media validity or writer drain.
import { createHash } from 'node:crypto';
import { fail } from './security.js';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const digest = v => createHash('sha256').update(v).digest('hex');
const MAX_OBJECTS = 256, MAX_PAGES = 128, MAX_OBJECT_BYTES = 16 * 1024 * 1024, MAX_TOTAL_BYTES = 128 * 1024 * 1024, MAX_CHUNKS = 100000;
export class GameDeletionIntegrity {
  #storage; #sql; #principal; #bucket; #inventory;
  constructor({ storage, principal, bucket, inventory }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof bucket?.list !== 'function' || typeof bucket?.get !== 'function' || typeof inventory?.observe !== 'function') throw new TypeError('actual same SQLite principal, native bucket and trusted inventory required');
    this.#storage=storage; this.#sql=storage.sql; this.#principal=principal; this.#bucket=bucket; this.#inventory=inventory;
  }
  #scope(tokenHash, gameId, prior) {
    return this.#storage.transactionSync(() => {
      const actor=this.#principal(tokenHash); if(actor.must_change)fail(403,'PASSWORD_CHANGE_REQUIRED');
      if(gameId==='wolong-builtin')fail(403,'BUILTIN_PROTECTED'); if(!uuid(gameId))fail(422,'GAME_ID');
      const game=this.#sql.exec('SELECT * FROM content_games WHERE game_id=?',gameId).toArray()[0];
      if(!game||game.owner_id!==actor.id&&actor.role!=='admin')fail(404,'GAME_NOT_FOUND');
      const fence=this.#sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?',gameId).toArray()[0];
      if(!fence)fail(409,'DELETE_FENCE_REQUIRED');
      if(game.listed!==0||fence.owner_id!==game.owner_id||fence.fence_revision!==game.row_revision||!this.#sql.exec('SELECT game_id FROM content_used_ids WHERE game_id=?',gameId).toArray()[0])fail(409,'DELETE_FENCE_CHANGED');
      const now={actorId:actor.id,epoch:actor.epoch,gameDigest:digest(JSON.stringify({game,fence}))};
      if(prior&&(now.actorId!==prior.actorId||now.epoch!==prior.epoch))fail(401,'SESSION_INVALID');
      if(prior&&now.gameDigest!==prior.gameDigest)fail(409,'DELETE_INTEGRITY_CHANGED');
      return now;
    });
  }
  async #list(tokenHash, gameId, scope) {
    const prefix='private/'+gameId+'/', objects=[],seen=new Set(),cursors=new Set();let cursor,total=0;
    for(let page=0;page<MAX_PAGES;page++) {
      const options={prefix,limit:1000};if(cursor)options.cursor=cursor;
      const r=await this.#bucket.list(options);this.#scope(tokenHash,gameId,scope);
      if(!r||!Array.isArray(r.objects)||typeof r.truncated!=='boolean')fail(503,'DELETE_INTEGRITY_LIST');
      for(const o of r.objects) {
        if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.key!=='string'||!o.key.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(o.key.slice(prefix.length))||seen.has(o.key)||!Number.isSafeInteger(o.size)||o.size<1||typeof o.etag!=='string'||o.etag.length<1||o.etag.length>256)fail(503,'DELETE_INTEGRITY_OBJECT');
        if(o.size>MAX_OBJECT_BYTES||total+o.size>MAX_TOTAL_BYTES||objects.length>=MAX_OBJECTS)fail(413,'DELETE_INTEGRITY_BUDGET');
        seen.add(o.key);total+=o.size;objects.push({key:o.key,size:o.size,etag:o.etag});
      }
      if(!r.truncated)return objects.sort((a,b)=>{if(a.key<b.key)return -1;if(a.key>b.key)return 1;return 0;});
      if(typeof r.cursor!=='string'||!r.cursor||r.cursor.length>4096||cursors.has(r.cursor))fail(503,'DELETE_INTEGRITY_CURSOR');
      cursors.add(r.cursor);cursor=r.cursor;
    }
    fail(413,'DELETE_INTEGRITY_BUDGET');
  }
  async #read(tokenHash, gameId, scope, item) {
    const object=await this.#bucket.get(item.key);this.#scope(tokenHash,gameId,scope);
    if(!object)fail(409,'DELETE_INTEGRITY_OBJECT_MISSING');
    if(object.key!==item.key||object.size!==item.size||object.etag!==item.etag)fail(409,'DELETE_INTEGRITY_OBJECT_CHANGED');
    if(typeof object.body?.getReader!=='function')fail(503,'DELETE_INTEGRITY_STREAM');
    const reader=object.body.getReader(), hash=createHash('sha256');let length=0,complete=false;
    try {
      for(let chunks=0;chunks<MAX_CHUNKS;chunks++) {
        const part=await reader.read();this.#scope(tokenHash,gameId,scope);
        if(!part||typeof part.done!=='boolean')fail(503,'DELETE_INTEGRITY_STREAM');
        if(part.done) {
          complete=true;
          if(length!==item.size)fail(503,'DELETE_INTEGRITY_LENGTH');
          if(hash.digest('hex')!==item.key.split('/').at(-1))fail(503,'DELETE_INTEGRITY_SHA');
          return length;
        }
        if(!(part.value instanceof Uint8Array)||part.value.byteLength<1)fail(503,'DELETE_INTEGRITY_STREAM');
        length+=part.value.byteLength;if(length>item.size||length>MAX_OBJECT_BYTES)fail(413,'DELETE_INTEGRITY_BUDGET');
        hash.update(part.value);
      }
      fail(413,'DELETE_INTEGRITY_BUDGET');
    } finally {
      if(!complete) { try { await reader.cancel(); } catch { /* Failed cancellation is not drain or successful verification. */ } }
      reader.releaseLock();
    }
  }
  async verify(tokenHash, gameId) {
    const scope=this.#scope(tokenHash,gameId),before=await this.#inventory.observe(tokenHash,gameId);this.#scope(tokenHash,gameId,scope);
    if(before.missingReferences!==0)fail(409,'DELETE_INTEGRITY_MISSING_REFERENCE');
    const objects=await this.#list(tokenHash,gameId,scope);if(objects.length!==before.privateListed)fail(409,'DELETE_INTEGRITY_CHANGED');
    let total=0;for(const item of objects)total+=await this.#read(tokenHash,gameId,scope,item);
    const finalObjects=await this.#list(tokenHash,gameId,scope);
    if(JSON.stringify(objects)!==JSON.stringify(finalObjects))fail(409,'DELETE_INTEGRITY_OBJECTS_CHANGED');
    const after=await this.#inventory.observe(tokenHash,gameId);this.#scope(tokenHash,gameId,scope);
    if(JSON.stringify(before)!==JSON.stringify(after))fail(409,'DELETE_INTEGRITY_CHANGED');
    // All digests are observations, not authority; no object IDs, keys, bytes or other identities returned.
    return Object.freeze({gameId,rowRevision:after.rowRevision,sqlDigest:after.sqlDigest,inventoryDigest:after.inventoryDigest,byteObservationDigest:digest(JSON.stringify({inventoryDigest:after.inventoryDigest,objects})),verifiedObjects:objects.length,verifiedBytes:total,untrackedPrivateObjects:after.untrackedPrivateObjects,foreignRootReferences:after.foreignRootReferences,privateWritesPending:after.privateWritesPending,privateWritesUncertain:after.privateWritesUncertain,privateWriteCoverage:after.privateWriteCoverage,httpCommandCoverage:after.httpCommandCoverage,deleteAllowed:false,mode:'VERIFIED_CURRENT_PRIVATE_BYTES_ONLY_NOT_DELETE_PLAN'});
  }
}
