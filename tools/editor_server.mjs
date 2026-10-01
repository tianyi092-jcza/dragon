// Editor local service (new port; default 8322, --port N overrides).
// E-02 loop over local file store (gitignored): copy -> save draft ->
// validate -> compile trial manifest. No auth, no multi-user, no real
// persistence guarantees (E-01/E-05/E-06 are server scope, recorded as
// boundary, not implemented here). Draft/model rules enforced: GameSource
// validation, decimal draftRevision bump per successful write, digest
// recompute, mapcompile + flag/port-shape gates via gamesource validation.
// Trial isolation: this service never touches formal save stores; the
// compiled chapter state loads through the production loader (proven by
// verify_gamesource_copy.mjs). Usage: node tools/editor_server.mjs [--port N]
// [--store <dir>] [--serve] (no --serve runs the self-check and exits).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { canonicalDigest, copyBuiltinGame, validateGameSource } from "../web/src/content/authoring/gamesource.js";
import { compileTrialSource, TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { renderMinimapPixels, MINIMAP_SIZES } from "../web/src/content/authoring/minimap.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { encodeMinimapPNG } from "./minimap_png.mjs";
import { validateLibraryAdditions } from "../web/src/editor/componenttools.js";

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const storeArg = args.indexOf("--store");
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 8322;
const STORE_DEFAULT = storeArg >= 0 ? resolve(args[storeArg + 1]) : resolve(".dragon-analysis/editor-phase/store");
let STORE = STORE_DEFAULT;
const SERVE = args.includes("--serve");
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new RangeError("port must be 1024..65535");

const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const repoRoot = new URL("..", import.meta.url);

function gameDir(gameId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(gameId)) throw new RangeError("bad gameId");
  const dir = join(STORE, gameId);
  if (!dir.startsWith(STORE + sep)) throw new RangeError("gameId escapes store");
  return dir;
}
function loadDraft(gameId) {
  let raw;
  try {
    raw = readFileSync(join(gameDir(gameId), "gamesource.json"), "utf-8");
  } catch (error) {
    throw new RangeError(`unknown game draft: ${gameId}`, { cause: error });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new RangeError(`corrupt game draft: ${gameId}`, { cause: error });
  }
}
function storeDraft(game, draft = false) {
  const diagnostics = validateGameSource(game, { draft });
  const dir = gameDir(game.gameId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "gamesource.json"), `${JSON.stringify(game)}\n`);
  return { game, diagnostics };
}
function builtinSource() { return readInstalledEditorSource(); }

export const EDITOR_BUILD_FORMAT = "studio-unified-1";
const BUILD_FILES = { terrain: "terrain.bin", roadGraph: "roads.json", roadCost: "road_cost.bin", roadOffset: "road_offset.json",
  minimapBase: "minimap_base.png", minimapLarge: "minimap_large.png" };
function buildDir(gameId, revision) {
  if (!/^[1-9]\d*$/.test(revision ?? "")) throw new RangeError("bad build revision");
  return join(gameDir(gameId), "build", revision, TRIAL_COMPILER_REVISION, EDITOR_BUILD_FORMAT);
}
function readBuild(gameId, revision) {
  const dir = buildDir(gameId, revision);
  if (!existsSync(join(dir, "manifest.json"))) throw new RangeError("compile before trial-pack");
  let manifest, snapshot;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    snapshot = JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf-8"));
  } catch (error) {
    throw new RangeError("corrupt compiled snapshot", { cause: error });
  }
  if (manifest.buildFormat !== EDITOR_BUILD_FORMAT || manifest.compilerRevision !== TRIAL_COMPILER_REVISION ||
      manifest.identity?.gameId !== gameId || manifest.identity.draftRevision !== revision ||
      canonicalDigest(snapshot, sha256hex) !== manifest.identity.sourceDigest)
    throw new RangeError("compiled snapshot identity mismatch");
  for (const [assetId, path] of Object.entries(BUILD_FILES)) {
    const asset = [...manifest.assets, ...manifest.minimapAssets].find((a) => a.assetId === assetId);
    const bytes = readFileSync(join(dir, path));
    if (asset?.path !== path || asset.byteLength !== bytes.length || asset.sha256 !== sha256hex(bytes))
      throw new RangeError(`compiled asset integrity mismatch: ${assetId}`);
  }
  return { dir, manifest, snapshot };
}

