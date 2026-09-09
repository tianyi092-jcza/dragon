import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  declareWar,
  increaseRelation,
  factionStrategicPower,
  pickEnvoy,
  relationLabel,
  runStrategicDiplomacy,
  shouldDeclareStrategicWar,
} from "../web/src/game/diplomacy.js";
import {
  completePlayerWarDeclaration,
  initializeStrategicDiplomacy,
  monthlyDiplomacyAI,
  processStrategicWarEvent,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

let data;
try {
  data = JSON.parse(
    await readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("failed to load generated scenario data", { cause: error });
}
const scenario = structuredClone(data.scenarios[16]);
scenario.player_faction = 0;

// 玩家确认的剧本默认军师是化身，不能被旧遣使入口自动选作使者。
{
  const faction = { idx: 0 };
  const advisor = {
    idx: 1,
    name: "軍師",
    faction: 0,
    status: 0,
    active: true,
    is_player: true,
    ability: { politics: 15 },
  };
  const general = {
    idx: 2,
    name: "武將",
    faction: 0,
    status: 0,
    active: true,
    ability: { politics: 14 },
  };
  assert.equal(pickEnvoy({ generals: [advisor, general] }, faction), general);
}

assert.equal(scenario.diplomacy[0][13], 0xa9);
assert.equal(scenario.diplomacy[13][0], 0xaa);

const queued = initializeStrategicDiplomacy({ scenario });
assert.equal(
  scenario.diplomacy[0][13],
  0xa1,
  "0x2DF3对和平首候选固定-8，与是否接壤空城无关",
);
assert.equal(scenario.diplomacy[13][0], 0xa7);
assert.equal(relationLabel(scenario.diplomacy[0][13]), "險惡");
assert.equal(relationLabel(scenario.diplomacy[13][0]), "險惡");
assert.deepEqual(queued, [
  { type: 1, aggressor: 0, defender: 13 },
  { type: 1, aggressor: 1, defender: 10 },
  { type: 1, aggressor: 11, defender: 14 },
]);
assert.equal(
  scenario.strategicEventSlots.filter((event) => event?.type === 1).length,
  3,
  "0x2EFB也处理玩家势力；第一章曹操应在开局排入对吕布的type-1",
);
assert.equal(
  scenario._strategicEventDivider,
  7,
  "0x2BD9后首个事件槽应等待7次0x3E11调度",
);

// 0x2FBF没有事件内容去重：即使当前页已有相同四字节，仍从随机槽向后
// 寻找下一个空槽。这里把相同事件预置于滚动后当前页的slot0。
{
  const duplicateScenario = structuredClone(data.scenarios[16]);
  duplicateScenario.player_faction = 0;
  duplicateScenario.strategicEventSlots = Array(256).fill(null);
  duplicateScenario.strategicEventSlots[64] = {
    type: 1,
    aggressor: 0,
    defender: 13,
  };
  for (const faction of duplicateScenario.factions) {
    if (faction) faction.target_faction = faction.idx;
  }
  initializeStrategicDiplomacy({ scenario: duplicateScenario });
  assert.equal(
    duplicateScenario.strategicEventSlots.filter(
      (event) =>
        event?.type === 1 && event.aggressor === 0 && event.defender === 13,
    ).length,
    2,
    "相同type-1必须并存，不得恢复旧Web去重逻辑",
  );
}

// 当前64槽全满时0x2FBF仍先消费每次入队尝试的随机字节，然后失败；
// 无论本次关系/目标状态生成多少个type-1，每次尝试都必须各消费一次RNG。
{
  const fullPageScenario = structuredClone(data.scenarios[16]);
  fullPageScenario.player_faction = 0;
  fullPageScenario.strategicEventSlots = Array(256).fill(null);
  for (let index = 64; index < 128; index++) {
    fullPageScenario.strategicEventSlots[index] = {
      type: 10,
      arg0: index,
      arg1: 0xff,
      arg2: 0xff,
    };
  }
  for (const faction of fullPageScenario.factions) {
    if (faction) faction.target_faction = faction.idx;
  }
  const expectedAttempts = runStrategicDiplomacy(
    structuredClone(fullPageScenario),
  ).length;
  assert.ok(expectedAttempts > 0);
  let rngCalls = 0;
  const failed = initializeStrategicDiplomacy({
    scenario: fullPageScenario,
    originalRng: {
      nextByte() {
        rngCalls++;
        return 0;
      },
    },
  });
  assert.deepEqual(failed, []);
  assert.equal(
    rngCalls,
    expectedAttempts,
    "满页失败时每个type-1入队尝试仍须各消费一次RNG",
  );
}

// 月结入口必须先滚动64槽事件页，再以同一0x2BD9算法再次更新关系；
// 不是仅在开局执行一次，也不能清掉尚未到达的后续页事件。
{
  const city0 = new Uint8Array(32);
  const city1 = new Uint8Array(32);
  city0[0] = 1;
  city0[0x1c] = 1;
  city1[0] = 1;
  city1[0x1c] = 0;
  const monthlyScenario = {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        attr: 0x80,
        active: true,
        n_cities: 1,
        money: 0,
        bellicosity: 0,
        target_faction: null,
      },
      {
        idx: 1,
        attr: 0x80,
        active: true,
        n_cities: 1,
        money: 0,
        bellicosity: 0,
        target_faction: null,
      },
    ],
    cities: [
      { idx: 0, faction: 0, raw: Buffer.from(city0).toString("hex") },
      { idx: 1, faction: 1, raw: Buffer.from(city1).toString("hex") },
    ],
    diplomacy: [
      [0xff, 0xa0],
      [0xa0, 0xff],
    ],
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 37,
    _strategicEventDivider: 4,
  };
  monthlyScenario.strategicEventSlots[0] = {
    type: 10,
    talkIndex: 1,
    arg0: 1,
  };
  monthlyScenario.strategicEventSlots[64] = {
    type: 10,
    talkIndex: 2,
    arg0: 2,
  };
  assert.deepEqual(
    monthlyDiplomacyAI({
      scenario: monthlyScenario,
      originalRng: { nextByte: () => 0xff },
    }),
    [],
  );
  assert.deepEqual(monthlyScenario.strategicEventSlots[0], {
    type: 10,
    talkIndex: 2,
    arg0: 2,
  });
  assert.equal(monthlyScenario.strategicEventSlots[64], null);
  assert.equal(monthlyScenario._strategicEventCursor, 0);
  assert.equal(monthlyScenario._strategicEventDivider, 7);
  assert.equal(monthlyScenario.diplomacy[0][1], 0x98);
  assert.equal(monthlyScenario.diplomacy[1][0], 0x9d);
}

