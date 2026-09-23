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

// C18 初值实锤：8CAE 把记录 0x8C0 起的 192×32 城记录整体载入 D52:0840
// （含 +0x18），89F0 不写 C18；故 fresh 缓存 = 各城记录 byte+0x18
// （P37 已把 nativeCityRecordRaw 挂进生产内容）。缺 raw 即 fail-closed。
// 3F06/3F11/3FAB/3FD4/4028/88CC fresh inputs（P58 flip）：同一批记录就是
// live 结构体，故 fresh 冷却 C17（+0x17，20章3840条全零）、旧 owner
// （+0x1A，按城各异的官方字节，不等于实时 owner——807条不同）、C1B
// border count（+0x1B）、C1C 邻接槽（+0x1C..+0x1F）与 attr（+0x00，低
// nibble=已 bake 的 border bits）直接取记录字节，不回填。App fresh v2
// 首 tick 即走 refreshOriginalCityCache/military，两字段严格必需。
export function initializeScenarioCityNativeInputs(scenario) {
  const records = scenario?.nativeCityRecordRaw;
  const cities = scenario?.cities;
  if (!Array.isArray(cities) || cities.length !== SIZE)
    throw new RangeError("Web engineering Uncovered fresh city table");
  // Explicit caller inputs win; record bytes fill only absent fields.
  // Real chapters always lack these fields at fresh (createNewGameScenario
  // deletes disaster_event; the rest are never parsed), so production
  // fresh fills everything while detached fixtures keep explicit values.
  const needRaw = (city) =>
    city._aiCooldown === undefined ||
    city._strategicLastFaction === undefined ||
    city.strategicBorderCount === undefined ||
    city.strategicNeighbours === undefined ||
    city.attr === undefined ||
    city.disaster_event === undefined;
  let rawChecked = false;
  const rawByte = (entry, offset) =>
    parseInt(entry.slice(offset * 2, offset * 2 + 2), 16);
  for (let index = 0; index < SIZE; index++) {
    const city = cities[index];
    if (!city || city.idx !== index)
      throw new RangeError("Web engineering Uncovered fresh city slot");
    if (!needRaw(city)) continue;
    if (!rawChecked) {
      if (!Array.isArray(records) || records.length !== SIZE)
        throw new RangeError(
          "Web engineering Uncovered fresh city tick source records",
        );
      rawChecked = true;
    }
    const entry = records[index];
    if (typeof entry !== "string" || !/^[0-9a-fA-F]{64}$/.test(entry))
      throw new RangeError(
        "Web engineering Uncovered native city record raw at fresh init",
      );
    if (city._aiCooldown === undefined)
      city._aiCooldown = rawByte(entry, 0x17);
    if (city._strategicLastFaction === undefined)
      city._strategicLastFaction = rawByte(entry, 0x1a);
    // 3FAB/3FD4 border inputs: C1B count (+0x1B) and the four ordered
    // neighbour slots C1C..1F (+0x1C..+0x1F, 0xFF-terminated in raw).
    // 4028/88CC attr byte IS record +0x00 (low nibble = baked border
    // bits, 3839/3840 consistent with +0x1B; the single ch8/city162
    // 0x64 quirk is copied verbatim, never reinterpreted).
    if (city.strategicBorderCount === undefined)
      city.strategicBorderCount = rawByte(entry, 0x1b);
    if (city.strategicNeighbours === undefined)
      city.strategicNeighbours = [0x1c, 0x1d, 0x1e, 0x1f].map((offset) =>
        rawByte(entry, offset),
      );
    if (city.attr === undefined) city.attr = rawByte(entry, 0);
    if (city.disaster_event === undefined)
      city.disaster_event = rawByte(entry, 0x15);
    // 4269 C15 灾害强度（+0x15，20章3840条全零）：每日 damageOriginalCity
    // 严格消费，fresh 即显式置记录值（全零），不依赖缺失语义。
  }
}
export function synthesizeScenarioCityCache(scenario) {
  const records = scenario?.nativeCityRecordRaw;
  if (!Array.isArray(records) || records.length !== SIZE)
    throw new RangeError(
      "Web engineering Uncovered fresh city cache source records",
    );
  let hex = "";
  for (const entry of records) {
    if (typeof entry !== "string" || !/^[0-9a-fA-F]{64}$/.test(entry))
      throw new RangeError(
        "Web engineering Uncovered native city record raw at fresh init",
      );
    hex += entry.slice(0x18 * 2, 0x18 * 2 + 2);
  }
  return { version: 1, spans: [{ address: 0, hex }] };
}
