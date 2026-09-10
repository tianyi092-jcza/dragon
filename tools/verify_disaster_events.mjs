import assert from "node:assert/strict";

import {
  enqueueMonthlyDisasterEvents,
  tickFactionStrategicState,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

function city(idx, extra = {}) {
  return {
    idx,
    name: `城${idx}`,
    faction: idx === 0 ? 0 : 1,
    x: 100 + idx,
    y: 100,
    growth: 100,
    defence: 100,
    raw: "00".repeat(32),
    ...extra,
  };
}

function fixture(bytes = [], count = 24) {
  const messages = [];
  const scenario = {
    player_faction: 0,
    factions: [{ idx: 0 }, { idx: 1 }],
    cities: Array.from({ length: count }, (_, idx) => city(idx)),
    generals: [],
    legions: [],
    strategicEventSlots: Array(256).fill(null),
    disasterMapObjects: [],
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  const originalRng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return bytes.shift() ?? 0xff;
    },
  };
  const app = {
    scenario,
    originalRng,
    gamebar: {
      enqueueStrategicMessage(message) {
        messages.push(message);
      },
      enqueueTalkMessage(message) {
        messages.push(message);
      },
    },
  };
  return { app, scenario, messages };
}

// 0x22DB hit: selector is the direct city slot; fixed starts are 32,36,...,60.
{
  const bytes = [1, 8, 1, 7];
  for (let i = 0; i < 24; i++) bytes.push(0xff, 0xff);
  const { app, scenario } = fixture(bytes);
  const events = enqueueMonthlyDisasterEvents(app);
  assert.equal(events[0].type, 11);
  assert.deepEqual(scenario.strategicEventSlots[60], {
    type: 11,
    arg0: 0,
    arg1: 0,
    arg2: 0,
  });
  assert.deepEqual(scenario._disasterBounds, {
    minX: 103,
    maxX: 113,
    minY: 95,
    maxY: 105,
  });
}

// 固定槽冲突时逐槽后移，但不得越过当前64槽页。
{
  const bytes = [1, 8, 1, 0];
  for (let i = 0; i < 24; i++) bytes.push(0xff, 0xff);
  const { app, scenario } = fixture(bytes);
  scenario.strategicEventSlots[32] = { type: 99 };
  enqueueMonthlyDisasterEvents(app);
  assert.equal(scenario.strategicEventSlots[33].type, 11);
}
{
  const bytes = [1, 8, 1, 7];
  for (let i = 0; i < 24; i++) bytes.push(0xff, 0xff);
  const { app, scenario } = fixture(bytes);
  for (let slot = 60; slot < 64; slot++) {
    scenario.strategicEventSlots[slot] = { type: 99 };
  }
  const events = enqueueMonthlyDisasterEvents(app);
  assert.equal(
    events.some((event) => event.type === 11),
    false,
  );
  assert.equal(scenario._disasterBounds ?? null, null);
}

// 新月先以强度0清旧暴雨半径，再复位全图边界；清理不产生玩家消息。
{
  const bytes = [0];
  for (let i = 0; i < 2; i++) bytes.push(0xff, 0xff);
  const { app, scenario, messages } = fixture(bytes, 2);
  scenario._disasterBounds = { minX: 95, maxX: 105, minY: 95, maxY: 105 };
  scenario.cities[0].disaster_event = 31;
  scenario.cities[1].disaster_event = 30;
  enqueueMonthlyDisasterEvents(app);
  assert.equal(scenario.cities[0].disaster_event, 0);
  assert.equal(scenario.cities[1].disaster_event, 0);
  assert.equal(scenario._disasterBounds, null);
  assert.equal(messages.length, 0);
}

// 0x2286火灾分支：门控/防灾比较成功后随机入槽，并无条件跳过暴动分支。
{
  const { app, scenario } = fixture([0, 0, 63], 1);
  scenario.cities[0].defence = 10;
  const events = enqueueMonthlyDisasterEvents(app);
  assert.deepEqual(events, [{ type: 12, arg0: 1, cityPointer: 0x840 }]);
  assert.equal(app.originalRng.calls, 4); // type11门、火灾两字节、随机入槽
}

