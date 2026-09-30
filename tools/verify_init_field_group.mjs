import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-INIT-1: fixed-slot single-city-owner + single-adjacency full write set,
// ordinary-advisor fresh-once, F23 negative preservation.
// Evidence: city §9 88CC/890A windows (bilateral masks/counts), §9.5 4CF3
// prefix (owner/oldOwner/F23), entity ADVISOR-INIT-1 1AF8..1B25 (DEC once +
// clear attr), admission §3.3 (F18/F23 baselines + 4 F23 skews).
// Read-only input: E:/Dragon/原版/SINARIO.DAT (official benchmark, never
// E:/Dragon/Dragon/SAVE.DAT). All edits apply to in-memory copies; nothing
// is written back. Pure node.
// The 4CF3 capture tail (officers/garrison/capital/extinction) is NOT part
// of an authoring-time init write set and is excluded by design; the 8A1E
// recolor belongs to A-MAP-2 runtime terrain, not chapter bytes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sinario = readFileSync(join(repoRoot, "原版", "SINARIO.DAT"));
assert.equal(sinario.length, 4 * 0x56c0, "official 4-chapter SINARIO.DAT");

const CHAPTER = 0x56c0;
const N_CITIES = 192;
const FACTION_STRIDE = 64;
const N_FACTIONS = 22;
const CITY_STRIDE = 32;
const N_GENERALS = 127;
const GENERAL_STRIDE = 32;

const ch = (c) => sinario.subarray(c * CHAPTER, (c + 1) * CHAPTER);
const factionAt = (b, f) => b.subarray(0x80 + f * FACTION_STRIDE, 0x80 + (f + 1) * FACTION_STRIDE);
const cityAt = (b, i) => b.subarray(0x8c0 + i * CITY_STRIDE, 0x8c0 + (i + 1) * CITY_STRIDE);
const generalAt = (b, i) => b.subarray(0x42c0 + i * GENERAL_STRIDE, 0x42c0 + (i + 1) * GENERAL_STRIDE);

// ---- Baselines (admission §3.3 re-verified, not re-derived). ----
const KNOWN_F23_SKEW = [
  // [chapter, faction, stored, actual]
  [2, 2, 30, 29],
  [2, 3, 11, 12],
  [3, 1, 55, 54],
  [3, 2, 33, 34],
];
for (let c = 0; c < 4; c++) {
  const b = ch(c);
  const byOwner = new Map();
  for (let i = 0; i < N_CITIES; i++) {
    const o = cityAt(b, i)[1];
    byOwner.set(o, (byOwner.get(o) ?? 0) + 1);
  }
  for (let f = 0; f < N_FACTIONS; f++) {
    const stored = factionAt(b, f)[0x23];
    const actual = byOwner.get(f) ?? 0;
    const skew = KNOWN_F23_SKEW.find((s) => s[0] === c && s[1] === f);
    if (skew) assert.equal(stored, skew[2], `ch${c} f${f} stored skew`);
    else assert.equal(stored, actual, `ch${c} f${f} F23 must match`);
    if (skew) assert.equal(actual, skew[3], `ch${c} f${f} actual skew`);
  }
  // F18: active (attr>=0x80) generals by G1C.
  const byFaction = new Map();
  for (let i = 0; i < N_GENERALS; i++) {
    const g = generalAt(b, i);
    if (g[0] >= 0x80) {
      const o = g[0x1c];
      byFaction.set(o, (byFaction.get(o) ?? 0) + 1);
    }
  }
  for (let f = 0; f < N_FACTIONS; f++) {
    assert.equal(factionAt(b, f)[0x18], byFaction.get(f) ?? 0, `ch${c} f${f} F18 must match`);
  }
}
tlog("baselines: F18 88/88 match; F23 match except the 4 known skews (preserved, not fixed)");