const openingPumpScenario = structuredClone(data.scenarios[16]);
openingPumpScenario.player_faction = 0;
const openingPumpMessages = [];
const openingPumpApp = {
  scenario: openingPumpScenario,
  gamebar: {
    enqueueStrategicMessage(message) {
      openingPumpMessages.push(message);
    },
    enqueueTalkMessage(message) {
      openingPumpMessages.push(message);
    },
  },
};
initializeStrategicDiplomacy(openingPumpApp);
let openingWarHour = null;
for (let hour = 1; hour <= 24 * 10; hour++) {
  tickStrategicWarEvents(openingPumpApp);
  while (openingPumpMessages.length > 0) {
    openingPumpMessages.shift().onClose?.();
  }
  if (openingPumpScenario.diplomacy[0][13] < 0x80) {
    openingWarHour = hour;
    break;
  }
}
assert.notEqual(openingWarHour, null, "第一章曹操与吕布应在开局数日内交战");
assert.ok(openingWarHour <= 24 * 10);

const openingWarScenario = structuredClone(data.scenarios[16]);
openingWarScenario.player_faction = 0;
const openingWarMessages = [];
const openingWarApp = {
  scenario: openingWarScenario,
  gamebar: {
    enqueueStrategicMessage(message) {
      openingWarMessages.push(message);
    },
    enqueueTalkMessage(message) {
      openingWarMessages.push(message);
    },
  },
};
assert.equal(
  processStrategicWarEvent(openingWarApp, {
    type: 1,
    aggressor: 0,
    defender: 13,
  }),
  true,
  "开局type-1应让玩家君主下达对第一候选的宣战命令",
);
assert.equal(openingWarMessages.length, 1);
assert.equal(
  openingWarMessages[0].gen?.idx,
  openingWarScenario.factions[0].monarch_idx,
);
assert.equal(
  openingWarMessages[0].talkIndex,
  486 +
    openingWarScenario.generals[openingWarScenario.factions[0].monarch_idx]
      .talk_idx,
);
assert.equal(openingWarMessages[0].targetName, "呂布");
assert.equal(
  openingWarScenario.diplomacy[0][13] >= 0x80,
  true,
  "君主对白关闭前仍保持和平",
);
openingWarMessages[0].onClose();
assert.equal(openingWarScenario.diplomacy[0][13] < 0x80, true);
assert.equal(openingWarScenario.diplomacy[13][0] < 0x80, true);
assert.equal(
  openingWarScenario.factions[0].target_faction,
  null,
  "0x3526玩家发起分支不写AI战略目标字段",
);

