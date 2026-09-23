// 0x3EFD strategic-city AI raw certificate. Reads KI.EXE only; no SAVE.DAT
// access and no DOS emulation.
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

// 3EFD decrements city +857 before 3F74. 4028 clears it when there is no
// threat; otherwise an empty city directly calls 40C9(AL=1) then 40B3 before
// 4057's target-candidate selection. Thus an AI empty border can form even
// when faction+19 has no target, and 40B3 runs even if 40C9 is short-circuited.
bytes(0x3efd, "8b361e0d2e8e1e520d80bc5708007404fe8c5708");
bytes(
  0x4028,
  "80a440083fb080807e00fe72097409c684570800eb150c400884400880bc580801730ab001e87900e86000f8c3f9c3",
);
bytes(0x40c9, "80bc5708007401c3");
bytes(0x40ff, "8bfe8bced1e1d1e1d1e18ac88abc410832dbd1ebd1eb8bf3e85b04");
// 4575 clamps requested CL to the available legion limit, loops 45C1 once per
// formation, and distinguishes a zero-formation carry result from success.
bytes(
  0x4575,
  "5053b3058b44213da0007e0bd1e0d1e0d1e080c3028adc2a5c147703f9eb2a3acb76028acb57",
);
bytes(
  0x459b,
  "8bc6d1e0d1e08ac432e4e81900720dfec4886d20c6452300fec975eef822e47501f9",
);
// Successful 6E8F formation increments faction+14 when it claims an inactive
// legion slot; a multi-unit 4575 request must therefore increment per legion.
bytes(0x6f57, "803c807303fe4714c604c0c6440804");
bytes(0x4057, "807e00fe7355e880ac24038bfd36803dfe73f8fec8740583c704ebf1");
bytes(0x4099, "22c07502b001368a0db5008ad08ab45808e8a800");

// P39 4064 outer-stack closure: 3F74 pushes es/ax/bx/cx/dx/di/bp then reserves
// 16 local bytes (rep stosw fills 0xFFFF); 3FA9 loops cl=4 neighbour slots and
// never writes a terminator when all four become candidates, so al==0 with four
// candidates falls off into ss:[bp+0x10] = pushed old-BP. BP/DI/DX/CX at the
// 1CD0 je-1D0B entry are leftovers of the main-loop input/timer/UI calls
// (1C22 push cx/dx around E453; 1BF9/1BFD load dx/bx from [988E]/[9890]), so
// the walked bytes are frame-dynamic; classification = permanent fail-closed.
bytes(0x3f74, "065053515257558" + "3ec108bec8cd08ec08bfdb90800b8fffffcf3ab");
bytes(0x3fcc, "565581c65c08b104");
bytes(0x4023, "75af5d5ec3");
bytes(0x1cd0, "803ea598007434803ea59801740f");
bytes(0x1c22, "5152e82cc85a59");
bytes(0x1bf9, "8b168e988b1e9098");

// P41 43D3 linear alias full domain: 28F4 sets DI=BX*4 with BX=node idx*8 (so
// DI=idx*0x20 leftover into the 4325 dispatch); 43AF is the state-1 handler
// whose 43D3 reads [DI+0x18] without adding 0x840 — k=0..47 aliases faction
// floor(k/2) bytes +0x18 (even k) / +0x38 (odd k), 48..65 the diplomacy page,
// 66..191 city[k-66] cache; the 4300 interception STC re-entry passes
// BX=idx*0x100, so DI=u16(idx*0x400) wraps to 0 at idx 64 (notes: city64 DI
// wrap). 440F state-2 reloads DI=AX (real target city pointer).
bytes(0x28f4, "8bfbd1e7d1e78a44013a85410874148a442032e4d1e0d1e0");
bytes(
  0x4325,
  "1e06568a642032c0d1e8d1e8d1e80540088a5c2332ffd1e383fb10730d2e8a0eff0c3a4c01740383c3082eff9758435e071fc3",
);
bytes(
  0x43af,
  "817c0e00087205c6442300c3817c042c017705c644230ac38bd8f6074075e8803f807206807d1802760fe804a92407fec088440bc6442302c3",
);
bytes(0x440f, "8bf8f60540750b803d80720b807d18017705");

// 4155 initializes DH with localStrength-DL, scans 40h-byte legion slots by
// current node and active bit, rolls ECE0 while DH!=0 before testing bit2 or
// command state, and returns as soon as DL has been decremented to zero.
bytes(
  0x4155,
  "2af2bf40228bded1ebd1eb3b5d0e7529803d80722422f6740be86fab3c407304feceeb15f60504740c807d23087306884d20886d23feca740583c740ebcdc3",
);

process.stdout.write(
  "strategic city AI raw OK: 4028/40C9 formation + 4057/4155 sortie order\n",
);
