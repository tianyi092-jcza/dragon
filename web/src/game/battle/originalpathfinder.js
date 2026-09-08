// KI.EXE BD46..BFF1; VA=file offset-200h. Native translation, not Dijkstra.
// D2FC +4000 aliases D300 distance words; +8000 is its 4000..47FF ring.
// See docs/re-notes-tactical-lifecycle.md for raw differential scope.
import { ORIGINAL_NAV_COST_BASE } from "./originalnavigation.js";

const u16 = (value) => value & 0xffff;
const DIRECTIONS = [
  { bit: 0x10, delta: -2, axis: 0, x: -1, y: 0 },
  { bit: 0x20, delta: 2, axis: 0, x: 1, y: 0 },
  { bit: 0x40, delta: -0x80, axis: 1, x: 0, y: -1 },
  { bit: 0x80, delta: 0x80, axis: 1, x: 0, y: 1 },
];
const indexOf = (word) => (word & 0xff) + ((word >>> 8) & 0xff) * 64;

/** BD46: target-seeded, tick-scanned ring; debug receives the private workspace. */
export function buildOriginalPath(navigation, request, debug = null) {
  if (!navigation || navigation.length < ORIGINAL_NAV_COST_BASE + 0x1000)
    throw new TypeError("original pathfinder requires navigation/cost bytes");
  for (const word of [request.current, request.target]) {
    if ((word & 0xff) >= 64 || ((word >>> 8) & 0xff) >= 64)
      return { carry: true, words: [], reason: "coordinate" };
  }
  // One shared byte view is essential: BFDC reads a byte of *current* distance,
  // not a cached edge weight. No persistent rule state/RNG is changed here.
  const memory = new Uint8Array(0x10000);
  memory.set(navigation.subarray(0, 0x4000));
  memory.fill(0xff, 0x4000, 0x8000); // BD7C/BD82: 2000 words.
  const read = (offset) => memory[u16(offset)];
  const word = (offset) => read(offset) | (read(offset + 1) << 8);
  const write = (offset, value) => {
    memory[u16(offset)] = value;
    memory[u16(offset + 1)] = value >>> 8;
  };
  const cost = (bx) => word(0x4000 + u16(bx));
  const setCost = (bx, value) => write(0x4000 + u16(bx), value);
  let bx = indexOf(request.target);
  const stop = u16(
    (indexOf(request.current) | ((request.layer ?? 0) << 8)) * 2,
  );
  // BDAD/BDCB keep the adjusted BX, not merely the chosen plane.
  const endpoint = (base) =>
    [base, u16(base + 1), u16(base - 1)].find(
      (node) => (read(node) & 0xf0) !== 0,
    );
  const upper =
    request.endpointPolicy === 0 && request.mask !== 0xeb
      ? endpoint(bx | 0x1000)
      : undefined;
  bx = upper ?? endpoint(bx);
  if (bx === undefined) return { carry: true, words: [], reason: "endpoint" };
  bx *= 2;
  setCost(bx, 1);
  if (bx === stop) return { carry: true, words: [], reason: "same-position" };
  let si = 0x4000,
    di = 0x4000,
    boundary = 0x4000,
    dx = 2;
  const enqueue = (node) => {
    write(0x4000 + si, node);
    si = (si + 2) & 0x47ff;
  };
  // BE00 compares DX, not the proposed weighted value: a later scan may
  // overwrite with a larger cost and enqueue a duplicate. Preserve that order.
  for (;;) {
    if (dx <= cost(bx)) enqueue(bx);
    else {
      const descriptor = read(bx >>> 1);
      for (const direction of DIRECTIONS) {
        if (!(descriptor & direction.bit)) continue;
        const next = u16(bx + direction.delta);
        if (dx >= cost(next)) continue;
        setCost(next, dx + read(0x2000 + (next >>> 1)));
        enqueue(next);
      }
      if (request.mask !== 0xeb && descriptor & 8) {
        const next = bx ^ 0x2000;
        if (dx < cost(next)) {
          const difference = Math.abs(
            (descriptor & 7) - (read(next >>> 1) & 7),
          );
          // BFCD restores doubled BX BEFORE BFDC; upper node aliases the
          // visited lower-source distance low byte. BE00 cannot expand FFFF;
          // alias byte FF can instead come from visited 00FF/01FF, etc.
          const value = u16(dx + difference + read(0x2000 + next));
          setCost(next, value);
          enqueue(next);
        }
      }
    }
    if (di === boundary) {
      dx = u16(dx + 1);
      boundary = si;
      if (si === di) return { carry: true, words: [], reason: "unreachable" };
    }
    bx = word(0x4000 + di);
    di = (di + 2) & 0x47ff;
    if (bx === stop) break; // BDF9 before cost test / next boundary increment.
  }
  const distance = dx; // Observed DX at BE4A; not an original public result.
  debug?.({ memory, distance, stop, queueHead: di, queueTail: si });
  const visited = Array.from({ length: 0x2000 }, (_, n) => cost(n * 2)).reduce(
    (n, value) => n + (value !== 0xffff),
    0,
  );
  dx = u16(dx - 2);
  bx = u16(bx + 0x4000);
  let ax = request.current,
    axis = 0,
    initial = true;
  const words = [];
  const emit = (value) => {
    words.push(u16(value));
    return words.length === 64;
  };
  // BE5A..BF23: follow decreasing DX, preserve axis, emit at axis changes
  // (even a cost gap), retry gaps, and succeed with a 64-word prefix.
  for (;;) {
    let selected;
    if (initial) {
      selected = DIRECTIONS.find((d) => word(bx + d.delta) === dx);
      axis = selected?.axis ?? 1;
    } else {
      selected = DIRECTIONS.find(
        (d) => d.axis === axis && word(bx + d.delta) === dx,
      );
      if (!selected) {
        axis ^= 1;
        if (emit(ax)) break;
        selected = DIRECTIONS.find(
          (d) => d.axis === axis && word(bx + d.delta) === dx,
        );
      }
    }
    if (selected) {
      ax =
        (((ax & 0xff) + selected.x) & 0xff) |
        ((((ax >>> 8) + selected.y) & 0xff) << 8);
      bx = u16(bx + selected.delta);
      dx = u16(dx - 1);
      if (!dx) {
        emit(ax);
        break;
      }
      initial = false;
      continue;
    }
    // BEEA always reads the upper descriptor. BEF5 toggles BX even when
    // BEFA rejects the transition; neither behavior can be generalized away.
    const upperDescriptor = read(((bx >>> 1) & 0xfff) + 0x1000);
    if (upperDescriptor & 8) {
      bx ^= 0x2000;
      if (dx >= word(bx)) {
        dx = word(bx);
        const level = upperDescriptor & 7;
        if (emit(0x80 | (((bx & 0x2000 ? level : -level) & 0xff) << 8))) break;
      }
    }
    dx = u16(dx - 1); // BF10/BF13 retry, never reject a weighted gap.
    if (!dx) break;
    initial = true;
  }
  return { carry: false, words, distance, visited };
}

export function createOriginalPathBuilder(navigation) {
  return (request) => buildOriginalPath(navigation, request);
}
