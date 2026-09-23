// P40 (C02): fresh v2 占格平面/城市缓存初始化 — KI 1A2D rep stosw 清零 +
// 89F0→8AEA 重建 + 8CAE 城记录 +0x18 初值。file offset = VA + 0x200。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createScenarioMovementMemory,
  movementPlaneAddress,
  synthesizeScenarioMovementMemory,
} from "../web/src/game/navigation/scenariomovementmemory.js";
import {
  createScenarioCityCache,
  synthesizeScenarioCityCache,
} from "../web/src/game/navigation/scenariocitycache.js";

const KI = readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
const SINARIO = readFileSync(
  new URL("../../原版/SINARIO.DAT", import.meta.url),
);
const raw = (va, len) =>
  KI.subarray(va + 0x200, va + 0x200 + len).toString("hex");

test("KI.EXE sha256 pinned", () => {
  assert.equal(
    createHash("sha256").update(KI).digest("hex").slice(0, 8),
    "fffeba98",
  );
});

test("byte pins: 1A2D plane zero fill and 8AEA occupancy rebuild (P40)", () => {
  // 1A2F..1A4B: es=cs:[9872]; rep stosw 0x8000 words; +0x1000 段; rep stosw 0x4000 words
  assert.equal(
    raw(0x1a2f, 0x1d),
    "2e8b167298" + // mov dx, cs:[9872]
      "33c0" + // xor ax, ax
      "8bf8" + // mov di, ax
      "b90080" + // mov cx, 0x8000
      "8ec2" + // mov es, dx
      "f3ab" + // rep stosw
      "81c20010" + // add dx, 0x1000
      "8bf8" +
      "b90040" + // mov cx, 0x4000
      "8ec2" +
      "f3ab",
  );
  // 8AF8..8B11: es = Y*24 + cs:[9872]; L1A=X; L1C=行段; inc es:[X]
  assert.equal(
    raw(0x8af8, 0x1a),
    "8bd8" + // mov bx, ax
      "d1e0" + // shl ax, 1
      "03c3" + // add ax, bx  (ax = Y*8*3 = Y*24)
      "2e03067298" + // add ax, cs:[9872]
      "8ec0" + // mov es, ax
      "8b5c10" + // mov bx, [si+0x10]
      "89441c" + // mov [si+0x1c], ax
      "895c1a" + // mov [si+0x1a], bx
      "26fe07" + // inc byte es:[bx]
      "c3",
  );
});

test("official SINARIO.DAT: all four chapters have zero legion records", () => {
  assert.equal(SINARIO.length % 0x56c0, 0);
  for (let ch = 0; ch < 4; ch++) {
    const rec = SINARIO.subarray(ch * 0x56c0, (ch + 1) * 0x56c0);
    const legions = rec.subarray(0x22c0, 0x42c0);
    assert.ok(
      legions.every((b) => b === 0),
      `chapter ${ch} legion area must be zero`,
    );
  }
});

const checkpoint = {
  identity: {
    world: { id: "w", revision: "1" },
    content: { packId: "p", chapterId: "c", revision: "1" },
  },
  memory: { initialGraph: "g" },
};

test("movement memory zeroFilled: full plane known zero, snapshot stays compact", () => {
  const memory = createScenarioMovementMemory(
    { version: 1, zeroFilled: true, spans: [] },
    checkpoint,
    false,
  );
  assert.equal(memory.readByte(0, 0), 0);
  assert.equal(memory.readByte(24 * 100, 383), 0);
  memory.writeByte(24 * 50, 100, 3);
  const snap = memory.snapshot();
  assert.equal(snap.zeroFilled, true);
  assert.deepEqual(snap.spans, [{ address: 50 * 384 + 100, hex: "03" }]);
  // round-trip through restore keeps zero base and the written cell
  const restored = createScenarioMovementMemory(snap, checkpoint, true);
  assert.equal(restored.readByte(0, 0), 0);
  assert.equal(restored.readByte(24 * 50, 100), 3);
  assert.equal(restored.readByte(24 * 50, 101), 0);
});

