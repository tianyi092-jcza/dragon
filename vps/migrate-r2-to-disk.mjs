// 一次性遷移：Cloudflare R2 私有桶 → 本機磁碟桶（方案 B）。
// 逐鍵讀出、寫入磁碟、把 R2 的 Last-Modified 帶過去，最後逐鍵比對 sha256。
// 為什麼要保留 mtime：content_distribution_events 的收據存了 rootETag／visibleAt，
// 發布器恢復時會逐字比對，換了時間戳就會被判定 REMOTE_GAP 並封鎖帳本。
//
// 用法（在目標 VPS 上，憑證只從 env 取）：
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=dragon \
//   TARGET_BUCKET_ROOT=/srv/dragon/bucket node vps/migrate-r2-to-disk.mjs
import { createHash } from 'node:crypto';
import { r2client } from './r2client.mjs';
import { createDiskBucket } from './disk-bucket.mjs';
import { MAX_RESOURCE_BYTES } from '../reader/runtimecontract.js';

const required = name => {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error('missing env: ' + name);
  return value;
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const r2 = r2client({
  accountId: required('R2_ACCOUNT_ID'),
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  bucket: required('R2_BUCKET'),
});
const disk = createDiskBucket({ root: required('TARGET_BUCKET_ROOT') });

const keys = await r2.listAll('', 1000);
const report = { keys: keys.length, written: 0, skipped: 0, bytes: 0, mismatched: [], prefixes: {} };
// 可重跑：磁碟上已經有同一位元組的鍵就跳過（不重下），續傳不必從頭來。
// 進度逐條寫進 stdout，卡住時能直接看出停在哪個鍵。
for (const [index, key] of keys.entries()) {
  process.stdout.write(JSON.stringify({ at: index + 1, of: keys.length, key }) + String.fromCharCode(10));
  const present = disk.get(key);
  if (present !== null && process.env.MIGRATION_VERIFY !== '1') { report.skipped++; continue; }
  // 預算用埠自己宣告的上限（超過就會被 r2client 拒絕），不要另立一個數字。
  const object = await r2.get(key, { maxBytes: MAX_RESOURCE_BYTES });
  if (object === null) { report.mismatched.push({ key, reason: 'missing-on-r2' }); continue; }
  const bytes = Buffer.from(object.bytes);
  const existing = disk.get(key);
  if (existing === null) {
    disk.putImmutable(key, bytes, object.headers?.['content-type'] ?? 'application/octet-stream');
    report.written++; report.bytes += bytes.length;
  } else if (!Buffer.from(existing.bytes).equals(bytes)) {
    // 控制物件（control/*）在遷移期間可能被寫過：以 R2 為準覆寫，並記錄。
    disk.putControl(key, bytes, existing.headers.etag);
    report.written++; report.bytes += bytes.length;
  } else {
    report.skipped++;
  }
  const modified = object.headers?.['last-modified'];
  if (typeof modified === 'string') disk.setModified(key, modified);
  const check = disk.get(key);
  if (check === null || sha256(check.bytes) !== sha256(bytes)) report.mismatched.push({ key, reason: 'digest' });
  const top = key.split('/')[0];
  report.prefixes[top] = (report.prefixes[top] ?? 0) + 1;
}
process.stdout.write(JSON.stringify(report) + '\n');
if (report.mismatched.length > 0) process.exitCode = 1;
