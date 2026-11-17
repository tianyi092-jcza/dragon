// D2-EVENT-64 V13 (app level): a real 20-chapter fixture snapshot carries the
// schedule through snapshotState -> saveJSON -> admitSavedScenario ->
// prepareScenario(restore), and the restored world continues the same month
// sequence. No SAVE.DAT, no IDB, no profile, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { gameSaveFixture } from "./gamesavefixture.mjs";
import { saveJSON } from "../web/src/core/gamesavecodec.js";
import { snapshotState, admitSavedScenario } from "../web/src/game/savegame.js";
import { prepareScenario } from "../web/src/game/scenarioassembly.js";
import { consumeScenarioStrategicEvent } from "../web/src/game/navigation/scenarioevents.js";
import {
  ensureStrategicEventSchedule,
  appendCarryEvent,
  recordOverflowEvent,
  rotateStrategicEventSchedule,
  strategicEventEpoch,
} from "../web/src/game/navigation/strategiceventschedule.js";

const talk = (index) => ({ type: 10, arg0: 0, arg1: index, arg2: 0 });

test("V13 real snapshot round-trip preserves carry/overflow and continuation", async () => {
  const fixture = gameSaveFixture();
  const priorFetch = globalThis.fetch;
  globalThis.fetch = fixture.fetch;
  let app;
  try {
    ({ app } = await fixture.snapshot(0));
  } finally {
    globalThis.fetch = priorFetch;
  }
  const sc = app.scenario;
  assert.ok(Array.isArray(sc.strategicEventSlots));
  // The fixture stops before app-level initializeStrategicDiplomacy (2BD9),
  // so seed the month state the fresh game would have.
  sc._strategicEventCursor ??= 0;
  sc._strategicEventDivider ??= 7;
  assert.equal(sc._strategicEventCursor, 0);
  appendCarryEvent(sc, strategicEventEpoch(sc) * 64, talk(7));
  recordOverflowEvent(sc, strategicEventEpoch(sc) * 64 + 3, {
    type: 0x0b,
    arg0: 0,
    arg1: 0,
    arg2: 0,
    region: { minX: 1, maxX: 2, minY: 3, maxY: 4 },
    generation: 2,
  });
  sc.cities[0]._disasterGeneration = 2;
  const expectedSchedule = JSON.parse(JSON.stringify(sc.strategicEventSchedule));

  const saved = snapshotState(app, 0, "D2-EVENT-64 V13 fixture");
  assert.deepEqual(
    saved.webMeta.scenarioRuntimeState.strategicEventSchedule,
    expectedSchedule,
    "snapshotState captured the schedule",
  );
  const text = saveJSON(saved);
  const parsed = JSON.parse(text);
  assert.ok(text.includes("strategicEventSchedule"));

  const world = app.world;
  const admitted = admitSavedScenario(parsed, {
    data: app.data,
    content: app.content,
    world,
  });
  const restored = await prepareScenario({
    ...admitted,
    mode: "restore",
    content: app.content,
    world,
  });
  const restoredSc = restored.scenario;
  assert.deepEqual(restoredSc.strategicEventSchedule, expectedSchedule);
  assert.equal(restoredSc.cities[0]._disasterGeneration, 2);

  const sequence = (target) => {
    const seen = [];
    target._strategicEventDivider = 1;
    const step = consumeScenarioStrategicEvent(target);
    assert.equal(step.status, "dispatch");
    seen.push(step.event.arg1);
    for (const event of step.rest) seen.push(event.arg1);
    const epoch = strategicEventEpoch(target);
    rotateStrategicEventSchedule(target, {
      cursorSlot: target._strategicEventCursor,
      readRecord: (slot) => target.strategicEventSlots[slot],
    });
    assert.equal(strategicEventEpoch(target), epoch + 1);
    target.strategicEventSlots = target.strategicEventSlots
      .slice(64)
      .concat(Array(64).fill(null));
    target._strategicEventCursor = 0;
    target._strategicEventDivider = 1;
    const after = consumeScenarioStrategicEvent(target);
    if (after.status === "dispatch") seen.push(after.event.arg1);
    return seen;
  };
  const live = sequence(sc);
  const replay = sequence(restoredSc);
  assert.deepEqual(replay, live);
  assert.equal(replay[0], 7, "carry stays first");
  assert.ok(replay.includes(undefined) === false);
  assert.equal(
    ensureStrategicEventSchedule(restoredSc).entries.length,
    ensureStrategicEventSchedule(sc).entries.length,
  );
});