test("zeroFilled flag rejects non-boolean", () => {
  assert.throws(
    () =>
      createScenarioMovementMemory(
        { version: 1, zeroFilled: 1, spans: [] },
        checkpoint,
        false,
      ),
    /zeroFill/,
  );
});

test("synthesizeScenarioMovementMemory: empty table stays zero plane", () => {
  const input = synthesizeScenarioMovementMemory({});
  assert.deepEqual(input, { version: 1, zeroFilled: true, spans: [] });
});

test("synthesizeScenarioMovementMemory: active slots 0..126 inc, slot 127 excluded", () => {
  const scenario = {
    nativeLegionSlots: {
      version: 1,
      records: [
        { slot: 5, status: 0x80, x: 100, y: 50 },
        { slot: 6, status: 0x7f, x: 1, y: 1 }, // inactive: skipped
        { slot: 127, status: 0x80, x: 7, y: 7 }, // siege temp slot: excluded
        { slot: 9, status: 0xc0, x: 100, y: 50 }, // same tile as slot 5
      ],
    },
  };
  const input = synthesizeScenarioMovementMemory(scenario);
  assert.equal(input.zeroFilled, true);
  assert.deepEqual(input.spans, [{ address: 50 * 384 + 100, hex: "02" }]);
  const [first, , , second] = scenario.nativeLegionSlots.records;
  assert.equal(first.occupancyOffset, 100);
  assert.equal(first.occupancyRowParagraph, 50 * 24);
  assert.equal(second.occupancyOffset, 100);
  assert.equal(second.occupancyRowParagraph, 50 * 24);
  const memory = createScenarioMovementMemory(input, checkpoint, false);
  assert.equal(memory.readByte(50 * 24, 100), 2);
  assert.equal(memory.readByte(50 * 24, 101), 0);
});

test("synthesizeScenarioMovementMemory: invalid coordinate fails closed", () => {
  assert.throws(
    () =>
      synthesizeScenarioMovementMemory({
        nativeLegionSlots: {
          version: 1,
          records: [{ slot: 5, status: 0x80, x: 384, y: 0 }],
        },
      }),
    /8AEA legion coordinate/,
  );
});

test("synthesizeScenarioCityCache: C18 initial = city record byte +0x18", () => {
  const records = Array.from({ length: 192 }, (_, i) => {
    const bytes = new Uint8Array(32);
    bytes[0x18] = i & 0xff;
    return Buffer.from(bytes).toString("hex");
  });
  const input = synthesizeScenarioCityCache({ nativeCityRecordRaw: records });
  assert.equal(input.version, 1);
  assert.equal(input.spans.length, 1);
  assert.equal(input.spans[0].address, 0);
  assert.equal(input.spans[0].hex.length, 192 * 2);
  const cache = createScenarioCityCache(input, checkpoint, false);
  assert.equal(cache.readByte(0), 0);
  assert.equal(cache.readByte(100), 100);
  assert.equal(cache.readByte(191), 191);
});

test("synthesizeScenarioCityCache: missing or malformed raw fails closed", () => {
  assert.throws(() => synthesizeScenarioCityCache({}), /city cache source/);
  assert.throws(
    () =>
      synthesizeScenarioCityCache({
        nativeCityRecordRaw: Array.from({ length: 191 }, () => "00".repeat(32)),
      }),
    /city cache source/,
  );
  assert.throws(
    () =>
      synthesizeScenarioCityCache({
        nativeCityRecordRaw: Array.from({ length: 192 }, () => "zz".repeat(32)),
      }),
    /city record raw/,
  );
});

test("movementPlaneAddress bounds", () => {
  assert.equal(movementPlaneAddress(0, 0), 0);
  assert.equal(movementPlaneAddress(24, 0), 384);
  assert.throws(() => movementPlaneAddress(1, 0), /movement pointer/);
  assert.throws(() => movementPlaneAddress(24 * 256, 0), /movement pointer/);
});
