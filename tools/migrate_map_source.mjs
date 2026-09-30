import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// 受控迁移工具：显式源 → 统一 GameSource 地图结构（隔离输出优先）。
// 用法：node tools/migrate_map_source.mjs --out <隔离目录>
// 只读 web/content/builtin/world + web/mmap_map.bin；不读 SAVE/用户档案；不写 DOS 原料。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validateMapSource, compileMapSource, MAP_SCHEMA_VERSION, RULE_PROFILE } from "../web/src/content/authoring/mapcompile.js";
import { renderMinimapPixels, MINIMAP_STYLE_REVISION, MINIMAP_SIZES } from "../web/src/content/authoring/minimap.js";

const W = 384;
const H = 256;
const SEA_TILES = new Set([95, 191]);
const COAST_TILE = 202;

function parseArgs(argv) {
  let out = null;
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--out") out = argv[++i];
  if (!out) throw new Error("missing --out <dir>");
  return { out };
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function oceanMask(tiles) {
  const ocean = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    const i = y * W + x;
    if (SEA_TILES.has(tiles[i]) && !ocean[i]) {
      ocean[i] = 1;
      stack.push([x, y]);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x > 0) push(x - 1, y);
    if (x + 1 < W) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < H) push(x, y + 1);
  }
  return ocean;
}

const { out } = parseArgs(process.argv);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch (error) {
    throw new Error(`cannot read JSON ${p}: ${error.message}`);
  }
};

const tiles = new Uint8Array(readFileSync(join(repoRoot, "web", "mmap_map.bin")));
const world = readJSON(join(repoRoot, "web", "content", "builtin", "world", "world.json"));
const layout = readJSON(join(repoRoot, "web", "content", "builtin", "world", "layout.json"));
const roads = readJSON(join(repoRoot, "web", "content", "builtin", "world", "roads.json"));
if (tiles.length !== W * H) throw new Error("bad terrain size");

// layout.json 是 256 行 x 384 列；与 mmap_map.bin 逐字节核对。
const flat = [];
for (const row of layout) for (const v of row) flat.push(v);
const layoutBytes = Uint8Array.from(flat);
let layoutDiff = 0;
for (let i = 0; i < W * H; i++) if (layoutBytes[i] !== tiles[i]) layoutDiff++;

const ocean = oceanMask(tiles);
const terrainRef = Array.from(tiles);
const geography = Array.from({ length: W * H }, () => 0);
for (let i = 0; i < W * H; i++) {
  const t = tiles[i];
  if (SEA_TILES.has(t)) geography[i] = ocean[i] ? 1 : 2;
  else if (t === COAST_TILE) geography[i] = 2;
}

// 原子组件定义：256 图块（已用 238 标注 used，未用 18 标注 unused）；
// 多格语义分组（山脉/长城/水系）尚未闭合，记为 G-MAP 缺口，不猜分组。
const used = new Set(tiles);
const componentDefinitions = {};
for (let t = 0; t < 256; t++) {
  componentDefinitions[`tile-${t}`] = {
    id: `tile-${t}`,
    revision: "atomic-1",
    category: used.has(t) ? "atomic-used" : "atomic-unused",
    footprint: [[0, 0]],
    anchor: [0, 0],
    ruleRecipeRef: used.has(t) ? "passthrough-tile-byte" : "unused-no-recipe",
  };
}

// 道路 travelKind：原 roads.json 无作者指定；按路径是否经过水域推断并明确标记，
// 待作者确认（M3 样本域内可编辑，不以此推断冒充原通行规则）。
const cityIdByIndex = new Map(world.cities.map((c) => [c.index, c.id]));
const unifiedRoads = roads.edges.map((e) => {
  let water = false;
  for (const pt of e.points) {
    const t = tiles[pt.y * W + pt.x];
    if (SEA_TILES.has(t) || t === COAST_TILE) {
      water = true;
      break;
    }
  }
  return {
    id: `road-${e.id}`,
    fromCityId: cityIdByIndex.get(e.source) ?? `city-${String(e.source).padStart(3, "0")}`,
    toCityId: cityIdByIndex.get(e.target) ?? `city-${String(e.target).padStart(3, "0")}`,
    travelKind: water ? "water" : "land",
    travelKindProvenance: "inferred-from-path-tiles; needs-author-choice",
    geometry: e.points.map((p) => ({ x: p.x, y: p.y })),
    nativeBinding: { edgeId: e.id, weight: e.weight, flags: e.points.map((p) => p.flags), bounds: e.bounds },
  };
});

