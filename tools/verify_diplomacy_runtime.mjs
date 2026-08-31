import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  declareWar,
  increaseRelation,
  relationLabel,
  runStrategicDiplomacy,
} from "../web/src/game/diplomacy.js";
import {
  initializeStrategicDiplomacy,
  processStrategicWarEvent,
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

assert.equal(scenario.diplomacy[0][13], 0xa9);
assert.equal(scenario.diplomacy[13][0], 0xaa);

const queued = initializeStrategicDiplomacy({ scenario });
assert.equal(relationLabel(scenario.diplomacy[0][13]), "險惡");
assert.equal(relationLabel(scenario.diplomacy[13][0]), "險惡");
assert.ok(
  queued.some((event) => event.aggressor === 13 && event.defender === 0),
  "第一章吕布应把玩家曹操作为 type-1 宣战候选",
);
assert.ok(
  scenario.pendingStrategicEvents.some(
    (event) =>
      event.aggressor === 13 && event.defender === 0 && event.delay === 7,
  ),
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
  },
};
assert.equal(
  processStrategicWarEvent(app, { type: 1, aggressor: 13, defender: 0 }),
  true,
);
assert.equal(messages.length, 1);
assert.match(messages[0].text, /立即進兵侵攻/);
assert.equal(eventScenario.factions[13].target_faction, 0);
assert.equal(eventScenario.diplomacy[13][0] < 0x80, true);
assert.equal(
  processStrategicWarEvent(app, { type: 1, aggressor: 13, defender: 0 }),
  false,
  "已交战不能重复通知",
);
assert.equal(messages.length, 1);

const monthFixture = structuredClone(data.scenarios[16]);
monthFixture.player_faction = 0;
const monthEvents = runStrategicDiplomacy(monthFixture);
assert.ok(monthEvents.length > 0);

process.stdout.write(
  "diplomacy runtime verification passed: static A9/AA -> opening hostile, directional cells, queued AI declaration\n",
);
