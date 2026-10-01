// MAP-MIGRATION-2 M-00. Fixed read whitelist, no SAVE/profile/network.
// Run: node tools/audit_map_migration_baseline.mjs <new round name>
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
if (!/^[a-zA-Z0-9-]+$/.test(round ?? "")) throw new Error("new round name required");
const output = resolve(root, ".dragon-analysis/map-migration-2", round);
// mkdir without recursive prevents accidental replacement of a sealed round.
mkdirSync(resolve(root, ".dragon-analysis/map-migration-2"), { recursive: true });
mkdirSync(output);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const sourceHashes = {};
function read(path) {
  const data = readFileSync(resolve(root, path));
  sourceHashes[path] = { byteLength: data.length, sha256: sha(data) };
  return data;
}
function json(path) {
  try { return JSON.parse(read(path).toString("utf8")); }
  catch (cause) { throw new Error(`invalid JSON ${path}`, { cause }); }
}
// Decode only duplicate-byte MAP RLE, as in the audited decode_mmap.py
// (F5E7..F6D9); MDL is raw, not passed through this function.
function unpackMap(data) {
  const out = [];
  let i = 4;
  let previous = data[i++];
  out.push(previous);
  while (i < data.length) {
    const value = data[i++];
    out.push(value);
    if (value !== previous) { previous = value; continue; }
    assert.ok(i < data.length, "truncated count");
    const count = data[i++];
    for (let j = 0; j < count; j++) out.push(value);
    if (i >= data.length) break;
    previous = data[i++];
    out.push(previous);
  }
  assert.equal(out.length, data.readUInt32LE(0));
  return Buffer.from(out);
}
const exe = read("../Dragon/KI.EXE");
const packed = read("../Dragon/MMAP.MAP");
const mdl = read("../Dragon/MMAP.MDL");
const plane = read("web/mmap_map.bin");
assert.equal(mdl.length, 256 * 128);
assert.deepEqual(unpackMap(packed), plane);
assert.equal(plane.length, 384 * 256);
const layout = json("web/content/builtin/world/layout.json");
assert.deepEqual(Buffer.from(layout.flat()), plane);
const world = json("web/content/builtin/world/world.json");
const graph = json("web/content/builtin/world/roads.json");
const runtimeGraph = json("web/road_graph.json");
const legacyCost = read("web/road_cost.bin");
assert.equal(legacyCost.length, plane.length);
assert.deepEqual(read("web/content/builtin/world/road-cost.bin"), legacyCost);
const legacyOffset = json("web/road_offset.json");
const composedMaskCost = new Uint8Array(plane.length);
for (const edge of graph.edges) for (const point of edge.points) composedMaskCost[point.y * 384 + point.x] = 1;
for (const node of graph.nodes) composedMaskCost[node.y * 384 + node.x] = 1;
const legacyDiff = [];
for (let cell = 0; cell < plane.length; cell++) if (composedMaskCost[cell] !== legacyCost[cell]) legacyDiff.push(cell);
const legacyHelpers = { sourceRole: "existing Web legacy-grid/visual compatibility, NOT KI native search weights",
  graphMaskCostDiff: legacyDiff.length, examples: legacyDiff.slice(0, 24).map((cell) => ({ x: cell % 384, y: Math.floor(cell / 384),
    originalCompatibilityByte: legacyCost[cell], graphMaskByte: composedMaskCost[cell], tile: plane[cell] })),
  roadOffsetEntries: Object.keys(legacyOffset).length,
  ruleConclusion: "NO new cost formula certified; no-edit migration must preserve the actual compatibility bytes" };
assert.deepEqual(graph, runtimeGraph);
assert.equal(graph.nodes.length, 192);
assert.equal(graph.edges.length, 254);
assert.equal(graph.edges.reduce((n, edge) => n + edge.points.length, 0), 5526);
assert.equal(world.cities.length, 192);
for (const city of world.cities) {
  const node = graph.nodes[city.index];
  assert.equal(city.x, node.x);
  assert.equal(city.y, node.y);
  assert.ok(plane[city.y * 384 + city.x] >= 0xcb && plane[city.y * 384 + city.x] <= 0xd3);
}
const ranges = [[0xe48a, 0xe4ce], [0xe4ce, 0xe50c], [0xe717, 0xe81c],
  [0xe81c, 0xe993], [0x89f0, 0x8aea], [0x4b63, 0x4c72], [0x982f, 0x985a],
  [0x27a2, 0x27f6], [0x1af8, 0x1b25], [0x88cc, 0x895d]];
