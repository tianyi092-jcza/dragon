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
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { canonicalDigest, copyBuiltinGame, validateGameSource } from "../web/src/content/authoring/gamesource.js";
import { compileTrialSource, TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { renderMinimapPixels, MINIMAP_SIZES } from "../web/src/content/authoring/minimap.js";
import { readInstalledEditorSource } from "./editor_builtin_source.mjs";
import { readInstalledEntitySource, readEntitySourceForDraft } from "./editor_entity_source.mjs";
import { BUILTIN_ENTITY_SOURCE } from "../web/src/editor/builtinentitysource.generated.js";
import { copyEntitySourceRecords } from "../web/src/editor/entitycopy.js";
import { inspectEntitySources } from "../web/src/editor/entityinspection.js";
import { encodeMinimapPNG } from "./minimap_png.mjs";
import { validateLibraryAdditions } from "../web/src/editor/componenttools.js";
import { normalizeGameMetadata, checkLocalDraftName, summarizeLocalDraft } from "../web/src/editor/gamemetadata.js";
import { projectTrialChapter } from "../web/src/editor/trialscope.js";
import { editChapterResources } from "../web/src/editor/chapterresources.js";
import { setGeneralPortrait } from "../web/src/editor/generalportrait.js";

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
function localGameIds() {
  mkdirSync(STORE, { recursive: true });
  return readdirSync(STORE, { withFileTypes: true }).filter((e) => e.isDirectory())
    .map((e) => e.name).filter((name) => existsSync(join(STORE, name, "gamesource.json"))).sort();
}
function localRecords() { return localGameIds().map((id) => summarizeLocalDraft(loadDraft(id))); }

export const EDITOR_BUILD_FORMAT = "studio-app-2"; // preserve prior build directories
const BUILD_FILES = { terrain: "terrain.bin", roadGraph: "roads.json", roadCost: "road_cost.bin", roadOffset: "road_offset.json",
  minimapBase: "minimap_base.png", minimapLarge: "minimap_large.png" };
export const EDITOR_CHAPTER_BUILD_FORMAT = "studio-chapter-1";
function buildDir(gameId, revision, chapterId = null) {
  if (!/^[1-9]\d*$/.test(revision ?? "")) throw new RangeError("bad build revision");
  const root = join(gameDir(gameId), "build", revision, TRIAL_COMPILER_REVISION);
  if (chapterId === null) return join(root, EDITOR_BUILD_FORMAT);
  if (typeof chapterId !== "string" || !chapterId) throw new RangeError("missing trial scope chapter");
  return join(root, EDITOR_CHAPTER_BUILD_FORMAT, sha256hex(chapterId));
}
function queryChapterScope(query) {
  if (!query.has("scope")) return null; // existing whole-build APIs remain separate
  if (query.get("scope") !== "chapter" || !query.get("chapter")) throw new RangeError("invalid trial scope");
  return query.get("chapter");
}
function trialAssetURL(gameId, revision, digest, assetId, chapterId) {
  const base = `/api/trial-asset?game=${encodeURIComponent(gameId)}&revision=${revision}&digest=${digest}&asset=${assetId}`;
  return chapterId === null ? base : `${base}&scope=chapter&chapter=${encodeURIComponent(chapterId)}`;
}
function readBuild(gameId, revision, chapterId = null) {
  const dir = buildDir(gameId, revision, chapterId);
  if (!existsSync(join(dir, "manifest.json"))) throw new RangeError("compile before trial-pack");
  let manifest, snapshot;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    snapshot = JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf-8"));
  } catch (error) {
    throw new RangeError("corrupt compiled snapshot", { cause: error });
  }
  const format = chapterId === null ? EDITOR_BUILD_FORMAT : EDITOR_CHAPTER_BUILD_FORMAT;
  if (manifest.buildFormat !== format || manifest.compilerRevision !== TRIAL_COMPILER_REVISION ||
      manifest.identity?.gameId !== gameId || manifest.identity.draftRevision !== revision ||
      canonicalDigest(snapshot, sha256hex) !== manifest.identity.sourceDigest)
    throw new RangeError("compiled snapshot identity mismatch");
  if (chapterId !== null) {
    let saved;
    try { saved = JSON.parse(readFileSync(join(dir, "saved-source.json"), "utf8")); }
    catch (cause) { throw new RangeError("corrupt saved trial scope source", { cause }); }
    const projected = projectTrialChapter(saved, chapterId, sha256hex);
    if (manifest.scope?.kind !== "chapter" || manifest.scope.chapterId !== chapterId ||
        manifest.scope.savedSourceDigest !== projected.savedSourceDigest || manifest.identity.savedSourceDigest !== projected.savedSourceDigest ||
        manifest.scope.selectedSourceDigest !== projected.selectedSourceDigest || manifest.identity.sourceDigest !== projected.selectedSourceDigest ||
        snapshot.gameId !== gameId || snapshot.localModel.draftRevision !== revision ||
        canonicalDigest(snapshot, sha256hex) !== projected.selectedSourceDigest ||
        manifest.identity.trialSnapshotId !== `${gameId}@${revision}:${projected.selectedSourceDigest}:chapter:${sha256hex(chapterId)}`)
      throw new RangeError("compiled chapter scope identity mismatch");
    assert.deepEqual(manifest.chapters, [chapterId]);
  } else if (manifest.scope !== undefined) throw new RangeError("whole build has chapter scope");
  for (const [assetId, path] of Object.entries(BUILD_FILES)) {
    const asset = [...manifest.assets, ...manifest.minimapAssets].find((a) => a.assetId === assetId);
    const bytes = readFileSync(join(dir, path));
    if (asset?.path !== path || asset.byteLength !== bytes.length || asset.sha256 !== sha256hex(bytes) ||
        asset.url !== trialAssetURL(gameId, revision, manifest.identity.sourceDigest, assetId, chapterId))
      throw new RangeError(`compiled asset integrity mismatch: ${assetId}`);
  }
  assert.deepEqual(manifest.visualAssets, checkedVisuals(snapshot));
  return { dir, manifest, snapshot };
}

