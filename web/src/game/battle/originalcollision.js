// KI.EXE 原版战术碰撞/伤害规则 — 0xB533、0xB618、0xB6BC、0xB732。
// 本模块只读写原始0x20字节对象字段并消费 OriginalBattleRng 字节流；动画层
// 只能消费返回事件，不能反向修改规则状态或补取随机数。

import {
  ORIGINAL_OBJECT,
  ORIGINAL_SIDE_SIZE,
  ORIGINAL_UNIT_MEMORY_SIZE,
} from "./originalstate.js";

const byte = (value) => value & 0xff;
const saturatingAddByte = (left, right) =>
  Math.min(0xff, byte(left) + byte(right));

export function decodeOriginalCollisionId(collisionId) {
  if (!Number.isInteger(collisionId) || collisionId < 1 || collisionId > 0xff)
    throw new RangeError("original collision id must be 1..255");
  return (collisionId - 1) << 5;
}

export function encodeOriginalCollisionAddress(address) {
  if (
    !Number.isInteger(address) ||
    address < 0 ||
    address > 0x1fc0 ||
    (address & 0x1f) !== 0
  )
    throw new RangeError(
      "original collision address must be aligned within 0x0000..0x1FC0",
    );
  return (address >> 5) + 1;
}

function finishAttackerContact(pool, attackerAddress) {
  const state = pool.read8(attackerAddress, ORIGINAL_OBJECT.STATE);
  pool.write8(attackerAddress, ORIGINAL_OBJECT.STATE, (state & 0x01) | 0x08);
}

function event(originalId, type, attackerAddress, targetAddress, details = {}) {
  return {
    type,
    originalId,
    attackerAddress,
    targetAddress,
    ...details,
  };
}

/** 0xB618：CLASS!=0目标；每条路径固定消费1个随机字节。 */
export function resolveOriginalClassedDamage(
  pool,
  rng,
  registers,
  attackerAddress,
  targetAddress,
) {
  const random = rng.nextByte();
  const rawPower = pool.read8(attackerAddress, ORIGINAL_OBJECT.POWER);
  let roll = byte((random & 0x7f) + rawPower);
  let damage = rawPower;
  const attackerSideCode = attackerAddress < ORIGINAL_SIDE_SIZE ? 2 : 0;
  const d31e = byte(registers?.d31e ?? 0);

  if (d31e !== 1) {
    if (attackerSideCode === d31e) damage = saturatingAddByte(damage, 0x40);
    else roll = Math.max(0, roll - 0x32);
  }

  const hpBefore = pool.read8(targetAddress, ORIGINAL_OBJECT.HP);
  if (roll < 0x46) {
    finishAttackerContact(pool, attackerAddress);
    return {
      hit: false,
      killed: false,
      damage: 0,
      hpBefore,
      hpAfter: hpBefore,
      rngBytes: [random],
      events: [
        event(8, "collision-classed-miss", attackerAddress, targetAddress, {
          roll,
        }),
      ],
    };
  }

  if (hpBefore < 0x64) {
    const current = pool.read8(targetAddress, ORIGINAL_OBJECT.CURRENT_COMMAND);
    const pending = pool.read8(targetAddress, ORIGINAL_OBJECT.PENDING_COMMAND);
    if (current !== 5 && pending !== 5) {
      if (current !== pending)
        pool.write8(targetAddress, ORIGINAL_OBJECT.CURRENT_COMMAND, pending);
      pool.write8(targetAddress, ORIGINAL_OBJECT.PENDING_COMMAND, 5);
    }
  }

  pool.write8(targetAddress, ORIGINAL_OBJECT.KIND, 2);
  pool.write8(
    targetAddress,
    ORIGINAL_OBJECT.STATE,
    (pool.read8(targetAddress, ORIGINAL_OBJECT.STATE) & 0x01) | 0x10,
  );
  pool.write8(targetAddress, ORIGINAL_OBJECT.DIRECTION, 0);
  pool.write8(targetAddress, ORIGINAL_OBJECT.FIELD_13, 8);
  pool.write8(
    targetAddress,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(targetAddress, ORIGINAL_OBJECT.FLAGS) | 0x40,
  );

  if (pool.read8(attackerAddress, ORIGINAL_OBJECT.CURRENT_COMMAND) === 2)
    damage = saturatingAddByte(damage, 0xc8);

  const killed = hpBefore <= damage;
  const hpAfter = killed ? 0 : byte(hpBefore - damage);
  pool.write8(targetAddress, ORIGINAL_OBJECT.HP, hpAfter);
  if (killed) {
    const flags = pool.read8(targetAddress, ORIGINAL_OBJECT.FLAGS);
    pool.write8(targetAddress, ORIGINAL_OBJECT.FLAGS, (flags & 0x10) | 0x01);
    pool.write8(targetAddress, ORIGINAL_OBJECT.KIND, 4);
  }

  finishAttackerContact(pool, attackerAddress);
  const events = [
    event(9, "collision-classed-hit", attackerAddress, targetAddress, {
      roll,
      damage,
      hpBefore,
      hpAfter,
      killed,
    }),
  ];
  if (killed)
    events.push(
      event(null, "unit-disabled", attackerAddress, targetAddress, {
        hpBefore,
      }),
    );
  return {
    hit: true,
    killed,
    damage,
    hpBefore,
    hpAfter,
    rngBytes: [random],
    events,
  };
}

