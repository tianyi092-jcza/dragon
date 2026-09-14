// Web ownership/error boundary around tactical startup, not a DOS return.
import { captureLegionContinuation } from "../game/legioncontinuation.js";
import { holdFailedStrategicUpdate } from "../game/strategicfailure.js";
import {
  cancelLegionSlotBatch,
  finishDeferredLegionDaily,
  applyBattleResult,
  applyFieldBattleResult,
} from "../game/ai.js";
import { createBattle, createFieldBattle } from "../game/tacticalbattle.js";
import { classifyFieldBattleTerrain } from "../game/fieldterrain.js";

// Production installs the default services once. Tests replace only battle
// construction/result calculation, not the continuation or slot scheduler.
export function createStrategicBattleMethods(services = {}) {
  const api = {
    createBattle,
    createFieldBattle,
    classifyFieldBattleTerrain,
    applyBattleResult,
    applyFieldBattleResult,
    ...services,
  };
  return {
    startBattle(A, city, D = null, defenders) {
      if (!Array.isArray(defenders))
        throw new TypeError("Missing pre-battle defender list");
      this.engagementFx.reset();
      return openStrategicBattle(
        this,
        () =>
          api.createBattle(
            this.scenario,
            A,
            city,
            this.battleMaps,
            D,
            this.originalRng?.snapshot?.(),
          ),
        (exit) => {
          api.applyBattleResult(
            this,
            A,
            city,
            exit.winnerName,
            null,
            null,
            null,
            null,
            D,
            null,
            null,
            { ...exit, defenders },
          );
        },
      );
    },
    startFieldBattle(A, D) {
      this.engagementFx.reset();
      return openStrategicBattle(
        this,
        () => {
          const terrain = api.classifyFieldBattleTerrain(
            A,
            D,
            this.scenario.player_faction,
            this.originalRng,
          );
          return api.createFieldBattle(
            this.scenario,
            A,
            D,
            this.battleMaps,
            terrain,
            this.originalRng?.snapshot?.(),
          );
        },
        (exit) => {
          api.applyFieldBattleResult(
            this,
            A,
            D,
            exit.winnerName,
            null,
            null,
            null,
            null,
            exit,
          );
        },
      );
    },
  };
}

export async function openStrategicBattle(app, create, applyExit) {
  const continuation = captureLegionContinuation(app);
  const fail = (error) => {
    if (!continuation.isCurrent()) return false;
    // Startup may have partially changed state. Do not invent a battle result,
    // advance weather/calendar, or silently resume an incomplete action.
    cancelLegionSlotBatch(app);
    holdFailedStrategicUpdate(app, error);
    return false;
  };
  try {
    const battle = create();
    return await app.battleView.open(battle, (exit) => {
      if (!continuation.claim()) return;
      try {
        app.originalRng = exit.strategicRng;
        app.activeBattleRng = app.originalRng;
        applyExit(exit);
        app.score?.endBattle?.(battle);
        finishDeferredLegionDaily(app, continuation.batch, continuation.ticket);
        app.hud?.buildLegend?.();
        app.view?.draw?.();
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    if (continuation.claim()) fail(error);
    return false; // Replaced scene, completed result or stale startup.
  }
}
