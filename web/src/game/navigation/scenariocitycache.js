// Web capability for exactly D52 city[0..191]+18, not a D52 mirror.
// KI refresh 3F4C and byte DEC 4455/4462; march notes §3.13.
const SIZE = 192;

export function createScenarioCityCache(input, roadCheckpoint, restore) {
  const {
    identity,
    memory: { initialGraph },
  } = roadCheckpoint;
  if (
    input?.version !== 1 ||
    !Array.isArray(input.spans) ||
    input.spans.length > SIZE
  )
    throw new TypeError("Invalid city cache schema");
  if (restore) {
    for (const [group, keys] of [
      ["world", ["id", "revision"]],
      ["content", ["packId", "chapterId", "revision"]],
    ])
      for (const key of keys)
        if (input.identity?.[group]?.[key] !== identity[group][key])
          throw new TypeError("Mismatched city cache identity");
    if (input.initialGraph !== initialGraph)
      throw new TypeError("Mismatched city cache initial graph");
  } else if (
    Object.hasOwn(input, "identity") ||
    Object.hasOwn(input, "initialGraph")
  )
    throw new TypeError("Fresh city cache cannot restore identity");
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
      throw new TypeError("Invalid city cache known span");
    end = address + hex.length / 2;
    for (let at = address; at < end; at++) {
      bytes[at] = parseInt(
        hex.slice((at - address) * 2, (at - address) * 2 + 2),
        16,
      );
      known[at] = 1;
    }
  }
  function slot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= SIZE)
      throw new RangeError(`Uncovered city cache slot: ${index}`);
    return index;
  }
  function readByte(index) {
    slot(index);
    if (!known[index])
      throw new RangeError(`Uncovered city cache byte: ${index}`);
    return bytes[index];
  }
  function writeByte(index, value) {
    slot(index);
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new RangeError("Invalid city cache byte write");
    bytes[index] = value;
    known[index] = 1;
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
