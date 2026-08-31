import assert from "node:assert/strict";

function headers(values = {}) {
  return { get(name) { return values[name] ?? null; } };
}

function installDom() {
  globalThis.document = {
    body: { append() {} },
    querySelector() { return null; },
    createElement() { return { style: {}, textContent: "" }; },
  };
  globalThis.addEventListener = () => {};
}

async function loadFresh(tag) {
  return import(`../web/src/core/singleinstance.js?stale=${tag}`);
}

// Delayed acquire 201: response arrived after the server-granted lease duration.
{
  installDom();
  let now = 0;
  globalThis.fetch = async () => {
    now = 1100;
    return {
      status: 201,
      headers: headers(),
      async json() {
        return {
          token: "old",
          generation: "generation-old",
          heartbeatMs: 250,
          leaseMs: 1000,
        };
      },
    };
  };
  const { startSingleInstance } = await loadFresh("acquire");
  await assert.rejects(
    startSingleInstance({}, { now: () => now, schedule: () => 1, cancel() {} }),
    /stale-lease-response/,
  );
  assert.notEqual(globalThis.__dragonInstance.state, "active");
}

// Delayed heartbeat 204: old response must not reactivate after original deadline.
{
  installDom();
  let now = 0;
  let scheduledHeartbeat;
  let suspends = 0;
  let activations = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/instance/acquire")
      return {
        status: 201,
        headers: headers(),
        async json() {
          return {
            token: "lease",
            generation: "generation-current",
            heartbeatMs: 400,
            leaseMs: 1000,
          };
        },
      };
    if (url === "/api/instance/heartbeat") {
      now = 1100;
      return {
        status: 204,
        headers: headers({
          "X-Dragon-Lease-Generation": "generation-current",
          "X-Dragon-Server-Time": "400",
          "X-Dragon-Lease-Expires-At": "1400",
        }),
      };
    }
    return { status: 204, headers: headers() };
  };
  const schedule = (callback, delay) => {
    if (delay === 400 && !scheduledHeartbeat) scheduledHeartbeat = callback;
    return 1;
  };
  const { startSingleInstance } = await loadFresh("heartbeat");
  await startSingleInstance(
    {
      onActive() { activations++; },
      onSuspend() { suspends++; },
    },
    { now: () => now, schedule, cancel() {} },
  );
  assert.equal(activations, 1);
  await scheduledHeartbeat();
  assert.equal(globalThis.__dragonInstance.state, "suspended");
  assert.equal(suspends, 1);
  assert.equal(activations, 1, "stale 204 must not reactivate old page");
}

process.stdout.write(
  "single instance stale responses OK: delayed acquire/heartbeat success rejected\n",
);
