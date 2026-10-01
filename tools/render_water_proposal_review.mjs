// Self-contained SVG -> review PNG only. Four owned fresh pages; every network
// request rejected, no app or actual saves/profiles. Existing Playwright only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const [sourceRound, round] = process.argv.slice(2);
for (const value of [sourceRound, round]) assert.match(value ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.notEqual(sourceRound, round);
const source = join(root, ".dragon-analysis/map-migration-2", sourceRound), output = join(root, ".dragon-analysis/map-migration-2", round);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let receipt;
try { receipt = JSON.parse(readFileSync(join(source, "receipt.json"))); }
catch (cause) { throw new Error("invalid proposal receipt", { cause }); }
assert.equal(receipt.caseId, "M-00-01-explicit-water-display-proposal");
const inputHashes = {}, results = [], errors = [], requests = [];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
mkdirSync(output);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [name, width, height] of [["region-review", 1536, 1100], ["minimap-comparison", 1600, 360], ["region-legend", 1536, 400], ["road-types", 1536, 1100]]) {
    const bytes = readFileSync(join(source, name + ".svg")), entry = receipt.artifactPaths.find((a) => a.path === name + ".svg");
    assert.ok(entry); assert.equal(sha(bytes), entry.sha256); assert.equal(bytes.length, entry.byteLength);
    const text = bytes.toString();
    assert.doesNotMatch(text, /<(?:script|foreignObject|iframe)\b/i);
    assert.doesNotMatch(text, /(?:href|src)\s*=\s*["'](?!data:image\/png;base64,)/i);
    inputHashes[name + ".svg"] = sha(bytes);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.route("**/*", (route) => { requests.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setContent(`<html><body style="margin:0">${text}</body></html>`, { waitUntil: "load" });
    await page.locator("svg").screenshot({ path: join(output, name + ".png") });
    results.push({ path: name + ".png", sha256: sha(readFileSync(join(output, name + ".png"))) });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-06-water-proposal-review-render", contractRevision: "self-contained-SVG-review-1",
    sourceHashes: inputHashes, toolHashes: { "tools/render_water_proposal_review.mjs": sha(readFileSync(fileURLToPath(import.meta.url))) },
    toolVersion: { node: process.version, browser: browser.version() }, fixtureId: receipt.sourceDigest,
    expectedSource: "hash-checked proposal SVG, not user approval or native game", result: "PASS-RENDER-REVIEW-REQUIRED",
    artifactPaths: results, errors, requests, coverageLimits: "No current-game integration or visual/classification approval; only owned contexts/about:blank with inline data PNGs" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "PASS-RENDER-REVIEW-REQUIRED", results, errors, requests }) + "\n");
} finally { await browser?.close(); }
