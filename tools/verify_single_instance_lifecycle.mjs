// Pure-memory lifecycle fixtures: no browser profile, files, server, or saves.
import assert from "node:assert/strict";
import test from "node:test";
import { startSingleInstance } from "../web/src/core/singleinstance.js";

function fixture({ fallback = false, channel = true } = {}) {
  const saved = new Map();
  const install = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  };
  const events = new Map();
  const dispatch = (type) => {
    const listeners = events.get(type) ?? [];
    events.delete(type); // Lifecycle listeners are once-only.
    for (const listener of listeners) listener({ type });
  };
  const channels = [];
  const nodes = new Map();
  const storage = new Map();
  const callbacks = { active: 0, suspend: 0, lost: 0 };
  let request, heartbeat;
  install(
    "navigator",
    fallback
      ? {}
      : {
          locks: {
            request: (name, options, callback) => {
              assert.equal(name, "wolong-web-game-instance");
              assert.deepEqual(options, { ifAvailable: true });
              request = callback;
            },
          },
        },
  );
  install(
    "BroadcastChannel",
    channel
      ? class extends EventTarget {
          constructor() {
            super();
            this.closed = false;
            this.closes = 0;
            this.messages = [];
            channels.push(this);
          }
          postMessage(message) {
            assert.equal(
              this.closed,
              false,
              "must not post after channel close",
            );
            this.messages.push(message.type);
          }
          close() {
            this.closed = true;
            this.closes++;
          }
        }
      : undefined,
  );
  install("document", {
    querySelector: (selector) => nodes.get(selector),
    createElement: () => ({ style: {} }),
    body: { append: (node) => nodes.set(`#${node.id}`, node) },
  });
  install("addEventListener", (type, listener) => {
    events.set(type, [...(events.get(type) ?? []), listener]);
  });
  install("location", {
    reload() {
      throw new Error("unexpected persisted pageshow");
    },
  });
  install("localStorage", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  install("setInterval", (callback) => {
    heartbeat = callback;
    return 1;
  });
  install("clearInterval", () => {
    heartbeat = null;
  });
  saved.set(
    "__dragonInstance",
    Object.getOwnPropertyDescriptor(globalThis, "__dragonInstance"),
  );
  return {
    channels,
    callbacks,
    storage,
    start: () =>
      startSingleInstance({
        onActive: () => callbacks.active++,
        onSuspend: () => callbacks.suspend++,
        onLost: () => callbacks.lost++,
      }),
    grant: (lock) => request(lock),
    lifecycle: () => {
      dispatch("beforeunload");
      dispatch("pagehide");
    },
    heartbeat: () => heartbeat?.(),
    restore: () => {
      for (const [key, descriptor] of saved)
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    },
  };
}

async function withFixture(options, run) {
  const f = fixture(options);
  try {
    await run(f);
  } finally {
    f.restore();
  }
}

test("singleinstance blocked lock: reload lifecycle closes only once and never activates", async () => {
  await withFixture({}, async (f) => {
    const pending = f.start();
    await f.grant(null);
    assert.equal(await pending, null);
    f.lifecycle();
    f.lifecycle();
    assert.deepEqual(f.channels[0].messages, ["probe"]);
    assert.equal(f.channels[0].closes, 1);
    assert.deepEqual(f.callbacks, { active: 0, suspend: 0, lost: 0 });
  });
});

test("singleinstance active release: repeated stop/pagehide/beforeunload suspend once", async () => {
  await withFixture({}, async (f) => {
    const pending = f.start();
    const request = f.grant({});
    const runtime = await pending;
    runtime.stop();
    runtime.stop();
    f.lifecycle();
    await request;
    assert.equal(runtime.state, "stopped");
    assert.deepEqual(f.channels[0].messages, ["released"]);
    assert.equal(f.channels[0].closes, 1);
    assert.deepEqual(f.callbacks, { active: 1, suspend: 1, lost: 0 });
  });
});

test("singleinstance lifecycle before lock callback must not activate a stopped page", async () => {
  await withFixture({}, async (f) => {
    const pending = f.start();
    f.lifecycle();
    await f.grant({});
    assert.equal(await pending, null);
    assert.deepEqual(f.callbacks, { active: 0, suspend: 0, lost: 0 });
    assert.equal(f.channels[0].closes, 1);
  });
});

test("singleinstance Web Lock works without BroadcastChannel", async () => {
  await withFixture({ channel: false }, async (f) => {
    const pending = f.start();
    const request = f.grant({});
    const runtime = await pending;
    f.lifecycle();
    await request;
    assert.equal(runtime.state, "stopped");
    assert.deepEqual(f.callbacks, { active: 1, suspend: 1, lost: 0 });
  });
});

test("singleinstance fallback release and ownership loss remain idempotent", async () => {
  for (const lost of [false, true])
    await withFixture({ fallback: true }, async (f) => {
      const runtime = await f.start();
      if (lost) {
        f.storage.set(
          "wolong-web-game-instance",
          JSON.stringify({ id: "other", expiresAt: Date.now() + 10000 }),
        );
        f.heartbeat();
      }
      runtime.stop();
      f.lifecycle();
      assert.equal(runtime.state, lost ? "lost" : "stopped");
      assert.deepEqual(f.callbacks, {
        active: 1,
        suspend: 1,
        lost: lost ? 1 : 0,
      });
      assert.deepEqual(f.channels[0].messages, lost ? [] : ["released"]);
      assert.equal(f.channels[0].closes, 1);
      assert.equal(f.storage.has("wolong-web-game-instance"), lost);
    });
});