const thresholdScenario = {
  factions: [
    {
      idx: 0,
      active: true,
      attr: 0x80,
      money: 0x6400,
      n_cities: 1,
      reserve_cav: 2000,
      reserve_arc: 2000,
      reserve_inf: 2000,
      bellicosity: 0,
      target_faction: null,
    },
    {
      idx: 1,
      active: true,
      attr: 0x80,
      money: 0x6400,
      n_cities: 1,
      reserve_cav: 1000,
      reserve_arc: 1000,
      reserve_inf: 1000,
    },
  ],
  diplomacy: [
    [0xff, 0x80],
    [0x80, 0xff],
  ],
};
assert.equal(factionStrategicPower(thresholdScenario.factions[0]), 2000);
assert.equal(
  shouldDeclareStrategicWar(
    thresholdScenario,
    thresholdScenario.factions[0],
    1,
  ),
  true,
  "0x6400 funds gives faction+0x21 word 100 (arithmetic >>8)",
);
thresholdScenario.factions[0].money = 0x5000;
assert.equal(
  shouldDeclareStrategicWar(
    thresholdScenario,
    thresholdScenario.factions[0],
    1,
  ),
  false,
  "resource threshold uses signed funds>>8 rather than /100",
);

const relationFixture = {
  diplomacy: [
    [0xff, 0xa0],
    [0xb0, 0xff],
  ],
};
increaseRelation(relationFixture, 0, 1, 3);
assert.equal(relationFixture.diplomacy[0][1], 0xa3);
assert.equal(
  relationFixture.diplomacy[1][0],
  0xb0,
  "0x30D3 必须只修改指定方向",
);
declareWar(relationFixture, 0, 1);
assert.equal(relationFixture.diplomacy[0][1], 17);
assert.equal(relationFixture.diplomacy[1][0], 17);

const eventScenario = structuredClone(data.scenarios[16]);
eventScenario.player_faction = 0;
const messages = [];
const app = {
  scenario: eventScenario,
  gamebar: {
    enqueueStrategicMessage(message) {
      messages.push(message);
    },
    enqueueTalkMessage(message) {
      messages.push(message);
    },
  },
};
assert.equal(
  processStrategicWarEvent(app, { type: 1, aggressor: 13, defender: 0 }),
  true,
);
assert.equal(messages.length, 2);
assert.equal(messages[0].gen, null);
assert.equal(messages[0].talkIndex, 63);
assert.equal(messages[1].gen?.idx, eventScenario.factions[13].monarch_idx);
assert.equal(messages[1].talkIndex, 479);
assert.notEqual(
  eventScenario.factions[13].target_faction,
  0,
  "第二条宣战对白关闭前不得提前提交战略目标",
);
assert.equal(eventScenario.diplomacy[13][0] >= 0x80, true);
messages[1].onClose();
assert.equal(eventScenario.factions[13].target_faction, 0);
assert.equal(
  eventScenario.factions[0].target_faction,
  null,
  "0x35AB明确跳过玩家防守方，不写AI战略目标",
);
assert.equal(eventScenario.diplomacy[13][0] < 0x80, true);
assert.equal(
  processStrategicWarEvent(app, { type: 1, aggressor: 13, defender: 0 }),
  false,
  "已交战不能重复通知",
);
assert.equal(messages.length, 2);

