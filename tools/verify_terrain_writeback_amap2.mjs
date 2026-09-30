import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-MAP-2: 8A1E center/corner write order + opening-pass gap scope +
// projection/season/JSON/RNG-cache properties.
// - paint8A1E (same body production calls) over planted terrain for city
//   types {0 metropolis, 3 checkpoint, 1 ordinary} x takers {player, other,
//   neutral}: exact dirty set, center formula, corner deltas, DE..F1 gate,
//   skip branch, write-set exactness (snapshot diff == predicted set).
// - 89F0 opening gap: fresh scenario terrain equals planted initial bytes
//   at centers/corners despite owners (no opening 192-city pass runs; the
//   original 89FB..8A07 loop is recorded in the report, not re-derived).
// - Projection (drawTerrainOverlay, stub canvas): dirty cells paint with
//   new-tile source rects, viewport culling, season-atlas swap preserves
//   dirt, unchanged cells skipped.
// - JSON: snapshot/restore roundtrip keeps dirt; restored copy is
//   independent (no shared cache).
// - RNG: paint8A1E body carries no RNG reference (code fact) and the
//   write set is exactly the predicted cells (dynamic fact).
// Node harness, no disk writes, no SAVE.DAT, stdout only.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  captureOriginalCity,
  paint8A1E,
} from "../web/src/game/navigation/originalcitycapture.js";
import { createScenarioTerrainMemory } from "../web/src/game/navigation/scenarioterrainmemory.js";
import { drawTerrainOverlay } from "../web/src/content/authoring/terrainview.js";

const CX = 100;
const CY = 100;
const BASE = 0x20;
// Corner BX deltas per city type (admission §2.3, mirrored from 8A6E..8AE6).
const DELTAS = {
  0: [-0x302, 4, 0x600, -4],
  3: [-0x180, 0x17f, 2, 0x17f],
  1: [-0x181, 2, 0x300, -2],
};
function cornerCells(x, y, type) {
  let addr = y * 384 + x;
  return DELTAS[type].map((d) => {
    addr += d;
    return addr;
  });
}

// Plant cornerValues[4] at the tested type's offsets, DE at the other
// types' offsets (spatially distinct), BASE at skipIndex of the tested type.
// Corner mapping under test: new = DE + ((tile-DE)%10) + (player?10:0).
// Player taker: [DE,DF,E0,E7] -> [E8,E9,EA,F1] (all change).
// Other/neutral taker: [E8,E9,EA,EB] -> [DE,DF,E0,E1] (all change).
// (Without highlight the DE..E7 range maps to itself, so DE planting would
// be a value-identical write; the E8..EB planting makes the write visible.)
function plantTerrain(testType, cornerValues, skipIndex = -1) {
  const bytes = new Uint8Array(384 * 256).fill(BASE);
  bytes[CY * 384 + CX] = 0xcb;
  for (const t of [0, 3, 1]) {
    cornerCells(CX, CY, t).forEach((a, i) => {
      bytes[a] = t === testType && i !== skipIndex ? cornerValues[i] : 0xde;
    });
  }
  if (skipIndex >= 0) bytes[cornerCells(CX, CY, testType)[skipIndex]] = BASE;
  return Buffer.from(bytes).toString("hex");
}

const TEST_CITY = 5;
async function fixture(hex, cityFields) {
  const graph = {
    version: 2,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id === TEST_CITY ? CX : id % 384,
      y: id === TEST_CITY ? CY : 1,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  const cities = graph.nodes.map(({ id, x, y }) => ({
    idx: id,
    x,
    y,
    faction: 1,
    attr: 0x80,
    type: 1,
    prod: 100,
    governor: null,
    strategicBorderCount: 0,
    strategicNeighbours: [255, 255, 255, 255],
  }));
  cities[TEST_CITY] = {
    idx: TEST_CITY,
    x: CX,
    y: CY,
    faction: 1,
    attr: 0x80,
    type: 1,
    prod: 100,
    governor: null,
    strategicBorderCount: 0,
    strategicNeighbours: [255, 255, 255, 255],
    ...cityFields,
  };
  const template = {
    player_faction: 0,
    factions: [0, 1].map((idx) => ({
      idx,
      capital: 100 + idx,
      n_legions: 0,
      n_cities: 5,
      active: true,
      attr: 0x80,
      monarch_idx: 126,
      march_marker_style: 0,
    })),
    generals: [],
    cities,
    legions: [],
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "amap2-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const world = createWorldResources();
  const raw = createNewGameScenario(template);
  raw.nativeFateDisplayFlags = 0;
  attachSyntheticNativeFactionSource(raw);
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: { version: 1, spans: [{ address: 0, hex }] },
    movementMemory: { version: 1, spans: [{ address: 3840, hex: "00".repeat(768) }] },
  };
  const urls = world.definition.assets;
  const allowed = new Set([urls.terrain, urls.roadCost, urls.roadOffset, urls.roadGraph]);
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (String(url) === urls.roadGraph ? graph : {}),
      arrayBuffer: async () => new Uint8Array(384 * 256).buffer,
    };
  };
  try {
    const prepared = await prepareScenario(args);
    return prepared.scenario;
  } finally {
    globalThis.fetch = old;
  }
}