// Boundary invariant: attr low4 == foreign-neighbor mask, C1B == popcount.
function boundaryOf(b, i) {
  const c = cityAt(b, i);
  let mask = 0;
  for (let k = 0; k < 4; k++) {
    const n = c[0x1c + k];
    if (n !== 0xff && cityAt(b, n)[1] !== c[1]) mask |= 1 << k;
  }
  return mask;
}
function assertBoundary(b, i, label) {
  const c = cityAt(b, i);
  const mask = boundaryOf(b, i);
  assert.equal(c[0] & 15, mask, `${label} city ${i} C00 low4`);
  assert.equal(c[0x1b], mask.toString(2).replace(/0/g, "").length, `${label} city ${i} C1B`);
}
{
  const b = ch(0);
  for (let i = 0; i < N_CITIES; i++) assertBoundary(b, i, "ch0 baseline");
}
tlog("baselines: ch0 all 192 cities satisfy C00-low4/C1B invariant");

// ---- 890A bilateral sync on an in-memory chapter copy (city §9 windows). ----
// Mirror of 88E9..895C: for pair (C slot kc, N slot kn): find reverse slot;
// missing reverse (891E) => no mask changes. Different owners => set bits +
// INC counts when bit was clear (8925..893C, no diplomacy check). Same owner
// => clear bits + DEC counts when bit was set (893D..895C).
function syncPair(b, ci, kc, ni, kn, log) {
  const C = cityAt(b, ci);
  const N = cityAt(b, ni);
  // Reverse lookup: N side slot pointing back at ci (890A..891E).
  let dh = 1;
  let found = -1;
  for (let j = 0; j < 4; j++) {
    if (N[0x1c + j] === ci) {
      found = j;
      break;
    }
    dh <<= 1;
  }
  void kn;
  if (found < 0) {
    log.push(`pair C${ci}[${kc}]<->N${ni}: no reverse pointer, 891E no-op`);
    return;
  }
  const dl = 1 << kc;
  dh = 1 << found;
  if (C[1] !== N[1]) {
    if (!(N[0] & dh)) {
      N[0x1b]++;
      N[0] |= dh;
      log.push(`N${ni} +frontier=${N[0x1b]} set bit${found}`);
    }
    if (!(C[0] & dl)) {
      C[0x1b]++;
      C[0] |= dl;
      log.push(`C${ci} +frontier=${C[0x1b]} set bit${kc}`);
    }
  } else {
    if (N[0] & dh) {
      N[0x1b]--;
      N[0] &= ~dh;
      log.push(`N${ni} -frontier=${N[0x1b]} clear bit${found}`);
    }
    if (C[0] & dl) {
      C[0x1b]--;
      C[0] &= ~dl;
      log.push(`C${ci} -frontier=${C[0x1b]} clear bit${kc}`);
    }
  }
}

// Owner-change write set (§9.5 4CF3 prefix subset for authoring init).
function ownerChangeTx(b, ci, newOwner, log) {
  const C = cityAt(b, ci);
  const oldOwner = C[1];
  assert.notEqual(oldOwner, newOwner);
  C[1] = newOwner; // 4CF5 XCHG owner
  C[0x1a] = oldOwner; // 4CF8 oldOwner
  log.push(`C${ci} owner ${oldOwner}->${newOwner}, oldOwner=${oldOwner}`);
  factionAt(b, newOwner)[0x23]++; // 4D2A INC new F23
  factionAt(b, oldOwner)[0x23]--; // 4CF3 old-owner DEC (capture prefix)
  log.push(`F23[${newOwner}]++, F23[${oldOwner}]--`);
  for (let k = 0; k < 4; k++) {
    const n = C[0x1c + k];
    if (n === 0xff) continue;
    syncPair(b, ci, k, n, -1, log);
  }
}

