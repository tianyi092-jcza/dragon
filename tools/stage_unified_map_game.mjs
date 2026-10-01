// MAP-MIGRATION-2 controlled isolated stage; never writes product/DOS/profile.
// node tools/stage_unified_map_game.mjs <new-round>
// Existing explicit geography values are a UNAPPROVED display proposal;
// this stage is not final migration or user visual/classification acceptance.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importFixedGameSource } from "../web/src/content/authoring/fixedgameimport.js";
import { liftAtomicMapSource } from "../web/src/content/authoring/atomicmapimport.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { canonicalDigest } from "../web/src/content/authoring/gamesource.js";
import { renderMinimapPixels, MINIMAP_SIZES, MINIMAP_STYLE_REVISION } from "../web/src/content/authoring/minimap.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
if (!/^[a-zA-Z0-9-]+$/.test(round ?? "")) throw new RangeError("new round required");
const output = resolve(root, ".dragon-analysis/map-migration-2", round);
mkdirSync(output);
const dir = join(output, "package");
mkdirSync(dir);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const sourceHashes = {};
function read(path) {
  const bytes = readFileSync(join(root, path));
  sourceHashes[path] = { sha256: sha(bytes), byteLength: bytes.length };
  return bytes;
}
function json(path) {
  try { return JSON.parse(read(path).toString("utf8")); }
  catch (cause) { throw new Error(`invalid fixed stage input ${path}`, { cause }); }
}
const world = json("web/content/builtin/world/world.json");
const graph = json("web/content/builtin/world/roads.json");
const legacyCatalog = json("web/content/builtin/catalog.json");
const dataBytes = read("web/data.json");
let data;
try { data = JSON.parse(dataBytes.toString("utf8")); } catch (cause) { throw new Error("invalid data source", { cause }); }
const plane = read("web/mmap_map.bin");
const oldSource = json(".dragon-analysis/map-migration/unified-a/unified_mapsource.json");
assert.deepEqual(Buffer.from(oldSource.map.base.terrainRef), plane);
const cityId = new Map(world.cities.map((c) => [c.index, c.id]));
const map = { bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
  base: { terrainRef: Array.from(plane), geography: oldSource.map.base.geography,
    geographyProvenance: "UNAPPROVED Web display proposal retained from historical inferred values; NOT original river/lake/sea evidence" },
  decorations: [], roads: graph.edges.map((edge, i) => ({ id: `road-${edge.id}`, fromCityId: cityId.get(edge.source), toCityId: cityId.get(edge.target),
    travelKind: oldSource.map.roads[i].travelKind,
    travelKindProvenance: "historical display candidate; not native weights/flags or a certified original water classifier",
    geometry: edge.points.map(({ x, y }) => ({ x, y })),
    nativeBinding: { edgeId: edge.id, weight: edge.weight, flags: edge.points.map((p) => p.flags), bounds: edge.bounds } })),
  placements: world.cities.map((c) => ({ id: `placement-${c.id}`, cityId: c.id, x: c.x, y: c.y, componentRef: null })) };
const fixed = importFixedGameSource({ gameId: legacyCatalog.id, revision: legacyCatalog.revision,
  name: "臥龍傳 — 統一地圖本地待驗收", world, map,
  chapters: legacyCatalog.chapters.map((c) => ({ id: c.id, legacyScenarioIndex: c.legacyScenarioIndex, state: data.scenarios[c.legacyScenarioIndex] })),
  compatibilityAssets: { roadCostHex: read("web/road_cost.bin").toString("hex"), roadOffsetJson: read("web/road_offset.json").toString("utf8"),
    sourceRole: "preserved Web auxiliary bytes; not KI search cost" } }, sha);
const source = liftAtomicMapSource(fixed, `MMAP-plane-sha256:${sha(plane)}`);
const compiled = compileGameSource(source, sha);
assert.equal(compiled.compatibilityAssetMode, "source-explicit");
assert.deepEqual(Buffer.from(compiled.terrainBytes), plane);
assert.deepEqual(compiled.roadGraph, graph);
assert.deepEqual(Buffer.from(compiled.roadCost), Buffer.from(source.compatibilityAssets.roadCostHex, "hex"));
assert.equal(source.chapterOrder.length, 20);
for (const entry of legacyCatalog.chapters) assert.deepEqual(source.chapters[entry.id].state, data.scenarios[entry.legacyScenarioIndex]);
const toolHashes = {};
for (const path of ["tools/stage_unified_map_game.mjs", "web/src/content/authoring/fixedgameimport.js", "web/src/content/authoring/atomicmapimport.js",
  "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/gamesource.js",
  "web/src/content/authoring/roadedit.js", "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/authoring/minimap.js"])
  toolHashes[path] = sha(readFileSync(join(root, path)));
const visuals = {};
for (const season of ["spring", "summer", "autumn", "winter"]) for (const kind of ["atlas", "tiles"])
  visuals[`map_${kind}_${season}.png`] = read(`web/map_${kind}_${season}.png`);