function terrainOf(sc) {
  return scenarioNativeRoadContext(sc).terrain;
}

// No-RNG code fact: the paint body must not reference any RNG source.
{
  const src = readFileSync(
    new URL("../web/src/game/navigation/originalcitycapture.js", import.meta.url),
    "utf-8",
  );
  const body = src.slice(src.indexOf("export function paint8A1E"));
  const end = body.indexOf("\n}\n");
  const paint = body.slice(0, end);
  assert.ok(!/rng|random|nextByte|Math\.random/i.test(paint), "paint8A1E carries no RNG");
  tlog("code fact: paint8A1E body has no RNG reference");
}

test("explicit terrain planes skip the opening pass (planted bytes kept)", async () => {
  const planted = [0xde, 0xde, 0xde, 0xde];
  const sc = await fixture(plantTerrain(1, planted));
  const t = terrainOf(sc);
  // Center/corner keep planted values despite the city being foreign-owned:
  // post-89F0 they would already carry owner variants.
  assert.equal(t.readTile(CX, CY), 0xcb);
  cornerCells(CX, CY, 1).forEach((a, i) => assert.equal(t.readByte(a), planted[i]));
  tlog("gap scoped: fresh terrain == initial plane (89F0 pass capture-path-only)");
});

for (const type of [0, 3, 1]) {
  for (const taker of [0, 1]) {
    // Player: corners [DE,DF,E0,E7]->[E8,E9,EA,F1], center CB->CB (no-op).
    // Other: corners [E8,E9,EA,EB]->[DE,DF,E0,E1], center CB->CC.
    const planted = taker === 0 ? [0xde, 0xdf, 0xe0, 0xe7] : [0xe8, 0xe9, 0xea, 0xeb];
    const hl = taker === 0 ? 10 : 0;
    const expected = planted.map((v) => 0xde + ((v - 0xde) % 10) + hl);
    test(`capture path paints type${type} center+corners for taker ${taker}`, async () => {
      const sc = await fixture(plantTerrain(type, planted), { type });
      const t = terrainOf(sc);
      const before = t.snapshot();
      const result = captureOriginalCity(sc, sc.cities[TEST_CITY], taker, () => {}, undefined);
      assert.equal(result, "captured-4D62");
      const centerAddr = CY * 384 + CX;
      const corners = cornerCells(CX, CY, type);
      const expectedCenter = 0xcb + (taker === 0 ? 0 : 1);
      assert.equal(t.readByte(centerAddr), expectedCenter, "center formula");
      corners.forEach((a, i) => assert.equal(t.readByte(a), expected[i], `corner ${i}`));
      // Write-set exactness: snapshot diff == value-changed cells exactly.
      const after = t.snapshot();
      const dirty = new Set();
      if (expectedCenter !== 0xcb) dirty.add(centerAddr);
      corners.forEach((a, i) => {
        if (expected[i] !== planted[i]) dirty.add(a);
      });
      assert.equal(dirty.size, taker === 0 ? 4 : 5, "player center CB->CB is a value no-op");
      const diff = [];
      const collect = (snap) => {
        const map = new Map();
        for (const s of snap.spans) {
          for (let i = 0; i < s.hex.length / 2; i++) map.set(s.address + i, s.hex.slice(i * 2, i * 2 + 2));
        }
        return map;
      };
      const m0 = collect(before);
      const m1 = collect(after);
      for (const [at, v] of m1) {
        if (m0.get(at) !== v) diff.push(at);
      }
      assert.deepEqual(new Set(diff), dirty, "write set is exactly the changed cells");
      tlog(`type${type} taker${taker}: center=${expectedCenter.toString(16)} corners=${expected.map((v) => v.toString(16)).join(",")} exact`);
    });
  }
}

