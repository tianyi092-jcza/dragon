import { DatabaseSync } from "node:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { composeMapLayers } from "../web/src/content/authoring/maplayers.js";
import { renderMinimapPixels, MINIMAP_STYLE_REVISION } from "../web/src/content/authoring/minimap.js";

const GAME = "8c05e6a0-f9ed-4be2-b25a-dd6c57ac4bce";
const DB = "E:/Dragon/web-port/.dragon-analysis/basemaps-dev-store/editor.sqlite";
const OUT = "C:/Users/fczll/AppData/Local/Temp/wolong-geo-backfill";
const SEA = new Set([95, 191]);
const COAST = 202;

const db = new DatabaseSync(DB, { readOnly: true });
const row = db.prepare("SELECT data_json, copy_digest FROM game_copies WHERE game_id=?").get(GAME);
db.close();
const src = JSON.parse(row.data_json);
const { bounds, base } = src.map;
const W = bounds.width, H = bounds.height;
console.log("bounds", JSON.stringify(bounds), "policy", base.policy, "style", MINIMAP_STYLE_REVISION);

// 1) compose current source -> composed terrain (all stamps applied)
const cur = composeMapLayers(src, { draft: false });
console.log("current compose ok; diagnostics:", cur.diagnostics.length);

// 2) inferred-sea-edge-connected on COMPOSED terrain (same rule as migrate precedent)
function oceanMask(tiles) {
  const ocean = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => { const i = y * W + x; if (!ocean[i] && SEA.has(tiles[i])) { ocean[i] = 1; stack.push([x, y]); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x > 0) push(x - 1, y);
    if (x + 1 < W) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < H) push(x, y + 1);
  }
  return ocean;
}
const ocean = oceanMask(cur.terrain);
const inferred = new Array(W * H);
for (let i = 0; i < W * H; i++) {
  const t = cur.terrain[i];
  inferred[i] = SEA.has(t) ? (ocean[i] ? 1 : 2) : (t === COAST ? 2 : 0);
}
const cnt = [0, 0, 0, 0];
for (const v of inferred) cnt[v]++;
console.log("inferred geography histogram (0陆/1海/2河/3湖):", JSON.stringify(cnt));

// 3) water group gate pre-check (compose fails INVALID_WATER_GROUP_BASE if base cell == 0)
let violations = 0;
for (const g of src.map.waterGroups ?? []) {
  const bad = (g.baseCells ?? []).filter((c) => inferred[c] === 0);
  if (bad.length) { violations++; console.log(`GROUP VIOLATION ${g.id}: ${bad.length} baseCells inferred land, e.g.`, bad.slice(0, 8)); }
}
console.log(violations ? `VIOLATIONS=${violations} STOP` : "water groups: all baseCells nonzero, gate passes");
if (violations) process.exit(2);

// 4) patch (ISOLATED copy): policy removed (sea-ground invariant demands all-1) + geography + provenance
const patched = JSON.parse(row.data_json);
patched.map.base = { ...patched.map.base, geography: inferred, geographyProvenance: "inferred-sea-edge-connected from composed terrain; copy backfill 2026-11-24 (was sea-ground-1 all-sea default)" };
delete patched.map.base.policy;
const next = composeMapLayers(patched, { draft: false });
console.log("patched compose ok; diagnostics:", next.diagnostics.length);

// 5) render both minimaps, compare navy fraction
const roadNone = new Uint8Array(W * H);
const oldPx = renderMinimapPixels(cur.minimapGeography, roadNone, W, H, 250, 167).pixels;
const newPx = renderMinimapPixels(next.minimapGeography, roadNone, W, H, 250, 167).pixels;
function frac(pixels, pred) {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 3) if (pred([pixels[i], pixels[i + 1], pixels[i + 2]])) n++;
  return n / (pixels.length / 3);
}
const navy = ([r, g, b]) => r === 0 && g === 30 && b === 90;
console.log("old navy:", frac(oldPx, navy).toFixed(3), " new navy:", frac(newPx, navy).toFixed(3));

// 6) isolated output
mkdirSync(OUT, { recursive: true });
const text = JSON.stringify(patched);
writeFileSync(`${OUT}/patched-game-source.json`, text);
writeFileSync(`${OUT}/old-minimap-250x167.raw`, Buffer.from(oldPx));
writeFileSync(`${OUT}/new-minimap-250x167.raw`, Buffer.from(newPx));
console.log("sha(old)=", row.copy_digest, "\nsha(new)=", createHash("sha256").update(text).digest("hex"));
console.log("wrote", OUT);
