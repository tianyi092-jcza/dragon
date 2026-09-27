// In-memory IndexedDB protocol fixture; no disk, network or real browser store.
export function memoryIndexedDB({ outcome = 'complete', initial = [] } = {}) {
  let records = new Map(structuredClone(initial));
  const stats = { reads: [], writes: [], closed: 0, requestSucceeded: false };
  return {
    stats,
    records: () => structuredClone([...records]),
    indexedDB: {
      open() {
        const opening = {};
        queueMicrotask(() => {
          opening.result = {
            close() { stats.closed++; },
            transaction(_name, mode) {
              const draft = new Map(structuredClone([...records]));
              let pending = 0;
              let ended = false;
              const tx = { abort() { if (!ended) { ended = true; tx.onabort?.(); } } };
              function request(action) {
                const req = {};
                pending++;
                queueMicrotask(() => {
                  if (ended) return;
                  req.result = action();
                  stats.requestSucceeded = true;
                  req.onsuccess?.();
                  pending--;
                  if (!pending && !ended) {
                    ended = true;
                    if (outcome === 'complete') {
                      if (mode === 'readwrite') records = draft;
                      tx.oncomplete?.();
                    } else tx[`on${outcome}`]?.();
                  }
                });
                return req;
              }
              tx.objectStore = () => ({
                get(key) {
                  stats.reads.push(key);
                  return request(() => structuredClone(draft.get(key)));
                },
                put(value, key) {
                  if (outcome === 'throw') throw new Error('put failed');
                  const copy = structuredClone(value);
                  stats.writes.push(key);
                  return request(() => { draft.set(key, copy); return key; });
                },
              });
              return tx;
            },
          };
          opening.onsuccess?.();
        });
        return opening;
      },
    },
  };
}
