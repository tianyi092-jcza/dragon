// Reproducible isolated candidate from fixed Web baselines + literal author
// data. No dependency on ignored intermediate sources/current compiled packs.
// Never installs unapproved display data or writes DOS/saves/profiles.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importFixedGameSource } from "../web/src/content/authoring/fixedgameimport.js";
import { liftAtomicMapSource } from "../web/src/content/authoring/atomicmapimport.js";
import { compileGameSource, TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { canonicalDigest } from "../web/src/content/authoring/gamesource.js";
import { renderMinimapPixels, MINIMAP_SIZES, MINIMAP_STYLE_REVISION } from "../web/src/content/authoring/minimap.js";
import { applyWaterDisplayProposal } from "./map_water_display_authoring.mjs";
import { assignMinimapGroups } from "./map_minimap_groups.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const output = resolve(root, ".dragon-analysis/map-migration-2", round), dir = join(output, "package");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const sourceHashes = {};
const seasons = ["spring", "summer", "autumn", "winter"];
const allowed = new Set(["web/content/builtin/world/world.json", "web/content/builtin/world/roads.json", "web/content/builtin/catalog.json",
  "web/data.json", "web/mmap_map.bin", "web/road_cost.bin", "web/road_offset.json", "docs/data/original-map-water-display-proposal.json",
  "docs/data/original-map-minimap-groups.json",
  ...seasons.flatMap((s) => [`web/map_atlas_${s}.png`, `web/map_tiles_${s}.png`]),
  ...["battle_maps.json", "battle_navigation.json", "battle_display.bin", "battle_rules.json", "battle_scripts.json", "battle_talk.json"].map((n) => "web/" + n)]);
function read(path) {
  assert.ok(allowed.has(path), "input outside fixed whitelist");
  const bytes = readFileSync(join(root, path)); sourceHashes[path] = { sha256: sha(bytes), byteLength: bytes.length }; return bytes;
}
function json(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (cause) { throw new Error(`invalid ${label}`, { cause }); }
}
const world = json(read("web/content/builtin/world/world.json"), "fixed city world");
const graph = json(read("web/content/builtin/world/roads.json"), "native graph");
const catalogInput = json(read("web/content/builtin/catalog.json"), "legacy catalog");
const dataBytes = read("web/data.json"), data = json(dataBytes, "aggregate chapters");
const plane = read("web/mmap_map.bin"), cost = read("web/road_cost.bin"), offset = read("web/road_offset.json");
const proposalBytes = read("docs/data/original-map-water-display-proposal.json"), proposal = json(proposalBytes, "author display data");
assert.equal(sha(plane), proposal.sourcePlaneSha256);
assert.equal(sha(read("web/map_atlas_spring.png")), proposal.sourceAtlasSha256);
assert.equal(world.cities.length, 192); assert.equal(catalogInput.chapters.length, 20);
const cities = new Map(world.cities.map((c) => [c.index, c.id]));
const map = { bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
  base: { terrainRef: Array.from(plane), geography: Array(plane.length).fill(0),
    geographyProvenance: "Unclassified import display placeholder; explicit author annotations applied before emission, not a native class" },
  decorations: [], roads: graph.edges.map((edge) => ({ id: `road-${edge.id}`, fromCityId: cities.get(edge.source), toCityId: cities.get(edge.target),
    travelKind: "land", travelKindProvenance: "Unclassified import placeholder; author label required before emission",
    geometry: edge.points.map(({ x, y }) => ({ x, y })),
    nativeBinding: { edgeId: edge.id, weight: edge.weight, flags: edge.points.map((p) => p.flags), bounds: edge.bounds } })),
  placements: world.cities.map((c) => ({ id: `placement-${c.id}`, cityId: c.id, x: c.x, y: c.y, componentRef: null })) };
const fixed = importFixedGameSource({ gameId: catalogInput.id, revision: catalogInput.revision,
  name: "臥龍傳 — 顯式展示資料待驗收", world, map,
  chapters: catalogInput.chapters.map((c) => ({ id: c.id, legacyScenarioIndex: c.legacyScenarioIndex, state: data.scenarios[c.legacyScenarioIndex] })),
  compatibilityAssets: { roadCostHex: cost.toString("hex"), roadOffsetJson: offset.toString("utf8"), sourceRole: "preserved Web auxiliary bytes; not KI search cost" } }, sha);
const source = liftAtomicMapSource(fixed, `MMAP-plane-sha256:${sha(plane)}`);
const chapterDigest = sha(Buffer.from(JSON.stringify({ order: source.chapterOrder, states: source.chapters })));
const { annotations, counts, waterRoads } = applyWaterDisplayProposal(source, plane, proposal, sha(proposalBytes), sha(plane));
const policy = json(read("docs/data/original-map-minimap-groups.json"), "minimap combination policy");
assert.equal(policy.sourcePlaneSha256, sha(plane));
const groups = assignMinimapGroups(source, annotations, policy);
const reviewStatus = proposal.status;
const compiled = compileGameSource(source, sha);
assert.equal(compiled.compatibilityAssetMode, "source-explicit");
assert.deepEqual(Buffer.from(compiled.terrainBytes), plane); assert.deepEqual(compiled.roadGraph, graph);
assert.deepEqual(Buffer.from(compiled.roadCost), cost); assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), offset);
assert.equal(sha(Buffer.from(JSON.stringify({ order: source.chapterOrder, states: source.chapters }))), chapterDigest);
for (const c of catalogInput.chapters) assert.deepEqual(source.chapters[c.id].state, data.scenarios[c.legacyScenarioIndex]);
const toolHashes = {};
for (const path of ["tools/stage_explicit_unified_map_game.mjs", "tools/map_water_display_authoring.mjs", "tools/map_minimap_groups.mjs",
  "web/src/content/authoring/fixedgameimport.js", "web/src/content/authoring/atomicmapimport.js", "web/src/content/authoring/maplayers.js",
  "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/gamesource.js", "web/src/content/authoring/roadedit.js",
  "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/authoring/minimap.js"])
  toolHashes[path] = sha(readFileSync(join(root, path)));
