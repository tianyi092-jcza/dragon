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
import { scenarioGridRoadContext, scenarioNativeRoadContext } from "../game/scenarioassembly.js";
import { hasNativeLegionSlots } from "../game/nativelegions.js";
import { performScenarioGeneralRatingRefresh } from "../game/navigation/scenariogeneralrating.js";

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
          return api.applyBattleResult(
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
    startFieldBattle(A, D, gridTerrain) {
      this.engagementFx.reset();
      return openStrategicBattle(
        this,
        () => {
          // Native2873 runs first-D classification and original BP selection,
          // then stops before4E5C. This later selected-D/message entry has no original caller
          // ABI and must not restart classification or a different lifecycle.
          if (
            scenarioNativeRoadContext(this.scenario) ||
            (hasNativeLegionSlots(this.scenario) && !(scenarioGridRoadContext(this.scenario) && gridTerrain))
          )
            throw new RangeError(
              "Web engineering Uncovered native field terrain pointer/AL ABI at 4B63",
            );
          const terrain = gridTerrain ?? api.classifyFieldBattleTerrain(
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
          return api.applyFieldBattleResult(
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
  if (app.checkFormalCurrent?.() === false) return false;
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
      if (app.checkFormalCurrent?.() === false || !continuation.claim()) return;
      try {
        app.originalRng = exit.strategicRng;
        app.activeBattleRng = app.originalRng;
        // 1B7E→533D→55A6, before applyExit's 474A/fate continuation.
        // Native queued battles have their own boundary in applyNativeTacticalExit.
        performScenarioGeneralRatingRefresh(app.scenario);
        const outcome = applyExit(exit);
        app.score?.endBattle?.(battle);
        if (!(typeof outcome === 'string' && outcome.endsWith('-suspended'))) finishDeferredLegionDaily(app, continuation.batch, continuation.ticket);
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
