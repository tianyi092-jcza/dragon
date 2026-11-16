// M192后开放：v3正式包经玩家管线进入共同可玩准入（测试-only）。
// 合成257城v3正式包 → loadPlayerPack → createPlayerEnvironment →
// loadRoadGraph(v3) → prepareScenario fresh → assertPlayableScenario放行。
// 无真实登记源、存档、profile或网络；blob URL仅内存对象。
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadPlayerPack } from "../web/src/player/playerpack.js";
import { createPlayerEnvironment } from "../web/src/player/playerenvironment.js";
import {
  prepareScenario,
  assertPlayableScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const TOTAL = 257;
const gameId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const releaseId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const sourceDigest = "c".repeat(64);
const chapterId = `${gameId}#chapter`;

function graphFixture() {
  const edgeBase = (TOTAL * 8 + 15) & ~15;
  const graph = {
    version: 3,
    width: 384,
    height: 256,
    nodes: Array.from({ length: TOTAL }, (_, id) => ({
      id,
      x: id + 1,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  graph.nodes[0].edgeSlots[0] = 0x4000 | edgeBase;
  graph.nodes[1].edgeSlots[0] = 0x8000 | edgeBase;
  graph.edges.push({
    id: 0,
    source: 0,
    target: 1,
    weight: 1,
    bounds: { minX: 1, maxX: 2, minY: 11, maxY: 11 },
    points: [
      { x: 1, y: 11, flags: 0x44 },
      { x: 2, y: 11, flags: 4 },
    ],
  });
  return graph;
}

function templateFixture(graph) {
  return {
    player_faction: 0,
    generals: [],
    legions: [],
    factions: [
      {
        idx: 0, capital: 0, n_legions: 0, active: true, attr: 0x80,
        money: 1000, legion_morale_cap: 200, march_marker_style: 0,
        strategic_city_primary: null, strategic_city_secondary: null,
        n_cities: TOTAL - 1,
      },
      {
        idx: 1, capital: TOTAL - 1, n_legions: 0, active: true, attr: 0x80,
        money: 1000, legion_morale_cap: 200, march_marker_style: 0,
        strategic_city_primary: null, strategic_city_secondary: null,
        n_cities: 1,
      },
    ],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id, x, y,
      faction: id === TOTAL - 1 ? 1 : 0,
      attr: 0x80, governor: null,
      _aiCooldown: 0,
      _strategicLastFaction: id === TOTAL - 1 ? 1 : 0,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
      disaster_event: 0,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    weatherClouds: Array.from({ length: 16 }, () => ({})),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
    nativeCityRecordRaw: Array.from({ length: TOTAL }, () => "00".repeat(32)),
  };
}

test("v3 257-city formal pack enters common playable admission", async () => {
  const graph = graphFixture();
  const template = templateFixture(graph);
  const chapterBytes = encode(template);
  const graphBytes = encode(graph);
  const types = {
    terrain: "application/octet-stream",
    roadGraph: "application/json",
    roadCost: "application/octet-stream",
    roadOffset: "application/json",
    minimapBase: "image/png",
    minimapLarge: "image/png",
  };
  const roles = {
    terrain: "rules-initial-terrain",
    roadGraph: "native-road-v3",
    roadCost: "legacy-grid-visual",
    roadOffset: "legacy-grid-visual",
    minimapBase: "automatic-minimap",
    minimapLarge: "automatic-minimap",
  };
  const data = new Map();
  const manifest = {
    schemaVersion: 2,
    buildFormat: "studio-app-3",
    compilerRevision: TRIAL_COMPILER_REVISION,
    identity: { gameId, draftRevision: "1", sourceDigest },
    chapters: [chapterId],
    world: { id: `${gameId}-world`, revision: sourceDigest, width: 384, height: 256, tileSize: 16 },
    assets: [],
    minimapAssets: [],
    portraits: [],
    visualAssets: { seasonAtlases: {}, seasons: {} },
  };
  const put = (assetId, bytes, type) => {
    data.set(`asset:${assetId}`, { bytes, contentType: type, sha256: sha(bytes) });
    const entry = {
      assetId, role: roles[assetId], byteLength: bytes.length, sha256: sha(bytes),
      url: `/api/trial-asset?game=${gameId}&revision=1&digest=${sourceDigest}&asset=${assetId}`,
    };
    (assetId.startsWith("minimap") ? manifest.minimapAssets : manifest.assets).push(entry);
  };
  for (const [assetId, type] of Object.entries(types)) {
    // Terrain/cost must satisfy the real grid-dimension admission in
    // loadTerrain; offsets must be a valid (possibly empty) table.
    const bytes = assetId === "roadGraph" ? graphBytes
      : assetId === "terrain" ? new Uint8Array(384 * 256).fill(0xba)
      : assetId === "roadCost" ? new Uint8Array(384 * 256).fill(1)
      : assetId === "roadOffset" ? encode({})
      : encode(assetId);
    put(assetId, bytes, type);
  }
  const portraitBytes = encode("owned portrait");
  data.set("asset:p2", { bytes: portraitBytes, contentType: "image/png", sha256: sha(portraitBytes) });
  manifest.portraits.push({ assetId: "p2", role: "game-portrait", mime: "image/png", url: "kao/p2.png", sha256: sha(portraitBytes), byteLength: portraitBytes.length });
  const statics = new Map();
  for (const [group, stem] of [["seasonAtlases", "map_atlas_"], ["seasons", "map_tiles_"]]) {
    for (const season of ["spring", "summer", "autumn", "winter"]) {
      const path = `content/builtin/compiled/map-2-${sourceDigest}/${stem}${season}.png`;
      const bytes = encode(path);
      manifest.visualAssets[group][season] = { path, url: path, sha256: sha(bytes), byteLength: bytes.length };
      statics.set(path, { bytes, contentType: "image/png", sha256: sha(bytes) });
    }
  }
  const manifestBytes = encode(manifest);
  const identity = Object.freeze({
    gameId, releaseId, ordinal: "1.0", revision: "1",
    sourceDigest, chapterId, chapters: [chapterId], manifestDigest: sha(manifestBytes),
  });
  const session = {
    identity,
    state: () => "active",
    read: async (role) => {
      if (role === "manifest") {
        return { bytes: manifestBytes, contentType: "application/json", sha256: sha(manifestBytes) };
      }
      if (role === `chapter:${chapterId}`) {
        return { bytes: chapterBytes, contentType: "application/json", sha256: sha(chapterBytes) };
      }
      const hit = data.get(role);
      assert.ok(hit, `unexpected pack role ${role}`);
      return hit;
    },
  };
  const pack = await loadPlayerPack({
    session,
    compilerRevision: TRIAL_COMPILER_REVISION,
    maxTotalBytes: 128 * 1024 * 1024,
    readStatic: async (path) => {
      const hit = statics.get(path);
      assert.ok(hit, `unexpected static ${path}`);
      return hit;
    },
  });
  try {
    const environment = createPlayerEnvironment(pack, { playerFaction: 0 });
    assert.equal(environment.raw.cities.length, TOTAL);
    const roads = await environment.world.roads.loadRoadGraph();
    assert.equal(roads.version, 3);
    assert.equal(roads.nodes.length, TOTAL);
    const raw = environment.raw;
    initializeNativeLegionSlotsFromZeroChapter(raw);
    attachSyntheticNativeFactionSource(raw);
    if (raw.nativeLegionSlots) {
      for (const legion of raw.legions) raw.nativeLegionSlots.records[legion.slot] = legion;
      rebindNativeLegionViews(raw);
    }
    const prepared = await prepareScenario({
      raw,
      idx: 0,
      mode: "fresh",
      content: environment.content,
      world: environment.world,
      terrainMemory: { version: 1, spans: [{ address: 0, hex: "ba".repeat(384 * 256) }] },
      movementMemory: { version: 1, spans: [{ address: 3840, hex: "00".repeat(768) }] },
    });
    assert.equal(prepared.scenario.cities.length, TOTAL);
    assert.equal(prepared.metadata.roadVersion, 3);
    assert.equal(prepared.scenario.cities[TOTAL - 1].faction, 1);
    assert.doesNotThrow(() => assertPlayableScenario({ metadata: prepared.metadata }));
    const context = scenarioNativeRoadContext(prepared.scenario);
    assert.equal(context.cityCache.readByte(256), 0);
    assert.equal(context.readCityOwner(256, "M192-open"), 1);
  } finally {
    pack.close();
  }
});