// Pick a ch0 city with a foreign neighbor: X=its owner, Y=neighbor owner.
const b0 = Buffer.from(ch(0));
let targetCity = -1;
let target = -1;
let newOwner = -1;
let c0owner = -1;
for (let i = 0; i < N_CITIES && target < 0; i++) {
  const owner = cityAt(b0, i)[1];
  for (let k = 0; k < 4; k++) {
    const n = cityAt(b0, i)[0x1c + k];
    if (n !== 0xff && cityAt(b0, n)[1] !== owner) {
      targetCity = i;
      target = n;
      newOwner = cityAt(b0, n)[1];
      c0owner = owner;
      break;
    }
  }
}
assert.ok(target >= 0, "ch0 must contain a foreign-neighbor city");
const f23Before = [];
for (let f = 0; f < N_FACTIONS; f++) f23Before[f] = factionAt(b0, f)[0x23];
const log1 = [];
ownerChangeTx(b0, targetCity, newOwner, log1);
tlog(`ownerChangeTx city${targetCity} ${c0owner}->${newOwner}:`);
for (const line of log1) tlog(`  ${line}`);
// Ledger check: every F23 == baseline + delta (skew preserved exactly).
for (let f = 0; f < N_FACTIONS; f++) {
  const delta = (f === newOwner ? 1 : 0) - (f === c0owner ? 1 : 0);
  assert.equal(factionAt(b0, f)[0x23], f23Before[f] + delta, `F23[${f}] ledger`);
}
// Boundary invariant restored on all affected cities; bytes elsewhere identical.
{
  const orig = ch(0);
  const affected = new Set([targetCity]);
  for (let k = 0; k < 4; k++) {
    const n = cityAt(b0, targetCity)[0x1c + k];
    if (n !== 0xff) affected.add(n);
  }
  for (const i of affected) assertBoundary(b0, i, "owner-tx");
  for (let i = 0; i < N_CITIES; i++) {
    if (affected.has(i)) continue;
    assert.ok(cityAt(b0, i).equals(cityAt(orig, i)), `city ${i} untouched`);
  }
  for (let f = 0; f < N_FACTIONS; f++) {
    if (f === newOwner || f === c0owner) continue;
    assert.ok(factionAt(b0, f).equals(factionAt(orig, f)), `faction ${f} untouched`);
  }
}
tlog("owner change: ledger exact, invariant restored, untouched bytes identical");

// ---- Adjacency replacement: C[k] N_old -> N_new, both sides indexed. ----
// Index-byte management is an authoring operation (no original edit path);
// mask sync reuses the 890A rules above (missing-reverse no-op included).
function adjacencyReplaceTx(b, ci, k, nNew, log) {
  const C = cityAt(b, ci);
  const nOld = C[0x1c + k];
  assert.notEqual(nOld, 0xff, "replaced slot must be linked");
  assert.notEqual(nNew, 0xff);
  // Detach old reverse pointer(s).
  const Nold = cityAt(b, nOld);
  for (let j = 0; j < 4; j++) {
    if (Nold[0x1c + j] === ci) {
      Nold[0x1c + j] = 0xff;
      log.push(`N${nOld}[${j}] reverse cleared`);
    }
  }
  // Clear bilateral bits for the severed pair (mask-clear path).
  const dl = 1 << k;
  if (C[0] & dl) {
    C[0] &= ~dl;
    C[0x1b]--;
    log.push(`C${ci} clear bit${k} (severed)`);
  }
  // Attach: C[k] = N_new; N_new free slot (FF) points back at C.
  C[0x1c + k] = nNew;
  const Nnew = cityAt(b, nNew);
  let rev = -1;
  for (let j = 0; j < 4; j++) {
    if (Nnew[0x1c + j] === 0xff) {
      rev = j;
      break;
    }
  }
  assert.ok(rev >= 0, `N${nNew} must have a free neighbor slot`);
  Nnew[0x1c + rev] = ci;
  log.push(`C${ci}[${k}]=N${nNew}, N${nNew}[${rev}]=C${ci}`);
  syncPair(b, ci, k, nNew, rev, log);
  // Re-derive N_old mask bits for its remaining slots.
  for (let j = 0; j < 4; j++) {
    const m = Nold[0x1c + j];
    if (m === 0xff) {
      if (Nold[0] & (1 << j)) {
        Nold[0] &= ~(1 << j);
        Nold[0x1b]--;
        log.push(`N${nOld} clear dangling bit${j}`);
      }
      continue;
    }
    void m;
  }
}

