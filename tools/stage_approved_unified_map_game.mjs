// Generate a NEW isolated approved transfer pack, no installation or rewriting
// of the reviewed candidate. Reads only approvedMap's explicit owned inputs.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { approvedMap } from "./map_display_acceptance.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), round = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(round ?? "", /^explicit-stage-r\d+$/);
const pack = approvedMap(root); // reject before any output directory
const output = join(root, ".dragon-analysis/map-migration-2", round), folder = join(output, "package");
mkdirSync(output); mkdirSync(folder); mkdirSync(join(folder, "chapters"));
for (const [p, b] of pack.assets) writeFileSync(join(folder, p), b, { flag: "wx" });
writeFileSync(join(folder, "manifest.json"), JSON.stringify(pack.manifest, null, 2) + "\n", { flag: "wx" });
writeFileSync(join(output, "builtinresources.generated.js"), pack.generated, { flag: "wx" });
writeFileSync(join(output, "stage-report.json"), JSON.stringify({ caseId: "M-06-approved-map-transfer-stage", result: "PASS-APPROVED-STAGE-NOT-INSTALLED",
  contractRevision: "recorded-user-visual-acceptance-1/editor-local-0.6", toolVersion: process.version, revision: pack.revision,
  fixtureId: pack.candidateRevision, sourceDigest: pack.sourceDigest, sourceHashes: pack.sourceHashes, toolHashes: pack.toolHashes,
  expectedSource: "user m1668 acceptance bound to exact reviewed source/images; native data and image bytes kept",
  parity: pack.parity, acceptance: pack.acceptance, artifactPaths: ["package", "builtinresources.generated.js"],
  coverageLimits: "Only manifest approval and new catalog/world URI identity. No source/native/image edits, runtime test, full editor or native mechanism approval." }, null, 2) + "\n", { flag: "wx" });
process.stdout.write(JSON.stringify({ result: "PASS-APPROVED-STAGE-NOT-INSTALLED", revision: pack.revision, assets: pack.assets.size }) + "\n");
