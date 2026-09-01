// 原版战术规则固定帧会话骨架。每个tick严格对应一个KI.EXE逻辑帧：
// 帧命令→A6FA结束检查→A754/A785对象顺序→ADC8/AEA9活动计数重建。

import {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  createOriginalBattleRegisters,
  originalTraversalOrder,
} from "./originalstate.js";
import {
  finalizeOriginalBattleObject,
  updateOriginalActiveObject,
  updateOriginalInactiveObject,
} from "./originalobjectframe.js";
import { OriginalBattleEffectPool } from "./originaleffects.js";
import { OriginalBattleSpatialMemory } from "./originalspatial.js";
import { OriginalBattleCommandQueue } from "./originalcommands.js";
import { createOriginalBattleRng } from "./originalrng.js";
import { resolveOriginalCollision } from "./originalcollision.js";
import {
  OriginalBattleTempRecords,
  initializeOriginalBattleObjects,
} from "./originalinit.js";
import { updateOriginalBattleObjects } from "./originalframe.js";
import {
  checkOriginalAutomaticRetreat,
  tickOriginalSiegeLeaderAttrition,
  updateOriginalBattleBalance,
} from "./originalretreat.js";
import { updateOriginalAttackEffects } from "./originaleffectframe.js";
import { settleOriginalBattleExit } from "./originalexit.js";
import {
  OriginalBattleMapObjectPool,
  initializeOriginalMapObjects,
  originalWallRecords,
  resolveOriginalMapObjectCollision,
  sweepOriginalWallObjectsB7CB,
} from "./originalmapobjects.js";
import {
  OriginalBattlePathState,
  consumeOriginalPathQueue,
} from "./originalpathqueue.js";

export class OriginalBattleSession {
  constructor({
    objectBytes = null,
    effectBytes = null,
    spatialBytes = null,
    tileBytes = null,
    tempBytes = null,
    mapObjectBytes = null,
    pathQueueBytes = null,
    pathBytes = null,
    pathHead = 0,
    pathTail = 0,
    registers = null,
    rngClock = null,
    rngSnapshot = null,
    commands = [],
    frame = 0,
    objectsInitialized = objectBytes != null,
    finished = false,
    winner = null,
    events = [],
  } = {}) {
    this.pool = new OriginalBattleObjectPool(objectBytes);
    this.effects = new OriginalBattleEffectPool(effectBytes);
    this.spatial = new OriginalBattleSpatialMemory({
      spatialBytes,
      tileBytes,
    });
    this.temps = new OriginalBattleTempRecords(tempBytes);
    this.mapObjects = new OriginalBattleMapObjectPool(mapObjectBytes);
    this.paths = new OriginalBattlePathState({
      queueBytes: pathQueueBytes,
      pathBytes,
      head: pathHead,
      tail: pathTail,
    });
    this.registers = {
      ...createOriginalBattleRegisters(),
      ...(registers ?? {}),
    };
    this.rng = createOriginalBattleRng(rngClock ?? {});
    if (rngSnapshot) this.rng.restore(rngSnapshot);
    this.queue = new OriginalBattleCommandQueue(commands);
    this.frame = Math.max(0, frame | 0);
    this.objectsInitialized = Boolean(objectsInitialized);
    this.finished = Boolean(finished);
    this.winner = winner == null ? null : winner & 0xff;
    this.events = events.map((event) => ({ ...event }));
  }

  enqueue(command) {
    return this.queue.enqueue(command);
  }

  enqueuePath(address) {
    return this.paths.enqueue(this.pool, address);
  }

  /** 0x9FA0输入阶段：在A426之前消费本帧已到期玩家命令。 */
  applyReadyCommands(applyCommand = null) {
    const events = [];
    for (const command of this.queue.take(this.frame)) {
      applyCommand?.(this, command);
      events.push({ ...command, commandType: command.type, type: "command" });
    }
    return events;
  }