// 即使当前事件页已满，火灾条件成功仍消费入槽RNG并跳到下一城。
{
  const { app, scenario } = fixture([0, 0, 63, 0], 1);
  scenario.cities[0].defence = 10;
  for (let slot = 0; slot < 64; slot++) {
    scenario.strategicEventSlots[slot] = { type: 99 };
  }
  assert.deepEqual(enqueueMonthlyDisasterEvents(app), []);
  assert.equal(app.originalRng.calls, 4);
}

// 火灾防灾比较失败才继续消费暴动分支；不能提前continue。
{
  const { app, scenario } = fixture([0, 0, 1, 0, 63, 0], 1);
  scenario.cities[0].defence = 10;
  scenario.cities[0].growth = 10;
  const events = enqueueMonthlyDisasterEvents(app);
  assert.deepEqual(events, [{ type: 12, arg0: 2, cityPointer: 0x840 }]);
  assert.equal(app.originalRng.calls, 6);
}

// 0x2286固定扫描192城；完全未命中时每城仍消费火灾/暴动各一个门控字节。
{
  const { app } = fixture([0, ...Array(192 * 2).fill(0xff)], 192);
  assert.deepEqual(enqueueMonthlyDisasterEvents(app), []);
  assert.equal(app.originalRng.calls, 385);
}

// 火灾生产不检查所属；AI城与玩家城使用同一门控和事件格式。
{
  const { app, scenario } = fixture([0, 0xff, 0xff, 0, 63, 0], 2);
  scenario.cities[1].defence = 10;
  const events = enqueueMonthlyDisasterEvents(app);
  assert.deepEqual(events, [{ type: 12, arg0: 1, cityPointer: 0x860 }]);
}

// Type11 handler consumes one byte and writes exact city +15 analogue, reporting player hits.
{
  const { app, scenario, messages } = fixture([0x0f], 2);
  scenario.cities[1].faction = 0;
  scenario._disasterBounds = { minX: 95, maxX: 105, minY: 95, maxY: 105 };
  scenario.strategicEventSlots[0] = { type: 11, arg0: 0, arg1: 0, arg2: 0 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.cities[0].disaster_event, 39);
  assert.equal(scenario.cities[1].disaster_event, 39);
  assert.equal(messages.length, 2);
  assert.deepEqual(
    messages.map((message) => message.cityName),
    ["城0", "城1"],
  );
  assert.equal(messages[0].kind, "disaster-area");
  assert.equal(messages[0].talkIndex, 70);
  assert.equal(messages[0].sound, "warn");
}

// Type12 create allocates object, uses 2 RNG bytes, and schedules type12 removal.
{
  const { app, scenario, messages } = fixture([3, 2], 1);
  scenario.strategicEventSlots[0] = { type: 12, arg0: 1, cityPointer: 0x840 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.disasterMapObjects.length, 16);
  assert.deepEqual(scenario.disasterMapObjects[0], {
    active: true,
    kind: 1,
    group: 1,
    x: 100,
    y: 100,
    raw6: 1,
    raw7: 1,
    timer: 1,
    interval: 16,
    frame: 1,
  });
  assert.equal(
    scenario.disasterMapObjects.slice(1).every((object) => object === null),
    true,
  );
  assert.equal(scenario.cities[0].disaster_event, undefined);
  assert.equal(app.originalRng.calls, 0, "玩家TALK71关闭前不得消费伤害RNG");
  scenario.factions[0].diplomat_idx = 0;
  assert.equal(tickFactionStrategicState(app), false);
  assert.equal(app.originalRng.calls, 0, "同一0x3E11势力槽也必须等待灾害消息");
  assert.equal(app._factionTickDeferred, true);
  assert.equal(messages[0].kind, "disaster-object");
  assert.equal(messages[0].disasterKind, "fire");
  assert.equal(messages[0].talkIndex, 71);
  assert.equal(messages[0].sound, "warn");
  messages[0].onClose();
  messages[0].onClose();
  assert.equal(
    app.originalRng.calls,
    3,
    "关闭回调先消费两个灾害字节，再恢复同一时刻势力槽的RNG",
  );
  assert.equal(app._factionTickDeferred, false);
  assert.equal(scenario.cities[0].disaster_event, 7);
  assert.deepEqual(scenario.strategicEventSlots[9], {
    type: 12,
    arg0: 0,
    cityPointer: 0x840,
  });

  scenario._strategicEventCursor = 9;
  scenario._strategicEventDivider = 1;
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.disasterMapObjects.length, 16);
  assert.equal(scenario.disasterMapObjects[0], null);
  assert.equal(scenario.cities[0].disaster_event, 0);
}

