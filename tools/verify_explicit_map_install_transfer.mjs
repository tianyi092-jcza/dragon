// Actual installer CLI in owned repository-shaped temp roots only.
// APPROVED values below are synthetic gate inputs, NOT human approval of the
// original-map display proposal. Nothing is installed in the actual repository.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const output = join(root, ".dragon-analysis/map-migration-2", round);
mkdirSync(output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function json(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (cause) { throw new Error(`invalid ${label}`, { cause }); }
}
const paths = {
  installer: "tools/install_unified_map_candidate.mjs",
  stagedManifest: ".dragon-analysis/map-migration-2/explicit-stage-r1/package/manifest.json",
  currentManifest: ".dragon-analysis/map-migration-2/m2-stage-r6/package/manifest.json",
  currentSwitch: "web/src/content/builtinresources.generated.js",
};
const inputs = Object.fromEntries(Object.entries(paths).map(([id, path]) => [id, readFileSync(join(root, path))]));
const proposal = json(inputs.stagedManifest, "explicit staged manifest"), current = json(inputs.currentManifest, "current manifest");
assert.equal(proposal.geographyReview, "PROPOSED_NOT_APPROVED");
assert.equal(proposal.authorDisplayData.status, "PROPOSED_NOT_APPROVED");
assert.equal(proposal.assets.length, 38);
assert.match(proposal.worldRevision, /^map-2-[a-f0-9]{64}$/);
assert.match(current.worldRevision, /^map-2-[a-f0-9]{64}$/);
assert.equal(current.assets.length, 38);
assert.notEqual(proposal.worldRevision, current.worldRevision);
const assetBytes = new Map(), stagedHashes = {};
for (const entry of proposal.assets) {
  assert.match(entry.path, /^(?:[a-z0-9_-]+\.(?:json|bin|png)|chapters\/[a-zA-Z0-9_.-]+\.json)$/);
  assert.equal(entry.url, `content/builtin/compiled/${proposal.worldRevision}/${entry.path}`);
  assert.equal(assetBytes.has(entry.path), false);
  const bytes = readFileSync(join(root, ".dragon-analysis/map-migration-2/explicit-stage-r1/package", entry.path));
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
  assetBytes.set(entry.path, bytes); stagedHashes[entry.path] = sha(bytes);
}
const prefix = `content/builtin/compiled/${proposal.worldRevision}/`;
const world = json(assetBytes.get("world-definition.json"), "staged world");
assert.equal(world.revision, proposal.worldRevision);
// Deliberately synthetic review-state fixture in TEMP ONLY. The author JSON,
// staged proposal, screenshots and production switch retain their real states.
const mockReviewed = { ...proposal, geographyReview: "APPROVED", authorDisplayData: { ...proposal.authorDisplayData, status: "APPROVED" } };
const mockManifestBytes = Buffer.from(JSON.stringify(mockReviewed, null, 2) + "\n");
const config = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world,
  sourceURL: prefix + "game-source.json", sourceDigest: proposal.sourceDigest, geographyReview: "APPROVED" };
function switchBytes(metadata) {
  return Buffer.from(`// Controlled local candidate; review/receipts are not replaced by this module.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(metadata)});\n`);
}
const mockSwitch = switchBytes(config);
const currentPrefix = `web/content/builtin/compiled/${current.worldRevision}/`;
const currentPaths = ["manifest.json", ...current.assets.map((a) => a.path)];
for (const path of currentPaths) assert.match(path, /^(?:[a-z0-9_-]+\.(?:json|bin|png)|chapters\/[a-zA-Z0-9_.-]+\.json)$/);
const currentSnapshot = () => Object.fromEntries(currentPaths.map((p) => [p, sha(readFileSync(join(root, currentPrefix, p)))]));
const currentHashes = currentSnapshot();
assert.equal(currentHashes["manifest.json"], sha(inputs.currentManifest));
for (const a of current.assets) assert.equal(currentHashes[a.path], a.sha256);
assert.ok(inputs.currentSwitch.toString().includes(JSON.stringify(current.worldRevision)));
const temporary = mkdtempSync(join(tmpdir(), "wolong-explicit-map-transfer-"));
const env = {};
for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "ComSpec", "PATH", "Path", "PATHEXT", "TEMP", "TMP"])
  if (process.env[key] !== undefined) env[key] = process.env[key];
