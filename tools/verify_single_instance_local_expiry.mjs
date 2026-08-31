import assert from "node:assert/strict";

let now = 1000;
let timerId = 0;
const timers = new Map();
const schedule = (callback, delay) => {
  const id = ++timerId;
  timers.set(id, { callback, at: now + delay });
  return id;
};
const cancel = (id) => timers.delete(id);
const runDue = async () => {
  for (;;) {
    const due = [...timers.entries()]
      .filter(([, timer]) => timer.at <= now)
      .sort((left, right) => left[1].at - right[1].at);
    if (!due.length) return;
    for (const [id, timer] of due) {
      timers.delete(id);
      timer.callback();
      await Promise.resolve();
    }
  }
};

globalThis.document = {
  body: { append() {} },
  querySelector() { return null; },
  createElement() { return { style: {}, textContent: "" }; },
};
globalThis.addEventListener = () => {};
const pendingHeartbeat = new Promise(() => {});
const responseHeaders = {
  get(name) {
    const values = {
      "X-Dragon-Lease-Generation": "generation",
      "X-Dragon-Server-Time": String(now),
      "X-Dragon-Lease-Expires-At": String(now + 1000),
    };
    return values[name] ?? null;
  },
};
globalThis.fetch = async (url) => {
  if (url === "/api/instance/acquire")
    return {
      status: 201,
      headers: responseHeaders,
      async json() {
        return {
          token: "lease",
          generation: "generation",
          heartbeatMs: 400,
          leaseMs: 1000,
        };
      },
    };
  if (url === "/api/instance/heartbeat") return pendingHeartbeat;
  return { status: 204 };
};

const {
  instanceRuntimeActive,
  requireInstanceRuntime,
  startSingleInstance,
} = await import("../web/src/core/singleinstance.js");
let suspends = 0;
await startSingleInstance(
  { onSuspend() { suspends++; } },
  { now: () => now, schedule, cancel },
);
assert.equal(instanceRuntimeActive(now), true);
now = 1400;
await runDue(); // heartbeat开始但永不返回
assert.equal(instanceRuntimeActive(now), true);
now = 2000;
await runDue(); // 独立expiry timer冻结，不等待pending heartbeat
assert.equal(globalThis.__dragonInstance.state, "suspended");
assert.equal(suspends, 1);
assert.equal(instanceRuntimeActive(now), false);
assert.throws(() => requireInstanceRuntime(now), /lease-lost/);

process.stdout.write(
  "single instance local expiry OK: pending heartbeat cannot extend local deadline\n",
);
