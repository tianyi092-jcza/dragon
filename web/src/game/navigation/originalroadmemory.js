// KI 19ED/E48A/E49F, E717..E81B: original graph record encoding.
// A native data codec, not an EXE loader or CPU emulator. See march notes §3.6.
// The graph's lower 32KiB is initialized by E49F; its upper half is NOT.
const GRAPH_BYTES = 0x10000;
const INITIALIZED_END = 0x8000;
const NODE_COUNT = 192;
const EDGE_BASE = 0x800;
const POINT_BASE = 0x2000;

function unsigned(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Invalid original road ${label}`);
  }
  return value;
}

/** Encode version-2 raw-record fields; this is not full world validation.
 * Does not synthesize tags, point flags, costs or bounds from geometry.
 * Layouts overlapping the search workspace are outside this content profile;
 * rejection is an asset error, not an invented original "blocked" result.
 */
export function createOriginalRoadMemory(graph) {
  if (
    graph?.version !== 2 ||
    !Array.isArray(graph.nodes) ||
    graph.nodes.length !== NODE_COUNT
  ) {
    throw new TypeError(
      "Original road memory requires version 2 and 192 node records",
    );
  }
  if (
    !Array.isArray(graph.edges) ||
    EDGE_BASE + graph.edges.length * 16 > POINT_BASE
  ) {
    throw new TypeError("Original road edge records overlap the point region");
  }
  const bytes = new Uint8Array(GRAPH_BYTES);
  const known = new Uint8Array(GRAPH_BYTES);
  known.fill(1, 0, INITIALIZED_END); // E49F: ES=graph, AX=DI=0, CX=4000, REP STOSW.

  function readByte(address) {
    unsigned(address, 0xffff, "byte address");
    if (!known[address]) {
      throw new Error(`Unprovided original road byte ${address.toString(16)}`);
    }
    return bytes[address];
  }
  function writeByte(address, value) {
    unsigned(address, 0xffff, "byte address");
    unsigned(value, 0xff, "byte value");
    bytes[address] = value;
    known[address] = 1;
  }
  function putWord(address, value, label) {
    unsigned(value, 0xffff, label);
    writeByte(address, value & 0xff);
    writeByte(address + 1, value >>> 8);
  }

  for (let id = 0; id < NODE_COUNT; id++) {
    const node = graph.nodes[id];
    if (
      node?.id !== id ||
      !Array.isArray(node.edgeSlots) ||
      node.edgeSlots.length !== 4
    ) {
      throw new TypeError(
        `Original road node ${id} requires four ordered tag words`,
      );
    }
    for (let slot = 0; slot < 4; slot++) {
      putWord(id * 8 + slot * 2, node.edgeSlots[slot], "tag word");
    }
  }
  let pointAddress = POINT_BASE;
  for (let id = 0; id < graph.edges.length; id++) {
    const edge = graph.edges[id];
    if (
      edge?.id !== id ||
      !Array.isArray(edge.points) ||
      edge.points.length === 0
    ) {
      throw new TypeError(`Invalid original road edge ${id}`);
    }
    if (pointAddress + edge.points.length * 4 > INITIALIZED_END) {
      throw new TypeError(
        "Original road point records overlap the search workspace",
      );
    }
    const address = EDGE_BASE + id * 16;
    putWord(address, pointAddress, "first point");
    putWord(
      address + 2,
      pointAddress + (edge.points.length - 1) * 4,
      "last point",
    );
    writeByte(address + 4, edge.weight); // E7AE: BYTE, not a derived Web distance.
    // +5 remains the E49F initializer's zero; E77D..E81B does not write it.
    putWord(
      address + 6,
      unsigned(edge.source, NODE_COUNT - 1, "source node") * 8,
      "source offset",
    );
    putWord(
      address + 8,
      unsigned(edge.target, NODE_COUNT - 1, "target node") * 8,
      "target offset",
    );
    putWord(address + 10, edge.bounds?.minX, "minimum X");
    putWord(address + 12, edge.bounds?.maxX, "maximum X");
    writeByte(address + 14, edge.bounds?.minY);
    writeByte(address + 15, edge.bounds?.maxY);
    for (const point of edge.points) {
      putWord(pointAddress, point?.x, "point X");
      writeByte(pointAddress + 2, point?.y);
      writeByte(pointAddress + 3, point?.flags);
      pointAddress += 4;
    }
  }
  // Keep the backing arrays private: unknown allocated bytes must not leak as 0.
  // Writes remain immediate and persistent, including explicitly supplied old RAM.
  return Object.freeze({ readByte, writeByte });
}

/** Encode and check the initial reciprocal-tag contract of v2 content.
 * E717/P04 provides one 4000 source slot and one 8000 target slot per edge.
 * 4A21..4A4E consumes the low-14-bit edge pointer and scans for its reverse slot
 * without a four-slot limit. Bad assets must not reach that scan by accident.
 * This is content rejection, NOT KI's behavior for arbitrary malformed RAM.
 * Does not certify connectivity, the default-map 127-item bound, coordinates,
 * terrain/flags semantics, caller addresses, or absence of later RAM writes.
 */
export function createCheckedOriginalRoadMemory(graph) {
  const memory = createOriginalRoadMemory(graph);
  const word = (address) =>
    memory.readByte(address) | (memory.readByte(address + 1) << 8);
  const edgeCount = graph.edges.length;
  const edgeEnd = EDGE_BASE + edgeCount * 16;
  const sourceTags = new Uint8Array(edgeCount);
  const targetTags = new Uint8Array(edgeCount);
  for (let id = 0; id < edgeCount; id++) {
    const pointer = EDGE_BASE + id * 16;
    if (word(pointer + 6) === word(pointer + 8)) {
      throw new TypeError(`Original road content has self-loop edge ${id}`);
    }
  }
  for (let node = 0; node < NODE_COUNT; node++) {
    for (let slot = 0; slot < 4; slot++) {
      const tag = word(node * 8 + slot * 2);
      if (tag === 0) continue;
      const selector = tag & 0xc000;
      if (selector !== 0x4000 && selector !== 0x8000) {
        throw new TypeError(
          `Invalid original road tag selector at ${node}:${slot}`,
        );
      }
      const pointer = tag & 0x3fff;
      if (
        pointer < EDGE_BASE ||
        pointer >= edgeEnd ||
        (pointer - EDGE_BASE) % 16 !== 0
      ) {
        throw new TypeError(
          `Invalid original road edge pointer at ${node}:${slot}`,
        );
      }
      const endpoint = selector === 0x4000 ? 6 : 8;
      if (word(pointer + endpoint) !== node * 8) {
        throw new TypeError(
          `Original road tag endpoint mismatch at ${node}:${slot}`,
        );
      }
      const id = (pointer - EDGE_BASE) / 16;
      const seen = selector === 0x4000 ? sourceTags : targetTags;
      if (seen[id]) {
        throw new TypeError(
          `Original road duplicate endpoint tag for edge ${id}`,
        );
      }
      seen[id] = 1;
    }
  }
  for (let id = 0; id < edgeCount; id++) {
    if (!sourceTags[id] || !targetTags[id]) {
      throw new TypeError(`Original road missing endpoint tag for edge ${id}`);
    }
  }
  // Validation only reads the encoded lower half. The upper half stays unknown.
  return memory;
}