function fixture(id, { approved = true, corruptAsset = false, mixedWorld = false, previousMismatch = false, previousStage = "explicit-stage-r902" } = {}) {
  const fixtureAssets = new Map(assetBytes);
  let fixtureManifest = mockManifestBytes, fixtureSwitch = mockSwitch;
  if (mixedWorld) {
    const mixed = structuredClone(world);
    mixed.assets.terrain = `content/builtin/compiled/${current.worldRevision}/terrain.bin`;
    const bytes = Buffer.from(JSON.stringify(mixed) + "\n");
    fixtureAssets.set("world-definition.json", bytes);
    fixtureManifest = Buffer.from(JSON.stringify({ ...mockReviewed, assets: mockReviewed.assets.map((a) => a.path === "world-definition.json"
      ? { ...a, byteLength: bytes.length, sha256: sha(bytes) } : a) }, null, 2) + "\n");
    fixtureSwitch = switchBytes({ ...config, world: mixed });
  }
  const repository = join(temporary, id), staged = join(repository, ".dragon-analysis/map-migration-2/explicit-stage-r901");
  mkdirSync(join(staged, "package"), { recursive: true });
  mkdirSync(join(repository, "tools")); mkdirSync(join(repository, "web/src/content"), { recursive: true });
  writeFileSync(join(repository, "tools/install_unified_map_candidate.mjs"), inputs.installer);
  writeFileSync(join(staged, "package/manifest.json"), approved ? fixtureManifest : inputs.stagedManifest);
  writeFileSync(join(repository, "web/src/content/builtinresources.generated.js"), inputs.currentSwitch);
  const prior = join(repository, ".dragon-analysis/map-migration-2", previousStage);
  mkdirSync(prior, { recursive: true });
  writeFileSync(join(prior, "builtinresources.generated.js"), previousMismatch ? Buffer.concat([inputs.currentSwitch, Buffer.from("\n")]) : inputs.currentSwitch);
  if (approved) {
    for (const [path, bytes] of fixtureAssets) {
      if (path.startsWith("chapters/")) mkdirSync(join(staged, "package/chapters"), { recursive: true });
      const copy = Buffer.from(bytes);
      if (corruptAsset && path === "terrain.bin") copy[0] ^= 1;
      writeFileSync(join(staged, "package", path), copy);
    }
    writeFileSync(join(staged, "builtinresources.generated.js"), fixtureSwitch);
  }
  const oldMarker = join(repository, currentPrefix, "retained-old-directory.txt");
  mkdirSync(join(repository, currentPrefix), { recursive: true }); writeFileSync(oldMarker, "owned old-directory retention fixture\n");
  return { repository, previousStage, oldMarker, destination: join(repository, "web", prefix),
    switchPath: join(repository, "web/src/content/builtinresources.generated.js") };
}
const checks = [];
function execute(f, id) {
  const result = spawnSync(process.execPath, [join(f.repository, "tools/install_unified_map_candidate.mjs"), "explicit-stage-r901", f.previousStage],
    { cwd: f.repository, env, encoding: "utf8", timeout: 60000 });
  writeFileSync(join(output, id + ".log"), result.stdout + result.stderr);
  assert.equal(result.error, undefined); return result;
}
for (const [id, options, expected] of [
  ["explicit-unreviewed", { approved: false }, "unreviewed map display data"],
  ["explicit-corrupt-asset", { corruptAsset: true }, "staged asset hash mismatch: terrain.bin"],
  ["explicit-mixed-world", { mixedWorld: true }, "world resources must use the same staged revision and declared roles"],
  ["explicit-previous-mismatch", { previousMismatch: true, previousStage: "m2-stage-r902" }, "switch metadata changed: preserve existing file"],
]) {
  const f = fixture(id, options), result = execute(f, id);
  assert.equal(result.status, 1); assert.ok(result.stderr.includes(expected));
  assert.equal(existsSync(f.destination), false);
  assert.deepEqual(readFileSync(f.switchPath), inputs.currentSwitch);
  assert.equal(readFileSync(f.oldMarker, "utf8"), "owned old-directory retention fixture\n");
  checks.push({ id, result: "reject-before-destination-and-switch", exitCode: result.status, log: id + ".log" });
}
const positive = fixture("explicit-mock-reviewed-transfer");
const installed = execute(positive, "explicit-mock-reviewed-transfer");
assert.equal(installed.status, 0, installed.stderr);
const installRecord = json(Buffer.from(installed.stdout), "isolated installer output");
assert.equal(installRecord.assets, 38); assert.equal(installRecord.revision, proposal.worldRevision);
assert.equal(installRecord.previousGeneratedModuleSha256, sha(inputs.currentSwitch));
assert.deepEqual(readFileSync(positive.switchPath), mockSwitch);
for (const [path, bytes] of assetBytes) assert.deepEqual(readFileSync(join(positive.destination, path)), bytes);
assert.deepEqual(readFileSync(join(positive.destination, "manifest.json")), mockManifestBytes);
assert.equal(existsSync(join(positive.destination, ".metadata-switch.tmp")), false);
assert.equal(readFileSync(positive.oldMarker, "utf8"), "owned old-directory retention fixture\n");
checks.push({ id: "explicit-mock-reviewed-transfer", result: "temp-only-38-assets-and-switch-match", exitCode: installed.status,
  log: "explicit-mock-reviewed-transfer.log", previousStage: positive.previousStage });
