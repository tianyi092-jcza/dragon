// Reviewed local-only management proof. Reads current Web assets/modules;
// writes only declared fresh evidence + OS-owned temp store. No SAVE/profile.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const root = fileURLToPath(new URL("../", import.meta.url)), round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const output = join(root, ".dragon-analysis/editor-phase", round); mkdirSync(output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function parse(bytes) { try { return JSON.parse(String(bytes)); } catch (cause) { throw new Error("invalid owned management fixture JSON", { cause }); } }
const prefix = BUILTIN_RESOURCES.sourceURL.replace(/game-source\.json$/, ""), manifest = parse(readFileSync(join(root, "web", prefix, "manifest.json")));
const resourceSnapshot = () => Object.fromEntries(["manifest.json", ...manifest.assets.map((a) => a.path)].map((p) => [p, sha(readFileSync(join(root, "web", prefix, p)))]));
const before = resourceSnapshot(), sourceHashes = {};
for (const p of ["tools/editor_server.mjs", "tools/verify_editor_game_management.mjs", "web/editor-games.html", "web/src/editor/games.js", "web/src/editor/gamemetadata.js", "web/src/content/builtinresources.generated.js"])
  sourceHashes[p] = sha(readFileSync(join(root, p)));
const store = mkdtempSync(join(tmpdir(), "editor-game-management-")), server = await startEditorServer(0, store);
const origin = `http://127.0.0.1:${server.address().port}`;
async function call(path, body, status = 200) {
  const init = { headers: { connection: "close" } };
  if (body !== undefined) { init.method = "POST"; init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  const response = await fetch(origin + path, init), data = await response.json(); assert.equal(response.status, status, data.error); return data;
}
const draft = () => call("/api/draft?game=managed");
const metadata = (name, introduction = "") => ({ name, introduction });
let browser;
const errors = [], forbidden = [], expectedConsoleErrors = [], expectedHTTPConflicts = [];
try {
  await call("/api/copy", { gameId: "managed", kind: "full", ownerId: "local-test", metadata: metadata("初始資料", "原說明") });
  const original = await draft(); assert.equal(original.localModel.createdAt, original.localModel.modifiedAt);
  assert.match(original.localModel.createdAt, /^\d{4}-\d\d-\d\dT.*Z$/);
  const first = await call("/api/compile", { gameId: "managed", expectedRevision: "1" });
  const oldURL = "/api/trial-pack?game=managed&revision=1&chapter=" + encodeURIComponent(original.chapterOrder[0]);
  const oldPack = await call(oldURL);
  await call("/api/copy", { gameId: "other", kind: "minimal", ownerId: "local-test", metadata: metadata("保留名稱") });
  for (const body of [{ gameId: "wolong-builtin", expectedRevision: "1", metadata: metadata("改原件") },
    { gameId: "managed", metadata: metadata("缺少修訂") },
    { gameId: "managed", expectedRevision: "99", metadata: metadata("陳舊") },
    { gameId: "managed", expectedRevision: "1", metadata: metadata("保留名稱") },
    { gameId: "managed", expectedRevision: "1", metadata: metadata("123456789") },
    { gameId: "managed", expectedRevision: "1", metadata: { ...metadata("合法"), ownerId: "spoof" } },
    { gameId: "managed", expectedRevision: "1", metadata: metadata("合法"), createdAt: "spoof" }]) {
    await call("/api/metadata", body, 400); assert.deepEqual(await draft(), original);
  }
  const renamed = await call("/api/metadata", { gameId: "managed", expectedRevision: "1", metadata: metadata(" e\u0301 ", " 简体保留 ") });
  assert.equal(renamed.metadata.name, "é"); assert.equal(renamed.metadata.introduction, "简体保留"); assert.equal(renamed.draftRevision, "2");
  const afterRename = await draft(), expected = structuredClone(original);
  expected.metadata = renamed.metadata; expected.localModel.draftRevision = "2"; expected.localModel.modifiedAt = renamed.modifiedAt;
  assert.deepEqual(afterRename, expected, "only display metadata/revision/server modified time may change");
  const second = await call("/api/compile", { gameId: "managed", expectedRevision: "2" });
  assert.notEqual(first.identity.sourceDigest, second.identity.sourceDigest);
  assert.deepEqual([...first.assets, ...first.minimapAssets].map((a) => [a.assetId, a.sha256]), [...second.assets, ...second.minimapAssets].map((a) => [a.assetId, a.sha256]));
  assert.deepEqual(await call(oldURL), oldPack, "old snapshot stays immutable after rename");
  await call("/api/save", { gameId: "managed", expectedRevision: "1", map: original.map }, 400);
  assert.deepEqual(await draft(), afterRename);
  // Existing drafts may lack dates: display unknown, don't fabricate file times.
  const legacy = await call("/api/draft?game=other"); delete legacy.localModel.createdAt; delete legacy.localModel.modifiedAt;
  writeFileSync(join(store, "other", "gamesource.json"), JSON.stringify(legacy));
  const info = await call("/api/game-info?game=other"); assert.equal(info.createdAt, null); assert.equal(info.modifiedAt, null);
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(() => { window.__idbOpens = 0; indexedDB.open = () => { window.__idbOpens++; throw new Error("formal storage forbidden"); }; });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat/i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (m.location().url === origin + "/api/metadata" && /server responded with a status of 400/.test(m.text())) expectedConsoleErrors.push(m.text());
    else errors.push(m.text());
  });
  page.on("response", (r) => { if (r.status() === 400 && r.url() === origin + "/api/metadata") expectedHTTPConflicts.push(r.status()); });
  await page.goto(origin + "/"); await page.locator('[data-game="managed"]').click();
  await page.locator("#edit-name").fill("管理副本"); await page.locator("#edit-introduction").fill("<img src=x>");
  await page.locator("#save-metadata").click(); await page.locator("#status").filter({ hasText: "資料已保存" }).waitFor();
  assert.equal((await draft()).metadata.introduction, "<img src=x>"); assert.equal(await page.locator("#games img, #details img").count(), 0);
  await page.reload(); await page.locator('[data-game="managed"]').click(); assert.equal(await page.locator("#edit-name").inputValue(), "管理副本");
  assert.ok((await page.locator("#details").textContent()).includes(BUILTIN_RESOURCES.world.revision));
  // Concurrent management vs map save: keep unsent text and require reload.
  const active = await draft(); await call("/api/save", { gameId: "managed", expectedRevision: active.localModel.draftRevision });
  await page.locator("#edit-name").fill("保留輸入"); await page.locator("#save-metadata").click();
  await page.locator("#status").filter({ hasText: "草稿修訂衝突" }).waitFor();
  assert.equal(await page.locator("#edit-name").inputValue(), "保留輸入");
  page.once("dialog", (dialog) => dialog.accept()); await page.locator("#reload-metadata").click();
  await page.waitForFunction(() => document.querySelector("#edit-name").value === "管理副本");
  // Corrupt owned draft is isolated in the list; don't hide valid games.
  mkdirSync(join(store, "broken")); writeFileSync(join(store, "broken", "gamesource.json"), "not JSON");
  await page.locator("#refresh").click(); await page.locator("#games").filter({ hasText: "broken" }).waitFor();
  assert.equal(await page.locator('[data-game="managed"]').count(), 1);
  assert.equal(await page.evaluate(() => window.__idbOpens), 0);
  await page.screenshot({ path: join(output, "game-management.png") });
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.deepEqual(resourceSnapshot(), before);
  assert.deepEqual(expectedHTTPConflicts, [400]); assert.equal(expectedConsoleErrors.length, 1, "only the deliberate stale form rejection may log a resource error");
  for (const [p, hash] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(join(root, p))), hash);
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "E02-local-game-management", result: "PASS-SCOPED", sourceHashes,
    resourceHashes: before, fixtureId: BUILTIN_RESOURCES.world.revision, toolVersion: process.version,
    negativeControls: 9, identityStable: true, nativeAndMinimapAssetsUnchanged: 6, oldSnapshotUnchanged: true,
    errors, forbidden, expectedConsoleErrors, expectedHTTPConflicts, idbOpens: 0, artifactPaths: ["game-management.png"],
    coverageLimits: "Local placeholder ownership/draft names only; not accounts, release-name registry, durable CAS/copy transactions, deletion, entity editing or rule mechanism certification" }, null, 2) + "\n");
  process.stdout.write("PASS local management UI/API/metadata-only native parity, nine refusal controls, old snapshot and IDB=0\n");
} catch (error) { writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden }, null, 2) + "\n"); throw error; }
finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
