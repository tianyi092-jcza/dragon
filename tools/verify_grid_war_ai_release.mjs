// Opt-in, read-only local /play regression. Uses public assets and an in-memory world only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createTrialEnvironment } from '../web/src/content/authoring/trialruntime.js';
import { captureOriginalCity } from '../web/src/game/navigation/originalcitycapture.js';
import { performScenarioMonthlyDiplomacy } from '../web/src/game/navigation/scenariomonthlydiplomacy.js';
import { getAdvisor } from '../web/src/game/advisor.js';
import { performScenarioMonarchDeployCommit } from '../web/src/game/navigation/scenariomonarchdeploy.js';
import { prepareScenario, scenarioGridRoadContext } from '../web/src/game/scenarioassembly.js';
import { initializeFreshPlayerAdvisor, bindNativePlayerFactionPointer } from '../web/src/game/nativefactions.js';
import { aiTick, resolveBattle, applyBattleResult, resolveGridMarchContact, performLegionSlotAction, buildArmies, initializeStrategicDiplomacy, tickStrategicWarEvents } from '../web/src/game/ai.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';

import { dispatch } from '../web/src/game/commands.js';
import { setLegionDelegated } from '../web/src/game/legionmode.js';
import { createStrategicBattleMethods } from '../web/src/app/battleflow.js';
import { GameBar } from '../web/src/ui/gamebar.js';
import { EngagementPresentation } from '../web/src/render/engagementpresentation.js';
import { minimapBattleMarkers } from '../web/src/render/minimapmarkers.js';

