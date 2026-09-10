// CBE5 slot-identity raw certificate. This reads KI.EXE only; it is not a DOS
// emulator and does not access SAVE.DAT.
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

// Battle dispatch records the exact opposing legion address in D30 for each
// player-side arrangement; it does not put the legion's +2 commander byte there.
bytes(0x4e75, "2e89362e0d2e893e300d");
bytes(0x4e8f, "2e800e350d802e8936300d2e893e2e0d");
bytes(0x4f16, "2e800e350dc02e891e2e0d2e8936300d");

// CBE5: (D30 - 2240h) >> 1 = legionSlot * 20h, then reads
// D52:[4256h + offset] == general[legionSlot][+16h].
bytes(0xcbfe, "8b1e300d81eb4022d1eb8e1e520d8aa75642d0e4d0e402e0");

// Normal 6E8F formation starts with a general-table offset, doubles it into
// the same-numbered 40h-byte legion slot, and writes the commander byte at +2.
// That equality is a formation invariant, not the CBE5 lookup expression.
bytes(0x6e92, "8bfe81ee4042d1e68bded1e3d1e388bc4222");

for (const slot of [0, 1, 17, 126]) {
  const legionAddress = 0x2240 + slot * 0x40;
  assert.equal((legionAddress - 0x2240) >> 1, slot * 0x20, `CBE5 slot ${slot}`);
}

process.stdout.write(
  "battle CBE5 slot identity raw OK: D30 slot -> general[slot]+16\n",
);
