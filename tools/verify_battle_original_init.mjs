import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const {
  OriginalBattleTempRecords,
  copyOriginalBattleSideTemp,
  createOriginalBattleSideTemp,
  initializeOriginalBattleObjects,
  originalGroupTemplateValues,
} = await import("../web/src/game/battle/originalinit.js");
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { countOriginalPoolSurvivors, originalTempGroupSurvivors } = await import(
  "../web/src/game/battle/originalresult.js"
);

class ScriptedRng {
  constructor(bytes = []) {
    this.bytes = [...bytes];
    this.calls = 0;
  }

  nextByte() {
    assert.ok(this.bytes.length, "unexpected original RNG call");
    this.calls++;
    return this.bytes.shift();
  }
}

{
  const legion = new Uint8Array(0x40);
  for (let offset = 1; offset <= 7; offset++) legion[offset] = 10 + offset;
  for (let group = 0; group < 6; group++) {
    const offset = 0x28 + group * 4;
    legion[offset] = group + 1;
    legion[offset + 1] = group + 2;
    legion[offset + 2] = 0xa0 + group;
    legion[offset + 3] = 0xee;
  }
  const temp = copyOriginalBattleSideTemp(legion);
  assert.equal(temp[0], 0);
  assert.deepEqual(Array.from(temp.slice(1, 8)), [11, 12, 13, 14, 15, 16, 17]);
  for (let group = 0; group < 6; group++) {
    const offset = 8 + group * 4;
    assert.deepEqual(Array.from(temp.slice(offset, offset + 4)), [
      group + 1,
      group + 2,
      0xa0 + group,
      0,
    ]);
  }
}

assert.deepEqual(
  originalGroupTemplateValues(
    1,
    { attribute12: 20, modeNibbles: [3, 0, 0] },
    0,
  ),
  { type: 1, classByte: 18, power: 24 },
);
assert.equal(
  originalGroupTemplateValues(
    1,
    { attribute12: 250, modeNibbles: [15, 0, 0] },
    0,
  ).power,
  14,
  "attribute and power arithmetic must wrap as u8",
);

function side({ total, morale = 100, groups }) {
  return createOriginalBattleSideTemp({
    faction: 1,
    commanderIndex: 2,
    total,
    morale,
    groups,
  });
}

