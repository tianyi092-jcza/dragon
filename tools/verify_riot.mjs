import assert from "node:assert/strict";

import {
  enqueueMonthlyDisasterEvents,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  applyDisasterDamageToCity,
  normalizeDisasterMapObjectState,
  tickStrategicWeather,
} from "../web/src/game/weather.js";

function fixture(bytes, { growth = 10, defence = 100 } = {}) {
  const messages = [];
  const originalRng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return bytes.shift() ?? 0xff;
    },
  };
  const city = {
    idx: 0,
    name: "洛陽",
    faction: 0,
    x: 100,
    y: 80,
    growth,
    defence,
    prod: 0x0800,
    troops: 50,
  };
  const scenario = {
    player_faction: 0,
    factions: [{ idx: 0 }],
    cities: [city],
    generals: [],
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
    disasterMapObjects: [],
  };
  return {
    city,
    messages,
    scenario,
    app: {
      scenario,
      originalRng,
      gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
    },
  };
}

// 0x2286：火灾首门失败只耗一字节，随后暴动门/比较成功并随机入槽。
{
  const { app, city } = fixture([0, 0x18, 0, 63, 0]);
  city.faction = 1;
  const events = enqueueMonthlyDisasterEvents(app);
  assert.deepEqual(events, [{ type: 12, arg0: 2, cityPointer: 0x840 }]);
  assert.equal(app.originalRng.calls, 5);
}

// 比较边界是无符号>=：roll==growth命中，低1则失败且不消费入槽字节。
{
  const equal = fixture([0, 0x18, 0, 10, 0], { growth: 10 });
  assert.deepEqual(enqueueMonthlyDisasterEvents(equal.app), [
    { type: 12, arg0: 2, cityPointer: 0x840 },
  ]);
  assert.equal(equal.app.originalRng.calls, 5);

  const below = fixture([0, 0x18, 0, 9], { growth: 10 });
  assert.deepEqual(enqueueMonthlyDisasterEvents(below.app), []);
  assert.equal(below.app.originalRng.calls, 4);
}

// 火灾比较失败后才进入暴动；暴动首门失败不得预取比较字节。
{
  const { app } = fixture([0, 0, 1, 0x18]);
  assert.deepEqual(enqueueMonthlyDisasterEvents(app), []);
  assert.equal(app.originalRng.calls, 4);
}

// 暴动条件命中但事件页已满：0x2FBF仍先消费随机起点，然后静默失败。
{
  const { app, scenario } = fixture([0, 0x18, 0, 63, 0]);
  scenario.strategicEventSlots.fill({ type: 99 });
  assert.deepEqual(enqueueMonthlyDisasterEvents(app), []);
  assert.equal(app.originalRng.calls, 5);
}

// type12/arg0=2：先分配group2对象并显示TALK72；关闭后才写强度和removal。
{
  const { app, city, messages, scenario } = fixture([5, 7]);
  scenario.strategicEventSlots[0] = {
    type: 12,
    arg0: 2,
    cityPointer: 0x840,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.disasterMapObjects.length, 16);
  assert.deepEqual(scenario.disasterMapObjects[0], {
    active: true,
    kind: 2,
    group: 2,
    x: 100,
    y: 80,
    raw6: 1,
    raw7: 1,
    timer: 1,
    interval: 16,
    frame: 1,
  });
  assert.equal(city.disaster_event, undefined);
  assert.equal(app.originalRng.calls, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 72);
  assert.equal(messages[0].disasterKind, "riot");
  assert.equal(messages[0].sound, "warn");

  messages[0].onClose();
  messages[0].onClose();
  assert.equal(app.originalRng.calls, 2);
  assert.equal(city.disaster_event, 9);
  assert.deepEqual(scenario.strategicEventSlots[14], {
    type: 12,
    arg0: 0,
    cityPointer: 0x840,
  });

  scenario._strategicEventCursor = 14;
  scenario._strategicEventDivider = 1;
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(city.disaster_event, 0);
  assert.equal(scenario.disasterMapObjects[0], null);
  assert.equal(app.originalRng.calls, 2, "removal为零RNG");
}

// 静态对象池满时，arg0=2立即失败：不通知、不写伤害、不取后续RNG。
{
  const { app, city, messages, scenario } = fixture([]);
  scenario.disasterMapObjects = Array.from({ length: 16 }, (_, slot) => ({
    active: true,
    kind: 1,
    group: 1,
    x: slot,
    y: slot,
    timer: 16,
    interval: 16,
    frame: 1,
  }));
  scenario.strategicEventSlots[0] = {
    type: 12,
    arg0: 2,
    cityPointer: 0x840,
  };
  assert.equal(tickStrategicWarEvents(app), false);
  assert.equal(app.originalRng.calls, 0);
  assert.equal(messages.length, 0);
  assert.equal(city.disaster_event, undefined);
}

// AI城不显示TALK72，但分配成功后立即执行同样两个RNG字节。
{
  const { app, city, messages, scenario } = fixture([1, 0]);
  city.faction = 1;
  scenario.strategicEventSlots[0] = {
    type: 12,
    arg0: 2,
    cityPointer: 0x840,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(messages.length, 0);
  assert.equal(app.originalRng.calls, 2);
  assert.equal(city.disaster_event, 5);
  assert.equal(scenario.disasterMapObjects[0].group, 2);
}

// group2与火灾同用0x2459计时；每16 tick推进八相且不调用雨云RNG。
{
  const scenario = {
    disasterMapObjects: [
      {
        active: true,
        kind: 2,
        group: 2,
        x: 100,
        y: 80,
        raw6: 1,
        raw7: 1,
        timer: 1,
        interval: 16,
        frame: 7,
      },
    ],
    weatherClouds: [],
  };
  normalizeDisasterMapObjectState(scenario);
  const rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return 0;
    },
  };
  assert.equal(tickStrategicWeather(scenario, rng), true);
  assert.equal(scenario.disasterMapObjects[0].frame, 0);
  assert.equal(scenario.disasterMapObjects[0].timer, 16);
  assert.equal(rng.calls, 0);
}

// 暴动没有专用伤害函数：强度9按0x4269先吸收防灾，再扣其余三项。
{
  const city = {
    growth: 20,
    defence: 2,
    prod: 0x0800,
    troops: 50,
    disaster_event: 9,
  };
  assert.equal(applyDisasterDamageToCity(city), true);
  assert.deepEqual(city, {
    growth: 13,
    defence: 0,
    prod: 0x07f2,
    troops: 47,
    disaster_event: 9,
  });
  assert.equal(applyDisasterDamageToCity(city), true);
  assert.deepEqual(city, {
    growth: 4,
    defence: 0,
    prod: 0x07e3,
    troops: 43,
    disaster_event: 9,
  });
}

process.stdout.write(
  "riot OK: exact 0x2286 gates, TALK72 transaction, group2 animation and repeated damage\n",
);
