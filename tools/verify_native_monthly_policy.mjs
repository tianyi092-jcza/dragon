import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { originalActivateMonthlyPolicy53A6 } from "../web/src/game/navigation/originalmonthlypolicy.js";
import { performScenarioMonthlyPolicyActivation } from "../web/src/game/navigation/scenariomonthlypolicy.js";
import {
  assertNativeMonthlyPolicy,
  initializeNativeMonthlyPolicy,
} from "../web/src/game/nativemonthlypolicy.js";
import { processMonthlyPolicyActivation } from "../web/src/game/ai.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length);
const wordAt = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const writeWord = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8;
};
/** @returns {any} */
const scenario = (bytes) => ({
  nativeMonthlyPolicyRaw: Buffer.from(bytes).toString("hex"),
  tax: bytes[0],
  conscription: [2, 4, 6].map((offset) => wordAt(bytes, offset) * 10),
  next_tax: bytes[8],
  next_conscription: [10, 12, 14].map((offset) => wordAt(bytes, offset) * 10),
});

test("fixed KI 53A6 copy and bounded 5E80 display dispatcher bytes", () => {
  assert.equal(
    raw(0x53a6, 0x1a).toString("hex"),
    "be100dbf080db904002e8b042e890546464747e2f4b00ee8c00a",
  );
  assert.equal(
    raw(0x5e80, 0x37).toString("hex"),
    "2ef606a698027501c31e562e8e1e520d2e8b36fd0c83c600d0e87303e81800d0e87303e88100d0e87303e8b000d0e87303e8cb005e1fc3",
  );
});

test("all 20 fixed chapter policy sources preserve the complete D08..D17 block", () => {
  for (const directory of ["上", "中", "下", "后", "原版"]) {
    const source = fs.readFileSync(`E:/Dragon/${directory}/SINARIO.DAT`);
    for (let chapter = 0; chapter < 4; chapter++)
      assert.equal(
        source
          .subarray(chapter * 22208 + 0x18, chapter * 22208 + 0x28)
          .toString("hex"),
        "12000000000000001200000000000000",
        `${directory}/${chapter + 1}`,
      );
  }
});

test("53A6 copies four words in order, preserving unknown bytes, then calls 5E80 with 0E", () => {
  const bytes = Uint8Array.from([
    1, 2, 3, 4, 5, 6, 7, 8, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x17, 0x28,
  ]);
  const trace = [];
  const result = originalActivateMonthlyPolicy53A6({
    readPolicyWord(offset) {
      trace.push(["read", offset]);
      return wordAt(bytes, offset);
    },
    writePolicyWord(offset, value) {
      trace.push(["write", offset, value]);
      writeWord(bytes, offset, value);
    },
    refreshStrategicDisplay(mask) {
      trace.push(["display", mask]);
    },
  });
  assert.deepEqual(
    Array.from(bytes),
    [
      0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x17, 0x28, 0xa1, 0xb2, 0xc3, 0xd4,
      0xe5, 0xf6, 0x17, 0x28,
    ],
  );
  assert.deepEqual(trace, [
    ["read", 8],
    ["write", 0, 0xb2a1],
    ["read", 10],
    ["write", 2, 0xd4c3],
    ["read", 12],
    ["write", 4, 0xf6e5],
    ["read", 14],
    ["write", 6, 0x2817],
    ["display", 0x0e],
  ]);
  assert.deepEqual(result, { displayMask: 0x0e });
});

test("scenario adapter keeps ten-person raw words and displayed-person views distinct", () => {
  const bytes = new Uint8Array(0x10);
  bytes[0] = 18;
  bytes[1] = 0x7a;
  bytes[8] = 37;
  bytes[9] = 0xc5;
  writeWord(bytes, 10, 123);
  writeWord(bytes, 12, 456);
  writeWord(bytes, 14, 789);
  const sc = scenario(bytes);
  initializeNativeMonthlyPolicy(sc);
  let displayMask = null;
  performScenarioMonthlyPolicyActivation(sc, (mask) => {
    displayMask = mask;
  });
  assert.equal(displayMask, 0x0e);
  assert.deepEqual(
    sc.nativeMonthlyPolicy.bytes.slice(0, 8),
    [37, 0xc5, 123, 0, 200, 1, 21, 3],
  );
  assert.equal(sc.tax, 37);
  assert.deepEqual(sc.conscription, [1230, 4560, 7890]);
  assert.equal(sc.nativeMonthlyPolicy.bytes[1], 0xc5);
  assertNativeMonthlyPolicy(sc);
});

test("failure retains copied word prefix, holds strategy, and does not reach display", () => {
  const bytes = new Uint8Array(0x10);
  bytes[0] = bytes[8] = 18;
  const sc = scenario(bytes);
  initializeNativeMonthlyPolicy(sc);
  sc.nativeFactionSlots = { version: 1, records: [] };
  sc.nativeMonthlyPolicy.bytes[8] = 31;
  sc.nativeMonthlyPolicy.bytes[9] = 0x55;
  sc.nativeMonthlyPolicy.bytes[10] = 7;
  sc.nativeMonthlyPolicy.bytes[11] = 0;
  delete sc.nativeMonthlyPolicy.bytes[12];
  const app = { scenario: sc, clock: { hold: false } };
  assert.throws(() => processMonthlyPolicyActivation(app), /monthly policy/);
  assert.deepEqual(sc.nativeMonthlyPolicy.bytes.slice(0, 4), [31, 0x55, 7, 0]);
  assert.equal(sc.tax, 18, "views update only at the unreached 5E80 boundary");
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
});

test("restore validation rejects missing bytes and named-view divergence", () => {
  const bytes = new Uint8Array(0x10);
  bytes[0] = bytes[8] = 18;
  const valid = scenario(bytes);
  initializeNativeMonthlyPolicy(valid);
  assert.doesNotThrow(() => assertNativeMonthlyPolicy(valid));
  const missing = structuredClone(valid);
  delete missing.nativeMonthlyPolicy.bytes[15];
  assert.throws(() => assertNativeMonthlyPolicy(missing), /byte 15/);
  const divergent = structuredClone(valid);
  divergent.next_conscription[2] = 10;
  assert.throws(
    () => assertNativeMonthlyPolicy(divergent),
    /next_conscription\[2\]/,
  );
});
