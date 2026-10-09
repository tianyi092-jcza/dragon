// Pure author contract fixtures, no files/network/profile/DOS or rule goldens.
import assert from "node:assert/strict";
import { composeMapLayers, BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { captureComponent, placeComponent, componentCells, hitDecoration, createDecorationPicker, decorationIdsInRect, fillBase, createWaterGroup, splitWaterGroup, mergeWaterGroups, validateLibraryAdditions, splitDecoration, translateDecorations, reorderDecorations, materialReferences, renameMaterial, removeMaterial } from "../web/src/editor/componenttools.js";
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
const renamed = renameMaterial(placed, "pair", "更名河段"); sameNative(placed, renamed);
validateLibraryAdditions(placed, renamed.componentDefinitions); checks++;
assert.equal(materialReferences(placed, "pair").length, 1);
const masked = structuredClone(placed);
masked.componentDefinitions.pair.geographyMask = [[0, 0]];
masked.map.waterGroups[0].showOnMinimap = false;
masked.map.base.terrainRef[20 * 384 + 20] = null;
masked.map.base.unknownUnderlays[20 * 384 + 20] = { sourceRef: "explicit split unknown", coveringInstanceId: "pair-instance" };
masked.map.decorations.push({ id: "later-cover", x: 20, y: 20, definitionRef: "atom" });
const atomized = splitDecoration(masked, "pair-instance", ["child-a", "child-b"]); sameNative(masked, atomized);
assert.deepEqual(composeMapLayers(masked).minimapGeography, composeMapLayers(atomized).minimapGeography);
assert.deepEqual(atomized.map.waterGroups[0].memberIds, ["child-a"]); assert.equal(atomized.map.waterGroups[0].showOnMinimap, false);
assert.equal(atomized.map.decorations.at(-1).id, "later-cover");
assert.equal(atomized.map.base.terrainRef[20 * 384 + 20], null);
assert.equal(atomized.map.base.unknownUnderlays[20 * 384 + 20].coveringInstanceId, "child-a");
assert.equal(atomized.map.base.unknownUnderlays[20 * 384 + 20].priorCoveringInstanceId, "pair-instance"); checks++;
const translated = translateDecorations(atomized, ["child-a", "child-b"], 4, 3);
assert.deepEqual(translated.map.decorations.filter((d) => d.id.startsWith("child-")).map((d) => [d.x, d.y]), [[24, 23], [25, 23]]);
assert.deepEqual(translated.map.waterGroups, atomized.map.waterGroups); assert.deepEqual(translated.map.base, atomized.map.base);
assert.deepEqual(translated.map.decorations.filter((d) => !d.id.startsWith("child-")), atomized.map.decorations.filter((d) => !d.id.startsWith("child-"))); checks++;
const removed = removeMaterial(atomized, "pair"); sameNative(atomized, removed);
assert.deepEqual(composeMapLayers(atomized).minimapGeography, composeMapLayers(removed).minimapGeography);
validateLibraryAdditions(masked, removed.componentDefinitions, removed.map); checks++;
// Q61: exhaustive nonempty selections over five instances, both directions.
const ordered = structuredClone(source);
ordered.componentDefinitions.land = { ...def, id: "land", visualRef: "MMAP.MDL:tile-16", variants: { original: { tiles: [[0, 0, 16]] } } };
ordered.map.decorations.push({ id: "c", x: 10, y: 10, definitionRef: "atom", waterClass: "lake" },
  { id: "d", x: 10, y: 10, definitionRef: "land" }, { id: "e", x: 14, y: 10, definitionRef: "atom" });
ordered.map.roads.push({ id: "fixed-road", geometry: [{ x: 12, y: 10 }], components: [{ id: "road-stamp", x: 12, y: 10, definitionRef: "land" }] });
ordered.map.placements.push({ id: "city-stamp", x: 13, y: 10, componentRef: "atom" });
ordered.map.waterGroups = [{ id: "hidden-lake", memberIds: ["c"], baseCells: [], showOnMinimap: false }];
ordered.map.base.terrainRef[cell] = null;
ordered.map.base.unknownUnderlays[cell] = { sourceRef: "order fixture unknown", coveringInstanceId: "a" };
const orderSnapshot = JSON.stringify(ordered), originalOrder = ordered.map.decorations.map((d) => d.id);
for (let mask = 1; mask < 32; mask++) for (const direction of [-1, 1]) {
  const ids = originalOrder.filter((_, i) => mask & (1 << i)), next = reorderDecorations(ordered, ids, direction);
  const actual = next.map.decorations.map((d) => d.id), selected = new Set(ids);
  assert.deepEqual(actual.filter((id) => selected.has(id)), ids);
  assert.deepEqual(actual.filter((id) => !selected.has(id)), originalOrder.filter((id) => !selected.has(id)));
  for (const id of ids) { const i = originalOrder.indexOf(id), neighbours = direction === 1 ? originalOrder.slice(i + 1) : originalOrder.slice(0, i);
    assert.equal(actual.indexOf(id), i + (neighbours.some((entry) => !selected.has(entry)) ? direction : 0)); }
  for (const d of next.map.decorations) assert.deepEqual(d, ordered.map.decorations.find((old) => old.id === d.id));
  for (const key of ["base", "roads", "placements", "waterGroups"]) assert.deepEqual(next.map[key], ordered.map[key]);
  assert.deepEqual(next.componentDefinitions, ordered.componentDefinitions);
  if (actual.join() === originalOrder.join()) assert.equal(next, ordered); else assert.notEqual(next, ordered);
  assert.equal(JSON.stringify(ordered), orderSnapshot); checks++;
}
const visibleWater = structuredClone(ordered); visibleWater.map.waterGroups[0].showOnMinimap = true;
const belowRiver = reorderDecorations(reorderDecorations(visibleWater, ["c"], -1), ["c"], -1), beforeOrder = composeMapLayers(visibleWater), afterOrder = composeMapLayers(belowRiver);
assert.equal(beforeOrder.terrain[cell], 16); assert.equal(afterOrder.terrain[cell], 16);
assert.equal(beforeOrder.geography[cell], 3); assert.equal(afterOrder.geography[cell], 2);
assert.equal(beforeOrder.minimapGeography[cell], 3); assert.equal(afterOrder.minimapGeography[cell], 2);
assert.equal(composeMapLayers(ordered).minimapGeography[cell], 2);
assert.deepEqual(composeMapLayers(parse(JSON.stringify(belowRiver))), afterOrder); checks++;
const roadRef = structuredClone(captured); roadRef.map.roads = [{ id: "road-ref", components: [{ id: "road-part", definitionRef: "pair" }] }];
const cityRef = structuredClone(captured); cityRef.map.placements = [{ id: "city-ref", componentRef: "pair" }];
const snapshot = JSON.stringify(placed), negatives = [
  () => reorderDecorations(ordered, [], 1),
  () => reorderDecorations(ordered, ["a", "a"], 1),
  () => reorderDecorations(ordered, ["missing"], 1),
  () => reorderDecorations(ordered, ["road-stamp"], 1),
  () => reorderDecorations(ordered, ["a"], 0),
  () => reorderDecorations(ordered, ["a"], 2),
  () => reorderDecorations(ordered, ["a"], "1"),
  () => reorderDecorations(ordered, null, -1),
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
  () => translateDecorations(placed, ["a", "pair-instance"], 364, 0),
  () => translateDecorations(placed, ["missing"], 1, 0),
  () => translateDecorations(placed, ["a", "a"], 1, 0),
  () => translateDecorations(placed, ["a"], 0.5, 0),
  () => translateDecorations(placed, ["a"], 0, 0),
  () => splitDecoration(placed, "pair-instance", ["a", "new"]),
  () => splitDecoration(placed, "pair-instance", ["new", "new"]),
  () => splitDecoration(placed, "pair-instance", ["new"]),
  () => splitDecoration(placed, "missing", ["new", "two"]),
  () => splitDecoration(placed, "a", ["new"]),
  () => renameMaterial(source, "atom", "不能更名原配方"),
  () => removeMaterial(source, "atom"),
  () => removeMaterial(placed, "pair"),
  () => removeMaterial(roadRef, "pair"),
  () => removeMaterial(cityRef, "pair"),
  () => validateLibraryAdditions(placed, removed.componentDefinitions),
];
for (const operation of negatives) assert.throws(operation); checks += negatives.length;
assert.equal(JSON.stringify(placed), snapshot); assert.equal(JSON.stringify(source), original); assert.equal(JSON.stringify(ordered), orderSnapshot);
function parse(text) { try { return JSON.parse(text); } catch (cause) { throw new TypeError("invalid JSON roundtrip fixture", { cause }); } }
const serialized = parse(JSON.stringify(merged)); sameNative(serialized, merged);
// Display picker is an immutable derived snapshot; all existing mutations need a fresh build.
let pickerChecks = 0;
const sparse = structuredClone(source);
sparse.componentDefinitions.sparse = { ...def, id: "sparse", anchor: [1, 1], footprint: [[0, 0], [2, 0], [2, 2]], variants: { original: { tiles: [[0, 0, 32], [2, 0, 32], [2, 2, 32]] } } };
sparse.map.decorations.push({ id: "sparse-instance", x: 10, y: 10, definitionRef: "sparse" });
const candidates = [source, captured, placed, renamed, masked, atomized, translated, removed, ordered, merged, serialized, sparse];
for (const candidate of candidates) {
  const before = JSON.stringify(candidate), picker = createDecorationPicker(candidate); assert.equal(Object.isFrozen(picker), true);
  for (let y = 8; y < 28; y++) for (let x = 8; x < 32; x++) { assert.equal(picker.pick(x, y), hitDecoration(candidate, x, y)); pickerChecks++; }
  for (const [x, y] of [[-1, -1], [384, 256], [NaN, 10], [10, NaN], ["10", 10], [10, "10"], [10.5, 10]]) { assert.equal(picker.pick(x, y), hitDecoration(candidate, x, y)); pickerChecks++; }
  assert.equal(JSON.stringify(candidate), before);
}
const indexSource = structuredClone(source), oldPicker = createDecorationPicker(indexSource);
indexSource.map.decorations = indexSource.map.decorations.toReversed(); assert.equal(oldPicker.pick(10, 10), 0); assert.equal(createDecorationPicker(indexSource).pick(10, 10), 1); pickerChecks++;
indexSource.map.decorations.length = 0; assert.equal(oldPicker.pick(10, 10), 0); assert.equal(createDecorationPicker(indexSource).pick(10, 10), -1); pickerChecks++;
const odd = structuredClone(source); odd.map.decorations = [{ ...odd.map.decorations[0], x: Infinity, y: 0 }, { ...odd.map.decorations[1], x: -0, y: -0 }];
const oddPicker = createDecorationPicker(odd); for (const [x, y] of [[Infinity, 0], [0, 0], [-0, -0], [NaN, 0]]) { assert.equal(oddPicker.pick(x, y), hitDecoration(odd, x, y)); pickerChecks++; }
let rectangleChecks = 0;
for (const candidate of candidates) {
  const before = JSON.stringify(candidate);
  for (const left of [8, 9, 10, 11, 20, 24]) for (const top of [8, 9, 10, 11, 20, 24]) for (const width of [-1, 0, 3]) for (const height of [-1, 0, 3]) {
    const right = left + width, bottom = top + height;
    const originalIds = candidate.map.decorations.filter(d => componentCells(candidate, d).some(([x, y]) => x >= left && x <= right && y >= top && y <= bottom)).map(d => d.id);
    assert.deepEqual(decorationIdsInRect(candidate, left, right, top, bottom), originalIds); rectangleChecks++;
  }
  assert.equal(JSON.stringify(candidate), before);
}
assert.equal(decorationIdsInRect(sparse, 10, 10, 10, 10).includes("sparse-instance"), false); rectangleChecks++;
assert.deepEqual(decorationIdsInRect(ordered, 10, 10, 10, 10), ordered.map.decorations.filter(d => componentCells(ordered, d).some(([x, y]) => x === 10 && y === 10)).map(d => d.id)); rectangleChecks++;
const noDefinition = structuredClone(source); delete noDefinition.componentDefinitions.atom;
assert.throws(() => decorationIdsInRect(noDefinition, 0, 383, 0, 255), /組件定義不存在/); rectangleChecks++;
process.stdout.write(`PASS scoped component author tools: ${checks} checks, ${negatives.length} precise failure/no-mutation controls; ${pickerChecks} indexed parity checks; ${rectangleChecks} all-instance rectangle parity/refusal checks\n`);
