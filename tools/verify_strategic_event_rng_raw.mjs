// Raw certificate for strategic-event timing and the process-wide KI.EXE RNG.
// Reads KI.EXE only; no SAVE.DAT access and no DOS emulation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const raw = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const bytes = (va, hex) =>
  assert.equal(
    raw.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
    `KI.EXE:${va.toString(16)}`,
  );
const near = (va) => (va + 3 + raw.readInt16LE(va + 0x201)) & 0xffff;

// The sole direct caller seeds once in startup before the title/game flow.
bytes(0x0077, "e808ec");
assert.equal(near(0x0077), 0xec82);
// EC82 uses BIOS INT 1Ah/AH=02 CH/CL/DH directly to build the RNG state.
bytes(0xec9b, "b402cd1a8ade02c602c1d0e5d0e502c5");

// 2BD9 resets D20 cursor and 31AD's first-event divider to seven. 2FBF uses
// one ECE0 byte masked with 7Ch as its event-page start offset, while 31BE
// resets the divider to ten after consuming a four-byte event record.
bytes(0x2be1, "2ec706200d00002ec606ad3107");
bytes(0x2fcb, "e812bd32e4247c8bd82e031e200d");
assert.equal(near(0x2fcb), 0xece0);
bytes(0x31be, "c606ad310a8e06560d8b1e200d268b07268b5702");
// Monthly settlement invokes the same 2BD9 path; it does not reseed EC82.
bytes(0x5394, "e842d8");
assert.equal(near(0x5394), 0x2bd9);

process.stdout.write(
  "strategic event RNG raw OK: startup BIOS seed + 2BD9/2FBF/31BE timing\n",
);