const visuals = {};
for (const s of seasons) for (const kind of ["atlas", "tiles"]) visuals[`map_${kind}_${s}.png`] = read(`web/map_${kind}_${s}.png`);
const related = ["battle_maps.json", "battle_navigation.json", "battle_display.bin", "battle_rules.json", "battle_scripts.json", "battle_talk.json"]
  .map((url) => ({ url, role: "unchanged-global-tactical-dependency", sha256: sha(read(`web/${url}`)) }));
assert.equal(Object.keys(sourceHashes).length, allowed.size);
const revision = `map-2-${canonicalDigest({ sourceDigest: compiled.sourceDigest, sourceHashes, toolHashes, seed: 1,
  minimapStyle: MINIMAP_STYLE_REVISION, encoderVersion: { node: process.version, zlib: process.versions.zlib } }, sha)}`;
const prefix = `content/builtin/compiled/${revision}/`, assets = [];
mkdirSync(output); mkdirSync(dir);
function write(path, value, role) {
  const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  assert.match(path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
  const target = join(dir, path);
  if (path.includes("/")) mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, bytes); assert.equal(sha(readFileSync(target)), sha(bytes));
  assets.push({ path, url: prefix + path, role, byteLength: bytes.length, sha256: sha(bytes) });
}
write("terrain.bin", compiled.terrainBytes, "native-initial-terrain-and-visual-layout");
write("roads.json", JSON.stringify(compiled.roadGraph) + "\n", "native-road-v2");
write("road_cost.bin", compiled.roadCost, "preserved-legacy-grid-NOT-native-weights");
write("road_offset.json", compiled.roadOffsetBytes, "preserved-visual-offsets");
for (const [path, bytes] of Object.entries(visuals)) write(path, bytes, path.includes("atlas") ? "season-tile-atlas" : "season-legacy-visual-fallback");
function chunk(type, bytes) {
  const value = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(value)); return Buffer.concat([length, value, checksum]);
}
function png(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1)), header = Buffer.alloc(13);
  for (let y = 0; y < height; y++) Buffer.from(pixels.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * (width * 3 + 1) + 1);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
  const image = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, 384, 256, size.w, size.h, 1);
  write(`minimap_${name}.png`, png(image.pixels, size.w, size.h), "automatic-minimap-UNAPPROVED-display-proposal");
}
const definition = { id: "mmap-original", revision, width: 384, height: 256, tileSize: 16,
  assets: { terrain: prefix + "terrain.bin", roadGraph: prefix + "roads.json", roadCost: prefix + "road_cost.bin", roadOffset: prefix + "road_offset.json",
    seasonAtlases: Object.fromEntries(seasons.map((s) => [s, prefix + `map_atlas_${s}.png`])),
    seasons: Object.fromEntries(seasons.map((s) => [s, prefix + `map_tiles_${s}.png`])),
    minimap: { base: prefix + "minimap_base.png", large: prefix + "minimap_large.png" } } };
