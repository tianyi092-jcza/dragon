// Trusted internal Root PUT journal. Not authority, content proof, all-writer drain or delete permission.
import { fail } from './security.js';
const keyPattern = /^private\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{64})$/;
export class PrivateWriteJournal {
  #storage; #sql; #bucket; #instance = crypto.randomUUID(); #active = new Map();
  constructor({ storage, bucket }) {
    if (!storage?.sql || typeof bucket?.put !== 'function' || typeof bucket?.get !== 'function') throw new TypeError('same SQLite and native bucket required');
    this.#storage = storage; this.#sql = storage.sql; this.#bucket = bucket;
    storage.transactionSync(() => this.#sql.exec("CREATE TABLE IF NOT EXISTS content_private_writes (operation_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, sha256 TEXT NOT NULL, instance_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','settled','uncertain')), started_at TEXT NOT NULL, settled_at TEXT)"));
  }
  #begin(key) {
    if (typeof key !== 'string') fail(422, 'PRIVATE_WRITE_KEY');
    const match = keyPattern.exec(key); if (!match) fail(422, 'PRIVATE_WRITE_KEY');
    return this.#storage.transactionSync(() => {
      if (this.#sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?', match[1]).toArray().length) fail(409, 'GAME_DELETING');
      const id = crypto.randomUUID();
      this.#sql.exec("INSERT INTO content_private_writes VALUES(?,?,?,?,'pending',?,NULL)", id, match[1], match[2], this.#instance, new Date().toISOString());
      return Object.freeze({ id, gameId: match[1], sha256: match[2] });
    });
  }
  #finish(captured, state) {
    this.#storage.transactionSync(() => {
      const row = this.#sql.exec('SELECT * FROM content_private_writes WHERE operation_id=?', captured.id).toArray()[0];
      if (!row || row.game_id !== captured.gameId || row.sha256 !== captured.sha256 || row.instance_id !== this.#instance || row.state !== 'pending') fail(503, 'PRIVATE_WRITE_JOURNAL_CHANGED');
      this.#sql.exec('UPDATE content_private_writes SET state=?,settled_at=? WHERE operation_id=?', state, new Date().toISOString(), captured.id);
    });
  }
  async put(key, ...args) {
    // Root's write port is private-only. Installed staging uses a separate native
    // port; unsupported namespaces must not bypass the durable fence/journal.
    const id = this.#begin(key), live = { captured:id, waiters:new Set(), acknowledged:false }; this.#active.set(id.id, live);
    try {
      let result;
      try { result = await this.#bucket.put(key, ...args); }
      catch (error) { this.#finish(id, 'uncertain'); throw error; }
      if (result !== null && (!result || typeof result !== 'object')) { this.#finish(id, 'uncertain'); fail(503, 'PRIVATE_WRITE_RESULT'); }
      // If this SQL acknowledgement fails, pending survives. No TTL, restart repair, cancellation or success claim.
      this.#finish(id, 'settled'); live.acknowledged=true; return result;
    } finally {
      this.#active.delete(id.id); for (const done of live.waiters) done(id.id);
    }
  }
  assertStorage(storage) { if (storage !== this.#storage) throw new TypeError('actual same SQLite storage required'); }
  #current(gameId) {
    if (typeof gameId !== 'string' || !keyPattern.test('private/'+gameId+'/'+'0'.repeat(64))) fail(422,'PRIVATE_WRITE_WAIT_INPUT');
    if (!this.#sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?',gameId).toArray().length) fail(409,'DELETE_FENCE_REQUIRED');
    const rows=this.#sql.exec('SELECT * FROM content_private_writes WHERE game_id=? ORDER BY operation_id LIMIT 10001',gameId).toArray();
    if(rows.length>10000)fail(413,'PRIVATE_WRITE_WAIT_BUDGET');const pending=new Map();
    for(const row of rows){
      if(typeof row.operation_id!=='string'||!keyPattern.test('private/'+row.operation_id+'/'+'0'.repeat(64))||!keyPattern.test('private/'+row.game_id+'/'+row.sha256)||typeof row.instance_id!=='string'||!keyPattern.test('private/'+row.instance_id+'/'+'0'.repeat(64))||!['pending','settled','uncertain'].includes(row.state))fail(503,'PRIVATE_WRITE_WAIT_JOURNAL_CHANGED');
      if(row.state==='uncertain')fail(503,'PRIVATE_WRITE_WAIT_UNKNOWN');
      if(row.state==='pending'){
        const live=this.#active.get(row.operation_id);
        if(row.instance_id!==this.#instance||!live)fail(503,'PRIVATE_WRITE_WAIT_UNTRACKED');
        if(live.captured.gameId!==gameId||live.captured.sha256!==row.sha256)fail(503,'PRIVATE_WRITE_WAIT_JOURNAL_CHANGED');pending.set(row.operation_id,live);
      }
    }
    for(const[id,live]of this.#active)if(live.captured.gameId===gameId&&!pending.has(id))fail(503,'PRIVATE_WRITE_WAIT_JOURNAL_CHANGED');
    return {pending,rows:new Map(rows.map(row=>[row.operation_id,row]))};
  }
  async waitCurrentPuts(gameId,{timeoutMs,assertCurrent}) {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||typeof assertCurrent!=='function')fail(422,'PRIVATE_WRITE_WAIT_INPUT');
    assertCurrent();const {pending}=this.#current(gameId),remaining=new Set(pending.keys());
    for(const live of pending.values())if(live.waiters.size>=128)fail(429,'PRIVATE_WRITE_WAIT_BUSY');
    if(remaining.size===0){assertCurrent();return 0;}
    let complete,timer;const notification=new Promise(done=>{complete=done;});
    const finished=id=>{remaining.delete(id);if(remaining.size===0)complete(false);};
    for(const live of pending.values())live.waiters.add(finished);
    timer=setTimeout(()=>complete(true),timeoutMs);
    try {
      const timedOut=await notification;assertCurrent();
      if(timedOut)fail(504,'PRIVATE_WRITE_WAIT_TIMEOUT');
      const after=this.#current(gameId);if(after.pending.size!==0)fail(503,'PRIVATE_WRITE_WAIT_JOURNAL_CHANGED');
      for(const[id,live]of pending){
        if(!live.acknowledged)fail(503,'PRIVATE_WRITE_WAIT_UNKNOWN');
        const row=after.rows.get(id);
        if(!row||row.game_id!==live.captured.gameId||row.sha256!==live.captured.sha256||row.instance_id!==this.#instance||row.state!=='settled')fail(503,'PRIVATE_WRITE_WAIT_JOURNAL_CHANGED');
      }
      return pending.size;
    } finally {clearTimeout(timer);for(const live of pending.values())live.waiters.delete(finished);}
  }
  // Internal diagnostics only: slots are current-instance subscriptions, NOT persisted work or drain.
  currentWaitSlots(gameId) {let n=0;for(const live of this.#active.values())if(live.captured.gameId===gameId)n+=live.waiters.size;return n;}
  get(...args) { return this.#bucket.get(...args); }
  list(...args) { return this.#bucket.list(...args); }
  delete() { fail(503, 'DELETE_FENCE_NOT_READY'); }
}
