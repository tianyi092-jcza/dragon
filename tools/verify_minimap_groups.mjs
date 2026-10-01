// Pure display contract, no DOS/profile/network. Does not invent rule goldens.
import assert from "node:assert/strict";
import { composeMapLayers, BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { renderMinimapPixels, MINIMAP_PALETTE } from "../web/src/content/authoring/minimap.js";
import { assignMinimapGroups } from "./map_minimap_groups.mjs";
const placed = { map: {} };
const annotations = [
  { x: 10, y: 10, instanceId: "lake-a", waterClass: "lake", regionId: "N02", layer: "decorations" },
  { x: 20, y: 10, instanceId: "lake-b", waterClass: "lake", regionId: "N02", layer: "decorations" },
  { x: 50, y: 10, instanceId: "river-a", waterClass: "river", regionId: "R", layer: "roads" },
  { x: 51, y: 10, instanceId: "river-b", waterClass: "river", regionId: "R", layer: "decorations" }];
const imported = assignMinimapGroups(placed, annotations, { schemaVersion: 1, mainRiverBands: [], showSea: true, showLakes: true, showOtherRiverGroups: false });
assert.equal(imported.length, 3, "review polygon is not one object: two disconnected lakes plus one connected river piece");
assert.deepEqual(imported.map((g) => g.memberIds.length), [1, 1, 2]);
assert.equal(imported[2].baseCells[0], 3890);
const def = { id: "pair", revision: "1", category: "water", footprint: [[0, 0], [1, 0]], anchor: [0, 0],
  visualRef: "MMAP.MDL:indexed-footprint", ruleRecipeRef: BYTE_STAMP_RECIPE, variants: { original: { tiles: [[0, 0, 32], [1, 0, 33]] } } };
const source = { componentDefinitions: { pair: def }, map: { bounds: { width: 384, height: 256 },
  base: { terrainRef: Array(384 * 256).fill(20), geography: Array(384 * 256).fill(0) },
  decorations: [{ id: "a", definitionRef: "pair", x: 2, y: 2, waterClass: "river" },
    { id: "b", definitionRef: "pair", x: 8, y: 2, waterClass: "lake" }], roads: [], placements: [],
  waterGroups: [{ id: "one-combination", memberIds: ["a"], baseCells: [], showOnMinimap: false },
    { id: "another-combination", memberIds: ["b"], baseCells: [], showOnMinimap: true }] } };
const off = composeMapLayers(source);
for (const x of [2, 3]) { assert.equal(off.geography[2 * 384 + x], 2); assert.equal(off.minimapGeography[2 * 384 + x], 0); }
for (const x of [8, 9]) assert.equal(off.minimapGeography[2 * 384 + x], 3);
source.map.waterGroups[0].showOnMinimap = true;
const on = composeMapLayers(source);
assert.deepEqual(on.terrain, off.terrain); assert.deepEqual(on.geography, off.geography);
source.map.decorations.push({ id: "top", definitionRef: "pair", x: 2, y: 2, waterClass: "lake" });
source.map.waterGroups.push({ id: "top-hidden", memberIds: ["top"], baseCells: [], showOnMinimap: false });
const overlap = composeMapLayers(source);
assert.equal(overlap.geography[770], 3); assert.equal(overlap.minimapGeography[770], 2);
source.map.decorations.push({ id: "field", definitionRef: "pair", x: 2, y: 2 });
assert.equal(composeMapLayers(source).minimapGeography[770], 2, "non-water covers must not erase visible lower water");
source.map.base.geography[3850] = 3;
source.map.waterGroups.push({ id: "road-water-display", memberIds: [], baseCells: [3850], showOnMinimap: false });
assert.equal(composeMapLayers(source).geography[3850], 3); assert.equal(composeMapLayers(source).minimapGeography[3850], 0);
for (const group of [{ id: "bad", memberIds: ["unknown"], baseCells: [], showOnMinimap: false },
  { id: "bad", memberIds: ["a"], baseCells: [], showOnMinimap: false },
  { id: "bad", memberIds: [], baseCells: [0], showOnMinimap: true },
  { id: "bad", memberIds: [], baseCells: [999999], showOnMinimap: true },
  { id: "bad", memberIds: [], baseCells: [], showOnMinimap: "false" }]) {
  const copy = structuredClone(source); copy.map.waterGroups.push(group); assert.throws(() => composeMapLayers(copy), /WATER_GROUP|COMPONENT_VALUE/);
}
const snapshot = JSON.stringify(source), roads = new Uint8Array(384 * 256); roads[770] = 1;
let restored;
try { restored = JSON.parse(snapshot); } catch (cause) { throw new Error("invalid owned source snapshot", { cause }); }
assert.deepEqual(composeMapLayers(restored), composeMapLayers(source), "source JSON preserves combination identities and flags");
const legacy = structuredClone(source); delete legacy.map.waterGroups;
assert.deepEqual(composeMapLayers(legacy).minimapGeography, composeMapLayers(legacy).geography);
const invalid = structuredClone(source); invalid.map.waterGroups = null;
assert.throws(() => composeMapLayers(invalid), /INVALID_WATER_GROUPS/);
const oldRandom = Math.random, oldNow = Date.now;
Math.random = () => { throw new Error("ambient RNG forbidden"); };
Date.now = () => { throw new Error("ambient time forbidden"); };
try {
  for (const [w, h] of [[208, 139], [250, 167]]) {
    const hidden = renderMinimapPixels(off.minimapGeography, roads, 384, 256, w, h, 1);
    assert.ok(hidden.geoMask.includes(3), "hiding water must not remove independent road ink");
    const a = renderMinimapPixels(on.minimapGeography, roads, 384, 256, w, h, 1);
    const b = renderMinimapPixels(on.minimapGeography, roads, 384, 256, w, h, 1);
    const c = renderMinimapPixels(on.minimapGeography, roads, 384, 256, w, h, 2);
    assert.deepEqual(a, b); assert.deepEqual(a.geoMask, c.geoMask); assert.notDeepEqual(a.pixels, c.pixels);
    for (let i = 0; i < a.geoMask.length; i++) if (a.geoMask[i] === 3) assert.deepEqual([...a.pixels.slice(i * 3, i * 3 + 3)], MINIMAP_PALETTE.road);
  }
} finally { Math.random = oldRandom; Date.now = oldNow; }
assert.equal(JSON.stringify(source), snapshot);
process.stdout.write("PASS scoped: independent placed combinations, whole multi-cell stamp, overlap/base/roads/JSON/legacy/RNG/seed and six reject controls\n");
