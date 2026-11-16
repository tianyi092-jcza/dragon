// C7-G: city-group disassembly. Unlink only: the selection group entry
// goes away, decorations stay as independent parts, gate port metadata
// stays, and no copy-model, chapter or road record is touched.
import assert from "node:assert/strict";
import test from "node:test";
import { BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { disbandCityGroup } from "../web/src/editor/componenttools.js";
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

function source() {
  const componentDefinitions = {};
  for (const n of [226, 216, 227, 218, 205, 219, 228, 217, 229])
    componentDefinitions[`tile-${n}`] = tileDef(n);
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

function placed(cityId = "c7g") {
  const plan = planCityGroupPlacement(source(), item, { x: 10, y: 10, cityType: 1 });
  let n = 0;
  const materialized = materializeCityGroupPlacement(plan, { cityId, newId: () => `deco-${++n}` });
  const staged = previewMapEdits(source(), [{ op: "city-group-place", materialized }]);
  return staged;
}

test("disband unlinks the group and keeps decorations, ports and records", () => {
  const before = placed();
  const frozen = JSON.stringify(before);
  assert.equal(before.selectionGroups.length, 1);
  const next = disbandCityGroup(before, "c7g");
  assert.equal(JSON.stringify(before), frozen);
  assert.deepEqual(next.selectionGroups, []);
  assert.equal(next.map.decorations.length, 5);
  assert.equal(next.cityGatePorts.length, 4);
  assert.ok(next.map.decorations.every((d) => typeof d.id === "string"));
  // Second disband fails: the group is already gone.
  assert.throws(() => disbandCityGroup(next, "c7g"), /據點成組不存在/);
  assert.equal(next.selectionGroups.length, 0);
});

test("unknown group and bad identity fail closed without writes", () => {
  const before = placed();
  const frozen = JSON.stringify(before);
  assert.throws(() => disbandCityGroup(before, "nope"), /據點成組不存在/);
  assert.throws(() => disbandCityGroup(before, ""), /據點身份缺失/);
  assert.throws(() => disbandCityGroup(before, null), /據點身份缺失/);
  assert.equal(JSON.stringify(before), frozen);
  // Other groups are untouched.
  const multi = { ...before, selectionGroups: [...before.selectionGroups, { id: "g0", members: [] }] };
  const next = disbandCityGroup(multi, "c7g");
  assert.deepEqual(next.selectionGroups.map((group) => group.id), ["g0"]);
});

test("previewMapEdits wires city-group-disband by cityId", () => {
  const before = placed();
  const next = previewMapEdits(before, [{ op: "city-group-disband", cityId: "c7g" }]);
  assert.deepEqual(next.selectionGroups, []);
  assert.equal(next.map.decorations.length, 5);
  assert.throws(() => previewMapEdits(before, [{ op: "city-group-disband", cityId: "nope" }]), /據點成組不存在/);
});
