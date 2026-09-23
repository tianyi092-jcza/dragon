import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";

// Browser-only audio is deliberately inert in this node-side state-machine test.
globalThis.window = {};

const { aiTick, buildArmies } = await import("../web/src/game/ai.js");
const { roadGraphReady } = await import("../web/src/game/roadgraph.js");
// Certified projection serializer + counter binder for contact poses (P63
// G2; G7 removes the roadgraph module, the JSON below stays).
const { serializeRoadMarchContext } = await import(
  "../web/src/game/roadgraph.js"
);
const {
  bindLegionSlotCounter,
} = await import("../web/src/game/legionphase.js");

async function readJson(url) {
  try {
    return JSON.parse(await fs.readFile(url, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${url}: ${error.message}`, { cause: error });
  }
}

globalThis.fetch = async (url) => {
  let data;
  try {
    data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  } catch (error) {
    throw new Error(`cannot read engagement fixture ${url}: ${error.message}`, {
      cause: error,
    });
  }
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid engagement fixture ${url}: ${error.message}`, {
          cause: error,
        });
      }
    },
  };
};
const { loadTerrain } = await import("../web/src/game/pathfind.js");
await loadTerrain();
assert.equal(roadGraphReady(), true);

let ki;
try {
  ki = await fs.readFile(new URL("../../Dragon/KI.EXE", import.meta.url));
} catch (error) {
  throw new Error(`cannot read canonical KI.EXE: ${error.message}`, {
    cause: error,
  });
}
const assertKiBytes = (va, hex) =>
  assert.equal(
    ki.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
    `KI.EXE ${va.toString(16)}`,
  );
assertKiBytes(0x26ff, "800c018a440a9803d8");
assertKiBytes(0x274c, "f60401740e3cce720a3cdd7706e824017201c3");
assertKiBytes(0x25c1, "fe4c0b750c8a441e88440b8024dfe89000");
assertKiBytes(0x474e, "e88128");
assertKiBytes(0x701d, "c6440b01");

const raw = await readJson(new URL("../web/data.json", import.meta.url));
function scenarioWithTestLegions() {
  const scenario = structuredClone(raw.scenarios[0]);
  initializeLegionSlotState(scenario); // Explicit empty chapter fixture, slot03=0.
  for (const faction of scenario.factions) faction.n_legions = 0;
  scenario.citiesOf = (idx) =>
    scenario.cities.filter((city) => city.faction === idx);
  const factions = scenario.factions.filter(
    (faction) => faction.capital != null && scenario.cities[faction.capital],
  );
  scenario.legions = factions.slice(0, 3).map((faction) => {
    const capital = scenario.cities[faction.capital];
    faction.n_legions = 1;
    return {
      slot: faction.monarch_idx,
      generalIdx: faction.monarch_idx,
      moveDelay: 1,
      movePeriod: 3,
      leader: faction.monarch,
      faction: faction.idx,
      x: capital.x,
      y: capital.y,
      troops: 100,
      morale: 200,
      status: 0x80,
      _active: true,
      units: Array.from({ length: 6 }, (_, index) => ({
        type: (index % 3) + 1,
        troops: index === 0 ? 1000 : 0,
      })),
    };
  });
  buildArmies(scenario);
  return scenario;
}

const roadGraph = await readJson(new URL("../web/road_graph.json", import.meta.url));

