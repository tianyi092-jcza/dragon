import assert from "node:assert/strict";

function createDom() {
  const nodes = new Map();
  globalThis.document = {
    body: {
      append(node) {
        nodes.set(node.id, node);
      },
    },
    querySelector(selector) {
      return nodes.get(selector.slice(1)) ?? null;
    },
    createElement() {
      return { style: {}, textContent: "", id: "" };
    },
  };
  globalThis.addEventListener = () => {};
  globalThis.location = { reload() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  return nodes;
}

function installLocks() {
  let held = false;
  globalThis.navigator.locks = {
    async request(_name, options, callback) {
      if (options.ifAvailable && held) return callback(null);
      held = true;
      try {
        return await callback({ name: "wolong-web-game-instance" });
      } finally {
        held = false;
      }
    },
  };
}

createDom();
installLocks();
const { startSingleInstance } = await import(
  `../web/src/core/singleinstance.js?test=${Date.now()}`
);
const first = await startSingleInstance();
assert.equal(first?.state, "active");
assert.equal(first?.kind, "web-lock");
assert.equal(globalThis.__dragonInstance, first);

const second = await startSingleInstance();
assert.equal(second, null);
assert.match(
  document.querySelector("#instance-lock").textContent,
  /另一個分頁/,
);
assert.equal(
  globalThis.__dragonInstance,
  first,
  "blocked page cannot replace active runtime",
);

first.stop();
await new Promise((resolve) => queueMicrotask(resolve));
const third = await startSingleInstance();
assert.equal(third?.state, "active");
assert.equal(third?.kind, "web-lock");
third.stop();

process.stdout.write(
  "single instance OK: Web Locks blocks duplicate startup and releases on stop\n",
);
