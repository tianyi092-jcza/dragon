// E-02 loop closure (harness-grade trial): copy -> edit one terrain cell
// via the service -> save -> validate -> compile -> trial-pack ->
// prepareScenario through the production loader with the EDITED terrain ->
// 10 days of city ticks. Asserts: draft revision bumps, edited cell is
// live in the assembled scenario, ticks stay failure-free, nothing else
// mutates. Memory-only (node has no IndexedDB; the browser trial boot with
// neutered persistence is the next step, not this tool). No SAVE.DAT.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "./editor_server.mjs";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";

const tmp = mkdtempSync(join(tmpdir(), "editor-loop-"));
const server = await startEditorServer(0, tmp);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
};

try {
  // Full copy (chapters needed for trial) + pick an isolated edit cell:
  // current tile 0x20, no road point within 2, no city within 3.
  const created = await call("POST", "/api/copy", { gameId: "loop-1", ownerId: "admin-1", kind: "full" });
  assert.equal(created.draftRevision, "1");
  const draft = await call("GET", "/api/draft?game=loop-1");
  const W = draft.map.bounds.width;
  const H = draft.map.bounds.height;
  const ref = draft.map.base.terrainRef;
  const graph = JSON.parse(
    (await import("node:fs")).readFileSync(new URL("../web/road_graph.json", import.meta.url), "utf-8"),
  );
  // Precompute exclusion zones (roads +2, cities +3) for a fast scan.
  const blocked = new Set();
  for (const e of graph.edges) {
    for (const p of e.points) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) blocked.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  }
  for (const n of graph.nodes) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) blocked.add(`${n.x + dx},${n.y + dy}`);
    }
  }
  let cell = null;
  for (let y = 0; y < H && !cell; y++) {
    for (let x = 0; x < W && !cell; x++) {
      if (ref[y * W + x] === 0x20 && !blocked.has(`${x},${y}`)) cell = [x, y];
    }
  }
  assert.ok(cell, "need an isolated grass cell");
  const [ex, ey] = cell;
  draft.map.base.terrainRef[ey * W + ex] = 0x10;
  const saved = await call("POST", "/api/save", { gameId: "loop-1", map: draft.map });
  assert.equal(saved.draftRevision, "2", "edit bumps revision");
  assert.ok((await call("POST", "/api/validate", { gameId: "loop-1" })).valid);
  const manifest = await call("POST", "/api/compile", { gameId: "loop-1" });
  assert.equal(manifest.identity.draftRevision, "2");
  tlog(`edit cell (${ex},${ey}) 20->10, rev 2, manifest built`);

  // Trial-pack -> production loader with the edited terrain.
  // Fatal-free chapter (see gamesource copy notes): chapterOrder[1].
  const trialChapter = draft.chapterOrder[1];
  assert.ok(trialChapter, "copy must carry chapterOrder[1]");
  const packRes = await fetch(`${base}/api/trial-pack?game=loop-1&chapter=${encodeURIComponent(trialChapter)}`);
  assert.equal(packRes.status, 200);
  const pack = await packRes.json();
  assert.equal(pack.manifest.identity.draftRevision, "2");
  assert.ok(pack.chapter, "trial chapter present");
  const editedByte = Number.parseInt(pack.terrainHex.slice((ey * W + ex) * 2, (ey * W + ex) * 2 + 2), 16);
  assert.equal(editedByte, 0x10, "compiled terrain carries the edit");

  const manifest2 = {
    schemaVersion: 1,
    rules: "ki-1995",
    id: "trial-loop",
    revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: false }],
  };
  const content = createContentCatalog(manifest2, { scenarios: [pack.chapter] });
  const worldRes = createWorldResources();
  const raw = createNewGameScenario(pack.chapter);
  if (!Object.hasOwn(raw, "nativeFactionSlotRaw")) attachSyntheticNativeFactionSource(raw);
  const realGraph = JSON.parse(
    (await import("node:fs")).readFileSync(new URL("../web/road_graph.json", import.meta.url), "utf-8"),
  );
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
  let sc;
  try {
    ({ scenario: sc } = await prepareScenario({
      raw,
      idx: 0,
      content,
      world: worldRes,
      mode: "fresh",
      terrainMemory: { version: 1, spans: [{ address: 0, hex: pack.terrainHex }] },
      // movementMemory null takes the production fresh synthesis path
      // (an explicit undersized span would leave city-cache bytes uncovered).
      movementMemory: null,
    }));
  } finally {
    globalThis.fetch = oldFetch;
  }
  const context = scenarioNativeRoadContext(sc);
  assert.ok(context, "trial binds native context");
  assert.equal(context.terrain.readTile(ex, ey), 0x10, "edited cell is live in the trial");
  // 10 days of city ticks stay failure-free.
  const { aiTick } = await import("../web/src/game/ai.js");
  const { OriginalBattleRng } = await import("../web/src/game/battle/originalrng.js");
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world: worldRes,
    content,
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
    clock: { year: 196, month: 1, day: 1, hour: 1 },
    battleView: null,
    engageTransition: null,
    gamebar: { syncClock() {} },
    hud: { flashEvent() {} },
  };
  for (let day = 0; day < 10; day++) {
    for (let cityIndex = 0; cityIndex < 192; cityIndex++) {
      aiTick(app, { cityIndex, legionBatchStart: 0, hour: 1, runFactionTick: false });
      assert.ok(!app._strategicBattleFailure, `tick failure day ${day} city ${cityIndex}`);
    }
  }
  assert.equal(context.terrain.readTile(ex, ey), 0x10, "edit survives 10 ticked days");
  tlog("trial loop closed: copy -> edit -> save -> validate -> compile -> loader -> 10 days");
} finally {
  server.close();
}
tlog("E-02 loop OK (browser trial boot next)");
