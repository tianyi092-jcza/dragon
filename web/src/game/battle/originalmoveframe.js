// KI.EXE 0xAF65..0xB00C 单对象移动状态机。
// 目标计算与命令分派在executor完成；本模块负责position→anchor四向/上下层步进、
// 路径word消费、碰撞边界和B240最终占用提交。全链不自行消费RNG。

import { calculateOriginalAttackGeometry } from "./originalattack.js";
import {
  commitOriginalSpatialOccupancy,
  probeOriginalCardinalSpatial,
  stepOriginalCardinal,
  stepOriginalDown,
  stepOriginalUp,
} from "./originalmovement.js";
import { executeOriginalNextPathWord } from "./originalpathqueue.js";
import { ORIGINAL_OBJECT } from "./originalstate.js";

function cardinalDirection(pool, address) {
  const anchorX = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X);
  const anchorY = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
  const positionX = pool.read8(address, ORIGINAL_OBJECT.POSITION_X);
  const positionY = pool.read8(address, ORIGINAL_OBJECT.POSITION_Y);
  // AF6E..AFF5：+6/+8锚点逐格趋近+10/+11位置。
  // anchor大于position时走B047/B08B递减，小于时走B069/B0AF递增。
  if (anchorX > positionX) return "west";
  if (anchorX < positionX) return "east";
  if (anchorY > positionY) return "north";
  if (anchorY < positionY) return "south";
  return null;
}

function collisionHandler(session, options) {
  return (attackerAddress, collisionId) =>
    session.collide(attackerAddress, collisionId, options?.collisionOptions);
}

/** AF69：AH=1常态更新；AF65等价可传consumePath=false。 */
export function updateOriginalObjectMovement(
  session,
  address,
  { consumePath = true, commit = true, collisionOptions = null } = {},
) {
  const pool = session.pool;
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(address, ORIGINAL_OBJECT.FLAGS) | 0x20,
  );
  const collision = collisionHandler(session, { collisionOptions });
  const direction = cardinalDirection(pool, address);
  let step = null;
  if (direction) {
    step = stepOriginalCardinal(pool, address, direction, {
      probe: ({ spatial: candidate }) =>
        probeOriginalCardinalSpatial(pool, address, candidate, {
          spatial: session.spatial,
          enqueue: () => session.enqueuePath(address),
        }),
      collision,
      spatial: session.spatial,
      commit,
    });
  } else if (pool.read8(address, ORIGINAL_OBJECT.CLASS) > 0x12) {
    const level = pool.read8(address, ORIGINAL_OBJECT.LEVEL);
    const positionLevel = pool.read8(address, ORIGINAL_OBJECT.POSITION_LEVEL);
    if (level < positionLevel)
      step = stepOriginalUp(pool, address, {
        spatial: session.spatial,
        collision,
      });
    else if (level > positionLevel)
      step = stepOriginalDown(pool, address, {
        spatial: session.spatial,
        collision,
      });
  }

  if (step?.moved && step.committed && commit)
    step.occupancy = commitOriginalSpatialOccupancy(
      pool,
      session.spatial,
      address,
    );
  else if (step?.moved && !step.occupancy && commit)
    step.occupancy = commitOriginalSpatialOccupancy(
      pool,
      session.spatial,
      address,
    );
  if (step?.moved) return { moved: true, step, path: null };

  if (
    consumePath &&
    pool.read8(address, ORIGINAL_OBJECT.PATH_REMAINING) !== 0
  ) {
    const path = executeOriginalNextPathWord(pool, session.paths, address);
    if (!path.carry) return { moved: false, step, path };
  }

  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, flags & 0xdf);
  if (consumePath) {
    session.enqueuePath(address);
    const geometry = calculateOriginalAttackGeometry(pool, address);
    pool.write8(address, ORIGINAL_OBJECT.DIRECTION, geometry.direction);
    return { moved: false, step, path: null, queued: true, geometry };
  }
  return { moved: false, step, path: null, queued: false };
}