const related = ["battle_maps.json", "battle_navigation.json", "battle_display.bin", "battle_rules.json", "battle_scripts.json", "battle_talk.json"]
  .map((url) => ({ url, role: "unchanged-global-tactical-dependency", sha256: sha(read(`web/${url}`)) }));
const revision = `map-2-${canonicalDigest({ sourceDigest: compiled.sourceDigest, sourceHashes, toolHashes, seed: 1, minimapStyle: MINIMAP_STYLE_REVISION, encoderVersion: { node: process.version, zlib: process.versions.zlib } }, sha)}`;
const prefix = `content/builtin/compiled/${revision}/`;
const assets = [];
function write(path, bytes, role) {
  if (typeof bytes === "string") bytes = Buffer.from(bytes);
  if (!/^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/.test(path)) throw new RangeError(`unsafe stage asset path ${path}`);
  const target = join(dir, path);
  if (path.includes("/")) mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, bytes);
  assets.push({ path, url: prefix + path, role, byteLength: bytes.length, sha256: sha(bytes) });
}
write("terrain.bin", compiled.terrainBytes, "native-initial-terrain-and-visual-layout");
write("roads.json", JSON.stringify(compiled.roadGraph) + "\n", "native-road-v2");
write("road_cost.bin", compiled.roadCost, "preserved-legacy-grid-NOT-native-weights");
write("road_offset.json", compiled.roadOffsetBytes, "preserved-visual-offsets");
for (const [path, bytes] of Object.entries(visuals)) write(path, bytes, path.includes("atlas") ? "season-tile-atlas" : "season-legacy-visual-fallback");
function chunk(type, bytes) {
  const value = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(value));
  return Buffer.concat([length, value, crc]);
}
function png(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
  const image = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, 384, 256, size.w, size.h, 1);
  write(`minimap_${name}.png`, png(image.pixels, size.w, size.h), "automatic-minimap-UNAPPROVED-display-proposal");
}
const seasons = ["spring", "summer", "autumn", "winter"];
const definition = { id: "mmap-original", revision, width: 384, height: 256, tileSize: 16,
  assets: { terrain: prefix + "terrain.bin", roadGraph: prefix + "roads.json", roadCost: prefix + "road_cost.bin", roadOffset: prefix + "road_offset.json",
    seasonAtlases: Object.fromEntries(seasons.map((s) => [s, prefix + `map_atlas_${s}.png`])),
    seasons: Object.fromEntries(seasons.map((s) => [s, prefix + `map_tiles_${s}.png`])),
    minimap: { base: prefix + "minimap_base.png", large: prefix + "minimap_large.png" } } };
write("world-definition.json", JSON.stringify(definition) + "\n", "fixed-world-definition-new-revision");
const catalog = { ...legacyCatalog, revision, world: "world-definition.json" };
for (const entry of catalog.chapters) write(entry.file, JSON.stringify(source.chapters[entry.id].state) + "\n", "unchanged-fixed-chapter-template");
write("catalog.json", JSON.stringify(catalog) + "\n", "fixed-chapter-catalog-new-revision");
write("data.json", dataBytes, "unchanged-aggregate-chapter-input");
write("game-source.json", JSON.stringify(source) + "\n", "editable-four-layer-GameSource@1");
const config = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world: definition,
  sourceURL: prefix + "game-source.json", sourceDigest: compiled.sourceDigest, geographyReview: "PENDING" };
writeFileSync(join(output, "builtinresources.generated.js"), `// Controlled local candidate; review/receipts are not replaced by this module.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(config)});\n`);
write("manifest.json", JSON.stringify({ schemaVersion: 1, gameId: source.gameId, contentRevision: revision, worldRevision: revision,
  sourceDigest: compiled.sourceDigest, compilerProfile: "shared-game-source-compiler", compatibilityAssetMode: compiled.compatibilityAssetMode,
  geographyReview: "PENDING: explicit original water display annotation not verified", assets: assets.slice(), related }, null, 2) + "\n", "runtime-asset-manifest");
const report = { caseId: "M-02-UNIFIED-STAGE", result: "PASS-STAGE-ONLY", contractRevision: "GameSource@1/ki-byte-stamp-1",
  fixtureId: "fixed-original-world-and-20-chapters", expectedSource: "declared readonly Web baselines; original plane/slots certified separately in M0",
  sourceHashes, toolHashes, nodeVersion: process.version, revision, sourceDigest: compiled.sourceDigest,
  parity: { terrainByteDiff: 0, graphSemanticDiff: 0, auxiliaryByteDiff: 0, unchangedChapters: 20 },
  artifactPaths: [`.dragon-analysis/map-migration-2/${round}/package`, `.dragon-analysis/map-migration-2/${round}/builtinresources.generated.js`],
  coverageLimits: ["NOT installed into current game", "Water labels/travelKind remain unapproved historical display proposal, not raw-rule proof",
    "No browser, DPR, JSON, old-save or user visual acceptance covered", "No original writes, SAVE/profile, deployment or baseline replacement"] };
writeFileSync(join(output, "stage-report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