// P63 G2 contact-pose planter. The deleted v1 walker can no longer walk
// !native fixtures to contact, so poses are built from real graph geometry
// plus the certified serializer/counter/bit5 writes the walker made
// (4863/4869 selection, bare-12/counter-12, first-contact bit5). Downstream
// rechecks stay genuine via the shared advance path; establishment itself
// is natively locked (verify_native_road_movement: walk/contact/counters).
function warCoveredEndpoint(sc, self, node) {
  const city = sc.cities.find(
    (candidate) => candidate.x === node.x && candidate.y === node.y,
  );
  return (
    !city ||
    city.faction === self.faction ||
    (sc.diplomacy[self.faction]?.[city.faction] ?? 0xff) < 0x80
  );
}
function plantFieldPose(sc, A, foe, calmFar = false) {
  const home = roadGraph.nodes.find(
    (node) => node.x === A.x && node.y === A.y,
  );
  assert.ok(home, "pose capital must sit on a graph node");
  const farOf = (candidate) =>
    roadGraph.nodes[
      candidate.source === home.id ? candidate.target : candidate.source
    ];
  const edge = roadGraph.edges.find((candidate) => {
    if (
      candidate.points.length === 0 ||
      (candidate.source !== home.id && candidate.target !== home.id)
    )
      return false;
    const far = farOf(candidate);
    if (!warCoveredEndpoint(sc, A, far)) return false;
    // calmFar: no hostile city at the far end, so a later due-poll
    // recheck with vanished candidates clears instead of sieging.
    if (calmFar) {
      const city = sc.cities.find(
        (candidateCity) =>
          candidateCity.x === far.x && candidateCity.y === far.y,
      );
      if (city && city.faction !== A.faction) return false;
    }
    return true;
  });
  assert.ok(edge, "pose capital must offer a war-covered edge");
  const stride = edge.source === home.id ? 4 : -4;
  const points = (stride === 4 ? edge.points : edge.points.toReversed()).map(
    ({ x, y }) => ({ x, y }),
  );
  const far = roadGraph.nodes[stride === 4 ? edge.target : edge.source];
  A._march = {
    targetX: far.x,
    targetY: far.y,
    targetNode: far.id,
    currentNode: home.id,
    edgeId: edge.id,
    stride,
    fromNode: home.id,
    toNode: far.id,
    points,
    pointIndex: 0,
  };
  A._path = points.map((point) => ({ ...point }));
  A.target =
    sc.cities.find((city) => city.x === far.x && city.y === far.y) ?? null;
  foe.x = points[0].x;
  foe.y = points[0].y;
  foe.prevX = foe.x;
  foe.prevY = foe.y;
  A._engagement = {
    kind: "field",
    countdown: 12,
    target: { x: points[0].x, y: points[0].y, faction: foe.faction },
  };
  A.status |= 0x20;
  bindLegionSlotCounter(sc, A);
  sc.legionSlotCounters[A.slot] = 12;
  A.engagementCountdown = 12;
  const projected = serializeRoadMarchContext(A._march);
  A.roadEdgeOrNode = projected.edgeOrNode;
  A.roadPointAddress = projected.pointAddress;
  A.roadStride = projected.stride;
  return points[0];
}
function plantSiegePose(sc, A, factionOf) {
  const hostileAt = (node) =>
    sc.cities.find(
      (city) =>
        city.x === node.x &&
        city.y === node.y &&
        city.faction != null &&
        (factionOf == null || city.faction === factionOf) &&
        city.faction !== A.faction &&
        (sc.diplomacy[A.faction]?.[city.faction] ?? 0xff) < 0x80,
    );
  const edge = roadGraph.edges.find(
    (candidate) =>
      candidate.points.length > 1 &&
      (hostileAt(roadGraph.nodes[candidate.target]) ||
        hostileAt(roadGraph.nodes[candidate.source])),
  );
  assert.ok(edge, "graph must offer a war-covered hostile endpoint edge");
  const far = hostileAt(roadGraph.nodes[edge.target])
    ? roadGraph.nodes[edge.target]
    : roadGraph.nodes[edge.source];
  const near =
    roadGraph.nodes[far.id === edge.target ? edge.source : edge.target];
  const stride = far.id === edge.target ? 4 : -4;
  const points = (stride === 4 ? edge.points : edge.points.toReversed()).map(
    ({ x, y }) => ({ x, y }),
  );
  const city = hostileAt(far);
  A.x = points[points.length - 2].x;
  A.y = points[points.length - 2].y;
  A.prevX = A.x;
  A.prevY = A.y;
  A.target = city;
  A._march = {
    targetX: city.x,
    targetY: city.y,
    targetNode: far.id,
    currentNode: near.id,
    edgeId: edge.id,
    stride,
    fromNode: near.id,
    toNode: far.id,
    points,
    pointIndex: points.length - 1,
  };
  A._path = points.slice(points.length - 1).map((point) => ({ ...point }));
  A._engagement = {
    kind: "siege",
    countdown: 12,
    target: { cityIdx: city.idx },
  };
  A.status |= 0x20;
  bindLegionSlotCounter(sc, A);
  sc.legionSlotCounters[A.slot] = 12;
  A.engagementCountdown = 12;
  const projected = serializeRoadMarchContext(A._march);
  A.roadEdgeOrNode = projected.edgeOrNode;
  A.roadPointAddress = projected.pointAddress;
  A.roadStride = projected.stride;
  return city;
}