const placements = world.cities.map((c) => ({
  id: `placement-${c.id}`,
  cityId: c.id,
  x: c.x,
  y: c.y,
  componentRef: null,
}));

const source = {
  schemaVersion: MAP_SCHEMA_VERSION,
  gameId: "wolong-builtin",
  ruleProfile: RULE_PROFILE,
  sourceRef: {
    kind: "builtin-world",
    files: {
      "web/mmap_map.bin": sha256(Buffer.from(tiles)),
      "world.json": sha256(readFileSync(join(repoRoot, "web", "content", "builtin", "world", "world.json"))),
      "roads.json": sha256(readFileSync(join(repoRoot, "web", "content", "builtin", "world", "roads.json"))),
    },
  },
  map: {
    bounds: { minX: 0, minY: 0, width: W, height: H, tileSize: 16 },
    base: { terrainRef, geography, geographyProvenance: "inferred-sea-edge-connected; M2 explicit waterClass pending" },
    decorations: [],
    roads: unifiedRoads,
    placements,
  },
  componentDefinitions,
  cities: Object.fromEntries(world.cities.map((c) => [c.id, { cityId: c.id, runtimeSlot: c.index, x: c.x, y: c.y }])),
  compatibility: { layoutDiffVsMmapBin: layoutDiff, unknownBottomLayers: "none-hidden(single-plane source); multi-tile grouping open (G-MAP)" },
};

validateMapSource(source);
const compiled = compileMapSource(source);

// 规则保真：重编地形须与 mmap_map.bin 逐字节一致；道路点数须 5526。
let terrainDiff = 0;
for (let i = 0; i < W * H; i++) if (compiled.terrainBytes[i] !== tiles[i]) terrainDiff++;
const roadPoints = unifiedRoads.reduce((n, r) => n + r.geometry.length, 0);

// 同一小地图核心派生（与 M1 同一算法/参数/种子）。
const roadMask = compiled.roadMask;
const geo = Uint8Array.from(geography);
const minimapDigests = {};
for (const size of Object.values(MINIMAP_SIZES)) {
  const { pixels } = renderMinimapPixels(geo, roadMask, W, H, size.w, size.h, 1);
  minimapDigests[`${size.w}x${size.h}`] = sha256(Buffer.from(pixels));
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "unified_mapsource.json"), JSON.stringify(source, null, 2) + "\n");
const report = {
  caseId: "M-02-unified-source",
  contractRevision: MINIMAP_STYLE_REVISION,
  layoutDiffVsMmapBin: layoutDiff,
  terrainRecompileDiff: terrainDiff,
  roadEdges: unifiedRoads.length,
  roadPoints,
  expectedRoadPoints: 5526,
  cities: placements.length,
  minimapDigests,
  gaps: [
    "G-MAP: multi-tile component grouping + arbitrary overlay recipes unverified",
    "G-ROAD: travelKind inferred; new-topology construction certificate pending (A-ROAD-1)",
    "G-INIT/G-SLOTS/G-CAP: unchanged; out of M2 scope",
  ],
};
writeFileSync(join(out, "migrate_report.json"), JSON.stringify(report, null, 2) + "\n");
tlog(JSON.stringify(report, null, 2));
if (layoutDiff !== 0 || terrainDiff !== 0 || roadPoints !== 5526 || placements.length !== 192) {
  throw new Error("M2 fidelity gate failed");
}
tlog("M2 unified source OK");
