// E-03 author UI/service gate. Only current readonly Web pack + owned output,
// temp file store/loopback/Chromium context. No DOS/profile/formal save access.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { startEditorServer } from "./editor_server.mjs";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { prepareTrialScenario } from "../web/src/content/authoring/trialruntime.js";
import { prepareScenario, readSavedAssembly, snapshotScenarioAssembly } from "../web/src/game/scenarioassembly.js";
const round = process.argv[2]; assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const output = join(".dragon-analysis/editor-phase", round); mkdirSync(output);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function json(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new TypeError("invalid author verification JSON", { cause }); } }
const prefix = BUILTIN_RESOURCES.sourceURL.replace("game-source.json", ""), manifest = json(readFileSync("web/" + prefix + "manifest.json"));
const paths = ["web/src/content/builtinresources.generated.js", "web/" + prefix + "manifest.json", ...manifest.assets.map((a) => "web/" + a.url)];
const sourceHashes = Object.fromEntries(paths.map((p) => [p, sha(readFileSync(p))]));
const store = mkdtempSync(join(tmpdir(), "editor-component-")), server = await startEditorServer(0, store);
const origin = `http://127.0.0.1:${server.address().port}`, originalFetch = globalThis.fetch;
const errors = [], forbidden = [], dialogs = [], checks = []; let browser, stage = "copy";
async function call(path, body, code = 200) {
  const init = { headers: { connection: "close" } };
  if (body !== undefined) { init.method = "POST"; init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  const response = await originalFetch(origin + path, init), data = await response.json(); assert.equal(response.status, code, JSON.stringify(data).slice(0, 300)); return data;
}
try {
  await call("/api/copy", { gameId: "component-test", ownerId: "owned-test", kind: "full" });
  const initial = await call("/api/draft?game=component-test"), initialCompiled = compileGameSource(initial, sha);
  assert.equal(initial.map.decorations.find((d) => d.x === 10 && d.y === 10).waterClass, undefined);
  assert.equal(initial.map.decorations.find((d) => d.x === 11 && d.y === 10).waterClass, undefined);
  const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", (route) => { const u = new URL(route.request().url());
    if (u.origin !== origin || /save\.dat|\/mmap_map\.bin$|^\/map_atlas_|\.dragon-analysis/i.test(u.pathname)) { forbidden.push(u.href); return route.abort(); } return route.continue(); });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico")) errors.push(m.text()); });
  page.on("dialog", (d) => { dialogs.push(d.message()); return d.accept(); });
  await page.addInitScript(() => { window.__componentIDB = 0; const open = indexedDB.open.bind(indexedDB); indexedDB.open = (...args) => { window.__componentIDB++; return open(...args); }; });
  await page.goto(origin + "/studio?game=component-test"); await page.waitForFunction(() => window.__studio != null);
  async function point(x, y) { await page.locator("#cv").scrollIntoViewIfNeeded(); const box = await page.locator("#cv").boundingBox();
    const cam = await page.evaluate(() => window.__studio.cam); const px = box.x + 1 + x * 16 + 8 - cam.x, py = box.y + 1 + y * 16 + 8 - cam.y;
    assert.ok(px > box.x && px < box.x + box.width && py > box.y && py < box.y + box.height);
    await page.mouse.click(px, py); }
  stage = "actual rectangle select and captured multi-cell definition";
  await page.click('[data-tool="select-area"]'); await page.locator("#cv").scrollIntoViewIfNeeded();
  let box = await page.locator("#cv").boundingBox(); await page.mouse.move(box.x + 1 + 10 * 16 + 2, box.y + 1 + 10 * 16 + 2); await page.mouse.down();
  await page.mouse.move(box.x + 1 + 11 * 16 + 14, box.y + 1 + 10 * 16 + 14); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__studio.selectedIds.size), 2);
  await page.click("#materials summary"); await page.fill("#material-name", "雙格素材測試"); await page.click("#capture-material");
  const definition = await page.locator("#material-select").inputValue(); assert.match(definition, /^material-/);
  const def = await page.evaluate((id) => window.__studio.draft.componentDefinitions[id], definition); assert.equal(def.footprint.length, 2);
  assert.deepEqual(def.variants.original.tiles.map((p) => p[2]), [initialCompiled.terrainBytes[3850], initialCompiled.terrainBytes[3851]]);
  const capturedMap = await page.evaluate(() => window.__studio.draft.map); assert.deepEqual(capturedMap, initial.map);
  stage = "real material drag/drop and whole-footprint nonanchor selection";
  await page.selectOption("#material-water", "river");
  await page.locator("#material-preview").dragTo(page.locator("#cv"), { targetPosition: { x: 1 + 20 * 16 + 8, y: 1 + 20 * 16 + 8 } });
  const first = await page.evaluate(() => window.__studio.draft.map.decorations.at(-1)); assert.equal(first.definitionRef, definition); assert.equal(first.x, 20); assert.equal(first.y, 20);
  await page.click('[data-tool="inspect"]'); await point(21, 20);
  assert.deepEqual(await page.evaluate(() => [...window.__studio.selectedIds]), [first.id]);
  await page.click('[data-tool="material"]'); await point(24, 20);
  const second = await page.evaluate(() => window.__studio.draft.map.decorations.at(-1)); assert.notEqual(first.id, second.id);
  await page.click('[data-tool="inspect"]'); await point(20, 20); await page.uncheck("#show-minimap");
  await page.keyboard.down("Shift"); try { await point(24, 20); } finally { await page.keyboard.up("Shift"); }
  assert.equal(await page.evaluate(() => window.__studio.selectedIds.size), 2);
  stage = "create/split/merge physical water groups via actual UI";
  const nativeBefore = await page.evaluate(() => { const m = window.__studio.draft.map; return { base:m.base, decorations:m.decorations, roads:m.roads, placements:m.placements }; });
  await page.click("#group-edit summary"); await page.fill("#group-name", "合成河段"); await page.uncheck("#new-group-visible"); await page.click("#create-group");
  let group = await page.evaluate(() => window.__studio.draft.map.waterGroups.find((g) => g.id === window.__studio.groupId));
  assert.deepEqual(new Set(group.memberIds), new Set([first.id, second.id])); assert.equal(group.showOnMinimap, false); const joinedId = group.id;
  await point(20, 20); await page.fill("#group-name", "拆出河段"); await page.click("#split-group");
  group = await page.evaluate(() => window.__studio.draft.map.waterGroups.find((g) => g.id === window.__studio.groupId)); assert.equal(group.showOnMinimap, false); assert.deepEqual(group.memberIds, [first.id]);
  await page.selectOption("#group-merge-list", [joinedId]); await page.fill("#group-name", "合併河段"); await page.check("#new-group-visible"); await page.click("#merge-groups");
  group = await page.evaluate(() => window.__studio.draft.map.waterGroups.find((g) => g.id === window.__studio.groupId));
  assert.equal(group.showOnMinimap, true); assert.deepEqual(new Set(group.memberIds), new Set([first.id, second.id])); const finalGroup = group.id;
  assert.deepEqual(await page.evaluate(() => { const m = window.__studio.draft.map; return { base:m.base, decorations:m.decorations, roads:m.roads, placements:m.placements }; }), nativeBefore);
  checks.push("actual rectangle/2-cell capture/atlas drag/whole nonanchor selection; physical group create/split inherited false/merge explicit true; native inputs unchanged by groups");
  stage = "unknown underlay refusal and explicit base replacement";
  await page.click('[data-tool="del"]'); await point(10, 10);
  await page.click("#save"); await page.waitForFunction(() => !window.__studio.busy && document.getElementById("status").textContent.startsWith("已保存修訂"));
  const missing = await call("/api/draft?game=component-test"); assert.equal(missing.map.base.terrainRef[3850], null);
  assert.throws(() => compileGameSource(missing, sha), /UNKNOWN_UNDERLAY/); await call("/api/compile", { gameId:"component-test" }, 400);
  await page.locator("#layers button").filter({ hasText:"基本地圖" }).click(); await page.click("#lock"); await page.click('[data-tool="inspect"]'); await point(10, 10);
  await page.click("#base-edit summary"); await page.fill("#base-tile", "16"); await page.selectOption("#base-geography", "0"); await page.click("#fill-base");
  assert.equal(await page.evaluate(() => window.__studio.draft.map.base.terrainRef[3850]), 16); assert.ok(dialogs.some((t) => t.includes("明確補繪1格底層")));
  await page.click("#save"); await page.waitForFunction(() => !window.__studio.busy && document.getElementById("status").textContent.startsWith("已保存修訂"));
  await page.reload(); await page.waitForFunction(() => window.__studio != null);
  assert.equal(await page.evaluate((id) => window.__studio.draft.componentDefinitions[id].name, definition), "雙格素材測試");
  await page.selectOption("#group-list", finalGroup); assert.equal(await page.isChecked("#show-minimap"), true);
  await page.click("#compile"); await page.waitForFunction(() => !window.__studio.busy && document.querySelectorAll("#compiled-minis img").length === 2);
  await page.waitForFunction(() => [...document.querySelectorAll("#compiled-minis img")].every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: join(output,"component-workspace.png") });
  const saved = await call("/api/draft?game=component-test"), edited = compileGameSource(saved, sha);
  assert.equal(edited.terrainBytes[3850], 16); assert.deepEqual(edited.roadGraph, initialCompiled.roadGraph); assert.deepEqual(edited.roadCost, initialCompiled.roadCost); assert.deepEqual(edited.roadOffsetBytes, initialCompiled.roadOffsetBytes);
  await call("/api/save", { gameId:"component-test", expectedRevision:"1", map:saved.map, componentDefinitions:saved.componentDefinitions }, 400);
  const badDefs = structuredClone(saved.componentDefinitions); badDefs[definition].ruleRecipeRef = "guessed-recipe";
  await call("/api/save", { gameId:"component-test", expectedRevision:saved.localModel.draftRevision, map:saved.map, componentDefinitions:badDefs }, 400);
  const invalidNew = { ...saved.componentDefinitions, bad: { ...def, id:"bad", ruleRecipeRef:"guessed-recipe" } };
  await call("/api/save", { gameId:"component-test", expectedRevision:saved.localModel.draftRevision, componentDefinitions:invalidNew }, 400);
  assert.equal((await call("/api/draft?game=component-test")).localModel.draftRevision, saved.localModel.draftRevision);
  checks.push("unknown preserved and strict compile refuses; explicit confirmed 1-cell fill/other cells retained; definitions+groups survive save/reopen; both PNGs; stale/overwrite/unused bad recipe rejects");
  stage = "20 edited-source native fresh and production JSON restore";
  for (const chapter of saved.chapterOrder) {
    const pack = await call(`/api/trial-pack?game=component-test&revision=${saved.localModel.draftRevision}&chapter=${encodeURIComponent(chapter)}`);
    const allowed = new Set(pack.manifest.assets.map((a) => a.url)); globalThis.fetch = (url) => { assert.ok(allowed.has(String(url))); return originalFetch(origin + url, { headers: { connection:"close" } }); };
    try { const ready = await prepareTrialScenario(pack); assert.equal(ready.scenario.cities.length, 192);
      const jsonSaved = json(Buffer.from(JSON.stringify({ state:ready.scenario, webMeta:snapshotScenarioAssembly({ scenario:ready.scenario, scenarioIdx:0, content:ready.content, world:ready.world }) })));
      const restored = await prepareScenario({ raw:jsonSaved.state, idx:0, mode:"restore", content:ready.content, world:ready.world, ...readSavedAssembly(jsonSaved) });
      assert.deepEqual(snapshotScenarioAssembly({ scenario:restored.scenario, scenarioIdx:0, content:ready.content, world:ready.world }), jsonSaved.webMeta);
    } finally { globalThis.fetch = originalFetch; }
  }
  assert.equal(await page.evaluate(() => window.__componentIDB), 0); assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  await page.setViewportSize({ width:1024, height:768 }); await page.waitForFunction(() => document.querySelector("aside").getBoundingClientRect().right <= innerWidth);
  for (const [p, hash] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(p)), hash, p);
  const tools = ["tools/verify_editor_component_browser.mjs", "tools/editor_server.mjs", "tools/editor_builtin_source.mjs", "tools/minimap_png.mjs", "web/src/editor/componenttools.js", "web/src/editor/studio.js", "web/editor-studio.html", "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/trialcompile.js"];
  writeFileSync(join(output,"receipt.json"), JSON.stringify({ result:"PASS-SCOPED", currentRevision:BUILTIN_RESOURCES.world.revision, sourceHashes,
    toolHashes:Object.fromEntries(tools.map((p) => [p,sha(readFileSync(p))])), chapters:20, checks, errors, forbidden, dialogs, artifactPaths:["component-workspace.png"],
    coverageLimits:"Local fixed-domain author workflow only. No accounts/durable backend/fullApptrial/publish/arbitrary topology or native formula certification; screenshot not new style approval." },null,2) + "\n");
  process.stdout.write("PASS scoped component workspace / actual multi-cell+groups+base /20 fresh+JSON / current39 unchanged\n");
} catch (error) { writeFileSync(join(output,"failure.json"),JSON.stringify({ stage,error:String(error),stack:error.stack,errors,forbidden,checks },null,2)+"\n"); throw error;
} finally { globalThis.fetch = originalFetch; await browser?.close(); await new Promise((r) => server.close(r)); }
