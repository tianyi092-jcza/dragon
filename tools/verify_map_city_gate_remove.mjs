// C7-H: city-gate removal. Port metadata goes away only after the road
// reference precheck; the gate cell gains an atomic wall tile. Roads,
// groups and copy-model rows are untouched (gate deletion never touches
// whole roads, groups or chapters).
import assert from "node:assert/strict";
import test from "node:test";
import { BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { removeCityGate } from "../web/src/editor/componenttools.js";
import { previewMapEdits } from "../web/src/editor/mapcommands.js";

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
  return {
    componentDefinitions: { "tile-9": tileDef(9) },
    cityGatePorts: [
      { portId: "c1:0", cityId: "c1", gateIndex: 0, x: 5, y: 5 },
      { portId: "c1:1", cityId: "c1", gateIndex: 1, x: 6, y: 5 },
    ],
    selectionGroups: [
      { id: "city-group-c1", members: [{ layer: "decorations", id: "deco-1" }] },
    ],
    map: {
      bounds: { minX: 0, minY: 0, width: 384, height: 256 },
      base: {
        terrainRef: Array(384 * 256).fill(20),
        geography: Array(384 * 256).fill(0),
        unknownUnderlays: {},
      },
      decorations: [{ id: "deco-1", definitionRef: "tile-9", variantRef: "original", x: 4, y: 5 }],
      roads: [],
      placements: [],
      waterGroups: [],
    },
  };
}

test("gate removal drops the port and walls the cell, nothing else moves", () => {
  const before = source();
  const frozen = JSON.stringify(before);
  const next = removeCityGate(before, { cityId: "c1", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "wall-1" });
  assert.equal(JSON.stringify(before), frozen);
  assert.deepEqual(next.cityGatePorts, [
    { portId: "c1:1", cityId: "c1", gateIndex: 1, x: 6, y: 5 },
  ]);
  assert.deepEqual(
    next.map.decorations.filter((d) => d.id === "wall-1"),
    [{ id: "wall-1", definitionRef: "tile-9", variantRef: "original", x: 5, y: 5 }],
  );
  assert.deepEqual(next.selectionGroups, before.selectionGroups);
});

test("unknown ports and bad wall tiles refuse without writing", () => {
  const before = source();
  const frozen = JSON.stringify(before);
  for (const edit of [
    { cityId: "c9", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "wall-1" },
    { cityId: "c1", gateIndex: 7, wallMaterialId: "tile-9", wallInstanceId: "wall-1" },
    { cityId: "c1", gateIndex: -1, wallMaterialId: "tile-9", wallInstanceId: "wall-1" },
    { cityId: "", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "wall-1" },
    { cityId: "c1", gateIndex: 0, wallMaterialId: "tile-404", wallInstanceId: "wall-1" },
    { cityId: "c1", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "deco-1" },
  ]) {
    assert.throws(() => removeCityGate(before, edit), RangeError);
  }
  assert.equal(JSON.stringify(before), frozen);
});

test("roads touching the city and occupied gate cells refuse", () => {
  const roaded = source();
  roaded.map.roads.push({ id: "r1", fromCityId: "c1", toCityId: "c2", components: [] });
  assert.throws(
    () => removeCityGate(roaded, { cityId: "c1", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "wall-1" }),
    /解綁/,
  );
  const blocked = source();
  blocked.map.decorations.push({ id: "squat", definitionRef: "tile-9", variantRef: "original", x: 5, y: 5 });
  assert.throws(
    () => removeCityGate(blocked, { cityId: "c1", gateIndex: 0, wallMaterialId: "tile-9", wallInstanceId: "wall-1" }),
    /佔用/,
  );
});

test("city-gate-remove stages through the shared command dispatch", () => {
  const before = source();
  const next = previewMapEdits(before, [
    { op: "city-gate-remove", cityId: "c1", gateIndex: 1, wallMaterialId: "tile-9", wallInstanceId: "wall-2" },
  ]);
  assert.deepEqual(next.cityGatePorts, [
    { portId: "c1:0", cityId: "c1", gateIndex: 0, x: 5, y: 5 },
  ]);
  assert.ok(next.map.decorations.some((d) => d.id === "wall-2" && d.x === 6 && d.y === 5));
});
