// Approved display seed invariants, not original RNG or native water semantics.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { composeMapLayers } from "../web/src/content/authoring/maplayers.js";
import { renderMinimapPixels } from "../web/src/content/authoring/minimap.js";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const sourceBytes = readFileSync(new URL("../web/" + BUILTIN_RESOURCES.sourceURL, import.meta.url));
let source;
try { source = JSON.parse(sourceBytes); }
catch (cause) { throw new Error("invalid current source", { cause }); }
const compiled = composeMapLayers(source);
const roadMask = new Uint8Array(384 * 256);
for (const road of source.map.roads) for (const p of road.geometry) roadMask[p.y * 384 + p.x] = 1;
const before = sha(Buffer.from(JSON.stringify(source)));
const oldRandom = Math.random;
const oldNow = Date.now;
const checks = [];
Math.random = () => { throw new Error("display generation must not consume ambient RNG"); };
Date.now = () => { throw new Error("display generation must not depend on time"); };
try {
  for (const [width, height] of [[208, 139], [250, 167]]) {
    const a = renderMinimapPixels(compiled.geography, roadMask, 384, 256, width, height, 1);
    const b = renderMinimapPixels(compiled.geography, roadMask, 384, 256, width, height, 1);
    const c = renderMinimapPixels(compiled.geography, roadMask, 384, 256, width, height, 2);
    assert.deepEqual(a.pixels, b.pixels);
    assert.deepEqual(a.geoMask, c.geoMask);
    assert.notDeepEqual(a.pixels, c.pixels);
    checks.push({ width, height, seed1: sha(a.pixels), seed2: sha(c.pixels), geographyMask: sha(a.geoMask) });
  }
} finally { Math.random = oldRandom; Date.now = oldNow; }
assert.equal(sha(Buffer.from(JSON.stringify(source))), before);
const toolHashes = {};
for (const name of ["tools/verify_minimap_seed.mjs", "web/src/content/authoring/minimap.js", "web/src/content/authoring/maplayers.js", "web/src/content/builtinresources.generated.js"])
  toolHashes[name] = sha(readFileSync(new URL("../" + name, import.meta.url)));
process.stdout.write(JSON.stringify({ caseId: "M-01-display-seed", contractRevision: "minimap-style-1", result: "pass-scoped",
  sourceHashes: { [BUILTIN_RESOURCES.sourceURL]: sha(sourceBytes) }, toolHashes, toolVersion: process.version,
  fixtureId: BUILTIN_RESOURCES.world.revision, expectedSource: "approved deterministic Web display seed contract", checks,
  artifactPaths: [], coverageLimits: "Not water classification/native RNG algorithm/visual approval" }, null, 2) + "\n");
