// KI:25A3/264A/2831/2880/6FD2 certificate + active-contact runtime differential.
// Explicit original assets only. No original SAVE.DAT access; snapshots are memory-only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  initializeLegionSlotState,
  bindLegionSlotCounter,
  finishLegionSlotTail,
} from "../web/src/game/legionphase.js";
import { initializeFactionLegionCounts } from "../web/src/game/legioncounts.js";

const ki = await fs.readFile(new URL("../../Dragon/KI.EXE", import.meta.url));
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
for (const [va, hex] of [
  [0x25b2, "b91000"],
  [0x25c1, "fe4c0b750c8a441e88440b8024dfe89000"],
  [0x2658, "fe4c037504c6440301c3"],
  [0x2866, "c644030ceb0ab003e884daeb03e80522"],
  [0x28ae, "c644030ceb0eb003e83cdaeb0781c74008e81c22"],
  [0x6fe0, "807f0201740380cd01"],
  [0x6ff9, "fec581fb2c017602fec5886c1e"],
])
  assert.equal(
    ki.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
    va.toString(16),
  );

async function readJson(url) {
  try {
    return JSON.parse(await fs.readFile(url, "utf8"));
  } catch (cause) {
    throw new Error(`Invalid fixture ${url}`, { cause });
  }
}
let mainTick = 0;
let sounds = [];
class AudioMock {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
  }
  async decodeAudioData() {
    return { duration: 0.65 };
  }
  createBufferSource() {
    return {
      playbackRate: {},
      connect() {},
      disconnect() {},
      stop() {},
      start(at) {
        // Detect any forbidden rule-driven request, excluding scheduled ID13.
        if (at === 0) sounds.push(mainTick);
      },
    };
  }
}
globalThis.window = { AudioContext: AudioMock };
globalThis.fetch = async (url) => {
  const resolved =
    url instanceof URL ? url : new URL(`../web/${url}`, import.meta.url);
  const bytes = await fs.readFile(resolved);
  return {
    ok: true,
    status: 200,
    json: () => readJson(resolved),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};
const { preloadEngageSfx } = await import("../web/src/core/speaker.js");
const { aiTick, buildArmies } = await import("../web/src/game/ai.js");
const { loadTerrain } = await import("../web/src/game/pathfind.js");
// Certified projection serializer: plants the road-field writes the deleted
// walker made on selection (4863/4869) so the shared cache-consistency
// check (prepareRoadMarchProjection) sees the same authority it saw then.
const { serializeRoadMarchContext } = await import(
  "../web/src/game/roadgraph.js"
);
// Real graph geometry for contact-pose construction (replaces the deleted
// v1 walk oracle; G7 removes the roadgraph module).
const { snapshotState, restoreSnapshotState } = await import(
  "../web/src/game/savegame.js"
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
await loadTerrain();
await preloadEngageSfx();
const data = await readJson(new URL("../web/data.json", import.meta.url));
const roadGraph = await readJson(
  new URL("../web/road_graph.json", import.meta.url),
);

function contactFixture(kind, types) {
  const sc = structuredClone(data.scenarios[0]);
  initializeLegionSlotState(sc);
  initializeFactionLegionCounts(sc);
  const period = types.every((type) => type === 1) ? 2 : 3;
  const factions = sc.factions.filter((f) => sc.cities[f.capital]).slice(0, 2);
  for (const faction of factions) faction.n_legions = 1;
  sc.legions = factions.map((f, slot) => ({
    slot,
    generalIdx: f.monarch_idx,
    leader: f.monarch,
    faction: f.idx,
    status: 0x84,
    // Direct stepTo below represents the action AFTER the slot has reloaded.
    moveDelay: period,
    movePeriod: period,
    _active: true,
    x: sc.cities[f.capital].x,
    y: sc.cities[f.capital].y,
    troops: 100,
    morale: 200,
    units: types.map((type, index) => ({
      type,
      troops: index === 0 ? 1000 : 0,
    })),
  }));
  buildArmies(sc);
  const [attacker, defender] = sc.legions;
  sc.player_faction = attacker.faction;
  for (let faction = 0; faction < sc.diplomacy.length; faction++) {
    if (faction === attacker.faction) continue;
    sc.diplomacy[attacker.faction][faction] = 0;
    sc.diplomacy[faction][attacker.faction] = 0;
  }
  // P63 G2: v1 walker deleted (stepTo on !native fails closed). Plant the
  // contact the walk produced using real graph geometry. The certified
  // subjects below — bare 12, 264A tail to 11, due-poll ticks, no rule
  // audio, snapshot resume, visit-12 resolution — evaluate genuinely via
  // the shared advance path; countdown-12 shape is natively locked
  // (verify_native_road_movement) and statically (KI 26FF/274C asserts in
  // verify_engagement_state, kept).
  const homeNode = roadGraph.nodes.find(
    (node) => node.x === attacker.x && node.y === attacker.y,
  );
  assert.ok(homeNode, "fixture capital must sit on a graph node");
  if (kind === "field") {
    // Far endpoint must be war-covered: an out-of-range/neutral endpoint
    // city would genuinely trip the 42AB reverse gate (verified by debug),
    // which is engine-correct but not this test's subject.
    const warCovered = (node) => {
      const city = sc.cities.find(
        (candidate) => candidate.x === node.x && candidate.y === node.y,
      );
      return (
        !city ||
        city.faction === attacker.faction ||
        (sc.diplomacy[attacker.faction]?.[city.faction] ?? 0xff) < 0x80
      );
    };
    const edge = roadGraph.edges.find(
      (candidate) =>
        candidate.points.length > 0 &&
        (candidate.source === homeNode.id ||
          candidate.target === homeNode.id) &&
        warCovered(
          roadGraph.nodes[
            candidate.source === homeNode.id
              ? candidate.target
              : candidate.source
          ],
        ),
    );
    assert.ok(edge, "capital node must offer a road edge");
    const stride = edge.source === homeNode.id ? 4 : -4;
    const points = (stride === 4 ? edge.points : edge.points.toReversed()).map(
      ({ x, y }) => ({ x, y }),
    );
    const farNode =
      roadGraph.nodes[stride === 4 ? edge.target : edge.source];
    attacker._march = {
      targetX: farNode.x,
      targetY: farNode.y,
      targetNode: farNode.id,
      currentNode: homeNode.id,
      edgeId: edge.id,
      stride,
      fromNode: homeNode.id,
      toNode: farNode.id,
      points,
      pointIndex: 0,
    };
    attacker._path = points.map((point) => ({ ...point }));
    attacker.target =
      sc.cities.find((city) => city.x === farNode.x && city.y === farNode.y) ??
      null;
    defender.x = points[0].x;
    defender.y = points[0].y;
    defender.prevX = defender.x;
    defender.prevY = defender.y;
    attacker._engagement = {
      kind: "field",
      countdown: 12,
      target: { x: points[0].x, y: points[0].y, faction: defender.faction },
    };
    const fieldProjected = serializeRoadMarchContext(attacker._march);
    attacker.roadEdgeOrNode = fieldProjected.edgeOrNode;
    attacker.roadPointAddress = fieldProjected.pointAddress;
    attacker.roadStride = fieldProjected.stride;
    attacker.engagementCountdown = 12;
  } else {
    // Siege: relocate onto a real edge ending at a hostile city, posed at
    // the last unconsumed boundary point like the walker left it.
    const hostileAt = (node) =>
      sc.cities.find(
        (city) =>
          city.x === node.x &&
          city.y === node.y &&
          city.faction != null &&
          city.faction !== attacker.faction &&
          (sc.diplomacy[attacker.faction]?.[city.faction] ?? 0xff) < 0x80,
      );
    const edge = roadGraph.edges.find(
      (candidate) =>
        candidate.points.length > 1 &&
        (hostileAt(roadGraph.nodes[candidate.target]) ||
          hostileAt(roadGraph.nodes[candidate.source])),
    );
    assert.ok(edge, "graph must offer a hostile endpoint edge");
    const farNode = hostileAt(roadGraph.nodes[edge.target])
      ? roadGraph.nodes[edge.target]
      : roadGraph.nodes[edge.source];
    const nearNode =
      roadGraph.nodes[farNode.id === edge.target ? edge.source : edge.target];
    const stride = farNode.id === edge.target ? 4 : -4;
    const points = (
      stride === 4 ? edge.points : edge.points.toReversed()
    ).map(({ x, y }) => ({ x, y }));
    const city = hostileAt(farNode);
    attacker.x = points[points.length - 2].x;
    attacker.y = points[points.length - 2].y;
    attacker.prevX = attacker.x;
    attacker.prevY = attacker.y;
    attacker._march = {
      targetX: city.x,
      targetY: city.y,
      targetNode: farNode.id,
      currentNode: nearNode.id,
      edgeId: edge.id,
      stride,
      fromNode: nearNode.id,
      toNode: farNode.id,
      points,
      pointIndex: points.length - 1,
    };
    attacker._path = points.slice(points.length - 1).map((point) => ({
      ...point,
    }));
    attacker.target = city;
    defender.status = 0;
    defender.dead = true;
    factions[1].n_legions = 0;
    attacker._engagement = {
      kind: "siege",
      countdown: 12,
      target: { cityIdx: city.idx },
    };
    attacker.engagementCountdown = 12;
    const siegeProjected = serializeRoadMarchContext(attacker._march);
    attacker.roadEdgeOrNode = siegeProjected.edgeOrNode;
    attacker.roadPointAddress = siegeProjected.pointAddress;
    attacker.roadStride = siegeProjected.stride;
  }
  // Bare-contact counter state mirrors startEngagement's write (slot03=12);
  // the tail below then owns the single 12->11 decrement. status bit5 is
  // the genuine first-contact write (SKILL §5.1); the tail gates on it.
  attacker.status |= 0x20;
  bindLegionSlotCounter(sc, attacker);
  sc.legionSlotCounters[attacker.slot] = 12;
  assert.equal(attacker.engagementCountdown, 12, "2831/2880 action writes 12");
  finishLegionSlotTail(attacker);
  assert.equal(
    attacker.engagementCountdown,
    11,
    "264A owns the one current-slot decrement",
  );
  return { sc, attacker };
}

for (const kind of ["field", "siege"]) {
  for (const types of [
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 4],
  ]) {
    sounds = [];
    mainTick = 0;
    const { sc, attacker: firstAttacker } = contactFixture(kind, types);
    let attacker = firstAttacker;
    const period = types.every((type) => type === 1) ? 2 : 3;
    assert.equal(sounds.length, 0, "first contact writes 12->11, never ID3");
    assert.equal(
      attacker.movePeriod,
      period,
      "zero-strength non-cavalry slots still affect +1E",
    );
    let resolvedAt = null;
    const duePolls = [];
    const app = {
      scenario: sc,
      scenarioIdx: 0,
      clock: { year: 190, month: 1, day: 1 },
      originalRng: new OriginalBattleRng(0),
      battleView: { active: false },
      playDelegatedEngage() {
        resolvedAt = mainTick;
        this.engageTransition = { active: true };
        return true; // isolate entry boundary; battle mechanics tested separately
      },
    };
    for (mainTick = 1; mainTick <= 96; mainTick++) {
      if (
        mainTick % 8 === 0 &&
        attacker.moveDelay === 1 &&
        attacker._engagement?.countdown > 1
      )
        duePolls.push(mainTick);
      aiTick(app, {
        legionBatchStart: (mainTick % 8) * 16,
        settleDaily: false,
        runCityDaily: false,
      });
      assert.equal(app._strategicBattleFailure, undefined);
      if (mainTick % 8 !== 0 || mainTick === 96) continue;
      const visit = mainTick / 8;
      assert.equal(attacker._engagement.countdown, Math.max(1, 11 - visit));
      assert.equal(attacker.moveDelay, period - (visit % period));
      if (visit === 4) {
        const saved = snapshotState(app, 0, "isolated contact");
        const restored = restoreSnapshotState(saved);
        buildArmies(restored);
        const reloaded = restored.legions.find((l) => l.slot === attacker.slot);
        assert.equal(reloaded.moveDelay, attacker.moveDelay);
        assert.equal(reloaded.movePeriod, attacker.movePeriod);
        assert.equal(
          reloaded._engagement.countdown,
          attacker._engagement.countdown,
        );
        // Continue on the restored in-memory state, not just a serialization assertion.
        app.scenario = restored;
        attacker = reloaded; // Keep projections bound to the restored table, not the old scene.
      }
    }
    assert.deepEqual(
      duePolls,
      period === 2 ? [16, 32, 48, 64, 80] : [24, 48, 72],
    );
    assert.deepEqual(
      sounds,
      [],
      "rule polling must no longer emit audio; the independent presentation owns it",
    );
    assert.equal(
      resolvedAt,
      96,
      "both periods resolve on contact visit 12, no terminal ID3",
    );
  }
}
console.log(
  "engagement poll OK: raw bytes; field/siege 5-or-3 due polls, no rule audio; 16/24 main-update spacing; memory save/resume; visit-12 boundary",
);