test("neutral taker via paint8A1E: center +2, corners unhighlighted", async () => {
  const planted = [0xe8, 0xe9, 0xea, 0xeb];
  const sc = await fixture(plantTerrain(1, planted), { type: 1 });
  sc.cities[TEST_CITY].faction = null; // ownerByte -> 0x18
  paint8A1E(sc, sc.cities[TEST_CITY]);
  const t = terrainOf(sc);
  assert.equal(t.readTile(CX, CY), 0xcd, "neutral center +2");
  cornerCells(CX, CY, 1).forEach((a, i) =>
    assert.equal(t.readByte(a), 0xde + ((planted[i] - 0xde) % 10), `neutral corner ${i}`),
  );
  tlog("neutral: center=cd corners=de,df,e0,e1");
});

test("non-DE corner tiles are skipped (8AD1 gate)", async () => {
  const sc = await fixture(plantTerrain(1, [0xde, 0xdf, 0xe0, 0xe7], 2), { type: 1 });
  const result = captureOriginalCity(sc, sc.cities[TEST_CITY], 0, () => {}, undefined);
  assert.equal(result, "captured-4D62");
  const t = terrainOf(sc);
  const corners = cornerCells(CX, CY, 1);
  assert.equal(t.readByte(corners[2]), BASE, "non-DE corner untouched");
  assert.equal(t.readByte(corners[0]), 0xe8);
  tlog("skip branch: BASE corner preserved, DE corners -> e8");
});

test("projection paints dirt, culls clean cells, survives season swap", async () => {
  const planted = [0xe8, 0xe9, 0xea, 0xeb];
  const sc = await fixture(plantTerrain(1, planted), { type: 1 });
  captureOriginalCity(sc, sc.cities[TEST_CITY], 1, () => {}, undefined);
  const t = terrainOf(sc);
  const initialHex = plantTerrain(1, planted);
  const calls = [];
  const ctx = { drawImage: (...args) => calls.push(args) };
  const atlas = (tag) => ({ complete: true, naturalWidth: 256, tag });
  const view = {
    atlas: atlas("spring"),
    terrain: t,
    initialHex,
    sx: (v) => v,
    sy: (v) => v,
    scale: 1,
    viewW: 384 * 16,
    viewH: 256 * 16,
  };
  const painted = drawTerrainOverlay(ctx, view);
  assert.equal(painted, 5, "exactly center+4 corners painted");
  for (const args of calls) {
    const [, sx, sy, sw, sh, dx, dy] = args;
    const tx = Math.round(dx / 16);
    const ty = Math.round(dy / 16);
    const cur = t.readTile(tx, ty);
    assert.equal(sx, (cur % 16) * 16, "source rect matches live tile");
    assert.equal(sy, Math.floor(cur / 16) * 16);
    assert.equal(sw, 16);
    assert.equal(sh, 16);
  }
  // Season swap: same live terrain, different atlas object -> same dirt.
  const calls2 = [];
  const painted2 = drawTerrainOverlay({ drawImage: (...a) => calls2.push(a) }, { ...view, atlas: atlas("winter") });
  assert.equal(painted2, 5, "dirt survives the season swap");
  // Viewport excluding the city paints nothing.
  const painted3 = drawTerrainOverlay({ drawImage: () => assert.fail("cull") }, {
    ...view,
    sx: (v) => v + 10000,
    sy: (v) => v,
  });
  assert.equal(painted3, 0, "off-view dirt culled");
  tlog("projection: 5 dirty painted with live source rects; season-proof; culled off-view");
});