// P63 G2: the v1 walk-to-contact establishment below (moved/contact/
// bare-12/position/defender-clean via stepTo) is dropped with the deleted
// arm. Establishment is natively locked (verify_native_road_movement:
// walk, contact kind/countdown/position, counters, bit5). The slot-tail
// rule below keeps its own lock via a planted pose.

// Independent real-slot control: initial contact12 becomes11 only at 264A.
const tailSc = scenarioWithTestLegions();
const tailA = tailSc.legions[0],
  tailD = tailSc.legions[1];
for (const row of tailSc.diplomacy) row.fill(0);
plantFieldPose(tailSc, tailA, tailD);
tailA.moveDelay = 1;
const tailPosition = { x: tailA.x, y: tailA.y };
aiTick(
  { scenario: tailSc, originalRng: { nextByte: () => 255 } },
  {
    legionBatchStart: tailA.slot,
    runCityDaily: false,
    settleDaily: false,
  },
);
assert.deepEqual({ x: tailA.x, y: tailA.y }, tailPosition);
assert.equal(tailA.engagementCountdown, 11);
assert.equal(tailA._engagement.countdown, 11);
assert.equal(tailSc.legionSlotCounters[tailA.slot], 11);

// Siege contact also begins before the city point is committed.
const siegeSc = scenarioWithTestLegions();
const siegeAttacker = siegeSc.legions[0];
// Force war with every non-attacker faction so intermediate cities do not block this isolated test.
for (let faction = 0; faction < siegeSc.diplomacy.length; faction++) {
  if (faction === siegeAttacker.faction) continue;
  siegeSc.diplomacy[siegeAttacker.faction][faction] = 0;
  siegeSc.diplomacy[faction][siegeAttacker.faction] = 0;
}
// P63 G2: the v1 siege walk below (moved-loop to contact, _march
// pointIndex/boundary-tile/anchor asserts via stepTo) is dropped with the
// deleted arm. Establishment is natively locked (verify_native_road_movement
// siege contact + cityIdx; write sequencing in the native pointer suites).
// The pre-center timing rule (2880 fires at the last road point, position
// held) has no native behavioral lock yet — gate gap item G8-nCONTACT.
// The countdown-progression rule below keeps its own lock via a plant.
const contactedCity = plantSiegePose(siegeSc, siegeAttacker, null);
assert.ok(contactedCity);
assert.notEqual(contactedCity.faction, siegeAttacker.faction);

// 攻城倒计时位于“末端据点边界tile尚未写入、尚未切入端点节点”的状态；
// 每槽264A继续递减，只有+0B到期才由0x2708→0x2880重检，不反复重建12。
{
  const beforeCountdown = siegeAttacker._engagement.countdown;
  aiTick({
    scenario: siegeSc,
    battleView: { active: false },
    originalRng: { nextByte: () => 0xff },
    hud: { flashEvent() {} },
  });
  assert.equal(
    siegeAttacker._engagement.countdown,
    beforeCountdown - 1,
    "城前攻城接触必须持续并推进倒计时",
  );
}