function checkedVisuals(snapshot) {
  const visuals = snapshot.assets?.editorVisuals;
  if (!visuals?.seasonAtlases || !visuals?.seasons) return null; // older draft cannot enter full App trial
  for (const [kind, stem] of [["seasonAtlases", "atlas"], ["seasons", "tiles"]]) {
    for (const s of ["spring", "summer", "autumn", "winter"]) {
      const asset = visuals[kind][s];
      assert.match(asset?.url ?? "", new RegExp(`^content/builtin/compiled/map-2-[a-f0-9]{64}/map_${stem}_${s}\\.png$`));
      assert.equal(asset.url.split("/")[3], visuals.springAtlas.url.split("/")[3]);
      const bytes = readFileSync(new URL(`../web/${asset.url}`, import.meta.url));
      assert.equal(bytes.length, asset.byteLength); assert.equal(sha256hex(bytes), asset.sha256);
    }
  }
  return visuals;
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
  const rel = decodeURIComponent(pathname);
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
  "GET /": (res) => serveWebFile("/editor-games.html", res),
  "GET /api/games": (res, _body, query) => {
    const games = localGameIds();
    if (query.get("details") !== "1") return json(res, { games }); // keep prior compact API
    const records = games.map((gameId) => {
      try { return summarizeLocalDraft(loadDraft(gameId)); }
      catch (error) { return { gameId, error: error.message, editable: false }; }
    });
    json(res, { games, records });
  },
  "GET /api/game-info": (res, _body, query) => json(res, summarizeLocalDraft(loadDraft(query.get("game")))),
  "GET /entities": (res) => serveWebFile("/editor-entities.html", res),
  "GET /api/entity-inspection": async (res, _body, query) => {
    const game = loadDraft(query.get("game")); // fixed detached read, never write after await
    const selected = game.sourceRecords === undefined ? null : await readEntitySourceForDraft(game);
    json(res, inspectEntitySources(game, selected?.bundle ?? null, selected?.descriptor ?? BUILTIN_ENTITY_SOURCE, query.get("chapter") ?? undefined));
  },
  "POST /api/metadata": (res, body) => {
    if (!body || Object.keys(body).some((key) => !["gameId", "expectedRevision", "metadata"].includes(key)))
      throw new RangeError("資料保存僅接受遊戲ID、預期修訂、名稱與簡介");
    if (body.gameId === "wolong-builtin") throw new RangeError("內置原件唯讀，請先複製");
    const game = loadDraft(body.gameId);
    if (body.expectedRevision !== game.localModel.draftRevision)
      throw new RangeError("草稿修訂衝突：請重新載入後合併修改");
    const metadata = normalizeGameMetadata(body.metadata);
    checkLocalDraftName(game, metadata, localRecords());
    game.metadata = { ...game.metadata, ...metadata };
    game.localModel.draftRevision = String(BigInt(game.localModel.draftRevision) + 1n);
    game.localModel.modifiedAt = new Date().toISOString();
    storeDraft(game, true);
    json(res, summarizeLocalDraft(game));
  },
  // Local synchronous write tail only; NOT authentication or durable multi-process CAS.
  "POST /api/chapter-resources": (res, body) => {
    const keys = ["gameId", "expectedRevision", "chapterId", "slot", "values"];
    if (!body || Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw new TypeError("章節資源請求格式不符");
    const game = loadDraft(body.gameId);
    if (body.expectedRevision !== game.localModel.draftRevision) throw new RangeError("草稿修訂衝突：請重新載入後合併修改");
    const next = editChapterResources(game, body.chapterId, body.slot, body.values);
    if (next !== game) {
      next.localModel.draftRevision = String(BigInt(game.localModel.draftRevision) + 1n);
      next.localModel.modifiedAt = new Date().toISOString();
      storeDraft(next, true);
    }
    json(res, { gameId: next.gameId, chapterId: body.chapterId, slot: body.slot, draftRevision: next.localModel.draftRevision, changed: next !== game });
  },
  // Portrait asset binding for one chapter general (事项④ Web 产品决定): additive
  // portraitKey only, numeric byte untouched. Same local revision-CAS discipline.
  "POST /api/general-portrait": (res, body) => {
    const keys = ["gameId", "expectedRevision", "chapterId", "generalIdx", "portraitKey"];
    if (!body || Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw new TypeError("頭像綁定請求格式不符");
    const game = loadDraft(body.gameId);
    if (body.expectedRevision !== game.localModel.draftRevision) throw new RangeError("草稿修訂衝突：請重新載入後合併修改");
    const next = setGeneralPortrait(game, body.chapterId, body.generalIdx, body.portraitKey);
    if (next !== game) {
      next.localModel.draftRevision = String(BigInt(game.localModel.draftRevision) + 1n);
      next.localModel.modifiedAt = new Date().toISOString();
      storeDraft(next, true);
    }
    const record = next.chapters[body.chapterId].state.generals.find((g) => g?.idx === body.generalIdx);
    json(res, { gameId: next.gameId, chapterId: body.chapterId, generalIdx: body.generalIdx, portraitKey: record?.portraitKey ?? null, draftRevision: next.localModel.draftRevision, changed: next !== game });
  },
  // Read-only draft fetch (editors load-then-save; writes go via /api/save).
  "GET /api/draft": (res, _body, query) => {
    json(res, loadDraft(query.get("game")));
  },
  "POST /api/copy": async (res, body) => {
    const { gameId, ownerId, kind } = body ?? {};
    const source = builtinSource();
    const game = copyBuiltinGame({ gameId, ownerId, kind, source }, sha256hex);
    game.assets.editorVisuals = source.editorAssets;
    if (kind === "full") game.metadata.name = "測試複製";
    if (existsSync(join(gameDir(game.gameId), "gamesource.json"))) throw new RangeError("game identity already exists");
    // Historical harness calls may still create semantically incomplete names;
    // the management UI always supplies a validated complete display form.
    if (body.metadata !== undefined) {
      game.metadata = normalizeGameMetadata(body.metadata);
      checkLocalDraftName(game, game.metadata, localRecords());
    }
    if (kind === "full") {
      const entitySource = await readInstalledEntitySource();
      game.sourceRecords = copyEntitySourceRecords(game, source, entitySource, BUILTIN_ENTITY_SOURCE,
        () => `source-record-${randomUUID()}`); // identity entropy, never the game's rule RNG
    }
    // Await above can let another request finish: recheck in the synchronous
    // write tail (single local process only; still not a durable multi-process CAS).
    if (existsSync(join(gameDir(game.gameId), "gamesource.json"))) throw new RangeError("game identity already exists");
    if (body.metadata !== undefined) checkLocalDraftName(game, game.metadata, localRecords());
    const createdAt = new Date().toISOString();
    game.localModel.createdAt = createdAt; game.localModel.modifiedAt = createdAt;
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
      validateLibraryAdditions(game, componentDefinitions, map === undefined ? game.map : map);
      game.componentDefinitions = componentDefinitions;
    }
    if (map !== undefined) game.map = map;
    game.localModel.draftRevision = String(BigInt(game.localModel.draftRevision) + 1n);
    game.localModel.modifiedAt = new Date().toISOString();
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
    const saved = loadDraft(body?.gameId);
    if (body.expectedRevision !== undefined && body.expectedRevision !== saved.localModel.draftRevision)
      throw new RangeError("編譯修訂衝突：請重新載入");
    if (body.scope !== undefined && (body.scope?.kind !== "chapter" || typeof body.scope.chapterId !== "string" || !body.scope.chapterId ||
        Object.keys(body.scope).some((key) => !["kind", "chapterId"].includes(key)))) throw new RangeError("invalid compile chapter scope");
    const projection = body.scope === undefined ? null : projectTrialChapter(saved, body.scope.chapterId, sha256hex);
    const game = projection?.selected ?? saved, chapterScope = projection?.chapterId ?? null;
    validateGameSource(game);
    const visualAssets = checkedVisuals(game);
    const compiled = compileTrialSource(game, sha256hex);
    const rev = game.localModel.draftRevision;
    const dir = buildDir(game.gameId, rev, chapterScope);
    if (existsSync(join(dir, "manifest.json"))) {
      const previous = readBuild(game.gameId, rev, chapterScope);
      if (previous.manifest.identity.sourceDigest !== compiled.sourceDigest ||
          (projection && previous.manifest.scope.savedSourceDigest !== projection.savedSourceDigest))
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
        url: trialAssetURL(game.gameId, rev, compiled.sourceDigest, assetId, chapterScope) };
    });
    writeFileSync(join(dir, "snapshot.json"), JSON.stringify(game));
    if (projection) writeFileSync(join(dir, "saved-source.json"), JSON.stringify(saved));
    const minimap = {}, minimapAssets = [];
    for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
      const { pixels } = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, compiled.width, compiled.height, size.w, size.h, 1);
      minimap[`${size.w}x${size.h}`] = sha256hex(Buffer.from(pixels));
      const assetId = name === "base" ? "minimapBase" : "minimapLarge", path = BUILD_FILES[assetId];
      const bytes = encodeMinimapPNG(pixels, size.w, size.h);
      writeFileSync(join(dir, path), bytes);
      minimapAssets.push({ assetId, path, sha256: sha256hex(bytes), byteLength: bytes.length, role: "automatic-minimap",
        url: trialAssetURL(game.gameId, rev, compiled.sourceDigest, assetId, chapterScope) });
    }
    const manifest = {
      schemaVersion: 1,
      compilerRevision: TRIAL_COMPILER_REVISION,
      buildFormat: projection ? EDITOR_CHAPTER_BUILD_FORMAT : EDITOR_BUILD_FORMAT,
      ...(projection ? { scope: { kind: "chapter", chapterId: chapterScope, savedSourceDigest: projection.savedSourceDigest, selectedSourceDigest: projection.selectedSourceDigest } } : {}),
      compatibilityAssetMode: compiled.compatibilityAssetMode,
      ruleProfile: game.ruleProfile,
      identity: { gameId: game.gameId, draftRevision: rev, sourceDigest: compiled.sourceDigest,
        ...(projection ? { savedSourceDigest: projection.savedSourceDigest } : {}),
        trialSnapshotId: `${game.gameId}@${rev}:${compiled.sourceDigest}${projection ? `:chapter:${sha256hex(chapterScope)}` : ""}` },
      world: { id: `${game.gameId}-world`, revision: compiled.sourceDigest,
        width: compiled.width, height: compiled.height, tileSize: 16 },
      chapters: game.chapterOrder,
      visualAssets,
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
    const { dir, manifest, snapshot } = readBuild(gameId, rev, queryChapterScope(query));
    const chapterId = query.get("chapter") || snapshot.chapterOrder[0] || null;
    if (chapterId != null && !snapshot.chapters[chapterId]) throw new RangeError(`unknown trial chapter: ${chapterId}`);
    json(res, { manifest, chapterId,
      terrainHex: readFileSync(join(dir, BUILD_FILES.terrain)).toString("hex"),
      chapter: chapterId == null ? null : snapshot.chapters[chapterId].state });
  },
  "GET /api/trial-asset": (res, _body, query) => {
    const { dir, manifest } = readBuild(query.get("game"), query.get("revision"), queryChapterScope(query));
    if (query.get("digest") !== manifest.identity.sourceDigest) throw new RangeError("trial asset snapshot mismatch");
    const assetId = query.get("asset");
    if (!Object.hasOwn(BUILD_FILES, assetId)) throw new RangeError("unknown trial asset");
    const bytes = readFileSync(join(dir, BUILD_FILES[assetId]));
    const media = assetId.startsWith("minimap") ? "image/png" : "application/octet-stream";
    res.writeHead(200, { "content-type": assetId === "roadGraph" || assetId === "roadOffset" ? "application/json" : media, "cache-control": "no-store" });
    res.end(bytes);
  },
  "GET /trial-wait": (res) => html(res, '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>草稿試運行</title><p>正在校驗固定快照…若啟動失敗，請返回工作台查看診斷並重新開啟。</p></html>'),
  "GET /trial-app": (res, _body, query) => {
    const game = query.get("game"), revision = query.get("revision");
    const scope = queryChapterScope(query);
    const { manifest, snapshot } = readBuild(game, revision, scope);
    const chapter = query.get("chapter");
    if (!snapshot.chapters[chapter] || !manifest.visualAssets) throw new RangeError("缺少完整章節或受信四季資源，不能試運行");
    const url = new URLSearchParams({ game, revision, chapter });
    if (scope !== null) url.set("scope", "chapter");
    res.writeHead(303, { location: `/trial-game?${url}`, "cache-control": "no-store" }); res.end();
  },
  "GET /trial-game": (res) => {
    const source = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
    const boot = '<script type="module" src="src/boot.js"></script>';
    if (!source.includes(boot)) throw new Error("trial shell boot marker missing");
    html(res, source.replace('<title>臥龍傳</title>', '<title>草稿試運行 — 僅記憶體</title>')
      .replace(boot, '<div id="trial-status" style="position:fixed;left:4px;bottom:4px;z-index:100;color:#fff;background:#141414;pointer-events:none">草稿試運行 — 僅記憶體；正式存讀檔停用（本地無認證）</div><script type="module" src="/src/editor/trialapp.js"></script>'));
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
    res.writeHead(303, { location: `/editor-studio.html?game=${encodeURIComponent(query.get("game") ?? "")}`, "cache-control": "no-store" });
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
      await handler(res, body, url.searchParams);
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
  assert.ok((await (await fetch(`${base}/`)).text()).includes("本地遊戲管理"));
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
  const fullDraft = await call("GET", "/api/draft?game=svc-full-1");
  const portraitChapter = fullDraft.chapterOrder.find((id) => Array.isArray(fullDraft.chapters[id].state?.generals) && fullDraft.chapters[id].state.generals.length);
  assert.ok(portraitChapter, "full copy has a chapter with generals");
  const portraitGeneral = fullDraft.chapters[portraitChapter].state.generals[0].idx;
  const bound = await call("POST", "/api/general-portrait", { gameId: "svc-full-1", expectedRevision: fullDraft.localModel.draftRevision, chapterId: portraitChapter, generalIdx: portraitGeneral, portraitKey: "upSelfCheck" });
  assert.equal(bound.changed, true);
  assert.equal(bound.portraitKey, "upSelfCheck");
  const cleared = await call("POST", "/api/general-portrait", { gameId: "svc-full-1", expectedRevision: bound.draftRevision, chapterId: portraitChapter, generalIdx: portraitGeneral, portraitKey: null });
  assert.equal(cleared.changed, true);
  assert.equal(cleared.portraitKey, null);
  const badKey = await fetch(`${base}/api/general-portrait`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: "svc-full-1", expectedRevision: cleared.draftRevision, chapterId: portraitChapter, generalIdx: portraitGeneral, portraitKey: "bad key!" }) });
  assert.equal(badKey.status, 400, "bad portrait key refused");
  server.close();
  process.stdout.write("editor service self-check OK (copy/save/validate/compile/escape/refusals)\n");
}
