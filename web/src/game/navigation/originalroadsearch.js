// KI.EXE 491B..4A7A. Native data algorithm, not an instruction emulator.
// Detailed contract: docs/re-notes-march-pathfinding.md, section 3.5.
// This primitive is not yet connected to the strategic movement callers.
// Readers must supply known bytes or throw; missing/old queue bytes are NOT zero.

const u16 = (value) => value & 0xffff;
const nextEntry = (pointer) => u16(pointer + 8) & 0xfbff;

function requireUnsigned(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Invalid original road search ${label}: ${value}`);
  }
  return value;
}

/**
 * 491B's observable AX/BX/CX/CF only; preserved CPU registers are not invented.
 * readGraphByte addresses are graph-segment offsets; readStateByte uses D52.
 * The caller owns mutable graph memory (including scratch/old queue bytes).
 * Writes are immediate, not rolled back on an uncovered read or other failure.
 * Optional observe is diagnostic/read-only; readers reject uncovered bytes.
 * No implicit queue clearing, unbounded-queue replacement, node-visited set,
 * blocked-city rule, RNG consumption, or CF-to-null conversion is performed.
 */
export function searchOriginalRoadMemory({
  start,
  stopB,
  stopC,
  owner,
  readGraphByte,
  writeGraphByte,
  readStateByte,
  observe,
}) {
  requireUnsigned(start, 0xffff, "start");
  requireUnsigned(stopB, 0xffff, "stop B");
  requireUnsigned(stopC, 0xffff, "stop C");
  requireUnsigned(owner, 0xff, "owner");
  // 491B..4924: notably, no memory initialization on this CF=1 return.
  if (start === stopB || start === stopC) {
    return { ax: start, bx: stopB, cx: stopC, cf: true, reason: "shortcut" };
  }

  function readByte(address) {
    return requireUnsigned(readGraphByte(u16(address)), 0xff, "graph byte");
  }
  function readWord(address) {
    return readByte(address) | (readByte(address + 1) << 8);
  }
  function writeByte(address, value) {
    address = u16(address);
    writeGraphByte(address, value & 0xff);
    observe?.({ kind: "write", address, width: 1, value: value & 0xff });
  }
  function writeWord(address, value) {
    address = u16(address);
    value = u16(value);
    writeGraphByte(address, value & 0xff);
    writeGraphByte(u16(address + 1), value >>> 8);
    observe?.({ kind: "write", address, width: 2, value });
  }

  // 4940..4948: 1024 words, not the queue at 8800..8BFF.
  for (let address = 0x8000; address < 0x8800; address += 2) {
    writeWord(address, 0);
  }
  let head = 0x87f8;
  let tail = 0x8800;
  let inputCount = 1; // CL: includes the virtual initial root.
  let outputCount = 0; // CH: byte, NOT clamped to the physical capacity 128.
  let minimum = 0;
  let root = true;

  function expandSlot(slotAddress, nodeCost) {
    slotAddress = u16(slotAddress);
    // 49E3 etc. read the tag before CALL, even for an already visited slot.
    const tag = readWord(slotAddress);
    if (readByte(slotAddress + 0x8000) !== 0) return;
    writeByte(slotAddress + 0x8000, 1);
    const kind = tag & 0xc000;
    if (kind === 0) return;
    const edge = tag & 0x3fff;
    let opposite = readWord(edge + (kind === 0x4000 ? 8 : 6));
    const stride = kind === 0x4000 ? 0xfffc : 4;
    const cost = u16(nodeCost + readByte(edge + 4));
    // 4A43: literal +2 search, not a fabricated four-attempt/blocked return.
    let matchedEdge = readWord(opposite) & 0x3fff;
    while (matchedEdge !== edge) {
      opposite = u16(opposite + 2);
      matchedEdge = readWord(opposite) & 0x3fff;
    }
    if (readByte(opposite + 0x8000) !== 0) return;
    writeByte(opposite + 0x8000, 1);
    const node = opposite & 0xfff8;
    writeWord(tail, node);
    writeWord(tail + 2, cost);
    writeWord(tail + 4, stride);
    writeWord(tail + 6, matchedEdge);
    observe?.({
      kind: "enqueue",
      address: tail,
      node,
      cost,
      stride,
      edge: matchedEdge,
    });
    tail = nextEntry(tail);
    outputCount = (outputCount + 1) & 0xff;
  }

  for (;;) {
    const node = root ? start : readWord(head);
    const cost = root ? 0 : readWord(head + 2);
    root = false;
    if (cost === minimum) {
      // 49B6 is BEFORE city fees and adjacency expansion.
      if (node === stopB || node === stopC) {
        return {
          ax: readWord(head + 4),
          bx: readWord(head + 6),
          cx: cost,
          cf: false,
          reason: "found",
        };
      }
      let nodeCost = cost;
      if (node < 0x600) {
        const faction = requireUnsigned(
          readStateByte(u16(node * 4 + 0x841)),
          0xff,
          "city owner",
        );
        if (faction !== owner) nodeCost = u16(nodeCost + 0xa6) | 0x8000;
        nodeCost = u16(nodeCost + 4);
      }
      for (let slot = 0; slot < 4; slot++) {
        expandSlot(node + slot * 2, nodeCost);
      }
    } else {
      // 4987..4995: preserve the interleaving with freshly enqueued entries.
      // Read/copy later words only after the earlier writes (physical aliases).
      writeWord(tail, node);
      writeWord(tail + 2, cost);
      writeWord(tail + 4, readWord(head + 4));
      writeWord(tail + 6, readWord(head + 6));
      observe?.({ kind: "carry", from: head, address: tail, node, cost });
      tail = nextEntry(tail);
      outputCount = (outputCount + 1) & 0xff;
    }
    head = nextEntry(head);
    inputCount = (inputCount - 1) & 0xff;
    if (inputCount !== 0) continue;
    if (outputCount === 0) {
      // 49A9/49AB prove CL=CH=0; AX retains the last batch minimum.
      return { ax: minimum, bx: 0x800, cx: 0, cf: true, reason: "exhausted" };
    }
    minimum = 0xffff;
    let scan = head;
    for (let count = outputCount; count > 0; count--) {
      const candidate = readWord(scan + 2);
      // 4968 compares; 496C performs a distinct MOV read only when smaller.
      if (candidate < minimum) minimum = readWord(scan + 2);
      scan = nextEntry(scan);
    }
    inputCount = outputCount;
    outputCount = 0;
    observe?.({ kind: "batch", head, tail, inputCount, minimum });
  }
}
