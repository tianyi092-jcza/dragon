import assert from "node:assert/strict";

import {
  enqueueDeficitTrustEvent,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

function fixture({ funds = -39, bellicosity = 8, bytes = [] } = {}) {
  const messages = [];
  let gameOverChecks = 0;
  const scenario = {
    player_faction: 0,
    trust: 100,
    factions: [
      {
        idx: 0,
        active: true,
        capital: 0,
        gold: funds,
        money: funds,
        bellicosity,
      },
    ],
    cities: [{ idx: 0, faction: 0 }],
    generals: [],
    legions: [],
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  const app = {
    scenario,
    originalRng: { nextByte: () => bytes.shift() ?? 0 },
    gamebar: {
      enqueueStrategicMessage(message) {
        messages.push(message);
      },
    },
    checkTrustGameOver() {
      gameOverChecks++;
    },
  };
  return { app, scenario, messages, checks: () => gameOverChecks };
}

// Non-negative funds and negative magnitude below 39 return before RNG.
{
  let calls = 0;
  const positive = fixture({ funds: 0 });
  positive.app.originalRng.nextByte = () => {
    calls++;
    return 0;
  };
  assert.equal(enqueueDeficitTrustEvent(positive.app), false);
  const shallow = fixture({ funds: -38 });
  shallow.app.originalRng.nextByte = () => {
    calls++;
    return 0;
  };
  assert.equal(enqueueDeficitTrustEvent(shallow.app), false);
  assert.equal(calls, 0);
}

// Gate consumes one byte; (rng&15)>=bellicosity produces no event.
{
  const { app, scenario } = fixture({ funds: -39, bellicosity: 8, bytes: [8] });
  assert.equal(enqueueDeficitTrustEvent(app), false);
  assert.equal(scenario.strategicEventSlots.filter(Boolean).length, 0);
}

// Successful 0x57FE gate then lets 0x2FBF consume its independent insertion RNG.
{
  const { app, scenario } = fixture({
    funds: -39,
    bellicosity: 8,
    bytes: [7, 0x10],
  });
  assert.equal(enqueueDeficitTrustEvent(app), true);
  assert.deepEqual(scenario.strategicEventSlots[4], {
    type: 13,
    arg0: 0,
    talkIndex: 0x196,
  });
}

// 0x3507: TALK51 equivalent and trust -50, then immediate game-over check.
{
  const { app, scenario, messages, checks } = fixture();
  scenario.strategicEventSlots[0] = {
    type: 13,
    arg0: 0,
    talkIndex: 0x196,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.trust, 50);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "deficit-trust-penalty");
  assert.equal(messages[0].talkIndex, 0x196);
  assert.equal(checks(), 1);
}

process.stdout.write(
  "deficit trust event OK: 0x57FE gate/serialization and 0x3507 trust-50 dispatch\n",
);
