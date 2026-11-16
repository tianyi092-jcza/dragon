// KI 19ED/E48A/E49F, E717..E81B: original graph record encoding.
// A native data codec, not an EXE loader or CPU emulator. See march notes §3.6.
// The graph's lower 32KiB is initialized by E49F; its upper half is NOT.
const GRAPH_BYTES = 0x10000;
const INITIALIZED_END = 0x8000;
// CITY-CAPACITY-1 admission (user-authorized 2026-11-17): node records
// follow the live graph length. Node*8 < 0x800 caps v2 graphs at 256 nodes;
// 192 stays the original-layout count. M257 v3 (plan §9.10.24 V3-A):
// version-3 graphs keep node=slot*8 and all slot arithmetic, but relocate
// regions — node table 0..N*8, EDGE_BASE_V3=align16(N*8), points stay
// 0x2000..0x8000. The search scratch/queue relocation rides with (b).
const MAX_V2_NODE_COUNT = 0x800 / 8;
const EDGE_BASE_V2 = 0x800;
const POINT_BASE = 0x2000;
// v3 scratch [0x8000,0x8000+N*8) must stay below the v3 queue at 0x9000.
const MAX_V3_NODE_COUNT = 0x1000 / 8;
export { MAX_V2_NODE_COUNT, MAX_V3_NODE_COUNT };
/** Admission bound per staged version: v2 keeps the DOS 256-node domain,
 * v3 caps at the 512-node visited-scratch ceiling. Unknown versions get 0
 * so every admission gate fails closed.
 */
export function maxNodesForVersion(version) {
  if (version === 3) return MAX_V3_NODE_COUNT;
  if (version === 2) return MAX_V2_NODE_COUNT;
  return 0;
}
/** Edge-table base per staged version: v2 is the DOS 0x800 constant, v3
 * aligns past the live node table (V3-A). Unknown versions get -1 so
 * address decoders fail closed.
 */
export function edgeBaseForVersion(version, nodeCount) {
  if (version === 3 && Number.isInteger(nodeCount) && nodeCount >= 1)
    return align16(nodeCount * 8);
  if (version === 2) return EDGE_BASE_V2;
  return -1;
}
// Search workspace: v2 clears [0x8000,0x8800) and rings the queue inside
// [0x8800,0x8C00) via &0xFBFF; v3 moves the 128-entry ring to 0x9000.
const SCRATCH_BASE = 0x8000;
const QUEUE_BASE_V2 = 0x8800;
const QUEUE_BASE_V3 = 0x9000;
const QUEUE_RING_BYTES = 128 * 8;
const align16 = (value) => (value + 15) & ~15;

