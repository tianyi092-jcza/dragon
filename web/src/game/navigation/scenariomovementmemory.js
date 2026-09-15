// Web canonical occupancy plane, not a DOS segment emulator. March notes §3.12.
// Explicit known spans only: no initialization from coordinates or legion counts.
const SIZE = 384 * 256;

export function movementPlaneAddress(rowParagraph, offset) {
  if (
    !Number.isInteger(rowParagraph) ||
    rowParagraph < 0 ||
    rowParagraph > 24 * 255 ||
    rowParagraph % 24 !== 0 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset >= 384
  )
    throw new RangeError(
      `Uncovered movement pointer: ${rowParagraph}:${offset}`,
    );
  return rowParagraph * 16 + offset;
}

export function createScenarioMovementMemory(input, roadCheckpoint, restore) {
  const identity = roadCheckpoint.identity;
  const initialGraph = roadCheckpoint.memory.initialGraph;
  if (
    input?.version !== 1 ||
    !Array.isArray(input.spans) ||
    input.spans.length > SIZE
  )
    throw new TypeError("Invalid movement memory schema");
  if (restore) {
    for (const [group, keys] of [
      ["world", ["id", "revision"]],
      ["content", ["packId", "chapterId", "revision"]],
    ]) {
      for (const key of keys) {
        if (input.identity?.[group]?.[key] !== identity[group][key])
          throw new TypeError("Mismatched movement memory identity");
      }
    }
    if (input.initialGraph !== initialGraph)
      throw new TypeError("Mismatched movement initial graph");
  } else if (
    Object.hasOwn(input, "identity") ||
    Object.hasOwn(input, "initialGraph")
  ) {
    throw new TypeError("Fresh movement memory cannot restore identity");
  }
  const bytes = new Uint8Array(SIZE),
    known = new Uint8Array(SIZE);
  let end = 0;
  for (const span of input.spans) {
    const { address, hex } = span ?? {};
    if (
      !Number.isInteger(address) ||
      address < end ||
      address < 0 ||
      typeof hex !== "string" ||
      !/^(?:[0-9a-fA-F]{2})+$/.test(hex) ||
      hex.length > SIZE * 2 ||
      address + hex.length / 2 > SIZE
    )
      throw new TypeError("Invalid movement known span");
    end = address + hex.length / 2;
    for (let at = address; at < end; at++) {
      bytes[at] = parseInt(
        hex.slice((at - address) * 2, (at - address) * 2 + 2),
        16,
      );
      known[at] = 1;
    }
  }
  function readByte(row, offset) {
    const at = movementPlaneAddress(row, offset);
    if (!known[at]) throw new RangeError(`Uncovered movement byte: ${at}`);
    return bytes[at];
  }
  function writeByte(row, offset, value) {
    const at = movementPlaneAddress(row, offset);
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new RangeError("Invalid movement byte write");
    bytes[at] = value;
    known[at] = 1;
  }
  function snapshot() {
    const spans = [];
    for (let at = 0; at < SIZE; ) {
      if (!known[at]) {
        at++;
        continue;
      }
      const address = at;
      let hex = "";
      while (at < SIZE && known[at])
        hex += bytes[at++].toString(16).padStart(2, "0");
      spans.push({ address, hex });
    }
    return {
      version: 1,
      identity: structuredClone(identity),
      initialGraph,
      spans,
    };
  }
  return Object.freeze({ readByte, writeByte, snapshot });
}
