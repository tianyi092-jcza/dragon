// 画像共用庫完整性（V2 簡化決策）：web/kao 即唯一來源；遊戲按档名取用
// （原生0..149保留；新增471張以150..620供portraitKey選擇，255不是資源哨兵）。
// 上傳時 key 原樣為 `kao/<filename>`，只增不改；SHA 存物件 metadata 供核對。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { KAO_MANIFEST } from "../web/kao/manifest.js";

const dir = fileURLToPath(new URL("../web/kao/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
assert.equal(files.length, 621, "library size");
const numeric = files.filter((f) => /^\d+\.png$/.test(f)).map((f) => Number(f.slice(0, -4))).sort((a, b) => a - b);
assert.deepEqual(numeric, Array.from({ length: 621 }, (_, i) => i), "shared resources 0..620 contiguous");
assert.equal(numeric.length, files.length, "numeric namespace only");
assert.deepEqual(KAO_MANIFEST.map(entry => entry.id), numeric.map(String), "manifest uses numeric order");
// Approved renumbering baseline: every old image retains its exact bytes and length.
const signature = createHash('sha256').update(KAO_MANIFEST.map(entry => `${entry.id}:${entry.sha256}:${entry.bytes}\n`).join('')).digest('hex');
assert.equal(signature, 'ea10c7c099196bbfdc5452d6841b09c58b030723010972184af66af12e7408ae', 'renumbered resource identity baseline');
let bytes = 0;
const seen = new Set();
for (const f of files) {
  const b = readFileSync(join(dir, f));
  assert.ok(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, "PNG magic " + f);
  assert.ok(b.length > 100, "non-trivial " + f);
  const sha = createHash("sha256").update(b).digest("hex");
  assert.ok(!seen.has(sha), "byte-distinct " + f);
  seen.add(sha);
  bytes += b.length;
}
process.stdout.write(`kao library: ${files.length} files (${numeric.length} numeric), ${(bytes / 1048576).toFixed(1)}MB, all PNG, byte-distinct\n`);
// manifest.js 與磁碟雙向一致（提交生成檔，防漂移）。
assert.equal(KAO_MANIFEST.length, files.length, "manifest size");
const diskByFile = new Map(files.map((f) => {
  const b = readFileSync(join(dir, f));
  return [f, { id: f.slice(0, -4), sha256: createHash("sha256").update(b).digest("hex"), bytes: b.length }];
}));
for (const entry of KAO_MANIFEST) {
  const disk = diskByFile.get(entry.file);
  assert.ok(disk, "manifest entry on disk " + entry.file);
  assert.deepEqual({ id: entry.id, sha256: entry.sha256, bytes: entry.bytes }, { id: disk.id, sha256: disk.sha256, bytes: disk.bytes }, "manifest entry " + entry.file);
}
process.stdout.write(`kao manifest: ${KAO_MANIFEST.length} entries match disk\n`);
