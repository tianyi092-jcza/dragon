// Round-trip byte identity: compile(installed game-source.json) vs compile(copyBuiltinGame full)
// compiled outputs must be byte-identical; source divergence must stay confined to identity fields.
// Proves the editor copies without loss: an unmodified copy publishes exactly the original.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const BASE = "web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/";
const { compileGameSource } = await import("../web/src/content/authoring/trialcompile.js");
const { copyBuiltinGame } = await import("../web/src/content/authoring/gamesource.js");
const { readInstalledEditorSource } = await import("./editor_builtin_source.mjs");
function parsed(text) { try { return JSON.parse(text); } catch (cause) { throw new Error("owned round-trip baseline JSON", { cause }); } }
const installed = parsed(readFileSync(BASE + "game-source.json", "utf8"));
const manifest = parsed(readFileSync(BASE + "manifest.json", "utf8"));
const canon = (v) => JSON.stringify(v);
const d1 = compileGameSource(structuredClone(installed), sha);
const source = readInstalledEditorSource();
const copy = copyBuiltinGame({ gameId: "roundtrip-probe", ownerId: "u", kind: "full", source }, sha);
const d2 = compileGameSource(copy, sha);
const checks = [];
const eq = (name, a, b) => { assert.equal(sha(Buffer.from(a)), sha(Buffer.from(b)), name); checks.push(name); };
eq("terrain-bytes", Buffer.from(d1.terrainBytes), Buffer.from(d2.terrainBytes));
eq("road-graph", canon(d1.roadGraph), canon(d2.roadGraph));
eq("road-cost", Buffer.from(d1.roadCost), Buffer.from(d2.roadCost));
assert.equal(canon(d1.roadOffsetBytes ?? null), canon(d2.roadOffsetBytes ?? null), "road-offset");
checks.push("road-offset");
// sourceDigest 是身份绑定（gameId 命名空间），复制品注定不同；此处证确定性＋差异 confinement。
const copyAgain = copyBuiltinGame({ gameId: "roundtrip-probe", ownerId: "u", kind: "full", source }, sha);
assert.equal(compileGameSource(copyAgain, sha).sourceDigest, d2.sourceDigest, "copy-deterministic");
checks.push("copy-deterministic");
const divergent = [];
(function walk(a, b, p) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") { divergent.push(p || "<root>"); return; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k);
})(installed, copy, "");
const allowed = (p) => /^(gameId|localModel\.ownerId|metadata\.(name|introduction)|sourceRef\.(kind|revision|digest)|componentDefinitions\.deco-grass|compatibility\.atomicImport|chapterOrder\.\d+|chapters\.[^.]+(\.chapterId)?|compatibility\.idMap\.chapters\.[^.]+)$/.test(p);
// atomicImport 为无下游消费者的来源注脚（compile 不消费），复制路径不携带，属已知非内容差异。
const outside = divergent.filter((p) => !allowed(p));
assert.equal(outside.length, 0, `confinement breach: ${outside.slice(0, 3).join(", ")}`);
checks.push("divergence-confined");
assert.equal(d2.compatibilityAssetMode, manifest.compatibilityAssetMode, "compat-mode");
checks.push("compat-mode");
assert.equal(copy.chapterOrder.length, 20, "twenty-chapters");
checks.push("twenty-chapters");
process.stdout.write(`round-trip byte identity PASS ${checks.length} checks\n`);
