// Complete bounded raw cadence-chain lock. Reads only authenticated binaries;
// never reads or writes SAVE.DAT. Near calls use 16-bit wrapped IP semantics.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ki = await readFile(new URL("../../Dragon/KI.EXE", import.meta.url));
const ynsound = await readFile(new URL("../../Dragon/YNSOUND.COM", import.meta.url));
assert.equal(ki.length, 67099);
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
  "authenticated KI.EXE",
);
assert.equal(ynsound.length, 3463);
assert.equal(
  createHash("sha256").update(ynsound).digest("hex"),
  "e2c6a6a8576c4f2a96b7e3f156d7f48c9570ae03539fe9367adb78aebb364fa1",
  "authenticated YNSOUND.COM",
);

const kiBytes = (va, length) => ki.subarray(va + 0x200, va + 0x200 + length);
const kiHex = (va, length) => kiBytes(va, length).toString("hex");
const soundHex = (va, length) =>
  ynsound.subarray(va - 0x100, va - 0x100 + length).toString("hex");
const nearTarget = (bytes, fileBias, va) => {
  const at = va + fileBias;
  assert.equal(bytes[at], 0xe8, `${va.toString(16)} is a near CALL`);
  const displacement = bytes.readInt16LE(at + 1);
  return (va + 3 + displacement) & 0xffff;
};
const kiNearTarget = (va) => nearTarget(ki, 0x200, va);
const callersOf = (target) => {
  const callers = [];
  for (let at = 0x200; at + 2 < ki.length; at++) {
    if (ki[at] !== 0xe8) continue;
    const va = at - 0x200;
    if (kiNearTarget(va) === target) callers.push(va);
  }
  return callers;
};

// 5FAA menu path: AL-=20h selects tactical BX=4, 6062 indexes setting
// SI=BX-1, max table [5FF4+4*SI]=5, cycles CFB, then dispatch entry 4=60A5.
assert.equal(
  kiHex(0x5fc6, 31),
  "2c2072f48ad832ff23db740883fb0a7403e88800d1e3ff975660ebd3e8f1c0",
);
assert.equal(
  kiHex(0x6062, 31),
  "56578bf34e8bfed1e7d1e78aa5f45f8a84f80cfec03ac4720232c08884f80c",
);
assert.equal(
  kiHex(0x6033, 35),
  "b3ccb0aab3740020b0aab374200020b4b6b371200020a743b3742000b3cca743b37400",
  "6033 labels: 最高速/高速/普通/低速/最低速",
);
assert.deepEqual(
  Array.from({ length: 6 }, (_, i) => kiBytes(0x6056 + i * 2, 2).readUInt16LE()),
  [0x6084, 0x6097, 0x60a1, 0x5ff1, 0x60a5, 0x60b4],
  "6056 settings dispatch table; tactical entry index 4 is 60A5",
);
assert.equal(kiNearTarget(0x1ab7), 0x60a5, "1AB7 initialization calls 60A5");
assert.deepEqual(callersOf(0x60a5), [0x1ab7]);
assert.equal(
  kiHex(0x60a5, 15),
  "a0fb0cd0e0d0e0d0e0d0e0a2fc0cc3",
  "60A5: CFB << 4 -> CFC",
);

