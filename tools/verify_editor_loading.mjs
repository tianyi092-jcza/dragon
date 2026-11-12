// Editor transport/loading contract only: in-memory fetch doubles, no sockets or game/save data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const client = readFileSync(new URL('../server/public/client.txt', import.meta.url), 'utf8');
const transport = client.slice(client.indexOf('async function api('), client.indexOf('// 三層：'));
// Import the actual transport source with isolated dependencies, like the controller fixtures.
const { createTransport } = await import('data:text/javascript;base64,' + Buffer.from(`
  export function createTransport(shell, fetch) {
    let pendingRequests = 0, sessionEpoch = 0, current = null;
    const errors = {}, render = () => {};
    ${transport}
    return api;
  }
`).toString('base64'));
function fixture(fetch) {
  const states = [];
  const api = createTransport({ loading: value => states.push(value) }, fetch);
  return { api, states };
}

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('parallel loads share one loading state until the last response body completes', async () => {
  const first = deferred(), second = deferred();
  const f = fixture(async path => ({ ok: true, json: () => path === '/first' ? first.promise : second.promise }));
  const a = f.api('/first'), b = f.api('/second');
  assert.deepEqual(f.states, [true, true]);
  first.resolve({ first: true });
  assert.deepEqual(await a, { first: true });
  assert.equal(f.states.at(-1), true);
  second.resolve({ second: true });
  assert.deepEqual(await b, { second: true });
  assert.deepEqual(f.states, [true, true, true, false]);
});

test('successive loads can restart the animation without changing transport options', async () => {
  const calls = [];
  const f = fixture(async (path, options) => { calls.push({ path, options }); return Response.json({ ok: true }); });
  await f.api('/read');
  await f.api('/write', { name: '測試' }, { key: 'owned-key' });
  assert.deepEqual(f.states, [true, false, true, false]);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['Idempotency-Key'], 'owned-key');
  assert.equal(calls[1].options.body, JSON.stringify({ name: '測試' }));
});

test('HTTP, network, timeout and invalid JSON failures all stop loading and retain error semantics', async () => {
  const cases = [
    { fetch: async () => Response.json({ error: 'OWNED_FAILURE' }, { status: 503 }), message: /OWNED_FAILURE/ },
    { fetch: async () => { throw new TypeError('offline'); }, message: /連線中斷/, code: 'REQUEST_ABORTED' },
    { fetch: async () => { throw new DOMException('timeout', 'TimeoutError'); }, message: /請求已中止/, code: 'REQUEST_TIMEOUT' },
    { fetch: async () => new Response('not JSON'), message: /服務回應無效/ },
  ];
  for (const item of cases) {
    const f = fixture(item.fetch);
    await assert.rejects(f.api('/owned'), error => item.message.test(error.message) && (!item.code || error.code === item.code));
    assert.deepEqual(f.states, [true, false]);
  }
});

test('local and progress requests never mutate the global loading counter', async () => {
  const body = deferred();
  const f = fixture(async path => path === '/global' ? { ok: true, json: () => body.promise } : Response.json({ ok: true }));
  const global = f.api('/global');
  await f.api('/album', undefined, { feedback: 'local' });
  await f.api('/import', {}, { feedback: 'progress', key: 'batch-key' });
  assert.deepEqual(f.states, [true]);
  body.resolve({ ok: true });
  await global;
  assert.deepEqual(f.states, [true, false]);
  await f.api('/album', undefined, { feedback: 'local' });
  assert.deepEqual(f.states, [true, false], 'local-only activity never opens a full-screen mask');
});

test('local and progress failures retain transport errors without changing global loading', async () => {
  for (const feedback of ['local', 'progress']) {
    const f = fixture(async () => { throw new TypeError('offline'); });
    await assert.rejects(f.api('/owned', undefined, { feedback }), /連線中斷/);
    assert.deepEqual(f.states, []);
  }
});

test('a failed parallel request does not hide the animation for a pending request', async () => {
  const body = deferred();
  const f = fixture(async path => {
    if (path === '/bad') throw new TypeError('offline');
    return { ok: true, json: () => body.promise };
  });
  const good = f.api('/good'), bad = f.api('/bad');
  await assert.rejects(bad, /連線中斷/);
  assert.equal(f.states.at(-1), true);
  body.resolve({ ok: true });
  await good;
  assert.equal(f.states.at(-1), false);
});
