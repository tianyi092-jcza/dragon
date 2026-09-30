import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-MAP-1: 256-tile component inventory with rule scopes, four-season
// palette/edit analysis, and full-map stamp proof against the 98304 rule
// bytes. Evidence: admission §2 (982F table, node/wiring/corner ranges),
// M0 baseline (238 used tiles). Pure node (hand-rolled PNG reader, no deps).
// Inputs read-only: web/mmap_map.bin, web/map_atlas_*.png,
// web/map_tiles_*.png. Unknowns (component grouping, hidden underlays,
// corner semantics beyond counts) are listed, not asserted.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const WEB = new URL("../web/", import.meta.url);

// ---- Minimal PNG reader (8-bit, non-interlaced, types 0/2/3/4/6). ----
function readPNG(path) {
  const b = readFileSync(path);
  assert.deepEqual(b.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${path} magic`);
  let pos = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  let plte = null;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      plte = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  assert.equal(bitDepth, 8, `${path} bit depth`);
  assert.equal(interlace, 0, `${path} non-interlaced`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  assert.ok(channels, `${path} color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const out = px.subarray(y * stride, (y + 1) * stride);
    const a = (i) => (i >= channels ? out[i - channels] : 0);
    const bb = (i) => (y > 0 ? px[(y - 1) * stride + i] : 0);
    for (let i = 0; i < stride; i++) {
      const f = row[i];
      let v;
      if (filter === 0) v = f;
      else if (filter === 1) v = f + a(i);
      else if (filter === 2) v = f + bb(i);
      else if (filter === 3) v = f + ((a(i) + bb(i)) >> 1);
      else if (filter === 4) {
        const pa = a(i);
        const pb = bb(i);
        const pc = y > 0 && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
        const pp = pa + pb - pc;
        const dpa = Math.abs(pp - pa);
        const dpb = Math.abs(pp - pb);
        const dpc = Math.abs(pp - pc);
        let pr;
        if (dpa <= dpb && dpa <= dpc) pr = pa;
        else if (dpb <= dpc) pr = pb;
        else pr = pc;
        v = f + pr;
      } else throw new Error(`${path} bad filter ${filter}`);
      out[i] = v & 255;
    }
  }
  return { width, height, colorType, channels, px, plte };
}

// ---- Part 1: tile inventory from the 98304 rule bytes. ----
const ruleBytes = readFileSync(new URL("mmap_map.bin", WEB));
assert.equal(ruleBytes.length, 384 * 256, "rule plane size");
const counts = Array.from({ length: 256 }, () => 0);
for (const v of ruleBytes) counts[v]++;
const used = counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
tlog(`tiles used: ${used.length} of 256`);
assert.equal(used.length, 238, "M0 baseline: 238 used tiles");
const unused = counts.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
tlog(`unused tiles (18): ${unused.map((i) => i.toString(16).padStart(2, "0")).join(" ")}`);

// 982F rule-scope classifier (admission §2.2; wildness classification codes,
// not editor terrain categories).
function ruleCode(v) {
  if (v >= 0xb8 && v <= 0xb9) return 1;
  if (v >= 0xba && v <= 0xbf) return 2;
  if ((v >= 0x70 && v <= 0xa7) || (v >= 0xa9 && v <= 0xaf)) return 3;
  if (v === 0x06 || v === 0x1d || v === 0xb0 || v === 0xb6 || v === 0xb7) return 4;
  if (v >= 0xb1 && v <= 0xb3) return 5;
  if ((v >= 0x0e && v <= 0x0f) || (v >= 0x1e && v <= 0x6f)) return 6;
  if (v === 0xa8) return 7;
  if (v === 0xca) return 8;
  if (v >= 0xc0 && v <= 0xc3) return 9;
  return 0;
}
const byCode = new Map();
let nodeCells = 0;
let wireCells = 0;
let cornerCells = 0;
for (let t = 0; t < 256; t++) {
  if (!counts[t]) continue;
  const code = ruleCode(t);
  if (!byCode.has(code)) byCode.set(code, { tiles: 0, cells: 0 });
  byCode.get(code).tiles++;
  byCode.get(code).cells += counts[t];
  if (t >= 0xcb && t <= 0xd3) nodeCells += counts[t];
  if (t >= 0xb8 && t <= 0xdd) wireCells += counts[t];
  if (t >= 0xde && t <= 0xf1) cornerCells += counts[t];
}
tlog("rule-code scope (code: tiles / cells):");
for (const [code, s] of [...byCode.entries()].sort((a, b) => a[0] - b[0])) {
  tlog(`  code ${code}: ${s.tiles} tiles / ${s.cells} cells`);
}
tlog(`node-range CB..D3 cells: ${nodeCells}; wiring B8..DD cells: ${wireCells}; corner DE..F1 cells: ${cornerCells}`);
// Center codes consumed by the battle-directory branch (4BC7..4BCE).
const centerTiles = used.filter((t) => ruleCode(t) >= 1 && ruleCode(t) <= 9);
tlog(`battle-classified center tiles (codes 1..9): ${centerTiles.length}`);

