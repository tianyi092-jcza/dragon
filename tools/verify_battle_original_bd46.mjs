// Raw KI differential: no runtime emulator, saves, browser, or oracle call stubs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildOriginalPath } from "../web/src/game/battle/originalpathfinder.js";
const fixtures = [];
const xy = (n) => (n & 63) | ((n >>> 6) << 8);
function fixture(
  name,
  current,
  target,
  layer = 0,
  mask = 0xeb,
  endpointPolicy = 1,
) {
  const nav = new Uint8Array(0x4000);
  const f = {
    name,
    nav,
    request: { current, target, layer, mask, endpointPolicy },
  };
  fixtures.push(f);
  return f;
}
function connect(nav, a, b) {
  const diff = b - a;
  const bits = {
    1: [0x20, 0x10],
    "-1": [0x10, 0x20],
    64: [0x80, 0x40],
    "-64": [0x40, 0x80],
  }[diff];
  assert.ok(bits);
  nav[a] |= bits[0];
  nav[b] |= bits[1];
}
for (const plane of [0, 0x10])
  for (const surcharge of [0, 8]) {
    const f = fixture(
      `corridor-${plane}-${surcharge}`,
      0x101,
      0x104,
      plane,
      plane ? 0x74 : 0xeb,
      plane ? 0 : 1,
    );
    for (const p of [0, 0x1000])
      for (let x = 1; x < 4; x++) connect(f.nav, p + 64 + x, p + 65 + x);
    f.nav[0x2043 + (plane ? 0x1000 : 0)] = surcharge;
    f.expected = surcharge ? [0x103, 0x104] : [0x104];
  }
// Right then left endpoint selection on each plane must retain changed BX.
for (const plane of [0, 0x10])
  for (const shift of [-1, 1]) {
    const f = fixture(
      `endpoint-${plane}-${shift}`,
      0x101,
      0x104,
      plane,
      plane ? 0x74 : 0xeb,
      plane ? 0 : 1,
    );
    const p = plane ? 0x1000 : 0;
    connect(f.nav, p + 65, p + 66);
    connect(f.nav, p + 66, p + 67);
    if (shift === 1) {
      connect(f.nav, p + 67, p + 3);
      connect(f.nav, p + 3, p + 4);
      connect(f.nav, p + 4, p + 5);
      connect(f.nav, p + 5, p + 69);
    }
  }
fixture("no-endpoint", 0x101, 0x104);
{
  const f = fixture("same-adjusted-endpoint", 0x103, 0x104);
  connect(f.nav, 66, 67);
}
{
  const f = fixture("unreachable", 0x101, 0x104);
  connect(f.nav, 68, 69);
}
for (const weighted of [false, true]) {
  const f = fixture(`ties-${weighted}`, 0x202, 0x404);
  for (let y = 2; y <= 4; y++)
    for (let x = 2; x <= 4; x++) {
      const n = y * 64 + x;
      if (x < 4) connect(f.nav, n, n + 1);
      if (y < 4) connect(f.nav, n, n + 64);
    }
  if (weighted) f.nav[0x2000 + 3 * 64 + 3] = 8;
}
// Both vertical directions, exact alias partition boundaries, and nonzero
// high distance bytes. BFDC observations are compared to the native workspace.
for (const n of [0, 0x7ff, 0x800, 0xfff])
  for (const upward of [false, true]) {
    const adjacent = n + ((n & 63) === 63 ? -1 : 1);
    const f = fixture(
      `vertical-${n.toString(16)}-${upward}`,
      xy(adjacent),
      xy(adjacent),
      upward ? 0x10 : 0,
      0x74,
      upward ? 1 : 0,
    );
    for (const p of [0, 0x1000]) connect(f.nav, p + n, p + adjacent);
    f.nav[n] |= 8;
    f.nav[0x1000 + n] |= 10;
    // Lower-node BFDC aliases lower/upper surcharge even bytes, not node.
    if (!upward) f.nav[0x2000 + 2 * n] = 17;
  }
