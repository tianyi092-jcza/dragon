// MAP-MIGRATION-2 M-03/M-01 pure composition tests. No SAVE/profile/network.
// Read whitelist: web/mmap_map.bin, builtin world.json and roads.json.
// Sample bytes are explicit authored MMAP tiles, not a rule formula oracle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileMapSource, diagnoseMapDraft } from "../web/src/content/authoring/mapcompile.js";
import { BYTE_STAMP_RECIPE } from "../web/src/content/authoring/maplayers.js";
import { liftAtomicMapSource } from "../web/src/content/authoring/atomicmapimport.js";
import { renderMinimapPixels } from "../web/src/content/authoring/minimap.js";
function json(path) {
  try { return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")); }
  catch (cause) { throw new Error(`fixture JSON ${path}`, { cause }); }
}
const plane = readFileSync(new URL("../web/mmap_map.bin", import.meta.url));
const world = json("../web/content/builtin/world/world.json");
const graph = json("../web/content/builtin/world/roads.json");
const cityIds = world.cities.map((city) => city.id);
const src = { schemaVersion: 1, componentDefinitions: {}, map: {
  bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
  base: { terrainRef: Array.from(plane), geography: Array(384 * 256).fill(0) },
  decorations: [], roads: graph.edges.map((edge) => ({ id: `road-${edge.id}`,
    fromCityId: cityIds[edge.source], toCityId: cityIds[edge.target], travelKind: "land",
    geometry: edge.points.map(({ x, y }) => ({ x, y })) })),
  placements: world.cities.map((city) => ({ id: `place-${city.id}`, cityId: city.id, x: city.x, y: city.y, componentRef: null })),
} };
const digest = (data) => createHash("sha256").update(data).digest("hex");
const originalDigest = digest(JSON.stringify(src));
let checks = 0;
function check(name, fn) { fn(); checks++; process.stdout.write(`PASS ${name}\n`); }
function definition(tile) {
  return { id: `tile-${tile}`, revision: "original-byte-1", category: "atomic-original", footprint: [[0, 0]], anchor: [0, 0],
    visualRef: `MMAP.MDL:tile-${tile}`, ruleRecipeRef: BYTE_STAMP_RECIPE,
    variants: { original: { tiles: [[0, 0, tile]] } } };
}
function component(game, id, tile, x = 10, y = 10, waterClass) {
  const ref = `tile-${tile}`;
  game.componentDefinitions[ref] = definition(tile);
  const result = { id, definitionRef: ref, x, y };
  if (waterClass !== undefined) result.waterClass = waterClass;
  return result;
}
const cell = 10 * 384 + 10;
const baseline = compileMapSource(src);
check("baseline whole native plane is byte-identical", () => assert.deepEqual(Buffer.from(baseline.terrainBytes), plane));
check("whole map lifts into editable atoms/road/city layers, not a background", () => {
  const atoms = liftAtomicMapSource(src, `MMAP.MAP:${digest(plane)}`);
  assert.equal(atoms.map.decorations.length, 98304 - 5526 - 192);
  assert.ok(atoms.map.base.terrainRef.every((v) => v === null));
  assert.ok(atoms.map.placements.every((p) => p.componentRef != null));
  assert.equal(atoms.map.roads.reduce((n, r) => n + r.components.length, 0), 5526);
  assert.deepEqual(Buffer.from(compileMapSource(atoms).terrainBytes), plane);
  const atom = atoms.map.decorations.find((d) => d.x === 10 && d.y === 10);
  assert.ok(atom);
  atom.definitionRef = "tile-16";
  assert.equal(compileMapSource(atoms).terrainBytes[10 * 384 + 10], 0x10);
  atoms.map.decorations = atoms.map.decorations.filter((d) => d !== atom);
  assert.throws(() => compileMapSource(atoms), /UNKNOWN_UNDERLAY/);
  atoms.map.base.terrainRef[10 * 384 + 10] = 0x14;
  assert.deepEqual(Buffer.from(compileMapSource(atoms).terrainBytes), plane);
});
const unknown = structuredClone(src);
unknown.map.base.terrainRef[cell] = null;
unknown.map.base.unknownUnderlays = { [cell]: { sourceRef: "MMAP.MAP:cell-3850", coveringInstanceId: "imported-atom" } };
unknown.map.decorations.push(component(unknown, "imported-atom", plane[cell]));
check("unknown below explicit original atom retains all bytes", () => assert.deepEqual(Buffer.from(compileMapSource(unknown).terrainBytes), plane));
unknown.map.decorations.length = 0;
check("deletion refuses exposed unknown, not zero/grass", () => assert.throws(() => compileMapSource(unknown), /UNKNOWN_UNDERLAY/));
check("draft exposes exact unknown diagnostic", () => assert.equal(diagnoseMapDraft(unknown)[0].code, "UNKNOWN_UNDERLAY"));
unknown.map.base.terrainRef[cell] = 0x10;
check("explicit author replacement permits deletion", () => assert.equal(compileMapSource(unknown).terrainBytes[cell], 0x10));
const stacked = structuredClone(src);
stacked.map.decorations.push(component(stacked, "lower", 0x10), component(stacked, "upper", 0x14));
check("ordered decoration bytes actually compile", () => assert.equal(compileMapSource(stacked).terrainBytes[cell], 0x14));
stacked.map.decorations = stacked.map.decorations.toReversed();
check("same-layer reorder changes output", () => assert.equal(compileMapSource(stacked).terrainBytes[cell], 0x10));
stacked.map.decorations = stacked.map.decorations.toReversed();
stacked.map.base.terrainRef[cell + 1] = 0x06;
stacked.map.decorations.pop();
check("deletion exposes current lower, preserves later other edits", () => {
  const out = compileMapSource(stacked);
  assert.equal(out.terrainBytes[cell], 0x10);
  assert.equal(out.terrainBytes[cell + 1], 0x06);
});
const waters = structuredClone(src);
waters.map.decorations.push(component(waters, "sea", 0xbf, 10, 10, "sea"),
  component(waters, "river", 0xbf, 10, 10, "river"), component(waters, "lake", 0xbf, 10, 10, "lake"),
  component(waters, "field", 0x10));
check("field obscures visual/native tile, not top water geography", () => {
  const out = compileMapSource(waters);
  assert.equal(out.terrainBytes[cell], 0x10);
  assert.equal(out.geography[cell], 3);
  assert.deepEqual(waters.map.decorations.map((d) => d.waterClass), ["sea", "river", "lake", undefined]);
});
const lake = waters.map.decorations.splice(2, 1)[0];
check("water removal reveals lower river", () => assert.equal(compileMapSource(waters).geography[cell], 2));
waters.map.decorations.unshift(lake);
check("water reorder selects upper sea/river, not static definition", () => assert.equal(compileMapSource(waters).geography[cell], 2));
check("water annotation never rewrites author road type", () => assert.ok(waters.map.roads.every((r) => r.travelKind === "land")));
const masked = structuredClone(src);
masked.componentDefinitions["masked-water"] = { id: "masked-water", revision: "test", category: "synthetic-byte-stamp", ruleRecipeRef: BYTE_STAMP_RECIPE,
  visualRef: "MMAP.MDL:indexed-footprint", footprint: [[0, 0], [1, 0]], anchor: [0, 0], geographyMask: [[0, 0]],
  variants: { original: { tiles: [[0, 0, 0xbf], [1, 0, 0x10]] } } };
masked.map.decorations.push({ id: "masked", definitionRef: "masked-water", x: 10, y: 10, waterClass: "river" });
check("explicit water mask selects subset of multi-tile footprint", () => {
  const out = compileMapSource(masked);
  assert.equal(out.geography[cell], 2);
  assert.equal(out.geography[cell + 1], 0);
  assert.equal(out.terrainBytes[cell + 1], 0x10);
});
masked.componentDefinitions["masked-water"].geographyMask = [[2, 0]];
check("reject geography outside component footprint", () => assert.throws(() => compileMapSource(masked), /INVALID_GEOGRAPHY_MASK/));
check("lake participates in minimap without becoming native rule bytes", () => {
  const geography = new Uint8Array([3]);
  const road = new Uint8Array([0]);
  const out = renderMinimapPixels(geography, road, 1, 1, 1, 1, 1);
  assert.deepEqual(Array.from(out.pixels), [0x40, 0x60, 0x40]);
  assert.equal(geography[0], 3);
});
check("road line remains above water and texture", () => {
  const out = renderMinimapPixels(new Uint8Array([2]), new Uint8Array([1]), 1, 1, 1, 1, 1);
  assert.deepEqual(Array.from(out.pixels), [0x40, 0x60, 0x40]); // user visual feedback: common road/water ink, NOT a native rule
});
const port = graph.edges[0].points[0];
const layered = structuredClone(src);
layered.map.decorations.push(component(layered, "under-road", 0x10, port.x, port.y));
layered.map.roads[0].components = [component(layered, "road-port", plane[port.y * 384 + port.x], port.x, port.y)];
check("road layer overrides lower decoration without lower-terrain ban", () =>
  assert.equal(compileMapSource(layered).terrainBytes[port.y * 384 + port.x], plane[port.y * 384 + port.x]));
const place = layered.map.placements[0];
const center = plane[place.y * 384 + place.x];
layered.map.decorations.push(component(layered, "under-city", 0xbf, place.x, place.y, "sea"));
layered.componentDefinitions[`tile-${center}`] = definition(center);
place.componentRef = `tile-${center}`;
check("city layer overrides native tile but keeps geography separate", () => {
  const out = compileMapSource(layered);
  assert.equal(out.terrainBytes[place.y * 384 + place.x], center);
  assert.equal(out.geography[place.y * 384 + place.x], 1);
});
const hidden = structuredClone(waters);
hidden.workspace = { hiddenLayers: ["base", "decorations"], lockedLayers: ["roads"], camera: [1, 2] };
for (const d of hidden.map.decorations) { d.hidden = true; d.locked = true; }
check("workspace hidden/lock state does not change compilation", () => {
  const a = compileMapSource(waters);
  const b = compileMapSource(hidden);
  assert.deepEqual(b.terrainBytes, a.terrainBytes);
  assert.deepEqual(b.geography, a.geography);
});
check("compiler cannot mutate source/shared original", () => assert.equal(digest(JSON.stringify(src)), originalDigest));
for (const [name, mutation, error] of [
  ["definition identity mismatch", (g) => { g.componentDefinitions["tile-16"].id = "different-id"; }, /INVALID_COMPONENT_IDENTITY/],
  ["unregistered recipe", (g) => { g.componentDefinitions["tile-16"].ruleRecipeRef = "guess-water"; }, /UNSUPPORTED_RULE_BINDING/],
  ["unknown visual resource", (g) => { g.componentDefinitions["tile-16"].visualRef = "custom-unbound.png"; }, /UNSUPPORTED_VISUAL_BINDING/],
  ["fractional placement", (g) => { g.map.decorations[0].x = 1.5; }, /out of bounds/],
  ["unknown water class", (g) => { g.map.decorations[0].waterClass = "blue"; }, /INVALID_WATER_CLASS/],
  ["duplicate instance", (g) => { g.map.decorations.push(structuredClone(g.map.decorations[0])); }, /DUPLICATE_COMPONENT_ID/],
  ["variant footprint mismatch", (g) => { g.componentDefinitions["tile-16"].variants.original.tiles = [[1, 0, 0x10]]; }, /INVALID_COMPONENT_VARIANT/],
  ["missing underlay source", (g) => { g.map.base.terrainRef[cell] = null; }, /unknown needs source/],
]) {
  const bad = structuredClone(stacked);
  mutation(bad);
  check(`reject ${name}`, () => assert.throws(() => compileMapSource(bad), error));
}
const draftRecipe = structuredClone(stacked);
draftRecipe.componentDefinitions["tile-16"].ruleRecipeRef = "unknown-recipe";
check("unsupported recipe is a draft diagnostic, never a runnable substitute", () =>
  assert.ok(diagnoseMapDraft(draftRecipe).some((d) => d.code === "UNSUPPORTED_RULE_BINDING")));
process.stdout.write(JSON.stringify({ caseId: "M-03-LAYERED-COMPILE", checks, result: "PASS",
  sourceHashes: { "web/mmap_map.bin": digest(plane) },
  toolHashes: Object.fromEntries(["verify_layered_map_compile.mjs", "../web/src/content/authoring/mapcompile.js",
    "../web/src/content/authoring/maplayers.js", "../web/src/content/authoring/minimap.js",
    "../web/src/content/authoring/atomicmapimport.js"].map((path) => [path, digest(readFileSync(new URL(path, import.meta.url)))])),
  artifactPaths: [".dragon-analysis/map-migration-2/session-evidence/layered-r3.log"],
  contractRevision: "GameSource@1/ki-byte-stamp-1",
  fixtureId: "fixed-plane-and-authored-atomic-byte-stack", expectedSource: "explicit authored tile bytes / Q57,Q58,Q61,Q62,Q64,Q66",
  coverageLimits: ["Pure authoring composition, no CPU/whole-rule certification", "No imported water annotation oracle",
    "No arbitrary topology/city relocation certification", "Same-engine gameplay and seasonal/browser/JSON verification remains separate"] }, null, 2) + "\n");
