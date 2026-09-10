// KI:25A3/264A/2831/2880/6FD2 certificate + active-contact runtime differential.
// Explicit original assets only. No original SAVE.DAT access; snapshots are memory-only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

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
const { aiTick, buildArmies, stepTo } = await import("../web/src/game/ai.js");
const { loadTerrain } = await import("../web/src/game/pathfind.js");
const { findRoadRoute } = await import("../web/src/game/roadgraph.js");
const { snapshotState } = await import("../web/src/game/savegame.js");
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
await loadTerrain();
await preloadEngageSfx();
const data = await readJson(new URL("../web/data.json", import.meta.url));

function contactFixture(kind, types) {
  const sc = structuredClone(data.scenarios[0]);
  const factions = sc.factions.filter((f) => sc.cities[f.capital]).slice(0, 2);
  sc.legions = factions.map((f, slot) => ({
    slot,
    leader: f.monarch,
    faction: f.idx,
    status: 0x84,
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
  const target = sc.cities.find(
    (city) =>
      city.faction != null &&
      city.faction !== attacker.faction &&
      findRoadRoute(attacker.x, attacker.y, city.x, city.y)?.points.length > 2,
  );
  attacker.target = target;
  assert.equal(stepTo(sc, attacker, target.x, target.y), "moved");
  if (kind === "field") {
    const point = attacker._march.points[attacker._march.pointIndex];
    defender.x = point.x;
    defender.y = point.y;
  } else defender.dead = true;
  let result = "moved";
  for (let guard = 0; guard < 2000 && result === "moved"; guard++)
    result = stepTo(sc, attacker, target.x, target.y);
  assert.equal(result, "contact");
  assert.equal(attacker._engagement.kind, kind);
  return { sc, attacker };
}

for (const kind of ["field", "siege"]) {
  for (const types of [
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 4],
  ]) {
    sounds = [];
    mainTick = 0;
    const { sc, attacker } = contactFixture(kind, types);
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
      if (mainTick % 8 !== 0 || mainTick === 96) continue;
      const visit = mainTick / 8;
      assert.equal(attacker._engagement.countdown, Math.max(1, 11 - visit));
      assert.equal(attacker.moveDelay, period - (visit % period));
      if (visit === 4) {
        const saved = snapshotState(app, 0, "isolated contact");
        const restored = saved.state;
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
        Object.assign(attacker, reloaded);
        restored.legions[restored.legions.indexOf(reloaded)] = attacker;
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
