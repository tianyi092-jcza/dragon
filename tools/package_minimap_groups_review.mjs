// Read only fixed owned evidence + installed assets; never installs, fetches,
// opens profiles/DOS, or signs human visual approval. New output directory only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)), base = ".dragon-analysis/map-migration-2/";
const sha = (b) => createHash("sha256").update(b).digest("hex"), sourceHashes = {};
function read(p) { const b = readFileSync(join(root, p)); sourceHashes[p] = sha(b); return b; }
function json(p) { try { return JSON.parse(read(p).toString()); } catch (cause) { throw new Error("invalid owned review JSON", { cause }); } }
const stage = base + "explicit-stage-r9/";
const report = json(stage + "stage-report.json"), manifest = json(stage + "package/manifest.json");
const assembly = json(base + "session-evidence/minimap-groups-repro-r4.json");
assert.equal(assembly.fixtureId, report.revision); assert.equal(assembly.checks.length, 20);
assert.equal(assembly.result, "PASS-SCOPED-REVIEW-REQUIRED"); assert.equal(assembly.combinationSwitches.nativeAndFullGeographyUnchanged, true);
const app = json(base + "minimap-groups-App-r3/receipt.json"); assert.equal(app.fixtureId, report.revision);
assert.deepEqual(app.errors, []); assert.deepEqual(app.forbidden, []);
assert.match(report.revision, /^map-2-[a-f0-9]{64}$/);
const historic = json(base + "machine-suite-r1/receipt.json");
const current = "web/content/builtin/compiled/map-2-19e2b03991ee4cf77c58ba44ef14313f213f93dbe8984407ff16392cb7748797/";
assert.equal(Object.keys(historic.resourceHashes).length, 39);
for (const [p, hash] of Object.entries(historic.resourceHashes)) {
  assert.match(p, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
  assert.equal(sha(read(current + p)), hash, "installed resource drift");
}
assert.equal(sha(read("web/src/content/builtinresources.generated.js")), historic.sourceHashes["web/src/content/builtinresources.generated.js"]);
const changedFromHistoric65 = Object.entries(historic.sourceHashes).filter(([p, hash]) => sha(read(p)) !== hash).map(([p]) => p);
const imageHashes = {};
function img(p, w) {
  const bytes = read(p); assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  if (p.startsWith(stage + "package/")) {
    const asset = manifest.assets.find((a) => a.path === p.split("/").at(-1));
    assert.ok(asset); assert.equal(sha(bytes), asset.sha256); assert.equal(sha(bytes), assembly.sourceHashes[p]);
  }
  imageHashes[p] = sha(bytes);
  return `<img width="${w}" src="data:image/png;base64,${bytes.toString("base64")}">`;
}
const comparisons = [["base", 208], ["large", 250]].map(([name, width]) => `<h2>${width}像素純底圖：此前候選 ／ 新候選</h2><div class="pair"><figure>${img(base + "explicit-stage-r1/package/minimap_" + name + ".png", width)}<figcaption>此前：全部細水系，綠水／褐路</figcaption></figure><figure>${img(stage + "package/minimap_" + name + ".png", width)}<figcaption>新：組合顯隱、共用線色、區域漸變／點陣</figcaption></figure></div>`).join("");
const shots = ["normal", "large", "fallback"].map((name) => `<h2>實際App：${name}</h2>${img(base + "minimap-groups-App-r3/" + name + ".png", name === "fallback" ? 640 : 960)}`).join("");
const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>小地圖組合開關與新風格候選</title><style>body{font:16px sans-serif;background:#eee;color:#222;padding:24px}img{image-rendering:pixelated;max-width:100%;height:auto}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}p{max-width:1000px}</style><h1>新小地圖候選，尚未安裝</h1><p>水域類別已依本輪使用者意見記錄認可；主河帶、組合邊界與新視覺仍待複審。組合開關已接資料／共用編譯／生成，完整編輯器操作UI不在本批範圍。</p><p>每個實際組合各自控制，不是素材全局開關；N02等審核分區不是組合，同一分區不相連水片也獨立。候選${report.minimapGroups.total}組中顯示${report.minimapGroups.visible}組；主要河流帶是Web作者候選，不聲稱原版河流物件名稱或演算法。道路不隨水域關閉。</p><p>四原生資源、完整地理與20章保持；本輪20章fresh/JSON、全部組合關閉負控、App三布局通過。舊36門仍只是舊版本證據，沒有拼接為新全套認證。沒有安裝、提交、推送、真實SAVE/profile或人工代簽。</p>${comparisons}${shots}<p>請看主要水系取捨、共用線色是否清楚、區域漸變和點陣是否接近你要的風格。新候選修訂：${report.revision}</p></html>`;
assert.ok(!/<script|<form|(?:src|href)=["']https?:/i.test(html));
const output = join(root, base, "minimap-groups-review-r2"); mkdirSync(output);
writeFileSync(join(output, "review.html"), html);
writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-06-minimap-combinations-review-material", result: "PACKAGED-NOT-APPROVED", fixtureId: report.revision,
  sourceHashes, toolHashes: { "tools/package_minimap_groups_review.mjs": sha(readFileSync(fileURLToPath(import.meta.url))) }, imageHashes,
  changedFromHistoric65, installed39AndSwitchUnchanged: true, artifactPaths: ["review.html"], htmlSha256: sha(Buffer.from(html)),
  coverageLimits: "No visual acceptance or installation; newly pinned screenshot hashes, not claimed present in earlier App receipt" }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: "PACKAGED-NOT-APPROVED", revision: report.revision, groups: report.minimapGroups }) + "\n");