// Ch0: replace targetCity slot k (foreign) with a same-owner city far away.
const b1 = Buffer.from(ch(0));
const ci1 = targetCity;
const owner1 = cityAt(b1, ci1)[1];
let kk = -1;
for (let k = 0; k < 4; k++) {
  const n = cityAt(b1, ci1)[0x1c + k];
  if (n !== 0xff && cityAt(b1, n)[1] !== owner1) {
    kk = k;
    break;
  }
}
assert.ok(kk >= 0);
const nOld = cityAt(b1, ci1)[0x1c + kk];
let nNew = -1;
for (let i = 0; i < N_CITIES; i++) {
  if (i === ci1 || i === nOld) continue;
  const c = cityAt(b1, i);
  if (c[1] === owner1 && [...c.subarray(0x1c, 0x20)].includes(0xff)) {
    // Must not already neighbor ci1 (keeps reverse lookup unique).
    if (![...c.subarray(0x1c, 0x20)].includes(ci1)) {
      nNew = i;
      break;
    }
  }
}
assert.ok(nNew >= 0, "need a same-owner city with a free slot");
const log2 = [];
adjacencyReplaceTx(b1, ci1, kk, nNew, log2);
tlog(`adjacencyReplaceTx city${ci1}[${kk}] N${nOld}->N${nNew}:`);
for (const line of log2) tlog(`  ${line}`);
// Global invariant must hold for every city after the replacement.
for (let i = 0; i < N_CITIES; i++) assertBoundary(b1, i, "adj-tx");
tlog("adjacency replacement: all 192 cities satisfy the invariant");

// ---- Advisor fresh-once (entity ADVISOR-INIT-1, 1AF8..1B25). ----
function freshAdvisorTx(b, factionIdx, advisorIdx, log) {
  // 1AFD AH=[BX+2] advisor ref; 1B00/1B03 skip DEC only when 7F;
  // 1B12 clears the advisor general attr whole byte in both branches.
  if (advisorIdx !== 0x7f) {
    const f = factionAt(b, factionIdx);
    assert.ok(f[0x18] > 0, "F18 must not wrap");
    f[0x18]--;
    log.push(`F18[${factionIdx}]--`);
  } else {
    log.push("advisor 7F: no F18 write");
  }
  generalAt(b, advisorIdx === 0x7f ? 127 : advisorIdx)[0] = 0;
  log.push(`general[${advisorIdx === 0x7f ? 127 : advisorIdx}].attr=0`);
}
{
  // Normal advisor: use faction 0's advisor ref from chapter bytes (+2).
  const b2 = Buffer.from(ch(0));
  const advRef = factionAt(b2, 0)[2];
  assert.ok(advRef !== 0x7f && advRef < N_GENERALS, "ch0 faction 0 has an ordinary advisor");
  const f18Before = factionAt(b2, 0)[0x18];
  const before = Buffer.from(b2);
  const log3 = [];
  freshAdvisorTx(b2, 0, advRef, log3);
  assert.equal(factionAt(b2, 0)[0x18], f18Before - 1, "exactly one DEC");
  assert.equal(generalAt(b2, advRef)[0], 0, "advisor attr cleared");
  let changed = 0;
  for (let i = 0; i < b2.length; i++) if (b2[i] !== before[i]) changed++;
  assert.equal(changed, 2, "fresh write set is exactly {F18, attr}");
  tlog(`freshAdvisorTx normal: ${log3.join("; ")} (2 bytes changed)`);
  const b3 = Buffer.from(ch(0));
  const log4 = [];
  freshAdvisorTx(b3, 0, 0x7f, log4);
  assert.equal(factionAt(b3, 0)[0x18], factionAt(ch(0), 0)[0x18], "7F path keeps F18");
  tlog(`freshAdvisorTx 7F: ${log4.join("; ")}`);
}

// Compile pipeline must not pre-decrement any F18 (code fact).
{
  const { readFileSync: read } = await import("node:fs");
  const src = read(
    new URL("../web/src/content/authoring/mapcompile.js", import.meta.url),
    "utf-8",
  );
  assert.ok(!/faction/i.test(src), "mapcompile performs no faction writes");
  tlog("code fact: mapcompile.js contains no faction writes (no early F18 DEC)");
}

tlog("A-INIT-1: owner write set + adjacency write set + fresh-once + F23 negatives OK");
