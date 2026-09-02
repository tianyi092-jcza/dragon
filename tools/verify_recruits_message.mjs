import assert from "node:assert/strict";

import { monthlyAppear } from "../web/src/game/recruits.js";

function fixture({ playerFaction = 0, targetFaction = 0 } = {}) {
  const messages = [];
  const scenario = {
    player_faction: playerFaction,
    start: { year: 200, month: 1 },
    factions: [
      { idx: 0, monarch: "曹操", dead: false },
      { idx: 1, monarch: "劉備", dead: false },
    ],
    generals: [
      {
        idx: 0,
        name: "趙雲",
        portrait: 0,
        appear_months: 1,
        join_faction: targetFaction,
        faction: null,
        status: 0,
      },
    ],
  };
  const app = {
    scenario,
    clock: { year: 200, month: 2 },
    hud: { flashEvent: (message) => messages.push({ hud: message }) },
    gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
  };
  return { app, scenario, messages };
}

// 玩家势力的新武将投奔使用TALK41权威FIFO，不再走HUD旁路。
{
  const { app, scenario, messages } = fixture();
  monthlyAppear(app);
  assert.equal(scenario.generals[0].faction, 0);
  assert.deepEqual(
    messages.map((message) => [message.kind, message.talkIndex]),
    [["general-appeared", 41]],
  );
}

// 非玩家势力投奔静默处理。
{
  const { app, scenario, messages } = fixture({ targetFaction: 1 });
  monthlyAppear(app);
  assert.equal(scenario.generals[0].faction, 1);
  assert.deepEqual(messages, []);
}

process.stdout.write(
  "recruits message OK: player arrival TALK41, AI arrival silent\n",
);
