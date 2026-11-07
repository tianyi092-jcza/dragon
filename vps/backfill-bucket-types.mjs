// 一次性修補：把已遷移物件的真實 content-type 寫進型別檔（`vps/disk-bucket.mjs` 的
// `.meta/<key>`）。為什麼需要：R2 上的型別是寫入時指定的，而程式歸檔會把
// `artifacts/programs/<digest>/files/battle_maps.json` 這種檔案存成
// application/octet-stream；只看副檔名會判成 application/json，讓
// vps/static-archive.mjs 的 stored() 逐字比對失敗（STATIC_ARCHIVE_INVALID）。
//
// 規則（不需要重下載位元組，也不需要 R2 憑證）：
//   artifacts/programs/<digest>/files/**  → application/octet-stream
//   其餘 *.json                          → application/json
//   其餘                                  → application/octet-stream
// 用法：node vps/backfill-bucket-types.mjs <桶根目錄>
import { createDiskBucket } from './disk-bucket.mjs';

const root = process.argv[2];
if (typeof root !== 'string' || root.length === 0) {
  process.stderr.write('usage: node vps/backfill-bucket-types.mjs <bucket-root>' + String.fromCharCode(10));
  process.exit(2);
}
const bucket = createDiskBucket({ root });
const keys = bucket.list('', 1_000_000);
const counts = { total: keys.length, programFiles: 0, json: 0, binary: 0 };
for (const key of keys) {
  let contentType = 'application/octet-stream';
  if (/^artifacts\/programs\/[a-f0-9]{64}\/files\//.test(key)) { counts.programFiles++; }
  else if (key.endsWith('.json')) { contentType = 'application/json'; counts.json++; }
  else { counts.binary++; }
  bucket.setContentType(key, contentType);
}
process.stdout.write(JSON.stringify({ result: 'BACKFILLED', ...counts }) + String.fromCharCode(10));
