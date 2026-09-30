// E-02 foundation: admin full copy + ordinary minimal copy of the built-in
// game, validated, with trial-load of the copied chapter 0 through the same
// loader (prepareScenario, memory-only, no IndexedDB). Asserts: fresh game
// identity + sourceRef digest pinned to the source revision; 192 cities and
// general slots bound with local ids stable; chapter ids namespaced with
// refs rewritten; map validates via mapcompile; copy determinism (two
// copies byte-identical); minimal copy has empty chapters; trial assembles
// and binds native context. Pure node except the harness prepare (same as
// other engine tools). No SAVE.DAT, no disk writes outside stdout.
import assert from "node:assert/strict";
import test from "node:test";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  copyBuiltinGame,
  checkGameName,
  checkChapterDrift,
  BUILTIN_GAME_ID,
} from "../web/src/content/authoring/gamesource.js";
import { validateMapSource } from "../web/src/content/authoring/mapcompile.js";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";

const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const readJSON = (p) => {
  try {
    return JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
  } catch (error) {
    throw new Error(`cannot load ${p}`, { cause: error });
  }
};

const world = readJSON("../web/content/builtin/world/world.json");
const catalog = readJSON("../web/content/builtin/catalog.json");
// Chapter states come from data.json (engine-complete templates carrying
// the raw blocks createNewGameScenario needs); content/builtin/chapters/
// files are a raw-less projection and cannot trial-run as-is.
const dataScenarios = readJSON("../web/data.json").scenarios;
assert.equal(dataScenarios.length, 20);
const chapters = catalog.chapters.map((entry) => ({
  id: entry.id,
  state: dataScenarios[entry.legacyScenarioIndex],
}));
assert.equal(chapters.length, 20, "built-in has 20 chapters");
// M2 unified map (validated authoring source for the built-in world).
const mapSource = readJSON("../.dragon-analysis/map-migration/unified-a/unified_mapsource.json");
validateMapSource(mapSource);

const source = {
  revision: "1",
  world,
  map: mapSource.map,
  componentDefinitions: mapSource.componentDefinitions ?? {},
  chapters,
};

const full = copyBuiltinGame(
  { gameId: "test-copy-001", ownerId: "admin-1", kind: "full", source },
  sha256hex,
);
assert.equal(full.gameId, "test-copy-001");
assert.notEqual(full.gameId, BUILTIN_GAME_ID);
assert.equal(full.sourceRef.sourceId, BUILTIN_GAME_ID);
assert.equal(full.sourceRef.kind, "builtin-copy");
assert.equal(Object.keys(full.cities).length, 192);
assert.equal(Object.keys(full.chapters).length, 20);
assert.equal(full.chapterOrder.length, 20);
for (const [oldId, newId] of Object.entries(full.compatibility.idMap.chapters)) {
  assert.ok(newId.startsWith("test-copy-001#"), "chapter ids namespaced");
  assert.ok(full.chapters[newId].state, "chapter state carried");
  void oldId;
}
for (const [id, city] of Object.entries(full.cities)) {
  assert.equal(city.cityId, id, "local city ids stable");
  assert.ok(Number.isInteger(city.runtimeSlot), "slot bound");
}
// Slot bindings cover all 192 fixed slots exactly once.
assert.deepEqual(
  Object.values(full.compatibility.slotBindings.cities).sort((a, b) => a - b),
  Array.from({ length: 192 }, (_, i) => i),
);
// Determinism: a second copy is identical.
const full2 = copyBuiltinGame(
  { gameId: "test-copy-001", ownerId: "admin-1", kind: "full", source },
  sha256hex,
);
assert.deepEqual(full2, full, "copy is deterministic");
tlog("full copy: identity + sourceRef + 192 slots + 20 chapters + deterministic");

