// CITY-CAPACITY-1/C0: legacy boundaries, not approval of a new event policy.
// Read-only KI windows + isolated memory. Never reads SAVE or browser state.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { originalDelayedEnqueue301C } from "../web/src/game/navigation/originallegionfate.js";
import { originalMonthlyDiplomacy2BD9 } from "../web/src/game/navigation/originalmonthlydiplomacy.js";
import { originalEventPump31AE } from "../web/src/game/navigation/originalevents.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ki = readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(hash(ki), "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868");

test("C0 original event windows are pinned to KI, not inferred from JS", () => {
  for (const [start, end, expected] of [
    [0x2bd9, 0x2c10, "96d586961f223cf367f029dc05ea96f16a21fbda9390220616d07e1c552c0c23"],
    [0x2fbf, 0x301c, "19835607b97993616258d0d9c4670229031258066e485425621856eb5d72e0d9"],
    [0x301c, 0x304e, "49bbcf42d89dc5a8da3fba044f6e66166c7e2f68b5e4604a7b4fc4d16e16e72b"],
    [0x31ae, 0x31f2, "c9b8ef2aa1fbeebb4bc0be77b70542babe82723f6d4d8305adfe0565af930cec"],
    [0x5358, 0x53c6, "442201b9d1c4318beaa15c06fc08e647c6c7fc6158164d2f660da18a4b62cba7"],
  ]) assert.equal(hash(ki.subarray(start + 0x200, end + 0x200)), expected);
});

function fixture(cursor = 0) {
  const bytes = new Uint8Array(0x400);
  const view = new DataView(bytes.buffer);
  const state = { cursor, divider: 1 };
  const io = {
    readEventCursorWord: () => state.cursor,
    writeEventCursorWord: (value) => { state.cursor = value; },
    readEventDividerByte: () => state.divider,
    writeEventDividerByte: (value) => { state.divider = value; },
    readEventTypeByte: (offset) => view.getUint8(offset),
    readEventWord: (offset) => view.getUint16(offset, true),
    writeEventWord: (offset, value) => view.setUint16(offset, value, true),
    // Only the reset prefix is under test: explicitly inactive factions,
    // no city scan, relation decisions or random-byte capability supplied.
    readPlayerFaction: () => 0,
    readFactionByte: (slot, field) => {
      assert.ok(slot >= 0 && slot < 22);
      assert.equal(field, "attr");
      return 0;
    },
  };
  return { bytes, state, io };
}

test("C0 301C before versus after 2BD9 retains distinct relative slots", () => {
  const before = fixture(63 * 4);
  assert.equal(originalDelayedEnqueue301C(before.io, 0x0709, 0xffff, 2).offset, 65 * 4);
  originalMonthlyDiplomacy2BD9(before.io);
  assert.equal(before.io.readEventWord(4), 0x0709);
  assert.equal(before.io.readEventWord(6), 0xffff);
  assert.deepEqual(before.state, { cursor: 0, divider: 7 });

  const after = fixture(63 * 4);
  originalMonthlyDiplomacy2BD9(after.io);
  assert.equal(originalDelayedEnqueue301C(after.io, 0x0709, 0xffff, 2).offset, 2 * 4);
  assert.equal(after.io.readEventWord(4), 0);
  assert.equal(after.io.readEventWord(8), 0x0709);
});

test("C0 31AE commits cursor before dispatch and leaves consumed bytes occupied", () => {
  const { io, state } = fixture();
  io.writeEventWord(0, 0x0709);
  io.writeEventWord(2, 0xffff);
  assert.deepEqual(originalEventPump31AE(io), {
    status: "dispatch", cursor: 0,
    event: { type: 9, arg0: 7, arg1: 255, arg2: 255 },
  });
  assert.deepEqual(state, { cursor: 4, divider: 10 });
  assert.equal(io.readEventWord(0), 0x0709);
  // A handler's delay6 counts from the already advanced cursor, not slot0.
  assert.equal(originalDelayedEnqueue301C(io, 0x000c, 0x0840, 6).offset, 7 * 4);
});

test("C0 2BD9 drops unread old current-page entries and clears the last page", () => {
  const { io, bytes, state } = fixture();
  io.writeEventWord(63 * 4, 0x0709); // unread, still ahead of cursor0
  io.writeEventWord(0x300, 0x000c);
  io.writeEventWord(0x302, 0x0840);
  originalMonthlyDiplomacy2BD9(io);
  assert.equal(io.readEventWord(63 * 4), 0);
  assert.equal(io.readEventWord(0x200), 0x000c);
  assert.equal(io.readEventWord(0x202), 0x0840);
  assert.ok(bytes.subarray(0x300).every((value) => value === 0));
  assert.deepEqual(state, { cursor: 0, divider: 7 });
});

test("C0 301C initial address beyond the wheel is an unknown read, not full", () => {
  const { io } = fixture(0x3e0);
  assert.throws(() => originalDelayedEnqueue301C(io, 9, 0xffff, 8), RangeError);
});