/** 0xB6BC：CLASS==0目标；按早退/短路精确消费0、1或2个随机字节。 */
export function resolveOriginalClassZeroDamage(
  pool,
  rng,
  attackerAddress,
  targetAddress,
) {
  const hpBefore = pool.read8(targetAddress, ORIGINAL_OBJECT.HP);
  const targetCommand = pool.read8(
    targetAddress,
    ORIGINAL_OBJECT.CURRENT_COMMAND,
  );
  const rngBytes = [];
  let failureReason = null;
  let hit = false;

  if (hpBefore <= 1) failureReason = "minimum-hp";
  else if (targetCommand === 0 || targetCommand === 5)
    failureReason = "target-command";
  else {
    const gate = rng.nextByte();
    rngBytes.push(gate);
    if (gate < 0x19) hit = true;
    else {
      const contestRaw = rng.nextByte();
      rngBytes.push(contestRaw);
      const advantage = Math.min(
        0x18,
        Math.max(
          0,
          pool.read8(attackerAddress, ORIGINAL_OBJECT.POWER) -
            pool.read8(targetAddress, ORIGINAL_OBJECT.POWER),
        ),
      );
      hit = (contestRaw & 0x7f) < advantage;
      if (!hit) failureReason = "contest";
    }
  }

  if (!hit) {
    finishAttackerContact(pool, attackerAddress);
    return {
      hit: false,
      killed: false,
      damage: 0,
      hpBefore,
      hpAfter: hpBefore,
      rngBytes,
      events: [
        event(7, "collision-class0-fail", attackerAddress, targetAddress, {
          reason: failureReason,
        }),
      ],
    };
  }

  pool.write8(targetAddress, ORIGINAL_OBJECT.KIND, 2);
  pool.write8(
    targetAddress,
    ORIGINAL_OBJECT.STATE,
    (pool.read8(targetAddress, ORIGINAL_OBJECT.STATE) & 0x01) | 0x10,
  );
  pool.write8(targetAddress, ORIGINAL_OBJECT.DIRECTION, 0);
  pool.write8(
    targetAddress,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(targetAddress, ORIGINAL_OBJECT.FLAGS) | 0x40,
  );
  const damage = Math.max(
    1,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.POWER) >> 3,
  );
  const hpAfter = hpBefore > damage ? hpBefore - damage : 1;
  pool.write8(targetAddress, ORIGINAL_OBJECT.HP, hpAfter);
  finishAttackerContact(pool, attackerAddress);
  return {
    hit: true,
    killed: false,
    damage,
    hpBefore,
    hpAfter,
    rngBytes,
    events: [
      event(6, "collision-class0-hit", attackerAddress, targetAddress, {
        damage,
        hpBefore,
        hpAfter,
      }),
    ],
  };
}

function swapWord(pool, leftAddress, rightAddress, offset) {
  const left = pool.read16(leftAddress, offset);
  pool.write16(leftAddress, offset, pool.read16(rightAddress, offset));
  pool.write16(rightAddress, offset, left);
}

function swapByte(pool, leftAddress, rightAddress, offset) {
  const left = pool.read8(leftAddress, offset);
  pool.write8(leftAddress, offset, pool.read8(rightAddress, offset));
  pool.write8(rightAddress, offset, left);
}

/** 0xB732：同侧拥挤对象的空间记录交换。 */
export function swapOriginalSpatialRecords(
  pool,
  attackerAddress,
  targetAddress,
  spatial = null,
) {
  pool.write8(
    targetAddress,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(targetAddress, ORIGINAL_OBJECT.FLAGS) | 0x40,
  );
  for (const offset of [0x06, 0x08, 0x0a])
    swapWord(pool, attackerAddress, targetAddress, offset);

  if (spatial) {
    const attackerOld = pool.read16(
      attackerAddress,
      ORIGINAL_OBJECT.SPATIAL_0C,
    );
    let low = spatial.read8(attackerOld);
    let high = spatial.read8(attackerOld + 0x1000);
    const targetOld = pool.read16(targetAddress, ORIGINAL_OBJECT.SPATIAL_0C);
    pool.write16(targetAddress, ORIGINAL_OBJECT.SPATIAL_0C, attackerOld);
    pool.write16(attackerAddress, ORIGINAL_OBJECT.SPATIAL_0C, targetOld);
    const targetLow = spatial.read8(targetOld);
    spatial.write8(targetOld, low);
    low = targetLow;
    // B761交换高平面，随后B76C只把原目标低平面值写入新攻击者低平面；
    // 交换得到的原目标高平面留在AH，但原版不再写回。
    const targetHigh = spatial.read8(targetOld + 0x1000);
    spatial.write8(targetOld + 0x1000, high);
    spatial.write8(targetOld, low);
    void targetHigh;
  } else
    swapWord(pool, attackerAddress, targetAddress, ORIGINAL_OBJECT.SPATIAL_0C);
  swapWord(pool, attackerAddress, targetAddress, ORIGINAL_OBJECT.SPATIAL_0E);

  const attackerHeight = pool.read8(attackerAddress, ORIGINAL_OBJECT.HEIGHT);
  const targetHeight = pool.read8(targetAddress, ORIGINAL_OBJECT.HEIGHT);
  swapByte(pool, attackerAddress, targetAddress, ORIGINAL_OBJECT.HEIGHT);
  if (
    (attackerHeight | targetHeight) === 0 &&
    (pool.read8(attackerAddress, ORIGINAL_OBJECT.LEVEL) |
      pool.read8(targetAddress, ORIGINAL_OBJECT.LEVEL)) !==
      0
  )
    swapByte(
      pool,
      attackerAddress,
      targetAddress,
      ORIGINAL_OBJECT.POSITION_LEVEL,
    );
}

