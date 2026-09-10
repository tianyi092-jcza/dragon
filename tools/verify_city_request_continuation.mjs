import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { aiTick, buildArmies, finishDeferredLegionDaily, stepTo } from "../web/src/game/ai.js";
import { Clock } from "../web/src/game/clock.js";
import { canSnapshotState } from "../web/src/game/savegame.js";
import { loadTerrain } from "../web/src/game/pathfind.js";
import { findRoadRoute } from "../web/src/game/roadgraph.js";

function parseJson(bytes) {
  try { return JSON.parse(bytes); }
  catch (cause) { throw new Error("Invalid repository fixture JSON", { cause }); }
}

// Only repository assets and memory: no DOS SAVE or browser profile access.
globalThis.fetch = async (url) => {
  const bytes = await readFile(url instanceof URL ? url : new URL(`../web/${url}`, import.meta.url));
  return { ok: true, json: async () => parseJson(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const data = parseJson(await readFile(new URL("../web/data.json", import.meta.url), "utf8"));
await loadTerrain();
function fixture(bytes = [0, 15, 15]) {
  const sc = structuredClone(data.scenarios[16]);
  sc.player_faction = 13;
  sc.diplomacy[13][0] = sc.diplomacy[0][13] = 0;
  sc.weatherClouds = [];
  buildArmies(sc);
  const city = sc.cities[76];
  Object.assign(city, { governor: null, growth: 100, defence: 100, troops: city.troops_cap });
  const messages = [], consumed = [];
  let otherHold = false;
  const app = { scenario: sc, originalRng: { nextByte() {
    assert.ok(bytes.length, "unexpected RNG consumption");
    const value = bytes.shift(); consumed.push(value); return value;
  } } };
  app.gamebar = {
    enqueueTalkMessage(message) { messages.push(message); },
    syncClock() { app.clock.hold = !!(app._strategicCityRequest || otherHold || app.engageTransition?.active); },
  };
  sc._cityTickCursor = 76;
  sc._legionBatchCursor = 0;
  app.clock = new Clock({ startYear: 196, startMonth: 1, startDay: 1,
    onStrategicTick(c) {
      const options = { cityIndex: sc._cityTickCursor, legionBatchStart: sc._legionBatchCursor, hour: c.hour, settleDaily: false };
      aiTick(app, options);
      sc._cityTickCursor = (sc._cityTickCursor + 1) % 192;
      sc._legionBatchCursor = (sc._legionBatchCursor + 16) % 128;
    }, onSyncHold: () => app.gamebar.syncClock(),
  });
  return { app, sc, city, messages, consumed, hold(value) { otherHold = value; app.gamebar.syncClock(); } };
}
{
  const f = fixture();
  const { app, sc, city, messages, consumed } = f;
  const sub = app.clock.sub;
  app.clock.advance(app.clock.currentStep);
  assert.equal(messages.length, 1);
  assert.deepEqual(consumed, []);
  assert.equal(city.growth, 100);
  assert.equal(app.clock.sub, sub);
  assert.equal(canSnapshotState(app), false, "queued request blocks snapshots even without active UI");
  assert.deepEqual([sc._cityTickCursor, sc._legionBatchCursor, app.clock.strategicTickSerial], [77, 16, 1]);
  aiTick(app, { cityIndex: 76 });
  assert.equal(messages.length, 1, "pending update cannot be reentered");
  f.hold(true);
  messages[0].onClose();
  messages[0].onClose();
  assert.deepEqual(consumed, [0, 15, 15]);
  assert.equal(city._aiCooldown, 24);
  assert.equal(city.growth, 100);
  assert.equal(app.clock.hold, true, "other hold survives request closure");
  f.hold(false);
  app.clock.advance(app.clock.currentStep);
  assert.equal(app.clock.sub, sub + 1);
  assert.equal(app.clock.strategicTickSerial, 1);
  assert.equal(canSnapshotState(app), true);
}
for (const cancel of ["scenario", "clock", "title"]) {
  const f = fixture();
  f.app.clock.advance(f.app.clock.currentStep);
  if (cancel === "scenario") f.app.scenario = {};
  if (cancel === "clock") f.app.clock = {};
  if (cancel === "title") f.app._strategicCityRequest = null;
  f.messages[0].onClose();
  assert.deepEqual(f.consumed, [], `${cancel}: stale callback cannot consume process RNG`);
  assert.equal(f.city._aiCooldown, undefined);
}
function addCloud(sc) {
  sc.weatherClouds = [{ active: true, x: 27, y: 11, phaseX: 0, phaseY: 0, velocityX: 0, velocityY: 0, timer: 1, interval: 16, group: 0, frame: 0 }];
}
{
  const f = fixture([0, 15, 15, 0xab, 0, 0]);
  const city = f.sc.cities[79];
  city.attr = 0;
  f.sc.legions = [{ slot: 0, faction: 0, status: 0x84, _active: true, x: city.x, y: city.y, target: city, targetCity: city.idx, targetNode: city.idx, roadEdgeOrNode: city.idx * 8, commandState: 1, troops: 600, morale: 200 }];
  addCloud(f.sc);
  aiTick(f.app, { cityIndex: 76, legionBatchStart: 0, settleDaily: false });
  assert.equal(f.sc.legions[0].commandState, 1);
  assert.equal(f.sc.weatherClouds[0].timer, 1);
  assert.deepEqual(f.consumed, []);
  f.messages[0].onClose();
  assert.equal(f.sc.legions[0].commandState, 2);
  assert.equal(f.sc.weatherClouds[0].timer, 16);
  assert.deepEqual(f.consumed, [0, 15, 15, 0xab, 0, 0]);
}
{
  const f = fixture([0, 15, 15, 99, 0, 0]);
  const capital = f.sc.cities[79];
  const attacker = { slot: 0, faction: 13, leader: f.sc.factions[13].monarch, status: 0x84, _active: true, x: capital.x, y: capital.y, troops: 600, morale: 200, units: Array.from({ length: 6 }, () => ({ type: 1, troops: 1000 })) };
  f.sc.legions = [attacker];
  buildArmies(f.sc);
  const target = f.sc.cities.find(c => c.faction === 0 && findRoadRoute(attacker.x, attacker.y, c.x, c.y)?.points.length > 2);
  attacker.target = target;
  let result = "moved";
  for (let n = 0; n < 2000 && result === "moved"; n++) result = stepTo(f.sc, attacker, target.x, target.y);
  assert.equal(result, "contact");
  attacker._engagement.countdown = 1;
  attacker.moveDelay = 1;
  addCloud(f.sc);
  let battles = 0;
  f.app.playDelegatedEngage = () => { battles++; f.app.engageTransition = { active: true }; f.app.gamebar.syncClock(); return true; };
  aiTick(f.app, { cityIndex: 76, legionBatchStart: 0, settleDaily: false });
  assert.equal(battles, 0);
  f.messages[0].onClose();
  assert.equal(battles, 1);
  assert.deepEqual(f.consumed, [0, 15, 15]);
  assert.equal(f.sc.weatherClouds[0].timer, 1);
  // Represent canonical battle RNG writeback before the existing deferred tail.
  assert.equal(f.app.originalRng.nextByte(), 99);
  f.app.engageTransition.active = false;
  finishDeferredLegionDaily(f.app);
  assert.deepEqual(f.consumed, [0, 15, 15, 99, 0, 0]);
  assert.equal(f.sc.weatherClouds[0].timer, 16);
  f.messages[0].onClose();
  assert.equal(battles, 1);
}
console.log("TALK38 continuation: request/governance/legion/weather RNG order, calendar once, cancellation and snapshot guard OK");
