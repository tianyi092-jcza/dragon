// Offline handoff of existing review images, not a new render or approval UI.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const evidence = join(root, ".dragon-analysis/map-migration-2");
const output = join(evidence, round);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = {};
function read(path) {
  const bytes = readFileSync(join(root, path));
  sourceHashes[path] = sha(bytes);
  return bytes;
}
function json(path) {
  try { return JSON.parse(read(path).toString("utf8")); }
  catch (cause) { throw new Error(`invalid fixed review input: ${path}`, { cause }); }
}
const proposal = json("docs/data/original-map-water-display-proposal.json");
assert.equal(proposal.status, "PROPOSED_NOT_APPROVED");
assert.equal(proposal.regions.length, 14);
assert.equal(proposal.waterRoadIds.length, 35);
const review = json(".dragon-analysis/map-migration-2/explicit-water-review-r3/receipt.json");
const app = json(".dragon-analysis/map-migration-2/portable-stage-App-r2/receipt.json");
assert.equal(app.result, "PASS-SCOPED-REVIEW-REQUIRED");
assert.deepEqual(app.errors, []); assert.deepEqual(app.forbidden, []);
const images = [
  ["explicit-water-review-r3", "minimap-comparison.png", "新旧小地图及分类图"],
  ["explicit-water-review-r3", "region-review.png", "原始坐标与候选水域分区"],
  ["explicit-water-review-r3", "region-legend.png", "分区标号图例"],
  ["explicit-water-review-r3", "road-types.png", "35水路／219陆路显示候选"],
  ["portable-stage-App-r2", "normal.png", "普通布局 1024×768"],
  ["portable-stage-App-r2", "large.png", "放大布局 1280×768"],
  ["portable-stage-App-r2", "fallback.png", "短视口回退 640×400"],
];
const blocks = images.map(([folder, name, caption]) => {
  const bytes = read(`.dragon-analysis/map-migration-2/${folder}/${name}`);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  if (folder === "explicit-water-review-r3") {
    const recorded = review.artifactPaths.find((entry) => entry.path === name);
    assert.ok(recorded); assert.equal(sha(bytes), recorded.sha256);
  } else {
    // App receipt records viewport geometry, not output PNG hashes. Pin the
    // current existing screenshot bytes here without claiming a missing hash.
    assert.ok(app.artifactPaths.includes(name));
    const layout = app.layouts.find((entry) => entry.id === name.replace(".png", ""));
    assert.ok(layout); assert.equal(bytes.readUInt32BE(16), layout.width); assert.equal(bytes.readUInt32BE(20), layout.height);
  }
  return `<section><h2>${caption}</h2><img alt="${caption}" src="data:image/png;base64,${bytes.toString("base64")}"></section>`;
});
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>地图迁移候选：待用户审核</title><style>body{font:17px/1.6 sans-serif;margin:24px;background:#faf7ed;color:#22301f}main{max-width:1400px;margin:auto}.pending{background:#ffedbd;padding:16px;border:2px solid #9d7020}section{margin:32px 0}img{max-width:100%;height:auto;border:1px solid #66705b}h2{font-size:22px}li{margin:8px 0}</style><main><h1>地图迁移候选：未批准、未安装</h1><p class="pending">这是既有图片的离线审核汇总。没有脚本、网络、表单或自动批准；打开页面不代表验收通过。海／河／湖及水陆道路标签是Web显示作者资料，不是DOS通行机制。</p><h2>请分别反馈两个门</h2><ol><li>类别资料：原图块集合、海／河口边界、13湖区和35水路选择是否认可？请按图上标号指出修改项。</li><li>M-06外观：道路／水系是否可辨、纹理色调是否合适，普通／放大／回退的外框、势力名牌、军师八项菜单是否清楚且无遮挡？</li></ol><p>回复可写“类别认可／修改……；视觉认可／修改……”。类别和视觉分别记录；正式采纳及受影响接缝验证尚未完成。</p>${blocks.join("\n")}<p>图片来源：explicit-water-review-r3 与 portable-stage-App-r2。详情维护于 docs/map-water-display-review.md；本页不改源数据、不重新生成图片、不替代规则或存档证明。</p></main></html>`;
mkdirSync(output);
writeFileSync(join(output, "review.html"), html);
const saved = readFileSync(join(output, "review.html"), "utf8");
assert.equal(saved, html); assert.ok(!/<script\b|<form\b|\son\w+=/i.test(saved));
const embedded = [...saved.matchAll(/src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)];
assert.equal(embedded.length, images.length);
for (let i = 0; i < images.length; i++) {
  const [folder, name] = images[i];
  assert.equal(sha(Buffer.from(embedded[i][1], "base64")), sourceHashes[`.dragon-analysis/map-migration-2/${folder}/${name}`]);
}
for (const [path, hash] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(join(root, path))), hash);
const receipt = { caseId: "M-06-offline-review-handoff", contractRevision: "review-material-only-1", sourceHashes,
  toolHashes: { "tools/package_map_review.mjs": sha(readFileSync(fileURLToPath(import.meta.url))) }, toolVersion: process.version,
  fixtureId: app.fixtureId, expectedSource: "existing unapproved literal author data and existing screenshots, no new render",
  result: "PACKAGED-REVIEW-REQUIRED", artifactPaths: [{ path: "review.html", sha256: sha(Buffer.from(saved)) }],
  coverageLimits: "Packaging only, not human approval or current-game adoption. Four review PNGs match recorded output hashes; three App PNGs are pinned at packaging time and geometry checked because their original receipt has no screenshot output hashes. No native/full-suite/browser retest." };
writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify({ result: receipt.result, images: images.length, htmlSha256: receipt.artifactPaths[0].sha256 }) + "\n");