// KI registers CS:0356 through INT61 AH=0Ch. Its AH=2/3 INT61 calls reach
// YNSOUND's AH-indexed table, whose entry 0Ch is 02FB; 017D installs 08B7.
assert.equal(kiNearTarget(0x31), 0x33b);
assert.equal(kiNearTarget(0x34), 0x210);
assert.equal(
  kiHex(0x33b, 25),
  "1e50528cc88ed8ba5603b8000ccd615a581fc350b8010ccd61",
  "033B: DS:DX=CS:0356, AX=0C00h, INT61 registration",
);
assert.equal(
  kiHex(0x210, 24),
  "1e505632e4cd61b4022e8e1e3e0d33f6cd61b403cd612ec6",
  "0210: INT61 AH=2 then AH=3 initialization seams",
);
assert.equal(
  soundHex(0x103, 20),
  "fa538adcd0e332ff81c315012eff175bfbcf3e01",
  "YNSOUND 0103 AH dispatch through table 0115",
);
assert.equal(
  ynsound.readUInt16LE(0x115 - 0x100 + 0x0c * 2),
  0x2fb,
  "YNSOUND dispatch table[0Ch]=02FB",
);
assert.equal(
  ynsound.readUInt16LE(0x115 - 0x100 + 3 * 2),
  0x17d,
  "YNSOUND dispatch table[3]=017D",
);
assert.equal(
  soundHex(0x17d, 20),
  "1e065053522ec6069e0900e82c07b81c35cd212e",
  "017D reaches timer installation 08B7",
);
assert.equal(
  soundHex(0x2fb, 20),
  "3c01740b2e89163e092e8c1e4009c3b87a092ea3",
  "02FB patches far callback operands 093E/0940 from DS:DX",
);
assert.equal(
  soundHex(0x8b7, 40),
  "1e06505352b80835cd212e891e4d092e8c064f098cc88ed8ba1309b80825cd21b036e643b80001e6",
  "08B7: INT8 install and PIT mode3/divisor 0100h",
);
assert.equal(
  soundHex(0x913, 70),
  "fa9c502ef6069e090274122efe0e690b750b2ea0680b2ea2690be87cfa2efe0e6a0b750c2ec6066a0b109a00000000fa2efe0e6b0b7507589dea00000000b020e620589dfbcf",
  "0913: 16-IRQ divider and patched far callback",
);
assert.equal(
  kiHex(0x356, 23),
  "fa9c2ec6062c0d012e803e2d0dff73052efe062d0d9dcb",
  "0356: D2C callback flag and saturating D2D increment",
);

// Battle entry and no-input loop. A1C5 startup and the normal A426 path both
// reach A065. Every A1C5 A04B caller is locked using wrapped near targets.
for (const [site, target] of [
  [0x1b70, 0x9946],
  [0x1b73, 0x9fa0],
  [0x9fb2, 0xa1c5],
  [0x9fd4, 0xa426],
  [0x9fd7, 0xa065],
  [0xa058, 0xa065],
])
  assert.equal(kiNearTarget(site), target, `${site.toString(16)} -> ${target.toString(16)}`);
assert.deepEqual(callersOf(0xa04b), [
  0xa1c8,
  0xa219,
  0xa264,
  0xa275,
  0xa2ce,
  0xa331,
  0xa3bb,
  0xa402,
]);
assert.equal(
  kiHex(0xa04b, 26),
  "1e06505351525657558cc88ed8e80a005d5f5e5a595b58071fc3",
  "A04B wraps one A065 call",
);
assert.equal(
  kiHex(0x9fd4, 9),
  "e84f04e88b00ebdf8c",
  "9FA0 no-input tail calls A426 then A065 and loops",
);

// Nonterminal A065 converges through B941/ADC8/DDB4 to the tail A0F2 gate.
// The terminal A6FA path is separately covered by startup/lifecycle tests.
assert.equal(kiNearTarget(0xa07c), 0xa12a);
assert.equal(kiNearTarget(0xa07f), 0xa6fa);
assert.equal(kiNearTarget(0xa082), 0xb941);
assert.equal(kiNearTarget(0xa0a7), 0xadc8);
assert.equal(kiNearTarget(0xa0aa), 0xc6f6);
assert.equal(kiNearTarget(0xa0bb), 0xadc8);
assert.equal(kiNearTarget(0xa0be), 0xc6f6);
assert.equal(kiNearTarget(0xa0de), 0xddb4);
assert.equal(kiNearTarget(0xa0ef), 0xddb4);
assert.equal(
  kiHex(0xa0f2, 31),
  "a0fc0c22c07417803e2c0d0074f938062d0d72fac6062d0d00c6062c0d0083",
  "A0F2 tail wait reads only CFC",
);
assert.equal(
  kiHex(0x1df8, 31),
  "a0fa0c22c07417803e2c0d0074f938062d0d72fac6062d0d00c6062c0d00c3",
  "strategic wait reads only CFA",
);

console.log(
  "original tactical cadence evidence OK: settings labels/index/60A5; INT61/YNSOUND callback; 1B73/9FA0/A426; all A04B callers; nonterminal A065->A0F2 tail",
);