write("world-definition.json", JSON.stringify(definition) + "\n", "fixed-world-definition-new-revision");
const catalog = { ...catalogInput, revision, world: "world-definition.json" };
for (const entry of catalog.chapters) write(entry.file, JSON.stringify(source.chapters[entry.id].state) + "\n", "unchanged-fixed-chapter-template");
write("catalog.json", JSON.stringify(catalog) + "\n", "fixed-chapter-catalog-new-revision");
write("data.json", dataBytes, "unchanged-aggregate-chapter-input");
write("game-source.json", JSON.stringify(source) + "\n", "editable-four-layer-GameSource@1");
assert.equal(assets.length, 38);
const config = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world: definition,
  sourceURL: prefix + "game-source.json", sourceDigest: compiled.sourceDigest, geographyReview: reviewStatus };
writeFileSync(join(output, "builtinresources.generated.js"), `// Isolated explicit display candidate; not approved or installed.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(config)});\n`);
write("manifest.json", JSON.stringify({ schemaVersion: 1, gameId: source.gameId, contentRevision: revision, worldRevision: revision,
  sourceDigest: compiled.sourceDigest, compilerProfile: "shared-game-source-compiler", compatibilityAssetMode: compiled.compatibilityAssetMode,
  geographyReview: reviewStatus, visualReview: "PENDING_STYLE_2", minimapStyleRevision: MINIMAP_STYLE_REVISION, authorDisplayData: { id: proposal.id, sha256: sha(proposalBytes), status: proposal.status }, assets: assets.slice(), related }, null, 2) + "\n", "runtime-asset-manifest");
const histogram = [0, 0, 0, 0]; for (const g of compiled.geography) histogram[g]++;
const report = { caseId: "M-00-02-explicit-unified-stage", result: "PASS-STAGE-ONLY-REVIEW-REQUIRED",
  contractRevision: `GameSource@1/ki-byte-stamp-1/${TRIAL_COMPILER_REVISION}`, sourceHashes, toolHashes,
  toolVersion: { node: process.version, zlib: process.versions.zlib }, fixtureId: revision,
  expectedSource: "fixed readonly Web baselines certified separately in M0; user-approved display categories, pending visual groups/style; not native water classes",
  revision, sourceDigest: compiled.sourceDigest, histogram, regionCounts: counts, annotatedCells: annotations.length,
  minimapGroups: { total: groups.length, visible: groups.filter((g) => g.showOnMinimap).length },
  categoryReview: proposal.categoryReview, visualReview: "PENDING_STYLE_2", minimapStyleRevision: MINIMAP_STYLE_REVISION,
  authoredRoadLabels: { water: waterRoads.size, land: graph.edges.length - waterRoads.size },
  parity: { terrainByteDiff: 0, graphSemanticDiff: 0, auxiliaryByteDiff: 0, unchangedChapters: 20, chapterDigest },
  artifactPaths: ["package", "builtinresources.generated.js"],
  coverageLimits: ["No ignored intermediate/current compiled source input", "Not installed; categories approved, combination boundaries/style not visually approved", "No browser/JSON claimed by generator", "No DOS/profile/save/network writes or rule water-class inference"] };
writeFileSync(join(output, "stage-report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: report.result, revision, histogram, installed: false }) + "\n");
