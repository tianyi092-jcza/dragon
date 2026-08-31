import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Extract and execute the production saveGame method without starting the browser app.
const source = await fs.readFile(
  new URL("../web/src/main.js", import.meta.url),
  "utf8",
);
const match = source.match(
  /async saveGame\(slotIdx, label\) \{([\s\S]*?)\n {2}\},\n\n {2}\/\*\* 读档/,
);
assert.ok(match, "cannot locate production saveGame method");

let binaryBase = new Uint8Array(8).fill(1);
let fetchCalls = 0;
const responses = [
  { ok: false, status: 500 },
  { ok: true, status: 200 },
];
const stageSave = (_app, slotIdx) => {
  const out = binaryBase.slice();
  out[slotIdx] = 9;
  return out;
};
const commitSaveImage = (dat) => {
  binaryBase = dat.slice();
};
const snapshotState = (_app, slotIdx, label) => ({ slot: slotIdx, label });
const instanceFetch = async () => {
  fetchCalls++;
  return responses.shift();
};
const canSnapshotState = () => true;
const instanceRuntimeActive = () => true;
const encodeWebSaveMeta = () => "meta";
class InstanceLeaseError extends Error {}
const saveGame = new Function(
  "canSnapshotState",
  "commitSaveImage",
  "encodeWebSaveMeta",
  "InstanceLeaseError",
  "instanceFetch",
  "instanceRuntimeActive",
  "snapshotState",
  "stageSave",
  `return async function saveGame(slotIdx, label) {${match[1]}\n}`,
)(
  canSnapshotState,
  commitSaveImage,
  encodeWebSaveMeta,
  InstanceLeaseError,
  instanceFetch,
  instanceRuntimeActive,
  snapshotState,
  stageSave,
);
const messages = [];
const oldSlot = { slot: 0, label: "OLD" };
const app = {
  runtimeEnabled: true,
  saves: { slots: [oldSlot] },
  hud: {
    flashEvent(message) {
      messages.push(message);
    },
  },
  _saveQueue: Promise.resolve(),
  loseInstanceLease() {
    this.runtimeEnabled = false;
  },
};
const first = await saveGame.call(app, 0, "FAILED");
assert.equal(first.saved, "failed");
assert.equal(app.saves.slots[0], oldSlot);
assert.deepEqual([...binaryBase], new Array(8).fill(1));
assert.match(messages.at(-1), /失敗/);
const second = await saveGame.call(app, 1, "SUCCESS");
assert.equal(second.saved, "file");
assert.deepEqual(app.saves.slots, [oldSlot, { slot: 1, label: "SUCCESS" }]);
assert.equal(binaryBase[0], 1, "failed slot leaked into later save baseline");
assert.equal(binaryBase[1], 9);
assert.equal(fetchCalls, 2);
assert.match(messages.at(-1), /槽2/);

// 网络异常可能发生在服务端commit之后；客户端必须fail closed，不能继续上传旧整份底版。
app.runtimeEnabled = true;
const fetchBeforeUnknown = fetchCalls;
const unknownFetch = async () => {
  fetchCalls++;
  throw new Error("response lost");
};
const saveGameUnknown = new Function(
  "canSnapshotState",
  "commitSaveImage",
  "encodeWebSaveMeta",
  "InstanceLeaseError",
  "instanceFetch",
  "instanceRuntimeActive",
  "snapshotState",
  "stageSave",
  `return async function saveGame(slotIdx, label) {${match[1]}\n}`,
)(
  canSnapshotState,
  commitSaveImage,
  encodeWebSaveMeta,
  InstanceLeaseError,
  unknownFetch,
  instanceRuntimeActive,
  snapshotState,
  stageSave,
);
const unknown = await saveGameUnknown.call(app, 2, "UNKNOWN");
assert.equal(unknown.saved, "unknown");
assert.equal(app.runtimeEnabled, false);
assert.equal(fetchCalls, fetchBeforeUnknown + 1);
assert.match(messages.at(-1), /結果不明/);
const blocked = await saveGameUnknown.call(app, 3, "BLOCKED");
assert.equal(blocked.saved, "blocked");
assert.equal(fetchCalls, fetchBeforeUnknown + 1);

process.stdout.write(
  "save client commit OK: HTTP failure rolls back locally; ambiguous network loss fail-closes\n",
);