const gameId = process.argv[2];
assert.ok(gameId, 'Specify the local published game UUID');
globalThis.fetch = async path => {
  const url = new URL(path, 'https://127.0.0.1:8443');
  assert.equal(url.origin, 'https://127.0.0.1:8443');
  return new Response(execFileSync('curl', ['-kfSs', url.href], { maxBuffer: 32 << 20 }));
};
const { games } = await (await fetch('/api/published-games')).json();
const entry = games.find(g => g.gameId === gameId);
const q = new URLSearchParams({ game: gameId, revision: entry.revision, chapter: `${gameId}#middle-1` });
const pack = await (await fetch(`/api/trial-pack?${q}`)).json();
assert.match(pack.chapter.name, /呂布歸天/);
// Reproduce the northern front from public chapter data only. Use the real
// capture tail and 2BD9; don't reset F19 between month boundary and sortie.
{
  const env = createTrialEnvironment(pack, {playerFaction:14});
  await env.world.roads.loadRoadGraph();
  const {scenario:sc} = await prepareScenario({...env,mode:'fresh',idx:0,mapExtent:true});
  buildArmies(sc);
  initializeFreshPlayerAdvisor(sc);
  bindNativePlayerFactionPointer(sc, 'northern front regression');
  const p = sc.factions.find(f=>f.idx===14), yuan = sc.factions.find(f=>f.idx===11);
  p.capital = 193;
  for (const idx of [192,193]) { sc.cities[idx].faction = p.idx; p.n_cities++; }
  sc.diplomacy[11][14] = sc.diplomacy[14][11] = 0;
  yuan.target_faction = 14;
  for (const idx of [1,2,3,4]) {
    const c = sc.cities[idx]; c.governor = null;
    assert.equal(captureOriginalCity(sc,c,11,()=>{}), 'captured-4D62');
  }
  const rng = createOriginalBattleRng({ch:0,cl:0,dh:1});
  const settle = () => {
    const {rows} = performScenarioMonthlyDiplomacy(sc,rng);
    assert.deepEqual(rows[11].ordinary[0], {slot:14,relation:0,war:true});
    assert.equal(yuan.target_faction,14);
  };
  settle();
  const queue = [], app = {scenario:sc,originalRng:rng,gamebar:{enqueueTalkMessage:m=>queue.push(m)}};
  let tick = 0;
  while (sc.cities[0].faction === 14 && tick < 30000) {
    aiTick(app,{cityIndex:sc._cityTickCursor??0,legionBatchStart:sc._legionBatchCursor??0,hour:(tick>>3)%24});
    while (queue.length) { const m=queue.shift(); m.onClose?.(); m.onComplete?.(); }
    assert.ok(!app._strategicBattleFailure);
    tick++;
  }
  assert.equal(sc.cities[0].faction,11,'Yuan continues to attack and takes Ji');
  // The remaining player frontier now depends on the added northern roads.
  settle();
  console.log({northernFront:'薊縣',capturedBy:11,targetAfterNextSettlement:yuan.target_faction,tick});
}
for (const playerFaction of [14, 0, 11]) {
  const env = createTrialEnvironment(pack, { playerFaction });
  await env.world.roads.loadRoadGraph();
  const { scenario: sc } = await prepareScenario({ ...env, mode: 'fresh', idx: 0, mapExtent: true });
  buildArmies(sc);
  initializeFreshPlayerAdvisor(sc);
  bindNativePlayerFactionPointer(sc, 'grid war regression');
  const app = { scenario: sc, originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
    gamebar: { enqueueTalkMessage(message) { message.onClose?.(); message.onComplete?.(); } } };
  if (playerFaction === 14) {
    const faction = sc.factions.find(f => f.idx === playerFaction);
    assert.equal(faction.advisor_idx, null);
    assert.equal(getAdvisor(sc, faction), null);
    const city = sc.cities[faction.capital];
    const { movement } = scenarioGridRoadContext(sc);
    const before = movement.readTile(city.x, city.y);
    assert.deepEqual(performScenarioMonarchDeployCommit(sc, faction.monarch_idx), { cf: false, slot: faction.monarch_idx });
    const monarch = sc.legions.find(l => l.slot === faction.monarch_idx);
    assert.deepEqual(monarch.roadPosition, { kind: 'city', cityIndex: city.idx });
    assert.equal(monarch.status, 0xc0);
    assert.equal(monarch.units.length, 6);
    assert.equal(movement.readTile(city.x, city.y), before + 1);
    assert.equal(getAdvisor(sc, faction), null);
    // Change ownership en route, in this in-memory copy only.
    const dest = sc.cities[city.strategicNeighbours.find(i => sc.cities[i]?.faction === playerFaction)];
    const bar = Object.assign(Object.create(GameBar.prototype), {app});
    assert.ok(bar.assignMarchOrder(monarch, dest, false));
    performLegionSlotAction(app, monarch);
    assert.equal(monarch.roadPosition.kind, 'road');
    dest.faction = 0;
    sc.diplomacy[playerFaction][0] = 0x80;
    performLegionSlotAction(app, monarch);
    assert.deepEqual([monarch.targetNode,monarch.targetCity,monarch.roadPosition], [city.idx,city.idx,{kind:'city',cityIndex:city.idx}]);
    assert.equal(movement.readTile(city.x, city.y), before + 1);
    console.log({ peacefulReturn: [city.name,dest.name,city.name] });
    // Actual signed city rows; freeze the type11 wheel input, not the output.
    const [yu, bei, you] = sc.cities.slice(192);
    assert.deepEqual([yu.name,bei.name,you.name], ['漁陽','北平','右北平']);
    yu.faction = bei.faction = playerFaction;
    you.faction = 0;
    sc._disasterBounds = {minX:274,maxX:284,minY:-3,maxY:7}; // center 279,2
    sc._strategicEventDivider = 1;
    sc._strategicEventCursor = 0;
    sc.strategicEventSlots[0] = {type:11,arg0:0,arg1:0,arg2:0};
    const messages = [];
    app.gamebar = {enqueueTalkMessage(m){ messages.push(m); }};
    const rngBefore = app.originalRng.snapshot().calls;
    assert.ok(tickStrategicWarEvents(app));
    for (const m of messages) {
      assert.equal(m.talkIndex, 70);
      assert.equal(m.sound, 'warn');
      if (m.cityName === yu.name) assert.equal(bei.disaster_event, 0);
      m.onClose();
    }
    assert.deepEqual(messages.filter(m => [yu.name,bei.name,you.name].includes(m.cityName)).map(m => m.cityName), [yu.name,bei.name]);
    assert.ok(bei.disaster_event > 0 && you.disaster_event > 0);
    assert.equal(app.originalRng.snapshot().calls, rngBefore + 1);
    console.log({stormTalks:messages.map(m=>m.cityName),beipingStrength:bei.disaster_event});
    // 4851: high-fee search to 代, command 10 (own-side delayed return).
    for (const idx of city.strategicNeighbours) if (sc.cities[idx]) sc.cities[idx].faction = 0;
    monarch.commandState = 10;
    const dai = sc.cities.find(c => c.name === '代');
    monarch.targetNode = monarch.targetCity = dai.idx;
    monarch.target = dai;
    const ticket = { completed:false };
    app._legionSlotBatch = {scenario:sc,clock:app.clock,ticket,running:true};
    assert.equal(performLegionSlotAction(app, monarch), 'suspended');
    assert.equal(monarch.status, 8);
    assert.equal(movement.readTile(city.x,city.y), before);
    assert.equal(messages.at(-1).talkIndex, 31);
    assert.equal(ticket.completed,false);
    messages.at(-1).onComplete();
    assert.equal(ticket.completed,true);
    continue;
  }
  assert.ok(sc.diplomacy[13][0] >= 128);
  initializeStrategicDiplomacy(app);
  for (let t = 0; t < 1500 && sc.diplomacy[13][0] >= 128; t++) tickStrategicWarEvents(app);
  assert.ok(sc.diplomacy[13][0] < 128 && sc.diplomacy[0][13] < 128);
  let sounds = 0, formed = false, stationed = false, attack = false, contact = false;
  const colors = new Set();
  app.engagementFx = new EngagementPresentation({ playSound: () => ++sounds });
  let resolved = false, retreatingSlot, attacker;
  for (let i = 0; i < 20000 && !(contact && sounds && colors.size === 2 && (playerFaction === 0 || resolved)); i++) {
    aiTick(app, { cityIndex: sc._cityTickCursor ?? 0, legionBatchStart: sc._legionBatchCursor ?? 0, hour: 2 });
    assert.ok(!app._strategicBattleFailure, JSON.stringify(app._strategicBattleFailure));
    // A defeated but viable column must return on the road, not enter 2977.
    app.engagementFx.update(sc, i);
    for (const marker of minimapBattleMarkers(sc, app.engagementFx).values()) colors.add(marker.style.border);
    for (const l of sc.legions.filter(l => l.faction === 13)) {
      formed ||= l.targetCity === 76;
      stationed ||= l.roadPosition?.kind === 'city' && l.roadPosition.cityIndex === 76;
      attack ||= sc.cities[l.targetCity]?.faction === 0;
      if (l._engagement?.kind === 'siege' && sc.cities[l.targetCity]?.faction === 0) {
        contact = true;
        attacker = l;
      }
      if (l._retreat?.cityIdx === 76 && l.roadPosition.kind === 'road') retreatingSlot ??= l.slot;
      resolved ||= l.slot === retreatingSlot && l.roadPosition.kind === 'city' && l.roadPosition.cityIndex === 76;
    }
  }
  console.log({ playerFaction, formed, stationed, attack, contact, sounds, colors: [...colors] });
  assert.ok(formed && stationed && attack && contact && sounds && colors.size === 2);
  if (playerFaction !== 0) {
    assert.ok(resolved, 'the same NPC slot marched back to 椎陽');
    const owner = sc.factions.find(f => f.idx === playerFaction);
    const old = sc.cities[owner.capital];
    assert.ok(sc.cities.filter(c => c.faction === playerFaction).length > 1);
    old.governor = null;
    const attacker = sc.legions.find(l => l.faction === 13);
    const taker = sc.factions.find(f => f.idx === attacker.faction);
    const before = taker.n_cities;
    const ticket = { completed: false };
    app._legionSlotBatch = { scenario: sc, clock: app.clock, ticket, running: true };
    const queue = [];
    app.gamebar = { enqueueTalkMessage: GameBar.prototype.enqueueTalkMessage, _strategicMessageQueue: queue, _drainStrategicMessages() {} };
    assert.equal(applyBattleResult(app, attacker, old, 'atk', null, null, null, null, null, null, null,
      { defenders: [], strategicRng: app.originalRng }), 'capital-suspended');
    assert.notEqual(owner.capital, old.idx);
    assert.equal(sc.cities[owner.capital].faction, playerFaction);
    assert.deepEqual(queue.map(m => [m.talkIndex, m.cityName]), [[30, sc.cities[owner.capital].name.trim()]]);
    assert.equal(ticket.completed, false);
    assert.equal(taker.n_cities, before);
    queue[0].onClose();
    queue[0].onClose();
    assert.equal(ticket.completed, true);
    assert.equal(taker.n_cities, before + 1);
    console.log({ oldCapital: old.name, newCapital: sc.cities[owner.capital].name });
    // Controlled post-siege result: an added city in the northern extension
    // already belongs to the player and has a governor when the NPC wins.
    const added = sc.cities[192];
    assert.ok(added.y < 0 && added.faction === null);
    added.faction = playerFaction;
    added.governor = owner.monarch_idx;
    owner.capital = added.idx;
    const returning = sc.legions.find(l => l !== attacker && l.status >= 0x80);
    assert.ok(returning);
    returning.faction = playerFaction;
    returning.targetCity = added.idx;
    returning.targetNode = added.idx;
    const ownedBefore = ++owner.n_cities;
    const takenBefore = taker.n_cities;
    let report;
    app._legionSlotBatch = null;
    app.gamebar.enqueueTalkMessage = m => { report = m; };
    added.troops = 0;
    if (added.sim) added.sim.troops = 0;
    attacker.units.forEach(unit => { unit.troops = 1000; });
    attacker.troops = 600; attacker.morale = 200;
    assert.equal(resolveBattle(app, attacker, added), true);
    assert.deepEqual([report.gen, report.talkIndex, report.cityName, report.generalName], [null,26,added.name,sc.generals[attacker.generalIdx].name.trim()]);
    console.log({siegeNotice: report.talkIndex, city:report.cityName, enemyCommander:report.generalName});
    assert.equal(added.faction, playerFaction);
    report.onComplete();
    assert.equal(added.faction, attacker.faction);
    assert.equal(added._strategicLastFaction, playerFaction);
    assert.equal(added.governor, null);
    assert.equal(report.talkIndex, 68);
    assert.equal(report.cityName, added.name.trim());
    report.onComplete();
    assert.equal(report.talkIndex, 30);
    assert.notEqual(owner.capital, added.idx);
    assert.equal(returning.targetCity, owner.capital);
    assert.equal(taker.n_cities, takenBefore);
    report.onComplete();
    assert.equal(owner.n_cities, ownedBefore - 1);
    assert.equal(taker.n_cities, takenBefore + 1);
    assert.ok(!app._strategicBattleFailure);
    console.log({ addedCapture: added.name, idx: added.idx });
  } else {
    // Isolate the two post-result branches on an actual army at the siege gate.
    const city = sc.cities[attacker.targetCity];
    const start = { ...attacker.roadPosition };
    const result = morale => applyBattleResult(app, attacker, city, 'def', null, null, null, null, null, null, null,
      { defenders: [], sides: [{ morale, units: attacker.units.map(u => ({ type: u.type, troops: 60 })) }], strategicRng: { nextByte: () => 0 } });
    result(90);
    assert.deepEqual(attacker.roadPosition, start);
    assert.equal(sc.cities[attacker.targetCity].faction, 13);
    performLegionSlotAction(app, attacker);
    assert.equal(attacker.roadPosition.roadIndex, start.roadIndex);
    assert.equal(attacker.roadPosition.pointIndex, start.pointIndex - start.direction);
    let message;
    app.gamebar.enqueueTalkMessage = m => { message = m; };
    assert.equal(result(0), 'fate-suspended');
    assert.equal(message.talkIndex, 32);
    assert.equal(attacker.status, 8);
    message.onComplete();
    assert.ok(!app._strategicBattleFailure);

    // Controlled delegated field contact: strong Cao column captures a non-monarch.
    const foe = sc.legions.find(l => l.leader === '高順');
    const home = sc.cities.find(c => c.faction === 0 && c.troops > 1);
    assert.ok(dispatch(sc, home, sc.cities[76]).ok);
    const column = sc.legions.find(l => l.faction === 0);
    // Manual grid field entry must pass terrain from contact, not use the
    // native pointer guard after TALK29. Construct the actual tactical Session.
    const asset = async name => (await fetch(`/api/play/web/${name}.json`)).json();
    app.battleMaps = await asset('battle_maps');
    app.battleMaps.navigation = await asset('battle_navigation');
    app.battleMaps.formationVectors = (await asset('battle_rules')).formationVectors;
    let tactical;
    app.battleView = { open(battle) { tactical = battle; return true; } };
    app.startFieldBattle = createStrategicBattleMethods().startFieldBattle;
    const hit = Object.assign(new RangeError('Grid field contact unresolved'), { point: { x: foe.x, y: foe.y } });
    column.engagementCountdown = 1;
    app.gamebar.enqueueTalkMessage = m => { message = m; };
    assert.equal(resolveGridMarchContact(app, column, hit), 'suspended');
    assert.equal(message.talkIndex, 29);
    assert.equal(tactical, undefined);
    message.onClose();
    assert.ok(!app._strategicBattleFailure);
    assert.equal(tactical.playerSide, 'atk');
    assert.ok(tactical.directoryIndex >= 0xc0 && tactical.directoryIndex <= 0xd5 && tactical.session);
    setLegionDelegated(column, true);
    column.units.forEach(u => { u.troops = 1000; });
    column.troops = 600; column.morale = 200;
    foe.units.forEach(u => { u.troops = 10; });
    foe.troops = 6; foe.morale = 1;
    const ticket = { completed: false };
    app._legionSlotBatch = { scenario: sc, clock: app.clock, ticket, running: true };
    column.engagementCountdown = 1;
    app.originalRng = { nextByte: () => 127 };
    const queue = [];
    app.gamebar = { enqueueTalkMessage: GameBar.prototype.enqueueTalkMessage, _strategicMessageQueue: queue, _drainStrategicMessages() {} };
    let finish;
    app.playDelegatedEngage = (_, cb) => { finish = cb; return true; };
    assert.equal(resolveGridMarchContact(app, column, hit), 'suspended');
    assert.equal(finish(), true, 'delegated transition must leave completion with TALK');
    assert.equal(foe.status, 0);
    assert.equal(sc.generals[foe.slot].status, 4);
    assert.deepEqual(queue.map(m => m.talkIndex), [34, 0x196 + 4 * 8 + sc.generals[foe.slot].talk_idx]);
    queue[0].onClose?.();
    assert.equal(ticket.completed, false);
    queue[1].onClose();
    assert.equal(ticket.completed, true);

    // Last Lu city: BP garrison messages and the 127-general scan share one
    // ticket. Observe the actual gamebar sequence, not fabricated talk text.
    const lu = sc.factions.find(f => f.idx === 13);
    const last = sc.cities[lu.capital];
    for (const c of sc.cities.filter(c => c !== last && c.faction === 13)) c.faction = 0;
    lu.n_cities = 1;
    last.governor = null;
    const garrison = sc.legions.filter(l => l.faction === 13);
    assert.ok(garrison.length);
    queue.length = 0;
    const lastTicket = { completed: false };
    app._legionSlotBatch.ticket = lastTicket;
    const beforeCities = sc.factions.find(f => f.idx === 0).n_cities;
    const outcome = applyBattleResult(app, column, last, 'atk', null, null, null, null, null, null, null,
      { defenders: garrison, strategicRng: app.originalRng });
    assert.match(outcome, /-suspended$/);
    const talks = [];
    while (queue.length) {
      assert.ok(talks.length < 300 && !lastTicket.completed);
      assert.equal(sc.factions.find(f => f.idx === 0).n_cities, beforeCities);
      const current = queue.shift();
      talks.push(current.talkIndex);
      current.onClose?.();
    }
    assert.ok(talks.includes(34));
    assert.equal(talks.at(-1), 36);
    assert.equal(lastTicket.completed, true);
    assert.equal(sc.factions.find(f => f.idx === 0).n_cities, beforeCities + 1);
    console.log({ lastCity: last.name, talks });
  }
}
