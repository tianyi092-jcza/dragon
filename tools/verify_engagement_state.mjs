import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Browser-only audio is deliberately inert in this node-side state-machine test.
globalThis.window = {};

const { aiTick, buildArmies, stepTo } = await import("../web/src/game/ai.js");
const { loadRoadGraph, findRoadRoute, roadGraphReady } = await import(
  "../web/src/game/roadgraph.js"
);

async function readJson(url) {
  try {
    return JSON.parse(await fs.readFile(url, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${url}: ${error.message}`, { cause: error });
  }
}

globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => readJson(new URL(`../web/${url}`, import.meta.url)),
});
await loadRoadGraph();
assert.equal(roadGraphReady(), true);

const raw = await readJson(new URL("../web/data.json", import.meta.url));
const sc = structuredClone(raw.scenarios[0]);
sc.citiesOf = (idx) => sc.cities.filter((city) => city.faction === idx);
buildArmies(sc);

const attacker = sc.legions[0];
const defender = sc.legions.find(
  (legion) => legion.faction !== attacker.faction,
);
assert.ok(attacker && defender);
for (let faction = 0; faction < sc.diplomacy.length; faction++) {
  if (faction === attacker.faction) continue;
  sc.diplomacy[attacker.faction][faction] = 0;
  sc.diplomacy[faction][attacker.faction] = 0;
}
const target = sc.cities[sc.factions[defender.faction].capital];
const route = findRoadRoute(attacker.x, attacker.y, target.x, target.y);
assert.ok(route?.points.length > 2);

// Put the defender on the first point the attacker is about to enter.
attacker.target = target;
assert.equal(stepTo(sc, attacker, target.x, target.y), "moved");
const next = attacker._march.points[attacker._march.pointIndex];
defender.x = next.x;
defender.y = next.y;
defender.prevX = next.x;
defender.prevY = next.y;
const before = { x: attacker.x, y: attacker.y };
const result = stepTo(sc, attacker, target.x, target.y);
assert.equal(result, "contact");
assert.deepEqual({ x: attacker.x, y: attacker.y }, before);
assert.equal(attacker._engagement.kind, "field");
assert.equal(attacker._engagement.countdown, 11);
assert.equal(attacker._engagement.target.x, next.x);
assert.equal(attacker._engagement.target.y, next.y);
assert.equal(defender._engagement, undefined);

// Siege contact also begins before the city point is committed.
const siegeSc = structuredClone(raw.scenarios[0]);
siegeSc.citiesOf = (idx) =>
  siegeSc.cities.filter((city) => city.faction === idx);
buildArmies(siegeSc);
const siegeAttacker = siegeSc.legions[0];
const enemyCity = siegeSc.cities.find(
  (city) =>
    city.faction != null &&
    city.faction !== siegeAttacker.faction &&
    findRoadRoute(siegeAttacker.x, siegeAttacker.y, city.x, city.y)?.points
      .length > 1,
);
// Force war with every non-attacker faction so intermediate cities do not block this isolated test.
for (let faction = 0; faction < siegeSc.diplomacy.length; faction++) {
  if (faction === siegeAttacker.faction) continue;
  siegeSc.diplomacy[siegeAttacker.faction][faction] = 0;
  siegeSc.diplomacy[faction][siegeAttacker.faction] = 0;
}
const siegeRoute = findRoadRoute(
  siegeAttacker.x,
  siegeAttacker.y,
  enemyCity.x,
  enemyCity.y,
);
assert.ok(siegeRoute?.points.length);
siegeAttacker.target = enemyCity;
let siegeResult = "moved";
let siegeApproach = null;
for (let guard = 0; guard < 2000 && siegeResult === "moved"; guard++) {
  siegeApproach = { x: siegeAttacker.x, y: siegeAttacker.y };
  siegeResult = stepTo(siegeSc, siegeAttacker, enemyCity.x, enemyCity.y);
}
assert.equal(siegeResult, "contact");
assert.deepEqual({ x: siegeAttacker.x, y: siegeAttacker.y }, siegeApproach);
assert.equal(siegeAttacker._engagement.kind, "siege");
assert.equal(siegeAttacker._engagement.countdown, 11);
const contactedCity = siegeSc.cities[siegeAttacker._engagement.target.cityIdx];
assert.ok(contactedCity);
assert.equal(contactedCity.x, siegeSc.cities[contactedCity.idx].x);
assert.equal(
  contactedCity.x,
  siegeAttacker._march.points[siegeAttacker._march.pointIndex].x,
);
assert.equal(
  contactedCity.y,
  siegeAttacker._march.points[siegeAttacker._march.pointIndex].y,
);
assert.notEqual(contactedCity.faction, siegeAttacker.faction);

// 同一tick已有transition gate时，第二场countdown=1必须原样保留。
siegeAttacker._engagement = {
  kind: "siege",
  countdown: 1,
  target: { cityIdx: contactedCity.idx },
};
const pendingSnapshot = structuredClone(siegeAttacker._engagement);
aiTick({
  scenario: siegeSc,
  engageTransition: { active: true },
  battleView: { active: false },
});
assert.deepEqual(siegeAttacker._engagement, pendingSnapshot);

// 两场均countdown=1：首场取得transition slot后aiTick立即返回，第二场不得清除；
// 首场回调结算/释放gate后，下一tick才启动第二场。
const city2 = { ...contactedCity, idx: siegeSc.cities.length, name: "次城" };
siegeSc.cities.push(city2);
const second = {
  ...siegeAttacker,
  leader: "次將",
  _runtimeId: 99,
  x: siegeAttacker.x,
  y: siegeAttacker.y,
  prevX: siegeAttacker.x,
  prevY: siegeAttacker.y,
  _engagement: {
    kind: "siege",
    countdown: 1,
    target: { cityIdx: city2.idx },
  },
};
siegeAttacker.status = 0x84;
second.status = 0x84;
siegeSc.player_faction = siegeAttacker.faction;
siegeSc.legions = [siegeAttacker, second];
let active = false;
let transitions = 0;
const gatedApp = {
  scenario: siegeSc,
  battleView: { active: false },
  get engageTransition() {
    return active ? { active: true } : null;
  },
  playDelegatedEngage(_legion, finish) {
    if (active) return false;
    active = true;
    void finish;
    transitions++;
    return true;
  },
  originalRng: { nextByte: () => 0 },
  hud: { flashEvent() {} },
};
aiTick(gatedApp);
assert.equal(transitions, 1);
assert.deepEqual(second._engagement.target, { cityIdx: city2.idx });
active = false; // 此fixture只验证gate调度；结算逻辑由autobattle verify覆盖。
aiTick(gatedApp);
assert.equal(transitions, 2);

// 0x25CC/0x2831：倒计时每轮重检；替换第三势力且停战仍保留timer并换目标。
const raceSc = structuredClone(raw.scenarios[0]);
raceSc.citiesOf = (idx) => raceSc.cities.filter((city) => city.faction === idx);
buildArmies(raceSc);
const raceA = raceSc.legions[0];
const raceTarget = raceSc.cities.find(
  (city) => city.faction !== raceA.faction && findRoadRoute(raceA.x, raceA.y, city.x, city.y)?.points.length > 2,
);
for (let faction = 0; faction < raceSc.diplomacy.length; faction++) {
  raceSc.diplomacy[raceA.faction][faction] = 0;
}
raceA.target = raceTarget;
assert.equal(stepTo(raceSc, raceA, raceTarget.x, raceTarget.y), "moved");
const raceNext = raceA._march.points[raceA._march.pointIndex];
const originalFoe = raceSc.legions.find((legion) => legion !== raceA);
originalFoe.x = raceNext.x;
originalFoe.y = raceNext.y;
assert.equal(stepTo(raceSc, raceA, raceTarget.x, raceTarget.y), "contact");
const replacementFaction = raceSc.factions.find(
  (faction) => faction.idx !== raceA.faction && faction.idx !== originalFoe.faction,
).idx;
originalFoe.x = raceTarget.x;
originalFoe.y = raceTarget.y;
const replacement = {
  ...structuredClone(originalFoe),
  slot: 127,
  _runtimeId: 127,
  faction: replacementFaction,
  x: raceNext.x,
  y: raceNext.y,
  prevX: raceNext.x,
  prevY: raceNext.y,
  target: null,
  _engagement: null,
};
raceSc.legions.push(replacement);
raceSc.diplomacy[raceA.faction][replacementFaction] = 0xff;
const raceApp = {
  scenario: raceSc,
  battleView: { active: false },
  originalRng: { nextByte: () => 0 },
  hud: { flashEvent() {} },
};
aiTick(raceApp);
assert.equal(raceA._engagement.kind, "field");
assert.equal(raceA._engagement.countdown, 10);
assert.equal(raceA._engagement.target.faction, replacementFaction);
replacement.x = raceTarget.x;
replacement.y = raceTarget.y;
const beforeResume = { x: raceA.x, y: raceA.y };
aiTick(raceApp);
assert.equal(raceA._engagement, null);
assert.notDeepEqual({ x: raceA.x, y: raceA.y }, beforeResume, "lost contact resumes movement in same tick");

// 0x2831严格军团槽序：数组打乱也必须先命中低槽己方，从而不见高槽敌军。
const slotPoint = raceA._march?.points?.[raceA._march.pointIndex] ?? raceNext;
const friendlyFirst = {
  ...structuredClone(replacement),
  slot: 3,
  faction: raceA.faction,
  x: slotPoint.x,
  y: slotPoint.y,
  dead: false,
  _active: true,
};
const enemyLater = {
  ...structuredClone(replacement),
  slot: 9,
  faction: replacementFaction,
  x: slotPoint.x,
  y: slotPoint.y,
  dead: false,
  _active: true,
};
raceSc.legions = [enemyLater, raceA, friendlyFirst];
raceA._engagement = null;
assert.notEqual(
  stepTo(raceSc, raceA, raceTarget.x, raceTarget.y),
  "contact",
  "low-slot friendly occupant stops scan before shuffled high-slot enemy",
);

// 0x42AB最后边矩阵：己方/中立/交战第三方继续；未开战第三方转向另一端。
const finalSc = structuredClone(raw.scenarios[0]);
finalSc.citiesOf = (idx) => finalSc.cities.filter((city) => city.faction === idx);
buildArmies(finalSc);
const finalA = finalSc.legions[0];
for (let faction = 0; faction < finalSc.diplomacy.length; faction++) finalSc.diplomacy[finalA.faction][faction] = 0;
for (const legion of finalSc.legions) {
  if (legion !== finalA) {
    legion.dead = true;
    legion._active = false;
  }
}
const finalCity = finalSc.cities.find(
  (city) => findRoadRoute(finalA.x, finalA.y, city.x, city.y)?.legs.length === 1,
);
assert.ok(finalCity);
const originalOwner = finalCity.faction;
finalCity.faction = finalSc.factions.find((faction) => faction.idx !== finalA.faction).idx;
finalA.target = finalCity;
let finalResult = "moved";
while (finalResult === "moved") finalResult = stepTo(finalSc, finalA, finalCity.x, finalCity.y);
assert.equal(finalResult, "contact");
finalA._engagement.countdown = 9;
const third = finalSc.factions.find(
  (faction) => faction.idx !== finalA.faction && faction.idx !== finalCity.faction,
)?.idx ?? originalOwner;
finalCity.faction = third;
finalSc.diplomacy[finalA.faction][third] = 0xff;
const oldStride = finalA._march.stride;
assert.equal(stepTo(finalSc, finalA, finalCity.x, finalCity.y), "reversed");
assert.equal(finalA._march.stride, -oldStride);
assert.equal(finalA.target, finalCity, "42AB reversal preserves final command target");

// 多边路线的当前中间端点易主：0x42AB看nav.toNode，不得误看最终target。
const multiSc = structuredClone(raw.scenarios[0]);
multiSc.citiesOf = (idx) => multiSc.cities.filter((city) => city.faction === idx);
buildArmies(multiSc);
const multiA = multiSc.legions[0];
for (const legion of multiSc.legions) if (legion !== multiA) legion.dead = true;
let multiRoute = null;
const multiTarget = multiSc.cities.find((city) => {
  const route = findRoadRoute(multiA.x, multiA.y, city.x, city.y);
  if (route?.legs.length >= 2) {
    multiRoute = route;
    return true;
  }
  return false;
});
assert.ok(multiTarget && multiRoute);
for (let faction = 0; faction < multiSc.diplomacy.length; faction++)
  multiSc.diplomacy[multiA.faction][faction] = 0;
multiA.target = multiTarget;
assert.equal(stepTo(multiSc, multiA, multiTarget.x, multiTarget.y), "moved");
const intermediateNode = multiA._march.toNode;
const intermediatePoint = multiRoute.legs[0].points.at(-1);
const intermediate = multiSc.cities.find(
  (city) => city.x === intermediatePoint.x && city.y === intermediatePoint.y,
) ?? {
  idx: multiSc.cities.length,
  name: "中間端點",
  x: intermediatePoint.x,
  y: intermediatePoint.y,
  faction: multiA.faction,
};
if (!multiSc.cities.includes(intermediate)) multiSc.cities.push(intermediate);
const intermediateCity = intermediate;
assert.ok(intermediateCity);
const nonWarOwner = multiSc.factions.find((faction) => faction.idx !== multiA.faction).idx;
intermediateCity.faction = nonWarOwner;
multiSc.diplomacy[multiA.faction][nonWarOwner] = 0xff;
const multiOldStride = multiA._march.stride;
assert.equal(stepTo(multiSc, multiA, multiTarget.x, multiTarget.y), "reversed");
assert.equal(multiA._march.stride, -multiOldStride);
assert.notEqual(multiA._march.toNode, intermediateNode);
assert.notEqual(multiTarget.idx, intermediateCity.idx);

process.stdout.write(
  "engagement state OK: contact recheck + replacement/truce + final-edge 42AB reversal + gate\n",
);
