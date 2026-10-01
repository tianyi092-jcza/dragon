// Trusted local adoption builder. Checks the recorded USER review, exact old
// evidence and current compiler; no writes/network/profile/DOS IO. This is not
// a general approval service: only this one reviewed fixed-domain map is admitted.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
export const sha = (b) => createHash("sha256").update(b).digest("hex");
export function approvedMap(root) {
  const sourceHashes = {};
  function read(p) { const b = readFileSync(join(root, p)); sourceHashes[p] = sha(b); return b; }
  function parse(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new Error("invalid acceptance input JSON", { cause }); } }
  const json = (p) => parse(read(p));
  const acceptancePath = "docs/data/current-map-display-acceptance.json", acceptance = json(acceptancePath);
  assert.equal(acceptance.schemaVersion, 1); assert.equal(acceptance.decision, "APPROVED");
  assert.equal(acceptance.source, "用户m1668"); assert.equal(acceptance.quote, "很好，效果不错，继续");
  assert.equal(acceptance.candidateStage, "explicit-stage-r9"); assert.equal(acceptance.reviewRound, "minimap-groups-review-r2");
  const base = ".dragon-analysis/map-migration-2/", folder = base + acceptance.candidateStage + "/";
  const report = json(folder + "stage-report.json"), manifest = json(folder + "package/manifest.json");
  const review = json(base + acceptance.reviewRound + "/receipt.json");
  assert.equal(sha(read(base + acceptance.reviewRound + "/review.html")), acceptance.reviewHtmlSha256);
  assert.equal(review.htmlSha256, acceptance.reviewHtmlSha256); assert.equal(review.fixtureId, acceptance.candidateRevision);
  assert.equal(report.revision, acceptance.candidateRevision); assert.equal(manifest.worldRevision, report.revision);
  assert.equal(report.sourceDigest, acceptance.sourceDigest); assert.equal(manifest.sourceDigest, report.sourceDigest);
  assert.equal(report.minimapStyleRevision, acceptance.styleRevision); assert.equal(report.categoryReview.decision, "APPROVED");
  assert.equal(manifest.assets.length, 38); assert.equal(manifest.compatibilityAssetMode, "source-explicit");
  // Revalidate explicit recipe input/code hashes, not a historical green label.
  assert.equal(Object.keys(report.sourceHashes).length, 23); assert.equal(Object.keys(report.toolHashes).length, 12);
  for (const [p, record] of Object.entries(report.sourceHashes)) {
    assert.ok(/^web\/[A-Za-z0-9_./-]+$/.test(p) && !p.includes("..") || ["docs/data/original-map-water-display-proposal.json", "docs/data/original-map-minimap-groups.json"].includes(p));
    const b = read(p); assert.equal(b.length, record.byteLength); assert.equal(sha(b), record.sha256);
  }
  for (const [p, hash] of Object.entries(report.toolHashes)) {
    assert.ok(/^(?:tools|web\/src\/content\/authoring)\/[a-z0-9_./-]+\.m?js$/.test(p) && !p.includes("..")); assert.equal(sha(read(p)), hash);
  }
  // Seven exact images including the production-App views in the review page.
  assert.equal(Object.keys(review.imageHashes).length, 7);
  for (const [p, hash] of Object.entries(review.imageHashes)) {
    assert.ok(new Set(["explicit-stage-r1/package/minimap_base.png", "explicit-stage-r1/package/minimap_large.png",
      "explicit-stage-r9/package/minimap_base.png", "explicit-stage-r9/package/minimap_large.png",
      "minimap-groups-App-r3/normal.png", "minimap-groups-App-r3/large.png", "minimap-groups-App-r3/fallback.png"].map((s) => base + s)).has(p));
    assert.equal(sha(read(p)), hash);
  }
  const assets = new Map();
  for (const a of manifest.assets) {
    assert.match(a.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
    assert.equal(a.url, `content/builtin/compiled/${report.revision}/${a.path}`); assert.ok(!assets.has(a.path));
    const b = read(folder + "package/" + a.path); assert.equal(b.length, a.byteLength); assert.equal(sha(b), a.sha256); assets.set(a.path, b);
  }
  for (const [p, hash] of Object.entries(acceptance.minimapSha256)) assert.equal(sha(assets.get(p)), hash);
  const source = parse(assets.get("game-source.json")), compiled = compileGameSource(source, sha);
  assert.equal(compiled.sourceDigest, acceptance.sourceDigest); assert.deepEqual(Buffer.from(compiled.terrainBytes), assets.get("terrain.bin"));
  assert.deepEqual(compiled.roadGraph, parse(assets.get("roads.json"))); assert.deepEqual(Buffer.from(compiled.roadCost), assets.get("road_cost.bin"));
  assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), assets.get("road_offset.json"));
  const toolHashes = Object.fromEntries(["tools/map_display_acceptance.mjs", "tools/stage_approved_unified_map_game.mjs"].map((p) => [p, sha(read(p))]));
  const revision = "map-2-" + sha(Buffer.from(JSON.stringify({ candidateRevision: report.revision, sourceDigest: compiled.sourceDigest,
    acceptanceSha256: sourceHashes[acceptancePath], reviewHtmlSha256: acceptance.reviewHtmlSha256, toolHashes })));
  const prefix = `content/builtin/compiled/${revision}/`, world = parse(assets.get("world-definition.json"));
  const priorPrefix = `content/builtin/compiled/${report.revision}/`;
  world.revision = revision;
  for (const [key, value] of Object.entries(world.assets)) {
    if (typeof value === "string") { assert.ok(value.startsWith(priorPrefix)); world.assets[key] = prefix + value.slice(priorPrefix.length); }
    else for (const [child, url] of Object.entries(value)) { assert.ok(url.startsWith(priorPrefix)); value[child] = prefix + url.slice(priorPrefix.length); }
  }
  const catalog = parse(assets.get("catalog.json")); catalog.revision = revision;
  assets.set("world-definition.json", Buffer.from(JSON.stringify(world) + "\n")); assets.set("catalog.json", Buffer.from(JSON.stringify(catalog) + "\n"));
  const adopted = { ...manifest, contentRevision: revision, worldRevision: revision, geographyReview: "APPROVED", visualReview: "APPROVED",
    authorDisplayData: { ...manifest.authorDisplayData, status: "APPROVED" }, displayAcceptance: { ...acceptance, sha256: sourceHashes[acceptancePath] },
    assets: manifest.assets.map((a) => ({ ...a, url: prefix + a.path, sha256: sha(assets.get(a.path)), byteLength: assets.get(a.path).length })) };
  const config = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world,
    sourceURL: prefix + "game-source.json", sourceDigest: compiled.sourceDigest, geographyReview: "APPROVED" };
  const generated = Buffer.from(`// Controlled local candidate; review/receipts are not replaced by this module.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(config)});\n`);
  return { assets, manifest: adopted, generated, sourceHashes, toolHashes, revision, candidateRevision: report.revision,
    sourceDigest: compiled.sourceDigest, acceptance, parity: report.parity };
}
