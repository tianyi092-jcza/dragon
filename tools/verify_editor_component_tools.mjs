// Pure author contract fixtures, no files/network/profile/DOS or rule goldens.
import assert from "node:assert/strict";
import { composeMapLayers, BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { captureComponent, placeComponent, componentCells, hitDecoration, fillBase, createWaterGroup, splitWaterGroup, mergeWaterGroups, validateLibraryAdditions } from "../web/src/editor/componenttools.js";
const def = { id: "atom", revision: "1", category: "explicit-fixture", footprint: [[0, 0]], anchor: [0, 0],
  visualRef: "MMAP.MDL:tile-32", ruleRecipeRef: BYTE_STAMP_RECIPE, variants: { original: { tiles: [[0, 0, 32]] } } };
const source = { localModel: { draftRevision: "1" }, componentDefinitions: { atom: def }, map: {
  bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
  base: { terrainRef: Array(384 * 256).fill(20), geography: Array(384 * 256).fill(0), unknownUnderlays: {} },
  decorations: [{ id: "a", x: 10, y: 10, definitionRef: "atom", waterClass: "river" }, { id: "b", x: 11, y: 10, definitionRef: "atom", waterClass: "river" }], roads: [], placements: [], waterGroups: [] } };
const original = JSON.stringify(source); let checks = 0;
function sameNative(a, b) { const x = composeMapLayers(a), y = composeMapLayers(b); assert.deepEqual(x.terrain, y.terrain); assert.deepEqual(x.geography, y.geography); checks++; }
const captured = captureComponent(source, ["a", "b"], "pair", "兩格河段");
assert.equal(captured.componentDefinitions.pair.footprint.length, 2); sameNative(source, captured);
validateLibraryAdditions(source, captured.componentDefinitions); checks++;
const placed = placeComponent(captured, "pair", 20, 20, "pair-instance", "river");
assert.deepEqual(componentCells(placed, placed.map.decorations.at(-1)), [[20, 20], [21, 20]]);
assert.equal(hitDecoration(placed, 21, 20), 2); assert.equal(placed.map.waterGroups.at(-1).showOnMinimap, true); checks++;
const joined = createWaterGroup(captured, ["a", "b"], [], "whole", "完整河段", false); sameNative(captured, joined);
const split = splitWaterGroup(joined, "whole", ["a"], [], "part", "拆出部分");
assert.equal(split.map.waterGroups.length, 2); assert.ok(split.map.waterGroups.every((g) => !g.showOnMinimap)); sameNative(joined, split);
const merged = mergeWaterGroups(split, ["whole", "part"], "merged", "合併河段", true); sameNative(split, merged);
assert.equal(merged.map.waterGroups.length, 1); assert.deepEqual(new Set(merged.map.waterGroups[0].memberIds), new Set(["a", "b"]));
const unknown = structuredClone(source), cell = 10 * 384 + 10;
unknown.map.base.terrainRef[cell] = null; unknown.map.base.unknownUnderlays[cell] = { sourceRef: "explicit fixture unknown", coveringInstanceId: "a" };
const covered = composeMapLayers(unknown); unknown.map.decorations.shift();
assert.throws(() => composeMapLayers(unknown), /UNKNOWN_UNDERLAY/);
const filled = fillBase(unknown, [cell], 16, 0);
assert.equal(composeMapLayers(filled).terrain[cell], 16); assert.equal(covered.terrain[cell], 32);
assert.equal(filled.map.base.terrainRef[cell + 1], 20); assert.equal(filled.map.base.unknownUnderlays[cell], undefined); checks++;
const baseWater = fillBase(filled, [cell], 16, 3), baseGroup = createWaterGroup(baseWater, [], [cell], "base-lake", "明確基礎水格組合", false);
sameNative(baseWater, baseGroup); assert.equal(composeMapLayers(baseGroup).minimapGeography[cell], 0);
const mixed = structuredClone(source); mixed.map.decorations[1].waterClass = "sea";
const snapshot = JSON.stringify(placed), negatives = [
  () => captureComponent(mixed, ["a", "b"], "bad", "混合類別不可猜"),
  () => captureComponent(placed, ["a", "a"], "bad", "重复"),
  () => captureComponent(placed, ["unknown"], "bad", "錯引用"),
  () => placeComponent(placed, "pair", 383, 20, "bad", "river"),
  () => splitWaterGroup(joined, "whole", ["a", "b"], [], "bad", "空餘組"),
  () => mergeWaterGroups(split, ["whole", "part"], "bad", "缺明確顯示狀態"),
  () => createWaterGroup(placed, ["missing"], [], "bad", "錯引用"),
  () => fillBase(placed, [cell, cell], 16, 0),
  () => fillBase(placed, [999999], 16, 0),
  () => validateLibraryAdditions(source, { ...source.componentDefinitions, atom: { ...def, revision: "overwrite" } }),
  () => validateLibraryAdditions(source, { ...source.componentDefinitions, evil: { ...captured.componentDefinitions.pair, id: "evil", ruleRecipeRef: "guessed-recipe" } }),
  () => validateLibraryAdditions(source, { ...source.componentDefinitions, evil: { ...captured.componentDefinitions.pair, id: "evil", variants: { original: { tiles: [[0, 0, 32]] } } } }),
];
for (const operation of negatives) assert.throws(operation); checks += negatives.length;
assert.equal(JSON.stringify(placed), snapshot); assert.equal(JSON.stringify(source), original);
function parse(text) { try { return JSON.parse(text); } catch (cause) { throw new TypeError("invalid JSON roundtrip fixture", { cause }); } }
const serialized = parse(JSON.stringify(merged)); sameNative(serialized, merged);
process.stdout.write(`PASS scoped component author tools: ${checks} checks, ${negatives.length} precise failure/no-mutation controls\n`);
