import assert from "node:assert/strict";

import { monthlyAI } from "../web/src/game/ai.js";
import { checkTrustGameOver } from "../web/src/game/commands.js";

// 产品决定：玩家统一全部据点后留在战略地图，不再启动D7END结局画。
{
  const shown = [];
  const scenario = {
    player_faction: 0,
    factions: [{ idx: 0, dead: false, monarch: "曹操" }],
    cities: [
      { idx: 0, faction: 0 },
      { idx: 1, faction: 0 },
      { idx: 2, faction: 0 },
    ],
    legions: [
      { slot: 1, dead: false },
      { slot: 2, dead: true },
    ],
  };
  monthlyAI({
    scenario,
    scenarioIdx: 0,
    endView: { show: (options) => shown.push(options) },
  });
  assert.deepEqual(shown, []);
  assert.deepEqual(scenario.legions, [{ slot: 1, dead: false }]);
}

// 只取消通关过场；信赖归零GAME OVER仍保留原有结束视图。
{
  const shown = [];
  const app = {
    scenario: { trust: 0 },
    clock: { speed: 5 },
    endView: { show: (options) => shown.push(options) },
  };
  assert.equal(checkTrustGameOver(app), true);
  assert.equal(app.clock.speed, 0);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].img, "grf/gameover.png");
}

process.stdout.write(
  "victory cutscene disabled: unified games stay on map; GAME OVER remains\n",
);
