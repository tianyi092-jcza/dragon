import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// 离线自动小地图生成入口（显式 I/O，不读 SAVE/用户档案）。
// 用法：node tools/generate_minimap.mjs --out <隔离目录> [--seed 1] [--write-web]
// 默认只写隔离目录；--write-web 才写 web/grf/ui/minimap_auto*.png（受控接入步骤）。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";
import { createHash } from "node:crypto";
import {
  renderMinimapPixels,
  MINIMAP_STYLE_REVISION,
  MINIMAP_SIZES,
} from "../web/src/content/authoring/minimap.js";

const W = 384;
const H = 256;
const SEA_TILES = new Set([95, 191]);
const COAST_TILE = 202;

function parseArgs(argv) {
  const out = { out: null, seed: 1, writeWeb: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--seed") out.seed = Number(argv[++i]);
    else if (argv[i] === "--write-web") out.writeWeb = true;
  }
  if (!out.out) throw new Error("missing --out <dir>");
  if (!Number.isInteger(out.seed)) throw new Error("seed must be integer");
  return out;
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

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function pngBuffer(rgb, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(
      raw,
      y * (1 + w * 3) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const args = parseArgs(process.argv);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tiles = new Uint8Array(readFileSync(join(repoRoot, "web", "mmap_map.bin")));
const cost = new Uint8Array(
  readFileSync(join(repoRoot, "web", "content", "builtin", "world", "road-cost.bin")),
);
if (tiles.length !== W * H || cost.length !== W * H)
  throw new Error("unexpected 384x256 input size");
// 静态路网显示以 roads.json 有序点列为准（规则 roadCost 是移动代价，不是显示权威）。

const ocean = oceanMask(tiles);
// 显式地理（本次为推断标注，非原通行证据；M2 将由统一源显式 waterClass 取代）：
const geography = new Uint8Array(W * H); // 0 land, 1 sea, 2 river/lake
const roadMask = new Uint8Array(W * H);
let roadDoc;
try {
  roadDoc = JSON.parse(
    readFileSync(join(repoRoot, "web", "content", "builtin", "world", "roads.json"), "utf-8"),
  );
} catch (error) {
  throw new Error(`cannot read roads.json: ${error.message}`);
}
for (const edge of roadDoc.edges ?? []) {
  for (const pt of edge.points ?? []) {
    if (Number.isInteger(pt.x) && Number.isInteger(pt.y) && pt.x >= 0 && pt.x < W && pt.y >= 0 && pt.y < H) roadMask[pt.y * W + pt.x] = 1;
  }
}
for (let i = 0; i < W * H; i++) {
  const t = tiles[i];
  if (SEA_TILES.has(t)) geography[i] = ocean[i] ? 1 : 2;
  else if (t === COAST_TILE) geography[i] = 2;
}

mkdirSync(args.out, { recursive: true });
const artifacts = {};
for (const [name, size] of Object.entries(MINIMAP_SIZES)) {
  const { pixels, geoMask } = renderMinimapPixels(
    geography,
    roadMask,
    W,
    H,
    size.w,
    size.h,
    args.seed,
  );
  const png = pngBuffer(pixels, size.w, size.h);
  const pngPath = join(args.out, `minimap_auto_${name}_${args.seed}.png`);
  writeFileSync(pngPath, png);
  writeFileSync(
    join(args.out, `minimap_geo_${name}_${args.seed}.bin`),
    Buffer.from(geoMask),
  );
  artifacts[name] = { png: pngPath, sha256: sha256(png), size };
}
const meta = {
  caseId: "M-01-pure-generate",
  contractRevision: MINIMAP_STYLE_REVISION,
  seed: args.seed,
  sourceHashes: {
    mmap_map_bin: sha256(Buffer.from(tiles)),
    road_cost_bin: sha256(Buffer.from(cost)),
  },
  geographyNote:
    "inferred-sea-edge-connected river/lake fallback; NOT an authority classification (M2 explicit waterClass pending)",
  artifacts,
  coverageLimits:
    "original 384x256 only; no capacity change; visual style pending user acceptance",
};
writeFileSync(
  join(args.out, `minimap_meta_${args.seed}.json`),
  JSON.stringify(meta, null, 2) + "\n",
);
tlog(JSON.stringify(meta, null, 2));

if (args.writeWeb) {
  const webUi = join(repoRoot, "web", "grf", "ui");
  for (const size of Object.values(MINIMAP_SIZES)) {
    const { pixels } = renderMinimapPixels(geography, roadMask, W, H, size.w, size.h, args.seed);
    writeFileSync(
      join(webUi, `minimap_auto_${size.w}x${size.h}.png`),
      pngBuffer(pixels, size.w, size.h),
    );
  }
  writeFileSync(
    join(webUi, "minimap_auto.meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
  );
  tlog("wrote web auto minimap assets");
}