// Values embedded in HTML scripts must not be able to terminate the script.
const scriptJSON = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const WEB_ROOT = new URL("../web/", import.meta.url);
const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".png": "image/png", ".bin": "application/octet-stream",
  ".mp3": "audio/mpeg", ".txt": "text/plain",
};
async function serveWebFile(pathname, res) {
  // Same-origin engine + assets for the in-browser trial (contained).
  let rel = decodeURIComponent(pathname);
  if (rel === "/index.html") throw new RangeError("game shell not served here");
  const file = new URL(`.${rel}`, WEB_ROOT);
  const root = new URL("../web/", import.meta.url).pathname;
  if (!file.pathname.startsWith(root)) throw new RangeError("path escapes web root");
  const { readFile } = await import("node:fs/promises");
  let data;
  try {
    data = await readFile(file);
  } catch (error) {
    throw new RangeError(`no such asset: ${rel}`, { cause: error });
  }
  const dot = rel.lastIndexOf(".");
  res.writeHead(200, { "content-type": MIME[rel.slice(dot)] ?? "application/octet-stream" });
  res.end(data);
}

const routes = {
  "GET /": (res) => html(res, `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>臥龍傳編輯器（本地）</title></head><body><h1>臥龍傳編輯器（本地限定域）</h1><p>原件唯讀；由當前固定修訂複製。無帳戶／正式發布，僅供本地測試。</p><label>新遊戲ID <input id="new-game" maxlength="128"></label><button id="full-copy">完整測試複製</button><button id="minimal-copy">僅複製地圖及中立據點基礎</button><p id="copy-status"></p><ul id="games"></ul><script>
async function list(){const r=await fetch("/api/games");const data=await r.json();const ul=document.getElementById("games");ul.replaceChildren();for(const id of data.games){const li=document.createElement("li"),a=document.createElement("a");a.textContent=id;a.href="/studio?game="+encodeURIComponent(id);li.append(a);ul.append(li)}}
for(const [id,kind] of [["full-copy","full"],["minimal-copy","minimal"]])document.getElementById(id).onclick=async()=>{const buttons=["full-copy","minimal-copy"].map(x=>document.getElementById(x));buttons.forEach(b=>b.disabled=true);try{const r=await fetch("/api/copy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({gameId:document.getElementById("new-game").value,kind,ownerId:"local-test"})});const data=await r.json();document.getElementById("copy-status").textContent=r.ok?"已複製；請從下方開啟工作台":"複製被拒絕："+data.error;if(r.ok)await list()}catch(e){document.getElementById("copy-status").textContent="請求失敗："+e.message}finally{buttons.forEach(b=>b.disabled=false)}};
list().catch(e=>{document.getElementById("copy-status").textContent="讀取失敗："+e.message});</script></body></html>`),
  "GET /api/games": (res) => {
    mkdirSync(STORE, { recursive: true });
    const games = readdirSync(STORE, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => existsSync(join(STORE, name, "gamesource.json")));
    json(res, { games });
  },
  // Read-only draft fetch (editors load-then-save; writes go via /api/save).
  "GET /api/draft": (res, _body, query) => {
    json(res, loadDraft(query.get("game")));
  },
  "POST /api/copy": (res, body) => {
    const { gameId, ownerId, kind } = body ?? {};
    const source = builtinSource();
    const game = copyBuiltinGame({ gameId, ownerId, kind, source }, sha256hex);
    game.assets.editorVisuals = source.editorAssets;
    if (kind === "full") game.metadata.name = "測試複製";
    if (existsSync(join(gameDir(game.gameId), "gamesource.json"))) throw new RangeError("game identity already exists");
    storeDraft(game);
    json(res, { gameId: game.gameId, draftRevision: game.localModel.draftRevision, digest: game.sourceRef.digest });
  },
  "POST /api/save": (res, body) => {
    const { gameId, map, componentDefinitions } = body ?? {};
    const game = loadDraft(gameId);
    // Single local process conditional guard, not a durable backend CAS.
    if (body.expectedRevision !== undefined && body.expectedRevision !== game.localModel.draftRevision)
      throw new RangeError("草稿修訂衝突：請重新載入後合併修改");
    if (componentDefinitions !== undefined) {
      validateLibraryAdditions(game, componentDefinitions);
      game.componentDefinitions = componentDefinitions;
    }
    if (map !== undefined) game.map = map;
    game.localModel.draftRevision = String(BigInt(game.localModel.draftRevision) + 1n);
    // Q14: structural violations still refuse the save; semantic断路
    // diagnostics are stored with the draft (publish/compile stays blocked).
    const { diagnostics } = storeDraft(game, true);
    json(res, { gameId, draftRevision: game.localModel.draftRevision, diagnostics });
  },
  "POST /api/validate": (res, body) => {
    const game = loadDraft(body?.gameId);
    const diagnostics = validateGameSource(game, { draft: true });
    json(res, { gameId: game.gameId, valid: diagnostics.length === 0, draftRevision: game.localModel.draftRevision, diagnostics });
  },
  "POST /api/compile": (res, body) => {
    const game = loadDraft(body?.gameId);
    validateGameSource(game);
    const compiled = compileTrialSource(game, sha256hex);
    const rev = game.localModel.draftRevision;
    const dir = buildDir(game.gameId, rev);
    if (existsSync(join(dir, "manifest.json"))) {
      const previous = readBuild(game.gameId, rev);
      if (previous.manifest.identity.sourceDigest !== compiled.sourceDigest)
        throw new RangeError("cannot overwrite compiled snapshot");
      json(res, previous.manifest);
      return;
    }
    mkdirSync(dir, { recursive: true });
    const payloads = {
      terrain: Buffer.from(compiled.terrainBytes),
      roadGraph: Buffer.from(JSON.stringify(compiled.roadGraph)),
      roadCost: Buffer.from(compiled.roadCost),
      // Trusted tile-centroid visual table, fixed at compile; never a
      // native movement/search input, never inferred from author land/water.
      roadOffset: compiled.roadOffsetBytes ?? readFileSync(new URL("web/road_offset.json", repoRoot)),
    };
    const assets = Object.entries(payloads).map(([assetId, bytes]) => {
      const path = BUILD_FILES[assetId];
      writeFileSync(join(dir, path), bytes);
      let role = "legacy-grid-visual";
      if (assetId === "terrain") role = "rules-initial-terrain";
      if (assetId === "roadGraph") role = "native-road-v2";
      return { assetId, path, sha256: sha256hex(bytes), byteLength: bytes.length, role,
        url: `/api/trial-asset?game=${encodeURIComponent(game.gameId)}&revision=${rev}&digest=${compiled.sourceDigest}&asset=${assetId}` };
    });
    writeFileSync(join(dir, "snapshot.json"), JSON.stringify(game));
    const minimap = {}, minimapAssets = [];
    for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
      const { pixels } = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, compiled.width, compiled.height, size.w, size.h, 1);
      minimap[`${size.w}x${size.h}`] = sha256hex(Buffer.from(pixels));
      const assetId = name === "base" ? "minimapBase" : "minimapLarge", path = BUILD_FILES[assetId];
      const bytes = encodeMinimapPNG(pixels, size.w, size.h);
      writeFileSync(join(dir, path), bytes);
      minimapAssets.push({ assetId, path, sha256: sha256hex(bytes), byteLength: bytes.length, role: "automatic-minimap",
        url: `/api/trial-asset?game=${encodeURIComponent(game.gameId)}&revision=${rev}&digest=${compiled.sourceDigest}&asset=${assetId}` });
    }
    const manifest = {
      schemaVersion: 1,
      compilerRevision: TRIAL_COMPILER_REVISION,
      buildFormat: EDITOR_BUILD_FORMAT,
      compatibilityAssetMode: compiled.compatibilityAssetMode,
      ruleProfile: game.ruleProfile,
      identity: { gameId: game.gameId, draftRevision: rev, sourceDigest: compiled.sourceDigest,
        trialSnapshotId: `${game.gameId}@${rev}:${compiled.sourceDigest}` },
      world: { id: `${game.gameId}-world`, revision: compiled.sourceDigest,
        width: compiled.width, height: compiled.height, tileSize: 16 },
      chapters: game.chapterOrder,
      minimap,
      minimapAssets,
      assets,
    };
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    json(res, manifest);
  },
  // Immutable snapshot only: an explicit revision never reads the latest draft.
  "GET /api/trial-pack": (res, _body, query) => {
    const gameId = query.get("game");
    const rev = query.get("revision") ?? loadDraft(gameId).localModel.draftRevision;
    const { dir, manifest, snapshot } = readBuild(gameId, rev);
    const chapterId = query.get("chapter") || snapshot.chapterOrder[0] || null;
    if (chapterId != null && !snapshot.chapters[chapterId]) throw new RangeError(`unknown trial chapter: ${chapterId}`);
    json(res, { manifest, chapterId,
      terrainHex: readFileSync(join(dir, BUILD_FILES.terrain)).toString("hex"),
      chapter: chapterId == null ? null : snapshot.chapters[chapterId].state });
  },
  "GET /api/trial-asset": (res, _body, query) => {
    const { dir, manifest } = readBuild(query.get("game"), query.get("revision"));
    if (query.get("digest") !== manifest.identity.sourceDigest) throw new RangeError("trial asset snapshot mismatch");
    const assetId = query.get("asset");
    if (!Object.hasOwn(BUILD_FILES, assetId)) throw new RangeError("unknown trial asset");
    const bytes = readFileSync(join(dir, BUILD_FILES[assetId]));
    const media = assetId.startsWith("minimap") ? "image/png" : "application/octet-stream";
    res.writeHead(200, { "content-type": assetId === "roadGraph" || assetId === "roadOffset" ? "application/json" : media, "cache-control": "no-store" });
    res.end(bytes);
  },
  // Browser trial boot (harness-grade): same-origin engine, direct
  // prepare (no title, no App), IDB spy, 10 ticked days, report exposed
  // as window.__trial. Full App trial mode with neutered persistence is
  // the next step, not this page.
  "GET /trial": (res, _body, query) => {
    const game = query.get("game");
    const revision = query.get("revision") ?? loadDraft(game).localModel.draftRevision;
    const { snapshot } = readBuild(game, revision);
    const chapter = query.get("chapter") || snapshot.chapterOrder[0];
    if (!snapshot.chapters[chapter]) throw new RangeError("no compiled trial chapter");
    const sampleParts = String(query.get("sample") ?? "").split(",").map(Number);
    const sampleCell = sampleParts.length === 2 && sampleParts.every((v) => Number.isInteger(v)) ? sampleParts : null;
    html(res, `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>Trial</title></head><body><div id="trial">booting</div><script type="module">
window.__trial = { done: false };
window.__idbOpens = 0;
const origOpen = window.indexedDB ? window.indexedDB.open.bind(window.indexedDB) : null;
if (origOpen) window.indexedDB.open = (...a) => { window.__idbOpens++; return origOpen(...a); };
window.addEventListener("error", (e) => { window.__trial.error = String(e.message ?? e.error); });
const response = await fetch("/api/trial-pack?game=" + encodeURIComponent(${scriptJSON(game)}) + "&revision=" + ${scriptJSON(revision)} + "&chapter=" + encodeURIComponent(${scriptJSON(chapter)}));
if (!response.ok) throw new Error("compiled trial pack HTTP " + response.status);
const pack = await response.json();
if (!pack.chapter) throw new Error("no trial chapter");
const assembly = await import("/src/game/scenarioassembly.js");
const trialRuntime = await import("/src/content/authoring/trialruntime.js");
const ai = await import("/src/game/ai.js");
const clockMod = await import("/src/game/clock.js");
const rngMod = await import("/src/game/battle/originalrng.js");
const { scenario: sc, world, content, player: trialPlayer } = await trialRuntime.prepareTrialScenario(pack);
window.__trialContext = { sc, world, content }; // isolated harness diagnostics only
const app = { scenario: sc, scenarioIdx: 0, world, content,
  originalRng: new rngMod.OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
  battleView: null, engageTransition: null, gamebar: { syncClock() {} }, hud: { flashEvent() {} } };
// Production new-game 0x1B29->0x2BD9 (opens the event wheel; same call the
// blank live-tick harness makes). Without it the first hourly event pump
// stops on the missing divider.
ai.initializeStrategicDiplomacy(app);
app.clock = new clockMod.Clock({ startYear: 196, startMonth: 1, startDay: 1,
  onStrategicTick: (c) => ai.aiTick(app, { legionBatchStart: sc._legionBatchCursor ?? 0,
    cityIndex: sc._cityTickCursor ?? 0, hour: c.hour, runFactionTick: false }),
  onHour: () => { ai.tickStrategicWarEvents(app); ai.tickFactionStrategicState(app); } });
app.clock.strategicSpeed = 4;
for (let d = 0; d < 10; d++) for (let t = 0; t < 24 * 9; t++) {
  app.clock.advance(3.125);
  if (app.clock.hold || app._strategicBattleFailure) throw new Error("trial tick failed");
}
window.__trial = { done: true, date: [app.clock.year, app.clock.month, app.clock.day],
  cities: sc.cities.length, idbOpens: window.__idbOpens, player: trialPlayer,
  snapshot: pack.manifest.identity.trialSnapshotId,
  roadAsset: world.definition.assets.roadGraph,
  sample: ${sampleCell ? `assembly.scenarioNativeRoadContext(sc).terrain.readTile(${sampleCell[0]}, ${sampleCell[1]})` : "null"} };
document.getElementById("trial").textContent = JSON.stringify(window.__trial);
</script></body></html>`);
  },
  // Studio workbench v0 (E-03 slice): 4 layers (base/decor/roads/cities)
  // with select + visibility + lock (Q60), grid-snap grass placement on
  // the decor layer (Q56), same-layer reorder (Q61), inspect readout,
  // save draft + validate report. Move/delete/drag, road building and
  // connection validation are later slices, not this page.
  "GET /studio": (res, _body, query) => {
    res.writeHead(303, { location: "/editor-studio.html?game=" + encodeURIComponent(query.get("game") ?? ""), "cache-control": "no-store" });
    res.end();
  },
  // Historical UI retained for reproducible old evidence, not the current workspace.
  "GET /studio-v0": (res, _body, query) => {
    const game = String(query.get("game") ?? "").replace(/"/g, "");
    html(res, `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>Studio</title></head><body>
<div><span id="layers"></span><button id="lock">lock</button><span id="tools"><button data-tool="inspect">inspect</button><button data-tool="pan">pan</button><button data-tool="grass">grass</button><button data-tool="move">move</button><button data-tool="del">del</button><button data-tool="road">road</button></span><span id="roadbar" style="display:none"><button data-kind="land">land</button><button data-kind="water">water</button><button id="roadcancel">cancel</button></span><button id="save">save</button><button id="validate">validate</button><button id="compile">compile</button><span id="status"></span></div>
<div id="sel"></div><canvas id="cv" width="960" height="600" style="border:1px solid #888"></canvas><div id="report"></div><script type="module">
const gameId = ${JSON.stringify(game)};
const LAYERS = ["base", "decor", "roads", "cities"];
const ui = { layer: "decor", tool: "inspect", visible: { base: true, decor: true, roads: true, cities: true }, locked: { base: true, decor: false, roads: true, cities: true }, cam: { x: 0, y: 0 }, draft: null, sel: -1, citySel: null, pendingMove: false, diagnostics: [], roadDraft: null };
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const status = (t) => { document.getElementById("status").textContent = t; };
const draft = await (await fetch("/api/draft?game=" + encodeURIComponent(gameId))).json();
ui.draft = draft;
if (!Array.isArray(ui.draft.map.decorations)) ui.draft.map.decorations = [];
const atlas = new Image();
await new Promise((res2, rej) => { atlas.onload = res2; atlas.onerror = rej; atlas.src = "/map_atlas_spring.png"; });
const mmap = new Uint8Array(await (await fetch("/mmap_map.bin")).arrayBuffer());
function draw() {
  ctx.clearRect(0, 0, 960, 600);
  const x0 = Math.max(0, Math.floor(ui.cam.x / 16));
  const y0 = Math.max(0, Math.floor(ui.cam.y / 16));
  const x1 = Math.min(383, x0 + 960 / 16 + 1);
  const y1 = Math.min(255, y0 + 600 / 16 + 1);
  if (ui.visible.base) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = mmap[ty * 384 + tx];
        ctx.drawImage(atlas, (t % 16) * 16, Math.floor(t / 16) * 16, 16, 16, tx * 16 - ui.cam.x, ty * 16 - ui.cam.y, 16, 16);
      }
    }
  }
  if (ui.visible.decor) {
    ui.draft.map.decorations.forEach((d, i) => {
      if (d.layer !== "decor") return;
      ctx.fillStyle = i === ui.sel ? "rgba(255,255,0,0.5)" : "rgba(0,200,0,0.45)";
      ctx.fillRect(d.x * 16 - ui.cam.x, d.y * 16 - ui.cam.y, 16, 16);
      ctx.fillStyle = "#000";
      ctx.fillText(String(d.order ?? i), d.x * 16 - ui.cam.x + 3, d.y * 16 - ui.cam.y + 12);
    });
  }
  if (ui.visible.roads) {
    const broken = new Set(ui.diagnostics.filter((d) => d.code === "disconnected-road").map((d) => d.roadId));
    for (const road of ui.draft.map.roads ?? []) {
      const bad = broken.has(road.id);
      ctx.strokeStyle = bad ? "#f00" : "#888";
      ctx.lineWidth = bad ? 2 : 1;
      ctx.beginPath();
      (road.geometry ?? []).forEach((p, i) => {
        const sx = p.x * 16 + 8 - ui.cam.x;
        const sy = p.y * 16 + 8 - ui.cam.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      if (bad) {
        const ends = [road.geometry[0], road.geometry[road.geometry.length - 1]].filter(Boolean);
        ctx.fillStyle = "#f00";
        for (const p of ends) ctx.fillRect(p.x * 16 - ui.cam.x + 2, p.y * 16 - ui.cam.y + 2, 12, 12);
      }
    }
    if (ui.roadDraft && ui.roadDraft.length) {
      ctx.strokeStyle = "#0a0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ui.roadDraft.forEach((p, i) => {
        const sx = p.x * 16 + 8 - ui.cam.x;
        const sy = p.y * 16 + 8 - ui.cam.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
  }
  if (ui.visible.cities) {
    for (const p of ui.draft.map.placements ?? []) {
      ctx.fillStyle = ui.citySel === p.cityId ? "#ff0" : "#00f";
      ctx.fillRect(p.x * 16 - ui.cam.x + 3, p.y * 16 - ui.cam.y + 3, 10, 10);
    }
  }
  document.getElementById("layers").innerHTML = "";
  for (const L of LAYERS) {
    const b = document.createElement("button");
    b.textContent = (ui.layer === L ? "[*]" : "[ ]") + L + (ui.visible[L] ? "" : "(h)") + (ui.locked[L] ? "(l)" : "");
    b.onclick = () => { ui.layer = L; draw(); };
    b.ondblclick = () => { ui.visible[L] = !ui.visible[L]; draw(); };
    document.getElementById("layers").appendChild(b);
  }
}
for (const b of document.querySelectorAll("#tools button")) b.onclick = () => { ui.tool = b.dataset.tool; ui.pendingMove = false; ui.roadDraft = []; document.getElementById("roadbar").style.display = "none"; status("tool " + ui.tool); };
document.getElementById("lock").onclick = () => { ui.locked[ui.layer] = !ui.locked[ui.layer]; draw(); };
let panFrom = null;
cv.addEventListener("pointerdown", async (e) => {
  const r = cv.getBoundingClientRect();
  const tx = Math.floor((e.clientX - r.left + ui.cam.x) / 16);
  const ty = Math.floor((e.clientY - r.top + ui.cam.y) / 16);
  if (ui.tool === "pan") { panFrom = [e.clientX, e.clientY, ui.cam.x, ui.cam.y]; return; }
  if (ui.tool === "inspect") {
    const t = mmap[ty * 384 + tx];
    const decos = ui.draft.map.decorations.map((d, i) => ({ ...d, i })).filter((d) => d.x === tx && d.y === ty);
    document.getElementById("sel").textContent = "cell (" + tx + "," + ty + ") tile " + t + " decos " + JSON.stringify(decos.map((d) => d.id));
    ui.sel = decos.length ? decos[decos.length - 1].i : -1;
    draw();
    return;
  }
  if (ui.tool === "move") {
    if (ui.locked[ui.layer]) { status(ui.layer + " layer locked"); return; }
    if (ui.layer === "decor") {
      const ds = ui.draft.map.decorations;
      const i = ds.findIndex((d) => d.x === tx && d.y === ty);
      if (!ui.pendingMove) {
        if (i < 0) { status("nothing to move here"); return; }
        ui.sel = i;
        ui.pendingMove = true;
        status("move target?");
        draw();
        return;
      }
      ui.pendingMove = false;
      ds[ui.sel].x = Math.max(0, Math.min(383, tx));
      ds[ui.sel].y = Math.max(0, Math.min(255, ty));
      status("moved");
      draw();
      return;
    }
    if (ui.layer === "cities") {
      const ps = ui.draft.map.placements ?? [];
      if (!ui.pendingMove) {
        const hit = ps.find((p) => p.x === tx && p.y === ty);
        if (!hit) { status("no city here"); return; }
        ui.citySel = hit.cityId;
        ui.pendingMove = true;
        status("city target?");
        draw();
        return;
      }
      ui.pendingMove = false;
      const hit = ps.find((p) => p.cityId === ui.citySel);
      hit.x = Math.max(0, Math.min(383, tx));
      hit.y = Math.max(0, Math.min(255, ty));
      status("city moved (validate for断路)");
      draw();
      return;
    }
    status("move supports decor/cities layers");
    return;
  }
  if (ui.tool === "road") {
    if (ui.layer !== "roads") { status("road needs the roads layer"); return; }
    if (ui.locked.roads) { status("roads layer locked"); return; }
    const last = ui.roadDraft.length ? ui.roadDraft[ui.roadDraft.length - 1] : null;
    if (last && last.x === tx && last.y === ty) {
      document.getElementById("roadbar").style.display = "inline";
      status("choose land/water to build, cancel to drop");
      return;
    }
    if (last && Math.max(Math.abs(tx - last.x), Math.abs(ty - last.y)) !== 1) {
      status("road points must be adjacent");
      return;
    }
    ui.roadDraft.push({ x: tx, y: ty });
    status("road points: " + ui.roadDraft.length + " (click last again to finish)");
    draw();
    return;
  }
  if (ui.tool === "del") {
    if (ui.locked[ui.layer]) { status(ui.layer + " layer locked"); return; }
    if (ui.layer === "roads") {
      const wx = e.clientX - r.left + ui.cam.x;
      const wy = e.clientY - r.top + ui.cam.y;
      let best = null;
      let bestD = 100;
      for (const road of ui.draft.map.roads ?? []) {
        const g = road.geometry ?? [];
        for (let i = 1; i < g.length; i++) {
          const ax = g[i - 1].x * 16 + 8;
          const ay = g[i - 1].y * 16 + 8;
          const bx = g[i].x * 16 + 8;
          const by = g[i].y * 16 + 8;
          const dx = bx - ax;
          const dy = by - ay;
          const len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / len2)) : 0;
          const d = Math.hypot(wx - (ax + t * dx), wy - (ay + t * dy));
          if (d < bestD) { bestD = d; best = road; }
        }
      }
      if (!best || bestD > 160) { status("no road here"); return; }
      ui.draft.map.roads = ui.draft.map.roads.filter((x) => x !== best);
      status("deleted " + best.id);
      draw();
      return;
    }
    if (ui.layer === "decor") {
      const ds = ui.draft.map.decorations;
      const top = ds.map((d, i) => ({ ...d, i })).filter((d) => d.x === tx && d.y === ty).pop();
      if (!top) { status("nothing to delete here"); return; }
      ds.splice(top.i, 1);
      ds.forEach((d, i) => { d.order = i; });
      ui.sel = -1;
      status("deleted");
      draw();
      return;
    }
    status("cities are not deletable here (design 4.2 rules out of slice)");
    return;
  }
  if (ui.tool === "grass") {
    if (ui.layer !== "decor") { status("grass needs the decor layer"); return; }
    if (ui.locked.decor) { status("decor layer locked"); return; }
    const n = ui.draft.map.decorations.length;
    ui.draft.map.decorations.push({ id: "deco-" + n, layer: "decor", kind: "grass", x: tx, y: ty, order: n, definitionRef: "deco-grass" });
    ui.sel = n;
    draw();
  }
});
window.addEventListener("pointermove", (e) => {
  if (!panFrom) return;
  ui.cam.x = Math.max(0, Math.min(384 * 16 - 960, panFrom[2] - (e.clientX - panFrom[0])));
  ui.cam.y = Math.max(0, Math.min(256 * 16 - 600, panFrom[3] - (e.clientY - panFrom[1])));
  draw();
});
window.addEventListener("pointerup", () => { panFrom = null; });
window.moveSelected = (dir) => {
  const ds = ui.draft.map.decorations;
  if (ui.sel < 0 || !ds[ui.sel]) return;
  const j = ui.sel + dir;
  if (j < 0 || j >= ds.length) return;
  const t = ds[ui.sel];
  ds[ui.sel] = ds[j];
  ds[j] = t;
  ds.forEach((d, i) => { d.order = i; });
  ui.sel = j;
  draw();
};
document.getElementById("roadcancel").onclick = () => { ui.roadDraft = []; document.getElementById("roadbar").style.display = "none"; status("road dropped"); draw(); };
for (const b of document.querySelectorAll("#roadbar button[data-kind]")) b.onclick = async () => {
  const mod = await import("/src/content/authoring/roadedit.js");
  const cities = new Map((ui.draft.map.placements ?? []).map((p) => [p.cityId, p]));
  const tiles = (x, y) => mmap[y * 384 + x];
  const ends = [ui.roadDraft[0], ui.roadDraft[ui.roadDraft.length - 1]];
  const near = (p) => (ui.draft.map.placements ?? []).find((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= 2);
  const fromHit = near(ends[0]);
  const toHit = near(ends[1]);
  if (!fromHit || !toHit) { status("road ends must start/end near cities"); return; }
  try {
    const n = ui.draft.map.roads.length;
    const built = mod.buildRoad({ fromCityId: fromHit.cityId, toCityId: toHit.cityId, geometry: ui.roadDraft.map((p) => ({ x: p.x, y: p.y })), travelKind: b.dataset.kind, cities, roads: ui.draft.map.roads, tiles });
    built.id = "road-" + n + "-new";
    ui.draft.map.roads.push(built);
    ui.roadDraft = [];
    document.getElementById("roadbar").style.display = "none";
    status("built " + built.id + " cost " + built.nativeBinding.weight);
    draw();
  } catch (error) {
    status("refused (" + (error.code ?? "error") + "): " + error.message);
  }
};
document.getElementById("save").onclick = async () => {
  const r = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId, map: ui.draft.map }) });
  const data = await r.json();
  ui.diagnostics = data.diagnostics ?? [];
  status(r.status === 200 ? "saved rev " + data.draftRevision + (ui.diagnostics.length ? " (" + ui.diagnostics.length + "断路)" : "") : "save failed: " + data.error);
  draw();
};
document.getElementById("validate").onclick = async () => {
  const r = await fetch("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) });
  const data = await r.json();
  ui.diagnostics = data.diagnostics ?? [];
  document.getElementById("report").textContent = JSON.stringify(data);
  status(r.status === 200 ? (data.valid ? "valid" : "invalid: " + ui.diagnostics.length + "断路") : "invalid");
  draw();
};
document.getElementById("compile").onclick = async () => {
  const r = await fetch("/api/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) });
  const data = await r.json();
  document.getElementById("report").textContent = JSON.stringify(data).slice(0, 300);
  status(r.status === 200 ? "compiled rev " + data.identity.draftRevision : "compile blocked: " + data.error);
};
window.__studio = ui;
draw();
status("ready");
</script></body></html>`);
  },
};