{
  const temps = new OriginalBattleTempRecords([
    side({ total: 0, groups: [] }),
    side({ total: 0, groups: [] }),
  ]);
  const rng = new ScriptedRng(Array(96).fill(0));
  const pool = new OriginalBattleObjectPool();
  const result = initializeOriginalBattleObjects({
    pool,
    temps,
    commanders: [
      { attribute11: 5, attribute12: 10, modeNibbles: [2, 0, 0] },
      { attribute11: 6, attribute12: 11, modeNibbles: [3, 0, 0] },
    ],
    rng,
  });
  assert.equal(rng.calls, 96, "empty groups still consume all 96 RNG bytes");
  assert.deepEqual(result.activeBySide, [0, 0]);
  for (const slot of result.slots) {
    assert.equal(pool.read8(slot.address, ORIGINAL_OBJECT.FLAGS), 0);
    assert.equal(pool.read8(slot.address, ORIGINAL_OBJECT.ANCHOR_Y), 0x10);
    assert.equal(pool.read8(slot.address, ORIGINAL_OBJECT.STATUS_TIME), 0x80);
    assert.equal(pool.read8(slot.address, ORIGINAL_OBJECT.CURRENT_COMMAND), 1);
    assert.equal(pool.read8(slot.address, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
  }
}

{
  const temps = new OriginalBattleTempRecords([
    side({
      total: 13,
      morale: 80,
      groups: [
        { troops: 10, type: 1 },
        { troops: 3, type: 2 },
      ],
    }),
    side({ total: 0, morale: 70, groups: [] }),
  ]);
  const rng = new ScriptedRng([
    ...Array(8).fill(0),
    ...Array(8).fill(31),
    ...Array(80).fill(0),
  ]);
  const pool = new OriginalBattleObjectPool();
  const result = initializeOriginalBattleObjects({
    pool,
    temps,
    commanders: [
      { attribute11: 5, attribute12: 20, modeNibbles: [3, 0, 0] },
      { attribute11: 0, attribute12: 0, modeNibbles: [0, 0, 0] },
    ],
    rng,
  });
  assert.equal(rng.calls, 96);
  assert.deepEqual(result.activeBySide, [11, 0]);
  assert.equal(temps.read16(0, 4), 2);
  assert.deepEqual(temps.group(0, 0), {
    raw0: 0,
    remaining: 2,
    type: 1,
    survivors: 0,
  });
  assert.equal(temps.group(0, 1).remaining, 0);

  const leader = originalObjectAddress(0, 0, 0);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.FLAGS), 0x80);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.CLASS), 0);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.POWER), 26);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.HP), 70);
  assert.equal(pool.read16(leader, ORIGINAL_OBJECT.SPATIAL_0C), 0x101);

  const side0Group0Last = originalObjectAddress(0, 0, 7);
  assert.equal(pool.read8(side0Group0Last, ORIGINAL_OBJECT.FLAGS), 0x80);
  assert.equal(pool.read8(side0Group0Last, ORIGINAL_OBJECT.CLASS), 18);
  assert.equal(pool.read8(side0Group0Last, ORIGINAL_OBJECT.POWER), 24);
  assert.equal(pool.read8(side0Group0Last, ORIGINAL_OBJECT.HP), 80);

  const side0Group1First = originalObjectAddress(0, 1, 0);
  assert.equal(pool.read8(side0Group1First, ORIGINAL_OBJECT.ANCHOR_Y), 47);
  assert.equal(pool.read16(side0Group1First, ORIGINAL_OBJECT.SPATIAL_0C), 753);
  assert.equal(
    pool.read8(originalObjectAddress(0, 1, 3), ORIGINAL_OBJECT.FLAGS),
    0,
  );

  const side1First = originalObjectAddress(1, 0, 0);
  assert.equal(pool.read8(side1First, ORIGINAL_OBJECT.ANCHOR_X), 0x3e);
  assert.equal(pool.read8(side1First, ORIGINAL_OBJECT.ANCHOR_Y), 0x10);

  pool.write8(originalObjectAddress(0, 0, 0), ORIGINAL_OBJECT.FLAGS, 1);
  pool.write8(originalObjectAddress(0, 1, 0), ORIGINAL_OBJECT.FLAGS, 1);
  assert.deepEqual(
    countOriginalPoolSurvivors(pool, temps, 0),
    [7, 2, 0, 0, 0, 0],
  );
  assert.deepEqual(originalTempGroupSurvivors(temps, 0), [9, 2, 0, 0, 0, 0]);
}

{
  const tempBytes = new OriginalBattleTempRecords([
    side({ total: 1, groups: [{ troops: 1, type: 1 }] }),
    side({ total: 1, groups: [{ troops: 1, type: 2 }] }),
  ]).snapshot();
  const session = new OriginalBattleSession({
    tempBytes,
    rngClock: { ch: 1, cl: 2, dh: 3 },
  });
  const callsBefore = session.rng.calls;
  const initialized = session.initializeObjects({
    commanders: [
      { attribute11: 1, attribute12: 2, modeNibbles: [3, 0, 0] },
      { attribute11: 4, attribute12: 5, modeNibbles: [6, 0, 0] },
    ],
  });
  assert.equal(session.rng.calls - callsBefore, 96);
  assert.deepEqual(initialized.activeBySide, [1, 1]);
  assert.equal(session.registers.side0Active, 1);
  assert.equal(session.registers.side1Active, 1);
  const restored = new OriginalBattleSession().restore(session.snapshot());
  assert.deepEqual(restored.temps.snapshot(), session.temps.snapshot());
}

process.stdout.write(
  "battle original init OK: side temps + 12x8 templates + fixed 96 RNG activation\n",
);
