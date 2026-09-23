// Scenario-owned D44 rules terrain, NOT 9872 occupancy or a rendered PNG.
// Explicit known bytes only; source/alias/JSON contract: legion-fate notes §12.
const SIZE = 384 * 256;
const own = (value, key) => value != null && Object.hasOwn(value, key);

export function createScenarioTerrainMemory(
  input,
  identity,
  initialTerrain,
  restore,
) {
  if (
    !own(input, "version") ||
    input.version !== 1 ||
    !own(input, "spans") ||
    !Array.isArray(input.spans) ||
    input.spans.length > SIZE
  )
    throw new TypeError("Invalid terrain memory schema");
  if (
    typeof initialTerrain !== "string" ||
    initialTerrain.length !== SIZE * 2 ||
    !/^[0-9a-f]+$/.test(initialTerrain)
  )
    throw new TypeError("Invalid initial terrain identity");
  if (restore) {
    for (const [group, keys] of [
      ["world", ["id", "revision"]],
      ["content", ["packId", "chapterId", "revision"]],
    ])
      for (const key of keys) {
        if (
          !own(input.identity?.[group], key) ||
          input.identity[group][key] !== identity[group][key]
        )
          throw new TypeError("Mismatched terrain memory identity");
      }
    if (
      !own(input, "initialTerrain") ||
      input.initialTerrain !== initialTerrain
    )
      throw new TypeError("Mismatched initial terrain");
  } else if (own(input, "identity") || own(input, "initialTerrain")) {
    throw new TypeError("Fresh terrain memory cannot restore identity");
  }
  identity = structuredClone(identity);
  const bytes = new Uint8Array(SIZE),
    known = new Uint8Array(SIZE);
  let end = 0;
  for (const span of input.spans) {
    const { address, hex } = span ?? {};
    if (
      !own(span, "address") ||
      !own(span, "hex") ||
      !Number.isInteger(address) ||
      address < end ||
      address < 0 ||
      typeof hex !== "string" ||
      !/^(?:[0-9a-fA-F]{2})+$/.test(hex) ||
      hex.length > SIZE * 2 ||
      address + hex.length / 2 > SIZE
    )
      throw new TypeError("Invalid terrain known span");
    end = address + hex.length / 2;
    for (let at = address; at < end; at++) {
      bytes[at] = parseInt(
        hex.slice((at - address) * 2, (at - address) * 2 + 2),
        16,
      );
      known[at] = 1;
    }
  }
  function addressOf(address) {
    if (!Number.isInteger(address) || address < 0 || address >= SIZE)
      throw new RangeError(`Uncovered terrain address: ${address}`);
    return address;
  }
  function readByte(address) {
    addressOf(address);
    if (!known[address])
      throw new RangeError(`Uncovered terrain byte: ${address}`);
    return bytes[address];
  }
  function writeByte(address, value) {
    addressOf(address);
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new RangeError("Invalid terrain byte write");
    bytes[address] = value;
    known[address] = 1;
  }
  function readTile(x, y) {
    if (
      !Number.isInteger(x) ||
      x < 0 ||
      x >= 384 ||
      !Number.isInteger(y) ||
      y < 0 ||
      y >= 256
    )
      throw new RangeError(`Uncovered terrain coordinates: ${x},${y}`);
    return readByte(y * 384 + x);
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
      initialTerrain,
      spans,
    };
  }
  return Object.freeze({ readByte, writeByte, readTile, snapshot });
}
