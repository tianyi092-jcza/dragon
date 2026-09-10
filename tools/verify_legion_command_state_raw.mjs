// Raw certificate for KI.EXE 0x4325 NPC return/disband state transitions.
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

// NPC states 0..7 select handlers 4..11; state1 returns to state0 only when
// on a road edge, sends <=300 total troops to state10, otherwise its exact
// attr/aliased-byte gate may consume one ECE0 byte and enter state2.
bytes(0x4333, "0540088a5c2332ffd1e3");
bytes(0x433d, "83fb10730d2e8a0eff0c3a4c01740383c308");
bytes(0x43af, "817c0e00087205c6442300c3817c042c017705c644230ac3");
bytes(
  0x43c7,
  "8bd8f6074075e8803f807206807d1802760fe804a92407fec088440bc6442302c3",
);

// State2 only uses fiscal bit6 to choose faction+17 versus +16. With neither
// city slot available, attr<80 transitions to state11 (capital/disband path);
// it is not a generic "funds low → return" rule.
bytes(0x440f, "8bf8f60540750b803d80720b807d18017705c6442301c3");
bytes(0x4426, "8a7c0132dbd1ebd1ebf607407509b0ff864717");
bytes(0x4459, "803d807307c644230bfe4d18c3");
// State10 retargets capital and turns state9 only after it is there; state11
// follows the same capital retarget then invokes 463E to dissolve it.
bytes(0x44a9, "8a7c0132dbd1ebd1eb8a7f03387c207406887c20800c02");
bytes(0x44c8, "81c34008e879007304c6442309c3");
bytes(0x44d6, "8a7c0132dbd1ebd1eb8a7f03387c207406887c20800c02");
bytes(0x44f5, "81c34008e84c007303e83d01c3");

process.stdout.write(
  "legion command state raw OK: 0x4325 NPC return/disband transitions\n",
);