// 0x2438只清匹配槽；新对象必须复用最低空槽，不能filter压缩后改变槽序。
{
  const { app, scenario } = fixture([0, 0, 0, 0, 0, 0], 3);
  for (const item of scenario.cities) item.faction = 1;
  const dispatch = (slot, event) => {
    scenario.strategicEventSlots[slot] = event;
    scenario._strategicEventCursor = slot;
    scenario._strategicEventDivider = 1;
    tickStrategicWarEvents(app);
  };
  dispatch(0, { type: 12, arg0: 1, cityPointer: 0x840 });
  dispatch(1, { type: 12, arg0: 1, cityPointer: 0x860 });
  assert.equal(scenario.disasterMapObjects[0].x, 100);
  assert.equal(scenario.disasterMapObjects[1].x, 101);
  dispatch(2, { type: 12, arg0: 0, cityPointer: 0x840 });
  assert.equal(scenario.disasterMapObjects[0], null);
  assert.equal(scenario.disasterMapObjects[1].x, 101);
  dispatch(3, { type: 12, arg0: 1, cityPointer: 0x880 });
  assert.equal(scenario.disasterMapObjects[0].x, 102);
  assert.equal(scenario.disasterMapObjects[1].x, 101);
}

// type12 arg0=2 uses TALK72 (暴動), distinct from arg0=1 TALK71 (大火).
{
  const { app, scenario, messages } = fixture([0, 0], 1);
  scenario.strategicEventSlots[0] = { type: 12, arg0: 2, cityPointer: 0x840 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(messages[0].talkIndex, 72);
  assert.equal(messages[0].disasterKind, "riot");
  assert.equal(messages[0].sound, "warn");
}

// 0x34B1只可分配前16个对象槽；后16槽由常驻雨云独占。
{
  const bytes = [];
  for (let index = 0; index < 17; index++) bytes.push(0, 0);
  const { app, scenario, messages } = fixture(bytes, 17);
  for (let index = 0; index < 17; index++) {
    scenario.strategicEventSlots[index] = {
      type: 12,
      arg0: 1,
      cityPointer: 0x840 + index * 0x20,
    };
  }
  for (let index = 0; index < 16; index++) {
    scenario._strategicEventCursor = index;
    scenario._strategicEventDivider = 1;
    tickStrategicWarEvents(app);
  }
  assert.equal(scenario.disasterMapObjects.length, 16);
  const callsBeforeFull = app.originalRng.calls;
  const messagesBeforeFull = messages.length;
  scenario._strategicEventCursor = 16;
  scenario._strategicEventDivider = 1;
  assert.equal(tickStrategicWarEvents(app), false);
  assert.equal(scenario.disasterMapObjects.length, 16);
  assert.equal(app.originalRng.calls, callsBeforeFull);
  assert.equal(messages.length, messagesBeforeFull);
  assert.equal(scenario.cities[16].disaster_event, undefined);
}

process.stdout.write(
  "disaster events OK: corrected type11 slots, monthly clear, area handler and 16-slot object lifecycle\n",
);