function html(res, body) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
function json(res, value) {
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", byteLength = 0, tooLarge = false;
    const decoder = new StringDecoder("utf8");
    req.on("data", (chunk) => {
      if (tooLarge) return;
      byteLength += chunk.length;
      if (byteLength > 64 * 1024 * 1024) { tooLarge = true; data = ""; reject(new RangeError("body too large")); return; }
      data += decoder.write(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      data += decoder.end();
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch (error) {
        reject(new RangeError(`bad JSON body: ${error?.message ?? error}`));
      }
    });
  });
}

export function startEditorServer(port = PORT, store = STORE) {
  STORE = store;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
      const route = `${req.method} ${url.pathname}`;
      const handler = routes[route];
      if (!handler) {
        if (req.method === "GET") {
          try {
            await serveWebFile(url.pathname, res);
            return;
          } catch {
            // fall through to the JSON 404 below
          }
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unknown route" }));
        return;
      }
      const body = req.method === "POST" ? await readBody(req) : null;
      handler(res, body, url.searchParams);
    } catch (error) {
      res.writeHead(error instanceof RangeError || error instanceof TypeError ? 400 : 500, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: error?.message ?? String(error) }));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// Self-check (only when executed directly; importing for startEditorServer
// must not run it).
if (!SERVE && process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "editor-svc-"));
  const server = await startEditorServer(0, tmp);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const init = { method, headers: { "content-type": "application/json", connection: "close" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await fetch(`${base}${path}`, init);
    const data = await r.json();
    assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  };
  assert.ok((await (await fetch(`${base}/`)).text()).includes("編輯器"));
  assert.deepEqual(await call("GET", "/api/games"), { games: [] });
  const created = await call("POST", "/api/copy", { gameId: "svc-test-1", ownerId: "admin-1", kind: "minimal" });
  assert.equal(created.gameId, "svc-test-1");
  assert.deepEqual(await call("GET", "/api/games"), { games: ["svc-test-1"] });
  const bad = await fetch(`${base}/api/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId: "../escape", kind: "minimal" }),
  });
  assert.equal(bad.status, 400, "gameId escape refused");
  const saved = await call("POST", "/api/save", { gameId: "svc-test-1" });
  assert.equal(saved.draftRevision, "2", "revision bumps per write");
  assert.ok((await call("POST", "/api/validate", { gameId: "svc-test-1" })).valid);
  const manifest = await call("POST", "/api/compile", { gameId: "svc-test-1" });
  assert.equal(manifest.identity.gameId, "svc-test-1");
  assert.ok(manifest.minimap["208x139"], "minimap derived");
  assert.equal(manifest.assets[0].role, "rules-initial-terrain");
  // Trial-pack serves every known chapter (post-fix: previously fatal
  // chapters boot with reconstruction writes + dead-slot skips).
  await call("POST", "/api/copy", { gameId: "svc-full-1", ownerId: "admin-1", kind: "full" });
  const draft = await call("GET", "/api/draft?game=svc-full-1");
  await call("POST", "/api/compile", { gameId: "svc-full-1" });
  const pack0 = await fetch(`${base}/api/trial-pack?game=svc-full-1&chapter=${encodeURIComponent(draft.chapterOrder[0])}`);
  assert.equal(pack0.status, 200, "drifted chapter trial served");
  const pack1 = await fetch(`${base}/api/trial-pack?game=svc-full-1&chapter=${encodeURIComponent(draft.chapterOrder[1])}`);
  assert.equal(pack1.status, 200, "clean chapter trial served");
  // Bad drafts are refused at save, not compiled.
  const evil = await fetch(`${base}/api/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId: "svc-test-1", map: { bounds: { width: 385 } } }),
  });
  assert.equal(evil.status, 400, "bad draft refused");
  server.close();
  process.stdout.write("editor service self-check OK (copy/save/validate/compile/escape/refusals)\n");
}