// ---- Parts 2-4: seasonal atlases vs full-map stamps. ----
const seasons = ["spring", "summer", "autumn", "winter"];
const atlases = {};
for (const s of seasons) {
  const a = readPNG(new URL(`map_atlas_${s}.png`, WEB));
  assert.equal(a.width, 256);
  assert.equal(a.height, 256);
  assert.equal(a.colorType, 3, `${s} atlas must be paletted`);
  atlases[s] = a;
  tlog(`atlas ${s}: 256x256 paletted, PLTE ${a.plte.length / 3} entries`);
}
// Palette-swap check: per-tile index patterns identical across seasons?
function tilePattern(a, t) {
  const tx = (t % 16) * 16;
  const ty = Math.floor(t / 16) * 16;
  const out = Buffer.alloc(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) out[y * 16 + x] = a.px[(ty + y) * 256 + tx + x];
  }
  return out;
}
let editedTiles = 0;
for (const t of used) {
  const base = tilePattern(atlases.spring, t);
  for (const s of ["summer", "autumn", "winter"]) {
    if (!tilePattern(atlases[s], t).equals(base)) {
      editedTiles++;
      break;
    }
  }
}
tlog(`tiles with cross-season index edits: ${editedTiles} of ${used.length}`);
const plteSame = ["summer", "autumn", "winter"].map(
  (s) => atlases[s].plte.equals(atlases.spring.plte),
);
tlog(`PLTE identical to spring: ${plteSame.join("/")}`);
if (editedTiles === 0 && plteSame.every(Boolean)) {
  tlog("season atlases: byte-identical files (pure shared tileset)");
} else if (editedTiles === 0) {
  tlog("season atlases: identical index patterns, palette-only variants (no edited pixels)");
} else {
  tlog("season atlases: some tiles re-rendered per season (listed scope only)");
}
// Full-map stamp proof: map_tiles_{season} must equal atlas tiles stamped
// by the rule bytes, cell by cell (visual is a pure function of rule bytes).
for (const s of seasons) {
  const full = readPNG(new URL(`map_tiles_${s}.png`, WEB));
  assert.equal(full.width, 384 * 16);
  assert.equal(full.height, 256 * 16);
  const atlas = atlases[s].px;
  let checked = 0;
  for (let cy = 0; cy < 256; cy++) {
    for (let cx = 0; cx < 384; cx++) {
      const t = ruleBytes[cy * 384 + cx];
      const tx = (t % 16) * 16;
      const ty = Math.floor(t / 16) * 16;
      for (let y = 0; y < 16; y++) {
        const fRow = (cy * 16 + y) * 6144 + cx * 16;
        const aRow = (ty + y) * 256 + tx;
        for (let x = 0; x < 16; x++) {
          assert.equal(
            full.px[fRow + x],
            atlas[aRow + x],
            `${s} cell (${cx},${cy}) tile ${t.toString(16)} pixel (${x},${y})`,
          );
          checked++;
        }
      }
    }
  }
  tlog(`stamp proof ${s}: ${checked} pixels all equal atlas[ruleByte]`);
}

tlog("UNKNOWN (not closed by this inventory): multi-tile component grouping;");
tlog("UNKNOWN: hidden underlays beneath composed MDL pixels;");
tlog("UNKNOWN: corner DE..F1 semantics beyond center/corner counts;");
tlog("UNKNOWN: author free-stacking rule combinations and display write-back chain.");
tlog("A-MAP-1: inventory + season对照 + stamp proof OK");
