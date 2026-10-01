// MAP-MIGRATION-2 M-05 asset single-flight/failure retry. Pure mocks;
// no HTTP server, disk assets, SAVE, browser, IDB or profile access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadJSON, loadBytes, loadImage } from "../web/src/core/assets.js";
const previousFetch = globalThis.fetch;
const previousImage = globalThis.Image;
// Relative, private mock namespace: no host/configuration or real fetch needed.
const fixtureRoot = "/__asset-retry-fixture/";
const fixtureAsset = (revision, name) => `${fixtureRoot}revision-${revision}/${name}`;
const requests = new Map();
function count(url) {
  const next = (requests.get(url) ?? 0) + 1;
  requests.set(url, next);
  return next;
}
try {
  assert.equal(requests.size, 0, "asset module construction is lazy");
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.ok(url.startsWith(fixtureRoot), "mocks must never forward");
    const n = count(url);
    if (n === 1) return new Response("{}", { status: 503 });
    if (url.includes("malformed") && n === 2) return new Response("not json", { status: 200 });
    if (url.includes("bytes")) return new Response(new Uint8Array([0x14, 0x10]));
    return new Response(JSON.stringify({ revision: url.includes("revision-2") ? "2" : "1" }));
  };
  const json = fixtureAsset(1, "catalog.json");
  await assert.rejects(loadJSON(json), /加载失败/);
  const jsonA = loadJSON(json);
  const jsonB = loadJSON(json);
  assert.equal(jsonA, jsonB, "single-flight JSON promise");
  assert.deepEqual(await jsonA, { revision: "1" });
  assert.deepEqual(await loadJSON(json), { revision: "1" });
  assert.equal(requests.get(json), 2, "JSON success remains cached after retry");
  const malformed = fixtureAsset(1, "malformed.json");
  await assert.rejects(loadJSON(malformed));
  await assert.rejects(loadJSON(malformed));
  assert.deepEqual(await loadJSON(malformed), { revision: "1" });
  assert.equal(requests.get(malformed), 3, "malformed JSON clears failed promise too");
  const bytes = fixtureAsset(1, "bytes.bin");
  await assert.rejects(loadBytes(bytes), /加载失败/);
  assert.deepEqual(await loadBytes(bytes), new Uint8Array([0x14, 0x10]));
  assert.equal(requests.get(bytes), 2);
  const next = fixtureAsset(2, "catalog.json");
  await assert.rejects(loadJSON(next));
  assert.deepEqual(await loadJSON(next), { revision: "2" });
  assert.deepEqual(await loadJSON(json), { revision: "1" }, "old revision cache not overwritten by new URL");
  globalThis.Image = class FixtureImage {
    onload = null;
    onerror = null;
    set src(url) {
      assert.ok(url.startsWith(fixtureRoot));
      const n = count(url);
      queueMicrotask(() => { if (n === 1) this.onerror?.(); else this.onload?.(); });
    }
  };
  const image = fixtureAsset(1, "atlas.png");
  await assert.rejects(loadImage(image), /加载失败/);
  const imageA = loadImage(image);
  assert.equal(imageA, loadImage(image), "single-flight image");
  assert.equal(await imageA, await loadImage(image));
  assert.equal(requests.get(image), 2);
  process.stdout.write(JSON.stringify({ caseId: "M-05-ASSET-RETRY", result: "PASS", fixtureId: "pure-failing-Response-and-Image-mocks",
    expectedSource: "engineering cache/failure contract; no original rules asserted", contractRevision: "RuntimeManifest@1",
    sourceHashes: {},
    toolHashes: Object.fromEntries(["verify_asset_retry.mjs", "../web/src/core/assets.js", "../web/src/content/worlddefinition.js"].map((path) =>
      [path, createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex")])),
    nodeVersion: process.version,
    artifactPaths: [".dragon-analysis/map-migration-2/session-evidence/asset-retry-r1.log"],
    coverageLimits: ["Mocks only: no real browser requests or manifest integrity coverage", "No game/RNG/Scenario mutation or user data access"] }, null, 2) + "\n");
} finally { globalThis.fetch = previousFetch; globalThis.Image = previousImage; }