  /** 0x9FDC：生成唯一权威战术退出结果，不执行外层战略去向。 */
  settleExit({ legions = [], wallRecords = null, city = null } = {}) {
    if (!this.finished)
      throw new Error("original battle must finish before exit settlement");
    return settleOriginalBattleExit({
      pool: this.pool,
      temps: this.temps,
      registers: { ...this.registers, winnerState: this.winner ?? 0 },
      legions,
      wallRecords:
        wallRecords ?? originalWallRecords(this.mapObjects).slice(0, 16),
      city,
    });
  }

  initializeMapObjects({
    tileBytes,
    attributes = null,
    cityTroops = 0,
    mode = this.registers.mode,
  } = {}) {
    return initializeOriginalMapObjects(
      this.mapObjects,
      this.spatial,
      tileBytes,
      { cityTroops, mode, attributes, rng: this.rng },
    );
  }

  wallRecords() {
    return originalWallRecords(this.mapObjects).slice(0, 16);
  }

  /** 0x9ACE初始化：临时记录必须先由0x9E97等价裁剪填入。 */
  initializeObjects({ commanders = [], mode = this.registers.mode } = {}) {
    const result = initializeOriginalBattleObjects({
      pool: this.pool,
      temps: this.temps,
      commanders,
      mode,
      rng: this.rng,
    });
    this.registers.side0Active = result.activeBySide[0] & 0xff;
    this.registers.side1Active = result.activeBySide[1] & 0xff;
    this.objectsInitialized = true;
    return result;
  }

  /** 使用会话自身对象池、寄存器与RNG执行一次0xB533碰撞分派。 */
  collide(attackerAddress, collisionId, options) {
    return resolveOriginalCollision(
      this.pool,
      this.rng,
      this.registers,
      attackerAddress,
      collisionId,
      {
        spatial: this.spatial,
        resolveMapObject: ({ attackerAddress, targetAddress }) => {
          const result = resolveOriginalMapObjectCollision(
            this.mapObjects,
            this.spatial,
            this.pool,
            attackerAddress,
            targetAddress,
            this.registers,
          );
          this.enqueuePath(attackerAddress);
          return result;
        },
        ...(options ?? {}),
      },
    );
  }