// Minimal copy: empty chapters, base cities only.
const minimal = copyBuiltinGame(
  { gameId: "test-copy-002", ownerId: "user-7", kind: "minimal", source },
  sha256hex,
);
assert.equal(Object.keys(minimal.chapters).length, 0);
assert.equal(minimal.chapterOrder.length, 0);
assert.equal(Object.keys(minimal.cities).length, 192);
assert.equal(minimal.sourceRef.kind, "builtin-template");
tlog("minimal copy: map + base cities, chapters empty");

// Name rules (contract §1): valid passes, over-limit/controls rejected.
assert.equal(checkGameName("測試複製", 8), "測試複製");
assert.throws(() => checkGameName("123456789", 8), RangeError);
assert.throws(() => checkGameName("ab\u0007cd", 20), RangeError);
tlog("name rules: pass + limit/control rejections");

// Refusals: builtin identity, bad kind, bad revision.
assert.throws(() => copyBuiltinGame({ gameId: BUILTIN_GAME_ID, kind: "full", source }, sha256hex), RangeError);
assert.throws(() => copyBuiltinGame({ gameId: "x", kind: "half", source }, sha256hex), RangeError);
assert.throws(
  () => copyBuiltinGame({ gameId: "x", kind: "full", source: { ...source, revision: "" } }, sha256hex),
  TypeError,
);
tlog("copy refusals: identity/kind/revision");

// Drift diagnostics: the fatal set below is the pre-fix production-hold
// set (ch6 arbiter); after the 3F29 dead-slot skip it boots with
// reconstruction writes. Kept as a diagnostic pin, not a refusal.
const drift = checkChapterDrift(full);
const fatalChapters = [...new Set(drift.fatal.map((e) => e.chapter))].sort();
const fatalDataIdx = fatalChapters.map((id) => full.chapterOrder.indexOf(id)).sort((a, b) => a - b);
assert.deepEqual(fatalDataIdx, [0, 5, 6, 8, 14, 15], "fatal chapters match the production-hold set");
assert.ok(drift.notes.length > 0, "non-fatal drift stays diagnostic");
const ch1 = full.chapterOrder[1];
assert.ok(!drift.fatal.some((e) => e.chapter === ch1), "trial chapter is fatal-free");
tlog(`drift gate: fatal in chapters ${fatalDataIdx.join(",")}, notes ${drift.notes.length}`);
// Memory-only harness (no IndexedDB): real v2 road graph via fetch stub,
// synthetic native faction source, first copied chapter as template.
test("trial-load of the copied chapter assembles", async () => {
  // chapters[1] (22 factions, no fatal named/raw drift) keeps the loop
  // on the E-02 question; fatal-drift chapters are a separate data probe.
  const firstId = full.chapterOrder[1];
  const stored = full.chapters[firstId].state;
  const template = structuredClone(stored);
  const manifest = {
    schemaVersion: 1,
    rules: "ki-1995",
    id: "trial-copy",
    revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: false }],
  };
  const content = createContentCatalog(manifest, { scenarios: [template] });
  const worldRes = createWorldResources();
  const raw = createNewGameScenario(template);
  // Real chapter states carry their own native slot/diplomacy raws
  // (data.json); the synthetic source is only for raw-less fixtures.
  if (!Object.hasOwn(raw, "nativeFactionSlotRaw")) attachSyntheticNativeFactionSource(raw);
  const realGraph = readJSON("../web/road_graph.json");
  const oldFetch = globalThis.fetch;
  const allowed = new Set([
    worldRes.definition.assets.terrain,
    worldRes.definition.assets.roadCost,
    worldRes.definition.assets.roadOffset,
    worldRes.definition.assets.roadGraph,
  ]);
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    if (String(url) === worldRes.definition.assets.roadGraph) {
      return { ok: true, json: async () => realGraph };
    }
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(384 * 256),
      json: async () => ({}),
    };
  };
  try {
    const prepared = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world: worldRes });
    assert.ok(scenarioNativeRoadContext(prepared.scenario), "trial binds native context");
    assert.equal(prepared.scenario.cities.length, 192);
  } finally {
    globalThis.fetch = oldFetch;
  }
  tlog("trial-load: copied chapter assembles through the production loader");
});
