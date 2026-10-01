// Read-only installed descriptor -> trusted authoring copy input. No legacy
// ignored migration source, latest-template fallback, DOS/profile or writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { canonicalDigest } from "../web/src/content/authoring/gamesource.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function json(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new TypeError("invalid installed editor source JSON", { cause }); } }
export function readInstalledEditorSource(resources = BUILTIN_RESOURCES,
  read = (path) => readFileSync(new URL("../web/" + path, import.meta.url))) {
  const revision = resources.world.revision;
  assert.match(revision, /^map-2-[a-f0-9]{64}$/);
  const prefix = `content/builtin/compiled/${revision}/`;
  assert.equal(resources.sourceURL, prefix + "game-source.json");
  assert.equal(resources.catalogURL, prefix + "catalog.json");
  assert.equal(resources.dataURL, prefix + "data.json");
  const manifest = json(read(prefix + "manifest.json"));
  assert.equal(manifest.worldRevision, revision); assert.equal(manifest.contentRevision, revision);
  for (const flag of [manifest.geographyReview, manifest.visualReview, manifest.authorDisplayData?.status, resources.geographyReview]) assert.equal(flag, "APPROVED");
  assert.equal(manifest.assets.length, 38);
  const seen = new Set(), bytes = new Map();
  for (const entry of manifest.assets) {
    assert.match(entry.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
    assert.ok(!seen.has(entry.path)); seen.add(entry.path);
    assert.equal(entry.url, prefix + entry.path);
    const data = read(entry.url); assert.equal(data.length, entry.byteLength); assert.equal(sha(data), entry.sha256, entry.path);
    bytes.set(entry.path, data);
  }
  const source = json(bytes.get("game-source.json")), catalog = json(bytes.get("catalog.json"));
  assert.equal(canonicalDigest(source, sha), manifest.sourceDigest); assert.equal(manifest.sourceDigest, resources.sourceDigest);
  assert.deepEqual(json(bytes.get("world-definition.json")), resources.world);
  assert.equal(catalog.revision, revision); assert.equal(catalog.chapters.length, 20);
  const compiled = compileGameSource(source, sha);
  assert.equal(compiled.compatibilityAssetMode, "source-explicit");
  assert.deepEqual(Buffer.from(compiled.terrainBytes), bytes.get("terrain.bin"));
  assert.deepEqual(compiled.roadGraph, json(bytes.get("roads.json")));
  assert.deepEqual(Buffer.from(compiled.roadCost), bytes.get("road_cost.bin"));
  assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), bytes.get("road_offset.json"));
  const chapters = catalog.chapters.map((entry, i) => {
    assert.equal(source.chapterOrder[i], entry.id);
    assert.deepEqual(source.chapters[entry.id].state, json(bytes.get(entry.file)));
    return { id: entry.id, state: source.chapters[entry.id].state };
  });
  const cities = Object.values(source.cities).map((c) => ({ id: c.cityId, index: c.runtimeSlot, x: c.x, y: c.y }));
  assert.equal(cities.length, 192);
  const atlas = manifest.assets.find((a) => a.path === "map_atlas_spring.png"); assert.ok(atlas);
  return { revision, world: { ...resources.world, cities }, map: source.map, componentDefinitions: source.componentDefinitions,
    compatibilityAssets: source.compatibilityAssets, chapters,
    editorAssets: { springAtlas: { url: atlas.url, sha256: atlas.sha256, byteLength: atlas.byteLength } } };
}
