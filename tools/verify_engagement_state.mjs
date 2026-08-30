import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Browser-only audio is deliberately inert in this node-side state-machine test.
globalThis.window = {};

const { buildArmies, stepTo } = await import("../web/src/game/ai.js");
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

process.stdout.write(
  "engagement state OK: field and siege contacts stop before occupied point\n",
);
