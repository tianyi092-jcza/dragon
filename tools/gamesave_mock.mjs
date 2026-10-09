// Owned serialized-IDB protocol fixture; no native IndexedDB/profile access.
// Readonly transactions are conservatively serialized too; real Chromium is checked separately.
export function gameSaveMemoryIDB(initial = []) {
  let records = new Map(structuredClone(initial)), control = {}, running = false;
  const queue = [], stats = { opens: [], reads: [], writes: [], deletes: [], closed: 0, held: 0 }, releases = [];
  function pump() { if (running || !queue.length) return; running = true; queue.shift()(); }
  return {
    stats, records: () => structuredClone([...records]), configure(value) { control = { ...value }; },
    release() { const release = releases.shift(); if (!release) throw new Error("no owned held commit"); release(); },
    indexedDB: { open(name, version) {
      stats.opens.push([name, version]); const opening = {};
      queueMicrotask(() => {
        opening.result = { close() { stats.closed++; }, transaction(storeName, mode) {
          if (storeName !== "saves") throw new Error("unexpected owned store");
          const fault = { ...control }, writable = mode === "readwrite"; let active = false, ended = false, commitHeld = false, draft, pending = 0, number = 0;
          const backlog = [];
          /** @type {{abort(): void, onabort?: () => void, onerror?: () => void, oncomplete?: () => void, error?: Error}} */
          const tx = { abort() { finish("abort"); } };
          function finish(outcome) {
            if (ended) return; ended = true;
            if (outcome === "complete" && writable) records = draft;
            tx["on" + outcome]?.(); if (outcome === "error") tx.onabort?.(); running = false; queueMicrotask(pump);
          }
          function idle() {
            if (pending || ended || commitHeld || !active) return;
            if (writable && fault.holdCommit) { commitHeld = true; stats.held++; releases.push(() => finish("complete")); }
            else finish("complete");
          }
          function request(action, kind, key) {
            const order = ++number;
            if (writable && fault.throwAt === order) throw new Error("owned request throw");
            const req = {}; pending++;
            const run = () => queueMicrotask(() => {
              if (ended) return;
              try { req.result = action(); req.onsuccess?.(); }
              catch (error) { tx.error = error; finish("abort"); return; }
              pending--;
              if (writable && fault.failAt === order) { tx.error = new Error("owned transaction " + (fault.outcome ?? "abort")); finish(fault.outcome ?? "abort"); return; }
              queueMicrotask(idle);
            });
            if (kind === "get") stats.reads.push(key); else if (kind === "put") stats.writes.push(key); else stats.deletes.push(key);
            if (active) run(); else backlog.push(run); return req;
          }
          tx.objectStore = () => ({
            get(key) { return request(() => structuredClone(draft.get(key)), "get", key); },
            put(value, key) { const copy = structuredClone(value); return request(() => { draft.set(key, copy); return key; }, "put", key); },
            delete(key) { return request(() => { draft.delete(key); }, "delete", key); },
          });
          queue.push(() => { active = true; draft = new Map(structuredClone([...records])); for (const run of backlog) run(); });
          queueMicrotask(pump); return tx;
        } }; opening.onsuccess?.();
      }); return opening;
    } },
  };
}