// 0x35AB：AI防守方通常以FF目标直接反指宣战者；已有低号目标时，
// 只有防守方战略实力弱于发起者才覆盖。
{
  const counterScenario = structuredClone(data.scenarios[16]);
  counterScenario.player_faction = 5;
  counterScenario.factions[0].target_faction = null;
  counterScenario.factions[13].target_faction = null;
  assert.equal(
    processStrategicWarEvent(
      { scenario: counterScenario },
      { type: 1, aggressor: 13, defender: 0 },
    ),
    true,
  );
  assert.equal(counterScenario.factions[13].target_faction, 0);
  assert.equal(counterScenario.factions[0].target_faction, 13);

  const strongerDefender = structuredClone(data.scenarios[16]);
  strongerDefender.player_faction = 5;
  strongerDefender.factions[0].target_faction = 1;
  strongerDefender.factions[0].reserve_cav = 10000;
  strongerDefender.factions[0].reserve_arc = 10000;
  strongerDefender.factions[0].reserve_inf = 10000;
  strongerDefender.factions[13].reserve_cav = 0;
  strongerDefender.factions[13].reserve_arc = 0;
  strongerDefender.factions[13].reserve_inf = 0;
  assert.equal(
    processStrategicWarEvent(
      { scenario: strongerDefender },
      { type: 1, aggressor: 13, defender: 0 },
    ),
    true,
  );
  assert.equal(strongerDefender.factions[0].target_faction, 1);
}

// 0x2F71生成的defender=0x18并非外交对象：AI只把+0x19写成空城目标，
// 玩家分支不写AI目标；两者都不改外交矩阵，也不显示宣战消息。
{
  const emptyTargetScenario = structuredClone(data.scenarios[16]);
  emptyTargetScenario.player_faction = 0;
  emptyTargetScenario.factions[13].target_faction = null;
  const beforeDiplomacy = structuredClone(emptyTargetScenario.diplomacy);
  const emptyMessages = [];
  assert.equal(
    processStrategicWarEvent(
      {
        scenario: emptyTargetScenario,
        gamebar: {
          enqueueStrategicMessage(message) {
            emptyMessages.push(message);
          },
        },
      },
      { type: 1, aggressor: 13, defender: 0x18 },
    ),
    true,
  );
  assert.equal(emptyTargetScenario.factions[13].target_faction, 0x18);
  assert.deepEqual(emptyTargetScenario.diplomacy, beforeDiplomacy);
  assert.equal(emptyMessages.length, 0);

  emptyTargetScenario.factions[0].target_faction = null;
  assert.equal(
    processStrategicWarEvent(
      { scenario: emptyTargetScenario },
      { type: 1, aggressor: 0, defender: 0x18 },
    ),
    true,
  );
  assert.equal(emptyTargetScenario.factions[0].target_faction, null);
  assert.deepEqual(emptyTargetScenario.diplomacy, beforeDiplomacy);
}

for (const style of [0, 1, 2]) {
  const playerScenario = structuredClone(data.scenarios[16]);
  playerScenario.player_faction = 0;
  playerScenario.generals[playerScenario.factions[0].monarch_idx].talk_idx =
    style;
  const playerMessages = [];
  const playerApp = {
    scenario: playerScenario,
    gamebar: {
      enqueueStrategicMessage(message) {
        playerMessages.push(message);
      },
      enqueueTalkMessage(message) {
        playerMessages.push(message);
      },
    },
  };
  assert.equal(completePlayerWarDeclaration(playerApp, 13), true);
  assert.equal(playerMessages.length, 1);
  assert.equal(
    playerMessages[0].gen?.idx,
    playerScenario.factions[0].monarch_idx,
  );
  assert.equal(playerScenario.diplomacy[0][13] >= 0x80, true);
  playerMessages[0].onClose();
  assert.equal(playerScenario.diplomacy[0][13] < 0x80, true);
}

const monthFixture = structuredClone(data.scenarios[16]);
monthFixture.player_faction = 0;
const monthEvents = runStrategicDiplomacy(monthFixture);
assert.ok(monthEvents.length > 0);

process.stdout.write(
  "diplomacy runtime verification passed: static A9/AA -> opening hostile, player/AI type-1 declarations, directional cells\n",
);
