// Reject-only actual CLI checks in a new owned repository-shaped temp root.
// Copies the exact installer bytes; no real installer writes or approved fixture.
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
const files = {
  installer: "tools/install_unified_map_candidate.mjs",
  legacy: ".dragon-analysis/map-migration-2/m2-stage-r6/package/manifest.json",
  proposal: ".dragon-analysis/map-migration-2/explicit-stage-r1/package/manifest.json",
  switch: "web/src/content/builtinresources.generated.js",
};
const inputs = Object.fromEntries(Object.entries(files).map(([id, path]) => [id, readFileSync(join(root, path))]));
function decode(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (cause) { throw new Error("invalid fixed guard manifest", { cause }); }
}
const legacy = decode(inputs.legacy), proposal = decode(inputs.proposal);
assert.match(legacy.geographyReview, /^PENDING/);
assert.equal(proposal.geographyReview, "PROPOSED_NOT_APPROVED");
assert.match(legacy.worldRevision, /^map-2-[a-f0-9]{64}$/);
assert.match(proposal.worldRevision, /^map-2-[a-f0-9]{64}$/);
assert.ok(inputs.switch.toString("utf8").includes(JSON.stringify(legacy.worldRevision)), "fixture must pin the still-current installed revision");
const currentPrefix = "web/content/builtin/compiled/" + legacy.worldRevision + "/";
const resourcePaths = ["manifest.json", ...legacy.assets.map((a) => a.path)];
for (const path of resourcePaths) assert.match(path, /^(?:[a-z0-9_-]+\.[a-z]+|chapters\/[a-zA-Z0-9_.-]+\.json)$/);
const resourceSnapshot = () => Object.fromEntries(resourcePaths.map((path) => [path, sha(readFileSync(join(root, currentPrefix, path)))]));
const resourceHashes = resourceSnapshot();
assert.equal(resourceHashes["manifest.json"], sha(inputs.legacy));
for (const asset of legacy.assets) assert.equal(resourceHashes[asset.path], asset.sha256);
const tempRoot = mkdtempSync(join(tmpdir(), "wolong-map-review-guard-"));
const env = {};
for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "ComSpec", "PATH", "Path", "PATHEXT", "TEMP", "TMP"])
  if (process.env[key] !== undefined) env[key] = process.env[key];
const cases = [
  { id: "historical-pending", manifest: legacy, expected: "unreviewed map display data" },
  { id: "literal-proposed", manifest: proposal, expected: "unreviewed map display data" },
  { id: "missing-review", manifest: { ...proposal, geographyReview: undefined }, expected: "unreviewed map display data" },
  { id: "map-status-alone", manifest: { ...proposal, geographyReview: "APPROVED" }, expected: "unreviewed author display data" },
  { id: "missing-author-status", manifest: { ...proposal, geographyReview: "APPROVED", authorDisplayData: undefined }, expected: "unreviewed author display data" },
];
const checks = [];
for (const fixture of cases) {
  const repository = join(tempRoot, fixture.id);
  const stage = join(repository, ".dragon-analysis/map-migration-2/m2-stage-r900/package");
  mkdirSync(stage, { recursive: true });
  mkdirSync(join(repository, "tools"));
  mkdirSync(join(repository, "web/src/content"), { recursive: true });
  writeFileSync(join(stage, "manifest.json"), JSON.stringify(fixture.manifest));
  const script = join(repository, "tools/install_unified_map_candidate.mjs");
  writeFileSync(script, inputs.installer);
  assert.equal(sha(readFileSync(script)), sha(inputs.installer));
  const switchPath = join(repository, "web/src/content/builtinresources.generated.js");
  writeFileSync(switchPath, inputs.switch);
  const result = spawnSync(process.execPath, [script, "m2-stage-r900"], { cwd: repository, env, encoding: "utf8", timeout: 30000 });
  writeFileSync(join(output, fixture.id + ".log"), result.stdout + result.stderr);
  assert.equal(result.status, 1, `${fixture.id}: must reject with normal assertion failure`);
  assert.ok(result.stderr.includes(fixture.expected), `${fixture.id}: rejected for the wrong reason`);
  // No staged asset files were provided: the expected guard must run before
  // attempting to read them, not just fail on missing bytes or existing URI.
  assert.equal(existsSync(join(repository, "web/content")), false);
  assert.equal(existsSync(join(repository, "web/src/content/.metadata-switch.tmp")), false);
  assert.deepEqual(readFileSync(switchPath), inputs.switch);
  checks.push({ id: fixture.id, exitCode: result.status, result: "reject-before-assets-and-writes", log: fixture.id + ".log" });
}
assert.deepEqual(resourceSnapshot(), resourceHashes);
for (const [id, path] of Object.entries(files)) assert.equal(sha(readFileSync(join(root, path))), sha(inputs[id]));
const sourceHashes = Object.fromEntries(Object.entries(files).map(([id, path]) => [path, sha(inputs[id])]));
const receipt = { caseId: "M-05-unreviewed-local-install-guard", contractRevision: "local-review-rejection-1", sourceHashes,
  toolHashes: { [files.installer]: sha(inputs.installer), "tools/verify_map_install_review_guard.mjs": sha(readFileSync(fileURLToPath(import.meta.url))) },
  resourceHashes, toolVersion: process.version, fixtureId: proposal.worldRevision, expectedSource: "documented category plus M-06 gates, not new native mechanism",
  result: "pass-scoped", checks, artifactPaths: checks.map((c) => c.log),
  coverageLimits: "Reject-only; no human approval synthesized, approved generation/install not tested or enabled, no app/rule/full-suite retest; owned temporary roots retained for audit." };
writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: receipt.result, rejected: checks.length, currentResourcesUnchanged: resourcePaths.length }) + "\n");
