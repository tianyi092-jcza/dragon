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

import {
  OriginalBattleMessages,
  cloneOriginalMessageData,
} from "./originalmessages.js";
import {
  OriginalBattleDisplay,
  updateOriginalAttributeDisplays,
} from "./originaldisplay.js";

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
    playerGroupStatusIcons = [0, 0, 0, 0, 0, 0],
    objectDisplays = Array(96).fill(null),
    talkContext = null,
    talkCatalog = null,
    messages = null,
    nativeDisplay = null,
    nativeDisplayOperations = [],
    nativeDisplayBoundary = 0,
    nativeInitialCommitPending = false,
    attributeDisplays = [],
    effectDisplays = [],
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
    // C673 framebuffer state: internal commands 6/7/8 retain the prior icon.
    this.playerGroupStatusIcons = [...playerGroupStatusIcons];
    // Last DA1C unit/death draw, independent of the next rule STATE phase.
    this.objectDisplays = objectDisplays.map((display) =>
      display ? { ...display } : null,
    );
    this.events = structuredClone(events);
    this.nativeDisplay = nativeDisplay
      ? OriginalBattleDisplay.fromSnapshot(nativeDisplay)
      : null;
    this.nativeDisplayOperations = structuredClone(nativeDisplayOperations);
    this.nativeDisplayBoundary = Math.max(0, nativeDisplayBoundary | 0);
    this.nativeInitialCommitPending = Boolean(nativeInitialCommitPending);
    this.attributeDisplays = new Map(
      attributeDisplays.map((capture) => [capture.address, { ...capture }]),
    );
    this.effectDisplays = new Map(
      effectDisplays.map((capture) => [capture.address, { ...capture }]),
    );
    this.messages = new OriginalBattleMessages({
      context: talkContext,
      catalog: talkCatalog,
      snapshot: messages,
    });
  }

  emitTalk(side, selector, source) {
    const event = this.messages.show(this.registers, side, selector, source);
    this.recordMessageEvent(event);
    return event;
  }

  recordMessageEvent(event) {
    if (this._messageFrameEvents) this._messageFrameEvents.push(event);
    else this.events.push({ frame: this.frame, ...event });
  }

  messageInput(hitId, button) {
    const event = this.messages.input(this.registers, hitId, button);
    if (event) this.recordMessageEvent(event);
    return event;
  }

  finalizeObject(address, options) {
    const result = finalizeOriginalBattleObject(
      this.pool,
      this.temps,
      this.spatial,
      address,
      options,
    );
    this.objectDisplays[address >>> 5] = null;
    return result;
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

  /** 0x9ACE初始化：临时记录必须先由0x9E97等价裁剪填入。
   * D31C/D31D仍保留9A92写入的FFFF低字节，直到首个ADC8重建。 */
  initializeObjects({ commanders = [], mode = this.registers.mode } = {}) {
    const result = initializeOriginalBattleObjects({
      pool: this.pool,
      temps: this.temps,
      commanders,
      mode,
      rng: this.rng,
    });
    this.objectsInitialized = true;
    return result;
  }

  /** 99F3→DC9D→99CB：初始地形和一次B941属性访问。
   * 99CB不清D348；首个A065必须再次执行DC9D。 */
  initializeNativeDisplay({ tileBytes, attributes } = {}) {
    if (this.nativeDisplay) return false;
    if (!tileBytes || tileBytes.length < 0x1000)
      throw new TypeError("native display requires 4096 map tiles");
    if (!attributes || attributes.length < 0x800)
      throw new TypeError("native display requires MDL tile attributes");
    this.nativeDisplay = new OriginalBattleDisplay();
    const operations = [{ type: "terrain-refresh", source: "99C2/DC9D" }];
    this.nativeDisplay.terrain(tileBytes, attributes);
    const captures = updateOriginalAttributeDisplays(
      this.mapObjects,
      this.nativeDisplay,
    );
    for (const capture of captures) {
      this.attributeDisplays.set(capture.address, { ...capture });
      operations.push({ type: "attribute", ...capture });
    }
    this.nativeDisplayBoundary++;
    this.nativeDisplayOperations = operations;
    this.nativeInitialCommitPending = true;
    this.registers.mapRedraw = 1;
    return true;
  }

  consumeInitialNativeCommit() {
    if (!this.nativeInitialCommitPending || !this.nativeDisplay) return null;
    this.nativeInitialCommitPending = false;
    return {
      boundary: this.nativeDisplayBoundary,
      source: "99CB/DDB4",
      operations: structuredClone(this.nativeDisplayOperations),
    };
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
          if (result.wallMessage) {
            const messageEvents = this.messages.showWall(
              this.registers,
              result.metric,
              this.mapObjects.read8(targetAddress, 0),
              targetAddress,
            );
            for (const event of messageEvents) this.recordMessageEvent(event);
          }
          this.enqueuePath(attackerAddress);
          return result;
        },
        ...(options ?? {}),
      },
    );
  }

  /** 一个调用严格代表一个原版逻辑帧，不接受浏览器dt。 */
  tick(options = {}) {
    try {
      return this.tickFrame(options);
    } finally {
      this._messageFrameEvents = null;
    }
  }

  tickFrame({
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
    const displayOperations = [];
    this._messageFrameEvents = events;

    // A065入口：正常显示时消费并清D348；C234把A06A改JMP时两者都跳过。
    // A12A照常令D318自增并触发D322/D324/D326的呈现调度。
    if (
      !this.registers.battlefieldHidden &&
      (this.registers.mapRedraw & 0xff) !== 0
    ) {
      events.push({ type: "map-redraw" });
      if (this.nativeDisplay) {
        this.nativeDisplay.terrain(
          this.spatial.tiles,
          this.spatial.tileAttributes,
        );
        displayOperations.push({
          type: "terrain-refresh",
          source: "A06A/DC9D",
        });
      }
      this.registers.mapRedraw = 0;
    }
    // A12A INC byte[D318]: preserve D319, including nonzero snapshot values.
    const previousCounter = this.registers.tacticalFrameCounter ?? 0;
    this.registers.tacticalFrameCounter =
      (previousCounter & 0xff00) | ((previousCounter + 1) & 0xff);
    // A12F loads AX once. C3B8 does NOT preserve AX: C3F6 sets AH=1,
    // C3E3/C3E5 set AL=1B+side, E41B preserves that value. Later compares
    // use 011B/011C after a close, not D318 again (raw bounded oracle).
    let comparisonAx = this.registers.tacticalFrameCounter;
    for (const side of [0, 1]) {
      const marker = side === 0 ? "side0MarkerAt" : "side1MarkerAt";
      if ((this.registers[marker] & 0xffff) === comparisonAx) {
        events.push(this.messages.close(this.registers, side, "expiry"));
        events.push({ type: "side-marker", side });
        comparisonAx = 0x011b + side;
      }
    }
    if ((this.registers.wallMarkerAt & 0xffff) === comparisonAx) {
      events.push(this.messages.closeWall(this.registers, "expiry"));
      events.push({ type: "wall-marker" });
    }

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
            wallTargetX: this.registers.themeFlag, // CB13/CB8C patch AB4F.
            heightDescriptor: (index) => this.spatial.heightDescriptor(index),
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
              this.finalizeObject(address, { creditSurvivor: true }),
            ...(handlers.leaderHandlers ?? {}),
            refresh: ({ address, command }) => {
              this.playerGroupStatusIcons[address >>> 8] = command;
              handlers.leaderHandlers?.refresh?.({ address, command });
            },
          },
          childHandlers: {
            formationExit: ({ address }) =>
              this.finalizeObject(address, { creditSurvivor: true }),
            ...(handlers.childHandlers ?? {}),
          },
          side0: { ...handlers.side0 },
          side1: { ...handlers.side1 },
        });
        objectsUpdated = true;
      }

      // A082→B941发生在ADC8之前；效果槽升序执行erase/move/draw，随后
      // 属性槽升序执行BB10捕获并递增phase。Canvas只读取这些捕获。
      if (objectsUpdated || recountActivity) {
        const externalRender = objectHandlers?.effectRender ?? {};
        const effectFrames = updateOriginalAttackEffects(
          this.pool,
          this.effects,
          this.spatial,
          {
            events,
            render: {
              erase: (capture) => {
                this.nativeDisplay?.erase(capture);
                this.effectDisplays.delete(capture.address);
                displayOperations.push({ type: "effect-erase", ...capture });
                externalRender.erase?.(capture);
              },
              draw: (capture) => {
                this.nativeDisplay?.draw(capture);
                this.effectDisplays.set(capture.address, { ...capture });
                displayOperations.push({ type: "effect-draw", ...capture });
                externalRender.draw?.(capture);
              },
            },
          },
        );
        if (effectFrames.length)
          events.push({ type: "effect-frames", effects: effectFrames });
      }
      const attributeCaptures = updateOriginalAttributeDisplays(
        this.mapObjects,
        this.nativeDisplay,
      );
      for (const capture of attributeCaptures) {
        this.attributeDisplays.set(capture.address, { ...capture });
        displayOperations.push({ type: "attribute", ...capture });
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
        if (retreat) {
          this.emitTalk(retreat.side, 0x1b0, "AE56/A8F6");
          events.push({ type: "automatic-retreat", ...retreat });
        }
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
          const previousDisplay = this.objectDisplays[address >>> 5];
          const activeAtScan = this.pool.isActive(address);
          if (activeAtScan) {
            const objectFrame = updateOriginalActiveObject(
              this,
              address,
              updateMovement
                ? (session, activeAddress) =>
                    updateMovement(session, activeAddress, events)
                : null,
            );
            this.objectDisplays[address >>> 5] = objectFrame.display;
            if (previousDisplay) {
              this.nativeDisplay?.erase({ ...previousDisplay, pair: true });
              displayOperations.push({
                type: "unit-erase",
                ...previousDisplay,
                pair: true,
              });
            }
            if (objectFrame.display) {
              const capture = {
                ...objectFrame.display,
                code: 0xc0 + objectFrame.display.frame * 2,
                pair: true,
              };
              this.nativeDisplay?.draw(capture);
              displayOperations.push({ type: "unit-draw", ...capture });
            }
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
          } else {
            const objectFrame = updateOriginalInactiveObject(
              this.pool,
              this.temps,
              this.spatial,
              this.registers,
              address,
            );
            this.objectDisplays[address >>> 5] = objectFrame.display ?? null;
            if (previousDisplay) {
              this.nativeDisplay?.erase({ ...previousDisplay, pair: true });
              displayOperations.push({
                type: "unit-erase",
                ...previousDisplay,
                pair: true,
              });
            }
            if (objectFrame.display) {
              const capture = {
                ...objectFrame.display,
                code: 0xc0 + objectFrame.display.frame * 2,
                pair: true,
              };
              this.nativeDisplay?.draw(capture);
              displayOperations.push({ type: "unit-draw", ...capture });
            }
            if (objectFrame.statusIcon != null) {
              this.playerGroupStatusIcons[address >>> 8] =
                objectFrame.statusIcon;
              objectHandlers?.leaderHandlers?.refresh?.({
                address,
                command: objectFrame.statusIcon,
              });
            }
          }
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
      if (this.nativeDisplay) {
        this.nativeDisplayBoundary++;
        this.nativeDisplayOperations = structuredClone(displayOperations);
        events.push({
          type: "native-display-commit",
          boundary: this.nativeDisplayBoundary,
          operations: structuredClone(displayOperations),
        });
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
      // A6FA/9FDC terminal frames bypass B941, ADC8 and DDB4.
      displayCommitted: !this.finished,
    };
  }

  snapshot() {
    return {
      frame: this.frame,
      objectsInitialized: this.objectsInitialized,
      finished: this.finished,
      winner: this.winner,
      registers: { ...this.registers },
      playerGroupStatusIcons: [...this.playerGroupStatusIcons],
      objectDisplays: this.objectDisplays.map((display) =>
        display ? { ...display } : null,
      ),
      objectBytes: this.pool.snapshot(),
      effectBytes: this.effects.snapshot(),
      mapObjectBytes: this.mapObjects.snapshot(),
      ...this.spatial.snapshot(),
      ...this.paths.snapshot(),
      tempBytes: this.temps.snapshot(),
      rng: this.rng.snapshot(),
      commands: this.queue.snapshot(),
      messages: this.messages.snapshot(),
      nativeDisplay: this.nativeDisplay?.snapshot() ?? null,
      nativeDisplayOperations: structuredClone(this.nativeDisplayOperations),
      nativeDisplayBoundary: this.nativeDisplayBoundary,
      nativeInitialCommitPending: this.nativeInitialCommitPending,
      attributeDisplays: [...this.attributeDisplays.values()].map((v) => ({
        ...v,
      })),
      effectDisplays: [...this.effectDisplays.values()].map((v) => ({ ...v })),
      events: structuredClone(this.events),
    };
  }

  restore(snapshot) {
    if (!snapshot || !Number.isInteger(snapshot.frame) || snapshot.frame < 0)
      throw new TypeError("invalid original battle session snapshot");
    const preparedMessages = this.messages.prepareRestore(
      snapshot.messages,
      snapshot.registers,
    );
    // Events retain message captures too. No message/event clone may fail after
    // committing rules. This is not an audit of unrelated pool restore errors.
    const preparedEvents = cloneOriginalMessageData(snapshot.events ?? []);
    this.frame = snapshot.frame;
    this.objectsInitialized = Boolean(snapshot.objectsInitialized);
    this.finished = Boolean(snapshot.finished);
    this.winner = snapshot.winner == null ? null : snapshot.winner & 0xff;
    this.registers = {
      ...createOriginalBattleRegisters(),
      ...(snapshot.registers ?? {}),
    };
    this.playerGroupStatusIcons = [
      ...(snapshot.playerGroupStatusIcons ?? [0, 0, 0, 0, 0, 0]),
    ];
    this.objectDisplays = (snapshot.objectDisplays ?? Array(96).fill(null)).map(
      (display) => (display ? { ...display } : null),
    );
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
    this.nativeDisplay = snapshot.nativeDisplay
      ? OriginalBattleDisplay.fromSnapshot(snapshot.nativeDisplay)
      : null;
    this.nativeDisplayOperations = structuredClone(
      snapshot.nativeDisplayOperations ?? [],
    );
    this.nativeDisplayBoundary = Math.max(
      0,
      snapshot.nativeDisplayBoundary | 0,
    );
    this.nativeInitialCommitPending = Boolean(
      snapshot.nativeInitialCommitPending,
    );
    this.attributeDisplays = new Map(
      (snapshot.attributeDisplays ?? []).map((capture) => [
        capture.address,
        { ...capture },
      ]),
    );
    this.effectDisplays = new Map(
      (snapshot.effectDisplays ?? []).map((capture) => [
        capture.address,
        { ...capture },
      ]),
    );
    this.events = preparedEvents;
    this.messages = preparedMessages;
    return this;
  }
}

export function createOriginalBattleSession(input) {
  return new OriginalBattleSession(input);
}
