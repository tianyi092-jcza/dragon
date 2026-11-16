// C7-B: city-group placement precheck. Pure, synthetic sources only.
import assert from "node:assert/strict";
import test from "node:test";
import { planCityGroupPlacement } from "../web/src/editor/citygroupplacement.js";

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

function source(overrides = {}) {
  return {
    componentDefinitions: {
      hut: { id: "hut", anchor: [0, 0], footprint: [[0, 0], [1, 0]] },
    },
    map: {
      bounds: { minX: 0, minY: 0, width: 384, height: 256 },
      decorations: [],
      roads: [],
      placements: [],
      ...overrides,
    },
  };
}

test("valid placement returns a frozen plan with recipe cells and gates", () => {
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  assert.equal(plan.itemId, "city-group-common-v1");
  assert.deepEqual(plan.center, { x: 10, y: 10 });
  assert.equal(plan.cells.length, 9);
  assert.deepEqual(plan.gates, [
    { x: 10, y: 9 },
    { x: 9, y: 10 },
    { x: 11, y: 10 },
    { x: 10, y: 11 },
  ]);
  assert.throws(() => plan.cells.push({}), TypeError);
  // Source is untouched: precheck never writes.
  assert.deepEqual(source().map.decorations, []);
});

test("out-of-bounds anchor refuses the whole placement", () => {
  assert.throws(
    () => planCityGroupPlacement(source(), item, { x: 0, y: 0, cityType: 2 }),
    /OUT_OF_BOUNDS/,
  );
  assert.throws(
    () => planCityGroupPlacement(source(), item, { x: 383, y: 255, cityType: 4 }),
    /OUT_OF_BOUNDS/,
  );
});

test("occupied cells refuse: decoration footprint, road component, placement", () => {
  const withDecoration = source({
    decorations: [{ id: "d1", definitionRef: "hut", x: 10, y: 10 }],
  });
  assert.throws(
    () => planCityGroupPlacement(withDecoration, item, { x: 10, y: 10, cityType: 1 }),
    /CELL_OCCUPIED/,
  );
  const withRoad = source({
    roads: [{ id: "r1", components: [{ id: "c1", definitionRef: "hut", x: 11, y: 11 }] }],
  });
  assert.throws(
    () => planCityGroupPlacement(withRoad, item, { x: 10, y: 10, cityType: 1 }),
    /CELL_OCCUPIED/,
  );
  const withPlacement = source({ placements: [{ id: "p1", cityId: "c0", x: 9, y: 10 }] });
  assert.throws(
    () => planCityGroupPlacement(withPlacement, item, { x: 10, y: 10, cityType: 1 }),
    /CELL_OCCUPIED/,
  );
});

test("recipe, anchor and cityType gates fail closed", () => {
  assert.throws(() => planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 3 }), /BAD_CITY_TYPE/);
  assert.throws(() => planCityGroupPlacement(source(), item, { x: 10.5, y: 10, cityType: 1 }), /BAD_ANCHOR/);
  assert.throws(() => planCityGroupPlacement(source(), { ...item, anchor: [9, 9] }, { x: 10, y: 10, cityType: 1 }), /BAD_ITEM/);
  assert.throws(() => planCityGroupPlacement(source(), { ...item, cityTypes: [] }, { x: 10, y: 10, cityType: 1 }), /BAD_ITEM/);
  assert.throws(() => planCityGroupPlacement({ map: null }, item, { x: 10, y: 10, cityType: 1 }), /BAD_SOURCE/);
  // Unknown decoration definitions fail instead of being treated as empty.
  assert.throws(
    () => planCityGroupPlacement(source({ decorations: [{ id: "d9", definitionRef: "nope", x: 50, y: 50 }] }), item, { x: 10, y: 10, cityType: 1 }),
    /組件定義不存在/,
  );
});
