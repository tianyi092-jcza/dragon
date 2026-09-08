// KI.EXE AF65..B00C: AH controls path consumption, CF controls axis fallback.
// Probes may return CF=0 after a collision without moving the anchor.
import { calculateOriginalAttackGeometry } from "./originalattack.js";
import {
  commitOriginalSpatialOccupancy,
  probeOriginalCardinalSpatial,
  stepOriginalCardinal,
  stepOriginalDown,
  stepOriginalUp,
} from "./originalmovement.js";
import { executeOriginalNextPathWord } from "./originalpathqueue.js";
import { ORIGINAL_OBJECT as O } from "./originalstate.js";

/** AF69 starts AH=1; AF65 starts AH=0. Neither path adds RNG outside probes. */
export function updateOriginalObjectMovement(
  session,
  address,
  { consumePath = true, commit = true, collisionOptions = null } = {},
) {
  const pool = session.pool;
  const read = (field) => pool.read8(address, field);
  const write = (field, value) => pool.write8(address, field, value);
  const collision = (attacker, id) => session.collide(attacker, id, collisionOptions);
  let mayConsume = consumePath;
  let path = null;
  let step = null;
  const finishStep = () => {
    if (step.moved && !step.occupancy && commit)
      step.occupancy = commitOriginalSpatialOccupancy(pool, session.spatial, address);
    return { moved: step.moved, step, path };
  };
  const cardinal = (direction) => stepOriginalCardinal(pool, address, direction, {
    probe: ({ spatial: candidate }) => probeOriginalCardinalSpatial(pool, address, candidate, {
      spatial: session.spatial,
      enqueue: () => session.enqueuePath(address),
    }),
    collision,
    spatial: session.spatial,
    commit,
  });

  // At most one B00D succeeds: AF99 then re-enters AF65 with AH=0.
  for (;;) {
    write(O.FLAGS, read(O.FLAGS) | 0x20);
    if (read(O.ANCHOR_X) !== read(O.POSITION_X)) {
      step = cardinal(read(O.ANCHOR_X) > read(O.POSITION_X) ? "west" : "east");
      mayConsume = false; // AFE0/AFE8, regardless of CF.
      if (!step.carry) return finishStep();
    }
    if (read(O.ANCHOR_Y) !== read(O.POSITION_Y)) {
      step = cardinal(read(O.ANCHOR_Y) > read(O.POSITION_Y) ? "north" : "south");
      mayConsume = false;
      if (!step.carry) return finishStep();
    }
    if (read(O.CLASS) > 0x12 && read(O.LEVEL) !== read(O.POSITION_LEVEL)) {
      step = (read(O.LEVEL) < read(O.POSITION_LEVEL) ? stepOriginalUp : stepOriginalDown)(
        pool, address, { spatial: session.spatial, collision },
      );
      mayConsume = false;
      if (!step.carry) return finishStep();
    }
    if (!mayConsume) {
      // AFD0 is the only AF69 terminal branch which calls C653.
      write(O.FLAGS, read(O.FLAGS) & 0xdf);
      session.enqueuePath(address);
      const geometry = calculateOriginalAttackGeometry(pool, address);
      write(O.DIRECTION, geometry.direction);
      return { moved: false, step, path, queued: true, geometry };
    }
    path = executeOriginalNextPathWord(pool, session.paths, address); // even when remaining=0
    if (!path.carry) {
      mayConsume = false;
      continue; // AF99 -> AF65: move toward the new word in this same call.
    }
    const geometry = calculateOriginalAttackGeometry(pool, address);
    if (geometry.distance === 1 && read(O.TARGET_X) === read(O.ANCHOR_X) &&
        read(O.TARGET_Y) === read(O.ANCHOR_Y)) {
      // AFB0..AFBC: chase adjacent target; direction is deliberately unchanged.
      write(O.POSITION_X, pool.read8(geometry.target, O.ANCHOR_X));
      write(O.POSITION_Y, pool.read8(geometry.target, O.ANCHOR_Y));
      write(O.POSITION_LEVEL, pool.read8(geometry.target, O.LEVEL));
    } else {
      write(O.DIRECTION, geometry.direction);
      pool.write16(address, O.POSITION_X, pool.read16(address, O.TARGET_X));
    }
    write(O.FLAGS, read(O.FLAGS) & 0xdf);
    return { moved: false, step, path, queued: false, geometry };
  }
}
