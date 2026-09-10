import assert from "node:assert/strict";

import { cityDaily } from "../web/src/game/ai.js";
import {
  applyWebMetaToState,
  snapshotState,
} from "../web/src/game/savegame.js";
import {
  normalizeDisasterMapObjectState,
  tickStrategicWeather,
} from "../web/src/game/weather.js";

function byteRng(bytes) {
  return {
    calls: 0,
    nextByte() {
      this.calls++;
      return bytes.shift() ?? 0xff;
    },
  };
}

function fireObject(extra = {}) {
  return {
    active: true,
    kind: 1,
    group: 1,
    x: 100,
    y: 80,
    raw6: 1,
    raw7: 1,
    timer: 1,
    interval: 16,
    frame: 1,
    ...extra,
  };
}

// 0x2459：静态大火对象每16个战略tick推进八相，本身不消费RNG。
{
  const scenario = {
    disasterMapObjects: [fireObject()],
    weatherClouds: [],
  };
  normalizeDisasterMapObjectState(scenario);
  const rng = byteRng([]);
  assert.equal(tickStrategicWeather(scenario, rng), true);
  assert.equal(rng.calls, 0);
  assert.equal(scenario.disasterMapObjects.length, 16);
  assert.equal(scenario.disasterMapObjects[0].timer, 16);
  assert.equal(scenario.disasterMapObjects[0].frame, 2);
  tickStrategicWeather(scenario, rng);
  assert.equal(scenario.disasterMapObjects[0].timer, 15);
  assert.equal(scenario.disasterMapObjects[0].frame, 2);
  scenario.disasterMapObjects[0].timer = 1;
  scenario.disasterMapObjects[0].frame = 7;
  tickStrategicWeather(scenario, rng);
  assert.equal(scenario.disasterMapObjects[0].frame, 0);
  assert.equal(rng.calls, 0);
}

// 0x4269没有火灾专用公式：+0x15=7持续生效，治理后每次轮到该城都再结算。
{
  const city = {
    faction: 1,
    growth: 100,
    defence: 3,
    prod: 0x1234,
    troops: 100,
    troops_cap: 200,
    disaster_event: 7,
  };
  const rng = byteRng(Array(6).fill(0xff));
  const scenario = { player_faction: 0, cities: [city], generals: [] };
  cityDaily(scenario, rng);
  assert.deepEqual(city, {
    faction: 1,
    growth: 96,
    defence: 0,
    prod: 0x1222,
    troops: 98,
    troops_cap: 200,
    disaster_event: 7,
  });
  cityDaily(scenario, rng);
  assert.deepEqual(city, {
    faction: 1,
    growth: 89,
    defence: 0,
    prod: 0x1203,
    troops: 95,
    troops_cap: 200,
    disaster_event: 7,
  });
  assert.equal(
    rng.calls,
    6,
    "本例城兵未满，故每次0x4194消费三字节；0x4269为零RNG",
  );
}

// 旧紧凑数组按原顺序迁入低槽。
{
  const oldState = {
    disasterMapObjects: [fireObject({ frame: 6 }), fireObject({ x: 120 })],
  };
  normalizeDisasterMapObjectState(oldState);
  assert.equal(oldState.disasterMapObjects.length, 16);
  assert.equal(oldState.disasterMapObjects[0].frame, 6);
  assert.equal(oldState.disasterMapObjects[1].x, 120);
  assert.equal(oldState.disasterMapObjects[2], null);
}

// 完整snapshot→sidecar restore→load normalization保留稀疏槽、伤害、removal和RNG。
{
  const slots = Array(16).fill(null);
  slots[5] = fireObject({ frame: 6 });
  const removal = { type: 12, arg0: 0, cityPointer: 0x840 };
  const strategicEventSlots = Array(256).fill(null);
  strategicEventSlots[9] = removal;
  const scenario = {
    factions: [{ idx: 0 }],
    cities: [{ idx: 0, disaster_event: 7 }],
    generals: [],
    legions: [],
    disasterMapObjects: slots,
    strategicEventSlots,
  };
  const saved = snapshotState(
    {
      scenario,
      scenarioIdx: 0,
      clock: { year: 1, month: 2, day: 3, hour: 4, sub: 5 },
      originalRng: { snapshot: () => ({ state: 0x12345678, calls: 9 }) },
    },
    0,
    "fire",
  );
  assert.deepEqual(saved.webMeta.originalRng, {
    state: 0x12345678,
    calls: 9,
  });

  const restored = structuredClone(saved.state);
  restored.disasterMapObjects = [];
  restored.strategicEventSlots = [];
  delete restored.cities[0].disaster_event;
  applyWebMetaToState(restored, saved.webMeta);
  normalizeDisasterMapObjectState(restored);
  assert.equal(restored.disasterMapObjects.length, 16);
  assert.equal(restored.disasterMapObjects[0], null);
  assert.equal(restored.disasterMapObjects[5].frame, 6);
  assert.deepEqual(restored.strategicEventSlots[9], removal);
  assert.equal(restored.cities[0].disaster_event, 7);
  scenario.disasterMapObjects[5].x = 999;
  assert.equal(restored.disasterMapObjects[5].x, 100);
}

process.stdout.write(
  "fire OK: fixed-slot animation, repeated 0x4269 damage and sidecar state\n",
);
