// E-02/03 current source + physical groups + real previews, owned IO only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { startEditorServer, EDITOR_BUILD_FORMAT } from "./editor_server.mjs";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { compileGameSource, TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { prepareTrialScenario } from "../web/src/content/authoring/trialruntime.js";
import { readSavedAssembly, prepareScenario, snapshotScenarioAssembly } from "../web/src/game/scenarioassembly.js";
const round = process.argv[2]; assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round); mkdirSync(out);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function json(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new TypeError("invalid verification fixture JSON", { cause }); } }
const prefix = BUILTIN_RESOURCES.sourceURL.replace("game-source.json", "");
const manifest = json(readFileSync("web/" + prefix + "manifest.json"));
const paths = ["web/src/content/builtinresources.generated.js", "web/" + prefix + "manifest.json", ...manifest.assets.map((a) => "web/" + a.url)];
const before = Object.fromEntries(paths.map((p) => [p, sha(readFileSync(p))]));
const store = mkdtempSync(join(tmpdir(), "current-workspace-")), server = await startEditorServer(0, store);
const origin = `http://127.0.0.1:${server.address().port}`, realFetch = globalThis.fetch;
let stage = "review-status negative controls";
async function call(path, body, expected = 200) {
  stage = path;
  const response = await realFetch(origin + path, body === undefined ? { headers: { connection: "close" } } : { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data).slice(0, 250)); return data;
}
let browser; const errors = [], forbidden = [], checks = [];
try {
  for (const bad of ["PENDING", undefined]) {
    assert.throws(() => readInstalledEditorSource(BUILTIN_RESOURCES, (p) => {
      assert.equal(p, prefix + "manifest.json"); return Buffer.from(JSON.stringify({ ...manifest, visualReview: bad }));
    }));
  }
  await call("/api/copy", { gameId: "current-workspace", kind: "full", ownerId: "owned-test" });
  let draft = await call("/api/draft?game=current-workspace");
  assert.equal(draft.sourceRef.revision, BUILTIN_RESOURCES.world.revision); assert.equal(draft.chapterOrder.length, 20);
  assert.equal(draft.map.waterGroups.length, 161); assert.equal(draft.map.waterGroups.filter((g) => g.showOnMinimap).length, 51);
  const baseline = compileGameSource(draft, sha), compiled1 = await call("/api/compile", { gameId: draft.gameId });
  assert.equal(compiled1.compatibilityAssetMode, "source-explicit"); assert.equal(compiled1.buildFormat, EDITOR_BUILD_FORMAT);
  for (const asset of compiled1.minimapAssets) {
    stage = asset.url;
    const response = await realFetch(origin + asset.url, { headers: { connection: "close" } }); assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha(bytes), asset.sha256);
    assert.deepEqual(bytes, readFileSync("web/" + prefix + asset.path));
  }
  const group = draft.map.waterGroups.find((g) => g.id.startsWith("river-") && g.showOnMinimap); assert.ok(group);
  group.showOnMinimap = false;
  const changed = compileGameSource(draft, sha);
  for (const key of ["terrainBytes", "geography", "roadMask", "roadGraph", "roadCost", "roadOffsetBytes"]) assert.deepEqual(changed[key], baseline[key], key);
  assert.notDeepEqual(changed.minimapGeography, baseline.minimapGeography); assert.notEqual(changed.sourceDigest, baseline.sourceDigest);
  await call("/api/save", { gameId: draft.gameId, map: draft.map });
  const compiled2 = await call("/api/compile", { gameId: draft.gameId });
  assert.notEqual(compiled1.minimap["250x167"], compiled2.minimap["250x167"]);
  for (const chapter of draft.chapterOrder) {
    const pack = await call("/api/trial-pack?game=current-workspace&revision=2&chapter=" + encodeURIComponent(chapter));
    const allowed = new Set(pack.manifest.assets.map((a) => a.url));
    globalThis.fetch = (url) => { assert.ok(allowed.has(String(url))); return realFetch(origin + url, { headers: { connection: "close" } }); };
    try {
      const ready = await prepareTrialScenario(pack); assert.equal(ready.scenario.cities.length, 192);
      const saved = json(Buffer.from(JSON.stringify({ state: ready.scenario, webMeta: snapshotScenarioAssembly({ scenario: ready.scenario, scenarioIdx: 0, content: ready.content, world: ready.world }) })));
      const restored = await prepareScenario({ raw: saved.state, idx: 0, mode: "restore", content: ready.content, world: ready.world, ...readSavedAssembly(saved) });
      assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: 0, content: ready.content, world: ready.world }), saved.webMeta);
    } finally { globalThis.fetch = realFetch; }
  }
  await call("/api/save", { gameId: draft.gameId, expectedRevision: "1", map: draft.map }, 400);
  const bad = structuredClone(draft.map); bad.waterGroups[0].memberIds.push("not-a-member");
  await call("/api/save", { gameId: draft.gameId, map: bad }, 400);
  draft = await call("/api/draft?game=current-workspace"); assert.equal(draft.localModel.draftRevision, "2");
  const imagePath = join(store, draft.gameId, "build", "2", TRIAL_COMPILER_REVISION, EDITOR_BUILD_FORMAT, "minimap_large.png"), bytes = readFileSync(imagePath);
  writeFileSync(imagePath, "bad"); await call("/api/trial-pack?game=current-workspace&revision=2", undefined, 400); writeFileSync(imagePath, bytes);
  checks.push("current source and 38 hashes/no fallback; source-explicit helpers; two exact PNGs; switch only display;20 fresh/JSON; member/PNG/stale-local-revision rejects");
  const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== origin || /save\.dat|\/mmap_map\.bin$|^\/map_atlas_|\.dragon-analysis/i.test(u.pathname)) { forbidden.push(u.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico")) errors.push(m.text()); });
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => { window.__idbOpens = 0; const original = indexedDB.open.bind(indexedDB); indexedDB.open = (...args) => { window.__idbOpens++; return original(...args); }; });
  await page.goto(origin + "/"); await page.fill("#new-game", "home-copy"); await page.click("#minimal-copy");
  await page.waitForFunction(() => document.getElementById("copy-status").textContent.startsWith("已複製"));
  assert.equal((await call("/api/draft?game=home-copy")).chapterOrder.length, 0);
  await page.goto(origin + "/studio?game=current-workspace"); await page.waitForFunction(() => window.__studio != null);
  const selected = draft.map.waterGroups.find((g) => g.id.startsWith("river-") && g.showOnMinimap); assert.ok(selected);
  await page.selectOption("#group-list", selected.id); assert.equal(await page.isChecked("#show-minimap"), true);
  const beforeCanvas = await page.locator("#mini").evaluate((c) => c.toDataURL());
  const beforeMap = await page.evaluate(() => { const map = window.__studio.draft.map; return { roads: JSON.stringify(map.roads), base: JSON.stringify(map.base), decorations: JSON.stringify(map.decorations), placements: JSON.stringify(map.placements) }; });
  await page.uncheck("#show-minimap");
  assert.notEqual(await page.locator("#mini").evaluate((c) => c.toDataURL()), beforeCanvas);
  assert.deepEqual(await page.evaluate(() => { const map = window.__studio.draft.map; return { roads: JSON.stringify(map.roads), base: JSON.stringify(map.base), decorations: JSON.stringify(map.decorations), placements: JSON.stringify(map.placements) }; }), beforeMap);
  assert.equal(await page.evaluate(() => window.__studio.dirty), true);
  assert.equal((await call("/api/draft?game=current-workspace")).map.waterGroups.find((g) => g.id === selected.id).showOnMinimap, true, "unsaved preview cannot write server");
  await page.click("#locate-group"); await page.click("#save"); await page.waitForFunction(() => !window.__studio.busy && document.getElementById("status").textContent.startsWith("已保存修訂"));
  await page.reload(); await page.waitForFunction(() => window.__studio != null); await page.selectOption("#group-list", selected.id);
  assert.equal(await page.isChecked("#show-minimap"), false);
  await page.click("#compile"); await page.waitForFunction(() => !window.__studio.busy && document.querySelectorAll("#compiled-minis img").length === 2);
  await page.waitForFunction(() => [...document.querySelectorAll("#compiled-minis img")].every((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: join(out, "workspace.png") });
  await page.setViewportSize({ width: 1024, height: 768 });
  // Resize handler/paint is asynchronous; assert the settled real layout,
  // not the previous viewport's transient intrinsic canvas dimensions.
  await page.waitForFunction(() => document.querySelector("aside").getBoundingClientRect().right <= innerWidth);
  const bounds = await page.locator("aside").boundingBox(); assert.ok(bounds.x + bounds.width <= 1024);
  assert.equal(await page.evaluate(() => window.__idbOpens), 0); assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  checks.push("actual group selector/checkbox/locate; local preview/source unchanged; save/reload/compiled PNGs;1280/1024;IDB0/browser0errors");
  for (const [p, hash] of Object.entries(before)) assert.equal(sha(readFileSync(p)), hash, p);
  const tools = ["tools/editor_builtin_source.mjs", "tools/editor_server.mjs", "tools/minimap_png.mjs", "web/src/editor/studio.js", "web/editor-studio.html", "tools/verify_editor_unified_workspace.mjs"];
  writeFileSync(join(out, "receipt.json"), JSON.stringify({ result: "PASS-SCOPED", sourceHashes: before, toolHashes: Object.fromEntries(tools.map((p) => [p, sha(readFileSync(p))])), checks,
    chapters:20, currentRevision:BUILTIN_RESOURCES.world.revision, artifactPaths:["workspace.png"],
    coverageLimits:"Local fixed-domain integration only, no account/backend/release/full App trial or arbitrary topology certification; screenshot not new art approval" }, null, 2) + "\n");
  process.stdout.write("PASS scoped current unified workspace / 20 fresh+JSON / groups+two real PNGs / isolated browser\n");
} catch (error) {
  writeFileSync(join(out, "failure.json"), JSON.stringify({ stage, error:String(error), stack:error.stack, cause:String(error.cause ?? ""), errors, forbidden, checks }, null, 2) + "\n"); throw error;
} finally { globalThis.fetch = realFetch; await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
