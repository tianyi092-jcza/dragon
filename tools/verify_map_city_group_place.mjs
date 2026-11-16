// C7-E: city-group placement staging. Map side only: decorations, gate
// port metadata and the selection group land in the source; copy-model
// city rows, chapter coverage and battleMapId bindings are NOT written.
import assert from "node:assert/strict";
import test from "node:test";
import { BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { placeCityGroup } from "../web/src/editor/componenttools.js";
import { previewMapEdits } from "../web/src/editor/mapcommands.js";
import {
  planCityGroupPlacement,
  materializeCityGroupPlacement,
} from "../web/src/editor/citygroupplacement.js";

const item = {
  itemId: "city-group-common-v1",
  cityTypes: [1, 2, 4],
  anchor: [1, 1],
  rows: [
    [226, 216, 227],
    [218, 205, 219],
    [228, 217, 229],
  ],
  gates: [[1, 0], [0, 1], [2, 1], [1, 2]],
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

function source(extraDefinitions = {}) {
  const tiles = [226, 216, 227, 218, 205, 219, 228, 217, 229];
  const componentDefinitions = {};
  for (const n of tiles) componentDefinitions[`tile-${n}`] = tileDef(n);
  Object.assign(componentDefinitions, extraDefinitions);
  return {
    componentDefinitions,
    map: {
      bounds: { minX: 0, minY: 0, width: 384, height: 256 },
      base: {
        terrainRef: Array(384 * 256).fill(20),
        geography: Array(384 * 256).fill(0),
        unknownUnderlays: {},
      },
      decorations: [],
      roads: [],
      placements: [],
      waterGroups: [],
    },
  };
}

function materialized(cityId = "c7e") {
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  let n = 0;
  return materializeCityGroupPlacement(plan, { cityId, newId: () => `deco-${++n}` });
}

test("place stages decorations, gate ports and the group without touching the source", () => {
  const before = source();
  const frozen = JSON.stringify(before);
  const out = materialized();
  const next = placeCityGroup(before, out);
  assert.equal(JSON.stringify(before), frozen);
  assert.equal(next.map.decorations.length, 5);
  assert.deepEqual(
    next.map.decorations.map((d) => [d.id, d.definitionRef, d.x, d.y]),
    [
      ["deco-1", "tile-226", 9, 9],
      ["deco-2", "tile-227", 11, 9],
      ["deco-3", "tile-205", 10, 10],
      ["deco-4", "tile-228", 9, 11],
      ["deco-5", "tile-229", 11, 11],
    ],
  );
  assert.deepEqual(next.cityGatePorts, [
    { portId: "c7e:0", cityId: "c7e", gateIndex: 0, x: 10, y: 9 },
    { portId: "c7e:1", cityId: "c7e", gateIndex: 1, x: 9, y: 10 },
    { portId: "c7e:2", cityId: "c7e", gateIndex: 2, x: 11, y: 10 },
    { portId: "c7e:3", cityId: "c7e", gateIndex: 3, x: 10, y: 11 },
  ]);
  assert.deepEqual(next.selectionGroups, [
    {
      id: "city-group-c7e",
      members: ["deco-1", "deco-2", "deco-3", "deco-4", "deco-5"].map((id) => ({
        layer: "decorations",
        id,
      })),
    },
  ]);
});

test("previewMapEdits keeps staged groups alongside existing ones", () => {
  const before = source();
  before.selectionGroups = [{ id: "g0", members: [] }];
  const next = previewMapEdits(before, [{ op: "city-group-place", materialized: materialized() }]);
  assert.deepEqual(
    next.selectionGroups.map((group) => group.id),
    ["g0", "city-group-c7e"],
  );
  assert.equal(next.selectionGroups[0].members.length, 0);
});

test("placement is all-or-nothing with fail-closed identity and definition gates", () => {
  const out = materialized();
  const once = placeCityGroup(source(), out);
  const frozen = JSON.stringify(once);
  // Second placement reuses instance, group and port identities.
  assert.throws(() => placeCityGroup(once, out), /重複或缺失|重複/);
  assert.equal(JSON.stringify(once), frozen);
  // Missing atomic tile definition fails before any write.
  const missing = source();
  delete missing.componentDefinitions["tile-226"];
  assert.throws(() => placeCityGroup(missing, out), /不存在或非原子單格/);
  assert.equal(missing.map.decorations.length, 0);
  assert.equal(missing.cityGatePorts, undefined);
  // Tampered port identity fails before any write.
  const tampered = structuredClone(out);
  tampered.ports[0] = { ...tampered.ports[0], portId: "c7e:9" };
  const target = source();
  assert.throws(() => placeCityGroup(target, tampered), /門端口身份不符/);
  assert.equal(target.map.decorations.length, 0);
});
