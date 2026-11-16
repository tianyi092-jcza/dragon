// C7-D: map-side materialization transform. Pure, synthetic plans only.
// Copy-model city rows and chapter coverage are NOT written here.
import assert from "node:assert/strict";
import test from "node:test";
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

function source() {
  return {
    componentDefinitions: {},
    map: {
      bounds: { minX: 0, minY: 0, width: 384, height: 256 },
      decorations: [],
      roads: [],
      placements: [],
    },
  };
}

function newIdFactory() {
  let n = 0;
  return () => `deco-${++n}`;
}

test("materialize splits gate ports from atomic decorations in plan order", () => {
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  const out = materializeCityGroupPlacement(plan, { cityId: "c7test", newId: newIdFactory() });
  assert.equal(out.cityId, "c7test");
  assert.equal(out.itemId, "city-group-common-v1");
  assert.equal(out.cityType, 1);
  assert.deepEqual(out.center, { x: 10, y: 10 });
  // 9 cells minus 4 gates = 5 decorations, in row-major plan order.
  assert.equal(out.decorations.length, 5);
  assert.deepEqual(
    out.decorations.map((d) => [d.x, d.y, d.materialId]),
    [
      [9, 9, "tile-226"],
      [11, 9, "tile-227"],
      [10, 10, "tile-205"],
      [9, 11, "tile-228"],
      [11, 11, "tile-229"],
    ],
  );
  for (const decoration of out.decorations) {
    assert.equal(decoration.variantRef, "original");
    assert.equal(decoration.waterClass, null);
  }
  assert.deepEqual(out.ports, [
    { portId: "c7test:0", cityId: "c7test", gateIndex: 0, x: 10, y: 9 },
    { portId: "c7test:1", cityId: "c7test", gateIndex: 1, x: 9, y: 10 },
    { portId: "c7test:2", cityId: "c7test", gateIndex: 2, x: 11, y: 10 },
    { portId: "c7test:3", cityId: "c7test", gateIndex: 3, x: 10, y: 11 },
  ]);
  assert.deepEqual(out.group, {
    id: "city-group-c7test",
    members: out.decorations.map((d) => ({ layer: "decorations", id: d.instanceId })),
  });
  assert.deepEqual(
    out.decorations.map((d) => d.instanceId),
    ["deco-1", "deco-2", "deco-3", "deco-4", "deco-5"],
  );
  assert.throws(() => out.decorations.push({}), TypeError);
  assert.throws(() => out.ports.push({}), TypeError);
});

test("malformed plan, city or id factory fail closed", () => {
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  assert.throws(() => materializeCityGroupPlacement(null, { cityId: "c", newId: newIdFactory() }), /BAD_PLAN/);
  assert.throws(() => materializeCityGroupPlacement(plan, { cityId: "", newId: newIdFactory() }), /BAD_CITY/);
  assert.throws(() => materializeCityGroupPlacement(plan, { cityId: "c" }), /BAD_IDS/);
  assert.throws(
    () => materializeCityGroupPlacement({ ...plan, gates: [{ x: 99, y: 99 }] }, { cityId: "c", newId: newIdFactory() }),
    /not a plan cell/,
  );
  assert.throws(
    () => materializeCityGroupPlacement({ ...plan, cells: [{ x: 1, y: 1, tile: 256 }] }, { cityId: "c", newId: newIdFactory() }),
    /atomic byte/,
  );
  assert.throws(
    () => materializeCityGroupPlacement(plan, { cityId: "c", newId: () => "" }),
    /BAD_IDS/,
  );
});
