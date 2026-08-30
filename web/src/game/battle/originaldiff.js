// 原版战术逐帧差分包：不比较Canvas/对白，仅比较规则内存、寄存器、RNG与退出结果。

function bytes(value) {
  return Uint8Array.from(value ?? []);
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 轻量FNV-1a仅用于快速定位；fixture可同时保存完整字节。 */
export function hashOriginalBytes(source) {
  let hash = 0x811c9dc5;
  for (const value of source ?? []) {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hex32(hash);
}

export function canonicalOriginalBattlePacket(session, { full = false } = {}) {
  const snapshot = session.snapshot();
  const blobs = {
    objects: bytes(snapshot.objectBytes),
    mapObjects: bytes(snapshot.mapObjectBytes),
    effects: bytes(snapshot.effectBytes),
    spatial: bytes(snapshot.spatialBytes),
    tiles: bytes(snapshot.tileBytes),
    temp: bytes(snapshot.tempBytes),
    pathQueue: bytes(snapshot.queueBytes),
    paths: bytes(snapshot.pathBytes),
  };
  const packet = {
    schema: 1,
    frame: snapshot.frame,
    finished: snapshot.finished,
    winner: snapshot.winner,
    registers: { ...snapshot.registers },
    rng: { ...snapshot.rng, table: [...snapshot.rng.table] },
    commands: snapshot.commands.map((command) => ({ ...command })),
    hashes: Object.fromEntries(
      Object.entries(blobs).map(([name, value]) => [
        name,
        hashOriginalBytes(value),
      ]),
    ),
  };
  if (full) {
    packet.blobs = Object.fromEntries(
      Object.entries(blobs).map(([name, value]) => [name, Array.from(value)]),
    );
  }
  return packet;
}

function firstByteDifference(left, right) {
  const size = Math.max(left?.length ?? 0, right?.length ?? 0);
  for (let index = 0; index < size; index++) {
    const a = left?.[index];
    const b = right?.[index];
    if (a !== b) return { index, expected: a ?? null, actual: b ?? null };
  }
  return null;
}

export function compareOriginalBattlePackets(expected, actual) {
  const differences = [];
  for (const key of ["frame", "finished", "winner"])
    if (expected?.[key] !== actual?.[key])
      differences.push({
        section: "header",
        key,
        expected: expected?.[key],
        actual: actual?.[key],
      });
  const registerKeys = new Set([
    ...Object.keys(expected?.registers ?? {}),
    ...Object.keys(actual?.registers ?? {}),
  ]);
  for (const key of [...registerKeys].sort()) {
    if (expected?.registers?.[key] !== actual?.registers?.[key])
      differences.push({
        section: "registers",
        key,
        expected: expected?.registers?.[key],
        actual: actual?.registers?.[key],
      });
  }
  for (const key of Object.keys(expected?.hashes ?? {})) {
    if (expected.hashes[key] === actual?.hashes?.[key]) continue;
    const byteDifference = firstByteDifference(
      expected?.blobs?.[key],
      actual?.blobs?.[key],
    );
    differences.push({
      section: "blob",
      key,
      expectedHash: expected.hashes[key],
      actualHash: actual?.hashes?.[key],
      firstByte: byteDifference,
    });
  }
  if (expected?.rng?.calls !== actual?.rng?.calls)
    differences.push({
      section: "rng",
      key: "calls",
      expected: expected?.rng?.calls,
      actual: actual?.rng?.calls,
    });
  return { equal: differences.length === 0, differences };
}

export function replayOriginalBattleFixture(fixture, createSession) {
  if (!fixture?.initial || !Array.isArray(fixture.frames))
    throw new TypeError("invalid original battle differential fixture");
  const session = createSession().restore(fixture.initial);
  const packets = [canonicalOriginalBattlePacket(session, { full: true })];
  const commandMap = new Map();
  for (const command of fixture.commands ?? []) {
    const list = commandMap.get(command.frame) ?? [];
    list.push(command);
    commandMap.set(command.frame, list);
  }
  for (const frame of fixture.frames) {
    for (const command of commandMap.get(session.frame) ?? [])
      session.enqueue({ ...command });
    session.tick(fixture.handlers ?? {});
    packets.push(canonicalOriginalBattlePacket(session, { full: frame.full }));
  }
  return { session, packets };
}