const beforeRepeat = Object.fromEntries([...assetBytes.keys(), "manifest.json"].map((p) => [p, sha(readFileSync(join(positive.destination, p)))]));
const repeat = execute(positive, "explicit-immutable-repeat");
assert.equal(repeat.status, 1); assert.ok(repeat.stderr.includes("immutable revision already exists; do not overwrite"));
assert.deepEqual(readFileSync(positive.switchPath), mockSwitch);
assert.deepEqual(Object.fromEntries(Object.keys(beforeRepeat).map((p) => [p, sha(readFileSync(join(positive.destination, p)))])), beforeRepeat);
checks.push({ id: "explicit-immutable-repeat", result: "reject-with-no-byte-change", exitCode: repeat.status, log: "explicit-immutable-repeat.log" });
assert.deepEqual(currentSnapshot(), currentHashes);
for (const [id, p] of Object.entries(paths)) assert.equal(sha(readFileSync(join(root, p))), sha(inputs[id]));
for (const [p, h] of Object.entries(stagedHashes)) assert.equal(sha(readFileSync(join(root, ".dragon-analysis/map-migration-2/explicit-stage-r1/package", p))), h);
const receipt = { caseId: "M-05-explicit-stage-isolated-transfer", contractRevision: "immutable-stage-transfer-2",
  sourceHashes: Object.fromEntries(Object.entries(paths).map(([id, p]) => [p, sha(inputs[id])])),
  toolHashes: { [paths.installer]: sha(inputs.installer), "tools/verify_explicit_map_install_transfer.mjs": sha(readFileSync(fileURLToPath(import.meta.url))) },
  toolVersion: process.version, fixtureId: proposal.worldRevision, stagedHashes, currentHashes, expectedSource: "local immutable transfer/switch contract with synthetic review-state input in TEMP ONLY",
  result: "pass-scoped", checks, artifactPaths: checks.map((c) => c.log),
  coverageLimits: "Does not approve source categories/M-06, implement an approval mechanism, install actual candidate, or certify browser/rules. Actual 39 resources, switch and all 38 proposal assets unchanged; owned temp roots retained." };
writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: receipt.result, checks: checks.length, currentResourcesUnchanged: currentPaths.length, installedInActualRepository: false }) + "\n");
