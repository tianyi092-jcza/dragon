// Isolated Web DISPLAY author proposal, never a DOS/native water oracle.
// Uses literal curated sprite IDs/regions; no RGB threshold or flood fill.
// Never installs the proposal, writes product assets, DOS, saves or profiles.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { renderMinimapPixels, MINIMAP_SIZES } from "../web/src/content/authoring/minimap.js";
import { applyWaterDisplayProposal } from "./map_water_display_authoring.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.match(BUILTIN_RESOURCES.sourceURL, /^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/game-source\.json$/);
const folder = join(root, "web", BUILTIN_RESOURCES.sourceURL.replace(/game-source\.json$/, ""));
const output = join(root, ".dragon-analysis/map-migration-2", round);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const inputs = {}, artifacts = [];
function read(path) { const bytes = readFileSync(path); inputs[path.slice(root.length)] = sha(bytes); return bytes; }
function parse(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid proposal input JSON", { cause }); } }
const manifest = parse(read(join(folder, "manifest.json")));
assert.equal(manifest.worldRevision, BUILTIN_RESOURCES.world.revision);
function asset(name) {
  assert.ok(["game-source.json", "terrain.bin", "roads.json", "road_cost.bin", "road_offset.json", "map_atlas_spring.png", "minimap_base.png"].includes(name));
  const bytes = read(join(folder, name)), entry = manifest.assets.find((a) => a.path === name);
  assert.ok(entry); assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
  return bytes;
}
const proposalBytes = read(join(root, "docs/data/original-map-water-display-proposal.json"));
const proposal = parse(proposalBytes);
assert.equal(proposal.schemaVersion, 1); assert.equal(proposal.status, "PROPOSED_NOT_APPROVED");
const plane = asset("terrain.bin");
assert.equal(sha(plane), proposal.sourcePlaneSha256);
assert.equal(sha(asset("map_atlas_spring.png")), proposal.sourceAtlasSha256);
const sourceBytes = asset("game-source.json"), source = parse(sourceBytes);
const chapterDigest = sha(Buffer.from(JSON.stringify({ order: source.chapterOrder, states: source.chapters })));
const original = compileGameSource(source, sha);
assert.deepEqual(Buffer.from(original.terrainBytes), plane);
const roads = parse(asset("roads.json")), cost = asset("road_cost.bin"), offset = asset("road_offset.json");
const previousMini = asset("minimap_base.png");
const reference = read(join(root, ".dragon-analysis/map-migration-2/geography-review-r2/initial-map-coordinates.png"));
const { annotations, counts, roadAnnotations, waterRoads, kinds } = applyWaterDisplayProposal(
  source, plane, proposal, sha(proposalBytes), sha(plane));
assert.equal(sha(Buffer.from(JSON.stringify({ order: source.chapterOrder, states: source.chapters }))), chapterDigest);
const compiled = compileGameSource(source, sha);
assert.deepEqual(Buffer.from(compiled.terrainBytes), plane);
assert.deepEqual(compiled.roadGraph, roads);
assert.deepEqual(Buffer.from(compiled.roadCost), cost);
assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), offset);
assert.deepEqual(compiled.roadMask, original.roadMask);
assert.equal(source.chapterOrder.length, 20);
const hist = [0, 0, 0, 0]; for (const g of compiled.geography) hist[g]++;
for (const kind of [1, 2, 3]) assert.ok(hist[kind] > 0);
for (const annotation of annotations) assert.equal(compiled.geography[annotation.y * 384 + annotation.x], kinds[annotation.waterClass]);
// Actual annotated atom: non-water cover keeps the lower water; deleting
// the water atom fails until the author explicitly supplies replacement.
const lake = annotations.find((a) => a.layer === "decorations" && a.regionId === "L-southwest");
assert.ok(lake);
const index = source.map.decorations.findIndex((d) => d.id === lake.instanceId), cell = lake.y * 384 + lake.x;
const atom = source.map.decorations[index];
source.map.decorations.push({ id: "proposal-field-cover", x: lake.x, y: lake.y, definitionRef: "tile-20", variantRef: "original" });
const covered = compileGameSource(source, sha);
assert.equal(covered.terrainBytes[cell], 20); assert.equal(covered.geography[cell], 3);
source.map.decorations.pop(); source.map.decorations.splice(index, 1);
assert.throws(() => compileGameSource(source, sha), /UNKNOWN_UNDERLAY/);
source.map.base.terrainRef[cell] = 20;
const replaced = compileGameSource(source, sha);
assert.equal(replaced.geography[cell], 0); assert.equal(replaced.terrainBytes[cell], 20);
source.map.base.terrainRef[cell] = null; source.map.decorations.splice(index, 0, atom);
assert.equal(compileGameSource(source, sha).sourceDigest, compiled.sourceDigest);
mkdirSync(output);
function write(name, bytes) {
  assert.match(name, /^[A-Za-z0-9_-]+\.(?:json|bin|png|svg)$/);
  writeFileSync(join(output, name), bytes);
  const stored = readFileSync(join(output, name));
  artifacts.push({ path: name, byteLength: stored.length, sha256: sha(stored) });
}
function chunk(type, bytes) {
  const value = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(value));
  return Buffer.concat([length, value, checksum]);
}
function png(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) Buffer.from(pixels.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * (width * 3 + 1) + 1);
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
write("candidate-source.json", JSON.stringify(source) + "\n");
write("annotations.json", JSON.stringify({ proposal, annotations, counts, roadAnnotations }, null, 2) + "\n");
write("geography.bin", compiled.geography);
write("terrain.bin", compiled.terrainBytes);
write("roads.json", JSON.stringify(compiled.roadGraph) + "\n");
write("road_cost.bin", compiled.roadCost); write("road_offset.json", compiled.roadOffsetBytes);
const palette = [[222, 205, 164], [40, 95, 195], [20, 170, 185], [175, 80, 220]];
const rgb = Uint8Array.from([...compiled.geography].flatMap((g) => palette[g]));
write("classes.png", png(rgb, 384, 256));
const minis = {};
const oldRandom = Math.random;
Math.random = () => { throw new Error("display generation must not consume ambient RNG"); };
try {
  for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
    const image = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, 384, 256, size.w, size.h, 1);
    minis[name] = png(image.pixels, size.w, size.h); write(`minimap_${name}.png`, minis[name]);
  }
} finally { Math.random = oldRandom; }
const dataUri = (bytes) => `data:image/png;base64,${bytes.toString("base64")}`;
const polygons = proposal.regions.map((r) => {
  const color = r.waterClass === "sea" ? "#285fc3" : "#af50dc";
  const points = r.polygon.map(([x, y]) => `${x * 4},${y * 4 + 32}`).join(" ");
  const x = r.polygon.reduce((n, p) => n + p[0], 0) / r.polygon.length * 4;
  const y = r.polygon.reduce((n, p) => n + p[1], 0) / r.polygon.length * 4 + 32;
  const short = r.id.replace("L-north-", "N").replace("L-east-", "E").replace("L-southwest", "SW").replace("L-southeast", "SE").replace("S-east", "S1");
  return `<polygon points="${points}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2"/><rect x="${x - 4}" y="${y - 14}" width="32" height="18" fill="white"/><text x="${x}" y="${y}" fill="black" font-family="sans-serif" font-size="12">${short}</text>`;
}).join("");
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const legend = proposal.regions.map((r, i) => `<text x="${i % 2 * 760 + 8}" y="${48 + Math.floor(i / 2) * 44}" font-size="17" font-family="sans-serif">${escape(r.id)}: ${escape(r.label)} (${counts[r.id]} cells)</text>`).join("");
write("region-legend.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="400"><rect width="100%" height="100%" fill="white"/><text x="8" y="22">Web DISPLAY PROPOSAL ONLY: S1=sea / SW, SE, N01..N06, E01..E05=lake candidates; remaining water=river.</text>${legend}<text x="8" y="380">Review the bounds and per-cell annotations; not original DOS water types, not approved or installed.</text></svg>`);
write("region-review.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1100"><rect width="100%" height="100%" fill="white"/><image href="${dataUri(reference)}" width="1536" height="1056"/>${polygons}<text x="8" y="1080" font-size="18">PROPOSAL ONLY: explicit Web display regions, NOT DOS water types; blue=sea, purple=lake, remaining water=river. REVIEW REQUIRED.</text></svg>`);
const roadPaths = source.map.roads.map((r) => {
  const points = r.geometry.map((p) => `${p.x * 4 + 2},${p.y * 4 + 34}`).join(" ");
  const color = r.travelKind === "water" ? "#00ffff" : "#e06010";
  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"><title>${r.id}: ${r.travelKind} DISPLAY PROPOSAL</title></polyline>`;
}).join("");
write("road-types.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1100"><rect width="100%" height="100%" fill="white"/><image href="${dataUri(reference)}" width="1536" height="1056"/>${roadPaths}<text x="8" y="1080" font-size="18">PROPOSED author road labels: 35 cyan water / 219 orange land incl bridges. Native flags/cost/geometry unchanged; REVIEW REQUIRED.</text></svg>`);
write("minimap-comparison.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="360"><rect width="100%" height="100%" fill="white"/><text x="8" y="22">Previous unapproved 0.5 / Explicit authored proposal / Class audit: blue sea, cyan river, purple lake</text><image href="${dataUri(previousMini)}" x="8" y="40" width="416" height="278"/><image href="${dataUri(minis.base)}" x="440" y="40" width="416" height="278"/><image href="${dataUri(png(rgb, 384, 256))}" x="880" y="40" width="416" height="278"/></svg>`);
assert.equal(sha(readFileSync(join(folder, "game-source.json"))), sha(sourceBytes));
const toolHashes = {};
for (const name of ["tools/propose_map_water_annotations.mjs", "tools/map_water_display_authoring.mjs", "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js",
  "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/minimap.js", "web/src/content/builtinresources.generated.js"])
  toolHashes[name] = sha(readFileSync(join(root, name)));
writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-00-01-explicit-water-display-proposal", contractRevision: "GameSource@1/ki-byte-stamp-1",
  sourceHashes: inputs, toolHashes, toolVersion: process.version, fixtureId: BUILTIN_RESOURCES.world.revision,
  expectedSource: "literal Web author DISPLAY proposal, not native classification", result: "PASS-SCOPED-REVIEW-REQUIRED", sourceDigest: compiled.sourceDigest,
  histogram: hist, regionCounts: counts, annotatedCells: annotations.length,
  authoredRoadLabels: { water: waterRoads.size, land: source.map.roads.length - waterRoads.size, changedDisplayLabels: roadAnnotations.filter((r) => r.originalKind !== r.proposedKind).length },
  nativeParity: { terrainBytes: 0, graphSemantics: 0, legacyHelperBytes: 0, roadMask: 0, chapters: "all 20 unchanged", chapterDigest },
  annotatedAtomChecks: { regionId: lake.regionId, cell, fieldCoverKeepsLake: true, deletionUnknownBlocked: true, explicitLandReplacementRemovesLake: true },
  artifactPaths: artifacts, coverageLimits: ["Not installed or approved; current product package untouched", "Whole-cell shoreline water display approximation and authored river/sea/lake boundaries require review",
    "No original names or hidden rule underlays inferred", "Road travelKind now literal author candidate IDs; native graph fields stay unchanged; category review still required", "No browser/20-chapter new-identity assembly claimed here"] }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: "PASS-SCOPED-REVIEW-REQUIRED", histogram: hist, annotatedCells: annotations.length, sourceDigest: compiled.sourceDigest, installed: false }) + "\n");
