// Internal R2 adapter, not a public upload route or GameSource/compile certificate.
import { createHash } from 'node:crypto';
import { fail } from './security.js';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export class ImmutableBlobStore {
  #bucket; #authority; #maxBytes; #storage; #reads = new Set();
  constructor({ bucket, authority, storage, maxBytes = 16 * 1024 * 1024 }) {
    if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function' || typeof authority !== 'function') throw new TypeError('actual R2 and trusted authority required');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) fail(503, 'INVALID_BLOB_POLICY');
    if (storage !== undefined && (!storage?.sql || typeof storage.transactionSync !== 'function')) throw new TypeError('actual SQLite storage required');
    this.#bucket = bucket; this.#authority = authority; this.#maxBytes = maxBytes; this.#storage = storage;
  }
  #scope(tokenHash, context) {
    if (context.gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(context.gameId)) fail(422, 'BLOB_GAME_ID');
    const actor = this.#authority(tokenHash, context);
    if (!actor || !uuid(actor.ownerId) || !Number.isSafeInteger(actor.epoch) || actor.epoch < 1) fail(500, 'BLOB_AUTHORITY');
    return actor;
  }
  #recheck(tokenHash, context, prior) {
    const current = this.#scope(tokenHash, context);
    if (current.ownerId !== prior.ownerId || current.epoch !== prior.epoch) fail(401, 'SESSION_INVALID');
  }
  #descriptor(context) {
    if (!digest(context.sha256) || !Number.isSafeInteger(context.byteLength) || context.byteLength < 0) fail(422, 'BLOB_DESCRIPTOR');
    if (context.byteLength > this.#maxBytes) fail(413, 'BLOB_TOO_LARGE');
    return `private/${context.gameId}/${context.sha256}`;
  }
  async putImmutable(tokenHash, { gameId, allocation, bytes }) {
    const context = { gameId, allocation }, actor = this.#scope(tokenHash, context);
    if (!ArrayBuffer.isView(bytes) || !(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer)) fail(422, 'BLOB_BYTES');
    if (bytes.byteLength > this.#maxBytes) fail(413, 'BLOB_TOO_LARGE');
    // Capture before the first await; callers cannot mutate the in-flight value.
    const captured = new Uint8Array(bytes), sha256 = createHash('sha256').update(captured).digest('hex');
    const descriptor = { gameId, allocation, sha256, byteLength: captured.length }, key = this.#descriptor(descriptor);
    const result = await this.#bucket.put(key, captured, { onlyIf: new Headers({ 'If-None-Match': '*' }), sha256, httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'no-store' } });
    this.#recheck(tokenHash, context, actor);
    // Both newly written and conflicting-existing values are read and hashed. Never
    // accept an etag/customMetadata/checksum or a null conditional result as proof.
    const verified = await this.read(tokenHash, descriptor);
    this.#recheck(tokenHash, context, actor);
    return Object.freeze({ gameId, key: verified.key, sha256, byteLength: captured.length, created: result !== null });
  }
  async read(tokenHash, context) {
    const actor = this.#scope(tokenHash, context), key = this.#descriptor(context);
    // Register only the actual authorized invocation, before native GET. A failed
    // invocation also returns; notification never certifies its body/provider drain.
    const live = { gameId:key.slice(8,44), waiters:new Set() }; this.#reads.add(live);
    try { const result = await this.#performRead(tokenHash, context, actor, key); this.#recheck(tokenHash, context, actor); return result; }
    finally { this.#reads.delete(live); for (const done of live.waiters) done(live); }
  }
  async #performRead(tokenHash, context, actor, key) {
    const object = await this.#bucket.get(key);
    try { this.#recheck(tokenHash, context, actor); }
    catch (error) {
      try { await object?.body?.cancel(); } catch { /* Preserve the authority failure. */ }
      throw error;
    }
    if (!object) fail(404, 'BLOB_NOT_FOUND');
    if (!object.body || object.size !== context.byteLength) {
      try { await object.body?.cancel(); } catch { /* Preserve the integrity failure. */ }
      fail(503, 'BLOB_CORRUPT');
    }
    const reader = object.body.getReader(), parts = [], hash = createHash('sha256'); let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        this.#recheck(tokenHash, context, actor);
        if (done) break;
        if (!(value instanceof Uint8Array)) fail(503, 'BLOB_CORRUPT');
        length += value.length;
        if (length > this.#maxBytes || length > context.byteLength) fail(503, 'BLOB_CORRUPT');
        hash.update(value); parts.push(value);
      }
      if (length !== context.byteLength || hash.digest('hex') !== context.sha256) fail(503, 'BLOB_CORRUPT');
    } catch (error) {
      try { await reader.cancel(); } catch { /* Preserve the primary failure, not a cleanup failure. */ }
      throw error;
    } finally { reader.releaseLock(); }
    this.#recheck(tokenHash, context, actor);
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return { gameId: context.gameId, key, sha256: context.sha256, byteLength: length, bytes };
  }
  assertReadStorage(storage) { if (!this.#storage || storage !== this.#storage) throw new TypeError('actual same SQLite storage required'); }
  #currentReadCalls(gameId) {
    if (!uuid(gameId)) fail(422,'PRIVATE_READ_WAIT_INPUT');
    if (!this.#storage?.sql) throw new TypeError('actual SQLite read store required');
    if (!this.#storage.sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?',gameId).toArray().length) fail(409,'DELETE_FENCE_REQUIRED');
    const current=new Set();for(const live of this.#reads)if(live.gameId===gameId)current.add(live);
    if(current.size>10000)fail(413,'PRIVATE_READ_WAIT_BUDGET');return current;
  }
  async waitCurrentReadCalls(gameId,{timeoutMs,assertCurrent}) {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||typeof assertCurrent!=='function')fail(422,'PRIVATE_READ_WAIT_INPUT');
    assertCurrent();const captured=this.#currentReadCalls(gameId),remaining=new Set(captured);
    for(const live of captured)if(live.waiters.size>=128)fail(429,'PRIVATE_READ_WAIT_BUSY');
    if(remaining.size===0){assertCurrent();return 0;}
    let complete,timer;const notification=new Promise(done=>{complete=done;});
    const finished=live=>{remaining.delete(live);if(remaining.size===0)complete(false);};
    for(const live of captured)live.waiters.add(finished);
    timer=setTimeout(()=>complete(true),timeoutMs);
    try {
      const timedOut=await notification;assertCurrent();
      if(timedOut)fail(504,'PRIVATE_READ_WAIT_TIMEOUT');
      if(this.#currentReadCalls(gameId).size!==0)fail(503,'PRIVATE_READ_WAIT_CHANGED');
      return captured.size;
    } finally {clearTimeout(timer);for(const live of captured)live.waiters.delete(finished);}
  }
  // Internal diagnostics only; returned calls, cancellation and zero slots are not native drain.
  currentReadWaitState(gameId) {let calls=0,slots=0;for(const live of this.#reads)if(live.gameId===gameId){calls++;slots+=live.waiters.size;}return {calls,slots};}
  async delete(tokenHash, context) {
    this.#scope(tokenHash, context); this.#descriptor(context);
    // Ownership does NOT prove unreferenced data or a permanent deletion fence.
    // Actual reference/deletion-plan authority must be implemented before this opens.
    fail(503, 'DELETE_FENCE_NOT_READY');
  }
}