for (const surcharge of [253, 254, 255]) {
  const f = fixture(
    `vertical-distance-low-byte-${surcharge}`,
    0x102,
    0x102,
    0x10,
    0x74,
    1,
  );
  for (const p of [0, 0x1000]) connect(f.nav, p + 65, p + 66);
  f.nav[65] |= 8;
  f.nav[0x1041] |= 11;
  f.nav[0x2041] = surcharge;
}
{
  const f = fixture("axis-capacity-64", 0x101, 0x2424);
  let n = 65;
  for (let i = 1; i < 36; i++) {
    connect(f.nav, n, n + 1);
    n++;
    connect(f.nav, n, n + 64);
    n += 64;
  }
}
{
  const f = fixture("ring-wrap", 0x101, 0x283c);
  let n = 65;
  for (let y = 1; y <= 40; y++) {
    const end = y % 2 ? 60 : 1;
    while ((n & 63) !== end) {
      const next = n + (y % 2 ? 1 : -1);
      connect(f.nav, n, next);
      n = next;
    }
    if (y < 40) {
      connect(f.nav, n, n + 64);
      n += 64;
    }
  }
  f.request.target = xy(n);
}
// Existing navigation regressions are also checked against raw bytes before
// replacing their old uncompressed/relative-level expectations.
{
  const f = fixture("navigation-vertical", 0x202, 0x203, 0, 0x74, 0);
  f.nav[130] = 10;
  f.nav[0x1082] = 45;
  f.nav[0x1083] = 21;
  f.expected = [0x580, 0x203];
}
for (const offset of [0x2041, 0x2044]) {
  const f = fixture(`reverse-end-weight-${offset}`, 0x101, 0x104);
  for (let n = 65; n < 68; n++) connect(f.nav, n, n + 1);
  f.nav[offset] = 255;
}
// Fixed deterministic graph variants exercise repeated enqueue/candidate
// overwrites. This generator is fixture-only, not the game's RNG.
let seed = 17;
const roll = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
for (let i = 0; i < 16; i++) {
  const f = fixture(
    `two-plane-weighted-grid-${i}`,
    0x202,
    0x606,
    i & 1 ? 0x10 : 0,
    0x74,
    i & 2 ? 1 : 0,
  );
  for (const p of [0, 0x1000])
    for (let y = 2; y <= 6; y++)
      for (let x = 2; x <= 6; x++) {
        const n = y * 64 + x;
        if (x < 6) connect(f.nav, p + n, p + n + 1);
        if (y < 6) connect(f.nav, p + n, p + n + 64);
        f.nav[p + n] |= (p ? 3 : 0) | ((x + y) % 3 === 0 ? 8 : 0);
        f.nav[0x2000 + p + n] = [0, 0, 8, 17, 254][roll() % 5];
      }
}
const input = fixtures.map(({ name, nav, request }) => ({
  name,
  request,
  bytes: Array.from(nav, (v, i) => [i, v]).filter(([, v]) => v),
}));
const oracle = spawnSync(
  "python",
  ["-B", fileURLToPath(new URL("./bd46_raw_oracle.py", import.meta.url))],
  {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120000,
  },
);
assert.equal(oracle.status, 0, oracle.stderr);
let raw;
try {
  raw = JSON.parse(oracle.stdout);
} catch (error) {
  throw new Error("invalid BD46 oracle JSON", { cause: error });
}
const covered = new Set();
for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i],
    expected = raw[i];
  let workspace;
  const before = Array.from(f.nav);
  const actual = buildOriginalPath(f.nav, f.request, ({ memory }) => {
    workspace = createHash("sha256")
      .update(memory.subarray(0x4000, 0x8800))
      .digest("hex");
  });
  assert.equal(actual.carry, expected.carry, `${f.name}: CF`);
  assert.deepEqual(actual.words, expected.words, `${f.name}: emitted words/AL`);
  if (!actual.carry) {
    assert.equal(actual.words.length, expected.count, `${f.name}: AL count`);
    assert.equal(actual.distance, expected.distance, `${f.name}: DX at BE4A`);
    assert.equal(
      workspace,
      expected.workspace,
      `${f.name}: all distance + ring bytes`,
    );
  }
  assert.deepEqual(
    Array.from(f.nav),
    before,
    "search must not alter live input",
  );
  if (f.expected) assert.deepEqual(actual.words, f.expected);
  if (f.name === "axis-capacity-64") assert.equal(actual.words.length, 64);
  for (const address of expected.addresses) covered.add(address);
  if (f.name.startsWith("vertical-"))
    assert.ok(expected.aliases.length, `${f.name}: actually executed BFDC`);
}
const aliases = raw.flatMap((result) => result.aliases);
for (const node of [0, 0x7ff, 0x800, 0xfff, 0x1000, 0x1fff])
  assert.ok(
    aliases.some(([n]) => n === node),
    `alias partition ${node.toString(16)}`,
  );
assert.ok(
  aliases.some(([, byte, prior]) => byte === 255 && prior === 65535),
  "FFFF destination read before first write",
);
for (const [n, byte, , sourceDistance] of aliases)
  if (n >= 0x1000) {
    assert.notEqual(
      sourceDistance,
      65535,
      "BE00 cannot expand an unvisited source",
    );
    assert.equal(
      byte,
      sourceDistance & 255,
      "upper BFDC aliases the already-visited lower source, not its destination",
    );
  }
assert.ok(
  aliases.some(([, byte, prior]) => byte !== 255 && prior !== 65535),
  "revisited vertical candidate before overwrite",
);
for (const surcharge of [253, 254, 255]) {
  const sample = raw.find(
    (r) => r.name === `vertical-distance-low-byte-${surcharge}`,
  );
  assert.ok(
    sample.aliases.some(
      ([n, value]) => n === 0x1041 && value === ((surcharge + 2) & 255),
    ),
    "BFDC ignores distance high byte",
  );
}
for (const address of [0xbdad, 0xbdcb, 0xbeb5, 0xbf10, 0xbf13, 0xbfdc, 0xbfe1])
  assert.ok(covered.has(address), `raw branch ${address.toString(16)}`);
console.log(
  `BD46 raw differential OK: ${fixtures.length} fixtures; CF/AL/words, reverse distance+ring bytes, endpoint/ties/alias/gaps/64-word CLC; ${covered.size} raw instruction addresses`,
);
