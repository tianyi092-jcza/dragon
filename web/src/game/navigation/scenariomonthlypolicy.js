import {
  nativeMonthlyPolicyWord,
  refreshNativeMonthlyPolicyViews,
  writeNativeMonthlyPolicyWord,
} from "../nativemonthlypolicy.js";
import { originalActivateMonthlyPolicy53A6 } from "./originalmonthlypolicy.js";

/** Scenario adapter for the fixed CS:D08..D17 policy bytes. */
export function performScenarioMonthlyPolicyActivation(sc, redraw = null) {
  return originalActivateMonthlyPolicy53A6({
    readPolicyWord(offset, at) {
      return nativeMonthlyPolicyWord(sc, offset, at);
    },
    writePolicyWord(offset, value, at) {
      writeNativeMonthlyPolicyWord(sc, offset, value, at);
    },
    refreshStrategicDisplay(mask) {
      // 5E80 only redraws presentation (mask 0Eh = trust/funds/three pools).
      // Synchronize Web views at the same boundary before the optional renderer.
      refreshNativeMonthlyPolicyViews(sc);
      if (redraw != null) {
        if (typeof redraw !== "function")
          throw new TypeError("Invalid native monthly policy redraw boundary");
        redraw(mask);
      }
    },
  });
}
