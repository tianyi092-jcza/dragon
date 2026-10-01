// Local repository implementation only; no deploy, git, DOS, SAVE or profile IO.
// Reads one explicit staged package; never overwrites an existing revision.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
const previousRound = process.argv[3];
assert.ok(process.argv.length <= 4, "one candidate and optional reviewed previous stage required");
// Both generators use the same immutable asset/switch contract. Accepting a
// stage name never waives the review prerequisites below.
const stageName = /^(?:m2|explicit)-stage-r\d+$/;
assert.match(round ?? "", stageName);
if (previousRound !== undefined) assert.match(previousRound, stageName);
const staged = join(root, ".dragon-analysis/map-migration-2", round);
const source = join(staged, "package");
let manifest;
try { manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8")); }
catch (cause) { throw new Error("invalid staged manifest", { cause }); }
assert.equal(manifest.schemaVersion, 1);
// Historical PENDING packages remain reproducible/readable, not installable.
// These are rejection prerequisites, NOT a human approval mechanism: changing
// status strings cannot replace the recorded category and M-06 review.
// Run this before reading/copying any assets or creating a revision directory.
assert.equal(manifest.geographyReview, "APPROVED", "unreviewed map display data: installation blocked");
assert.equal(manifest.authorDisplayData?.status, "APPROVED", "unreviewed author display data: installation blocked");
assert.equal(manifest.gameId, "wolong-builtin");
assert.match(manifest.worldRevision, /^map-2-[a-f0-9]{64}$/);
assert.equal(manifest.contentRevision, manifest.worldRevision);
assert.equal(manifest.compatibilityAssetMode, "source-explicit");
assert.equal(manifest.assets.length, 38);
const prefix = `content/builtin/compiled/${manifest.worldRevision}/`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const assets = new Map();
for (const asset of manifest.assets) {
  assert.match(asset.path, /^(?:[a-z0-9_-]+\.[a-z]+|chapters\/[a-zA-Z0-9_.-]+\.json)$/);
  assert.ok(!asset.path.split("/").includes(".."));
  assert.ok(!assets.has(asset.path));
  assert.equal(asset.url, prefix + asset.path);
  const bytes = readFileSync(join(source, asset.path));
  assert.equal(bytes.length, asset.byteLength, `staged asset length mismatch: ${asset.path}`);
  assert.equal(sha(bytes), asset.sha256, `staged asset hash mismatch: ${asset.path}`);
  assets.set(asset.path, bytes);
}
assert.ok(assets.has("game-source.json") && assets.has("world-definition.json") && assets.has("catalog.json") && assets.has("data.json"));
let world;
try { world = JSON.parse(assets.get("world-definition.json").toString("utf8")); }
catch (cause) { throw new Error("invalid staged world definition", { cause }); }
assert.equal(world.id, "mmap-original");
assert.equal(world.revision, manifest.worldRevision);
assert.equal(world.width, 384);
assert.equal(world.height, 256);
assert.equal(world.tileSize, 16);
const seasons = ["spring", "summer", "autumn", "winter"];
assert.deepEqual(world.assets, {
  terrain: prefix + "terrain.bin", roadGraph: prefix + "roads.json",
  roadCost: prefix + "road_cost.bin", roadOffset: prefix + "road_offset.json",
  seasonAtlases: Object.fromEntries(seasons.map((s) => [s, prefix + `map_atlas_${s}.png`])),
  seasons: Object.fromEntries(seasons.map((s) => [s, prefix + `map_tiles_${s}.png`])),
  minimap: { base: prefix + "minimap_base.png", large: prefix + "minimap_large.png" },
}, "world resources must use the same staged revision and declared roles");
const metadata = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world,
  sourceURL: prefix + "game-source.json", sourceDigest: manifest.sourceDigest, geographyReview: manifest.geographyReview };
const generatedBytes = `// Controlled local candidate; review/receipts are not replaced by this module.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(metadata)});\n`;
assert.equal(readFileSync(join(staged, "builtinresources.generated.js"), "utf8"), generatedBytes,
  "generated switch must exactly match the hash-verified world and manifest");
const destination = join(root, "web", prefix);
assert.equal(existsSync(destination), false, "immutable revision already exists; do not overwrite");
const generatedDestination = join(root, "web/src/content/builtinresources.generated.js");
let previousBytes = null;
if (existsSync(generatedDestination)) {
  assert.ok(previousRound, "existing switch requires explicit reviewed previous stage");
  previousBytes = readFileSync(join(root, ".dragon-analysis/map-migration-2", previousRound, "builtinresources.generated.js"));
  assert.deepEqual(readFileSync(generatedDestination), previousBytes, "switch metadata changed: preserve existing file");
} else assert.equal(previousRound, undefined, "no existing switch to replace");
mkdirSync(destination, { recursive: true });
for (const [path, bytes] of assets) {
  if (path.startsWith("chapters/")) mkdirSync(join(destination, "chapters"), { recursive: true });
  writeFileSync(join(destination, path), bytes);
  assert.equal(sha(readFileSync(join(destination, path))), sha(bytes));
}
copyFileSync(join(source, "manifest.json"), join(destination, "manifest.json"));
// Complete and hash-check every new asset before an atomic local switch.
// Recheck the captured previous bytes against concurrent edits. Old directories
// and already-running worlds retain their URLs and are never hot-replaced.
if (previousBytes) assert.deepEqual(readFileSync(generatedDestination), previousBytes,
  "switch metadata changed during install: preserve existing file");
else assert.equal(existsSync(generatedDestination), false);
const pendingSwitch = join(destination, ".metadata-switch.tmp");
writeFileSync(pendingSwitch, generatedBytes, { flag: "wx" });
renameSync(pendingSwitch, generatedDestination);
process.stdout.write(JSON.stringify({ caseId: "M2-local-install", revision: manifest.worldRevision,
  assets: assets.size, previousStage: previousRound ?? null,
  previousGeneratedModuleSha256: previousBytes ? sha(previousBytes) : null, manifestSha256: sha(readFileSync(join(destination, "manifest.json"))),
  generatedModuleSha256: sha(readFileSync(generatedDestination)),
  coverageLimits: "local immutable asset transfer only; status fields do not certify human category/M-06 review or runtime regressions; old paths retained" }, null, 2) + "\n");
