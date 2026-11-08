// 一次性修補：把已遷移物件的真實 content-type 寫進型別檔（`vps/disk-bucket.mjs` 的
// `.meta/<key>`）。為什麼需要：R2 上的型別是寫入時指定的，而程式歸檔會把
// `artifacts/programs/<digest>/files/battle_maps.json` 這種檔案存成
// application/octet-stream；只看副檔名會判成 application/json，讓
// vps/static-archive.mjs 的 stored() 逐字比對失敗（STATIC_ARCHIVE_INVALID）。
//
// 規則（不需要重下載位元組，也不需要 R2 憑證）：
//   artifacts/programs/<digest>/files/**  → application/octet-stream
//   其餘                                  → 依副檔名的固定表（json/png/jpg/gif/webp/ico/mp3/flac/wav/mid），未知 → octet-stream
// 為什麼要按副檔名：`kao/*.png` 一律寫成 octet-stream 時，上架階段的 runtime-stage 回讀
// 會拿索引宣告的 image/png 逐字比對 → 直接 RUNTIME_STAGE（2026-11-10 實錘，621 張頭像）。
// 用法：node vps/backfill-bucket-types.mjs <桶根目錄>
import { createDiskBucket } from './disk-bucket.mjs';

const root = process.argv[2];
if (typeof root !== 'string' || root.length === 0) {
  process.stderr.write('usage: node vps/backfill-bucket-types.mjs <bucket-root>' + String.fromCharCode(10));
  process.exit(2);
}
const bucket = createDiskBucket({ root });
const keys = bucket.list('', 1_000_000);
const BY_EXT = Object.freeze({ json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', mid: 'audio/midi' });
const counts = { total: keys.length, programFiles: 0, json: 0, binary: 0 };
for (const key of keys) {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  let contentType = 'application/octet-stream';
  if (/^artifacts\/programs\/[a-f0-9]{64}\/files\//.test(key)) { counts.programFiles++; }
  else if (Object.hasOwn(BY_EXT, extension)) { contentType = BY_EXT[extension]; if (extension === 'json') counts.json++; else counts.binary++; }
  else { counts.binary++; }
  bucket.setContentType(key, contentType);
}
process.stdout.write(JSON.stringify({ result: 'BACKFILLED', ...counts }) + String.fromCharCode(10));