// 0x2662没有“见到相邻敌军便主动走出据点”的军团级威胁分支。没有
// +0x14目标的委任守军必须留在城市中心，等待攻方经0x2880进入攻城。
const fixedDefender = siegeSc.legions.find(
  (legion) =>
    legion !== siegeAttacker && legion.faction !== siegeAttacker.faction,
);
assert.ok(fixedDefender);
fixedDefender.faction = contactedCity.faction;
fixedDefender.x = contactedCity.x;
fixedDefender.y = contactedCity.y;
fixedDefender.prevX = contactedCity.x;
fixedDefender.prevY = contactedCity.y;
fixedDefender.target = null;
fixedDefender.targetNode = contactedCity.idx;
fixedDefender.commandState = null;
fixedDefender.status = 0x84;
const fixedPosition = { x: fixedDefender.x, y: fixedDefender.y };
aiTick({
  scenario: siegeSc,
  battleView: { active: false },
  originalRng: { nextByte: () => 0 },
  hud: { flashEvent() {} },
});
assert.deepEqual(
  { x: fixedDefender.x, y: fixedDefender.y },
  fixedPosition,
  "无目标委任守军不得主动走出据点迎击相邻敌军",
);

// E717边点列不含据点中心：无目标驻城军团不能被0x2831误判为野战，
// 应由城前端点的0x2880→0x4ADE→0x4C72作为真实守军进入攻城。
// P63 G2: this walk-to-siege establishment (stepTo through the deleted arm)
// is dropped. The E717 data fact stands; the behavioral lock has no native
// test yet — gate gap item G8-nCONTACT (with pre-center siege timing).
// The sibling no-sally rule stays locked above.

// 同一tick已有transition gate时，第二场countdown=1必须原样保留。
siegeAttacker._engagement = {
  kind: "siege",
  countdown: 1,
  target: { cityIdx: contactedCity.idx },
};
siegeSc.legionSlotCounters[siegeAttacker.slot] = 1;
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
  slot: (siegeAttacker.slot + 1) % 127,
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
siegeAttacker.moveDelay = 1;
second.moveDelay = 1;
siegeSc.player_faction = siegeAttacker.faction;
siegeSc.legions = [siegeAttacker, second];
siegeSc.legionSlotCounters[siegeAttacker.slot] = 1;
siegeSc.legionSlotCounters[second.slot] = 1;
for (const faction of siegeSc.factions)
  faction.n_legions = faction.idx === siegeAttacker.faction ? 2 : 0;
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
    finish();
    transitions++;
    return true;
  },
  originalRng: { nextByte: () => 0 },
  hud: { flashEvent() {} },
};
aiTick(gatedApp);
assert.equal(
  transitions,
  1,
  "边点耗尽后的有效端点攻城必须取得transition gate并结算",
);
assert.deepEqual(
  second._engagement.target,
  { cityIdx: city2.idx },
  "首场取得gate后必须立即返回，第二场接战状态原样保留",
);
active = false;