/** 0xB533单位区分派。地图对象路径交给可选回调，且本身不消费RNG。 */
export function resolveOriginalCollision(
  pool,
  rng,
  registers,
  attackerAddress,
  collisionId,
  { resolveMapObject = null, spatial = null } = {},
) {
  if (
    !Number.isInteger(attackerAddress) ||
    attackerAddress < 0 ||
    attackerAddress >= ORIGINAL_UNIT_MEMORY_SIZE ||
    (attackerAddress & 0x1f) !== 0
  )
    throw new RangeError("invalid original collision attacker address");

  const targetAddress = decodeOriginalCollisionId(collisionId);
  if (targetAddress >= ORIGINAL_UNIT_MEMORY_SIZE) {
    const mapResult = resolveMapObject?.({
      attackerAddress,
      targetAddress,
      pool,
      registers,
    });
    return {
      category: "map-object",
      carry: false,
      blocked: false,
      attackerAddress,
      targetAddress,
      events: mapResult?.events ?? [],
      mapResult: mapResult ?? null,
    };
  }

  const attackerClass = pool.read8(attackerAddress, ORIGINAL_OBJECT.CLASS);
  const attackerCommand = pool.read8(
    attackerAddress,
    ORIGINAL_OBJECT.CURRENT_COMMAND,
  );
  const bypassSideGate =
    attackerClass === 0 && (attackerCommand === 0 || attackerCommand === 5);
  const crossesSideGate =
    attackerAddress < ORIGINAL_SIDE_SIZE !== targetAddress < ORIGINAL_SIDE_SIZE;

  if (!bypassSideGate && crossesSideGate) {
    if (!pool.isActive(targetAddress))
      return {
        category: "enemy-inactive",
        carry: false,
        blocked: false,
        attackerAddress,
        targetAddress,
        events: [],
      };
    const damageResult =
      pool.read8(targetAddress, ORIGINAL_OBJECT.CLASS) === 0
        ? resolveOriginalClassZeroDamage(
            pool,
            rng,
            attackerAddress,
            targetAddress,
          )
        : resolveOriginalClassedDamage(
            pool,
            rng,
            registers,
            attackerAddress,
            targetAddress,
          );
    return {
      category: "enemy-contact",
      carry: false,
      blocked: false,
      attackerAddress,
      targetAddress,
      ...damageResult,
    };
  }

  if (!bypassSideGate) {
    const targetClass = pool.read8(targetAddress, ORIGINAL_OBJECT.CLASS);
    const targetFlags = pool.read8(targetAddress, ORIGINAL_OBJECT.FLAGS);
    const targetState = pool.read8(targetAddress, ORIGINAL_OBJECT.STATE);
    const targetCommand = pool.read8(
      targetAddress,
      ORIGINAL_OBJECT.CURRENT_COMMAND,
    );
    if (
      targetClass === 0 ||
      (targetFlags & 0x61) !== 0 ||
      (targetState & 0x10) !== 0 ||
      targetCommand === 5
    )
      return {
        category: "friendly-blocked",
        carry: true,
        blocked: true,
        attackerAddress,
        targetAddress,
        events: [],
      };
  }

  const attackerHeight = pool.read8(attackerAddress, ORIGINAL_OBJECT.HEIGHT);
  const targetHeight = pool.read8(targetAddress, ORIGINAL_OBJECT.HEIGHT);
  if (
    attackerHeight !== targetHeight &&
    (attackerClass <= 0x12 ||
      pool.read8(targetAddress, ORIGINAL_OBJECT.CLASS) <= 0x12)
  )
    return {
      category: "friendly-blocked",
      carry: true,
      blocked: true,
      attackerAddress,
      targetAddress,
      events: [],
    };

  swapOriginalSpatialRecords(pool, attackerAddress, targetAddress, spatial);
  return {
    category: "friendly-swap",
    carry: false,
    blocked: false,
    attackerAddress,
    targetAddress,
    events: [
      event(null, "friendly-spatial-swap", attackerAddress, targetAddress),
    ],
  };
}
