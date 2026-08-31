import assert from "node:assert/strict";
import fs from "node:fs/promises";

let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error(`cannot load new-game chapter fixtures: ${error.message}`, {
    cause: error,
  });
}
const { buildArmies } = await import("../web/src/game/ai.js");
const { createNewGameScenario } = await import("../web/src/game/world.js");

for (const [index, template] of data.scenarios.entries()) {
  assert.deepEqual(
    template.legions,
    [],
    `scenario ${index} template must not contain initial legions`,
  );

  const chosenFaction = template.factions.at(-1)?.idx ?? 0;
  const scenario = createNewGameScenario(template, chosenFaction, null);
  assert.notEqual(scenario, template);
  assert.equal(scenario.player_faction, chosenFaction);
  assert.equal(scenario.trust, 255);
  assert.deepEqual(
    scenario.legions,
    [],
    `scenario ${index} new game must start without fielded legions`,
  );
  assert.equal(Object.hasOwn(scenario, "armies"), false);

  buildArmies(scenario);
  assert.deepEqual(scenario.legions, []);
}

// data.json 必须是只读新游戏模板：上一局的章节状态不能污染同章重开。
const template = data.scenarios[0];
const chosenFirstFaction = template.factions.at(-1)?.idx ?? 0;
const firstRun = createNewGameScenario(template, chosenFirstFaction, {
  name: "测试军师",
  hao: "别号",
  portrait: 7,
});
firstRun.trust = 0;
firstRun.save_date = { year: 999, month: 12, day: 31 };
firstRun.cities[0].faction = null;
firstRun.cities[0].sim = { troops: 1 };
firstRun.cities[0].disaster = 1;
firstRun.cities[0].growth_rate = -9;
firstRun.factions[0].gold = 1;
firstRun.factions[0].food = 2;
firstRun.factions[0].troops = 3;
firstRun.factions[0].dead = true;
firstRun.generals[0].status = 4;
firstRun.generals[0].is_player = true;
firstRun.delayedLegionReturns = [{ generalIdx: 0, countdown: 47 }];
firstRun.prisoners = [{ leader: firstRun.generals[0].name, months: 1 }];
firstRun.pendingRecruits = [{ city: 0, n: 100 }];
firstRun.pendingTruceNegotiations = [{ daysLeft: 1 }];
firstRun.pendingAssistanceNegotiations = [{ daysLeft: 1 }];
firstRun.envoys = { 1: { name: "测试使者", left: 6 } };
firstRun._appeared = new Set([0]);
firstRun.legions.push({ leader: "污染军团" });

const restartFaction = template.factions[0]?.idx ?? 0;
const restarted = createNewGameScenario(template, restartFaction, null);
assert.equal(restarted.player_faction, restartFaction);
assert.equal(restarted.trust, 255);
assert.equal(restarted.cities[0].faction, template.cities[0].faction);
assert.equal(restarted.cities[0].sim, undefined);
assert.equal(restarted.cities[0].disaster, undefined);
assert.equal(restarted.cities[0].growth_rate, undefined);
assert.equal(restarted.factions[0].gold, undefined);
assert.equal(restarted.factions[0].food, undefined);
assert.equal(restarted.factions[0].troops, undefined);
assert.equal(restarted.factions[0].dead, undefined);
assert.equal(restarted.generals[0].status, template.generals[0].status);
assert.equal(restarted.generals[0].is_player, undefined);
for (const field of [
  "save_date",
  "delayedLegionReturns",
  "prisoners",
  "pendingRecruits",
  "pendingTruceNegotiations",
  "pendingAssistanceNegotiations",
  "envoys",
  "_appeared",
]) {
  assert.equal(restarted[field], undefined, `${field} must reset for new game`);
}
assert.deepEqual(restarted.legions, []);
assert.equal(restarted.player_advisor?.custom, false);
assert.deepEqual(template.legions, []);

// 即使章节模板被外部意外塞入运行时字段，新游戏构造也必须强制清除。
const pollutedTemplate = structuredClone(template);
pollutedTemplate.legions = [{ leader: "模板污染军团" }];
pollutedTemplate.armies = pollutedTemplate.legions;
const sanitized = createNewGameScenario(pollutedTemplate, 0, null);
assert.deepEqual(sanitized.legions, []);
assert.equal(Object.hasOwn(sanitized, "armies"), false);

process.stdout.write(
  `new game initialization OK: ${data.scenarios.length} chapters load isolated data and keep all factions legion-free\n`,
);