function unsigned(value, maximum, label) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Invalid original road ${label}`);
  }
  return value;
}

/** Search workspace regions for a road layout. v2 returns the original
 * clear range and queue ring; v3 keeps the +0x8000 visited base and moves
 * only the queue ring to 0x9000. Missing/foreign layouts fall back to v2.
 */
export function searchRegionsFor(layout) {
  if (layout?.version === 3) {
    const nodeBytes = layout.nodeCount * 8;
    return { scratchEnd: SCRATCH_BASE + nodeBytes, queueBase: QUEUE_BASE_V3 };
  }
  return { scratchEnd: QUEUE_BASE_V2, queueBase: QUEUE_BASE_V2 };
}

/** Version-parameterized region layout. v2 is byte-identical to the
 * original map; v3 keeps node=slot*8 addressing and only moves the edge
 * base past the live node table. Throws the same asset TypeErrors.
 */
function layoutFor(graph) {
  const version = graph?.version;
  const isV3 = version === 3;
  if (!isV3 && version !== 2) {
    throw new TypeError(
      "Original road memory requires version 2 or 3 and 1..N node records",
    );
  }
  const nodes = graph?.nodes;
  const nodeCount = nodes?.length ?? 0;
  const maxNodes = maxNodesForVersion(version);
  if (!Array.isArray(nodes) || nodeCount < 1 || nodeCount > maxNodes) {
    throw new TypeError(
      `Original road memory requires version ${isV3 ? 3 : 2} and 1..${maxNodes} node records`,
    );
  }
  const edgeBase = edgeBaseForVersion(version, nodeCount);
  return { version: isV3 ? 3 : 2, nodeCount, edgeBase };
}

/** Encode version-2 raw-record fields; this is not full world validation.
 * Does not synthesize tags, point flags, costs or bounds from geometry.
 * Layouts overlapping the search workspace are outside this content profile;
 * rejection is an asset error, not an invented original "blocked" result.
 */
export function createOriginalRoadMemory(graph) {
  const { version, nodeCount, edgeBase } = layoutFor(graph);
  if (
    !Array.isArray(graph.edges) ||
    edgeBase + graph.edges.length * 16 > POINT_BASE
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

  for (let id = 0; id < nodeCount; id++) {
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
    const address = edgeBase + id * 16;
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
      unsigned(edge.source, nodeCount - 1, "source node") * 8,
      "source offset",
    );
    putWord(
      address + 8,
      unsigned(edge.target, nodeCount - 1, "target node") * 8,
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
  // Bind checkpoints to the exact INITIAL graph bytes, not to a mutable JSON
  // object or a caller-provided version label. This is graph RAM identity only;
  // world/scenario/content ownership still belongs to the future integration.
  const initial = bytes.slice(0, INITIALIZED_END);
  const initialGraph = encodeHex(initial);
  function snapshot() {
    const patches = [];
    const changed = (at) =>
      known[at] && (at >= INITIALIZED_END || bytes[at] !== initial[at]);
    for (let address = 0; address < GRAPH_BYTES; ) {
      if (!changed(address)) {
        address++;
        continue;
      }
      const start = address++;
      while (address < GRAPH_BYTES && changed(address)) address++;
      patches.push({
        address: start,
        hex: encodeHex(bytes.subarray(start, address)),
      });
    }
    // Plain detached JSON. Even a known high-half ZERO needs a patch; omitted
    // high-half bytes remain unknown. Low-half writes back to initial may omit.
    return { version: 1, initialGraph, patches };
  }
  // Keep the backing arrays private: unknown allocated bytes must not leak as 0.
  // Writes remain immediate and persistent, including explicitly supplied old RAM.
  // roadLayout carries the version-parameterized regions for search step (b).
  const roadLayout = Object.freeze({
    version,
    nodeCount,
    edgeBase,
    pointBase: POINT_BASE,
  });
  return Object.freeze({ readByte, writeByte, snapshot, roadLayout });
}

function encodeHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Restore a detached RAM checkpoint into a NEW memory instance.
 * Web-only codec, not DOS SAVE format and not yet a production save adapter.
 * E49F initializes only the lower half; 491B clears visited, not the old queue.
 * Revalidate the initial asset, then preserve all supplied runtime writes,
 * including lower-half changes. Do not reapply initial-tag rules to live RAM.
 * No current memory, input graph or checkpoint is modified on failure.
 */
export function restoreOriginalRoadMemory(graph, checkpoint) {
  const memory = createCheckedOriginalRoadMemory(graph);
  if (
    checkpoint?.version !== 1 ||
    checkpoint.initialGraph !== memory.snapshot().initialGraph ||
    !Array.isArray(checkpoint.patches) ||
    checkpoint.patches.length > GRAPH_BYTES
  ) {
    throw new TypeError(
      "Invalid or mismatched original road memory checkpoint",
    );
  }
  let end = 0;
  const decoded = [];
  for (const patch of checkpoint.patches) {
    const address = unsigned(patch?.address, 0xffff, "checkpoint address");
    const hex = patch?.hex;
    if (
      address < end ||
      typeof hex !== "string" ||
      hex.length === 0 ||
      hex.length % 2 !== 0 ||
      hex.length > (GRAPH_BYTES - address) * 2 ||
      !/^[0-9a-f]+$/.test(hex)
    ) {
      throw new TypeError("Invalid original road memory checkpoint patch");
    }
    const values = new Uint8Array(hex.length / 2);
    for (let i = 0; i < values.length; i++) {
      values[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    decoded.push({ address, values });
    end = address + values.length;
  }
  // Validate every range before applying any patch. Only this fresh instance
  // is written; later search failures retain their ordinary partial writes.
  for (const { address, values } of decoded) {
    for (let i = 0; i < values.length; i++) {
      memory.writeByte(address + i, values[i]);
    }
  }
  return memory;
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
  const { nodeCount, edgeBase } = layoutFor(graph);
  const word = (address) =>
    memory.readByte(address) | (memory.readByte(address + 1) << 8);
  const edgeCount = graph.edges.length;
  const edgeEnd = edgeBase + edgeCount * 16;
  const sourceTags = new Uint8Array(edgeCount);
  const targetTags = new Uint8Array(edgeCount);
  for (let id = 0; id < edgeCount; id++) {
    const pointer = edgeBase + id * 16;
    if (word(pointer + 6) === word(pointer + 8)) {
      throw new TypeError(`Original road content has self-loop edge ${id}`);
    }
  }
  for (let node = 0; node < nodeCount; node++) {
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
        pointer < edgeBase ||
        pointer >= edgeEnd ||
        (pointer - edgeBase) % 16 !== 0
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
      const id = (pointer - edgeBase) / 16;
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
