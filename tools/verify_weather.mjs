import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  aiTick,
  cityDaily,
  finishDeferredLegionDaily,
} from "../web/src/game/ai.js";
import { applyWebMetaToState } from "../web/src/game/savegame.js";
import {
  applyStormDamageToCity,
  normalizeWeatherCloudState,
  tickStrategicWeather,
} from "../web/src/game/weather.js";

function byteRng(bytes) {
  return {
    calls: 0,
    nextByte() {
      this.calls++;
      return bytes.shift() ?? 0;
    },
  };
}

function cloud(extra = {}) {
  return {
    active: true,
    x: 27,
    y: 11,
    phaseX: 0,
    velocityX: 0,
    phaseY: 0,
    velocityY: 0,
    timer: 1,
    interval: 16,
    group: 0,
    frame: 0,
    ...extra,
  };
}

// SINARIO.DAT +0x21C0：每章都必须保留16条原始雨云状态，而非Web随机生成。
{
  let data;
  try {
    const dataUrl = new URL("../web/data.json", import.meta.url);
    data = JSON.parse(await readFile(dataUrl, "utf8"));
  } catch (error) {
    assert.fail(`cannot parse generated web/data.json: ${error}`);
  }
  assert.equal(data.scenarios.length, 20);
  for (const scenario of data.scenarios) {
    assert.deepEqual(scenario.weatherCloudBounds, {
      minX: -16,
      minY: -16,
      maxX: 400,
      maxY: 400,
    });
    assert.equal(scenario.weatherClouds.length, 16);
    assert.deepEqual(
      scenario.weatherClouds[0],
      cloud({ x: 27, y: 11, timer: 1, interval: 16 }),
    );
  }
}

// 旧快照同时从章节模板补回雨云和场景头边界，不在Web重新随机化。
{
  const oldState = {};
  normalizeWeatherCloudState(oldState, [cloud({ x: 88 })], {
    minX: -7,
    minY: -6,
    maxX: 301,
    maxY: 302,
  });
  assert.equal(oldState.weatherClouds[0].x, 88);
  assert.deepEqual(oldState.weatherCloudBounds, {
    minX: -7,
    minY: -6,
    maxX: 301,
    maxY: 302,
  });
}

// 0x2459：倒计时到0时每朵活动雨云严格消费X/Y两个RNG字节，八相递进。
{
  const scenario = {
    weatherClouds: [cloud({ phaseX: -14, phaseY: 14 })],
  };
  normalizeWeatherCloudState(scenario);
  const rng = byteRng([0, 2]);
  assert.equal(tickStrategicWeather(scenario, rng), true);
  assert.equal(rng.calls, 2);
  assert.deepEqual(scenario.weatherClouds[0], {
    ...cloud(),
    x: 26,
    y: 12,
    phaseX: 0,
    velocityX: -1,
    phaseY: 0,
    velocityY: 1,
    timer: 16,
    interval: 16,
    group: 0,
    frame: 1,
  });
  assert.equal(tickStrategicWeather(scenario, rng), false);
  assert.equal(rng.calls, 2);
  assert.equal(scenario.weatherClouds[0].timer, 15);
}

// 官方16槽同步到期时严格按槽序合计消费32字节；非到期tick为0字节。
{
  const scenario = {
    weatherClouds: Array.from({ length: 16 }, (_, slot) =>
      cloud({ x: 20 + slot }),
    ),
  };
  const rng = byteRng(Array(32).fill(1));
  tickStrategicWeather(scenario, rng);
  assert.equal(rng.calls, 32);
  assert.equal(
    scenario.weatherClouds.every((item) => item.timer === 16),
    true,
  );
  tickStrategicWeather(scenario, rng);
  assert.equal(rng.calls, 32);
}

// 聚集边界初值是[-16,-16]..[400,400]；物理地图另以X=400、Y=272回绕。
{
  const scenario = {
    weatherClouds: [cloud({ x: -16, y: -16, phaseX: -14, phaseY: -14 })],
  };
  tickStrategicWeather(scenario, byteRng([0, 0]));
  assert.equal(scenario.weatherClouds[0].x, 400);
  assert.equal(scenario.weatherClouds[0].y, 272);
}