const windows = ranges.map(([start, end]) => {
  const bytes = exe.subarray(start + 0x200, end + 0x200);
  return { start: start.toString(16), end: end.toString(16), fileOffset: start + 0x200,
    sha256: sha(bytes), hex: bytes.toString("hex") };
});
const rawFieldTable = Array.from({ length: 14 }, (_, i) =>
  Array.from(exe.subarray(0x982f + 0x200 + i * 3, 0x982f + 0x200 + i * 3 + 3)));
const counts = Array.from({ length: 256 }, () => 0);
for (const tile of plane) counts[tile]++;
const tileInventory = counts.map((cells, tile) => ({ tile, cells,
  mdlOffset: tile * 128, mdlSha256: sha(mdl.subarray(tile * 128, (tile + 1) * 128)),
  fieldRangeEntries: rawFieldTable.filter(([low, high]) => tile >= low && tile <= high),
  nodeScan: tile >= 0xcb && tile <= 0xd3,
  wiringRange: tile >= 0xb8 && tile <= 0xdd,
  geography: "UNKNOWN: explicit Web display annotation required, not inferred from field class",
  hiddenUnderlay: "UNKNOWN: composed MDL pixels do not encode stacking history" }));
const chapters = [];
for (const folder of ["上", "中", "下", "后", "原版"]) {
  const data = read(`../${folder}/SINARIO.DAT`);
  for (let chapter = 0; chapter < 4; chapter++) {
    const cities = [];
    for (let slot = 0; slot < 192; slot++) {
      const offset = chapter * 0x56c0 + 0x8c0 + slot * 32;
      const record = data.subarray(offset, offset + 32);
      assert.equal(record.length, 32);
      const node = graph.nodes[slot];
      assert.equal(record.readUInt16LE(8), node.x);
      assert.equal(record.readUInt16LE(10), node.y);
      cities.push({ slot, offset, typeViewByte: record[0x16], raw: record.toString("hex") });
    }
    chapters.push({ source: `${folder}/SINARIO.DAT`, chapter, cities });
  }
}
const toolHashes = {};
for (const path of ["tools/audit_map_migration_baseline.mjs", "tools/decode_mmap.py", "tools/disasm.py",
  "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/maplayers.js", "web/src/content/authoring/atomicmapimport.js",
  "web/src/content/authoring/minimap.js", "web/src/core/assets.js",
  "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/authoring/roadedit.js"])
  toolHashes[path] = sha(readFileSync(join(root, path)));
const report = { caseId: "M-00-MAP-MIGRATION-2", contractRevision: "GameSource@1",
  fixtureId: "fixed-original-dos-and-web-inputs", expectedSource: "MMAP.MAP/MDL, KI EXE VA+0x200, SINARIO city records",
  result: "PASS: original plane/layout and fixed map/city identity only", nodeVersion: process.version,
  sourceHashes, toolHashes, windows, rawFieldTable, tileInventory, chapters, legacyHelpers,
  artifactPaths: [`.dragon-analysis/map-migration-2/${round}/baseline.json`],
  coverageLimits: ["No CPU execution or whole-rule certification", "No hidden underlay reconstruction",
    "No water classification oracle", "Five city record regions checked; short lower file tail not normalized",
    "No SAVE.DAT, browser profiles, network, original writes or baseline overwrite"] };
writeFileSync(join(output, "baseline.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: report.result, planeSha256: sha(plane),
  usedTiles: counts.filter((n) => n > 0).length, chapters: chapters.length, graphEdges: graph.edges.length, legacyHelpers,
  artifactPaths: report.artifactPaths, coverageLimits: report.coverageLimits }, null, 2) + "\n");
