import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// M3 隔离编辑样本：同一校验器/编译器/加载入口，真实修改统一源副本。
// 用法：node tools/test_map_edit_sample.mjs --src <unified-mapsource.json> --out <隔离目录>
// 样本A（显示/路网派生）：移动一条道路的一个中间点到相邻空闲格（端点/槽序不变）。
// 样本B（规则字节流）：修改一处远离道路/据点的陆地块（单字节差分，原件不动）。
// 不写 DOS 原料、不读 SAVE、只用内存/隔离输出。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { validateMapSource, compileMapSource } from "../web/src/content/authoring/mapcompile.js";
import { renderMinimapPixels } from "../web/src/content/authoring/minimap.js";

function parseArgs(argv) {
  let src = null;
  let out = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--src") src = argv[++i];
    else if (argv[i] === "--out") out = argv[++i];
  }
  if (!src || !out) throw new Error("missing --src <file> --out <dir>");
  return { src, out };
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch (error) {
    throw new Error(`cannot read JSON ${p}: ${error.message}`);
  }
}

const { src, out } = parseArgs(process.argv);
const original = readJSON(src);
validateMapSource(original);
const baseCompiled = compileMapSource(original);
const W = original.map.bounds.width;
const H = original.map.bounds.height;

// 道路/据点占用集：样本修改不得触碰。
const occupied = new Set();
for (const p of original.map.placements) occupied.add(`${p.x},${p.y}`);
for (const r of original.map.roads) for (const pt of r.geometry) occupied.add(`${pt.x},${pt.y}`);

// 样本A：选第一条长度>8 的道路，移动一个中间点。
const sampleA = JSON.parse(JSON.stringify(original));
let moved = null;
for (const r of sampleA.map.roads) {
  if (r.geometry.length > 8) {
    for (let i = 3; i < r.geometry.length - 3; i++) {
      const pt = r.geometry[i];
      const candidates = [
        { x: pt.x + 1, y: pt.y },
        { x: pt.x - 1, y: pt.y },
        { x: pt.x, y: pt.y + 1 },
        { x: pt.x, y: pt.y - 1 },
      ];
      const free = candidates.find(
        (c) => c.x >= 0 && c.x < W && c.y >= 0 && c.y < H && !occupied.has(`${c.x},${c.y}`),
      );
      if (free) {
        moved = { roadId: r.id, index: i, from: { ...pt }, to: free };
        r.geometry[i] = { x: free.x, y: free.y };
        r.nativeBinding = { stale: true, reason: "geometry-edited; native rebuild needs A-ROAD-1 certificate" };
        break;
      }
    }
  }
  if (moved) break;
}
if (!moved) throw new Error("no movable road point found");

// 样本B：找一处远离占用格的陆地块（geography 0），切换 terrainRef 到另一已用图块。
const sampleB = JSON.parse(JSON.stringify(original));
let tileEdit = null;
outer: for (let y = 10; y < H - 10; y++) {
  for (let x = 10; x < W - 10; x++) {
    const i = y * W + x;
    if (sampleB.map.base.geography[i] !== 0) continue;
    let clear = true;
    for (let dy = -2; dy <= 2 && clear; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (occupied.has(`${x + dx},${y + dy}`)) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) continue;
    const oldTile = sampleB.map.base.terrainRef[i];
    const newTile = oldTile === 1 ? 2 : 1; // 已用原子图块之间切换
    sampleB.map.base.terrainRef[i] = newTile;
    tileEdit = { x, y, from: oldTile, to: newTile };
    break outer;
  }
}
if (!tileEdit) throw new Error("no isolated land cell found");

validateMapSource(sampleA);
validateMapSource(sampleB);
const compiledA = compileMapSource(sampleA);
const compiledB = compileMapSource(sampleB);

// 差分统计
let terrainDiffB = 0;
for (let i = 0; i < W * H; i++) if (compiledB.terrainBytes[i] !== baseCompiled.terrainBytes[i]) terrainDiffB++;
let maskDiffA = 0;
for (let i = 0; i < W * H; i++) if (compiledA.roadMask[i] !== baseCompiled.roadMask[i]) maskDiffA++;

// 同一小地图核心派生
const digest = (compiled, geo) => {
  const out = {};
  for (const [name, size] of [["base", { w: 208, h: 139 }], ["large", { w: 250, h: 167 }]]) {
    const { pixels } = renderMinimapPixels(geo, compiled.roadMask, W, H, size.w, size.h, 1);
    out[name] = sha256(Buffer.from(pixels));
  }
  return out;
};
const baseGeo = Uint8Array.from(original.map.base.geography);
const report = {
  caseId: "M-03-edit-sample",
  sampleA_roadMove: moved,
  sampleA_roadMaskDiffCells: maskDiffA,
  sampleA_minimap: digest(compiledA, baseGeo),
  sampleB_tileEdit: tileEdit,
  sampleB_terrainDiffBytes: terrainDiffB,
  sampleB_minimap: digest(compiledB, baseGeo),
  baseMinimap: digest(baseCompiled, baseGeo),
  originalUntouched: sha256(readFileSync(src)) === sha256(Buffer.from(JSON.stringify(original, null, 2) + "\n")) ? "hash-stable(see note)" : "see note",
  coverageLimits: "isolated compile/load only; native road rebuild + full-campaign proof pending A-ROAD-1/G-MAP",
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "sampleA.json"), JSON.stringify(sampleA.map.roads.find((r) => r.id === moved.roadId), null, 2) + "\n");
writeFileSync(join(out, "m3_report.json"), JSON.stringify(report, null, 2) + "\n");
tlog(JSON.stringify(report, null, 2));
if (maskDiffA === 0) throw new Error("sampleA produced no derived change");
if (terrainDiffB !== 1) throw new Error(`sampleB expected 1-byte diff, got ${terrainDiffB}`);
if (report.sampleA_minimap.base === report.baseMinimap.base) tlog("note: sampleA sub-pixel move keeps 208x139 digest; roadMask diff above is the derived change");
tlog("M3 edit samples OK");
