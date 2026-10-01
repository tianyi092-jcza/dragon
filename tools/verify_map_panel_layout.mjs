// Pure Web UI geometry test. No fetch, Image, Scenario, clock, SAVE or profile.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mapPanelLayout, insidePanel } from "../web/src/ui/mappanellayout.js";
const world = { width: 384, height: 256, tileSize: 16 };
const results = [];
for (const fixture of [
  { id: "normal", width: 1024, height: 768, mapWidth: 208 },
  { id: "large", width: 1280, height: 768, mapWidth: 250 },
  { id: "short-fallback", width: 640, height: 400, mapWidth: 208 },
  { id: "height-fallback", width: 1280, height: 400, mapWidth: 208 },
]) {
  const panels = mapPanelLayout({ ...fixture, miniOpen: true, resOpen: true, world });
  const [mini, res] = panels;
  assert.equal(mini.mapBox.w, fixture.mapWidth);
  for (const { frame: f } of panels) {
    assert.ok(f.x >= 4 && f.y >= 32 && f.x + f.w <= fixture.width - 4 && f.y + f.h <= fixture.height - 4);
    const menu = { x: Math.max(0, Math.round((fixture.width - 640) / 2)), y: 32, w: 640, h: 48 };
    assert.ok(f.x + f.w <= menu.x || menu.x + menu.w <= f.x || f.y + f.h <= menu.y || menu.y + menu.h <= f.y,
      "right-side frame must not cover any advisor menu item");
    assert.ok(insidePanel({ frame: f }, f.x, f.y));
    assert.equal(insidePanel({ frame: f }, f.x + f.w, f.y), false);
    assert.equal(insidePanel({ frame: f }, f.x, f.y + f.h), false);
  }
  const a = mini.frame, b = res.frame;
  assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const t = mini.transform, r = t.rect;
  assert.equal(t.displayToWorld(r.x - 0.001, r.y), null);
  assert.equal(t.displayToWorld(r.x, r.y + r.h), null);
  for (const point of [[0, 0], [6143, 4095], [3072, 2048]]) {
    const back = t.displayToWorld(...t.worldToDisplay(...point));
    assert.ok(back && Math.abs(back[0] - point[0]) < 1e-8 && Math.abs(back[1] - point[1]) < 1e-8);
  }
  assert.ok(mini.bannerY >= mini.mapBox.y + mini.mapBox.h);
  assert.ok(mini.bannerY + 20 <= mini.frame.y + mini.frame.h - 8);
  assert.ok(mini.secondBannerX + mini.bannerWidth <= mini.mapBox.x + mini.mapBox.w);
  results.push({ fixtureId: fixture.id, result: "pass", frames: panels.map((p) => p.frame), actualMapRect: r });
}
for (const width of [640, 1024, 1280]) for (const height of [400, 768]) {
  for (const [miniOpen, resOpen] of [[true, false], [false, true], [false, false]]) {
    const panels = mapPanelLayout({ width, height, miniOpen, resOpen, world });
    const menu = { x: Math.max(0, Math.round((width - 640) / 2)), y: 32, w: 640, h: 48 };
    assert.equal(panels.length, Number(miniOpen) + Number(resOpen));
    for (const { frame: f } of panels) {
      assert.ok(f.x + f.w <= menu.x || menu.x + menu.w <= f.x || f.y >= menu.y + menu.h);
      assert.ok(f.x >= 4 && f.y >= 32 && f.x + f.w <= width - 4 && f.y + f.h <= height - 4);
    }
  }
}
assert.equal(mapPanelLayout({ width: 1280, height: 768, miniOpen: false, resOpen: false, world }).length, 0);
const hashes = {};
for (const path of ["tools/verify_map_panel_layout.mjs", "web/src/ui/mappanellayout.js", "web/src/content/authoring/minimap.js", "web/src/ui/gamebar.js"]) {
  hashes[path] = createHash("sha256").update(readFileSync(new URL("../" + path, import.meta.url))).digest("hex");
}
process.stdout.write(JSON.stringify({ caseId: "M-02-map-panel-layout", contractRevision: "map-panel-layout-2-advisor-strip",
  sourceHashes: hashes, toolHashes: hashes, toolVersion: process.version,
  expectedSource: "approved Web normal/conditional-enlargement/fallback geometry; not KI layout equivalence",
  result: "pass", fixtures: results, artifactPaths: ["stdout"],
  coverageLimits: "pure geometry only; actual Canvas UI, modal priorities, DPR and user visual acceptance require browser verification" }, null, 2) + "\n");