// 暴雨预告存在时0x248A用11×11矩形逐次修正速度，不传送或直接寻路。
{
  const scenario = {
    _disasterBounds: { minX: 95, maxX: 105, minY: 95, maxY: 105 },
    weatherClouds: [cloud({ x: 106, y: 94 })],
  };
  tickStrategicWeather(scenario, byteRng([1, 1]));
  assert.equal(scenario.weatherClouds[0].x, 106);
  assert.equal(scenario.weatherClouds[0].y, 94);
  assert.equal(scenario.weatherClouds[0].velocityX, -1);
  assert.equal(scenario.weatherClouds[0].velocityY, 1);
}

// 0x4269：灾值原值先由防灾吸收，溢出才扣上升率/生产力/城兵。
{
  const absorbed = {
    disaster_event: 39,
    defence: 100,
    growth: 100,
    prod: 0x1234,
    troops: 100,
  };
  assert.equal(applyStormDamageToCity(absorbed), true);
  assert.deepEqual(absorbed, {
    disaster_event: 39,
    defence: 61,
    growth: 100,
    prod: 0x1234,
    troops: 100,
  });

  const spilled = {
    disaster_event: 39,
    defence: 10,
    growth: 100,
    prod: 0x1234,
    troops: 100,
  };
  applyStormDamageToCity(spilled);
  assert.deepEqual(spilled, {
    disaster_event: 39,
    defence: 0,
    growth: 71,
    prod: 0x11b2,
    troops: 86,
  });
}

// 产品0x1D0B入口在军团槽后推进天气；异步战斗则等战术RNG回写后补做。
{
  const rng = byteRng([1, 1]);
  const app = {
    scenario: {
      cities: [],
      factions: [],
      generals: [],
      legions: [],
      weatherClouds: [cloud()],
    },
    originalRng: rng,
  };
  aiTick(app, {
    legionBatchStart: 0,
    runCityDaily: false,
    settleDaily: false,
  });
  assert.equal(rng.calls, 2);
  assert.equal(app.scenario.weatherClouds[0].frame, 1);

  const deferredRng = byteRng([1, 1]);
  app.originalRng = deferredRng;
  app.scenario.weatherClouds[0].timer = 1;
  app._strategicWeatherTickDeferred = true;
  assert.equal(finishDeferredLegionDaily(app), true);
  assert.equal(deferredRng.calls, 2);
  assert.equal(app._strategicWeatherTickDeferred, false);
}

// IndexedDB sidecar恢复逐云相位/速度/计时，不能从模板重新随机化。
{
  const savedClouds = [
    cloud({ x: 123, phaseX: -9, velocityX: 4, timer: 7, frame: 6 }),
  ];
  const state = { weatherClouds: [] };
  applyWebMetaToState(state, {
    scenarioRuntimeState: { weatherClouds: savedClouds },
  });
  assert.deepEqual(state.weatherClouds, savedClouds);
  savedClouds[0].x = 999;
  assert.equal(state.weatherClouds[0].x, 123);
}

// 产品单城轮询在治理RNG消费后调用同一损害例程，灾值持续到下月清理。
{
  const city = {
    faction: 1,
    growth: 100,
    defence: 10,
    prod: 0x1234,
    troops: 100,
    troops_cap: 200,
    disaster_event: 39,
  };
  cityDaily(
    { player_faction: 0, cities: [city], generals: [] },
    byteRng([0xff, 0xff, 0xff]),
  );
  assert.equal(city.defence, 0);
  assert.equal(city.growth, 71);
  assert.equal(city.prod, 0x11b2);
  assert.equal(city.troops, 86);
  assert.equal(city.disaster_event, 39);
}

process.stdout.write(
  "weather OK: SINARIO state, canonical RNG motion, storm bounds and 0x4269 city damage\n",
);
