import assert from "node:assert/strict";

import {
  enqueueDelayedStrategicEvent,
  hasPendingStrategicEvent,
  resolveStrategicNegotiation,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  applyWebMetaToState,
  snapshotState,
} from "../web/src/game/savegame.js";

function scenarioFixture() {
  const slots = Array(256).fill(null);
  return {
    player_faction: 0,
    trust: 255,
    factions: [
      { idx: 0, active: true, monarch_idx: 0, bellicosity: 8 },
      { idx: 1, active: true, monarch_idx: 1, bellicosity: 10 },
      { idx: 2, active: true, monarch_idx: 2, bellicosity: 12 },
    ],
    generals: [
      { idx: 0, name: "曹操", ability: { politics: 10 } },
      { idx: 1, name: "劉備", ability: { politics: 9 } },
      { idx: 2, name: "呂布", ability: { politics: 4 } },
      { idx: 3, name: "荀彧", ability: { politics: 14 } },
    ],
    cities: [],
    legions: [],
    diplomacy: [
      [0xff, 0xd0, 0x20],
      [0xd0, 0xff, 0x20],
      [0x20, 0x20, 0xff],
    ],
    envoys: {
      1: { name: "荀彧", gen_idx: 3, budget: 0 },
      2: { name: "荀彧", gen_idx: 3, budget: 0 },
    },
    strategicEventSlots: slots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
}

const sc = scenarioFixture();
const app = { scenario: sc };
assert.equal(
  enqueueDelayedStrategicEvent(app, { type: 6, arg0: 1, arg1: 0 }, 0x14),
  true,
);
assert.equal(sc.strategicEventSlots[20].type, 6);
assert.equal(
  hasPendingStrategicEvent(sc, 6, { arg0: 1 }),
  true,
  "0x304E等价查询应识别尚未消费的type6目标",
);
sc.strategicEventSlots[20] = { type: 10 };
assert.equal(
  enqueueDelayedStrategicEvent(app, { type: 7, arg0: 1, arg1: 2 }, 0x14),
  true,
);
assert.deepEqual(sc.strategicEventSlots[21], {
  type: 7,
  arg0: 1,
  arg1: 2,
});

const dispatched = [];
const dispatchSc = scenarioFixture();
dispatchSc.strategicEventSlots[0] = { type: 6, arg0: 1, arg1: 0 };
dispatchSc.strategicEventSlots[1] = { type: 7, arg0: 1, arg1: 2 };
const dispatchApp = {
  scenario: dispatchSc,
  gamebar: {
    showTruceNegotiationResult(payload) {
      dispatched.push([6, payload.targetFaction.idx, payload.envoyName]);
    },
    showAssistanceNegotiationResult(payload) {
      dispatched.push([
        7,
        payload.allyFaction.idx,
        payload.targetFaction.idx,
        payload.envoyName,
      ]);
    },
  },
};
assert.equal(tickStrategicWarEvents(dispatchApp), true);
assert.deepEqual(dispatched[0], [6, 1, "荀彧"]);
dispatchSc._strategicEventDivider = 1;
assert.equal(tickStrategicWarEvents(dispatchApp), true);
assert.deepEqual(dispatched[1], [7, 1, 2, "荀彧"]);

function resolveNegotiation(sc, otherFaction, assistance, rngByte = 0) {
  return resolveStrategicNegotiation(
    {
      scenario: sc,
      originalRng: { nextByte: () => rngByte },
    },
    otherFaction,
    assistance,
  );
}
const resultSc = scenarioFixture();
resultSc.factions[1].target_faction = 0;
assert.deepEqual(resolveNegotiation(resultSc, resultSc.factions[1], false), {
  outcome: 2,
  goldRequired: 0,
});
resultSc.factions[1].target_faction = null;
resultSc.diplomacy[0][1] = 0xe4;
assert.deepEqual(resolveNegotiation(resultSc, resultSc.factions[1], false), {
  outcome: 0,
  goldRequired: 0,
});
resultSc.diplomacy[0][1] = 0xc8;
resultSc.diplomacy[1][0] = 0xa0;
assert.deepEqual(resolveNegotiation(resultSc, resultSc.factions[1], true), {
  outcome: 2,
  goldRequired: 33000,
});
resultSc.diplomacy[0][1] = 0xe4;
resultSc.diplomacy[1][0] = 0xe4;
assert.deepEqual(resolveNegotiation(resultSc, resultSc.factions[1], true), {
  outcome: 1,
  goldRequired: 4000,
});

const legacyState = scenarioFixture();
delete legacyState.strategicEventSlots;
legacyState.pendingTruceNegotiations = [
  { targetFactionIdx: 1, envoyName: "荀彧", daysLeft: 7 },
];
legacyState.pendingAssistanceNegotiations = [
  { allyFactionIdx: 1, targetFactionIdx: 2, envoyName: "荀彧", daysLeft: 9 },
];
legacyState._strategicEventDivider = 1;
const legacyCalls = [];
assert.equal(
  tickStrategicWarEvents({
    scenario: legacyState,
    gamebar: {
      showTruceNegotiationResult(payload) {
        legacyCalls.push([6, payload.targetFaction.idx]);
      },
    },
  }),
  true,
);
assert.deepEqual(legacyCalls, [[6, 1]]);
assert.equal(Object.hasOwn(legacyState, "pendingTruceNegotiations"), false);
assert.equal(
  Object.hasOwn(legacyState, "pendingAssistanceNegotiations"),
  false,
);
assert.deepEqual(legacyState.strategicEventSlots[1], {
  type: 7,
  arg0: 1,
  arg1: 2,
});

const legacySidecarState = scenarioFixture();
delete legacySidecarState.strategicEventSlots;
applyWebMetaToState(legacySidecarState, {
  scenarioRuntimeState: {
    pendingTruceNegotiations: [{ targetFactionIdx: 1, daysLeft: 5 }],
    pendingAssistanceNegotiations: [
      { allyFactionIdx: 1, targetFactionIdx: 2, daysLeft: 6 },
    ],
  },
});
legacySidecarState._strategicEventDivider = 1;
tickStrategicWarEvents({ scenario: legacySidecarState });
assert.equal(
  Object.hasOwn(legacySidecarState, "pendingTruceNegotiations"),
  false,
);
assert.deepEqual(legacySidecarState.strategicEventSlots[1], {
  type: 7,
  arg0: 1,
  arg1: 2,
});

const saveSc = scenarioFixture();
saveSc.strategicEventSlots[37] = { type: 7, arg0: 1, arg1: 2 };
const saveApp = {
  scenarioIdx: 0,
  scenario: saveSc,
  clock: {
    year: 190,
    month: 1,
    day: 1,
    sub: 0,
    hour: 0,
    daysInMonth: 31,
    _pendingDayAdvance: false,
  },
  battleView: { active: false },
};
const saved = snapshotState(saveApp, 0, "event-wheel");
assert.equal(
  Object.hasOwn(
    saved.webMeta.scenarioRuntimeState,
    "pendingAssistanceNegotiations",
  ),
  false,
);
const restored = applyWebMetaToState(
  structuredClone(saved.state),
  saved.webMeta,
);
assert.deepEqual(restored.strategicEventSlots[37], {
  type: 7,
  arg0: 1,
  arg1: 2,
});

process.stdout.write(
  "strategic negotiation events OK: type6/7 use 0x301C slots, dispatch typed args, migrate legacy queues, save wheel\n",
);