  /** 一个调用严格代表一个原版逻辑帧，不接受浏览器dt。 */
  tick({
    applyCommand = null,
    inputEvents = null,
    updateObject = null,
    objectHandlers = null,
    updateMovement = null,
    recountActivity = null,
  } = {}) {
    if (this.finished) return this.#frameResult([]);
    const events = Array.isArray(inputEvents)
      ? inputEvents.map((event) => ({ ...event }))
      : this.applyReadyCommands(applyCommand);

    // A065入口：D348重绘请求在本帧消费后清零；A12A令D318自增并触发
    // D322/D324/D326的呈现调度。这里只记录事件，不混入规则对象写入。
    if ((this.registers.mapRedraw & 0xff) !== 0) {
      events.push({ type: "map-redraw" });
      this.registers.mapRedraw = 0;
    }
    this.registers.tacticalFrameCounter =
      ((this.registers.tacticalFrameCounter ?? 0) + 1) & 0xffff;
    const frameCounter = this.registers.tacticalFrameCounter;
    if ((this.registers.side0MarkerAt & 0xffff) === frameCounter)
      events.push({ type: "side-marker", side: 0 });
    if ((this.registers.side1MarkerAt & 0xffff) === frameCounter)
      events.push({ type: "side-marker", side: 1 });
    if ((this.registers.wallMarkerAt & 0xffff) === frameCounter)
      events.push({ type: "wall-marker" });

    // 玩家输入已在9FA0的A426之前处理；直接调用tick时由上方兼容入口消费。

    // A6FA：结束判定后先A754/A785对象命令，再B941效果，最后ADC8后处理。
    this.#checkEnd(events);
    if (!this.finished) {
      let objectsUpdated = false;
      if (updateObject) {
        // 调试/差分钩子保留严格96槽地址顺序；正式规则默认走originalframe。
        for (const address of originalTraversalOrder())
          updateObject(this, address, events);
        objectsUpdated = true;
      } else if (this.objectsInitialized || objectHandlers) {
        const handlers = objectHandlers ?? {};
        const formation = handlers.formation
          ? {
              ...handlers.formation,
              sideOffsets: handlers.formation.sideOffsets ?? [
                this.registers.side0FormationOffset ?? 0,
                this.registers.side1FormationOffset ?? 0,
              ],
              sideBases: handlers.formation.sideBases ?? [
                this.registers.side0FormationBase ?? 0,
                this.registers.side1FormationBase ?? 0,
              ],
            }
          : null;
        updateOriginalBattleObjects(this.pool, {
          ...handlers,
          formation,
          attackContext: handlers.attackContext ?? {
            effects: this.effects,
            rng: this.rng,
            events,
          },
          leaderHandlers: {
            wallSweep: ({ address }) => {
              const sweep = sweepOriginalWallObjectsB7CB(
                this.mapObjects,
                this.spatial,
                address,
                this.registers,
              );
              if (sweep.events.length) events.push(...sweep.events);
              return sweep;
            },
            formationExit: ({ address }) =>
              finalizeOriginalBattleObject(
                this.pool,
                this.temps,
                this.spatial,
                address,
                { creditSurvivor: true },
              ),
            ...(handlers.leaderHandlers ?? {}),
          },
          childHandlers: {
            formationExit: ({ address }) =>
              finalizeOriginalBattleObject(
                this.pool,
                this.temps,
                this.spatial,
                address,
                { creditSurvivor: true },
              ),
            ...(handlers.childHandlers ?? {}),
          },
          side0: { ...handlers.side0 },
          side1: { ...handlers.side1 },
        });
        objectsUpdated = true;
      }

      // A082→B941发生在ADC8之前；效果可改变随后ADC8观察到的flags/对象状态。
      if (objectsUpdated || recountActivity) {
        const effectFrames = updateOriginalAttackEffects(
          this.pool,
          this.effects,
          this.spatial,
          {
            events,
            render: objectHandlers?.effectRender ?? {},
          },
        );
        if (effectFrames.length)
          events.push({ type: "effect-frames", effects: effectFrames });
      }

      if (this.objectsInitialized || objectHandlers || recountActivity) {
        // ADC8顺序：先清D31A..D31D，再AE56→AED2→逐槽AF69/B240/AEA9→D31E。
        this.registers.side0Timed = 0;
        this.registers.side1Timed = 0;
        this.registers.side0Active = 0;
        this.registers.side1Active = 0;
        const retreat = checkOriginalAutomaticRetreat(
          this.pool,
          this.registers,
        );
        if (retreat) events.push({ type: "automatic-retreat", ...retreat });
        const attrition = tickOriginalSiegeLeaderAttrition(
          this.pool,
          this.registers,
        );
        if (attrition)
          events.push({ type: "siege-leader-attrition", ...attrition });
        const pathFrames = consumeOriginalPathQueue(
          this.pool,
          this.paths,
          this.spatial,
          { buildPath: objectHandlers?.buildPath ?? null },
        );
        if (pathFrames.length)
          events.push({ type: "path-frames", paths: pathFrames });

        // ADE7..AE2C严格逐槽：inactive可B413补员；active执行AF69/B240。
        for (const address of originalTraversalOrder()) {
          const activeAtScan = this.pool.isActive(address);
          if (activeAtScan) {
            updateOriginalActiveObject(
              this,
              address,
              updateMovement
                ? (session, activeAddress) =>
                    updateMovement(session, activeAddress, events)
                : null,
            );
            const side1 = address >= 0x600;
            if (side1) {
              this.registers.side1Active++;
              if (this.pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) !== 0)
                this.registers.side1Timed++;
            } else {
              this.registers.side0Active++;
              if (this.pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) !== 0)
                this.registers.side0Timed++;
            }
          } else
            updateOriginalInactiveObject(
              this.pool,
              this.temps,
              this.spatial,
              this.registers,
              address,
            );
        }

        const activity = recountActivity
          ? recountActivity(this, events)
          : {
              side0Active: this.registers.side0Active & 0xff,
              side1Active: this.registers.side1Active & 0xff,
              side0Timed: this.registers.side0Timed & 0xff,
              side1Timed: this.registers.side1Timed & 0xff,
            };
        if (recountActivity) Object.assign(this.registers, activity);
        events.push({ type: "activity-counts", ...activity });
        events.push({
          type: "battle-balance",
          ...updateOriginalBattleBalance(this.registers),
        });
        // 遍历期间的禁用由本次ADC8重建；胜负在下一帧A6FA观察。
      }
    }

    this.events.push(
      ...events.map((event) => ({ frame: this.frame, ...event })),
    );
    const result = this.#frameResult(events);
    this.frame++;
    return result;
  }

  #checkEnd(events) {
    const registers = this.registers;
    if (registers.winnerState !== 0) {
      registers.endCountdown = (registers.endCountdown - 1) & 0xff;
      if (registers.endCountdown === 0) {
        const previous = registers.winnerState;
        registers.winnerState = previous === 1 ? 1 : 0;
        this.#finish(registers.winnerState, "countdown", events);
        return;
      }
    }
    if ((registers.side0Active & 0xff) === 0) {
      registers.winnerState = 1;
      this.#finish(1, "side0-empty", events);
      return;
    }
    if ((registers.side1Active & 0xff) === 0) {
      registers.winnerState = 0;
      this.#finish(0, "side1-empty", events);
    }
  }

  #finish(winner, reason, events) {
    this.finished = true;
    this.winner = winner;
    events.push({ type: "battle-end", winner, reason });
  }

  #frameResult(events) {
    return {
      frame: this.frame,
      events,
      finished: this.finished,
      winner: this.winner,
      rngCalls: this.rng.calls,
    };
  }

  snapshot() {
    return {
      frame: this.frame,
      objectsInitialized: this.objectsInitialized,
      finished: this.finished,
      winner: this.winner,
      registers: { ...this.registers },
      objectBytes: this.pool.snapshot(),
      effectBytes: this.effects.snapshot(),
      mapObjectBytes: this.mapObjects.snapshot(),
      ...this.spatial.snapshot(),
      ...this.paths.snapshot(),
      tempBytes: this.temps.snapshot(),
      rng: this.rng.snapshot(),
      commands: this.queue.snapshot(),
      events: this.events.map((event) => ({ ...event })),
    };
  }

  restore(snapshot) {
    if (!snapshot || !Number.isInteger(snapshot.frame) || snapshot.frame < 0)
      throw new TypeError("invalid original battle session snapshot");
    this.frame = snapshot.frame;
    this.objectsInitialized = Boolean(snapshot.objectsInitialized);
    this.finished = Boolean(snapshot.finished);
    this.winner = snapshot.winner == null ? null : snapshot.winner & 0xff;
    this.registers = {
      ...createOriginalBattleRegisters(),
      ...(snapshot.registers ?? {}),
    };
    this.pool.restore(snapshot.objectBytes);
    this.effects.restore(
      snapshot.effectBytes ?? new Uint8Array(this.effects.bytes.length),
    );
    this.mapObjects.restore(
      snapshot.mapObjectBytes ?? new Uint8Array(this.mapObjects.bytes.length),
    );
    this.spatial.restore({
      spatialBytes: snapshot.spatialBytes ?? null,
      tileBytes: snapshot.tileBytes ?? null,
      tileAttributeBytes: snapshot.tileAttributeBytes ?? null,
    });
    this.paths.restore({
      queueBytes: snapshot.queueBytes ?? null,
      pathBytes: snapshot.pathBytes ?? null,
      head: snapshot.head ?? 0,
      tail: snapshot.tail ?? 0,
    });
    this.temps.restore(snapshot.tempBytes ?? new Uint8Array(0x40));
    this.rng.restore(snapshot.rng);
    this.queue = new OriginalBattleCommandQueue(snapshot.commands ?? []);
    this.events = (snapshot.events ?? []).map((event) => ({ ...event }));
    return this;
  }
}

export function createOriginalBattleSession(input) {
  return new OriginalBattleSession(input);
}
