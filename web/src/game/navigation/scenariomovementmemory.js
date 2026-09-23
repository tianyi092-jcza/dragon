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
  // 1A2D..1A4B 实锤：地图载入后 rep stosw 清零整个 9872 平面
  // （0x8000+0x4000 words = 0x18000 = 384×256 字节）。zeroFilled 输入即
  // 「全平面已知零」，未被 spans 覆盖的字节一律为 0。
  const zeroFilled = input.zeroFilled === true;
  if (input.zeroFilled !== undefined && typeof input.zeroFilled !== "boolean")
    throw new TypeError("Invalid movement zeroFill flag");
  if (zeroFilled) known.fill(1);
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
  // 4C41: canonical unwrapped same-plane DS:SI alias, not a DOS segment
  // emulator. Keep ordinary pointer writes/reads restricted to row offsets.
  function readAliasByte(row, offset) {
    const base = movementPlaneAddress(row, 0);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 65535 ||
      base + offset >= SIZE
    )
      throw new RangeError(`Uncovered movement alias: ${row}:${offset}`);
    const at = base + offset;
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
      if (!known[at] || (zeroFilled && bytes[at] === 0)) {
        at++;
        continue;
      }
      const address = at;
      let hex = "";
      while (at < SIZE && known[at] && (!zeroFilled || bytes[at] !== 0))
        hex += bytes[at++].toString(16).padStart(2, "0");
      spans.push({ address, hex });
    }
    const result = {
      version: 1,
      identity: structuredClone(identity),
      initialGraph,
      spans,
    };
    if (zeroFilled) result.zeroFilled = true;
    return result;
  }
  return Object.freeze({ readByte, readAliasByte, writeByte, snapshot });
}

// 89F0→8AEA 实锤：读档重建对 status≥0x80 的固定槽 0..126（槽127排除）逐个
// inc es:[X] 并写 L1A=offset、L1C=Y*24 行段。fresh v2 初始 = 1A2D 清零平面
// （zeroFilled）+ 同一重建；nativeLegionSlots 缺席 = 全零军团区（官方四章与
// 现行全部生产章节实锤全零，见 parse_sinario OFF_LEGION=0x22C0 区核验）。
export function synthesizeScenarioMovementMemory(scenario) {
  const counts = new Map();
  const records = scenario?.nativeLegionSlots?.records;
  if (records !== undefined && !Array.isArray(records))
    throw new RangeError(
      "Web engineering Uncovered native legion table at 89F0",
    );
  for (const record of records ?? []) {
    if (
      !record ||
      !Number.isInteger(record.slot) ||
      record.slot < 0 ||
      record.slot > 127
    )
      throw new RangeError(
        "Web engineering Uncovered native legion slot at 89F0",
      );
    if (record.slot === 127) continue; // 固定槽 0..126；127 为攻城临时槽
    const status = record.status;
    if (!Number.isInteger(status) || status < 0 || status > 255)
      throw new RangeError(
        "Web engineering Uncovered native legion status at 8AEA",
      );
    if (status < 0x80) continue; // 8AEA 门：cmp byte [si],0x80; jb skip
    const x = record.x,
      y = record.y;
    if (
      !Number.isInteger(x) ||
      x < 0 ||
      x >= 384 ||
      !Number.isInteger(y) ||
      y < 0 ||
      y >= 256
    )
      throw new RangeError("Web engineering Uncovered 8AEA legion coordinate");
    const row = y * 24;
    const at = movementPlaneAddress(row, x);
    const count = (counts.get(at) ?? 0) + 1;
    if (count > 255)
      throw new RangeError("Web engineering Uncovered 8AEA occupancy overflow");
    counts.set(at, count);
    // 8B08/8B0B：L1A=X、L1C=Y*24+段基（本模块保存行段算术部分）。
    record.occupancyOffset = x;
    record.occupancyRowParagraph = row;
  }
  const spans = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([address, count]) => ({
      address,
      hex: count.toString(16).padStart(2, "0"),
    }));
  return { version: 1, zeroFilled: true, spans };
}