test("JSON snapshot/restore keeps dirt on an independent copy", async () => {
  const sc = await fixture(plantTerrain(1, [0xe8, 0xe9, 0xea, 0xeb]), { type: 1 });
  captureOriginalCity(sc, sc.cities[TEST_CITY], 1, () => {}, undefined);
  const t = terrainOf(sc);
  const snap = t.snapshot();
  const copy = createScenarioTerrainMemory(
    { version: 1, spans: snap.spans, identity: snap.identity, initialTerrain: snap.initialTerrain },
    snap.identity,
    snap.initialTerrain,
    true,
  );
  assert.equal(copy.readTile(CX, CY), 0xcc, "restored center keeps paint");
  copy.writeByte(CY * 384 + CX, 0xcd);
  assert.equal(t.readTile(CX, CY), 0xcc, "live copy unaffected (no shared cache)");
  tlog("JSON roundtrip: dirt restored; copies independent");
});

test("89F0 opening pass paints the fresh synthesized plane (all 192)", async () => {
  // Fresh + synthesized initial plane (real MMAP bytes via the terrain
  // fetch): prepare must run the 1BE6 opening pass through the same 8A1E.
  // Cities alternate owners/types; all y=10 so the y<2 stop cannot fire.
  const mmap = readFileSync(new URL("../web/mmap_map.bin", import.meta.url));
  // Cities alternate owners/types. Spaced 6 cells apart: the sequential
  // shared-plane pass (like the original) lets later cities observe
  // earlier cities' writes, so center/corner footprints must not overlap
  // (real cities are far apart; 1-apart synthetic cities collide).
  const PX = (id) => (id % 64) * 6;
  const PY = (id) => 10 + Math.floor(id / 64) * 6;
  const graph = {
    version: 2,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: PX(id),
      y: PY(id),
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  const types = [0, 3, 1];
  const template = {
    player_faction: 0,
    factions: [0, 1].map((idx) => ({
      idx,
      capital: 100 + idx,
      n_legions: 0,
      n_cities: 5,
      active: true,
      attr: 0x80,
      monarch_idx: 126,
      march_marker_style: 0,
    })),
    generals: [],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: id % 2,
      attr: 0x80,
      type: types[id % 3],
      prod: 100,
      governor: null,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
    })),
    legions: [],
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "amap2-opening",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const world = createWorldResources();
  const raw = createNewGameScenario(template);
  raw.nativeFateDisplayFlags = 0;
  attachSyntheticNativeFactionSource(raw);
  const urls = world.definition.assets;
  const allowed = new Set([urls.terrain, urls.roadCost, urls.roadOffset, urls.roadGraph]);
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    if (String(url) === urls.roadGraph) return { ok: true, json: async () => graph };
    if (String(url) === urls.terrain) {
      return { ok: true, arrayBuffer: async () => mmap.buffer.slice(mmap.byteOffset, mmap.byteOffset + mmap.byteLength) };
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
      world,
      mode: "fresh",
      movementMemory: { version: 1, spans: [{ address: 3840, hex: "00".repeat(768) }] },
    }));
  } finally {
    globalThis.fetch = old;
  }
  const t = scenarioNativeRoadContext(sc).terrain;
  // Expected values from the documented 8A1E rule off the INITIAL bytes.
  const at = (x, y) => mmap[y * 384 + x];
  let checked = 0;
  for (const city of sc.cities) {
    const init = at(city.x, city.y);
    let variant = 1;
    if (city.faction === 0) variant = 0;
    else if (city.faction === null) variant = 2;
    const expectedCenter = (Math.floor((((init - 0xcb) & 255) / 3)) * 3 + 0xcb + variant) & 255;
    assert.equal(t.readTile(city.x, city.y), expectedCenter, `city ${city.idx} center`);
    checked++;
    const hl = city.faction === 0 ? 10 : 0;
    let bx = city.x + 0x300;
    for (const delta of DELTAS[city.type]) {
      bx = (bx + delta) & 65535;
      void bx;
    }
    // Corner expectations via the same delta walk in linear space.
    let addr = city.y * 384 + city.x;
    for (const d of DELTAS[city.type]) {
      addr += d;
      const ax = ((addr % 384) + 384) % 384;
      const ay = Math.floor(addr / 384);
      if (ax < 0 || ax > 383 || ay < 0 || ay > 255) continue;
      const was = mmap[ay * 384 + ax];
      const want = was >= 0xde && was < 0xf2 ? 0xde + ((was - 0xde) % 10) + hl : was;
      assert.equal(t.readByte(ay * 384 + ax), want, `city ${city.idx} corner`);
      checked++;
    }
  }
  tlog(`opening pass: ${checked} center/corner cells follow the 8A1E rule at fresh`);
});
