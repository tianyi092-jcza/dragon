import assert from "node:assert/strict";

function response(body = null, status = 204, headers = {}) {
  return {
    status,
    headers: {
      get(name) {
        return headers[name] ?? null;
      },
    },
    async json() {
      return body;
    },
  };
}

async function runHeartbeatStopCase() {
  let unload;
  let heartbeatResolve;
  let releaseToken = null;
  const pendingHeartbeat = new Promise((resolve) => {
    heartbeatResolve = resolve;
  });
  globalThis.document = {
    body: { append() {} },
    querySelector() {
      return null;
    },
    createElement() {
      return { style: {}, textContent: "" };
    },
  };
  globalThis.addEventListener = (name, callback) => {
    if (name === "beforeunload") unload = callback;
  };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/instance/acquire")
      return response(
        {
          token: "lease",
          generation: "generation",
          heartbeatMs: 10,
          leaseMs: 1000,
        },
        201,
      );
    if (url === "/api/instance/heartbeat") return pendingHeartbeat;
    if (url === "/api/instance/release") {
      releaseToken = options.body;
      return response();
    }
    throw new Error(String(url));
  };
  let scheduledHeartbeat;
  let suspended = 0;
  let activated = 0;
  const { instanceRuntimeActive, startSingleInstance } = await import(
    "../web/src/core/singleinstance.js?release-stop-heartbeat"
  );
  await startSingleInstance(
    {
      onActive() {
        activated++;
      },
      onSuspend() {
        suspended++;
      },
    },
    {
      now: () => 0,
      schedule(callback, delay) {
        if (delay === 10) scheduledHeartbeat = callback;
        return 1;
      },
      cancel() {},
    },
  );
  assert.equal(activated, 1);
  const heartbeat = scheduledHeartbeat();
  unload({ type: "beforeunload" });
  assert.equal(globalThis.__dragonInstance.state, "stopped");
  assert.equal(globalThis.__dragonInstance.token, null);
  assert.equal(instanceRuntimeActive(0), false);
  assert.equal(suspended, 1);
  assert.equal(releaseToken, "lease");
  heartbeatResolve(
    response(null, 204, { "X-Dragon-Lease-Generation": "generation" }),
  );
  await heartbeat;
  assert.equal(globalThis.__dragonInstance.state, "stopped");
  assert.equal(
    activated,
    1,
    "delayed heartbeat cannot reactivate released page",
  );
}

async function runAcquireStopCase() {
  let unload;
  let acquireResolve;
  const released = [];
  const pendingAcquire = new Promise((resolve) => {
    acquireResolve = resolve;
  });
  globalThis.addEventListener = (name, callback) => {
    if (name === "beforeunload") unload = callback;
  };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/instance/acquire") return pendingAcquire;
    if (url === "/api/instance/release") {
      released.push(options.body);
      return response();
    }
    throw new Error(String(url));
  };
  let activated = 0;
  let suspended = 0;
  const { startSingleInstance } = await import(
    "../web/src/core/singleinstance.js?release-stop-acquire"
  );
  const startup = startSingleInstance({
    onActive() {
      activated++;
    },
    onSuspend() {
      suspended++;
    },
  });
  unload({ type: "beforeunload" });
  assert.equal(globalThis.__dragonInstance.state, "stopped");
  assert.equal(
    suspended,
    0,
    "acquiring runtime was never active and needs no duplicate suspend",
  );
  acquireResolve(
    response(
      {
        token: "late-lease",
        generation: "late-generation",
        heartbeatMs: 10,
        leaseMs: 1000,
      },
      201,
    ),
  );
  assert.equal(await startup, null);
  await Promise.resolve();
  assert.deepEqual(
    released,
    ["late-lease"],
    "late server grant is released immediately",
  );
  assert.equal(globalThis.__dragonInstance.state, "stopped");
  assert.equal(globalThis.__dragonInstance.token, null);
  assert.equal(
    activated,
    0,
    "delayed initial acquire cannot reactivate stopped page",
  );
}

async function runSuspendedStopCase() {
  let unload;
  globalThis.addEventListener = (name, callback) => {
    if (name === "beforeunload") unload = callback;
  };
  globalThis.fetch = async (url) => {
    if (url === "/api/instance/acquire")
      return response(
        {
          token: "suspend-lease",
          generation: "suspend-generation",
          heartbeatMs: 10,
          leaseMs: 1000,
        },
        201,
      );
    if (url === "/api/instance/release") return response();
    throw new Error(String(url));
  };
  let suspended = 0;
  const { startSingleInstance } = await import(
    "../web/src/core/singleinstance.js?release-stop-suspended"
  );
  await startSingleInstance(
    {
      onSuspend() {
        suspended++;
      },
    },
    {
      now: () => 0,
      schedule() {
        return 1;
      },
      cancel() {},
    },
  );
  globalThis.__dragonInstance.suspend();
  assert.equal(suspended, 1);
  assert.equal(globalThis.__dragonInstance.state, "suspended");
  unload({ type: "beforeunload" });
  assert.equal(globalThis.__dragonInstance.state, "stopped");
  assert.equal(
    suspended,
    1,
    "stopping an already suspended runtime does not suspend twice",
  );
}

await runHeartbeatStopCase();
await runAcquireStopCase();
await runSuspendedStopCase();

process.stdout.write(
  "single instance release stop OK: unload freezes locally, rejects delayed successes, and avoids duplicate suspend\n",
);