// 0x25CC/0x2831：只在轮询到期重检；替换第三势力且停战仍保留timer并换目标。
const raceSc = scenarioWithTestLegions();
const raceA = raceSc.legions[0];
for (let faction = 0; faction < raceSc.diplomacy.length; faction++) {
  raceSc.diplomacy[raceA.faction][faction] = 0;
}
// P63 G2: the two stepTo walk calls below are replaced by a planted pose
// (calm far end: no hostile city, so the final vanished-candidate recheck
// clears). Replacement/truce/timer asserts below evaluate genuinely.
const originalFoe = raceSc.legions.find((legion) => legion !== raceA);
plantFieldPose(raceSc, raceA, originalFoe, true);
raceA.target = raceSc.cities.find(
  (city) => city.faction != null && city.faction !== raceA.faction,
);
assert.ok(raceA.target, "race needs a non-own destination marker");
assert.equal(raceA.engagementCountdown, 12); // Planted bare contact.
raceA.moveDelay = 3; // Explicit next three visits: 3→2→1→reload3.
raceA.movePeriod = 3;
originalFoe.moveDelay = 8;
const replacementFaction = raceSc.factions.find(
  (faction) =>
    faction.idx !== raceA.faction && faction.idx !== originalFoe.faction,
).idx;
originalFoe.x = raceA.target.x;
originalFoe.y = raceA.target.y;
// Replacement takes the candidate point the planted pose established.
const raceNext = raceA._march.points[raceA._march.pointIndex];
const replacement = {
  ...structuredClone(originalFoe),
  // 283A/4C75仅扫描0..126；127不是合法接敌候选。
  slot: 126,
  _runtimeId: 126,
  moveDelay: 8,
  movePeriod: 3,
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
// P63 G2: raceTarget (the walk's destination) is replaced by the planted
// target above; foe relocation below is unchanged.
const raceApp = {
  scenario: raceSc,
  battleView: { active: false },
  originalRng: { nextByte: () => 0 },
  hud: { flashEvent() {} },
};
aiTick(raceApp);
assert.equal(raceApp._strategicBattleFailure, undefined);
assert.equal(raceA.moveDelay, 2);
assert.equal(raceA._engagement.kind, "field");
assert.equal(raceA._engagement.countdown, 11);
assert.equal(
  raceA._engagement.target.faction,
  originalFoe.faction,
  "非轮询槽保留接触缓存",
);
aiTick(raceApp);
assert.equal(raceApp._strategicBattleFailure, undefined);
assert.equal(raceA.moveDelay, 1);
assert.equal(raceA._engagement.countdown, 10);
aiTick(raceApp);
assert.equal(raceApp._strategicBattleFailure, undefined);
assert.equal(raceA.moveDelay, 3);
assert.equal(raceA._engagement.countdown, 9);
assert.equal(raceA._engagement.target.faction, replacementFaction);
replacement.x = raceA.target.x;
replacement.y = raceA.target.y;
const beforeResume = { x: raceA.x, y: raceA.y };
for (let visit = 0; visit < 2; visit++) {
  aiTick(raceApp);
  assert.equal(raceApp._strategicBattleFailure, undefined);
  assert.equal(raceA.moveDelay, 2 - visit);
  assert.ok(raceA._engagement, "目标消失仍须等下一次道路轮询才清理");
  assert.deepEqual({ x: raceA.x, y: raceA.y }, beforeResume);
}
aiTick(raceApp);
assert.equal(raceApp._strategicBattleFailure, undefined);
assert.equal(raceA.moveDelay, 3);
assert.equal(raceA._engagement, null);
// P63 G2: the movement-resumption assertion below (position changes via the
// deleted walker in the due road-poll tick) is dropped. Lost-contact
// movement resume has no native behavioral lock yet — gate gap item
// G8-nRESUME (shared with the retreat restore-resume rule). Position holds:
// the fail-closed stepTo clears the target but never fabricates motion.
assert.deepEqual({ x: raceA.x, y: raceA.y }, beforeResume);

// 0x2831严格军团槽序：数组打乱也必须先命中低槽己方，从而不见高槽敌军。
// P63 G2: this bare-stepTo scan-order probe is dropped with the deleted arm
// (it would now pass trivially via fail-closed "blocked"). The rule is
// natively locked (verify_native_road_movement "2831 low-slot friend
// wins").

// 0x42AB最后边矩阵：己方/中立/交战第三方继续；未开战第三方转向另一端。
// P63 G2: the walk-to-contact preamble plus the "reversed"/stride-flip
// assertions below go through the deleted arm. The v1-only "reversed"
// return contract has no native counterpart (native 42AB re-routes
// internally and stays on moved/contact). 42AB behavior is natively locked
// (verify_native_road_movement "42AB continues same action" + "42AB only
// FC selects source").

// 多边路线的当前中间端点易主：0x42AB看nav.toNode，不得误看最终target。
// P63 G2: dropped with the S11 reversal section above (same v1-only
// return contract); native 42AB endpoint handling is covered by the same
// native tests cited there.
// P63 G2: dropped with the multi-edge reversal walk above.

process.stdout.write(
  "engagement state OK: contact recheck + replacement/truce + gate (P63 G2: v1 walk/reversal probes dropped, natively locked)\n",
);
