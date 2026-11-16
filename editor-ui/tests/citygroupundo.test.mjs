// C7-I: city-group ops ride the shared stage pipeline — one staged op is one
// undo unit, undo recomputes from the snapshot, and leaving without save
// performs zero server writes. Real previewMapEdits, mocked transport only.
import assert from "node:assert/strict";
import test from "node:test";
import { BYTE_STAMP_RECIPE } from "../../web/src/content/authoring/maplayers.js";
import { SEA_BASE_TILE } from "../../web/src/content/authoring/mapground.js";
import { previewMapEdits } from "../../web/src/editor/mapcommands.js";
import {
  planCityGroupPlacement,
  materializeCityGroupPlacement,
} from "../../web/src/editor/citygroupplacement.js";
import { createBaseMapController } from "../src/basemap.js";

const item = {
  itemId: "city-group-common-v1",
  cityTypes: [1, 2, 4],
  anchor: [1, 1],
  rows: [
    [226, 216, 227],
    [218, 205, 219],
    [228, 217, 229],
  ],
  gates: [[1, 0]],
};

const tileDef = (n) => ({
  id: `tile-${n}`,
  revision: "1",
  category: "explicit-fixture",
  footprint: [[0, 0]],
  anchor: [0, 0],
  visualRef: `MMAP.MDL:tile-${n}`,
  ruleRecipeRef: BYTE_STAMP_RECIPE,
  variants: { original: { tiles: [[0, 0, n]] } },
});

function source() {
  const componentDefinitions = {};
  for (const n of [226, 216, 227, 218, 205, 219, 228, 217, 229])
    componentDefinitions[`tile-${n}`] = tileDef(n);
  return {
    componentDefinitions,
    map: {
      bounds: { minX: 0, minY: 0, width: 384, height: 256 },
      base: {
        policy: "sea-ground-1",
        terrainRef: Array(384 * 256).fill(SEA_BASE_TILE),
        geography: Array(384 * 256).fill(1),
        unknownUnderlays: {},
      },
      decorations: [],
      roads: [],
      placements: [],
      waterGroups: [],
    },
  };
}

function fixture() {
  let stored = null, model, painted;
  const calls = [];
  const actor = { user: { id: "admin", role: "admin", mustChangePassword: false }, version: 1 };
  const before = source();
  const controller = createBaseMapController({
    api: async (path, body) => {
      calls.push({ path, body });
      if (path.endsWith("/initialize")) stored ??= { version: 1, digest: "a".repeat(64), template: { content: structuredClone(before) } };
      if (path.endsWith("/save")) stored = { version: stored.version + 1, digest: "b".repeat(64), template: { content: painted } };
      return { snapshot: structuredClone(stored) };
    },
    work: (action) => action(),
    publish: (value) => { model = value; },
    paint: (value) => { painted = value; },
    preview: previewMapEdits,
    confirm: () => true,
  });
  controller.setIdentity(actor);
  return { controller, calls, model: () => model, painted: () => painted };
}

function placeOp(cityId = "c7i") {
  let n = 0;
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  const materialized = materializeCityGroupPlacement(plan, { cityId, newId: () => `deco-${++n}` });
  return { op: "city-group-place", materialized };
}

test("city-group place then disband undoes in two single units back to pristine", async () => {
  const f = fixture(), a = f.controller.actions;
  await a.enter();
  await a.initialize();
  const pristine = JSON.stringify(f.painted());
  a.stage(placeOp());
  assert.equal(f.model().editCount, 1, "place is one undo unit");
  assert.equal(f.painted().selectionGroups.length, 1);
  const decoCount = f.painted().map.decorations.length;
  assert.ok(decoCount > 0);
  a.stage({ op: "city-group-disband", cityId: "c7i" });
  assert.equal(f.model().editCount, 2, "disband is one undo unit");
  assert.equal(f.painted().selectionGroups?.length ?? 0, 0);
  assert.equal(f.painted().map.decorations.length, decoCount, "disband keeps decorations");
  a.undo();
  assert.equal(f.painted().selectionGroups.length, 1, "first undo restores the group");
  assert.equal(f.model().editCount, 1);
  a.undo();
  assert.equal(JSON.stringify(f.painted()), pristine, "second undo returns to pristine");
  assert.equal(f.model().editCount, 0);
  assert.ok(!f.calls.some(call => call.path.endsWith("/save")), "undo performs no server writes");
});

test("leaving with staged city-group edits writes nothing and clears dirty state", async () => {
  const f = fixture(), a = f.controller.actions;
  await a.enter();
  await a.initialize();
  a.stage(placeOp());
  assert.equal(f.model().dirty, true);
  f.controller.dispose();
  assert.ok(!f.calls.some(call => call.path.endsWith("/save")), "cancel performs zero server writes");
  f.controller.render();
  assert.equal(f.model().dirty, false);
});
